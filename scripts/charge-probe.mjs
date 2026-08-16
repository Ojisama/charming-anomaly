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
import { createRun, ensureBookMeta, ensureChapterMeta } from '../src/state.js'
import { stepSim, applyChoice, onSandbar } from '../src/sim.js'
import { CHAPTERS, PULSE_CHARGE_COST, darkness, refillSpec, laneAxes, laneScrollFor, bookOf, shopLines, MAX_SHOP_LEVEL } from '../src/config.js'

// --chapter <id> (v7.x, run US.c): The Surf shares this same `resource`/refill-circle vocabulary
// (Humidity, tide pools via the generalised streamShafts) as The Shelf's Light, so the probe reads
// the geometry through refillSpec() below instead of Shelf-specific field names, and defaults to
// 'shelf' unchanged for every call this file already documents.
const argChapter = process.argv.indexOf('--chapter')
const CHAPTER = argChapter >= 0 ? process.argv[argChapter + 1] : 'shelf'
// --shop=N (v7.x, Task 9's Slow Burn gate): the permanent book-shop level, 0..10, same flag
// spelling as pool-probe.mjs. Task 9 needs to compare Lv0 against Lv10 of Undertow's own lines
// (deepLungs/slowBurn/bigGulp) — the probe had no way to move that knob before this. Clamped
// against MAX_SHOP_LEVEL the same way pool-probe.mjs:186 already does — unclamped, --shop=15 would
// apply an out-of-range bonus and print a nonsensical `Lv15/10`.
const SHOP_LV = Math.min(MAX_SHOP_LEVEL, Number(process.argv.find((a) => a.startsWith('--shop='))?.slice(7) ?? 0))
// --line=<id>=<N> (v7.x, Task 9 FIX ROUND): set exactly ONE shop line to N and every other line —
// including the other two Undertow lines and all eight universal ones — to 0. --shop=N sweeps
// EVERY line at once (moveSpeed included), which confounds a `seek` policy's numbers: a faster
// player covers more ground per lap regardless of which resource line moved, so "--shop=10 changed
// %DARK" cannot be attributed to Slow Burn alone. --line is the isolated counterpart: one knob,
// nothing else moves. Overrides --shop when both are given.
const argLine = process.argv.find((a) => a.startsWith('--line='))
const LINE_ID = argLine ? argLine.slice(7).split('=')[0] : null
const LINE_LV = argLine ? Math.min(MAX_SHOP_LEVEL, Number(argLine.slice(7).split('=')[1] ?? 0)) : 0
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

// Probe metas are hand-built and never pass through loadMeta, so they must construct the book
// shape the same way the game does — a bare spread of `lightThief` has been a silent no-op since
// the unlock moved into books[b].unlocks (see state.js's killRefill snapshot at createRun).
const bookOfChapter = bookOf(CHAPTER)
// A typo'd --line id would otherwise leave every line at 0 with no error — the exact "vocabulary
// silently does nothing" trap CLAUDE.md documents elsewhere in this repo.
if (LINE_ID && !shopLines(bookOfChapter)[LINE_ID]) {
  console.error(`ABORT: --line=${LINE_ID} is not a line in shopLines('${bookOfChapter}') — check the spelling`)
  process.exit(1)
}
function probeMeta({ thief = false, shopLevel = SHOP_LV } = {}) {
  const meta = { coins: 0, shop: {}, choiceSlots: 2, best: {}, runs: 0, chapters: {}, dev: true }
  ensureChapterMeta(meta, CHAPTER)
  meta.chapters[CHAPTER].unlocked = true
  const bm = ensureBookMeta(meta, bookOfChapter)
  if (thief) bm.unlocks.lightThief = true
  // --line wins when given: every line 0 except LINE_ID, which gets LINE_LV. Otherwise the old
  // --shop=N sweep, every line to shopLevel.
  for (const id of Object.keys(shopLines(bookOfChapter))) {
    bm.shop[id] = LINE_ID ? (id === LINE_ID ? LINE_LV : 0) : shopLevel
  }
  return meta
}

