// Prints top-5 boards for a pack at a few letters, for quality review. Usage: node tools/peek.js file.js [LETTERS]
const vm = require('vm'), fs = require('fs');
const sb = { window: { ROLLEM_DATA: [] } }; vm.createContext(sb);
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), sb);
const Ls = (process.argv[3] || 'BMST').split('');
for (const c of sb.window.ROLLEM_DATA) {
  console.log(`\n${c.id} (${Object.keys(c.answers).length} letters) "${c.prompt}"`);
  for (const L of Ls) if (c.answers[L]) console.log(`  ${L}: ${c.answers[L].slice(0, 5).map(x => x.split('|')[0]).join(', ')}  (+${c.answers[L].length - 5})`);
}
