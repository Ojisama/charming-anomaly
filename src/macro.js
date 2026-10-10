// Book 3, BURROW: the MACRO PHOTOGRAPHY look.
//
// A nature-documentary macro lens: wet soil grains, root hairs, fur strands, glossy chitin, the
// olm's translucent skin, low raking light with deep contact shadows, and a shallow depth of field
// (render.js runs LENS_FRAG over the whole stage in these two chapters: the play area tack-sharp,
// the screen edges falling into bokeh).
//
// Everything here paints with the browser's Canvas 2D API, not Pixi Graphics: radial and linear
// gradients, soft blur and compositing are what make a surface read as photographed rather than
// drawn, and Graphics has none of them. render.js turns each canvas into a texture.
//
// NO ctx.filter ANYWHERE. Safari before 18 ignores it silently, so a blur made with it would be a
// hard edge on half the phones that play this. Every blur here is the SHADOW TRICK (withBlur): the
// shape is drawn far off the canvas and only its shadow, offset back into place, lands.
//
// Pure functions of their arguments plus a seeded rng: the same bake every boot, every device.

const TAU = Math.PI * 2
const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t) }

export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

// ---- colour -------------------------------------------------------------------------------------
const R_ = (h) => (h >> 16) & 255, G_ = (h) => (h >> 8) & 255, B_ = (h) => h & 255
export function mixc(a, b, t) {
  t = clamp01(t)
  return (Math.round(lerp(R_(a), R_(b), t)) << 16) | (Math.round(lerp(G_(a), G_(b), t)) << 8) | Math.round(lerp(B_(a), B_(b), t))
}
const shadeC = (c, k) => (k >= 0 ? mixc(c, 0xffffff, k) : mixc(c, 0x000000, -k))
export function css(h, a = 1) { return `rgba(${R_(h)},${G_(h)},${B_(h)},${a})` }

// ---- geometry -----------------------------------------------------------------------------------
export function ellipsePts(cx, cy, rx, ry, rot = 0, n = 40) {
  const out = [], c = Math.cos(rot), s = Math.sin(rot)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry
    out.push(cx + x * c - y * s, cy + x * s + y * c)
  }
  return out
}
export function spineOutline(spine, halfW, n = 36, t0 = 0, t1 = 1) {
  const top = [], bot = []
  for (let i = 0; i <= n; i++) {
    const t = t0 + (t1 - t0) * (i / n)
    const [x, y] = spine(t)
    const [ax, ay] = spine(Math.max(0, t - 0.008)), [bx, by] = spine(Math.min(1, t + 0.008))
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1
    const nx = -dy / len, ny = dx / len, w = halfW(t)
    top.push(x + nx * w, y + ny * w)
    bot.unshift(x - nx * w, y - ny * w)
  }
  return [...top, ...bot]
}
// at(k): the outline shrunk toward its own crown (k = 1 the silhouette, 0 the crown line/point)
export const ovalAt = (cx, cy, rx, ry, rot = 0, n = 40) => (k) => ellipsePts(cx, cy, rx * (0.2 + 0.8 * k), ry * k, rot, n)
export const spineAt = (spine, half, n = 36, t0 = 0, t1 = 1) => (k) => spineOutline(spine, (t) => half(t) * k, n, t0, t1)

export function trace(ctx, pts) {
  ctx.beginPath()
  ctx.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
  ctx.closePath()
}
function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < x0) x0 = pts[i]; if (pts[i] > x1) x1 = pts[i]
    if (pts[i + 1] < y0) y0 = pts[i + 1]; if (pts[i + 1] > y1) y1 = pts[i + 1]
  }
  return [x0, y0, x1, y1]
}
function inside(pts, x, y) {
  let c = false
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

// ---- the soft primitives --------------------------------------------------------------------------
// ctx._S is the bake's px-per-unit, set by bakeLocal; shadowBlur is in device px and ignores the
// transform, so every blur radius here is stated in local units and multiplied back.
const OFF = 30000
export function withBlur(ctx, blur, color, draw) {
  const S = ctx._S || 1
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = Math.max(0.01, blur * S)
  ctx.shadowOffsetX = OFF
  ctx.shadowOffsetY = 0
  // the shadow offset is in device px, so the shape is moved off in device px too: a bake painted
  // under ctx.rotate (paintShovel) still lands its blur in place
  const m = ctx.getTransform()
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e - OFF, m.f)
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'
  draw()
  ctx.restore()
}
export function softFill(ctx, pts, blur, color) {
  withBlur(ctx, blur, color, () => { trace(ctx, pts); ctx.fill() })
}
export function softDot(ctx, x, y, r, blur, color) {
  withBlur(ctx, blur, color, () => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill() })
}
// Darkness creeping in from the outline, inside it: what makes a flat fill read as a rounded form.
export function innerShadow(ctx, pts, blur, color, dx = 0, dy = 0) {
  const [x0, y0, x1, y1] = bbox(pts), m = blur * 4 + Math.abs(dx) + Math.abs(dy) + 4
  ctx.save()
  trace(ctx, pts); ctx.clip()
  withBlur(ctx, blur, color, () => {
    ctx.beginPath()
    ctx.rect(x0 - m, y0 - m, x1 - x0 + m * 2, y1 - y0 + m * 2)
    ctx.moveTo(pts[0] + dx, pts[1] + dy)
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] + dx, pts[i + 1] + dy)
    ctx.closePath()
    ctx.fill('evenodd')
  })
  ctx.restore()
}
// A form shaded from rim to crown by nested outlines, then smoothed over by the inner shadow.
export function volume(ctx, at, base, o = {}) {
  const N = o.steps ?? 16, kMin = o.kMin ?? 0.15
  const dark = shadeC(base, -(o.ao ?? 0.55)), lit = shadeC(base, o.lit ?? 0.3)
  for (let i = 0; i <= N; i++) {
    const u = i / N, k = 1 - u * (1 - kMin)
    const c = u < 0.4 ? mixc(dark, base, Math.pow(u / 0.4, 0.8)) : mixc(base, lit, Math.pow((u - 0.4) / 0.6, 1.2))
    trace(ctx, at(k)); ctx.fillStyle = css(c); ctx.fill()
  }
  const sil = at(1)
  if ((o.rim ?? 1) > 0) innerShadow(ctx, sil, o.rimBlur ?? 2.2, css(shadeC(base, -0.8), 0.75 * (o.rim ?? 1)))
  return sil
}
// Wet specular: a soft halo and a hard core, both at the crown.
export function specular(ctx, pts, a = 0.8, blur = 1.2) {
  softFill(ctx, pts, blur * 2.2, `rgba(255,255,255,${a * 0.45})`)
  softFill(ctx, pts, blur * 0.5, `rgba(255,255,255,${a})`)
}
let noiseCanvas = null
function noisePattern(ctx) {
  if (!noiseCanvas) {
    noiseCanvas = makeCanvas(96, 96)
    const c = noiseCanvas.getContext('2d'), id = c.createImageData(96, 96), r = rng(77)
    for (let i = 0; i < id.data.length; i += 4) { const v = 70 + r() * 120; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255 }
    c.putImageData(id, 0, 0)
  }
  return ctx.createPattern(noiseCanvas, 'repeat')
}
// Skin/shell grain: noise overlaid inside the outline, so close up a surface has a texture.
export function grain(ctx, pts, a = 0.35, mode = 'overlay') {
  ctx.save()
  trace(ctx, pts); ctx.clip()
  ctx.globalCompositeOperation = mode
  ctx.globalAlpha = a
  const p = noisePattern(ctx)
  const S = ctx._S || 1
  p.setTransform?.(new DOMMatrix([1 / S, 0, 0, 1 / S, 0, 0]))
  ctx.fillStyle = p
  const [x0, y0, x1, y1] = bbox(pts)
  ctx.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4)
  ctx.restore()
}
// Hair: strands rooted inside `pts`, combed along dir(x, y) -> angle, some breaking the outline.
export function fur(ctx, pts, rnd, n, o) {
  const [x0, y0, x1, y1] = bbox(pts)
  ctx.save()
  ctx.lineCap = 'round'
  let placed = 0, tries = 0
  while (placed < n && tries < n * 8) {
    tries++
    const x = lerp(x0, x1, rnd()), y = lerp(y0, y1, rnd())
    if (!inside(pts, x, y)) continue
    placed++
    const a = o.dir(x, y) + (rnd() - 0.5) * (o.jitter ?? 0.5)
    const L = o.len * (0.6 + rnd() * 0.7)
    const bend = (rnd() - 0.5) * L * 0.5
    const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L
    const mx = (x + ex) / 2 - Math.sin(a) * bend, my = (y + ey) / 2 + Math.cos(a) * bend
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mx, my, ex, ey)
    ctx.strokeStyle = o.color(rnd(), x, y)
    ctx.lineWidth = o.width * (0.6 + rnd() * 0.8)
    ctx.stroke()
  }
  ctx.restore()
}
// A tapered limb: a dark under-edge, the base, a lit top line.
export function limb(ctx, pts, w0, w1, base, o = {}) {
  const seg = (k, color) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1)
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1]
      for (let s = 0; s < 4; s++) {
        const u0 = s / 4, u1 = (s + 1) / 4
        const w = lerp(w0, w1, lerp(t0, t1, (u0 + u1) / 2)) * k
        ctx.beginPath(); ctx.moveTo(lerp(ax, bx, u0), lerp(ay, by, u0)); ctx.lineTo(lerp(ax, bx, u1), lerp(ay, by, u1))
        ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke()
      }
    }
  }
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  seg(1.25, css(shadeC(base, -0.7)))
  seg(1, css(base))
  seg(0.55, css(shadeC(base, 0.18)))
  if (o.spec !== false) seg(0.18, `rgba(255,255,255,${o.spec ?? 0.55})`)
  ctx.restore()
}
// A glossy bead eye: black glass, a softbox window reflected in it, a faint rim of the socket.
export function eye(ctx, x, y, r, o = {}) {
  if (o.socket != null) softDot(ctx, x, y, r * 1.2, r * 0.5, css(o.socket, 0.8))
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
  g.addColorStop(0, css(o.iris ?? 0x2a2420)); g.addColorStop(1, '#050303')
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = g; ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillRect(x - r * 0.5, y - r * 0.55, r * 0.42, r * 0.32)
  softDot(ctx, x + r * 0.35, y + r * 0.35, r * 0.18, r * 0.2, 'rgba(255,255,255,0.35)')
}

// ---- baking ---------------------------------------------------------------------------------------
// Paint into a canvas centred on the local origin, trim to what was painted, and hand back the
// three twins render.js needs, cut on ONE rectangle so they share an anchor:
//   body   — the creature as photographed;
//   white  — its exact silhouette in white (the hit flash);
//   shadow — the silhouette, black and blurred: the cast shadow of the low raking key light, which
//            render.js lays on the floor offset away from the light and turned with the body.
export function bakeLocal(E, S, paint, o = {}) {
  const W = Math.ceil(E * 2 * S)
  const c = makeCanvas(W, W)
  const ctx = c.getContext('2d')
  ctx._S = S
  ctx.setTransform(S, 0, 0, S, W / 2, W / 2)
  paint(ctx)
  // trim
  const id = ctx.getImageData(0, 0, W, W).data
  let x0 = W, y0 = W, x1 = -1, y1 = -1
  for (let y = 0; y < W; y++) {
    const row = y * W * 4
    for (let x = 0; x < W; x++) {
      if (id[row + x * 4 + 3] > 6) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    }
  }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 1 }
  const pad = Math.ceil((o.shadowBlur ?? 3) * S * 2.2) + 2
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(W - 1, y1 + pad)
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  const body = makeCanvas(w, h)
  body.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h)
  const white = makeCanvas(w, h)
  { const wc = white.getContext('2d'); wc.drawImage(body, 0, 0); wc.globalCompositeOperation = 'source-in'; wc.fillStyle = '#fff'; wc.fillRect(0, 0, w, h) }
  const shadow = makeCanvas(w, h)
  {
    const sc = shadow.getContext('2d')
    const sil = makeCanvas(w, h), si = sil.getContext('2d')
    si.drawImage(body, 0, 0); si.globalCompositeOperation = 'source-in'; si.fillStyle = '#000'; si.fillRect(0, 0, w, h)
    sc.shadowColor = 'rgba(0,0,0,1)'; sc.shadowBlur = (o.shadowBlur ?? 3) * S; sc.shadowOffsetX = OFF
    sc.drawImage(sil, -OFF, 0)
  }
  return { body, white, shadow, ax: (W / 2 - x0) / w, ay: (W / 2 - y0) / h, S }
}

// ==== THE LENS ===================================================================================
// One full-screen pass over the stage, Burrow chapters only. In order:
//   depth of field — a circle of confusion that is zero over the play area and grows toward the
//     screen edges (screen-relative, so a phone and a desktop both keep a sharp middle), sampled
//     as a 16-tap golden-angle disc weighted toward bright texels so highlights open into bokeh;
//   halation — a small ring of taps that lets only the brightest texels bleed (wet glints, crystals);
//   the raking key — a broad wash of light from one side of the frame, dark falling off the other;
//   the grade — split toning (cool shadows / warm highlights, or the cave's own pair), a filmic
//     shoulder, a heavy vignette and moving film grain.
export const LENS_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uInputClamp;
uniform float uTime;
uniform float uBlurPx;
uniform vec2 uFocus;
uniform vec2 uLightDir;
uniform float uKey;
uniform float uExposure;
uniform vec3 uShadowTone;
uniform vec3 uLightTone;
uniform float uVignette;
uniform float uGrain;
uniform float uSharpR;

vec3 tap(vec2 uv) {
  return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw)).rgb;
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main(void) {
  vec2 frameUV = vTextureCoord * uInputSize.xy / uOutputFrame.zw;
  vec2 q = (frameUV - uFocus) * 2.0;
  float aspect = uOutputFrame.z / uOutputFrame.w;
  // the circle of confusion: an ellipse that follows the screen's own shape, squashed a little
  // across on a tall screen so the sides of a phone keep more of their focus
  vec2 qe = q * vec2(mix(0.82, 1.0, clamp(aspect, 0.0, 1.0)), 1.0);
  float d = length(qe);
  float coc = smoothstep(uSharpR, uSharpR + 0.62, d);
  vec3 col;
  vec3 c0 = tap(vTextureCoord);
  if (coc < 0.02) {
    col = c0;
  } else {
    float rad = coc * uBlurPx;
    vec3 acc = c0; float wsum = 1.0;
    for (int i = 1; i < 17; i++) {
      float fi = float(i);
      float r = sqrt(fi / 16.0) * rad;
      float a = fi * 2.39996;
      vec2 off = vec2(cos(a), sin(a)) * r * uInputSize.zw;
      vec3 s = tap(vTextureCoord + off);
      float l = luma(s);
      float w = 1.0 + 6.0 * l * l * l * l;
      acc += s * w; wsum += w;
    }
    col = acc / wsum;
  }
  // halation: only what is already near white bleeds
  vec3 halo = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0472 + 0.5;
    vec3 s = tap(vTextureCoord + vec2(cos(a), sin(a)) * 3.5 * uInputSize.zw);
    halo += max(s - 0.62, 0.0);
  }
  col += halo * 0.32;

  // the raking key: bright along the light's side of the frame, falling into shadow across it
  float side = dot(q * vec2(aspect, 1.0) / max(aspect, 1.0), -uLightDir);
  col *= 1.0 + uKey * clamp(side * 0.55 + 0.1, -0.7, 0.8);
  col *= uExposure;   // 1 by day; Topsoil's Sundown takes it down

  // grade: split tone around the mid luminance, then a soft filmic shoulder
  float L = luma(col);
  col = mix(col, col * uShadowTone * 1.6, (1.0 - smoothstep(0.0, 0.42, L)) * 0.55);
  col = mix(col, col * uLightTone * 1.25, smoothstep(0.35, 1.0, L) * 0.5);
  col = col / (1.0 + col * 0.18) * 1.12;
  // saturation: rich in focus, washing out with the blur
  float L2 = luma(col);
  col = mix(vec3(L2), col, 1.12 - 0.35 * coc);

  // vignette: the lens hood
  float v = smoothstep(0.55, 1.65, length(q * vec2(1.0, 0.92)));
  col *= 1.0 - uVignette * v;

  // grain, moving: brightest in the mids like real film
  float g = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 517.0) - 0.5;
  col += g * uGrain * (0.35 + L2 * (1.0 - L2) * 2.6);

  finalColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

// ==== THE FLOORS =================================================================================
// One seamless tile per chapter, painted once (lazily, the first time a run enters the chapter) at
// TILE_RES px per world px. Every element near an edge is painted again across it, and the noise
// fields are periodic, so the tile wraps without a seam. The light is FIXED here — the floor never
// turns — so it can be the low raking key itself: lit from the top-left, shadows thrown down-right.
export const TILE_WORLD = 1024
export const TILE_RES = 1.5
const LX = -0.62, LY = -0.78   // toward the light, screen space (matches the lens's uLightDir)

