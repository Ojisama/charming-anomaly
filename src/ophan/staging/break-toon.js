// THE BREAK, the Mantle (toon): the skin is CHANGED, the cartoon way, while the next skin stands whole under it from the
// first frame. Nothing breaks, falls or flies apart (owner, 2026-10-25: plates flying off read as it being killed).
// Owner ruling 2026-10-25: 0.12 s hit-stop (the sim's), then 0.8 s; the looks below are the playground's candidates.
import { stage, ease, win, hash } from '../staging.js'

const TAU = Math.PI * 2
// the toon painter's palette (src/ophan/painters/toon.js P)
const INK = '#1c120d', CREAM = '#f7efdc', SHADE = '#d8c6a2', GOLD = '#f2c14e'
const out = (u) => 1 - (1 - u) * (1 - u)
const old = (k, clip) => k.drawBoss(k.from, k.px(0), k.x, k.y, k.R, k.ph0, clip)

// a five-point inked star
function star(c, x, y, r, rot, lw) {
  c.beginPath()
  for (let j = 0; j < 10; j++) { const a = rot + (j / 10) * TAU - Math.PI / 2, rr = j % 2 ? r * 0.45 : r; j ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) }
  c.closePath(); c.fillStyle = GOLD; c.fill(); c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = lw; c.stroke()
}

// ---- A: the quick-change. A cartoon dust cloud puffs up round the boss in a blink (round inked bubbles, stars and spark
// ticks flying off it), hides it for a moment and thins away bubble by bubble: the boss is standing there in its new skin.
// The old skin is only seen before the cloud closes over it.
const PUFF = Array.from({ length: 13 }, (_, i) => {
  const ring = i === 0 ? 0 : i < 5 ? 0.55 : 1, a = (i / (i < 5 ? 4 : 8)) * TAU + hash(i, 1) * 0.6
  return { ox: Math.cos(a) * ring * 1.15, oy: Math.sin(a) * ring * 0.8, r: (ring === 1 ? 0.5 : 0.65) * (0.85 + 0.3 * hash(i, 2)), t: 0.22 + 0.18 * hash(i, 3) + 0.06 * ring }
})
stage('break', 'toon:A', { world: 'toon', label: 'A · quick-change: a cartoon dust puff hides the swap', draw(k) {
  const { u, x, y, R } = k, c = k.px(1), lw = R * 0.05
  if (u < 0.06) old(k)
  // each bubble: pops up fast (overshooting), holds, then shrinks away from its own moment, drifting a little out
  const B = PUFF.map((b, i) => {
    const up = win(u, 0.005 * i, 0.06 + 0.005 * i), go = win(u, b.t, b.t + 0.12)
    const s = (up < 1 ? out(up) * (1 + 0.15 * Math.sin(Math.PI * up)) : 1) * (1 - ease(go)) * (1 + 0.04 * Math.sin(u * 30 + i))
    return { x: x + (b.ox * (1 + 0.25 * go)) * R, y: y + (b.oy * (1 + 0.25 * go)) * R, r: b.r * R * s }
  }).filter((b) => b.r > 0.5)
  // inked as one cloud: every bubble's ink disc, then every bubble's fill over them, then the shading
  c.fillStyle = INK; for (const b of B) { c.beginPath(); c.arc(b.x, b.y, b.r + lw, 0, TAU); c.fill() }
  c.fillStyle = CREAM; for (const b of B) { c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill() }
  c.fillStyle = SHADE; for (const b of B) { c.beginPath(); c.arc(b.x + b.r * 0.22, b.y + b.r * 0.26, b.r * 0.62, 0, TAU); c.fill() }
  c.fillStyle = CREAM; for (const b of B) { c.beginPath(); c.arc(b.x - b.r * 0.08, b.y - b.r * 0.1, b.r * 0.62, 0, TAU); c.fill() }
  c.fillStyle = '#ffffff'; for (const b of B) { c.beginPath(); c.ellipse(b.x - b.r * 0.38, b.y - b.r * 0.42, b.r * 0.2, b.r * 0.1, -0.6, 0, TAU); c.fill() }
  // spark ticks and stars flung off the puff
  const sp = win(u, 0.02, 0.4)
  if (sp > 0 && sp < 1) {
    c.strokeStyle = INK; c.lineCap = 'round'; c.lineWidth = lw * 0.9; c.globalAlpha = 1 - sp * sp
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * TAU + hash(j, 4) * 0.4, r0 = R * (1.3 + 1.1 * out(sp)), L = R * 0.25 * (1 - sp)
      c.beginPath(); c.moveTo(x + Math.cos(a) * r0 * 1.15, y + Math.sin(a) * r0 * 0.85); c.lineTo(x + Math.cos(a) * (r0 + L) * 1.15, y + Math.sin(a) * (r0 + L) * 0.85); c.stroke()
    }
    for (let j = 0; j < 3; j++) {
      const a = -Math.PI / 2 + (j - 1) * 1.1 + hash(j, 7) * 0.3, r = R * (1 + 1.3 * out(sp))
      star(c, x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 0.9, R * 0.16 * (1 - 0.4 * sp), sp * 5 * (j - 1), lw * 0.7)
    }
    c.globalAlpha = 1
  }
} })

