// THE LEAVING (src/ophan/staging.js): its looks override beats.js's. 4 s: the boss goes into the floor in the first
// second and a bit, then the hole stays open as a scar while the wave's crowd crawls out of it, closing over the last 0.6 s.
// Owner, of the sinks before these: "None of those leave, too soft and boring."
import { Sprite } from 'pixi.js'
import { stage, ease, win, hash } from '../staging.js'
import { tear, HY, HW, HH } from './hole.js'

const TAU = Math.PI * 2
const FY = HH / HW   // the floor's ellipses keep the hole's own proportion (HH / HW: looks.js imports this file first)
// what the floor is made of, per world (hole.js's palettes): what flies off it, the dust it raises, how it cracks
const MAT = {
  macro: { kind: 'clod', base: ['#5a3e26', '#6e4c2e', '#7a5a3a', '#4a321e'], dark: '#120a05', lit: '#d0ac80', dust: '#6e5840', dust2: '#a8906c', crack: '#0a0604', lip: '#b8946a' },
  holo: { kind: 'shard', base: ['#3a2e5e', '#5a4a8a', '#2a2048'], dark: '#0b0714', lit: '#e4dcff', dust: '#7a6cb0', dust2: '#e8e0ff', crack: '#05030a', lip: '#c8b8ff', glint: true },
  ascii: { kind: 'glyph', base: ['#766c5e', '#9a8e7c', '#d6be96'], dark: '#000000', lit: '#f0e2c0', dust: '#4e473e', dust2: '#d6be96', crack: '#000000', lip: '#f0c478' },
  pixel: { kind: 'block', base: ['#2c2430', '#463c4c', '#625670'], dark: '#0a0608', lit: '#8c7e9c', dust: '#1c1620', dust2: '#463c4c', crack: '#0a0608', lip: '#d8340c', ember: '#ff5a14' },
  toon: { kind: 'ink', base: ['#8a6446', '#b89468', '#5b3b2a'], dark: '#1c120d', lit: '#dcc392', dust: '#b89468', dust2: '#f3e6c8', crack: '#1c120d', lip: '#dcc392' },
  liquid: { kind: 'drop', base: ['#3a3f48', '#5d6574', '#14161b'], dark: '#050608', lit: '#f4f7fc', dust: '#6a707c', dust2: '#d0d4dc', crack: '#050608', lip: '#ff5a1e', ember: '#ff6a20' },
}
const matOf = (k) => MAT[k.A?.id] ?? MAT.macro

// the Mine's glyphs, baked once: GL chars x the three shades of its base
const GL = '#%@&$*.:;~', GS = 32
let atlas = null
function glyphs() {
  if (atlas) return atlas
  const cv = document.createElement('canvas'); cv.width = GS * GL.length; cv.height = GS * 3
  const g = cv.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 26px "DejaVu Sans Mono", Menlo, Consolas, monospace'
  MAT.ascii.base.forEach((col, j) => { g.fillStyle = col; for (let i = 0; i < GL.length; i++) g.fillText(GL[i], i * GS + GS / 2, j * GS + GS / 2) })
  return (atlas = cv)
}
const glyph = (c, i, shade, x, y, s) => c.drawImage(glyphs(), (i % GL.length) * GS, shade * GS, GS, GS, x - s / 2, y - s / 2, s, s)

