// THE KRAKEN'S CUES, GRADED. Does every arm attack ask ONE clear answer the player can read off the
// screen — PARRY a slam (its suckers flash white), DODGE a grab (step off its line), WIGGLE out of a
// hold — and can a player who only looks at the screen give it?
//
//   node scripts/kraken-cues.mjs                                  # headless, d2+d3, 6 seeds, 120s of arms phase each
//   node scripts/kraken-cues.mjs --diffs 3 --seeds 1,2,3 --secs 180
//   node scripts/kraken-cues.mjs --browser http://127.0.0.1:5203/ --diffs 3 --seeds 1,2
//   node scripts/kraken-cues.mjs --report /tmp/kc-d3-1.json [...more.json]   # re-print saved runs
//   add --list to print EVERY failure (default: grouped by cause, first 8 times each);
//   --save DIR keeps each headless run's json
//
// ONE SCENE, TWO SOURCES OF TELLS. The bot, the sim-truth tracker and the grader all live in
// scripts/scenes/kraken-cues.js, and this file runs that same scene two ways:
//   HEADLESS (default): node against sim.js, and window.__tells is an ORACLE built here from sim
//     truth — what an ideal renderer would draw for every live attack (the struck line for a slam,
//     the forecast for a grab). It measures the DESIGN: the answer exists, is it one answer, can it
//     work. Its pressRing is a REPLICA of render.js's rule (any arm in its window, range ignored),
//     so the glow row is a copy of a rule, not a picture.
//   --browser URL: through scripts/fx-probe.mjs (needs a dev server ALREADY running on URL; start
//     one with npx vite --port 5203 --strictPort and kill it by PID after), phone 390x844, and
//     window.__tells is what render.js ACTUALLY DREW that frame — published under ?debug by
//     tellDrawn() at each draw site, so a tell that is not drawn cannot be logged. The slam's reach
//     is judged off the DRAWN limb (every 8th rope point), not the struck line. Differences between
//     the two modes are the render's gap. Seeds do not line up across modes (render burns randoms).
//     One browser run is ~1-2 min per 120s of fight; they run one at a time, as fx-probe requires.
//
// THE GRADE, per attack kind, against the sim after the fact (never read by the bot):
//   slam   graded only when it THREATENED this player (in the parry band during its window, or it
//          hit). correct = pressed while in band inside the window; success = the arm went limp.
//   grab   one per latch (gripT rising) and one per grab-MISS event (grabMiss/gripMiss/grabWhiff —
//          the redesign's event, any of those names). correct = the bot was dodging in the 0.5s
//          before; success = it missed. Today every grab latches: success is 0 by construction.
//   hold   one per gripT episode. correct = wiggling >= half of it; success = gripBreak (tore loose).
//   coil   correct = walked for the gap; success = not struck.
//   lunge  the head's parry window in the chase. correct = pressed; success = parried.
// TWO ANSWERS AT ONCE: frames in the arms phase (boss + chase) where >= 2 of these are required at
// once, from truth: P = a press would land now (krakenParry's own candidacy), W = held (gripT > 0),
// D = a grab lands within --conflictT s (the forecast's gripSoonT; the redesign adds its own clock
// on ONE marked line in the scene) or a lit coil lane lies on you. Reported per minute of arms phase.
// GLOW: frames where the press ring on the player is drawn but a press would not land, and the
// reverse. The HUD button's classes are tallied too (browser only; today it only has --ready).
//
// THE RIG: immortal (hp topped up every step), no level-up cards, skippingShell L3. A readability
// instrument, not a difficulty statement. Every row prints its denominator.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1] }
const DIFFS = String(arg('diffs', '2,3')).split(',').map(Number)
const SEEDS = String(arg('seeds', '1,2,3,4,5,6')).split(',').map(Number)
const SECS = Number(arg('secs', 120))
const CONFLICT_T = Number(arg('conflictT', 0.4))
const BROWSER = arg('browser', null)
const LIST = argv.includes('--list')
const SAVE = arg('save', null)   // --save DIR: keep each run's json for --report
if (SAVE) mkdirSync(SAVE, { recursive: true })
const REPORT = argv.includes('--report') ? argv.slice(argv.indexOf('--report') + 1).filter((a) => !a.startsWith('--')) : null
if (![SECS, CONFLICT_T, ...DIFFS, ...SEEDS].every(Number.isFinite) || SECS <= 0 || !DIFFS.every((d) => d >= 1 && d <= 5)) {
  console.error('ABORT: bad --secs/--conflictT/--diffs/--seeds'); process.exit(1)
}
const SCENE = new URL('./scenes/kraken-cues.js', import.meta.url).pathname
const SRC = new URL('../src/', import.meta.url).href

