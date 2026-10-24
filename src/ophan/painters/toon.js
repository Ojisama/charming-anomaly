import { OPHAN, OPHAN_RIG, hh, mk, shade, mix, sheen, INK, TAU, PX, STY, grain, paper } from '../page.js'
// The Ophan in the Mantle look (toon), on OPHAN_RIG: the SERAPH as a 1930s rubber-hose villain, every wing, eye, pose
// and danger shape taken from the shared rig (cru/rig.js); only the drawing is toon's. Flat cel fills with a hatched
// crescent shadow, a dark core band and a warm bounce rim; warm near-black ink heavier on the shadow side, boiling (the
// line redrawn 5x a second, the one stepped thing); bold white gloss marks; a lit warm rim inside the ink; rubber-hose arms.
// Contract: bg(c, w, t), boss(c, x, y, R, t, ph), attack(c, x, y, R, t, ph, atk, u, px, py), post(c, w, t).
OPHAN.toon = (() => {
  const P = {
    ink: '#1c120d', paper: '#f3e6c8', cream: '#f7efdc',
    body: '#3d2e30', red: '#c8322a', blood: '#a8200f',
    prim: '#9a4f22', sec: '#e0a64e', talon: '#3a2218',
    hot: '#f0521c', eye: '#e8261c', glint: '#fffbf0',
  };
  const SHADE = 'rgba(70,10,30,0.42)', SPEC = 'rgba(255,248,228,0.88)';
  const pool = {};
  let HATCH = null, WV = 0, WA = 1, UMAX = 0;
  const FRESH = [];   // bakes not yet drawn once: uploaded together on the frame they are made, not when first needed
  const smooth = (v) => v * v * (3 - 2 * v);

  // ---- the brush (unit space, y down, head up) ---------------------------------------------------
  // a cel: flat paint, the shape minus itself nudged up-left as a crescent shadow (hatched), a darker core shadow
  // inside it with a warm bounce-light rim at the edge, a spec comma, then ink
  function cel(g, p, fill, o = {}) {
    g.fillStyle = fill; g.fill(p);
    const r = o.r ?? 0.2, cx = o.c ? o.c[0] : 0, cy = o.c ? o.c[1] : 0;
    if (o.shade !== false) {
      g.save(); g.clip(p); g.translate(-r * 0.16, -r * 0.24);
      const q = new Path2D(); q.rect(-3, -3, 6, 6); q.addPath(p);
      g.fillStyle = o.shade || SHADE; g.fill(q, 'evenodd');
      if (HATCH) { g.fillStyle = HATCH; g.fill(q, 'evenodd'); }
      g.restore();
      // the core shadow: a narrower, darker crescent inside the first; then the bounce, a thin warm rim at the very edge
      const band = (dx, dy, col) => { g.save(); g.clip(p); g.translate(dx, dy); const b = new Path2D(); b.rect(-3, -3, 6, 6); b.addPath(p); g.fillStyle = col; g.fill(b, 'evenodd'); g.restore(); };
      band(-r * 0.09, -r * 0.13, o.core || 'rgba(66,22,6,0.5)');
      band(-r * 0.03, -r * 0.045, 'rgba(255,176,104,0.5)');
    }
    if (o.band) { g.save(); g.clip(p); o.band(g); g.restore(); }
    if (o.spec) {
      g.save(); g.clip(p); g.fillStyle = SPEC; g.beginPath();
      g.ellipse(cx - r * 0.42, cy - r * 0.46, r * o.spec * 1.25, r * o.spec * 0.7, -0.6, 0, TAU); g.fill(); g.restore();
    }
    ink(g, p, o.ink ?? 0.042);
  }
  // the brush pressed harder on the shadow side: a second pass nudged down-right
  function ink(g, p, w) {
    g.strokeStyle = P.ink; g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = w;
    g.save(); g.translate(w * 0.5, w * 0.72); g.stroke(p); g.restore(); g.stroke(p);
  }
  // a noodle: rubber hose, inked tube with round caps
  function hose(g, p, w, col) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = P.ink; g.lineWidth = w + 0.05; g.stroke(p);
    g.strokeStyle = col; g.lineWidth = w; g.stroke(p);
  }
  const ell = (x, y, rx, ry, a = 0) => { const p = new Path2D(); p.ellipse(x, y, Math.max(1e-3, rx), Math.max(1e-3, ry), a, 0, TAU); return p; };
  const poly = (pts) => { const p = new Path2D(); pts.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); return p; };
  const SZ = 0.74;
  function grow(dst, src, r, col, add, v = 0) {
    const d = dst.getContext('2d');
    const n = Math.max(40, Math.min(220, Math.ceil(TAU * r * 3.2)));   // dense enough that the rim's edge is a line, not a saw
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, rr = r * (1 + WA * (0.5 * Math.sin(a * 3 + v * 2.2) + 0.27 * Math.sin(a * 7 + v * 4.1))) * (1 + 0.85 * Math.max(0, Math.cos(a - 0.98))) + add; d.drawImage(src, Math.cos(a) * rr, Math.sin(a) * rr); }
    d.globalCompositeOperation = 'source-in'; d.fillStyle = col; d.fillRect(0, 0, dst.width, dst.height); d.globalCompositeOperation = 'source-over';
  }
  // a baked piece: its box in unit space, painted at U px per unit, cut out; drawn back at R per unit
  function bake(key, U, k, box, paint, v = 0, amp = 1) {
    const id = key + v + '/' + amp + '/' + U.toFixed(2);
    if (pool[id]) return pool[id];
    const [x0, y0, x1, y1] = box, pad = Math.ceil(U * 0.06 + k * 3);
    const w = Math.ceil((x1 - x0) * U) + pad * 2, h = Math.ceil((y1 - y0) * U) + pad * 2;
    const bare = mk(w, h), g = bare.getContext('2d');
    // the cross-hatch laid in every cel's shadow: a small tile, its lines a few device px apart whatever the scale
    const hs = Math.max(4, Math.round(U * 0.045)), ht = mk(hs, hs), hg = ht.getContext('2d');
    hg.strokeStyle = 'rgba(28,18,13,0.46)'; hg.lineWidth = Math.max(0.7, hs * 0.13); hg.beginPath();
    hg.moveTo(-1, hs + 1); hg.lineTo(hs + 1, -1); hg.moveTo(-1, 1); hg.lineTo(1, -1); hg.moveTo(hs - 1, hs + 1); hg.lineTo(hs + 1, hs - 1); hg.stroke();
    hg.strokeStyle = 'rgba(28,18,13,0.18)'; hg.beginPath(); hg.moveTo(-1, -1); hg.lineTo(hs + 1, hs + 1); hg.stroke();
    HATCH = g.createPattern(ht, 'repeat'); HATCH.setTransform(new DOMMatrix().scale(1 / U));
    g.setTransform(U, 0, 0, U, pad - x0 * U, pad - y0 * U); WV = v; WA = amp; paint(g); HATCH = null; WV = 0;
    const out = mk(w, h), o = out.getContext('2d'), tmp = mk(w, h);
    grow(tmp, bare, U * 0.042, P.ink, 0, v);
    { const tg = tmp.getContext('2d'), id = tg.getImageData(0, 0, w, h), d = id.data;
      for (let i = 3; i < d.length; i += 4) d[i] = Math.max(0, Math.min(255, (d[i] - 112) * 3));
      tg.putImageData(id, 0, 0); }
    o.drawImage(tmp, 0, 0); o.drawImage(bare, 0, 0);
    // the lit side: a thin warm rim just inside the ink, up-left, so the dark wings lift off a dark floor
    { const rl = mk(w, h), rg = rl.getContext('2d'), a = Math.max(1.5, U * 0.022);
      rg.drawImage(bare, 0, 0); rg.globalCompositeOperation = 'destination-out'; rg.drawImage(bare, a, a * 1.2);
      rg.globalCompositeOperation = 'source-in'; rg.fillStyle = 'rgba(255,196,118,0.9)'; rg.fillRect(0, 0, w, h); o.drawImage(rl, 0, 0); }
    WA = 1;
    // cropped to what was painted: the per-frame cost is the pixels drawn back, so no empty margin rides along
    const a = o.getImageData(0, 0, w, h).data;
    let cx0 = w, cy0 = h, cx1 = 0, cy1 = 0;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (a[(yy * w + xx) * 4 + 3] > 2) { if (xx < cx0) cx0 = xx; if (xx > cx1) cx1 = xx; if (yy < cy0) cy0 = yy; if (yy > cy1) cy1 = yy; }
    const cw = Math.max(1, cx1 - cx0 + 1), ch = Math.max(1, cy1 - cy0 + 1), cv = mk(cw, ch);
    cv.getContext('2d').drawImage(out, -cx0, -cy0);
    // game tech has no ctx.filter per frame: a wing's turned-away (dimmed, greyed) and turned-near (brighter) looks, baked
    // once, crossfaded over it by depth
    const tone = (f) => { const d = mk(cw, ch), dg = d.getContext('2d'); dg.filter = f; dg.drawImage(cv, 0, 0); return d; };
    const b = { cv, ox: x0 * U - pad + cx0, oy: y0 * U - pad + cy0 };
    if (key.startsWith('wing')) { b.dim = tone('brightness(0.58) saturate(0.45)'); b.brt = tone('brightness(1.14)'); }
    FRESH.push(b);
    return (pool[id] = b);
  }
  // drawn back in a frame scaled to device px / k (i.e. after scale(1/R))
  const put = (c, b, k) => c.drawImage(b.cv, b.ox / k, b.oy / k, b.cv.width / k, b.cv.height / k);
  function fastEye(c, x, y, rx, ry, sclera, pupil, lx, ly, lw) {
    const s = ell(x, y, rx, ry);
    c.fillStyle = sclera; c.fill(s);
    if (ry > rx * 0.12) {
      const pr = rx * 0.52, pq = Math.min(ry * 0.86, rx * 0.5), m = (v) => Math.max(-1, Math.min(1, v));
      const px = x + m(lx) * (rx - pr) * 0.75, py = y + m(ly) * (ry - pq) * 0.75;
      c.fillStyle = pupil; c.fill(ell(px, py, pr, pq));
      if (pr > 0.02) { c.fillStyle = sclera; c.fill(ell(px - pr * 0.38, py - pq * 0.32, pr * 0.34, pq * 0.26)); }
      c.fillStyle = sclera; c.beginPath(); c.moveTo(px, py);
      c.lineTo(px + pr * 0.8 * Math.cos(-1.25), py + pq * 0.8 * Math.sin(-1.25)); c.lineTo(px + pr * 0.8 * Math.cos(-0.45), py + pq * 0.8 * Math.sin(-0.45)); c.fill();
    }
    c.strokeStyle = P.ink; c.lineJoin = 'round'; c.lineWidth = lw * 1.35; c.stroke(s);
  }

  // ---- the effect brush: the level's own cartoon shorthand -------------------------------------------
  // a tapered ink stroke (a speed-line): pointed at both ends, fattest at `m`
  function streak(c, x0, y0, x1, y1, w, m = 0.55) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w, ny = dx / l * w, mx = x0 + dx * m, my = y0 + dy * m;
    c.moveTo(x0, y0); c.quadraticCurveTo(mx + nx, my + ny, x1, y1); c.quadraticCurveTo(mx - nx, my - ny, x0, y0);
  }
  // the brush's heavy side for the effects: a fat stroke nudged down-right, laid under the fill
  function under(c, p, w) { c.save(); c.strokeStyle = P.ink; c.lineJoin = 'round'; c.lineWidth = w; c.translate(w * 0.3, w * 0.4); c.stroke(p); c.restore(); }
  // a dust puff in the level's cloud idiom: three cream lobes, inked round the outside, a warm shade underneath
  function puff(c, x, y, r, dark) {
    if (r < 0.5) return;
    if (dark) return smoke(c, x, y, r);
    const L = [[0, 0, 1], [-0.75, 0.25, 0.7], [0.72, 0.22, 0.75]];
    c.fillStyle = P.ink;
    c.beginPath(); for (const [ox, oy, s] of L) { const cx = x + ox * r + r * 0.06, cy = y + oy * r + r * 0.08; c.moveTo(cx + s * r + r * 0.13, cy); c.arc(cx, cy, s * r + r * 0.13, 0, TAU); } c.fill();
    c.fillStyle = P.cream;
    c.beginPath(); for (const [ox, oy, s] of L) { c.moveTo(x + ox * r + s * r, y + oy * r); c.arc(x + ox * r, y + oy * r, s * r, 0, TAU); } c.fill();
    c.fillStyle = 'rgba(190,120,80,0.45)';
    c.beginPath(); for (const [ox, oy, s] of L) { c.moveTo(x + ox * r + s * r * 0.8, y + oy * r + s * r * 0.35); c.arc(x + ox * r + s * r * 0.1, y + oy * r + s * r * 0.35, s * r * 0.75, 0, Math.PI); } c.fill();
  }
  // a smoke puff: the puff's lobes in dark soot, lit from under by the lava, flecked with sparks
  function smoke(c, x, y, r) {
    const L = [[0, 0, 1], [-0.75, 0.25, 0.7], [0.72, 0.22, 0.75]];
    c.fillStyle = P.ink;
    c.beginPath(); for (const [ox, oy, s] of L) { const cx = x + ox * r + r * 0.06, cy = y + oy * r + r * 0.08; c.moveTo(cx + s * r + r * 0.15, cy); c.arc(cx, cy, s * r + r * 0.15, 0, TAU); } c.fill();
    c.fillStyle = '#4a3029';
    c.beginPath(); for (const [ox, oy, s] of L) { c.moveTo(x + ox * r + s * r, y + oy * r); c.arc(x + ox * r, y + oy * r, s * r, 0, TAU); } c.fill();
    c.fillStyle = 'rgba(240,82,28,0.55)';
    c.beginPath(); for (const [ox, oy, s] of L) { c.moveTo(x + ox * r + s * r * 0.8, y + oy * r + s * r * 0.35); c.arc(x + ox * r + s * r * 0.1, y + oy * r + s * r * 0.35, s * r * 0.75, 0, Math.PI); } c.fill();
    c.fillStyle = 'rgba(122,84,70,0.8)';
    c.beginPath(); for (const [ox, oy, s] of L) { c.moveTo(x + ox * r - s * r * 0.2, y + oy * r - s * r * 0.45); c.arc(x + ox * r - s * r * 0.35, y + oy * r - s * r * 0.45, s * r * 0.22, 0, TAU); } c.fill();
    c.strokeStyle = 'rgba(255,222,160,0.9)'; c.lineCap = 'round'; c.lineWidth = r * 0.13;
    c.beginPath(); for (const [ox, oy, s] of L) { const cx = x + ox * r, cy = y + oy * r, a0 = Math.PI * 1.02, a1 = Math.PI * 1.55; c.moveTo(cx + Math.cos(a0) * s * r * 0.86, cy + Math.sin(a0) * s * r * 0.86); c.arc(cx, cy, s * r * 0.86, a0, a1); } c.stroke();
    c.fillStyle = '#ffd66e';
    c.beginPath(); for (let i = 0; i < 3; i++) { const fx = x + (hh(i, 7) - 0.5) * r * 1.8, fy = y + (hh(i, 9) - 0.6) * r * 0.9, fr = r * 0.07; c.moveTo(fx + fr, fy); c.arc(fx, fy, fr, 0, TAU); } c.fill();
  }
  // a gust: a crescent band across the cone, pointed at both tips, cream with an ink keyline
  function gust(c, x, y, r, a0, a1, w, fill) {
    const N = 16, p = new Path2D();
    for (let i = 0; i <= N; i++) { const v = i / N, a = lerp(a0, a1, v), ww = w * Math.pow(Math.sin(v * Math.PI), 0.7), rr = r + ww; i ? p.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : p.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    for (let i = N; i >= 0; i--) { const v = i / N, a = lerp(a0, a1, v), ww = w * Math.pow(Math.sin(v * Math.PI), 0.7) * 0.6, rr = r - ww; p.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    p.closePath();
    c.fillStyle = fill; c.fill(p);
    c.strokeStyle = P.ink; c.lineJoin = 'round'; c.lineWidth = Math.max(1, w * 0.22); c.stroke(p);
  }
  // a wind curl: a cream spiral with an ink keyline, turning as it rolls
  function curl(c, x, y, r, a, dir, t) {
    if (r < 0.6) return;
    c.beginPath();
    for (let i = 0; i <= 20; i++) { const v = i / 20, q = a + dir * (v * 4.4 + t * 3), rr = r * (1 - v * 0.8); i ? c.lineTo(x + Math.cos(q) * rr, y + Math.sin(q) * rr) : c.moveTo(x + Math.cos(q) * rr, y + Math.sin(q) * rr); }
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = P.ink; c.lineWidth = r * 0.5; c.stroke();
    c.strokeStyle = P.cream; c.lineWidth = r * 0.3; c.stroke();
  }
  // the gale: ONE wind glyph in the frame of its heading (front at d, half-width hf, depth L): three cream ribbons
  // fanned from a common root, fattening toward the front and each rolling up into a heavy inked curl there
  function star(c, x, y, r, a) {
    const p = []; for (let i = 0; i < 10; i++) { const q = a + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p.push([x + Math.cos(q) * rr, y + Math.sin(q) * rr]); }
    const s = poly(p); under(c, s, r * 0.36); c.fillStyle = '#ffd66e'; c.fill(s); c.strokeStyle = P.ink; c.lineWidth = r * 0.14; c.lineJoin = 'round'; c.stroke(s);
  }

  // where a heat ray bites the floor: a scorched pool, a flickering orange burn, a white-hot heart, an inked rim
  function burn(c, x, y, R, w, t, i) {
    const fk = w * (0.85 + 0.15 * Math.sin(t * 37 + i * 2.3) * Math.sin(t * 23 + i));
    c.fillStyle = 'rgba(30,8,4,' + (0.55 * w).toFixed(3) + ')'; c.beginPath(); c.ellipse(x, y + R * 0.04, R * 0.5 * w, R * 0.19 * w, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,120,30,' + (0.85 * w).toFixed(3) + ')'; c.beginPath(); c.ellipse(x, y + R * 0.02, R * 0.34 * fk, R * 0.13 * fk, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,224,140,' + (0.9 * w).toFixed(3) + ')'; c.beginPath(); c.ellipse(x, y + R * 0.01, R * 0.17 * fk, R * 0.065 * fk, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(28,18,13,' + (0.8 * w).toFixed(3) + ')'; c.lineWidth = R * 0.03; c.beginPath(); c.ellipse(x, y + R * 0.02, R * 0.34 * fk, R * 0.13 * fk, 0, 0, TAU); c.stroke();
  }
  function impact(c, x, y, R, w, f, t, i) {
    // each drop is born at the bite and gone as it lands, on a loop, so none ever pops
    for (let j = 0; j < 6; j++) { const q = (f * 5 + j / 6 + i * 0.13) % 1, sd = (j % 2 ? 1 : -1) * (0.4 + 0.6 * hh(j, i + 3)), z = R * 0.09 * w * Math.sin(q * Math.PI);
      if (z < 0.4) continue;
      const dx = x + sd * R * 0.8 * q, dy = y - R * (0.9 + 0.6 * hh(i, j)) * 4 * q * (1 - q);
      c.fillStyle = P.ink; c.beginPath(); c.arc(dx + z * 0.18, dy + z * 0.24, z * 1.32, 0, TAU); c.fill();
      c.fillStyle = P.hot; c.beginPath(); c.arc(dx, dy, z, 0, TAU); c.fill();
      c.fillStyle = '#ffd66e'; c.beginPath(); c.arc(dx - z * 0.3, dy - z * 0.3, z * 0.42, 0, TAU); c.fill(); }
    smoke(c, x - R * 0.3 * w, y - R * 0.05, R * 0.11 * w); smoke(c, x + R * 0.32 * w, y - R * 0.03, R * 0.1 * w);
    star(c, x + R * 0.05, y - R * 0.42 * w, R * 0.14 * w, t * 4 + i);
  }
  // ---- the rig: every shape and every motion is OPHAN_RIG's (cru/rig.js); this file only inks them ---------------
  const RIG = OPHAN_RIG;
  const cl = (v) => Math.max(0, Math.min(1, v));
  const seg = (u, a, b) => cl((u - a) / (b - a));
  const lerp = (a, b, v) => a + (b - a) * v;
  const mix = (A, B, v) => [lerp(A[0], B[0], v), lerp(A[1], B[1], v)];
  // the hand: every outline point wanders a little, differently per inking (WV) and less in the calm set (WA)
  const wob = (pts, s) => pts.map(([x, y], n) => [x + WA * 0.009 * Math.sin(n * 2.1 + WV * 2.7 + s), y + WA * 0.009 * Math.cos(n * 1.7 + WV * 1.9 + s * 1.3)]);
  const bladeOf = (q, s) => poly(wob(q.l.concat(q.r.slice().reverse()), s));
  // one rig wing in its own frame: rust primaries (gold secondaries near the root), each crossed by the dark wing bar and a
  // tapered quill; the down pair's last primaries are talons, hot-tipped; a rubber-hose arm; cream coverts with split ticks
  // gap: the feathers left out (the sword's, peeled off the wing); paintFeather paints one alone, in the wing's frame
  function paintWing(Wg, gap) {
    return (g) => {
      const [rx, ry] = Wg.root;
      Wg.feathers.forEach((q, k) => { if (!(gap && gap.includes(k))) paintFeather(g, Wg, q, k); });
      // the arm: a rubber-hose bone along the leading edge, under the coverts
      const arm = new Path2D(); arm.moveTo(rx, ry); arm.lineTo(Wg.arm[2], Wg.arm[3]); hose(g, arm, 0.07, P.sec);
      Wg.coverts.forEach((q, k) => cel(g, bladeOf(q, k * 5.3 + Wg.i + 9), P.cream, { r: 0.14, shade: 'rgba(120,70,60,0.32)', spec: 0.2, ink: 0.014, band: (gg) => {
        gg.fillStyle = 'rgba(28,18,13,0.6)'; gg.beginPath(); streak(gg, q.sp[3][0], q.sp[3][1], q.sp[7][0] + 0.01 * Math.sin(k + WV), q.sp[7][1], 0.011, 0.25); gg.fill(); } }));
    };
  }
  function paintFeather(g, Wg, q, k) {
    const PS = 'rgba(60,16,50,0.42)', n = Wg.feathers.length;
    const p = bladeOf(q, k * 3.1 + Wg.i), S = q.sp, Lf = q.l, Rf = q.r;
    if (q.tal) {
      cel(g, p, P.talon, { r: 0.09, shade: 'rgba(60,16,50,0.5)', ink: 0.001 });
      g.strokeStyle = 'rgba(224,166,78,0.75)'; g.lineWidth = 0.013; g.lineCap = 'round';
      g.beginPath(); S.slice(1, 9).forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
      g.save(); g.clip(p); g.fillStyle = P.hot; g.beginPath(); g.arc(S[10][0], S[10][1], q.L * 0.3, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,214,140,0.9)'; g.beginPath(); g.arc(S[10][0], S[10][1], q.L * 0.12, 0, TAU); g.fill();
      // the claw's gloss: a fat white tick down the hot point
      const a = mix(S[6], Lf[6], 0.45), b = mix(S[9], Lf[9], 0.3);
      g.strokeStyle = P.glint; g.lineWidth = 0.032; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.restore();
      ink(g, p, 0.011);
      return;
    }
    const sec = k < n * 0.3;
    cel(g, p, sec ? P.sec : P.prim, { r: 0.08, shade: PS, ink: 0.01, core: sec ? 'rgba(92,40,10,0.85)' : 'rgb(62,22,8)', band: (gg) => {
      // the wing bar: a hard dark band across the feather below the coverts, its lower edge wavering and inked
      const top = [4, 5, 6].map((j) => mix(S[j], Lf[j], 1.5)), bot = [6, 5, 4].map((j) => mix(S[j], Rf[j], 1.5));
      const e0 = mix(S[4], Lf[4], 1.5), e1 = mix(S[4], Rf[4], 1.5), d0 = mix(S[6], Lf[6], 1.5), d1 = mix(S[6], Rf[6], 1.5);
      gg.fillStyle = 'rgba(84,34,14,0.7)'; gg.fill(poly([e0, d0, d1, e1]));
      gg.strokeStyle = 'rgba(28,18,13,0.55)'; gg.lineWidth = 0.008; gg.beginPath(); gg.moveTo(d0[0], d0[1]); gg.quadraticCurveTo(S[6][0] + 0.01 * Math.sin(k + WV), S[6][1], d1[0], d1[1]); gg.stroke();
      gg.fillStyle = 'rgba(28,18,13,' + (sec ? 0.4 : 0.6) + ')'; gg.beginPath(); streak(gg, S[0][0], S[0][1], S[8][0], S[8][1], 0.009, 0.3); gg.fill();
      void top; void bot;
    } });
  }
  // the core: the rig's ruff of short cream blades round a dark socket for the great eye
  function paintCore(g) {
    RIG.CORE.forEach((q, k) => cel(g, bladeOf(q, k * 2.3), P.cream, { r: 0.08, shade: 'rgba(120,70,60,0.34)', ink: 0.012 }));
  }
  // the back of the body (the top turned away): the socket sealed by a riveted cel plate, a stitched seam down it
  function back(c) {
    const E = ell(0, 0, 0.3, 0.24);
    cel(c, E, P.body, { r: 0.24, spec: 0.12, ink: 0.032 });
    c.save(); c.clip(E); c.fillStyle = 'rgba(28,18,13,0.4)'; c.fillRect(-0.045, -0.3, 0.09, 0.6); c.restore();
    c.strokeStyle = P.ink; c.lineCap = 'round'; c.lineWidth = 0.03; c.beginPath(); c.moveTo(0, -0.23); c.quadraticCurveTo(0.03, 0, 0, 0.23); c.stroke();
    c.lineWidth = 0.016; c.beginPath(); for (let i = 0; i < 5; i++) { const y = -0.16 + i * 0.08; c.moveTo(-0.055, y - 0.02); c.lineTo(0.065, y + 0.02); } c.stroke();
    for (const [rx, ry] of [[-0.19, -0.1], [0.19, -0.1], [-0.19, 0.1], [0.19, 0.1]]) {
      c.fillStyle = P.ink; c.beginPath(); c.arc(rx + 0.006, ry + 0.008, 0.044, 0, TAU); c.fill();
      c.fillStyle = '#ffd66e'; c.beginPath(); c.arc(rx, ry, 0.03, 0, TAU); c.fill();
      c.fillStyle = P.glint; c.beginPath(); c.arc(rx - 0.01, ry - 0.01, 0.011, 0, TAU); c.fill(); }
  }
  // a small covert: a teardrop blade from (r0, a) on the centre, heading a + sw, length L, half-width W
  const leaf = (r0, a, L, W, sw) => { const bx = Math.cos(a) * r0, by = Math.sin(a) * r0 * 0.85, d = a + sw, tx = bx + Math.cos(d) * L, ty = by + Math.sin(d) * L * 0.85;
    const mx = (bx + tx) / 2, my = (by + ty) / 2, nx = -Math.sin(d) * W, ny = Math.cos(d) * W, p = new Path2D();
    p.moveTo(bx, by); p.quadraticCurveTo(mx + nx * 1.6, my + ny * 1.6, tx, ty); p.quadraticCurveTo(mx - nx, my - ny, bx, by); p.closePath(); return p; };
  // where each wing root meets the centre (the rig's rest headings, both sides), round from the top
  const ROOTS = RIG.WINGS.flatMap((Wg) => [Wg.th, Math.PI - Wg.th]).map((a) => (a + TAU) % TAU).sort((p, q) => p - q);
  // the closed centre (r30 A, feather knot): the wing roots' small coverts swirled into one tight knot, like the base of a
  // bird's tail. The opening (op 0 -> 1): the knot unwinds outward and the coverts fold away, uncovering the eye
  function junction(c, op) {
    const k = Math.pow(cl(op), 2.2); if (k >= 0.999) return;
    const rows = [[11, 0.15, 0.27, 0.075, 1.05, [P.prim, P.sec]], [8, 0.075, 0.2, 0.06, 1.2, [P.sec, P.cream]], [5, 0, 0.14, 0.05, 1.4, [P.cream, P.cream]]];
    rows.forEach(([n, r0, L, W, sw, cols], j) => { for (let i = 0; i < n; i++) {
      const a = i * TAU / n + j * 0.5 + k * (1.6 - j * 0.3), s = 1 - k;
      c.globalAlpha = Math.min(1, s * 2.5);
      cel(c, leaf(r0 + k * (0.3 + 0.1 * j), a, L * (0.4 + 0.6 * s), W * s, sw), cols[i % 2], { r: 0.08, shade: 'rgba(120,70,60,0.34)', ink: 0.012 }); } });
    c.globalAlpha = 1;
  }
  const boxOf = (qs, ex) => { let x0 = 9, y0 = 9, x1 = -9, y1 = -9;
    for (const q of qs) for (const [x, y] of q.l.concat(q.r)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    for (const [x, y] of ex) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0 - 0.12, y0 - 0.12, x1 + 0.12, y1 + 0.12]; };
  const WBOX = RIG.WINGS.map((Wg) => boxOf(Wg.feathers.concat(Wg.coverts), [Wg.root, [Wg.arm[2], Wg.arm[3]]]));
  const CBOX = boxOf(RIG.CORE, [[-0.36, -0.39], [0.36, 0.19]]);
  // the pop of a feather eye opening (rig: it opens over ph from-1 -> from): it snaps open huge, then settles slowly,
  // wobbling, ink stars drifting out and fading; still ringing a whole phase-step later, done before phase 3
  const popOf = (ph, from) => { const th = from - 0.75, pv = cl((ph - th) / Math.min(1.1, 2.95 - th));
    return [smooth(cl(pv / 0.2)) * Math.pow(1 - pv, 0.6) * (pv < 1 ? 1 : 0), pv]; };

  // for the painter's hand (cru/gametech/hands/toon.js inks its wet outline from it): per wing, per feather, f = how far
  // the nib's ink has run along it and wet = how fat and glossy that fresh outline still is (dry by u .88)
  function reveal(Z, u) {
    const Hd = RIG.hand(u), P = Hd.stroke.pts || [], n = P.length, W = RIG.HAND_WIN, span = (W.paint[1] - W.paint[0]) * RIG.HAND_DUR;
    const late = cl((u - W.paint[1]) / 0.04), dry = 1 - smooth(cl((u - 0.78) / 0.1)), EX = RIG.EYE.x, EY = RIG.EYE.y, out = new Map();
    for (const w of Z.wings) {
      const A = RIG.WINGS[w.i].feathers.map((q) => { const [X, Y] = RIG.apply(w.m, q.sp[10][0], q.sp[10][1]); return Math.atan2(Y - EY, X - EX); });
      let k0 = -1, i0 = 0;   // the first painted point that sweeps across a feather tip's heading, out past the eye
      for (let k = 0; k < n && k0 < 0; k++) { const p = P[k]; if (p.down < 0.5 || Math.hypot(p.x - EX, p.y - EY) < 0.45) continue;
        const a = Math.atan2(p.y - EY, p.x - EX);
        for (let i = 0; i < A.length; i++) if (Math.abs(Math.atan2(Math.sin(a - A[i]), Math.cos(a - A[i]))) < 0.09) { k0 = k; i0 = i; break; } }
      const since = k0 < 0 ? -9 : Hd.paint * (n - 1 - k0) / Math.max(1, n - 1) * span, s = (i) => since - 0.07 * Math.abs(i - i0);
      out.set(w, { i0, f: A.map((_, i) => Math.max(late, cl(s(i) / 0.22))), wet: A.map((_, i) => k0 < 0 ? 0 : dry * (1 - smooth(cl(s(i) - 0.6)))) });
    }
    return out;
  }

  // Z = RIG.pose(...); o: { dizzy, ghosts: [{ wings, al: [per wing] }], swipes }
  function draw(c, x, y, R, t, ph, Z, o = {}) {
    // the bakes' scale only ever grows (an attack shrinking the boss reuses the big ones), so a fight bakes once, not per R
    const m0 = c.getTransform(), k = Math.hypot(m0.a, m0.b) || 1, U = UMAX = Math.max(UMAX, 24, Math.round(R * k / 4) * 4), amp = 0.3;   // the calm inking everywhere: the boil keeps its hand-drawn jump without reading as a flicker
    const wb = RIG.WINGS.map((Wg, i) => [0, 1, 2].map((v) => bake('wing' + i, U, k, WBOX[i], paintWing(Wg), v, amp)));
    const SM = o.sword, wgAll = RIG.WINGS.map((Wg, i) => [0, 1, 2].map((v) => bake('wingG' + i, U, k, WBOX[i], paintWing(Wg, PEELS[i]), v, amp))), wg = SM ? wgAll : null;
    const core = [0, 1, 2].map((v) => bake('core', U, k, CBOX, paintCore, v, amp));
    // stepped on purpose, the hand redrawing the line: the ONLY stepped thing in the look, every motion stays continuous
    const bv = Math.floor(hh(Math.floor(t * 5) + Math.round(ph * 11) * 13, 66) * 3);
    const putU = (b) => c.drawImage(b.cv, b.ox / U, b.oy / U, b.cv.width / U, b.cv.height / U);
    if (FRESH.length) { c.save(); c.globalAlpha = 0.004; for (const b of FRESH.splice(0)) for (const cv of [b.cv, b.dim, b.brt]) if (cv) c.drawImage(cv, 0, 0, 1, 1); c.restore(); }
    const B = Z.body, Q = Z.raw, open = Z.beats.open, burst = Z.beats.burst, kk = cl((ph - 2.25) / 0.75), spent = Z.eye.gape;
    const glory = open * (1 - 0.6 * spent), light = (0.4 + 0.6 * open) * (1 - 0.6 * spent);
    c.save(); c.translate(x, y); c.scale(R, R);
    const M0 = c.getTransform(), Tg = M0.transformPoint(new DOMPoint(Z.gaze[0], Z.gaze[1]));
    // an eye's look, carried back into whatever mirrored, flexing, spinning frame it sits in
    const look = (ex, ey, er) => { const M = c.getTransform(), E = M.transformPoint(new DOMPoint(ex, ey)), iv = M.inverse(), dx = Tg.x - E.x, dy = Tg.y - E.y;
      const gx = iv.a * dx + iv.c * dy, gy = iv.b * dx + iv.d * dy, cr = Math.cos(er), sr = Math.sin(er), lx = gx * cr + gy * sr, ly = -gx * sr + gy * cr, l = Math.hypot(lx, ly) || 1;
      return Number.isFinite(lx + ly) ? [lx / l, ly / l] : [0, 0]; };   // edge-on the frame is singular: look straight out
    // the shadow it throws on the lava (the rig's floor frame): flat cel, two tones, the hard inner one inked
    c.save(); c.transform(...B.ground);
    c.fillStyle = 'rgba(20,6,14,0.16)'; c.beginPath(); c.ellipse(0.04, 0.08, 1.2, 0.95, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(20,6,14,0.6)'; c.beginPath(); c.ellipse(0.02, 0.06, 0.5, 0.42, 0, 0, TAU); c.fill();
    c.restore();
    // the ring it floats in: two glow pools and two ripples running out
    c.save(); c.translate(B.ox || 0, B.oy || 0);
    { const ry = 0.6, f = 0.34;
      c.fillStyle = 'rgba(255,190,90,0.12)'; c.beginPath(); c.ellipse(0, ry, 0.72, 0.72 * f, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,224,130,0.14)'; c.beginPath(); c.ellipse(0, ry, 0.42, 0.42 * f, 0, 0, TAU); c.fill();
      for (let i = 0; i < 2; i++) {
        const v = (t * 0.3 + i / 2) % 1, rr = 0.5 + 0.28 * v, a = Math.sin(v * Math.PI);
        c.lineWidth = 0.03; c.strokeStyle = 'rgba(200,50,20,' + (0.4 * a).toFixed(3) + ')'; c.beginPath(); c.ellipse(0, ry, rr, rr * f, 0, 0, TAU); c.stroke();
        c.lineWidth = 0.014; c.strokeStyle = 'rgba(255,228,150,' + (0.4 * a).toFixed(3) + ')'; c.beginPath(); c.ellipse(0, ry - 0.012, rr, rr * f, 0, 0, TAU); c.stroke();
      } }
    c.restore();
    // the top's floor: an inked scuff ring under the spinning tip with dust thrown off it, the launch's shock ring, the
    // puffs it kicks up as it dies
    const sp = o.spin || 0, u = o.u ?? 0, [scx, scy] = RIG.apply(B.m, 0, -0.1), cloud = (X, Y, r) => { c.save(); c.scale(0.025, 0.025); puff(c, X * 40, Y * 40, r * 40); c.restore(); };
    c.save(); c.transform(...B.ground);   // marks lying on the floor: the wobble, not the yaw squash
    if (sp > 0.03) {
      c.strokeStyle = 'rgba(28,18,13,' + (0.6 * sp).toFixed(3) + ')'; c.lineWidth = 0.07 * sp; c.beginPath(); c.ellipse(0, 0.62, 0.56, 0.19, 0, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(255,214,140,' + (0.5 * sp).toFixed(3) + ')'; c.lineWidth = 0.025 * sp; c.stroke();
      for (let k = 0; k < 6; k++) { const s = k % 2 ? 1 : -1, q = (t * 1.7 + k / 6) % 1;
        c.globalAlpha = 1 - q; cloud(s * (0.5 + 0.95 * q), 0.62 - 0.12 * q, (0.07 + 0.11 * q) * sp); }
      c.globalAlpha = 1;
    }
    { const q = cl((u - 0.42) / 0.16); if (o.spin !== undefined && q > 0 && q < 1) { const rr = 0.6 + 2.2 * q;
      c.strokeStyle = 'rgba(28,18,13,' + (0.85 * (1 - q)).toFixed(3) + ')'; c.lineWidth = 0.1 * (1 - q); c.beginPath(); c.ellipse(0, 0.62, rr, rr * 0.34, 0, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(247,239,220,' + (0.9 * (1 - q)).toFixed(3) + ')'; c.lineWidth = 0.04 * (1 - q); c.stroke(); } }
    { const q = cl((u - 0.84) / 0.16); if (o.spin !== undefined && q > 0 && q < 1) {
      c.globalAlpha = 1 - q; for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + 0.3; cloud(Math.cos(a) * (0.45 + 0.75 * q), 0.6 + Math.sin(a) * (0.16 + 0.25 * q), 0.16 * (1 - 0.5 * q)); } c.globalAlpha = 1; } }
    c.restore();
    // the holy light behind it (never past the threshold of the silhouette): stepped pools, thin rays, then broad shafts
    c.save(); c.translate(B.ox || 0, (B.oy || 0) - 0.1); c.scale(SZ, SZ);
    c.fillStyle = 'rgba(255,' + Math.round(226 - 26 * glory) + ',' + Math.round(140 - 60 * glory) + ',' + ((0.07 + 0.04 * glory) * light).toFixed(3) + ')';
    for (const r of [1.3, 1.0]) { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); }
    { const rays = new Path2D(), n = 14, rt = t * 0.05;
      for (let i = 0; i < n; i++) { const a = rt + (i / n) * TAU, w = i % 2 ? 0.05 : 0.09, L = (i % 2 ? 1.7 : 2.1) * (1 + 0.3 * glory), r0 = 1.05, w0 = w * 0.55;
        rays.moveTo(Math.cos(a - w0) * r0, Math.sin(a - w0) * r0); rays.lineTo(Math.cos(a - w) * L, Math.sin(a - w) * L); rays.lineTo(Math.cos(a + w) * L, Math.sin(a + w) * L); rays.lineTo(Math.cos(a + w0) * r0, Math.sin(a + w0) * r0); rays.closePath(); }
      c.fillStyle = 'rgba(255,236,170,' + ((0.12 + 0.14 * light) * (1 - glory) * (1 - (o.roll || 0))).toFixed(3) + ')'; c.fill(rays); }
    if (glory > 0.01 && o.spin === undefined && !(o.roll > 0.01)) {   // the shafts would not turn with the top
      const inner = new Path2D(), outer = new Path2D(), q0 = -t * 0.04 + 0.22;
      const shaft = (P2, a, ra, rb, w) => { P2.moveTo(Math.cos(a - w * ra / rb * 0.8) * ra, Math.sin(a - w * ra / rb * 0.8) * ra); P2.lineTo(Math.cos(a - w) * rb, Math.sin(a - w) * rb); P2.lineTo(Math.cos(a + w) * rb, Math.sin(a + w) * rb); P2.lineTo(Math.cos(a + w * ra / rb * 0.8) * ra, Math.sin(a + w * ra / rb * 0.8) * ra); P2.closePath(); };
      for (let i = 0; i < 7; i++) { const a = q0 + (i / 7) * TAU, w = i % 2 ? 0.13 : 0.18, L = (2.3 + 0.4 * (i % 2 ? 0 : 1)) * (0.6 + 0.4 * glory);
        shaft(inner, a, 1.2, 1.75, w * 0.62); shaft(outer, a, 1.75, L, w); }
      c.fillStyle = 'rgba(255,206,110,' + (0.1 * glory).toFixed(3) + ')'; c.fill(inner);
      c.fillStyle = 'rgba(255,200,96,' + (0.2 * glory).toFixed(3) + ')'; c.fill(outer);
    }
    // the opening (ph 2 -> 3): a flash of light swelling out behind it, once
    if (burst > 0.01) { c.fillStyle = 'rgba(255,240,200,' + (0.4 * burst).toFixed(3) + ')'; c.beginPath(); c.arc(0, 0, 0.5 + 1.7 * kk, 0, TAU); c.fill(); }
    c.restore();
    // the halo (the rig's, on the floor layer): a nimbus ring behind the wings, inked, its gold core catching the light,
    // white gloss dashes up-left
    // the rings lie on the floor layer, whose frame squashes hard (the blast's tilt): their round-capped strokes are filled
    // as bands in that frame, so they thin at the top like Canvas2D's strokes do (game tech strokes one uniform width)
    const band = (r, w, a0, a1) => { const h = w / 2; c.beginPath();
      if (a1 - a0 >= TAU - 1e-6) { c.arc(0, 0, r + h, 0, TAU); c.moveTo(r - h, 0); c.arc(0, 0, r - h, 0, TAU); c.fill('evenodd'); return; }
      c.arc(0, 0, r + h, a0, a1); c.arc(Math.cos(a1) * r, Math.sin(a1) * r, h, a1, a1 + Math.PI);
      c.arc(0, 0, r - h, a1, a0, true); c.arc(Math.cos(a0) * r, Math.sin(a0) * r, h, a0 + Math.PI, a0 + TAU); c.closePath(); c.fill(); };
    c.save(); c.transform(...B.floor); c.translate(RIG.HALO.x, RIG.HALO.y); c.scale(Z.halo.scale, Z.halo.scale);
    { const hr = RIG.HALO.r;
      c.fillStyle = 'rgba(255,' + Math.round(230 - 30 * glory) + ',' + Math.round(200 - 110 * glory) + ',0.85)'; band(hr, 0.17 + 0.08 * glory, 0, TAU);
      c.fillStyle = P.ink; band(hr, 0.15, 0, TAU);
      c.fillStyle = 'rgb(255,' + Math.round(196 + 40 * light - 20 * glory) + ',' + Math.round(90 + 60 * light - 50 * glory) + ')'; band(hr, 0.065, 0, TAU);
      c.fillStyle = P.glint; band(hr, 0.055, Math.PI * 1.02, Math.PI * 1.34);
      band(hr, 0.045, Math.PI * 1.45, Math.PI * 1.53); band(hr, 0.045, Math.PI * 0.08, Math.PI * 0.2); }
    c.restore();
    // phase 3's empyrean: a great inked ring round the whole rosette, a slow wheel of gold lamps on it (Dore's rose)
    if (open > 0.01) {
      const er = 1.62 * SZ, lw = open * SZ * 0.75;
      c.save(); c.transform(...B.floor); c.translate(RIG.HALO.x, RIG.HALO.y); c.scale(Z.halo.scale, Z.halo.scale * 0.92);
      c.fillStyle = 'rgba(243,230,200,0.92)'; band(er, 0.28 * lw, 0, TAU);
      c.fillStyle = P.ink; band(er, 0.2 * lw, 0, TAU);
      c.fillStyle = '#ffd66e'; band(er, 0.08 * lw, 0, TAU);
      c.fillStyle = P.glint; band(er, 0.035 * lw, Math.PI * 1.05, Math.PI * 1.3);
      const lamps = (pad, big) => { c.beginPath(); for (let i = 0; i < 12; i++) { if (big !== null && (i % 3 === 0) !== big) continue;
        const q = -t * 0.08 + i * TAU / 12, lx = Math.cos(q) * er, ly = Math.sin(q) * er, lr = (i % 3 ? 0.045 : 0.075) * lw + pad * SZ; c.moveTo(lx + lr, ly); c.arc(lx, ly, lr, 0, TAU); } c.fill(); };
      c.fillStyle = P.ink; lamps(0.045, null); c.fillStyle = '#ffe7a0'; lamps(0, false); c.fillStyle = P.glint; lamps(0, true);
      c.restore();
    }
    // the top's rim: a wide elliptical blur band at wing-tip reach, its back half behind the boss and its front half over
    // it, inked, ink speed streaks riding round on it
    const DX = 1.3, DY = 0.3;
    const disc = (front) => { if (sp < 0.03) return;
      if (!front) { c.fillStyle = 'rgba(122,70,40,' + (0.2 * sp).toFixed(3) + ')'; c.beginPath(); c.ellipse(scx, scy, DX, DY * 1.6, 0, 0, TAU); c.fill(); }
      const a0 = front ? 0 : Math.PI, rim = new Path2D(); rim.ellipse(scx, scy, DX, DY, 0, a0, a0 + Math.PI);
      c.lineCap = 'butt'; c.strokeStyle = 'rgba(28,18,13,' + (0.75 * sp).toFixed(3) + ')'; c.lineWidth = 0.2 * sp; c.stroke(rim);
      c.strokeStyle = 'rgba(247,239,220,' + (0.8 * sp).toFixed(3) + ')'; c.lineWidth = 0.12 * sp; c.stroke(rim);
      c.lineCap = 'round'; c.strokeStyle = P.ink; c.lineWidth = 0.04 * sp;
      for (let k = 0; k < 8; k++) { const q0 = B.yaw * 0.5 + k * TAU / 8; let on = false; c.beginPath();
        for (let j = 0; j <= 8; j++) { const a = q0 + j * 0.06 * (0.4 + sp); if ((Math.sin(a) > 0) !== front) { on = false; continue; }
          const X = scx + Math.cos(a) * DX, Y = scy + Math.sin(a) * DY; on ? c.lineTo(X, Y) : c.moveTo(X, Y); on = true; }
        c.stroke(); } };
    if ((o.flash || 0) > 0.02) { c.fillStyle = 'rgba(255,236,190,' + (0.3 * o.flash).toFixed(3) + ')'; c.beginPath(); c.arc(scx, scy, 0.9 + 0.9 * (1 - o.flash), 0, TAU); c.fill(); }
    disc(false);
    if (SM && !SM.ov) stack(c, M0, SM, false);   // the blade they stack into, rising from behind: under the body
    // the smear: the wings a beat ago (the rig's own pose at earlier u) as fading ghosts, and ink swipes from those tips to these
    if (o.ghosts) for (const G of o.ghosts) G.wings.forEach((w, j) => { const al = G.al[j] * w.vis; if (al < 0.02) return;
      c.save(); c.transform(...w.m); c.globalAlpha = al; putU(wb[w.i][bv]); c.restore(); });
    if (o.swipes) { c.fillStyle = P.ink; c.beginPath(); for (const s of o.swipes) swipe(c, s); c.fill(); }
    // the wings, back to front, each placed by the rig (root, swing, scale, mirror) with its feather eyes
    // the top turning: a wing swung behind the body is drawn before it, dimmed and greyed by how far back it is; one
    // swung in front is drawn after it, a touch brighter
    const wing = (w) => {
      c.save(); c.transform(...w.m);
      const dp = w.depth || 0;
      const gp = SM && SM.gaps[w.i + ',' + w.side];   // the sword's feathers out: the wing ragged, the ones already home painted back in
      const wv = (gp && gp.out ? wg : wb)[w.i][bv];
      c.globalAlpha = w.vis; putU(wv);
      if (dp < -0.02) { c.globalAlpha = w.vis * Math.min(1, -dp); putU({ cv: wv.dim, ox: wv.ox, oy: wv.oy }); }
      else if (dp > 0.02) { c.globalAlpha = w.vis * Math.min(1, dp); putU({ cv: wv.brt, ox: wv.ox, oy: wv.oy }); }
      if (gp && gp.out) for (const n of gp.home) paintFeather(c, RIG.WINGS[w.i], RIG.WINGS[w.i].feathers[n], n);
      c.globalAlpha = 1;
      w.eyes.forEach((E, j) => {
        const op = E.open; if (op < 0.02) return;
        const from = RIG.WINGS[w.i].eyes[j].from, [pop, pv] = popOf(ph, from), ps = 1 + 0.6 * pop * (0.7 + 0.3 * Math.cos(pv * 14)) + 0.12 * pop, a = E.r * 1.1, sz = a / 0.12;
        c.save(); c.translate(E.lx, E.ly); c.rotate(E.rot);
        const [lx, ly] = look(0, 0, 0);
        if (E.las && Q.hot > 0.01) {
          // the stare winding up: a hot rim and the cartoon's alarm ring round the eye
          const gw = Q.hot;
          c.fillStyle = 'rgba(255,190,70,' + (0.8 * gw).toFixed(3) + ')'; c.beginPath(); c.ellipse(0, 0, 0.27 * sz * gw, 0.22 * sz * gw, 0, 0, TAU); c.fill();
          c.strokeStyle = P.hot; c.lineWidth = 0.05 * gw; c.beginPath(); c.ellipse(0, 0, 0.16 * sz, 0.11 * sz * Math.max(0.5, op), 0, 0, TAU); c.stroke();
        }
        fastEye(c, 0, 0, a * ps, a * 0.68 * Math.min(1.2, op) * ps, P.glint, P.red, lx, ly, 0.022);
        if (pop > 0.04) { const mm = 0.11 * sz * Math.sqrt(pop); c.strokeStyle = P.ink; c.lineCap = 'round'; c.lineWidth = 0.032 * Math.sqrt(pop); c.beginPath();
          for (let q = 0; q < 4; q++) { const qa = q * TAU / 4 + 0.4 + j, d = (0.26 + 0.24 * pv) * sz, sx = Math.cos(qa) * d, sy = Math.sin(qa) * d * 0.8;
            c.moveTo(sx - mm, sy); c.lineTo(sx + mm, sy); c.moveTo(sx, sy - mm); c.lineTo(sx, sy + mm); } c.stroke(); }
        c.restore();
      });
      c.restore();
    };
    for (const w of Z.wings) if (!(w.depth > 0)) wing(w);
    // the core and the great eye ride the body (the rig's squash, spin and lift)
    c.save(); c.transform(...B.m); putU(core[bv]);
    c.translate(RIG.EYE.x, RIG.EYE.y);
    if (B.face < 0) back(c);
    else { const rx = 0.29, ry = 0.225, ey = 0, hy = Math.min(ry * 1.2, ry * Z.eye.open), fl = Q.fl * open, dz = o.dizzy || 0, lidOpen = open;
      const [gx, gy] = look(0, 0, 0), lk = 1.2;
      const E = ell(0, ey, rx, ry);
      if (lidOpen > 0.01) { c.globalAlpha = Math.min(1, 3 * Math.pow(lidOpen, 2.2)); cel(c, ell(0, 0, 0.34, 0.27), P.body, { r: 0.24, spec: 0.14, ink: 0.03 }); c.globalAlpha = 1; }
      // the reveal (ph 2 -> 3): a cartoon starburst slams out behind the eye, gold spikes inked, a white star inside
      const sb = burst;
      if (sb > 0.01) {
        const spikes = (r0, r1, rot) => { const p = []; for (let i = 0; i < 28; i++) { const rr = i % 2 ? r0 : r1 * (i % 4 ? 0.82 : 1); p.push([Math.cos(rot + i * TAU / 28) * rr, Math.sin(rot + i * TAU / 28) * rr]); } return poly(p); };
        const so = spikes(0.36 + 0.06 * sb, 0.42 + 0.5 * sb, t * 0.6), sn = spikes(0.3, 0.36 + 0.28 * sb, -t * 0.8 + 0.11);
        under(c, so, 0.08); c.fillStyle = '#ffc23e'; c.fill(so); c.strokeStyle = P.ink; c.lineWidth = 0.035; c.lineJoin = 'round'; c.stroke(so);
        c.fillStyle = P.glint; c.fill(sn); c.lineWidth = 0.022; c.stroke(sn);
      }
      if (lidOpen > 0.01) {
        const gl = lidOpen * (1 - 0.7 * spent) + fl;
        c.fillStyle = 'rgba(255,170,70,' + Math.min(0.9, 0.35 * gl).toFixed(3) + ')'; c.beginPath(); c.arc(0, 0, 0.36 + 0.2 * fl, 0, TAU); c.fill(); c.beginPath(); c.arc(0, 0, 0.29, 0, TAU); c.fill();
      }
      // the lids: the socket less the open eye
      if (lidOpen > 0.01) {
      const lids = new Path2D(); lids.addPath(E); if (hy > 0.002) lids.addPath(ell(0, ey, rx, hy));
      c.fillStyle = P.cream; c.fill(lids, 'evenodd');
      c.save(); c.clip(E); c.fillStyle = 'rgba(120,70,60,0.32)'; c.beginPath(); c.ellipse(0.04, ey + 0.06, rx, ry, 0, 0, TAU); c.rect(-1, -1, 2, 2); c.fill('evenodd'); c.restore();
      ink(c, E, 0.032);
      }
      if (hy > 0.004) {
        // the great eye: a round red iris pinned on the player, a cat's slit, ringed in blood
        const sc = ell(0, ey, rx, hy), ix = gx * 0.07 * lk, iy = ey + 0.04 * gy;
        c.fillStyle = P.glint; c.fill(sc);
        c.save(); c.clip(sc);
        c.fillStyle = P.blood; c.beginPath(); c.arc(ix, iy, 0.16, 0, TAU); c.fill();
        c.fillStyle = P.eye; c.beginPath(); c.arc(ix, iy, 0.13, 0, TAU); c.fill();
        c.fillStyle = P.ink; c.fill(ell(ix, iy, 0.036 * (1 - dz) * (1 - 0.4 * fl) + 0.003, 0.115));
        // flared: a white-hot ring in the iris; dizzy: a spiral turning in it; spent: the white dimmed and cracked
        if (fl > 0.01) { c.strokeStyle = 'rgba(255,240,170,' + Math.min(1, fl).toFixed(3) + ')'; c.lineWidth = 0.03; c.beginPath(); c.arc(ix, iy, 0.1, 0, TAU); c.stroke(); }
        if (dz > 0.01) { c.strokeStyle = 'rgba(28,18,13,' + dz.toFixed(3) + ')'; c.lineWidth = 0.024; c.beginPath();
          for (let q = 0; q <= 28; q++) { const v = q / 28, an = t * 9 + v * 4.5 * Math.PI, rr = 0.012 + 0.12 * v; q ? c.lineTo(ix + Math.cos(an) * rr, iy + Math.sin(an) * rr) : c.moveTo(ix + Math.cos(an) * rr, iy + Math.sin(an) * rr); } c.stroke(); }
        if (spent > 0.01) {
          c.fillStyle = 'rgba(60,20,30,' + (0.32 * spent).toFixed(3) + ')'; c.fill(sc);
          c.strokeStyle = 'rgba(28,18,13,' + spent.toFixed(3) + ')'; c.lineWidth = 0.018; c.beginPath();
          c.moveTo(-0.26, ey - 0.03); c.lineTo(-0.16, ey + 0.02); c.lineTo(-0.1, ey - 0.04); c.lineTo(-0.02, ey + 0.03); c.moveTo(-0.16, ey + 0.02); c.lineTo(-0.14, ey + 0.08); c.stroke();
        }
        c.restore();
        ink(c, sc, 0.034);
        const cut = ey - hy * 0.5, side = ey - hy * 0.98;
        const lid = new Path2D(); lid.moveTo(-0.35, ey - hy - 0.06); lid.lineTo(0.35, ey - hy - 0.06); lid.lineTo(0.35, side); lid.lineTo(0, cut); lid.lineTo(-0.35, side); lid.closePath();
        c.save(); c.clip(ell(0, ey, rx, hy + 0.004)); c.fillStyle = P.body; c.fill(lid); c.restore();
        c.fillStyle = P.glint; c.beginPath(); c.arc(0.11, ey + hy * 0.3, 0.05 * lidOpen, 0, TAU); c.moveTo(ix - 0.06 + 0.025 * lidOpen, iy - 0.07); c.arc(ix - 0.06, iy - 0.07, 0.025 * lidOpen, 0, TAU); c.fill();
        // the gloss: a fat white bean over the upper-left of the iris, inked thin, and a comma under it
        { const bx = ix - 0.072, by = iy - 0.053; c.fillStyle = P.glint; c.strokeStyle = P.ink; c.lineWidth = 0.012; c.beginPath(); c.ellipse(bx, by, 0.062 * lidOpen, 0.033 * lidOpen, -0.6, 0, TAU); c.fill(); c.stroke();
          c.beginPath(); c.ellipse(bx + 0.058, by + 0.072, 0.021 * lidOpen, 0.013 * lidOpen, -0.6, 0, TAU); c.fill(); }
      }
      // the seam (the sealed lid's, glowing red with the rig's seam), the brow over it and the lashes hanging from the lower lid
      c.strokeStyle = P.ink; c.lineCap = 'round'; c.lineJoin = 'round';
      if (hy <= 0.004 && lidOpen > 0.01) { c.lineWidth = 0.04; c.beginPath(); c.moveTo(-rx, ey); c.quadraticCurveTo(0, ey + 0.07, rx, ey); c.stroke();
        if (Z.eye.seam > 0.01) { c.strokeStyle = 'rgba(240,82,28,' + Math.min(1, Z.eye.seam).toFixed(3) + ')'; c.lineWidth = 0.014; c.stroke(); c.strokeStyle = P.ink; } }
      const side = ey - hy * 0.98 - 0.03, bm = ey - hy * 0.5 - 0.02;
      c.globalAlpha = Math.min(1, lidOpen); c.fillStyle = P.ink; c.beginPath(); streak(c, -0.39, side - 0.07, 0.02, bm, 0.044, 0.62); streak(c, -0.02, bm, 0.39, side - 0.07, 0.044, 0.38);
      for (let i = 0; i < 5; i++) { const u = -0.2 + i * 0.1, yb = ey + hy * Math.sqrt(Math.max(0, 1 - (u / rx) ** 2)) + 0.035 * (1 - (u / rx) ** 2); streak(c, u, yb - 0.01, u * 1.4, yb + 0.1, 0.021, 0.3); }
      c.fill(); c.globalAlpha = 1;
      junction(c, lidOpen);
      // the flare: ink spikes bursting off the socket
      if (fl > 0.01) { c.fillStyle = P.ink; c.beginPath();
        for (let i = 0; i < 12; i++) { const al = i / 12 * TAU + 0.13, r1 = 0.4 + 0.05 * fl, r2 = r1 + 0.27 * Math.min(1, fl) * (i % 2 ? 0.7 : 1);
          streak(c, Math.cos(al) * r1, Math.sin(al) * r1 * 0.85, Math.cos(al) * r2, Math.sin(al) * r2 * 0.85, 0.034 * Math.min(1, fl), 0.35); } c.fill(); } }
    c.restore();
    for (const w of Z.wings) if (w.depth > 0) wing(w);
    if (SM) stack(c, M0, SM, true);
    disc(true);
    if (sp > 0.05) {
      // the vortex wrap: three ember bands winding round the front of the body with the spin
      c.lineCap = 'round';
      for (let k = 0; k < 3; k++) { const yy = scy - 0.42 + k * 0.36, rx = k === 1 ? 0.74 : 0.6, q0 = B.yaw * 0.6 + k * 2.1, pts = [];
        for (let j = 0; j <= 14; j++) { const a = q0 + j * 0.13; if (Math.sin(a) > 0.05) pts.push([scx + Math.cos(a) * rx, yy + Math.sin(a) * 0.14]); else if (pts.length) break; }
        if (pts.length < 2) continue;
        for (const [col, lw] of [[P.ink, 0.085], ['#f39a3c', 0.048], ['rgba(255,244,214,0.95)', 0.016]]) { c.strokeStyle = col; c.lineWidth = lw * sp; c.beginPath(); pts.forEach(([X, Y], j) => j ? c.lineTo(X, Y) : c.moveTo(X, Y)); c.stroke(); } }
      // sparks flung off the rim left and right, ink tails back toward the top
      for (let k = 0; k < 12; k++) { const s = k % 2 ? 1 : -1, sd = hh(k, 31), q = (t * 2.4 + sd) % 1, z = 0.055 * sp * (1 - q) * (0.7 + 0.6 * hh(k, 17));
        if (z < 0.01) continue;
        const px = scx + s * (1.2 + 1.2 * q * (0.7 + 0.6 * sd)), py = scy + (hh(k, 5) - 0.5) * 0.5 + 0.55 * q * q;
        c.fillStyle = P.ink; c.beginPath(); streak(c, px, py, px - s * 0.34 * (1 - q), py - 0.05, z * 0.7, 0.2); c.fill();
        c.beginPath(); c.arc(px + z * 0.2, py + z * 0.25, z * 1.35, 0, TAU); c.fill();
        c.fillStyle = k % 3 ? '#ffc23e' : P.hot; c.beginPath(); c.arc(px, py, z, 0, TAU); c.fill(); }
    }
    // the fling at peak spin: a cream flash and ink streaks bursting off the top
    const fl = o.flash || 0;
    if (fl > 0.02) {
      c.fillStyle = P.ink; c.beginPath();
      for (let i = 0; i < 12; i++) { const al = i / 12 * TAU + 0.2, r1 = 1.25 + 0.5 * (1 - fl), l = 0.45 * fl;
        streak(c, scx + Math.cos(al) * r1, scy + Math.sin(al) * r1, scx + Math.cos(al) * (r1 + l), scy + Math.sin(al) * (r1 + l), 0.05 * fl, 0.4); }
      c.fill();
    }
    // the opening (ph 2 -> 3): ONE burst of ink speed-lines flung out round the whole creature
    if (burst > 0.01) { c.fillStyle = P.ink; c.beginPath();
      for (let i = 0; i < 20; i++) { const al = i / 20 * TAU + 0.07, r1 = (0.6 + 1.9 * kk) * SZ, l = (0.7 * (1 - kk) + 0.2) * SZ * (i % 2 ? 0.65 : 1);
        streak(c, Math.cos(al) * r1, -0.1 + Math.sin(al) * r1, Math.cos(al) * (r1 + l), -0.1 + Math.sin(al) * (r1 + l), 0.045 * burst, 0.35); } c.fill(); }
    c.restore();
  }
  // an ink swipe: a tapered comet along the path a point took (oldest C, through B, to now A), fattest at its head
  function swipe(c, { A, B, C, w }) {
    const qx = 2 * B[0] - (A[0] + C[0]) / 2, qy = 2 * B[1] - (A[1] + C[1]) / 2, N = 10, L = [], Rt = [];
    for (let i = 0; i <= N; i++) { const v = i / N, a = (1 - v) * (1 - v), b = 2 * v * (1 - v), cc = v * v;
      const x = a * C[0] + b * qx + cc * A[0], y = a * C[1] + b * qy + cc * A[1], tx = 2 * (1 - v) * (qx - C[0]) + 2 * v * (A[0] - qx), ty = 2 * (1 - v) * (qy - C[1]) + 2 * v * (A[1] - qy), tl = Math.hypot(tx, ty) || 1, ww = w * Math.pow(v, 1.3);
      L.push([x - ty / tl * ww, y + tx / tl * ww]); Rt.push([x + ty / tl * ww * 0.5, y - tx / tl * ww * 0.5]); }
    L.concat(Rt.reverse()).forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
  }
  // the smear for an attack frame: the rig's pose a beat earlier (u - .04, .08, .12); a wing whose tip travelled far leaves
  // ghosts and ink swipes (from its tip, its outer primary's tip and its mid-arm)
  function smear(Z, olds) {
    const far = olds[olds.length - 1], ghosts = [], swipes = [];
    const mv = Z.wings.map((w, j) => { const f = far.wings[j]; return f && f.pair === w.pair && f.side === w.side ? Math.hypot(w.tip[0] - f.tip[0], w.tip[1] - f.tip[1]) : 0; });
    olds.forEach((O, k) => ghosts.push({ wings: O.wings, al: mv.map((d, j) => O.wings[j] && O.wings[j].pair === Z.wings[j].pair ? cl((d - 0.12) / 0.3) * [0.35, 0.22, 0.12][k] : 0) }));
    Z.wings.forEach((w, j) => { const d = mv[j]; if (d < 0.15) return;
      const Wg = RIG.WINGS[w.i], fq = Wg.feathers[Wg.feathers.length - 1].sp[10], mid = [(Wg.root[0] + Wg.arm[2]) / 2, (Wg.root[1] + Wg.arm[3]) / 2];
      for (const [px, py, ww] of [[Wg.arm[2], Wg.arm[3], 0.075], [fq[0], fq[1], 0.06]])
        swipes.push({ A: RIG.apply(w.m, px, py), B: RIG.apply(olds[0].wings[j].m, px, py), C: RIG.apply(olds[1].wings[j].m, px, py), w: ww * Math.min(1, d / 0.4) * w.vis }); });
    return { ghosts, swipes };
  }
  // a pool of lava on the floor: ink under, hot body, gold heart, ink rim
  function lava(c, x, y, rx, k) {
    if (rx < 0.5) return;
    c.fillStyle = 'rgba(28,18,13,' + (0.9 * k).toFixed(3) + ')'; c.beginPath(); c.ellipse(x + rx * 0.06, y + rx * 0.06, rx * 1.08, rx * 0.42, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(240,82,28,' + k.toFixed(3) + ')'; c.beginPath(); c.ellipse(x, y, rx, rx * 0.36, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,214,110,' + k.toFixed(3) + ')'; c.beginPath(); c.ellipse(x - rx * 0.2, y - rx * 0.06, rx * 0.45, rx * 0.13, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(28,18,13,' + k.toFixed(3) + ')'; c.lineWidth = Math.max(1, rx * 0.08); c.beginPath(); c.ellipse(x, y, rx, rx * 0.36, 0, 0, TAU); c.stroke();
  }

  // ---- THE ATTACKS: the rig's pose and the rig's danger shapes, inked ------------------------------------------
  function attack(c, x, y, R, t, ph = 3, atk = 'blast', u = 0, px = x, py = y + 4 * R) {
    const PX = (px - x) / R, PY = (py - y) / R, Z0 = RIG.pose(t, ph, atk, u, PX, PY), A = RIG.attack(atk, u, ph, x, y, R, px, py, t, Z0);
    const SM = atk === 'sword' ? swordMorph(t, ph, u, Z0, A, x, y, R) : null, Z = SM ? { ...Z0, wings: SM.wings } : Z0;
    const olds = [0.04, 0.08, 0.12].map((d) => RIG.pose(t, ph, atk, Math.max(0, u - d), PX, PY)), sm = smear(Z, olds);
    const sp = atk === 'tornado' ? Z.beats.spin : atk === 'wheel' ? A.rate : 0;
    const gh = sp > 0.05 ? [0.0025, 0.005, 0.0075].map((d, k) => { const G = RIG.pose(t, ph, atk, Math.max(0, u - d), PX, PY); return { wings: G.wings, al: G.wings.map(() => [0.42, 0.26, 0.13][k] * sp) }; }) : sm.ghosts;
    const o = { ghosts: SM ? null : gh, swipes: atk === 'tornado' || atk === 'wheel' || SM ? null : sm.swipes, spin: atk === 'tornado' ? sp : undefined, flash: atk === 'tornado' ? Z.beats.flash : 0, u, dizzy: atk === 'tornado' || atk === 'wheel' ? A.dizzy : 0, roll: atk === 'wheel' ? A.roll : 0, sword: SM };
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    if (atk === 'blast') blastUnder(c, x, y, R, t, u, A);
    else if (atk === 'tornado') tornadoUnder(c, x, y, R, t, u, A);
    else if (atk === 'laser') laserUnder(c, x, y, R, t, u, A);
    else if (atk === 'wheel') wheelUnder(c, x, y, R, t, u, A);
    else if (atk === 'recall') recallUnder(c, x, y, R, t, u, A);
    else if (atk === 'sword') swordUnder(c, x, y, R, t, u, A, SM);
    c.restore();
    draw(c, x, y, R, t, ph, Z, o);
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    if (atk === 'blast') blastOver(c, x, y, R, t, u, A);
    else if (atk === 'tornado') tornadoOver(c, x, y, R, t, u, A);
    else if (atk === 'laser') laserOver(c, x, y, R, t, u, A);
    else if (atk === 'wheel') wheelOver(c, x, y, R, t, u, A);
    else if (atk === 'recall') recallOver(c, x, y, R, t, u, A);
    else if (atk === 'sword') swordOver(c, x, y, R, t, u, A);
    c.restore();
  }
  // ---- r33: the wheel, the feather recall and the sword slam ---------------------------------------------------------
  // a cartoon flame: a fat inked teardrop licking up from (X, Y), a gold heart and a cream core, its tip swaying; h tall
  function flame(c, X, Y, h, w, sw, ink) {
    const tongue = (s, hh2, ww) => { const p = new Path2D(); p.moveTo(X + sw * s, Y - hh2); p.quadraticCurveTo(X + ww * 1.3, Y - hh2 * 0.3, X, Y); p.quadraticCurveTo(X - ww * 1.3, Y - hh2 * 0.3, X + sw * s, Y - hh2); p.closePath(); return p; };
    const o = tongue(1, h, w), m = tongue(0.7, h * 0.66, w * 0.68), i = tongue(0.4, h * 0.34, w * 0.38);
    under(c, o, ink * 2.2); c.fillStyle = P.hot; c.fill(o); c.fillStyle = '#ffc23e'; c.fill(m); c.fillStyle = 'rgba(255,244,214,0.95)'; c.fill(i);
    c.strokeStyle = P.ink; c.lineWidth = ink; c.lineJoin = 'round'; c.stroke(o);
  }
  // one of the boss's blade feathers, loose: its tip at (X, Y), heading a, len long; a rust cel with the dark wing bar, a
  // cream quill and its ink (the same paint as the wings', in the feather's own frame)
  function plume(c, X, Y, a, len, w, k, inkPx = 1.4) {
    const q = RIG.feather(-1, 0, 0, 1, 1.15 * w / len, 0.08 * (k % 2 ? 1 : -1), false), p = poly(q.l.concat(q.r.slice().reverse()));
    c.save(); c.translate(X, Y); c.rotate(a); c.scale(len, len);
    c.strokeStyle = P.ink; c.lineCap = 'round'; c.lineWidth = inkPx * 1.6 / len; c.beginPath(); c.moveTo(-0.9, 0); c.lineTo(-1.25, 0); c.stroke();
    c.strokeStyle = P.cream; c.lineWidth = inkPx * 0.6 / len; c.stroke();
    cel(c, p, k % 3 ? P.prim : P.sec, { r: 0.14, shade: 'rgba(60,16,50,0.42)', ink: inkPx / len, core: 'rgb(62,22,8)', band: (g) => {
      g.fillStyle = 'rgba(84,34,14,0.7)'; g.fill(poly([q.l[4], q.l[6], q.r[6], q.r[4]]));
      g.strokeStyle = 'rgba(247,239,220,0.85)'; g.lineWidth = 0.025; g.lineCap = 'round'; g.beginPath(); q.sp.slice(0, 9).forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); } });
    c.restore();
  }
  const plumeShadow = (c, X, Y, a, len, w) => { c.save(); c.translate(X, Y); c.rotate(a); c.fillStyle = 'rgba(20,6,14,0.3)'; c.beginPath(); c.ellipse(-len * 0.5, 0, len * 0.5, w * 0.9, 0, 0, TAU); c.fill(); c.restore(); };
  const cloudAt = (c, X, Y, r, al) => { if (al < 0.02) return; c.globalAlpha = al; puff(c, X, Y, r); c.globalAlpha = 1; };

  // WHEEL. Windup: the wings fold into one disc of feathers and it rocks back, dust kicked out behind it. Roll: a flat saw
  // blade, whoosh arcs riding its rim, sparks spat off where it bites; behind it the gouge it cuts in the floor, an ember
  // line cooling along it; at each ricochet a cartoon POW. Home: it lands in a puff of dust, dizzy
  function wheelUnder(c, x, y, R, t, u, A) {
    const T = A.trail, n = T.length;
    // the scar it has scored so far, every leg up to where it is, cooling to a dark groove with a pale lip
    if (u > 0.22) { const way = A.legs.slice(0, A.leg + 1).concat([A.pos]), fade = 1 - RIG.sm(0.84, 0.97, u), L = [], Rt = [];
      for (let i = 0; i < way.length - 1; i++) { const a = way[i], b = way[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / (R * 0.3)));
        if (d < 0.5) continue; const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d;
        for (let j = 0; j < n; j++) { const v = j / n, px = lerp(a.x, b.x, v), py = lerp(a.y, b.y, v), w = R * (0.05 + 0.07 * hh(i * 31 + j, 7));
          L.push([px + nx * w, py + ny * w]); Rt.push([px - nx * w * (0.6 + 0.6 * hh(i * 31 + j, 8)), py - ny * w * (0.6 + 0.6 * hh(i * 31 + j, 8))]); } }
      if (L.length > 1) { const g = poly(L.concat(Rt.reverse())); c.globalAlpha = fade;
        c.fillStyle = 'rgba(40,14,8,0.5)'; c.fill(g); c.strokeStyle = 'rgba(28,18,13,0.45)'; c.lineWidth = R * 0.02; c.lineJoin = 'round'; c.stroke(g); c.globalAlpha = 1; } }
    if (A.roll > 0.01 || u > 0.24) for (const [col, w0] of [[P.ink, 0.42], ['rgba(240,82,28,1)', 0.16], ['rgba(255,214,110,1)', 0.05]]) for (let k = 0; k < n - 1; k++) {
      const f = (k + 1) / (n - 1), al = Math.min(1, 0.4 + A.roll) * Math.pow(f, col === P.ink ? 0.6 : 1.6) * (1 - RIG.sm(0.86, 1, u));
      if (al < 0.02 || Math.hypot(T[k + 1].x - T[k].x, T[k + 1].y - T[k].y) < 0.5) continue;
      c.globalAlpha = al * (col === P.ink ? 0.55 : 0.9); c.strokeStyle = col; c.lineWidth = R * w0 * (0.5 + 0.5 * f); c.beginPath(); c.moveTo(T[k].x, T[k].y); c.lineTo(T[k + 1].x, T[k + 1].y); c.stroke(); }
    c.globalAlpha = 1;
    for (const h of A.hits) if (h.al > 0.01) { c.fillStyle = 'rgba(30,8,4,' + (0.45 * h.al).toFixed(3) + ')'; c.beginPath(); c.ellipse(h.x, h.y, R * 0.7, R * 0.26, 0, 0, TAU); c.fill(); }
    // the tell: dust scuffed out behind it as it rocks back
    if (A.rock > 0.05) { const bx = Math.cos(A.dir + Math.PI), by = Math.sin(A.dir + Math.PI);
      for (let k = 0; k < 3; k++) cloudAt(c, A.pos.x + bx * R * (0.75 + 0.2 * k) + (k - 1) * R * 0.3, A.pos.y + by * R * 0.6 + R * 0.2, R * (0.12 + 0.05 * k) * A.rock, 0.6 * A.rock); }
    // home: it lands in a ring of dust
    { const q = cl((u - 0.82) / 0.16); if (q > 0 && q < 1) for (let k = 0; k < 7; k++) { const a = k * TAU / 7 + 0.4;
      cloudAt(c, A.pos.x + Math.cos(a) * R * (0.7 + 0.6 * q), A.pos.y + R * 0.15 + Math.sin(a) * R * (0.28 + 0.2 * q), R * 0.18 * (1 - 0.5 * q), 1 - q); } }
  }
  function wheelOver(c, x, y, R, t, u, A) {
    const sp = A.rate, X = A.pos.x, Y = A.pos.y - R * 0.1, rr = R * 1.05;
    if (sp > 0.05) {
      c.fillStyle = 'rgba(122,70,40,' + (0.22 * sp).toFixed(3) + ')'; c.beginPath(); c.arc(X, Y, rr, 0, TAU); c.fill();
      c.fillStyle = P.ink; c.beginPath();
      for (let i = 0; i < 4; i++) { const a0 = A.spin + i * TAU / 4, len = 1.5 * sp, N = 14, L = [], Rt = [];
        for (let j = 0; j <= N; j++) { const v = j / N, an = a0 - len * v, ww = R * 0.07 * sp * Math.pow(1 - v, 0.7) * Math.min(1, v * 5 + 0.25);
          L.push([X + Math.cos(an) * (rr + ww), Y + Math.sin(an) * (rr + ww)]); Rt.push([X + Math.cos(an) * (rr - ww), Y + Math.sin(an) * (rr - ww)]); }
        L.concat(Rt.reverse()).forEach(([qx, qy], j) => j ? c.lineTo(qx, qy) : c.moveTo(qx, qy)); c.closePath(); }
      c.fill();
      c.strokeStyle = P.glint; c.lineCap = 'round'; c.lineWidth = R * 0.02 * sp;
      for (let i = 0; i < 4; i++) { const a0 = A.spin + i * TAU / 4; c.beginPath(); c.arc(X, Y, rr, a0 - 0.5 * sp, a0 - 0.08); c.stroke(); }
    }
    // sparks spat off the rim where it bites the floor, flung back from its heading
    if (A.roll > 0.05) for (let k = 0; k < 9; k++) { const q = (t * 3 + k / 9) % 1, s = (hh(k, 3) - 0.5) * 1.4, b = A.dir + Math.PI + s, z = R * 0.05 * A.roll * (1 - q);
      if (z < 0.4) continue;
      const bx = X + Math.cos(A.dir + Math.PI) * rr * 0.8, by = A.pos.y + R * 0.3, px = bx + Math.cos(b) * R * 1.3 * q, py = by + Math.sin(b) * R * 1.3 * q - R * 0.4 * q * (1 - q);
      c.fillStyle = P.ink; c.beginPath(); streak(c, px, py, px - Math.cos(b) * R * 0.25 * (1 - q), py - Math.sin(b) * R * 0.25 * (1 - q), z * 0.7, 0.2); c.fill();
      c.fillStyle = k % 2 ? '#ffc23e' : P.hot; c.beginPath(); c.arc(px, py, z, 0, TAU); c.fill(); }
    // the ricochets: a cartoon POW, a cream spiked star with a hot heart, inked, and ink streaks bursting out
    A.hits.forEach((h, j) => { if (h.al < 0.02) return; const g = h.al, r0 = R * (0.35 + 0.5 * (1 - g)), pts = [];
      for (let i = 0; i < 18; i++) { const a = i * TAU / 18 + j, rr2 = i % 2 ? r0 * 0.55 : r0 * (i % 4 ? 0.85 : 1); pts.push([h.x + Math.cos(a) * rr2, h.y + Math.sin(a) * rr2 * 0.7]); }
      const st = poly(pts); c.globalAlpha = Math.min(1, g * 1.6); under(c, st, R * 0.08); c.fillStyle = P.cream; c.fill(st); c.strokeStyle = P.ink; c.lineWidth = R * 0.04; c.stroke(st);
      c.fillStyle = P.hot; c.beginPath(); c.ellipse(h.x, h.y, r0 * 0.35, r0 * 0.25, 0, 0, TAU); c.fill();
      c.fillStyle = P.ink; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * TAU / 10 + 0.3, r1 = r0 * 1.15, l = R * 0.35 * g;
        streak(c, h.x + Math.cos(a) * r1, h.y + Math.sin(a) * r1 * 0.7, h.x + Math.cos(a) * (r1 + l), h.y + Math.sin(a) * (r1 + l) * 0.7, R * 0.035 * g, 0.35); } c.fill(); c.globalAlpha = 1; });
    if (A.dizzy > 0.01) for (let k = 0; k < 4; k++) { const a = t * 3 + k * TAU / 4, z = R * 0.16 * A.dizzy * (0.8 + 0.2 * Math.sin(a));
      star(c, A.pos.x + Math.cos(a) * R * 0.4, A.pos.y - R * 1.12 + Math.sin(a) * R * 0.13, z, t * 4 + k); }
  }

  // RECALL. The wings flare and ten blade feathers fly off and stake themselves in the floor (a puff, a cracked ink star
  // where each bites), quiver, then rip free in a spit of grit and fly straight home, ink speed lines behind them
  function recallUnder(c, x, y, R, t, u, A) {
    A.feathers.forEach((f, i) => { if (f.state < 1 || f.state > 3 && f.tear < 0.01) return;
      const hole = f.state === 2 ? 1 : f.state === 3 ? f.tear : 0;
      if (hole > 0.01) { const X = f.plant.x, Y = f.plant.y; c.strokeStyle = 'rgba(28,18,13,' + (0.5 * hole).toFixed(3) + ')'; c.lineWidth = R * 0.02; c.lineCap = 'round'; c.beginPath();
        for (let j = 0; j < 5; j++) { const a = j * TAU / 5 + hh(i, 9) * 2, l = R * (0.05 + 0.05 * hh(i, j)); c.moveTo(X, Y); c.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l * 0.5); } c.stroke();
        c.fillStyle = 'rgba(28,18,13,' + (0.6 * hole).toFixed(3) + ')'; c.beginPath(); c.ellipse(X, Y, R * 0.05, R * 0.022, 0, 0, TAU); c.fill(); }
      if (f.vis > 0) plumeShadow(c, f.x + f.z * 0.4, f.y, f.a, f.len, f.w); });
  }
  function recallOver(c, x, y, R, t, u, A) {
    A.feathers.forEach((f, i) => {
      if (f.dust > 0.01) cloudAt(c, f.plant.x, f.plant.y - R * 0.04, R * (0.08 + 0.12 * (1 - f.dust)), f.dust);
      if (f.state === 3 && f.tear > 0.01) for (let j = 0; j < 4; j++) { const a = -Math.PI / 2 + (j - 1.5) * 0.5, q = 1 - f.tear;
        c.fillStyle = j % 2 ? '#c8461c' : P.ink; c.beginPath(); c.arc(f.plant.x + Math.cos(a) * R * 0.3 * q, f.plant.y + Math.sin(a) * R * 0.3 * q + R * 0.3 * q * q, R * 0.025 * f.tear, 0, TAU); c.fill(); }
      if (f.vis < 0.01) return;
      const qv = f.quiver * 0.16 * Math.sin(t * 46 + i * 1.3), X = f.x, Y = f.y - f.z, a = f.a + qv;
      if (f.state !== 2) { const bx = -Math.cos(f.a), by = -Math.sin(f.a), L = R * (f.state === 3 ? 0.9 : 0.5);
        c.fillStyle = P.ink; c.beginPath(); for (const o of [-1, 1]) { const ox = -by * f.w * 0.7 * o, oy = bx * f.w * 0.7 * o, sx = X + bx * f.len + ox, sy = Y + by * f.len + oy;
          streak(c, sx, sy, sx + bx * L, sy + by * L, R * 0.02, 0.2); } c.fill(); }
      plume(c, X, Y, a, f.len, f.w, i);
    });
  }

  // SWORD. Form: the feathers stream in and fuse into one long blade of overlapping rust plumes, gold-edged and inked, a
  // cream fuller down it and a covert crossguard. Raise: it rears up (a gleam on its point). Slam: down along the line, an
  // inked shock ring, the point buried in cracks, and cartoon flames bursting up one after another along the line,
  // leaving it scorched. Then the blade breaks back into feathers
  // SWORD, morph C (owner: "feather is the cleanest"): every other feather of every wing peels off, flies the short way in
  // and lies flat along the blade, edge to edge: one slim straight double-edged sword from the shoulders to the rig's point,
  // two of them crossed at the shoulders as its guard. The wings are held open as at rest, ragged, until the blade breaks and
  // the feathers fly home. There is no blade but them. Boss units; the path is the rig's (liquid's): up behind the head, then
  // straight over the top and down the line
  const PEELS = RIG.WINGS.map((Wg) => Wg.feathers.map((_, n) => n).filter((n) => n % 2 && !Wg.feathers[n].tal));
  const PEEL = []; for (let j = 0; j < 5; j++) for (const i of [0, 1, 2]) for (const side of [-1, 1]) { const n = PEELS[i][j]; if (n !== undefined) PEEL.push({ i, side, n }); }
  const BW = 0.075, GW = 0.06, GL = 0.3, GD = 0.45;   // the blade's and the guard's half-width, the guard's arm, the guard's place up the blade
  function swordMorph(t, ph, u, Z, A, x, y, R) {
    const Bl = A.blade, P0 = RIG.pose(t, ph), b = P0.body.m, dt = b[0] * b[3] - b[1] * b[2];
    const D = RIG.mul(Z.body.m, [b[3] / dt, -b[1] / dt, -b[2] / dt, b[0] / dt, (b[2] * b[5] - b[3] * b[4]) / dt, (b[1] * b[4] - b[0] * b[5]) / dt]);
    const lp = (p, q, k) => p.map((v, n) => v + (q[n] - v) * k);
    const wings = Z.wings.map((w) => { const o = P0.wings.find((v) => v.i === w.i && v.side === w.side); return o ? { ...w, m: lp(w.m, RIG.mul(D, o.m), Bl.form) } : w; });
    const SB = RIG.apply(Z.body.m, 0, -0.2), tip = [(Bl.tip.x - x) / R, (Bl.tip.y - y) / R], ground = [(Bl.ground.x - x) / R, (Bl.ground.y - y) / R];
    const L = Math.max(0.3, 0.9 * Bl.form, Math.hypot(tip[0] - SB[0], tip[1] - SB[1])), ax = Math.atan2(tip[1] - SB[1], tip[0] - SB[0]), ca = Math.cos(ax), sa = Math.sin(ax);
    const N = PEEL.length, gaps = {}, fly = [];
    let sh = 0;
    PEEL.forEach((e, j) => { const w = wings.find((v) => v.i === e.i && v.side === e.side); if (!w) return;
      const t0 = 0.03 + 0.14 * j / N, t2 = 0.83 + 0.09 * j / N, out = RIG.sm(t0, t0 + 0.09, u) * (1 - RIG.sm(t2, t2 + 0.07, u)), key = e.i + ',' + e.side;
      const gp = gaps[key] = gaps[key] || { out: false, home: [] };
      if (out <= 0) { gp.home.push(e.n); return; }
      gp.out = true;
      const Wg = RIG.WINGS[e.i], q = Wg.feathers[e.n], M = w.m, sd = j % 2 ? 1 : -1, guard = j < 2;
      // its place: the guard's two cross the axis GD up it (the grip below is under the body); the rest overlap from there to the point
      const s2 = guard ? 0 : (j - 2) / (N - 3), d = guard ? GD * L : L * (GD + (1 - GD) * 0.6 * s2), o = guard ? 0 : sd * 0.022;
      const p1 = [SB[0] + ca * d - sa * o, SB[1] + sa * d + ca * o], a1 = guard ? ax + sd * Math.PI / 2 : ax;
      const lx = (guard ? GL : 0.4 * (1 - GD) * L) / q.L, wy = (guard ? GW : BW) / q.w;
      const p0 = RIG.apply(M, q.base[0], q.base[1]), v = [M[0] * Math.cos(q.a) + M[2] * Math.sin(q.a), M[1] * Math.cos(q.a) + M[3] * Math.sin(q.a)], b0 = Math.atan2(v[1], v[0]), sc0 = Math.hypot(v[0], v[1]), mir = M[0] * M[3] - M[1] * M[2] < 0 ? -1 : 1;
      let da = a1 - b0; da -= TAU * Math.round(da / TAU);
      const k = smooth(out);
      sh += out / N;
      fly.push({ Wg, q, n: e.n, X: lerp(p0[0], p1[0], k), Y: lerp(p0[1], p1[1], k) - 0.18 * Math.sin(Math.PI * k), a: b0 + da * k, sx: lerp(sc0, lx, k), sy: lerp(sc0, wy, k) * (k < 0.5 ? mir : sd), s2: guard ? -1 : s2, landed: out >= 1 });
    });
    return { wings, gaps, fly, ov: false, SB, tip, ground, sh, ax, L, lift: Bl.lift };
  }
  // the feathers of the sword: over (true) the ones in flight; under (false) the stacked blade, always under the body (its
  // base at the shoulders is covered, as liquid's). Painted as themselves, in flat ink
  function stack(c, M0, SM, over) {
    c.save(); c.setTransform(M0);
    const draw1 = (f) => { c.save(); c.translate(f.X, f.Y); c.rotate(f.a); c.scale(f.sx, f.sy); c.rotate(-f.q.a); c.translate(-f.q.base[0], -f.q.base[1]); paintFeather(c, f.Wg, f.q, f.n);
      ink(c, bladeOf(f.q, f.n * 3.1 + f.Wg.i), 0.06 / (f.sx + Math.abs(f.sy))); c.restore(); };   // its own ink line, legible at the blade's scale
    const mine = SM.ov === over, kb = RIG.sm(0.85, 1, SM.sh), ca = Math.cos(SM.ax), sa = Math.sin(SM.ax);
    const at = (v, w) => [SM.SB[0] + ca * SM.L * v - sa * w, SM.SB[1] + sa * SM.L * v + ca * w];
    const edge = poly([at(GD, BW), at(0.86, BW), at(1, 0), at(0.86, -BW), at(GD, -BW)]);
    // the ones nearer the point first, so each lies over the base of the one ahead of it; the guard last
    const all = SM.fly.slice().sort((p, q) => q.s2 - p.s2), blade = (f) => f.landed && f.s2 >= 0;
    // all landed: the blade's feathers trimmed to one straight, parallel-edged, pointed blade, inked, a ridge down its middle
    if (mine && kb > 0.01) {
      for (const f of all) if (blade(f)) { c.globalAlpha = 1 - kb; draw1(f); }
      c.globalAlpha = kb; c.save(); c.clip(edge); for (const f of all) if (blade(f)) draw1(f); c.restore();
      c.strokeStyle = 'rgba(247,239,220,0.55)'; c.lineWidth = 0.014; c.beginPath(); c.moveTo(...at(GD, 0)); c.lineTo(...at(0.97, 0)); c.stroke();
      c.strokeStyle = P.ink; c.lineWidth = 0.035; c.lineJoin = 'miter'; c.stroke(edge); c.globalAlpha = 1;
      for (const f of all) if (f.landed && !blade(f)) draw1(f);
    } else for (const f of all) if (f.landed ? mine : over) draw1(f);
    c.restore();
  }
  function swordUnder(c, x, y, R, t, u, A, SM) {
    const B = A.blade, F = A.fire;
    if (F.scorch > 0.01 && F.front > 1) { const ex = F.start.x + F.dx * F.front, ey = F.start.y + F.dy * F.front;
      for (const [col, w0, al] of [[P.ink, 1.4, 0.4], ['rgba(240,82,28,1)', 0.5, 0.75], ['rgba(255,214,110,1)', 0.15, 0.8]]) {
        c.globalAlpha = F.scorch * al * (col === P.ink ? 1 : F.on * 0.7 + 0.3); c.strokeStyle = col; c.lineWidth = F.w * w0; c.lineCap = 'butt';
        c.beginPath(); c.moveTo(F.start.x, F.start.y); c.lineTo(ex, ey); c.stroke(); }
      c.globalAlpha = 1; }
    // the stacked feathers' shadow, from the shoulders to the point's shadow on the floor
    const bx = x + SM.SB[0] * R, by = y + SM.SB[1] * R + R * 0.5, gx = x + SM.ground[0] * R, gy = y + SM.ground[1] * R;
    if (SM.sh > 0.05 && Math.hypot(gx - bx, gy - by) > 1) { const w = R * 0.12, a = Math.atan2(gy - by, gx - bx);
      c.fillStyle = 'rgba(20,6,14,' + (0.3 * SM.sh).toFixed(3) + ')'; c.beginPath();
      c.moveTo(bx - Math.sin(a) * w, by + Math.cos(a) * w); c.lineTo(gx, gy); c.lineTo(bx + Math.sin(a) * w, by - Math.cos(a) * w); c.closePath(); c.fill(); }
    if (B.buried > 0.01) { const X = x + SM.tip[0] * R, Y = y + SM.tip[1] * R; c.strokeStyle = 'rgba(28,18,13,' + (0.85 * B.buried).toFixed(3) + ')'; c.lineCap = 'round'; c.lineWidth = R * 0.035; c.beginPath();
      for (let j = 0; j < 7; j++) { const a = j * TAU / 7 + 0.3, l = R * (0.25 + 0.2 * hh(j, 5)); c.moveTo(X, Y); c.lineTo(X + Math.cos(a) * l * 0.55, Y + Math.sin(a) * l * 0.25); c.lineTo(X + Math.cos(a + 0.2) * l, Y + Math.sin(a + 0.2) * l * 0.45); } c.stroke(); }
    const I = A.impact;
    if (I && I.al > 0.01) { c.strokeStyle = 'rgba(28,18,13,' + (0.85 * I.al).toFixed(3) + ')'; c.lineWidth = R * 0.1 * I.al; c.beginPath(); c.ellipse(I.x, I.y, I.r, I.r * 0.36, 0, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(247,239,220,' + (0.9 * I.al).toFixed(3) + ')'; c.lineWidth = R * 0.04 * I.al; c.stroke(); }
  }
  function swordOver(c, x, y, R, t, u, A) {
    const F = A.fire, I = A.impact, bv = Math.floor(t * 5);
    // the slam: ink streaks bursting off the point and two puffs of dust
    if (I && I.al > 0.01) { c.fillStyle = P.ink; c.beginPath();
      for (let i = 0; i < 12; i++) { const a = i * TAU / 12 + 0.2, r1 = I.r * 0.9, l = R * 0.45 * I.al; streak(c, I.x + Math.cos(a) * r1, I.y + Math.sin(a) * r1 * 0.36, I.x + Math.cos(a) * (r1 + l), I.y + Math.sin(a) * (r1 + l) * 0.36, R * 0.04 * I.al, 0.35); }
      c.fill(); cloudAt(c, I.x - R * 0.45, I.y, R * 0.2 * (1.4 - I.al), I.al); cloudAt(c, I.x + R * 0.5, I.y + R * 0.05, R * 0.18 * (1.4 - I.al), I.al); }
    // the line of fire: cartoon flames bursting up in turn along it
    if (F.on > 0.01) F.flames.map((f, i) => [f, i]).sort((p, q) => p[0].y - q[0].y).forEach(([f0, i]) => { if (f0.h < 0.02) return;
      const st = (i % 2 ? 1 : -1) * f0.sz * 0.4, f = { ...f0, x: f0.x + F.nx * st, y: f0.y + F.ny * st };
      const sw = f.sz * 0.25 * Math.sin(t * 11 + i * 1.7) + f.sz * 0.05 * (hh(i, bv) - 0.5), bo = f.h * (1 + 0.12 * Math.sin(t * 17 + i));
      c.globalAlpha = Math.min(1, f.al * 1.5) * F.on; flame(c, f.x + f.sz * 0.25 * (f.s - 0.5), f.y, f.sz * 1.9 * bo, f.sz * 0.5 * (0.6 + 0.4 * bo), sw, R * 0.03);
      if (f.s > 0.5) flame(c, f.x - f.sz * 0.3, f.y + f.sz * 0.05, f.sz * 0.9 * bo, f.sz * 0.25, -sw * 0.7, R * 0.025);
      c.globalAlpha = 1; });
  }
  // BLAST. Windup: its reach laid on the floor (the sheet's furthest front, its half-angle) and lava beads sucked into the bud.
  // Strike: a ring of ink at the burst, then ONE rolling sheet of wind down the cone, crests curling, flecks flung off it
  function blastUnder(c, x, y, R, t, u, A) {
    const rA = RIG.sm(0.03, 0.2, u) * (1 - RIG.sm(0.5, 0.62, u)), a = A.dir;
    if (rA > 0.01) {
      const rr = R * 4.2, hw = 0.65 * (0.3 + 0.7 * rA);
      c.fillStyle = 'rgba(28,18,13,' + (0.08 * rA).toFixed(3) + ')';
      c.beginPath(); c.arc(x, y, R * 1.1, a - hw, a + hw); c.arc(x, y, rr, a + hw, a - hw, true); c.closePath(); c.fill();
      // the dashed reach (on R*.22, off R*.14, running at R*.6/s), dash by dash: game tech has no setLineDash
      const on = R * 0.22, per = R * 0.36, L = rr * 2 * hw, s0 = -((t * R * 0.6) % per);
      c.beginPath();
      for (let s = s0; s < L; s += per) { const sa = Math.max(0, s), sb = Math.min(L, s + on); if (sb <= sa) continue;
        c.moveTo(x + Math.cos(a - hw + sa / rr) * rr, y + Math.sin(a - hw + sa / rr) * rr); c.arc(x, y, rr, a - hw + sa / rr, a - hw + sb / rr); }
      c.strokeStyle = 'rgba(28,18,13,' + (0.25 * rA).toFixed(3) + ')'; c.lineWidth = R * 0.06; c.stroke();
      c.strokeStyle = 'rgba(243,230,200,' + (0.25 * rA).toFixed(3) + ')'; c.lineWidth = R * 0.022; c.stroke();
    }
    for (const b of A.suck) { const dx = b.x - x, dy = b.y - (y - 0.1 * R), dl = Math.hypot(dx, dy) || 1;
      c.globalAlpha = b.al; c.fillStyle = P.ink; c.beginPath(); streak(c, b.x, b.y, b.x + dx / dl * R * 0.35, b.y + dy / dl * R * 0.35, b.r * 0.7, 0.2); c.fill();
      c.beginPath(); c.arc(b.x + b.r * 0.18, b.y + b.r * 0.24, b.r * 1.3, 0, TAU); c.fill();
      c.fillStyle = P.hot; c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
      c.fillStyle = '#ffd66e'; c.beginPath(); c.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.42, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    if (A.shock) { const s = A.shock; c.globalAlpha = s.al; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU);
      c.strokeStyle = P.ink; c.lineWidth = s.w * 1.1; c.stroke(); c.strokeStyle = P.cream; c.lineWidth = s.w * 0.5; c.stroke(); c.globalAlpha = 1; }
    // the beat: ink impact lines bursting out on the rig's shock ring
    if (A.shock) { const s = A.shock; c.fillStyle = P.ink; c.globalAlpha = s.al; c.beginPath();
      for (let i = 0; i < 14; i++) { const al = i / 14 * TAU + 0.1, r1 = s.r + R * 0.12, l = R * 0.42 * s.al;
        streak(c, s.x + Math.cos(al) * r1, s.y + Math.sin(al) * r1 * 0.85, s.x + Math.cos(al) * (r1 + l), s.y + Math.sin(al) * (r1 + l) * 0.85, R * 0.05 * s.al, 0.4); }
      c.fill(); c.globalAlpha = 1; }
    const S = A.sheet; if (!S) return;
    const { apex: { x: ax, y: ay }, dir, half: hw, front, fade } = S;
    c.globalAlpha = Math.min(1, fade * 2.5);
    // the sheet: a cream band of wind and dust behind its front, inked heavy on the shadow side
    const r0 = Math.max(R * 0.9, front - R * 0.45), sh = new Path2D();
    sh.arc(ax, ay, front, dir - hw, dir + hw); sh.arc(ax, ay, r0, dir + hw, dir - hw, true); sh.closePath();
    // a solid cel: white-hot cream at the front, a hard saturated orange band behind it, a dark core at its tail, inked fat
    under(c, sh, R * 0.12); c.fillStyle = P.cream; c.fill(sh);
    c.save(); c.clip(sh);
    const band = (rr, col) => { c.fillStyle = col; c.beginPath(); c.arc(ax, ay, rr, dir - hw - 0.1, dir + hw + 0.1); c.arc(ax, ay, Math.max(0, r0 - R), dir + hw + 0.1, dir - hw - 0.1, true); c.fill(); };
    band(r0 + (front - r0) * 0.62, '#f39a3c'); band(r0 + (front - r0) * 0.3, '#c8461c');
    // white shine strokes riding just inside the front
    c.strokeStyle = P.glint; c.lineCap = 'round';
    for (const [f0, f1, lw] of [[-0.82, -0.38, 0.07], [-0.26, -0.1, 0.05], [0.12, 0.5, 0.06]]) { c.lineWidth = R * lw; c.beginPath(); c.arc(ax, ay, front - R * 0.1, dir + hw * f0, dir + hw * f1); c.stroke(); }
    c.restore();
    c.strokeStyle = P.ink; c.lineJoin = 'round'; c.lineWidth = R * 0.06; c.stroke(sh);
    // embers flung up off the band: gold sparks, inked, each born and dying on its own loop
    for (let k = 0; k < 9; k++) { const q = (t * 1.7 + k * 0.37) % 1, af = dir + hw * (hh(k, 5) * 1.8 - 0.9), rr = r0 + (front - r0) * hh(k, 8) - R * 0.5 * q, z = R * 0.06 * Math.sin(q * Math.PI) * (0.6 + 0.4 * hh(k, 2));
      if (z < 0.5) continue; const ex = ax + Math.cos(af) * rr, ey = ay + Math.sin(af) * rr - R * 0.3 * q;
      c.fillStyle = P.ink; c.beginPath(); c.arc(ex + z * 0.2, ey + z * 0.25, z * 1.35, 0, TAU); c.fill();
      c.fillStyle = k % 3 ? '#ffc23e' : P.hot; c.beginPath(); c.arc(ex, ey, z, 0, TAU); c.fill();
      c.fillStyle = P.glint; c.beginPath(); c.arc(ex - z * 0.3, ey - z * 0.3, z * 0.4, 0, TAU); c.fill(); }
    // speed streaks streaming behind the front
    c.fillStyle = P.ink; c.beginPath();
    for (const f of S.flows) streak(c, ax + Math.cos(f.a) * f.r0, ay + Math.sin(f.a) * f.r0, ax + Math.cos(f.a) * f.r1, ay + Math.sin(f.a) * f.r1, R * 0.05, 0.7);
    c.fill();
    // the crests: claw-swipe crescents, the lead one curling up at both ends
    for (const q of S.crests) { const W = R * (0.19 - q.j * 0.04);
      c.save(); c.globalAlpha *= Math.min(1, 0.3 + q.f); gust(c, ax, ay, q.r - R * 0.05, q.a0, q.a1, W, q.j ? '#f39a3c' : P.glint);
      c.strokeStyle = P.ink; c.lineWidth = R * 0.045; c.beginPath(); c.arc(ax, ay, q.r - R * 0.05 + W, q.a0 + 0.04, q.a1 - 0.04); c.stroke(); c.restore();
      if (q.j === 0) for (const [aa, dirn] of [[q.a0, -1], [q.a1, 1]]) curl(c, ax + Math.cos(aa) * (q.r - R * 0.08), ay + Math.sin(aa) * (q.r - R * 0.08), R * 0.3 * (0.6 + 0.4 * S.s), aa + dirn * 1.6, dirn, t); }
    // flecks of lava flung off the lip
    for (const d of S.drops) { const z = d.z;
      c.fillStyle = P.ink; c.beginPath(); streak(c, d.x, d.y, d.x - Math.cos(d.a) * d.tl, d.y - Math.sin(d.a) * d.tl, z * 0.6, 0.2); c.fill();
      c.beginPath(); c.arc(d.x + z * 0.18, d.y + z * 0.24, z * 1.3, 0, TAU); c.fill();
      c.fillStyle = P.hot; c.beginPath(); c.arc(d.x, d.y, z, 0, TAU); c.fill();
      c.fillStyle = '#ffd66e'; c.beginPath(); c.arc(d.x - z * 0.3, d.y - z * 0.3, z * 0.4, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
  }
  function blastOver() {}
  // TORNADO. Windup: the boss spins up. Strike: a sooty rubber-hose twister walks the road. Recovery: it collapses into a
  // lava pool and the boss reels, a ring of stars over its head
  function tornadoUnder(c, x, y, R, t, u, A) {
    // the floor marks, all under the boss: the lava it collapses into, the road it scorched, its foot's shadow
    if (A.pool > 0.01) lava(c, A.pos.x, A.pos.y, R * 0.62 * Math.sqrt(A.pool), A.pool);
    if (A.alive > 0.01) {
      // its scorch: the road it has walked, ink with a cooling ember line down it
      if (u > 0.45) for (const [col, w0] of [[P.ink, 0.17], ['rgba(240,82,28,1)', 0.08], ['rgba(255,214,110,1)', 0.025]]) for (let k = 0; k < 10; k++) {
        const f = (k + 1) / 10, { x: x0, y: y0 } = A.trail[k], { x: x1, y: y1 } = A.trail[k + 1];
        c.globalAlpha = Math.min(1, A.alive * 1.2) * Math.sin(Math.PI * Math.min(1, f * 1.15)); c.strokeStyle = col; c.lineWidth = R * w0 * (0.3 + 0.7 * f); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
      const s = A.scale * (1 - 0.5 * A.collapse);
      c.globalAlpha = Math.min(1, A.alive * 1.2); c.fillStyle = 'rgba(20,6,14,0.3)'; c.beginPath(); c.ellipse(A.pos.x + R * 0.08, A.pos.y + R * 0.06, R * 0.5 * s, R * 0.14 * s, 0, 0, TAU); c.fill();
      c.globalAlpha = 1;
    }
  }
  function tornadoOver(c, x, y, R, t, u, A) {
    if (A.alive > 0.01) {
      c.globalAlpha = Math.min(1, A.alive * 1.2);
      funnel(c, R, t, A);
      c.globalAlpha = 1;
    }
    // dizzy: the classic ring of stars orbiting over its head
    const dz = A.dizzy;
    if (dz > 0.01) for (let k = 0; k < 4; k++) { const a = t * 3 + k * TAU / 4, z = R * 0.11 * dz * (0.8 + 0.2 * Math.sin(a));
      star(c, x + Math.cos(a) * R * 0.4, y - R * 1.12 + Math.sin(a) * R * 0.13, z, t * 4 + k); }
  }
  // the twister on the rig's column (rings widening up to its height, its top radius, collapsing onto the floor): a sooty
  // rubber-hose funnel, lit rim, ember bands and four inked swirl strokes scrolling round with its spin, smoke at crown and foot
  function funnel(c, R, t, A) {
    const sc = A.scale, d = A.collapse, bx = A.pos.x, by = A.pos.y, N = 7, pts = [];
    const ring = (h) => { const lean = 0.25 * h * h * Math.sin(t * 1.1), rx = (0.16 + 0.78 * Math.pow(h, 1.4)) * sc * (1 + d * 0.7); return [bx + lean * (1 - d) * R, by - h * 1.4 * sc * (1 - 0.92 * d) * R, rx * R]; };
    for (let i = 0; i < N; i++) pts.push(ring(i / (N - 1)));
    const L = pts.map(([px, py, r]) => [px - r, py]), Rt = pts.map(([px, py, r]) => [px + r, py]);
    const top = pts[N - 1], sh = new Path2D();
    sh.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < N; i++) sh.quadraticCurveTo(L[i - 1][0], L[i - 1][1], (L[i - 1][0] + L[i][0]) / 2, (L[i - 1][1] + L[i][1]) / 2);
    sh.lineTo(L[N - 1][0], L[N - 1][1]);
    sh.ellipse(top[0], top[1], top[2], top[2] * 0.28, 0, Math.PI, 0, false);
    for (let i = N - 1; i > 0; i--) sh.quadraticCurveTo(Rt[i][0], Rt[i][1], (Rt[i - 1][0] + Rt[i][0]) / 2, (Rt[i - 1][1] + Rt[i][1]) / 2);
    sh.lineTo(Rt[0][0], Rt[0][1]);
    sh.ellipse(pts[0][0], pts[0][1], pts[0][2], pts[0][2] * 0.3, 0, 0, Math.PI, false);
    sh.closePath();
    const s = sc * (1 - 0.5 * d);
    for (let i = 0; i < 3; i++) { const q = t * 1.6 + i * TAU / 3; if (Math.sin(q) < 0) puff(c, bx + Math.cos(q) * R * 0.42 * (0.6 + s * 0.4), by + Math.sin(q) * R * 0.12, R * 0.15 * s, true); }
    // three hard cels: a pale lit crescent down the left, the soot body, a dark core down the right; white gloss ticks on the lit one
    under(c, sh, R * 0.09); c.fillStyle = '#b98462'; c.fill(sh);
    c.save(); c.clip(sh);
    c.fillStyle = '#6b463a'; c.translate(R * 0.24, 0); c.fill(sh); c.translate(-R * 0.24, 0);
    c.fillStyle = 'rgba(20,6,10,0.45)'; c.translate(R * 0.42, 0); c.fill(sh); c.translate(-R * 0.42, 0);
    {
      c.strokeStyle = P.glint; c.lineCap = 'round';
      for (const [h0, h1, lw] of [[0.82, 0.55, 0.05], [0.45, 0.36, 0.04]]) { const [x0, y0, r0] = ring(h0), [x1, y1, r1] = ring(h1);
        c.lineWidth = R * lw * s; c.beginPath(); c.moveTo(x0 - r0 * 0.78, y0); c.lineTo(x1 - r1 * 0.72, y1); c.stroke(); } }
    c.strokeStyle = 'rgba(255,214,150,0.85)'; c.lineWidth = R * 0.07; c.translate(R * 0.05, 0); c.stroke(sh); c.translate(-R * 0.05, 0);
    c.lineCap = 'round';
    for (let i = 1; i < N; i++) { const [px, py, r] = pts[i], lo = ((A.spin * 0.12 + i * 0.37) % 1) * 2.4 - 0.5;
      c.beginPath(); c.ellipse(px, py + r * 0.05, r * 0.98, r * 0.3, 0, Math.max(0.05, lo), Math.min(Math.PI - 0.05, lo + 1.3));
      c.strokeStyle = P.ink; c.lineWidth = R * 0.07; c.stroke(); c.strokeStyle = i % 2 ? P.hot : '#ffb040'; c.lineWidth = R * 0.028; c.stroke(); }
    const at = (v) => ring(v);
    const sw = new Path2D();
    for (let k = 0; k < 4; k++) { let on = false;
      for (let j = 0; j <= 24; j++) { const v = j / 24, an = -A.spin * 1.6 + k * TAU / 4 + v * 5.5, [qx, qy, qr] = at(v), front = Math.sin(an) > -0.15;
        const X = qx + Math.cos(an) * qr * 0.98, Y = qy + Math.sin(an) * qr * 0.3;
        if (front) { on ? sw.lineTo(X, Y) : sw.moveTo(X, Y); on = true; } else on = false; } }
    c.lineJoin = 'round'; c.strokeStyle = P.ink; c.lineWidth = R * 0.075; c.stroke(sw);
    c.strokeStyle = 'rgba(255,226,170,0.95)'; c.lineWidth = R * 0.03; c.stroke(sw);
    c.restore();
    c.fillStyle = P.ink; c.beginPath();
    for (let j = 0; j < 6; j++) { const v = 0.15 + 0.75 * (j / 5), [qx, qy, qr] = at(v), q = -A.spin * 1.4 + j * 2.3, rr = qr * 1.35 + R * 0.06;
      if (Math.sin(q) < -0.3) continue;
      streak(c, qx + Math.cos(q) * rr, qy + Math.sin(q) * rr * 0.3, qx + Math.cos(q - 0.7) * rr, qy + Math.sin(q - 0.7) * rr * 0.3, R * 0.035 * s, 0.3); }
    c.fill();
    c.strokeStyle = P.ink; c.lineJoin = 'round'; c.lineWidth = R * 0.028; c.stroke(sh);
    for (let i = 0; i < 3; i++) { const q = t * 1.2 + i * TAU / 3; puff(c, top[0] + Math.cos(q) * top[2] * 0.8, top[1] - R * 0.04 + Math.sin(q) * top[2] * 0.22, R * (0.2 + 0.05 * Math.sin(i * 1.9 + t * 2)) * s, true); }
    for (let i = 0; i < 3; i++) { const q = t * 1.6 + i * TAU / 3; if (Math.sin(q) >= 0) puff(c, bx + Math.cos(q) * R * 0.42 * (0.6 + s * 0.4), by + Math.sin(q) * R * 0.12, R * 0.15 * s, true); }
    // lava chips sucked up the column
    for (let j = 0; j < 5; j++) {
      const q = (t * 0.4 + j / 5) % 1, hv = q * 0.85, [rcx, rcy, rr0] = ring(hv), rr = rr0 * 1.45, an = A.spin * 1.2 + j * 1.7 + q * 5;
      const cx = rcx + Math.cos(an) * rr, cy = rcy + Math.sin(an) * rr * 0.3, z = Math.sin(q * Math.PI) * s * R * 0.13;
      if (z < 0.4) continue;
      const ch = poly([[cx - z, cy - z * 0.4], [cx + z * 0.2, cy - z], [cx + z, cy + z * 0.1], [cx - z * 0.1, cy + z * 0.8]]);
      c.fillStyle = j % 2 ? P.hot : '#ffc23e'; c.fill(ch); c.strokeStyle = P.ink; c.lineWidth = z * 0.4; c.stroke(ch);
    }
  }
  // LASER, a heat ray. Aim: the telegraph below, low-key and in the world; the eyes run hot. Fire: each ray a candy-striped red bar from its eye to its own ground point, the
  // points walking side by side from the boss's feet through the player and on; where each bites, a flickering burn and
  // a splash of molten drops; behind it the lane it scorched, hot at the bite and cooling to soot
  // the aim (r32 E): the four lanes it will walk catch fire in the cartoon's way, a row of little inked flame licks on the
  // floor that pop up in turn as a pulse of heat marches away from the boss, bounce, boil with the line and sink back to a
  // soot flick; fading with distance
  function tele(c, R, t, u, A, over) {
    const k = A.aim, K = A.track; if (over || k < 0.01) return;
    const step = R * 0.42, n = Math.floor(K.len / step), bv = Math.floor(t * 5);
    c.lineJoin = 'round'; c.lineCap = 'round';
    A.beams.forEach((b, i) => { for (let j = 1; j <= n; j++) {
      const d = j * step, f = k * (1 - 0.65 * d / K.len), X = b.start.x + K.dx * d + R * 0.025 * (hh(j + bv, i) - 0.5), Y = b.start.y + K.dy * d;
      const q = ((j * 0.18 - t * 1.6 + i * 0.07) % 1 + 1) % 1, pop = q < 0.35 ? Math.sin(q / 0.35 * Math.PI) : 0, bo = pop * (1 + 0.25 * Math.sin(q * 40));
      // the soot it leaves: a little inked smoke curl, each one turned its own way
      { const a0 = hh(j, i + 7) * TAU; c.strokeStyle = 'rgba(28,18,13,' + (0.3 * f).toFixed(3) + ')'; c.lineWidth = R * 0.022;
        c.beginPath(); c.arc(X, Y - R * 0.02, R * 0.035, a0, a0 + 3.6); c.stroke(); }
      if (bo < 0.03) continue;
      const h = R * 0.2 * bo, w = R * 0.07 * (0.6 + 0.4 * bo), sw = R * 0.03 * Math.sin(t * 13 + j + i), fl = new Path2D();
      fl.moveTo(X + sw, Y - h); fl.quadraticCurveTo(X + w * 1.3, Y - h * 0.3, X, Y); fl.quadraticCurveTo(X - w * 1.3, Y - h * 0.3, X + sw, Y - h); fl.closePath();
      const ih = h * 0.55, inn = new Path2D(); inn.moveTo(X + sw * 0.6, Y - ih); inn.quadraticCurveTo(X + w * 0.6, Y - ih * 0.25, X, Y - R * 0.005); inn.quadraticCurveTo(X - w * 0.6, Y - ih * 0.25, X + sw * 0.6, Y - ih); inn.closePath();
      c.globalAlpha = Math.min(1, 0.7 * f);
      c.fillStyle = P.hot; c.fill(fl); c.fillStyle = '#ffd66e'; c.fill(inn);
      c.strokeStyle = P.ink; c.lineWidth = R * 0.022; c.stroke(fl);
      c.globalAlpha = 1; } });
  }
  function laserUnder(c, x, y, R, t, u, A) {
    const { fire, scorch } = A;
    c.lineCap = 'round';
    tele(c, R, t, u, A, false);
    // the scorched lanes: soot the whole way, an ember line that is hottest at the bite and cools behind it
    if (A.sweep > 0 && scorch > 0.01) { const hk = 0.3 + 0.7 * fire;
      for (const b of A.beams) { const dl = Math.hypot(b.end.x - b.start.x, b.end.y - b.start.y); if (dl < 1) continue;
        c.strokeStyle = 'rgba(28,18,13,' + (0.75 * scorch).toFixed(3) + ')'; c.lineWidth = R * 0.26; c.beginPath(); c.moveTo(b.start.x, b.start.y); c.lineTo(b.end.x, b.end.y); c.stroke();
        for (let k = 0; k < 10; k++) { const v0 = k / 10, v1 = (k + 1) / 10, h = Math.pow(v1, 2.2) * hk;
          const x0 = lerp(b.start.x, b.end.x, v0), y0 = lerp(b.start.y, b.end.y, v0), x1 = lerp(b.start.x, b.end.x, v1), y1 = lerp(b.start.y, b.end.y, v1);
          c.strokeStyle = 'rgba(240,82,28,' + (scorch * (0.25 + 0.75 * h)).toFixed(3) + ')'; c.lineWidth = R * 0.13; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
          if (h > 0.05) { c.strokeStyle = 'rgba(255,214,110,' + (scorch * h).toFixed(3) + ')'; c.lineWidth = R * 0.045; c.stroke(); } } } }
    A.beams.forEach((b, i) => {
      if (A.pool > 0.01) lava(c, b.end.x, b.end.y, R * 0.3 * Math.sqrt(A.pool), A.pool);
      if (fire > 0.01) burn(c, b.end.x, b.end.y, R, fire, t, i);
    });
  }
  function laserOver(c, x, y, R, t, u, A) {
    const { fire, track: K } = A;
    tele(c, R, t, u, A, true);
    A.beams.forEach((b, i) => {
      if (fire > 0.01) {
        const dx = Math.cos(b.a), dy = Math.sin(b.a), nx = -dy, ny = dx, w0 = b.w, w1 = b.w * 1.25, ex = b.end.x, ey = b.end.y;
        const beam = poly([[b.x + nx * w0, b.y + ny * w0], [ex + nx * w1, ey + ny * w1], [ex - nx * w1, ey - ny * w1], [b.x - nx * w0, b.y - ny * w0]]);
        under(c, beam, R * 0.07); c.fillStyle = P.eye; c.fill(beam);
        // candy stripes scrolling down the beam
        c.save(); c.clip(beam); c.strokeStyle = 'rgba(255,236,220,0.85)'; c.lineWidth = w1 * 0.7; c.beginPath();
        for (let k = -1; k < 14; k++) { const v = ((k + t * 6) % 14) / 13, px = lerp(b.x, ex, v), py = lerp(b.y, ey, v); c.moveTo(px + nx * w1 * 1.4, py + ny * w1 * 1.4 - w1 * 1.2); c.lineTo(px - nx * w1 * 1.4, py - ny * w1 * 1.4 + w1 * 1.2); }
        c.stroke(); c.restore();
        c.strokeStyle = P.ink; c.lineWidth = R * 0.035; c.stroke(beam);
        c.strokeStyle = P.glint; c.lineWidth = w0 * 0.75; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(ex - dx * w1, ey - dy * w1); c.stroke();
        impact(c, ex, ey, R, fire, A.sweep, t, i);
        for (let j = 0; j < 2; j++) { const q = (t * 1.3 + j / 2 + i * 0.37) % 1, z = R * 0.13 * fire * Math.sin(q * Math.PI);
          smoke(c, ex - K.dx * R * 0.9 * q + Math.sin(q * 5 + i) * R * 0.06, ey - K.dy * R * 0.9 * q - R * (0.25 + 0.7 * q), z); }
        // embers spat along the beam: gold sparks, inked, drifting off its lower end
        for (let k = 0; k < 4; k++) { const q = (t * 2.2 + k / 4 + i * 0.29) % 1, v = 0.55 + 0.45 * q, o = (k % 2 ? 1 : -1) * (w1 + R * 0.12 * q), z = R * 0.055 * fire * Math.sin(q * Math.PI);
          if (z < 0.5) continue; const px = lerp(b.x, ex, v) + nx * o, py = lerp(b.y, ey, v) + ny * o - R * 0.2 * q;
          c.fillStyle = P.ink; c.beginPath(); c.arc(px + z * 0.2, py + z * 0.25, z * 1.35, 0, TAU); c.fill();
          c.fillStyle = k % 2 ? '#ffc23e' : P.hot; c.beginPath(); c.arc(px, py, z, 0, TAU); c.fill(); }
        c.fillStyle = P.glint; c.beginPath(); c.arc(b.x, b.y, R * 0.1 * fire, 0, TAU); c.fill(); c.strokeStyle = P.ink; c.lineWidth = R * 0.03; c.stroke();
      }
      if (A.smoke > 0.01) for (let j = 0; j < 3; j++) { const q = (t * 0.6 + j / 3) % 1;
        puff(c, b.x + Math.sin(q * 4 + i) * R * 0.08 + Math.sign(b.x - x) * R * 0.3 * q, b.y - R * (0.3 + 0.6 * q), R * 0.07 * A.smoke * Math.sin(q * Math.PI)); }
    });
  }

  return {
    bg(c, w, t) {
      const key = 'bg' + w;
      if (!pool[key]) {
        // the Mantle's floor: orange marbled paper (domain-warped value noise, toned like the level's watercolour)
        const n = Math.ceil(w / 2), cv = pool[key] = mk(w, w), lo = mk(n, n), lg = lo.getContext('2d'), im = lg.createImageData(n, n);
        const vn = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, s = u * u * (3 - 2 * u), q = v * v * (3 - 2 * v);
          const a = hh(i, j), b = hh(i + 1, j), cc = hh(i, j + 1), d = hh(i + 1, j + 1); return a + (b - a) * s + (cc - a) * q + (a - b - cc + d) * s * q; };
        const fb = (x, y) => vn(x, y) * 0.55 + vn(x * 2.1 + 3, y * 2.1) * 0.28 + vn(x * 4.3, y * 4.3 + 5) * 0.17;
        const C = [[156, 58, 32], [190, 82, 40], [214, 116, 58], [232, 152, 86], [240, 176, 104]];
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          const X = x / n * 3.2, Y = y / n * 3.2, v = fb(X + 1.6 * fb(X + 5, Y), Y + 1.6 * fb(X, Y + 7));
          const k = Math.min(3.999, Math.max(0, (v - 0.28) * 9)), i = Math.floor(k), fr = k - i;
          const line = Math.abs(((v * 14) % 1) - 0.5) > 0.47 ? 0.82 : 1, gr = 0.94 + 0.08 * hh(x * 3, y * 7);
          const o = (y * n + x) * 4; for (let ch = 0; ch < 3; ch++) im.data[o + ch] = (C[i][ch] + (C[i + 1][ch] - C[i][ch]) * fr) * line * gr;
          im.data[o + 3] = 255;
        }
        lg.putImageData(im, 0, 0);
        const g = cv.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(lo, 0, 0, w, w);
        for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(255,214,140,' + (0.35 + 0.3 * hh(k, 2)) + ')'; g.beginPath(); g.arc(hh(k, 9) * w, hh(9, k) * w, 1.2 + 3 * hh(k, 4), 0, TAU); g.fill(); }
      }
      c.drawImage(pool[key], 0, 0, w, w);
    },
    boss(c, x, y, R, t, ph = 3) { draw(c, x, y, R, t, ph, RIG.pose(t, ph), {}); },
    reveal,
    attack,
    post(c, w, t) {
      // the film's warm sepia vignette
      const g = c.createRadialGradient(w / 2, w / 2, w * 0.3, w / 2, w / 2, w * 0.75);
      g.addColorStop(0, 'rgba(60,35,10,0)'); g.addColorStop(1, 'rgba(60,35,10,0.45)'); c.fillStyle = g; c.fillRect(0, 0, w, w);
    },
  };
})();
