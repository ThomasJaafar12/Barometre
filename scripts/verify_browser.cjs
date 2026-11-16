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
  'barometre_emploi.html', 'barometre_entreprises.html', 'assets/js/brief.js', 'assets/js/emploi.js', 'assets/js/entreprises.js'].filter(filename => fs.existsSync(path.join(directory, filename)))
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
    await Promise.all([...document.querySelectorAll('video')].map(async video => {
      video.pause();
      if (video.readyState > 0) {
        await new Promise(resolve => {
          video.addEventListener('seeked', resolve, { once: true });
          video.currentTime = 0;
        });
      }
    }));
  });
  await page.waitForTimeout(400);
  await page.mouse.move(0, 0);
}

const results = [];
let contractChecks = 0;
async function snapshot(pair, label, screenshot = false, screenshotTarget = null) {
  for (const page of pair) await settle(page);
  // Le déplacement de la souris pendant un défilement peut rouvrir cette infobulle globale.
  // Les interactions des infobulles sont vérifiées séparément.
  const text = await Promise.all(pair.map(page => page.locator('body').evaluate(body => {
    const tooltip = body.querySelector('#tooltip');
    if (!tooltip) return body.innerText;
    const display = tooltip.style.display;
    tooltip.style.display = 'none';
    const content = body.innerText;
    tooltip.style.display = display;
    return content;
  })));
  if (text[1] !== text[0]) {
    assert.fail(`Contenu dynamique: ${label}: ${firstDifference(text[0].split('\n'), text[1].split('\n'))}`);
  }
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
      'autoSectorPicker', 'pcolSectorPicker', 'delaiSectorPicker', 'trarChartSvg', 'trarLatest',
      'trarSectorSelect', 'trarRankingHorizon', 'trarTopSectorsTable', 'trarTopSectorsMeta',
      'trarHorizonSwitch', 'trarDepartmentSectorSelect', 'trarTreemapSvg',
      'trarMapSvg', 'trarDepartmentSelect', 'trarDepartmentChartSvg'];
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
      captures.push(await target.screenshot({ path: path.join(artifacts, `${label}-${i ? 'after' : 'before'}.png`),
        animations: 'disabled', style: '#tooltip { display: none !important; }' }));
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

async function selectDetailScope(page, label) {
  await page.locator('#geoTrigger').click();
  await page.locator('#geoMenu button[role="option"]').filter({ hasText: label }).click();
  await page.waitForFunction(name => document.getElementById('heroTitle').textContent === name, label);
}

async function checkTrarRanking(page, touch) {
  const latest = page.locator('#trarLatest');
  const horizon = page.locator('#trarRankingHorizon');
  const sector = page.locator('#trarSectorSelect');
  const rows = page.locator('#trarTopSectorsTable tbody tr');
  const rankingDate = page.locator('#trarTopSectorsMeta');
  await sector.selectOption('tous-secteurs');
  assert.ok(await latest.locator('[data-horizon]').evaluateAll(cards => cards.every(card => {
    const style = getComputedStyle(card);
    return style.borderInlineStart === style.borderBlockStart;
  })), 'Les cartes TRAR utilisent le même contour sur tous les côtés.');
  assert.equal(await latest.getByText('Gliss. annuel', { exact: true }).count(), 3);
  assert.equal(await latest.getByText('Gliss. mensuel', { exact: true }).count(), 3);
  assert.match(await latest.innerText(), /\bpt\b/u);
  const firstMonth = await page.locator('#trarChartSvg .tick text').filter({ hasText: /\p{L}+\.?\s+\d{4}/u }).first().textContent();
  assert.ok((await page.locator('#trarChartScope').innerText()).includes(`Historique depuis ${firstMonth}`));

  assert.equal(await horizon.inputValue(), 'fin');
  for (const key of ['fin', 'moisSuivant', 'j90']) {
    await horizon.selectOption(key);
    assert.equal(await rankingDate.getAttribute('datetime'), await latest.locator(`[data-horizon="${key}"] time`).getAttribute('datetime'));
    assert.equal(await rows.count(), 5);
    const rates = (await rows.locator('.delai-td-mt').allTextContents()).map(value =>
      Number.parseFloat(value.replace(/\s/g, '').replace('−', '-').replace(',', '.')));
    assert.ok(rates.every(Number.isFinite));
    assert.deepEqual(rates, [...rates].sort((left, right) => right - left));
  }
  const leaders = rows.locator('.sector-ranking-link');
  const leader = leaders.first();
  const label = await leader.getAttribute('title');
  if (touch) await leader.tap();
  else await leader.press('Enter');
  assert.equal(await sector.locator('option:checked').textContent(), label);
  assert.equal(await leader.getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => document.activeElement?.id === 'trarSectorSelect');
  assert.equal(await horizon.inputValue(), 'j90');
}

