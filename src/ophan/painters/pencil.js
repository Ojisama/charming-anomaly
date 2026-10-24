import { OPHAN, OPHAN_RIG, hh, mk, shade, mix, sheen, INK, TAU, PX, STY } from '../page.js'
// Phase 4: the Sketch. The Ophan as its first graphite drawing: six feathered wings and open eyes, nothing else.
// Shape and motion come from OPHAN_RIG (cru/rig.js) at ph 4 (= the ph 3 shape); this file only renders them in pencil.
// Each rig wing is baked once per size (texels per unit K) into one canvas: every rig feather a paper-filled blade, hatched on
// its trailing half, outlined twice like a committed pencil line. Per frame the wings only take the rig's transform, and the
// eyes are a few vector strokes so they blink and track continuously.
// Attacks are redrawn as pencil marks on the rig's danger geometry: the blast a hatched cone, the tornado a spiralling scribble
// travelling the shared road, the lasers ruled lines.
(() => {
  const RIG = OPHAN_RIG, PAPER = '#f2efe6', A3 = (a) => Math.max(0, Math.min(1, a)).toFixed(3), G = a => `rgba(38,38,46,${A3(a)})`, RED = a => `rgba(160,44,36,${A3(a)})`;   // A3: Pixi cannot parse 1e-7
  const cl = (v) => Math.min(1, Math.max(0, v)), sm = RIG.sm;

  // hatch the clipped region with parallel strokes at angle a (gap and lw in the current units)
  function hatch(g, cx, cy, rad, a, gap, alpha, lw, seed){
    g.strokeStyle = G(alpha); g.lineWidth = lw; g.beginPath();
    const c = Math.cos(a), s = Math.sin(a);
    for (let d = -rad, i = 0; d < rad; d += gap, i++){
      const j = (hh(i, seed) - .5)*gap*.5, x = cx - s*(d + j), y = cy + c*(d + j);
      g.moveTo(x - c*rad, y - s*rad); g.lineTo(x + c*rad*(.7 + hh(seed, i)*.3), y + s*rad*(.7 + hh(seed, i)*.3));
    }
    g.stroke();
  }
  // a committed pencil line: the same path stroked twice, slightly offset (j = the offset scale, ~1px)
  function sketch(g, pathFn, alpha, lw, seed, j = 1){
    for (let p = 0; p < 2; p++){
      g.save(); g.translate((hh(seed, p) - .5)*1.1*j, (hh(p + 7, seed) - .5)*1.1*j); pathFn();
      g.strokeStyle = G(alpha*(p ? .55 : 1)); g.lineWidth = lw*(p ? .7 : 1); g.stroke(); g.restore();
    }
  }

  // ---- the wings, baked from the rig's feathers (wing-local units -> texels)
  function boxOf(Wg, pad){ let x0 = 9, y0 = 9, x1 = -9, y1 = -9;
    for (const q of Wg.feathers.concat(Wg.coverts)) for (const [x, y] of q.l.concat(q.r)){ x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]; }
  // the sword (morph C): the feathers that peel off every wing (every third one, no talons), in the order they leave, both sides together
  const PEELS = (Wg) => Wg.feathers.filter((q, j) => j % 3 && !q.tal);
  const PEEL = []; for (let j = 0; j < 5; j++) for (const i of [0, 1, 2]) for (const side of [-1, 1]){ const q = PEELS(RIG.WINGS[i])[j]; if (q) PEEL.push({ i, side, q, n: RIG.WINGS[i].feathers.indexOf(q) }); }
  // one feather alone, in its wing-local units
  function bakeFeather(q, K, n){
    const C = { feathers: [q], coverts: [] }, [x0, y0, x1, y1] = boxOf(C, .04), cv = mk(Math.ceil((x1 - x0)*K), Math.ceil((y1 - y0)*K)), g = cv.getContext('2d');
    const P = ([x, y]) => [(x - x0)*K, (y - y0)*K];
    const poly = (pts, close = true) => { g.beginPath(); pts.forEach((p, i) => { const [X, Y] = P(p); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); if (close) g.closePath(); };
    g.lineCap = 'round'; g.lineJoin = 'round'; blade(g, P, poly, q, K, .35, 10 + n, false);
    return { cv, x0, y0, w: x1 - x0, h: y1 - y0 };
  }
  function bakeWing(Wg, K, gap, fin){
    const [x0, y0, x1, y1] = boxOf(Wg, .06), cv = mk(Math.ceil((x1 - x0)*K), Math.ceil((y1 - y0)*K)), g = cv.getContext('2d');
    const P = ([x, y]) => [(x - x0)*K, (y - y0)*K];
    const poly = (pts, close = true) => { g.beginPath(); pts.forEach((p, i) => { const [X, Y] = P(p); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); if (close) g.closePath(); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    const [rx, ry] = Wg.root, [, , ax, ay] = Wg.arm, dx = ax - rx, dy = ay - ry;
    // construction: the arm's axis, overshooting, and a loose line through the feather tips
    if (!fin){ g.strokeStyle = G(.13); g.lineWidth = .6; poly([[rx - dx*.3, ry - dy*.3], [ax + dx*.6, ay + dy*.6]], false); g.stroke();
    poly(Wg.feathers.map((q) => q.sp[10]), false); g.stroke(); }
    // the inner web, where the blades join: paper and a graphite smudge
    const web = [Wg.root].concat(Wg.feathers.map((q) => q.sp[Wg.pour]));
    poly(web); g.fillStyle = PAPER; if (!fin) g.fill();
    const [sx, sy] = P(Wg.feathers[Wg.pour].sp[2]), smg = g.createRadialGradient(sx, sy, 0, sx, sy, Wg.A*K*.8);
    smg.addColorStop(0, G(fin ? .22 : .14)); smg.addColorStop(1, G(0)); g.fillStyle = smg; g.fill();
    const n = Wg.feathers.length;
    const out = gap ? PEELS(Wg) : [];
    for (let k = n - 1; k >= 0; k--) if (!out.includes(Wg.feathers[k])) blade(g, P, poly, Wg.feathers[k], K, .2 + .3*(1 - k/(n - 1)), 10 + k, Wg.feathers[k].tal, fin);   // outer primaries under, inner on top
    Wg.coverts.forEach((q, k) => blade(g, P, poly, q, K, .55 - .25*k/(n - 1), 50 + k, false, fin));
    sketch(g, () => poly([Wg.root, Wg.arm.slice(2)], false), 1, (2.4 + K/80)*(fin ? 1.2 : 1), 90);   // the leading edge
    return { cv, x0, y0, w: x1 - x0, h: y1 - y0 };
  }
  // fin: the FINISHED pass the hand lays over the sketch, on transparent ground (each blade still hides the lines under it):
  // the shadow half hatched denser, crossed throughout, the contour re-traced harder
  function blade(g, P, poly, q, K, shade, seed, talon, fin){
    const out = q.l.concat(q.r.slice().reverse()), half = q.l.concat(q.sp.slice().reverse());
    poly(out); if (fin){ g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fill(); g.globalCompositeOperation = 'source-over'; } else { g.fillStyle = PAPER; g.fill(); }
    g.save(); poly(out); g.clip();
    const [cx, cy] = P(q.sp[5]), rr = q.L*K*.7;
    g.save(); poly(half); g.clip(); hatch(g, cx, cy, rr, q.a + .7, fin ? 1.6 : 2.2, (.3 + shade*.45)*(fin ? 1.3 : 1), .9, seed); g.restore();
    if (fin) hatch(g, cx, cy, rr, q.a - .5, 2.2, .2 + shade*.4, .8, seed + 3);
    else if (shade > .45) hatch(g, cx, cy, rr, q.a - .5, 2.8, (shade - .3)*.5, .8, seed + 3);
    if (talon){ const [bx, by] = P(q.sp[0]), [ex, ey] = P(q.sp[10]), gr = g.createLinearGradient(bx, by, ex, ey);
      gr.addColorStop(.55, G(0)); gr.addColorStop(.85, G(.55)); gr.addColorStop(1, G(.92)); g.fillStyle = gr; g.fillRect(cx - rr*1.6, cy - rr*1.6, rr*3.2, rr*3.2); }
    g.restore();
    sketch(g, () => poly(out), .97, (1.3 + K/120)*(fin ? 1.3 : 1), seed);
    poly(q.sp, false); g.strokeStyle = G(.6); g.lineWidth = .7 + K/240; g.stroke();   // rachis
  }
  // the rosette of the rig's short blades ringing the great eye, as small hatched pencil feathers
  function bakeCore(K, fin){
    const C = { feathers: RIG.CORE, coverts: [] }, [x0, y0, x1, y1] = boxOf(C, .06), cv = mk(Math.ceil((x1 - x0)*K), Math.ceil((y1 - y0)*K)), g = cv.getContext('2d');
    const P = ([x, y]) => [(x - x0)*K, (y - y0)*K];
    const poly = (pts, close = true) => { g.beginPath(); pts.forEach((p, i) => { const [X, Y] = P(p); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); if (close) g.closePath(); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    RIG.CORE.forEach((q, k) => blade(g, P, poly, q, K, .35, 100 + k, false, fin));
    return { cv, x0, y0, w: x1 - x0, h: y1 - y0 };
  }
  // construction marks on the paper, under the wings: two loose circles, the axes, short ruled rays from the great eye
  function bakeBase(K){
    const S = 3.2, cv = mk(Math.ceil(S*K), Math.ceil(S*K)), g = cv.getContext('2d'); g.setTransform(K, 0, 0, K, S/2*K, S/2*K);
    const E = RIG.EYE; g.lineCap = 'round'; g.strokeStyle = G(.12); g.lineWidth = .6/K; g.beginPath();
    g.arc(E.x, E.y, 1.42, 0, TAU); g.moveTo(E.x + .98, E.y); g.arc(E.x, E.y, .98, 0, TAU);
    g.moveTo(0, -1.55); g.lineTo(0, 1.55); g.moveTo(-1.55, E.y); g.lineTo(1.55, E.y); g.stroke();
    g.strokeStyle = G(.1); g.lineWidth = .5/K; g.beginPath();
    for (let i = 0; i < 28; i++){ const a = i/28*TAU, r0 = .42, r1 = .62 + hh(i, 2)*.3; g.moveTo(E.x + Math.cos(a)*r0, E.y + Math.sin(a)*r0); g.lineTo(E.x + Math.cos(a)*r1, E.y + Math.sin(a)*r1); }
    g.stroke();
    // the nimbus, the one construction circle pressed hard: the ring every later phase is drawn round
    const H = RIG.HALO; sketch(g, () => { g.beginPath(); g.arc(H.x, H.y, H.r, 0, TAU); }, .8, 2.2/K, 9, 1/K);
    return { cv, x0: -S/2, y0: -S/2, w: S, h: S };
  }
  const cache = new Map();
  // a bake's black copy (its alpha kept): drawn over it at alpha 1 - b it is the approved brightness(b) filter, which game tech drops
  const dark = (L) => { const cv = mk(L.cv.width, L.cv.height), g = cv.getContext('2d'); g.drawImage(L.cv, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height); L.dk = { cv, x0: L.x0, y0: L.y0, w: L.w, h: L.h }; return L; };
  function rig(K){ let r = cache.get(K); if (!r){ r = { wings: RIG.WINGS.map((Wg) => dark(bakeWing(Wg, K))), base: bakeBase(K), core: bakeCore(K),
      rag: RIG.WINGS.map((Wg) => dark(bakeWing(Wg, K, true))), fe: RIG.WINGS.map((Wg) => Wg.feathers.map((q, n) => PEELS(Wg).includes(q) ? dark(bakeFeather(q, K, n)) : null)),   // the sword's ragged wings and loose feathers
      fw: RIG.WINGS.map((Wg) => dark(bakeWing(Wg, K, false, true))), fc: bakeCore(K, true) }; cache.set(K, r); }   // the finished pass
    return r; }
  const lay = (c, L) => c.drawImage(L.cv, L.x0, L.y0, L.w, L.h);

  // an eye, drawn live: almond lids (open 0..1), faint red-pencil iris, pupil turned toward (gx, gy) (a unit direction)
  function eye(c, x, y, r, rot, open, gx, gy, big, sx = 1){
    c.save(); c.translate(x, y); c.scale(Math.max(.05, sx), 1); c.rotate(rot);
    const h = r*.62*open, lw = big ? 2.1 : 1.35;
    c.beginPath(); c.moveTo(-r, 0); c.quadraticCurveTo(0, -h*1.6, r, 0); c.quadraticCurveTo(0, h*1.6, -r, 0);
    c.fillStyle = PAPER; c.fill();
    if (open > .08){
      c.save(); c.clip();
      const cs = Math.cos(-rot), sn = Math.sin(-rot), px = (gx*cs - gy*sn)*r*.38, py = (gx*sn + gy*cs)*r*.25;
      c.beginPath(); c.arc(px, py, r*.5, 0, TAU); c.fillStyle = 'rgba(178,52,44,.16)'; c.fill();
      c.strokeStyle = G(.75); c.lineWidth = lw*.8; c.stroke();
      c.strokeStyle = RED(.55); c.lineWidth = big ? .7 : .5; c.beginPath();
      for (let i = 0, N = big ? 22 : 10; i < N; i++){ const a = i/N*TAU; c.moveTo(px + Math.cos(a)*r*.2, py + Math.sin(a)*r*.2); c.lineTo(px + Math.cos(a)*r*.46, py + Math.sin(a)*r*.46); } c.stroke();
      c.beginPath(); c.arc(px, py, r*.2, 0, TAU); c.fillStyle = G(.9); c.fill();
      c.beginPath(); c.arc(px - r*.08, py - r*.09, r*.065, 0, TAU); c.fillStyle = PAPER; c.fill();
      c.restore();
    }
    c.strokeStyle = G(.88); c.lineWidth = lw;
    c.beginPath(); c.moveTo(-r*1.08, h*.05); c.quadraticCurveTo(0, -h*1.66, r*1.06, -h*.05); c.stroke();      // heavy upper lid
    c.lineWidth = lw*.6; c.beginPath(); c.moveTo(-r, 0); c.quadraticCurveTo(0, h*1.6, r, 0); c.stroke();
    c.restore();
  }

  // the body at a rig pose: construction marks, the six wings, then every eye on top
  function draw(c, x, y, R, P, opt){
    const m = c.getTransform(), s = Math.hypot(m.a, m.b), K = Math.max(40, Math.min(320, Math.round(R*s/8)*8)), Gk = rig(K), FIN = !!(opt && opt.fin), B = P.body, py = B.pivot[1];
    const fc = B.face ?? 1, ax = Math.abs(B.sx), frame = () => { c.save(); c.translate(x, y); c.scale(R, R); c.translate(B.ox || 0, B.oy || 0);   // the top's wobble and the body's travel (wheel, sword), screen space, first
      c.translate(0, py); c.scale(B.sx, B.sy); c.rotate(B.rot); c.translate(0, -py); };
    // a wing in the top's depth: behind the body it greys and darkens with how far back it is, in front it lifts a touch
    const wing = (w, al) => { const [rx, ry] = RIG.WINGS[w.i].root, dp = w.depth || 0;
      c.save();
      if (w.K){ c.setTransform(m.translate(x, y).scale(R, R)); c.transform(...w.m); }   // the sword: its wing matrix, held open (sw.wings)
      else { c.translate(w.side*rx, ry); c.scale(w.side, 1); c.rotate(w.rot); c.scale(w.scale, w.scale); c.translate(-rx, -ry); }
      const a = w.vis*al, put = (L) => { c.globalAlpha = a; lay(c, L);
        if (dp < -.05){ c.globalAlpha = a*.4*(-dp); lay(c, L.dk); }
        else if (dp > .05){ c.globalCompositeOperation = 'lighter'; c.globalAlpha = a*.05*dp; lay(c, L); c.globalCompositeOperation = 'source-over'; } };
      put(w.gap ? Gk.rag[w.i] : FIN ? Gk.fw[w.i] : Gk.wings[w.i]);
      if (w.gap) for (const n of w.homes) put(Gk.fe[w.i][n]);   // the peeled feathers still (or back) in their place
      c.restore(); };
    const back = P.wings.filter((w) => !(w.depth > .001)), front = P.wings.filter((w) => w.depth > .001);
    if (opt && opt.ghost){ frame(); c.translate(B.dx, B.dy); for (const w of back.concat(front)) wing(w, opt.ghost); c.restore(); return; }
    const look = (ex, ey) => { const dx = P.gaze[0] - ex, dy = P.gaze[1] - ey, l = Math.hypot(dx, dy) || 1; return [dx/l, dy/l]; };
    const eyesOf = (ws) => { for (const w of ws) for (const E of w.eyes){ if (E.open < .01) continue;
      const M = w.m, ex = M[0]*Math.cos(E.rot) + M[2]*Math.sin(E.rot), ey = M[1]*Math.cos(E.rot) + M[3]*Math.sin(E.rot), [gx, gy] = look(E.x, E.y);
      eye(c, x + E.x*R, y + E.y*R, E.r*1.15*R, Math.atan2(ey, ex), Math.min(1.1, E.open), gx, gy, false, ax); } };
    frame(); if (!FIN) lay(c, Gk.base); c.translate(B.dx, B.dy); for (const w of back) wing(w, 1); c.restore();
    eyesOf(back);
    frame(); c.translate(B.dx, B.dy); lay(c, FIN ? Gk.fc : Gk.core);
    if (fc < 0){ const k = cl(-3*fc), E = RIG.EYE;   // the back of the body: a sewn seam where the great eye would be, hatched shut
      c.save(); c.beginPath(); c.ellipse(E.x, E.y, .4, .22, 0, 0, TAU); c.globalAlpha = k; c.fillStyle = PAPER; c.fill(); c.clip();
      hatch(c, E.x, E.y, .45, .8, .035, .7, .012, 170); hatch(c, E.x, E.y, .45, -.6, .05, .45, .01, 171); c.restore();
      c.globalAlpha = k; sketch(c, () => { c.beginPath(); c.ellipse(E.x, E.y, .4, .22, 0, 0, TAU); }, .9, .028, 172, .01);
      c.strokeStyle = G(.9); c.lineWidth = .03; c.beginPath(); c.moveTo(E.x, E.y - .62); c.lineTo(E.x, E.y + .55);
      for (let i = -4; i <= 4; i++){ const Y = E.y + i*.12; c.moveTo(E.x - .06, Y - .02); c.lineTo(E.x + .06, Y + .02); } c.stroke(); c.globalAlpha = 1; }
    for (const w of front) wing(w, 1); c.restore();
    eyesOf(front);
    const Eg = P.eye, [gx, gy] = look(Eg.x, Eg.y);   // the great eye: sealed (a pencilled seam) until ph 2, then open, unblinking
    if (fc > 0) eye(c, x + Eg.x*R, y + Eg.y*R, Eg.r*1.15*R, 0, Math.min(1.15, Eg.open), gx, gy, true, ax);
  }

  // ---- THE ATTACKS, in pencil on the rig's geometry (c in boss units, u1 = one CSS pixel)
  function under(c, atk, A, t, u1, u){
    if (atk === 'blast'){
      // TELEGRAPH: the strike's cone ruled ahead in faint red-pencil dashes (start half-angle, out to the final front), handed to the hatched cone at u .5
      const tk = cl((u - .05)/.35)*(1 - cl((u - .47)/.06));
      if (tk > .01){ const phi = A.dir, hw = .5, F = 4.2, dl = .5 + .5*Math.sin(t*5);
        c.strokeStyle = RED(.4*tk); c.lineWidth = 1.2*u1; c.beginPath();   // dashes .16 on, .08 off, marching outward along each stroke
        const off = (t*1.6) % .24, dash = (pt, L0) => { for (let d = -off; d < L0; d += .24){ const d0 = Math.max(0, d), d1 = Math.min(L0, d + .16); if (d1 <= d0) continue;
          const N = Math.max(1, Math.ceil((d1 - d0)/.04)); for (let i = 0; i <= N; i++){ const [X, Y] = pt(d0 + (d1 - d0)*i/N); i ? c.lineTo(X, Y) : c.moveTo(X, Y); } } };
        for (const a of [phi - hw, phi + hw]) dash((d) => [Math.cos(a)*(.3 + d), Math.sin(a)*(.3 + d)], F - .3);
        dash((d) => [Math.cos(phi - hw + d/F)*F, Math.sin(phi - hw + d/F)*F], 2*hw*F); c.stroke();
        c.strokeStyle = RED(.25*tk*(.6 + .4*dl)); c.lineWidth = .9*u1; c.beginPath(); const F2 = F*(.35 + .6*tk); dash((d) => [Math.cos(phi - hw + d/F2)*F2, Math.sin(phi - hw + d/F2)*F2], 2*hw*F2); c.stroke(); }
      // WINDUP: loose graphite beads drawn in toward the bud, each with a speed line
      for (const b of A.suck){ const dx = b.x, dy = b.y + .1, l = Math.hypot(dx, dy) || 1;
        c.strokeStyle = G(.55*b.al); c.lineWidth = .8*u1; c.beginPath(); c.moveTo(b.x + dx/l*b.r*1.4, b.y + dy/l*b.r*1.4); c.lineTo(b.x + dx/l*(b.r + .16), b.y + dy/l*(b.r + .16)); c.stroke();
        c.beginPath(); c.arc(b.x, b.y, b.r*.8, 0, TAU); c.fillStyle = G(.18*b.al); c.fill(); c.strokeStyle = G(.85*b.al); c.lineWidth = 1*u1; c.stroke(); }
      if (A.shock){ const { x, y, r, al } = A.shock; sketch(c, () => { c.beginPath(); c.arc(x, y, r, 0, TAU); }, .95*al, 2.2*u1, 61, u1); }
      if (A.sheet){ const { front, half: hw, dir: phi, fade } = A.sheet, r0 = Math.max(.5, front - 1.3);
        // STRIKE: the cone, ruled from the apex, its body hatched across the direction of travel, cross-hatched at the crest
        c.save(); c.beginPath(); c.moveTo(Math.cos(phi - hw)*.3, Math.sin(phi - hw)*.3); c.arc(0, 0, front, phi - hw, phi + hw); c.lineTo(Math.cos(phi + hw)*.3, Math.sin(phi + hw)*.3); c.closePath(); c.clip();
        hatch(c, Math.cos(phi)*front/2, Math.sin(phi)*front/2, front, phi + .9, 3.4*u1, 0, 1.2*u1, 75); c.strokeStyle = RED(.38*fade); c.stroke();   // the whole cone, red pencil
        const smg = c.createRadialGradient(0, 0, r0, 0, 0, front + .25); smg.addColorStop(0, G(0)); smg.addColorStop(.6, G(.22*fade)); smg.addColorStop(.92, G(.4*fade)); smg.addColorStop(1, G(0));
        c.fillStyle = smg; c.fillRect(-front - .3, -front - .3, 2*front + .6, 2*front + .6); c.restore();   // the charcoal smudge the band drags over the floor
        c.strokeStyle = RED(.85*fade); c.lineWidth = 1.4*u1; c.beginPath();
        for (const a of [phi - hw, phi + hw]){ c.moveTo(Math.cos(a)*.3, Math.sin(a)*.3); c.lineTo(Math.cos(a)*(front + .15), Math.sin(a)*(front + .15)); } c.stroke();
        c.save(); c.beginPath(); c.arc(0, 0, front, phi - hw, phi + hw); c.arc(0, 0, r0, phi + hw, phi - hw, true); c.closePath(); c.clip();
        const cx = Math.cos(phi)*(r0 + front)/2, cy = Math.sin(phi)*(r0 + front)/2;
        hatch(c, cx, cy, front, phi + Math.PI/2 + .35, 2.6*u1, .7*fade, 1.1*u1, 71); hatch(c, cx, cy, front, phi + .3, 3.4*u1, .4*fade, .9*u1, 72);
        c.beginPath(); c.arc(0, 0, front, phi - hw, phi + hw); c.arc(0, 0, Math.max(r0, front - .45), phi + hw, phi - hw, true); c.closePath(); c.clip();
        hatch(c, cx, cy, front, phi + Math.PI/2 - .45, 1.8*u1, .9*fade, 1.3*u1, 73); hatch(c, cx, cy, front, phi - .5, 2.2*u1, .7*fade, 1*u1, 74);
        c.restore();
        for (const { r, a0, a1, f, j } of A.sheet.crests) sketch(c, () => { c.beginPath(); c.arc(0, 0, r, a0, a1); }, (j ? .7 : 1)*f, (3.6 - .8*j)*u1, 80 + j, u1);
        // the lip breaks up: graphite flecks flung ahead, each with its speed line
        c.strokeStyle = G(.7*fade); c.lineWidth = 1.1*u1; c.beginPath();
        for (const { x: X, y: Y, a, tl } of A.sheet.drops){ c.moveTo(X, Y); c.lineTo(X - Math.cos(a)*tl, Y - Math.sin(a)*tl); } c.stroke();
        c.fillStyle = G(.95*fade); c.beginPath(); for (const { x: X, y: Y, z } of A.sheet.drops){ c.moveTo(X + z*.6, Y); c.arc(X, Y, z*.6, 0, TAU); } c.fill(); }
    } else if (atk === 'tornado'){
      // the floor marks, UNDER the boss (rig rule): the end pool, the trail, the smudge and ring at the funnel's foot
      const L = A.alive, d = A.collapse, { x: bx, y: by } = A.pos, sc = A.scale, al = L*(1 - .5*d);
      if (A.pool > .01) pool(c, bx, by, A.pool, .62*Math.sqrt(A.pool), 120, u1);   // the end of it: the spiral slumps into a hatched pool
      if (L > .01 && u > .45){   // the trail the scribble leaves on the floor, smudged behind it
        c.strokeStyle = G(.22*L); c.lineWidth = 12*u1; c.beginPath(); A.trail.forEach(({ x: X, y: Y }, k) => k ? c.lineTo(X, Y) : c.moveTo(X, Y)); c.stroke();
        for (let k=0;k<10;k++){ const f = (k + 1)/10, p0 = A.trail[k], p1 = A.trail[k + 1]; c.strokeStyle = G(.75*L*Math.sin(Math.PI*Math.min(1, f*1.15))); c.lineWidth = (.6 + 1.4*f)*u1;
          c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke(); } }
      if (L > .01){
        c.save(); c.translate(bx, by); c.scale(1, .34); const fr = .6*sc*(1 + d), sg = c.createRadialGradient(0, 0, 0, 0, 0, fr);
        sg.addColorStop(0, G(.5*al)); sg.addColorStop(.6, G(.3*al)); sg.addColorStop(1, G(0)); c.fillStyle = sg; c.beginPath(); c.arc(0, 0, fr, 0, TAU); c.fill(); c.restore();   // the charcoal smudge under it
        c.save(); c.translate(bx, by); c.scale(1, .34); c.strokeStyle = G(.35*al); c.lineWidth = 1*u1; c.beginPath(); c.arc(0, 0, .3*sc*(1 + d), 0, TAU); c.stroke(); c.restore();
      }
      // the wind the spin drags round it: quick curved strokes
      const sp = A.wind;
      if (sp > .02) for (let i=0;i<3;i++){ const a0 = A.spin*1.1 + i*TAU/3 + .4;
        for (let k=0;k<4;k++){ const f = k/4; c.strokeStyle = G(.5*sp*(1 - f)); c.lineWidth = (1.6 - f)*u1;
          c.beginPath(); c.arc(0, -.1, 1.5 - .04*k, a0 - (f + 1/4)*1.1*sp, a0 - f*1.1*sp); c.stroke(); } }
    }
  }
  // the vortex as one continuous graphite spiral up a cone (the rig's scale and collapse), the near side pressed harder
  function scribble(c, bx, by, sc, t, L, d, u1){
    const ring = (h) => { const lean = .25*h*h*Math.sin(t*1.1), rx = (.16 + .78*Math.pow(h, 1.4))*sc*(1 + d*.7); return [bx + lean*(1 - d), by - h*1.4*sc*(1 - .92*d), rx, rx*.3]; };
    const N = 84, turns = 6.5, sp = t*7, al = L*(1 - .5*d);
    // the column smudged in with the side of the lead, under the spiral
    c.beginPath(); for (let k=0;k<=12;k++){ const [x0, y0, a0] = ring(k/12); k ? c.lineTo(x0 - a0, y0) : c.moveTo(x0 - a0, y0); }
    for (let k=12;k>=0;k--){ const [x0, y0, a0] = ring(k/12); c.lineTo(x0 + a0, y0); } c.closePath(); c.fillStyle = G(.4*al); c.fill();
    c.save(); c.clip(); const hy = by - .7*sc, hr = 1.1*sc;   // the funnel's volume: dense cross-hatching, darker down the shadow side
    hatch(c, bx, hy, hr, .9, 2*u1, .75*al, 1*u1, 160); hatch(c, bx, hy, hr, -.7, 2.6*u1, .55*al, .9*u1, 161);
    c.beginPath(); c.rect(bx, hy - hr, hr, 2*hr); c.clip(); hatch(c, bx, hy, hr, .15, 1.8*u1, .7*al, 1*u1, 162); c.restore();
    for (let p = 0; p < 2; p++){ const o = p*.012;
      for (const front of [false, true]){ c.beginPath();
        for (let k=0;k<N;k++){ const h0 = k/N, h1 = (k + 1)/N, [x0, y0, a0, b0] = ring(h0), [x1, y1, a1, b1] = ring(h1), t0 = h0*turns*TAU + sp*(1.6 - h0*.8), t1 = h1*turns*TAU + sp*(1.6 - h1*.8);
          if ((Math.sin((t0 + t1)/2) > 0) !== front) continue;
          c.moveTo(x0 + Math.cos(t0)*a0 + o, y0 + Math.sin(t0)*b0 + o); c.lineTo(x1 + Math.cos(t1)*a1 + o, y1 + Math.sin(t1)*b1 + o); }
        c.strokeStyle = G(al*(front ? 1 : .4)*(p ? .6 : 1)); c.lineWidth = (front ? 2.4 : 1.1)*(p ? .7 : 1)*u1; c.stroke(); } }
    const [tx, ty, trx, tr2] = ring(1); c.strokeStyle = G(.85*al); c.lineWidth = 1.6*u1; c.beginPath(); c.ellipse(tx, ty, trx, tr2, 0, 0, TAU); c.stroke();
  }
  // a pool of graphite: a hatched ellipse with a pencilled rim
  function pool(c, X, Y, k, rx, seed, u1){
    c.save(); c.translate(X, Y); c.scale(1, .38); const sg = c.createRadialGradient(0, 0, rx*.6, 0, 0, rx*1.5); sg.addColorStop(0, G(.4*k)); sg.addColorStop(1, G(0));
    c.fillStyle = sg; c.beginPath(); c.arc(0, 0, rx*1.5, 0, TAU); c.fill(); c.restore();
    c.save(); c.translate(X, Y); c.scale(1, .38); c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fillStyle = PAPER; c.fill(); c.clip();
    hatch(c, 0, 0, rx, .7, 2.4*u1, .8*k, 1*u1, seed); hatch(c, 0, 0, rx, -.6, 3*u1, .55*k, .9*u1, seed + 1); c.restore();
    c.save(); c.translate(X, Y); c.scale(1, .38); sketch(c, () => { c.beginPath(); c.arc(0, 0, rx, 0, TAU); }, .8*k, 1.4*u1, seed + 2, u1); c.restore();
  }
  // the lasers, a heat ray (owner: War of the Worlds): four ruled rays from the eyes to ground points that walk together,
  // lane by lane, from the boss's feet through the player and on past them. FLOOR (under the boss): the aim's floor part, the
  // scorched lanes, the burn's smudge. OVER the boss: the rays, the splash where they touch, sparks and smoke.
  function laserFloor(c, A, t, u, u1){
    const { fire, scorch, pool: pk } = A, s = A.sweep;
    aimFx(c, A, t, u, u1, 'floor');
    A.beams.forEach(({ start: S, end: E }, i) => {
      const L = Math.hypot(E.x - S.x, E.y - S.y);
      if (s > 0 && scorch > .01 && L > .02){   // SCORCH: the lane burnt from where it started to the point, cooling behind it
        const g = c.createLinearGradient(S.x, S.y, E.x, E.y); g.addColorStop(0, G(.18*scorch)); g.addColorStop(Math.max(0, 1 - .6/L), G(.45*scorch)); g.addColorStop(1, G(.75*scorch));
        c.strokeStyle = g; c.lineWidth = 4*u1; c.beginPath(); c.moveTo(S.x, S.y); c.lineTo(E.x, E.y); c.stroke();
        sketch(c, () => { c.beginPath(); c.moveTo(S.x, S.y); c.lineTo(E.x, E.y); }, .85*scorch, 2*u1, 150 + i, u1);
        const dx = (E.x - S.x)/L, dy = (E.y - S.y)/L; c.strokeStyle = G(.5*scorch); c.lineWidth = .8*u1; c.beginPath();   // charred cross-hatching along the burn
        for (let f = .04*hh(i, 6); f < L; f += .06){ const X = S.x + dx*f, Y = S.y + dy*f, w = .06 + .03*hh(i, f*50); c.moveTo(X - dy*w - dx*.03, Y + dx*w - dy*.03); c.lineTo(X + dy*w + dx*.03, Y - dx*w + dy*.03); } c.stroke();
        const hl = Math.min(L, .7), hx = E.x - dx*hl, hy = E.y - dy*hl, gr = c.createLinearGradient(hx, hy, E.x, E.y);   // still hot near the point: red pencil
        gr.addColorStop(0, RED(0)); gr.addColorStop(1, RED(.75*scorch*Math.max(fire, .3))); c.strokeStyle = gr; c.lineWidth = 2.4*u1; c.beginPath(); c.moveTo(hx, hy); c.lineTo(E.x, E.y); c.stroke(); }
      if (fire > .01){ const fl = .8 + .2*Math.sin(t*23 + i*1.7);   // the burn's smudge on the floor round the point
        const sg = c.createRadialGradient(E.x, E.y, 0, E.x, E.y, .34); sg.addColorStop(0, G(.5*fire*fl)); sg.addColorStop(.5, RED(.3*fire)); sg.addColorStop(1, G(0));
        c.fillStyle = sg; c.beginPath(); c.arc(E.x, E.y, .34, 0, TAU); c.fill(); }
      if (pk > .01) pool(c, E.x, E.y, pk, .3*Math.sqrt(pk), 130 + i*3, u1);
    });
  }
  // AIM, STIPPLED LANES (the pencil cousin of ascii's typed dots and pixel's ember lanes): each lane the ray will walk is
  // dotted in lightly on the paper, a run of pressed stipples marching away from the boss and fading with distance
  function aimFx(c, A, t, u, u1, layer){
    const aim = A.aim, T = A.track; if (aim < .01 || layer !== 'floor') return;
    for (const off of T.lanes){ const sx = T.start.x + T.nx*off, sy = T.start.y + T.ny*off;
      for (let d = 0, k = 0; d <= T.len; d += .09, k++){ const pu = .5 + .5*Math.sin(k*.9 - t*7), fade = 1 - .65*d/T.len, j = (hh(k, off*40) - .5)*.02;
        c.fillStyle = G(aim*(.12 + .3*pu)*fade); c.beginPath(); c.arc(sx + T.dx*d + T.nx*j, sy + T.dy*d + T.ny*j, .014 + .008*pu, 0, TAU); c.fill();
        if (pu > .93){ c.fillStyle = RED(.4*aim*fade); c.beginPath(); c.arc(sx + T.dx*d, sy + T.dy*d, .02, 0, TAU); c.fill(); } } }
  }
  function laserRays(c, A, t, u, u1){
    const fire = A.fire; aimFx(c, A, t, u, u1, 'over');
    A.beams.forEach(({ x: ex, y: ey, a, len, w, end }, i) => {
      const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
      if (fire > .01){ const W = Math.max(w, 1.5*u1), fl = .8 + .2*Math.sin(t*23 + i*1.7);
        // the ruler's two edges, the strokes between them laid in hard, a red-pencil core
        c.strokeStyle = G(.9*fire); c.lineWidth = 1.2*u1; c.beginPath();
        for (const sd of [-1, 1]){ c.moveTo(ex + nx*W*sd, ey + ny*W*sd); c.lineTo(end.x + nx*W*sd, end.y + ny*W*sd); } c.stroke();
        c.strokeStyle = G(.55*fire); c.lineWidth = .7*u1; c.beginPath();
        for (let f = (t*.6)%.05; f < len; f += .05){ const X = ex + dx*f, Y = ey + dy*f; c.moveTo(X + nx*W - dx*.03, Y + ny*W - dy*.03); c.lineTo(X - nx*W + dx*.03, Y - ny*W + dy*.03); } c.stroke();
        c.strokeStyle = RED(.75*fire); c.lineWidth = 1*u1; c.beginPath(); c.moveTo(ex, ey); c.lineTo(end.x, end.y); c.stroke();
        // IMPACT: the splash where the ray burns the floor. A pressed blot with the paper left white at its heart, a flickering
        // red-pencil starburst, graphite sparks flung up and back, and smoke curling off behind the point
        c.fillStyle = G(.92*fire); c.beginPath(); c.ellipse(end.x, end.y, .12*fl, .08*fl, 0, 0, TAU); c.fill();
        c.fillStyle = RED(.9*fire); c.beginPath(); c.ellipse(end.x, end.y, .085*fl, .055*fl, 0, 0, TAU); c.fill();
        c.fillStyle = PAPER; c.beginPath(); c.ellipse(end.x, end.y, .05*fl, .033*fl, 0, 0, TAU); c.fill();
        c.strokeStyle = RED(.9*fire); c.lineWidth = 1.6*u1; c.beginPath();
        for (let k=0;k<9;k++){ const b = k/9*TAU + hh(k, i + 3)*.5 + t*.7, r = (.18 + .2*hh(k, i + 9))*(.6 + .4*Math.sin(t*17 + k*2.3)); c.moveTo(end.x + Math.cos(b)*.13, end.y + Math.sin(b)*.13*.6); c.lineTo(end.x + Math.cos(b)*(.13 + r), end.y + Math.sin(b)*(.13 + r)*.6); }
        c.stroke();
        const dots = []; c.strokeStyle = G(.75*fire); c.lineWidth = .9*u1; c.beginPath();
        for (let k=0;k<7;k++){ const f = (t*2.2 + hh(k, i + 21)) % 1, b = a + Math.PI + (hh(k, i + 22) - .5)*2.2, v = .35 + .35*hh(k, i + 23);
          const X = end.x + Math.cos(b)*v*f, Y = end.y + Math.sin(b)*v*f*.6 - 1.2*f*(1 - f), vx = Math.cos(b)*v, vy = Math.sin(b)*v*.6 - 1.2*(1 - 2*f), vl = Math.hypot(vx, vy) || 1;
          c.moveTo(X, Y); c.lineTo(X - vx/vl*.09, Y - vy/vl*.09); dots.push([X, Y, 1 - f]); }
        c.stroke(); for (const [X, Y, k] of dots){ c.fillStyle = G(.9*fire*k); c.beginPath(); c.arc(X, Y, .022, 0, TAU); c.fill(); }
        c.lineWidth = .8*u1; for (let j=0;j<3;j++){ const f = (t*.9 + j/3 + hh(i, 31))%1, r = .05 + .14*f, X = end.x - dx*.15*f + .06*Math.sin(t*2 + j*2), Y = end.y - .45*f;
          c.strokeStyle = G(.5*fire*Math.sin(Math.PI*f)); c.beginPath(); c.ellipse(X, Y, r, r*.7, t + j, 0, TAU*.8); c.stroke(); } }
      // RECOVERY: smudged eraser smoke curling off the spent eyes
      const sm2 = A.smoke;
      if (sm2 > .01){ c.lineWidth = .8*u1; for (let j=0;j<4;j++){ const f = (t*.6 + j/4)%1, r = .06 + .16*f, X = ex + .08*Math.sin(t*1.3 + j*2) + Math.sign(ex)*.3*f, Y = ey - .6*f;
        c.strokeStyle = G(.4*sm2*Math.sin(Math.PI*Math.sqrt(f))); c.beginPath(); c.ellipse(X, Y, r, r*.7, t + j, 0, TAU*.85); c.stroke(); } }
    });
  }

  // the top's spin, in pencil (tornado only): layer 'back' goes under the boss, 'front' over it
  function spinFx(c, P, t, u, u1, layer){
    const Bd = P.body, sp = P.beats.spin, ox = (Bd.ox || 0) + Bd.dx, oy = Bd.pivot[1] + Bd.dy, yw = Bd.yaw || 0, rx = 1.55, ry = .32, dy0 = .05;
    const isBack = layer === 'back', inHalf = (a) => (Math.sin(a) < 0) === isBack;
    if (sp > .03){
      // the spin disc: a soft graphite band at wing-tip radius, and speed streaks running round it
      c.save(); c.translate(ox, oy + dy0); c.scale(1, ry/rx);
      c.strokeStyle = G(.16*sp); c.lineWidth = .18; c.beginPath(); c.arc(0, 0, rx, isBack ? Math.PI : 0, isBack ? TAU : Math.PI); c.stroke();
      for (let k = 0; k < 9; k++){ const a1 = -yw*.5 + k*TAU/9 + hh(k, 51)*.4, len = (.5 + .5*hh(k, 52))*1.4*sp, r = rx*(.92 + .14*hh(k, 53));
        for (let j = 0; j < 4; j++){ const f = j/4, b0 = a1 + len*f, b1 = a1 + len*(f + .25), m = (b0 + b1)/2; if (!inHalf(m)) continue;
          c.strokeStyle = G(.8*sp*(1 - f)*(isBack ? .55 : 1)); c.lineWidth = (2.4 - 1.7*f)*u1*2;
          c.beginPath(); c.arc(0, 0, r, b0, b1); c.stroke(); } }
      c.restore();
      if (isBack){   // dust scuffed up under the spinning tip: a smudge and short scratches circling the point
        const gx = ox, gy = 1.12 + Bd.dy, dr = .2 + .45*sp;
        c.save(); c.translate(gx, gy); c.scale(1, .28); const sg = c.createRadialGradient(0, 0, 0, 0, 0, dr*1.3); sg.addColorStop(0, G(.4*sp)); sg.addColorStop(1, G(0));
        c.fillStyle = sg; c.beginPath(); c.arc(0, 0, dr*1.3, 0, TAU); c.fill();
        c.strokeStyle = G(.7*sp); c.lineWidth = 1.6*u1; c.beginPath();
        for (let k = 0; k < 14; k++){ const a = -yw*.3 + k*TAU/14, r = dr*(.8 + .3*hh(k, 54)); c.moveTo(Math.cos(a)*r, Math.sin(a)*r); c.arc(0, 0, r, a, a + .35); }
        c.stroke(); c.restore(); }
      else {
        // the vortex wrapping the body: two spiral bands sliding round its front, feeding the funnel
        for (const [by, br, k0] of [[-.6, .95, 0], [.42, 1.05, 2]]){ c.save(); c.translate(ox, oy + by); c.scale(1, .17);
          for (let j = 0; j < 3; j++){ const a0 = -yw*.5 + k0 + j*2.1; for (let q = 0; q < 5; q++){ const b0 = a0 + q*.3, b1 = b0 + .3, m = (b0 + b1)/2; if (Math.sin(m) < 0) continue;
            c.strokeStyle = G(.55*sp*Math.sin(Math.PI*(q + .5)/5)); c.lineWidth = 2.5*u1; c.beginPath(); c.arc(0, 0, br, b0, b1); c.stroke(); } }
          c.restore(); }
        // graphite flecks flung off the rim, tangent to the turn, left and right
        const dots = []; c.lineWidth = 1*u1; c.beginPath();
        for (let k = 0; k < 16; k++){ const f = (t*1.7 + hh(k, 55)) % 1, a = hh(k, 56)*TAU, px0 = Math.cos(a)*rx, py0 = Math.sin(a)*ry, tx = -Math.sin(a)*rx, ty = Math.cos(a)*ry, tl = Math.hypot(tx, ty);
          const X = ox + px0 + tx/tl*f*1.1, Y = oy + dy0 + py0 + ty/tl*f*1.1 - .3*f*f, al = sp*(1 - f); if (al < .05) continue;
          c.moveTo(X, Y); c.lineTo(X - tx/tl*.2*al, Y - ty/tl*.2*al); dots.push([X, Y, al]); }
        c.strokeStyle = G(.6*sp); c.stroke();
        for (const [X, Y, al] of dots){ c.fillStyle = G(.85*al); c.beginPath(); c.arc(X, Y, .025, 0, TAU); c.fill(); } } }
    const fl = P.beats.flash;
    if (fl > .02 && !isBack){   // the launch at peak spin: a shock ring thrown out flat round the top, radial strokes on it
      const rr = 1 + 1.1*(1 - fl); c.save(); c.translate(ox, oy + dy0); c.scale(1, .42); c.strokeStyle = G(.85*fl); c.lineWidth = 1.8*u1; c.beginPath();
      for (let k = 0; k < 22; k++){ const a = k/22*TAU + hh(k, 57)*.2, r0 = rr*.82, r1 = rr*(1.02 + .2*hh(k, 58)); c.moveTo(Math.cos(a)*r0, Math.sin(a)*r0); c.lineTo(Math.cos(a)*r1, Math.sin(a)*r1); }
      c.stroke(); sketch(c, () => { c.beginPath(); c.arc(0, 0, rr, 0, TAU); }, .8*fl, 2.8*u1, 59, u1); c.restore(); }
    const pf = cl((u - .84)/.14);
    if (pf > 0 && pf < 1 && !isBack){   // the spin dies in a puff: smudged graphite clouds rolling off the tip
      for (let k = 0; k < 7; k++){ const a = k/7*TAU + hh(k, 60), r = .2 + .7*pf, X = ox + Math.cos(a)*r*1.2, Y = 1.05 + Bd.dy + Math.sin(a)*r*.3 - .25*pf, z = .1 + .14*pf;
        const g = c.createRadialGradient(X, Y, 0, X, Y, z); g.addColorStop(0, G(.35*(1 - pf))); g.addColorStop(1, G(0)); c.fillStyle = g; c.beginPath(); c.arc(X, Y, z, 0, TAU); c.fill();
        c.strokeStyle = G(.5*(1 - pf)); c.lineWidth = .8*u1; c.beginPath(); c.arc(X, Y, z*.7, a, a + 3.6); c.stroke(); } }
  }

  // ---- THE WHEEL: the folded disc spinning flat. FLOOR: the scour it cuts in the paper, the heel it digs in rocking back, the
  // dents at the ricochets. OVER: a compass circle and speed arcs from the spin rate, the ricochet bursts, the dust and dizziness home
  function wheelFx(c, A, t, u, u1, layer){
    const { pos, rate } = A, cx = pos.x, cy = pos.y - .1, rr = .95;
    if (layer === 'floor'){
      const T = A.trail, sc = sm(.22, .3, u)*(1 - sm(.86, .96, u));
      if (sc > .01) for (let k=0;k<10;k++){ const p0 = T[k], p1 = T[k + 1], L = Math.hypot(p1.x - p0.x, p1.y - p0.y); if (L < 1e-4) continue;
        const f = (k + 1)/10, nx = -(p1.y - p0.y)/L, ny = (p1.x - p0.x)/L, y0 = p0.y - .1, y1 = p1.y - .1;
        c.strokeStyle = G(.07*sc*f); c.lineWidth = 1.1; c.beginPath(); c.moveTo(p0.x, y0); c.lineTo(p1.x, y1); c.stroke();   // the smudge the disc drags
        c.lineWidth = .8*u1; c.beginPath();   // the saw's grooves scored into the paper, the outer ones fainter
        for (const o of [-.6, -.42, -.2, .2, .42, .6]){ c.strokeStyle = G(.8*sc*f*(1 - .45*Math.abs(o))); c.beginPath(); c.moveTo(p0.x + nx*o, y0 + ny*o); c.lineTo(p1.x + nx*o, y1 + ny*o); c.stroke(); }
        c.strokeStyle = G(.7*sc*f); c.lineWidth = 1.8*u1; c.beginPath(); c.moveTo(p0.x, y0); c.lineTo(p1.x, y1); c.stroke(); }
      const rk = A.rock;   // the tell: rocking back it digs its heel in, a hatched scuff on the side away from the player
      if (rk > .01){ const b = A.dir + Math.PI; c.strokeStyle = G(.55*rk); c.lineWidth = 1*u1; c.beginPath();
        for (let k=0;k<9;k++){ const a = b + (k/8 - .5)*1.2, r0 = rr*.92, r1 = rr*(1.02 + .12*rk*hh(k, 90)); c.moveTo(cx + Math.cos(a)*r0, cy + Math.sin(a)*r0*.9); c.lineTo(cx + Math.cos(a + .08)*r1, cy + Math.sin(a + .08)*r1*.9); }
        c.stroke(); }
      for (const [j, H] of A.hits.entries()) if (H.al > .01){ const e = 1 - H.al;   // the dent at each ricochet, hatched in
        c.save(); c.translate(H.x, H.y - .1); c.scale(1, .55); c.beginPath(); c.arc(0, 0, .5 + .2*e, 0, TAU); c.clip();
        hatch(c, 0, 0, .7, .7 + j, 2.4*u1, .55*H.al, 1*u1, 91 + j); c.restore();
        c.strokeStyle = G(.7*H.al); c.lineWidth = 1*u1; c.beginPath();
        for (let k=0;k<7;k++){ const a = k/7*TAU + hh(k, 92 + j), r = .4 + .5*hh(k, 93 + j); c.moveTo(H.x + Math.cos(a)*.3, H.y - .1 + Math.sin(a)*.17);
          c.lineTo(H.x + Math.cos(a + .15)*r*.7, H.y - .1 + Math.sin(a + .15)*r*.38); c.lineTo(H.x + Math.cos(a)*r, H.y - .1 + Math.sin(a)*r*.55); }
        c.stroke(); }
      return; }
    if (rate > .03){
      sketch(c, () => { c.beginPath(); c.arc(cx, cy, rr, 0, TAU); }, .35*rate, 1.3*u1, 94, u1);   // the wheel ruled round with a compass
      for (let k=0;k<10;k++){ const a1 = k*TAU/10 + hh(k, 95)*.5 + t*3, len = (.6 + .4*hh(k, 96))*1.3*rate, r = rr*(.55 + .5*hh(k, 97));
        for (let q=0;q<4;q++){ const f = q/4; c.strokeStyle = G(.6*rate*(1 - f)); c.lineWidth = (2 - 1.4*f)*u1; c.beginPath(); c.arc(cx, cy, r, a1 - len*(f + .25), a1 - len*f); c.stroke(); } }
      const dots = []; c.strokeStyle = G(.6*rate); c.lineWidth = 1*u1; c.beginPath();   // graphite flecks spat off the rim, tangent to the turn
      for (let k=0;k<12;k++){ const f = (t*2.1 + hh(k, 98)) % 1, a = hh(k, 99)*TAU + t, X = cx + Math.cos(a)*rr - Math.sin(a)*f*.9, Y = cy + Math.sin(a)*rr + Math.cos(a)*f*.9, al = rate*(1 - f);
        if (al < .05) continue; c.moveTo(X, Y); c.lineTo(X + Math.sin(a)*.18*al, Y - Math.cos(a)*.18*al); dots.push([X, Y, al]); }
      c.stroke(); for (const [X, Y, al] of dots){ c.fillStyle = G(.85*al); c.beginPath(); c.arc(X, Y, .022, 0, TAU); c.fill(); } }
    for (const [j, H] of A.hits.entries()) if (H.al > .01){ const e = 1 - H.al, X = H.x, Y = H.y - .1;   // RICOCHET: a pressed starburst, a ring and flung flecks
      c.strokeStyle = G(.9*H.al); c.lineWidth = 1.6*u1; c.beginPath();
      for (let k=0;k<12;k++){ const a = k/12*TAU + hh(k, 100 + j)*.4, r0 = .25 + .5*e, r1 = r0 + (.2 + .3*hh(k, 101 + j))*H.al; c.moveTo(X + Math.cos(a)*r0, Y + Math.sin(a)*r0*.6); c.lineTo(X + Math.cos(a)*r1, Y + Math.sin(a)*r1*.6); }
      c.stroke(); c.strokeStyle = RED(.7*H.al); c.lineWidth = 1.1*u1; c.beginPath();
      for (let k=0;k<6;k++){ const a = k/6*TAU + .5 + hh(k, 102 + j), r0 = .2 + .4*e, r1 = r0 + .25*H.al; c.moveTo(X + Math.cos(a)*r0, Y + Math.sin(a)*r0*.6); c.lineTo(X + Math.cos(a)*r1, Y + Math.sin(a)*r1*.6); }
      c.stroke(); c.save(); c.translate(X, Y); c.scale(1, .6); sketch(c, () => { c.beginPath(); c.arc(0, 0, .3 + 1.1*e, 0, TAU); }, .7*H.al, 2*u1, 103 + j, u1); c.restore();
      for (let k=0;k<8;k++){ const a = hh(k, 104 + j)*TAU, r = (.4 + .9*hh(k, 105 + j))*e; c.fillStyle = G(.85*H.al); c.beginPath(); c.arc(X + Math.cos(a)*r, Y + Math.sin(a)*r*.6 - .6*e*(1 - e), .025, 0, TAU); c.fill(); } }
    const pf = cl((u - .82)/.14);
    if (pf > 0 && pf < 1) for (let k=0;k<8;k++){ const a = k/8*TAU + hh(k, 106), r = rr*(.9 + .6*pf), X = cx + Math.cos(a)*r, Y = cy + .1 + Math.sin(a)*r*.45 - .25*pf, z = .12 + .14*pf;   // landing home: dust rolls off the rim
      const g = c.createRadialGradient(X, Y, 0, X, Y, z); g.addColorStop(0, G(.32*(1 - pf))); g.addColorStop(1, G(0)); c.fillStyle = g; c.beginPath(); c.arc(X, Y, z, 0, TAU); c.fill();
      c.strokeStyle = G(.5*(1 - pf)); c.lineWidth = .8*u1; c.beginPath(); c.arc(X, Y, z*.7, a, a + 3.6); c.stroke(); }
    const dz = A.dizzy;
    if (dz > .01){ c.strokeStyle = G(.8*dz); c.lineWidth = 1*u1; c.beginPath();
      for (let k=0;k<5;k++){ const a = t*3 + k*TAU/5, X = cx + Math.cos(a)*.38, Y = cy - 1.02 + Math.sin(a)*.12, z = .04*(.8 + .2*Math.sin(a)); c.moveTo(X + z, Y); c.arc(X, Y, z, 0, TAU); } c.stroke(); }
  }

  // a blade feather in pencil: its tip at (X, Y), its quill back along -a; lift raises the quill screen-up (staked), sh = its shadow
  function quill(c, X, Y, a, L, w, lift, al, u1, seed, sh){
    const ca = Math.cos(a), sa = Math.sin(a), F = RIG.feather(L, 0, Math.PI, L, w, .06);
    c.save(); c.transform(-ca, -sa - lift/L, -sa, ca, X, Y);
    const path = () => { c.beginPath(); F.l.forEach(([px, py], k) => k ? c.lineTo(px, py) : c.moveTo(px, py)); for (let k=10;k>=0;k--) c.lineTo(F.r[k][0], F.r[k][1]); c.closePath(); };
    if (sh){ path(); c.fillStyle = G(.2*al); c.fill(); c.restore(); return; }
    c.globalAlpha = al; path(); c.fillStyle = PAPER; c.fill();
    c.save(); c.clip(); c.beginPath(); c.rect(-.1, 0, L + .2, w*2); c.clip(); hatch(c, L/2, w*.5, L*.6, .9, 2.4*u1, .6, .9*u1, seed); c.restore();
    sketch(c, path, .9, 1.3*u1, seed + 1, u1);
    c.strokeStyle = G(.85); c.lineWidth = 1*u1; c.beginPath(); c.moveTo(L*1.12, 0); c.lineTo(L*.04, 0); c.stroke();   // the shaft, its bare quill past the vane
    c.lineWidth = .7*u1; c.beginPath(); for (let k=1;k<6;k++){ const s = L*k/6.5; c.moveTo(s, 0); c.lineTo(s - w*.8, -w*.7); c.moveTo(s, 0); c.lineTo(s - w*.8, w*.7); } c.strokeStyle = G(.5); c.stroke();
    c.restore();
  }
  // ---- FEATHER RECALL: ten blade feathers staked in the paper. FLOOR: their shadows, the stab and the dust it throws, the torn
  // hole they rip out of. OVER: the feathers, quivering while staked, a streak behind them in flight. Each one's way home is its own
  // heading: nothing joins it to the boss
  function recallFx(c, A, t, u, u1, layer){
    A.feathers.forEach((F, i) => {
      const P = F.plant, a = Math.atan2(P.y + .1, P.x), st = F.state, r2 = st === 2 ? sm(0, .12, F.k) : st === 3 ? 1 - sm(0, .35, F.k) : 0, lift = .2*r2;
      if (layer === 'floor'){
        const hole = (st === 2 ? cl(F.k*10) : st >= 3 ? .35 + .65*F.tear : 0)*(1 - sm(.9, 1, u));
        if (hole > .01){ c.save(); c.translate(P.x, P.y); c.rotate(a); c.fillStyle = G(.6*hole); c.beginPath(); c.ellipse(0, 0, .07, .025, 0, 0, TAU); c.fill();
          c.strokeStyle = G(.7*hole); c.lineWidth = .8*u1; c.beginPath(); for (let k=0;k<4;k++){ const b = k*Math.PI/2 + .4 + hh(k, 110 + i)*.4, r = .07 + .06*hh(k, 111 + i); c.moveTo(Math.cos(b)*.05, Math.sin(b)*.02); c.lineTo(Math.cos(b)*r, Math.sin(b)*r); } c.stroke(); c.restore(); }
        if (st >= 2 && F.dust > .01){ const e = 1 - F.dust;   // the stake's impact: a puff of graphite dust and flecks
          c.save(); c.translate(P.x, P.y); c.scale(1, .5); const g = c.createRadialGradient(0, 0, 0, 0, 0, .12 + .3*e); g.addColorStop(0, G(.4*F.dust)); g.addColorStop(1, G(0)); c.fillStyle = g; c.beginPath(); c.arc(0, 0, .12 + .3*e, 0, TAU); c.fill(); c.restore();
          c.strokeStyle = G(.7*F.dust); c.lineWidth = .9*u1; c.beginPath(); for (let k=0;k<7;k++){ const b = hh(k, 112 + i)*TAU, r0 = .06 + .25*e, r1 = r0 + .08*F.dust; c.moveTo(P.x + Math.cos(b)*r0, P.y + Math.sin(b)*r0*.5); c.lineTo(P.x + Math.cos(b)*r1, P.y + Math.sin(b)*r1*.5 - .05*F.dust); } c.stroke(); }
        if (st >= 3 && F.tear > .01){ const e = 1 - F.tear;   // ripping free: shreds of paper flung up and out, torn edges pencilled
          for (let k=0;k<5;k++){ const b = a + (hh(k, 113 + i) - .5)*2.4, r = .05 + .35*e, X = P.x + Math.cos(b)*r, Y = P.y + Math.sin(b)*r*.6 - .4*e*(1 - e) - .05, s = .035*(.7 + .6*hh(k, 114 + i)), q = b + t*6*(hh(k, 115) - .5);
            c.beginPath(); c.moveTo(X + Math.cos(q)*s, Y + Math.sin(q)*s); c.lineTo(X + Math.cos(q + 2.2)*s, Y + Math.sin(q + 2.2)*s); c.lineTo(X + Math.cos(q + 4)*s*.7, Y + Math.sin(q + 4)*s*.7); c.closePath();
            c.fillStyle = PAPER; c.globalAlpha = F.tear; c.fill(); c.strokeStyle = G(.8); c.lineWidth = .8*u1; c.stroke(); c.globalAlpha = 1; } }
        if (F.vis) quill(c, F.x + .3*F.z, F.y, a + .35*r2, F.len*(1 + .25*r2), F.w, 0, 1, u1, 0, true);   // its shadow on the floor, offset by its height
        return; }
      if (!F.vis) return;
      const q = F.quiver*.07*Math.sin(t*47 + i*2.3) + (st === 3 ? .12*F.tear*Math.sin(t*61 + i) : 0), X = F.x, Y = F.y - F.z;
      quill(c, X, Y, a + q, F.len, F.w, lift, 1, u1, 200 + 3*i);
      const bx = X - Math.cos(a)*F.len, by = Y - Math.sin(a)*F.len - lift;
      if (F.quiver > .15){ c.strokeStyle = G(.55*F.quiver); c.lineWidth = .8*u1; c.beginPath();   // the quiver: shake marks either side of the quill
        for (const sd of [-1, 1]){ const nx = -Math.sin(a)*sd, ny = Math.cos(a)*sd; c.moveTo(bx + nx*.07 - Math.cos(a)*.04, by + ny*.07 - Math.sin(a)*.04); c.quadraticCurveTo(bx + nx*.1, by + ny*.1, bx + nx*.07 + Math.cos(a)*.04, by + ny*.07 + Math.sin(a)*.04); }
        c.stroke(); }
      const sk = st === 1 || st === 3 ? Math.sin(Math.PI*F.k) : 0;   // in flight: a short streak behind it (behind the tip out, behind the quill home)
      if (sk > .02){ const dx = Math.cos(a)*(st === 1 ? -1 : 1), dy = Math.sin(a)*(st === 1 ? -1 : 1), ox = st === 1 ? bx : X, oy = st === 1 ? by : Y;
        c.strokeStyle = G(.45*sk); c.lineWidth = .8*u1; c.beginPath();
        for (const o of [-.03, 0, .03]){ const nx = -dy*o, ny = dx*o, l = (o ? .2 : .3)*sk; c.moveTo(ox + dx*.04 + nx, oy + dy*.04 + ny); c.lineTo(ox + dx*(.04 + l) + nx, oy + dy*(.04 + l) + ny); } c.stroke(); }
    });
  }

  // ---- SWORD SLAM: a blade built of the boss's feathers, ruled in. FLOOR: its shadow, the scorched line, the slam's ring and cracks,
  // the char under each flame. OVER: the feathers fusing into the blade (and breaking back), the blade, and the scribbled fire
  // the sword, morph C (owner's pick): feathers peel off all six wings, fly the short way in and stack into the blade at the
  // shoulders, the wings held open and gapped; they fly home as it breaks. Nothing else is the blade: before the feathers arrive
  // there is nothing to see but them. It follows liquid's path: up behind the head, then straight over the top and down the line
  function swordGeo(P, A, t, u, ph){
    const Bl = A.blade, Fi = A.fire, up = P.wings.filter((w) => w.i === 0); if (up.length !== 2) return null;
    const P0 = RIG.pose(t, ph), b = P0.body.m, dt = b[0]*b[3] - b[1]*b[2], k = Bl.form;   // the wings held open as at rest, following the body
    const D = RIG.mul(P.body.m, [b[3]/dt, -b[1]/dt, -b[2]/dt, b[0]/dt, (b[2]*b[5] - b[3]*b[4])/dt, (b[1]*b[4] - b[0]*b[5])/dt]), lp = (p, q) => p.map((v, i) => v + (q[i] - v)*k);
    P.wings = P.wings.map((w) => { const o = P0.wings.find((v) => v.i === w.i && v.side === w.side); if (!o) return w;
      const M = lp(w.m, RIG.mul(D, o.m)); for (const E of w.eyes){ const [ex, ey] = RIG.apply(M, E.lx, E.ly); E.x = ex; E.y = ey; }
      return { ...w, m: M, K: true, root: RIG.apply(M, ...RIG.WINGS[w.i].root), homes: [] }; });
    const SB = RIG.apply(P.body.m, 0, -.2), tip = [Bl.tip.x, Bl.tip.y], gr = [Bl.ground.x, Bl.ground.y];   // liquid's path: shoulders to the rig's tip, straight over the top
    const L = Math.max(.3, .9*k, Math.hypot(tip[0] - SB[0], tip[1] - SB[1])), ax = Math.atan2(tip[1] - SB[1], tip[0] - SB[0]), N = PEEL.length, NB = N - 2, W = .075, fly = [];
    let home = 0, sh = 0;
    PEEL.forEach((e, j) => { const w = P.wings.find((v) => v.i === e.i && v.side === e.side); if (!w) return;
      const t0 = .03 + .14*j/N, t2 = .83 + .09*j/N, out = RIG.sm(t0, t0 + .09, u)*(1 - RIG.sm(t2, t2 + .07, u)), q = e.q, M = w.m;
      if (out <= 0){ home++; w.homes.push(e.n); return; }
      // its slot: the blade is two tight columns of feathers laid flat along the axis, edge to edge, the last two the crossguard
      const sd = j % 2 ? 1 : -1, guard = j >= NB, ca = Math.cos(ax), sa = Math.sin(ax), nx = -sa, ny = ca;
      const ql = guard ? .3 : L*.3, s2 = guard ? 0 : (Math.floor(j/2)/Math.max(1, Math.ceil(NB/2) - 1))*(1 - .3 - .02) + .02;
      const p1 = guard ? [SB[0] + ca*.6 + nx*sd*.01, SB[1] + sa*.6 + ny*sd*.01] : [SB[0] + ca*s2*L + nx*sd*W*.5, SB[1] + sa*s2*L + ny*sd*W*.5], b1 = guard ? ax + sd*Math.PI/2 : ax;
      const p0 = RIG.apply(M, q.base[0], q.base[1]), dv = [M[0]*Math.cos(q.a) + M[2]*Math.sin(q.a), M[1]*Math.cos(q.a) + M[3]*Math.sin(q.a)], b0 = Math.atan2(dv[1], dv[0]), m0 = q.L*Math.hypot(dv[0], dv[1]), mir = M[0]*M[3] - M[1]*M[2] < 0 ? -1 : 1;
      let da = b1 - b0; da -= TAU*Math.round(da/TAU);
      const kk = out*out*(3 - 2*out), arc = .18*Math.sin(Math.PI*kk), s0 = m0/q.L, sl = s0 + (ql/q.L - s0)*kk, sc = s0*mir + ((guard ? 1.2 : 1)*W*.55/q.w*sd - s0*mir)*kk;
      fly.push({ i: e.i, n: e.n, q, x: p0[0] + (p1[0] - p0[0])*kk, y: p0[1] + (p1[1] - p0[1])*kk - arc, a: b0 + da*kk, sl, sc, out, guard, mv: Math.sin(Math.PI*kk) });
      sh += out/N; });
    if (home < N) for (const w of P.wings) w.gap = true;
    return { SB, tip, gr, L, ax, W, sh, fly, over: Bl.under <= .5 };
  }
  // the feathers of the sword: in flight each turns over (its width passes through edge-on) and trails a short streak; stacked, the
  // blade's feathers are trimmed to one straight-sided, double-edged blade with a sharp point, ruled along its edges and spine
  function swordFeathers(c, SW, Gk, layer, u1){
    const done = SW.over ? layer === 'over' : layer === 'under', [bx, by] = SW.SB, ca = Math.cos(SW.ax), sa = Math.sin(SW.ax), nx = -sa, ny = ca, L = SW.L, W = SW.W;
    const edge = () => { c.beginPath(); c.moveTo(bx + nx*W, by + ny*W); c.lineTo(bx + ca*L*.84 + nx*W, by + sa*L*.84 + ny*W); c.lineTo(bx + ca*L, by + sa*L);
      c.lineTo(bx + ca*L*.84 - nx*W, by + sa*L*.84 - ny*W); c.lineTo(bx - nx*W, by - ny*W); c.closePath(); };
    const put = (F) => { c.save(); c.translate(F.x, F.y); c.rotate(F.a); c.scale(F.sl, F.sc); c.rotate(-F.q.a); c.translate(-F.q.base[0], -F.q.base[1]); lay(c, Gk.fe[F.i][F.n]); c.restore(); };
    if (done){ c.save(); edge(); c.clip(); for (const F of SW.fly) if (F.out >= 1 && !F.guard) put(F); c.restore(); }   // stacked: trimmed to the blade
    for (const F of SW.fly){ if (F.out >= 1 ? !(F.guard && layer === 'over') : layer !== 'over') continue;   // the guard always over: it straddles the up wings
      if (F.mv > .05){ c.strokeStyle = G(.35*F.mv); c.lineWidth = .8*u1; c.beginPath();
        for (const o of [-.02, .02]){ const tx = F.x + Math.cos(F.a)*F.q.L*F.sl*.5, ty = F.y + Math.sin(F.a)*F.q.L*F.sl*.5; c.moveTo(tx - Math.sin(F.a)*o, ty + Math.cos(F.a)*o + .02); c.lineTo(tx - Math.sin(F.a)*o, ty + Math.cos(F.a)*o + .02 + .18*F.mv); } c.stroke(); }
      put(F); }
    if (SW.sh > .6 && done){ const al = RIG.sm(.6, .95, SW.sh);   // the edges and the spine the feathers stack along, ruled in
      edge(); c.strokeStyle = G(.85*al); c.lineWidth = 1.3*u1; c.stroke();
      c.strokeStyle = G(.7*al); c.lineWidth = 1*u1; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + ca*L*.9, by + sa*L*.9); c.stroke(); }
    if (SW.sh > .6 && layer === 'over'){ const al = RIG.sm(.6, .95, SW.sh), gx = bx + ca*.6, gy = by + sa*.6; c.strokeStyle = G(.85*al); c.lineWidth = 2.2*u1; c.beginPath(); c.moveTo(gx + nx*.3, gy + ny*.3); c.lineTo(gx - nx*.3, gy - ny*.3); c.stroke(); }   // the guard's line, ruled over its two feathers
  }
  function swordFx(c, A, t, u, u1, layer, SW){
    const B = A.blade, Fi = A.fire, d = A.dir, dx = Math.cos(d), dy = Math.sin(d);
    if (layer === 'floor'){
      if (Fi.scorch > .01 && Fi.front > .02){ const S = Fi.start, L = Fi.front, w = Fi.w*.75, nx = Fi.nx, ny = Fi.ny, k = Fi.scorch;
        c.save(); c.beginPath();
        for (let j=0;j<=12;j++){ const f = j/12, r = w*(.7 + .3*hh(j, 120)); (j ? c.lineTo : c.moveTo).call(c, S.x + Fi.dx*L*f + nx*r, S.y + Fi.dy*L*f + ny*r); }
        for (let j=12;j>=0;j--){ const f = j/12, r = w*(.7 + .3*hh(j, 121)); c.lineTo(S.x + Fi.dx*L*f - nx*r, S.y + Fi.dy*L*f - ny*r); }
        c.closePath(); const g = c.createLinearGradient(S.x, S.y, S.x + Fi.dx*L, S.y + Fi.dy*L); g.addColorStop(0, G(.3*k)); g.addColorStop(1, G(.15*k)); c.fillStyle = g; c.fill(); c.clip();
        const mx = S.x + Fi.dx*L/2, my = S.y + Fi.dy*L/2; hatch(c, mx, my, L/2 + .4, d + 1.2, 2.6*u1, .6*k, 1*u1, 122); hatch(c, mx, my, L/2 + .4, d - .9, 3.4*u1, .4*k, .9*u1, 123);
        const hx = S.x + Fi.dx*L, hy = S.y + Fi.dy*L, gr = c.createRadialGradient(hx, hy, 0, hx, hy, .7); gr.addColorStop(0, RED(.45*k*Fi.on)); gr.addColorStop(1, RED(0)); c.fillStyle = gr; c.fillRect(hx - .7, hy - .7, 1.4, 1.4);
        c.restore(); }
      if (SW && SW.sh > .01){ const al = .22*SW.sh*(1 - B.dissolve), [bx, by] = SW.SB, [gx, gy] = SW.gr, l = Math.hypot(gx - bx, gy - by) || 1, nx = -(gy - by)/l*.09, ny = (gx - bx)/l*.09;   // the stacked feathers' shadow, shoulders to the point's shadow
        c.fillStyle = G(al); c.beginPath(); c.moveTo(bx + nx, by + ny); c.lineTo(gx, gy); c.lineTo(bx - nx, by - ny); c.closePath(); c.fill(); }
      if (A.impact){ const { x: X, y: Y, r, al } = A.impact;   // the slam's ring, pressed hard, and the paper cracking out from the point
        c.save(); c.translate(X, Y); c.scale(1, .55); sketch(c, () => { c.beginPath(); c.arc(0, 0, r, 0, TAU); }, .85*al, 2.6*u1, 124, u1);
        c.strokeStyle = G(.7*al); c.lineWidth = 1.2*u1; c.beginPath(); for (let k=0;k<18;k++){ const a = k/18*TAU + hh(k, 125)*.3; c.moveTo(Math.cos(a)*r*.85, Math.sin(a)*r*.85); c.lineTo(Math.cos(a)*r*1.08, Math.sin(a)*r*1.08); } c.stroke(); c.restore(); }
      const bu = B.buried*(1 - B.dissolve);
      if (bu > .01){ const X = Fi.start.x, Y = Fi.start.y; c.strokeStyle = G(.75*bu); c.lineWidth = 1*u1; c.beginPath();
        for (let k=0;k<7;k++){ const a = d + (k/6 - .5)*3.6 + hh(k, 126)*.3, r = (.25 + .35*hh(k, 127))*sm(0, .3, bu); let px = X, py = Y; c.moveTo(px, py);
          for (let s=1;s<=3;s++){ const b = a + (hh(k, s + 128) - .5)*.8; px += Math.cos(b)*r/3; py += Math.sin(b)*r/3*.6; c.lineTo(px, py); } } c.stroke(); }
      if (Fi.on > .01) for (const f of Fi.flames) if (f.h > .01){ const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.sz*.9);   // char under each flame
        g.addColorStop(0, G(.45*f.h*Fi.on)); g.addColorStop(1, G(0)); c.save(); c.translate(f.x, f.y); c.scale(1, .45); c.translate(-f.x, -f.y); c.fillStyle = g; c.beginPath(); c.arc(f.x, f.y, f.sz*.9, 0, TAU); c.fill(); c.restore(); }
      return; }
    // THE FIRE, scribbled: each flame a looping pencil scribble up a tongue, a red-pencil heart, embers lifting off
    if (Fi.on > .01) for (const [i, f] of Fi.flames.entries()) if (f.h > .01){ const H = f.sz*2.3*f.h, Wd = f.sz*.8*(.6 + .4*f.h), al = Fi.on*Math.min(1, f.h*1.6), sw = .06*Math.sin(t*9 + f.s*6);
      const edge = (v, sd) => { const wv = Wd*Math.sin(Math.PI*Math.pow(v, .7))*(1 - .2*Math.sin(t*13 + v*7 + f.s*9)); return [f.x + sd*wv + sw*v*v*4*H, f.y - H*v]; };
      c.beginPath(); for (let k=0;k<=8;k++){ const [X, Y] = edge(k/8, -1); k ? c.lineTo(X, Y) : c.moveTo(X, Y); } for (let k=8;k>=0;k--){ const [X, Y] = edge(k/8, 1); c.lineTo(X, Y); } c.closePath();
      c.fillStyle = `rgba(242,239,230,${A3(.7*al)})`; c.fill(); c.strokeStyle = G(.7*al); c.lineWidth = 1.2*u1; c.stroke();
      c.strokeStyle = G(.55*al); c.lineWidth = .8*u1; c.beginPath();   // the scribble: zigzag loops up inside the tongue, re-drawn every few frames
      for (let k=0;k<=16;k++){ const v = k/16*.9, [X, Y] = edge(v, k%2 ? .8 : -.8), j = .015*Math.sin(t*20 + k*2.1 + i); k ? c.lineTo(X + j, Y + j) : c.moveTo(X, Y); } c.stroke();
      c.strokeStyle = RED(.75*al); c.lineWidth = 1*u1; c.beginPath(); for (let k=0;k<=6;k++){ const v = k/6*.6, [X, Y] = edge(v, k%2 ? .45 : -.45); k ? c.lineTo(X, Y) : c.moveTo(X, Y); } c.stroke();
      for (let k=0;k<3;k++){ const q = (t*1.3 + hh(k, i + 160)) % 1, X = f.x + (hh(k, i + 161) - .5)*Wd*2 + .1*Math.sin(t*4 + k), Y = f.y - H*(1 + .9*q); c.fillStyle = (k ? G : RED)(.7*al*(1 - q)); c.beginPath(); c.arc(X, Y, .018, 0, TAU); c.fill(); } }
  }

  function attack(c, x, y, R, t, ph = 4, atk, u, px, py){
    const PX = (px - x)/R, PY = (py - y)/R, P = RIG.pose(t, ph, atk, u, PX, PY), A = RIG.attackUnit(atk, u, ph, PX, PY, t, P), u1 = 1/R;
    const fx = { wheel: wheelFx, recall: recallFx, sword: swordFx }[atk], SW = atk === 'sword' ? swordGeo(P, A, t, u, ph) : null;
    const Gk = SW && rig(Math.max(40, Math.min(320, Math.round(R*Math.hypot(c.getTransform().a, c.getTransform().b)/8)*8)), true);   // the same K draw() picks
    c.save(); c.translate(x, y); c.scale(R, R); c.lineCap = 'round'; c.lineJoin = 'round';
    under(c, atk, A, t, u1, u);
    if (atk === 'laser' && A.beams.length) laserFloor(c, A, t, u, u1);
    if (atk === 'tornado') spinFx(c, P, t, u, u1, 'back');
    if (fx) fx(c, A, t, u, u1, 'floor', SW);
    if (SW) swordFeathers(c, SW, Gk, 'under', u1);
    c.restore();
    const sp = atk === 'tornado' ? P.beats.spin : atk === 'wheel' ? A.rate : 0, du = atk === 'wheel' ? .0003 : .004;
    if (sp > .03) for (let k = 3; k >= 1; k--)   // the smear: the wings a few hairs of spin ago, fading
      draw(c, x, y, R, RIG.pose(t - k*.012, ph, atk, Math.max(0, u - k*du), PX, PY), { ghost: .24*sp*(1 - k/4) });
    draw(c, x, y, R, P);
    c.save(); c.translate(x, y); c.scale(R, R); c.lineCap = 'round'; c.lineJoin = 'round';
    if (atk === 'tornado') spinFx(c, P, t, u, u1, 'front');
    if (SW) swordFeathers(c, SW, Gk, 'over', u1);
    if (fx) fx(c, A, t, u, u1, 'over', SW);
    if (atk !== 'tornado' && atk !== 'wheel' && atk !== 'sword'){   // the whip: speed lines behind every wing tip, from where it was a beat ago (the rig's pose at u - .06)
      const Pa = RIG.pose(t, ph, atk, Math.max(0, u - .06), PX, PY).tips, Pb = P.tips;
      if (Pa.length === Pb.length){ c.strokeStyle = G(.4); c.lineWidth = .8*u1; c.beginPath();
        Pb.forEach(([bx, by], j) => { const [ax, ay] = Pa[j], d0 = Math.hypot(bx - ax, by - ay); if (d0 < .05) return; const d = Math.min(d0, .3), ux = (bx - ax)/d0, uy = (by - ay)/d0;
          for (const o of [-.025, 0, .025]){ const ox = -uy*o, oy = ux*o; c.moveTo(bx - ux*.04 + ox, by - uy*.04 + oy); c.lineTo(bx - ux*(.04 + d*(o ? .6 : 1)) + ox, by - uy*(.04 + d*(o ? .6 : 1)) + oy); } });
        c.stroke(); } }
    if (atk === 'tornado'){ const L = A.alive, d = A.collapse, { x: bx, y: by } = A.pos;
      if (L > .01) scribble(c, bx, by, A.scale, t, L, d, u1);
      const dz = A.dizzy;   // dizzy: little pencilled rings orbiting over its head
      if (dz > .01){ c.strokeStyle = G(.8*dz); c.lineWidth = 1*u1; c.beginPath();
        for (let k=0;k<5;k++){ const a = t*3 + k*TAU/5, X = Math.cos(a)*.38, Y = -1.12 + Math.sin(a)*.12, z = .04*(.8 + .2*Math.sin(a)); c.moveTo(X + z, Y); c.arc(X, Y, z, 0, TAU); } c.stroke(); } }
    if (atk === 'laser' && A.beams.length) laserRays(c, A, t, u, u1);
    c.restore();
  }

  OPHAN.pencil = {
    bg(c, w){ c.fillStyle = PAPER; c.fillRect(0, 0, w, w); c.strokeStyle = 'rgba(80,110,160,.14)'; c.lineWidth = 1; c.beginPath(); for (let k=12;k<w;k+=12){ c.moveTo(0, k); c.lineTo(w, k); } c.stroke(); },
    boss(c, x, y, R, t, ph = 4){ draw(c, x, y, R, RIG.pose(t, ph)); },
    // the FINISHED drawing at the same pose (denser hatch, contours re-traced, the eyes on top): the pencil hand reveals it under its point
    finish(c, x, y, R, t, ph = 4){ draw(c, x, y, R, RIG.pose(t, ph), { fin: true }); },
    attack,
    post(){},   // the paper takes no overlay
  };
})();
