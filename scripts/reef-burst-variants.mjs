// Builds the source trees reef-burst-grid.mjs sweeps against, under /tmp/reefv/<name>/src.
//
//   node scripts/reef-burst-variants.mjs
//   node scripts/reef-burst-grid.mjs --src /tmp/reefv/nowaiver/src --label NOWAIVER
//
// THIS FILE MEASURES NOTHING — it only writes trees; every number comes out of reef-burst-grid.mjs,
// so the denominator belongs to that run and not to this one. Read its header before quoting any of
// it: the grid's defaults are chapter reef, difficulty 3, 300s, 3 fixed seeds, one movement policy
// and one burst policy per row, player immortal, and CROWD OFF — which deletes the Pulse shove the
// press also fires, so a crowd-off table prices the Air and none of what the Air bought.
//   AND A CROSS-TREE COMPARISON MUST BE PAIRED PER SEED. A variant tree and the working tree share
// the seed list, so seed n's two runs start in the same world; differencing the two printed MEANS
// throws away that pairing and buries a small effect under a spread several times its size.
//
// THE WORKING TREE IS NEVER TOUCHED (CLAUDE.md's mutate-a-scratch-copy rule). Each variant is one
// named edit applied to a COPY, and every edit ASSERTS its anchor matched exactly once — an edit
// that silently does not apply is a variant that measures the shipped build under another label,
// which is the confidently-wrong-number failure this repo keeps paying for.
import { cpSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'

const SRC = new URL('../src', import.meta.url).pathname
const OUT = '/tmp/reefv'

// file, a regex that must match EXACTLY ONCE, and what it becomes.
const VARIANTS = {
  // R13 REVERTED. The control for the ruling itself — not for the button. `never burst` prices the
  // BUTTON; this prices the WAIVER, by leaving every policy free to press it and only removing the
  // free crossing.
  nowaiver: [['sim.js', /\n\s*if \(\(run\._burstT \?\? 0\) > 0\) inside = false\n/, '\n']],
  bsm3:  [['config.js', /export const BURST_SPEED_MUL = 9\b/, 'export const BURST_SPEED_MUL = 3']],
  bsm5:  [['config.js', /export const BURST_SPEED_MUL = 9\b/, 'export const BURST_SPEED_MUL = 5']],
  bsm13: [['config.js', /export const BURST_SPEED_MUL = 9\b/, 'export const BURST_SPEED_MUL = 13']],
  // THE DASH MOVES THE STRAFE, NOT THE SCROLL. The lane's one promise is that the forward rate is
  // fixed and nothing may touch it; this variant is the version of the Burst that KEEPS that promise
  // — the button buys the cross axis instead of buying distance down a lane whose ridges are placed
  // per-distance. Both halves in one edit, so a tree can never end up multiplying both or neither.
  cross: [['sim.js',
    /p\[ax\.vCross\] = \(ax\.cross === 'x' \? ix : iy\) \* speed \* LANE_STRAFE_MUL\n(\s*)p\[ax\.vFwd\] = ax\.dir \* laneScrollFor\(CHAPTERS\[run\.chapter\], run\.mods\) \* burstMul/,
    "p[ax.vCross] = (ax.cross === 'x' ? ix : iy) * speed * LANE_STRAFE_MUL * burstMul\n$1p[ax.vFwd] = ax.dir * laneScrollFor(CHAPTERS[run.chapter], run.mods)"]],
  cost15: [['config.js', /export const PULSE_CHARGE_COST = 45\b/, 'export const PULSE_CHARGE_COST = 15']],
  cost25: [['config.js', /export const PULSE_CHARGE_COST = 45\b/, 'export const PULSE_CHARGE_COST = 25']],
  cost60: [['config.js', /export const PULSE_CHARGE_COST = 45\b/, 'export const PULSE_CHARGE_COST = 60']],
}

rmSync(OUT, { recursive: true, force: true })
let bad = 0
for (const [name, edits] of Object.entries(VARIANTS)) {
  mkdirSync(`${OUT}/${name}`, { recursive: true })
  cpSync(SRC, `${OUT}/${name}/src`, { recursive: true })
  for (const [file, from, to] of edits) {
    const path = `${OUT}/${name}/src/${file}`
    const text = readFileSync(path, 'utf8')
    const hits = text.match(new RegExp(from.source, from.flags.includes('g') ? from.flags : from.flags + 'g'))
    if (!hits || hits.length !== 1) { console.error(`ABORT ${name}: ${file} anchor matched ${hits ? hits.length : 0} times, need exactly 1`); bad++; continue }
    writeFileSync(path, text.replace(from, to))
  }
  console.log(`${name.padEnd(9)} ${OUT}/${name}/src`)
}
if (bad) process.exit(1)
