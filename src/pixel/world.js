// The Magma's world, painted one art pixel at a time: the basalt floor, the props, the crust (fresh
// crack -> warming -> hot -> open lava -> crusting over), slag puddles, every shot, and the pickups.
// All ALBEDO: the CRT pass (src/pixel/crt.js) lights it, and lights anything painted hot by itself.
import { PAL, PixelCanvas, hash, TAU } from './canvas.js'

const P = PAL

// ---- the floor: plates of basalt split by dark joints --------------------------------------------
export const TILE_ART = 240   // art px per side of the seamless floor tile
export function paintFloorTile() {
  const N = TILE_ART
  const pc = new PixelCanvas(N, N)
  const seeds = []
  for (let k = 0; k < 150; k++) seeds.push([hash(k, 1, 71) * N, hash(k, 2, 71) * N])
  const wrap = (d) => (d > N / 2 ? d - N : d < -N / 2 ? d + N : d)
  const own = new Int16Array(N * N), own2 = new Int16Array(N * N), gap = new Uint8Array(N * N), dist = new Float32Array(N * N)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let d1 = 1e9, d2 = 1e9, k1 = 0, k2 = 0
    for (let k = 0; k < seeds.length; k++) {
      const dx = wrap(x + 0.5 - seeds[k][0]), dy = wrap(y + 0.5 - seeds[k][1])
      // a little warp so the joints wander instead of running ruler-straight
      const d = Math.hypot(dx * (1 + 0.15 * Math.sin(y * 0.21 + k)), dy)
      if (d < d1) { d2 = d1; k2 = k1; d1 = d; k1 = k } else if (d < d2) { d2 = d; k2 = k }
    }
    own[y * N + x] = k1; own2[y * N + x] = k2; dist[y * N + x] = d1
    gap[y * N + x] = d2 - d1 < 1.25 ? 1 : 0
  }
  const G = (x, y) => gap[((y + N) % N) * N + ((x + N) % N)]
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, h = hash(x, y, 7)
    if (gap[i]) { pc.set(x, y, h > 0.9 ? P.rock1 : P.rock0); continue }
    const k = own[i]
    const tone = hash(k, 9, 3)
    let c = tone < 0.4 ? P.rock2 : tone < 0.85 ? P.rock3 : P.rock4
    // each plate is a low dome: its middle a touch lighter
    if (dist[i] < 2.5 && tone > 0.55 && hash(x, y, 2) > 0.3) c = tone < 0.85 ? P.rock4 : P.rock5
    // lit lip on the upper-left of every plate, shadow on its lower-right
    if (G(x - 1, y - 1) || G(x, y - 1)) c = tone < 0.4 ? P.rock4 : P.rock5
    else if (G(x + 1, y + 1) || G(x, y + 1)) c = P.rock1
    // grit
    if (h > 0.975) c = P.rock1
    else if (h < 0.015) c = P.rock5
    pc.set(x, y, c)
  }
  // obsidian flecks in the basalt: single glints that catch any light, even the cave's own
  for (let k = 0; k < 30; k++) {
    const x = Math.floor(hash(k, 3, 91) * N), y = Math.floor(hash(k, 4, 91) * N)
    if (gap[y * N + x]) continue
    pc.set(x, y, k % 3 ? P.glassHi : P.glassWhite)
    pc.set(x + 1, y + 1, P.glass1)
  }
  // a few cold, dark veins: old seams that crusted over long ago (never confused with a live crack)
  for (let k = 0; k < 14; k++) {
    let x = hash(k, 5, 11) * N, y = hash(k, 6, 11) * N
    let a = hash(k, 7, 11) * TAU
    const len = 14 + Math.floor(hash(k, 8, 11) * 20)
    for (let i = 0; i < len; i++) {
      pc.set((Math.round(x) + N) % N, (Math.round(y) + N) % N, P.vein)
      a += (hash(k, i, 17) - 0.5) * 1.3
      x += Math.cos(a); y += Math.sin(a)
    }
  }
  // magma far below, glimpsed along a few joints: faint lines that follow the plates, never the
  // bright star a live crack makes
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x
    if (!gap[i]) continue
    const a = Math.min(own[i], own2[i]), b = Math.max(own[i], own2[i])
    if (hash(a, b, 23) < 0.07) pc.set(x, y, hash(x, y, 29) > 0.9 ? P.lava1 : P.lava0)
  }
  return pc
}

