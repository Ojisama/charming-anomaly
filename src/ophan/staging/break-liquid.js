// THE BREAK, the Core (liquid): the chrome skin does not leave the boss. A re-configures it into the next skin, B sheds it
// outward while the next skin stands whole under it (never a sag, a drip or a pool: those read as its death).
// Owner ruling 2026-10-25: 0.12 s hit-stop (the sim's), then 0.8 s; the looks below are the playground's candidates.
// Molten iron-nickel, never rock: chrome bodies lit from the top left, white-hot where they work.
import { Rectangle, Sprite, Texture } from 'pixi.js'
import { stage, win, hash } from '../staging.js'
import { cellsOf } from './break-ascii.js'
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
// a skin read into cells (break-ascii.js cellsOf) through a real canvas: the Core's painter also places its sheen as a
// WebGL mesh, which a canvas has no place for, so that call is dropped from the read (its body is all 2D paths)
const meshless = (c) => new Proxy(c, {
  get: (t, p) => p === 'place' ? () => {} : typeof t[p] === 'function' ? t[p].bind(t) : t[p],
  set: (t, p, v) => { t[p] = v; return true },
})
const cellsRead = (k, s, ph, P) => cellsOf({ ...k, from: s, ph0: ph, drawBoss: (q, g, ...a) => k.drawBoss(q, meshless(g), ...a) }, P)

