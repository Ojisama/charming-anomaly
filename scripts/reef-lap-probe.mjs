// How long does a lap take, driven how well? config.js names this exact file in the
// CIRCUIT_ACCEL/CIRCUIT_CLOCK_START/CLOCK_CAP/SWIM_TIME comments as the rig their knob grid needs —
// this is the first real number for that grid, not a tuned one.
//
//   node scripts/reef-lap-probe.mjs [--difficulty N]
//
// SCOPE, read before quoting a row:
//   - THROTTLE x STEERING, the axis charge-probe.mjs's LANE_MOVES and reef-burst-grid.mjs's MOVES
//     cannot express — both hard-set the forward stick to 0 (see their crossInput/toward), so no
//     Reef number in this repo has ever varied it. This is the first rig that does.
//   - IMMORTAL TO HP, MORTAL TO THE CLOCK. hp is reset to maxHP every step, the charge-probe.mjs /
//     reef-burst-grid.mjs idiom — which here neutralises THREE separate HP-loss paths at once: the
//     cave wall's scrape (CAVE_HIT_DPS), the front's crush (LANE_CRUSH_DPS) and an empty Air bar's
//     drown (res.drown.dps). None of those three is what this probe exists to answer; the clock
//     (run.raceClock, stepCircuit) is, and it is left fully live — a run that hits 0 ends exactly as
//     it would in the shipped game (phase 'dead', killedBy 'clock'). Wall CONTACT is still counted
//     (run._caveHit) even though its damage is zeroed, so "how much do you scrape" and "do you die
//     from it" stay two separately readable numbers.
//   - NO BURST/AIR POLICY. The dash button (run._burstT, spends Air) is a second axis this probe
//     does not drive — skill is always false. Air's own circuit role is itself unshipped (still the
//     old drown resource, not yet "fuel for boost and nothing else" per the design doc). Add a burst
//     policy once that lands, or a boost number gets quoted from a rig that never pressed the button.
//   - THE CRASH PENALTY IS LIVE (circuit.crashMul, shipped v7.232): driving INTO coral above
//     crashSpeed takes 45% of your speed. That is most of what separates the two throttle policies
//     below, so a row's time is a driving result and not just a distance divided by a speed.
//
// ⚠ THE DRIVER IS A RING DRIVER, AND THE LANE-ERA ONE THIS FILE SHIPPED WITH COULD NOT SEE THE
// TRACK. It steered a CROSS AXIS toward `caveAt(player.x).c` — both halves of which stopped meaning
// anything when the passage closed into a loop in v7.233: f is an angle now, not a world x, and the
// stick is a free heading, not a strafe. It measured a driver aimed at a point unrelated to the
// track. The two axes below are the ones a circuit actually has:
//   LOOK-AHEAD — how far up the track the driver is reading, which is what skill IS on a circuit.
//   THROTTLE   — flat out, or easing off for the corner the look-ahead just found.
//
// CIRCUIT_ACCEL/CLOCK_START/CLOCK_CAP/SWIM_TIME are NOT overridable from here — they are primitive
// `export const`s, not object properties, so this file cannot reassign them the way charge-probe.mjs
// overrides `res.drainPerSpawn`. Sweeping them needs a source change first; noted, not worked around.
import { createRun, ensureBookMeta, ensureChapterMeta } from '../src/state.js'
import { stepSim, applyChoice } from '../src/sim.js'
import { CHAPTERS, caveAt, ringFU, ringXY, bookOf, shopLines } from '../src/config.js'

const CH = 'reef'
const DT = 1 / 60
const MAX_SECS = 300   // safety valve only — every policy below either finishes or dies to the
                        // clock well under this; a run that hits it prints 'timeout', not a number
const SEEDS = [1001, 2002, 3003]   // fixed, same list as reef-astern.mjs/reef-pileup.mjs
const DIFFICULTY = Number(process.argv.find((a) => a.startsWith('--difficulty='))?.slice(13) ?? 1)
const MORTAL = process.argv.includes('--mortal')

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function probeMeta() {
  const meta = { coins: 0, shop: {}, choiceSlots: 2, best: {}, runs: 0, chapters: {}, dev: true }
  ensureChapterMeta(meta, CH)
  meta.chapters[CH].unlocked = true
  const bm = ensureBookMeta(meta, bookOf(CH))
  for (const id of Object.keys(shopLines(bookOf(CH)))) bm.shop[id] = 0
  return meta
}

