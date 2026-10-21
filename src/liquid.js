// ==== Book 3, THE CORE: LIQUID METAL (the owner-approved docs/superpowers/specs/assets/core-liquid-final.html) ====
// CHAPTERS.core.render.liquid hands the chapter's floor, pillars and cast to this module, the way
// The Mantle's render.toon hands them to src/toon.js:
//   createLiquidRenderer(host) -> renderer { hide, enter, exit, sync, event, filters }
//     host = { app, world, floor, under, over }. THE DEMO ITSELF draws the floor, the pools, the pillars and
//     every creature's body: src/liquid/gl.js is the demo's WebGL2 renderer, on its own canvas UNDER Pixi's,
//     fed the run in the demo's units each frame (1 unit = U world px: the sim's sizes are the demo's x U).
//     Pixi turns transparent while The Core is on and draws everything else over it: the player's mint
//     blob and its pole ring (the owner's one ruled difference), the demo's 2D marks on the bodies
//     (golem eye, eel's biting end, the top's warning ring), bullets, needles, pickups and the HUD.
//   bakeCreature(id, elite) -> render.js's look shape with EMPTY frames (the body is the demo's), and the
//     title-card thumb baked on the CPU from the demo's own field and chrome() maths.
//   bakePlayer() -> the mint chrome blob with its face (render.js keeps the live pupils).
import { Graphics, Sprite, Texture, CanvasSource } from 'pixi.js'
import { CHAPTERS, ENEMIES, PLAYER } from './config.js'
import { mkCanvas } from './toon/palette.js'
import { createCoreGL } from './liquid/gl.js'

// world px per demo unit: the sim's Core sizes are the demo's times this (a mite 0.014 -> 9.3 px)
export const U = 667

const TAU = Math.PI * 2
const sst = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
const sst2 = (a, b, x) => sst((x - a) / (b - a))
const RES = 2   // canvas px per world px of every bake
const POL = CHAPTERS.core.signature.polarity
// the module's clock (view.animT, wrapped like the demo's so a phone GPU keeps small numbers): poseOf reads it
let clock = 0

// ---- CHROME, the demo's ENV chrome() on the CPU ------------------------------------------------
const NC = [1.25, 0.2, 0.22], SC = [0.25, 0.6, 1.0], SILV = [0.6, 0.64, 0.7], MINT = [0.49, 0.89, 0.76]
const nrm = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l] }
const L1 = nrm(0.3, 0.75, 0.6), L2 = nrm(-0.5, -0.6, 0.62), L3 = nrm(0.55, 0.5, 0.66), LP = nrm(-0.42, -0.5, 0.76)
function chrome(n, tint, ground, cloud, o) {
  const rx = 2 * n[2] * n[0], ry = 2 * n[2] * n[1], rz = 2 * n[2] * n[2] - 1
  const e = rx * L1[0] + ry * L1[1] + rz * L1[2] + (cloud - 0.5) * 0.32
  const k = sst2(0.15, 0.8, e), sk = 0.45 + 1.1 * cloud * cloud, g = sst2(-0.025, 0.025, e)
  const hl = Math.exp(-Math.abs(e) * 30) * 0.85
  const s2 = Math.pow(Math.max(rx * L2[0] + ry * L2[1] + rz * L2[2], 0), 36) * 2.4
  const s3 = Math.pow(Math.max(rx * L3[0] + ry * L3[1] + rz * L3[2], 0), 40) * 0.6
  const ADD = [0.02, 0.024, 0.03], HL = [1, 0.94, 0.86], S3 = [1, 0.6, 0.3]
  for (let c = 0; c < 3; c++) {
    const sky = (tint[c] * 1.7 + (tint[c] * 0.18 + ADD[c] - tint[c] * 1.7) * k) * sk
    o[c] = ground[c] + (sky - ground[c]) * g + HL[c] * hl + s2 + S3[c] * s3
  }
  return o
}
// a smooth value noise for the clouds the chrome reflects (the demo's uN blue channel)
function vnoise(x, y) {
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s) }
  const i = Math.floor(x), j = Math.floor(y), fx = sst(x - i), fy = sst(y - j)
  const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1)
  return a + (b - a) * fx + (c - a + (a - b + d - c) * fx) * fy
}

