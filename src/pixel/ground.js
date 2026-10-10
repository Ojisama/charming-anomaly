// The Magma's GROUND: the three kinds of floor sim.js reads (MAGMA_FLOOR, magmaGroundAt), drawn on
// the chapter's one art-pixel grid. A lava RIVER is a molten channel — dark-red banks, an orange
// flow, a gold core — that lights the cave like open lava does. A COOLED FLOW is old, thick, glossy
// black rock laid in ropes across the way it once ran. HOT GROUND is a thin crust with dull red
// showing through fine fissures. Nothing here is an outline, a ring or a painted zone: each one is
// just a different floor.
//
// Baked once per CHUNK (CHUNK_ART art px a side) from the same depth functions the sim burns and
// refuses cracks with, sampled every STEP art px and interpolated, so a frame never evaluates noise
// per pixel. Each chunk carries what the rig animates every frame: the river's light points, the
// hot ground's, and the anchors its crust plates drift from. render-side only.
import { PAL, PixelCanvas, hash } from './canvas.js'
import { riverDepthAt, cooledDepthAt, hotDepthAt, cooledFlowOf, riverFlowOf } from '../sim.js'

export const CHUNK_ART = 128
const STEP = 4

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
// the river, bank to core (the bank is cool enough not to glow, the core is white-gold)
const RV = { lip: rgb(PAL.scab1), lipDot: rgb(PAL.scab0), bank: rgb(PAL.lava0), l1: rgb(PAL.lava1), l2: rgb(PAL.lava2), l3: rgb(PAL.lava3), l4: rgb(PAL.lava4) }
// the cooled flow: black glass-smooth basalt, darker than the plates round it, ropes catching light
const CO = { base: rgb('#1b171e'), mid: rgb('#231e29'), rope: rgb('#2f2a37'), gloss: rgb('#4c465c'), rim: rgb('#221c22') }
// hot ground's fissures: dull red (lit by its own glow), and a brighter thread where it is thinnest
const HO = { dull: rgb('#6a1c0c'), hot: rgb('#a8320e') }

function canvasOf(img) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = CHUNK_ART
  cv.getContext('2d').putImageData(img, 0, 0)
  return cv
}

