// The Deep's roster, six seeds, 300s (Task 8 Step 3, spec 2026-09-09-deep-twilight-merge §7b/R2.1).
// Six seeded 300s Deep runs, immortal + kiting, printing per seed: kills by roster id, the xp those
// kills actually carried, damage taken by source, and split children spawned. Read the SPREAD, not
// any one seed — two seeds lie (designing-an-enemy: the Shelf's own six-seed level came back
// [7, 11, 6, 11, 12, 11]).
//
// LEVEL-UPS ARE ACCEPTED (first offer, always — charge-probe.mjs's idiom, not weapon-census.mjs's
// "refuse everything"), and this is a deliberate departure from the brief's literal skeleton, which
// refused every offer. Refusing pins the player on an unleveled Glint (L1: 12 dmg/0.55s) for the
// whole 300s, and under that build the tank NEVER DIES: 0 siphonophore kills across all 6 seeds,
// 0 split children, ever. A rig that cannot see its own subject die even once cannot answer Step
// 3's split-tax question at all — that is CLAUDE.md's rig-selection trap ("ask whether the RIG's
// own geometry moved when the knob did") wearing a different hat: here it is the RIG's own POWER
// LEVEL, not its geometry, that hides the mechanic. Accepting offers is what charge-probe.mjs does
// for the identical reason ("a real run takes cards ... far more than a starter-only one ever
// would"), and it is what lets the siphonophore/gulper actually get killed often enough to read.
//
// KILLS/XP ARE READ OFF run.enemies DIRECTLY, NOT OFF THE 'kill' EVENT. state.js's event doc
// (~line 731) and sim.js:7447 push {type:'kill', x, y, elite, etype} — etype is an ARCHETYPE_TYPE
// ('normal'/'fast'/'tank'), not a rosterId, and it carries no xp at all. Every enemy DOES carry
// e.rosterId and e.xp (sim.js's spawnEnemy/spawnSplitChildren), fixed at spawn and never mutated
// afterwards (xp, unlike hp/dmg, is not hpScale'd — see CHAPTERS.deep's roster comment and
// sim.js:2404), so a before/after existence diff of run.enemies both IDENTIFIES a kill and reads
// its real xp off the object dealDamage would otherwise have pushed onto a gem
// (sim.js:7459, `enemy.xp * (enemy.elite ? ELITE.xpMul : 1)`, matched here).
//
// THE ONLY REMOVAL FROM run.enemies IS dealDamage's `_dead` filter (sim.js:8112), but not every
// `_dead = true` is a kill — several sites despawn a body silently (no xp, no gem): the lane
// sweep/leak, the Trawl turtle's drop radius, the Reef's ring-drop, the Trawl orca's bite, and a
// Submission ally's expiry. Four of those five are gated on a mechanic The Deep does not have
// (`lane`/`circuit`/`trawl` signatures) and cannot fire here regardless of rig. The fifth,
// Submission, CAN: this probe accepts every first offer, so an accepted Submission anomaly later
// turning a loan ally's expiry into a silent (no-xp) despawn is reachable, and it fired once in the
// baseline arm's 6 seeds (1 of 1278 total removals, seed 55) — rare enough that it does not move any
// reported share, but it is not a zero. An existence diff still reads every OTHER removal here as a
// kill correctly; it needed no sim.js change, since run.enemies already carries every field this asks
// for.
//
// --srcDir <path> (CLAUDE.md's A/B idiom: "extract the old tree ... take a src path as argv"):
// point every import at an extracted tree instead of the live src/, for the split-tax comparison
// against the pre-merge roster. `git archive cdd29a7 src | tar -x -C /tmp/base` first (cdd29a7 is
// the last commit before any code change — spec only — so its src/ still has the old gulper), then
// `node scripts/deep-roster-probe.mjs --srcDir /tmp/base/src`. Dynamic import() because a static
// one is fixed at parse time and cannot be redirected by an argv flag.
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const argSrc = process.argv.includes('--srcDir') ? process.argv[process.argv.indexOf('--srcDir') + 1] : null
const SRC = argSrc ? path.resolve(argSrc) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const toUrl = (f) => pathToFileURL(path.join(SRC, f)).href
const { createRun, ensureChapterMeta } = await import(toUrl('state.js'))
const { stepSim, applyChoice } = await import(toUrl('sim.js'))
const { ELITE } = await import(toUrl('config.js'))

