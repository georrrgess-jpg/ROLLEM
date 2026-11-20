// Plays a full game in headless Chromium and screenshots each screen. Usage: node tools/smoke.js [outDir]
const { chromium } = require('playwright');
const out = process.argv[2] || 'shots';
const fs = require('fs'); fs.mkdirSync(out, { recursive: true });
const sizes = [['small', 320, 568], ['typical', 390, 844], ['tall', 430, 932]];
(async () => {
  const b = await chromium.launch();
  let errors = [];
  for (const [name, w, h] of sizes) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts|404|Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
    await p.goto('http://localhost:8765/index.html');
    await p.evaluate(() => { localStorage.clear(); });
    await p.reload(); await p.waitForTimeout(1200);
    const shot = s => p.screenshot({ path: `${out}/${name}-${s}.png` });
    await shot('1-home');
    await p.click('#playBtn', { force: true }); await p.waitForTimeout(400); await p.click('[data-mode="all"]'); await p.waitForTimeout(500);
    await p.fill('#playerList input >> nth=0', 'Alexandria');
    await p.fill('#playerList input >> nth=1', 'Bo');
    await p.click('#addPlayer'); await p.fill('#playerList input >> nth=2', 'Christopher the Great');
    await p.click('#roundChips .chip >> nth=0'); // 3 rounds
    await shot('2-setup');
    await p.click('#startBtn'); await p.waitForTimeout(700);
    await shot('3-roll');
    for (let turn = 0; turn < 9; turn++) {
      await p.waitForSelector('#roll.active', { timeout: 8000 }).catch(async () => { await p.waitForTimeout(2800); await p.waitForSelector('#roll.active'); });
      await p.click('#dieBtn', { force: true });
      if (turn === 0) { await p.waitForTimeout(700); await shot('4-rolling'); }
      await p.waitForSelector('#answer.active', { timeout: 6000 });
      await p.waitForTimeout(500);
      const t = await p.evaluate(() => { const T = window.__rollem.G.turn; return { L: T.letter, a: T.entries.map(e => e.display) }; });
      let answer;
      if (turn % 4 === 0) answer = t.a[0].slice(0, -1) + (t.a[0].slice(-1) === 'e' ? 'a' : 'e') + 'x'; // typo-ish
      else if (turn % 4 === 1) answer = t.a[Math.min(5, t.a.length - 1)];
      else if (turn % 4 === 2) answer = t.L + 'zzqwerty';
      else answer = t.a[2];
      await p.fill('#answerInput', answer);
      await p.click('#lockBtn'); await p.waitForTimeout(250);
      if (turn === 0) await shot('5-answer-fixed');
      if (await p.$eval('#lockBtn', b => b.classList.contains('submit-mode')).catch(() => false)) await p.click('#lockBtn');
      await p.waitForSelector('#reveal.active');
      if (turn % 4 === 2) { await p.waitForSelector('#vote:not([hidden])'); await p.waitForTimeout(500); await shot('6-vote'); await p.click('#voteYes'); }
      for (let k = 0; k < 60 && !(await p.$('#nextBtn:not([disabled])')); k++) {
        if (await p.$('#vote:not([hidden])')) await p.click('#voteYes').catch(() => {});
        await p.waitForTimeout(200);
      }
      if (turn < 2) await shot('7-reveal-' + turn);
      await p.click('#nextBtn');
      if (turn % 3 === 2) {
        await p.waitForTimeout(400);
        if (await p.$('#standings.active')) { await p.waitForTimeout(1600); if (turn === 2) await shot('8-standings'); await p.click('#standNext'); if (turn === 5) { await p.waitForTimeout(900); await shot('9-final-splash'); } await p.waitForTimeout(turn === 5 ? 2000 : 300); }
      }
    }
    await p.waitForSelector('#results.active', { timeout: 5000 });
    await p.waitForTimeout(1800);
    await shot('10-results');
    await p.click('#homeBtn'); await p.waitForTimeout(300);
    await p.click('#howBtn'); await p.waitForTimeout(500); await shot('11-how');
    await p.close();
  }
  await b.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no runtime errors');
})().catch(e => { console.error(e); process.exit(1); });
