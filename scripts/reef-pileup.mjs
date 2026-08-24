// WHERE DO LIVE REEF ENEMIES SIT RELATIVE TO THE PLAYER, and how many are permanently out of reach?
//
// ⚠ THIS EXISTS BECAUSE reef-astern.mjs ANSWERS A DIFFERENT QUESTION AND READS LIKE THIS ONE.
// That rig measures the share of DAMAGE DEALT that landed astern, and reported 91.2% for Squid Ink
// — which sounds like the rear is covered. It cannot see the pathology: a body that is never
// reached deals and takes nothing, so it contributes to NEITHER side of that ratio. The chapter can
// be 100% astern-covered by that metric while a tail of enemies streams away behind the player
// forever. Damage share is the wrong denominator; LIVE BODIES BY POSITION is the right one.
//
// The reef is an x-lane, player advancing +x at laneScroll px/s. "Astern" is enemy.x < player.x.
// The viewport is the other half of the answer: at LANE_CAMERA_FRAC the player sits 80% of the way
// across, so only (1-0.8) x viewWidth of world is visible behind them. Anything further astern than
// that is off-screen — the player cannot see it, shoot it, or know it is there.
import { createRun, ensureBookMeta, ensureChapterMeta } from '../src/state.js'
import { stepSim } from '../src/sim.js'
import { CHAPTERS, bookOf, shopLines, ENEMIES, ARCHETYPE_TYPE, speedCreepMul, laneScrollFor, LANE_CAMERA_FRAC } from '../src/config.js'

const DT = 1 / 60, SECS = 300
const SEEDS = [1001, 2002, 3003]
const PHONE_W = 390, PHONE_H = 844                       // the viewport this game ships to
const BEHIND_PX = (1 - LANE_CAMERA_FRAC) * PHONE_W   // world px of lane visible astern

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeMeta() {
  const meta = { coins: 0, shop: {}, best: { time: 0, kills: 0 }, runs: 0, chapters: {} }
  ensureChapterMeta(meta, 'reef')
  meta.chapters.reef.unlocked = true
  const bm = ensureBookMeta(meta, bookOf('reef'))
  for (const id of Object.keys(shopLines(bookOf('reef')))) bm.shop[id] = 0
  return meta
}

const ch = CHAPTERS.reef
const scroll = laneScrollFor(ch)
console.log(`reef, d3, ${SECS}s x ${SEEDS.length} seeds, starter-only, immortal player, stick {0.4,0.2}`)
console.log(`  scroll ${scroll}px/s   visible astern ${BEHIND_PX.toFixed(0)}px (${PHONE_W}px phone, LANE_CAMERA_FRAC ${LANE_CAMERA_FRAC})`)
console.log(`  roster closing speed vs the player's own ${scroll}px/s advance:`)
// ARCHETYPE_TYPE, not the roster's own word: a roster entry says normal/fast/tank and ENEMIES is
// keyed drone/wisp/tank, so indexing ENEMIES by e.archetype misses two rows of three and prints a
// 'skipped' line that reads like a roster problem rather than a lookup bug in this file.
for (const e of ch.roster) {
  const base = ENEMIES[ARCHETYPE_TYPE[e.archetype]]?.speed
  if (base == null) { console.log(`    ${e.id}: archetype ${e.archetype} not in ARCHETYPE_TYPE — skipped`); continue }
  const px = base * (e.speedMul ?? 1)
  const late = px * speedCreepMul(SECS)
  const verdict = px <= scroll ? 'CANNOT EVER CATCH UP' : `closes at ${(px - scroll).toFixed(0)}px/s`
  console.log(`    ${e.id.padEnd(11)} ${px.toFixed(0).padStart(4)}px/s (${late.toFixed(0)} at ${SECS}s)   ${verdict}`)
}

let sumAhead = 0, sumAsternSeen = 0, sumAsternGone = 0, samples = 0
const byId = new Map()   // rosterId -> [ahead, asternSeen, asternGone]
const ages = []
for (const seed of SEEDS) {
  Math.random = mulberry32(seed)
  const run = createRun(makeMeta(), { chapter: 'reef', difficulty: 3 })
  run.player.maxHP = run.player.hp = 1e9
  // THE PROBE MUST HOLD THE SHIPPING VIEWPORT. createRun defaults viewW/viewH to a 960x720 desk,
  // and main.js is what normally overwrites them each frame -- headless, nothing does. The cull
  // this rig measures is viewport-relative, so leaving the default measures a screen nobody has.
  run.viewW = PHONE_W / 2
  run.viewH = PHONE_H / 2
  run.viewRadius = Math.hypot(PHONE_W, PHONE_H) / 2
  const born = new Map()
  for (let i = 0; i < Math.round(SECS / DT); i++) {
    if (run.phase === 'levelup') { run.phase = 'playing'; continue }
    if (run.phase !== 'playing') break
    stepSim(run, { x: 0.4, y: 0.2 }, DT)
    run.events.splice(0)
    for (const e of run.enemies) if (!born.has(e)) born.set(e, run.time)
    if (i % 60 !== 0) continue                       // sample once a second
    samples++
    for (const e of run.enemies) {
      if (e._dead) continue
      const d = e.x - run.player.x                   // >0 ahead, <0 astern
      const id = e.rosterId ?? '?'
      let row = byId.get(id)
      if (!row) byId.set(id, row = [0, 0, 0])
      if (d >= 0) { sumAhead++; row[0]++ }
      else if (-d <= BEHIND_PX) { sumAsternSeen++; row[1]++ }
      else { sumAsternGone++; row[2]++ }
    }
  }
  // How long has the crowd that is off-screen-astern at the end been alive?
  for (const e of run.enemies) {
    if (e._dead) continue
    if (run.player.x - e.x > BEHIND_PX) ages.push(run.time - (born.get(e) ?? 0))
  }
}

const per = (n) => (n / samples).toFixed(1)
const tot = sumAhead + sumAsternSeen + sumAsternGone
console.log(`\nLIVE BODIES per second-sample (${samples} samples across ${SEEDS.length} seeds):`)
console.log(`  ahead of you        ${per(sumAhead).padStart(6)}   ${(100 * sumAhead / tot).toFixed(1)}%`)
console.log(`  astern, ON SCREEN   ${per(sumAsternSeen).padStart(6)}   ${(100 * sumAsternSeen / tot).toFixed(1)}%`)
console.log(`  astern, OFF SCREEN  ${per(sumAsternGone).padStart(6)}   ${(100 * sumAsternGone / tot).toFixed(1)}%  <- unreachable and invisible`)
console.log('\n  WHO IS IN THE PILE (share of each creature\'s own live-body samples):')
for (const [id, row] of [...byId].sort((x, y) => (y[1][0] + y[1][1] + y[1][2]) - (x[1][0] + x[1][1] + x[1][2]))) {
  const [a, s1, s2] = row
  const n = a + s1 + s2
  console.log(`    ${id.padEnd(11)} n=${String(n).padStart(6)}  ahead ${(100 * a / n).toFixed(1).padStart(5)}%  astern-seen ${(100 * s1 / n).toFixed(1).padStart(5)}%  astern-gone ${(100 * s2 / n).toFixed(1).padStart(5)}%`)
}
ages.sort((a, b) => a - b)
if (ages.length) {
  const med = ages[Math.floor(ages.length / 2)]
  console.log(`\n  ${ages.length} bodies were off-screen-astern at t=${SECS}s; median age ${med.toFixed(0)}s, oldest ${ages[ages.length - 1].toFixed(0)}s`)
} else {
  console.log('\n  no bodies off-screen-astern at the end')
}
