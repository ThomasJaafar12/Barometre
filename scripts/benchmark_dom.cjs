/* Paired, browser-side DOM benchmark. Requires Playwright; no arbitrary wait is measured. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const option = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const before = path.resolve(root, option('--before') || '.cache/dom-migration-20261014-before/site');
const after = path.resolve(root, option('--after') || 'dist');
const captureOnly = process.argv.includes('--capture-only');
const coldOnly = process.argv.includes('--cold-only');
const warmOnly = process.argv.includes('--warm-only');
const promiseFitDiagnostic = process.argv.includes('--promise-fit-diagnostic');
const output = path.resolve(root, option('--output') || '.cache/dom-migration-benchmark.json');
const startupCount = Number(option('--startups') || 10);
const interactionCount = Number(option('--interactions') || 30);
const profiles = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, cpu: 1 },
  { name: 'mobile-cpu4', viewport: { width: 390, height: 844 }, cpu: 4 },
];
const selectedProfiles = option('--profiles')
  ? profiles.filter(profile => option('--profiles').split(',').includes(profile.name)) : profiles;
assert.ok(selectedProfiles.length, 'At least one known profile is required');
let diagnosticRewrite;
let diagnosticRoutedResponses = 0;
if (promiseFitDiagnostic) {
  const source = fs.readFileSync(path.join(after, 'assets/js/details.js'), 'utf8');
  const from = 'queueMicrotask(fitCurrentSectorTreemapLabels)';
  const to = 'Promise.resolve().then(fitCurrentSectorTreemapLabels)';
  assert.equal(source.split(from).length - 1, 1, 'Diagnostic must replace exactly one fitter scheduler');
  diagnosticRewrite = { from, to, sourceSha256: createHash('sha256').update(source).digest('hex'),
    servedSha256: createHash('sha256').update(source.replace(from, to)).digest('hex'), body: source.replace(from, to) };
}
const samples = [];
const runnerSha256 = createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const side = url.pathname.split('/')[1];
  const directory = side === 'before' ? before : side === 'after' ? after : undefined;
  const requested = directory && path.resolve(directory, '.' + decodeURIComponent(url.pathname.slice(side.length + 1)));
  if (!requested || !requested.startsWith(directory + path.sep) || !fs.existsSync(requested) || !fs.statSync(requested).isFile()) {
    response.writeHead(404).end(); return;
  }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };
  const bytes = fs.readFileSync(requested);
  response.writeHead(200, { 'Content-Type': types[path.extname(requested)] || 'application/octet-stream', 'Content-Length': bytes.length });
  response.end(bytes);
});

function instrument(options = {}) {
  // Freeze media in the benchmark only. Both versions use the same first frame
  // and never incur an unrelated autoplay/loop while measuring chart updates.
  HTMLMediaElement.prototype.play = function () { this.pause(); return Promise.resolve(); };
  const freezeVideo = video => {
    if (!(video instanceof HTMLVideoElement)) return;
    video.pause();
    if (video.readyState > 0 && video.currentTime !== 0) video.currentTime = 0;
  };
  document.addEventListener('loadeddata', event => freezeVideo(event.target), true);
  document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('video').forEach(freezeVideo), { once: true });
  const registrations = new WeakMap();
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  let totalRegistrations = 0;
  EventTarget.prototype.addEventListener = function (type, handler, options) {
    if (handler) {
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      let entries = registrations.get(this);
      if (!entries) registrations.set(this, entries = []);
      if (!entries.some(entry => entry.type === type && entry.handler === handler && entry.capture === capture)) {
        entries.push({ type, handler, capture }); totalRegistrations++;
      }
    }
    return add.call(this, type, handler, options);
  };
  EventTarget.prototype.removeEventListener = function (type, handler, options) {
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    const entries = registrations.get(this);
    const index = entries?.findIndex(entry => entry.type === type && entry.handler === handler && entry.capture === capture);
    if (index >= 0) entries.splice(index, 1);
    return remove.call(this, type, handler, options);
  };
  const longTasks = [];
  const appendLongTasks = entries => longTasks.push(...entries.map(entry => ({ start: entry.startTime, duration: entry.duration })));
  const longTaskObserver = new PerformanceObserver(list => appendLongTasks(list.getEntries()));
  longTaskObserver.observe({ type: 'longtask', buffered: true });
  const gate = new Promise(resolve => { window.__releaseBenchmarkData = resolve; });
  // Make the first selection genuinely cold: no queued idle preload may start
  // atob, stream decompression, or JSON parsing before the measured action.
  // The application selection itself calls ensureStoryDataReady.
  window.requestIdleCallback = () => 1;
  window.cancelIdleCallback = () => {};
  const responseText = Response.prototype.text;
  Response.prototype.text = async function (...args) { await gate; return responseText.apply(this, args); };
  window.__domBenchmark = {
    frame: () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    counters: () => {
      const nodes = [...document.querySelectorAll('*')];
      return { nodes: nodes.length, listeners: [window, document, ...nodes]
        .reduce((sum, node) => sum + (registrations.get(node)?.length || 0), 0), totalRegistrations };
    },
    longTasks,
    drainLongTasks: () => appendLongTasks(longTaskObserver.takeRecords()),
  };
  if (options.traceRaf) {
    const pending = new Map();
    const request = window.requestAnimationFrame; const cancel = window.cancelAnimationFrame;
    window.requestAnimationFrame = callback => {
      const stack = new Error().stack || '';
      let id;
      id = request.call(window, time => { pending.delete(id); return callback(time); });
      if (stack.includes('/assets/js/details.js')) pending.set(id, { name: callback.name, source: String(callback).slice(0, 240), stack });
      return id;
    };
    window.cancelAnimationFrame = id => { pending.delete(id); return cancel.call(window, id); };
    window.__domBenchmark.pendingFrames = () => [...pending.values()];
  }
}

async function open(browser, profile, side, origin, traceRaf = false) {
  const context = await browser.newContext({ viewport: profile.viewport, reducedMotion: 'reduce', locale: 'fr-FR' });
  if (diagnosticRewrite && side === 'after') await context.route(/\/after\/assets\/js\/details\.js(?:[?#]|$)/,
    route => { diagnosticRoutedResponses++; return route.fulfill({ status: 200,
      contentType: 'application/javascript; charset=utf-8', body: diagnosticRewrite.body }); });
  // Use a fixed system font for all measurements; do not include external network latency.
  await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  await context.addInitScript(instrument, { traceRaf });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const session = await context.newCDPSession(page);
  await session.send('Performance.enable');
  await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  await page.goto(`${origin}/${side}/barometre_details.html`, { waitUntil: 'load' });
  return { context, page, session, errors, profile, side };
}

async function metrics(session) {
  const result = await session.send('Performance.getMetrics');
  return Object.fromEntries(result.metrics.map(entry => [entry.name, entry.value]));
}

async function measure(target, action, iteration, operation) {
  const { page, session, side, profile } = target;
  const startMetrics = await metrics(session);
  let timing;
  if (action.kind === 'viewport') {
    await page.evaluate(() => {
      const records = [];
      const observer = new MutationObserver(entries => records.push(...entries));
      observer.observe(document.getElementById('story'), { childList: true, subtree: true });
      window.__benchmarkResize = { started: performance.now(), records, observer };
    });
    const current = page.viewportSize();
    await page.setViewportSize({ width: current.width === profile.viewport.width ? current.width - 20 : profile.viewport.width,
      height: profile.viewport.height });
    timing = await page.evaluate(async () => {
      // Include responsive handlers, ResizeObserver, and their deferred render.
      await window.__domBenchmark.frame();
      await window.__domBenchmark.frame();
      const completed = performance.now();
      const { started, records, observer } = window.__benchmarkResize;
      records.push(...observer.takeRecords()); observer.disconnect(); delete window.__benchmarkResize;
      window.__domBenchmark.drainLongTasks();
      const tasks = window.__domBenchmark.longTasks.filter(entry => entry.start < completed && entry.start + entry.duration > started);
      return { durationMs: completed - started, addedNodes: records.reduce((sum, record) => sum + record.addedNodes.length, 0),
        removedNodes: records.reduce((sum, record) => sum + record.removedNodes.length, 0), longTasks: tasks.length,
        longTaskMs: tasks.reduce((sum, entry) => sum + entry.duration, 0), ...window.__domBenchmark.counters() };
    });
  } else timing = await page.evaluate(async ({ action }) => {
    const bench = window.__domBenchmark;
    let addedNodes = 0; let removedNodes = 0;
    const countMutations = records => records.forEach(record => {
      addedNodes += record.addedNodes.length; removedNodes += record.removedNodes.length;
    });
    const mutations = new MutationObserver(countMutations);
    mutations.observe(document.getElementById('story'), { childList: true, subtree: true });
    const started = performance.now();
    if (action.kind === 'region') {
      document.querySelector('#geoTrigger').click();
      [...document.querySelectorAll('#geoMenu button[role="option"]')].find(button => button.textContent.includes(action.value)).click();
      window.__releaseBenchmarkData();
      if (!document.querySelector('#dpaeModeSwitch button')) {
        await new Promise(resolve => {
          const observer = new MutationObserver(() => {
            if (document.querySelector('#dpaeModeSwitch button')) { observer.disconnect(); resolve(); }
          });
          observer.observe(document.querySelector('#story'), { childList: true, subtree: true });
        });
      }
    } else if (action.kind === 'switch') {
      const buttons = [...document.querySelectorAll(`#${action.id} button`)];
      buttons.find(button => !button.classList.contains('is-active')).click();
    } else if (action.kind === 'sector') {
      const picker = document.getElementById(action.id);
      picker.querySelector('.employment-sector-trigger').click();
      const buttons = [...picker.querySelectorAll('button[role="option"]')];
      buttons.find(button => button.getAttribute('aria-selected') !== 'true').click();
    } else if (action.kind === 'resize') {
      window.dispatchEvent(new Event('resize'));
    }
    await bench.frame();
    const completed = performance.now();
    countMutations(mutations.takeRecords()); mutations.disconnect();
    bench.drainLongTasks();
    const tasks = bench.longTasks.filter(entry => entry.start < completed && entry.start + entry.duration > started);
    return { durationMs: completed - started, addedNodes, removedNodes, longTasks: tasks.length,
      longTaskMs: tasks.reduce((sum, entry) => sum + entry.duration, 0), ...bench.counters() };
  }, { action });
  const endMetrics = await metrics(session);
  const sample = { profile: profile.name, side, operation, iteration, ...timing,
    scriptMs: (endMetrics.ScriptDuration - startMetrics.ScriptDuration) * 1000,
    layoutMs: (endMetrics.LayoutDuration - startMetrics.LayoutDuration) * 1000,
    taskMs: (endMetrics.TaskDuration - startMetrics.TaskDuration) * 1000,
    heapBytes: endMetrics.JSHeapUsedSize };
  if (iteration >= 0) samples.push(sample);
  assert.deepEqual(target.errors, [], 'Browser errors during benchmark');
  return sample;
}

function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1] };
}

function report(browserVersion) {
  if (diagnosticRewrite) assert.ok(diagnosticRoutedResponses, 'Diagnostic rewrite must have been served');
  const grouped = {};
  for (const sample of samples) {
    const key = `${sample.profile}/${sample.operation}/${sample.side}`;
    (grouped[key] ||= []).push(sample);
  }
  const summaries = Object.fromEntries(Object.entries(grouped).map(([key, values]) => [key, {
    count: values.length,
    ...Object.fromEntries(['durationMs', 'scriptMs', 'layoutMs', 'taskMs', 'heapBytes', 'nodes', 'listeners', 'longTasks', 'longTaskMs', 'totalRegistrations', 'addedNodes', 'removedNodes']
      .map(metric => [metric, summary(values.map(sample => sample[metric] || 0))])),
  }]));
  const comparisons = [];
  if (!captureOnly) for (const key of Object.keys(summaries).filter(key => key.endsWith('/before'))) {
    const baseline = summaries[key]; const candidate = summaries[key.replace(/\/before$/, '/after')];
    for (const metric of ['durationMs', 'scriptMs', 'layoutMs']) for (const percentile of ['median', 'p95']) {
      const value = baseline[metric][percentile]; const next = candidate[metric][percentile];
      const allowance = percentile === 'median' ? Math.max(value * .05, 5) : Math.max(value * .1, 10);
      comparisons.push({ operation: key.replace(/\/before$/, ''), metric, percentile, before: value, after: next,
        changePercent: value ? (next / value - 1) * 100 : null, limit: value + allowance, pass: next <= value + allowance });
    }
    if (key.includes('/stabilized-memory/')) {
      const value = baseline.heapBytes.median; const next = candidate.heapBytes.median;
      comparisons.push({ operation: key.replace(/\/before$/, ''), metric: 'heapBytes', percentile: 'median', before: value, after: next,
        limit: value + Math.max(value * .05, 5 * 1024 * 1024), pass: next <= value + Math.max(value * .05, 5 * 1024 * 1024) });
    }
  }
  const applicationHash = directory => Object.fromEntries(['site_manifest.json', 'barometre_details.html', 'assets/js/details.js']
    .map(filename => [filename, createHash('sha256').update(fs.readFileSync(path.join(directory, filename))).digest('hex')]));
  return { capturedAt: new Date().toISOString(), browser: browserVersion, runnerSha256, before, after: captureOnly ? null : after,
    application: { before: applicationHash(before), after: captureOnly ? null : applicationHash(after) },
    settings: { startupCount: warmOnly ? 0 : startupCount, interactionCount: coldOnly ? 0 : interactionCount,
      profiles: selectedProfiles, externalFonts: 'fixed system fallback; both sides',
      ...(diagnosticRewrite ? { diagnosticRewrite: { from: diagnosticRewrite.from, to: diagnosticRewrite.to,
        sourceSha256: diagnosticRewrite.sourceSha256, servedSha256: diagnosticRewrite.servedSha256,
        servedResponses: diagnosticRoutedResponses,
        scope: 'after-side response only; on-disk application unchanged' } } : {}),
      actions: option('--actions') ? option('--actions').split(',') : 'all nine warm actions',
      coldDataGate: 'idle preload discarded; Response.text gated before reading; selection performs atob/bytes/gzip/JSON',
      longTasks: 'overlaps measured interval; includes task started before performance marker; sum reports entire overlapping-task duration',
      videos: 'play overridden in benchmark only; paused at first frame on every loadeddata',
      viewportResize: '1440↔1420 / 390↔370; browser performance marker, setViewportSize, four RAFs; protocol overhead identical on both sides',
      reducedMotion: 'reduce', settling: 'two animation frames; no sleep included',
      addedRemovedNodes: 'MutationRecord addedNodes/removedNodes roots; excludes descendants; reconstruction indicator, not allocation count',
      listeners: 'addEventListener registrations on currently attached nodes; once handlers may already have fired; excludes onclick properties; stability indicator, not exhaustive active-listener count' },
    summaries, comparisons, samples };
}

function writeReport(result) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  const failures = result.comparisons.filter(item => !item.pass);
  console.log(`Report ${output}; ${failures.length} metric budget failures.`);
  if (failures.length) { console.log(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
}

function mergeColdReport() {
  const coldPath = path.resolve(root, option('--merge-cold-report'));
  const warmPath = path.resolve(root, option('--warm-report'));
  const cold = JSON.parse(fs.readFileSync(coldPath, 'utf8'));
  const warm = JSON.parse(fs.readFileSync(warmPath, 'utf8'));
  assert.equal(cold.browser, warm.browser, 'Both measurements must use the same browser version');
  assert.equal(cold.before, warm.before); assert.equal(cold.after, warm.after);
  assert.deepEqual(cold.settings.profiles, warm.settings.profiles);
  assert.equal(cold.settings.startupCount, warm.settings.startupCount);
  const coldOperations = new Set(['startup', 'first-selection-decompression']);
  assert.ok(cold.samples.every(sample => coldOperations.has(sample.operation)), 'Cold supplement may only replace cold samples');
  samples.push(...warm.samples.filter(sample => !coldOperations.has(sample.operation)), ...cold.samples);
  const merged = report(warm.browser);
  merged.before = warm.before; merged.after = warm.after;
  merged.settings.startupCount = cold.settings.startupCount;
  merged.settings.interactionCount = warm.settings.interactionCount;
  const hash = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  const hashes = directory => Object.fromEntries(['site_manifest.json', 'assets/js/details.js', 'barometre_details.html']
    .map(filename => [filename, hash(path.join(directory, filename))]));
  merged.provenance = {
    warm: { file: warmPath, sha256: hash(warmPath), measuredAt: warm.capturedAt,
      operations: 'warm interactions, real/synthetic resize, stabilized memory',
      dataGate: 'original Response.text gate after reading; data already ready for retained warm samples' },
    cold: { file: coldPath, sha256: hash(coldPath), measuredAt: cold.capturedAt, runnerSha256: cold.runnerSha256,
      operations: '10 startups and first selection per profile/side; replaces original cold samples',
      dataGate: cold.settings.coldDataGate },
    application: { before: hashes(warm.before), after: hashes(warm.after) },
  };
  writeReport(merged);
}

async function profileTransitions(browser, origin) {
  const profile = profiles.find(item => item.name === (option('--profile') || 'mobile-cpu4'));
  assert.ok(profile, 'Unknown profiling viewport');
  const outputDirectory = path.resolve(root, option('--profile-output') || '.cache/dom-migration-profiles');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const results = [];
  for (const side of ['before', 'after']) {
    const target = await open(browser, profile, side, origin, true);
    try {
      await measure(target, { kind: 'region', value: 'Île-de-France' }, -1, 'profile-warmup');
      const settle = () => target.page.evaluate(async () => {
        await window.__domBenchmark.frame(); await window.__domBenchmark.frame();
      });
      await settle();
      await target.session.send('Profiler.enable');
      await target.session.send('Profiler.setSamplingInterval', { interval: 100 });
      for (const [operation, region] of [['warm-national-selection', 'France entière'], ['warm-region', 'Normandie']]) {
        const beforeState = await target.page.evaluate(() => ({ pending: window.__domBenchmark.pendingFrames(),
          geography: document.getElementById('geoTrigger').getAttribute('aria-label'),
          treemapViewBox: document.getElementById('employmentTreemapSvg').getAttribute('viewBox') }));
        await target.session.send('Profiler.start');
        const sample = await measure(target, { kind: 'region', value: region }, -1, operation);
        const immediate = await target.page.evaluate(() => ({ pending: window.__domBenchmark.pendingFrames(),
          geography: document.getElementById('geoTrigger').getAttribute('aria-label'),
          treemapViewBox: document.getElementById('employmentTreemapSvg').getAttribute('viewBox'),
          effectifs: document.getElementById('employmentEffectifsScope')?.textContent,
          dpae: document.getElementById('dpaeScope')?.textContent }));
        await settle();
        const afterState = await target.page.evaluate(() => ({ pending: window.__domBenchmark.pendingFrames(),
          geography: document.getElementById('geoTrigger').getAttribute('aria-label'),
          treemapViewBox: document.getElementById('employmentTreemapSvg').getAttribute('viewBox') }));
        const { profile: cpu } = await target.session.send('Profiler.stop');
        const filename = path.join(outputDirectory, `${profile.name}-${side}-${operation}.cpuprofile`);
        fs.writeFileSync(filename, JSON.stringify(cpu));
        const nodes = new Map(cpu.nodes.map(node => [node.id, node]));
        const parents = new Map(cpu.nodes.flatMap(node => (node.children || []).map(id => [id, node.id])));
        const own = new Map(); const inclusive = new Map();
        cpu.samples.forEach((id, index) => {
          const duration = (cpu.timeDeltas[index] || 0) / 1000;
          own.set(id, (own.get(id) || 0) + duration);
          for (let current = id; current; current = parents.get(current)) inclusive.set(current, (inclusive.get(current) || 0) + duration);
        });
        const top = [...inclusive].map(([id, ms]) => ({ id, ms, ownMs: own.get(id) || 0,
          ...nodes.get(id).callFrame })).filter(frame => frame.url.includes('/assets/js/details.js') || frame.functionName.includes('fitSector'))
          .sort((a, b) => b.ms - a.ms).slice(0, 30);
        results.push({ side, operation, sample, beforeState, immediate, afterState, profile: filename, top });
        console.log(JSON.stringify({ side, operation, scriptMs: sample.scriptMs, pending: immediate.pending.length,
          top: top.slice(0, 6).map(item => ({ function: item.functionName, ms: item.ms, ownMs: item.ownMs, line: item.lineNumber + 1 })) }));
      }
    } finally { await target.context.close(); }
  }
  if (diagnosticRewrite) assert.ok(diagnosticRoutedResponses, 'Diagnostic rewrite must have been served');
  fs.writeFileSync(path.join(outputDirectory, 'report.json'), JSON.stringify({ capturedAt: new Date().toISOString(),
    runnerSha256, before, after, diagnosticRewrite: diagnosticRewrite ? { ...diagnosticRewrite, body: undefined,
      servedResponses: diagnosticRoutedResponses } : undefined, results }, null, 2));
}

(async () => {
  if (option('--merge-cold-report')) {
    assert.ok(option('--warm-report'), '--warm-report is required for cold merging');
    mergeColdReport(); return;
  }
  assert.ok(startupCount > 0 && interactionCount > 0);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: option('--channel') || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true, args: ['--force-color-profile=srgb', '--disable-gpu'] });
  try {
    if (process.argv.includes('--profile-transitions')) { await profileTransitions(browser, origin); return; }
    const sides = captureOnly ? ['before'] : ['before', 'after'];
    for (const profile of selectedProfiles) {
      for (let iteration = 0; iteration < (warmOnly ? 0 : startupCount); iteration++) {
        for (const side of iteration % 2 ? [...sides].reverse() : sides) {
          const target = await open(browser, profile, side, origin);
          const startup = await target.page.evaluate(async () => {
            await window.__domBenchmark.frame();
            window.__domBenchmark.drainLongTasks();
            const completed = performance.now();
            const tasks = window.__domBenchmark.longTasks.filter(entry => entry.start < completed);
            return { navigation: performance.getEntriesByType('navigation')[0].loadEventEnd,
              longTasks: tasks.length, longTaskMs: tasks.reduce((sum, entry) => sum + entry.duration, 0),
              ...window.__domBenchmark.counters() };
          });
          const initial = await metrics(target.session);
          samples.push({ profile: profile.name, side, operation: 'startup', iteration, durationMs: startup.navigation,
            scriptMs: initial.ScriptDuration * 1000, layoutMs: initial.LayoutDuration * 1000, taskMs: initial.TaskDuration * 1000,
            heapBytes: initial.JSHeapUsedSize, ...startup });
          await measure(target, { kind: 'region', value: 'France entière' }, iteration, 'first-selection-decompression');
          await target.context.close();
        }
      }
      if (!warmOnly) console.log(`OK ${profile.name}: ${startupCount} cold starts per side`);
      if (coldOnly) continue;
      const targets = {};
      for (const side of sides) {
        targets[side] = await open(browser, profile, side, origin);
        await measure(targets[side], { kind: 'region', value: 'Île-de-France' }, -1, 'warmup');
      }
      const allActions = [
        ['effectifs-sector', { kind: 'sector', id: 'employmentEffectifsSeriesPicker' }],
        ['payroll-sector', { kind: 'sector', id: 'employmentPayrollSeriesPicker' }],
        ['department-metric', { kind: 'switch', id: 'employmentDeptMetricSwitch' }],
        ['department-sector', { kind: 'sector', id: 'employmentDeptSectorPicker' }],
        ['dpae-mode', { kind: 'switch', id: 'dpaeModeSwitch' }],
        ['resize-event', { kind: 'resize' }],
        ['viewport-resize', { kind: 'viewport' }],
        ['warm-national-selection', { kind: 'region', value: 'France entière' }],
        ['warm-region', { kind: 'region', value: 'Normandie' }],
      ];
      const actions = option('--actions')
        ? allActions.filter(([operation]) => option('--actions').split(',').includes(operation)) : allActions;
      assert.ok(actions.length, 'At least one known action is required');
      for (let iteration = -3; iteration < interactionCount; iteration++) {
        for (const side of iteration % 2 ? [...sides].reverse() : sides) {
          const target = targets[side];
          await target.page.bringToFront();
          for (const [operation, originalAction] of actions) {
            const action = operation === 'warm-region' ? { ...originalAction, value: iteration % 2 ? 'Normandie' : 'Île-de-France' } : originalAction;
            await measure(target, action, iteration, operation);
          }
        }
        if (iteration >= 0 && (iteration + 1) % 10 === 0) console.log(`Progress ${profile.name}: ${iteration + 1}/${interactionCount} warm observations`);
      }
      for (const target of Object.values(targets)) {
        await target.session.send('HeapProfiler.collectGarbage');
        const stabilized = await metrics(target.session);
        const counts = await target.page.evaluate(() => window.__domBenchmark.counters());
        samples.push({ profile: profile.name, side: target.side, operation: 'stabilized-memory', iteration: interactionCount,
          durationMs: 0, scriptMs: 0, layoutMs: 0, taskMs: 0, heapBytes: stabilized.JSHeapUsedSize,
          longTasks: 0, longTaskMs: 0, ...counts });
        await target.context.close();
      }
      console.log(`OK ${profile.name}: ${interactionCount} warm observations per action and side`);
    }
    const result = report(browser.version());
    writeReport(result);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
