// The Magma's world, painted one art pixel at a time: the floor, the props, the crust (fresh crack ->
// warming -> hot -> open lava -> crusting over), slag puddles, every shot, and the pickups.
// All ALBEDO, and kept FLAT: a base, a shade, a highlight. The CRT pass (src/pixel/crt.js) lights it,
// and lights anything painted hot by itself — so the only hot things on the floor are real cracks,
// real lava and real fire. No decorative vein, glint or glowing seam anywhere else.
import { PAL, PixelCanvas, hash, TAU } from './canvas.js'

const P = PAL

// ---- the floor: big flat plates of basalt, a one-pixel joint between them ------------------------
export const TILE_ART = 240   // art px per side of the seamless floor tile
export function paintFloorTile() {
  const N = TILE_ART
  const pc = new PixelCanvas(N, N)
  const seeds = []
  for (let k = 0; k < 44; k++) seeds.push([hash(k, 1, 71) * N, hash(k, 2, 71) * N])
  const wrap = (d) => (d > N / 2 ? d - N : d < -N / 2 ? d + N : d)
  const tones = [P.fl1, P.fl2, P.fl3]
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let d1 = 1e9, d2 = 1e9, k1 = 0
    for (let k = 0; k < seeds.length; k++) {
      const dx = wrap(x + 0.5 - seeds[k][0]), dy = wrap(y + 0.5 - seeds[k][1])
      const d = Math.hypot(dx, dy)
      if (d < d1) { d2 = d1; d1 = d; k1 = k } else if (d < d2) d2 = d
    }
    pc.set(x, y, d2 - d1 < 1.1 ? P.fl0 : tones[Math.floor(hash(k1, 9, 3) * 3)])
  }
  return pc
}

// ---- floor props: flat shapes, two or three tones each, lit only by what is near them ------------
function hexagon(pc, cx, cy, r, top, side, hgt) {
  // a basalt column seen from above and a little in front: flat hexagonal top, its front face below
  const pts = []
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8]) }
  for (let k = 0; k < 6; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % 6]
    if (ay >= cy - 0.1 || by >= cy - 0.1) { pc.tri(ax, ay, bx, by, bx, by + hgt, side); pc.tri(ax, ay, bx, by + hgt, ax, ay + hgt, side) }
  }
  for (let k = 0; k < 6; k++) pc.tri(cx, cy, pts[k][0], pts[k][1], pts[(k + 1) % 6][0], pts[(k + 1) % 6][1], top)
}
export const PIXEL_PROPS = {
  // a cluster of basalt columns
  column(pc, v) {
    const cols = [[9, 15, 5, 6], [18, 12, 5, 9], [14, 22, 4.6, 4], [23, 21, 4, 3], [6, 24, 3.6, 2]]
    for (const [x, y, r, h] of cols.slice(0, 3 + v)) hexagon(pc, x, y - h, r, P.rk2, P.rk1, h)
    pc.outline()
  },
  // a boulder
  boulder(pc, v) {
    pc.ellipse(10, 9, 8.5 - v, 7.5, P.rk1)
    pc.ellipseOn(8.5, 7, 5, 3.6, P.rk2)
    pc.ellipseOn(11.5, 13, 7, 2, P.rk0)
    pc.outline()
  },
  // a cooled lava bubble, burst: a low mound round a dark hollow
  dome(pc, v) {
    pc.ellipse(12, 11, 10 - (v % 2), 9, P.rk1)
    pc.ellipseOn(10, 8.5, 6, 4.5, P.rk2)
    pc.ellipse(12.5, 11.5, 4, 3.4, P.rk0)
    pc.outline()
  },
  // a fan of obsidian blades
  shard(pc, v) {
    pc.tri(3, 15, 6, 1 + v, 9, 15, P.glass1)
    pc.line(6, 2 + v, 5, 13, P.glass2)
    pc.tri(8, 15, 12, 5 + v, 14, 15, P.glass1)
    pc.line(12, 6 + v, 11, 14, P.glass2)
    pc.outline()
  },
  // a spatter cone, upright, with a dark mouth
  cone(pc, v) {
    pc.tri(1, 17, 7, 1 + v, 13, 17, P.rk1)
    pc.tri(1, 17, 7, 1 + v, 6, 17, P.rk2)
    pc.rect(6, 2 + v, 2, 2, P.rk0)
    pc.outline()
  },
  // a pebble pile
  pebbles(pc, v) {
    for (let k = 0; k < 4; k++) {
      const x = 2.5 + hash(k, v, 5) * 6, y = 2.5 + hash(k, v, 6) * 4
      pc.ellipse(x, y, 1.8, 1.5, k % 2 ? P.rk1 : P.rk2)
    }
    pc.outline()
  },
}
export const PROP_ART = { column: [30, 30], boulder: [20, 17], dome: [24, 22], shard: [16, 17], cone: [14, 19], pebbles: [11, 9] }
// what render.js's floor scatter places: name -> T key 'px_<prop><variant>' (baked by bakeProps).
// size = target on-screen px (render.js fits each baked texture to it).
export const BIOME = {
  big: [{ name: 'px_column0', baked: true, size: [52, 70] }, { name: 'px_dome0', baked: true, size: [40, 54] }, { name: 'px_column2', baked: true, size: [56, 72] }],
  mid: [
    { name: 'px_shard0', baked: true, size: [32, 42] },
    { name: 'px_boulder0', baked: true, size: [28, 36] },
    { name: 'px_cone0', baked: true, size: [26, 36] },
    { name: 'px_boulder1', baked: true, size: [24, 30] },
  ],
  detail: [{ name: 'px_pebbles0', baked: true, size: [16, 22] }, { name: 'px_pebbles1', baked: true, size: [14, 20] }],
}