// one piece of debris, plan view, lit from the up-left: r its radius, rot its turn, sd its seed
function chunk(c, M, x, y, r, rot, sd, al) {
  if (al <= 0.01 || r < 0.4) return
  const base = M.base[Math.floor(hash(sd, 1) * M.base.length)]
  c.globalAlpha = al
  if (M.kind === 'glyph') { glyph(c, Math.floor(hash(sd, 2) * 6), Math.floor(hash(sd, 3) * 3), x, y, r * 3.2); return }
  if (M.kind === 'block') {
    // art pixels on the Magma's 2 px grid: an ink square, its lit top-left, an ember in some
    const s = Math.max(2, Math.round(r * 0.8 / 2) * 2), X = Math.round(x / 2) * 2 - s / 2, Y = Math.round(y / 2) * 2 - s / 2
    c.fillStyle = M.dark; c.fillRect(X, Y, s + 2, s + 2)
    c.fillStyle = hash(sd, 4) > 0.75 ? M.ember : base; c.fillRect(X, Y, s, s)
    c.fillStyle = M.lit; c.fillRect(X, Y, s, 2); c.fillRect(X, Y, 2, s)
    return
  }
  if (M.kind === 'shard') {
    // a crystal splinter: two faces either side of its spine, a prismatic glint up it
    const L = r * 2, W = r * 0.6, cs = Math.cos(rot), sn = Math.sin(rot), tx = x + cs * L, ty = y + sn * L, bx = x - cs * L * 0.4, by = y - sn * L * 0.4
    c.fillStyle = M.lit; c.beginPath(); c.moveTo(bx, by); c.lineTo(x - sn * W, y + cs * W); c.lineTo(tx, ty); c.closePath(); c.fill()
    c.fillStyle = base; c.beginPath(); c.moveTo(bx, by); c.lineTo(x + sn * W, y - cs * W); c.lineTo(tx, ty); c.closePath(); c.fill()
    c.strokeStyle = 'hsl(' + Math.floor(hash(sd, 5) * 360) + ',100%,72%)'; c.lineWidth = Math.max(1, r * 0.2)
    c.beginPath(); c.moveTo(bx, by); c.lineTo(tx, ty); c.stroke()
    return
  }
  if (M.kind === 'drop') {
    r *= 0.7
    // a bead of the melt: dark chrome, a hot core in some, a hard white specular
    c.fillStyle = M.dark; c.beginPath(); c.ellipse(x, y, r * 1.1, r, rot, 0, TAU); c.fill()
    c.fillStyle = hash(sd, 4) > 0.82 ? M.ember : base; c.beginPath(); c.ellipse(x + r * 0.1, y + r * 0.1, r * 0.75, r * 0.65, rot, 0, TAU); c.fill()
    c.fillStyle = M.lit; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.4, r * 0.28, 0, TAU); c.fill()
    return
  }
  const lump = (dx = 0, dy = 0, s = 1) => { c.beginPath(); for (let i = 0; i <= 8; i++) { const t = i / 8 * TAU + rot, w = r * s * (0.8 + 0.35 * hash(sd, i + 10)), X = x + dx + Math.cos(t) * w, Y = y + dy + Math.sin(t) * w; i ? c.lineTo(X, Y) : c.moveTo(X, Y) } c.closePath() }
  if (M.kind === 'ink') {
    // the Mantle's dirt: an ink cut offset down-right, a cel fill, a paper gloss tick
    lump(r * 0.22, r * 0.28); c.fillStyle = M.dark; c.fill()
    lump(); c.fillStyle = base; c.fill()
    c.fillStyle = M.lit; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); c.fill()
    return
  }
  lump(); c.fillStyle = M.dark; c.fill()
  lump(-r * 0.12, -r * 0.14, 0.85); c.fillStyle = base; c.fill()
  c.globalAlpha = al * 0.7; c.fillStyle = M.lit; lump(-r * 0.3, -r * 0.34, 0.32); c.fill()
}
// a cloud of the world's dust, radius r, its alpha al
function puff(c, M, x, y, r, sd, al) {
  if (al <= 0.01 || r < 1) return
  c.globalAlpha = al
  if (M.kind === 'glyph') { for (let i = 0; i < 4; i++) { const a = hash(sd, i + 20) * TAU, d = r * 0.6 * hash(sd, i + 30); glyph(c, 6 + (i + Math.floor(sd)) % 4, 2, x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.7) } return }
  if (M.kind === 'block') {
    // soot in art pixels: a few snapped squares of the dark ramp
    for (let i = 0; i < 9; i++) { const a = hash(sd, i + 20) * TAU, d = r * 0.7 * hash(sd, i + 30), s = Math.max(2, Math.round(r * (0.18 + 0.2 * hash(sd, i + 40)) / 2) * 2)
      c.fillStyle = i === 4 ? M.ember : i % 2 ? M.dust2 : M.dust; c.fillRect(Math.round((x + Math.cos(a) * d) / 2) * 2 - s / 2, Math.round((y + Math.sin(a) * d) / 2) * 2 - s / 2, s, s) }
    return
  }
  if (M.kind === 'ink') {
    // a cartoon dust cloud: ink lobes, a cel fill, a paper highlight up-left. A cel does not fade: it pops and shrinks away
    r *= 0.7 * Math.min(1, Math.sqrt(al * 1.6)); c.globalAlpha = Math.min(1, al * 4)
    if (r < 1) return
    const lobes = (o, s) => { c.beginPath(); for (let i = 0; i < 3; i++) { const a = hash(sd, i + 20) * TAU; c.moveTo(x + o + Math.cos(a) * r * 0.35 + r * s * 0.55, y + o + Math.sin(a) * r * 0.35); c.arc(x + o + Math.cos(a) * r * 0.35, y + o + Math.sin(a) * r * 0.35, r * s * 0.55, 0, TAU) } }
    lobes(0, 1.12); c.fillStyle = M.dark; c.fill()
    lobes(0, 1); c.fillStyle = M.dust; c.fill()
    lobes(-r * 0.12, 0.55); c.fillStyle = M.dust2; c.fill()
    return
  }
  const g = c.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, M.dust2); g.addColorStop(0.45, M.dust); g.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill()
}
// cracks run out from the lip, lit on their far edge (the Magma's glow, the Core's are ripples instead)
function cracks(k, M, cx, cy, grow, al, n, seed) {
  if (al <= 0.01 || grow <= 0) return
  const f = k.floor
  if (M.kind === 'drop') {
    // the melt does not crack: rings run out over it and set as ridges
    for (let i = 0; i < 3; i++) {
      const r = k.R * (1.4 + 0.55 * i) * (0.6 + 0.4 * grow)
      f.globalAlpha = al * 0.7; f.strokeStyle = M.dark; f.lineWidth = 3 * k.z; f.beginPath(); f.ellipse(cx, cy + k.z, r, r * FY, 0, 0, TAU); f.stroke()
      f.globalAlpha = al * 0.55; f.strokeStyle = M.lit; f.lineWidth = 1.2 * k.z; f.beginPath(); f.ellipse(cx, cy - k.z, r, r * FY, 0, Math.PI, TAU); f.stroke()
    }
    f.globalAlpha = 1
    return
  }
  f.lineCap = 'round'; f.lineJoin = 'round'
  for (let i = 0; i < n; i++) {
    const a = (i + 0.6 * hash(i, seed)) / n * TAU, L = k.R * (0.9 + 1.4 * hash(i, seed + 1)) * grow, lw = (2.6 + 2 * hash(i, seed + 2)) * k.z
    const x0 = cx + Math.cos(a) * k.R * HW * 0.42, y0 = cy + Math.sin(a) * k.R * HH * 0.42
    const path = (dx, dy) => { f.beginPath(); f.moveTo(x0 + dx, y0 + dy); for (let m = 1; m <= 5; m++) { const q = m / 5, w = (hash(i * 7 + m, seed + 3) - 0.5) * 0.6; f.lineTo(x0 + dx + Math.cos(a + w) * L * q, y0 + dy + Math.sin(a + w) * L * q * FY) } }
    f.globalAlpha = al * (M.ember ? 0.9 : 0.6); f.strokeStyle = M.ember ?? M.lip; f.lineWidth = lw * (M.ember ? 1.5 : 0.8); path(0, lw * 0.6); f.stroke()
    f.globalAlpha = al; f.strokeStyle = M.crack; f.lineWidth = lw; path(0, 0); f.stroke()
    // a branch off the middle of the longer ones
    if (hash(i, seed + 4) > 0.45) {
      const b = a + (hash(i, seed + 5) > 0.5 ? 0.7 : -0.7), q = 0.45, bx = x0 + Math.cos(a) * L * q, by = y0 + Math.sin(a) * L * q * FY
      f.lineWidth = lw * 0.6; f.beginPath(); f.moveTo(bx, by); f.lineTo(bx + Math.cos(b) * L * 0.4, by + Math.sin(b) * L * 0.4 * FY); f.stroke()
    }
  }
  f.globalAlpha = 1
}
// a thrown piece: launched at T0 from (x0, y0) at angle a out to distance D (floor), arcing H high over ft seconds, then
// skidding a little and lying there. Returns its floor point, its height and whether it is down
function fly(T, T0, x0, y0, a, D, H, ft) {
  const t = T - T0
  if (t < 0) return null
  const q = Math.min(1, t / ft), d = D * (1 - (1 - q) * (1 - q)) + (q >= 1 ? D * 0.08 * (1 - Math.exp(-(t - ft) * 6)) : 0)
  return { x: x0 + Math.cos(a) * d, y: y0 + Math.sin(a) * d * FY, h: H * 4 * q * (1 - q), down: q >= 1, tl: t - ft }
}
// a piece's shadow on the floor and the piece itself, nearer the camera (bigger, higher on screen) the higher it is
function piece(k, c, M, p, r, rot, sd, al) {
  const lift = p.h / k.R, s = 1 + 0.7 * lift
  if (M.kind === 'drop' && p.down) {
    // a bead of the melt does not lie on it: it sinks back in and rings once
    const q = win(p.tl, 0, 0.35); if (q >= 1) return
    c.globalAlpha = al * 0.6 * (1 - q); c.strokeStyle = M.lit; c.lineWidth = k.z; c.beginPath(); c.ellipse(p.x, p.y, r * (1 + 2.5 * q), r * (1 + 2.5 * q) * FY, 0, 0, TAU); c.stroke()
    r *= 1 - q
  }
  if (!p.down) { c.globalAlpha = al * 0.35 / (1 + lift); c.fillStyle = '#000'; c.beginPath(); c.ellipse(p.x + p.h * 0.3, p.y + r * 0.4, r * 1.1, r * 0.7, 0, 0, TAU); c.fill() }
  chunk(c, M, p.x, p.y - p.h, r * s, rot, sd, al)
}
// the snap of the boss, turned rot and scaled sx, sy about (x, y), into px2d c (sprite i of c's own), clipped by clip
const spr = new Map()
function snapAt(k, c, i, x, y, rot, sx, sy, al, clip) {
  if (al <= 0.01) return
  let L = spr.get(c); if (!L) spr.set(c, L = [])
  const tx = k.snap(k.from ?? k.S, Math.round(k.ph0 ?? k.ph)), W = Math.ceil(k.R * 3)
  const s = L[i] ?? (L[i] = new Sprite())
  s.texture = tx
  c.save()
  if (clip) { c.beginPath(); clip(c); c.clip() }
  c.globalAlpha = al
  c.translate(x, y); c.rotate(rot); c.scale(sx, sy); c.translate(-W / 2, -W / 2); c.scale(W / tx.width, W / tx.width)
  c.place(s)
  c.restore()
}
// the dark of the pit over what is down in it, inside the mouth
function shade(k, c, cx, cy, open, a) {
  if (a <= 0.01) return
  c.save(); c.beginPath(); c.ellipse(cx, cy, k.R * HW * 0.46 * open, k.R * HH * 0.46 * open, 0, 0, TAU); c.clip()
  c.globalAlpha = a; c.fillStyle = '#050407'; c.fillRect(cx - k.R * 2, cy - k.R * 2, k.R * 4, k.R * 4)
  c.restore(); c.globalAlpha = 1
}
const mouthClip = (k, cx, cy, open) => (c) => c.ellipse(cx, cy, k.R * HW * 0.46 * open, k.R * HH * 0.46 * open, 0, 0, TAU)
// the hole as a scar: open o0 at T0, eased to `hold` by T1, closed over the last 0.6 s
const scar = (k, T, T0, T1, peak, hold) => {
  if (T < T0) return 0
  const a = win(T, T0, T0 + 0.07), b = ease(win(T, T0 + 0.07, T1)), close = 1 - ease(win(k.u, 1 - 0.6 / k.dur, 1))
  return (peak * ease(a) + (hold - peak) * b) * close
}
// the hold's life: grit trickling back over the lip, the dust it breathes out
function breathe(k, M, c, cx, cy, open, T, from) {
  const live = win(T, from, from + 0.4) * (1 - win(k.u, 0.86, 0.97))
  if (live <= 0) return
  for (let i = 0; i < 9; i++) {
    const q = (k.age * 0.45 + hash(i, 61)) % 1, a = hash(i, 62) * TAU, d = k.R * (0.3 + 1.3 * q)
    puff(c, M, cx + Math.cos(a) * d, cy + Math.sin(a) * d * FY - q * k.R * 0.6, k.R * (0.25 + 0.45 * q), i + 60, live * 0.3 * Math.sin(Math.PI * q))
  }
  for (let i = 0; i < 10; i++) {
    // grit sliding back over the lip into the dark
    const q = (k.age * 0.7 + hash(i, 63)) % 1, a = hash(i, 64) * TAU, r0 = 0.62 + 0.25 * hash(i, 65), r = r0 * (1 - q * 0.75)
    chunk(c, M, cx + Math.cos(a) * k.R * HW * r * open, cy + Math.sin(a) * k.R * HH * r * open, (1.2 + 1.2 * hash(i, 66)) * k.z, a, i + 70, live * (1 - q) * 0.9)
  }
  c.globalAlpha = 1
}

