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

import { createRun } from '../src/state.js'
import { stepSim } from '../src/sim.js'
import { SHOP, WEAPONS, CHAPTERS } from '../src/config.js'

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

function makeMeta() {
  return {
    coins: 0,
    shop: Object.fromEntries(Object.keys(SHOP).map((id) => [id, 0])),
    best: { time: 0, kills: 0 },
    runs: 0,
  }
}

function census(id, level, seed) {
  Math.random = mulberry32(seed)
  const run = createRun(makeMeta(), { chapter: CHAPTER, difficulty: DIFFICULTY })
  // Survival is not what is being measured — a weapon that lets the player die scores its own
  // short run, which reads as "low output" for entirely the wrong reason. (The testVictory idiom.)
  run.player.maxHP = run.player.hp = 1e9
  run.weapons = [{ id, level }]
  if (Object.keys(MODS).length) run.weaponMods[id] = Object.assign(run.weaponMods[id] ?? {}, MODS)

  let raw = 0, eff = 0, hits = 0
  const before = new Map()
  const steps = Math.round(SECS / DT)
  // 'explode' is not a zone-weapon signal — the beam and the tornado emit it for their own bursts.
  // Only weapons that actually plant run.zones get the per-zone breakdown.
  let plantsZones = false
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
    if (run.zones.length > 0) plantsZones = true

    const after = new Map()
    for (const e of run.enemies) after.set(e.id, e.hp)
    for (const [eid, hp] of before) eff += Math.max(0, hp - (after.get(eid) ?? 0))

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
  return { raw, eff, hits, zones: plantsZones ? finished : [], kills: run.kills, time: run.time }
}

const pad = (s, n) => String(s).padStart(n)

console.log(`chapter ${CHAPTER}, difficulty ${DIFFICULTY}, ${SECS}s x ${SEEDS.length} seeds, one weapon equipped, all offers refused`)
if (Object.keys(MODS).length) console.log(`mods: ${JSON.stringify(MODS)}`)

for (const level of LEVELS) {
  console.log(`\n--- level ${level} ---`)
  console.log('  weapon           raw dps  eff dps  waste  kills/min  hits/s  dmg/hit')
  const zoneRows = []
  for (const id of WEAPON_IDS) {
    if (!WEAPONS[id]) { console.log(`  ${id}: no such weapon`); continue }
    let raw = 0, eff = 0, hits = 0, kills = 0, t = 0
    let caught = []
    for (const s of SEEDS) {
      const r = census(id, level, s)
      raw += r.raw; eff += r.eff; hits += r.hits; kills += r.kills; t += r.time
      caught = caught.concat(r.zones)
    }
    console.log('  ' + WEAPONS[id].name.padEnd(16) + pad(Math.round(raw / t), 7) + pad(Math.round(eff / t), 9) +
      pad(Math.round(100 * (1 - eff / Math.max(1, raw))) + '%', 7) + pad((kills / t * 60).toFixed(1), 11) +
      pad((hits / t).toFixed(1), 8) + pad((raw / Math.max(1, hits)).toFixed(1), 9))
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
