// THE HOLE the Ophan rises out of and burrows into (staging/looks.js tear), seen from straight above in the shown world's
// own medium. One crater for every world: an irregular opening, a thrown-up rim lit from the up-left (the Topsoil lens's
// uLightDir, the light every painter here shades by) and shadowed down-right, its upper lip casting a shadow into the pit,
// and an inner wall that falls away into the dark. That height field is sampled and painted per world:
//   macro   soil shaded per pixel, clods and pale roots hanging into the dark (the Topsoil tile's browns)
//   holo    flat-shaded crystal facets with an iridescent cast, shards round the lip, a prismatic edge
//   ascii   typed: rubble glyphs on the mound, a stroke rim of '-' '/' '|' '\', the wall a fading ramp (src/ascii.js floor)
//   pixel   art pixels on the Magma's grid, the basalt ramp ordered-dithered, rubble blocks, a dull ember at the bottom
//   toon    flat cel bands of the Mantle's rock ramp, a thick-thin ink heavier down-right, inked dirt chunks
//   liquid  the melt dimpling: chrome bands, a spiral drawn down the funnel, a hard specular lip
// Each is baked ONCE per (look, size, level) into a real canvas and drawn with drawImage. `open` picks the smallest of
// three bakes (LEVELS) it fits and scales it, so a scar is a small hole with its glyphs, art pixels and ink at full size.
import { hash } from '../staging.js'

const TAU = Math.PI * 2
const LEVELS = [0.35, 0.6, 1]
const QB = 1.5   // device px per stage px of a painted bake (the passes over every world soften it anyway)
const L3 = (() => { const v = [-0.55, -0.7, 0.75], n = Math.hypot(...v); return v.map((q) => q / n) })()   // toward the light
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u)
const sstep = (a, b, u) => { const t = clamp01((u - a) / (b - a)); return t * t * (3 - 2 * t) }
const lerp = (a, b, k) => a + (b - a) * k
const mixC = (A, B, k) => [lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)]
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
const css = (c, a = 1) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'
// a colour ramp through stops at even spacing, v 0..1
const ramp = (S, v) => { const p = clamp01(v) * (S.length - 1), i = Math.min(S.length - 2, Math.floor(p)); return mixC(S[i], S[i + 1], p - i) }
// value noise on the staging hash, and three octaves of it
const vn = (x, y, s) => {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const h = (a, b) => hash(a + s * 131.7, b - s * 71.3)
  return lerp(lerp(h(i, j), h(i + 1, j), u), lerp(h(i, j + 1), h(i + 1, j + 1), u), v)
}
const fbm = (x, y, s) => 0.55 * vn(x, y, s) + 0.3 * vn(x * 2.1, y * 2.1, s + 1) + 0.15 * vn(x * 4.3, y * 4.3, s + 2)

