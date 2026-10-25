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
const PUFF = [0, 1, 2, 3].map((v) => {
  const N = 128, cv = mk(N, N), g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data
  const L = Array.from({ length: 9 }, (_, i) => { const a = hash(v, i) * TAU, r = 0.32 * hash(v, i + 20); return [Math.cos(a) * r, Math.sin(a) * r, 0.16 + 0.16 * hash(v, i + 40)] })
  const D = (x, y) => { let s = 0; for (const [cx, cy, r] of L) s += Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (r * r)); return s }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N - 0.5, y = (j + 0.5) / N - 0.5, e = 0.01, den = D(x, y)
    if (den < 0.02) continue
    const gx = (D(x + e, y) - D(x - e, y)) / (2 * e), gy = (D(x, y + e) - D(x, y - e)) / (2 * e), n = Math.hypot(gx, gy) || 1
    const lit = clamp01(0.5 - 0.5 * (gx / n) * Math.min(1, n / 4) + 0.15 * (x * 2))
    const c = lit > 0.5 ? [104 + (214 - 104) * (lit - 0.5) * 2, 106 + (192 - 106) * (lit - 0.5) * 2, 114 + (168 - 114) * (lit - 0.5) * 2] : [34 + 70 * lit * 2, 37 + 69 * lit * 2, 45 + 69 * lit * 2]
    const q = (j * N + i) * 4
    d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255 * clamp01(den * 0.9) * clamp01((0.5 - Math.hypot(x, y)) / 0.12)
  }
  g.putImageData(img, 0, 0)
  return cv
})

