// The Ophan's depth gauge art: the owner-picked C3 poster (gauge-variants-2, "Blend: painted 3D poster"), an inverted
// cone cut through the earth. Units are the gauge's css px; row k (the tap target of world k) spans ROW(k)..ROW(k)+BH.
// The painted layers are Canvas2D, drawn ONCE into one canvas per layer (so a broken layer greys by css alone); the
// outline, leaders, state marks and captions are the SVG gaugeSvg() returns. DOM only: ui.js imports this, sim never.
export const GX = 10, GY = 56, BH = 44, STEP = 46, SPAN = 274, END = GY + SPAN, CAP_X = GX + 24, CARD_X = GX + 57
const ROW = (i) => GY + STEP * i, YC = (i) => ROW(i) + BH / 2
const TB = (k) => (k === 0 ? 0 : k === 6 ? 1 : (ROW(k) - 1 - GY) / SPAN)   // boundary k as a fraction of depth
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

// ---------- painters: fill bbox b={x,y,w,h} with speckled paint plus a hint of the layer's world ----------
function blobs(c, b, cols, n, r, smax) { for (let i = 0; i < n; i++) { c.fillStyle = cols[i % cols.length]; c.globalAlpha = 0.45; c.beginPath(); c.ellipse(b.x + r() * b.w, b.y + r() * b.h, 1 + r() * smax, 0.8 + r() * smax * 0.6, r() * 3, 0, 7); c.fill() } c.globalAlpha = 1 }
function speck(c, b, col, n, r, s = 0.9) { c.fillStyle = col; for (let i = 0; i < n; i++) c.fillRect(b.x + r() * b.w, b.y + r() * b.h, s, s) }
const PAINT = [
  // SOIL: roots and pebbles
  (c, b) => { const r = rng(11); c.fillStyle = '#8b5a33'; c.fillRect(b.x, b.y, b.w, b.h); blobs(c, b, ['#a87344', '#6a4226'], 22, r, 4); speck(c, b, '#3a2213', 140, r); speck(c, b, '#d1a674', 40, r)
    c.strokeStyle = '#ecd6ac'; c.lineWidth = 0.7; c.lineCap = 'round'; for (let k = 0; k < 3; k++) { let x = b.x + b.w * (0.2 + 0.3 * k), y = b.y + 6; c.beginPath(); c.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (r() - 0.5) * 9; y += b.h / 6; c.lineTo(x, y); if (j === 1) { c.moveTo(x, y); c.lineTo(x + 5, y + 3); c.moveTo(x, y) } } c.stroke() }
    for (let k = 0; k < 3; k++) { const x = b.x + 8 + r() * (b.w - 16), y = b.y + 12 + r() * (b.h - 18); c.fillStyle = '#a19c94'; c.strokeStyle = '#3a2a1c'; c.lineWidth = 0.5; c.beginPath(); c.ellipse(x, y, 2.2, 1.6, 0, 0, 7); c.fill(); c.stroke() } },
  // GEOD: crystal facets
  (c, b) => { const r = rng(5); c.fillStyle = '#7663c6'; c.fillRect(b.x, b.y, b.w, b.h); blobs(c, b, ['#9a88e6', '#5a48a6'], 16, r, 4); speck(c, b, '#d8d0ff', 50, r)
    for (let k = 0; k < 6; k++) { const x = b.x + r() * b.w, y = b.y + 6 + r() * (b.h - 8), s = 4 + r() * 6; c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 0.6, y); c.lineTo(x, y + s * 0.7); c.lineTo(x - s * 0.6, y); c.closePath(); c.fillStyle = 'hsla(' + (k * 67 + 190) % 360 + ',90%,72%,.55)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 0.5; c.stroke(); c.beginPath(); c.moveTo(x, y - s); c.lineTo(x, y + s * 0.7); c.stroke() }
    const g = c.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h); ['#ff5ad8', '#5ad8ff', '#8aff6a'].forEach((k, i) => g.addColorStop(i / 2, k)); c.globalAlpha = 0.18; c.fillStyle = g; c.fillRect(b.x, b.y, b.w, b.h); c.globalAlpha = 1 },
  // MINE: amber glyph specks
  (c, b) => { const r = rng(3); c.fillStyle = '#4a3310'; c.fillRect(b.x, b.y, b.w, b.h); blobs(c, b, ['#6a4a18', '#2e1f08'], 18, r, 4); speck(c, b, '#1c1206', 80, r)
    c.font = 'bold 5px monospace'; c.textBaseline = 'middle'; c.textAlign = 'center'; const ch = '+:#*%'; for (let y = b.y + 4; y < b.y + b.h; y += 6) for (let x = b.x + 3; x < b.x + b.w; x += 5) { const v = r(); if (v < 0.45) continue; c.fillStyle = v > 0.85 ? '#ffe08a' : '#e8a83a'; c.fillText(ch[(v * 31 | 0) % 5], x, y) } c.textAlign = 'left' },
  // MAGMA: pixel-step blocks
  (c, b) => { const r = rng(9), s = 3; c.fillStyle = '#ef5f1a'; c.fillRect(b.x, b.y, b.w, b.h); const bl = []; for (let k = 0; k < 6; k++) bl.push([b.x + r() * b.w, b.y + r() * b.h, 4 + r() * 6])
    const x0 = Math.floor(b.x / s) * s, y0 = Math.floor(b.y / s) * s; for (let y = y0; y < b.y + b.h; y += s) for (let x = x0; x < b.x + b.w; x += s) { let m = 0; for (const [bx, by, br] of bl) m = Math.max(m, 1 - Math.hypot(x + 1.5 - bx, y + 1.5 - by) / br)
      const k = m > 0.55 ? '#ffe36a' : m > 0.25 ? '#ffa22a' : m > 0 ? '#c8380e' : (r() < 0.06 ? '#a8260a' : null); if (k) { c.fillStyle = k; c.fillRect(x, y, s, s) } } },
  // MANTL: a toon ink line
  (c, b) => { const r = rng(7); c.fillStyle = '#d8452a'; c.fillRect(b.x, b.y, b.w, b.h); blobs(c, b, ['#e8603a', '#b8361e'], 14, r, 4)
    c.fillStyle = '#93281a'; c.beginPath(); c.moveTo(b.x, b.y + b.h * 0.62); c.bezierCurveTo(b.x + b.w * 0.3, b.y + b.h * 0.48, b.x + b.w * 0.6, b.y + b.h * 0.8, b.x + b.w, b.y + b.h * 0.58); c.lineTo(b.x + b.w, b.y + b.h); c.lineTo(b.x, b.y + b.h); c.fill()
    c.strokeStyle = '#1a0805'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(b.x, b.y + b.h * 0.62); c.bezierCurveTo(b.x + b.w * 0.3, b.y + b.h * 0.48, b.x + b.w * 0.6, b.y + b.h * 0.8, b.x + b.w, b.y + b.h * 0.58); c.stroke()
    c.fillStyle = '#f6a07a'; c.beginPath(); c.ellipse(b.x + b.w * 0.36, b.y + b.h * 0.36, b.w * 0.09, 1.6, -0.25, 0, 7); c.fill() },
  // CORE: molten-metal chrome
  (c, b) => { const g = c.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h); g.addColorStop(0, '#59606a'); g.addColorStop(0.45, '#c9d0d9'); g.addColorStop(1, '#3a3f47'); c.fillStyle = g; c.fillRect(b.x, b.y, b.w, b.h)
    const cx = b.x + b.w * 0.42, cy = b.y + b.h * 0.45, rg = c.createRadialGradient(cx, cy, 0, cx, cy, b.w * 0.35); rg.addColorStop(0, 'rgba(255,255,255,.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = rg; c.fillRect(b.x, b.y, b.w, b.h)
    c.lineCap = 'round'; c.shadowColor = '#ffb0ee'; c.shadowBlur = 4; c.strokeStyle = '#fff3fb'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(b.x + b.w * 0.2, b.y + b.h * 0.2); c.bezierCurveTo(b.x + b.w * 0.7, b.y + b.h * 0.35, b.x + b.w * 0.25, b.y + b.h * 0.6, b.x + b.w * 0.55, b.y + b.h * 0.95); c.stroke(); c.shadowBlur = 0 },
]