const ch0 = CHAPTERS[CH]
// A CANDIDATE TRACK IS A COMMAND LINE, NOT A SOURCE EDIT — the same reason the circuit knobs live on
// the chapter object rather than as module constants. Mutates the shared spec in place because every
// consumer (caveAt, ringXY, sim.js) reads CHAPTERS.reef.cave by reference; this process measures one
// track and exits.
const specPatch = process.argv.find((a) => a.startsWith('--spec='))?.slice(7)
if (specPatch) {
  let patch
  try { patch = JSON.parse(specPatch) } catch (e) { console.error(`ABORT: --spec is not JSON (${e.message})`); process.exit(1) }
  Object.assign(ch0.cave, patch)
}
if (!ch0.circuit || !ch0.cave?.lapLen) { console.error(`ABORT: ${CH} declares no circuit/cave.lapLen — nothing to lap-time`); process.exit(1) }
const LAPS = ch0.circuit.laps
if (!ch0.cave.ring?.r0) { console.error('ABORT: the reef cave has no ring — this driver only knows how to lap a closed track'); process.exit(1) }

// LOOK-AHEAD, in PX OF TRACK, and it is the skill axis. A driver who reads one car length ahead
// takes every corner as a surprise; one who reads half a screen sets up for it. The two values
// bracket what a phone actually shows: the 390x844 viewport is 465px of half-diagonal, so `late` is
// inside the screen and `read` is about its edge.
const LOOKS = { late: 170, read: 460 }
// THROTTLE. `flat` is the stick pinned; `brake` eases off in proportion to the corner the look-ahead
// just found. The floor is the ratio the chapter's own throttle band already names (laneThrottle
// min/max = 0.5/3), so a braking driver never asks for a speed the stick cannot produce.
const THROTTLES = {
  flat: () => 1,
  brake: (turn) => Math.max((ch0.laneThrottle.min ?? 0.5) / (ch0.laneThrottle.max ?? 1), 1 - turn / (Math.PI / 2)),
}

const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }

// PX OF TRACK -> f, AT THE RADIUS THE PLAYER IS ACTUALLY AT. f is an angle, so the conversion is not
// a constant: at the inner edge of a hairpin and the outer edge of a sweeper the same px of travel
// is a different amount of f by a factor of about a third. stepCaveWall's own bounce does this
// arithmetic for the same reason; getting it wrong makes the look-ahead distance a function of where
// you are on the lap, which is exactly the thing this axis is trying to hold still.
const fAhead = (spec, u, px) => (px * spec.lapLen) / (2 * Math.PI * Math.max(1, spec.ring.r0 - u))

// WHERE THE DRIVER IS AIMING. The centreline, except across a fork — the island STANDS ON the
// centreline, so aiming at it there drives straight into coral. The side is the one the player is
// already on, which is what a driver committing to a line does.
function aimAt(spec, seed, f, side) {
  const cav = caveAt(f, spec, seed)
  return ringXY(spec, f, cav.ph > 0 ? cav.c + side * (cav.ph + cav.hw) / 2 : cav.c)
}

