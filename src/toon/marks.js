// The Mantle's marks (render-only): the things render.js draws OVER the world for every chapter — the
// elite affix badges and the ground rings of a telegraph or an aura — redrawn in the cast's own medium,
// so nothing on a Mantle screen is a flat vector line or an emoji.
//   inkRing(g, x, y, r, color, alpha, width, fill?)  a hand-inked ring into a Pixi Graphics: a flat
//                       colour band inside a thick-thin brush contour, fat on the shadow side (lower
//                       right), tapering where the brush lifted off, its ends not quite meeting.
//   inkLine(g, x0, y0, x1, y1, color, alpha, width)  the same brush along a line (a lane's edge).
//   bakeAffix(id) -> { canvas, ax, ay, res }        an elite affix badge: a little inked cel icon.
// render.js calls these only while the chapter's render.toon is set (its toonOn hooks).
import { TAU, mkCanvas } from './palette.js'
import { resetXf, push, pop, tr, rot, sc, ell, polar, drop, tube, qb, line, cel, brush, puff, flame, glow } from './brush.js'

const INK = 0x1e1513
const LA = Math.atan2(0.83, 0.55)   // the shadow side of every contour (the light is upper left)
// a stable per-ring phase, so a ring keeps its brush from frame to frame instead of crawling
const ph = (x, y, r) => { const v = Math.sin(x * 0.0123 + y * 0.0371 + r * 0.71) * 43758.5453; return v - Math.floor(v) }

// 1-D value noise round the ring: the hand wavers, it never draws a sine
function hn(i, s) { let h = (i * 374761393 + s * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
function n1(x, s) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hn(i, s) + (hn(i + 1, s) - hn(i, s)) * u) * 2 - 1 }
function ringPoly(x, y, r, a0, span, wAt, n, sd = 0) {
  const out = [], inn = []
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = a0 + span * u, w = wAt(a, u)
    const c = Math.cos(a), s = Math.sin(a)
    // the brush does not run on a compass: the ring's own path wanders in and out a little
    const rr = r * (1 + 0.035 * n1(u * 7, sd) + 0.012 * n1(u * 23, sd + 5))
    out.push(x + c * (rr + w / 2), y + s * (rr + w / 2))
    inn.push(x + c * (rr - w / 2), y + s * (rr - w / 2))
  }
  for (let i = inn.length - 2; i >= 0; i -= 2) out.push(inn[i], inn[i + 1])
  return out
}
export function inkRing(g, x, y, r, color, alpha = 1, width = 2, fill = 0) {
  if (r <= 1) return
  const p = ph(x, y, r)
  const n = Math.max(28, Math.min(120, Math.round(r * 0.6)))
  if (fill > 0) g.circle(x, y, r).fill({ color, alpha: fill })
  const gap = 0.16 + 0.1 * p, a0 = p * TAU, span = TAU - gap
  const sd = (p * 1e6) | 0
  const press = (a) => 0.45 + 0.95 * Math.max(0, Math.cos(a - LA)) + 0.25 * n1(a * 2.2, sd + 9)
  const tA = 0.05 + 0.08 * hn(sd, 1), tB = 0.05 + 0.08 * hn(sd, 2)
  const taper = (u) => Math.min(1, u / tA, (1 - u) / tB)
  const wb = Math.max(1.6, width * 1.15)
  // the ink contour first, then the flat colour band laid inside it
  g.poly(ringPoly(x, y, r, a0, span, (a, u) => (wb * press(a) * 0.95 + 3.0) * (0.3 + 0.7 * taper(u)), n, sd)).fill({ color: INK, alpha: Math.min(0.95, 0.3 + alpha * 1.1) })
  g.poly(ringPoly(x, y, r, a0 + 0.06, span - 0.12, (a, u) => wb * 0.95 * press(a) * (0.25 + 0.75 * taper(u)), n, sd)).fill({ color, alpha: Math.min(1, 0.35 + alpha) })
}
// the lane drawn as a cartoon animator's ZIP LINES: a run of fat brush dashes along it, each bellied in
// the middle and tapering at both ends, its path wavering by hand, a colour core inside a full ink
// stroke, shrinking and thinning away from the body so the near end (where you look) reads first
export function inkLine(g, x0, y0, x1, y1, color, alpha = 1, width = 1.5) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy)
  if (L < 2) return
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux
  const sd = (ph(x0, y0, L) * 1e6) | 0
  const W = Math.max(2.2, width * 2.6)
  const dashes = Math.max(2, Math.min(5, Math.round(L / 46)))
  const span = L / dashes
  const strip = (s0, s1, wf, off) => {
    const n = Math.max(6, Math.round((s1 - s0) / 4)), A = [], B = []
    for (let i = 0; i <= n; i++) {
      const u = i / n, d = s0 + (s1 - s0) * u
      const w = wf(u) / 2
      // the hand drifts off the ruler a little, never a sine
      const wob = 1.1 * n1(d / 22, sd) + 0.35 * n1(d / 6, sd + 3)
      const px = x0 + ux * d + nx * (wob + off), py = y0 + uy * d + ny * (wob + off)
      A.push(px + nx * w, py + ny * w); B.push(px - nx * w, py - ny * w)
    }
    for (let i = B.length - 2; i >= 0; i -= 2) A.push(B[i], B[i + 1])
    return A
  }
  for (let k = 0; k < dashes; k++) {
    const fade = 1 - (k / dashes) * 0.6
    const s0 = k * span + span * (0.06 + 0.08 * hn(sd, k)), s1 = (k + 1) * span - span * (0.14 + 0.1 * hn(sd, k + 9))
    // pressure: fat in the belly, one end dragged longer than the other
    const skew = 0.35 + 0.3 * hn(sd, k + 20)
    const press = (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, skew / 0.5)), 0.7)
    const wf = (u) => W * fade * (0.15 + 0.85 * press(u)) * (1 + 0.18 * n1(u * 5, sd + k))
    g.poly(strip(s0 - 1.2, s1 + 1.2, (u) => wf(u) + 2.6 * fade, 0.5)).fill({ color: INK, alpha: Math.min(0.92, 0.45 + alpha) })
    g.poly(strip(s0, s1, (u) => wf(u) * 0.62, 0)).fill({ color, alpha: Math.min(1, 0.45 + alpha) })
  }
}