// The crater's height field round its centre, stage px. a, b: the opening's semi-axes; m the smaller, the unit of every
// height. Returns a sampler: f(x, y) -> { r (the opening at 1), h, pit (how far under the floor), lit 0..1, dk (the dark
// of depth, 1 at the floor), sh (0 in the lip's shadow), ang (the opening's angle at x, y) }
function field(a, b, seed, o = {}) {
  const m = Math.min(a, b), p = [1, 2, 3, 4].map((i) => hash(seed, i) * TAU)
  const jag = o.jag ?? 0.05, rimH = (o.rim ?? 0.28) * m, depth = (o.depth ?? 1.8) * m, lump = (o.lump ?? 0.1) * m
  const seg = 28   // the lip's jags: one hashed offset per segment, eased between
  const rr = (t) => {
    const s = ((t / TAU) % 1 + 1) % 1 * seg, i = Math.floor(s), f = s - i, e = f * f * (3 - 2 * f)
    return 1 + 0.07 * Math.sin(3 * t + p[0]) + 0.05 * Math.sin(5 * t + p[1]) + 0.03 * Math.sin(9 * t + p[2]) + jag * (lerp(hash(seed + i % seg, 9), hash(seed + (i + 1) % seg, 9), e) - 0.5)
  }
  const H = (x, y) => {
    const ang = Math.atan2(y / b, x / a), r = Math.hypot(x / a, y / b) / rr(ang)
    const rim = rimH * Math.exp(-(((r - 1.02) / (r > 1.02 ? 0.24 : 0.07)) ** 2))
    const pit = r < 1 ? depth * Math.pow(1 - r, o.pow ?? 0.9) : 0
    const env = Math.exp(-(((r - 1.12) / 0.3) ** 2))
    const ls = m * (o.lumpS ?? 0.16), lu = lump ? lump * env * (fbm(x / ls, y / ls, seed) - 0.45) * 2 : 0
    return { r, ang, h: rim + lu - pit, pit }
  }
  const e = m * 0.04, k = Math.tan(0.85)   // the light's elevation, for the lip's shadow
  // fn.at(t, r): the point at angle t on the contour r (1 the opening), for walking a ring
  const fn = (x, y) => {
    const c = H(x, y), dx = (H(x + e, y).h - H(x - e, y).h) / (2 * e), dy = (H(x, y + e).h - H(x, y - e).h) / (2 * e)
    const n = Math.hypot(dx, dy, 1), lit = clamp01((-dx * L3[0] - dy * L3[1] + L3[2]) / n)
    // the shadow: march toward the light; anything standing above the ray shades this point
    let sh = 1
    if (c.r < 1.7) {
      const st = m * 0.13, hx = L3[0] / Math.hypot(L3[0], L3[1]), hy = L3[1] / Math.hypot(L3[0], L3[1])
      for (let i = 1; i <= 8; i++) { const d = st * i, q = H(x + hx * d, y + hy * d).h - (c.h + d * k); if (q > 0) { sh = Math.min(sh, 1 - clamp01(q / (m * 0.1))); if (!sh) break } }
    }
    return { ...c, lit, shade: lit / L3[2], sh, dk: Math.exp(-c.pit / ((o.fall ?? 0.45) * m)), nx: -dx / n, ny: -dy / n }
  }
  fn.ang = (x, y) => Math.atan2(y / b, x / a)
  fn.at = (t, r) => { const R = r * rr(t); return [Math.cos(t) * a * R, Math.sin(t) * b * R] }
  return fn
}
// points every `step` stage px round the contour r of field f: [x, y, tangent angle]
function ring(f, r, step) {
  const N = 720, P = []
  let acc = step / 2, [px, py] = f.at(0, r)
  for (let i = 1; i <= N; i++) {
    const [x, y] = f.at(i / N * TAU, r), d = Math.hypot(x - px, y - py)
    acc += d
    if (acc >= step) { acc -= step; P.push([x, y, Math.atan2(y - py, x - px)]) }
    px = x; py = y
  }
  return P
}

// a canvas W x H stage px at Q device px each, its 2D context set to stage px with the hole's centre at 0, 0
function canvasOf(W, H, Q) {
  const cv = document.createElement('canvas'); cv.width = Math.ceil(W * Q); cv.height = Math.ceil(H * Q)
  const g = cv.getContext('2d', { willReadFrequently: true })
  return { cv, g, W, H, Q }
}
// f sampled every S stage px over the canvas and blended between: the field is the dear part of a bake (each sample
// marches the lip's shadow), a pixel's own detail (grain, facets, ink) is not
const KEYS = ['r', 'h', 'pit', 'lit', 'shade', 'sh', 'dk', 'nx', 'ny']
function lattice(f, W, H, S) {
  const ni = Math.ceil(W / S) + 2, nj = Math.ceil(H / S) + 2, F = KEYS.map(() => new Float32Array(ni * nj))
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) { const p = f(i * S - W / 2, j * S - H / 2); KEYS.forEach((k, n) => { F[n][j * ni + i] = p[k] }) }
  const o = {}
  return (x, y) => {
    const u = (x + W / 2) / S, v = (y + H / 2) / S, i = Math.min(ni - 2, Math.floor(u)), j = Math.min(nj - 2, Math.floor(v)), fx = u - i, fy = v - j, q = j * ni + i
    for (let n = 0; n < KEYS.length; n++) { const A = F[n]; o[KEYS[n]] = (A[q] * (1 - fx) + A[q + 1] * fx) * (1 - fy) + (A[q + ni] * (1 - fx) + A[q + ni + 1] * fx) * fy }
    o.ang = f.ang(x, y)
    return o
  }
}
// per device pixel: col(f, x, y) -> [r, g, b, a 0..1] or null
function perPixel({ cv, g, W, H, Q }, f0, col) {
  const f = lattice(f0, W, H, 2.5)
  const img = g.createImageData(cv.width, cv.height), d = img.data
  for (let j = 0; j < cv.height; j++) for (let i = 0; i < cv.width; i++) {
    const x = (i + 0.5) / Q - W / 2, y = (j + 0.5) / Q - H / 2, c = col(f(x, y), x, y, i, j)
    if (!c) continue
    const q = (j * cv.width + i) * 4
    d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255 * clamp01(c[3])
  }
  g.putImageData(img, 0, 0)
  g.setTransform(Q, 0, 0, Q, W * Q / 2, H * Q / 2)
}
// points scattered round the lip, between radii r0 and r1 of the opening, nearest the viewer last
function scatter(a, b, n, r0, r1, seed) {
  const P = []
  for (let i = 0; i < n; i++) { const t = hash(seed + i, 21) * TAU, r = lerp(r0, r1, Math.pow(hash(seed + i, 22), 1.6)); P.push({ t, r, x: Math.cos(t) * a * r, y: Math.sin(t) * b * r, s: hash(seed + i, 23) }) }
  return P.sort((p, q) => p.y - q.y)
}

