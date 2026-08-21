// Does Downwash's PLUNGE actually fire? Owner from play, 2026-08-21: the water column's "dive"
// mod does nothing.
//
// Plunge is a TRIGGER on a column that would otherwise burst on a timer, so "does it work" is not
// a dps question and eff dps cannot answer it — the burst happens either way, the mod only decides
// WHEN. This counts the trigger directly, and reports how far from the player each column lands
// (the second half of the same complaint: "water columns trigger too far away from the player").
//
// ⚠ SAMPLE THE COLUMN BEFORE stepSim, NEVER AFTER. A triggered column is removed inside the same
// step that arms it, so a probe reading run.holes after the step never observes a single armed
// frame — the first cut of this file reported "reached the threshold while armed: 0.9%" when the
// true answer is ~100%, and the tell was in its own output (peak crowd 8 at any time, 0 while
// armed, for a threshold of 4). Anything whose lifetime can end inside one step has to be measured
// on the way in.
//
// Immortal + stationary rig: the question is what the weapon does, not whether you survive it.
// 300s because WAVE_TABLE gates tanks at t=140 and the crowd this mod needs only exists late.

import { createRun, ensureBookMeta, ensureChapterMeta } from '../src/state.js'
import { stepSim } from '../src/sim.js'
import { CHAPTERS, bookOf, shopLines, BOOK_ORDER, DOWNWASH_PLUNGE_N, DOWNWASH_PLUNGE_FRAC, DOWNWASH_PLUNGE_ARM } from '../src/config.js'

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d }
const CHAPTER = arg('chapter', 'shelf')
const LEVEL = Number(arg('level', 5))
const SECS = Number(arg('secs', 300))
const SEEDS = arg('seeds', '1001,2002,3003').split(',').map(Number)
const PLUNGE = Number(arg('plunge', 1))   // 0 = the do-nothing control: same rig, mod off
const DT = 1 / 60

if (!Number.isFinite(LEVEL) || !Number.isFinite(SECS) || !Number.isFinite(PLUNGE) || SEEDS.some((s) => !Number.isFinite(s))) {
  console.error('ABORT: --level/--secs/--seeds/--plunge must be numbers'); process.exit(1)
}

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BOOK_ID = bookOf(CHAPTER) ?? BOOK_ORDER[0]
function makeMeta() {
  const meta = { coins: 0, shop: {}, best: { time: 0, kills: 0 }, runs: 0, chapters: {} }
  ensureChapterMeta(meta, CHAPTER)
  meta.chapters[CHAPTER].unlocked = true
  const bm = ensureBookMeta(meta, BOOK_ID)
  for (const id of Object.keys(shopLines(BOOK_ID))) bm.shop[id] = 0
  return meta
}

function probe(seed) {
  Math.random = mulberry32(seed)
  const run = createRun(makeMeta(), { chapter: CHAPTER, difficulty: 3 })
  if (run.chapter !== CHAPTER) { console.error(`ABORT: asked for ${CHAPTER}, got ${run.chapter}`); process.exit(1) }
  run.player.maxHP = run.player.hp = 1e9
  run.weapons = [{ id: 'downwash', level: LEVEL }]
  if (PLUNGE) run.weaponMods.downwash = { ...(run.weaponMods.downwash ?? {}), plunge: 1 }

  // Keyed on object identity: sim mutates holes in place and only drops them when finished, so the
  // object IS the id (a column carries none).
  const live = new Map()
  const done = []
  const steps = Math.round(SECS / DT)
  let bursts = 0

  for (let i = 0; i < steps; i++) {
    if (run.phase === 'levelup') { run.phase = 'playing'; continue }
    if (run.phase !== 'playing') break

    // BEFORE the step — see the warning at the top of this file.
    const seen = new Set()
    for (const h of run.holes) {
      if (h.look !== 'downwash') continue
      seen.add(h)
      let rec = live.get(h)
      if (!rec) {
        rec = { dist: Math.hypot(h.x - run.player.x, h.y - run.player.y), peakArmed: 0, endedAt: 0, dur: h.duration }
        live.set(h, rec)
      }
      const pSq = (h.radius * DOWNWASH_PLUNGE_FRAC) ** 2
      let inside = 0
      for (const e of run.enemies) {
        if (e._dead) continue
        const dx = h.x - e.x, dy = h.y - e.y
        if (dx * dx + dy * dy <= pSq) inside++
      }
      const elapsed = h.duration - h.life
      if (elapsed >= h.duration * DOWNWASH_PLUNGE_ARM) rec.peakArmed = Math.max(rec.peakArmed, inside)
      rec.endedAt = elapsed
    }
    for (const [h, rec] of live) { if (!seen.has(h)) { done.push(rec); live.delete(h) } }

    stepSim(run, { x: 0, y: 0 }, DT)
    for (const ev of run.events) if (ev.type === 'explode') bursts++
    run.events.splice(0)
  }
  for (const rec of live.values()) done.push(rec)
  return { done, bursts }
}

const all = []
let bursts = 0
for (const s of SEEDS) { const r = probe(s); all.push(...r.done); bursts += r.bursts }
if (all.length < 10) { console.error(`ABORT: only ${all.length} columns observed — nothing to measure`); process.exit(1) }

const med = (xs) => { const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)] }
// A column whose last observed frame is short of its full pour was RETIRED EARLY, which for a
// downwash means exactly one thing: the trigger fired.
const early = all.filter((r) => r.endedAt < r.dur - 2 * DT).length

console.log(`chapter=${CHAPTER} (${CHAPTERS[CHAPTER].name})  level=${LEVEL}  ${SECS}s x ${SEEDS.length} seeds  plunge=${PLUNGE}`)
console.log(`PLUNGE_N=${DOWNWASH_PLUNGE_N} FRAC=${DOWNWASH_PLUNGE_FRAC} ARM=${DOWNWASH_PLUNGE_ARM}`)
console.log(`columns: ${all.length}   bursts (explode events): ${bursts}   bursts/column ${(bursts / all.length).toFixed(2)}`)
console.log(`retired BEFORE their full pour: ${early}/${all.length} (${(100 * early / all.length).toFixed(1)}%)`)
console.log(`pour actually served — median ${med(all.map((r) => r.endedAt)).toFixed(2)}s of ${med(all.map((r) => r.dur)).toFixed(2)}s`)
console.log(`peak crowd in the core while armed — median ${med(all.map((r) => r.peakArmed))}, max ${Math.max(...all.map((r) => r.peakArmed))}`)
console.log(`landing distance from the player — median ${med(all.map((r) => r.dist)).toFixed(0)}px, max ${Math.max(...all.map((r) => r.dist)).toFixed(0)}px`)
