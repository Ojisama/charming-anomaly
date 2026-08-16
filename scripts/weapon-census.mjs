// Weapon census — what a weapon actually DOES over a real run, headless.
//
// Written for the v6.10 Burst Hydrant rework, where every intuition about the weapon turned out to
// be wrong and only measurement settled it. Keep it around: "is this weapon weak?" is a question
// this repo has answered by guessing at least twice, and been off every time.
//
// Boots real runs (createRun + stepSim, no Pixi) with ONE weapon equipped and all level-up offers
// refused, so the numbers are that weapon's and nothing else's. Reports per weapon:
//
//   raw dps      sum of 'hit' event dmg / s — the swing, INCLUDING overkill
//   eff dps      HP actually destroyed / s  — the honest clear rate
//   waste        1 - eff/raw: the fraction of the swing thrown away on already-dying enemies
//   kills/min    what the player experiences as clear speed
//   hits/s       tactile feedback rate — how often a number pops
//   dmg/hit      average swing size
//   dud          % of casts that dealt NO damage at all — "fired at nothing". eff dps cannot
//                separate "weak" from "regularly misses entirely", and the second is a bug wearing
//                the first one's clothes (see the cast-detection block below for the v7.23 case
//                this was added for). Read it as a ratio against the other rows, not an absolute:
//                every weapon fires on a timer that never asks whether anything is in reach, so a
//                healthy weapon still duds during quiet stretches (6-17% for the skies natives).
//
// and, for weapons that plant telegraphed zones (run.zones — the Burst Hydrant and the Reality
// Shard's tornSeam), a per-ZONE breakdown: how often a zone caught nothing across its ENTIRE life,
// and the peak crowd it held.
//
// Measure the zone over its life, not at the eruption instant. The instant-only version of this
// metric reported the v6.10 jet rework as barely an improvement (27.4% -> 26.1% "whiff") because it
// scored a jet that caught nobody at t=0 as a miss even when it soaked four enemies a second later.
// A persistent zone's whole point is that the instant does not matter, so a metric anchored to the
// instant cannot see the change. This walks run.zones directly and is purely geometric — no
// damage attribution, so it cannot be fooled by overkill or by a shared event type.
//
// TWO TRAPS, both of which produced confidently wrong readings while this was being written:
//
//  1. run.events MUST be drained every step (splice(0)), exactly as main.js does. Left undrained,
//     the backlog is recounted every frame and dps reads ~2800x high. The first version of this
//     script reported 1,180,510 dps for the Neon Beam and it looked plausible enough to keep going.
//  2. A 'hit' event's dmg is the RAW SWING, not HP removed. Measuring damage from events credits
//     overkill in full, which flatters exactly the weapons with the biggest per-hit numbers. Doing
//     that inverted the ranking of all three city weapons: the Burst Hydrant read as the chapter's
//     highest-damage weapon (531 raw) when it is in fact the lowest (383 effective, 28% wasted).
//     eff dps diffs enemy hp across the step instead, and credits the full remaining hp of anything
//     that vanished.
//
// Usage:
//   node scripts/weapon-census.mjs                                  # city natives, L1 and L5
//   node scripts/weapon-census.mjs --chapter city --level 5 --weapons burstHydrant,rainbow
//   node scripts/weapon-census.mjs --secs 120 --seeds 1001,2002 --mods launch=1,wideHydrant=3
//
// ponytail: seeds and duration are fixed inputs, not a convergence check — five 240s runs is
// enough to rank weapons but not to resolve a 3% balance difference. Raise --seeds if you need that.

import { createRun, ensureBookMeta, ensureChapterMeta } from '../src/state.js'
import { stepSim } from '../src/sim.js'
import { WEAPONS, CHAPTERS, bookOf, shopLines, BOOK_ORDER } from '../src/config.js'

const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 && argv[i + 1] != null ? argv[i + 1] : dflt
}

