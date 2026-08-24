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
//   - NO CRASH SPEED PENALTY. Design §4's `_laneSpeed *= CIRCUIT_CRASH_MUL` + steering lock have not
//     shipped — only momentum (CIRCUIT_ACCEL) and the wall's HP scrape have. A "centre" policy here
//     pays in CAVE_BOUNCE_PX pushback and scrape frames, not yet in a speed lock. Re-run this file
//     once crash/clip/slick land; today's numbers are honest for what is shipped and will change.
//
// CIRCUIT_ACCEL/CLOCK_START/CLOCK_CAP/SWIM_TIME are NOT overridable from here — they are primitive
// `export const`s, not object properties, so this file cannot reassign them the way charge-probe.mjs
// overrides `res.drainPerSpawn`. Sweeping them needs a source change first; noted, not worked around.
import { createRun, ensureBookMeta, ensureChapterMeta } from '../src/state.js'
import { stepSim, applyChoice } from '../src/sim.js'
import { CHAPTERS, laneAxes, caveAt, bookOf, shopLines } from '../src/config.js'

const CH = 'reef'
const DT = 1 / 60
const MAX_SECS = 300   // safety valve only — every policy below either finishes or dies to the
                        // clock well under this; a run that hits it prints 'timeout', not a number
const SEEDS = [1001, 2002, 3003]   // fixed, same list as reef-astern.mjs/reef-pileup.mjs
const DIFFICULTY = Number(process.argv.find((a) => a.startsWith('--difficulty='))?.slice(13) ?? 1)

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
if (!ch0.circuit || !ch0.cave?.lapLen) { console.error(`ABORT: ${CH} declares no circuit/cave.lapLen — nothing to lap-time`); process.exit(1) }
const LAX = laneAxes(ch0)
const LAPS = ch0.circuit.laps

// STEERING. `centre` ignores the passage's own wander and holds the lane's absolute middle — the
// floor half of the cross product, since the passage wanders ±(halfMax) off 0 (CHAPTERS.reef.cave).
// `track` follows caveAt's own live centre exactly, the same "steer at the true target" idiom
// charge-probe.mjs's LANE_MOVES.pocket and reef-burst-grid.mjs's MOVES.groove already use.
const STEERS = {
  centre: () => 0,
  track: (run) => caveAt(run.player[LAX.fwd], CHAPTERS[CH].cave, run._obstacleSeed).c,
}
// THROTTLE — the axis this file exists to add. -1/1 are the stick's own extremes (CHAPTERS.reef.
// laneThrottle: 0.5x/3x), not values invented here.
const THROTTLES = { min: () => -1, max: () => 1 }

const towardCross = (from, to) => (Math.abs(to - from) < 8 ? 0 : to > from ? 1 : -1)

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
  const steerFn = STEERS[steerName], throttleFn = THROTTLES[throttleName]

  let wallFrames = 0
  const wallFramesPerLap = new Array(LAPS).fill(0)
  const lapSplits = [], lapOdom = []
  let odom = 0
  let swims = 0
  let prevAlong = run.player[LAX.fwd] * LAX.dir

  while ((run._realTime ?? 0) < MAX_SECS) {
    const target = steerFn(run)
    const steerIn = towardCross(run.player[LAX.cross], target)
    const fwdIn = throttleFn()
    const move = {
      x: LAX.cross === 'x' ? steerIn : (LAX.fwd === 'x' ? fwdIn : 0),
      y: LAX.cross === 'y' ? steerIn : (LAX.fwd === 'y' ? fwdIn : 0),
    }
    stepSim(run, { x: move.x, y: move.y, skill: false }, DT)

    for (const ev of run.events) {
      if (ev.type === 'swimthrough') swims++
      if (ev.type === 'lap') { lapSplits.push(ev.split); lapOdom.push(odom); odom = 0 }
    }
    run.events.length = 0
    if (run.phase === 'levelup') { applyChoice(run, 0); run.phase = 'playing' }

    const along = run.player[LAX.fwd] * LAX.dir
    odom += Math.abs(along - prevAlong)
    prevAlong = along

    if (run._caveHit) { wallFrames++; wallFramesPerLap[Math.min(run.lap ?? 0, LAPS - 1)]++ }

    // Immortal to HP, mortal to the clock — see the file header for why this is three mechanics
    // neutralised on purpose and one left fully live.
    run.player.hp = run.player.maxHP

    if (run.phase === 'victory' || run.phase === 'dead') break
  }
  Math.random = orig

  return {
    finished: run.phase === 'victory',
    timedOut: run.phase === 'playing',
    killedBy: run.phase === 'dead' ? (run.killedBy ?? '?') : null,
    raceTime: run.phase === 'victory' ? run.raceTime : null,
    lapsCompleted: run.lap ?? 0,
    lapSplits, lapOdom, wallFrames, wallFramesPerLap, swims,
    secs: run._realTime ?? 0,
  }
}

const avg = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length

console.log(`chapter=${CH} book=${bookOf(CH)} difficulty=${DIFFICULTY} laps=${LAPS} lapLen=${ch0.cave.lapLen} laneThrottle=${JSON.stringify(ch0.laneThrottle)} x ${SEEDS.length} seeded runs, immortal-to-HP + mortal-to-clock`)
console.log('')

const rows = {}
for (const open of [false, true]) {
  for (const steerName of Object.keys(STEERS)) {
    for (const throttleName of Object.keys(THROTTLES)) {
      const key = `${open ? 'open ' : 'wall '}${steerName.padEnd(6)} ${throttleName}`
      rows[key] = SEEDS.map((seed) => withTrack(open, () => oneRun(steerName, throttleName, seed)))
    }
  }
}

console.log('policy                 fin  DNF        time    min    max  lap1  lap2  lap3  lap4  wall/lap  swims  odom1/5040  meanSecs')
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
  const odom1Str = odom1.length ? (avg(odom1) / ch0.cave.lapLen).toFixed(3) : '—'
  console.log(
    key.padEnd(23) + finRate.padStart(5) + dnfLabel.padStart(9) +
    meanT.padStart(8) + minT.padStart(7) + maxT.padStart(7) + '  ' +
    [0, 1, 2, 3].map(lapAvg).map((s) => s.padStart(4)).join('  ') + '  ' +
    wallPerLapStr.padStart(8) + swimAvg.padStart(7) + odom1Str.padStart(12) + meanSecs.padStart(10))
}

console.log('')
console.log('TRACK EFFECT (same policy, wall vs open — isolates what the coral itself costs):')
for (const steerName of Object.keys(STEERS)) {
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
  const cells = Object.keys(STEERS).flatMap((s) => Object.keys(THROTTLES).map((t) => ({ s, t, runs: rows[`${open ? 'open ' : 'wall '}${s.padEnd(6)} ${t}`] })))
  const withTimes = cells.map((c) => ({ ...c, fin: c.runs.filter((r) => r.finished).map((r) => r.raceTime) })).filter((c) => c.fin.length)
  if (withTimes.length < 2) { console.log(`  ${label}: not enough finishing policies to compare`); continue }
  const means = withTimes.map((c) => ({ name: `${c.s}/${c.t}`, mean: avg(c.fin) }))
  means.sort((a, b) => a.mean - b.mean)
  const fastest = means[0], slowest = means[means.length - 1]
  console.log(`  ${label}: fastest ${fastest.name} ${fastest.mean.toFixed(1)}s, slowest ${slowest.name} ${slowest.mean.toFixed(1)}s  (Δ ${(slowest.mean - fastest.mean).toFixed(1)}s)`)
}