// ---- the pieces, each a pure function of the beat ----
// god rays: n shafts fanned from (x, y) over the floor, additive, turning slowly; s 0..1 their strength, L their reach
function rays(c, x, y, L, s, t, n, warm) {
  if (s <= 0.01) return
  const g = c.createRadialGradient(x, y, 0, x, y, L)
  if (warm) { g.addColorStop(0, 'rgba(255,236,200,1)'); g.addColorStop(0.15, 'rgba(255,150,90,0.6)'); g.addColorStop(0.45, 'rgba(200,50,30,0.15)'); g.addColorStop(1, 'rgba(120,20,10,0)') }
  else { g.addColorStop(0, 'rgba(255,250,236,1)'); g.addColorStop(0.15, 'rgba(255,226,180,0.55)'); g.addColorStop(0.45, 'rgba(220,170,120,0.14)'); g.addColorStop(1, 'rgba(160,110,80,0)') }
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g
  for (let i = 0; i < n; i++) {
    const a = (i + 0.4 * hash(i, 1)) / n * TAU + t * 0.12 * (i % 2 ? 1 : -0.6), w = (0.025 + 0.05 * hash(i, 2)) * (0.8 + 0.2 * Math.sin(t * 1.3 + i)), len = L * (0.6 + 0.4 * hash(i, 3))
    const al = s * (0.3 + 0.35 * hash(i, 4)) * (0.8 + 0.2 * Math.sin(t * 2.1 + i * 1.7))
    // a soft shaft: three nested wedges, the widest faintest
    for (const [k, ka] of [[2.2, 0.25], [1.3, 0.35], [0.5, 0.6]]) {
      c.globalAlpha = al * ka
      c.beginPath(); c.moveTo(x, y)
      c.lineTo(x + Math.cos(a - w * k) * len, y + Math.sin(a - w * k) * len); c.lineTo(x + Math.cos(a + w * k) * len, y + Math.sin(a + w * k) * len)
      c.closePath(); c.fill()
    }
  }
  c.restore()
}
// a glow on (x, y): additive, r wide, a its strength
function glow(c, x, y, r, a, hot) {
  if (a <= 0.01) return
  const g = c.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, hot ? 'rgba(255,244,220,1)' : 'rgba(255,252,244,1)'); g.addColorStop(0.2, hot ? 'rgba(255,170,90,0.6)' : 'rgba(255,230,190,0.45)'); g.addColorStop(1, 'rgba(120,40,20,0)')
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore()
}
// steam: n billows thrown from round (x, y) at born u0..u1, each drifting out and swelling, turned to face the hole's light,
// with that light added over it while the rays burn (lit 0..1). R the boss radius; a overall opacity
function steam(c, k, x, y, n, u0, u1, life, a, lit, seed, reach = 2.4, inner = 0.3) {
  for (let i = 0; i < n; i++) {
    const b = u0 + (u1 - u0) * hash(i, seed), q = (k.u - b) / life
    if (q <= 0 || q >= 1) continue
    const ang = hash(i, seed + 1) * TAU, e = 1 - Math.pow(1 - q, 2.2), d = k.R * (inner + reach * e * (0.5 + 0.5 * hash(i, seed + 2)))
    const X = x + Math.cos(ang) * d, Y = y + Math.sin(ang) * d - k.R * 0.25 * e, S = k.R * (0.9 + 1.6 * e) * (0.7 + 0.6 * hash(i, seed + 3))
    const al = a * Math.min(1, q * 6) * Math.pow(1 - q, 1.4) * (0.55 + 0.45 * hash(i, seed + 4))
    if (al < 0.01) continue
    const P = PUFF[i % 4], rot = ang + Math.PI + 0.4 * (hash(i, seed + 5) - 0.5) + q * 0.6 * (i % 2 ? 1 : -1)
    c.save(); c.translate(X, Y); c.rotate(rot); c.globalAlpha = al; c.drawImage(P, -S, -S, S * 2, S * 2)
    if (lit > 0.02) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = al * lit * 0.3; c.drawImage(P, -S, -S, S * 2, S * 2) }
    c.restore()
  }
}
// mirror drops shed off a body at (x, y): each leaves at u0..u1 from radius r0 R, flies out, falls back and rings the pool.
// Stretched along its flight, and longer the faster it goes; its shadow trails down-right by its height
function drops(c, k, x, y, n, u0, u1, r0, reach, seed, dur = 0.22) {
  for (let i = 0; i < n; i++) {
    const b = u0 + (u1 - u0) * hash(i, seed), q = (k.u - b) / dur
    if (q <= 0 || q >= 1.6) continue
    const ang = hash(i, seed + 1) * TAU, sp = reach * (0.4 + 0.6 * hash(i, seed + 2)), sz = k.R * (0.05 + 0.07 * hash(i, seed + 3))
    const qq = Math.min(1, q), d = k.R * (r0 + sp * (1 - Math.pow(1 - qq, 1.6))), X = x + Math.cos(ang) * d, Y = y + Math.sin(ang) * d
    if (q < 1) {
      const h = Math.sin(Math.PI * q), speed = 1.6 * Math.pow(1 - q, 0.6) + 0.4, L = sz * 3.2 * (0.8 + 0.3 * speed), S = 1 + 0.6 * h   // nearer the camera at the top of its arc
      c.save(); c.translate(X + h * k.R * 0.25, Y + h * k.R * 0.32); c.rotate(ang); c.globalAlpha = 0.25 * h; c.fillStyle = '#000'
      c.beginPath(); c.ellipse(-sz * 0.7, 0, sz * 1.1, sz * 0.55, 0, 0, TAU); c.fill(); c.restore()
      c.save(); c.translate(X, Y); c.rotate(ang); c.globalAlpha = 1; c.drawImage(DROP, -L * S, -sz * S * 0.8, L * S, sz * S * 1.6); c.restore()
    } else if (i % 3 === 0) {
      // landed: a faint ring spreading in the pool
      const w = (q - 1) / 0.6, rr = sz * (0.8 + 2.5 * w)
      c.globalAlpha = 0.35 * (1 - w); c.strokeStyle = '#9aa3b0'; c.lineWidth = Math.max(0.8, sz * 0.2 * (1 - w))
      c.beginPath(); c.ellipse(X, Y, rr, rr * 0.9, 0, 0, TAU); c.stroke(); c.globalAlpha = 1
    }
  }
}
// the melt's skin over the boss (drawn over it): a mirror dome r wide that thins away as the metal runs off, a its cover
function skin(c, x, y, r, a) {
  if (a <= 0.01) return
  c.globalAlpha = a; c.drawImage(DOME, x - r * 1.1, y - r * 0.9, r * 2.2, r * 1.8); c.globalAlpha = 1
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

// ---- C: the dome ----
stage('arrive', 'C', { label: 'C · the melt swells into a mirror dome, light breaks out of it, the boss comes up through it shedding the metal', dur: 3.6, draw(k) {
  const x = k.x, y = k.y + k.R * HY, R = k.R, f = k.floor, u = k.u
  const swell = ease(win(u, 0, 0.24)), split = win(u, 0.22, 0.3), crest = Math.exp(-(((u - 0.27) / 0.06) ** 2))
  // the pool it leaves, closing as it settles
  tear(f, x, y, R * HW, R * HH, ease(win(u, 0.24, 0.32)) * (1 - ease(win(u, 0.8, 1))) * 0.9, k.A.id)
  // the light: a seep while it swells, a flare as it splits, the shafts turning down to calm
  const rs = 0.35 * swell * (1 - split) + 1.3 * crest + 0.8 * win(u, 0.27, 0.32) * (1 - ease(win(u, 0.45, 0.85)))
  rays(f, x, y, R * 6, rs, k.age, 13, false)
  glow(f, x, y, R * 1.6, 0.25 + 0.5 * rs, false)
  ripples(f, x, y, R * (0.3 + swell), swell * (1 - split), k.age)
  steam(f, k, x, y, 14, 0.2, 0.42, 0.55, 0.75, 0.6 * rs, 50, 2.8)
  // the boss: hidden in the dome, then up past full size and settling
  if (u < 0.25) k.boss.hide = true
  k.boss.scale = bossScale(u, 0.25, 0.62, 0.88); k.boss.alpha = ease(win(u, 0.25, 0.36))
  const bs = R * k.boss.scale, o = k.px(0), top = k.px(1)
  // the dome swells, then is the metal it wears as it breaks through, thinning off it; what falls off it
  skin(o, x, y, R * (0.2 + 1.15 * swell) * (1 + 0.12 * split), 1 - ease(win(u, 0.26, 0.55)))
  drops(o, k, k.x, k.y, 22, 0.27, 0.7, 0.5, 2.2, 70)
  glow(top, x, y, R * 2, crest * 0.55, false)
  // the steam over it: thick round it at the split, never over its body, thinning as it settles
  steam(top, k, x, y, 12, 0.24, 0.4, 0.6, 0.5, 0.5 * rs, 80, 2.2, 1.1)
} })

// ---- D: the geyser ----
stage('arrive', 'D', { label: 'D · the hole opens and a white-hot geyser erupts; the boss rides up the column as it falls back into the pool', dur: 3.6, draw(k) {
  const x = k.x, y = k.y + k.R * HY, R = k.R, f = k.floor, u = k.u
  const open = ease(win(u, 0, 0.14)) * (1 - ease(win(u, 0.82, 1))), erupt = win(u, 0.2, 0.26), fall = win(u, 0.45, 0.75), crest = Math.exp(-(((u - 0.3) / 0.08) ** 2))
  tear(f, x, y, R * HW, R * HH, open, k.A.id)
  // the light: thin red heat in the opening hole, then the column's blaze, the shafts turning with it
  const rs = (0.25 * win(u, 0.05, 0.2) + 0.9 * erupt * (1 - ease(fall)) + 0.6 * crest) * (1 - ease(win(u, 0.6, 0.95)))
  rays(f, x, y, R * 5.5, rs, k.age * 1.6, 17, true)
  glow(f, x, y, R * 1.8, 0.2 + 0.6 * rs, true)
  // steam rolling off the hot column, low and wide
  steam(f, k, x, y, 18, 0.18, 0.55, 0.55, 0.85, 0.7 * rs, 20, 3)
  // the column seen from above: a mirror crown with a white-hot heart, swelling with the eruption, falling back
  const col = erupt * (1 - ease(fall)), cr = R * (0.3 + 0.9 * col + 0.25 * crest)
  if (col > 0.01) {
    f.globalAlpha = col; f.drawImage(DOME, x - cr, y - cr, cr * 2, cr * 2); f.globalAlpha = 1
    glow(f, x, y, cr * 0.9, col, true)
  }
  // the crown splash: a ring thrown out from the column's foot as it erupts, and again as it falls back
  ripples(f, x, y, R * 0.5, win(u, 0.05, 0.18) * (1 - erupt), k.age * 1.5, 3)
  ripples(f, x, y, R * (0.6 + 0.5 * fall), Math.sin(Math.PI * win(u, 0.22, 0.85)), k.age, 5)
  if (u < 0.24) k.boss.hide = true
  k.boss.scale = bossScale(u, 0.24, 0.58, 0.86, 1.28); k.boss.alpha = ease(win(u, 0.24, 0.34))
  const bs = R * k.boss.scale, o = k.px(0), top = k.px(1)
  // the spray: thrown up and out by the eruption, then what the column sheds as it falls back
  skin(o, x, y, bs * 0.75, 0.75 * col * (1 - ease(win(u, 0.28, 0.5))))
  drops(o, k, x, y, 20, 0.2, 0.32, 0.3, 2.8, 30, 0.26)
  drops(o, k, k.x, k.y, 16, 0.45, 0.75, 0.55, 1.4, 40)
  glow(top, x, y, R * 1.8, crest * 0.5, true)
  steam(top, k, x, y, 10, 0.22, 0.42, 0.65, 0.45, 0.5 * rs, 60, 2.4, 1.1)
} })
