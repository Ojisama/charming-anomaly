// WHAT R13 (a Burst crosses a coral ridge free) ACTUALLY COSTS AND BUYS, over real Reef runs.
//
//   node scripts/reef-burst-grid.mjs [--src <dir>] [--crowd on|off] [--seeds N] [--secs N]
//                                    [--moves a,b] [--bursts a,b] [--airgate N] [--label X]
//
// THE DENOMINATOR EVERY ROW IS AN AVERAGE OVER, and it is NOT the shipped-run denominator — quote
// it with the number or the number means nothing. Defaults: chapter reef, difficulty 3, 300s per
// run, 3 seeds (7, 7926, 15845 — fixed, so two invocations are comparable), one movement policy and
// one burst policy per row, level-ups accepted first-offer, player immortal, and CROWD OFF.
//   ⚠ CROWD OFF IS THE DEFAULT AND IT DELETES HALF THE BUTTON. The press also fires the Pulse's
// shove (stepRepulse), so a crowd-free table prices the Air and none of what the Air bought; with no
// enemies the kills column is 0 and the player never levels either. Pass --crowd on for the other
// half. The pair is the answer; a single crowd-off row is a cost with its benefit deleted.
//
// The question is NOT "is the waiver good" but "which HP column does it move, and does the player's
// POLICY decide the sign". R13 was measured once, against ONE policy (scrape, below), on a
// wall-pinned rig with the crowd emptied — and that pairing is the worst case for the waiver by
// construction: a wall-pinned player is inside coral at every ridge (the lane wall is |cross| 430
// and a groove's far edge never passes 340), so scrape fires the button ~50 times in 300s and pays
// 45 Air each time for a waiver on a ridge a groove would have crossed for nothing.
//
// THE COLUMNS, all off run.dmgBySrc (sim.js's own attribution funnel — HP actually lost, after
// armor and the cap, never the raw swing):
//   scrape   SPUR_DPS inside coral            drown    an empty Air bar
//   contact  the three roster ids             NET      every source summed
//
// THE RIG: immortal (hp restored AFTER the step, so damage still happens and still tallies),
// difficulty 3, 300s, N seeded runs, level-ups accepted first-offer. Immortal because the question
// is what the mechanic costs over a full run, not whether one scripted walk survives it — two
// earlier probes in this repo reported full-looking tables for 36s runs that had simply died.
//
// TWO AXES, because one policy cannot tell a bad ruling from a bad player (CLAUDE.md's kiting-rig
// rule). Never quote one row:
//   MOVEMENT — the only decision a lane gives you is where to sit across it.
//     wall    pinned against the lane wall. THE CRITIC'S RIG, kept so its number is reproducible.
//             Never in a groove and never in a pocket's reachable half: a floor, not a player.
//     centre  hold the middle. Crosses coral at every ridge whose braid is not open at 0, and
//             (per CHAPTERS.reef.signature) can physically never touch a pocket.
//     groove  steer at the nearest channel of the ridge ahead. The level's own verb.
//     pocket  steer at the nearest reachable air pocket ahead. The bar's own verb.
//     both    groove when a ridge is imminent, pocket the rest of the time. The honest player.
//   BURST — when the button is pressed. never is the DO-NOTHING CONTROL and is present at every
//           point in every sweep (memory: probe-needs-a-do-nothing-control).
//     never   never pressed.
//     scrape  pressed while already scraping. THE CRITIC'S POLICY.
//     gate    pressed only to cross a ridge whose grooves cannot be reached in time, and only with
//             Air above --airgate. The policy R13 describes: a waiver used as a waiver.
//     cd      pressed the instant the cooldown allows. The ceiling on spend.
//
import { readFileSync } from 'node:fs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d }
const SRC = arg('--src', new URL('../src', import.meta.url).pathname)
const CROWD = arg('--crowd', 'off')
const SEEDS = Number(arg('--seeds', 3))
const SECS = Number(arg('--secs', 300))
const AIR_GATE = Number(arg('--airgate', 55))
const LABEL = arg('--label', '')
// Validate every argument that bounds a loop: a probe that cannot measure must abort, never print
// (CLAUDE.md — a 0/0 and a real zero look identical).
for (const [k, v] of [['--seeds', SEEDS], ['--secs', SECS], ['--airgate', AIR_GATE]])
  if (!(v > 0)) { console.error(`ABORT: ${k} must be a positive number, got "${v}"`); process.exit(1) }
