// The Magma's four creatures and the player, painted one art pixel at a time, from directly overhead,
// nose to +x. A Magma body never rotates (ROSTER_LOOKS lean 0): it only mirrors to face you, so every
// art pixel stays square on the chapter's grid.
//
// SIMPLE SHAPES, FEW COLOURS, BOLD SILHOUETTES: each creature is three or four FLAT colours plus an ink
// outline, and one HOT feature of its own (the beetle's seam, the salamander's spots, the tortoise's
// eyes, the drake's spine) that the CRT pass treats as emissive, so it glows in the dark. Every other
// colour is kept shy of "hot" on purpose, so it is LIT rather than lit-up: by the lava and fire around
// it, and by the creature light (CREATURE_LIGHT, src/pixel.js) that keeps every body readable away
// from the lava.
//
// The creatures are character grids ('.' transparent), each with its own palette; legs, tails and
// wings are drawn by code per frame so the walk cycles stay exact.
import { CHAPTERS, ENEMIES } from '../config.js'
import { PAL, PX, PixelCanvas } from './canvas.js'

const P = PAL
export const INK = PAL.ink
export const EYE = '#ffd23a'

// EVERY PAINTER WORKS IN DESIGN UNITS AND IS RASTERISED AT S art pixels per unit (paintCreature sets
// it): an elite is painted 1.5x LARGER at the same art-pixel size, never stretched, so one art pixel
// stays one grid pixel whatever the body's size. A design pixel covers a block of 1 or 2 cells at
// S = 1.5; a disc, a triangle or a limb is re-rasterised at the output resolution, so its edge stays
// one-pixel clean; the ink outline is always one output pixel.
let S = 1
const grid = (w, h) => Array.from({ length: Math.round(h * S) }, () => new Array(Math.round(w * S)).fill('.'))
const span = (v) => { const a = Math.floor(v * S); return [a, Math.max(a + 1, Math.floor((v + 1) * S))] }
function cell(g, x, y, c, empty) { if (g[y] && x >= 0 && x < g[y].length && (!empty || g[y][x] === '.')) g[y][x] = c }
function block(g, x, y, c, empty) {
  const [x0, x1] = span(Math.round(x)), [y0, y1] = span(Math.round(y))
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) cell(g, xx, yy, c, empty)
}
function set(g, x, y, c) { block(g, x, y, c, false) }
// into an EMPTY cell only (limbs go under the body)
function put(g, x, y, c) { block(g, x, y, c, true) }
// a stroke between two design points, rasterised at the output resolution with a square brush
// `w` design units wide
function stroke(g, x0, y0, x1, y1, c, over, w) {
  const b = Math.max(1, Math.round(w * S))
  x0 = Math.round(x0 * S); y0 = Math.round(y0 * S); x1 = Math.round(x1 * S); y1 = Math.round(y1 * S)
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    for (let j = 0; j < b; j++) for (let i = 0; i < b; i++) cell(g, x0 + i, y0 + j, c, !over)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
}
function line(g, x0, y0, x1, y1, c, over = false) { stroke(g, x0, y0, x1, y1, c, over, 1) }
// Every limb is TWO pixels thick: a one-pixel line re-gridded by the CRT breaks into dots. Masses
// survive; hairs do not.
function thick(g, x0, y0, x1, y1, c, over = false) { stroke(g, x0, y0, x1, y1, c, over, 2) }
function disc(g, cx, cy, rx, ry, c, only) {
  cx *= S; cy *= S; rx *= S; ry *= S
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
    if (dx * dx + dy * dy <= 1 && g[y] && x >= 0 && x < g[y].length && (!only || only.includes(g[y][x]))) g[y][x] = c
  }
}
function tri(g, a, b, c, ch) {
  a = [a[0] * S, a[1] * S]; b = [b[0] * S, b[1] * S]; c = [c[0] * S, c[1] * S]
  const minX = Math.floor(Math.min(a[0], b[0], c[0])), maxX = Math.ceil(Math.max(a[0], b[0], c[0]))
  const minY = Math.floor(Math.min(a[1], b[1], c[1])), maxY = Math.ceil(Math.max(a[1], b[1], c[1]))
  const s = (p, q, x, y) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const px = x + 0.5, py = y + 0.5
    const u = s(a, b, px, py), v = s(b, c, px, py), w = s(c, a, px, py)
    if ((u >= 0 && v >= 0 && w >= 0) || (u <= 0 && v <= 0 && w <= 0)) cell(g, x, y, ch)
  }
}
// ink round every filled cell
function outline(g, c = 'k') {
  const h = g.length, w = g[0].length, add = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x] !== '.') continue
    if ([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([a, b]) => b >= 0 && b < h && a >= 0 && a < w && g[b][a] !== '.' && g[b][a] !== c)) add.push([x, y])
  }
  for (const [x, y] of add) g[y][x] = c
}

