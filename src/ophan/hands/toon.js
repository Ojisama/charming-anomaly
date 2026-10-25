import { OPHAN, OPHAN_HANDKIT, OPHAN_HANDS, OPHAN_RIG } from '../page.js'
// THE MANTLE'S PAINTER (toon): the 1930s white cartoon glove, three fingers and a thumb, three stitch lines on its back,
// a flared cuff and a black rubber-hose arm, pinching a red dip pen with a steel nib. It dips the nib in an ink pot on the
// floor, then re-inks the creature's own outline: a thick bouncy contour, cream-rimmed, round each wing it sweeps.
// Drawn the way src/toon draws its cast: flat cream fill, one hard crescent shadow lower right, warm near-black ink heavier
// on the shadow side and wavering. BAKED once: NF bounce frames of the hand behind the pen and in front of it (fingers
// flex, palm squashes and stretches, the hose swings, each frame inked with its own wobble so the line boils) and the flat
// shadow, hard and soft. PER FRAME: drawImages of those stepped on twos (12 fps), the shadow MULTIPLIED over the boss (it
// darkens, it never greys it out) and kept off the great eye, the pen as paths (it bows as the nib lands), the wet contour
// ribbons drying, the splats, the drips and the pot.
OPHAN_HANDS.toon = (() => {
  const RIG = OPHAN_RIG, KIT = OPHAN_HANDKIT, TAU = Math.PI*2, sm = KIT.sm;
  const CREAM = '#f3e6c8', SHADOW = 'rgb(200,118,92)', SHADOW_A = 'rgba(92,26,12,0.4)', INK = '#1e1513', GLOVE = '#f7efdc', GSH = 'rgba(110,90,120,0.38)', STEEL = '#bdb6ab', BRASS = '#e0a64e', RED = '#c8322a', HOSE = '#2b201c';
  const G = 1.0, TURN = -.22, U_DIP = .17;   // the glove's size in boss radii per unit (times the rig's height scale); its turn off the rig's pen angle, toward the frame's corner; when it dips the pot
  const PPU = 150, BOX = { x0: -.3, y0: -1.75, x1: 7.6, y1: 1.35 };   // bake px per unit; the local frame's extent
  const NF = 4, SEQ = [0, 1, 2, 3, 2, 1], BEND = [-1, -.33, .33, 1];   // bounce frames, ping-ponged on twos
  const LX = -.2, LY = .97;   // the shadow side in the local frame (lower right on screen at the rig's pen angle)
  const cl = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v, mix = (a, b, t) => a + (b - a)*t;
  const hn = (i, s) => { let h = (i*374761393 + s*668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0)/4294967296; };
  const n1 = (x, s) => { const i = Math.floor(x), f = x - i, u = f*f*(3 - 2*f); return mix(hn(i, s), hn(i + 1, s), u)*2 - 1; };

  // ---- shapes (local units: origin the nib's point, +x up the pen toward the hand, the thumb on +y) ----
  const qb = (a, c, b, n = 16) => { const o = []; for (let i = 0; i <= n; i++){ const t = i/n, u = 1 - t; o.push([u*u*a[0] + 2*u*t*c[0] + t*t*b[0], u*u*a[1] + 2*u*t*c[1] + t*t*b[1]]); } return o; };
  const ell = (cx, cy, rx, ry, a = 0, n = 48, egg = 0) => { const o = [], ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < n; i++){ const t = i/n*TAU, k = 1 + egg*Math.cos(t), x = Math.cos(t)*rx*k, y = Math.sin(t)*ry*k; o.push([cx + x*ca - y*sa, cy + x*sa + y*ca]); } return o; };
  // a rubber-hose tube round a centreline, round caps at both ends
  function tube(C, w0, w1 = w0){
    const n = C.length, L = [], Rr = [], nrm = (i) => { const a = C[Math.max(0, i - 1)], b = C[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0])/l, (b[1] - a[1])/l]; };
    for (let i = 0; i < n; i++){ const [tx, ty] = nrm(i), h = mix(w0, w1, i/(n - 1))/2; L.push([C[i][0] - ty*h, C[i][1] + tx*h]); Rr.push([C[i][0] + ty*h, C[i][1] - tx*h]); }
    const cap = (p, t, h, s) => { const o = [], a0 = Math.atan2(t[1], t[0]); for (let k = 1; k < 10; k++){ const a = a0 + s*(Math.PI/2 - Math.PI*k/10); o.push([p[0] + Math.cos(a)*h, p[1] + Math.sin(a)*h]); } return o; };
    const te = nrm(n - 1), tb = nrm(0);
    return [...L, ...cap(C[n - 1], te, w1/2, 1), ...Rr.reverse(), ...cap(C[0], [-tb[0], -tb[1]], w0/2, 1)];
  }
  function resample(P, step, closed){
    const Q = closed ? [...P, P[0]] : P, out = [Q[0]];
    for (let i = 1; i < Q.length; i++){ const a = Q[i - 1], b = Q[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(d/step));
      for (let j = 1; j <= k; j++) out.push([a[0] + (b[0] - a[0])*j/k, a[1] + (b[1] - a[1])*j/k]); }
    if (closed) out.pop(); return out;
  }
  const area = (P) => { let s = 0; for (let i = 0; i < P.length; i++){ const a = P[i], b = P[(i + 1)%P.length]; s += a[0]*b[1] - b[0]*a[1]; } return s/2; };
  const path = (g, P) => { g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); g.closePath(); };
  // the brush: a filled ribbon, heavier where it faces the shadow side, its pressure and line wavering by hand
  function brush(g, P0, closed, w, seed, o = {}){
    const P = resample(P0, .015, closed); if (P.length < 3) return;
    const sign = closed && area(P) < 0 ? -1 : 1, n = P.length, seq = closed ? [...P, ...P.slice(0, Math.max(2, n*.06 | 0))] : P, m = seq.length, A = [], B = [];
    const taper = o.taper ?? (closed ? .07 : .3);
    for (let i = 0; i < m; i++){
      const a = seq[Math.max(0, i - 2)], b = seq[Math.min(m - 1, i + 2)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0])/l, ty = (b[1] - a[1])/l;
      const nx = ty*sign, ny = -tx*sign, t = i/(m - 1), ln = i*.015;
      const face = closed ? cl(nx*LX + ny*LY, -1, 1) : Math.abs(nx*LX + ny*LY)*.6;
      let p = (.45 + .85*Math.pow(cl(face*.5 + .5), 1.4))*(1 + .2*n1(ln/.3, seed) + .1*n1(ln/.1, seed + 7));
      const e = Math.min(t/taper, (1 - t)/taper), tp = e >= 1 ? 1 : Math.pow(Math.max(0, e), .65), wi = Math.max(.004, w*p*(closed ? mix(.25, 1, tp) : tp));
      const wob = .012*n1(ln/.35, seed + 11), cx = seq[i][0] + nx*wob, cy = seq[i][1] + ny*wob;
      A.push([cx + nx*wi/2, cy + ny*wi/2]); B.push([cx - nx*wi/2, cy - ny*wi/2]); }
    g.beginPath(); g.moveTo(A[0][0], A[0][1]); for (let i = 1; i < m; i++) g.lineTo(A[i][0], A[i][1]); for (let i = m - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
    g.closePath(); g.fillStyle = o.color || INK; g.fill();
  }
  // a cel: flat paint, ONE hard crescent shadow on the lower right (the shape minus itself nudged toward the light), then ink
  function cel(g, P, fill, seed, o = {}){
    path(g, P); g.fillStyle = fill; g.fill();
    if (o.shade !== null){ let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of P){ x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const d = .22*Math.max(x1 - x0, y1 - y0)/2 + .03, cx = (x0 + x1)/2, cy = (y0 + y1)/2;
      g.save(); path(g, P); g.clip(); g.beginPath(); g.rect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);
      const S = P.map(([x, y], i) => [cx + (x - cx)*1.02 - d*LX + .012*n1(i*.3, seed + 17), cy + (y - cy)*1.02 - d*LY + .012*n1(i*.3, seed + 19)]);
      g.moveTo(S[0][0], S[0][1]); for (let i = 1; i < S.length; i++) g.lineTo(S[i][0], S[i][1]); g.closePath();
      g.fillStyle = o.shade || GSH; g.fill('evenodd'); g.restore(); }
    if (o.ink !== 0) brush(g, P, true, o.ink ?? .055, seed);
  }

  // ---- one bounce frame in local units. b in -1..1: the rubber-hose flex. layer: 'back' (arm, cuff, palm, the two
  // curled fingers), 'front' (the index and thumb pinching the pen), 'sil' (everything, the pen too, for the shadow) ----
  function drawHand(g, b, f, layer){
    const sil = layer === 'sil';
    const S = (P, fill, seed, o) => { if (sil){ path(g, P); g.fill(); } else cel(g, P, fill, seed + 97*f, o); };
    const L = (P, w, seed, o) => { if (!sil) brush(g, P, false, w, seed + 97*f, o); };
    if (layer !== 'front'){
      // the arm: a black rubber hose swinging off the frame, a rubber sheen along its lit edge
      const arm = qb([3.9, -.42], [5.7, -.42 + .38*b], [7.4, -.5 - .1*b], 24);
      S(tube(arm, .56, .62), HOSE, 1, { shade: 'rgba(0,0,0,0.35)' });
      if (!sil) brush(g, arm.slice(2, -3).map(([x, y]) => [x, y - .15]), false, .07, 3, { color: 'rgba(255,236,214,0.34)', taper: .2 });
      // the hand's back: a puffy egg, squashed and stretched by the bounce
      S(ell(2.6, -.42, 1.04*(1 - .035*b), .9*(1 + .045*b), .08, 56, .06), GLOVE, 5);
      // the flared cuff: narrow at the wrist, a rolled lip at the arm, two folds
      S([[3.32, -.86], [3.75, -1.04 - .04*b], [4.06, -1.3 - .06*b], [4.06, .5 + .06*b], [3.75, .2 + .04*b], [3.32, .02]], GLOVE, 7);
      S(ell(4.06, -.4, .2, .9 + .06*b, 0, 40), GLOVE, 9, { shade: 'rgba(110,90,120,0.3)' });
      L(qb([3.55, -.88], [3.66, -.42], [3.55, .08]), .04, 11); L(qb([3.8, -1.05], [3.92, -.42], [3.8, .25]), .04, 13);
      // the three stitch lines down its back
      for (let k = 0; k < 3; k++){ const y = -.86 + .26*k; L(qb([2.3, y], [2.72, y - .05 + .02*b], [3.12, y + .03]), .05, 15 + k); }
      // the two curled fingers, knuckles forward, tucked well back from the pinch
      S(tube(qb([2.12, -1.16], [1.8, -1.24 + .05*b], [1.74, -1.0]), .38, .34), GLOVE, 21);
      S(tube(qb([2.0, -.82], [1.62, -.9 + .06*b], [1.56, -.64]), .4, .35), GLOVE, 23);
    }
    if (sil){ path(g, tube([[0, 0], [2.9, 0]], .17, .13)); g.fill(); }
    if (layer !== 'back'){
      // the index finger bent over the pen, its tip pressing the holder; the thumb pinching it from the other side
      S(tube(qb([1.96, -.46], [1.32, -.56 + .05*b], [1.0, -.1]), .4, .32), GLOVE, 41);
      S(tube(qb([2.5, .42], [1.78, .64 - .06*b], [1.04, .17]), .46, .34), GLOVE, 43);
      L(qb([1.42, -.66], [1.5, -.5], [1.42, -.34]), .03, 45, { taper: .4 });   // the index's middle joint
      L(qb([1.62, .44], [1.7, .6], [1.64, .76]), .03, 47, { taper: .4 });   // the thumb's
    }
  }

  // ---- the bakes: the hand behind the pen and in front of it (NF bounce frames each), and the flat shadow, hard and soft ----
  let BK = null, FT = null, SH = null;
  const W = Math.ceil((BOX.x1 - BOX.x0)*PPU), Hh = Math.ceil((BOX.y1 - BOX.y0)*PPU);
  const unitCtx = (cv, pad = 0) => { const g = cv.getContext('2d'); g.setTransform(PPU, 0, 0, PPU, pad - BOX.x0*PPU, pad - BOX.y0*PPU); g.lineCap = g.lineJoin = 'round'; return g; };
  function bake(){
    BK = []; FT = [];
    for (let f = 0; f < NF; f++){ for (const [arr, ly] of [[BK, 'back'], [FT, 'front']]){ const cv = KIT.mk(W, Hh); drawHand(unitCtx(cv), BEND[f], f, ly); arr.push(cv); } }
    const sil = KIT.mk(W, Hh), sg = unitCtx(sil); sg.fillStyle = SHADOW; drawHand(sg, 0, 0, 'sil');
    SH = [0, 5].map((bl) => { const pad = 3*bl, cv = KIT.mk(W + 2*pad, Hh + 2*pad), g = cv.getContext('2d'); if (bl) g.filter = 'blur(' + bl + 'px)'; g.drawImage(sil, pad, pad); g.filter = 'none'; return { cv, pad }; });
  }
  const lay = (c, cv, pad = 0) => c.drawImage(cv, BOX.x0 - pad/PPU, BOX.y0 - pad/PPU, cv.width/PPU, cv.height/PPU);

  // ---- the pen, per frame (it flexes as the nib lands): a red holder, a brass ferrule, a steel nib with its slit and vent ----
  function pen(c, bow, wet){
    const fillInk = (P, fill, w) => { path(c, P); c.fillStyle = fill; c.fill(); c.strokeStyle = INK; c.lineWidth = w; c.stroke(); };
    const C = qb([.58, 0], [1.7, bow], [2.9, 0], 14);
    fillInk(tube(C, .15, .12), RED, .045);
    path(c, tube(C.slice(2, -2).map(([x, y]) => [x, y + .04]), .035, .03)); c.fillStyle = 'rgba(96,6,24,0.55)'; c.fill();
    fillInk([[.38, -.105], [.6, -.115], [.6, .115], [.38, .105]], BRASS, .04);
    c.strokeStyle = INK; c.lineWidth = .025; c.beginPath(); c.moveTo(.47, -.1); c.lineTo(.47, .1); c.stroke();
    fillInk([[0, 0], [.1, -.045], [.22, -.095], [.4, -.1], [.4, .1], [.22, .095], [.1, .045]], STEEL, .035);
    path(c, [[.22, .02], [.4, .04], [.4, .1], [.22, .095]]); c.fillStyle = 'rgba(40,30,50,0.35)'; c.fill();
    c.fillStyle = INK; path(c, [[0, 0], [.1, -.045], [.13, 0], [.1, .045]]); c.fill();   // the wet point
    c.lineWidth = .022; c.beginPath(); c.moveTo(.04, 0); c.lineTo(.2, 0); c.stroke(); c.beginPath(); c.arc(.22, 0, .028, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,250,236,0.85)'; c.beginPath(); c.ellipse(.29, -.05, .06, .016, -.05, 0, TAU); c.fill();
    if (wet > .02){ c.fillStyle = INK; c.beginPath(); c.ellipse(-.03*wet, 0, .06*wet, .05*wet, 0, 0, TAU); c.fill();   // a bead of ink hanging off the point after the dip
      c.fillStyle = CREAM; c.beginPath(); c.arc(-.045*wet, -.015*wet, .014*wet, 0, TAU); c.fill(); }
  }

  // ---- the whole painted path, once: where each stroke starts (the nib landing), as paint progress 0..1 ----
  let PATH = null, PK = '';
  function fullPath(){
    const k = (window.HAND_PATH || '') + '/' + (window.HAND_SEED | 0); if (PATH && PK === k) return PATH;
    const P = RIG.hand(RIG.HAND_WIN.paint[1] + 1e-6).stroke.pts, n = P.length, lands = [];
    for (let i = 0; i < n; i++){ const on = P[i].down > .5, was = i > 0 && P[i - 1].down > .5;
      if (on !== was && (on || i > 0)) lands.push({ s: i/(n - 1), x: on ? P[i].x : P[i - 1].x, y: on ? P[i].y : P[i - 1].y }); }   // where it lands and where it lifts
    const drips = [2].map((k) => { const u = U_DIP + .018 + .022*k, q = RIG.hand(u).tip; return { u, x: q.x, y: q.y }; });   // one drop off the nib on its way from the pot
    PK = k; PATH = { lands, drips, pot: RIG.hand(U_DIP).tip }; return PATH;
  }

  // ---- THE MARK: the nib re-inks the creature's own outline. Where it first sweeps across a wing, that wing's feathers get a
  // thick bouncy contour (ink outside their edge, a cream rim outside the ink, like every creature in the chapter) running
  // out from that feather to both ends of the wing. Only the outer half of each feather: the eyes are never covered ----
  const EC = [RIG.EYE.x, RIG.EYE.y];
  function contour(c, t, Z, u){
    const RV = OPHAN.toon.reveal(Z, u), bv = Math.floor(t*5);   // the same reveal the boss paints its cream cut-outs from
    for (const w of Z.wings){
      if (w.vis < .5) continue;
      const Wg = RIG.WINGS[w.i], m = w.m, rv = RV.get(w), i0 = rv.i0;
      const n = Wg.feathers.length;
      for (let g = 0; g < 3; g++){   // one fat glossy outline per scallop, along its fringe of feather tips, running away from the touch
        let K = Wg.feathers.map((_, k) => k).filter((k) => Math.floor(k*3/n) === g); const back = K[K.length - 1] <= i0; if (back) K = K.reverse();
        const pts = []; let wet = 0;
        for (const k of K){ const fk = rv.f[k]; if (fk <= 0) break; const q = Wg.feathers[k]; let E = [q.l[9], q.sp[10], q.r[9]]; if (back) E = E.reverse();
          pts.push(...E.slice(0, Math.max(1, Math.ceil(E.length*fk)))); wet = Math.max(wet, rv.wet[k]); }
        if (pts.length < 2 || wet < .03) continue;
        const mid = Wg.feathers[K[K.length >> 1]].sp[3];
        ribbon(c, pts.map(([x, y]) => RIG.apply(m, x, y)), RIG.apply(m, mid[0], mid[1]), g*7 + w.i*31 + (w.side > 0 ? 3 : 0), bv, K.includes(i0), wet);   // dries a second after it is inked, back to the boss's own line by u .88
      }
    }
  }
  // a ribbon laid OUTSIDE a contour (away from in), swelling and thinning, cream rim beyond it. wet 1: fat and glossy with a
  // white specular dash (gloss); 0: gone, the boss's own line under it
  function ribbon(c, Pt, inn, seed, bv, gloss, wet){
    const m = Pt.length; if (m < 2) return;
    const N = Pt.map((p, i) => { const a = Pt[Math.max(0, i - 1)], b = Pt[Math.min(m - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let nx = -(b[1] - a[1])/l, ny = (b[0] - a[0])/l;
      if (Math.hypot(p[0] + nx*.01 - inn[0], p[1] + ny*.01 - inn[1]) < Math.hypot(p[0] - inn[0], p[1] - inn[1])){ nx = -nx; ny = -ny; } return [nx, ny]; });
    const W = Pt.map((p, i) => { const e = Math.min(1, (i + .6)/2.5, (m - 1 - i + .6)/2.5); return (.022 + .032*Math.pow(Math.sin(i*.8 + seed), 2))*(.3 + .9*wet)*Math.min(1, wet*4)*e*(1 + .15*n1(i*.5, seed + bv)); });
    for (const [col, ex] of [[CREAM, .016], [INK, 0]]){
      c.fillStyle = col; c.beginPath();
      for (let i = 0; i < m; i++){ const p = Pt[i], d = -.004; i ? c.lineTo(p[0] + N[i][0]*d, p[1] + N[i][1]*d) : c.moveTo(p[0] + N[i][0]*d, p[1] + N[i][1]*d); }
      for (let i = m - 1; i >= 0; i--){ const p = Pt[i], d = W[i] + (ex ? ex*Math.min(1, W[i]/.015) : 0); c.lineTo(p[0] + N[i][0]*d, p[1] + N[i][1]*d); }
      c.closePath(); c.fill(); }
    if (gloss && wet > .05 && m > 4){ c.strokeStyle = 'rgba(255,252,240,' + (.9*wet).toFixed(3) + ')'; c.lineWidth = .012; c.beginPath();   // the wet gloss: one dash per wing, on the feather the nib touched
      for (let i = Math.floor(m*.25); i <= Math.floor(m*.6); i++){ const p = Pt[i], d = W[i]*.62; i > Math.floor(m*.25) ? c.lineTo(p[0] + N[i][0]*d, p[1] + N[i][1]*d) : c.moveTo(p[0] + N[i][0]*d, p[1] + N[i][1]*d); }
      c.stroke(); }
  }
  // a splash: 3 to 5 flat black blobs with cream rims thrown 10-20 px off the point, popping out and shrinking away
  function splash(c, X, Y, j, g, k, dir = null){
    const nS = 3 + Math.floor(hn(j, 1)*3), out = Math.min(1, g*4), sh = 1 - .4*sm(.55, 1, g), ga = c.globalAlpha; c.globalAlpha = ga*(1 - sm(.6, 1, g));
    for (const [col, ex] of [[CREAM, .014], [INK, 0]]){ c.fillStyle = col; c.beginPath();
      for (let i = 0; i < nS; i++){ const a = dir === null ? hn(j, i + 3)*TAU : dir + (hn(j, i + 3) - .5)*1.3, d = (dir === null ? .14 + .14*hn(j, i + 9) : .2 + .2*hn(j, i + 9))*out*k, r = (.045 + .025*hn(j, i + 15))*k*sh + ex*Math.min(1, sh*3);
        if (r <= ex*.5) continue; const x = X + Math.cos(a)*d, y = Y + Math.sin(a)*d; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      c.fill(); }
    c.globalAlpha = ga;
  }
  // the marks off the nib: a splash at every touch down and lift, gone in .3 s (never on the great eye); and the one drop it
  // sheds on the way from the pot, falling onto the floor (its shadow closing in under it) and staying there
  function splats(c, H, t, u){
    const { lands, drips } = fullPath(), D = drips[0], span = (RIG.HAND_WIN.paint[1] - RIG.HAND_WIN.paint[0])*RIG.HAND_DUR;
    const fall = cl((u - D.u + .014)/.014);
    if (fall > 0 && fall < 1){ const o = .16*(1 - fall);
      c.fillStyle = SHADOW_A; c.beginPath(); c.arc(D.x - o, D.y + o, .028, 0, TAU); c.fill();
      c.fillStyle = INK; c.beginPath(); c.ellipse(D.x, D.y - .02*(1 - fall), .032, .042, 0, 0, TAU); c.fill();
      c.fillStyle = CREAM; c.beginPath(); c.arc(D.x - .01, D.y - .03*(1 - fall) - .012, .009, 0, TAU); c.fill(); }
    if (fall >= 1) splash(c, D.x, D.y, 77, .35, .6);   // landed: a small floor splat that dries where it fell
    if (H.paint <= 0) return;
    lands.forEach((L, j) => { const age = (H.paint - L.s)*span;
      if (age < 0 || age > .3 || Math.hypot(L.x - EC[0], L.y - EC[1]) < .5) return;
      splash(c, L.x, L.y, j, age/.3, 1, Math.atan2(L.y - EC[1], L.x - EC[0])); });   // thrown outward, off the wing onto the floor
  }
  // the ink pot on the floor beside the boss, from above: a glossy black squat body round its cream-rimmed mouth, black ink
  // inside with a white glint, a short paper label on its side, an ink ring on the floor round its foot
  function pot(c, X, Y, al, dip, t){
    c.save(); c.globalAlpha = al; c.translate(X, Y); c.scale(1.5, 1.5); c.lineCap = 'round';
    c.fillStyle = SHADOW_A; c.beginPath(); c.ellipse(-.1, .12, .36, .32, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(30,21,19,0.6)'; c.lineWidth = .022; c.beginPath(); c.ellipse(.01, .03, .4, .37, 0, 0, TAU); c.stroke();   // the ring on the floor
    c.fillStyle = CREAM; c.beginPath(); c.arc(0, 0, .335, 0, TAU); c.fill();   // the body: cream rim, black
    c.fillStyle = INK; c.beginPath(); c.arc(0, 0, .31, 0, TAU); c.fill();
    c.strokeStyle = CREAM; c.lineWidth = .075; c.lineCap = 'butt'; c.beginPath(); c.arc(0, 0, .25, .55, 1.75); c.stroke();   // the paper label
    c.strokeStyle = INK; c.lineWidth = .012; c.beginPath(); c.arc(0, 0, .25, .78, 1.0); c.moveTo(.25*Math.cos(1.15), .25*Math.sin(1.15)); c.arc(0, 0, .25, 1.15, 1.45); c.stroke();   // its lettering
    c.lineCap = 'round'; c.strokeStyle = 'rgba(255,250,236,0.9)'; c.lineWidth = .035; c.beginPath(); c.arc(0, 0, .25, 3.55, 4.35); c.stroke();   // the gloss on the body
    c.fillStyle = 'rgba(255,250,236,0.9)'; c.beginPath(); c.arc(.2*Math.cos(4.6), .2*Math.sin(4.6), .016, 0, TAU); c.fill();
    c.strokeStyle = CREAM; c.lineWidth = .045; c.beginPath(); c.arc(0, 0, .155, 0, TAU); c.stroke();   // the mouth's cream rim
    c.strokeStyle = INK; c.lineWidth = .016; c.beginPath(); c.arc(0, 0, .18, 0, TAU); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(0, 0, .133, 0, TAU); c.fill();   // the ink
    if (dip > .01){ c.strokeStyle = 'rgba(243,230,200,' + (.7*dip).toFixed(3) + ')'; c.lineWidth = .012; c.beginPath(); c.arc(0, 0, .03 + .07*(1 - dip), 0, TAU); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.ellipse(-.05, -.05, .042, .016, -.7, 0, TAU); c.fill();   // the ink's white glint
    c.restore();
  }
  // a keyhole polygon: a big box with the eye cut out of it, as ONE contour (game tech's masks have no evenodd)
  const keyhole = (ex, ey, r) => { const P = [[-9, -9], [9, -9], [9, ey], [ex + r, ey]]; for (let i = 0; i <= 32; i++){ const a = -i/32*TAU; P.push([ex + Math.cos(a)*r, ey + Math.sin(a)*r]); }
    P.push([9, ey + 1e-4], [9, 9], [-9, 9]); return P; };

  return {
    hand(c, x, y, R, t, H){
      if (!BK) bake();
      const u = KIT.uOf(H);
      const HW = RIG.HAND_WIN, al = sm(0, .08, u)*(1 - sm(.93, 1, u)); if (al < .01) return;
      const q = Math.floor(t*12), f = SEQ[q%SEQ.length], b = BEND[f];   // on twos
      const { pot: PT } = fullPath(), dip = sm(U_DIP - .045, U_DIP, u)*(1 - sm(U_DIP + .01, U_DIP + .05, u));   // the dip: down into the pot, a beat, out
      const tip = { x: H.tip.x + (PT.x - H.tip.x)*dip, y: H.tip.y + (PT.y - H.tip.y)*dip }, z = cl(H.z)*(1 - .8*dip);
      // the nib landing: the glove squashes ~8% and the pen bows, springing back on twos
      const P = H.stroke.pts, n = P.length; let j = n - 1; while (j > 0 && P[j - 1].down > .5) j--;
      const land = (P[n - 1] && P[n - 1].down > .5) ? Math.floor(H.paint*(n - 1 - j)/(n - 1)*(HW.paint[1] - HW.paint[0])*RIG.HAND_DUR*12)/12 : 9;
      const sq = Math.max(H.touch*Math.exp(-land/.12), dip*sm(U_DIP - .02, U_DIP, u));
      const lean = .45*(1 - sm(0, HW.paint[0], u)) - .35*sm(HW.paint[1], 1, u), ang = H.ang + lean + TURN;
      const sc = G*H.scale*(1 + .025*b)*(1 - .05*H.touch);
      const place = (g) => { g.translate(tip.x, tip.y); g.rotate(ang); g.scale(sc*(1 - .12*sq), sc*(1 + .1*sq)); };
      c.save(); c.translate(x, y); c.scale(R, R); c.lineCap = c.lineJoin = 'round';
      const Z = RIG.pose(t, window.OPH_PH ?? 3), eye = RIG.apply(Z.body.m, RIG.EYE.x, RIG.EYE.y);
      contour(c, t, Z, u);
      splats(c, H, t, u);
      pot(c, PT.x, PT.y, al, dip, t);
      { const S = SH[0], k = 1 + .45*z;   // the shadow: one flat hard rust shape, tight under the nib at contact, bigger high up, falling down-left
        c.save(); path(c, keyhole(eye[0], eye[1], .66)); c.clip();   // never over the great eye
        const tg = 1 - .55*H.touch; c.globalCompositeOperation = 'multiply'; c.globalAlpha = (1 - .3*z)*(1 - .35*H.touch)*(1 - sm(.86, .95, u))*al; c.translate((-.6 - 3*z)*tg, (.6 + 3.2*z)*tg); place(c); c.scale(1 - .25*H.touch, 1 - .25*H.touch); c.translate(2.2, -.3); c.scale(k, k); c.translate(-2.2, .3); lay(c, S.cv, S.pad); c.restore(); }
      if (H.touch > .15 && P[n - 1].down > .5){ c.fillStyle = INK; c.beginPath(); c.arc(P[n - 1].x, P[n - 1].y, .05*H.touch, 0, TAU); c.fill(); }   // the nib's wet bite
      c.save(); c.globalAlpha = al; place(c);
      lay(c, BK[f]); pen(c, .12*sq, sm(U_DIP, U_DIP + .03, u)*(1 - sm(HW.paint[0], HW.paint[0] + .02, u))); lay(c, FT[f]);
      if (sq > .15){ c.strokeStyle = INK; c.lineWidth = .06*sq; c.lineCap = 'round'; c.beginPath();   // the bounce: two motion arcs off the cuff
        for (const sd of [-1, 1]){ const cy = -.4 + sd*1.15; c.moveTo(4.25, cy - .22); c.quadraticCurveTo(4.55, cy, 4.25, cy + .22); } c.stroke(); }
      c.restore();
      c.restore();
    },
  };
})();
