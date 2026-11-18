/* Reveal regression check: requires a generated dist/ site and Playwright. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const siteOption = process.argv.indexOf('--site-dir');
const siteDirectory = siteOption < 0 ? 'dist' : process.argv[siteOption + 1];
if (!siteDirectory) throw new Error('--site-dir nécessite un dossier.');

const topics = {
  chiffres: { chapterId: 'module-chiffres', chartMarks: ['#chiffresIndicators .indicator'] },
  emploi: { chapterId: 'module-sector', chartMarks: ['#employmentEffectifsChartSvg .tick',
    '#employmentPayrollChartSvg .tick', '#employmentTreemapSvg .employment-treemap-tile', '#autoMetricSwitch button'] },
  entreprises: { chapterId: 'module-payroll', chartMarks: ['#dpaeChartSvg .tick',
    '#pcolChartSvg .tick', '#delaiChartSvg .tick', '#trarChartSvg .quarterly-series'] },
};

async function checkRegionalHandoff(page, reducedMotion) {
  const region = page.locator('#landingMap .region-face[data-code="24"]');
  await region.evaluate(node => {
    const stage = document.getElementById('stageShell');
    const map = document.getElementById('landingMap');
    const rail = document.getElementById('cockpitTerritories');
    const startWidth = node.getBoundingClientRect().width;
    const frames = { zoom: 0, region: 0, visibleRail: 0, visibleRegionalMap: 0 };
    const visible = element => element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    let frame;
    function sample() {
      if (visible(rail) || (rail.checkVisibility({ visibilityProperty: true }) && !rail.closest('[inert]'))) {
        frames.visibleRail++;
      }
      if (stage.dataset.phase === 'region') {
        frames.region++;
        if (visible(map)) frames.visibleRegionalMap++;
      } else if (visible(map) && node.getBoundingClientRect().width > startWidth * 1.05) {
        frames.zoom++;
      }
      frame = requestAnimationFrame(sample);
    }
    node.addEventListener('click', () => { frame = requestAnimationFrame(sample); }, { once: true });
    window.finishRegionHandoffCheck = () => { cancelAnimationFrame(frame); return frames; };
  });
  await region.click();
  await page.locator('#stageShell[data-phase="region"] #heroTitle').waitFor({ state: 'visible' });
  await page.locator('#story.is-visible').waitFor({ state: 'visible' });
  const frames = await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.finishRegionHandoffCheck();
  });
  assert.ok(frames.region > 0);
  if (reducedMotion !== 'reduce') assert.ok(frames.zoom > 0, 'The regional camera zoom must remain visible');
  assert.deepEqual({ visibleRail: frames.visibleRail, visibleRegionalMap: frames.visibleRegionalMap },
    { visibleRail: 0, visibleRegionalMap: 0 }, 'Regional transitions must keep the rail hidden and the regional page clear of the map');
  await page.locator('#geoTrigger').click();
  await page.locator('.geo-return-button').click();
  await region.waitFor({ state: 'visible' });
  await page.locator('#cockpitTerritories').getByRole('button', { name: 'France entière' }).waitFor({ state: 'visible' });
}

async function checkVideoScroll(page) {
  const media = page.locator('.stage-media');
  assert.equal(await media.evaluate(el => getComputedStyle(el, '::after').backgroundImage), 'none');
  await page.evaluate(() => {
    const original = window.scrollTo;
    const resets = [];
    window.scrollTo = function (...args) {
      const top = typeof args[0] === 'object' ? args[0].top : args[1];
      if (top === 0 && scrollY > 0 && ScrollTrigger.isScrolling()) resets.push(scrollY);
      return original.apply(this, args);
    };
    window.finishVideoScrollCheck = () => { window.scrollTo = original; return resets; };
  });
  await page.mouse.move(320, 340);
  const start = await page.evaluate(() => scrollY);
  for (let i = 0; i < 45; i++) {
    await page.mouse.wheel(0, 24);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  assert.ok(await page.evaluate(() => scrollY) > start);
  assert.deepEqual(await page.evaluate(() => window.finishVideoScrollCheck()), [],
    'Chapter layout updates must preserve the active wheel gesture');
}

async function checkReveal(browser, viewport, reducedMotion, topic) {
  const url = pathToFileURL(path.resolve(__dirname, '..', siteDirectory, `barometre_${topic}.html`)).href;
  const dataUrl = new URL(`assets/js/${topic}-data.js`, url).href;
  const { chapterId, chartMarks } = topics[topic];
  const context = await browser.newContext({ viewport, reducedMotion });
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await context.addInitScript(source => {
    let mapFrameScheduled = false;
    let mapFrameStarted = false;
    const observer = new MutationObserver(() => {
      if ([...document.scripts].some(script => script.src === source)) {
        window.mapFrameBeforeData = mapFrameStarted;
        observer.disconnect();
      } else if (!mapFrameScheduled && document.querySelector('#landingMap .path-region[d]')) {
        mapFrameScheduled = true;
        requestAnimationFrame(() => { mapFrameStarted = true; });
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  }, dataUrl);
  // Keep the chart asset pending while the map and the chapter are revealed.
  let releaseData;
  const pendingData = new Promise(resolve => { releaseData = resolve; });
  await context.route(dataUrl, async route => {
    await pendingData;
    await route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const [request] = await Promise.all([
      page.waitForRequest(dataUrl, { timeout: 10000 }),
      page.goto(url, { waitUntil: 'domcontentloaded' }),
    ]);
    assert.equal(request.resourceType(), 'script');
    assert.equal(await page.evaluate(() => window.mapFrameBeforeData), true,
      'The map must have a frame before starting the chart data request');
    await page.locator('#landingMap .path-region[d]').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('#story').isVisible(), false);
    await page.locator('#geoTrigger').click();
    // The national selector reveals immediately, independently of chart data.
    await page.locator('#geoMenu button[role="option"]').filter({ hasText: 'France entière' }).click();
    await page.waitForFunction(() => document.querySelector('#story').classList.contains('is-visible'));

    const lastCard = page.locator(topic === 'chiffres' ? `#${chapterId}` : '.snap-card:visible').last();
    const initialOpacity = await lastCard.evaluate(element => Number(getComputedStyle(element).opacity));
    assert.equal(initialOpacity, reducedMotion === 'reduce' ? 1 : 0,
      'Offscreen cards must have their final initial state before data loads');

    // Reveal a chapter while data is still pending. Completing the data load
    // must never send its opacity back to zero.
    await page.locator(`#${chapterId}`).evaluate(element => {
      window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - innerHeight * 0.3, behavior: 'instant' });
    });
    await page.waitForFunction(id => Number(getComputedStyle(document.getElementById(id)).opacity) === 1, chapterId);
    for (const selector of chartMarks) assert.equal(await page.locator(selector).count(), 0);
    const minimumOpacity = page.evaluate(async id => {
      const chapter = document.getElementById(id);
      let minimum = 1;
      const deadline = performance.now() + 1200;
      do {
        await new Promise(requestAnimationFrame);
        minimum = Math.min(minimum, Number(getComputedStyle(chapter).opacity));
      } while (performance.now() < deadline);
      return minimum;
    }, chapterId);
    releaseData();
    assert.equal(await minimumOpacity, 1, 'Loading chart data must not hide an already revealed chapter');
    for (const selector of chartMarks) await page.locator(selector).first().waitFor({ state: 'attached' });

    // Scrolling reveals the remaining cards, including their parent chapter.
    await lastCard.evaluate(element => {
      window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - innerHeight * 0.3, behavior: 'instant' });
    });
    await lastCard.evaluate(async card => {
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline) {
        if (Number(getComputedStyle(card).opacity) === 1 &&
            Number(getComputedStyle(card.closest('.section-card')).opacity) === 1) return;
        await new Promise(requestAnimationFrame);
      }
      throw new Error('The chapter and its last card did not reveal');
    });

    await page.locator('#geoTrigger').click();
    await page.getByRole('option', { name: 'Normandie', exact: true }).click();
    assert.equal(await lastCard.evaluate(element => Number(getComputedStyle(element).opacity)), 1,
      'Switching regions must not restart completed reveals');
    if (topic === 'emploi' && viewport.width === 1440 && reducedMotion === 'no-preference') {
      await checkVideoScroll(page);
    }
    await page.locator('#geoTrigger').click();
    await page.locator('.geo-return-button').click();
    await page.waitForFunction(() => document.querySelector('#stageShell').dataset.phase === 'landing');
    assert.equal(await page.locator('#story').isVisible(), false);
    if (topic === 'entreprises') await checkRegionalHandoff(page, reducedMotion);
    assert.deepEqual(errors, []);
    console.log(`OK reveal ${topic}, ${viewport.width}px, ${reducedMotion}`);
  } catch (error) {
    console.error(await page.evaluate(() => [...document.querySelectorAll('.section-card, .snap-card')].map(element => ({
      label: element.id || element.getAttribute('aria-label'),
      top: element.getBoundingClientRect().top,
      opacity: getComputedStyle(element).opacity,
      pending: element.classList.contains('is-scroll-revealing'),
    }))));
    throw error;
  } finally {
    releaseData();
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      for (const topic of Object.keys(topics)) {
        for (const motion of ['no-preference', 'reduce']) await checkReveal(browser, viewport, motion, topic);
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