// ---- A · THE PLUNGE: rears up toward the camera, hangs, dives into the floor; the floor takes the hit
const TI = 0.78   // the impact, seconds in
stage('leave', 'A', { label: 'A · the plunge: rears up, hangs, dives through the floor; shockwave, debris, cracks', dur: 4, draw(k) {
  const M = matOf(k), T = k.u * k.dur, R = k.R
  // the jolt: a hard shake on everything it marks, dying fast
  const jt = T - TI, J = jt > 0 ? Math.exp(-jt * 11) * R * 0.09 : 0, ox = J * Math.sin(jt * 83), oy = J * Math.cos(jt * 61)
  const cx = k.x + ox, cy = k.y + R * HY + oy
  const open = scar(k, T, TI - 0.02, 1.4, 1.12, 0.78)
  tear(k.floor, cx, cy, R * HW, R * HH, open, k.A.id)
  cracks(k, M, cx, cy, ease(win(T, TI, TI + 0.14)), 1 - win(k.u, 0.85, 0.97), 11, 7)
  const c = k.px(1)
  // ---- the boss: up, held, down
  const up = ease(win(T, 0, 0.42)), dive = win(T, 0.6, TI)
  if (T < TI) {
    const quiver = T > 0.42 ? Math.sin(T * 70) * 0.012 * win(T, 0.42, 0.5) : 0, d = dive * dive * dive
    k.boss.scale = 1 + 0.32 * up + quiver - (0.32 + 0.25) * d
    k.boss.dy = -R * 0.3 * up * (1 - d) + R * HY * d + (T > 0.42 && T < 0.6 ? Math.sin(T * 41) * R * 0.015 : 0)
    k.boss.dx = T > 0.42 && T < 0.6 ? Math.sin(T * 57) * R * 0.012 : 0
    // its shadow on the floor, pulled away down-right and paled as it lifts, snapping back under it as it falls
    const h = 0.3 * up * (1 - d), f = k.floor
    f.globalAlpha = 0.4 - 0.22 * h / 0.3; f.fillStyle = '#000'
    f.beginPath(); f.ellipse(k.x + R * h * 0.8, k.y + R * (0.35 + h * 0.6), R * (0.9 + 0.5 * h), R * (0.9 + 0.5 * h) * FY, 0, 0, TAU); f.fill(); f.globalAlpha = 1
    // the wingbeat that lifts it blows the dust out flat
    const gust = win(T, 0.05, 0.6)
    if (gust > 0 && gust < 1) for (let i = 0; i < 14; i++) {
      const a = (i + hash(i, 41)) / 14 * TAU, d0 = R * (1 + 1.6 * ease(gust))
      puff(c, M, k.x + Math.cos(a) * d0, k.y + R * 0.35 + Math.sin(a) * d0 * FY, R * (0.3 + 0.25 * gust), i + 40, 0.35 * Math.sin(Math.PI * gust))
    }
  } else {
    k.boss.hide = true
    // through the floor: it keeps going down the hole, smaller and darker, the near lip hiding it
    const s = win(T, TI, TI + 0.3), sc = 0.75 * (1 - 0.7 * ease(s))
    if (s < 1) {
      const p = k.px(0), clip = mouthClip(k, cx, cy, Math.max(0.05, open))
      snapAt(k, p, 0, cx, cy - R * 0.1 * (1 - s), 0, sc, sc, 1, clip)
      shade(k, p, cx, cy, Math.max(0.05, open), 0.25 + 0.7 * s)
    }
  }
  // ---- the hit: a flash, two shock rings over the floor, the dust blasted out flat
  if (jt > 0) {
    const fl = 1 - win(jt, 0, 0.08)
    if (fl > 0) {
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * 1.8)
      g.addColorStop(0, M.ember ?? M.lit); g.addColorStop(0.2, M.ember ?? M.dust2); g.addColorStop(1, 'rgba(0,0,0,0)')
      c.globalAlpha = 0.8 * fl; c.fillStyle = g; c.save(); c.translate(cx, cy); c.scale(1, FY); c.translate(-cx, -cy); c.beginPath(); c.arc(cx, cy, R * 1.8, 0, TAU); c.fill(); c.restore()
    }
    for (let i = 0; i < 2; i++) {
      const q = win(jt, i * 0.06, 0.5 + i * 0.12); if (q <= 0 || q >= 1) continue
      const r = R * (1.2 + 3.6 * ease(Math.sqrt(q)))
      c.globalAlpha = 0.75 * (1 - q); c.strokeStyle = i ? M.dust : M.dust2; c.lineWidth = (10 - 6 * q) * k.z * (i ? 0.6 : 1)
      c.beginPath(); c.ellipse(cx, cy, r, r * FY, 0, 0, TAU); c.stroke()
    }
    const b = win(jt, 0, 1.8)
    if (b < 1) for (let i = 0; i < 18; i++) {
      const a = (i + hash(i, 43)) / 18 * TAU, d0 = R * (0.8 + (2.4 + 0.8 * hash(i, 44)) * (1 - Math.pow(1 - b, 3)))
      puff(c, M, cx + Math.cos(a) * d0, cy + Math.sin(a) * d0 * FY - b * R * 0.2, R * (0.45 + 0.7 * b) * (0.7 + 0.5 * hash(i, 45)), i + 50, 0.7 * (1 - b) * win(jt, 0, 0.04))
    }
    // the floor it threw up: ballistic out of the hole, landing round it and lying there till it closes
    const lie = 1 - win(k.u, 0.86, 0.97)
    for (let i = 0; i < 34; i++) {
      const a = hash(i, 31) * TAU, D = R * (1.3 + 2.6 * hash(i, 32)), p = fly(T, TI + 0.03 * hash(i, 33), cx, cy, a, D, R * (0.5 + 1.1 * hash(i, 34)), 0.45 + 0.4 * hash(i, 35))
      if (p) piece(k, c, M, p, (3.5 + 5.5 * hash(i, 36) ** 2) * k.z, a + T * (p.down ? 0 : 6) * (hash(i, 37) - 0.5), i, lie)
    }
    breathe(k, M, c, cx, cy, open, T, 1.6)
  }
  c.globalAlpha = 1
} })

