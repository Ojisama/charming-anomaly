// LAG PROBE — where does an endless run's SIM time go, per chapter, as the run gets long.
//
//   node scripts/lag-probe.mjs                              # every endless chapter, 2 seeds, 30:00
//   node scripts/lag-probe.mjs --chapters city,deep --seeds 1,2,3 --minutes 20 --jobs 6
//   node scripts/lag-probe.mjs --chapters city --seeds 1 --prof /tmp/lagprof   # + a .cpuprofile
//
// Rig: the dev speedrun autopilot (sim.js fastForwardEndless: immortal, circling walk, autopilotPick
// builds) re-implemented step by step so each step can be timed. One child process per chapter x
// seed, mulberry32-seeded, dt 1/30, phone view. Every sim minute it records wall ms/step (mean, p99,
// max) and the length of EVERY array on run and run.player — discovered, not listed, so a new pool
// that grows without bound shows up without anyone remembering to add it here.
// ⚠ SIM ONLY. Render cost is not in these numbers (render.js is not importable). A chapter that
// reads cheap here can still lag on screen; the entity counts are the bridge — they are what
// render.js has to draw. Compare ms/step WITHIN one invocation: --jobs children share the CPU.
import { spawn } from 'node:child_process'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(HERE, '..', 'src')
const DT = 1 / 30
const BUDGET = 33.3   // ms: one 30fps frame, the whole of it

// ---------------------------------------------------------------- worker: one run, JSON on stdout
if (process.argv[2] === '--worker') {
  const [chapter, seedS, minS] = process.argv.slice(3)
  const seed = Number(seedS), minutes = Number(minS)
  if (!Number.isFinite(seed) || !(minutes > 0)) throw new Error(`bad worker args ${process.argv.slice(3)}`)
  const url = (f) => pathToFileURL(path.join(SRC, f)).href
  const { createRun, ensureChapterMeta } = await import(url('state.js'))
  const { stepSim, applyChoice, autopilotPick } = await import(url('sim.js'))
  const { ALL_CHAPTER_IDS } = await import(url('config.js'))
  let a = seed | 0
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const meta = { schema: 99, coins: 0, runs: 0, lang: 'en', shop: {}, chapters: {}, books: {} }
  for (const id of ALL_CHAPTER_IDS) { ensureChapterMeta(meta, id); meta.chapters[id].unlocked = true }
  const run = createRun(meta, { chapter, endless: true })
  if (run.chapter !== chapter || !run.endless) throw new Error(`createRun gave ${run.chapter} endless=${run.endless}`)
  const setView = () => { run.viewRadius = Math.hypot(390, 844) / 2; run.viewW = 195; run.viewH = 422 }

  const counts = () => {
    const out = {}
    for (const [k, v] of Object.entries(run)) if (Array.isArray(v)) out[k] = v.length
    for (const [k, v] of Object.entries(run.player)) if (Array.isArray(v)) out['player.' + k] = v.length
    return out
  }
  const samples = []
  let heading = 0, times = []
  const stepsPerMin = Math.round(60 / DT)
  for (let i = 1; i <= minutes * stepsPerMin; i++) {
    setView()
    heading += 0.35 * DT
    const t0 = performance.now()
    stepSim(run, { x: Math.cos(heading), y: Math.sin(heading), skill: false }, DT)
    times.push(performance.now() - t0)
    run.events.length = 0
    if (run.phase === 'levelup') { applyChoice(run, autopilotPick(run, run.levelUpChoices)); run.phase = 'playing' }
    run.player.hp = run.player.maxHP
    if (i % stepsPerMin === 0) {
      times.sort((x, y) => x - y)
      samples.push({
        min: i / stepsPerMin, simT: Math.round(run.time),
        mean: times.reduce((s, x) => s + x, 0) / times.length,
        p99: times[Math.floor(times.length * 0.99)], max: times[times.length - 1],
        counts: counts(),
      })
      times = []
      process.stderr.write(JSON.stringify({ chapter, seed, ...samples.at(-1) }) + '\n')
      // Past this the sim alone is slower than real time: unplayable, and every further minute costs
      // more wall time than it is worth. The table marks the run STOPPED at this minute.
      if (samples.at(-1).mean > BUDGET) break
    }
  }
  const build = run.weapons.map((w) => `${w.id}${w.level ? ':' + w.level : ''}`).join(' ')
  process.stdout.write(JSON.stringify({ chapter, seed, level: run.player.level, build, samples }))
  process.exit(0)
}

