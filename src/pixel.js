// Book 3, The Magma: PIXEL ART SEEN THROUGH A CRT.
//
// Everything the chapter shows is drawn here, and render.js only delegates (CHAPTERS.magma.render
// .pixel is the switch). Restyle the chapter by editing THIS FILE (and src/pixel/* if it grows):
//   - PAL                     the palette every painter below reads
//   - PIXEL_CAST[id].paint    the four creatures (ROSTER_LOOKS entries carry `pixel: true`)
//   - paintPlayer             the player
//   - paintFloorTile          the floor (one seamless tile)
//   - PIXEL_PROPS / BIOME     the floor props and how many of each lie about
//   - paintCrack / paintLava / paintCool / paintPuddle   the crust: hairline, open lava, crusting over, slag
//   - SHOT_PAINTERS           shots, splinters, slag blobs, bombs, gust puffs, flares, embers
//   - paintGem / paintCoin    pickups
//   - CRT_FRAG                the CRT pass over the whole stage (scanlines, curvature, glow, mask)
//   - createPixelRig          how all of it is placed every frame from `run` (render-only: it reads
//                             run and never writes it)
//
// Every texture is LOW-RES art painted one art-pixel at a time on a tiny grid (PixelCanvas), blown up
// by an integer factor with no smoothing and sampled NEAREST. One art pixel is PX world px, and the CRT
// pass snaps the whole frame to the same block size, so anything else drawn in this chapter (damage
// numbers, generic particles) comes out chunky too.
import { CanvasSource, Container, Filter, GlProgram, Sprite, Texture, TilingSprite, UniformGroup } from 'pixi.js'

export const PX = 3          // world px per art pixel
const UP = 2                 // texels per world px in the baked canvases (crisp when the camera zooms in)
const TAU = Math.PI * 2

// ---- palette ------------------------------------------------------------------------------------
export const PAL = {
  ink: '#120604',       // outlines
  crust0: '#1d0c08', crust1: '#2a130c', crust2: '#3a1c12', crust3: '#4d2618',  // cooled crust
  seam0: '#5a1a0a', seam1: '#9a2c0c',                                       // dim glowing seams
  lava0: '#b8240a', lava1: '#ff5a14', lava2: '#ff9a2a', lava3: '#ffd84a', lava4: '#fff6c0',
  cool0: '#3a120a', cool1: '#5c1e10', cool2: '#7a2c14',
  ash: '#6b5a54', ashHi: '#9a8a80',
  glass0: '#160f22', glass1: '#2c2142', glass2: '#4b3a6e', glassHi: '#c8b8ff',
  beetle0: '#3a1a10', beetle1: '#6a3020', beetleHi: '#b05a30',
  sala0: '#a8300e', sala1: '#e8601c', sala2: '#ffb040', salaSpot: '#2a0c06',
  drake0: '#6a0e0a', drake1: '#b8221a', drake2: '#e8482a', wing: '#4a0a10', wingHi: '#a82a1e',
  eye: '#ffe04a', eyeHot: '#fff6c0',
  mint: '#7de3c3', mintHi: '#c8fff0', mintLo: '#2a8a6e', blush: '#ff8fa8', white: '#ffffff', pupil: '#1a0f14',
  gem: '#6ef0ff', gemHi: '#e0ffff', gemLo: '#1a7a9a', coin: '#ffcf3a', coinHi: '#fff2a0', coinLo: '#a86a10',
  smoke: '#ffe2b8', smokeLo: '#c89878',
}

// ---- the pixel canvas ---------------------------------------------------------------------------
// A tiny grid of colour strings (null = transparent). Every painter below draws on one of these, so
// the art is pixel-exact by construction: no anti-aliasing can sneak in.
export class PixelCanvas {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null) }
  set(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : null }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c) }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
        if (dx * dx + dy * dy <= 1) this.set(x, y, c)
      }
    }
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1)
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      this.set(x0, y0, c)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
  }
  tri(x0, y0, x1, y1, x2, y2, c) {
    const minX = Math.floor(Math.min(x0, x1, x2)), maxX = Math.ceil(Math.max(x0, x1, x2))
    const minY = Math.floor(Math.min(y0, y1, y2)), maxY = Math.ceil(Math.max(y0, y1, y2))
    const s = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax)
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5
      const a = s(x0, y0, x1, y1, px, py), b = s(x1, y1, x2, y2, px, py), d = s(x2, y2, x0, y0, px, py)
      if ((a >= 0 && b >= 0 && d >= 0) || (a <= 0 && b <= 0 && d <= 0)) this.set(x, y, c)
    }
  }
  // ASCII art: rows of characters, each looked up in `pal` (a char missing from pal is transparent).
  grid(rows, pal, ox = 0, oy = 0) {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = pal[row[i]]; if (c) this.set(ox + i, oy + j, c) } })
  }
  // a 1-art-pixel outline round everything drawn so far (4-neighbour)
  outline(c = PAL.ink) {
    const add = []
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y])
    }
    for (const [x, y] of add) this.set(x, y, c)
  }
  // blow up to a canvas, k texels per art pixel; `white` paints every filled pixel white (hit flash)
  toCanvas(k, white = false) {
    const cv = document.createElement('canvas')
    cv.width = this.w * k; cv.height = this.h * k
    const ctx = cv.getContext('2d')
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = this.d[y * this.w + x]
      if (!c) continue
      ctx.fillStyle = white ? '#ffffff' : c
      ctx.fillRect(x * k, y * k, k, k)
    }
    return cv
  }
}

