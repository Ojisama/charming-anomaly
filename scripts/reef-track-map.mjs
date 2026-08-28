// THE WHOLE TRACK, SEEN FROM ABOVE — the Reef circuit's shape, at a scale no gameplay shot reaches.
//
//   node scripts/reef-track-map.mjs [out.png] [--seed N] [--px 900] [--spec '<json patch>']
//
// A gameplay screenshot of The Reef shows about a fifth of one corner. Every question worth asking
// about a circuit — is it a roundabout or a track, does it turn both ways, are there straights —
// only exists at the scale of a whole lap, which is what this draws. It is the reef's answer to
// /terrain-preview.html: the GENERATOR alone, no Pixi, no app boot.
//
// IT RASTERISES BY ASKING THE COLLIDER. Every pixel is put through the same ringFU -> caveAt the
// player is stopped against, so the picture cannot disagree with the wall. It is not a redrawing of
// the track, it is the track.
//
// --spec overrides CHAPTERS.reef.cave with a JSON patch, so a candidate shape is a command line
// rather than a source edit — the same reason the circuit knobs live on the chapter object.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { CHAPTERS, PLAYER, caveAt, ringXY, ringFU, swimthroughsFor } from '../src/config.js'

const argv = process.argv.slice(2)
const flag = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1] }
const out = argv[0] && !argv[0].startsWith('--') ? argv[0] : '/tmp/reef-track.png'
const seed = Number(flag('--seed', 0))
const PX = Number(flag('--px', 900))
const patch = flag('--spec', null)
if (!Number.isFinite(PX) || PX < 64) { console.error('--px must be a number >= 64'); process.exit(1) }
if (!Number.isFinite(seed)) { console.error('--seed must be a number'); process.exit(1) }

const spec = { ...CHAPTERS.reef.cave, ...(patch ? JSON.parse(patch) : {}) }
if (!spec.ring?.r0) { console.error('cave spec has no ring.r0 — nothing to draw'); process.exit(1) }

// The world box the track occupies, read from the TRACK and not from r0: the wobble is what decides
// it, and a box drawn from r0 clips exactly the hairpins this exists to show.
let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
for (let i = 0; i < 4000; i++) {
  const f = (i / 4000) * spec.lapLen
  const cav = caveAt(f, spec, seed)
  for (const u of [cav.c - cav.hw, cav.c + cav.hw]) {
    const w = ringXY(spec, f, u)
    x0 = Math.min(x0, w.x); x1 = Math.max(x1, w.x); y0 = Math.min(y0, w.y); y1 = Math.max(y1, w.y)
  }
}
const pad = 60
x0 -= pad; x1 += pad; y0 -= pad; y1 += pad
const scale = PX / Math.max(x1 - x0, y1 - y0)
const W = Math.round((x1 - x0) * scale), H = Math.round((y1 - y0) * scale)

// --- the raster ---------------------------------------------------------------------------------
const buf = Buffer.alloc(W * H * 3)
const put = (px, py, r, g, b) => {
  if (px < 0 || py < 0 || px >= W || py >= H) return
  const i = (py * W + px) * 3
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b
}
for (let py = 0; py < H; py++) {
  const wy = y0 + (py + 0.5) / scale
  for (let px = 0; px < W; px++) {
    const wx = x0 + (px + 0.5) / scale
    const fu = ringFU(spec, wx, wy)
    const cav = caveAt(fu.f, spec, seed)
    const a = Math.abs(fu.u - cav.c)
    if (a > cav.hw) put(px, py, 26, 42, 52)                     // coral
    else if (cav.ph > 0 && a < cav.ph) put(px, py, 108, 66, 78) // the island that forks the passage
    else put(px, py, 70, 150, 168)                              // open water
  }
}
// The centreline, the start line and the six checkpoints, over the top.
const dot = (wx, wy, r, g, b, rad = 2) => {
  const px = Math.round((wx - x0) * scale), py = Math.round((wy - y0) * scale)
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) put(px + dx, py + dy, r, g, b)
}
for (let i = 0; i < 6000; i++) {
  const f = (i / 6000) * spec.lapLen
  const w = ringXY(spec, f, caveAt(f, spec, seed).c)
  dot(w.x, w.y, 250, 244, 214, 0)
}
for (const st of swimthroughsFor(spec, seed)) {
  const cav = caveAt(st.f, spec, seed)
  for (let k = -20; k <= 20; k++) dot(ringXY(spec, st.f, cav.c + (k / 20) * cav.hw).x, ringXY(spec, st.f, cav.c + (k / 20) * cav.hw).y, 143, 242, 221, 1)
}
{
  const cav = caveAt(0, spec, seed)
  for (let k = -20; k <= 20; k++) {
    const w = ringXY(spec, 0, cav.c + (k / 20) * cav.hw)
    dot(w.x, w.y, 255, 92, 92, 2)
  }
}

// --- PNG, by hand: one IDAT of filter-0 scanlines. No dependency, and none needed. ---------------
let TBL = null
function crc32(b) {
  if (!TBL) {
    TBL = new Int32Array(256)
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TBL[n] = c }
  }
  let c = -1
  for (let i = 0; i < b.length; i++) c = TBL[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return c ^ -1
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}
const raw = Buffer.alloc(H * (W * 3 + 1))
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0
  buf.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3)
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2
writeFileSync(out, Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]))

