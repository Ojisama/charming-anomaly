import * as PIXI from 'pixi.js'
import { OPHAN, OPHAN_HANDKIT, OPHAN_HANDS, OPHAN_RIG, hh } from '../page.js'
// The Mine painter (ascii): a hand made of characters, shaded by the miner's lamp, pinching a typewriter typebar whose
// slug stamps the boss in letters. Seen from above: the back of a right hand, thumb and index pinching the bar, the
// other three fingers curled. It is built the way src/ascii.js builds a creature: soft volumes (capsules for the
// fingers and forearm, a dome for the back of the hand) packed with a jittered lattice of glyphs, each glyph shaded by
// its surface normal against the lamp (the character from the material's density ramp, its colour and size), the
// steep flanks typed as contour strokes ( ) / \ that follow the form, knuckle arcs, 'o' nails, the bar a run of thin
// steel strokes ending in a [slug]. The hand is rigid, so it is baked ONCE in hand space into DIRS canvases, one per
// lamp direction (each with an additive glow of its lamp-lit glyphs) plus one dark falloff up the arm; per frame: its
// blurred shadow, the two variants either side of the lamp crossfaded, the falloff, then the slug's mirrored letter,
// the stamped letters and the sparks as sprites.
// Hand space: origin at the slug, +x along the hand toward the wrist, 1 unit = 1 boss radius at scale 1.
OPHAN_HANDS.ascii = (() => {
  const K = OPHAN_HANDKIT, TAU = Math.PI*2, cl = K.cl;
  const FONT = '"DejaVu Sans Mono", Menlo, Consolas, "Courier New", monospace', TYPE = '"Courier New", "Nimbus Mono PS", "DejaVu Sans Mono", monospace';
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', SPARK = '*';
  const LV = 10, GPX = 40;                     // colour levels per material; glyph bake size in px
  const MATS = {                               // dense lit -> sparse dark chars, dark -> mid -> lit colour (src/ascii.js MAT)
    skin:  { chars: '&%8$*+=~-:.', c: [[52, 30, 20], [180, 120, 80], [255, 240, 210]] },
    steel: { chars: '', c: [[60, 66, 78], [168, 180, 196], [236, 244, 255]] },
    nail:  { chars: '', c: [[120, 80, 70], [236, 186, 170], [255, 236, 226]] },
  };
  const STROKES = '-\\|/()', OWN = '[]o';
  // the lamp: the miner, in boss radii from the boss (the spike's player sits 4.34 R below it); set by the caller in game
  const api = { lamp: { x: 0, y: 4.34 } };
  const DIRS = 8, KB = 170, CELL = .095, X0 = -.35, X1 = 7.6, Y0 = -1.5, Y1 = 1.1;   // KB: bake px per unit; CELL: glyph pitch
  const DARK = [5.0, 9.6, 'rgba(10,6,3,.78)'];    // unlit within DARK[0] R of the lamp, darkening to DARK[2] by DARK[1] R
  const ANCHOR = [2.8, -.3];
  const BEAT = .11, SNAP = 7, DIP = 2.5;        // the strike: one every BEAT s; the slug's snap and the hand's dip, in px
  const TURN = -.5;                            // the hand stands more upright than the rig's tool axis, so it fits the frame above the boss                   // where the lamp direction is taken from (the back of the hand)
  // the volumes, in draw order (later covers earlier): chains of [x, y, half-width], or the dome of the back of the hand
  const CH = (name, mat, pts, tip) => ({ name, mat, pts, tip });
  const PARTS = [
    CH('forearm', 'skin', [[3.55, -.3, .5], [7.2, -.2, .58]], false),
    { name: 'back', mat: 'skin', dome: [2.97, -.4, .8, 1.0], poly: [[2.29, .1], [2.33, -1.3], [2.95, -1.42], [3.6, -1.05], [3.77, -.3], [3.5, .3], [2.97, .36], [2.37, .2]] },
    // the knuckle row across the hand: middle, ring and little curled under it (from above, short bent stubs pressed
    // together), the thumb and the bent index meeting at the pinch on the bar
    CH('little', 'skin', [[2.44, -1.16, .13], [2.12, -1.24, .13]], true),
    CH('ring', 'skin', [[2.38, -.88, .15], [2.0, -.94, .15]], true),
    CH('middle', 'skin', [[2.35, -.57, .16], [1.94, -.59, .16]], true),
    { name: 'bar' },
    { ...CH('thumb', 'skin', [[3.05, .3, .16], [2.55, .62, .15], [2.05, .6, .14], [1.6, .2, .125]], true), rim: .05, crease: 2 },
    CH('index', 'skin', [[2.32, -.24, .165], [1.86, -.16, .15], [1.53, -.02, .13]], true),
  ];
  const BAR = t => { const a = [.1, 0], b = [.8, .05], c = [2.3, .26], s = 1 - t; return [s*s*a[0] + 2*s*t*b[0] + t*t*c[0], s*s*a[1] + 2*s*t*b[1] + t*t*c[1]]; };
  const lerp = (a, b, k) => a + (b - a)*k;
  const ramp = (m, I) => { const [a, b, k] = I < .5 ? [m[0], m[1], I*2] : [m[1], m[2], I*2 - 1];
    return 'rgb(' + (lerp(a[0], b[0], k)|0) + ',' + (lerp(a[1], b[1], k)|0) + ',' + (lerp(a[2], b[2], k)|0) + ')'; };
  const hh = (k, n) => { const s = Math.sin(k*127.1 + n*311.7)*43758.5453; return s - Math.floor(s); };
  const inPoly = (P, x, y) => { let r = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++){ const [xa, ya] = P[a], [xb, yb] = P[b];
    if ((ya > y) !== (yb > y) && x < (xb - xa)*(y - ya)/(yb - ya) + xa) r = !r; } return r; };
  // a chain's closest axis point to (x, y): its distance, the half-width there, the axis direction
  function onChain(C, x, y){ let best = null;
    for (let k = 0; k + 1 < C.pts.length; k++){ const [ax, ay, aw] = C.pts[k], [bx, by, bw] = C.pts[k + 1], dx = bx - ax, dy = by - ay, L2 = dx*dx + dy*dy;
      const f = cl(((x - ax)*dx + (y - ay)*dy)/L2), px = ax + dx*f, py = ay + dy*f, d = Math.hypot(x - px, y - py), w = lerp(aw, bw, f);
      if (!best || d - w < best.d - best.w) best = { d, w, px, py, k, f, L: Math.sqrt(L2), ux: dx/Math.sqrt(L2), uy: dy/Math.sqrt(L2) }; }
    return best; }
  // the surface normal of a part at (x, y), or null when outside it
  function normal(P, x, y){
    if (P.dome){ if (!inPoly(P.poly, x, y)) return null; const [cx, cy, rx, ry] = P.dome, u = (x - cx)/rx, v = (y - cy)/ry, e = Math.min(1, Math.hypot(u, v));
      const s = .75*e*e/(Math.hypot(u, v) || 1); return [u*s, v*s, Math.sqrt(Math.max(.05, 1 - (u*s)**2 - (v*s)**2))]; }
    const q = onChain(P, x, y); if (q.d > q.w) return null;
    const ox = (x - q.px)/q.w, oy = (y - q.py)/q.w; return [ox*.92, oy*.92, Math.sqrt(Math.max(.05, 1 - .85*(ox*ox + oy*oy)))];
  }
  function glyph(ch, col, font, glow){
    const n = Math.ceil(GPX*(glow ? 2.2 : 1.4)), s = K.mk(n, n), g = s.getContext('2d');
    g.font = 'bold ' + GPX + 'px ' + font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col;
    if (glow){ g.shadowColor = col; g.shadowBlur = GPX*.35; g.shadowOffsetX = 4000; g.fillText(ch, n/2 - 4000, n/2); g.fillText(ch, n/2 - 4000, n/2); }
    else g.fillText(ch, n/2, n/2);
    return s;
  }
  // a contour glyph for an edge running at on-screen angle a, its outside toward on-screen (nx, ny)
  const contourCh = (a, nx) => { const t = ((a % Math.PI) + Math.PI) % Math.PI, k = Math.round(t/(Math.PI/4)) % 4;
    return k === 2 ? (nx < 0 ? '(' : ')') : '-\\|/'[k]; };

  // a generator: the warm-up steps it between frames (baking), a first draw that finds it unfinished finishes it (bake)
  let B = null, gen = null;
  const baking = () => (B ? [].values() : (gen ??= bakeGen()));
  const bake = () => { for (const it = baking(); !it.next().done;); return B; };
  function* bakeGen(){
    const G = {};
    for (const m in MATS){ G[m] = {}; for (const ch of new Set(MATS[m].chars + STROKES + OWN)) G[m][ch] = Array.from({ length: LV }, (_, i) => glyph(ch, ramp(MATS[m].c, i/(LV - 1)), FONT)); yield; }
    G.type = {}; for (const ch of LETTERS) G.type[ch] = [glyph(ch, 'rgb(255,248,222)', TYPE), glyph(ch, 'rgb(255,70,40)', TYPE), glyph(ch, 'rgb(255,150,90)', TYPE, true), glyph(ch, 'rgb(255,226,170)', TYPE, true)];
    G.spark = {}; for (const ch of SPARK) G.spark[ch] = glyph(ch, 'rgb(255,214,150)', FONT);
    yield;
    // the hand turns by about rot0 on screen while it paints: glyphs are baked turned back by it, so they stand upright
    const rot0 = OPHAN_RIG.hand(.55).ang + TURN, ca0 = Math.cos(rot0), sa0 = Math.sin(rot0);
    const scr = (dx, dy) => [dx*ca0 - dy*sa0, dx*sa0 + dy*ca0];          // a hand-space direction on screen
    const scrA = (a) => a + rot0;
    // every glyph of the hand, as a list: { x, y, n: [nx, ny, nz], mat, ch (fixed) | null (from the ramp), size, lift, part }
    const glyphs = [], parts = PARTS.filter(P => P.name !== 'bar');
    const topAt = (x, y, from) => { for (let i = PARTS.length - 1; i > from; i--){ const P = PARTS[i]; if (P.name === 'bar' || !normal(P, x, y)) continue; return true; } return false; };
    PARTS.forEach((P, pi) => {
      if (P.name === 'bar') return;
      const add = (o) => { if (!topAt(o.x, o.y, pi)) glyphs.push({ pi, ...o }); };
      // the volume: a jittered hex lattice, lit side drawn last (src/ascii.js packEllipsoid)
      const [bx0, by0, bx1, by1] = P.dome ? [Math.min(...P.poly.map(p => p[0])), Math.min(...P.poly.map(p => p[1])), Math.max(...P.poly.map(p => p[0])), Math.max(...P.poly.map(p => p[1]))]
        : [Math.min(...P.pts.map(p => p[0] - p[2])), Math.min(...P.pts.map(p => p[1] - p[2])), Math.max(...P.pts.map(p => p[0] + p[2])), Math.max(...P.pts.map(p => p[1] + p[2]))];
      const vol = [];
      for (let y = by0, row = 0; y <= by1; y += CELL*.86, row++) for (let x = bx0 + (row % 2 ? CELL/2 : 0); x <= bx1; x += CELL){
        const jx = x + (hh(row + pi*31, x*97) - .5)*CELL*.45, jy = y + (hh(x*53 + pi, row) - .5)*CELL*.45, n = normal(P, jx, jy);
        if (!n) continue;
        const sn = scr(n[0], n[1]), steep = Math.hypot(n[0], n[1]) > .62;
        // the steep flanks are contour strokes that follow the form; the top of the volume is the density ramp
        vol.push({ x: jx, y: jy, n, mat: P.mat, ch: steep ? contourCh(Math.atan2(sn[1], sn[0]) + Math.PI/2, sn[0]) : null, size: CELL*(steep ? 1.55 : 1.5), h: hh(jx*71, jy*37) });
      }
      vol.sort((a, b) => a.n[2] - b.n[2]); vol.forEach(add);
      // the outline: contour glyphs along the edge, a little brighter on the lit side
      if (P.dome){ const Q = P.poly; for (let k = 0; k < Q.length; k++){ const [ax, ay] = Q[k], [bx, by] = Q[(k + 1) % Q.length], L = Math.hypot(bx - ax, by - ay), tx = (bx - ax)/L, ty = (by - ay)/L;
          for (let s = 0; s < L; s += CELL*.8){ const x = ax + tx*s, y = ay + ty*s, sn = scr(ty, -tx); add({ x, y, n: [ty*.9, -tx*.9, .3], mat: P.mat, ch: contourCh(scrA(Math.atan2(ty, tx)), sn[0]), size: CELL*1.7, h: .5, edge: 1 }); } } }
      else {
        for (let k = 0; k + 1 < P.pts.length; k++){ const [ax, ay, aw] = P.pts[k], [bx, by, bw] = P.pts[k + 1], L = Math.hypot(bx - ax, by - ay), tx = (bx - ax)/L, ty = (by - ay)/L;
          for (let s = 0; s <= L; s += CELL*.8) for (const e of [-1, 1]){ const w = lerp(aw, bw, s/L), x = ax + tx*s - ty*w*e, y = ay + ty*s + tx*w*e, sn = scr(-ty*e, tx*e);
            add({ x, y, n: [-ty*e*.9, tx*e*.9, .3], mat: P.mat, ch: contourCh(scrA(Math.atan2(ty, tx)), sn[0]), size: CELL*1.7, h: .5, edge: 1 }); } }
        if (P.tip){ const n = P.pts.length, [ex, ey, ew] = P.pts[n - 1], [px, py] = P.pts[n - 2], L = Math.hypot(ex - px, ey - py), ux = (ex - px)/L, uy = (ey - py)/L, a0 = Math.atan2(uy, ux);
          for (let a = -Math.PI/2; a <= Math.PI/2; a += .5){ const ox = Math.cos(a0 + a), oy = Math.sin(a0 + a), sn = scr(ox, oy);
            add({ x: ex + ox*ew, y: ey + oy*ew, n: [ox*.9, oy*.9, .3], mat: P.mat, ch: contourCh(scrA(a0 + a + Math.PI/2), sn[0]), size: CELL*1.7, h: .5, edge: 1 }); }
          // the knuckles: a bright arc over each joint, bulging toward the wrist; the nail an 'o' near the tip (index, thumb)
          P.pts.slice(0, -1).forEach(([jx, jy, jw], j) => { const [qx, qy] = P.pts[j + 1], L2 = Math.hypot(qx - jx, qy - jy), vx = (qx - jx)/L2, vy = (qy - jy)/L2, sn = scr(-vx, -vy);
            for (let s = -.6; s <= .61; s += .4) add({ x: jx - vy*jw*s + vx*.03, y: jy + vx*jw*s + vy*.03, n: [-vx*.3, -vy*.3, .95], mat: P.mat, ch: contourCh(scrA(Math.atan2(vy, vx) + Math.PI/2), sn[0]), size: CELL*(j ? 1.4 : 1.7), h: .9, lift: j ? .05 : .22 }); });
          if (P.name === 'index' || P.name === 'thumb') add({ x: ex - ux*ew*.75, y: ey - uy*ew*.75, n: [0, 0, 1], mat: 'nail', ch: 'o', size: CELL*2.4, h: .5, lift: .1 }); }
      }
      // the back of the hand: four tendons fanning from the knuckles to the wrist, dim strokes under the skin
      if (P.dome) for (const [kx, ky] of [[2.05, -.22], [2.1, -.56], [2.14, -.84], [2.18, -1.06]]) { const wx = 3.25, wy = -.3 + (ky + .6)*.35, L = Math.hypot(wx - kx, wy - ky);
        for (let s = .15; s < L - .1; s += CELL*1.2){ const x = kx + (wx - kx)*s/L, y = ky + (wy - ky)*s/L; add({ x, y, n: [0, 0, 1], mat: 'skin', ch: contourCh(scrA(Math.atan2(wy - ky, wx - kx)), 0), size: CELL*1.3, h: .5, lift: -.12 }); } }
    });
    // the typebar: a thin curved steel arm of strokes (where the hand does not cover it), the slug a bright [ ] at its end
    const bar = [], bi = PARTS.findIndex(P => P.name === 'bar');
    const hides = PARTS.filter(P => P.name === 'thumb' || P.name === 'index' || P.name === 'back');   // it runs from the pinch to the slug; the rest is in the grip
    for (let t = .05; t <= 1; t += .022){ const [x, y] = BAR(t), [x2, y2] = BAR(t + .01), a = Math.atan2(y2 - y, x2 - x);
      if (!hides.some(P => normal(P, x, y))) bar.push({ x, y, a }); }
    const [s0x, s0y] = BAR(0), [s1x, s1y] = BAR(.03), sa = Math.atan2(s1y - s0y, s1x - s0x);
    yield;
    // the shadow: the silhouette, blurred, at a quarter of the bake's resolution
    const SK = KB/4, PAD = 14;
    const sil = (g, k, only) => {
      for (const P of only ? [only] : parts){ g.beginPath(); if (P.dome){ for (const [x, y] of P.poly) g.lineTo(x*k, y*k); g.fill(); continue; }
        for (let j = 0; j + 1 < P.pts.length; j++){ const [ax, ay, aw] = P.pts[j], [bx, by, bw] = P.pts[j + 1], L = Math.hypot(bx - ax, by - ay), nx = -(by - ay)/L, ny = (bx - ax)/L;
          g.beginPath(); g.moveTo((ax + nx*aw)*k, (ay + ny*aw)*k); g.lineTo((bx + nx*bw)*k, (by + ny*bw)*k); g.lineTo((bx - nx*bw)*k, (by - ny*bw)*k); g.lineTo((ax - nx*aw)*k, (ay - ny*aw)*k); g.fill();
          for (const [cx, cy, cw] of [P.pts[j], P.pts[j + 1]]){ g.beginPath(); g.arc(cx*k, cy*k, cw*k, 0, TAU); g.fill(); } } }
      if (!only){ g.strokeStyle = '#000'; g.lineWidth = .05*k; g.beginPath(); for (let t = 0; t <= 1; t += .05) g.lineTo(BAR(t)[0]*k, BAR(t)[1]*k); g.stroke(); } };
    const shadow = K.mk((X1 - X0)*SK + 2*PAD, (Y1 - Y0)*SK + 2*PAD), sg = shadow.getContext('2d');
    sg.filter = 'blur(3px)'; sg.fillStyle = '#000'; sg.translate(PAD - X0*SK, PAD - Y0*SK); sil(sg, SK);
    // the variants: one per lamp direction (in hand space), the same glyphs shaded the src/ascii.js way
    const Wc = Math.ceil((X1 - X0)*KB), Hc = Math.ceil((Y1 - Y0)*KB);
    const VL = [], GK = KB/2, V = [];
    for (let vi = 0; vi < DIRS; vi++){ yield;
      const lit = K.mk(Wc/2, Hc/2), lg = lit.getContext('2d'); lg.setTransform(GK, 0, 0, GK, -X0*GK, -Y0*GK);
      const v = K.mk(Wc, Hc), g = v.getContext('2d'), phi = vi/DIRS*TAU, L2 = Math.hypot(1, .25), Lx = Math.cos(phi)/L2, Ly = Math.sin(phi)/L2, Lz = .25/L2;
      g.setTransform(KB, 0, 0, KB, -X0*KB, -Y0*KB);
      const put = (cv, x, y, size, al, rot) => { const d = size*1.4; g.save(); g.globalAlpha = Math.min(1, al); g.translate(x, y); g.rotate(-rot0 + (rot || 0)); g.drawImage(cv, -d/2, -d/2, d, d); g.restore(); };
      // part by part in draw order: its dark backing (so it covers what lies under it), then its glyphs
      PARTS.forEach((P, pi) => { if (P.name === 'bar') return drawBar();
        g.fillStyle = 'rgb(12,8,6)'; sil(g, 1, P.rim ? { ...P, pts: P.pts.map(([x, y, w]) => [x, y, w + P.rim]) } : P);   // a rim: a dark gap round it
        for (const q of glyphs) if (q.pi === pi) glyph1(q);
        // a joint crease: a dark line across the digit at that joint
        if (P.crease){ const [jx, jy, jw] = P.pts[P.crease], [px, py] = P.pts[P.crease - 1], L = Math.hypot(jx - px, jy - py), nx = -(jy - py)/L, ny = (jx - px)/L;
          g.strokeStyle = 'rgba(10,6,4,.85)'; g.lineWidth = .035; g.lineCap = 'round'; g.beginPath(); g.moveTo(jx + nx*jw*.8, jy + ny*jw*.8); g.lineTo(jx - nx*jw*.8, jy - ny*jw*.8); g.stroke(); } });
      function glyph1(q){
        const m = MATS[q.mat], nd = q.n[0]*Lx + q.n[1]*Ly + q.n[2]*Lz;
        const I = cl(.28 + Math.max(0, nd)*1.45 + (q.h - .5)*.18 - (1 - q.n[2])*.05 + (q.lift || 0) + (q.edge ? .1 : 0));
        const ch = q.ch || m.chars[Math.min(m.chars.length - 1, Math.floor((1 - I)*m.chars.length))];
        const cv = G[q.mat][ch][Math.round(I*(LV - 1))], size = q.size*(q.ch ? 1 : .8 + .45*I), rot = q.ch ? 0 : (q.h - .5)*.3;
        put(cv, q.x, q.y, size, q.edge ? 1 : .7 + .3*I, rot);
        // the lamp-lit glyphs (fingertips, the edge toward the lamp) again into the glow layer
        if (I > .72){ const d = size*1.4; lg.save(); lg.globalAlpha = (I - .72)/.28; lg.translate(q.x, q.y); lg.rotate(-rot0 + rot); lg.drawImage(cv, -d/2, -d/2, d, d); lg.restore(); }
      }
      function drawBar(){
        g.strokeStyle = 'rgb(8,9,12)'; g.lineWidth = CELL*3.8; g.lineCap = 'round'; g.beginPath(); for (const q of bar) g.lineTo(q.x, q.y); g.stroke();
        for (const q of bar){ const sn = scr(-Math.sin(q.a), Math.cos(q.a)), I = cl(.75 + .25*Math.abs(-Math.sin(q.a)*Lx + Math.cos(q.a)*Ly));
          for (const e of [-1, 0, 1]){ const nx = -Math.sin(q.a)*e, ny = Math.cos(q.a)*e, se = scr(nx, ny), ch = e ? contourCh(scrA(q.a), se[0]) : '-\\|/'[Math.round((((scrA(q.a) % Math.PI) + Math.PI) % Math.PI)/(Math.PI/4)) % 4];
            put(G.steel[ch][Math.round(cl(I - (e ? .1 : 0) + .15*Math.max(0, nx*Lx + ny*Ly))*(LV - 1))], q.x + nx*CELL*.95, q.y + ny*CELL*.95, CELL*2.1, 1); } }
        // the slug: bright [ ] either side of where its letter sits
        for (const e of [-1, 1]){ const ox = Math.cos(sa + Math.PI/2)*.21*e, oy = Math.sin(sa + Math.PI/2)*.21*e, sn = scr(ox, oy);
          put(G.steel[sn[0] < 0 ? '[' : ']'][LV - 1], s0x + ox, s0y + oy, CELL*4.2, 1); }
      }
      // the glow: the lit glyphs blurred, the sharp ones over them (the boss eye's glyph glow), drawn additively
      const gl = K.mk(Wc/2, Hc/2), gg = gl.getContext('2d'); gg.filter = 'blur(5px)'; gg.drawImage(lit, 0, 0); gg.filter = 'none'; gg.globalAlpha = .6; gg.drawImage(lit, 0, 0);
      VL.push(gl); V.push(v);
    }
    yield;
    // the lamp's reach, baked: a dark falloff from DARK[0] to DARK[1] (in R from the lamp, ~4.3 R below the tip) up the arm,
    // cut to the hand's own shape so it darkens only the hand, not whatever world the hand layer sits over
    const dim = K.mk(Wc, Hc), dg = dim.getContext('2d'), gx = (h) => (h - X0)*KB, lg = dg.createLinearGradient(gx(DARK[0] - 4.3), 0, gx(DARK[0] - 4.3 + (DARK[1] - DARK[0])/.7), 0);
    lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(.7, DARK[2]); lg.addColorStop(1, 'rgba(4,2,1,.96)'); dg.fillStyle = lg; dg.fillRect(0, 0, Wc, Hc);
    dg.globalCompositeOperation = 'destination-in'; dg.drawImage(V[0], 0, 0);
    // the bounce: the boss's eye glow on the fingertips and knuckles facing it (toward -x), a red-orange haze
    const bounce = K.mk(Wc/2, Hc/2), bg = bounce.getContext('2d'), bl = K.mk(Wc/2, Hc/2), bb = bl.getContext('2d');
    bl.getContext('2d').setTransform(KB/2, 0, 0, KB/2, -X0*KB/2, -Y0*KB/2); bb.fillStyle = 'rgb(255,104,56)';
    for (const q of glyphs){ const a = cl(-q.n[0]*1.6 - .2)*cl((2.8 - q.x)/1.2); if (a < .05) continue; bb.globalAlpha = a; bb.beginPath(); bb.arc(q.x, q.y, CELL*.55, 0, TAU); bb.fill(); }
    bg.filter = 'blur(4px)'; bg.drawImage(bl, 0, 0);
    B = { G, V, VL, bounce, dim, shadow, SK, PAD, slug: [s0x, s0y], rot0 }; gen = null;
  }

  return Object.assign(api, { warm(){ if (!B) bake(); }, bake: baking, hand(c, x, y, R, t, H){
    const b = B || bake(), u = K.uOf(H), F = K.pose(H, u, t);
    if (F.al < .01) return;
    const put = (cv, X, Y, size, al) => { if (al < .01) return; const d = size*1.4; c.globalAlpha = Math.min(1, al); c.drawImage(cv, X - d/2, Y - d/2, d, d); };
    // the stamped ribbon: the slug strikes on a beat (every BEAT s while it paints), each strike laying the letters of
    // the path it travelled since the last, every SP by arc length, alternating either side of the travel so they lie in
    // a two-row ribbon. Letters land only on the wings' feathers (the boss painter's onWing), never in the great eye's
    // ring or on a feather eye, never on the floor. The newest batch is red-hot, cooling to the feathers' cream.
    // The rig's path keeps within ~.8 R of the eye; the hand works it PK times larger about the eye, so its petals
    // reach out across the feather rows.
    const OA = typeof OPHAN !== 'undefined' && OPHAN.ascii, P = (OA && OA.pose || OPHAN_RIG.pose)(t, 3);
    const onFeathers = (p) => Math.hypot((p.x - P.eye.x)/.64, (p.y - P.eye.y)/.5) > 1 && P.eyes.every(E => Math.hypot(p.x - E.x, p.y - E.y) > CLEAR)
      && (OA && OA.onWing ? OA.onWing(P, p.x, p.y) : Math.hypot(p.x, p.y + .1) < 1.5);
    const GX = .15, GY = .18, CLEAR = .25;   // a letter's keep-out box (the glyph is taller than wide); a feather eye's clear radius (in R)
    const PK = 2.3, big = (p) => ({ x: P.eye.x + (p.x - P.eye.x)*PK, y: P.eye.y + (p.y - P.eye.y)*PK, down: p.down });
    const W0 = OPHAN_RIG.HAND_WIN.paint[0], beats = Math.max(0, (u - W0)*OPHAN_RIG.HAND_DUR/BEAT), us = W0 + Math.floor(beats)*BEAT/OPHAN_RIG.HAND_DUR;
    const SP = .05, ROW = .09, pts = (u > W0 ? OPHAN_RIG.hand(us) : H).stroke.pts.map(big), tip = big(H.tip), marks = []; let run = 0, k = 0;
    for (let i = 1; i < pts.length; i++){ const p = pts[i - 1], q = pts[i]; if (Math.min(p.down, q.down) < .5) continue;
      const L = Math.hypot(q.x - p.x, q.y - p.y); if (L < 1e-6) continue; const nx = -(q.y - p.y)/L, ny = (q.x - p.x)/L; let f = SP - run;
      while (f <= L){ const e = k % 2 ? -ROW : ROW, m = { x: p.x + (q.x - p.x)*f/L + nx*e, y: p.y + (q.y - p.y)*f/L + ny*e, k: k++ };
        if (onFeathers(m) && marks.every(o => Math.abs(o.x - m.x) > GX || Math.abs(o.y - m.y) > GY)) marks.push(m); f += SP; } run = L - (f - SP); }
    const mal = 1 - K.sm(.95, 1, u), ms = .18*R;
    // the strike: on each beat where the tip is over the feathers the slug snaps SNAP px into the boss and back, the
    // hand dipping DIP px with it; s runs 0..1 through the beat
    const on = H.touch > .3 && k > 0 && onFeathers(tip), s = on ? beats % 1 : 1, strike = on ? s/.3 : 1;
    const off = on ? (s < .1 ? -SNAP : -SNAP*(1 - K.sm(.1, .45, s))) : 0, dipY = on ? DIP*(1 - K.sm(.1, .5, s)) : 0;
    if (marks.length && mal > .01){
      c.save(); for (const m of marks){ const age = (k - 1 - m.k)/4 + (on ? s : 1), ch = LETTERS[(hh(m.k, 3)*26)|0], X = x + m.x*R, Y = y + m.y*R, cool = cl((age - .5)/2.5);
        if (age < 1){ c.globalCompositeOperation = 'lighter'; put(b.G.type[ch][2], X, Y, ms*1.5, mal*(1 - age)); c.globalCompositeOperation = 'source-over'; }
        if (cool < 1) put(b.G.type[ch][1], X, Y, ms, mal*(1 - cool));
        if (cool > 0) put(b.G.type[ch][0], X, Y, ms, mal*.95*cool); }
      c.restore();
    }
    const n = k;
    const sc = .82*F.S/2.2, ang = F.ang + TURN, ca = Math.cos(ang), sa = Math.sin(ang), TX = x + tip.x*R - ca*off, TY = y + tip.y*R - sa*off + dipY;
    const toX = (px, py) => TX + R*sc*(ca*px - sa*py), toY = (px, py) => TY + R*sc*(sa*px + ca*py);
    const LX = x + api.lamp.x*R, LY = y + api.lamp.y*R;
    const inHand = (f) => { c.save(); c.translate(TX, TY); c.rotate(ang); c.scale(R*sc, R*sc); f(); c.restore(); };
    // the shadow first: it reaches the boss (slid down-left by the pose's height) before anything solid appears, putting
    // out the lamp-lit floor glyphs and the boss's under a hand-shaped blob
    const shA = K.sm(.03, .13, u)*(1 - K.sm(.85, .93, u));
    if (shA > .01){ c.save(); c.translate(.4*F.L.x*R, .4*F.L.y*R); c.globalAlpha = .94*shA*(.3 + .7*cl(F.z*1.6));
      const gr = 1 + .5*cl(F.z);   // the lamp is close behind the hand: the higher it is, the larger its shadow
      inHand(() => { c.translate(ANCHOR[0], ANCHOR[1]); c.scale(gr, gr); c.translate(-ANCHOR[0], -ANCHOR[1]); c.drawImage(b.shadow, X0 - b.PAD/b.SK, Y0 - b.PAD/b.SK, b.shadow.width/b.SK, b.shadow.height/b.SK); }); c.restore(); }
    // the hand: the two baked lamp directions either side of the real one, crossfaded
    const typed = K.sm(.17, .3, u)*(1 - K.sm(.87, .95, u))*F.al;
    if (typed > .01){
      const phi = Math.atan2(LY - toY(...ANCHOR), LX - toX(...ANCHOR)) - ang, f = ((phi/TAU*DIRS) % DIRS + DIRS) % DIRS, k0 = Math.floor(f), w = f - k0;
      inHand(() => { const lay = (cv, al) => { if (al < .01) return; c.globalAlpha = al; c.drawImage(cv, X0, Y0, X1 - X0, Y1 - Y0); };
        lay(b.V[k0], typed); lay(b.V[(k0 + 1) % DIRS], typed*w);
        c.globalCompositeOperation = 'lighter'; lay(b.VL[k0], typed*(1 - w)*.7); lay(b.VL[(k0 + 1) % DIRS], typed*w*.7); lay(b.bounce, typed*.8); c.globalCompositeOperation = 'source-over'; });
      // the lamp's reach: the baked dark falloff up the arm, over the hand only
      inHand(() => { c.globalAlpha = typed; c.drawImage(b.dim, X0, Y0, X1 - X0, Y1 - Y0); });
      // the slug's raised letter, mirror-image as type is, in a glyph glow: red-hot as it strikes
      const SX = toX(...b.slug), SY = toY(...b.slug), hot = strike < 1;   // red-hot just after each hit
      const ch = LETTERS[(hh(Math.max(0, n - 1), 3)*26)|0] || 'A', d = .45*R*sc*1.4;
      c.save(); c.translate(SX, SY); c.rotate(ang - b.rot0); c.scale(-1, 1);
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = typed*(hot ? 1 : .45); c.drawImage(b.G.type[ch][hot ? 2 : 3], -d*.8, -d*.8, d*1.6, d*1.6);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = typed; c.drawImage(b.G.type[ch][hot ? 1 : 0], -d/2, -d/2, d, d); c.restore();
    }
    // a '*' burst off the point on each strike
    if (strike < 1){ const a = strike;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 6; k++){ const th = (k + hh(n, 6))/6*TAU, r = (.14 + .12*hh(n*7 + k, 7))*R*(.6 + a);
        put(b.G.spark['*'], TX + Math.cos(th)*r, TY + Math.sin(th)*r*.8, .26*R*(1 - .3*a), 1.4*(1 - a)); }
      c.restore(); }
    c.globalAlpha = 1;
  } });
})();
