// THE MANTLE'S GROUND SHAPES: the one truth of where a Quench crust and a Crack Hammer pool end.
// Pure and import-free, so sim.js (what is solid) and the renderers (what is drawn: src/toon/mantle-fx.js,
// the floor shader) all read the SAME edge. A crust or a pool is never a circle: its edge is a lobed
// radius at each bearing, seeded from where it was laid.
//   crust c: inside iff dist <= c.r * crustEdgeR(bearing - c.rot, c.shape)
//   pool q:  inside iff dist <= q.r * poolRimR(bearing, q.ph)
// sim.js stamps shape/rot (crustShapeOf) and ph (poolPhaseOf) on each one when it is laid; a hand-built
// one without them gets the same values from its position.

export const TAU = Math.PI * 2
export const CRUST_SHAPES = 3        // the crust atlas's shapes (mantle-fx bakes one row per shape)
export const CRUST_EDGE_MAX = 1.105  // the largest crustEdgeR can be (0.93 + 0.075 + 0.05 + 0.03 + 0.02)
export const POOL_RIM_MAX = 1.075    // the largest poolRimR can be (0.92 + 0.07 + 0.05 + 0.035)

// a hash in [0, 1) of three integers, well mixed even for small neighbouring inputs
export function rh(a, b, c) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x632be5ab, 0x85ebca77) ^ Math.imul((c | 0) + 0x1b873593, 0xc2b2ae3d)
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15
  return (h >>> 0) / 4294967296
}
// a crust shape's edge: radius (in crust radii) at angle a (in the crust's own frame), lobed per shape k
export function crustEdgeR(a, k) {
  const p = k * 2.399
  return 0.93 + 0.075 * Math.sin(2 * a + p) + 0.05 * Math.sin(3 * a + p * 1.7 + 1) + 0.03 * Math.sin(5 * a + p * 2.3 + 2) + 0.02 * Math.sin(8 * a + p * 3.1)
}
// a pool's rim: radius (in pool radii) at angle a, three harmonics with phases ph
export const poolRimR = (a, ph) => 0.92 + 0.07 * Math.sin(3 * a + ph[0]) + 0.05 * Math.sin(5 * a + ph[1]) + 0.035 * Math.sin(7 * a + ph[2])

// which atlas shape a crust laid at (x, y) wears, and how it is turned
export function crustShapeOf(x, y) {
  const sd = Math.floor(Math.abs(x * 0.37 + y * 0.61))
  return { shape: sd % CRUST_SHAPES, rot: rh(sd, 3, 1) * TAU }
}
// a pool laid at (x, y): its rim's three phases
export function poolPhaseOf(x, y) {
  const sd = Math.floor(Math.abs(x * 3 + y * 5))
  return [rh(sd, 1, 1) * TAU, rh(sd, 2, 1) * TAU, rh(sd, 3, 1) * TAU]
}

// is (x, y) inside crust c's edge / pool q's rim (the shape only: not its age, nor what is under it)
export function inCrustEdge(c, x, y) {
  const dx = x - c.x, dy = y - c.y, d2 = dx * dx + dy * dy, R = c.r * CRUST_EDGE_MAX
  if (d2 > R * R) return false
  const sh = c.shape === undefined ? crustShapeOf(c.x, c.y) : c
  return Math.sqrt(d2) <= c.r * crustEdgeR(Math.atan2(dy, dx) - sh.rot, sh.shape)
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
