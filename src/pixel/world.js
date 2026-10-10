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
// The ladle's slag is none of these: a SPLASH of molten slag thrown flat on the floor — a body with
// streaks flung out from where it hit, ending in droplets — that cools from hot orange through dull
// red to dark glassy slag.
export const CRACK_ART = 48, LAVA_ART = 40, PUDDLE_ART = 48
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
// The ladle's slag, splashed on the floor. stage 0 molten, 1 crusting (dull red under a dark skin),
// 2 cold (dark glassy slag, one glint, nothing hot). The SHAPE is a splash, whatever the stage: an
// irregular body where the load hit, tapering streaks flung outward, a droplet at the end of each and
// a few loose ones — never round like an open pool, never a flat pad like a cooled crack.
const SPLASH = [
  { body: ['lava2', 'lava0', 'slag0'], core: ['lava3', 'lava1', 'glass0'], hi: ['lava4', 'lava1', 'glassHi'], skin: [null, 'scab1', 'glass1'] },
]
function splashShape(v) {
  const c = PUDDLE_ART / 2, R = c - 14
  const rot = hash(v, 0, 91) * TAU
  const streaks = []
  const n = 6 + (v % 2)
  for (let k = 0; k < n; k++) {
    const a = rot + (k / n) * TAU + (hash(k, v, 93) - 0.5) * 0.7
    const len = R * (1.05 + hash(k, v, 94) * 0.55)
    streaks.push({ a, len, w: 1.6 + hash(k, v, 95) * 1.2, drop: 1 + hash(k, v, 96) * 1.1 })
  }
  const loose = []
  for (let k = 0; k < 4; k++) {
    const a = rot + hash(k, v, 98) * TAU, r = R * (1.9 + hash(k, v, 99) * 0.5)
    loose.push([c + Math.cos(a) * r, c + Math.sin(a) * r * 0.9])
  }
  return { c, R, rot, streaks, loose }
}
export function paintPuddle(pc, v, stage = 0) {
  const { c, R, rot, streaks, loose } = splashShape(v)
  const P0 = SPLASH[0]
  const body = P[P0.body[stage]], core = P[P0.core[stage]], hi = P[P0.hi[stage]], skin = P0.skin[stage] && P[P0.skin[stage]]
  // the body where it hit: a lumpy blob
  pc.ellipse(c, c, R, R * 0.8, body)
  for (let k = 0; k < 3; k++) {
    const a = rot + k * 2.1
    pc.ellipse(c + Math.cos(a) * R * 0.45, c + Math.sin(a) * R * 0.4, R * 0.62, R * 0.5, body)
  }
  // the streaks, thinning outward, a droplet at each tip
  for (const st of streaks) {
    const steps = Math.ceil(st.len)
    for (let i = 0; i <= steps; i++) {
      const u = i / steps, d = R * 0.6 + (st.len - R * 0.6) * u
      const w = Math.max(0.5, st.w * (1 - u * 0.8))
      pc.ellipse(c + Math.cos(st.a) * d, c + Math.sin(st.a) * d * 0.9, w, w, body)
    }
    const tx = c + Math.cos(st.a) * (st.len + st.drop + 1), ty = c + Math.sin(st.a) * (st.len + st.drop + 1) * 0.9
    pc.ellipse(tx, ty, st.drop, st.drop, body)
  }
  for (const [x, y] of loose) pc.ellipse(x, y, 0.9, 0.9, body)
  // where it is thickest it stays hottest (molten) or glassiest (cold)
  pc.ellipseOn(c - 0.5, c - 0.5, R * 0.62, R * 0.48, core)
  if (stage === 1) {
    // crusting: a dark skin closing over it, the red still showing in the cracks of the skin
    for (let y = 0; y < PUDDLE_ART; y++) for (let x = 0; x < PUDDLE_ART; x++) {
      if (!pc.get(x, y)) continue
      if (hash(x >> 1, y >> 1, v + 41) < 0.55) pc.set(x, y, skin)
    }
  } else if (stage === 2) {
    pc.ellipseOn(c + 1, c + 1, R * 0.5, R * 0.36, skin)
  }
  // the bright spot (molten: the hottest slag; cold: the glassy glint)
  pc.ellipseOn(c - R * 0.3, c - R * 0.3, stage === 2 ? 1.2 : R * 0.3, stage === 2 ? 0.8 : R * 0.22, hi)
  pc.outline(stage === 0 ? P.lava0 : P.ink)
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
  // a volcanic bomb: a lumpy dark rock, its chilled skin split in jagged breadcrust cracks with the
  // molten inside showing through them
  bomb: [17, 17, (pc) => {
    pc.ellipse(8.5, 8.5, 7, 6.4, P.rk1)
    pc.ellipse(10.5, 6.5, 4.4, 3.6, P.rk1)
    pc.ellipseOn(7, 6.4, 3.6, 2.4, P.rk2)
    for (let k = 0; k < 3; k++) {
      let a = (k / 3) * TAU + 0.4, x = 8.5, y = 8.5
      for (let i = 0; i < 6; i++) {
        a += (hash(k, i, 61) - 0.5) * 1.3
        const nx = x + Math.cos(a), ny = y + Math.sin(a)
        if (!pc.get(Math.floor(nx), Math.floor(ny))) break
        pc.set(nx, ny, i < 2 ? P.lava4 : P.lava2)
        x = nx; y = ny
      }
    }
    pc.set(8, 8, P.lava4); pc.set(9, 8, P.lava3); pc.set(8, 9, P.lava3)
    pc.outline()
  }],
  shadow: [14, 7, (pc) => { pc.ellipse(7, 3.5, 6.4, 3, 'rgba(0,0,0,0.5)') }],
  // the bellows' blast is AIR, which you cannot see: what you see is what it carries — ash and
  // cinders swept off the floor and flung along it, a fleck of ash streaked by its speed, a live ember
  puff: [10, 7, (pc) => {
    pc.rect(0, 2, 3, 1, P.ash); pc.set(3, 2, P.ashHi)
    pc.set(5, 5, P.rk2); pc.set(6, 5, P.ash)
    pc.rect(6, 1, 2, 1, P.ash)
    pc.set(8, 3, P.lava3); pc.set(9, 3, P.lava4)
  }],
  // a pool flared by the bellows: the lava GOUTS up and falls back — a heaving molten blob seen from
  // above, with gobs thrown off it and falling round it
  flare: [21, 21, (pc) => {
    pc.ellipse(10.5, 10.5, 5, 4.4, P.lava2)
    pc.ellipse(12, 9, 3, 2.6, P.lava2)
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + hash(k, 0, 71) * 0.8, r = 6.5 + hash(k, 1, 71) * 3
      const sz = 0.8 + hash(k, 2, 71) * 0.9
      pc.ellipse(10.5 + Math.cos(a) * r, 10.5 + Math.sin(a) * r, sz, sz, k % 3 ? P.lava2 : P.lava3)
    }
    pc.ellipseOn(10, 10, 3, 2.6, P.lava3)
    pc.ellipseOn(9.5, 9.5, 1.6, 1.3, P.lava5)
    pc.outline(P.lava0)
  }],
  spark: [1, 1, (pc) => { pc.set(0, 0, PAL.white) }],
}
// an XP gem: a cut cyan crystal (it throws its own small cold light, see the rig). f = 1 is the moment
// a facet catches the light: the whole upper facet flashes pale and a glint pricks out of its corner.
export function paintGem(pc, f = 0) {
  const ox = 2, oy = 2
  pc.tri(ox + 3.5, oy, ox, oy + 4, ox + 7, oy + 4, f ? P.gemHi : P.gem)
  pc.tri(ox, oy + 4, ox + 7, oy + 4, ox + 3.5, oy + 10, P.gemMid)
  pc.tri(ox + 3.5, oy + 4, ox + 7, oy + 4, ox + 3.5, oy + 10, P.gemLo)
  pc.line(ox + 3, oy + 1, ox + 1, oy + 4, P.gemHi)   // the lit edge: near-white, so it reads self-lit
  pc.set(ox + 3, oy + 1, P.white)
  pc.outline()
  if (f) { pc.set(ox + 2, oy - 1, P.white); pc.set(ox + 2, oy - 2, P.white); pc.set(ox + 1, oy - 1, P.gemHi); pc.set(ox + 3, oy - 1, P.gemHi) }
}
export const GEM_ART = [12, 15]
// a gold coin: a bright rim catching the light all round its upper-left edge, a darker face inside;
// f = 1 a glint runs across the rim
export function paintCoin(pc, f = 0) {
  const ox = 2, oy = 2
  pc.ellipse(ox + 4.5, oy + 4.5, 4, 4, P.coin)
  pc.ellipseOn(ox + 5, oy + 5, 3, 3, P.coinLo)
  pc.ellipseOn(ox + 4.4, oy + 4.4, 2.4, 2.4, P.coin)
  for (const [x, y] of [[1, 3], [1, 4], [2, 2], [3, 1], [4, 1]]) pc.set(ox + x, oy + y, P.shine)
  pc.outline(P.coinDeep); pc.outline()
  if (f) { pc.set(ox + 2, oy + 2, P.white); pc.set(ox + 3, oy + 1, P.white); pc.set(ox + 1, oy + 1, P.white); pc.set(ox + 1, oy - 1, P.coinHi); pc.set(ox - 1, oy + 1, P.coinHi) }
}
export const COIN_ART = [15, 15]
