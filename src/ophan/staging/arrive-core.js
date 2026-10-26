// THE ARRIVAL in the Core (src/ophan/staging.js): its looks override looks.js's. The fight starts here, at the nexus of the
// earth, so this is the one arrival that has to be majestic (owner, 2026-10-25: "bigger or with god rays lighting up the
// arrival. And more smoke and liquid"). Seen from straight above: the melt surges, light breaks out of it in a fan of
// slow-turning shafts over the floor, steam billows up lit from the hole, and the boss rises out of the metal past full size,
// shedding it in stretched mirror drops that fall back and ring the pool, then settles. One crescendo, then calm.
//   C · the dome: the melt swells into a mirror dome that splits, the boss comes up through it wearing the metal
//   D · the geyser: the hole opens, a white-hot column erupts from it and the boss rides up the column as it falls back
import { stage, ease, win, hash } from '../staging.js'
import { tear, HY, HW, HH } from './hole.js'

const TAU = Math.PI * 2
const L3 = [-0.55, -0.7, 0.75].map((v, i, a) => v / Math.hypot(...a))   // toward the light (hole.js's): up-left
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u)
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c }
const CHROME = [[5, 6, 8], [20, 22, 27], [58, 63, 72], [93, 101, 116], [154, 163, 176], [244, 247, 252]]
const chrome = (v) => { const p = clamp01(v) * 5, i = Math.min(4, Math.floor(p)), f = p - i, A = CHROME[i], B = CHROME[i + 1]; return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f] }

// ---- bakes, made once ----
// a mirror dome of the melt, 256 px across: chrome by its normal, a hard specular up-left, its foot blending into the pool
const DOME = (() => {
  const N = 256, cv = mk(N, N), g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N * 2 - 1, y = (j + 0.5) / N * 2 - 1, r = Math.hypot(x, y)
    if (r >= 1) continue
    // height (1 - r^2)^1.4: a swell with a soft foot; its normal, and what it mirrors of a lamp up-left
    const s = 1.4 * 2 * Math.pow(1 - r * r, 0.4) * 0.28, nx = x * s, ny = y * s, n = Math.hypot(nx, ny, 1), Nx = nx / n, Ny = ny / n, Nz = 1 / n
    const rl = 2 * Nz * (Nx * L3[0] + Ny * L3[1] + Nz * L3[2]) - L3[2], spec = 0.75 * Math.pow(clamp01(rl), 18)
    const band = 0.5 + 0.5 * Math.sin((Nx * 0.8 + Ny) * 5.5)   // the far lamps a mirror shows as soft bands
    const v = 0.52 + 0.6 * (Nx * L3[0] + Ny * L3[1]) / 0.75 + 0.25 * band * (1 - Nz)
    const c = chrome(v), q = (j * N + i) * 4, sp = clamp01(spec * 1.3)
    d[q] = c[0] + (255 - c[0]) * sp; d[q + 1] = c[1] + (255 - c[1]) * sp; d[q + 2] = c[2] + (255 - c[2]) * sp
    d[q + 3] = 255 * Math.pow(clamp01((1 - r) / 0.65), 1.8)   // its foot is the pool itself: no edge
  }
  g.putImageData(img, 0, 0)
  return cv
})()
// a mirror drop, 32 x 16, pointing +x: a bead at the head, a tapering tail, dark body with one hard streak of light
const DROP = (() => {
  const W = 32, H = 16, cv = mk(W, H), g = cv.getContext('2d')
  // a hair-thin tail swelling into a round bead, as a drop of mercury pulls out in flight
  const hr = 5, hx = W - hr - 1
  const body = () => { g.beginPath(); g.moveTo(1, H / 2); g.lineTo(hx - hr * 1.2, H / 2 - 1.2); g.quadraticCurveTo(hx - hr * 0.6, H / 2 - hr, hx, H / 2 - hr); g.arc(hx, H / 2, hr, -Math.PI / 2, Math.PI / 2); g.quadraticCurveTo(hx - hr * 0.6, H / 2 + hr, hx - hr * 1.2, H / 2 + 1.2); g.closePath(); g.fill() }
  const gr = g.createLinearGradient(0, H / 2 - hr, 0, H / 2 + hr)
  gr.addColorStop(0, '#f4f7fc'); gr.addColorStop(0.3, '#8a93a3'); gr.addColorStop(0.65, '#262a32'); gr.addColorStop(1, '#9aa3b0')
  g.fillStyle = gr; body()
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1; g.lineCap = 'round'; g.beginPath(); g.moveTo(W * 0.45, H / 2 - 0.4); g.quadraticCurveTo(hx - hr, H / 2 - hr * 0.6, hx, H / 2 - hr * 0.62); g.stroke()
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(hx + 1, H / 2 - 2, 1.5, 0, TAU); g.fill()
  return cv
})()
// steam, 4 billows of 128 px: a density of soft lobes shaded by its own slope, lit from +x (turned to face the light when
// drawn), a cool shadow side, a warm lit edge
// billow v's density and light at (x, y) in -0.5..0.5, null where it is clear (every world's billows share it)
function billowOf(v) {
  const L = Array.from({ length: 9 }, (_, i) => { const a = hash(v, i) * TAU, r = 0.32 * hash(v, i + 20); return [Math.cos(a) * r, Math.sin(a) * r, 0.16 + 0.16 * hash(v, i + 40)] })
  const D = (x, y) => { let s = 0; for (const [cx, cy, r] of L) s += Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (r * r)); return s }
  return (x, y) => {
    const e = 0.01, den = D(x, y)
    if (den < 0.02) return null
    const gx = (D(x + e, y) - D(x - e, y)) / (2 * e), gy = (D(x, y + e) - D(x, y - e)) / (2 * e), n = Math.hypot(gx, gy) || 1
    return { den, lit: clamp01(0.5 - 0.5 * (gx / n) * Math.min(1, n / 4) + 0.15 * (x * 2)) }
  }
}
const PUFF = [0, 1, 2, 3].map((v) => {
  const N = 128, cv = mk(N, N), g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data, B = billowOf(v)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N - 0.5, y = (j + 0.5) / N - 0.5, b = B(x, y)
    if (!b) continue
    const { den, lit } = b
    const c = lit > 0.5 ? [104 + (214 - 104) * (lit - 0.5) * 2, 106 + (192 - 106) * (lit - 0.5) * 2, 114 + (168 - 114) * (lit - 0.5) * 2] : [34 + 70 * lit * 2, 37 + 69 * lit * 2, 45 + 69 * lit * 2]
    const q = (j * N + i) * 4
    d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255 * clamp01(den * 0.9) * clamp01((0.5 - Math.hypot(x, y)) / 0.12)
  }
  g.putImageData(img, 0, 0)
  return cv
})

