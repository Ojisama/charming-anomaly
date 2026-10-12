import { mkCanvas } from './palette.js'
// The Mantle's brush: how every inked thing in the chapter is drawn (render-only).
//
// THE CEL ITSELF. A shape is a list of points (local units), mapped through a small transform stack
// (push/pop/tr/rot/sc) before it is drawn, so a contour can be resampled and inked as a polygon:
//   brush(c, pts, closed, w)   a pressure ink line drawn by a HAND, not a vector: fat where the contour
//                              faces away from the light (upper left), its width and its path both
//                              wavering unevenly along the stroke (value noise on the arc length, never
//                              a sine), the two ends tapering by different amounts, and a closed contour
//                              starting at a random point and overlapping (or just missing) its start.
//   cel(c, pts, fill, o)       PAINT, laid by a brush: the colour slightly off the line (it overshoots
//                              the ink here, falls short of it there), gouache dabs dragged through it,
//                              ONE shadow brushed in as a hard-edged wobbly shape on the lower right (a
//                              painted crescent, not a gradient), an optional cream highlight blob, then
//                              the ink round it.
//   eye / glove / tube / flame the cartoon parts: pie-cut eyes, white four-finger gloves, rubber-hose
//                              tubes with no elbows, an S-curled flame.
// Only the cast, its shots, its pickups and the bubbles that peek out of the swell are drawn with
// this: the world itself (rock and lava) carries no ink at all (world.js's floor shader).

// ---------------------------------------------------------------- rng + noise
export function rng(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
const mix = (a, b, t) => a + (b - a) * t
// 1-D value noise (smooth, irregular) for the hand: a wavering that never repeats like a sine
function hn(i, s) { let h = (i * 374761393 + s * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
function n1(x, s) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return mix(hn(i, s), hn(i + 1, s), u) * 2 - 1 }

// ---------------------------------------------------------------- transform stack (points are mapped before drawing)
let M = [1, 0, 0, 1, 0, 0]
const stack = []
export function push() { stack.push(M.slice()) }
export function pop() { M = stack.pop() ?? [1, 0, 0, 1, 0, 0] }
export function resetXf() { M = [1, 0, 0, 1, 0, 0]; stack.length = 0 }
export function tr(x, y) { M = [M[0], M[1], M[2], M[3], M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]] }
export function rot(a) { const c = Math.cos(a), s = Math.sin(a); M = [M[0] * c + M[2] * s, M[1] * c + M[3] * s, -M[0] * s + M[2] * c, -M[1] * s + M[3] * c, M[4], M[5]] }
export function sc(sx, sy = sx) { M = [M[0] * sx, M[1] * sx, M[2] * sy, M[3] * sy, M[4], M[5]] }
export const mp = (p) => [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]]
const mscale = () => Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2]))
const T = (pts) => pts.map(mp)

// ---------------------------------------------------------------- shape generators (local coords)
export function ell(cx, cy, rx, ry, a = 0, n = 40, wob = 0, seed = 1) {
  const out = [], ca = Math.cos(a), sa = Math.sin(a)
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, k = 1 + wob * (Math.sin(t * 3 + seed) * 0.6 + Math.sin(t * 5 + seed * 2.3) * 0.4)
    const x = Math.cos(t) * rx * k, y = Math.sin(t) * ry * k
    out.push([cx + x * ca - y * sa, cy + x * sa + y * ca])
  }
  return out
}
export function polar(cx, cy, fn, n = 60) { const out = []; for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; const r = fn(t); out.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]) } return out }
// a teardrop: tip at -y; curl bends the tip sideways
export function drop(cx, cy, w, h, curl = 0, n = 40) {
  const out = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    const yy = -Math.cos(t) * h, s = (1 - Math.cos(t)) / 2
    const xx = w * Math.sin(t) * Math.pow(Math.sin(t / 2), 1.6) + curl * Math.pow(1 - s, 2) * w
    out.push([cx + xx, cy + yy * 0.5 + h * 0.15])
  }
  return out
}
// a rubber-hose tube round a polyline (round ends), as a closed outline
export function tube(path, w0, w1 = w0) {
  const P = resample(path, 0.5, false), n = P.length, L = [], R = []
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)]
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l
    const w = mix(w0, w1, i / (n - 1)) / 2
    L.push([P[i][0] - ty * w, P[i][1] + tx * w]); R.push([P[i][0] + ty * w, P[i][1] - tx * w])
  }
  const cap = (p, ang, w) => { const o = []; for (let j = 1; j < 8; j++) { const t = ang + (j / 8) * Math.PI; o.push([p[0] + Math.cos(t) * w, p[1] + Math.sin(t) * w]) } return o }
  const ae = Math.atan2(P[n - 1][1] - P[n - 2][1], P[n - 1][0] - P[n - 2][0]), as = Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0])
  return [...L, ...cap(P[n - 1], ae - Math.PI / 2, w1 / 2), ...R.reverse(), ...cap(P[0], as + Math.PI / 2, w0 / 2)]
}
// a quadratic bezier, sampled
export function qb(a, c, b, n = 16) { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]) } return o }
// a closed Catmull-Rom spline through control points
export function spline(pts, n = 8) {
  const out = [], m = pts.length
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m], p1 = pts[i], p2 = pts[(i + 1) % m], p3 = pts[(i + 2) % m]
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t
      out.push([0, 1].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)))
    }
  }
  return out
}
// a cartoon flame: a fat round base at (cx, cy), one tall S-curled tongue and two short side licks
export function flame(cx, cy, w, h, curl = 0.5) {
  const c = curl * w
  const P = [[0, w * 0.95], [-w * 0.85, w * 0.45], [-w * 0.95, -h * 0.2], [-w * 0.8 + c * 0.2, -h * 0.5], [-w * 0.45, -h * 0.36],
    [-w * 0.35 + c * 0.3, -h * 0.7], [c, -h], [w * 0.2 + c * 0.3, -h * 0.62], [w * 0.38, -h * 0.4], [w * 0.75 + c * 0.25, -h * 0.55], [w * 0.95, -h * 0.15], [w * 0.85, w * 0.45]]
  return spline(P, 6).map((p) => [p[0] + cx, p[1] + cy])
}