// ---------- cone geometry, as SVG path data (the canvas clips with new Path2D(d)) ----------
const n2 = (v) => +v.toFixed(2)
function pathD() {
  let d = ''
  return {
    moveTo: (x, y) => { d += 'M' + n2(x) + ' ' + n2(y) },
    lineTo: (x, y) => { d += 'L' + n2(x) + ' ' + n2(y) },
    quadraticCurveTo: (cx, cy, x, y) => { d += 'Q' + n2(cx) + ' ' + n2(cy) + ' ' + n2(x) + ' ' + n2(y) },
    closePath: () => { d += 'Z' },
    get d() { return d },
  }
}
// F front-left edge, G the ridge between the front and the darker side face, R the right edge: each t -> [x, y]
function buildCone(F, G, R, bowK) {
  const arc = (p, a, b, dir) => { const w = Math.hypot(b[0] - a[0], b[1] - a[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 2 * bowK * w]; if (dir) p.quadraticCurveTo(m[0], m[1], b[0], b[1]); else p.quadraticCurveTo(m[0], m[1], a[0], a[1]) }
  const layers = []
  for (let i = 0; i < 6; i++) {
    const t0 = TB(i), t1 = TB(i + 1), p = pathD()
    p.moveTo(...F(t0)); arc(p, F(t0), G(t0), 1); p.lineTo(...R(t0))
    for (let t = t0; t < t1; t += 0.01) p.lineTo(...R(t))
    p.lineTo(...R(t1))
    if (i < 5) { p.lineTo(...G(t1)); p.lineTo(...G(t1)); arc(p, F(t1), G(t1), 0) }
    for (let t = t1; t > t0; t -= 0.01) p.lineTo(...F(t))
    p.closePath()
    const pts = [F(t0), R(t0), G(t0), F(t1), R(t1)], xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
    layers.push({ d: p.d, b: { x: Math.min(...xs) - 2, y: Math.min(...ys) - 14, w: Math.max(...xs) - Math.min(...xs) + 4, h: Math.max(...ys) - Math.min(...ys) + 16 } })
  }
  const side = pathD(); side.moveTo(...G(0)); side.lineTo(...R(0)); for (let t = 0; t <= 1; t += 0.01) side.lineTo(...R(t)); for (let t = 1; t >= 0; t -= 0.01) side.lineTo(...G(t)); side.closePath()
  const outline = pathD(); outline.moveTo(...F(0)); arc(outline, F(0), G(0), 1); outline.lineTo(...R(0)); for (let t = 0; t <= 1; t += 0.01) outline.lineTo(...R(t)); for (let t = 1; t >= 0; t -= 0.01) outline.lineTo(...F(t)); outline.closePath()
  const top = pathD(); top.moveTo(...F(0)); arc(top, F(0), G(0), 1)
  return { layers, side: side.d, outline: outline.d, top: top.d }
}
const A = [GX + 24, END], Ft = [GX, GY], Gt = [GX + 38, GY + 4], Rt = [GX + 50, GY - 2]
const ease = (t) => 1 - Math.pow(1 - t, 0.55)
const Fy = (t) => [lerp(Ft, A, ease(t))[0], GY + SPAN * t], Gy = (t) => [lerp(Gt, A, ease(t))[0], GY + 4 * (1 - t) + SPAN * t], Ry = (t) => [lerp(Rt, A, ease(t))[0], GY - 2 * (1 - t) + SPAN * t]
const K = buildCone(Fy, Gy, Ry, 0.11)
const rx = (i) => Ry((YC(i) - GY) / SPAN)[0]
// where row k's card centre sits inside its button (CORE's card rides higher, clear of the tip)
export const cardY = (i) => BH / 2 + (i === 5 ? -5 : 1)

// ---------- the static SVG: per-layer clip, leader, and the three marks css shows on a state class ----------
export function gaugeSvg() {
  const defs = K.layers.map((L, i) => `<clipPath id="ophan-clip-${i}"><path d="${L.d}"/></clipPath>`).join('')
  const layers = K.layers.map((L, i) => {
    const y = ROW(i) + cardY(i), x = rx(i) - 3
    return `<g class="ophan-layer">`
      + `<g class="ophan-lead"><path d="M${n2(x)} ${y}H${CARD_X}" stroke="#f3ead6" stroke-width=".7"/><circle cx="${n2(x)}" cy="${y}" r="1" fill="#f3ead6"/></g>`
      + `<path class="ophan-m-cur" d="${L.d}" clip-path="url(#ophan-clip-${i})" fill="none" stroke="#fff" stroke-width="6"/>`
      + `<path class="ophan-m-next" d="${L.d}" clip-path="url(#ophan-clip-${i})" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="3.5 2.5"/>`
      + `<path class="ophan-m-next" d="${L.d}" fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="3 2.5"/>`
      + `<circle class="ophan-m-worn" cx="${n2(rx(i) + 4)}" cy="${YC(i) + 10}" r="3" fill="#fff" stroke="#000"/>`
      + `</g>`
  }).join('')
  return `<defs>${defs}</defs><path d="${K.outline}" fill="none" stroke="#1a0d06" stroke-width="2.4" stroke-linejoin="round"/>${layers}`
}

// ---------- the painted canvases, filled once: canvases[0] is the surface cap, canvases[1 + k] layer k ----------
function pine(c, x, y, s) { c.fillStyle = '#5a3a1e'; c.fillRect(x - 0.6 * s, y - 2 * s, 1.2 * s, 2.5 * s); c.fillStyle = '#1f6b33'; c.strokeStyle = '#0d2e16'; c.lineWidth = 0.5; for (let k = 0; k < 3; k++) { const yy = y - 2 * s - k * 2.6 * s, w = (4 - k) * 1.4 * s; c.beginPath(); c.moveTo(x - w, yy); c.lineTo(x, yy - 4 * s); c.lineTo(x + w, yy); c.closePath(); c.fill(); c.stroke() } }
function mountain(c, x, y, w, h) { c.fillStyle = '#5d6066'; c.strokeStyle = '#1e1f22'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x - w * 0.1, y - h); c.lineTo(x + w / 2, y); c.closePath(); c.fill(); c.stroke()
  c.fillStyle = '#8c9097'; c.beginPath(); c.moveTo(x - w * 0.1, y - h); c.lineTo(x + w * 0.06, y - h * 0.55); c.lineTo(x - w * 0.05, y - h * 0.5); c.lineTo(x - w * 0.25, y - h * 0.55); c.closePath(); c.fill() }