// ---- the pieces, each a pure function of the beat ----
// god rays: n shafts fanned from (x, y) over the floor, additive, turning slowly; s 0..1 their strength, L their reach
// spec: { sets: stop lists, one per ray in turn } for a soft gradient shaft, or { flat: colour } for a hard-edged one in
// three stepped bands (the cel and pixel worlds, where a gradient would be the one smooth thing on screen)
const RAY_HOT = { sets: [[[0, 'rgba(255,236,200,1)'], [0.15, 'rgba(255,150,90,0.6)'], [0.45, 'rgba(200,50,30,0.15)'], [1, 'rgba(120,20,10,0)']]] }
function rays(c, x, y, L, s, t, n, spec) {
  if (s <= 0.01) return
  const G = spec.sets?.map((set) => { const g = c.createRadialGradient(x, y, 0, x, y, L); for (const [o, col] of set) g.addColorStop(o, col); return g })
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = G ? G[0] : spec.flat
  for (let i = 0; i < n; i++) {
    const a = (i + 0.4 * hash(i, 1)) / n * TAU + t * 0.12 * (i % 2 ? 1 : -0.6), w = (0.025 + 0.05 * hash(i, 2)) * (0.8 + 0.2 * Math.sin(t * 1.3 + i)), len = L * (0.6 + 0.4 * hash(i, 3))
    const al = s * (0.3 + 0.35 * hash(i, 4)) * (0.8 + 0.2 * Math.sin(t * 2.1 + i * 1.7))
    if (G && G.length > 1) c.fillStyle = G[i % G.length]
    // a soft shaft: three nested wedges, the widest faintest
    for (const [k, ka] of [[2.2, 0.25], [1.3, 0.35], [0.5, 0.6]]) {
      const P = (b, r) => [x + Math.cos(a + b * w * k) * len * r, y + Math.sin(a + b * w * k) * len * r]
      if (G) {
        c.globalAlpha = al * ka
        c.beginPath(); c.moveTo(x, y); c.lineTo(...P(-1, 1)); c.lineTo(...P(1, 1)); c.closePath(); c.fill()
        continue
      }
      for (const [r0, r1, ba] of [[0, 0.2, 0.9], [0.2, 0.5, 0.45], [0.5, 1, 0.15]]) {
        c.globalAlpha = al * ka * ba
        c.beginPath(); c.moveTo(...P(-1, r0)); c.lineTo(...P(-1, r1)); c.lineTo(...P(1, r1)); c.lineTo(...P(1, r0)); c.closePath(); c.fill()
      }
    }
  }
  c.restore()
}
// a glow on (x, y): additive, r wide, a its strength. spec: { g: [heart, rim, edge] } soft, or { flat: [3 colours] } in
// three hard discs
const GLOW_HOT = { g: ['rgba(255,244,220,1)', 'rgba(255,170,90,0.6)', 'rgba(120,40,20,0)'] }
function glow(c, x, y, r, a, spec) {
  if (a <= 0.01) return
  c.save(); c.globalCompositeOperation = 'lighter'
  if (spec.flat) {
    spec.flat.forEach((col, i) => { c.globalAlpha = a * [0.18, 0.3, 0.5][i]; c.fillStyle = col; c.beginPath(); c.arc(x, y, r * [0.8, 0.5, 0.25][i], 0, TAU); c.fill() })
    c.restore(); return
  }
  const g = c.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, spec.g[0]); g.addColorStop(0.2, spec.g[1]); g.addColorStop(1, spec.g[2])
  c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore()
}
// steam: n billows thrown from round (x, y) at born u0..u1, each drifting out and swelling, turned to face the hole's light,
// with that light added over it while the rays burn (lit 0..1). R the boss radius; a overall opacity
// P4: the world's billows (an array; .px draws them nearest, .still never turns them)
function steam(c, k, x, y, n, u0, u1, life, a, lit, seed, reach = 2.4, inner = 0.3, P4 = PUFF) {
  for (let i = 0; i < n; i++) {
    const b = u0 + (u1 - u0) * hash(i, seed), q = (k.u - b) / life
    if (q <= 0 || q >= 1) continue
    const ang = hash(i, seed + 1) * TAU, e = 1 - Math.pow(1 - q, 2.2), d = k.R * (inner + reach * e * (0.5 + 0.5 * hash(i, seed + 2)))
    const X = x + Math.cos(ang) * d, Y = y + Math.sin(ang) * d - k.R * 0.25 * e
    let S = k.R * (0.9 + 1.6 * e) * (0.7 + 0.6 * hash(i, seed + 3))
    let al = a * Math.min(1, q * 6) * Math.pow(1 - q, 1.4) * (0.55 + 0.45 * hash(i, seed + 4))
    if (al < 0.01) continue
    if (P4.cel) { S *= 0.7 * Math.min(1, Math.sqrt(al * 1.4)); al = Math.min(1, al * 4) }   // a cel does not fade: it pops and shrinks away
    const P = P4[i % P4.length], rot = ang + Math.PI + 0.4 * (hash(i, seed + 5) - 0.5) + q * 0.6 * (i % 2 ? 1 : -1)
    c.save(); c.translate(X, Y); if (!P4.still) c.rotate(rot); if (P4.px) c.imageSmoothingEnabled = false; c.globalAlpha = al; c.drawImage(P, -S, -S, S * 2, S * 2)
    if (lit > 0.02) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = al * lit * 0.3; c.drawImage(P, -S, -S, S * 2, S * 2) }
    c.restore()
  }
}
// mirror drops shed off a body at (x, y): each leaves at u0..u1 from radius r0 R, flies out, falls back and rings the pool.
// Stretched along its flight, and longer the faster it goes; its shadow trails down-right by its height
// spr: DROP, or a world's pieces { img: [canvases], stretch (drawn longer the faster), turn (along its flight), px (nearest) }
function drops(c, k, x, y, n, u0, u1, r0, reach, seed, dur = 0.22, spr = DROP) {
  for (let i = 0; i < n; i++) {
    const b = u0 + (u1 - u0) * hash(i, seed), q = (k.u - b) / dur
    if (q <= 0 || q >= 1.6) continue
    const ang = hash(i, seed + 1) * TAU, sp = reach * (0.4 + 0.6 * hash(i, seed + 2)), sz = k.R * (0.05 + 0.07 * hash(i, seed + 3))
    const qq = Math.min(1, q), d = k.R * (r0 + sp * (1 - Math.pow(1 - qq, 1.6))), X = x + Math.cos(ang) * d, Y = y + Math.sin(ang) * d
    if (q < 1) {
      const h = Math.sin(Math.PI * q), speed = 1.6 * Math.pow(1 - q, 0.6) + 0.4, L = sz * 3.2 * (0.8 + 0.3 * speed), S = 1 + 0.6 * h   // nearer the camera at the top of its arc
      c.save(); c.translate(X + h * k.R * 0.25, Y + h * k.R * 0.32); c.rotate(ang); c.globalAlpha = 0.25 * h; c.fillStyle = '#000'
      c.beginPath(); c.ellipse(-sz * 0.7, 0, sz * 1.1, sz * 0.55, 0, 0, TAU); c.fill(); c.restore()
      if (spr === DROP) { c.save(); c.translate(X, Y); c.rotate(ang); c.globalAlpha = 1; c.drawImage(DROP, -L * S, -sz * S * 0.8, L * S, sz * S * 1.6); c.restore(); continue }
      const I = spr.img[i % spr.img.length], s = sz * (spr.px ? 0.7 : 1.3) * S, ls = spr.stretch ? s * (0.9 + 0.35 * speed) : s
      c.save(); c.translate(spr.px ? Math.round(X / 2) * 2 : X, spr.px ? Math.round(Y / 2) * 2 : Y); if (spr.turn) c.rotate(ang + hash(i, seed + 6) * (spr.stretch ? 0 : TAU)); if (spr.px) c.imageSmoothingEnabled = false
      c.globalAlpha = 1; c.drawImage(I, -ls, -s, ls * 2, s * 2); c.restore()
    } else if (i % 3 === 0 && spr === DROP) {
      // landed: a faint ring spreading in the pool
      const w = (q - 1) / 0.6, rr = sz * (0.8 + 2.5 * w)
      c.globalAlpha = 0.35 * (1 - w); c.strokeStyle = '#9aa3b0'; c.lineWidth = Math.max(0.8, sz * 0.2 * (1 - w))
      c.beginPath(); c.ellipse(X, Y, rr, rr * 0.9, 0, 0, TAU); c.stroke(); c.globalAlpha = 1
    }
  }
}
// the melt's skin over the boss (drawn over it): a mirror dome r wide that thins away as the metal runs off, a its cover
function skin(c, x, y, r, a, img = DOME) {
  if (a <= 0.01) return
  c.globalAlpha = a; c.drawImage(img, x - r * 1.1, y - r * 0.9, r * 2.2, r * 1.8); c.globalAlpha = 1
}
// rings running out over the pool from (x, y): n of them, phase-staggered, s their strength
function ripples(c, x, y, R, s, t, n = 4) {
  if (s <= 0.01) return
  // a swell, not a target: each ring wobbles, breaks up round its length and is a lit crest over a dark trough
  const M = 48
  for (let i = 0; i < n; i++) {
    const q = (t * 0.9 + i / n) % 1, rr = R * (0.9 + 2.2 * q), al = s * 0.15 * Math.sin(Math.PI * q), lw = R * 0.05 * (1 - q) + 0.8
    const at = (m, dr) => { const a = m / M * TAU, w = 1 + 0.07 * Math.sin(a * 3 + i * 2.1 + t) + 0.04 * Math.sin(a * 7 - i); return [x + Math.cos(a) * (rr + dr) * w, y + Math.sin(a) * (rr + dr) * w * 0.92] }
    for (const [col, dr, ka] of [['#0a0b0e', lw * 0.8, 0.8], ['#c8cfdb', 0, 0.6]]) {
      c.strokeStyle = col; c.lineWidth = lw
      for (let m = 0; m < M; m++) {
        const br = 0.5 + 0.5 * Math.sin(m / M * TAU * 5 + i * 1.3 + hash(i, 7) * 6)   // where the crest breaks
        if (br < 0.25) continue
        c.globalAlpha = al * ka * br
        const [ax, ay] = at(m, dr), [bx, by] = at(m + 1, dr)
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke()
      }
    }
  }
  c.globalAlpha = 1
}
// the boss's scale: up from 0.55 past full size to `peak` as it crests, then settling slow and heavy to 1
const bossScale = (u, a, b, c, peak = 1.25) => (u < b ? 0.55 + (peak - 0.55) * ease(win(u, a, b)) : peak - (peak - 1) * ease(win(u, b, c)))