// THE DO-NOTHING CONTROL (point 4): the coral wall effectively removed, and NOTHING ELSE about the
// track changed. First cut of this shifted halfMin/halfMax to one flat value (5000/5000) and it
// silently broke the clock: swimthroughsFor finds its six checkpoints as local MINIMA of hw, and a
// perfectly flat hw has no minima at all — run._swims came back empty, no swimthrough ever fired,
// and every open-track row died to the untouched 30s starting clock by lap 2 REGARDLESS of throttle
// or steering (0/3 finishes across the board, first run of this file). The fix preserves the exact
// halfMax-halfMin DELTA (so the wave shape, and therefore the checkpoint positions, are bit-identical
// to the wall condition) and only shifts the whole band up past anything reachable. `branch: null`
// drops the mid-passage island (hw x frac would otherwise scale up to an equally huge fake obstacle)
// — it plays no part in swimthroughsFor, which reads only `hw`. `wander` (the centre's own drift) is
// untouched, so `track` still has something to chase: a centre-vs-track comparison under `open`
// reading near-identical is the sanity check that this override actually did what it claims.
const OPEN_HALF = 5000
function withTrack(open, fn) {
  const spec = CHAPTERS[CH].cave
  if (!open) return fn()
  const saved = { halfMin: spec.halfMin, halfMax: spec.halfMax, branch: spec.branch }
  const delta = saved.halfMax - saved.halfMin
  spec.halfMin = OPEN_HALF
  spec.halfMax = OPEN_HALF + delta
  spec.branch = null
  try { return fn() } finally { Object.assign(spec, saved) }
}

function oneRun(steerName, throttleName, seed) {
  const orig = Math.random
  Math.random = mulberry32(seed)
  const run = createRun(probeMeta(), { chapter: CH, difficulty: DIFFICULTY })
  if (run.chapter !== CH) { console.error(`ABORT: asked for ${CH}, got ${run.chapter}`); process.exit(1) }
  const look = LOOKS[steerName], throttleFn = THROTTLES[throttleName]
  const spec = CHAPTERS[CH].cave

  let wallFrames = 0, crashes = 0
  const wallFramesPerLap = new Array(LAPS).fill(0)
  const lapSplits = [], lapOdom = []
  let odom = 0
  let swims = 0
  let px = run.player.x, py = run.player.y

  while ((run._realTime ?? 0) < MAX_SECS) {
    // Read the track from where the player IS, aim at the centreline `look` px up it, and take the
    // corner between that point and the one twice as far as the throttle's own input.
    const p = run.player
    const fu = ringFU(spec, p.x, p.y)
    const side = (fu.u - caveAt(fu.f, spec, run._obstacleSeed).c) >= 0 ? 1 : -1
    // ADAPTIVE LOOK-AHEAD, AND WITHOUT IT THE DRIVER AIMS THROUGH CORAL. Pure pursuit drives the
    // CHORD to its target, and on a corner tighter than the look-ahead is long that chord leaves the
    // passage — so a fixed look-ahead does not model a bad driver, it models one steering into the
    // outside wall on purpose. Shortening it in proportion to the corner just found is what a driver
    // does (look far down a straight, short into a hairpin) and it is one extra evaluation.
    const dF0 = fAhead(spec, fu.u, look)
    const turn0 = Math.abs(wrapPi(
      Math.atan2(aimAt(spec, run._obstacleSeed, fu.f + 2 * dF0, side).y - aimAt(spec, run._obstacleSeed, fu.f + dF0, side).y,
        aimAt(spec, run._obstacleSeed, fu.f + 2 * dF0, side).x - aimAt(spec, run._obstacleSeed, fu.f + dF0, side).x) -
      Math.atan2(aimAt(spec, run._obstacleSeed, fu.f + dF0, side).y - p.y, aimAt(spec, run._obstacleSeed, fu.f + dF0, side).x - p.x)))
    const dF = dF0 / (1 + 2 * turn0)
    const t1 = aimAt(spec, run._obstacleSeed, fu.f + dF, side)
    const t2 = aimAt(spec, run._obstacleSeed, fu.f + 2 * dF, side)
    const a1 = Math.atan2(t1.y - p.y, t1.x - p.x)
    const turn = Math.abs(wrapPi(Math.atan2(t2.y - t1.y, t2.x - t1.x) - a1))
    const thr = throttleFn(turn)
    stepSim(run, { x: Math.cos(a1) * thr, y: Math.sin(a1) * thr, skill: false }, DT)

    for (const ev of run.events) {
      if (ev.type === 'swimthrough') swims++
      if (ev.type === 'crash') crashes++
      if (ev.type === 'lap') { lapSplits.push(ev.split); lapOdom.push(odom); odom = 0 }
    }
    run.events.length = 0
    if (run.phase === 'levelup') { applyChoice(run, 0); run.phase = 'playing' }

    // WORLD DISTANCE, NOT DISTANCE ALONG AN AXIS. On a ring the player's x goes back and forth twice
    // a lap, so the lane-era odometer measured a number that had nothing to do with how far anyone
    // drove. This is the honest one, and it is what makes odom/arc readable as a racing line.
    odom += Math.hypot(p.x - px, p.y - py)
    px = p.x; py = p.y

    if (run._caveHit) { wallFrames++; wallFramesPerLap[Math.min(run.lap ?? 0, LAPS - 1)]++ }

    // Immortal to HP, mortal to the clock — see the file header for why this is three mechanics
    // neutralised on purpose and one left fully live. `--mortal` puts the HP back, which is the only
    // way to ask whether a TRACK is survivable rather than merely lappable: the scrape is charged per
    // second of contact, so a shape that costs more steering costs more HP, and the wall/lap column
    // alone cannot say whether that is a tax or a death.
    if (!MORTAL) run.player.hp = run.player.maxHP

    if (run.phase === 'victory' || run.phase === 'dead') break
  }
  Math.random = orig

  return {
    finished: run.phase === 'victory',
    timedOut: run.phase === 'playing',
    killedBy: run.phase === 'dead' ? (run.killedBy ?? '?') : null,
    raceTime: run.phase === 'victory' ? run.raceTime : null,
    lapsCompleted: run.lap ?? 0,
    lapSplits, lapOdom, wallFrames, wallFramesPerLap, swims, crashes,
    secs: run._realTime ?? 0,
  }
}

