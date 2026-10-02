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

// A V8 cpu profile -> where the timed minute went: per stage (stepSim's direct callees, inclusive)
// and per function (self). A profile says WHERE, never HOW MUCH a fix saves (CLAUDE.md): it weighs
// allocation heavily. Quote the plain ms/step for a before/after, these lists for the target.
function summarise(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const hits = profile.nodes.reduce((s, n) => s + n.hitCount, 0)
  const msPerHit = (profile.endTime - profile.startTime) / 1000 / Math.max(1, hits)
  const key = (n) => `${n.callFrame.functionName || '(anon)'} ${path.basename(n.callFrame.url || '?')}:${n.callFrame.lineNumber + 1}`
  const incl = new Map()
  const total = (n) => {
    if (incl.has(n.id)) return incl.get(n.id)
    let h = n.hitCount
    for (const c of n.children ?? []) h += total(byId.get(c))
    incl.set(n.id, h)
    return h
  }
  const add = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v)
  const self = new Map(), stage = new Map(), stepLines = new Map()
  let stepHits = 0
  for (const n of profile.nodes) {
    add(self, key(n), n.hitCount)
    if (n.callFrame.functionName !== 'stepSim') continue
    stepHits += total(n)
    for (const c of n.children ?? []) { const cn = byId.get(c); add(stage, key(cn), total(cn)) }
    add(stage, 'stepSim (own code)', n.hitCount)
    // "own code" is whatever V8 still folded into stepSim; the LINE it lands on names the callee
    for (const t of n.positionTicks ?? []) add(stepLines, `sim.js:${t.line}`, t.ticks)
  }
  const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([n, h]) => [n, +(h * msPerHit).toFixed(0)])
  return { stepMs: +(stepHits * msPerHit).toFixed(0), stage: top(stage, 12), self: top(self, 15), stepLines: top(stepLines, 5) }
}

