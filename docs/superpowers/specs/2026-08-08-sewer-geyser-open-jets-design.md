# Sewer Geyser → open jets

**Date:** 2026-08-08
**Status:** design approved, not implemented
**Touches:** `config.js`, `sim.js`, `render.js`, `ui.js`, `fr.js`, `state.js` (doc block), `test/sim-test.js`, `scripts/`

## The problem, measured

Five seeds × 240s, city chapter, difficulty 3, one weapon equipped, all level-up offers refused.
Harness: `scripts/weapon-census.mjs` (added by this work).

Effective dps = HP actually destroyed per second, measured by diffing enemy `hp` across each step and
crediting the full remaining hp of anything that vanished. It is *not* the sum of `hit` event `dmg`,
which reports the raw swing and so credits overkill in full.

| level 5 | raw dps | effective dps | wasted as overkill | kills/min | dmg per hit |
|---|---|---|---|---|---|
| Neon Beam | 445 | 378 | 15% | 199.8 | 40.5 |
| Trash Tornado | 478 | **408** | 15% | 229.5 | 38.7 |
| Sewer Geyser | 531 | **383** | **28%** | 198.5 | 93.3 |

The geyser swings hardest and destroys least.

Per-eruption catch rate, same runs:

| | eruptions | hit nothing | caught ≤1 | avg caught |
|---|---|---|---|---|
| L1, moving | 672 | **43.8%** | 12.2% | 5.59 |
| L3, moving | 650 | 29.1% | 16.8% | 3.72 |
| L5, moving | 797 | **27.4%** | 24.1% | 2.16 |
| L5, standing still | 677 | **11.4%** | 26.1% | 3.55 |
| L5 + Broken Mains ×2 | 750 | 24.1% | **35.7%** | 1.48 |

Roughly half the weapon's damage budget goes nowhere: **27% of eruptions hit nothing at all, and 28%
of what does land is overkill.**

Three root causes, in order of size:

1. **The mark is placed where an enemy *stands*, and resolved 0.65s later.** A wisp moves 165 px/s,
   so it travels 107px out of a 128px circle before the fuse burns down. The late-game wave table is
   wisp-dominated (5:3:1 at t=240s), so the weapon degrades exactly when it should scale. Standing
   still cuts the whiff rate by 2.4× — **the weapon punishes kiting**, the core verb of the genre.
2. **One 93-damage pop into a 20-HP-base roster.** All the surplus on a killing blow is discarded.
3. **`moreGeysers` (Broken Mains) makes the feel worse, not better** — more one-shot pops scattered
   over the same crowd is the worst line in the table (1.48 caught each).

Secondary: at 5.7 hits/s it gives half the tactile feedback of the beam (11.0) or tornado (12.3) for
the same nominal damage — big slow numbers you mostly do not see land.

## The design

The eruption stops being an instant and becomes a **jet that stays open**. The weapon's role changes
from "delayed grenade" to **static terrain you leave behind** — distinct from the beam (a pointed
line) and the tornado (a mobile bubble you carry). Three different verbs, no overlap.

### Cast

Shape unchanged: plant `count` marks within `castRange`, each with a harmless `fuse` telegraph.

One targeting change: **plant the mark on the segment from the target toward the player, ~40% along**,
rather than on the target itself. Everything in the swarm converges on the player, so that point is
the traffic lane. This is the honest fix for "marks where they stood" and is a one-expression change
in `pickGeyserSpot`.

`LEAD_FRAC = 0.40` is a calibration knob, not a believed constant — tune it against the whiff metric.

### Eruption and jet

On fuse expiry the mark blows open and the jet **sprays for `jetDur`** (~2.5s at L1 → ~3.0s at L5),
damaging on a per-enemy cooldown of `tick` (~0.4s). The first tick is the eruption punch; the rest is
spray. Enemies only — the geyser has never touched the player and still must not.

The cooldown is keyed **per `(enemy, jet)` pair, not per enemy**, so overlapping jets compound. This
is what turns Broken Mains from a trap into a real pick: a corridor of overlapping jets stacks, where
scattered one-shot pops merely divide the crowd.

`run.geysers[i]` gains `jetDur`, `tick`, and a per-jet map of enemy id → next-tick time. The
telegraph → erupt → gone contract in `state.js` is shared with the Reality Shard's `riftScar`, which
must keep its current one-shot behaviour: **rifts arrive with `jetDur` absent and take the instant
path.** This is the same guard `_chained` already uses to keep `chainGeyser` from firing off a rift.

