// Removes answer forms that collide (after normalisation) with an earlier entry in the same letter.
// Entries left with no forms are dropped. Usage: node tools/dedupe-data.js file.js [...]
const fs = require('fs');
const E = require('../js/engine.js');
for (const f of process.argv.slice(2)) {
  let s = fs.readFileSync(f, 'utf8'), removed = 0;
  s = s.replace(/(\b[A-W]:\s*\[)([^\]]*)\]/g, (m, head, body) => {
    const items = body.match(/"[^"]*"/g) || [];
    const seen = new Set(), keep = [];
    for (const it of items) {
      const forms = it.slice(1, -1).split('|').filter(x => !seen.has(E.key(x)));
      const uniq = []; for (const x of forms) { const k = E.key(x); if (!uniq.some(u => E.key(u) === k)) uniq.push(x); }
      if (uniq.length < it.slice(1, -1).split('|').length) removed++;
      if (!uniq.length) continue;
      uniq.forEach(x => seen.add(E.key(x)));
      keep.push('"' + uniq.join('|') + '"');
    }
    return head + keep.join(', ') + ']';
  });
  fs.writeFileSync(f, s);
  console.log(`${f}: cleaned ${removed} entries`);
}