// ---- Topsoil (macro): photoreal soil ----
const SOIL = ['#130b06', '#3a2516', '#5e3f27', '#8a6440', '#b8946a'].map(hex)
function macro(a, b, seed) {
  const m = Math.min(a, b), C = canvasOf(a * 3.6, b * 3.6, QB), f = field(a, b, seed, { lump: 0.3, lumpS: 0.09, fall: 0.28, rim: 0.34 })
  perPixel(C, f, (p, x, y) => {
    const grain = 0.6 * vn(x / (m * 0.06), y / (m * 0.06), seed + 5) + 0.4 * hash(x * 7.1, y * 5.3), al = 1 - sstep(1.25, 1.75 + 0.3 * grain, p.r)
    if (al <= 0) return null
    // the wall's strata: bands of darker and paler soil round the opening, as a cut through topsoil shows
    const strata = p.r < 1 ? 0.82 + 0.3 * Math.sin(p.pit / m * 11 + grain * 4) * (0.5 + 0.5 * vn(p.ang * 6, p.pit / m * 3, seed)) : 1
    const v = 0.5 * Math.pow(p.shade, 1.4) * (0.25 + 0.75 * p.sh) * p.dk * (0.75 + 0.5 * grain) * strata
    const c = ramp(SOIL, v)
    return [c[0], c[1], c[2], al * (p.r < 1.1 ? 1 : 0.92)]
  })
  const g = C.g
  // roots: pale and thin, from the soil over the lip and hanging into the dark, each with its shadow down-right
  for (let i = 0; i < 7; i++) {
    // out of the wall, mostly the upper (far) lip, a hand's length into the void, wandering as a root does
    const t = -Math.PI / 2 + (hash(seed + i, 31) - 0.5) * 3.4, r0 = 1.08 + 0.12 * hash(seed + i, 32), L = m * (0.35 + 0.45 * hash(seed + i, 33))
    const x0 = Math.cos(t) * a * r0, y0 = Math.sin(t) * b * r0, d0 = Math.atan2(-y0 / b, -x0 / a) + (hash(seed + i, 34) - 0.5) * 0.8
    const N = 24, pts = []
    for (let k = 0, x = x0, y = y0; k <= N; k++) { pts.push([x, y]); const u = k / N, dd = d0 + 0.5 * Math.sin(u * 7 + i * 3) + u * (hash(seed + i, 36) - 0.5) * 2; x += Math.cos(dd) * L / N; y += Math.sin(dd) * L / N + u * L * 0.02 }
    const w = m * (0.025 + 0.025 * hash(seed + i, 35))
    for (let k = 0; k < N; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], p = f(x1, y1), dk = (0.25 + 0.75 * Math.pow(p.dk, 0.6) * (1 - 0.6 * k / N)) * (0.6 + 0.4 * p.sh), lw = w * (1 - 0.6 * k / N)
      g.lineCap = 'round'
      if (p.r > 0.95) { g.strokeStyle = 'rgba(8,5,3,0.45)'; g.lineWidth = lw * 1.4; g.beginPath(); g.moveTo(x0 + lw, y0 + lw * 1.3); g.lineTo(x1 + lw, y1 + lw * 1.3); g.stroke() }
      g.strokeStyle = css(mixC([20, 13, 8], [214, 192, 156], dk)); g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke()
    }
  }
  // clods thrown up on the rim: lit up-left, a contact shadow down-right
  for (const q of scatter(a, b, 40, 1.0, 1.55, seed + 40)) {
    const r = m * (0.05 + 0.13 * q.s * q.s) * (q.r > 1.3 ? 0.65 : 1), p = f(q.x, q.y)
    if (p.r < 0.97) continue
    g.fillStyle = 'rgba(8,4,2,0.7)'; g.beginPath(); g.ellipse(q.x + r * 0.45, q.y + r * 0.55, r * 1.1, r * 0.9, 0, 0, TAU); g.fill()
    const gr = g.createRadialGradient(q.x - r * 0.4, q.y - r * 0.45, r * 0.1, q.x, q.y, r * 1.05)
    const base = q.s > 0.9 ? [118, 112, 104] : [112, 78, 50]
    gr.addColorStop(0, css(mixC(base, [240, 214, 178], 0.6))); gr.addColorStop(0.4, css(base)); gr.addColorStop(1, css(mixC(base, [10, 6, 3], 0.85)))
    g.fillStyle = gr; g.beginPath()
    for (let k = 0; k <= 10; k++) { const t = k / 10 * TAU, w = r * (0.82 + 0.3 * hash(q.t * 9 + k, 41)); k ? g.lineTo(q.x + Math.cos(t) * w, q.y + Math.sin(t) * w * 0.9) : g.moveTo(q.x + Math.cos(t) * w, q.y + Math.sin(t) * w * 0.9) }
    g.fill()
  }
  return C
}

