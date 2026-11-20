// Unit tests for js/engine.js + cross-checks on the loaded data. Usage: node tools/test-engine.js
const E = require('../js/engine.js');
const fs = require('fs'), path = require('path'), vm = require('vm');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } };

// matching
const entries = ['Apple|Apples', 'Avocado', 'Apricot', 'Acai', 'Ackee', 'Asian Pear', 'Hot Dog|Hotdog'].map((e, i) => {
  const f = e.split('|'); return { display: f[0], keys: [...new Set(f.map(E.key))], rank: i };
});
ok(E.findEntry(entries, 'apple'), 'exact lower');
ok(E.findEntry(entries, '  APPLES!! '), 'plural + punctuation');
ok(E.findEntry(entries, 'an apple'), 'article');
ok(E.findEntry(entries, 'asianpear'), 'spaces ignored');
ok(E.findEntry(entries, 'hot dogs'), 'multiword plural');
ok(E.suggest(entries, 'aple') === 'Apple', 'typo -> Apple');
ok(E.suggest(entries, 'avacado') === 'Avocado', 'typo -> Avocado');
ok(E.suggest(entries, 'apricto') === 'Apricot', 'transposition');
ok(E.suggest(entries, 'apple') === null, 'no suggestion on exact');
ok(E.suggest(entries, 'ant') === null, 'short words not corrected');
ok(E.suggest(entries, 'banana') === null, 'unrelated not corrected');
ok(E.judge(entries, 'A', 'Apple').kind === 'board', 'board');
ok(E.judge(entries, 'A', 'Asian pear').kind === 'valid', 'valid off-board');
ok(E.judge(entries, 'A', 'Ambrosia').kind === 'vote', 'vote');
ok(E.judge(entries, 'A', 'Banana').kind === 'wrongLetter', 'wrong letter');
ok(E.judge(entries, 'A', '  ').kind === 'blank', 'blank');
// scoring
const counts = [40, 25, 15, 9, 5];
let s = E.score({ kind: 'board', rank: 0, counts, timeLeft: 10, timeTotal: 20, multiplier: 1, streak: 1 });
ok(s.total === 45, 'board #1 + half speed = 45, got ' + s.total);
s = E.score({ kind: 'board', rank: 4, counts, timeLeft: 0, timeTotal: 20, multiplier: 2, streak: 3 });
ok(s.total === (5 + 0 + 10) * 2, 'final x2 with streak, got ' + s.total);
s = E.score({ kind: 'vote', accepted: false, counts, timeLeft: 20, timeTotal: 20, multiplier: 1, streak: 0 });
ok(s.total === 0, 'rejected vote 0');
s = E.score({ kind: 'valid', counts, timeLeft: 20, timeTotal: 20, multiplier: 1, streak: 0 });
ok(s.total === 20, 'valid 10 + speed 10');
const sc = E.surveyCounts('fruit', 'A');
ok(sc.every((v, i) => i === 0 || v < sc[i - 1]) && sc.reduce((a, b) => a + b) <= 100, 'survey counts descending and <= 100');

// data cross-checks
const sb = { window: { ROLLEM_DATA: [] } }; vm.createContext(sb);
const dir = path.join(__dirname, '../js/data');
for (const f of fs.readdirSync(dir).filter(f => !f.startsWith('_'))) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sb);
const bank = E.buildBank(sb.window.ROLLEM_DATA);
let collisions = 0;
for (const c of bank.cats) for (const [L, list] of Object.entries(c.letters)) {
  const seen = new Map();
  for (const e of list) for (const k of e.keys) {
    if (seen.has(k) && seen.get(k) !== e) { collisions++; if (collisions < 15) console.log(`collision ${c.id}/${L}: "${e.display}" vs "${seen.get(k).display}"`); }
    seen.set(k, e);
  }
}
ok(collisions === 0, collisions + ' key collisions');
console.log(`die letters (${bank.dieLetters.length}): ${bank.dieLetters.join('')}`);
console.log('prompts per letter: ' + bank.dieLetters.map(l => l + bank.byLetter[l].length).join(' '));
// simulate many turns
const used = new Set();
for (let i = 0; i < 2000; i++) { const t = E.pickTurn(bank, used); ok(t.entries.length >= 5, 'turn has board'); }
console.log(fails ? `${fails} FAILURES` : 'all tests passed');
process.exit(fails ? 1 : 0);
