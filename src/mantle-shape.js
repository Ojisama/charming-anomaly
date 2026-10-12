// THE MANTLE'S GROUND SHAPES: the one truth of where a Quench crust and a Crack Hammer pool end.
// Pure and import-free, so sim.js (what is solid) and the renderers (what is drawn: src/toon/mantle-fx.js,
// the floor shader) all read the SAME edge. Neither is a circle.
//   crust c: a SPLASH of water: inside iff crustSdf(c, x, y) <= 0 (px, see crustSplash)
//   pool q:  inside iff dist <= q.r * poolRimR(bearing, q.ph)
// sim.js stamps shape (a seed) and rot (crustShapeOf) and ph (poolPhaseOf) on each one when it is laid; a
// hand-built one without them gets the same values from its position.

export const TAU = Math.PI * 2
export const CRUST_SHAPES = 3        // the encasing-crust atlas's shapes (mantle-fx bakes one row per shape)
export const CRUST_EDGE_MAX = 2.05   // the farthest a crust's splash can reach, crust radii (a droplet off the longest finger: 0.79 * 1.32 + 0.55 + 2 * 0.105 + 0.2)
export const SPLASH_FINGERS = 7, SPLASH_DROPS = 5
export const SPLASH_DROP_V4 = Math.ceil(SPLASH_DROPS * 3 / 4)   // the vec4 uniforms a crust's droplets pack into
export const SPLASH_B0 = 0.72         // the blot's least radius, crust radii
export const SPLASH_WOB = [0.1, 0.07, 0.04]   // the blot's 2nd, 3rd and 5th harmonics, in blot radii
export const SPLASH_K = 0.18         // the fillet where a finger leaves the blot (a smooth union), crust radii
export const CRUST_EAT_T = 1.5       // s: the lava eats a crust back from its rim over its last CRUST_EAT_T s
export const POOL_RIM_MAX = 1.075    // the largest poolRimR can be (0.92 + 0.07 + 0.05 + 0.035)

// a hash in [0, 1) of three integers, well mixed even for small neighbouring inputs
export function rh(a, b, c) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x632be5ab, 0x85ebca77) ^ Math.imul((c | 0) + 0x1b873593, 0xc2b2ae3d)
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15
  return (h >>> 0) / 4294967296
}
// the encasing crust's edge (mantle-fx's atlas, round a stranded creature): radius (in its radii) at
// angle a, lobed per shape k
export function crustEdgeR(a, k) {
  const p = k * 2.399
  return 0.93 + 0.075 * Math.sin(2 * a + p) + 0.05 * Math.sin(3 * a + p * 1.7 + 1) + 0.03 * Math.sin(5 * a + p * 2.3 + 2) + 0.02 * Math.sin(8 * a + p * 3.1)
}
// a pool's rim: radius (in pool radii) at angle a, three harmonics with phases ph
export const poolRimR = (a, ph) => 0.92 + 0.07 * Math.sin(3 * a + ph[0]) + 0.05 * Math.sin(5 * a + ph[1]) + 0.035 * Math.sin(7 * a + ph[2])

// a crust laid at (x, y) as ground stamp seq: its splash's seed and how it is turned (never two the same)
export function crustShapeOf(x, y, seq = 0) {
  const sd = Math.floor(rh(Math.floor(x), Math.floor(y), seq | 0) * 2147483647)
  return { shape: sd, rot: rh(sd, 3, 1) * TAU }
}