// ---- the crust ----------------------------------------------------------------------------------------
// A crack's whole life, one sprite at a time, each stage a different KIND of mark so they never blur,
// and in the order of their danger:
//   fresh   a black starburst in the plate, a red thread glowing down every arm  (it will open)
//   warming the arms fill orange from the heart out, the heart swells
//   hot     wide and white-hot at the heart — the tell for whoever stands on it
//   OPEN    a flat pool of bright lava ringed by broken black crust              (it burns)
//   cooling a DEAD scab: a flat dark pad flecked with grey ash, no glow at all, fading into the floor
// The ladle's slag is none of these: a dark glassy splat with little flames dancing on it.
export const CRACK_ART = 48, LAVA_ART = 40, PUDDLE_ART = 34
function crackArms(v) {
  // the fissure's shape, shared by every stage of one variant so it only heats, never jumps
  const c = CRACK_ART / 2, pts = []
  const arms = 5
  for (let arm = 0; arm < arms; arm++) {
    let a = (arm / arms) * TAU + hash(v, arm, 31) * 0.9
    let x = c, y = c
    const n = 12 + Math.floor(hash(v, arm, 33) * 7)
    for (let i = 0; i < n; i++) {
      a += (hash(v, arm * 16 + i, 37) - 0.5) * 0.9
      x += Math.cos(a); y += Math.sin(a)
      pts.push([x, y, i / n])
    }
  }
  return pts
}
// stage 0 fresh, 1 warming, 2 hot
export function paintCrack(pc, v, stage) {
  const c = CRACK_ART / 2
  const pts = crackArms(v)
  const fill = [0.75, 0.9, 1][stage]
  const core = [P.lava1, P.lava2, P.lava3][stage], hot = [P.lava2, P.lava4, P.lava5][stage]
  // the fissure: two pixels wide all along, three near the heart
  for (const [x, y, k] of pts) {
    pc.set(x, y, P.ink); pc.set(x + 1, y, P.ink); pc.set(x, y + 1, P.ink); pc.set(x + 1, y + 1, P.ink)
    if (k < 0.35 + stage * 0.15) { pc.set(x - 1, y, P.ink); pc.set(x, y - 1, P.ink) }
  }
  // the glowing thread inside it
  for (const [x, y, k] of pts) {
    if (k < fill) pc.set(x, y, core)
    if (k < 0.2 + stage * 0.25) { pc.set(x + 1, y, core); pc.set(x, y + 1, k < 0.15 + stage * 0.1 ? hot : core) }
  }
  const hr = [2, 2.8, 3.8][stage]
  pc.ellipse(c, c, hr + 1, hr + 1, P.ink)
  pc.ellipse(c, c, hr, hr, core)
  pc.ellipse(c, c, Math.max(0.8, hr - 1.2), Math.max(0.8, hr - 1.2), hot)
}
// the pool's edge: a wobbly circle, shared by the lava and the scab it cools into
function poolEdge(v, a, R, n) {
  return R - 1.6 * (0.5 + 0.5 * Math.sin(a * 3 + v * 1.7)) - 1.0 * (0.5 + 0.5 * Math.sin(a * 5 + v * 2.9)) - n
}
export function paintLava(pc, v, f) {
  const c = LAVA_ART / 2, R = c - 1.5
  for (let y = 0; y < LAVA_ART; y++) for (let x = 0; x < LAVA_ART; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c
    const a = Math.atan2(dy, dx), d = Math.hypot(dx, dy)
    const edge = poolEdge(v, a, R, 0)
    if (d > edge) continue
    const k = d / edge
    if (k > 0.9) { pc.set(x, y, P.scab0); continue }   // a lip of black crust
    if (k > 0.8) { pc.set(x, y, P.lava1); continue }
    // flat molten orange, with slow swirls of brighter lava drifting round it: smooth bands, no grain
    const sw = Math.sin(a * 2 + d * 0.3 - f * 0.9 + v) + Math.sin(a * 3 - d * 0.24 + f * 0.6 + v * 2.1)
    let col = k > 0.66 ? P.lava2 : P.lava3
    if (sw > 1.1 && k < 0.74) col = P.lava4
    if (k < 0.3 && sw > 0.4) col = P.lava4
    pc.set(x, y, col)
  }
  pc.outline(P.ink)
}
// cooled: a flat dark pad, a dull grey lip, a scatter of ash flecks. Nothing in it is hot.
export function paintCool(pc, v) {
  const c = LAVA_ART / 2, R = c - 1.5
  for (let y = 0; y < LAVA_ART; y++) for (let x = 0; x < LAVA_ART; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c
    const a = Math.atan2(dy, dx), d = Math.hypot(dx, dy)
    const edge = poolEdge(v, a, R, hash(x >> 1, y >> 1, v) * 0.8)
    if (d > edge) continue
    let col = d / edge > 0.86 ? P.scab0 : P.scab1
    if (d / edge > 0.72 && d / edge <= 0.86 && hash(x >> 1, y >> 1, v + 7) < 0.3) col = P.ash
    else if (d / edge <= 0.72 && hash(x, y, v + 11) < 0.04) col = P.ash
    pc.set(x, y, col)
  }
}
// The ladle's slag: a splat of dark, glassy slag (a round body thrown out into droplets, one cold
// glint) with small flames dancing on it, f = 0..2 the flicker. Its fire is the only hot thing in it,
// and it is FLAME — upright tongues — never a glowing seam: open lava is a solid orange pool, a crack
// a black starburst, a cooled scab a dead dark pad.
export function paintPuddle(pc, v, f = 0) {
  const c = PUDDLE_ART / 2
  const R = c - 6
  const blobs = [[c, c, R, R * 0.86]]
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + hash(k, v, 93) * 0.9, r = R * (0.8 + hash(k, v, 94) * 0.45)
    const sz = 1.2 + hash(k, v, 95) * 1.6
    blobs.push([c + Math.cos(a) * r, c + Math.sin(a) * r * 0.9, sz, sz])
  }
  for (const [x, y, rx, ry] of blobs) pc.ellipse(x, y, rx, ry, P.slag1)
  pc.ellipseOn(c + 1, c + 1.5, R - 1.5, R * 0.86 - 1.5, P.slag0)
  pc.ellipseOn(c - 2.5, c - 2.5, 3, 1.4, P.slag2)
  pc.outline(P.ink)
  // the flames: a few tongues standing on the slag, each flickering on its own beat
  for (let k = 0; k < 4; k++) {
    const a = hash(k, v, 97) * TAU, r = (k === 0 ? 0.15 : 0.55) * R
    const fx = Math.round(c + Math.cos(a) * r), fy = Math.round(c + Math.sin(a) * r * 0.8) + 2
    const ph = (f + k) % 3
    const h = 3 + ph + (k === 0 ? 1 : 0)
    pc.rect(fx - 1, fy - 1, 3, 2, P.lava1)                 // the base
    for (let j = 0; j < h; j++) {
      const y = fy - 1 - j, sway = ph === 1 && j > h / 2 ? 1 : ph === 2 && j > h / 2 ? -1 : 0
      pc.set(fx + sway, y, j < h * 0.4 ? P.lava2 : j < h * 0.75 ? P.lava3 : P.lava4)
      if (j < h * 0.5) pc.set(fx + sway - 1, y, P.lava2)
      if (j < h * 0.35) pc.set(fx + sway + 1, y, P.lava2)
    }
  }
}

