// THE MANTLE'S MECHANIC TELLS (render-only; src/toon.js calls in).
// The crust and the pool SURFACES are the floor's (src/toon/world.js paints them in the floor shader).
// Everything here is an OBJECT or an effect on top of them, drawn as a cel: flat two- or three-tone
// colour, a thick-thin ink line, a paper edge where it is a solid thing, and timed with anticipation,
// smears and squash (after 1930s cartoon effects animation).
//   run.quenchCrusts   the Quench Kettle's pour, off the newest crust's t: the kettle tipping beside the
//                      digger, its water thrown in an arc to the crust's centre into a splash crown and a
//                      ring of blobs, steam puffs boiling up off the fresh crust
//   run.lavaPools      the Crack Hammer's stamp, off each pool's first 0.42s: wind-up, cocked, a smear, the
//                      slam held squashed, a star, streaks, tumbling chunks, dust puffs
//   event punch        the Spring Glove's punch: a red boxing glove on a zig-zag spring
//                      out of an iron cup by you, cocked, shot out past the foe, held on the hit with a star,
//                      sprung back
//   run.boats          the moored boats: each an iron-banded tub with a stack and a face (two paper pieces,
//                      the front one over your legs when you ride it), bobbing afloat with the lava round its
//                      hull and a wake while it moves, beached and listing on rock; sinking (floatT) it
//                      lists, the lava climbs its side and pours into the hold, over your boots below half,
//                      steam and bubbles near the end; event boatSink: it goes under in a splash of planks
//   enemies            strandT (a lava creature on dry rock: it acts it out in its own sprite, cast.js's
//                      stranded poses; here its own lava setting into a crust round it, dust), meltT (a rock
//                      creature under the tide: panic, slump, a puddle with its eyes in it)
//   events             melt (a splat, a steam puff, drops) and crumble (chunks, dust); both return true

import { Container, Graphics, CanvasSource, Texture, Sprite } from 'pixi.js'
import { PAL, TAU, hexNum, mkCanvas, freeCanvas } from './palette.js'
import { resetXf, ell, polar, tube, qb, line, cel, eye, drop, spline, setPaper, rng } from './brush.js'
import { mantleHeightAt } from '../sim.js'
import { strandStone, MANTLE_MELT_T, DRAW_CAPS } from '../config.js'
import { TOON_CAST, setCastClock, STRAND_CRUMBLE } from './cast.js'
// the crust's and the pool's edges are the sim's own (what is drawn is what is solid)
import { rh, poolRimDepth } from '../mantle-shape.js'

const C = {
  ink: hexNum(PAL.ink), inkSoft: hexNum(PAL.inkSoft), white: hexNum(PAL.white), paper: hexNum(PAL.paper), basalt: hexNum(PAL.basalt),
  lavaDeep: hexNum(PAL.lavaDeep), lava: hexNum(PAL.lava), lavaHot: hexNum(PAL.lavaHot), lavaGlow: hexNum(PAL.lavaGlow),
  lavaWhite: hexNum(PAL.lavaWhite), trough: 0x5a1a12, scorch: 0x221520,
}
const hyp = (x, y) => Math.sqrt(x * x + y * y)
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const clamp01 = (x) => Math.max(0, Math.min(1, x))

