/* Paired click-to-map benchmark for a published baseline and candidate. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { gzipSync } = require('node:zlib');
const { chromium } = require('playwright');

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const roots = ['--before', '--after'].map(name => path.resolve(option(name, '')));
const localRoots = [option('--before-file', roots[0]), option('--after-file', roots[1])].map(root => path.resolve(root));
const runs = Number(option('--runs', 20));
assert.ok(process.argv.includes('--before') && process.argv.includes('--after') && Number.isInteger(runs) && runs > 0);
const mapAsset = JSON.parse(fs.readFileSync(path.join(roots[1], 'site_manifest.json'), 'utf8')).region_map;
assert.ok(mapAsset, 'The candidate manifest must declare the shared map asset.');
const topics = ['chiffres', 'emploi', 'entreprises'];
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp' };
const bodies = new Map();
const server = http.createServer((request, response) => {
  const match = /^\/(0|1)\/(.+)$/.exec(decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!match) return response.writeHead(404).end();
  const root = roots[Number(match[1])];
  const filename = path.resolve(root, match[2]);
  if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
    return response.writeHead(404).end();
  }
  if (!bodies.has(filename)) {
    const extension = path.extname(filename);
    const compress = ['.html', '.css', '.js', '.svg'].includes(extension);
    const source = fs.readFileSync(filename);
    const body = compress ? gzipSync(source, { level: 5 }) : source;
    const headers = { 'Content-Type': types[extension] || 'application/octet-stream',
      'Content-Length': body.length, 'Cache-Control': 'public, max-age=600' };
    if (compress) headers['Content-Encoding'] = 'gzip';
    bodies.set(filename, { body, headers });
  }
  const { body, headers } = bodies.get(filename);
  response.writeHead(200, headers).end(body);
});

async function observe(browser, variant, topic, scenario) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
    if (scenario !== 'zip') {
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40,
        downloadThroughput: 1250000, uploadThroughput: 1250000 });
    }
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      if (location.pathname.endsWith('/index.html')) {
        let lcp = 0;
        new PerformanceObserver(list => { lcp = list.getEntries().at(-1)?.startTime || lcp; })
          .observe({ type: 'largest-contentful-paint', buffered: true });
        document.addEventListener('click', event => {
          if (event.target.closest('a.reading-link.details')) {
            console.debug('BARO_CLICK ' + JSON.stringify([performance.timeOrigin + performance.now(), lcp]));
          }
        }, { capture: true });
      } else {
        const observer = new MutationObserver(() => {
          if (document.querySelectorAll('#landingMap .mainland-layer .path-region[d]').length !== 13) return;
          observer.disconnect();
          requestAnimationFrame(() => requestAnimationFrame(() => {
            console.debug('BARO_MAP ' + JSON.stringify([performance.timeOrigin + performance.now(), performance.now()]));
          }));
        });
        observer.observe(document, { childList: true, subtree: true });
      }
    });
    const base = scenario === 'zip' ? pathToFileURL(localRoots[variant] + path.sep).href
      : `http://127.0.0.1:${server.address().port}/${variant}/`;
    const getEvent = (prefix) => page.waitForEvent('console', { predicate: m => m.text().startsWith(prefix) })
      .then(m => JSON.parse(m.text().slice(prefix.length)));
    const detail = `barometre_${topic}.html`;
    if (scenario === 'direct-http') {
      const [[, map]] = await Promise.all([getEvent('BARO_MAP '), page.goto(base + detail, { waitUntil: 'commit' })]);
      assert.deepEqual(errors, []);
      return { map };
    }
    await page.goto(base + 'index.html', { waitUntil: scenario === 'warm-http' ? 'load' : 'domcontentloaded' });
    if (scenario === 'warm-http') {
      // Give both builds the same homepage dwell time before clicking.
      await page.waitForTimeout(650);
      if (variant === 1) {
        const warmed = await page.evaluate(names => names.every(name => performance.getEntriesByName(new URL(name, location.href).href)
          .some(entry => entry.responseEnd > 0)), [mapAsset, 'assets/vendor/d3.min.js']);
        assert.ok(warmed, 'The candidate did not complete the shared prefetch during homepage dwell time.');
      }
    }
    const [[clicked, lcp], [painted]] = await Promise.all([
      getEvent('BARO_CLICK '), getEvent('BARO_MAP '),
      page.locator(`a[href="${detail}"]`).evaluate(link => link.click()),
    ]);
    assert.deepEqual(errors, []);
    return { map: painted - clicked, lcp };
  } finally {
    await context.close();
  }
}

function percentile(samples, fraction) {
  const ordered = [...samples].sort((a, b) => a - b);
  if (fraction === .5 && ordered.length % 2 === 0) {
    const midpoint = ordered.length / 2;
    return (ordered[midpoint - 1] + ordered[midpoint]) / 2;
  }
  return ordered[Math.ceil(ordered.length * fraction) - 1];
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: option('--channel', process.platform === 'win32' ? 'msedge' : undefined) });
  const results = [];
  try {
    const scenarios = option('--scenarios', 'zip,warm-http,immediate-http,direct-http').split(',');
    for (const scenario of scenarios) {
      for (const topic of option('--topics', topics.join(',')).split(',')) {
        const measurements = [[], []];
        for (let run = 0; run < runs; run++) {
          for (const variant of (run % 2 === 0 ? [0, 1] : [1, 0])) {
            measurements[variant].push(await observe(browser, variant, topic, scenario));
          }
        }
        const [before, after] = measurements.map(items => percentile(items.map(({ map }) => map), .5));
        const gain = 1 - after / before;
        const target = scenario === 'zip' || scenario === 'warm-http' ? .1 : -.05;
        const mapP95 = measurements.map(items => percentile(items.map(({ map }) => map), .95));
        const homepageLcp = scenario === 'warm-http'
          ? measurements.map(items => percentile(items.map(({ lcp }) => lcp), .5)) : undefined;
        const result = { scenario, topic, before, after, gain, mapP95, homepageLcp,
          meetsTarget: gain >= target, measurements };
        results.push(result);
        const { measurements: _, ...summary } = result;
        console.log(JSON.stringify(summary));
      }
    }
    const warm = results.filter(result => result.scenario === 'warm-http');
    let homepage;
    if (warm.length) {
      const [before, after] = [0, 1].map(variant => percentile(warm.flatMap(result =>
        result.measurements[variant].map(({ lcp }) => lcp)), .5));
      homepage = { before, after, meetsTarget: after <= before + Math.max(15, before * .05) };
      console.log(JSON.stringify({ homepage }));
    }
    const report = option('--output');
    if (report) fs.writeFileSync(report, JSON.stringify({ runs, results, homepage }, null, 2) + '\n');
    if (results.some(result => !result.meetsTarget) || homepage?.meetsTarget === false) process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