// ---- shots, lobs and sparks -----------------------------------------------------------------------
export const SHOT_PAINTERS = {
  // a dagger of black glass, its upper edge catching light
  obsidian: [13, 7, (pc) => {
    pc.tri(0, 3.5, 12, 1.5, 12, 5.5, P.glass1)
    pc.tri(2, 3.5, 12, 1.5, 12, 3.5, P.glass2)
    pc.line(5, 2.6, 12, 2, P.glassHi)
    pc.outline()
  }],
  splinter: [7, 4, (pc) => { pc.rect(0, 1, 5, 2, P.glass2); pc.line(1, 1, 5, 1, P.glassHi); pc.outline() }],
  ember: [5, 5, (pc) => { pc.rect(1, 1, 3, 3, P.lava3); pc.set(2, 2, P.lava5); pc.outline(P.lava0) }],
  // a ladle-load of slag in flight: still molten, it greys as it lands
  slag: [9, 9, (pc) => {
    pc.ellipse(4.5, 4.5, 3.4, 3.2, P.lava2)
    pc.ellipseOn(3.8, 3.8, 1.8, 1.6, P.lava4)
    pc.outline(P.lava0); pc.outline()
  }],
  // a volcanic bomb: a dark rock with its molten heart showing through three cracks
  bomb: [17, 17, (pc) => {
    pc.ellipse(8.5, 8.5, 7, 6.6, P.rk1)
    pc.ellipseOn(7, 6.6, 3.6, 2.6, P.rk2)
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.4
      pc.line(8.5, 8.5, 8.5 + Math.cos(a) * 5.5, 8.5 + Math.sin(a) * 5.5, P.lava3)
    }
    pc.ellipse(8.5, 8.5, 1.4, 1.4, P.lava4)
    pc.outline()
  }],
  shadow: [14, 7, (pc) => { pc.ellipse(7, 3.5, 6.4, 3, 'rgba(0,0,0,0.5)') }],
  // the bellows' blast: a ripple of hot air, two short wavy strokes
  puff: [10, 7, (pc) => {
    for (let x = 0; x < 9; x++) {
      pc.set(x, 2 + Math.round(Math.sin(x * 0.9)), x < 5 ? P.heat1 : P.heat0)
      pc.set(x + 1, 5 + Math.round(Math.sin(x * 0.9 + 1.5)) - 1, P.heat0)
    }
  }],
  flare: [21, 21, (pc) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU, l = k % 2 ? 9.5 : 6.5
      pc.line(10, 10, 10 + Math.cos(a) * l, 10 + Math.sin(a) * l, k % 2 ? P.lava3 : P.lava2)
    }
    pc.ellipse(10, 10, 3.6, 3.6, P.lava4); pc.ellipse(10, 10, 1.6, 1.6, P.lava5)
  }],
  spark: [1, 1, (pc) => { pc.set(0, 0, PAL.white) }],
}
// an XP gem: a cut cyan crystal (it throws its own cold light, see the rig)
export function paintGem(pc) {
  pc.tri(3.5, 0, 0, 4, 7, 4, P.gem)
  pc.tri(0, 4, 7, 4, 3.5, 10, P.gemMid)
  pc.tri(3.5, 4, 7, 4, 3.5, 10, P.gemLo)
  pc.line(3, 1, 1, 4, P.gemHi)
  pc.set(3, 1, P.white)
  pc.outline()
}
export const GEM_ART = [8, 11]
export function paintCoin(pc) {
  pc.ellipse(4.5, 4.5, 4, 4, P.coin)
  pc.ellipseOn(5, 5, 3, 3, P.coinLo)
  pc.ellipseOn(4.2, 4.2, 2.6, 2.6, P.coin)
  pc.set(3, 3, P.coinHi); pc.set(4, 3, P.coinHi); pc.set(3, 4, P.coinHi)
  pc.outline(P.coinDeep); pc.outline()
}
export const COIN_ART = [11, 11]
