// THE BREAK, the Mine (ascii): the broken skin comes apart in this world's own medium while the next skin shows under it.
// Owner ruling 2026-10-25: 0.12 s hit-stop (the sim's), then 0.8 s; the looks below are the playground's candidates.
// The broken skin is read once into a grid of cells (cellsOf: its painter drawn into a real canvas, averaged per cell),
// and each cell becomes one character, picked by its brightness on the classic ramp and typed in the skin's own inks:
// what scatters or pours IS the skin, typed. Glyphs are baked once per (character, ink) and drawn with drawImage.
import { stage, win, hash } from '../staging.js'

const FONT = '"DejaVu Sans Mono", Menlo, Consolas, "Courier New", monospace'
// the skin's inks (painters/ascii.js TONES, bone, gild, the talons' red) and the characters for their brightness
const INK = [[104, 76, 50], [160, 116, 76], [196, 146, 96], [220, 198, 160], [255, 240, 200], [255, 120, 84]]
const RAMP = '.:-=+*#%@'
const css = (c) => 'rgb(' + c.join(',') + ')'
const glyphs = new Map()
function glyph(ch, ink) {
  const key = ch + ink
  let c = glyphs.get(key)
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 32
    const g = c.getContext('2d'); g.font = 'bold 28px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = css(INK[ink]); g.fillText(ch, 16, 17)
    glyphs.set(key, c)
  }
  return c
}
for (const ch of RAMP) for (let i = 0; i < INK.length; i++) glyph(ch, i)   // all baked at load: none is ever made in a frame

// the broken skin as cells of pitch p (stage px), read ONCE per skin, phase, size and pitch: its painter draws the boss
// into a real canvas (the px2d contract minus begin()), and each cell keeps its alpha-weighted colour. Cells with no body
// in them are dropped. Each { i, j, ox, oy (from the boss's centre), r, g, b, a, l (luma 0..1) }
const reads = new Map()
export function cellsOf(k, pitch) {
  const ph = Math.round(k.ph0 ?? k.ph), key = k.from.id + ':' + ph + ':' + Math.round(k.R) + ':' + Math.round(pitch * 100)
  let L = reads.get(key)
  if (L) return L
  const Q = 2, W = Math.ceil(k.R * 3), cv = document.createElement('canvas'); cv.width = cv.height = W * Q
  const g = cv.getContext('2d', { willReadFrequently: true })
  g.begin = () => g.setTransform(Q, 0, 0, Q, 0, 0)
  k.drawBoss(k.from, g, W / 2, W / 2, k.R, ph)
  const d = g.getImageData(0, 0, W * Q, W * Q).data, n = Math.floor(W / pitch), o = (W - n * pitch) / 2, cp = pitch * Q
  L = []
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let r = 0, gg = 0, b = 0, a = 0, N = 0
    const x0 = Math.floor(o * Q + i * cp), y0 = Math.floor(o * Q + j * cp)
    for (let y = y0; y < y0 + cp; y++) for (let x = x0; x < x0 + cp; x++) {
      const q = (y * W * Q + x) * 4, al = d[q + 3] / 255
      r += d[q] * al; gg += d[q + 1] * al; b += d[q + 2] * al; a += al; N++
    }
    if (a / N < 0.18) continue
    r /= a; gg /= a; b /= a
    L.push({ i, j, ox: o + (i + 0.5) * pitch - W / 2, oy: o + (j + 0.5) * pitch - W / 2, r, g: gg, b, a: a / N, l: (0.3 * r + 0.59 * gg + 0.11 * b) / 255 })
  }
  reads.set(key, L)
  return L
}
// a cell's character and ink: brightness picks both, red stays the talons' red
const typeOf = (q) => {
  const ch = RAMP[Math.min(RAMP.length - 1, Math.floor(Math.pow(q.l, 0.8) * RAMP.length * q.a + 0.5))]
  const ink = q.r > 180 && q.g < 140 ? 5 : Math.min(4, 1 + Math.floor(q.l * 5))
  return [ch, ink]
}
// the next skin is never touched (k.boss): it stands whole behind the text from the first frame
// the broken skin whole for its first instant (u < b), fading as its characters take over
const whole = (k, b) => { const a = 1 - win(k.u, 0, b); if (a > 0) { k.fadePx(2, a, 1, k.x, k.y); k.drawBoss(k.from, k.px(2), k.x, k.y, k.R, Math.round(k.ph0 ?? k.ph)) } }
const put = (c, ch, ink, x, y, sz, al) => { if (al <= 0.01) return; c.globalAlpha = Math.min(1, al); c.drawImage(glyph(ch, ink), x - sz / 2, y - sz / 2, sz, sz) }