// ---- Cinder Beetle ------------------------------------------------------------------------------
// Two domed wing cases split down the back by a glowing seam (the coal inside), a glossy spot on each
// case, a narrower pronotum, a small head with two hot eyes and a pair of pale mandibles; six legs in
// alternating tripods.
export const BEETLE = {
  w: 21, h: 17, ax: 10, ay: 8,
  pal: { k: INK, s: '#705e68', S: '#c0acb6', p: '#4a3c44', c: '#ff7a1c', e: EYE, l: '#7a6870', m: '#e0ccb0' },
  paint(f) {
    const W = 21, H = 17, M = 8.5, g = grid(W, H)
    // legs first (they sit under the body): attach x, tip dx (back legs sweep back, front ones
    // forward), tripod; each a straight two-pixel stroke from the body's side to a tip
    for (const [ax, dx, tp] of [[14, 3, 0], [9, 0, 1], [4, -3, 0]]) {
      for (const side of [-1, 1]) {
        const step = ((f + tp + (side > 0 ? 1 : 0)) % 2) ? 1 : -1
        thick(g, ax, M + side * 4, ax + dx + step, M + side * 7.6, 'l')
      }
    }
    disc(g, 7.5, M, 7.2, 6.0, 's')                      // the wing cases
    disc(g, 14.6, M, 2.6, 3.8, 'p')                     // pronotum
    disc(g, 17.6, M, 1.8, 2.4, 'p')                     // head
    for (let x = 1; x <= 13; x++) set(g, x, 8, 'c')     // the seam between the cases, glowing
    disc(g, 6, 5, 3.2, 1.3, 'S', 's'); disc(g, 6, 12, 3.2, 1.3, 'S', 's')   // a glossy spot on each case
    set(g, 18, 6, 'e'); set(g, 18, 10, 'e')
    set(g, 19, 7, 'm'); set(g, 20, 6, 'm'); set(g, 19, 9, 'm'); set(g, 20, 10, 'm')
    outline(g)
    return g
  },
}

