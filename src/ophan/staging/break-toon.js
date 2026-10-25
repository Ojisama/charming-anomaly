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

// ---- A: the quick-change. A cartoon dust cloud bursts up round the boss in a blink and churns (bubbles swelling and
// shrinking, puffs spitting out of its sides, wisps shooting off and popping, stars and spark ticks), a comic "POOF!"
// pops out of it, and it clears bubble by bubble: the boss is standing there in its new skin. The old skin is only seen
// before the cloud closes over it.
// the word, the one place it is written: the port routes it through t() (fr "POUF !"); bakes are cached by the word
export const POOF = 'POOF!'
const FONT = '900 150px "Arial Black", "Arial Rounded MT Bold", Impact, sans-serif'
const words = new Map()
// the word as comic lettering, baked once per word: a jagged gold burst behind, chunky orange letters each jostled, inked
function word(w) {
  let cv = words.get(w)
  if (cv) return cv
  cv = document.createElement('canvas'); cv.width = 800; cv.height = 400
  const g = cv.getContext('2d'), cx = 400, cy = 200
  g.lineJoin = 'round'; g.lineCap = 'round'
  g.beginPath()
  for (let j = 0; j < 28; j++) { const a = (j / 28) * TAU, r = (j % 2 ? 0.6 : 1) * (0.9 + 0.2 * hash(j, 61)); j ? g.lineTo(cx + Math.cos(a) * r * 380, cy + Math.sin(a) * r * 185) : g.moveTo(cx + Math.cos(a) * r * 380, cy + Math.sin(a) * r * 185) }
  g.closePath(); g.fillStyle = GOLD; g.fill(); g.strokeStyle = INK; g.lineWidth = 12; g.stroke()
  g.font = FONT; g.textAlign = 'center'; g.textBaseline = 'middle'
  const L = [...w], ws = L.map((ch) => g.measureText(ch).width), tot = ws.reduce((a, b) => a + b, 0) * 0.92
  let at = cx - tot / 2
  L.forEach((ch, i) => {
    const lx = at + ws[i] * 0.46, ly = cy + 8 + (hash(i, 62) - 0.5) * 34, rot = (hash(i, 63) - 0.5) * 0.36
    g.save(); g.translate(lx, ly); g.rotate(rot)
    g.strokeStyle = INK; g.lineWidth = 26; g.strokeText(ch, 0, 0)
    g.fillStyle = '#a8200f'; g.fillText(ch, 4, 5)
    g.fillStyle = '#f0521c'; g.fillText(ch, 0, 0)
    g.restore()
    at += ws[i] * 0.92
  })
  words.set(w, cv)
  return cv
}
word(POOF)   // baked at load: never made in a frame