// ---------------------------------------------------------------- parent: fan out, tabulate
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const { CHAPTERS, endlessEligible } = await import(pathToFileURL(path.join(SRC, 'config.js')).href)
const all = Object.keys(CHAPTERS).filter(endlessEligible)
const chapters = arg('chapters', all.join(',')).split(',')
for (const c of chapters) if (!all.includes(c)) { console.error(`not an endless chapter: ${c} (have ${all.join(' ')})`); process.exit(1) }
const seeds = arg('seeds', '1,2').split(',').map(Number)
const minutes = Number(arg('minutes', '30')), jobs = Number(arg('jobs', '6')), prof = arg('prof', null)
if (seeds.some((s) => !Number.isFinite(s)) || !(minutes > 0) || !(jobs > 0)) { console.error('bad --seeds/--minutes/--jobs'); process.exit(1) }

const log = arg('log', path.join(os.tmpdir(), 'lag-probe.log'))   // one JSON line per finished minute
fs.writeFileSync(log, '')
const cells = chapters.flatMap((c) => seeds.map((s) => [c, s]))
console.log(`lag-probe: ${cells.length} runs (${chapters.length} chapters x ${seeds.length} seeds), ${minutes} sim-min each, ${jobs} at a time`)
const one = ([c, s]) => new Promise((res) => {
  const flags = prof ? ['--cpu-prof', '--cpu-prof-dir', prof, '--cpu-prof-name', `${c}-${s}.cpuprofile`] : []
  const p = spawn(process.execPath, [...flags, fileURLToPath(import.meta.url), '--worker', c, String(s), String(minutes)])
  let out = '', err = ''
  p.stdout.on('data', (d) => (out += d))
  p.stderr.on('data', (d) => { err += d; fs.appendFileSync(log, d) })   // live: tail -f the log
  p.on('close', (code) => {
    if (code !== 0) { console.error(`FAIL ${c}/${s}: ${err.trim().split('\n').slice(-3).join(' | ')}`); return res(null) }
    process.stderr.write('.'); res(JSON.parse(out))
  })
})
const results = []
const queue = [...cells]
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { while (queue.length) results.push(await one(queue.shift())) }))
console.error('')
const ok = results.filter(Boolean)
if (ok.length !== cells.length) { console.error(`only ${ok.length}/${cells.length} runs reported — no table`); process.exit(1) }

const marks = [1, 5, 10, 15, 20, 30, 45, 60].filter((m) => m <= minutes)
const f = (x) => x.toFixed(2).padStart(6)
console.log(`\nSIM ms/step (mean | p99) at sim minute — 33.3ms is the whole 30fps frame budget on THIS machine`)
console.log('chapter      seed lvl  ' + marks.map((m) => `${m}m`.padStart(15)).join(''))
ok.sort((x, y) => x.chapter.localeCompare(y.chapter) || x.seed - y.seed)
for (const r of ok) {
  const cols = marks.map((m) => { const s = r.samples[m - 1]; return s ? `${f(s.mean)} |${f(s.p99)}` : ''.padStart(15) })
  const stop = r.samples.at(-1).mean > BUDGET ? `  STOPPED at ${r.samples.length}m: sim slower than real time` : ''
  console.log(`${r.chapter.padEnd(12)} ${String(r.seed).padStart(4)} ${String(r.level).padStart(3)}  ${cols.join('')}${stop}`)
}
console.log(`\nARRAYS at the last minute (top 6 by length; growth = last / minute-5)`)
for (const r of ok) {
  const last = r.samples.at(-1).counts, early = r.samples[Math.min(4, r.samples.length - 1)].counts
  const top = Object.entries(last).sort((x, y) => y[1] - x[1]).slice(0, 6)
    .map(([k, v]) => `${k}=${v}${early[k] ? ` (x${(v / early[k]).toFixed(1)})` : ''}`)
  console.log(`${r.chapter.padEnd(12)} ${String(r.seed).padStart(4)}  ${top.join('  ')}`)
  console.log(`${''.padEnd(18)}build: ${r.build}  worst step ${Math.max(...r.samples.map((s) => s.max)).toFixed(0)}ms`)
}
