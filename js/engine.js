/* ROLL'EM — core game logic (no DOM). Works in browser (window.RollemEngine) and Node (module.exports). */
(function (root) {
  'use strict';

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVW'.split('');

  // ---------- text normalisation ----------
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^(the|a|an) (?=\S)/, '');
  }
  function stemWord(w) {
    if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.length > 4 && /(ches|shes|xes|sses|oes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  }
  // canonical key: normalised, singularised, spaces removed ("Hot Dogs" == "hotdog")
  function key(s) { return norm(s).split(' ').map(stemWord).join(''); }

  // Optimal string alignment distance (Levenshtein + adjacent transpositions)
  function dist(a, b, max) {
    if (a === b) return 0;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let p2 = null, p1 = Array.from({ length: lb + 1 }, (_, j) => j);
    for (let i = 1; i <= la; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= lb; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + cost);
        if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      p2 = p1; p1 = cur;
    }
    return p1[lb];
  }

  // ---------- seeded RNG (stable fake survey numbers) ----------
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- data ----------
  function buildBank(raw, opts) {
    const minPerLetter = (opts && opts.minPerLetter) || 1;
    const cats = [];
    const byLetter = Object.fromEntries(LETTERS.map(l => [l, []]));
    for (const c of raw || []) {
      if (!c || !c.id || !c.answers) continue;
      const cat = { id: c.id, prompt: c.prompt, letters: {} };
      for (const L of LETTERS) {
        const list = c.answers[L];
        if (!Array.isArray(list) || list.length < 5) continue;
        const entries = list.map((e, i) => {
          const forms = String(e).split('|').map(s => s.trim()).filter(Boolean);
          return { display: forms[0], keys: [...new Set(forms.map(key))], rank: i };
        });
        cat.letters[L] = entries;
        byLetter[L].push(cat);
      }
      if (Object.keys(cat.letters).length) cats.push(cat);
    }
    let dieLetters = LETTERS.filter(l => byLetter[l].length >= minPerLetter);
    if (dieLetters.length < 12) dieLetters = LETTERS.filter(l => byLetter[l].length > 0);
    return { cats, byLetter, dieLetters };
  }

  function surveyCounts(catId, letter, salt) {
    const r = rng(hash(catId + ':' + letter + ':' + (salt || 0)));
    const ranges = [[32, 44], [20, 28], [13, 18], [9, 12], [6, 8]];
    return ranges.map(([lo, hi]) => lo + Math.floor(r() * (hi - lo + 1)));
  }

  // ---------- answer matching ----------
  function startsWithLetter(input, L) { return norm(input).startsWith(L.toLowerCase()); }

  function findEntry(entries, input) {
    const k = key(input);
    if (!k) return null;
    for (const e of entries) if (e.keys.includes(k)) return e;
    return null;
  }

  function tolerance(len) { return len <= 3 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : 3; }

  // Returns a suggested display string if the input is "slightly off" from a known answer, else null.
  function suggest(entries, input) {
    const k = key(input);
    if (!k || findEntry(entries, input)) return null;
    let best = null, bestD = Infinity;
    for (const e of entries) {
      for (const ek of e.keys) {
        const tol = tolerance(Math.max(ek.length, k.length));
        if (!tol) continue;
        const d = dist(k, ek, tol);
        // prefer closer, then more popular
        if (d <= tol && (d < bestD || (d === bestD && e.rank < best.rank))) { best = e; bestD = d; }
      }
    }
    return best ? best.display : null;
  }

  // Classify a submitted answer.
  // returns { kind: 'board'|'valid'|'vote'|'wrongLetter'|'blank', entry?, rank? }
  function judge(entries, letter, input, strict) {
    if (!norm(input)) return { kind: 'blank' };
    const e = findEntry(entries, input);
    if (e) return e.rank < 5 ? { kind: 'board', entry: e, rank: e.rank } : { kind: 'valid', entry: e };
    if (!startsWithLetter(input, letter)) return { kind: 'wrongLetter' };
    return { kind: strict ? 'unlisted' : 'vote' };
  }

  // ---------- scoring ----------
  const OFF_BOARD_POINTS = 5; // always below the lowest board slot (6+)
  const SPEED_BONUS_MAX = 10;
  function score(opts) {
    // opts: { kind, rank, counts, timeLeft, timeTotal, multiplier, streak, accepted }
    let base = 0;
    if (opts.kind === 'board') base = opts.counts[opts.rank];
    else if (opts.kind === 'valid' || (opts.kind === 'vote' && opts.accepted)) base = OFF_BOARD_POINTS;
    if (!base) return { base: 0, speed: 0, streak: 0, multiplier: opts.multiplier, total: 0 };
    // speed bonus only for board hits, so an off-board answer can never outscore a board answer
    const speed = opts.kind === 'board' ? Math.round(SPEED_BONUS_MAX * Math.max(0, Math.min(1, opts.timeLeft / opts.timeTotal))) : 0;
    const streak = opts.kind === 'board' && opts.streak >= 2 ? Math.min(15, (opts.streak - 1) * 5) : 0;
    const total = (base + speed + streak) * opts.multiplier;
    return { base, speed, streak, multiplier: opts.multiplier, total };
  }

  // ---------- turn generation ----------
  // Letters with few prompts (Q, U...) come up less often; weight = prompt count, capped.
  // ---------- history-aware turn picking ----------
  // history: { n, cats: {id: lastTurn}, pairs: {"id:L": lastTurn}, letters: [recent letters] }
  function newHistory() { return { n: 0, cats: {}, pairs: {}, letters: [] }; }

  // Letters with few prompts (Q, U...) come up less often; recently rolled letters are strongly damped.
  function rollLetter(bank, history, rand) {
    const recent = history.letters.slice(-5);
    const w = bank.dieLetters.map(l => {
      let wt = Math.min(30, bank.byLetter[l].length);
      const idx = recent.lastIndexOf(l);
      if (idx >= 0) wt *= 0.08 + 0.18 * (recent.length - 1 - idx); // just rolled -> ~8% weight
      return wt;
    });
    let x = rand() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return bank.dieLetters[i]; }
    return bank.dieLetters[bank.dieLetters.length - 1];
  }

  // Least-recently-used category for the letter; never-seen categories first, ties broken randomly.
  function pickTurn(bank, history, rand, salt) {
    rand = rand || Math.random;
    history = history || newHistory();
    const letter = rollLetter(bank, history, rand);
    const options = bank.byLetter[letter];
    const age = c => {
      const a = history.cats[c.id], b = history.pairs[c.id + ':' + letter];
      // a category seen with this exact letter counts as "more recent" than one seen with another letter
      return Math.max(a == null ? -1e9 : a, b == null ? -1e9 : b + 0.5);
    };
    let best = Infinity, pool = [];
    for (const c of options) {
      const v = age(c);
      if (v < best - 1e-9) { best = v; pool = [c]; } else if (Math.abs(v - best) < 1e-9) pool.push(c);
    }
    const cat = pool[Math.floor(rand() * pool.length)];
    return { letter, cat, entries: cat.letters[letter], counts: surveyCounts(cat.id, letter, salt) };
  }
  function recordTurn(history, turn) {
    history.n++;
    history.cats[turn.cat.id] = history.n;
    history.pairs[turn.cat.id + ':' + turn.letter] = history.n;
    history.letters.push(turn.letter);
    if (history.letters.length > 12) history.letters.splice(0, history.letters.length - 12);
    return history;
  }

  const api = { LETTERS, norm, key, dist, buildBank, surveyCounts, findEntry, suggest, judge, score, pickTurn, recordTurn, newHistory, startsWithLetter, OFF_BOARD_POINTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RollemEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