const avg = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length

// THE DENOMINATOR FOR odom, AND IT IS NOT lapLen. lapLen is a length in f, and f is an ANGLE; the
// real driving distance is the arc the wobbling centreline covers, ~16% longer at wander 380.
// Against lapLen every racing line reads as 1.16 laps long, which looks like a driver weaving.
const lapArc = (() => {
  const spec = ch0.cave
  let arc = 0
  for (let i = 0; i < 2000; i++) {
    const f0 = (i / 2000) * spec.lapLen, f1 = ((i + 1) / 2000) * spec.lapLen
    const a = ringXY(spec, f0, caveAt(f0, spec, 0).c), b = ringXY(spec, f1, caveAt(f1, spec, 0).c)
    arc += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return arc
})()
console.log(`chapter=${CH} book=${bookOf(CH)} difficulty=${DIFFICULTY} laps=${LAPS} lapLen=${ch0.cave.lapLen}f = ~${lapArc.toFixed(0)}px of arc  wander=${ch0.cave.wander} r0=${ch0.cave.ring.r0} laneThrottle=${JSON.stringify(ch0.laneThrottle)} x ${SEEDS.length} seeded runs, ${MORTAL ? "MORTAL to HP" : "immortal-to-HP"} + mortal-to-clock`)
console.log('')

const rows = {}
for (const open of [false, true]) {
  for (const steerName of Object.keys(LOOKS)) {
    for (const throttleName of Object.keys(THROTTLES)) {
      const key = `${open ? 'open ' : 'wall '}${steerName.padEnd(6)} ${throttleName}`
      rows[key] = SEEDS.map((seed) => withTrack(open, () => oneRun(steerName, throttleName, seed)))
    }
  }
}

console.log('policy                 fin  DNF        time    min    max  lap1  lap2  lap3  lap4  wall/lap  swims  crash  odom1/arc  meanSecs')
for (const [key, runs] of Object.entries(rows)) {
  const fin = runs.filter((r) => r.finished)
  const finRate = `${fin.length}/${runs.length}`
  const dnf = runs.find((r) => !r.finished)
  const dnfLabel = fin.length === runs.length ? '-' : (dnf.timedOut ? 'timeout' : dnf.killedBy)
  const times = fin.map((r) => r.raceTime)
  const meanT = times.length ? avg(times).toFixed(1) : '—'
  const minT = times.length ? Math.min(...times).toFixed(1) : '—'
  const maxT = times.length ? Math.max(...times).toFixed(1) : '—'
  const meanSecs = avg(runs.map((r) => r.secs)).toFixed(1)   // survival time even on a DNF row
  // Per-lap splits, averaged only over the runs that REACHED that lap — a DNF on lap 2 should not
  // silently drag lap 3/4's mean down with zeros it never produced.
  const lapAvg = (i) => {
    const v = runs.map((r) => r.lapSplits[i]).filter((x) => x != null)
    return v.length ? avg(v).toFixed(1) : '—'
  }
  const wallAvg = (i) => {
    const v = runs.map((r) => r.wallFramesPerLap[i])
    return v.length ? Math.round(avg(v)) : 0
  }
  const wallPerLapStr = [0, 1, 2, 3].map(wallAvg).join('/')
  const swimAvg = avg(runs.map((r) => r.swims)).toFixed(1)
  const odom1 = runs.map((r) => r.lapOdom[0]).filter((x) => x != null)
  const odom1Str = odom1.length ? (avg(odom1) / lapArc).toFixed(3) : '—'
  const crashAvg = avg(runs.map((r) => r.crashes)).toFixed(1)
  console.log(
    key.padEnd(23) + finRate.padStart(5) + dnfLabel.padStart(9) +
    meanT.padStart(8) + minT.padStart(7) + maxT.padStart(7) + '  ' +
    [0, 1, 2, 3].map(lapAvg).map((s) => s.padStart(4)).join('  ') + '  ' +
    wallPerLapStr.padStart(8) + swimAvg.padStart(7) + crashAvg.padStart(7) + odom1Str.padStart(11) + meanSecs.padStart(10))
}

console.log('')
console.log('TRACK EFFECT (same policy, wall vs open — isolates what the coral itself costs):')
for (const steerName of Object.keys(LOOKS)) {
  for (const throttleName of Object.keys(THROTTLES)) {
    const wallRuns = rows[`wall ${steerName.padEnd(6)} ${throttleName}`]
    const openRuns = rows[`open ${steerName.padEnd(6)} ${throttleName}`]
    const wallFin = wallRuns.filter((r) => r.finished).map((r) => r.raceTime)
    const openFin = openRuns.filter((r) => r.finished).map((r) => r.raceTime)
    const label = `${steerName}/${throttleName}`.padEnd(14)
    if (wallFin.length && openFin.length) {
      console.log(`  ${label} wall ${avg(wallFin).toFixed(1)}s vs open ${avg(openFin).toFixed(1)}s  (Δ ${(avg(wallFin) - avg(openFin)).toFixed(1)}s)  finish ${wallRuns.filter((r) => r.finished).length}/${wallRuns.length} vs ${openRuns.filter((r) => r.finished).length}/${openRuns.length}`)
    } else {
      console.log(`  ${label} not enough finishes to diff (wall ${wallFin.length}/${wallRuns.length}, open ${openFin.length}/${openRuns.length})`)
    }
  }
}
console.log('')
console.log('POLICY EFFECT (same track, steering/throttle varied — isolates what the driving costs):')
for (const open of [false, true]) {
  const label = open ? 'open track' : 'wall track'
  const cells = Object.keys(LOOKS).flatMap((s) => Object.keys(THROTTLES).map((t) => ({ s, t, runs: rows[`${open ? 'open ' : 'wall '}${s.padEnd(6)} ${t}`] })))
  const withTimes = cells.map((c) => ({ ...c, fin: c.runs.filter((r) => r.finished).map((r) => r.raceTime) })).filter((c) => c.fin.length)
  if (withTimes.length < 2) { console.log(`  ${label}: not enough finishing policies to compare`); continue }
  const means = withTimes.map((c) => ({ name: `${c.s}/${c.t}`, mean: avg(c.fin) }))
  means.sort((a, b) => a.mean - b.mean)
  const fastest = means[0], slowest = means[means.length - 1]
  console.log(`  ${label}: fastest ${fastest.name} ${fastest.mean.toFixed(1)}s, slowest ${slowest.name} ${slowest.mean.toFixed(1)}s  (Δ ${(slowest.mean - fastest.mean).toFixed(1)}s)`)
}
