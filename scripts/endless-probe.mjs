// ENDLESS BALANCE PROBE — mortal endless runs, how long a build lives, per ramp knob.
//
//   node scripts/endless-probe.mjs                         # shipped knobs, every arm
//   node scripts/endless-probe.mjs --grid                  # A x B (3x3) x HP sweep
//   node scripts/endless-probe.mjs --a 0.5 --b 0.05 --hp 0.1 --seeds 4 --moves amble
//
// Rig: MORTAL past --warm (default 300s), dt 1/30, one seeded mulberry32 per run, the same seed set
// in every cell. Movement axis still / amble / kite (/ gap, a crowd-gap seeker), because a kiting
// rig alone hides shove locks (memory: kiting-rig-hides-shove-locks).
// ⚠ WHY THE WARM-UP: no bot here survives the first 5:00 mortal, even with the level pinned at 1
// (they die at 1:30-4:30), so a mortal-from-zero run never reaches the endless ramp at all. The bot
// is immortal until --warm, then the crowd is cleared (ENDLESS_PROBE_CLEAR=0 keeps it) and it plays
// mortal from full HP. Even so most runs die within ~30s of the handover, in BOTH arms: read the
// control arm before believing any cell. `--warm 0` gives the plain mortal-from-zero rig.
// Builds: the pick policy is the one wreck-threat.mjs uses (no anomalies; weapon > passive > mod >
// element, alphabetical tie-break). `median` owns shop level 3 on every line, `strong` owns them
// all maxed; that is the whole difference between the two.
// Control arm: run._endlessPinLevel = 1 for the whole run (the ramp is off, milestones still fire).
// Knobs: config.js exports cannot be reassigned, so each cell runs against a scratch COPY of src/
// with ENDLESS_RAMP_A / ENDLESS_RAMP_B / ENDLESS_HP_PER_LEVEL rewritten; the rewrite aborts unless
// each constant matched exactly once. The copy lives in os.tmpdir() and is deleted on exit.
// Prints per arm: N, death time min / median / max (min:s), runs that hit the cap, and at death the
// alive count and sim ms/step (mean over the last 5 sim seconds). Render cost is NOT measured here.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(HERE, '..', 'src')
const DT = 1 / 30

// ---------------------------------------------------------------- worker: one run, JSON on stdout
if (process.argv[2] === '--worker') {
  const [srcDir, chapter, build, move, seedS, pinS, capS, warmS] = process.argv.slice(3)
  const seed = Number(seedS), pin = Number(pinS), cap = Number(capS), warm = Number(warmS)
  const url = (f) => pathToFileURL(path.join(srcDir, f)).href
  const { createRun, ensureBookMeta, ensureChapterMeta } = await import(url('state.js'))
  const { stepSim, applyChoice } = await import(url('sim.js'))
  const { ALL_CHAPTER_IDS, BOOKS, shopLines, lineMax } = await import(url('config.js'))

  let a = seed | 0
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const meta = { schema: 99, coins: 0, runs: 0, lang: 'en', shop: {}, chapters: {}, books: {} }
  for (const b of Object.keys(BOOKS)) {
    const bm = ensureBookMeta(meta, b)
    bm.shop ??= {}
    for (const [id, line] of Object.entries(shopLines(b))) {
      if (line.cosmetic) continue
      bm.shop[id] = build === 'strong' ? lineMax(id) : Math.min(3, lineMax(id))
    }
  }
  for (const id of ALL_CHAPTER_IDS) { ensureChapterMeta(meta, id); meta.chapters[id].unlocked = true }
  const run = createRun(meta, { chapter, endless: true })
  if (run.chapter !== chapter || !run.endless) throw new Error(`createRun gave ${run.chapter} endless=${run.endless}`)
  if (pin > 0) run._endlessPinLevel = pin

  const KIND_RANK = { weapon: 0, passive: 1, mod: 2, element: 3 }
  const sortKey = (c) => (c.kind === 'mod' ? `${c.weapon}/${c.id}` : c.id)
  const pick = (choices) => {
    let best = 0, bestRank = Infinity, bestKey = null
    choices.forEach((c, i) => {
      const r = KIND_RANK[c.kind]
      if (r === undefined) return
      const k = sortKey(c)
      if (r < bestRank || (r === bestRank && k < bestKey)) { bestRank = r; bestKey = k; best = i }
    })
    return best
  }
  let heading = 0
  const aim = () => {
    heading += 0.35 * DT
    if (move === 'still') return { x: 0, y: 0 }
    if (move === 'amble') return { x: Math.cos(heading), y: Math.sin(heading) }
    const p = run.player
    if (move === 'gap') {
      // gap: of 16 headings, take the one with the least crowd ahead (cone-weighted 1/d within
      // 400px), with a small bias to keep the current heading so it does not dither
      let best = heading, bestCost = Infinity
      for (let k = 0; k < 16; k++) {
        const h = (k / 16) * Math.PI * 2, hx = Math.cos(h), hy = Math.sin(h)
        let cost = 0.002 * (1 - Math.cos(h - heading))
        for (const e of run.enemies) {
          if (e._dead) continue
          const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy)
          if (d > 400 || d < 1) continue
          const c = (dx * hx + dy * hy) / d
          if (c > 0) cost += c * c / d
        }
        if (cost < bestCost) { bestCost = cost; best = h }
      }
      heading = best
      return { x: Math.cos(best), y: Math.sin(best) }
    }
    // kite: flee the inverse-square-weighted crowd within 450px, else amble
    let fx = 0, fy = 0
    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy
      if (d2 > 450 * 450 || d2 < 1) continue
      fx += dx / d2; fy += dy / d2
    }
    const n = Math.hypot(fx, fy)
    return n > 0 ? { x: fx / n, y: fy / n } : { x: Math.cos(heading), y: Math.sin(heading) }
  }
  const msRing = new Array(150).fill(0)
  let i = 0, cleared = false
  const CLEAR = process.env.ENDLESS_PROBE_CLEAR !== '0'
  while (run.time < cap && run.phase !== 'dead') {
    const t0 = performance.now()
    stepSim(run, { ...aim(), skill: false }, DT)
    msRing[i++ % msRing.length] = performance.now() - t0
    run.events.length = 0
    if (run.phase === 'levelup') { applyChoice(run, pick(run.levelUpChoices)); run.phase = 'playing' }
    if (run.time < warm) run.player.hp = run.player.maxHP
    else if (warm > 0 && !cleared) {
      // the immortal warm-up let a crowd pile on a player who never had to clear it; hand over a
      // clean screen so the measured arm starts as a player who actually reached `warm`
      cleared = true
      if (CLEAR) run.enemies.length = 0
    }
    if (run.phase !== 'playing' && run.phase !== 'dead') throw new Error(`unexpected phase ${run.phase} at t=${run.time}`)
  }
  const n = Math.min(i, msRing.length)
  console.log(JSON.stringify({
    secs: run.time, died: run.phase === 'dead', killedBy: run.killedBy ?? null, lv: run.level,
    level: run.difficulty, weps: run.weapons.map((w) => w.id + w.level).join(' '), hp: Math.round(run.player.hp) + '/' + Math.round(run.player.maxHP), dmgBySrc: run.dmgBySrc, kills: run.kills, alive: run.enemies.filter((e) => !e._dead).length,
    msStep: msRing.slice(0, n).reduce((s, v) => s + v, 0) / n, mutators: run.mutators.length,
  }))
  process.exit(0)
}

