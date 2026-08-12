// What the Light bar ACTUALLY does over a real Shelf run — headless, no browser.
//
//   node scripts/charge-probe.mjs [srcDir]
//
// The question this exists to answer is not "is the tune good" but "does the bar CYCLE": a bar
// pinned at max is not a resource, and a bar pinned at 0 is a mechanic the player never gets to
// use. Both look identical in a screenshot of the HUD, and both are invisible in the sim tests,
// which assert the arithmetic rather than the shape of a run.
//
// The traps CLAUDE.md documents, all of them load-bearing here:
//   - createRun(meta, opts) takes an OPTIONS OBJECT. createRun(meta, 'shelf', 1) does not throw and
//     silently gives you a body run at difficulty 1. The header below prints run.chapter for that
//     exact reason.
//   - the probe meta must UNLOCK the chapters, or ensureChapterMeta/resolveChapterId fall back.
//   - SEED Math.random (mulberry32) and average several runs; unseeded, the same build measures
//     wildly different numbers.
//   - DRAIN run.events every step, exactly as main.js does, or the backlog is recounted forever.
//   - WAVE_TABLE gates archetypes by TIME (tank at t=140s), so a short probe cannot see late-run
//     composition. This runs the full 300s.
//
// THE RIG IS IMMORTAL + KITING, and both halves are load-bearing (CLAUDE.md's rig taxonomy):
//   - KITING, because a stationary player never travels and so would only ever meet the shaft it
//     spawned next to — reporting "the bar only drains" for any tune at all. A slowly-turning walk
//     is a floor on player skill, not a model of one.
//   - IMMORTAL, because the question is what the bar DOES over a full run, not whether this
//     particular walk survives one. Two earlier cuts of this probe reported 12 kills and then 34,
//     which read as damning charge numbers and were really a 36-second and a 100-second run: the
//     first exited at the first level-up, the second died. Both printed a full-looking table.
// Level-ups are ACCEPTED (first offer, always) rather than refused as weapon-census refuses them.
// That inversion is deliberate: the census asks what one weapon does and an auto-picked passive is
// power it did not earn, whereas this asks whether the bar keeps up with a REAL run, and a real run
// takes cards and kills far more than a starter-only one ever would.
import { createRun } from '../src/state.js'
import { stepSim, applyChoice } from '../src/sim.js'
import { CHAPTERS, PULSE_CHARGE_COST } from '../src/config.js'

const CHAPTER = 'shelf'
const DIFFICULTY = 1
const DURATION = 300
const DT = 1 / 60
const RUNS = 5

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const meta = {
  coins: 0, shop: {}, best: {}, runs: 0, choiceSlots: 2, chapter: CHAPTER, dev: true,
  chapters: Object.fromEntries(['body', 'pond', 'garden', 'undergrowth', 'city', 'skies', 'beyond', CHAPTER]
    .map((id) => [id, { unlocked: true, maxDifficulty: 5, difficulty: DIFFICULTY }])),
}

const res = CHAPTERS[CHAPTER].resource
const sig = CHAPTERS[CHAPTER].signature

// Spend policies. ONE policy cannot tell "the bar cannot fill" apart from "this player spent it
// all": a greedy player pins the bar at zero under every tune there is, which is exactly what the
// first cut of this probe reported. `hoard` measures pure supply against drain, `greedy` the floor,
// and `full` what a player who saves the pulse for a real crowd actually experiences.
const POLICIES = {
  hoard: () => false,                                       // never fires — supply vs drain alone
  full: (run) => run.charge >= PULSE_CHARGE_COST,           // fires only at a full-strength spend
  greedy: () => true,                                       // fires the instant the cooldown allows
}

