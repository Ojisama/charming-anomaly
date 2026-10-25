// The staging looks (src/ophan/staging.js). Each draws in the boss's slot's stage px, through px2d (the painters' own
// Canvas2D-shaped context) and the sprite layer, so a look the owner picks in the playground IS the one the fight draws.
import { stage, ease, win, clamp01 } from '../staging.js'

const TAU = Math.PI * 2
// a tear in the floor round (x, y): a jagged dark slit w wide and h tall, its lip lit in col; open 0..1
function tear(c, x, y, w, h, open, col, seed = 1) {
  if (open <= 0) return
  const n = 22, pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, j = 0.78 + 0.22 * Math.abs(Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453 % 1)
    pts.push([x + Math.cos(a) * w * 0.5 * j * open, y + Math.sin(a) * h * 0.5 * j * open])
  }
  const path = () => { c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath() }
  // a hole with depth: black at its heart, the floor's own dark at its lip, a thin dim rim of the world's colour
  const g = c.createRadialGradient(x, y, 0, x, y, w * 0.5 * open)
  g.addColorStop(0, 'rgba(4,3,6,1)'); g.addColorStop(0.55, 'rgba(8,6,10,0.92)'); g.addColorStop(1, 'rgba(10,8,12,0.35)')
  c.globalAlpha = 1
  path(); c.fillStyle = g; c.fill()
  c.lineWidth = Math.max(1, w * 0.012); c.strokeStyle = col; c.globalAlpha = 0.45 * Math.min(1, open * 1.5); path(); c.stroke()
  c.globalAlpha = 1
}
// the six skins in fight order from k, landing on `last`: which one shows at s (0..1 of the flip)
const flipAt = (k, s, last, laps = 1) => {
  const n = k.worlds.length, steps = n * laps, i = Math.min(steps, Math.floor(s * (steps + 1)))
  return (last - steps + i + n * 4) % n
}
const wornK = (k) => Math.max(0, k.worlds.findIndex((w) => w.look === k.S.id))

// ---- THE ARRIVAL: 3 s, harmless. The floor tears, the boss rises out of it flipping through all six skins and lands on
// the one it wears; the tear closes under it. Owner ruling 2026-10-25.
const rise = (k, a, b) => { const r = ease(win(k.u, a, b)); k.boss.scale = 0.55 + 0.45 * r; k.boss.alpha = r; return r }
const tearOf = (k, open) => tear(k.floor, k.x, k.y + k.R * 0.15, k.R * 3.2, k.R * 1.1, open, k.col(k.boss.S))

stage('arrive', 'A', { label: 'A · even flip: one skin each 0.2 s, then lands', draw(k) {
  const open = win(k.u, 0, 0.12) * (1 - win(k.u, 0.8, 1))
  tearOf(k, ease(open))
  rise(k, 0.08, 0.55)
  const s = win(k.u, 0.08, 0.6)
  if (s < 1) k.boss.S = k.look(flipAt(k, s, wornK(k)))
} })

stage('arrive', 'B', { label: 'B · slot machine: fast flips that slow and settle, a ring per skin', draw(k) {
  const open = win(k.u, 0, 0.12) * (1 - win(k.u, 0.8, 1))
  // slows down: the flip's own clock is eased out, two laps
  const s = 1 - Math.pow(1 - win(k.u, 0.06, 0.7), 2.2), i = flipAt(k, s, wornK(k), 2)
  if (s < 1) k.boss.S = k.look(i)
  tearOf(k, ease(open))
  rise(k, 0.06, 0.5)
  // a ring off the tear in the shown skin's colour, every flip
  const c = k.px(1), steps = k.worlds.length * 2, f = s * (steps + 1) % 1
  if (s < 1) { c.globalAlpha = 0.6 * (1 - f); c.strokeStyle = k.col(k.boss.S); c.lineWidth = 3 * k.z; c.beginPath(); c.ellipse(k.x, k.y + k.R * 0.15, k.R * (1.2 + f * 0.9), k.R * (0.42 + f * 0.3), 0, 0, TAU); c.stroke(); c.globalAlpha = 1 }
} })

stage('arrive', 'C', { label: 'C · crossfade: each skin melts into the next as it rises', draw(k) {
  const open = win(k.u, 0, 0.12) * (1 - win(k.u, 0.8, 1))
  tearOf(k, ease(open))
  const r = rise(k, 0.08, 0.6), s = win(k.u, 0.08, 0.7)
  if (s >= 1) return
  const n = k.worlds.length, pos = s * n, i = Math.floor(pos), f = ease(pos - i), worn = wornK(k)
  const cur = (worn - n + i + n * 4) % n, nxt = (cur + 1) % n
  // the boss is the incoming skin; the outgoing one fades over it in a spare px2d
  k.boss.S = k.look(nxt)
  k.boss.alpha = r * f
  const sc = 0.55 + 0.45 * r
  k.fadePx(2, r * (1 - f), sc, k.x, k.y)
  k.drawBoss(k.look(cur), k.px(2), k.x, k.y, k.R, k.ph)
} })

import './beats.js'
import './break-macro.js'
import './break-holo.js'
import './break-ascii.js'
import './break-pixel.js'
import './break-toon.js'
import './break-liquid.js'
export { tear, flipAt, wornK, clamp01 }
