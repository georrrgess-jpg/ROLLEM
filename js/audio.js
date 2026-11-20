/* ROLL'EM — synthesized sound + music (no audio files, zero load time) + haptics */
(function () {
  'use strict';
  let ctx = null, master = null, sfxBus = null, musicBus = null, verb = null;
  const pref = (k, d) => { try { const v = localStorage.getItem('rollem.' + k); return v == null ? d : v !== 'off'; } catch (e) { return d; } };
  let enabled = pref('sound', true), musicOn = pref('music', true);

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain(); master.gain.value = 0.7;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
      // tiny synthetic room reverb for sparkle (one short impulse, built once)
      verb = ctx.createConvolver();
      const len = ctx.sampleRate * 1.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      verb.buffer = ir;
      const vg = ctx.createGain(); vg.gain.value = 0.18; verb.connect(vg); vg.connect(master);
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {});
    return ctx;
  }
  ['pointerdown', 'touchend', 'keydown'].forEach(ev => window.addEventListener(ev, () => { if (enabled) ensure(); }, { passive: true }));

  function tone(freq, dur, o) {
    if (!enabled || !ensure()) return;
    o = o || {};
    const t = (o.at || ctx.currentTime) + (o.delay || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur));
    if (o.detune) osc.detune.value = o.detune;
    const v = o.vol == null ? 0.3 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.bus || sfxBus);
    if (o.verb) g.connect(verb);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(dur, o) {
    if (!enabled || !ensure()) return;
    o = o || {};
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = (o.at || ctx.currentTime) + (o.delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.frequency.value = o.freq || 2000; f.Q.value = o.q || 1;
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
    const g = ctx.createGain();
    const v = o.vol || 0.25;
    if (o.swell) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
    else { g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
    s.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.02);
  }
  const vib = p => { try { if (enabled && navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  const chord = (notes, dur, o) => notes.forEach((f, i) => tone(f, dur, Object.assign({}, o, { delay: (o && o.delay || 0) + (o && o.strum ? i * o.strum : 0) })));

  // ---------------- music: lightweight look-ahead step sequencer ----------------
  const M = { playing: false, step: 0, next: 0, timer: 0, bpm: 116, ducked: false };
  const BASS = [55, 55, 65.41, 55, 49, 49, 58.27, 61.74];           // A minor-ish walking bass (per beat pair)
  const STAB = [[220, 261.6, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [164.8, 207.7, 246.9]];
  function drum(type, t) {
    if (type === 'k') { tone(150, 0.22, { at: t, to: 42, glide: 0.12, vol: 0.9, bus: musicBus }); }
    else if (type === 's') { noise(0.14, { at: t, freq: 1800, q: 0.6, vol: 0.45, bus: musicBus }); tone(190, 0.08, { at: t, type: 'triangle', vol: 0.2, bus: musicBus }); }
    else if (type === 'h') { noise(0.035, { at: t, freq: 9000, filter: 'highpass', vol: 0.18, bus: musicBus }); }
  }
  function schedule() {
    if (!M.playing) return;
    const spb = 60 / M.bpm / 4; // 16th notes
    while (M.next < ctx.currentTime + 0.12) {
      const st = M.step % 32, t = M.next, beat = st % 16;
      if (beat % 4 === 0) drum('k', t);
      if (M.bpm > 130 && beat % 4 === 2) drum('k', t);
      if (beat === 4 || beat === 12) drum('s', t);
      if (st % 2 === 0) drum('h', t);
      if (st % 4 === 0) tone(BASS[(st / 4) % 8], spb * 3.2, { at: t, type: 'sawtooth', lp: 500, vol: 0.32, bus: musicBus });
      if (st % 8 === 6) { const c = STAB[Math.floor(st / 8) % 4]; c.forEach(f => tone(f * 2, spb * 1.6, { at: t, type: 'square', lp: 1800, vol: 0.05, bus: musicBus })); }
      if (M.bpm > 130 && st % 2 === 1) tone(880 + (st % 4) * 110, 0.05, { at: t, type: 'square', lp: 3000, vol: 0.03, bus: musicBus });
      M.next += spb; M.step++;
    }
    M.timer = setTimeout(schedule, 30);
  }

  const S = {
    get enabled() { return enabled; },
    get music() { return musicOn; },
    setEnabled(v) { enabled = !!v; try { localStorage.setItem('rollem.sound', v ? 'on' : 'off'); } catch (e) {} if (v) ensure(); else S.stopMusic(); },
    setMusic(v) { musicOn = !!v; try { localStorage.setItem('rollem.music', v ? 'on' : 'off'); } catch (e) {} if (!v) S.stopMusic(); },
    resume() { if (enabled) ensure(); },

    startMusic() {
      if (!enabled || !musicOn || !ensure() || M.playing) return;
      M.playing = true; M.step = 0; M.bpm = 116; M.next = ctx.currentTime + 0.05;
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
      musicBus.gain.exponentialRampToValueAtTime(M.ducked ? 0.04 : 0.32, ctx.currentTime + 0.4);
      schedule();
    },
    intensify() { if (M.playing) M.bpm = 144; },
    stopMusic() {
      if (!M.playing) return;
      M.playing = false; clearTimeout(M.timer);
      if (ctx) { musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08); }
    },
    duck(on) { M.ducked = on; if (ctx && musicBus) musicBus.gain.setTargetAtTime(on ? 0.0001 : 0.32, ctx.currentTime, 0.1); },

    // ---------------- sfx ----------------
    tap() { tone(600, 0.05, { type: 'triangle', vol: 0.12 }); tone(900, 0.04, { type: 'sine', vol: 0.08, delay: 0.02 }); vib(6); },
    select() { tone(660, 0.07, { type: 'triangle', vol: 0.14 }); tone(1320, 0.1, { type: 'sine', vol: 0.09, delay: 0.045, verb: true }); vib(8); },
    launch() {
      noise(0.45, { freq: 500, sweep: 3500, q: 0.8, vol: 0.22, swell: true });
      tone(220, 0.45, { type: 'triangle', to: 880, vol: 0.08 });
      vib(15);
    },
    clack(strength) {
      const s = strength == null ? 1 : strength;
      noise(0.06, { freq: 1700 + Math.random() * 600, q: 4, vol: 0.35 * s });
      tone(520 + Math.random() * 120, 0.07, { type: 'triangle', to: 260, vol: 0.22 * s });
      tone(95, 0.12, { type: 'sine', to: 50, vol: 0.4 * s });
      vib(Math.round(12 + 20 * s));
    },
    rattle() { noise(0.03, { freq: 3000 + Math.random() * 1500, q: 5, vol: 0.08 }); },
    land() {
      tone(110, 0.3, { type: 'sine', to: 50, vol: 0.55 }); noise(0.12, { freq: 400, vol: 0.3, filter: 'lowpass' });
      chord([784, 988, 1175, 1568], 0.6, { type: 'triangle', vol: 0.11, strum: 0.05, delay: 0.06, verb: true });
      vib([30, 40, 25]);
    },
    stinger() {
      chord([392, 523, 659, 784], 0.55, { type: 'sawtooth', lp: 2600, vol: 0.075 });
      chord([196, 262], 0.6, { type: 'triangle', vol: 0.16 });
      [1568, 2093].forEach((f, i) => tone(f, 0.5, { type: 'sine', vol: 0.13, delay: 0.08 + i * 0.07, verb: true }));
      noise(0.4, { freq: 5000, filter: 'highpass', vol: 0.08 });
      vib([20, 30, 50]);
    },
    whoosh() { noise(0.3, { freq: 800, sweep: 2400, q: 0.7, vol: 0.14, swell: true }); },
    tick(urgent) {
      if (urgent) { tone(1250, 0.05, { type: 'square', vol: 0.09, lp: 4000 }); vib(10); }
      else noise(0.03, { freq: 2600, q: 6, vol: 0.16 });
    },
    heartbeat() { tone(70, 0.16, { type: 'sine', to: 45, vol: 0.6 }); tone(66, 0.16, { type: 'sine', to: 42, vol: 0.45, delay: 0.18 }); vib([25, 140, 20]); },
    flip() { noise(0.05, { freq: 3200, q: 2, vol: 0.13 }); tone(460, 0.07, { type: 'triangle', vol: 0.08 }); },
    drumroll(ms) {
      if (!enabled || !ensure()) return;
      const n = Math.floor(ms / 45), t0 = ctx.currentTime;
      for (let i = 0; i < n; i++) noise(0.05, { at: t0 + i * 0.045, freq: 1600, q: 0.7, vol: 0.05 + 0.2 * (i / n) });
    },
    ding() {
      chord([523, 659, 784], 0.5, { type: 'sawtooth', lp: 2400, vol: 0.07 });       // brass-ish stab
      [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.6, { type: 'sine', vol: 0.2, delay: 0.05 + i * 0.07, verb: true }));
      S.applause(1.4, 0.18);
      vib([20, 30, 40]);
    },
    top() { // #1 answer: bigger
      chord([523, 659, 784, 1046], 0.8, { type: 'sawtooth', lp: 2800, vol: 0.08 });
      [1046, 1318, 1568, 2093, 2637].forEach((f, i) => tone(f, 0.7, { type: 'sine', vol: 0.2, delay: 0.05 + i * 0.07, verb: true }));
      S.applause(2.2, 0.26);
      vib([30, 40, 30, 40, 60]);
    },
    applause(sec, vol) {
      if (!enabled || !ensure()) return;
      const t0 = ctx.currentTime, n = Math.floor(sec * 70);
      for (let i = 0; i < n; i++) {
        const k = i / n, env = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        noise(0.025, { at: t0 + Math.random() * sec, freq: 1200 + Math.random() * 2500, q: 2, vol: vol * (0.3 + 0.7 * env) });
      }
    },
    ok() { chord([660, 880], 0.3, { type: 'triangle', vol: 0.16, strum: 0.09, verb: true }); vib(20); },
    buzz() { tone(140, 0.6, { type: 'sawtooth', vol: 0.2, lp: 1200 }); tone(147, 0.6, { type: 'square', vol: 0.1, lp: 900 }); vib([80, 40, 80]); },
    timeup() { [880, 660, 440].forEach((f, i) => tone(f, i === 2 ? 0.4 : 0.12, { type: 'square', vol: 0.11, lp: 3000, delay: i * 0.13 })); vib([60, 40, 60]); },
    count() { tone(1500, 0.025, { type: 'square', vol: 0.03, lp: 5000 }); },
    fix() { tone(880, 0.08, { type: 'sine', vol: 0.15 }); tone(1320, 0.14, { type: 'sine', vol: 0.12, delay: 0.06, verb: true }); vib(12); },
    mic() { tone(740, 0.08, { type: 'sine', vol: 0.15 }); tone(1110, 0.1, { type: 'sine', vol: 0.12, delay: 0.07 }); },
    rankUp() { tone(660, 0.1, { type: 'triangle', vol: 0.12 }); tone(990, 0.16, { type: 'triangle', vol: 0.12, delay: 0.08, verb: true }); },
    fanfare() {
      const n = [523, 659, 784, 1046, 784, 1046, 1318];
      n.forEach((f, i) => tone(f, i === n.length - 1 ? 0.9 : 0.18, { type: 'sawtooth', lp: 2600, vol: 0.09, delay: i * 0.12 }));
      n.forEach((f, i) => tone(f / 2, 0.2, { type: 'triangle', vol: 0.12, delay: i * 0.12 }));
      chord([523, 659, 784, 1046], 1.4, { type: 'triangle', vol: 0.1, delay: 0.84, verb: true });
      S.applause(3, 0.22);
      vib([40, 60, 40, 60, 120]);
    },
    boom() {
      noise(0.2, { freq: 600, sweep: 4000, q: 0.6, vol: 0.2, swell: true });            // riser
      tone(80, 0.9, { type: 'sine', to: 32, vol: 0.7, delay: 0.18 });
      noise(0.7, { freq: 300, filter: 'lowpass', vol: 0.45, delay: 0.18 });
      chord([262, 330, 392, 523], 0.9, { type: 'sawtooth', lp: 2000, vol: 0.07, delay: 0.2, verb: true });
      vib([100, 50, 150]);
    }
  };
  window.Sound = S;
})();
