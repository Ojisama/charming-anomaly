// The staging looks (src/ophan/staging.js). Each draws in the boss's slot's stage px, through px2d (the painters' own
// Canvas2D-shaped context) and the sprite layer, so a look the owner picks in the playground IS the one the fight draws.
import { stage, ease, win, clamp01, hash } from '../staging.js'
import { hole } from './hole.js'

const TAU = Math.PI * 2
// a hole in the floor round (x, y), w wide and h tall at open 1, in the shown world's medium (look: its look id); open 0..1
const tear = (c, x, y, w, h, open, look, seed = 1) => hole(c, look, x, y, w, h, open, seed)
// ---- THE ARRIVAL: 3 s, harmless. The floor opens and the boss climbs out of it in the skin it wears, and no other: the
// five to come stay unseen until each is reached. Owner rulings 2026-10-25.
const rise = (k, a, b) => { const r = ease(win(k.u, a, b)); k.boss.scale = 0.55 + 0.45 * r; k.boss.alpha = r; return r }
export const HY = 0.15, HW = 2.6, HH = 1.5   // the hole under the boss: its centre below the boss, its width and depth in R
const tearOf = (k, open) => tear(k.floor, k.x, k.y + k.R * HY, k.R * HW, k.R * HH, open, k.A.id)
// the hole's mouth as a clip: what is still below the floor shows only through it
const mouth = (k, open) => (c) => c.ellipse(k.x, k.y + k.R * HY, k.R * HW * 0.46 * open, k.R * HH * 0.46 * open, 0, 0, TAU)

stage('arrive', 'A', { label: 'A · climbs out: seen deep in the hole first, it clears the lip and stands', draw(k) {
  const open = ease(win(k.u, 0, 0.15)) * (1 - ease(win(k.u, 0.75, 1)))
  tearOf(k, open)
  // depth 1 at the bottom of the hole, 0 once it stands on the floor: small and dark down there, clipped by the mouth
  const d = 1 - ease(win(k.u, 0.1, 0.62))
  if (d <= 0) return
  k.boss.hide = true
  const R = k.R * (1 - 0.45 * d), y = k.y + k.R * HY * d, c = k.px(0)
  const clip = d > 0.35 ? mouth(k, open) : null
  k.drawBoss(k.S, c, k.x, y, R, k.ph, clip)
  // the shade of the pit over it, lifting as it climbs
  const s = k.px(1)
  s.save(); s.beginPath(); mouth(k, open)(s); s.clip()
  s.globalAlpha = 0.85 * win(d, 0.3, 1); s.fillStyle = '#050407'
  s.beginPath(); s.rect(k.x - k.R * 2, k.y - k.R * 2, k.R * 4, k.R * 4); s.fill()
  s.restore(); s.globalAlpha = 1
} })