function resample(pts, step, closed) {
  const src = closed ? [...pts, pts[0]] : pts, out = [src[0]]
  let carry = 0
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i], L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (L === 0) continue
    let d = step - carry
    while (d <= L) { const t = d / L; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); d += step }
    carry = L - (d - step)
  }
  if (!closed) out.push(src[src.length - 1])
  else out.pop()
  return out
}
function area(P) { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1] } return s / 2 }
function pathOf(c, P) { c.beginPath(); c.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1]); c.closePath() }
function bbox(P) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) } return [x0, y0, x1, y1] }

// ---------------------------------------------------------------- THE BRUSH
export const INK = '#1e1513'
let INKMUL = 1
export function setInk(v) { INKMUL = v }
const LX = 0.55, LY = 0.83          // the shadow side (lower right)
let brushSeed = 1
export function seedBrush(s) { brushSeed = s }
export function brush(c, ptsLocal, closed, w, o = {}) {
  const s0 = mscale()
  const P = resample(T(ptsLocal), 0.4, closed)
  if (P.length < 3) return
  w *= (s0 > 0 ? Math.min(1.25, Math.max(0.8, s0)) : 1) * INKMUL
  const seed = (brushSeed++) * 7.31
  let seq
  const n = P.length
  let sign = 1
  if (closed) {
    sign = area(P) > 0 ? 1 : -1
    const start = Math.floor((Math.sin(seed) * 0.5 + 0.5) * n)
    const over = Math.max(2, Math.floor(n * (o.over ?? (0.02 + 0.09 * (Math.sin(seed * 3.7) * 0.5 + 0.5)))))
    seq = []; for (let i = 0; i < n + over; i++) seq.push(P[(start + i) % n])
  } else seq = P
  const m = seq.length, Lp = [], Rp = []
  const taper = o.taper ?? (closed ? 0.09 : 0.3)
  // the two ends of a stroke lift off unevenly: one quick, one dragged
  const si = (seed * 1000) | 0
  const tA = taper * (0.6 + 0.8 * hn(si, 3)), tB = taper * (0.6 + 0.8 * hn(si, 5))
  for (let i = 0; i < m; i++) {
    const a = seq[Math.max(0, i - 2)], b = seq[Math.min(m - 1, i + 2)]
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l
    const nx = ty * sign, ny = -tx * sign
    const t = i / (m - 1)
    const face = closed ? clamp(nx * LX + ny * LY, -1, 1) : Math.abs(nx * LX + ny * LY) * 0.6
    let p = 0.42 + 0.9 * Math.pow(clamp(face * 0.5 + 0.5), 1.4)
    if (o.flat) p = 0.85
    // the hand's pressure wavers along the stroke (arc length = i * 0.4 world px)
    const ln = i * 0.4
    p *= 1 + 0.2 * n1(ln / 2.2, si) + 0.12 * n1(ln / 0.8, si + 7)
    const e = Math.min(t / tA, (1 - t) / tB)
    const tp = e >= 1 ? 1 : Math.pow(Math.max(0, e), 0.65)
    const wi = Math.max(0.05, w * p * (closed ? mix(0.2, 1, tp) : tp) * (o.belly ? (0.6 + 0.6 * Math.sin(t * Math.PI)) : 1))
    const wob = (w * 0.2 + 0.12) * n1(ln / 3.5, si + 11) + 0.06 * n1(ln / 1.1, si + 13)
    const cx = seq[i][0] + nx * wob, cy = seq[i][1] + ny * wob
    Lp.push([cx + (nx * wi) / 2, cy + (ny * wi) / 2]); Rp.push([cx - (nx * wi) / 2, cy - (ny * wi) / 2])
  }
  c.beginPath(); c.moveTo(Lp[0][0], Lp[0][1])
  for (let i = 1; i < m; i++) c.lineTo(Lp[i][0], Lp[i][1])
  for (let i = m - 1; i >= 0; i--) c.lineTo(Rp[i][0], Rp[i][1])
  c.closePath(); c.fillStyle = o.color || INK; c.fill()
}
// an open stroke (mouths, brows, creases, motion lines)
export function line(c, pts, w, o = {}) { brush(c, pts, false, w, o) }

