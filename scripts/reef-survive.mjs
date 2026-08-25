// CAN THE REEF CIRCUIT BE FINISHED WITH HP LIVE? Every other rig this project has for the chapter
// — run CT, run CD, scripts/reef-lap-probe.mjs — resets player.hp every frame ON PURPOSE, so until
// this file nothing had ever measured whether a race is survivable at all. That is a real hole:
// a coral tune that made the chapter unbeatable would leave the whole suite green.
//
// THREE RIGS ANSWERED THIS QUESTION WRONG BEFORE IT ANSWERED IT RIGHT, all three confidently, and
// every one of them blamed the game rather than itself. Read this before believing any number here:
//
//   1. A peer session drove the REAL game over CDP and died to an HP loss at 5.7-11.3s against a
//      ~19s lap, three driving strategies deep. Its steering ran over a 150-300ms WebSocket
//      round-trip against a throttle that reaches full speed in 0.54s. It reported the death
//      honestly as "my driver could not survive", which is the only reason this was not read as
//      a balance emergency.
//   2. THE FIRST VERSION OF THIS FILE AIMED AT caveAt().c — "steer down the middle". Where the
//      passage FORKS, the middle is the island: [c-ph, c+ph] is coral. So the best driver was
//      steering into the rock, NO STEERING beat both steering policies, and a sweep of
//      CAVE_HIT_DPS from 22 down to 2 (0.9 HP a tick, i.e. almost nothing) changed the finish rate
//      not at all — because the knob was never what was killing it.
//   3. THE SECOND VERSION FIXED THE TARGET AND ADDED A 220px LOOKAHEAD, which is a quarter of the
//      centre wave's 840px wavelength. That much phase lead makes the driver turn early and ride
//      the OUTSIDE wall: 1/8 finishes, against 7/8 for the same driver with no lookahead at all.
//
// So the lookahead and the steering gain are SWEPT here rather than chosen, and the row worth
// quoting is the best driver's — that is the floor on "can this be done", and a bad driver's death
// rate says nothing whatever about the chapter. As measured 2026-08-25 at CAVE_HIT_DPS 22:
// lookahead 80 / gain 30 finishes 8/8 in 74.8s having never touched the wall, while no-steering
// finishes 0/8. Survivable with HP to spare, fatal if you stop driving — which is the owner's
// 2026-08-23 ruling on the wall, working.
//
// mortal + a real driving policy is the ONLY rig whose output may be quoted as a survival rate.
// Takes a SRC ROOT as argv[1] so the same probe can be pointed at a scratch tree with one knob
// moved (git archive HEAD src | tar -x -C tmp) — the working tree is never edited to measure.
//
//   node scripts/reef-survive.mjs                 # this tree, every driver row
//   node scripts/reef-survive.mjs <srcRoot>       # a scratch tree with a knob moved
//   node scripts/reef-survive.mjs <srcRoot> --sweep   # sweep the DRIVER, print its ceiling
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
// Defaults to THIS checkout's src, so the common case needs no argument and cannot accidentally
// measure a stale scratch tree left over from an earlier sweep.
const SRC = process.argv[2] && !process.argv[2].startsWith('--')
  ? resolve(process.argv[2])
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const SWEEP = process.argv.includes('--sweep')

const { CHAPTERS, caveAt, laneAxes, SHOP, shopLines, bookOf, dmgSrcName, CAVE_HIT_DPS, CAVE_HIT_TICK } = await import(`${SRC}/config.js`)
const { createRun, ensureChapterMeta, ensureBookMeta } = await import(`${SRC}/state.js`)
const { stepSim, applyChoice } = await import(`${SRC}/sim.js`)

const DT = 1 / 60
const CH = 'reef'
const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88]
const MAX_SECS = 400

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const probeMeta = () => {
  const meta = { schema: 1, coins: 0, runs: 0, lang: 'en', chapter: CH, shop: Object.fromEntries(Object.keys(SHOP).map((id) => [id, 0])), best: { time: 0, kills: 0 }, chapters: {}, nick: 'PROBE' }
  ensureChapterMeta(meta, CH)
  meta.chapters[CH].unlocked = true
  const bm = ensureBookMeta(meta, bookOf(CH))
  for (const id of Object.keys(shopLines(bookOf(CH)))) bm.shop[id] = 0
  return meta
}

const ch0 = CHAPTERS[CH]
if (!ch0.circuit) { console.error('ABORT: reef declares no circuit'); process.exit(1) }
const LAX = laneAxes(ch0)
const LAPS = ch0.circuit.laps