const res = CHAPTERS[CHAPTER].resource
const sig = CHAPTERS[CHAPTER].signature
const spec = refillSpec(sig) // the refill-circle geometry, whichever chapter (Shelf's shafts / Surf's pools)
if (!res || !spec) { console.error(`ABORT: ${CHAPTER} declares no resource/refill geometry — nothing to probe`); process.exit(1) }

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
    // The trigger itself is chapter-conditional (v7.x): Shelf's `dark` curve says exactly when
    // there's a reason to seek. The Surf has no dark block — Ruling D leaves its drawback to a
    // later task — but the bar is already live as the Pulse's ammo (stepSim gates that on `res`
    // alone, not on `dark`), so a rational player still wants it above half. Below half is an
    // arbitrary but reasonable stand-in for a chapter that hasn't shipped its own gate yet.
    // run.chargeMax, not res.max (Task 9 fix round): Deep Lungs raises the run's own ceiling, and
    // both darkness() and the "below half" fallback must judge against IT, or a Deep-Lungs run
    // seeks far more eagerly than a player reading their own (raised) bar actually would.
    const wantSeek = res.dark ? darkness(run.charge, res, run.chargeMax) > 0 : run.charge < run.chargeMax * 0.5
    if (!wantSeek) return null
    const p = run.player
    let best = null, bd = Infinity
    for (const sh of run.shafts) {
      const d = Math.hypot(sh.x - p.x, sh.y - p.y)
      if (d < bd) { bd = d; best = sh }
    }
    return best ? Math.atan2(best.y - p.y, best.x - p.x) : null
  },
}

