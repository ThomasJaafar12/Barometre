/* Checks the published map before controller load and verifies real HTTP cache reuse. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const siteOption = process.argv.indexOf('--site-dir');
const siteDirectory = siteOption < 0 ? 'dist' : process.argv[siteOption + 1];
if (!siteDirectory) throw new Error('--site-dir nécessite un dossier.');
const site = path.resolve(__dirname, '..', siteDirectory);
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'site_manifest.json'), 'utf8'));
const regionMap = manifest.region_map;
assert.match(regionMap, /^assets\/js\/region-map[-.][a-f0-9]{16}\.js$/);

const topics = {
  chiffres: '#chiffresPayrollChartSvg .employment-level-line',
  emploi: '#employmentEffectifsChartSvg .tick',
  entreprises: '#pcolChartSvg .tick',
};
const indicatorKeys = {
  chiffres: ['payrollEarly', 'trar90', 'dpae'],
  emploi: ['headcount', 'payroll', 'auto'],
  entreprises: ['pcol', 'jobs', 'dpae', 'trar90'],
};
const d3 = 'assets/vendor/d3.min.js';
const animation = ['assets/vendor/gsap.min.js', 'assets/vendor/ScrollTrigger.min.js'];
const shared = [regionMap, d3];
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4' };
const requests = [];
const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1);
  const filename = path.resolve(site, relative);
  if (!filename.startsWith(site + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
    response.writeHead(404).end();
    return;
  }
  const purpose = request.headers['sec-purpose'] || request.headers.purpose || '';
  requests.push({ asset: relative, prefetch: purpose.includes('prefetch') });
  response.writeHead(200, {
    'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
    'Content-Length': fs.statSync(filename).size,
    'Cache-Control': shared.includes(relative) ? 'public, max-age=3600' : 'no-store',
  });
  fs.createReadStream(filename).pipe(response);
});

function browserErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

function readKpis(page, container) {
  return page.locator(container + ' .kpi-card').evaluateAll(cards => cards.map(card => {
    const badge = card.querySelector('.hero-kpi-change');
    return {
      key: card.dataset.indicator,
      label: card.querySelector('.label').textContent,
      highlight: getComputedStyle(card.querySelector('.text-highlight')).backgroundColor,
      value: card.querySelector('strong').textContent,
      period: card.querySelector('.meta').textContent,
      change: badge?.checkVisibility() ? { text: badge.textContent, trend: badge.dataset.trend } : null,
    };
  }));
}

async function waitForScope(page, selector, name) {
  await page.waitForFunction(([id, expected]) => document.querySelector(id)?.textContent === expected,
    [selector, name]);
}

async function checkDesktopFrame(page) {
  // ResizeObserver fits the SVG to its grid after the browser lays out the shell.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const layout = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect();
    const shell = box('.shell'), stage = box('#stageShell'), france = box('#landingMap .mainland-layer');
    return {
      outerGap: innerHeight - shell.bottom,
      innerGap: shell.bottom - stage.bottom,
      overflow: document.documentElement.scrollHeight - innerHeight,
      overlaysClear: box('#cockpitReadout').right <= france.left && france.right <= box('#cockpitTerritories').left,
      franceFits: france.top >= stage.top && france.bottom <= stage.bottom,
    };
  });
  assert.ok(layout.outerGap >= 12 && layout.outerGap <= 20, 'Outer frame gap: ' + layout.outerGap);
  assert.ok(layout.innerGap >= 16 && layout.innerGap <= 22, 'Map to white frame gap: ' + layout.innerGap);
  assert.ok(layout.overflow <= 1, 'Desktop cockpit vertical overflow: ' + layout.overflow);
  assert.ok(layout.franceFits && layout.overlaysClear, 'Mainland France and Corsica must clear both overlays');
}

async function returnToCockpit(page) {
  await page.locator('#geoTrigger').click();
  await page.locator('.geo-return-button').click();
  await page.locator('#stageShell[data-phase="landing"] #cockpitScopeName').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#story').isVisible(), false);
}

async function checkCockpit(page, topic) {
  const rail = page.locator('#cockpitTerritories button');
  const locator = page.locator('.stage-location');
  assert.equal(await locator.isVisible(), false);
  assert.deepEqual(await rail.evaluateAll(buttons => buttons.map(button => button.dataset.scope)),
    ['national', '01', '02', '03', '04']);
  await page.mouse.move(0, 0);
  await waitForScope(page, '#cockpitScopeName', 'France entière');
  const national = await readKpis(page, '#cockpitKpis');
  assert.deepEqual(national.map(card => card.key), indicatorKeys[topic]);
  assert.ok(national.every(card => card.value !== '—' && card.label && card.period));
  assert.ok(national.every(card => card.highlight !== 'rgba(0, 0, 0, 0)'), `KPI label highlights: ${topic}`);
  if (topic === 'chiffres') {
    const units = national.map(card => card.change?.text.match(/ (pt|%) sur 1 an$/)?.[1]);
    assert.deepEqual(units, ['%', 'pt', '%'], 'All three monthly indicators show their annual change');
  } else if (topic === 'entreprises') {
    const arrears = national.find(card => card.key === 'trar90');
    assert.equal(arrears.label, 'Taux de reste à recouvrer à 90 jours');
    assert.match(arrears.value, /^0,94\s+%$/);
    assert.equal(arrears.period, 'juil. 2026');
    assert.deepEqual(arrears.change, { text: '−0,03 pt sur 1 an', trend: 'favorable' });
  }

  const region = page.locator('#landingMap .path-region[data-code="24"]');
  await region.hover();
  await waitForScope(page, '#cockpitScopeName', 'Centre-Val de Loire');
  const regional = await readKpis(page, '#cockpitKpis');
  assert.notDeepEqual(regional, national);
  await page.locator('#geoTrigger').hover();
  await waitForScope(page, '#cockpitScopeName', 'France entière');
  assert.deepEqual(await readKpis(page, '#cockpitKpis'), national);

  const overseas = page.locator('#cockpitTerritories button[data-scope="01"]');
  await overseas.focus();
  await waitForScope(page, '#cockpitScopeName', 'Guadeloupe');
  const preview = await readKpis(page, '#cockpitKpis');
  assert.notDeepEqual(preview, national);
  await overseas.press('Enter');
  await waitForScope(page, '#heroTitle', 'Guadeloupe');
  await page.locator('#story').waitFor({ state: 'visible' });
  assert.equal(await locator.innerText(), 'Guadeloupe');
  assert.deepEqual(await readKpis(page, '#heroKpis'), preview);
  await page.locator(topics[topic]).first().waitFor({ state: 'attached' });

  await page.locator('#geoTrigger').click();
  await page.getByRole('option', { name: 'Mayotte', exact: true }).click();
  await waitForScope(page, '#heroTitle', 'Mayotte');
  if (topic === 'entreprises') {
    const cards = await readKpis(page, '#heroKpis');
    assert.equal(cards.find(card => card.key === 'pcol').value, '—');
    assert.match(cards.find(card => card.key === 'trar90').value, /^25,28\s+%$/);
  }
  await returnToCockpit(page);
  await page.locator('#cockpitTerritories button[data-scope="national"]').click();
  await waitForScope(page, '#heroTitle', 'France entière');
  assert.equal(await locator.innerText(), 'Tour Eiffel · Paris (75)');
  assert.match(await page.locator('#heroKpis .hero-kpi-change').first().innerText(), /sur 1 an/);
  assert.equal(await page.locator('#landingMap').isVisible(), false, 'The national overview must hide the region chooser map');
  assert.equal(await page.locator('#heroKpis .kpi-card:visible').count(), national.length);
  assert.deepEqual(await readKpis(page, '#heroKpis'), national);
  await returnToCockpit(page);
  await region.focus();
  await waitForScope(page, '#cockpitScopeName', 'Centre-Val de Loire');
}

async function checkWarmCache(browser, origin) {
  // Routing disables the browser cache, so this check uses the real HTTP server
  // and CDP only to avoid requesting external fonts.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  try {
    await context.addInitScript(() => {
      if (!location.pathname.endsWith('/index.html')) return;
      const phases = new Map();
      window.prefetchPhases = phases;
      new MutationObserver(() => {
        for (const link of document.querySelectorAll('link[rel="prefetch"]')) {
          if (!phases.has(link.href)) phases.set(link.href, performance.getEntriesByType('navigation')[0].loadEventEnd);
        }
      }).observe(document, { subtree: true, childList: true });
    });
    const page = await context.newPage();
    const errors = browserErrors(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
    const start = requests.length;
    await Promise.all([
      ...shared.map(asset => page.waitForEvent('requestfinished', {
        predicate: request => request.url() === `${origin}/${asset}`, timeout: 15000,
      })),
      page.goto(`${origin}/index.html`, { waitUntil: 'load' }),
    ]);
    const phases = await page.evaluate(() => [...window.prefetchPhases]);
    assert.deepEqual(phases.map(([url]) => new URL(url).pathname.slice(1)).sort(), [...shared].sort());
    assert.ok(phases.every(([, loadEnd]) => loadEnd > 0), 'Prefetch must follow the homepage load event');
    const homepageScripts = requests.slice(start).filter(request => request.asset.endsWith('.js'));
    const warmed = shared.map(asset => ({ asset, prefetch: true })).sort((a, b) => a.asset.localeCompare(b.asset));
    assert.deepEqual(homepageScripts.sort((a, b) => a.asset.localeCompare(b.asset)), warmed,
      'Index must warm only the two shared map assets');

    for (const topic of Object.keys(topics)) {
      const destination = `barometre_${topic}.html`;
      await page.locator(`article.topic[data-topic="${topic}"]`).getByRole('link', { name: /En détail$/ }).click();
      await page.waitForURL(`${origin}/${destination}`);
      await page.locator('#landingMap .mainland-layer .path-region[d]').first().waitFor({ state: 'visible' });
      const transfers = await page.evaluate(assets => assets.map(asset => {
        const resource = performance.getEntriesByName(new URL(asset, location.href).href).find(entry => entry.entryType === 'resource');
        return resource && { transferred: resource.transferSize, encoded: resource.encodedBodySize };
      }), shared);
      assert.ok(transfers.every(transfer => transfer?.transferred === 0 && transfer.encoded > 0),
        `The detail page should reuse both prefetched assets from the HTTP cache: ${topic}`);
      if (topic === 'chiffres') {
        await page.setViewportSize({ width: 1947, height: 1302 });
        await checkDesktopFrame(page);
        await page.setViewportSize({ width: 1366, height: 768 });
      }
      await checkCockpit(page, topic);
      await checkDesktopFrame(page);
      await page.goBack({ waitUntil: 'domcontentloaded' });
    }
    assert.deepEqual(requests.slice(start).filter(request => shared.includes(request.asset))
      .sort((a, b) => a.asset.localeCompare(b.asset)), warmed, 'Warm navigation must avoid another server hit');
    assert.deepEqual(errors, []);
    console.log('OK homepage prefetch: D3 and region map reused across all topics without retransmission');
  } finally {
    await context.close();
  }
}

async function checkEarlyInteraction(browser, url, topic, viewport) {
  const touch = viewport.width < 600;
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', hasTouch: touch });
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  const startupAssets = touch ? shared.map(asset => new URL(asset, url).href) : [];
  const controllerAssets = [...animation, `assets/js/${topic}.js`].map(asset => new URL(asset, url).href);
  const dataUrl = new URL(`assets/js/${topic}-data.js`, url).href;
  let releaseStartup; let releaseController; let releaseCharts;
  const startupGate = new Promise(resolve => { releaseStartup = resolve; });
  const controllerGate = new Promise(resolve => { releaseController = resolve; });
  const chartGate = new Promise(resolve => { releaseCharts = resolve; });
  const gates = new Map([...startupAssets.map(asset => [asset, startupGate]),
    ...controllerAssets.map(asset => [asset, controllerGate]), [dataUrl, chartGate]]);
  const blocked = new Set();
  await context.route(resource => gates.has(resource.href), async route => {
    const requestUrl = route.request().url();
    blocked.add(requestUrl);
    await gates.get(requestUrl);
    await route.continue();
  });
  const page = await context.newPage();
  const errors = browserErrors(page);
  try {
    await page.goto(url, { waitUntil: 'commit' });
    const region = page.locator('#landingMap .path-region[data-code="11"]');
    if (touch) {
      await page.locator('#geoTrigger').tap();
      assert.equal(await region.count(), 0, 'Accept a chooser tap before D3 and the region map arrive');
      releaseStartup();
    }
    await region.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#landingMap .mainland-layer .path-region[d][role="button"][tabindex="0"]:visible').count(), 13);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('#mapStage').evaluate(element => Number(getComputedStyle(element).opacity)), 1);
    assert.equal(await page.locator('#story').isVisible(), false);
    const originalRegion = await region.elementHandle();
    const earlyNational = !touch && topic === 'entreprises';
    const earlyOverseas = !touch && topic === 'emploi';
    const selectedName = earlyNational ? 'France entière' : earlyOverseas ? 'La Réunion' : 'Île-de-France';
    if (!touch) {
      const control = earlyNational || earlyOverseas
        ? page.locator(`#cockpitTerritories button[data-scope="${earlyNational ? 'national' : '04'}"]`) : region;
      await control.focus();
      await waitForScope(page, '#cockpitScopeName', selectedName);
      await control.press('Space');
    }

    releaseController();
    if (touch) {
      const option = page.locator('#geoMenu button[role="option"]:not([data-historical-territory])')
        .filter({ hasText: 'Île-de-France' });
      await option.waitFor({ state: 'visible' });
      assert.ok(await originalRegion.evaluate(node => node.isConnected), 'The first map survives controller hydration');
      await option.tap();
    }
    await waitForScope(page, '#heroTitle', selectedName);
    await page.locator('#story').waitFor({ state: 'visible' });
    const mark = page.locator(topics[topic]).first();
    assert.equal(await mark.count(), 0, 'Regional selection should reveal the story while data is held');
    releaseCharts();
    await mark.waitFor({ state: 'attached' });
    if (touch) {
      await returnToCockpit(page);
      const railButton = page.locator('#cockpitTerritories button[data-scope="02"]');
      assert.ok(await railButton.evaluate(button => button.getBoundingClientRect().height >= 44));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await railButton.tap();
      await waitForScope(page, '#heroTitle', 'Martinique');
      await page.locator('#story').waitFor({ state: 'visible' });
    }
    assert.deepEqual([...blocked].sort(), [...gates.keys()].sort());
    assert.deepEqual(errors, []);
    console.log(`OK cockpit selection before hydration: ${new URL(url).protocol} ${topic} (${selectedName})`);
  } finally {
    releaseStartup();
    releaseController();
    releaseCharts();
    await context.close();
  }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  try {
    await checkWarmCache(browser, origin);
    for (const topic of Object.keys(topics)) {
      const filename = `barometre_${topic}.html`;
      await checkEarlyInteraction(browser, `${origin}/${filename}`, topic, { width: 1440, height: 900 });
      await checkEarlyInteraction(browser, pathToFileURL(path.join(site, filename)).href, topic, { width: 390, height: 844 });
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
