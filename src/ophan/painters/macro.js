import { OPHAN, OPHAN_RIG, hh, mk, TAU } from '../page.js'
// The Ophan in the Topsoil look (macro): a seraph of real feathers fallen on the soil, shot under the same raking top-left
// softbox as the mole and badger. Six barred hawk wings in three pairs (up, out, and a down pair whose long primaries hook
// in like talons) overlap on a rosette of dark down around ONE great unblinking eye, backlit so its light combs through
// the down; ten lidded eyes sit in the coverts and all turn to the same point. Painted like src/macro.js paints its cast
// (nested-outline volume, inner rim shadow, wet specular, grain, a blurred black twin on the soil away from the light).
// Every part is baked once per scale; boss() only places the bakes with transforms that are continuous in t.
OPHAN.macro = (() => {
  let LX = -.62; const LY = -.78, OFF = 1e4;
  const C = (h, a = 1) => `rgba(${h >> 16 & 255},${h >> 8 & 255},${h & 255},${(+a).toFixed(3)})`;
  const mixc = (a, b, k) => { const f = (s) => ((a >> s & 255) + ((b >> s & 255) - (a >> s & 255))*k) & 255; return f(16) << 16 | f(8) << 8 | f(0); };
  const sh = (h, k) => k >= 0 ? mixc(h, 0xffffff, k) : mixc(h, 0, -k);
  const tr = (c, P) => { c.beginPath(); c.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1]); c.closePath(); };
  const almond = (rx, ry, n = 24) => { const P = [];
    for (let k = 0; k < n; k++){ const a = k/n*TAU, s = Math.sin(a); P.push([Math.cos(a)*rx, s*ry*Math.pow(Math.abs(s), .35)]); } return P; };
  const sb = (c, blur, col, draw) => { const m = c.getTransform(); c.save(); c.shadowColor = col; c.shadowBlur = Math.max(.01, blur*c._S);
    c.shadowOffsetX = OFF; c.setTransform(m.a, m.b, m.c, m.d, m.e - OFF, m.f); c.fillStyle = c.strokeStyle = '#000'; draw(); c.restore(); };
  const soft = (c, P, b, col) => sb(c, b, col, () => { tr(c, P); c.fill(); });
  const dot = (c, x, y, r, b, col) => sb(c, b, col, () => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); });
  const inner = (c, P, b, col, dx = 0, dy = 0) => { c.save(); tr(c, P); c.clip();
    sb(c, b, col, () => { c.beginPath(); c.rect(-9, -9, 18, 18); c.moveTo(P[0][0] + dx, P[0][1] + dy);
      for (let i = 1; i < P.length; i++) c.lineTo(P[i][0] + dx, P[i][1] + dy); c.closePath(); c.fill('evenodd'); });
    c.restore(); };
  // macro.js volume(): nested outlines shrinking toward a crown nudged at the light, dark rim -> base -> lit crown
  const vol = (c, P, base, o = {}) => {
    let x0 = 9, y0 = 9, x1 = -9, y1 = -9; for (const [x, y] of P){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const s = Math.max(x1 - x0, y1 - y0)/2, cx = (x0 + x1)/2 + LX*s*(o.lean ?? .3), cy = (y0 + y1)/2 + LY*s*(o.lean ?? .3);
    const dark = sh(base, -(o.ao ?? .55)), lit = sh(base, o.lit ?? .3), N = 14, kMin = o.kMin ?? .15;
    for (let i = 0; i <= N; i++){ const u = i/N, k = 1 - u*(1 - kMin);
      const col = u < .4 ? mixc(dark, base, u/.4) : mixc(base, lit, (u - .4)/.6);
      tr(c, P.map(([x, y]) => [cx + (x - cx)*k, cy + (y - cy)*k])); c.fillStyle = C(col, o.a ?? 1); c.fill(); }
    if ((o.rim ?? 1) > 0) inner(c, P, (o.rimBlur ?? .03), C(sh(base, -.8), .75*(o.rim ?? 1)));
    return P; };
  const spec = (c, P, a = .8, b = .012) => { soft(c, P, b*2.2, `rgba(255,255,255,${a*.45})`); soft(c, P, b*.5, `rgba(255,255,255,${a})`); };
  let noise = null;
  const grainy = (c, P, a = .35, mode = 'overlay') => {
    if (!noise){ noise = mk(96, 96); const g = noise.getContext('2d'), id = g.createImageData(96, 96);
      for (let i = 0; i < id.data.length; i += 4){ const v = 70 + hh(i, 3)*120; id.data[i] = id.data[i+1] = id.data[i+2] = v; id.data[i+3] = 255; } g.putImageData(id, 0, 0); }
    c.save(); tr(c, P); c.clip(); c.globalCompositeOperation = mode; c.globalAlpha = a;
    const p = c.createPattern(noise, 'repeat'); p.setTransform(new DOMMatrix([1/c._S, 0, 0, 1/c._S, 0, 0])); c.fillStyle = p; c.fillRect(-3, -3, 6, 6); c.restore(); };
  const line = (c, P, w, col) => { c.beginPath(); c.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1]); c.lineWidth = w; c.strokeStyle = col; c.stroke(); };

  // one feather: a curved shaft, an asymmetric vane (narrow leading side), hawk barring, barbs, a lit edge, satin sheen.
  // curl bends the shaft toward its trailing side (+n); ce > 2 keeps the bend for the end: a hooked tip.
  const feather = (c, x, y, a, L, W, o = {}) => {
    const ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux, N = 16, curl = o.curl ?? 0, ce = o.ce ?? 2, lead = o.lead ?? .6;
    const sp = [], A = [], Bk = [];
    for (let k = 0; k <= N; k++){ const u = k/N, b = curl*Math.pow(u, ce)*L, db = curl*ce*Math.pow(u, ce - 1);
      const sx = x + ux*u*L + px*b, sy = y + uy*u*L + py*b, tx = ux + px*db, ty = uy + py*db, tn = Math.hypot(tx, ty), nx = -ty/tn, ny = tx/tn;
      const grow = Math.sin(Math.min(1, .3 + u*2)*Math.PI/2);
      const end = o.round ? Math.sqrt(Math.max(0, 1 - Math.pow(u, 5))) : (u < .45 ? 1 : Math.pow(Math.cos((u - .45)/.55*Math.PI/2), .75));
      const ww = W*grow*end + .0015;
      sp.push([sx, sy, nx, ny, ww]); A.push([sx - nx*ww*lead, sy - ny*ww*lead]); Bk.unshift([sx + nx*ww, sy + ny*ww]); }
    const P = A.concat(Bk), at = (u) => sp[Math.round(u*N)];
    soft(c, P.map(([p, q]) => [p - LX*.028, q - LY*.028]), .022, 'rgba(8,3,1,.6)');      // its shadow on the feather below
    const base = o.col ?? 0xb39a7e, g = c.createLinearGradient(x, y, sp[N][0], sp[N][1]);
    g.addColorStop(0, C(o.root ?? 0x3a1c14)); g.addColorStop(.22, C(base)); g.addColorStop(.7, C(sh(base, -.12))); g.addColorStop(1, C(o.tip ?? 0x2a1a12));
    tr(c, P); c.fillStyle = g; c.fill();
    c.save(); tr(c, P); c.clip(); c.lineCap = 'round';
    for (const u of o.bars ?? [.36, .58, .8]){                                        // barring: chevrons that point at the tip
      const s0 = at(u - .05), s1 = at(u), s2 = at(u - .05);
      line(c, [[s0[0] - s0[2]*W*2, s0[1] - s0[3]*W*2], [s1[0], s1[1]], [s2[0] + s2[2]*W*2, s2[1] + s2[3]*W*2]], W*(o.barW ?? .32), C(o.barC ?? 0x3a2216, .55)); }
    const m = at(.5), litT = m[2]*-LX + m[3]*-LY > 0;                                  // which vane faces the softbox
    const half = (side) => sp.map(([p, q]) => [p, q]).concat((side > 0 ? Bk : A.slice().reverse()));
    tr(c, half(litT ? -1 : 1)); c.fillStyle = 'rgba(16,6,3,.5)'; c.fill();
    tr(c, half(litT ? 1 : -1)); c.fillStyle = 'rgba(255,236,200,.16)'; c.fill();
    if (o.irid){ const s0 = at(.62), g4 = c.createLinearGradient(s0[0] - s0[2]*W, s0[1] - s0[3]*W, s0[0] + s0[2]*W, s0[1] + s0[3]*W);   // a band of structural colour, like a ground beetle's
      g4.addColorStop(0, 'rgba(120,50,20,.0)'); g4.addColorStop(.3, 'rgba(226,150,60,.8)'); g4.addColorStop(.6, 'rgba(176,82,34,.75)'); g4.addColorStop(1, 'rgba(90,30,14,.0)');
      const s1 = at(.5), s2 = at(.78); line(c, [[s1[0], s1[1]], [s0[0], s0[1]], [s2[0], s2[1]]], W*1.3, 'rgba(40,16,6,.35)'); c.save(); c.globalCompositeOperation = 'screen'; line(c, [[s1[0], s1[1]], [s0[0], s0[1]], [s2[0], s2[1]]], W*.9, g4); c.restore(); }
    for (let k = 2; k < N - 1; k++) for (const sd of [-1, 1]){                         // barbs, raked toward the tip
      const [p, q, nx, ny, ww] = sp[k], [p2, q2] = sp[Math.min(N, k + 2)], r = sd < 0 ? ww*lead : ww;
      c.beginPath(); c.moveTo(p, q); c.lineTo(p2 + sd*nx*r, q2 + sd*ny*r); c.lineWidth = .0028;
      c.strokeStyle = (k + (sd > 0 ? 1 : 0)) % 2 ? 'rgba(20,8,4,.22)' : 'rgba(255,240,220,.12)'; c.stroke(); }
    if (o.talon){                                                                     // the hooked end turns to wet black keratin
      const s0 = at(.66), g2 = c.createLinearGradient(s0[0], s0[1], sp[N][0], sp[N][1]);
      g2.addColorStop(0, 'rgba(14,6,4,0)'); g2.addColorStop(.35, 'rgba(14,6,4,.92)'); g2.addColorStop(1, 'rgba(8,2,2,1)');
      c.fillStyle = g2; c.fillRect(-3, -3, 6, 6);
      const g3 = c.createLinearGradient(s0[0], s0[1], sp[N][0], sp[N][1]); g3.addColorStop(.5, 'rgba(120,10,8,0)'); g3.addColorStop(1, 'rgba(150,14,10,.55)');
      c.fillStyle = g3; c.fillRect(-3, -3, 6, 6); }
    grainy(c, P, .22);
    c.restore();
    inner(c, P, .01, 'rgba(12,5,2,.6)');
    line(c, litT ? Bk.slice(1, -2) : A.slice(2, -1), .013, o.talon ? 'rgba(255,224,200,.8)' : 'rgba(255,222,140,.95)');     // the softbox on the lit edge
    c.save(); c.lineCap = 'round';                                                    // the shaft: a dark under-line, a pale quill
    const q = sp.slice(0, N - 1);
    for (let k = 0; k < q.length - 1; k++){ const u = k/N, w = W*(.2 - .16*u);
      c.beginPath(); c.moveTo(q[k][0] - LX*.004, q[k][1] - LY*.004); c.lineTo(q[k+1][0] - LX*.004, q[k+1][1] - LY*.004); c.lineWidth = w*1.4; c.strokeStyle = 'rgba(10,4,2,.5)'; c.stroke();
      c.beginPath(); c.moveTo(q[k][0], q[k][1]); c.lineTo(q[k+1][0], q[k+1][1]); c.lineWidth = w; c.strokeStyle = C(o.quill ?? 0xe4d4b8, o.talon && u > .6 ? .2 : .9); c.stroke(); }
    c.restore();
    const sv = (lo, hi, k0, k1) => { const pts = []; for (let k = Math.round(lo*N); k <= Math.round(hi*N); k++){ const [p, q2, nx, ny, ww] = sp[k], s = litT ? 1 : -lead; pts.push([p + nx*ww*s*k0, q2 + ny*ww*s*k0]); }
      for (let k = Math.round(hi*N); k >= Math.round(lo*N); k--){ const [p, q2, nx, ny, ww] = sp[k], s = litT ? 1 : -lead; pts.push([p + nx*ww*s*k1, q2 + ny*ww*s*k1]); } return pts; };
    spec(c, sv(.22, .55, .25, .6), o.sheen ?? .22, .01);                             // satin sheen on the lit vane
    if (o.talon){ spec(c, sv(.74, .96, .15, .55), .85, .004); dot(c, sp[N][0], sp[N][1], .008, .008, 'rgba(255,70,40,.8)'); }
    return P; };

  function backPlate(c){                                         // its back: a domed umber shell of overlapping scale-feathers, split by a lit keel seam
    const g = c.createRadialGradient(-.08, -.1, .02, 0, 0, .36); g.addColorStop(0, '#9a6a44'); g.addColorStop(.45, '#5a3018'); g.addColorStop(1, '#2a1408');
    c.beginPath(); c.ellipse(0, 0, .34, .3, 0, 0, TAU); c.fillStyle = g; c.fill();
    c.save(); c.clip();
    for (let r = 0; r < 6; r++) for (let k = -4; k <= 4; k++){ const x = k*.085 + (r % 2)*.042, y = -.27 + r*.1, s = .055;
      c.beginPath(); c.arc(x, y, s, .15, Math.PI - .15); c.lineWidth = .016; c.strokeStyle = 'rgba(26,12,4,.75)'; c.stroke();
      c.beginPath(); c.arc(x - .006, y - .008, s*.85, .5, Math.PI - .9); c.lineWidth = .01; c.strokeStyle = 'rgba(232,186,120,.45)'; c.stroke(); }
    c.restore();
    c.beginPath(); c.moveTo(0, -.3); c.quadraticCurveTo(.02, 0, 0, .3); c.lineWidth = .03; c.strokeStyle = 'rgba(20,8,2,.9)'; c.stroke();
    c.beginPath(); c.moveTo(-.012, -.28); c.quadraticCurveTo(.006, 0, -.012, .28); c.lineWidth = .01; c.strokeStyle = 'rgba(255,214,150,.7)'; c.stroke();
    c.beginPath(); c.ellipse(0, 0, .34, .3, 0, 0, TAU); c.lineWidth = .02; c.strokeStyle = 'rgba(20,8,2,.8)'; c.stroke();
  }
  function rosette(c){                                           // the hub: backlit down combed out by the eye's light, dark breast feathers
    c.save(); c.lineCap = 'round';
    for (let k = 0; k < 80; k++){ const a = k/80*TAU + hh(k, 61)*.05, r1 = .5 + hh(k, 62)*.2;
      const g = c.createLinearGradient(0, 0, Math.cos(a)*r1, Math.sin(a)*r1); g.addColorStop(.3, 'rgba(255,190,120,.0)'); g.addColorStop(.5, 'rgba(255,200,140,.8)'); g.addColorStop(1, 'rgba(255,170,100,0)');
      c.beginPath(); c.moveTo(Math.cos(a)*.2, Math.sin(a)*.2); c.quadraticCurveTo(Math.cos(a + .06)*r1*.6, Math.sin(a + .06)*r1*.6, Math.cos(a + .03)*r1, Math.sin(a + .03)*r1);
      c.lineWidth = .004 + hh(k, 63)*.004; c.strokeStyle = g; c.stroke(); }
    c.restore();
    for (const [r0, n, len, w, off, col] of [[.15, 14, .25, .062, 0, 0x5a2a1e], [.07, 11, .2, .058, .5, 0x4a1e16]])
      for (let k = 0; k < n; k++){ const a = (k + off)/n*TAU - Math.PI/2;
        feather(c, Math.cos(a)*r0, Math.sin(a)*r0, a, len, w, { round: 1, col, root: 0x160806, tip: 0x2a120c, bars: [], quill: 0x8a5a44, sheen: .3 }); }
    // the socket: a thick rim of dark skin, a red-lit hollow
    const so = almond(.3, .23, 36);
    dot(c, 0, 0, .3, .08, 'rgba(255,90,40,.4)');
    vol(c, so, 0x3a1612, { lit: .3, ao: .6, rimBlur: .03 });
    grainy(c, so, .45);
    tr(c, almond(.25, .185, 36)); c.fillStyle = '#0c0302'; c.fill();
  }
  const JN = { n: 7, off: -.4, push: .1, twist: 1.5, shrink: .1 };     // A, feather knot: the knot unwinds
  function knot(c){                                              // the wing roots' coverts swirl into one tight knot, like the base of a bird's tail
    dot(c, 0, 0, .3, .06, 'rgba(8,3,1,.55)');
    const rows = [[.34, 11, .24, .065, 0xc9a274], [.25, 9, .2, .06, 0xa87850], [.17, 7, .16, .055, 0x9a6a44], [.1, 5, .12, .045, 0x7a4a2c]];
    rows.forEach(([r, n, L, w, col], j) => { for (let k = 0; k < n; k++){ const a = k/n*TAU + j*.45 + hh(k, 301 + j)*.08;
      feather(c, Math.cos(a)*r, Math.sin(a)*r, a + Math.PI*.5 + .35, L, w, { round: 1, lead: .8, curl: -.45, col, root: 0x2a1408, tip: sh(col, -.35), bars: [], quill: 0xd8b088, sheen: .4 }); } });
    const P = []; for (let k = 0; k < 40; k++){ const a = k/40*TAU; P.push([Math.cos(a)*.05, Math.sin(a)*.05]); }
    vol(c, P, 0x4a2414, { lit: .4, ao: .6, rimBlur: .015 });      // the knot's tight heart: a nub of down
    for (let k = 0; k < 26; k++){ const a = hh(k, 311)*TAU, r = .08 + .26*hh(k, 312), s = .006 + .006*hh(k, 313);   // soil grit caught in the barbs
      dot(c, Math.cos(a)*r, Math.sin(a)*r, s, .003, 'rgba(40,24,12,.9)'); dot(c, Math.cos(a)*r + LX*s*.3, Math.sin(a)*r + LY*s*.3, s*.45, .002, 'rgba(240,210,160,.7)'); }
  }
  function bigEye(c){                                            // sclera, veins: clipped live by the lid
    const r = .25, g = c.createRadialGradient(-.06, -.05, .02, 0, 0, r);
    g.addColorStop(0, '#fbeedc'); g.addColorStop(.7, '#e2c4ac'); g.addColorStop(1, '#7a3a28');
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = g; c.fill(); c.lineCap = 'round';
    for (let k = 0; k < 26; k++){ const a = hh(k, 9)*TAU, r0 = r*(.98 - hh(k, 8)*.1); c.beginPath(); c.moveTo(Math.cos(a)*r0, Math.sin(a)*r0);
      c.quadraticCurveTo(Math.cos(a + .2)*r*.8, Math.sin(a + .2)*r*.8, Math.cos(a + .1)*r*.6, Math.sin(a + .1)*r*.6); c.lineWidth = .004; c.strokeStyle = 'rgba(170,30,26,.6)'; c.stroke(); }
  }
  function bigIris(c){                                           // a red-gold iris that glows from inside, a slit pupil
    const ir = .15;
    dot(c, 0, 0, ir*1.05, .04, 'rgba(255,120,40,.6)');
    const gi = c.createRadialGradient(0, 0, .01, 0, 0, ir);
    gi.addColorStop(0, '#fff0b0'); gi.addColorStop(.3, '#ffb040'); gi.addColorStop(.6, '#e0301a'); gi.addColorStop(.9, '#6a0806'); gi.addColorStop(1, '#1a0202');
    c.beginPath(); c.arc(0, 0, ir, 0, TAU); c.fillStyle = gi; c.fill();
    for (let k = 0; k < 56; k++){ const a = k/56*TAU; c.beginPath(); c.moveTo(Math.cos(a)*ir*.32, Math.sin(a)*ir*.32); c.lineTo(Math.cos(a + .05)*ir*.95, Math.sin(a + .05)*ir*.95);
      c.lineWidth = .003; c.strokeStyle = k % 2 ? 'rgba(255,230,140,.4)' : 'rgba(60,0,0,.35)'; c.stroke(); }
    tr(c, almond(.026, .12, 20).map(([x, y]) => [x, y])); c.fillStyle = '#050101'; c.fill();
  }
  function bigTop(c){                                            // over the eye: the lid's shade, the softbox window, a wet rim
    inner(c, almond(.25, .185, 36), .05, 'rgba(30,6,4,.8)', 0, .03);
    c.fillStyle = 'rgba(255,255,255,.92)'; c.fillRect(-.13, -.1, .085, .045);
    dot(c, .09, .07, .018, .015, 'rgba(255,255,255,.45)');
    const P = almond(.25, .185, 36); tr(c, P); c.lineWidth = .016; c.strokeStyle = C(0x220c08); c.stroke(); c.lineWidth = .006; c.strokeStyle = 'rgba(255,170,140,.4)'; c.stroke();
  }
  // a covert eye, unit half-width: the socket (lids of dark skin), the sclera, the iris, the lid's shade
  function socket(c){
    dot(c, 0, 0, 1.2, .35, 'rgba(10,3,2,.7)');
    vol(c, almond(1.35, .95, 28), 0x4a2418, { lit: .32, ao: .6, rimBlur: .2 });
    const ig = c.createConicGradient(-2.2, 0, 0); ig.addColorStop(0, '#5ae0a0'); ig.addColorStop(.3, '#2a8ae8'); ig.addColorStop(.55, '#6a3ad0'); ig.addColorStop(.8, '#2ab8a0'); ig.addColorStop(1, '#5ae0a0');
    tr(c, almond(1.24, .86, 28)); c.lineWidth = .2; c.strokeStyle = ig; c.stroke();                // an iridescent ring, beetle-green to blue
    tr(c, almond(1.36, .96, 28)); c.lineWidth = .06; c.strokeStyle = 'rgba(12,4,2,.7)'; c.stroke();
    tr(c, almond(1, .62, 28)); c.fillStyle = '#100403'; c.fill();
  }
  function sclera(c){ const g = c.createRadialGradient(-.3, -.25, .1, 0, 0, 1); g.addColorStop(0, '#f2e2cc'); g.addColorStop(1, '#8a5a44'); c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fillStyle = g; c.fill(); }
  function iris(c){ const g = c.createRadialGradient(-.12, -.12, .05, 0, 0, .58); g.addColorStop(0, '#ff8a4a'); g.addColorStop(.5, '#c81c14'); g.addColorStop(1, '#2a0302');
    c.beginPath(); c.arc(0, 0, .58, 0, TAU); c.fillStyle = g; c.fill(); tr(c, almond(.12, .48, 16)); c.fillStyle = '#060101'; c.fill(); }
  function lidTop(c){ inner(c, almond(1, .62, 28), .25, 'rgba(30,8,4,.85)', 0, .2); c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(-.5, -.4, .32, .2); }
  function halo(c){                                              // a thin ring of tarnished gilt wire, lit on the softbox side
    c.lineCap = 'round';
    c.beginPath(); c.arc(-LX*.03, -LY*.03, 1, 0, TAU); c.lineWidth = .24; c.strokeStyle = 'rgba(14,6,2,.75)'; c.stroke();
    c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.lineWidth = .2; c.strokeStyle = C(0x7a5226); c.stroke();
    c.beginPath(); c.arc(0, 0, .91, 0, TAU); c.lineWidth = .025; c.strokeStyle = 'rgba(30,14,4,.7)'; c.stroke();
    const la = Math.atan2(LY, LX);
    c.beginPath(); c.arc(0, 0, 1.03, la - 1.5, la + 1.5); c.lineWidth = .09; c.strokeStyle = C(0xe8c47a, .95); c.stroke();
    c.beginPath(); c.arc(0, 0, .95, la + Math.PI - 1.2, la + Math.PI + 1.2); c.lineWidth = .06; c.strokeStyle = 'rgba(255,200,120,.45)'; c.stroke();
    c.beginPath(); c.arc(0, 0, 1.04, la - .3, la + .3); c.lineWidth = .04; c.strokeStyle = 'rgba(255,255,255,.95)'; c.stroke();
  }

  const bake = (S, ext, paint) => { const W = Math.ceil(2*ext*S), b = mk(W, W), g = b.getContext('2d'); g._S = S; g.setTransform(S, 0, 0, S, W/2, W/2); paint(g); return { cv: b, x0: -ext, y0: -ext, w: 2*ext, h: 2*ext }; };
  const bakeR = (S, x0, y0, x1, y1, paint) => { const b = mk(Math.ceil((x1 - x0)*S), Math.ceil((y1 - y0)*S)), g = b.getContext('2d'); g._S = S; g.setTransform(S, 0, 0, S, -x0*S, -y0*S); paint(g);
    return { cv: b, x0, y0, w: x1 - x0, h: y1 - y0 }; };
  const twin = (B, S, k = .03) => { const b = mk(B.cv.width, B.cv.height), g = b.getContext('2d'); g.filter = `blur(${Math.max(1, S*k)}px)`; g.drawImage(B.cv, 0, 0);
    g.filter = 'none'; g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, b.width, b.height); return { ...B, cv: b }; };
  const cold = (B) => { const b = mk(B.cv.width, B.cv.height), g = b.getContext('2d'); g.drawImage(B.cv, 0, 0);    // the same bake, drained to a cold ashen grey-blue
    g.globalCompositeOperation = 'color'; g.fillStyle = '#7e8288'; g.fillRect(0, 0, b.width, b.height);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = '#a8acb4'; g.fillRect(0, 0, b.width, b.height);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(B.cv, 0, 0); return { ...B, cv: b }; };
  const put = (c, B) => c.drawImage(B.cv, B.x0, B.y0, B.w, B.h);
  const E = .07;                                                  // covert eye half-width
  const BK = {};
  const bakes = (S) => BK[S] || (BK[S] = (() => {
    const o = {};
    RIG.WINGS.forEach((W, i) => { const [x0, y0, x1, y1] = WBOX[i];
      for (const side of [1, -1]){ LX = side*-.62;                  // the left wing is painted mirrored, so its light comes from local +x
        const k = 'w' + i + (side > 0 ? 'R' : 'L');
        o[k] = bakeR(S, x0, y0, x1, y1, (c) => rigWing(c, i)); o[k + 'C'] = twin(o[k], S, .016); o[k + 'K'] = cold(o[k]);
        o[k + 'G'] = bakeR(S, x0, y0, x1, y1, (c) => rigWing(c, i, true)); o[k + 'GC'] = twin(o[k + 'G'], S, .016); o[k + 'GK'] = cold(o[k + 'G']);
      } });
    LX = -.62;
    o.hub = bake(S, .78, rosette); o.hubK = cold(o.hub); o.jn = bake(S, .5, knot); o.bigEye = bake(S, .26, bigEye); o.bigIris = bake(S, .17, bigIris); o.bigTop = bake(S, .27, bigTop); o.back = bake(S, .42, backPlate);
    const s = Math.max(4, Math.round(S*E));
    o.socket = bake(s, 1.6, socket); o.sclera = bake(s, 1, sclera); o.iris = bake(s, .6, iris); o.lidTop = bake(s, 1.02, lidTop);
    o.rays = bake(Math.max(4, Math.round(S*.6)), 1.5, (c) => { for (let k = 0; k < 24; k++){ const a = k/24*TAU + (k % 2)*.06, L = k % 2 ? 1 : 1.45, w = k % 2 ? .035 : .055;
      const g = c.createRadialGradient(0, 0, .2, 0, 0, L); g.addColorStop(0, 'rgba(255,232,176,.95)'); g.addColorStop(.45, 'rgba(255,190,110,.4)'); g.addColorStop(1, 'rgba(255,160,80,0)');
      c.beginPath(); c.moveTo(Math.cos(a - w)*.22, Math.sin(a - w)*.22); c.lineTo(Math.cos(a)*L, Math.sin(a)*L); c.lineTo(Math.cos(a + w)*.22, Math.sin(a + w)*.22); c.closePath(); c.fillStyle = g; c.fill(); } });
    { const sS = Math.max(4, Math.round(S/3)), sh0 = bakeR(sS, -.3, -1.5, 3.5, 1.5, (c) => {      // the god-ray: sun through dust, slanting in from the softbox
        const g = c.createLinearGradient(0, 0, 3.4, 0); g.addColorStop(0, 'rgba(255,214,150,0)'); g.addColorStop(.1, 'rgba(255,214,150,.42)'); g.addColorStop(.55, 'rgba(255,200,130,.22)'); g.addColorStop(1, 'rgba(255,190,120,0)');
        tr(c, [[0, -.55], [3.4, -1.3], [3.4, 1.3], [0, .55]]); c.fillStyle = g; c.fill();
        for (const [y0, y1, a] of [[-.35, -.8, .2], [-.05, -.1, .26], [.25, .55, .16], [.45, 1.0, .12]]){ tr(c, [[0, y0 - .06], [3.4, y1 - .12], [3.4, y1 + .12], [0, y0 + .06]]);
          const g2 = c.createLinearGradient(0, 0, 3.4, 0); g2.addColorStop(0, 'rgba(255,236,190,0)'); g2.addColorStop(.15, 'rgba(255,236,190,' + (+a).toFixed(3) + ')'); g2.addColorStop(1, 'rgba(255,236,190,0)'); c.fillStyle = g2; c.fill(); } });
      const b = mk(sh0.cv.width, sh0.cv.height), g = b.getContext('2d'); g.filter = 'blur(' + Math.max(1, sS*.06) + 'px)'; g.drawImage(sh0.cv, 0, 0); o.shaft = { ...sh0, cv: b }; }
    o.pool = bake(Math.max(4, Math.round(S/4)), 1.3, (c) => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 1.3); g.addColorStop(0, 'rgba(255,196,120,.6)'); g.addColorStop(.6, 'rgba(230,150,80,.2)'); g.addColorStop(1, 'rgba(200,120,60,0)');
      c.beginPath(); c.arc(0, 0, 1.3, 0, TAU); c.fillStyle = g; c.fill(); });
    o.burst = bake(Math.max(4, Math.round(S*.8)), 1.15, (c) => {
      c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.lineWidth = .05; c.strokeStyle = 'rgba(255,200,120,.35)'; c.stroke();
      for (let i = 0; i < 160; i++){ const a = hh(i, 101)*TAU, r = .86 + hh(i, 102)*.2, sz2 = .006 + hh(i, 103)*.016;
        c.beginPath(); c.arc(Math.cos(a)*r, Math.sin(a)*r, sz2, 0, TAU); c.fillStyle = 'rgba(255,' + (200 + Math.round(hh(i, 104)*50)) + ',140,.95)'; c.fill(); }
      for (let i = 0; i < 12; i++){ const a = hh(i, 105)*TAU; dot(c, Math.cos(a)*.95, Math.sin(a)*.95, .04 + hh(i, 106)*.04, .03, 'rgba(255,220,160,.3)'); } });
    o.halo = bake(Math.max(4, Math.round(S*.27)), 1.12, halo);
    o.glow = bake(Math.max(4, S/4), .7, (c) => { const g = c.createRadialGradient(0, 0, .05, 0, 0, .7); g.addColorStop(0, 'rgba(255,150,70,.9)'); g.addColorStop(.4, 'rgba(220,80,30,.35)'); g.addColorStop(1, 'rgba(160,40,10,0)');
      c.beginPath(); c.arc(0, 0, .7, 0, TAU); c.fillStyle = g; c.fill(); });
    o.blot = bake(Math.max(4, S/4), 1.5, (c) => { const g = c.createRadialGradient(0, 0, .1, 0, 0, 1.25); g.addColorStop(0, 'rgba(4,2,1,1)'); g.addColorStop(.5, 'rgba(4,2,1,.95)'); g.addColorStop(.82, 'rgba(4,2,1,.4)'); g.addColorStop(1, 'rgba(4,2,1,0)');
      c.save(); c.scale(1.15, .95); c.beginPath(); c.arc(0, 0, 1.25, 0, TAU); c.fillStyle = g; c.fill(); c.restore(); });
    return o; })());

  const divine = (c, B, t, k, over) => { if (k <= 0) return; c.save(); c.globalCompositeOperation = 'lighter';
    if (!over){ c.globalAlpha = .3*k; c.scale(1.35, 1.05); put(c, B.pool); c.restore(); return; }
    c.rotate(Math.atan2(LY, LX)); c.globalAlpha = .55*k*(1 + .12*Math.sin(t*.7)); put(c, B.shaft);
    c.fillStyle = 'rgba(255,238,196,1)';
    for (let i = 0; i < 18; i++){ const f = .5 + .5*Math.sin(t*(.13 + hh(i, 97)*.12) + hh(i, 98)*9), x = .4 + f*2.6, y = (hh(i, 99) - .5)*(.9 + .5*x/3) + .06*Math.sin(t*.9 + i);
      c.globalAlpha = k*(.35 + .6*hh(i, 96))*Math.sin(Math.PI*Math.min(1, x/3.1)); c.beginPath(); c.arc(x, y, .012 + hh(i, 95)*.02, 0, TAU); c.fill(); }   // dust motes turning in the beam
    c.restore(); };
  const CRACK = [[[-.02, -.03], [-.07, -.08], [-.1, -.07], [-.16, -.12]], [[-.02, -.03], [.05, -.01], [.09, -.07], [.17, -.09]], [[-.02, -.03], [.01, .06], [-.04, .11], [-.02, .16]], [[.05, -.01], [.1, .05], [.15, .06]]];
  const lid = (o) => { const P = almond(1, .62*o + .02, 20); return P; };
  // ---------------- the creature, placed by OPHAN_RIG: every root, angle, size and beat is the rig's; the feathers are ours ----------------
  const RIG = OPHAN_RIG, cl = RIG.cl;
  const setM = (c, M) => c.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
  const PEELS = (W) => W.feathers.filter((q, j) => j % 3 && !q.tal);
  // C: the feathers that peel off, in the order they leave: interleaved so both sides thin together
  const PEEL = []; for (let j = 0; j < 5; j++) for (const i of [0, 1, 2]) for (const side of [-1, 1]){ const q = PEELS(RIG.WINGS[i])[j]; if (q) PEEL.push({ i, side, q }); }
  // one rig wing in photographic feathers, in its own frame (the right wing; the left is the same wing, mirrored by its m)
  function rigWing(c, i, gap){ const W = RIG.WINGS[i];
    for (const q of W.feathers) if (!(gap && PEELS(W).includes(q))) feather(c, q.base[0], q.base[1], q.a, q.L, q.w*1.3, { lead: .75, curl: q.cv, ce: 2, talon: q.tal, col: 0xc9a274, root: 0x4a2414, tip: 0x2a1408 });
    for (const q of W.coverts) feather(c, q.base[0], q.base[1], q.a, q.L, q.w*1.25, { round: 1, curl: q.cv, ce: 2, col: 0x9a6a44, root: 0x2a120c, tip: 0x6a4630, bars: [.4], barW: .4, quill: 0xdcc4a0, irid: 1 }); }
  const WBOX = RIG.WINGS.map((W) => { let x0 = 9, y0 = 9, x1 = -9, y1 = -9;
    for (const q of W.feathers.concat(W.coverts)) for (const [x, y] of q.l.concat(q.r)){ x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0 - .1, y0 - .1, x1 + .1, y1 + .1]; });
  const ER = RIG.EYE.r/.25, EFROM = RIG.WINGS.map((W) => W.eyes[0].from);                                        // our great eye (almond .25) brought to the rig's
  // the creature in R units round its centre, from the rig pose P. sd 'C': its black contact twin. cold: the spent ash wash
  function wing(c, B, w, sd, cold){ const k = 'w' + w.i + (w.side > 0 ? 'R' : 'L') + (w.gap ? 'G' : ''), d = w.depth || 0;
    c.save(); if (w.K) setM(c, w.K);                                                              // the sword: this wing drawn out into it
    setM(c, w.m); c.globalAlpha *= w.vis; put(c, B[k + (sd || '')]);
    if (!sd){ const a = c.globalAlpha;
      if (cold){ c.globalAlpha = a*cold; put(c, B[k + 'K']); }
      if (d < 0){ c.globalAlpha = a*.6*-d; put(c, B[k + 'K']); c.globalAlpha = a*.55*-d; put(c, B[k + 'C']); }   // the far side: greyed and sunk in shade
      else if (d > 0){ c.globalCompositeOperation = 'lighter'; c.globalAlpha = a*.16*d; put(c, B[k]); } }      // the near side catches the sun
    c.restore(); if (!sd && w.after) w.after(); }
  function featherEye(c, B, e, ph, gx, gy, fx){ const k = RIG.ease(cl(Math.min(ph, 3) - EFROM[e.i] + 1)*Math.PI); if (k <= .01) return;   // an eye grows in as its phase opens it
    const o = e.open, dx = gx - e.x, dy = gy - e.y, dn = Math.hypot(dx, dy) || 1, s = e.r*.64*(.4 + .6*k);
    c.save(); c.translate(e.x, e.y); c.scale(s*fx, s); c.globalAlpha *= Math.min(1, k*3); put(c, B.socket);
    if (o > .01){ c.save(); tr(c, lid(o)); c.clip(); put(c, B.sclera); c.translate(dx/dn*.38, dy/dn*.2*o); put(c, B.iris); c.restore(); }
    c.scale(1, .3 + .7*o); put(c, B.lidTop); c.restore(); }
  function creature(c, B, t, ph, P, sd, cold){
    const front = (w) => (w.depth || 0) > 0 || w.over, [gx, gy] = P.gaze, fx = Math.max(.15, Math.abs(P.body.face == null ? 1 : P.body.face));   // edge-on, the eyes turn edge-on with it
    const eyesOf = (w) => { if (sd) return; c.save(); c.globalAlpha *= 1 - (w.merge || 0); for (const e of P.eyes) if (e.i === w.i && e.side === w.side) featherEye(c, B, e, ph, gx, gy, fx); c.restore(); };
    for (const w of P.wings) if (!front(w)){ wing(c, B, w, sd, cold); eyesOf(w); }
    if (!sd) core(c, B, t, ph, P, cold);
    for (const w of P.wings) if (front(w)){ wing(c, B, w, sd, cold); eyesOf(w); }
  }
  // phases 1-2 there is no eye at all, only the junction where the wings meet the body; it parts along its own joins to let the eye out
  function junction(c, B, o){
    if (o <= 0){ put(c, B.jn); return; }
    const k = RIG.sm(0, 1.1, o), n = JN.n, al = 1 - RIG.sm(.72, 1, o);
    if (al <= 0) return;
    for (let i = 0; i < n; i++){ const a0 = JN.off + i/n*TAU, a1 = a0 + TAU/n, am = (a0 + a1)/2, s = 1 - JN.shrink*k;
      c.save(); c.globalAlpha *= al; c.translate(Math.cos(am)*JN.push*k, Math.sin(am)*JN.push*k*.8); c.rotate(JN.twist*k); c.scale(s, s);
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, .5, a0, a1); c.closePath(); c.clip(); put(c, B.jn); c.restore(); }
  }
  function core(c, B, t, ph, P, cold){
    const bk = cl(-4*(P.body.face == null ? 1 : P.body.face));       // 0 facing us .. 1 once its back is turned
    const Ey = P.eye, bt = P.beats, gp = Ey.gape, pe = Math.min(1, Ey.open), peB = Math.min(1, pe + .45*gp*bt.open), fl = bt.flash, p3 = bt.open, gk = 1 - .85*bt.recovery;
    c.save(); setM(c, P.body.m); c.translate(RIG.EYE.x, RIG.EYE.y); c.scale(ER, ER);
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, (.05 + .37*p3 + .2*fl)*gk*(1 + .3*Math.sin(t*.6))*(1 - .8*bk)); put(c, B.glow);
    if (p3 > 0){ c.globalAlpha = Math.min(1, (.5*p3 + .6*fl)*gk*(1 - .6*bk)); c.rotate(t*.04); c.scale(1 + .2*fl, 1 + .2*fl); put(c, B.rays); }   // a glory of rays, flung wide as it flares
    c.restore();
    put(c, B.hub); if (cold){ c.save(); c.globalAlpha *= cold; put(c, B.hubK); c.restore(); }
    if (bk >= 1){ put(c, B.back); c.restore(); return; }
    // the great eye: the rig's openness parts the junction; the iris rides the gaze
    if (Math.max(pe, peB) > 0){ const [gx, gy] = P.gaze, dx = gx - Ey.x, dy = gy - Ey.y, dn = Math.hypot(dx, dy) || 1; c.save(); tr(c, almond(.25, .185, 36)); c.clip(); put(c, B.bigEye);
      c.save(); c.translate(dx/dn*.08, dy/dn*.05); c.scale(1 + .03*Math.sin(t*.6), 1 + .03*Math.sin(t*.6)); put(c, B.bigIris); c.restore(); c.restore(); put(c, B.bigTop); }
    if (pe < 1) junction(c, B, pe);
    if (fl > .02 && p3 > 0){ c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, .7*fl*p3); c.scale(.6, .45); put(c, B.glow); c.restore(); }
    if (gp > 0 && pe > 0){ c.save(); tr(c, almond(.25, .185, 36)); c.clip(); c.globalAlpha = gp;       // spent: the great eye clouds over and cracks, an ember still smouldering in it
      c.fillStyle = 'rgba(14,6,3,.3)'; c.fillRect(-.3, -.2, .6, .4); c.lineJoin = 'round';
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .85*gp; c.scale(.26, .06); put(c, B.glow); c.restore();
      for (const Q of CRACK){ c.beginPath(); Q.forEach(([p, q], i) => c[i ? 'lineTo' : 'moveTo'](p, q)); c.lineWidth = .014; c.strokeStyle = 'rgba(10,3,2,.9)'; c.stroke();
        c.beginPath(); Q.forEach(([p, q], i) => c[i ? 'lineTo' : 'moveTo'](p - .004, q - .005)); c.lineWidth = .005; c.strokeStyle = 'rgba(255,230,210,.55)'; c.stroke(); }
      c.restore(); }
    if (bt.burst > .01){ const kk = cl((ph - 2.25)/.75), r = .5 + .85*kk;                         // the great eye opens: a ring of lit pollen bursts out
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, 1.8*bt.burst); c.rotate(kk*1.5); c.scale(r*1.3/ER, r*1.3/ER); put(c, B.burst); c.restore(); }
    if (bk > 0){ c.globalAlpha *= bk; put(c, B.back); }
    c.restore();
  }
  // the whole scene of one pose: soil shadow, the light's pool, the halo, the contact twin, the creature, the god-ray
  function scene(c, B, t, ph, P, cold, under = [], over = []){
    const p3 = P.beats.open, gk = 1 - .85*P.beats.recovery;
    c.save(); c.translate(-LX*.34, -LY*.34); setM(c, P.body.ground || P.body.floor); c.globalAlpha = .4; put(c, B.blot); c.restore();
    c.save(); divine(c, B, t, p3*gk, false); c.restore();
    for (const f of under) f();
    c.save(); c.globalAlpha = .6; c.translate(-LX*.07, -LY*.07); creature(c, B, t, ph, P, 'C'); c.restore();
    const H = P.halo; c.save(); c.globalAlpha = 1 - .75*P.beats.recovery; c.translate(H.x, H.y); c.scale(H.r*H.scale, H.r*H.scale); put(c, B.halo); c.restore();
    creature(c, B, t, ph, P, false, cold);
    divine(c, B, t, p3*gk, true);
    for (const f of over) f();
  }

  // ---------------- the attacks' matter, baked once per scale: soil lifted into the light ----------------
  function inflow(c){                                            // the blast's tell: grit dragged in toward the wings
    c.lineCap = 'round';
    for (let i = 0; i < 160; i++){ const a = hh(i, 81)*TAU, r = .55 + hh(i, 82)*.5, L = .05 + hh(i, 83)*.1, x = Math.cos(a)*r, y = Math.sin(a)*r, s = .006 + hh(i, 84)*.007;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a)*L, y + Math.sin(a)*L); c.lineWidth = s*1.5; c.strokeStyle = 'rgba(170,130,90,.3)'; c.stroke();
      c.beginPath(); c.arc(x, y, s, 0, TAU); c.fillStyle = 'rgba(70,48,28,.9)'; c.fill();
      c.beginPath(); c.arc(x + LX*s*.35, y + LY*s*.35, s*.5, 0, TAU); c.fillStyle = 'rgba(200,170,130,.85)'; c.fill(); }
  }
  function leaf(c){                                              // a broken scrap of leaf litter, unit across, lit top-left
    const P = [[-1, -.1], [-.6, -.5], [.1, -.62], [.7, -.35], [1, .05], [.55, .2], [.62, .48], [.1, .4], [-.3, .55], [-.55, .2]];
    vol(c, P, 0x8a5a2e, { lit: .35, ao: .5, rimBlur: .08 });
    c.beginPath(); c.moveTo(-.9, 0); c.lineTo(.9, -.02); c.lineWidth = .06; c.strokeStyle = 'rgba(230,200,150,.6)'; c.stroke();
  }
  function sunspot(c){                                           // where the lens focuses: white-hot point, a yellow halo, an orange scorch ring
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, 'rgba(255,255,250,1)'); g.addColorStop(.12, 'rgba(255,250,210,1)'); g.addColorStop(.3, 'rgba(255,200,90,.65)');
    g.addColorStop(.6, 'rgba(255,110,30,.25)'); g.addColorStop(1, 'rgba(200,60,10,0)'); c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fillStyle = g; c.fill();
  }
  function puff(c){                                              // a curl of smoke from burnt soil
    for (let i = 0; i < 6; i++){ const a = i/6*TAU, r = .35, v = 170 + i*6; dot(c, Math.cos(a)*r*.8, Math.sin(a)*r*.6, .45, .35, 'rgba(' + v + ',' + (v - 10) + ',' + (v - 20) + ',.22)'); }
  }
  const FX = {};
  const fx = (S) => FX[S] || (FX[S] = (() => {
    const o = { inflow: bake(Math.round(S*1.4), 1.1, inflow), leaf: bake(Math.max(4, Math.round(S*.14)), 1.1, leaf),
      spot: bake(Math.max(4, Math.round(S*.4)), 1, sunspot), puff: bake(Math.max(4, Math.round(S*.4)), 1, puff),
      eglow: bake(Math.max(4, Math.round(S*.3)), 1, (c) => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, 'rgba(255,190,110,.9)'); g.addColorStop(.35, 'rgba(255,90,30,.4)'); g.addColorStop(1, 'rgba(160,30,0,0)'); c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fillStyle = g; c.fill(); }) };
    o.dust = bake(Math.max(4, Math.round(S*.5)), 1.1, (c) => {
      for (let i = 0; i < 8; i++){ const a = i/8*TAU + hh(i, 111), r = .4 + hh(i, 112)*.2; dot(c, Math.cos(a)*r, Math.sin(a)*r*.8, .4, .3, 'rgba(150,112,74,.32)'); }
      for (let i = 0; i < 50; i++){ const a = hh(i, 113)*TAU, r = .2 + hh(i, 114)*.75, s2 = .02 + hh(i, 115)*.03, x = Math.cos(a)*r, y = Math.sin(a)*r*.8;
        c.beginPath(); c.arc(x, y, s2, 0, TAU); c.fillStyle = 'rgba(64,42,24,.9)'; c.fill(); c.beginPath(); c.arc(x + LX*s2*.35, y + LY*s2*.35, s2*.5, 0, TAU); c.fillStyle = 'rgba(214,184,140,.9)'; c.fill(); } });
    o.loose = bakeR(Math.max(4, Math.round(S*.9)), -.05, -.08, .38, .08, (c) => feather(c, 0, 0, 0, .32, .045, { col: 0xc4a888, curl: .08 }));
    { const qS = Math.max(4, Math.round(S*.9)); o.quill = bakeR(qS, -.05, -.12, 1.05, .12, (c) => feather(c, 0, 0, 0, 1, .1, { col: 0xc9a274, root: 0x4a2414, tip: 0x2a1408, lead: .75, curl: .05, quill: 0xdcc4a0, bars: [.35, .55, .75] }));
      o.quillC = twin(o.quill, qS, .02); }                                            // a hawk's blade feather, and its soft shadow
    return o; })());

  // the sword's fused sheen: packed barbs, a quill for a spine, laid over the wings that make it
  const sword = (c, F, Bl, t) => {
    const bx = Bl.base.x, by = Bl.base.y, L = Math.hypot(Bl.tip.x - bx, Bl.tip.y - by); if (L < .03) return;
    const a = Math.atan2(Bl.tip.y - by, Bl.tip.x - bx), fm = Bl.form*(1 - Bl.dissolve), w = Bl.w, sp = Bl.dissolve, fade = 1 - sp*sp;
    c.save(); c.translate(bx, by); c.rotate(a);
    if (fm > .05){ const P = [[0, -w], [L*.78, -w*.8], [L, 0], [L*.78, w*.8], [0, w]], lit = Math.sin(a)*LX - Math.cos(a)*LY > 0 ? -1 : 1;
      c.globalAlpha = Math.min(1, fm*1.6);
      const g = c.createLinearGradient(0, -w*lit, 0, w*lit); g.addColorStop(0, '#f0d2a0'); g.addColorStop(.35, '#c9a274'); g.addColorStop(.75, '#7a4a2c'); g.addColorStop(1, '#2a1408');
      tr(c, P); c.fillStyle = g; c.fill();
      c.save(); tr(c, P); c.clip(); c.lineCap = 'round';
      for (let k = 0; k < 34; k++){ const x = (k + .5)/34*L; for (const sd of [-1, 1]){ c.beginPath(); c.moveTo(x, 0); c.lineTo(x - w*.9, sd*w); c.lineWidth = .008; c.strokeStyle = 'rgba(42,20,8,.35)'; c.stroke(); } }   // its barbs, combed back to the spine
      for (let k = 0; k < 5; k++){ const x = (k + 1)/6*L; c.beginPath(); c.moveTo(x, -w); c.quadraticCurveTo(x + w*.6, 0, x, w); c.lineWidth = w*.25; c.strokeStyle = 'rgba(58,34,22,.4)'; c.stroke(); }   // hawk barring across it
      c.restore();
      c.beginPath(); c.moveTo(0, 0); c.lineTo(L*.96, 0); c.lineWidth = w*.2; c.strokeStyle = 'rgba(40,20,8,.8)'; c.stroke(); c.lineWidth = w*.09; c.strokeStyle = 'rgba(236,212,170,.95)'; c.stroke();   // the quill spine
      tr(c, P); c.lineWidth = .016; c.strokeStyle = 'rgba(24,10,4,.85)'; c.stroke();
      c.beginPath(); c.moveTo(0, -w*lit); c.lineTo(L*.78, -w*.8*lit); c.lineTo(L, 0); c.lineWidth = .012; c.strokeStyle = 'rgba(255,236,196,.8)'; c.stroke(); }   // the sun along one edge
    if (sp > .01) for (let k = 0; k < 9; k++){ const s2 = (k + .5)/9, sd = k % 2 ? 1 : -1, ox = s2*L*.82 + (hh(k, 602) - .5)*L*.3*sp, oy = sd*w*.35 + (hh(k, 601) - .5)*2.2*sp - sp*sp*.4*Math.sin(t*2 + k);   // the feathers that make it up
      const qa = sd*(.3 + .3*sp) + (hh(k, 603) - .5)*2.4*sp, ql = Math.max(.25, L*.32)*(1 - .3*sp);
      c.save(); c.globalAlpha = Math.min(1, sp*4)*fade; c.translate(ox, oy); c.rotate(qa); c.scale(ql, ql); put(c, F.quill); c.restore(); }
    c.restore(); };
  // the blast's wave: a bank of soil shoved outward, its crest sunlit, pebbles flung off it, dust thrown up behind
  // the strike itself: the soil the sheet tears up, a dark crumb-filled fan from under the body out to the front, rimmed in sunlit dust
  const soilBurst = (c, W, k) => { const a0 = W.dir - W.half, a1 = W.dir + W.half, r0 = .5, r1 = W.front;
    c.save(); c.globalAlpha = k;
    c.beginPath(); c.arc(0, 0, r1, a0, a1); c.arc(0, 0, r0, a1, a0, true); c.closePath();
    const g = c.createRadialGradient(0, 0, r0, 0, 0, r1); g.addColorStop(0, 'rgba(10,5,2,0)'); g.addColorStop(.1, 'rgba(10,5,2,1)'); g.addColorStop(.35, 'rgba(44,24,9,1)'); g.addColorStop(.7, 'rgba(150,104,58,1)'); g.addColorStop(.92, 'rgba(214,166,104,1)'); g.addColorStop(1, 'rgba(120,80,42,1)');
    c.fillStyle = g; c.fill(); c.save(); c.clip();
    for (let j = 0; j < 60; j++){ const a = a0 + (a1 - a0)*hh(j, 211), rr = r0 + (r1 - r0)*Math.sqrt(hh(j, 212)), d = .025 + .04*hh(j, 213);   // crumbs, lit on the sun side
      c.beginPath(); c.arc(Math.cos(a)*rr, Math.sin(a)*rr, d, 0, TAU); const lr = (rr - r0)/(r1 - r0); c.fillStyle = j % 3 ? 'rgba(20,10,3,' + (.5 + .4*lr).toFixed(2) + ')' : 'rgba(232,190,128,.95)'; c.fill();
      if (j % 3 === 0){ c.beginPath(); c.arc(Math.cos(a)*rr + LX*d*.35, Math.sin(a)*rr + LY*d*.35, d*.45, 0, TAU); c.fillStyle = 'rgba(255,230,180,.8)'; c.fill(); } }
    c.restore();
    c.lineCap = 'round'; c.beginPath(); c.arc(0, 0, r1, a0, a1); c.lineWidth = .07; c.strokeStyle = 'rgba(20,10,3,.9)'; c.stroke();
    c.save(); c.globalCompositeOperation = 'lighter'; c.beginPath(); c.arc(0, 0, r1 - .04, a0 + .05, a1 - .05); c.lineWidth = .3; c.strokeStyle = 'rgba(255,170,80,.3)'; c.stroke();
    c.lineWidth = .045; c.strokeStyle = 'rgba(255,224,160,.85)'; c.stroke(); c.restore();
    c.restore(); };
  const soilWave = (c, F, dir, half, r, th, w, al, over, drops) => {
    const K = 26, O = [], I = [], x = 0, y = 0, R = 1;
    for (let k = 0; k <= K; k++){ const f = k/K, a = dir - half + 2*half*f, tp = Math.pow(Math.sin(Math.PI*f), .6), ro = r + th*tp*(.4 + .45*hh(k, 141)), ri = r - th*tp*(.4 + .15*hh(k, 142));
      O.push([x + Math.cos(a)*ro, y + Math.sin(a)*ro]); I.unshift([x + Math.cos(a)*ri, y + Math.sin(a)*ri]); }
    const P = O.concat(I);
    c.save(); c.globalAlpha = al;
    if (!over){ c.translate(-LX*th*.5, -LY*th*.5); tr(c, P); c.fillStyle = 'rgba(8,4,2,.75)'; c.fill(); c.restore(); return; }
    for (let j = 0; j < 5; j++){ const a = dir - half*.8 + 1.6*half*j/4, rr = r - th*.9;                       // the dust it kicks up, hanging behind the crest
      c.save(); c.globalAlpha = al*.8; c.translate(x + Math.cos(a)*rr, y + Math.sin(a)*rr); c.scale(th*1.5, th*1.2); put(c, F.dust); c.restore(); }
    const g = c.createRadialGradient(x, y, Math.max(.01, r - th*.6), x, y, r + th*.7);
    g.addColorStop(0, 'rgba(206,170,120,1)'); g.addColorStop(.35, 'rgba(132,94,58,1)'); g.addColorStop(.7, 'rgba(70,46,26,1)'); g.addColorStop(1, 'rgba(34,20,10,1)');
    tr(c, P); c.fillStyle = g; c.fill();
    c.save(); tr(c, P); c.clip();
    for (let j = 0; j < 70; j++){ const a = dir - half*.95 + 1.9*half*hh(j, 143), rr = r + th*(hh(j, 144) - .5)*.9, d = R*(.02 + .025*hh(j, 145));
      c.beginPath(); c.arc(x + Math.cos(a)*rr, y + Math.sin(a)*rr, d, 0, TAU); c.fillStyle = j % 3 ? 'rgba(30,18,8,.7)' : 'rgba(236,206,160,.75)'; c.fill(); }
    c.restore();
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; line(c, I, th*.9, 'rgba(255,170,80,.14)'); line(c, I, th*.35, 'rgba(255,200,120,.22)'); c.restore();   // a warm dust glow off the crest
    line(c, I, R*.05, 'rgba(255,228,170,.95)');                                                     // the crest catches the sun
    line(c, O.map(([p, q]) => [p + (p - x)/r*th*.12, q + (q - y)/r*th*.12]), R*.09, 'rgba(8,4,1,.7)');     // the hard shadowed lip it shoves ahead
    line(c, O, R*.045, 'rgba(10,5,2,.95)');
    for (let j = 0; j < 4; j++){ const a = dir - half*.7 + 1.4*half*hh(j, 165), rr = r + th*(1 + .6*hh(j, 166));                      // dust thrown out ahead of it
      c.save(); c.globalAlpha = al*.45; c.translate(x + Math.cos(a)*rr, y + Math.sin(a)*rr); c.scale(th*.7, th*.55); put(c, F.dust); c.restore(); }
    drops.forEach((d, j) => { const hgt = d.z*6, pr = d.z*.8 + .02, gx = d.x, gy = d.y;                                    // the rig's spray, thrown ahead of the crest
      c.beginPath(); c.arc(gx - LX*hgt*.5, gy - LY*hgt*.5, pr, 0, TAU); c.fillStyle = 'rgba(8,4,1,.45)'; c.fill();
      c.beginPath(); c.arc(gx, gy - hgt, pr, 0, TAU); c.fillStyle = C([0x7a6248, 0x5a4430, 0x9a8264][j % 3]); c.fill(); });
    for (let j = 0; j < 24; j++){ const a = dir - half*.9 + 1.8*half*hh(j, 146), lift = Math.sin(Math.PI*Math.min(1, w*1.6 + hh(j, 147)*.35)), hgt = th*(.8 + 1.6*hh(j, 148))*lift;   // pebbles flung off the crest
      const rr = r + th*(.2 + .5*hh(j, 149)), gx = x + Math.cos(a)*rr, gy = y + Math.sin(a)*rr, pr = R*(.06 + .07*hh(j, 150));
      c.beginPath(); c.ellipse(gx - LX*hgt*.5, gy - LY*hgt*.5, pr*1.1, pr*.85, 0, 0, TAU); c.fillStyle = 'rgba(10,5,2,.5)'; c.fill();
      c.beginPath(); c.ellipse(gx, gy - hgt, pr, pr*.8, j, 0, TAU); c.fillStyle = C([0x6a5a48, 0x8a6a4a, 0x4a3a2a, 0x9a8a72][j % 4]); c.fill();
      c.beginPath(); c.ellipse(gx + LX*pr*.3, gy - hgt + LY*pr*.3, pr*.45, pr*.34, 0, 0, TAU); c.fillStyle = 'rgba(255,236,196,.6)'; c.fill(); }
    c.restore(); };
  const funnelShadow = (c, B, Gx, Gy, H, rT, op) => { const sa = Math.atan2(-LY, -LX);
    c.save(); c.globalAlpha = .62*op; c.translate(Gx - LX*H*.5, Gy - LY*H*.5); c.rotate(sa); c.scale(H*.6, rT*.6); put(c, B.blot); c.restore(); };
  const funnel = (c, F, Gx, Gy, H, rF, rT0, op, phi) => {
    const R = 1, sz = rT0/.62, [ax, ay] = [.1*Math.sin(phi*.2), -1], Tx = Gx + ax*H, Ty = Gy + ay*H, qx = -ay, qy = ax, N = 18;
    const rad = (s) => (rF + (rT0 - rF)*Math.pow(s, 1.5))*(1 + .09*Math.sin(s*13 + phi*2.1) + .05*Math.sin(s*31 - phi*3.3));
    const ctr = (s) => [Gx + (Tx - Gx)*s + qx*Math.sin(phi*.4 + s*3.5)*sz*.08*s, Gy + (Ty - Gy)*s + qy*Math.sin(phi*.4 + s*3.5)*sz*.08*s];
    const L = [], Rr = [];
    for (let i = 0; i <= N; i++){ const s2 = i/N, [cx, cy] = ctr(s2), r = rad(s2); L.push([cx + qx*r, cy + qy*r]); Rr.unshift([cx - qx*r, cy - qy*r]); }
    const litQ = qx*LX + qy*LY > 0 ? 1 : -1, rT = rad(1), [tx, ty] = ctr(1), mouth = .22;
    const cap = []; for (let k = 1; k < 12; k++){ const a = Math.PI*k/12; cap.push([tx + qx*Math.cos(a)*rT - ax*Math.sin(a)*rT*mouth, ty + qy*Math.cos(a)*rT - ay*Math.sin(a)*rT*mouth]); }
    const P = L.concat(cap, Rr);
    // litter on its orbit: the far half is drawn before the column, the near half after it
    const orbit = (front) => { for (let j = 0; j < 16; j++){ const s2 = .08 + .86*hh(j, 161), th = phi*(1.9 - s2*.7) + hh(j, 162)*TAU, dz = Math.sin(th);
        if ((dz > 0) !== front) continue;
        const [cx, cy] = ctr(s2), r = rad(s2)*1.3, px2 = cx + qx*Math.cos(th)*r - ax*dz*r*.3, py2 = cy + qy*Math.cos(th)*r - ay*dz*r*.3;
        c.save(); c.globalAlpha = op*(front ? 1 : .7); c.translate(px2, py2);
        if (j % 3){ const d = R*(.03 + .03*hh(j, 163)); c.beginPath(); c.ellipse(0, 0, d, d*.8, th, 0, TAU); c.fillStyle = C([0x5a4632, 0x8a6a4a, 0x3a2a1a][j % 3]); c.fill();
          c.beginPath(); c.arc(LX*d*.3, LY*d*.3, d*.45, 0, TAU); c.fillStyle = 'rgba(255,232,190,.7)'; c.fill(); }
        else { c.rotate(th*1.4 + j); const ls = R*(.08 + .04*hh(j, 164)); c.scale(ls, ls); put(c, F.leaf); }
        c.restore(); } };
    c.save(); c.globalAlpha = op;
    c.save(); c.globalAlpha = op*.9; c.translate(Gx, Gy); c.rotate(phi*.2); c.scale(sz*.75, sz*.45); put(c, F.dust); c.restore();                 // the skirt of soil it tears up round its foot
    orbit(false);
    const [mx, my] = ctr(.6), gw = rad(.6), g = c.createLinearGradient(mx + qx*gw*litQ, my + qy*gw*litQ, mx - qx*gw*litQ, my - qy*gw*litQ);
    g.addColorStop(0, 'rgba(252,228,182,1)'); g.addColorStop(.45, 'rgba(208,166,112,1)'); g.addColorStop(.8, 'rgba(142,100,58,1)'); g.addColorStop(1, 'rgba(70,46,22,1)');
    { const [hx, hy] = ctr(.55); c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = op*.4; c.translate(hx, hy); c.scale(rad(.55)*2.8, H*.85); put(c, F.dust); c.restore(); }   // a warm dust halo round the column
    tr(c, P); c.fillStyle = g; c.fill();
    c.save(); tr(c, P); c.clip(); c.lineCap = 'round';
    for (let j = 0; j < 140; j++){ const h = hh(j, 181), xq = 2*hh(j, 182) - 1, [cx, cy] = ctr(h), r = rad(h), d = sz*(.008 + .02*hh(j, 183)*hh(j, 184)), sh2 = .55 + .45*xq*litQ;   // packed soil: crumbs and clods pressed into the wall, lit on the sun side
      c.beginPath(); c.ellipse(cx + qx*xq*r*.95, cy + qy*xq*r*.95, d*1.3, d, j, 0, TAU); c.fillStyle = j % 4 ? 'rgba(' + (40 + 60*sh2 | 0) + ',' + (24 + 40*sh2 | 0) + ',' + (10 + 20*sh2 | 0) + ',.75)' : 'rgba(255,232,190,' + (.25 + .5*sh2).toFixed(2) + ')'; c.fill(); }
    for (let k = 0; k < 7; k++){ const b = ((k + phi*.35)/7) % 1, fe = Math.sin(Math.PI*b);       // spiral bands: each wraps the cone on a slant and climbs as it turns
      const pts = []; for (let i = 0; i <= 10; i++){ const xq = -1 + 2*i/10, h = b - .16 + .16*Math.asin(xq)/(Math.PI/2)*.9, [cx, cy] = ctr(h), r = rad(h); pts.push([cx + qx*xq*r, cy + qy*xq*r]); }
      line(c, pts, sz*(k % 2 ? .08 : .12), 'rgba(60,34,14,' + (.75*fe).toFixed(3) + ')'); line(c, pts.map(([p, q]) => [p + ax*sz*.02, q + ay*sz*.02]), sz*.035, 'rgba(14,7,2,' + (.8*fe).toFixed(3) + ')');
      line(c, pts.map(([p, q]) => [p - ax*sz*.07, q - ay*sz*.07]), sz*.04, 'rgba(252,228,184,' + (.7*fe).toFixed(3) + ')'); }
    for (let j = 0; j < 46; j++){ const s2 = hh(j, 171), xq = 2*hh(j, 172) - 1, h = (s2 + phi*.05*(1 + hh(j, 173))) % 1, [cx, cy] = ctr(h), r = rad(h), d = sz*(.012 + .018*hh(j, 174));   // grit packed into its wall, riding up the spiral
      c.beginPath(); c.arc(cx + qx*xq*r*.92, cy + qy*xq*r*.92, d, 0, TAU); c.fillStyle = j % 3 ? 'rgba(24,12,4,.8)' : 'rgba(246,214,160,.8)'; c.fill(); }
    c.restore();
    { const ea = Math.atan2(qy, qx), mg = c.createLinearGradient(tx - qx*rT*litQ, ty - qy*rT*litQ, tx + qx*rT*litQ, ty + qy*rT*litQ);   // the mouth: a churning bowl of soil, shadowed under the far lip
      mg.addColorStop(0, 'rgba(36,20,8,1)'); mg.addColorStop(.45, 'rgba(110,74,40,1)'); mg.addColorStop(1, 'rgba(196,150,96,1)');
      c.beginPath(); c.ellipse(tx, ty, rT*.96, rT*mouth*.96, ea, 0, TAU); c.fillStyle = mg; c.fill();
      c.save(); c.clip(); for (let j = 0; j < 22; j++){ const a = hh(j, 191)*TAU + phi*1.5, rr = Math.sqrt(hh(j, 192))*rT*.9, d = sz*(.012 + .016*hh(j, 193));
        c.beginPath(); c.arc(tx + qx*Math.cos(a)*rr - ax*Math.sin(a)*rr*mouth, ty + qy*Math.cos(a)*rr - ay*Math.sin(a)*rr*mouth, d, 0, TAU); c.fillStyle = j % 3 ? 'rgba(30,16,6,.7)' : 'rgba(250,224,176,.7)'; c.fill(); } c.restore(); }
    c.beginPath(); c.ellipse(tx, ty, rT, rT*mouth, Math.atan2(qy, qx), 0, TAU); c.lineWidth = R*.03; c.strokeStyle = 'rgba(232,200,150,1)'; c.stroke();
    for (let k = 0; k < 3; k++){ const a = phi*.6 + k*2.1, [dx, dy] = [qx*Math.cos(a)*rT, qy*Math.cos(a)*rT];      // dust spilling off the lip
      c.save(); c.globalAlpha = op*.7; c.translate(tx + dx - ax*rT*.2, ty + dy - ay*rT*.2); c.scale(rT*.6, rT*.45); put(c, F.dust); c.restore(); }
    line(c, litQ > 0 ? Rr : L, R*.035, 'rgba(14,7,2,.9)');                                                           // a hard shaded flank
    for (let j = 0; j < 6; j++){ const s2 = .15 + j*.14, sd = j % 2 ? 1 : -1, [cx, cy] = ctr(s2), r = rad(s2), ds = r*(.45 + .15*Math.sin(phi*1.3 + j));   // dust tearing off its flanks
      c.save(); c.globalAlpha = op*.6; c.translate(cx + qx*r*sd*1.05, cy + qy*r*sd*1.05); c.rotate(phi*.5*sd + j); c.scale(ds, ds*.8); put(c, F.dust); c.restore(); }
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';                                            // a hot sunlit rim down the lit flank
    const lit = (litQ > 0 ? L : Rr.slice().reverse()).slice(1, -1);
    line(c, lit, R*.2, 'rgba(255,160,70,.2)'); line(c, lit, R*.06, 'rgba(255,214,150,.7)'); line(c, lit, R*.016, 'rgba(255,248,226,.95)'); c.restore();
    orbit(true);
    for (let j = 0; j < 18; j++){ const q = (hh(j, 201) + phi*.09*(1 + hh(j, 202))) % 1, a = hh(j, 203)*TAU, rr = rF*(1.3 + 3*q), hgt = sz*(.15 + .35*hh(j, 204))*Math.sin(Math.PI*q), pr = sz*(.025 + .03*hh(j, 205));   // pebbles sprayed off its foot, arcing out and falling
      const px2 = Gx + Math.cos(a)*rr, py2 = Gy + Math.sin(a)*rr*.6, al = Math.min(1, q*6, (1 - q)*4);
      c.save(); c.globalAlpha = op*al*.5; c.beginPath(); c.ellipse(px2 - LX*hgt*.4, py2 - LY*hgt*.4, pr*1.1, pr*.8, 0, 0, TAU); c.fillStyle = 'rgba(10,5,2,1)'; c.fill();
      c.globalAlpha = op*al; c.beginPath(); c.ellipse(px2, py2 - hgt, pr, pr*.8, j, 0, TAU); c.fillStyle = C([0x6a5a48, 0x8a6a4a, 0x4a3a2a, 0x9a8a72][j % 4]); c.fill();
      c.beginPath(); c.arc(px2 + LX*pr*.3, py2 - hgt + LY*pr*.3, pr*.45, 0, TAU); c.fillStyle = 'rgba(255,236,196,.7)'; c.fill(); c.restore(); }
    c.restore(); };

  return {
    boss(c, x, y, R, t, ph = 3){
      const m = c.getTransform(), k = Math.hypot(m.a, m.b), S = Math.max(8, Math.round(R*k)), B = bakes(S), P = RIG.pose(t, ph);
      c.save(); c.translate(x, y); c.scale(R, R); scene(c, B, t, ph, P, 0); c.restore();
    },
    attack(c, x, y, R, t, ph = 3, atk, u, px, py){
      const m = c.getTransform(), k = Math.hypot(m.a, m.b), S = Math.max(8, Math.round(R*k)), B = bakes(S), F = fx(S);
      const PX = (px - x)/R, PY = (py - y)/R, P = RIG.pose(t, ph, atk, u, PX, PY), A = RIG.attackUnit(atk, u, ph, PX, PY, t, P), bt = P.beats, rec = bt.recovery;
      if (atk === 'slap') A.snap = RIG.slapSnap(A, u, x, y, R);
      const under = [], over = [];                                    // effect painters in R units round the boss, below and above the creature
      if (atk === 'blast'){
        const gi = bt.windup*(1 - bt.strike)*(A.sheet ? 0 : 1);
        if (gi > .01) under.push(() => { c.save(); c.globalAlpha = gi*.45; c.rotate(u*1.5); const s = 1.9 - .8*bt.windup; c.scale(s, s); put(c, F.inflow); c.restore(); });
        for (const b of A.suck) over.push(() => { c.save(); c.globalAlpha = b.al;                    // grains of soil dragged in to the bud
          c.beginPath(); c.arc(b.x - LX*.03, b.y - LY*.03, b.r, 0, TAU); c.fillStyle = 'rgba(8,4,2,.5)'; c.fill();
          c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fillStyle = '#6a5038'; c.fill(); c.beginPath(); c.arc(b.x + LX*b.r*.3, b.y + LY*b.r*.3, b.r*.45, 0, TAU); c.fillStyle = 'rgba(240,214,170,.85)'; c.fill(); c.restore(); });
        if (A.shock){ const s = A.shock; under.push(() => { c.save(); c.globalAlpha = s.al;            // the burst slams a ring of dust out of the soil
          c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.lineWidth = s.w*3; c.strokeStyle = 'rgba(70,46,26,.85)'; c.stroke();
          c.beginPath(); c.arc(s.x, s.y, s.r - s.w*.6, 0, TAU); c.save(); c.globalCompositeOperation = 'lighter'; c.lineWidth = s.w*2.6; c.strokeStyle = 'rgba(255,170,90,.18)'; c.stroke(); c.restore();
          for (let j = 0; j < 16; j++){ const a = j/16*TAU + .3; c.save(); c.translate(s.x + Math.cos(a)*s.r, s.y + Math.sin(a)*s.r); c.scale(s.w*3.4, s.w*2.8); put(c, F.dust); c.restore(); }
          c.restore(); }); }
        if (A.sheet){ const W = A.sheet, th = .7 - .2*W.kw;
          if (W.kw < .45) over.push(() => soilBurst(c, W, Math.min(1, 1.8*(1 - W.kw/.45))));
          under.push(() => soilWave(c, F, W.dir, W.half, W.front - th*.35, th, W.kw, W.fade, false, W.drops));
          over.push(() => { for (const q of W.crests) if (q.j > 0){ c.save(); c.globalAlpha = q.f; const P2 = []; for (let k2 = 0; k2 <= 16; k2++){ const a = q.a0 + (q.a1 - q.a0)*k2/16; P2.push([Math.cos(a)*q.r, Math.sin(a)*q.r]); }   // the lower banks it leaves behind
              line(c, P2, .1, 'rgba(60,40,22,.8)'); line(c, P2.map(([p, q2]) => [p*.985, q2*.985]), .03, 'rgba(236,206,160,.7)'); c.restore(); }
            soilWave(c, F, W.dir, W.half, W.front - th*.35, th, W.kw, W.fade*RIG.sm(1.5, 2.1, W.front), true, W.drops); }); }
      } else if (atk === 'tornado'){
        const T = A, spn = bt.spin || 0, yaw = P.body.yaw || 0, [bx0, by0] = [P.body.dx + (P.body.ox || 0), -.1 + P.body.dy];
        if (spn > .03){
          const Q0 = RIG.pose(0, ph, atk, 0, PX, PY), lv = [0, 1, 2].map((i) => Q0.wings.find((q) => q.i === i)).filter(Boolean).map((w) => [Math.abs(w.tip[0]), w.tip[1]]);   // each pair's tip height and reach at rest
          const disc = (half) => { c.save(); c.lineCap = 'round';                                  // the blur of the turning plumage: a flat ring per pair, the far half under, the near half over
            for (const [r0, y0] of lv){ const rx = r0*1.05, ry = rx*.22, cy = y0 + P.body.dy;
              c.globalAlpha = .55*spn; c.beginPath(); c.ellipse(bx0, cy, rx, ry, 0, half ? 0 : Math.PI, half ? Math.PI : TAU); c.lineWidth = .2; c.strokeStyle = half ? 'rgba(150,104,62,.6)' : 'rgba(60,34,18,.55)'; c.stroke();
              c.save(); c.globalCompositeOperation = 'lighter';
              for (let k = 0; k < 5; k++){ const a0 = ((-yaw*(1 + .1*k) + hh(k, 251)*TAU) % TAU + TAU) % TAU, sw = .5 + .6*hh(k, 252), A0 = half ? Math.PI*(.05 + .9*a0/TAU) : Math.PI*(1.05 + .9*a0/TAU);
                c.globalAlpha = (half ? 1 : .45)*spn; c.beginPath(); c.ellipse(bx0, cy, rx*(.9 + .14*hh(k, 253)), ry*(.9 + .14*hh(k, 253)), 0, A0, A0 + sw); c.lineWidth = .035; c.strokeStyle = 'rgba(255,214,150,.8)'; c.stroke(); }
              c.restore(); }
            c.restore(); };
          under.push(() => { for (let j = 0; j < 22; j++){ const a = j/22*TAU + yaw*.15 + hh(j, 221), rr = 1.05 + .3*hh(j, 222);   // the top grinds a ring of dust out of the soil round its toe
              c.save(); c.globalAlpha = .4*spn*(.5 + .5*hh(j, 223)); c.translate(bx0 + Math.cos(a)*rr, .55 + Math.sin(a)*rr*.35); c.rotate(a*.2); c.scale(.32, .16); put(c, F.dust); c.restore(); } });
          under.push(() => disc(false));
          under.push(() => { for (let g = 3; g >= 1; g--){ const du = g*.0035, Pg = RIG.pose(t - du*4.5, ph, atk, u - du, PX, PY);   // the plumage smears: ghosts of the last instants of the turn
              c.save(); c.globalAlpha = .45*spn*(1 - g/4.5); for (const w of Pg.wings) wing(c, B, w, false, 0); c.restore(); } });
          over.push(() => disc(true));
          over.push(() => { c.save();                                                              // grit flung off the rims, left and right, along the turn
            for (let j = 0; j < (lv.length ? 18 : 0); j++){ const ph2 = (t*1.9 + hh(j, 241)) % 1, sd2 = j % 2 ? 1 : -1, [r0, y0] = lv[j % lv.length], al = spn*Math.min(1, ph2*6, (1 - ph2)*3);
              const px = bx0 + sd2*(r0 + ph2*1.2), py = y0 + P.body.dy + (sd2 > 0 ? 1 : -1)*ph2*.12 + ph2*ph2*.5, pr = .03 + .03*hh(j, 244);
              c.globalAlpha = al*.35; c.beginPath(); c.moveTo(px, py); c.lineTo(px - sd2*.18*spn, py); c.lineWidth = pr*1.4; c.lineCap = 'round'; c.strokeStyle = 'rgba(200,160,110,1)'; c.stroke();
              c.globalAlpha = al*.5; c.beginPath(); c.arc(px - LX*.03, py - LY*.03, pr, 0, TAU); c.fillStyle = 'rgba(10,5,2,1)'; c.fill();
              c.globalAlpha = al; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fillStyle = C([0x6a5a48, 0x8a6a4a, 0x4a3a2a, 0x9a8a72][j % 4]); c.fill();
              c.beginPath(); c.arc(px + LX*pr*.3, py + LY*pr*.3, pr*.45, 0, TAU); c.fillStyle = 'rgba(255,236,196,.75)'; c.fill(); }
            c.restore(); });
          over.push(() => { c.save(); c.lineCap = 'round';                                          // a dust vortex wraps the body and feeds the funnel
            for (let k = 0; k < 3; k++){ const pts = []; for (let m2 = 0; m2 <= 18; m2++){ const v = m2/18, a = -yaw*.5 + k*TAU/3 + v*5, r = .75 - .35*v;
                if (Math.sin(a) < 0) { if (pts.length > 1) break; pts.length = 0; continue; } pts.push([bx0 + Math.cos(a)*r, .35 - 1.1*v + Math.sin(a)*r*.2 + P.body.dy]); }
              if (pts.length > 1){ c.globalAlpha = .5*spn; line(c, pts, .06, 'rgba(120,84,50,.7)'); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .45*spn; line(c, pts, .02, 'rgba(255,220,160,.9)'); c.globalCompositeOperation = 'source-over'; } }
            c.restore(); });
        }
        const fq = cl((u - .43)/.14); if (fq > 0 && fq < 1) over.push(() => { const f = 1 - fq, r = 1 + 1.2*Math.sqrt(fq); c.save(); c.globalCompositeOperation = 'lighter';   // the funnel flung off: one flash and a ring of lit dust thrown out
          c.globalAlpha = .9*f*f; c.translate(bx0, by0); c.save(); c.scale(1.2 + fq, 1.2 + fq); put(c, B.glow); c.restore();
          c.globalAlpha = .8*f; c.beginPath(); c.ellipse(0, .4, r, r*.45, 0, 0, TAU); c.lineWidth = .22*f; c.strokeStyle = 'rgba(255,190,110,.5)'; c.stroke(); c.lineWidth = .05; c.strokeStyle = 'rgba(255,240,210,.9)'; c.stroke(); c.restore(); });
        const dz = cl((u - .84)/.16);                                                                // the spin dies: a puff of dust slumps out round its toe, and pollen motes reel over its head
        if (dz > 0 && dz < 1){
          under.push(() => { for (let j = 0; j < 12; j++){ const a = j/12*TAU + hh(j, 261), rr = .6 + 1.1*Math.sqrt(dz)*(.7 + .3*hh(j, 262));
              c.save(); c.globalAlpha = .6*(1 - dz)*(.6 + .4*hh(j, 263)); c.translate(bx0 + Math.cos(a)*rr, .55 + Math.sin(a)*rr*.35); c.scale(.4 + .3*dz, .22 + .15*dz); put(c, F.dust); c.restore(); } });
          over.push(() => { const k = Math.min(1, dz*6, (1 - dz)*4); c.save(); c.globalCompositeOperation = 'lighter';
            for (let j = 0; j < 4; j++){ const a = t*5 + j*TAU/4, ex = bx0 + Math.cos(a)*.42, ey = -.95 + P.body.dy + Math.sin(a)*.1, near = Math.sin(a) > 0 ? 1 : .55;
              c.globalAlpha = .9*k*near; c.save(); c.translate(ex, ey); c.scale(.2, .2); put(c, B.glow); c.restore();
              c.beginPath(); for (let q = 0; q < 8; q++){ const rr = q % 2 ? .028 : .08, aa = q/8*TAU + t*3; c[q ? 'lineTo' : 'moveTo'](ex + Math.cos(aa)*rr, ey + Math.sin(aa)*rr); } c.closePath(); c.fillStyle = 'rgba(255,226,150,.95)'; c.fill(); }
            c.restore(); }); }
        if (T.alive > .01){ const G = T.pos;
          under.push(() => { T.trail.forEach((p, k2) => { c.save(); c.globalAlpha = T.alive*.45*k2/10; c.translate(p.x, p.y); c.rotate(k2 + t); c.scale(T.foot*3, T.foot*2.4); put(c, F.dust); c.restore(); }); });   // the scar of dust it leaves
          under.push(() => funnelShadow(c, B, G.x, G.y, T.height, T.radius, T.alive*(1 - T.collapse)));
          over.push(() => funnel(c, F, G.x, G.y, T.height, T.foot, T.radius, T.alive*(1 - T.collapse), T.spin*2 + t*3));
          for (let j = 0; j < 30; j++){ const q = cl((u - .43 - .06*hh(j, 131))/(.35 + .1*hh(j, 132))); if (q <= 0 || q >= 1) continue;   // the soil heaves round its foot and falls back
            const a = hh(j, 133)*TAU + q*2.4, rr = T.foot*(2 + 4*hh(j, 134))*(1 + .5*q), hgt = (.5 + 1.3*hh(j, 135))*Math.sin(Math.PI*q), pr = j < 12 ? .045 + .035*hh(j, 136) : .025;
            const gx = G.x + Math.cos(a)*rr, gy = G.y + Math.sin(a)*rr*.75, al = Math.min(1, q*8, (1 - q)*5)*T.alive;
            over.push(() => { c.save(); c.globalAlpha = al*.55; c.beginPath(); c.ellipse(gx - LX*hgt*.5, gy - LY*hgt*.5, pr*1.2, pr*.9, 0, 0, TAU); c.fillStyle = 'rgba(10,5,2,1)'; c.fill();
              c.globalAlpha = al; c.beginPath(); c.ellipse(gx, gy - hgt, pr, pr*.8, q*6 + j, 0, TAU); c.fillStyle = C([0x6a5a48, 0x8a6a4a, 0x4a3a2a, 0x9a8a72][j % 4]); c.fill();
              c.beginPath(); c.ellipse(gx + LX*pr*.3, gy - hgt + LY*pr*.3, pr*.5, pr*.38, 0, 0, TAU); c.fillStyle = 'rgba(255,236,196,.75)'; c.fill(); c.restore(); }); } }
        if (T.collapse > .01) under.push(() => { c.save(); c.globalAlpha = .8*T.collapse*(1 - T.pool*.3); c.translate(T.pos.x, T.pos.y); const s = T.foot*3.2; c.scale(s, s*.4); put(c, F.dust); c.restore(); });   // it slumps into a drift of soil
      } else if (atk === 'laser'){
        const L = A;
        if (L.pool > .01) under.push(() => { c.save(); c.globalAlpha = L.pool*.4; c.translate(L.target.x, L.target.y); c.scale(.55, .4); put(c, B.blot); c.restore();
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = L.pool*.5; c.translate(L.target.x, L.target.y); c.scale(.4, .3); put(c, B.glow); c.restore(); });
        const K = L.track, Lt = K.len || 1, run = Math.hypot(K.now.x - K.start.x, K.now.y - K.start.y);
        if (L.aim > .01) under.push(() => { c.save();                                               // the tell: grains along its road begin to glow, a pulse of heat running out from the boss through them
          for (const off of K.lanes) for (let d = 0, k = 0; d <= Lt; d += .13, k++){ const pu = .5 + .5*Math.sin(k*.9 - t*7), al = L.aim*(.25 + .55*pu)*(1 - .6*d/Lt);
            const x = K.start.x + K.nx*off + K.dx*d + (hh(k, 441 + off*10) - .5)*.04, y = K.start.y + K.ny*off + K.dy*d + (hh(k, 442 + off*10) - .5)*.04, pr = .016 + .008*hh(k, 443);
            c.globalAlpha = .5*al; c.beginPath(); c.arc(x, y, pr*1.5, 0, TAU); c.fillStyle = 'rgba(16,8,3,1)'; c.fill();
            c.globalCompositeOperation = 'lighter'; c.globalAlpha = al*pu; c.beginPath(); c.arc(x, y, pr, 0, TAU); c.fillStyle = 'rgba(255,120,40,1)'; c.fill();
            c.globalAlpha = .6*al*pu*pu; c.beginPath(); c.arc(x + LX*pr*.3, y + LY*pr*.3, pr*.45, 0, TAU); c.fillStyle = 'rgba(255,220,160,1)'; c.fill(); c.globalCompositeOperation = 'source-over'; }
          c.restore(); });
        if (run > .01 && L.scorch > .01) under.push(() => L.beams.forEach((b, i) => {               // the furrow it has burnt so far: straight, charred, its newest end still glowing
          const S0 = [b.start.x, b.start.y], E0 = [b.end.x, b.end.y], sc = L.scorch;
          c.save(); c.lineCap = 'round';
          c.globalAlpha = .45*sc; line(c, [S0, E0], .17, 'rgba(16,8,3,.7)'); c.globalAlpha = .85*sc; line(c, [S0, E0], .065, 'rgba(12,6,2,1)');
          const g = c.createLinearGradient(S0[0], S0[1], E0[0], E0[1]), hot = Math.min(1, .5/run);   // cools behind the point: only the last half R still glows
          g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(Math.max(0, 1 - hot), 'rgba(255,90,20,0)'); g.addColorStop(1, 'rgba(255,150,50,1)');
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = .35*sc*Math.max(L.fire, .25); line(c, [S0, E0], .22, g); c.globalAlpha = .9*sc*Math.max(L.fire, .25); line(c, [S0, E0], .06, g); c.restore();
          for (let k = 0; k < 9; k++){ const f = (k + .3 + .4*hh(k + i*9, 171))/9*Lt, age = (run - f)/1.6; if (age <= 0) break;   // smoke curling up from the cooled char
            const bx = S0[0] + K.dx*f, by = S0[1] + K.dy*f, a2 = Math.min(1, age), hgt = .12 + .7*a2, ps = .12 + .2*a2;
            c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .7*Math.pow(1 - a2, 2)*sc; for (let m2 = 0; m2 < 3; m2++){ const o2 = (hh(k*3 + m2 + i*30, 172) - .5)*.08;
              c.beginPath(); c.arc(bx + K.nx*o2, by + K.ny*o2, .012 + .01*m2, 0, TAU); c.fillStyle = 'rgba(255,120,40,1)'; c.fill(); } c.restore();
            c.save(); c.globalAlpha = .5*Math.sin(Math.PI*Math.min(1, a2*1.1 + .05))*Math.max(sc*.8, L.smoke); c.translate(bx + LX*hgt*.3, by - hgt); c.scale(ps, ps); put(c, F.puff); c.restore(); }
          if (L.fire > .01){ c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = L.fire*(.85 + .15*Math.sin(t*31 + i*2));   // the soil glowing round the touch point
            c.translate(E0[0], E0[1]); c.scale(.6, .4); put(c, B.glow); c.restore();
            c.save(); c.globalAlpha = .8*L.fire; c.beginPath(); c.ellipse(E0[0], E0[1], .2, .14, 0, 0, TAU); c.lineWidth = .05; c.strokeStyle = 'rgba(30,14,6,.8)'; c.stroke(); c.restore(); }
        }));
        over.push(() => L.beams.forEach((b, i) => {
          const glowK = Math.max(L.aim, L.fire)*(1 - rec);
          if (glowK > .01){ c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = glowK*(.8 + .2*Math.sin(t*9 + i)); c.translate(b.x, b.y); c.scale(.34, .34); put(c, F.eglow); c.restore(); }
          if (L.fire > .01){ const Ex = b.end.x, Ey = b.end.y;                                          // where it touches: a splash of burning soil, sparks, clods and smoke thrown off the walking point
            c.save(); c.globalCompositeOperation = 'lighter'; const fk = .85 + .15*Math.sin(t*37 + i*1.7);       // the burn: a white-hot bloom and tongues of flame licking up off the soil
            c.globalAlpha = L.fire*fk; c.save(); c.translate(Ex, Ey); c.scale(1, .7); put(c, B.glow); c.restore();
            for (let j = 0; j < 5; j++){ const q = (t*3.3 + hh(j + i*5, 185)) % 1, fx2 = Ex + (hh(j + i*5, 186) - .5)*.24, h = .2 + .5*q, w = .085*(1 - .6*q);
              const g = c.createLinearGradient(fx2, Ey, fx2, Ey - h); g.addColorStop(0, 'rgba(255,240,190,1)'); g.addColorStop(.4, 'rgba(255,150,50,.9)'); g.addColorStop(1, 'rgba(200,50,10,0)');
              c.globalAlpha = L.fire*(1 - q)*fk; c.beginPath(); c.moveTo(fx2 - w, Ey); c.quadraticCurveTo(fx2 - w*.6, Ey - h*.6, fx2 + .02*Math.sin(t*9 + j), Ey - h); c.quadraticCurveTo(fx2 + w*.6, Ey - h*.6, fx2 + w, Ey); c.closePath(); c.fillStyle = g; c.fill(); }
            c.restore();
            for (let j = 0; j < 14; j++){ const q = (t*2.6 + hh(j + i*14, 181)) % 1, a = -Math.PI/2 + (hh(j + i*14, 182) - .5)*2.6, v = .7 + 1.0*hh(j + i*14, 183);
              const sx = Ex + Math.cos(a)*v*q - K.dx*q*.15, sy = Ey + Math.sin(a)*v*q + 1.1*q*q, al = L.fire*Math.min(1, q*8)*(1 - q);
              c.save(); c.lineCap = 'round';
              if (j < 10){ c.globalCompositeOperation = 'lighter'; c.globalAlpha = al; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx - Math.cos(a)*.17, sy - Math.sin(a)*.17 - .06*q); c.lineWidth = .03; c.strokeStyle = 'rgba(255,200,110,1)'; c.stroke(); }
              else { const pr = .04 + .025*hh(j, 184); c.globalAlpha = al; c.beginPath(); c.arc(sx, sy, pr, 0, TAU); c.fillStyle = '#4a3a2a'; c.fill();
                c.globalCompositeOperation = 'lighter'; c.beginPath(); c.arc(sx + LX*pr*.3, sy + LY*pr*.3, pr*.5, 0, TAU); c.fillStyle = 'rgba(255,140,60,.8)'; c.fill(); }
              c.restore(); }
            const q2 = (t*1.3 + i*.25) % 1; c.save(); c.globalAlpha = .55*L.fire*Math.sin(Math.PI*q2); c.translate(Ex + LX*q2*.3, Ey - .25 - 1.0*q2); c.scale(.25 + .35*q2, .25 + .35*q2); put(c, F.puff); c.restore(); }
          if (b.w > .002){ const Fx = b.end.x, Fy = b.end.y, al = L.fire;                                   // a shaft of focused sun: a sunlit glow round a hard gold body and a white-hot core
            c.save(); c.lineCap = 'round'; c.globalCompositeOperation = 'lighter'; c.globalAlpha = al*.18; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(Fx, Fy); c.lineWidth = b.w*3.4; c.strokeStyle = 'rgba(255,170,80,1)'; c.stroke();
            c.globalCompositeOperation = 'source-over'; c.globalAlpha = al; c.lineWidth = b.w*1.08; c.strokeStyle = 'rgba(255,196,90,1)'; c.stroke(); c.lineWidth = b.w*.65; c.strokeStyle = 'rgba(255,255,248,1)'; c.stroke();
            c.globalCompositeOperation = 'lighter'; c.translate(Fx, Fy); const ss2 = .32*(1 + .08*Math.sin(t*23)); c.scale(ss2, ss2); put(c, F.spot); c.restore(); }
          if (rec > 0){ const h = .35*rec, ps = .14*(1 + rec); c.save(); c.globalAlpha = .55*rec; c.translate(b.x + LX*h*.3, b.y - h); c.scale(ps, ps); put(c, F.puff); c.restore(); }   // spent: the eye smokes
        }));
      } else if (atk === 'wheel'){
        const W = A, G = W.pos, rt = W.rate;
        if (W.rock > .01) under.push(() => { c.save(); c.globalAlpha = .55*W.rock; c.translate(G.x, G.y + .6); c.scale(.9, .32); put(c, F.dust); c.restore(); });   // the tell: it rocks back, shoving the soil up behind it
        if (u > .2) under.push(() => { const pts = W.legs.slice(0, W.leg + 1).map((p) => [p.x, p.y]).concat([[G.x, G.y]]), al = .55*(1 - .6*rec);   // the older furrow along every leg it has rolled
          c.save(); c.lineCap = c.lineJoin = 'round'; c.globalAlpha = al; line(c, pts, .16, 'rgba(16,8,3,.7)'); c.globalAlpha = .6*al; line(c, pts.map(([p, q]) => [p + LX*.09, q + LY*.09]), .035, 'rgba(236,206,160,.7)'); c.restore(); });
        { const al = Math.max(rt, W.roll)*(1 - .5*rec); if (al > .01) under.push(() => { const tp = W.trail.map((p) => [p.x, p.y]);   // the scour: a furrow ploughed through the topsoil, its lips heaped and sunlit
          c.save(); c.lineCap = c.lineJoin = 'round';
          c.globalAlpha = .6*al; line(c, tp, .6, 'rgba(20,10,4,.45)'); c.globalAlpha = .95*al; line(c, tp, .26, 'rgba(14,7,3,.9)');
          c.globalAlpha = .6*al; c.globalAlpha = .85*al; line(c, tp.map(([p, q]) => [p + LX*.15, q + LY*.15]), .06, 'rgba(236,206,160,.85)'); line(c, tp.map(([p, q]) => [p - LX*.13, q - LY*.13]), .05, 'rgba(50,30,16,.8)');
          W.trail.forEach((p, k) => { c.globalAlpha = al*.5*k/10; c.save(); c.translate(p.x, p.y); c.rotate(k*1.3); c.scale(.4, .3); put(c, F.dust); c.restore(); });
          c.restore(); }); }
        for (const h of W.hits) if (h.al > .01){ const q = 1 - h.al;                                   // a ricochet: the rim bites the soil and throws it
          under.push(() => { c.save(); c.globalAlpha = .7*h.al; c.beginPath(); c.ellipse(h.x, h.y, .5, .38, 0, 0, TAU); c.fillStyle = 'rgba(14,7,3,.55)'; c.fill();
            for (let j = 0; j < 12; j++){ const a = j/12*TAU + .2, r = .45 + .9*q; c.save(); c.translate(h.x + Math.cos(a)*r, h.y + Math.sin(a)*r*.8); c.scale(.35 + .3*q, .28 + .2*q); put(c, F.dust); c.restore(); }
            c.restore(); });
          over.push(() => { c.save(); for (let j = 0; j < 16; j++){ const a = hh(j, 511)*TAU, r = (.3 + 1.1*hh(j, 512))*(.35 + q), hgt = .5*Math.sin(Math.PI*Math.min(1, q*1.4))*(.5 + hh(j, 513)), pr = .03 + .03*hh(j, 514);
              const gx = h.x + Math.cos(a)*r, gy = h.y + Math.sin(a)*r*.8;
              c.globalAlpha = .5*h.al; c.beginPath(); c.arc(gx - LX*hgt*.5, gy - LY*hgt*.5, pr, 0, TAU); c.fillStyle = 'rgba(10,5,2,1)'; c.fill();
              c.globalAlpha = h.al; c.beginPath(); c.arc(gx, gy - hgt, pr, 0, TAU); c.fillStyle = C([0x6a5a48, 0x8a6a4a, 0x4a3a2a, 0x9a8a72][j % 4]); c.fill();
              c.beginPath(); c.arc(gx + LX*pr*.3, gy - hgt + LY*pr*.3, pr*.45, 0, TAU); c.fillStyle = 'rgba(255,236,196,.75)'; c.fill(); } c.restore(); }); }
        if (rt > .05){
          under.push(() => { for (let g = 3; g >= 1; g--){ c.save(); c.globalAlpha = .3*rt*(1 - g/4); c.translate(G.x, G.y); c.rotate(-g*.3*rt); c.translate(-G.x, -G.y);   // the plumage smears round the turn
              for (const w of P.wings) wing(c, B, w, false, 0); c.restore(); } });
          over.push(() => { c.save(); c.lineCap = 'round';
            for (let k = 0; k < 8; k++){ const rr = .55 + .06*k, a1 = W.spin + hh(k, 501)*TAU, sw = (.6 + .5*hh(k, 502))*rt;   // speed arcs: grit smeared round the rim
              c.globalAlpha = .4*rt; c.beginPath(); c.arc(G.x, G.y, rr, a1 - sw, a1); c.lineWidth = .05; c.strokeStyle = 'rgba(70,46,24,1)'; c.stroke();
              c.globalCompositeOperation = 'lighter'; c.globalAlpha = .5*rt; c.beginPath(); c.arc(G.x, G.y, rr - .02, a1 - sw*.7, a1); c.lineWidth = .025; c.strokeStyle = 'rgba(255,214,150,1)'; c.stroke(); c.globalCompositeOperation = 'source-over'; }
            for (let j = 0; j < 14; j++){ const ph2 = (t*1.7 + hh(j, 521)) % 1, a = hh(j, 522)*TAU + W.spin, r0 = .8, d = ph2*1.2, al = rt*Math.min(1, ph2*6, (1 - ph2)*3);   // grit thrown off the rim
              const gx = G.x + Math.cos(a)*r0 - Math.sin(a)*d, gy = G.y + Math.sin(a)*r0 + Math.cos(a)*d, pr = .025 + .025*hh(j, 523);
              c.globalAlpha = al*.5; c.beginPath(); c.arc(gx - LX*.03, gy - LY*.03, pr, 0, TAU); c.fillStyle = 'rgba(10,5,2,1)'; c.fill();
              c.globalAlpha = al; c.beginPath(); c.arc(gx, gy, pr, 0, TAU); c.fillStyle = C([0x6a5a48, 0x8a6a4a, 0x4a3a2a, 0x9a8a72][j % 4]); c.fill(); }
            c.restore(); }); }
        { const lk = cl((u - .8)/.14); if (lk > 0 && lk < 1) under.push(() => { for (let j = 0; j < 12; j++){ const a = j/12*TAU + hh(j, 531), rr = .6 + 1.1*Math.sqrt(lk)*(.7 + .3*hh(j, 532));   // it lands home in a slump of dust
            c.save(); c.globalAlpha = .65*(1 - lk); c.translate(G.x + Math.cos(a)*rr, G.y + .1 + Math.sin(a)*rr*.6); c.scale(.4 + .3*lk, .25 + .15*lk); put(c, F.dust); c.restore(); } }); }
      } else if (atk === 'recall'){
        A.feathers.forEach((f, i) => { if (!f.vis || f.state === 0 || f.state === 4) return;
          const ca = Math.cos(f.a), sa = Math.sin(f.a), staked = f.state === 2, z = f.z || 0;
          const qv = staked ? Math.sin(t*47 + i*2.1)*.09*f.quiver : 0, L0 = staked ? f.len*.78 : f.len;   // staked: its point is in the soil, so less of it shows
          const place = (dx, dy) => { c.translate(f.x + dx, f.y + dy); c.rotate(f.a + qv); c.scale(L0, f.len*1.6); c.translate(-1, 0); };   // its point at (x, y)
          under.push(() => { c.save(); c.globalAlpha = f.vis*(staked ? .7 : .45); place(-LX*(.04 + z*.8), -LY*(.04 + z*.8)); put(c, F.quillC); c.restore(); });   // its shadow, further off the higher it flies
          if (staked || f.dust > .01 || f.tear > .01) under.push(() => { c.save(); c.translate(f.plant.x, f.plant.y); c.rotate(f.a);   // the slot it cut in the soil
            c.globalAlpha = .7; c.beginPath(); c.ellipse(0, 0, .08, .028, 0, 0, TAU); c.fillStyle = 'rgba(12,6,2,.85)'; c.fill();
            c.beginPath(); c.ellipse(LX*.01, LY*.02, .08, .028, 0, Math.PI*.1, Math.PI*.9); c.lineWidth = .012; c.strokeStyle = 'rgba(236,206,160,.6)'; c.stroke(); c.restore();
            if (f.dust > .01){ c.save(); c.globalAlpha = .8*f.dust; c.translate(f.plant.x, f.plant.y); const s2 = .25 + .35*(1 - f.dust); c.scale(s2, s2*.7); put(c, F.dust); c.restore(); } });
          over.push(() => {
            if (!staked){ c.save(); c.lineCap = 'round'; c.globalAlpha = .45*f.vis; c.beginPath(); c.moveTo(f.x - ca*f.len*.9, f.y - sa*f.len*.9); c.lineTo(f.x - ca*f.len*1.7, f.y - sa*f.len*1.7);   // the air it cuts, dust in its wake
              c.lineWidth = .05; c.strokeStyle = 'rgba(190,150,105,.6)'; c.stroke(); c.lineWidth = .018; c.strokeStyle = 'rgba(255,226,180,.7)'; c.stroke(); c.restore(); }
            c.save(); c.globalAlpha = f.vis; place(0, -z); put(c, F.quill); c.restore();
            if (f.tear > .01) for (let j = 0; j < 7; j++){ const q = 1 - f.tear, a = f.a + Math.PI + (hh(i*7 + j, 541) - .5)*2.2, r = (.1 + .4*hh(i*7 + j, 542))*(.3 + q), hgt = .25*Math.sin(Math.PI*Math.min(1, q*1.3)), pr = .02 + .02*hh(i*7 + j, 543);   // it rips free: clods torn up with it
              c.save(); c.globalAlpha = f.tear; c.beginPath(); c.arc(f.plant.x + Math.cos(a)*r, f.plant.y + Math.sin(a)*r - hgt, pr, 0, TAU); c.fillStyle = C([0x6a5a48, 0x4a3a2a, 0x8a6a4a][j % 3]); c.fill(); c.restore(); } }); });
      } else if (atk === 'sword'){
        const Bl = A.blade, Fi = A.fire, fade = 1 - Bl.dissolve;
        if (Fi.scorch > .01) under.push(() => { const L0 = [Fi.start.x, Fi.start.y], L1 = [Fi.start.x + Fi.dx*Fi.front, Fi.start.y + Fi.dy*Fi.front];   // the seam the slam split open: charred, roots burning in it
          c.save(); c.lineCap = c.lineJoin = 'round'; c.globalAlpha = .5*Fi.scorch; line(c, [L0, L1], Fi.w*2.4, 'rgba(16,8,3,.55)'); c.globalAlpha = .9*Fi.scorch; line(c, [L0, L1], Fi.w*.55, 'rgba(12,6,2,1)');
          for (let k = 0; k < 14; k++){ const d = (k + .5)/14*Fi.len; if (d > Fi.front) break; const sd = k % 2 ? 1 : -1, x0 = Fi.start.x + Fi.dx*d, y0 = Fi.start.y + Fi.dy*d;   // cracks running off it, an ember in each
            const pts = [[x0, y0]]; for (let m = 1; m <= 3; m++) pts.push([x0 + Fi.nx*sd*m*.12 + Fi.dx*(hh(k*3 + m, 551) - .5)*.15, y0 + Fi.ny*sd*m*.12 + Fi.dy*(hh(k*3 + m, 551) - .5)*.15]);
            c.globalAlpha = .8*Fi.scorch; line(c, pts, .02, 'rgba(10,4,2,1)'); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .7*Fi.on; line(c, pts, .008, 'rgba(255,120,40,1)'); c.globalCompositeOperation = 'source-over'; }
          c.restore(); });
        for (const fl of Fi.flames) if (fl.al > .01) under.push(() => { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .6*fl.al; c.translate(fl.x, fl.y); c.scale(fl.sz*1.2, fl.sz*.85); put(c, B.glow); c.restore(); });   // the soil glowing round each burst
        if (A.impact){ const s2 = A.impact; under.push(() => { c.save(); c.globalAlpha = s2.al;               // the slam's shock: a ring of dust driven out of the soil
          c.beginPath(); c.arc(s2.x, s2.y, s2.r, 0, TAU); c.lineWidth = .12; c.strokeStyle = 'rgba(70,46,26,.85)'; c.stroke();
          for (let j = 0; j < 16; j++){ const a = j/16*TAU + .3; c.save(); c.translate(s2.x + Math.cos(a)*s2.r, s2.y + Math.sin(a)*s2.r); c.scale(.3, .24); put(c, F.dust); c.restore(); } c.restore(); }); }
        const ov = Bl.under <= .5, up = P.wings.filter((w) => w.i === 0), gr = [Bl.ground.x, Bl.ground.y];
        // liquid's path: from the shoulders to the rig's blade tip, reared up behind the head, then straight over the top and down onto the line
        const bm = P.body.m, SB = [bm[2]*-.2 + bm[4], bm[3]*-.2 + bm[5]], ax = Math.atan2(Bl.tip.y - SB[1], Bl.tip.x - SB[0]), L = Math.max(.3, .9*Bl.form, Math.hypot(Bl.tip.x - SB[0], Bl.tip.y - SB[1]));
        const dX = Math.cos(ax), dY = Math.sin(ax), tip = [SB[0] + dX*L, SB[1] + dY*L], G0 = Math.min(.5, L*.35), GD = [SB[0] + dX*G0, SB[1] + dY*G0], Lb = L - G0, BW = .075;
        const BLADE = [[GD[0] - dY*BW, GD[1] + dX*BW], [GD[0] + dX*(Lb - .24) - dY*BW, GD[1] + dY*(Lb - .24) + dX*BW], tip, [GD[0] + dX*(Lb - .24) + dY*BW, GD[1] + dY*(Lb - .24) - dX*BW], [GD[0] + dY*BW, GD[1] - dX*BW]];   // straight, double-edged, a sharp point
        let sh = Bl.form;
        if (up.length === 2){
          // C: feathers peel off all six wings, fly the short way in and lie flat, edge to edge, into one straight blade, the last two across it as the guard; they fly home as it breaks
          { const P0 = RIG.pose(t, ph), b = P0.body.m, dt = b[0]*b[3] - b[1]*b[2], D = RIG.mul(P.body.m, [b[3]/dt, -b[1]/dt, -b[2]/dt, b[0]/dt, (b[2]*b[5] - b[3]*b[4])/dt, (b[1]*b[4] - b[0]*b[5])/dt]), k = Bl.form;   // the wings held open as at rest (following the body), so the gaps show
            const lp = (p, q) => p.map((v, i) => v + (q[i] - v)*k), ap2 = (p) => RIG.apply(D, p[0], p[1]);
            P.wings = P.wings.map((w) => { const o = P0.wings.find((v) => v.i === w.i && v.side === w.side); return o ? { ...w, m: lp(w.m, RIG.mul(D, o.m)), root: lp(w.root, ap2(o.root)), tip: lp(w.tip, ap2(o.tip)) } : w; });
            for (const e of P.eyes){ const o = P0.eyes.find((v) => v.i === e.i && v.side === e.side && v.lx === e.lx && v.ly === e.ly); if (o){ const q = lp([e.x, e.y], ap2([o.x, o.y])); e.x = q[0]; e.y = q[1]; } } }
          const N = PEEL.length;
          let home = 0; sh = 0;
          for (const w of P.wings) w.merge = 0;
          PEEL.forEach((e, j) => { const w = P.wings.find((v) => v.i === e.i && v.side === e.side); if (!w) return;
            const t0 = .03 + .14*j/N, t2 = .83 + .09*j/N, out = RIG.sm(t0, t0 + .09, u)*(1 - RIG.sm(t2, t2 + .07, u)), q = e.q, M = w.m;
            if (out <= 0){ home++; (w.homes = w.homes || []).push(q); return; }
            const sd = j % 2 ? 1 : -1, gd = j >= N - 2, ql = gd ? .26 : Math.min(.55, Lb*.4), s2 = Math.max(0, 1 - .12/Math.max(Lb, .2) - ql/Math.max(Lb, .2))*j/(N - 3);
            const p0 = RIG.apply(M, q.base[0], q.base[1]), v0 = [M[0]*Math.cos(q.a) + M[2]*Math.sin(q.a), M[1]*Math.cos(q.a) + M[3]*Math.sin(q.a)], a0 = Math.atan2(v0[1], v0[0]), l0 = q.L*Math.hypot(v0[0], v0[1]), mir = M[0]*M[3] - M[1]*M[2] < 0 ? -1 : 1;
            const p1 = gd ? GD : [GD[0] + dX*s2*Lb - dY*sd*.02, GD[1] + dY*s2*Lb + dX*sd*.02], a1 = gd ? ax + sd*Math.PI/2 : ax;
            let da = a1 - a0; da -= TAU*Math.round(da/TAU);
            const k = out*out*(3 - 2*out), arc = .18*Math.sin(Math.PI*k), x = p0[0] + (p1[0] - p0[0])*k, y = p0[1] + (p1[1] - p0[1])*k - arc, a = a0 + da*k, l = l0 + (ql - l0)*k, ys = (q.w*1.3/.1*(l/q.L)*(1 - k) + (gd ? .7 : .8)*k)*(k < .5 ? mir : sd);
            sh += out/N;
            const paint = () => { c.save(); if (out >= 1 && !gd){ tr(c, BLADE); c.clip(); } c.translate(x, y); c.rotate(a); c.scale(l, ys); put(c, F.quill); c.restore(); };
            (out >= 1 ? (ov ? over : under) : over).push(paint); });
          if (home < N) for (const w of P.wings){ w.gap = true; if (w.homes) w.after = () => { c.save(); setM(c, w.m); for (const q of w.homes){ c.save(); c.translate(q.base[0], q.base[1]); c.rotate(q.a); c.scale(q.L, q.w*1.3/.1); put(c, F.quill); c.restore(); } c.restore(); }; }
          const al = RIG.sm(.5, .95, sh), L2 = ov ? over : under;
          if (al > 0){ L2.unshift(() => { c.save(); c.globalAlpha = al; const g = c.createLinearGradient(GD[0] - dY*BW, GD[1] + dX*BW, GD[0] + dY*BW, GD[1] - dX*BW);   // the blade they close up into, lit along one edge
              g.addColorStop(0, '#f0d2a0'); g.addColorStop(.45, '#c9a274'); g.addColorStop(1, '#4a2414'); tr(c, BLADE); c.fillStyle = g; c.fill(); c.restore(); });
            L2.push(() => { c.save(); c.globalAlpha = al; c.lineJoin = 'miter'; tr(c, BLADE); c.lineWidth = .014; c.strokeStyle = 'rgba(24,10,4,.85)'; c.stroke();
              c.beginPath(); c.moveTo(GD[0], GD[1]); c.lineTo(tip[0] - dX*.05, tip[1] - dY*.05); c.lineCap = 'round'; c.lineWidth = .012; c.strokeStyle = 'rgba(236,212,170,.8)'; c.stroke(); c.restore(); }); }   // its edge, and the quill down the middle
        }
        if (sh > .01){
          under.push(() => { const h = Bl.lift*Bl.reach*.55; c.save(); c.lineCap = 'round'; c.globalAlpha = .45*sh*fade;   // its shadow: long while it is held up, along the soil when it lies in it
            c.beginPath(); c.moveTo(SB[0] - LX*.05, SB[1] - LY*.05); c.lineTo(gr[0] - LX*(.08 + h), gr[1] - LY*(.08 + h)); c.lineWidth = Bl.w*2; c.strokeStyle = 'rgba(8,3,1,.7)'; c.stroke(); c.restore(); });
          if (Bl.buried > .01) under.push(() => { c.save(); c.globalAlpha = .8*Bl.buried*fade; c.translate(tip[0], tip[1]); c.scale(.45, .3); put(c, F.dust); c.restore(); }); }   // the soil heaped where its point went in
        over.push(() => { for (const [i, fl] of Fi.flames.entries()){ if (fl.al <= .01) continue;              // the eruption: flames and burning root-ends bursting out of the split soil, one after another
          const H = fl.h*fl.sz*2.4, fk = .8 + .2*Math.sin(t*19 + i*1.7);
          c.save(); c.globalCompositeOperation = 'lighter';
          for (let j = 0; j < 3; j++){ const x = fl.x + (j - 1)*fl.sz*.28, hj = H*(.6 + .4*hh(i*3 + j, 561))*(.8 + .2*Math.sin(t*13 + i + j*2)), w2 = fl.sz*.22;
            const g = c.createLinearGradient(x, fl.y, x, fl.y - hj); g.addColorStop(0, 'rgba(255,236,180,1)'); g.addColorStop(.35, 'rgba(255,140,40,.9)'); g.addColorStop(1, 'rgba(180,40,10,0)');
            c.globalAlpha = fl.al*fk; c.beginPath(); c.moveTo(x - w2, fl.y); c.quadraticCurveTo(x - w2*.6, fl.y - hj*.6, x + w2*.4*Math.sin(t*8 + j), fl.y - hj); c.quadraticCurveTo(x + w2*.6, fl.y - hj*.6, x + w2, fl.y); c.closePath(); c.fillStyle = g; c.fill(); }
          for (let j = 0; j < 4; j++){ const q = (t*1.8 + hh(i*4 + j, 562)) % 1; c.globalAlpha = fl.al*(1 - q); c.beginPath(); c.arc(fl.x + (hh(i*4 + j, 563) - .5)*fl.sz + Math.sin(t*5 + j)*.03, fl.y - H*(.3 + 1.1*q), .014, 0, TAU); c.fillStyle = 'rgba(255,200,110,1)'; c.fill(); }
          c.restore();
          c.save(); c.lineCap = 'round'; c.globalAlpha = fl.al;                                             // a root-end torn up, burning
          const rx = fl.x + (hh(i, 564) - .5)*fl.sz*.6, ry = fl.y, rh = H*.5; c.beginPath(); c.moveTo(rx, ry); c.quadraticCurveTo(rx + .08, ry - rh*.6, rx - .04, ry - rh);
          c.lineWidth = .03; c.strokeStyle = 'rgba(30,14,6,1)'; c.stroke(); c.globalCompositeOperation = 'lighter'; c.lineWidth = .01; c.strokeStyle = 'rgba(255,150,50,1)'; c.stroke(); c.restore();
          c.save(); c.globalAlpha = .4*fl.al; c.translate(fl.x + LX*.2, fl.y - H*1.3); c.scale(fl.sz*.8, fl.sz*.8); put(c, F.puff); c.restore(); } });
      } else if (atk === 'slap'){
        // THE WHIP: the striking wing smeared along its arc (the shutter open on it: thin copies at the u's just past), the
        // soil its tip skims kicked up in dust, and a puff of grit and a shaken feather where it lands on the player
        const sw = (v) => RIG.slapWing(RIG.pose(t, ph, atk, v, PX, PY), A.side);
        if (A.trail.length){ const N = 7, gs = [];
          for (let n = 1; n <= N; n++){ const w = sw(Math.max(0, u - .07*n/N)); if (w) gs.push([w, A.speed*(1 - n/(N + 1))]); }
          under.push(() => { for (const [w, al] of gs){ c.save(); c.globalAlpha = .3*al; wing(c, B, w, false, 0); c.restore(); } });
          under.push(() => { for (const [w, al] of gs){ const [tx, ty] = w.tip, q = w.len*.55, dx = Math.cos(w.angle)*q, dy = Math.sin(w.angle)*q;   // the soil under the swept tips
            c.save(); c.globalAlpha = .55*al*al; c.translate(tx + dx, ty + dy + .1); c.rotate(w.angle); c.scale(.28, .16); put(c, F.dust); c.restore(); } }); }
        const S2 = A.snap;
        if (S2 && S2.al > .02){ const hx = Math.cos(S2.a), hy = Math.sin(S2.a), k = S2.k;
          over.push(() => { c.save();
            c.globalAlpha = .9*S2.al; c.translate(S2.x, S2.y); c.scale(.3 + .3*k, .22 + .2*k); put(c, F.dust); c.restore();   // the grit it slaps off the soil
            for (let j = 0; j < 7; j++){ const s = (.12 + .45*k)*(.6 + .6*hh(j, 621)), ox = (hh(j, 622) - .5)*.35, hgt = .25*Math.sin(Math.PI*Math.min(1, k*1.3 + .1*j/7)), pr = .03 + .03*hh(j, 623);
              const gx = S2.x + hx*s - hy*ox, gy = S2.y + hy*s + hx*ox;   // pebbles flicked on along the swing
              c.globalAlpha = S2.al; c.beginPath(); c.ellipse(gx - LX*hgt*.4, gy - LY*hgt*.4, pr*1.1, pr*.8, 0, 0, TAU); c.fillStyle = 'rgba(10,5,2,.5)'; c.fill();
              c.beginPath(); c.ellipse(gx, gy - hgt, pr, pr*.8, j, 0, TAU); c.fillStyle = C([0x6a5a48, 0x8a6a4a, 0x4a3a2a, 0x9a8a72][j % 4]); c.fill();
              c.beginPath(); c.arc(gx + LX*pr*.3, gy - hgt + LY*pr*.3, pr*.45, 0, TAU); c.fillStyle = 'rgba(255,236,196,.6)'; c.fill(); }
            c.save(); c.globalAlpha = S2.al; c.translate(S2.x + hx*.3*k, S2.y + hy*.3*k - .2*k); c.rotate(S2.a + 2.5*k); c.scale(.8, .8); put(c, F.loose); c.restore();   // a feather knocked loose
            c.restore(); }); }
      }
      c.save(); c.translate(x, y); c.scale(R, R); c.lineCap = 'round';
      scene(c, B, t, ph, P, .85*rec, under, over);
      if (rec > 0) for (let j = 0; j < 3; j++){ const fr = cl((u - .84 - j*.02)/(.16 - j*.02)), sx = [-.95, .9, .35][j], sy = [-.05, .1, -.75][j];   // spent: loose feathers shaken off, drifting down
        c.save(); c.globalAlpha = rec*(1 - .4*fr); c.translate(sx + .12*Math.sin(t*1.7 + j*2)*fr, sy + .55*fr); c.rotate(.6*Math.sin(t*1.3 + j) + j*1.7); put(c, F.loose); c.restore(); }
      c.restore();
    },
  };
})();
