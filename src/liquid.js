// ==== Book 3, THE CORE: LIQUID METAL (the owner-approved docs/superpowers/specs/assets/core-liquid-final.html) ====
// CHAPTERS.core.render.liquid hands the chapter's floor, pillars and cast to this module, the way
// The Mantle's render.toon hands them to src/toon.js:
//   createLiquidRenderer(host) -> renderer { hide, enter, exit, sync, event, filters }
//     host = { app, world, floor, under, over }: floor (over render.js's floor, under every entity),
//     under / over (world space, under and over the creatures).
//     THE FLOOR is one view-sized mesh running the demo's sea shader (src/liquid/glsl.js FLOOR_FRAG): the
//     mirror sea of liquid iron with the melt glowing under it, the wakes bodies drop, the ink-blot
//     ferrofluid pools (their arms reach for you when you are of the other pole), the pillars' wakes,
//     reflections, heat and pull streams, and the pillar and golem field rings. Drawn at resolution 1.
//     THE PILLARS are one raymarched levitator mesh each (PIL_FRAG), plinth = the collision radius.
//     THE PLAYER'S POLE is a chrome ring round the blob (the blob stays mint: bakePlayer).
//     Blob and golem SPIKES are chrome cone sprites fanned out from under the body.
//   bakeCreature(id, elite) -> { frames, poseOf, dirs?, dirTex?, baseR, thumb, ... } (toon.js's shape):
//     chrome bodies baked once on the CPU from the demo's own field and chrome() maths, tinted by pole.
//   bakePlayer() -> the mint chrome blob with its face (render.js keeps the live pupils).
import { BufferImageSource, Container, Mesh, MeshGeometry, Shader, Sprite, Texture, UniformGroup, AlphaFilter, CanvasSource } from 'pixi.js'
import { CHAPTERS, ENEMIES, PLAYER } from './config.js'
import { mkCanvas } from './toon/palette.js'
import { U, NPIL, NPOOL, NGOL, NWAKE, NARM, QUAD_VERT, FLOOR_FRAG, PIL_FRAG, bakeHeat, bakeNoise, HEAT_N, NOISE_N } from './liquid/glsl.js'

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
  const M = LIQUID_CAST[id]
  if (!M) return null
  const nf = M.frames, poles = M.silver ? 3 : 2, frames = []
  for (let pi = 0; pi < poles; pi++) for (let f = 0; f < nf; f++) frames.push(bakeField(castSplats(id, pi, f), RES, pi * 7 + f))
  const base = { frames, thumb: paintThumb(id), baseR: rosterR(id), lean: 0, upright: true, faceDir: null, turnRate: null, fps: null }
  if (M.eel) {
    // the eel turns by swapping bakes (render.js look.dirs): head pole x 16 headings, baked on first sight
    const DIRS = 16, cache = new Map()
    return {
      ...base, upright: false, dirs: DIRS,
      poseOf: (e) => poleIx(e.pole),
      faceDir: (e) => (e.hx != null ? [e.hx, e.hy] : null),
      dirBake: (fi, d) => { const k = fi * 64 + d; let b = cache.get(k); if (!b) { b = bakeField(castSplats(id, fi, 0, (d / DIRS) * TAU), RES, fi * 7 + d); cache.set(k, b) } return b },
    }
  }
  return {
    ...base,
    poseOf: (e) => {
      const pi = M.silver && (e.stunT || 0) > 0 ? 2 : poleIx(e.pole)
      return pi * nf + (nf > 1 ? Math.floor((((clock * M.spin + e.id * 1.7) / M.period) % 1 + 1) % 1 * nf) % nf : 0)
    },
  }
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
const quadGeo = () => new MeshGeometry({ positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) })
export function createLiquidRenderer(host) {
  const { floor, under, over } = host
  const heatSrc = new BufferImageSource({ resource: bakeHeat(), width: HEAT_N, height: HEAT_N, format: 'rgba16float', scaleMode: 'linear', addressMode: 'repeat', alphaMode: 'no-premultiply-alpha' })
  const noiseSrc = new BufferImageSource({ resource: bakeNoise(), width: NOISE_N, height: NOISE_N, format: 'rgba8unorm', scaleMode: 'linear', addressMode: 'repeat', alphaMode: 'no-premultiply-alpha', autoGenerateMipmaps: true, mipmapFilter: 'linear' })
  const f32 = (v) => ({ value: v, type: 'f32' })
  const arr = (n, w) => ({ value: new Float32Array(n * w), type: `vec${w}<f32>`, size: n })
  const floorU = new UniformGroup({
    uRect: { value: new Float32Array(4), type: 'vec4<f32>' }, uPl: { value: new Float32Array(2), type: 'vec2<f32>' },
    uT: f32(0), uPole: f32(1), uPix: f32(1 / U), uPS: f32(1), uPilR0: f32(0.06), uPilR1: f32(0.32), uGolR1: f32(0.5),
    uNP: f32(0), uNPil: f32(0), uNG: f32(0), uNW: f32(0), uNA: f32(0), uArmPool: f32(-1),
    uPool: arr(NPOOL, 4), uPoolB: arr(NPOOL, 2), uPoolR: arr(NPOOL, 4), uPoolF: arr(NPOOL, 4),
    uPil: arr(NPIL, 4), uGol: arr(NGOL, 4), uWk: arr(NWAKE, 4), uArmS: arr(NARM, 4), uArmW: arr(NARM, 2),
  })
  const sea = new Mesh({ geometry: quadGeo(), shader: Shader.from({ gl: { vertex: QUAD_VERT, fragment: FLOOR_FRAG, name: 'liquid-floor' }, resources: { floorU, uC: heatSrc, uN: noiseSrc } }) })
  const pilLayer = new Container()
  floor.addChild(sea, pilLayer)
  const pilShared = new UniformGroup({ uT: f32(0), uPix: f32(1 / U) })
  const pils = []   // { mesh, own }
  const pilMesh = (i) => {
    if (pils[i]) return pils[i]
    const own = new UniformGroup({ uPS: f32(1), uP: { value: new Float32Array(4), type: 'vec4<f32>' }, uRect: { value: new Float32Array(4), type: 'vec4<f32>' } })
    const mesh = new Mesh({ geometry: quadGeo(), shader: Shader.from({ gl: { vertex: QUAD_VERT, fragment: PIL_FRAG, name: 'liquid-pillar' }, resources: { pilShared, own, uN: noiseSrc } }) })
    pilLayer.addChild(mesh)
    return (pils[i] = { mesh, own })
  }
  const floorPass = new AlphaFilter({ alpha: 1, resolution: 1 })
  // ?debug: the floor's uniforms, for a probe scene to read or ablate
  if (typeof window !== 'undefined' && /[?&]debug/.test(window.location?.search ?? '')) window.__liquid = { floorU, pils }
  // the spikes and the player's pole ring
  const coneTex = [1, -1].map((p) => { const b = bakeField([{ x: 0, y: 0, R: 40 / 0.88, ang: 0, shape: 8, ch: poleIx(p) }], RES, 5); return { tex: tex(b.canvas, b.res), ax: b.ax, ay: b.ay } })
  const ringTex = [1, -1].map((p) => tex(bakeRing(p), 3))
  const spikeSprites = []
  let nSpike = 0
  const spike = (x, y, a, len, pole) => {
    let s = spikeSprites[nSpike]
    if (!s) { s = new Sprite(); under.addChild(s); spikeSprites.push(s) }
    nSpike++
    const t = coneTex[poleIx(pole)]
    s.texture = t.tex; s.anchor.set(t.ax, t.ay); s.position.set(x, y); s.rotation = a; s.scale.set(len / 40); s.visible = true
  }
  const fan = (x, y, ang, n, L, spread, seed, pole) => {
    for (let i = 0; i < n; i++) {
      const h1 = ((seed * 977 + i * 131) % 97) / 97, h2 = ((seed * 571 + i * 313) % 89) / 89
      const a = ang + (n > 1 ? (i / (n - 1) - 0.5) * 2 * spread : 0) + (h1 - 0.5) * 0.4
      spike(x, y, a, L * (0.55 + 0.45 * h2) * (0.85 + 0.15 * Math.sin(clock * 3.3 + i * 2.1 + seed)), pole)
    }
  }
  const ring = new Sprite(ringTex[0])
  ring.anchor.set(0.5)
  over.addChild(ring)

  // draw-only reaction state, eased off the sim's positions (never written back)
  const pilState = new WeakMap(), poolState = new WeakMap(), wakeLast = new WeakMap()
  const wakes = []
  let rt = 0, look = null, pBob = 0
  const r = {
    hide: ['floor', 'dust', 'obstacles', 'shadows'],
    enter(run, lk) {
      look = lk
      wakes.length = 0
      floor.visible = under.visible = over.visible = true
      floor.filters = [floorPass]
    },
    exit() {
      look = null
      floor.filters = null
      for (const s of spikeSprites) s.visible = false
      for (const p of pils) p.mesh.visible = false
    },
    filters() { return null },
    event(e) {
      if (e.type === 'poolFlip') wakes.push({ x: e.x / U, y: e.y / U, age: 0, amp: 0.12 })
      return false
    },
    sync(run, dt, view) {
      if (!look) return
      const rdt = Math.min(0.05, Math.max(0, dt))
      rt = (rt + rdt) % 400
      clock = rt
      const p = run.player, P = run.polarity, pole = P?.pole ?? 1
      const px = p.x / U, py = p.y / U, u = floorU.uniforms
      const pad = 8, vx0 = view.left - pad, vy0 = view.top - pad, vw = view.right - view.left + pad * 2, vh = view.bottom - view.top + pad * 2
      sea.position.set(vx0, vy0); sea.scale.set(vw, vh)
      u.uRect[0] = vx0; u.uRect[1] = vy0; u.uRect[2] = vw; u.uRect[3] = vh
      u.uPl[0] = px; u.uPl[1] = py
      u.uT = rt; u.uPole = pole; u.uPix = 1 / (U * (view.zoom || 1))
      const vis = (x, y, m) => x > view.left - m && x < view.right + m && y > view.top - m && y < view.bottom + m
      // WAKES: rings dropped in the iron sea where bodies pass
      for (const k of wakes) k.age += rdt
      while (wakes.length && wakes[0].age > 1.6) wakes.shift()
      const drop = (x, y, amp) => { wakes.push({ x, y, age: 0, amp }); if (wakes.length > NWAKE) wakes.shift() }
      for (const b of [p, ...run.enemies]) {
        if (b !== p && (b._dead || b.latched || !vis(b.x, b.y, 130))) continue
        const l = wakeLast.get(b)
        if (!l) { wakeLast.set(b, { x: b.x, y: b.y }); continue }
        if (Math.hypot(b.x - l.x, b.y - l.y) > (b === p ? 40 : 53)) { drop(b.x / U, b.y / U, b === p ? 0.12 : Math.min(0.1, (b.radius / U) * 3)); l.x = b.x; l.y = b.y }
      }
      pBob += rdt
      if (pBob > 1.4) { pBob = 0; drop(px, py, 0.06) }
      wakes.forEach((k, i) => { u.uWk[i * 4] = k.x; u.uWk[i * 4 + 1] = k.y; u.uWk[i * 4 + 2] = k.age; u.uWk[i * 4 + 3] = k.amp })
      u.uNW = wakes.length
      // POOLS: each eased toward you (the other pole) or away (yours), the demo's PV
      let np = 0, armQ = null, armO = 0.02, armV = null
      for (const q of run.corePools ?? []) {
        if (!vis(q.x, q.y, Math.max(q.rx, q.ry) * 2.4 + 60)) continue
        let v = poolState.get(q)
        if (!v) { v = { x: q.x / U, y: q.y / U, o: 0, s: 0, fx: 0, fy: 0, b: 0, t: 0, seed: Math.floor(Math.abs(Math.sin(q.x * 0.013 + q.y * 0.071)) * 997) }; poolState.set(q, v) }
        const qx = q.x / U, qy = q.y / U, rx = q.rx / U, ry = q.ry / U
        const dx = px - qx, dy = py - qy, dm = Math.hypot(dx, dy) || 1, lim = Math.min(1, (Math.max(rx, ry) + 0.05) / dm)
        const cs = Math.cos(q.rot), sn = Math.sin(q.rot), lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs
        const de = (Math.hypot(lx / rx, ly / ry) - 1) * Math.min(rx, ry), opp = q.pole !== pole
        const to = opp ? sst((0.22 - de) / 0.2) : 0, ts = !opp ? sst((0.16 - de) / 0.16) : 0, ta = opp ? sst((0.12 - de) / 0.1) : 0
        v.o += (ta - v.o) * (1 - Math.exp(-rdt / (ta > v.o ? 0.22 : 1.1)))
        v.s += (ts - v.s) * (1 - Math.exp(-rdt / (ts > v.s ? 0.25 : 0.9)))
        const kf = 1 - Math.exp(-rdt / 0.15)
        v.x += (qx + dx * lim - v.x) * kf; v.y += (qy + dy * lim - v.y) * kf
        const fa = to - 0.85 * ts, tfx = (dx / dm) * fa, tfy = (dy / dm) * fa, kv = 1 - Math.exp(-rdt / (Math.hypot(tfx, tfy) > Math.hypot(v.fx, v.fy) ? 0.6 : 1.8))
        v.fx += (tfx - v.fx) * kv; v.fy += (tfy - v.fy) * kv
        const B = Math.min(1, (0.16 / (Math.max(de, 0) + 0.06)) ** 2) * sst((0.45 - de) / 0.25), tb = opp ? B : 0, tt = opp ? B : -B
        v.b += (tb - v.b) * (1 - Math.exp(-rdt / (tb > v.b ? 0.2 : 1.1)))
        v.t += (tt - v.t) * (1 - Math.exp(-rdt / (Math.abs(tt) > Math.abs(v.t) ? 0.1 : 0.9)))
        if (np >= NPOOL) continue
        u.uPool.set([qx, qy, rx, ry], np * 4); u.uPoolB.set([q.rot, q.pole], np * 2)
        u.uPoolR.set([v.x, v.y, v.b, v.s], np * 4); u.uPoolF.set([v.fx, v.fy, v.seed, v.t], np * 4)
        if (v.o > armO) { armO = v.o; armQ = np; armV = { q, v } }
        np++
      }
      u.uNP = np
      // the pool's ARMS: three fat necks of its ink from the near shore, straining toward you, tips
      // stopping just short of you (the demo's arm(), as capsules in the pool's rotated frame)
      let na = 0
      u.uArmPool = -1
      if (armV) {
        const { q, v } = armV, k = v.o
        const qx = q.x / U, qy = q.y / U, rx = q.rx / U, ry = q.ry / U, cs = Math.cos(q.rot), sn = Math.sin(q.rot)
        const ex = px - qx, ey = py - qy, lx = ex * cs + ey * sn, ly = -ex * sn + ey * cs
        const a = Math.atan2(ly / ry, lx / rx), ar = 0.9 + 0.45 * Math.max(v.t, 0), pr = PLAYER.radius / U
        const toL = (wx, wy) => [(wx - qx) * cs + (wy - qy) * sn, -(wx - qx) * sn + (wy - qy) * cs]
        for (let i = -1; i <= 1; i++) {
          const ai = a + (i * 0.034) / Math.min(rx, ry), ex2 = Math.cos(ai) * rx * ar, ey2 = Math.sin(ai) * ry * ar
          const sx = qx + ex2 * cs - ey2 * sn, sy = qy + ex2 * sn + ey2 * cs, ddx = px - sx, ddy = py - sy, d = Math.hypot(ddx, ddy)
          const nx = Math.cos(ai) / rx, ny = Math.sin(ai) / ry, wnx = nx * cs - ny * sn, wny = nx * sn + ny * cs
          const ad = Math.atan2(ddy, ddx), an = Math.atan2(wny, wnx), a0 = ad + Math.atan2(Math.sin(an - ad), Math.cos(an - ad)) * 0.25
          const seed = qx * 9 + i * 2.7, wd = 0.011 * (1 - Math.abs(i) * 0.2)
          let L = k * Math.max(0, Math.min(0.12 * (1 - Math.abs(i) * 0.3), d - pr - 0.024))
          const ph = (((rt * 0.5 + seed * 0.37) % 1) + 1) % 1
          L *= 0.6 + 0.4 * (ph < 0.6 ? sst(ph / 0.6) : 1 - sst((ph - 0.6) / 0.4))
          if (L < 0.004) continue
          const N = 4, sl = (L * 0.72) / N
          let an2 = a0, cx = sx, cy = sy, wa = wd * 1.7
          for (let s = 1; s <= N && na < NARM; s++) {
            const t = s / N
            an2 = a0 + Math.sin(rt * 2.4 + seed * 1.7 + t * 2.5) * 0.32 * t
            const nx2 = cx + Math.cos(an2) * sl, ny2 = cy + Math.sin(an2) * sl, wb = wd * 1.7 * (1 - 0.55 * t)
            const A0 = toL(cx, cy), A1 = toL(nx2, ny2)
            u.uArmS.set([A0[0], A0[1], A1[0], A1[1]], na * 4); u.uArmW.set([wa, wb], na * 2); na++
            cx = nx2; cy = ny2; wa = wb
          }
          if (na < NARM) {
            const tx = cx + Math.cos(an2) * L * 0.36, ty = cy + Math.sin(an2) * L * 0.36, A0 = toL(cx, cy), A1 = toL(tx, ty)
            u.uArmS.set([A0[0], A0[1], A1[0], A1[1]], na * 4); u.uArmW.set([wa, 0.0015], na * 2); na++
          }
        }
        if (na) u.uArmPool = armQ
      }
      u.uNA = na
      // PILLARS: each reacts to the nearest opposite body (you first), the demo's pilReact
      let npl = 0
      const live = []
      for (const o of run.obstacles) {
        if (o.kind !== 'pillar') continue
        let s = pilState.get(o)
        if (!s) { s = { k: 0, dx: 0, dy: 1, ph: Math.abs(Math.sin(o.x * 0.37)) % 1 }; pilState.set(o, s) }
        if (!vis(o.x, o.y, 230)) continue
        const qx = o.x / U, qy = o.y / U, ex = px - qx, ey = py - qy, d = Math.hypot(ex, ey) || 1
        let tk = o.pole !== pole ? sst((0.36 - d) / 0.26) : -sst((0.3 - d) / 0.22), tx = ex / d, ty = ey / d
        if (tk < 0.3 && tk > -0.05) {
          let bd = 0.17, bo = null
          for (const e of run.enemies) {
            if (e._dead || e.pole === undefined || e.pole === o.pole || e.flags.includes('dipole') || e.flags.includes('poleStrobe')) continue
            const dd = Math.hypot(e.x / U - qx, e.y / U - qy)
            if (dd < bd) { bd = dd; bo = e }
          }
          if (bo) { const kc = 0.6 * (1 - bd / 0.17); if (kc > tk) { tk = kc; tx = (bo.x / U - qx) / bd; ty = (bo.y / U - qy) / bd } }
        }
        s.k += (tk - s.k) * (1 - Math.exp(-rdt / (Math.abs(tk) > Math.abs(s.k) ? 0.3 : 0.7)))
        const kd = 1 - Math.exp(-rdt / 0.25)
        s.dx += (tx - s.dx) * kd; s.dy += (ty - s.dy) * kd
        const spd = s.k >= 0 ? 0.11 + 0.55 * s.k : 0.11 - 0.66 * -s.k
        s.ph = (((s.ph + rdt * spd) % 1) + 1) % 1
        if (npl >= NPIL) continue
        const w = Math.min(1023, Math.floor(((Math.atan2(s.dy, s.dx) + Math.PI) / TAU) * 1024)) + Math.min(0.9999, s.ph)
        const ps = 0.035 / (o.r / U)
        u.uPil.set([qx, qy, o.pole * (2 + s.k), w], npl * 4)
        u.uPS = ps
        live.push({ o, ps, w, z: o.pole * (2 + s.k) })
        npl++
      }
      u.uNPil = npl
      u.uPilR0 = live.length ? (live[0].o.r + 19) / U : 0.06
      u.uPilR1 = (POL.pillar?.reach ?? 213) / U
      live.sort((a, b) => a.o.y - b.o.y)
      pilShared.uniforms.uT = rt; pilShared.uniforms.uPix = u.uPix
      live.forEach((L, i) => {
        const m = pilMesh(i), ou = m.own.uniforms, hw = (0.2 * U) / L.ps, top = L.o.y - (0.235 * U) / L.ps, bot = L.o.y + (0.165 * U) / L.ps
        ou.uPS = L.ps
        ou.uP[0] = L.o.x / U; ou.uP[1] = L.o.y / U; ou.uP[2] = L.z; ou.uP[3] = L.w
        ou.uRect[0] = L.o.x - hw; ou.uRect[1] = top; ou.uRect[2] = hw * 2; ou.uRect[3] = bot - top
        m.mesh.position.set(L.o.x - hw, top); m.mesh.scale.set(hw * 2, bot - top); m.mesh.visible = true
      })
      for (let i = live.length; i < pils.length; i++) pils[i].mesh.visible = false
      // GOLEMS' field rings, and the creatures' spikes
      let ng = 0
      nSpike = 0
      for (const e of run.enemies) {
        if (e._dead || e.pole === undefined) continue
        const lode = e.flags.includes('lodestone')
        if (lode && ng < NGOL && vis(e.x, e.y, POL.golem.dragR)) { u.uGol.set([e.x / U, e.y / U, e.pole, (e.radius + 6) / U], ng * 4); ng++ }
        if (!vis(e.x, e.y, 80)) continue
        const seed = (e.id * 37) % 100
        if (e.flags.includes('ferroSpikes') && (e.spike || 0) > 0.03) fan(e.x, e.y, Math.atan2(p.y - e.y, p.x - e.x), 5, e.radius * 2.1 * e.spike, 0.75, seed, e.pole)
        else if (lode) {
          let tx = 0, ty = 0, td = 0
          if (e.pole !== pole) { tx = p.x - e.x; ty = p.y - e.y; td = sst((333 - Math.hypot(tx, ty)) / 200); if (td < 0.05) td = 0 }
          if (!td) { let bd = 267; for (const o of run.obstacles) if (o.kind === 'pillar' && o.pole !== e.pole) { const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < bd) { bd = d; tx = o.x - e.x; ty = o.y - e.y; td = 1 } } }
          if (td) fan(e.x, e.y, Math.atan2(ty, tx), 7, e.radius * 1.9 * td, 0.85, seed, e.pole)
        }
      }
      for (let i = nSpike; i < spikeSprites.length; i++) spikeSprites[i].visible = false
      u.uNG = ng
      u.uGolR1 = POL.golem.dragR / U
      // your pole: the chrome ring round you
      ring.visible = !!P && !p.dead
      // i-frames blink the RING, not the drop: render.js's 0.4 body blink turned the chrome into glass (setLiquid holds playerC opaque)
      ring.alpha = (p.invuln || 0) > 0 && Math.sin(clock * 32) <= 0 ? 0.3 : 1
      ring.texture = ringTex[poleIx(pole)]
      ring.position.set(p.x, p.y)
    },
  }
  return r
}