if (CROWD !== 'on' && CROWD !== 'off') { console.error(`ABORT: --crowd must be on|off, got "${CROWD}"`); process.exit(1) }

const state = await import(`${SRC}/state.js`)
const sim = await import(`${SRC}/sim.js`)
const cfg = await import(`${SRC}/config.js`)
const { createRun, ensureBookMeta, ensureChapterMeta } = state
const { stepSim, applyChoice } = sim
const { CHAPTERS, PULSE_CHARGE_COST, BURST_SPEED_MUL, SPUR_DPS, laneAxes, laneScrollFor, laneHalfWidth, bookOf, shopLines } = cfg

const CH = 'reef'
const ch = CHAPTERS[CH]
const LAX = laneAxes(ch)
const SCROLL = laneScrollFor(ch)
const DT = 1 / 60

// The variant tree's OWN numbers, read from the tree that is actually being stepped. Printed in the
// header so a --src sweep cannot quietly report the working tree's constants over a variant's runs.
const KNOBS = `laneScroll ${ch.laneScroll} BURST_SPEED_MUL ${BURST_SPEED_MUL} PULSE_CHARGE_COST ${PULSE_CHARGE_COST} SPUR_DPS ${SPUR_DPS} drain ${ch.resource.drain} drown ${ch.resource.drown.dps}`
// Does this tree still waive the scrape at all, and does the dash multiply the CROSS speed instead
// of the scroll? Read as source text, because each is one line and a table would look identical
// either way — the same source-text trick run UG.k uses on render.js.
const simSrc = readFileSync(`${SRC}/sim.js`, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
const WAIVER = /_burstT[^\n]*\)\s*>\s*0\)\s*inside\s*=\s*false/.test(simSrc)
const CROSS_ONLY = /vCross\][^\n]*burstMul/.test(simSrc)

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function probeMeta() {
  const meta = { coins: 0, shop: {}, choiceSlots: 2, best: {}, runs: 0, chapters: {}, dev: true }
  ensureChapterMeta(meta, CH)
  meta.chapters[CH].unlocked = true
  const bm = ensureBookMeta(meta, bookOf(CH))
  for (const id of Object.keys(shopLines(bookOf(CH)))) bm.shop[id] = 0
  return meta
}

const crossInput = (v) => (LAX.cross === 'x' ? { x: v, y: 0 } : { x: 0, y: v })
const toward = (from, to) => crossInput(Math.abs(to - from) < 8 ? 0 : to > from ? 1 : -1)

// The ridge the scroll is about to hand you: the nearest one whose TRAILING edge is still ahead.
// Includes the ridge the player is already inside, which is deliberate — that is exactly when the
// gate policy has to decide whether it is too late to steer.
function ridgeAhead(run) {
  const p = run.player
  let best = null, bd = Infinity
  for (const sp of run.spurs) {
    const d = (sp.f + sp.thick / 2 - p[LAX.fwd]) * LAX.dir
    if (d < 0) continue
    if (d < bd) { bd = d; best = sp }
  }
  return best
}
// Seconds until the coral starts, and the cross gap to the nearest channel through it.
function approach(run, sp) {
  const p = run.player, c = p[LAX.cross]
  const secs = Math.max(0, ((sp.f - sp.thick / 2 - p[LAX.fwd]) * LAX.dir) / SCROLL)
  let gap = Infinity, aim = 0
  for (const g of sp.grooves) {
    const d = Math.abs(c - g.c)
    if (d < gap) { gap = d; aim = g.c }
  }
  return { secs, gap, aim }
}
const HW = laneHalfWidth(600)
const clampCross = (v) => Math.max(-HW, Math.min(HW, v))
const strafeOf = (run) => run.player.speed * 1.25 * (run._scraping ? 0.6 : 1)

