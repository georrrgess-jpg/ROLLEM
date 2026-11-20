// Moves the named answers to the front of a board, in the given order. Usage: node tools/promote.js file.js cat_id L "A,B,C"
const fs = require('fs');
const [file, id, L, list] = process.argv.slice(2);
let s = fs.readFileSync(file, 'utf8');
const i = s.indexOf(`id: "${id}"`); if (i < 0) throw new Error('no category ' + id);
const j = s.indexOf('id: "', i + 5) < 0 ? s.length : s.indexOf('id: "', i + 5);
let blk = s.slice(i, j);
blk = blk.replace(new RegExp(`(\\b${L}:\\s*\\[)([^\\]]*)\\]`), (m, h, body) => {
  const items = body.match(/"[^"]*"/g); const want = list.split(',').map(x => x.trim().toLowerCase());
  const first = want.map(w => items.find(it => it.slice(1, -1).split('|')[0].toLowerCase() === w)).filter(Boolean);
  return h + first.concat(items.filter(it => !first.includes(it))).join(', ') + ']';
});
fs.writeFileSync(file, s.slice(0, i) + blk + s.slice(j));