function periodicNoise(rnd, cells) {
  const g = new Float32Array(cells * cells)
  for (let i = 0; i < g.length; i++) g[i] = rnd()
  return (u, v) => {   // u, v in [0, 1)
    const x = u * cells, y = v * cells
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf)
    const i0 = ((xi % cells) + cells) % cells, j0 = ((yi % cells) + cells) % cells
    const i1 = (i0 + 1) % cells, j1 = (j0 + 1) % cells
    const a = g[j0 * cells + i0], b = g[j0 * cells + i1], c = g[j1 * cells + i0], d = g[j1 * cells + i1]
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy)
  }
}
function fbm(rnd, octaves) {
  const ns = octaves.map(([cells]) => periodicNoise(rnd, cells))
  let tot = 0; for (const [, w] of octaves) tot += w
  return (u, v) => { let s = 0; for (let i = 0; i < ns.length; i++) s += ns[i](u, v) * octaves[i][1]; return s / tot }
}
// A smooth periodic field sampled once onto an N x N grid and read back bilinearly: the colour and
// swell fields are low-frequency, and evaluating five octaves per texel cost seconds per tile.
function lowres(fn, N = 256) {
  const g = new Float32Array(N * N)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g[y * N + x] = fn(x / N, y / N)
  return (u, v) => {
    const x = u * N, y = v * N, xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
    const i0 = ((xi % N) + N) % N, j0 = ((yi % N) + N) % N, i1 = (i0 + 1) % N, j1 = (j0 + 1) % N
    return lerp(lerp(g[j0 * N + i0], g[j0 * N + i1], xf), lerp(g[j1 * N + i0], g[j1 * N + i1], xf), yf)
  }
}
// Paint fn at (x, y) and at every wrap copy whose reach r crosses an edge.
function wrapAt(x, y, r, fn) {
  const T = TILE_WORLD
  for (const dx of [0, -T, T]) {
    if (dx === -T && x + r < T) continue
    if (dx === T && x - r > 0) continue
    for (const dy of [0, -T, T]) {
      if (dy === -T && y + r < T) continue
      if (dy === T && y - r > 0) continue
      fn(x + dx, y + dy)
    }
  }
}
function baseField(ctx, field, palette) {
  const W = ctx.canvas.width, H = ctx.canvas.height
  const id = ctx.createImageData(W, H), d = id.data
  const stops = palette.length - 1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = clamp01(field(x / W, y / H))
      const f = v * stops, i = Math.min(stops - 1, Math.floor(f)), t = f - i
      const a = palette[i], b = palette[i + 1], o = (y * W + x) * 4
      d[o] = lerp(R_(a), R_(b), t); d[o + 1] = lerp(G_(a), G_(b), t); d[o + 2] = lerp(B_(a), B_(b), t); d[o + 3] = 255
    }
  }
  ctx.putImageData(id, 0, 0)
}
// A LIT HEIGHTFIELD: the surface's own relief under the raking key, which is what makes a floor read
// as photographed ground rather than as a painted colour. height(u, v) -> 0..1 (periodic), colour
// (u, v, h) -> [r, g, b] 0..255, wet(u, v) -> 0..1 (how glossy: adds a Blinn highlight).
function reliefField(ctx, height, colour, o) {
  const W = ctx.canvas.width
  const H = height instanceof Float32Array ? height : new Float32Array(W * W)
  if (H !== height) for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) H[y * W + x] = height(x / W, y / W)
  const id = ctx.createImageData(W, W), d = id.data
  const lz = o.lightZ ?? 0.55, ll = Math.hypot(LX, LY, lz), Lx = LX / ll, Ly = LY / ll, Lz = lz / ll
  const hx0 = Lx, hy0 = Ly, hz0 = Lz + 1, hl = Math.hypot(hx0, hy0, hz0), Hx = hx0 / hl, Hy = hy0 / hl, Hz = hz0 / hl
  const amp = o.amp ?? 40, amb = o.ambient ?? 0.35, flat = Lz
  for (let y = 0; y < W; y++) {
    const ym = ((y - 1 + W) % W) * W, yp = ((y + 1) % W) * W, yr = y * W
    for (let x = 0; x < W; x++) {
      const xm = (x - 1 + W) % W, xp = (x + 1) % W
      const dx = (H[yr + xp] - H[yr + xm]) * amp, dy = (H[yp + x] - H[ym + x]) * amp
      const nl = Math.hypot(dx, dy, 1), nx = -dx / nl, ny = -dy / nl, nz = 1 / nl
      const diff = Math.max(0, nx * Lx + ny * Ly + nz * Lz) / flat
      const shade = amb + (1 - amb) * diff
      const u = x / W, v = y / W, h = H[yr + x]
      const [r, g, b] = colour(u, v, h, H.tint ? H.tint[yr + x] : 0.5)
      let sp = 0
      if (o.wet) { const w = o.wet(u, v, h); if (w > 0) sp = Math.pow(Math.max(0, nx * Hx + ny * Hy + nz * Hz), o.shine ?? 60) * w * 255 }
      const k = (yr + x) * 4
      d[k] = Math.min(255, r * shade + sp); d[k + 1] = Math.min(255, g * shade + sp); d[k + 2] = Math.min(255, b * shade + sp * 1.05); d[k + 3] = 255
    }
  }
  ctx.putImageData(id, 0, 0)
}
const pal = (stops) => (t) => {
  t = clamp01(t)
  const f = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), k = f - i, a = stops[i], b = stops[i + 1]
  return [lerp(R_(a), R_(b), k), lerp(G_(a), G_(b), k), lerp(B_(a), B_(b), k)]
}
// A height buffer built from STAMPED BUMPS — a domed blob per crumb, wrapped at the edges — plus a
// low swell. Value noise alone reads as embossed paper; ground is made of grains, so stamp grains.
function stampedHeight(W, rnd, swell, layers) {
  const H = new Float32Array(W * W)
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) H[y * W + x] = swell(x / W, y / W)
  const B = H.slice()
  const C = new Float32Array(W * W).fill(0.5)   // per-stone tint where a 'max' stamp wins
  H.tint = C
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const cx = rnd() * W, cy = rnd() * W, r = L.r0 + Math.pow(rnd(), L.skew ?? 2) * (L.r1 - L.r0)
      const tint = rnd()
      const hgt = L.h * (0.5 + rnd() * 0.7) * (r / L.r1 + 0.4), sy = 0.7 + rnd() * 0.5, R = Math.ceil(r * Math.max(1, sy))
      for (let dy = -R; dy <= R; dy++) {
        const yy = (((Math.floor(cy) + dy) % W) + W) % W
        for (let dx = -R; dx <= R; dx++) {
          const q = (dx * dx) / (r * r) + (dy * dy) / (r * r * sy * sy)
          if (q >= 1) continue
          const xx = (((Math.floor(cx) + dx) % W) + W) % W
          const v = Math.pow(1 - q, L.flat ?? 0.5) * hgt
          const k = yy * W + xx
          if (L.max) { if (B[k] + v > H[k]) { H[k] = B[k] + v; C[k] = tint } } else H[k] += v
        }
      }
    }
  }
  return H
}
function ridged(rnd, cells) {
  const n = periodicNoise(rnd, cells)
  return (u, v) => 1 - Math.abs(n(u, v) * 2 - 1)
}
function blobPts(rnd, x, y, r, n = 9, rough = 0.35, sy = 1, rot = 0) {
  const pts = [], c = Math.cos(rot), s = Math.sin(rot)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, q = r * (1 - rough / 2 + rnd() * rough)
    const px = Math.cos(a) * q, py = Math.sin(a) * q * sy
    pts.push(x + px * c - py * s, y + px * s + py * c)
  }
  return pts
}
function smoothTrace(ctx, pts) {
  const n = pts.length / 2
  ctx.beginPath()
  const mx = (i) => (pts[(i % n) * 2] + pts[((i + 1) % n) * 2]) / 2, my = (i) => (pts[(i % n) * 2 + 1] + pts[((i + 1) % n) * 2 + 1]) / 2
  ctx.moveTo(mx(0), my(0))
  for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(pts[(i % n) * 2], pts[(i % n) * 2 + 1], mx(i), my(i))
  ctx.closePath()
}
// A lit lump on the floor: cast shadow down-right, a body lit from the top-left, a hard glint if wet.
function lump(ctx, pts, cx, cy, r, base, o = {}) {
  const sh = o.shadow ?? 0.55
  withBlur(ctx, r * 0.35 + 0.6, `rgba(0,0,0,${sh})`, () => {
    ctx.save(); ctx.translate(-LX * r * 0.45, -LY * r * 0.45); smoothTrace(ctx, pts); ctx.fill(); ctx.restore()
  })
  const g = ctx.createLinearGradient(cx + LX * r, cy + LY * r, cx - LX * r, cy - LY * r)
  g.addColorStop(0, css(shadeC(base, o.lit ?? 0.35)))
  g.addColorStop(0.45, css(base))
  g.addColorStop(1, css(shadeC(base, -(o.dark ?? 0.6))))
  smoothTrace(ctx, pts); ctx.fillStyle = g; ctx.fill()
  if (o.gloss) {
    softDot(ctx, cx + LX * r * 0.45, cy + LY * r * 0.45, r * 0.22, r * 0.18, `rgba(255,250,235,${o.gloss * 0.6})`)
    ctx.beginPath(); ctx.arc(cx + LX * r * 0.5, cy + LY * r * 0.5, Math.max(0.35, r * 0.09), 0, TAU)
    ctx.fillStyle = `rgba(255,255,250,${o.gloss})`; ctx.fill()
  }
}
function droplet(ctx, x, y, r) {
  // a bead of water: darker than the soil it magnifies, a hard window highlight toward the light,
  // and the light it focuses landing as a bright crescent on the far side
  withBlur(ctx, r * 0.4, 'rgba(0,0,0,0.35)', () => { ctx.beginPath(); ctx.ellipse(x - LX * r * 0.35, y - LY * r * 0.35, r, r * 0.92, 0, 0, TAU); ctx.fill() })
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, 'rgba(40,26,16,0.15)'); g.addColorStop(0.8, 'rgba(20,12,6,0.5)'); g.addColorStop(1, 'rgba(255,240,220,0.35)')
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.92, 0, 0, TAU); ctx.fillStyle = g; ctx.fill()
  ctx.beginPath(); ctx.ellipse(x - LX * r * 0.5, y - LY * r * 0.5, r * 0.45, r * 0.3, Math.atan2(LY, LX), 0, TAU)
  ctx.fillStyle = 'rgba(255,248,236,0.55)'; ctx.fill()
  ctx.beginPath(); ctx.arc(x + LX * r * 0.45, y + LY * r * 0.45, r * 0.16, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill()
}

export function paintTopsoilTile() {
  const S = TILE_RES, W = Math.round(TILE_WORLD * S)
  const c = makeCanvas(W, W), ctx = c.getContext('2d')
  ctx._S = S
  const rnd = rng(9001)
  // 1. the loam: dark humus, lighter dry crumbs, a few damp (darker) drifts
  // relief: a low swell, then crumbs at three sizes (ridged noise reads as clumped aggregate)
  const swell = lowres(fbm(rnd, [[4, 2], [9, 1.2], [23, 0.5]]))
  const hue = lowres(fbm(rnd, [[5, 1], [17, 0.7], [41, 0.5], [97, 0.35]]), 384)
  const damp = lowres(fbm(rnd, [[3, 1], [7, 0.6]]), 128)
  const soilPal = pal([0x140b05, 0x2e1e10, 0x4a3420, 0x6a5038, 0x8c7050])
  const Wpx = ctx.canvas.width
  const H = stampedHeight(Wpx, rnd, (u, v) => swell(u, v) * 6, [
    { n: 9000, r0: 5, r1: 16, h: 3.2, skew: 2.5, max: true },   // aggregates
    { n: 70000, r0: 1.2, r1: 4.5, h: 1.6, skew: 2 },            // crumbs on them
    { n: 160000, r0: 0.6, r1: 1.6, h: 0.7 },                     // silt and sand
  ])
  let hmin = Infinity, hmax = -Infinity
  for (const v of H) { if (v < hmin) hmin = v; if (v > hmax) hmax = v }
  reliefField(ctx, H, (u, v, h, t) => {
    const hn = (h - hmin) / (hmax - hmin)
    const wet = smooth(0.5, 0.72, damp(u, v))
    const [r, g, b] = soilPal(hue(u, v) * 0.7 + hn * 0.55 - 0.15 - wet * 0.2 + (t - 0.5) * 0.25)
    return [r * (1 - wet * 0.25), g * (1 - wet * 0.28), b * (1 - wet * 0.25)]
  }, { amp: 0.55, ambient: 0.22, lightZ: 0.7, wet: (u, v) => 0.08 + 0.45 * smooth(0.5, 0.72, damp(u, v)), shine: 30 })
  ctx.setTransform(S, 0, 0, S, 0, 0)
  // 2. fine grain: sand and silt specks, the odd quartz glint
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * TILE_WORLD, y = rnd() * TILE_WORLD, r = 0.25 + rnd() * rnd() * 1.4
    const k = rnd()
    ctx.fillStyle = k < 0.45 ? `rgba(14,8,4,${0.35 + rnd() * 0.4})` : k < 0.9 ? css(mixc(0x6a4a2e, 0xb08a60, rnd()), 0.35 + rnd() * 0.45) : `rgba(255,246,226,${0.5 + rnd() * 0.5})`
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // 3. aggregates: crumbs of soil, each lit and shadowed
  const soils = [0x3e2a18, 0x5a3e26, 0x6e4c2e, 0x7a5a3a, 0x4a321e, 0x8a6a48]
  for (let i = 0; i < 420; i++) {
    const x = rnd() * TILE_WORLD, y = rnd() * TILE_WORLD, r = 1.1 + Math.pow(rnd(), 3) * 5
    const base = soils[Math.floor(rnd() * soils.length)], seed = rnd() * 1e6
    wrapAt(x, y, r * 2, (px, py) => {
      const rr = rng(seed)
      lump(ctx, blobPts(rr, px, py, r, 9, 0.75, 0.65 + rr() * 0.35, rr() * TAU), px, py, r, base, { gloss: rr() < 0.25 ? 0.6 : 0, shadow: 0.7 })
    })
  }
  // 4. root hairs and fine roots: pale, fibrous, with fuzz along them
  for (let i = 0; i < 46; i++) {
    const x = rnd() * TILE_WORLD, y = rnd() * TILE_WORLD
    const L = 60 + rnd() * 220, w0 = 0.6 + rnd() * rnd() * 3.2, a0 = rnd() * TAU, seed = rnd() * 1e6
    wrapAt(x, y, L, (px, py) => {
      const rr = rng(seed), pts = [[px, py]]
      let a = a0, qx = px, qy = py
      for (let s = 0; s < 14; s++) { a += (rr() - 0.5) * 0.5; qx += Math.cos(a) * L / 14; qy += Math.sin(a) * L / 14; pts.push([qx, qy]) }
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      withBlur(ctx, w0 * 0.8 + 0.5, 'rgba(0,0,0,0.6)', () => {
        ctx.beginPath(); ctx.moveTo(pts[0][0] - LX * w0 * 1.4, pts[0][1] - LY * w0 * 1.4)
        for (const [ux, uy] of pts) ctx.lineTo(ux - LX * w0 * 1.4, uy - LY * w0 * 1.4)
        ctx.lineWidth = w0; ctx.stroke()
      })
      for (let s = 0; s < pts.length - 1; s++) {
        const u = s / (pts.length - 1), w = w0 * (1 - u * 0.75)
        ctx.beginPath(); ctx.moveTo(pts[s][0], pts[s][1]); ctx.lineTo(pts[s + 1][0], pts[s + 1][1])
        ctx.lineWidth = w; ctx.strokeStyle = css(mixc(0xa8865c, 0xe8d8b8, 0.4 + 0.4 * u)); ctx.stroke()
        ctx.lineWidth = w * 0.35; ctx.strokeStyle = 'rgba(255,250,236,0.7)'
        ctx.beginPath(); ctx.moveTo(pts[s][0] + LX * w * 0.25, pts[s][1] + LY * w * 0.25); ctx.lineTo(pts[s + 1][0] + LX * w * 0.25, pts[s + 1][1] + LY * w * 0.25); ctx.stroke()
        // root hairs: the white fuzz a macro lens finds on every rootlet
        for (let h = 0; h < 5; h++) {
          const hx = lerp(pts[s][0], pts[s + 1][0], rr()), hy = lerp(pts[s][1], pts[s + 1][1], rr())
          const ha = rr() * TAU, hl = 1.5 + rr() * 4
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(ha) * hl, hy + Math.sin(ha) * hl)
          ctx.lineWidth = 0.25; ctx.strokeStyle = 'rgba(245,236,218,0.55)'; ctx.stroke()
        }
      }
      ctx.restore()
    })
  }
  // 5. pebbles: smooth, wet, each a little mirror for the key light
  const stones = [0x7a7268, 0x5e564e, 0x8a7c66, 0x9a8e7a, 0x7a5c3c, 0x4a4640, 0xa89e8c]
  for (let i = 0; i < 40; i++) {
    const x = rnd() * TILE_WORLD, y = rnd() * TILE_WORLD, r = 3 + Math.pow(rnd(), 1.8) * 11
    const base = stones[Math.floor(rnd() * stones.length)], seed = rnd() * 1e6
    wrapAt(x, y, r * 2.2, (px, py) => {
      const rr = rng(seed), pts = blobPts(rr, px, py, r, 12, 0.22, 0.75 + rr() * 0.25, rr() * TAU)
      lump(ctx, pts, px, py, r, base, { gloss: 0.95, shadow: 0.75, lit: 0.45, dark: 0.65 })
      // speckle in the stone
      ctx.save(); smoothTrace(ctx, pts); ctx.clip()
      for (let k = 0; k < r * 3; k++) { ctx.fillStyle = rr() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)'; ctx.fillRect(px + (rr() - 0.5) * r * 2, py + (rr() - 0.5) * r * 2, 0.6, 0.6) }
      ctx.restore()
    })
  }
  // 6. litter: fragments of dead leaf with their veins, husks, a twig
  for (let i = 0; i < 22; i++) {
    const x = rnd() * TILE_WORLD, y = rnd() * TILE_WORLD, r = 6 + rnd() * 14, rot = rnd() * TAU, seed = rnd() * 1e6
    wrapAt(x, y, r * 2, (px, py) => {
      const rr = rng(seed)
      const pts = blobPts(rr, px, py, r, 11, 0.6, 0.55, rot)
      withBlur(ctx, 2, 'rgba(0,0,0,0.45)', () => { ctx.save(); ctx.translate(-LX * 2.2, -LY * 2.2); smoothTrace(ctx, pts); ctx.fill(); ctx.restore() })
      smoothTrace(ctx, pts); ctx.fillStyle = css(mixc(0x6a3e1c, 0xa06a34, rr()), 0.92); ctx.fill()
      ctx.save(); smoothTrace(ctx, pts); ctx.clip()
      ctx.strokeStyle = 'rgba(232,196,140,0.45)'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(px - Math.cos(rot) * r, py - Math.sin(rot) * r); ctx.lineTo(px + Math.cos(rot) * r, py + Math.sin(rot) * r); ctx.stroke()
      for (let v = -3; v <= 3; v++) {
        const bx = px + Math.cos(rot) * v * r * 0.25, by = py + Math.sin(rot) * v * r * 0.25
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(rot + s * 1.0) * r * 0.6, by + Math.sin(rot + s * 1.0) * r * 0.6); ctx.stroke() }
      }
      ctx.restore()
    })
  }
  // 7. dew: beads of water standing on the crumbs
  for (let i = 0; i < 40; i++) {
    const x = rnd() * TILE_WORLD, y = rnd() * TILE_WORLD, r = 1.2 + Math.pow(rnd(), 2) * 5
    wrapAt(x, y, r * 2, (px, py) => droplet(ctx, px, py, r))
  }
  return c
}

