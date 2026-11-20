// Renders icons/icon.svg to PNGs with the preinstalled Playwright Chromium.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../icons/icon.svg'), 'utf8');
  const b = await chromium.launch();
  for (const [size, name, pad] of [[180, 'icon-180.png', 0], [192, 'icon-192.png', 0], [512, 'icon-512.png', 0], [512, 'icon-512-maskable.png', 0.1]]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    const inner = Math.round(size * (1 - pad * 2));
    await p.setContent(`<html><body style="margin:0;background:#120a30;display:grid;place-items:center;width:${size}px;height:${size}px">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
    await p.screenshot({ path: path.join(__dirname, '../icons', name) });
    await p.close();
  }
  await b.close();
})();