// ---- A: the morph. The skin re-configures itself into the next one, like a Transformer's body: both skins cut into the
// same grid of plates, and each plate flips over on its own axis (old face, edge-on with a chrome glint along it, new
// face) in a staggered, clacking wave from the core out. Some slide, turn a quarter or telescope out and back as they go,
// the big ones lift with a shadow; a hot line traces the seams as they work, sparks tick off them. Plates only the old
// shape has fold into the body, plates only the new one has unfold out of it, so the outline grows from one to the other.
// The real boss is hidden until the plates have settled into it.
const MP = 0.3   // the plate pitch, in R: a 10 x 10 grid over the snap
// a plate of snap tx: its cell (i, j) of the grid cellsOf reads (pitch P stage px, the snap R*3 wide), cached per snap
const frames = new Map()
function plate(tx, W, P, i, j) {
  let m = frames.get(tx); if (!m) frames.set(tx, m = new Map())
  const key = i + ',' + j
  let t = m.get(key)
  if (!t) {
    const f = tx.frame.width / W, n = Math.floor(W / P), o = (W - n * P) / 2
    t = new Texture({ source: tx.source, frame: new Rectangle(tx.frame.x + (o + i * P) * f, tx.frame.y + (o + j * P) * f, P * f, P * f) })
    m.set(key, t)
  }
  return t
}
// the plates: the whole grid over the snap (a cell dropped would cut a stepped hole in a glow, and show it pop back when
// the real boss returns), each marked by which skins have their body in it; read once per pair of skins, phases and size
const morphs = new Map()
function platesOf(k) {
  const P = k.R * MP, key = k.from.id + ':' + k.S.id + ':' + Math.round(k.ph0) + ':' + Math.round(k.ph) + ':' + Math.round(k.R)
  let L = morphs.get(key)
  if (L) return L
  const A = cellsRead(k, k.from, Math.round(k.ph0), P), B = cellsRead(k, k.S, Math.round(k.ph), P), at = new Map()
  const W = Math.ceil(k.R * 3), n = Math.floor(W / P), o = (W - n * P) / 2
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) at.set(i + ',' + j, { i, j, ox: o + (i + 0.5) * P - W / 2, oy: o + (j + 0.5) * P - W / 2, old: false, neu: false, a: 0 })
  for (const q of A) { const p = at.get(q.i + ',' + q.j); p.old = true; p.a = Math.max(p.a, q.a) }
  for (const q of B) { const p = at.get(q.i + ',' + q.j); p.neu = true; p.a = Math.max(p.a, q.a) }
  // a cell neither skin has a body in (a glow, a shadow, air) is in both: it flips with the rest, it neither folds nor grows
  for (const p of at.values()) if (!p.old && !p.neu) p.old = p.neu = true
  const dm = Math.max(...[...at.values()].map((p) => Math.hypot(p.ox, p.oy)))
  L = [...at.values()].map((p, n) => {
    const h = hash(p.i * 7 + 3, p.j * 13 + 1), h2 = hash(p.j + 17, p.i + 29), d = Math.hypot(p.ox, p.oy) / dm
    // the wave: out from the core in clacks (quantised beats), each plate a little early or late on its beat
    const t0 = 0.02 + Math.round((0.5 * d + 0.08 * h) * 14) / 14 * 0.92
    return { ...p, n, d, h, h2, t0, ax: h2 < 0.5 ? 'x' : 'y', move: h > 0.82 ? 'turn' : h > 0.66 ? 'scope' : h < 0.12 ? 'lift' : null }
  })
  morphs.set(key, L)
  return L
}
const sprs = new Map()
const spr = (c, i) => { let L = sprs.get(c); if (!L) sprs.set(c, L = []); const s = L[i] ?? (L[i] = new Sprite()); s.anchor.set(0.5); return s }
const FLIP = 0.16   // a plate's flip, in u
stage('break', 'liquid:A', { world: 'liquid', label: 'A · morph: the chrome plates flip over into the next skin', draw(k) {
  const { u, x, y, R } = k, P = R * MP, W = Math.ceil(R * 3), c = k.px(1), g = k.px(2)
  // the plates have settled into the new skin by 0.86: from there it is the real boss, whole and still
  if (u >= 0.86) return
  k.boss.hide = true
  const tA = k.snap(k.from, k.ph0), tB = k.snap(k.S, k.ph), fA = tA.frame.width / W, fB = tB.frame.width / W
  const seams = []
  for (const p of platesOf(k)) {
    const f = win(u, p.t0, p.t0 + FLIP * (0.8 + 0.4 * p.h2))
    // one only in the old shape folds in and is gone; one only in the new waits, then unfolds out of the body
    if (!p.neu && f >= 0.5) continue
    if (!p.old && f <= 0.5) continue
    const old = f < 0.5, cs = Math.abs(Math.cos(Math.PI * f)), bump = Math.sin(Math.PI * f)
    // the edge-on plate is a hairline, never nothing: a plate seen side-on still has its chrome rim
    let sx = p.ax === 'x' ? Math.max(0.06, cs) : 1, sy = p.ax === 'y' ? Math.max(0.06, cs) : 1, rot = 0, dx = 0, dy = 0, sc = 1
    const rx = p.ox / (Math.hypot(p.ox, p.oy) || 1), ry = p.oy / (Math.hypot(p.ox, p.oy) || 1)
    if (p.move === 'turn') rot = (p.h2 < 0.5 ? 1 : -1) * Math.PI / 2 * bump
    if (p.move === 'scope') { dx = rx * P * 0.6 * bump; dy = ry * P * 0.6 * bump }
    if (p.move === 'lift') sc = 1 + 0.35 * bump
    // the silhouette: a plate folding in (old only) or out (new only) also slides along its radius from inside the body
    if (!p.neu || !p.old) { const sl = !p.neu ? f * 2 : 2 - f * 2; dx -= p.ox * 0.35 * sl; dy -= p.oy * 0.35 * sl }
    const px = x + p.ox + dx, py = y + p.oy + dy
    if (p.move === 'lift' && bump > 0.05) {
      const s = spr(c, 400 + p.n); s.texture = plate(old ? tA : tB, W, P, p.i, p.j); s.tint = 0x000000
      c.save(); c.globalAlpha = 0.35 * bump; c.translate(px + P * 0.25 * bump, py + P * 0.35 * bump); c.rotate(rot); c.scale(sx * sc / (old ? fA : fB) * 1.03, sy * sc / (old ? fA : fB) * 1.03); c.place(s); c.restore()
    }
    // a plate at work overlaps its neighbours a hair, so no seam opens; at rest it is exact, so soft edges do not double
    const s = spr(c, p.n), ov = f > 0 && f < 1 ? 1.03 : 1; s.texture = plate(old ? tA : tB, W, P, p.i, p.j); s.tint = 0xffffff
    c.save(); c.globalAlpha = 1; c.translate(px, py); c.rotate(rot); c.scale(sx * sc / (old ? fA : fB) * ov, sy * sc / (old ? fA : fB) * ov); c.place(s); c.restore()
    // the seam, glint and sparks belong to the metal: a plate that is mostly air (a glow's edge) does not get them
    if (f > 0 && f < 1 && p.a > 0.55) seams.push({ px, py, rot, sx: sx * sc, sy: sy * sc, f, cs, p })
  }
  // over the plates at work: the hot seam round each, the chrome glint along it edge-on, the spark ticks off its corners
  g.lineCap = 'round'
  for (const q of seams) {
    const hw = P * 0.5 * q.sx, hh = P * 0.5 * q.sy, b = Math.sin(Math.PI * q.f)
    g.save(); g.translate(q.px, q.py); g.rotate(q.rot)
    g.globalCompositeOperation = 'lighter'
    g.globalAlpha = 0.55 * b; g.strokeStyle = '#ff9a3c'; g.lineWidth = Math.max(1, R * 0.018); g.strokeRect(-hw, -hh, hw * 2, hh * 2)
    const gl = Math.max(0, 1 - q.cs / 0.4)
    if (gl > 0) {
      g.globalAlpha = gl; g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1.2, R * 0.035)
      g.beginPath(); q.p.ax === 'x' ? (g.moveTo(0, -P * 0.55), g.lineTo(0, P * 0.55)) : (g.moveTo(-P * 0.55, 0), g.lineTo(P * 0.55, 0)); g.stroke()
    }
    g.globalCompositeOperation = 'source-over'
    if (q.p.h > 0.5 && q.f > 0.35 && q.f < 0.75) {
      const e = (q.f - 0.35) / 0.4, cx = (q.p.h2 < 0.5 ? -1 : 1) * hw, cy = (q.p.h < 0.75 ? -1 : 1) * hh
      g.globalAlpha = 1 - e; g.strokeStyle = '#fff1c8'; g.lineWidth = Math.max(1, R * 0.015)
      for (let j = 0; j < 2; j++) { const a = Math.atan2(cy, cx) + (j - 0.5) * 0.9, r0 = P * 0.1 + P * 0.5 * e; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * (r0 + P * 0.35), cy + Math.sin(a) * (r0 + P * 0.35)); g.stroke() }
    }
    g.restore()
  }
  g.globalAlpha = 1
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
