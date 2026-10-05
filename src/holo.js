// Book 3, The Geode: the HOLOGRAPHIC FOIL look.
//
// The chapter is a holo trading card. Everything is drawn as card art — flat cel colour under a
// crisp near-black ink line — and every LIGHT, NEUTRAL surface is foil: render.js runs FOIL_FRAG over
// the whole stage in this chapter, and that pass recolours those pixels with thin-film interference
// colour that slides with the camera (tilting the card) and with time. Saturated colour (the player,
// the olm's gills, enemy shots) and the ink stay exactly as painted, which is what keeps every shape
// readable over the shimmer.
//
// The bakes carry a STATIC rainbow of their own as well, so a texture seen without the pass (the cast
// thumbnails, src/cast/*.png) still reads as foil.
//
// Canvas 2D, like src/macro.js (whose primitives this reuses): no ctx.filter anywhere.

import { rng, makeCanvas, css, mixc, ellipsePts, spineOutline, trace, softDot, softFill, withBlur, bakeLocal } from './macro.js'

const TAU = Math.PI * 2
const lerp = (a, b, t) => a + (b - a) * t
const INK = '#0b0714'
// every outline is this much heavier than the number written at its call: a creature has to read on
// the dark shards AND on the pale opal caverns, and the ink is what carries it across both
const INK_K = 1.4

// ---- thin-film colour -----------------------------------------------------------------------------
// The same cosine palette the shader uses (FOIL_FRAG film()), so a baked rainbow and the live one agree.
export function film(t, k = 0.45, base = 0.55) {
  const f = (o) => Math.round(255 * Math.max(0, Math.min(1, base + k * Math.cos(TAU * (t + o)))))
  return (f(0) << 16) | (f(0.33) << 8) | f(0.67)
}
function filmGrad(ctx, x0, y0, x1, y1, t0, span, a, k = 0.45, base = 0.55) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, css(film(t0 + (i / 8) * span, k, base), a))
  return g
}
// ink: the card's outline, drawn last over a shape
function ink(ctx, pts, w, close = true) {
  ctx.save()
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
  if (close) ctx.closePath()
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = w * INK_K; ctx.strokeStyle = INK; ctx.stroke()
  ctx.restore()
}
function fillPts(ctx, pts, style) { trace(ctx, pts); ctx.fillStyle = style; ctx.fill() }
// a foil rim: a pale pearl band just inside a silhouette, under its ink. Pearl is exactly what the
// live foil pass recolours, so every creature's edge shimmers while its cel colour stays as painted.
function rim(ctx, pts, w, a = 0.85) {
  ctx.save(); trace(ctx, pts); ctx.clip()
  ctx.lineJoin = 'round'; ctx.lineWidth = w * 2; ctx.strokeStyle = `rgba(236,232,246,${a})`
  trace(ctx, pts); ctx.stroke()
  ctx.restore()
}
// a foil sheen inside a shape: a band of thin-film colour plus two hard diagonal streaks of light
function foil(ctx, pts, ang, a = 0.55, t0 = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]) }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.max(x1 - x0, y1 - y0) * 0.6 + 1
  const c = Math.cos(ang), s = Math.sin(ang)
  ctx.save(); trace(ctx, pts); ctx.clip()
  ctx.globalCompositeOperation = 'overlay'
  ctx.fillStyle = filmGrad(ctx, cx - c * R, cy - s * R, cx + c * R, cy + s * R, t0, 1.4, a)
  ctx.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4)
  ctx.globalCompositeOperation = 'source-over'
  for (const [off, w, al] of [[-0.25, 0.16, 0.5], [0.2, 0.07, 0.65]]) {
    const ox = cx + c * R * off, oy = cy + s * R * off
    ctx.beginPath()
    ctx.moveTo(ox - s * R * 2 - c * R * w, oy + c * R * 2 - s * R * w)
    ctx.lineTo(ox + s * R * 2 - c * R * w, oy - c * R * 2 - s * R * w)
    ctx.lineTo(ox + s * R * 2 + c * R * w, oy - c * R * 2 + s * R * w)
    ctx.lineTo(ox - s * R * 2 + c * R * w, oy + c * R * 2 + s * R * w)
    ctx.closePath(); ctx.fillStyle = `rgba(255,255,255,${al * a})`; ctx.fill()
  }
  ctx.restore()
}
// a limb as card art: an ink sleeve, the colour, a light line along the top
function inkLimb(ctx, pts, w0, w1, col, o = {}) {
  const lw = (o.ink ?? 1.1) * INK_K
  const seg = (k, add, style) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1)
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1]
      for (let s = 0; s < 3; s++) {
        const u0 = s / 3, u1 = (s + 1) / 3
        const w = lerp(w0, w1, lerp(t0, t1, (u0 + u1) / 2)) * k + add
        ctx.beginPath(); ctx.moveTo(lerp(ax, bx, u0), lerp(ay, by, u0)); ctx.lineTo(lerp(ax, bx, u1), lerp(ay, by, u1))
        ctx.lineWidth = Math.max(0.05, w); ctx.strokeStyle = style; ctx.stroke()
      }
    }
  }
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  seg(1, lw * 2, INK)
  seg(1, 0, css(col))
  if (o.hi !== false) seg(0.35, 0, css(o.hi ?? mixc(col, 0xffffff, 0.55)))
  ctx.restore()
}
// a flat card eye: ink disc, a hard window of light
function cardEye(ctx, x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = INK; ctx.fill()
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.38, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill()
}
const oval = (cx, cy, rx, ry, rot = 0, n = 40) => ellipsePts(cx, cy, rx, ry, rot, n)
const across = (spine, t, k) => {
  const [x, y] = spine(t), [ax, ay] = spine(Math.max(0, t - 0.01)), [bx, by] = spine(Math.min(1, t + 0.01))
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1
  return [x, y, (-dy / l) * k, (dx / l) * k]
}

// ==== THE CAST ====================================================================================
// All plan view, nose at +x, bilaterally symmetric (render.js lean 90).