// ---- B: the repaint. One fat wet brush stroke sweeps across the boss, left to right: ahead of the bristles the old skin,
// behind them the new one, already painted on. The paint is the new skin's colour; its wet swath is gone in a blink.
stage('break', 'toon:B', { world: 'toon', label: 'B · repaint: one fat brush stroke paints the new skin on', draw(k) {
  const { u, x, y, R } = k, c = k.px(1), lw = R * 0.05, H = R * 1.45
  const p = ease(win(u, 0.04, 0.62)), hx = x - R * 2.1 + R * 4.2 * p, tilt = 0.15
  // the bristle front: the round tip of a fat brush leading the stroke (t -1..1 top to bottom), leaning with it
  const edge = (t) => hx + t * H * tilt + R * 0.4 * Math.sqrt(Math.max(0, 1 - t * t))
  if (p < 1) old(k, (q) => {
    q.moveTo(edge(-1.6), y - H * 1.6)
    for (let j = 0; j <= 32; j++) { const t = -1.6 + (j / 32) * 3.2; q.lineTo(edge(t), y + t * H) }
    q.lineTo(x + R * 4, y + H * 1.6); q.lineTo(x + R * 4, y - H * 1.6); q.closePath()
  })
  const al = (1 - win(u, 0.6, 0.72)) * Math.min(1, p * 10)
  if (al <= 0) return
  // the paint is the new skin's own colour (its gauge's): wet and solid at the bristles, soaking in behind them within a
  // brush's width, so the new skin shows whole the moment the stroke has passed
  const col = k.col(k.S), n = parseInt(col.slice(1), 16), rgb = [16, 8, 0].map((sh) => n >> sh & 255), dk = rgb.map((v) => Math.round(v * 0.6))
  const Lb = R * 1.3 * Math.min(1, p * 4), M = 20, T = (j) => (j / M) * 2 - 1
  const wet = (cc) => { const g = c.createLinearGradient(hx - Lb, y, hx - R * 0.2, y); g.addColorStop(0, `rgba(${cc},0)`); g.addColorStop(0.6, `rgba(${cc},0.75)`); g.addColorStop(1, `rgba(${cc},1)`); return g }
  c.globalAlpha = al; c.lineJoin = 'round'; c.lineCap = 'round'
  c.beginPath(); c.moveTo(edge(-1) - Lb, y - H)
  for (let j = 0; j <= M; j++) c.lineTo(edge(T(j)), y + T(j) * H)
  c.lineTo(edge(1) - Lb, y + H); c.closePath()
  c.fillStyle = wet(rgb.join(',')); c.fill()
  // the bristle grooves dragged through it, and two wet glints
  for (let j = 1; j < 12; j++) {
    const t = (j / 12) * 2 - 1 + 0.03 * (hash(j, 2) - 0.5), ex = edge(t) - R * 0.08, L = Lb * (0.55 + 0.4 * hash(j, 3))
    c.strokeStyle = wet(dk.join(',')); c.lineWidth = R * (0.025 + 0.02 * hash(j, 4)); c.beginPath(); c.moveTo(ex, y + t * H); c.lineTo(ex - L, y + t * H); c.stroke()
  }
  c.strokeStyle = 'rgba(255,248,228,0.85)'; c.lineWidth = R * 0.04
  for (const t of [-0.55, 0.2]) { c.beginPath(); c.moveTo(edge(t) - R * 0.14, y + t * H); c.lineTo(edge(t) - R * 0.55, y + t * H); c.stroke() }
  // the ink: round the brush's tip, and along the stroke's edges, soaking away with the paint
  c.strokeStyle = INK; c.lineWidth = lw * 1.8
  c.beginPath(); for (let j = 0; j <= M; j++) j ? c.lineTo(edge(T(j)), y + T(j) * H) : c.moveTo(edge(T(j)), y + T(j) * H); c.stroke()
  c.strokeStyle = wet('28,18,13')
  for (const t of [-1, 1]) { c.beginPath(); c.moveTo(edge(t), y + t * H); c.lineTo(edge(t) - Lb, y + t * H); c.stroke() }
  c.globalAlpha = 1
} })
export { win, hash }