// the cloud's bubbles, round the boss in R: three layers, the back ones bigger and earlier
const PUFF = [
  ...Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * TAU + hash(i, 1) * 0.4; return { ox: Math.cos(a) * 1.35, oy: Math.sin(a) * 0.95, r: 0.5 + 0.18 * hash(i, 2), t: 0.3 + 0.12 * hash(i, 3) } }),
  ...Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * TAU + 0.4 + hash(i, 11) * 0.5; return { ox: Math.cos(a) * 0.75, oy: Math.sin(a) * 0.5, r: 0.6 + 0.15 * hash(i, 12), t: 0.25 + 0.15 * hash(i, 13) } }),
  { ox: 0, oy: 0, r: 0.75, t: 0.28 }, { ox: -0.35, oy: -0.3, r: 0.55, t: 0.26 }, { ox: 0.4, oy: -0.25, r: 0.5, t: 0.33 },
]
// puffs spat out of the cloud's sides, and wisps shooting off and popping: { a angle, d reach, r, t0 born }
const SPIT = Array.from({ length: 6 }, (_, i) => ({ a: (i % 2 ? 0 : Math.PI) + (hash(i, 21) - 0.5) * 0.9, d: 1.4 + 0.5 * hash(i, 22), r: 0.32 + 0.12 * hash(i, 23), t0: 0.06 + 0.1 * hash(i, 24) }))
const WISP = Array.from({ length: 10 }, (_, i) => ({ a: (i / 10) * TAU + hash(i, 31) * 0.5, d: 1.6 + 0.9 * hash(i, 32), r: 0.13 + 0.08 * hash(i, 33), t0: 0.04 + 0.2 * hash(i, 34) }))
stage('break', 'toon:A', { world: 'toon', label: 'A · quick-change: a cartoon POOF cloud hides the swap', draw(k) {
  const { u, x, y, R } = k, c = k.px(1), lw = R * 0.05
  if (u < 0.06) old(k)
  const B = []
  // the cloud: each bubble pops up fast (overshooting, the middle ones first so it closes over the boss at once), churns (swelling and shrinking), then shrinks away at its moment
  PUFF.forEach((b, i) => {
    const o = PUFF.length - 1 - i, up = win(u, 0.003 * o, 0.05 + 0.003 * o), go = win(u, b.t, b.t + 0.13)
    const churn = 1 + 0.1 * Math.sin(u * 38 + i * 1.7) * (1 - go)
    const s = (up < 1 ? out(up) * (1 + 0.2 * Math.sin(Math.PI * up)) : 1) * (1 - ease(go)) * churn
    const bill = 1 + 0.12 * out(win(u, 0, 0.3)) + 0.2 * go   // the cloud billows out as it goes
    B.push({ x: x + b.ox * bill * R, y: y + b.oy * bill * R, r: b.r * R * s })
  })
  // spat puffs: shot out of the sides, slowing, shrinking away; wisps: small, fast, then pop
  for (const q of SPIT) {
    const f = win(u, q.t0, q.t0 + 0.3)
    if (f <= 0 || f >= 1) continue
    const d = R * (0.9 + q.d * out(f)), s = Math.sin(Math.PI * Math.min(1, f * 1.6)) * (1 - f)
    B.push({ x: x + Math.cos(q.a) * d * 1.1, y: y + Math.sin(q.a) * d * 0.8, r: q.r * R * (0.6 + 1.2 * s) })
  }
  const pops = []
  for (const q of WISP) {
    const f = win(u, q.t0, q.t0 + 0.2)
    if (f <= 0) continue
    const d = R * (0.8 + q.d * out(f)), px = x + Math.cos(q.a) * d * 1.15, py = y + Math.sin(q.a) * d * 0.85
    if (f < 0.8) B.push({ x: px, y: py, r: q.r * R * (0.5 + 0.5 * Math.sin(Math.PI * f / 0.8 * 0.7)) })
    else pops.push({ x: px, y: py, f: (f - 0.8) / 0.2, r: q.r * R })
  }
  const L = B.filter((b) => b.r > 0.5)
  // inked as one cloud: every bubble's ink disc, then every fill over them, then the shading
  c.fillStyle = INK; for (const b of L) { c.beginPath(); c.arc(b.x, b.y, b.r + lw, 0, TAU); c.fill() }
  c.fillStyle = CREAM; for (const b of L) { c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill() }
  c.fillStyle = SHADE; for (const b of L) { c.beginPath(); c.arc(b.x + b.r * 0.22, b.y + b.r * 0.26, b.r * 0.62, 0, TAU); c.fill() }
  c.fillStyle = CREAM; for (const b of L) { c.beginPath(); c.arc(b.x - b.r * 0.08, b.y - b.r * 0.1, b.r * 0.62, 0, TAU); c.fill() }
  c.fillStyle = '#ffffff'; for (const b of L) { c.beginPath(); c.ellipse(b.x - b.r * 0.38, b.y - b.r * 0.42, b.r * 0.2, b.r * 0.1, -0.6, 0, TAU); c.fill() }
  // a wisp's pop: four short ink ticks bursting from where it was
  c.strokeStyle = INK; c.lineCap = 'round'; c.lineWidth = lw * 0.7
  for (const p of pops) {
    c.globalAlpha = 1 - p.f
    for (let j = 0; j < 4; j++) { const a = (j / 4) * TAU + 0.4, r0 = p.r * (0.6 + 1.2 * p.f), r1 = r0 + p.r * 0.8; c.beginPath(); c.moveTo(p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0); c.lineTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1); c.stroke() }
  }
  c.globalAlpha = 1
  // spark ticks and stars flung off the burst
  const sp = win(u, 0.02, 0.4)
  if (sp > 0 && sp < 1) {
    c.strokeStyle = INK; c.lineWidth = lw * 0.9; c.globalAlpha = 1 - sp * sp
    for (let j = 0; j < 12; j++) {
      const a = (j / 12) * TAU + hash(j, 4) * 0.4, r0 = R * (1.6 + 1.2 * out(sp)), L2 = R * 0.3 * (1 - sp)
      c.beginPath(); c.moveTo(x + Math.cos(a) * r0 * 1.15, y + Math.sin(a) * r0 * 0.85); c.lineTo(x + Math.cos(a) * (r0 + L2) * 1.15, y + Math.sin(a) * (r0 + L2) * 0.85); c.stroke()
    }
    for (let j = 0; j < 4; j++) {
      const a = -Math.PI / 2 + (j - 1.5) * 0.9 + hash(j, 7) * 0.3, r = R * (1.3 + 1.3 * out(sp))
      star(c, x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 0.9, R * 0.17 * (1 - 0.4 * sp), sp * 5 * (j - 1.5), lw * 0.7)
    }
    c.globalAlpha = 1
  }
  // POOF!: pops out of the cloud at its peak (an overshooting scale), holds, then floats up and fades as the cloud clears
  const pin = win(u, 0.07, 0.17), pout = win(u, 0.3, 0.5)
  if (pin > 0 && pout < 1) {
    const cv = word(POOF), g = k.px(2), back = 1.7, s = 1 + (back + 1) * Math.pow(pin - 1, 3) + back * Math.pow(pin - 1, 2)
    const W = R * 3.2 * s * (1 + 0.15 * pout), H = W * cv.height / cv.width, wy = y - R * 0.15 - R * 0.9 * ease(pout)
    g.save(); g.globalAlpha = 1 - ease(pout); g.translate(x, wy); g.rotate(-0.14); g.drawImage(cv, -W / 2, -H / 2, W, H); g.restore(); g.globalAlpha = 1
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