// charge-probe.mjs's LANE_MOVES.pocket, so the two rigs cannot disagree about what "working the
// pockets" means. A pocket level with or behind you is gone — nothing in this mode turns round.
function pocketInput(run) {
  const p = run.player
  if (run.charge >= run.chargeMax - 0.01) return toward(p[LAX.cross], 0)
  const strafe = p.speed * 1.25
  let best = null, bd = Infinity
  for (const sh of run.shafts) {
    const ahead = (sh[LAX.fwd] - p[LAX.fwd]) * LAX.dir
    if (ahead < -sh.r) continue
    const secs = Math.max(0.01, (ahead + sh.r) / SCROLL)
    if (Math.abs(sh[LAX.cross] - p[LAX.cross]) > strafe * secs + sh.r) continue
    if (ahead < bd) { bd = ahead; best = sh }
  }
  return toward(p[LAX.cross], best ? best[LAX.cross] : 0)
}

const MOVES = {
  wall: () => crossInput(1),
  centre: (run) => toward(run.player[LAX.cross], 0),
  groove: (run) => {
    const sp = ridgeAhead(run)
    if (!sp) return crossInput(0)
    return toward(run.player[LAX.cross], clampCross(approach(run, sp).aim))
  },
  pocket: (run) => pocketInput(run),
  both: (run) => {
    const sp = ridgeAhead(run)
    if (sp) {
      const { secs, gap, aim } = approach(run, sp)
      // Close enough that the channel is the only thing worth steering at: the time left is only
      // just enough to close the gap. Outside that window there is nothing to do about it either way.
      if (gap > 0 && secs * strafeOf(run) < gap * 1.8) return toward(run.player[LAX.cross], clampCross(aim))
    }
    return pocketInput(run)
  },
}

const BURSTS = {
  never: () => false,
  scrape: (run) => !!run._scraping,
  cd: () => true,
  gate: (run) => {
    if (run.charge < AIR_GATE) return false
    const sp = ridgeAhead(run)
    if (!sp) return false
    const { secs, gap } = approach(run, sp)
    if (secs > 1.2) return false                      // not yet the decision
    return gap > secs * strafeOf(run)                 // no channel reachable in the time left
  },
}

function one(moveName, burstName, seed) {
  const orig = Math.random
  Math.random = mulberry32(seed)
  const run = createRun(probeMeta(), { chapter: CH, difficulty: 3 })
  if (run.chapter !== CH) { console.error(`ABORT: asked for ${CH}, got ${run.chapter}`); process.exit(1) }
  const move = MOVES[moveName], wants = BURSTS[burstName]
  const x0 = run.player[LAX.fwd]
  let steps = 0, bursts = 0, coral = 0, atZero = 0, air = 0, ridges = 0, lastIdx = null
  for (let t = 0; t < SECS; t += DT) {
    const skill = (run.repulseCd ?? 0) <= 0 && wants(run)
    const m = move(run)
    stepSim(run, { x: m.x, y: m.y, skill }, DT)
    for (const ev of run.events) if (ev.type === 'burst') bursts++
    run.events.length = 0
    if (run.phase === 'levelup') { applyChoice(run, 0); run.phase = 'playing' }
    if (CROWD === 'off') run.enemies.length = 0
    run.player.hp = run.player.maxHP        // immortal, AFTER the step: damage still tallies
    if (run.phase !== 'playing') break
    steps++
    if (run._scraping) coral++
    if (run.charge <= 0.01) atZero++
    air += run.charge
    if (run._spurIdx !== lastIdx) { if (lastIdx != null) ridges++; lastIdx = run._spurIdx }
  }
  Math.random = orig
  const d = run.dmgBySrc ?? {}
  const contact = ch.roster.reduce((a, r) => a + (d[r.id] ?? 0), 0)
  const net = Object.values(d).reduce((a, v) => a + v, 0)
  return { scrape: d.scrape ?? 0, drown: d.drown ?? 0, contact, other: net - (d.scrape ?? 0) - (d.drown ?? 0) - contact,
           net, bursts, coral: coral * DT, atZero: atZero / steps, air: air / steps,
           dist: (run.player[LAX.fwd] - x0) * LAX.dir, ridges, kills: run.kills, secs: steps * DT }
}