async function checkTrar(page, touch) {
  const sector = page.locator('#trarSectorSelect');
  const deptSector = page.locator('#trarDepartmentSectorSelect');
  const department = page.locator('#trarDepartmentSelect');
  const horizon90 = page.locator('#trarHorizonSwitch').getByRole('button', { name: /90/ });
  const treemap = page.locator('#trarTreemapSvg');
  const map = page.locator('#trarMapSvg');
  const detail = page.locator('#trarDepartmentDetail');
  await treemap.waitFor({ state: 'visible' });
  assert.equal(await sector.inputValue(), 'tous-secteurs');
  assert.equal(await treemap.locator('[data-code]').count(), 101);
  assert.equal(await page.locator('#trarLatest time[datetime]').count(), 3);
  const nationalOption = sector.locator('option[value="01"]');
  assert.match(await nationalOption.textContent(), /Culture et production animale/);
  await sector.selectOption('01');
  assert.equal(await page.locator('#trarChartSvg .quarterly-series').count(), 3);

  await deptSector.selectOption('btp');
  await horizon90.click();
  assert.equal(await horizon90.getAttribute('aria-pressed'), 'true');
  const parisTile = treemap.locator('[data-code="75"]');
  const parisLabel = await parisTile.getAttribute('aria-label');
  assert.match(parisLabel, /Paris.*\d.*%/);
  const parisColor = await parisTile.locator('rect').getAttribute('fill');
  const nationalSnapshot = await page.locator('#trarDepartmentContext').innerText();
  if (touch) await parisTile.tap();
  else await parisTile.press('Enter');
  await detail.waitFor({ state: 'visible' });
  assert.equal(await department.inputValue(), '75');
  assert.match(await page.locator('#trarDepartmentChartTitle').innerText(), /Paris/);
  assert.equal(await page.locator('#trarDepartmentChartSvg .quarterly-series').count(), 3);
  assert.equal(await sector.inputValue(), '01');
  if (!touch) assert.ok(await parisTile.evaluate(node => node === document.activeElement));

  await checkTrarRanking(page, touch);
  assert.equal(await department.inputValue(), '75');
  assert.equal(await deptSector.inputValue(), 'btp');
  assert.equal(await horizon90.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#trarDepartmentContext').innerText(), nationalSnapshot);

  await selectDetailScope(page, 'Île-de-France');
  await map.waitFor({ state: 'visible' });
  assert.equal(await treemap.isVisible(), false);
  assert.equal(await map.locator('[data-code]').count(), 8);
  assert.equal(await sector.inputValue(), 'tous-secteurs');
  assert.equal(await sector.locator('option[value="01"]').count(), 0);
  const regionalLeader = page.locator('#trarTopSectorsTable tbody .sector-ranking-link').first();
  assert.ok((await sector.locator('option').allTextContents()).includes(await regionalLeader.getAttribute('title')));
  assert.equal(await department.inputValue(), '75');
  assert.equal(await deptSector.inputValue(), 'btp');
  assert.equal(await horizon90.getAttribute('aria-pressed'), 'true');
  const parisPath = map.locator('[data-code="75"]');
  assert.equal(await parisPath.getAttribute('fill'), parisColor);
  const datePattern = /\p{L}{3,}\.?\s+\d{4}/u;
  const referenceMonth = nationalSnapshot.match(datePattern)?.[0];
  assert.ok(referenceMonth, nationalSnapshot);
  assert.ok((await page.locator('#trarDepartmentContext').innerText()).includes(referenceMonth));

  await department.selectOption({ index: 0 });
  await detail.waitFor({ state: 'hidden' });
  if (touch) await parisPath.tap();
  else await parisPath.press('Space');
  await detail.waitFor({ state: 'visible' });
  assert.equal(await department.inputValue(), '75');
  await selectDetailScope(page, 'Mayotte');
  await detail.waitFor({ state: 'hidden' });
  assert.equal(await department.inputValue(), '');
  assert.match(await map.locator('[data-code="976"]').getAttribute('aria-label'), /indisponible/i);
  assert.equal(await page.locator('#trarChartSvg .quarterly-series').count(), 3);
}

async function checkEmploymentTooltips(page, touch) {
  const tile = page.locator('#employmentTreemapSvg .employment-treemap-tile').first();
  const treemapTooltip = page.locator('#employmentTreemapTooltip[aria-hidden="false"]');
  if (touch) await tile.tap();
  else await tile.focus();
  await treemapTooltip.waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await treemapTooltip.waitFor({ state: 'hidden' });

  await selectDetailScope(page, 'Île-de-France');
  for (const id of ['employmentDeptMapSvg', 'autoMapSvg']) {
    const marks = page.locator(`#${id} .path-department`);
    const mark = touch ? marks.first() : page.locator(`#${id} .path-department[tabindex="0"]`);
    if (touch) await mark.tap();
    else await mark.focus();
    await page.locator('#tooltip.is-visible').waitFor({ state: 'visible' });
    if (!touch) {
      const focused = await mark.getAttribute('aria-label');
      await page.keyboard.press('ArrowRight');
      assert.notEqual(await page.locator(`#${id} .path-department:focus`).getAttribute('aria-label'), focused);
    }
    await page.keyboard.press('Escape');
    await page.locator('#tooltip.is-visible').waitFor({ state: 'hidden' });
  }
}

async function checkPair(browser, transport, viewport, filename, origin) {
  const touch = viewport.width < 600;
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', locale: 'fr-FR', hasTouch: touch });
  // Avoid network-dependent font races; both pages use the same system fallback.
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
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
      for (const target of ['barometre_bref.html', 'barometre_emploi.html', 'barometre_entreprises.html']) {
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
    const employment = filename === 'barometre_emploi.html';
    const heroKeys = employment ? ['headcount', 'payroll', 'auto'] : ['pcol', 'jobs', 'dpae', 'delai'];
    for (const page of pair) {
      assert.equal(await page.locator('#stageShell').getAttribute('data-phase'), 'landing');
      assert.equal(await page.locator('#story').isVisible(), false);
      assert.equal(await page.locator('.chapter-section').count(), 1);
      assert.equal(await page.locator(employment ? '#module-payroll' : '#module-sector').count(), 0);
      assert.deepEqual(await page.locator('#heroKpis .kpi-card').evaluateAll(cards => cards.map(card => card.dataset.indicator)), heroKeys);
    }
    for (const region of ['France entière', 'Île-de-France', 'Nouvelle-Aquitaine', 'La Réunion', 'Mayotte']) {
      await forBoth(pair, async page => {
        await page.locator('#geoTrigger').click();
        await page.locator('#geoMenu button[role="option"]').filter({ hasText: region }).click();
        await page.waitForFunction(() => document.querySelector('body').dataset.topic === 'emploi' ? document.querySelector('#autoMetricSwitch button') : document.querySelector('#dpaeModeSwitch button'));
      });
      for (const page of pair) {
        assert.equal(await page.locator('#heroTitle').innerText(), region);
        if (region === 'Mayotte' && employment) {
          assert.equal(await page.locator('#employmentEffectifsCurrentLevel').innerText(), '—');
          assert.match(await page.locator('#employmentEffectifsChartSvg').textContent(), /Données indisponibles/);
        }
        if (region === 'Mayotte' && !employment) {
          assert.equal(await page.locator('[data-indicator="pcol"] strong').innerText(), '—');
          assert.notEqual(await page.locator('[data-indicator="delai"] strong').innerText(), '—');
          assert.match(await page.locator('#heroLead').innerText(), /Certains indicateurs/);
        }
      }
      await snapshot(pair, `${label}-${region.replace(/[^\p{L}]/gu, '_')}`);
      await forBoth(pair, async page => {
        await page.locator(employment ? '#module-sector' : '#module-payroll').scrollIntoViewIfNeeded();
        assert.equal(await page.locator('#subjectNav, .chapter-tab, .chapter-subnav').count(), 0);
      });
      await snapshot(pair, `${label}-${region}-chapter`);
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
      await page.waitForFunction(() => document.querySelector('body').dataset.topic === 'emploi' ? document.querySelector('#autoMetricSwitch button') : document.querySelector('#dpaeModeSwitch button'));
    });
    const heroesBeforeFilters = await Promise.all(pair.map(page => page.locator('#heroKpis').innerText()));
    // Every option of each metric switch; compare each resulting visible value.
    for (const id of (filename === 'barometre_emploi.html'
      ? ['employmentTreemapMetricSwitch', 'employmentDeptMetricSwitch', 'autoMetricSwitch']
      : ['dpaeModeSwitch', 'pcolModeSwitch', 'delaiModeSwitch'])) {
      const count = await pair[0].locator(`#${id} button`).count();
      assert.ok(count > 0, `Filtres absents: ${id}`);
      for (let i = 0; i < count; i++) {
        await forBoth(pair, page => page.locator(`#${id} button`).nth(i).click({ force: true }));
        await snapshot(pair, `${label}-${id}-${i}`);
      }
    }
    for (const id of (filename === 'barometre_emploi.html'
      ? ['employmentEffectifsSeriesPicker', 'employmentPayrollSeriesPicker', 'employmentDeptSectorPicker', 'autoSectorPicker']
      : ['pcolSectorPicker', 'delaiSectorPicker'])) {
      await forBoth(pair, async page => {
        await page.locator(`#${id} .employment-sector-trigger`).click({ force: true });
        const options = page.locator(`#${id} button[role="option"]`);
        assert.ok(await options.count() > 1, `Secteurs absents: ${id}`);
        await options.nth(1).click({ force: true });
      });
      await snapshot(pair, `${label}-${id}`);
    }
    for (let i = 0; i < pair.length; i++) {
      assert.equal(await pair[i].locator('#heroKpis').innerText(), heroesBeforeFilters[i], 'Local filters must not change the overview');
      const trigger = pair[i].locator(employment ? '#employmentEffectifsSeriesPicker .employment-sector-trigger' : '#pcolSectorPicker .employment-sector-trigger');
      await trigger.focus();
      await trigger.press('ArrowDown');
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      await pair[i].waitForFunction(() => document.activeElement?.getAttribute('role') === 'option');
      await pair[i].keyboard.press('Escape');
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      assert.ok(await trigger.evaluate(node => node === document.activeElement));
    }
    await forBoth(pair, async page => {
      await page.locator(filename === 'barometre_emploi.html' ? '#employmentEffectifsChartSvg' : '#pcolChartSvg').scrollIntoViewIfNeeded();
    });
    await snapshot(pair, `${label}-chart`, true, employment ? '#employmentEffectifsChartSvg' : '#pcolChartSvg');
    if (!employment) await snapshot(pair, `${label}-trar-treemap`, true, '#trarTreemapSvg');
    await forBoth(pair, page => employment ? checkEmploymentTooltips(page, touch) : checkTrar(page, touch));
    await snapshot(pair, `${label}-${employment ? 'infobulles' : 'trar'}`);
    if (transport === 'http') {
      // The employment department map requires a selected region. Select a
      // populated region before cropping the two department maps.
      await forBoth(pair, async page => {
        await page.locator('#geoTrigger').click({ force: true });
        await page.locator('#geoMenu button[role="option"]').filter({ hasText: 'Île-de-France' }).click({ force: true });
      });
      for (const id of (filename === 'barometre_emploi.html'
        ? ['employmentPayrollChartSvg', 'employmentTreemapSvg', 'employmentDeptMapSvg', 'autoMapSvg']
        : ['dpaeChartSvg', 'pcolChartSvg', 'delaiChartSvg', 'trarChartSvg', 'trarMapSvg'])) {
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
    args: ['--force-color-profile=srgb', '--disable-gpu', '--disable-lcd-text'] });
  try {
    const transports = option('--transports')?.split(',') || ['file', 'http'];
    const filenames = option('--files')?.split(',') || ['index.html', 'barometre_bref.html', 'barometre_emploi.html', 'barometre_entreprises.html'];
    assert.ok(transports.every(value => ['file', 'http'].includes(value)));
    assert.ok(filenames.every(value => ['index.html', 'barometre_bref.html', 'barometre_emploi.html', 'barometre_entreprises.html'].includes(value)));
    const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }]
      .filter(viewport => !option('--viewports') || option('--viewports').split(',').includes(String(viewport.width)));
    assert.ok(viewports.length, 'Une largeur de vérification connue est requise.');
    for (const transport of transports) {
      for (const viewport of viewports) {
        for (const filename of filenames) {
          await checkPair(browser, transport, viewport, filename, origin);
        }
      }
    }
    fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify({ browser: browser.version(),
      capturedAt: new Date().toISOString(), reference, published, fingerprints,
      transports, filenames, viewports: viewports.map(viewport => viewport.width), contractChecks, results }, null, 2));
    console.log(`${results.length} comparaisons visuelles conformes (tolérance limitée à l’anticrénelage) ; ${contractChecks} contrats DOM/SVG ; transports ${transports.join(', ')}.`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