stage('break', 'ascii:A', { world: 'ascii', label: 'A · glyph scatter: the skin bursts into its characters', draw(k) {
  const u = k.u, c = k.px(1), P = k.R * 0.11
  whole(k, 0.08)
  // the text jolts as the hit lands (0-0.06), then every character flies out from the centre, slowing, dimming a step of
  // ink as it goes, and is gone by 0.95; the far ones leave first so the shape tears from its rim
  for (const q of cellsOf(k, P)) {
    const h1 = hash(q.i, q.j), h2 = hash(q.j + 31, q.i + 7), d = Math.hypot(q.ox, q.oy) || 1, rim = Math.min(1, d / (k.R * 1.3))
    const t0 = 0.04 + 0.1 * (1 - rim) + 0.05 * h1, go = 1 - Math.pow(1 - win(u, t0, 0.8), 2.6)
    const a = Math.atan2(q.oy, q.ox) + (h2 - 0.5) * 0.7, fly = k.R * (0.3 + 0.75 * h2 + 0.3 * rim) * go
    const jolt = (1 - win(u, 0, 0.06)) * k.R * 0.03
    let [ch, ink] = typeOf(q)
    // a step down the inks as it slows; a few throw sparks of gild early
    if (go > 0.7 && ink < 5) ink = Math.max(0, ink - 1 - (go > 0.9 ? 1 : 0))
    if (go > 0.02 && go < 0.45 && h1 > 0.7) ink = 4
    const al = (0.35 + 0.65 * q.a) * win(u, 0, 0.04) * (1 - win(u, 0.5 + 0.3 * h1, 0.95))
    put(c, ch, ink, k.x + q.ox + Math.cos(a) * fly + (h2 - 0.5) * jolt, k.y + q.oy + Math.sin(a) * fly, P * 1.6, al)
  }
  c.globalAlpha = 1
} })

stage('break', 'ascii:B', { world: 'ascii', label: 'B · glyph rain: the skin pours down in columns and piles', draw(k) {
  const u = k.u, c = k.px(1), P = k.R * 0.11, L = cellsOf(k, P)
  whole(k, 0.06)
  const n = Math.ceil(k.R * 3 / P)
  for (const q of L) {
    // a column lets go at its own moment, its bottom character first, so it unzips upward like pouring text
    const t0 = 0.03 + 0.28 * hash(q.i, 11) + 0.01 * (n - q.j), f = win(u, t0, t0 + 0.2 + 0.08 * hash(q.i, q.j))
    const drop = f * f
    // it lands in a pile on the floor at the boss's feet (a plan view: it also shrinks as it drops away from the camera)
    const land = Math.max(0, k.R * (0.75 + 0.55 * hash(q.i, q.j + 3)) - q.oy)
    const x = k.x + q.ox + (hash(q.j, q.i) - 0.5) * k.R * 0.6 * drop, y = k.y + q.oy + land * drop
    let [ch, ink] = typeOf(q)
    const falling = f > 0 && f < 1
    if (falling) ink = Math.min(4, ink + 1)
    else if (f >= 1) ink = Math.max(0, ink - 2)
    const al = (0.35 + 0.65 * q.a) * win(u, 0, 0.04) * (1 - win(u, Math.min(0.88, t0 + 0.4 + 0.15 * hash(q.i, q.j + 1)), 0.97))
    put(c, ch, ink, x, y, P * 1.6 * (1 - 0.25 * drop), al)
    // the rain's trail: two dimmer characters streaming behind a falling one
    if (falling && f > 0.15) {
      const ch2 = RAMP[Math.floor(hash(q.i, q.j + 9 + Math.floor(f * 4)) * RAMP.length)]
      put(c, ch2, 3, x, y - P * 1.1, P * 1.2, al * 0.55 * (1 - f))
      put(c, ch2, 1, x, y - P * 2.2, P * 1.1, al * 0.3 * (1 - f))
    }
  }
  c.globalAlpha = 1
} })
