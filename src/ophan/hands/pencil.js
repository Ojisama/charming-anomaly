import * as PIXI from 'pixi.js'
import { OPHAN, OPHAN_HANDKIT, OPHAN_HANDS, OPHAN_RIG, hh } from '../page.js'
// THE PENCIL HAND (the Sketch, final phase): the original artist's right hand, itself a graphite drawing on the paper
// (Escher's Drawing Hands). Its anatomy is the kit's traced engraving of a hand holding a pen in a true writer's grip
// (OPHAN_HANDKIT.ready(): trS the silhouette, trI the ink); the pen is swapped for a pencil (hexagonal shaft, sharpened cone)
// along the same axis, and the engraving is re-drawn in graphite: its tones re-hatched in pencil strokes on paper tooth, its
// ink lines kept as graphite contour, heavier on the side away from the lamp, its solid blacks broken into cross-hatching.
// Its mark: under the point the boss goes from light sketch to FINISHED drawing (OPHAN.pencil.finish, revealed in a band
// along the path the point has travelled); the line the point has drawn, darkest at the point; graphite crumbs; a smear
// where the side of the hand drags.
// BAKED ONCE: the hand + pencil in trace space (TR.k px per trace mm), and its shadow (the silhouette, diagonally hatched).
// PER FRAME: transformed sprites (shadow, hand), the finished boss under a clip, and a few paths.
OPHAN_HANDS.pencil = (() => {
  const K = OPHAN_HANDKIT, sm = K.sm, cl = K.cl, TAU = Math.PI*2;
  const PAPER = [242, 239, 230], GR = [52, 52, 60], G = (a) => `rgba(52,52,60,${a})`;
  const PIV = 2.2;   // the hand's swing round the point once the first edge is drawn (a second shadow is hatched for that pose, on the same lamp axis)
  const AOFF = -.6, SC = .46, MM = K.TR_U;   // the pencil a little steeper than the rig's tool line; the trace at .5 of the kit's size
  const k = 4, X0 = -20, Y0 = -10, W = 350*k, H = 250*k;   // the bake: trace space, k px per trace mm, from (X0, Y0)
  // the pen in the trace: its axis from the tip T toward E (d along, n across: +n is the hand's side), its centreline drifting
  // from cen 1.75 at the grip to -2 past it; the thumb hides it over s 63..107; it leaves the hand by s 235
  const T = [3, 207], E = [222, 5], PL = Math.hypot(E[0] - T[0], E[1] - T[1]), d = [(E[0] - T[0])/PL, (E[1] - T[1])/PL], n = [-d[1], d[0]];
  const cen = (s) => 1.75 - 3.75*sm(40, 130, s), HW = 8.5, S0 = -14, SEND = 250, HID = [63, 107];   // the pencil: half width, point, butt
  const PANG = Math.atan2(d[1], d[0]);
  // the pencil itself turned PROT about GS (under the thumb) toward the thumb side, so its back end leaves over the web, not across
  // the back of the hand; straight along d2 through G0; the old pen's track is skinned over
  const PROT = -.3, GS = 72, G0 = [T[0] + d[0]*GS + n[0]*cen(GS), T[1] + d[1]*GS + n[1]*cen(GS)], AP = AOFF + PROT;
  const d2 = [d[0]*Math.cos(PROT) - d[1]*Math.sin(PROT), d[0]*Math.sin(PROT) + d[1]*Math.cos(PROT)], n2 = [-d2[1], d2[0]], T2 = [G0[0] - d2[0]*GS, G0[1] - d2[1]*GS];
  const WRIST = 270, WY = [99, 191];   // the trace's wrist and its two sleeve lines (the cuff)
  let B = null;

  function bake(){
    const N = W*H, tr = K.ready(), mk = K.mk;
    const rd = (cv, blur) => { const c = mk(W, H), g = c.getContext('2d'); if (blur) g.filter = 'blur(' + blur + 'px)'; g.drawImage(cv, -X0*k, -Y0*k); return g.getImageData(0, 0, W, H).data; };
    const Sl = rd(tr.trS), In = rd(tr.trI), Bl = rd(tr.trS, 22), Dk = rd(tr.trI, 7), a8 = (D, i) => D[i*4 + 3]/255;
    // the lamp up-right behind the hand, carried into trace space at the typical pose (screen = trace turned by TH)
    const TH = -.8 + AOFF - PANG, rot = (x, y, a) => [x*Math.cos(a) - y*Math.sin(a), x*Math.sin(a) + y*Math.cos(a)];
    const [Lx, Ly] = rot(.6, -.6, -TH), Lz = .5;
    // the hatch: the artist's own diagonal (lower left to upper right on screen) and its crossings, long bowed strokes at three pressures
    const hatchA = -.785 - TH;
    const layer = (ang, gap, lw, seed) => { const c = mk(W, H), g = c.getContext('2d'), co = Math.cos(ang), si = Math.sin(ang), Rr = Math.hypot(W, H);
      g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineWidth = lw;
      for (let pass = 0; pass < 3; pass++){ g.globalAlpha = [1, .72, .5][pass]; g.beginPath();
        for (let dd = -Rr, i = 0; dd < Rr; dd += gap, i++){ const cx = W/2 - si*(dd + (hh(i, seed) - .5)*gap*.6), cy = H/2 + co*(dd + (hh(i, seed) - .5)*gap*.6);
          for (let q = -Rr, j = 0; q < Rr; j++){ const L = 50 + 150*hh(i + j*.37, seed), sk = 3 + 9*hh(j, i + seed), bend = (hh(j + 5, i) - .5)*gap*.9;
            if (Math.floor(hh(i*3 + j, seed + 1)*3) === pass){ const mx = q + L/2;
              g.moveTo(cx + co*q, cy + si*q); g.quadraticCurveTo(cx + co*mx - si*bend, cy + si*mx + co*bend, cx + co*(q + L), cy + si*(q + L)); }
            q += L + sk; } }
        g.stroke(); }
      return g.getImageData(0, 0, W, H).data; };
    const H1 = layer(hatchA, 6, 1.4, 3), H2 = layer(hatchA + 1.15, 6.5, 1.3, 7), H3 = layer(hatchA - .5, 4.5, 1.2, 11);
    // the cuff: a band round the wrist, its fold, a button (one canvas of pencil lines)
    const dc = mk(W, H), dg = dc.getContext('2d'); dg.setTransform(k, 0, 0, k, -X0*k, -Y0*k); dg.lineCap = 'round'; dg.strokeStyle = '#000';
    const cuff = (x, w, b) => { dg.lineWidth = w; dg.beginPath(); dg.moveTo(x, WY[0] - 3); dg.quadraticCurveTo(x - b, (WY[0] + WY[1])/2, x + 1, WY[1] + 4); dg.stroke(); };
    cuff(WRIST + 4, .9, 9); cuff(WRIST + 22, .9, 9); cuff(WRIST + 13, .45, 8);
    dg.lineWidth = .5; dg.beginPath(); dg.arc(WRIST + 15, WY[1] - 16, 2.6, 0, TAU); dg.stroke();
    dg.translate(X0, Y0);   // rd() shifts again by the bake origin
    dg.lineWidth = .55; dg.beginPath(); dg.moveTo(25.85, 155.98); dg.quadraticCurveTo(27.85, 155.65, 28.8, 157.46); dg.lineTo(25.93, 162.73); dg.quadraticCurveTo(23.97, 163.53, 23.16, 161.34); dg.stroke();   // the index nail, seen from above
    dg.lineWidth = .3; dg.beginPath(); dg.moveTo(26.38, 157.37); dg.lineTo(24.59, 160.95); dg.stroke();
    dg.lineWidth = .5; dg.beginPath(); dg.moveTo(28.62, 150.66); dg.quadraticCurveTo(30.23, 151.91, 32.28, 151.83); dg.moveTo(29.42, 149.5); dg.lineTo(31.74, 150.21); dg.stroke();   // its DIP crease
    dg.fillStyle = '#000'; dg.beginPath(); dg.moveTo(137.6, 176.6); dg.quadraticCurveTo(131.6, 180.4, 128.6, 187.2); dg.quadraticCurveTo(126.4, 192.6, 125.4, 198.6); dg.quadraticCurveTo(129.2, 192.4, 131.4, 186.6); dg.quadraticCurveTo(134, 180.6, 137.6, 176.6); dg.fill();   // the dark gap between ring and little fingers
    const lc = mk(W, H), lg = lc.getContext('2d'); lg.setTransform(k, 0, 0, k, -X0*k, -Y0*k); lg.fillStyle = '#000';   // paper left light: the nail
    lg.beginPath(); lg.moveTo(25.85, 155.98); lg.quadraticCurveTo(27.85, 155.65, 28.8, 157.46); lg.lineTo(25.93, 162.73); lg.quadraticCurveTo(23.97, 163.53, 23.16, 161.34); lg.closePath(); lg.fill();
    const Lt = lc.getContext('2d').getImageData(0, 0, W, H).data;
    // where the old pen crossed the contour (its exit at the top, beside the thumb pad): skin and the contour carried across
    const kc = mk(W, H), kg = kc.getContext('2d'); kg.setTransform(k, 0, 0, k, -X0*k, -Y0*k); kg.fillStyle = '#000';
    kg.beginPath(); kg.moveTo(157.4, 45.2); kg.quadraticCurveTo(170, 48.6, 180.2, 56.7); kg.lineTo(172.5, 66); kg.lineTo(156, 50); kg.closePath(); kg.fill();
    kg.beginPath(); kg.moveTo(31.4, 168.4); kg.lineTo(38.9, 161); kg.lineTo(44, 166.3); kg.lineTo(42, 171.5); kg.closePath(); kg.fill();
    const Kp = kg.getImageData(0, 0, W, H).data;
    dg.lineWidth = .55; dg.beginPath(); dg.moveTo(157.6, 45.5); dg.quadraticCurveTo(170, 49, 180, 56.6); dg.moveTo(31.6, 168.2); dg.quadraticCurveTo(36, 171.2, 42.4, 170.8); dg.stroke();
    // the silhouette opened (eroded then grown back by ~1.3 mm): the engraving's comb shading under the fingers, thinner than
    // that, falls away; fingertips, rounder than that, stay
    const Op = (() => { const A = rd(tr.trS, 5), e = mk(W, H), eg = e.getContext('2d'), id = eg.createImageData(W, H);
      for (let i = 0; i < W*H; i++) id.data[i*4 + 3] = A[i*4 + 3] > 215 ? 255 : 0;
      eg.putImageData(id, 0, 0); const o = mk(W, H), og2 = o.getContext('2d'); og2.filter = 'blur(5px)'; og2.drawImage(e, 0, 0); return og2.getImageData(0, 0, W, H).data; })();
    const D = rd(dc);
    // the engraving's shadow wedge ends in two thin tails (a hook up, a point right) that read as a sixth finger at phone size: cut both
    const cap = (X, Y, ax, ay, bx, by, r) => { const vx = bx - ax, vy = by - ay, t = cl(((X - ax)*vx + (Y - ay)*vy)/(vx*vx + vy*vy)); return 1 - sm(r - 1.2, r, Math.hypot(X - ax - vx*t, Y - ay - vy*t)); };
    const tails = (X, Y) => Math.max(cap(X, Y, 139, 93, 151, 71, 5), cap(X, Y, 127, 107.5, 151, 102, 4.6), cap(X, Y, 143, 121.5, 160, 116, 4));
    const out = mk(W, H), og = out.getContext('2d'), im = og.createImageData(W, H), O = im.data;
    const put = (i, a, cov = 1) => { for (let ch = 0; ch < 3; ch++) O[i*4 + ch] = PAPER[ch] + (GR[ch] - PAPER[ch])*a; O[i*4 + 3] = 255*cov; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const i = y*W + x, X = x/k + X0, Y = y/k + Y0, s = (X - T[0])*d[0] + (Y - T[1])*d[1], p = (X - T[0])*n[0] + (Y - T[1])*n[1], pc = p - cen(s);
      const s2 = (X - T2[0])*d2[0] + (Y - T2[1])*d2[1], p2 = (X - T2[0])*n2[0] + (Y - T2[1])*n2[1];
      const shown = s2 >= S0 - 1 && s2 <= SEND + 1 && !(s2 > HID[0] && s2 < HID[1] && a8(Sl, i) > .5);   // under the thumb only where there is skin
      if (shown){ const r = pencilAt(s2 - S0, p2); if (r){ put(i, Math.max(r[0], .5*sm(.5, .9, a8(Dk, i))*sm(HW - 3, HW, Math.abs(p2))), r[1]); if (r[1] > .99) continue; } }   // the pencil, over the old pen
      let skin = 0;
      if (Math.abs(pc) < HW + 2.5 && ((s < HID[0] && s > S0 - 6) || s > HID[1])){   // the old pen's track: skin where hand lies on both sides of it, else gone
        const at2 = (o) => { const q = (cen(s) + o - p)*k, xx = Math.round(x + n[0]*q), yy = Math.round(y + n[1]*q); return xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : a8(Sl, yy*W + xx); };
        if ((at2(HW + 4) < .5 || at2(-HW - 4) < .5) && a8(Kp, i) < .5) continue; skin = 1; }
      const kp = a8(Kp, i), sl = Math.max(a8(Sl, i), kp); if (sl < .5 || X > WRIST + 60) continue;
      // relief: the silhouette blurred as a height field, lit from the lamp; occlusion where the engraving's ink gathers
      const ix = Math.min(W - 3, Math.max(2, x)), iy = Math.min(H - 3, Math.max(2, y));
      const nx = (a8(Bl, iy*W + ix - 2) - a8(Bl, iy*W + ix + 2))*6, ny = (a8(Bl, (iy - 2)*W + ix) - a8(Bl, (iy + 2)*W + ix))*6, nl = Math.hypot(nx, ny, 1);
      const cut = 1 - tails(X, Y), lam = Math.max(0, (nx*Lx + ny*Ly + Lz)/nl), orf = s > HID[1] - 10 && s < 200 && pc > 0 ? 1 - .85*(1 - sm(HW + 12, HW + 26, pc)) : 1, dk = a8(Dk, i)*(1 - .6*(1 - cut))*(1 - skin)*orf, dense = sm(.5, .78, dk*cut);
      const fin = X > WRIST ? 1 - sm(25, 60, X - WRIST) : 1;   // the forearm left unfinished past the cuff
      const Tn = cl((.8 - lam)*1.6 + .9*dk)*fin;
      const h1 = a8(H1, i)*sm(.2, .32, Tn), h2 = a8(H2, i)*sm(.45, .58, Tn), h3 = a8(H3, i)*sm(.68, .8, Tn);
      let a = .1*Tn + .38*h1 + .44*h2 + .5*h3;
      const cross = Math.max(a8(H1, i), a8(H2, i), .9*a8(H3, i))*(1 - skin);   // the engraving's solid blacks, broken into dense cross-hatching
      const ink = a8(In, i)*(1 - skin)*orf*cut*(1 - dense)*(.62 + .38*(1 - lam))*(X > WRIST ? 1 - sm(10, 45, X - WRIST) : 1);   // its lines, pressed harder on the shadow side
      a = Math.max(a*(1 - .75*a8(Lt, i)), .92*ink, dense*(.35 + .6*cross)*fin*(1 - a8(Lt, i)), .85*a8(D, i)*fin);
      put(i, a, Math.min(1, (sl - .5)*2)*sm(.06, .3, Math.max(a8(Op, i), kp))*(X > WRIST ? 1 - sm(40, 60, X - WRIST) : 1));   // slivers past the skin (hair-thin hatching) dropped
    }
    // the paper's tooth on every grey
    for (let i = 0; i < N; i++){ if (!O[i*4 + 3]) continue; const x = i % W, y = (i/W)|0, nz = .55*hh(x >> 1, (y >> 1) + 977) + .45*hh(x, y + 313), q = 1 - .3 + .6*nz;
      const tt = Math.min(1, (PAPER[0] - O[i*4])/(PAPER[0] - GR[0])*q); for (let ch = 0; ch < 3; ch++) O[i*4 + ch] = PAPER[ch] + (GR[ch] - PAPER[ch])*tt; }
    og.putImageData(im, 0, 0);
    // its shadow: the silhouette (pencil and all) hatched in diagonal graphite strokes, about 40% of the paper covered
    const hc = mk(W, H), hg = hc.getContext('2d'); hg.drawImage(out, 0, 0); hg.globalCompositeOperation = 'source-in'; hg.fillStyle = '#fff'; hg.fillRect(0, 0, W, H);
    const dpc = mk(W, H), dpg = dpc.getContext('2d'); dpg.filter = 'blur(14px)'; dpg.drawImage(hc, 0, 0); const Dp = dpg.getImageData(0, 0, W, H).data;
    const dep = (x, y) => { const X = x | 0, Y = y | 0; return X < 0 || Y < 0 || X >= W || Y >= H ? 0 : Dp[(Y*W + X)*4 + 3]/255; };
    const Rr = Math.hypot(W, H);
    const shBake = (sa) => { const sc = mk(W, H), sg = sc.getContext('2d'); sg.strokeStyle = G(1); sg.lineCap = 'round';
    const hatchSh = (sa, gap, keep, seed, L0 = 40, LV = 150) => { const co = Math.cos(sa), si = Math.sin(sa);
      for (let dd = -Rr, j = 0; dd < Rr; dd += gap, j++){ const cx = W/2 - si*(dd + (hh(j, seed) - .5)*gap*.5), cy = H/2 + co*(dd + (hh(j, seed) - .5)*gap*.5);
        for (let q = -Rr, m = 0; q < Rr; m++){ const L = L0 + LV*hh(j, m + seed), th = .12 + .3*hh(m, j + seed + 1), ja = (hh(j + m, seed + 2) - .5)*.16, c2 = Math.cos(sa + ja), s2 = Math.sin(sa + ja);
          let a0 = 0, a1 = L; const px = (v) => cx + co*q + c2*v, py = (v) => cy + si*q + s2*v;
          while (a0 < a1 && !keep(px(a0), py(a0), th)) a0 += 6; while (a1 > a0 && !keep(px(a1), py(a1), th)) a1 -= 6;   // the stroke starts and stops where the shadow thins out
          if (a1 - a0 > 12){ sg.lineWidth = 3.5 + 2.5*hh(m, j + seed + 3); sg.beginPath(); sg.moveTo(px(a0), py(a0)); sg.quadraticCurveTo(px((a0 + a1)/2) - s2*(hh(m, j) - .5)*6, py((a0 + a1)/2) + c2*(hh(m, j) - .5)*6, px(a1), py(a1)); sg.stroke(); }
          q += L + 8 + 20*hh(m, j + seed + 4); } } };
    hatchSh(sa, 16, (x, y, th) => dep(x, y) > th, 41, 330, 660);   // long strokes, one way
    hatchSh(sa + .06, 16, (x, y, th) => dep(x, y) > .6 + .3*th, 51, 210, 480);   // between them where it deepens: under the fingers and pencil
    hatchSh(sa + 1.1, 20, (x, y, th) => dep(x, y) > .965 + .03*th, 61, 50, 90);   // crossed only in the core
    sg.globalCompositeOperation = 'destination-in'; sg.drawImage(hc, 0, 0); return sc; };
    const vc = mk(W, H), vg = vc.getContext('2d'); vg.drawImage(hc, 0, 0); vg.globalCompositeOperation = 'source-in'; vg.fillStyle = `rgb(${PAPER})`; vg.fillRect(0, 0, W, H);   // the shadow's veil: what it falls on loses contrast
    B = { out, sh: shBake(-.785 - TH), sh2: shBake(-.785 - TH - PIV), veil: vc };
  }
  // the pencil at (s from its point, p across, trace mm) -> [graphite 0..1, coverage]: lead, sharpened wood with a scalloped
  // paint line, hex barrel; null outside it
  function pencilAt(s, p){
    const sLead = 14, sWood = 46, ap = Math.abs(p), SL = SEND - S0;
    let r, kind;
    if (s < 0) return null;
    if (s < sLead){ r = .5 + 2.4*s/sLead; kind = 0; }
    else if (s < sWood){ r = 2.9 + (HW - 2.9)*(s - sLead)/(sWood - sLead); kind = 1; }
    else { r = HW; kind = 2; }
    const scal = sWood - 4*Math.abs(Math.cos((p/HW + 1)*1.5*Math.PI));   // the paint's scalloped edge on the three faces
    if (kind === 2 && s < scal + 4) kind = s < scal ? 1 : 2;
    if (ap > r + .6 || s > SL + .6) return null;
    const edge = sm(r - 1.1, r - .2, ap), cov = (1 - sm(r - .1, r + .6, ap))*(1 - sm(SL - .4, SL + .6, s)), v = p/r;
    let g;
    if (kind === 0) g = .82 - .35*Math.exp(-((v + .35)**2)/.04);   // graphite, a sheen down its lit side
    else if (kind === 1) g = .08 + .22*sm(.1, 1, v) + .3*(Math.abs((s*.85 + p*.3) % 2.2) < .35 ? sm(-.2, .8, v) : 0);   // bare wood, grain hatched on the shadow side
    else { const face = v < -.33 ? .12 : v < .33 ? .32 : .6, line = Math.abs(((p + 18)*.62) % 1.6 - .8) < .22 ? 1 : 0;   // three faces, hatched along the barrel by tone
      g = face*(.45 + .55*line) + .7*(1 - sm(.02, .07, Math.abs(Math.abs(v) - .33))); }
    if (kind === 1 && s > scal - 1 && s < sWood + 2) g = Math.max(g, .85*(1 - sm(.3, 1.1, Math.abs(s - scal))));   // the paint line
    if (s > SL - 3) g = Math.max(g, .6);   // the butt, cut square
    return [Math.max(g, .95*edge), cov];
  }
  // trace mm -> boss units: the pencil's point at F.tip, the pencil along the rig's tool line (+ AOFF)
  const M0 = new DOMMatrix([d2[0], n2[0], d2[1], n2[1], -(d2[0]*T2[0] + d2[1]*T2[1]) - S0, -(n2[0]*T2[0] + n2[1]*T2[1])]);
  const placeM = (F) => new DOMMatrix().translate(F.tip.x, F.tip.y).rotate((F.ang + AP)*180/Math.PI).scale(SC*F.S*MM).multiply(M0);
  function place(c, F){ const M = placeM(F); c.transform(M.a, M.b, M.c, M.d, M.e, M.f); }
  // the cast shadow as a shear: every point slides along the light by its height, which grows along the pencil from its point
  // (on the paper while it draws, so point and shadow meet) plus the whole hand's lift: the kit's .4*F.L, less its value at z = 0
  function shear(c, F){
    const A = F.ang + AP, ax = Math.cos(A), ay = Math.sin(A), Ln = Math.hypot(F.L.x, F.L.y), Lx = F.L.x/Ln, Ly = F.L.y/Ln, kz = .22 + .15*F.z;
    const hx = .4*F.L.x*(1 - .85*cl(F.z)) + .6, hy = .4*F.L.y*(1 - .85*cl(F.z)) - .6, a = 1 + kz*Lx*ax, b = kz*Ly*ax, cc = kz*Lx*ay, dd = 1 + kz*Ly*ay, X = F.tip.x, Y = F.tip.y;
    c.transform(a, b, cc, dd, X + hx - (a*X + cc*Y), Y + hy - (b*X + dd*Y));
  }
  // THE MARK: one feather traced and finished, not a scribble. The point rides the outer edge of the right down wing's outermost
  // talon (the boss's own contour) from a third of the way out, clear of the eye, to its tip (tapered in, pressed hardest mid-way, lifted off), hops, and hatches that edge's
  // shadow side back down in a zig-zag. Wing-local points, carried by the wing's pose every frame so the line breathes with it.
  const RIG = OPHAN_RIG, HW_ = RIG.HAND_WIN, PW = HW_.paint;
  const at = (A, f) => { const q = cl(f)*(A.length - 1), i = Math.min(A.length - 2, Math.floor(q)), g = q - i; return [A[i][0] + (A[i + 1][0] - A[i][0])*g, A[i][1] + (A[i + 1][1] - A[i][1])*g]; };
  const MK = (() => { const Wg = RIG.WINGS[2], e = Wg.feathers[Wg.feathers.length - 1], N = 40, s1 = [], z = [], s2 = [], far = (A) => Math.hypot(A[6][0], A[6][1] + .1), ed = far(e.l) > far(e.r) ? e.l : e.r;   // the edge away from the body
    for (let j = 0; j <= N; j++) s1.push(at(ed, .3 + .69*j/N));
    const side = (f, w) => { const A = at(ed, f), S = at(e.sp, f); return [A[0] + (S[0] - A[0])*w, A[1] + (S[1] - A[1])*w]; };
    for (let j = 0; j < 12; j++){ const f = .94 - .052*j; z.push(side(f, .06), side(f - .07, .9)); }   // the hatch block down the shadow side
    const zc = []; for (let j = 0; j < 6; j++){ const f = .4 + .1*j; zc.push(side(f, .85), side(f + .07, .08)); }   // and its cross pass back up
    const dens = (Z) => { const o = []; for (let j = 1; j < Z.length; j++) for (let q = 0; q < 3; q++){ const g = q/3; o.push([Z[j - 1][0] + (Z[j][0] - Z[j - 1][0])*g, Z[j - 1][1] + (Z[j][1] - Z[j - 1][1])*g]); } o.push(Z[Z.length - 1]); return o; };
    return { s1, s2: dens(z), s3: dens(zc), s4: s1.slice(14) }; })();
  const H1 = .3, H2 = .35, H3 = .54, H4 = .62, H5 = .72, H6 = .96;   // paint fraction: right edge | hop | hatch block | cross pass | hop across | left edge (u ~ .8) | held
  function mark(u, t){
    const P = RIG.pose(t, 4), M = (sd) => { const w = P.wings.find((q) => q.i === 2 && q.side === sd), m = w ? w.m : [sd, 0, 0, 1, 0, 0]; return (q) => [m[0]*q[0] + m[2]*q[1] + m[4], m[1]*q[0] + m[3]*q[1] + m[5]]; }, mp = M(1), ml = M(-1);
    const p = cl((u - PW[0])/(PW[1] - PW[0])), f1 = sm(0, H1, p), f2 = cl((p - H2)/(H3 - H2)), f3 = cl((p - H3)/(H4 - H3)), f4 = sm(H5, H6, p), S1 = MK.s1.map(mp), S2 = MK.s2.map(mp), S3 = MK.s3.map(mp), S4 = MK.s4.map(ml);
    const hop = (A, Bq, g) => [A[0] + (Bq[0] - A[0])*g, A[1] + (Bq[1] - A[1])*g];
    let tip, dn = 1;
    if (p < H1) tip = at(S1, f1);
    else if (p < H2){ tip = hop(S1[S1.length - 1], S2[0], sm(H1, H2, p)); dn = 0; }
    else if (p < H3) tip = at(S2, f2);
    else if (p < H4) tip = at(S3, f3);
    else if (p < H5){ const g = sm(H4 + .04, H5, p), A = S3[S3.length - 1], Bq = S4[0], q = hop(A, Bq, g); tip = [q[0], q[1] + .5*Math.sin(Math.PI*g)]; dn = 0; }   // under the boss, not over it
    else tip = at(S4, f4);
    return { tip, dn, f1, f2, f3, f4, S1, S2, S3, S4, pv: sm(.16, H2 + .08, p) };   // pv: the hand pivoted round to lie below-right of the point, after the first edge stroke (the hop)
  }
  const cut = (S, f) => { const q = f*(S.length - 1), n = Math.floor(q), out = S.slice(0, n + 1); if (q > n && n < S.length - 1) out.push(at(S, f)); return out; };
  // the mark: the finished drawing revealed in a band along what the point has drawn (boss units: c already at x, y, R)
  function reveal(c, x, y, R, t, Mk){
    const OP = typeof OPHAN !== 'undefined' && OPHAN.pencil; if (!OP || !OP.finish || Mk.f1 < .01) return;
    c.save(); c.beginPath();
    for (const [S, f, st] of [[Mk.S1, Mk.f1, 2], [Mk.S2, Mk.f2, 3], [Mk.S3, Mk.f3, 3], [Mk.S4, Mk.f4, 2]]){ const A = cut(S, f); for (let i = 0; i < A.length; i += st){ c.moveTo(A[i][0] + .09, A[i][1]); c.arc(A[i][0], A[i][1], .09, 0, TAU); } }
    c.clip(); c.scale(1/R, 1/R); c.translate(-x, -y); OP.finish(c, x, y, R, t);
    c.restore();
  }
  // the line itself: the edge stroke as one filled band whose width is the pressure along it, a darker core; the hatching;
  // a small grey smudge and a few crumbs behind the point while it is down
  function fresh(c, Mk, t, touch){
    const A = cut(Mk.S1, Mk.f1), n = A.length; if (n < 2) return;
    if (n > 8){ c.strokeStyle = G(.07); c.lineWidth = .04; c.beginPath(); for (let j = Math.floor(n*.35); j < n; j++){ const q = A[j]; j === Math.floor(n*.35) ? c.moveTo(q[0] - .018, q[1] + .024) : c.lineTo(q[0] - .018, q[1] + .024); } c.stroke(); }   // rubbed by the hand's side
    const ticks = (Z, a, lw) => { if (Z.length < 2) return; c.strokeStyle = G(a); c.lineWidth = lw; c.beginPath(); for (let j = 1; j < Z.length; j++) if (!(Math.floor((j - 1)/3) & 1)){ c.moveTo(Z[j - 1][0], Z[j - 1][1]); c.lineTo(Z[j][0], Z[j][1]); } c.stroke(); };   // the point marks going in, lifts coming back
    const Z = cut(Mk.S2, Mk.f2), Zc = cut(Mk.S3, Mk.f3); ticks(Z, .78, .012); ticks(Zc, .7, .011);
    const band = (A, n0) => { const n = A.length; if (n < 2) return;   // an edge stroke, n0 = where along the talon it starts
      const wid = (j) => { const N1 = MK.s1.length - 1, f = (j + n0)/N1; return .006 + .044*sm(0, .15, j/(N1 - n0))*(1 - .7*sm(.75, 1, f)); }, L = [], Rt = [];
    for (let j = 0; j < n; j++){ const a = A[Math.max(0, j - 1)], b = A[Math.min(n - 1, j + 1)], dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1, h = wid(j)/2;
      L.push([A[j][0] - dy/dl*h, A[j][1] + dx/dl*h]); Rt.push([A[j][0] + dy/dl*h, A[j][1] - dx/dl*h]); }
    c.fillStyle = G(.95); c.beginPath(); c.moveTo(L[0][0], L[0][1]); for (let j = 1; j < n; j++) c.lineTo(L[j][0], L[j][1]); for (let j = n - 1; j >= 0; j--) c.lineTo(Rt[j][0], Rt[j][1]); c.closePath(); c.fill();   // the edge: the boldest graphite on the page
    if (n > 4){ c.strokeStyle = 'rgba(255,255,255,.32)'; c.lineWidth = .006; c.beginPath();   // graphite's sheen along it
      for (let j = 2; j < n - 2; j++){ const q = [(A[j][0]*2 + L[j][0])/3, (A[j][1]*2 + L[j][1])/3]; j === 2 ? c.moveTo(q[0], q[1]) : c.lineTo(q[0], q[1]); } c.stroke(); } };
    band(A, 0); const A4 = cut(Mk.S4, Mk.f4); band(A4, 14);
    if (touch < .05 || !Mk.dn) return;
    const P = Mk.f4 > 0 ? A4 : Mk.f3 > 0 ? Zc : Mk.f2 > 0 ? Z : A, a = P[P.length - 1], b = P[Math.max(0, P.length - 3)], dir = Math.atan2(a[1] - b[1], a[0] - b[0]);
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = .008; c.beginPath(); c.moveTo(a[0] - Math.cos(dir)*.035, a[1] - Math.sin(dir)*.035); c.lineTo(a[0] - Math.cos(dir)*.008, a[1] - Math.sin(dir)*.008); c.stroke();   // the fresh graphite's glint at the point
    c.fillStyle = G(.55*touch);   // crumbs shed off the point
    for (let j = 0; j < 3; j++){ const f = (t*1.8 + hh(j, 4))%1, dd = dir + Math.PI + (hh(j, 5) - .5)*1.4, sd = .02 + .1*f*(.5 + hh(j, 6)), r = .005 + .006*hh(j, 7)*(1 - .5*f);
      c.beginPath(); c.arc(a[0] + Math.cos(dd)*sd, a[1] + Math.sin(dd)*sd, r, 0, TAU); c.fill(); }
  }
  setTimeout(() => { if (!B) bake(); }, 0);   // baked at load, not on the hand's first frame
  return {
    hand(c, x, y, R, t, Hh){
      if (!B) bake();
      if (!B.up){ B.up = 1; c.save(); c.globalAlpha = 1e-3; for (const cv of [B.out, B.sh, B.sh2, B.veil]) c.drawImage(cv, x, y, 1e-3, 1e-3);
        c.beginPath(); c.rect(x, y, 1e-3, 1e-3); c.clip(); if (typeof OPHAN !== 'undefined' && OPHAN.pencil && OPHAN.pencil.finish) OPHAN.pencil.finish(c, x, y, R, t); c.restore(); }   // every bake uploaded on the first call, the finished boss's too (the hand has its own layer)
      const u = K.uOf(Hh), F = K.pose(Hh, u, t); if (F.al < .01) return;
      // the point follows the mark, not the rig's path: shifted by (mark - rig) at the same moment, eased in on arrival and out on the lift
      const Mk = mark(u, t), base = RIG.hand(Math.min(Math.max(u, PW[0]), PW[1])).tip, wt = u < PW[0] ? sm(HW_.in[0], HW_.in[1], u) : 1 - sm(HW_.out[0], HW_.out[1], u);
      F.tip = { x: Hh.tip.x + (Mk.tip[0] - base.x)*wt, y: Hh.tip.y + (Mk.tip[1] - base.y)*wt };
      if (u < PW[0]){ const off = RIG.hand(0).tip, e = 1 - Math.pow(1 - sm(HW_.in[0], HW_.in[1], u), 2.5), z = 1 - .88*e;   // the arrival: in fast, settling onto the point
        F.tip = { x: off.x + (Mk.tip[0] - off.x)*e, y: off.y + (Mk.tip[1] - off.y)*e }; F.S *= (1 + .6*z)/(1 + .6*Hh.z); F.z = z; F.L = { x: -(1.5 + 7.5*z), y: 1.5 + 8*z }; }
      const sw = Mk.pv*(1 - sm(HW_.out[0], HW_.out[1], u)); F.ang += PIV*sw;   // swung clockwise, so its bulk stays below the boss and never crosses the great eye
      let touch = 0;
      if (u >= PW[0] && u <= PW[1]){ const P = Hh.stroke.pts, dr = P.length ? P[P.length - 1].down : 1, z = Math.max(0, Hh.z - .1*(1 - dr) + .1*(1 - Mk.dn));   // lifted only for the hop
        F.S *= (1 + .6*z)/(1 + .6*Hh.z); F.z = z; F.L = { x: -(1.5 + 7.5*z), y: 1.5 + 8*z }; touch = Mk.dn*sm(PW[0], PW[0] + .03, u)*(1 - sm(PW[1] - .03, PW[1], u)); }
      c.save(); c.translate(x, y); c.scale(R, R); c.lineCap = c.lineJoin = 'round';
      c.globalAlpha = 1; reveal(c, x, y, R, t, Mk);   // the mark is on the paper: it does not fade with the hand
      { const z = cl(F.z), a = .6*(1 - .55*z)*F.al, C = placeM(F).transformPoint(new DOMPoint(150, 130));   // the shadow: the one hatched bake, fainter and drawn in under the hand the higher it is
        if (a > .01){ c.save(); c.globalAlpha = a; c.translate(C.x, C.y); c.scale(1 - .35*z, 1 - .35*z); c.translate(-C.x, -C.y); shear(c, F); place(c, F); c.globalAlpha = .42*F.al*(1 - .5*z); c.drawImage(B.veil, X0, Y0, W/k, H/k); const f2 = sm(.35, .65, sw); c.globalAlpha = a*(1 - f2); c.drawImage(B.sh, X0, Y0, W/k, H/k); c.globalAlpha = a*f2; c.drawImage(B.sh2, X0, Y0, W/k, H/k); c.restore(); } }
      fresh(c, Mk, t, touch); c.globalAlpha = F.al;
      c.save(); place(c, F); c.drawImage(B.out, X0, Y0, W/k, H/k); c.restore();
      c.restore();
    },
  };
})();
