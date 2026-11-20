/* ROLL'EM — game controller */
(function () {
  'use strict';
  const E = window.RollemEngine;
  const bank = E.buildBank(window.ROLLEM_DATA);
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const COLORS = ['#ff3d8b', '#4da3ff', '#2fc98f', '#ff9d00', '#a259ff', '#ff5a4f', '#14c4d9', '#e8c400', '#ff6fd8', '#6c7cff', '#3ddc84', '#ff8a5c'];
  const TIMERS = [10, 15, 20, 30, 45];
  const ROUNDS = [3, 5, 7, 10];
  const MULTS = [2, 3];
  const MAX_PLAYERS = 12;

  // ---------- persistent prefs ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('rollem.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('rollem.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const settings = Object.assign({ timer: 20, rounds: 5, mult: 2, judge: 'vote' }, store.get('settings', {}));

  // Low-end / reduced-motion devices get a lighter effects budget (fewer particles, no extra filters).
  const LITE = (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) ||
    (navigator.deviceMemory > 0 && navigator.deviceMemory <= 3) ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (LITE) { document.body.classList.add('lite'); window.dispatchEvent(new Event('resize')); }

  // Prompt history persists across games so the same prompts don't keep coming back.
  let history = store.get('history', null);
  if (!history || !history.cats || !Array.isArray(history.letters)) history = E.newHistory();
  const saveHistory = () => store.set('history', history);

  // floating letter tiles behind the menus
  (function makeTiles() {
    const box = document.getElementById('tiles'); if (!box) return;
    // tiles drift up in fixed lanes along the left and right edges, evenly staggered,
    // so they never stack on each other or sit behind the logo / text in the middle
    const lanes = [1, 9, 83, 91, 4, 87, 12, 80], N = lanes.length, dur = 26;
    let html = '';
    for (let i = 0; i < N; i++) {
      const sz = 36 + (i % 3) * 8;
      html += `<span class="float-tile" style="left:${lanes[i]}%;--sz:${sz}px;--dur:${dur}s;--delay:${(-(i / N) * dur).toFixed(2)}s;--dx:${i % 2 ? -14 : 14}px;--r0:${(i % 2 ? -1 : 1) * 12}deg;--r1:${(i % 2 ? 1 : -1) * 25}deg;--op:0.3">${'RLMBOPESTW'[i % 10]}</span>`;
    }
    box.innerHTML = html;
  })();
  let setupNames = store.get('players', ['', '']);
  if (!Array.isArray(setupNames) || setupNames.length < 2) setupNames = ['', ''];

  // ---------- game state ----------
  const G = {
    players: [], round: 1, order: [], turnPos: 0, used: new Set(), turn: null, log: [],
    roundStart: [], timer: null, answerState: 'lock', original: '', busy: false
  };
  const isFinal = () => G.round === settings.rounds;
  const mult = () => (isFinal() ? settings.mult : 1);
  const current = () => G.players[G.order[G.turnPos]];

  // ---------- screens ----------
  let active = null;
  function show(id) {
    const next = document.getElementById(id);
    if (active === next) return;
    if (active) {
      const prev = active;
      prev.classList.add('leaving');
      prev.classList.remove('active');
      setTimeout(() => prev.classList.remove('leaving'), 450);
    }
    next.classList.add('active');
    next.querySelectorAll('.scroll').forEach(s => (s.scrollTop = 0));
    active = next;
  }

  let toastT;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms || 2200);
  }

  function avatar(p, size) {
    const initial = (p.name.trim()[0] || '?').toUpperCase();
    return `<span class="avatar ${size || ''}" style="--c:${p.color}">${esc(initial)}</span>`;
  }

  // ---------- sound toggle ----------
  const ICON_ON = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
  const ICON_MUSIC = '<svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';
  function renderSound() {
    $('#soundToggle').innerHTML = Sound.enabled ? ICON_ON : ICON_OFF;
    $('#menuSound').textContent = Sound.enabled ? 'Sound effects: On' : 'Sound effects: Off';
    $('#musicToggle').innerHTML = ICON_MUSIC;
    $('#musicToggle').classList.toggle('off', !Sound.music);
    $('#musicToggle').setAttribute('aria-pressed', Sound.music);
    $('#menuMusic').textContent = Sound.music ? 'Music: On' : 'Music: Off';
  }
  function toggleMusic() { Sound.setMusic(!Sound.music); renderSound(); Sound.select(); if (Sound.music && G.timer) Sound.startMusic(); }
  $('#musicToggle').addEventListener('click', toggleMusic);
  $('#menuMusic').addEventListener('click', toggleMusic);
  function toggleSound() { Sound.setEnabled(!Sound.enabled); renderSound(); Sound.select(); }
  $('#soundToggle').addEventListener('click', toggleSound);
  $('#menuSound').addEventListener('click', toggleSound);

  // ---------- HOME ----------
  $('#playBtn').addEventListener('click', () => { Sound.select(); renderSetup(); show('setup'); });
  $('#howBtn').addEventListener('click', () => { Sound.tap(); openModal('#howModal'); });
  $$('[data-back]').forEach(b => b.addEventListener('click', () => { Sound.tap(); show(b.dataset.back); }));

  function openModal(sel) { $(sel).hidden = false; }
  function closeModal(sel) { $(sel).hidden = true; }
  $$('[data-close]').forEach(b => b.addEventListener('click', () => {
    Sound.tap();
    const m = b.closest('.overlay'); m.hidden = true;
    if (m.id === 'menuModal') resumeTimer();
  }));
  $$('.overlay.modal').forEach(m => m.addEventListener('click', e => {
    if (e.target === m) { m.hidden = true; if (m.id === 'menuModal') resumeTimer(); }
  }));

  // ---------- SETUP ----------
  function renderChips(el, values, cur, label, key) {
    el.innerHTML = values.map(v => `<button class="chip" role="radio" aria-checked="${v === cur}" data-v="${v}">${label(v)}</button>`).join('');
    el.onclick = e => {
      const b = e.target.closest('.chip'); if (!b) return;
      const raw = b.dataset.v;
      settings[key] = isNaN(raw) ? raw : Number(raw); store.set('settings', settings); Sound.select();
      el.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-checked', c === b));
      if (key === 'judge') renderJudgeHint();
    };
  }
  function renderPlayers(focusLast) {
    const list = $('#playerList');
    list.innerHTML = setupNames.map((n, i) => `
      <li class="player-row" style="animation-delay:${focusLast ? 0 : i * 40}ms">
        <span class="avatar" style="--c:${COLORS[i % COLORS.length]}">${esc((n.trim()[0] || String(i + 1)).toUpperCase())}</span>
        <input type="text" maxlength="12" value="${esc(n)}" placeholder="Player ${i + 1}" data-i="${i}" aria-label="Player ${i + 1} name" enterkeyhint="next" autocapitalize="words" autocomplete="off">
        <button class="row-x" data-x="${i}" aria-label="Remove player ${i + 1}" ${setupNames.length <= 2 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </li>`).join('');
    $('#playerCount').textContent = `${setupNames.length} / ${MAX_PLAYERS}`;
    $('#addPlayer').disabled = setupNames.length >= MAX_PLAYERS;
    if (focusLast) { const ins = list.querySelectorAll('input'); ins[ins.length - 1].focus(); }
  }
  $('#playerList').addEventListener('input', e => {
    const i = Number(e.target.dataset.i); if (isNaN(i)) return;
    setupNames[i] = e.target.value;
    e.target.previousElementSibling.textContent = (e.target.value.trim()[0] || String(i + 1)).toUpperCase();
    store.set('players', setupNames);
    $('#setupError').textContent = '';
  });
  $('#playerList').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const ins = $$('#playerList input'); const i = ins.indexOf(e.target);
    if (i < ins.length - 1) ins[i + 1].focus(); else e.target.blur();
  });
  $('#playerList').addEventListener('click', e => {
    const b = e.target.closest('[data-x]'); if (!b || setupNames.length <= 2) return;
    Sound.tap(); setupNames.splice(Number(b.dataset.x), 1); store.set('players', setupNames); renderPlayers();
  });
  $('#addPlayer').addEventListener('click', () => {
    if (setupNames.length >= MAX_PLAYERS) return;
    Sound.tap(); setupNames.push(''); store.set('players', setupNames); renderPlayers(true);
  });
  function renderJudgeHint() {
    $('#judgeHint').textContent = settings.judge === 'strict'
      ? 'Only answers from our answer pool count: top 5 on the board, plus hundreds more valid answers for 5 pts. No arguing!'
      : 'If an answer isn’t in our pool, the next player decides whether it counts.';
  }
  function renderSetup() {
    renderPlayers();
    renderChips($('#timerChips'), TIMERS, settings.timer, v => v + 's', 'timer');
    renderChips($('#roundChips'), ROUNDS, settings.rounds, v => String(v), 'rounds');
    renderChips($('#multChips'), MULTS, settings.mult, v => (v === 2 ? '2× Double' : '3× Triple'), 'mult');
    renderChips($('#judgeChips'), ['vote', 'strict'], settings.judge, v => (v === 'vote' ? 'Player judges' : 'Strict: list only'), 'judge');
    renderJudgeHint();
    $('#setupError').textContent = '';
  }
  $('#startBtn').addEventListener('click', () => {
    const names = setupNames.map((n, i) => n.trim() || `Player ${i + 1}`);
    const lower = names.map(n => n.toLowerCase());
    if (lower.some((n, i) => lower.indexOf(n) !== i)) { $('#setupError').textContent = 'Every player needs a different name.'; Sound.buzz(); return; }
    Sound.select();
    newGame(names);
  });

  // ---------- GAME FLOW ----------
  function newGame(names) {
    G.players = names.map((name, i) => ({ name, color: COLORS[i % COLORS.length], score: 0, rerolls: 1, streak: 0, hits: 0, tops: 0 }));
    G.round = 1; G.used = new Set(); G.log = []; G.salt = Math.floor(Math.random() * 1e9);
    document.body.classList.remove('final-mode');
    startRound();
  }
  function startRound() {
    const n = G.players.length, shift = (G.round - 1) % n;
    G.order = G.players.map((_, i) => (i + shift) % n);
    G.turnPos = 0;
    G.roundStart = G.players.map(p => p.score);
    if (isFinal() && settings.rounds > 1) {
      document.body.classList.add('final-mode');
      showSplash().then(beginTurn);
    } else beginTurn();
  }
  async function showSplash() {
    const sp = $('#splash');
    $('#splashKicker').textContent = 'Final round';
    $('#splashBig').innerHTML = settings.mult === 3 ? 'TRIPLE<br>POINTS' : 'DOUBLE<br>POINTS';
    $('#splashSub').textContent = settings.mult === 3 ? 'Every answer counts three times. Anyone can win.' : 'Every answer counts twice. Time for a comeback.';
    sp.hidden = false; sp.classList.remove('show'); void sp.offsetWidth; sp.classList.add('show');
    Sound.boom();
    setTimeout(() => FX.burst(window.innerWidth / 2, window.innerHeight * 0.45, 120, { speed: 14 }), 250);
    await sleep(2600);
    sp.hidden = true; sp.classList.remove('show');
  }

  function hud(scope) {
    const p = current();
    scope.querySelectorAll('[data-round]').forEach(el => {
      el.innerHTML = isFinal() ? `<b>Final round · ${settings.mult}×</b>` : `Round <b>${G.round}</b> of ${settings.rounds}`;
    });
    scope.querySelectorAll('[data-myscore]').forEach(el => (el.textContent = p.score + ' pts'));
  }

  // ---------- ROLL ----------
  const die = $('#die'), dieAir = $('#dieAir'), dieBtn = $('#dieBtn'), faces = $$('#die .face'), dieShadow = $('#dieBtn .die-shadow');
  let rolling = false;
  // WebGL dice (smooth rounded model); CSS cube stays as fallback
  const POSE = { x: 0.42, y: -0.58 };
  const glRoll = window.Die3D ? Die3D(dieAir, { maxDpr: LITE ? 1.5 : 2 }) : { ok: false };
  const glHero = window.Die3D ? Die3D($('#heroAir'), { maxDpr: LITE ? 1.25 : 2 }) : { ok: false };
  if (glHero.ok) glHero.setFaces(['R', 'O', 'L', 'E', 'M', '!']);
  let spinAnim = null, glowAnim = null;
  const SPIN_KEYS = [[0, 0], [0.06, -0.012], [0.23, 0.45], [0.42, 0.76], [0.55, 0.87], [0.68, 0.95], [0.84, 0.995], [0.92, 1.004], [1, 1]];
  function spinProgress(k) {
    for (let i = 1; i < SPIN_KEYS.length; i++) {
      const [o1, p1] = SPIN_KEYS[i - 1], [o2, p2] = SPIN_KEYS[i];
      if (k <= o2) return p1 + (p2 - p1) * ((k - o1) / (o2 - o1));
    }
    return 1;
  }
  // adaptive quality: if frames run slow while the die is animating, render it at lower resolution
  let perfLast = 0, perfSum = 0, perfN = 0, degraded = LITE;
  function watchPerf(now) {
    if (degraded) return;
    const dt = now - perfLast; perfLast = now;
    if (dt <= 0 || dt > 200) return;
    perfSum += dt; perfN++;
    if (perfN >= 45) {
      if (perfSum / perfN > 24) {
        degraded = true;
        [glRoll, glHero].forEach(d => d.ok && d.setMaxDpr(1));
        document.body.classList.add('lite');
      }
      perfSum = 0; perfN = 0;
    }
  }
  (function dieLoop(now) {
    requestAnimationFrame(dieLoop);
    if (document.hidden || !active) { perfLast = 0; return; }
    if (active.id === 'home' || active.id === 'roll') watchPerf(now); else perfLast = 0;
    if (active.id === 'home' && glHero.ok) { glHero.setPose(0.44 + 0.05 * Math.sin(now / 900), now / 1600); glHero.draw(); }
    if (active.id === 'roll' && glRoll.ok) {
      if (spinAnim) {
        const k = Math.min(1, (now - spinAnim.t0) / spinAnim.D), p = spinProgress(k);
        glRoll.setPose(POSE.x + 2 * Math.PI * spinAnim.kx * p, POSE.y + spinAnim.dir * 2 * Math.PI * spinAnim.ky * p);
      } else if (!die.classList.contains('landed')) {
        glRoll.setPose(POSE.x + 0.07 * Math.sin(now / 700), POSE.y + 0.14 * Math.sin(now / 1100));
      }
      if (glowAnim) { const g = Math.min(1, (now - glowAnim) / 350); glRoll.setGlow(g); if (g >= 1) glowAnim = null; }
      glRoll.draw();
    }
  })(performance.now());
  const setFaces = arr => { arr.forEach((c, i) => (faces[i].textContent = c)); if (glRoll.ok) glRoll.setFaces(arr); };
  function beginTurn() {
    const p = current();
    $('#rollWho').innerHTML = `${avatar(p, 'lg')}<div class="name"><em>${esc(p.name)}</em>'s turn</div>`;
    $('#rollWho').style.animation = 'none'; void $('#rollWho').offsetWidth; $('#rollWho').style.animation = '';
    $('#rollSub').textContent = p.streak >= 1 ? `🔥 ${p.streak} board hit${p.streak > 1 ? 's' : ''} in a row. Keep it going!` : 'Pass the phone, then roll the die';
    hud($('#roll'));
    resetDie();
    show('roll');
  }
  function resetDie() {
    rolling = false;
    die.classList.remove('landed');
    spinAnim = null; glowAnim = null;
    if (glRoll.ok) glRoll.setGlow(0);
    [die, dieAir, dieShadow].forEach(el => el.getAnimations().forEach(a => a.cancel()));
    ['#shock1', '#shock2'].forEach(s => $(s).classList.remove('go'));
    $('#letterReveal').hidden = true;
    die.classList.add('idle'); dieAir.classList.add('bob');
    setFaces('ROLLEM'.split(''));
    $('#tapHint').classList.remove('hide');
  }
  const randLetter = () => bank.dieLetters[Math.floor(Math.random() * bank.dieLetters.length)];
  const restart = (el) => { el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); };

  // tap the die, or flick upward anywhere on the stage (flick speed = throw height)
  let flick = null;
  const stageEl = $('.roll-stage');
  stageEl.addEventListener('pointerdown', e => { flick = { y: e.clientY, t: performance.now() }; });
  stageEl.addEventListener('pointerup', e => {
    if (!flick) return;
    const dy = flick.y - e.clientY, dt = Math.max(1, performance.now() - flick.t); flick = null;
    if (dy > 40 && dt < 600) roll(Math.min(1, dy / dt / 1.5));
  });
  dieBtn.addEventListener('click', () => roll(0.4));

  async function roll(power) {
    if (rolling) return;
    rolling = true;
    Sound.resume();
    const turn = E.pickTurn(bank, history, null, G.salt);
    E.recordTurn(history, turn); saveHistory();
    G.turn = turn;
    $('#tapHint').classList.add('hide');
    die.classList.remove('idle'); dieAir.classList.remove('bob');
    die.getAnimations().forEach(a => a.cancel());

    // All motion is transform-only (GPU compositor): air = height + squash, die = spin, shadow = scale.
    const D = LITE ? 1500 : 1750;
    const H = Math.round(Math.min(window.innerHeight * (0.26 + 0.12 * (power || 0)), 380));
    const L1 = 0.42, L2 = 0.68, L3 = 0.84;
    const up = 'cubic-bezier(.2,.75,.35,1)', down = 'cubic-bezier(.6,0,.85,.4)';
    dieAir.animate([
      { transform: 'translate3d(0,0,0) scale(1,1)' },
      { transform: 'translate3d(0,10px,0) scale(1.16,.8)', offset: 0.06, easing: up },
      { transform: `translate3d(0,${-H}px,0) scale(.95,1.07)`, offset: 0.23, easing: down },
      { transform: 'translate3d(0,0,0) scale(1,1)', offset: L1 - 0.015 },
      { transform: 'translate3d(0,7px,0) scale(1.17,.83)', offset: L1, easing: up },
      { transform: `translate3d(0,${-H * 0.3}px,0) scale(.97,1.04)`, offset: 0.55, easing: down },
      { transform: 'translate3d(0,4px,0) scale(1.1,.9)', offset: L2, easing: up },
      { transform: `translate3d(0,${-H * 0.09}px,0) scale(1,1)`, offset: 0.76, easing: down },
      { transform: 'translate3d(0,2px,0) scale(1.05,.95)', offset: L3, easing: up },
      { transform: 'translate3d(0,0,0) scale(1,1)' }
    ], { duration: D, fill: 'forwards' });
    const kx = 3 + (Math.random() < 0.5 ? 0 : 1), ky = 2 + (Math.random() < 0.5 ? 0 : 1), dir = Math.random() < 0.5 ? -1 : 1;
    const rot = p => `rotateX(${-20 + 360 * kx * p}deg) rotateY(${-32 + dir * 360 * ky * p}deg)`;
    spinAnim = { t0: performance.now(), D, kx, ky, dir };
    const spin = glRoll.ok ? { finished: sleep(D) } : die.animate(
      [[0, 0], [0.06, -0.012], [0.23, 0.45], [L1, 0.76], [0.55, 0.87], [L2, 0.95], [L3, 0.995], [0.92, 1.004], [1, 1]]
        .map(([o, p]) => ({ transform: rot(p), offset: o })),
      { duration: D, fill: 'forwards' });
    const sh = s => `translateX(-50%) scale(${s})`;
    dieShadow.animate([
      { transform: sh(1), opacity: 1 }, { transform: sh(1.12), opacity: 1, offset: 0.06 },
      { transform: sh(0.3), opacity: 0.3, offset: 0.23 }, { transform: sh(1.12), opacity: 1, offset: L1 },
      { transform: sh(0.7), opacity: 0.6, offset: 0.55 }, { transform: sh(1.06), opacity: 1, offset: L2 },
      { transform: sh(0.92), opacity: 0.85, offset: 0.76 }, { transform: sh(1), opacity: 1, offset: L3 }, { transform: sh(1), opacity: 1 }
    ], { duration: D, fill: 'forwards' });

    // sound synced to the bounces
    setTimeout(() => Sound.launch(), D * 0.05);
    [[L1, 1], [L2, 0.55], [L3, 0.3]].forEach(([o, s], k) => setTimeout(() => {
      Sound.clack(s);
      if (k === 0) { const st = $('#roll'); st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake'); }
    }, D * o));
    // letters flicker on the faces while airborne (cheap: a few text swaps, not every frame)
    const iv = setInterval(() => { setFaces(faces.map(() => randLetter())); Sound.rattle(); }, LITE ? 150 : 95);
    setTimeout(() => {
      clearInterval(iv);
      setFaces([turn.letter].concat(faces.slice(1).map(() => randLetter())));
    }, D * L2);

    await spin.finished.catch(() => {});
    spinAnim = null;
    if (glRoll.ok) glRoll.setPose(POSE.x, POSE.y);
    die.classList.add('landed');
    glowAnim = performance.now();
    Sound.land();
    restart($('#shock1')); restart($('#shock2')); restart($('#flash'));
    FX.at(dieBtn, 70, { speed: 12, lift: 3 });
    await sleep(380);
    // big "YOUR LETTER" reveal so the result is impossible to miss
    const lr = $('#letterReveal');
    $('#lrTile').textContent = turn.letter;
    lr.hidden = false; lr.classList.remove('out'); restart(lr);
    Sound.stinger();
    setTimeout(() => FX.burst(window.innerWidth / 2, window.innerHeight * 0.46, 90, { speed: 13 }), 180);
    await sleep(1250);
    lr.classList.add('out');
    startAnswer();
    setTimeout(() => { lr.hidden = true; lr.classList.remove('go', 'out'); }, 400);
  }

  // ---------- ANSWER ----------
  const input = $('#answerInput'), lockBtn = $('#lockBtn'), fixNote = $('#fixNote');
  function startAnswer() {
    const p = current(), t = G.turn;
    $('#ansWho').innerHTML = `${avatar(p, 'sm')}<span>${esc(p.name)}</span>`;
    $('#ansLetter').textContent = t.letter;
    $('#ansPrompt').textContent = t.cat.prompt;
    const card = $('#promptCard'); card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter');
    input.value = ''; input.placeholder = `Starts with ${t.letter}…`;
    setAnswerState('lock');
    const rr = $('#rerollBtn');
    rr.disabled = p.rerolls < 1;
    rr.textContent = p.rerolls > 0 ? '↻ Reroll' : '↻ Used';
    rr.setAttribute('aria-label', p.rerolls > 0 ? 'Reroll letter (one per game)' : 'Reroll already used');
    const mb = $('#ansMult');
    if (mult() > 1) { mb.hidden = false; mb.textContent = `Final round · ${mult()}× points`; } else mb.hidden = true;
    show('answer');
    Sound.whoosh();
    startTimer(settings.timer, G.carry);
    G.carry = null;
    Sound.startMusic();
    setTimeout(() => { if (active && active.id === 'answer') input.focus({ preventScroll: true }); }, 380);
  }

  function setAnswerState(state, note, warn) {
    G.answerState = state;
    lockBtn.textContent = state === 'submit' ? 'Submit' : 'Lock it in';
    lockBtn.classList.toggle('submit-mode', state === 'submit');
    fixNote.classList.toggle('warn', !!warn);
    fixNote.innerHTML = note || '';
    if (state === 'lock') input.classList.remove('fixed');
  }

  input.addEventListener('input', () => {
    if (G.answerState === 'submit') setAnswerState('lock');
  });

  $('#answerForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!G.timer) return;
    const val = input.value.trim().replace(/\s+/g, ' ');
    if (G.answerState === 'submit') return submitAnswer(val, false);
    if (!val) {
      input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
      Sound.tap(); toast('Type or say an answer first'); return;
    }
    const t = G.turn;
    const fix = E.suggest(t.entries, val);
    if (fix && fix.toLowerCase() !== val.toLowerCase()) {
      G.original = val;
      input.value = fix;
      input.classList.remove('fixed'); void input.offsetWidth; input.classList.add('fixed');
      setAnswerState('submit', `Autocorrected from “${esc(val)}” <button type="button" id="undoFix">Undo</button>`);
      Sound.fix();
      return;
    }
    if (!E.startsWithLetter(val, t.letter)) {
      setAnswerState('submit', `Heads up: that doesn't start with ${t.letter}. Tap Submit to send it anyway.`, true);
      Sound.tap();
      return;
    }
    submitAnswer(val, false);
  });
  fixNote.addEventListener('click', e => {
    if (e.target.id !== 'undoFix') return;
    input.value = G.original; input.classList.remove('fixed');
    setAnswerState('submit', 'Kept your spelling. Tap Submit when ready.');
    Sound.tap();
  });

  $('#rerollBtn').addEventListener('click', () => {
    const p = current();
    if (p.rerolls < 1 || !G.timer) return;
    p.rerolls--;
    G.carry = Math.max(5000, G.timer.left);
    stopTimer(); stopMic();
    input.blur();
    Sound.select();
    resetDie();
    show('roll');
    $('#rollSub').textContent = 'Reroll! The clock keeps your remaining time…';
    setTimeout(roll, 450);
  });

  // ---------- timer ----------
  const RING_C = 2 * Math.PI * 47, rtFg = $('#rtFg'), ansScr = $('#answer'), danger = $('#danger');
  rtFg.style.strokeDasharray = RING_C.toFixed(1);
  let lastHue = -1;
  function setTimerColor(f) {
    // teal (160) -> gold (45) -> red (0) as time runs out
    const h = Math.round(f > 0.5 ? 45 + (f - 0.5) * 2 * 115 : f * 2 * 45);
    if (Math.abs(h - lastHue) < 3) return;
    lastHue = h;
    ansScr.style.setProperty('--tcol', `hsl(${h} 95% 58%)`);
  }
  function startTimer(secs, startMs) {
    stopTimer();
    const fill = $('#timerFill'), num = $('#timerNum'), ring = $('#ringTimer');
    const left = startMs ? Math.min(startMs, secs * 1000) : secs * 1000;
    const T = { total: secs * 1000, left, last: performance.now(), raf: 0, lastSec: Math.ceil(left / 1000), hot: false };
    G.timer = T;
    num.classList.remove('low'); ring.classList.remove('low'); danger.classList.remove('on');
    lastHue = -1; setTimerColor(left / T.total);
    num.textContent = T.lastSec;
    fill.style.transform = `scaleX(${left / T.total})`;
    rtFg.style.strokeDashoffset = (RING_C * (1 - left / T.total)).toFixed(1);
    function frame(now) {
      if (G.timer !== T) return;
      if (!pauses.size) {
        T.left -= now - T.last;
        const f = Math.max(0, T.left / T.total);
        const sec = Math.max(0, Math.ceil(T.left / 1000));
        if (sec !== T.lastSec) {
          T.lastSec = sec; num.textContent = sec;
          if (sec <= 5 && sec > 0) {
            if (!T.hot) { T.hot = true; num.classList.add('low'); ring.classList.add('low'); danger.classList.add('on'); Sound.intensify(); }
            Sound.heartbeat(); Sound.tick(true);
          } else if (sec > 0) {
            Sound.tick(false);
            num.classList.remove('bump'); void num.offsetWidth; num.classList.add('bump');
          }
        }
        fill.style.transform = `scaleX(${f})`;
        rtFg.style.strokeDashoffset = (RING_C * (1 - f)).toFixed(1);
        setTimerColor(f);
        if (T.left <= 0) { timeUp(); return; }
      }
      T.last = now;
      T.raf = requestAnimationFrame(frame);
    }
    T.raf = requestAnimationFrame(frame);
  }
  function stopTimer() {
    if (G.timer) cancelAnimationFrame(G.timer.raf);
    G.timer = null;
    danger.classList.remove('on'); $('#ringTimer').classList.remove('low');
    Sound.stopMusic();
  }
  const pauses = new Set();
  function pauseTimer(why) { pauses.add(why || 'menu'); if (G.timer) Sound.duck(true); }
  function resumeTimer(why) {
    pauses.delete(why || 'menu');
    if (G.timer && !pauses.size) { G.timer.last = performance.now(); if (!listening) Sound.duck(false); }
  }
  function timeUp() {
    Sound.timeup();
    const fl = document.createElement('div'); fl.className = 'timeup-flash'; fl.innerHTML = "<b>TIME'S UP!</b>";
    document.body.appendChild(fl); setTimeout(() => fl.remove(), 1100);
    let val = input.value.trim();
    const fix = val && G.turn && E.suggest(G.turn.entries, val);
    if (fix) val = fix;
    submitAnswer(val, true);
  }

  // ---------- voice input ----------
  // Uses the browser's speech recognizer. One reusable instance, explicit error handling,
  // music ducked while listening, and a keyboard-dictation fallback wherever the API fails.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = $('#micBtn');
  let rec = null, listening = false, heard = false, voiceErr = null, voiceLang = 'en-US', voiceBroken = false;
  function titleCase(s) { return s.replace(/[.,!?]+$/g, '').trim().replace(/\b\w/g, c => c.toUpperCase()); }
  function bestFromSpeech(alts) {
    const t = G.turn;
    for (const alt of alts) {
      const words = alt.replace(/[.,!?]/g, '').split(/\s+/).filter(Boolean);
      for (let len = words.length; len >= 1; len--) {
        for (let s = 0; s + len <= words.length; s++) {
          const e = E.findEntry(t.entries, words.slice(s, s + len).join(' '));
          if (e) return e.display;
        }
      }
    }
    for (const alt of alts) if (E.suggest(t.entries, alt)) return titleCase(alt);
    for (const alt of alts) {
      // "um, banana" -> keep the part starting with the letter
      const words = alt.split(/\s+/); const i = words.findIndex(w => E.startsWithLetter(w, t.letter));
      if (i >= 0) return titleCase(words.slice(i).join(' '));
    }
    return titleCase(alts[0] || '');
  }
  function dictationFallback(msg) {
    voiceBroken = true;
    input.focus();
    toast(msg || 'Voice isn’t available in this browser. Tap the 🎤 on your keyboard to dictate instead.', 4200);
  }
  function setListening(on) {
    listening = on;
    micBtn.classList.toggle('listening', on);
    micBtn.setAttribute('aria-pressed', on);
    Sound.duck(on || pauses.size > 0);
    if (on) input.placeholder = 'Listening… say your answer';
    else if (G.turn) input.placeholder = `Starts with ${G.turn.letter}…`;
  }
  function makeRec() {
    const r = new SR();
    r.lang = voiceLang;
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.continuous = false;
    r.onstart = () => { heard = false; voiceErr = null; setListening(true); };
    r.onresult = ev => {
      let finalAlts = null, interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) finalAlts = Array.from(res).map(a => a.transcript.trim()).filter(Boolean);
        else interim += res[0].transcript;
      }
      if (finalAlts && finalAlts.length) {
        heard = true;
        input.value = bestFromSpeech(finalAlts);
        setAnswerState('lock');
        Sound.mic();
        try { r.stop(); } catch (e) {}
      } else if (interim) input.value = titleCase(interim);
    };
    r.onerror = ev => { voiceErr = ev.error; };
    r.onend = () => {
      setListening(false);
      const err = voiceErr; voiceErr = null;
      if (!err) { if (!heard) toast("Didn't catch that. Tap the mic and try again."); return; }
      if (err === 'aborted') return;
      if (err === 'no-speech') return toast("Didn't hear anything. Tap the mic and speak right away.");
      if (err === 'not-allowed') return toast('Microphone is blocked. Allow mic access for this site in your browser settings.', 4200);
      if (err === 'audio-capture') return toast('No microphone found. Check that no other app is using it.', 3600);
      if (err === 'language-not-supported' && voiceLang !== 'en') { voiceLang = 'en'; rec = null; return toast('Switched voice language. Tap the mic again.'); }
      // network / service-not-allowed / anything else: the browser's speech service is unavailable here
      rec = null;
      dictationFallback(err === 'network'
        ? 'Voice needs an internet connection. You can also tap the 🎤 on your keyboard to dictate.'
        : 'Voice isn’t supported here (common in home-screen apps). Tap the 🎤 on your keyboard to dictate.');
    };
    return r;
  }
  function stopMic() {
    if (rec && listening) { try { rec.abort(); } catch (e) {} }
    setListening(false);
  }
  micBtn.addEventListener('click', () => {
    if (!SR || voiceBroken) return dictationFallback();
    if (listening) { try { rec.stop(); } catch (e) {} return; }
    if (!rec) rec = makeRec();
    input.blur();
    try { rec.start(); }
    catch (e) {
      // InvalidStateError: a previous session is still closing; retry once with a fresh recognizer
      try { rec.abort(); } catch (_) {}
      rec = makeRec();
      setTimeout(() => { try { rec.start(); } catch (_) { dictationFallback(); } }, 300);
    }
  });

  // ---------- submit & reveal ----------
  async function submitAnswer(val, timedOut) {
    if (!G.timer) return;
    const T = G.timer;
    const timeLeft = Math.max(0, T.left);
    stopTimer(); stopMic();
    input.blur();
    const p = current(), t = G.turn;
    const verdict = E.judge(t.entries, t.letter, val, settings.judge === 'strict');
    if (timedOut && verdict.kind === 'blank') verdict.timeout = true;
    await reveal(p, t, val, verdict, timeLeft, T.total);
  }

  function slotHTML(entry, count, i) {
    return `<li class="slot" data-i="${i}"><div class="slot-inner">
      <div class="slot-front"><span>${i + 1}</span></div>
      <div class="slot-back"><span class="ans">${esc(entry.display)}</span><span class="cnt">${count}</span></div>
    </div></li>`;
  }

  async function reveal(p, t, val, v, timeLeft, timeTotal) {
    const scr = $('#reveal');
    $('#revWho').innerHTML = `${avatar(p, 'sm')}<span>${esc(p.name)}</span>`;
    $('#revLetter').textContent = t.letter;
    $('#revPrompt').textContent = t.cat.prompt;
    const ya = $('#yourAnswer');
    ya.className = 'your-answer' + (val ? '' : ' empty');
    ya.innerHTML = `<small>${esc(p.name)} said</small>${val ? esc(val) : (v.timeout ? 'Out of time!' : 'No answer')}`;
    $('#board').innerHTML = t.entries.slice(0, 5).map((e, i) => slotHTML(e, t.counts[i], i)).join('');
    $('#verdict').innerHTML = '';
    scr.classList.remove('voting');
    $('#vote').hidden = true;
    const next = $('#nextBtn'); next.disabled = true; next.textContent = 'Next';
    show('reveal');
    Sound.drumroll(700);
    await sleep(750);

    const slots = $$('#board .slot');
    const open = (i, hit) => { slots[i].classList.add('open'); if (hit) slots[i].classList.add('hit'); Sound.flip(); };
    let accepted = false;

    if (v.kind === 'board') {
      open(v.rank, true);
      await sleep(480);
      if (v.rank === 0) Sound.top(); else Sound.ding();
      FX.at(slots[v.rank], v.rank === 0 ? 110 : 70, { speed: v.rank === 0 ? 13 : 10 });
    } else if (v.kind === 'valid') {
      Sound.ok();
      FX.at(ya, 30, { speed: 7, colors: ['#2fe3c0', '#ffffff', '#4da3ff'] });
    } else if (v.kind === 'vote') {
      const vq = $('#voteQ');
      const judge = G.players.length > 1 ? G.players[G.order[(G.turnPos + 1) % G.order.length]] : null;
      vq.innerHTML = `${judge ? `${avatar(judge, 'sm')}<br>Pass the phone to <b>${esc(judge.name)}</b>.<br>` : ''}Does <b>“${esc(val)}”</b> count as <b>${esc(t.cat.prompt.toLowerCase())}</b> starting with <b>${t.letter}</b>?<br><span class="muted">It's not on our list. Ask the table, then ${judge ? esc(judge.name) + ' taps' : 'tap'} the verdict.</span>`;
      $('#vote').hidden = false;
      scr.classList.add('voting');
      setTimeout(() => $('#vote').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
      accepted = await new Promise(res => {
        $('#voteYes').onclick = () => res(true);
        $('#voteNo').onclick = () => res(false);
      });
      $('#vote').hidden = true;
      scr.classList.remove('voting');
      if (accepted) { Sound.ok(); FX.at(ya, 30, { speed: 7, colors: ['#2fe3c0', '#ffffff', '#4da3ff'] }); }
    }
    const good = v.kind === 'board' || v.kind === 'valid' || accepted;
    if (!good) {
      Sound.buzz();
      const s = document.createElement('div'); s.className = 'strike'; s.innerHTML = '<b>✕</b>';
      document.body.appendChild(s); setTimeout(() => s.remove(), 1000);
      scr.classList.remove('shake'); void scr.offsetWidth; scr.classList.add('shake');
    }

    // scoring
    const streakNext = v.kind === 'board' ? p.streak + 1 : 0;
    const sc = E.score({ kind: v.kind, rank: v.rank, counts: t.counts, timeLeft, timeTotal, multiplier: mult(), streak: streakNext, accepted });
    p.streak = streakNext;
    p.score += sc.total;
    if (v.kind === 'board') { p.hits++; if (v.rank === 0) p.tops++; }
    G.log.push({ player: p, round: G.round, letter: t.letter, prompt: t.cat.prompt, answer: val, kind: v.kind, rank: v.rank, pts: sc.total, timeUsed: timeTotal - timeLeft });

    // verdict
    let title, cls;
    if (v.kind === 'board') { title = v.rank === 0 ? 'TOP ANSWER!' : `#${v.rank + 1} ON THE BOARD!`; cls = 'good'; }
    else if (v.kind === 'valid') { title = 'GOOD ANSWER!'; cls = 'ok'; }
    else if (v.kind === 'vote') { title = accepted ? 'THE TABLE ALLOWS IT!' : 'THE TABLE SAYS NO'; cls = accepted ? 'ok' : 'bad'; }
    else if (v.kind === 'unlisted') { title = 'NOT ON OUR LIST'; cls = 'bad'; }
    else if (v.kind === 'wrongLetter') { title = `NOT A${'AEFHILMNORSX'.includes(t.letter) ? 'N' : ''} ${t.letter} WORD`; cls = 'bad'; }
    else { title = v.timeout ? "TIME'S UP!" : 'NO ANSWER'; cls = 'bad'; }
    const chips = [];
    if (sc.total) {
      chips.push(v.kind === 'board' ? `Survey ${sc.base}` : `Off-board ${sc.base}`);
      if (sc.speed) chips.push(`Speed +${sc.speed}`);
      if (sc.streak) chips.push(`🔥 Streak +${sc.streak}`);
      if (sc.multiplier > 1) chips.push(`×${sc.multiplier} Final`);
    }
    $('#verdict').innerHTML = `<div class="v-title ${cls}">${title}</div>
      <div class="v-pts">+<span id="ptsNum">0</span></div>
      ${chips.length ? `<div class="v-break">${chips.map(c => `<span>${c}</span>`).join('')}</div>` : ''}`;
    countUp($('#ptsNum'), 0, sc.total, 700);

    // reveal the rest of the board
    await sleep(good ? 700 : 500);
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].classList.contains('open')) continue;
      open(i, false);
      await sleep(190);
    }
    await sleep(250);
    const last = G.turnPos >= G.order.length - 1;
    next.textContent = last ? (G.round >= settings.rounds ? 'Final results' : 'Standings') : `Next: ${G.players[G.order[G.turnPos + 1]].name}`;
    next.disabled = false;
  }

  function countUp(el, from, to, ms, tickSound) {
    if (!el) return;
    const start = performance.now();
    let lastShown = from;
    function f(now) {
      const k = Math.min(1, (now - start) / ms), e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(from + (to - from) * e);
      if (v !== lastShown) { lastShown = v; el.textContent = v; if (tickSound) Sound.count(); }
      if (k < 1) requestAnimationFrame(f);
    }
    if (to === from) { el.textContent = to; return; }
    requestAnimationFrame(f);
  }

  $('#nextBtn').addEventListener('click', () => {
    Sound.select();
    if (G.turnPos < G.order.length - 1) { G.turnPos++; beginTurn(); return; }
    if (G.round >= settings.rounds) showResults();
    else showStandings();
  });

  // ---------- STANDINGS ----------
  function ranked() { return G.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.score - a.p.score || b.p.hits - a.p.hits || a.i - b.i); }
  function showStandings() {
    const before = G.players.map((p, i) => ({ i, s: G.roundStart[i] })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.i);
    const now = ranked();
    const nextFinal = G.round + 1 === settings.rounds;
    $('#standTitle').textContent = `After round ${G.round}`;
    $('#standNext').textContent = nextFinal ? `Final round · ${settings.mult}×` : `Round ${G.round + 1}`;
    const list = $('#standList');
    const rankOf = sc => 1 + now.filter(x => x.p.score > sc).length;
    list.innerHTML = now.map(({ p, i }, r) => {
      const d = p.score - G.roundStart[i];
      const rk = rankOf(p.score), lead = rk === 1, tiedLead = lead && now.filter(x => x.p.score === p.score).length > 1;
      const sub = p.streak >= 2 ? `🔥 ${p.streak} in a row` : !lead ? `${now[0].p.score - p.score} behind` : tiedLead ? 'Tied for the lead' : 'In the lead';
      return `<li class="stand-row ${lead ? 'first' : ''}" data-i="${i}">
        <span class="stand-rank">${rk}</span>${avatar(p)}
        <span class="stand-name">${esc(p.name)}${lead ? '<span class="crown" aria-hidden="true">👑</span>' : ''}<small>${sub}</small></span>
        <span class="stand-right"><span class="stand-score" data-from="${G.roundStart[i]}" data-to="${p.score}">${G.roundStart[i]}</span>
        <span class="stand-delta ${d ? '' : 'zero'}">+${d}</span></span>
      </li>`;
    }).join('');
    show('standings');
    // FLIP: rows slide from their previous rank to the new one
    const rows = $$('#standList .stand-row');
    const h = rows[0] ? rows[0].offsetHeight + 10 : 0;
    rows.forEach((row, newIdx) => {
      const prevIdx = before.indexOf(Number(row.dataset.i));
      const dy = (prevIdx - newIdx) * h;
      row.animate([{ transform: `translateY(${dy}px)`, opacity: 0.6 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: 900, delay: 450 + newIdx * 40, easing: 'cubic-bezier(.34,1.3,.64,1)', fill: 'backwards' });
      const sc = row.querySelector('.stand-score');
      setTimeout(() => countUp(sc, Number(sc.dataset.from), Number(sc.dataset.to), 900, newIdx === 0), 350);
    });
    setTimeout(() => { const lead = rows[0]; if (lead && active.id === 'standings') FX.at(lead, 40, { speed: 8 }); }, 1400);
  }
  $('#standNext').addEventListener('click', () => { Sound.select(); G.round++; startRound(); });

  // ---------- RESULTS ----------
  function showResults() {
    stopTimer();
    const r = ranked();
    const top = r[0].p.score;
    const tiedTop = r.filter(x => x.p.score === top);
    const tied = tiedTop.filter(x => x.p.hits === r[0].p.hits);
    if (tied.length > 1) $('#winnerLine').innerHTML = `It's a <em>tie!</em><small>${tied.map(x => esc(x.p.name)).join(' & ')} share the win</small>`;
    else if (tiedTop.length > 1) $('#winnerLine').innerHTML = `<em>${esc(r[0].p.name)}</em> wins!<small>Tied on ${top}, won on board hits (${r[0].p.hits})</small>`;
    else $('#winnerLine').innerHTML = `<em>${esc(r[0].p.name)}</em> wins!`;
    const podiumOrder = [1, 0, 2];
    $('#podium').innerHTML = podiumOrder.map(k => {
      const x = r[k];
      if (!x) return '<div class="pod empty"></div>';
      return `<div class="pod p${k + 1}">${avatar(x.p, k === 0 ? 'lg' : '')}<div class="pod-name">${esc(x.p.name)}</div>
        <div class="pod-block"><span class="place">${k + 1}</span><span class="pts">${x.p.score}</span></div></div>`;
    }).join('');
    $('#restList').innerHTML = r.slice(3).map(({ p }, k) => `<li class="stand-row"><span class="stand-rank">${k + 4}</span>${avatar(p, 'sm')}<span class="stand-name">${esc(p.name)}</span><span class="stand-score">${p.score}</span></li>`).join('');

    // awards
    const awards = [];
    const best = G.log.filter(l => l.pts > 0).sort((a, b) => b.pts - a.pts)[0];
    if (best) awards.push({ k: 'Best turn', v: best.player.name, d: `“${best.answer}” · ${best.pts} pts` });
    const tops = G.players.slice().sort((a, b) => b.tops - a.tops)[0];
    if (tops && tops.tops > 0) awards.push({ k: 'Survey says', v: tops.name, d: `${tops.tops} top answer${tops.tops > 1 ? 's' : ''}` });
    const fast = G.log.filter(l => l.pts > 0).sort((a, b) => a.timeUsed - b.timeUsed)[0];
    if (fast) awards.push({ k: 'Fastest answer', v: fast.player.name, d: `${(fast.timeUsed / 1000).toFixed(1)}s · “${fast.answer}”` });
    if (settings.rounds > 1) {
      const fin = G.players.map((p, i) => ({ p, g: p.score - G.roundStart[i] })).sort((a, b) => b.g - a.g)[0];
      if (fin && fin.g > 0) awards.push({ k: 'Final round hero', v: fin.p.name, d: `+${fin.g} in the final` });
    }
    $('#awards').innerHTML = awards.slice(0, 4).map(a => `<div class="award"><div class="a-k">${a.k}</div><div class="a-v">${esc(a.v)}</div><div class="a-d">${esc(a.d)}</div></div>`).join('');
    document.body.classList.remove('final-mode');
    show('results');
    Sound.fanfare();
    setTimeout(() => FX.rain(110), 300);
    setTimeout(() => { const p1 = $('.pod.p1 .avatar'); if (p1) FX.at(p1, 90, { speed: 12 }); }, 1300);
  }
  $('#rematchBtn').addEventListener('click', () => { Sound.select(); FX.clear(); newGame(G.players.map(p => p.name)); });
  $('#homeBtn').addEventListener('click', () => { Sound.tap(); FX.clear(); show('home'); });

  // ---------- menu ----------
  $$('[data-menu]').forEach(b => b.addEventListener('click', () => { Sound.tap(); pauseTimer('menu'); openModal('#menuModal'); }));
  $('#quitBtn').addEventListener('click', () => {
    Sound.tap(); closeModal('#menuModal'); pauses.clear(); stopTimer(); stopMic(); FX.clear();
    document.body.classList.remove('final-mode'); show('home');
  });
  // pause the clock if the app is backgrounded mid-answer
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseTimer('hidden'); else resumeTimer('hidden'); });

  // ---------- keyboard-aware viewport ----------
  // iOS doesn't shrink the page when the keyboard opens; it scrolls the page up instead, which pushed
  // the timer off-screen. Pin the app to the *visible* viewport so the HUD stays on top, and switch to
  // a compact answer layout while the keyboard is up.
  const vv = window.visualViewport;
  let fullH = vv ? vv.height : window.innerHeight;
  function fitViewport() {
    if (!vv) return;
    const h = vv.height, top = vv.offsetTop;
    if (h > fullH) fullH = h;
    const app = document.getElementById('app');
    app.style.height = h + 'px';
    app.style.transform = top ? `translate3d(0, ${top}px, 0)` : '';
    document.body.classList.toggle('kb', fullH - h > 140 || document.activeElement === input);
  }
  if (vv) {
    vv.addEventListener('resize', fitViewport);
    vv.addEventListener('scroll', fitViewport);
    window.addEventListener('orientationchange', () => setTimeout(() => { fullH = vv.height; fitViewport(); }, 400));
  }
  input.addEventListener('focus', () => { document.body.classList.add('kb'); setTimeout(() => { window.scrollTo(0, 0); fitViewport(); }, 60); });
  input.addEventListener('blur', () => { document.body.classList.remove('kb'); setTimeout(fitViewport, 60); });

  // ---------- boot ----------
  renderSound();
  if (!bank.dieLetters.length) toast('Prompt packs failed to load.', 5000);
  show('home');

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  // expose for testing
  window.__rollem = { G, bank, settings };
})();