const MOVE_NAMES = arg('--moves', 'wall,centre,groove,pocket,both').split(',')
const BURST_NAMES = arg('--bursts', 'never,scrape,gate,cd').split(',')
for (const n of MOVE_NAMES) if (!MOVES[n]) { console.error(`ABORT: no movement policy "${n}"`); process.exit(1) }
for (const n of BURST_NAMES) if (!BURSTS[n]) { console.error(`ABORT: no burst policy "${n}"`); process.exit(1) }
if (BURST_NAMES[0] !== 'never') { console.error('ABORT: the first --bursts entry must be never — it is the do-nothing control every delta is read against'); process.exit(1) }

console.log(`${LABEL ? LABEL + '  ' : ''}chapter=${CH} d3 ${SECS}s x ${SEEDS} seeds  crowd=${CROWD}  airgate=${AIR_GATE}`)
console.log(`  ${KNOBS}  waiver=${WAIVER ? 'ON' : 'OFF'}  burstAxis=${CROSS_ONLY ? 'cross' : 'scroll'}  laneHalfWidth=${HW}  src=${SRC}`)
// EVERY COLUMN CARRIES ITS OWN SPREAD, AND THEY ARE NOT THE SAME SIZE. Reading a delta in SCRAPE
// against sd of NET is how this rig was once made to report "below the noise floor": at wall/scrape
// sd(NET) is 65 and sd(scrape) is 13. Both are printed now, each beside the column it belongs to,
// and a delta is only noise when it is under ~1 sd/sqrt(seeds) OF ITS OWN COLUMN (CLAUDE.md's
// under-powered-band protocol). d(scrape) and d(NET) are both read against the `never` control.
//   ⚠ AND A CROSS-TREE DELTA — this table against a --src variant's — MUST BE PAIRED PER SEED, not
// read off these two means. The seeds are fixed, so seed n's two runs share a starting world; the
// paired spread is several times tighter than either column's own sd, which is what makes a small
// effect readable at all. R13 measured that way is -5.6 +/- 3.6 HP of scrape over 5 seeds (sem 1.6)
// — small, consistent, and a GAIN. It is NOT the ~40 HP that coralS x SPUR_DPS suggests: waiving
// the scrape also lifts SPUR_SLOW_MUL, so the bursting player travels further and crosses more
// coral, and most of the waived damage comes back as extra ridges.
console.log('policy            scrape  sd(scr)  d(scr)   drown contact   other     NET  sd(NET)   d(NET)  bursts  coralS   %air0  meanAir     dist  ridges  kills')
const seeds = Array.from({ length: SEEDS }, (_, i) => 7 + i * 7919)
for (const mn of MOVE_NAMES) {
  let base = null
  for (const bn of BURST_NAMES) {
    const rows = seeds.map((s) => one(mn, bn, s))
    const a = (k) => rows.reduce((x, r) => x + r[k], 0) / rows.length
    const sdOf = (k) => (rows.length < 2 ? 0 : Math.sqrt(rows.reduce((x, r) => x + (r[k] - a(k)) ** 2, 0) / (rows.length - 1)))
    if (base === null) base = { net: a('net'), scrape: a('scrape') }
    const d = (k) => (bn === BURST_NAMES[0] ? '—' : `${a(k) - base[k] > 0 ? '+' : ''}${(a(k) - base[k]).toFixed(0)}`)
    console.log(`${mn.padEnd(7)}${bn.padEnd(8)}` +
      a('scrape').toFixed(0).padStart(7) + sdOf('scrape').toFixed(0).padStart(9) + d('scrape').padStart(8) +
      a('drown').toFixed(0).padStart(8) + a('contact').toFixed(0).padStart(8) +
      a('other').toFixed(0).padStart(8) + a('net').toFixed(0).padStart(8) + sdOf('net').toFixed(0).padStart(9) +
      d('net').padStart(9) +
      a('bursts').toFixed(0).padStart(8) + a('coral').toFixed(0).padStart(8) +
      (a('atZero') * 100).toFixed(0).padStart(8) + a('air').toFixed(0).padStart(9) +
      a('dist').toFixed(0).padStart(9) + a('ridges').toFixed(0).padStart(8) + a('kills').toFixed(0).padStart(7))
  }
}