// ---- THE CAST: the demo's splat shapes (r, a in the cell, body edge where the value is 0) ---------
const SHAPES = [
  [(r) => r - 0.5, 1],                                                                        // 0 round
  [(r, a) => r - (0.43 + 0.13 * (0.5 + 0.5 * Math.cos(5 * a)) ** 2), 0.8],                    // 1 mite: five soft points
  [(r, a) => r - (0.36 + 0.42 * (0.5 + 0.5 * Math.cos(14 * a)) ** 12), 0.5],                  // 2 urchin: fourteen spines
  [(r, a) => r - (0.42 + 0.1 * Math.cos(4 * a)), 0.8],                                        // 3 top: quatrefoil
  [(r, a) => r - (0.38 + 0.2 * Math.max(0, Math.cos(a)) ** 5), 0.9],                          // 4 eel end, pointing +x
  [(r, a) => r - (0.46 + 0.04 * Math.cos(3 * a + 1) + 0.03 * Math.cos(5 * a + 2) + 0.025 * Math.cos(7 * a)), 1], // 5 lumpy
]
const CONE = [(x, y) => (x < 0 ? Math.hypot(x, y) - 0.15 : x > 0.88 ? Math.hypot(x - 0.88, y) : Math.abs(y) - 0.15 * Math.pow(1 - x / 0.88, 1.4)), 0.22]
const SPLAT_V = (sp, x, y) => {
  const dx = x - sp.x, dy = y - sp.y, c = Math.cos(sp.ang), s = Math.sin(sp.ang), H = sp.R * 1.25
  const cx = (dx * c + dy * s) / H, cy = (-dx * s + dy * c) / H, r = Math.hypot(cx, cy)
  if (r > 0.98) return 0
  const Z = 0.8
  let v
  if (sp.shape === 8) v = CONE[0](cx / Z, cy / Z) * Z / (CONE[1] * 1.25)
  else { const [fn, wf] = SHAPES[sp.shape]; v = fn(r / Z, Math.atan2(cy, cx)) * Z / (wf * 1.25) }
  return sst(0.5 - v) * (1 - sst((r - 0.84) / 0.14))
}
const TH = 0.25, KF = 0.65, SG = 2.6
// splats [{ x, y, R, ang, shape, ch: 0 North | 1 South | 2 silver }] (world px about the anchor) ->
// the demo's FS_COMP liquid chrome over a tight contact shadow: { canvas, white, ax, ay, res }
function bakeField(splats, res = RES, seed = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of splats) { const e = s.R * 1.25; x0 = Math.min(x0, s.x - e); y0 = Math.min(y0, s.y - e); x1 = Math.max(x1, s.x + e); y1 = Math.max(y1, s.y + e) }
  x0 -= 2; y0 -= 2; x1 += 5; y1 += 5
  const W = Math.ceil((x1 - x0) * res), H = Math.ceil((y1 - y0) * res), N = W * H
  const A = [new Float32Array(N), new Float32Array(N), new Float32Array(N)], B = [new Float32Array(N), new Float32Array(N)]
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + 0.5) / res, y = y0 + (j + 0.5) / res, k = j * W + i
    for (const s of splats) { const v = 0.5 * SPLAT_V(s, x, y); if (!v) continue; A[s.ch][k] += v; if (s.ch < 2 && v > B[s.ch][k]) B[s.ch][k] = v }
  }
  const F = new Float32Array(N), eN = new Float32Array(N), eS = new Float32Array(N)
  for (let k = 0; k < N; k++) { eN[k] = Math.max(B[0][k] - KF * (A[0][k] - B[0][k]), 0); eS[k] = Math.max(B[1][k] - KF * (A[1][k] - B[1][k]), 0); F[k] = eN[k] + eS[k] + A[2][k] }
  const at = (g, i, j) => g[Math.min(H - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))]
  const hh = (i, j) => Math.pow(Math.max(at(F, i, j) - TH, 0), 0.6)
  const st = Math.max(1, Math.round(2.5 * res)), sh = Math.round(3 * res)
  const cv = mkCanvas(W, H), wc = mkCanvas(W, H)
  const img = cv.getContext('2d').createImageData(W, H), wim = wc.getContext('2d').createImageData(W, H), D = img.data, WD = wim.data
  const col = [0, 0, 0], n = [0, 0, 1], tint = [0, 0, 0], ground = [0, 0, 0]
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, f = F[k], o = k * 4
    const shd = 0.55 * sst2(TH * 0.5, TH * 1.1, at(F, i - sh, j - sh))
    const fw = Math.max(Math.abs(at(F, i + 1, j) - at(F, i - 1, j)) * 0.5 + Math.abs(at(F, i, j + 1) - at(F, i, j - 1)) * 0.5, 1e-4)
    const a = sst2(TH - fw, TH + fw, f)
    if (a <= 0) { D[o + 3] = Math.round(shd * 255); continue }
    const gx = hh(i + st, j) - hh(i - st, j), gy = hh(i, j + st) - hh(i, j - st), gl = Math.hypot(gx, gy)
    const rho = Math.pow(1 - Math.min(1, Math.max(0, (f - TH) / 0.25)), 0.6), nzz = Math.sqrt(Math.max(1 - rho * rho, 0))
    if (gl > 1e-5) { const q = Math.hypot(gl, 0.03), v = nrm(-gx / q * rho - gx * SG, -gy / q * rho - gy * SG, nzz); n[0] = v[0]; n[1] = v[1]; n[2] = v[2] } else { n[0] = 0; n[1] = 0; n[2] = 1 }
    const nb = A[2][k] * 0.6, tot = eN[k] + eS[k] + nb + 1e-4, ch = 1 - nb / tot
    for (let c = 0; c < 3; c++) tint[c] = (NC[c] * eN[k] + SC[c] * eS[k] + SILV[c] * nb) / tot
    // the melt seen in the chrome: dark iron with a warm glow from below, a little of the body's own pole in it
    const warm = 0.5 + 0.5 * n[1]
    const G0 = [0.2 + 0.12 * warm, 0.17 + 0.04 * warm, 0.15 + 0.01 * warm]
    for (let c = 0; c < 3; c++) ground[c] = G0[c] + (G0[c] * tint[c] * 2 - G0[c]) * 0.25 * ch
    const cl = vnoise(((x0 + i / res) / U * 4.5 + n[0] * 0.3) * 12 + seed, ((y0 + j / res) / U * 4.5 + n[1] * 0.3) * 12)
    chrome(n, tint, ground, cl, col)
    const rim = Math.pow(1 - n[2], 1.6) * 0.45 * ch, dark = 1 - 0.8 * (1 - sst2(TH, TH + fw * 3, f))
    const oa = a + (1 - a) * shd
    for (let c = 0; c < 3; c++) D[o + c] = Math.round(Math.min(1, Math.max(0, (col[c] + tint[c] * rim) * dark)) * (a / oa) * 255)
    D[o + 3] = Math.round(oa * 255)
    WD[o] = 255; WD[o + 1] = 250; WD[o + 2] = 236; WD[o + 3] = Math.round(a * 255)
  }
  cv.getContext('2d').putImageData(img, 0, 0); wc.getContext('2d').putImageData(wim, 0, 0)
  return { canvas: cv, white: wc, ax: -x0 / (x1 - x0), ay: -y0 / (y1 - y0), res }
}