// ---------------------------------------------------------------- THE CEL
// flat paint, ONE soft airbrushed shadow from the lower right, an optional small cream specular.
// The shadow is the fill's own darker hue (never a grey wash): a Cuphead cel stays clean.
let celSeed = 1
// a polygon pushed in and out along its own normals by value noise: the paint's edge, by hand
function waver(P, amp, s, scale = 2.4) {
  const n = P.length, out = []
  let len = 0
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[(i + 1) % n]
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l
    if (i) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])
    const d = amp * (0.7 * n1(len / scale, s) + 0.3 * n1(len / (scale * 0.35), s + 3))
    out.push([P[i][0] + ty * d, P[i][1] - tx * d])
  }
  return out
}
export function cel(c, ptsLocal, fill, o = {}) {
  const P = T(ptsLocal)
  const [x0, y0, x1, y1] = bbox(P), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.max(x1 - x0, y1 - y0) / 2
  const cs = (celSeed++) * 131 + 7
  const k = clamp(R / 5, 0.25, 1)                       // small parts get a steadier hand
  // the paint, laid slightly off the line: where it overshoots, the colour peeks past the ink
  const Pp = o.ink === 0 ? P : waver(P, 0.45 * k, cs)
  // An inked shape hides its edge under the line; an ink-less one shows it, and a 2D clip is not
  // anti-aliased, so its dabs and shadow would end in stair-steps. Those paint on a layer instead,
  // kept only where the (anti-aliased) fill is, and the layer is stamped on.
  const layer = o.ink === 0 ? mkCanvas(c.canvas.width, c.canvas.height) : null
  const dst = c
  if (layer) { const lc = layer.getContext('2d'); lc.setTransform(c.getTransform()); c = lc }
  pathOf(c, Pp); c.fillStyle = fill; c.fill()
  c.save()
  if (layer) c.globalCompositeOperation = 'source-atop'
  else { pathOf(c, Pp); c.clip() }
  const r = rng(cs)
  // gouache: short dabs dragged on the brush's diagonal, a shade lighter and a shade darker
  if (R > 1.6 && o.dabs !== 0) {
    const N = Math.min(70, Math.round(((x1 - x0) * (y1 - y0)) / 7))
    for (let i = 0; i < N; i++) {
      const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0)
      const a = -0.65 + (r() - 0.5) * 0.7, L = 1.2 + r() * 2.8, wd = 0.35 + r() * 0.7
      c.fillStyle = r() < 0.5 ? 'rgba(255,244,220,' + (0.06 + r() * 0.07).toFixed(3) + ')' : 'rgba(50,14,24,' + (0.05 + r() * 0.07).toFixed(3) + ')'
      c.beginPath(); c.ellipse(x, y, L, wd, a, 0, 7); c.fill()
    }
  }
  // ONE shadow, brushed in: the shape minus itself nudged to the upper left, so it lies as a crescent
  // on the lower right with a hard but wobbly painted edge
  if (o.shade !== null) {
    const sh = o.shade || 'rgba(70,10,30,0.4)'
    const d = R * 0.3 + 0.4
    const S = waver(P.map(([x, y]) => [cx + (x - cx) * 1.02 - d * 0.5, cy + (y - cy) * 1.02 - d * 0.78]), 0.9 * k, cs + 17, 3.2)
    c.beginPath(); c.rect(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8)
    c.moveTo(S[0][0], S[0][1]); for (let i = 1; i < S.length; i++) c.lineTo(S[i][0], S[i][1]); c.closePath()
    c.fillStyle = sh; c.fill('evenodd')
    // a few dry strokes where the shadow brush ran out
    for (let i = 0; i < 4 && R > 2.5; i++) {
      const a = -0.65 + (r() - 0.5) * 0.5, j = r()
      const bx = cx + R * (0.15 + 0.5 * j), by = cy + R * (0.6 - 0.5 * j) * (r() < 0.5 ? 1 : -0.2)
      c.beginPath(); c.ellipse(bx, by, 1 + r() * 2, 0.25 + r() * 0.3, a, 0, 7); c.fill()
    }
  }
  if (o.spec) {
    const sx = cx - R * 0.42, sy = cy - R * 0.48, sr = R * (o.spec === true ? 0.22 : o.spec)
    // a flat cream blob, brushed (no gradient): a fat comma along the light
    const B = waver(ell(sx, sy, sr * 1.25, sr * 0.75, -0.6, 18), sr * 0.18, cs + 29, Math.max(0.6, sr))
    pathOf(c, B); c.fillStyle = 'rgba(255,248,228,0.88)'; c.fill()
  }
  c.restore()
  if (layer) { dst.save(); dst.setTransform(1, 0, 0, 1, 0, 0); dst.drawImage(layer, 0, 0); dst.restore(); return }
  if (o.ink !== 0) brush(c, ptsLocal, true, o.ink ?? 1.6, o)
}
// a pie-cut eye: a white oval, a black pupil with the wedge notch cut out of it toward the upper right
export function eye(c, x, y, rx, ry, lookX = 0, lookY = 0, o = {}) {
  cel(c, ell(x, y, rx, ry, o.tilt || 0, 28), o.white || '#f8f1de', { ink: o.ink ?? 1.1, shade: 'rgba(120,80,70,0.28)' })
  const px = x + lookX * rx * 0.35, py = y + lookY * ry * 0.3, prx = rx * (o.pr ?? 0.62), pry = ry * (o.pry ?? 0.7)
  const Pp = T(ell(px, py, prx, pry, 0, 28))
  pathOf(c, Pp); c.fillStyle = INK; c.fill()
  const notch = T([[px, py], [px + prx * 1.4 * Math.cos(-1.25), py + pry * 1.4 * Math.sin(-1.25)], [px + prx * 1.4 * Math.cos(-0.45), py + pry * 1.4 * Math.sin(-0.45)]])
  c.save(); pathOf(c, Pp); c.clip(); pathOf(c, notch); c.fillStyle = o.white || '#f8f1de'; c.fill(); c.restore()
}
// a white four-finger glove (from above: a puff with knuckle bumps) and its cuff; local +x = where it points
export function glove(c, x, y, r, a = 0) {
  push(); tr(x, y); rot(a)
  const G = '#f7efdc', S = 'rgba(110,90,120,0.38)'
  cel(c, ell(-r * 0.95, 0, r * 0.36, r * 0.72, 0, 20), G, { ink: 0.95, shade: S })
  const P = spline([[-r * 0.7, -r * 0.7], [-r * 0.05, -r * 1.1], [r * 0.35, -r * 0.8], [r * 1.0, -r * 0.62], [r * 0.78, -r * 0.18], [r * 1.18, r * 0.12], [r * 0.82, r * 0.44], [r * 0.98, r * 0.8], [r * 0.25, r * 0.95], [-r * 0.75, r * 0.65]], 6)
  cel(c, P, G, { ink: 1.05, shade: S })
  line(c, [[r * 0.72, -r * 0.2], [r * 0.3, -r * 0.12]], 0.7, { taper: 0.5 })
  line(c, [[r * 0.76, r * 0.42], [r * 0.32, r * 0.3]], 0.7, { taper: 0.5 })
  pop()
}
// a soft ground shadow (no ink)
export function shadow(c, x, y, rx, ry, a = 0.32, col = '28,10,30') {
  const [X, Y] = mp([x, y]), s = mscale()
  c.save(); c.translate(X, Y); c.scale(1, ry / rx)
  const R = rx * s
  const g = c.createRadialGradient(0, 0, 0, 0, 0, R)
  g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.6, `rgba(${col},${a * 0.7})`); g.addColorStop(1, `rgba(${col},0)`)
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill(); c.restore()
}
export function glow(c, x, y, r, col = '255,170,70', a = 0.35) {
  const [X, Y] = mp([x, y]), R = r * mscale()
  c.save(); c.globalCompositeOperation = 'lighter'
  const g = c.createRadialGradient(X, Y, 0, X, Y, R); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`)
  c.fillStyle = g; c.beginPath(); c.arc(X, Y, R, 0, 7); c.fill(); c.restore()
}
// a cartoon cloud puff (steam, dust)
export function puff(c, x, y, r, col = '#f1e6cc', shade = 'rgba(110,80,90,0.4)', ink = 0.9) {
  const P = polar(x, y, (t) => r * (1 + 0.22 * Math.abs(Math.sin(t * 3.5))), 36)
  cel(c, P, col, { ink, shade })
}
