// scratch — delete before reporting. The one number in WEAPONS.squidInk's block that no shipped
// rig measures: what SHARE of each reef native's damage lands ASTERN of the player. Re-derived
// because the Oxygen Tank's radius ladder moved (a bigger blast reaches further back past its own
// throw point), and that block quotes the tank by name.
//
// Same shape as weapon-census's inner loop, minus everything it measures: one weapon, offers
// refused, player immortal, events drained every step. A 'hit' event carries the struck body's
// position, and the lane's forward axis is +x here, so "astern" is ev.x < player.x.
import { createRun, ensureBookMeta, ensureChapterMeta } from '../src/state.js'
import { stepSim } from '../src/sim.js'
import { CHAPTERS, bookOf, shopLines } from '../src/config.js'

const DT = 1 / 60, SECS = 180, LEVEL = Number(process.argv[2] ?? 5)
const SEEDS = [1001, 2002, 3003]

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// weapon-census.mjs's makeMeta verbatim: hand-built and never through loadMeta, so it goes through
// the real book accessors (ensureBookMeta returns a fresh meta.books[id] for every book but book1).
function makeMeta() {
  const meta = { coins: 0, shop: {}, best: { time: 0, kills: 0 }, runs: 0, chapters: {} }
  ensureChapterMeta(meta, 'reef')
  meta.chapters.reef.unlocked = true
  const bm = ensureBookMeta(meta, bookOf('reef'))
  for (const id of Object.keys(shopLines(bookOf('reef')))) bm.shop[id] = 0
  return meta
}

const out = []
// quillBurst is the CONTROL, not a native: it is the omnidirectional ring this pool dropped, and
// the card round 1's objection named as the answer to the chapter's rear. Measured in the same
// invocation so the comparison is not across two of them.
const IDS = [...CHAPTERS.reef.weapons, 'quillBurst']
for (const id of IDS) {
  let astern = 0, total = 0
  for (const seed of SEEDS) {
    Math.random = mulberry32(seed)
    const run = createRun(makeMeta(), { chapter: 'reef', difficulty: 3 })
    run.player.maxHP = run.player.hp = 1e9
    run.weapons = [{ id, level: LEVEL }]
    for (let i = 0; i < Math.round(SECS / DT); i++) {
      if (run.phase === 'levelup') { run.phase = 'playing'; continue }
      if (run.phase !== 'playing') break
      stepSim(run, { x: 0.4, y: 0.2 }, DT)
      for (const ev of run.events.splice(0)) {
        if (ev.type !== 'hit' || !(ev.dmg > 0)) continue
        total += ev.dmg
        if (ev.x < run.player.x) astern += ev.dmg
      }
    }
  }
  out.push(`${id} ${(100 * astern / (total || 1)).toFixed(1)}%`)
}
console.log(`L${LEVEL}, reef, ${SECS}s x ${SEEDS.length} seeds, d3, share of damage landing astern:`)
console.log('  ' + out.join(' | ') + `  (denominator: ${CHAPTERS.reef.weapons.length} of ${CHAPTERS.reef.weapons.length} reef natives)`)
