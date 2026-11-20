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
  const settings = Object.assign({ timer: 20, rounds: 5, mult: 2 }, store.get('settings', {}));
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
  function renderSound() {
    $('#soundToggle').innerHTML = Sound.enabled ? ICON_ON : ICON_OFF;
    $('#menuSound').textContent = Sound.enabled ? 'Sound: On' : 'Sound: Off';
  }
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
      settings[key] = Number(b.dataset.v); store.set('settings', settings); Sound.select();
      el.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-checked', c === b));
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
  function renderSetup() {
    renderPlayers();
    renderChips($('#timerChips'), TIMERS, settings.timer, v => v + 's', 'timer');
    renderChips($('#roundChips'), ROUNDS, settings.rounds, v => String(v), 'rounds');
    renderChips($('#multChips'), MULTS, settings.mult, v => (v === 2 ? '2× Double' : '3× Triple'), 'mult');
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
  const die = $('#die'), dieBtn = $('#dieBtn'), faces = $$('#die .face');
  let rolling = false, autoRoll = false;
  function beginTurn() {
    const p = current();
    $('#rollWho').innerHTML = `${avatar(p, 'lg')}<div class="name"><em>${esc(p.name)}</em>'s turn</div>`;
    $('#rollWho').style.animation = 'none'; void $('#rollWho').offsetWidth; $('#rollWho').style.animation = '';
    $('#rollSub').textContent = p.streak >= 1 ? `🔥 ${p.streak} board hit${p.streak > 1 ? 's' : ''} in a row. Keep it going!` : 'Pass the phone, then tap the die';
    hud($('#roll'));
    resetDie();
    show('roll');
  }
  function resetDie() {
    rolling = false;
    dieBtn.classList.remove('rolling', 'landed');
    die.classList.remove('landed');
    die.getAnimations().forEach(a => a.cancel());
    die.classList.add('idle');
    const sample = ['R', 'O', 'L', 'L', 'E', 'M'];
    faces.forEach((f, i) => (f.textContent = sample[i]));
    $('#tapHint').classList.remove('hide');
  }
  const randLetter = () => bank.dieLetters[Math.floor(Math.random() * bank.dieLetters.length)];

  async function roll() {
    if (rolling) return;
    rolling = true;
    const turn = E.pickTurn(bank, G.used, null, G.salt);
    G.turn = turn;
    G.used.add(turn.cat.id + ':' + turn.letter); G.used.add(turn.cat.id);
    $('#tapHint').classList.add('hide');
    die.classList.remove('idle');
    dieBtn.classList.add('rolling');

    const D = 1650;
    const xs = 1440 - 12, ys = 1080 - 16;
    const anim = die.animate([
      { transform: 'translateY(0) rotateX(-18deg) rotateY(-28deg) scale(1)', easing: 'cubic-bezier(.2,.7,.4,1)' },
      { transform: 'translateY(-34vh) rotateX(420deg) rotateY(300deg) scale(1.12)', offset: 0.22, easing: 'cubic-bezier(.6,0,.9,.5)' },
      { transform: 'translateY(0) rotateX(860deg) rotateY(640deg) scale(1)', offset: 0.45, easing: 'cubic-bezier(.2,.7,.4,1)' },
      { transform: 'translateY(-10vh) rotateX(1160deg) rotateY(880deg) scale(1.05)', offset: 0.6, easing: 'cubic-bezier(.6,0,.9,.5)' },
      { transform: 'translateY(0) rotateX(1360deg) rotateY(1030deg) scale(1)', offset: 0.76, easing: 'cubic-bezier(.2,.7,.4,1)' },
      { transform: 'translateY(-2.5vh) rotateX(1410deg) rotateY(1058deg)', offset: 0.87, easing: 'cubic-bezier(.6,0,.9,.5)' },
      { transform: `translateY(0) rotateX(${xs}deg) rotateY(${ys}deg) scale(1)` }
    ], { duration: D, fill: 'forwards' });

    const start = performance.now();
    let i = 0, lastSwap = 0;
    await new Promise(resolve => {
      function frame(now) {
        const t = now - start;
        if (t < D * 0.74) {
          if (now - lastSwap > 60 + t / 25) {
            lastSwap = now;
            faces.forEach(f => (f.textContent = randLetter()));
            Sound.rattle(i++);
          }
          requestAnimationFrame(frame);
        } else {
          faces[0].textContent = turn.letter;
          faces.slice(1).forEach(f => (f.textContent = randLetter()));
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
    await anim.finished.catch(() => {});
    die.classList.add('landed');
    dieBtn.classList.add('landed');
    Sound.land();
    FX.at(dieBtn, 70, { speed: 11, lift: 3 });
    const stage = $('#roll'); stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
    await sleep(850);
    startAnswer();
  }
  dieBtn.addEventListener('click', roll);

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
  function startTimer(secs, startMs) {
    stopTimer();
    const fill = $('#timerFill'), num = $('#timerNum');
    const left = startMs ? Math.min(startMs, secs * 1000) : secs * 1000;
    const T = { total: secs * 1000, left, last: performance.now(), raf: 0, lastSec: Math.ceil(left / 1000) };
    G.timer = T;
    fill.classList.remove('low'); num.classList.remove('low');
    num.textContent = T.lastSec;
    fill.style.transform = `scaleX(${left / T.total})`;
    function frame(now) {
      if (G.timer !== T) return;
      if (!pauses.size) {
        T.left -= now - T.last;
        const sec = Math.max(0, Math.ceil(T.left / 1000));
        if (sec !== T.lastSec) {
          T.lastSec = sec; num.textContent = sec;
          if (sec <= 5 && sec > 0) { num.classList.add('low'); fill.classList.add('low'); Sound.tick(true); }
          else if (sec > 0) Sound.tick(false);
        }
        fill.style.transform = `scaleX(${Math.max(0, T.left / T.total)})`;
        if (T.left <= 0) { timeUp(); return; }
      }
      T.last = now;
      T.raf = requestAnimationFrame(frame);
    }
    T.raf = requestAnimationFrame(frame);
  }
  function stopTimer() { if (G.timer) cancelAnimationFrame(G.timer.raf); G.timer = null; }
  const pauses = new Set();
  function pauseTimer(why) { pauses.add(why || 'menu'); }
  function resumeTimer(why) { pauses.delete(why || 'menu'); if (G.timer && !pauses.size) G.timer.last = performance.now(); }
  function timeUp() {
    Sound.timeup();
    let val = input.value.trim();
    const fix = val && G.turn && E.suggest(G.turn.entries, val);
    if (fix) val = fix;
    submitAnswer(val, true);
  }

  // ---------- voice input ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = $('#micBtn');
  let rec = null, listening = false;
  if (!SR) micBtn.hidden = true;
  function titleCase(s) { return s.replace(/[.,!?]+$/g, '').trim().replace(/\b\w/g, c => c.toUpperCase()); }
  function bestFromSpeech(alts) {
    const t = G.turn;
    // 1) any alternative, or any word-span inside it, that exactly matches a known answer (longest span wins)
    for (const alt of alts) {
      const words = alt.replace(/[.,!?]/g, '').split(/\s+/).filter(Boolean);
      for (let len = words.length; len >= 1; len--) {
        for (let s = 0; s + len <= words.length; s++) {
          const span = words.slice(s, s + len).join(' ');
          const e = E.findEntry(t.entries, span);
          if (e) return e.display;
        }
      }
    }
    // 2) close to a known answer (autocorrect will tidy it on Lock)
    for (const alt of alts) if (E.suggest(t.entries, alt)) return titleCase(alt);
    // 3) starts with the right letter
    for (const alt of alts) if (E.startsWithLetter(alt, t.letter)) return titleCase(alt);
    return titleCase(alts[0] || '');
  }
  function stopMic() {
    if (rec && listening) { try { rec.abort(); } catch (e) {} }
    listening = false; micBtn.classList.remove('listening');
  }
  micBtn.addEventListener('click', () => {
    if (!SR) return;
    if (listening) { try { rec.stop(); } catch (e) {} return; }
    rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 6;
    rec.continuous = false;
    rec.onstart = () => { listening = true; micBtn.classList.add('listening'); input.placeholder = 'Listening…'; };
    rec.onresult = ev => {
      const res = ev.results[ev.results.length - 1];
      if (res.isFinal) {
        const alts = Array.from(res).map(a => a.transcript.trim()).filter(Boolean);
        input.value = bestFromSpeech(alts);
        setAnswerState('lock');
        Sound.mic();
      } else {
        input.value = titleCase(res[0].transcript);
      }
    };
    rec.onerror = ev => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') toast('Microphone is blocked. Allow it in your browser settings.', 3200);
      else if (ev.error === 'no-speech') toast("Didn't catch that. Try again!");
      else if (ev.error !== 'aborted') toast('Voice input hiccup. Try again or type it.');
    };
    rec.onend = () => { listening = false; micBtn.classList.remove('listening'); if (G.turn) input.placeholder = `Starts with ${G.turn.letter}…`; };
    try { input.blur(); rec.start(); Sound.mic(); } catch (e) { toast('Voice input is not available right now.'); }
  });

  // ---------- submit & reveal ----------
  async function submitAnswer(val, timedOut) {
    if (!G.timer) return;
    const T = G.timer;
    const timeLeft = Math.max(0, T.left);
    stopTimer(); stopMic();
    input.blur();
    const p = current(), t = G.turn;
    const verdict = E.judge(t.entries, t.letter, val);
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
    await sleep(650);

    const slots = $$('#board .slot');
    const open = (i, hit) => { slots[i].classList.add('open'); if (hit) slots[i].classList.add('hit'); Sound.flip(); };
    let accepted = false;

    if (v.kind === 'board') {
      open(v.rank, true);
      await sleep(480);
      Sound.ding();
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