// CAVE CRICKET: a humped amber body, the two huge drumstick hind legs, antennae three bodies long.
function paintCaveCricket(ctx, pose) {
  const r = 13
  const crouch = pose === 1, leap = pose === 2
  // antennae first, under everything: out from the head, sweeping wide and back down both flanks
  ctx.save(); ctx.lineCap = 'round'
  for (const s of [-1, 1]) {
    const sp = leap ? 0.4 : 1
    const path = () => { ctx.beginPath(); ctx.moveTo(r * 1.1, s * r * 0.12); ctx.bezierCurveTo(r * 2.6, s * r * 0.5, r * 2.9, s * r * (1.5 * sp + 0.4), r * 1.6, s * r * (1.9 * sp + 0.5)); ctx.quadraticCurveTo(r * 0.2, s * r * (2.3 * sp + 0.5), -r * 1.3, s * r * (2.0 * sp + 0.6)) }
    path(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke()
    path(); ctx.lineWidth = 0.55; ctx.strokeStyle = '#f0d8a8'; ctx.stroke()
  }
  ctx.restore()
  // the four small legs and the palps
  const leg = 0xb8834a
  for (const s of [-1, 1]) {
    inkLimb(ctx, [[r * 0.55, s * r * 0.22], [r * 0.85, s * r * 0.62], [r * 1.15, s * r * 0.8]], r * 0.09, r * 0.05, leg)
    inkLimb(ctx, [[r * 0.15, s * r * 0.32], [r * 0.18, s * r * 0.8], [-r * 0.08, s * r * 1.02]], r * 0.09, r * 0.05, leg)
    inkLimb(ctx, [[r * 1.15, s * r * 0.1], [r * 1.42, s * r * 0.24]], r * 0.06, r * 0.04, leg)
  }
  // THE HIND LEGS: a drumstick femur (fat, banded, foil-bright), a thin spined shin, a foot
  for (const s of [-1, 1]) {
    // seen from above the femora frame the abdomen in a V, knees past its tip, shins folded forward
    const hip = [-r * 0.05, s * r * 0.36]
    const knee = leap ? [-r * 1.75, s * r * 0.8] : crouch ? [-r * 1.3, s * r * 1.12] : [-r * 1.6, s * r * 1.0]
    const foot = leap ? [-r * 2.85, s * r * 0.9] : crouch ? [-r * 0.15, s * r * 1.42] : [-r * 0.5, s * r * 1.4]
    const fem = (t) => [lerp(hip[0], knee[0], t), lerp(hip[1], knee[1], t)]
    const half = (t) => r * (0.09 + 0.26 * Math.sin(Math.min(1, t * 1.25 + 0.08) * Math.PI) * (1 - t * 0.5))
    inkLimb(ctx, [knee, foot], r * 0.1, r * 0.07, 0x8a5a2a)
    ctx.save(); ctx.lineCap = 'round'
    for (let k = 1; k <= 6; k++) {
      const u = k / 7, px = lerp(knee[0], foot[0], u), py = lerp(knee[1], foot[1], u)
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + r * 0.08, py + s * r * 0.2); ctx.lineWidth = 0.6; ctx.strokeStyle = INK; ctx.stroke()
    }
    ctx.restore()
    const out = spineOutline(fem, half, 24)
    fillPts(ctx, out, css(0xe2b070))
    ctx.save(); trace(ctx, out); ctx.clip()
    // the shadow side of the drumstick, then the chevrons
    fillPts(ctx, spineOutline((t) => { const [x, y] = fem(t); return [x, y + s * half(t) * 0.55] }, (t) => half(t) * 0.5, 16), css(0xa8703a))
    for (let k = 1; k < 6; k++) {
      const [x, y, nx, ny] = across(fem, k / 6.5, half(k / 6.5))
      ctx.beginPath(); ctx.moveTo(x - nx, y - ny); ctx.lineTo(x + (knee[0] - hip[0]) * 0.04, y + (knee[1] - hip[1]) * 0.04); ctx.lineTo(x + nx, y + ny)
      ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(90,50,18,0.9)'; ctx.stroke()
    }
    ctx.restore()
    foil(ctx, out, Math.atan2(knee[1] - hip[1], knee[0] - hip[0]) + 1.2, 0.7, s * 0.2)
    ink(ctx, out, 1.3)
  }
  // the humped body: abdomen bands, the thorax saddle, the ridge of the hump lit along its crest
  const bx = -r * 0.15, rx = r * (crouch ? 0.98 : 1.08), ry = r * (crouch ? 0.56 : 0.5)
  const body = oval(bx, 0, rx, ry, 0, 44)
  fillPts(ctx, body, css(0xc48a4c))
  ctx.save(); trace(ctx, body); ctx.clip()
  fillPts(ctx, oval(bx, ry * 0.55, rx * 1.1, ry * 0.6), css(0x8e5a2c))
  fillPts(ctx, oval(bx, -ry * 0.55, rx * 1.1, ry * 0.6), css(0x9c6634))
  fillPts(ctx, oval(bx + r * 0.05, 0, rx * 0.92, ry * 0.42), css(0xe8bc7c))
  for (let i = 0; i < 7; i++) {
    const x = r * (0.55 - i * 0.26)
    ctx.beginPath(); ctx.moveTo(x, -ry * 1.1); ctx.quadraticCurveTo(x - r * 0.16, 0, x, ry * 1.1)
    ctx.lineWidth = 0.75; ctx.strokeStyle = 'rgba(40,20,8,0.85)'; ctx.stroke()
  }
  ctx.restore()
  foil(ctx, oval(bx, 0, rx, ry * 0.5), 0.3, 0.75, 0.1)
  rim(ctx, body, 1.1)
  ink(ctx, body, 1.4)
  // the ovipositor / cerci
  for (const s of [-1, 1]) inkLimb(ctx, [[bx - rx * 0.92, s * r * 0.1], [bx - rx - r * 0.5, s * r * 0.26]], r * 0.07, r * 0.04, 0x8a5a2a)
  // head, tucked under the hump, eyes on the sides
  const head = oval(r * 0.95, 0, r * 0.32, r * 0.34)
  fillPts(ctx, head, css(0xa87040))
  fillPts(ctx, oval(r * 0.98, -r * 0.05, r * 0.18, r * 0.16), css(0xdcaa6a))
  ink(ctx, head, 1.2)
  for (const s of [-1, 1]) cardEye(ctx, r * 1.02, s * r * 0.22, r * 0.09)
}

// OLM: a long coral-pink salamander, four thick little legs, three blood-red gill plumes a side, no
// eyes. Saturated flesh under a heavy ink line, so it reads on the dark shards and the pale caverns.
function paintOlm(ctx, phase) {
  const r = 18
  const L = r * 3.0
  const spine = (t) => [r * 1.05 - t * L, Math.sin(t * Math.PI * 1.6 - phase) * r * 0.26 * Math.min(1, t * 2.2)]
  const half = (t) => r * (t < 0.12 ? 0.22 + 0.1 * Math.sin((t / 0.12) * Math.PI / 2) : 0.32 * Math.max(0.12, 1 - Math.pow((t - 0.12) / 0.88, 1.5)))
  const FLESH = 0xee7092, UNDER = 0xb8406a, SHINE = 0xffd0dc
  // legs: four stubby sprawling limbs, thick as the gill stems, elbows bent back, splayed toes —
  // the salamander's push-up stance, read from above as four short paddles off the flanks
  for (const [tt, s0, toes] of [[0.22, 1, 3], [0.55, -1, 2]]) {
    const [lx, ly] = spine(tt)
    for (const s of [-1, 1]) {
      const sw = Math.sin(phase + s * s0) * 0.22
      const hip = [lx, ly + s * r * 0.2]
      const elbow = [lx - r * (0.06 - sw * 0.5), ly + s * r * 0.56]
      const foot = [lx + r * (0.16 + sw), ly + s * r * 0.76]
      inkLimb(ctx, [hip, elbow, foot], r * 0.24, r * 0.17, FLESH, { ink: 1.2, hi: SHINE })
      for (let k = 0; k < toes; k++) {
        const a = Math.atan2(s * 0.5, 1) + (k - (toes - 1) / 2) * 0.62 * s
        inkLimb(ctx, [foot, [foot[0] + Math.cos(a) * r * 0.24, foot[1] + Math.sin(a) * r * 0.24]], r * 0.1, r * 0.08, FLESH, { ink: 0.9, hi: false })
      }
      // the foot pad over the toe roots
      ctx.beginPath(); ctx.arc(foot[0], foot[1], r * 0.09, 0, TAU); ctx.fillStyle = css(FLESH); ctx.fill()
    }
  }
  // the tail fin, a translucent pink veil
  const fin = spineOutline(spine, (t) => half(t) * 1.55, 24, 0.55, 1)
  fillPts(ctx, fin, 'rgba(232,120,150,0.8)')
  ink(ctx, fin, 0.8)
  // gills: three plumes a side, feathered, in a red that the foil pass leaves alone
  const [gx, gy] = spine(0.11)
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const a = s * (1.15 + k * 0.42) + Math.sin(phase + k) * 0.06
      const tx = gx + Math.cos(a) * r * 0.72, ty = gy + Math.sin(a) * r * 0.72
      const bx = gx + Math.cos(a) * r * 0.12, by = gy + s * r * 0.14 + Math.sin(a) * r * 0.1
      ctx.save(); ctx.lineCap = 'round'
      for (let q = 1; q <= 6; q++) {
        const u = q / 7, px = lerp(bx, tx, u), py = lerp(by, ty, u), l = r * 0.17 * (1 - u * 0.45)
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a + side * 1.0) * l, py + Math.sin(a + side * 1.0) * l)
          ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke()
          ctx.lineWidth = 0.9; ctx.strokeStyle = '#e8183c'; ctx.stroke()
        }
      }
      ctx.restore()
      inkLimb(ctx, [[bx, by], [tx, ty]], r * 0.13, r * 0.07, 0xc80a2a, { ink: 0.9, hi: 0xff6a7a })
    }
  }
  // the body: saturated flesh, a darker underside down both flanks, a pale wet shine down the back;
  // the pearl rim under the ink is what the foil pass catches
  const sil = spineOutline(spine, half, 56)
  fillPts(ctx, sil, css(FLESH))
  ctx.save(); trace(ctx, sil); ctx.clip()
  fillPts(ctx, spineOutline((t) => { const [x, y, nx, ny] = across(spine, t, half(t) * 0.8); return [x + nx, y + ny] }, (t) => half(t) * 0.42, 30), css(UNDER))
  fillPts(ctx, spineOutline((t) => { const [x, y, nx, ny] = across(spine, t, half(t) * 0.8); return [x - nx, y - ny] }, (t) => half(t) * 0.42, 30), css(UNDER))
  fillPts(ctx, spineOutline(spine, (t) => half(t) * 0.26, 30, 0.04, 0.72), css(SHINE))
  // costal grooves, inked
  for (let t = 0.2; t < 0.64; t += 0.04) {
    const [x, y, nx, ny] = across(spine, t, half(t))
    ctx.beginPath(); ctx.moveTo(x + nx * 0.45, y + ny * 0.45); ctx.lineTo(x + nx, y + ny); ctx.moveTo(x - nx * 0.45, y - ny * 0.45); ctx.lineTo(x - nx, y - ny)
    ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(70,10,40,0.7)'; ctx.stroke()
  }
  ctx.restore()
  rim(ctx, sil, 1.2)
  ink(ctx, sil, 1.4)
  // the blind head: two pits where eyes would be, two nostrils
  const [hx, hy] = spine(0.03)
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.arc(hx - r * 0.22, hy + s * r * 0.13, r * 0.045, 0, TAU); ctx.fillStyle = 'rgba(110,20,60,0.75)'; ctx.fill()
    ctx.beginPath(); ctx.arc(hx + r * 0.05, hy + s * r * 0.07, r * 0.025, 0, TAU); ctx.fillStyle = INK; ctx.fill()
  }
}

