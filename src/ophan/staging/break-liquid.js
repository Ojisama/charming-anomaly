// THE BREAK, the Core (liquid): the broken skin is SHED, thrown off the boss in this world's own medium, while the next
// skin stands whole under it from the first frame (never a sag, a drip or a pool: those read as its death).
// Owner ruling 2026-10-25: 0.12 s hit-stop (the sim's), then 0.8 s; the looks below are the playground's candidates.
// Molten iron-nickel, never rock: chrome bodies lit from the top left, white-hot cores that cool to mirror as they fly.
import { stage, win, hash } from '../staging.js'
import { cellsOf } from './break-ascii.js'
import { cutSkin, drawPiece } from './break-macro.js'

const TAU = Math.PI * 2
const out = (u, p = 2) => 1 - Math.pow(1 - u, p)
// the fills: fixed stop lists (px2d bakes one texture per list), the heat carried by globalAlpha, never by the stops
const chrome = (c, x, y, r) => {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r)
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.2, '#e6ecf2'); g.addColorStop(0.55, '#8b97a6'); g.addColorStop(0.85, '#3b424d'); g.addColorStop(1, '#1b1e23')
  return g
}
const hot = (c, x, y, r) => {
  const g = c.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, 'rgba(255,250,236,1)'); g.addColorStop(0.45, 'rgba(255,186,92,0.85)'); g.addColorStop(1, 'rgba(255,96,24,0)')
  return g
}
// heat as light: an additive glow of radius r, strength a
function glow(c, x, y, r, a) {
  if (a <= 0.01) return
  c.globalCompositeOperation = 'lighter'; c.globalAlpha = a
  c.fillStyle = hot(c, x, y, r); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill()
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1
}
// a molten drop: chrome body stretched along a, a white-hot core over it while it is hot
function drop(c, x, y, rx, ry, a, heat, al = 1) {
  const r = Math.max(rx, ry)
  c.globalAlpha = al; c.fillStyle = chrome(c, x, y, r); c.beginPath(); c.ellipse(x, y, rx, ry, a, 0, TAU); c.fill()
  if (heat > 0.01) {
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = al * heat * 0.6
    c.fillStyle = hot(c, x, y, r); c.beginPath(); c.ellipse(x, y, rx, ry, a, 0, TAU); c.fill()
    c.globalCompositeOperation = 'source-over'
  }
  c.globalAlpha = al
  c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.ellipse(x - rx * 0.3, y - ry * 0.38, r * 0.22, r * 0.12, -0.6, 0, TAU); c.fill()
  c.globalAlpha = 1
}
// the skin read into cells (break-ascii.js cellsOf) through a real canvas: this world's painter also places its sheen as
// a WebGL mesh, which a canvas has no place for, so that call is dropped from the read (the body is all 2D paths)
const meshless = (c) => new Proxy(c, {
  get: (t, p) => p === 'place' ? () => {} : typeof t[p] === 'function' ? t[p].bind(t) : t[p],
  set: (t, p, v) => { t[p] = v; return true },
})
const cellsOfCore = (k, P) => cellsOf({ ...k, drawBoss: (s, g, ...a) => k.drawBoss(s, meshless(g), ...a) }, P)

// ---- A: the droplet shell. The skin flashes white-hot and is flung off whole as a spinning shell of molten drops: every
// drop starts where its bit of skin was, stays round and flies out on a spiral, cooling from white-hot to mirror, gone.
stage('break', 'liquid:A', { world: 'liquid', label: 'A · droplet shell: the skin is flung off as a spinning ring of drops', draw(k) {
  const { u, x, y, R } = k, c = k.px(1), P = R * 0.22
  // the skin itself for an instant, flashing hot as it lets go
  const sw = win(u, 0, 0.1)
  if (sw < 1) { k.fadePx(0, 1 - sw); k.drawBoss(k.from, k.px(0), x, y, R, k.ph0) }
  glow(c, x, y, R * (0.9 + 1.2 * out(win(u, 0, 0.35))), 0.5 * (1 - win(u, 0, 0.35)) * Math.min(1, u / 0.03))
  const heat = 1 - win(u, 0.04, 0.55), spin = 1.1
  for (const q of cellsOfCore(k, P)) {
    const h1 = hash(q.i, q.j), h2 = hash(q.j + 31, q.i + 7), d = Math.hypot(q.ox, q.oy)
    const f = win(u, 0.02 + 0.04 * h1, 0.7), fo = out(f, 1.5)
    const a = Math.atan2(q.oy, q.ox) + spin * fo, r = d + fo * (R * (2.2 + 1.2 * h2) + d)
    const al = win(u, 0.02, 0.09) * (1 - win(u, 0.4 + 0.15 * h1, 0.7))
    if (al <= 0.01) continue
    const s = P * (0.42 + 0.3 * q.a) * (0.8 + 0.4 * h2) * (1 + 0.25 * fo)
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r
    // a short arc of its path behind it while it is fast, the way a spun drop smears, never a tail that hangs
    if (f > 0 && f < 0.5) {
      const fb = out(Math.max(0, f - 0.04), 1.5), ab = Math.atan2(q.oy, q.ox) + spin * fb, rb = d + fb * (R * (2.2 + 1.2 * h2) + d)
      c.globalAlpha = al * 0.4 * (1 - f / 0.5); c.strokeStyle = '#c6d0dc'; c.lineCap = 'round'; c.lineWidth = s * 0.7
      c.beginPath(); c.moveTo(x + Math.cos(ab) * rb, y + Math.sin(ab) * rb); c.lineTo(px, py); c.stroke()
    }
    drop(c, px, py, s, s, 0, heat * (0.6 + 0.4 * q.l), al)
  }
  c.globalAlpha = 1
} })