// ---- THE ERUPTION: D's geyser, in the medium of whichever world it comes up in (arrive D in the Core, return C in any) ----
// Each world's: its rays and glow, its billows (steam or dust), its column seen from straight above (the Core's is DOME),
// what it throws (the Core's is DROP). The palettes are hole.js's.
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
const ramp = (P, v) => { const p = clamp01(v) * (P.length - 1), i = Math.min(P.length - 2, Math.floor(p)), f = p - i; return P[i].map((a, j) => a + (P[i + 1][j] - a) * f) }
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
const hsl = (h, s, l) => { const k = (n) => (n + h / 30) % 12, A = s * Math.min(l, 1 - l), F = (n) => l - A * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [F(0) * 255, F(8) * 255, F(4) * 255] }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const MONO = '"DejaVu Sans Mono", Menlo, Consolas, "Courier New", monospace'
const SOIL = ['#130b06', '#3a2516', '#5e3f27', '#8a6440', '#b8946a', '#e2c79a'].map(hex)
const VIOLET = ['#0b0714', '#2a2048', '#5a4a8a', '#9a88d0', '#e4dcff'].map(hex)
const DUST = ['#2a241e', '#4e473e', '#766c5e', '#9a8e7c', '#d6be96', '#f0e2c0'].map(hex)
const LAVA = ['#0a0608', '#2c2430', '#7a1004', '#d8340c', '#ff8a2a', '#ffe08a'].map(hex)
const BASALT = ['#0a0608', '#1c1620', '#2c2430', '#463c4c', '#625670', '#8c7e9c'].map(hex)
const INK = hex('#1c120d'), CEL = ['#8a6446', '#b89468', '#dcc392', '#f3e6c8'].map(hex)

