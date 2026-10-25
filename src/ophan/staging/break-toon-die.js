// round 1's breaks, back as C and D: a break is this skin dying for good
// THE BREAK, the Mantle (toon): the broken skin comes apart in this world's own medium while the next skin shows under it.
// Owner ruling 2026-10-25: 0.12 s hit-stop (the sim's), then 0.8 s; the looks below are the playground's candidates.
import { stage, ease, win, hash } from '../staging.js'

const TAU = Math.PI * 2
// the toon painter's palette (src/ophan/painters/toon.js P)
const INK = '#1c120d', CREAM = '#f7efdc', GLOSS = 'rgba(255,248,228,0.9)'
const SPLAT = ['#c8322a', '#f0521c', '#e0a64e', '#9a4f22', '#a8200f']
const out = (u) => 1 - (1 - u) * (1 - u)
// px2d c with `pre` laid on it right after the painter's own begin (drawBoss resets the context first): a transform, a clip
const under = (c, pre) => new Proxy(c, {
  get: (t, p) => p === 'begin' ? () => { t.begin(); pre(t) } : typeof t[p] === 'function' ? t[p].bind(t) : t[p],
  set: (t, p, v) => { t[p] = v; return true },
})
// a wobbly closed blob round (x, y), rx along angle a, ry across it, smoothed through its edge midpoints
function blob(c, x, y, rx, ry, a, seed, wob = 0.35, n = 14) {
  const ca = Math.cos(a), sa = Math.sin(a), P = []
  for (let j = 0; j < n; j++) {
    const t = (j / n) * TAU, r = 1 + wob * (hash(seed, j) - 0.5), lx = Math.cos(t) * rx * r, ly = Math.sin(t) * ry * r
    P.push([x + lx * ca - ly * sa, y + lx * sa + ly * ca])
  }
  const m = (i) => { const p = P[i % n], q = P[(i + 1) % n]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] }
  c.beginPath(); c.moveTo(...m(n - 1))
  for (let j = 0; j < n; j++) c.quadraticCurveTo(P[j][0], P[j][1], ...m(j))
  c.closePath()
}
const inked = (c, fill, lw) => { c.fillStyle = fill; c.fill(); c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = lw; c.stroke() }
// the next skin pops in under it
const pop = (k, a, b) => { const r = ease(win(k.u, a, b)); k.boss.alpha = r; k.boss.scale = 0.82 + 0.18 * r }