// opal colour: a milky pastel body colour (pearl), and pure spectral FIRE (the flashes inside an opal)
const milk = (t, k = 0.1, base = 0.86) => film(t, k, base)
const fire = (t) => {
  // the spectrum pushed to full saturation: the brightest channel stays, the dimmest goes to ~0
  const c = film(t, 0.5, 0.5), R = c >> 16, G = (c >> 8) & 255, B = c & 255
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), k = 255 / Math.max(1, mx - mn)
  const f = (v) => Math.round(Math.max(0, Math.min(255, (v - mn) * k)))
  return (f(R) << 16) | (f(G) << 8) | f(B)
}
// flecks of fire inside a clipped face: little angular patches of pure colour, the opal's play
function fireFlecks(ctx, pts, n, size, t0, rnd) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]) }
  ctx.save(); trace(ctx, pts); ctx.clip()
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, rnd()), y = lerp(y0, y1, rnd()), q = size * (0.5 + rnd()), a = rnd() * TAU
    const V = []
    for (let k = 0; k < 4; k++) { const b = a + (k / 4) * TAU + rnd() * 0.6, d = q * (0.5 + rnd() * 0.6); V.push(x + Math.cos(b) * d, y + Math.sin(b) * d * 0.7) }
    fillPts(ctx, V, css(fire(t0 + rnd() * 0.5), 0.92))
  }
  ctx.restore()
}
// One crystal point, card style: two flat faces split down a white ridge, each its own film colour.
function holoSpike(ctx, x, y, len, wid, ang, t0, lw = 1.1) {
  const c = Math.cos(ang), s = Math.sin(ang)
  const P = (u, v) => [x + c * u - s * v, y + s * u + c * v]
  const tip = P(len, 0), l = P(len * 0.72, -wid), rr = P(len * 0.72, wid), bl = P(0, -wid * 0.9), br = P(0, wid * 0.9), b0 = P(0, 0)
  const out = [...bl, ...l, ...tip, ...rr, ...br]
  fillPts(ctx, [...bl, ...l, ...tip, ...b0], css(film(t0, 0.16, 0.6)))
  fillPts(ctx, [...b0, ...tip, ...rr, ...br], css(film(t0 + 0.28, 0.15, 0.48)))
  ctx.save(); trace(ctx, out); ctx.clip()
  ctx.beginPath(); ctx.moveTo(...P(len * 0.08, -wid * 0.45)); ctx.lineTo(...P(len * 0.65, -wid * 0.7)); ctx.lineTo(...P(len * 0.6, -wid * 0.2)); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill()
  ctx.restore()
  ctx.beginPath(); ctx.moveTo(...b0); ctx.lineTo(...tip); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = '#ffffff'; ctx.stroke()
  ink(ctx, out, lw)
  return out
}
// CRYSTAL CRAB: a deep-blue crab, two big claws, eight legs, a crown of foil crystals grown on its back.
function paintCrystalCrab(ctx, phase) {
  const r = 26, rnd = rng(113)
  const sw = Math.sin(phase), shell = 0x262a64, legC = 0x343a88
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const k = (i % 2 ? 1 : -1) * sw * 0.09
      const bx = r * (0.28 - i * 0.26), by = s * r * 0.5
      const kx = bx + r * (0.05 - i * 0.12 + k), ky = s * r * (1.0 + Math.abs(k))
      const tx = kx - r * (0.17 + i * 0.08), ty = s * r * (1.36 - i * 0.04)
      inkLimb(ctx, [[bx, by], [kx, ky], [tx, ty]], r * 0.15, r * 0.06, legC, { ink: 1.1, hi: 0x8a94e8 })
    }
  }
  for (const s of [-1, 1]) {
    const cx = r * 1.0, cy = s * r * (0.64 + sw * 0.03)
    inkLimb(ctx, [[r * 0.45, s * r * 0.42], [r * 0.7, s * r * 0.74], [cx - r * 0.12, cy]], r * 0.2, r * 0.17, legC, { ink: 1.2, hi: 0x8a94e8 })
    // the pincer: palm, a fixed finger and the moving finger, a gap between them
    // the pincer: two long curved fingers, the inner one toothed, open on a dark gap
    const finger = (y0, y1, bend, w) => {
      const sp = (t) => [cx + r * (0.15 + t * 0.85), cy + s * r * (lerp(y0, y1, t) + Math.sin(t * Math.PI) * bend)]
      return spineOutline(sp, (t) => r * w * (1 - t * 0.85), 18)
    }
    const fixedF = finger(-0.12, 0.06, -0.1, 0.16), moveF = finger(0.14, 0.12, 0.1, 0.13)
    for (const f of [moveF, fixedF]) { fillPts(ctx, f, css(0x3e46aa)); foil(ctx, f, 0.4, 0.35, 0.5); ink(ctx, f, 1.3) }
    const palm = oval(cx, cy, r * 0.34, r * 0.24, s * 0.2, 30)
    fillPts(ctx, palm, css(0x363ea0))
    fillPts(ctx, oval(cx - r * 0.04, cy - s * r * 0.06, r * 0.26, r * 0.12, s * 0.25, 20), css(0x6a78e0))
    foil(ctx, palm, 0.6, 0.4, 0.7)
    rim(ctx, palm, 1.1)
    ink(ctx, palm, 1.4)
  }
  // carapace: a broad deep-blue shield, a cobalt band, a pearl rim, tubercles inked over it
  const cara = oval(0, 0, r * 0.7, r * 0.86, 0, 52)
  fillPts(ctx, cara, css(shell))
  ctx.save(); trace(ctx, cara); ctx.clip()
  ctx.lineWidth = r * 0.12; ctx.strokeStyle = css(0x4a62d8); trace(ctx, oval(0, 0, r * 0.66, r * 0.82)); ctx.stroke()
  for (let i = 0; i < 46; i++) {
    const x = (rnd() - 0.5) * r * 1.3, y = (rnd() - 0.5) * r * 1.6, rr = 0.6 + rnd() * 1.1
    ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fillStyle = css(0x3c4aa8); ctx.fill()
    ctx.beginPath(); ctx.arc(x - rr * 0.3, y - rr * 0.3, rr * 0.4, 0, TAU); ctx.fillStyle = 'rgba(170,190,255,0.85)'; ctx.fill()
  }
  ctx.restore()
  foil(ctx, cara, 0.5, 0.3, 0.9)
  rim(ctx, cara, 1.6)
  ink(ctx, cara, 1.8)
  // eyes on stalks at the front
  for (const s of [-1, 1]) {
    inkLimb(ctx, [[r * 0.58, s * r * 0.18], [r * 0.82, s * r * 0.26]], r * 0.07, r * 0.06, legC, { ink: 0.9 })
    cardEye(ctx, r * 0.84, s * r * 0.27, r * 0.08)
  }
  // the crystals on its back: the most foil on the creature
  const pts = [[-r * 0.12, 0, r * 0.8, r * 0.17, -2.9, 0.0], [r * 0.04, -r * 0.24, r * 0.6, r * 0.15, -1.9, 0.35],
    [r * 0.02, r * 0.26, r * 0.58, r * 0.14, 1.95, 0.6], [-r * 0.32, -r * 0.34, r * 0.46, r * 0.12, -2.4, 0.15], [-r * 0.32, r * 0.36, r * 0.44, r * 0.12, 2.45, 0.8]]
  for (const [x, y, l, w, a, t] of pts) holoSpike(ctx, x, y, l, w, a, t, 1.2)
  // a star of light where they meet
  glintStar(ctx, -r * 0.05, -r * 0.05, r * 0.32, 0.9)
}

