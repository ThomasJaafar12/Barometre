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
    await page.locator('#geoTrigger').click();
    await page.locator('.geo-return-button').click();
    await page.waitForFunction(() => document.querySelector('#stageShell').dataset.phase === 'landing');
    assert.equal(await page.locator('#story').isVisible(), false);
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