// ------------------------------------------------------------------ headless: sim.js + oracle tells
async function headless(diff, seed) {
  const { createRun, ensureChapterMeta, ensureBookMeta } = await import(SRC + 'state.js')
  const { stepSim } = await import(SRC + 'sim.js')
  const C = await import(SRC + 'config.js')
  const meta = { coins: 0, shop: {}, best: { time: 0, kills: 0 }, runs: 0, chapters: {} }
  ensureChapterMeta(meta, 'kraken'); meta.chapters.kraken.unlocked = true
  ensureBookMeta(meta, 'undertow')
  // seeded BEFORE createRun, and again by the scene once the arms phase starts
  let s0 = seed ^ 0x2545f491
  Math.random = () => { s0 |= 0; s0 = (s0 + 0x6d2b79f5) | 0; let t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const run = createRun(meta, { chapter: 'kraken', difficulty: diff })
  if (run.chapter !== 'kraken' || run.difficulty !== diff) { console.error(`ABORT: asked kraken d${diff}, got ${run.chapter} d${run.difficulty}`); process.exit(1) }
  const rung = C.krakenRung(diff)
  const oracle = (r) => {
    const tells = []
    const s = r.script
    const p = r.player
    const head = r.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead)
    if (!s || !head || !(s.phase === 'boss' || s.phase === 'chase' || s.phase === 'arrive')) return tells
    let winAny = false
    for (const a of r.krakenArms) {
      if (a.dead) continue
      const line = { x: a.x, y: a.y, x0: a.lx0, y0: a.ly0, x1: a.lx1, y1: a.ly1 }
      if (a.limpT > 0) tells.push({ src: 'arm', i: a.i, kind: 'limp', x: a.x, y: a.y })
      else if (a.gripT > 0) tells.push({ src: 'arm', i: a.i, kind: 'hold', x: p.x, y: p.y })
      else if (a.tele > 0 && a.coilArm) tells.push({ src: 'arm', i: a.i, kind: 'coil', ...line })
      else if (a.tele > 0) {
        tells.push({ src: 'arm', i: a.i, kind: a.tele <= rung.window ? 'slamFlash' : 'slamCharge', ...line })
        if (a.tele <= rung.window) winAny = true
      } else if (s.gripSoonI === a.i) tells.push({ src: 'arm', i: a.i, kind: 'grabCharge', x: a.x, y: a.y, x0: a.x, y0: a.y, x1: p.x, y1: p.y })
    }
    const lunge = s.phase === 'chase' && !(s.staggerT > 0) && head.lungeT > 0
    if (lunge && head.lungeT <= C.KRAKEN_LUNGE_WINDUP_T) tells.push({ src: 'head', i: -1, kind: 'lungeCharge', x: head.x, y: head.y })
    if (lunge && head.lungeT <= rung.lungeWindow) { tells.push({ src: 'head', i: -1, kind: 'lungeFlash', x: head.x, y: head.y }); winAny = true }
    // REPLICA of render.js's press-ring rule (drawKrakenRing): any arm in window, range ignored
    if (winAny && !((r.repulseCd ?? 0) > 0)) tells.push({ src: 'player', i: -1, kind: 'pressRing', x: p.x, y: p.y })
    return tells
  }
  globalThis.window = {
    __cfg: C, __kcParams: { secs: SECS, seed, conflictT: CONFLICT_T }, __kcOracle: true, __tells: [],
    __renderer: { sync: (r) => { globalThis.window.__tells = oracle(r) } },
  }
  const H = {
    until(pred, max = 4000) {
      let g = 0
      while (!pred() && g++ < max) { stepSim(run, { x: 0, y: 0 }, 1 / 60); run.events.length = 0; run.player.hp = run.player.maxHP; if (run.phase === 'levelup') run.phase = 'playing' }
      return g < max
    },
    note() {},
  }
  new Function('run', 'app', 'step', 'H', readFileSync(SCENE, 'utf8'))(run, null, stepSim, H)
  return globalThis.window.__fxResult
}

// ------------------------------------------------------------------ browser: fx-probe, real tells
function browser(diff, seed, dir) {
  const json = join(dir, `kc-d${diff}-${seed}.json`)
  const url = BROWSER + (BROWSER.includes('?') ? '&' : '?') + `secs=${SECS}&seed=${seed}&conflictT=${CONFLICT_T}`
  const r = spawnSync('node', [new URL('./fx-probe.mjs', import.meta.url).pathname, '--scene', SCENE, '--out', join(dir, `kc-d${diff}-${seed}`),
    '--chapter', 'kraken', '--difficulty', String(diff), '--url', url, '--json', json, '--wait', String(Math.max(60000, SECS * 2500))], { encoding: 'utf8' })
  if (r.status !== 0) { console.error(r.stdout + r.stderr); console.error(`ABORT: fx-probe failed for d${diff} seed ${seed}`); process.exit(1) }
  return JSON.parse(readFileSync(json, 'utf8'))
}