// ---- A: the skin bursts like a cartoon ink balloon: a starburst, bold inked splats flying out with motion lines, splatted
// on the floor where they land, fading
stage('break', 'toon:C', { world: 'toon', label: 'C · (round 1, it dies) ink splash: inked splats burst out and splatter the floor', draw(k) {
  const { u, x, y, R } = k, lw = R * 0.045
  pop(k, 0.1, 0.5)
  // the old skin swells and is gone
  const sw = win(u, 0, 0.12)
  if (sw < 1) { k.fadePx(0, 1 - sw, 1 + 0.16 * sw, x, y); k.drawBoss(k.from, k.px(0), x, y, R, k.ph0) }
  const c = k.px(1), f = k.floor
  // the pop: an inked cream starburst, quick
  const sb = win(u, 0.03, 0.22)
  if (sb > 0 && sb < 1) {
    const rr = R * (0.6 + 0.65 * out(sb)), n = 11
    c.globalAlpha = 0.85 * (1 - sb * sb)
    c.beginPath()
    for (let j = 0; j < n * 2; j++) { const a = (j / (n * 2)) * TAU + 0.2, r = j % 2 ? rr * 0.62 : rr * (0.9 + 0.2 * hash(j, 7)); j ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r) }
    c.closePath(); inked(c, CREAM, lw)
    c.globalAlpha = 1
  }
  const N = 12, fade = 1 - win(u, 0.62, 0.98)
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + (hash(i, 1) - 0.5) * 0.45, D = R * (1.3 + 0.95 * hash(i, 2)), s = R * (0.15 + 0.12 * hash(i, 3))
    const tl = 0.26 + 0.14 * hash(i, 4), p = win(u, 0.04, tl), col = SPLAT[i % SPLAT.length]
    const ca = Math.cos(a), sa = Math.sin(a)
    if (p >= 1) {
      // the splat on the floor: flattened wide, with satellite drops further out
      const g = win(u, tl, tl + 0.06), sc = 0.55 + 0.45 * out(g), px = x + ca * D, py = y + sa * D
      f.globalAlpha = fade
      blob(f, px, py, s * 1.55 * sc, s * 1.25 * sc, a, i + 40, 0.55, 16); inked(f, col, lw * 0.85)
      for (let j = 0; j < 3; j++) {
        const da = (hash(i, 10 + j) - 0.5) * 0.9, dd = s * (1.9 + 0.9 * hash(i, 20 + j)) * sc, ds = s * (0.18 + 0.2 * hash(i, 30 + j))
        f.beginPath(); f.arc(px + Math.cos(a + da) * dd, py + Math.sin(a + da) * dd, ds, 0, TAU); inked(f, col, lw * 0.6)
      }
      f.fillStyle = GLOSS; f.beginPath(); f.ellipse(px - s * 0.45 * sc, py - s * 0.4 * sc, s * 0.32 * sc, s * 0.16 * sc, -0.6, 0, TAU); f.fill()
      f.globalAlpha = 1
      continue
    }
    if (p <= 0) continue
    // in flight: a stretched drop, an arc up off the floor (it swells mid-flight), motion lines behind it
    const r = R * 0.35 + (D - R * 0.35) * (1 - Math.pow(1 - p, 2.2)), px = x + ca * r, py = y + sa * r
    const lift = 1 + 0.35 * Math.sin(Math.PI * p), st = 1 - p
    c.strokeStyle = INK; c.lineCap = 'round'; c.lineWidth = lw * 0.8; c.globalAlpha = st
    for (let j = -1; j <= 1; j++) {
      const ox = -sa * j * s * 0.6, oy = ca * j * s * 0.6, l0 = s * (1.3 + 0.3 * Math.abs(j)), l1 = l0 + R * (0.25 + 0.45 * st) * (1 - 0.3 * Math.abs(j))
      c.beginPath(); c.moveTo(px - ca * l0 + ox, py - sa * l0 + oy); c.lineTo(px - ca * l1 + ox, py - sa * l1 + oy); c.stroke()
    }
    c.globalAlpha = 1
    blob(c, px, py, s * lift * (1 + 0.7 * st), s * lift * (1 - 0.2 * st), a, i + 70, 0.25, 12); inked(c, col, lw)
    c.fillStyle = GLOSS; c.beginPath(); c.ellipse(px - s * 0.35, py - s * 0.35, s * 0.3 * lift, s * 0.14 * lift, -0.6, 0, TAU); c.fill()
  }
} })

