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

const grid = (w, h) => Array.from({ length: h }, () => new Array(w).fill('.'))
function set(g, x, y, c) { x = Math.round(x); y = Math.round(y); if (g[y] && x >= 0 && x < g[y].length) g[y][x] = c }
// into an EMPTY cell only (limbs go under the body)
function put(g, x, y, c) { x = Math.round(x); y = Math.round(y); if (g[y] && x >= 0 && x < g[y].length && g[y][x] === '.') g[y][x] = c }
function line(g, x0, y0, x1, y1, c, over = false) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1)
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    (over ? set : put)(g, x0, y0, c)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
}
// Every limb is TWO pixels thick: render.js turns each body to face its heading, and a one-pixel line
// turned to 30 degrees and re-gridded by the CRT breaks into dots. Masses survive a turn; hairs do not.
function thick(g, x0, y0, x1, y1, c, over = false) {
  line(g, x0, y0, x1, y1, c, over)
  if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) line(g, x0, y0 + 1, x1, y1 + 1, c, over)
  else line(g, x0 + 1, y0, x1 + 1, y1, c, over)
}
function disc(g, cx, cy, rx, ry, c, only) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
    if (dx * dx + dy * dy <= 1 && g[y] && x >= 0 && x < g[y].length && (!only || only.includes(g[y][x]))) g[y][x] = c
  }
}
function tri(g, a, b, c, ch) {
  const minX = Math.floor(Math.min(a[0], b[0], c[0])), maxX = Math.ceil(Math.max(a[0], b[0], c[0]))
  const minY = Math.floor(Math.min(a[1], b[1], c[1])), maxY = Math.ceil(Math.max(a[1], b[1], c[1]))
  const s = (p, q, x, y) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const px = x + 0.5, py = y + 0.5
    const u = s(a, b, px, py), v = s(b, c, px, py), w = s(c, a, px, py)
    if ((u >= 0 && v >= 0 && w >= 0) || (u <= 0 && v <= 0 && w <= 0)) set(g, x, y, ch)
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
      const px = x + 0.5, py = y + 0.5
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
    for (let y = 0; y < H; y++) { L.push([]); for (let x = 0; x < W; x++) L[y].push(label(x, y)) }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
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
// The elite: a small dragon seen from above, the most unmistakable silhouette in the chapter. Two
// bat wings (an arm bone to the wrist, three finger bones fanning back, the membrane scalloped
// between them), a long neck, a horned head, a long tail ending in a spade, a hot spine. Frame 0
// wings spread, frame 1 the downstroke, half folded.
const DRAKE_WINGS = [
  { S: [18, 11], E: [17, 5], W: [14, 1], F: [[7, 0], [2, 3], [3, 8]], B: [9, 11] },
  { S: [18, 11], E: [17, 7], W: [14, 4], F: [[8, 3], [3, 6], [5, 10]], B: [9, 11] },
]
export const DRAKE = {
  w: 31, h: 27, ax: 15, ay: 13,
  pal: { k: INK, v: '#6e1e2a', b: '#c49078', o: '#a04038', y: '#ffbe3a', h: '#e8dcc8', e: EYE },
  paint(f) {
    const W = 31, H = 27, M = 13, g = grid(W, H)
    const wg = DRAKE_WINGS[f]
    const pts = [wg.W, ...wg.F, wg.B]
    tri(g, wg.S, wg.E, wg.W, 'v'); tri(g, wg.S, wg.W, wg.B, 'v')
    for (let i = 0; i < pts.length - 1; i++) tri(g, wg.W, pts[i], pts[i + 1], 'v')
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
      const ox = mx - wg.W[0], oy = my - wg.W[1], ol = Math.hypot(ox, oy) || 1
      disc(g, mx + (ox / ol) * 1.1, my + (oy / ol) * 1.1, 2.1, 2.1, '.', 'v')
    }
    line(g, wg.S[0], wg.S[1], wg.E[0], wg.E[1], 'b', true); line(g, wg.E[0], wg.E[1], wg.W[0], wg.W[1], 'b', true)
    for (const p of wg.F) line(g, wg.W[0], wg.W[1], p[0], p[1], 'b', true)
    // mirror the wing to the other side
    for (let y = 0; y < M; y++) for (let x = 0; x < W; x++) if (g[y][x] !== '.') g[2 * M - y][x] = g[y][x]
    // body, neck, head
    disc(g, 15, M + 0.5, 5.6, 3.3, 'o')
    for (let x = 19; x <= 24; x++) for (let dy = -1; dy <= 1; dy++) set(g, x, M + dy, 'o')
    disc(g, 25.5, M + 0.5, 2.6, 2.3, 'o')
    set(g, 28, M, 'o')
    // the hot spine down the back and neck
    for (let x = 10; x <= 23; x++) set(g, x, M, 'y')
    // horns sweeping back, eyes on the sides of the head
    line(g, 24, M - 2, 21, M - 4, 'h', true); line(g, 24, M + 2, 21, M + 4, 'h', true)
    set(g, 26, M - 1, 'e'); set(g, 26, M + 1, 'e')
    // the tail: tapering, swinging, a spade at the tip
    const sw = f ? 1 : -1
    let tip = null
    for (let i = 0; i <= 9; i++) {
      const x = 10 - i, y = M + Math.round(sw * Math.sin((i / 9) * Math.PI * 0.9) * 2.2)
      set(g, x, y, 'o')
      if (i < 5) { set(g, x, y - 1, 'o'); set(g, x, y + 1, 'o') }
      tip = [x, y]
    }
    tri(g, [tip[0] + 1, tip[1] - 2.5], [tip[0] + 1, tip[1] + 3.5], [tip[0] - 2.5, tip[1] + 0.5], 'o')
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
  fireDrake: { art: DRAKE, frames: 2, light: [3, 0xff7a28, 0.6] },
}
// the elite crown, [top, r]: render.js places it at e.y + top * k * drawScale, so top is stated in
// the bake's own units — just above the top of the art
for (const [id, M] of Object.entries(PIXEL_CAST)) {
  const s = castDrawScale(id, true)
  M.crown = [-((M.art.ay + 0.5) * PX + 3) / s, 9]
  M.w = M.art.w; M.h = M.art.h
}

// One creature frame -> PixelCanvas
export function paintCreature(id, frame) {
  const A = PIXEL_CAST[id].art
  const pc = new PixelCanvas(A.w, A.h)
  pc.grid(A.paint(frame), A.pal)
  return pc
}
// The same frame as a MASK: white where the body is (its ink outline left out), nothing elsewhere.
// The rig draws it into the emissive map, so the creature light falls on the body and never on the
// floor round it.
export function paintCreatureMask(id, frame) {
  const A = PIXEL_CAST[id].art
  const pc = new PixelCanvas(A.w, A.h)
  const g = A.paint(frame)
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] !== '.' && g[y][x] !== 'k') pc.set(x, y, '#ffffff')
  return pc
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

