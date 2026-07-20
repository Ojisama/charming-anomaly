// Obstacle footprint contrast audit.
//
// Model (per the brief): the "effective floor" a player sees is the average floor-BLOTCH colour
// (render.js T.blotches) multiplied by the chapter floorTint, composited over bgColor. The blotch
// layer covers the whole ground at ~mean-alpha coverage; big/mid/detail props sit on top but the
// blotch is what a bare patch reads as, so it is the honest background for the obstacle. The
// obstacle's silhouette-defining element is the HARD RIM of the footprint ring: the `foot` colour
// (× floorTint) composited over the effective floor at the rim's baked alpha (0.94).
//
// WCAG relative luminance + contrast ratio. Target >= 2x for the rim in every biome.

const srgb = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const ratio = (a, b) => { const la = lum(a), lb = lum(b); const hi = Math.max(la, lb), lo = Math.min(la, lb); return (hi + 0.05) / (lo + 0.05) }
const hex = (n) => [n >> 16 & 255, n >> 8 & 255, n & 255]
const mul = (a, b) => [a[0] * b[0] / 255, a[1] * b[1] / 255, a[2] * b[2] / 255]
const over = (fg, bg, a) => [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)]

// render.js T.blotches base colours (pre-tint) and their centre alphas.
const BLOTCHES = [[207, 216, 174, 0.55], [233, 222, 196, 0.6], [196, 214, 189, 0.45], [238, 215, 197, 0.4]]
// Effective floor: mean blotch colour × floorTint, composited over bgColor at mean blotch coverage.
const meanBlotch = [0, 1, 2].map((k) => BLOTCHES.reduce((s, b) => s + b[k], 0) / BLOTCHES.length)
const meanCover = BLOTCHES.reduce((s, b) => s + b[3], 0) / BLOTCHES.length // ~0.5 typical single-blotch coverage

function effFloor(bgColor, floorTint) {
  const tinted = mul(meanBlotch, hex(floorTint))
  return over(tinted, hex(bgColor), meanCover)
}

// Per chapter: bgColor + floorTint (config.js) and the obstacle style foot colour (render.js BIOMES).
const RIM_ALPHA = 1.00 // baked footprint rim alpha (fully opaque hard contract line)
const CHAP = [
  { id: 'pond',        bg: 0x2e6258, tint: 0x66c2a9, foot: 0x243617 },
  { id: 'garden',      bg: 0x4e8240, tint: 0xaad066, foot: 0x243617 },
  { id: 'undergrowth', bg: 0x2b2417, tint: 0x8a7a4e, foot: 0xffffff },
  { id: 'city',        bg: 0x2c2f38, tint: 0x9aa0ac, foot: 0x161a20 },
  { id: 'skies',       bg: 0x2a3240, tint: 0x717c88, foot: 0x38332b },
  { id: 'beyond',      bg: 0x120a26, tint: 0x6a5fa0, foot: 0xffffff },
]

console.log('biome         floorL   rimL    ratio  dir')
for (const c of CHAP) {
  const floor = effFloor(c.bg, c.tint)
  const rim = over(mul(hex(c.foot), hex(c.tint)), floor, RIM_ALPHA)
  const r = ratio(rim, floor)
  const dir = lum(rim) < lum(floor) ? 'dark-on-light' : 'light-on-dark'
  console.log(`${c.id.padEnd(13)} ${lum(floor).toFixed(3).padStart(5)}   ${lum(rim).toFixed(3).padStart(5)}   ${r.toFixed(2)}x  ${dir}`)
}