// ---- B · THE DRILL: wings folded tight, it spins up and corkscrews into the floor, grinding the hole open
const TD = 0.75, TG = 1.35   // the drill bites, it is under
const spin = (T) => 2.2 * T * T * T + 1.5 * T * T   // radians turned by T: ever faster
stage('leave', 'B', { label: 'B · the drill: folds its wings, spins up and corkscrews into the floor, debris thrown in a spiral', dur: 4, draw(k) {
  const M = matOf(k), T = k.u * k.dur, R = k.R, cx = k.x, cy = k.y + R * HY
  const th = spin(Math.min(T, TG)) * 6, w = (6.6 * T * T + 3 * T) * 6   // its turn and turn rate
  // the hole is ground open as it bites, wobbling with the turn
  const grind = ease(win(T, TD - 0.15, TD + 0.35)), open = T < TG ? grind * (1 + 0.04 * Math.sin(th * 2)) : scar(k, T, TG - 0.07, 1.8, 1.04, 0.74)
  tear(k.floor, cx, cy, R * HW, R * HH, open, k.A.id)
  // the spiral it scores into the floor round the hole, cut as it grinds, left as the scar
  const f = k.floor, cut = win(T, TD, TG + 0.1), keep = 1 - win(k.u, 0.85, 0.97)
  if (cut > 0 && keep > 0) {
    f.lineCap = 'round'
    for (let j = 0; j < 4; j++) {
      const a0 = j / 4 * TAU + 0.3, N = 18
      for (const [col, lw, dy, al] of [[M.ember ?? M.lip, 1.1, 1.6, 0.6], [M.crack, 1, 0, 0.9]]) {
        f.globalAlpha = al * keep; f.strokeStyle = col; f.lineWidth = (3.2 * lw) * k.z; f.beginPath()
        for (let m = 0; m <= N * cut; m++) {
          const q = m / N, r = R * (1.15 + 1.5 * q), a = a0 - q * 2.2
          const X = cx + Math.cos(a) * r, Y = cy + Math.sin(a) * r * FY + dy * k.z
          m ? f.lineTo(X, Y) : f.moveTo(X, Y)
        }
        f.stroke()
      }
    }
    f.globalAlpha = 1
  }
  // ---- the boss: folds (narrowed across its turn), spins up, screws down into the hole
  k.boss.hide = true
  const fold = ease(win(T, 0, 0.35)), down = win(T, TD, TG), sc = 1 - 0.85 * down * down
  if (down < 1) {
    const p = k.px(0), lift = Math.sin(Math.PI * win(T, 0, TD)) * R * 0.12
    const x = cx, y = k.y - lift + (cy - k.y) * down, clip = down > 0.35 ? mouthClip(k, cx, cy, Math.max(0.05, open)) : null
    const sx = sc * (1 - 0.42 * fold), sy = sc * (1 + 0.06 * fold)
    // the blur of its turn: ghosts behind the boss at the angles it just left, more of them the faster it goes
    const n = Math.min(4, Math.floor(w / 10))
    for (let i = n; i >= 1; i--) snapAt(k, p, i, x, y, th + i * 0.16 * Math.min(1, w / 40), sx, sy, 0.32 / i, clip)
    snapAt(k, p, 0, x, y, th, sx, sy, 1, clip)
    if (down > 0.35) shade(k, p, cx, cy, Math.max(0.05, open), 0.85 * ease(win(down, 0.35, 1)))
  }
  const c = k.px(1)
  // a whirl of dust round it as it spins up, wound tighter and dragged into the hole
  const wh = win(T, 0.3, TG + 0.9)
  if (wh > 0 && wh < 1) for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU - th * 0.35 - hash(i, 51), d = R * (1 + 0.6 * hash(i, 52)) * (1.2 - 0.5 * ease(wh))
    puff(c, M, cx + Math.cos(a) * d, cy + Math.sin(a) * d * FY, R * (0.3 + 0.35 * hash(i, 53)), i + 50, 0.5 * Math.sin(Math.PI * wh))
  }
  // what it grinds out, flung off tangentially in a spiral, landing round the hole
  const lie = 1 - win(k.u, 0.86, 0.97)
  for (let i = 0; i < 40; i++) {
    const T0 = TD - 0.15 + (TG - TD + 0.1) * hash(i, 31), a0 = -spin(T0) * 6 + hash(i, 32), D = R * (1.3 + 2.4 * hash(i, 33))
    const p = fly(T, T0, cx + Math.cos(a0) * R * 0.9, cy + Math.sin(a0) * R * 0.9 * FY, 0, 0, R * (0.3 + 0.6 * hash(i, 34)), 0.5 + 0.3 * hash(i, 35))
    if (!p) continue
    // the spiral: its bearing sweeps on with the turn as it flies out
    const q = Math.min(1, (T - T0) / (0.5 + 0.3 * hash(i, 35))), d = R * 0.9 + D * (1 - (1 - q) * (1 - q)), a = a0 - 1.6 * (1 - (1 - q) * (1 - q))
    p.x = cx + Math.cos(a) * d; p.y = cy + Math.sin(a) * d * FY
    piece(k, c, M, p, (2 + 3.5 * hash(i, 36) ** 2) * k.z, a + (p.down ? 0 : T * 9), i, lie)
  }
  // the turn trails off down the hole: motes still circling in the mouth, slowing
  const tr = win(T, TG - 0.1, TG + 1.6)
  if (tr > 0 && tr < 1) {
    const op = Math.max(0.05, open)
    c.save(); c.beginPath(); mouthClip(k, cx, cy, op)(c); c.clip()
    for (let i = 0; i < 12; i++) {
      const a = hash(i, 71) * TAU - (spin(TG) * 6 + 18 * (1 - Math.exp(-(T - TG) * 1.6))), r = (0.15 + 0.3 * hash(i, 72)) * (1 - 0.6 * tr)
      chunk(c, M, cx + Math.cos(a) * R * HW * r * op, cy + Math.sin(a) * R * HH * r * op, (1.5 + 1.5 * hash(i, 73)) * k.z, a, i + 80, 0.9 * (1 - tr))
    }
    c.restore()
  }
  breathe(k, M, c, cx, cy, open, T, TG + 0.3)
  c.globalAlpha = 1
} })