// ---- floor props ------------------------------------------------------------------------------------
function hexagon(pc, cx, cy, r, top, side, edge, hgt) {
  // a basalt column seen from above and a little in front: lit hexagonal top, its front face below
  const pts = []
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8]) }
  for (let k = 0; k < 6; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % 6]
    if (ay >= cy - 0.1 || by >= cy - 0.1) {   // the near half drops a face
      pc.tri(ax, ay, bx, by, bx, by + hgt, side); pc.tri(ax, ay, bx, by + hgt, ax, ay + hgt, side)
    }
  }
  for (let k = 0; k < 6; k++) pc.tri(cx, cy, pts[k][0], pts[k][1], pts[(k + 1) % 6][0], pts[(k + 1) % 6][1], top)
  for (let k = 0; k < 6; k++) pc.line(pts[k][0], pts[k][1], pts[(k + 1) % 6][0], pts[(k + 1) % 6][1], edge)
}
function crackNet(pc, cx, cy, r, v, cols, arms = 4, len = 0.9) {
  for (let arm = 0; arm < arms; arm++) {
    let a = (arm / arms) * TAU + hash(v, arm, 31) * 1.3
    let x = cx, y = cy
    const n = Math.round(r * len)
    for (let i = 0; i < n; i++) {
      a += (hash(v, arm * 16 + i, 37) - 0.5) * 1.1
      x += Math.cos(a); y += Math.sin(a)
      if (pc.get(Math.floor(x), Math.floor(y))) pc.set(x, y, i < n * 0.4 ? cols[0] : cols[1])
    }
  }
}
export const PIXEL_PROPS = {
  // a cluster of basalt columns
  column(pc, v) {
    const cols = [[9, 15, 5, 6], [18, 12, 5, 9], [14, 22, 4.6, 4], [23, 21, 4, 3], [6, 24, 3.6, 2]]
    for (const [x, y, r, h] of cols.slice(0, 3 + v)) {
      const top = hash(x, y, v) > 0.5 ? P.rockCoolHi : P.rockCool
      hexagon(pc, x, y - h, r, top, P.rock3, P.rock5, h)
      pc.set(x - 1, y - h - 1, P.ashHi)
    }
    pc.outline()
  },
  // a cooled lava bubble, still molten inside its cracks
  dome(pc, v) {
    pc.ellipse(12, 11, 10 - v % 2, 9, P.rock2)
    pc.ellipseOn(11, 9.5, 8, 6.5, P.rock3)
    pc.ellipseOn(9.5, 7.5, 4, 3, P.rock4)
    // veins that wander over the surface (no bright heart: that is a live crack's mark, not a rock's)
    for (let k = 0; k < 4; k++) {
      let x = 4 + hash(k, v, 61) * 16, y = 4 + hash(k, v, 62) * 14, a = hash(k, v, 63) * TAU
      for (let i = 0; i < 9; i++) {
        if (pc.get(Math.floor(x), Math.floor(y))) pc.set(x, y, i % 4 === 1 ? P.lava2 : P.lava1)
        a += (hash(k, i + v, 64) - 0.5) * 1.2; x += Math.cos(a); y += Math.sin(a)
      }
    }
    pc.outline()
  },
  // a fumarole: a ring of spatter round a glowing throat
  vent(pc, v) {
    pc.ellipse(8, 7.5, 7, 6, P.rock3)
    pc.ellipseOn(7, 6, 5, 3.6, P.rock4)
    pc.ellipse(8, 8, 3.4, 2.8, P.ink)
    pc.ellipse(8, 8.4, 2.4, 1.8, P.lava1)
    pc.ellipse(8, 8.6, 1.4, 1, v % 2 ? P.lava4 : P.lava3)
    pc.outline()
  },
  // a fan of obsidian blades, catching light on their edges
  shard(pc, v) {
    pc.tri(3, 15, 6, 1 + v, 9, 15, P.glass1)
    pc.line(6, 2 + v, 5, 13, P.glass3)
    pc.set(6, 2 + v, P.glassWhite)
    pc.tri(8, 15, 12, 5 + v, 14, 15, P.glass2)
    pc.line(12, 6 + v, 11, 14, P.glassHi)
    pc.tri(1, 15, 2, 9, 5, 15, P.glass0)
    pc.outline()
  },
  // a spatter cone, veined with heat (upright)
  cone(pc, v) {
    pc.tri(1, 17, 7, 1 + v, 13, 17, P.rock3)
    pc.tri(1, 17, 7, 1 + v, 6, 17, P.rock4)
    crackNet(pc, 7, 13, 6, v + 11, [P.lava2, P.lava1], 3, 1.2)
    pc.set(7, 2 + v, P.lava3)
    pc.outline()
  },
  // a pebble pile
  pebbles(pc, v) {
    for (let k = 0; k < 5; k++) {
      const x = 2.5 + hash(k, v, 5) * 6, y = 2.5 + hash(k, v, 6) * 4
      pc.ellipse(x, y, 1.8, 1.5, hash(k, v, 7) > 0.5 ? P.rock5 : P.rock4)
      pc.set(x - 0.5, y - 0.8, P.ashHi)
    }
    pc.outline()
  },
}
export const PROP_ART = { column: [30, 30], dome: [24, 22], vent: [16, 15], shard: [16, 17], cone: [14, 19], pebbles: [11, 9] }
// what render.js's floor scatter places: name -> T key 'px_<prop><variant>' (baked by bakeProps).
// size = target on-screen px (render.js fits each baked texture to it).
export const BIOME = {
  big: [{ name: 'px_column0', baked: true, size: [52, 70] }, { name: 'px_dome0', baked: true, size: [40, 54] }, { name: 'px_column2', baked: true, size: [56, 72] }],
  mid: [
    { name: 'px_shard0', baked: true, size: [32, 42] },
    { name: 'px_vent1', baked: true, size: [28, 34] },
    { name: 'px_cone0', baked: true, size: [26, 36] },
    { name: 'px_dome1', baked: true, size: [28, 36] },
  ],
  detail: [{ name: 'px_pebbles0', baked: true, size: [16, 22] }, { name: 'px_pebbles1', baked: true, size: [14, 20] }, { name: 'px_vent0', baked: true, size: [14, 18] }],
}

