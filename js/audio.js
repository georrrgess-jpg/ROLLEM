/* ROLL'EM — synthesized sound effects (no audio files, zero load time) + haptics */
(function () {
  'use strict';
  let ctx = null, master = null, enabled = true;
  try { enabled = localStorage.getItem('rollem.sound') !== 'off'; } catch (e) {}

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // unlock audio on first interaction (iOS)
  ['pointerdown', 'touchstart', 'keydown'].forEach(ev => window.addEventListener(ev, () => { if (enabled) ensure(); }, { once: true, passive: true }));

  function tone(freq, dur, opts) {
    if (!enabled || !ensure()) return;
    opts = opts || {};
    const t = ctx.currentTime + (opts.delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const v = opts.vol == null ? 0.3 : opts.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (opts.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(dur, opts) {
    if (!enabled || !ensure()) return;
    opts = opts || {};
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + (opts.delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = opts.filter || 'bandpass'; f.frequency.value = opts.freq || 2000; f.Q.value = opts.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  const vib = p => { try { if (enabled && navigator.vibrate) navigator.vibrate(p); } catch (e) {} };

  const S = {
    get enabled() { return enabled; },
    setEnabled(v) { enabled = !!v; try { localStorage.setItem('rollem.sound', v ? 'on' : 'off'); } catch (e) {} if (v) ensure(); },
    tap() { tone(520, 0.06, { type: 'triangle', vol: 0.15 }); vib(8); },
    select() { tone(660, 0.07, { type: 'triangle', vol: 0.15 }); tone(990, 0.08, { type: 'triangle', vol: 0.1, delay: 0.04 }); vib(8); },
    rattle(i) { noise(0.05, { freq: 2600 + Math.random() * 1800, q: 3, vol: 0.22 }); tone(180 + Math.random() * 120, 0.05, { type: 'square', vol: 0.05 }); if (i % 3 === 0) vib(6); },
    land() {
      tone(110, 0.25, { type: 'sine', to: 55, vol: 0.5 }); noise(0.12, { freq: 400, vol: 0.3, filter: 'lowpass' });
      [784, 988, 1319].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.16, delay: 0.08 + i * 0.06 }));
      vib([30, 40, 20]);
    },
    whoosh() { noise(0.35, { freq: 900, q: 0.7, vol: 0.18 }); },
    tick(urgent) { tone(urgent ? 1200 : 900, 0.05, { type: 'square', vol: urgent ? 0.12 : 0.06 }); if (urgent) vib(10); },
    flip() { noise(0.06, { freq: 3000, q: 2, vol: 0.15 }); tone(420, 0.08, { type: 'triangle', vol: 0.08 }); },
    ding() {
      [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.5, { type: 'sine', vol: 0.22, delay: i * 0.07 }));
      tone(523, 0.6, { type: 'triangle', vol: 0.15 });
      vib([20, 30, 40]);
    },
    ok() { tone(660, 0.15, { type: 'triangle', vol: 0.2 }); tone(880, 0.25, { type: 'triangle', vol: 0.2, delay: 0.1 }); vib(20); },
    buzz() { tone(140, 0.55, { type: 'sawtooth', vol: 0.22 }); tone(147, 0.55, { type: 'square', vol: 0.12 }); vib([80, 40, 80]); },
    timeup() { tone(880, 0.12, { type: 'square', vol: 0.12 }); tone(660, 0.12, { type: 'square', vol: 0.12, delay: 0.13 }); tone(440, 0.35, { type: 'square', vol: 0.12, delay: 0.26 }); vib([60, 40, 60]); },
    count() { tone(1400, 0.03, { type: 'square', vol: 0.04 }); },
    fix() { tone(880, 0.08, { type: 'sine', vol: 0.15 }); tone(1320, 0.12, { type: 'sine', vol: 0.12, delay: 0.06 }); vib(12); },
    mic() { tone(740, 0.08, { type: 'sine', vol: 0.15 }); tone(1110, 0.1, { type: 'sine', vol: 0.12, delay: 0.07 }); },
    fanfare() {
      const n = [523, 659, 784, 1046, 784, 1046, 1318];
      n.forEach((f, i) => tone(f, i === n.length - 1 ? 0.8 : 0.18, { type: 'triangle', vol: 0.2, delay: i * 0.12 }));
      n.forEach((f, i) => tone(f / 2, 0.2, { type: 'sine', vol: 0.12, delay: i * 0.12 }));
      vib([40, 60, 40, 60, 120]);
    },
    boom() { tone(80, 0.8, { type: 'sine', to: 35, vol: 0.6 }); noise(0.6, { freq: 300, filter: 'lowpass', vol: 0.4 }); [523, 659, 784].forEach((f, i) => tone(f, 0.6, { type: 'sawtooth', vol: 0.06, delay: 0.1 + i * 0.05 })); vib([100, 50, 150]); }
  };
  window.Sound = S;
})();
