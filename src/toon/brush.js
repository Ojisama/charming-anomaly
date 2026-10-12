import { mkCanvas } from './palette.js'
// The Mantle's brush: how every inked thing in the chapter is drawn (render-only).
//
// THE CEL ITSELF, the way a 1930s inker and painter laid it: a confident line, flat paint. A shape is
// a list of points (local units), mapped through a small transform stack (push/pop/tr/rot/sc) before
// it is drawn, so a contour can be resampled and inked as a polygon:
//   brush(c, pts, closed, w)   a pressure ink line on a SMOOTH path (never jittered): fat where the
//                              contour faces the shadow (lower right), thin toward the light (upper
//                              left), an open stroke tapering to a point at both ends. A closed contour
//                              starts and ends on its lit side, where it is thinnest, so no seam shows.
//   cel(c, pts, fill, o)       FLAT paint filling the line exactly, ONE hard-edged shadow shape on the
//                              lower right (a crisp crescent, never a gradient), at most one flat cream
//                              highlight, then the ink round it.
//   eye / glove / tube / flame the cartoon parts: pie-cut eyes (tall pill pupils, the wedge cut out),
//                              white four-finger gloves, rubber-hose tubes with no elbows, an S flame.
// What reads as a "90s 3D render" instead of a cartoon, and is therefore NOT here: airbrushed
// gradients and glows on a body, mottled paint, wobbling edges, several small shiny speculars.
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
  const P = resample(T(ptsLocal), 0.35, closed)
  if (P.length < 3) return
  w *= (s0 > 0 ? Math.min(1.25, Math.max(0.8, s0)) : 1) * INKMUL
  const si = ((brushSeed++) * 7310) | 0
  let seq
  const n = P.length
  let sign = 1
  if (closed) {
    sign = area(P) > 0 ? 1 : -1
    // start on the lit side (the shape's upper left), where the line is thinnest: no visible seam
    let best = 0, bv = 1e9
    for (let i = 0; i < n; i++) { const v = P[i][0] * LX + P[i][1] * LY; if (v < bv) { bv = v; best = i } }
    seq = []; for (let i = 0; i <= n + 1; i++) seq.push(P[(best + i) % n])
  } else seq = P
  const m = seq.length, Lp = [], Rp = []
  const taper = o.taper ?? 0.3
  for (let i = 0; i < m; i++) {
    const a = seq[Math.max(0, i - 3)], b = seq[Math.min(m - 1, i + 3)]
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l
    const nx = ty * sign, ny = -tx * sign
    const t = i / (m - 1)
    const face = closed ? clamp(nx * LX + ny * LY, -1, 1) : Math.abs(nx * LX + ny * LY) * 0.5
    // thick on the shadow side, thin toward the light: the one thing the width answers to
    let p = 0.36 + 1.0 * Math.pow(clamp(face * 0.5 + 0.5), 1.6)
    if (o.flat) p = 0.85
    // a long slow swell of the hand's pressure, never a jitter
    p *= 1 + 0.06 * n1((i * 0.35) / 9, si)
    let wi
    if (closed) wi = w * p
    else {
      const e = Math.min(t, 1 - t) / taper
      const tp = e >= 1 ? 1 : Math.sin(Math.max(0, e) * Math.PI / 2)
      wi = w * p * tp * (o.belly ? 0.55 + 0.6 * Math.sin(t * Math.PI) : 1)
    }
    wi = Math.max(0.04, wi)
    Lp.push([seq[i][0] + (nx * wi) / 2, seq[i][1] + (ny * wi) / 2]); Rp.push([seq[i][0] - (nx * wi) / 2, seq[i][1] - (ny * wi) / 2])
  }
  c.beginPath(); c.moveTo(Lp[0][0], Lp[0][1])
  for (let i = 1; i < m; i++) c.lineTo(Lp[i][0], Lp[i][1])
  for (let i = m - 1; i >= 0; i--) c.lineTo(Rp[i][0], Rp[i][1])
  c.closePath(); c.fillStyle = o.color || INK; c.fill()
}
// an open stroke (mouths, brows, creases, motion lines)
export function line(c, pts, w, o = {}) { brush(c, pts, false, w, o) }