// THE DRIVER, AND ITS FIRST CUT WAS WRONG IN A WAY THAT READ AS A BALANCE PROBLEM. caveAt returns
// {c, hw, ph}: the passage is [c-hw, c+hw], and where ph > 0 the band [c-ph, c+ph] is a coral
// ISLAND standing in the middle of it. Aiming at `c` — the obvious "steer down the middle" — drives
// straight into that rock, which is why the first sweep had NO STEERING beating both steering
// policies at every value of CAVE_HIT_DPS, and why lowering the knob to 0.9 HP a tick changed
// nothing. The rig was the defect. Ask whether the rig's own geometry moved before believing its
// damning number.
// BOTH MEASURED, NOT CHOSEN — see the --sweep grid in this file's header. 80px of lookahead with a
// gentle gain is the ceiling; 220 (a quarter of the centre wave's 840px) rides the outside wall.
const LOOKAHEAD = 80
const GAIN = 30
const openLane = (run, ahead) => {
  const f = run.player[LAX.fwd] + LAX.dir * ahead
  const { c, hw, ph } = caveAt(f, CHAPTERS[CH].cave, run._obstacleSeed)
  if (ph <= 0) return c
  // Commit to the side you are already on — both branches rejoin, so the cheap choice is the near one.
  const side = run.player[LAX.cross] >= c ? 1 : -1
  return c + side * (ph + hw) / 2
}
const STEERS = {
  // The best a player could plausibly do: an open lane, seen ahead, steered at proportionally.
  track: (run) => openLane(run, LOOKAHEAD),
  // The same driver with NO lookahead — reacting to the passage it is already in. This is the row
  // that says how much of the difficulty is reading ahead rather than reflexes.
  late: (run) => openLane(run, 0),
  // A SLOPPY driver: re-reads its target only every 0.30s and steers at where the passage WAS.
  lag: (run) => {
    if (run._probeT == null || (run._realTime - run._probeT) > 0.30) {
      run._probeT = run._realTime
      run._probeAim = openLane(run, LOOKAHEAD)
    }
    return run._probeAim
  },
  none: () => 0,
}
// PROPORTIONAL, not bang-bang: a +/-1 controller with a deadzone oscillates across the target
// and spends its life in the wall it is trying to leave.
const towardCross = (from, to, gain = GAIN) => Math.max(-1, Math.min(1, (to - from) / gain))

