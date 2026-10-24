import * as PIXI from 'pixi.js'
import { OPHAN, OPHAN_HANDKIT, OPHAN_HANDS, OPHAN_RIG, hh } from '../page.js'
// THE CORE'S HAND (liquid): "A hand of liquid chrome. Tool: a burin, the engraver's steel point, cutting the boss into the
// metal." A PORT of the owner's pick, finish A5 (molten + sliding beads) of cru/var/liquid-b.js, onto game tech:
//  - the chrome is HAND_FS, the same shader, as a Pixi Mesh (c.place): the traced hand's surface (blurred heights, creases,
//    ink, alpha) baked ONCE into one RGBA16F texture, flowed, beaded, warped and lit live on the GPU, exactly as before;
//  - the cast shadow is the silhouette pre-blurred at five softnesses (picked by the hand's height) and laid as a sprite;
//  - the cut: the engraver's own three cuts (engrave(): the rig's arrival and lift, its own path), a V-groove in Graphics
//    per frame, white-hot at the point and cooling to a steel scar, masked by the boss's own shape;
//  - sparks and chrome shavings at the point: plain paths. Nothing is redrawn into a canvas per frame (px.bad stays {}).
OPHAN_HANDS.liquid = (() => {
  const KIT = OPHAN_HANDKIT, RIG = OPHAN_RIG, TAU = Math.PI*2, { sm, cl } = KIT;
  const FIN = { G: 20, crease: .05, flow: [.09, .15, .025], warp: 1.8, beads: .12 };   // TR_FIN.beads, the owner's A5
  const TR_FR = 12, TR_FPS = 6, TR_U = 1.5*2.1/267;
  const HS = 2.2*.75;   // boss radii per palm-length: the reference's 2.2, cut so the wrist and knuckles come into frame
  // THE RIM IS THE FLOOR, mirrored where the chrome turns away (env()'s grazing branch): the floor's tint under the hand,
  // per world. c.floor ([r, g, b], 0..255) from the caller wins; else the world is the layer's id ('toon-hand', art.js) or
  // the spike's ?style. ponytail: tints measured once off each stage's floor up-right of the boss; a stage exposing its tint replaces this
  // A mirror's rim picks up the floor's LIT tone, not its mean: the Core's is its magma (the owner's original orange, exactly),
  // the others the median of each floor's brightest 4 % (95th-99th luminance percentile) off its spike shot, the boss left out
  const FLOOR = { liquid: [236, 170, 110], toon: [222, 137, 77], holo: [193, 223, 203], pixel: [252, 168, 42], macro: [117, 86, 56], pencil: [242, 239, 230], ascii: [104, 95, 83] };
  const DEEP = new Map([[FLOOR.liquid, [166, 60, 20]]]);   // the rim's dark end, past grazing: the Core's own; any other floor is 0.6 of its light
  const floorOf = (c) => c.floor || FLOOR[(c.id || new URLSearchParams(location.search).get('style') || '').replace(/-hand$/, '')] || FLOOR.liquid;
  // the surface, as liquid-b.js prep(): the silhouette rounded (blurred at three scales), the engraving's lines as creases
  let T = null;
  // THE BURIN GRIP, edited into copies of the kit's trace (mm): the pen's long shaft, which ran over the back of the hand and
  // out past the knuckles, is taken off past the palm (PEN.k) and a mushroom knob sits there, cupped in the palm; the curled fingers get dark creases
  // between them; knuckle bumps (KN, added to the heights in prep) catch a highlight each
  const PEN = { c: [165, 52], k: [104, 118], d: [.759, -.651], hw: 8.5 }, KN = [[95, 70], [126, 56], [35, 148], [65, 152], [66, 180], [112, 187], [147, 180]];
  const CREASE = [[[78, 168], [80, 180], [84, 196]], [[126, 172], [129, 182], [133, 192]], [[48, 132], [62, 136], [78, 137]]];
  function grip(trS, trI, k){
    const cp = (cv) => { const o = KIT.mk(cv.width, cv.height); o.getContext('2d').drawImage(cv, 0, 0); return o; }, S = cp(trS), I = cp(trI);
    const { c: [cx, cy], d: [dx, dy], hw } = PEN, nx = -dy, ny = dx, ang = Math.atan2(dy, dx);
    const band = (cv, x, y) => { const g = cv.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.moveTo(x + nx*hw, y + ny*hw); g.lineTo(x + nx*hw + dx*200, y + ny*hw + dy*200); g.lineTo(x - nx*hw + dx*200, y - ny*hw + dy*200); g.lineTo(x - nx*hw, y - ny*hw); g.fill(); };
    band(S, cx, cy); band(I, ...PEN.k);   // the silhouette loses the pen past the hand's edge, the ink loses it past the palm
    const knob = (g, fill) => { g.save(); g.translate(...PEN.k); g.rotate(ang); g.beginPath(); g.ellipse(0, 0, 7.5, 11, 0, 0, TAU);
      if (fill) g.fill(); else { g.stroke(); g.beginPath(); g.ellipse(-2.5, 0, 3, 8.5, 0, -Math.PI/2, Math.PI/2); g.stroke(); } g.restore(); };
    { const g = S.getContext('2d'); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; knob(g, true); }
    { const g = I.getContext('2d'); g.globalCompositeOperation = 'source-over'; g.strokeStyle = '#000'; g.lineWidth = 1.1; g.lineCap = 'round'; knob(g, false);
      g.lineWidth = 2; for (const L of CREASE){ g.beginPath(); g.moveTo(...L[0]); g.quadraticCurveTo(...L[1], ...L[2]); g.stroke(); } }
    { const g = I.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.globalCompositeOperation = 'destination-out'; g.fillRect(142, 84, 30, 44); }   // the shadow wedge's spike past the palm
    // a notch in the outline where middle, ring and little finger meet the trace's lower edge: each curled finger its own lobe
    { const g = S.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.globalCompositeOperation = 'destination-out';
      for (const [X, Y, rx, ry, a] of [[86, 199, 3, 7, -.25], [132, 196, 2.6, 7, -.3]]){ g.beginPath(); g.ellipse(X, Y, rx, ry, a, 0, TAU); g.fill(); } }
    // an opening of the silhouette (erode, then grow back, 1.6 mm): the engraving's hatch strokes and spikes that stuck out
    // of the hand as thin teeth (the orange rim made them read as extra fingers) go; the outer contour stays
    const r = Math.round(1.6*k), dirs = Array.from({ length: 16 }, (_, j) => [Math.round(Math.cos(j*TAU/16)*r), Math.round(Math.sin(j*TAU/16)*r)]);
    const E = cp(S), e = E.getContext('2d'); e.globalCompositeOperation = 'destination-in'; for (const [x, y] of dirs) e.drawImage(S, x, y);
    const O = S.getContext('2d'); O.setTransform(1, 0, 0, 1, 0, 0); O.globalCompositeOperation = 'source-over'; O.clearRect(0, 0, S.width, S.height); O.drawImage(E, 0, 0); for (const [x, y] of dirs) O.drawImage(E, x, y);
    return { S, I };
  }
  function prep(){
    const K0 = KIT.ready(), TR = K0.TR, k = TR.k, { S: trS, I: trI } = grip(K0.trS, K0.trI, k), W = trS.width, H = trS.height, n = W*H;
    const ms = trS.getContext('2d').getImageData(0, 0, W, H).data, ik = trI.getContext('2d').getImageData(0, 0, W, H).data;
    const M = new Float32Array(n), I = new Float32Array(n); for (let i = 0; i < n; i++){ M[i] = ms[i*4 + 3]/255; I[i] = ik[i*4 + 3]/255; }
    const box = (src, r) => { const a = new Float32Array(n), b = new Float32Array(n), w = 2*r + 1;
      let s = src; for (let pass = 0; pass < 2; pass++){
        for (let y = 0; y < H; y++){ let acc = 0; const o = y*W; for (let x = -r; x <= r; x++) acc += s[o + Math.min(W - 1, Math.max(0, x))];
          for (let x = 0; x < W; x++){ a[o + x] = acc/w; acc += s[o + Math.min(W - 1, x + r + 1)] - s[o + Math.max(0, x - r)]; } }
        for (let x = 0; x < W; x++){ let acc = 0; for (let y = -r; y <= r; y++) acc += a[Math.min(H - 1, Math.max(0, y))*W + x];
          for (let y = 0; y < H; y++){ b[y*W + x] = acc/w; acc += a[Math.min(H - 1, y + r + 1)*W + x] - a[Math.max(0, y - r)*W + x]; } }
        s = b.slice(); }
      return s; };
    const b1 = box(M, 2*k), b2 = box(M, 6*k), b3 = box(M, 16*k), cr = box(I, k);
    // RGBA16F like the reference (8 bits would band the mirror: the normals are height differences x G*K = 80)
    const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer), half = (v) => { f32[0] = v; const x = u32[0], e = ((x >>> 23) & 255) - 112;
      return e <= 0 ? 0 : ((x >>> 16) & 0x8000) | ((e << 10) + (((x & 0x7fffff) + 0x1000) >> 13)); };
    const D = new Uint16Array(n*4);
    const B = new Float32Array(n); for (let i = 0; i < n; i++) B[i] = .3*b1[i] + .4*b2[i] + .3*b3[i];
    // the creases between the curled fingers sunk into the heights too (a groove of points 1 mm apart, ~-.075 deep): ink
    // alone reads as a hairline in the mirror, a valley throws its own dark reflection, so the fingers part
    const GR = CREASE.flatMap(([[ax, ay], [bx, by], [cx, cy]]) => Array.from({ length: 30 }, (_, j) => { const q = j/29;
      return [(1 - q)**2*ax + 2*q*(1 - q)*bx + q*q*cx, (1 - q)**2*ay + 2*q*(1 - q)*by + q*q*cy, -.012, 2.5]; }));
    for (const [X, Y, A = .1, sg = 4] of [...KN, ...GR, [...PEN.k, .14, 6]]){ const r = 3*sg*k;   // the knuckles, the creases, and the knob's dome
      for (let y = Math.max(0, Math.round(Y*k - r)); y < Math.min(H, Y*k + r); y++) for (let x = Math.max(0, Math.round(X*k - r)); x < Math.min(W, X*k + r); x++){
        const q = ((x - X*k)**2 + (y - Y*k)**2)/(sg*k)**2; B[y*W + x] += A*Math.exp(-q/2)*M[y*W + x]; } }
    for (let i = 0; i < n; i++){ D[i*4] = half(B[i]); D[i*4 + 1] = half(cr[i]*M[i]); D[i*4 + 2] = half(I[i]); D[i*4 + 3] = half(M[i]); }
    const src = new PIXI.BufferImageSource({ resource: D, width: W, height: H, format: 'rgba16float', alphaMode: 'premultiplied-alpha', scaleMode: 'linear', addressMode: 'clamp-to-edge' });
    // the quad covers the trace in mm, padded for the warp (the outline swims up to FIN.warp mm)
    const x0 = -3, y0 = -3, x1 = W/k + 3, y1 = H/k + 3;
    const geometry = new PIXI.MeshGeometry({ positions: new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]), uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) });
    const shader = PIXI.Shader.from({ gl: { vertex: HAND_VS, fragment: HAND_FS }, resources: { uT: src,
      hu: { uS: { value: new Float32Array([W, H]), type: 'vec2<f32>' }, uK: { value: k, type: 'f32' }, uG: { value: FIN.G, type: 'f32' }, uCR: { value: FIN.crease, type: 'f32' },
        uWP: { value: FIN.warp, type: 'f32' }, uBD: { value: FIN.beads, type: 'f32' }, uP: { value: 0, type: 'f32' }, uFB: { value: 0, type: 'f32' },
        uFL: { value: new Float32Array(FIN.flow), type: 'vec3<f32>' }, uFloor: { value: new Float32Array(FLOOR.liquid), type: 'vec3<f32>' }, uFloorD: { value: new Float32Array(DEEP.get(FLOOR.liquid)), type: 'vec3<f32>' } } } });
    const mesh = new PIXI.Mesh({ geometry, shader });
    // the cast shadow: the silhouette, black, blurred at five softnesses (sigma in trace px), at half resolution
    const SG = [1, 2, 3.5, 5.5, 8].map((s) => { const pad = Math.ceil(3*s), c = KIT.mk(W/2 + 2*pad, H/2 + 2*pad), g = c.getContext('2d');
      g.filter = 'blur(' + s/2 + 'px)'; g.drawImage(trS, pad, pad, W/2, H/2); g.filter = 'none'; g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
      return { s, c, pad: 2*pad }; });
    // the cut's layer: a container masked by a copy of the boss as drawn this frame
    const wrap = new PIXI.Container(), cutG = new PIXI.Graphics(), maskC = new PIXI.Container();
    wrap.addChild(cutG, maskC); wrap.setMask({ mask: maskC, channel: 'alpha' });
    T = { TR, k, mesh, shader, SG, wrap, cutG, maskC, sp: [], gp: [] };
  }
  const HAND_VS = `in vec2 aPosition; in vec2 aUV; out vec2 vP;
uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
void main(){ mat3 mvp = uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix; gl_Position = vec4((mvp*vec3(aPosition, 1.)).xy, 0., 1.); vP = aPosition; }`;
  // liquid-b.js HAND_FS, line for line, but p (mm in the trace) comes from the mesh instead of gl_FragCoord through Mi
  const HAND_FS = `precision highp float;
in vec2 vP; out vec4 finalColor;
uniform sampler2D uT; uniform vec2 uS; uniform float uK, uG, uCR, uWP, uBD, uP, uFB; uniform vec3 uFL, uFloor, uFloorD; uniform vec4 uColor;
vec4 tx(vec2 p){ return texture(uT, p*uK/uS); }
float st(float a, float b, float x){ float t = clamp((x - a)/(b - a), 0., 1.); return t*t*(3. - 2.*t); }
float hgt(vec2 p){ vec4 t = tx(p); float X = p.x, Y = p.y, h = t.r - uCR*t.g; if (t.a < .02) return h;
  float w = .35 + .65*min(1., t.r*1.6);
  h += w*(uFL.x*sin(.085*X + 1.6*sin(.028*Y + .011*X) + uP) + uFL.y*sin(.05*X + 2.2*sin(.045*Y - .02*X + uP) - uP)*sin(.06*Y + 1.3*sin(.03*X) + 2.*uP)
    + uFL.z*sin(.21*X - .09*Y + 1.1*sin(.07*Y + uP) + 2.*uP));
  if (uBD > 0.) for (int l = 0; l < 5; l++){ float fl = float(l), D = 60. + 12.*fl, sh = (1. + mod(fl, 2.))*D*uFB, dy = Y - (112. + 20.*fl + 8.*sin(.018*X + 1.7*fl));
    if (dy*dy > 392.) continue; float q = (X + sh)/D - .5 - .37*fl, dx = (q - floor(q + .5))*D; h += uBD*exp(-(dx*dx + dy*dy)/98.); }
  return h; }
vec3 env(vec3 R){ float rx = R.x, ry = R.y, rz = R.z; vec3 c;
  if (rz > .45){ float f = (rz - .45)/.55, sky = clamp(.5 + 1.4*(-.6*rx - .5*ry), 0., 1.), glow = pow(max(0., .55*rx + .6*ry), 2.);
    c = vec3(128. - 92.*f + 110.*sky + 170.*glow, 134. - 94.*f + 112.*sky + 70.*glow, 146. - 98.*f + 116.*sky + 20.*glow); }
  else if (rz > .05){ float f = (rz - .05)/.4; c = vec3(232. - 104.*f, 234. - 100.*f, 238. - 92.*f); }
  else { float f = min(1., (.05 - rz)/.5); c = mix(uFloor, uFloorD, f); }   // the floor under the hand, mirrored at grazing
  float key = max(0., -.5*rx - .55*ry + .67*rz), soft = pow(key, 6.), spec = pow(max(0., -.62*rx - .5*ry + .6*rz), 90.);
  return c + vec3(120., 116., 110.)*soft + vec3(255., 250., 240.)*spec; }
void main(){
  vec2 p = vP;
  if (uWP > 0.) p += uWP*st(15., 90., p.x)*vec2(sin(.06*p.y + .9*sin(.04*p.x - uP) + uP), sin(.05*p.x + 1.2*sin(.035*p.y + 2.*uP) - uP));
  vec2 uv = p*uK/uS; if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.){ finalColor = vec4(0.); return; }
  vec4 t = tx(p); if (t.a < .02){ finalColor = vec4(0.); return; }
  float e = 1./uK, nx = -(hgt(p + vec2(e, 0.)) - hgt(p - vec2(e, 0.)))*uG*uK, ny = -(hgt(p + vec2(0., e)) - hgt(p - vec2(0., e)))*uG*uK;
  vec3 n = normalize(vec3(nx, ny, 1.)), c = clamp(env(vec3(2.*n.z*n.x, 2.*n.z*n.y, 2.*n.z*n.z - 1.)), 0., 255.)/255.;
  if (uWP > 0.) c *= 1. - .5*t.b;
  finalColor = vec4(c*t.a, t.a)*uColor.a; }`;
  // the hand's frame (liquid-b.js at() + giantT(): the burin's point on H.tip, no playground knobs): trace mm -> boss radii
  const handM = (c, F) => { const TR = T.TR; c.translate(F.tip.x, F.tip.y); c.rotate(F.ang); c.scale(F.S, F.S); c.rotate(-TR.rot); c.scale(TR_U, TR_U); c.translate(-TR.tip[0], -TR.tip[1]); };
  const psOf = (u) => cl((u - RIG.HAND_WIN.paint[0])/(RIG.HAND_WIN.paint[1] - RIG.HAND_WIN.paint[0]));
  // the heat ramp, white-hot -> dark seam; quantized so the colour strings px2d caches stay a few hundred
  const HEAT = [[1, [255,250,232]], [.75, [255,206,110]], [.5, [255,128,36]], [.3, [205,48,16]], [.14, [96,22,12]], [0, [70,64,62]]];
  function heatRGB(T){ let i = 0; while (i < HEAT.length - 2 && T < HEAT[i+1][0]) i++; const [t0, c0] = HEAT[i], [t1, c1] = HEAT[i+1], f = cl((t0 - T)/(t0 - t1));
    return c0.map((v, j) => Math.round(v + (c1[j] - v)*f)); }
  const heatCol = (T, a) => 'rgba(' + heatRGB(Math.round(cl(T)*64)/64).join(',') + ',' + Math.round(cl(a)*32)/32 + ')';
  // the boss as drawn this frame, copied into the cut's mask (sprites share their texture, graphics their context)
  function maskOf(objs, bossRoot, root){
    const { maskC, sp, gp } = T; maskC.removeChildren(); let si = 0, gi = 0;
    const copy = (o, into) => {
      if (!o.visible || o.alpha <= 0) return;
      o.updateLocalTransform();
      let q;
      if (o instanceof PIXI.Sprite){ q = sp[si] || (sp[si] = new PIXI.Sprite()); si++; q.texture = o.texture; q.anchor.copyFrom(o.anchor); }
      else if (o instanceof PIXI.Graphics){ q = gp[gi]; if (!q || q.context !== o.context){ q = gp[gi] = new PIXI.Graphics(o.context); } gi++; }
      else if (o.children && o.children.length){ q = new PIXI.Container(); for (const ch of o.children) if (ch !== o.mask) copy(ch, q); }   // ponytail: a clipped group's own clip is dropped; the liquid boss has none
      else return;
      q.setFromMatrix(o.localTransform); q.alpha = o.alpha; into.addChild(q);
    };
    for (const o of objs) copy(o, maskC);
    // the copies sit in the boss root's space: carry them into this layer's (last frame's world transforms, both static)
    maskC.setFromMatrix(root.worldTransform.clone().invert().append(bossRoot.worldTransform));
  }
  // the engraved edge's colour: the heat ramp down to red, then a scar of bright steel (it must read on the dark chrome)
  const EDGE = [[1, [255,250,232]], [.75, [255,206,110]], [.5, [255,128,36]], [.3, [205,60,24]], [.14, [150,96,80]], [0, [176,180,188]]];
  const edgeRGB = (T) => { let i = 0; while (i < EDGE.length - 2 && T < EDGE[i+1][0]) i++; const [t0, c0] = EDGE[i], [t1, c1] = EDGE[i+1], f = cl((t0 - T)/(t0 - t1));
    const q = c0.map((v, j) => Math.round(v + (c1[j] - v)*f)); return (q[0] << 16) | (q[1] << 8) | q[2]; };
  // the groove, on the boss only: an engraved V along each cut where the point was down (lightly smoothed), its lit facet
  // white-hot at the point and cooling along its length and, after the lift, to a steel scar over ~1 s
  function cutMark(c, H, u, m){
    const P = H.stroke.pts, n = P.length, g = T.cutG; g.clear(); if (n < 2) return false;
    g.setFromMatrix(new PIXI.Matrix(m[0], m[1], m[2], m[3], m[4], m[5]));
    const since = u > RIG.HAND_WIN.paint[1] ? (u - RIG.HAND_WIN.paint[1])*RIG.HAND_DUR : 0, A = 4;
    const Q = P.map((p, k) => { if (p.down < .5) return null; let x = 0, y = 0, w = 0;
      for (let j = -A; j <= A; j++){ const q = P[k + j]; if (!q || q.down < .5) continue; const wt = A + 1 - Math.abs(j); x += wt*q.x; y += wt*q.y; w += wt; }
      return { x: x/w, y: y/w, T: Math.exp(-((n - 1 - k)/31.25 + since)/.55) }; });
    const runs = []; let cur = null; for (const q of Q){ if (!q){ cur = null; continue; } if (!cur) runs.push(cur = []); cur.push(q); }
    // a V-groove seen from above: the facet facing the lamp (up-left) lit, the far facet in shadow, a black line at the bottom
    // a point of run R pushed off its centre line by o toward the lamp (o < 0: away), along the normal at it
    const side = (R, k, o) => { const a = R[Math.max(0, k - 1)], b = R[Math.min(R.length - 1, k + 1)], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      let nx = -dy/L, ny = dx/L; if (nx + ny > 0){ nx = -nx; ny = -ny; } return [R[k].x + nx*o, R[k].y + ny*o]; };
    const line = (R, o, st) => { g.moveTo(...side(R, 0, o)); for (let k = 1; k < R.length; k++) g.lineTo(...side(R, k, o)); g.stroke(st); };
    for (const R of runs){ if (R.length < 3) continue;
      line(R, -.022, { width: .028, color: 0x050304, alpha: .9, cap: 'round', join: 'round' });   // the shadowed facet (lower-right)
      let on = false;   // the lit facet: its cold length one steel line, its hot end per segment (colour, width)
      for (let k = 0; k < R.length; k++){ if (R[k].T >= .14) break; const [x, y] = side(R, k, .022); on ? g.lineTo(x, y) : g.moveTo(x, y); on = true; }
      if (on) g.stroke({ width: .022, color: edgeRGB(0), alpha: .95, cap: 'round', join: 'round' });
      for (let k = 1; k < R.length; k++){ const q = R[k]; if (q.T < .14) continue; const [x0, y0] = side(R, k - 1, .022), [x1, y1] = side(R, k, .022);
        g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: .022 + .03*q.T, color: edgeRGB(q.T), alpha: .95, cap: 'round' }); }
      g.moveTo(R[0].x, R[0].y); for (const q of R) g.lineTo(q.x, q.y); g.stroke({ width: .012, color: 0x000000, alpha: .95, cap: 'round', join: 'round' }); }   // the bottom of the V
    return true;
  }
  // a chrome shaving: a bright ribbon of the boss's metal peels off the point and curls (.5 s), drops and balls up into a
  // molten bead (.2 s), and the bead slides off across the floor, cooling, like the drops on the Core's melt
  function shaving(c, p, dir, age, i, fade){
    const al = (v) => Math.round(cl(v)*fade*32)/32, ux = Math.cos(dir), uy = Math.sin(dir);
    if (age < .7){ const grow = sm(0, .35, age), f = sm(.5, .7, age), r = .2*grow*(1 - f), cx = p.x + ux*(.06 + .12*grow + .08*f), cy = p.y + uy*(.06 + .12*grow + .08*f);
      if (r > .01){ c.beginPath();
        for (let q = 0; q <= 18; q++){ const th = dir + Math.PI + q/18*TAU*(.5 + .9*grow) + i, rr = r*(1 - q/26), x = cx + Math.cos(th)*rr, y = cy + Math.sin(th)*rr*.75; q ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.strokeStyle = 'rgba(8,8,12,' + al(.9) + ')'; c.lineWidth = .055; c.stroke();
        c.strokeStyle = 'rgba(214,220,232,' + al(1) + ')'; c.lineWidth = .032; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,' + al(.9) + ')'; c.lineWidth = .01; c.stroke(); }
      if (f > 0) bead(c, cx, cy, .05*f, 1, fade);
      return; }
    const s = age - .7, b = dir + (hh(i, 6) - .5)*.9, d = .55*(1 - Math.exp(-2.2*s)), x0 = p.x + ux*.26, y0 = p.y + uy*.26;
    bead(c, x0 + Math.cos(b)*d, y0 + Math.sin(b)*d, .05, Math.exp(-s/.5), fade);
  }
  // a bead of molten chrome: a dark sphere with one hard highlight, its heat (h) a fading orange rim
  function bead(c, x, y, r, h, fade){
    if (h > .05){ c.fillStyle = heatCol(.55*h, .8*h*fade); c.beginPath(); c.arc(x, y, r*1.25, 0, TAU); c.fill(); }
    const g = c.createRadialGradient(x - .35*r, y - .35*r, 0, x, y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(.3, '#aab0ba'); g.addColorStop(.8, '#16171c'); g.addColorStop(1, '#08080a');
    c.globalAlpha = Math.round(fade*32)/32; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.globalAlpha = 1;
  }
  // the bite's spray (liquid-b.js sparks()): sparks streak back off the point and land cooling orange -> grey, a few chrome
  // shavings curl off it; born only where and while the point was down
  function sparks(c, H, u, t){
    const P = H.stroke.pts, n = P.length; if (n < 2) return; const psN = Math.max(1e-6, psOf(u)), HW = RIG.HAND_WIN;
    for (let i=0;i<64;i++){
      const shav = i%4 === 0, per = (shav ? 1.9 : .55) + .3*hh(i, 1), a = ((t/per) + hh(i, 2))%1, age = a*per, ub = u - age/RIG.HAND_DUR;
      if (sm(HW.paint[0], HW.paint[0] + .04, ub)*(1 - sm(HW.paint[1] - .04, HW.paint[1], ub)) < .15) continue;
      const kb = Math.min(n - 1, Math.round((n - 1)*psOf(ub)/psN)), p = P[kb], q = P[Math.max(0, kb - 4)]; if (p.down < .5) continue;
      const dir = Math.atan2(p.y - q.y, p.x - q.x) + Math.PI + (hh(i, 3) - .5)*2.2, v = shav ? .35 + .3*hh(i, 4) : .9 + 1.6*hh(i, 4), K = 3.2;
      const s = v*(1 - Math.exp(-K*age))/K, X = p.x + Math.cos(dir)*s, Y = p.y + Math.sin(dir)*s, Th = Math.exp(-age/(shav ? .45 : .2)), fade = 1 - sm(.75, 1, a);
      if (!shav && age < .12){ const spd = v*Math.exp(-K*age)*.09 + .03; c.strokeStyle = heatCol(Th, fade); c.lineWidth = .016; c.beginPath(); c.moveTo(X, Y); c.lineTo(X - Math.cos(dir)*spd, Y - Math.sin(dir)*spd); c.stroke(); }
      else if (!shav){ c.fillStyle = heatCol(Th, .9*fade); c.beginPath(); c.arc(X, Y, .022, 0, TAU); c.fill(); }
      else if (i%8 === 0) shaving(c, p, dir, age, i, fade); }
    if (H.touch > .2){ c.fillStyle = 'rgba(255,160,60,' + Math.round(.55*H.touch*32)/32 + ')'; c.beginPath(); c.arc(H.tip.x, H.tip.y, .07, 0, TAU); c.fill();   // the white-hot bite
      c.fillStyle = 'rgba(255,252,240,' + Math.round(H.touch*32)/32 + ')'; c.beginPath(); c.arc(H.tip.x, H.tip.y, .038, 0, TAU); c.fill(); }
  }
  // THE ENGRAVER'S PATH (boss radii, y down), in place of the rig's painter: three long decisive cuts that never cross, one
  // up each upper wing's inner edge and an arc under the great eye, clear of it; the point lifts and travels between them.
  // The arrival, the lift, the heights and the touch are the rig's own (rig.js hand()), recomputed on this path
  const CUTS = [[[.15, -.4], [.24, -.78], [.5, -1.0]], [[-.15, -.4], [-.24, -.78], [-.5, -1.0]], [[-.5, .16], [0, .52], [.5, .16]]];
  const qb = (Q, s) => { const g = 1 - s; return [g*g*Q[0][0] + 2*g*s*Q[1][0] + s*s*Q[2][0], g*g*Q[0][1] + 2*g*s*Q[1][1] + s*s*Q[2][1]]; };
  const PIECES = []; CUTS.forEach((Q, i) => { if (i){ const a = CUTS[i - 1][2], b = Q[0]; PIECES.push({ d: .1, down: 0, at: (s) => qb([a, [(a[0] + b[0])/2, Math.min(a[1], b[1]) - .25], b], s) }); }
    PIECES.push({ d: .3, down: 1, at: (s) => qb(Q, (1 - Math.cos(Math.PI*s))/2) }); });
  const PT = PIECES.reduce((t, p) => t + p.d, 0);
  function cutAt(ps){ let tt = cl(ps)*PT; for (const p of PIECES){ if (tt <= p.d || p === PIECES[PIECES.length - 1]){ const s = cl(tt/p.d), [x, y] = p.at(s);
      return { x, y, down: p.down ? 1 : 1 - sm(0, .2, s)*(1 - sm(.8, 1, s)) }; } tt -= p.d; } }
  const OFF = RIG.hand(0).tip;
  function engrave(H, u){
    const W = RIG.HAND_WIN, ein = sm(W.in[0], W.in[1], u), lift = sm(W.out[0], W.out[1], u), ps = cl((u - W.paint[0])/(W.paint[1] - W.paint[0]));
    const p0 = cutAt(0), pp = cutAt(ps), pre = u < W.paint[0];
    const tip = pre ? { x: OFF.x + (p0.x - OFF.x)*ein, y: OFF.y + (p0.y - OFF.y)*ein } : { x: pp.x + (OFF.x - pp.x)*lift, y: pp.y + (OFF.y - pp.y)*lift };
    const dn = pre ? 1 : pp.down, z = (pre ? 1 - .88*ein : .12 + .88*lift) + .1*(1 - dn), touch = (pre ? 0 : sm(W.paint[0], W.paint[0] + .03, u)*(1 - sm(W.paint[1] - .03, W.paint[1], u)))*dn;
    const pts = []; if (!pre) for (let k = 0; k <= 200; k++) pts.push(cutAt(ps*k/200));
    return { ...H, tip, z, touch, scale: 1 + .6*z, stroke: { pts, w: H.stroke.w } };
  }
  return {
    floor: FLOOR,   // per world id: what a caller drawing this hand over ANOTHER world sets as c.floor
    hand(c, x, y, R, t, H){
      if (!T) prep();
      // what the boss drew this frame (drawn before the hand): its own px2d's root when the hand has a layer of its own
      // (c.bossRoot, or the spike's SPIKE.px), else this one's
      const bossRoot = c.bossRoot || (window.SPIKE && SPIKE.px && SPIKE.px !== c ? SPIKE.px.root : c.out), boss = bossRoot.children.slice();
      const u = KIT.uOf(H), HW = RIG.HAND_WIN, ap = sm(0, .06, u)*(1 - sm(.94, 1, u)), lean = .45*(1 - sm(0, HW.paint[0], u)) - .35*sm(HW.paint[1], 1, u);
      H = engrave(H, u);   // the burin's own path, not the rig's painter
      const F = { tip: H.tip, ang: H.ang + lean, S: HS*H.scale*(1 + .012*Math.sin(t*1.7) - .04*H.touch), L: KIT.pose(H, u, t).L, z: H.z };   // L: the shared lamp (behind the hand, up-right): the shadow lands down-left, first
      c.save(); c.translate(x, y); c.scale(R, R); c.lineCap = c.lineJoin = 'round';
      // the cast shadow, slid off along the light by the hand's height, softer the higher (the reference's 1.5 + 6z downsample)
      const sal = .45*(1 - .45*H.z)*ap;
      if (sal > .01){ c.save(); c.translate(.4*F.L.x, .4*F.L.y); handM(c, F);
        const devPerTr = c.ks()/T.k, want = .45*(1.5 + 6*H.z)/devPerTr; let b = T.SG[0]; for (const s of T.SG) if (Math.abs(s.s - want) < Math.abs(b.s - want)) b = s;
        c.globalAlpha = sal; c.drawImage(b.c, -b.pad/T.k, -b.pad/T.k, b.c.width*2/T.k, b.c.height*2/T.k); c.restore(); }
      if (H.touch > .01){ const cg = c.createRadialGradient(H.tip.x, H.tip.y, 0, H.tip.x, H.tip.y, .22); cg.addColorStop(0, 'rgba(6,3,2,' + Math.round(.5*H.touch*32)/32 + ')'); cg.addColorStop(1, 'rgba(6,3,2,0)');
        c.fillStyle = cg; c.fillRect(H.tip.x - .25, H.tip.y - .25, .5, .5); }   // the occlusion where the point meets the boss
      if (cutMark(c, H, u, c.m)){ maskOf(boss, bossRoot, c.root); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.place(T.wrap); c.restore(); }
      sparks(c, H, u, t);
      // the chrome, live: the flow's phase loops every TR_FR/TR_FPS s, as the reference's
      const ph = ((t*TR_FPS/TR_FR)%1 + 1)%1, U = T.shader.resources.hu.uniforms; U.uP = ph*TAU; U.uFB = ph;
      const fl = floorOf(c); if (fl !== T.fl){ T.fl = fl; U.uFloor = new Float32Array(fl); U.uFloorD = new Float32Array(DEEP.get(fl) || fl.map((v) => .6*v)); }
      c.save(); handM(c, F); c.place(T.mesh); c.restore();
      c.restore();
    },
  };
})();