// A canvas-backed texture, sampled NEAREST: the pixels stay square at any scale.
export function pixelTex(cv, res = UP) {
  return new Texture({ source: new CanvasSource({ resource: cv, resolution: res, scaleMode: 'nearest' }) })
}
// one art grid -> { tex, ax, ay } at PX world px per art pixel
function bakeArt(pc, ax = 0.5, ay = 0.5, white = false) {
  return { tex: pixelTex(pc.toCanvas(PX * UP, white)), ax, ay, w: pc.w * PX, h: pc.h * PX }
}
// deterministic hash for scattering (seeded art, so a re-bake draws the same picture)
export function hash(i, j = 0, s = 0) {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// ---- the creatures (nose to +x: ROSTER_LOOKS' lean turns them to face their heading) ----------
// paint(pc, frame) draws one frame. `frames` is how many a walk cycle has; `crown` is [top, r] for the
// elite crown in WORLD px relative to the centre, like the macro cast's.
export const PIXEL_CAST = {
  cinderBeetle: {
    w: 14, h: 14, frames: 2, crown: [-20, 9],
    paint(pc, f) {
      const P = PAL
      // six legs, alternating tripods
      for (let i = 0; i < 3; i++) {
        const x = 4 + i * 3, sw = ((i + f) % 2 ? 1 : -1)
        pc.line(x, 4, x + sw, 1, P.beetle0); pc.line(x, 10, x - sw, 13, P.beetle0)
      }
      pc.ellipse(6.5, 7, 5.2, 4.3, P.beetle1)
      pc.ellipse(6, 6, 3.2, 2, P.beetleHi)
      pc.line(2, 7, 9, 7, P.lava1)          // the glowing seam down the wing cases
      pc.set(5, 7, P.lava3)
      pc.ellipse(11.6, 7, 2, 2.1, P.beetle0)
      pc.set(12, 6, P.eye); pc.set(12, 8, P.eye)
      pc.outline()
    },
  },
  salamander: {
    w: 22, h: 14, px: 2, frames: 2, crown: [-14, 7],
    paint(pc, f) {
      const P = PAL, s = f ? 1 : -1
      // legs splayed, diagonal pairs moving together
      pc.line(8, 5, 6 + s, 2, P.sala0); pc.line(8, 9, 6 - s, 12, P.sala0)
      pc.line(14, 5, 15 - s, 2, P.sala0); pc.line(14, 9, 15 + s, 12, P.sala0)
      // the tail swings
      pc.line(5, 7, 1, 7 + s, P.sala0); pc.line(5, 6, 2, 6 + s, P.sala1)
      pc.ellipse(10.5, 7, 6, 2.8, P.sala1)
      pc.ellipse(17.2, 7, 2.8, 2.5, P.sala1)
      pc.line(6, 7, 15, 7, P.sala2)        // the bright belly line
      for (const [x, y] of [[8, 5], [11, 8], [13, 5], [16, 6]]) pc.set(x, y, P.salaSpot)
      pc.set(18, 5, P.eye); pc.set(18, 9, P.eye)
      pc.outline()
    },
  },
  obsidianTortoise: {
    w: 22, h: 22, frames: 2, crown: [-28, 11],
    paint(pc, f) {
      const P = PAL, s = f ? 1 : 0
      for (const [x, y, k] of [[5, 3, 0], [13, 3, 1], [5, 17, 1], [13, 17, 0]]) pc.rect(x + ((k ^ s) ? 1 : -1), y, 3, 3, P.cool1)
      pc.ellipse(18.5, 11, 2.6, 2.3, P.cool2)
      pc.set(20, 10, P.eye); pc.set(20, 12, P.eye)
      pc.ellipse(10, 11, 7.6, 7, P.glass1)
      // glassy plates with magma in the seams
      pc.ellipse(10, 11, 5.5, 5, P.glass2)
      pc.ellipse(9, 9, 2.5, 2, P.glassHi)
      pc.line(10, 4, 10, 18, P.lava1); pc.line(4, 11, 16, 11, P.lava1)
      pc.set(10, 11, P.lava3)
      pc.outline()
    },
  },
  fireDrake: {
    w: 24, h: 24, px: 2, frames: 2, crown: [-22, 9],
    paint(pc, f) {
      const P = PAL
      // the wings beat: spread wide, then half folded
      const span = f ? 6 : 10
      pc.tri(9, 12, 6, 12 - span - 1, 15, 12 - span, P.wing)
      pc.tri(9, 12, 6, 12 + span + 1, 15, 12 + span, P.wing)
      pc.line(9, 12, 7, 12 - span, P.wingHi); pc.line(9, 12, 7, 12 + span, P.wingHi)
      pc.line(5, 12, 1, 12 + (f ? 1 : -1), P.drake0); pc.line(4, 12, 1, 11 + (f ? 1 : -1), P.drake1)
      pc.ellipse(11, 12, 5, 3.2, P.drake1)
      pc.ellipse(17, 12, 2.8, 2.4, P.drake1)
      pc.line(8, 12, 14, 12, P.drake2)
      pc.set(18, 11, P.eye); pc.set(18, 13, P.eye)
      pc.set(16, 9, P.ashHi); pc.set(16, 15, P.ashHi)   // horns
      pc.outline()
    },
  },
}
// One creature frame -> { body, white, ax, ay } canvases (render.js makes the textures).
export function bakeCreature(id, frame) {
  const M = PIXEL_CAST[id]
  const pc = new PixelCanvas(M.w, M.h)
  M.paint(pc, frame)
  const k = Math.round((M.px ?? PX) * UP)   // M.px: world px per art pixel for this creature (default PX)
  return { body: pc.toCanvas(k), white: pc.toCanvas(k, true), ax: 0.5, ay: 0.5, res: UP }
}

// ---- the player -----------------------------------------------------------------------------------
export function paintPlayer(pc, f) {
  const P = PAL
  const ry = f ? 5.6 : 6.2, rx = f ? 6.6 : 6.1
  pc.ellipse(7, 8, rx, ry, P.mint)
  pc.ellipse(5.5, 6, 2.4, 1.6, P.mintHi)
  pc.rect(9, 6, 2, 2, P.white); pc.rect(4, 6, 2, 2, P.white)
  pc.set(10, 7, P.pupil); pc.set(5, 7, P.pupil)
  pc.set(3, 9, P.blush); pc.set(11, 9, P.blush)
  pc.outline(P.mintLo)
  pc.outline(P.ink)
}

// ---- the floor ------------------------------------------------------------------------------------
export const TILE_ART = 96   // art px per side of the seamless floor tile
export function paintFloorTile() {
  const P = PAL, N = TILE_ART
  const pc = new PixelCanvas(N, N)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const h = hash(x, y, 7)
    pc.set(x, y, h < 0.55 ? P.crust1 : h < 0.85 ? P.crust0 : h < 0.97 ? P.crust2 : P.crust3)
  }
  // flat basalt slabs
  for (let k = 0; k < 14; k++) {
    const cx = Math.floor(hash(k, 1, 3) * N), cy = Math.floor(hash(k, 2, 3) * N), r = 2 + Math.floor(hash(k, 3, 3) * 6)
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r && hash(cx + x, cy + y, 9) > 0.2) pc.set((cx + x + N) % N, (cy + y + N) % N, P.crust2)
  }
  // old seams, dimly lit from below (wrapping, so the tile stays seamless)
  for (let k = 0; k < 7; k++) {
    let x = Math.floor(hash(k, 5, 11) * N), y = Math.floor(hash(k, 6, 11) * N)
    let a = hash(k, 7, 11) * TAU
    const len = 10 + Math.floor(hash(k, 8, 11) * 22)
    for (let i = 0; i < len; i++) {
      pc.set((Math.round(x) + N) % N, (Math.round(y) + N) % N, hash(k, i, 13) > 0.85 ? P.seam1 : P.seam0)
      a += (hash(k, i, 17) - 0.5) * 1.4
      x += Math.cos(a); y += Math.sin(a)
    }
  }
  return pc
}

