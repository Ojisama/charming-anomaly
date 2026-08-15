#!/usr/bin/env node
// Does every scenario in test/sim-test.js still pass ALONE?
//
// WHY THIS EXISTS. The suite seeds Math.random per scenario, but not every scenario does it, and
// one that does not inherits whatever phase its predecessors left. run V.f (the pond currents
// signature) was exactly that: the drift it measures ranges 18.1px to 158.9px across seeds and its
// threshold sat at 20, so it passed only because the full-suite ORDER lands on a phase where it
// passes. Nothing announced this. It surfaced the moment `--fast` skipped the scenarios in front
// of it, and it would equally have surfaced as a mystery red on some future unrelated edit — which
// is the shape CLAUDE.md's false-red protocol describes from the other side.
//
// An order-coupled scenario makes `node test/sim-test.js <filter>` a liar, so the filter is only
// worth having if this stays green. Run it after adding a scenario, and after any change that
// alters how many randoms get drawn.
//
//   node scripts/test-isolation.mjs           every scenario, one child process each
//   node scripts/test-isolation.mjs --list    just print the scenario names
//
// Takes a couple of minutes: it is a pre-commit-once tool, not part of npm test.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(ROOT, 'test/sim-test.js'), 'utf8')
const names = [...new Set([...src.matchAll(/^\s*run\((\w+)\)$/gm)].map((m) => m[1]))]

if (!names.length) {
  console.error('No `run(scenario)` call sites found — has the runner in test/sim-test.js changed shape?')
  process.exit(2)
}
if (process.argv.includes('--list')) {
  console.log(names.join('\n'))
  process.exit(0)
}

console.log(`${names.length} scenarios, each in its own process\n`)
const bad = []
for (const n of names) {
  const r = spawnSync('node', ['test/sim-test.js', n], { cwd: ROOT, encoding: 'utf8' })
  const out = (r.stdout || '') + (r.stderr || '')
  if (out.includes('ALL TESTS PASSED')) { process.stdout.write('.'); continue }
  const why = (out.match(/^FAIL: .*/m) || out.match(/AssertionError.*/) || ['(no FAIL line)'])[0]
  bad.push({ n, why: why.slice(0, 160) })
  process.stdout.write('x')
}
console.log('\n')

if (!bad.length) {
  console.log(`ALL ${names.length} SCENARIOS PASS IN ISOLATION — the suite is order-independent, so a filtered run means what it says.`)
  process.exit(0)
}
console.log(`${bad.length} of ${names.length} scenarios fail when run alone:\n`)
for (const b of bad) console.log(`  ${b.n}\n      ${b.why}\n`)
console.log('Each depends on what ran before it — almost always an unseeded Math.random, or a threshold')
console.log('sitting inside the natural spread of a sampled quantity. Seed the scenario, then pick the')
console.log('threshold from the PATHOLOGY it must catch rather than from the value it happens to produce.')
process.exit(1)