// The suite's own generator (test/sim-test.js) — determinism without touching the real RNG shape.
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const SEEDS = [11, 22, 33, 44, 55, 66]
const DT = 1 / 60
const DURATION = 300

console.log(`src=${SRC}`)
for (const seed of SEEDS) {
  Math.random = mulberry32(seed)
  // Hand-built meta, never through loadMeta (probing-the-game: a probe meta must UNLOCK the
  // chapter or ensureChapterMeta/resolveChapterId fall back to a wrong one).
  const meta = { coins: 0, shop: {}, best: {}, runs: 0, choiceSlots: 2, chapter: 'deep', dev: true, chapters: {} }
  ensureChapterMeta(meta, 'deep')
  meta.chapters.deep.unlocked = true
  const run = createRun(meta, { chapter: 'deep', difficulty: 1 })
  if (run.chapter !== 'deep') { console.error(`ABORT: asked for deep, got ${run.chapter}`); process.exit(1) }
  run.player.maxHP = run.player.hp = 1e9   // immortal: the rig measures the roster, not this walk's survival

  const kills = {}, xpByRoster = {}, taken = {}, children = {}
  const seenIds = new Set()
  let steps = 0
  for (let i = 0; i < DURATION * 60; i++) {
    const before = new Map()
    for (const e of run.enemies) before.set(e.id, e)

    const a = run.time * 0.7   // a slowly-turning walk — the immortal+kiting rig, not a model of skill
    stepSim(run, { x: Math.cos(a), y: Math.sin(a) }, DT)

    // Split children spawned: newly-seen ids tagged _splitChild (queued last step, materialised
    // into run.enemies at THIS step's flushSpawns — sim.js:263).
    for (const e of run.enemies) {
      if (seenIds.has(e.id)) continue
      seenIds.add(e.id)
      if (e._splitChild) children[e.rosterId ?? '?'] = (children[e.rosterId ?? '?'] ?? 0) + 1
    }
    // Kills + their real xp: an id present before this step and gone after.
    const afterIds = new Set(run.enemies.map((e) => e.id))
    for (const [id, e] of before) {
      if (afterIds.has(id)) continue
      const rid = e.rosterId ?? e.type ?? '?'
      kills[rid] = (kills[rid] ?? 0) + 1
      xpByRoster[rid] = (xpByRoster[rid] ?? 0) + e.xp * (e.elite ? ELITE.xpMul : 1)
    }
    for (const ev of run.events) if (ev.type === 'hurt') taken[ev.src ?? '?'] = (taken[ev.src ?? '?'] ?? 0) + (ev.dmg ?? 0)
    run.events.length = 0   // drain every step, exactly as main.js does
    if (run.phase === 'levelup') { applyChoice(run, 0); run.phase = 'playing' }   // accept the first offer, always
    // Immortal has to be reasserted EVERY STEP, not set once before the loop (fix round 1): BRITTLE
    // (sim.js:448-452, applyAnomalyOnTake) rewrites maxHP to BRITTLE_MAX_HP (1) the instant it is
    // taken, and clamps hp to match — a single set-before-the-loop `maxHP = hp = 1e9` is worth
    // nothing once that card lands, and ordinary contact damage the very next step then ends the
    // run. charge-probe.mjs:367 has carried this exact line for the same reason (its own rig also
    // accepts every offer); mirrored here rather than reinvented.
    run.player.hp = run.player.maxHP
    if (run.phase !== 'playing') break
    steps++
  }
  const totalXp = Object.values(xpByRoster).reduce((s, v) => s + v, 0)
  const xpShare = Object.fromEntries(Object.entries(xpByRoster).map(([k, v]) => [k, +(100 * v / totalXp).toFixed(1)]))
  console.log(`seed ${seed}: secs ${(steps * DT).toFixed(0)} level ${run.player.level} ` +
    `kills ${JSON.stringify(kills)} xp ${JSON.stringify(Object.fromEntries(Object.entries(xpByRoster).map(([k, v]) => [k, Math.round(v)])))} ` +
    `xpShare% ${JSON.stringify(xpShare)} taken ${JSON.stringify(Object.fromEntries(Object.entries(taken).map(([k, v]) => [k, Math.round(v)])))} ` +
    `splitChildren ${JSON.stringify(children)}`)
}