export function paintGeodeTile() {
  const S = TILE_RES, W = Math.round(TILE_WORLD * S)
  const c = makeCanvas(W, W), ctx = c.getContext('2d')
  ctx._S = S
  const rnd = rng(4242)
  // 1. wet basalt, cold and nearly black, mottled
  // relief: a wet cave floor of rounded stones half sunk in grit, everything glazed with water
  const swell = lowres(fbm(rnd, [[3, 2], [7, 1.3], [16, 0.6]]))
  const tone = lowres(fbm(rnd, [[4, 1], [13, 0.6], [37, 0.4]]))
  const Wpx = ctx.canvas.width
  const H = stampedHeight(Wpx, rnd, (u, v) => swell(u, v) * 8, [
    { n: 240, r0: 10, r1: 36, h: 4, skew: 2.2, max: true, flat: 0.22 },   // stones: flat-topped cobbles
    { n: 7000, r0: 2.5, r1: 7, h: 2.2, skew: 2, max: true, flat: 0.35 },   // gravel
    { n: 90000, r0: 0.6, r1: 2.2, h: 0.8 },                    // grit
  ])
  let hmin = Infinity, hmax = -Infinity
  for (const v of H) { if (v < hmin) hmin = v; if (v > hmax) hmax = v }
  const rockPal = pal([0x050507, 0x0f0e14, 0x1e1c26, 0x302d3a, 0x47434f])
  const greys = [0x1c1c20, 0x2a2a2e, 0x232028, 0x36343a, 0x1e1c24, 0x2c2834, 0x403c44]
  reliefField(ctx, H, (u, v, h, t) => {
    const hn = (h - hmin) / (hmax - hmin)
    const c = greys[Math.floor(t * greys.length) % greys.length]
    const k = smooth(0.0, 0.32, hn)   // the gaps between stones fall to black
    const [r, g, b] = rockPal(tone(u, v) * 0.5 + hn * 0.5)
    return [lerp(r * 0.5, (R_(c) + r) * 0.6, k), lerp(g * 0.5, (G_(c) + g) * 0.6, k), lerp(b * 0.5, (B_(c) + b) * 0.6, k)]
  }, { amp: 0.75, ambient: 0.22, lightZ: 0.5, wet: (u, v) => 0.3 + 0.4 * tone(u, v), shine: 40 })
  // 2. quartz veins: pale seams through the rock, glowing faintly where they are thin
  for (let i = 0; i < 9; i++) {
    const x = rnd() * TILE_WORLD, y = rnd() * TILE_WORLD, L = 200 + rnd() * 380, a0 = rnd() * TAU, w0 = 0.8 + rnd() * 2.6, seed = rnd() * 1e6
    wrapAt(x, y, L, (px, py) => {
      const rr = rng(seed), pts = [[px, py]]
      let a = a0, qx = px, qy = py
      for (let s = 0; s < 22; s++) { a += (rr() - 0.5) * 0.7; qx += Math.cos(a) * L / 22; qy += Math.sin(a) * L / 22; pts.push([qx, qy]) }
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      withBlur(ctx, 6, 'rgba(150,120,255,0.35)', () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const [ux, uy] of pts) ctx.lineTo(ux, uy); ctx.lineWidth = w0 * 2; ctx.stroke() })
      for (let s = 0; s < pts.length - 1; s++) {
        const w = w0 * (0.5 + 0.5 * Math.sin(s * 0.7 + seed))
        ctx.beginPath(); ctx.moveTo(pts[s][0], pts[s][1]); ctx.lineTo(pts[s + 1][0], pts[s + 1][1])
        ctx.lineWidth = w + 0.4; ctx.strokeStyle = 'rgba(200,184,236,0.55)'; ctx.stroke()
        ctx.lineWidth = w * 0.4; ctx.strokeStyle = 'rgba(244,240,255,0.8)'; ctx.stroke()
      }
      ctx.restore()
    })
  }
  // 3. mica glitter: points of light at every angle, a few haloed
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * TILE_WORLD, y = rnd() * TILE_WORLD
    const hue = [0xffffff, 0xb8f0ff, 0xd8c0ff, 0x9ad8ff][Math.floor(rnd() * 4)], r = 0.2 + rnd() * rnd() * 0.9
    ctx.fillStyle = css(hue, 0.25 + rnd() * 0.6); ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 26; i++) {
    const x = rnd() * TILE_WORLD, y = rnd() * TILE_WORLD, r = 0.6 + rnd() * 1.2
    wrapAt(x, y, 8, (px, py) => {
      softDot(ctx, px, py, r, 3, 'rgba(190,230,255,0.7)')
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(px - r * 3, py - 0.2, r * 6, 0.4); ctx.fillRect(px - 0.2, py - r * 3, 0.4, r * 6)
    })
  }
  // 4. wet rock: smooth dark stones, each with the cold sheen of the cave on it
  const rocks = [0x2a2436, 0x3a3248, 0x1e1a28, 0x4a4058]
  for (let i = 0; i < 34; i++) {
    const x = rnd() * TILE_WORLD, y = rnd() * TILE_WORLD, r = 4 + Math.pow(rnd(), 1.5) * 16
    const base = rocks[Math.floor(rnd() * rocks.length)], seed = rnd() * 1e6
    wrapAt(x, y, r * 2.2, (px, py) => {
      const rr = rng(seed), pts = blobPts(rr, px, py, r, 7, 0.35, 0.7 + rr() * 0.3, rr() * TAU)
      lump(ctx, pts, px, py, r, base, { gloss: 0.75, shadow: 0.85, lit: 0.4, dark: 0.7 })
    })
  }
  // 5. druses: little pockets of crystal points seen from above, each with its own glow
  const hues = [[0x8a5ae0, 0xd8c0ff], [0x3ab0d8, 0xb8f0ff], [0xb060d0, 0xf0c8ff]]
  for (let i = 0; i < 26; i++) {
    const x = rnd() * TILE_WORLD, y = rnd() * TILE_WORLD, R = 5 + rnd() * 12, seed = rnd() * 1e6, [h0, h1] = hues[Math.floor(rnd() * 3)]
    wrapAt(x, y, R * 3, (px, py) => {
      const rr = rng(seed)
      ctx.save(); ctx.globalCompositeOperation = 'lighter'
      softDot(ctx, px, py, R * 1.1, R * 1.4, css(h0, 0.35))
      ctx.restore()
      const n = 4 + Math.floor(rr() * 6)
      for (let k = 0; k < n; k++) {
        const a = rr() * TAU, d = rr() * R * 0.7, cx = px + Math.cos(a) * d, cy = py + Math.sin(a) * d, cr = R * (0.18 + rr() * 0.25)
        prismTop(ctx, cx, cy, cr, rr() * TAU, h0, h1)
      }
    })
  }
  // 6. standing water: a few shallow pools, black glass with a streak of reflected light
  for (let i = 0; i < 7; i++) {
    const x = rnd() * TILE_WORLD, y = rnd() * TILE_WORLD, r = 14 + rnd() * 30, seed = rnd() * 1e6
    wrapAt(x, y, r * 2, (px, py) => {
      const rr = rng(seed), pts = blobPts(rr, px, py, r, 12, 0.45, 0.6, rr() * TAU)
      smoothTrace(ctx, pts); ctx.fillStyle = 'rgba(4,3,8,0.75)'; ctx.fill()
      innerShadow(ctx, pts, 2.5, 'rgba(120,110,170,0.5)')
      ctx.save(); smoothTrace(ctx, pts); ctx.clip()
      softFill(ctx, ellipsePts(px + LX * r * 0.2, py + LY * r * 0.2, r * 0.7, r * 0.08, -0.6, 16), 2, 'rgba(200,220,255,0.35)')
      ctx.restore()
    })
  }
  return c
}
// A hexagonal prism seen down its axis: six facets lit by their normals, bright edges, a glint.
export function prismTop(ctx, x, y, r, rot, h0, h1, glow = true) {
  const V = []
  for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * TAU; V.push([x + Math.cos(a) * r, y + Math.sin(a) * r]) }
  const ap = [x + LX * r * 0.18, y + LY * r * 0.18]
  withBlur(ctx, r * 0.4, 'rgba(0,0,0,0.6)', () => { ctx.beginPath(); ctx.arc(x - LX * r * 0.5, y - LY * r * 0.5, r, 0, TAU); ctx.fill() })
  for (let i = 0; i < 6; i++) {
    const p0 = V[i], p1 = V[(i + 1) % 6]
    const mid = Math.atan2((p0[1] + p1[1]) / 2 - y, (p0[0] + p1[0]) / 2 - x)
    const L = 0.5 + 0.5 * Math.cos(mid - Math.atan2(LY, LX))
    ctx.beginPath(); ctx.moveTo(ap[0], ap[1]); ctx.lineTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.closePath()
    ctx.fillStyle = css(mixc(shadeC(h0, -0.55), h1, L * 0.95), 0.92); ctx.fill()
  }
  ctx.save(); ctx.strokeStyle = css(shadeC(h1, 0.5), 0.75); ctx.lineWidth = Math.max(0.25, r * 0.06)
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(ap[0], ap[1]); ctx.lineTo(V[i][0], V[i][1]); ctx.stroke() }
  ctx.beginPath(); ctx.moveTo(V[0][0], V[0][1]); for (const p of V) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.strokeStyle = css(h1, 0.6); ctx.stroke()
  ctx.restore()
  if (glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; softDot(ctx, ap[0], ap[1], r * 0.18, r * 0.25, 'rgba(255,255,255,0.8)'); ctx.restore() }
}

// ==== THE AIR BETWEEN THE LENS AND THE GROUND ======================================================
// Screen-space sprites over the world (render.js's macroAir): sun shafts with motes hanging in them,
// out-of-focus bokeh, and the soft dark shapes of things right in front of the lens at the corners.
export function paintShaft() {
  const c = makeCanvas(96, 512), ctx = c.getContext('2d')
  for (let x = 0; x < 96; x++) {
    const u = (x - 48) / 48, a = Math.exp(-u * u * 4.5)
    const g = ctx.createLinearGradient(0, 0, 0, 512)
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.55, `rgba(255,255,255,${a * 0.55})`); g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g; ctx.fillRect(x, 0, 1, 512)
  }
  return c
}
// A defocused point of light: a disc with the faint bright rim and slightly busy inside of a real
// lens's bokeh, not a gaussian dot.
export function paintBokeh() {
  const N = 128, c = makeCanvas(N, N), ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 60)
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.78, 'rgba(255,255,255,0.7)'); g.addColorStop(0.92, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g; ctx.beginPath()
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU - Math.PI / 2; ctx.lineTo(64 + Math.cos(a) * 61, 64 + Math.sin(a) * 61) }
  ctx.closePath(); ctx.fill()
  return c
}
// The out-of-focus foreground: something a centimetre from the lens. Topsoil: grass blades and a
// root crossing a corner. Geode: a crystal tip lit from inside. Painted already blurred.
export function paintForeground(kind, seed) {
  const W = 420, c = makeCanvas(W, W), ctx = c.getContext('2d')
  ctx._S = 1
  const rnd = rng(seed)
  if (kind === 'geode') {
    // a cluster of crystal points leaning in from the corner (the corner is (0, 0))
    for (let i = 0; i < 4; i++) {
      const a = 0.25 + rnd() * 1.1, L = 220 + rnd() * 160, w = 34 + rnd() * 40
      const tip = [Math.cos(a) * L, Math.sin(a) * L], nx = -Math.sin(a) * w, ny = Math.cos(a) * w
      const pts = [nx, ny, tip[0] * 0.82 + nx * 0.8, tip[1] * 0.82 + ny * 0.8, tip[0], tip[1], tip[0] * 0.82 - nx * 0.8, tip[1] * 0.82 - ny * 0.8, -nx, -ny]
      const hue = [0x6a40c8, 0x2a90c0, 0x9a50c0][Math.floor(rnd() * 3)]
      softFill(ctx, pts, 22, css(shadeC(hue, -0.45), 0.92))
      ctx.save(); ctx.globalCompositeOperation = 'lighter'
      softFill(ctx, [nx * 0.3, ny * 0.3, tip[0] * 0.8, tip[1] * 0.8, -nx * 0.2, -ny * 0.2], 18, css(shadeC(hue, 0.2), 0.5))
      ctx.restore()
    }
  } else {
    // grass blades from the corner, and one thick root across it
    for (let i = 0; i < 5; i++) {
      const a = 0.1 + rnd() * 1.35, L = 240 + rnd() * 200, w = 10 + rnd() * 16, bend = (rnd() - 0.5) * 0.6
      withBlur(ctx, 14 + rnd() * 10, `rgba(${14 + rnd() * 20},${18 + rnd() * 26},${6 + rnd() * 8},0.92)`, () => {
        ctx.beginPath(); ctx.moveTo(-w, 0)
        ctx.quadraticCurveTo(Math.cos(a + bend) * L * 0.5 - w, Math.sin(a + bend) * L * 0.5, Math.cos(a) * L, Math.sin(a) * L)
        ctx.quadraticCurveTo(Math.cos(a + bend) * L * 0.5 + w, Math.sin(a + bend) * L * 0.5, w, 0)
        ctx.closePath(); ctx.fill()
      })
    }
    withBlur(ctx, 18, 'rgba(26,16,8,0.9)', () => {
      ctx.lineCap = 'round'; ctx.lineWidth = 34
      ctx.beginPath(); ctx.moveTo(0, 300); ctx.bezierCurveTo(90, 220, 140, 120, 300, 0); ctx.stroke()
    })
    // the rim of sun caught along the blades' edges
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    withBlur(ctx, 10, 'rgba(255,200,120,0.18)', () => { ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(10, 290); ctx.bezierCurveTo(100, 212, 150, 112, 296, 6); ctx.stroke() })
    ctx.restore()
  }
  return c
}

// ==== THE CAST ===================================================================================
// Eight animals photographed from directly above, nose at +x (render.js's facing contract). Their
// light is OVERHEAD, not raking: these bodies turn to face you, and a baked side light would swing
// round with them. The raking key reaches them anyway, as the cast shadow render.js throws from
// each one's own silhouette (bakeLocal's `shadow` twin) and as the lens's wash across the frame.
//
// Each entry: r (the local radius the art is drawn at — ROSTER_BASE_R maps it to the sim's),
// E (half-size of the paint canvas), shadow/crown (the same numbers groundShadow/eliteCrown take),
// frames (phases or poses), paint(ctx, f, pose).
const crumb = (ctx, x, y, r, base, rnd) => {
  // a soil crumb lit from straight above (it rides a rotating body)
  const pts = blobPts(rnd, x, y, r, 8, 0.5, 0.85, rnd() * TAU)
  withBlur(ctx, r * 0.5, 'rgba(0,0,0,0.5)', () => { smoothTrace(ctx, pts); ctx.fill() })
  const g = ctx.createRadialGradient(x - r * 0.15, y - r * 0.15, 0, x, y, r * 1.1)
  g.addColorStop(0, css(shadeC(base, 0.35))); g.addColorStop(0.6, css(base)); g.addColorStop(1, css(shadeC(base, -0.55)))
  smoothTrace(ctx, pts); ctx.fillStyle = g; ctx.fill()
}
function wetDashes(ctx, spine, half, t0, t1, n, a = 0.75) {
  for (let i = 0; i < n; i++) {
    const t = lerp(t0, t1, (i + 0.5) / n)
    const [x, y] = spine(t), [x2, y2] = spine(Math.min(1, t + 0.012))
    const ang = Math.atan2(y2 - y, x2 - x), w = half(t)
    softFill(ctx, ellipsePts(x, y, w * 0.55, w * 0.16, ang, 12), w * 0.12, `rgba(255,248,244,${a})`)
  }
}
function across(spine, t, k) {
  const [x, y] = spine(t), [x2, y2] = spine(Math.min(1, t + 0.01))
  const dx = x2 - x, dy = y2 - y, d = Math.hypot(dx, dy) || 1
  return [x, y, -dy / d * k, dx / d * k]
}

function paintEarthworm(ctx, phase) {
  const r = 20, rnd = rng(11)
  const stretch = 1 + 0.07 * Math.sin(phase), L = r * 2.7 * stretch
  const spine = (t) => [r * 1.25 - t * L, Math.sin(t * Math.PI * 1.7 - phase) * r * 0.34 * (0.35 + t)]
  const half = (t) => r * 0.25 / Math.sqrt(stretch) * (t < 0.1 ? 0.5 + 0.5 * Math.sin((t / 0.1) * Math.PI / 2) : t > 0.84 ? 0.45 + 0.55 * Math.cos(((t - 0.84) / 0.16) * Math.PI / 2) : 1)
    * (1 + 0.2 * Math.exp(-Math.pow((t - 0.3) / 0.06, 2)))
  const at = spineAt(spine, half, 64)
  const sil = volume(ctx, at, 0xb25a52, { lit: 0.28, ao: 0.6, kMin: 0.08, rimBlur: 1.4, steps: 18 })
  ctx.save(); trace(ctx, sil); ctx.clip()
  // under the skin: the dorsal vessel, dark red, soft
  ctx.lineCap = 'round'
  withBlur(ctx, 0.9, 'rgba(110,14,24,0.6)', () => {
    ctx.beginPath(); for (let t = 0.02; t <= 0.97; t += 0.02) { const [x, y] = spine(t); t === 0.02 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) }
    ctx.lineWidth = 1.1; ctx.stroke()
  })
  // the gut showing through, a darker earthen core toward the tail
  for (let t = 0.4; t < 0.92; t += 0.05) { const [x, y] = spine(t); softDot(ctx, x, y, half(t) * 0.45, half(t) * 0.4, 'rgba(60,24,14,0.28)') }
  // the saddle (clitellum): swollen, smooth, paler, satin
  const sad = spineOutline(spine, (t) => half(t) * 1.02, 16, 0.24, 0.37)
  trace(ctx, sad); ctx.fillStyle = 'rgba(226,140,112,0.8)'; ctx.fill()
  innerShadow(ctx, sad, 1, 'rgba(90,30,20,0.55)')
  // annuli: a fine groove every segment, a lit lip beside it
  for (let t = 0.05; t < 0.97; t += 0.021) {
    if (t > 0.245 && t < 0.37) continue
    const [x, y, nx, ny] = across(spine, t, half(t) * 1.05)
    ctx.beginPath(); ctx.moveTo(x + nx, y + ny); ctx.quadraticCurveTo(x - ny * 0.4 * 0, y, x - nx, y - ny)
    ctx.lineWidth = 0.32; ctx.strokeStyle = 'rgba(70,16,16,0.55)'; ctx.stroke()
    const [x2, y2] = spine(t + 0.006)
    ctx.beginPath(); ctx.moveTo(x2 + nx * 0.8, y2 + ny * 0.8); ctx.lineTo(x2 - nx * 0.8, y2 - ny * 0.8)
    ctx.lineWidth = 0.25; ctx.strokeStyle = 'rgba(255,200,190,0.28)'; ctx.stroke()
  }
  ctx.restore()
  grain(ctx, sil, 0.3)
  // wet: a highlight on every segment's crown
  wetDashes(ctx, spine, half, 0.04, 0.96, 34, 0.7)
  // grit stuck to the slime
  for (let i = 0; i < 9; i++) { const t = 0.1 + rnd() * 0.8, [x, y, nx, ny] = across(spine, t, half(t) * (rnd() * 1.6 - 0.8)); crumb(ctx, x + nx, y + ny, 0.5 + rnd() * 0.7, 0x5a3e26, rnd) }
  const [hx, hy] = spine(0.005)
  softDot(ctx, hx - 0.5, hy, r * 0.06, 0.5, 'rgba(120,40,40,0.8)')
}

function paintMoleCricket(ctx, phase) {
  const r = 15, rnd = rng(23)
  const s4 = Math.sin(phase), c4 = Math.cos(phase)
  const chit = 0x3a2412, velvet = 0x5a3a1e
  for (const s of [-1, 1]) {
    const sw = s * s4 * 0.14
    limb(ctx, [[-r * 0.35, s * r * 0.3], [-r * 0.75, s * r * (0.78 + sw)], [-r * 1.3, s * r * (0.86 + sw)]], r * 0.17, r * 0.06, 0x5a3a1c, { spec: 0.4 })
    limb(ctx, [[r * 0.05, s * r * 0.33], [-r * 0.1, s * r * (0.8 - sw)], [-r * 0.45, s * r * (0.98 - sw)]], r * 0.13, r * 0.05, 0x5a3a1c, { spec: 0.4 })
    // cerci
    ctx.save(); ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-r * 1.25, s * r * 0.12); ctx.quadraticCurveTo(-r * 1.6, s * r * 0.2, -r * 1.9, s * r * 0.42)
    ctx.lineWidth = 0.7; ctx.strokeStyle = css(0x6a4a2a); ctx.stroke(); ctx.restore()
  }
  // abdomen: soft, ringed, furred
  const abd = ovalAt(-r * 0.62, 0, r * 0.74, r * 0.46)
  const asil = volume(ctx, abd, 0x7a5230, { lit: 0.3, ao: 0.6, rimBlur: 1.6 })
  ctx.save(); trace(ctx, asil); ctx.clip()
  for (let i = 0; i < 5; i++) { const x = -r * (0.2 + i * 0.22); ctx.beginPath(); ctx.moveTo(x, -r * 0.5); ctx.quadraticCurveTo(x - r * 0.08, 0, x, r * 0.5); ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(40,20,8,0.55)'; ctx.stroke() }
  ctx.restore()
  fur(ctx, asil, rnd, 260, { dir: (x, y) => Math.atan2(y * 0.8, -r * 0.6), len: 1.4, width: 0.22, jitter: 0.6, color: (k) => k < 0.6 ? 'rgba(214,176,120,0.55)' : 'rgba(80,50,24,0.6)' })
  // folded wings: translucent, veined, lying along the back
  for (const s of [-1, 1]) {
    const wpts = [r * 0.05, s * r * 0.03, -r * 1.05, s * r * 0.02, -r * 0.95, s * r * 0.3, r * 0.05, s * r * 0.3]
    trace(ctx, wpts); ctx.fillStyle = 'rgba(196,160,110,0.45)'; ctx.fill()
    ctx.save(); trace(ctx, wpts); ctx.clip(); ctx.strokeStyle = 'rgba(70,44,20,0.6)'; ctx.lineWidth = 0.25
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(r * 0.05, s * r * (0.05 + k * 0.06)); ctx.lineTo(-r * 1.0, s * r * (0.03 + k * 0.06)); ctx.stroke() }
    ctx.restore()
    specular(ctx, ellipsePts(-r * 0.45, s * r * 0.15, r * 0.35, r * 0.04, 0, 12), 0.45, 0.4)
  }
  // THE SHOVELS
  for (const s of [-1, 1]) {
    const sw = s * c4 * 0.05, px = r * 1.0, py = s * r * (0.66 + sw)
    limb(ctx, [[r * 0.55, s * r * 0.3], [px - r * 0.1, py]], r * 0.26, r * 0.24, chit, { spec: 0.5 })
    const pad = ovalAt(px, py, r * 0.42, r * 0.33, s * 0.55, 24)
    volume(ctx, pad, chit, { lit: 0.35, ao: 0.6, rimBlur: 1 })
    for (let k = 0; k < 4; k++) {
      const a = s * (-0.2 + k * 0.38)
      const bx = px + Math.cos(a) * r * 0.3, by = py + Math.sin(a) * r * 0.27, tx = px + Math.cos(a) * r * 0.68, ty = py + Math.sin(a) * r * 0.6
      limb(ctx, [[bx, by], [tx, ty]], r * 0.16, r * 0.07, 0x24140a, { spec: 0.7 })
    }
    specular(ctx, ellipsePts(px - r * 0.05, py - s * r * 0.05, r * 0.14, r * 0.07, s * 0.55, 10), 0.8, 0.4)
  }
  // pronotum: a glossy velvet shield, the window light caught on its dome
  const pro = ovalAt(r * 0.32, 0, r * 0.64, r * 0.52)
  const psil = volume(ctx, pro, velvet, { lit: 0.4, ao: 0.65, rimBlur: 1.8 })
  fur(ctx, psil, rnd, 220, { dir: (x, y) => Math.atan2(y, x - r * 0.32), len: 0.9, width: 0.2, jitter: 0.4, color: (k) => k < 0.5 ? 'rgba(230,190,130,0.4)' : 'rgba(40,24,10,0.5)' })
  innerShadow(ctx, psil, 1.4, 'rgba(240,210,160,0.35)')   // the velvet's bright rim
  specular(ctx, ellipsePts(r * 0.22, -r * 0.08, r * 0.26, r * 0.12, -0.2, 16), 0.85, 0.6)
  // head
  const hd = ovalAt(r * 1.02, 0, r * 0.26, r * 0.28)
  volume(ctx, hd, 0x3a2410, { lit: 0.35, rimBlur: 0.8 })
  for (const s of [-1, 1]) {
    eye(ctx, r * 1.1, s * r * 0.18, r * 0.09)
    ctx.save(); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(r * 1.2, s * r * 0.08); ctx.quadraticCurveTo(r * 1.55, s * r * 0.1, r * 1.7, s * r * 0.34)
    ctx.lineWidth = 0.55; ctx.strokeStyle = css(0x4a3018); ctx.stroke(); ctx.restore()
  }
}