// --- and the numbers the picture cannot give you -------------------------------------------------
// CURVATURE IS THE WHOLE QUESTION AND IT IS SIGNED. A roundabout holds one sign for the entire lap;
// a circuit changes it. Measured on the CENTRELINE in world space by three-point circumcircle, so it
// needs no polar algebra and stays honest if the map ever stops being polar.
const N = 2000
const pts = []
for (let i = 0; i < N; i++) {
  const f = (i / N) * spec.lapLen
  pts.push(ringXY(spec, f, caveAt(f, spec, seed).c))
}
// COUNTER-TURN, THE ONE NUMBER THAT SEPARATES A CIRCUIT FROM A ROUNDABOUT WITH KINKS IN IT.
// A closed loop's NET turning is always exactly 2pi, whatever its shape — so the total turning
// `sum |dtheta|` is 2pi plus twice whatever was turned the other way and undone. That gives
//     counterTurn = (sum|dtheta| - 2pi) / 2   radians a lap
// A perfect circle scores 0 by construction, and unlike a share-of-samples count it cannot be
// inflated by short high-frequency wobble: a kink that turns 2 degrees the wrong way contributes
// 2 degrees, while a hairpin's counter-curve contributes the whole corner. The shipped roundabout
// scored 25% of samples "turning the other way" and only 0.5 rad of counter-turn — which is why
// the share was the wrong metric and read as a pass.
let arc = 0, flips = 0, prev = 0, tight = 0, minR = Infinity, other = 0, totalTurn = 0
for (let i = 0; i < N; i++) {
  const a = pts[(i - 1 + N) % N], b = pts[i], c = pts[(i + 1) % N]
  arc += Math.hypot(b.x - a.x, b.y - a.y)
  const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
  const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)
  totalTurn += Math.abs(Math.atan2(cross, dot))
  const A = Math.hypot(b.x - a.x, b.y - a.y), B = Math.hypot(c.x - b.x, c.y - b.y), C = Math.hypot(c.x - a.x, c.y - a.y)
  const r = Math.abs(cross) < 1e-9 ? Infinity : (A * B * C) / (2 * Math.abs(cross))
  minR = Math.min(minR, r)
  if (r < 420) tight++
  const s = Math.sign(cross)
  if (s < 0) other++
  if (s !== 0 && prev !== 0 && s !== prev) flips++
  if (s !== 0) prev = s
}
const counterTurn = (totalTurn - 2 * Math.PI) / 2
// CLEARANCE IS NOT hw, AND ON A WOBBLING RING THE TWO DIVERGE BY A LOT. `hw` is measured RADIALLY,
// so wherever the track runs steeply across the radii the real gap the player has to fit through is
// hw x cos(that angle) — and at a hairpin the inner edge can fold past itself entirely while hw
// still reads 200. This is the number that says whether a shape is drivable: the smallest distance
// from a point on the racing line to the nearest coral, anywhere.
const M = 1200
const edge = []
for (let i = 0; i < M; i++) {
  const f = (i / M) * spec.lapLen
  const cav = caveAt(f, spec, seed)
  edge.push(ringXY(spec, f, cav.c - cav.hw), ringXY(spec, f, cav.c + cav.hw))
}
// WALL TO WALL, ISLANDS EXCLUDED. The forks carry their own constraint (branch.frac keeps every
// branch the same SHARE of its passage, and run RS.f pins it against the air pockets). Folding them
// in here reports the island TIP as a 3px corridor on EVERY shape, the shipped one included — that
// is a property of where a naive racing line jumps sides, not of the track.
const line = pts
let minClear = Infinity, minClearF = 0, tightClear = 0
for (let i = 0; i < N; i++) {
  const p = line[i]
  let d = Infinity
  for (const q of edge) d = Math.min(d, Math.hypot(q.x - p.x, q.y - p.y))
  if (d < minClear) { minClear = d; minClearF = (i / N) * spec.lapLen }
  if (d < 90) tightClear++
}

console.log(`reef track map -> ${out}  ${W}x${H}px, seed ${seed}`)
console.log(`  lapLen ${spec.lapLen} of f  |  real centreline arc ${arc.toFixed(0)}px  |  r0 ${spec.ring.r0}  wander ${spec.wander}  hw ${spec.halfMin}-${spec.halfMax}`)
console.log(`  COUNTER-TURN ${counterTurn.toFixed(2)} rad/lap = ${(counterTurn * 180 / Math.PI).toFixed(0)}deg of turning the OTHER way (a circle scores 0)`)
console.log(`  direction changes ${flips}/lap  |  ${((other / N) * 100).toFixed(0)}% of samples turn the other way (inflated by kinks — read the line above instead)`)
console.log(`  tightest corner radius ${minR.toFixed(0)}px  |  ${((tight / N) * 100).toFixed(0)}% of the lap under a 420px radius`)
console.log(`  CLEARANCE off the line: tightest ${minClear.toFixed(0)}px at f=${minClearF.toFixed(0)}  |  ${((tightClear / N) * 100).toFixed(0)}% of the lap under 90px (player radius ${PLAYER.radius})`)
console.log(`  checkpoints at f: ${swimthroughsFor(spec, seed).map((s) => s.f.toFixed(0)).join(' ')}`)