// ---- Salamander ---------------------------------------------------------------------------------
// A long low lizard: a round head with bulging hot eyes, a sausage body with a row of glowing yellow
// spots down the back, four legs splayed sideways ending in a fat foot, and a long tail that swings.
export const SALAMANDER = {
  w: 29, h: 17, ax: 15, ay: 8,
  pal: { k: INK, b: '#8a4432', B: '#6a3028', y: '#ffc23a', e: EYE, f: '#a85a40' },
  paint(f) {
    const W = 29, H = 17, M = 8.5, g = grid(W, H)
    const s = f ? 1 : -1
    // legs: shoulders at x18, hips at x10, diagonal pairs swing together. Each leg goes out
    // sideways to an elbow, then the foot points forward (front) or back (hind): a lizard's sprawl.
    for (const [hx, side, fw, front] of [[18, -1, f, 1], [18, 1, 1 - f, 1], [10, -1, 1 - f, 0], [10, 1, f, 0]]) {
      const sw = fw ? 1 : -1
      const ex = hx + (front ? -1 : 1) + sw, ey = M + side * 5
      thick(g, hx, M + side * 2, ex, ey, 'B')
      const fx = ex + (front ? 3 : -3)
      thick(g, ex, ey, fx, ey + side * 1, 'f')
    }
    // the tail: thick at the hips, tapering to a point, swinging
    for (let i = 0; i <= 10; i++) {
      const x = 8 - i, y = M + s * Math.sin((i / 10) * Math.PI * 0.9) * 2.6
      const r = i < 4 ? 1.4 : i < 8 ? 0.9 : 0.5
      disc(g, x + 0.5, y, 0.9, r, 'b')
    }
    disc(g, 13.5, M, 6.6, 2.7, 'b')     // body
    disc(g, 23, M, 3.6, 3.3, 'b')       // head
    disc(g, 19.5, M, 2.5, 2.2, 'b')     // neck
    // the glowing spots, 2x2 so they survive a turn
    for (const [x, y] of [[8, 7], [12, 8], [16, 7], [21, 7]]) { set(g, x, y, 'y'); set(g, x + 1, y, 'y'); set(g, x, y + 1, 'y'); set(g, x + 1, y + 1, 'y') }
    // eyes bulging off the sides of the head
    set(g, 24, 5, 'e'); set(g, 24, 11, 'e'); set(g, 25, 5, 'e'); set(g, 25, 11, 'e')
    outline(g)
    return g
  },
}

// ---- Obsidian Tortoise --------------------------------------------------------------------------
// A big round shell of black volcanic glass, its plates drawn as flat hexes with dark seams (three
// down the spine, a ring around the rim) and one white glint; a blunt head with hot eyes in front,
// four stubby feet at the corners, a stub of tail behind.
export const TORTOISE = {
  w: 28, h: 23, ax: 12, ay: 11,
  pal: { k: INK, g: '#504874', G: '#7268a8', j: '#16121e', w: '#f0eeff', t: '#a08878', u: '#7a645c', e: EYE },
  paint(f) {
    const W = 28, H = 23, cx = 11.5, cy = 11.5, g = grid(W, H)
    const s = f ? 1 : -1
    // feet at the four corners, stepping diagonally; the head; the tail stub
    for (const [fx, fy, d] of [[17, 2.5, 1], [17, 20.5, -1], [6, 2.5, -1], [6, 20.5, 1]]) disc(g, fx + s * d, fy, 2.0, 1.8, 't')
    disc(g, 23.6, cy, 3.0, 2.6, 't')
    disc(g, 21, cy, 2, 2, 't')
    set(g, 0, 11, 'u'); set(g, 1, 11, 'u'); set(g, 0, 12, 'u'); set(g, 1, 12, 'u')
    // the shell: plates labelled, a seam wherever two plates meet
    const rx = 10.4, ry = 8.6
    const label = (x, y) => {
      const px = (x + 0.5) / S, py = (y + 0.5) / S
      const dx = (px - cx) / rx, dy = (py - cy) / ry
      if (dx * dx + dy * dy > 1) return null
      const ix = (px - cx) / (rx - 2.6), iy = (py - cy) / (ry - 2.4)
      if (ix * ix + iy * iy > 1) return 'M' + (Math.floor(((Math.atan2(py - cy, (px - cx) * (ry / rx)) + Math.PI) / (2 * Math.PI)) * 8 + 0.5) % 8)
      for (let k = 0; k < 3; k++) {
        const hx = cx - 5 + k * 5, ax = Math.abs(px - hx), ay = Math.abs(py - cy)
        if (ay <= 2.6 && ax + ay * 0.55 <= 2.9) return 'V' + k
      }
      return 'C' + (py < cy ? 'a' : 'b')
    }
    const L = []
    const OW = g[0].length, OH = g.length
    for (let y = 0; y < OH; y++) { L.push([]); for (let x = 0; x < OW; x++) L[y].push(label(x, y)) }
    for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
      const l = L[y][x]
      if (!l) continue
      const seam = (L[y][x + 1] && L[y][x + 1] !== l) || (L[y + 1]?.[x] && L[y + 1][x] !== l)
      g[y][x] = seam ? 'j' : l[0] === 'V' ? 'G' : 'g'
    }
    set(g, 7, 9, 'w'); set(g, 8, 9, 'w'); set(g, 7, 10, 'w')
    set(g, 25, 9, 'e'); set(g, 25, 14, 'e')
    outline(g)
    return g
  },
}