const results = {}
for (const [pname, wants] of Object.entries(POLICIES)) {
  const rows = []
  for (let r = 0; r < RUNS; r++) {
    const orig = Math.random
    Math.random = mulberry32(1234 + r * 7919)
    const run = createRun(meta, { chapter: CHAPTER, difficulty: DIFFICULTY })
    if (run.chapter !== CHAPTER) { console.error(`ABORT: asked for ${CHAPTER}, got ${run.chapter}`); process.exit(1) }

    let inShaft = 0, steps = 0, pulses = 0, charged = 0, atZero = 0, atMax = 0, armed = 0
    let sum = 0, min = Infinity, max = -Infinity
    let heading = 0
    const samples = []

    for (let t = 0; t < DURATION; t += DT) {
      heading += 0.35 * DT                                 // a slowly-turning walk (see the rig note)
      const ready = (run.repulseCd ?? 0) <= 0
      const skill = ready && wants(run)
      if (skill) { pulses++; if (run.charge >= PULSE_CHARGE_COST) charged++ }
      stepSim(run, { x: Math.cos(heading), y: Math.sin(heading), skill }, DT)
      run.events.length = 0                                // drain, exactly as main.js does
      if (run.phase === 'levelup') { applyChoice(run, 0); run.phase = 'playing' }
      // Immortal: the rig measures the bar, not this walk's survival. Restored AFTER the step so
      // contact damage still happens and still costs — it just never ends the run.
      run.player.hp = run.player.maxHP
      if (run.phase !== 'playing') break

      const pl = run.player
      if (run.shafts.some((sh) => Math.hypot(sh.x - pl.x, sh.y - pl.y) <= sh.r)) inShaft++
      steps++
      const c = run.charge
      sum += c; min = Math.min(min, c); max = Math.max(max, c)
      if (c <= 0.01) atZero++
      if (c >= res.max - 0.01) atMax++
      if (c >= PULSE_CHARGE_COST) armed++                  // could fire a FULL-strength pulse right now
      if (steps % 600 === 0) samples.push(Math.round(c))
    }
    Math.random = orig
    rows.push({ mean: sum / steps, min, max, inShaft: inShaft / steps, atZero: atZero / steps,
                atMax: atMax / steps, armed: armed / steps, pulses, charged, kills: run.kills, secs: steps * DT, samples })
  }
  results[pname] = rows
}

const avg = (rows, k) => rows.reduce((a, x) => a + x[k], 0) / rows.length
console.log(`chapter=${CHAPTER} difficulty=${DIFFICULTY} ${DURATION}s x ${RUNS} seeded runs, immortal + kiting`)
console.log(`resource: drain ${res.drain}/s  refill ${res.refill}/s in-shaft  kill +${res.killRefill}  max ${res.max}`)
console.log(`shafts:   cell ${sig.cell} chance ${sig.chance} r ${sig.r}  drift ${sig.driftAmp}px x ${sig.driftHz}rad/s = ${(sig.driftAmp * sig.driftHz).toFixed(1)} px/s peak`)
console.log(`coverage: ${(100 * sig.chance * Math.PI * sig.r * sig.r / (sig.cell * sig.cell)).toFixed(1)}% of the plane is lit (chance x pi r^2 / cell^2)`)
console.log(`pulse:    costs ${PULSE_CHARGE_COST}; a full bar is ${(res.max / PULSE_CHARGE_COST).toFixed(1)} charged pulses`)
console.log('')
console.log('policy    mean    %at0   %atMax  %armed  %inLight  pulses  charged  kills   secs')
for (const [pname, rows] of Object.entries(results)) {
  console.log(
    pname.padEnd(9) +
    avg(rows, 'mean').toFixed(1).padStart(5) +
    (avg(rows, 'atZero') * 100).toFixed(0).padStart(8) +
    (avg(rows, 'atMax') * 100).toFixed(0).padStart(8) +
    (avg(rows, 'armed') * 100).toFixed(0).padStart(8) +
    (avg(rows, 'inShaft') * 100).toFixed(1).padStart(10) +
    avg(rows, 'pulses').toFixed(0).padStart(8) +
    avg(rows, 'charged').toFixed(0).padStart(9) +
    avg(rows, 'kills').toFixed(0).padStart(7) +
    avg(rows, 'secs').toFixed(0).padStart(7))
}
console.log('')
console.log('hoard, charge every 10s, run 1:', results.hoard[0].samples.join(' '))
console.log('full,  charge every 10s, run 1:', results.full[0].samples.join(' '))