// ---------------------------------------------------------------- THE CELS (bake once)
// Drawn with the cast's own brush, flat (no dabs, no airbrushed shade), then given a paper margin.
const BRES = 3
function paperEdge(cv, w) {
  if (!(w > 0)) return cv
  const g = mkCanvas(cv.width, cv.height), c = g.getContext('2d')
  for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU; c.drawImage(cv, Math.cos(a) * w, Math.sin(a) * w) }
  c.globalCompositeOperation = 'source-in'; c.fillStyle = PAL.paper; c.fillRect(0, 0, g.width, g.height)
  c.globalCompositeOperation = 'source-over'; c.drawImage(cv, 0, 0)
  freeCanvas(cv)
  return g
}
function bake(w, h, ax, ay, paint, paper = 1.5) {
  const cv = mkCanvas(w * BRES, h * BRES), ctx = cv.getContext('2d')
  ctx.scale(BRES, BRES); ctx.translate(w * ax, h * ay)
  resetXf(); paint(ctx); resetXf()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const tex = new Texture({ source: new CanvasSource({ resource: paperEdge(cv, paper * BRES), resolution: BRES }) })
  return { tex, ax, ay }
}
const FLAT = { shade: null, dabs: 0 }
const flat = (c, pts, col, ink) => cel(c, pts, col, { ...FLAT, ink })
// a cloud's outline: the outer silhouette of overlapping round lobes [x, y, r]
function lobes(L, n = 72) {
  return polar(0, 0, (t) => {
    const ux = Math.cos(t), uy = Math.sin(t)
    let best = 0
    for (const [x, y, r] of L) {
      const b = x * ux + y * uy, q = r * r - (x * x + y * y - b * b)
      if (q >= 0) best = Math.max(best, b + Math.sqrt(q))
    }
    return best
  }, n)
}
const ENAMEL = '#3f9690', ENAMEL_LO = '#245f5c', ENAMEL_HI = '#a9e0d4', CREAM = '#f1e5c6'
// the Quench Kettle: a teal enamel kettle with a cream band, a long spout rising from its belly to a
// lipped point (+x), a black iron handle over the lid; the spout's tip is KETTLE_TIP
const KETTLE_TIP = [52, -28]
function paintKettle() {
  return bake(118, 100, 0.42, 0.6, (c) => {
    flat(c, tube(qb([-18, -15], [0, -48], [18, -15]), 3.6), PAL.ink, 1)
    flat(c, tube(qb([18, 10], [42, 6], [52, -28]), 9.5, 3.4), ENAMEL, 2.2)
    flat(c, ell(52.5, -29, 4.6, 2.4, -0.55, 20), PAL.ink, 0)
    const body = [[-28, 20], [-30, 10], [-25, -5], [-14, -14], [0, -17], [14, -14], [25, -5], [30, 10], [28, 20], [16, 24], [-16, 24]]
    flat(c, spline(body, 6), ENAMEL_LO, 2.6)
    flat(c, spline(body.map(([x, y]) => [x * 0.86 - 2.5, y * 0.84 - 2.5]), 6), ENAMEL, 0)
    flat(c, [[-29, 12], [29, 12], [29.5, 17], [-29.5, 17]], CREAM, 1.3)
    flat(c, ell(-14, -3, 6.5, 3.2, -0.6, 20), PAL.white, 0)
    flat(c, ell(0, -16, 13.5, 4.4, 0, 32), CREAM, 1.8)
    flat(c, ell(0, -21, 4.6, 3.4, 0, 20), PAL.ink, 0)
    eye(c, -9, 2, 3.8, 4.8, 0.7, 0.2)
    eye(c, 3, 2, 3.8, 4.8, 0.7, 0.2)
    line(c, [[-6, 8.5], [-2.5, 10.5], [1, 8.5]], 1.1, {})
  })
}
// the Crack Hammer: a fat red mallet with a face, a bent rubber-hose handle, drawn lying along +x with
// the head at the left and the hand's end (the pivot) at the origin; HAMMER_L from the pivot to the head
const HAMMER_L = 82
function paintHammer() {
  return bake(150, 72, 0.88, 0.5, (c) => {
    flat(c, tube(qb([-66, 0], [-34, -9], [0, 0]), 4.6), PAL.wood, 1.8)
    flat(c, tube([[-14, -1], [0, 0]], 5.6), PAL.shorts, 1.4)
    // the head: a barrel, its striking faces lighter, two iron bands
    flat(c, [[-104, -22], [-62, -22], [-58, -16], [-58, 16], [-62, 22], [-104, 22], [-108, 16], [-108, -16]], '#c8322a', 2.4)
    flat(c, [[-104, -18], [-66, -18], [-66, -9], [-104, -9]], '#e0563e', 0)
    flat(c, ell(-108, 0, 4.5, 21, 0, 28), '#e9b98a', 1.8)
    flat(c, ell(-58, 0, 4.5, 21, 0, 28), '#e9b98a', 1.8)
    flat(c, [[-98, -23], [-93, -23], [-93, 23], [-98, 23]], PAL.iron, 1.2)
    flat(c, [[-73, -23], [-68, -23], [-68, 23], [-73, 23]], PAL.iron, 1.2)
    eye(c, -87, -6, 4.2, 5.4, -0.5, 0.3)
    eye(c, -79, -6, 4.2, 5.4, -0.5, 0.3)
    line(c, [[-90, 9], [-83, 6], [-76, 10]], 1.4, {})
    line(c, [[-92, -14], [-85, -12]], 1.1, {})
    line(c, [[-81, -12], [-74, -14]], 1.1, {})
  })
}
// A STALAGMITE (run.obstacles kind 'stalagmite'): a cluster of basalt columns in the floor's own rock
// violet, upright (props stand), its foot at the origin, about STAL_BAKE_R px in half-width at scale 1.
// STAL_VARIANTS bakes, each its own cluster (2-5 columns, heights, widths, lean); stalVariant picks one
// off the stalagmite's position, so neighbours differ and one stays the same every frame.
const STAL_BAKE_R = 40, STAL_VARIANTS = 6
const STONE = '#6e5872', STONE_LIT = '#9a83a0', STONE_TOP = '#bfadc2'
const stalVariant = (o) => Math.floor(Math.abs(o.x * 0.37 + o.y * 0.61)) % STAL_VARIANTS
function paintStalagmite(v) {
  return bake(120, 150, 0.5, 0.82, (c) => {
    const r = rng(v * 977 + 13), n = 2 + (v % 4), mid = (n - 1) / 2
    const cols = []
    for (let i = 0; i < n; i++) {
      const w = 9 + r() * 6
      const x = n > 1 ? -26 + 52 * (i / (n - 1)) + (r() - 0.5) * 8 : 0
      const h = 30 + r() * 30 + 40 * (1 - Math.abs(i - mid) / (mid + 1))
      cols.push({ x, h, w, lean: (r() - 0.5) * 0.22, dy: (r() - 0.5) * 10 })
    }
    cols.sort((p, q) => p.dy - q.dy)   // the back row first
    for (const { x, h, w, lean, dy } of cols) {
      const cap = w * 0.42, top = -h + dy, sx = lean * h   // the top shears over by sx
      flat(c, [[x - w, dy], [x - w + sx, top], [x - w * 0.5 + sx, top - cap], [x + w * 0.5 + sx, top - cap], [x + w + sx, top], [x + w, dy], [x + w * 0.5, dy + cap], [x - w * 0.5, dy + cap]], STONE, 2.4)
      flat(c, [[x - w, dy], [x - w + sx, top], [x - w * 0.15 + sx, top + cap * 0.6], [x - w * 0.15, dy + cap * 0.9], [x - w * 0.5, dy + cap]], STONE_LIT, 0)
      flat(c, [[x - w + sx, top], [x - w * 0.5 + sx, top - cap], [x + w * 0.5 + sx, top - cap], [x + w + sx, top], [x + w * 0.5 + sx, top + cap], [x - w * 0.5 + sx, top + cap]], STONE_TOP, 1.8)
      line(c, [[x - w * 0.15 + sx, top + cap * 0.7], [x - w * 0.15, dy + cap * 0.8]], 1.1, {})
    }
  })
}
const GLOVE_T = 0.5         // s one punch takes to play out, cocked to sprung back
const GLOVE_BASE_R = 34     // WEAPONS.springGlove's fist radius at level 1; a bigger one draws a bigger glove
// the Spring Glove: a red boxing glove from above, +x = the fist, the cuff at the origin
function paintBoxGlove() {
  return bake(110, 96, 0.36, 0.5, (c) => {
    flat(c, [[-38, -17], [-16, -19], [-16, 19], [-38, 17]], PAL.paper, 2.2)
    line(c, [[-30, -10], [-24, 0], [-30, 10]], 1.4, {})
    flat(c, ell(-2, -25, 14, 10, -0.35, 28), '#b52a22', 2.2)
    flat(c, ell(14, 2, 34, 29, 0, 40), '#c8322a', 2.8)
    flat(c, ell(10, -10, 16, 8, -0.3, 24), '#e0563e', 0)
    flat(c, ell(4, -13, 6, 2.6, -0.4, 16), PAL.white, 0)
    line(c, [[36, -18], [44, 0], [36, 18]], 1.6, {})
  })
}
// an impact: a hard yellow star, white at its heart
function paintStar() {
  return bake(110, 110, 0.5, 0.5, (c) => {
    const spikes = (r0, r1, k) => polar(0, 0, (t) => { const f = (t / TAU) * 14; const u = f - Math.floor(f); return r0 + (r1 - r0) * (1 - Math.abs(u * 2 - 1)) * (0.8 + 0.2 * Math.sin(t * 5 + k)) }, 112)
    flat(c, spikes(24, 50, 0), PAL.lavaGlow, 2.4)
    flat(c, spikes(13, 27, 2), PAL.white, 0)
  }, 0)
}
// a puff: a round cel cloud of lobes, a base tone and a lit one, inked, with a curl of ink in it
function paintPuff(v, base, shade, ink = 2.4) {
  // a cel puff of round lobes in two flat tones (the lit one up-left), a bold scalloped ink line;
  // lobe count, sizes and spread all vary with v, so no two read as clones
  return bake(80, 72, 0.5, 0.55, (c) => {
    const L = []
    const n = 3 + (v % 4), spread = 9 + (v % 3) * 3
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + v * 1.7, d = spread * (0.7 + 0.5 * rh(i, v, 2)); L.push([Math.cos(a) * d * 1.15, Math.sin(a) * d * 0.85, 8 + rh(i, v, 3) * 8]) }
    L.push([rh(v, 1, 4) * 4 - 2, rh(v, 2, 4) * 4 - 2, 12 + (v % 2) * 3])
    flat(c, lobes(L), shade, ink)
    flat(c, lobes(L.map(([x, y, r]) => [x - 2.6, y - 3.2, r * 0.76])), base, 0)
  }, 0)
}// a rock chunk (or a basalt one): an angular lump, a lit top facet
function paintChunk(v, base, top) {
  // a paper-cut shard of rock: an irregular polygon of 4 to 7 corners, a lit facet, a white cut edge
  const n = 4 + (v % 4), sz = 0.75 + (v % 5) * 0.14, sx = 1 + 0.45 * ((v * 7) % 3) / 2
  return bake(40, 40, 0.5, 0.5, (c) => {
    const P = []
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + (rh(i, v, 1) - 0.5) * 0.9, r = (4.5 + 6 * rh(i, v, 2)) * sz; P.push([Math.cos(a) * r * sx, Math.sin(a) * r]) }
    flat(c, P, base, 1.8)
    flat(c, P.slice(0, Math.max(3, n - 2)).map(([x, y]) => [x * 0.55 - 1.5, y * 0.5 - 2]), top, 0)
  }, 1.7)
}// a teardrop of lava or water: tip toward -y (rotate it to its flight)
function paintDrop(base, lit) {
  return bake(24, 30, 0.5, 0.55, (c) => {
    flat(c, drop(0, 0, 6.5, 13), base, 1.5)
    flat(c, ell(-1.8, 2.5, 1.8, 2.6, 0.3, 16), lit, 0)
  }, 0)
}
// a splat of lava where a blob lands
function paintSplat(v) {
  return bake(56, 44, 0.5, 0.5, (c) => {
    // a flattened puddle with a few round lumps where it spread, and two drops thrown clear of it
    const P = polar(0, 0, (t) => 11 * (1 + 0.16 * Math.sin(t * 4 + v) + 0.1 * Math.sin(t * 7 + v * 2)), 60)
    flat(c, P.map(([x, y]) => [x * 1.45, y]), PAL.lava, 1.6)
    flat(c, ell(21, -7, 2.6, 2.2, 0, 16), PAL.lava, 1.2)
    flat(c, ell(-22, 6, 2, 1.7, 0, 16), PAL.lava, 1.2)
    flat(c, ell(-2, -1.5, 7, 4, 0, 24), PAL.lavaHot, 0)
    flat(c, ell(-4, -3, 2.6, 1.6, 0, 16), PAL.lavaWhite, 0)
  }, 0)
}
// the crown of a splash where the kettle's stream lands
function paintCrown() {
  // a cartoon splash crown: a ring of round-ended tongues of water thrown up, a white heart
  return bake(64, 50, 0.5, 0.72, (c) => {
    const T = [[-20, -4, -2.2], [-11, -12, -1.9], [0, -15, -1.57], [11, -12, -1.25], [20, -4, -0.9]]
    for (const [x, y, a] of T) flat(c, drop(x, y, 4.6, 11), '#cdeaf0', 1.6)
    flat(c, ell(0, 4, 23, 8, 0, 36), '#cdeaf0', 1.8)
    flat(c, ell(-2, 2.5, 15, 4.5, 0, 28), '#eef9f8', 0)
  }, 0)
}
// a curl breaking over the wave's lip, seen from above: a tongue of lava rolling forward (+x) and hooking
// back over its own dark hollow; three of them, of different builds
function paintCurl(v) {
  return bake(48, 44, 0.42, 0.5, (c) => {
    const turn = [4.4, 5.0, 3.8][v], R0 = [11, 13, 9.5][v], thin = [0.45, 0.4, 0.5][v]
    const hook = []
    for (let i = 0; i <= 28; i++) { const a = -2.6 + (i / 28) * turn, r = R0 * (1 - (i / 28) * 0.35); hook.push([Math.cos(a) * r, Math.sin(a) * r * 0.9]) }
    for (let i = 28; i >= 0; i--) { const a = -2.6 + (i / 28) * turn, r = R0 * thin * (1 - (i / 28) * 0.5); hook.push([Math.cos(a) * r - 0.6, Math.sin(a) * r * 0.9 + 0.8]) }
    flat(c, ell(-0.5, 0.8, R0 * 0.5, R0 * 0.44, 0, 24), '#7a1c10', 0)
    flat(c, hook, PAL.lavaHot, 1.8)
    const hi = []
    for (let i = 0; i <= 12; i++) { const a = -2.3 + (i / 12) * 2.6; hi.push([Math.cos(a) * R0 * 0.82, Math.sin(a) * R0 * 0.74]) }
    line(c, hi, 1.8, { color: PAL.lavaWhite })
  }, 1.2)
}
// a bubble of the shore's lip (the floor draws its own the same warm cream)
function paintBubble() {
  // a bubble: a plain open circle of ink (the 1930 Iwerks bubble)
  return bake(16, 16, 0.5, 0.5, (c) => {
    const P = polar(0, 0, () => 4.6, 24)
    line(c, [...P, P[0], P[1]], 1.1, {})
  }, 0)
}
// a pair of wide eyes, floating on what is left of a melted creature
function paintEyes() {
  return bake(34, 22, 0.5, 0.5, (c) => {
    eye(c, -6, 0, 5, 6.4, 0, -0.4)
    eye(c, 6, 0, 5, 6.4, 0, -0.4)
  }, 1.2)
}
// ---- THE MOORED BOAT: a little iron-banded tub of charred planks with a stubby smokestack and a face
// on its bow, drawn the way the cast is (paper cut-outs in the brush's paper mode, 3/4 from above, the
// bow at +x, mirrored to face its way and never turned). Two pieces so you can stand IN it: the BACK
// (the gunwale's far rim, the hold, a thwart, the stack) under you, the FRONT (the hull's near side,
// its rim, iron bands and the face) over your legs. Units are world px round the hold's middle.
const BOAT_RIM = spline([[53, -5], [44, 3], [28, 9], [0, 12], [-28, 9], [-42, 5], [-45, -2], [-39, -9], [-20, -13], [10, -14], [36, -11]], 8)
const BOAT_OPEN = BOAT_RIM.map(([x, y]) => [(x - 2) * 0.86 + 1, (y + 0.5) * 0.66 - 1.4])
const BOAT_HULL = spline([[53, -5], [44, 3], [28, 9], [0, 12], [-28, 9], [-42, 5], [-45, -2], [-46, 9], [-37, 21], [-12, 27], [18, 26], [40, 16], [50, 3]], 8)
// the hull grown past its paper edge: the lava up its side covers the cut margin too
const BOAT_WET = BOAT_HULL.map(([x, y]) => [4 + (x - 4) * 1.06, 12 + (y - 12) * 1.12])
const BOAT_STACK = [-25, -26]   // the stack's mouth, where its smoke leaves
const BOAT_BOX = [-50, -36, 62, 32]
const WOOD = '#5b3524', WOOD_LO = '#2e180f', WOOD_HI = '#8a5a3a', HOLD = '#3a2118', BRASS = '#e3bf73', IRON_D = '#2b2730'
const pathPts = (c, P) => { c.beginPath(); c.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1]); c.closePath() }
// paint inside a shape only (a canvas clip under the bake's own transform)
const within = (c, P, fn) => { c.save(); pathPts(c, P); c.clip(); fn(); c.restore() }
function bakeBoat(paint) {
  const [x0, y0, x1, y1] = BOAT_BOX, w = x1 - x0, h = y1 - y0
  return bake(w, h, -x0 / w, -y0 / h, (c) => { setPaper(true); try { paint(c) } finally { setPaper(false) } }, 1.8)
}
function paintBoatBack() {
  return bakeBoat((c) => {
    cel(c, BOAT_RIM, BRASS, { ink: 2.4 })
    cel(c, BOAT_OPEN, HOLD, { ink: 1.5, shade: null })
    within(c, BOAT_OPEN, () => {
      for (const y of [-8, -4, 0, 4]) line(c, [[-44, y], [50, y - 1]], 0.8, { color: '#1e0f0a', taper: 0.2 })
      // the thwart, a plank across the hold
      cel(c, [[4, -14], [12, -14], [13, 12], [5, 12]], WOOD_HI, { ink: 1.3 })
    })
    // the smokestack: a stubby iron funnel with a red band, rising from the stern
    cel(c, [[-31, -6], [-31, -24], [-19, -24], [-19, -6]], IRON_D, { ink: 1.7 })
    cel(c, [[-31, -18], [-19, -18], [-19, -14], [-31, -14]], '#c8322a', { ink: 1.1 })
    cel(c, ell(-25, -24.5, 6.4, 2.6, 0, 24), '#4a4450', { ink: 1.4 })
    cel(c, ell(-25, -24.6, 4.2, 1.5, 0, 20), '#120a0c', { ink: 0, shade: null })
  })
}
function paintBoatFront() {
  return bakeBoat((c) => {
    cel(c, BOAT_HULL, WOOD, { ink: 2.6 })
    within(c, BOAT_HULL, () => {
      // the strakes: planks running bow to stern under the rim
      line(c, qb([-45, 8], [0, 22], [50, 1]), 1.0, { color: WOOD_LO, taper: 0.15 })
      line(c, qb([-41, 15], [0, 29], [46, 9]), 1.0, { color: WOOD_LO, taper: 0.15 })
      line(c, qb([-44, 4], [0, 17], [51, -2]), 0.8, { color: WOOD_HI, taper: 0.3 })
      // two riveted iron bands round the hull
      for (const bx of [-27, 5]) {
        cel(c, [[bx - 3, 0], [bx + 3, 0], [bx + 3.5, 32], [bx - 2.5, 32]], IRON_D, { ink: 1.1 })
        for (const ry of [13, 19]) cel(c, ell(bx + 0.3, ry, 1.3, 1.2, 0, 12), BRASS, { ink: 0.6, shade: null })
      }
    })
    // the near rim, a brass-capped gunwale over your legs
    cel(c, tube(spline([[-45, -1.5], [-42, 5], [-28, 9.4], [0, 12.4], [28, 9.4], [44, 3.4], [53, -5]], 6).slice(0, -6), 4.6, 3.4), BRASS, { ink: 1.5 })
    cel(c, ell(52, -4.5, 3.4, 2.8, 0, 18), BRASS, { ink: 1.3 })
    // the face on its bow: pie-cut eyes and a pleased grin
    eye(c, 25, 15.5, 3.7, 4.6, 0.7, 0.1)
    eye(c, 34.5, 12, 3.3, 4.2, 0.7, 0.1)
    line(c, [[22, 21.5], [28.5, 23.4], [36, 19.6]], 1.2, {})
    line(c, [[21.5, 9.8], [26.5, 9.2]], 1.0, {})
  })
}
// a broken plank off a sunk boat
function paintPlank(v) {
  return bake(30, 14, 0.5, 0.5, (c) => {
    const L = 10 + v * 2
    flat(c, [[-L, -2.6], [L - 2, -3], [L, 0.5 - v], [L - 3, 2.8], [-L + 1, 2.6], [-L - 1, 0]], WOOD, 1.4)
    line(c, [[-L + 2, 0.3], [L - 3, -0.4]], 0.6, { color: WOOD_LO })
  }, 1.4)
}
// the part of a closed local polygon below the line y = wl + wave(x) (Sutherland-Hodgman on one edge);
// the points on the cut are flagged .cut (the waterline drawn along it)
function clipBelow(P, wl, wave) {
  const out = [], n = P.length
  const inside = (q) => q[1] >= wl
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n]
    if (inside(a)) out.push(a)
    if (inside(a) !== inside(b)) {
      const u = (wl - a[1]) / (b[1] - a[1]), q = [a[0] + (b[0] - a[0]) * u, wl]
      q.cut = true
      out.push(q)
    }
  }
  // the cut runs along the waterline: let it ripple, with a few points along it
  const cuts = out.map((q, i) => (q.cut ? i : -1)).filter((i) => i >= 0)
  if (cuts.length === 2) {
    const [i0, i1] = cuts, a = out[i0], b = out[i1], mid = []
    for (let k = 1; k < 8; k++) { const q = [b[0] + (a[0] - b[0]) * (k / 8), wl]; q.cut = true; mid.push(q) }
    out.splice(i1 + 1, 0, ...mid)
  }
  for (const q of out) if (q.cut) q[1] = wl + wave(q[0])
  return out
}
const BOAT_DY = 16   // the boat is drawn this far below its sim point: you stand in its hold