// ---- Geode (holo): crystal facets, shards, a prismatic edge ----
const hsl = (h, s, l) => { const k = (n) => (n + h / 30) % 12, A = s * Math.min(l, 1 - l), F = (n) => l - A * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [F(0) * 255, F(8) * 255, F(4) * 255] }
function holo(a, b, seed) {
  const m = Math.min(a, b), C = canvasOf(a * 3.4, b * 3.4, QB), f = field(a, b, seed, { lump: 0.05, jag: 0.12, rim: 0.32, fall: 0.35 }), P = m * 0.42
  // a facet per jittered cell: flat-shaded by the field's normal at its seed, tilted a little
  const seeds = new Map()
  const seedOf = (i, j) => {
    const k = i * 4096 + j
    let s = seeds.get(k)
    if (!s) seeds.set(k, (s = [(i + 0.15 + 0.7 * hash(i + seed, j + 61)) * P, (j + 0.15 + 0.7 * hash(i - seed, j + 62)) * P]))
    return s
  }
  const facet = new Map()
  const faceOf = (i, j) => {
    const k = i + ',' + j
    let F = facet.get(k)
    if (!F) {
      const [x, y] = seedOf(i, j), p = f(x, y), tx = (hash(i, j + 63) - 0.5) * 0.5, ty = (hash(i, j + 64) - 0.5) * 0.5
      const lit = clamp01(p.lit + tx * L3[0] + ty * L3[1])
      F = { p, lit, hue: (Math.atan2(p.ny + ty, p.nx + tx) * 57.3 + 400 + hash(i, j + 65) * 50) % 360 }
      facet.set(k, F)
    }
    return F
  }
  perPixel(C, f, (p, x, y) => {
    const ci = Math.floor(x / P), cj = Math.floor(y / P)
    let d1 = 1e9, d2 = 1e9, best = null
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const [sx, sy] = seedOf(i, j), d = Math.hypot(x - sx, y - sy)
      if (d < d1) { d2 = d1; d1 = d; best = [i, j] } else if (d < d2) d2 = d
    }
    const F = faceOf(best[0], best[1]), edge = 1 - sstep(0.3, 1.1, d2 - d1)
    // the crust breaks along facet edges: a facet whose heart is past the mound is not there at all
    if (F.p.r > 1.32 && p.r > 1) return null
    const dk = p.dk * (0.3 + 0.7 * p.sh)
    // the floor's dark violet body, a lavender lit face, a little of the foil's own hues; the lit edges catch the light
    let c = mixC(hex('#0b0714'), hex('#b8a8e8'), Math.pow(F.lit, 2.2) * dk)
    c = mixC(c, hsl(F.hue, 0.45, 0.7), 0.18 * F.lit * dk)
    c = mixC(c, F.lit > 0.6 ? [250, 246, 255] : [6, 4, 12], edge * (F.lit > 0.6 ? 0.7 : 0.8) * Math.max(dk, 0.2))
    const al = 1
    // the prismatic edge: a thin rainbow along the lip, brightest on the lit side
    const pe = Math.exp(-(((p.r - 0.99) / 0.035) ** 2))
    if (pe > 0.02) c = mixC(c, hsl((p.ang * 57.3 * 2 + 360) % 360, 1, 0.7), pe * (0.45 + 0.5 * p.lit))
    return [c[0], c[1], c[2], al]
  })
  // shards thrown round the lip: two-faced blades pointing out, lit face and shadow face, a prismatic edge
  // a crystal: two faces either side of its spine from base (x, y) along (dx, dy), lit by which way each face turns,
  // dimmed by k, a prismatic glint up its spine
  const g = C.g
  const crystal = (x, y, dx, dy, L, W, k, hue) => {
    const tip = [x + dx * L, y + dy * L], l = [x - dy * W, y + dx * W], r = [x + dy * W, y - dx * W]
    const sideL = clamp01(0.5 - 0.7 * (-dy * L3[0] + dx * L3[1]) / Math.hypot(L3[0], L3[1]))
    for (const [A, lit] of [[l, sideL], [r, 1 - sideL]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(A[0], A[1]); g.lineTo(tip[0], tip[1]); g.closePath(); g.fillStyle = css(mixC(hex('#0b0714'), mixC(hex('#d8ccff'), hsl(hue, 0.8, 0.7), 0.3), lit * k)); g.fill() }
    g.lineWidth = m * 0.01
    g.strokeStyle = css(hsl(hue, 1, 0.72), 0.8 * k); g.beginPath(); g.moveTo(x, y); g.lineTo(tip[0], tip[1]); g.stroke()
    g.strokeStyle = 'rgba(11,7,20,0.9)'; g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(tip[0], tip[1]); g.lineTo(r[0], r[1]); g.stroke()
  }
  // the geode's lining: druzy points growing off the wall toward the dark, the far ones lit, the deep tips lost
  const D = []
  for (let i = 0; i < 56; i++) {
    const t = (i + 0.6 * hash(seed + i, 72)) / 56 * TAU, r = 0.97 - 0.2 * hash(seed + i, 73), x = f.at(t, r)[0], y = f.at(t, r)[1]
    const ux = -Math.cos(t) / a + (hash(seed + i, 75) - 0.5) / m, uy = -Math.sin(t) / b, un = Math.hypot(ux, uy), L = m * (0.22 + 0.35 * hash(seed + i, 74))
    D.push({ x, y, dx: ux / un, dy: uy / un, L, t })
  }
  // deepest first, so the ones nearer the lip overlap them
  for (const d of D.sort((p, q) => f(q.x, q.y).r - f(p.x, p.y).r)) {
    const p = f(d.x + d.dx * d.L * 0.5, d.y + d.dy * d.L * 0.5), k = Math.pow(p.dk, 0.35) * (0.3 + 0.7 * p.sh)
    crystal(d.x, d.y, d.dx, d.dy, d.L, d.L * 0.34, k, (d.t * 57.3 * 2 + 200) % 360)
  }
  // shards thrown round the lip, pointing out
  for (const q of scatter(a, b, 10, 1.02, 1.2, seed + 70)) {
    const t = q.t + (hash(q.s * 99, 71) - 0.5) * 0.5, ux = Math.cos(t) / a, uy = Math.sin(t) / b, un = Math.hypot(ux, uy), L = m * (0.25 + 0.35 * q.s)
    crystal(q.x, q.y, ux / un, uy / un, L, L * 0.3, 1, (t * 57.3 * 3 + 720) % 360)
  }
  return C
}

