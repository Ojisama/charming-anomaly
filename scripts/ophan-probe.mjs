// THE OPHAN, MEASURED: scripts/ophan-bot.js plays whole fights, and every seed is printed.
//
//   node scripts/ophan-probe.mjs --diff 3                 (6 seeds, mortal)
//   node scripts/ophan-probe.mjs --diff 3 --immortal      (the control arm)
//   node scripts/ophan-probe.mjs --diff 1 --seeds 18 --seed0 1000 --cap 900
//   node scripts/ophan-probe.mjs --diff 3 --literal       (the bot without its crowd shyness)
//
// THE RIG, stated so no number is quoted without it:
//   - MORTAL is the only arm that may be quoted as a win rate. IMMORTAL cannot die, so its rows are
//     a damage-taken profile (who hits how hard over a whole fight), never a cause of death
//     (wreck-threat's rule). Its fight length is the fight with no death in it.
//   - Level-ups take the first non-element card, as the suite's ophSteps does: an uncurated build,
//     neither the best nor the worst a player would pick.
//   - The bot orbits, dodges with a look-ahead and presses worlds with a 0.45 s reaction (its own
//     header). It is a floor on skill in movement and a fair model of the world presses; it never
//     hunts the crowd, so crowd damage is what an orbiting player takes, not what a camper takes.
//   - A fight still running at --cap seconds is printed as 'cap', never as a win or a death.
//   - Run it from the tree it measures: src/ and scripts/ resolve next to this file, so an A/B is
//     a scratch tree (git archive) with this file and the bot copied in.
import { ophanBot } from './ophan-bot.js'
const SRC = new URL('../src/', import.meta.url).href
const { createRun } = await import(SRC + 'state.js')
const { stepSim, applyChoice } = await import(SRC + 'sim.js')
const { SHOP } = await import(SRC + 'config.js')

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] }
const DIFF = Number(arg('diff', 3)), NSEEDS = Number(arg('seeds', 6)), SEED0 = Number(arg('seed0', 1000)), CAP = Number(arg('cap', 900))
const IMMORTAL = process.argv.includes('--immortal')
const SHY = !process.argv.includes('--literal')   // --literal: the bot without its crowd shyness
if (![1, 2, 3].includes(DIFF)) { console.error('ABORT: --diff must be 1, 2 or 3, got ' + arg('diff')); process.exit(1) }
if (!(Number.isInteger(NSEEDS) && NSEEDS > 0)) { console.error('ABORT: --seeds must be a positive integer, got ' + arg('seeds')); process.exit(1) }
if (!Number.isInteger(SEED0)) { console.error('ABORT: --seed0 must be an integer, got ' + arg('seed0')); process.exit(1) }
if (!(CAP > 0)) { console.error('ABORT: --cap must be > 0, got ' + arg('cap')); process.exit(1) }
const DT = 1 / 60

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const meta = () => ({ coins: 0, shop: Object.fromEntries(Object.keys(SHOP).map((id) => [id, 0])), best: { time: 0, kills: 0 }, runs: 0, dev: true })
const isBoss = (src) => src.startsWith('ophan')

function fight(seed) {
  Math.random = mulberry32(seed)
  const run = createRun(meta(), { chapter: 'ophan', difficulty: DIFF })
  if (run.chapter !== 'ophan') { console.error('ABORT: createRun fell back to ' + run.chapter); process.exit(1) }
  const breaks = [], attacks = [], swaps = [], hits = {}
  let sketchAt = -1, res = 0, tells = 0, ph2At = -1, ph3At = -1, laser2 = -1, atkSecs = 0, skinSecs = 0
  let t = 0
  for (; t < CAP && run.phase !== 'dead' && run.phase !== 'victory'; t += DT) {
    if (run.phase === 'levelup') {
      const c = run.levelUpChoices || [], i = c.findIndex((x) => x.kind !== 'element')
      applyChoice(run, i >= 0 ? i : 0); run.phase = 'playing'
    }
    stepSim(run, ophanBot(run, { shy: SHY }), DT)
    if (IMMORTAL) run.player.hp = run.player.maxHP
    const o = run.script.oph
    for (const e of run.events) {
      if (e.type === 'ophanBreak') breaks.push(t)
      else if (e.type === 'ophanSketch') sketchAt = t
      else if (e.type === 'ophanAttack') { attacks.push({ t, k: e.k, sketch: o.sketch }); if (e.k === 'laser' && laser2 < 0 && breaks.length >= 2) laser2 = t }
      else if (e.type === 'ophanSwap') swaps.push(t)
      else if (e.type === 'ophanTell') tells++
      else if (e.type === 'ophanResonance') res++
      else if (e.type === 'hurt' && isBoss(e.src ?? '')) hits[e.src] = (hits[e.src] ?? 0) + 1
    }
    run.events.length = 0
    if (o && !o.sketch) { skinSecs += DT; if (o.atk) atkSecs += DT }
    if (o && ph2At < 0 && o.ph === 2) ph2At = t
    if (o && ph3At < 0 && o.ph === 3) ph3At = t
  }
  const dmg = { ...(run.dmgBySrc ?? {}) }
  const total = Object.values(dmg).reduce((a, b) => a + b, 0)
  const crowd = Object.entries(dmg).filter(([k]) => !isBoss(k)).reduce((a, [, v]) => a + v, 0)
  const skinAtt = attacks.filter((a) => !a.sketch).length
  return {
    hits, casts: attacks.reduce((m, a) => { const k = 'ophan' + a.k[0].toUpperCase() + a.k.slice(1); m[k] = (m[k] ?? 0) + 1; return m }, {}),
    seed, end: run.phase === 'victory' ? 'win' : run.phase === 'dead' ? 'dead' : 'cap', secs: t,
    perSkin: breaks.map((b, i) => b - (i ? breaks[i - 1] : 0)), sketch: sketchAt < 0 ? -1 : t - sketchAt,
    dmg, total, crowd, killedBy: run.killedBy ?? '-', level: run.player.level, kills: run.kills - (run.phase === 'victory' ? 1 : 0),
    skinAtt, apm: skinSecs ? skinAtt / skinSecs * 60 : 0, atkShare: skinSecs ? atkSecs / skinSecs : 0, swaps: swaps.length, tells, res,
    laserLag: laser2 < 0 ? -1 : laser2 - breaks[1], ph2Lag: ph2At < 0 || breaks.length < 2 ? -1 : ph2At - breaks[1],
    // seconds the skin fight spent at each whole phase before the sketch
    ph2Secs: ph2At < 0 ? -1 : (ph3At < 0 ? (sketchAt < 0 ? t : sketchAt) : ph3At) - ph2At, ph3Secs: ph3At < 0 ? -1 : (sketchAt < 0 ? t : sketchAt) - ph3At,
  }
}