// BAT: spread-eagle from above, wings OPEN in every frame and straight out to the sides, the two
// halves mirror images: a straight leading edge to the wrist and the wingtip, four finger bones
// fanning back from the wrist, the membrane scalloped between them down to the ankle, and the tail
// membrane a scalloped V between the feet. A furry body, a head with two big ears.
function paintBat(ctx, phase) {
  const r = 14, rnd = rng(131)
  const flap = 0.86 + 0.14 * Math.cos(phase)
  const sweep = Math.sin(phase) * 0.1
  const ankleX = -r * 0.62
  const scallop = (a, b, toward, k) => [lerp((a[0] + b[0]) / 2, toward[0], k), lerp((a[1] + b[1]) / 2, toward[1], k)]
  for (const s of [-1, 1]) {
    const span = r * 3.0 * flap
    const shoulder = [r * 0.18, s * r * 0.26]
    const wrist = [r * (0.5 + sweep), s * span * 0.44]
    const tips = [[r * (0.38 + sweep * 0.6), s * span], [-r * 0.2, s * span * 0.97], [-r * 0.66, s * span * 0.74], [-r * 0.78, s * span * 0.45]]
    const ankle = [ankleX, s * r * 0.34]
    const outline = [...shoulder, ...wrist, ...tips[0]]
    for (let i = 0; i < 3; i++) outline.push(...scallop(tips[i], tips[i + 1], wrist, 0.22), ...tips[i + 1])
    outline.push(...scallop(tips[3], ankle, wrist, 0.18), ...ankle, -r * 0.2, s * r * 0.3)
    fillPts(ctx, outline, css(0x7434a6))
    ctx.save(); trace(ctx, outline); ctx.clip()
    // the oil slick on the leather: a dark rainbow lying across the membrane
    ctx.globalAlpha = 0.3
    ctx.fillStyle = filmGrad(ctx, 0, 0, r * 0.4, s * span, 0.1, 1.4, 1, 0.4, 0.45)
    ctx.fillRect(-r * 2, -span * 1.2, r * 4, span * 2.4)
    ctx.globalAlpha = 1
    // the panels between the fingers, lit through
    for (let i = 0; i < 3; i++) {
      const a = tips[i], b = tips[i + 1]
      softFill(ctx, [lerp(wrist[0], (a[0] + b[0]) / 2, 0.3), lerp(wrist[1], (a[1] + b[1]) / 2, 0.3), lerp(wrist[0], a[0], 0.78), lerp(wrist[1], a[1], 0.78), lerp(wrist[0], b[0], 0.78), lerp(wrist[1], b[1], 0.78)], 2.2, 'rgba(255,190,255,0.2)')
    }
    ctx.restore()
    rim(ctx, outline, 0.7, 0.6)
    ink(ctx, outline, 1.4)
    // the arm and the four long finger bones, pale over the leather
    inkLimb(ctx, [shoulder, wrist], r * 0.15, r * 0.11, 0xc8bcd4, { ink: 0.9, hi: 0xffffff })
    for (const t of tips) inkLimb(ctx, [wrist, t], r * 0.075, r * 0.03, 0xdcd2e6, { ink: 0.65, hi: 0xffffff })
    // the thumb claw, forward off the wrist
    inkLimb(ctx, [wrist, [wrist[0] + r * 0.26, wrist[1] - s * r * 0.04]], r * 0.07, r * 0.03, 0xf0e8f4, { ink: 0.7, hi: false })
  }
  // the tail membrane: a scalloped V from ankle to ankle, behind the body
  const tailTip = [-r * 1.28, 0]
  const tail = [ankleX, -r * 0.34, ...scallop([ankleX, -r * 0.34], tailTip, [-r * 0.5, 0], 0.25), ...tailTip, ...scallop(tailTip, [ankleX, r * 0.34], [-r * 0.5, 0], 0.25), ankleX, r * 0.34]
  fillPts(ctx, tail, css(0x5a2884))
  ink(ctx, tail, 1.1)
  // the feet, two little hooked toes at each ankle
  for (const s of [-1, 1]) inkLimb(ctx, [[ankleX + r * 0.1, s * r * 0.24], [ankleX - r * 0.12, s * r * 0.4]], r * 0.07, r * 0.04, 0x8a7090, { ink: 0.7, hi: false })
  // the body: dark fur, a lighter mantle
  const body = oval(-r * 0.12, 0, r * 0.66, r * 0.36, 0, 34)
  fillPts(ctx, body, css(0x4a3450))
  ctx.save(); trace(ctx, body); ctx.clip()
  fillPts(ctx, oval(r * 0.1, 0, r * 0.45, r * 0.4), css(0x7a5a78))
  ctx.lineCap = 'round'
  for (let i = 0; i < 120; i++) {
    const x = -r * 0.9 + rnd() * r * 1.5, y = (rnd() - 0.5) * r * 0.8
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - r * 0.12, y + (rnd() - 0.5) * r * 0.06)
    ctx.lineWidth = 0.35; ctx.strokeStyle = rnd() < 0.5 ? 'rgba(20,10,24,0.6)' : 'rgba(200,170,210,0.45)'; ctx.stroke()
  }
  ctx.restore()
  foil(ctx, body, 0.2, 0.35, 0.4)
  ink(ctx, body, 1.3)
  // the head and its two big ears
  for (const s of [-1, 1]) {
    const ear = [r * 0.56, s * r * 0.08, r * 1.2, s * r * 0.4, r * 0.62, s * r * 0.42]
    fillPts(ctx, ear, css(0x4a3450))
    fillPts(ctx, [r * 0.64, s * r * 0.15, r * 1.06, s * r * 0.36, r * 0.68, s * r * 0.35], css(0xe89ab4))
    ink(ctx, ear, 1.1)
  }
  const head = oval(r * 0.62, 0, r * 0.34, r * 0.33)
  fillPts(ctx, head, css(0x5c4262))
  fillPts(ctx, oval(r * 0.7, 0, r * 0.18, r * 0.2), css(0x8a6a8a))
  ink(ctx, head, 1.2)
  for (const s of [-1, 1]) cardEye(ctx, r * 0.8, s * r * 0.14, r * 0.075)
  fillPts(ctx, [r * 0.9, -r * 0.07, r * 1.0, 0, r * 0.9, r * 0.07], INK)
}

export const HOLO_CAST = {
  olm: { r: 18, E: 60, frames: 6, shadowBlur: 0.7, shadow: [18 * 1.5, 18 * 0.35], crown: [-18 * 0.4, 18], paint: (ctx, f) => paintOlm(ctx, f) },
  caveCricket: { r: 13, E: 48, poses: 4, shadowBlur: 0.6, shadow: [13 * 1.2, 13 * 0.5], crown: [-13 * 0.6, 13], paint: (ctx, p) => paintCaveCricket(ctx, p) },
  crystalCrab: { r: 26, E: 54, frames: 4, shadowBlur: 0.8, shadow: [26 * 1.25, 26 * 0.6], crown: [-26 * 0.95, 26], paint: (ctx, f) => paintCrystalCrab(ctx, f) },
  bat: { r: 14, E: 48, frames: 4, shadowBlur: 0.6, shadow: [14 * 2.4, 14 * 0.3], crown: [-14 * 0.5, 14], paint: (ctx, f) => paintBat(ctx, f) },
}

// ==== GLINTS ======================================================================================
// A star of opal fire: four long spikes and four short ones, each running white -> pure spectral
// colour -> clear. Drawn normally, not added, so it still shows on the pale pearl floor.
function glintStar(ctx, x, y, R, a = 1) {
  ctx.save()
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * TAU, L = R * (i % 2 ? 0.5 : 1), w = R * (i % 2 ? 0.05 : 0.075)
    const c = Math.cos(ang), s = Math.sin(ang)
    const g = ctx.createLinearGradient(x, y, x + c * L, y + s * L)
    g.addColorStop(0, `rgba(255,255,255,${a})`)
    for (let k = 1; k <= 4; k++) g.addColorStop(k / 5, css(fire(k / 5 + i * 0.13), a * (1 - k / 6)))
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.beginPath(); ctx.moveTo(x - s * w, y + c * w); ctx.lineTo(x + c * L, y + s * L); ctx.lineTo(x + s * w, y - c * w); ctx.closePath()
    ctx.fillStyle = g; ctx.fill()
  }
  softDot(ctx, x, y, R * 0.08, R * 0.12, `rgba(255,255,255,${a})`)
  ctx.restore()
}
export function paintGlint() {
  const N = 96, c = makeCanvas(N, N), ctx = c.getContext('2d')
  ctx.translate(N / 2, N / 2)
  // a dark ink cross under the fire so the flash reads on a white floor
  ctx.save(); ctx.lineCap = 'round'
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU, L = N * 0.4
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L); ctx.lineWidth = N * 0.05; ctx.strokeStyle = 'rgba(18,10,30,0.55)'; ctx.stroke()
  }
  ctx.restore()
  glintStar(ctx, 0, 0, N * 0.48, 1)
  return c
}
// An opal ring: concentric bands of pure fire between two ink lines — the bounce's and chime's flash.
export function paintFilmRing() {
  const N = 128, c = makeCanvas(N, N), ctx = c.getContext('2d')
  ctx.beginPath(); ctx.arc(N / 2, N / 2, N * 0.475, 0, TAU); ctx.lineWidth = N * 0.018; ctx.strokeStyle = 'rgba(18,10,30,0.8)'; ctx.stroke()
  for (let i = 0; i < 12; i++) {
    const u = i / 11
    ctx.beginPath(); ctx.arc(N / 2, N / 2, N * (0.46 - u * 0.09), 0, TAU)
    ctx.lineWidth = N * 0.012; ctx.strokeStyle = css(fire(u * 0.95), 0.4 + Math.sin(u * Math.PI) * 0.6); ctx.stroke()
  }
  ctx.beginPath(); ctx.arc(N / 2, N / 2, N * 0.36, 0, TAU); ctx.lineWidth = N * 0.012; ctx.strokeStyle = 'rgba(18,10,30,0.6)'; ctx.stroke()
  return c
}

