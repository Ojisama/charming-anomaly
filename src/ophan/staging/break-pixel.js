// THE BREAK, the Magma (pixel): the broken skin is SHED, thrown off the boss in this world's own medium, while the next
// skin stands whole under it from the first frame (never a collapse, a melt or a puddle: those read as its death).
// Owner ruling 2026-10-25: 0.12 s hit-stop (the sim's), then 0.8 s; the looks below are the playground's candidates.
// The broken skin is read once into chunky cells (break-ascii.js cellsOf) and every cell is one flat square in the
// world's palette. Time moves in steps (a sprite sheet's frames) and a cell leaves by a 4x4 ordered dither, never a fade.
import { stage, win, hash } from '../staging.js'
import { cellsOf } from './break-ascii.js'

// white-hot -> cooled lava (painters/pixel.js LV)
const HEAT = ['#2c2430', '#40091a', '#7a1004', '#d8340c', '#ff6a14', '#ffa22a', '#ffd858', '#fff4c4']
const heatCol = (h) => HEAT[Math.max(0, Math.min(HEAT.length - 1, Math.floor(h * HEAT.length)))]
const hex = (q) => '#' + [q.r, q.g, q.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
// a square snapped to the stage px grid, so a chunk stays a chunk
const sq = (c, x, y, s) => { const w = Math.max(1, Math.round(s)); c.fillRect(Math.round(x - w / 2), Math.round(y - w / 2), w, w) }
// the beat in sprite frames: 16 over its 0.8 s
const step = (u) => Math.floor(u * 16) / 16
// a 4x4 ordered dither: cell (i, j) is still drawn at coverage a
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const on = (i, j, a) => a > (BAYER[(i & 3) + ((j & 3) << 2)] + 0.5) / 16
const out = (u, p = 2) => 1 - Math.pow(1 - u, p)
const whole = (k) => k.drawBoss(k.from, k.px(2), k.x, k.y, k.R, Math.round(k.ph0 ?? k.ph))

// ---- A: a pixel blast. The skin flashes white-hot and every cell of it is blown radially off the boss in stepped
// frames, a ring of hot squares leading it out, each cell leaving a one-frame afterimage and dithering away.
stage('break', 'pixel:A', { world: 'pixel', label: 'A · pixel blast: the skin is blown off in a stepped shockwave', draw(k) {
  const T = step(k.u), c = k.px(1), P = k.R * 0.1
  if (T < 0.0625) { whole(k); return }
  const pos = (q, t) => {
    const h1 = hash(q.i, q.j), h2 = hash(q.j + 31, q.i + 7), d = Math.hypot(q.ox, q.oy)
    const go = out(win(t, 0.06 + 0.04 * h1, 0.75), 1.6), a = Math.atan2(q.oy, q.ox) + (h2 - 0.5) * 0.35
    const fly = go * (k.R * (1.4 + 1.2 * h2) + d * 1.6)
    return [k.x + P * Math.round((q.ox + Math.cos(a) * fly) / P), k.y + P * Math.round((q.oy + Math.sin(a) * fly) / P)]
  }
  // the shockwave: a ring of hot squares on the grid, ahead of the cells, thinning out by dither as it widens
  const rw = win(T, 0.06, 0.6), rr = k.R * (0.6 + 2.6 * out(rw)), ra = 1 - win(T, 0.25, 0.6)
  if (ra > 0) {
    const n = Math.ceil((rr * Math.PI * 2) / P)
    for (let j = 0; j < n; j++) for (let w = 0; w < 2; w++) {
      if (!on(j, w + Math.round(rr / P), ra)) continue
      const a = (j / n) * Math.PI * 2, r = rr - w * P
      c.fillStyle = heatCol(w ? 0.7 : 0.95); sq(c, k.x + P * Math.round(Math.cos(a) * r / P), k.y + P * Math.round(Math.sin(a) * r / P), P)
    }
  }
  const heat = 1 - win(T, 0.06, 0.4), gone = win(T, 0.3, 0.7), prev = T - 1 / 16
  for (const q of cellsOf(k, P)) {
    const h1 = hash(q.i, q.j)
    if (!on(q.i, q.j, 1 - gone * (0.8 + 0.4 * h1))) continue
    const [x, y] = pos(q, T)
    // the frame before, a smear of lava behind every other cell while it is fast
    if (prev > 0.06 && T < 0.6 && (q.i + q.j) % 2 === 0) { const [px, py] = pos(q, prev); if (px !== x || py !== y) { c.fillStyle = heatCol(0.6); sq(c, px, py, P * 0.7) } }
    c.fillStyle = heat > 0.5 ? heatCol(0.75 + 0.25 * q.l) : hex(q)
    sq(c, x, y, P + 1)
  }
} })

// the shell of the cell set: each cell's depth from the silhouette's edge (0 the outline), read once per cell list
const depths = new WeakMap()
function depthOf(L) {
  let D = depths.get(L)
  if (D) return D
  const at = new Map(L.map((q) => [q.i + ',' + q.j, q])), N = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  D = new Map()
  let front = L.filter((q) => N.some(([a, b]) => !at.has((q.i + a) + ',' + (q.j + b))))
  for (let d = 0; front.length; d++) {
    for (const q of front) D.set(q, d)
    const next = []
    for (const q of front) for (const [a, b] of N) { const n = at.get((q.i + a) + ',' + (q.j + b)); if (n && !D.has(n) && !next.includes(n)) next.push(n) }
    front = next
  }
  depths.set(L, D)
  return D
}
// ---- B: the shell pops. The skin's outline lets go of the boss as a hollow pixel shell: it pops outward in stepped,
// ever chunkier frames (a sprite scaled up a notch a frame), hot at its rim, sparks thrown ahead of it, and dithers away.
const SC = [1, 1.16, 1.36, 1.62, 1.94, 2.32, 2.76, 3.2]
stage('break', 'pixel:B', { world: 'pixel', label: 'B · shell pop: a hollow pixel shell pops off and expands', draw(k) {
  const u = k.u, c = k.px(1), P = k.R * 0.1, n = Math.min(SC.length - 1, Math.floor(win(u, 0.05, 0.8) * SC.length)), s = SC[n]
  if (n === 0) { whole(k); return }
  const L = cellsOf(k, P), D = depthOf(L), al = 1 - win(n, 3, SC.length - 1)
  for (const q of L) {
    const d = D.get(q)
    // the first frame still has the body, its inside going by half; after it the shell alone, two cells thick
    if (d > 1 && (n > 1 || (q.i + q.j) % 2)) continue
    if (!on(q.i, q.j, al)) continue
    c.fillStyle = d === 0 && n < 5 ? heatCol(0.85 + 0.15 * q.l) : hex(q)
    sq(c, k.x + q.ox * s, k.y + q.oy * s, P * s + 1)
  }
  // the sparks: hot squares flung ahead of the shell, a stepped streak each
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + hash(i, 3) * 0.3, r = k.R * (1.3 + 0.4 * hash(i, 4)) * s * (1 + 0.15 * hash(i, 5))
    if (!on(i, i * 3, 1 - win(n, 2, SC.length - 2))) continue
    for (let j = 0; j < 3; j++) { c.fillStyle = heatCol(0.95 - 0.2 * j); sq(c, k.x + Math.cos(a) * (r - j * P * 1.2), k.y + Math.sin(a) * (r - j * P * 1.2), P * (1 - 0.2 * j)) }
  }
} })
export { win, hash }