// a closed outline round (x, y): radius r wobbling by `jag`, seeded so it never crawls
function blob(x, y, r, jag, seed, n = 18) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const k = 1 + jag * (rh(i, seed, 7) * 2 - 1)
    pts.push(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k)
  }
  return pts
}
// a shape inked the cartoon way in a Graphics: a paper margin, the fill, a thick-thin ink line (the
// line drawn twice, the second pass offset down-right so it is heavier on the shadow side)
function celPoly(g, pts, fill, o = {}) {
  const { ink = 2.2, paper = 0, alpha = 1 } = o
  if (paper > 0) g.poly(pts).stroke({ width: ink + paper * 2, color: C.paper, alpha, join: 'round' })
  g.poly(pts).fill({ color: fill, alpha })
  if (ink > 0) {
    g.poly(pts).stroke({ width: ink * 0.7, color: C.ink, alpha, join: 'round' })
    g.poly(pts.map((v, i) => v + (i & 1 ? ink * 0.3 : ink * 0.22))).stroke({ width: ink * 0.7, color: C.ink, alpha, join: 'round' })
  }
}

// A STRANDED LAVA CREATURE'S BODY AND FOOT, in its bake's own units (TOON_CAST baseR, facing right):
// body [cx, cy, rx, ry] (where its crumbs fall from), foot [cx, cy, half width] (where it lies on the
// rock: its lava runs out from there)
const STRAND_LOOK = {
  emberJelly: { body: [0, -5.5, 10.6, 8.4], foot: [0, 9, 19] },
  magmaToad: { body: [0, 1, 16, 9.8], foot: [0, 8, 21] },
  lavaRay: { body: [0, 4, 30, 9], foot: [0, 10, 37] },
  magmaEel: { body: [-6, 10, 22, 6], foot: [-8, 12, 28] },
}
// any other lava creature: a round body of radius 1
const STRAND_ANY = { body: [0, 0, 1, 0.9], foot: [0, 0.7, 1.15] }
const STRAND_CAP = 24
// THE PUDDLE A STRANDED CREATURE LIES IN, baked once (a sprite scaled to it each frame): its own lava run
// out on the rock round it, PR x PR * 0.46 units. crust: the set crust, a dark lobed cel with a lit
// lip; cracked: the same broken up into plates; lava: the hot pool still in it, shrinking as it sets
const PR = 28
const puddleLobe = (v) => polar(0, 0, (a) => PR * (1 + 0.08 * Math.sin(a * 3 + v * 2.1) + 0.05 * Math.sin(a * 5 + v)), 48).map(([x, y]) => [x, y * 0.46])
function paintPuddle(v, kind) {
  return bake(PR * 2 + 12, PR + 12, 0.5, 0.5, (c) => {
    const P = puddleLobe(v)
    if (kind === 'lava') {
      flat(c, P, PAL.lava, 0)
      flat(c, ell(-PR * 0.3, -PR * 0.12, PR * 0.36, PR * 0.12, 0, 24), PAL.lavaHot, 0)
      return
    }
    flat(c, P, PAL.inkSoft, 2.2)
    // the lip of the crust catching the light, up-left
    line(c, P.slice(26, 44).map(([x, y]) => [x * 0.9, y * 0.82]), 1.2, { color: PAL.rockLow, taper: 0.5 })
    if (kind === 'cracked') for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.5 + v, ca = Math.cos(a), sa = Math.sin(a) * 0.46
      const pts = [[ca * PR * 0.18, sa * PR * 0.18], [ca * PR * 0.5 - sa * 3, sa * PR * 0.5 + ca * 1.2], [ca * PR * 0.95, sa * PR * 0.95]]
      line(c, pts, 2.0, { taper: 0.45, belly: true })
    }
  }, 0)
}
// A PIECE OF A CRUMBLING CREATURE: a wedge broken out of its body, the rounded outer edge its own
// outline, the broken inner edges straight, in its own paint (base) with a lit facet, house ink
function paintPiece(v, base, lit) {
  const a0 = -0.6 + 0.35 * (v % 3), span = 2.0 + 0.35 * ((v * 2) % 3), r = 10 + 2 * (v % 2)
  const arc = []; for (let i = 0; i <= 12; i++) { const a = a0 + (span * i) / 12; arc.push([Math.cos(a) * r, Math.sin(a) * r]) }
  const am = a0 + span * 0.6, mid = a0 + span / 2, cx = Math.cos(mid) * r * 0.6, cy = Math.sin(mid) * r * 0.6
  const Q = [[Math.cos(am) * r * 0.12, Math.sin(am) * r * 0.12], ...arc].map(([x, y]) => [x - cx, y - cy])
  return bake(36, 36, 0.5, 0.5, (c) => {
    cel(c, Q, base, { shade: null, dabs: 0, ink: 1.8 })
    cel(c, Q.map(([x, y]) => [x * 0.5 - 1, y * 0.5 - 1.2]), lit, { shade: null, dabs: 0, ink: 0 })
  }, 1.4)
}

