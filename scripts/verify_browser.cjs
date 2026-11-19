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
const pages = ['index.html', 'barometre_bref.html', 'barometre_emploi.html', 'barometre_entreprises.html', 'barometre_chiffres.html'];
const detailTopics = ['emploi', 'entreprises', 'chiffres'];
const monthlyIndicators = [
  { key: 'payrollEarly', title: 'Masse salariale', period: 'juin 2026', value: /65,8 milliards d’euros/ },
  { key: 'trar90', title: 'Taux de reste à recouvrer à 90 jours', period: 'juillet 2026', value: /0,94\s+%/ },
  { key: 'dpae', title: 'Déclarations préalables à l’embauche', period: 'septembre 2026', value: /669\s+517\s+déclarations/ },
];
const fingerprint = directory => Object.fromEntries(['site_manifest.json', ...pages, 'assets/js/brief.js',
  ...detailTopics.flatMap(topic => [`assets/js/${topic}.js`, `assets/js/${topic}-data.js`])]
  .filter(filename => fs.existsSync(path.join(directory, filename)))
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
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.json': 'application/json' };
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
      if (video.readyState > 0 && video.currentTime !== 0) {
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
const tooltipSelector = '#tooltip, .employment-tooltip';
async function snapshot(pair, label, screenshot = false, screenshotTarget = null) {
  for (const page of pair) await settle(page);
  // Les infobulles sont vérifiées pendant les interactions qui les ouvrent.
  const text = await Promise.all(pair.map(page => page.locator('body').evaluate((body, selector) => {
    const tooltips = [...body.querySelectorAll(selector)].map(node => [node, node.style.display]);
    tooltips.forEach(([node]) => { node.style.display = 'none'; });
    const content = body.innerText;
    tooltips.forEach(([node, display]) => { node.style.display = display; });
    return content;
  }, tooltipSelector)));
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
      'employmentDeptMapSvg', 'employmentDeptTreemapSvg', 'employmentDeptDepartmentChartSvg', 'employmentDeptDepartmentKpis',
      'employmentDeptHistoryPeriod', 'autoMapSvg', 'autoTreemapSvg', 'autoDepartmentChartSvg', 'autoDepartmentKpis', 'autoHistoryPeriod',
      'dpaeChartSvg', 'pcolChartSvg', 'delaiChartSvg', 'employmentEffectifsTopSectorsTable', 'employmentPayrollTopSectorsTable',
      'dpaeContractsTable', 'pcolTopSectorsTable', 'delaiTopSectorsTable', 'dpaeModeSwitch', 'pcolModeSwitch', 'delaiModeSwitch',
      'employmentTreemapMetricSwitch', 'employmentDeptMetricSwitch', 'autoMetricSwitch',
      'employmentEffectifsSeriesPicker', 'employmentPayrollSeriesPicker', 'employmentDeptSectorPicker',
      'autoSectorPicker', 'pcolSectorPicker', 'delaiSectorPicker', 'trarChartSvg', 'trarLatest',
      'trarSectorPicker', 'trarMainHorizonSwitch', 'trarTopSectorsTable', 'trarTopSectorsMeta',
      'trarHorizonSwitch', 'trarDepartmentSectorPicker', 'trarTreemapSvg',
      'trarMapSvg', 'trarHistoryPeriod', 'trarDepartmentKpis', 'trarDepartmentChartSvg', 'indicateur-payroll',
      'indicateur-headcount', 'indicateur-dpae', 'indicateur-pcol', 'indicateur-payrollEarly', 'indicateur-trar90',
      'chiffresPayrollChartSvg', 'chiffresPayrollCurrentLevel', 'chiffresPayrollCurrentYoY', 'chiffresPayrollCurrentMoM',
      'chiffresPayrollRanking',
      'chiffresDpaeChartSvg', 'chiffresDpaeCurrentLevel', 'chiffresDpaeCurrentYoY', 'chiffresDpaeCurrentMoM',
      'chiffresDpaeModeSwitch', 'chiffresDpaeContractsTable'];
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
        animations: 'disabled', style: `${tooltipSelector} { display: none !important; }` }));
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
  await detailScopeOption(page, label).click();
  await page.waitForFunction(name => document.getElementById('heroTitle').textContent === name, label);
}

function detailScopeOption(page, label) {
  return page.locator('#geoMenu button[role="option"]:not([data-historical-territory])').filter({ hasText: label });
}