// each roster id: its splat shape, the splat size as a multiple of the hitbox radius (the body's
// edge sits at about the hitbox), its animation (frames over `period` rad, turning at `spin` rad/s)
const rosterR = (id) => { const e = CHAPTERS.core.roster.find((r) => r.id === id); return ENEMIES[{ normal: 'drone', fast: 'wisp', tank: 'tank' }[e.archetype]].radius * e.radiusMul }
export const LIQUID_CAST = {
  ferriteMite: { shape: 1, k: 2.3, frames: 1, silver: true },
  needleUrchin: { shape: 2, k: 2.7, frames: 8, period: TAU / 14, spin: 0.5 },
  spinningTop: { shape: 3, k: 2.3, frames: 6, period: Math.PI / 2, spin: 9 },
  ferroBlob: { shape: 5, k: 2.2, frames: 12, period: TAU, spin: 0.6, spikes: 5 },
  ferroBlobSmall: { shape: 5, k: 2.2, frames: 12, period: TAU, spin: 0.6, spikes: 5 },
  dipoleEel: { shape: 4, k: 2.3, frames: 1, eel: true },
  lodestoneGolem: { shape: 5, k: 2.5, frames: 12, period: TAU, spin: 0.2, spikes: 7 },
}
const poleIx = (p) => (p > 0 ? 0 : 1)
function castSplats(id, pi, f, ang = 0) {
  const M = LIQUID_CAST[id], r = rosterR(id), R = r * M.k
  if (M.eel) {
    const c = Math.cos(ang), s = Math.sin(ang), g = POL.eel.gap
    return [{ x: 0, y: 0, R, ang, shape: 4, ch: pi }, { x: -c * g, y: -s * g, R, ang: ang + Math.PI, shape: 4, ch: 1 - pi }]
  }
  return [{ x: 0, y: 0, R, ang: M.frames > 1 ? (f / M.frames) * M.period : 0, shape: M.shape, ch: pi }]
}
// The title card / recap thumbnail: the creature (North) on a dark iron disc with a molten rim.
function paintThumb(id) {
  const b = bakeField(castSplats(id, 0, 0, -0.5), 4, 3)
  // the disc fits the body as drawn, not the bake's empty margin
  const { width: bw, height: bh } = b.canvas, px = b.canvas.getContext('2d').getImageData(0, 0, bw, bh).data
  let r2 = 0
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) if (px[(j * bw + i) * 4 + 3] > 40) r2 = Math.max(r2, (i - bw * b.ax) ** 2 + (j - bh * b.ay) ** 2)
  const S = Math.ceil(Math.sqrt(r2) * 2) + 28, cv = mkCanvas(S, S), x = cv.getContext('2d')
  const g = x.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S / 2)
  g.addColorStop(0, '#2a2b30'); g.addColorStop(0.82, '#141519'); g.addColorStop(1, '#5a2410')
  x.fillStyle = g; x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 2, 0, TAU); x.fill()
  x.drawImage(b.canvas, S / 2 - bw * b.ax, S / 2 - bh * b.ay)
  return cv
}
export function bakeCreature(id) {
  if (!LIQUID_CAST[id]) return null
  // in play the body is the demo's (src/liquid/gl.js), so render.js's sprite draws nothing
  const empty = { canvas: mkCanvas(2, 2), white: mkCanvas(2, 2), ax: 0.5, ay: 0.5, res: 1 }
  return { frames: [empty], thumb: paintThumb(id), baseR: rosterR(id), lean: 0, upright: true, faceDir: null, turnRate: null, fps: null, poseOf: null }
}