// ---------------------------------------------------------------- THE CEL
// FLAT paint that fills the line exactly, ONE hard shadow shape from the lower right, an optional
// single flat cream highlight. The shadow is the fill's own darker hue laid over it: never a gradient.
export function cel(c, ptsLocal, fill, o = {}) {
  const P = T(ptsLocal)
  const [x0, y0, x1, y1] = bbox(P), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.max(x1 - x0, y1 - y0) / 2
  // An ink-less shape shows its own edge, and a 2D clip is not anti-aliased, so its shadow would end
  // in stair-steps: such a shape paints on a layer, kept only where the (anti-aliased) fill is.
  const layer = o.ink === 0 && (o.shade !== null || o.spec) ? mkCanvas(c.canvas.width, c.canvas.height) : null
  const dst = c
  if (layer) { const lc = layer.getContext('2d'); lc.setTransform(c.getTransform()); c = lc }
  pathOf(c, P); c.fillStyle = fill; c.fill()
  c.save()
  if (layer) c.globalCompositeOperation = 'source-atop'
  else { pathOf(c, P); c.clip() }
  // ONE shadow: the shape minus itself nudged toward the light, a crisp crescent on the lower right
  if (o.shade !== null) {
    const d = R * (o.shadeK ?? 0.34) + 0.3
    const S = P.map(([x, y]) => [cx + (x - cx) * 1.03 - d * 0.5, cy + (y - cy) * 1.03 - d * 0.82])
    c.beginPath(); c.rect(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8)
    c.moveTo(S[0][0], S[0][1]); for (let i = 1; i < S.length; i++) c.lineTo(S[i][0], S[i][1]); c.closePath()
    c.fillStyle = o.shade || 'rgba(70,10,30,0.4)'; c.fill('evenodd')
  }
  // at most ONE highlight: a flat cream comma on the lit shoulder
  if (o.spec) {
    const sr = R * (o.spec === true ? 0.2 : o.spec), sx = cx - R * 0.44, sy = cy - R * 0.5
    pathOf(c, ell(sx, sy, sr * 1.4, sr * 0.6, -0.75, 20)); c.fillStyle = o.hiCol || 'rgba(255,246,222,0.92)'; c.fill()
  }
  c.restore()
  if (layer) { dst.save(); dst.setTransform(1, 0, 0, 1, 0, 0); dst.drawImage(layer, 0, 0); dst.restore(); return }
  if (o.ink !== 0) brush(c, ptsLocal, true, o.ink ?? 1.6, o)
}
// a pie-cut eye: a cream oval, a tall black pill of a pupil with the wedge notch cut out of it
// toward the upper right (the wedge IS the shine)
export function eye(c, x, y, rx, ry, lookX = 0, lookY = 0, o = {}) {
  const W = o.white || '#fbf4e2'
  cel(c, ell(x, y, rx, ry, o.tilt || 0, 32), W, { ink: o.ink ?? 1.0, shade: null })
  const px = x + lookX * rx * 0.36, py = y + lookY * ry * 0.26, prx = rx * (o.pr ?? 0.46), pry = ry * (o.pry ?? 0.7)
  const Pp = T(ell(px, py, prx, pry, 0, 28))
  pathOf(c, Pp); c.fillStyle = INK; c.fill()
  const notch = T([[px + prx * 0.1, py - pry * 0.1], [px + prx * 1.6 * Math.cos(-1.15), py + pry * 1.6 * Math.sin(-1.15)], [px + prx * 1.6 * Math.cos(-0.3), py + pry * 1.6 * Math.sin(-0.3)]])
  c.save(); pathOf(c, Pp); c.clip(); pathOf(c, notch); c.fillStyle = W; c.fill(); c.restore()
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
// a ground shadow: one flat translucent oval with a crisp edge (no ink, no airbrush)
export function shadow(c, x, y, rx, ry, a = 0.32, col = '28,10,30') {
  pathOf(c, T(ell(x, y, rx, ry, 0, 40))); c.fillStyle = `rgba(${col},${a})`; c.fill()
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
