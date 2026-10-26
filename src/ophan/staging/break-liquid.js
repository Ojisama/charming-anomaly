// THE BREAK, the Core (liquid): the chrome skin does not leave the boss. It is shed
// outward while the next skin stands whole under it (never a sag, a drip or a pool: those read as its death).
// Owner ruling 2026-10-25: 0.12 s hit-stop (the sim's), then 0.8 s; the look below is the one STAGE_PICK picked.
// Molten iron-nickel, never rock: chrome bodies lit from the top left, white-hot where they work.
import { stage, win, hash } from '../staging.js'
import { cutSkin, drawPiece } from './break-macro.js'

const TAU = Math.PI * 2
const out = (u, p = 2) => 1 - Math.pow(1 - u, p)
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
// ---- B: the ripple. An unseen wave bursts out of the boss and peels the skin off with it: the skin's pieces ride it
// outward, stretched and thrown up toward the lens, white-hot as they let go, all gone by the end. No ring is drawn.
const RIPPLE = [{ r0: 0, r1: 0.3, n: 5 }, { r0: 0.3, r1: 0.62, n: 10 }, { r0: 0.62, r1: 1, n: 16 }]
stage('break', 'liquid:B', { world: 'liquid', label: 'B · ripple: a wave peels the skin outward, no ring', draw(k) {
  const { u, x, y, R } = k, tx = k.snap(k.from, k.ph0), Pc = cutSkin('ripple', RIPPLE, 6), U = R * 1.5, c = k.px(0), g = k.px(1)
  const w = win(u, 0.02, 0.75), heat = 1 - win(u, 0.05, 0.5)
  Pc.forEach((pc, i) => {
    // a piece lets go when the crest reaches it, then rides it out
    const t0 = 0.02 + 0.12 * pc.d, f = win(u, t0, 0.8), fo = out(f, 2.2)
    const a = Math.atan2(pc.c[1], pc.c[0]) + (pc.d < 0.1 ? hash(i, 9) * TAU : 0)
    const dist = (R * 0.6 + R * 1.9 * pc.d + R * 0.4 * hash(i, 4)) * fo, al = 1 - win(f, 0.6, 1)
    if (al <= 0.01) return
    // tossed up a little as it lets go, then gravity takes it down
    const dx = Math.cos(a) * dist, dy = Math.sin(a) * dist + R * (4.5 * f * f - (0.8 + 0.5 * hash(i, 8)) * f)
    drawPiece(c, k, tx, pc, i, dx, dy, (hash(i, 5) - 0.5) * 0.7 * fo, 1 + 0.45 * fo, al)
    if (heat > 0.02 && f > 0) { c.globalCompositeOperation = 'lighter'; drawPiece(c, k, tx, pc, i + 60, dx, dy, (hash(i, 5) - 0.5) * 0.7 * fo, 1 + 0.45 * fo, al * heat * 0.6, 0xffb060); c.globalCompositeOperation = 'source-over' }
  })
  glow(g, x, y, R * (0.8 + 0.8 * w), 0.45 * (1 - win(u, 0, 0.3)) * Math.min(1, u / 0.03))
} })
export { win, hash }
