#!/usr/bin/env node
// Validates ROLL'EM category packs in js/data/*.js
// Usage: node tools/validate-data.js [file ...]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVW'.split('');
const MIN_ANSWERS = 6; // 5 board answers + at least 1 extra valid answer

const dir = path.join(__dirname, '..', 'js', 'data');
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(dir).filter(f => f.endsWith('.js') && !f.startsWith('_')).map(f => path.join(dir, f));

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/^(the|a|an) /, '');

const sandbox = { window: {} };
sandbox.window.ROLLEM_DATA = [];
vm.createContext(sandbox);

let errors = 0, warnings = 0;
const err = m => { errors++; console.log('ERROR  ' + m); };
const warn = m => { warnings++; console.log('warn   ' + m); };

for (const f of files) {
  const before = sandbox.window.ROLLEM_DATA.length;
  try { vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f }); }
  catch (e) { err(`${path.basename(f)}: failed to load: ${e.message}`); continue; }
  const added = sandbox.window.ROLLEM_DATA.slice(before);
  if (!added.length) err(`${path.basename(f)}: added no categories (use window.ROLLEM_DATA.push(...))`);
}

const cats = sandbox.window.ROLLEM_DATA;
const ids = new Set();
const letterCoverage = Object.fromEntries(LETTERS.map(l => [l, 0]));

for (const c of cats) {
  const tag = c.id || '(no id)';
  if (!c.id || !/^[a-z0-9_]+$/.test(c.id)) err(`${tag}: id must be snake_case`);
  if (ids.has(c.id)) err(`${tag}: duplicate id`);
  ids.add(c.id);
  if (!c.prompt || typeof c.prompt !== 'string') err(`${tag}: missing prompt`);
  if (!c.answers || typeof c.answers !== 'object') { err(`${tag}: missing answers`); continue; }
  for (const [L, list] of Object.entries(c.answers)) {
    if (!LETTERS.includes(L)) { err(`${tag}/${L}: invalid letter key (X, Y, Z not allowed)`); continue; }
    if (!Array.isArray(list)) { err(`${tag}/${L}: must be an array`); continue; }
    if (list.length < MIN_ANSWERS) { err(`${tag}/${L}: only ${list.length} answers (need >= ${MIN_ANSWERS}); remove the letter instead`); continue; }
    const seen = new Set();
    for (const entry of list) {
      const forms = String(entry).split('|').map(s => s.trim()).filter(Boolean);
      if (!forms.length) { err(`${tag}/${L}: empty entry`); continue; }
      for (const form of forms) {
        const n = norm(form);
        if (!n.startsWith(L.toLowerCase())) err(`${tag}/${L}: "${form}" does not start with ${L} (after dropping leading The/A/An)`);
        if (seen.has(n)) err(`${tag}/${L}: duplicate "${form}"`);
        seen.add(n);
      }
      if (forms[0].length > 22) warn(`${tag}/${L}: long display name "${forms[0]}" (may wrap on board)`);
    }
    letterCoverage[L]++;
  }
}

console.log(`\n${cats.length} categories loaded.`);
console.log('Categories available per letter:');
console.log(LETTERS.map(l => `${l}:${letterCoverage[l]}`).join('  '));
for (const l of LETTERS) if (cats.length >= 30 && letterCoverage[l] < 8) warn(`letter ${l} has only ${letterCoverage[l]} categories`);
console.log(`\n${errors} errors, ${warnings} warnings`);
process.exit(errors ? 1 : 0);