// ---- B: the skin rips like a cel along a jagged line, the halves fly apart with speed lines, paper flecks off the tear
stage('break', 'toon:D', { world: 'toon', label: 'D · (round 1, it dies) cartoon tear: the skin rips in two, halves fly off', draw(k) {
  const { u, x, y, R } = k, lw = R * 0.045
  pop(k, 0.16, 0.6)
  // the tear: a zigzag through the boss, near vertical; its halves leave along its normal
  const th = 1.35 + (hash(k.from?.id?.length ?? 3, 5) - 0.5) * 0.5, tx = Math.cos(th), ty = Math.sin(th), nx = -ty, ny = tx
  const Z = []
  for (let j = 0; j <= 10; j++) { const t = (j / 10 - 0.5) * 3.4 * R, o = (j % 2 ? 1 : -1) * R * (0.07 + 0.08 * hash(j, 3)); Z.push([x + tx * t + nx * o, y + ty * t + ny * o]) }
  const fly = win(u, 0.12, 0.85), d = R * 0.04 * win(u, 0, 0.12) + R * 1.6 * out(fly), al = 1 - win(u, 0.45, 0.85)
  const shake = (1 - win(u, 0.06, 0.14)) * win(u, 0, 0.04) * R * 0.03 * Math.sin(u * 300)
  const half = (i, side) => {
    const ox = nx * side * d + tx * shake, oy = ny * side * d + ty * shake, rot = side * 0.45 * out(fly)
    return { ox, oy, rot, xf: (c) => { c.translate(x + ox, y + oy); c.rotate(rot); c.translate(-x, -y) } }
  }
  const H = [half(0, -1), half(2, 1)]
  if (al > 0) for (const [n, side] of [[0, -1], [2, 1]]) {
    const h = H[n ? 1 : 0], far = 4 * R
    k.fadePx(n, al)
    k.drawBoss(k.from, under(k.px(n), (c) => {
      c.save(); h.xf(c)
      c.beginPath(); c.moveTo(Z[0][0] - tx * far, Z[0][1] - ty * far)
      for (const p of Z) c.lineTo(p[0], p[1])
      c.lineTo(Z[10][0] + tx * far, Z[10][1] + ty * far)
      c.lineTo(Z[10][0] + tx * far + nx * side * far, Z[10][1] + ty * far + ny * side * far)
      c.lineTo(Z[0][0] - tx * far + nx * side * far, Z[0][1] - ty * far + ny * side * far)
      c.closePath(); c.clip()
    }), x, y, R, k.ph0)
    k.px(n).restore()
  }
  const c = k.px(1)
  // speed lines: ink dashes trailing from each half back over the gap, long while it is fast
  const sp = 1 - fly
  if (fly > 0 && fly < 1) for (const [n, side] of [[0, -1], [1, 1]]) {
    const h = H[n]
    c.strokeStyle = INK; c.lineCap = 'round'; c.lineWidth = lw * 0.75; c.globalAlpha = sp * 0.9
    for (let j = 0; j < 6; j++) {
      const t = (j / 5 - 0.5) * 2.2 * R + (hash(j, n + 9) - 0.5) * 0.3 * R, gap = R * (0.15 + 0.25 * hash(j, n + 4))
      const bx = x + tx * t + h.ox - nx * side * gap, by = y + ty * t + h.oy - ny * side * gap, L = R * (0.35 + 0.9 * sp) * (0.6 + 0.5 * hash(j, n + 2))
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - nx * side * L, by - ny * side * L); c.stroke()
    }
    c.globalAlpha = 1
  }
  // the torn edge: a cream paper rim along the cut, inked on its outer side, riding each half
  if (al > 0) for (const [n, side] of [[0, -1], [1, 1]]) {
    const h = H[n]
    c.save(); h.xf(c); c.globalAlpha = al * win(u, 0, 0.05)
    c.lineJoin = 'round'; c.lineCap = 'round'
    const path = (off) => { c.beginPath(); Z.slice(3, 8).forEach((p, i) => (i ? c.lineTo : c.moveTo).call(c, p[0] + nx * side * off, p[1] + ny * side * off)) }
    path(R * 0.03); c.strokeStyle = CREAM; c.lineWidth = R * 0.09; c.stroke()
    path(R * 0.085); c.strokeStyle = INK; c.lineWidth = lw * 0.6; c.stroke()
    c.restore(); c.globalAlpha = 1
  }
  // paper flecks off the tear: little inked cream triangles spinning away
  const fl = win(u, 0.1, 0.6)
  if (fl > 0 && fl < 1) for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1, t = (hash(i, 1) - 0.5) * 2 * R, sz = R * (0.06 + 0.06 * hash(i, 2)), dd = R * (0.2 + 1.1 * hash(i, 3)) * out(fl)
    const px = x + tx * (t + side * 0.3 * dd) + nx * side * dd, py = y + ty * (t + side * 0.3 * dd) + ny * side * dd, rot = hash(i, 4) * TAU + fl * 6 * side
    c.globalAlpha = 1 - fl * fl; c.beginPath()
    for (let j = 0; j < 3; j++) { const a = rot + (j / 3) * TAU, r = sz * (0.7 + 0.6 * hash(i, 5 + j)); j ? c.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r) : c.moveTo(px + Math.cos(a) * r, py + Math.sin(a) * r) }
    c.closePath(); inked(c, CREAM, lw * 0.5)
    c.globalAlpha = 1
  }
} })