async function checkMonthlyCards(page, scope) {
  const container = '#indicators';
  const cards = page.locator(container).locator('article.indicator');
  await cards.last().waitFor({ state: 'visible' });
  assert.deepEqual(await cards.evaluateAll(nodes => nodes.map(node => node.dataset.indicator)),
    monthlyIndicators.map(({ key }) => key));
  assert.deepEqual(await cards.locator('h3').allTextContents(), monthlyIndicators.map(({ title }) => title));

  if (scope === 'national') {
    for (const { key, period, value } of monthlyIndicators) {
      const card = page.locator(`${container} [data-indicator="${key}"]`);
      assert.match(await card.locator('.indicator-value').innerText(), value);
      assert.equal(await card.locator('.indicator-period').innerText(), period);
    }
    const arrears = page.locator(`${container} [data-indicator="trar90"]`);
    assert.match(await arrears.locator('.indicator-change').innerText(), /Baisse de 0,03\s+point sur un an/);
    const payroll = page.locator(`${container} [data-indicator="payrollEarly"]`);
    const dpae = page.locator(`${container} [data-indicator="dpae"]`);
    assert.equal(await payroll.locator('.coverage-note').count(), 0);
    assert.equal(await dpae.locator('.chart-note').textContent(), 'Niveau · milliers de déclarations.');
    assert.match(await payroll.locator('.chart-note').textContent(), /L’axe vertical est ajusté/);
    assert.equal((await page.locator('.site-footer').innerText()).trim(), 'Accueil');
  } else if (scope === 'mayotte') {
    const values = await cards.locator('.indicator-value').allTextContents();
    assert.equal(values[0], 'Données indisponibles');
    assert.match(values[1], /25,28\s+%/);
    assert.equal(values[2], 'Données indisponibles');
  } else {
    const dpae = page.locator(`${container} [data-indicator="dpae"]`);
    assert.equal(await dpae.locator('.indicator-period').innerText(), 'mai 2026');
  }
}

const monthlyDetails = {
  'France entière': {
    payroll: { level: /65,8\s+Md€/, period: '2026-06-01', yoy: /\+1,8\s*%/, mom: /\+8,0\s*%/ },
    dpae: { level: /669\s+517/, period: '2026-09-01', yoy: /[−-]2,5\s*%/, mom: /[−-]1,1\s*%/ },
    arrears: /0,94\s*%/,
  },
  'Île-de-France': {
    payroll: { level: /21,5\s+Md€/, period: '2026-06-01', yoy: /\+1,8\s*%/, mom: /\+8,2\s*%/ },
    dpae: { level: /181\s+989/, period: '2026-05-01', yoy: /[−-]6,5\s*%/, mom: /[−-]3,1\s*%/ },
    arrears: /0,87\s*%/,
  },
  'Mayotte': { arrears: /25,28\s*%/ },
};

async function checkMonthlyPayrollRanking(page, region) {
  await page.waitForFunction(label => document.getElementById('chiffresPayrollScope')?.textContent.includes(label), region);
  const ranking = page.locator('#chiffresPayrollRanking');
  await ranking.waitFor({ state: 'visible' });
  assert.equal(await page.locator('#chiffresPayrollRankingPeriod').getAttribute('datetime'), '2026-06-01');
  const table = ranking.locator('#chiffresPayrollRankingTable');
  assert.deepEqual((await table.locator('thead th').allTextContents()).map(text => text.trim()),
    ['#', 'Région', 'Masse', 'Part nationale']);
  const rows = table.locator('tbody tr');
  const values = await rows.evaluateAll(nodes => nodes.map(row => [...row.cells].map(cell => cell.textContent.trim())));
  assert.equal(values.length, 17);
  assert.deepEqual(values.map(row => Number(row[0])), Array.from({ length: 17 }, (_, index) => index + 1));
  assert.ok(values.every(row => /^\d+,\d{2}\s+%$/.test(row[3])));
  const shares = values.map(row => Number.parseFloat(row[3].replace(',', '.')));
  assert.deepEqual(shares, [...shares].sort((first, second) => second - first));
  assert.ok(Math.abs(shares.reduce((sum, value) => sum + value, 0) - 100) < 0.1);
  assert.equal(values[0][1], 'Île-de-France');
  assert.match(values[0][3], /^32,75\s+%$/);
  assert.equal(values[7][1], 'Pays de la Loire');
  assert.match(values[7][3], /^5,27\s+%$/);
  const layout = await table.evaluate(wrapper => {
    const bounds = wrapper.getBoundingClientRect();
    const header = wrapper.querySelector('thead').getBoundingClientRect();
    const active = wrapper.querySelector('.is-active')?.getBoundingClientRect();
    return {
      horizontalOverflow: wrapper.scrollWidth - wrapper.clientWidth,
      activeVisible: active && active.top >= header.bottom - 1 && active.bottom <= bounds.bottom + 1,
    };
  });
  assert.equal(layout.horizontalOverflow, 0, `${region}: débordement horizontal du classement`);
  const active = table.locator('tbody tr.is-active');
  if (region === 'France entière' || region === 'Mayotte') {
    assert.equal(await active.count(), 0);
  } else {
    assert.equal(await active.count(), 1);
    assert.equal((await active.locator('td, th').nth(1).textContent()).trim(), region);
    assert.equal(layout.activeVisible, true, `${region}: ligne active tronquée dans le classement`);
  }
  const coverage = page.locator('#chiffresPayrollCoverage');
  assert.equal(await coverage.isVisible(), true);
  assert.match(await coverage.innerText(), /hors Mayotte/i);
}

