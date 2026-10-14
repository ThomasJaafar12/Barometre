/* Reveal regression check: requires a generated dist/ site and Playwright. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const siteOption = process.argv.indexOf('--site-dir');
const siteDirectory = siteOption < 0 ? 'dist' : process.argv[siteOption + 1];
if (!siteDirectory) throw new Error('--site-dir nécessite un dossier.');
const url = pathToFileURL(path.resolve(__dirname, '..', siteDirectory, 'barometre_details.html')).href;

async function checkReveal(browser, viewport, reducedMotion) {
  const context = await browser.newContext({ viewport, reducedMotion });
  // Hold decompression until the story is visible to reproduce slow data loading.
  await context.addInitScript(() => {
    const gate = new Promise(resolve => { window.releaseDeferredData = resolve; });
    const text = Response.prototype.text;
    Response.prototype.text = async function (...args) {
      const result = await text.apply(this, args);
      await gate;
      return result;
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url, { waitUntil: 'load' });
    assert.equal(await page.locator('#story').isVisible(), false);
    await page.locator('#geoTrigger').click();
    // The national selector reveals immediately, independently of chart data.
    await page.locator('#geoMenu button[role="option"]').filter({ hasText: 'France entière' }).click();
    await page.waitForFunction(() => document.querySelector('#story').classList.contains('is-visible'));

    const lastCard = page.locator('.snap-card').last();
    const initialOpacity = await lastCard.evaluate(element => Number(getComputedStyle(element).opacity));
    assert.equal(initialOpacity, reducedMotion === 'reduce' ? 1 : 0,
      'Offscreen cards must have their final initial state before data loads');

    // Reveal a chapter while data is still pending. Completing the data load
    // must never send its opacity back to zero.
    await page.locator('#module-sector').evaluate(element => {
      window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - innerHeight * 0.3, behavior: 'instant' });
    });
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#module-sector')).opacity) === 1);
    const minimumOpacity = await page.evaluate(async () => {
      window.releaseDeferredData();
      const chapter = document.querySelector('#module-sector');
      let minimum = 1;
      const deadline = performance.now() + 1200;
      do {
        await new Promise(requestAnimationFrame);
        minimum = Math.min(minimum, Number(getComputedStyle(chapter).opacity));
      } while (performance.now() < deadline);
      return minimum;
    });
    assert.equal(minimumOpacity, 1, 'Loading chart data must not hide an already revealed chapter');
    await page.waitForFunction(() => document.querySelector('#dpaeModeSwitch button'));

    // Scrolling reveals the remaining cards, including their parent chapter.
    await lastCard.evaluate(element => {
      window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - innerHeight * 0.3, behavior: 'instant' });
    });
    await page.waitForFunction(() => {
      const card = [...document.querySelectorAll('.snap-card')].at(-1);
      return Number(getComputedStyle(card).opacity) === 1 &&
        Number(getComputedStyle(card.closest('.section-card')).opacity) === 1;
    });

    await page.locator('#geoTrigger').click();
    await page.locator('#geoMenu button[role="option"]').filter({ hasText: 'Normandie' }).click();
    assert.equal(await lastCard.evaluate(element => Number(getComputedStyle(element).opacity)), 1,
      'Switching regions must not restart completed reveals');
    await page.locator('#geoTrigger').click();
    await page.locator('.geo-return-button').click();
    await page.waitForFunction(() => document.querySelector('#stageShell').dataset.phase === 'landing');
    assert.equal(await page.locator('#story').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(`OK reveal ${viewport.width}px, ${reducedMotion}`);
  } catch (error) {
    console.error(await page.evaluate(() => [...document.querySelectorAll('.section-card, .snap-card')].map(element => ({
      label: element.id || element.dataset.snapLabel,
      top: element.getBoundingClientRect().top,
      opacity: getComputedStyle(element).opacity,
      pending: element.classList.contains('is-scroll-revealing'),
    }))));
    throw error;
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      for (const motion of ['no-preference', 'reduce']) await checkReveal(browser, viewport, motion);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