const CHAPTER = arg('chapter', 'city')
const SECS = Number(arg('secs', 240))
const DIFFICULTY = Number(arg('difficulty', 3))
const SEEDS = arg('seeds', '1001,2002,3003,4004,5005').split(',').map(Number)
const LEVELS = arg('level', null) ? [Number(arg('level'))] : [1, 5]
const WEAPON_IDS = arg('weapons', null)?.split(',') ?? CHAPTERS[CHAPTER]?.weapons ?? []
const MODS = Object.fromEntries((arg('mods', '') || '').split(',').filter(Boolean)
  .map((kv) => { const [k, v] = kv.split('='); return [k, Number(v)] }))

const DT = 1 / 60

// The suite's own generator (test/sim-test.js) — determinism without touching the real RNG shape.
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Hand-built meta, never through loadMeta, so it must go through the real book accessors —
// ensureBookMeta returns `meta` itself for book1 but a fresh meta.books[id] for every other book,
// and only shopLines(bookId) knows that book's own shop lines (Undertow's deepLungs/slowBurn/
// bigGulp). All zero here (no --shop flag on this probe), but built the honest way regardless.
const BOOK_ID = bookOf(CHAPTER) ?? BOOK_ORDER[0]
function makeMeta() {
  const meta = { coins: 0, shop: {}, best: { time: 0, kills: 0 }, runs: 0, chapters: {} }
  ensureChapterMeta(meta, CHAPTER)
  meta.chapters[CHAPTER].unlocked = true
  const bm = ensureBookMeta(meta, BOOK_ID)
  for (const id of Object.keys(shopLines(BOOK_ID))) bm.shop[id] = 0
  return meta
}