// ---- Fire Drake ---------------------------------------------------------------------------------
// The elite: a small dragon seen from above, read in four parts at a glance — a HEAD with a snout,
// two eyes and two pale horns sweeping back past it; a thin NECK, so the head stands apart as its
// own lump; two bat WINGS held out sideways from the shoulders (an arm bone, three finger bones, the
// membrane scalloped between them); and a long TAIL ending in a spade. The wings are a darker wine
// than the ochre body, so neck, head and tail stay a separate shape on top of them. Only the eyes
// are hot: anything else glowing on the back blooms into a blaze that swallows the shape. Frame 0 wings spread, frame 1 the downstroke, half folded.
const DRAKE_WINGS = [
  { S: [18, 10], W: [21, 2], F: [[15.5, 0], [10, 2], [7.5, 7]], B: [12.5, 10] },
  { S: [18, 10], W: [21, 4], F: [[15.5, 2.5], [10.5, 4], [8.5, 8]], B: [12.5, 10] },
]
export const DRAKE = {
  w: 35, h: 25, ax: 16, ay: 12,
  pal: { k: INK, n: INK, v: '#4e1426', b: '#84484a', o: '#a85e40', O: '#b48a64', y: '#ffbe3a', h: '#cdb48c', e: EYE },
  paint(f) {
    const W = 35, H = 25, M = 12.5, g = grid(W, H)
    const wg = DRAKE_WINGS[f]
    const tips = [wg.W, ...wg.F, wg.B]
    // the near wing (top half): membrane, scallops bitten out of its trailing edge, bones on top
    for (let i = 0; i < tips.length - 1; i++) tri(g, wg.S, tips[i], tips[i + 1], 'v')
    for (let i = 1; i < tips.length - 1; i++) {
      const a = tips[i], b = tips[i + 1]
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
      const ox = mx - wg.S[0], oy = my - wg.S[1], ol = Math.hypot(ox, oy) || 1
      disc(g, mx + (ox / ol) * 0.9, my + (oy / ol) * 0.9, 1.6, 1.6, '.', 'v')
    }
    thick(g, wg.S[0], wg.S[1] - 1.5, wg.W[0], wg.W[1], 'b', true)
    for (const p of wg.F) line(g, wg.W[0], wg.W[1], p[0], p[1], 'b', true)
    // mirror it to the far side
    const OW = g[0].length, OH = g.length
    for (let y = 0; y < Math.floor(OH / 2); y++) for (let x = 0; x < OW; x++) if (g[y][x] !== '.') g[OH - 1 - y][x] = g[y][x]
    // the tail: tapering, swinging, a spade at the tip
    const sw = f ? 1 : -1
    let tip = null
    for (let i = 0; i <= 9; i++) {
      const x = 12 - i, y = M + sw * Math.sin((i / 9) * Math.PI * 0.9) * 2.4
      disc(g, x + 0.5, y, 0.9, i < 3 ? 1.6 : i < 7 ? 1.1 : 0.7, 'o')
      tip = [x + 0.5, y]
    }
    tri(g, [tip[0] + 0.5, tip[1] - 2.4], [tip[0] + 0.5, tip[1] + 2.4], [tip[0] - 2.6, tip[1]], 'o')
    // body, a paler belly ridge; the thin neck curving out to the head, which swings a little each
    // frame (a creature looking about, not an arrow)
    disc(g, 16.5, M, 5.2, 3.2, 'o')
    disc(g, 17, M, 3.4, 1.6, 'O')
    const hy = M + (f ? 1.2 : -1.2)
    for (let i = 0; i <= 6; i++) {
      const u = i / 6, x = 21 + u * 6, y = M + (hy - M) * u * u
      disc(g, x, y, 1.1, 1.25, 'o')
    }
    const hx = 27.5
    // the head: a broad skull, a rounded muzzle, a paler brow; an eye each side, two nostrils, and two
    // horns off the back corners of the skull, swept back
    disc(g, hx, hy, 3.5, 3.1, 'o')
    disc(g, hx + 3.4, hy, 2.4, 1.9, 'o')
    disc(g, hx - 0.4, hy, 1.7, 1.2, 'O')
    for (const d of [-1, 1]) {
      stroke(g, hx - 2.2, hy + d * 2.3 - 0.5, hx - 5, hy + d * 3.8 - 0.5, 'h', true, 1.3)
      set(g, hx + 0.8, hy + d * 1.9 - 0.5, 'e'); set(g, hx + 1.8, hy + d * 1.9 - 0.5, 'e')
      set(g, hx + 4.6, hy + d * 0.9 - 0.5, 'n')
    }
    // pale spine studs down the back (spaced, never a stripe, and cold: only the eyes glow)
    for (const x of [12, 15, 18]) set(g, x, M - 0.5, 'h')
    outline(g)
    return g
  },
}

