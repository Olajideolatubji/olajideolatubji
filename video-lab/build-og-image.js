#!/usr/bin/env node
/* Renders video-lab/og-image.png (1200x630), the link preview card.
 * Run: NODE_PATH=$(npm root -g) node video-lab/build-og-image.js
 * Needs Playwright; the image is committed, so this only reruns when the
 * card's design changes. */
const path = require('path');
const { chromium } = require('playwright');

const CARD = `
<style>
  @font-face { font-family: x; src: local("Helvetica"); }
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1200px; height: 630px; display: flex; align-items: center;
    justify-content: center; gap: 76px;
    padding: 0 76px; background: radial-gradient(900px 500px at 18% -20%, #1b2437 0%, #0b0d12 62%);
    color: #e7eaf2; font: 400 20px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  .ring { position: relative; width: 300px; height: 300px; flex: none; }
  .ring svg { transform: rotate(-90deg); }
  .ring circle { fill: none; stroke-width: 22; stroke-linecap: round; }
  .track { stroke: #1e2432; }
  .value { stroke: #ffc861; stroke-dasharray: 848; stroke-dashoffset: 229; }
  .num {
    position: absolute; inset: 0; display: grid; place-content: center; text-align: center;
    font-weight: 800; font-size: 92px; letter-spacing: -0.04em;
  }
  .num small { display: block; font-size: 21px; font-weight: 500; color: #99a1b5; letter-spacing: 0; }
  h1 { font-size: 76px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.02; }
  h1 span { color: #5cf2b0; }
  p { margin-top: 22px; font-size: 27px; line-height: 1.42; color: #99a1b5; max-width: 24ch; }
  .tags { display: flex; gap: 10px; margin-top: 34px; flex-wrap: wrap; }
  .tag {
    border: 1px solid #232837; background: #171b25; color: #99a1b5;
    border-radius: 99px; padding: 8px 17px; font-size: 18px;
  }
</style>
<div class="ring">
  <svg viewBox="0 0 300 300" width="300" height="300">
    <circle class="track" cx="150" cy="150" r="135"></circle>
    <circle class="value" cx="150" cy="150" r="135"></circle>
  </svg>
  <div class="num">73<small>/ 100</small></div>
</div>
<div>
  <h1>Video&nbsp;Lab<span>.</span></h1>
  <p>Score any video, then fix what is costing you views.</p>
  <div class="tags">
    <div class="tag">Hook</div><div class="tag">Pacing</div><div class="tag">Audio</div>
    <div class="tag">Colour</div><div class="tag">Format</div>
  </div>
</div>
`;

(async () => {
  const browser = await chromium.launch({ args: ['--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(CARD);
  const file = path.join(__dirname, 'og-image.png');
  await page.screenshot({ path: file });
  await browser.close();
  console.log('wrote ' + path.relative(process.cwd(), file));
})();
