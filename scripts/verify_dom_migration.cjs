/* Focused DOM migration invariants: keyboard, tooltips, zoom, races and repeated renders. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const option = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const site = path.resolve(root, option('--site-dir') || 'dist');
const output = path.resolve(root, option('--output') || '.cache/dom-migration-invariants.json');
const baseline = process.argv.includes('--baseline');
const fixture = option('--fixture-dir') && path.resolve(root, option('--fixture-dir'));
const tooltipReference = option('--tooltip-reference-dir') && path.resolve(root, option('--tooltip-reference-dir'));
const results = [];
function instrument() {
  const listeners = new WeakMap();
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, handler, options) {
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    let entries = listeners.get(this);
    if (!entries) listeners.set(this, entries = []);
    if (handler && !entries.some(entry => entry.type === type && entry.handler === handler && entry.capture === capture))
      entries.push({ type, handler, capture });
    return add.call(this, type, handler, options);
  };
  EventTarget.prototype.removeEventListener = function (type, handler, options) {
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    const entries = listeners.get(this);
    const i = entries?.findIndex(entry => entry.type === type && entry.handler === handler && entry.capture === capture);
    if (i >= 0) entries.splice(i, 1);
    return remove.call(this, type, handler, options);
  };
  window.__migrationCounts = () => {
    const nodes = [...document.querySelectorAll('*')];
    const counts = new Map();
    for (const node of nodes) if (node.id) counts.set(node.id, (counts.get(node.id) || 0) + 1);
    return { nodes: nodes.length, listeners: [window, document, ...nodes].reduce((sum, node) => sum + (listeners.get(node)?.length || 0), 0),
      duplicateIds: [...counts].filter(([, count]) => count > 1).map(([id]) => id) };
  };
}
async function frames(page, count = 3) {
  await page.evaluate(async count => { for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame); }, count);
}
async function choose(page, name, wait = true) {
  await page.locator('#geoTrigger').click({ force: true });
  await page.locator('#geoMenu button[role="option"]').filter({ hasText: name }).click({ force: true });
  if (wait) {
    await page.waitForFunction(() => document.querySelector('#dpaeModeSwitch button'));
    await frames(page);
  }
}
async function open(browser, viewport, directory, gated = false) {
  const context = await browser.newContext({ viewport, locale: 'fr-FR', reducedMotion: 'reduce' });
  await context.addInitScript(instrument);
  if (gated) await context.addInitScript(() => {
    const gate = new Promise(resolve => { window.__releaseMigrationData = resolve; });
    const text = Response.prototype.text;
    Response.prototype.text = async function (...args) {
      const result = await text.apply(this, args); await gate; window.__migrationDataDecoded = true; return result;
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(directory, 'barometre_details.html')).href, { waitUntil: 'load' });
  return { page, context, errors };
}
async function controls(browser, viewport) {
  const { page, context, errors } = await open(browser, viewport, site);
  const session = await context.newCDPSession(page);
  await session.send('Performance.enable');
  try {
    await choose(page, 'Île-de-France');
    await page.evaluate(() => document.fonts.ready);
    const trigger = page.locator('#employmentEffectifsSeriesPicker .employment-sector-trigger');
    await trigger.focus();
    await trigger.press('ArrowDown');
    await frames(page);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('role')), 'option');
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    await page.keyboard.press('Escape');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.ok(await trigger.evaluate(node => node === document.activeElement));
    await trigger.click({ force: true });
    // Dispatch on an explicit outside target: forced pointer coordinates can
    // hit the mobile menu overlay rather than the offscreen hero title.
    await page.locator('#heroTitle').dispatchEvent('click');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'Outside click closes menu');

    const treemap = page.locator('#employmentTreemapSvg');
    await treemap.scrollIntoViewIfNeeded();
    await treemap.focus();
    await treemap.press('+');
    await frames(page);
    assert.notEqual(await page.locator('#employmentTreemapZoomLevel').innerText(), '100 %');
    const transform = await treemap.locator('.employment-treemap-viewport').getAttribute('transform');
    await page.evaluate(() => {
      window.__migrationSavedNodes = {
        treemap: document.querySelector('#employmentTreemapSvg .employment-treemap-viewport'),
        payroll: document.querySelector('#employmentPayrollChartSvg path'),
        map: document.querySelector('#employmentDeptMapSvg path'),
        menu: document.querySelector('#employmentEffectifsSeriesPicker button[role="option"]'),
      };
      const picker = document.getElementById('employmentEffectifsSeriesPicker');
      picker.querySelector('.employment-sector-trigger').click();
      [...picker.querySelectorAll('button[role="option"]')].find(node => node.getAttribute('aria-selected') !== 'true').click();
    });
    await frames(page);
    assert.equal(await treemap.locator('.employment-treemap-viewport').getAttribute('transform'), transform, 'Unrelated filter preserves zoom');
    if (!baseline) assert.ok(await page.evaluate(() => Object.entries(window.__migrationSavedNodes).every(([key, node]) => {
      const selectors = { treemap: '#employmentTreemapSvg .employment-treemap-viewport', payroll: '#employmentPayrollChartSvg path',
        map: '#employmentDeptMapSvg path', menu: '#employmentEffectifsSeriesPicker button[role="option"]' };
      return node && node === document.querySelector(selectors[key]);
    })), 'Unrelated components and unchanged menu retain their nodes');
    await treemap.focus();
    await treemap.press('0');
    assert.equal(await page.locator('#employmentTreemapZoomLevel').innerText(), '100 %');
    const tile = treemap.locator('.employment-treemap-tile').first();
    await tile.focus();
    assert.equal(await page.locator('#employmentTreemapTooltip').getAttribute('aria-hidden'), 'false');
    assert.ok((await page.locator('#employmentTreemapTooltip').innerText()).trim().length > 0);
    await treemap.focus();
    await treemap.press('Escape');
    assert.equal(await page.locator('#employmentTreemapTooltip').getAttribute('aria-hidden'), 'true');

    // Map callbacks must use the new selected metric, including on retained paths.
    const tooltipForMap = async () => page.evaluate(() => {
      const node = document.querySelector('#employmentDeptMapSvg path');
      const bounds = node.getBoundingClientRect();
      node.dispatchEvent(new MouseEvent('mouseenter', { clientX: bounds.x + 2, clientY: bounds.y + 2 }));
      return document.getElementById('tooltipValue').textContent;
    });
    const originalTooltip = await tooltipForMap();
    await page.evaluate(() => {
      document.querySelector('#employmentDeptMetricSwitch button:not(.is-active)').click();
    });
    await frames(page);
    const newTooltip = await tooltipForMap();
    assert.notEqual(newTooltip, originalTooltip, 'Retained map paths use current metric tooltip values');
    await page.evaluate(() => document.querySelector('#employmentDeptMapSvg path').dispatchEvent(new MouseEvent('mouseleave')));

    // A → B → A: compare text and chart coordinates after caches have been reused.
    const semantic = () => page.evaluate(() => {
      const ids = ['employmentEffectifsChartSvg', 'employmentPayrollChartSvg', 'employmentDeptMapSvg', 'employmentDeptRanking', 'dpaeChartSvg'];
      return ids.map(id => {
        const node = document.getElementById(id);
        return { id, text: node.textContent.replace(/\s+/g, ' ').trim(),
          paths: [...node.querySelectorAll('path')].map(path => path.getAttribute('d')) };
      });
    });
    const reference = await semantic();
    await choose(page, 'Normandie');
    await choose(page, 'Île-de-France');
    assert.deepEqual(await semantic(), reference, 'A→B→A keeps exact chart values and geometry');

    const counts = [];
    for (let cycle = 0; cycle < 50; cycle++) {
      await page.evaluate(cycle => {
        const picker = document.getElementById('employmentEffectifsSeriesPicker');
        picker.querySelector('.employment-sector-trigger').click();
        const options = [...picker.querySelectorAll('button[role="option"]')];
        options[cycle % 2].click();
        document.querySelector('#employmentDeptMetricSwitch button:not(.is-active)').click();
        document.querySelector('#dpaeModeSwitch button:not(.is-active)').click();
      }, cycle);
      await frames(page);
      if ([9, 29, 49].includes(cycle)) {
        await session.send('HeapProfiler.collectGarbage');
        const metrics = await session.send('Performance.getMetrics');
        counts.push({ ...(await page.evaluate(() => window.__migrationCounts())),
          heapBytes: metrics.metrics.find(metric => metric.name === 'JSHeapUsedSize').value });
      }
    }
    for (const count of counts) assert.deepEqual(count.duplicateIds, [], 'No duplicate IDs after repeated changes');
    assert.equal(counts.at(-1).nodes, counts[0].nodes, 'Attached node count stabilizes');
    assert.equal(counts.at(-1).listeners, counts[0].listeners, 'Attached listener registrations stabilize');
    assert.ok(counts.at(-1).heapBytes <= counts[0].heapBytes + Math.max(counts[0].heapBytes * .05, 5 * 1024 * 1024),
      'Retained heap stabilizes across 50 cycles');
    await page.setViewportSize({ width: viewport.width - 20, height: viewport.height });
    await frames(page, 5);
    assert.ok(await page.locator('#employmentTreemapSvg').evaluate(node => node.viewBox.baseVal.width > 0));
    assert.deepEqual(errors, []);
    results.push({ scenario: 'controls-tooltip-zoom-A-B-A-50-cycles-resize', viewport, counts, originalTooltip, newTooltip });
    console.log(`OK DOM invariants ${viewport.width}px`);
  } finally { await context.close(); }
}
async function race(browser, viewport, destination) {
  const { page, context, errors } = await open(browser, viewport, site, true);
  try {
    await choose(page, 'France entière', false);
    await choose(page, 'Normandie', false);
    if (destination === 'landing') {
      await page.locator('#geoTrigger').click({ force: true });
      await page.locator('.geo-return-button').click({ force: true });
    } else await choose(page, 'Mayotte', false);
    await page.evaluate(() => window.__releaseMigrationData());
    await page.waitForFunction(() => window.__migrationDataDecoded === true);
    await frames(page, 12);
    if (destination === 'landing') {
      assert.equal(await page.locator('#stageShell').getAttribute('data-phase'), 'landing');
      assert.equal(await page.locator('#story').isVisible(), false, 'Pending data must not reveal landing story');
    } else {
      await page.waitForFunction(() => document.querySelector('#dpaeModeSwitch button'));
      assert.ok((await page.locator('#geoTrigger').getAttribute('aria-label')).includes('Mayotte'));
      assert.ok((await page.locator('#employmentTreemapMeta').textContent()).includes('Mayotte'));
    }
    assert.deepEqual(errors, []);
    results.push({ scenario: `pending-data-latest-${destination}`, viewport });
    console.log(`OK async latest ${destination} ${viewport.width}px`);
  } finally { await context.close(); }
}
async function securityFixture(browser) {
  const { page, context, errors } = await open(browser, { width: 1440, height: 900 }, fixture);
  try {
    await choose(page, 'Île-de-France');
    await frames(page, 5);
    assert.equal(await page.locator('#dom-injection-probe').count(), 0, 'Payload must not create an HTML element');
    assert.equal(await page.evaluate(() => window.__domXssExecuted === true), false);
    assert.equal(await page.locator('[onerror],[onload],[onclick]').count(), 0, 'No executable handler attributes from labels');
    assert.ok((await page.locator('body').textContent()).includes('<img id="dom-injection-probe"'), 'Injected label remains literal text');
    assert.equal((await page.locator('#dpaeCurrentNb').textContent()).trim(), '—', 'Missing DPAE value remains missing');
    assert.equal((await page.locator('#dpaeCurrentLong').textContent()).trim(), '—', 'Incomplete long-contract sum remains missing');
    await page.locator('#dpaeModeSwitch button').filter({ hasText: /^CDI/ }).click({ force: true });
    await frames(page);
    assert.equal((await page.locator('#dpaeCurrentNb').textContent()).trim(), '0', 'Zero CDI is displayed as zero');
    await page.locator('#dpaeModeSwitch button').filter({ hasText: /^CDD longs/ }).click({ force: true });
    await frames(page);
    assert.equal((await page.locator('#dpaeCurrentNb').textContent()).trim(), '—', 'Missing CDD long is not converted to zero');
    for (const filename of ['index.html', 'barometre_bref.html']) {
      const other = await context.newPage();
      other.on('pageerror', error => errors.push(error.message));
      await other.goto(pathToFileURL(path.join(fixture, filename)).href, { waitUntil: 'load' });
      if (filename === 'barometre_bref.html') {
        await other.locator('#regionSelect').selectOption('11');
        assert.ok((await other.locator('body').textContent()).includes('<img id="dom-injection-probe"'));
      }
      assert.equal(await other.locator('#dom-injection-probe,[onerror],[onload],[onclick]').count(), 0);
      assert.equal(await other.evaluate(() => window.__domXssExecuted === true), false);
      await other.close();
    }
    assert.deepEqual(errors, []);
    results.push({ scenario: 'generator-label-zero-null-fixture', literal: true, executed: false, zeroVsMissing: true });
    console.log('OK source→generator→browser malicious labels');
  } finally { await context.close(); }
}
async function retainedTooltip(browser) {
  const observations = [];
  const definitions = [
    { name: 'sector-region', region: 'Île-de-France', svg: 'employmentDeptMapSvg', switch: 'employmentDeptMetricSwitch' },
    { name: 'auto-region', region: 'Île-de-France', svg: 'autoMapSvg', switch: 'autoMetricSwitch' },
    { name: 'auto-national', region: 'France entière', svg: 'autoMapSvg', switch: 'autoMetricSwitch' },
  ];
  const selected = option('--tooltip-cases')?.split(',') || definitions.map(item => item.name);
  assert.ok(selected.every(name => definitions.some(item => item.name === name)));
  for (const scenario of definitions.filter(item => selected.includes(item.name))) for (const directory of [tooltipReference, site]) {
    const { page, context, errors } = await open(browser, { width: 1440, height: 900 }, directory);
    try {
      await choose(page, scenario.region);
      await page.locator(`#${scenario.svg}`).scrollIntoViewIfNeeded();
      const index = await page.locator(`#${scenario.svg} path`).evaluateAll(paths =>
        paths.findIndex(path => path.__data__?.properties?.code === '75'));
      assert.ok(index >= 0, 'Paris department path is available for physical hover');
      const department = page.locator(`#${scenario.svg} path`).nth(index);
      await department.hover();
      await frames(page);
      const read = () => page.evaluate(() => ({ visible: document.getElementById('tooltip').classList.contains('is-visible'),
        label: document.getElementById('tooltipLabel').textContent, value: document.getElementById('tooltipValue').textContent }));
      const before = await read();
      assert.ok(before.visible, 'Physical hover reveals department tooltip');
      await page.evaluate(id => document.querySelector(`#${id} button:not(.is-active)`).click(), scenario.switch);
      await frames(page);
      const withoutMoving = await read();
      await page.mouse.move(0, 0);
      await page.locator(`#${scenario.svg} path`).nth(index).hover();
      await frames(page);
      const afterMoving = await read();
      assert.deepEqual(errors, []);
      observations.push({ scenario: scenario.name, directory, before, withoutMoving, afterMoving });
    } finally { await context.close(); }
  }
  results.push({ scenario: 'retained-path-visible-tooltip-without-pointer-move', observations });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ results }, null, 2));
  for (let i = 0; i < observations.length; i += 2) {
    assert.deepEqual(observations[i + 1].withoutMoving, observations[i].withoutMoving,
      `Retaining map paths must preserve the baseline visible tooltip behavior: ${observations[i].scenario}`);
    assert.deepEqual(observations[i + 1].afterMoving, observations[i].afterMoving);
    console.log(`OK retained physical-hover tooltip without pointer movement: ${observations[i].scenario}`);
  }
}
(async () => {
  const browser = await chromium.launch({ channel: option('--channel') || (process.platform === 'win32' ? 'msedge' : undefined), headless: true,
    args: ['--force-color-profile=srgb', '--disable-gpu'] });
  try {
    if (!process.argv.includes('--tooltip-only')) for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await controls(browser, viewport);
      await race(browser, viewport, 'Mayotte');
      await race(browser, viewport, 'landing');
    }
    if (tooltipReference) await retainedTooltip(browser);
    if (fixture) await securityFixture(browser);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify({ browser: browser.version(), site, baseline, results }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