// One creature as it is drawn IN PLAY: render.js gives a body the scale e.radius / its archetype's
// radius, i.e. the roster's radiusMul (x ELITE's 1.5 for an elite). bakeCreature bakes AT that scale
// and hands it back, so in play one art pixel is exactly one grid pixel (PX world px).
const ARCH_ENEMY = { normal: 'drone', fast: 'wisp', tank: 'tank' }
const ELITE_SIZE = 1.5
function rosterOf(id) {
  for (const ch of Object.values(CHAPTERS)) { const r = ch.roster?.find((x) => x.id === id); if (r) return r }
  return null
}
// the scale render.js draws this body at (radius / archetype radius) for a given radius
export function castDrawScale(id, elite) {
  const r = rosterOf(id)
  return (r?.radiusMul ?? 1) * (elite ? ELITE_SIZE : 1)
}
export function castArchR(id) {
  const r = rosterOf(id)
  return ENEMIES[ARCH_ENEMY[r?.archetype] || 'drone'].radius
}

// art: the grid sprite. `light` is the glow the body's own heat throws on the floor round it
// [radius as a multiple of its radius, colour, strength]. `crown` is the elite crown's gap above the
// art, in world px.
export const PIXEL_CAST = {
  cinderBeetle: { art: BEETLE, frames: 2, light: [2.4, 0xff8a40, 0.5] },
  salamander: { art: SALAMANDER, frames: 2, light: [2.6, 0xffb848, 0.55] },
  obsidianTortoise: { art: TORTOISE, frames: 2, light: [2.2, 0xff7030, 0.55] },
  fireDrake: { art: DRAKE, frames: 2, light: [2.4, 0xff7a28, 0.28] },
}
// the elite crown, [top, r]: render.js places it at e.y + top * k * drawScale, so top is stated in
// the bake's own units — just above the top of the art
for (const [id, M] of Object.entries(PIXEL_CAST)) {
  const s = castDrawScale(id, true)
  M.crown = [-((M.art.ay + 0.5) * PX + 3) / s, 9]
  M.w = M.art.w; M.h = M.art.h
}

