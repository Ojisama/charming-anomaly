import * as PIXI from 'pixi.js'
import { OPHAN, OPHAN_HANDKIT, OPHAN_HANDS, OPHAN_RIG, hh } from '../page.js'
// THE GEODE'S HAND (holo): a trading-card hand rolling FOIL onto the boss. Drawn, not traced: seen from above, a fist
// round the short fat handle of a brayer (four fingers wrapped over the handle, the thumb along its top), the forearm
// running off up-right; thick near-black ink and two cel tones like the Geode cast, under a diagonal thin-film rainbow.
// The brayer: a U of wire from the handle to a wide pearl drum. It leaves the hero of the change, a band of rainbow foil
// as wide as the drum laid ON the boss (the boss shows through it), inked at both edges.
// Baked once, in TOOL SPACE (origin the drum's centre, x toward the handle, y down, boss radii at scale 1): the hand and
// tool at two foil phases, the hand's silhouette at three blurs. Per frame: shadow + two hand sprites + paths.
OPHAN_HANDS.holo = (() => {
  const K = OPHAN_HANDKIT, TAU = Math.PI*2, INK = '#0b0714';
  const hh = (i, j) => { const s = Math.sin(i*127.1 + j*311.7)*43758.5453; return s - Math.floor(s); };
  const filmC = (t, k = .45, b = .55, a = 1) => { const f = (o) => Math.round(255*Math.max(0, Math.min(1, b + k*Math.cos(TAU*(t + o))))); return `rgba(${f(0)},${f(.33)},${f(.67)},${a})`; };
  // the skin's two cel tones sit at MID brightness, where the pass's foil is deepest (FOIL_FRAG: fv*(.1 + 1.35L) below L .72)
  const SKIN = '#9a78e0', SKIN_SH = '#563a9e', PEARL = '#ece8f6', PEARL_SH = '#9890b6', HANDLE = '#2c2452', HANDLE_HI = '#6e62b0';
  const RL = 1.1, RD = .4;   // the drum: length (= the band's width) and diameter, tool units
  const BOX = [-.45, -4.95, 4.75, .85], KB = 220, LW = .055;   // the bake's box (tool units), px per unit, the ink weight
  const FORE = [.6, -.8], PERP = [.8, .6];   // the forearm's heading (tool space: off up and to the right) and its lit side

  // ---- the drawing, in tool units ----
  const cap = (g, x0, y0, x1, y1, r) => { const a = Math.atan2(y1 - y0, x1 - x0); g.beginPath(); g.arc(x0, y0, r, a + Math.PI/2, a - Math.PI/2); g.arc(x1, y1, r, a - Math.PI/2, a + Math.PI/2); g.closePath(); };
  // a cel fill: a hard step from the lit tone to the shade across (x0,y0)->(x1,y1)
  const cel = (g, x0, y0, x1, y1, lit, sh, at = .62) => { const G = g.createLinearGradient(x0, y0, x1, y1); G.addColorStop(0, lit); G.addColorStop(at, lit); G.addColorStop(at + .001, sh); G.addColorStop(1, sh); return G; };
  const ink = (g, k = 1) => { g.strokeStyle = INK; g.lineWidth = LW*k; g.lineJoin = g.lineCap = 'round'; g.stroke(); };
  const hatch = (g, L) => { g.beginPath(); for (const [x0, y0, x1, y1] of L){ g.moveTo(x0, y0); g.lineTo(x1, y1); } ink(g, .75); };
  function tool(g){
    g.save(); g.transform(1, 0, -.14, 1, 0, 0);   // tilted: the far end of the drum leans back
    // the U frame: one black wire from each end of the axle, swept back and joined at the ferrule
    g.beginPath(); for (const s of [-1, 1]){ g.moveTo(0, s*(RL/2 + .08)); g.lineTo(.12, s*(RL/2 + .08)); g.quadraticCurveTo(.6, s*(RL/2 + .06), .8, s*.06); }
    g.strokeStyle = INK; g.lineWidth = LW*1.5; g.lineCap = g.lineJoin = 'round'; g.stroke();
    // the drum seen from above: a pearl cylinder, a hot highlight line, darker underside, dark end caps
    const G = g.createLinearGradient(-RD/2, 0, RD/2, 0);
    G.addColorStop(0, '#5e5686'); G.addColorStop(.18, '#c9c2e4'); G.addColorStop(.3, '#ffffff'); G.addColorStop(.42, '#e2ddf2'); G.addColorStop(.75, '#a49cc4'); G.addColorStop(1, '#3c3462');
    g.beginPath(); g.rect(-RD/2, -RL/2, RD, RL); g.fillStyle = G; g.fill();
    g.beginPath(); for (const xx of [-.06, .07]){ g.moveTo(xx, -RL/2 + .06); g.lineTo(xx, RL/2 - .06); } g.strokeStyle = 'rgba(11,7,20,.28)'; g.lineWidth = .014; g.stroke();
    for (const s of [-1, 1]){ g.beginPath(); g.ellipse(0, s*(RL/2 - .01), RD/2 + .01, .055, 0, 0, TAU); g.fillStyle = HANDLE; g.fill(); ink(g, .8); }
    g.beginPath(); g.rect(-RD/2, -RL/2, RD, RL); ink(g, 1.3);
    // the ferrule and the fat handle (mostly under the fist), its pommel past the little finger
    cap(g, .76, 0, .98, 0, .1); g.fillStyle = cel(g, 0, -.1, 0, .1, '#e0dcf0', '#8a82aa', .5); g.fill(); ink(g);
    cap(g, .95, 0, 2.45, 0, .17); g.fillStyle = cel(g, 0, -.17, 0, .17, HANDLE_HI, HANDLE, .4); g.fill(); ink(g, 1.1);
    g.beginPath(); g.arc(2.48, 0, .18, 0, TAU); g.fillStyle = cel(g, 2.35, -.12, 2.6, .12, '#e0dcf0', '#8a82aa', .5); g.fill(); ink(g);
    g.restore();
  }
  // the fist, from above: a tapered forearm, the back of the hand, four fingers wrapped over the handle, the thumb over them
  const FING = [1.2, 1.5, 1.8, 2.08], W0 = [1.32, -1.25], W1 = [2.25, -1.08], FL = 4.4;
  const fa = (P, k, o) => [P[0] + FORE[0]*k + PERP[0]*o, P[1] + FORE[1]*k + PERP[1]*o];
  function handParts(g, sil){
    const fill = (st) => { g.fillStyle = sil ? '#000' : st; g.fill(); if (!sil) ink(g); };
    // forearm: narrow at the wrist, the muscle swelling on the lit side, wider off the bake (where it fades out)
    g.beginPath(); g.moveTo(...W0); g.quadraticCurveTo(...fa(W0, .25, -.12), ...fa(W0, .55, -.04));   // the wrist bone's bulge
    g.quadraticCurveTo(...fa(W0, 2.2, -.2), ...fa(W0, FL, -.42));
    g.lineTo(...fa(W1, FL, .45)); g.quadraticCurveTo(...fa(W1, 2, .38), ...fa(W1, .55, .05)); g.quadraticCurveTo(...fa(W1, .25, .12), ...W1); g.closePath();
    { const A = fa(W1, 1, .2), B = fa(W0, 1, -.1); fill(cel(g, ...A, ...B, SKIN, SKIN_SH, .62)); }
    // fingers first (their roots go under the back of the hand): each wraps over the handle, its curled tip below it
    const FL4 = [.5, .58, .52, .4], FA = [-.03, -.05, -.08, -.12];
    FING.forEach((x, i) => { const L = FL4[i], w = i === 3 ? .125 : .14; cap(g, x, -.44, x + FA[i], -.44 + L + .2, w); fill(cel(g, x, -.5, x, -.44 + L + .2, SKIN, SKIN_SH, .5)); });
    if (!sil){ FING.forEach((x) => { g.beginPath(); g.moveTo(x - .11, .03); g.quadraticCurveTo(x, .08, x + .1, .03); ink(g, .6); });   // the middle joints, bent over the handle
      hatch(g, FING.slice(0, 3).flatMap((x) => [[x + .06, -.3, x + .05, -.08], [x + .09, -.26, x + .08, -.1]])); }   // hatching down each finger's shade side
    // the back of the hand: knuckle edge along the handle, narrowing to the wrist
    g.beginPath(); g.moveTo(1.02, -.5); g.quadraticCurveTo(1.6, -.62, 2.27, -.44); g.quadraticCurveTo(2.47, -.8, ...W1); g.lineTo(...W0); g.quadraticCurveTo(1.0, -1.0, 1.02, -.5); g.closePath();
    fill(cel(g, 1.8, -.5, 1.6, -1.15, SKIN, SKIN_SH, .55));
    if (!sil){
      FING.forEach((x) => { g.beginPath(); g.arc(x, -.52, .11, Math.PI*1.1, Math.PI*1.9); ink(g, .8); });   // the knuckles
      g.beginPath(); g.moveTo(1.9, -.68); g.quadraticCurveTo(1.98, -.9, 2.04, -1.06); ink(g, .5);   // a tendon
      // engraved hatching: the knuckles' shadow side, and the forearm's
      hatch(g, [[1.13, -.66, 1.3, -.9], [1.24, -.64, 1.42, -.92], [1.36, -.66, 1.5, -.86]]);
      hatch(g, [0, 1, 2].map((j) => [...fa(W0, .7 + .25*j, .1 + .08*j), ...fa(W0, 1.9 + .3*j, .04 + .08*j)]));
    }
    // the thumb: from the side of the palm, over the handle on the near side and across the index finger, its nail from above
    g.beginPath(); g.moveTo(1.06, -.86); g.quadraticCurveTo(.86, -.5, .98, -.12); g.quadraticCurveTo(1.08, .16, 1.3, .16);
    g.quadraticCurveTo(1.48, .14, 1.46, .0); g.quadraticCurveTo(1.36, -.2, 1.24, -.46); g.quadraticCurveTo(1.2, -.7, 1.3, -.92); g.closePath();
    fill(cel(g, .9, -.3, 1.4, -.1, SKIN, SKIN_SH, .55));
    if (!sil){ g.beginPath(); g.ellipse(1.33, .06, .085, .065, -.25, 0, TAU); g.fillStyle = '#f6f3fc'; g.fill(); ink(g, .6);
      g.beginPath(); g.moveTo(1.02, -.3); g.quadraticCurveTo(1.12, -.24, 1.2, -.3); ink(g, .55); }   // the nail; the thumb's joint
  }
  // the bakes
  const W = Math.ceil((BOX[2] - BOX[0])*KB), Hh = Math.ceil((BOX[3] - BOX[1])*KB);
  const cv = () => { const c = K.mk(W, Hh), g = c.getContext('2d'); g.setTransform(KB, 0, 0, KB, -BOX[0]*KB, -BOX[1]*KB); return [c, g]; };
  // a generator: the warm-up steps it between frames (baking), a first draw that finds it unfinished finishes it
  let ART = null, SHD = null, gen = null;
  function* bake(){
    STR = bakeStripes(); yield;
    const [Sc, sg] = cv(); handParts(sg, true);   // the hand's silhouette (the foil's mask, and the shadow's shape)
    const [Tc, tg] = cv(); tool(tg); handParts(tg, false); yield;
    const sil = Sc.getContext('2d').getImageData(0, 0, W, Hh).data, base = Tc.getContext('2d').getImageData(0, 0, W, Hh).data; yield;
    // the card's foil, per pixel, over ALL the skin: a soft diagonal multi-hue film at the cel tone's own lightness (ink stays ink),
    // a white specular streak across the fist, the fist's underside (the curled fingertips under the handle) darker. Two phases,
    // crossfaded with u, so the foil shifts as the hand moves. The forearm fades out before the bake's edge
    const M = [(W0[0] + W1[0])/2, (W0[1] + W1[1])/2];
    const art = [];
    for (const ph of [0, .18]){ const [F, f] = cv(); f.setTransform(1, 0, 0, 1, 0, 0); const im = f.createImageData(W, Hh), D = im.data;
      for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++){
        if (!x && y % 48 === 0) yield;
        const o = (y*W + x)*4, X = x/KB + BOX[0], Y = y/KB + BOX[1], along = (X - M[0])*FORE[0] + (Y - M[1])*FORE[1];
        const fade = along < 3.1 ? 1 : Math.max(0, 1 - (along - 3.1)/1);
        D[o] = base[o]; D[o + 1] = base[o + 1]; D[o + 2] = base[o + 2]; D[o + 3] = base[o + 3]*(sil[o + 3] > 0 ? fade : 1);
        if (sil[o + 3] < 128) continue; const Lm = (.3*D[o] + .59*D[o + 1] + .11*D[o + 2])/255; if (Lm < .2) continue;
        const d = (X - Y)*.7071, q = d*.32 + ph, spec = Math.max(0, 1 - Math.abs(d - 1.99 - ph*.6)/.04), under = Y > .1 && X > .9 ? .62 : 1;
        for (let c = 0; c < 3; c++){ const fc = .5 + .5*Math.cos(TAU*(q + c*.33)), fo = 255*Math.min(1, fc*.62 + Lm*.18);
          D[o + c] = Math.round((D[o + c]*.5 + fo*.5)*under + (255 - D[o + c])*spec*.8); }
      }
      f.putImageData(im, 0, 0); art.push(F); }
    const F = art[0], shd = [];
    for (const b of [2, 6, 14]){ yield; const c = K.mk(W, Hh), g = c.getContext('2d'); g.filter = 'blur(' + b + 'px)'; g.drawImage(Sc, 0, 0); g.filter = 'none';
      g.globalCompositeOperation = 'source-in'; g.fillStyle = '#100820'; g.fillRect(0, 0, W, Hh);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(F, 0, 0); shd.push(c); }   // the shadow fades with the forearm too
    ART = art; SHD = shd; gen = null;
  }
  const baking = () => (ART ? [].values() : (gen ??= bake()));
  const at = (c, img) => c.drawImage(img, BOX[0], BOX[1], W/KB, Hh/KB);

  // THE MARK: one straight ribbon of foil the drum's width across the boss, as far each way as the drum has rolled (and, once
  // it lifts, all of it), a dab where it first touched. The ribbon is a baked texture of the drum's seven stripes side by side, drawn as one rotated
  // quad (so its edges are smooth), at 28%; a brighter dab of the same stripes at its start, inked on its leading side; one
  // glint travelling along it, the only bright thing. The great eye is cut out of it, the cut feathered
  const EYE = { x: OPHAN_RIG.EYE.x, y: OPHAN_RIG.EYE.y, r: .38 }, NS = 7;
  const eyeCut = (c, r) => { c.beginPath(); c.rect(-4, -4, 8, 8); c.moveTo(EYE.x + r, EYE.y); c.arc(EYE.x, EYE.y, r, 0, TAU); c.clip('evenodd'); };
  let STR = null, DSH = null;
  function bakeStripes(){   // x along the ribbon, y across it: seven touching stripes, soft at both edges and at the ends
    const SW = 256, SH = NS*18, cv = K.mk(SW, SH), g = cv.getContext('2d');
    for (let k = 0; k < NS; k++){ g.fillStyle = filmC(k/NS*.9 + .05, .5, .55); g.fillRect(0, k*18, SW, 18); }
    g.globalCompositeOperation = 'destination-in';
    const Gy = g.createLinearGradient(0, 0, 0, SH); Gy.addColorStop(0, 'rgba(0,0,0,0)'); Gy.addColorStop(.03, '#000'); Gy.addColorStop(.97, '#000'); Gy.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = Gy; g.fillRect(0, 0, SW, SH);
    const Gx = g.createLinearGradient(0, 0, SW, 0); Gx.addColorStop(0, 'rgba(0,0,0,0)'); Gx.addColorStop(.04, '#000'); Gx.addColorStop(.98, '#000'); Gx.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = Gx; g.fillRect(0, 0, SW, SH);
    return cv;
  }
  function band(c, A, T, w, t, D, sw){
    const dx = T.x - A.x, dy = T.y - A.y, L = Math.hypot(dx, dy), a = L > 1e-3 ? Math.atan2(dy, dx) : 0;
    // the ribbon: three passes cut ever wider round the eye, a third of the alpha each, so the cut's edge is feathered
    if (L > .02) for (const r of [EYE.r - .06, EYE.r, EYE.r + .06]){
      c.save(); eyeCut(c, r); c.translate(A.x, A.y); c.rotate(a); c.globalAlpha = .28/3; c.drawImage(STR, 0, -w/2, L, w); c.restore();
    }
    // both long edges: a faint ink line with a cyan one just inside, so the ribbon holds its shape over the pale wings and slab
    if (L > .02){ c.save(); eyeCut(c, EYE.r); c.translate(A.x, A.y); c.rotate(a); c.lineCap = 'round';
      for (const [d, col, al, lw] of [[w/2, INK, .5, .018], [w/2 - .02, '#7fdcf6', .55, .012]]){ c.beginPath(); for (const sg of [-1, 1]){ c.moveTo(.03, sg*d); c.lineTo(L - .03, sg*d); }
        c.globalAlpha = al; c.strokeStyle = col; c.lineWidth = lw; c.stroke(); }
      c.restore(); }
    // the dab: the same stripes, brighter, a rounded block the band's width, inked on its leading edge only
    { const h = w/2, l = w*.36, q = .08; c.save(); eyeCut(c, EYE.r); c.translate(D.x, D.y); c.rotate(a);
      c.beginPath(); c.moveTo(q, -h); c.lineTo(l - q, -h); c.quadraticCurveTo(l, -h, l, -h + q); c.lineTo(l, h - q); c.quadraticCurveTo(l, h, l - q, h);
      c.lineTo(q, h); c.quadraticCurveTo(0, h, 0, h - q); c.lineTo(0, -h + q); c.quadraticCurveTo(0, -h, q, -h); c.closePath();
      c.clip(); c.globalAlpha = .38; c.drawImage(STR, 0, -h, l, w); c.restore();
      c.save(); eyeCut(c, EYE.r); c.translate(D.x, D.y); c.rotate(a); c.beginPath(); c.moveTo(l, -h + q); c.lineTo(l, h - q); c.globalAlpha = .9; c.strokeStyle = INK; c.lineWidth = .025; c.lineCap = 'round'; c.stroke(); c.restore(); }
    // one glint travelling along it: a soft bar of light across the ribbon
    if (L > .1){ const g = (t*.45) % 1, k = Math.sin(Math.PI*g); c.save(); eyeCut(c, EYE.r); c.translate(A.x, A.y); c.rotate(a); c.globalCompositeOperation = 'screen';
      c.beginPath(); c.moveTo(L*g, -w*.48); c.lineTo(L*g + .05, w*.48); c.lineCap = 'round';
      for (const [al, lw] of [[.3, .14], [.85, .035]]){ c.globalAlpha = al*k; c.strokeStyle = '#ffffff'; c.lineWidth = lw; c.stroke(); } c.restore(); }
    // the lift-off: one quick foil sweep the ribbon's length, the stripes flaring as it passes
    if (sw > 0 && sw < 1 && L > .1){ const X = L*sw, k = Math.sin(Math.PI*sw); c.save(); eyeCut(c, EYE.r); c.translate(A.x, A.y); c.rotate(a);
      c.beginPath(); c.rect(Math.max(0, X - .35), -w/2, Math.min(L, X + .1) - Math.max(0, X - .35), w); c.clip();
      c.globalCompositeOperation = 'screen'; c.globalAlpha = .7*k; c.drawImage(STR, 0, -w/2, L, w);
      c.beginPath(); c.moveTo(X, -w/2); c.lineTo(X + .06, w/2); c.globalAlpha = .9*k; c.strokeStyle = '#ffffff'; c.lineWidth = .05; c.stroke(); c.restore(); }
  }
  // foil shards sprayed from the drum's contact line: few and big, crystal-cut, inked, spinning
  function flakes(c, T, t, touch, dir){
    if (touch < .05) return;
    for (let i = 0; i < 6; i++){
      const per = .7 + .4*hh(i, 1), a = ((t/per) + hh(i, 2))%1;
      const sd = (hh(i, 3) - .5)*RL, ang = dir + Math.PI + (hh(i, 4) - .5)*1.3, dist = .12 + .55*a;
      const x = T.x - Math.sin(dir)*sd + Math.cos(ang)*dist, y = T.y + Math.cos(dir)*sd + Math.sin(ang)*dist, r = (.12 + .07*hh(i, 6))*(1 - a*.6)*touch, sp = t*(3 + 2*hh(i, 8)) + i;
      shard(c, x, y, r, sp, i, 1 - a*a);
    }
    c.globalAlpha = 1;
  }
  function shard(c, x, y, r, sp, i, al){
    const cs = Math.cos(sp)*r, sn = Math.sin(sp)*r;
    c.beginPath(); c.moveTo(x + cs, y + sn); c.lineTo(x - sn*.35, y + cs*.35); c.lineTo(x - cs*.8, y - sn*.8); c.lineTo(x + sn*.35, y - cs*.35); c.closePath();
    c.globalAlpha = al; c.fillStyle = i%2 ? '#e6f6ff' : '#7fdcf6'; c.fill(); c.strokeStyle = INK; c.lineWidth = .025; c.stroke();
    c.beginPath(); c.moveTo(x + cs, y + sn); c.lineTo(x - cs*.8, y - sn*.8); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = .014; c.stroke();
  }
  // at lift-off three shards drop off the drum and settle onto the ribbon, big and turning as they fall, then lie still
  function settle(c, f, w, e){
    if (e <= 0) return;
    const k = K.cl(e/.08), fall = 1 - k;
    for (let i = 0; i < 3; i++){ const P = onLine(f - .12 - .3*i), o = (hh(i, 11) - .5)*w*.7;
      shard(c, P.x - LY*o + .5*fall*fall, P.y + LX*o - .7*fall*fall, .13*(1 + .8*fall), 1.3*i + 4*fall, i, .3 + .7*k); }
    c.globalAlpha = 1;
  }
  // THE LINE the brayer rolls along: straight across the boss at the pose's own heading. The rig's painter path decides
  // nothing: over the paint window the drum rolls from one end of the line to the other, LS either side of the eye
  const LN = { x: 0, y: -.1, a: -.28 }, LX = Math.cos(LN.a), LY = Math.sin(LN.a), LS = 1.35;
  const onLine = (f) => ({ x: LN.x + LX*f, y: LN.y + LY*f });
  const poseTh = (F, Hc) => -.28 + .6*(F.ang - Hc.ang);

  return { bake: baking, hand(c, x, y, R, t, H){
    if (!ART || !DSH){ for (const it = baking(); !it.next().done;); DSH = c.createLinearGradient(-RD/2, 0, RD/2, 0); DSH.addColorStop(0, 'rgba(20,10,40,.6)'); DSH.addColorStop(.3, 'rgba(20,10,40,0)'); DSH.addColorStop(.55, 'rgba(20,10,40,0)'); DSH.addColorStop(1, 'rgba(20,10,40,.85)'); c.globalAlpha = .002; for (const cv of [...ART, ...SHD, STR]) c.drawImage(cv, 0, 0, .01, .01); c.globalAlpha = 1; }   // every bake registered on the bake frame
    const u = K.uOf(H), F = K.pose(H, u, t);
    // the pose: the drum on the rig's tool point, the handle pointing right and a little up (so the drum's axle stands across
    // the rig's sideways sweeps and it ROLLS), leaning in as it arrives and out as it lifts; bigger the higher it is
    // on the boss the drum rides the line, its axle square to it
    const W = OPHAN_RIG.HAND_WIN, k = F.contact, f = -LS + 2*LS*K.cl((u - W.paint[0])/(W.paint[1] - W.paint[0])), Tl = onLine(f), tip = { x: H.tip.x + (Tl.x - H.tip.x)*k, y: H.tip.y + (Tl.y - H.tip.y)*k };
    let th = poseTh(F, H); th += (LN.a - th)*k;
    const S = .95*H.scale*(1 - .04*H.touch);
    const roll = f + LS;
    c.save(); c.translate(x, y); c.scale(R, R);
    // the shadow: the hand's own silhouette, slid toward the boss (down-left) by the height, sharp as it comes down
    { const z = Math.min(1, F.z), a = .8*(.3 + .7*z)*F.al, i = z < .3 ? 0 : z < .65 ? 1 : 2;
      if (a > .01){ c.save(); c.globalAlpha = a; c.translate(tip.x + .4*F.L.x, tip.y + .4*F.L.y); c.rotate(th); c.scale(S, S); at(c, SHD[i]); c.restore(); } }
    // before it lands, a soft contact pre-shadow where the drum will meet the boss, darkening as it comes down
    { const a = .55*K.sm(.04, .26, u)*(1 - F.contact)*(u < .5 ? 1 : 0); if (a > .01){ const r = RL*S*.6, G = c.createRadialGradient(H.tip.x, H.tip.y, 0, H.tip.x, H.tip.y, r);
      G.addColorStop(0, 'rgba(10,4,24,.9)'); G.addColorStop(1, 'rgba(10,4,24,0)'); c.globalAlpha = a; c.fillStyle = G; c.beginPath(); c.arc(H.tip.x, H.tip.y, r, 0, TAU); c.fill(); c.globalAlpha = 1; } }
    // the stroke: from the dab to the rolling drum while it paints; once it lifts, from the dab to where it lifted off
    if (u > W.paint[0]){ const He = OPHAN_RIG.hand(W.paint[1]), A = onLine(-LS); band(c, A, onLine(f), RL*.95*He.scale*(1 - .04*He.touch), t, A, (u - W.paint[1])/.07);
      settle(c, f, RL*.95*He.scale, u - W.paint[1]); }
    flakes(c, tip, t, F.contact*F.al, th + Math.PI/2);
    if (F.al > .01){
      c.save(); c.translate(tip.x, tip.y); c.rotate(th); c.scale(S, S);
      const fx = K.sm(.1, .9, u); c.globalAlpha = F.al; at(c, ART[0]); c.globalAlpha = F.al*fx; at(c, ART[1]);   // the foil shifting as it moves
      // the drum turning: foil stripes along its axle, rolling round with the distance travelled
      c.save(); c.transform(1, 0, -.14, 1, 0, 0);   // the drum's own tilt (tool())
      c.globalAlpha = .85*F.al; c.drawImage(STR, -RD/2, -RL/2 + .06, RD, RL - .12);
      c.globalAlpha = F.al; c.fillStyle = DSH; c.fillRect(-RD/2, -RL/2 + .06, RD, RL - .12);
      for (let k = 0; k < 3; k++){ const ph = ((roll/(Math.PI*RD))*3 + k)/3 % 1, xx = -Math.cos(ph*Math.PI)*RD*.48, v = Math.sin(ph*Math.PI);
        c.beginPath(); c.moveTo(xx, -RL/2 + .07); c.lineTo(xx, RL/2 - .07); c.strokeStyle = 'rgba(11,7,20,' + (.5*v) + ')'; c.lineWidth = .018; c.stroke(); }
      c.beginPath(); c.moveTo(-RD*.2, -RL/2 + .08); c.lineTo(-RD*.2, RL/2 - .08); c.globalCompositeOperation = 'screen'; c.globalAlpha = .95*F.al; c.strokeStyle = '#ffffff'; c.lineWidth = .035; c.stroke(); c.globalCompositeOperation = 'source-over';
      c.globalAlpha = F.al; c.beginPath(); c.rect(-RD/2, -RL/2, RD, RL); c.strokeStyle = INK; c.lineWidth = LW*1.3; c.stroke();
      c.restore();
      c.restore();
    }
    c.globalAlpha = 1;
    c.restore();
  } };
})();