// ------------------------------------------------------------------ report
const pct = (a, b) => (b ? (100 * a / b).toFixed(0) + '%' : '-')
function report(label, rs) {
  if (!rs.length) { console.error('ABORT: no results'); process.exit(1) }
  const armsT = rs.reduce((s, r) => s + r.armsT, 0)
  console.log(`\n=== ${label}: ${rs.length} run(s), ${rs[0].oracle ? 'ORACLE tells (sim truth)' : 'DRAWN tells (render.js)'}, ${armsT.toFixed(0)}s of arms phase in total`)
  console.log(`seeds ${rs.map((r) => r.seed).join(',')}   end phase [${rs.map((r) => r.phase + (r.won ? '(won)' : '')).join(' ')}]   arms-phase s [${rs.map((r) => r.armsT.toFixed(0)).join(' ')}]`)
  if (armsT < 30) { console.error(`ABORT: only ${armsT.toFixed(0)}s of arms phase — nothing to grade`); process.exit(1) }
  console.log('kind    seen  correct answer  success   (per minute of arms phase)')
  const all = rs.flatMap((r) => r.attacks.map((a) => ({ ...a, seed: r.seed })))
  for (const k of ['slam', 'grab', 'hold', 'coil', 'lunge']) {
    const xs = all.filter((a) => a.kind === k)
    const c = xs.filter((a) => a.correct).length, o = xs.filter((a) => a.ok).length
    console.log(`${k.padEnd(6)} ${String(xs.length).padStart(5)}  ${`${c}/${xs.length} ${pct(c, xs.length)}`.padStart(14)}  ${`${o}/${xs.length} ${pct(o, xs.length)}`.padStart(12)}   ${(xs.length / (armsT / 60)).toFixed(2)}/min`)
  }
  const outcomes = {}
  for (const a of all) outcomes[a.kind + ':' + a.outcome] = (outcomes[a.kind + ':' + a.outcome] || 0) + 1
  console.log('outcomes  ' + Object.entries(outcomes).map(([k, v]) => `${k} ${v}`).join('   '))
  const grabs = all.filter((a) => a.kind === 'grab' && a.tellS != null)
  if (grabs.length) {
    const tl = grabs.map((a) => a.tellS).sort((a, b) => a - b)
    console.log(`grab tell drawn before latch (s): none ${tl.filter((x) => x < 0).length}/${tl.length}, median ${tl[Math.floor(tl.length / 2)]}, [${tl.join(' ')}]`)
  }
  console.log('FAILURES (seed@t, by cause):')
  const byCause = {}
  for (const a of all.filter((x) => !x.ok)) (byCause[`${a.kind}: ${a.cause}`] ||= []).push(`${a.seed}@${a.t0.toFixed(1)}`)
  for (const [c, ts] of Object.entries(byCause).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(ts.length).padStart(4)}  ${c}   ${(LIST ? ts : ts.slice(0, 8)).join(' ')}${!LIST && ts.length > 8 ? ' ...' : ''}`)
  }
  // SCHEDULED overlap: each attack's answer is DUE over a nominal span whether or not the bot has
  // already given it — a slam from entering its window in the band until it would land, a lunge's
  // window, a hold from latch to release, a grab the last conflictT before it latches, a coil while
  // a lit lane lies on you. This is what the player FACES; the as-played line below is what a bot
  // that answers on the first frame is left with, which is always smaller.
  const KIND = { slam: 'P', lunge: 'P', hold: 'W', grab: 'D', coil: 'D' }
  let ss = 0, sm = 0
  const sp = {}
  const perSeed = []
  for (const r of rs) {
    const iv = r.attacks.filter((a) => a.ia != null && a.ib > a.ia).map((a) => ({ k: KIND[a.kind], a: a.ia, b: a.ib }))
    const cuts = [...new Set(iv.flatMap((x) => [x.a, x.b]))].sort((a, b) => a - b)
    let on = false, m = 0
    for (let c = 0; c + 1 < cuts.length; c++) {
      const mid = (cuts[c] + cuts[c + 1]) / 2
      const ks = [...new Set(iv.filter((x) => x.a <= mid && mid < x.b).map((x) => x.k))].sort()
      if (ks.length >= 2) { ss += cuts[c + 1] - cuts[c]; const k = ks.join('+'); sp[k] = (sp[k] || 0) + cuts[c + 1] - cuts[c]; if (!on) m++; on = true } else on = false
    }
    sm += m
    perSeed.push((m / (r.armsT / 60)).toFixed(2))
  }
  console.log(`TWO ANSWERS AT ONCE, scheduled (grab horizon ${CONFLICT_T}s): ${sm} moments, ${ss.toFixed(1)}s = ${(sm / (armsT / 60)).toFixed(2)} moments/min, ${(ss / (armsT / 60)).toFixed(2)} s/min, ${pct(ss, armsT)} of arms-phase time`)
  console.log(`   per seed moments/min [${perSeed.join(' ')}]   by pair (s): ${Object.entries(sp).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  ') || 'none'}   (P=parry W=wiggle D=dodge)`)
  const cs = rs.reduce((s, r) => s + r.conflict.seconds, 0), cm = rs.reduce((s, r) => s + r.conflict.moments, 0)
  const pairs = {}
  for (const r of rs) for (const [k, v] of Object.entries(r.conflict.pairs)) pairs[k] = (pairs[k] || 0) + v
  console.log(`   as played by this bot: ${cm} moments, ${cs.toFixed(1)}s = ${(cm / (armsT / 60)).toFixed(2)} moments/min, ${(cs / (armsT / 60)).toFixed(2)} s/min, ${pct(cs, armsT)} of arms-phase time`)
  console.log(`   per seed moments/min [${rs.map((r) => (r.conflict.moments / (r.armsT / 60)).toFixed(2)).join(' ')}]   by pair (s): ${Object.entries(pairs).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  ') || 'none'}   (P=parry W=wiggle D=dodge)`)
  const pn = rs.reduce((s, r) => s + r.press.n, 0), pl = rs.reduce((s, r) => s + r.press.land, 0), pw = rs.reduce((s, r) => s + r.press.whiff, 0)
  console.log(`PRESSES ${pn}: landed ${pl} (${pct(pl, pn)}), whiffed ${pw} (${pct(pw, pn)}), no parry event at all ${pn - pl - pw}`)
  const g = rs.reduce((s, r) => ({ f: s.f + r.glow.frames, a: s.a + r.glow.ringNoParry, b: s.b + r.glow.parryNoRing, c: s.c + r.glow.both }), { f: 0, a: 0, b: 0, c: 0 })
  console.log(`PRESS RING${rs[0].oracle ? ' (replica of render rule)' : ''} over ${g.f} arms frames: ring on & press would land ${g.c}; ring on but press would NOT land ${g.a} (${pct(g.a, g.a + g.c)} of ring-on frames); press would land but no ring ${g.b}`)
  const cls = {}
  for (const r of rs) for (const [k, v] of Object.entries(r.glow.btnClasses || {})) cls[k] = (cls[k] || 0) + v
  if (Object.keys(cls).length) console.log('HUD button classes (frames): ' + Object.entries(cls).map(([k, v]) => `"${k}" ${v}`).join('  '))
  const tc = {}
  for (const r of rs) for (const [k, v] of Object.entries(r.tellCounts)) tc[k] = (tc[k] || 0) + v
  console.log('tells drawn (arm-frames): ' + Object.entries(tc).map(([k, v]) => `${k} ${v}`).join('  '))
}

if (REPORT) {
  if (!REPORT.length) { console.error('ABORT: --report needs json files'); process.exit(1) }
  const rs = REPORT.map((f) => JSON.parse(readFileSync(f, 'utf8')))
  for (const d of [...new Set(rs.map((r) => r.difficulty))]) report(`d${d}`, rs.filter((r) => r.difficulty === d))
  process.exit(0)
}
console.log(`kraken-cues: ${BROWSER ? 'BROWSER ' + BROWSER : 'HEADLESS'}  diffs ${DIFFS.join(',')}  seeds ${SEEDS.join(',')}  ${SECS}s of arms phase (boss + chase) per run`)
const dir = BROWSER ? mkdtempSync(join(tmpdir(), 'kraken-cues-')) : null
for (const d of DIFFS) {
  const rs = []
  for (const s of SEEDS) {
    const r = BROWSER ? browser(d, s, dir) : await headless(d, s)
    if (!r || r.chapter !== 'kraken' || r.difficulty !== d) { console.error(`ABORT: seed ${s} returned ${r && r.chapter} d${r && r.difficulty}`); process.exit(1) }
    rs.push(r)
    if (SAVE) writeFileSync(join(SAVE, `kc-d${d}-${s}${r.oracle ? '-oracle' : ''}.json`), JSON.stringify(r))
  }
  report(`d${d}`, rs)
}
if (dir) console.log(`\nper-run json in ${dir} (re-print with --report)`)
