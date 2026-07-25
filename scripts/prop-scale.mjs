// Prop-scale ladder audit.
//
// Background (the bug this guards against): the user reported "sometimes cars are bigger than
// houses". Cause: render.js's baked prop tables sized entries with `scale:` — a plain multiplier
// on each texture's OWN arbitrary baked size — with nothing enforcing that one class's scale
// range times its baked size couldn't exceed another's. T.car bakes from TRAFFIC_CAR_LEN=150 and
// is drawn at scale [0.55, 0.75] = 82-112px; T.house is hand-drawn at 48px and drawn at scale
// [0.9, 1.4] = 43-67px — a car up to 2x a house, because the two ranges were tuned independently
// against two unrelated baked sizes. PROP_SCALE (config.js) is now the single source of truth: an
// ordered ladder of DISJOINT, ABSOLUTE px bands per prop CLASS, so ordering holds by construction.
//
// This script has two jobs, in the "print a table, flag violations" shape of
// scripts/obstacle-contrast.mjs:
//
//  1. Audit PROP_SCALE itself (config.js): its bands must be strictly ordered and non-overlapping
//     — a data-integrity check on the ground truth.
//  2. Grep src/render.js for a REGRESSION of the exact bug PROP_SCALE replaces: a baked prop entry
//     named after a PROP_SCALE class still sized with a bare `scale:` multiplier instead of an
//     absolute size. This is the check that actually catches the bug coming back — #1 only audits
//     config.js's data, which render.js is never forced to read.
//
// Exit non-zero on any violation so this can gate a build later (not wired up yet).

import { PROP_SCALE } from '../src/config.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RENDER_PATH = path.join(__dirname, '..', 'src', 'render.js')

const violations = []

// ---- 1. Ladder check --------------------------------------------------------------------------
// PROP_SCALE's keys are declared in ASCENDING tier order in config.js (its own comment: "Bands
// are DISJOINT and ORDERED"). Consecutive entries with the IDENTICAL [min, max] are deliberately
// one tier under two names (fence/hedge, house/pier, barn/silo) — not a violation. Consecutive
// entries with a DIFFERENT band must satisfy prevTierMax < nextMin — STRICT, per PROP_SCALE's own
// comment ("max(class) < min(next class)"): a class whose min merely equals the tier below's max
// would still "reach" it, so touching counts as a violation, not just crossing.
console.log('PROP_SCALE ladder:')
console.log('class     min    max')
let tierBand = null
for (const [key, band] of Object.entries(PROP_SCALE)) {
  const [min, max] = band
  console.log(`${key.padEnd(9)} ${String(min).padStart(4)}   ${String(max).padStart(4)}`)

  if (!(min < max)) {
    violations.push(`PROP_SCALE.${key}: expected min < max, got [${min}, ${max}]`)
    continue
  }

  const sameTier = tierBand && min === tierBand[0] && max === tierBand[1]
  if (!sameTier) {
    if (tierBand && min <= tierBand[1]) {
      violations.push(
        `PROP_SCALE.${key}: min (${min}) does not clear the previous tier's max (${tierBand[1]}) — bands touch or overlap`
      )
    }
    tierBand = band
  }
}

// ---- 2. render.js regression grep --------------------------------------------------------------
// Every prop-table entry in render.js is written as a single-line object literal (true of every
// table as of this writing, e.g. `{ name: 'house', baked: true, upright: true, scale: [0.9, 1.4] },`
// — so a per-line regex is enough; a future multi-line entry would silently escape this check).
//
// applyPropKind (render.js) treats a BAKED entry's `scale` as a plain multiplier of the texture's
// own arbitrary baked size — exactly the mechanism PROP_SCALE replaces (see its doc comment in
// config.js). A baked entry named after a PROP_SCALE class (e.g. 'house', 'car') that still
// carries a bare `scale:` is a live instance of the "cars bigger than houses" bug: nothing ties
// its multiplier to the class's absolute band, so it can drift arbitrarily far from its
// neighbours again exactly as it did before PROP_SCALE existed.
//
// Sheet-prop entries (no `baked: true`) are NOT flagged: their `size:` field is already an
// absolute on-screen px target (applyPropKind's non-baked branch divides by the sheet's 1024px
// source and sets scale from that), so they were never part of this bug — only BAKED entries
// mix an absolute-looking number with a texture of unknown native size.
//
// Name-based scoping is a real limitation: a prop conceptually in a PROP_SCALE class but drawn
// under a different literal `name` (e.g. a future differently-named barn variant) would not be
// caught here. As of this writing every class that has a render.js prop uses the class's own name
// literally (confirmed by grepping render.js for each PROP_SCALE key), so this is a live check,
// not a hypothetical one — see the violations below if that's changed since.
const classNames = new Set(Object.keys(PROP_SCALE))
const entryRe = /name:\s*'([^']+)'/
const renderLines = readFileSync(RENDER_PATH, 'utf8').split('\n')
renderLines.forEach((line, idx) => {
  const m = line.match(entryRe)
  if (!m) return
  const name = m[1]
  if (!classNames.has(name)) return
  if (!/baked:\s*true/.test(line)) return
  if (/scale:\s*\[/.test(line)) {
    violations.push(`render.js:${idx + 1}: baked prop '${name}' (a PROP_SCALE class) still uses a bare scale: multiplier instead of an absolute size — ${line.trim()}`)
  }
})

console.log()
if (violations.length === 0) {
  console.log('No violations found.')
} else {
  console.log(`${violations.length} violation(s):`)
  for (const v of violations) console.log(` - ${v}`)
}

process.exit(violations.length === 0 ? 0 : 1)