// ==== THE FLOOR: CRACKED-ICE FOIL ==================================================================
// The geode's floor as the "cracked ice" holo pattern: a periodic Voronoi of shards, each shard a
// flat dark facet tilted its own way and ruled with its own diffraction grating, the cracks between
// them bright. Everything is near-neutral violet-black on purpose — FOIL_FRAG gives every shard its
// own interference colour by its brightness, so the floor shimmers in tiles as the camera moves.
export const TILE_WORLD = 1024
export const TILE_RES = 1
export function paintFoilTile() {
  const W = Math.round(TILE_WORLD * TILE_RES), S = TILE_RES
  const c = makeCanvas(W, W), ctx = c.getContext('2d')
  const rnd = rng(9090)
  const mkGrid = (n) => {
    const g = []
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      g.push({ x: (i + 0.15 + rnd() * 0.7) * (TILE_WORLD / n), y: (j + 0.15 + rnd() * 0.7) * (TILE_WORLD / n),
        L: 0.05 + Math.pow(rnd(), 1.6) * 0.13, ta: rnd() * TAU, tk: 0.02 + rnd() * 0.05, ga: rnd() * Math.PI, gk: rnd() < 0.4 ? 0.008 + rnd() * 0.012 : 0, hue: rnd() })
    }
    return g
  }
  const N1 = 9, N2 = 26
  const g1 = mkGrid(N1), g2 = mkGrid(N2)
  const voro = (g, n, x, y) => {
    const cs = TILE_WORLD / n, ci = Math.floor(x / cs), cj = Math.floor(y / cs)
    let d1 = 1e9, d2 = 1e9, best = null, bx = 0, by = 0
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      let ii = ci + di, jj = cj + dj, ox = 0, oy = 0
      if (ii < 0) { ii += n; ox = -TILE_WORLD } else if (ii >= n) { ii -= n; ox = TILE_WORLD }
      if (jj < 0) { jj += n; oy = -TILE_WORLD } else if (jj >= n) { jj -= n; oy = TILE_WORLD }
      const p = g[jj * n + ii], dx = x - (p.x + ox), dy = y - (p.y + oy), d = dx * dx + dy * dy
      if (d < d1) { d2 = d1; d1 = d; best = p; bx = dx; by = dy } else if (d < d2) d2 = d
    }
    return [best, Math.sqrt(d2) - Math.sqrt(d1), bx, by]
  }
  const img = ctx.createImageData(W, W), D = img.data
  for (let py = 0; py < W; py++) {
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5) / S, y = (py + 0.5) / S
      const [p, e1, dx, dy] = voro(g1, N1, x, y)
      const [q, e2] = voro(g2, N2, x, y)
      // the shard's facet: its own level, tilted, ruled with its own grating
      let L = p.L + (q.L - 0.11) * 0.35
      L += (dx * Math.cos(p.ta) + dy * Math.sin(p.ta)) / 70 * p.tk
      if (p.gk) L += p.gk * Math.sin((x * Math.cos(p.ga) + y * Math.sin(p.ga)) * 0.95)
      // the fine cracks of the small shards
      if (e2 < 1.2) L += 0.035 * (1 - e2 / 1.2)
      // the big cracks: a thin pale seam (the live foil pass catches it) with a dark bevel beside it
      let crack = 0
      if (e1 < 1.4) { crack = 1 - e1 / 1.4; L = Math.max(L, 0.36 * crack + 0.1) }
      else if (e1 < 5) L *= 0.5 + 0.5 * ((e1 - 1.4) / 3.6)
      L = Math.max(0, Math.min(1, L))
      // each shard keeps one deep, desaturated hue of its own: ink-violet leaning to teal or rose
      const fc = film(p.hue, 0.5, 0.5)
      const k = 0.28 * (1 - crack)
      const tr = lerp(0.82, ((fc >> 16) & 255) / 255 * 1.4, k), tg = lerp(0.8, ((fc >> 8) & 255) / 255 * 1.4, k), tb = lerp(1.18, (fc & 255) / 255 * 1.4, k)
      const o = (py * W + px) * 4
      D[o] = Math.min(255, L * tr * 255); D[o + 1] = Math.min(255, L * tg * 255); D[o + 2] = Math.min(255, L * tb * 255); D[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  ctx._S = S
  // glitter: specks of foil, some with a tiny cross
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * TILE_WORLD, y = rnd() * TILE_WORLD, r = 0.4 + rnd() * rnd() * 0.9
    ctx.fillStyle = `rgba(200,196,230,${0.12 + rnd() * 0.3})`; ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 18; i++) {
    const x = 20 + rnd() * (TILE_WORLD - 40), y = 20 + rnd() * (TILE_WORLD - 40), r = 2.5 + rnd() * 3.5
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x - r, y - 0.4, r * 2, 0.8); ctx.fillRect(x - 0.4, y - r, 0.8, r * 2)
  }
  return c
}

// ==== THE CAVERN FLOOR: MOTHER-OF-PEARL ===========================================================
// The opal caverns' floor: cracked nacre, a periodic Voronoi of pale shards, each its own faint pastel
// (pink, mint, lilac, blue, cream), ruled with concentric growth lines, split by thin dark cracks with
// a bright lip. Light and near-neutral on purpose: inside a cavern FOIL_FRAG turns it to moving pearl.
const NACRE = [[1.0, 0.9, 0.95], [0.9, 1.0, 0.95], [0.94, 0.91, 1.0], [0.9, 0.95, 1.0], [1.0, 0.95, 0.9], [0.97, 0.97, 0.95]]
export function paintNacreTile() {
  const W = Math.round(TILE_WORLD * TILE_RES), S = TILE_RES
  const c = makeCanvas(W, W), ctx = c.getContext('2d')
  const rnd = rng(9191)
  const mkGrid = (n) => {
    const g = []
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      g.push({ x: (i + 0.15 + rnd() * 0.7) * (TILE_WORLD / n), y: (j + 0.15 + rnd() * 0.7) * (TILE_WORLD / n),
        L: 0.82 + rnd() * 0.12, ta: rnd() * TAU, tk: 0.02 + rnd() * 0.04, gw: 0.12 + rnd() * 0.22, tint: NACRE[Math.floor(rnd() * NACRE.length)] })
    }
    return g
  }
  const N1 = 9, N2 = 26
  const g1 = mkGrid(N1), g2 = mkGrid(N2)
  const voro = (g, n, x, y) => {
    const cs = TILE_WORLD / n, ci = Math.floor(x / cs), cj = Math.floor(y / cs)
    let d1 = 1e9, d2 = 1e9, best = null, bx = 0, by = 0
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      let ii = ci + di, jj = cj + dj, ox = 0, oy = 0
      if (ii < 0) { ii += n; ox = -TILE_WORLD } else if (ii >= n) { ii -= n; ox = TILE_WORLD }
      if (jj < 0) { jj += n; oy = -TILE_WORLD } else if (jj >= n) { jj -= n; oy = TILE_WORLD }
      const p = g[jj * n + ii], dx = x - (p.x + ox), dy = y - (p.y + oy), d = dx * dx + dy * dy
      if (d < d1) { d2 = d1; d1 = d; best = p; bx = dx; by = dy } else if (d < d2) d2 = d
    }
    return [best, Math.sqrt(d2) - Math.sqrt(d1), bx, by]
  }
  const img = ctx.createImageData(W, W), D = img.data
  for (let py = 0; py < W; py++) {
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5) / S, y = (py + 0.5) / S
      const [p, e1, dx, dy] = voro(g1, N1, x, y)
      const [q, e2] = voro(g2, N2, x, y)
      // the shard's level, tilted a little, and its growth lines: concentric ripples round its heart
      let L = p.L + (q.L - 0.87) * 0.3
      L += (dx * Math.cos(p.ta) + dy * Math.sin(p.ta)) / 70 * p.tk
      L += 0.022 * Math.sin(Math.hypot(dx, dy * 1.3) * p.gw + 3 * Math.sin(dx * 0.02 + p.ta) + p.ta * 7) * (0.5 + 0.5 * Math.sin(Math.atan2(dy, dx) * 2 + p.ta))
      // the fine cracks of the small shards: a faint grey hairline
      if (e2 < 1.1) L -= 0.07 * (1 - e2 / 1.1)
      // the big cracks: a dark line, a bright lip beside it, a soft bevel past that
      let ink = 0
      if (e1 < 1.3) ink = 1 - e1 / 1.3 * 0.4
      else if (e1 < 3) L += 0.07
      else if (e1 < 7) L -= 0.035 * (1 - (e1 - 3) / 4)
      L = Math.max(0, Math.min(1.02, L))
      const t = p.tint, o = (py * W + px) * 4
      const r = L * t[0] * 255, gg = L * t[1] * 255, b = L * t[2] * 255
      D[o] = Math.min(255, lerp(r, 104, ink)); D[o + 1] = Math.min(255, lerp(gg, 88, ink)); D[o + 2] = Math.min(255, lerp(b, 132, ink)); D[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  ctx._S = S
  // inclusions: tiny grey-violet specks, so the pale floor has a grain to read speed against
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * TILE_WORLD, y = rnd() * TILE_WORLD, r = 0.4 + rnd() * rnd() * 1.1
    ctx.fillStyle = `rgba(120,100,150,${0.15 + rnd() * 0.3})`; ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  return c
}