// ---------------------------------------------------------------- driver
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1] }
const num = (k, d) => { const v = Number(opt(k, d)); if (!Number.isFinite(v)) { console.error(`--${k} must be a number, got ${opt(k, d)}`); process.exit(2) } return v }
const list = (k, d, allowed) => {
  const v = String(opt(k, d)).split(',')
  for (const x of v) if (!allowed.includes(x)) { console.error(`--${k}: unknown "${x}" (allowed: ${allowed.join(',')})`); process.exit(2) }
  return v
}
const cfgText = fs.readFileSync(path.join(SRC, 'config.js'), 'utf8')
const shipped = (name) => Number(cfgText.match(new RegExp(`^export const ${name} = ([0-9.]+)`, 'm'))?.[1])
const SEEDS = num('seeds', 8), CAP = num('cap', 1800), JOBS = num('jobs', Math.max(1, os.cpus().length - 2))
const CHAPTERS = list('chapters', 'body,beyond,deep', ['body', 'pond', 'garden', 'undergrowth', 'city', 'skies', 'beyond', 'surf', 'shelf', 'reef', 'trawl', 'wreck', 'deep'])
const MOVES = list('moves', 'still,amble,kite', ['still', 'amble', 'kite', 'gap'])
const BUILDS = list('builds', 'median,strong', ['median', 'strong'])
const WARM = num('warm', 300)
const CONTROL = !args.includes('--no-control')
if (SEEDS < 1 || CAP < 60) { console.error('--seeds >= 1 and --cap >= 60 required'); process.exit(2) }

const cells = args.includes('--grid')
  ? [0.25, 0.5, 1].flatMap((A) => [0.02, 0.05, 0.1].flatMap((B) => String(opt('hps', '0.05,0.1,0.2')).split(',').map(Number).map((HP) => ({ A, B, HP }))))
  : [{ A: num('a', shipped('ENDLESS_RAMP_A')), B: num('b', shipped('ENDLESS_RAMP_B')), HP: num('hp', shipped('ENDLESS_HP_PER_LEVEL')) }]
