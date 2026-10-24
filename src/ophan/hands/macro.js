import * as PIXI from 'pixi.js'
import { OPHAN, OPHAN_HANDKIT, OPHAN_HANDS, OPHAN_RIG, hh } from '../page.js'
// THE TOPSOIL PAINTER (macro): a real, weathered hand photographed from above in macro close-up, soil under its nails, holding
// a fine sable brush wet with raw-sienna pigment. Shot like src/macro.js shoots its cast: one low raking key from the
// top-left, cool ambient, warm subsurface at the terminator, a wet sheen on the crowns.
// The hand is modelled, not traced: in a local frame in mm (x from the brush's point toward the wrist, y across: + is the
// thumb's side) the brush lies on y = 0; index and thumb pinch its ferrule, the middle, ring and little fingers curl under,
// the back of the hand rises in four knuckles to the wrist. Every part is a height field (tapered capsules for the
// fingers, a domed outline for the back), z-buffered together with the brush.
// BAKED ONCE (first call): that height field lit per pixel (key, ambient, subsurface, sheen, its own cast shadows marched
// along the key, cavity occlusion, creases at the joints, nails with soil packed under them), the brush's tuft, and the
// hand's floor shadow at three blurs.
// PER FRAME: those bakes placed by one matrix, the tuft splaying on contact, pigment flicked off at touch-down, and the wet
// stroke on the boss as paths, clipped to the boss's own feathers.
(() => {
  const K = OPHAN_HANDKIT, RIG = OPHAN_RIG, TAU = Math.PI*2, cl = K.cl;
  const k = 5, X0 = 40, X1 = 370, Y0 = -170, Y1 = 50, W = (X1 - X0)*k, HH = (Y1 - Y0)*k;   // bake px per mm; the bake's window in mm
  const TUFT = 34, BH = 9, kb = 10;
  // noise
  const hs = (x, y, s) => { let h = (x*374761393 + y*668265263 + s*1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0)/4294967296; };
  const vn = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, ux = fx*fx*(3 - 2*fx), uy = fy*fy*(3 - 2*fy);
    const a = hs(xi, yi, s), b = hs(xi + 1, yi, s), c = hs(xi, yi + 1, s), d = hs(xi + 1, yi + 1, s); return a + (b - a)*ux + (c - a)*uy + (a - b - c + d)*ux*uy; };
  const fbm = (x, y, s, o) => { let v = 0, a = .5, f = 1, n = 0; for (let i = 0; i < o; i++){ v += a*vn(x*f, y*f, s + i*31); n += a; a *= .5; f *= 2; } return v/n; };
  const g3 = (d, r) => Math.exp(-(d*d)/(r*r));

  // THE SKELETON (mm): [x, y, radius, height of the bone's axis]
  // the pinch is a quarter of the way up the handle: the index lies along it on top, the thumb pad presses it from the side,
  // the middle finger rests under it; ring and little are curled, their knuckles toward the camera
  const IDX = [[88, -3, 7, 16], [106, -6, 7.4, 19.5], [129, -10, 8.2, 22], [158, -16, 9.4, 22]];
  const CURL = [[[156, -36, 9.8, 20], [139, -32, 9, 12], [131, -22, 6.4, 3]],
                [[154, -54, 9.4, 19], [138, -50, 9, 12], [130, -40, 6.2, 3]],
                [[154, -70, 8, 17], [143, -67, 7.4, 11], [134, -58, 5.4, 2.5]]];
  // the thumb: two short phalanges, tapering to the pad that presses the shaft to the index tip, rooted in the fleshy pad at
  // the side of the wrist (the bulge in BACK's outline), not under the palm
  // the thumb: its metacarpal leaves the back's edge near the wrist and runs out ~40 deg; two short phalanges, flexed ~24 deg
  // in all, curve back to the pad that presses the shaft against the index tip, the tip turned a quarter toward the index
  const THB = [[101, 6.8, 7, 16.5], [124, 24, 8.2, 17.5], [150, 30, 9.2, 19]], THM = [[150, 30, 9.6, 17], [196, -8, 12, 15]];
  const BACK = [[154, -14], [152, -38], [149, -57], [149, -74], [156, -84], [180, -94], [202, -96], [332, -170], [370, -170], [370, -128],
                [228, -46], [204, -18], [178, 6], [156, 24], [138, 17], [139, 7], [150, -2], [156, -6]];
  const MCP = [IDX[3], ...CURL.map((f) => f[0])], WRIST = [220, -68];
  const tipOf = (f) => f[f.length - 1], preOf = (f) => f[f.length - 2];
  const ID = { body: 1, idx: 2, mid: 3, ring: 4, lit: 5, thb: 6, fer: 10, han: 11, gilt: 12 };
  const zBrush = (x) => 6 + .12*x;
  // the key, in the hand's frame (the rig holds the brush at about -.8 rad on screen): from the -y side, low
  const LK = (() => { const a = .8, sx = -.62, sy = -.78, c = Math.cos(a), s = Math.sin(a), h = [sx*c - sy*s, sx*s + sy*c], e = .56; const n = Math.hypot(...h);
    return [h[0]/n*Math.cos(e), h[1]/n*Math.cos(e), Math.sin(e)]; })();

  const boxBlur = (src, r, passes) => { let a = Float32Array.from(src), b = new Float32Array(W*HH); const n = 2*r + 1;
    for (let p = 0; p < passes; p++){
      for (let y = 0; y < HH; y++){ const o = y*W; let s = 0; for (let x = -r; x <= r; x++) s += a[o + Math.min(W - 1, Math.max(0, x))];
        for (let x = 0; x < W; x++){ b[o + x] = s/n; s += a[o + Math.min(W - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
      for (let x = 0; x < W; x++){ let s = 0; for (let y = -r; y <= r; y++) s += b[Math.min(HH - 1, Math.max(0, y))*W + x];
        for (let y = 0; y < HH; y++){ a[y*W + x] = s/n; s += b[Math.min(HH - 1, y + r + 1)*W + x] - b[Math.max(0, y - r)*W + x]; } } }
    return a; };
  const alphaOf = (cv) => { const d = cv.getContext('2d').getImageData(0, 0, W, HH).data, o = new Float32Array(W*HH); for (let i = 0; i < o.length; i++) o[i] = d[i*4 + 3]/255; return o; };
  const mmCanvas = () => { const cv = K.mk(W, HH), g = cv.getContext('2d'); g.setTransform(k, 0, 0, k, -X0*k, -Y0*k); return [cv, g]; };
  const poly = (g, P) => { g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };

  function bakeHand(){
    const Z = new Float32Array(W*HH).fill(-1e9), I = new Uint8Array(W*HH), A = new Float32Array(W*HH);
    // the back of the hand and the forearm: a dome from the outline, tendons fanning to the wrist, four knuckles
    const [bm, bg] = mmCanvas(); { const n = BACK.length, mid = (j) => [(BACK[j%n][0] + BACK[(j + 1)%n][0])/2, (BACK[j%n][1] + BACK[(j + 1)%n][1])/2];   // rounded through the midpoints
      bg.beginPath(); bg.moveTo(...mid(0)); for (let j = 1; j <= n; j++) bg.quadraticCurveTo(...BACK[j%n], ...mid(j)); bg.fill(); } const mA = alphaOf(bm), dome = boxBlur(mA, 55, 3);
    for (let py = 0; py < HH; py++) for (let px = 0; px < W; px++){ const i = py*W + px; if (mA[i] < .01) continue;
      const X = X0 + (px + .5)/k, Y = Y0 + (py + .5)/k; let z = 5 + 25*Math.sqrt(dome[i]);
      for (const [mx, my] of MCP){ z += 4.5*g3(Math.hypot(X - mx - 3, Y - my), 7);
        const dx = WRIST[0] - mx, dy = WRIST[1] - my, L2 = dx*dx + dy*dy, t = cl(((X - mx)*dx + (Y - my)*dy)/L2), d = Math.hypot(X - mx - dx*t, Y - my - dy*t);
        z += 1.3*g3(d, 2.6)*Math.min(1, t*5)*(1 - t); }
      z += 1.2*(fbm(X/22, Y/22, 5, 2) - .5) - 6*g3(Y, 8)*K.sm(140, 175, X);   // the web the handle rests in
      Z[i] = z; I[i] = ID.body; A[i] = mA[i]; }
    // a tapered capsule: a bone of radius r round an axis at height z
    const seg = (id, a, b, sq = .9) => { const [ax, ay, ar, az] = a, [bx, by, br, bz] = b, dx = bx - ax, dy = by - ay, L2 = dx*dx + dy*dy || 1, m = Math.max(ar, br) + 1;
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - m - X0)*k)), x1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx) + m - X0)*k));
      const y0 = Math.max(0, Math.floor((Math.min(ay, by) - m - Y0)*k)), y1 = Math.min(HH - 1, Math.ceil((Math.max(ay, by) + m - Y0)*k));
      for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++){ const X = X0 + (px + .5)/k, Y = Y0 + (py + .5)/k;
        const t = cl(((X - ax)*dx + (Y - ay)*dy)/L2), r = ar + (br - ar)*t, d = Math.hypot(X - ax - dx*t, Y - ay - dy*t), cov = cl((r - d)*k + .5); if (cov <= 0) continue;
        const i = py*W + px, z = az + (bz - az)*t + Math.sqrt(Math.max(0, r*r - d*d))*sq;
        if (z > Z[i]){ Z[i] = z; I[i] = id; } if (cov > A[i]) A[i] = cov; } };
    const chain = (id, J) => { for (let s = 0; s < J.length - 1; s++) seg(id, J[s], J[s + 1]); };
    chain(ID.lit, CURL[2]); chain(ID.ring, CURL[1]); chain(ID.mid, CURL[0]);
    // the brush: nickel ferrule, oxblood handle rising toward the wrist, a gilt ring
    seg(ID.fer, [34, 0, 3, zBrush(34)], [58, 0, 3.5, zBrush(58)], 1); seg(ID.han, [58, 0, 3.6, zBrush(58)], [222, 0, 2.7, zBrush(222)], 1);
    for (let py = 0; py < HH; py++) for (let px = Math.floor((196 - X0)*k); px < (198.2 - X0)*k; px++){ const i = py*W + px; if (I[i] === ID.han) I[i] = ID.gilt; }
    chain(ID.body, THM); chain(ID.idx, IDX); chain(ID.thb, THB);

    // creases, painted as soft grooves: rings at every joint across the finger, arcs round the knuckles, the back's loose skin
    const [cm, cg] = mmCanvas(); cg.lineCap = 'round'; cg.strokeStyle = '#000';
    const ridges = (J, j, n, sp, al) => { const [ax, ay, r] = J[j], d = Math.atan2(J[j + 1][1] - J[j - 1][1], J[j + 1][0] - J[j - 1][0]), ux = Math.cos(d), uy = Math.sin(d);
      for (let q = 0; q < n; q++){ const s = (q - (n - 1)/2)*sp + .4*(hs(j, q, 3) - .5), len = r*(.32 + .4*hs(j, q, 4))*(1 - .5*Math.abs(q - (n - 1)/2)/n), bow = .2*r, o = .3*(hs(j, q, 5) - .5)*r;
        const cx = ax + ux*s, cy = ay + uy*s; cg.beginPath(); cg.moveTo(cx - uy*(o - len) , cy + ux*(o - len));
        cg.quadraticCurveTo(cx - ux*bow - uy*o, cy - uy*bow + ux*o, cx - uy*(o + len), cy + ux*(o + len)); cg.globalAlpha = al*(.7 + .3*hs(j, q, 6)); cg.lineWidth = .5 + .25*hs(j, q, 7); cg.stroke(); } };
    ridges(IDX, 1, 7, .8, .95); ridges(IDX, 2, 7, .95, .95); ridges(THB, 1, 6, .9, .9);   // deep knuckle wrinkles
    for (const f of CURL) ridges(f, 1, 6, 1.1, .9);
    for (const [mx, my, r] of MCP) for (let q = 0; q < 3; q++){ cg.globalAlpha = .3; cg.lineWidth = .5; cg.beginPath(); cg.ellipse(mx + 2, my, r*(.45 + .2*q), r*(.6 + .22*q), 0, Math.PI*.55, Math.PI*1.45); cg.stroke(); }
    for (let q = 0; q < 46; q++){ const x = 170 + 70*hs(q, 1, 9), y = -88 + 80*hs(q, 2, 9), fam = q%2 ? .6 : -.5, a = Math.atan2(-.5, .86) + fam, L = 4 + 7*hs(q, 3, 9);
      cg.globalAlpha = .12 + .14*hs(q, 4, 9); cg.lineWidth = .45; cg.beginPath(); cg.moveTo(x, y); cg.quadraticCurveTo(x + Math.cos(a)*L/2 + 1, y + Math.sin(a)*L/2, x + Math.cos(a)*L, y + Math.sin(a)*L); cg.stroke(); }
    const [cb, cbg] = mmCanvas(); cbg.setTransform(1, 0, 0, 1, 0, 0); cbg.filter = 'blur(' + .45*k + 'px)'; cbg.drawImage(cm, 0, 0); const cr = alphaOf(cb);
    // veins over the back, bluish under the skin
    const [vm, vg] = mmCanvas(); vg.lineCap = 'round'; vg.strokeStyle = '#000'; vg.lineWidth = 2;
    for (const P of [[[166, -30], [188, -42], [215, -52], [245, -68]], [[164, -62], [182, -60], [200, -70], [230, -82]], [[180, -44], [190, -56], [198, -68]]]){
      vg.beginPath(); vg.moveTo(...P[0]); for (let j = 1; j < P.length - 1; j++) vg.quadraticCurveTo(P[j][0], P[j][1], (P[j][0] + P[j + 1][0])/2, (P[j][1] + P[j + 1][1])/2); vg.lineTo(...P[P.length - 1]); vg.stroke(); }
    const [vb, vbg] = mmCanvas(); vbg.setTransform(1, 0, 0, 1, 0, 0); vbg.filter = 'blur(' + .9*k + 'px)'; vbg.drawImage(vm, 0, 0); const vA = alphaOf(vb);
    // nails: plates on index and thumb, crescents on the three curled tips, each with a rim of black soil packed under its edge
    const [nm, ng] = mmCanvas(), [sm2, sg] = mmCanvas(), [em, eg] = mmCanvas();
    const nail = (cx, cy, rx, ry, rot, crescent) => {
      const at = (g, f) => { g.save(); g.translate(cx, cy); g.rotate(rot); g.fillStyle = '#000'; f(g); g.restore(); };
      const plate = (g) => { g.beginPath(); crescent ? g.ellipse(0, 0, rx, ry, 0, Math.PI*.5, Math.PI*1.5) : g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.closePath(); };
      at(ng, (g) => { plate(g); g.fill(); });
      // from the front: a thin pale free edge over the band of soil packed under it, seen through the plate
      const band = (g, w) => { plate(g); g.fill();
        g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.ellipse(w, 0, rx, ry, 0, 0, TAU); g.fill();
        const gr = g.createLinearGradient(-rx, 0, -rx*.1, 0); gr.addColorStop(0, '#000'); gr.addColorStop(.6, 'rgba(0,0,0,.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');   // only at the front
        g.globalCompositeOperation = 'destination-in'; g.fillStyle = gr; g.fillRect(-rx*2, -ry*2, rx*4, ry*4); };
      const bandTo = (dst, w) => { const [tc, tg] = mmCanvas(); at(tg, (g) => band(g, w)); dst.save(); dst.setTransform(1, 0, 0, 1, 0, 0); dst.drawImage(tc, 0, 0); dst.restore(); };   // its own canvas: destination-in would wipe the other nails
      bandTo(eg, .6); bandTo(sg, 1.0);
      if (!crescent) at(sg, (g) => { g.strokeStyle = '#000'; g.lineWidth = .3; g.globalAlpha = .25; g.beginPath(); g.ellipse(.2, 0, rx*1.02, ry*1.02, 0, -Math.PI*.4, Math.PI*.4); g.stroke(); }); };   // grit in the cuticle
    nail(91.5, -3.4, 6.2, 4.5, -.11, false);
    nail(103.6, 11.9, 4.8, 1.5, .64, false);   // turned a quarter toward the index: the nail nearly edge-on, on the outer side
    CURL.forEach((f, j) => { const [ax, ay] = preOf(f), [bx, by, r] = tipOf(f), d = Math.atan2(by - ay, bx - ax);
      nail(bx + Math.cos(d)*r*.42, by + Math.sin(d)*r*.42, r*.55, r*.72, d + Math.PI, true); });
    const soft = (cv) => { const [o, og2] = mmCanvas(); og2.setTransform(1, 0, 0, 1, 0, 0); og2.filter = 'blur(' + .3*k + 'px)'; og2.drawImage(cv, 0, 0); return alphaOf(o); };
    const nA = soft(nm), eA = soft(em), sA = soft(sm2);
    const nailOwner = new Uint8Array(W*HH); {
      // which finger each nail mask belongs to: the nearest skeleton tip
      const tips = [[ID.idx, IDX[0]], [ID.thb, THB[0]], ...CURL.map((f, j) => [[ID.mid, ID.ring, ID.lit][j], tipOf(f)])];
      for (let i = 0; i < W*HH; i++){ if (nA[i] + sA[i] < .01) continue; const X = X0 + (i%W + .5)/k, Y = Y0 + ((i/W | 0) + .5)/k; let best = 1e9, id = 0;
        for (const [q, [tx, ty]] of tips){ const d = Math.hypot(X - tx, Y - ty); if (d < best){ best = d; id = q; } } nailOwner[i] = id; } }
    // pigment on the fingers that hold the brush
    const [pm, pg] = mmCanvas(); pg.fillStyle = '#000';
    for (const [x, y, rx, ry, a] of [[83, -1, 2.2, 1.2, -.4], [111, -1.5, 1.4, .9, -.2]]){ pg.beginPath(); pg.ellipse(x, y, rx, ry, a, 0, TAU); pg.fill(); }
    const pA = alphaOf(pm);

    // the height the light sees: skin minus its creases, plus the nails' lip
    const tipsSk = [IDX[0], THB[0], ...CURL.map(tipOf)];
    for (let i = 0; i < W*HH; i++) if (I[i]){ if (I[i] < ID.fer){ const X = X0 + (i%W + .5)/k, Y = Y0 + ((i/W | 0) + .5)/k;
        let tw = 0; for (const [tx, ty] of tipsSk) tw = Math.max(tw, g3(Math.hypot(X - tx, Y - ty), 10));
        const wv = 1.6*fbm(X/3, Y/3, 73, 2), h1 = Math.pow(Math.abs(Math.sin((X*.8 + Y*.6)*5.2 + wv)), 6), h2 = Math.pow(Math.abs(Math.sin((X*.6 - Y*.8)*5.2 - wv)), 6);
        Z[i] += .05*(fbm(X/.4, Y/.4, 75, 2) - .5) - tw*.045*(h1 + h2)*(1 - nA[i]) - .8*cr[i]; }   // pores, the fingertips' fine crosshatch, the creases
      if (nailOwner[i] === I[i]) Z[i] += .35*nA[i]; }
    const Zf = new Float32Array(W*HH); for (let i = 0; i < Zf.length; i++) Zf[i] = I[i] ? Z[i] : 0;
    const Zb = boxBlur(Zf, 18, 2);
    // cast shadows: march toward the key; anything rising above the ray darkens this pixel, softly
    const tanE = LK[2]/Math.hypot(LK[0], LK[1]), lx = LK[0]/Math.hypot(LK[0], LK[1]), ly = LK[1]/Math.hypot(LK[0], LK[1]);
    const SHD = new Float32Array(W*HH);
    for (let py = 0; py < HH; py++) for (let px = 0; px < W; px++){ const i = py*W + px; if (!I[i]) continue; let o = 0;
      for (let s = 1; s <= 36; s++){ const d = s*.8, qx = Math.round(px + lx*d*k), qy = Math.round(py + ly*d*k); if (qx < 0 || qy < 0 || qx >= W || qy >= HH) break;
        const j = qy*W + qx; if (!I[j]) continue; o = Math.max(o, cl((Z[j] - Z[i] - d*tanE)/(1.2 + .12*d))); if (o >= 1) break; }
      SHD[i] = o; }
    const SH2 = boxBlur(SHD, 2, 1);

    const out = K.mk(W, HH), og = out.getContext('2d'), im = og.createImageData(W, HH), D = im.data;
    const Hv = (() => { const v = [LK[0], LK[1], LK[2] + 1], n = Math.hypot(...v); return v.map((q) => q/n); })();
    const tipsAll = [IDX[0], THB[0], ...CURL.map(tipOf), ...CURL.map(preOf)];
    for (let py = 1; py < HH - 1; py++) for (let px = 1; px < W - 1; px++){ const i = py*W + px, id = I[i]; if (!id) continue;
      const X = X0 + (px + .5)/k, Y = Y0 + (py + .5)/k;
      // the normal, from neighbours of the same part only (a seam between parts is an edge, not a slope)
      const nb = (j) => I[j] === id ? Z[j] : Z[i];
      let nx = (nb(i - 1) - nb(i + 1))*k/2, ny = (nb(i - W) - nb(i + W))*k/2, nz = 1; const nn = Math.hypot(nx, ny, nz); nx /= nn; ny /= nn; nz /= nn;
      const ndl = nx*LK[0] + ny*LK[1] + nz*LK[2], sh = 1 - .88*SH2[i], cav = cl((Zb[i] - Z[i])/7), ao = 1 - .6*cav;
      const wrap = cl((ndl + .22)/1.22), key = wrap*sh, nh = Math.max(0, nx*Hv[0] + ny*Hv[1] + nz*Hv[2]);
      let r, g, b;
      if (id >= ID.fer){
        if (id === ID.fer){   // nickel: the room reflected, a hard window of the key, the soil's warmth from below
          const env = .16 + .95*Math.pow(cl(ndl), 1.4)*sh + .25*cl(-ny)*0 + .18*cl(ny);
          const crimp = g3(X - 51.5, .35) + g3(X - 53.8, .35), s1 = Math.pow(nh, 60)*1.6*sh;
          r = (150*env + 255*s1)*(1 - .55*crimp) + 22*cl(ny); g = (152*env + 252*s1)*(1 - .55*crimp) + 14*cl(ny); b = (158*env + 248*s1)*(1 - .55*crimp) + 8*cl(ny);
        } else {              // lacquered wood: deep colour, a hard clear-coat highlight
          const al = id === ID.gilt ? [176, 128, 52] : [92, 22, 16], s1 = Math.pow(nh, 90)*1.3*sh + Math.pow(nh, 10)*.1*sh;
          const lt = .18 + 1.0*key; r = al[0]*lt*ao + 255*s1; g = al[1]*lt*ao + 244*s1; b = al[2]*lt*ao + 232*s1; }
      } else {
        // skin: weathered, mottled down to the pores, freckled on the back, a little red over the knuckles
        const f1 = fbm(X/9, Y/9, 21, 3), f2 = fbm(X/3.5, Y/3.5, 23, 2), fp = fbm(X/.5, Y/.5, 71, 2) - .5;
        r = 170 + 18*(f1 - .5) + 9*fp; g = 138 + 15*(f1 - .5) + 8*fp; b = 108 + 12*(f1 - .5) + 7*fp;
        let kt = 0; for (const [mx, my] of [...MCP, IDX[1], IDX[2], THB[1], ...CURL.map((f) => f[1])]) kt = Math.max(kt, g3(Math.hypot(X - mx, Y - my), 8));
        r += 10*kt; g -= 3*kt; b -= 2*kt;
        const spot = id === ID.body ? cl((fbm(X/5, Y/5, 41, 2) - .72)*5)*cl((X - 150)/30)*.6 : 0; r -= 30*spot; g -= 32*spot; b -= 30*spot;
        const vein = id === ID.body ? vA[i]*.22 : 0; r += (118 - r)*vein; g += (122 - g)*vein; b += (130 - b)*vein;
        // soil: only in the creases right at the fingertips (the nails carry the rest), never on the knuckles
        let tipN = 0; for (const [tx, ty] of tipsAll) tipN = Math.max(tipN, g3(Math.hypot(X - tx, Y - ty), 6));
        const dirt = Math.min(.6, cr[i]*1.1*tipN);
        r += (64 - r)*dirt; g += (44 - g)*dirt; b += (30 - b)*dirt;
        const cw = 1 - .34*cr[i]; r *= cw; g *= cw; b *= cw;
        const pig = (id === ID.idx || id === ID.thb) ? pA[i]*.6 : 0; r += (142 - r)*pig; g += (56 - g)*pig; b += (18 - b)*pig;
        let gloss = .1*(.4 + fbm(X/6, Y/6, 61, 2))*(1 - dirt)*(1 + fp) + .5*pig, pw = 8;   // matte: a broad, faint sheen
        if (nailOwner[i] === id){ const n0 = nA[i]*(1 - sA[i]);
          r += (190 - r)*n0; g += (166 - g)*n0; b += (146 - b)*n0;
          const so = Math.min(1, sA[i]*(1.1 + .5*f2)); r += (22 - r)*so; g += (14 - g)*so; b += (9 - b)*so;
          r += (196 - r)*eA[i]*.3; g += (180 - g)*eA[i]*.3; b += (156 - b)*eA[i]*.3;
          gloss += .5*n0*(1 - sA[i]); pw += 40*n0; }
        const km = Math.pow(key, .85), sss = wrap*(1 - wrap)*4*(.35 + .65*sh), s1 = Math.pow(nh, pw)*gloss*sh;   // matte: skin falls off flatter than plastic
        r = r*(.26*ao + .95*km) + r*.2*sss + 250*s1; g = g*(.26*ao + .91*km) + g*.07*sss + 238*s1; b = b*(.3*ao + .85*km) + b*.04*sss + 226*s1;
        const ex = .8*ao, kh = 16*kt*key*sh; r = r*ex + kh; g = g*ex + kh*.9; b = b*ex + kh*.76;   // exposed with the scene, the knuckle tops catching the key
        const lu = .3*r + .59*g + .11*b; r += (lu - r)*.08; g += (lu - g)*.08; b += (lu - b)*.08; }
      D[i*4] = Math.min(255, r); D[i*4 + 1] = Math.min(255, g); D[i*4 + 2] = Math.min(255, b); D[i*4 + 3] = 255*A[i]; }
    og.putImageData(im, 0, 0);
    { const bl = K.mk(W, HH), bg = bl.getContext('2d'); bg.filter = 'blur(' + 1.6*k + 'px)'; bg.drawImage(out, 0, 0); bg.filter = 'none';
      const soft = K.mk(W, HH), sg = soft.getContext('2d'); sg.putImageData(bg.getImageData(0, 0, W, HH), 0, 0);   // a plain bitmap: the filtered canvas uploads blank
      const sharp = K.mk(W, HH), hg = sharp.getContext('2d'); hg.drawImage(out, 0, 0);
      const mg = hg.createLinearGradient((165 - X0)*k, 0, (290 - X0)*k, 0); mg.addColorStop(0, 'rgba(0,0,0,1)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
      hg.globalCompositeOperation = 'destination-in'; hg.fillStyle = mg; hg.fillRect(0, 0, W, HH);
      const sm = sg.createLinearGradient((165 - X0)*k, 0, (290 - X0)*k, 0); sm.addColorStop(0, 'rgba(0,0,0,0)'); sm.addColorStop(1, 'rgba(0,0,0,1)');
      sg.globalCompositeOperation = 'destination-in'; sg.fillStyle = sm; sg.fillRect(0, 0, W, HH);
      og.clearRect(0, 0, W, HH); og.drawImage(soft, 0, 0); og.globalCompositeOperation = 'lighter'; og.drawImage(sharp, 0, 0); og.globalCompositeOperation = 'source-over';
      const fin = og.getImageData(0, 0, W, HH); og.putImageData(fin, 0, 0); }
    // the floor shadow: hand + brush + tuft, three blurs at half resolution
    const SIL = K.mk(W/2 + 60, HH/2 + 60), lg = SIL.getContext('2d'); lg.drawImage(out, 30, 30, W/2, HH/2);
    lg.setTransform(k/2, 0, 0, k/2, 30 - X0*k/2, 30 - Y0*k/2); lg.beginPath(); lg.moveTo(0, 0); lg.lineTo(TUFT*.6, -3); lg.lineTo(TUFT + 1, -3); lg.lineTo(TUFT + 1, 3); lg.lineTo(TUFT*.6, 3); lg.closePath(); lg.fill();
    const SH = [1.5, 4, 9].map((r) => { const c = K.mk(SIL.width, SIL.height), g = c.getContext('2d'); g.filter = 'blur(' + r + 'px)'; g.drawImage(SIL, 0, 0); g.filter = 'none';
      g.globalCompositeOperation = 'source-in'; g.fillStyle = '#0c0603'; g.fillRect(0, 0, c.width, c.height);
      const o = K.mk(c.width, c.height); o.getContext('2d').putImageData(g.getImageData(0, 0, c.width, c.height), 0, 0); return o; });   // a plain bitmap: the filtered canvas uploads blank
    return { S: out, SH };
  }

  // the tuft, its own canvas so it can splay on contact: x 0 (the point) .. TUFT (the ferrule), every hair stroked
  const tuftW = (x) => { const s = x/TUFT; return s < .62 ? 3*Math.pow(Math.sin(Math.PI/2*s/.62), 1.1) : 3 - .3*(s - .62)/.38; };
  function bakeTuft(){
    const T = K.mk((TUFT + 2)*kb, 2*BH*kb), q = T.getContext('2d'); q.setTransform(kb, 0, 0, kb, 0, BH*kb); q.lineCap = 'round';
    q.fillStyle = '#2a120a'; q.beginPath(); for (let i = 0; i <= 40; i++){ const x = TUFT*i/40; q.lineTo(x, -tuftW(x)*.92); } for (let i = 40; i >= 0; i--){ const x = TUFT*i/40; q.lineTo(x, tuftW(x)*.92); } q.closePath(); q.fill();
    const WET = .64;
    for (let n = 0; n < 340; n++){
      const f = hs(n, 1, 7)*2 - 1, end = Math.pow(hs(n, 2, 7), 2.2)*TUFT*.55, wob = (hs(n, 3, 7) - .5)*.25, len = TUFT + .3 - end, lit = .55 - .45*f;
      q.beginPath();
      for (let j = 0; j <= 16; j++){ const x = TUFT + .3 - len*j/16, y = f*tuftW(x)*.98 + wob*Math.sin(j*.7 + n); j ? q.lineTo(x, y) : q.moveTo(x, y); }
      const wet = end < TUFT*WET, base = wet ? [80 + 70*lit, 30 + 30*lit, 8 + 10*lit] : [100 + 70*lit, 58 + 44*lit, 28 + 26*lit], v = .55 + .9*hs(n, 4, 7);
      q.strokeStyle = 'rgb(' + base.map((c) => Math.round(Math.min(255, c*v))).join(',') + ')'; q.lineWidth = .16 + .1*hs(n, 5, 7); q.stroke(); }
    for (let n = 0; n < 60; n++){ const f = hs(n, 6, 7)*2 - 1, x0 = TUFT*(WET + .02 + .3*hs(n, 7, 7)); q.beginPath(); q.moveTo(TUFT + .3, f*tuftW(TUFT)); q.lineTo(x0, f*tuftW(x0));
      q.strokeStyle = 'rgba(200,140,80,.55)'; q.lineWidth = .12; q.stroke(); }   // the dry kolinsky at the neck
    for (let n = 0; n < 7; n++){ const sd = n%2 ? 1 : -1, x0 = TUFT*(.25 + .5*hs(n, 8, 7)), y0 = sd*tuftW(x0)*.9; q.beginPath(); q.moveTo(x0 + 6, sd*tuftW(x0 + 6)*.8);
      q.quadraticCurveTo(x0 + 1, y0, x0 - 2.5 - 2*hs(n, 9, 7), y0 + sd*(.6 + .8*hs(n, 10, 7))); q.strokeStyle = n%3 ? 'rgba(150,70,24,.9)' : 'rgba(210,150,90,.85)'; q.lineWidth = .14; q.stroke(); }   // strays
    { const gr = q.createLinearGradient(0, 0, TUFT*WET, 0); gr.addColorStop(0, 'rgba(255,240,220,0)'); gr.addColorStop(.35, 'rgba(255,236,210,.75)'); gr.addColorStop(1, 'rgba(255,236,210,0)');
      q.strokeStyle = gr; q.lineWidth = .45; q.beginPath(); for (let i = 2; i <= 30; i++){ const x = TUFT*WET*i/30; q.lineTo(x, -tuftW(x)*.5); } q.stroke();
      q.fillStyle = 'rgba(110,40,10,.9)'; q.beginPath(); q.ellipse(.6, 0, 1, .55, 0, 0, TAU); q.fill();
      q.fillStyle = 'rgba(255,240,224,.8)'; q.beginPath(); q.ellipse(.4, -.22, .35, .14, 0, 0, TAU); q.fill(); }
    return { T };
  }

  // the wet mark: ONE stroke, the painter's sweep down the upper-left wing and over the great eye, laid in the body's own frame
  // so it rides the boss. Loaded and glossy where it lands, the pigment soaking into the barbs (no outline: its edge is
  // feathered), then darker and matt as it runs dry, the bristles dragging apart into streaks. It ends under the point.
  const LS = [-.62, -.78], HW = .2;
  const SWEEP = [[-.5, -1.04], [-.45, -.72], [-.37, -.47], [-.31, -.27], [-.36, -.06], [-.52, .07], [-.74, .14]];
  const spline = (C, per) => { const Q = [C[0]]; for (let i = 0; i < C.length - 1; i++){ const a = C[Math.max(0, i - 1)], b = C[i], c2 = C[i + 1], d = C[Math.min(C.length - 1, i + 2)];
    for (let q = 1; q <= per; q++){ const t = q/per, t2 = t*t, t3 = t2*t; Q.push([0, 1].map((k) => .5*(2*b[k] + (c2[k] - a[k])*t + (2*a[k] - 5*b[k] + 4*c2[k] - d[k])*t2 + (3*b[k] - a[k] - 3*c2[k] + d[k])*t3))); } } return Q; };
  const SQ = spline(SWEEP, 40), SL = (() => { const s = [0]; for (let j = 1; j < SQ.length; j++) s.push(s[j - 1] + Math.hypot(SQ[j][0] - SQ[j - 1][0], SQ[j][1] - SQ[j - 1][1])); return s; })();
  function wetStroke(c, H, P0, u){
    const P = H.stroke.pts, n = P.length, live = n > 0 && P[n - 1].down > .5 && H.touch > .05;
    const [w0, w1] = RIG.HAND_WIN.paint, pr = cl((u - w0 - .02)/(w1 - w0 - .1)); if (pr <= 0) return;   // how much of the sweep is down, in time
    const LT = SL[SL.length - 1], cut = pr*LT, ids = SQ.map((_, j) => j).filter((j) => SL[j] <= cut);
    if (ids.length < 2) return;
    const Q = ids.map((j) => RIG.apply(P0.body.m, SQ[j][0], SQ[j][1])), s = ids.map((j) => SL[j]);
    if (live){ const p = P[n - 1], e = Q[Q.length - 1], d = Math.hypot(p.x - e[0], p.y - e[1]);   // the last of it runs on to the point, wherever the brush has gone
      if (d < .5 && d > .01){ const k = Math.ceil(d/.03); for (let q = 1; q <= k; q++){ const f = q/k; Q.push([e[0] + (p.x - e[0])*f, e[1] + (p.y - e[1])*f]); s.push(s[s.length - 1] + d/k); } } }
    const m = Q.length, L = s[m - 1];
    const nrm = Q.map((_, j) => { const a = Q[Math.max(0, j - 1)], b = Q[Math.min(m - 1, j + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy/l, dx/l]; });
    const dry = s.map((v) => K.sm(.2*LT, .9*LT, v));                                              // 0 loaded .. 1 run dry, along the sweep
    const wAt = (j) => HW*Math.pow(cl(s[j]/.07), .5)*(1 - .35*dry[j])*(j > m - 4 ? (live ? .7 + .3*H.touch : cl((L - s[j])/.06 + .3)) : 1);
    const off = (j, f) => [Q[j][0] + nrm[j][0]*f, Q[j][1] + nrm[j][1]*f];
    // the dry side breaks up smoothly along the sweep (noise in s, not per sample: a per-sample edge reads as ribs)
    const rag = (j) => 1 - dry[j]*(.2 + .7*vn(s[j]*26, 0, 97));
    const ribbon = (k, to) => { c.beginPath(); for (let j = 0; j < to; j++){ const [X, Y] = off(j, wAt(j)*k); j ? c.lineTo(X, Y) : c.moveTo(X, Y); }
      for (let j = to - 1; j >= 0; j--){ const [X, Y] = off(j, -wAt(j)*k*rag(j)); c.lineTo(X, Y); } c.closePath(); };
    const body = dry.findIndex((d) => d > .9), bm = body < 0 ? m : Math.max(2, body);
    // the body: an opaque load of paint over the barbs, its edge feathered by widening, fainter passes; it thins out as it dries
    const g = c.createLinearGradient(Q[0][0], Q[0][1], Q[bm - 1][0], Q[bm - 1][1]);
    g.addColorStop(0, 'rgba(146,66,28,1)'); g.addColorStop(.5, 'rgba(120,52,22,.75)'); g.addColorStop(1, 'rgba(84,36,14,0)');
    const gg = c.createLinearGradient(Q[0][0], Q[0][1], Q[bm - 1][0], Q[bm - 1][1]); gg.addColorStop(0, 'rgba(206,130,84,1)'); gg.addColorStop(.6, 'rgba(206,130,84,.6)'); gg.addColorStop(1, 'rgba(206,130,84,0)');
    c.save(); c.globalCompositeOperation = 'multiply';
    for (const [k, a] of [[1.12, .3], [.96, .45]]){ ribbon(k, bm); c.globalAlpha = a; c.fillStyle = gg; c.fill(); }
    c.restore();
    c.save(); for (const [k, a] of [[1.1, .35], [.98, .55], [.85, .75]]){ ribbon(k, bm); c.globalAlpha = a; c.fillStyle = g; c.fill(); } c.restore();
    // the bristles: fine streaks ALONG the sweep, unbroken in the wet head, dragging apart into scratches as it runs dry
    c.lineCap = 'round';
    const NB = 13;   // few and irregular: evenly spaced sub-pixel streaks beat into a moire grid
    for (let b = 0; b < NB; b++){ const f = -.92 + 1.84*(b + .8*(hs(b, 1, 91) - .5))/(NB - 1), dark = hs(b, 2, 91) < .6, ph = hs(b, 3, 91)*9;
      // each run of a bristle is a thin filled sliver, pointed at both ends (stroked polylines bead at every vertex, and the
      // vertices of all the bristles line up across the stroke)
      const dw = .004 + .005*hs(b, 5, 91); let run = [];
      const flush = () => { if (run.length > 2){ const n2 = run.length; c.beginPath();
          run.forEach(([j, t], q) => { const e = dw*Math.sin(Math.PI*q/(n2 - 1)), [X, Y] = off(j, t + e); q ? c.lineTo(X, Y) : c.moveTo(X, Y); });
          for (let q = n2 - 1; q >= 0; q--){ const [j, t] = run[q], e = dw*Math.sin(Math.PI*q/(n2 - 1)), [X, Y] = off(j, t - e); c.lineTo(X, Y); } c.closePath(); c.fill(); } run = []; };
      c.fillStyle = dark ? 'rgba(58,22,8,.8)' : 'rgba(224,160,112,.42)';
      for (let j = 0; j < m; j++){ const d = dry[j];
        // the far side gives out first; in the tail each bristle skips where the noise along it dips
        if (f < 0 && -f > rag(j) - .04 || d > .2 && vn(s[j]*(30 + 12*hs(b, 4, 91)) + ph, b, 92) < .15 + .55*d){ flush(); continue; }
        run.push([j, f*wAt(j)]); }
      flush(); }
    // the wet head: a soft sheen across the loaded paint and a sharp glint along its crown
    { const hd = dry.findIndex((d) => d > .25), hm = hd < 0 ? m : Math.max(2, hd);
      const sg = Math.sign(nrm[m >> 1][0]*LS[0] + nrm[m >> 1][1]*LS[1]) || 1;
      const sh = c.createLinearGradient(Q[0][0], Q[0][1], Q[hm - 1][0], Q[hm - 1][1]); sh.addColorStop(0, 'rgba(255,226,196,.0)'); sh.addColorStop(.25, 'rgba(255,226,196,.22)'); sh.addColorStop(1, 'rgba(255,226,196,0)');
      c.save(); c.globalCompositeOperation = 'screen'; c.beginPath();
      for (let j = 0; j < hm; j++){ const [X, Y] = off(j, sg*wAt(j)*.75); j ? c.lineTo(X, Y) : c.moveTo(X, Y); }
      for (let j = hm - 1; j >= 0; j--){ const [X, Y] = off(j, sg*wAt(j)*.15); c.lineTo(X, Y); } c.closePath(); c.fillStyle = sh; c.fill(); c.restore();
      c.beginPath(); let open = false;
      for (let j = 0; j < hm; j++){ if (s[j] < .05 || vn(s[j]*14, 7, 93) < .3){ open = false; continue; }
        const [X, Y] = off(j, sg*wAt(j)*.5); open ? c.lineTo(X, Y) : c.moveTo(X, Y); open = true; }
      c.strokeStyle = 'rgba(255,244,228,.6)'; c.lineWidth = .007; c.stroke(); }
    // the bead pooled under the point while it presses
    const p = P[n - 1]; if (live){ c.fillStyle = 'rgba(96,40,16,' + .7*H.touch + ')'; c.beginPath(); c.arc(p.x, p.y, .04, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,240,222,' + .5*H.touch + ')'; c.beginPath(); c.ellipse(p.x - .014, p.y - .018, .015, .008, -.6, 0, TAU); c.fill(); }
  }
  // touch-down: the loaded tuft flicks drops of pigment off the boss onto the soil, each landing beside its own shadow
  function spray(c, H, F, u){
    const P = H.stroke.pts, i0 = P.findIndex((p) => p.down > .5); if (i0 < 0) return;
    const p0 = P[i0], U0 = RIG.HAND_WIN.paint[0] + .005; if (u < U0) return;
    const fl = cl((u - U0)/.03), fade = 1 - cl((u - .9)/.07);
    for (let j = 0; j < 7; j++){ const a = F.ang + Math.PI + 1.9*(hs(j, 1, 95) - .5), D = .45 + .75*hs(j, 2, 95), r = .02 + .026*hs(j, 3, 95);
      const f = cl(fl*(1.25 - .25*hs(j, 4, 95))), x = p0.x + Math.cos(a)*D*f, y = p0.y + Math.sin(a)*D*f, h = 4*f*(1 - f)*.18*D, land = f >= 1;
      // the shadow on the soil (lamp behind the hand: down-left), joining the drop as it lands
      const sx = x - .7*h, sy = y + .7*h, sr = r*(land ? 1.25 : 1 + 2*h);
      const g = c.createRadialGradient(sx + .004, sy + .004, 0, sx + .004, sy + .004, sr*1.3); g.addColorStop(0, 'rgba(8,4,2,' + .6*fade + ')'); g.addColorStop(.7, 'rgba(8,4,2,' + .35*fade + ')'); g.addColorStop(1, 'rgba(8,4,2,0)');
      c.fillStyle = g; c.beginPath(); c.arc(sx + .004, sy + .004, sr*1.3, 0, TAU); c.fill();
      c.save(); c.translate(x, y); c.rotate(a); const sxl = land ? 1.5 : 1 + .6*(1 - f), syl = land ? .8 : 1;
      const d = c.createRadialGradient(-r*.3, -r*.3, 0, 0, 0, r*1.05); d.addColorStop(0, 'rgba(170,92,48,' + fade + ')'); d.addColorStop(.65, 'rgba(128,58,24,' + fade + ')'); d.addColorStop(1, 'rgba(60,18,4,' + fade + ')');
      c.fillStyle = d; c.beginPath(); c.ellipse(0, 0, r*sxl, r*syl, 0, 0, TAU); c.fill(); c.restore();
      c.fillStyle = 'rgba(255,246,232,' + .85*fade + ')'; c.beginPath(); c.arc(x - r*.35, y - r*.35, r*.28, 0, TAU); c.fill(); }
  }

  const bakes = () => B || (B = Object.assign(bakeHand(), bakeTuft()));
  let B = null;
  OPHAN_HANDS.macro = {
    bakes,
    hand(c, x, y, R, t, H){
      if (!B){ bakes(); c.save(); c.globalAlpha = .001; for (const cv of [B.S, B.T, ...B.SH]) c.drawImage(cv, 0, 0, 1, 1); c.restore(); }   // every bake uploaded on the first frame, not on the frame it first shows
      const u = K.uOf(H), F = K.pose(H, u, t); if (F.al < .01) return;
      c.save(); c.globalCompositeOperation = 'source-over'; c.translate(x, y); c.scale(R, R);   // the boss can leave 'lighter' set
      // hand mm -> boss units: the brush's point on the rig's tip, the brush along the rig's tool axis
      const M = new DOMMatrix().translate(F.tip.x, F.tip.y).rotate(F.ang*180/Math.PI).scale(F.S*K.TR_U);
      const inM = () => c.transform(M.a, M.b, M.c, M.d, M.e, M.f);
      // the shadow first: a hand-shaped occluder slid away from the lamp by the hand's height, sharper as it comes down
      { const z = cl(F.z), i = z < .3 ? 0 : z < .75 ? 1 : 2, a = (.6 + .12*z)*F.al, SL = .75;
        c.save(); c.globalAlpha = a; c.translate(SL*F.L.x, SL*F.L.y); inM(); c.drawImage(B.SH[i], X0 - 60/k, Y0 - 60/k, B.SH[i].width*2/k, B.SH[i].height*2/k); c.restore(); }
      if (F.contact > .01){ const g = c.createRadialGradient(H.tip.x, H.tip.y, 0, H.tip.x, H.tip.y, .2); g.addColorStop(0, 'rgba(10,4,2,' + .45*F.contact + ')'); g.addColorStop(1, 'rgba(10,4,2,0)');
        c.fillStyle = g; c.fillRect(H.tip.x - .22, H.tip.y - .22, .44, .44); }
      const P0 = RIG.pose(t, window.OPH_PH ?? 3);
      if (H.stroke.pts.length > 1) wetStroke(c, H, P0, u);
      spray(c, H, F, u);
      c.globalAlpha = F.al;
      { const pr = F.contact; c.save(); inM(); c.translate(TUFT, 0); c.scale(1 - .14*pr, 1 + .6*pr); c.drawImage(B.T, -TUFT, -BH, B.T.width/kb, B.T.height/kb); c.restore(); }   // the tuft flattens and fans as it presses
      c.save(); inM(); c.drawImage(B.S, X0, Y0, W/k, HH/k); c.restore();
      c.restore();
    },
  };
})();
