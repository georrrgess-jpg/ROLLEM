/* ROLL'EM — menu themes and dice designs */
(function () {
  'use strict';
  const T = (id, name, bg0, bg1, hi, lo, o1, o2, o3) => ({ id, name, bg0, bg1, hi, lo, o1, o2, o3 });
  const THEMES = [
    T('midnight', 'Midnight', '#120a30', '#1d0f4a', '#3b1a8c', '#3a0f5e', '122,59,255,.55', '255,47,125,.38', '31,182,255,.25'),
    T('sunset', 'Sunset', '#1f0a1c', '#3a1030', '#9a3346', '#5e1f0f', '255,120,40,.5', '255,47,125,.42', '255,200,60,.25'),
    T('ocean', 'Ocean', '#04142a', '#08294a', '#0e5a8c', '#06324f', '20,160,255,.5', '0,220,200,.32', '80,90,255,.3'),
    T('forest', 'Forest', '#06180f', '#0d2a1a', '#1f6b3b', '#12371f', '60,200,110,.45', '200,230,90,.25', '20,140,120,.3'),
    T('neon', 'Neon Arcade', '#05040b', '#0d0a1c', '#2a0f4a', '#08202a', '0,240,255,.4', '255,0,200,.4', '120,255,80,.2'),
    T('candy', 'Candy', '#2a0b2e', '#4a1650', '#a43c8c', '#5a2a7a', '255,120,200,.5', '140,120,255,.45', '120,230,255,.25'),
    T('ember', 'Ember', '#160505', '#2a0a08', '#7a1a0e', '#3a0c05', '255,70,30,.5', '255,160,0,.35', '200,20,60,.3'),
    T('galaxy', 'Galaxy', '#03030f', '#0a0b26', '#22205e', '#1a0b3a', '90,80,255,.42', '200,80,255,.3', '60,200,255,.22'),
    T('arctic', 'Arctic', '#0a1626', '#12263d', '#2d5a85', '#1a3350', '150,220,255,.4', '200,240,255,.2', '90,140,255,.3'),
    T('royal', 'Royal Gold', '#120818', '#24102e', '#4a2060', '#2a1405', '255,190,60,.42', '160,60,255,.4', '255,120,60,.2'),
    T('mint', 'Mint', '#04201e', '#0a3330', '#1a6e66', '#0d3d3a', '80,255,200,.4', '40,200,255,.25', '255,255,150,.15'),
    T('noir', 'Noir', '#0b0b0e', '#18181e', '#3a3a46', '#222228', '255,255,255,.12', '160,160,180,.12', '255,255,255,.06')
  ];
  const D = (id, name, base, ink, o) => Object.assign({ id, name, base, ink, spec: 0.6, shin: 56 }, o || {});
  const DICE = [
    D('classic', 'Classic', [0.99, 0.965, 0.915], [0.85, 0.08, 0.38]),
    D('ruby', 'Ruby', [0.78, 0.06, 0.16], [1, 0.96, 0.92], { spec: 0.85, shin: 80 }),
    D('onyx', 'Onyx', [0.07, 0.07, 0.09], [1, 0.78, 0.25], { spec: 0.75, shin: 90 }),
    D('gold', 'Gold', [0.95, 0.72, 0.25], [0.32, 0.16, 0.02], { spec: 1, shin: 38, metal: 0.85 }),
    D('sapphire', 'Sapphire', [0.1, 0.32, 0.85], [1, 1, 1], { spec: 0.8, shin: 70 }),
    D('mint', 'Mint', [0.62, 0.93, 0.8], [0.04, 0.38, 0.28], { spec: 0.5, shin: 50 }),
    D('bubblegum', 'Bubblegum', [1, 0.6, 0.8], [0.5, 0.04, 0.36], { spec: 0.6, shin: 50 }),
    D('marble', 'Marble', [0.96, 0.96, 0.97], [0.1, 0.1, 0.12], { base2: [0.42, 0.44, 0.5], pat: 1, spec: 0.75, shin: 70 }),
    D('wood', 'Wood', [0.8, 0.54, 0.31], [0.22, 0.1, 0.03], { base2: [0.55, 0.32, 0.15], pat: 2, spec: 0.2, shin: 20 }),
    D('neon', 'Neon', [0.06, 0.05, 0.12], [0.2, 1, 0.95], { glow: 0.9, spec: 0.5, shin: 80 }),
    D('galaxy', 'Galaxy', [0.08, 0.05, 0.25], [1, 1, 1], { base2: [0.38, 0.1, 0.48], pat: 3, spec: 0.6, shin: 70 }),
    D('lava', 'Lava', [0.16, 0.05, 0.03], [1, 0.45, 0.1], { glow: 0.8, spec: 0.5, shin: 60 }),
    D('lakers', 'Lakers', [0.333, 0.145, 0.514], [0.992, 0.725, 0.153], { base2: [0.992, 0.725, 0.153], ink2: [0.333, 0.145, 0.514], pat: 4, spec: 0.8, shin: 70 })
  ];
  const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');

  function applyTheme(id) {
    const t = THEMES.find(x => x.id === id) || THEMES[0];
    const r = document.documentElement.style;
    r.setProperty('--bg-0', t.bg0); r.setProperty('--bg-1', t.bg1);
    r.setProperty('--bg-hi', t.hi); r.setProperty('--bg-lo', t.lo);
    r.setProperty('--orb1', `rgba(${t.o1})`); r.setProperty('--orb2', `rgba(${t.o2})`); r.setProperty('--orb3', `rgba(${t.o3})`);
    document.body.dataset.theme = t.id;
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t.bg0;
    return t;
  }
  function applyDice(id) {
    const d = DICE.find(x => x.id === id) || DICE[0];
    const r = document.documentElement.style;
    r.setProperty('--die-face', hex(d.base)); r.setProperty('--die-face2', hex(d.base2 || d.base)); r.setProperty('--die-ink', hex(d.ink));
    if (window.Die3D) Die3D.setDesignAll(d);
    return d;
  }
  window.RollemLooks = { THEMES, DICE, applyTheme, applyDice, hex };
})();