for (const c of cells) if (![c.A, c.B, c.HP].every(Number.isFinite)) { console.error('bad knob', c); process.exit(2) }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'endless-probe-'))
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }))
function treeFor({ A, B, HP }) {
  const dir = path.join(TMP, `a${A}_b${B}_hp${HP}`)
  fs.cpSync(SRC, dir, { recursive: true })
  let txt = cfgText
  for (const [name, v] of [['ENDLESS_RAMP_A', A], ['ENDLESS_RAMP_B', B], ['ENDLESS_HP_PER_LEVEL', HP]]) {
    const re = new RegExp(`^export const ${name} = [0-9.]+`, 'gm')
    const hits = txt.match(re)?.length ?? 0
    if (hits !== 1) { console.error(`ABORT: ${name} matched ${hits} times in config.js`); process.exit(1) }
    txt = txt.replace(re, `export const ${name} = ${v}`)
  }
  fs.writeFileSync(path.join(dir, 'config.js'), txt)
  return dir
}

const jobs = []
for (const cell of cells) {
  const dir = treeFor(cell)
  const arms = [{ ...cell, pin: 0 }]
  if (CONTROL && cell === cells[0]) arms.push({ ...cell, pin: 1 })
  for (const arm of arms) for (const ch of CHAPTERS) for (const b of BUILDS) for (const m of MOVES) for (let s = 0; s < SEEDS; s++)
    jobs.push({ arm, key: `${arm.pin ? 'CONTROL pin=1' : `A=${arm.A} B=${arm.B} HP=${arm.HP}`}|${ch}|${b}|${m}`, args: [dir, ch, b, m, String(1234 + s * 7919), String(arm.pin), String(CAP), String(WARM)] })
}
console.log(`endless-probe: ${cells.length} cell(s) x chapters [${CHAPTERS}] x builds [${BUILDS}] x moves [${MOVES}] x ${SEEDS} seeds${CONTROL ? ' + control arm' : ''} = ${jobs.length} mortal runs, cap ${CAP}s, immortal until ${WARM}s, dt 1/30, ${JOBS} at a time`)

const runJob = (j) => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', ...j.args])
  let out = '', err = ''
  p.stdout.on('data', (d) => { out += d }); p.stderr.on('data', (d) => { err += d })
  p.on('close', (code) => code === 0 ? resolve(JSON.parse(out.trim().split('\n').pop())) : reject(new Error(`${j.key} seed ${j.args[4]}: exit ${code}\n${err}`)))
})
const results = new Map()
let next = 0, done = 0
const t0 = Date.now()
await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++]
    const r = await runJob(j)
    if (!results.has(j.key)) results.set(j.key, [])
    results.get(j.key).push(r)
    if (++done % 50 === 0) console.error(`  ${done}/${jobs.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
  }
}))
if (done !== jobs.length) { console.error(`ABORT: ${done}/${jobs.length} runs reported`); process.exit(1) }

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const med = (xs) => { const v = [...xs].sort((p, q) => p - q), h = v.length >> 1; return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2 }
console.log('\narm                       chapter  build   move     N   min   med   max  capped  alive@death  ms/step@death  lvl@death  killedBy')
for (const [key, rs] of results) {
  const [arm, ch, b, m] = key.split('|')
  const secs = rs.map((r) => r.secs), dead = rs.filter((r) => r.died)
  const kb = {}
  for (const r of dead) kb[r.killedBy] = (kb[r.killedBy] ?? 0) + 1
  console.log(`${arm.padEnd(25)} ${ch.padEnd(8)} ${b.padEnd(7)} ${m.padEnd(6)} ${String(rs.length).padStart(3)} ${mmss(Math.min(...secs)).padStart(5)} ${mmss(med(secs)).padStart(5)} ${mmss(Math.max(...secs)).padStart(5)}  ${String(rs.length - dead.length).padStart(6)}  ${med(rs.map((r) => r.alive)).toFixed(0).padStart(11)}  ${med(rs.map((r) => r.msStep)).toFixed(2).padStart(13)}  ${med(rs.map((r) => r.level)).toFixed(1).padStart(9)}  ${Object.entries(kb).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([k, v]) => `${k}x${v}`).join(' ')}`)
}
// Per-cell rollup across chapters and moves: the number the owner's targets are stated in.
console.log('\nrollup (all chapters x moves pooled)       build   N   med   p25   p75')
const q = (xs, f) => { const v = [...xs].sort((p, r) => p - r); return v[Math.min(v.length - 1, Math.floor(f * v.length))] }
const roll = new Map()
for (const [key, rs] of results) {
  const [arm, , b] = key.split('|')
  const k = `${arm}|${b}`
  if (!roll.has(k)) roll.set(k, [])
  roll.get(k).push(...rs.map((r) => r.secs))
}
for (const [k, secs] of roll) {
  const [arm, b] = k.split('|')
  console.log(`${arm.padEnd(42)} ${b.padEnd(7)} ${String(secs.length).padStart(3)} ${mmss(med(secs)).padStart(5)} ${mmss(q(secs, 0.25)).padStart(5)} ${mmss(q(secs, 0.75)).padStart(5)}`)
}
console.log(`\nwall ${((Date.now() - t0) / 1000).toFixed(0)}s`)
