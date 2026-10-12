// The Mantle's palette and drawing kit (render-only; src/toon.js is the entry point).
//
// THE LOOK: a 1930s rubber-hose cartoon seen from above, like the overworld of a hand-drawn
// cel-animated game. Flat cel fills in a muted vintage palette, thick dark INK outlines that are
// heavier on the shadow side (the brush pressed harder there), soft airbrushed shading on top of the
// cel, pie-cut eyes. Fire and lava are the only saturated colours: a hot orange-red with ink on it.
// Every painter in src/toon/* draws with what is here, so a restyle starts in this file.

export const TAU = Math.PI * 2

// hex strings for Canvas2D, numbers for Pixi tints/uniforms
export const PAL = {
  ink: '#1c120d',        // the outline: warm near-black, never pure black
  inkSoft: '#3b2a20',
  paper: '#f3e6c8',      // cream, the brightest any non-fire thing gets
  paperShade: '#d9c49b',
  // rock (the dry ground), from the lowest to the hilltops
  rockLow: '#5b3b2a', rockMid: '#8a6446', rockHigh: '#b89468', rockTop: '#dcc392',
  basalt: '#3d3a40', basaltHi: '#6b6670', basaltLo: '#262329',
  // fire and lava
  lavaDeep: '#a8200f', lava: '#e5481b', lavaHot: '#ff8a1f', lavaGlow: '#ffc94a', lavaWhite: '#fff1b8',
  ember: '#ff6a1a',
  // creatures
  imp: '#d9472b', impShade: '#9c2a1b', impHi: '#f2865a',
  toad: '#5d4334', toadShade: '#3a281f', toadSpot: '#ff8a2a', toadBelly: '#d8b07a',
  golem: '#4a4b55', golemShade: '#2e2f37', golemHi: '#77788a', golemSeam: '#ff7a22',
  sulfur: '#d8b531', sulfurShade: '#a38122', sulfurHi: '#f4dd72', wing: '#9a3a2a', wingShade: '#6e2419',
  // the player
  hero: '#f6ead2', heroShade: '#d6c19c', shorts: '#c8322a', shortsShade: '#8e1f1a', blush: '#f08a74',
  // pickups and shots
  gem: '#4fb3a8', gemShade: '#2c7a74', gemHi: '#c9f2e8',
  coin: '#e6b53a', coinShade: '#a77a1e', coinHi: '#fff0a8',
  wood: '#c9a066', woodShade: '#8a6438',
  iron: '#6e6a72', ironHi: '#c9c4cc', steam: '#f7f1e3', steamShade: '#c9bfae',
  white: '#ffffff',
}
export const hexNum = (h) => parseInt(h.slice(1), 16)

// a scratch canvas is released at once, not left for the GC (the bake makes hundreds of MB of them)
export function freeCanvas(cv) { cv.width = 0; cv.height = 0 }
// willReadFrequently keeps every bake canvas on the browser's software rasteriser: Firefox
// Nightly's GPU canvas on Android dropped clips mid-bake, so shades filled whole rectangles and
// some of the digger's walk frames came out as black blocks (later getContext('2d') calls get this context)
export function mkCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h))
  c.getContext('2d', { willReadFrequently: true })
  return c
}

