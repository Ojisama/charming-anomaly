import { OPHAN, OPHAN_RIG, hh, mk, shade, mix, sheen, INK, TAU, PX, STY } from '../page.js'
// The Ophan in the Geode look (holo), round 37: a biblically accurate SERAPH as a rare foil boss card, on the shared rig.
// Shape and motion come from OPHAN_RIG (cru/rig.js): this file only renders them. Drawn like the Geode's own cast
// (src/holo.js): flat cel colour under a crisp near-black ink line (heavier on every silhouette), every blade a faceted
// thin-film foil split by a white ridge with the geode's rainbow facets along it and a holographic sheen sliding across
// each wing; a prismatic wheel for a halo, crystal shards for every effect.
// Contract: bg(c, w, t) paints a w x w tile floor; boss(c, x, y, R, t, ph) paints the boss centred at x,y, body radius ~R;
// post(c, w, t) a full-res overlay; attack(c, x, y, R, t, ph, atk, u, px, py) the boss in its attack pose and the attack.
OPHAN.holo = (() => {
  const INKC = '#0b0714';
  const cl = v => Math.max(0, Math.min(255, Math.round(v)));
  // the game's cosine thin-film palette (holo.js film())
  const filmA = (t, k = .45, b = .55) => [0, .33, .67].map(o => cl(255*(b + k*Math.cos(TAU*(t + o)))));
  const film = (t, k, b, a = 1) => { const [r, g, bl] = filmA(t, k, b); return `rgba(${r},${g},${bl},${(+a).toFixed(3)})`; };
  const lerpC = (A, B, k) => `rgb(${A.map((v, i) => cl(v + (B[i] - v)*k)).join(',')})`;
  const DKL = [24, 18, 46], DKH = [78, 66, 132], RDL = [96, 10, 26], RDH = [236, 52, 64];
  const floors = {};
  function floor(w){
    if (floors[w]) return floors[w];
    const S = Math.round(w*2), cv = mk(S, S), g = cv.getContext('2d'), im = g.createImageData(S, S), d = im.data;
    const G = 4, cs = S/G, P = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++)
      P.push({ x: (i + .2 + .6*hh(i, j + 9))*cs, y: (j + .2 + .6*hh(i + 4, j))*cs, slab: (i + j) < 2 && !(i === 1 && j === 1), k: P.length, a: hh(i*3, j*7)*TAU });
    const PAL = [[26, 24, 44], [34, 28, 58], [22, 38, 48], [40, 30, 54], [20, 22, 36], [30, 34, 56], [44, 30, 48]];
    const SLAB = [[226, 236, 214], [240, 220, 234], [216, 226, 242], [236, 232, 212]];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
      let d1 = 1e9, d2 = 1e9, b1 = null, b2 = null, vx = 0, vy = 0;
      for (const p of P){
        let dx = x - p.x, dy = y - p.y;
        if (dx > S/2) dx -= S; else if (dx < -S/2) dx += S;
        if (dy > S/2) dy -= S; else if (dy < -S/2) dy += S;
        const q = dx*dx + dy*dy;
        if (q < d1){ d2 = d1; b2 = b1; d1 = q; b1 = p; vx = dx; vy = dy; } else if (q < d2){ d2 = q; b2 = p; }
      }
      const e = Math.sqrt(d2) - Math.sqrt(d1), o = (y*S + x)*4;
      const tilt = (vx*Math.cos(b1.a) + vy*Math.sin(b1.a))/cs;
      let c;
      if (b1.slab){
        const s = SLAB[b1.k % 4], sh = 1 + tilt*.08;
        c = s.map(v => v*sh);
        if (e < 2.4) c = b2.slab ? [150, 150, 170] : filmA((x + y)/S*1.6, .5, .55);
        else if (e < 9 && !b2.slab) { const f = filmA((x - y)/S*2, .35, .6); c = c.map((v, i) => v*.55 + f[i]*.45); }
      } else {
        const s = PAL[b1.k % PAL.length], sh = 1 + tilt*.35 + (((x + y) % 7) === 0 ? .12 : 0);
        c = s.map(v => v*sh);
        if (e < 2.2) c = b2.slab ? filmA((x + y)/S*1.6, .5, .55) : [86, 80, 124];
      }
      d[o] = cl(c[0]); d[o + 1] = cl(c[1]); d[o + 2] = cl(c[2]); d[o + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    for (let k = 0; k < 26; k++){ g.fillStyle = `rgba(220,215,255,${(.25 + hh(k, 1)*.4).toFixed(3)})`; g.fillRect(hh(k, 2)*S, hh(k, 3)*S, 2, 2); }
    g.strokeStyle = 'rgba(200,200,255,.6)'; g.lineWidth = 1.5;
    for (let k = 0; k < 4; k++){ const x = hh(k, 5)*S, y = hh(k, 6)*S, r = 5 + hh(k, 7)*6; g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke(); }
    return floors[w] = cv;
  }

  const RIG = OPHAN_RIG;
  const sm = (a, b, v) => { const k = Math.min(1, Math.max(0, (v - a)/(b - a))); return k*k*(3 - 2*k); };
  const c01 = v => Math.min(1, Math.max(0, v));
  const poly = (g, V) => { g.beginPath(); V.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.closePath(); };
  const inkP = (g, V, lw, k = 1) => { poly(g, V); g.strokeStyle = INKC; g.lineWidth = lw*k; g.stroke(); };
  const lerp2 = (A, B, k) => [A[0] + (B[0] - A[0])*k, A[1] + (B[1] - A[1])*k];
  const GLOW = film(.97, .3, .72);
  const BEAM = [film(.55, .3, .72), film(.05, .32, .78)];
  const SHARD = [[film(.12, .24, .86), film(.22, .3, .45)], [film(.5, .3, .8), film(.55, .3, .42)], [film(.67, .3, .78), film(.7, .28, .4)]];
  const CRACK = [[-.36, -.16], [-.13, -.04], [-.07, .06], [.04, -.02], [.11, .09], [.36, .05]];
  const HUE = [.2, .28, .05];   // up, out, down: each pair's foil

  // ---- sprites: every part is baked once per texel density K (texels per R unit) as card art, then only TRANSFORMED.
  // bake(): the part drawn by fn(g, lw) in rig units over box [x0,y0,x1,y1], then its silhouette ink stamped under it
  // (the heavy outline of the Geode cast). m: the art before its ink (the sheen's mask)
  function bake(K, [x0, y0, x1, y1], fn){
    const pad = .08, W = Math.ceil((x1 - x0 + 2*pad)*K), H = Math.ceil((y1 - y0 + 2*pad)*K), cv = mk(W, H), g = cv.getContext('2d');
    const lw = Math.max(.02, 2.2/K);
    g.setTransform(K, 0, 0, K, (pad - x0)*K, (pad - y0)*K); g.lineJoin = 'round'; g.lineCap = 'round';
    fn(g, lw);
    const out = mk(W, H), q = out.getContext('2d'), sil = mk(W, H), s = sil.getContext('2d');
    s.drawImage(cv, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = INKC; s.fillRect(0, 0, W, H);
    const o = Math.max(2, K*.03);
    for (let i = 0; i < 8; i++) q.drawImage(sil, Math.cos(i/8*TAU)*o, Math.sin(i/8*TAU)*o);
    q.drawImage(cv, 0, 0);
    return { cv: out, m: cv, x: x0 - pad, y: y0 - pad, w: W/K, h: H/K };
  }
  const put = (c, S) => c.drawImage(S.cv, S.x, S.y, S.w, S.h);
  const boxOf = (pts, pad) => { let x0 = 9, y0 = 9, x1 = -9, y1 = -9; for (const [x, y] of pts){ x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]; };

  // ONE BLADE of the rig (q: spine sp, edges l/r, root to tip) as card art: two flat thin-film faces split down a white
  // ridge, the geode's rainbow facets along the ridge (a lit one and a shadowed one, the feather's own hue), a pale edge
  // where the light catches it, ink. Talons darken to a hot dark-red point
  function blade(g, q, hue, fh, lw){
    const L = q.l, Rt = q.r, S = q.sp, N = 10, out = [...L, ...Rt.slice(0, N).reverse()];
    poly(g, [...L, ...S.slice().reverse()]); g.fillStyle = film(hue, .28, .56); g.fill();
    poly(g, [...S, ...Rt.slice().reverse()]); g.fillStyle = film(hue + .06, .26, .36); g.fill();
    const F1 = [], F2 = [];
    for (let k = 1; k < N; k++){ F1.push(lerp2(S[k], L[k], .55)); F2.push(lerp2(S[k], Rt[k], .5)); }
    poly(g, [...S.slice(1, N), ...F1.reverse()]); g.fillStyle = film(fh, .45, .62); g.fill();
    poly(g, [...S.slice(1, N), ...F2.reverse()]); g.fillStyle = film(fh + .33, .42, .42); g.fill();
    if (q.tal){
      g.save(); poly(g, out); g.clip();
      const a = S[5], b = S[10], G = g.createLinearGradient(a[0], a[1], b[0], b[1]);
      G.addColorStop(0, 'rgba(120,10,30,0)'); G.addColorStop(.35, 'rgba(190,20,40,.95)'); G.addColorStop(1, 'rgba(30,6,14,1)');
      g.fillStyle = G; g.fillRect(-3, -3, 6, 6); g.restore();
    }
    g.beginPath(); S.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = lw*.7; g.stroke();
    g.beginPath(); L.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.strokeStyle = film(hue + .1, .12, .86); g.lineWidth = lw*1.4; g.stroke();
    inkP(g, out, lw);
  }
  // ONE WING (the rig's right wing, wing-local): its blades fanned (inner ones on top), the dark indigo arm and covert row
  // over them with a scalloped pale edge
  function bakeWing(K, i, keep){
    const Wg = RIG.WINGS[i], hue = HUE[i], pts = [];
    for (const q of Wg.feathers.concat(Wg.coverts)) pts.push(...q.l, ...q.r);
    pts.push([Wg.arm[0], Wg.arm[1]], [Wg.arm[2], Wg.arm[3]]);
    return bake(K, boxOf(pts, .1), (g, lw) => {
      for (let k = Wg.feathers.length - 1; k >= 0; k--) if (!keep || keep(k)) blade(g, Wg.feathers[k], hue + k*.006, hue*3 + k*.19, lw);
      g.beginPath(); g.moveTo(Wg.arm[0], Wg.arm[1]); g.lineTo(Wg.arm[2], Wg.arm[3]);
      g.strokeStyle = INKC; g.lineWidth = .15 + 2*lw; g.stroke(); g.strokeStyle = lerpC(DKL, DKH, .4); g.lineWidth = .15; g.stroke();
      for (const q of Wg.coverts){
        const out = [...q.l, ...q.r.slice(0, 10).reverse()];
        poly(g, out); g.fillStyle = lerpC(DKL, DKH, .45); g.fill();
        g.beginPath(); q.l.forEach((p, k) => k ? g.lineTo(...p) : g.moveTo(...p)); g.strokeStyle = lerpC(DKL, DKH, .95); g.lineWidth = lw*1.2; g.stroke();
        inkP(g, out, lw, 1.1);
      }
      g.beginPath(); g.moveTo(Wg.arm[0], Wg.arm[1] - .04); g.lineTo(Wg.arm[2], Wg.arm[3] - .04); g.strokeStyle = film(hue, .15, .85); g.lineWidth = lw*1.6; g.stroke();
    });
  }
  // one peeled feather on its own, in the wing's frame (the sword)
  function bakeFeather(K, i, n){
    const q = RIG.WINGS[i].feathers[n], hue = HUE[i];
    return bake(K, boxOf([...q.l, ...q.r], .06), (g, lw) => blade(g, q, hue + n*.006, hue*3 + n*.19, lw));
  }
  // the core where the wings meet: the rig's rosette of short blades round the great eye's socket, and its ring
  function bakeCore(K){
    const E = RIG.EYE;
    return bake(K, [-.5, -.6, .5, .4], (g, lw) => {
      RIG.CORE.forEach((q, k) => blade(g, q, .2 + (k % 2)*.05, k*.37, lw));
    });
  }
  // the great eye's socket (phase 3 only: the junction parts to show it)
  function bakeSocket(K){
    const E = RIG.EYE;
    return bake(K, [-.5, -.6, .5, .4], (g, lw) => {
      g.beginPath(); g.arc(E.x, E.y, .3, 0, TAU); g.fillStyle = lerpC(DKL, DKH, .3); g.fill(); g.strokeStyle = INKC; g.lineWidth = lw*1.2; g.stroke();
      g.beginPath(); g.arc(E.x, E.y, .36, 0, TAU); g.strokeStyle = INKC; g.lineWidth = .045 + lw*2; g.stroke();
      g.beginPath(); g.arc(E.x, E.y, .36, 0, TAU); g.strokeStyle = film(.25, .25, .78); g.lineWidth = .03; g.stroke();
    });
  }
  // the glory behind the great eye: rays of film colour, a soft light (added; kept faint so it lights, never fills)
  function bakeGlory(K){
    const W = Math.ceil(3.2*K), cv = mk(W, W), g = cv.getContext('2d');
    g.setTransform(K, 0, 0, K, W/2, W/2);
    const G = g.createRadialGradient(0, 0, 0, 0, 0, 1.6);
    G.addColorStop(0, 'rgba(255,240,250,.38)'); G.addColorStop(.25, film(.85, .5, .5, .22)); G.addColorStop(.6, film(.3, .5, .5, .09)); G.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = G; g.fillRect(-1.6, -1.6, 3.2, 3.2);
    for (let i = 0; i < 24; i++){
      const a = i/24*TAU, L = i % 2 ? 1.15 : 1.55, w = i % 2 ? .035 : .06;
      const R2 = g.createLinearGradient(0, 0, Math.cos(a)*L, Math.sin(a)*L);
      R2.addColorStop(0, 'rgba(255,255,255,.4)'); R2.addColorStop(.4, film(i*.11, .5, .55, .26)); R2.addColorStop(1, film(i*.11 + .3, .5, .5, 0));
      g.beginPath(); g.moveTo(-Math.sin(a)*w, Math.cos(a)*w); g.lineTo(Math.cos(a)*L, Math.sin(a)*L); g.lineTo(Math.sin(a)*w, -Math.cos(a)*w); g.closePath();
      g.fillStyle = R2; g.fill();
    }
    return { cv, x: -1.6, y: -1.6, w: 3.2, h: 3.2 };
  }
  // the throne: the Ophan's great wheel far out on the floor round the rig's halo, turning slowly (every phase)
  function bakeEcho(K){
    // two layers: the band and its ink rings (drawn translucent: light on the floor, not a solid), and twelve inked studs
    const W = Math.ceil(3.3*K), cv = mk(W, W), st = mk(W, W), lw = Math.max(.02, 2.2/K);
    let g = cv.getContext('2d'); g.setTransform(K, 0, 0, K, W/2, W/2); g.lineJoin = 'round';
    {
      for (let i = 0; i < 48; i++){ g.beginPath(); g.arc(0, 0, 1.42, i/48*TAU, (i + 1.1)/48*TAU); g.strokeStyle = film(.2 + .1*Math.sin(i/48*TAU*3), .3, .78); g.lineWidth = .09; g.stroke(); }
      g.beginPath(); g.arc(0, 0, 1.47, 0, TAU); g.moveTo(1.37, 0); g.arc(0, 0, 1.37, 0, TAU); g.strokeStyle = INKC; g.lineWidth = lw*1.3; g.stroke();
      g.beginPath(); g.arc(0, 0, 1.445, 0, TAU); g.strokeStyle = '#fff'; g.lineWidth = lw*.7; g.stroke();
      g.beginPath(); g.arc(0, 0, 1.3, 0, TAU); g.strokeStyle = INKC; g.lineWidth = .035; g.stroke();
      g.beginPath(); g.arc(0, 0, 1.3, 0, TAU); g.strokeStyle = film(.2, .2, .8); g.lineWidth = .014; g.stroke();
      g = st.getContext('2d'); g.setTransform(K, 0, 0, K, W/2, W/2); g.lineJoin = 'round';
      for (let i = 0; i < 12; i++){
        const a = i/12*TAU + TAU/24, ca = Math.cos(a), sa = Math.sin(a), cx = ca*1.42, cy = sa*1.42, L = i % 3 ? .1 : .16, Ws = .05;
        const o = [cx + ca*L, cy + sa*L], n = [cx - ca*L*.6, cy - sa*L*.6], l = [cx - sa*Ws, cy + ca*Ws], r = [cx + sa*Ws, cy - ca*Ws];
        poly(g, [o, l, n]); g.fillStyle = film(.9 + (i % 3)*.05, .3, .8); g.fill();
        poly(g, [o, r, n]); g.fillStyle = film(.95 + (i % 3)*.05, .3, .45); g.fill();
        g.beginPath(); g.moveTo(...o); g.lineTo(...n); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = lw*.6; g.stroke();
        inkP(g, [o, l, n, r], lw);
      }
    }
    return { cv, st, x: -1.65, y: -1.65, w: W/K, h: W/K };
  }
  // the wheel (the rig's halo): a band of film colour between two ink rings and twelve crystal studs
  function bakeWheel(K){
    const r = RIG.HALO.r;
    return bake(K, [-r - .2, -r - .2, r + .2, r + .2], (g, lw) => {
      for (let i = 0; i < 36; i++){ g.beginPath(); g.arc(0, 0, r, i/36*TAU, (i + 1.1)/36*TAU); g.strokeStyle = film(.2 + .1*Math.sin(i/36*TAU*3), .22, .74); g.lineWidth = .06; g.stroke(); }
      g.beginPath(); g.arc(0, 0, r + .035, 0, TAU); g.moveTo(r - .035, 0); g.arc(0, 0, r - .035, 0, TAU); g.strokeStyle = INKC; g.lineWidth = lw*1.3; g.stroke();
      g.beginPath(); g.arc(0, 0, r + .02, 0, TAU); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = lw*.6; g.stroke();
      for (let i = 0; i < 12; i++){
        const a = i/12*TAU + TAU/24, ca = Math.cos(a), sa = Math.sin(a), cx = ca*r, cy = sa*r, L = i % 3 ? .08 : .13, W = .04;
        const o = [cx + ca*L, cy + sa*L], n = [cx - ca*L*.5, cy - sa*L*.5], l = [cx - sa*W, cy + ca*W], rr = [cx + sa*W, cy - ca*W];
        poly(g, [o, l, n]); g.fillStyle = film(.9 + (i % 3)*.05, .3, .8); g.fill();
        poly(g, [o, rr, n]); g.fillStyle = film(.95 + (i % 3)*.05, .3, .45); g.fill();
        g.beginPath(); g.moveTo(...o); g.lineTo(...n); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = lw*.6; g.stroke();
        inkP(g, [o, l, n, rr], lw);
      }
    });
  }
  function bakeRing(K){
    return bake(K, [-.17, -.17, .17, .17], (g) => { g.beginPath(); g.arc(0, 0, .135, 0, TAU); g.strokeStyle = GLOW; g.lineWidth = .032; g.stroke(); });
  }
  const cache = new Map();
  function sprites(K, c){
    if (!cache.has(K)){ const wings = [0, 1, 2].map(i => bakeWing(K, i)); cache.set(K, { wings, glory: bakeGlory(K), echo: bakeEcho(K), core: bakeCore(K), socket: bakeSocket(K), wheel: bakeWheel(K), ring: bakeRing(K), sh: [], shr: [],
      rag: [0, 1, 2].map(i => bakeWing(K, i, k => k % 2 === 0)), fe: RIG.WINGS.map((Wg, i) => Wg.feathers.map((q, n) => n % 2 ? bakeFeather(K, i, n) : null)) });
      for (const Wp of [...cache.get(K).wings, ...cache.get(K).rag]){ Wp.gr = tone(Wp.cv, true); Wp.bk = tone(Wp.cv, false); } }
    const S = cache.get(K);
    if (c && !S.warm){
      S.warm = true; for (let p = 0; p < 3; p++) for (let i = 0; i < SHN; i++){ sheenAt(S, p, i, false); sheenAt(S, p, i, true); }
      const all = [], walk = (v) => { if (v instanceof HTMLCanvasElement) all.push(v); else if (v && typeof v === 'object') for (const k in v) if (k !== 'warm') walk(v[k]); };
      walk(S); c.save(); c.globalAlpha = .002; for (const cv of all) c.drawImage(cv, 0, 0, .01, .01); c.restore();
    }
    return S;
  }
  // a part's grey copy (the luminance of each texel: what saturate(0) gives) or its black silhouette, baked once
  function tone(cv, grey){
    const o = mk(cv.width, cv.height), g = o.getContext('2d'); g.drawImage(cv, 0, 0);
    if (!grey){ g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, o.width, o.height); return o; }
    const im = g.getImageData(0, 0, o.width, o.height), d = im.data;
    for (let i = 0; i < d.length; i += 4){ const y = .2126*d[i] + .7152*d[i + 1] + .0722*d[i + 2]; d[i] = d[i + 1] = d[i + 2] = y; }
    g.putImageData(im, 0, 0); return o;
  }
  // the holographic sheen: a rainbow band sliding root to tip across each wing, continuous in t, clipped to the feathers
  // (under the ink). Baked once per pair at SHN band positions; per frame the two nearest are crossfaded
  const SHN = 16;
  function sheenAt(S, p, i, rg){
    const sc = rg ? S.shr : S.sh, row = sc[p] || (sc[p] = []);
    if (row[i]) return row[i];
    const m = (rg ? S.rag : S.wings)[p].m, o = mk(m.width, m.height), g = o.getContext('2d'), w = o.width, h = o.height;
    const q = i/SHN*1.8 - .4, G = g.createLinearGradient(w*(q - .17), h*.1, w*(q + .17), h*.9);
    g.drawImage(m, 0, 0); g.globalCompositeOperation = 'source-in';
    G.addColorStop(0, film(.67, .5, .6, 0)); G.addColorStop(.3, film(.67, .5, .6, .4)); G.addColorStop(.45, film(.5, .5, .65, .5)); G.addColorStop(.52, 'rgba(255,255,255,.6)');
    G.addColorStop(.6, film(.9, .5, .65, .5)); G.addColorStop(.75, film(.1, .5, .6, .35)); G.addColorStop(1, film(.1, .5, .6, 0));
    g.fillStyle = G; g.fillRect(0, 0, w, h);
    return row[i] = o;
  }
  function sheen(S, p, t, rg){
    const f = ((t*.17 + p*.37) % 1)*SHN, i = Math.floor(f);
    return { a: sheenAt(S, p, i % SHN, rg), b: sheenAt(S, p, (i + 1) % SHN, rg), k: f - i };
  }

  // an eye, card style: almond of pearl, a red iris looking along (gx, gy) in its own frame, slit pupil, glint, ink
  function eye(c, x, y, r, open, gx, gy, lw, dim){
    const h = r*.62*open + r*.04;
    c.beginPath(); c.ellipse(x, y, r, h, 0, 0, TAU); c.fillStyle = dim ? lerpC([251, 248, 255], [150, 140, 172], dim) : '#fbf8ff'; c.fill();
    if (open > .08){
      c.save(); c.clip();
      const ix = x + gx*r*.38, iy = y + gy*r*.2;
      c.beginPath(); c.arc(ix, iy, r*.5, 0, TAU); c.fillStyle = dim ? lerpC([255, 52, 70], [92, 30, 52], dim) : '#ff3446'; c.fill();
      c.beginPath(); c.ellipse(ix, iy, r*.09, r*.4, 0, 0, TAU); c.fillStyle = INKC; c.fill();
      c.beginPath(); c.arc(ix - r*.18, iy - r*.18, r*.12, 0, TAU); c.fillStyle = '#fff'; c.fill();
      c.restore();
    }
    c.beginPath(); c.ellipse(x, y, r, h, 0, 0, TAU); c.strokeStyle = INKC; c.lineWidth = lw*1.2; c.stroke();
  }
  // a direction (dx, dy) in boss units carried into the frame of affine M, then turned by -rot; unit length
  const local = (M, dx, dy, rot) => {
    const det = M[0]*M[3] - M[1]*M[2];
    if (!(Math.abs(det) > 1e-4)) return [0, 0];   // edge-on (the top's turn): the frame is singular, look straight ahead
    const x0 = (M[3]*dx - M[2]*dy)/det, y0 = (-M[1]*dx + M[0]*dy)/det;
    const cr = Math.cos(rot), sr = Math.sin(rot), lx = x0*cr + y0*sr, ly = -x0*sr + y0*cr, l = Math.hypot(lx, ly) || 1;
    return [lx/l, ly/l];
  };
  const tf = (c, M) => c.transform(M[0], M[1], M[2], M[3], M[4], M[5]);

  // the whole boss in the rig's pose P (OPHAN_RIG.pose): only the rendering is this file's
  function draw(c, x, y, R, t, ph, P){
    const tr = c.getTransform(), K = Math.max(24, Math.min(400, Math.round(R*Math.hypot(tr.a, tr.b)/8)*8));
    const S = sprites(K, c), lw = Math.max(1.1, R*.02)/R, Q = P.raw, B = P.body, open = P.beats.open, gp = P.eye.gape, fl = Q.fl;
    const [GX, GY] = P.gaze;
    c.save(); c.translate(x, y); c.scale(R, R);
    // the floor layer: the glory, the wheel's far echo, the wheel itself (the halo)
    c.save(); tf(c, B.ground || B.floor);   // ground: the floor frame without the top's yaw squash, so the wheel stays round
    c.save(); c.globalCompositeOperation = 'lighter'; c.translate(RIG.EYE.x, RIG.EYE.y); c.rotate(t*.04);
    c.globalAlpha = .7*c01((.3 + .7*open)*(.8 + .2*Math.sin(t*.9))*(1 - .9*gp)*(.6 + .4*P.halo.scale)); c.scale(1 + .3*open, 1 + .3*open); put(c, S.glory); c.restore();
    c.save(); c.translate(RIG.HALO.x, RIG.HALO.y); c.scale(P.halo.scale, P.halo.scale); c.rotate(-t*.05); const ea = 1 - .55*gp; c.globalAlpha = .36*ea; put(c, S.echo); c.globalAlpha = ea; c.drawImage(S.echo.st, S.echo.x, S.echo.y, S.echo.w, S.echo.h); c.restore();
    c.save(); c.translate(RIG.HALO.x, RIG.HALO.y); c.scale(P.halo.scale, P.halo.scale); c.rotate(-t*.05); c.globalAlpha = 1 - .45*gp; put(c, S.wheel); c.restore();
    c.restore();
    // the wings, each through the rig's wing matrix, its sheen and its eyes
    const SH = [0, 1, 2].map(p => P.wings.some(w => w.i === p) ? sheen(S, p, t, P.wings.some(w => w.i === p && w.gap)) : null);
    const sp = P.beats.spin || 0, face = B.face === undefined ? 1 : B.face;
    if (sp > .02){ c.save(); tf(c, B.ground || B.floor); spinUnder(c, t, P, sp, lw); c.restore(); }
    // the top's depth: wings turned behind the body go first, dimmed and greyed by how far back; the front ones after the body
    const wing = (w) => {
      const Wp = (w.gap ? S.rag : S.wings)[w.i], d = w.depth || 0;
      c.save(); tf(c, w.m);
      const va = c01(w.vis*1.4);
      c.globalAlpha = va; put(c, Wp);
      { const sh = SH[w.i], al = va*(1 - .5*gp); c.globalAlpha = al*(1 - sh.k); c.drawImage(sh.a, Wp.x, Wp.y, Wp.w, Wp.h); c.globalAlpha = al*sh.k; c.drawImage(sh.b, Wp.x, Wp.y, Wp.w, Wp.h); c.globalAlpha = 1; }
      if (w.homes){ c.globalAlpha = va; for (const n of w.homes) put(c, S.fe[w.i][n]); c.globalAlpha = 1; }   // sword: the peeled feathers not yet gone (or back home)
      for (const E of w.eyes){
        if (E.open < .03) continue;
        const [lx, ly] = local(w.m, GX - E.x, GY - E.y, E.rot);
        c.save(); c.translate(E.lx, E.ly); c.rotate(E.rot); eye(c, 0, 0, E.r, E.open, lx, ly, lw, gp*.8); c.restore();
      }
      if (d < -.05){ const q = Math.round(-d*10)/10;   // saturate(1 - .55q), then brightness(1 - .5q)
        c.globalAlpha = va*.55*q; c.drawImage(Wp.gr, Wp.x, Wp.y, Wp.w, Wp.h); c.globalAlpha = va*.5*q; c.drawImage(Wp.bk, Wp.x, Wp.y, Wp.w, Wp.h); }
      else if (d > .05){ c.globalCompositeOperation = 'lighter'; c.globalAlpha = va*.15*Math.round(d*10)/10; put(c, Wp); c.globalCompositeOperation = 'source-over'; }
      c.globalAlpha = 1; c.restore();
    };
    for (const w of P.wings) if (!((w.depth || 0) > .02)) wing(w);
    if (sp > .02){ c.save(); tf(c, B.ground || B.floor); spinWrap(c, t, P, sp, lw, -1); c.restore(); }
    // the body: the rosette, the great eye (a sealed lid until phase 3), its flare, its crack
    c.save(); tf(c, B.m);
    put(c, S.core);
    const ex = RIG.EYE.x, ey = RIG.EYE.y, er = RIG.EYE.r, op = sm(.35, .95, 1 - P.eye.lid);   // op: the junction parting (0 sealed .. 1 the eye out), on the rig's eye-open beat, past the flash
    if (face >= 0 && op > .01){ c.globalAlpha = c01(op*1.5); put(c, S.socket); c.globalAlpha = 1; }
    if (face < 0){   // the back of the body: a sealed plate of dark foil, a pearl seam, four crystal studs (no eye)
      c.save(); c.translate(ex, ey);
      const G = c.createRadialGradient(-.08, -.1, .02, 0, 0, .31); G.addColorStop(0, film(.7, .25, .42)); G.addColorStop(1, 'rgba(16,10,34,1)');
      c.beginPath(); c.arc(0, 0, .3, 0, TAU); c.fillStyle = G; c.fill(); c.strokeStyle = INKC; c.lineWidth = lw*2.2; c.stroke();
      c.beginPath(); c.moveTo(0, -.27); c.lineTo(0, .27); c.moveTo(-.27, 0); c.lineTo(.27, 0); c.strokeStyle = INKC; c.lineWidth = lw*3; c.stroke(); c.strokeStyle = film(.9 + t*.2, .35, .8); c.lineWidth = lw*1.2; c.stroke();
      c.beginPath(); c.arc(0, 0, .2, 0, TAU); c.strokeStyle = film(.4, .3, .7); c.lineWidth = lw; c.stroke();
      shards(c, [0, 1, 2, 3].map(k => { const a = k*TAU/4 + TAU/8; return [Math.cos(a)*.2, Math.sin(a)*.2, a, .045]; }), lw);
      c.restore();
    }
    if (face >= 0 && fl > .01 && open > .01){   // the strike: the great eye flares, a burst of its own glory BEHIND it, the iris on top
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = c01(fl*1.3*open); c.translate(ex, ey); c.rotate(-t*.3); c.scale(.5 + .45*fl, .5 + .45*fl); put(c, S.glory); c.restore();
    }
    const mo = Math.min(1.25, P.eye.open), h = er*.62*mo + er*.04, [gx, gy] = local(B.m, GX - P.eye.x, GY - P.eye.y, 0);
    if (face >= 0 && mo > .02) eye(c, ex, ey, er, mo, gx, gy, lw*1.4, gp*.8);
    if (face >= 0) junction(c, op, t, lw, ex, ey);
    if (face >= 0 && fl > .01 && open > .01){ c.beginPath(); c.arc(ex, ey, .3 + .12*fl, 0, TAU); c.globalAlpha = c01(fl*open); c.strokeStyle = '#fff'; c.lineWidth = lw*2.2; c.stroke(); c.globalAlpha = 1; }
    if (face >= 0 && gp > .02){   // spent: the great eye fractures, a hot white split in black ink, glowing through
      c.save(); c.translate(ex, ey);
      c.beginPath(); CRACK.forEach(([a, b], i) => i ? c.lineTo(a, b) : c.moveTo(a, b)); c.moveTo(-.07, .06); c.lineTo(-.16, .19); c.moveTo(.11, .09); c.lineTo(.15, .2); c.moveTo(-.13, -.04); c.lineTo(-.16, -.17);
      c.globalAlpha = gp; c.strokeStyle = INKC; c.lineWidth = lw*6; c.stroke();
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = gp*(.75 + .25*Math.sin(t*3)); c.strokeStyle = film(.97, .35, .62); c.lineWidth = lw*4; c.stroke(); c.globalCompositeOperation = 'source-over';
      c.globalAlpha = gp; c.strokeStyle = '#fff'; c.lineWidth = lw*2.2; c.stroke(); c.globalAlpha = 1;
      c.restore();
    }
    // phase 2 -> 3: the great eye opening is an event (the rig's burst); the flash holds, then a shockwave ring of foil and shards runs out
    const bst = P.beats.burst;
    if (bst > .01){
      const kk = c01((ph - 2.25)/.75), rr = .4 + 1.3*sm(0, .9, kk);
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = c01(bst*.8); c.translate(ex, ey); c.scale(.8 + 1.1*kk, .8 + 1.1*kk); put(c, S.glory); c.restore();
      c.save(); c.translate(ex, ey); c.globalAlpha = c01(bst*1.3);
      c.beginPath(); c.arc(0, 0, rr, 0, TAU); c.strokeStyle = INKC; c.lineWidth = lw*6; c.stroke(); c.strokeStyle = film(.97, .3, .82); c.lineWidth = lw*3.4; c.stroke();
      c.beginPath(); c.arc(0, 0, rr*.86, 0, TAU); c.strokeStyle = '#fff'; c.lineWidth = lw*1.6; c.stroke();
      c.beginPath();
      for (let i = 0; i < 12; i++){ const a = i/12*TAU + .2, q = rr*(1.04 + .06*(i % 2)), s = .07 + .03*(i % 3), ca = Math.cos(a), sa = Math.sin(a);
        c.moveTo(ca*(q + 2*s), sa*(q + 2*s)); c.lineTo(ca*q - sa*s*.6, sa*q + ca*s*.6); c.lineTo(ca*(q - s), sa*(q - s)); c.lineTo(ca*q + sa*s*.6, sa*q - ca*s*.6); c.closePath(); }
      c.fillStyle = film(.5, .3, .82); c.fill(); c.strokeStyle = INKC; c.lineWidth = lw*1.2; c.stroke();
      c.restore();
    }
    c.restore();
    for (const w of P.wings) if ((w.depth || 0) > .02) wing(w);
    if (sp > .02){ c.save(); tf(c, B.ground || B.floor); spinWrap(c, t, P, sp, lw, 1); spinOver(c, t, P, sp, lw); c.restore(); }
    c.restore();
  }
  // ---- THE TOP (tornado): everything here scales with the rig's spin speed and sits on the rig's pivot ----
  const RIM = 1.35, RIMY = .26;   // the spin disc: the wing tips' sweep seen from the side, a flat ellipse
  // under it: the dust ring its tip grinds on the floor, the far half of the spin disc
  function spinUnder(c, t, P, sp, lw){
    const [px, py] = P.body.pivot;
    c.save(); c.globalAlpha = .5*sp; c.beginPath(); c.ellipse(0, .95, .55, .14, 0, 0, TAU); c.fillStyle = 'rgba(8,4,18,.7)'; c.fill(); c.restore();
    shards(c, Array.from({ length: 10 }, (_, k) => { const a = t*14 + k*TAU/10, r = .5 + .08*hh(k, 7); return [Math.cos(a)*r, .95 + Math.sin(a)*r*.25, a + Math.PI/2, .05*sp]; }), lw, sp);
    disc(c, t, px, py, sp, lw, Math.PI, TAU);
  }
  // over it: the near half of the disc, sparks flung off its two ends, the launch flash, the spin-down puffs
  function spinOver(c, t, P, sp, lw){
    const [px, py] = P.body.pivot, fl = P.beats.flash || 0, rc = P.beats.recovery || 0;
    disc(c, t, px, py, sp, lw, 0, Math.PI);
    const L = [];
    for (let k = 0; k < 10; k++){ const side = k % 2 ? 1 : -1, q = (t*3.1 + k*.29) % 1, d = RIM + 1.3*q;
      L.push([px + side*d, py + (.2*hh(k, 5) - .1) - .25*q + .7*q*q, side > 0 ? .3*q : Math.PI - .3*q, .15*(1 - q)*sp]); }
    shards(c, L, lw, sp);
    if (fl > .01){ c.save(); c.globalCompositeOperation = 'lighter'; const rr = .5 + 1.5*(1 - fl);
      for (let i = 0; i < 24; i++){ c.beginPath(); c.ellipse(px, py, rr, rr*.55, 0, i/24*TAU, (i + 1)/24*TAU); c.strokeStyle = film(i/24 + t*.5, .6, .7); c.globalAlpha = c01(fl*sp*1.5); c.lineWidth = .06*fl + lw; c.stroke(); }
      c.restore(); }
    if (rc > .01){ c.beginPath(); for (let k = 0; k < 4; k++){ const q = (t*.8 + k*.25) % 1, r = .06 + .1*q, X = (k - 1.5)*.3, Y = .85 - .35*q; c.moveTo(X + r, Y); c.arc(X, Y, r, 0, TAU); }
      c.globalAlpha = .55*rc; c.fillStyle = 'rgba(180,170,210,.85)'; c.fill(); c.strokeStyle = INKC; c.lineWidth = lw*.7; c.stroke(); c.globalAlpha = 1; }
  }
  // half the spin disc (angles a0..a1; 0..pi is the near half): a soft prism band and bright speed dashes racing along it
  function disc(c, t, px, py, sp, lw, a0, a1){
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (let i = 0; i < 16; i++){ const b0 = a0 + (a1 - a0)*i/16, b1 = a0 + (a1 - a0)*(i + 1)/16; c.beginPath(); c.ellipse(px, py, RIM, RIM*RIMY, 0, b0, b1);
      c.strokeStyle = film(i/16 + t*.6, .55, .62); c.globalAlpha = .28*sp; c.lineWidth = .14; c.stroke(); }
    for (let k = 0; k < 9; k++){ const b = a0 + (a1 - a0)*((t*4.2 + k/9) % 1), r = RIM*(.82 + .2*hh(k, 3)); c.beginPath(); c.ellipse(px, py, r, r*RIMY, 0, b - .35, b);
      c.strokeStyle = k % 3 ? film(k*.3 + t, .4, .85) : '#fff'; c.globalAlpha = .6*sp; c.lineWidth = lw*1.3; c.stroke(); }
    c.restore();
  }
  // the vortex wrap: two prism bands spiralling round the body as it turns, the far halves under the body, the near ones over
  function spinWrap(c, t, P, sp, lw, sideF){
    const [px, py] = P.body.pivot, yaw = P.body.yaw || 0;
    c.save(); c.lineCap = 'round';
    for (let j = 0; j < 2; j++){
      const pt = v => { const a = v*11 + yaw*.5 + j*Math.PI, r = (.18 + .5*Math.pow(Math.sin(Math.PI*v), .7))*(.8 + .2*sp); return [px + r*Math.sin(a), py - .85 + 1.75*v + .08*Math.cos(a), Math.cos(a)]; };
      c.beginPath(); let on = false;
      for (let i = 0; i <= 48; i++){ const A = pt(i/48); if (Math.sign(A[2]) === sideF){ on ? c.lineTo(A[0], A[1]) : c.moveTo(A[0], A[1]); on = true; } else on = false; }
      c.globalAlpha = sp*(sideF > 0 ? .85 : .4);
      c.strokeStyle = INKC; c.lineWidth = lw*2.4; c.stroke(); c.strokeStyle = film(j*.5 + t*.4, .5, .72); c.lineWidth = lw*1.2; c.stroke();
    }
    c.restore();
  }
  // THE JUNCTION (closed phases): a FEATHER KNOT, the wing roots' small coverts overlapping and swirling into a tight knot
  // round a crystal heart, like the base of a bird's tail. Opening: the knot unwinds, every covert swinging out and away
  function junction(c, op, t, lw, ex, ey){
    if (op > .995) return;
    const q = sm(.55, 1, op);   // the parts stay on through the flash, fading only as the eye arrives
    const N = 16;
    for (let k = 0; k < N; k++){
      const f = k/(N - 1), a = k*2.39996 + .4 + op*(1.8 + 1.2*f), r = (.27 - .22*f)*(1 + 1.3*op), L = (.25 - .13*f)*(1 - .3*op);
      c.globalAlpha = c01(1 - q*(1.2 + .6*f));
      blade(c, RIG.feather(ex + Math.cos(a)*r, ey + Math.sin(a)*r, a + 2.05 + .25*f, L, .075 - .03*f, .3, true), .17 + .05*(k % 3), k*.31, lw);
    }
    c.globalAlpha = 1;
    shards(c, [[ex, ey - .01, -Math.PI/2, .07*(1 - q)], [ex - .03, ey + .03, 2.4, .035*(1 - q)], [ex + .035, ey + .025, .7, .035*(1 - q)]], lw, c01(1 - q*1.8));
  }
  function boss(c, x, y, R, t, ph = 3){ draw(c, x, y, R, t, ph, RIG.pose(t, ph)); }

  // a crystal shard (a long diamond along heading a) appended to the current path
  const diamond = (c, x, y, a, s) => { const ca = Math.cos(a)*s, sa = Math.sin(a)*s;
    c.moveTo(x + ca*1.6, y + sa*1.6); c.lineTo(x - sa*.6, y + ca*.6); c.lineTo(x - ca*1.6, y - sa*1.6); c.lineTo(x + sa*.6, y - ca*.6); c.closePath(); };
  // shards in the three foil hues: L = [[x, y, heading, size], ...]
  function shards(c, L, lw, al = 1){
    c.globalAlpha = c01(al);
    for (let h = 0; h < 3; h++){ c.beginPath(); L.forEach(([x, y, a, s], i) => { if (i % 3 === h && s > .002) diamond(c, x, y, a, s); });
      c.fillStyle = SHARD[h][0]; c.fill(); c.strokeStyle = INKC; c.lineWidth = lw; c.stroke(); }
    c.globalAlpha = 1;
  }

  // ---- THE ATTACKS: the danger geometry is the rig's (attackUnit), drawn in foil, ink and crystal ----
  // the blast's sheet: a band of rainbow-faceted crystal wedges rolling out in the rig's cone, its front a hard rim of
  // teeth, the older crests as foil arcs behind it, flow lines streaming in its wake, the drops as flung shards
  function sheet(c, A, lw, t){
    const { dir, half: hw, front, fade, kw } = A, N = 9, r = front, rr = r - .1, r0 = Math.max(.5, r - 1.0), at2 = (a, q) => [Math.cos(a)*q, Math.sin(a)*q];
    if (rr <= r0 + .02) return;
    c.save(); c.globalAlpha = c01(fade); c.lineJoin = 'round';
    c.beginPath(); for (const f of A.flows){ c.moveTo(...at2(f.a, Math.max(.3, f.r0 - .3))); c.lineTo(...at2(f.a, f.r1)); }
    c.strokeStyle = INKC; c.lineWidth = lw*3.2; c.stroke(); c.strokeStyle = BEAM[0]; c.lineWidth = lw*1.6; c.stroke();
    c.rotate(dir);
    const GA = c.createRadialGradient(0, 0, r0, 0, 0, rr), GB = c.createRadialGradient(0, 0, r0, 0, 0, rr);
    GA.addColorStop(0, film(.15, .25, .82, .15)); GA.addColorStop(.55, film(.17, .25, .82, .7)); GA.addColorStop(1, film(.12, .2, .9, 1));
    GB.addColorStop(0, film(.25, .3, .4, 0)); GB.addColorStop(.55, film(.25, .3, .38, .45)); GB.addColorStop(1, film(.22, .3, .45, .85));
    const wa = i => -hw + 2*hw*i/N;
    c.beginPath(); for (let i = 0; i < N; i++){ c.moveTo(...at2(wa(i), r0)); c.lineTo(...at2(wa(i), rr)); c.lineTo(...at2(wa(i + 1), rr)); c.closePath(); }
    c.fillStyle = GA; c.fill();
    for (let i = 0; i < N; i++){ c.beginPath(); c.moveTo(...at2(wa(i), r0 + (rr - r0)*.3)); c.lineTo(...at2(wa(i), rr)); c.lineTo(...at2(wa(i + 1), rr)); c.closePath(); c.fillStyle = film(i*.29 + .05 + t*.2, .55, .62, .95); c.fill(); }
    c.beginPath(); for (let i = 0; i < N; i++){ c.moveTo(...at2(wa(i), r0)); c.lineTo(...at2(wa(i + 1), rr)); c.lineTo(...at2(wa(i + 1), r0)); c.closePath(); }
    c.fillStyle = GB; c.fill();
    c.beginPath(); for (let i = 1; i < N; i++){ c.moveTo(...at2(wa(i), r0 + (rr - r0)*.4)); c.lineTo(...at2(wa(i), rr)); }
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = lw*.7; c.stroke();
    c.beginPath(); c.moveTo(...at2(-hw, r0 + (rr - r0)*.3)); c.lineTo(...at2(-hw, rr)); c.moveTo(...at2(hw, r0 + (rr - r0)*.3)); c.lineTo(...at2(hw, rr));
    c.strokeStyle = INKC; c.lineWidth = lw*1.4; c.stroke();
    for (const k of A.crests){ if (!k.j) continue; const ra = Math.max(.05, k.r); c.globalAlpha = c01(k.f); c.beginPath(); c.arc(0, 0, ra, k.a0 - dir, k.a1 - dir);
      c.strokeStyle = INKC; c.lineWidth = lw*3.4; c.stroke(); c.strokeStyle = film(.95 - .2*k.j, .35, .75); c.lineWidth = lw*1.6; c.stroke(); }
    c.globalAlpha = c01(fade);
    const M = 2*N;   // the rim: crystal teeth, longest at the centre of the cone, pearl foil in ink, a hot line at their roots
    c.beginPath();
    for (let j = 0; j <= M; j++){ const q = j/M, tip = j % 2 ? r + .1 + .2*(1 - Math.pow(2*q - 1, 2)) : r; c.lineTo(...at2(-hw + 2*hw*q, tip)); }
    for (let j = 12; j >= 0; j--) c.lineTo(...at2(-hw + 2*hw*j/12, rr - .08));
    c.closePath(); c.fillStyle = film(.12, .18, .9); c.fill(); c.strokeStyle = INKC; c.lineWidth = lw*1.6; c.stroke();
    c.beginPath(); c.arc(0, 0, rr - .02, -hw, hw); c.strokeStyle = film(.97, .35, .66); c.lineWidth = lw*1.3; c.stroke();
    c.beginPath(); for (let j = 1; j < M; j += 2){ const q = j/M, a = -hw + 2*hw*q; c.moveTo(...at2(a, rr)); c.lineTo(...at2(a, r + .06 + .17*(1 - Math.pow(2*q - 1, 2)))); }
    c.strokeStyle = '#fff'; c.lineWidth = lw*.7; c.stroke();
    c.beginPath(); c.arc(0, 0, r + .02, -hw, hw); c.strokeStyle = '#fff'; c.lineWidth = lw*2.6; c.stroke();   // the white leading edge
    c.save(); c.globalCompositeOperation = 'lighter'; c.beginPath(); c.arc(0, 0, r, -hw, hw); c.strokeStyle = 'rgba(160,255,250,.3)'; c.lineWidth = .16; c.stroke(); c.restore();
    for (let j = 1; j < M; j += 4){ const q = j/M, a = -hw + 2*hw*q, g0 = .5 + .5*Math.sin(t*9 + j*1.3), [gx, gy] = at2(a, r + .1 + .2*(1 - Math.pow(2*q - 1, 2))), gs = .05 + .07*g0;   // glints on the teeth
      c.beginPath(); c.moveTo(gx - gs, gy); c.lineTo(gx + gs, gy); c.moveTo(gx, gy - gs); c.lineTo(gx, gy + gs); c.strokeStyle = 'rgba(255,255,255,' + (.5 + .5*g0).toFixed(2) + ')'; c.lineWidth = lw*.9; c.stroke(); }
    c.rotate(-dir);
    c.beginPath(); for (const d of A.drops){ c.moveTo(d.x, d.y); c.lineTo(d.x - Math.cos(d.a)*d.tl, d.y - Math.sin(d.a)*d.tl); }
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = lw*1.6; c.stroke();
    shards(c, A.drops.map((d, i) => [d.x, d.y, d.a + kw*9 + i*1.7, d.z*2.4]), lw, fade);
    c.restore();
  }
  // a small crystal whirlpool on the floor (three spiral arms of shards round a dark still eye)
  function whirl(c, X, Y, s, t, al, lw){
    if (al < .01 || s < .01) return;
    const sq = .45, pt = (arm, v) => { const r = (.1 + .9*v)*s, a = arm*TAU/3 + v*2.8 + t*(5 - 3.4*v); return [X + Math.cos(a)*r, Y + Math.sin(a)*r*sq]; };
    c.save(); c.globalAlpha = c01(al);
    c.beginPath(); c.ellipse(X, Y, s*1.08, s*1.08*sq, 0, 0, TAU); c.fillStyle = 'rgba(8,4,18,.5)'; c.fill();
    c.beginPath(); for (let arm = 0; arm < 3; arm++) for (let i = 0; i <= 12; i++){ const [a, b] = pt(arm, i/12); i ? c.lineTo(a, b) : c.moveTo(a, b); }
    c.strokeStyle = INKC; c.lineWidth = lw*3; c.stroke(); c.strokeStyle = film(.2, .22, .8); c.lineWidth = lw*1.3; c.stroke();
    const L = [];
    for (let arm = 0; arm < 3; arm++) for (let j = 0; j < 6; j++){ const v = (j + .6)/6, [a, b] = pt(arm, v), [a2, b2] = pt(arm, v + .03); L.push([a, b, Math.atan2(b2 - b, a2 - a), (.05 + .08*v)*s]); }
    c.restore(); shards(c, L, lw, al);
  }
  // THE TORNADO on the rig's geometry: a funnel from its foot to its lip (height, radius, collapse), dark violet glass
  // under a heavy inked silhouette, four rainbow helix bands winding up it, shards climbing round it (back ones in
  // shadow, front ones lit in the floor crystals' hues), a crown of shards flung off the lip
  function tower(c, A, t, lw, L){
    const { x: X, y: Y } = A.pos, d = A.collapse, sc = A.scale, Hh = A.height*(1 - .92*d), N = 12;
    const ctr = v => [X + .25*v*v*Math.sin(t*1.1)*(1 - d), Y - Hh*v], rad = v => A.foot + (A.radius - A.foot)*Math.pow(v, 1.4);
    if (Hh < .01) return;
    c.save(); c.globalAlpha = c01(L*(1 - .6*d)); c.lineJoin = 'round'; c.lineCap = 'round';
    const Lf = [], Rf = [];
    for (let i = 0; i <= N; i++){ const v = i/N, [cx, cy] = ctr(v), r = rad(v); Lf.push([cx - r, cy]); Rf.push([cx + r, cy]); }
    const [tx0, ty0] = ctr(1), rt = Math.max(.01, rad(1)), ry = rt*.3;
    c.beginPath(); Lf.forEach(([a, b], i) => i ? c.lineTo(a, b) : c.moveTo(a, b)); c.ellipse(tx0, ty0, rt, ry, 0, Math.PI, 0, false); for (let i = N; i >= 0; i--) c.lineTo(...Rf[i]); c.closePath();
    const GB = c.createLinearGradient(tx0 - rt, 0, tx0 + rt, 0);
    GB.addColorStop(0, 'rgba(14,8,30,.92)'); GB.addColorStop(.38, film(.2, .3, .3, .85)); GB.addColorStop(.5, film(.45, .35, .45, .8)); GB.addColorStop(.62, film(.1, .3, .3, .85)); GB.addColorStop(1, 'rgba(14,8,30,.92)');
    c.fillStyle = GB; c.fill();
    c.save(); c.clip(); for (let i = 0; i < 7; i++){ const v0 = i/7, v1 = (i + 1)/7, f = (i*.37 + t*.15) % 1, [a0, b0] = ctr(v0), [a1, b1] = ctr(v1), r0 = rad(v0), r1 = rad(v1), k = .3 + .4*hh(i, 41);   // rainbow facets in the glass
      poly(c, [[a0 - r0*k, b0], [a1 - r1*(k - .3), b1], [a1 + r1*.2, b1], [a0 + r0*(.4 - k*.5), b0]]); c.fillStyle = film(f, .55, .6, .55); c.fill(); }
      c.restore();
    c.strokeStyle = INKC; c.lineWidth = lw*4.4; c.stroke(); c.strokeStyle = film(.5, .4, .75); c.lineWidth = lw*1.8; c.stroke();
    const SP = [];
    for (let i = 0; i < 64; i++){
      const v = (i*.618 + t*.32) % 1, a = A.spin*1.6*(1.3 - .5*v) + i*2.4, [cx, cy] = ctr(v), r = rad(v)*(1.02 + .1*hh(i, 31));
      const s = (.08 + .14*v)*Math.pow(Math.sin(Math.PI*v), .5)*sc, ca = Math.cos(a), sa = Math.sin(a);
      SP.push([cx + ca*r, cy + sa*r*.3, Math.atan2(ca*.3, -sa), s, sa > 0]);
    }
    const back = SP.filter(p => !p[4]);
    c.beginPath(); for (const [a, b, h, s] of back) if (s > .002) diamond(c, a, b, h, s); c.fillStyle = film(.22, .3, .4); c.fill(); c.strokeStyle = INKC; c.lineWidth = lw; c.stroke();
    for (let j = 0; j < 4; j++){
      c.beginPath();
      for (let i = 0; i <= 18; i++){ const v = i/18, a = A.spin*1.4 + j*TAU/4 + v*7, [cx, cy] = ctr(v), r = rad(v); const px = cx + Math.cos(a)*r, py = cy + Math.sin(a)*r*.3; i ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.strokeStyle = INKC; c.lineWidth = lw*4.2; c.stroke(); c.strokeStyle = film(.5 + j*.17 + t*.1, .5, .7); c.lineWidth = lw*2.2; c.stroke();
    }
    c.restore();
    shards(c, SP.filter(p => p[4]), lw, L*(1 - .6*d));
    c.save(); c.globalAlpha = c01(L*(1 - .6*d));
    c.beginPath(); c.ellipse(tx0, ty0, rt, ry, 0, 0, TAU); c.strokeStyle = INKC; c.lineWidth = lw*3; c.stroke(); c.strokeStyle = film(.67, .45, .75); c.lineWidth = lw*1.4; c.stroke();
    c.restore();
    const C = [];
    for (let i = 0; i < 8; i++){ const a = A.spin*2 + i*TAU/8, q = ((t*.9 + i*.37) % 1), r = rt*(1 + .5*q); C.push([tx0 + Math.cos(a)*r, ty0 + Math.sin(a)*ry*(1 + .5*q) - .3*q*sc, Math.PI/2, .06*(1 - q)*sc]); }
    shards(c, C, lw, L*(1 - d));
  }
  // the laser's after-weight: each lane split into the floor as a prism crack from the boss's feet to where its beam stands,
  // white-hot at the beam and cooling to bare ink behind it (ink, a film seam, side fractures)
  function scorch(c, b, i, fire, al, lw){
    const X0 = b.start.x, Y0 = b.start.y, X1 = b.end.x, Y1 = b.end.y, Ld = Math.hypot(X1 - X0, Y1 - Y0);
    if (al < .01 || !(Ld > .02)) return;
    const n = Math.max(2, Math.ceil(Ld*7)), ux = (X1 - X0)/Ld, uy = (Y1 - Y0)/Ld, P = [];
    for (let j = 0; j <= n; j++){ const f = j/n, o = j && j < n ? (hh(i, j) - .5)*.07 : 0; P.push([X0 + (X1 - X0)*f - uy*o, Y0 + (Y1 - Y0)*f + ux*o]); }
    c.save(); c.globalAlpha = c01(al); c.beginPath(); P.forEach(([x, y], j) => j ? c.lineTo(x, y) : c.moveTo(x, y));
    for (let j = 1; j < n; j++){ const [x, y] = P[j], d = (hh(i + 5, j) - .5)*3, L = .06 + .08*hh(j, i + 7); c.moveTo(x, y); c.lineTo(x + Math.cos(d + 1.6)*L, y + Math.sin(d + 1.6)*L*.6); }
    c.strokeStyle = INKC; c.lineWidth = lw*3.2; c.stroke();
    for (let j = 0; j < n; j++){ const ht = fire*Math.exp(-(n - j - 1)/n*Ld/.9);   // heat: 1 at the beam, gone .9 behind it
      c.globalAlpha = c01(al*(.35 + .65*ht)); c.beginPath(); c.moveTo(P[j][0], P[j][1]); c.lineTo(P[j + 1][0], P[j + 1][1]);
      c.strokeStyle = BEAM[i % 2]; c.lineWidth = lw*(1.4 + 2.2*ht); c.stroke();
      if (ht > .05){ c.globalAlpha = c01(al*ht); c.strokeStyle = '#fff'; c.lineWidth = lw*1.1*ht + lw*.3; c.stroke(); } }
    c.restore();
  }
  // a blade feather of the boss's own (the rig's feather()): its outline as one path, and drawn in foil (film fill, white spine, ink)
  const fpath = (c, F) => { c.beginPath(); F.l.forEach(([a, b], i) => i ? c.lineTo(a, b) : c.moveTo(a, b)); for (let i = F.r.length - 1; i >= 0; i--) c.lineTo(F.r[i][0], F.r[i][1]); c.closePath(); };
  const foil = (c, F, k, lw, al) => { if (al < .01) return; c.globalAlpha = c01(al); fpath(c, F); c.fillStyle = film(k, .42, .72); c.fill(); c.strokeStyle = INKC; c.lineWidth = lw*2; c.stroke();
    c.beginPath(); F.sp.forEach(([a, b], i) => i ? c.lineTo(a, b) : c.moveTo(a, b)); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = lw*.8; c.stroke(); c.globalAlpha = 1; };
  const halo2 = (c, X, Y, r, sq, al, col) => { if (!(al > .005 && r > .001 && Number.isFinite(X + Y))) return; c.save(); c.globalCompositeOperation = 'lighter'; c.translate(X, Y); c.scale(1, sq);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(.35, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = c01(al); c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.restore(); };
  // THE SWORD (morph C, feathers peel off): every other feather of all six wings detaches, flies the short way in and stacks
  // into the blade at the shoulders; the wings, held open as at rest, stay ragged and gapped until the feathers fly back home.
  // Nothing is the blade but those feathers (and, once they are stacked, the light running up them)
  const PEEL = [];
  RIG.WINGS.forEach((Wg, i) => Wg.feathers.forEach((q, n) => { if (n % 2) for (const sd of [-1, 1]) PEEL.push({ i, n, sd, q }); }));
  function peel(P, A, t, ph, u, lw){
    const Bl = A.blade, Fi = A.fire, P0 = RIG.pose(t, ph), b = P0.body.m, dt = b[0]*b[3] - b[1]*b[2], under = [], over = [];
    for (const w of P.wings) w.merge = 0;
    if (!(Math.abs(dt) > 1e-6)) return { under, over, sh: 0 };
    const D = RIG.mul(P.body.m, [b[3]/dt, -b[1]/dt, -b[2]/dt, b[0]/dt, (b[2]*b[5] - b[3]*b[4])/dt, (b[1]*b[4] - b[0]*b[5])/dt]), k = Bl.form, lp = (p, q) => p.map((v, i) => v + (q[i] - v)*k);
    P.wings = P.wings.map(w => { const o = P0.wings.find(v => v.i === w.i && v.side === w.side); return o ? { ...w, m: lp(w.m, RIG.mul(D, o.m)), root: lp(w.root, RIG.apply(D, o.root[0], o.root[1])) } : w; });
    const ov = Bl.under <= .5;
    if (!(Bl.reach > .01)) return { under, over, sh: 0 };
    // liquid's path exactly: from the shoulders to the rig's blade tip, rearing up behind the head, then straight over the top and down the line
    const SB = RIG.apply(P.body.m, 0, -.2), tip = [Bl.tip.x, Bl.tip.y], gr = [Bl.ground.x, Bl.ground.y];
    const ax = Math.atan2(tip[1] - SB[1], tip[0] - SB[0]), L = Math.max(.3, .9*Bl.form, Math.hypot(tip[0] - SB[0], tip[1] - SB[1]));
    const N = PEEL.length, homes = new Map(); let sh = 0, home = 0;
    PEEL.forEach((e, j) => { const w = P.wings.find(v => v.i === e.i && v.side === e.sd); if (!w) return;
      const t0 = .03 + .14*j/N, t2 = .83 + .09*j/N, out = RIG.sm(t0, t0 + .09, u)*(1 - RIG.sm(t2, t2 + .07, u)), q = e.q, M = w.m;
      if (out <= 0){ home++; if (!homes.has(w)) homes.set(w, []); homes.get(w).push(e.n); return; }
      // a straight double-edged blade: two tight columns of feathers laid flat along the axis, edge to edge, closing to a point;
      // the first pair (one off each side) lies across the shoulders as the crossguard
      const ks = j >> 1, guard = ks === 0, kb = ks - 1, HW = .055, det = M[0]*M[3] - M[1]*M[2], mir = det < 0 ? -1 : 1;
      const G = Math.min(.62, .42*L), d = guard ? G : G + (L - G)*.7*kb/9, o = e.sd*(guard ? .02 : HW*Math.min(1, (1 - kb/9)*3)), a1 = guard ? ax + e.sd*Math.PI/2 : ax;
      const px = SB[0] + Math.cos(ax)*d - Math.sin(ax)*o, py = SB[1] + Math.sin(ax)*d + Math.cos(ax)*o, lx = (guard ? .3 : .3*(L - G) + .05)/q.L, wy = (guard ? .05 : HW)/q.w;
      const p0 = RIG.apply(M, q.base[0], q.base[1]), vx = M[0]*Math.cos(q.a) + M[2]*Math.sin(q.a), vy = M[1]*Math.cos(q.a) + M[3]*Math.sin(q.a), lq = Math.hypot(vx, vy) || 1e-3, af = Math.atan2(vy, vx), y0 = det/lq;
      let da = a1 - af; da -= TAU*Math.round(da/TAU);
      const kk = out*out*(3 - 2*out), arc = .18*Math.sin(Math.PI*kk), X = p0[0] + (px - p0[0])*kk, Y = p0[1] + (py - p0[1])*kk - arc, a = af + da*kk, l = lq + (lx - lq)*kk, ys = y0 + ((kb >= 8 ? .5 : mir)*wy - y0)*kk, va = c01(w.vis*1.4);
      sh += out/N;
      (out >= 1 ? (ov ? over : under) : over).push((c, S) => { c.save(); c.translate(X, Y); c.rotate(a); c.scale(l, ys); c.rotate(-q.a); c.translate(-q.base[0], -q.base[1]); c.globalAlpha = va; put(c, S.fe[e.i][e.n]); c.restore(); }); });
    if (home < N) for (const w of P.wings){ w.gap = true; if (homes.has(w)) w.homes = homes.get(w); }
    const fu = RIG.sm(.6, .95, sh);
    if (fu > .01) (ov ? over : under).push((c) => {   // stacked, the feathers fuse into ONE foil sword: grip in the body, crossguard, a straight double edge, a point
      const ux = Math.cos(ax), uy = Math.sin(ax), nx = -uy, ny = ux, G = Math.min(.62, .42*L), W = .19, Q = (d, o) => [SB[0] + ux*d + nx*o, SB[1] + uy*d + ny*o], E = G + (L - G)*.84;
      c.save(); c.globalAlpha = c01(fu);
      poly(c, [Q(0, .05), Q(G, .05), Q(G, -.05), Q(0, -.05)]); c.fillStyle = film(.6, .3, .45); c.fill(); c.strokeStyle = INKC; c.lineWidth = lw*2; c.stroke();
      poly(c, [Q(G, W), Q(E, W), Q(L, 0), Q(E, -W), Q(G, -W)]); const g = c.createLinearGradient(...Q(G, 0), ...Q(L, 0));
      g.addColorStop(0, film(.5, .42, .7)); g.addColorStop(.5, film(.8, .42, .76)); g.addColorStop(1, film(.1, .42, .8)); c.fillStyle = g; c.fill();
      poly(c, [Q(G, 0), Q(G, -W), Q(E, -W), Q(L, 0)]); c.fillStyle = 'rgba(14,8,36,.28)'; c.fill();   // the shadowed face
      poly(c, [Q(G, W), Q(E, W), Q(L, 0), Q(E, -W), Q(G, -W)]); c.strokeStyle = INKC; c.lineWidth = lw*3; c.stroke();
      c.beginPath(); c.moveTo(...Q(G, 0)); c.lineTo(...Q(L*.99, 0)); c.strokeStyle = '#fff'; c.lineWidth = lw*1.2; c.stroke();
      poly(c, [Q(G - .09, .46), Q(G + .04, .46), Q(G + .04, -.46), Q(G - .09, -.46)]); c.fillStyle = film(.2, .4, .74); c.fill(); c.strokeStyle = INKC; c.lineWidth = lw*2.4; c.stroke();
      c.restore();
      shards(c, [[...Q(G - .025, .5), ax + Math.PI/2, .09], [...Q(G - .025, -.5), ax - Math.PI/2, .09]], lw, fu);   // crystal ends on the guard
      const sg = (t*1.3) % 1; halo2(c, ...Q(G + (L - G)*sg, 0), .22, 1, fu*Bl.lift*.9, BEAM[0]); });
    if (Bl.buried > .01) over.push((c) => shards(c, Array.from({ length: 6 }, (_, k) => { const a = k/6*TAU + .4; return [tip[0] + Math.cos(a)*.16, tip[1] + Math.sin(a)*.08, a, .05*Bl.buried]; }), lw, Bl.buried));
    return { under, over, sh, SB, gr, ax };
  }
  function attack(c, x, y, R, t, ph = 3, atk, u, px, py){
    const PX = (px - x)/R, PY = (py - y)/R, P = RIG.pose(t, ph, atk, u, PX, PY), A = RIG.attackUnit(atk, u, ph, PX, PY, t, P);
    const lw = Math.max(1.1, R*.02)/R, tr = c.getTransform(), S = sprites(Math.max(24, Math.min(400, Math.round(R*Math.hypot(tr.a, tr.b)/8)*8)), c);
    const SW = atk === 'sword' ? peel(P, A, t, ph, u, lw) : null;
    // under the boss
    c.save(); c.translate(x, y); c.scale(R, R); c.lineCap = 'round'; c.lineJoin = 'round';
    if (atk === 'blast'){
      if (A.suck.length) shards(c, A.suck.map((b, i) => [b.x, b.y, Math.atan2(b.y + .1, b.x), b.r*1.6]), lw, Math.max(...A.suck.map(b => b.al)));
      if (A.shock){ const s = A.shock; c.globalAlpha = c01(s.al); c.beginPath(); c.arc(s.x, s.y, Math.max(.01, s.r), 0, TAU);
        c.strokeStyle = INKC; c.lineWidth = s.w + 2*lw; c.stroke(); c.strokeStyle = film(.97, .3, .82); c.lineWidth = s.w*.7; c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = s.w*.2; c.stroke(); c.globalAlpha = 1; }
      if (A.sheet) sheet(c, A.sheet, lw, t);
    } else if (atk === 'tornado'){
      const wd = A.wind;
      if (wd > .02){   // the wind the spin drags round it: inked cyan streaks, half seen
        c.globalAlpha = c01(.4*wd); c.beginPath();
        for (let i = 0; i < 3; i++){ const a0 = A.spin*1.1 + i*TAU/3 + .4; c.moveTo(Math.cos(a0 - 1.1*wd)*1.5, -.1 + Math.sin(a0 - 1.1*wd)*1.5); c.arc(0, -.1, 1.5, a0 - 1.1*wd, a0); }
        c.strokeStyle = INKC; c.lineWidth = lw*4.5; c.stroke(); c.strokeStyle = film(.5, .3, .8); c.lineWidth = lw*2; c.stroke(); c.globalAlpha = 1; }
      whirl(c, A.pos.x, A.pos.y, A.foot*2, t, A.alive*(1 - A.collapse) + A.pool, lw);
      const L = A.alive, pk = A.pool;   // the floor marks stay under the boss; only the funnel goes over it
      if (pk > .01){ const r = .62*Math.sqrt(pk); shards(c, Array.from({ length: 9 }, (_, j) => { const a = j/9*TAU + .4; return [A.pos.x + Math.cos(a)*r*(.6 + .5*hh(j, 21)), A.pos.y + Math.sin(a)*r*.38, a + j, .06*pk]; }), lw, pk); }
      if (L > .01 && u > .45){   // the crystal groove it leaves on the floor, behind it
        for (let k = 0; k < 10; k++){ const f = (k + 1)/10, a = A.trail[k], b = A.trail[k + 1]; c.globalAlpha = c01(L*Math.sin(Math.PI*Math.min(1, f*1.15)));
          c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.strokeStyle = INKC; c.lineWidth = (.04 + .1*f); c.stroke(); c.strokeStyle = film(.95 - f*.4, .35, .72); c.lineWidth = (.015 + .04*f); c.stroke(); }
        c.globalAlpha = 1; }
    } else if (atk === 'laser'){
      const T = A.track, aim = A.aim;
      if (aim > .01){   // the floor's own crystal wakes along each lane: buried facets glint as a pulse of light runs out from the boss's feet
        const Lm = Math.min(T.len, 7), cs = [[], []];
        for (const off of T.lanes) for (let k = 0; k*.2 < Lm; k++){ const d = .1 + k*.2 + (hh(k, off*40) - .5)*.08, j = (hh(k + 3, off*40) - .5)*.06;
          const pu = Math.pow(.5 + .5*Math.sin(d*2.4 - t*7), 6), al = aim*(.16 + .6*pu)*(1 - .55*d/Lm);
          if (al < .02) continue; const X = T.start.x + T.dx*d + T.nx*(off + j), Y = T.start.y + T.dy*d + T.ny*(off + j), e = .055 + .04*hh(k, off*40 + 9), a = hh(k + 7, off)*Math.PI;
          c.globalAlpha = c01(al); c.beginPath(); c.moveTo(X + Math.cos(a)*e*1.5, Y + Math.sin(a)*e*.7); c.lineTo(X - Math.sin(a)*e*.6, Y + Math.cos(a)*e*.4); c.lineTo(X - Math.cos(a)*e*1.5, Y - Math.sin(a)*e*.7); c.lineTo(X + Math.sin(a)*e*.6, Y - Math.cos(a)*e*.4); c.closePath();
          c.fillStyle = film(d*.25 + off, .45, .72); c.fill(); if (pu > .5){ c.globalAlpha = c01(al*pu); c.fillStyle = '#fff'; c.beginPath(); c.arc(X, Y, e*.35, 0, TAU); c.fill(); } }
        c.globalAlpha = 1; }
      if (A.sweep > 0) A.beams.forEach((b, i) => scorch(c, b, i, A.fire, A.scorch, lw));
      if (A.fire > .01){   // the burn's light pooled on the floor round each ground point
        c.save(); c.globalCompositeOperation = 'lighter';
        A.beams.forEach((b, i) => { const fl = .8 + .2*Math.sin(t*23 + i*2.1) + .1*Math.sin(t*37 + i), r = .6*fl;
          if (!(Number.isFinite(b.end.x) && Number.isFinite(b.end.y))) return;
          c.save(); c.translate(b.end.x, b.end.y); c.scale(1, .42); const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
          g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.35, BEAM[i % 2]); g.addColorStop(1, 'rgba(0,0,0,0)');
          c.globalAlpha = c01(A.fire*1.3); c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.restore(); });
        c.restore(); }
    } else if (atk === 'wheel'){
      const tr = A.trail;
      if (u > .22) for (let k = 0; k < 10; k++){   // the scour it cuts: an inked groove in the crystal floor, its seam glinting, the old end fading
        const f = (k + 1)/10, a = tr[k], b = tr[k + 1]; if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-4) continue;
        c.globalAlpha = c01(Math.sin(Math.PI*Math.min(1, f*1.1))*(1 - sm(.9, 1, u))); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
        c.strokeStyle = INKC; c.lineWidth = .05 + .13*f; c.stroke(); c.strokeStyle = film(.55 + f*.3, .35, .72); c.lineWidth = .02 + .05*f; c.stroke(); }
      A.hits.forEach((h, j) => { if (h.al < .01) return; const q = 1 - h.al;   // each ricochet cracks the floor: a star of ink fractures, a foil ring spreading
        c.globalAlpha = c01(h.al); c.beginPath(); for (let k = 0; k < 7; k++){ const a = k/7*TAU + j, L = .3 + .25*hh(k, j + 63); c.moveTo(h.x, h.y); c.lineTo(h.x + Math.cos(a)*L, h.y + Math.sin(a)*L*.6); }
        c.strokeStyle = INKC; c.lineWidth = lw*3; c.stroke(); c.strokeStyle = film(.5 + j*.3, .4, .75); c.lineWidth = lw*1.2; c.stroke();
        c.beginPath(); c.ellipse(h.x, h.y, .3 + .9*q, (.3 + .9*q)*.5, 0, 0, TAU); c.strokeStyle = film(.95, .3, .8); c.lineWidth = lw*2.4; c.stroke();
        halo2(c, h.x, h.y, .6, .5, h.al*.8, BEAM[j % 2]); });
      const ld = Math.sin(Math.PI*c01((u - .8)/.12));
      if (ld > .01){ c.globalAlpha = c01(ld*.8); c.beginPath(); c.ellipse(A.pos.x, A.pos.y + .1, .85 + .5*ld, (.85 + .5*ld)*.4, 0, 0, TAU); c.strokeStyle = film(.6, .35, .75); c.lineWidth = lw*2; c.stroke(); }
      c.globalAlpha = 1;
    } else if (atk === 'recall'){
      A.feathers.forEach((f, i) => {
        const cr = f.state === 2 ? 1 : f.state >= 3 ? f.tear : 0, p = f.plant;
        if (cr > .01){ c.globalAlpha = c01(cr); c.beginPath(); for (let k = 0; k < 5; k++){ const a = f.a + Math.PI + (k - 2)*.7 + .3*(hh(i, k + 70) - .5), L = .07 + .1*hh(k, i + 71); c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(a)*L, p.y + Math.sin(a)*L*.6); }
          c.strokeStyle = INKC; c.lineWidth = lw*2.4; c.stroke(); c.strokeStyle = film(.5 + i*.09, .4, .75); c.lineWidth = lw; c.stroke(); }
        if (f.vis > .01 && f.state >= 1 && f.state <= 3){ const L = f.len*(f.state === 2 ? .8 : 1), F = RIG.feather(f.x - Math.cos(f.a)*L + .04, f.y - Math.sin(f.a)*L + .05, f.a, L, f.w*1.7, .08);   // its shadow, offset by its height
          c.globalAlpha = c01(.35*f.vis/(1 + 2*f.z)); fpath(c, F); c.fillStyle = 'rgba(8,4,20,.9)'; c.fill(); }
        if (f.dust > .01) halo2(c, p.x, p.y, .25, .5, f.dust*.6, BEAM[i % 2]); });
      c.globalAlpha = 1;
    } else if (atk === 'sword'){
      const B = A.blade, Fi = A.fire;
      if (SW.sh > .01){   // the stacked feathers' shadow on the floor, shoulders to the point's shadow
        const [bx, by] = SW.SB, [gx, gy] = SW.gr, d = Math.hypot(gx - bx, gy - by) || 1, nx = -(gy - by)/d, ny = (gx - bx)/d;
        c.globalAlpha = c01(.3*SW.sh); c.beginPath(); c.moveTo(bx + nx*B.w, by + ny*B.w + .06); c.lineTo(gx, gy + .06); c.lineTo(bx - nx*B.w, by - ny*B.w + .06); c.closePath(); c.fillStyle = 'rgba(8,4,20,.9)'; c.fill(); }
      if (Fi.scorch > .01 && Fi.front > .01){   // the line it split open: a crystal groove from the impact to the running front, seam lit, side fractures
        const n = Math.max(2, Math.ceil(Fi.front*6)), Pt = [];
        for (let j = 0; j <= n; j++){ const d = Fi.front*j/n, o = j && j < n ? (hh(j, 84) - .5)*.1 : 0; Pt.push([Fi.start.x + Fi.dx*d + Fi.nx*o, Fi.start.y + Fi.dy*d + Fi.ny*o]); }
        c.globalAlpha = c01(Fi.scorch); c.beginPath(); Pt.forEach(([a, b], j) => j ? c.lineTo(a, b) : c.moveTo(a, b));
        for (let j = 1; j < n; j++){ const [a, b] = Pt[j], q = (hh(j, 85) - .5)*2.4, L = .1 + .14*hh(j, 86); c.moveTo(a, b); c.lineTo(a + Math.cos(Math.atan2(Fi.dy, Fi.dx) + Math.PI/2 + q)*L, b + Math.sin(Math.atan2(Fi.dy, Fi.dx) + Math.PI/2 + q)*L*.6); }
        c.strokeStyle = INKC; c.lineWidth = lw*4; c.stroke(); c.strokeStyle = film(.55, .4, .75); c.lineWidth = lw*1.8; c.stroke(); c.globalAlpha = c01(Fi.scorch*Fi.on); c.strokeStyle = '#fff'; c.lineWidth = lw*.7; c.stroke(); c.globalAlpha = 1; }
      for (const f of Fi.flames) if (f.h > .02) halo2(c, f.x, f.y, f.sz*1.6, .45, f.h*.7, BEAM[f.s > .5 ? 1 : 0]);
      const I = A.impact;
      if (I){ c.globalAlpha = c01(I.al); c.beginPath(); c.ellipse(I.x, I.y, Math.max(.01, I.r), Math.max(.01, I.r)*.55, 0, 0, TAU);
        c.strokeStyle = INKC; c.lineWidth = lw*5; c.stroke(); c.strokeStyle = film(.97, .3, .82); c.lineWidth = lw*2.6; c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = lw*.8; c.stroke(); c.globalAlpha = 1;
        halo2(c, I.x, I.y, .7, .55, I.al, BEAM[0]); }
      SW.under.forEach(f => f(c, S));   // raised, the stacked feathers rise from behind: the body (drawn next) covers their base
    }
    c.restore();
    draw(c, x, y, R, t, ph, atk === 'wheel' ? { ...P, beats: { ...P.beats, spin: 0 } } : P);   // the wheel spins flat: not the tornado's upright wrap
    c.save(); c.translate(x, y); c.scale(R, R); c.lineCap = 'round'; c.lineJoin = 'round';
    if (atk === 'tornado'){
      const L = A.alive;
      if (L > .01) tower(c, A, t, lw, L);
      const dz = A.dizzy;   // dizzy: a little ring of shards orbiting over its head
      if (dz > .01) shards(c, Array.from({ length: 5 }, (_, k) => { const a = t*3 + k*TAU/5; return [Math.cos(a)*.38, -1.12 + Math.sin(a)*.12, a + Math.PI/2, .045]; }), lw, dz);
    } else if (atk === 'laser'){
      const { aim, fire } = A;
      const hot = Q => Q.raw.hot*(1 - .6*fire);
      if (hot(P) > .01){   // a hot foil ring round each laser eye: the charge
        const m = c.getTransform(), G = sprites(Math.max(24, Math.min(400, Math.round(Math.hypot(m.a, m.b)/8)*8)), c).ring;
        c.globalAlpha = c01(hot(P)*1.2);
        for (const [ex, ey] of P.out){ const e = 1 + .4*P.raw.hot; c.drawImage(G.cv, ex + G.x*e, ey + G.y*e, G.w*e, G.h*e); }
        c.globalAlpha = 1; }
      if (fire > .01){
        const hits = [];
        for (const b of A.beams){   // prism beams: cel bands of split light (teal, a pink fringe, a white core), ink edges
          const w = Math.max(.004, b.w), Lb = b.len;
          c.save(); c.translate(b.x, b.y); c.rotate(b.a);
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .38*c01(fire*2); c.fillStyle = BEAM[0]; c.fillRect(0, -w*2.6, Lb, w*5.2); c.globalAlpha = .3*c01(fire*2); c.fillStyle = BEAM[1]; c.fillRect(0, -w*1.7, Lb, w*3.4); c.restore();   // the beam's light on the floor
          c.fillStyle = BEAM[0]; c.fillRect(0, -w, Lb, 2*w); c.fillStyle = BEAM[1]; c.fillRect(0, -w, Lb, w*.62); c.fillStyle = '#fff'; c.fillRect(0, -w*.3, Lb, w*.6);
          c.beginPath(); c.moveTo(0, -w); c.lineTo(Lb, -w); c.moveTo(0, w); c.lineTo(Lb, w); c.strokeStyle = INKC; c.lineWidth = lw*2; c.stroke();
          c.beginPath(); c.arc(0, 0, w*1.3, 0, TAU); c.fillStyle = '#ffd0d6'; c.fill(); c.strokeStyle = INKC; c.stroke();
          c.restore(); hits.push([b.end.x, b.end.y, fire]); }
        const T = A.track, fl = k => .75 + .25*Math.sin(t*29 + k*2.3) + .12*Math.sin(t*47 + k);   // the splash flickers
        for (const odd of [0, 1]){   // where each beam burns into the floor the light splits: a tall flickering prism splash round a white crystal
          c.beginPath();
          hits.forEach(([hx, hy, m], i) => { for (let k = odd; k < 8; k += 2){ const bb = k/8*TAU + .2 + .15*Math.sin(t*5 + i), up = Math.sin(bb) < 0 ? 1.5 : .55, L = (.55 + .25*hh(k, i + Math.floor(t*14)))*m*fl(i)*up, nx = -Math.sin(bb)*.07, ny = Math.cos(bb)*.042;
            c.moveTo(hx + nx, hy + ny); c.lineTo(hx + Math.cos(bb)*L, hy + Math.sin(bb)*L*.62); c.lineTo(hx - nx, hy - ny); c.closePath(); } });
          c.fillStyle = odd ? BEAM[0] : BEAM[1]; c.fill(); c.globalAlpha = .85; c.strokeStyle = '#fff'; c.lineWidth = lw*1.4; c.stroke(); c.globalAlpha = 1; }
        c.beginPath(); hits.forEach(([hx, hy], i) => { const e = fl(i + 3); c.moveTo(hx, hy - .13*e); c.lineTo(hx + .08*e, hy); c.lineTo(hx, hy + .1*e); c.lineTo(hx - .08*e, hy); c.closePath(); });
        c.fillStyle = '#fff'; c.fill(); c.strokeStyle = INKC; c.lineWidth = lw; c.stroke();
        const K = [];   // crystal sparks kicked up and thrown back off the walking burn
        hits.forEach(([hx, hy], i) => { for (let k = 0; k < 6; k++){ const f = (t*2.4 + k/6 + i*.17) % 1, cyc = Math.floor(t*2.4 + k/6 + i*.17), sd = (hh(i*7 + k, cyc) - .5)*1.6, sp = .35 + .3*hh(k, cyc + i);
          const vx = -T.dx*.5 + T.nx*sd, vy = -T.dy*.5 + T.ny*sd;
          K.push([hx + vx*sp*f, hy + vy*sp*f*.6 - (1.3*f - f*f)*.55, t*9 + k + i, .05*(1 - f)*fire]); } });
        shards(c, K, lw, c01(fire*1.2));
        c.beginPath();   // smoke curling off the fresh burn just behind each beam
        hits.forEach(([hx, hy], i) => { for (let j = 0; j < 3; j++){ const f = (t*.9 + j/3 + i*.23) % 1, r = .05 + .12*f, bx = hx - T.dx*.25*f + Math.sin(i + j*2 + f*4)*.05, by = hy - T.dy*.25*f - .1 - .55*f; c.moveTo(bx + r, by); c.arc(bx, by, r, 0, TAU); } });
        c.globalAlpha = c01(.35*fire); c.fillStyle = film(.8, .25, .7); c.fill(); c.strokeStyle = INKC; c.lineWidth = lw*.7; c.stroke(); c.globalAlpha = 1; }
      if (A.pool > .01) shards(c, A.beams.flatMap((b, i) => [0, 1, 2].map(j => { const a = j*2.1 + i; return [b.end.x + Math.cos(a)*.14, b.end.y + Math.sin(a)*.06, a, .05*A.pool]; })), lw, A.pool);
      if (A.smoke > .01){   // spent: the laser eyes smoke
        c.beginPath();
        P.out.forEach(([ex, ey], i) => { for (let j = 0; j < 3; j++){ const f = (t*.6 + j/3 + i*.21) % 1, r = .05 + .1*f, sx = ex + Math.sin(i + j*2 + f*3)*.06, sy = ey - .08 - .5*f; c.moveTo(sx + r, sy); c.arc(sx, sy, r, 0, TAU); } });
        c.globalAlpha = c01(.6*A.smoke); c.fillStyle = 'rgba(150,140,180,.9)'; c.fill(); c.strokeStyle = INKC; c.lineWidth = lw*.7; c.stroke(); c.globalAlpha = 1; }
    } else if (atk === 'wheel'){
      const { pos, rate } = A;
      if (rate > .02){   // the saw's speed: foil arcs whirling round its rim, and crystal chips spat off behind it
        for (let k = 0; k < 6; k++){ const a0 = A.spin + k*TAU/6, r = .8 + .07*hh(k, 61), L = .4 + 1*rate;
          c.globalAlpha = c01(rate*(.45 + .35*hh(k, 62))); c.beginPath(); c.arc(pos.x, pos.y, r, a0 - L, a0);
          c.strokeStyle = INKC; c.lineWidth = lw*3.6; c.stroke(); c.strokeStyle = film(k/6, .45, .75); c.lineWidth = lw*1.8; c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = lw*.6; c.stroke(); }
        const K = []; for (let k = 0; k < 8; k++){ const g = t*3.2 + k/8, f = g % 1, cy = Math.floor(g), b = A.dir + Math.PI + (hh(k, cy + 64) - .5)*1.6, r = .82 + .7*f;
          K.push([pos.x + Math.cos(b)*r, pos.y + Math.sin(b)*r*.8 - .2*f, b, .06*(1 - f)]); }
        shards(c, K, lw, c01(rate*1.3)); }
      A.hits.forEach((h, j) => { if (h.al < .01) return; const q = 1 - h.al;   // the ricochet: a burst of crystal flung off the corner
        shards(c, Array.from({ length: 9 }, (_, k) => { const a = k/9*TAU + j*.7, r = .2 + .9*q*(.7 + .5*hh(k, j + 66)); return [h.x + Math.cos(a)*r, h.y + Math.sin(a)*r*.6 - .3*q*(1 - q)*4*hh(k, 67), a, .08*h.al]; }), lw, h.al); });
      const ld = Math.sin(Math.PI*c01((u - .8)/.12)), q = c01((u - .8)/.12);   // home again: a puff of crystal dust where it lands
      if (ld > .01) shards(c, Array.from({ length: 10 }, (_, k) => { const a = k/10*TAU + .3, r = .75 + .6*q; return [pos.x + Math.cos(a)*r, pos.y + .1 + Math.sin(a)*r*.4 - .15*ld, a, .055*ld]; }), lw, ld);
      if (A.dizzy > .01) shards(c, Array.from({ length: 5 }, (_, k) => { const a = t*3 + k*TAU/5; return [pos.x + Math.cos(a)*.38, pos.y - 1.02 + Math.sin(a)*.12, a + Math.PI/2, .045]; }), lw, A.dizzy);
    } else if (atk === 'recall'){
      A.feathers.forEach((f, i) => {
        const p = f.plant;
        if (f.dust > .01) shards(c, Array.from({ length: 6 }, (_, k) => { const a = k/6*TAU + i, r = .08 + .3*(1 - f.dust); return [p.x + Math.cos(a)*r, p.y + Math.sin(a)*r*.55 - .12*(1 - f.dust), a, .045*f.dust]; }), lw, f.dust);
        if (f.tear > .01 && f.state >= 3) shards(c, Array.from({ length: 5 }, (_, k) => { const a = -Math.PI/2 + (k - 2)*.6, r = .06 + .35*(1 - f.tear); return [p.x + Math.cos(a)*r, p.y + Math.sin(a)*r, a, .05*f.tear]; }), lw, f.tear);
        if (!(f.vis > .01 && f.state >= 1 && f.state <= 3)) return;
        const qv = f.state === 2 ? Math.sin(t*46 + i*2.3)*.09*f.quiver : 0, a = f.a + qv, L = f.len*(f.state === 2 ? .8 : 1), X = f.x, Y = f.y - f.z;
        if (f.state !== 2){ const sk = Math.sin(Math.PI*f.k), bx = X - Math.cos(a)*L, by = Y - Math.sin(a)*L;   // a short streak of light behind it as it flies
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = c01(.7*sk); c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - Math.cos(a)*.4*sk, by - Math.sin(a)*.4*sk);
          c.strokeStyle = BEAM[i % 2]; c.lineWidth = f.w*1.4; c.stroke(); c.restore(); }
        const F = RIG.feather(X - Math.cos(a)*L, Y - Math.sin(a)*L, a, L, f.w*1.7, .08);
        foil(c, F, .5 + i*.09 + .05*Math.sin(t*2 + i), lw*.75, f.vis);
        if (f.state === 2 && f.quiver > .01){ c.globalAlpha = c01(.6*f.quiver*(.5 + .5*Math.sin(t*46 + i*2.3))); c.beginPath(); c.arc(X, Y, .035, 0, TAU); c.fillStyle = '#fff'; c.fill(); c.globalAlpha = 1; } });
    } else if (atk === 'sword'){
      const B = A.blade;
      SW.over.forEach(f => f(c, S));   // the feathers in flight, and the stacked blade once it has swung over the body
      const Fs = A.fire.flames.filter(f => f.h > .02).sort((p, q) => p.y - q.y);   // the eruption: crystal prisms bursting up out of the split floor one after another
      for (const f of Fs){ const H = f.sz*f.h*2.2, w0 = .07*f.sz/.28;
        for (let k = 0; k < 3; k++){ const o = (k - 1)*w0*1.6 + (hh(k, f.s*50) - .5)*.04, Hk = H*(k === 1 ? 1 : .6 + .3*hh(k + 3, f.s*50)), lean = (k - 1)*.25*Hk, X = f.x + o, Y = f.y + (k === 1 ? .02 : 0), w = w0*(k === 1 ? 1 : .75);
          c.globalAlpha = c01(f.al*1.3); poly(c, [[X - w, Y], [X - w + lean*.8, Y - Hk*.78], [X + lean, Y - Hk], [X + w + lean*.8, Y - Hk*.78], [X + w, Y]]);
          c.fillStyle = film(f.s + k*.22, .45, .72); c.fill(); c.strokeStyle = INKC; c.lineWidth = lw*1.8; c.stroke();
          c.beginPath(); c.moveTo(X, Y); c.lineTo(X + lean, Y - Hk); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = lw*.7; c.stroke(); }
        if (f.h > .5) shards(c, [0, 1, 2].map(k => { const a = -Math.PI/2 + (k - 1)*.8; return [f.x + Math.cos(a)*H*.6, f.y - H*1.1 + Math.sin(a)*.05, a, .04*(f.h - .5)*2]; }), lw, f.al); }
      c.globalAlpha = 1;
    }
    c.restore();
  }

  return {
    bg(c, w, t){ c.drawImage(floor(w), 0, 0, w, w); },
    boss,
    attack,
    post(c, w, t){},   // ponytail: the level's live foil pass is not reproduced on the floor; the boss carries its own
  };
})();