// ---- THE PLAYER: the mint chrome drop of the demo's FS_SPRITE, with the blob's face ---------------
export function bakePlayer() {
  const pr = PLAYER.radius, R = pr / 0.84, res = 3, S = Math.ceil((R + 3) * 2 * res), c0 = S / 2
  const cv = mkCanvas(S, S), wc = mkCanvas(S, S)
  const img = cv.getContext('2d').createImageData(S, S), wim = wc.getContext('2d').createImageData(S, S), D = img.data, WD = wim.data
  const ht = (x, y) => { const r = Math.hypot(x, y / 0.91); return r > 0.84 ? 0 : Math.sqrt(Math.max(0, 0.76 * 0.76 - r * r)) }
  const col = [0, 0, 0], e = 0.01
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = ((i + 0.5 - c0) / res) / R, y = ((j + 0.5 - c0) / res) / R, r = Math.hypot(x, y / 0.91), o = (j * S + i) * 4
    const m = 1 - sst2(0.83, 0.86, r)
    if (m <= 0) continue
    const n = nrm(-(ht(x + e, y) - ht(x - e, y)) / (2 * e), -(ht(x, y + e) - ht(x, y - e)) / (2 * e), 1)
    if (r > 0.76) { n[0] = x / r * 0.9; n[1] = y / r * 0.9; n[2] = 0.43 }
    const dark = sst2(0.73, 0.77, r)
    const gr = [0.2, 0.18, 0.16], gy = (gr[0] * 0.3 + gr[1] * 0.5 + gr[2] * 0.2) * 1.3 + 0.06
    const ground = gr.map((g, c) => (g + (gy - g) * 0.7) * MINT[c] * 1.4)
    chrome(n, MINT, ground, vnoise(x * 3 + n[0], y * 3 + n[1]), col)
    const spec = sst2(0.9, 0.95, n[0] * LP[0] + n[1] * LP[1] + n[2] * LP[2]) * 0.85 * (1 - dark)
    for (let c = 0; c < 3; c++) {
      let v = col[c] + (col[c] * 0.5 + MINT[c] * (0.5 + 0.55 * n[2]) - col[c]) * 0.85 + spec
      v = v + (v * 0.62 - v) * dark
      D[o + c] = Math.round(Math.min(1, Math.max(0, v)) * 255)
    }
    D[o + 3] = Math.round(m * 255)
    WD[o] = WD[o + 1] = WD[o + 2] = 255; WD[o + 3] = Math.round(m * 255)
  }
  const x = cv.getContext('2d')
  x.putImageData(img, 0, 0); wc.getContext('2d').putImageData(wim, 0, 0)
  // the face, where render.js's T.playerBody has it (its live pupils land on these eyes)
  x.setTransform(res, 0, 0, res, c0, c0)
  x.fillStyle = 'rgba(255,168,184,0.55)'
  for (const s of [-1, 1]) { x.beginPath(); x.arc(s * pr * 0.55, pr * 0.14, pr * 0.14, 0, TAU); x.fill() }
  x.fillStyle = '#ffffff'
  for (const s of [-1, 1]) { x.beginPath(); x.arc(s * pr * 0.36, -pr * 0.18, pr * 0.23, 0, TAU); x.fill() }
  x.strokeStyle = '#1f5f4e'; x.lineWidth = 2.5; x.lineCap = 'round'
  x.beginPath(); x.arc(0, pr * 0.2, pr * 0.2, Math.PI * 0.15, Math.PI * 0.85); x.stroke()
  return { canvas: cv, white: wc, ax: 0.5, ay: 0.5, res }
}
// the pole ring round the player: a chrome torus in the pole colour over a dark line, so it reads on any floor
function bakeRing(pole) {
  const R = PLAYER.radius + 7, tr = 2.8, res = 3, S = Math.ceil((R + 6) * 2 * res), c0 = S / 2
  const cv = mkCanvas(S, S), img = cv.getContext('2d').createImageData(S, S), D = img.data
  const tint = pole > 0 ? NC : SC, col = [0, 0, 0], ground = [0.22, 0.17, 0.14]
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = (i + 0.5 - c0) / res, y = (j + 0.5 - c0) / res, r = Math.hypot(x, y), d = r - R, o = (j * S + i) * 4
    const line = 1 - sst2(tr + 1.2, tr + 2.2, Math.abs(d))
    if (line <= 0) continue
    const a = 1 - sst2(tr - 0.6, tr + 0.4, Math.abs(d))
    const q = Math.max(-0.95, Math.min(0.95, d / tr)), n = [x / r * q, y / r * q, Math.sqrt(1 - q * q)]
    chrome(n, tint, ground, 0.55, col)
    for (let c = 0; c < 3; c++) D[o + c] = Math.round(Math.min(1, Math.max(0, col[c] + tint[c] * 0.25 * (1 - n[2]))) * 255 * a)
    D[o + 3] = Math.round((a + (1 - a) * 0.8 * line) * 255)
  }
  cv.getContext('2d').putImageData(img, 0, 0)
  return cv
}