// ---- LANE MOVEMENT (v7.x, The Reef) -----------------------------------------------------------
// NEITHER POLICY ABOVE CAN BE EXPRESSED IN A LANE, and running one anyway returns confident
// nonsense rather than an error — which is why this whole block exists before any Reef number was
// quoted. In a lane chapter (CHAPTERS[].lane) stepPlayerMovement throws away the forward component
// of the stick entirely and pins the forward velocity to the chapter's own laneScroll: a `kite` run
// in The Reef is not a cautious player, it is a player pressing a direction the game does not have,
// and it would measure as "the mechanic is unreachable" for every tune there is.
//
// The only decision a lane gives you is WHERE TO SIT ACROSS IT, so these two policies are the
// honest poles of that one decision, and the pair is the answer — never one alone:
//   centre — hold the middle and ignore the pockets. Not a strawman: the jitter budget puts every
//            pocket's centre at |cross| >= 150 (see CHAPTERS.reef.signature's block), so a player
//            who never commits to a side literally cannot touch one. This row is what the chapter
//            does to someone who has not learned it yet.
//   pocket — steer at the nearest pocket AHEAD whose cross the player could still reach in the time
//            the scroll leaves them, and hold centre when there is none. The upper bound on a
//            player working the mechanic, and deliberately not "seek only when low": in a lane you
//            pass a refill once and never again, so waiting until the bar is low is not caution, it
//            is having already skipped the three that would have saved you.
// Both return an INPUT VECTOR rather than a heading: only the cross component survives the lane,
// and building it explicitly off laneAxes is what stops this rig quietly measuring the wrong axis.
const laneCh = CHAPTERS[CHAPTER].lane === true
const LAX = laneAxes(CHAPTERS[CHAPTER])
const crossInput = (v) => (LAX.cross === 'x' ? { x: v, y: 0 } : { x: 0, y: v })
// A dead band, so the rig does not chatter across the centre line at 60Hz and read as a player
// vibrating. 8px is well under the pocket radius, so it costs nothing that matters.
const towardCross = (from, to) => crossInput(Math.abs(to - from) < 8 ? 0 : to > from ? 1 : -1)
const LANE_MOVES = {
  centre: (run) => towardCross(run.player[LAX.cross], 0),
  pocket: (run) => {
    const p = run.player
    if (run.charge >= run.chargeMax - 0.01) return towardCross(p[LAX.cross], 0)
    const strafe = p.speed * 1.25            // LANE_STRAFE_MUL; how fast the cross axis can close
    let best = null, bd = Infinity
    for (const sh of run.shafts) {
      // AHEAD, in the lane's own signed sense — a pocket level with or behind the player is gone,
      // because nothing in this mode can turn round. `dir` makes that one comparison on either axis.
      const ahead = (sh[LAX.fwd] - p[LAX.fwd]) * LAX.dir
      if (ahead < -sh.r) continue
      // Reachable: the cross gap has to close in the time the scroll leaves before it goes past.
      const secs = Math.max(0.01, (ahead + sh.r) / laneScrollFor(CHAPTERS[CHAPTER]))
      if (Math.abs(sh[LAX.cross] - p[LAX.cross]) > strafe * secs + sh.r) continue
      if (ahead < bd) { bd = ahead; best = sh }
    }
    return towardCross(p[LAX.cross], best ? best[LAX.cross] : 0)
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
for (const [mname, moveAt] of Object.entries(laneCh ? LANE_MOVES : MOVES)) {
for (const [pname, wants] of Object.entries(POLICIES)) {
  const rows = []
  for (let r = 0; r < RUNS; r++) {
    const orig = Math.random
    Math.random = mulberry32(1234 + r * 7919)
    const run = createRun(probeMeta({ thief }), { chapter: CHAPTER, difficulty: DIFFICULTY })
    if (run.chapter !== CHAPTER) { console.error(`ABORT: asked for ${CHAPTER}, got ${run.chapter}`); process.exit(1) }

    let inShaft = 0, steps = 0, pulses = 0, charged = 0, atZero = 0, atMax = 0, armed = 0
    let dark = 0, darkSum = 0, onBar = 0
    let sum = 0, min = Infinity, max = -Infinity
    let heading = 0
    const samples = []

    for (let t = 0; t < DURATION; t += DT) {
      heading += 0.35 * DT                                 // a slowly-turning walk (see the rig note)
      const ready = (run.repulseCd ?? 0) <= 0
      const skill = ready && wants(run)
      if (skill) { pulses++; if (run.charge >= PULSE_CHARGE_COST) charged++ }
      // Free-roam policies return a HEADING (or null for "keep kiting"); the lane policies return
      // an input VECTOR, because only the cross component of the stick survives stepPlayerMovement
      // there and building it from an angle would be one more place to get the axis wrong.
      const want = moveAt(run)
      const move = laneCh ? want
        : (() => { const aim = want ?? heading; return { x: Math.cos(aim), y: Math.sin(aim) } })()
      stepSim(run, { x: move.x, y: move.y, skill }, DT)
      run.events.length = 0                                // drain, exactly as main.js does
      if (run.phase === 'levelup') { applyChoice(run, 0); run.phase = 'playing' }
      // Immortal: the rig measures the bar, not this walk's survival. Restored AFTER the step so
      // contact damage still happens and still costs — it just never ends the run.
      run.player.hp = run.player.maxHP
      if (run.phase !== 'playing') break

      const pl = run.player
      if (run.shafts.some((sh) => Math.hypot(sh.x - pl.x, sh.y - pl.y) <= sh.r)) inShaft++
      // Sandbars (v7.x Surf only — onSandbar is a no-op false for any chapter with no run.sandbars
      // entries, so this column reads 0 for The Shelf without a chapter-type branch here).
      if (onSandbar(run)) onBar++
      steps++
      const c = run.charge
      sum += c; min = Math.min(min, c); max = Math.max(max, c)
      if (c <= 0.01) atZero++
      // run.chargeMax, not res.max (Task 9 fix round): Deep Lungs raises the run's own ceiling, so
      // "%atMax" must ask "at THIS run's cap", not "at or above the pre-Deep-Lungs config number".
      if (c >= run.chargeMax - 0.01) atMax++
      if (c >= PULSE_CHARGE_COST) armed++                  // could fire a FULL-strength pulse right now
      // THE DARK. `d` is the ONE curve both the dimming and the slow read (config.js), so %dark is
      // literally "how much of this run was the screen dimmed and the player slowed at all", and
      // meanDark is how far in. Reporting only the first would call a run that dips 1% below the
      // threshold and a run pinned at an empty bar the same thing. run.chargeMax again, same reason.
      const d = darkness(c, res, run.chargeMax)
      if (d > 0) dark++
      darkSum += d
      if (steps % 600 === 0) samples.push(Math.round(c))
    }
    Math.random = orig
    rows.push({ mean: sum / steps, min, max, inShaft: inShaft / steps, atZero: atZero / steps,
                atMax: atMax / steps, armed: armed / steps, dark: dark / steps, meanDark: darkSum / steps,
                onBar: onBar / steps, pulses, charged, kills: run.kills, secs: steps * DT, samples })
  }
  results[`${thief ? 'thief' : 'base '} ${mname.padEnd(4)} ${pname}`] = rows
}
}
}

const avg = (rows, k) => rows.reduce((a, x) => a + x[k], 0) / rows.length
// The header must state EXACTLY what was measured (Task 9 fix round) — --line and --shop resolve
// to different per-line levels, and a table with no header distinction between them is how a
// confounded --shop=10 sweep gets misread as an isolated Slow Burn result. Read the resolved
// chargeMax off a real (throwaway) probe run rather than re-deriving shopBonus's math here a
// second time — state.js's shopBonus is what createRun already trusts, and duplicating its formula
// is exactly the "one fact in two places" trap CLAUDE.md warns about.
const modeLabel = LINE_ID ? `line=${LINE_ID}@Lv${LINE_LV}/10 (every other line 0)` : `shop=Lv${SHOP_LV}/10 (every line)`
const previewRun = createRun(probeMeta({}), { chapter: CHAPTER, difficulty: DIFFICULTY })
console.log(`chapter=${CHAPTER} book=${bookOfChapter} difficulty=${DIFFICULTY} ${modeLabel} ${DURATION}s x ${RUNS} seeded runs, immortal + kiting`)
console.log(`resource: drain ${res.drain}/s  refill ${res.refill}/s in-refill-circle  kill +${res.killRefill} (Light Thief only)  config max ${res.max}  resolved chargeMax ${previewRun.chargeMax}`)
if (res.dark) {
  // The FRACTION threshold (res.dark.from) is fixed; the ABSOLUTE charge it fires at is not — Deep
  // Lungs raises chargeMax, so a Lv10 run's dark starts at 0.5 x 180 = 90, not 0.5 x 100 = 50.
  console.log(`dark:     below ${(res.dark.from * 100).toFixed(0)}% of chargeMax (${(res.dark.from * previewRun.chargeMax).toFixed(0)}/${previewRun.chargeMax}) the screen dims (to alpha ${res.dark.dim}) and you slow (to x${res.dark.speedFloor}), linearly to empty`)
} else {
  console.log('dark:     none — this chapter declares no resource.dark block')
}
console.log(`refill:   cell ${spec.cell} chance ${spec.chance} r ${spec.r}` +
  (spec.driftAmp ? `  drift ${spec.driftAmp}px x ${spec.driftHz}rad/s = ${(spec.driftAmp * spec.driftHz).toFixed(1)} px/s peak` : '  no drift'))
console.log(`coverage: ${(100 * spec.chance * Math.PI * spec.r * spec.r / (spec.cell * spec.cell)).toFixed(1)}% of the plane refills (chance x pi r^2 / cell^2)`)
if (sig.bars) {
  console.log(`sandbars: cell ${sig.bars.cell} chance ${sig.bars.chance} r ${sig.bars.r}  slowMul x${sig.bars.slowMul}  drainMul x${sig.bars.drainMul}` +
    ` — ${(100 * sig.bars.chance * Math.PI * sig.bars.r * sig.bars.r / (sig.bars.cell * sig.bars.cell)).toFixed(1)}% of the plane is dry ground`)
}
console.log(`pulse:    costs ${PULSE_CHARGE_COST}; a full (resolved) bar is ${(previewRun.chargeMax / PULSE_CHARGE_COST).toFixed(1)} charged pulses`)
console.log('')
console.log('policy              mean    %at0   %atMax  %armed  %inLight   %DARK  meanDark   %onBar  pulses  charged  kills   secs')
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
    (avg(rows, 'onBar') * 100).toFixed(1).padStart(9) +
    avg(rows, 'pulses').toFixed(0).padStart(8) +
    avg(rows, 'charged').toFixed(0).padStart(9) +
    avg(rows, 'kills').toFixed(0).padStart(7) +
    avg(rows, 'secs').toFixed(0).padStart(7))
}
console.log('')
// The SHAPE of the bar over one run, which no column above can show: a mean of 50 is a bar that
// cycles and a bar pinned at 50, and those are different mechanics. Keys are derived rather than
// hardcoded, because the movement policies are chapter-conditional now (see LANE_MOVES) and a
// hardcoded 'base  seek full' throws on any lane chapter.
for (const k of Object.keys(results).filter((k) => k.endsWith('full') || k.endsWith('hoard')))
  console.log(`${k.padEnd(19)} charge every 10s, run 1:`, results[k][0].samples.join(' '))
