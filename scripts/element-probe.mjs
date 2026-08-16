// Element accumulator probe — what the elements redesign's rolling window ACTUALLY does, headless.
//
// Written for docs/superpowers/specs/2026-08-13-elements-redesign-design.md, whose central idea is
// that every status is bought with damage relative to the enemy's own health:
//
//     recent = (HP removed from this enemy in the last STATUS_DURATION seconds) / enemy.maxHP
//     slow   = min(1, recentCold x COLD_MUL x sqrt(P));   slow >= 1 means frozen
//     amp    = recentVenom x VENOM_MUL x sqrt(P)
//
// WHY THIS EXISTS. Revisions 1 and 2 of that spec derived their numbers by hand, and two adversarial
// reviews found the same class of error both times — arithmetic about the accumulator that a
// 30-line script settles in seconds. Three shipped in revision 2 alone:
//
//   1. The ring buffer subtracted the bucket it had just WRITTEN instead of the oldest one, making
//      the window 0.5s instead of 3s. Every threshold in the document was off by 6x.
//   2. Cold "consumed" its meter with a scalar `coldSpent` clamped by min(coldSpent, recent). Under
//      sustained fire `recent` sawtooths, the clamp ratchets down to each trough, and the effective
//      meter collapses to one bucket -- one freeze per enemy for the rest of its life.
//   3. The post-freeze resist multiplied the same product the freeze threshold is read from, so
//      "75% less effective" was arithmetically "cannot freeze at any rarity on the ladder".
//
// So: MODEL THE ACCUMULATOR HERE, drive it with real damage traces from real runs, and let the
// spec quote what came out. --selftest catches (1) and (2) directly and fails loudly.
//
// WHAT IS MEASURED vs WHAT IS MODELLED — read this before quoting a number:
//   MEASURED: every HP removal, per enemy, per step, from real stepSim runs. That is the input
//     trace, and it includes hazards, DoTs, arcs and everything else, exactly as the spec's
//     "all damage counts" rule requires.
//   MODELLED: the window, the slow, the freeze and the amp are computed here, not by sim.js --
//     the game does not implement them yet. That is the point.
//   NOT CAPTURED: venom's feedback loop. The spec has dealDamage multiply by (1 + amp) BEFORE the
//     result lands in the window, so a real venom build removes HP faster than these traces do and
//     every number below is a FLOOR for venom. Modelling it properly means changing kill times,
//     which changes the trace, which needs the change in sim.js. Do not quote venom's amp as final.
//
// TRAPS THIS RIG ALREADY AVOIDS (all four are documented in CLAUDE.md, all four have bitten):
//   - createRun takes an OPTIONS OBJECT. createRun(meta, 'city', 3) silently gives body at d1.
//     The header printout states run.chapter so a wrong chapter cannot go unnoticed.
//   - Math.random is seeded per run (mulberry32, the suite's own), and averaged over several seeds.
//   - run.events is drained every step exactly as main.js does.
//   - HP removed is diffed across the step. A 'hit' event's dmg is the RAW SWING and credits
//     overkill in full -- it is the wrong numerator for a fraction-of-health measurement.
//   - The full 300s is the default: WAVE_TABLE gates `tank` behind t=140s, so a shorter run cannot
//     see the enemies the freeze rules are most argued about.
//
// Usage:
//   node scripts/element-probe.mjs --selftest
//   node scripts/element-probe.mjs --chapter undergrowth
//   node scripts/element-probe.mjs --chapter city --coldmul 1,2,3 --p 1,2,4,9
//   node scripts/element-probe.mjs --chapters body,undergrowth,city,garden --secs 300
//
// ponytail: seeds and duration are fixed inputs, not a convergence check. Three 300s runs ranks
// tunings; it does not resolve a 2% difference between two COLD_MUL values.

import { createRun, ensureBookMeta } from '../src/state.js'
import { stepSim, applyChoice } from '../src/sim.js'
import { CHAPTERS, bookOf, shopLines, BOOK_ORDER } from '../src/config.js'

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d }
const nums = (s) => String(s).split(',').filter(Boolean).map(Number)