// ==== FLOOR PROPS =================================================================================
// A druse of crystal points seen from above, and a flake of foil lying on the floor.
function hexTop(ctx, x, y, r, rot, t0) {
  const V = []
  for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * TAU; V.push([x + Math.cos(a) * r, y + Math.sin(a) * r]) }
  const ap = [x - r * 0.12, y - r * 0.14]
  for (let i = 0; i < 6; i++) {
    const p0 = V[i], p1 = V[(i + 1) % 6]
    fillPts(ctx, [...ap, ...p0, ...p1], css(film(t0 + i / 6, 0.16, 0.56 + 0.2 * Math.cos(i - 2))))
  }
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(0.3, r * 0.06)
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(...ap); ctx.lineTo(...V[i]); ctx.stroke() }
  ctx.restore()
  ink(ctx, V.flat(), Math.max(0.8, r * 0.12))
}
export function paintHoloProp(kind, seed) {
  return bakeLocal(36, 3, (ctx) => {
    const rnd = rng(seed)
    if (kind === 'druse') {
      withBlur(ctx, 3, 'rgba(0,0,0,0.6)', () => { ctx.beginPath(); ctx.arc(1.5, 2, 13, 0, TAU); ctx.fill() })
      const n = 4 + Math.floor(rnd() * 4)
      for (let k = 0; k < n; k++) {
        const a = rnd() * TAU, d = rnd() * 9
        hexTop(ctx, Math.cos(a) * d, Math.sin(a) * d, 3.5 + rnd() * 5, rnd() * TAU, rnd())
      }
    } else {
      const V = []
      const m = 5 + Math.floor(rnd() * 3)
      for (let i = 0; i < m; i++) { const a = (i / m) * TAU + rnd() * 0.5, q = 8 + rnd() * 10; V.push(Math.cos(a) * q, Math.sin(a) * q * 0.7) }
      withBlur(ctx, 2, 'rgba(0,0,0,0.6)', () => { ctx.save(); ctx.translate(1.5, 2); trace(ctx, V); ctx.fill(); ctx.restore() })
      fillPts(ctx, V, css(0x8a86a0))
      foil(ctx, V, rnd() * TAU, 0.9, rnd())
      ink(ctx, V, 1.2)
    }
  }, { shadowBlur: 0.5 }).body
}

// ==== THE PILLARS =================================================================================
// A crystal cluster, the most holographic thing in the chapter: every face its own film colour, white
// ridges, an inked outline, a diffraction halo round its foot and stars of light on it. Painted at
// R = 64 and scaled to each collider; never rotated.
export function paintHoloPillar(variant) {
  const R = 64
  return bakeLocal(R * 2.1, 2, (ctx) => {
    const rnd = rng(707 + variant * 31)
    const t0 = variant * 0.17
    // the halo it throws on the floor: rings of interference colour
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 5; i++) softDot(ctx, 0, 0, R * (1.15 - i * 0.12), R * 0.12, css(film(t0 + i * 0.2, 0.5, 0.5), 0.12))
    ctx.restore()
    // the socket: dark rock, inked
    const foot = []
    for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU, q = R * (0.86 + rnd() * 0.16); foot.push(Math.cos(a) * q, Math.sin(a) * q) }
    withBlur(ctx, R * 0.06, 'rgba(0,0,0,0.9)', () => { ctx.save(); ctx.translate(R * 0.06, R * 0.08); trace(ctx, foot); ctx.fill(); ctx.restore() })
    fillPts(ctx, foot, css(0x1a1626))
    for (let i = 0; i < 18; i += 2) {
      const a = (i / 18) * TAU
      fillPts(ctx, [0, 0, foot[i * 2], foot[i * 2 + 1], foot[(i * 2 + 2) % 36], foot[(i * 2 + 3) % 36]], css(mixc(0x221c32, 0x3a3452, 0.5 + 0.5 * Math.cos(a + 2.2))))
    }
    ink(ctx, foot, 2.4)
    // the crystals: the leaning ones first (behind), the upright core last
    const n = 7 + (variant % 3)
    const spikes = []
    for (let i = 0; i < n; i++) spikes.push([(i / n) * TAU + rnd() * 0.6, R * (0.1 + rnd() * 0.14), R * (0.62 + rnd() * 0.4), R * (0.14 + rnd() * 0.07), rnd()])
    spikes.sort((p, q) => Math.sin(q[0]) - Math.sin(p[0]))
    for (const [a, d, len, wid, t] of spikes) holoSpike(ctx, Math.cos(a) * d, Math.sin(a) * d, len, wid, a, t0 + t, 2.2)
    hexTop(ctx, 0, 0, R * 0.36, rnd() * TAU, t0 + 0.5)
    // stars of light
    glintStar(ctx, -R * 0.08, -R * 0.1, R * 0.6, 0.95)
    for (let k = 0; k < 3; k++) glintStar(ctx, (rnd() - 0.5) * R * 1.1, (rnd() - 0.5) * R * 1.1, R * (0.18 + rnd() * 0.16), 0.85)
  }, { shadowBlur: 1 })
}

// ==== SHOTS =======================================================================================
// Prism Shard: a white-hot splinter of foil, inked, a rainbow fringe either side of its ridge.
export function paintHoloShard() {
  return bakeLocal(18, 3, (ctx) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    softFill(ctx, ellipsePts(1, 0, 12, 4.5, 0, 20), 3, 'rgba(200,170,255,0.55)')
    ctx.restore()
    const top = [-9, 0, -3, -3.6, 12.5, 0], bot = [-9, 0, 12.5, 0, -3, 3.6]
    fillPts(ctx, top, css(0xffffff))
    fillPts(ctx, bot, css(film(0.55, 0.45, 0.6)))
    ctx.save(); trace(ctx, [-9, 0, -3, -3.6, 12.5, 0, -3, 3.6]); ctx.clip()
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = filmGrad(ctx, -9, 0, 12, 0, 0, 1, 1, 0.3, 0.75); ctx.fillRect(-10, -4, 23, 8)
    ctx.restore()
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(12, 0); ctx.lineWidth = 0.6; ctx.strokeStyle = '#ffffff'; ctx.stroke()
    ink(ctx, [-9, 0, -3, -3.6, 12.5, 0, -3, 3.6], 1)
  }, { shadowBlur: 0.3 }).body
}
// The falling stone, from above: a dark faceted cone, inked, foil on its lit facets.
export function paintHoloStalactite() {
  return bakeLocal(40, 2, (ctx) => {
    const rnd = rng(17), R = 30, V = []
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, q = R * (0.82 + rnd() * 0.3); V.push([Math.cos(a) * q, Math.sin(a) * q]) }
    const ap = [-R * 0.1, -R * 0.12]
    for (let i = 0; i < V.length; i++) {
      const p0 = V[i], p1 = V[(i + 1) % V.length]
      const L = 0.5 + 0.5 * Math.cos(Math.atan2(p0[1] + p1[1], p0[0] + p1[0]) + 2.2)
      fillPts(ctx, [...ap, ...p0, ...p1], css(L > 0.6 ? film(i / 9, 0.35, 0.45 + L * 0.2) : mixc(0x120e1c, 0x3a3450, L)))
    }
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.7
    for (const p of V) { ctx.beginPath(); ctx.moveTo(...ap); ctx.lineTo(...p); ctx.stroke() }
    ctx.restore()
    ink(ctx, V.flat(), 2.2)
    glintStar(ctx, ap[0], ap[1], R * 0.45, 0.9)
  }, { shadowBlur: 0.3 })
}