const f0 = (v) => (v < 0 ? '-' : v.toFixed(0))
const f1 = (v) => (v < 0 ? '-' : v.toFixed(1))
console.log(`THE OPHAN  chapter=ophan diff=${DIFF} ${IMMORTAL ? 'IMMORTAL (a damage profile, not lethality)' : 'MORTAL'}${SHY ? '' : ' LITERAL (no crowd shyness)'}  seeds=${NSEEDS} cap=${CAP}s`)
const rows = []
for (let i = 0; i < NSEEDS; i++) {
  const x = fight(SEED0 + i * 7919); rows.push(x)
  const src = Object.entries(x.dmg).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.replace(/^ophan/, '')} ${f0(v)}`).join(', ')
  console.log(`seed ${x.seed}  ${x.end.padEnd(4)} ${f0(x.secs).padStart(4)}s  skins [${x.perSkin.map(f0).join(' ')}]  sketch ${f0(x.sketch)}s  lv ${x.level}  crowd kills ${x.kills}` +
    `  atk ${x.skinAtt} (${x.apm.toFixed(1)}/min, busy ${(x.atkShare * 100).toFixed(0)}%)  swaps ${x.swaps} res ${x.res}  ph2 +${f1(x.ph2Lag)}s laser +${f1(x.laserLag)}s  at ph2/ph3 ${f0(x.ph2Secs)}/${f0(x.ph3Secs)}s` +
    `  dmg ${f0(x.total)}: ${src || 'none'}  killedBy ${x.killedBy}`)
}
const n = rows.length, mean = (f) => rows.reduce((a, x) => a + f(x), 0) / n
const secs = rows.map((x) => x.secs)
console.log(`SPREAD d${DIFF}: win ${rows.filter((x) => x.end === 'win').length}/${n}, dead ${rows.filter((x) => x.end === 'dead').length}/${n}, cap ${rows.filter((x) => x.end === 'cap').length}/${n}` +
  `  secs mean ${f0(mean((x) => x.secs))} [${f0(Math.min(...secs))}..${f0(Math.max(...secs))}]  lv mean ${mean((x) => x.level).toFixed(1)}  atk/min ${mean((x) => x.apm).toFixed(1)}`)
const grand = rows.reduce((a, x) => a + x.total, 0) || 1
const bySrc = {}
for (const x of rows) for (const [k, v] of Object.entries(x.dmg)) bySrc[k] = (bySrc[k] ?? 0) + v
const boss = Object.entries(bySrc).filter(([k]) => isBoss(k)).sort((a, b) => b[1] - a[1])
const crowd = rows.reduce((a, x) => a + x.crowd, 0)
console.log(`  share of all damage taken (${f0(grand)} over ${n} fights): crowd ${(crowd / grand * 100).toFixed(1)}%  ` +
  boss.map(([k, v]) => `${k.replace(/^ophan/, '')} ${(v / grand * 100).toFixed(1)}%`).join('  '))
console.log(`  crowd share per seed [${rows.map((x) => (x.total ? (x.crowd / x.total * 100).toFixed(0) : '-')).join(', ')}]  top attack share per seed [${rows.map((x) => { const m = Math.max(0, ...Object.entries(x.dmg).filter(([k]) => isBoss(k)).map(([, v]) => v)); return x.total ? (m / x.total * 100).toFixed(0) : '-' }).join(', ')}]`)
const casts = {}, landed = {}
for (const x of rows) { for (const [k, v] of Object.entries(x.casts)) casts[k] = (casts[k] ?? 0) + v; for (const [k, v] of Object.entries(x.hits)) landed[k] = (landed[k] ?? 0) + v }
console.log('  hits landed / casts: ' + Object.keys(casts).sort().map((k) => k.replace(/^ophan/, '') + ' ' + (landed[k] ?? 0) + '/' + casts[k]).join('  '))
