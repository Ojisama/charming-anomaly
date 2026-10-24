import * as PIXI from 'pixi.js'
import { OPHAN, OPHAN_HANDKIT, OPHAN_HANDS, OPHAN_RIG, hh } from '../page.js'
// THE MAGMA PAINTER (pixel): a chunky top-down pixel hand gripping the square-tipped pencil of old paint programs, lit by
// the lava, colouring the boss one block at a time. Drawn the way src/pixel/cast.js draws a creature: simple shapes in
// design units (one unit = one game px at the painting height), FLAT three-tone skin, a one-pixel ink outline per part, and
// the hot rim only on the edges facing the lava (screen right and bottom). The shapes are re-rasterised art pixel by art
// pixel for every pose the rig will take (angle and size steps, all enumerated at first use), never a rotated sprite, so
// every pixel stays square on the chapter's grid. Per frame: one bake and its silhouette (the shadow) placed on the grid,
// the painted blocks (filled rects), a few ember squares.
OPHAN_HANDS.pixel = (() => {
  const K = OPHAN_HANDKIT, RIG = OPHAN_RIG, sm = K.sm;
  const TX = 2, DA = .04, DS = .07;                         // stage px per art pixel; bake steps in angle (rad) and size
  const BASE = .92;                                        // stage px per design unit at rig scale 1
  const BLK = 8;                                            // one painted block = one nib, stage px
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const INK = hex('#1a100e'), INK0 = hex('#0a0608'), RIM = [hex('#ffb040'), hex('#e0602a')];   // ink just above the pass's ink threshold: the CRT adds no rim of its own, the lava rim is ours
  const SKIN = ['#34201c', '#5a3428', '#7a5040', '#966a58'].map(hex);  // brown-grey, away from the boss's crimson: dark, mid, light flat bands (the curled fingers one step up)
  const NAIL = hex('#c89a84'), HOT = [hex('#ffd86a'), hex('#ff9a2a')];   // a pale nail; the lava's specular on a knuckle
  const GAP = hex('#3a1a18'), THUMB = hex('#c09078');   // the thumb, clearly a step above the fingers
  const PEN = Object.fromEntries(Object.entries({            // [light side, dark side]
    nib: ['#241c26', '#241c26'], wood: ['#f8c070', '#c87a34'], shaft: ['#ffd84a', '#e08a2a'], ferrule: ['#c4bccc', '#746c84'], eraser: ['#f48e9a', '#b44c5c'],
  }).map(([k, v]) => [k, v.map(hex)]));

  // THE DESIGN (units, nib at 0,0, the pencil along +x toward the hand): back to front
  const C35 = Math.cos(.62), S35 = Math.sin(.62);
  const cap = (ax, ay, bx, by, r) => (u, v) => { const dx = bx - ax, dy = by - ay, l2 = dx*dx + dy*dy, k = Math.max(0, Math.min(1, ((u - ax)*dx + (v - ay)*dy)/l2));
    return Math.hypot(u - ax - k*dx, v - ay - k*dy) <= r ? k : -1; };   // returns where along a->b (0..1), or -1 outside
  const poly = (P) => (u, v) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++){ const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > v) !== (yj > v) && u < (xj - xi)*(v - yi)/(yj - yi) + xi) c = !c; } return c ? 0 : -1; };
  const pencil = (u, v) => {   // the profile along the shaft: [from, to, half-width at from, at to, part]
    for (const [a, b, w0, w1, part] of [[0, 8, 4, 4, 'nib'], [8, 22, 4.5, 7, 'wood'], [20, 196, 7, 7, 'shaft'], [196, 206, 7.5, 7.5, 'ferrule'], [206, 219, 7, 6, 'eraser']])
      if (u >= a && u <= b && Math.abs(v) <= w0 + (w1 - w0)*(u - a)/(b - a)) return part;
    return null; };
  // parts: { hit(u, v) -> -1 or a param, tone(u, v, k) -> colour }
  const skin = (base, light) => (u, v, k) => (light && light(u, v, k)) ? SKIN[2] : SKIN[base];
  const dot = (cx, cy, r) => (u, v) => Math.hypot(u - cx, v - cy) <= r ? 0 : -1;
  const KN = [[58, 9], [64, 24], [70, 38], [77, 51]];      // the knuckle row across the shaft, index (on it) to little
  // the fan: every finger points at the nib, the index along the shaft, the others turned 10/20/30 degrees in toward it, each
  // shorter (tucked further) than the last: the fist is a wedge that ends at the point
  const FING = KN.map(([x, y], i) => { const a = [0, 10, 20, 30][i]*Math.PI/180, L = [40, 32, 25, 18][i]; return [x, y, x - L*Math.cos(a), y - L*Math.sin(a), [7, 7.4, 7, 6.4][i]]; });
  const back = poly([[56, -12], [100, -16], [132, 8], [132, 60], [100, 64], [78, 60], [56, 24]]), knuck = KN.map(([x, y]) => dot(x, y, 7.5));
  let LU = 1, LV = 0;                                        // the lava's direction (screen right and down) in design units, set per bake
  const spec = (u, v, x, y) => { const d = Math.hypot(u - x - 4.5*LU, v - y - 4.5*LV); return d < 2.2 ? HOT[0] : d < 3.6 ? HOT[1] : null; };
  const wrist = poly([[128, 10], [128, 56], [215, 70], [215, 4]]);   // the forearm: the hand is a wedge, wrist to nib
  const DEEP = hex('#1e1210'), FAR = hex('#2a0e0a');
  const OUT = 15;                                           // the fist sits this far up the shaft: the cone and nib stick out past the index
  const seg = (u, v, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, k = Math.max(0, Math.min(1, ((u - ax)*dx + (v - ay)*dy)/(dx*dx + dy*dy))); return Math.hypot(u - ax - k*dx, v - ay - k*dy); };
  const TEND = [[KN[1], [128, 24]], [KN[2], [128, 40]]];   // two tendons, wrist into the knuckles
  const PARTS = [
    { hit: (u, v) => wrist(u, v), arm: true, tone: (u, v) => { const ax = 33 + (u - 128)*.05, side = (v - ax)*Math.sign(LV || 1), hw = 23 + (u - 128)*.13;   // ONE ramp: lit on the pools' side, darkening toward the screen edge
      const r = side/hw - 1.6*(u - 128)/87; return r > .3 ? SKIN[2] : r > -.5 ? SKIN[1] : r > -1.2 ? SKIN[0] : DEEP; } },
    { hit: (u, v) => back(u, v) >= 0 || knuck.some((f) => f(u, v) >= 0) ? 0 : -1,                                                 // the back of the hand, knuckle bumps on its front edge
      tone: (u, v) => { for (const [x, y] of KN){ if (Math.hypot(u - x, v - y) < 7.5 && Math.hypot(u - x - 3*LU, v - y - 3*LV) < 5) return SKIN[2]; }
        return v < 2 ? SKIN[0] : TEND.some(([a, b]) => seg(u, v, a, b) < 1.2) ? SKIN[2] : SKIN[1]; } },                                                                       // the lit knuckle tops; the far side in shade
    { hit: (u, v) => pencil(u, v) ? 0 : -1, pen: true },
    ...FING.slice().reverse().map(([x, y, tx, ty, r]) => ({ hit: cap(x, y, tx, ty, r), fin: true,
      tone: (u, v, k) => k > .75 && Math.hypot(u - tx + 1.5*LU, v - ty + 1.5*LV) < 3.8 ? NAIL : k < .2 ? SKIN[3] : k > .8 ? SKIN[1] : SKIN[2] })),   // a lit knuckle, a pale nail at the curled tip; the index on top
    { hit: cap(88, -8, 42, -1, 5.4), thumb: true, tone: (u, v, k) => k > .8 && Math.hypot(u - 44, v + 1) < 3 ? NAIL : THUMB },   // the thumb: ON the shaft, across from the index, a step lighter than the fingers, a pale nail by the nib
  ];
  const lean = (u) => { const W = RIG.HAND_WIN; return .45*(1 - sm(0, W.paint[0], u)) - .35*sm(W.paint[1], 1, u); };
  const keyOf = (H, u) => [Math.round((H.ang + lean(u))/DA), Math.round(BASE*H.scale/DS)];
  let BK = null, RB = 0, warm = false;

  // one pose: the design at angle aq*DA, aq*DS stage px per unit, rasterised one art pixel per texel; the nib at texel (ox, oy)
  function bake(aq, sq){
    const a = aq*DA, k = sq*DS/TX, ca = Math.cos(a), sa = Math.sin(a);   // k: texels per unit
    LU = (ca + sa)/Math.SQRT2; LV = (ca - sa)/Math.SQRT2;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [u, v] of [[-8, -36], [237, -36], [-8, 104], [237, 104]]){ const X = (u*ca - v*sa)*k, Y = (u*sa + v*ca)*k; x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y); }
    x0 = Math.floor(x0) - 2; y0 = Math.floor(y0) - 2; const w = Math.ceil(x1) + 2 - x0, h = Math.ceil(y1) + 2 - y0;
    const Z = new Int8Array(w*h).fill(-1), C = new Array(w*h);   // Z: the front part at each texel
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      const X = (x + x0 + .5)/k, Y = (y + y0 + .5)/k, u = X*ca + Y*sa, v = -X*sa + Y*ca, i = y*w + x;
      for (let p = PARTS.length - 1; p >= 0; p--){ const P = PARTS[p], q = P.hit(P.pen ? u : u - OUT, v); if (q < 0) continue;
        Z[i] = p; C[i] = P.pen ? PEN[pencil(u, v)][v < -1 ? 0 : 1] : P.tone(u - OUT, v, q); break; }
    }
    const z = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? -1 : Z[y*w + x];
    const cv = K.mk(w, h), g = cv.getContext('2d'), im = g.createImageData(w, h), d = im.data;
    const sh = K.mk(w, h), gs = sh.getContext('2d'), is = gs.createImageData(w, h), ds = is.data;
    const put = (i, c) => { d[i*4] = c[0]; d[i*4 + 1] = c[1]; d[i*4 + 2] = c[2]; d[i*4 + 3] = 255; ds[i*4 + 3] = 255; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      const i = y*w + x, p = Z[i]; if (p < 0) continue;
      const lower = (xx, yy) => z(xx, yy) < p;                  // empty, or a part behind this one
      if (lower(x - 1, y) || lower(x + 1, y) || lower(x, y - 1) || lower(x, y + 1)){   // every part outlined against what it covers: true ink on the outer silhouette
        put(i, z(x - 1, y) < 0 || z(x + 1, y) < 0 || z(x, y - 1) < 0 || z(x, y + 1) < 0 ? (PARTS[p].arm ? FAR : INK0) : INK); continue; }   // every part outlined against what it covers
      if (PARTS[p].fin && [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => { const q = z(x + dx, y + dy); return q >= 0 && q < p && PARTS[q].fin; })){ put(i, INK); continue; }   // a 2px dark gap between fingers
      if (PARTS[p].thumb && (z(x, y + 1) !== p || z(x, y + 2) !== p)){ put(i, INK0); continue; }   // the thumb's lower edge: a 2px outline, so it sits up on the shaft
      let c = C[i];
      if (!PARTS[p].pen && c !== GAP){
        if (z(x + 2, y) < 0 || z(x, y + 2) < 0) c = RIM[0];                         // the lava's side of the silhouette (right and bottom): a 2px hot rim
        else if (z(x + 3, y) < 0 || z(x, y + 3) < 0) c = RIM[1];
        else if (!PARTS[p].thumb && (lower(x - 2, y) || lower(x, y - 2) || lower(x - 2, y - 2))) c = c === SKIN[2] ? SKIN[1] : SKIN[0];           // the far side, in shade
      }
      put(i, c);
    }
    for (const [u, v] of KN.slice(1)){ const U = u + OUT + 4*LU, V = v + 4*LV, X = Math.round((U*ca - V*sa)*k) - x0 - 1, Y = Math.round((U*sa + V*ca)*k) - y0 - 1;   // three knuckle squares, lit by the lava
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++){ const q = (Y + j)*w + X + i; if (Z[q] >= 0 && !PARTS[Z[q]].pen && !PARTS[Z[q]].thumb) put(q, RIM[0]); } }
    g.putImageData(im, 0, 0); gs.putImageData(is, 0, 0);
    return { cv, sh, w, h, ox: -x0, oy: -y0 };
  }
  // a pose the scan stepped over (a quick pen lift): the closest baked one, never a bake mid-fight
  function nearest(aq, sq){ let b = null, e = 1e9; for (const [k, v] of BK){ const [a, s] = k.split(':'), d = Math.abs(a - aq) + Math.abs(s - sq); if (d < e){ e = d; b = v; } } return b; }
  function bakeAll(R){
    BK = new Map(); RB = R;
    for (let u = 0; u <= 1; u += .0002){ const H = RIG.hand(u), [a, s] = keyOf(H, u), k = a + ':' + s; if (!BK.has(k)) BK.set(k, bake(a, s)); }
  }
  const hh = (i, k) => { const v = Math.sin(i*127.1 + k*311.7)*43758.5453; return v - Math.floor(v); };
  const EMB = ['#fff4c4', '#ffd858', '#ffa22a', '#ff6a14', '#d8340c'];
  const snap = (v) => Math.round(v/TX)*TX;
  // the boss drawn from grey, dimmed copies of its own sheets (baked once per sheet, at first sight): the unpainted boss
  const GREY = new Map();
  const greyOf = (cv) => { let g = GREY.get(cv); if (g) return g; g = K.mk(cv.width, cv.height); const x = g.getContext('2d'); x.drawImage(cv, 0, 0);
    const im = x.getImageData(0, 0, g.width, g.height), d = im.data;
    for (let i = 0; i < d.length; i += 4){ const l = (.3*d[i] + .55*d[i + 1] + .15*d[i + 2])*.55; d[i] = l*.94; d[i + 1] = l*.96; d[i + 2] = l*1.08; }
    x.putImageData(im, 0, 0); GREY.set(cv, g); return g; };
  const greyCtx = (c) => new Proxy(c, { get: (o, k) => k === 'drawImage' ? (cv, ...a) => o.drawImage(greyOf(cv), ...a) : typeof o[k] === 'function' ? o[k].bind(o) : o[k],
    set: (o, k, v) => { o[k] = v; return true; } });
  const PH = +(window.OPH_PH ?? new URLSearchParams(location.search).get('ph') ?? 3) || 3;   // the boss's phase, read as the spike reads it

  return {
    hand(c, x, y, R, t, H){
      if (!BK || RB !== R) bakeAll(R);   // ponytail: R is fixed per fight; a resize rebakes (and px2d flags it)
      const u = K.uOf(H), F = K.pose(H, u, t), [aq, sq] = keyOf(H, u), B = BK.get(aq + ':' + sq) || nearest(aq, sq);
      if (!warm){ warm = true; c.save(); c.globalAlpha = .002; for (const b of BK.values()){ c.drawImage(b.cv, -9999, -9999, 1, 1); c.drawImage(b.sh, -9999, -9999, 1, 1); } c.restore(); }   // upload every bake on the first frame
      // THE EYE IS ROUTED ROUND, NOT SKIPPED: every rig point (the tip and the stroke) inside an ellipse round the great eye is
      // pushed out radially to its rim, so the nib always touches paintable boss and the hand moves with the remapped tip
      const W = RIG.HAND_WIN, ps = H.paint;
      const EZ = RIG.pose(t, PH), EC = RIG.apply(EZ.body.m, RIG.EYE.x, RIG.EYE.y), EA = .5 + 2.2*BLK/R, EB = .3 + 2.2*BLK/R;
      const route = (p) => { const dx = p.x - EC[0], dy = p.y - EC[1], q = (dx/EA)**2 + (dy/EB)**2; if (q >= 1 || q < 1e-9) return p; const f = 1/Math.sqrt(q); return { x: EC[0] + dx*f, y: EC[1] + dy*f, down: p.down }; };
      // THE CLOSING DAB: from DAB0 the nib leaves the rim and comes down once on the pupil; at DAB the eye lights; then the lift
      const DAB0 = .755, DAB = .79, dab = (q, uq) => { const f = sm(DAB0, DAB, uq); return f ? { x: q.x + (EC[0] - q.x)*f, y: q.y + (EC[1] - q.y)*f, down: q.down } : q; };
      const T84 = u > W.paint[1] ? RIG.hand(W.paint[1]).tip : H.tip;   // past the paint window the dab point rides the rig's lift
      const tip = dab(route({ x: H.tip.x, y: H.tip.y }), u), lit = u >= DAB;
      if (u > W.paint[1]){ tip.x += H.tip.x - T84.x; tip.y += H.tip.y - T84.y; }
      const X = x + tip.x*R, Y = y + tip.y*R, ox = snap(X - B.ox*TX), oy = snap(Y - B.oy*TX);
      c.save(); c.imageSmoothingEnabled = false;
      // the shadow: the hand's own pixel silhouette, cast down-left by the painter's lamp (kit F.L), capped so the boss reads through it
      c.globalAlpha = .55*sm(.02, .1, u)*(1 - sm(.86, .97, u));
      c.drawImage(B.sh, snap(ox + .4*F.L.x*R), snap(oy + .4*F.L.y*R), B.w*TX, B.h*TX);
      c.restore();
      // THE UNPAINTED BOSS: with no previous style composited under the stroke (window.OPHAN_PREV_STYLE unset), the boss
      // waits under a dark multiply wash in BLK cells; every cell the stroke has reached is uncovered, and the lift reveals the rest
      const pts = H.stroke.pts.map((p, k, A) => dab(route(p), W.paint[0] + ps*k/(A.length - 1)*(W.paint[1] - W.paint[0]))), N = pts.length - 1, ages = new Map(), open = new Set();
      const cov = !window.OPHAN_PREV_STYLE && (1 - sm(W.paint[1] - .02, .9, u));
      // the ribbon: the nib's path rasterised on the BLK grid (Bresenham between successive cells), thickened to exactly two
      // squares across the travel; each square keeps the age of the newest step that laid it
      let pc = null, nib = null;
      const near = (cx, cy, age) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => { const q = ages.get((cx + i) + ',' + (cy + j)); return q && q[2] < age - .15; });
      const lay = (cx, cy, age, wide) => { for (const [i, j] of [[0, 0], wide]){ const key = (cx + i) + ',' + (cy + j);   // a square a NEWER step already owns, or one beside the newer ribbon, is left to it: the bar never widens
        if (!ages.has(key) && !near(cx + i, cy + j, age)) ages.set(key, [cx + i, cy + j, age]); } };
      for (let k = N; k >= 0; k--){ const p = pts[k]; if (p.down < .5){ pc = null; continue; }
        const age = (u - W.paint[0] - ps*k/N*(W.paint[1] - W.paint[0]))*RIG.HAND_DUR + 1.8*sm(W.paint[1], .9, u);   // seconds since the nib passed here; the lift cools what is left
        const px = (x + p.x*R)/BLK, py = (y + p.y*R)/BLK, cx = Math.floor(px), cy = Math.floor(py);
        if (k === N) nib = [cx, cy];
        const fx = px - cx < .5 ? -1 : 1, fy = py - cy < .5 ? -1 : 1;   // the second square on the side the nib actually sits
        if (age < 1.9){ if (!pc) lay(cx, cy, age, [0, fy]);
          else { let [x0, y0] = pc; const dx = Math.abs(cx - x0), dy = -Math.abs(cy - y0), sx = x0 < cx ? 1 : -1, sy = y0 < cy ? 1 : -1, wide = dx > -dy ? [0, fy] : [fx, 0]; let e = dx + dy;
            for (let n = 0; n < 64; n++){ lay(x0, y0, age, wide); if (x0 === cx && y0 === cy) break; const e2 = 2*e; if (e2 >= dy){ e += dy; x0 += sx; } if (e2 <= dx){ e += dx; y0 += sy; } } } }
        pc = [cx, cy];
        if (cov) for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (i*i + j*j <= 6.5) open.add((cx + i) + ',' + (cy + j)); }
      const eye = (cx, cy) => (((cx + .5)*BLK - x - EC[0]*R)/(.5*R))**2 + (((cy + .5)*BLK - y - EC[1]*R)/(.3*R))**2 < 1;   // the eye itself stays clean
      if (cov > .01){
        const r = Math.ceil(1.15*R/BLK), cx0 = Math.floor(x/BLK), cy0 = Math.floor((y - .05*R)/BLK);
        c.save(); c.beginPath();   // clip to the cells still unpainted and draw the boss there once more from grey copies of its own sheets: boss-shaped, the floor untouched
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i*i*1.0 + j*j*1.45 <= r*r && (eye(cx0 + i, cy0 + j) ? !lit : !open.has((cx0 + i) + ',' + (cy0 + j)))) c.rect((cx0 + i)*BLK, (cy0 + j)*BLK, BLK, BLK);
        c.clip(); c.globalAlpha = cov;
        OPHAN.pixel.boss(greyCtx(c), x, y, R, t, PH);
        c.restore();
      }   // the great eye stays grey under its wash until the dab lights it in one step
      if (lit && u < .97){ const r = Math.ceil(.5*R/BLK) + 1, cx0 = Math.floor((x + EC[0]*R)/BLK), cy0 = Math.floor((y + EC[1]*R)/BLK);   // and once lit it glows through the hand's shadow
        c.save(); c.beginPath(); for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (eye(cx0 + i, cy0 + j)) c.rect((cx0 + i)*BLK, (cy0 + j)*BLK, BLK, BLK);
        c.clip(); OPHAN.pixel.boss(c, x, y, R, t, PH); c.restore(); }
      // the FRESH PAINT the nib deposits: squares cooling by age, white, cream, gold, amber, each with a light top-left and a
      // darker bottom-right pixel edge; then rust that dithers out (a 50% checker, then 25%) into the boss under it, never by
      // alpha; never over the central eye; one square in six leaves a slow 1px ember
      const STEPS = [[1e-6, '#fffaf0', 0, '#ffd040'], [.3, '#ffe050', '#fffaf0', '#ff9a20'], [.6, '#ffc040', '#ffe878', '#c8501a'], [.9, '#ff8a20', '#ffc040', '#a8341a'],
        [1.2, '#c0401a', 0, 0, 2], [1.5, '#a8341a', 0, 0, 4]];   // [until, body, light edge, dark edge, dither]: only the square under the nib is white
      const by = STEPS.map(() => []), emb = [];
      if (nib && H.touch > .3){ const q = ages.get(nib[0] + ',' + nib[1]); if (q) q[2] = 0; }   // this frame's white square is the one under the nib
      for (const q of ages.values()){ const [cx, cy, a] = q; if (eye(cx, cy)) continue;
        const s = STEPS.findIndex(([t]) => a < t); if (s >= 0) by[s].push(q);
        if (a > 1.2 && a < 1.9 && hh(cx, cy) < 1/6) emb.push(q); }
      const D = BLK/TX, cell = (cx, cy, dth) => { for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) if (dth === 2 ? (i + j) % 2 === 0 : i % 2 === 0 && (j + (i >> 1)) % 2 === 0) c.rect(cx*BLK + i*TX, cy*BLK + j*TX, TX, TX); };
      const solid = new Set(); by.forEach((L, s) => { if (!STEPS[s][4]) for (const [cx, cy] of L) solid.add(cx + ',' + cy); });
      // the bevel at half strength: inside the ribbon only a 1px division one ramp step darker; the full light/dark bevel where the ribbon ends and on the newest square
      const out = (cx, cy, i, j, all) => all || !solid.has((cx + i) + ',' + (cy + j));
      const square = (L, [, body, lt, dk, dth], all, inner) => {
        c.fillStyle = body; c.beginPath(); for (const [cx, cy] of L) dth ? cell(cx, cy, dth) : c.rect(cx*BLK, cy*BLK, BLK, BLK); c.fill();
        if (!dk) return;
        for (const [col, ends] of [[inner, false], [dk, true]]){ c.fillStyle = col; c.beginPath();
          for (const [cx, cy] of L){ if (out(cx, cy, 0, 1, all) === ends) c.rect(cx*BLK, (cy + 1)*BLK - TX, BLK, TX); if (out(cx, cy, 1, 0, all) === ends) c.rect((cx + 1)*BLK - TX, cy*BLK, TX, BLK); } c.fill(); }
        if (lt){ c.fillStyle = lt; c.beginPath(); for (const [cx, cy] of L){ if (out(cx, cy, 0, -1, all)) c.rect(cx*BLK, cy*BLK, BLK - TX, TX); if (out(cx, cy, -1, 0, all)) c.rect(cx*BLK, cy*BLK, TX, BLK - TX); } c.fill(); } };
      by.forEach((L, s) => { if (L.length) square(L, STEPS[s], s === 0, (STEPS[s + 1] || STEPS[s])[1]); });
      for (const [cx, cy, a] of emb){ c.globalAlpha = 1 - sm(1.2, 1.9, a); c.fillStyle = '#ffd86a'; c.fillRect(cx*BLK + TX, cy*BLK + TX, TX, TX); }
      c.globalAlpha = 1;
      const pc0 = Math.floor((x + EC[0]*R)/BLK), pr0 = Math.floor((y + EC[1]*R)/BLK);   // the pupil's square
      if (lit && u < DAB + .015){ c.fillStyle = '#fffaf0'; c.beginPath();   // the eye takes the colour: a one-frame white flash of its iris
        const ir = .15*R, ex = x + EC[0]*R, ey = y + EC[1]*R; for (let yy = -ir; yy <= ir; yy += TX) for (let xx = -ir; xx <= ir; xx += TX) if (xx*xx + yy*yy <= ir*ir) c.rect(snap(ex + xx), snap(ey + yy), TX, TX); c.fill(); }
      if (lit && u < DAB + .02){ const f = (u - DAB)/.02, ex = x + EC[0]*R, ey = y + EC[1]*R, A = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i*Math.PI/4 + .4);   // and throws eight sparks off the pupil:
        const at = (a, r, d) => [snap(ex + Math.cos(a)*r) - d, snap(ey + Math.sin(a)*r) - d];                                                 // a white core in an amber ring, a 1px trail behind
        c.globalAlpha = 1 - .5*f; c.fillStyle = '#ffb040'; c.beginPath();
        for (const a of A){ const [px, py] = at(a, 20 + 10*f, 2*TX); c.rect(px, py, 4*TX, 4*TX); const [tx, ty] = at(a, 20 + 10*f - 4*TX, 0); c.rect(tx, ty, TX, TX); } c.fill();
        c.fillStyle = '#fffaf0'; c.beginPath(); for (const a of A){ const [px, py] = at(a, 20 + 10*f, TX); c.rect(px, py, 2*TX, 2*TX); } c.fill();
        c.globalAlpha = 1; }
      if (lit && u < DAB + .006){ const ax = .42*R, ay = .23*R, ex = x + EC[0]*R, ey = y + EC[1]*R; c.fillStyle = '#fffaf0'; c.beginPath();   // and the lid flashes a 2px white outline
        for (let yy = -ay - 2*TX; yy <= ay + 2*TX; yy += TX) for (let xx = -ax - 2*TX; xx <= ax + 2*TX; xx += TX){ const q = Math.hypot(xx/ax, yy/ay); if (q > 1 && q <= 1 + 2*TX/ay) c.rect(snap(ex + xx), snap(ey + yy), TX, TX); }
        c.fill(); }
      if (u > DAB - .006 && u < W.paint[1]) square([[pc0, pr0]], STEPS[0], true);   // the dab: one white square on the pupil
      if (H.touch > .05){ c.globalAlpha = .6*H.touch; c.fillStyle = '#120808'; c.fillRect(snap(X - BLK/2 - TX), snap(Y - BLK/2 + TX), BLK, BLK); c.globalAlpha = 1; }   // the nib's contact shadow, down-left
      // the hand, its nib on the stroke
      c.save(); c.imageSmoothingEnabled = false; c.globalAlpha = F.al;
      c.drawImage(B.cv, ox, oy, B.w*TX, B.h*TX); c.restore(); c.imageSmoothingEnabled = true;
      // at the point: a 1-2 art-px contact shadow under the nib (drawn before the hand), and 2-4 one-pixel sparks thrown along the travel
      if (H.touch > .05 && pts.length > 2){ const a = pts[pts.length - 1], b = pts[Math.max(0, pts.length - 4)], tx = a.x - b.x, ty = a.y - b.y, tl = Math.hypot(tx, ty) || 1;
        for (let i = 0; i < 4; i++){ if (i > 2 && hh(i, Math.floor(t*8)) < .5) continue; const l = (t*3.1 + hh(i, 1)) % 1, sp = (6 + 14*hh(i, 2))*l, wob = (hh(i, 3) - .5)*.8;
          c.globalAlpha = H.touch*(1 - l); c.fillStyle = '#ffd86a';
          c.fillRect(snap(X + (tx/tl + wob*ty/tl)*sp) - TX, snap(Y + (ty/tl - wob*tx/tl)*sp) - TX, 2*TX, 2*TX); }
        c.globalAlpha = 1; }
    },
  };
})();