function paintMoleBody(ctx) {
  const r = 26, rnd = rng(37)
  const pink = 0xe2a196
  for (const s of [-1, 1]) volume(ctx, ovalAt(-r * 0.72, s * r * 0.55, r * 0.2, r * 0.13, s * 0.5, 18), pink, { lit: 0.25, rimBlur: 0.7 })
  limb(ctx, [[-r * 0.92, 0], [-r * 1.3, 0]], r * 0.12, r * 0.06, pink, { spec: 0.3 })
  // the velvet body
  const body = ovalAt(-r * 0.05, 0, r * 0.98, r * 0.66, 0, 48)
  const sil = volume(ctx, body, 0x2a2624, { lit: 0.35, ao: 0.55, rimBlur: 3 })
  fur(ctx, sil, rnd, 1400, {
    dir: (x, y) => Math.atan2(y * 0.5, -(r * 1.1 - x) * 0.4 - r * 0.3), len: 2.4, width: 0.32, jitter: 0.45,
    color: (k) => (k < 0.55 ? 'rgba(20,18,18,0.75)' : k < 0.9 ? 'rgba(78,72,68,0.6)' : 'rgba(150,140,130,0.5)'),
  })
  // velvet catches the light at the rim, not the crown
  innerShadow(ctx, sil, 3.5, 'rgba(190,180,170,0.32)')
  softFill(ctx, ellipsePts(-r * 0.15, 0, r * 0.55, r * 0.28, 0, 24), 5, 'rgba(160,150,140,0.16)')
  // the hands: broad pink spades turned out sideways, palms out, a row of five long pale claws
  // along the leading edge — the one shape on the floor that says "mole"
  for (const s of [-1, 1]) {
    const hx = r * 0.5, hy = s * r * 0.74, rot = s * 0.5
    const c = Math.cos(rot), sn = Math.sin(rot)
    const P = (u, v) => [hx + u * c - v * sn, hy + u * sn + v * c]
    limb(ctx, [[r * 0.25, s * r * 0.45], P(-r * 0.1, 0)], r * 0.2, r * 0.18, 0x2a2624, { spec: 0.2 })
    for (let k = 0; k < 5; k++) {
      const v = (k - 2) * r * 0.12
      limb(ctx, [P(r * 0.2, v), P(r * 0.5, v * 1.25 + s * r * 0.02)], r * 0.085, r * 0.03, 0xeee2c8, { spec: 0.85 })
    }
    const hand = ovalAt(hx, hy, r * 0.25, r * 0.36, rot, 30)
    const hs = volume(ctx, hand, pink, { lit: 0.25, ao: 0.5, rimBlur: 1.6 })
    grain(ctx, hs, 0.35)
    ctx.save(); trace(ctx, hs); ctx.clip(); ctx.lineCap = 'round'
    for (let k = 0; k < 4; k++) {
      const v = (k - 1.5) * r * 0.12
      ctx.beginPath(); ctx.moveTo(...P(-r * 0.18, v)); ctx.quadraticCurveTo(...P(0, v * 1.1), ...P(r * 0.2, v * 1.2))
      ctx.lineWidth = 0.4; ctx.strokeStyle = 'rgba(140,60,60,0.45)'; ctx.stroke()
    }
    ctx.restore()
    specular(ctx, ellipsePts(...P(-r * 0.04, -s * r * 0.1), r * 0.08, r * 0.14, rot, 10), 0.5, 0.6)
  }
  // the snout: bare pink, wet at the tip, whiskered
  const sn = spineAt((t) => [r * 0.78 + t * r * 0.52, 0], (t) => r * 0.17 * (1 - t * 0.45), 16)
  volume(ctx, sn, pink, { lit: 0.3, rimBlur: 0.9 })
  softDot(ctx, r * 1.28, 0, r * 0.1, r * 0.04, css(0xc4706a))
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(r * 1.3, s * r * 0.045, r * 0.03, 0, TAU); ctx.fillStyle = '#4a1a18'; ctx.fill() }
  specular(ctx, ellipsePts(r * 1.18, 0, r * 0.1, r * 0.035, 0, 10), 0.85, 0.3)
  ctx.save(); ctx.lineCap = 'round'
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(r * 1.12, s * r * 0.1); ctx.quadraticCurveTo(r * 1.35, s * r * (0.16 + k * 0.05), r * 1.55, s * r * (0.12 + k * 0.12)); ctx.lineWidth = 0.22; ctx.strokeStyle = 'rgba(240,232,220,0.75)'; ctx.stroke() }
  ctx.restore()
  for (const s of [-1, 1]) eye(ctx, r * 0.7, s * r * 0.2, r * 0.035)
}
// The mole underground: a heap of turned earth along its heading; cracking, the crust splits and
// the pink hands come through.
function paintMoleMound(ctx, cracking) {
  const r = 26, rnd = rng(cracking ? 61 : 53)
  softFill(ctx, ellipsePts(0, 0, r * 1.05, r * 0.68, 0, 30), r * 0.25, 'rgba(10,6,3,0.7)')
  const base = ellipsePts(0, 0, r * 0.95, r * 0.6, 0, 30)
  const g = ctx.createRadialGradient(r * 0.05, 0, 0, 0, 0, r)
  g.addColorStop(0, css(0x7a5636)); g.addColorStop(0.7, css(0x4a301a)); g.addColorStop(1, css(0x22140a))
  trace(ctx, base); ctx.fillStyle = g; ctx.fill()
  // clods heaped up, bigger toward the crest
  const soils = [0x5a3e26, 0x6e4c2e, 0x7a5a3a, 0x8a6a48, 0x4a321e]
  for (let i = 0; i < 70; i++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd())
    const x = Math.cos(a) * r * 0.88 * d, y = Math.sin(a) * r * 0.55 * d
    crumb(ctx, x, y, r * (0.05 + (1 - d) * 0.08 + rnd() * 0.05), soils[Math.floor(rnd() * soils.length)], rnd)
  }
  // crumbs spilling off the front, where it pushes through
  for (let i = 0; i < 16; i++) crumb(ctx, r * (0.8 + rnd() * 0.5), (rnd() - 0.5) * r * 0.9, r * (0.03 + rnd() * 0.04), soils[i % 5], rnd)
  if (cracking) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (let k = 0; k < 8; k++) {
      const a = k * 0.8 + 0.3
      withBlur(ctx, 0.8, 'rgba(0,0,0,0.9)', () => {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.3); ctx.lineTo(Math.cos(a + 0.2) * r * 0.85, Math.sin(a + 0.2) * r * 0.55)
        ctx.lineWidth = 1.6; ctx.stroke()
      })
    }
    ctx.restore()
    softFill(ctx, ellipsePts(0, 0, r * 0.34, r * 0.22, 0, 20), 2, 'rgba(8,4,2,0.95)')
    for (const s of [-1, 1]) {
      const hx = r * 0.12, hy = s * r * 0.14
      for (let k = 0; k < 3; k++) limb(ctx, [[hx + r * 0.1, hy + s * r * (k - 1) * 0.05], [hx + r * 0.3, hy + s * r * ((k - 1) * 0.07)]], r * 0.07, r * 0.025, 0xe8dcc4, { spec: 0.8 })
      volume(ctx, ovalAt(hx, hy, r * 0.16, r * 0.12, s * -0.4, 18), 0xe2a196, { lit: 0.25, rimBlur: 0.8 })
    }
  }
}

function paintBadger(ctx, phase) {
  const r = 20, rnd = rng(71)
  const w = Math.sin(phase)
  for (const [lx, ly, ph] of [[0.55, 0.62, 0], [-0.55, 0.66, Math.PI]]) {
    for (const s of [-1, 1]) {
      const sw = Math.sin(phase + ph + (s > 0 ? 0 : Math.PI)) * 0.12
      const fx = r * (lx + sw), fy = s * r * ly
      limb(ctx, [[r * lx * 0.8, s * r * 0.4], [fx, fy]], r * 0.24, r * 0.2, 0x1a1817, { spec: 0.25 })
      for (let k = -1; k <= 1; k++) limb(ctx, [[fx + r * 0.06, fy + k * r * 0.05], [fx + r * 0.24, fy + k * r * 0.07 + s * r * 0.02]], r * 0.05, r * 0.025, 0xe8dcc0, { spec: 0.8 })
    }
  }
  limb(ctx, [[-r * 0.95, 0], [-r * 1.28, w * r * 0.05]], r * 0.18, r * 0.08, 0x8a8480, { spec: 0.2 })
  const body = ovalAt(-r * 0.12, 0, r * 0.97 * (1 + w * 0.03), r * 0.63 * (1 - w * 0.03), 0, 44)
  const sil = volume(ctx, body, 0x6e6a66, { lit: 0.3, ao: 0.6, rimBlur: 2.6 })
  // darker flanks, then the grizzle: long guard hairs, black-banded and silver-tipped
  for (const s of [-1, 1]) softFill(ctx, ellipsePts(-r * 0.15, s * r * 0.42, r * 0.75, r * 0.14, 0, 20), 2, 'rgba(14,12,12,0.55)')
  fur(ctx, sil, rnd, 1100, {
    dir: (x, y) => Math.atan2(y * 0.45, -r), len: 3.4, width: 0.3, jitter: 0.35,
    color: (k) => (k < 0.35 ? 'rgba(18,16,16,0.7)' : k < 0.8 ? 'rgba(200,196,188,0.65)' : 'rgba(250,248,244,0.75)'),
  })
  softFill(ctx, ellipsePts(-r * 0.05, 0, r * 0.5, r * 0.22, 0, 20), 4, 'rgba(255,255,255,0.12)')
  // the head: a white wedge with two black stripes, nose to ears
  const head = spineAt((t) => [r * 0.6 + t * r * 0.66, 0], (t) => r * 0.4 * (1 - t * 0.62), 20)
  const hs = volume(ctx, head, 0xe8e4dc, { lit: 0.1, ao: 0.4, rimBlur: 1.4 })
  fur(ctx, hs, rnd, 300, { dir: () => Math.PI, len: 1.4, width: 0.22, jitter: 0.3, color: (k) => (k < 0.7 ? 'rgba(255,255,252,0.7)' : 'rgba(170,166,160,0.55)') })
  for (const s of [-1, 1]) {
    const stripe = spineOutline((t) => [r * 0.58 + t * r * 0.64, s * r * (0.17 - t * 0.11)], (t) => r * 0.09 * (1 - t * 0.4), 14)
    trace(ctx, stripe); ctx.fillStyle = 'rgba(12,10,10,0.95)'; ctx.fill()
    fur(ctx, stripe, rnd, 60, { dir: () => Math.PI, len: 1.2, width: 0.2, jitter: 0.2, color: () => 'rgba(40,38,36,0.6)' })
    volume(ctx, ovalAt(r * 0.58, s * r * 0.35, r * 0.11, r * 0.08, 0, 14), 0x161414, { lit: 0.2, rimBlur: 0.5 })
    softDot(ctx, r * 0.58, s * r * 0.38, r * 0.05, 0.4, 'rgba(240,236,228,0.8)')
    eye(ctx, r * 0.9, s * r * 0.135, r * 0.05)
  }
  volume(ctx, ovalAt(r * 1.24, 0, r * 0.085, r * 0.08, 0, 14), 0x121010, { lit: 0.3, rimBlur: 0.4 })
  specular(ctx, ellipsePts(r * 1.22, -r * 0.02, r * 0.035, r * 0.02, 0, 8), 0.9, 0.2)
}

function paintOlm(ctx, phase) {
  const r = 18, rnd = rng(83)
  const L = r * 3.0
  const spine = (t) => [r * 1.05 - t * L, Math.sin(t * Math.PI * 1.6 - phase) * r * 0.26 * Math.min(1, t * 2.2)]
  const half = (t) => r * (t < 0.12 ? 0.2 + 0.1 * Math.sin((t / 0.12) * Math.PI / 2) : 0.3 * Math.max(0.12, 1 - Math.pow((t - 0.12) / 0.88, 1.5)))
  // limbs: thin, pale, three and two toes
  for (const [tt, s0] of [[0.22, 1], [0.55, -1]]) {
    const [lx, ly] = spine(tt)
    for (const s of [-1, 1]) {
      const sw = Math.sin(phase + s * s0) * 0.15
      const foot = [lx + r * (0.22 + sw), ly + s * r * 0.55]
      limb(ctx, [[lx, ly + s * r * 0.15], [lx + r * (0.12 + sw), ly + s * r * 0.5], foot], r * 0.08, r * 0.045, 0xf2d4c8, { spec: 0.5 })
      for (let k = -1; k <= 1; k++) limb(ctx, [foot, [foot[0] + r * 0.1 + k * r * 0.04, foot[1] + s * r * 0.06 + k * r * 0.03]], r * 0.03, r * 0.015, 0xf2d4c8, { spec: false })
    }
  }
  // gills: three plumes a side, blood showing through, feathered
  const [gx, gy] = spine(0.11)
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const a = s * (1.2 + k * 0.42) + Math.sin(phase + k) * 0.05
      const tx = gx + Math.cos(a) * r * 0.66, ty = gy + Math.sin(a) * r * 0.66
      const bx = gx + Math.cos(a) * r * 0.12, by = gy + s * r * 0.14 + Math.sin(a) * r * 0.1
      ctx.save(); ctx.globalCompositeOperation = 'source-over'
      softDot(ctx, (bx + tx) / 2, (by + ty) / 2, r * 0.16, r * 0.12, 'rgba(255,60,70,0.35)')
      ctx.restore()
      limb(ctx, [[bx, by], [tx, ty]], r * 0.11, r * 0.05, 0xc8202c, { spec: 0.5 })
      ctx.save(); ctx.lineCap = 'round'
      for (let q = 1; q <= 7; q++) {
        const u = q / 8, px = lerp(bx, tx, u), py = lerp(by, ty, u)
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a + side * 1.1) * r * 0.14 * (1 - u * 0.4), py + Math.sin(a + side * 1.1) * r * 0.14 * (1 - u * 0.4))
          ctx.lineWidth = 0.35; ctx.strokeStyle = 'rgba(255,90,96,0.85)'; ctx.stroke()
        }
      }
      ctx.restore()
    }
  }
  // the body: translucent, lit from within — a pale skin over a pinker inside
  const at = spineAt(spine, half, 56)
  const sil = at(1)
  trace(ctx, sil); ctx.fillStyle = 'rgba(236,196,186,0.9)'; ctx.fill()
  ctx.save(); trace(ctx, sil); ctx.clip()
  // subsurface: a warm glow along the core, the organs as soft shadows inside it
  softFill(ctx, at(0.55), 1.8, 'rgba(255,190,176,0.75)')
  for (let t = 0.22; t < 0.62; t += 0.06) { const [x, y] = spine(t); softDot(ctx, x, y, half(t) * 0.42, half(t) * 0.5, 'rgba(150,70,70,0.22)') }
  { const [x, y] = spine(0.3); softDot(ctx, x, y, half(0.3) * 0.5, half(0.3) * 0.4, 'rgba(120,50,60,0.25)') }
  // capillaries under the skin
  ctx.lineCap = 'round'
  for (let i = 0; i < 26; i++) {
    const t = 0.08 + rnd() * 0.75, [x, y, nx, ny] = across(spine, t, half(t) * (rnd() - 0.5) * 1.6)
    ctx.beginPath(); ctx.moveTo(x + nx, y + ny); ctx.quadraticCurveTo(x + nx + (rnd() - 0.5) * 3, y + ny + (rnd() - 0.5) * 3, x + nx + (rnd() - 0.5) * 5, y + ny + (rnd() - 0.5) * 5)
    ctx.lineWidth = 0.2; ctx.strokeStyle = 'rgba(200,60,70,0.4)'; ctx.stroke()
  }
  ctx.restore()
  innerShadow(ctx, sil, 1.6, 'rgba(150,90,90,0.5)')
  // the translucent fin along the tail
  trace(ctx, spineOutline(spine, (t) => half(t) * 1.5, 24, 0.6, 1)); ctx.fillStyle = 'rgba(250,224,214,0.3)'; ctx.fill()
  grain(ctx, sil, 0.18)
  // costal grooves
  ctx.save(); trace(ctx, sil); ctx.clip()
  for (let t = 0.2; t < 0.62; t += 0.035) { const [x, y, nx, ny] = across(spine, t, half(t)); ctx.beginPath(); ctx.moveTo(x + nx * 0.4, y + ny * 0.4); ctx.lineTo(x + nx, y + ny); ctx.moveTo(x - nx * 0.4, y - ny * 0.4); ctx.lineTo(x - nx, y - ny); ctx.lineWidth = 0.3; ctx.strokeStyle = 'rgba(160,100,96,0.45)'; ctx.stroke() }
  ctx.restore()
  // wet skin: beads of light along the back
  wetDashes(ctx, spine, half, 0.03, 0.8, 16, 0.8)
  for (let i = 0; i < 14; i++) { const t = 0.05 + rnd() * 0.7, [x, y, nx, ny] = across(spine, t, half(t) * (rnd() - 0.5) * 1.3); ctx.beginPath(); ctx.arc(x + nx, y + ny, 0.3 + rnd() * 0.3, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill() }
  // the blind head: eyes sunk under the skin, nostrils
  const [hx, hy] = spine(0.02)
  for (const s of [-1, 1]) {
    softDot(ctx, hx - r * 0.25, hy + s * r * 0.12, r * 0.04, r * 0.04, 'rgba(110,60,60,0.55)')
    softDot(ctx, hx + r * 0.02, hy + s * r * 0.06, r * 0.025, 0.2, 'rgba(110,50,50,0.8)')
  }
}