const SECS = Number(arg('secs', 300))
const DIFFICULTY = Number(arg('difficulty', 3))
const SEEDS = nums(arg('seeds', '1001,2002,3003'))
const CHAPTERS_ARG = arg('chapters', arg('chapter', 'undergrowth')).split(',')
const COLD_MULS = nums(arg('coldmul', '1,2,3'))
const P_LADDER = nums(arg('p', '1,2,4,9'))
const DT = 1 / 60

// --- the model under test ----------------------------------------------------------------------

const STATUS_DURATION = 3
const BUCKETS = 6                        // 0.5s each
const BUCKET_S = STATUS_DURATION / BUCKETS
const FREEZE_DURATION = 2
const FREEZE_RESIST_T = 5

// The rolling window. One per element per enemy: cold clears its own on freeze, which is why they
// cannot be shared (revision 2 shared one and needed a scalar to "consume" it -- see trap 2 above).
function makeWindow() { return { total: 0, buckets: new Array(BUCKETS).fill(0), head: 0, acc: 0 } }

function winAdd(w, x) { w.buckets[w.head] += x; w.total += x }

// ADVANCE FIRST, then clear what is now the oldest bucket. Doing it the other way round evicts the
// bucket just written and silently shortens the window to one bucket.
function winStep(w, dt) {
  w.acc += dt
  while (w.acc >= BUCKET_S) {
    w.acc -= BUCKET_S
    w.head = (w.head + 1) % BUCKETS
    w.total -= w.buckets[w.head]
    w.buckets[w.head] = 0
  }
  if (w.total < 0) w.total = 0            // float residue only; a negative total is a bug elsewhere
}

function winClear(w) { w.buckets.fill(0); w.total = 0 }

// Owner ruling 2026-08-13: ONLY elites carrying the `anchored` affix are unfreezable. `unshakeable`
// tanks are ordinary heavy enemies for cold -- they resist by having more health, nothing else.
function neverFreezes(e) { return !!(e.affixes && e.affixes.includes('anchored')) }

// --- self-check --------------------------------------------------------------------------------
// These are the two failures revision 2 shipped. Both are cheap and both must stay.

function selftest() {
  let fails = 0
  const ok = (name, cond, got) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `   got ${got}`}`); if (!cond) fails++ }

  // 1. A constant input rate must plateau at rate x STATUS_DURATION, not at one bucket's worth.
  const w = makeWindow()
  const rate = 0.2                        // per second
  for (let i = 0; i < Math.round(20 / DT); i++) { winAdd(w, rate * DT); winStep(w, DT) }
  const plateau = w.total
  ok('window plateaus at rate x 3s', Math.abs(plateau - rate * STATUS_DURATION) < 0.05, plateau.toFixed(3))

  // 2. ...and drains to nothing within one window after input stops.
  for (let i = 0; i < Math.round(STATUS_DURATION / DT) + 2; i++) winStep(w, DT)
  ok('window drains to 0 within 3s', w.total < 1e-6, w.total.toFixed(6))

  // 3. Contributions expire independently: a big one and a small one, the big one first.
  const w2 = makeWindow()
  winAdd(w2, 0.6)
  for (let i = 0; i < Math.round(1.0 / DT); i++) winStep(w2, DT)
  winAdd(w2, 0.1)
  for (let i = 0; i < Math.round(2.2 / DT); i++) winStep(w2, DT)   // t=3.2: the 0.6 is gone
  ok('big contribution expires on its own clock', Math.abs(w2.total - 0.1) < 1e-6, w2.total.toFixed(3))

  // 4. A freeze clears cold's window outright, and it refills from new damage only -- no ratchet.
  const w3 = makeWindow()
  winAdd(w3, 0.5); winClear(w3)
  winAdd(w3, 0.2)
  for (let i = 0; i < Math.round(0.6 / DT); i++) winStep(w3, DT)
  ok('post-freeze meter reads new damage in full', Math.abs(w3.total - 0.2) < 1e-6, w3.total.toFixed(3))

  console.log(fails === 0 ? '\nALL SELFTESTS PASSED' : `\n${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
}