function census(id, level, seed) {
  Math.random = mulberry32(seed)
  const run = createRun(makeMeta(), { chapter: CHAPTER, difficulty: DIFFICULTY })
  // createRun(meta, opts) takes an OPTIONS OBJECT — a positional call silently gives body at d1.
  if (run.chapter !== CHAPTER) { console.error(`ABORT: asked for ${CHAPTER}, got ${run.chapter}`); process.exit(1) }
  // Survival is not what is being measured — a weapon that lets the player die scores its own
  // short run, which reads as "low output" for entirely the wrong reason. (The testVictory idiom.)
  run.player.maxHP = run.player.hp = 1e9
  run.weapons = [{ id, level }]
  if (Object.keys(MODS).length) run.weaponMods[id] = Object.assign(run.weaponMods[id] ?? {}, MODS)

  let raw = 0, eff = 0, hits = 0
  // Dud tracking (see the cast-detection block in the step loop below).
  const wid = id
  let casts = 0, duds = 0, windowEff = 0, prevTimer
  const before = new Map()
  const steps = Math.round(SECS / DT)
  // 'explode' is not a zone-weapon signal — the beam and the tornado emit it for their own bursts.
  // Only weapons that actually plant run.zones get the per-zone breakdown.
  let plantsZones = false
  let chargeSum = 0, chargeSteps = 0
  // Per-zone life tracking. Zones are plain objects with no id, so the object identity IS the key;
  // a WeakSet-style Map keyed on the object works because sim.js mutates zones in place and only
  // drops them when they are finished.
  const zoneLife = new Map()             // zone object -> { peak, everCaught }
  const finished = []                    // { peak, everCaught }, one per completed zone

  for (let i = 0; i < steps; i++) {
    // Refuse every offer: an auto-picked passive or element is power this weapon did not earn.
    if (run.phase === 'levelup') { run.phase = 'playing'; continue }
    if (run.phase !== 'playing') break

    before.clear()
    for (const e of run.enemies) before.set(e.id, e.hp)

    stepSim(run, { x: 0.4, y: 0.2 }, DT)
    // v7.x Book 2: a chapter resource AMPLIFIES the player's Pulse, so in a resource chapter the
    // numbers below are measured against some state of that bar. Reported so a reading is never
    // quoted without it — 0 everywhere else, since createRun leaves charge at 0 with no resource.
    chargeSum += run.charge; chargeSteps++
    if (run.zones.length > 0) plantsZones = true

    const after = new Map()
    for (const e of run.enemies) after.set(e.id, e.hp)
    let stepEff = 0
    for (const [eid, hp] of before) stepEff += Math.max(0, hp - (after.get(eid) ?? 0))
    eff += stepEff

    // DUD RATE: casts that dealt nothing at all. fireOnTimer ADDS the interval back after firing,
    // so the weapon's timer going UP is the cast signal — no per-weapon event vocabulary needed.
    // Damage is credited to the cast's whole window (cast -> next cast), which is what makes this
    // work for delayed weapons too: a lob lands mid-window, a breath burns across most of one.
    //
    // Why it exists: eff dps alone cannot tell "this weapon is weak" from "this weapon regularly
    // fires at nothing", and the second is a BUG wearing the first one's clothes. v7.23's Atomic
    // Breath gated its first target by the wrong radius and discharged into empty ground on a large
    // fraction of casts; every sim-test passed (they all placed an enemy where the weapon worked)
    // and the census reported a plausible dps, so it shipped and came back as "I don't think atomic
    // breath works correctly".
    // MEASURED, by reintroducing that bug on a scratch copy (skies L5, 120s): dud 13% -> 22% while
    // eff dps moved 46 -> 40. So this is a clearer signal than dps but NOT a klaxon — read it as a
    // RATIO against the other weapons in the same table, not against an absolute threshold. Some
    // duds are normal and irreducible: every weapon fires on a timer that does not ask whether
    // anything is in reach, so a quiet stretch is a dud by construction (the four skies natives sit
    // at 6-17% when healthy).
    const tNow = run.weaponTimers[wid]
    if (tNow !== undefined) {
      if (prevTimer !== undefined && tNow > prevTimer + 1e-9) {
        if (casts > 0 && windowEff <= 0) duds++
        casts++
        windowEff = 0
      }
      prevTimer = tNow
    }
    windowEff += stepEff

    for (const ev of run.events.splice(0)) {          // trap 1: main.js drains every frame
      if (ev.type === 'hit') { raw += ev.dmg; hits++ }
    }

    // Zone life: count the crowd standing in every LIVE zone (fuse burnt down, still open), and
    // retire the ones that vanished this step.
    const live = new Set()
    for (const g of run.zones) {
      live.add(g)
      if (!zoneLife.has(g)) {
        // First sight — record whether the mark was even planted ON anything. This separates "aimed
        // at empty street" from "the target died or left during the fuse", which are different bugs
        // with different fixes and look identical in the dry-zone total.
        let atPlant = 0
        const rSq0 = g.r * g.r
        for (const e of run.enemies) {
          if (e._dead) continue
          const dx = e.x - g.x, dy = e.y - g.y
          if (dx * dx + dy * dy <= rSq0) atPlant++
        }
        zoneLife.set(g, { peak: 0, everCaught: false, atPlant })
      }
      if (g.fuse > 0) continue
      const rec = zoneLife.get(g)
      let n = 0
      const rSq = g.r * g.r
      for (const e of run.enemies) {
        if (e._dead) continue
        const dx = e.x - g.x, dy = e.y - g.y
        if (dx * dx + dy * dy <= rSq) n++
      }
      if (n > rec.peak) rec.peak = n
      if (n > 0) rec.everCaught = true
      zoneLife.set(g, rec)
    }
    for (const [g, rec] of zoneLife) if (!live.has(g)) { finished.push(rec); zoneLife.delete(g) }
  }
  for (const rec of zoneLife.values()) finished.push(rec)   // still open when the run ended
  if (casts > 0 && windowEff <= 0) duds++   // the final cast's window closes at the run's end
  return { raw, eff, hits, casts, duds, zones: plantsZones ? finished : [], kills: run.kills, time: run.time,
           // run.chargeMax (Task 9 fix round), not CHAPTERS[CHAPTER].resource.max — this probe's own
           // shop levels are always 0 (see makeMeta above) so the two happen to agree today, but
           // reading the run's own field is what keeps that true if a --shop flag is ever added here.
           charge: chargeSum / Math.max(1, chargeSteps), chargeMax: run.chargeMax }
}