function paintCaveCricket(ctx, pose) {
  const r = 13, rnd = rng(97)
  const crouch = pose === 1, leap = pose === 2
  ctx.save(); ctx.lineCap = 'round'
  for (const s of [-1, 1]) {
    const sp = leap ? 0.35 : 0.8
    ctx.beginPath(); ctx.moveTo(r * 0.95, s * r * 0.12); ctx.bezierCurveTo(r * 2.0, s * r * 0.3, r * 2.6, s * r * (0.6 + sp), r * 2.0, s * r * (1.7 + sp))
    ctx.lineWidth = 0.45; ctx.strokeStyle = css(0x3a2814, 0.95); ctx.stroke()
    ctx.lineWidth = 0.15; ctx.strokeStyle = 'rgba(255,230,200,0.6)'; ctx.stroke()
  }
  ctx.restore()
  for (const s of [-1, 1]) {
    limb(ctx, [[r * 0.5, s * r * 0.25], [r * 0.8, s * r * 0.65], [r * 1.08, s * r * 0.82]], r * 0.1, r * 0.04, 0x8a6438, { spec: 0.5 })
    limb(ctx, [[r * 0.15, s * r * 0.3], [r * 0.15, s * r * 0.76], [-r * 0.1, s * r * 0.98]], r * 0.1, r * 0.04, 0x8a6438, { spec: 0.5 })
  }
  for (const s of [-1, 1]) {
    const knee = leap ? [-r * 1.2, s * r * 0.8] : crouch ? [r * 0.25, s * r * 0.95] : [r * 0.1, s * r * 0.82]
    const foot = leap ? [-r * 2.2, s * r * 1.0] : crouch ? [-r * 1.1, s * r * 1.06] : [-r * 1.25, s * r * 0.96]
    limb(ctx, [[-r * 0.3, s * r * 0.3], knee], r * 0.36, r * 0.16, 0xb08050, { spec: 0.6 })
    // the femur's chevron stripes
    for (let k = 1; k < 5; k++) {
      const u = k / 5, px = lerp(-r * 0.3, knee[0], u), py = lerp(s * r * 0.3, knee[1], u)
      softDot(ctx, px, py, r * 0.07 * (1 - u * 0.5), 0.3, 'rgba(70,40,16,0.65)')
    }
    limb(ctx, [knee, foot], r * 0.11, r * 0.06, 0x7a5228, { spec: 0.5 })
    ctx.save(); ctx.lineCap = 'round'
    for (let k = 1; k <= 6; k++) {
      const u = k / 7, px = lerp(knee[0], foot[0], u), py = lerp(knee[1], foot[1], u)
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + r * 0.06, py + s * r * 0.14); ctx.lineWidth = 0.3; ctx.strokeStyle = 'rgba(40,24,10,0.9)'; ctx.stroke()
    }
    ctx.restore()
  }
  const body = ovalAt(-r * 0.15, 0, r * (crouch ? 0.95 : 1.05), r * (crouch ? 0.52 : 0.46), 0, 36)
  const sil = volume(ctx, body, 0xa47a4a, { lit: 0.4, ao: 0.65, rimBlur: 1.2 })
  ctx.save(); trace(ctx, sil); ctx.clip()
  for (let i = 0; i < 7; i++) {
    const x = r * (0.5 - i * 0.24)
    softFill(ctx, [x, -r * 0.6, x + r * 0.08, -r * 0.6, x - r * 0.04, 0, x + r * 0.08, r * 0.6, x, r * 0.6, x - r * 0.12, 0], 0.5, 'rgba(70,40,16,0.6)')
  }
  // the mottle of a cave cricket's back
  for (let i = 0; i < 40; i++) softDot(ctx, -r * 1.1 + rnd() * r * 1.8, (rnd() - 0.5) * r, 0.3 + rnd() * 0.8, 0.4, rnd() < 0.5 ? 'rgba(60,34,12,0.4)' : 'rgba(230,200,150,0.35)')
  ctx.restore()
  grain(ctx, sil, 0.3)
  specular(ctx, ellipsePts(-r * 0.1, 0, r * 0.65, r * 0.1, 0, 16), 0.8, 0.5)
  ctx.save(); ctx.lineCap = 'round'
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-r * 1.15, s * r * 0.08); ctx.lineTo(-r * 1.6, s * r * 0.22); ctx.lineWidth = 0.6; ctx.strokeStyle = css(0x5a3a18); ctx.stroke() }
  ctx.restore()
  const head = ovalAt(r * 0.9, 0, r * 0.3, r * 0.32)
  volume(ctx, head, 0x8a6036, { lit: 0.4, rimBlur: 0.6 })
  for (const s of [-1, 1]) eye(ctx, r * 1.0, s * r * 0.21, r * 0.09)
}

// A crystal point lying out from the shell: refraction (a dark core and bright internal edges),
// a glow it throws round itself, and a hard window glint.
function crystalSpike(ctx, x, y, len, wid, ang, hue) {
  const c = Math.cos(ang), s = Math.sin(ang)
  const P = (u, v) => [x + c * u - s * v, y + s * u + c * v]
  const tip = P(len, 0), l = P(len * 0.7, -wid), rr = P(len * 0.7, wid), bl = P(0, -wid * 0.9), br = P(0, wid * 0.9)
  const out = [...bl, ...l, ...tip, ...rr, ...br]
  ctx.save(); ctx.globalCompositeOperation = 'lighter'
  softFill(ctx, out, wid * 1.6, css(hue, 0.35))
  ctx.restore()
  const g = ctx.createLinearGradient(...P(0, -wid), ...P(0, wid))
  g.addColorStop(0, css(shadeC(hue, 0.55), 0.95)); g.addColorStop(0.45, css(shadeC(hue, -0.1), 0.85)); g.addColorStop(0.55, css(shadeC(hue, -0.55), 0.9)); g.addColorStop(1, css(shadeC(hue, 0.15), 0.9))
  trace(ctx, out); ctx.fillStyle = g; ctx.fill()
  ctx.save(); trace(ctx, out); ctx.clip()
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.3
  ctx.beginPath(); ctx.moveTo(...P(len * 0.1, -wid * 0.5)); ctx.lineTo(...P(len * 0.95, -wid * 0.02)); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(...P(len * 0.3, wid * 0.6)); ctx.lineTo(...P(len * 0.7, 0)); ctx.lineTo(...P(len * 0.2, -wid * 0.2)); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke()
  ctx.restore()
  trace(ctx, out); ctx.lineWidth = 0.35; ctx.strokeStyle = css(shadeC(hue, 0.6), 0.8); ctx.stroke()
  ctx.save(); ctx.globalCompositeOperation = 'lighter'
  softDot(ctx, ...P(len * 0.62, -wid * 0.35), wid * 0.18, wid * 0.25, 'rgba(255,255,255,0.9)')
  ctx.restore()
}
function paintCrystalCrab(ctx, phase) {
  const r = 26, rnd = rng(113)
  const sw = Math.sin(phase), shell = 0x3e3c4c
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const k = (i % 2 ? 1 : -1) * sw * 0.08
      const bx = r * (0.28 - i * 0.26), by = s * r * 0.5
      const kx = bx + r * (0.05 - i * 0.12 + k), ky = s * r * (0.98 + Math.abs(k))
      const tx = kx - r * (0.15 + i * 0.08), ty = s * r * (1.32 - i * 0.04)
      limb(ctx, [[bx, by], [kx, ky], [tx, ty]], r * 0.17, r * 0.06, 0x2e2a3a, { spec: 0.35 })
      softDot(ctx, kx, ky, r * 0.05, 0.4, 'rgba(255,255,255,0.35)')
    }
  }
  for (const s of [-1, 1]) {
    const cx = r * 0.98, cy = s * r * (0.62 + sw * 0.03)
    limb(ctx, [[r * 0.45, s * r * 0.42], [r * 0.7, s * r * 0.72], [cx - r * 0.1, cy]], r * 0.22, r * 0.18, 0x4a4658, { spec: 0.5 })
    const palm = ovalAt(cx, cy, r * 0.38, r * 0.25, s * 0.25, 28)
    const ps = volume(ctx, palm, 0x585468, { lit: 0.4, ao: 0.6, rimBlur: 1.2 })
    grain(ctx, ps, 0.35)
    specular(ctx, ellipsePts(cx - r * 0.05, cy - s * r * 0.06, r * 0.16, r * 0.05, s * 0.25, 10), 0.75, 0.5)
    limb(ctx, [[cx + r * 0.2, cy - s * r * 0.08], [cx + r * 0.6, cy - s * r * 0.02]], r * 0.15, r * 0.05, 0x585468, { spec: 0.7 })
    limb(ctx, [[cx + r * 0.18, cy + s * r * 0.1], [cx + r * 0.52, cy + s * r * 0.17]], r * 0.12, r * 0.04, 0x4a4658, { spec: 0.6 })
    for (const q of [[cx + r * 0.6, cy - s * r * 0.02], [cx + r * 0.52, cy + s * r * 0.17]]) softDot(ctx, q[0], q[1], r * 0.035, 0.3, 'rgba(20,16,30,0.9)')
  }
  const cara = ovalAt(0, 0, r * 0.68, r * 0.84, 0, 48)
  const sil = volume(ctx, cara, shell, { lit: 0.38, ao: 0.6, rimBlur: 2.4 })
  // granules all over the carapace, each catching a point of light
  ctx.save(); trace(ctx, sil); ctx.clip()
  for (let i = 0; i < 120; i++) {
    const x = (rnd() - 0.5) * r * 1.4, y = (rnd() - 0.5) * r * 1.7, rr = 0.4 + rnd() * 0.9
    softDot(ctx, x + 0.3, y + 0.3, rr, 0.3, 'rgba(10,8,16,0.5)')
    ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fillStyle = css(mixc(0x5a5670, 0x7a7690, rnd()), 0.9); ctx.fill()
    ctx.beginPath(); ctx.arc(x - rr * 0.3, y - rr * 0.3, rr * 0.3, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill()
  }
  ctx.restore()
  grain(ctx, sil, 0.3)
  specular(ctx, ellipsePts(r * 0.1, 0, r * 0.35, r * 0.55, 0, 20), 0.18, 3)
  for (const s of [-1, 1]) {
    limb(ctx, [[r * 0.55, s * r * 0.2], [r * 0.8, s * r * 0.27]], r * 0.08, r * 0.06, 0x2a2634, { spec: 0.4 })
    eye(ctx, r * 0.82, s * r * 0.28, r * 0.075)
  }
  const pts = [[-r * 0.12, 0, r * 0.78, r * 0.17, -2.9, 0xa070f0], [r * 0.02, -r * 0.22, r * 0.6, r * 0.15, -1.9, 0xc49af8],
    [r * 0.0, r * 0.24, r * 0.58, r * 0.14, 1.95, 0x8a60e8], [-r * 0.32, -r * 0.32, r * 0.46, r * 0.12, -2.4, 0x60d0f0], [-r * 0.32, r * 0.34, r * 0.44, r * 0.12, 2.45, 0xb888f0]]
  for (const [x, y, l, w, a, h] of pts) crystalSpike(ctx, x, y, l, w, a, h)
}

function paintBat(ctx, phase) {
  const r = 14, rnd = rng(131)
  const flap = 0.72 + 0.28 * Math.cos(phase)
  for (const s of [-1, 1]) {
    const span = r * 2.7 * flap
    const wrist = [r * 0.35, s * span * 0.45]
    const tips = [[r * 0.15, s * span], [-r * 0.45, s * span * 0.92], [-r * 0.95, s * span * 0.68], [-r * 1.0, s * span * 0.32]]
    const outline = [r * 0.2, s * r * 0.25, ...wrist, ...tips[0], -r * 0.05, s * span * 0.72, ...tips[1], -r * 0.62, s * span * 0.6, ...tips[2], -r * 0.86, s * span * 0.44, ...tips[3], -r * 0.7, s * r * 0.2]
    // the membrane: thin skin with light coming through it, darker at the trailing scallops
    const g = ctx.createLinearGradient(0, 0, 0, s * span)
    g.addColorStop(0, css(0x5a3428, 0.96)); g.addColorStop(0.6, css(0x6e3e2e, 0.9)); g.addColorStop(1, css(0x3a2018, 0.92))
    trace(ctx, outline); ctx.fillStyle = g; ctx.fill()
    ctx.save(); trace(ctx, outline); ctx.clip()
    // veins branching through the membrane
    ctx.lineCap = 'round'
    for (let i = 0; i < 30; i++) {
      const t = tips[Math.floor(rnd() * 4)], u = 0.2 + rnd() * 0.6
      const x0 = lerp(wrist[0], t[0], u), y0 = lerp(wrist[1], t[1], u), a = rnd() * TAU, L = r * (0.1 + rnd() * 0.25)
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + Math.cos(a) * L * 0.5 + 1, y0 + Math.sin(a) * L * 0.5, x0 + Math.cos(a) * L, y0 + Math.sin(a) * L)
      ctx.lineWidth = 0.2; ctx.strokeStyle = 'rgba(150,50,40,0.6)'; ctx.stroke()
    }
    // a sheen across the leather
    softFill(ctx, [r * 0.1, s * r * 0.4, ...wrist, -r * 0.4, s * span * 0.6, -r * 0.6, s * r * 0.3], 2, 'rgba(255,200,180,0.12)')
    ctx.restore()
    innerShadow(ctx, outline, 1, 'rgba(20,8,6,0.7)')
    // the arm and the long finger bones
    limb(ctx, [[r * 0.2, s * r * 0.25], wrist], r * 0.13, r * 0.09, 0x4a3024, { spec: 0.45 })
    for (const t of tips) limb(ctx, [wrist, t], r * 0.06, r * 0.025, 0x3a2418, { spec: 0.35 })
    limb(ctx, [wrist, [wrist[0] + r * 0.22, wrist[1] + s * r * 0.05]], r * 0.07, r * 0.03, 0xd8c8b0, { spec: 0.8 })
  }
  const body = ovalAt(-r * 0.15, 0, r * 0.78, r * 0.4, 0, 32)
  const bs = volume(ctx, body, 0x5a4030, { lit: 0.35, ao: 0.6, rimBlur: 1.4 })
  fur(ctx, bs, rnd, 360, { dir: (x, y) => Math.atan2(y * 0.6, -r), len: 1.6, width: 0.24, jitter: 0.5, color: (k) => (k < 0.5 ? 'rgba(130,96,70,0.7)' : 'rgba(40,26,18,0.7)') })
  const head = ovalAt(r * 0.62, 0, r * 0.32, r * 0.32)
  const hs = volume(ctx, head, 0x5e4434, { lit: 0.35, rimBlur: 0.8 })
  fur(ctx, hs, rnd, 90, { dir: (x, y) => Math.atan2(y, x - r * 0.62), len: 0.9, width: 0.2, jitter: 0.6, color: (k) => (k < 0.5 ? 'rgba(140,104,78,0.7)' : 'rgba(40,26,18,0.7)') })
  for (const s of [-1, 1]) {
    const ear = [r * 0.6, s * r * 0.08, r * 1.12, s * r * 0.34, r * 0.66, s * r * 0.36]
    trace(ctx, ear); ctx.fillStyle = css(0x5a3a2e, 0.95); ctx.fill()
    trace(ctx, [r * 0.66, s * r * 0.14, r * 1.0, s * r * 0.31, r * 0.7, s * r * 0.3]); ctx.fillStyle = 'rgba(214,150,130,0.75)'; ctx.fill()
    ctx.save(); ctx.lineCap = 'round'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(r * (0.7 + k * 0.08), s * r * 0.18); ctx.lineTo(r * (0.76 + k * 0.08), s * r * 0.3); ctx.lineWidth = 0.2; ctx.strokeStyle = 'rgba(120,60,50,0.7)'; ctx.stroke() } ctx.restore()
    eye(ctx, r * 0.8, s * r * 0.13, r * 0.065)
  }
  trace(ctx, [r * 0.88, -r * 0.06, r * 1.0, 0, r * 0.88, r * 0.06]); ctx.fillStyle = '#2a1610'; ctx.fill()
}

// THE PLAYER, photographed (owner pick 2026-10-10, look A): Book 1's mint blob and its face, shaded
// round under the same raking key as the cast — lit top-left, no ink outline, skin grain, a wet
// specular, glass-bead eyes in soft sclera. render.js wears it in place of the vector blob (and of
// any skin) whenever the macro lens is on. Plan view, radius PLAYER.radius (22).
export const MACRO_PLAYER_E = 34
export function paintPlayerBlob(ctx) {
  const R = 22
  const at = ovalAt(0, 0, R, R * 0.91)
  const sil = volume(ctx, at, 0x5fc9a8, { lit: 0.32, ao: 0.62, rimBlur: 2.4, steps: 18 })
  ctx.save(); trace(ctx, sil); ctx.clip()
  softDot(ctx, R * 0.35, R * 0.45, R * 0.75, R * 0.5, 'rgba(10,50,40,0.35)')   // the side away from the key
  ctx.restore()
  grain(ctx, sil, 0.28)
  for (const s of [-1, 1]) {
    const ex = s * R * 0.36, ey = -R * 0.18
    softDot(ctx, ex, ey, R * 0.25, R * 0.06, 'rgba(244,248,240,0.95)')
    innerShadow(ctx, ellipsePts(ex, ey, R * 0.25, R * 0.25, 0, 24), 1.2, 'rgba(40,70,60,0.5)')
    eye(ctx, ex + R * 0.03, ey + R * 0.03, R * 0.12)
    softDot(ctx, s * R * 0.55, R * 0.16, R * 0.15, R * 0.12, 'rgba(255,150,160,0.32)')
  }
  withBlur(ctx, 0.5, 'rgba(25,80,64,0.85)', () => { ctx.beginPath(); ctx.arc(0, R * 0.2, R * 0.2, Math.PI * 0.15, Math.PI * 0.85); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke() })
  specular(ctx, ellipsePts(-R * 0.38, -R * 0.55, R * 0.26, R * 0.12, -0.5, 20), 0.75, 1.4)
}

export const MACRO_CAST = {
  earthworm: { r: 20, E: 66, frames: 6, shadow: [20 * 1.35, 20 * 0.32], crown: [-20 * 0.55, 20], paint: (ctx, f) => paintEarthworm(ctx, f) },
  moleCricket: { r: 15, E: 46, frames: 4, shadow: [15 * 1.2, 15 * 0.45], crown: [-15 * 0.9, 15], paint: (ctx, f) => paintMoleCricket(ctx, f) },
  mole: { r: 26, E: 52, poses: 3, shadow: [26 * 1.1, 26 * 0.55], crown: [-26 * 0.7, 26], paint: (ctx, p) => (p === 0 ? paintMoleBody(ctx) : paintMoleMound(ctx, p === 2)) },
  badger: { r: 20, E: 40, frames: 4, shadow: [20 * 1.15, 20 * 0.6], crown: [-20 * 0.75, 20], paint: (ctx, f) => paintBadger(ctx, f) },
  olm: { r: 18, E: 60, frames: 6, shadow: [18 * 1.5, 18 * 0.35], crown: [-18 * 0.4, 18], paint: (ctx, f) => paintOlm(ctx, f) },
  caveCricket: { r: 13, E: 40, poses: 4, shadow: [13 * 1.2, 13 * 0.5], crown: [-13 * 0.6, 13], paint: (ctx, p) => paintCaveCricket(ctx, p) },
  crystalCrab: { r: 26, E: 52, frames: 4, shadow: [26 * 1.25, 26 * 0.6], crown: [-26 * 0.95, 26], paint: (ctx, f) => paintCrystalCrab(ctx, f) },
  bat: { r: 14, E: 44, frames: 4, shadow: [14 * 1.8, 14 * 0.3], crown: [-14 * 0.5, 14], paint: (ctx, f) => paintBat(ctx, f) },
}