### Push

Enemies inside a live jet drift outward at ~50 px/s — well under their 90–165 px/s walk speed, so a
seeking enemy walks back in and mills at the rim rather than being ejected. A jet that ejected its
own targets would defeat itself; this is a soft wall, not a repulsor. Calibration knob.

The `launch` mod keeps its hard fling + stun (`GEYSER_LAUNCH_KB`, `GEYSER_STUN`) and now fires on the
**eruption frame only**, so the mod stays distinct from the baseline drift.

### Damage budget

Target: **best in the city chapter.** Effective dps ~450+, above the Trash Tornado's 408, paying out
for the slowest and most positional playstyle of the three. Acceptance thresholds:

- effective dps at L5 ≥ 450 (measured, not nominal)
- whiff rate at L5 < 5%
- overkill waste at L5 ≤ ~15% (parity with beam and tornado)
- kills/min at L5 ≥ the tornado's 229.5

Starting split at L5 for the tuning loop, **not** final numbers: eruption punch ~48, spray tick ~22,
`jetDur` 3.0, `tick` 0.4 → ~200 for a full soak, ~70 for a clip-through. Slow things eat it and fast
things do not, which makes the geyser the chapter's anti-tank tool by construction. All five entries
of `levels[]` get tuned against the harness; do not hand-extrapolate from the L5 row.

### Mods

All seven survive. Changes only where the persistent jet requires one:

| mod | change |
|---|---|
| `pressure` (High Pressure) | unchanged — scales `dmg`, which now scales both punch and spray |
| `wideGeyser` (Wide Geyser) | unchanged |
| `rapidGeyser` (Burst Main) | unchanged |
| `moreGeysers` (Broken Mains) | unchanged in code; now compounds via overlap instead of scattering |
| `launch` (Launch) | fires on the eruption frame only |
| `chainGeyser` (Chain Burst) | follow-ups spawn at the parent's **mid-life** instead of on eruption |
| `trafficMain` (Traffic Main) | street jets hit harder **and last longer** — extend to `jetDur` |

Deferred, explicitly not built now: an epic capstone "the main bursts" that makes every 4th cast tear
a ~700px sequenced fissure along the street axis instead of planting circles. Recorded here so it is
not re-invented; it collides with the Neon Beam and needs its own round.

### Art

The camera looks straight down. **No column, no side elevation** — the v6.8 Trash Tornado shipped a
side view into a top-down camera and cost a full version to undo. Ask the second question on every
capture: *is this the same viewpoint as the sprites around it?*

- **Telegraph:** as today in spirit, but **fill down, rim up**. Up to ~12 live jets can overlap and
  the current translucent-disc treatment turns to soup; distinct rims are what keep it readable.
- **Eruption instant:** the manhole cover flips — a dark ellipse tumbling outward, spinning, settling
  a few px away. One cheap detail that says "sewer" and "from above" simultaneously. Plus a hard
  white flash ring.
- **Open jet:** a bright churning white-green core at ~30% of the radius; droplet streaks flung
  radially and falling back *inside* the rim; the rim ring swelling and collapsing on a ~0.5s cycle
  as water falls back; drifting steam haze.
- **Close:** core collapses, spray falls, steam lingers a beat, a wet dark patch fades.
- **The rim is the hitbox and must be legible at all times** — the weapon is now terrain the player
  routes around, so an ambiguous edge is a gameplay bug, not a polish issue.

Colour stays the sewer-green safety cue (`0x3fae7a` / `0x6fe0a8`): geysers damage enemies only and
must never be confusable with the red volatile-bomb telegraph that hurts the player.

### Jet density — decided from images

Two profiles, to be judged from labelled captures of the same in-game frame rather than from prose:

- **Few and big:** cap ~6 live jets, larger radius each. Terrain features you route around.
- **Many and small:** cap ~12 live jets, current-ish radius. A minefield you thread through.

Build both behind a throwaway query param read at **module scope** in `render.js` (the documented
`?tv=N` idiom — bakes happen once at boot, so a per-frame read does not work), capture with
`scripts/fx-probe.mjs` and a new `scripts/scenes/geyser-jets.js`, and send both variants plus a
motion GIF. **Delete the param and the losing profile with the pick, and grep the param name to prove
it is gone before committing.**