// ---- the crust ----------------------------------------------------------------------------------------
// a crack's whole life, one sprite at a time: fresh (dark fissure, faint red), warming (orange), hot
// (white-hot and widening — the tell for whoever stands on it), OPEN (a hole of churning lava, its rim
// broken crust), COOLING (a black scab with dying red veins).
export const CRACK_ART = 40, LAVA_ART = 40, PUDDLE_ART = 30
function crackArms(v) {
  // the fissure's shape, shared by every stage of one variant so it only heats, never jumps
  const c = CRACK_ART / 2, pts = []
  const arms = 5
  for (let arm = 0; arm < arms; arm++) {
    let a = (arm / arms) * TAU + hash(v, arm, 31) * 0.9
    let x = c, y = c
    const n = 13 + Math.floor(hash(v, arm, 33) * 6)
    for (let i = 0; i < n; i++) {
      a += (hash(v, arm * 16 + i, 37) - 0.5) * 1.0
      x += Math.cos(a); y += Math.sin(a)
      pts.push([x, y, i / n, arm])
      // a side branch off the middle of each arm
      if (i === Math.floor(n * 0.45)) {
        let bx = x, by = y, ba = a + (hash(v, arm, 39) > 0.5 ? 0.9 : -0.9)
        for (let j = 0; j < 5; j++) { ba += (hash(v, arm * 7 + j, 41) - 0.5) * 0.8; bx += Math.cos(ba); by += Math.sin(ba); pts.push([bx, by, 0.6 + j * 0.08, arm]) }
      }
    }
  }
  return pts
}
// stage 0 fresh, 1 warming, 2 hot
export function paintCrack(pc, v, stage) {
  const c = CRACK_ART / 2
  const pts = crackArms(v)
  const core = [P.lava2, P.lava3, P.lava4][stage], hot = [P.lava3, P.lava4, P.lava5][stage]
  // the crust heaves up round the fissure: a lit lip on one side, a dark edge on the other
  for (const [x, y, k] of pts) {
    if (k > 0.85) continue
    pc.set(x - 1, y - 1, stage === 2 ? P.rock5 : P.rock4)
    pc.set(x + 1, y + 1, P.rock0)
  }
  for (const [x, y, k] of pts) {
    pc.set(x, y, P.ink)
    pc.set(x + 1, y, P.ink)
    if (k < 0.6 + stage * 0.2) pc.set(x, y, core)
    // wide near the heart, and wider the hotter it gets
    if (k < 0.4 + stage * 0.2) { pc.set(x + 1, y, core); pc.set(x, y + 1, k < 0.2 ? hot : core) }
  }
  // the heart of the crack
  const hr = 1.2 + stage * 0.9
  pc.ellipse(c, c, hr + 1, hr + 1, P.ink)
  pc.ellipse(c, c, hr, hr, core)
  pc.ellipse(c - 0.3, c - 0.3, Math.max(0.6, hr - 1), Math.max(0.6, hr - 1), hot)
}
export function paintLava(pc, v, f) {
  const c = LAVA_ART / 2, R = c - 1.5
  const cells = []
  for (let k = 0; k < 22; k++) {
    const a = hash(k, v, 51) * TAU, d = Math.sqrt(hash(k, v, 52)) * R
    // the cells churn: each frame they drift round the pool's centre
    const turn = f * 0.35 * (hash(k, v, 53) > 0.5 ? 1 : -1)
    cells.push([c + Math.cos(a + turn) * d, c + Math.sin(a + turn) * d])
  }
  for (let y = 0; y < LAVA_ART; y++) for (let x = 0; x < LAVA_ART; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c
    const a = Math.atan2(dy, dx)
    const edge = R - 1.8 * (0.5 + 0.5 * Math.sin(a * 3 + v * 1.7)) - 1.1 * (0.5 + 0.5 * Math.sin(a * 7 + v * 2.9)) - hash(x, y, v) * 0.6
    const d = Math.hypot(dx, dy)
    if (d > edge) continue
    const k = d / edge
    // the rim: broken crust tipping into the hole
    if (k > 0.86) { pc.set(x, y, hash(x >> 1, y >> 1, v + 17) > 0.45 ? P.rock3 : P.lava0); continue }
    if (k > 0.78) { pc.set(x, y, P.lava0); continue }
    let d1 = 1e9, d2 = 1e9
    for (const [sx, sy] of cells) { const e = Math.hypot(x + 0.5 - sx, y + 0.5 - sy); if (e < d1) { d2 = d1; d1 = e } else if (e < d2) d2 = e }
    const seam = d2 - d1 < 1.5
    const bub = hash(x + f * 7, y - f * 5, v + 41)
    let col
    if (seam) col = k < 0.35 ? P.lava5 : k < 0.7 ? P.lava4 : P.lava3
    else col = k < 0.25 ? P.lava3 : k < 0.65 ? P.lava2 : P.lava1
    if (!seam && bub > 0.95) col = P.lava4
    pc.set(x, y, col)
  }
  pc.outline(P.ink)
}
export function paintCool(pc, v) {
  const c = LAVA_ART / 2
  for (let y = 0; y < LAVA_ART; y++) for (let x = 0; x < LAVA_ART; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c
    const a = Math.atan2(dy, dx)
    const edge = c - 2 - 1.6 * (0.5 + 0.5 * Math.sin(a * 3 + v * 1.7)) - hash(x, y, v + 3) * 0.8
    const d = Math.hypot(dx, dy)
    if (d > edge) continue
    const h = hash(x, y, v + 61)
    pc.set(x, y, h > 0.6 ? P.cool1 : h > 0.15 ? P.cool0 : P.cool2)
  }
  crackNet(pc, c, c, c - 3, v + 21, [P.lava1, P.lava0], 6, 0.9)
  pc.outline(P.ink)
}
// a ladle's slag: a blob of molten waste already skinning over — dark slag plates floating on
// glowing channels (the reverse of open crust lava, which is bright all through)
export function paintPuddle(pc, v) {
  const c = PUDDLE_ART / 2
  const plates = []
  for (let k = 0; k < 9; k++) {
    const a = hash(k, v, 85) * TAU, d = Math.sqrt(hash(k, v, 86)) * (c - 3)
    plates.push([c + Math.cos(a) * d, c + Math.sin(a) * d])
  }
  for (let y = 0; y < PUDDLE_ART; y++) for (let x = 0; x < PUDDLE_ART; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c
    const a = Math.atan2(dy, dx)
    const edge = c - 1.5 - 1.6 * (0.5 + 0.5 * Math.sin(a * 3 + v * 2.3)) - 1.1 * (0.5 + 0.5 * Math.sin(a * 5 + v * 4.1))
    const d = Math.hypot(dx, dy)
    if (d > edge) continue
    let d1 = 1e9, d2 = 1e9
    for (const [sx, sy] of plates) { const e = Math.hypot(x + 0.5 - sx, y + 0.5 - sy); if (e < d1) { d2 = d1; d1 = e } else if (e < d2) d2 = e }
    const ch = d2 - d1
    let col
    if (ch < 1.3) col = ch < 0.6 ? P.lava4 : P.lava3             // the molten channel
    else if (ch < 2.2) col = P.lava1                              // the plate's hot edge
    else col = (x + y) % 5 === 0 ? P.cool2 : d1 < 2 ? P.lava0 : P.cool1   // the skin of slag
    if (d > edge - 1.2) col = P.lava2                             // the blob's molten lip
    pc.set(x, y, col)
  }
  pc.outline(P.ink)
}