// THE ONE-OFF RING (render.js's spawnRing, while the chapter is toon): a canvas of radius 64 px (the
// size spawnRing scales from), a cream band inside a thick-thin ink contour, hand-wavered, its ends not
// meeting. Cream, so spawnRing's own tint colours it; the ink stays ink under any tint.
export function bakeRingCanvas() {
  const S = 160, R = 64, cv = mkCanvas(S * 2, S * 2), c = cv.getContext('2d')
  c.scale(2, 2)
  const g = { _p: null, poly(pts) { this._p = pts; return this }, fill({ color, alpha }) {
    const P = this._p
    c.beginPath(); c.moveTo(P[0], P[1]); for (let i = 2; i < P.length; i += 2) c.lineTo(P[i], P[i + 1]); c.closePath()
    c.fillStyle = '#' + color.toString(16).padStart(6, '0'); c.globalAlpha = alpha; c.fill(); c.globalAlpha = 1
    return this
  }, circle() { return this } }
  inkRing(g, S / 2, S / 2, R, 0xfff4d6, 1, 5)
  return { canvas: cv, ax: 0.5, ay: 0.5, res: 2 }
}

// ---- the affix badges (units: a badge about 12 world px across) ----------------------------------
const RES = 4
const SH = 'rgba(40,10,30,0.42)'
const BADGE = {
  // a heater shield, blue, a cream band across it
  shielded: (c) => {
    const P = [[-5, -5.2], [5, -5.2], [5, -0.5], ...qb([5, -0.5], [4.2, 4], [0, 6], 10).slice(1), ...qb([0, 6], [-4.2, 4], [-5, -0.5], 10).slice(1)]
    cel(c, P, '#4d8fd8', { ink: 1.3, shade: SH, spec: 0.18 })
    cel(c, [[-1.4, -5], [1.4, -5], [1.4, 5.4], [-1.4, 5.4]], '#f3ead2', { ink: 0, shade: null })
    brush(c, P, true, 1.3)
  },
  // a cell pinching in two (it splits when it dies)
  splitter: (c) => {
    cel(c, ell(-2.6, 0.4, 3.6, 4.2, -0.3, 30), '#7ac25a', { ink: 1.2, shade: SH, spec: 0.16 })
    cel(c, ell(2.8, -0.4, 3.6, 4.2, 0.3, 30), '#7ac25a', { ink: 1.2, shade: SH, spec: 0.16 })
    line(c, [[0.2, -3.8], [-0.6, -1.2], [0.6, 1.0], [-0.2, 3.8]], 0.8, { taper: 0.3 })
  },
  // a round black cartoon bomb, its fuse lit
  volatile: (c) => {
    cel(c, tube(qb([1.8, -3.6], [3.6, -6.4], [5.6, -6.0]), 1.0, 0.8), '#c9a46a', { ink: 0.7, shade: null })
    cel(c, ell(0, 1, 5, 5, 0, 36), '#2c2630', { ink: 1.2, shade: null, spec: 0.26 })
    cel(c, [[0.8, -4.6], [3.0, -4.6], [3.0, -3.0], [0.8, -3.0]], '#4a4250', { ink: 0.8, shade: null })
    push(); tr(6, -6.8); rot(0.3)
    const st = []; for (let i = 0; i < 10; i++) { const rr = i % 2 ? 1.0 : 2.6, t = (i / 10) * TAU; st.push([Math.cos(t) * rr, Math.sin(t) * rr]) }
    cel(c, st, '#ffcf4a', { ink: 0.7, shade: null })
    pop()
  },
  // a cheerleader's megaphone
  pacer: (c) => {
    cel(c, [[-4.6, -1.6], [3.6, -5], [3.6, 5], [-4.6, 1.6]], '#ee8a2c', { ink: 1.2, shade: SH })
    cel(c, ell(3.6, 0, 1.6, 5, 0, 26), '#f7d27a', { ink: 1.0, shade: null })
    cel(c, ell(-4.8, 0, 1.0, 1.8, 0, 16), '#c25a1e', { ink: 0.8, shade: null })
    line(c, qb([-1.4, -2.6], [-0.2, -2.8], [0.8, -3.6]), 0.6)
  },
  // an iron anchor
  anchored: (c) => {
    const iron = '#8c8aa0', sh = 'rgba(20,20,50,0.45)'
    cel(c, tube(qb([-5, 1.4], [-4.2, 5.6], [0, 5.8]), 1.9, 1.6), iron, { ink: 1.0, shade: sh })
    cel(c, tube(qb([5, 1.4], [4.2, 5.6], [0, 5.8]), 1.9, 1.6), iron, { ink: 1.0, shade: sh })
    cel(c, tube([[0, -3.4], [0, 5.6]], 2.0), iron, { ink: 1.1, shade: sh })
    cel(c, tube([[-3.2, -2.2], [3.2, -2.2]], 1.6), iron, { ink: 1.0, shade: sh })
    cel(c, polar(0, -5, (t) => 1.8, 22), iron, { ink: 1.0, shade: sh })
    cel(c, polar(0, -5, (t) => 0.7, 14), '#2c2630', { ink: 0, shade: null })
  },
  // the cartoon anger mark: four red veins popping
  frenzied: (c) => {
    for (let k = 0; k < 4; k++) {
      push(); rot(k * Math.PI / 2 + Math.PI / 4)
      cel(c, tube(qb([1.4, -1.4], [2.0, -4.2], [4.6, -4.4]), 1.9, 1.3), '#e2443a', { ink: 1.0, shade: SH })
      pop()
    }
  },
  // a gold crown
  gilded: (c) => {
    const P = [[-5.4, 3.6], [-5.6, -3.4], [-2.6, 0], [0, -5], [2.6, 0], [5.6, -3.4], [5.4, 3.6]]
    cel(c, P, '#f0c03c', { ink: 1.2, shade: 'rgba(120,60,10,0.45)', spec: 0.2 })
    cel(c, [[-5.4, 2], [5.4, 2], [5.4, 3.6], [-5.4, 3.6]], '#d79a2a', { ink: 0.6, shade: null })
    for (const [x, y] of [[-5.6, -3.4], [0, -5], [5.6, -3.4]]) cel(c, ell(x, y, 1.1, 1.1, 0, 14), '#e2483c', { ink: 0.6, shade: null })
  },
  // a puff of foul gas
  gasbag: (c) => { puff(c, -2, 1, 3.4, '#a7c46a', 'rgba(40,60,10,0.4)', 1.0); puff(c, 2.4, -0.6, 3.8, '#b9d27a', 'rgba(40,60,10,0.4)', 1.0) },
}
const STAR = (c) => {
  const st = []; for (let i = 0; i < 10; i++) { const rr = i % 2 ? 2.4 : 5.6, t = (i / 10) * TAU - Math.PI / 2; st.push([Math.cos(t) * rr, Math.sin(t) * rr]) }
  cel(c, st, '#f0c03c', { ink: 1.2, shade: 'rgba(120,60,10,0.45)' })
}
export function bakeAffix(id) {
  const W = 18, cv = mkCanvas(W * RES, W * RES), c = cv.getContext('2d')
  c.scale(RES, RES); c.translate(W / 2, W / 2)
  resetXf(); (BADGE[id] ?? STAR)(c); resetXf()
  return { canvas: cv, ax: 0.5, ay: 0.5, res: RES }
}

