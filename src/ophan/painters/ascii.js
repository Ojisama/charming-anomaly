import { OPHAN, OPHAN_RIG, hh, mk, TAU } from '../page.js'
// The Ophan in the Mine look (ascii), round 25 (geometry from OPHAN_RIG): the seraph typed in the mine's glyphs.
// Shape and motion come from OPHAN_RIG (cru/rig.js): this file only renders them, as a printed sigil of characters.
// Each wing is the rig's own blade envelope typed on a character grid: a near-black backing, a calm stepped field of
// '+', ':' and '·' (brighter outward), two bone ribs down its blades, a gilded double leading edge and one clean stroke
// row along its tips; the down pair's talons are typed red-hot. The great eye is < ( @ ) > in a dark socket inside a
// ring of bright strokes, with eight '@' feather eyes. Wings are typeset ONCE per size into cached canvases and placed by
// the rig's wing matrices. Every motion is continuous in t, ph and u.
// Contract: boss(c, x, y, R, t, ph), attack(c, x, y, R, t, ph, atk, u, px, py), onWing(P, x, y).
OPHAN.ascii = (() => {
  const RIG = OPHAN_RIG;
  const FONT = '"DejaVu Sans Mono", Menlo, Consolas, "Courier New", monospace';
  const INKS = {                                   // line colour ramps: dark -> lit
    bone:  [[110,92,70], [220,198,160], [255,248,222]],
    gild:  [[140,96,40], [240,196,120], [255,240,200]],
  };
  const lerp = (a, b, k) => a + (b - a)*k;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ramp = (m, I) => { const [a, b, k] = I < .5 ? [m[0], m[1], I*2] : [m[1], m[2], I*2 - 1];
    return 'rgb(' + (lerp(a[0],b[0],k)|0) + ',' + (lerp(a[1],b[1],k)|0) + ',' + (lerp(a[2],b[2],k)|0) + ')'; };
  const spr = new Map();
  function sprite(ch, col, px, glow){
    const k = ch + col + px + (glow ? 'g' : '');
    let s = spr.get(k); if (s) return s;
    const pad = glow ? px : 2, n = Math.ceil(px*1.3 + pad*2);
    s = mk(n, n); const g = s.getContext('2d');
    g.font = 'bold ' + px + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col;
    if (glow){ g.shadowColor = col; g.shadowBlur = px*.6; g.shadowOffsetX = 4000; g.fillText(ch, n/2 - 4000, n/2); g.fillText(ch, n/2 - 4000, n/2); }
    else g.fillText(ch, n/2, n/2);
    if (spr.size > 4000) spr.clear();
    spr.set(k, s); return s;
  }
  // a glyph at (x, y), size in user units; sc = device px per user unit
  function put(c, sc, ch, col, x, y, size, alpha, glow){
    if (alpha < .005) return;
    const px = Math.max(4, Math.round(size*sc)), s = sprite(ch, col, px, glow), d = s.width/sc;
    c.globalAlpha = Math.min(1, alpha); c.drawImage(s, x - d/2, y - d/2, d, d);
  }
  // the glyph for an edge at angle a
  function edgeCh(a){
    const t = ((a % Math.PI) + Math.PI) % Math.PI, k = Math.round(t/(Math.PI/4)) % 4;
    return k === 0 ? '-' : k === 1 ? '\\' : k === 2 ? '|' : '/';
  }
  const inside = (pts, x, y) => { let r = false;
    for (let a=0, b=pts.length-1; a<pts.length; b=a++){ const [xa, ya] = pts[a], [xb, yb] = pts[b];
      if ((ya > y) !== (yb > y) && x < (xb - xa)*(y - ya)/(yb - ya) + xa) r = !r; }
    return r; };
  const poly = q => q.l.concat(q.r.slice().reverse());
  const BLADES = RIG.WINGS.map(Wg => Wg.feathers.concat(Wg.coverts).map(poly));   // each wing's feather outlines, in its own frame
  const sm = v => v*v*(3 - 2*v);
  const DUST = 'rgb(214,190,150)', HOT = 'rgb(255,40,16)', WARN = 'rgb(255,172,112)';   // WARN: every telegraph on the floor
  const CS = .072;                                  // the character pitch, in body radii
  const TONES = ['rgb(104,76,50)', 'rgb(134,96,62)', 'rgb(160,116,76)', 'rgb(196,146,96)'];

  // TYPESET one part (in its own unit frame) into a canvas at K device px per unit: a grid-cell backing under the
  // blades, a stepped glyph field, then strokes (ribs, edges) walked on the same grid, the strongest winning a cell
  function typeset(blades, hot, strokes, K, tone, box){   // box: [x0, y0, x1, y1], to typeset on another part's grid
    const all = blades.concat(hot).flat(), m = .12;
    const [x0, y0, x1, y1] = box || [Math.min(...all.map(p => p[0])) - m, Math.min(...all.map(p => p[1])) - m, Math.max(...all.map(p => p[0])) + m, Math.max(...all.map(p => p[1])) + m];
    const ni = Math.ceil((x1 - x0)/CS), nj = Math.ceil((y1 - y0)/CS);
    const cv = mk(ni*CS*K, nj*CS*K), g = cv.getContext('2d'); g.setTransform(K, 0, 0, K, -x0*K, -y0*K);
    const ux = i => x0 + (i + .5)*CS, uy = j => y0 + (j + .5)*CS, cells = [], reds = [];
    const near = (L, X, Y) => [[0, 0], [.6, 0], [-.6, 0], [0, .6], [0, -.6]].some(([a, b]) => L.some(p => inside(p, X + a*CS, Y + b*CS)));
    for (let j=0;j<nj;j++) for (let i=0;i<ni;i++){ const X = ux(i), Y = uy(j);
      if (near(blades, X, Y)) cells.push([i, j]); else if (near(hot, X, Y)) reds.push([i, j]); }
    // the backing: one flat path per colour, so no seams between cells
    for (const [L, col] of [[cells, 'rgb(12,9,7)'], [reds, 'rgb(12,9,7)']]){ g.beginPath(); for (const [i, j] of L) g.rect(x0 + i*CS, y0 + j*CS, CS, CS); g.fillStyle = col; g.fill(); }
    for (const [i, j] of cells) put(g, K, '+:·'[(i + 2*j) % 3], TONES[Math.min(3, Math.floor(tone(ux(i), uy(j))*4))], ux(i), uy(j), CS*1.6, .85, false);
    const cell = new Map();
    for (const s of strokes){ const P = s.pts;
      for (let k=0;k+1<P.length;k++){ const A = P[k], B = P[k+1], N = Math.max(1, Math.round(Math.max(Math.abs(B[0] - A[0]), Math.abs(B[1] - A[1]))/CS));
        for (let q=0;q<=N;q++){ const fx = lerp(A[0], B[0], q/N), fy = lerp(A[1], B[1], q/N);
          if (s.skip && s.skip(fx, fy)) continue;
          const i = Math.round((fx - x0)/CS - .5), j = Math.round((fy - y0)/CS - .5), key = j*ni + i, o = cell.get(key);
          if (!o || s.w >= o.w) cell.set(key, { ch: s.ch || edgeCh(Math.atan2(B[1] - A[1], B[0] - A[0])), col: s.col, w: s.w, glow: s.glow }); } } }
    for (const [key, o] of cell){ const i = key % ni, j = (key - i)/ni;
      if (o.glow) put(g, K, o.ch, HOT, ux(i), uy(j), CS*o.w*1.05, .4, true);
      put(g, K, o.ch, o.col, ux(i), uy(j), CS*o.w, 1, false); }
    return { cv, x0, y0, w: ni*CS, h: nj*CS };
  }
  // the grey twin: the same part drained of colour and dimmed, for the spent pose to fade into
  function greyOf(cv){
    const gv = mk(cv.width, cv.height), gg = gv.getContext('2d');
    gg.drawImage(cv, 0, 0); gg.globalCompositeOperation = 'saturation'; gg.fillStyle = '#808080'; gg.fillRect(0, 0, gv.width, gv.height);
    gg.globalCompositeOperation = 'multiply'; gg.fillStyle = '#9a9a9a'; gg.fillRect(0, 0, gv.width, gv.height);
    gg.globalCompositeOperation = 'destination-in'; gg.drawImage(cv, 0, 0); return gv;
  }
  // one wing (the rig's right wing, in its own frame): blades and coverts as the envelope, two ribs, the gilded leading
  // edge (the arm, then the outermost blade's leading side), one clean row along the tips, the talons typed red-hot
  function wingPart(Wg, K){
    const F = Wg.feathers.filter(q => !q.tal), T = Wg.feathers.filter(q => q.tal), lastF = F[F.length - 1];
    const [rx, ry] = Wg.root, dMax = Math.max(...F.map(q => Math.hypot(q.sp[10][0] - rx, q.sp[10][1] - ry)));
    const core = (X, Y) => Math.hypot(X, Y + .1) < .34;   // the roots stay clear round the great eye's socket
    const lead = [[rx, ry], [Wg.arm[2], Wg.arm[3]], ...lastF.r.slice(2)], off = .03, nx = Math.cos(Wg.th + Math.PI/2), ny = Math.sin(Wg.th + Math.PI/2);
    const rib = q => ({ pts: q.sp.slice(2), col: ramp(INKS.bone, .95), w: 2.2, skip: core });
    const strokes = [rib(F[Math.round((F.length - 1)*.35)]), rib(F[Math.round((F.length - 1)*.7)]),
      { pts: F.map(q => q.sp[10]).concat([lastF.r[10]]), col: ramp(INKS.gild, .85), w: 2.2, skip: core },
      { pts: lead.map(([a, b]) => [a + off*nx, b + off*ny]), col: ramp(INKS.gild, .85), w: 3.1, skip: core },
      { pts: lead, col: ramp(INKS.gild, 1), w: 3.1, skip: core },
      ...T.map(q => ({ pts: q.sp, col: 'rgb(255,120,84)', w: 1.9, glow: true }))];
    const tone = (X, Y) => clamp01(.15 + .85*Math.hypot(X - rx, Y - ry)/dMax);
    const tp = typeset(F.concat(Wg.coverts).map(poly), T.map(poly), strokes, K, tone);
    const cool = typeset(F.concat(Wg.coverts).map(poly), T.map(poly), strokes.map(q => q.glow ? { ...q, col: ramp(INKS.bone, .7), glow: false } : q), K, tone).cv;
    // the talon hooks: a red 'J' on every talon tip
    const hooks = cv => { const g = cv.getContext('2d'); g.setTransform(K, 0, 0, K, -tp.x0*K, -tp.y0*K);
      for (const q of T){ const [x, y] = q.sp[10]; put(g, K, 'J', HOT, x, y, CS*2.5, .45, true); put(g, K, 'J', 'rgb(255,120,84)', x, y, CS*2.3, 1, false); } };
    hooks(tp.cv);
    const sh = mk(tp.cv.width, tp.cv.height), sg = sh.getContext('2d'); sg.filter = 'brightness(0) blur(' + (.05*K).toFixed(2) + 'px)'; sg.drawImage(tp.cv, 0, 0);
    // the sword's ragged twin, on the same grid: the wing with its peeling feathers gone (strokes broken over the gaps),
    // and each peeling feather typeset alone in the wing's frame, to sit in its gap or fly
    const gp = PEELS(Wg), keep = F.concat(Wg.coverts).filter(q => !gp.includes(q)).map(poly), holes = gp.map(poly);
    const hole = (X, Y) => holes.some(p => inside(p, X, Y)) && !keep.some(p => inside(p, X, Y));
    const gapT = typeset(keep, T.map(poly), strokes.map(s => ({ ...s, skip: (X, Y) => (s.skip && s.skip(X, Y)) || hole(X, Y) })), K, tone, [tp.x0, tp.y0, tp.x0 + tp.w - 1e-6, tp.y0 + tp.h - 1e-6]);
    hooks(gapT.cv);
    const peels = gp.map(q => { const s = typeset([poly(q)], [], [{ pts: q.sp, col: ramp(INKS.gild, .9), w: 2.2 }], K, tone); return { ...s, grey: greyOf(s.cv) }; });
    return { ...tp, grey: greyOf(tp.cv), shade: sh, cool, gap: { cv: gapT.cv, grey: greyOf(gapT.cv) }, peels };
  }
  // C: the feathers that peel off for the sword (two in three, never a talon), in the order they leave: interleaved so
  // all six wings thin together
  function PEELS(W){ return W.feathers.filter((q, j) => j % 3 && !q.tal); }
  const PEEL = []; for (let j=0;j<5;j++) for (const i of [0, 1, 2]) for (const side of [-1, 1]){ const q = PEELS(RIG.WINGS[i])[j]; if (q) PEEL.push({ i, side, j, q }); }
  const QW = new Map(PEEL.map(({ q }) => [q, Math.max(.02, ...q.l.slice(0, q.r.length).map((p, k) => Math.hypot(p[0] - q.r[k][0], p[1] - q.r[k][1])/2))]));   // each one's half-width
  // the core: the rig's twelve short blades round the great eye, backing and field only (the socket sits over them)
  const corePart = K => typeset(RIG.CORE.map(poly), [], [], K, (X, Y) => clamp01(Math.hypot(X, Y + .1)/.35));
  const bakes = new Map();
  function baked(K){
    const k = Math.round(K*4);
    let b = bakes.get(k);
    if (!b){ b = { wings: RIG.WINGS.map(Wg => wingPart(Wg, K)), core: corePart(K) }; bakes.set(k, b); }
    return b;
  }
  const lay = (c, p, img) => c.drawImage(img || p.cv, p.x0, p.y0, p.w, p.h);

  // the closed centre, A: a feather knot -- seven arms of short gilded strokes swirling tight into a '&' knot, small
  // coverts tucked between them. Opening (jo): the knot unwinds and throws its strokes outward, and the eye is inside
  function junction(c, sc, ex, ey, jo, t){
    const op = 1 - sm(clamp01(jo)), cs = CS; if (op < .01) return;
    c.globalAlpha = .9*op; c.fillStyle = 'rgb(8,6,5)'; c.beginPath(); c.ellipse(ex, ey, .3*(1 + .8*jo), .24*(1 + .8*jo), 0, 0, TAU); c.fill();
    for (let arm=0;arm<7;arm++){
      for (let k=0;k<7;k++){ const f = k/6, th = arm/7*TAU + f*2.2 + jo*2.6 + .04*Math.sin(t*.6 + arm), r = (.045 + .25*f)*(1 + 1.4*jo);
        const px = ex + Math.cos(th)*r, py = ey + Math.sin(th)*r*.82, d = th + Math.atan2(r, .115);
        put(c, sc, edgeCh(d), ramp(INKS.gild, .4 + .6*(1 - f)), px, py, cs*(2.7 - .9*f), op, false); }
      const th = (arm + .5)/7*TAU + 1.1 + jo*2.6, r = .2*(1 + 1.4*jo);
      put(c, sc, arm % 2 ? ',' : '~', DUST, ex + Math.cos(th)*r, ey + Math.sin(th)*r*.82, cs*2.2, .85*op, false); }
    put(c, sc, '&', ramp(INKS.gild, 1), ex, ey, cs*2.8, op, false);
  }
  // P = OPHAN_RIG.pose(...): where everything is
  function draw(c, x, y, R, t, ph, P){
    const m0 = c.getTransform(), s0 = Math.hypot(m0.a, m0.b) || 1, K = R*s0, B = baked(K), sc = K, cs = CS;
    const Bm = P.body.m, Fm = P.body.floor, ap = RIG.apply, beats = P.beats, grey = beats.recovery;
    const open = clamp01(P.eye.open), flare = P.raw.fl;
    // the reveal (the rig's burst): a ripple runs out from the eye over the floor
    const kk = clamp01((ph - 2.25)/.75), rv = beats.burst, rf = (.3 + 8.7*Math.pow(kk, 3))*R;
    const HX = x + P.halo.x*R, HY = y + P.halo.y*R;
    c.save();
    c.translate(x, y); c.scale(R, R);
    // holy light (floor layer): rays of stroke glyphs round the halo, turning very slowly, breathing
    const hs = P.halo.scale;
    for (let k=0;k<16;k++){ const u = k/16*TAU + t*.04, ch = edgeCh(u), b = .75 + .25*Math.sin(t*.7 + k*2.3);
      for (let q=0;q<3;q++){ const r = (.38 + q*.085)*hs, [px, py] = ap(Fm, RIG.HALO.x + Math.cos(u)*r, RIG.HALO.y + Math.sin(u)*r);
        put(c, sc, ch, 'rgb(255,206,140)', px, py, cs*(1.8 - q*.25), (.55 - q*.14)*b*(.3 + .7*open), false); } }
    // the wings' shadows at rest on the floor, and the halo: one typed ring of bone round the great eye
    c.save(); c.transform(...Fm); c.translate(0, -.1); c.scale(hs, hs); c.translate(0, .1);
    c.save(); c.translate(0, .05); c.scale(1.3, 1.1); const pd = c.createRadialGradient(0, 0, 0, 0, 0, 1.1);
    for (const [o, a] of [[0, .45], [.35, .35], [.6, .18], [.8, .07], [1, 0]]) pd.addColorStop(o, 'rgba(5,4,3,' + a + ')');
    c.fillStyle = pd; c.beginPath(); c.arc(0, 0, 1.1, 0, TAU); c.fill(); c.restore();
    const shade = (i, al) => { const p = B.wings[i], s = RIG.WINGS[i].scale; c.globalAlpha = .5*al;
      for (const e of [-1, 1]){ c.save(); c.scale(e*s, s); c.drawImage(p.shade, p.x0 + .03, p.y0 + .06, p.w, p.h); c.restore(); } };
    shade(0, 1); shade(1, 1); c.globalAlpha = 1;
    arcRow(c, sc, RIG.HALO.x, RIG.HALO.y, RIG.HALO.r, 0, TAU, cs*1.1, (px, py, a) => put(c, sc, edgeCh(a + Math.PI/2), 'rgb(236,214,180)', px, py, cs*1.9, .9, false));
    c.restore();
    const dn = P.wings.find(w => w.i === 2);   // the down pair's shadow is not drawn in by the halo's breath
    if (dn){ c.save(); c.transform(...Fm); shade(2, dn.vis); c.restore(); c.globalAlpha = 1; }
    // the core blades, then each wing at its rig matrix (down, out, up; the down pair fading in as it unfolds)
    const spn = beats.spin || 0, dOf = w => w.depth === undefined ? 1 : w.depth;
    // w.homes (the sword): the ragged twin, plus the peeling feathers still sitting in their gaps
    const wing = w => { const p = B.wings[w.i], g = w.homes ? p.gap : p, dp = dOf(w), lit = .6*beats.glint + .3*Math.max(0, dp)*spn;
      c.save(); c.transform(...w.m);
      if (grey > .01){ c.globalAlpha = w.vis; lay(c, p, g.grey); if (w.homes) for (const j of w.homes) lay(c, p.peels[j], p.peels[j].grey); }
      c.globalAlpha = w.vis*(1 - grey); if (grey < .99){ lay(c, p, g.cv); if (w.homes) for (const j of w.homes) lay(c, p.peels[j]); }
      if (spn > .01){ c.globalAlpha = w.vis*spn; lay(c, p, p.cool); }
      if (dp < 0 && spn > .01){ c.globalAlpha = w.vis*Math.min(.85, -dp*spn); lay(c, p, p.grey); }
      if (lit > .01){ c.globalCompositeOperation = 'lighter'; c.globalAlpha = w.vis*lit; lay(c, p, spn > .01 ? p.cool : null); c.globalCompositeOperation = 'source-over'; }
      c.restore(); };
    // the top's smear: grey copies of the wings a hair back in the spin, fading
    if (P.ghosts) P.ghosts.forEach((G, k) => { for (const w of G.wings){ c.save(); c.transform(...w.m);
      c.globalAlpha = .2*w.vis*spn*(1 - k/P.ghosts.length); lay(c, B.wings[w.i], B.wings[w.i].grey); c.restore(); } });
    for (const w of P.wings) if (dOf(w) < 0) wing(w);
    c.save(); c.transform(...Bm); lay(c, B.core); c.restore();
    for (const w of P.wings) if (dOf(w) >= 0) wing(w);
    c.globalAlpha = 1;
    // the feather eyes: a black socket, a red-haloed pale '@' looking at the gaze point, bone lids that part
    const [GX, GY] = P.gaze, face = P.body.face === undefined ? 1 : P.body.face, fsq = Math.max(.02, Math.abs(face));
    for (const E of P.eyes){ const op = clamp01(E.open); if (op < .01 && E.open <= 0) continue;
      const dx = GX - E.x, dy = GY - E.y, d = Math.hypot(dx, dy) || 1, gx = dx/d*cs*.45, gy = dy/d*cs*.45, k = E.r/.11;
      c.globalAlpha = sm(op); c.fillStyle = '#030202'; c.beginPath(); c.ellipse(E.x, E.y, cs*2.4*k*fsq, cs*(.6 + 1.1*op)*k, 0, 0, TAU); c.fill();
      put(c, sc, '@', HOT, E.x + gx, E.y + gy, cs*3.6*k, .8*op*(.6 + .4*E.heat), true);
      put(c, sc, '@', 'rgb(255,242,226)', E.x + gx, E.y + gy*op, cs*3.5*k, op, false);
      put(c, sc, '-', 'rgb(236,214,180)', E.x, E.y - cs*(.5 + .9*op)*k, cs*2.2*k, .95*Math.min(1, 3*op), false);
      put(c, sc, '-', 'rgb(236,214,180)', E.x, E.y + cs*(.5 + .9*op)*k, cs*2.2*k, .95*Math.min(1, 3*op), false); }
    // the ripple's front, typed over any floor: a white-gold edge of strokes along the ring, a red wake, rays ahead
    if (rv > .01){ const r = rf/R, n = Math.ceil(TAU*r/(cs*2.4)), lv = Math.min(1, 1.5*rv), cx = (HX - x)/R, cy = (HY - y)/R;
      for (let k=0;k<n;k++){ const a = k/n*TAU, ca = Math.cos(a), sa = Math.sin(a), ch = edgeCh(a + Math.PI/2);
        put(c, sc, ch, WARN, cx + ca*r, cy + sa*r, cs*5, .7*lv, true);
        for (const [o, col, z] of [[0, 'rgb(255,250,236)', 4.4], [-cs*1.8, 'rgb(255,226,170)', 3.4], [cs*1.8, 'rgb(255,226,170)', 3.4]])
          put(c, sc, ch, col, cx + ca*(r + o), cy + sa*(r + o), cs*z, lv, false);
        put(c, sc, '~', HOT, cx + ca*(r - cs*3), cy + sa*(r - cs*3), cs*2.6, .7*rv, false);
        if (k % 3 === 0) put(c, sc, edgeCh(a), 'rgb(255,206,140)', cx + ca*(r + cs*3.2), cy + sa*(r + cs*3.2), cs*2.6, .7*rv, false); } }
    // the great eye: < ( @ ) > in a dark socket. Sealed: a seam of '=' with red heat leaking (the rig's seam);
    // the lids part as it opens; it narrows and blazes with the rig's open and flare; spent, it pulses (gape)
    const ex = P.eye.x, ey = P.eye.y, ge = open;
    let ix = Math.sin(t*.25)*cs*.25, iy = cs*.3;
    { const dx = GX - ex, dy = GY - ey, d = Math.hypot(dx, dy) || 1; ix = dx/d*cs*.7; iy = dy/d*cs*.5; }
    c.save(); c.translate(ex, ey); c.scale(fsq, 1); c.translate(-ex, -ey);
    if (face < 0){
      c.globalAlpha = 1; c.fillStyle = 'rgba(4,3,3,.92)'; c.beginPath(); c.ellipse(ex, ey, cs*4.2, cs*2.2, 0, 0, TAU); c.fill();
      for (let j=-1;j<=1;j++) for (let k=-2;k<=2;k++) if (k) put(c, sc, '#', TONES[2 + (Math.abs(k) + j + 3) % 2], ex + k*cs*1.25, ey + j*cs*1.15, cs*1.8, .9 - .2*Math.abs(j), false);
      for (let j=-1;j<=1;j++) put(c, sc, '|', 'rgb(200,60,40)', ex, ey + j*cs*1.15, cs*2, .9, false);
      for (let k=0;k<22;k++){ const a = k/22*TAU, fx = Math.cos(a)*cs*5.4, fy = Math.sin(a)*cs*2.8;
        put(c, sc, k % 4 ? edgeCh(Math.atan2(Math.cos(a)*2.8, -Math.sin(a)*5.4)) : 'o', ramp(INKS.bone, .75), ex + fx, ey + fy, cs*2.2, .9, false); }
    } else {
    const jo = beats.open, es = sm(clamp01((jo - .5)/.5));
    junction(c, sc, ex, ey, clamp01((jo - .3)/.7), t, P);
    if (es > .01){ c.save(); c.translate(ex, ey); c.scale(es, es); c.translate(-ex, -ey);
    c.globalAlpha = 1; c.fillStyle = 'rgba(4,3,3,.92)'; c.beginPath(); c.ellipse(ex, ey, cs*4.2, cs*(.9 + 1.4*ge), 0, 0, TAU); c.fill();
    put(c, sc, '@', HOT, ex + ix*.5, ey + iy, cs*(5 + 3.5*flare + 1.5*rv), Math.min(1, .75*ge*(1 + flare) + rv), true);
    if (P.eye.gape > .01) put(c, sc, '@', HOT, ex, ey + iy, cs*12, P.eye.gape*(.3 + .6*(.5 + .5*Math.sin(t*9))), true);
    for (let k=0;k<22;k++){ const a = k/22*TAU, fx = Math.cos(a)*cs*5.4, fy = Math.sin(a)*cs*(2.1 + 1.4*ge);
      put(c, sc, edgeCh(Math.atan2(Math.cos(a)*(2.1 + 1.4*ge), -Math.sin(a)*5.4)), 'rgb(255,238,200)', ex + fx, ey + fy, cs*2.2, .95, false); }
    put(c, sc, '<', ramp(INKS.bone, .9), ex - cs*3.4, ey, cs*2.6, 1, false); put(c, sc, '>', ramp(INKS.bone, .9), ex + cs*3.4, ey, cs*2.6, 1, false);
    put(c, sc, '(', ramp(INKS.bone, 1), ex - cs*2, ey, cs*3.4, ge, false); put(c, sc, ')', ramp(INKS.bone, 1), ex + cs*2, ey, cs*3.4, ge, false);
    for (const sy of [-1, 1]) for (let k=-1;k<=1;k++) put(c, sc, sy < 0 ? '_' : '-', ramp(INKS.bone, .85), ex + k*cs*1.1, ey + sy*cs*(.4 + ge*(sy < 0 ? 1.8 : 1.3)), cs*1.9, .95*ge, false);
    put(c, sc, '@', 'rgb(255,120,84)', ex + ix, ey + iy, cs*3.6*(.5 + .5*ge), ge, false);
    c.restore(); }
    }
    c.restore();
    c.restore();
  }
  // a run of one glyph along a ray from (x, y) at angle a, from r0 to r1, every `step`; alpha tapers to the far end
  function ray(c, sc, ch, col, x, y, a, r0, r1, step, size, alpha, glow){
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let r=r0;r<=r1;r+=step) put(c, sc, ch, col, x + ca*r, y + sa*r, size, alpha*(1 - .6*(r - r0)/(r1 - r0 || 1)), glow);
  }
  // a typed arc: glyphs along a circle round (x, y), radius r, from a0 to a1, about one per `step`
  function arcRow(c, sc, x, y, r, a0, a1, step, f){
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0)*r/step));
    for (let k=0;k<=n;k++){ const v = k/n, a = a0 + (a1 - a0)*v; f(x + Math.cos(a)*r, y + Math.sin(a)*r, a, v*2 - 1, k); }
  }
  // ---- the attacks: the rig's pose and danger geometry, typed in the mine's glyphs ----
  // blast: the cone telegraphed in ember, beads sucked into the bud, a ring at the burst, then the rig's sheet rolling out
  // as rows of wind glyphs, its front crest the brightest row, speed lines and spray
  function blast(c, x, y, R, t, ph, u, P, A, sc, cs){
    const S = A.sheet, dir = A.dir, ce = P.beats.windup*(S ? 1 - clamp01(S.kw*4) : u < .5 ? 1 : 0);
    if (ce > .01){
      for (const e of [-1, 1]) ray(c, sc, ':', WARN, x, y, dir + e*.5, 1.3*R, 4.2*R, cs*2.6, cs*3, .8*ce, false);
      arcRow(c, sc, x, y, 4.2*R, dir - .5, dir + .5, cs*2.6, (px, py, a) => put(c, sc, edgeCh(a + Math.PI/2), WARN, px, py, cs*3, .9*ce, false));
    }
    for (const b of A.suck) put(c, sc, '*', DUST, b.x, b.y, Math.max(cs*2, b.r*2.4), b.al, false);
    if (A.shock) arcRow(c, sc, x, y - .1*R, A.shock.r, 0, TAU, cs*1.3, (px, py, a) => {
      put(c, sc, edgeCh(a + Math.PI/2), 'rgb(255,246,220)', px, py, cs*3.4, A.shock.al, false); });
    draw(c, x, y, R, t, ph, P);
    if (!S) return;
    const ax = S.apex.x, ay = S.apex.y, al = S.fade;
    // the dark-red backing the wave's rows are typed on: the band behind the front, and a strip under each older crest
    c.fillStyle = 'rgba(40,8,6,' + (.9*al).toFixed(3) + ')'; c.beginPath(); c.arc(ax, ay, S.front + .04*R, S.dir - S.half, S.dir + S.half); c.arc(ax, ay, Math.max(0, S.front - .45*R), S.dir + S.half, S.dir - S.half, true); c.fill();
    for (const cr of S.crests) if (cr.j){ c.fillStyle = 'rgba(40,8,6,' + (.9*cr.f).toFixed(3) + ')'; c.beginPath(); c.arc(ax, ay, cr.r + .09*R, cr.a0, cr.a1); c.arc(ax, ay, Math.max(0, cr.r - .07*R), cr.a1, cr.a0, true); c.fill(); }
    // the body of the wave: rows of wind glyphs back from the front, the back rows dustier
    for (let q=0;q<7;q++){ const r = S.front - q*.3*R; if (r < .7*R) break;
      const hw = S.half*(1 - q*.03);
      arcRow(c, sc, ax, ay, r, S.dir - hw, S.dir + hw, cs*1.8, (px, py, a, f, k) => {
        put(c, sc, q ? '~=~-'[(k + q) % 4] : edgeCh(a + Math.PI/2), q < 3 ? 'rgb(255,244,222)' : DUST, px, py, cs*(q ? 3.4 : 4.4)*(1 + .3*P.beats.strike), Math.min(1, 1.8*al)*(1 - .6*f*f)*(1 - q*.1), false); }); }
    // the crests: the rig's three, the front one the brightest row with an ember glow under it
    for (const cr of S.crests) arcRow(c, sc, ax, ay, cr.r + (cr.j ? 0 : cs*2.8), cr.a0, cr.a1, cs*1.8, (px, py, a, f) => {
      if (!cr.j) put(c, sc, edgeCh(a + Math.PI/2), WARN, px, py, cs*5.5, .6*Math.min(1, 1.8*cr.f)*(1 - .6*f*f), true);
      put(c, sc, edgeCh(a + Math.PI/2), cr.j ? 'rgb(255,236,200)' : 'rgb(255,250,232)', px, py, cs*(cr.j ? 3.6 : 4.6)*(1 + .4*P.beats.strike), Math.min(1, 1.8*cr.f)*(1 - .5*f*f), false); });
    for (const fl of S.flows) ray(c, sc, edgeCh(fl.a), 'rgb(255,236,200)', ax, ay, fl.a, fl.r0, fl.r1, cs*2, cs*3, Math.min(1, 1.6*al), false);
    for (const d of S.drops) put(c, sc, d.z > .05*R ? ',' : '.', 'rgb(255,236,200)', d.x, d.y, cs*2.6, al, false);
  }
  // tornado: wind round the spinning rosette, then the rig's column of typed rings
  // walking the road (behind the boss), its trail, and the pool it leaves as it unravels
  function tornado(c, x, y, R, t, ph, u, P, A, sc, cs){
    if (A.wind > .01) for (let q=0;q<24;q++){ const a = q/24*TAU + A.spin*.8, r = 1.6*R;
      put(c, sc, edgeCh(a + Math.PI/2), DUST, x + Math.cos(a)*r, y + Math.sin(a)*r*.5, cs*3, .9*A.wind*(1 - .6*A.alive)*(.5 + .5*Math.sin(a*2 - A.spin)), false); }
    if (A.pool > .01){ const rx = .62*Math.sqrt(A.pool)*R, X = A.pos.x, Y = A.pos.y;
      c.globalAlpha = .9*A.pool; c.fillStyle = 'rgb(40,8,6)'; c.beginPath(); c.ellipse(X, Y, rx, rx*.38, 0, 0, TAU); c.fill();
      for (let k=0;k<3;k++) arcRow(c, sc, X, Y, rx*(.35 + .3*k), 0, TAU, cs*1.8, (px, py) => put(c, sc, '~', k ? DUST : HOT, px, Y + (py - Y)*.38, cs*2.6, A.pool*(1 - .2*k), false)); }
    const ta = A.alive, tc = ta*(1 - A.collapse);
    if (ta > .01){
      A.trail.forEach((p, k) => put(c, sc, k % 2 ? '~' : '-', DUST, p.x, p.y, cs*3, tc*.6*k/10, false));
    }
    const spn = P.beats.spin, yaw = P.body.yaw || 0, rec = P.beats.recovery, fl = P.beats.flash;
    const ox = x + ((P.body.ox || 0) + P.body.dx)*R, oy = y + (P.body.dy - .1)*R, gp = RIG.apply(P.body.ground || P.body.floor, 0, .95), gX = x + gp[0]*R, gy = y + gp[1]*R;
    // the dust ring the tip grinds into the floor, and the puff as the spin dies
    const dust = Math.max(spn, rec);
    if (dust > .01) for (let k=0;k<2;k++){ const rr = (1 + .25*k + .35*rec)*R;
      arcRow(c, sc, gX, gy, rr, 0, TAU, cs*1.6, (px, py, a, v, j) => put(c, sc, '~.,'[(j + k) % 3], DUST, px, gy + (py - gy)*.28, cs*2.6, .8*dust*(1 - .35*k)*(.6 + .4*Math.sin(a*5 + yaw*(k ? -1 : 1))), false)); }
    // the shock of the launch, flat on the floor
    if (fl > .01) arcRow(c, sc, gX, gy, (1 + 1.6*(1 - fl))*R, 0, TAU, cs*1.4, (px, py, a) => put(c, sc, edgeCh(Math.atan2(Math.cos(a)*.28, -Math.sin(a))), 'rgb(255,246,220)', px, gy + (py - gy)*.28, cs*3.4, fl, false));
    // the rim: the top's spin disc at the wing tips, speed streaks running round it (back half behind the boss)
    const rim = (front) => { if (spn < .01) return;
      for (const [rr, col, z] of [[1.45, 'rgb(255,244,222)', 3.2], [1.2, WARN, 2.6]]) arcRow(c, sc, ox, oy, rr*R, 0, TAU, cs*1.3, (px, py, a) => {
        const sa = Math.sin(a); if ((sa > 0) !== front) return;
        const st = .5 + .5*Math.sin(a*7 - yaw*2), Y = oy + (py - oy)*.26;
        put(c, sc, edgeCh(Math.atan2(Math.cos(a)*.26, -sa)), col, px, Y, cs*z, spn*(front ? 1 : .45)*(.25 + .75*st*st), false); }); };
    rim(false);
    draw(c, x, y, R, t, ph, P);
    rim(true);
    // sparks flung off the rim's two ends, left and right, falling as they fly
    if (spn > .01) for (let q=0;q<16;q++){ const fq = (t*1.6 + q/16) % 1, e = q % 2 ? 1 : -1, h0 = (((q*7) % 5)/4 - .5)*.5;
      put(c, sc, q % 3 ? '-' : '*', q % 4 ? WARN : 'rgb(255,246,220)', ox + e*(1.4 + 1.6*fq)*R, oy + (h0 + .5*fq*fq)*R, cs*(q % 3 ? 2.8 : 3.2), spn*Math.sin(Math.PI*fq), q % 3 === 0); }
    // the launch flash: a ring of bright strokes thrown off the boss
    if (fl > .01) arcRow(c, sc, ox, oy, (1.1 + .9*(1 - fl))*R, 0, TAU, cs*1.6, (px, py, a) =>
      put(c, sc, edgeCh(a + Math.PI/2), 'rgb(255,250,236)', px, py, cs*4, fl, false));
    // dizzy: three stars wheeling over its head as the spin dies
    if (rec > .01) for (let k=0;k<3;k++){ const a = t*5 + k*TAU/3;
      const X = ox + Math.cos(a)*.6*R, Y = y - 1.2*R + Math.sin(a)*.16*R, z = cs*(4.4 + 1.2*Math.sin(a)), al = Math.min(1, 1.6*rec)*(.7 + .3*Math.sin(a));
      put(c, sc, '*', WARN, X, Y, z*1.1, .6*al, true); put(c, sc, '*', 'rgb(255,246,220)', X, Y, z, al, false); }
    if (ta > .01){
      const bx = A.pos.x, by = A.pos.y, H = A.height, sp = A.spin + t*2;
      for (let j=0;j<9;j++){ const f = j/8, rj = lerp(A.foot, A.radius, f), h = H*f, n = 9 + j*3, ja = ta*clamp01((1 - A.collapse)*9 - j), cx = bx + Math.sin(t*1.3 + j*.5)*.06*R*j*(1 + A.collapse);
        for (let q=0;q<n;q++){ const th = q/n*TAU + sp*(1 - j*.05), front = Math.sin(th) > 0;
          const ch = front ? edgeCh(Math.atan2(Math.cos(th)*.35, -Math.sin(th))) : '~';
          const qx = cx + Math.cos(th)*rj, qy = by - h + Math.sin(th)*rj*.35, sz = cs*(3.4 + j*.18)*(1 + .25*P.beats.strike);
          if (front) put(c, sc, ch, 'rgb(255,214,150)', qx, qy, sz*1.1, .45*ja, true);
          put(c, sc, ch, front ? 'rgb(255,248,228)' : DUST, qx, qy, sz, ja*(front ? 1 : .75), false);
          if (j < 8 && q % 2 === 0) put(c, sc, front ? '=' : '~', front ? ramp(INKS.bone, .85) : DUST, cx + Math.cos(th + .2)*rj*1.05, qy - H/16, sz*.85, ja*(front ? .85 : .6), false); } }
      for (let q=0;q<14;q++){ const f = (t*.4 + q/14) % 1, a = f*6 + q*1.7, r = lerp(1.9, .2, f)*R*A.scale;
        put(c, sc, '#%*+'[q % 4], DUST, bx + Math.cos(a)*r, by - f*H*1.3 + Math.sin(a)*r*.35, cs*3, tc*Math.sin(Math.PI*f), false); }
    }
  }
  // a beam typed as three stacked columns of red glyphs, | ! : down its length when it runs steep, its own stroke
  // when it runs flat; the middle column hottest
  function beam(c, sc, x, y, a, r0, r1, step, size, alpha){
    const ca = Math.cos(a), sa = Math.sin(a), steep = Math.abs(sa) > .8, ch0 = edgeCh(a);
    for (const [o, sz, al0] of [[0, 1.25, 1], [-.5, .9, .7], [.5, .9, .7]]){ const nx = -sa*o*size, ny = ca*o*size;
      for (let r=r0, i=0;r<=r1;r+=step, i++){ const ch = steep ? '|!:'[(i + (o ? 1 : 0)) % 3] : ch0, al = alpha*al0*(1 - .45*(r - r0)/(r1 - r0));
        put(c, sc, ch, HOT, x + ca*r + nx, y + sa*r + ny, size*sz*1.2, .5*al, true);
        put(c, sc, ch, o ? 'rgb(255,96,60)' : 'rgb(255,190,150)', x + ca*r + nx, y + sa*r + ny, size*sz, al, false); } }
  }
  // laser: a heat ray -- the lanes typed on the ground as the aim, then four rays from the eyes to ground points walking
  // from the feet through the player and past, each touching down in a burning splash, the lanes scorched behind them
  function laser(c, x, y, R, t, ph, u, P, A, sc, cs){
    // the walk, in world px: each lane runs from its beam.start along (dx, dy) for track.len
    const T = A.track, L = T.len, run = Math.hypot(T.now.x - T.start.x, T.now.y - T.start.y), fire = A.fire, sk = A.scorch;
    const rt = A.reticle;
    if (rt.al > .01) arcRow(c, sc, rt.x, rt.y, rt.r, 0, TAU, cs*2.4, (px, py, a) => put(c, sc, edgeCh(a + Math.PI/2), WARN, px, py, cs*3, rt.al, false));
    // AIM: the four lanes typed on the ground, feet to past the player, a pulse of ember running down them
    if (A.aim > .01) for (const b of A.beams) for (let d=0, k=0;d<=L;d+=cs*2.2, k++){ const pu = .5 + .5*Math.sin(k*.9 - t*7);
      put(c, sc, k % 2 ? '.' : ':', WARN, b.start.x + T.dx*d, b.start.y + T.dy*d, cs*2.4, A.aim*(.3 + .55*pu)*(1 - .55*d/L), false); }
    // SCORCH: each lane burnt from its start to the walking point, white-hot at the point, cooling to dull ember behind it
    if (A.sweep > 0 && sk > .01) for (const b of A.beams){
      c.globalAlpha = .8*sk; c.strokeStyle = 'rgb(30,8,5)'; c.lineWidth = .09*R; c.lineCap = 'round'; c.beginPath(); c.moveTo(b.start.x, b.start.y); c.lineTo(b.end.x, b.end.y); c.stroke();
      for (let d=0, k=0;d<=run;d+=cs*1.4, k++){ const h = Math.round(Math.exp(-(run - d)/(1.4*R))*(.35 + .65*fire)*16)/16, cl = h > .5 ? [lerp(220, 255, (h - .5)*2), lerp(70, 220, (h - .5)*2), lerp(30, 160, (h - .5)*2)] : [lerp(90, 220, h*2), lerp(36, 70, h*2), lerp(24, 30, h*2)];
        put(c, sc, h > .6 ? '#' : h > .3 ? '%' : ':', 'rgb(' + (cl[0]|0) + ',' + (cl[1]|0) + ',' + (cl[2]|0) + ')', b.start.x + T.dx*d, b.start.y + T.dy*d, cs*(2 + .8*h), sk*(.6 + .4*h), h > .7); } }
    // the impact's glow on the floor and the molten pools it leaves
    for (const b of A.beams){
      if (fire > .01){ const fk = .75 + .25*Math.sin(t*31 + b.off*40);
        put(c, sc, '*', HOT, b.end.x, b.end.y, cs*9*fk, .8*fire, true);
        arcRow(c, sc, b.end.x, b.end.y, .2*R*fk, 0, TAU, cs*1.4, (px, py, a) => put(c, sc, '~', 'rgb(255,150,80)', px, b.end.y + (py - b.end.y)*.4, cs*2.2, fire*fk, false)); }
      if (A.pool > .01){ const rx = .31*Math.sqrt(A.pool)*R, X = b.end.x, Y = b.end.y;
        c.globalAlpha = .9*A.pool; c.fillStyle = 'rgb(40,8,6)'; c.beginPath(); c.ellipse(X, Y, rx, rx*.38, 0, 0, TAU); c.fill();
        for (let k=0;k<2;k++) arcRow(c, sc, X, Y, rx*(.4 + .45*k), 0, TAU, cs*1.6, (px, py) => put(c, sc, '~', k ? 'rgb(255,96,60)' : HOT, px, Y + (py - Y)*.38, cs*2.4, A.pool, false)); } }
    draw(c, x, y, R, t, ph, P);
    // the rays, eye to ground point, then the burning splash where each touches down: a white-hot core, flame strokes
    // licking up, sparks flung off it and smoke climbing from where it burned
    for (const b of A.beams){
      if (fire > .01){ beam(c, sc, b.x, b.y, b.a, cs*2, b.len, cs*1.9, cs*2.8*Math.max(.5, fire)*(1 + .45*P.beats.strike), fire); put(c, sc, '@', HOT, b.x, b.y, cs*6, fire, true);
        const fk = .7 + .3*Math.sin(t*37 + b.off*53);
        put(c, sc, '#', 'rgb(255,250,232)', b.end.x, b.end.y, cs*3.6*fk, fire, false);
        for (let q=0;q<5;q++){ const a = -Math.PI/2 + (q - 2)*.42, h = (.18 + .16*(.5 + .5*Math.sin(t*23 + q*1.9 + b.off*30)))*R;
          ray(c, sc, edgeCh(a), q % 2 ? 'rgb(255,150,80)' : 'rgb(255,226,170)', b.end.x, b.end.y, a, cs*1.5, h, cs*1.5, cs*2.6, fire, false); }
        for (let q=0;q<7;q++){ const fq = (t*2.4 + q/7 + b.off*3.1) % 1, a = -Math.PI/2 + (((q*5) % 7)/6 - .5)*2.4, sp = (.5 + .5*((q*3) % 4)/3)*R;
          put(c, sc, q % 3 ? "'" : '*', q % 2 ? WARN : 'rgb(255,246,220)', b.end.x + Math.cos(a)*sp*fq, b.end.y + Math.sin(a)*sp*fq + .9*R*fq*fq, cs*(q % 3 ? 2.4 : 3), fire*Math.sin(Math.PI*fq), q % 3 === 0); } }
      const sm0 = Math.max(.5*fire*sk, A.smoke);
      if (sm0 > .01) for (let q=0;q<4;q++){ const fq = (t*.5 + q/4 + b.off*2.3) % 1, d = Math.max(0, run - (.3 + .5*q)*R);
        put(c, sc, '~', 'rgb(150,140,130)', b.start.x + T.dx*d + Math.sin(t*1.3 + q*2)*cs, b.start.y + T.dy*d - fq*1.1*R, cs*2.8, .7*sm0*Math.sin(Math.PI*fq), false); }
    }
  }
  // ---- the moving attacks: the boss's centre is (x + body.ox*R, y + body.oy*R); every mark at the boss follows it ----
  const WHITE = 'rgb(255,246,220)', DAMP = 'rgb(150,196,255)';   // DAMP: the firedamp's blue
  // one blade feather typed tip-forward: a near-black backing, bone vane rows tapering to the point, a gilded shaft
  function quill(c, sc, cs, x, y, a, len, w, al, glow){
    if (al < .01) return;
    const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca, n = Math.max(3, Math.round(len/(cs*1.15)));
    const hw = f => w*(f < .7 ? .55 + .45*f/.7 : (1 - f)/.3);
    c.globalAlpha = .85*al; c.fillStyle = 'rgb(6,5,4)'; c.beginPath();
    for (let k=0;k<=n;k++){ const f = k/n, h = hw(f) + cs*.6; c.lineTo(x - ca*len*(1 - f) + nx*h, y - sa*len*(1 - f) + ny*h); }
    for (let k=n;k>=0;k--){ const f = k/n, h = hw(f) + cs*.6; c.lineTo(x - ca*len*(1 - f) - nx*h, y - sa*len*(1 - f) - ny*h); }
    c.fill();
    const sh = edgeCh(a);
    for (let k=0;k<=n;k++){ const f = k/n, px = x - ca*len*(1 - f), py = y - sa*len*(1 - f), h = hw(f);
      if (h > cs*.5) for (const e of [-1, 1]) put(c, sc, k % 2 ? ':' : '+', ramp(INKS.bone, .45 + .4*f), px + nx*h*e, py + ny*h*e, cs*1.9, al, false);
      if (glow) put(c, sc, sh, WARN, px, py, cs*2.6, .5*al*f, true);
      put(c, sc, k === n ? '^' : sh, ramp(INKS.gild, .55 + .45*f), px, py, cs*(k === n ? 2.2 : 2), al, false); }
  }
  // a floor ring of dust glyphs
  const puff = (c, sc, cs, X, Y, r, al, sp) => { if (al > .01) arcRow(c, sc, X, Y, r, 0, TAU, cs*1.7, (px, py, a, v, j) =>
    put(c, sc, '~.,'[j % 3], DUST, px, py, cs*2.6, al*(.6 + .4*Math.sin(a*5 + sp)), false)); };
  // a burst of bright strokes and sparks out of a point
  const burst = (c, sc, cs, X, Y, R, al, r0) => { if (al < .01) return;
    for (let k=0;k<12;k++){ const a = k/12*TAU + .2, r1 = r0 + (.3 + .9*(1 - al))*R;
      ray(c, sc, k % 3 ? edgeCh(a) : '*', k % 2 ? WARN : WHITE, X, Y, a, r0 + (1 - al)*.5*R, r1, cs*2, cs*2.8, al, k % 3 === 0); }
    put(c, sc, '*', HOT, X, Y, cs*8*al, .8*al, true); };
  // wheel: the disc's scour behind it, ricochet craters and bursts, a rim of speed streaks, sparks thrown off, landing dust
  function wheel(c, x, y, R, t, ph, u, P, A, sc, cs){
    const ox = x + P.body.ox*R, oy = y + P.body.oy*R, rt = A.rate, rl = A.roll;
    // the rock back (the tell): grit kicked out behind it as it leans away
    if (A.rock > .01) for (let q=0;q<9;q++){ const a = A.dir + Math.PI + (q - 4)*.22, r = (1 + .25*(q % 3) + .3*A.rock)*R;
      put(c, sc, q % 2 ? '.' : ',', DUST, ox + Math.cos(a)*r, oy + Math.sin(a)*r, cs*2.4, .8*A.rock, false); }
    // the scour: two grooves the rim cuts, hot at the disc, cooling to dull ember behind
    if (rl > .01) for (let k=1;k<A.trail.length;k++){ const p = A.trail[k - 1], q = A.trail[k], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d < 1e-3) continue;
      const h = k/(A.trail.length - 1), nx = -dy/d, ny = dx/d, ch = edgeCh(Math.atan2(dy, dx)), n = Math.ceil(d/(cs*1.5));
      const col = 'rgb(' + (lerp(90, 255, h)|0) + ',' + (lerp(34, 150, h*h)|0) + ',' + (lerp(22, 80, h*h)|0) + ')';
      for (let i=0;i<n;i++){ const f = i/n, X = p.x + dx*f, Y = p.y + dy*f;
        for (const e of [-.5, .5]) put(c, sc, h > .7 ? '=' : ch, col, X + nx*A.r*e, Y + ny*A.r*e, cs*(2 + .8*h), rl*(.35 + .6*h), h > .85);
        put(c, sc, ':', 'rgb(90,40,26)', X, Y, cs*2, .7*rl*h, false); } }
    // the craters it leaves at each corner, under the boss
    for (const hp of A.hits) if (hp.al > .01) arcRow(c, sc, hp.x, hp.y, (.35 + .5*(1 - hp.al))*R, 0, TAU, cs*1.5, (px, py, a, v, j) =>
      put(c, sc, j % 2 ? "%" : "#", "rgb(120,60,36)", px, py, cs*2.4, hp.al, false));
    // landing dust as it sets down, dizzy
    const dk = clamp01((u - .84)/.12);
    for (let k=0;k<2;k++) puff(c, sc, cs, ox, oy, (1 + .3*k + .9*dk)*R, .85*Math.sin(Math.PI*dk)*(1 - .3*k), k*2 + t);
    // the rim's back half (behind the boss)
    const rim = (front) => { if (rt < .01) return;
      for (const [rr, col, z] of [[1.25, WHITE, 3], [1.05, WARN, 2.5]]) arcRow(c, sc, ox, oy, rr*R, 0, TAU, cs*1.3, (px, py, a) => {
        if ((Math.sin(a - A.dir) > 0) !== front) return;
        const st = .5 + .5*Math.sin(a*6 - A.spin*2);
        put(c, sc, edgeCh(a + Math.PI/2), col, px, py, cs*z, rt*(front ? 1 : .55)*(.15 + .85*st*st), false); }); };
    rim(false);
    draw(c, x, y, R, t, ph, P);
    rim(true);
    // speed lines streaming off behind the disc
    if (rt*rl > .01) for (let q=0;q<5;q++){ const o = (q - 2)*.4*R, ca = Math.cos(A.dir), sa = Math.sin(A.dir), fq = (t*3 + q*.37) % 1;
      ray(c, sc, edgeCh(A.dir), q % 2 ? DUST : WHITE, ox - ca*(1.2 + .4*fq)*R - sa*o, oy - sa*(1.2 + .4*fq)*R + ca*o, A.dir + Math.PI, 0, (.8 + .5*(2 - Math.abs(q - 2))/2)*R, cs*1.9, cs*2.6, .8*rt*rl, false); }
    // sparks thrown off the rim where it grinds, flung back and out
    if (rt > .01) for (let q=0;q<14;q++){ const fq = (t*2.2 + q/14) % 1, e = q % 2 ? 1 : -1, a0 = A.dir + e*Math.PI/2, a = a0 + e*(.5 + .8*fq) + Math.PI*.15*e;
      const sx = ox + Math.cos(a0)*1.15*R, sy = oy + Math.sin(a0)*1.15*R;
      put(c, sc, q % 3 ? '-' : '*', q % 4 ? WARN : WHITE, sx + Math.cos(a)*1.4*R*fq, sy + Math.sin(a)*1.4*R*fq, cs*(q % 3 ? 2.6 : 3), rt*Math.sin(Math.PI*fq), q % 3 === 0); }
    // each ricochet: a burst off the corner
    for (const hp of A.hits) burst(c, sc, cs, hp.x, hp.y, R, hp.al, .25*R);
    // dizzy: three stars wheeling over its head
    const rec = A.dizzy;
    if (rec > .01) for (let k=0;k<3;k++){ const a = t*5 + k*TAU/3;
      const X = ox + Math.cos(a)*.6*R, Y = oy - 1.1*R + Math.sin(a)*.16*R, z = cs*(4.4 + 1.2*Math.sin(a)), al = Math.min(1, 1.6*rec)*(.7 + .3*Math.sin(a));
      put(c, sc, '*', WARN, X, Y, z*1.1, .6*al, true); put(c, sc, '*', WHITE, X, Y, z, al, false); }
  }
  // recall: ten blade feathers fly off and stake into the floor, quiver, rip free and fly straight home
  function recall(c, x, y, R, t, ph, u, P, A, sc, cs){
    const F = A.feathers;
    // floor first: shadows (offset by height), stake dust, the tear's crater
    F.forEach((f, i) => {
      if (f.state >= 1 && f.state <= 3){ const ca = Math.cos(f.a), sa = Math.sin(f.a), l = f.len*(f.state === 2 ? .7 : 1), sx = f.state === 2 ? f.x - ca*.08*R : f.x, sy = f.y;
        c.globalAlpha = .55*f.vis*(1 - .5*clamp01(f.z/R)); c.strokeStyle = 'rgb(5,4,3)'; c.lineWidth = f.w*1.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx - ca*l, sy - sa*l); c.stroke(); }
      if (f.dust > .01) puff(c, sc, cs, f.plant.x, f.plant.y, (.12 + .4*(1 - f.dust))*R, f.dust, i);
      const pk = f.state === 2 ? 1 : f.tear;
      if (pk > .01 && f.state >= 2) put(c, sc, f.state === 2 ? '%' : '#', f.state === 2 ? 'rgb(90,40,26)' : 'rgb(120,60,36)', f.plant.x, f.plant.y, cs*3, .8*pk, false);
      if (f.tear > .01) for (let q=0;q<6;q++){ const a = q/6*TAU + i, r = (.08 + .35*(1 - f.tear))*R;
        put(c, sc, q % 2 ? ',' : "'", DUST, f.plant.x + Math.cos(a)*r, f.plant.y + Math.sin(a)*r - .25*R*(1 - f.tear)*Math.sin(Math.PI*(1 - f.tear)), cs*2.4, f.tear, false); } });
    draw(c, x, y, R, t, ph, P);
    // the feathers over the boss: flying (raised by z), staked (tail up, screen-up cheat, quivering), flying home (a short streak)
    F.forEach((f, i) => { if (f.vis < .01) return;
      if (f.state === 2){ const qv = f.quiver*.16*Math.sin(t*38 + i*2.1), a = f.a + qv, ca = Math.cos(a), sa = Math.sin(a), l = f.len*.8;
        // the tail rides up off the floor: draw it from its point at the stake back to a raised tail
        const tx = f.x - ca*l*.55, ty = f.y - sa*l*.55 - .32*l, ha = Math.atan2(f.y - ty, f.x - tx);
        quill(c, sc, cs, f.x, f.y, ha, Math.hypot(f.x - tx, f.y - ty), f.w, f.vis, f.quiver > .5);
        return; }
      const X = f.x, Y = f.y - f.z;
      if (f.state === 3) ray(c, sc, edgeCh(f.a), WARN, X - Math.cos(f.a)*f.len, Y - Math.sin(f.a)*f.len, f.a + Math.PI, 0, .5*R, cs*1.8, cs*2.4, .8*Math.sin(Math.PI*Math.min(1, f.k*1.4)), false);
      quill(c, sc, cs, X, Y, f.a, f.len, f.w, f.vis, f.state === 3);
      if (f.state === 3 && f.k > .75) put(c, sc, '*', WHITE, f.home.x, f.home.y, cs*4, (f.k - .75)*4, true); });
  }
  // sword: feathers peel off the six wings and stack into a blade at the shoulders, raised, slammed down; a shock ring; the firedamp erupts along the line
  function sword(c, x, y, R, t, ph, u, P, A, sc, cs){
    const B = A.blade, Fi = A.fire;
    // scorch along the line, behind the running front, hot at the front and cooling back to the start
    if (Fi.scorch > .01 && Fi.front > 0){
      c.globalAlpha = .75*Fi.scorch; c.strokeStyle = 'rgb(30,8,5)'; c.lineWidth = Fi.w*1.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(Fi.start.x, Fi.start.y); c.lineTo(Fi.start.x + Fi.dx*Fi.front, Fi.start.y + Fi.dy*Fi.front); c.stroke();
      for (let d=0, k=0;d<=Fi.front;d+=cs*1.4, k++){ const h = Math.round(Math.exp(-(Fi.front - d)/(1.2*R))*(.3 + .7*Fi.on)*16)/16, o = (hh(k, 91) - .5)*Fi.w*.9;
        const cl = h > .5 ? [255, lerp(110, 220, (h - .5)*2), lerp(50, 160, (h - .5)*2)] : [lerp(90, 255, h*2), lerp(36, 110, h*2), lerp(24, 50, h*2)];
        put(c, sc, h > .6 ? '#' : h > .3 ? '%' : ':', 'rgb(' + (cl[0]|0) + ',' + (cl[1]|0) + ',' + (cl[2]|0) + ')', Fi.start.x + Fi.dx*d + Fi.nx*o, Fi.start.y + Fi.dy*d + Fi.ny*o, cs*(2 + .8*h), Fi.scorch*(.55 + .45*h), h > .75); } }
    // C: the wings held open as at rest (following the body) so the gaps show; two in three of their feathers peel off, fly
    // the short way in and stack into the blade at the shoulders, and fly home as it breaks. Everything here is the boss's own
    // typeset feathers, nothing else: the first two the crossguard, the rest laid flat along the blade edge to edge. All of it in
    // boss units, on liquid's path: from the shoulders (the body's (0,-.2)) to the rig's tip, straight over the top on the slam.
    const P0 = RIG.pose(t, ph), b = P0.body.m, dt = b[0]*b[3] - b[1]*b[2], fk = B.form;
    if (Math.abs(dt) > 1e-9){ const D = RIG.mul(P.body.m, [b[3]/dt, -b[1]/dt, -b[2]/dt, b[0]/dt, (b[2]*b[5] - b[3]*b[4])/dt, (b[1]*b[4] - b[0]*b[5])/dt]);
      const lp = (p, q) => p.map((v, i) => v + (q[i] - v)*fk), ap2 = p => RIG.apply(D, p[0], p[1]);
      P.wings = P.wings.map(w => { const o = P0.wings.find(v => v.i === w.i && v.side === w.side); return o ? { ...w, m: lp(w.m, RIG.mul(D, o.m)), root: lp(w.root, ap2(o.root)), tip: lp(w.tip, ap2(o.tip)) } : w; });
      for (const e of P.eyes){ const o = P0.eyes.find(v => v.i === e.i && v.side === e.side && v.lx === e.lx && v.ly === e.ly); if (o){ const q = lp([e.x, e.y], ap2([o.x, o.y])); e.x = q[0]; e.y = q[1]; } } }
    for (const w of P.wings){ w.merge = 0; w.homes = []; }
    const ov = B.under <= .5, m = P.body.m, SB = [m[2]*-.2 + m[4], m[3]*-.2 + m[5]], tip = [(B.tip.x - x)/R, (B.tip.y - y)/R];
    const L = Math.max(.3, .9*B.form, Math.hypot(tip[0] - SB[0], tip[1] - SB[1])), ax = Math.atan2(tip[1] - SB[1], tip[0] - SB[0]), N = PEEL.length, fly = [];
    const tr = (X, Y) => [1, 0, 0, 1, X, Y], ro = a => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0], mm = (...Ms) => Ms.reduce((A2, B2) => RIG.mul(A2, B2));
    let sh = 0, ng = 0, nb = 0;
    PEEL.forEach((e, j) => { const w = P.wings.find(v => v.i === e.i && v.side === e.side); if (!w) return;
      const t0 = .03 + .14*j/N, t2 = .83 + .09*j/N, out = RIG.sm(t0, t0 + .09, u)*(1 - RIG.sm(t2, t2 + .07, u)), q = e.q;
      if (out <= 0){ w.homes.push(e.j); return; }
      // where it lies in the sword: its quill (sp[0] -> sp[10]) along the axis, squeezed to one width so the edges run parallel;
      // the first pair across the shoulders as the guard. Same side as the wing it left, so it never turns over
      const [b0, b1] = q.sp[0], [q0, q1] = q.sp[10], lq = Math.hypot(q0 - b0, q1 - b1), aq = Math.atan2(q1 - b1, q0 - b0), sd = e.side, qw = QW.get(q);
      const T = j < 2 ? mm(tr(SB[0] + Math.cos(ax)*.04, SB[1] + Math.sin(ax)*.04), ro(ax + sd*Math.PI/2), [.3/lq, 0, 0, sd*.045/qw, 0, 0], ro(-aq), tr(-b0, -b1))
        : mm(tr(SB[0] + Math.cos(ax)*L*(.05 + .61*(j - 2)/(N - 3)) - Math.sin(ax)*sd*.01, SB[1] + Math.sin(ax)*L*(.05 + .61*(j - 2)/(N - 3)) + Math.cos(ax)*sd*.01), ro(ax), [.34*L/lq, 0, 0, sd*.12/qw, 0, 0], ro(-aq), tr(-b0, -b1));
      const k = out*out*(3 - 2*out);
      if (out >= 1){ if (j < 2) ng++; else nb++; } else fly.push([e, w.m.map((v, i) => v + (T[i] - v)*k), k]);   // landed: it is typed into the blade below
      sh += out/N; });
    const K = R*sc, gy = P.beats.recovery, Bk = baked(K), hot = Math.max(P.beats.strike, .5*B.buried);
    const quillAt = ([e, Mx, k]) => { const p = Bk.wings[e.i].peels[e.j];
      c.save(); c.transform(...Mx);
      if (gy > .01){ c.globalAlpha = 1; lay(c, p, p.grey); } c.globalAlpha = 1 - gy; if (gy < .99) lay(c, p);
      const sh2 = .6*k*k*(1 - gy) + .5*hot; if (sh2 > .01){ c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, sh2); lay(c, p); c.globalCompositeOperation = 'source-over'; }   // laid in the blade they shine like steel; the slam heats them
      c.restore(); };
    const inBoss = f => { c.save(); c.translate(x, y); c.scale(R, R); f(); c.restore(); };
    // its shadow on the floor, shoulders to the point's shadow
    if (sh > .01) inBoss(() => { c.globalAlpha = .45*sh; c.strokeStyle = 'rgb(5,4,3)'; c.lineWidth = .12; c.lineCap = 'round';
      c.beginPath(); c.moveTo(SB[0], SB[1]); c.lineTo((B.ground.x - x)/R, (B.ground.y - y)/R); c.stroke(); });
    // the slam's shock ring, then cracks where the point stays buried
    const I = A.impact;
    if (I) arcRow(c, sc, I.x, I.y, I.r, 0, TAU, cs*1.4, (px, py, a) => put(c, sc, edgeCh(a + Math.PI/2), WHITE, px, py, cs*3.6, I.al, false));
    if (B.buried > .01) for (let q=0;q<7;q++){ const a = q/7*TAU + .4, r = (.12 + .12*hh(q, 92))*R;
      ray(c, sc, edgeCh(a), 'rgb(150,60,34)', B.tip.x, B.tip.y, a, cs*1.5, r + .15*R, cs*1.6, cs*2.2, .85*B.buried, false); }
    // stacked: under the body while it rises behind it, over once it has come over the top; in flight, always over
    // the sword, typed as the landed feathers build it: two parallel columns of edge glyphs from the shoulders, as long as the
    // feathers that have landed so far, a point at the tip, and a crossguard row of '=' over the body (the first pair)
    const ca = Math.cos(ax), sa = Math.sin(ax), nx = -sa, ny = ca, nB = Math.max(2, Math.round(L/(CS*1.15))), shown = Math.round(nB*nb/Math.max(1, N - 2)), ech = edgeCh(ax);
    const ptCh = Math.abs(sa) > Math.abs(ca) ? (sa < 0 ? '^' : 'v') : (ca < 0 ? '<' : '>');
    const dg = Math.min(.75, .4*L), GX = SB[0] + ca*dg, GY = SB[1] + sa*dg;   // the guard: where the blade clears the head while raised
    const blade = () => { if (shown < 1) return;
      const f1 = shown/nB, X1 = SB[0] + ca*L*f1, Y1 = SB[1] + sa*L*f1;
      c.globalAlpha = .9; c.strokeStyle = 'rgb(6,5,4)'; c.lineWidth = CS*4.2; c.lineCap = 'round'; c.beginPath(); c.moveTo(SB[0], SB[1]); c.lineTo(X1, Y1); c.stroke();
      // three glyphs wide: gilded edges, a filled bone middle; the last rows narrow to the point
      for (let k=1;k<=shown;k++){ const f = k/nB, X = SB[0] + ca*L*f, Y = SB[1] + sa*L*f, pt = k === nB, nar = k >= nB - 1;
        for (const e of nar ? [0] : [-1.1, 0, 1.1]){ const px = X + nx*e*CS, py = Y + ny*e*CS, mid = e === 0, ch = pt ? ptCh : mid ? '#' : ech;
          if (hot > .01) put(c, K, ch, HOT, px, py, CS*2.9, .6*hot, true);
          put(c, K, ch, gy > .5 ? ramp(INKS.bone, mid ? .55 : .45) : mid ? ramp(INKS.bone, .7 + .3*f) : ramp(INKS.gild, .75 + .25*f), px, py, CS*(pt ? 2.6 : 2.2), 1, false); } } };
    const guard = () => { if (ng < 1) return;
      c.globalAlpha = .9; c.strokeStyle = 'rgb(6,5,4)'; c.lineWidth = CS*2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(GX - nx*CS*3.2, GY - ny*CS*3.2); c.lineTo(GX + nx*CS*3.2, GY + ny*CS*3.2); c.stroke();
      for (let j=-3;j<=3;j++){ const px = GX + nx*j*CS*1.1, py = GY + ny*j*CS*1.1;
        put(c, K, Math.abs(j) === 3 ? (j < 0 ? '<' : '>') : '=', gy > .5 ? ramp(INKS.bone, .45) : ramp(INKS.gild, 1), px, py, CS*2.6, ng > 1 || j <= 0 ? 1 : 0, false); } };
    if (!ov) inBoss(blade);
    draw(c, x, y, R, t, ph, P);
    inBoss(() => { if (ov) blade(); guard(); fly.forEach(quillAt); });
    // the eruption: firedamp jets along the line in sequence, white at the root, orange, then blue at the tips, sparks thrown up
    for (const f of Fi.flames){ if (f.al < .01) continue;
      const fk = .8 + .2*Math.sin(t*29 + f.s*40), H = f.sz*(.6 + 1.6*f.h)*fk;
      put(c, sc, '*', HOT, f.x, f.y, cs*6*f.h, .7*f.al, true);
      put(c, sc, '#', WHITE, f.x, f.y, cs*2.8, f.al, false);
      for (let q=1;q<=4;q++){ const v = q/4, w = Math.sin(t*17 + f.s*20 + q)*cs*.8*v;
        put(c, sc, '*^"\''[q - 1], q === 1 ? WHITE : q === 2 ? WARN : DAMP, f.x + w, f.y - H*v, cs*(3 - .4*q), f.al*(1 - .35*v), q > 2); }
      for (let q=0;q<3;q++){ const fq = (t*2.6 + q/3 + f.s) % 1, a = -Math.PI/2 + (hh(q, f.s*99|0) - .5)*1.8, sp = .6*R;
        put(c, sc, q % 2 ? "'" : '*', q % 2 ? WARN : WHITE, f.x + Math.cos(a)*sp*fq, f.y + Math.sin(a)*sp*fq + .7*R*fq*fq, cs*2.4, f.al*Math.sin(Math.PI*fq), q % 2 === 0); } }
    if (Fi.on > .01 && Fi.front < Fi.len){ const X = Fi.start.x + Fi.dx*Fi.front, Y = Fi.start.y + Fi.dy*Fi.front; put(c, sc, '*', DAMP, X, Y, cs*7, .6*Fi.on, true); }
  }
  // slap: THE WHIP. The striking wing's glyphs left behind along its arc as fading copies (lit glyphs only, the cell backing
  // drops out), its tip's path typed in speed strokes; where it lands on the player, a small burst of typed impact
  function slap(c, x, y, R, t, ph, u, P, A, sc, cs){
    const B = baked(R*sc), p = B.wings[1], G = RIG.slapGhosts(t, ph, A, P.gaze[0], P.gaze[1]), cur = RIG.slapWing(P, A.side);
    c.save(); c.translate(x, y); c.scale(R, R); c.globalCompositeOperation = 'lighter';
    G.forEach(({ w, al }) => { c.save(); c.transform(...w.m); c.globalAlpha = .7*al; lay(c, p); c.restore(); });
    c.restore();
    if (cur && G.length){ const W = RIG.whipArc(G[G.length - 1].w, cur), n = Math.max(2, Math.round(Math.abs(W.da)*W.r*R/(cs*1.5)));   // speed strokes along the tip's sweep, freshest brightest
      for (const [o, col] of [[0, WHITE], [-cs*1.5/R, DUST]]) for (let q = 0; q <= n; q++){ const v = q/n, a = W.a0 + W.da*v, rr = W.r + o;
        put(c, sc, edgeCh(a + Math.PI/2), col, x + (W.x + Math.cos(a)*rr)*R, y + (W.y + Math.sin(a)*rr)*R, cs*2.6, A.speed*(.3 + .7*v)*(o ? .6 : 1), false); } }
    draw(c, x, y, R, t, ph, P);
    const S = A.snap; if (!S || S.al < .02) return;
    const k = S.k, hx = Math.cos(S.a), hy = Math.sin(S.a);
    put(c, sc, '*', HOT, S.x, S.y, cs*(3 + 2*k), .7*S.al, true);
    put(c, sc, 'X', WHITE, S.x, S.y, cs*(3.2 - k), S.al, false);
    for (let j = -2; j <= 2; j++){ const a = S.a + j*.45, r0 = cs*1.6, r1 = r0 + (.25 + .35*k)*R;
      ray(c, sc, edgeCh(a), j ? WARN : WHITE, S.x, S.y, a, r0 + k*.2*R, r1, cs*1.8, cs*2.2, S.al*(j ? .8 : 1), false); }
    for (let j = 0; j < 4; j++) put(c, sc, "'.,`"[j], DUST, S.x + hx*(.2 + .45*k)*R + (hh(j, 31) - .5)*.4*R, S.y + hy*(.2 + .45*k)*R + (hh(j, 32) - .5)*.4*R, cs*2.4, S.al, false);
  }
  return {
    boss(c, x, y, R, t, ph = 3){ draw(c, x, y, R, t, ph, RIG.pose(t, ph)); },
    // is (x, y), in boss radii, on a wing's feathers in pose P (RIG.pose)? The hand stamps letters only there
    onWing: (P, x, y) => P.wings.some(w => { const [a, b, c, d, e, f] = w.m, k = a*d - b*c, X = x - e, Y = y - f, u = (d*X - c*Y)/k, v = (a*Y - b*X)/k;
      return BLADES[w.i].some(p => inside(p, u, v)); }),
    // attack(c, x, y, R, t, ph, atk, u, px, py): the boss in the rig's attack pose plus the effect on the rig's geometry
    attack(c, x, y, R, t, ph = 3, atk, u, px, py){
      const m = c.getTransform(), sc = Math.hypot(m.a, m.b) || 1, cs = R*CS, P = RIG.pose(t, ph, atk, u, (px - x)/R, (py - y)/R), A = RIG.attack(atk, u, ph, x, y, R, px, py, t, P);
      if (atk === 'slap') A.snap = RIG.slapSnap(A, u, 0, 0, 1);
      if (atk === 'tornado' && P.beats.spin > .01) P.ghosts = [1, 2, 3].map(k => RIG.pose(t, ph, atk, Math.max(0, u - .0035*k), (px - x)/R, (py - y)/R));
      ({ tornado, laser, wheel, recall, sword, slap }[atk] || blast)(c, x, y, R, t, ph, u, P, A, sc, cs);
      // the impact: a burst of light strokes thrown out round the boss on the rig's strike beat
      const imp = atk === 'wheel' || atk === 'sword' || atk === 'slap' ? 0 : P.beats.strike;   // the moving attacks and the slap draw their own impacts
      if (imp > .01) for (let k=0;k<24;k++){ const a = k/24*TAU, r0 = 1.45*R, r1 = r0 + (.5 + 1.1*imp)*R;
        ray(c, sc, edgeCh(a), k % 2 ? WARN : 'rgb(255,246,220)', x, y, a, r0, r1, cs*2.2, cs*2.6, .9*imp, false); }
      c.globalAlpha = 1;
    },
  };
})();