export function createMantleFx({ ground, boat, top }) {
  const groundG = new Graphics()
  const groundFx = new Container()
  // the boats: under you (its shadow and wake, the back piece, the lava in its hold, an empty boat's
  // front piece and its waterline), and over you (the front of the one you ride, its waterline, the
  // lava over your boots)
  const boatUnderG = new Graphics(), backL = new Container(), boatInG = new Graphics(), frontL = new Container(), boatBandG = new Graphics()
  const bootG = new Graphics(), frontTopL = new Container(), boatBandTop = new Graphics()
  const topG = new Graphics(), toolLayer = new Container(), topG2 = new Graphics()
  ground.addChild(groundG, groundFx)
  boat.addChild(boatUnderG, backL, boatInG, frontL, boatBandG)
  top.addChild(bootG, frontTopL, boatBandTop, topG, toolLayer, topG2)
  const boatFace = new WeakMap()   // boat -> the way it faces (1 bow right, -1 left), kept between frames
  const boatVis = new WeakMap()    // boat -> { ph / st: its smoke's and its boil's own clocks, bk: 0 afloat .. 1 beached, eased }
  const bursts = []   // { kind: 'melt' | 'crumble' | 'boatSink', x, y, r, t, seed }
  const pings = []    // a pinball coal's bounces (event coalBounce): { x, y, bumper, ox, oy, t }
  // the kettle's newest throw, off its shoot event: it is drawn on every throw, crust or no crust
  let pour = null      // { x, y, r, t }
  const gloves = []   // the Spring Glove's punches, off its punch events: { tx, ty, r, t, seed }
  let clock = 0

  // ---- the cels, made on first use (a few hundred ms, once, at the first frame) ----
  let A = null
  function art() {
    if (A) return A
    A = {
      kettle: paintKettle(), hammer: paintHammer(), star: paintStar(), crown: paintCrown(), bubble: paintBubble(),
      steam: [0, 1, 2, 3, 4, 5].map((v) => paintPuff(v, '#fbf4e4', '#b9a9cf')),
      dust: [0, 1, 2, 3].map((v) => paintPuff(v + 7, '#efe4d2', '#9b8299', 2.8)),
      smoke: [0, 1, 2].map((v) => paintPuff(v + 12, '#4a3c46', '#2a2128', 2.2)),
      puffGrey: [0, 1, 2].map((v) => paintPuff(v + 16, '#f4efe7', '#8e8896', 2.8)),
      chunk: [0, 1, 2, 3, 4, 5].map((v) => paintChunk(v, '#5d4a5c', '#8d7889')),
      eyes: paintEyes(),
      piece: Object.fromEntries([...Object.keys(STRAND_CRUMBLE), '_'].map((id) => [id, [0, 1, 2].map((v) => paintPiece(v, ...(STRAND_CRUMBLE[id] ?? [PAL.lavaDeep, PAL.lava])))])),
      lavaDrop: paintDrop(PAL.lavaHot, PAL.lavaGlow), waterDrop: paintDrop('#cdeaf0', '#eef9f8'),
      splat: [0, 1].map(paintSplat), curl: [0, 1, 2].map(paintCurl),
      boatBack: paintBoatBack(), boatFront: paintBoatFront(), plank: [0, 1, 2].map(paintPlank),
      crust: [0, 1, 2].map((v) => paintPuddle(v, 'crust')), cracked: [0, 1, 2].map((v) => paintPuddle(v, 'cracked')),
      pool: [0, 1, 2].map((v) => paintPuddle(v, 'lava')),
      boxGlove: paintBoxGlove(),
      stal: Array.from({ length: STAL_VARIANTS }, (_, v) => paintStalagmite(v)),
    }
    return A
  }
  // growable pools of plain sprites
  const spritePool = (parent) => {
    const list = []
    let n = 0
    return {
      begin() { n = 0 },
      next(a) {
        let sp = list[n]
        if (!sp) { sp = new Sprite(a.tex); parent.addChild(sp); list.push(sp) }
        n++
        if (sp.texture !== a.tex) sp.texture = a.tex
        sp.anchor.set(a.ax ?? 0.5, a.ay ?? 0.5)
        sp.visible = true; sp.alpha = 1; sp.rotation = 0; sp.scale.set(1); sp.tint = 0xffffff
        return sp
      },
      end() { for (let i = n; i < list.length; i++) list[i].visible = false },
    }
  }
  const low = spritePool(groundFx), tools = spritePool(toolLayer)
  const boatBack = spritePool(backL), boatFront = spritePool(frontL), boatFrontTop = spritePool(frontTopL)
  const boatPools = [boatBack, boatFront, boatFrontTop]
  const GS = [groundG, boatUnderG, boatInG, boatBandG, bootG, boatBandTop, topG, topG2]
  // A STRANDED LAVA CREATURE (the sim's clock, read through config's strandStone: stone in 1s, held,
  // thawed back). The creature acts it out in its own sprite (cast.js's stranded poses: tugging, stuck
  // fast and sweating, set to crust); here is only what lies on the ground round it: its own lava run
  // out on the rock, setting from the rim in to a dark crust that cracks once it is stone, and the
  // dust its tugging kicks up. All of it follows the stone amount, so the thaw plays it backwards.
  function strand(e, t, P, p) {
    const S = strandStone(e.strandT), R = e.radius, sd = e.id | 0
    const L = STRAND_LOOK[e.rosterId] ?? STRAND_ANY
    const ks = R / (STRAND_LOOK[e.rosterId] ? TOON_CAST[e.rosterId]?.baseR ?? R : 1)
    const f = p && p.x < e.x ? -1 : 1
    const X = (u) => e.x + f * u * ks, Y = (v) => e.y + v * ks
    const tug = 1 - smooth(0.85, 1, S)
    const set = smooth(0.4, 1, S)
    const stone = smooth(0.7, 1, S)
    const [fx, fy, fw] = L.foot, [, , brx, bry] = L.body
    const rb = Math.min(brx, bry) * ks
    // the puddle: spreading a little as it sets, the hot pool in it shrinking to nothing, cracked once stone
    const px = X(fx), py = Y(fy), sc = (fw * ks * (1 + 0.12 * S)) / PR, v = sd % 3
    const cr = low.next(P.crust[v]); cr.position.set(px, py); cr.scale.set(sc * f, sc)
    if (stone > 0) { const ck = low.next(P.cracked[v]); ck.position.set(px, py); ck.scale.set(sc * f, sc); ck.alpha = stone }
    const li = 0.86 * (1 - set)
    if (li > 0.05) { const lv = low.next(P.pool[v]); lv.position.set(px, py); lv.scale.set(sc * li * f, sc * li) }
    // JUST STUCK: dust kicked off the rock either side of it as it tugs
    if (tug > 0) for (const s of [-1, 1]) {
      const u = (t * 2.2 + sd * 0.17 + (s > 0 ? 0.5 : 0)) % 1, du = low.next(P.dust[(sd + (s > 0 ? 2 : 0)) & 3])
      du.position.set(px + s * fw * ks * (0.85 + 0.25 * u), py - rb * 0.35 * u)
      du.scale.set((rb / 14) * (0.16 + 0.18 * Math.sin(Math.PI * u)) * tug)
    }
  }
  // THE SPRING GLOVE, one punch: u = 0..1 over GLOVE_T. Out of an iron cup by the player (where you
  // stand NOW), at the spot it hit: cocked, shot out with an overshoot, held squashed on the hit with a
  // star, sprung back. Big Mitt (a bigger fist radius) draws a bigger glove.
  function glove(g, p, P) {
    const u = g.t / GLOVE_T, a = Math.atan2(g.ty - p.y, g.tx - p.x), ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca
    const D = hyp(g.tx - p.x, g.ty - p.y), sd = g.seed
    const rake = (x, y, len, wd) => topG.poly([x + nx * wd, y + ny * wd, x - ca * len, y - sa * len, x - nx * wd, y - ny * wd]).fill({ color: C.ink })
    const gs = 0.55 * Math.max(0.8, Math.min(2, g.r / GLOVE_BASE_R)), reach = Math.max(30, D - 40 * gs - 6)
    const e = u < 0.12 ? -0.15 * smooth(0, 0.12, u) : u < 0.24 ? -0.15 + 1.23 * smooth(0.12, 0.24, u) : u < 0.3 ? 1.08 - 0.08 * smooth(0.24, 0.3, u) : u < 0.55 ? 1 : 1 - smooth(0.55, 1, u)
    const bx = p.x + ca * 16, by = p.y + sa * 16, L = Math.max(4, 22 + e * reach)
    const gx = bx + ca * L, gy = by + sa * L
    const loops = 9, amp = 9 * (0.7 + 0.3 * clamp01(1 - e))
    const pts = []
    for (let i = 0; i <= loops * 2; i++) { const f = i / (loops * 2), side = i === 0 || i === loops * 2 ? 0 : (i % 2 ? 1 : -1); pts.push(bx + ca * L * f + nx * amp * side, by + sa * L * f + ny * amp * side) }
    topG.poly(pts, false).stroke({ width: 5, color: C.ink, cap: 'round', join: 'round' })
    topG.poly(pts, false).stroke({ width: 2, color: hexNum(PAL.ironHi), cap: 'round', join: 'round' })
    topG.circle(bx, by, 7).fill({ color: hexNum(PAL.iron) }).stroke({ width: 2.2, color: C.ink })
    if (u > 0.12 && u < 0.3) for (let i = -1; i <= 1; i += 2) for (let j = 0; j < 2; j++) rake(gx - ca * (10 + 22 * j) + nx * i * 22, gy - sa * (10 + 22 * j) + ny * i * 22, 34, 2.4)
    const hit = smooth(0.22, 0.26, u) * (1 - smooth(0.3, 0.42, u))
    const gl = tools.next(P.boxGlove); gl.position.set(gx, gy); gl.rotation = a; gl.scale.set(gs * (1 - 0.15 * hit), gs * (1 + 0.15 * hit))
    if (hit > 0.05) { const st = tools.next(P.star); st.position.set(gx + ca * 46 * gs, gy + sa * 46 * gs); st.scale.set(0.55 * hit); st.rotation = sd }
  }
  function hideAll() {
    for (const bp of [low, tools, ...boatPools]) { bp.begin(); bp.end() }
  }
  return {
    reset() { pour = null; bursts.length = 0; pings.length = 0; gloves.length = 0; for (const g of GS) g.clear(); hideAll() },
    event(e) {
      if (e.type === 'punch') { gloves.push({ tx: e.tx, ty: e.ty, r: e.r || GLOVE_BASE_R, t: 0, seed: Math.floor(Math.abs(e.tx * 3 + e.ty)) }); if (gloves.length > 12) gloves.shift(); return true }
      if (e.type === 'shoot' && e.weapon === 'quenchKettle') { pour = { x: e.tx ?? e.x, y: e.ty ?? e.y, r: e.maxR || 100, t: 0 }; return false }
      if (e.type === 'coalBounce') { pings.push({ x: e.x, y: e.y, bumper: e.bumper || 0, ox: e.ox, oy: e.oy, t: 0 }); if (pings.length > 40) pings.shift(); return true }
      if (e.type !== 'melt' && e.type !== 'crumble' && e.type !== 'boatSink' && e.type !== 'steamBlast' && e.type !== 'hullCool') return false
      bursts.push({ kind: e.type, id: e.rosterId, x: e.x, y: e.type === 'boatSink' || e.type === 'hullCool' ? e.y + BOAT_DY : e.y, r: e.r || (e.type === 'boatSink' ? 30 : 14), t: 0, seed: Math.floor(Math.abs(e.x * 7 + e.y * 13)) })
      if (bursts.length > 80) bursts.shift()
      return true
    },
    // tide = { L, T } (lavaTideOf, or the dry fallback with line -1); onScreen(x, y, r); t = animT
    sync(run, dt, tide, onScreen, t) {
      clock += dt
      // the cast's cycling looks pick their frame off animT; render.js draws them before this runs, so
      // hand over the clock it will have next frame
      setCastClock(t + dt)
      if (pour) pour.t += dt
      for (const g of GS) g.clear()
      const P = art()
      for (const bp of [low, tools, ...boatPools]) bp.begin()
      const { L, T } = tide
      const line = T.line
      const p = run.player
      const livePools = (run.lavaPools ?? []).filter((q) => q.t < q.dur)
      // ---- the stalagmites (run.obstacles kind 'stalagmite'), under the crowd like every obstacle: a
      // soft shadow at the foot on rock, a ring of hot lava round it standing in the tide ----
      for (const o of run.obstacles ?? []) {
        if (o.kind !== 'stalagmite' || !onScreen(o.x, o.y - o.r, o.r * 3)) continue
        const k = o.r / STAL_BAKE_R
        if (run.lavaTide && mantleHeightAt(L, T.seed, o.x, o.y) < line) {
          groundG.ellipse(o.x, o.y + 2 * k, o.r * 1.15, o.r * 0.4).fill({ color: C.lavaHot, alpha: 0.85 })
          groundG.ellipse(o.x, o.y + 2 * k, o.r * 1.4, o.r * 0.52).stroke({ width: 2.5, color: C.lavaWhite, alpha: 0.55 })
        } else groundG.ellipse(o.x, o.y + 2 * k, o.r * 1.05, o.r * 0.36).fill({ color: C.ink, alpha: 0.28 })
        const sp = low.next(P.stal[stalVariant(o)]); sp.position.set(o.x, o.y); sp.scale.set(k)
      }

      // ---- the hammer's stamp, drawn off each pool's first moments (the floor paints the pool itself) ----
      for (const q of livePools) {
        if (q.t >= 0.42 || !onScreen(q.x, q.y, q.r * 2.2)) continue
        const sd = Math.floor(Math.abs(q.x * 3 + q.y * 5))
        if (q.t < 0.42) {
          // THE SWING, beside its target so it is always in the frame: the hand (pivot) down to one side,
          // the head wound up overhead, a smear down its path, the head landing at t = 0.09 and held two
          // frames squashed, a recoil
          const sg = sd & 1 ? 1 : -1
          const hx = q.x + sg * 72, hy = q.y + 32, Lh = hyp(q.x - hx, q.y - hy), ls = Lh / HAMMER_L
          const aHit = Math.atan2(q.y - hy, q.x - hx), aUp = Math.atan2(q.y - 96 - hy, q.x - hx)   // wound up: the head held right over its target
          let dA = aHit - aUp
          while (dA > Math.PI) dA -= TAU
          while (dA < -Math.PI) dA += TAU
          let f, sx = 1, sy = 1, al = 1   // f: 0 the head straight up, 1 the head on the target
          // anticipation (a dip toward the target, squashed), then cocked (pulled well back, stretched), then
          // the swing; the head is drawn bigger while raised (nearer the camera)
          if (q.t < 0.03) { f = 0.12 * Math.sin(Math.PI * q.t / 0.03); sx = 1.12; sy = 0.86 }
          else if (q.t < 0.055) { const u = (q.t - 0.03) / 0.025; f = -0.8 * Math.sin(Math.PI / 2 * u); sx = 1.28; sy = 1.08 }
          else if (q.t < 0.09) { const u = (q.t - 0.055) / 0.035; f = -0.8 + 1.8 * u * u; sx = 1.3 - 0.15 * u; sy = 1.05 }
          else if (q.t < 0.13) { f = 1; sx = 1.16; sy = 0.7 }
          else { const u = (q.t - 0.13) / 0.29; f = 1 - 0.28 * Math.sin(Math.PI * Math.min(1, u * 1.2)); al = 1 - smooth(0.6, 1, u) }
          const aNow = aUp + dA * f
          if (q.t >= 0.06 && q.t < 0.115) {
            // the smear: a tapered arc along the head's path from the cocked pose, fat at the head, inked,
            // raked through; on the contact frames it trails behind the head
            const a0 = aUp + dA * -0.8, aE = q.t < 0.09 ? aNow : aHit, n = 16, S = [], Lr = Lh * Math.max(1, sx * 0.95)
            for (let i = 0; i <= n; i++) { const u = i / n, a = a0 + (aE - a0) * u, w = 42 * Math.pow(u, 0.8); S.push(hx + Math.cos(a) * (Lr + w * 0.55), hy + Math.sin(a) * (Lr + w * 0.55)) }
            for (let i = n; i >= 0; i--) { const u = i / n, a = a0 + (aE - a0) * u, w = 42 * Math.pow(u, 0.8); S.push(hx + Math.cos(a) * (Lr - w * 0.9), hy + Math.sin(a) * (Lr - w * 0.9)) }
            celPoly(topG, S, 0xfff6e0, { ink: 2.2 })
            for (const [dr, u0] of [[-8, 0.35], [0, 0.2], [8, 0.5]]) {
              topG.moveTo(hx + Math.cos(a0 + (aE - a0) * u0) * (Lr + dr), hy + Math.sin(a0 + (aE - a0) * u0) * (Lr + dr))
              for (let i = 1; i <= 6; i++) { const u = u0 + (0.92 - u0) * (i / 6), a = a0 + (aE - a0) * u; topG.lineTo(hx + Math.cos(a) * (Lr + dr), hy + Math.sin(a) * (Lr + dr)) }
              topG.stroke({ width: 1.4, color: C.ink, cap: 'round' })
            }
          }
          const h = tools.next(P.hammer)
          h.position.set(hx, hy); h.rotation = aNow + Math.PI
          h.scale.set(sx * ls, sy * ls * (Math.cos(aNow) > 0 ? -1 : 1)); h.alpha = al
          // the impact: a star, streaks, chunks of rock tumbling out, a ring of dust puffs, all shaking
          const shake = q.t >= 0.09 && q.t < 0.16 ? (Math.floor(q.t * 60) & 1 ? 3 : -3) : 0
          if (q.t >= 0.09 && q.t < 0.17) {
            const u = (q.t - 0.09) / 0.08
            for (let i = 0; i < 11; i++) {
              const a = (i / 11) * TAU + rh(i, sd, 70) * 0.4, r0 = 34 + 50 * u, r1 = r0 + 18 + 42 * rh(i, sd, 71), w = 3.4 * (1 - u) + 1
              const nx = -Math.sin(a) * w, ny = Math.cos(a) * w, cx = q.x + shake, cy = q.y
              celPoly(topG2, [cx + Math.cos(a) * r0 + nx, cy + Math.sin(a) * r0 + ny, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r0 - nx, cy + Math.sin(a) * r0 - ny], C.lavaGlow, { ink: 1.4 })
            }
          }
          if (q.t >= 0.09 && q.t < 0.2) {
            const u = (q.t - 0.09) / 0.11, st = tools.next(P.star)
            st.position.set(q.x + shake, q.y - shake * 0.5); st.rotation = sd + u * 0.3
            st.scale.set(0.95 + 0.35 * u); st.alpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3
          }
          const fl = (q.t - 0.09) / 0.33
          if (fl > 0) for (let i = 0; i < 9; i++) {
            const a = (i / 9) * TAU + rh(i, sd, 11) * 0.6, e = 1 - (1 - fl) * (1 - fl)
            const dd = q.r * (0.3 + (0.9 + 0.6 * rh(i, sd, 12)) * e)
            const ch = tools.next(P.chunk[(i + sd) % 6])
            ch.position.set(q.x + Math.cos(a) * dd + shake, q.y + Math.sin(a) * dd * 0.85 - Math.sin(Math.PI * fl) * (22 + 22 * rh(i, sd, 13)))
            ch.rotation = a + fl * (5 + 6 * rh(i, sd, 16)) * (i & 1 ? 1 : -1)
            const cs = (0.7 + 0.8 * rh(i, sd, 14)) * (1 - 0.3 * fl)
            ch.scale.set(cs, cs * (0.6 + 0.4 * Math.abs(Math.cos(fl * 9 + i))))   // tumbling: it turns edge-on and back
            ch.alpha = 1 - smooth(0.75, 1, fl)
          }
          if (fl > 0) for (let i = 0; i < 10; i++) {
            const a = (i / 10) * TAU + rh(i, sd, 15), dd = q.r * (0.45 + 0.75 * Math.sqrt(fl))
            const du = low.next(P.dust[i % 4])
            du.position.set(q.x + Math.cos(a) * dd, q.y + Math.sin(a) * dd * 0.8 - 6 * fl)
            du.scale.set((0.38 + 0.45 * fl) * (1 - smooth(0.6, 1, fl)) * (0.8 + 0.4 * rh(i, sd, 17))); du.rotation = (rh(i, sd, 18) - 0.5) * 0.6
          }
        }
      }

      // ---- the kettle's pours: steam off each fresh crust and the kettle for the newest (the floor
      // paints the crust itself) ----
      const crusts = run.quenchCrusts ?? []
      const draw = []
      for (let ci = Math.max(0, crusts.length - DRAW_CAPS.quenchCrusts); ci < crusts.length; ci++) {
        const c = crusts[ci]
        if (c.t < c.dur && onScreen(c.x, c.y, c.r * 1.2)) draw.push(c)
      }
      const Lc = run.lavaTide ? L : null
      const lavaAt = (x, y, c) => (Lc && mantleHeightAt(Lc, T.seed, x, y) < c.line) || (c.under ?? []).some((q) => poolRimDepth(q, x, y) > 0)
      for (const c of draw) {
        const sd = Math.floor(Math.abs(c.x * 0.37 + c.y * 0.61))
        // the pour: steam boiling up off the splash in two-tone puffs that rise, swell, split into smaller
        // ones and are gone in under a second
        if (c.t < 1.6) {
          const s0 = c.r / 130
          for (let i = 0; i < 9; i++) {
            const born = 0.1 + i * 0.07, life = 0.8, a = (c.t - born) / life
            if (a <= 0 || a >= 1) continue
            const ang = rh(i, sd, 21) * TAU, rr = c.r * (0.15 + 0.6 * rh(i, sd, 22))
            const x0 = c.x + Math.cos(ang) * rr, y0 = c.y + Math.sin(ang) * rr
            if (!lavaAt(x0, y0, c)) continue   // no steam off what was dry rock when it was poured
            const rise = 1 - (1 - a) * (1 - a), base = (0.8 + 0.5 * rh(i, sd, 23)) * s0
            const x = x0 + Math.cos(ang) * rise * 12 * s0, y = y0 - rise * 70 * s0
            if (a < 0.55) {
              const st = low.next(P.steam[(i + sd) % 6])
              st.position.set(x, y); st.scale.set(base * (0.35 + 1.2 * a / 0.55)); st.rotation = (rh(i, sd, 24) - 0.5) * 0.7
            } else {
              const u = (a - 0.55) / 0.45
              for (let k2 = 0; k2 < 2; k2++) {
                const st = low.next(P.steam[(i + sd + 2 + k2) % 6]), dx = (k2 ? 1 : -1) * (8 + 18 * u) * s0
                st.position.set(x + dx, y - 6 * u - k2 * 6); st.scale.set(base * 0.62 * (1 - u * u)); st.rotation = (k2 - 0.5) * 0.5
              }
            }
            // a trail of dots under it
            for (let k2 = 1; k2 <= 2; k2++) groundG.circle(x + 2 * k2, y + (16 + 9 * k2) * s0 * (1 - a * 0.5), 1.8 - 0.4 * k2).fill({ color: C.ink, alpha: 1 - a })
          }
        }
      }
      // the kettle itself, for the newest pour: over the digger's shoulder, anticipation, a smear as it
      // tips, the pour held, a squash back. The water is THROWN: an arc from the spout to the target
      // point (here the crust's centre, which is under the digger), landing in a splash crown that
      // flings many small drops; it works for any target out to ~200px.
      if (pour && pour.t < 0.72) {
        const k = pour.t, tx = pour.x, ty = pour.y + 6
        // the kettle leans toward its target: it holds on the side of the digger the throw goes to
        const side = tx >= p.x - 4 ? 1 : -1
        let tilt, sx = 1, sy = 1, pop = 1
        if (k < 0.08) { const u = k / 0.08; pop = u < 0.6 ? u / 0.6 * 1.15 : 1.15 - 0.15 * (u - 0.6) / 0.4; tilt = -0.3 * u; sx = 1.1; sy = 0.9 }
        else if (k < 0.15) { const u = (k - 0.08) / 0.07; tilt = -0.3 + 1.4 * u * u; sx = 1 + 0.2 * Math.sin(Math.PI * u); sy = 1 - 0.12 * Math.sin(Math.PI * u) }
        else if (k < 0.5) { tilt = 1.1 + 0.06 * Math.sin((k - 0.15) * 30) }
        else if (k < 0.6) { const u = (k - 0.5) / 0.1; tilt = 1.1 * (1 - u); sx = 1 - 0.12 * Math.sin(Math.PI * u); sy = 1 + 0.12 * Math.sin(Math.PI * u) }
        else { const u = (k - 0.6) / 0.12; tilt = 0; pop = 1 - u * u }
        const kx = p.x + side * 26, ky = p.y - 62
        if (k >= 0.08 && k < 0.15) {
          // the smear of the tip: a tapered crescent over the kettle's top, inked
          const u = (k - 0.08) / 0.07, a0 = -Math.PI / 2 - 0.3 * side, a1 = -Math.PI / 2 + side * (-0.3 + 1.4 * u * u), n = 10, S = []
          for (let i = 0; i <= n; i++) { const v = i / n, a = a0 + (a1 - a0) * v, w = 14 * Math.pow(v, 0.8); S.push(kx + Math.cos(a) * (30 + w * 0.6), ky + Math.sin(a) * (30 + w * 0.6)) }
          for (let i = n; i >= 0; i--) { const v = i / n, a = a0 + (a1 - a0) * v, w = 14 * Math.pow(v, 0.8); S.push(kx + Math.cos(a) * (30 - w * 0.4), ky + Math.sin(a) * (30 - w * 0.4)) }
          celPoly(topG, S, 0xfff6e0, { ink: 1.8 })
        }
        const kt = tools.next(P.kettle)
        kt.position.set(kx, ky); kt.rotation = tilt * side; kt.scale.set(sx * pop * side, sy * pop)
        if (k > 0.12 && k < 0.6) {
          const cs = Math.cos(tilt * side), sn = Math.sin(tilt * side), lx = KETTLE_TIP[0] * sx * pop * side, ly = KETTLE_TIP[1] * sy * pop
          const ox = kx + lx * cs - ly * sn, oy = ky + lx * sn + ly * cs
          const d = hyp(tx - ox, ty - oy), H = Math.max(14, d * 0.3)
          const path = (u) => [ox + (tx - ox) * u, oy + (ty - oy) * u - H * 4 * u * (1 - u)]
          const head = smooth(0.12, 0.2, k), tail = smooth(0.48, 0.57, k)
          // the water: pale blue-white, a gloss streak and a shade line, thin out of the spout and swelling
          // into a fat leading slug toward where it lands, gulps running down it; its last stretch breaks
          // into blobs, the biggest out in front
          const fat = head < 1 ? 0.8 : 1 + 0.25 * Math.max(0, 1 - (k - 0.2) * 12)
          const wd = (u) => (3.2 + 6.8 * u) * fat * (1 + 0.22 * Math.max(0, Math.sin((u - k * 6) * 10)))
          const BRK = 0.74, tubeEnd = Math.min(head, BRK)
          const n = 16, Lp = [], Rp = []
          for (let i = 0; i <= n; i++) {
            const u = tail + (tubeEnd - tail) * (i / n), [x, y] = path(u), [x2, y2] = path(Math.min(1, u + 0.01))
            const tl = hyp(x2 - x, y2 - y) || 1, nx = -(y2 - y) / tl, ny = (x2 - x) / tl, w = wd(u)
            Lp.push(x + nx * w, y + ny * w); Rp.unshift(x - nx * w, y - ny * w)
          }
          if (tubeEnd - tail > 0.01) {
            celPoly(topG2, [...Lp, ...Rp], 0xdcf1f4, { ink: 2.4 })
            const line2 = (off, col, wdt) => {
              topG2.moveTo(...path(tail + (tubeEnd - tail) * 0.06))
              for (let i = 1; i <= n; i++) {
                const u = tail + (tubeEnd - tail) * (0.06 + 0.88 * i / n), [x, y] = path(u), [x2, y2] = path(Math.min(1, u + 0.01))
                const tl = hyp(x2 - x, y2 - y) || 1, w = wd(u) * off
                topG2.lineTo(x - (y2 - y) / tl * w, y + (x2 - x) / tl * w)
              }
              topG2.stroke({ width: wdt, color: col, cap: 'round' })
            }
            line2(-0.5, 0xa6d4de, 3)
            line2(0.45, 0xffffff, 2.4)
          }
          // past the break: blobs, then drops, shrinking toward the splash
          if (head > BRK) for (let i = 0; i < 6; i++) {
            const u = BRK + (head - BRK) * ((i + 0.5) / 6) + 0.01 * Math.sin(k * 50 + i)
            if (u <= tail) continue
            const [x, y] = path(u), r = wd(u) * (0.7 + 0.3 * (i / 6))
            if (i >= 3) celPoly(topG2, polar(x, y, (a) => r * (1 + 0.12 * Math.sin(a * 3 + i)), 14).flat(), 0xdcf1f4, { ink: 1.8 })
            else { const dr = tools.next(P.waterDrop), [x2, y2] = path(Math.min(1, u + 0.02)); dr.position.set(x, y); dr.rotation = Math.atan2(y2 - y, x2 - x) - Math.PI / 2; dr.scale.set(0.5 + 0.1 * i) }
          }
          // the tail breaking into drops behind it as the pour stops
          if (tail > 0) for (let i = 0; i < 4; i++) {
            const u = Math.max(0, tail - 0.06 * (i + 1)), [x, y] = path(u), dr = tools.next(P.waterDrop)
            dr.position.set(x, y + 8 * i * tail); dr.rotation = Math.PI; dr.scale.set(0.55 - 0.08 * i)
          }
          // the splash: a ring of inked water blobs pushing outward from where it lands
          if (head >= 1) {
            const e = clamp01((k - 0.19) / 0.4), ee = 1 - (1 - e) * (1 - e), rr = 10 + 62 * ee, nb = 18
            if (e < 1) for (let i = 0; i < nb; i++) {
              const a = (i / nb) * TAU + rh(i, 6, 1) * 0.2, bx = tx + Math.cos(a) * rr, by = ty + Math.sin(a) * rr * 0.6
              const r = (5.5 * (1 - ee) + 2) * (0.75 + 0.5 * rh(i, 6, 2))
              celPoly(topG, polar(bx, by, () => r, 12).flat(), 0xdcf1f4, { ink: 1.6, alpha: 1 - smooth(0.7, 1, e) })
            }
          }
          if (head >= 1 && tail < 1) {
            const cr = tools.next(P.crown)
            cr.position.set(tx, ty); cr.scale.set(1.25 + 0.15 * Math.sin(k * 60), 1.15 + 0.25 * Math.sin(k * 47))
            for (let i = 0; i < 12; i++) {
              const u = (k * 3.2 + i / 12) % 1, a = -Math.PI / 2 + (rh(i, 5, 1) - 0.5) * 2.6, sp2 = 30 + 26 * rh(i, 5, 2)
              const dr = tools.next(P.waterDrop)
              dr.position.set(tx + Math.cos(a) * sp2 * u, ty - 4 + Math.sin(a) * sp2 * 0.8 * u + 44 * u * u)
              dr.rotation = Math.atan2(Math.sin(a) * 0.8 + 88 * u / sp2, Math.cos(a)) + Math.PI / 2; dr.scale.set((0.35 + 0.3 * rh(i, 5, 3)) * (1 - 0.3 * u))
            }
          }
        }
      }

      // ---- creatures: a stranded lava one stuck in its own setting lava, a melting rock one slumping ----
      let ns = 0
      for (const e of run.enemies) {
        if (e._dead || !e.habitat || !onScreen(e.x, e.y, e.radius)) continue
        const R = e.radius
        if (e.meltT > 0) {
          const k = Math.min(1, e.meltT / MANTLE_MELT_T), sd = e.id | 0
          // three stages. PANIC (k < 0.33): sweat flying, panic dashes round its head. SLUMP: the lower part
          // of its silhouette gone molten, the melt line inked with drips hanging off it, climbing. PUDDLE
          // (k > 0.7): a flattened inked puddle with its eyes floating in it.
          const rx = R * 1.05, ry = R * 1.15, cy = e.y + R * 0.05
          const kb = smooth(0.15, 1, k)
          const top = cy + ry * (0.9 - 1.6 * kb)
          const th = Math.asin(Math.max(-0.98, Math.min(0.98, (top - cy) / ry)))
          const edgeX = rx * Math.cos(th)
          const lineP = []
          for (let i = 0; i <= 14; i++) {
            const u = i / 14, x = e.x - edgeX + 2 * edgeX * u
            lineP.push(x, top + Math.max(0, Math.sin(u * Math.PI * 3.5 + sd)) ** 4 * R * 0.36 + Math.sin(u * 9 + t * 5) * R * 0.03)
          }
          const S = [...lineP]
          for (let i = 1; i <= 10; i++) { const a = th + (Math.PI - 2 * th) * (i / 10); S.push(e.x + rx * Math.cos(a), cy + ry * Math.sin(a)) }
          if (kb > 0.02) {
            topG.poly(S).fill({ color: C.lava })
            topG.moveTo(lineP[0], lineP[1] + 3.5); for (let i = 2; i < lineP.length; i += 2) topG.lineTo(lineP[i], lineP[i + 1] + 3.5)
            topG.stroke({ width: 2.2, color: C.lavaGlow, cap: 'round' })
            topG.moveTo(lineP[0], lineP[1]); for (let i = 2; i < lineP.length; i += 2) topG.lineTo(lineP[i], lineP[i + 1])
            topG.stroke({ width: 2.4, color: C.ink, cap: 'round', join: 'round' })
          }
          if (k > 0.7) {
            const u = (k - 0.7) / 0.3, pr = R * (1.2 + 0.45 * u), pry = R * (0.42 - 0.16 * u)
            const PP = polar(0, 0, (a) => 1 + 0.16 * Math.sin(a * 5 + sd) + 0.1 * Math.sin(a * 9 + sd * 2) + 0.06 * Math.sin(a * 14), 48).flatMap(([x, y]) => [e.x + x * pr, e.y + R * 0.5 + y * pry])
            celPoly(topG, PP, C.lava, { ink: 2.4 })
            topG.ellipse(e.x - pr * 0.3, e.y + R * 0.4, pr * 0.3, pry * 0.25).fill({ color: C.lavaGlow })
            const ey = tools.next(P.eyes)
            ey.position.set(e.x + Math.sin(t * 3 + sd) * 3, e.y + R * 0.42 + Math.sin(t * 4.3) * 1.2); ey.scale.set(R / 26)
          }
          if (k < 0.7) {
            for (let i = 0; i < 3; i++) {
              const u = (t * 1.9 + i / 3 + sd * 0.13) % 1, sg = i === 1 ? 0 : i ? 1 : -1
              const d = tools.next(P.waterDrop)
              d.position.set(e.x + sg * R * (0.6 + u * 0.9), e.y - R * (1.15 + u * 0.5) + u * u * 16)
              d.rotation = sg * (0.6 + u); d.scale.set(0.7); d.alpha = 1 - u
            }
          }
          if (k < 0.35) for (let i = 0; i < 4; i++) {
            const a = -Math.PI / 2 + (i - 1.5) * 0.45, r0 = R * 1.25, r1 = R * 1.55
            topG.moveTo(e.x + Math.cos(a) * r0, e.y - R * 0.2 + Math.sin(a) * r0).lineTo(e.x + Math.cos(a) * r1, e.y - R * 0.2 + Math.sin(a) * r1)
          }
          if (k < 0.35) topG.stroke({ width: 2, color: C.ink, cap: 'round' })
          if (kb > 0.1 && k < 0.85) for (let i = 0; i < 3; i++) {
            const u = (i + 0.5) / 3, dy = (t * 1.3 + i * 0.37 + sd * 0.1) % 1
            const d = tools.next(P.lavaDrop)
            d.position.set(e.x + (u * 2 - 1) * R * 0.6, top + R * 0.2 + dy * (e.y + R - top) * 0.8); d.rotation = Math.PI; d.scale.set(0.55 + 0.35 * k)
          }
        }
        if (e.strandT > 0 && ns < STRAND_CAP) { ns++; strand(e, t, P, p) }
      }

      // ---- the Spring Glove's punches, on top ----
      for (const g of gloves) g.t += dt
      while (gloves.length && gloves[0].t >= GLOVE_T) gloves.shift()
      for (const g of gloves) if (onScreen(g.tx, g.ty, 120)) glove(g, p, P)

      // ---- the pinball coal: an ink trail behind each coal, a ping star where it bounces, and a Bumper's
      // flash (a hot glow round the stalagmite, ink rays out of it) ----
      for (const b of run.bullets ?? []) {
        if (b.weapon !== 'coal' || !onScreen(b.x, b.y, 60)) continue
        const v = hyp(b.vx, b.vy) || 1, ux = b.vx / v, uy = b.vy / v, nx = -uy, ny = ux
        for (let i = -1; i <= 1; i++) {
          const x0 = b.x - ux * 12 + nx * i * 5, y0 = b.y - uy * 12 + ny * i * 5, L = i ? 22 : 34
          topG.poly([x0 + nx * 2.2, y0 + ny * 2.2, x0 - ux * L, y0 - uy * L, x0 - nx * 2.2, y0 - ny * 2.2]).fill({ color: C.ink, alpha: 0.75 })
        }
      }
      for (const g of pings) g.t += dt
      while (pings.length && pings[0].t > 0.35) pings.shift()
      for (const g of pings) {
        if (!onScreen(g.x, g.y, 40 + g.bumper)) continue
        const k = g.t / 0.35
        const st = tools.next(P.star); st.position.set(g.x, g.y); st.rotation = g.x; st.scale.set(0.34 * (1 - k * k))
        if (g.bumper > 0) {
          groundG.circle(g.ox, g.oy, g.bumper).fill({ color: C.lavaGlow, alpha: 0.4 * (1 - k) })
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + g.ox * 0.01, r0 = g.bumper * (0.55 + 0.3 * k), r1 = g.bumper * (0.85 + 0.3 * k)
            topG.moveTo(g.ox + Math.cos(a) * r0, g.oy + Math.sin(a) * r0).lineTo(g.ox + Math.cos(a) * r1, g.oy + Math.sin(a) * r1)
          }
          topG.stroke({ width: 3, color: C.ink, alpha: 1 - k, cap: 'round' })
        }
      }

      // ---- melt, crumble and sink bursts ----
      for (const b of bursts) b.t += dt
      while (bursts.length && bursts[0].t > 0.9) bursts.shift()
      for (const b of bursts) {
        if (!onScreen(b.x, b.y, b.r * 3)) continue
        const k = b.t / 0.9
        if (b.kind === 'melt') {
          // gone under: a splat, an inked steam puff about its own size (grey shade) swelling then splitting
          // away, drops
          const s = low.next(P.splat[b.seed & 1])
          s.position.set(b.x, b.y + b.r * 0.4); s.scale.set((b.r / 14) * (0.7 + 0.5 * Math.min(1, k * 5))); s.alpha = 1 - smooth(0.6, 1, k)
          const big = (b.r * 2.4) / 52
          if (k < 0.6) {
            const sm = tools.next(P.puffGrey[b.seed % 3])
            sm.position.set(b.x, b.y - b.r * (0.3 + 0.6 * k)); sm.scale.set(big * (0.35 + 0.65 * Math.min(1, k * 4)))
          } else {
            const u = (k - 0.6) / 0.4
            for (let i = 0; i < 3; i++) {
              const sm = tools.next(P.puffGrey[(b.seed + i + 1) % 3]), a = -Math.PI / 2 + (i - 1) * 1.1
              sm.position.set(b.x + Math.cos(a) * b.r * (0.5 + 0.8 * u), b.y - b.r * 0.7 + Math.sin(a) * b.r * (0.5 + 0.8 * u)); sm.scale.set(big * 0.45 * (1 - u * u))
            }
          }
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + (rh(i, b.seed, 1) - 0.5) * 3.4, d = b.r * (0.8 + (2.4 + 1.6 * rh(i, b.seed, 2)) * k)
            const dr = low.next(P.lavaDrop)
            dr.position.set(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d * 0.6 + 40 * k * k); dr.rotation = a + Math.PI / 2 + k * 2; dr.scale.set(0.6 * (1 - 0.4 * k)); dr.alpha = 1 - smooth(0.7, 1, k)
          }
        } else if (b.kind === 'steamBlast') {
          // water on the hammer's lava: a white gout of steam bursting up and out over the whole reach,
          // a ring of puffs rolling outward, the pool's splat cooling grey under it
          const sp = low.next(P.splat[b.seed & 1])
          sp.position.set(b.x, b.y); sp.scale.set((b.r / 30) * (0.7 + 0.4 * Math.min(1, k * 5))); sp.alpha = 0.8 * (1 - smooth(0.4, 1, k)); sp.tint = 0x8a8a96
          const big = tools.next(P.steam[b.seed % 6])
          big.position.set(b.x, b.y - b.r * (0.2 + 0.7 * k)); big.scale.set((b.r / 60) * (0.5 + 1.1 * Math.min(1, k * 3)) * (1 - smooth(0.7, 1, k)))
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + b.seed * 0.7, d = b.r * (0.25 + 0.85 * Math.sqrt(k))
            const st = tools.next(P.steam[(b.seed + i + 1) % 6])
            st.position.set(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d * 0.6 - 26 * k); st.scale.set((b.r / 110) * (0.4 + 0.8 * Math.min(1, k * 4)) * (1 - smooth(0.6, 1, k)))
          }
        } else if (b.kind === 'hullCool') {
          // the kettle's water on your hot hull: a hiss of steam off both sides, rising
          for (let i = 0; i < 3; i++) {
            const st = tools.next(P.steam[(b.seed + i) % 6])
            st.position.set(b.x + (i - 1) * 22, b.y - 14 - k * (26 + 8 * i)); st.scale.set(0.42 * (0.4 + k) * (1 - smooth(0.6, 1, k)))
          }
        } else if (b.kind === 'boatSink') {
          // gone under: a lava splash ring, planks flung up and out, a gout of steam, bubbles
          const sp = low.next(P.splat[b.seed & 1])
          sp.position.set(b.x, b.y); sp.scale.set(2.4 * (0.6 + 0.6 * Math.min(1, k * 4))); sp.alpha = 1 - smooth(0.55, 1, k)
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + (i - 2) * 0.62 + (rh(i, b.seed, 4) - 0.5) * 0.3, d = 14 + 70 * k * (0.7 + 0.5 * rh(i, b.seed, 5))
            const pl = tools.next(P.plank[i % 3])
            pl.position.set(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d * 0.55 - 34 * Math.sin(Math.PI * Math.min(1, k * 1.3)))
            pl.rotation = a + k * (4 + i); pl.alpha = 1 - smooth(0.7, 1, k)
          }
          for (let i = 0; i < 3; i++) {
            const st = tools.next(P.steam[(b.seed + i) % 6])
            st.position.set(b.x + (i - 1) * 18, b.y - 8 - k * (30 + 10 * i)); st.scale.set(0.55 * (0.4 + k) * (1 - smooth(0.7, 1, k)))
          }
          for (let i = 0; i < 6; i++) {
            const q = (k * 1.6 + i / 6) % 1, a = rh(i, b.seed, 6) * TAU
            const bb = tools.next(P.bubble)
            bb.position.set(b.x + Math.cos(a) * 26, b.y + Math.sin(a) * 10 - q * 30); bb.alpha = 1 - smooth(0.7, 1, q)
          }
        } else {
          // crumbled: it falls apart into four pieces of its own body flung out across the rock with a hop,
          // its eyes popping up out of the middle and blinking out last, a puff of dust under it all
          const pcs = P.piece[b.id] ?? P.piece._, sz = b.r / 14
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU + b.seed * 0.7, d = b.r * (0.45 + 1.7 * Math.sqrt(k)) * (0.8 + 0.4 * rh(i, b.seed, 8))
            const ch = tools.next(pcs[(i + b.seed) % 3])
            ch.position.set(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d * 0.7 - b.r * 0.9 * Math.sin(Math.PI * Math.min(1, k * 1.4)))
            ch.rotation = a + Math.PI + k * (i & 1 ? 3 : -3); ch.scale.set(sz * (0.8 - 0.25 * k)); ch.alpha = 1 - smooth(0.7, 1, k)
          }
          const ey = tools.next(P.eyes)
          ey.position.set(b.x, b.y - b.r * (0.2 + 1.1 * Math.sin(Math.PI * 0.5 * Math.min(1, k * 2)))); ey.scale.set(sz * 0.6, sz * 0.6 * (k > 0.8 ? Math.max(0.1, 1 - (k - 0.8) * 5) : 1))
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * TAU + b.seed * 0.3, du = low.next(P.dust[(i + b.seed) & 3])
            du.position.set(b.x + Math.cos(a) * b.r * (0.3 + 0.8 * k), b.y + Math.sin(a) * b.r * (0.2 + 0.5 * k))
            du.scale.set((b.r / 22) * 0.55 * (k < 0.2 ? 0.3 + 3 * k : 0.9 * (1 - smooth(0.5, 1, k)) + 0.05))
          }
        }
      }

      // ---- THE MOORED BOATS (run.boats): bobbing at the shores, beached on the rock, the one you ride
      // carrying you; sinking shows on the boat (it lists, the lava climbs its side and pours in over
      // the rim, your boots go under below half, steam and bubbles near the end) ----
      const fullFloat = L?.boats?.float || 7
      for (const b of run.boats ?? []) {
        if (!onScreen(b.x, b.y, 90)) continue
        const ridden = b.ridden && p.afloat
        // facing: the way it moves while ridden, else nose to the shore (remembered between frames)
        let face = boatFace.get(b)
        if (ridden && Math.abs(b.vx) > 15) face = b.vx > 0 ? 1 : -1
        else if (face === undefined) face = Math.cos(b.heading || 0) >= 0 ? 1 : -1
        boatFace.set(b, face)
        const s = clamp01(1 - b.floatT / fullFloat)   // 0 fresh, 1 gone under
        let vis = boatVis.get(b)
        if (!vis) { vis = { ph: 0, st: 0, bk: b.afloat ? 0 : 1 }; boatVis.set(b, vis) }
        vis.ph += dt * (0.55 + 0.9 * s)   // the smoke chugs faster as it goes under, on its own clock so it never jumps
        vis.bk = b.afloat ? Math.max(0, vis.bk - dt / 0.6) : Math.min(1, vis.bk + dt / 0.6)
        const bk = vis.bk
        const ph = (b.seed % 997) * 0.37
        const X = b.x, Y0 = b.y + BOAT_DY
        // afloat it bobs and lists as it sinks; beached it leans over on the rock (eased between the two)
        const w = Math.sin(t * 2.6 + ph)
        const bob = w * (1.4 + 1.6 * s) * (1 - bk), sq = w * 0.035 * (1 - bk)
        const rot = (Math.sin(t * 1.7 + ph) * (0.035 + 0.08 * s) + face * s * 0.12 + (s > 0.8 ? Math.sin(t * 19) * (s - 0.8) * 0.12 : 0)) * (1 - bk) + face * 0.16 * bk
        const Y = Y0 + bob, sx = face * (1 + sq), sy = 1 - sq, cr = Math.cos(rot), sr = Math.sin(rot)
        const W = (lx, ly) => [X + lx * sx * cr - ly * sy * sr, Y + lx * sx * sr + ly * sy * cr]
        const Wf = (pts) => { const o = []; for (const [lx, ly] of pts) { const q = W(lx, ly); o.push(q[0], q[1]) } return o }
        const under = boatUnderG
        if (b.afloat) {
          // the lava heaving round its hull, and a wake behind it while it moves
          under.ellipse(X, Y0 + 14, 56, 18).fill({ color: C.lavaDeep, alpha: 0.4 })
          const v = Math.hypot(b.vx, b.vy)
          if (v > 25) {
            // the wake: scalloped puffs of churned, brighter lava boiling off the stern and falling
            // behind, each inked, swelling then sinking back (the 1930s foam trail), and two short
            // ripples peeling off its sides
            const dx = -b.vx / v, dy = -b.vy / v, k = Math.min(1, v / 160)
            const sx0 = X + dx * 36, sy0 = Y0 + 16 + dy * 10
            for (let i = 4; i >= 0; i--) {
              const u = (clock * 2.4 + i / 5) % 1, d = 6 + u * 58 * k, r = (5 + 7 * Math.sin(Math.PI * Math.min(1, u * 1.4))) * (0.6 + 0.4 * k)
              const cx = sx0 + dx * d + Math.sin(i * 2.1 + u * 3) * 3, cy = sy0 + dy * d * 0.5 + Math.cos(i * 1.7) * 2
              const lob = []
              for (let j = 0; j < 22; j++) { const a = (j / 22) * TAU, rr = r * (1 + 0.1 * Math.sin(a * 3 + i)); lob.push(cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr * 0.62) }
              celPoly(under, lob, C.lavaHot, { ink: 1.7, alpha: (1 - u) * k })
              under.ellipse(cx - r * 0.3, cy - r * 0.18, r * 0.42, r * 0.18).fill({ color: C.lavaWhite, alpha: (1 - u) * k * 0.9 })
            }
            for (const sgn of [-1, 1]) {
              const u = (clock * 1.3 + (sgn > 0 ? 0.5 : 0)) % 1, d = 20 + u * 40, w = 16 + u * 20
              const ax = sx0 + dx * d, ay = sy0 + dy * d * 0.5 + sgn * w * 0.5
              under.moveTo(ax - dx * 8, ay - sgn * 3).quadraticCurveTo(ax, ay + sgn * 2, ax + dx * 10, ay + sgn * 1).stroke({ width: 2.2, color: C.ink, alpha: (1 - u) * k, cap: 'round' })
            }
          }
        } else {
          under.ellipse(X - face * 3, Y0 + 20, 48, 11).fill({ color: C.ink, alpha: 0.28 })
        }
        // the two pieces: the back always under you, the front over your legs when you ride it
        const back = boatBack.next(P.boatBack), front = (ridden ? boatFrontTop : boatFront).next(P.boatFront)
        for (const sp of [back, front]) { sp.position.set(X, Y); sp.scale.set(sx, sy); sp.rotation = rot }
        // the lava in the hold once it pours in over the rim, rising to a full tub
        if (s > 0.4) {
          const k = 0.35 + 0.65 * smooth(0.4, 0.95, s), cx = 2, cy = -1.5
          const lake = BOAT_OPEN.map(([x, y]) => [cx + (x - cx) * k + Math.sin(y * 0.4 + t * 4) * 0.8, cy + (y - cy) * k])
          celPoly(boatInG, Wf(lake), C.lava, { ink: 1.6 })
          const hi = Wf(lake.filter((_, i) => i % 3 === 0).slice(0, 6).map(([x, y]) => [x * 0.8, y * 0.7 - 0.5]))
          boatInG.poly(hi).fill({ color: C.lavaHot, alpha: 0.9 })
        }
        // the lava up its near side, to the waterline (a little higher the lower it sits)
        const wl = 21 - 9 * s
        const band = bk < 1 ? clipBelow(BOAT_WET, wl, (x) => Math.sin(x * 0.17 + t * 5 + ph) * 1.3) : []
        if (band.length > 2) {
          const G = ridden ? boatBandTop : boatBandG
          G.poly(Wf(band)).fill({ color: C.lava })
          const top = band.filter((q) => q.cut)
          if (top.length > 1) {
            top.sort((a, b2) => a[0] - b2[0])
            const lp = Wf(top)
            G.moveTo(lp[0], lp[1]); for (let i = 2; i < lp.length; i += 2) G.lineTo(lp[i], lp[i + 1])
            G.stroke({ width: 2.4, color: C.ink, cap: 'round', join: 'round' })
            const gp = Wf(top.map(([x, y]) => [x, y + 2.6]).slice(1, -1))
            if (gp.length > 3) { G.moveTo(gp[0], gp[1]); for (let i = 2; i < gp.length; i += 2) G.lineTo(gp[i], gp[i + 1]); G.stroke({ width: 1.8, color: C.lavaGlow, cap: 'round' }) }
          }
        }
        // smoke off its stack while it floats, chugging faster as it goes under
        if (s < 0.92 && bk < 1) {
          for (let i = 0; i < 2; i++) {
            const u = (vis.ph + i / 2 + ph) % 1
            const [mx, my] = W(BOAT_STACK[0], BOAT_STACK[1])
            const sm = tools.next(P.smoke[(i + (b.seed & 1)) % 3])
            sm.position.set(mx + Math.sin(u * 5 + i) * 3 - face * u * 8, my - u * 30)
            sm.scale.set(0.2 * (0.45 + u) * (1 - smooth(0.75, 1, u)))
          }
        }
        // near the end: steam and open bubbles boiling up round it, faster and faster
        const u2 = clamp01((s - 0.6) / 0.4)
        vis.st += dt * (0.7 + 2.3 * u2)
        if (s > 0.6 && bk < 1) {
          const nb = 3 + Math.round(5 * u2)
          for (let i = 0; i < nb; i++) {
            const q = (vis.st + i / nb) % 1, a = rh(i, 3, 1) * TAU, rr = 34 + 16 * rh(i, 3, 2)
            const bx = X + Math.cos(a) * rr, by = Y0 + 12 + Math.sin(a) * rr * 0.45 - q * 46
            if (i % 3 === 0) { const st = tools.next(P.steam[i % 6]); st.position.set(bx, by - 10); st.scale.set(0.32 * (0.5 + q) * (1 - smooth(0.7, 1, q))) }
            else { const bb = tools.next(P.bubble); bb.position.set(bx, by); bb.scale.set(0.7 + 0.6 * rh(i, 3, 3)); bb.alpha = 1 - smooth(0.75, 1, q) }
          }
        }
        // below half, riding: the lava in the hold is up over your boots
        if (ridden && s > 0.5) {
          const u = (s - 0.5) / 0.5
          const lw = 20 + 8 * u, ly = p.y + 20 - 6 * u, S = []
          for (let i = 0; i <= 10; i++) { const v = i / 10; S.push(p.x + (v * 2 - 1) * lw, ly + Math.sin(v * 9 + t * 6) * 1.5 - Math.sin(Math.PI * v) * 3) }
          for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; S.push(p.x + Math.cos(a) * lw, ly + 4 + Math.sin(a) * (6 + 3 * u)) }
          bootG.poly(S).fill({ color: C.lava })
          bootG.moveTo(S[0], S[1]); for (let i = 2; i <= 20; i += 2) bootG.lineTo(S[i], S[i + 1])
          bootG.stroke({ width: 2.2, color: C.ink, cap: 'round', join: 'round' })
        }
      }
      for (const bp of [low, tools, ...boatPools]) bp.end()
    },
  }
}