// ---- B: the ripple. A ring wave of molten metal bursts out of the boss and peels the skin off with it: the skin's pieces
// ride the crest outward, stretched along it and thrown up toward the lens, a white-hot lip on the wave, all gone by the end.
const RIPPLE = [{ r0: 0, r1: 0.3, n: 5 }, { r0: 0.3, r1: 0.62, n: 10 }, { r0: 0.62, r1: 1, n: 16 }]
stage('break', 'liquid:B', { world: 'liquid', label: 'B · ripple: a molten ring wave peels the skin outward', draw(k) {
  const { u, x, y, R } = k, tx = k.snap(k.from, k.ph0), Pc = cutSkin('ripple', RIPPLE, 6), U = R * 1.5, c = k.px(0), g = k.px(1)
  const w = win(u, 0.02, 0.75), wr = R * (0.3 + 2.6 * out(w, 2.2)), wa = 1 - win(u, 0.4, 0.8), heat = 1 - win(u, 0.05, 0.5)
  Pc.forEach((pc, i) => {
    // a piece lets go when the crest reaches it, then rides it out
    const t0 = 0.02 + 0.12 * pc.d, f = win(u, t0, 0.8), fo = out(f, 2.2)
    const a = Math.atan2(pc.c[1], pc.c[0]) + (pc.d < 0.1 ? hash(i, 9) * TAU : 0)
    const dist = (R * 0.6 + R * 1.9 * pc.d + R * 0.4 * hash(i, 4)) * fo, al = 1 - win(f, 0.45, 0.9)
    if (al <= 0.01) return
    drawPiece(c, k, tx, pc, i, Math.cos(a) * dist, Math.sin(a) * dist, (hash(i, 5) - 0.5) * 0.7 * fo, 1 + 0.45 * fo, al)
    if (heat > 0.02 && f > 0) { c.globalCompositeOperation = 'lighter'; drawPiece(c, k, tx, pc, i + 60, Math.cos(a) * dist, Math.sin(a) * dist, (hash(i, 5) - 0.5) * 0.7 * fo, 1 + 0.45 * fo, al * heat * 0.6, 0xffb060); c.globalCompositeOperation = 'source-over' }
  })
  // the wave: a chrome ring (dark trough inside, the lit crest, a white-hot lip) leading the skin out
  if (wa > 0 && w > 0) {
    g.lineCap = 'round'
    g.globalAlpha = 0.45 * wa; g.strokeStyle = '#1b1e23'; g.lineWidth = R * 0.22 * (1 - 0.5 * w); g.beginPath(); g.arc(x, y, wr - R * 0.12, 0, TAU); g.stroke()
    g.globalAlpha = 0.9 * wa; g.strokeStyle = '#8b97a6'; g.lineWidth = R * 0.12 * (1 - 0.5 * w); g.beginPath(); g.arc(x, y, wr, 0, TAU); g.stroke()
    g.strokeStyle = '#eef2f7'; g.lineWidth = R * 0.04; g.beginPath(); g.arc(x, y, wr + R * 0.03, Math.PI * 0.85, Math.PI * 1.65); g.stroke()
    g.globalAlpha = 1
    if (heat > 0.02) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.7 * heat * wa; g.strokeStyle = '#ffcf8a'; g.lineWidth = R * 0.06; g.beginPath(); g.arc(x, y, wr + R * 0.05, 0, TAU); g.stroke(); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1 }
  }
  glow(g, x, y, R * (0.8 + 0.8 * w), 0.45 * (1 - win(u, 0, 0.3)) * Math.min(1, u / 0.03))
} })
export { win, hash }