// ---- the renderer -----------------------------------------------------------------------------
const tex = (cv, res) => new Texture({ source: new CanvasSource({ resource: cv, resolution: res }) })
// the game's flags -> the demo's creature kinds
const kindOf = (e) => e.flags.includes('poleLatch') ? 'mite' : e.flags.includes('needleFan') ? 'urchin' : e.flags.includes('poleStrobe') ? 'top'
  : e.flags.includes('ferroSpikes') ? (e._splitChild ? 'small' : 'blob') : e.flags.includes('dipole') ? 'eel' : e.flags.includes('lodestone') ? 'golem' : null
export function createLiquidRenderer(host) {
  const { app, over } = host
  let dpr = 1   // the demo canvas's device px per CSS px: its line widths are in device px
  // the demo's canvas, under Pixi's: Pixi turns transparent while The Core is on (enter/exit)
  const glc = document.createElement('canvas')
  glc.setAttribute('aria-hidden', 'true')
  glc.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;display:none'
  app.canvas.parentNode.insertBefore(glc, app.canvas)
  const core = createCoreGL(glc)
  // the player's pole ring, and the demo's 2D marks on the bodies (the golem's eye, the eel's biting end, the top's warning)
  const ringTex = [1, -1].map((p) => tex(bakeRing(p), 3))
  const ring = new Sprite(ringTex[0])
  ring.anchor.set(0.5)
  const marks = new Graphics()
  over.addChild(marks, ring)
  const sparks = []
  const S = { cam: { x: 0, y: 0 }, VW: 1, VH: 1, rt: 0, rdt: 0, warn: false, pole: 1, p: { x: 0, y: 0, r: 0.02, vx: 0, vy: 0 }, foes: [], pools: [], pillars: [], sparks }
  let look = null
  // ?debug: the frame state, for a probe scene to set the clock (scripts/scenes/core-match.js)
  if (/[?&]debug/.test(window.location?.search ?? '')) window.__liquid = { S }
  const r = {
    hide: ['floor', 'dust', 'obstacles', 'shadows'],
    enter(run, lk) {
      look = lk
      sparks.length = 0
      over.visible = true
      glc.style.display = 'block'
      app.canvas.style.position = 'relative'   // positioned, and after the demo's canvas: it paints on top
      // black as well as clear: Pixi clears with the colour unpremultiplied, and the page composites it as added light
      app.renderer.background.color = 0x000000
      app.renderer.background.alpha = 0
    },
    exit() {
      look = null
      glc.style.display = 'none'
      app.canvas.style.position = ''
      app.renderer.background.alpha = 1
    },
    filters() { return null },
    // hits and kills splash the demo's droplets and beads out of the body
    event(e, run) {
      if (e.type === 'hit' && !e.dot) {
        const b = run.enemies.find((o) => o.id === e.id)
        sparks.push({ x: e.x / U, y: e.y / U, age: 0, opp: (e.pm ?? 1) > 1, dead: false, big: !!b && (b.flags.includes('lodestone') || b.flags.includes('ferroSpikes')) })
      } else if (e.type === 'kill') sparks.push({ x: e.x / U, y: e.y / U, age: 0, opp: true, dead: true, big: false })
      return false
    },
    sync(run, dt, view) {
      if (!look || !core) return
      const rdt = Math.min(0.05, Math.max(0, dt))
      S.rt = (S.rt + rdt) % 400; S.rdt = rdt
      clock = S.rt
      const p = run.player, P = run.polarity, pole = P?.pole ?? 1
      dpr = Math.min(3, window.devicePixelRatio || 1)
      core.resize(app.screen.width, app.screen.height, dpr)
      S.cam.x = view.left / U; S.cam.y = view.top / U
      S.VW = (view.right - view.left) / U; S.VH = (view.bottom - view.top) / U
      S.pole = pole
      // the chrome tucked under the player: inside the mint blob, it only shows where a mite fuses with it
      S.p.x = p.x / U; S.p.y = p.y / U; S.p.r = (PLAYER.radius / U) * 0.87
      for (const s of sparks) s.age += rdt
      while (sparks.length && sparks[0].age > 0.5) sparks.shift()
      const m = 0.2 * U, vis = (x, y) => x > view.left - m && x < view.right + m && y > view.top - m && y < view.bottom + m
      S.foes.length = 0
      for (const e of run.enemies) {
        if (e._dead || e.pole === undefined || !vis(e.x, e.y)) continue
        const kind = kindOf(e)
        if (!kind) continue
        S.foes.push({ key: e, kind, x: e.x / U, y: e.y / U, r: e.radius / U, pole: e.pole, latched: e.latched ? { x: e._lx / U, y: e._ly / U } : null,
          stun: e.stunT || 0, spike: e.spike || 0, ph: e._pph ?? 0, hx: e.hx ?? 1, hy: e.hy ?? 0, sw: e.pole })
      }
      S.pools.length = 0
      for (const q of run.corePools ?? []) S.pools.push({ key: q, x: q.x / U, y: q.y / U, rx: q.rx / U, ry: q.ry / U, rot: q.rot, pole: q.pole, seed: q.seed ?? Math.abs(Math.floor(Math.sin(q.x * 0.013 + q.y * 0.071) * 997)) % 12 })
      S.pillars.length = 0
      for (const o of run.obstacles) if (o.kind === 'pillar') S.pillars.push({ key: o, x: o.x / U, y: o.y / U, r: o.r / U, pole: o.pole })
      core.frame(S)
      // the demo's marks drawn over the bodies
      marks.clear()
      const strobe = POL.top.strobe
      for (const f of S.foes) {
        const e = f.key, R = e.radius
        if (f.kind === 'golem') {
          const er = R * 0.36
          marks.circle(e.x, e.y, er).fill(0x0c0d10)
          marks.circle(e.x, e.y, er * (0.5 + 0.1 * Math.sin(S.rt * 6))).fill(e.pole > 0 ? 0xff5a3c : 0x4aa3ff)
          marks.circle(e.x - er * 0.3, e.y - er * 0.3, er * 0.16).fill(0xffffff)
          // its health bar, the demo's: a steel slot over its head, filled hot
          const by = e.y - R - 0.018 * U, fr = Math.max(0, Math.min(1, e.hp / e.maxHP))
          marks.rect(e.x - R, by, R * 2, 0.008 * U).fill(0x0c0d10)
          marks.rect(e.x - R + 0.0012 * U, by + 0.0012 * U, (R * 2 - 0.0024 * U) * fr, 0.0056 * U).fill(0xff8a3d)
        } else if (f.kind === 'eel') {
          const lead = e.pole !== pole, dir = lead ? 1 : -1, hx = f.hx * dir, hy = f.hy * dir, g = POL.eel.gap
          const lx = lead ? e.x : e.x - f.hx * g, ly = lead ? e.y : e.y - f.hy * g
          for (const k of [-1, 1]) marks.circle(lx + hx * R * 0.55 - hy * k * R * 0.35, ly + hy * R * 0.55 + hx * k * R * 0.35, R * 0.17).fill(0xfff3d6)
        } else if (f.kind === 'top') {
          const lft = strobe - ((((run.time + (e._pph ?? 0)) % strobe) + strobe) % strobe)
          if (lft < 0.4 && Math.sin(S.rt * 40) > -0.3) marks.circle(e.x, e.y, R * 1.6).stroke({ width: 2.4 / ((view.zoom || 1) * dpr), color: e.pole > 0 ? 0x4aa3ff : 0xff5a3c })
        }
      }
      // your pole: the chrome ring round you; the i-frames blink the ring, not the drop
      ring.visible = !!P && !p.dead
      ring.alpha = (p.invuln || 0) > 0 && Math.sin(clock * 32) <= 0 ? 0.3 : 1
      ring.texture = ringTex[poleIx(pole)]
      ring.position.set(p.x, p.y)
    },
  }
  return r
}