// ---- the Mine (ascii): typed rubble, a stroke rim, the wall a fading ramp ----
const SERIF = 'Georgia, "Noto Serif", "DejaVu Serif", "Times New Roman", serif', MONO = '"DejaVu Sans Mono", Menlo, Consolas, "Courier New", monospace'
const DUST = ['#2a241e', '#4e473e', '#766c5e', '#9a8e7c', '#d6be96', '#f0e2c0'].map(hex)
function ascii(a, b, seed) {
  const m = Math.min(a, b), C = canvasOf(a * 3.2 + 24, b * 3.2 + 24, 2), f = field(a, b, seed, { lump: 0.16, jag: 0.08 }), g = C.g
  // the backing: the pit black, the mound hushed, so the floor's own glyphs do not type through the rubble
  perPixel(C, f, (p) => { const al = 1 - sstep(1.05, 1.5, p.r); return al > 0 ? [0, 0, 0, al * (p.r < 1 ? 1 : 0.85)] : null })
  g.textAlign = 'center'; g.textBaseline = 'middle'
  const put = (ch, x, y, col, size, al, font, rot = 0) => {
    if (al < 0.04) return
    g.save(); g.translate(x, y); g.rotate(rot); g.font = 'bold ' + size + 'px ' + font; g.globalAlpha = Math.min(1, al); g.fillStyle = css(col); g.fillText(ch, 0, 0); g.restore()
  }
  const lit = (p) => p.lit * (0.25 + 0.75 * p.sh) / L3[2]
  const edgeCh = (t) => '-\\|/'[Math.round((((t % Math.PI) + Math.PI) % Math.PI) / (Math.PI / 4)) % 4]
  // the mound's skirt: the floor's own light marks thinning out, on its 12 px grid
  const FC = 12, ni = Math.ceil(C.W / FC), nj = Math.ceil(C.H / FC)
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    const x = (i + 0.2 + 0.6 * hash(i + seed, j + 81)) * FC - C.W / 2, y = (j + 0.2 + 0.6 * hash(i - seed, j + 82)) * FC - C.H / 2
    const p = f(x, y), h = hash(i + seed * 3, j + 83)
    if (p.r < 1.2 || p.r > 1.5 || h < (p.r - 1.2) * 3) continue
    const v = lit(p), up = Math.max(0, p.h) / (m * 0.3)
    put(up > 0.35 && h > 0.5 ? '#%&$'[Math.floor(h * 8) % 4] : ".,':-~;=^"[Math.floor(h * 9)], x, y, ramp(DUST, 0.15 + 0.6 * v), 12 + 4 * Math.min(1, up), 0.5 + 0.4 * v, SERIF, (hash(i, j + 84) - 0.5) * 0.6)
  }
  // the wall: typed rings stepping down into the dark, a line of glyphs a step, the lit far side brightest
  for (let k = 1, r = 1 - 11 / b; r > 0.15; k++, r -= 11 / b) {
    for (const [x, y, t] of ring(f, r, 10)) {
      const p = f(x, y), w = Math.min(1, 1.5 * lit(p) * p.dk)
      put('=-~:.'[Math.min(4, k - 1)], x, y, ramp(DUST, 0.1 + 0.85 * w), 13 - Math.min(4, k), 0.2 + 0.9 * w, MONO, t)
    }
  }
  // the rubble thrown up: heavy glyphs round the lip, lit up-left
  for (const [r, step] of [[1.26, 13], [1.12, 10]]) for (const [x0, y0] of ring(f, r, step)) {
    const h = hash(x0 * 0.37 + seed, y0 * 0.29), x = x0 + (h - 0.5) * 6, y = y0 + (hash(y0 * 0.41, x0 * 0.23 + seed) - 0.5) * 5
    if (r > 1.2 && h < 0.3) continue
    const v = Math.min(1.2, lit(f(x, y)))
    put('#%@&#%$&'[Math.floor(h * 8)], x, y, ramp(DUST, 0.06 + 0.5 * v * v), (r > 1.2 ? 11 : 13) + 4 * h, (r > 1.2 ? 0.3 : 0.4) + 0.5 * v, SERIF, (h - 0.5) * 0.5)
  }
  // the lip: one clean stroke row, gilded where the light falls, dull where the wall drops away from it
  for (const [x, y, t] of ring(f, 1, 8)) {
    const v = lit(f(x, y))
    put(edgeCh(t), x, y, ramp([hex('#3a2c1c'), hex('#8c6028'), hex('#f0c478'), hex('#fff0c8')], v * 0.85), 15, 0.5 + 0.5 * v, MONO)
  }
  return C
}

