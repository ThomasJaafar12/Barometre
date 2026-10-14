/* Optional integration check: requires Playwright and pngjs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const option = name => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
const reference = path.resolve(root, option('--reference-dir') || '.cache/browser-reference');
const published = path.resolve(root, option('--site-dir') || 'dist');
const artifacts = path.resolve(root, option('--artifacts-dir') || '.cache/browser-verification');
const fingerprint = directory => Object.fromEntries(['site_manifest.json', 'index.html', 'barometre_bref.html',
  'barometre_details.html', 'assets/js/brief.js', 'assets/js/details.js'].filter(filename => fs.existsSync(path.join(directory, filename)))
  .map(filename => [filename, createHash('sha256').update(fs.readFileSync(path.join(directory, filename))).digest('hex')]));
fs.mkdirSync(artifacts, { recursive: true });
if (!option('--reference-dir')) {
  fs.mkdirSync(reference, { recursive: true });
  execFileSync(process.env.PYTHON || 'python', ['-c', `
from pathlib import Path
import sys
from barometre_builder.context import build_context
from barometre_builder.renderers import RENDERERS
context=build_context()
for name,renderer in RENDERERS.items():
    (Path(sys.argv[1])/name).write_text(renderer(context),encoding='utf-8',newline='\\n')
`, reference], { cwd: root });
  for (const directory of ['logo', 'Images/landing', 'Mp4']) {
    fs.cpSync(path.join(root, 'Assets', directory), path.join(reference, 'Assets', directory), { recursive: true });
  }
}
const fingerprints = { reference: fingerprint(reference), published: fingerprint(published) };

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.json': 'application/json' };
const server = http.createServer((request, response) => {
  const requested = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!requested.startsWith(root + path.sep) || !fs.existsSync(requested) || !fs.statSync(requested).isFile()) {
    response.writeHead(404).end(); return;
  }
  const bytes = fs.readFileSync(requested);
  const headers = { 'Content-Type': types[path.extname(requested)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if (range) {
    const start = Number(range[1]); const end = range[2] ? Number(range[2]) : bytes.length - 1;
    response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 });
    response.end(bytes.subarray(start, end + 1));
  } else response.writeHead(200, { ...headers, 'Content-Length': bytes.length }).end(bytes);
});

function comparePng(before, after, label) {
  const a = PNG.sync.read(before); const b = PNG.sync.read(after);
  assert.equal(a.width, b.width, label); assert.equal(a.height, b.height, label);
  let pixels = 0; let maxDelta = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) {
      pixels++;
      for (let channel = 0; channel < 4; channel++) maxDelta = Math.max(maxDelta, Math.abs(a.data[i + channel] - b.data[i + channel]));
    }
  }
  return { pixels, total: a.width * a.height, maxDelta };
}

function firstDifference(before, after, location = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return null;
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const difference = firstDifference(before[key], after[key], `${location}/${key}`);
      if (difference) return difference;
    }
  }
  return `${location}: ${JSON.stringify(before)?.slice(0, 160)} → ${JSON.stringify(after)?.slice(0, 160)}`;
}

async function settle(page) {
  await page.bringToFront();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    for (const video of document.querySelectorAll('video')) {
      video.pause();
      if (video.readyState > 0) video.currentTime = 0;
    }
  });
  await page.waitForTimeout(400);
  await page.mouse.move(0, 0);
}

const results = [];
let contractChecks = 0;
async function snapshot(pair, label, screenshot = false, screenshotTarget = null) {
  for (const page of pair) await settle(page);
  const text = await Promise.all(pair.map(page => page.locator('body').innerText()));
  assert.equal(text[1], text[0], `Contenu dynamique: ${label}`);
  // Compare the semantic chart/control contract independently of rasterization.
  // Ignore whitespace-only text nodes introduced by literal HTML formatting.
  const contracts = await Promise.all(pair.map(page => page.evaluate(() => {
    const visit = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.replace(/\s+/g, ' ').trim();
        return text || null;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const attrs = [...node.attributes].filter(attr => attr.name !== 'style')
        .map(attr => [attr.name, attr.value]).sort(([a], [b]) => a.localeCompare(b));
      return [node.localName, node.namespaceURI, attrs, [...node.childNodes].map(visit).filter(Boolean)];
    };
    const ids = ['employmentEffectifsChartSvg', 'employmentPayrollChartSvg', 'employmentTreemapSvg',
      'employmentDeptMapSvg', 'employmentDeptMapShell', 'autoMapSvg', 'autoMapPanel', 'dpaeChartSvg', 'pcolChartSvg', 'delaiChartSvg',
      'employmentDeptRanking', 'autoRanking', 'employmentEffectifsTopSectorsTable', 'employmentPayrollTopSectorsTable',
      'dpaeContractsTable', 'pcolTopSectorsTable', 'delaiTopSectorsTable', 'dpaeModeSwitch', 'pcolModeSwitch', 'delaiModeSwitch',
      'employmentTreemapMetricSwitch', 'employmentDeptMetricSwitch', 'autoMetricSwitch',
      'employmentEffectifsSeriesPicker', 'employmentPayrollSeriesPicker', 'employmentDeptSectorPicker',
      'autoSectorPicker', 'pcolSectorPicker', 'delaiSectorPicker'];
    return Object.fromEntries(ids.map(id => [id, document.getElementById(id)]).filter(([, node]) => node)
      .map(([id, node]) => [id, visit(node)]));
  })));
  fs.writeFileSync(path.join(artifacts, `${label.replace(/[^\p{L}\p{N}_-]/gu, '_')}-contract.json`),
    JSON.stringify(contracts[0]));
  const difference = firstDifference(contracts[0], contracts[1]);
  if (difference) {
    fs.writeFileSync(path.join(artifacts, `${label.replace(/[^\p{L}\p{N}_-]/gu, '_')}-candidate-contract.json`),
      JSON.stringify(contracts[1]));
    assert.fail(`Contrat DOM/SVG: ${label}: ${difference}`);
  }
  contractChecks++;
  if (screenshot) {
    const captures = [];
    for (let i = 0; i < pair.length; i++) {
      await pair[i].bringToFront();
      await settle(pair[i]);
      const target = screenshotTarget ? pair[i].locator(screenshotTarget) : pair[i];
      captures.push(await target.screenshot({ path: path.join(artifacts, `${label}-${i ? 'after' : 'before'}.png`), animations: 'disabled' }));
    }
    const diff = comparePng(captures[0], captures[1], label);
    results.push({ label, ...diff });
    // Edge may rasterize the same SVG logo with a few different antialiased edge pixels.
    // Content/CSS/JS/media equality is checked separately; reject any larger visual change.
    assert.ok(diff.pixels <= Math.ceil(diff.total * 0.0002) && diff.maxDelta <= 32,
      `Écart visuel: ${label} (${diff.pixels} pixels, amplitude ${diff.maxDelta})`);
  }
}

async function forBoth(pair, action) {
  for (const page of pair) {
    await page.bringToFront();
    await action(page);
  }
}

async function checkPair(browser, transport, viewport, filename, origin) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', locale: 'fr-FR' });
  // Same exact vendor bytes for the historic CDN scripts; only the published page uses local URLs.
  await context.route('https://cdn.jsdelivr.net/npm/**', route => {
    const filename = new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({ body: fs.readFileSync(path.join(root, 'barometre_builder/vendor', filename)),
      contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  const pair = [await context.newPage(), await context.newPage()];
  const errors = []; const dataRequests = [];
  for (let i = 0; i < pair.length; i++) {
    const page = pair[i];
    page.on('pageerror', error => errors.push(`${i}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`${i}: ${message.text()}`); });
    page.on('request', request => { if (['fetch', 'xhr'].includes(request.resourceType())) dataRequests.push(request.url()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${i}: HTTP ${response.status()} ${response.url()}`); });
    const directory = i ? published : reference;
    const url = transport === 'file' ? pathToFileURL(path.join(directory, filename)).href
      : origin + '/' + path.relative(root, path.join(directory, filename)).split(path.sep).map(encodeURIComponent).join('/');
    await page.goto(url, { waitUntil: 'load' });
  }
  const label = `${transport}-${viewport.width}-${filename.replace('.html', '')}`;
  await snapshot(pair, label, true);
  if (filename === 'index.html') {
    for (const page of pair) {
      for (const target of ['barometre_bref.html', 'barometre_details.html']) {
        await page.locator(`a[href="${target}"]`).first().click();
        await page.waitForURL(url => url.pathname.endsWith(target));
        await page.goBack({ waitUntil: 'load' });
      }
    }
  } else if (filename === 'barometre_bref.html') {
    for (const code of ['national', '11', '28', '04', '06']) {
      await forBoth(pair, page => page.locator('#regionSelect').selectOption(code));
      await snapshot(pair, `${label}-${code}`, code === '06');
      await forBoth(pair, async page => {
        const summaries = page.locator('#indicators details summary');
        for (let i = 0; i < await summaries.count(); i++) await summaries.nth(i).click();
      });
      await snapshot(pair, `${label}-${code}-tables`);
    }
  } else {
    for (const region of ['France entière', 'Île-de-France', 'Normandie', 'La Réunion', 'Mayotte']) {
      await forBoth(pair, async page => {
        await page.locator('#geoTrigger').click();
        await page.locator('#geoMenu button[role="option"]').filter({ hasText: region }).click();
        await page.waitForFunction(() => document.querySelector('#dpaeModeSwitch button'));
      });
      await snapshot(pair, `${label}-${region.replace(/[^\p{L}]/gu, '_')}`);
      for (const chapter of ['sector', 'payroll']) {
        await forBoth(pair, async page => {
          await page.evaluate(() => {
            const hero = document.querySelector('#stageShell');
            window.scrollTo(0, Math.max(window.scrollY, hero.getBoundingClientRect().bottom + window.scrollY + 40));
          });
          await page.waitForFunction(() => document.body.classList.contains('chapter-nav-ready'));
          await page.locator(`.chapter-tab[data-key="${chapter}"]`).click();
        });
        await snapshot(pair, `${label}-${region}-${chapter}`);
      }
      if (region === 'Île-de-France') {
        await forBoth(pair, async page => {
          const video = page.locator('#stageVideo');
          await page.waitForFunction(() => document.querySelector('#stageVideo').readyState >= 2);
          assert.equal(await video.evaluate(element => element.error), null);
        });
      }
    }
    // Exercise filters on a populated territory rather than the final empty scope.
    await forBoth(pair, async page => {
      await page.locator('#geoTrigger').click();
      await page.locator('#geoMenu button[role="option"]').filter({ hasText: 'France entière' }).click();
      await page.waitForFunction(() => document.querySelector('#dpaeModeSwitch button'));
    });
    // Every option of each metric switch; compare each resulting visible value.
    for (const id of ['dpaeModeSwitch', 'pcolModeSwitch', 'delaiModeSwitch',
                      'employmentTreemapMetricSwitch', 'employmentDeptMetricSwitch', 'autoMetricSwitch']) {
      const count = await pair[0].locator(`#${id} button`).count();
      assert.ok(count > 0, `Filtres absents: ${id}`);
      for (let i = 0; i < count; i++) {
        await forBoth(pair, page => page.locator(`#${id} button`).nth(i).click({ force: true }));
        await snapshot(pair, `${label}-${id}-${i}`);
      }
    }
    for (const id of ['employmentEffectifsSeriesPicker', 'employmentPayrollSeriesPicker',
                      'employmentDeptSectorPicker', 'autoSectorPicker', 'pcolSectorPicker', 'delaiSectorPicker']) {
      await forBoth(pair, async page => {
        await page.locator(`#${id} .employment-sector-trigger`).click({ force: true });
        const options = page.locator(`#${id} button[role="option"]`);
        assert.ok(await options.count() > 1, `Secteurs absents: ${id}`);
        await options.nth(1).click({ force: true });
      });
      await snapshot(pair, `${label}-${id}`);
    }
    await forBoth(pair, async page => {
      await page.locator('#employmentEffectifsChartSvg').scrollIntoViewIfNeeded();
    });
    await snapshot(pair, `${label}-chart`, true);
    if (transport === 'http') {
      // The employment department map requires a selected region. Select a
      // populated region before cropping the two department maps.
      await forBoth(pair, async page => {
        await page.locator('#geoTrigger').click({ force: true });
        await page.locator('#geoMenu button[role="option"]').filter({ hasText: 'Île-de-France' }).click({ force: true });
      });
      for (const id of ['employmentPayrollChartSvg', 'employmentTreemapSvg', 'employmentDeptMapSvg',
                        'autoMapSvg', 'dpaeChartSvg', 'pcolChartSvg', 'delaiChartSvg']) {
        await forBoth(pair, page => page.locator(`#${id}`).scrollIntoViewIfNeeded());
        await snapshot(pair, `${label}-${id}-visual`, true, `#${id}`);
      }
    }
    await forBoth(pair, async page => {
      await page.locator('#geoTrigger').click();
      await page.locator('.geo-return-button').click();
      await page.waitForFunction(() => document.querySelector('#stageShell').dataset.phase === 'landing');
    });
  }
  assert.deepEqual(dataRequests, [], `Requêtes de données: ${label}`);
  assert.deepEqual(errors, [], `Erreurs navigateur: ${label}`);
  await context.close();
  console.log(`OK ${label}`);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: option('--channel') || (process.platform === 'win32' ? 'msedge' : undefined), headless: true,
    args: ['--force-color-profile=srgb', '--disable-gpu'] });
  try {
    const transports = option('--transports')?.split(',') || ['file', 'http'];
    const filenames = option('--files')?.split(',') || ['index.html', 'barometre_bref.html', 'barometre_details.html'];
    assert.ok(transports.every(value => ['file', 'http'].includes(value)));
    assert.ok(filenames.every(value => ['index.html', 'barometre_bref.html', 'barometre_details.html'].includes(value)));
    for (const transport of transports) {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        for (const filename of filenames) {
          await checkPair(browser, transport, viewport, filename, origin);
        }
      }
    }
    fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify({ browser: browser.version(),
      capturedAt: new Date().toISOString(), reference, published, fingerprints,
      transports, filenames, viewports: [1440, 390], contractChecks, results }, null, 2));
    console.log(`${results.length} comparaisons visuelles conformes (tolérance limitée à l’anticrénelage) ; ${contractChecks} contrats DOM/SVG ; transports ${transports.join(', ')}.`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