// ---- floor props (the BIOME render.js scatters) ----------------------------------------------------
export const PIXEL_PROPS = {
  boulder(pc, v) {
    const P = PAL
    pc.ellipse(6, 5, 5 + v % 2, 3.6, P.crust3)
    pc.ellipse(5, 4, 2.5, 1.6, P.ash)
    pc.set(8, 6, P.seam1)
    pc.outline()
  },
  vent(pc, v) {
    const P = PAL
    pc.ellipse(6, 6, 5, 4.5, P.crust3)
    pc.ellipse(6, 6, 2.6, 2.2, P.ink)
    pc.ellipse(6, 6, 1.4, 1.2, v % 2 ? P.lava2 : P.lava1)
    pc.outline()
  },
  shard(pc, v) {
    const P = PAL
    pc.tri(3, 11, 6, 1 + v, 8, 11, P.glass1)
    pc.line(6, 2 + v, 5, 10, P.glassHi)
    pc.tri(7, 11, 10, 5, 11, 11, P.glass2)
    pc.outline()
  },
}
export const PROP_ART = { boulder: [13, 10], vent: [13, 13], shard: [13, 13] }
// what render.js's floor scatter places: name -> T key 'px_<prop><variant>' (baked by bakeProps)
export const BIOME = {
  big: [{ name: 'px_vent0', baked: true, size: [30, 40] }, { name: 'px_boulder0', baked: true, size: [30, 42] }],
  mid: [
    { name: 'px_shard0', baked: true, size: [24, 34] },
    { name: 'px_boulder1', baked: true, size: [20, 30] },
    { name: 'px_vent1', baked: true, size: [22, 30] },
  ],
  detail: [{ name: 'px_shard1', baked: true, size: [12, 18] }, { name: 'px_boulder2', baked: true, size: [10, 16] }],
}
// -> { 'px_boulder0': { tex, ax, ay }, ... }
export function bakeProps() {
  const out = {}
  for (const [name, paint] of Object.entries(PIXEL_PROPS)) {
    for (let v = 0; v < 3; v++) {
      const [w, h] = PROP_ART[name]
      const pc = new PixelCanvas(w, h)
      paint(pc, v)
      out['px_' + name + v] = bakeArt(pc)
    }
  }
  return out
}