// ---- THE DAMAGE NUMBERS: hand-lettered 1930s cartoon digits (render.js's spawnDamage, toonOn) ------
// Each glyph is a skeleton of brush strokes (units: a digit 8 wide, 12 tall), laid three times: a dark
// drop of ink offset to the lower right (the lettering's shadow), the ink contour round every stroke,
// then a cream paint fill dragged through the strokes so they merge into one letter, a dry highlight
// along the lit side. bakeDigits() -> { [char]: { canvas, ax, ay, res, adv } } for '0'-'9', '+', '-'.
const arc = (cx, cy, r, a0, a1, ry = r, n = 22) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry]) } return o }
// a closed loop as two overlapping halves (a ribbon that crosses itself would cancel its own fill)
const loop = (cx, cy, r, ry, a0 = -1.6) => [arc(cx, cy, r, a0, a0 + 3.5, ry), arc(cx, cy, r, a0 + 3.1, a0 + 6.5, ry)]
const GLYPH = {
  0: loop(4, 6, 3.3, 5.3),
  1: [[[1.8, 3.0], [4.6, 0.4], [4.3, 11.8]], [[1.6, 11.9], [7.0, 11.7]]],
  2: [[...qb([0.9, 3.4], [3.6, -1.6], [6.8, 2.6], 10), ...qb([6.8, 2.6], [7.6, 6.2], [0.9, 11.6], 12).slice(1)], [[0.9, 11.6], [7.6, 11.2]]],
  3: [arc(3.8, 3.3, 3.0, -2.7, 1.6, 2.9), arc(3.8, 8.7, 3.5, -1.6, 2.7, 3.3)],
  4: [[[5.7, 11.9], [5.6, 0.4], [0.5, 8.4], [7.9, 8.2]]],
  5: [[[7.1, 0.7], [1.8, 0.9], [1.2, 5.6]], arc(3.9, 8.2, 3.6, -2.4, 2.65, 3.6)],
  6: [qb([6.7, 0.6], [0.7, 2.0], [0.8, 8.4], 14), ...loop(4.0, 8.4, 3.2, 3.3)],
  7: [[[0.6, 0.9], [7.5, 0.7], [3.0, 11.9]]],
  8: [...loop(4, 3.2, 2.7, 2.7), ...loop(4, 8.7, 3.4, 3.2)],
  9: [...loop(4, 3.8, 3.2, 3.2), qb([7.2, 3.6], [7.4, 10.4], [1.4, 11.6], 14)],
  '+': [[[4, 3.2], [4, 10.2]], [[0.6, 6.7], [7.4, 6.5]]],
  '-': [[[0.8, 6.6], [7.2, 6.4]]],
}
const DG_RES = 4
export function bakeDigits() {
  const out = {}
  for (const ch of Object.keys(GLYPH)) {
    const W = 15, H = 19, ox = 3.5, oy = 3.5
    const cv = mkCanvas(W * DG_RES, H * DG_RES), c = cv.getContext('2d')
    c.scale(DG_RES, DG_RES)
    resetXf()
    const strokes = GLYPH[ch]
    const fat = (d, w0 = 3.4, w1 = 3.0) => strokes.map((s) => tube(s.map(([x, y]) => [x + ox + d[0], y + oy + d[1]]), w0, w1))
    // the drop shadow and the contour: the strokes grown by the ink, in one dark colour, the contour
    // nudged to the lower right so it lies fat on the shadow side and thin toward the light
    for (const T of fat([1.2, 1.4], 6.4, 6.0)) cel(c, T, 'rgba(30,21,19,0.8)', { ink: 0, shade: null, dabs: 0 })
    for (const T of fat([0.32, 0.42], 6.0, 5.5)) cel(c, T, '#1e1513', { ink: 0, shade: null, dabs: 0 })
    // the paint, once per stroke with no ink between them: one merged letter
    for (const T of fat([0, 0])) cel(c, T, '#fbe7a2', { ink: 0, shade: 'rgba(214,120,40,0.55)' })
    // a dry cream highlight along each stroke's lit edge
    for (const s of strokes) line(c, s.map(([x, y]) => [x + ox - 0.55, y + oy - 0.55]).slice(1, -1), 0.55, { color: 'rgba(255,252,236,0.85)', taper: 0.4 })
    resetXf()
    out[ch] = { canvas: cv, ax: (ox + 4) / W, ay: (oy + 6) / H, res: DG_RES, adv: ch === '1' ? 7.6 : ch === '-' ? 8.4 : 9.4 }
  }
  return out
}