// ==== THE OPAL CAVERNS ============================================================================
// The geode is a dark foil card, and scattered across it are CRYSTAL CAVERNS: big chambers of pale,
// lit-from-within mother-of-pearl, each a faceted organic shape about one to one and a half phone
// screens across (~25% of the floor), ringed by a fringe of crystal teeth and a soft glow spilling
// onto the dark shards. They are a pure function of world position (one maybe per 880px cell, hashed), so they are nailed to the world and never
// flicker: the floor mesh (CAVERN_FLOOR_FRAG) paints them, and FOIL_FRAG evaluates the same field to
// switch from dark foil to pearl inside them. Render only: the sim never hears of them.
// cavern(wp).x is the distance in chamber radii (< 1 inside), .y the angle round its heart, .z its seed.
export const CAVERN_GLSL = `
float cvh12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 cvh22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 cavern(vec2 wp) {
  float G = 880.0;
  vec2 cell = floor(wp / G);
  float best = 9.0, ba = 0.0, bh = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      float h = cvh12(c + 211.0);
      if (h < 0.7) {
        vec2 d = wp - (c + 0.3 + 0.4 * cvh22(c + 37.0)) * G;
        float h2 = cvh12(c + 5.0);
        float an = h2 * 6.28318, ca = cos(an), sa = sin(an);
        vec2 e = vec2(ca * d.x + sa * d.y, (ca * d.y - sa * d.x) * (1.0 + 0.6 * h));
        float a = atan(e.y, e.x);
        // a faceted wall: 14 corners round the chamber, each its own reach (two broad lobes and a
        // jitter), joined by STRAIGHT walls — the distance to the chord between the two corners
        float D = 6.28318 / 14.0, u = (a + 3.14159) / D, k0 = floor(u);
        float t0 = k0 * D - 3.14159, t1 = t0 + D, ph = a - t0;
        float r0 = (0.8 + 0.4 * cvh12(c * 3.1 + k0)) * (1.0 + 0.24 * sin(2.0 * t0 + h * 40.0) + 0.12 * sin(3.0 * t0 + h2 * 25.0));
        float r1 = (0.8 + 0.4 * cvh12(c * 3.1 + mod(k0 + 1.0, 14.0))) * (1.0 + 0.24 * sin(2.0 * t1 + h * 40.0) + 0.12 * sin(3.0 * t1 + h2 * 25.0));
        float rr = r0 * r1 * sin(D) / (r0 * sin(ph) + r1 * sin(D - ph));
        float fd = length(e) / ((260.0 + 130.0 * h2) * rr);
        if (fd < best) { best = fd; ba = a; bh = h2; }
      }
    }
  }
  return vec3(best, ba, bh);
}
`
// The geode floor: the dark cracked-ice foil everywhere, the pale nacre inside the caverns, the crystal
// fringe and the glow at their walls. One mesh over the view, drawn where the floor sprite would be —
// not a filter, so the stage keeps its single full-screen pass.
export const CAVERN_FLOOR_VERT = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vWorld;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uRect;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWorld = uRect.xy + aUV * uRect.zw;
}`
export const CAVERN_FLOOR_FRAG = `
precision highp float;
in vec2 vWorld;
uniform sampler2D uDark;
uniform sampler2D uNacre;
uniform float uTime;
${CAVERN_GLSL}
void main() {
  vec2 uv = vWorld / ${TILE_WORLD.toFixed(1)};
  vec3 col = texture2D(uDark, uv).rgb;
  vec3 cv = cavern(vWorld);
  float f = cv.x;
  if (f < 1.6) {
    vec3 nac = texture2D(uNacre, uv).rgb;
    // the chamber, lit from within: brightest at its heart, a lilac shade down the inside of its wall
    vec3 inner = nac * (1.05 - 0.1 * f * f);
    inner = mix(inner, inner * vec3(0.8, 0.76, 0.94), 0.55 * smoothstep(0.92, 1.0, f));
    // the crystal fringe: points growing off the wall at two scales, most short, a few long, each
    // its own lean and split into a lit face and a shaded one (the pass foils the lit faces)
    float th = 0.0, tt = 0.0;
    for (int s = 0; s < 2; s++) {
      float n = s == 0 ? 66.0 : 160.0;
      float tu = cv.y / 6.28318 * n + cv.z * (7.0 + float(s) * 13.0), tk = floor(tu);
      float hh = cvh12(vec2(tk + float(s) * 101.0, cv.z * 91.0));
      float lean = 0.5 + 0.3 * (cvh12(vec2(tk, cv.z * 53.0 + float(s))) - 0.5);
      float x = tu - tk;
      float tri = x < lean ? x / lean : (1.0 - x) / (1.0 - lean);
      float h = (s == 0 ? 0.12 * hh * hh * step(0.25, hh) : 0.035 * hh) * tri;
      if (h > th) { th = h; tt = x < lean ? 0.0 : 1.0; }
    }
    vec3 tooth = tt < 0.5 ? vec3(0.9, 0.88, 1.0) : vec3(0.42, 0.38, 0.66);
    // the light the chamber spills onto the dark shards, breathing a little
    float out1 = max(0.0, f - 1.0);
    col += vec3(0.42, 0.36, 0.72) * exp(-out1 * 12.0) * (0.42 + 0.06 * sin(uTime * 0.8 + cv.z * 20.0));
    col += vec3(0.3, 0.5, 0.6) * exp(-out1 * 40.0) * 0.25;
    // an ink line round the tips of the teeth, so the fringe reads as cut crystal, not a blur
    float tipEdge = 1.0 - smoothstep(0.0, 0.006, abs(f - 1.0 - th));
    float inTooth = (1.0 - smoothstep(1.0 + th - 0.004, 1.0 + th, f)) * step(0.997, f);
    col = mix(col, tooth, inTooth);
    col = mix(col, vec3(0.06, 0.03, 0.1), tipEdge * 0.85 * step(1.0, f));
    float inCav = 1.0 - smoothstep(0.995, 1.0, f);
    col = mix(col, inner, inCav);
    // the bright lip where the nacre meets the crystal
    col = mix(col, vec3(1.0, 0.98, 1.0), 0.85 * (1.0 - smoothstep(0.0, 0.006, abs(f - 0.997))));
  }
  gl_FragColor = vec4(col, 1.0);
}`

// ==== THE FOIL PASS ===============================================================================
// One full-screen pass over the stage, The Geode only. It reads the cavern field and runs one of two
// looks per pixel (cross-fading at the cavern wall):
// ON THE DARK BASE — foil. Per pixel:
//   foil mask — how much of this pixel is foil: bright enough, and NEUTRAL enough (saturated paint
//     and the ink are left exactly as drawn — that is the readability rule of the whole look);
//   thin film — the interference colour for this pixel: where it sits on the screen (the card's
//     tilt toward you), where the camera is in the world (moving tilts the card), a slow drift in
//     time, a wave anchored to the world, and the pixel's own hue and brightness;
//   glare — a soft bright band sweeping across the card;
//   diffraction sparkle — world-anchored stars that twinkle, brightest on foil.
// IN THE OPAL CAVERNS — pearl. Pale neutrals keep their brightness under a soft pastel play of
//   colour; a lustre band deepens it; flecks and harlequin flushes of pure opal FIRE, nailed to the
//   world, flash on and off with the tilt; stars of fire twinkle.
// Then, everywhere, a dark vignette, the card's edge.
export const FOIL_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform float uTime;
uniform vec2 uCam;
uniform float uZoom;
uniform float uStrength;
uniform float uSparkle;
uniform float uVignette;
uniform vec2 uMaskL;
uniform vec2 uScreen;
uniform float uGlare;
uniform float uFire;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 film(float t) { return 0.55 + 0.45 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
vec3 fireCol(float t) {
  vec3 c = 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
  float mn = min(c.r, min(c.g, c.b)), mx = max(c.r, max(c.g, c.b));
  return clamp((c - mn) / max(0.001, mx - mn), 0.0, 1.0);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hueOf(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn;
  if (d < 1e-4) return 0.0;
  float h;
  if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  return h / 6.0;
}
${CAVERN_GLSL}
// warm paint (the player, the olm's flesh and gills, the cricket's amber) keeps its own colour
float warmKeep(float hu, float sat, float lo, float hi) {
  float dh = min(abs(hu - 0.06), 1.0 - abs(hu - 0.06));
  return 1.0 - (1.0 - smoothstep(0.07, 0.13, dh)) * smoothstep(lo, hi, sat);
}

vec3 foilLook(vec3 c, float L, float sat, float hu, vec2 q, vec2 wp) {
  float tilt = dot(q, vec2(0.85, 0.55)) * 1.2 + (uCam.x * 0.6 + uCam.y * 0.45) * 0.0011 + uTime * 0.05;
  float wave = sin(wp.x * 0.0045 + wp.y * 0.0031 + uTime * 0.35) * 0.22 + sin(wp.x * 0.012 - wp.y * 0.0093 - uTime * 0.2) * 0.1;
  float ph = tilt + wave + hu * 0.8 * smoothstep(0.08, 0.3, sat) + L * 1.7;
  vec3 f = film(ph);
  float mask = smoothstep(uMaskL.x, uMaskL.y, L) * (1.0 - smoothstep(0.4, 0.78, sat));
  mask *= warmKeep(hu, sat, 0.16, 0.32);
  mask *= 1.0 - 0.6 * smoothstep(0.86, 1.0, L);
  // a deeper interference colour than film() (clipped at both ends): the foil is the only colour on a dark card
  vec3 fv = clamp(0.5 + 0.62 * cos(6.28318 * (ph + vec3(0.0, 0.33, 0.67))), 0.0, 1.0);
  vec3 tinted = mix(fv * (0.1 + L * 1.35), vec3(L) * (0.8 + 0.35 * fv), 0.5 * smoothstep(0.72, 0.97, L));
  c = mix(c, tinted, clamp(mask * uStrength, 0.0, 1.0));
  // glare: a soft band sweeping across the card as it tilts
  float gb = pow(0.5 + 0.5 * cos(dot(q, vec2(1.0, 0.7)) * 6.5 - uTime * 0.35 - (uCam.x + uCam.y) * 0.0016), 16.0);
  c += (f * 0.6 + 0.4) * gb * mask * uGlare;
  // diffraction sparkle, nailed to the world
  vec2 cell = floor(wp / 36.0);
  float h = hash12(cell + 17.0);
  if (h < 0.3) {
    vec2 d = wp - (cell + 0.22 + 0.56 * hash22(cell)) * 36.0;
    float tw = pow(max(0.0, sin(uTime * (1.1 + h * 5.0) + h * 61.0)), 10.0);
    float star = exp(-abs(d.y) * 1.8) * max(0.0, 1.0 - abs(d.x) / 8.0) + exp(-abs(d.x) * 1.8) * max(0.0, 1.0 - abs(d.y) / 8.0);
    star += exp(-dot(d, d) * 0.6) * 1.5;
    c += (film(ph + h * 3.0) * 0.7 + 0.45) * star * tw * (0.06 + mask * 1.6) * uSparkle;
  }
  return c;
}

vec3 pearlLook(vec3 c, float L, float sat, float hu, vec2 q, vec2 wp) {
  float tilt = dot(q, vec2(0.85, 0.55)) * 1.1 + (uCam.x * 0.6 + uCam.y * 0.45) * 0.0011 + uTime * 0.04;
  float wave = sin(wp.x * 0.0045 + wp.y * 0.0031 + uTime * 0.3) * 0.22 + sin(wp.x * 0.012 - wp.y * 0.0093 - uTime * 0.2) * 0.1;
  float ph = tilt + wave + hu * 0.9 * smoothstep(0.03, 0.12, sat) + L * 2.6;
  vec3 f = film(ph);
  float mask = smoothstep(0.42, 0.7, L) * (1.0 - smoothstep(0.24, 0.46, sat));
  mask *= warmKeep(hu, sat, 0.14, 0.3);
  float m = clamp(mask * uStrength, 0.0, 1.0);
  // pearl: the brightness kept, a pastel cast laid over it, a hint of the painted tint left in
  vec3 pearl = L * (0.83 + 0.31 * f);
  c = mix(c, mix(pearl, c * (0.78 + 0.4 * f), 0.25), m);
  // lustre: the band sweeping across the card deepens the play of colour along it
  float gb = pow(0.5 + 0.5 * cos(dot(q, vec2(1.0, 0.7)) * 5.5 - uTime * 0.3 - (uCam.x + uCam.y) * 0.0016), 8.0);
  c = mix(c, L * (0.5 + 0.95 * film(ph + 0.45)), gb * m * 0.5);
  // harlequin flushes: broad soft patches of colour across the nacre, lit by the tilt
  vec2 cell2 = floor(wp / 110.0);
  float h2 = hash12(cell2 + 71.0);
  vec2 d2 = wp - (cell2 + 0.25 + 0.5 * hash22(cell2 + 13.0)) * 110.0;
  float blob = exp(-dot(d2, d2) / (1400.0 + 2200.0 * h2));
  float lit2 = pow(max(0.0, cos(tilt * 5.0 + h2 * 31.0 + wave * 2.0)), 2.0);
  c = mix(c, c * (0.6 + 0.6 * fireCol(h2 * 5.0 + tilt * 0.4)), blob * lit2 * m * 0.4 * uFire);
  // opal fire: small angular flecks of pure colour where the flushes gather, each lit at its own tilt
  vec2 cell = floor(wp / 16.0);
  float h = hash12(cell + 3.0);
  float knot = exp(-dot(d2, d2) / (260.0 + 700.0 * h2));
  if (h < 0.45 * knot) {
    vec2 d = wp - (cell + 0.2 + 0.6 * hash22(cell + 5.0)) * 16.0;
    float a = h * 41.0, cs = cos(a), sn = sin(a);
    vec2 r2 = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
    float rr = 1.3 + 2.8 * hash12(cell + 9.0);
    float sh = 1.0 - smoothstep(rr * 0.6, rr, mix(length(r2 * vec2(0.8, 1.4)), abs(r2.x) * 0.7 + abs(r2.y) * 1.5, 0.5));
    float lit = pow(max(0.0, cos(tilt * 9.0 + h * 57.0 + wave * 5.0 + uTime * 0.25)), 4.0);
    c = mix(c, fireCol(h2 * 3.0 + h * 1.5 + tilt * 0.7) * (0.75 + 0.3 * L), sh * lit * m * uFire);
  }
  // twinkle: stars of fire, nailed to the world
  vec2 cell3 = floor(wp / 40.0);
  float h3 = hash12(cell3 + 17.0);
  if (h3 < 0.3) {
    vec2 d = wp - (cell3 + 0.22 + 0.56 * hash22(cell3)) * 40.0;
    float tw = pow(max(0.0, sin(uTime * (1.1 + h3 * 5.0) + h3 * 61.0)), 10.0);
    float star = exp(-abs(d.y) * 1.6) * max(0.0, 1.0 - abs(d.x) / 7.0) + exp(-abs(d.x) * 1.6) * max(0.0, 1.0 - abs(d.y) / 7.0);
    star = clamp(star + exp(-dot(d, d) * 0.5) * 1.5, 0.0, 1.0);
    c = mix(c, mix(fireCol(h3 * 9.0 + tilt), vec3(1.0), exp(-dot(d, d) * 0.8)), star * tw * (0.25 + 0.75 * mask) * uSparkle);
  }
  return c;
}

void main(void) {
  vec2 frameUV = vTextureCoord * uInputSize.xy / uOutputFrame.zw;
  vec2 sp = frameUV * uOutputFrame.zw + uOutputFrame.xy;
  vec2 wp = sp / uZoom - uCam;
  vec3 c = texture(uTexture, vTextureCoord).rgb;
  float L = luma(c);
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / (mx + 1e-4);
  float hu = hueOf(c);
  vec2 q = sp / max(vec2(1.0), uScreen) - 0.5;
  // inside a cavern the pass is pearl, on the dark base it is foil; the two cross at the wall
  float wC = 1.0 - smoothstep(0.98, 1.0, cavern(wp).x);
  vec3 o = c;
  if (wC < 0.999) o = foilLook(c, L, sat, hu, q, wp);
  if (wC > 0.001) o = mix(o, pearlLook(c, L, sat, hu, q, wp), wC);
  // the card's edge
  float v = smoothstep(0.42, 0.95, length(q * vec2(1.0, 0.9)) * 1.45);
  o *= 1.0 - uVignette * v;
  finalColor = vec4(clamp(o, 0.0, 1.0), 1.0);
}
`