// ---- the crust: hairline cracks, open lava, crusting over, slag puddles ---------------------------
const CRACK_ART = 24, LAVA_ART = 24, PUDDLE_ART = 26
export const CRACK_BAKE_R = (CRACK_ART / 2) * PX   // world radius a crack texture is drawn at, scale 1
export const LAVA_BAKE_R = (LAVA_ART / 2) * PX
export const PUDDLE_BAKE_R = (PUDDLE_ART / 2) * PX
export function paintCrack(pc, v, glow) {
  const P = PAL, c = CRACK_ART / 2
  const col = glow ? P.lava1 : P.seam1
  for (let arm = 0; arm < 4; arm++) {
    const a = (arm / 4) * TAU + hash(v, arm, 31) * 1.2
    let x = c, y = c
    for (let i = 0; i < 10; i++) {
      const aa = a + (hash(v, arm * 16 + i, 37) - 0.5) * 1.1
      x += Math.cos(aa); y += Math.sin(aa)
      pc.set(x, y, i < 3 && glow ? P.lava3 : col)
    }
  }
  pc.set(c, c, glow ? P.lava4 : P.lava1)
}
export function paintLava(pc, v, f) {
  const P = PAL, c = LAVA_ART / 2
  for (let y = 0; y < LAVA_ART; y++) for (let x = 0; x < LAVA_ART; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c
    const a = Math.atan2(dy, dx)
    const edge = c - 1 - 1.6 * (0.5 + 0.5 * Math.sin(a * 3 + v * 1.7)) - hash(x, y, v) * 0.8
    const d = Math.hypot(dx, dy)
    if (d > edge) continue
    const k = d / edge
    const bub = hash(x + f * 5, y - f * 3, v + 41)
    pc.set(x, y, k > 0.86 ? P.lava0 : k > 0.6 ? P.lava1 : bub > 0.85 ? P.lava4 : k > 0.3 ? P.lava2 : P.lava3)
  }
  pc.outline(P.ink)
}
export function paintCool(pc, v) {
  const P = PAL, c = LAVA_ART / 2
  for (let y = 0; y < LAVA_ART; y++) for (let x = 0; x < LAVA_ART; x++) {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c)
    if (d > c - 2 - hash(x, y, v + 3) * 1.2) continue
    const h = hash(x, y, v + 61)
    pc.set(x, y, h > 0.9 ? P.seam1 : h > 0.5 ? P.cool1 : h > 0.2 ? P.cool0 : P.cool2)
  }
}
export function paintPuddle(pc, v) {
  const P = PAL, c = PUDDLE_ART / 2
  for (let y = 0; y < PUDDLE_ART; y++) for (let x = 0; x < PUDDLE_ART; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c
    const a = Math.atan2(dy, dx)
    const edge = c - 1.5 - 1.3 * (0.5 + 0.5 * Math.sin(a * 3 + v * 2.3)) - 0.9 * (0.5 + 0.5 * Math.sin(a * 7 + v * 4.1)) - hash(x, y, v + 7) * 0.8
    const d = Math.hypot(dx, dy)
    if (d > edge) continue
    const h = hash(x, y, v + 13)
    pc.set(x, y, d > edge - 1.2 ? P.sala0 : h > 0.9 ? P.lava3 : h > 0.5 ? P.lava2 : P.lava1)
  }
  pc.outline(P.ink)
}