async function checkMonthlyDetail(page, region, touch) {
  await page.waitForFunction(label => document.getElementById('chiffresPayrollScope')?.textContent.includes(label), region);
  const expected = monthlyDetails[region];
  for (const [key, name] of [['payroll', 'Payroll'], ['dpae', 'Dpae']]) {
    const prefix = `#chiffres${name}`;
    const chart = page.locator(`${prefix}ChartSvg`);
    await chart.waitFor({ state: 'visible' });
    assert.ok((await page.locator(`${prefix}Title`).textContent()).includes(region));
    assert.ok((await page.locator(`${prefix}Scope`).textContent()).includes(region));
    const level = await page.locator(`${prefix}CurrentLevel`).textContent();
    const period = await page.locator(`${prefix}Period`).getAttribute('datetime');
    const annual = await page.locator(`${prefix}CurrentYoY`).getAttribute('aria-label');
    const monthly = await page.locator(`${prefix}CurrentMoM`).getAttribute('aria-label');
    if (expected[key]) {
      assert.match(level, expected[key].level);
      assert.equal(period, expected[key].period);
      assert.match(annual, expected[key].yoy);
      assert.match(monthly, expected[key].mom);
      assert.ok(await chart.locator('.tick').count() > 0);
    } else {
      assert.equal(level, '—');
      assert.equal(period, null);
      assert.equal(annual, '—');
      assert.equal(monthly, '—');
      assert.match(await chart.textContent(), /données indisponibles|aucune donnée disponible/i);
    }
  }
  assert.equal(await page.locator('#trarDashboardPeriod').getAttribute('datetime'), '2026-07-01');
  assert.match(await page.locator('#trarLatest .delai-level-value').innerText(), expected.arrears);
  assert.equal(await page.locator('#trarTitle').innerText(), 'Taux de reste à recouvrer à 90 jours');
  assert.match(await page.locator('#trarChartScope').innerText(), /90 jours après l’échéance/);
  assert.equal(await page.locator('#trarMainHorizonSwitch, #trarHorizonSwitch').locator('button:visible').count(), 0);
  await checkMonthlyPayrollRanking(page, region);

  const controls = page.locator('#chiffresDpaeModeSwitch button');
  const rows = page.locator('#chiffresDpaeContractsTable tbody tr');
  if (region === 'Mayotte') {
    assert.equal(await page.locator('#chiffresDpaeModeSwitch button:visible').count(), 0);
    assert.equal(await page.locator('#chiffresDpaeContractsTable tbody tr:visible').count(), 0);
    return;
  }
  assert.deepEqual(await controls.allTextContents(), ['CDI et CDD longs', 'CDI', 'CDD de plus d’un mois']);
  assert.equal(await controls.first().getAttribute('aria-pressed'), 'true');
  assert.equal(await rows.count(), 2);
  assert.equal(await page.locator('#chiffresPayrollChartSvg .employment-level-line').count(), 1);
  assert.ok(await page.locator('#chiffresPayrollChartSvg .employment-yoy-bar').count() > 1);
  assert.match(await page.locator('#chiffresDpaeCoverageNote').textContent(),
    region === 'France entière' ? /variations saisonnières \(CVS\)/ : /Traitement saisonnier non renseigné/i);

  if (region !== 'France entière') return;
  assert.match(await page.locator('#module-chiffres').textContent(), /Masse salariale mensuelle brute/);
  if (!touch) {
    const point = page.locator('#chiffresPayrollChartSvg .employment-point-hit[tabindex="0"]').first();
    await point.focus();
    const tooltip = page.locator('#chiffresPayrollTooltip[aria-hidden="false"]');
    await tooltip.waitFor({ state: 'visible' });
    await page.keyboard.press('End');
    const latest = page.locator('#chiffresPayrollChartSvg .employment-point-hit:focus');
    assert.match(await latest.getAttribute('aria-label'), /juin 2026.*65,8\s+Md€/);
    await tooltip.waitFor({ state: 'visible' });
    assert.match(await tooltip.innerText(), /Glissement annuel/);
    await page.keyboard.press('Escape');
    await tooltip.waitFor({ state: 'hidden' });
  }

  const hero = await page.locator('#heroKpis').innerText();
  const cdi = controls.filter({ hasText: /^CDI$/ });
  if (touch) await cdi.tap();
  else await cdi.press('Space');
  assert.equal(await cdi.getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#chiffresDpaeCurrentLevel').textContent(), /345\s+533/);
  assert.equal(await page.locator('#chiffresDpaeChartSvg .quarterly-series[data-metric="cdi"]').count(), 1);
  assert.equal(await page.locator('#chiffresDpaeChartSvg .quarterly-series[data-metric="value"]').count(), 1);
  if (!touch) {
    await page.locator('#chiffresDpaeChartSvg .quarterly-overlay').hover();
    const tooltip = page.locator('#chiffresDpaeTooltip[aria-hidden="false"]');
    await tooltip.waitFor({ state: 'visible' });
    assert.match(await tooltip.innerText(), /CDI et CDD de plus d’un mois/);
    await page.mouse.move(0, 0);
  }
  const cdd = controls.filter({ hasText: /^CDD de plus/ });
  await rows.locator('.sector-ranking-link').filter({ hasText: /^CDD de plus/ }).click();
  assert.equal(await cdd.getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#chiffresDpaeCurrentLevel').textContent(), /323\s+985/);
  await controls.first().click();
  assert.match(await page.locator('#chiffresDpaeCurrentLevel').textContent(), expected.dpae.level);
  assert.equal(await page.locator('#heroKpis').innerText(), hero);
}

function trarPickerOption(picker, key) {
  return picker.locator(`[role="option"][data-sector-key="${key}"]`);
}

async function assertTrarPeriod(page, full) {
  const active = page.locator('#trarHistoryPeriod');
  assert.match(await active.innerText(), full ? /Série complète/ : /3 dernières années/);
  const dates = await page.locator('#trarDepartmentChartSvg .tick')
    .evaluateAll(nodes => nodes.map(node => node.__data__).filter(date => /^\d{4}-\d{2}-01$/.test(date)));
  assert.ok(dates.length > 1, 'L’historique doit afficher des périodes mensuelles.');
  if (!full) {
    const month = date => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
    assert.equal(month(dates.at(-1)) - month(dates[0]), 35);
  }
  return dates[0];
}

async function checkTrarRanking(page, touch, fixedHorizon) {
  const latest = page.locator('#trarLatest');
  const horizons = page.locator('#trarMainHorizonSwitch button');
  const sector = page.locator('#trarSectorPicker');
  const rows = page.locator('#trarTopSectorsTable tbody tr');
  const rankingDate = page.locator('#trarTopSectorsMeta');
  assert.equal(await latest.getByText('Gliss. annuel', { exact: true }).count(), 1);
  assert.equal(await latest.getByText('Gliss. mensuel', { exact: true }).count(), 1);
  assert.match(await latest.innerText(), /\bpt\b/u);
  assert.equal(await horizons.count(), fixedHorizon ? 0 : 3);
  if (!fixedHorizon) assert.equal(await horizons.first().getAttribute('aria-pressed'), 'true');

  const departmentContext = await page.locator('#trarDepartmentContext').innerText();
  const advertisedHorizons = fixedHorizon ? [null] : [2, 1, 0].map(index => horizons.nth(index));
  for (const horizon of advertisedHorizons) {
    if (horizon) {
      await horizon.click();
      assert.equal(await horizon.getAttribute('aria-pressed'), 'true');
    }
    assert.equal(await page.locator('#trarChartSvg .quarterly-series').count(), 1);
    assert.equal(await page.locator('#trarChartSvg .trar-reference-series').count(), 0);
    assert.equal(await rankingDate.getAttribute('datetime'), await latest.locator('time[datetime]').getAttribute('datetime'));
    assert.equal(await rows.count(), 5);
    const rates = (await rows.locator('.delai-td-mt').allTextContents()).map(value =>
      Number.parseFloat(value.replace(/\s/g, '').replace('−', '-').replace(',', '.')));
    assert.ok(rates.every(Number.isFinite));
    assert.deepEqual(rates, [...rates].sort((left, right) => right - left));
  }
  assert.equal(await page.locator('#trarDepartmentContext').innerText(), departmentContext);

  const trigger = sector.locator('.employment-sector-trigger');
  await trigger.click();
  const nationalOption = trarPickerOption(sector, '01');
  const search = sector.locator('input[type="search"]');
  await search.fill('culture et production animale');
  assert.match(await nationalOption.innerText(), /Culture et production animale/);
  assert.match(await nationalOption.locator('.picker-rate-pill').innerText(), /%/);
  assert.equal(await trarPickerOption(sector, '02').isVisible(), false);
  await nationalOption.click();
  assert.equal(await nationalOption.getAttribute('aria-selected'), 'true');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#trarChartSvg .quarterly-series').count(), 1);
  assert.equal(await page.locator('#trarChartSvg .trar-reference-series').count(), 1);
  assert.match(await latest.locator('.trar-benchmark-gap').innerText(), /Tous secteurs.*pt/s);

  const leader = rows.locator('.sector-ranking-link').first();
  const label = await leader.getAttribute('title');
  if (touch) await leader.tap();
  else await leader.press('Enter');
  assert.ok((await trigger.innerText()).includes(label));
  assert.equal(await leader.getAttribute('aria-pressed'), 'true');
  if (!fixedHorizon) assert.equal(await horizons.first().getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#trarDepartmentContext').innerText(), departmentContext);
}

async function checkTrar(page, touch, fixedHorizon = false) {
  const module = page.locator('#module-trar');
  const sector = page.locator('#trarSectorPicker');
  const departmentSector = page.locator('#trarDepartmentSectorPicker');
  const departmentHorizon = page.locator('#trarHorizonSwitch button');
  const legend = page.locator('#trarSnapshotLegend');
  const treemap = page.locator('#trarTreemapSvg');
  const map = page.locator('#trarMapSvg');
  const history = page.locator('#trarDepartmentDetail');
  const historyTitle = page.locator('#trarDepartmentChartTitle');
  const historyChart = page.locator('#trarDepartmentChartSvg');
  const period = page.locator('#trarHistoryPeriod');
  await treemap.waitFor({ state: 'visible' });
  assert.equal(await module.locator('#trarRankingHorizon, #trarColorSwitch, #trarDepartmentSelect, .trar-horizon-badge').count(), 0);
  assert.equal(await treemap.locator('[data-code]').count(), 101);
  assert.equal(await treemap.locator('[aria-pressed="true"]').count(), 1);
  assert.equal(await page.locator('#trarLatest time[datetime]').count(), 1);
  assert.match(await legend.innerText(), /%/);
  assert.match(await treemap.locator('[data-code="976"]').getAttribute('aria-label'), /indisponible/i);

  await checkTrarRanking(page, touch, fixedHorizon);
  const mainLines = page.locator('#trarChartSvg :is(.quarterly-series, .trar-reference-series)');
  const mainChart = await mainLines.evaluateAll(lines => lines.map(line => line.getAttribute('d')));
  const mainRate = await page.locator('#trarLatest .delai-level-value').innerText();
  await departmentSector.locator('.employment-sector-trigger').click();
  const btpOption = trarPickerOption(departmentSector, 'btp');
  await btpOption.click();
  assert.equal(await btpOption.getAttribute('aria-selected'), 'true');
  if (!fixedHorizon) {
    await departmentHorizon.last().click();
    assert.equal(await departmentHorizon.last().getAttribute('aria-pressed'), 'true');
  }
  const parisTile = treemap.locator('[data-code="75"]');
  assert.match(await parisTile.getAttribute('aria-label'), /Paris.*\d.*%/);
  if (touch) await parisTile.tap();
  else {
    await parisTile.press('Enter');
    assert.ok(await parisTile.evaluate(node => node === document.activeElement));
  }
  await history.waitFor({ state: 'visible' });
  assert.equal(await parisTile.getAttribute('aria-pressed'), 'true');
  assert.equal(await parisTile.evaluate(node => getComputedStyle(node).outlineStyle), 'none');
  assert.match(await historyTitle.innerText(), /Paris/);
  assert.equal(await historyChart.locator('.quarterly-series').count(), 1);
  assert.equal(await historyChart.locator('.trar-reference-series').count(), 1);

  const recentStart = await assertTrarPeriod(page, false);
  const departmentContext = await page.locator('#trarDepartmentContext').innerText();
  const kpis = await page.locator('#trarDepartmentKpis').innerText();
  if (touch) await period.tap();
  else {
    await period.press('Space');
    assert.ok(await period.evaluate(node => node === document.activeElement));
  }
  const fullStart = await assertTrarPeriod(page, true);
  assert.ok(fullStart < recentStart, 'La série complète doit remonter au-delà de la période récente.');
  assert.equal(await page.locator('#trarDepartmentKpis').innerText(), kpis);
  assert.equal(await page.locator('#trarDepartmentContext').innerText(), departmentContext);
  assert.equal(await parisTile.getAttribute('aria-pressed'), 'true');
  await period.click();
  assert.equal(await assertTrarPeriod(page, false), recentStart);
  assert.deepEqual(await mainLines.evaluateAll(lines => lines.map(line => line.getAttribute('d'))), mainChart);
  assert.equal(await page.locator('#trarLatest .delai-level-value').innerText(), mainRate);

  if (!touch) {
    await historyChart.locator('rect[pointer-events="all"]').hover();
    const tooltip = page.locator('#trarDepartmentChartTooltip[aria-hidden="false"]');
    await tooltip.waitFor({ state: 'visible' });
    assert.match(await tooltip.innerText(), /Écart annuel.*pt/s);
    assert.match(await tooltip.innerText(), /France entière|Moyenne nationale/);
    await page.mouse.move(0, 0);
  }

  await selectDetailScope(page, 'Île-de-France');
  await map.waitFor({ state: 'visible' });
  assert.equal(await treemap.isVisible(), false);
  assert.equal(await map.locator('[data-code]').count(), 8);
  assert.equal(await trarPickerOption(sector, 'tous-secteurs').getAttribute('aria-selected'), 'true');
  assert.equal(await trarPickerOption(sector, '01').count(), 0);
  assert.equal(await btpOption.getAttribute('aria-selected'), 'true');
  if (fixedHorizon) assert.equal(await departmentHorizon.count(), 0);
  else assert.equal(await departmentHorizon.last().getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#trarChartLegend').innerText(), /France entière/);
  assert.match(await page.locator('#trarDepartmentChartLegend').innerText(), /Île-de-France/);
  const parisPath = map.locator('[data-code="75"]');
  if (touch) await parisPath.tap();
  else {
    await parisPath.focus();
    await page.keyboard.press('Home');
    const firstDepartment = await map.locator('[data-code]:focus').getAttribute('data-code');
    await page.keyboard.press('ArrowRight');
    assert.notEqual(await map.locator('[data-code]:focus').getAttribute('data-code'), firstDepartment);
    await parisPath.press('Space');
    assert.ok(await parisPath.evaluate(node => node === document.activeElement));
    const yvelines = map.locator('[data-code="78"]');
    await yvelines.click();
    assert.equal(await yvelines.getAttribute('aria-pressed'), 'true');
    assert.equal(await yvelines.evaluate(node => getComputedStyle(node).outlineStyle), 'none');
    await parisPath.press('Space');
  }
  assert.equal(await parisPath.getAttribute('aria-pressed'), 'true');
  assert.equal(await parisPath.evaluate(node => getComputedStyle(node).outlineStyle), 'none');
  assert.match(await historyTitle.innerText(), /Paris/);

  await selectDetailScope(page, 'Mayotte');
  assert.match(await map.locator('[data-code="976"]').getAttribute('aria-label'), /indisponible/i);
  assert.equal(await map.locator('[aria-pressed="true"]').count(), 0);
  assert.equal(await historyChart.locator('.quarterly-series:visible').count(), 0);
}

async function checkEmploymentTooltips(page, touch) {
  const tile = page.locator('#employmentTreemapSvg .employment-treemap-tile').first();
  const treemapTooltip = page.locator('#employmentTreemapTooltip[aria-hidden="false"]');
  if (touch) await tile.tap();
  else await tile.focus();
  await treemapTooltip.waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await treemapTooltip.waitFor({ state: 'hidden' });
}

async function checkEmploymentDepartments(page, touch) {
  const prefixes = ['employmentDept', 'auto'];
  const tooltip = page.locator('#tooltip.is-visible');
  for (const prefix of prefixes) {
    const picker = page.locator(`#${prefix}SectorPicker`);
    await picker.locator('.employment-sector-trigger').click();
    await picker.getByRole('option', { name: /Population entière/ }).click();
    await page.locator(`#${prefix}MetricSwitch button`).first().click();
    const treemap = page.locator(`#${prefix}TreemapSvg`);
    await treemap.waitFor({ state: 'visible' });
    assert.equal(await treemap.locator('.trar-department-tile[role="button"]').count(), 101);
    assert.equal(await treemap.locator('[aria-pressed="true"]').count(), 1);
    const paris = treemap.locator('[data-code="75"]');
    assert.match(await paris.getAttribute('aria-label'), /Paris.*\d/);
    if (touch) await paris.tap();
    else await paris.press('Enter');
    assert.equal(await paris.getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator(`#${prefix}DepartmentChartTitle`).innerText(), /Paris/);
  }
  await selectDetailScope(page, 'Île-de-France');
  for (const prefix of prefixes) {
    const map = page.locator(`#${prefix}MapSvg`);
    const marks = map.locator('.trar-map-department[role="button"]');
    const yvelines = map.locator('.trar-map-department[data-code="78"]');
    const title = page.locator(`#${prefix}DepartmentChartTitle`);
    const context = page.locator(`#${prefix}DepartmentChartContext`);
    const chart = page.locator(`#${prefix}DepartmentChartSvg`);
    const kpis = page.locator(`#${prefix}DepartmentKpis`);
    const period = page.locator(`#${prefix}HistoryPeriod`);
    await map.waitFor({ state: 'visible' });
    assert.equal(await page.locator(`#${prefix}TreemapSvg`).isVisible(), false);
    assert.equal(await marks.count(), 8);
    const mark = map.locator('.trar-map-department[tabindex="0"]');
    if (!touch) {
      await mark.focus();
      await tooltip.waitFor({ state: 'visible' });
      const focused = await mark.getAttribute('aria-label');
      await page.keyboard.press('ArrowRight');
      assert.notEqual(await map.locator('.trar-map-department:focus').getAttribute('aria-label'), focused);
      await page.keyboard.press('Escape');
      await tooltip.waitFor({ state: 'hidden' });
      await yvelines.press('Space');
      assert.ok(await yvelines.evaluate(node => node === document.activeElement));
    } else {
      await yvelines.tap();
    }
    assert.equal(await yvelines.getAttribute('aria-pressed'), 'true');
    assert.equal(await map.locator('.trar-map-department[aria-pressed="true"]').count(), 1);
    assert.match(await title.innerText(), /Yvelines/);
    assert.ok(await kpis.locator('.trar-mini-kpi').count() >= 2);
    assert.equal(await chart.locator('.trar-reference-series').count(), 1);
    assert.match(await page.locator(`#${prefix}DepartmentChartLegend`).innerText(), /Île-de-France/);
    const recentPath = await chart.locator('.quarterly-series').first().getAttribute('d');
    const recentContext = await context.innerText();
    const initialKpis = await kpis.innerText();
    assert.match(await period.innerText(), /3 dernières années/);
    if (touch) await period.tap();
    else await period.press('Space');
    assert.match(await period.innerText(), /Série complète/);
    assert.notEqual(await chart.locator('.quarterly-series').first().getAttribute('d'), recentPath);
    assert.notEqual(await context.innerText(), recentContext);
    assert.equal(await kpis.innerText(), initialKpis);
    assert.equal(await yvelines.getAttribute('aria-pressed'), 'true');
    await period.click();
    assert.equal(await context.innerText(), recentContext);
    if (!touch) {
      await chart.locator('.quarterly-overlay').hover();
      const historyTooltip = page.locator(`#${prefix}DepartmentChartTooltip[aria-hidden="false"]`);
      await historyTooltip.waitFor({ state: 'visible' });
      assert.match(await historyTooltip.innerText(), /Yvelines.*Île-de-France/is);
      await page.mouse.move(0, 0);
    }

    const metric = page.locator(`#${prefix}MetricSwitch button`).last();
    const previousMark = await yvelines.getAttribute('aria-label');
    await metric.click();
    assert.equal(await metric.getAttribute('aria-pressed'), 'true');
    assert.notEqual(await yvelines.getAttribute('aria-label'), previousMark);
    const metricContext = await context.innerText();
    assert.ok(metricContext.includes((await metric.innerText()).trim()));
    const picker = page.locator(`#${prefix}SectorPicker`);
    await picker.locator('.employment-sector-trigger').click();
    const sector = picker.locator('[role="option"][aria-selected="false"]').first();
    const beforeSectorChange = await yvelines.getAttribute('aria-label');
    await sector.click();
    assert.notEqual(await yvelines.getAttribute('aria-label'), beforeSectorChange);
    assert.notEqual(await context.innerText(), metricContext);
  }
  await selectDetailScope(page, 'Mayotte');
  for (const prefix of prefixes) {
    const mayotte = page.locator(`#${prefix}MapSvg [data-code="976"]`);
    assert.match(await mayotte.getAttribute('aria-label'), /indisponible/i);
    assert.equal(await mayotte.getAttribute('aria-disabled'), 'true');
    assert.equal(await mayotte.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator(`#${prefix}DepartmentChartSvg .quarterly-series:visible`).count(), 0);
  }
}

async function checkPair(browser, transport, viewport, filename, origin) {
  const touch = viewport.width < 600;
  const detailTopic = detailTopics.find(topic => filename === `barometre_${topic}.html`);
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
  const errors = []; const fetchRequests = []; const deferredRequests = [];
  let expectedDeferred;
  for (let i = 0; i < pair.length; i++) {
    const page = pair[i];
    page.on('pageerror', error => errors.push(`${i}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`${i}: ${message.text()}`); });
    page.on('request', request => {
      const url = request.url();
      const type = request.resourceType();
      if (['fetch', 'xhr'].includes(type)) fetchRequests.push(url);
      if (i && detailTopic && /\/assets\/js\/[^/]+-data\.js$/.test(new URL(url).pathname)) {
        deferredRequests.push({ url, type });
      }
    });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${i}: HTTP ${response.status()} ${response.url()}`); });
    const directory = i ? published : reference;
    const url = transport === 'file' ? pathToFileURL(path.join(directory, filename)).href
      : origin + '/' + path.relative(root, path.join(directory, filename)).split(path.sep).map(encodeURIComponent).join('/');
    if (i && detailTopic) expectedDeferred = new URL(`assets/js/${detailTopic}-data.js`, url).href;
    await page.goto(url, { waitUntil: 'load' });
    if (detailTopic) await page.locator('#cockpitKpis .kpi-card').first().waitFor({ state: 'visible' });
  }
  const label = `${transport}-${viewport.width}-${filename.replace('.html', '')}`;
  await snapshot(pair, label, true);
  if (filename === 'index.html') {
    for (const page of pair) {
      for (const topic of ['chiffres', 'entreprises', 'emploi']) {
        const card = page.locator(`article.topic[data-topic="${topic}"]`);
        for (const reading of ['bref', 'details']) {
          const target = reading === 'bref' ? 'barometre_bref.html' : `barometre_${topic}.html`;
          await card.locator(`a.${reading}`).click();
          await page.waitForURL(url => url.pathname.endsWith(target));
          const header = page.locator(`.topic-header[data-topic="${topic}"]:visible`);
          await header.waitFor({ state: 'visible' });
          await page.goBack({ waitUntil: 'load' });
        }
      }
    }
  } else if (filename === 'barometre_bref.html') {
    for (const code of ['national', '11', '28', '04', '06']) {
      await forBoth(pair, async page => {
        await page.locator('#regionSelect').selectOption(code);
        await checkMonthlyCards(page, code === '06' ? 'mayotte' : code === 'national' ? code : 'region');
      });
      await snapshot(pair, `${label}-${code}`, code === '06');
      await forBoth(pair, async page => {
        const summaries = page.locator('#indicators details summary');
        for (let i = 0; i < await summaries.count(); i++) await summaries.nth(i).click();
      });
      await snapshot(pair, `${label}-${code}-tables`);
    }
  } else if (filename === 'barometre_chiffres.html') {
    for (const page of pair) {
      assert.deepEqual(await page.locator('#cockpitKpis .kpi-card .label').allTextContents(),
        monthlyIndicators.map(({ title }) => title));
    }
    for (const region of Object.keys(monthlyDetails)) {
      await forBoth(pair, async page => {
        await selectDetailScope(page, region);
        await checkMonthlyDetail(page, region, touch);
      });
      await snapshot(pair, `${label}-${region}`);
      if (transport === 'http' && region === 'France entière') {
        for (const id of ['chiffresPayrollChartSvg', 'trarChartSvg', 'chiffresDpaeChartSvg']) {
          await snapshot(pair, `${label}-${id}-visual`, true, `#${id}`);
        }
      }
      if (transport === 'http' && region === 'Île-de-France') {
        await snapshot(pair, `${label}-trarMapSvg-visual`, true, '#trarMapSvg');
      }
    }
    await forBoth(pair, async page => {
      await selectDetailScope(page, 'Pays de la Loire');
      await checkMonthlyPayrollRanking(page, 'Pays de la Loire');
    });
    await snapshot(pair, `${label}-region-ranking`, transport === 'http', '#chiffresPayrollRanking');
    await forBoth(pair, async page => {
      await selectDetailScope(page, 'France entière');
      await checkTrar(page, touch, true);
    });
    await snapshot(pair, `${label}-trar`);
    await forBoth(pair, async page => {
      await page.locator('#geoTrigger').click();
      await page.locator('.geo-return-button').click();
      await page.waitForFunction(() => document.querySelector('#stageShell').dataset.phase === 'landing');
    });
  } else {
    const employment = filename === 'barometre_emploi.html';
    const heroKeys = employment ? ['headcount', 'payroll', 'auto'] : ['pcol', 'jobs', 'dpae', 'trar90'];
    for (const page of pair) {
      assert.equal(await page.locator('#stageShell').getAttribute('data-phase'), 'landing');
      assert.equal(await page.locator('#story').isVisible(), false);
      assert.equal(await page.locator('.chapter-section').count(), 1);
      assert.equal(await page.locator(employment ? '#module-payroll' : '#module-sector').count(), 0);
      assert.deepEqual(await page.locator('#cockpitKpis .kpi-card').evaluateAll(cards => cards.map(card => card.dataset.indicator)), heroKeys);
    }
    for (const region of ['France entière', 'Île-de-France', 'Nouvelle-Aquitaine', 'La Réunion', 'Mayotte']) {
      await forBoth(pair, async page => {
        await page.locator('#geoTrigger').click();
        await detailScopeOption(page, region).click();
        await page.waitForFunction(() => document.querySelector('body').dataset.topic === 'emploi' ? document.querySelector('#autoMetricSwitch button') : document.querySelector('#dpaeModeSwitch button'));
      });
      for (const page of pair) {
        assert.equal(await page.locator('#heroTitle').innerText(), region);
        if (region === 'Mayotte' && employment) {
          assert.equal(await page.locator('#employmentEffectifsCurrentLevel').innerText(), '—');
          assert.match(await page.locator('#employmentEffectifsChartSvg').textContent(), /Données indisponibles/);
        }
        if (region === 'Mayotte' && !employment) {
          assert.equal(await page.locator('#heroKpis [data-indicator="pcol"] strong').innerText(), '—');
          assert.match(await page.locator('#heroKpis [data-indicator="trar90"] strong').innerText(), /^25,28\s+%$/);
          assert.match(await page.locator('#heroKpis [data-indicator="pcol"] .meta').innerText(), /Donnée indisponible/);
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
          const poster = page.locator('#stagePoster');
          const video = page.locator('#stageVideo');
          if (await poster.count()) {
            await page.waitForFunction(() => document.getElementById('stagePoster').naturalWidth > 0);
            assert.equal(await video.getAttribute('src'), null);
          } else {
            await page.waitForFunction(() => document.getElementById('stageVideo').readyState >= 2);
            assert.equal(await video.evaluate(element => element.error), null);
          }
        });
      }
    }
    // Exercise filters on a populated territory rather than the final empty scope.
    await forBoth(pair, async page => {
      await page.locator('#geoTrigger').click();
      await detailScopeOption(page, 'France entière').click();
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
    if (employment) {
      for (const id of ['employmentDeptTreemapSvg', 'autoTreemapSvg']) {
        await snapshot(pair, `${label}-${id}-visual`, true, `#${id}`);
      }
      await forBoth(pair, async page => {
        await checkEmploymentTooltips(page, touch);
        await checkEmploymentDepartments(page, touch);
      });
    } else {
      await snapshot(pair, `${label}-trar-treemap`, true, '#trarTreemapSvg');
      await forBoth(pair, page => checkTrar(page, touch));
    }
    await snapshot(pair, `${label}-${employment ? 'departements' : 'trar'}`);
    if (transport === 'http') {
      // The employment department map requires a selected region. Select a
      // populated region before cropping the two department maps.
      await forBoth(pair, async page => {
        await page.locator('#geoTrigger').click({ force: true });
        await detailScopeOption(page, 'Île-de-France').click({ force: true });
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
  assert.deepEqual(fetchRequests, [], `Requêtes fetch/XHR: ${label}`);
  if (expectedDeferred) {
    assert.deepEqual(deferredRequests, [{ url: expectedDeferred, type: 'script' }], `Chargement des données: ${label}`);
  }
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
    const filenames = option('--files')?.split(',') || pages;
    assert.ok(transports.every(value => ['file', 'http'].includes(value)));
    assert.ok(filenames.every(value => pages.includes(value)));
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