const pad = (s, n) => String(s).padStart(n)

console.log(`chapter ${CHAPTER} (book ${BOOK_ID}), difficulty ${DIFFICULTY}, ${SECS}s x ${SEEDS.length} seeds, one weapon equipped, all offers refused`)
if (CHAPTERS[CHAPTER]?.resource) {
  const res = CHAPTERS[CHAPTER].resource
  // v7.55 §5.3: Humidity (The Surf) is the first resource to declare a `damage` block, so its raw
  // and eff dps columns are not just "measured while the Pulse happened to be amplified" like every
  // other resource chapter — they are SCALED BY CHARGE, every step, via resourceDamageMul. Say so
  // explicitly, or a reader compares this table's dps against a non-resource chapter's and calls
  // the difference a weapon problem when it is the bar.
  const dmgNote = res.damage
    ? `DRIVES YOUR DAMAGE (floor ${res.damage.floor} at empty, 1.0 at full — owner ruling, see config.js's resourceDamageMul) and amplifies`
    : 'amplifies'
  console.log(`resource: ${res.name} — this chapter's bar ${dmgNote} the Pulse, so the 'charge' column below is the state every other number${res.damage ? ' (raw dps and eff dps especially)' : ''} was measured against`)
}
if (Object.keys(MODS).length) console.log(`mods: ${JSON.stringify(MODS)}`)

for (const level of LEVELS) {
  console.log(`\n--- level ${level} ---`)
  const hasRes = !!CHAPTERS[CHAPTER]?.resource
  console.log('  weapon           raw dps  eff dps  waste  kills/min  hits/s  dmg/hit  dud' + (hasRes ? '   charge' : ''))
  const zoneRows = []
  for (const id of WEAPON_IDS) {
    if (!WEAPONS[id]) { console.log(`  ${id}: no such weapon`); continue }
    let raw = 0, eff = 0, hits = 0, kills = 0, t = 0, casts = 0, duds = 0, chg = 0
    let caught = []
    for (const s of SEEDS) {
      const r = census(id, level, s)
      raw += r.raw; eff += r.eff; hits += r.hits; kills += r.kills; t += r.time
      casts += r.casts; duds += r.duds; chg += r.charge
      caught = caught.concat(r.zones)
    }
    console.log('  ' + WEAPONS[id].name.padEnd(16) + pad(Math.round(raw / t), 7) + pad(Math.round(eff / t), 9) +
      pad(Math.round(100 * (1 - eff / Math.max(1, raw))) + '%', 7) + pad((kills / t * 60).toFixed(1), 11) +
      pad((hits / t).toFixed(1), 8) + pad((raw / Math.max(1, hits)).toFixed(1), 9) +
      pad(casts ? Math.round(100 * duds / casts) + '%' : '-', 5) +
      (hasRes ? pad((chg / SEEDS.length).toFixed(0), 9) : ''))
    if (caught.length) zoneRows.push([WEAPONS[id].name, caught])
  }
  for (const [name, zones] of zoneRows) {
    const dry = zones.filter((z) => !z.everCaught)
    const thin = zones.filter((z) => z.everCaught && z.peak <= 1).length
    const avgPeak = zones.reduce((a, z) => a + z.peak, 0) / zones.length
    const dryEmpty = dry.filter((z) => z.atPlant === 0).length   // aimed at empty street
    const dryLost = dry.length - dryEmpty                        // target died or left during the fuse
    console.log(`\n  ${name} zones: ${zones.length} planted   never caught anything ${pad((100 * dry.length / zones.length).toFixed(1), 5)}%   ` +
      `peak<=1 ${pad((100 * thin / zones.length).toFixed(1), 5)}%   avg peak crowd ${avgPeak.toFixed(2)}`)
    console.log(`  ${' '.repeat(name.length)}        of those dry: ${pad((100 * dryEmpty / Math.max(1, dry.length)).toFixed(1), 5)}% planted on empty ground, ` +
      `${pad((100 * dryLost / Math.max(1, dry.length)).toFixed(1), 5)}% lost the target during the fuse`)
  }
}