// N x N texels from fn(x, y, i, j) -> [r, g, b, a] or null, x and y in -1..1
function paint(N, fn) {
  const cv = mk(N, N), g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const p = fn((i + 0.5) / N * 2 - 1, (j + 0.5) / N * 2 - 1, i, j)
    if (p) { const q = (j * N + i) * 4; d[q] = p[0]; d[q + 1] = p[1]; d[q + 2] = p[2]; d[q + 3] = p[3] }
  }
  g.putImageData(img, 0, 0)
  return cv
}
// typed glyphs, one per cell of an N canvas: fn(x, y) -> [char, css] or null
function typed(N, cell, fn) {
  const cv = mk(N, N), g = cv.getContext('2d')
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold ' + Math.round(cell * 1.1) + 'px ' + MONO
  for (let y = cell / 2; y < N; y += cell) for (let x = cell / 2; x < N; x += cell) { const p = fn(x / N * 2 - 1, y / N * 2 - 1); if (p) { g.fillStyle = p[1]; g.fillText(p[0], x, y) } }
  return cv
}
// the column's crown at (x, y): r, how much of the up-left light reaches it (dif) and its highlight (spec)
function crownAt(x, y, slope) {
  const r = Math.hypot(x, y)
  if (r >= 1) return null
  const s = 2 * Math.pow(1 - r * r, 0.4) * slope, nx = x * s, ny = y * s, n = Math.hypot(nx, ny, 1), Nx = nx / n, Ny = ny / n, Nz = 1 / n
  const dif = clamp01(Nx * L3[0] + Ny * L3[1] + Nz * L3[2])
  return { r, dif, spec: Math.pow(clamp01(2 * Nz * dif - L3[2]), 12) }
}
const foot = (r, w = 0.35) => 255 * Math.pow(clamp01((1 - r) / w), 1.2)
const rim = (x, y) => clamp01((1 - Math.hypot(x, y)) / 0.24)
// four billows of one world's, from shade({ den, lit }, x, y) -> [r, g, b, a] or null
const billows = (N, shade) => [0, 1, 2, 3].map((v) => { const B = billowOf(v); return paint(N, (x, y) => { const b = B(x / 2, y / 2); return b && shade(b, x, y) }) })
const soft = (sh, mid, lt) => billows(128, ({ den, lit }, x, y) => [...(lit > 0.5 ? mid.map((a, j) => a + (lt[j] - a) * (lit - 0.5) * 2) : sh.map((a, j) => a + (mid[j] - a) * lit * 2)), 255 * clamp01(den * 0.9) * rim(x, y)])
// a piece of a world's spray, drawn by fn(g, W, H) into a W x H canvas
const piece = (W, fn, H = W) => { const cv = mk(W, H), g = cv.getContext('2d'); fn(g, W, H); return cv }
function lump(g, cx, cy, r, sd) { g.beginPath(); for (let i = 0; i <= 8; i++) { const t = i / 8 * TAU, w = r * (0.78 + 0.35 * hash(sd, i + 10)); i ? g.lineTo(cx + Math.cos(t) * w, cy + Math.sin(t) * w) : g.moveTo(cx + Math.cos(t) * w, cy + Math.sin(t) * w) } g.closePath() }

