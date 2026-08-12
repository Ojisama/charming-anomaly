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
// WHAT THE KNOBS DID, so the next person does not re-sweep the flat ones (v7.x):
//   - drain x shaft-density came back FLAT — a seeking player moved 21% -> 33% dark across a
//     DOUBLED drain and a HALVED coverage. At the original refill of 45/s a shaft refilled the whole
//     bar in 2.3s, so light was a checkpoint you touched and nothing upstream of it could matter.
//   - REFILL is the binding knob, and the interesting one: at 18/s a shaft is a place you must
//     STAND (6.3s for a full bar), which costs mobility exactly when the crowd is closing. Below
//     that it degenerates — at 10/s and 6/s the player is parked in a shaft 95-99% of the run.
//   - killRefill (Light Thief) at 4/kill did not blunt the dark, it ABOLISHED it (61% -> 17%). At
//     ~0.8 kills/s a killRefill of K is worth ~0.8K/s against the drain; 1.5 halves the dark and
//     converts "time parked in a shaft" into "time playing", which is what a purchase should buy.
//
// THE RIG IS IMMORTAL + KITING/SEEKING, and every half is load-bearing (CLAUDE.md's rig taxonomy):
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
import { CHAPTERS, PULSE_CHARGE_COST, darkness } from '../src/config.js'

const CHAPTER = 'shelf'
const DIFFICULTY = 1
const DURATION = 300
const DT = 1 / 60
const RUNS = 3  // 2 thief x 2 movement x 3 spend = 12 rows; 3 seeds keeps the matrix under a minute

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

// MOVEMENT policy — the axis this probe was MISSING, and its absence produced a confident wrong
// answer. The kiting walk turns at a fixed rate, so its circle has radius speed x (1/0.35) / 2pi:
// 628px at full speed, 377px once the dark slows you to x0.6. Shaft cells are 760px apart, so
// SHRINKING THE CIRCLE is what dropped %inLight from 11.8 to 3.0 — the rig stopped being able to
// reach any light, and it read exactly like the game trapping the player. It is a property of
// walking in a circle, not of the chapter.
//
// `seek` is the honest model: a player who understands the mechanic walks TOWARD the nearest shaft
// once the bar is low, and kites the rest of the time. Both rows are reported because the pair is
// the answer — `kite` is the floor for a player ignoring the light, `seek` is one working it.
const MOVES = {
  kite: () => null,                                         // the slowly-turning walk, unchanged
  seek: (run) => {
    if (darkness(run.charge, res) <= 0) return null          // above the threshold, no reason to
    const p = run.player
    let best = null, bd = Infinity
    for (const sh of run.shafts) {
      const d = Math.hypot(sh.x - p.x, sh.y - p.y)
      if (d < bd) { bd = d; best = sh }
    }
    return best ? Math.atan2(best.y - p.y, best.x - p.x) : null
  },
}

