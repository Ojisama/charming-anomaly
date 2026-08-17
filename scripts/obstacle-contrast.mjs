import { CHAPTERS } from '../src/config.js'
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
// `bg` and `tint` are READ FROM config.js, not transcribed. They used to be hand-copied here, and
// the table's own comment named the trap without escaping it: "this table mirrors config.js and
// render.js rather than importing them, so a chapter added there is INVISIBLE here until someone
// adds it." It then went stale exactly that way — the row for `shelf` still carried the palette of
// a chapter that had moved to another slot under another name, so the audit measured a floor no
// chapter had and reported it as fact (2026-08-17).
//
// `foot` genuinely lives in render.js's BIOMES and is not importable from here, so it stays a
// transcription — but a chapter with no entry now FAILS LOUDLY below rather than vanishing.
const FOOT = {
  garden: 0x243617, pond: 0x243617, shelf: 0x122029, surf: 0x3d3324, reef: 0x1c0a1a,
  trawl: 0x0d161f, deep: 0x070c12,
  // The Twilight is ALIASED to BIOME_SHELF's prop family (render.js), so it shares its foot.
  twilight: 0x122029,
  // District chapters: the value their obstacle style resolves to on the district the audit reads.
  undergrowth: 0xffffff, city: 0x161a20, skies: 0x38332b, beyond: 0xffffff,
}
// Chapters with no obstacle footprint at all, so there is nothing for this audit to measure. Listed
// rather than filtered silently: "absent because it has no footprints" and "absent because someone
// forgot" have to be different outcomes, which is the whole lesson of the stale row above.
const NO_FOOTPRINT = new Set(['body', 'blank'])

const ALL = Object.keys(CHAPTERS)
const CHAP = ALL
  .filter((id) => !NO_FOOTPRINT.has(id))
  .map((id) => ({ id, bg: CHAPTERS[id].render?.bgColor, tint: CHAPTERS[id].render?.floorTint, foot: FOOT[id] }))

// PRINT THE DENOMINATOR, and abort rather than quietly skipping. A chapter missing from FOOT used to
// be a chapter that simply did not appear in the output; now it names itself, because "the audit
// printed a clean table" and "the audit covered every chapter" are otherwise the same screenful.
const missing = CHAP.filter((c) => c.foot === undefined || c.bg === undefined || c.tint === undefined).map((c) => c.id)
if (missing.length) {
  console.error(`ABORT: nothing to measure for ${missing.join(', ')} — add a foot colour above (render.js BIOMES.<id>.obstacle.foot), or list it in NO_FOOTPRINT with a reason`)
  process.exit(1)
}
console.log(`${CHAP.length} of ${ALL.length} chapters measured (${[...NO_FOOTPRINT].join(', ')} have no obstacle footprint)\n`)

console.log('biome         floorL   rimL    ratio  dir')
for (const c of CHAP) {
  const floor = effFloor(c.bg, c.tint)
  const rim = over(mul(hex(c.foot), hex(c.tint)), floor, RIM_ALPHA)
  const r = ratio(rim, floor)
  const dir = lum(rim) < lum(floor) ? 'dark-on-light' : 'light-on-dark'
  console.log(`${c.id.padEnd(13)} ${lum(floor).toFixed(3).padStart(5)}   ${lum(rim).toFixed(3).padStart(5)}   ${r.toFixed(2)}x  ${dir}`)
}