// ---------------------------------------------------------------- worker: one run, JSON on stdout
if (process.argv[2] === '--worker') {
  const [chapter, seedS, minS, jumpS] = process.argv.slice(3)
  const seed = Number(seedS), minutes = Number(minS), jumpMin = Number(jumpS ?? 0)
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
  if (jumpMin > 0) {
    // TELEPORT: the clock jumps (the endless level reads it), the chapter's whole arsenal is taken
    // to max with every mod through devTake (the shipped pick path), then 30s fill the crowd
    // untimed. Only the ONE minute after that is timed and profiled. Slow accumulations (floor
    // loot, leftover pools) are 30s deep here, not jumpMin deep: read those from the plain sweep.
    const { devCards, devTake } = await import(url('sim.js'))
    const { CHAPTERS, MAX_WEAPON_LEVEL, WEAPON_MODS } = await import(url('config.js'))
    run.time = jumpMin * 60
    for (const id of CHAPTERS[chapter].weapons) {
      while ((run.weapons.find((w) => w.id === id)?.level ?? 0) < MAX_WEAPON_LEVEL) {
        const before = run.weapons.find((w) => w.id === id)?.level ?? 0
        devTake(run, devCards(run).find((c) => c.kind === 'weapon' && c.id === id))
        if ((run.weapons.find((w) => w.id === id)?.level ?? 0) === before) throw new Error('devTake did not level ' + id)
      }
      for (const mid of Object.keys(WEAPON_MODS[id] ?? {})) {
        const c = devCards(run).find((c) => c.kind === 'mod' && c.weapon === id && c.id === mid)
        if (!c) throw new Error(`no dev card for mod ${id}.${mid}`)
        devTake(run, c)
      }
    }
    run.phase = 'playing'
    for (let i = 0; i < 30 / DT; i++) {
      setView()
      heading += 0.35 * DT
      stepSim(run, { x: Math.cos(heading), y: Math.sin(heading), skill: false }, DT)
      run.events.length = 0
      if (run.phase === 'levelup') { applyChoice(run, autopilotPick(run, run.levelUpChoices)); run.phase = 'playing' }
      run.player.hp = run.player.maxHP
    }
    const { Session } = await import('node:inspector/promises')
    const session = new Session()
    session.connect()
    await session.post('Profiler.enable')
    await session.post('Profiler.setSamplingInterval', { interval: 200 })
    await session.post('Profiler.start')
    const t = []
    for (let i = 0; i < stepsPerMin; i++) {
      setView()
      heading += 0.35 * DT
      const t0 = performance.now()
      stepSim(run, { x: Math.cos(heading), y: Math.sin(heading), skill: false }, DT)
      t.push(performance.now() - t0)
      run.events.length = 0
      if (run.phase === 'levelup') { applyChoice(run, autopilotPick(run, run.levelUpChoices)); run.phase = 'playing' }
      run.player.hp = run.player.maxHP
    }
    const { profile } = await session.post('Profiler.stop')
    t.sort((x, y) => x - y)
    samples.push({ min: jumpMin + 1, simT: Math.round(run.time), mean: t.reduce((s, x) => s + x, 0) / t.length,
      p99: t[Math.floor(t.length * 0.99)], max: t.at(-1), counts: counts() })
    const build = run.weapons.map((w) => `${w.id}${w.level ? ':' + w.level : ''}`).join(' ')
    process.stdout.write(JSON.stringify({ chapter, seed, level: run.player.level, build, samples, prof: summarise(profile) }))
    process.exit(0)
  }
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
const jump = Number(arg('jump', '0'))   // --jump 25: teleport + full arsenal + profile one minute (see the worker)
if (seeds.some((s) => !Number.isFinite(s)) || !(minutes > 0) || !(jobs > 0) || !(jump >= 0)) { console.error('bad --seeds/--minutes/--jobs/--jump'); process.exit(1) }

const log = arg('log', path.join(os.tmpdir(), 'lag-probe.log'))   // one JSON line per finished minute
fs.writeFileSync(log, '')
const cells = chapters.flatMap((c) => seeds.map((s) => [c, s]))
console.log(`lag-probe: ${cells.length} runs (${chapters.length} chapters x ${seeds.length} seeds), ${minutes} sim-min each, ${jobs} at a time`)
const one = ([c, s]) => new Promise((res) => {
  const flags = prof ? ['--cpu-prof', '--cpu-prof-dir', prof, '--cpu-prof-name', `${c}-${s}.cpuprofile`] : []
  // V8 inlines small callees into stepSim and the profile then bills them to "stepSim (own code)".
  // --inline keeps the real (faster) numbers; without it the names are honest and ms/step is a bit high.
  if ((jump > 0 || prof) && !process.argv.includes('--inline')) flags.push('--no-turbo-inlining', '--no-maglev-inlining')
  const p = spawn(process.execPath, [...flags, fileURLToPath(import.meta.url), '--worker', c, String(s), String(minutes), String(jump)])
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

function printProf(p) {
  const pct = (ms) => `${(100 * ms / Math.max(1, p.stepMs)).toFixed(0)}%`.padStart(4)
  console.log(`   stages of stepSim (inclusive):`)
  for (const [n, ms] of p.stage.slice(0, 8)) console.log(`     ${pct(ms)}  ${n}`)
  console.log(`   hottest functions (self):`)
  for (const [n, ms] of p.self.slice(0, 8)) console.log(`     ${pct(ms)}  ${n}`)
  console.log(`   stepSim's own share, by line: ${p.stepLines.map(([n, ms]) => `${n} ${pct(ms).trim()}`).join('  ')}`)
}
if (jump > 0) {
  ok.sort((x, y) => x.chapter.localeCompare(y.chapter) || x.seed - y.seed)
  console.log(`\nTELEPORT to ${jump}:00, full arsenal maxed, 30s fill, then ONE timed + profiled sim minute (budget ${BUDGET}ms/step)`)
  for (const r of ok) {
    const s = r.samples[0], c = s.counts
    const big = Object.entries(c).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `${k}=${v}`).join(' ')
    console.log(`\n== ${r.chapter} seed ${r.seed}: ${s.mean.toFixed(1)} ms/step (p99 ${s.p99.toFixed(1)})${s.mean > BUDGET ? '  SLOWER THAN REAL TIME' : ''}   ${big}`)
    console.log(`   build: ${r.build}`)
    printProf(r.prof)
  }
  process.exit(0)
}

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
if (prof) {
  console.log(`\nWHOLE-RUN PROFILES (${prof}) — every timed minute, so the slow late ones dominate`)
  for (const r of ok) {
    const p = summarise(JSON.parse(fs.readFileSync(path.join(prof, `${r.chapter}-${r.seed}.cpuprofile`), 'utf8')))
    console.log(`\n== ${r.chapter} seed ${r.seed} (${r.samples.length} min)`)
    printProf(p)
  }
}