// ---- the Magma (pixel): art pixels, the basalt ramp dithered, a dull ember at the bottom ----
const BASALT = ['#0a0608', '#1c1620', '#2c2430', '#463c4c', '#625670', '#8c7e9c'].map(hex)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
function pixel(a, b, seed) {
  const AP = 2   // stage px per art pixel: the Magma's PX, the grid its CRT pass snaps to
  const m = Math.min(a, b), C = canvasOf(Math.ceil(a * 3.3 / AP) * AP, Math.ceil(b * 3.3 / AP) * AP, 1 / AP), f = field(a, b, seed, { lump: 0.22, lumpS: 0.3, jag: 0.14, fall: 0.35 })
  const ni = C.cv.width, nj = C.cv.height, cell = new Array(ni * nj).fill(-1)
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    // banded, as the chapter's sprites are shaded: the dither only where one band meets the next
    const p = f((i + 0.5) * AP - C.W / 2, (j + 0.5) * AP - C.H / 2), d = 0.5 + ((BAYER[(j & 3) * 4 + (i & 3)] + 0.5) / 16 - 0.5) * 0.45
    if (p.r > 1.4 + 0.1 * (fbm(i * 0.12, j * 0.12, seed) - 0.5) * 2) continue
    if (p.r < 1) {
      // the pit: stepped terraces down the ramp into ink, then the ember far below
      if (p.pit > m * 1.2) { const e = (p.pit - m * 1.2) / (m * 0.5) + (fbm(i * 0.4, j * 0.4, seed + 3) - 0.5) * 0.8; cell[j * ni + i] = e + d > 1.4 ? 7 : e + d > 0.9 ? 6 : 0; continue }
      // the lit wall's top edge catches the light in one bright row
      const top = p.r > 0.93 && p.shade * p.sh > 1.2
      cell[j * ni + i] = top ? 5 : Math.max(0, Math.min(4, Math.floor(2.6 * Math.pow(p.shade, 1.3) * (0.25 + 0.75 * p.sh) * p.dk + d - 0.3)))
    } else {
      // the mound: the floor's basalt (2) on the flat, bands up where it turns to the light, down where it turns away;
      // its crest a bright row where it faces the light
      const crest = p.r < 1.07 && p.shade * p.sh > 1.15
      cell[j * ni + i] = crest ? 5 : Math.max(1, Math.min(5, Math.floor(2 + 4 * (p.shade * (0.35 + 0.65 * p.sh) - 1) + d)))
    }
  }
  // rubble blocks on the mound: a lit top-left, an ink bottom-right
  for (const q of scatter(a, b, 20, 1.05, 1.32, seed + 90)) {
    const i0 = Math.floor((q.x + C.W / 2) / AP), j0 = Math.floor((q.y + C.H / 2) / AP), n = 3 + Math.floor(q.s * 3)
    for (let dj = 0; dj < n; dj++) for (let di = 0; di < n; di++) {
      const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= ni || j >= nj || (di === 0 || di === n - 1) && (dj === 0 || dj === n - 1)) continue
      cell[j * ni + i] = di === n - 1 || dj === n - 1 ? 0 : di === 0 || dj === 0 ? 4 : 3
    }
  }
  // the outline: a mound cell next to nothing goes ink, as the chapter's sprites are drawn
  const PAL = [...BASALT, hex('#7a1004'), hex('#d8340c')]
  const img = C.g.createImageData(ni, nj), d = img.data
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    let k = cell[j * ni + i]
    if (k < 0) continue
    const out = (u, v) => u < 0 || v < 0 || u >= ni || v >= nj || cell[v * ni + u] < 0
    if (out(i + 1, j) || out(i, j + 1) || out(i - 1, j) || out(i, j - 1)) k = 0
    const c = PAL[k], q = (j * ni + i) * 4
    d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255
  }
  C.g.putImageData(img, 0, 0)
  C.crisp = true
  return C
}