// THE ART SCALE of a body drawn at drawScale (= e.radius / its archetype radius): its roster size is
// the design size, so a plain body paints at 1 and an elite (x ELITE.sizeMul) paints that much
// LARGER, at the same art-pixel size. The always-elite drake is no exception: its design is its
// plain size, and it is always drawn 1.5x.
export function castArtScale(id, drawScale) {
  return Math.max(0.5, drawScale / castDrawScale(id, false))
}
// one frame's character grid at an art scale
export function paintGrid(id, frame, scale) {
  S = scale
  try { return PIXEL_CAST[id].art.paint(frame) } finally { S = 1 }
}
// the anchor (the body's centre), as a fraction of the painted grid
export function castAnchor(id, g, scale) {
  const A = PIXEL_CAST[id].art
  return [((A.ax + 0.5) * scale) / g[0].length, ((A.ay + 0.5) * scale) / g.length]
}
// One creature frame -> { pc, ax, ay }
export function paintCreature(id, frame, scale = 1) {
  const A = PIXEL_CAST[id].art
  const g = paintGrid(id, frame, scale)
  const pc = new PixelCanvas(g[0].length, g.length)
  pc.grid(g, A.pal)
  const [ax, ay] = castAnchor(id, g, scale)
  return { pc, ax, ay }
}
// The HIT FLASH twin: the same frame gone pale, its ink outline and its two tones KEPT, so a struck
// body still reads as its own shape (a flat white silhouette blooms into a shapeless blob through
// the screen pass, swallowing its neighbours).
const FLASH_HI = '#fff6f0', FLASH_LO = '#9c908c'
const lumOf = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 }
export function paintCreatureFlash(id, frame, scale = 1) {
  const A = PIXEL_CAST[id].art
  const g = paintGrid(id, frame, scale)
  const pc = new PixelCanvas(g[0].length, g.length)
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) {
    const ch = g[y][x]
    if (ch === '.') continue
    const c = A.pal[ch]
    pc.set(x, y, c === INK ? INK : lumOf(c) > 0.4 ? FLASH_HI : FLASH_LO)
  }
  return pc
}
// The same frame as a MASK: white where the body is (its ink outline left out), nothing elsewhere.
// The rig draws it into the emissive map, so the creature light falls on the body and never on the
// floor round it.
export function paintCreatureMask(id, frame, scale = 1) {
  const g = paintGrid(id, frame, scale)
  const pc = new PixelCanvas(g[0].length, g.length)
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] !== '.' && g[y][x] !== 'k') pc.set(x, y, '#ffffff')
  const [ax, ay] = castAnchor(id, g, scale)
  return { pc, ax, ay }
}
// ---- the player ----------------------------------------------------------------------------------
// The mint blob every chapter's player is, as pixel art: a dome in three tones, big eyes, blush.
export function paintPlayer(pc, f) {
  const cx = 9, cy = 9.5
  const ry = f ? 7 : 7.6, rx = f ? 8.2 : 7.6
  pc.ellipse(cx, cy, rx, ry, P.mintLo)
  pc.ellipseOn(cx - 0.6, cy - 1, rx - 1.4, ry - 1.6, P.mint)
  pc.ellipseOn(cx - 2.6, cy - 3.6, 2.2, 1.3, P.mintHi)
  pc.rect(cx + 1, cy - 2, 2, 3, P.white); pc.rect(cx - 4, cy - 2, 2, 3, P.white)
  pc.rect(cx + 2, cy - 1, 1, 2, P.pupil); pc.rect(cx - 3, cy - 1, 1, 2, P.pupil)
  pc.set(cx - 5, cy + 2, P.blush); pc.set(cx + 4, cy + 2, P.blush)
  pc.set(cx - 1, cy + 2, P.mintDeep); pc.set(cx, cy + 3, P.mintDeep); pc.set(cx + 1, cy + 2, P.mintDeep)
  pc.outline(P.ink)
}
export const PLAYER_ART = [19, 19]