stage('arrive', 'B', { label: 'B · bursts out: the floor bulges and cracks, it breaks through and earth flies off', draw(k) {
  const f = k.floor, cx = k.x, cy = k.y + k.R * HY, swell = win(k.u, 0, 0.35), burst = win(k.u, 0.35, 0.5)
  // the bulge: cracks running out from the centre, longer as it swells, a tremble on the boss's spot
  if (burst < 1) {
    // the ground domes up: lit on its top side, shadowed under; then cracks, each a dark slit over a lit lip
    const bw = k.R * 1.6 * ease(swell), fade = 1 - burst
    if (bw > 0) {
      const g = f.createRadialGradient(cx, cy - bw * 0.15, 0, cx, cy, bw)
      g.addColorStop(0, 'rgba(232,196,150,0.32)'); g.addColorStop(0.6, 'rgba(160,120,80,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)')
      f.globalAlpha = fade; f.fillStyle = g; f.beginPath(); f.ellipse(cx, cy, bw, bw * 0.5, 0, 0, TAU); f.fill()
      f.globalAlpha = 0.45 * fade; f.fillStyle = '#0b0806'; f.beginPath(); f.ellipse(cx, cy + bw * 0.42, bw * 0.85, bw * 0.12, 0, 0, TAU); f.fill()
    }
    f.lineCap = 'round'
    for (let i = 0; i < 9; i++) {
      const a = hash(i, 11) * TAU, L = k.R * (0.4 + 1.1 * hash(i, 12)) * ease(swell), lw = (3 - 1.5 * hash(i, 13)) * k.z
      const crack = (dy) => { f.beginPath(); f.moveTo(cx, cy + dy); for (let m = 1; m <= 4; m++) { const q = m / 4, w = (hash(i, m) - 0.5) * 0.5; f.lineTo(cx + Math.cos(a + w) * L * q, cy + dy + Math.sin(a + w) * L * q * 0.5) } f.stroke() }
      f.globalAlpha = 0.7 * fade; f.strokeStyle = '#d8b48a'; f.lineWidth = lw * 0.8; crack(lw * 0.7)
      f.globalAlpha = 0.95 * fade; f.strokeStyle = '#070504'; f.lineWidth = lw; crack(0)
    }
    f.globalAlpha = 1
  }
  tearOf(k, ease(burst) * (1 - ease(win(k.u, 0.78, 1))))
  if (k.u < 0.35) { k.boss.hide = true; return }
  // it pops up past full size and settles
  const p = win(k.u, 0.35, 0.62), over = 1 + 0.14 * Math.sin(Math.PI * Math.min(1, p * 1.4)) * (1 - p)
  k.boss.scale = (0.7 + 0.3 * ease(Math.min(1, p * 2))) * over; k.boss.alpha = Math.min(1, p * 4)
  // the earth it threw off, flying out and landing
  const c = k.px(1), q = win(k.u, 0.35, 0.8)
  if (q >= 1) return
  for (let i = 0; i < 26; i++) {
    const a = hash(i, 21) * TAU, d = k.R * (0.5 + 2.2 * hash(i, 22)) * ease(q), lift = Math.sin(Math.PI * q) * k.R * 0.5 * hash(i, 23)
    const X = cx + Math.cos(a) * d, Y = cy + Math.sin(a) * d * 0.45, r = (2 + 3.5 * hash(i, 24)) * k.z * (1 + 0.5 * Math.sin(Math.PI * q))
    c.globalAlpha = 1 - win(q, 0.7, 1)
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(X + r * 0.3, Y + r * 0.4, r, r * 0.6, 0, 0, TAU); c.fill()   // its shadow on the floor
    c.fillStyle = i % 3 ? '#6b4f35' : '#9a7a55'; c.beginPath(); c.arc(X, Y - lift, r, 0, TAU); c.fill()
    c.fillStyle = 'rgba(240,210,170,0.45)'; c.beginPath(); c.arc(X - r * 0.3, Y - lift - r * 0.3, r * 0.45, 0, TAU); c.fill()
  }
  c.globalAlpha = 1
} })

stage('arrive', 'C', { label: 'C · rises through dust: a plume from the hole thins and it is standing in it', draw(k) {
  const open = ease(win(k.u, 0, 0.12)) * (1 - ease(win(k.u, 0.8, 1)))
  tearOf(k, open)
  rise(k, 0.15, 0.6)
  const c = k.px(1), cx = k.x, cy = k.y + k.R * HY, g = win(k.u, 0.05, 0.95)
  if (g >= 1) return
  for (let i = 0; i < 22; i++) {
    const q = (g * 0.9 + hash(i, 31) * 0.35) % 1, a = hash(i, 32) * TAU, d = k.R * (0.3 + 1.4 * q) * (0.5 + hash(i, 33))
    c.globalAlpha = 0.32 * Math.sin(Math.PI * q) * (1 - win(k.u, 0.6, 0.95)) * win(k.u, 0.03, 0.15)
    c.fillStyle = i % 2 ? '#7a6a58' : '#5a4a3c'
    c.beginPath(); c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6 - q * k.R * 0.8, k.R * (0.35 + 0.5 * q) * (0.6 + hash(i, 34)), 0, TAU); c.fill()
  }
  c.globalAlpha = 1
} })

import './beats.js'
import './break-macro.js'
import './break-holo.js'
import './break-ascii.js'
import './break-pixel.js'
import './break-toon.js'
import './break-liquid.js'
export { tear, clamp01 }