// ==== FLOOR PROPS ================================================================================
// The few larger things lying on each floor (render.js's BIOME_TOPSOIL / BIOME_GEODE, scattered and
// spun by the prop layers). They are spun, so their light is overhead and their shadow centred.
const centredShadow = (ctx, pts, blur, a) => withBlur(ctx, blur, `rgba(0,0,0,${a})`, () => { smoothTrace(ctx, pts); ctx.fill() })
export const MACRO_PROPS = {
  wetPebble(ctx, seed) {
    const rnd = rng(seed), r = 14, base = [0x6a6258, 0x8a7a62, 0x5a5650, 0x7a6a56][seed % 4]
    const pts = blobPts(rnd, 0, 0, r, 14, 0.2, 0.72 + rnd() * 0.2, rnd() * TAU)
    centredShadow(ctx, pts, 3, 0.75)
    const g = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r * 1.1)
    g.addColorStop(0, css(shadeC(base, 0.35))); g.addColorStop(0.55, css(base)); g.addColorStop(1, css(shadeC(base, -0.6)))
    smoothTrace(ctx, pts); ctx.fillStyle = g; ctx.fill()
    grain(ctx, pts, 0.4)
    ctx.save(); smoothTrace(ctx, pts); ctx.clip()
    for (let k = 0; k < 40; k++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)'; ctx.fillRect((rnd() - 0.5) * r * 2, (rnd() - 0.5) * r * 2, 0.5, 0.5) }
    ctx.restore()
    innerShadow(ctx, pts, 2.5, 'rgba(0,0,0,0.5)')
    softFill(ctx, ellipsePts(-r * 0.25, -r * 0.25, r * 0.35, r * 0.2, -0.7, 16), 1.5, 'rgba(255,255,255,0.5)')
    softDot(ctx, -r * 0.3, -r * 0.3, r * 0.08, 0.3, 'rgba(255,255,255,0.95)')
  },
  deadLeaf(ctx, seed) {
    const rnd = rng(seed), r = 18
    const pts = []
    for (let i = 0; i < 24; i++) { const t = i / 24, a = t * TAU, q = r * (Math.abs(Math.cos(a / 2)) * 0.95 + 0.05) * (0.85 + rnd() * 0.25); pts.push(Math.cos(a) * r * 0.9 * (0.6 + 0.4 * Math.abs(Math.cos(a))), Math.sin(a) * q * 0.5) }
    centredShadow(ctx, pts, 2.5, 0.6)
    smoothTrace(ctx, pts); ctx.fillStyle = css(mixc(0x3a2614, 0x6a4a2e, rnd())); ctx.fill()
    ctx.save(); smoothTrace(ctx, pts); ctx.clip()
    for (let i = 0; i < 30; i++) softDot(ctx, (rnd() - 0.5) * r * 1.8, (rnd() - 0.5) * r, 1 + rnd() * 3, 1.5, rnd() < 0.5 ? 'rgba(40,18,6,0.4)' : 'rgba(200,140,70,0.3)')
    ctx.strokeStyle = 'rgba(230,190,130,0.55)'; ctx.lineWidth = 0.6
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke()
    ctx.lineWidth = 0.35
    for (let v = -4; v <= 4; v++) for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(v * r * 0.2, 0); ctx.quadraticCurveTo(v * r * 0.2 + r * 0.15, s * r * 0.2, v * r * 0.2 + r * 0.3, s * r * 0.42); ctx.stroke() }
    ctx.restore()
    grain(ctx, pts, 0.45)
    // holes eaten through, and the soil showing
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc((rnd() - 0.5) * r, (rnd() - 0.5) * r * 0.4, 0.8 + rnd() * 1.5, 0, TAU); ctx.fillStyle = 'rgba(30,18,10,0.95)'; ctx.fill() }
  },
  twig(ctx, seed) {
    const rnd = rng(seed), L = 34
    const pts = []
    let a = (rnd() - 0.5) * 0.3, x = -L / 2, y = 0
    for (let i = 0; i <= 8; i++) { pts.push([x, y]); a += (rnd() - 0.5) * 0.35; x += Math.cos(a) * L / 8; y += Math.sin(a) * L / 8 }
    ctx.save(); ctx.lineCap = 'round'
    withBlur(ctx, 2, 'rgba(0,0,0,0.7)', () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.lineWidth = 3.4; ctx.stroke() })
    ctx.restore()
    limb(ctx, pts, 3.2, 2.2, 0x6a4a2e, { spec: 0.35 })
    limb(ctx, [pts[4], [pts[4][0] + 6, pts[4][1] - 7]], 1.6, 0.8, 0x6a4a2e, { spec: 0.3 })
    ctx.save(); ctx.lineCap = 'round'; for (let i = 0; i < 12; i++) { const p = pts[1 + Math.floor(rnd() * 7)]; ctx.beginPath(); ctx.moveTo(p[0], p[1] - 0.6); ctx.lineTo(p[0] + 1.5, p[1] - 0.4); ctx.lineWidth = 0.3; ctx.strokeStyle = 'rgba(30,18,8,0.7)'; ctx.stroke() } ctx.restore()
  },
  moss(ctx, seed) {
    // a cushion of moss: hundreds of tiny star-shaped leaflets, wet tips catching light
    const rnd = rng(seed), r = 20
    const pts = blobPts(rnd, 0, 0, r, 12, 0.4, 0.8)
    centredShadow(ctx, pts, 4, 0.7)
    smoothTrace(ctx, pts); ctx.fillStyle = css(0x1e2a0c); ctx.fill()
    for (let i = 0; i < 260; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * r * 0.95, x = Math.cos(a) * d, y = Math.sin(a) * d * 0.8
      const lit = 1 - d / r
      for (let k = 0; k < 5; k++) {
        const b = k * 1.2566 + rnd()
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b) * 1.6, y + Math.sin(b) * 1.6)
        ctx.lineWidth = 0.45; ctx.strokeStyle = css(mixc(0x3a5a14, 0xa8c850, lit * 0.8 + rnd() * 0.2), 0.9); ctx.stroke()
      }
      if (rnd() < 0.15) { ctx.beginPath(); ctx.arc(x, y, 0.35, 0, TAU); ctx.fillStyle = 'rgba(255,255,240,0.9)'; ctx.fill() }
    }
  },
  caveRock(ctx, seed) {
    const rnd = rng(seed), r = 16, base = [0x2a2436, 0x3a3248, 0x221d2c][seed % 3]
    const pts = blobPts(rnd, 0, 0, r, 8, 0.45, 0.75, rnd() * TAU)
    centredShadow(ctx, pts, 3, 0.85)
    const g = ctx.createRadialGradient(-r * 0.15, -r * 0.15, 0, 0, 0, r * 1.1)
    g.addColorStop(0, css(shadeC(base, 0.3))); g.addColorStop(0.6, css(base)); g.addColorStop(1, css(shadeC(base, -0.6)))
    trace(ctx, pts); ctx.fillStyle = g; ctx.fill()
    grain(ctx, pts, 0.5)
    innerShadow(ctx, pts, 2, 'rgba(0,0,0,0.6)')
    softFill(ctx, ellipsePts(-r * 0.2, -r * 0.25, r * 0.4, r * 0.12, -0.5, 12), 1.5, 'rgba(200,210,255,0.4)')
    for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(220,240,255,0.9)'; ctx.fillRect((rnd() - 0.5) * r, (rnd() - 0.5) * r, 0.4, 0.4) }
  },
  druse(ctx, seed) {
    const rnd = rng(seed), R = 13, [h0, h1] = [[0x8a5ae0, 0xd8c0ff], [0x3ab0d8, 0xb8f0ff], [0xb060d0, 0xf0c8ff]][seed % 3]
    const pts = blobPts(rnd, 0, 0, R * 1.05, 10, 0.3, 0.85)
    centredShadow(ctx, pts, 3, 0.8)
    smoothTrace(ctx, pts); ctx.fillStyle = css(0x1a1424); ctx.fill()
    innerShadow(ctx, pts, 2.5, css(h0, 0.6))
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; softDot(ctx, 0, 0, R * 0.6, R * 0.5, css(h0, 0.5)); ctx.restore()
    for (let k = 0; k < 9; k++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.7; prismTop(ctx, Math.cos(a) * d, Math.sin(a) * d, R * (0.16 + rnd() * 0.2), rnd() * TAU, h0, h1) }
  },
}
export function paintProp(name, seed) {
  return bakeLocal(36, 3, (ctx) => MACRO_PROPS[name](ctx, seed), { shadowBlur: 0.5 }).body
}

// ==== THE GEODE'S PILLARS ========================================================================
// A crystal cluster growing out of a socket of wet rock, painted at R = 64 and scaled to each
// collider. Obstacles never turn, so this one takes the raking key from the top-left like the floor.
export function paintCrystalPillar(variant) {
  const R = 64
  return bakeLocal(R * 2.1, 2, (ctx) => {
    const rnd = rng(301 + variant * 29)
    const hues = [[0x8a50e0, 0xd8b8ff], [0x2aa8d8, 0xb0f0ff], [0xb050d0, 0xf0c0ff]][variant % 3]
    // the light the crystal throws on the cave floor
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    softDot(ctx, 0, 0, R * 1.05, R * 0.9, css(hues[0], 0.32))
    softDot(ctx, 0, 0, R * 0.6, R * 0.5, css(hues[1], 0.22))
    ctx.restore()
    // the socket: lumpy wet rock, lit top-left, sunk shadow down-right
    const foot = blobPts(rnd, 0, 0, R * 0.98, 16, 0.22, 1, 0)
    withBlur(ctx, R * 0.12, 'rgba(0,0,0,0.85)', () => { ctx.save(); ctx.translate(-LX * R * 0.12, -LY * R * 0.12); smoothTrace(ctx, foot); ctx.fill(); ctx.restore() })
    const g = ctx.createLinearGradient(LX * R, LY * R, -LX * R, -LY * R)
    g.addColorStop(0, css(0x4a4258)); g.addColorStop(0.5, css(0x252030)); g.addColorStop(1, css(0x0c0a12))
    smoothTrace(ctx, foot); ctx.fillStyle = g; ctx.fill()
    grain(ctx, foot, 0.5)
    for (let i = 0; i < 14; i++) {
      const a = rnd() * TAU, d = R * (0.68 + rnd() * 0.26), r = R * (0.06 + rnd() * 0.08)
      const x = Math.cos(a) * d, y = Math.sin(a) * d
      lump(ctx, blobPts(rnd, x, y, r, 8, 0.4), x, y, r, mixc(0x2a2436, 0x4a4058, rnd()), { gloss: 0.7, shadow: 0.7 })
    }
    innerShadow(ctx, foot, R * 0.06, 'rgba(0,0,0,0.7)')
    // the crystals: the leaning ones first (behind), the upright core last
    const n = 6 + (variant % 3)
    const spikes = []
    for (let i = 0; i < n; i++) spikes.push([(i / n) * TAU + rnd() * 0.6, R * (0.12 + rnd() * 0.15), R * (0.55 + rnd() * 0.42), R * (0.13 + rnd() * 0.07), rnd() < 0.5 ? hues[0] : hues[1]])
    spikes.sort((p, q) => Math.sin(q[0]) - Math.sin(p[0]))
    for (const [a, d, len, wid, hue] of spikes) crystalSpike(ctx, Math.cos(a) * d, Math.sin(a) * d, len, wid, a, hue)
    prismTop(ctx, 0, 0, R * 0.4, rnd() * TAU, hues[0], hues[1], false)
    // light trapped inside, and the glints
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    softDot(ctx, LX * R * 0.08, LY * R * 0.08, R * 0.16, R * 0.18, css(hues[1], 0.55))
    for (let k = 0; k < 5; k++) {
      const x = (rnd() - 0.5) * R * 1.1, y = (rnd() - 0.5) * R * 1.1, s = R * (0.06 + rnd() * 0.08)
      softDot(ctx, x, y, s * 0.3, s * 0.4, 'rgba(255,255,255,0.8)')
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillRect(x - s * 1.6, y - 0.35, s * 3.2, 0.7); ctx.fillRect(x - 0.35, y - s * 1.6, 0.7, s * 3.2)
    }
    ctx.restore()
  }, { shadowBlur: 1 })
}

// ==== SHOTS AND DEBRIS ===========================================================================
// A crumb for the particle system: painted near-white so each spawn's tint colours it.
export function paintCrumbParticle() {
  return bakeLocal(10, 3, (ctx) => {
    const rnd = rng(5), pts = blobPts(rnd, 0, 0, 5, 9, 0.5, 0.85)
    withBlur(ctx, 1.2, 'rgba(0,0,0,0.55)', () => { ctx.save(); ctx.translate(1, 1.3); smoothTrace(ctx, pts); ctx.fill(); ctx.restore() })
    const g = ctx.createRadialGradient(-1.5, -1.5, 0, 0, 0, 6)
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#c8c8c8'); g.addColorStop(1, '#6a6a6a')
    smoothTrace(ctx, pts); ctx.fillStyle = g; ctx.fill()
    grain(ctx, pts, 0.5)
  }, { shadowBlur: 0.3 }).body
}
// Pebble Sling's stone: a small wet river pebble.
export function paintPebbleShot() {
  return bakeLocal(12, 3, (ctx) => {
    const rnd = rng(9), r = 6.5, pts = blobPts(rnd, 0, 0, r, 14, 0.18, 0.82)
    withBlur(ctx, 1.4, 'rgba(0,0,0,0.6)', () => { smoothTrace(ctx, pts); ctx.fill() })
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 0, 0, 0, r * 1.1)
    g.addColorStop(0, css(0xd8d0c4)); g.addColorStop(0.55, css(0x8a8072)); g.addColorStop(1, css(0x3a342c))
    smoothTrace(ctx, pts); ctx.fillStyle = g; ctx.fill()
    grain(ctx, pts, 0.45)
    ctx.save(); smoothTrace(ctx, pts); ctx.clip()
    ctx.strokeStyle = 'rgba(240,236,226,0.5)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-r, r * 0.2); ctx.quadraticCurveTo(0, -r * 0.1, r, r * 0.3); ctx.stroke()
    ctx.restore()
    softDot(ctx, -r * 0.3, -r * 0.32, r * 0.14, 0.3, 'rgba(255,255,255,0.95)')
  }, { shadowBlur: 0.3 }).body
}
// Prism Shard: a splinter of crystal, light running down its length, a halo of its own colour.
export function paintPrismShot() {
  return bakeLocal(18, 3, (ctx) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    softFill(ctx, ellipsePts(1, 0, 12, 4.5, 0, 20), 3.5, 'rgba(170,130,255,0.6)')
    ctx.restore()
    const out = [-9, 0, -3, -3.2, 9, -0.8, 12.5, 0, 9, 0.8, -3, 3.2]
    const g = ctx.createLinearGradient(0, -3.2, 0, 3.2)
    g.addColorStop(0, '#f4ecff'); g.addColorStop(0.45, '#b898ff'); g.addColorStop(0.55, '#5a34b0'); g.addColorStop(1, '#a080f0')
    trace(ctx, out); ctx.fillStyle = g; ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.4
    ctx.beginPath(); ctx.moveTo(-7, -0.6); ctx.lineTo(11, -0.2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(-3, -3.2); ctx.lineTo(0, 0); ctx.lineTo(-3, 3.2); ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke()
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    softDot(ctx, 9.5, -0.3, 1.2, 1.2, 'rgba(255,255,255,1)')
    ctx.restore()
  }, { shadowBlur: 0.3 }).body
}
// The falling stone: a cone of cave rock seen from below its point (from above), lit top-left.
export function paintStalactite() {
  return bakeLocal(40, 2, (ctx) => {
    const rnd = rng(17), R = 30, V = []
    for (let i = 0; i < 11; i++) { const a = (i / 11) * TAU, q = R * (0.82 + rnd() * 0.3); V.push([Math.cos(a) * q, Math.sin(a) * q]) }
    const ap = [LX * R * 0.12, LY * R * 0.12]
    for (let i = 0; i < V.length; i++) {
      const p0 = V[i], p1 = V[(i + 1) % V.length]
      const L = 0.5 + 0.5 * Math.cos(Math.atan2(p0[1] + p1[1], p0[0] + p1[0]) - Math.atan2(LY, LX))
      ctx.beginPath(); ctx.moveTo(ap[0], ap[1]); ctx.lineTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.closePath()
      ctx.fillStyle = css(mixc(0x14111a, 0x8a8296, L)); ctx.fill()
    }
    const flat = V.flat()
    grain(ctx, flat, 0.55)
    for (let i = 0; i < 18; i++) { const a = rnd() * TAU, d = rnd() * R * 0.8; ctx.fillStyle = 'rgba(220,230,255,0.85)'; ctx.fillRect(Math.cos(a) * d, Math.sin(a) * d, 0.5, 0.5) }
    softDot(ctx, ap[0] - 2, ap[1] - 2, 2.5, 1.5, 'rgba(255,255,255,0.75)')
  }, { shadowBlur: 0.3 })
}