// ---- the Mantle (toon): flat cel bands of the rock ramp, a thick-thin ink, inked dirt chunks ----
const ROCK = ['#1c120d', '#3a2418', '#5b3b2a', '#8a6446', '#b89468', '#dcc392'].map(hex), INK = hex('#1c120d'), PAPER = hex('#f3e6c8')
function toon(a, b, seed) {
  const m = Math.min(a, b), C = canvasOf(a * 3.3, b * 3.3, QB), f = field(a, b, seed, { lump: 0.04, jag: 0.06, rim: 0.34 })
  // the ink is heavier on the shadow side, down-right: its width follows how far a point's outward normal turns away
  const heavy = (x, y) => 1 + 1.4 * Math.max(0, (x / a * 0.62 + y / b * 0.78) / Math.max(1e-6, Math.hypot(x / a, y / b)))
  perPixel(C, f, (p, x, y) => {
    const edge = 1.38 + 0.06 * Math.sin(p.ang * 5 + seed) + 0.04 * Math.sin(p.ang * 11 + seed * 2), wk = heavy(x, y) * m * 0.028
    const dIn = Math.abs(p.r - 1) * m, dOut = Math.abs(p.r - edge) * m
    if (p.r > edge + 0.07 * 1.4) return null
    if (dIn < wk || dOut < wk * 0.8) return [...INK, 1]
    if (p.r > edge) return dOut < wk * 0.8 + m * 0.035 ? [...PAPER, 0.9] : null
    if (p.r < 1) {
      // the wall: three cels into the dark, the far (lit) wall one band up, the pit's heart ink
      const v = p.shade * (p.sh > 0.5 ? 1 : 0.45) * p.dk
      return [...ROCK[p.dk < 0.3 ? 0 : v > 1.1 ? 3 : v > 0.55 ? 2 : 1], 1]
    }
    const v = p.shade * (p.sh > 0.5 ? 1 : 0.6)
    return [...ROCK[v > 1.3 ? 5 : v > 0.95 ? 4 : v > 0.65 ? 3 : 2], 1]
  })
  // dirt chunks on the mound: an ink cut offset down-right, a cel fill, a shadow cel, a gloss tick
  const g = C.g
  for (const q of scatter(a, b, 16, 1.08, 1.32, seed + 50)) {
    const r = m * (0.07 + 0.08 * q.s), blob = (o, s) => { g.beginPath(); for (let k = 0; k <= 12; k++) { const t = k / 12 * TAU, w = r * s * (0.85 + 0.25 * hash(q.t * 7 + k, 51)); k ? g.lineTo(q.x + o + Math.cos(t) * w, q.y + o * 1.2 + Math.sin(t) * w * 0.85) : g.moveTo(q.x + o + Math.cos(t) * w, q.y + o * 1.2 + Math.sin(t) * w * 0.85) } g.closePath() }
    blob(m * 0.012, 1.22); g.fillStyle = css(INK); g.fill()
    blob(0, 1); g.fillStyle = css(ROCK[4]); g.fill()
    g.save(); blob(0, 1); g.clip(); g.fillStyle = css(ROCK[3]); g.beginPath(); g.ellipse(q.x + r * 0.45, q.y + r * 0.5, r, r * 0.85, 0, 0, TAU); g.fill(); g.restore()
    g.strokeStyle = css(PAPER); g.lineCap = 'round'; g.lineWidth = r * 0.16; g.beginPath(); g.arc(q.x - r * 0.15, q.y - r * 0.15, r * 0.5, Math.PI * 1.1, Math.PI * 1.45); g.stroke()
  }
  return C
}