// a deterministic hash in [0, 1) of integers (props, phases)
export function hash(x, y, s = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 2246822519
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// ---- the brush ------------------------------------------------------------------------------------
// A shape drawn the cartoon way: its INK first, offset toward the shadow side (down-right), so the
// outline comes out heavier there and thin on the lit side — the taper of a brush line — then the cel
// fill, then a soft airbrushed shade and highlight clipped to the shape, then a fine ink line all round.
//   path(ctx) traces the shape (no beginPath needed); lw = the outline's weight in canvas px.
export function inkShape(ctx, path, fill, lw, opt = {}) {
  const { shade = null, hi = null, light = [-0.45, -0.55], noInk = false } = opt
  if (!noInk) {
    ctx.save()
    ctx.translate(lw * 0.22, lw * 0.3)
    ctx.beginPath(); path(ctx)
    ctx.fillStyle = PAL.ink; ctx.fill()
    ctx.lineWidth = lw * 1.05; ctx.lineJoin = 'round'; ctx.strokeStyle = PAL.ink; ctx.stroke()
    ctx.restore()
  }
  ctx.beginPath(); path(ctx)
  ctx.fillStyle = fill; ctx.fill()
  if (shade || hi) {
    ctx.save()
    ctx.beginPath(); path(ctx); ctx.clip()
    const b = opt.box ?? [-50, -50, 100, 100]
    const cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2, R = Math.max(b[2], b[3]) * 0.75
    if (shade) {
      const g = ctx.createRadialGradient(cx - light[0] * R * 0.9, cy - light[1] * R * 0.9, R * 0.1, cx - light[0] * R * 0.9, cy - light[1] * R * 0.9, R * 1.1)
      g.addColorStop(0, shade); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.globalAlpha = 0.75; ctx.fillStyle = g; ctx.fillRect(b[0] - R, b[1] - R, b[2] + R * 2, b[3] + R * 2)
    }
    if (hi) {
      const g = ctx.createRadialGradient(cx + light[0] * R * 0.55, cy + light[1] * R * 0.55, 0, cx + light[0] * R * 0.55, cy + light[1] * R * 0.55, R * 0.6)
      g.addColorStop(0, hi); g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.globalAlpha = 0.7; ctx.fillStyle = g; ctx.fillRect(b[0] - R, b[1] - R, b[2] + R * 2, b[3] + R * 2)
    }
    ctx.restore()
  }
  if (!noInk) {
    ctx.beginPath(); path(ctx)
    ctx.lineWidth = lw * 0.55; ctx.lineJoin = 'round'; ctx.strokeStyle = PAL.ink; ctx.stroke()
  }
}
export const ellipse = (x, y, rx, ry, rot = 0) => (ctx) => ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU)
// a rubber-hose limb: one fat round-capped curve, ink round a fill, from (x0, y0) bending through
// (cx, cy) to (x1, y1)
export function hose(ctx, x0, y0, cx, cy, x1, y1, w, fill) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1)
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = w + w * 0.7; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1)
  ctx.strokeStyle = fill; ctx.lineWidth = w; ctx.stroke()
}
// a PIE-CUT EYE: a white oval, a black pupil with the classic wedge cut out of it, looking (lx, ly)
export function pieEye(ctx, x, y, rx, ry, lx = 0.3, ly = 0.1, lw = 2) {
  inkShape(ctx, ellipse(x, y, rx, ry), PAL.white, lw)
  const px = x + lx * rx * 0.4, py = y + ly * ry * 0.35
  ctx.beginPath(); ctx.ellipse(px, py, rx * 0.5, ry * 0.62, 0, 0, TAU); ctx.fillStyle = PAL.ink; ctx.fill()
  // the wedge: a slice of white cut from the top of the pupil
  ctx.beginPath(); ctx.moveTo(px, py - ry * 0.05)
  ctx.lineTo(px - rx * 0.2, py - ry * 0.7); ctx.lineTo(px + rx * 0.12, py - ry * 0.7); ctx.closePath()
  ctx.fillStyle = PAL.white; ctx.fill()
}
// a cartoon flame: a teardrop tongue licking up, three nested colours, ink outlined
export function flame(ctx, x, y, s, phase = 0) {
  const lean = Math.sin(phase) * 0.25
  const tongue = (k) => (c) => {
    c.moveTo(x - s * 0.5 * k, y)
    c.bezierCurveTo(x - s * 0.6 * k, y - s * 0.7 * k, x + lean * s - s * 0.1, y - s * 1.0 * k, x + lean * s * 1.6, y - s * 1.55 * k)
    c.bezierCurveTo(x + s * 0.25 * k, y - s * 0.9 * k, x + s * 0.65 * k, y - s * 0.6 * k, x + s * 0.5 * k, y)
    c.quadraticCurveTo(x, y + s * 0.35 * k, x - s * 0.5 * k, y)
  }
  inkShape(ctx, tongue(1), PAL.lava, Math.max(1.2, s * 0.16))
  inkShape(ctx, tongue(0.66), PAL.lavaHot, 0, { noInk: true })
  inkShape(ctx, tongue(0.36), PAL.lavaGlow, 0, { noInk: true })
}
// a soft ground shadow under a body (in the bake: a body's own shadow moves with it)
export function groundShadow(ctx, x, y, rx, ry, a = 0.35) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx)
  g.addColorStop(0, `rgba(28,18,13,${a})`); g.addColorStop(0.7, `rgba(28,18,13,${a * 0.6})`); g.addColorStop(1, 'rgba(28,18,13,0)')
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y)
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rx, 0, TAU); ctx.fill(); ctx.restore()
}
// the hit-flash twin of a painted canvas: the same drawing washed to cream, its ink still showing, so
// a body flashing on every hit still reads as itself
export function whiteTwin(cv) {
  const w = mkCanvas(cv.width, cv.height)
  const x = w.getContext('2d')
  x.drawImage(cv, 0, 0)
  x.globalCompositeOperation = 'source-atop'
  x.fillStyle = 'rgba(255,250,236,0.68)'; x.fillRect(0, 0, w.width, w.height)
  return w
}