// ring: the colour of the shock the return's snap throws over the floor; px: the world is drawn in art pixels (nearest)
const ERUPT_OF = {
  liquid: () => ({ rays: RAY_HOT, glow: GLOW_HOT, puff: PUFF, col: DOME, drop: DROP, pool: true, ring: '#f4f7fc' }),
  // the Topsoil: earth heaved up in a mound that bursts, clods thrown, a brown dust cloud, low sun through it
  macro: () => ({
    rays: { sets: [[[0, 'rgba(255,240,210,0.9)'], [0.15, 'rgba(232,196,140,0.42)'], [0.45, 'rgba(170,120,70,0.1)'], [1, 'rgba(90,60,30,0)']]] },
    glow: { g: ['rgba(255,236,200,0.9)', 'rgba(214,170,110,0.35)', 'rgba(80,50,20,0)'] },
    puff: soft([46, 34, 24], [112, 88, 62], [214, 188, 146]),
    col: paint(128, (x, y) => { const d = crownAt(x, y, 0.7); if (!d) return null; const n = hash(Math.floor((x + 1) * 9), Math.floor((y + 1) * 9) + 50); return [...ramp(SOIL, 0.12 + 0.8 * d.dif + 0.22 * (n - 0.5) + 0.2 * d.spec), foot(d.r)] }),
    drop: { turn: true, img: [0, 1, 2].map((v) => piece(24, (g) => { lump(g, 13, 13.5, 9, v); g.fillStyle = '#120a05'; g.fill(); lump(g, 11.5, 11.5, 8, v); g.fillStyle = ['#5e3f27', '#6e4c2e', '#7a5a3a'][v]; g.fill(); g.fillStyle = 'rgba(208,172,128,0.8)'; g.beginPath(); g.arc(9, 8.5, 3, 0, TAU); g.fill() })) },
    ring: '#d0ac80',
  }),
  // the Geode: a burst of crystal, faceted, each facet catching a different colour, splinters thrown, a glittering haze
  holo: () => ({
    rays: { sets: [[200, 255, 250], [255, 150, 240], [255, 226, 140]].map((c) => [[0, 'rgba(255,255,255,1)'], [0.15, css(c, 0.55)], [0.45, css(c, 0.12)], [1, css(c, 0)]]) },
    glow: { g: ['rgba(255,255,255,1)', 'rgba(200,176,255,0.5)', 'rgba(60,30,120,0)'] },
    puff: soft([26, 20, 52], [92, 78, 150], [236, 228, 255]),
    col: paint(128, (x, y) => {
      const r = Math.hypot(x, y)
      if (r >= 1) return null
      const s = Math.floor((Math.atan2(y, x) / TAU + 0.5) * 9 + (r > 0.55 ? 0.5 : 0)), fa = (s + 0.5) / 9 * TAU - Math.PI
      const Nx = Math.cos(fa) * 0.7 * r, Ny = Math.sin(fa) * 0.7 * r, n = Math.hypot(Nx, Ny, 1), dif = clamp01((Nx * L3[0] + Ny * L3[1] + L3[2]) / n)
      const c = ramp(VIOLET, 0.15 + 0.85 * dif * dif), h = hsl((s * 47 + (r > 0.55 ? 180 : 0)) % 360, 0.9, 0.72), w = r > 0.55 ? 0.3 : 0.18
      return [...c.map((a, j) => a + (h[j] - a) * w + (r < 0.18 ? (255 - a) * (1 - r / 0.18) : 0)), 255 * clamp01((1 - r) / 0.08)]
    }),
    drop: { stretch: true, turn: true, img: [190, 300, 50].map((hu) => piece(32, (g, W, H) => {
      g.fillStyle = '#e4dcff'; g.beginPath(); g.moveTo(2, H / 2); g.lineTo(W * 0.55, 1); g.lineTo(W - 1, H / 2); g.closePath(); g.fill()
      g.fillStyle = '#5a4a8a'; g.beginPath(); g.moveTo(2, H / 2); g.lineTo(W * 0.55, H - 1); g.lineTo(W - 1, H / 2); g.closePath(); g.fill()
      g.strokeStyle = `hsl(${hu},100%,72%)`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(2, H / 2); g.lineTo(W - 1, H / 2); g.stroke()
    }, 12)) },
    ring: '#e4dcff',
  }),
  // the Mine: a geyser of typed glyphs, rubble characters thrown, a dust cloud of punctuation, amber terminal light
  ascii: () => {
    const ch = ' .:-=+*#%@'
    const puff = [0, 1, 2, 3].map((v) => { const B = billowOf(v); return typed(128, 11, (x, y) => { const b = B(x / 2, y / 2); if (!b || b.den < 0.25 || rim(x, y) < 0.3) return null; return [ch[1 + Math.min(8, Math.floor(b.den * 4))], css(ramp(DUST, 0.2 + 0.7 * b.lit))] }) })
    puff.still = true
    return {
      rays: { sets: [[[0, 'rgba(255,232,180,0.9)'], [0.15, 'rgba(240,196,120,0.45)'], [0.45, 'rgba(200,140,60,0.1)'], [1, 'rgba(120,80,30,0)']]] },
      glow: { g: ['rgba(255,236,190,1)', 'rgba(240,196,120,0.45)', 'rgba(80,50,20,0)'] },
      puff,
      col: typed(128, 10, (x, y) => { const d = crownAt(x, y, 0.7); if (!d || d.r > 0.92) return null; const v = clamp01(0.75 * d.dif + 0.45 * (1 - d.r) - 0.2); return [ch[Math.max(1, Math.min(9, Math.floor(v * 10)))], d.r < 0.35 ? css([255, 236 - 60 * d.r, 190 - 200 * d.r]) : css(ramp(DUST, 0.25 + 0.75 * v))] }),
      drop: { img: '#%@&$'.split('').map((c, i) => piece(20, (g) => { g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 18px ' + MONO; g.fillStyle = ['#d6be96', '#9a8e7c', '#f0e2c0', '#f0c478', '#766c5e'][i]; g.fillText(c, 10, 11) })) },
      ring: '#f0c478',
    }
  },
  // the Magma: a lava fountain in art pixels, dithered, embers and blocks of basalt thrown, soot in squares
  pixel: () => {
    const puff = billows(48, ({ den, lit }, x, y) => (den < 0.45 || rim(x, y) < 0.4 ? null : [...BASALT[Math.max(0, Math.min(5, Math.floor(lit * 4.2 + 0.6)))], 255]))
    puff.px = true; puff.still = true
    return {
      rays: { flat: '#ff6a1e' }, glow: { flat: ['#d8340c', '#ff8a2a', '#ffe08a'] }, puff, px: true,
      col: paint(40, (x, y, i, j) => { const d = crownAt(x, y, 0.6); if (!d || d.r > 0.95) return null; const v = clamp01((1 - d.r) * 0.85 + d.dif * 0.35 - 0.1) * 5 + (BAYER[(j % 4) * 4 + (i % 4)] / 16 - 0.5) * 0.9; return [...LAVA[Math.max(1, Math.min(5, Math.round(v)))], 255] }),
      drop: { px: true, img: [['#463c4c', '#8c7e9c'], ['#d8340c', '#ffe08a'], ['#ff8a2a', '#ffe08a']].map(([b, l]) => piece(6, (g) => { g.fillStyle = '#0a0608'; g.fillRect(1, 1, 5, 5); g.fillStyle = b; g.fillRect(0, 0, 5, 5); g.fillStyle = l; g.fillRect(0, 0, 5, 1); g.fillRect(0, 0, 1, 5) })) },
      ring: '#ff5a14',
    }
  },
  // the Mantle: an inked cartoon eruption, a cel-shaded crown, dirt chunks with ink cuts, a cartoon dust cloud
  toon: () => ({
    rays: { flat: '#ffe7a8' }, glow: { flat: ['#6a4818', '#a07a38', '#e0c080'] },
    puff: Object.assign(billows(128, ({ den, lit }, x, y) => { if (den < 0.5 || rim(x, y) < 0.35) return null; return den < 0.6 ? [...INK, 255] : [...CEL[lit > 0.62 ? 3 : lit > 0.4 ? 2 : 1], 255] }), { cel: true }),
    // a cartoon splash crown: nine lobes round a hot heart, an ink line round it
    col: paint(128, (x, y) => {
      const r = Math.hypot(x, y), t = Math.atan2(y, x), e = 0.72 + 0.2 * Math.abs(Math.sin(t * 4.5)) + 0.05 * Math.sin(t * 13)
      if (r > e) return null
      if (r > e - 0.07) return [...INK, 255]
      const d = crownAt(x / e * 0.95, y / e * 0.95, 0.7)
      return [...(r < 0.22 ? [255, 246, 220] : CEL[d.dif > 0.85 ? 3 : d.dif > 0.65 ? 2 : d.dif > 0.45 ? 1 : 0]), 255]
    }),
    drop: { turn: true, img: [0, 1, 2].map((v) => piece(24, (g) => { lump(g, 13.5, 14, 8.5, v); g.fillStyle = '#1c120d'; g.fill(); lump(g, 11.5, 11.5, 8, v); g.fillStyle = ['#8a6446', '#b89468', '#5b3b2a'][v]; g.fill(); g.fillStyle = '#f3e6c8'; g.beginPath(); g.arc(8.5, 8.5, 2.6, 0, TAU); g.fill() })) },
    ring: '#1c120d',
  }),
}
// baked on first use (or by the look's warm), each world once
const ERUPT = {}
const eruptOf = (id) => (ERUPT[id] ??= (ERUPT_OF[id] ?? ERUPT_OF.liquid)())
const warmErupt = () => { for (const id in ERUPT_OF) eruptOf(id) }

// the hole opens, the column erupts out of it and the boss rides up it past full size as it falls back, then settles
function erupt(k, M) {
  const x = k.x, y = k.y + k.R * HY, R = k.R, f = k.floor, u = k.u
  const open = ease(win(u, 0, 0.14)) * (1 - ease(win(u, 0.82, 1))), erupt = win(u, 0.2, 0.26), fall = win(u, 0.45, 0.75), crest = Math.exp(-(((u - 0.3) / 0.08) ** 2))
  tear(f, x, y, R * HW, R * HH, open, k.A.id)
  // the light: thin heat in the opening hole, then the column's blaze, the shafts turning with it
  const rs = (0.25 * win(u, 0.05, 0.2) + 0.9 * erupt * (1 - ease(fall)) + 0.6 * crest) * (1 - ease(win(u, 0.6, 0.95)))
  rays(f, x, y, R * 5.5, rs, k.age * 1.6, 17, M.rays)
  glow(f, x, y, R * 1.8, 0.2 + 0.6 * rs, M.glow)
  // steam (dust) rolling off the column, low and wide
  steam(f, k, x, y, 18, 0.18, 0.55, 0.55, 0.85, 0.7 * rs, 20, 3, 0.3, M.puff)
  // the column seen from above: its crown with a white-hot heart, swelling with the eruption, falling back
  const col = erupt * (1 - ease(fall)), cr = R * (0.3 + 0.9 * col + 0.25 * crest)
  if (col > 0.01) {
    if (M.px) f.imageSmoothingEnabled = false
    f.globalAlpha = col; f.drawImage(M.col, x - cr, y - cr, cr * 2, cr * 2); f.globalAlpha = 1
    f.imageSmoothingEnabled = true
    glow(f, x, y, cr * 0.9, col, M.glow)
  }
  // the crown splash on a pool: a ring thrown out from the column's foot as it erupts, and again as it falls back
  if (M.pool) {
    ripples(f, x, y, R * 0.5, win(u, 0.05, 0.18) * (1 - erupt), k.age * 1.5, 3)
    ripples(f, x, y, R * (0.6 + 0.5 * fall), Math.sin(Math.PI * win(u, 0.22, 0.85)), k.age, 5)
  }
  if (u < 0.24) k.boss.hide = true
  k.boss.scale = bossScale(u, 0.24, 0.58, 0.86, 1.28); k.boss.alpha = ease(win(u, 0.24, 0.34))
  const bs = R * k.boss.scale, o = k.px(0), top = k.px(1)
  // the spray: thrown up and out by the eruption, then what the column sheds as it falls back
  if (M.px) o.imageSmoothingEnabled = false
  skin(o, x, y, bs * 0.75, 0.75 * col * (1 - ease(win(u, 0.28, 0.5))), M.col)
  o.imageSmoothingEnabled = true
  drops(o, k, x, y, 20, 0.2, 0.32, 0.3, 2.8, 30, 0.26, M.drop)
  drops(o, k, k.x, k.y, 16, 0.45, 0.75, 0.55, 1.4, 40, 0.22, M.drop)
  glow(top, x, y, R * 1.8, crest * 0.5, M.glow)
  steam(top, k, x, y, 10, 0.22, 0.42, 0.65, 0.45, 0.5 * rs, 60, 2.4, 1.1, M.puff)
}

// ---- D: the geyser ----
stage('arrive', 'D', { label: 'D · the hole opens and a white-hot geyser erupts; the boss rides up the column as it falls back into the pool', dur: 3.6, draw(k) { erupt(k, eruptOf('liquid')) } })

// ---- THE RETURN C: D's eruption in the world it comes back in. It rides up in its old form and at the crest the new one
// snaps out of it (rig.js takes a fractional phase: the wings unfold out of the body, the great eye opens), with a flare
stage('return', 'C', { label: 'C · erupts out of the floor like the arrival, in the world it wears; at the crest the new wings snap out (the great eye opens)', dur: 3.6, warm: warmErupt, draw(k) {
  const M = eruptOf(k.A.id), u = k.u
  erupt(k, M)
  const to = Math.round(k.ph), was = Math.max(1, to - 1)
  k.boss.ph = was + ease(win(u, 0.52, 0.68)) * (to - was)
  // the snap: a burst of the world's light as it opens, a ring thrown out over the floor, a flash on the body
  const fl = Math.exp(-(((u - 0.6) / 0.045) ** 2)), q = win(u, 0.56, 0.84), f = k.floor
  rays(f, k.x, k.y, k.R * 6.5, 1.3 * fl, k.age * 1.6 + 2, 23, M.rays)
  if (q > 0 && q < 1) {
    const r = k.R * (0.9 + 2.6 * ease(q))
    f.globalAlpha = 0.7 * (1 - q); f.strokeStyle = M.ring; f.lineWidth = k.R * 0.12 * (1 - q) + 1
    f.beginPath(); f.ellipse(k.x, k.y + k.R * HY, r, r * HH / HW * 1.15, 0, 0, TAU); f.stroke(); f.globalAlpha = 1
  }
  glow(k.px(1), k.x, k.y, k.R * 2.2, 0.55 * fl, M.glow)
} })
