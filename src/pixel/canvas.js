// The Magma's pixel canvas, palette and hash: the tools every painter in src/pixel/* draws with.
//
// A PixelCanvas is a tiny grid of colour strings (null = transparent). Every painter draws on one,
// so the art is pixel-exact by construction: no anti-aliasing can sneak in. render-side only.

export const PX = 2          // world px per art pixel: the ONE grid the whole chapter is drawn on
export const UP = 2          // texels per world px in the baked canvases (crisp when the camera zooms in)
export const TAU = Math.PI * 2

// ---- palette ------------------------------------------------------------------------------------
// ALBEDO, not final colour: the CRT pass lights everything (src/pixel/crt.js). FEW colours per object
// (owner: "simple design but very good lighting"): a flat base, one shade, one highlight, and the
// light does the rest. Anything painted hot (r high, b low: lava, embers, seams, eyes) is EMISSIVE
// there and glows in the dark on its own — so nothing that is not a real heat source is painted hot.
export const PAL = {
  ink: '#0a0608',
  // the floor: flat basalt plates, three close tones, a joint between them (never as dark as ink)
  fl0: '#221c20', fl1: '#3e3436', fl2: '#463a38', fl3: '#3a3036',
  // props: cool basalt
  rk0: '#2c2430', rk1: '#463c4c', rk2: '#625670', rkS: '#352a32',
  // molten ramp, dark to white-hot
  lava0: '#7a1004', lava1: '#d8340c', lava2: '#ff6a14', lava3: '#ffa22a', lava4: '#ffd858', lava5: '#fff4c4',
  // crust that has just crusted over: a scab darker than the floor
  scab0: '#1a1012', scab1: '#26181a',
  // the ladle's slag: COLD grey-blue waste, nothing like lava
  slag0: '#2a2c36', slag1: '#454a5c',
  ash: '#6a6470', ashHi: '#8e8898',
  // obsidian
  glass0: '#221a3c', glass1: '#3c3466', glass2: '#625a9c', glassHi: '#a89ce8',
  // cinder beetle: bronze
  bt0: '#5a4030', bt1: '#8a6040', bt2: '#c0a070',
  // salamander: black with yellow blotches
  sl0: '#3e3842', sl1: '#6e6670', slSpot: '#ffc82a',
  // tortoise skin
  sk0: '#8a8494', sk1: '#b8b2c4',
  // drake: crimson (kept shy of 'hot', so only its belly fire and eyes glow)
  dr0: '#40091a', dr1: '#8a2436', dr2: '#b04454', wing0: '#3c1028', wing1: '#6a2040',
  horn: '#e0cca0',
  eye: '#ffe45a',
  // the player
  mint: '#7de3c3', mintHi: '#c8fff0', mintMid: '#56c4a6', mintLo: '#2a8a6e', mintDeep: '#1a5a4a',
  blush: '#ff8fa8', white: '#ffffff', pupil: '#1a0f14',
  gem: '#5ee8ff', gemHi: '#e8ffff', gemMid: '#2ab4dc', gemLo: '#16608a',
  coin: '#ffcf3a', coinHi: '#fff4a8', coinLo: '#b06a10', coinDeep: '#6a3a08',
  heat0: '#e07a3a', heat1: '#f0a060',
}

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
  // fill only where something is already painted (shading inside a silhouette)
  ellipseOn(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
        if (dx * dx + dy * dy <= 1 && this.get(x, y)) this.set(x, y, c)
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
  // a filled polygon (even-odd, sampled at pixel centres)
  poly(pts, c) {
    const ys = pts.map((p) => p[1])
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const py = y + 0.5, xs = []
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]
        if ((ay <= py && by > py) || (by <= py && ay > py)) xs.push(ax + ((py - ay) / (by - ay)) * (bx - ax))
      }
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, c)
    }
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

// deterministic hash for scattering (seeded art, so a re-bake draws the same picture)
export function hash(i, j = 0, s = 0) {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
