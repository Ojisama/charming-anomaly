#!/usr/bin/env node
// THE SHIP GATE: every scenario in test/sim-test.js, each in its own process, several at a time.
//
// WHY ONE PROCESS PER SCENARIO. The suite seeds Math.random per scenario, but not every scenario
// does it, and one that does not inherits whatever phase its predecessors left. run V.f (the pond
// currents signature) was exactly that: the drift it measures ranges 18.1px to 158.9px across
// seeds and its threshold sat at 20, so it passed only because the full-suite ORDER lands on a
// phase where it passes. Nothing announced this. It surfaced the moment `--fast` skipped the
// scenarios in front of it, and it would equally have surfaced as a mystery red on some future
// unrelated edit — which is the shape CLAUDE.md's false-red protocol describes from the other side.
//
// That used to make this a separate "run it once before committing" tool, because 172 sequential
// child processes took minutes. It does not any more: a child costs 91ms to boot and the work
// parallelises perfectly, so the whole suite lands in about the time its LONGEST SINGLE SCENARIO
// takes. Order-independence is therefore no longer a property someone has to remember to check —
// it is the only way the gate ever runs.
//
//   npm test                                  every scenario (the gate)
//   npm test element                          only scenarios whose name matches, case-insensitive
//   node scripts/test-isolation.mjs --list    just print the scenario names
//   node scripts/test-isolation.mjs --jobs=1  one at a time, for a machine under load
//   npm run test:serial                       the old single-process run, for a debugger or a print
//
// LONGEST FIRST, or the wall clock is whenever the big one happened to be dispatched. The order
// comes from the previous run's own measurements, cached under node_modules (never committed, and
// never load-bearing: a missing or stale cache costs wall clock and can never change the verdict).
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cpus } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'node_modules/.cache/sim-test-times.json')
const src = readFileSync(join(ROOT, 'test/sim-test.js'), 'utf8')
const all = [...new Set([...src.matchAll(/^\s*run\((\w+)\)$/gm)].map((m) => m[1]))]

if (!all.length) {
  console.error('No `run(scenario)` call sites found — has the runner in test/sim-test.js changed shape?')
  process.exit(2)
}
if (process.argv.includes('--list')) {
  console.log(all.join('\n'))
  process.exit(0)
}

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(k))
  return a ? a.slice(k.length) : d
}
const filter = process.argv.slice(2).find((a) => !a.startsWith('-')) || ''
const names = filter ? all.filter((n) => n.toLowerCase().includes(filter.toLowerCase())) : all
if (!names.length) {
  console.error(`No scenario name matches '${filter}'. Try: node scripts/test-isolation.mjs --list`)
  process.exit(2)
}
const JOBS = Math.max(1, Math.min(Number(arg('--jobs=', 0)) || 8, cpus().length))

let times = {}
try { times = JSON.parse(readFileSync(CACHE, 'utf8')) } catch { /* first run, or cache cleared */ }
// Unknown scenarios sort as heavy, so a newly added one is dispatched early rather than last.
const queue = [...names].sort((a, b) => (times[b] ?? Infinity) - (times[a] ?? Infinity))

const t0 = Date.now()
const out = new Map()   // name -> { ok, text, ms }
let next = 0
let done = 0

function startOne() {
  if (next >= queue.length) return null
  const n = queue[next++]
  const started = Date.now()
  const child = spawn('node', ['test/sim-test.js', `--only=${n}`], { cwd: ROOT })
  let text = ''
  child.stdout.on('data', (d) => { text += d })
  child.stderr.on('data', (d) => { text += d })
  return new Promise((resolve) => {
    child.on('close', (code) => {
      out.set(n, { ok: code === 0 && text.includes('ALL TESTS PASSED'), text, ms: Date.now() - started })
      process.stderr.write(++done % 10 === 0 ? String(done) : '.')
      resolve()
    })
  })
}

async function worker() { for (let p = startOne(); p; p = startOne()) await p }

console.log(`${names.length} scenarios, one process each, ${JOBS} at a time\n`)
await Promise.all(Array.from({ length: JOBS }, worker))
console.error('')

// DENOMINATOR, not a vibe: a pool that dropped a task would otherwise look exactly like a pass.
if (out.size !== queue.length) {
  console.error(`\nABORT: ${out.size} of ${queue.length} dispatched scenarios reported back — the pool lost one. This is not a pass.`)
  process.exit(2)
}
// COVERAGE, which is the harder half. A dispatched name is not a scenario that RAN: 13 of the 172
// run() sites sit inside testCrazyMods' body, so a child asked for one of those alone reaches
// nothing and exits 0. The old serial runner counted call sites and called that "ALL 172 SCENARIOS
// PASS IN ISOLATION" for its whole life. Every child now names what it reached; the union has to be
// the whole list, or this is not a pass whatever the children said.
const covered = new Set()
for (const r of out.values()) {
  const line = r.text.split('\n').find((l) => l.startsWith('#RAN '))
  if (line) for (const n of line.slice(5).trim().split(',')) if (n) covered.add(n)
}
const uncovered = names.filter((n) => !covered.has(n))
if (uncovered.length) {
  console.error(`\nABORT: ${uncovered.length} of ${names.length} scenarios were never REACHED by any child, only dispatched:`)
  console.error('  ' + uncovered.join('\n  '))
  console.error('This is not a pass. A scenario nested inside another must be reachable through its parent.')
  process.exit(2)
}

// Source order, not completion order, so the log is the same log every time and diffs cleanly.
const bad = []
for (const n of names) {
  const r = out.get(n)
  if (r.ok) { process.stdout.write(r.text.split('\n').filter((l) => l.startsWith('PASS')).join('\n') + '\n'); continue }
  bad.push({ n, text: r.text })
}

try {
  mkdirSync(dirname(CACHE), { recursive: true })
  const merged = { ...times }
  for (const [n, r] of out) merged[n] = r.ms
  writeFileSync(CACHE, JSON.stringify(merged))
} catch { /* the cache is an optimisation; never fail the gate over it */ }

const wall = ((Date.now() - t0) / 1000).toFixed(1)
const slowest = [...out].sort((a, b) => b[1].ms - a[1].ms)[0]
if (!bad.length) {
  console.log(`\nALL TESTS PASSED — ${covered.size} scenarios in ${wall}s across ${JOBS} processes, each alone, so the suite is order-independent and a filtered run means what it says.`)
  console.log(`Floor is the longest single scenario: ${slowest[0]} at ${(slowest[1].ms / 1000).toFixed(1)}s.`)
  process.exit(0)
}
console.log(`\n${bad.length} of ${names.length} scenarios FAILED (${wall}s):\n`)
for (const b of bad) {
  console.log(`--- ${b.n} ${'-'.repeat(Math.max(0, 72 - b.n.length))}`)
  console.log(b.text.split('\n').filter((l) => !l.startsWith('PASS')).join('\n').trim() + '\n')
}
console.log('A scenario that fails here but passes inside `npm run test:serial` depends on what ran')
console.log('before it — almost always an unseeded Math.random, or a threshold sitting inside the natural')
console.log('spread of a sampled quantity. Seed the scenario, then pick the threshold from the PATHOLOGY')
console.log('it must catch rather than from the value it happens to produce.')
process.exit(1)