// The SECOND axis (v7.x): Light Thief, the permanent unlock that makes kills give light back.
// Owner ruling — it is bought, never default — so `false` IS the baseline this chapter must be
// tuned to survive on, and `true` is what the purchase is supposed to feel like buying. Running
// both in one invocation is the only way to price it: the delta between the two rows is the whole
// value of the card, and quoting it from two separate runs would re-phase the RNG (CLAUDE.md's
// re-phasing trap — every seeded probe in this repo has fallen for it at least once).
const results = {}
for (const thief of [false, true]) {
for (const [mname, aimAt] of Object.entries(MOVES)) {
for (const [pname, wants] of Object.entries(POLICIES)) {
  const rows = []
  for (let r = 0; r < RUNS; r++) {
    const orig = Math.random
    Math.random = mulberry32(1234 + r * 7919)
    const run = createRun({ ...meta, lightThief: thief }, { chapter: CHAPTER, difficulty: DIFFICULTY })
    if (run.chapter !== CHAPTER) { console.error(`ABORT: asked for ${CHAPTER}, got ${run.chapter}`); process.exit(1) }

    let inShaft = 0, steps = 0, pulses = 0, charged = 0, atZero = 0, atMax = 0, armed = 0
    let dark = 0, darkSum = 0
    let sum = 0, min = Infinity, max = -Infinity
    let heading = 0
    const samples = []

    for (let t = 0; t < DURATION; t += DT) {
      heading += 0.35 * DT                                 // a slowly-turning walk (see the rig note)
      const ready = (run.repulseCd ?? 0) <= 0
      const skill = ready && wants(run)
      if (skill) { pulses++; if (run.charge >= PULSE_CHARGE_COST) charged++ }
      const aim = aimAt(run) ?? heading                    // seek the light when low, else kite
      stepSim(run, { x: Math.cos(aim), y: Math.sin(aim), skill }, DT)
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
      // THE DARK. `d` is the ONE curve both the dimming and the slow read (config.js), so %dark is
      // literally "how much of this run was the screen dimmed and the player slowed at all", and
      // meanDark is how far in. Reporting only the first would call a run that dips 1% below the
      // threshold and a run pinned at an empty bar the same thing.
      const d = darkness(c, res)
      if (d > 0) dark++
      darkSum += d
      if (steps % 600 === 0) samples.push(Math.round(c))
    }
    Math.random = orig
    rows.push({ mean: sum / steps, min, max, inShaft: inShaft / steps, atZero: atZero / steps,
                atMax: atMax / steps, armed: armed / steps, dark: dark / steps, meanDark: darkSum / steps,
                pulses, charged, kills: run.kills, secs: steps * DT, samples })
  }
  results[`${thief ? 'thief' : 'base '} ${mname.padEnd(4)} ${pname}`] = rows
}
}
}

const avg = (rows, k) => rows.reduce((a, x) => a + x[k], 0) / rows.length
console.log(`chapter=${CHAPTER} difficulty=${DIFFICULTY} ${DURATION}s x ${RUNS} seeded runs, immortal + kiting`)
console.log(`resource: drain ${res.drain}/s  refill ${res.refill}/s in-shaft  kill +${res.killRefill} (Light Thief only)  max ${res.max}`)
console.log(`dark:     below ${(res.dark.from * 100).toFixed(0)}/${res.max} the screen dims (to alpha ${res.dark.dim}) and you slow (to x${res.dark.speedFloor}), linearly to empty`)
console.log(`shafts:   cell ${sig.cell} chance ${sig.chance} r ${sig.r}  drift ${sig.driftAmp}px x ${sig.driftHz}rad/s = ${(sig.driftAmp * sig.driftHz).toFixed(1)} px/s peak`)
console.log(`coverage: ${(100 * sig.chance * Math.PI * sig.r * sig.r / (sig.cell * sig.cell)).toFixed(1)}% of the plane is lit (chance x pi r^2 / cell^2)`)
console.log(`pulse:    costs ${PULSE_CHARGE_COST}; a full bar is ${(res.max / PULSE_CHARGE_COST).toFixed(1)} charged pulses`)
console.log('')
console.log('policy              mean    %at0   %atMax  %armed  %inLight   %DARK  meanDark  pulses  charged  kills   secs')
for (const [pname, rows] of Object.entries(results)) {
  console.log(
    pname.padEnd(19) +
    avg(rows, 'mean').toFixed(1).padStart(5) +
    (avg(rows, 'atZero') * 100).toFixed(0).padStart(8) +
    (avg(rows, 'atMax') * 100).toFixed(0).padStart(8) +
    (avg(rows, 'armed') * 100).toFixed(0).padStart(8) +
    (avg(rows, 'inShaft') * 100).toFixed(1).padStart(10) +
    (avg(rows, 'dark') * 100).toFixed(0).padStart(8) +
    avg(rows, 'meanDark').toFixed(2).padStart(10) +
    avg(rows, 'pulses').toFixed(0).padStart(8) +
    avg(rows, 'charged').toFixed(0).padStart(9) +
    avg(rows, 'kills').toFixed(0).padStart(7) +
    avg(rows, 'secs').toFixed(0).padStart(7))
}
console.log('')
for (const k of ['base  seek full', 'base  kite full', 'thief seek full'])
  console.log(`${k.padEnd(16)} charge every 10s, run 1:`, results[k][0].samples.join(' '))