// ---- the Core (liquid): the melt dimpling, chrome bands, a spiral drawn down, a hard specular lip ----
const CHROME = ['#050608', '#14161b', '#3a3f48', '#5d6574', '#9aa3b0', '#f4f7fc'].map(hex)
function liquid(a, b, seed) {
  const m = Math.min(a, b), C = canvasOf(a * 3, b * 3, QB), f = field(a, b, seed, { lump: 0, jag: 0, rim: 0.16, pow: 1.6, depth: 2.4, fall: 0.5 })
  perPixel(C, f, (p) => {
    const al = 1 - sstep(1.1, 1.45, p.r)
    if (al <= 0) return null
    // a mirror: what the normal reflects of an overhead light, its tilt toward the light, a tight specular
    const nz = Math.sqrt(Math.max(0, 1 - p.nx * p.nx - p.ny * p.ny)), tilt = p.nx * L3[0] + p.ny * L3[1], flat = nz
    const spec = Math.pow(clamp01(2 * nz * p.nx * L3[0] + 2 * nz * p.ny * L3[1] + (2 * nz * nz - 1) * L3[2]), 24)
    // the spiral the melt draws as it goes down
    const sw = p.r < 1 ? Math.pow(0.5 + 0.5 * Math.sin(p.ang * 3 + Math.log(p.r + 0.04) * 6 + seed), 5) * Math.sin(Math.PI * clamp01(p.r * 1.1)) : 0
    let v = 0.42 + 0.9 * tilt * (1 - flat * 0.5)
    v = (v * (0.35 + 0.65 * p.sh)) * p.dk + 0.45 * sw * Math.sqrt(p.dk) * (0.5 + 0.5 * p.sh)
    let c = ramp(CHROME, clamp01(v))
    c = mixC(c, [255, 255, 255], clamp01(spec * p.sh * 1.4))
    // the throat: dark, a dull red heat far down
    if (p.r < 0.3) c = mixC(c, [90, 10, 12], 0.5 * (1 - p.r / 0.3) ** 2)
    return [c[0], c[1], c[2], al]
  })
  return C
}

const PAINT = { macro, holo, ascii, pixel, toon, liquid }
const bakes = new Map()
// a bake per 8 px of size: the boss's R is fixed for a fight, so a world bakes its three levels and no more
function bakeOf(look, w, h, L, seed) {
  const bw = Math.max(8, Math.round(w * L / 8) * 8), bh = Math.max(8, Math.round(h * L / 8) * 8), key = look + ':' + bw + ':' + bh + ':' + seed
  let B = bakes.get(key)
  if (!B) { B = (PAINT[look] ?? macro)(bw / 2, bh / 2, seed); B.bw = bw; bakes.set(key, B) }
  return B
}
// every level of a world's hole ahead of its first beat (a full-size bake is ~75 ms on a desktop): for a warm-up
export function warmHole(look, w, h, seed = 1) { for (const L of LEVELS) bakeOf(look, w, h, L, seed) }
// the hole in world `look` round (x, y): its opening w wide and h tall at open 1; open 0..1; px2d c
export function hole(c, look, x, y, w, h, open, seed = 1) {
  if (open <= 0.01) return
  const L = LEVELS.find((l) => l >= open) ?? 1, B = bakeOf(look, w, h, L, seed)
  const s = (open / L) * (w * L / B.bw)
  c.save()
  c.globalAlpha = Math.min(1, open / 0.08)
  if (B.crisp) c.imageSmoothingEnabled = false
  c.drawImage(B.cv, x - B.W * s / 2, y - B.H * s / 2, B.W * s, B.H * s)
  c.restore()
}