// ---- shots, lobs and sparks ---------------------------------------------------------------------
export const SHOT_PAINTERS = {
  obsidian: [9, 5, (pc) => { const P = PAL; pc.tri(0, 2.5, 8, 0.5, 8, 4.5, P.glass1); pc.line(2, 2, 7, 1, P.glassHi); pc.set(8, 2, P.glassHi); pc.outline() }],
  splinter: [5, 3, (pc) => { const P = PAL; pc.rect(0, 1, 4, 1, P.glass2); pc.set(3, 1, P.glassHi); pc.outline() }],
  ember: [4, 4, (pc) => { const P = PAL; pc.rect(1, 1, 2, 2, P.lava2); pc.set(1, 1, P.lava4); pc.outline(P.lava0) }],
  slag: [8, 8, (pc) => { const P = PAL; pc.ellipse(4, 4, 3.2, 3, P.lava1); pc.ellipse(3.5, 3.5, 1.6, 1.4, P.lava3); pc.outline(P.lava0) }],
  bomb: [12, 12, (pc) => { const P = PAL; pc.ellipse(6, 6, 5, 4.6, P.crust3); pc.line(3, 6, 9, 5, P.lava1); pc.line(6, 3, 6, 9, P.lava2); pc.set(6, 6, P.lava4); pc.outline() }],
  shadow: [10, 5, (pc) => { pc.ellipse(5, 2.5, 4.6, 2.2, 'rgba(0,0,0,0.45)') }],
  puff: [8, 8, (pc) => { const P = PAL; pc.ellipse(4, 4, 3.5, 3.2, P.smokeLo); pc.ellipse(3.5, 3.5, 2.4, 2, P.smoke) }],
  flare: [14, 14, (pc) => {
    const P = PAL
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; pc.line(7, 7, 7 + Math.cos(a) * 6.5, 7 + Math.sin(a) * 6.5, k % 2 ? P.lava2 : P.lava1) }
    pc.ellipse(7, 7, 3, 3, P.lava3); pc.ellipse(7, 7, 1.5, 1.5, P.lava4)
  }],
  spark: [1, 1, (pc) => { pc.set(0, 0, PAL.white) }],
}
export function paintGem(pc) {
  const P = PAL
  pc.tri(3, 0, 0, 4, 6, 4, P.gem); pc.tri(0, 4, 6, 4, 3, 9, P.gemLo)
  pc.line(3, 1, 2, 4, P.gemHi)
  pc.outline()
}
export function paintCoin(pc) {
  const P = PAL
  pc.ellipse(4, 4, 3.6, 3.6, P.coin); pc.ellipse(3.5, 3.5, 1.6, 1.6, P.coinHi); pc.line(5, 3, 5, 6, P.coinLo)
  pc.outline(P.coinLo); pc.outline()
}

// ---- the CRT pass -------------------------------------------------------------------------------
const CRT_VERT = 'in vec2 aPosition;\nout vec2 vTextureCoord;\nuniform vec4 uInputSize;\nuniform vec4 uOutputFrame;\nuniform vec4 uOutputTexture;\n'
  + 'vec4 filterVertexPosition(void) {\n  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;\n  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;\n'
  + '  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;\n  return vec4(position, 0.0, 1.0);\n}\n'
  + 'void main(void) {\n  gl_Position = filterVertexPosition();\n  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);\n}\n'
// The whole stage, snapped to PX-sized blocks, then: barrel curvature, phosphor glow (a little of each
// block's neighbours bleeds in), scanlines at the bottom of every block row, an RGB aperture mask, a
// vignette and a faint flicker. uPx is in screen px (CSS), so a block is one art pixel at zoom 1.
export const CRT_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform float uTime;
uniform float uPx;
uniform float uScan;
uniform float uCurve;
uniform float uVignette;
uniform float uGlow;
uniform float uMask;
uniform float uFlicker;