function oneRun({ steer, throttle, difficulty, seed, immortal, la = LOOKAHEAD, gain = GAIN }) {
  const orig = Math.random
  Math.random = mulberry32(seed)
  const run = createRun(probeMeta(), { chapter: CH, difficulty })
  if (run.chapter !== CH) { console.error(`ABORT: asked for ${CH}, got ${run.chapter}`); process.exit(1) }
  const steerFn = STEERS[steer]
  let crashes = 0, contactFrames = 0
  let hpFloor = run.player.maxHP
  while ((run._realTime ?? 0) < MAX_SECS) {
    const aim = steer === 'track' ? openLane(run, la) : steerFn(run)
    const steerIn = steer === 'none' ? 0 : towardCross(run.player[LAX.cross], aim, gain)
    stepSim(run, {
      x: LAX.cross === 'x' ? steerIn : (LAX.fwd === 'x' ? throttle : 0),
      y: LAX.cross === 'y' ? steerIn : (LAX.fwd === 'y' ? throttle : 0),
      skill: false,
    }, DT)
    for (const ev of run.events) if (ev.type === 'crash') crashes++
    run.events.length = 0
    if (run.phase === 'levelup') { applyChoice(run, 0); run.phase = 'playing' }
    if (run._caveHit) contactFrames++
    hpFloor = Math.min(hpFloor, run.player.hp)
    if (immortal) run.player.hp = run.player.maxHP
    if (run.phase === 'victory' || run.phase === 'dead') break
  }
  Math.random = orig
  const top = Object.entries(run.dmgBySrc ?? {}).sort((a, b) => b[1] - a[1])
  return {
    won: run.phase === 'victory', dead: run.phase === 'dead',
    killedBy: run.killedBy ?? null, at: run._realTime ?? 0, laps: run.lap ?? 0,
    hpFloor, crashes, contactS: contactFrames * DT, maxHP: run.player.maxHP,
    dmg: top.slice(0, 2).map(([k, v]) => `${dmgSrcName(k) ?? k} ${Math.round(v)}`).join(', ') || '-',
  }
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const row = (label, opts) => {
  const rs = SEEDS.map((seed) => oneRun({ ...opts, seed }))
  const wins = rs.filter((r) => r.won)
  console.log(
    label.padEnd(30) +
    `${wins.length}/${SEEDS.length}`.padEnd(8) +
    (wins.length ? `${mean(wins.map((r) => r.at)).toFixed(1)}s` : `died ${mean(rs.map((r) => r.at)).toFixed(1)}s`).padEnd(13) +
    `laps ${mean(rs.map((r) => r.laps)).toFixed(1)}`.padEnd(10) +
    `hp->${mean(rs.map((r) => r.hpFloor)).toFixed(0)}`.padEnd(9) +
    `contact ${mean(rs.map((r) => r.contactS)).toFixed(1)}s`.padEnd(15) +
    `crashes ${mean(rs.map((r) => r.crashes)).toFixed(0)}`)
  return { wins: wins.length, n: SEEDS.length, hpFloor: mean(rs.map((r) => r.hpFloor)) }
}

console.log(`\nsrc ${SRC}\nCAVE_HIT_DPS ${CAVE_HIT_DPS} on a ${CAVE_HIT_TICK}s tick = ${(CAVE_HIT_DPS * CAVE_HIT_TICK).toFixed(1)} HP a tick. ${SEEDS.length} seeds, ${LAPS} laps, mortal.\n`)
if (SWEEP) {
  console.log('driver'.padEnd(30) + 'won'.padEnd(8) + 'time'.padEnd(13) + 'laps'.padEnd(10) + 'hp floor'.padEnd(9) + 'wall contact'.padEnd(15) + 'crashes')
  console.log('-'.repeat(110))
  // FIND THE DRIVER'S OWN CEILING BEFORE QUOTING A SURVIVAL RATE. Two sweeps in a row were decided
  // by the RIG rather than by the knob under test, so the lookahead and the steering gain are swept
  // as parameters here. The number worth reporting is the BEST driver's, because that is the floor
  // on "can this be done at all" — a bad driver's death rate says nothing about the chapter.
  let best = { wins: -1, hpFloor: -1 }
  for (const la of [0, 40, 80, 140, 220]) {
    for (const gain of [30, 60, 120]) {
      const r = row('  lookahead ' + String(la).padEnd(3) + ' gain ' + gain, { steer: 'track', throttle: 1, difficulty: 1, immortal: false, la, gain })
      if (r.wins > best.wins || (r.wins === best.wins && r.hpFloor > best.hpFloor)) best = Object.assign({}, r, { la, gain })
    }
  }
  const bad = row('  no steering at all', { steer: 'none', throttle: 1, difficulty: 1, immortal: false })
  console.log('VERDICT best driver ' + best.wins + '/' + best.n + ' at lookahead ' + best.la + ' gain ' + best.gain + ' (hp floor ' + best.hpFloor.toFixed(0) + ');  nosteer ' + bad.wins + '/' + bad.n)
} else {
  console.log('rig'.padEnd(30) + 'won'.padEnd(8) + 'time'.padEnd(13) + 'laps'.padEnd(10) + 'hp floor'.padEnd(9) + 'wall contact'.padEnd(15) + 'crashes')
  console.log('-'.repeat(110))
  for (const d of [1, 3]) {
    console.log(`--- difficulty ${d}`)
    row('  best driver (la 80/gain 30)', { steer: 'track', throttle: 1, difficulty: d, immortal: false })
    row('  no lookahead at all', { steer: 'late', throttle: 1, difficulty: d, immortal: false })
    row('  0.30s-lag steer, full', { steer: 'lag', throttle: 1, difficulty: d, immortal: false })
    row('  no steering at all', { steer: 'none', throttle: 1, difficulty: d, immortal: false })
    row('  IMMORTAL control (track)', { steer: 'track', throttle: 1, difficulty: d, immortal: true })
  }
  console.log('\nPER SEED (d1, track steer, full throttle):')
  for (const seed of SEEDS) {
    const r = oneRun({ steer: 'track', throttle: 1, difficulty: 1, seed, immortal: false })
    console.log(`  seed ${String(seed).padEnd(4)} ${r.won ? `WON ${r.at.toFixed(1)}s` : `died to ${r.killedBy} at ${r.at.toFixed(1)}s`}, lap ${r.laps}, ${r.crashes} crashes, ${r.contactS.toFixed(1)}s in the wall — ${r.dmg}`)
  }
}
