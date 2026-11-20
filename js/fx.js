/* ROLL'EM — lightweight particle FX on a single canvas (only animates while particles exist) */
(function () {
  'use strict';
  const cv = document.getElementById('fx');
  const c = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, parts = [], running = false;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  const PALETTE = ['#ffc93c', '#ff3d8b', '#2fe3c0', '#4da3ff', '#ffffff', '#ff9d00'];

  function loop() {
    c.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= 1;
      if (p.life <= 0 || p.y > H + 40) { parts.splice(i, 1); continue; }
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.g;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      const a = Math.min(1, p.life / 25);
      c.globalAlpha = a;
      c.fillStyle = p.color;
      if (p.shape === 'rect') {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.scale(1, Math.abs(Math.cos(p.rot * 1.7)) * 0.8 + 0.2);
        c.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66); c.restore();
      } else if (p.shape === 'star') {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.beginPath();
        for (let k = 0; k < 4; k++) { c.rotate(Math.PI / 2); c.moveTo(0, 0); c.lineTo(p.s * 0.25, p.s * 0.25); c.lineTo(0, p.s); c.lineTo(-p.s * 0.25, p.s * 0.25); }
        c.fill(); c.restore();
      } else {
        c.beginPath(); c.arc(p.x, p.y, p.s / 2, 0, 6.283); c.fill();
      }
    }
    c.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(loop); else { running = false; c.clearRect(0, 0, W, H); }
  }
  function kick() { if (!running) { running = true; requestAnimationFrame(loop); } }

  const FX = {
    burst(x, y, n, opts) {
      if (reduce) return;
      opts = opts || {};
      n = Math.min(n || 40, 160);
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2, sp = (opts.speed || 9) * (0.35 + Math.random() * 0.75);
        parts.push({
          x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (opts.lift || 2),
          g: opts.gravity == null ? 0.28 : opts.gravity, drag: 0.96,
          s: (opts.size || 9) * (0.5 + Math.random()), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
          life: (opts.life || 70) * (0.6 + Math.random() * 0.6),
          color: (opts.colors || PALETTE)[i % (opts.colors || PALETTE).length],
          shape: opts.shape || (Math.random() < 0.6 ? 'rect' : Math.random() < 0.5 ? 'star' : 'dot')
        });
      }
      kick();
    },
    rain(n) {
      if (reduce) return;
      n = Math.min(n || 120, 200);
      for (let i = 0; i < n; i++) {
        parts.push({
          x: Math.random() * W, y: -20 - Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3,
          g: 0.05, drag: 0.995, s: 8 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
          life: 260 + Math.random() * 120, color: PALETTE[i % PALETTE.length], shape: 'rect'
        });
      }
      kick();
    },
    at(el, n, opts) {
      const r = el.getBoundingClientRect();
      FX.burst(r.left + r.width / 2, r.top + r.height / 2, n, opts);
    },
    clear() { parts = []; }
  };
  window.FX = FX;
})();