// chunk (ci, cj) -> null (plain crust) or { base, fiss, riverLights, hotLights, plates }
// base/fiss: canvases at one texel per art pixel. Lights: [x, y, depth] in world px.
export function bakeGroundChunk(F, seed, ci, cj, PX) {
  const n = CHUNK_ART / STEP + 1
  const X0 = ci * CHUNK_ART * PX, Y0 = cj * CHUNK_ART * PX
  const dr = new Float32Array(n * n), dc = new Float32Array(n * n), dh = new Float32Array(n * n)
  let any = false
  for (let gj = 0; gj < n; gj++) for (let gi = 0; gi < n; gi++) {
    const x = X0 + gi * STEP * PX, y = Y0 + gj * STEP * PX, k = gj * n + gi
    const r = riverDepthAt(F, x, y, seed)
    if (r > 0) { dr[k] = r; any = true; continue }
    const c = cooledDepthAt(F, x, y, seed)
    if (c > 0) { dc[k] = c; any = true; continue }
    const h = hotDepthAt(F, x, y, seed)
    if (h > 0) { dh[k] = h; any = true }
  }
  if (!any) return null
  const lerp = (A, u, v) => {
    const i = Math.min(n - 2, Math.floor(u)), j = Math.min(n - 2, Math.floor(v)), fx = u - i, fy = v - j
    const a = A[j * n + i], b = A[j * n + i + 1], c = A[(j + 1) * n + i], d = A[(j + 1) * n + i + 1]
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy
  }
  const base = new ImageData(CHUNK_ART, CHUNK_ART), fiss = new ImageData(CHUNK_ART, CHUNK_ART)
  let hasBase = false, hasFiss = false
  const put = (img, ax, ay, c) => { const o = (ay * CHUNK_ART + ax) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255 }
  const [rfx, rfy] = riverFlowOf(F, seed)
  const [cfx, cfy] = cooledFlowOf(F, seed)
  const AX0 = ci * CHUNK_ART, AY0 = cj * CHUNK_ART   // this chunk's first art pixel, world-wide
  for (let ay = 0; ay < CHUNK_ART; ay++) for (let ax = 0; ax < CHUNK_ART; ax++) {
    const u = (ax + 0.5) / STEP, v = (ay + 0.5) / STEP
    const wx = (AX0 + ax + 0.5) * PX, wy = (AY0 + ay + 0.5) * PX
    const gx = AX0 + ax, gy = AY0 + ay
    const r = lerp(dr, u, v)
    if (r > 0.02) {
      // RIVER: lip of crust, a dark-red bank, then orange to a gold core, with streaks along the flow
      const al = wx * rfx + wy * rfy
      let c
      if (r < 0.1) c = hash(gx >> 1, gy >> 1, 41) < 0.3 ? RV.lipDot : RV.lip
      else if (r < 0.26) c = RV.bank
      else if (r < 0.46) c = RV.l1
      else if (r < 0.76) c = (r > 0.58 && r < 0.64 && hash(Math.floor(al / 16), 3, 43) > 0.45) ? RV.l3 : RV.l2
      else c = (r > 0.88 && hash(Math.floor(al / 12), 5, 47) > 0.3) ? RV.l4 : RV.l3
      put(base, ax, ay, c); hasBase = true
      continue
    }
    const co = lerp(dc, u, v)
    if (co > 0.02) {
      // COOLED FLOW (pahoehoe): side-by-side toes of old flow, each wrinkled into ropes that bow
      // downstream; a rope breaks off here and there, and some crests keep a glassy gloss
      const al = wx * cfx + wy * cfy, ac = -wx * cfy + wy * cfx
      // toes overlap one another every so far down the flow, so no two rows line up
      const row = Math.floor(al / 110), lw = 56 + 30 * hash(row, 7, 81)
      const sh = ac + lw * hash(row, 8, 81), li = Math.floor(sh / lw), lf = (sh / lw - li) * 2 - 1
      const sp = 9 + 4 * hash(li, row, 81)
      const q = al - (10 + 14 * hash(li, row, 82)) * (1 - lf * lf) + 40 * hash(li, 0, 81)
      const ri = Math.floor(q / sp), ph = q / sp - ri
      let c = CO.base
      if (hash(ri, li, 83) > 0.2) c = ph < 0.3 ? CO.rope : ph < 0.44 ? CO.mid : CO.base
      if (c === CO.rope && ph < 0.12 && co > 0.3 && hash(gx >> 2, ri, 53) < 0.35) c = CO.gloss
      if (co < 0.1) c = CO.rim
      put(base, ax, ay, c); hasBase = true
      continue
    }
    const h = lerp(dh, u, v)
    if (h > 0.02) {
      // HOT GROUND: the floor's own plates stay; fine fissures crack them, more of them the thinner
      const cs = 10, ci0 = Math.floor(gx / cs), cj0 = Math.floor(gy / cs)
      let d1 = 1e9, d2 = 1e9, k1 = 0, k2 = 0
      for (let oj = -1; oj <= 1; oj++) for (let oi = -1; oi <= 1; oi++) {
        const a = ci0 + oi, b = cj0 + oj
        const px = (a + hash(a, b, 61)) * cs, py = (b + hash(a, b, 62)) * cs
        const d = Math.hypot(gx + 0.5 - px, gy + 0.5 - py)
        if (d < d1) { d2 = d1; k2 = k1; d1 = d; k1 = a * 7919 + b } else if (d < d2) { d2 = d; k2 = a * 7919 + b }
      }
      // one edge between two cells is one fissure: some open, most not, more of them where thinnest
      const eh = hash(Math.min(k1, k2), Math.max(k1, k2), 67)
      if (d2 - d1 < 1.0 && eh < 0.08 + h * 0.5) {
        put(fiss, ax, ay, h > 0.6 && eh < 0.25 * h ? HO.hot : HO.dull); hasFiss = true
      }
    }
  }
  const riverLights = [], hotLights = [], plates = []
  for (let gj = 0; gj < n - 1; gj++) for (let gi = 0; gi < n - 1; gi++) {
    const x = X0 + gi * STEP * PX, y = Y0 + gj * STEP * PX, k = gj * n + gi
    if (dr[k] > 0.45 && gi % 3 === 0 && gj % 3 === 0) riverLights.push([x, y, dr[k]])
    if (dr[k] > 0.5 && gi % 3 === 1 && gj % 3 === 1 && hash(ci * 97 + gi, cj * 89 + gj, 71) < 0.5) plates.push([x, y, hash(ci * 97 + gi, cj * 89 + gj, 72)])
    if (dh[k] > 0.3 && gi % 4 === 0 && gj % 4 === 0) hotLights.push([x, y, dh[k]])
  }
  return {
    base: hasBase ? canvasOf(base) : null, fiss: hasFiss ? canvasOf(fiss) : null,
    riverLights, hotLights, plates, flow: [rfx, rfy],
  }
}

// a crust plate riding the river: a raft of dark scab, an ash fleck on it. size 0 small .. 2 big
export const PLATE_ART = [[5, 4], [9, 6], [13, 9]]
export function paintPlate(pc, v, size) {
  const [w, h] = PLATE_ART[size]
  // two or three overlapping lumps: a raft, never a dot
  const lumps = [[0.5, 0.5, 0.5, 0.5], [0.3 + 0.2 * hash(v, 1, 5), 0.4, 0.34, 0.42], [0.72, 0.6 - 0.2 * hash(v, 2, 5), 0.3, 0.38]]
  for (const [cx, cy, rx, ry] of lumps.slice(0, size === 0 ? 1 : 3)) pc.ellipse(cx * w, cy * h, rx * w, ry * h, PAL.scab1)
  // a flat raft of crust: dark all over, a little paler where its top has cooled longest
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!pc.get(x, y)) continue
    const edge = !pc.get(x - 1, y) || !pc.get(x + 1, y) || !pc.get(x, y - 1) || !pc.get(x, y + 1)
    pc.set(x, y, edge ? PAL.scab0 : hash(x >> 1, y, v * 13 + size) < 0.3 ? PAL.rkS : PAL.scab1)
  }
}
