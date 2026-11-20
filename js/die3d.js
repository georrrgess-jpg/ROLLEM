/* ROLL'EM — tiny WebGL renderer for a smooth, rounded, glossy letter die.
   One procedurally generated rounded-cube mesh (~1.3k vertices), one letter atlas texture,
   per-pixel lighting with engraved letters. Falls back to the CSS cube if WebGL is unavailable. */
(function () {
  'use strict';
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!';
  const GRID = 6;                 // atlas is 6x6 cells
  const ATLAS = 1024;
  const RADIUS = 0.3;             // edge rounding (cube half-size = 1)
  let atlasCanvas = null;
  const instances = [];

  function buildAtlas(fontFamily) {
    atlasCanvas = atlasCanvas || document.createElement('canvas');
    atlasCanvas.width = atlasCanvas.height = ATLAS;
    const c = atlasCanvas.getContext('2d');
    const cell = ATLAS / GRID;
    c.clearRect(0, 0, ATLAS, ATLAS);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `${Math.round(cell * 0.66)}px ${fontFamily}`;
    for (let i = 0; i < CHARS.length; i++) {
      const x = (i % GRID) * cell + cell / 2, y = Math.floor(i / GRID) * cell + cell / 2;
      const m = c.measureText(CHARS[i]);
      // center optically using actual glyph bounds when available
      const dy = m.actualBoundingBoxAscent != null ? (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 : 0;
      c.textBaseline = m.actualBoundingBoxAscent != null ? 'alphabetic' : 'middle';
      c.fillText(CHARS[i], x, m.actualBoundingBoxAscent != null ? y + dy : y);
    }
    return atlasCanvas;
  }

  function buildMesh() {
    const a = 1 - RADIUS, B = 7;
    // 1D samples: dense across the rounded edge, sparse across the flat middle
    const s = [];
    for (let i = 0; i <= B; i++) s.push(-1 + (RADIUS * i) / B);
    s.push(0);
    for (let i = 0; i <= B; i++) s.push(a + (RADIUS * i) / B);
    const faces = [ // [normal, u (right), v (up)] — u x v = n so letters read correctly from outside
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]]
    ];
    const pos = [], nrm = [], uv = [], face = [], flat = [], idx = [];
    const n1 = s.length;
    faces.forEach(([n, u, v], f) => {
      const base = pos.length / 3;
      for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
        const x = s[i], y = s[j];
        const p = [0, 1, 2].map(k => n[k] + u[k] * x + v[k] * y);
        const inner = p.map(q => Math.max(-a, Math.min(a, q)));
        let d = p.map((q, k) => q - inner[k]);
        const len = Math.hypot(d[0], d[1], d[2]) || 1;
        d = d.map(q => q / len);
        pos.push(inner[0] + d[0] * RADIUS, inner[1] + d[1] * RADIUS, inner[2] + d[2] * RADIUS);
        nrm.push(d[0], d[1], d[2]);
        uv.push((x + 1) / 2, (y + 1) / 2);
        face.push(f);
        flat.push(d[0] * n[0] + d[1] * n[1] + d[2] * n[2]);
      }
      for (let j = 0; j < n1 - 1; j++) for (let i = 0; i < n1 - 1; i++) {
        const q = base + j * n1 + i;
        idx.push(q, q + 1, q + n1, q + 1, q + n1 + 1, q + n1);
      }
    });
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), uv: new Float32Array(uv), face: new Float32Array(face), flat: new Float32Array(flat), idx: new Uint16Array(idx) };
  }
  let MESH = null;

  const VS = `
attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aUv; attribute float aFace; attribute float aFlat;
uniform mat3 uRot; uniform float uF, uAspect, uDist; uniform float uL[6];
varying vec3 vN; varying vec2 vUv; varying vec2 vCell; varying float vFlat; varying float vFront;
void main() {
  vec3 p = uRot * aPos;
  vN = uRot * aNrm;
  int fi = int(aFace + 0.5);
  float L = 0.0;
  for (int i = 0; i < 6; i++) { if (i == fi) L = uL[i]; }
  vCell = vec2(mod(L, 6.0), floor(L / 6.0 + 0.001));
  vUv = aUv; vFlat = aFlat; vFront = fi == 0 ? 1.0 : 0.0;
  float z = p.z - uDist;
  gl_Position = vec4(p.x * uF / uAspect, p.y * uF, z * -1.0202 - 0.20202, -z);
}`;
  const FS = `
precision mediump float;
uniform sampler2D uTex; uniform float uGlow;
varying vec3 vN; varying vec2 vUv; varying vec2 vCell; varying float vFlat; varying float vFront;
float glyph(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture2D(uTex, (vCell + vec2(uv.x, 1.0 - uv.y)) / 6.0).a;
}
void main() {
  vec3 N = normalize(vN);
  vec3 Ld = normalize(vec3(-0.45, 0.8, 0.65));
  float onFace = smoothstep(0.985, 1.0, vFlat);
  float a  = glyph(vUv) * onFace;
  float aT = glyph(vUv + vec2(-0.012, 0.016)) * onFace;   // toward the light
  float aB = glyph(vUv + vec2(0.012, -0.016)) * onFace;   // away from the light
  float glow = uGlow * vFront;
  vec3 ivory = vec3(0.99, 0.965, 0.915);
  vec3 ink = mix(vec3(0.85, 0.08, 0.38), vec3(1.0, 0.62, 0.05), glow);
  vec3 base = mix(ivory, ink, a);
  base *= 1.0 - 0.45 * a * (1.0 - aT);          // engraved: shadowed upper edge inside the cut
  base += vec3(0.25) * a * (1.0 - aB);          // lit lower edge inside the cut
  float diff = max(dot(N, Ld), 0.0);
  float hemi = 0.5 + 0.5 * N.y;
  vec3 H = normalize(Ld + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(N, H), 0.0), 56.0) * (1.0 - 0.7 * a);
  float edge = smoothstep(0.7, 1.0, vFlat);
  float ao = mix(0.86, 1.0, edge);
  float rim = pow(1.0 - max(N.z, 0.0), 3.0);
  vec3 col = base * (0.3 + 0.58 * diff + 0.22 * hemi) * ao;
  col += vec3(1.0) * spec * 0.6;
  col += vec3(1.0, 0.45, 0.75) * rim * 0.16;
  col += ink * glow * a * 0.45;
  gl_FragColor = vec4(col, 1.0);
}`;

  function compile(gl, type, src) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  function rotMat(x, y) {
    const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y);
    // R = Rx(x) * Ry(y), column-major
    return new Float32Array([cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy]);
  }

  function Die3D(container, opts) {
    opts = opts || {};
    const cv = document.createElement('canvas');
    cv.className = 'die-gl';
    let gl = null;
    try { gl = cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' }); } catch (e) {}
    if (!gl) return { ok: false };
    let prog, loc = {}, tex, count;
    try {
      MESH = MESH || buildMesh();
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(prog);
      const buf = (data, name, size) => {
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        const l = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0);
      };
      buf(MESH.pos, 'aPos', 3); buf(MESH.nrm, 'aNrm', 3); buf(MESH.uv, 'aUv', 2); buf(MESH.face, 'aFace', 1); buf(MESH.flat, 'aFlat', 1);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, MESH.idx, gl.STATIC_DRAW);
      count = MESH.idx.length;
      ['uRot', 'uF', 'uAspect', 'uDist', 'uL', 'uTex', 'uGlow'].forEach(n => (loc[n] = gl.getUniformLocation(prog, n)));
      tex = gl.createTexture();
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 0);
    } catch (e) { console.warn('Die3D fallback:', e.message); return { ok: false }; }

    const st = { x: 0.4, y: -0.55, glow: 0, letters: [0, 1, 2, 3, 4, 5], dirty: true, w: 0, h: 0 };
    function upload() {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      st.dirty = true;
    }
    if (!atlasCanvas) buildAtlas('"Lilita One", "Arial Black", sans-serif');
    upload();
    container.appendChild(cv);
    container.classList.add('gl');
    const host = container.closest('.die-wrap, .hero-die');
    if (host) host.classList.add('gl');

    function resize() {
      const dpr = Math.min(opts.maxDpr || 2, window.devicePixelRatio || 1);
      const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (w && h && (w !== st.w || h !== st.h)) { cv.width = st.w = w; cv.height = st.h = h; st.dirty = true; }
    }
    const api = {
      ok: true, canvas: cv,
      setPose(x, y) { if (x !== st.x || y !== st.y) { st.x = x; st.y = y; st.dirty = true; } },
      setMaxDpr(d) { opts.maxDpr = d; st.dirty = true; },
      setGlow(g) { if (g !== st.glow) { st.glow = g; st.dirty = true; } },
      setFace(i, ch) { const k = Math.max(0, CHARS.indexOf(String(ch).toUpperCase())); if (st.letters[i] !== k) { st.letters[i] = k; st.dirty = true; } },
      setFaces(arr) { arr.forEach((c, i) => api.setFace(i, c)); },
      refresh: upload,
      draw(force) {
        resize();
        if (!st.dirty && !force) return;
        if (!st.w) return;
        st.dirty = false;
        gl.viewport(0, 0, st.w, st.h);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix3fv(loc.uRot, false, rotMat(st.x, st.y));
        gl.uniform1f(loc.uF, 3.73);
        gl.uniform1f(loc.uAspect, st.w / st.h);
        gl.uniform1f(loc.uDist, 7.0);
        gl.uniform1fv(loc.uL, new Float32Array(st.letters));
        gl.uniform1f(loc.uGlow, st.glow);
        gl.uniform1i(loc.uTex, 0);
        gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
      }
    };
    cv.addEventListener('webglcontextlost', e => {
      e.preventDefault(); api.ok = false;
      container.classList.remove('gl'); if (host) host.classList.remove('gl'); cv.remove();
    });
    instances.push(api);
    return api;
  }

  // Re-render the letter atlas once the display font has loaded.
  if (document.fonts && document.fonts.load) {
    document.fonts.load('100px "Lilita One"').then(() => {
      buildAtlas('"Lilita One", "Arial Black", sans-serif');
      instances.forEach(i => i.ok && i.refresh());
    }).catch(() => {});
  }
  window.Die3D = Die3D;
})();