// A CRUST IS A SPLASH OF WATER: an irregular central blot, SPLASH_FINGERS fingers of varied length
// radiating out of it, and SPLASH_DROPS droplets thrown clear (each one rock too). In crust radii, turned
// by rot, as flat floats (the floor shader takes exactly these as uniforms, src/toon.js packFx):
//   [0..3]   the blot: radius b0 and the phases of its 2nd, 3rd and 5th harmonics
//   then SPLASH_FINGERS fingers: (tip x, tip y, half-width at the root, at the tip), a capsule from the centre
//   then SPLASH_DROPS droplets: (x, y, radius)
export function crustSplash(seed, rot) {
  const u = (i) => rh(seed, i, 7)
  const P = new Array(4 + 4 * SPLASH_FINGERS + 3 * SPLASH_DROPS).fill(0)
  const b0 = SPLASH_B0 + 0.07 * u(1)
  P[0] = b0; P[1] = u(2) * TAU - 2 * rot; P[2] = u(3) * TAU - 3 * rot; P[3] = u(4) * TAU - 5 * rot
  const ang = [], len = []
  for (let i = 0; i < SPLASH_FINGERS; i++) {
    const a = rot + (i + (u(10 + i) - 0.5) * 0.7) * TAU / SPLASH_FINGERS
    const L = b0 * 1.32 + 0.55 * u(20 + i) ** 1.5                   // its reach, centre to tip: most short, a few long
    const w0 = 0.11 + 0.09 * u(30 + i), w1 = w0 * (0.4 + 0.45 * u(40 + i))
    const o = 4 + 4 * i
    P[o] = Math.cos(a) * (L - w1); P[o + 1] = Math.sin(a) * (L - w1); P[o + 2] = w0; P[o + 3] = w1
    ang.push(a); len.push(L)
  }
  for (let j = 0; j < SPLASH_DROPS; j++) {
    const o = 4 + 4 * SPLASH_FINGERS + 3 * j
    const sr = 0.04 + 0.065 * u(50 + j)
    let a, d
    if (j < 2) {                                                  // flung off the end of a finger
      const i = (Math.floor(u(60 + j) * SPLASH_FINGERS) + j * 2) % SPLASH_FINGERS
      a = ang[i] + (u(70 + j) - 0.5) * 0.18; d = len[i] + sr + 0.05 + 0.15 * u(80 + j)
    } else {                                                      // thrown out between two fingers
      const i = Math.floor(u(60 + j) * SPLASH_FINGERS), k = (i + 1) % SPLASH_FINGERS
      let da = ang[k] - ang[i]; if (da < 0) da += TAU
      a = ang[i] + da * (0.35 + 0.3 * u(70 + j)); d = b0 * 1.16 + sr + 0.1 + 0.3 * u(80 + j)
    }
    P[o] = Math.cos(a) * d; P[o + 1] = Math.sin(a) * d; P[o + 2] = sr
  }
  return P
}
// how far splash P reaches from its centre, crust radii (its farthest finger tip or droplet; <= CRUST_EDGE_MAX)
export function splashReach(P) {
  let m = P[0] * (1 + SPLASH_WOB[0] + SPLASH_WOB[1] + SPLASH_WOB[2])
  for (let i = 0; i < SPLASH_FINGERS; i++) { const o = 4 + 4 * i; m = Math.max(m, Math.hypot(P[o], P[o + 1]) + P[o + 3]) }
  for (let j = 0; j < SPLASH_DROPS; j++) { const o = 4 + 4 * SPLASH_FINGERS + 3 * j; m = Math.max(m, Math.hypot(P[o], P[o + 1]) + P[o + 2]) }
  return m
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25 }
// the splash's signed distance at (x, y) in its own frame (crust radii, negative inside; the blot's taken
// along the bearing, the rest Euclidean). The floor shader's crustD (src/toon/world.js) is this, line for line.
export function splashSdf(P, x, y) {
  const a = Math.atan2(y, x)
  let d = Math.hypot(x, y) - P[0] * (1 + SPLASH_WOB[0] * Math.sin(2 * a + P[1]) + SPLASH_WOB[1] * Math.sin(3 * a + P[2]) + SPLASH_WOB[2] * Math.sin(5 * a + P[3]))
  for (let i = 0; i < SPLASH_FINGERS; i++) {
    const o = 4 + 4 * i, tx = P[o], ty = P[o + 1]
    const h = Math.min(1, Math.max(0, (x * tx + y * ty) / (tx * tx + ty * ty)))
    d = smin(d, Math.hypot(x - tx * h, y - ty * h) - (P[o + 2] + (P[o + 3] - P[o + 2]) * h), SPLASH_K)
  }
  for (let j = 0; j < SPLASH_DROPS; j++) {
    const o = 4 + 4 * SPLASH_FINGERS + 3 * j
    d = Math.min(d, Math.hypot(x - P[o], y - P[o + 1]) - P[o + 2])
  }
  return d
}
// how far the lava has eaten crust c back from its rim, in crust radii (0 until its last CRUST_EAT_T s)
export function crustEat(c) {
  const k = Math.min(1, Math.max(0, (c.t - (c.dur - CRUST_EAT_T)) / CRUST_EAT_T)), e = k * k * (3 - 2 * k)
  return e * e * 0.6 + e * 0.4
}
const splashMemo = new WeakMap()
// crust c's splash (memoised per crust; a hand-built one without shape is seeded from its position)
export function splashOf(c) {
  const m = splashMemo.get(c)
  if (m && m.shape === c.shape && m.rot === c.rot) return m.P
  const sh = c.shape === undefined ? crustShapeOf(c.x, c.y, c.seq ?? 0) : c
  const P = crustSplash(sh.shape, sh.rot)
  splashMemo.set(c, { shape: c.shape, rot: c.rot, P })
  return P
}
// px from crust c's edge at (x, y), negative inside, eaten back at its end: what is solid
export function crustSdf(c, x, y) {
  return (splashSdf(splashOf(c), (x - c.x) / c.r, (y - c.y) / c.r) + crustEat(c)) * c.r
}
// a pool laid at (x, y): its rim's three phases
export function poolPhaseOf(x, y) {
  const sd = Math.floor(Math.abs(x * 3 + y * 5))
  return [rh(sd, 1, 1) * TAU, rh(sd, 2, 1) * TAU, rh(sd, 3, 1) * TAU]
}

// is (x, y) inside crust c's edge / pool q's rim (the shape only: not its age, nor what is under it)
export function inCrustEdge(c, x, y) {
  const dx = x - c.x, dy = y - c.y, R = c.r * CRUST_EDGE_MAX
  if (dx * dx + dy * dy > R * R) return false
  return crustSdf(c, x, y) <= 0
}
export function inPoolEdge(q, x, y) {
  const dx = x - q.x, dy = y - q.y, d2 = dx * dx + dy * dy, R = q.r * POOL_RIM_MAX
  if (d2 > R * R) return false
  return Math.sqrt(d2) <= q.r * poolRimR(Math.atan2(dy, dx), q.ph ?? poolPhaseOf(q.x, q.y))
}
// how far inside pool q's rim (x, y) is, px (negative outside): for a soft-edged mask
export function poolRimDepth(q, x, y) {
  const dx = x - q.x, dy = y - q.y
  return q.r * poolRimR(Math.atan2(dy, dx), q.ph ?? poolPhaseOf(q.x, q.y)) - Math.sqrt(dx * dx + dy * dy)
}