// ==== Root Snare: gnarled woody roots heaving out of a broken crust =============================
// Baked at SNARE_R0 local units of radius; render.js scales each bake to the snare's own r. The
// grow frames are SNARE_GROW_K: every random choice is drawn from a per-root rng BEFORE k is read,
// so the frames of one seed are the same roots, longer.
export const SNARE_R0 = 100
export const SNARE_GROW_K = [0.15, 0.35, 0.6, 0.8, 1]
export const SNARE_SEEDS = 2
// A wandering path of n steps, pulled back toward heading `aim` each step.
function walkPts(rnd, x, y, a, L, n, wob, kink, pull, aim) {
  const pts = [[x, y]]
  let av = 0
  for (let i = 0; i < n; i++) {
    av = av * 0.65 + (rnd() - 0.5) * wob
    if (rnd() < kink) av += (rnd() - 0.5) * 1.1
    a += av + (aim - a) * pull
    x += Math.cos(a) * L / n; y += Math.sin(a) * L / n
    pts.push([x, y])
  }
  return pts
}
function polySpine(pts) {
  const n = pts.length - 1
  return (t) => {
    const f = Math.max(0, Math.min(n, t * n)), i = Math.min(n - 1, Math.floor(f)), u = f - i
    return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)]
  }
}
// [normal x, normal y, tangent x, tangent y] of a spine at t
function spineNrm(sp, t) {
  const [ax, ay] = sp(Math.max(0, t - 0.01)), [bx, by] = sp(Math.min(1, t + 0.01))
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1
  return [-dy / l, dx / l, dx / l, dy / l]
}
const shiftPts = (pts, dx, dy) => pts.map((v, i) => v + (i % 2 ? dy : dx))
const ROOT_SOILS = [0x3e2a18, 0x5a3e26, 0x6e4c2e, 0x7a5a3a, 0x4a321e]   // heaved crumbs
const CLING_SOILS = [0x3e2a18, 0x5a3e26, 0x6e4c2e, 0x4a321e]          // soil stuck to a root
const CLOD_SOILS = [0x4a321e, 0x5a3e26, 0x6e4c2e, 0x7a5a3a]           // the broken crust
// One root as ONE tapered, knobbly silhouette grown to k along its spine: a contact shadow thrown
// away from the key, the lit flank toward it, bark fissures, root hairs, clinging soil crumbs.
function rootBody(ctx, seed, pts, w0, k, st) {
  const rnd = rng(seed)
  const fiss = [], hairs = [], crumbs = []
  for (let i = 0; i < st.fiss; i++) fiss.push([rnd(), 0.04 + rnd() * 0.14, (rnd() - 0.5) * 1.5, 0.3 + rnd() * 0.6])
  for (let i = 0; i < st.hairs; i++) hairs.push([1 - Math.pow(rnd(), 0.35), rnd() < 0.5 ? 1 : -1, (rnd() - 0.5) * 1.2, 3.5 * (0.4 + rnd())])
  for (let i = 0; i < st.crumbs; i++) crumbs.push([rnd() * 0.8, (rnd() - 0.5) * 1.6, 0.6 + rnd() * 1.4, rnd() * 1e6])
  const ph1 = rnd() * TAU, ph2 = rnd() * TAU
  if (k <= 0.02) return
  const sp = polySpine(pts)
  const half = (t) => {
    const taper = w0 * (0.24 + 0.76 * Math.pow(1 - t, 0.6))
    const knob = 1 + 0.14 * (0.6 * Math.sin(t * 19 + ph1) + 0.4 * Math.sin(t * 47 + ph2))
    return Math.max(0.15, taper * knob * Math.sqrt(Math.min(1, Math.max(0, (k - t) / 0.1))))
  }
  const n = Math.max(10, Math.round(pts.length * 4 * k))
  const sil = spineOutline(sp, half, n, 0, k)
  withBlur(ctx, w0 * 0.45 + 0.6, 'rgba(0,0,0,0.65)', () => { trace(ctx, shiftPts(sil, -LX * w0 * 0.55, -LY * w0 * 0.55)); ctx.fill() })
  trace(ctx, sil); ctx.fillStyle = css(BARK.base); ctx.fill()
  ctx.save(); trace(ctx, sil); ctx.clip()
  softFill(ctx, shiftPts(spineOutline(sp, (t) => half(t) * 0.55, n, 0, k), LX * w0 * 0.45, LY * w0 * 0.45), w0 * 0.3 + 0.3, css(BARK.lit, 0.8))
  ctx.lineCap = 'round'
  for (const [t0, len, lat, wd] of fiss) {
    if (t0 > k) continue
    ctx.beginPath()
    for (let j = 0; j <= 6; j++) {
      const t = Math.min(k, t0 + len * j / 6), [nx, ny] = spineNrm(sp, t), [x, y] = sp(t), h = half(t) * lat * 0.8
      if (j) ctx.lineTo(x + nx * h, y + ny * h); else ctx.moveTo(x + nx * h, y + ny * h)
    }
    ctx.lineWidth = wd * Math.max(0.4, w0 * 0.12); ctx.strokeStyle = css(BARK.fiss, 0.75); ctx.stroke()
    ctx.save(); ctx.translate(LX * 0.45, LY * 0.45); ctx.lineWidth *= 0.6; ctx.strokeStyle = css(BARK.lit, 0.35); ctx.stroke(); ctx.restore()
  }
  ctx.restore()
  grain(ctx, sil, 0.6)
  innerShadow(ctx, sil, w0 * 0.3 + 0.35, css(BARK.dark, 0.85), LX * w0 * 0.55, LY * w0 * 0.55)
  ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 0.28; ctx.strokeStyle = 'rgba(246,236,214,0.6)'
  for (const [t, side, da, L] of hairs) {
    if (t > k) continue
    const [nx, ny, tx, ty] = spineNrm(sp, t), [x, y] = sp(t), h = half(t) * side
    const a = Math.atan2(ny * side, nx * side) + da
    const bx = x + nx * h, by = y + ny * h
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + Math.cos(a) * L * 0.5 + tx * L * 0.3, by + Math.sin(a) * L * 0.5 + ty * L * 0.3, bx + Math.cos(a) * L, by + Math.sin(a) * L)
    ctx.stroke()
  }
  ctx.restore()
  for (const [t, lat, r, s] of crumbs) {
    if (t > k * 0.9) continue
    const [nx, ny] = spineNrm(sp, t), [x, y] = sp(t), h = half(t) * lat * 0.6
    const rr = rng(s), cx = x + nx * h, cy = y + ny * h
    lump(ctx, blobPts(rr, cx, cy, r, 7, 0.7, 0.8, rr() * TAU), cx, cy, r, CLING_SOILS[Math.floor(rr() * 4)], { shadow: 0.55 })
  }
}
const BARK = { base: 0x664830, lit: 0xd2aa7e, dark: 0x0e0804, fiss: 0x140a04 }
// One snare at growth k (0..1), seed 0..SNARE_SEEDS-1. The reach is stated on the ground: a disc of
// turned loam that ends at SNARE_R0, a ring of heaved crumbs on it, and the holes the tips dive into.
export function paintRootSnare(seed, k) {
  const R = SNARE_R0
  return bakeLocal(R * 1.12, 1.5, (ctx) => {
    const rnd = rng(1013 + seed * 77)
    const kE = Math.min(1, k * 3)
    // the turned loam, darkest in a band at the reach
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.04)
    g.addColorStop(0, `rgba(12,7,3,${0.21 * kE})`); g.addColorStop(0.86, `rgba(10,6,3,${0.3 * kE})`)
    g.addColorStop(0.955, `rgba(6,3,1,${0.55 * kE})`); g.addColorStop(1, 'rgba(6,3,1,0)')
    ctx.beginPath(); ctx.arc(0, 0, R * 1.04, 0, TAU); ctx.fillStyle = g; ctx.fill()
    const roots = []
    for (let i = 0; i < 7; i++) {
      const a0 = (i / 7) * TAU + (rnd() - 0.5) * 0.5
      let pts = walkPts(rnd, Math.cos(a0) * 5, Math.sin(a0) * 5, a0, R, 18, 0.22, 0.12, 0.12, a0)
      const [ex, ey] = pts[pts.length - 1], sc = R * (0.9 + rnd() * 0.06) / Math.hypot(ex, ey)
      pts = pts.map(([x, y]) => [x * sc, y * sc])
      roots.push({ pts, w: 7 + rnd() * 3, s: rnd() * 1e6, br: [0, 1].map(() => ({ t: 0.25 + rnd() * 0.45, da: (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.5), L: R * (0.25 + rnd() * 0.2), s: rnd() * 1e6 })) })
    }
    // the holes the tips dive back into
    if (k > 0.85) {
      for (const r of roots) {
        const [x, y] = r.pts[r.pts.length - 1]
        softDot(ctx, x, y, 3, 1.44, 'rgba(0,0,0,0.55)')
        softDot(ctx, x + LX * 0.48, y + LY * 0.48, 1.8, 0.84, 'rgba(0,0,0,0.85)')
      }
    }
    // the ring of heaved crumbs at the reach
    const ringR = rng(seed * 5 + 3)
    for (let i = 0, n = Math.round(70 * kE); i < n; i++) {
      const a = ringR() * TAU, d = R * 0.985 * (1 + (ringR() - 0.5) * 0.08), r = 0.8 + Math.pow(ringR(), 2) * 1.8
      const x = Math.cos(a) * d, y = Math.sin(a) * d, rr = rng(ringR() * 1e6)
      lump(ctx, blobPts(rr, x, y, r, 8, 0.7, 0.75, rr() * TAU), x, y, r, ROOT_SOILS[Math.floor(rr() * 5)], { shadow: 0.7, gloss: rr() < 0.15 ? 0.5 : 0 })
    }
    const MAIN = { fiss: 26, hairs: 30, crumbs: 5 }, BRANCH = { fiss: 8, hairs: 26, crumbs: 1 }
    for (const r of roots) {
      rootBody(ctx, r.s, r.pts, r.w, Math.min(1, k * 1.05), MAIN)
      const sp = polySpine(r.pts)
      for (const b of r.br) {
        const [x, y] = sp(b.t), [, , tx, ty] = spineNrm(sp, b.t)
        const bp = walkPts(rng(b.s), x, y, Math.atan2(ty, tx) + b.da, b.L, 9, 0.35, 0.15, 0.05, Math.atan2(y, x))
          .map(([px, py]) => { const d = Math.hypot(px, py); return d > R * 0.95 ? [px * R * 0.95 / d, py * R * 0.95 / d] : [px, py] })
        rootBody(ctx, b.s + 1, bp, r.w * 0.42, Math.max(0, (k - b.t) / (1 - b.t)), BRANCH)
      }
    }
    // the heave at the middle: the crust broken into clods over the root crown
    const cr = rng(seed * 11 + 7)
    for (let i = 0; i < 22; i++) {
      const a = cr() * TAU, d = Math.pow(cr(), 0.7) * 17 * (0.6 + 0.4 * kE), r = 2.5 + cr() * 4.5
      const x = Math.cos(a) * d, y = Math.sin(a) * d, rr = rng(cr() * 1e6)
      lump(ctx, blobPts(rr, x, y, r, 8, 0.6, 0.8, rr() * TAU), x, y, r, CLOD_SOILS[Math.floor(rr() * 4)], { shadow: 0.8, lit: 0.45 })
    }
  }, { shadowBlur: 0.5 })
}

// ==== THE FLOOR PICKUPS ===========================================================================
// Topsoil's xp gems and coins (render.js macroPickups). A gem is a lump of rough sapphire turned out
// of the soil (one stone, a bigger stone, a stone with two smaller ones: the three tiers), a coin is
// an old worn coin, one edge still under the dirt. Both are heightfields shaded texel by texel:
// facet normals, the stone's body darker and bluer where it is thick (Beer-Lambert), silk inclusions,
// a Fresnel reflection of the key's softbox and a hard specular; the coin's rim, beaded border and
// low head under tarnish. The soil they sit in (scuff, contact shadow, crumbs) is painted around them.
// Every bake is in WORLD px (bakeLocal at PK_S texels per px, uploaded at PK_S) and comes as a pair,
// [plain, glint], the glint being the same bake with the specular pushed: render.js swaps to it for a
// beat now and then, so a still floor still catches the light.
export const PK_S = 4
const PK_K = 1.45   // every pickup is painted at this size over the units its painter is written in
function pkBake(E, paint) {
  const at = (gl) => (ctx) => { ctx.scale(PK_K, PK_K); ctx._S = PK_S * PK_K; paint(ctx, gl) }
  const out = (b) => ({ body: b.body, ax: b.ax, ay: b.ay })
  return [out(bakeLocal(E * PK_K, PK_S, at(false), { shadowBlur: 0.3 })), out(bakeLocal(E * PK_K, PK_S, at(true), { shadowBlur: 0.3 }))]
}
const PK_L = (() => { const v = [LX, LY, 1.05], n = Math.hypot(...v); return v.map((c) => c / n) })()
const PK_H = (() => { const v = [PK_L[0], PK_L[1], PK_L[2] + 1], n = Math.hypot(...v); return v.map((c) => c / n) })()
const PK_RES = PK_S * PK_K * 1.5   // texels per px the shaded bakes are rastered at
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
function hash2(x, y) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h) }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const fbm2 = (x, y) => vnoise(x, y) * 0.5 + vnoise(x * 2.1 + 5.2, y * 2.1 + 3.1) * 0.3 + vnoise(x * 4.3 + 11.7, y * 4.3 + 7.9) * 0.2
// shade(x, y) -> [r, g, b, a] (0..1) or null, x/y in local px; composited over what the canvas holds
function pkRaster(ctx, E, shade) {
  const W = Math.ceil(E * 2 * PK_RES), c = makeCanvas(W, W), cx = c.getContext('2d'), id = cx.createImageData(W, W), d = id.data
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const o = shade(-E + (i + 0.5) / PK_RES, -E + (j + 0.5) / PK_RES)
    if (!o || o[3] <= 0) continue
    const k = (j * W + i) * 4
    d[k] = Math.min(255, Math.max(0, o[0] * 255)); d[k + 1] = Math.min(255, Math.max(0, o[1] * 255)); d[k + 2] = Math.min(255, Math.max(0, o[2] * 255)); d[k + 3] = Math.min(255, o[3] * 255)
  }
  cx.putImageData(id, 0, 0)
  ctx.drawImage(c, -E, -E, E * 2, E * 2)
}
const SOILS = [0x3e2a18, 0x5a3e26, 0x6e4c2e, 0x4a321e, 0x7a5a3a]
function pkCrumb(ctx, rnd, x, y, r) {
  r *= 0.62
  const pts = blobPts(rnd, x, y, r, 8, 0.6, 0.7, rnd() * TAU)
  lump(ctx, pts, x, y, r, SOILS[Math.floor(rnd() * SOILS.length)], { shadow: 0.5, lit: 0.18, dark: 0.45 })
}
// a scuffed, darker patch of disturbed soil: the dirt the thing was turned out of
function pkScuff(ctx, rnd, x, y, rx, ry, rot) {
  softFill(ctx, ellipsePts(x, y, rx, ry, rot, 24), Math.min(rx, ry) * 0.5, 'rgba(14,8,4,0.55)')
  for (let i = 0; i < 6; i++) { const a = rnd() * TAU, d = 0.5 + rnd() * 0.5; softDot(ctx, x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d, 0.6 + rnd() * 0.8, 0.5, 'rgba(110,80,52,0.35)') }
}

// The stone's look at one texel. n: unit normal; t: thickness under it (px); ridge 0..1 (a facet edge);
// (gx, gy): where it sits relative to the stone's centre in units of its size, for the internal glow.
function sapphireTexel(n, t, ridge, gx, gy, x, y, glint, dirt, brill = 0.5) {
  const nz = n[2], ndl = n[0] * PK_L[0] + n[1] * PK_L[1] + n[2] * PK_L[2]
  const ndh = Math.max(0, n[0] * PK_H[0] + n[1] * PK_H[1] + n[2] * PK_H[2])
  // the body: the soil seen through blue stone, darker and bluer the deeper the path
  const k = 0.15 + t * 0.5
  const facing = (n[0] * PK_L[0] + n[1] * PK_L[1]) / Math.max(1e-3, Math.hypot(n[0], n[1]) * Math.hypot(PK_L[0], PK_L[1]))
  const fv = (0.35 + 1.0 * sstep(-0.7, 0.85, facing)) * (0.55 + 0.9 * brill)
  let r = 0.16 * fv * Math.exp(-k * 0.9), g = 0.2 * fv * Math.exp(-k * 0.65), b = 0.3 * fv * Math.exp(-k * 0.35)
  // light that came in through the lit facets, scattered and leaving on the far side
  const far = sstep(-0.3, 0.9, -(gx * PK_L[0] + gy * PK_L[1]) / Math.hypot(PK_L[0], PK_L[1]))
  const glow = (far * 0.28 + brill * brill * brill * 0.3) * (0.6 + 0.4 * fbm2(x * 0.9, y * 0.9))
  r += glow * 0.42; g += glow * 0.55; b += glow * 0.82
  // silk: rutile needles at sixty degrees, faint and sparse
  for (let q = 0; q < 3; q++) {
    const a = q * 1.047 + 0.4, s = x * Math.cos(a) + y * Math.sin(a)
    const line = Math.pow(1 - Math.abs(((s * 1.6 + vnoise(x * 0.7 + q * 9, y * 0.7)) % 1 + 1) % 1 - 0.5) * 2, 18)
    const m = sstep(0.55, 0.8, vnoise(x * 0.45 + q * 4.1, y * 0.45 - q * 2.7)) * 0.13 * line
    r += m * 0.75; g += m * 0.82; b += m
  }
  // a little diffuse from the surface, for the form
  const dif = Math.max(0, ndl) * 0.16
  r += dif * 0.55; g += dif * 0.65; b += dif * 0.85
  // Fresnel reflection of the scene: the soil below, the softbox at the key
  const F = 0.05 + 0.95 * Math.pow(1 - Math.max(0, nz), 5)
  const R = [2 * nz * n[0], 2 * nz * n[1], 2 * nz * n[2] - 1]
  const box = sstep(0.6, 0.97, R[0] * PK_L[0] + R[1] * PK_L[1] + R[2] * PK_L[2])
  const env = [0.08 + box * 0.95, 0.07 + box * 0.93, 0.05 + box * 0.88]
  const Fe = Math.min(1, F * 2.4 + 0.05)
  r += env[0] * Fe; g += env[1] * Fe; b += env[2] * Fe
  // the edges where two facets meet catch light as fine lines
  const lit = 0.45 + 0.55 * Math.max(0, ndl)
  r += ridge * 0.16 * lit; g += ridge * 0.19 * lit; b += ridge * 0.24 * lit
  // the specular: hard and small, then a soft sheen
  const sp = Math.pow(ndh, 420) * (glint ? 5 : 1.8) + Math.pow(ndh, 60) * 0.1
  r += sp; g += sp; b += sp
  // dust and a film of soil on whatever sat in the dirt
  if (dirt > 0) { r = r + (0.24 - r) * dirt; g = g + (0.16 - g) * dirt; b = b + (0.1 - b) * dirt }
  return [r, g, b]
}
// heightfield as a set of planes h = h0 + gp*p + gq*q in a frame turned by ang: min over them.
function planesAt(planes, x, y) {
  let h1 = Infinity, h2 = Infinity, i1 = -1
  for (let i = 0; i < planes.length; i++) {
    const P = planes[i], h = P[0] + P[1] * x + P[2] * y
    if (h < h1) { h2 = h1; h1 = h; i1 = i } else if (h < h2) h2 = h
  }
  return [h1, h2, i1]
}
// Stones { cx, cy, planes, bury, size } rastered together, the highest surface on top; `bury` sinks
// each into the soil, which covers whatever is left below zero.
function crystalRaster(ctx, E, stones, glint) {
  pkRaster(ctx, E, (x, y) => {
    let best = null
    for (const st of stones) {
      const dx = x - st.cx, dy = y - st.cy
      let [h1, h2, i1] = planesAt(st.planes, dx, dy)
      const chip = (fbm2(x * 1.3 + st.cx * 3, y * 1.3 - st.cy * 3) - 0.5) * st.size * 0.32
      h1 += chip; h2 += chip
      if (h1 <= 0) continue
      const z = h1 - st.bury
      if (z <= 0) continue
      if (best && best.z >= z) continue
      const P = st.planes[i1]
      const nl = Math.hypot(P[1], P[2], 1)
      const n = [-P[1] / nl, -P[2] / nl, 1 / nl]
      const ridge = 1 - sstep(0, st.size * 0.09, h2 - h1)
      const cover = Math.min(sstep(0, 0.35, h1), sstep(0, 0.5, z))
      const dirt = (1 - sstep(0, st.size * 0.45, z)) * 0.75
      best = { z, n, h1, ridge, cover, dirt, gx: dx / st.size, gy: dy / st.size, brill: hash2(i1 * 3.1 + st.cx, i1 * 1.7 + st.cy) }
    }
    if (!best) return null
    const rgb = sapphireTexel(best.n, best.h1, best.ridge, best.gx, best.gy, x, y, glint, best.dirt, best.brill)
    return [rgb[0], rgb[1], rgb[2], best.cover]
  })
}
function stoneShadow(ctx, stones, a = 0.7) {
  for (const st of stones) withBlur(ctx, st.size * 0.35 + 0.5, `rgba(6,3,1,${a})`, () => {
    ctx.beginPath(); ctx.ellipse(st.cx - LX * st.size * 0.5, st.cy - LY * st.size * 0.5, st.size * 1.05, st.size * 0.8, 0, 0, TAU); ctx.fill()
  })
}
// the light the stone focuses, landing blue-white on the soil past it
function stoneCaustic(ctx, stones) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'
  for (const st of stones) softDot(ctx, st.cx - LX * st.size * 0.95, st.cy - LY * st.size * 0.95, st.size * 0.32, st.size * 0.35, 'rgba(110,140,200,0.32)')
  ctx.restore()
}
// A lump of rough corundum: a convex stone of irregular facets, each a plane h = h0 + gx*x + gy*y
// (nine round the sides, three across the crown), stretched by `aspect` and turned by `rot`.
function roughPlanes(rnd, R, aspect, rot) {
  const out = [], n = 9
  for (let k = 0; k < n + 3; k++) {
    const top = k >= n
    const phi = top ? rnd() * TAU : (k / n) * TAU + (rnd() - 0.5) * 0.5
    const e = top ? 1.05 + rnd() * 0.35 : 0.35 + rnd() * 0.5
    const a = Math.cos(phi) * Math.cos(e), b = Math.sin(phi) * Math.cos(e), c = Math.sin(e)
    const D = R * (top ? 0.95 + rnd() * 0.15 : 0.78 + rnd() * 0.32)
    // squash along q for the aspect, then turn by rot: the plane in the (x, y) frame
    const a2 = a, b2 = b / aspect
    const ar = a2 * Math.cos(rot) - b2 * Math.sin(rot), br = a2 * Math.sin(rot) + b2 * Math.cos(rot)
    out.push([D / c, -ar / c, -br / c])
  }
  return out
}
function sapphireRough(ctx, tier, rnd, glint) {
  const spec = [[[0, 0, 3.6]], [[0, 0, 5.2]], [[-0.8, 0.3, 5.2], [4.6, -2.6, 3.2], [-1.4, 4.8, 2.8]]][tier]
  const stones = spec.map(([x, y, R]) => ({ cx: x, cy: y, planes: roughPlanes(rnd, R, 1.25 + rnd() * 0.35, rnd() * TAU), bury: R * 0.32, size: R }))
  for (const st of stones) pkScuff(ctx, rnd, st.cx, st.cy, st.size * 1.35, st.size * 1.15, rnd() * TAU)
  stoneShadow(ctx, stones)
  stoneCaustic(ctx, stones)
  crystalRaster(ctx, 14, stones, glint)
  // soil fallen against the base, mostly on the side away from the light
  for (const st of stones) for (let i = 0; i < 5; i++) {
    const a = Math.atan2(-LY, -LX) + (rnd() - 0.5) * 3.2, d = st.size * (0.85 + rnd() * 0.25)
    pkCrumb(ctx, rnd, st.cx + Math.cos(a) * d, st.cy + Math.sin(a) * d, 0.6 + rnd() * 0.6)
  }
}
// The coin: a struck disc, worn and tarnished, leaning by `tilt`, pushed `sink` into the soil, with
// edgeBury(u, v) sinking part of its rim further under the dirt.
function coinRaster(ctx, E, o, glint) {
  const { r, tilt, ang, sink, edgeBury, seed } = o, soilAmp = o.soilAmp ?? 1
  const ct = Math.cos(tilt), st = Math.sin(tilt), c = Math.cos(ang), s = Math.sin(ang)
  const sd = seed * 1.37
  const relief = (u, v) => {
    const rho = Math.hypot(u, v) / r
    if (rho > 1) return -1
    let h = 0.42 * sstep(0.8, 0.88, rho) * (1 - sstep(0.94, 1.0, rho))           // the raised rim
    // the beaded border inside it
    const phi = Math.atan2(v, u), nb = 30, bp = ((phi / TAU) * nb % 1 + 1) % 1 - 0.5
    const bd = Math.hypot(bp * TAU * rho * r / nb, (rho - 0.73) * r)
    h += 0.16 * (1 - sstep(0.12, 0.32, bd))
    // a worn head in low relief
    const hu = u / r - 0.04, hv = v / r
    const head = Math.hypot(hu / 0.4, hv / 0.5) + (fbm2(u * 1.2 + sd, v * 1.2) - 0.5) * 0.35
    h += 0.13 * (1 - sstep(0.8, 1.0, head))
    h += 0.07 * (1 - sstep(0.2, 0.6, Math.hypot(hu + 0.12, hv + 0.18) * 3)) // the eye/cheek lump
    // wear flattens the high points; pits and scratches
    h *= 0.55 + 0.45 * vnoise(u * 0.6 + sd, v * 0.6 - sd)
    h -= 0.05 * sstep(0.7, 0.95, vnoise(u * 3.1 + sd, v * 3.1))
    return h
  }
  pkRaster(ctx, E, (x, y) => {
    const a = x * c + y * s, b = -x * s + y * c
    const u = a, v = b / ct
    const rho = Math.hypot(u, v) / r
    if (rho > 1.02) return null
    const hr = relief(u, v)
    // above the soil? the disc's own lean plus how deep it was pushed in
    const z = v * st + sink + Math.max(0, hr) * 0.6 - (edgeBury ? edgeBury(u, v) : 0)
    const soilLine = ((fbm2(x * 0.7 + sd, y * 0.7) - 0.5) * 2.4 + (vnoise(x * 2.5, y * 2.5) - 0.5) * 0.8) * soilAmp
    if (z < soilLine) return null
    const e = 0.18
    const dhu = (relief(u + e, v) - relief(u - e, v)) / (2 * e), dhv = (relief(u, v + e) - relief(u, v - e)) / (2 * e)
    // normal in (a, b): the relief's slope, plus the disc's tilt
    const na = -dhu, nb = -(dhv / ct) - st / ct, nl = Math.hypot(na, nb, 1)
    const n = [(na * c - nb * s) / nl, (na * s + nb * c) / nl, 1 / nl]
    const ndl = n[0] * PK_L[0] + n[1] * PK_L[1] + n[2] * PK_L[2]
    const ndh = Math.max(0, n[0] * PK_H[0] + n[1] * PK_H[1] + n[2] * PK_H[2])
    const R = [2 * n[2] * n[0], 2 * n[2] * n[1], 2 * n[2] * n[2] - 1]
    const box = sstep(0.55, 0.95, R[0] * PK_L[0] + R[1] * PK_L[1] + R[2] * PK_L[2])
    // old gold: a dull, warm metal; tarnish creeping out of the recesses
    const recess = 1 - sstep(0.0, 0.14, hr)
    const tarn = Math.min(1, sstep(0.45, 0.8, fbm2(u * 0.7 - sd, v * 0.7 + sd)) * 0.4 + recess * (rho < 0.8 ? 0.35 : 0.1) + (rho < 0.7 ? 0.3 : 0))
    const F0 = [0.68 - tarn * 0.26, 0.53 - tarn * 0.22, 0.3 - tarn * 0.13]
    const env = rho > 0.8 ? 0.62 + box * 0.75 : 0.4 + box * 0.35
    let rr = F0[0] * env, gg = F0[1] * env, bb = F0[2] * env
    const dif = Math.max(0, ndl) * 0.28
    rr += F0[0] * dif; gg += F0[1] * dif; bb += F0[2] * dif
    const sp = Math.pow(ndh, 140) * (glint ? 2.6 : 0.9) * (1 - tarn * 0.7) * (rho > 0.8 ? 1 : 0.35)
    rr += sp * 0.95; gg += sp * 0.8; bb += sp * 0.55
    // soil packed into the field's grooves, and a crust of it near the buried edge
    const soil = Math.max(recess * sstep(0.45, 0.7, vnoise(u * 1.8 + sd, v * 1.8)) * (rho < 0.78 ? 1 : 0.4), 1 - sstep(soilLine, soilLine + 0.9, z))
    const sc = 0.55 + 0.45 * vnoise(x * 2.3, y * 2.3)
    rr += (0.26 * sc - rr) * soil * 0.85; gg += (0.18 * sc - gg) * soil * 0.85; bb += (0.11 * sc - bb) * soil * 0.85
    const alpha = Math.min(1 - sstep(0.985, 1.02, rho), sstep(soilLine, soilLine + 0.25, z))
    return [rr, gg, bb, alpha]
  })
}
function coinFlat(ctx, rnd, glint) {
  const r = 6.2, ang = rnd() * TAU, seed = Math.floor(rnd() * 100)
  pkScuff(ctx, rnd, 0, 0, r * 1.15, r * 1.05, ang)
  withBlur(ctx, 1.1, 'rgba(6,3,1,0.65)', () => { ctx.beginPath(); ctx.ellipse(-LX * 0.9, -LY * 0.9, r, r * 0.97, ang, 0, TAU); ctx.fill() })
  // one edge sunk under a lip of soil
  const bdir = rnd() * TAU, bx = Math.cos(bdir), by = Math.sin(bdir)
  coinRaster(ctx, 12, { r, tilt: 0.12, ang, sink: 1.2, seed, soilAmp: 0.4, edgeBury: (u, v) => sstep(0.45, 1.0, (u * bx + v * by) / r) * 2.2 }, glint)
  for (let i = 0; i < 6; i++) { const a = bdir + ang + (rnd() - 0.5) * 1.6, d = r * (0.85 + rnd() * 0.3); pkCrumb(ctx, rnd, Math.cos(a) * d, Math.sin(a) * d, 0.5 + rnd() * 0.7) }
}