// ---- shots, lobs and sparks -----------------------------------------------------------------------
export const SHOT_PAINTERS = {
  // a dagger of black glass, its edge catching light, a white glint at the point
  obsidian: [13, 7, (pc) => {
    pc.tri(0, 3.5, 12, 1.5, 12, 5.5, P.glass1)
    pc.tri(3, 3.5, 12, 1.5, 12, 3.5, P.glass2)
    pc.line(4, 3, 11, 2, P.glassHi)
    pc.set(12, 3, P.glassWhite); pc.set(11, 3, P.glassWhite)
    pc.outline()
  }],
  splinter: [7, 4, (pc) => { pc.rect(0, 1, 5, 2, P.glass2); pc.line(1, 1, 5, 1, P.glassHi); pc.set(5, 1, P.glassWhite); pc.outline() }],
  ember: [5, 5, (pc) => { pc.rect(1, 1, 3, 3, P.lava3); pc.set(2, 2, P.lava5); pc.set(1, 1, P.lava4); pc.outline(P.lava0) }],
  // a ladle-load of slag in flight: molten ball with a dripping tail
  slag: [11, 11, (pc) => {
    pc.ellipse(5.5, 5.5, 4, 3.8, P.lava2)
    pc.ellipseOn(4.8, 4.8, 2.6, 2.4, P.lava3)
    pc.ellipseOn(4.2, 4.2, 1.3, 1.2, P.lava5)
    pc.set(8, 8, P.lava1); pc.set(7, 9, P.lava1)
    pc.outline(P.lava0); pc.outline(P.ink)
  }],
  // a volcanic bomb: a crusted rock with its molten heart showing through the cracks
  bomb: [17, 17, (pc) => {
    pc.ellipse(8.5, 8.5, 7, 6.6, P.rock2)
    pc.ellipseOn(7.6, 7.4, 5.4, 4.6, P.rock3)
    pc.ellipseOn(6.2, 5.8, 2.4, 1.8, P.rock5)
    crackNet(pc, 8.5, 8.5, 7, 5, [P.lava4, P.lava2], 5, 1)
    pc.ellipse(8.5, 8.5, 1.4, 1.4, P.lava5)
    pc.outline()
  }],
  shadow: [14, 7, (pc) => { pc.ellipse(7, 3.5, 6.4, 3, 'rgba(0,0,0,0.5)') }],
  // the bellows' blast: a curl of shimmering hot air
  puff: [12, 12, (pc) => {
    for (let i = 0; i < 22; i++) {
      const a = i * 0.38, r = 0.8 + i * 0.24
      const c = i < 7 ? P.heat2 : i < 15 ? P.heat1 : P.heat0
      pc.set(6 + Math.cos(a) * r, 6 + Math.sin(a) * r, c)
      pc.set(6 + Math.cos(a) * (r + 0.9), 6 + Math.sin(a) * (r + 0.9), c)
    }
    pc.rect(5, 5, 2, 2, P.heat2)
  }],
  flare: [21, 21, (pc) => {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU, l = k % 2 ? 9.5 : 6.5
      pc.line(10, 10, 10 + Math.cos(a) * l, 10 + Math.sin(a) * l, k % 2 ? P.lava3 : P.lava2)
    }
    pc.ellipse(10, 10, 4, 4, P.lava3); pc.ellipse(10, 10, 2.6, 2.6, P.lava4); pc.ellipse(10, 10, 1.3, 1.3, P.lava5)
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