// --- the rig -----------------------------------------------------------------------------------

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --chapters can list chapters from more than one book in a single invocation, so the book has to
// be resolved PER CHAPTER rather than once — hand-built meta never passes through loadMeta, so it
// has to build each book's shop shape itself: ensureBookMeta returns `meta` for book1 but a fresh
// meta.books[id] for every other book, and only shopLines(bookId) knows that book's own lines.
// All zero here (no shop knob on this probe), but built the honest way regardless.
const makeMeta = (chapter) => {
  const meta = {
    coins: 0,
    shop: {},
    best: { time: 0, kills: 0 },
    runs: 0,
    // Unlock every chapter, exactly as a real save would: with chapters:{} ensureChapterMeta defaults
    // `unlocked` to body alone and resolveChapterId quietly falls back.
    chapters: Object.fromEntries(Object.keys(CHAPTERS).map((id) => [id, { unlocked: true, maxDifficulty: 5 }])),
  }
  const bm = ensureBookMeta(meta, bookOf(chapter) ?? BOOK_ORDER[0])
  for (const id of Object.keys(shopLines(bookOf(chapter) ?? BOOK_ORDER[0]))) bm.shop[id] = 0
  return meta
}

// One run. Returns a per-enemy trace: every HP removal, with the enemy's identity.
// Immortal + accepting level-ups: the question is "how much damage does a real build put into an
// enemy", so the player must keep levelling and must not die and cut the run short.
function trace(chapter, seed) {
  Math.random = mulberry32(seed)
  const run = createRun(makeMeta(chapter), { chapter, difficulty: DIFFICULTY })
  if (run.chapter !== chapter) throw new Error(`asked for ${chapter}, got ${run.chapter}`)
  run.player.maxHP = run.player.hp = 1e9

  const events = []                       // { id, t, frac, maxHP, elite, anchored, tank, died }
  const before = new Map()
  const steps = Math.round(SECS / DT)

  for (let i = 0; i < steps; i++) {
    if (run.phase === 'levelup') { try { stepChoice(run) } catch { run.phase = 'playing' }; continue }
    if (run.phase !== 'playing') break

    before.clear()
    for (const e of run.enemies) before.set(e.id, { hp: e.hp, e })

    stepSim(run, { x: 0.4, y: 0.2 }, DT)
    run.events.splice(0)                  // main.js drains every frame; a backlog is recounted

    const alive = new Map(run.enemies.map((e) => [e.id, e]))
    for (const [id, prev] of before) {
      const now = alive.get(id)
      const removed = now ? Math.max(0, prev.hp - now.hp) : prev.hp   // vanished: credit the rest
      if (removed <= 0) continue
      const e = prev.e
      events.push({
        id, t: run.time, frac: removed / e.maxHP, maxHP: e.maxHP,
        elite: !!e.elite, anchored: neverFreezes(e), tank: e.type === 'tank', died: !now,
      })
    }
  }
  return events
}

// Take the first offer. A refused level-up is a build that never grows, which is the wrong player
// for a question about how much damage lands on an enemy.
function stepChoice(run) {
  if (run.levelUpChoices && run.levelUpChoices.length) applyChoice(run, 0)
  else run.phase = 'playing'
}

// --- replay the trace through the model --------------------------------------------------------

