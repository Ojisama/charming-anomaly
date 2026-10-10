// The Magma's pixel canvas, palette and hash: the tools every painter in src/pixel/* draws with.
//
// A PixelCanvas is a tiny grid of colour strings (null = transparent). Every painter draws on one,
// so the art is pixel-exact by construction: no anti-aliasing can sneak in. render-side only.

export const PX = 2          // world px per art pixel: the ONE grid the whole chapter is drawn on
export const UP = 2          // texels per world px in the baked canvases (crisp when the camera zooms in)
export const TAU = Math.PI * 2

// ---- palette ------------------------------------------------------------------------------------
// ALBEDO, not final colour: the CRT pass lights everything (src/pixel/crt.js). Rock and creatures are
// painted mid-bright so the lava's light has something to fall on; anything painted hot (r high, b
// low: lava, embers, seams, eyes) or near-white is EMISSIVE there and glows in the dark on its own.
export const PAL = {
  ink: '#0c0608',
  // the cave rock: plum-maroon basalt plates (Sea of Stars' kiln palette)
  rock0: '#140a0e', rock1: '#24121a', rock2: '#36191f', rock3: '#4a2427', rock4: '#62322f', rock5: '#7c4638',
  rockCool: '#4c4466', rockCoolHi: '#6e6a92',
  vein: '#3a1410',
  // molten ramp, dark to white-hot
  lava0: '#8a1206', lava1: '#d8300c', lava2: '#ff6a14', lava3: '#ffa22a', lava4: '#ffd858', lava5: '#fff4c4',
  // crust that has just crusted over
  cool0: '#1a0a0a', cool1: '#2c1210', cool2: '#40180f',
  ash: '#6a6068', ashHi: '#9a90a2',
  // obsidian
  glass0: '#120e1e', glass1: '#2a2242', glass2: '#463a6c', glass3: '#6e5ea4', glassHi: '#c8c0ff', glassWhite: '#f4f0ff',
  // cinder beetle
  bug0: '#2a1614', bug1: '#56302a', bug2: '#844e36', bug3: '#b87a50', bugLeg: '#3a2420',
  // salamander: charcoal with molten blotches
  sal0: '#1e1618', sal1: '#3a2c30', sal2: '#5a464a', sal3: '#806a6a',
  // drake: deep crimson scales (kept just shy of 'hot', so only its belly fire and eyes glow)
  drk0: '#3a0a1a', drk1: '#6c1a2c', drk2: '#a23446', drk3: '#d8646a', drkWing0: '#36102a', drkWing1: '#5a1a3a', drkWing2: '#8a3048',
  horn: '#e8d4a8', hornLo: '#a8906a',
  eye: '#ffe45a', eyeHot: '#fff8d0',
  // the player
  mint: '#7de3c3', mintHi: '#c8fff0', mintMid: '#56c4a6', mintLo: '#2a8a6e', mintDeep: '#1a5a4a',
  blush: '#ff8fa8', white: '#ffffff', pupil: '#1a0f14',
  gem: '#5ee8ff', gemHi: '#e8ffff', gemMid: '#2ab4dc', gemLo: '#16608a',
  coin: '#ffcf3a', coinHi: '#fff4a8', coinLo: '#b06a10', coinDeep: '#6a3a08',
  heat0: '#ff8a3a', heat1: '#ffc070', heat2: '#fff0c8',
  coolRim: '#8aa0d8',     // the cool rim light every body carries on its upper-left edge
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
  // Sea of Stars' cool rim: inside pixels whose upper-left neighbour is the outline take `c`
  // (only over colours in `over`, so eyes and glowing seams keep their own colour).
  rim(c, over, ink = PAL.ink) {
    const add = []
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const v = this.get(x, y)
      if (!v || v === ink || !over.includes(v)) continue
      const up = this.get(x, y - 1), lf = this.get(x - 1, y)
      const dn = this.get(x, y + 1), rt = this.get(x + 1, y), dn2 = this.get(x, y + 2), rt2 = this.get(x + 2, y)
      // only on bodies at least three pixels thick: a leg or a tail stays its own colour
      const thick = dn && dn !== ink && rt && rt !== ink && dn2 && dn2 !== ink && rt2 && rt2 !== ink
      if (thick && (up === ink || up == null || ((lf === ink || lf == null) && y % 2 === 0))) add.push([x, y])
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