// The cavern field on the CPU, line for line the GLSL cavern() above (render.js samples it at each
// creature's position so the creature can react to the cavern it stands in). Returns the distance in
// chamber radii: < 1 inside.
const fract = (x) => x - Math.floor(x)
function cvh12(px, py) {
  let a = fract(px * 0.1031), b = fract(py * 0.1031), c = fract(px * 0.1031)
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33)
  a += d; b += d; c += d
  return fract((a + b) * c)
}
function cvh22(px, py) {
  let a = fract(px * 0.1031), b = fract(py * 0.1030), c = fract(px * 0.0973)
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33)
  a += d; b += d; c += d
  return [fract((a + b) * c), fract((a + c) * b)]
}
export function cavernAt(x, y) {
  const G = 880, ci = Math.floor(x / G), cj = Math.floor(y / G)
  let best = 9
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ci + i, cy = cj + j
    const h = cvh12(cx + 211, cy + 211)
    if (h >= 0.7) continue
    const o = cvh22(cx + 37, cy + 37)
    const dx = x - (cx + 0.3 + 0.4 * o[0]) * G, dy = y - (cy + 0.3 + 0.4 * o[1]) * G
    const h2 = cvh12(cx + 5, cy + 5)
    const an = h2 * TAU, ca = Math.cos(an), sa = Math.sin(an)
    const ex = ca * dx + sa * dy, ey = (ca * dy - sa * dx) * (1 + 0.6 * h)
    const a = Math.atan2(ey, ex)
    const D = TAU / 14, u = (a + Math.PI) / D, k0 = Math.floor(u)
    const t0 = k0 * D - Math.PI, t1 = t0 + D, ph = a - t0
    const r0 = (0.8 + 0.4 * cvh12(cx * 3.1 + k0, cy * 3.1 + k0)) * (1 + 0.24 * Math.sin(2 * t0 + h * 40) + 0.12 * Math.sin(3 * t0 + h2 * 25))
    const k1 = (k0 + 1) % 14
    const r1 = (0.8 + 0.4 * cvh12(cx * 3.1 + k1, cy * 3.1 + k1)) * (1 + 0.24 * Math.sin(2 * t1 + h * 40) + 0.12 * Math.sin(3 * t1 + h2 * 25))
    const rr = r0 * r1 * Math.sin(D) / (r0 * Math.sin(ph) + r1 * Math.sin(D - ph))
    const fd = Math.hypot(ex, ey) / ((260 + 130 * h2) * rr)
    if (fd < best) best = fd
  }
  return best
}