// { gem: [tier][shape] -> [plain, glint], coin: [shape] -> [plain, glint] }
export function paintPickups() {
  const gem = [0, 1, 2].map((tier) => [0, 1].map((shape) => pkBake(14, (ctx, gl) => sapphireRough(ctx, tier, rng(101 + tier * 13 + shape * 7), gl))))
  const coin = [0, 1].map((shape) => pkBake(12, (ctx, gl) => coinFlat(ctx, rng(211 + shape * 17), gl)))
  return { gem, coin }
}

// ==== THE SHOVEL (Topsoil's starter) ===============================================================
// A long-handled round-point shovel in plan view, +x from the D-grip (local 0) to the blade tip. The
// key is fixed in the WORLD, so the tool is baked once per heading (paintShovel(theta) paints it
// already turned by theta, every lit/shaded side worked out from the light in that frame) and
// render.js picks the nearest heading instead of rotating one bake's lighting round with the swing.
export const SHOVEL_LEN = 192        // grip centre to blade tip, in bake units
export const SHOVEL_DISH = 170       // the middle of the blade's dish, where the load of soil sits
export const SHOVEL_HEADINGS = 16
const SHOVEL_SOILS = [0x34200f, 0x422a16, 0x4e341c, 0x5e4026, 0x2a1a0c]
// A turned rod (wood or steel) lit by the local light lv: shade, body, a lit band and a glint, each
// slid across the rod toward the light.
function rod(ctx, pts, w, base, lv, spec = 0.5) {
  const pass = (k, off, color) => {
    ctx.lineWidth = w * k; ctx.strokeStyle = color
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1]
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1
      const nx = -dy / L, ny = dx / L, s = (nx * lv[0] + ny * lv[1]) * off * w
      ctx.beginPath(); ctx.moveTo(ax + nx * s, ay + ny * s); ctx.lineTo(bx + nx * s, by + ny * s); ctx.stroke()
    }
  }
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  pass(1.15, 0, css(shadeC(base, -0.7)))
  pass(0.95, 0.04, css(base))
  pass(0.5, 0.2, css(shadeC(base, 0.22)))
  if (spec > 0) pass(0.16, 0.3, `rgba(255,255,255,${spec})`)
  ctx.restore()
}
function bladeOutline(x0, x1, half, n = 30) {
  const top = [], bot = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t
    const w = half * Math.pow(Math.max(0, 1 - Math.pow(t, 2.6)), 0.55) * (1 - 0.06 * Math.sin(t * Math.PI))
    top.push(x, -w); bot.unshift(x, w)
  }
  return [...top, ...bot]
}
export function paintShovel(theta) {
  const c = Math.cos(theta), s = Math.sin(theta)
  const lv = [LX * c + LY * s, -LX * s + LY * c]   // toward the light, in the tool's own frame
  return bakeLocal(SHOVEL_LEN + 4, 1.75, (ctx) => {
    ctx.rotate(theta)
    const rnd = rng(311)
    // D-grip: black-stained ash, the cross bar polished by the palm
    rod(ctx, [[8, -2.6], [-2, -6], [-10, -8.5], [-15, -8.2]], 3.3, 0x2a1c12, lv, 0.3)
    rod(ctx, [[8, 2.6], [-2, 6], [-10, 8.5], [-15, 8.2]], 3.3, 0x2a1c12, lv, 0.3)
    rod(ctx, [[-15, -9], [-16, 0], [-15, 9]], 4.2, 0x3a2818, lv, 0.55)
    // the shaft: worn ash, its grain, darker and glossier where the hands go
    rod(ctx, [[6, 0], [138, 0]], 6, 0x9c7244, lv, 0.3)
    ctx.save(); ctx.lineCap = 'round'
    for (let i = 0; i < 9; i++) {
      const y = (rnd() - 0.5) * 3.8, x0 = 6 + rnd() * 60, L = 30 + rnd() * 80
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.bezierCurveTo(x0 + L * 0.3, y + (rnd() - 0.5) * 1.2, x0 + L * 0.6, y + (rnd() - 0.5) * 1.2, Math.min(138, x0 + L), y + (rnd() - 0.5))
      ctx.strokeStyle = `rgba(60,34,14,${0.25 + rnd() * 0.3})`; ctx.lineWidth = 0.35 + rnd() * 0.3; ctx.stroke()
    }
    ctx.restore()
    for (const [a, b] of [[8, 34], [96, 124]]) { ctx.save(); ctx.globalAlpha = 0.45; rod(ctx, [[a, 0], [b, 0]], 5.9, 0x5a3a1e, lv, 0.7); ctx.restore() }
    softDot(ctx, 60, 1.5, 2.2, 2, 'rgba(70,46,24,0.35)')
    // the steel socket and its rivets
    rod(ctx, [[134, 0], [157, 0]], 8.4, 0x7a8086, lv, 0.85)
    for (const x of [140, 149]) { softDot(ctx, x, 0, 1.1, 0.25, 'rgba(30,30,34,0.9)'); softDot(ctx, x + lv[0] * 0.4, lv[1] * 0.4, 0.45, 0.2, 'rgba(255,255,255,0.8)') }
    // the blade, a dish: its wall nearest the light in shade, the far wall catching it
    const x0 = 152, x1 = SHOVEL_LEN, half = 17, cx = SHOVEL_DISH
    const bl = bladeOutline(x0, x1, half)
    const bg = ctx.createLinearGradient(cx + lv[0] * 18, lv[1] * 18, cx - lv[0] * 18, -lv[1] * 18)
    bg.addColorStop(0, '#2a2e32'); bg.addColorStop(0.35, '#4c5258'); bg.addColorStop(0.7, '#7c848a'); bg.addColorStop(1, '#a8b0b6')
    trace(ctx, bl); ctx.fillStyle = bg; ctx.fill()
    ctx.save(); trace(ctx, bl); ctx.clip()
    const wg = ctx.createLinearGradient(x0, 0, x1, 0)   // bright steel toward the tip, scoured by the ground
    wg.addColorStop(0, 'rgba(210,216,222,0)'); wg.addColorStop(0.62, 'rgba(210,216,222,0.08)'); wg.addColorStop(0.92, 'rgba(226,232,238,0.5)'); wg.addColorStop(1, 'rgba(240,244,248,0.75)')
    ctx.fillStyle = wg; ctx.fillRect(x0, -half, x1 - x0, half * 2)
    for (let i = 0; i < 7; i++) softDot(ctx, x0 + 2 + rnd() * 14, (rnd() - 0.5) * 26, 1.5 + rnd() * 3, 1.6, `rgba(112,62,28,${0.25 + rnd() * 0.25})`)   // rust at the shoulders
    for (let i = 0; i < 5; i++) softDot(ctx, x0 + 8 + rnd() * 26, (rnd() - 0.5) * 20, 1 + rnd() * 2.4, 1, `rgba(58,38,22,${0.35 + rnd() * 0.3})`)   // soil caught in it
    ctx.lineCap = 'round'
    for (let i = 0; i < 46; i++) {   // scratches along the blade
      const x = x0 + 6 + rnd() * 34, y = (rnd() - 0.5) * 24, L = 2 + rnd() * 9, a = (rnd() - 0.5) * 0.35
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L)
      ctx.strokeStyle = rnd() < 0.7 ? `rgba(236,240,244,${0.2 + rnd() * 0.35})` : `rgba(20,22,26,${0.25 + rnd() * 0.3})`
      ctx.lineWidth = 0.18 + rnd() * 0.25; ctx.stroke()
    }
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.quadraticCurveTo(x0 + 14, 0.2, x0 + 22, 0.4)   // the rib pressed in from the socket
    ctx.strokeStyle = 'rgba(230,236,240,0.4)'; ctx.lineWidth = 1.4; ctx.stroke()
    ctx.restore()
    grain(ctx, bl, 0.4)
    // the rolled rim: black all round, bright where it faces the light
    ctx.save(); trace(ctx, bl); ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(20,22,26,0.9)'; ctx.stroke(); ctx.restore()
    ctx.save()
    const px = -lv[1], py = lv[0]
    ctx.beginPath(); ctx.moveTo(cx + px * 60, py * 60); ctx.lineTo(cx + px * 60 + lv[0] * 60, py * 60 + lv[1] * 60)
    ctx.lineTo(cx - px * 60 + lv[0] * 60, -py * 60 + lv[1] * 60); ctx.lineTo(cx - px * 60, -py * 60); ctx.closePath(); ctx.clip()
    trace(ctx, bl); ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(250,252,255,0.85)'; ctx.stroke(); ctx.restore()
    rod(ctx, [[x0, -half - 0.3], [x0, half + 0.3]], 2.6, 0x50565c, lv, 0.7)   // the tread
    specular(ctx, ellipsePts(x1 - 8 - lv[0] * 3, -lv[1] * 6, 3, 1.1, 0, 14), 0.75, 0.6)
  }, { shadowBlur: 2.2 })
}
// The load of soil the blade carries, lit in the world frame: render lays it on the dish unturned.
export function paintShovelLoad() {
  return bakeLocal(22, 2, (ctx) => {
    const rnd = rng(97)
    softDot(ctx, 0, 0.5, 13, 4, 'rgba(0,0,0,0.5)')
    for (let i = 0; i < 44; i++) {
      const u = rnd() * TAU, d = Math.sqrt(rnd())
      const x = Math.cos(u) * 15 * d * 0.85, y = Math.sin(u) * 12 * d * 0.85
      const r = (1 - d * 0.5) * (2.2 + rnd() * 3.4)
      lump(ctx, blobPts(rnd, x, y, r, 9, 0.6, 0.7 + rnd() * 0.3, rnd() * TAU), x, y, r, SHOVEL_SOILS[Math.floor(rnd() * SHOVEL_SOILS.length)], { gloss: rnd() < 0.3 ? 0.7 : 0, shadow: 0.6 })
    }
  }, { shadowBlur: 0.3 })
}
// One clod of freshly turned soil: wet, darker than the dry floor, a crumb or two stuck to it.
// Lit in the world frame, so render never turns it.
export function paintSoilClod(seed) {
  return bakeLocal(14, 3, (ctx) => {
    const rnd = rng(seed), r = 6.5
    const base = SHOVEL_SOILS[seed % SHOVEL_SOILS.length]
    const pts = blobPts(rnd, 0, 0, r, 11, 0.55, 0.72 + rnd() * 0.25, rnd() * TAU)
    const g = ctx.createLinearGradient(LX * r, LY * r, -LX * r, -LY * r)
    g.addColorStop(0, css(shadeC(base, 0.22))); g.addColorStop(0.4, css(shadeC(base, -0.2))); g.addColorStop(1, css(shadeC(base, -0.8)))
    smoothTrace(ctx, pts); ctx.fillStyle = g; ctx.fill()
    grain(ctx, pts, 0.1)
    innerShadow(ctx, pts, 1.2, 'rgba(0,0,0,0.6)', 0.8, 1)
    for (let i = 0; i < 4; i++) {
      const u = rnd() * TAU, d = rnd() * r * 0.6, x = Math.cos(u) * d, y = Math.sin(u) * d, cr = 0.9 + rnd() * 1.6
      lump(ctx, blobPts(rnd, x, y, cr, 8, 0.6), x, y, cr, SHOVEL_SOILS[Math.floor(rnd() * SHOVEL_SOILS.length)], { shadow: 0.5, gloss: rnd() < 0.5 ? 0.7 : 0 })
    }
    softDot(ctx, LX * r * 0.45, LY * r * 0.45, r * 0.12, r * 0.1, 'rgba(255,250,236,0.9)')   // the wet glint
  }, { shadowBlur: 1.6 })
}

// ==== HIT FEEDBACK (Topsoil) =====================================================================
// A puff of fine dry dust for the particle system: soft lobes and a few specks, painted near-white
// so each spawn's tint colours it, and kept faint so it never reaches the lens's halation threshold.
export function paintDustPuff() {
  return bakeLocal(22, 3, (ctx) => {
    const rnd = rng(3)
    for (let i = 0; i < 9; i++) {
      const a = rnd() * TAU, d = rnd() * 7, r = 4 + rnd() * 4
      softDot(ctx, Math.cos(a) * d, Math.sin(a) * d, r, 3.5, `rgba(255,255,255,${0.3 + rnd() * 0.18})`)
    }
    for (let i = 0; i < 26; i++) {
      const a = rnd() * TAU, d = rnd() * 11
      ctx.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.35})`
      ctx.fillRect(Math.cos(a) * d, Math.sin(a) * d, 0.6 + rnd() * 0.6, 0.6 + rnd() * 0.6)
    }
  }, { shadowBlur: 0.3 }).body
}
// One grain of soil, lit from the top-left, near-white so the tint colours it.
export function paintGrain() {
  return bakeLocal(4, 4, (ctx) => {
    const rnd = rng(11), pts = blobPts(rnd, 0, 0, 1.6, 7, 0.45, 0.8)
    withBlur(ctx, 0.5, 'rgba(0,0,0,0.6)', () => { ctx.save(); ctx.translate(0.5, 0.6); smoothTrace(ctx, pts); ctx.fill(); ctx.restore() })
    const g = ctx.createRadialGradient(-0.5, -0.5, 0, 0, 0, 2)
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#bdbdbd'); g.addColorStop(1, '#5a5a5a')
    smoothTrace(ctx, pts); ctx.fillStyle = g; ctx.fill()
  }, { shadowBlur: 0.2 }).body
}
// A struck body's flash twin: the body itself, brightened warm (screen) — a flash of light with the
// art still there, where the white silhouette would be a blown-out cut-out under the macro lens.
export function paintFlashTwin(body) {
  const w = body.width, h = body.height
  const out = makeCanvas(w, h), c = out.getContext('2d')
  c.drawImage(body, 0, 0)
  const sil = makeCanvas(w, h), s = sil.getContext('2d')
  s.drawImage(body, 0, 0)
  s.globalCompositeOperation = 'source-in'
  s.fillStyle = 'rgba(236,214,178,0.62)'
  s.fillRect(0, 0, w, h)
  c.globalCompositeOperation = 'screen'
  c.drawImage(sil, 0, 0)
  return out
}
