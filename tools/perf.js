// Measures frame pacing during the dice roll with CPU throttling (simulated low-end phone).
// Usage: node tools/perf.js [throttleRate]
const { chromium } = require('playwright');
(async () => {
  const rate = Number(process.argv[2] || 6);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto('http://localhost:8765/index.html');
  await p.click('#playBtn'); await p.click('#startBtn'); await p.waitForSelector('#roll.active'); await p.waitForTimeout(600);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  for (const label of ['roll', 'answer-timer']) {
    await p.evaluate(() => { window.__f = []; let last = performance.now(); (function f(t) { window.__f.push(t - last); last = t; if (window.__f.length < 400) requestAnimationFrame(f); })(performance.now()); });
    if (label === 'roll') await p.click('#dieBtn');
    await p.waitForTimeout(2600);
    const f = await p.evaluate(() => window.__f.slice(2));
    const avg = f.reduce((a, c) => a + c, 0) / f.length;
    const long = f.filter(x => x > 50).length, worst = Math.max(...f);
    console.log(`${label} @${rate}x CPU: ${f.length} frames, avg ${avg.toFixed(1)}ms (~${(1000 / avg).toFixed(0)} fps), >50ms: ${long}, worst ${worst.toFixed(0)}ms`);
  }
  await b.close();
})();