vec3 tap(vec2 px) {
  vec2 uv = px * uInputSize.zw;
  vec2 lim = uOutputFrame.zw * uInputSize.zw;
  return texture(uTexture, clamp(uv, vec2(0.0), lim - uInputSize.zw * 0.5)).rgb;
}
void main(void) {
  vec2 frame = uOutputFrame.zw;
  vec2 q = vTextureCoord * uInputSize.xy / frame;          // 0..1 across the screen
  vec2 c = q - 0.5;
  float r2 = dot(c, c);
  q = 0.5 + c * (1.0 + uCurve * r2 * 2.0);                // the tube bulges toward you
  if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) { finalColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 p = q * frame;                                     // screen px
  vec2 cell = floor(p / uPx);
  vec2 ctr = (cell + 0.5) * uPx;
  vec3 col = tap(ctr);
  vec3 glow = (tap(ctr + vec2(uPx * 1.5, 0.0)) + tap(ctr - vec2(uPx * 1.5, 0.0)) + tap(ctr + vec2(0.0, uPx * 1.5)) + tap(ctr - vec2(0.0, uPx * 1.5))) * 0.25;
  col += max(glow - 0.35, 0.0) * uGlow;
  float fy = fract(p.y / uPx);
  col *= 1.0 - uScan * smoothstep(0.55, 0.95, fy);
  float m = mod(floor(p.x), 3.0);
  vec3 mask = m < 1.0 ? vec3(1.0, 1.0 - uMask, 1.0 - uMask) : m < 2.0 ? vec3(1.0 - uMask, 1.0, 1.0 - uMask) : vec3(1.0 - uMask, 1.0 - uMask, 1.0);
  col *= mask * (1.0 + uMask * 0.6);
  col *= 1.0 - uVignette * smoothstep(0.08, 0.5, r2);
  col *= 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 53.0));
  finalColor = vec4(col, 1.0);
}
`

// ---- the rig: places all of it every frame from `run` ---------------------------------------------
// env: { app, addShake(amp, dur) }. render.js adds rig.floor to its floor layer, rig.ground under the
// crowd, rig.air over it and rig.player inside the player's container, then calls the hooks below.
export function createPixelRig(env) {
  const { app } = env
  const T = {}
  const art = (w, h, paint, ax = 0.5, ay = 0.5) => { const pc = new PixelCanvas(w, h); paint(pc); return bakeArt(pc, ax, ay) }
  for (const [k, [w, h, paint]] of Object.entries(SHOT_PAINTERS)) T[k] = art(w, h, paint)
  T.gem = art(7, 10, paintGem)
  T.coin = art(9, 9, paintCoin)
  T.crack = [0, 1, 2, 3].map((v) => art(CRACK_ART, CRACK_ART, (pc) => paintCrack(pc, v, false)))
  T.crackHot = [0, 1, 2, 3].map((v) => art(CRACK_ART, CRACK_ART, (pc) => paintCrack(pc, v, true)))
  T.lava = [0, 1, 2, 3].map((v) => [0, 1].map((f) => art(LAVA_ART, LAVA_ART, (pc) => paintLava(pc, v, f))))
  T.cool = [0, 1, 2, 3].map((v) => art(LAVA_ART, LAVA_ART, (pc) => paintCool(pc, v)))
  T.puddle = [0, 1, 2].map((v) => art(PUDDLE_ART, PUDDLE_ART, (pc) => paintPuddle(pc, v)))
  T.player = [0, 1].map((f) => art(15, 15, (pc) => paintPlayer(pc, f)))
  T.playerWhite = [0, 1].map((f) => { const pc = new PixelCanvas(15, 15); paintPlayer(pc, f); return bakeArt(pc, 0.5, 0.5, true) })
  T.floor = pixelTex(paintFloorTile().toCanvas(PX, false), 1)
  T.floor.source.style.addressMode = 'repeat'

  const floor = new TilingSprite({ texture: T.floor, width: 1, height: 1 })
  floor.visible = false
  const ground = new Container()
  const air = new Container()
  const player = new Container()
  ground.visible = air.visible = player.visible = false
  const pSprite = new Sprite(T.player[0].tex)
  pSprite.anchor.set(0.5)
  player.addChild(pSprite)

  const crtU = new UniformGroup({
    uTime: { value: 0, type: 'f32' }, uPx: { value: PX, type: 'f32' }, uScan: { value: 0.3, type: 'f32' },
    uCurve: { value: 0.06, type: 'f32' }, uVignette: { value: 0.5, type: 'f32' }, uGlow: { value: 0.5, type: 'f32' },
    uMask: { value: 0.15, type: 'f32' }, uFlicker: { value: 0.02, type: 'f32' },
  })
  const filter = new Filter({ glProgram: GlProgram.from({ vertex: CRT_VERT, fragment: CRT_FRAG, name: 'pixel-crt' }), resources: { crtU } })

  // one growable pool of plain sprites per thing drawn
  const pool = (parent) => {
    const list = []
    let n = 0
    return {
      begin() { n = 0 },
      next(t) {
        let s = list[n]
        if (!s) { s = new Sprite(t.tex); parent.addChild(s); list.push(s) }
        n++
        if (s.texture !== t.tex) s.texture = t.tex
        s.anchor.set(t.ax, t.ay)
        s.visible = true; s.alpha = 1; s.tint = 0xffffff; s.rotation = 0
        return s
      },
      end() { for (let i = n; i < list.length; i++) list[i].visible = false },
      hide() { n = 0; this.end() },
    }
  }
  const gCrust = pool(ground), gPuddle = pool(ground), gShadow = pool(ground)
  const aLob = pool(air), aGust = pool(air)
  // pixel sparks: render-local, never in run
  const sparks = []
  const sparkLayer = new Container()
  air.addChild(sparkLayer)
  function burst(x, y, n, colors, speed, life, size = 1) {
    for (let i = 0; i < n; i++) {
      let p = sparks.find((q) => q.life <= 0)
      if (!p) { if (sparks.length >= 220) return; p = { s: new Sprite(T.spark.tex), life: 0 }; p.s.anchor.set(0.5); sparkLayer.addChild(p.s); sparks.push(p) }
      const a = Math.random() * TAU, v = speed * (0.4 + Math.random() * 0.6)
      p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - speed * 0.3
      p.life = p.max = life * (0.6 + Math.random() * 0.6)
      p.s.tint = colors[i % colors.length]
      p.s.scale.set(size * (1 + Math.round(Math.random())))
      p.s.visible = true
    }
  }
  const hex = (c) => parseInt(c.slice(1), 16)
  const EMBERS = [hex(PAL.lava2), hex(PAL.lava3), hex(PAL.lava1)]
  const ASH = [hex(PAL.ash), hex(PAL.ashHi), hex(PAL.crust3)]

  let look = null
  const v4 = (x, y) => Math.floor(hash(Math.round(x), Math.round(y), 5) * 4)

  const rig = {
    T, floor, ground, air, player, filter,
    get active() { return look != null },
    enable(l) {
      look = l
      const u = crtU.uniforms
      u.uPx = l.px ?? PX; u.uScan = l.scan ?? 0.3; u.uCurve = l.curve ?? 0.06; u.uVignette = l.vignette ?? 0.5
      u.uGlow = l.glow ?? 0.5; u.uMask = l.mask ?? 0.15; u.uFlicker = l.flicker ?? 0.02
      floor.visible = ground.visible = air.visible = player.visible = true
    },
    disable() {
      look = null
      floor.visible = ground.visible = air.visible = player.visible = false
      rig.clear()
    },
    clear() {
      gCrust.hide(); gPuddle.hide(); gShadow.hide(); aLob.hide(); aGust.hide()
      for (const p of sparks) { p.life = 0; p.s.visible = false }
    },
    // cam: { cx, cy, z, w, h, animT } (w/h in world px)
    sync(run, dt, cam) {
      if (!look) return
      const t = cam.animT
      crtU.uniforms.uTime = t
      // the floor, nailed to the world
      const M = 96
      floor.position.set(Math.round(-cam.cx - M), Math.round(-cam.cy - M))
      floor.width = cam.w + M * 2
      floor.height = cam.h + M * 2
      floor.tilePosition.set(-floor.x, -floor.y)
      // the crust
      gCrust.begin()
      for (const c of run.cracks || []) {
        const v = v4(c.x, c.y)
        if (c.state === 'crack') {
          // warms up as it is about to open: the tell for whoever is standing on it
          const left = Math.max(0, c.openAt - run.time)
          const hot = left < 0.35
          const s = gCrust.next(hot ? T.crackHot[v] : T.crack[v])
          s.position.set(c.x, c.y)
          s.rotation = (v * Math.PI) / 2
          s.scale.set(c.r / CRACK_BAKE_R)
        } else if (c.state === 'lava') {
          const f = Math.floor(t * 4 + v) % 2
          const s = gCrust.next(T.lava[v][f])
          s.position.set(c.x, c.y)
          // it wells up over its first tenth of a second
          const pop = Math.min(1, 0.4 + (run.time - c.openAt) / 0.15)
          s.scale.set((c.r / LAVA_BAKE_R) * Math.max(0.4, pop))
          if ((c._flareT ?? 0) > run.time) s.tint = 0xfff0c0
          // the last half second it dims toward crust
          const end = c.lavaEnd - run.time
          if (end < 0.5) s.tint = 0xc87050
        } else {
          const s = gCrust.next(T.cool[v])
          s.position.set(c.x, c.y)
          s.scale.set(c.r / LAVA_BAKE_R)
          s.alpha = Math.max(0, Math.min(1, (c.coolEnd - run.time) / (c.coolT || 1)))
        }
      }
      gCrust.end()
      gPuddle.begin()
      for (const sp of run.slagPools || []) {
        const s = gPuddle.next(T.puddle[v4(sp.x, sp.y) % 3])
        s.position.set(sp.x, sp.y)
        const grow = Math.min(1, sp.t / 0.12)
        s.scale.set((sp.r / PUDDLE_BAKE_R) * grow)
        s.alpha = Math.min(1, (sp.dur - sp.t) / 0.5)
      }
      gPuddle.end()
      // lobs: a shadow on the ground, the blob or rock arcing over it
      gShadow.begin(); aLob.begin()
      for (const l of run.magmaLobs || []) {
        const k = Math.min(1, l.t / l.flight)
        const x = l.fromX + (l.x - l.fromX) * k, y = l.fromY + (l.y - l.fromY) * k
        const hgt = Math.sin(Math.PI * k) * (l.kind === 'bomb' ? 110 : 46)
        const sh = gShadow.next(T.shadow)
        sh.position.set(x, y)
        sh.scale.set(l.kind === 'bomb' ? 1.3 : 0.8)
        const s = aLob.next(l.kind === 'bomb' ? T.bomb : T.slag)
        s.position.set(x, y - hgt)
        if (l.kind === 'bomb') s.rotation = Math.round(((l.spin ?? 0) + k * 6) * 2) * (Math.PI / 4)
      }
      gShadow.end(); aLob.end()
      // the bellows' gust and the lava it flares
      aGust.begin()
      for (const n of run.novas || []) {
        if (n.look === 'bellows') {
          const k = 1 - Math.max(0, n.life / (n.lifeMax || 1))
          const puffs = 7
          for (let i = 0; i < puffs; i++) {
            const a = n.angle - n.arc / 2 + (n.arc * (i + 0.5)) / puffs
            for (const rr of [0.55, 1]) {
              const s = aGust.next(T.puff)
              s.position.set(n.x + Math.cos(a) * n.r * rr, n.y + Math.sin(a) * n.r * rr)
              s.scale.set(1 + k)
              s.alpha = 0.85 * (1 - k)
            }
          }
        } else if (n.look === 'flare') {
          const s = aGust.next(T.flare)
          s.position.set(n.x, n.y)
          s.scale.set(Math.max(0.3, n.r / (7 * PX)))
          s.alpha = Math.max(0, n.life / (n.lifeMax || 1)) + 0.2
        }
      }
      aGust.end()
      // sparks
      for (const p of sparks) {
        if (p.life <= 0) continue
        p.life -= dt
        if (p.life <= 0) { p.s.visible = false; continue }
        p.vy += 160 * dt
        p.x += p.vx * dt; p.y += p.vy * dt
        p.s.position.set(Math.round(p.x / PX) * PX, Math.round(p.y / PX) * PX)
        p.s.alpha = Math.min(1, (p.life / p.max) * 2)
      }
    },
    syncPlayer(p, dt, animT, flash) {
      if (!look) return
      const f = Math.floor(animT * 5) % 2
      const lk = (flash ? T.playerWhite : T.player)[f]
      if (pSprite.texture !== lk.tex) pSprite.texture = lk.tex
      pSprite.scale.set(p.facing < 0 ? -1 : 1, 1)
    },
    // A sim event drawn here. Returns true when it is fully handled (render.js then skips it).
    event(e) {
      if (!look) return false
      switch (e.type) {
        case 'crackOpen':
          burst(e.x, e.y, e.by === 'step' ? 3 : 10, EMBERS, 90, 0.5)
          if (e.by !== 'step') env.addShake?.(2.5, 0.14)
          return true
        case 'crustCrack':
          burst(e.x, e.y, 2, ASH, 50, 0.35)
          return true
        case 'lavaFlare':
          burst(e.x, e.y, 10, EMBERS, 160, 0.55)
          return true
        case 'slagSplash':
          burst(e.x, e.y, 8, EMBERS, 120, 0.45)
          return true
        case 'bombLand':
          burst(e.x, e.y, 22, [...EMBERS, ...ASH], 230, 0.7)
          env.addShake?.(4, 0.2)
          return true
      }
      return false
    },
    // Pool hooks: return true when the sprite is drawn here.
    placeBullet(s, b) {
      if (!look) return false
      const t = b.weapon === 'obsidian' ? T.obsidian : b.weapon === 'splinter' ? T.splinter : T.ember
      if (s.texture !== t.tex) { s.texture = t.tex; s.anchor.set(t.ax, t.ay) }
      s.tint = 0xffffff
      s.position.set(b.x, b.y)
      // eight headings only: a pixel shard turns in 45-degree steps, like a sprite sheet would
      s.rotation = Math.round(Math.atan2(b.vy, b.vx) / (Math.PI / 4)) * (Math.PI / 4)
      s.scale.set(1)
      return true
    },
    placeNova(s, n) {
      if (!look) return false
      if (n.look === 'bellows' || n.look === 'flare') { s.visible = false; return true }
      return false
    },
    placeGem(s, g, animT) {
      if (!look) return false
      if (s.texture !== T.gem.tex) { s.texture = T.gem.tex; s.anchor.set(T.gem.ax, T.gem.ay) }
      s.position.set(g.x, g.y - (Math.floor(animT * 4 + (g.x + g.y) * 0.01) % 2) * PX)
      s.scale.set(1)
      return true
    },
    placeCoin(s, c, animT) {
      if (!look) return false
      if (s.texture !== T.coin.tex) { s.texture = T.coin.tex; s.anchor.set(T.coin.ax, T.coin.ay) }
      s.position.set(c.x, c.y)
      s.scale.set(Math.floor(animT * 3 + (c.x - c.y) * 0.01) % 3 === 0 ? 0.5 : 1, 1)   // a coin spinning, in three frames
      return true
    },
    // the summary recap's picture for hurt src 'lava'
    hazardThumb(src) {
      if (src !== 'lava') return null
      const s = new Sprite(T.lava[0][0].tex)
      s.anchor.set(0.5)
      return s
    },
  }
  return rig
}