## Plumbing

Two new `levels[]` keys, `jetDur` and `tick`. **Only `jetDur` gets registered on the build sheet.**
A stat must be registered in both places or it is silently absent, with no warning:

1. `buildReadout`'s hardcoded whitelist array in `sim.js` (~line 3585) — insert `jetDur` **after
   `r`**.
2. `STAT_LABEL` in `ui.js` (~line 1346) for the row label.
3. The French in `fr.js` — run XX asserts config coverage, not UI-chrome coverage, so a missing label
   will not be caught by the suite.

The row budget works out exactly, and the arithmetic is worth writing down because it is one row from
breaking. `buildReadout` emits whitelist keys in **whitelist order**, then appends the cadence row
`every` (computed from `base.rate`) last; `ui.js` then does `w.stats.slice(0, STAT_MAX_ROWS)` with
`STAT_MAX_ROWS = 5`. The geyser currently emits dmg, count, r, every = 4 rows. Adding `jetDur` gives
dmg, count, r, jetDur, every = **exactly 5. Nothing drops.**

Two corrections to assumptions that look reasonable and are wrong:

- **`castRange` and `fuse` are not on the whitelist and never appeared on the sheet.** There is
  nothing to drop for them.
- **Do not add `tick` to the whitelist.** It would make 6 rows and push `every` — the cadence, the
  most useful row on the sheet — off the geyser. It is also not a geyser-only key: the Trash Tornado
  already carries `tick` in its `levels[]`, so registering it changes the tornado's sheet too
  (the tornado emits 5 whitelist rows already, so `every` is *already* sliced off there — inserting
  `tick` ahead of `travelSpeed` would cost it `travelSpeed` as well). Leave `tick` unshown, as it is
  for the tornado today.

`fr.js` edits must not be made by exact-string match on any line carrying U+00A0 before `: ; ! ?` —
anchor on a line with no French punctuation, or edit with node.

`state.js`'s `run.geysers` doc block (~line 959) documents the shape and the shared riftScar contract;
update it in the same commit.

`fr.js` edits must not be made by exact-string match on any line carrying U+00A0 before `: ; ! ?` —
anchor on a line with no French punctuation, or edit with node.

`state.js`'s `run.geysers` doc block (~line 959) documents the shape and the shared riftScar contract;
update it in the same commit.

## Testing

**Harness.** `scripts/weapon-census.mjs` — to be written as the first step of implementation,
consolidating the three throwaway scripts that produced every number in this spec. Takes a chapter, a
weapon list, a level and a seed set; prints raw dps, effective dps, overkill waste, kills/min, whiff
rate and avg caught per eruption. This is the acceptance gate for the damage budget, so it lands
before any balance change does — the tables above are the pre-change baseline it must reproduce.

Note the two traps it has to bake out, both of which produced wrong readings during design:

- **`run.events` must be drained every step** (`splice(0)`, as `main.js` does). Left undrained the
  backlog is recounted every frame and dps reads ~2800× high.
- **`hit` event `dmg` is the raw swing, not HP removed.** Measuring damage from events credits
  overkill in full and inverted the ranking of all three city weapons in the first pass.

**Seeded suite** (`test/sim-test.js`, append in the existing style):

- a live jet damages the same enemy more than once over its life
- a jet never damages the player, at any point in its life
- a Reality Shard `riftScar` rift still resolves as a single instant pop (no `jetDur`)
- overlapping jets both tick the same enemy in the same window (the per-`(enemy, jet)` cooldown)
- live jets are capped, and the cap is not exceeded under `moreGeysers` + `chainGeyser` together

**Visual:** `scripts/scenes/geyser-jets.js` for `fx-probe.mjs` — one scene, frames across a jet's full
life (telegraph → eruption → spray → close), captured at both density profiles.

## Risks

- **Screen legibility** is the main one. Twelve overlapping translucent discs is unreadable, and the
  rim is now load-bearing for gameplay. The density A/B exists to settle this from images.
- **Anti-tank scaling.** A full-soak jet does ~3× a clip-through, so the weapon's power against slow
  enemies rises much faster than against fast ones. Intended, but it means the L5 numbers must be
  tuned against the real wisp-heavy late wave table, not against a static target dummy.
- **The riftScar shared contract.** `stepGeysers` serves two weapons. A jet field that accidentally
  makes Reality Shard rifts persistent is a silent cross-weapon balance change.