// grey mountains, a green and a blue strip hugging the top arc, pines
function surface(c, cx, half) {
  c.lineCap = 'butt'
  const strip = (dy, col, lw) => { c.save(); c.translate(0, dy); c.strokeStyle = col; c.lineWidth = lw; c.stroke(new Path2D(K.top)); c.restore() }
  mountain(c, cx - 6, GY - 9, 30, 20); mountain(c, cx + 9, GY - 8, 22, 14)
  strip(-1.6, '#2f8fd8', 2.2); strip(-4, '#3f9a2e', 3)
  pine(c, cx - half + 6, GY - 3, 0.95); pine(c, cx + half - 6, GY - 3, 0.95); pine(c, cx + half - 12, GY - 6, 0.75)
}
// size a canvas to box b (css px) at the device ratio and hand back a context in gauge units
function fit(cv, b) {
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  cv.width = Math.ceil(b.w * dpr); cv.height = Math.ceil(b.h * dpr)
  Object.assign(cv.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' })
  const c = cv.getContext('2d'); c.scale(dpr, dpr); c.translate(-b.x, -b.y); return c
}
export function paintGauge(canvases) {
  surface(fit(canvases[0], { x: 0, y: 20, w: 70, h: GY + 6 - 20 }), GX + 22, 24)
  const side = new Path2D(K.side)
  K.layers.forEach((L, i) => {
    const b = L.b, p = new Path2D(L.d), c = fit(canvases[1 + i], { x: Math.floor(b.x - 2), y: Math.floor(b.y - 2), w: Math.ceil(b.w + 4), h: Math.ceil(b.h + 4) })
    c.save(); c.clip(p); PAINT[i](c, b); c.clip(side); c.fillStyle = 'rgba(0,0,0,.32)'; c.fillRect(b.x, b.y, b.w, b.h); c.restore()
    c.strokeStyle = '#1a0d06'; c.lineWidth = i === 4 ? 1.7 : 1; c.lineJoin = 'round'; c.stroke(p)
  })
}
