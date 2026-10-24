import { OPHAN, OPHAN_RIG, hh, mk, shade, mix, sheen, INK, TAU, PX, STY, grain, paper } from '../page.js'
// The Ophan in the Magma look (pixel), round 29: the owner's pick, every feather resolved on a grid twice as fine as the
// world's (the boss at PX/2, the floor and its fissures at PX). Each blade is its own shape in a five-step ramp (ink, deep,
// the drake's wine, melt light, melt highlight), three bands across it lit from the upper left, a one-pixel ink seam where it
// lies on the next, dark web behind for mass. No glow inside the body: the heat glow sits outside the ink outline only.
// The tornado is a top spinning on its vertical axis: wings sorted by the rig's depth, the far ones darkened to basalt, the
// back of the body a sealed plate, and the spin's own marks (smear, rim disc, sparks, launch ring, ash puff).
// Geometry and motion are OPHAN_RIG's.
OPHAN.pixel = (() => {
  const V = 'a';   // round 30 closed centre, variant A, feather knot: the wing roots end in a tight knot of coverts swirling in, which unwind outward to free the eye
  const RIG = OPHAN_RIG, cl = RIG.cl, sm = RIG.sm;
  const INKC = '#0a0608';
  const RAMP = [INKC, '#40091a', '#8a2436', '#d8340c', '#ffa22a'];             // ink, deep, mid (the drake's wine), light, highlight (the melt)
  const ROCK = [INKC, '#2c2430', '#463c4c', '#625670', '#ffa22a'];             // wings far behind the turning body: the chapter's cold basalt
  const CLAW = ['#ff6a14', '#ffa22a', '#ffd858'], WHITE = ['#ffd858', '#fff4c4'];
  const HOT = new Set(['#d8340c', '#ff6a14', '#ffa22a', '#ffd858', '#fff4c4']);
  const BAY = [0, .5, .75, .25];                       // 2x2 Bayer: the static floor only
  const LV = ['#fff4c4', '#ffd858', '#ffa22a', '#ff6a14', '#d8340c', '#7a1004'];   // lava, white-hot to cooled
  const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const RGB = {}; const rgbOf = h => RGB[h] || (RGB[h] = hex(h));
  const circ = (cx, cy, rx, ry, m = 16) => Array.from({ length: m }, (_, k) => [cx + Math.cos(k/m*TAU)*rx, cy + Math.sin(k/m*TAU)*ry]);
  const almond = (a, h, m = 14) => { const A = [], B = []; for (let k = 0; k <= m; k++){ const s = -1 + 2*k/m, y = h*(1 - s*s); A.push([s*a, -y]); B.push([s*a, y]); } return A.concat(B.reverse()); };
  let HMIN = 0, spr = null, img = null, N = 0, SPR = new Map(), WSP = null, ECX = 0, ECY = 0;
  const SH = new Map();   // the floor shadows, one per size and phase step: the phase walks, so one slot re-baked every step
  const floorCache = {};

  // an almond eye along angle a (boss units), as white + iris + slit, pupil drawn toward the target
  function eye(P, x, y, a, rx, ry, o, T, kw, pk = 'pupil', glint = false){
    const ca = Math.cos(a), sa = Math.sin(a), rot = q => q.map(([u, v]) => [x + u*ca - v*sa, y + u*sa + v*ca]);
    const dx = T[0] - x, dy = T[1] - y, dl = Math.hypot(dx, dy) || 1, px = x + dx/dl*rx*.35, py = y + dy/dl*ry*.35*o;
    P.push({ k:kw, shade:.9, pts:rot(almond(rx, ry*o + (kw.startsWith('chest') ? .022*(1 - o) : .008))) });
    if (o < .12) return;
    P.push({ k:pk, shade:1, pts:circ(px, py, rx*.42, Math.min(rx*.42, ry*o*.9 + .006), 10) });
    P.push({ k:'slit', pts:circ(px, py, rx*.1, Math.min(rx*.36, ry*o*.8 + .004), 6) });
    if (glint) P.push({ k:'glint', pts:circ(px - rx*.16, py - Math.min(rx*.16, ry*o*.3), .004, .004, 4) });   // the catchlight, painted 2x2 white in raster
  }
  // what the look reads off the rig's beats: the flash scheme (a light wash only at the peak, the outline and eye white
  // around it), the spent dimming, the eye flare
  function look(P){
    const b = P.beats, Q = P.raw;
    return { flash: .4*sm(.72, 1, b.flash), oflash: b.flash, dim: b.recovery, flare: Q.fl, hot: Q.hot,
      pk: b.recovery > .5 ? 'dim' : Q.hot > .3 ? 'hot' : 'pupil', ew: Q.hot > .3 ? 'fwhite' : 'white' };
  }
  // a rig blade carried through matrix M: its outline, and its spine as [x, y, nx, ny, half-width] so the bands follow its curve
  function blade(q, M, i0 = 0){
    const ap = (p) => RIG.apply(M, p[0], p[1]), L = q.l.slice(i0).map(ap), Rr = q.r.slice(i0).map(ap), sp = [];
    for (let k = 0; k < L.length; k++){ const [sx, sy] = ap(q.sp[k + i0]);   // every blade at least two art pixels across, to its tip: mass, not a hairline
      for (const E of [L, Rr]){ const dx = E[k][0] - sx, dy = E[k][1] - sy, h = Math.hypot(dx, dy); if (h >= HMIN) continue;
        const [tx, ty] = ap(q.sp[Math.min(q.sp.length - 1, k + i0 + 1)]), [bx, by] = ap(q.sp[Math.max(0, k + i0 - 1)]), gx = tx - bx, gy = ty - by, gl = Math.hypot(gx, gy) || 1, sg = E === L ? 1 : -1;
        let nx = h > 1e-6 ? dx/h : -gy/gl*sg, ny = h > 1e-6 ? dy/h : gx/gl*sg; E[k] = [sx + nx*HMIN, sy + ny*HMIN]; } }
    let nx = 0, ny = 1;
    for (let k = 0; k < L.length; k++){ const [sx, sy] = ap(q.sp[k + i0]), dx = L[k][0] - sx, dy = L[k][1] - sy, h = Math.hypot(dx, dy);
      if (h > 1e-5){ nx = dx/h; ny = dy/h; } sp.push([sx, sy, nx, ny, h]); }
    return { pts: L.concat(Rr.reverse()), sp };
  }

  // a short feather in the body frame, as the rig shapes its own (base, angle, length, half-width, curl)
  function fth(bx, by, a, L, w, cv){
    const ca = Math.cos(a), sa = Math.sin(a), l = [], r = [], sp = [];
    for (let k = 0; k <= 10; k++){ const u = k/10, off = cv*L*u*u, cx = bx + ca*L*u - sa*off, cy = by + sa*L*u + ca*off;
      const dx = ca - sa*2*cv*u, dy = sa + ca*2*cv*u, dl = Math.hypot(dx, dy), nx = -dy/dl, ny = dx/dl, hw = w*Math.min(1, u/.18 + .35)*Math.pow(Math.max(0, 1 - u*u), .6);
      l.push([cx + nx*hw, cy + ny*hw]); r.push([cx - nx*hw, cy - ny*hw]); sp.push([cx, cy]); }
    return { l, r, sp };
  }
  // the closed centre, where the wings join the body, and how it parts for the eye (k: the rig's eye-open beat, 0 shut, 1 open)
  function centre(out, B, E, k, e0){
    const F = (q, sh) => { const bl = blade(q, B.m); out.push({ k:'cov', g:7, shade:sh, pts:bl.pts, sp:bl.sp }); }, sk = sm(.3, 1, k);
    if (V === 'a'){   // a feather knot: three rings of coverts swirling in over each other, inner over outer, like the base of a tail
      [[11, .3, .17, .055], [9, .21, .14, .05], [6, .05, .11, .05]].forEach(([n, r0, L, w], j) => {
        const go = sm(.3 + .1*j, 1, k); if (go > .97) return;   // the inner rings unwind first
        for (let i = 0; i < n; i++){ const a = i/n*TAU + j*.45, rb = r0 + (E.r*1.1 - r0)*go, d = a + Math.PI*(.62 - .5*go);
          F(fth(E.x + Math.cos(a)*rb, E.y + Math.sin(a)*rb*.9, d, L*(1 - .7*go), w*(1 - .4*go), .35), .5 + .06*j); } });
    } else if (V === 'b'){   // a body hub: a dome the wing roots plug into, a collar plate round each root; the dome opens as a four-leaf shutter
      for (let i = 0; i < 6; i++){ const a = [-.35, .35, Math.PI - .35, Math.PI + .35, -Math.PI/2 + .9, -Math.PI/2 - .9][i] + Math.PI*(i > 3 ? 1 : 0), ca = Math.cos(a), sa = Math.sin(a);
        const r0 = .17 + .12*sk, r1 = .27 + .08*sk, hw = .42, pts = [];   // the collar: a thick arc of plate where that wing meets the hub
        for (let m = 0; m <= 6; m++){ const b = a - hw + 2*hw*m/6; pts.push([E.x + Math.cos(b)*r1, E.y + Math.sin(b)*r1*.9]); }
        for (let m = 6; m >= 0; m--){ const b = a - hw + 2*hw*m/6; pts.push([E.x + Math.cos(b)*r0, E.y + Math.sin(b)*r0*.9]); }
        out.push({ k:'cov', g:7, shade:.55 + .05*(i % 2), pts:pts.map(p => RIG.apply(B.m, p[0], p[1])) }); }
      if (sk < .97) for (let q = 0; q < 4; q++){ const a0 = q*Math.PI/2 + Math.PI/4, ox = Math.cos(a0)*.2*sk, oy = Math.sin(a0)*.2*sk, s = .2*(1 - .55*sk), pts = [[E.x + ox, E.y + oy]];
        for (let m = 0; m <= 6; m++){ const b = a0 - Math.PI/4 + Math.PI/2*m/6; pts.push([E.x + ox + Math.cos(b)*s, E.y + oy + Math.sin(b)*s*.9]); }   // a quarter of the dome
        out.push({ k:'prim', g:8 + q, shade:.62 - .06*q, pts:pts.map(p => RIG.apply(B.m, p[0], p[1])) }); }
    } else {   // a rosette collar: two rows of short layered petals round a shadowed, recessed hub; they fold back and the pit opens into the eye
      const pr = .09 + .14*sk; out.splice(e0, 0, { k:'pit', pts:circ(E.x, E.y, pr, pr*.9, 18).map(p => RIG.apply(B.m, p[0], p[1])) });
      [[13, .17, .2, .06, 0], [11, .1, .14, .05, .5]].forEach(([n, r0, L, w, ph], j) => {
        const go = sm(.3 + .1*j, 1, k); if (go > .97) return;
        for (let i = 0; i < n; i++){ const a = (i + ph)/n*TAU, rb = r0 + (E.r*1.08 - r0)*go;
          F(fth(E.x + Math.cos(a)*rb, E.y + Math.sin(a)*rb*.9, a, L*(1 - .65*go), w, .12*(i % 2 ? 1 : -1)), .52 + .06*j); } });
    }
  }
  // the parts, boss units (y down), back to front; each carries its kind k and its wing group g
  const PEEL_N = RIG.WINGS.reduce((a, Wg) => a + Math.floor(Wg.feathers.length/2), 0);   // the sword's peeled feathers: every other one of every wing
  const PIDX = (() => { let k = 0; return RIG.WINGS.map((Wg) => { const o = {}; Wg.feathers.forEach((_, n) => { if (n % 2) o[n] = k++; }); return o; }); })();
  function build(t, ph, P, Lk){
    const B = P.body, out = [], T = P.gaze, bm = (pts) => pts.map(([x, y]) => RIG.apply(B.m, x, y));
    const SW = P.swd && P.swd.A.blade.form > 0 ? P.swd : null, P0 = SW ? RIG.pose(t, ph) : null, CF = [];   // the sword (morph C): the wings keep their idle spread and shed every other feather into the blade
    const Kc = SW ? (() => { const [a, b, c2, d, e, f2] = P0.body.m, det = a*d - b*c2; return RIG.mul(B.m, [d/det, -b/det, -c2/det, a/det, (c2*f2 - d*e)/det, (b*e - a*f2)/det]); })() : null;
    const H = P.halo; out.push({ k:'halo', ann:[H.x, H.y, .49*H.scale, .54*H.scale, Math.max(.12, Math.abs(P.body.face ?? 1))], pts:[[H.x - .6, H.y - .6], [H.x + .6, H.y - .6], [H.x + .6, H.y + .6], [H.x - .6, H.y + .6]] });   // the nimbus, behind every wing
    const feather = (q, M, g, bare = false, fx = null) => { const bl = blade(q, M); if (fx) fx(bl); out.push({ k:'prim', g, shade:.48 + .12*q.j, pts:bl.pts, sp:bl.sp });
      if (bare) return; if (q.tal) out.push({ k:'talon', g, shade:.8, pts:blade(q, M, 6).pts });   // the hooked tip, white-hot
      else if (q.bead){ const s = Math.hypot(M[0], M[1]); out.push({ k:'prim', g, shade:.7, pts:circ(...RIG.apply(M, q.bead.x, q.bead.y), q.bead.r*s, q.bead.r*s, 8) }); } };
    const wing = (w1) => { const w = SW ? P0.wings.find((v) => v.i === w1.i && v.side === w1.side) || w1 : w1; if (w.vis < .45) return; const s0 = out.length, thin = false;
      const Wg = RIG.WINGS[w.i], M = SW ? RIG.mul(Kc, w.m) : w.m, g = w.i*2 + (w.side > 0 ? 1 : 0), s = Math.hypot(M[0], M[1]), [rx, ry] = Wg.root;
      if (!SW) out.push({ k:'prim', g, shade:.4, pts:[[rx, ry]].concat(Wg.feathers.map((q) => q.sp[q.sp.length - 2])).map(([x, y]) => RIG.apply(M, x, y)) });   // the web between the blades, filled most of the way to the tips: one lotus mass
      for (const [qi, q] of Wg.feathers.entries()){ if (SW && qi % 2){ const h = hh(qi, w.i*3 + w.side + 5), u = SW.u, kf = sm(.03 + .12*h, .14 + .12*h, u)*(1 - sm(.84 + .05*h, .9 + .05*h, u));   // peeled: in flight to its slot on the blade, or back
          if (kf >= .01){ CF.push({ q, i: w.i, n: qi, side: w.side, M, k: kf, g }); continue; } }
        feather(q, M, g); }
      if (!thin) for (const q of Wg.coverts){ const bl = blade(q, M); out.push({ k:'cov', g, shade:.55, pts:bl.pts, sp:bl.sp }); }
      if (!thin){ const [x0, y0, x1, y1] = Wg.arm, dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy/l*.085, ny = dx/l*.085;   // the arm ridge the eyes sit in
        const pts = [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]].map(([x, y]) => RIG.apply(M, x, y));
        const sp = [0, .25, .5, .75, 1].map((f) => { const [a, b] = RIG.apply(M, x0 + dx*f, y0 + dy*f), [c2, d2] = RIG.apply(M, x0 + dx*f + nx, y0 + dy*f + ny), h = Math.hypot(c2 - a, d2 - b); return [a, b, (c2 - a)/h, (d2 - b)/h, h]; });
        out.push({ k:'cov', g, shade:.5, pts, sp }); }
      for (const E0 of w.eyes){ if (E0.open < .02 || thin) continue;   // the wing's eyes, on its arm
        const E = SW ? Object.assign({}, E0, (([x, y]) => ({ x, y }))(RIG.apply(Kc, E0.x, E0.y))) : E0, cr = Math.cos(E.rot), sr = Math.sin(E.rot), ax = M[0]*cr + M[2]*sr, ay = M[1]*cr + M[3]*sr, es = Math.hypot(ax, ay), a = Math.atan2(ay, ax);
        eye(out, E.x, E.y, a, E.r*es, E.r*.52*es, Math.min(1, E.open), T, E.las ? Lk.ew : 'white', E.las ? Lk.pk : Lk.pk === 'dim' ? 'dim' : 'pupil', E.las); }
      for (let k = s0; k < out.length; k++) out[k].dp = w.depth; };
    // the top's depth: wings turned behind the body first, the body, then the wings swung in front of it
    for (const w of P.wings) if (!(w.depth > .02)) wing(w);
    // the blade, on the rig's path (reared behind the head, then straight over the top and down the line): the peeled feathers
    // laid flat along it edge to edge: each side's feathers one staggered row (a straight edge), its first across for the guard (inked over the
    // up wings, its own group), its last on the axis as the point; once in place the blade is one group, so it is inked off the wings
    const blade_ = (gd) => { if (!CF.length) return; const S = SW.A.blade, m = B.m, bx = m[2]*-.2 + m[4], by = m[3]*-.2 + m[5], a = Math.atan2(S.tip.y - by, S.tip.x - bx), L = Math.max(.3, .9*S.form, Math.hypot(S.tip.x - bx, S.tip.y - by));
      const N = PEEL_N, W = Math.max(S.w*.8, 3*HMIN), lr = .76*L*2/(N - 2), ez = (k) => k*k*(3 - 2*k);
      const slot = (j, sd) => { if (!j) return [.3, 0, a + sd*Math.PI/2, Math.max(.3, .16*L), 1.3*W];   // [along, across, angle, length, width]
        if (j === N - 1) return [.72*L, 0, a, .28*L, 2*W]; return [(j - 1)*lr/2, sd*W/2, a, lr, W]; };
      for (const F of CF){ const q = F.q, [b0, b1] = q.sp[0], [t0, t1] = q.sp[10], lq = Math.hypot(t0 - b0, t1 - b1), aq = Math.atan2(t1 - b1, t0 - b0), j = PIDX[F.i][F.n]; if (!j !== !!gd) continue; const wq = Math.max(...q.l.map((p, k) => Math.hypot(p[0] - q.r[k][0], p[1] - q.r[k][1])));
        const [d, o, r, ln, wd] = slot(j, F.side), ca = Math.cos(a), sa = Math.sin(a), cr = Math.cos(r), sr = Math.sin(r), sd = F.side;
        const Mt = RIG.mul(RIG.mul([cr, sr, -sr, cr, bx + ca*d - sa*o, by + sa*d + ca*o], [ln/lq, 0, 0, sd*wd/wq, 0, 0]), RIG.mul([Math.cos(aq), -Math.sin(aq), Math.sin(aq), Math.cos(aq), 0, 0], [1, 0, 0, 1, -b0, -b1]));
        // landing, it squares into its own straight-sided piece of the sword: a strip of the edge, the guard bar, or the point
        const hs = sm(.55, 1, F.k), dx = cr, dy = sr, px = bx + ca*d - sa*o, py = by + sa*d + ca*o, tip = j === N - 1;
        const fx = hs > 0 ? (bl) => { const n = bl.sp.length, P = bl.pts, sg = Math.sign((P[n >> 1][0] - bl.sp[n >> 1][0])*-dy + (P[n >> 1][1] - bl.sp[n >> 1][1])*dx) || 1;
          for (let k = 0; k < n; k++){ const t = k/(n - 1), hw = wd/2*(tip ? Math.min(1, (1 - t)/.6) : 1), cx = px + dx*t*ln, cy = py + dy*t*ln, S = bl.sp[k], A = P[k], Z = P[2*n - 1 - k];
            P[k] = [A[0] + (cx - dy*hw*sg - A[0])*hs, A[1] + (cy + dx*hw*sg - A[1])*hs]; P[2*n - 1 - k] = [Z[0] + (cx + dy*hw*sg - Z[0])*hs, Z[1] + (cy - dx*hw*sg - Z[1])*hs];
            bl.sp[k] = [S[0] + (cx - S[0])*hs, S[1] + (cy - S[1])*hs, S[2], S[3], S[4] + (hw - S[4])*hs]; } } : null;
        const k = ez(F.k), Ml = F.M.map((v, x) => v + (Mt[x] - v)*k), s0 = out.length; feather(q, Ml, F.k > .5 ? (j ? 7 : 8) : F.g, F.k > .5, fx); for (let x = s0; x < out.length; x++) out[x].dp = 0; } };
    if (SW && SW.A.blade.under > .5) blade_();
    for (const q of RIG.CORE){ const bl = blade(q, B.m); out.push({ k:'prim', g:6, shade:.5, pts:bl.pts, sp:bl.sp }); }   // the short blades round the great eye
    const e0 = out.length, E = RIG.EYE, op = P.beats.open;
    const iv = (() => { const [a, b, c2, d] = B.m, det = a*d - b*c2; if (Math.abs(det) < 1e-6) return [0, 0]; return [(T[0] - B.m[4])*d/det - (T[1] - B.m[5])*c2/det, -(T[0] - B.m[4])*b/det + (T[1] - B.m[5])*a/det]; })();   // the gaze, in the body frame
    if (B.face >= 0){ if (P.eye.open > .04) eye(out, E.x, E.y, 0, E.r, E.r*.52, Math.min(1, P.eye.open), iv, Lk.dim > .5 ? 'chestdim' : 'chest'); }   // the great eye: huge, unblinking, watching; shut, there is no eye at all
    else { const v = q => q.map(([x, y]) => [E.x + y, E.y + x]);   // its back: a sealed plate, an ink seam down it with a thread of melt in the crack
      out.push({ k:'slit', pts:v(almond(E.r*.7, .035)) }, { k:'hot', pts:v(almond(E.r*.5, .012)) }); }
    for (let k = e0; k < out.length; k++) out[k].pts = bm(out[k].pts);
    if (B.face >= 0) centre(out, B, E, op, e0);   // the junction over it, parting as the eye opens
    for (const w of P.wings) if (w.depth > .02) wing(w);
    if (SW && SW.A.blade.under <= .5) blade_();
    if (SW) blade_(true);
    return out;
  }

  const BUF = {}; const buf = (k, C, n) => { const b = BUF[k]; return b && b.length === n*n ? b : (BUF[k] = new C(n*n)); };   // scratch planes, kept per size
  function raster(R, t, ph, Pz, Lk, quick = false, o = [0, 0]){   // quick: the silhouette only (a ghost, tinted flat); o: where the body has moved to (boss units), the sprite is cut round it
    HMIN = 1.25/R; const P = build(t, ph, Pz, Lk); let ext = 1.9;
    if (o[0] || o[1]) for (const p of P){ p.pts = p.pts.map(([x, y]) => [x - o[0], y - o[1]]); if (p.sp) p.sp = p.sp.map(([x, y, ...r]) => [x - o[0], y - o[1], ...r]); if (p.ann) p.ann = [p.ann[0] - o[0], p.ann[1] - o[1], ...p.ann.slice(2)]; }   // the buffer grows to hold the rig's reach (the blast strike stretches the down pair past 3R)
    for (const p of P) for (const [x, y] of p.pts) ext = Math.max(ext, Math.abs(x) + .12, Math.abs(y) + .12);
    const n = Math.ceil(R*2*ext/8)*8 + 6; if (n !== N){ N = n; if (!SPR.has(n)){ const cv = mk(n, n); SPR.set(n, [cv, cv.getContext('2d').createImageData(n, n)]); } [spr, img] = SPR.get(n); }   // one buffer per size, kept
    const c0 = n/2, id = buf('id', Int16Array, n).fill(-1), lit = buf('lit', Float32Array, n), kind = [];
    P.forEach((p, pi) => {
      const Q = p.pts.map(([px,py]) => [c0 + px*R, c0 + py*R]);
      let x0 = n, x1 = 0, y0 = n, y1 = 0, mx = 0, my = 0;
      for (const [x,y] of Q){ x0 = Math.min(x0,x); x1 = Math.max(x1,x); y0 = Math.min(y0,y); y1 = Math.max(y1,y); mx += x; my += y; }
      mx /= Q.length; my /= Q.length; const sz = Math.max(1.5, (x1-x0 + y1-y0)/2); kind[pi] = p.k;
      let any = false;
      const sh = p.shade || .5, SR = p.sp && p.sp.map(([x, y, nx, ny, h]) => [c0 + x*R, c0 + y*R, nx, ny, Math.max(1, h*R), -(nx + ny) > 0 ? 1 : -1]);
      const set = (x, y) => { const k = y*n + x; id[k] = pi; any = true;
        if (!SR){ lit[k] = sh + .5*(-(x + .5 - mx) - (y + .5 - my))/sz; return; }
        let j = 0, bd = 1e9; for (let m = 0; m < SR.length; m++){ const dd = (x + .5 - SR[m][0])**2 + (y + .5 - SR[m][1])**2; if (dd < bd){ bd = dd; j = m; } }
        const [qx, qy, nx, ny, h, sg] = SR[j], v = sg*((x + .5 - qx)*nx + (y + .5 - qy)*ny)/h, uu = j/(SR.length - 1);
        lit[k] = .6 + .3*v - (uu < .3 ? .16 : 0) + (uu > .7 ? .05 : 0) + (sh - .5)*.3;   // flat bands along the feather: lit edge, body, shadow edge, dark root
      };
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(n-1, Math.ceil(y1)); y++){
        const py = y + .5;
        if (p.ann){                                       // an annulus, by distance
          for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(n-1, Math.ceil(x1)); x++){ const rr = Math.hypot((x + .5 - c0 - p.ann[0]*R)/p.ann[4], py - c0 - p.ann[1]*R)/R; if (rr >= p.ann[2] && rr <= p.ann[3]) set(x, y); }   // narrowed as the top turns
          continue;
        }
        const xs = [];                                    // scanline: even-odd spans between edge crossings
        for (let i = 0, j = Q.length-1; i < Q.length; j = i++){ const [xi,yi] = Q[i], [xj,yj] = Q[j]; if ((yi > py) !== (yj > py)) xs.push((xj-xi)*(py-yi)/(yj-yi) + xi); }
        xs.sort((u, v) => u - v);
        for (let q = 0; q + 1 < xs.length; q += 2){ const xa = Math.max(0, Math.ceil(xs[q] - .5)), xb = Math.min(n-1, Math.ceil(xs[q+1] - .5) - 1); for (let x = xa; x <= xb; x++) set(x, y); }
      }
      if (!any){ const cx = Math.floor(mx), cy = Math.floor(my); if (cx >= 0 && cy >= 0 && cx < n && cy < n){ id[cy*n + cx] = pi; lit[cy*n + cx] = p.shade || .5; } }
    });
    const FEATH = ['prim', 'talon', 'cov'], grp = P.map(p => p.g === undefined ? -1 : p.g), ord = {};   // a wing's depth: the index of its first part
    P.forEach((p, pi) => { if (p.g !== undefined && ord[p.g] === undefined) ord[p.g] = pi; });
    { // one mass behind the feathers: dark web between the blades (a box-majority fill, two running-sum passes), the blades stay separate shapes
      const occ = buf('occ', Uint8Array, n), rs = buf('rs', Uint16Array, n), FR = 4, fi = kind.length, need = ((2*FR + 1)**2)/2; kind.push('web'); grp.push(-1);
      for (let k = 0; k < n*n; k++) occ[k] = id[k] >= 0 && kind[id[k]] !== 'halo' ? 1 : 0;
      for (let y = 0; y < n; y++){ let a = 0; for (let x = -FR; x < n; x++){ if (x + FR < n) a += occ[y*n + x + FR]; if (x - FR - 1 >= 0) a -= occ[y*n + x - FR - 1]; if (x >= 0) rs[y*n + x] = a; } }
      for (let x = 0; x < n; x++){ let a = 0; for (let y = -FR; y < n; y++){ if (y + FR < n) a += rs[(y + FR)*n + x]; if (y - FR - 1 >= 0) a -= rs[(y - FR - 1)*n + x];
        if (y >= 0 && a > need && id[y*n + x] < 0){ id[y*n + x] = fi; lit[y*n + x] = .3; } } }
    }
    for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++){ const k = y*n + x; if (id[k] < 0 || kind[id[k]] === 'halo') continue;   // no lone one-pixel spur
      if ((id[k-1] >= 0) + (id[k+1] >= 0) + (id[k-n] >= 0) + (id[k+n] >= 0) <= 1) id[k] = -1; }
    const d = img.data; d.fill(0);
    if (quick){ for (let k = 0; k < n*n; k++) if (id[k] >= 0) d[k*4 + 3] = 255; spr.getContext('2d').putImageData(img, 0, 0); return spr; }
    const hm = buf('hm', Float32Array, n).fill(0);
    const put = (k, h) => { hm[k] = HOT.has(h) ? (h === '#d8340c' ? .5 : 1) : 0; const [r,g,b] = rgbOf(h); d[k*4] = r; d[k*4+1] = g; d[k*4+2] = b; d[k*4+3] = 255; };
    const ramp = (A, k) => A[Math.max(0, Math.min(A.length - 1, Math.floor(Math.max(0, Math.min(.999, lit[k] - .08))*A.length)))];
    const isK = (k, ks) => id[k] >= 0 && ks.includes(kind[id[k]]);
    const MAT = new Set(['prim', 'cov', 'web']), fl = Lk.flash, up = fl > .2 ? 1 : Lk.dim > .5 ? -1 : 0;   // the strike frame lifts every value one step, the spent body drops one
    // a wing turned behind the body goes a step darker and, far back, to the chapter's cold basalt; one swung in front a step brighter
    const tone = (j, dp) => (dp < -.6 ? ROCK : RAMP)[Math.max(1, Math.min(4, j + up + (dp < -.25 ? -1 : dp > .6 && up === 0 && j === 2 ? 1 : 0)))];
    const nb4 = k => id[k-1] !== id[k] || id[k+1] !== id[k] || id[k-n] !== id[k] || id[k+n] !== id[k];
    const GL = [], ecx = c0 + (Pz.eye.x - o[0])*R, ecy = c0 + (Pz.eye.y - o[1])*R;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++){
      const k = y*n + x, i = id[k];
      if (i < 0) continue;
      const kd = kind[i];
      if (kd === 'halo'){ put(k, '#d8340c'); continue; }
      if (kd === 'white' || kd === 'chest'){ put(k, fl > .2 ? '#ffffff' : ramp(WHITE, k)); continue; }
      if (kd === 'fwhite'){ put(k, ramp(['#ffa22a', '#ffd858'], k)); continue; }
      if (kd === 'chestdim'){ put(k, ramp(['#d8340c', '#ff6a14'], k)); continue; }
      if (kd === 'pupil'){ put(k, '#b0140c'); continue; }
      if (kd === 'hot'){ put(k, '#fff4c4'); continue; }
      if (kd === 'glint'){ GL.push(k); continue; }
      if (kd === 'dim'){ put(k, '#40262a'); continue; }
      if (kd === 'slit'){ put(k, INKC); continue; }
      if (kd === 'pit'){ put(k, nb4(k) ? INKC : '#1a0810'); continue; }   // the rosette's recessed hub: deep shadow in an ink rim
      const nb = [x<n-1 ? id[k+1] : -1, y<n-1 ? id[k+n] : -1, x>0 ? id[k-1] : -1, y>0 ? id[k-n] : -1], g = grp[i], og = g >= 0 ? ord[g] : -1, dp = (P[i] && P[i].dp) || 0;
      if (kd === 'talon'){ put(k, dp < -.25 ? tone(3, dp) : nb.some(j => j < 0) ? '#fff4c4' : ramp(CLAW, k)); continue; }
      if (nb.some(j => j >= 0 && grp[j] >= 0 && grp[j] !== g && ord[grp[j]] > og && (MAT.has(kind[j]) || kind[j] === 'talon'))){ put(k, INKC); continue; }   // ink where the wing in front begins
      // every blade its own shape: three bands across it, lit edge to shadow edge, a one-pixel ink seam where it lies on the next
      if (kd === 'web'){ put(k, tone(1, 0)); continue; }
      if (nb.some(j => j > i && grp[j] === g && FEATH.includes(kind[j]))){ put(k, INKC); continue; }
      const L = lit[k]; put(k, tone(L < .42 ? 1 : L < .66 ? 2 : L < .82 ? 3 : 4, dp));
    }
    // the great eye's ring: one near-black art pixel all round it, then one of melt
    for (const k of GL) for (const o of [0, 1, n, n + 1]) if (k + o < n*n) put(k + o, '#ffffff');   // the feather eyes' catchlight: 2x2, white
    const ringM = buf('ring', Uint8Array, n).fill(0), EYEK = ['chest', 'chestdim'], e0 = Math.max(1, Math.floor(Math.min(ecx, ecy) - .45*R)), e1 = Math.min(n - 1, Math.ceil(Math.max(ecx, ecy) + .45*R));
    const inEye = k => isK(k, EYEK) || ((isK(k, ['pupil', 'slit'])) && Math.abs((k % n) - ecx) < .27*R && Math.abs((k/n|0) - ecy) < .16*R);
    for (let y = e0; y < e1; y++) for (let x = e0; x < e1; x++){ const k = y*n + x; if (inEye(k)) continue;
      for (let j = -1; j <= 1 && !ringM[k]; j++) for (let i = -1; i <= 1; i++) if (inEye(k + j*n + i)){ ringM[k] = 1; break; } }
    for (let y = e0; y < e1; y++) for (let x = e0; x < e1; x++){ const k = y*n + x; if (ringM[k] || inEye(k) || id[k] < 0) continue;
      if (ringM[k-1] || ringM[k+1] || ringM[k-n] || ringM[k+n]) put(k, '#ff6a14'); }
    for (let y = e0; y < e1; y++) for (let x = e0; x < e1; x++) if (ringM[y*n + x]) put(y*n + x, '#050304');
    // the outline: the silhouette's own edge pixel in ink (the hot parts keep theirs), and the heat only OUTSIDE it, two art
    // pixels of melt glow, brighter where the body is hot nearby
    const b1 = buf('b1', Float32Array, n), r = 3, D2 = 49, heat = buf('heat', Float32Array, n);
    for (let y = 0; y < n; y++){ let a = 0; for (let x = -r; x < n; x++){ if (x + r < n) a += hm[y*n + x + r]; if (x - r - 1 >= 0) a -= hm[y*n + x - r - 1]; if (x >= 0) b1[y*n + x] = a; } }
    for (let x = 0; x < n; x++){ let a = 0; for (let y = -r; y < n; y++){ if (y + r < n) a += b1[(y + r)*n + x]; if (y - r - 1 >= 0) a -= b1[(y - r - 1)*n + x]; if (y >= 0) heat[y*n + x] = a/D2; } }
    const band = buf('band', Uint8Array, n).fill(0), full = k => d[k*4 + 3] === 255, IK = rgbOf(INKC);
    for (let y = 1; y < n-1; y++) for (let x = 1; x < n-1; x++){ const k = y*n + x; if (!full(k)) continue;
      if (!full(k-1) || !full(k+1) || !full(k-n) || !full(k+n)){ band[k] = 1; if (hm[k] < 1){ d[k*4] = IK[0]; d[k*4+1] = IK[1]; d[k*4+2] = IK[2]; } } }
    for (const [b0, b2] of [[1, 2], [2, 3]]) for (let y = 1; y < n-1; y++) for (let x = 1; x < n-1; x++){ const k = y*n + x; if (full(k) || band[k]) continue;
      if (band[k-1] === b0 || band[k+1] === b0 || band[k-n] === b0 || band[k+n] === b0) band[k] = b2; }
    const ofl = Lk.oflash, spent = Lk.dim > .5;
    const C2 = rgbOf(ofl > .3 ? '#ffd858' : spent ? '#7a1004' : '#d8340c'), C2h = rgbOf(ofl > .3 ? '#fff4c4' : spent ? '#d8340c' : '#ff6a14'), C3 = rgbOf(ofl > .3 ? '#ff6a14' : '#7a1004');
    for (let k = 0; k < n*n; k++){ const b = band[k]; if (b < 2) continue; const H = b === 3 ? C3 : heat[k] > .1 ? C2h : C2;
      d[k*4] = H[0]; d[k*4+1] = H[1]; d[k*4+2] = H[2]; d[k*4+3] = b === 2 ? (ofl > .3 ? 220 : 170) : (ofl > .3 ? 110 : 70); }
    spr.getContext('2d').putImageData(img, 0, 0);
    return spr;
  }
  // the Magma floor: big basalt plates with a one-pixel joint (src/pixel/world.js), a lava seam in one corner,
  // hot ground near it showing red fissures; baked once per buffer size
  function floor(n){
    if (floorCache[n]) return floorCache[n];
    const cv = mk(n, n), g = cv.getContext('2d'), im = g.createImageData(n, n), d = im.data;
    const cell = Math.max(8, Math.round(n/4)), G = Math.ceil(n/cell), S = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) S.push([(i + .15 + .7*hh(i,j))*cell, (j + .15 + .7*hh(j+9,i))*cell, S.length]);
    const tones = ['#2b2328', '#332a2e', '#2f262d'], joint = '#18121a';
    const lava = ['#7a1004', '#d8340c', '#ff6a14', '#ffa22a', '#ffd858'];
    const lx = n*.92, ly = n*.86, lr = n*.3;              // the lava seam's centre and reach
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++){
      let d1 = 1e9, d2 = 1e9, k1 = 0;
      for (const [sx, sy, k] of S) for (let oy = -n; oy <= n; oy += n) for (let ox = -n; ox <= n; ox += n){
        const dd = Math.hypot(x + .5 - sx - ox, y + .5 - sy - oy); if (dd < d1){ d2 = d1; d1 = dd; k1 = k; } else if (dd < d2) d2 = dd; }
      const b = BAY[(y&1)*2 + (x&1)], ld = Math.hypot(x - lx, (y - ly)*1.6) / lr + Math.sin(Math.atan2(y - ly, x - lx)*5)*.05;
      let h;
      if (ld < .55){ const u = 1 - ld/.55; h = lava[Math.min(4, Math.floor(u*4.2 + b*.8))]; }
      else if (ld < .6) h = '#26181a'; else if (ld < .64) h = '#1a1012';                   // the crust lip
      else {
        const jt = d2 - d1 < 1.1; h = jt ? joint : tones[Math.floor(hh(k1, 3)*3)];
        const warm = 1.4 - ld;                           // hot ground round the seam: fissures + warm plates
        if (warm > 0 && jt) h = warm > .7 ? '#a8320e' : warm > .35 ? '#6a1c0c' : '#3a1414';
        if (warm > 0 && !jt){
          if (warm > .45 + b*.12) h = mix(h, '#6a2a1c', warm > .6 ? .4 : .22);
        }
      }
      const [r,gg,bb] = rgbOf(h), o = (y*n + x)*4; d[o] = r; d[o+1] = gg; d[o+2] = bb; d[o+3] = 255;
    }
    g.putImageData(im, 0, 0);
    return floorCache[n] = cv;
  }
  // the sprite on the floor with its heat pool; returns where its centre landed in buffer pixels and the buffer scale
  function shade(R, ph){ const key = Math.round(R) + ':' + Math.round(ph*20); if (SH.has(key)) return SH.get(key);   // baked once per size and phase
    const P0 = RIG.pose(0, ph), s = raster(R, 0, ph, P0, look(P0)), c2 = mk(N, N), g2 = c2.getContext('2d');
    g2.drawImage(s, 0, 0); g2.globalCompositeOperation = 'source-in'; g2.fillStyle = '#080305'; g2.fillRect(0, 0, N, N); SH.set(key, c2); return c2; }
  // THE BODY IS A SHEET OF BAKED FRAMES, like the game's cast (src/pixel/cast.js), never a per-frame raster: one run of FN
  // poses (the idle loop, or one attack at one aim) is cut once at the CRT's art pixel (PIXEL_ART_PX device px, set by the
  // stage; 1 outside the game tech) and stepped at 10 fps. Each sheet also carries the smear's two tinted silhouettes.
  // ponytail: an attack's aim is held to 16 directions and half-radius reach steps, and its pose clock to t = 0; finer = more sheets
  const SHEETS = new Map(), FN = 41, GHOST = ['#7a1004', '#d8340c'], AP = () => globalThis.PIXEL_ART_PX || 1;
  function sheet(key, Rr, ph, poseAt, all){ let S = SHEETS.get(key); if (!S) SHEETS.set(key, S = { Rr, ph, poseAt, F: [] });
    if (all) for (let i = 0; i < FN; i++) frame(S, i, GHOST);   // all: the warm-up (px2d's grace), the whole run at once
    return S; }
  let BK = 0;   // frames baked so far
  function frame(S, i, cols = []){ let F = S.F[i];   // frame i, rastered when first shown (a whole sheet at once was a 100-330 ms phone frame mid-attack); cols: its smear tints too
    if (!F){ const q = S.poseAt(i), s = raster(S.Rr, q.t, S.ph, q.P, look(q.P), false, q.o), cv = mk(N, N); cv.getContext('2d').drawImage(s, 0, 0); F = S.F[i] = { full: cv, P: q.P, o: q.o }; BK++; }
    for (const col of cols) if (!F[col]){ const w = F.full.width, gc = (F[col] = mk(w, w)).getContext('2d'); gc.drawImage(F.full, 0, 0); gc.globalCompositeOperation = 'source-in'; gc.fillStyle = col; gc.fillRect(0, 0, w, w); BK++; }
    return F; }
  const loopI = (t) => { const f = Math.floor(t*10) % (2*(FN - 1)); return f < FN ? f : 2*(FN - 1) - f; };   // the idle loop runs forward then back: no seam
  function place(c, x, y, R, t, ph, S, i, ghosts = []){   // S, i: the sheet and this instant's frame; ghosts: [[frame, alpha, colour]], the smear where the body just was
    const b0 = BK, fr = (j, cols) => { const F = frame(S, j, cols); if (BK !== b0 && typeof c.grace === 'number') c.grace = Math.max(c.grace, 1); return F; };   // a frame's first showing is its bake, not per-frame work (px2d)
    const { P, o, full } = fr(i), k = AP(), M = full.width;
    const T = c.getTransform(), Lk = look(P), Rb = R*T.a, Mk = M*k, sn = (v) => Math.round(v/k)*k;   // on the CRT's art grid
    c.save(); c.setTransform(1,0,0,1,0,0); c.imageSmoothingEnabled = false;
    { const sh = shade(Rb/k, ph), F = P.body.ground || P.body.floor, py = P.body.pivot[1]*Rb, hs = P.halo.scale, n2 = sh.width*k/2;   // its rest shape's shadow, on the floor: it stays when the body lifts, folds or flies
      c.save(); c.translate(Math.round(T.a*x + T.e), Math.round(T.d*y + T.f)); c.transform(F[0], F[1], F[2], F[3], F[4]*Rb, F[5]*Rb);
      c.translate(0, py); c.scale(hs, hs); c.translate(0, -py); c.globalAlpha = .4; c.drawImage(sh, -n2 + .03*Rb, -n2 + .06*Rb, 2*n2, 2*n2); c.restore(); }
    const cell = (j, col) => { const F = fr(j, [col]), n = F[col].width, nk = n*k, og = F.o, gx = sn(T.a*x + T.e - nk/2 + og[0]*Rb), gy = sn(T.d*y + T.f - nk/2 + og[1]*Rb);   // each frame its own size (the strike reaches further), centred as it was in the sheet's cell
      c.drawImage(F[col], 0, 0, n, n, gx, gy, nk, nk); return [gx, gy]; };
    for (const [j, al, col] of ghosts){ c.globalAlpha = al; cell(j, col); c.globalAlpha = 1; }
    const ox = sn(T.a*x + T.e - Mk/2 + o[0]*Rb), oy = sn(T.d*y + T.f - Mk/2 + o[1]*Rb);
    const cx = ox + Mk/2, cy = oy + Mk/2, gr = Rb*1.7, g = c.createRadialGradient(cx, cy, 0, cx, cy, gr);   // its heat lights the floor
    g.addColorStop(0, 'rgba(255,80,20,.3)'); g.addColorStop(.5, 'rgba(210,45,12,.16)'); g.addColorStop(1, 'rgba(120,20,4,0)');
    c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(cx - gr, cy - gr, gr*2, gr*2);
    c.globalCompositeOperation = 'source-over';
    world(c, cx, cy, Rb, t, ph);
    cell(i, 'full');
    eyeLight(c, cx + (P.eye.x - o[0])*Rb, cy + (P.eye.y - o[1])*Rb, Rb, t, ph, P, Lk);
    c.restore();
    return { cx, cy, k: T.a, T };
  }
  // what its presence does to the world, one layer per phase: the floor splits in lava fissures radiating from it (the maker
  // re-writing the ground), from phase 2 slow shafts of light wheel behind it, in phase 3 the rose of the empyrean opens on
  // the floor: concentric dashed rings turning against each other
  function world(c, cx, cy, Rb, t, ph){
    const e12 = ss(1, 2, ph), e23 = ss(2, 3, ph);
    if (e12 > 0){
      c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,110,30,' + (.05*e12).toFixed(3) + ')';
      for (let i = 0; i < 8; i++){ const a = i/8*TAU + t*.04, L = Rb*(2.6 + .4*Math.sin(t*.5 + i*2.1)), hw = .07 + .02*Math.sin(t*.7 + i);
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a - hw)*L, cy + Math.sin(a - hw)*L); c.lineTo(cx + Math.cos(a + hw)*L, cy + Math.sin(a + hw)*L); c.fill(); }
      c.globalCompositeOperation = 'source-over';
    }
    const F1 = [], F2 = [];
    for (let i = 0; i < 9; i++){
      const a = (i + .5*hh(i, 7))/9*TAU, r1 = Rb*(1.4 + .7*hh(i, 8))*(.6 + .4*e12), m = Rb*1.05, kx = Rb*.12*(hh(i, 9) - .5);
      const mx = cx + Math.cos(a)*(m + r1)/2 - Math.sin(a)*kx, my = cy + Math.sin(a)*(m + r1)/2 + Math.cos(a)*kx;
      F2.push(...seg(cx + Math.cos(a)*m, cy + Math.sin(a)*m, mx, my)); F1.push(...seg(mx, my, cx + Math.cos(a)*r1, cy + Math.sin(a)*r1));
    }
    c.globalAlpha = .2 + .03*Math.sin(t*.8); dots(c, '#d8340c', F1, 1, 2); dots(c, '#ffa22a', F2, 1, 2); c.globalAlpha = 1;   // faint but bright: the floor marks stay under the boss's silhouette in weight
    if (e23 > 0){
      c.globalAlpha = .2*e23;
      [[1.75, 6, .1, '#ff6a14'], [2.35, 9, -.06, '#d8340c']].forEach(([rr, k, w, col]) => {
        dots(c, col, arc(cx, cy, Rb*rr, 0, TAU, .92).filter(([x, y]) => Math.sin(k*Math.atan2((y - cy)/.92, x - cx) + t*w*k) > .1), 1, 2);
      });
      c.globalAlpha = 1;
    }
  }
  // recovery: the spent heat, embers drifting out and settling, cooling from amber to cinder
  function dying(c, cx, cy, Rb, t, v){
    const E = [];
    for (let i = 0; i < 16; i++){ const a = (i + hh(i, 13))/16*TAU, r = Rb*(1.05 + .5*hh(i, 14) + .5*v); E.push([cx + Math.cos(a)*r + Math.sin(t*1.7 + i)*1.5, cy + Math.sin(a)*r*.85 + Rb*.45*v*v]); }
    c.globalAlpha = Math.min(1, v*5)*(1 - v*.6);
    dots(c, v < .45 ? '#ffa22a' : v < .8 ? '#d8340c' : '#7a1004', E);
    for (let i = 0; i < 6; i++){                         // embers rising off the spent body, well clear of it, each fading in and out of its climb
      const l = (t*.35 + i/6) % 1, f = Math.min(1, Math.sin(Math.PI*l)*1.8), ex = cx + (i - 2.5)*Rb*.32 + Math.sin(t*1.9 + i*2)*Rb*.1, ey = cy - Rb*(.3 + 1.9*l), al = Math.min(1, v*5)*f;
      c.globalCompositeOperation = 'lighter'; const gw = Math.min(6, .25*Rb), ew = Math.min(3, Math.max(1, Math.round(.12*Rb))), g = c.createRadialGradient(ex, ey, 0, ex, ey, gw); g.addColorStop(0, 'rgba(255,170,60,' + (.7*al).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,80,20,0)');
      c.fillStyle = g; c.fillRect(ex - gw, ey - gw, 2*gw, 2*gw); c.globalCompositeOperation = 'source-over';
      c.globalAlpha = al; dots(c, '#ff6a14', [[ex, ey]], ew); dots(c, l < .6 ? '#fff4c4' : '#ffd858', [[ex, ey]], Math.max(1, ew - 1));
    }
    c.globalAlpha = 1;
  }
  // the great eye's own light: a white-hot bloom inside it and short pixel spokes round its ring, long on a flare; spent, it
  // is cracked. The 2->3 opening (the rig's burst beat) fires one event: a thick ring of light and long spokes.
  function eyeLight(c, ex, ey, Rb, t, ph, P, Lk){
    const op = P.beats.open, dim = Lk.dim, fl = Lk.flare, k = op*(1 - dim)*Math.min(1, P.eye.open);
    if (k > .05 && fl > .1){
      const S1 = [], S2 = [];
      for (let i = 0; i < 8; i++){ const a = (i + .5)/8*TAU, ca = Math.cos(a), sa = Math.sin(a), r0x = Rb*.36, r0y = Rb*.22, L = Rb*(.1 + .04*Math.sin(t*1.3 + i*2) + .35*fl)*(i % 2 ? .6 : 1);
        const x0 = ex + ca*r0x, y0 = ey + sa*r0y, x1 = x0 + ca*L, y1 = y0 + sa*L, xm = (x0 + x1)/2, ym = (y0 + y1)/2;
        S1.push(...seg(x0, y0, xm, ym)); S2.push(...seg(xm, ym, x1, y1)); }
      c.globalAlpha = k; dots(c, '#fff4c4', S1); dots(c, '#ffd858', S2); c.globalAlpha = 1;
    }
    if (P.eye.gape > .5 && op > .5){ const C = [[-.32, -.06], [-.14, .05], [-.02, -.06], [.12, .06], [.32, -.03]].map(([x, y]) => [ex + x*Rb, ey + y*Rb]);
      const Pp = []; for (let i = 0; i + 1 < C.length; i++) Pp.push(...seg(C[i][0], C[i][1], C[i + 1][0], C[i + 1][1])); dots(c, '#050304', Pp, 2); }   // cracked
    const bst = P.beats.burst, q = cl((ph - 2.25)/.75);
    if (bst > .01){
      const rr = Rb*(.35 + 2.6*q), al = bst;
      c.globalCompositeOperation = 'lighter';
      const gw = c.createRadialGradient(ex, ey, Math.max(0, rr - Rb*.35), ex, ey, rr + Rb*.2);
      gw.addColorStop(0, 'rgba(255,90,20,0)'); gw.addColorStop(.6, 'rgba(255,140,40,' + (.55*al).toFixed(3) + ')'); gw.addColorStop(1, 'rgba(255,90,20,0)');
      c.fillStyle = gw; c.fillRect(ex - rr - Rb*.3, ey - rr - Rb*.3, 2*rr + Rb*.6, 2*rr + Rb*.6); c.globalCompositeOperation = 'source-over';
      c.globalAlpha = al; dots(c, '#7a1004', arc(ex, ey, rr - 5, 0, TAU, .9), 3); dots(c, '#ff6a14', arc(ex, ey, rr + 5, 0, TAU, .9), 6); dots(c, '#ffd858', arc(ex, ey, rr + 1, 0, TAU, .9), 6); dots(c, '#fff4c4', arc(ex, ey, rr - 1, 0, TAU, .9), 5);
      const Bs = []; for (let i = 0; i < 12; i++){ const a = i/12*TAU + Math.PI/12, r0 = Rb*(.4 + .8*q), r1 = Rb*(.7 + 2.4*q); Bs.push(...seg(ex + Math.cos(a)*r0, ey + Math.sin(a)*r0*.9, ex + Math.cos(a)*r1, ey + Math.sin(a)*r1*.9)); }
      dots(c, '#ff6a14', Bs, 2); dots(c, '#ffd858', Bs); c.globalAlpha = 1;
    }
  }
  // a scorch ring on the floor, seen at the floor's slant: a charred ellipse, a seam of melt round it and cracks splitting
  // out of it, white-hot while fresh (heat 1), cooling to dark red
  function scorch(c, x, y, r, heat, t){
    c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(x, y, 0, x, y, r*1.4);
    g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(.6, 'rgba(255,100,30,' + (.35*heat).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,60,10,0)');
    c.save(); c.translate(x, y); c.scale(1, .32); c.translate(-x, -y); c.fillStyle = g; c.fillRect(x - r*1.4, y - r*1.4, r*2.8, r*2.8); c.restore();
    c.globalCompositeOperation = 'source-over';
    dots(c, '#120a0c', arc(x, y, r, 0, TAU, .32), 3);
    dots(c, heat > .6 ? '#ffa22a' : heat > .25 ? '#ff6a14' : '#a8320e', arc(x, y, r, 0, TAU, .32).filter(([px]) => Math.sin((px - x)*.9 + t*2) > -.4));
    const C1 = [], C2 = [];
    for (let i = 0; i < 9; i++){ const an = (i + .6*hh(i, 21))/9*TAU, ca = Math.cos(an), sa = Math.sin(an)*.32, j = (hh(i, 22) - .5)*r*.25;
      const p0 = [x + ca*r, y + sa*r], p1 = [x + ca*r*1.22 - sa*j, y + sa*r*1.22 + ca*j*.32], p2 = [x + ca*r*(1.35 + .3*hh(i, 23)), y + sa*r*(1.35 + .3*hh(i, 23))];
      C1.push(...seg(p0[0], p0[1], p1[0], p1[1])); C2.push(...seg(p1[0], p1[1], p2[0], p2[1])); }
    dots(c, heat > .5 ? '#ffd858' : heat > .2 ? '#ff6a14' : '#d8340c', C1); dots(c, heat > .5 ? '#ff6a14' : '#7a1004', C2);
  }
  // a lava pool on the floor seen at its slant: rows of lava, white-hot at the heart, a cooled crust lip
  // the heat ray's floor marks, drawn before the boss: the lanes it will walk (aim), each lane burnt from its start to
  // where the ray now stands, cooling behind it, and the molten splash glowing where it touches
  function laserFloor(c, A, t, Rb, U){
    const K = A.track;
    if (A.aim > .01) for (const off of K.lanes){   // the guide: four lanes of embers smouldering out along the track, marching away from the boss
      const L = seg(...U({ x: K.start.x + K.nx*off, y: K.start.y + K.ny*off }), ...U({ x: K.end.x + K.nx*off, y: K.end.y + K.ny*off })), ph = Math.floor(t*18);
      c.globalAlpha = .55*A.aim; dots(c, '#40091a', L.filter((_, i) => i % 3 === 0), 1, 2);
      c.globalAlpha = A.aim; dots(c, '#d8340c', L.filter((_, i) => ((i - ph) % 14 + 14) % 14 < 2), 1, 2); c.globalAlpha = 1; }
    if (A.sweep > 0 && A.scorch > .01) for (const bm of A.beams){   // the burnt lane: crust, then a seam that is white at the ray and cools to dark red behind it
      const [sx, sy] = U(bm.start), [hx, hy] = U(bm.end), L = seg(sx, sy, hx, hy), n = L.length, B = [[], [], [], []];
      L.forEach((p, i) => { const d = (n - 1 - i)/Rb + 2.5*(1 - A.fire); B[d < .25 ? 0 : d < .7 ? 1 : d < 1.6 ? 2 : 3].push(p); });
      c.globalAlpha = A.scorch; dots(c, '#0a0608', L, 3, 2); dots(c, '#40091a', B[3], 1, 2); dots(c, '#8a2436', B[2], 1, 2); dots(c, '#d8340c', B[1], 1, 2); dots(c, '#ffa22a', B[0], 1, 2); c.globalAlpha = 1; }
    if (A.fire > .01){ const fl = .8 + .2*Math.sin(t*37) + .1*Math.sin(t*23.3);   // where it touches: a flickering glow on the floor and a splash of melt
      c.globalCompositeOperation = 'lighter';
      for (const bm of A.beams){ const [hx, hy] = U(bm.end), r = .7*Rb*fl, g = c.createRadialGradient(hx, hy, 0, hx, hy, r);
        g.addColorStop(0, 'rgba(255,170,60,' + (.55*A.fire).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,60,10,0)');
        c.save(); c.translate(hx, hy); c.scale(1, .4); c.translate(-hx, -hy); c.fillStyle = g; c.fillRect(hx - r, hy - r, 2*r, 2*r); c.restore(); }
      c.globalCompositeOperation = 'source-over';
      for (const bm of A.beams){ const [hx, hy] = U(bm.end); pool(c, hx, hy, .2*Rb*fl, .09*Rb*fl, A.fire, true); }
      const [Hx, Hy] = U(A.hit), K2 = A.track, Rr = .5*Rb;   // the heat front: a seam of fire across the band, just ahead of the rays
      c.globalAlpha = A.fire*fl; dots(c, '#ff6a14', arc(Hx, Hy, Rr, 0, TAU, .4).filter(([X, Y]) => (X - Hx)*K2.dx + (Y - Hy)*K2.dy > .2*Rr), 1, 2); c.globalAlpha = 1; }
    if (A.pool > .01) for (const bm of A.beams){ const [X, Y] = U(bm.end); pool(c, X, Y, .3*Rb*Math.sqrt(A.pool), .3*Rb*Math.sqrt(A.pool)*.4, 1, true); }   // where each ray stopped, a pool of lava
  }
  // the pixels inside a polygon (device px), and of those the ones on its rim
  function poly(pts){ let y0 = 1e9, y1 = -1e9; for (const [, y] of pts){ y0 = Math.min(y0, y); y1 = Math.max(y1, y); } const o = [];
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++){ const py = y + .5, xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){ const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py)) xs.push((xj - xi)*(py - yi)/(yj - yi) + xi); }
      xs.sort((a, b) => a - b); for (let q = 0; q + 1 < xs.length; q += 2) for (let x = Math.ceil(xs[q] - .5); x < Math.ceil(xs[q + 1] - .5); x++) o.push([x, y]); }
    return o; }
  function rim(P){ const S = new Set(P.map(([x, y]) => x*65536 + y)); return P.filter(([x, y]) => !S.has((x + 1)*65536 + y) || !S.has((x - 1)*65536 + y) || !S.has(x*65536 + y + 1) || !S.has(x*65536 + y - 1)); }
  // one blade feather in device px, the look's own: inked rim, a lit and a shadow half, a hot spine, a white-hot tip bead
  function pfeather(c, x, y, a, L, w, cv, heat = 0, ink = '#0a0608'){
    if (L < 2) return; const F = RIG.feather(x, y, a, L, Math.max(1.2, w), cv), P = poly(F.l.concat(F.r.slice().reverse())), ca = Math.cos(a), sa = Math.sin(a);
    const lit = [], drk = []; for (const p of P) ((p[0] + .5 - x)*sa - (p[1] + .5 - y)*ca < 0 ? lit : drk).push(p);
    dots(c, '#8a2436', drk); dots(c, heat > .5 ? '#ff6a14' : '#d8340c', lit);
    dots(c, heat > .5 ? '#ffd858' : '#ffa22a', F.sp.slice(1, 9).flatMap(([x0, y0], k) => seg(x0, y0, F.sp[k + 2][0], F.sp[k + 2][1])));
    dots(c, ink, rim(P)); dots(c, heat > .3 ? '#fff4c4' : '#ffd858', [F.sp[9]], 2);
  }
  // THE WHEEL on the floor: the groove its rim has cut (cooling crust along the legs it has run), the white-hot scour right
  // behind it, the lava lighting up under the disc, a splash ring at each ricochet and the ash it throws up when it lands home
  function wheelFloor(c, A, u, t, Rb, U){
    const fd = 1 - sm(.9, 1, u);
    if (u > .22 && fd > .01){ const W = [A.legs[0]]; for (let k = 1; k <= A.leg; k++) W.push(A.legs[k]); W.push(A.pos);   // the groove, cooled
      const G = []; for (let k = 0; k + 1 < W.length; k++) G.push(...seg(...U(W[k]), ...U(W[k + 1])));
      c.globalAlpha = .8*fd; dots(c, '#0a0608', G, 3, 2); dots(c, '#40091a', G, 1, 2); dots(c, '#8a2436', G.filter((_, i) => Math.sin(i*.37 + t*1.5) > .3), 1, 2); c.globalAlpha = 1; }
    if (A.roll > .01){ const B = [[], [], [], []];   // the scour: newest white-hot, older red
      for (let k = 0; k + 1 < A.trail.length; k++){ const L = seg(...U(A.trail[k]), ...U(A.trail[k + 1])); B[k > 8 ? 0 : k > 6 ? 1 : k > 3 ? 2 : 3].push(...L); }
      c.globalAlpha = A.roll; dots(c, '#0a0608', B.flat(), 4, 2); dots(c, '#8a2436', B[3], 2, 2); dots(c, '#d8340c', B[2], 2, 2); dots(c, '#ffa22a', B[1], 2, 2); dots(c, '#fff4c4', B[0], 1, 2); dots(c, '#ffd858', B[0].filter((_, i) => i % 2), 2, 2);
      const [X, Y] = U(A.pos), r = .95*Rb, g = c.createRadialGradient(X, Y, 0, X, Y, r);   // the lava under the disc lights up as it grinds past
      g.addColorStop(0, 'rgba(255,120,30,' + (.4*A.rate).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,60,10,0)');
      c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(X - r, Y - r, 2*r, 2*r); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; }
    for (const h of A.hits) if (h.al > .01){ const [X, Y] = U(h), q = 1 - h.al, r = (.35 + 1.1*q)*Rb;   // the ricochet: the floor cracks open in a splash ring
      pool(c, X, Y, .5*Rb*h.al, .2*Rb*h.al, h.al, true);
      c.globalAlpha = h.al; dots(c, '#ff6a14', arc(X, Y, r, 0, TAU, .4), 2, 2); dots(c, '#ffd858', arc(X, Y, r - 2, 0, TAU, .4).filter((_, i) => i % 3), 1, 2);
      for (let i = 0; i < 7; i++){ const a = (i + hh(i, 101))/7*TAU; dots(c, '#d8340c', seg(X + Math.cos(a)*r*.5, Y + Math.sin(a)*r*.2, X + Math.cos(a)*r*1.05, Y + Math.sin(a)*r*.42), 1, 2); }
      c.globalAlpha = 1; }
    const q = cl((u - .82)/.12);   // home: it slams down flat and throws up a ring of ash and embers
    if (q > 0 && q < 1){ const [X, Y] = U(A.pos), r = (.7 + 1.1*q)*Rb;
      c.globalAlpha = 1 - q; dots(c, '#40262a', arc(X, Y, r, 0, TAU, .45).filter((_, i) => Math.sin(i*1.3) > -.2), 3, 2); dots(c, '#ff6a14', arc(X, Y, r*.85, 0, TAU, .45).filter((_, i) => i % 5 === 0), 1, 2); c.globalAlpha = 1; }
  }
  // THE WHEEL over the boss: speed arcs round the rim turning with the spin, and sparks flung off the rim behind it
  function wheelTop(c, A, u, t, Rb, U){
    const [X, Y] = U(A.pos), v = A.rate*A.roll;
    if (v > .02){ for (let k = 0; k < 6; k++){ const a = A.spin + k*TAU/6, r = (.82 + .08*(k % 2))*Rb;   // the blur: arcs trailing each turn
        c.globalAlpha = v*(k % 2 ? .6 : 1); dots(c, k % 2 ? '#d8340c' : '#ffa22a', arc(X, Y, r, a - .7*v, a)); dots(c, '#fff4c4', arc(X, Y, r, a - .12, a)); }
      for (let k = 0; k < 14; k++){ const l = (t*3.1 + hh(k, 111)) % 1, a = A.dir + Math.PI + (hh(k, 112) - .5)*1.4, d = (.75 + 1.1*l)*Rb;   // sparks thrown back off the rim where it bites the floor
        c.globalAlpha = v*Math.sin(Math.PI*l); dots(c, k % 3 ? '#ffa22a' : '#fff4c4', [[X + Math.cos(a)*d, Y + Math.sin(a)*d*.6 + .25*Rb + l*l*.3*Rb]], k % 4 ? 1 : 2); }
      c.globalAlpha = 1; }
    if (A.dizzy > .01){ c.globalAlpha = A.dizzy;   // dizzy: embers orbiting over its head
      for (let k = 0; k < 5; k++){ const a = t*3 + k*TAU/5, x = X + Math.cos(a)*.38*Rb, y = Y + (-1.12 + Math.sin(a)*.12)*Rb; dots(c, '#ff6a14', [[x, y]], 3); dots(c, '#ffd858', [[x, y]], 1); }
      c.globalAlpha = 1; }
  }
  // FEATHER RECALL on the floor: each flying feather's shadow (offset by its height), the molten crater it stakes into with its
  // splash of dust, and the hole it tears out of the floor when it rips free, cooling
  function recallFloor(c, A, u, t, Rb, U){
    for (const [i, f] of A.feathers.entries()){ const [px, py] = U(f.plant);
      if (f.state >= 2){ const cool = f.state === 2 ? 0 : sm(.72, .95, u);   // the crater: hot while it holds a feather, cooling once torn out
        const hot = f.state === 2 ? .55 + .45*f.quiver : (1 - cool)*(.4 + .6*f.tear);
        c.globalAlpha = 1 - sm(.9, 1, u); dots(c, '#0a0608', arc(px, py, .17*Rb, 0, TAU, .45), 2, 2);
        dots(c, hot > .6 ? '#ffd858' : hot > .3 ? '#ff6a14' : '#8a2436', arc(px, py, .11*Rb, 0, TAU, .45), 1, 2); if (hot > .5) dots(c, '#fff4c4', [[px, py]], 1, 2); c.globalAlpha = 1; }
      if (f.dust > .01){ const q = 1 - f.dust, r = (.12 + .4*q)*Rb;   // the stake's splash: ash and melt thrown out
        c.globalAlpha = f.dust; dots(c, '#40262a', arc(px, py, r, 0, TAU, .45).filter((_, j) => Math.sin(j*1.7 + i) > 0), 2, 2); dots(c, '#ff6a14', arc(px, py, r*.7, 0, TAU, .45).filter((_, j) => j % 4 === 0), 1, 2); c.globalAlpha = 1; }
      if (f.vis && f.state !== 2){ const [x, y] = U(f), L = f.len*Rb;   // in flight: its shadow on the floor, under where it flies
        c.globalAlpha = .45; dots(c, '#080305', seg(x, y, x + Math.cos(f.a)*L*.9, y + Math.sin(f.a)*L*.9*.6), 3, 2); c.globalAlpha = 1; } }
  }
  // FEATHER RECALL in the air: the feathers themselves. Staked, one stands in its crater, tip down, quivering; ripped free it
  // sprays melt; flying home it drags a short hot streak
  function recallTop(c, A, u, t, Rb, U){
    for (const [i, f] of A.feathers.entries()){ if (!f.vis) continue; const L = f.len*Rb*1.6, w = Math.max(2, f.w*Rb*1.8);   // drawn a size up: at this grid a true-size blade is a few pixels
      if (f.state === 2){ const [px, py] = U(f.plant), qv = Math.sin(t*38 + i*2)*f.quiver*.05*Rb, a = f.a + Math.PI;   // staked: the tip in the floor, the shaft leaning back the way it came
        const qx = px + Math.cos(a)*L*.35 + qv, qy = py + Math.sin(a)*L*.18 - .72*L;   // its nock, up in the air
        pfeather(c, qx, qy, Math.atan2(py - qy, px - qx), Math.hypot(px - qx, py - qy), w, .04, .3*f.quiver);
        continue; }
      const [x, y] = U(f), zy = f.z*Rb, bx = x - Math.cos(f.a)*L*.5, by = y - Math.sin(f.a)*L*.5 - zy;
      if (f.state === 3){ c.globalAlpha = .8*(1 - f.k*.5); dots(c, '#ff6a14', seg(bx, by, bx - Math.cos(f.a)*L*.7, by - Math.sin(f.a)*L*.7), 1); dots(c, '#d8340c', seg(bx - Math.cos(f.a)*L*.7, by - Math.sin(f.a)*L*.7, bx - Math.cos(f.a)*L*1.2, by - Math.sin(f.a)*L*1.2).filter((_, j) => j % 2), 1); c.globalAlpha = 1; }
      pfeather(c, bx, by, f.a, L, w, .06, f.state === 3 ? .8 : .2);
      if (f.tear > .01){ const [px, py] = U(f.plant), q = 1 - f.tear;   // torn out: melt sprays from the crater
        for (let k = 0; k < 8; k++){ const a = (k + hh(k, 121 + i))/8*TAU, d = q*.45*Rb; c.globalAlpha = f.tear; dots(c, k % 2 ? '#ffa22a' : '#fff4c4', [[px + Math.cos(a)*d, py + Math.sin(a)*d*.5 - Math.sin(Math.PI*q)*.25*Rb]], 2); }
        c.globalAlpha = 1; } }
  }
  // SWORD SLAM on the floor: the blade's shadow, the crack the slam splits along the line, the lava it drives up leaving a
  // cooled crust lane behind, and the shock ring at the point
  function swordFloor(c, A, u, t, Rb, U){
    const Bd = A.blade, F = A.fire;
    if (Bd.form > .02){ const [bx, by] = U(Bd.base), [gx, gy] = U(Bd.ground), hd = Math.atan2(gy - by, gx - bx), w = Bd.w*Rb*.8, nx = -Math.sin(hd), ny = Math.cos(hd);   // its shadow, on the floor below the point
      c.globalAlpha = .45*Bd.form; dots(c, '#080305', poly([[bx + nx*w, by + ny*w], [gx, gy], [bx - nx*w, by - ny*w]]), 1); c.globalAlpha = 1; }
    if (F.scorch > .01){ const [sx, sy] = U(F.start), [fx, fy] = U({ x: F.start.x + F.dx*F.front, y: F.start.y + F.dy*F.front }), L = seg(sx, sy, fx, fy), hw = F.w*Rb*.7;
      const side = (s) => L.map(([x, y], j) => [x + F.nx*hw*s*(.6 + .4*Math.sin(j*.21 + s)), y + F.ny*hw*s*(.6 + .4*Math.sin(j*.21 + s))*.6]);
      c.globalAlpha = F.scorch; dots(c, '#0a0608', L, 5, 2); dots(c, '#40091a', side(1).concat(side(-1)), 1, 2);   // the crust lane, its broken lips
      const n = L.length; dots(c, '#8a2436', L.filter((_, j) => j < n - 18), 1, 2); dots(c, '#d8340c', L.filter((_, j) => j >= n - 18 && j < n - 7), 2, 2); dots(c, '#ffd858', L.filter((_, j) => j >= n - 7), 2, 2);   // the seam: cooled behind, hot at the running front
      c.globalAlpha = 1; }
    if (F.on > .01){ const [fx, fy] = U({ x: F.start.x + F.dx*F.front, y: F.start.y + F.dy*F.front }), [ex, ey] = U(F.end);   // ahead of the front, the crack opening
      c.globalAlpha = .6*F.on; dots(c, '#7a1004', seg(fx, fy, ex, ey).filter((_, j) => Math.sin(j*.5 - t*9) > .2), 1, 2); c.globalAlpha = 1; }
    if (A.impact){ const I = A.impact, [X, Y] = U(I), r = I.r*Rb;   // the shock ring where the point hits
      pool(c, X, Y, .4*Rb*I.al, .16*Rb*I.al, I.al, true);
      c.globalAlpha = I.al; dots(c, '#ff6a14', arc(X, Y, r, 0, TAU, .4), 2, 2); dots(c, '#fff4c4', arc(X, Y, r - 2, 0, TAU, .4).filter((_, i) => i % 2), 1, 2); c.globalAlpha = 1; }
    if (Bd.buried > .01){ const [X, Y] = U(Bd.ground); c.globalAlpha = Bd.buried; pool(c, X, Y, .22*Rb, .09*Rb, Bd.buried*(1 - Bd.dissolve), true); c.globalAlpha = 1; }   // the point's molten wound
    swordTop(c, A, u, t, Rb, U, true);
  }
  // SWORD SLAM in the air: the lava erupting along the line, one fountain after another (the blade is the boss's own feathers, in build)
  // the fountains that rise where the point is buried go under the boss (from swordFloor), so they never hide the blade
  const nearPoint = (Bd, fl) => Bd.buried > .01 && Bd.dissolve < .99 && Math.hypot(fl.x - Bd.ground.x, fl.y - Bd.ground.y) < .45;
  function swordTop(c, A, u, t, Rb, U, under = false){
    const Bd = A.blade, F = A.fire;
    if (F.on > .01) for (const pass of [0, 1]) for (const [i, fl] of F.flames.entries()){ if (fl.al < .01 || nearPoint(Bd, fl) !== under) continue;   // pass 0 inks every column, pass 1 lights them: neighbours overlap, so no ink lands over another's melt
      const [X, Y] = U(fl), H = fl.h*fl.sz*Rb*4.5, W = fl.sz*Rb*.9;
      if (pass) pool(c, X, Y, W*.9*fl.h, W*.4*fl.h, fl.al*F.on, true);   // a lava fountain: a column of melt, white at the vent, a crown of drops
      c.globalAlpha = Math.min(1, fl.al*1.5)*F.on;
      for (let k = -1; k <= 1; k++){ const h = H*(1 - .3*Math.abs(k))*(.8 + .2*Math.sin(t*13 + i + k)), xk = X + k*W*.5;
        if (!pass){ dots(c, '#0a0608', seg(xk, Y, xk + Math.sin(t*6 + i)*W*.1, Y - h - 2), 4); continue; } for (let j = 0; j < 6; j++) dots(c, LV[j], seg(xk, Y - h*j/6, xk + Math.sin(t*6 + i)*W*.1*(j + 1)/6, Y - h*(j + 1)/6), j < 4 ? 2 : 1); }
      if (pass) for (let k = 0; k < 5; k++){ const l = (t*2 + hh(k, 141 + i)) % 1, a = -Math.PI/2 + (hh(k, 151 + i) - .5)*1.6, d = H*(.5 + .7*l);   // drops thrown off the crown, falling back
        dots(c, k % 2 ? '#ffa22a' : '#ffd858', [[X + Math.cos(a)*d*.6, Y - H*.6 + Math.sin(a)*d*.5 + l*l*H*.9]], 2); }
      c.globalAlpha = 1; }
  }
  // the tornado's floor marks, drawn before the boss: the scorch rings it leaves, the end pool, its molten trail
  // and the ring its foot scours
  function tornadoFloor(c, A, b, u, t, cx, cy, Rb, U){
        A.path.forEach((p, k) => { if (k % 4) return; const v = .46 + .42*k/9; if (A.alive > .01 && u > v + .04){   // where the funnel has passed it leaves a cracked scorch ring, cooling
          const [X, Y] = U(p); c.globalAlpha = 1 - sm(.92, 1, u); scorch(c, X, Y, Rb*(.45 + .1*k/9), 1 - .75*sm(.04, .5, u - v), t); c.globalAlpha = 1; } });
        if (A.pool > .01){ const [X, Y] = U(A.pos); pool(c, X, Y, .62*Math.sqrt(A.pool)*Rb, .62*Math.sqrt(A.pool)*Rb*.38, 1); }   // the end of it: the column slumps into a lava pool
        const Lv = A.alive, d = A.collapse, sc = A.scale;
        if (Lv > .01){
          const [bx, by] = U(A.pos);
          if (u > .45){ const S1 = [], S2 = [], S3 = [];      // the molten trail the vortex leaves on the floor, cooling behind it
            for (let k = 0; k < 10; k++){ const [x0, y0] = U(A.trail[k]), [x1, y1] = U(A.trail[k + 1]), P2 = seg(x0, y0, x1, y1); (k < 3 ? S3 : k < 7 ? S2 : S1).push(...P2); }
            const tw = 4, tw2 = 3;
            c.globalAlpha = Lv; dots(c, '#2a0e0e', S3.concat(S2, S1), tw); dots(c, '#7a1004', S3, Math.max(1, tw - 2)); dots(c, '#d8340c', S2, tw2); dots(c, '#ff6a14', S1, tw2); dots(c, '#ffd858', S1); c.globalAlpha = 1; }
          c.globalAlpha = Math.min(1, Lv*1.4);
          scorch(c, bx, by, Rb*.5*sc*(1 + .7*d), 1, t);  // the ring it scours into the floor, glowing
          c.globalAlpha = 1;
        }
  }
  // the boss as a spinning top: under it (front = false) the ring its foot scours and the far half of its spin disc; over it
  // the near half, sparks flung off the rim left and right, the launch shock ring, and the ash puff as the spin dies
  function top(c, b, u, t, tx, ty, Rb, sp, front){
    const DR = 1.5*Rb, ry = .24*DR;
    if (sp > .03){
      if (!front){ c.globalAlpha = sp; const fy = ty + 1.05*Rb, r = .75*Rb;
        dots(c, '#2a0e0e', arc(tx, fy, r, 0, TAU, .2), 2); dots(c, '#d8340c', arc(tx, fy, r, 0, TAU, .2).filter(([X]) => Math.sin((X - tx)*.6 - t*40) > .2), 2); }
      const ST = front ? ['#fff4c4', '#ffd858', '#ffa22a', '#ff6a14', '#d8340c'] : ['#ff6a14', '#d8340c', '#7a1004', '#40091a', '#40091a'];
      c.globalAlpha = .55*sp; dots(c, front ? '#7a1004' : '#40091a', arc(tx, ty, DR, front ? 0 : Math.PI, front ? Math.PI : TAU, .24));   // the rim the wing tips trace
      for (let k = 0; k < 9; k++) for (let m = 0; m < 12; m++){   // speed streaks running round it, a hot head and a cooling tail
        const a = t*26 + k*TAU/9 - m*.07; if ((Math.sin(a) > 0) !== front) continue;
        c.globalAlpha = sp*(1 - m/14); dots(c, ST[Math.min(4, m >> 1)], [[tx + Math.cos(a)*DR, ty + Math.sin(a)*ry]], m < 2 ? 3 : m < 6 ? 2 : 1); }
      if (front) for (let i = 0; i < 14; i++){   // sparks flung off the rim, tangent, falling as they cool
        const l = (t*1.8 + hh(i, 61)) % 1, sd = i % 2 ? 1 : -1, x0 = tx + sd*DR*.95, y0 = ty + (hh(i, 62) - .5)*ry*1.6;
        const X = x0 + sd*l*Rb*1.6, Y = y0 - .3*Rb*l + .9*Rb*l*l;
        c.globalAlpha = sp*(1 - l); dots(c, l < .25 ? '#fff4c4' : l < .5 ? '#ffd858' : l < .75 ? '#ff6a14' : '#7a1004', seg(X - sd*3, Y - 1, X, Y), l < .5 ? 2 : 1); }
    }
    if (front){
      const q = cl((u - .43)/.16);
      if (q > 0 && q < 1){ const r = Rb*(1.4 + 2.6*q); c.globalAlpha = (1 - q)*(1 - q); dots(c, '#ff6a14', arc(tx, ty, r + 1, 0, TAU, .4), 2); dots(c, '#fff4c4', arc(tx, ty, r, 0, TAU, .4)); }   // the launch: one ring of hot air
      const pq = cl((u - .84)/.14);
      if (pq > 0 && pq < 1) for (let i = 0; i < 14; i++){ const a = (i + hh(i, 63))/14*TAU, r = Rb*(.5 + 1.3*pq)*(.8 + .4*hh(i, 64));   // the spin dies in a puff of ash
        c.globalAlpha = .85*(1 - pq); dots(c, i % 3 ? '#40262a' : '#5a4650', [[tx + Math.cos(a)*r, ty + 1.0*Rb + Math.sin(a)*r*.35 - pq*.4*Rb]], pq < .5 ? 4 : 3); }
    }
    c.globalAlpha = 1;
  }
  function pool(c, x, y, rx, ry, al, hot = false){
    if (rx < 1 || al < .01) return; c.globalAlpha = Math.min(1, al); const Bk = LV.map(() => []), Lp = [];
    for (let yy = -Math.ceil(ry); yy <= Math.ceil(ry); yy++){ const w = rx*Math.sqrt(Math.max(0, 1 - (yy/ry)**2));
      for (let xx = -Math.round(w); xx <= Math.round(w); xx++){ const f = Math.hypot(xx/rx, yy/ry); (f > .86 ? Lp : Bk[Math.min(5, Math.floor(f*(hot ? 3.4 : 5.2) + ((xx + yy) & 1)*.4))]).push([x + xx, y + yy]); } }
    dots(c, '#2a0e0e', Lp); for (let i = 5; i >= 0; i--) dots(c, LV[i], Bk[i]); c.globalAlpha = 1;
  }
  const ss = (a, b, v) => { v = Math.max(0, Math.min(1, (v - a)/(b - a))); return v*v*(3 - 2*v); };
  // effects are stamped in whole buffer pixels, one colour per run, like the sprite
  function dots(g, col, pts, w = 1, q = 1){ g.fillStyle = col; const h = Math.floor(w/2), seen = new Set(), sq = [];
    for (const [x, y] of pts){ const X = q > 1 ? Math.floor(x/q)*q : Math.round(x), Y = q > 1 ? Math.floor(y/q)*q : Math.round(y), key = X*65536 + Y; if (seen.has(key)) continue; seen.add(key); sq.push(X/q - h, Y/q - h); }
    // squares that overlap see-through or blended paint their overlaps twice: those keep one rect each
    if (sq.length < 4 || w > 1 && !(g.globalAlpha >= 1 && g.globalCompositeOperation === 'source-over' && /^#[0-9a-f]{6}$/i.test(col)) || !rects(g, sq, w, q)) for (let i = 0; i < sq.length; i += 2) g.fillRect(sq[i]*q, sq[i + 1]*q, w*q, w*q); }   // q: the grid, 2 = the floor's PX   // each art pixel once: a faint line stays evenly faint
  // the union of w-cell squares (corners in grid cells) as few rects, one sprite each on game tech: each row swept into runs,
  // and a run the next row repeats grows down into one rect
  let D = new Int32Array(4096);   // rects()'s scratch: per cell of the squares' box, squares starting minus squares ending there; left all zero
  function rects(g, sq, w, q){ if (!sq.length) return true; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < sq.length; i += 2){ x0 = Math.min(x0, sq[i]); x1 = Math.max(x1, sq[i]); y0 = Math.min(y0, sq[i + 1]); y1 = Math.max(y1, sq[i + 1]); }
    const W = x1 - x0 + w + 1, H = y1 - y0 + w; if (!(W*H < 4e6)) return false;   // a stray far point (or not a number): the squares one by one
    if (D.length < W*H) D = new Int32Array(W*H*2);
    for (let i = 0; i < sq.length; i += 2){ let o = (sq[i + 1] - y0)*W + sq[i] - x0; for (let j = 0; j < w; j++, o += W){ D[o]++; D[o + w]--; } }
    let prev = [], next = [];   // the rects still growing down, [x0, x1, y0], by x0: one the next row repeats grows into it
    const out = (r, y) => g.fillRect((r[0] + x0)*q, (r[2] + y0)*q, (r[1] - r[0])*q, (y - r[2])*q);
    for (let y = 0; y < H; y++){ let p = 0, k = 0, a = 0; const o = y*W;
      for (let x = 0; x < W; x++){ const d = D[o + x]; if (!d) continue; D[o + x] = 0; const k0 = k; k += d;
        if (!k0) a = x;
        else if (!k){ while (p < prev.length && prev[p][0] < a) out(prev[p++], y);
          if (p < prev.length && prev[p][0] === a && prev[p][1] === x) next.push(prev[p++]); else next.push([a, x, y]); } }
      while (p < prev.length) out(prev[p++], y);
      [prev, next] = [next, prev]; next.length = 0; }
    for (const r of prev) out(r, H);
    return true; }
  function seg(x0, y0, x1, y1){ const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))), o = []; for (let i = 0; i <= n; i++) o.push([x0 + (x1 - x0)*i/n, y0 + (y1 - y0)*i/n]); return o; }
  function arc(cx, cy, r, a0, a1, sy = 1){ const n = Math.max(2, Math.ceil(Math.abs(a1 - a0)*r*1.3)), o = []; for (let i = 0; i <= n; i++){ const a = a0 + (a1 - a0)*i/n; o.push([cx + Math.cos(a)*r, cy + Math.sin(a)*r*sy]); } return o; }

  return {
    bg(c, w, t){
      const T = c.getTransform(), n = Math.round(w*T.a);
      c.save(); c.setTransform(1,0,0,1,0,0); c.imageSmoothingEnabled = false; c.drawImage(floor(n), Math.round(T.e), Math.round(T.f)); c.restore();
    },
    boss(c, x, y, R, t, ph = 3){ const Rr = R*c.getTransform().a/AP();
      place(c, x, y, R, t, ph, sheet(['idle', Math.round(Rr), ph].join(), Rr, ph, (j) => ({ P: RIG.pose(j/10, ph), t: j/10, o: [0, 0] }), c.grace > 0), loopI(t)); },
    attack(c, x, y, R, t, ph = 3, atk, u, px, py){
      const gx = (px - x)/R, gy = (py - y)/R, P = RIG.pose(t, ph, atk, u, gx, gy), A = RIG.attackUnit(atk, u, ph, gx, gy, t, P), b = P.beats;
      const an = Math.round(Math.atan2(gy, gx)/(TAU/16)), dq = Math.max(.5, Math.round(Math.hypot(gx, gy)*2)/2), qx = Math.cos(an*TAU/16)*dq, qy = Math.sin(an*TAU/16)*dq;   // the aim the sheet was cut at
      const Rr = R*c.getTransform().a/AP(), mv = atk === 'wheel' || atk === 'sword';
      const S = sheet([atk, Math.round(Rr), ph, an, dq].join(), Rr, ph, (j) => { const uq = j/(FN - 1), Q = RIG.pose(0, ph, atk, uq, qx, qy);
        if (atk === 'sword') Q.swd = { A: RIG.attackUnit(atk, uq, ph, qx, qy, 0, Q), u: uq }; return { P: Q, t: 0, o: mv ? [Q.body.ox, Q.body.oy] : [0, 0] }; }, c.grace > 0);
      const fi = (v) => Math.round(Math.max(0, v)*(FN - 1)), sp = atk === 'tornado' ? b.spin : 0;
      const gh = sp > .05 ? [[fi(u - .003), .3*sp, GHOST[0]], [fi(u - .0015), .45*sp, GHOST[1]]]   // the top's smear: where it just turned
        : b.strike > .05 && atk !== 'tornado' ? [[fi(u - .07), .25*b.strike, GHOST[0]], [fi(u - .035), .4*b.strike, GHOST[1]]] : [];
      if (atk === 'sword') P.swd = { A, u };
      const T0 = c.getTransform(), cx = Math.round(T0.a*x + T0.e), cy = Math.round(T0.d*y + T0.f), Rb = R*T0.a, U = (o) => [cx + o.x*Rb, cy + o.y*Rb];   // the sprite's own centre (place() lands it here)
      const tx = cx + P.raw.ox*Rb, ty = cy + (P.raw.dy - .1)*Rb;   // the top's axis
      if (atk === 'tornado'){ c.save(); c.setTransform(1,0,0,1,0,0); tornadoFloor(c, A, b, u, t, cx, cy, Rb, U); top(c, b, u, t, tx, ty, Rb, sp, false); c.restore(); }   // the rig's draw order: floor marks under the boss, the funnel over it
      if (atk === 'laser'){ c.save(); c.setTransform(1,0,0,1,0,0); laserFloor(c, A, t, Rb, U); c.restore(); }
      const FLOOR = { wheel: wheelFloor, recall: recallFloor, sword: swordFloor }, TOP = { wheel: wheelTop, recall: recallTop, sword: swordTop };
      if (FLOOR[atk]){ c.save(); c.setTransform(1,0,0,1,0,0); FLOOR[atk](c, A, u, t, Rb, U); c.restore(); }
      place(c, x, y, R, t, ph, S, fi(u), gh);
      c.save(); c.setTransform(1,0,0,1,0,0);
      if (atk === 'tornado') top(c, b, u, t, tx, ty, Rb, sp, true);
      if (atk === 'blast'){
        const tel = b.windup*(1 - Math.min(1, 4*b.strike))*(1 - b.recovery)*(A.sheet ? 0 : 1), dir = A.dir;
        if (tel > .01){                                   // the telegraph: the cone the sheet will sweep, lit on the floor, its reach marked
          const hw = .65, L = Rb*4.2;
          c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,90,20,' + (.13*tel).toFixed(3) + ')';
          c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, L, dir - hw, dir + hw); c.closePath(); c.fill(); c.globalCompositeOperation = 'source-over';
          c.globalAlpha = .22*tel;
          for (const sg of [-1, 1]){ const a = dir + sg*hw; dots(c, '#d8340c', seg(cx + Math.cos(a)*Rb, cy + Math.sin(a)*Rb, cx + Math.cos(a)*L, cy + Math.sin(a)*L).filter((_, i) => i % 3 !== 2)); }
          dots(c, '#a8320e', arc(cx, cy, L, dir - hw, dir + hw).filter((_, i) => i % 2 === 0)); c.globalAlpha = 1;
        }
        for (const s of A.suck){ const [X, Y] = U(s), w = Math.max(2, Math.round(2*s.r*Rb)); c.globalAlpha = s.al; dots(c, '#ff6a14', [[X, Y]], w); dots(c, '#ffd858', [[X - 1, Y - 1]], Math.max(1, w - 2)); }   // embers drawn into the bud
        c.globalAlpha = 1;
        if (A.shock){ const [X, Y] = U(A.shock), r = A.shock.r*Rb; c.globalAlpha = A.shock.al; dots(c, '#ff6a14', arc(X, Y, r - 2, 0, TAU, .9), 2); dots(c, '#fff4c4', arc(X, Y, r, 0, TAU, .9), 2); c.globalAlpha = 1; }   // the burst: one ring of hot air
        const S = A.sheet;
        if (S){                                           // the sheet: a thick band of lava behind each crest, white-hot lip, cooling behind
          const fa = Math.min(1, S.fade*4), T1 = [], T2 = [];
          for (const f of S.flows){ const ca = Math.cos(f.a), sa = Math.sin(f.a), rm = (f.r0 + f.r1*2)/3;   // brighter metal streaming out behind the front
            T1.push(...seg(cx + ca*f.r0*Rb, cy + sa*f.r0*Rb, cx + ca*rm*Rb, cy + sa*rm*Rb)); T2.push(...seg(cx + ca*rm*Rb, cy + sa*rm*Rb, cx + ca*f.r1*Rb, cy + sa*f.r1*Rb)); }
          c.globalAlpha = .7*fa; dots(c, '#d8340c', T1); dots(c, '#ffa22a', T2);
          for (const cr of S.crests.slice().sort((p, q) => q.j - p.j)){ const al = Math.min(1, cr.f*(cr.j ? 3 : 9)), rc = (cr.r + .04)*Rb;   // opaque until the rig's fade is nearly done
            if (cr.j){ c.globalAlpha = .8*al; dots(c, '#a8320e', arc(cx, cy, rc - 1, cr.a0, cr.a1), 2); dots(c, '#ff6a14', arc(cx, cy, rc - 1, cr.a0, cr.a1)); continue; }   // the older crests: thin cooling ridges
            const th = Math.max(5, Math.round(S.band*Rb)), Wv = {};
            c.globalCompositeOperation = 'lighter'; c.globalAlpha = .3*al; c.strokeStyle = '#ff6a14'; c.lineWidth = th*2.4;   // the heat off the wave: a soft glow, under the threshold
            c.beginPath(); c.arc(cx, cy, Math.max(1, rc - th/2), cr.a0, cr.a1); c.stroke(); c.globalCompositeOperation = 'source-over';
            const rO = rc + 2, rI = Math.max(0, rc - th - 2), am = (cr.a0 + cr.a1)/2, ux = Math.cos(am), uy = Math.sin(am), ch = Math.cos((cr.a1 - cr.a0)/2);
            let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
            for (let m = 0; m <= 8; m++){ const a = cr.a0 + (cr.a1 - cr.a0)*m/8; for (const r of [rI, rO]){ const X = cx + Math.cos(a)*r, Y = cy + Math.sin(a)*r; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); } }
            for (let y = Math.floor(y0 - 2); y <= Math.ceil(y1 + 2); y++) for (let x = Math.floor(x0 - 2); x <= Math.ceil(x1 + 2); x++){   // the lead wave: one fat molten band, dark crust outside, white-hot core, cooling inward
              const dx = x + .5 - cx, dy = y + .5 - cy, rr = Math.hypot(dx, dy); if (rr > rO || rr < rI || (dx*ux + dy*uy) < ch*rr) continue;
              const a = Math.atan2(dy, dx), d = rc + Math.sin(a*11 + t*4)*1.3 - rr; if (d < 0 || d >= th) continue;
              const f = d/(th - 1), col = d < 1 || d >= th - 1 ? '#2a0e0e' : f < .22 ? '#d8340c' : f < .4 ? '#ffa22a' : f < .62 ? '#fff4c4' : f < .8 ? '#ffd858' : '#ff6a14';
              (Wv[col] || (Wv[col] = [])).push([x, y]); }
            c.globalAlpha = al; for (const col in Wv) dots(c, col, Wv[col]); }
          c.globalAlpha = fa;
          for (const dp of S.drops){ const [X, Y] = U(dp), w = Math.max(3, Math.round(2.4*dp.z*Rb)); dots(c, '#d8340c', seg(X, Y, X - Math.cos(dp.a)*dp.tl*Rb*.5, Y - Math.sin(dp.a)*dp.tl*Rb*.5), 2); dots(c, '#2a0e0e', [[X, Y]], w + 1); dots(c, '#ff6a14', [[X, Y]], w); dots(c, '#fff4c4', [[X, Y]], Math.max(1, w - 2)); }   // spatter flung ahead of the lip
          c.globalAlpha = 1;
        }
      } else if (atk === 'tornado'){
        const Lv = A.alive, d = A.collapse, sc = A.scale;
        if (Lv > .01){
          const [bx, by] = U(A.pos);
          const ring = (h) => { const lean = .25*h*h*Math.sin(t*1.1)*(1 - d), rx = (.16 + .78*Math.pow(h, 1.4))*sc*(1 + d*.7); return [bx + lean*Rb, by - h*1.4*sc*(1 - .92*d)*Rb, rx*Rb]; };
          const NR = 13, back = [], front = [], COL = ['#fff4c4', '#ffd858', '#ffa22a', '#ff6a14', '#d8340c', '#7a1004', '#3a1210', '#2c1a1c'];
          for (let j = 0; j <= NR; j++){                  // the funnel's skin: stacked rings, dashes turning, hot at the foot, ash at the top
            const h = j/NR, [rcx, rcy, rx] = ring(h), ci = Math.min(7, Math.floor(h*7.99)), F = [], K = [], n = Math.max(6, Math.ceil(rx*TAU*.7));
            for (let m = 0; m < n; m++){ const th = m/n*TAU; if (Math.sin(3*th - t*9 + h*5) < -.55) continue; (Math.sin(th) > 0 ? F : K).push([rcx + Math.cos(th)*rx, rcy + Math.sin(th)*rx*.3]); }
            back.push([COL[Math.min(7, ci + 2)], K, 1]); front.push([COL[ci], F, h < .5 ? 2 : 1]); }
          for (const [col, pts, wd] of back) dots(c, col, pts, wd);
          const BK = { '#fff4c4':[], '#ffd858':[], '#ffa22a':[], '#ff6a14':[], '#d8340c':[], '#7a1004':[] }, LC = ['#ffa22a', '#ff6a14', '#d8340c', '#7a1004'];
          const [, ty] = ring(1), rows = Math.max(1, Math.ceil(by - ty));
          for (let yy = 0; yy <= rows; yy++){             // the column itself, row by row: a molten body, a white-hot dithered core
            const h = yy/rows, [rcx, , rx] = ring(h), y2 = Math.round(by - yy), cool = Math.floor(h*1.8);
            for (let xx = Math.round(rcx - rx); xx <= Math.round(rcx + rx); xx++){
              const f = Math.abs(xx - rcx)/Math.max(1, rx) + .1*Math.sin(h*9 - t*7 + (xx - rcx)*.4);
              if (f < .3 - .15*h) BK[(xx + y2) & 1 ? '#fff4c4' : '#ffd858'].push([xx, y2]);
              else BK[LC[Math.max(0, Math.min(3, Math.floor(f*3.2) + cool - 1))]].push([xx, y2]); } }
          c.globalAlpha = Math.min(1, Lv*1.4)*(1 - .6*d);
          for (const col in BK) dots(c, col, BK[col]);
          for (let i = 0; i < 10; i++){                  // debris spiralling in and up; each fades to nothing at both ends of its lap
            const l = (t*.45 + i/10) % 1, [rcx, rcy, rx] = ring(l), an = t*4 + i*2.4 + l*7, fa = Math.sin(Math.PI*l), r = rx*(1 + (1 - l)*.6);
            c.globalAlpha = Math.min(1, Lv*1.4)*fa*fa;
            dots(c, i % 3 ? '#2c1a1c' : '#ff6a14', [[rcx + Math.cos(an)*r, rcy + Math.sin(an)*r*.3]], i % 3 ? 2 : 1); }
          c.globalAlpha = Math.min(1, Lv*1.4)*(1 - .6*d);
          for (const [col, pts, wd] of front) dots(c, col, pts, wd);
          c.globalAlpha = 1;
        }
        if (A.dizzy > .01){ c.globalAlpha = A.dizzy;     // dizzy: a little ring of embers orbiting over its head
          for (let k = 0; k < 5; k++){ const a = t*3 + k*TAU/5, X = cx + Math.cos(a)*.38*Rb, Y = cy + (-1.12 + Math.sin(a)*.12)*Rb; dots(c, '#ff6a14', [[X, Y]], 3); dots(c, '#ffd858', [[X, Y]], 1); }
          c.globalAlpha = 1; }
      } else if (atk === 'laser'){
        const hot = P.raw.hot;
        if (hot > .02){ c.globalAlpha = Math.min(1, hot); for (const [ex, ey] of P.out){ const [X, Y] = U({ x: ex, y: ey }); dots(c, '#ffd858', arc(X, Y, Math.max(2.6, .14*Rb), 0, TAU)); } c.globalAlpha = 1; }   // the four eyes kindle
        if (A.reticle.al > .01){ const [X, Y] = U(A.reticle), r = A.reticle.r*Rb; c.globalAlpha = A.reticle.al;   // the reticle closing on the player
          for (let k = 0; k < 4; k++){ const a = k*Math.PI/2 + t*.8; dots(c, '#ff6a14', arc(X, Y, r, a + .25, a + Math.PI/2 - .25), 2); } c.globalAlpha = 1; }
        for (const [i, bm] of A.beams.entries()){ const [ex, ey] = U(bm);
          if (A.fire > .01){ const [hx, hy] = U(bm.end), L = seg(ex, ey, hx, hy), w = Math.max(3, Math.round(2*bm.w*Rb));   // the beam: a rope of white-hot lava
            c.globalAlpha = Math.min(1, A.fire*1.5); dots(c, '#2a0e0e', L, w + 2); dots(c, '#d8340c', L, w + 1); dots(c, '#ff6a14', L, w); dots(c, A.fire > .5 ? '#fff4c4' : '#ffd858', L, Math.max(1, w - 2));
            c.globalAlpha = 1; }
          if (A.smoke > .01){ c.globalAlpha = A.smoke*.8;   // spent: smoke curls off the half-shut eyes
            dots(c, '#40262a', [0, 1, 2, 3].map((j) => [ex + Math.sin(t*2 + j*1.7)*1.5, ey - 2 - j*2.5 - A.smoke*4]), 2); c.globalAlpha = 1; }
        }
        if (A.fire > .01) for (const [i, bm] of A.beams.entries()){ const [hx, hy] = U(bm.end);   // the touch points, over every beam: flames, a white-hot core, melt spat up and ahead
          const fx = A.track.dx, fy = A.track.dy, FL = ['#fff4c4', '#ffd858', '#ffa22a', '#ff6a14', '#d8340c', '#7a1004'];
          c.globalAlpha = Math.min(1, A.fire*1.5); const fl = .85 + .15*Math.sin(t*37 + i);
          if (i === 0){ const [Hx, Hy] = U(A.hit); pool(c, Hx, Hy, .5*Rb*fl, .2*Rb*fl, A.fire, true); c.globalAlpha = Math.min(1, A.fire*1.5); }   // the splash, over the rays' feet: one molten pool across the band
          for (let k = -3; k <= 3; k++){ const h = (.75 + .6*Math.abs(Math.sin(t*11 + k*1.9 + i*2.3)))*(1 - .17*Math.abs(k))*(.2 + .8*sm(.06, .3, A.sweep))*Rb;   // low while the ray still stands at the boss   // the burn: flame tongues licking up off the touch point, white at the root
            const X0 = hx + k*.11*Rb, lean = (k*.012 + Math.sin(t*7 + k)*.012)*Rb;   // inked so they read over the rays
            dots(c, '#2a0e0e', seg(X0, hy, X0 + lean*6, hy - h - 2), 3, 2);
            for (let j = 0; j < 6; j++) dots(c, FL[j], seg(X0 + lean*j, hy - h*j/6, X0 + lean*(j + 1), hy - h*(j + 1)/6), j < 4 ? 2 : 1, 2); }
          dots(c, '#fff4c4', [[hx, hy]], Math.max(3, Math.round(.06*Rb)), 2);
          for (let k = 0; k < 9; k++){ const l = (t*2.6 + hh(k, 71 + i)) % 1, s = hh(k, 81 + i) - .5;   // melt spat up and ahead, falling back; it fades out at both ends of its arc
            const X = hx + (fx*(.3 + .6*hh(k, 91)) + s*1.1)*Rb*l, Y = hy + fy*.3*Rb*l - (1.1 + .8*hh(k, 93))*Rb*l*(1 - l)*1.6, fa = Math.sin(Math.PI*l);
            c.globalAlpha = A.fire*fa; dots(c, '#2a0e0e', [[X, Y]], 3, 2); dots(c, k % 3 ? '#ffa22a' : '#fff4c4', [[X, Y]], k % 4 ? 1 : 2, 2); }
          c.globalAlpha = 1; }
      }
      if (TOP[atk]) TOP[atk](c, A, u, t, Rb, U);
      if (b.recovery > .01) dying(c, cx, cy, Rb, t, b.recovery);
      c.restore();
    },
    post(c, w, t){
      tilePost(c, 'pixel', w, t);
      const g = c.createRadialGradient(w/2, w/2, w*.3, w/2, w/2, w*.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(6,2,4,.5)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
    },
  };
})();