function replay(events, { coldMul, P }) {
  const cold = new Map(), venom = new Map(), state = new Map()
  const byEnemy = new Map()
  for (const ev of events) {
    if (!byEnemy.has(ev.id)) byEnemy.set(ev.id, [])
    byEnemy.get(ev.id).push(ev)
  }

  let freezes = 0, frozenTime = 0, slowSum = 0, slowSteps = 0, ampSum = 0
  let enemies = 0, everFrozen = 0, lifeAtFreeze = [], anchoredSeen = 0

  for (const [, evs] of byEnemy) {
    enemies++
    const w = makeWindow(), wv = makeWindow()
    let frozenT = 0, resistT = 0, did = false
    const last = evs[evs.length - 1]
    if (evs[0].anchored) anchoredSeen++

    let t = evs[0].t
    for (const ev of evs) {
      // advance the model to this event's timestamp
      let dt = Math.max(0, ev.t - t)
      while (dt > 0) {
        const step = Math.min(DT, dt)
        winStep(w, step); winStep(wv, step)
        if (frozenT > 0) { frozenT -= step; frozenTime += step; if (frozenT <= 0) resistT = FREEZE_RESIST_T }
        else if (resistT > 0) resistT -= step
        const slow = frozenT > 0 ? 1 : Math.min(1, w.total * coldMul * Math.sqrt(P))
        slowSum += slow; slowSteps++
        ampSum += wv.total * 0.6 * Math.sqrt(P)
        dt -= step
      }
      t = ev.t

      winAdd(wv, ev.frac)
      // The resist window reduces what ACCUMULATES, so it delays a refreeze without ever making
      // one arithmetically impossible -- which is the failure mode revision 2 shipped.
      if (frozenT <= 0) winAdd(w, ev.frac * (resistT > 0 ? 0.25 : 1))

      if (frozenT <= 0 && !ev.anchored && w.total * coldMul * Math.sqrt(P) >= 1) {
        freezes++; frozenT = FREEZE_DURATION; winClear(w)
        if (!did) { did = true; everFrozen++; lifeAtFreeze.push(Math.max(0, last.t - ev.t)) }
      }
    }
  }

  lifeAtFreeze.sort((a, b) => a - b)
  return {
    enemies, freezes, everFrozenPct: (100 * everFrozen) / Math.max(1, enemies),
    frozenTime, meanSlow: (100 * slowSum) / Math.max(1, slowSteps),
    meanAmp: (100 * ampSum) / Math.max(1, slowSteps),
    medLifeAtFreeze: lifeAtFreeze.length ? lifeAtFreeze[lifeAtFreeze.length >> 1] : NaN,
    anchoredSeen,
  }
}

// --- main --------------------------------------------------------------------------------------

if (argv.includes('--selftest')) selftest()

console.log(`element-probe  ${SECS}s  d${DIFFICULTY}  seeds ${SEEDS.join(',')}  P ${P_LADDER.join(',')}`)
console.log(`model: window ${STATUS_DURATION}s/${BUCKETS} buckets, freeze ${FREEZE_DURATION}s, resist ${FREEZE_RESIST_T}s x0.25 on INTAKE`)
console.log('only `anchored` elites are unfreezable (owner ruling 2026-08-13)\n')

for (const chapter of CHAPTERS_ARG) {
  const all = []
  for (const seed of SEEDS) all.push(trace(chapter, seed))
  const evs = all.flat()
  const fracs = evs.map((e) => e.frac).sort((a, b) => a - b)
  const big = evs.filter((e) => e.frac >= 0.25).length

  console.log(`== ${chapter} (book ${bookOf(chapter) ?? BOOK_ORDER[0]}) ==  ${evs.length} damage events over ${SEEDS.length} runs`)
  console.log(`   per-event share of maxHP: median ${(fracs[fracs.length >> 1] ?? 0).toFixed(4)}  p95 ${(fracs[Math.floor(fracs.length * 0.95)] ?? 0).toFixed(4)}  max ${(fracs[fracs.length - 1] ?? 0).toFixed(3)}`)
  // A single event removing >=25% of an enemy's own max HP is the signature of a maxHP-PROPORTIONAL
  // source -- city traffic and garden's mower deal e.maxHP * 0.5, the pounce trap 0.25. Those
  // cancel the denominator, so they hand every enemy the same `recent` however tough it is.
  console.log(`   events >= 25% of maxHP in one step: ${big} (${(100 * big / Math.max(1, evs.length)).toFixed(2)}%)  <- hazard signature\n`)

  console.log('    P  coldMul   froze%   freezes   frozen s   meanSlow%   meanAmp%   med life left at 1st freeze')
  for (const P of P_LADDER) {
    for (const coldMul of COLD_MULS) {
      const r = replay(evs, { coldMul, P })
      console.log(`   ${String(P).padStart(2)}   ${String(coldMul).padStart(4)}   ${r.everFrozenPct.toFixed(1).padStart(6)}   ${String(r.freezes).padStart(7)}   ${r.frozenTime.toFixed(0).padStart(8)}   ${r.meanSlow.toFixed(1).padStart(9)}   ${r.meanAmp.toFixed(1).padStart(8)}   ${Number.isNaN(r.medLifeAtFreeze) ? '   -' : r.medLifeAtFreeze.toFixed(2) + 's'}`)
    }
  }
  console.log('')
}
