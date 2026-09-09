# The Deep absorbs The Twilight (design)

Status: **design agreed 2026-09-09** (owner, this session). Amends
`2026-08-17-undertow-murk-chapter-design.md` §1–§6 (which created The Twilight by moving the light
down from The Shelf) and `2026-08-13-book-2-undertow-design.md` §5/§6 for the last two chapters.
Everything about the book outside these two chapters still stands.

---

## 1. Why this exists

The owner asked whether the lights that were "disguised female anglerfish biting you if you stay
too long" had disappeared. They had not: they are The Deep's maws, one rung below The Twilight.
Reading the two chapters side by side, his ruling was that they are **two darkness-themed levels
back to back**, and he wants one:

> "let's merge those two levels that would be 2 'darkness themed' levels. I want the weapons of the
> twilight (light related) but the darkness of the abyss"

The repo agrees. `CHAPTERS.twilight`'s own block records that it **has no hazard** (owner ruling
2026-08-17, "ship it bar-only, add the hazard later"), that its tank is **a borrowed stand-in from
The Deep**, and that its move-speed slow is "not distinguishable from The Trawl's `tire`". Its whole
identity is a light bar and three weapons that read it. The Deep has the same bar, the same dark
rig, a hazard welded to the refill (the maws), a shark-sized roster of its own — and a weapon pool
that is one native plus two borrowed cards. Each chapter has the half the other lacks.

## 2. What it becomes, in one line

> **The Deep, the finale of Undertow: the only light is an anglerfish that feeds you and bites if
> you overstay, and everything you fight with is made of light.**

## 3. The survivor is The Deep (owner ruling)

`deep` keeps its id, its name, its slot as the last chapter, and every mechanical field it has
today. Nothing about the dark, the maws, the Scent button, the roster, the balance block, the
obstacles or the palette changes. The one edit to the chapter block:

```
weapons: ['<starter>', 'sunspear', 'foxfire', 'sunlance'], starter: '<starter>'
```

Fin Hit, Chitter Shriek and mines leave the pool. **Four weapons, so the pool's ideation debt is
cleared by this change** (owner, same session: "There's a missing weapon right?").

### 3.1 The starter is new: a small light projectile that costs Light (owner ruling)

> "The starter should be a mimic of chapter 1-1, just a small light projectile. Costs 1 light to
> fire."

**A mimic of Spike Protein** (`WEAPONS.star`, The Body's starter): a dart at the nearest enemy,
`count` per cast rising with level, `pierce`, `speed`, an `interval` in the half-second band. Its
fire site reuses `fireStar`'s shape; it is a `run.bullets`-class projectile wearing a light look,
no new `run.*` array. Rarity normal. Working name **Glint**, desc along the lines of *"Flings a
dart of light at what is nearest. Each cast costs 1 Light."* — it names the bar in the HUD's own
word, the Sunlance idiom. Both the name and the French are the owner's pick at the fr review.

**The cost is 1 Light PER CAST** (one volley, whatever its projectile count), ruled over
per-projectile: across the levels that is ~1.8–3 Light/s, close to the chapter's own 2.0/s drain,
so owning the starter roughly doubles the drain while it is firing and levelling adds darts, not
cost. Per-projectile would have reached ~12/s at L5 — a full bar in eight seconds.

**At zero Light it STILL FIRES; the bar simply cannot go below zero** (owner, over "half damage"
and over "does not fire"). The cost is real for as long as there is Light to lose — sight, and
Sunlance's reach — and an empty bar leaves you blind but never unarmed. That is the no-spiral rule
every Book 2 bar block already states, applied to the one weapon every run begins with. The spend
is a `run.charge` subtraction at the fire site, clamped at 0, and it goes through nothing else:
NOT `chargeDrainMul` (Slow Burn is a card about the ambient drain, not about ammo) and NOT a
kill refill in reverse.

### 3.2 Sunspear leaves the starter slot at double damage (owner ruling)

> "Let's move the light column to not starter, double its damage."

`WEAPONS.sunspear.levels[].dmg` is doubled at every level (17→34 … 40→80). Its splash radius,
cadence, count and castRange are untouched, and it stays normal rarity. Its block's own measurement
("damage was the wrong knob … weaker columns leave bodies alive to eat more columns") was made at
starter parity in the Twilight; at double damage in a pool it no longer opens, it is a pick, not
a baseline, and the census in §6 re-reads it beside the new starter. The stale "the chapter's
starter" and "the Pulse's AMMO" lines in its comment are fixed in the same edit.

**Why The Deep and not The Twilight:** the maws' sim (`stepMaws`, `inMaw`, `mawFeeding`), their
tests (run DP, ~340 lines), their render rig, the Scent button and the roster are all keyed to
`deep`. The Twilight's own contribution is three `WEAPONS` entries, which are chapter-agnostic by
construction (their block says so: "NO NEW run.* ARRAY … a column is a run.lobs entry, a foxfire is
a run.blooms entry, a lance is a run.beams entry"). Moving three pool ids is a one-line change;
moving the maws is not. And The Twilight was never live — `wipFrom: 5` gated it for its whole
existence — so no player save carries its id and nothing migrates.

## 4. The book after

`BOOKS.undertow.chapters` becomes six:

```
['surf', 'shelf', 'reef', 'trawl', 'wreck', 'deep']
```

`wipFrom: 5` is **unchanged and needs no edit** — it is an index, so The Wreck stays the last live
rung and The Deep becomes the WIP one, exactly as the Trawl swap left it. Every assertion in the
suite that names the book's length or its last chapter reads the list (`BOOKS.undertow.chapters.at(-1)`,
`undertow.length`), so none is hand-edited. `chapterNumber`/`spineName`'s table (`config.js:10098`)
loses its `twilight` row.

## 5. What is deleted

### 5.1 The Twilight, in full

| Delete | Where |
|---|---|
| `CHAPTERS.twilight` | config.js, the whole block including the comment history |
| its id in `BOOKS.undertow.chapters`, `spineName`, `MUTATORS.sticky.exclude` | config.js |
| `ROSTER_LOOKS.copepod`, `.krill` and their draw functions (`drawCopepod`, the krill drawer) | render.js — run RA asserts every roster id has a look, not that every look has a roster; check for the inverse lint before assuming it is silent |
| `src/cast/copepod.png`, `src/cast/krill.png` | re-run `node scripts/bake-cast.mjs` after, so the bake does not resurrect them |
| chapter strings: `'The Twilight'`, `'Twilight'`, the tagline, `'Copepod'`, `'Krill'` | fr.js — run XX goes red on a key with no source, so these cannot be left behind |
| `scripts/scenes/twilight-*.js` (7 files) | the three weapon scenes are **renamed** `deep-sunspear.js`, `deep-foxfire.js`, `deep-foxfire-dark.js`, `deep-sunlance.js` and re-pointed with `--chapter deep`; `twilight-cast`, `twilight-dark`, `twilight-drawdown` are deleted (the Deep has `deep-maw.js` / `deep-hunt.js` for its own dark) |
| `scripts/charge-probe.mjs` default chapter | becomes `'deep'`; the tables in its header were measured on the shafts and say so — leave the history, change the default |
| test fixtures keyed `'twilight'` (28 code references) | move to `deep`: `twilightRun` → a Deep fixture; the `ringRun('twilight', …)` calls; the signature-type table `['twilight', 'shafts']` row; the WIP-gate assertions at 4716–4813 name the gated rung, which is now `deep` (run DP.i already asserts that) |

**The Gulper Eel does not move** — it was The Deep's all along, on loan.

### 5.2 Five weapons, with everything that is theirs alone

Owner ruling: "delete unused weapon code", scoped to **all five** cards no chapter will offer:

| Weapon | Why it is dead | Native to |
|---|---|---|
| `finHit` | leaves The Deep's pool with this change | The Deep |
| `pistolShrimp` | The Reef became a race with `weapons: []` (2026-08-24) | The Reef |
| `fireCoral` | same | The Reef |
| `squidInk` | same | The Reef |
| `oxygenTank` | same | The Reef |

For each: the `WEAPONS` entry, its `WEAPON_MODS` block, its `WEAPON_STAT_MODS` fold, its
`WEAPON_RATE_MODS` row, its dispatcher line, its `step*`/`fire*` functions in sim.js, any
`STAT_KEYS` row that exists **only** for it (`ridges` is Fire Coral's, `blind` Squid Ink's, `boil`
Oxygen Tank's; `skips` is the Skipping Shell's and STAYS — check each key's comment names one weapon), its render case and any drawer that exists only for it, its
`SFX_FOR_EVENT` row (`snap`, `ink`, `rupture`, and whatever `finHit` emits), its French, its
`scripts/scenes/*` files, and its test scenarios (run PY, RN, RS.*, DP's Fin Hit arms; ~48
references).

**⚠ DELETE BY WEAPON, NEVER BY PREFIX. Three live systems share a name with a dead one:**

- **`INK_*` at config.js:11401–11409 and `stepInkjet` (sim.js:3559) are The Wreck's SQUID ENEMY**,
  the ink splats the owner tuned three times last week. Squid Ink the weapon owns `INK_BLIND_REACH`
  and `INK_JET_SPREAD` (12303/12307) and `fireInk`. Read each constant's comment for its owner.
- **`SNAP_TRAP_*` (13432–13434) are The Undergrowth's snap traps.** Pistol Shrimp owns
  `SNAP_CAVITY` and `SNAP_BACKBLAST_*` and `fireSnap`. `farmRowSnap` in render.js is a farm-row
  layout helper.
- **`TANK_KB_REFRACTORY` is the tank ARCHETYPE.** Oxygen Tank owns `TANK_SHOVE_KB` and `fireTank`.
- **`CORAL_CRUSH` and `bakeCoral`/`updateCoralGrit`** are the Reef's coral *level* (spur and
  groove), which is live. Fire Coral owns `FIRE_CORAL_VIS` and `FIRE_CORAL_LEAD`.

The proof that a deletion is complete is run MB.a (every mod resolves to a fold, a rate row or a
fire site) and run EV (every event has a consumer) going green with the ids gone, plus
`grep -n '<id>' src/*.js` returning only prose. The proof that it did not over-reach is
`npm test` green on The Wreck's ink and The Undergrowth's traps, which both have scenarios.

**The Scent button survives without Fin Hit.** `SCENT_DMG_MUL` is applied in `applyDamage`
(sim.js:7436) to every hit on a marked body, not in `fireFinHit`, so the mark pays Sunspear,
Foxfire and Sunlance exactly as it paid the bite.

## 6. What the light weapons meet that they were not tuned against

Three things change under the three cards. **Each is a measurement, not a decision.** The
`weapons` edit lands first; these run after, in the same task, and their numbers go in the
config comments beside the ones they replace.

1. **The dark no longer slows.** `CHAPTERS.deep.resource.dark.speedFloor` is 1 against the
   Twilight's 0.6, deliberately (the Deep's block: "NO SPEED PENALTY, unlike The Twilight"). Foxfire's
   tune priced its 160-eff ceiling as "what a player buys by running on empty — which costs them the
   Pulse and 40% of their move speed." Under the Deep an empty bar costs sight (`radiusEmpty 0.06`)
   and the maws' bite. Re-run `weapon-census.mjs --chapter deep` for Foxfire at L5 at a pinned
   empty bar and a pinned full one, one invocation, and record whether the ceiling still needs the
   base held at the bottom of the rare band.
2. **Sunlance reads the raw bar for reach.** Deep drains 2.0 / refills 16 against 2.2 / 18, so the
   bar's duty cycle is close; `scripts/charge-probe.mjs --chapter deep` gives the mean bar under a
   maw-working player, which is the number the lance actually plays at. Record it.
3. **Foxfire punches the dark scrim.** Its whole visibility argument (run SH.b's render grep) was
   made on the Twilight's `darkTint 0x00060b`; the Deep's is `0x000305` and its rim is half the
   screen. Shoot `deep-foxfire-dark.js` on the Deep's floor at the phone viewport and judge
   whether `FOXFIRE_GLOW` still reads. This is an owner picture, not a number.

Also: **the Pulse leaves with the Twilight.** Sunspear's comment calls the bar "the Pulse's AMMO";
in the Deep the bar is Scent's. The comment is stale the moment the pool moves and is fixed in the
same edit.

### Measured (Task 8, fix round 1)

Four measurements, run against the shipped tree (HEAD at the time, `f8e9c3c` plus Tasks 1-7), each
recorded a second time in `src/config.js` as one `balance_decision` line beside the number it bears
on (the full tables live here and in the commit bodies of `9036eb3` and the fix-round commit, per
this repo's convention that reasoning goes in the commit, not the comment). None of the fences
below is a raw paste: the roster fences drop the script's own first `src=` line; the census fence
keeps every column but drops the preamble (`chapter deep ..., one weapon equipped, all offers
refused` and the `--- level 5 ---` header); the charge-probe fence is TRIMMED to the columns a
decision reads AND REORDERED (`%DARK` moved ahead of `%inRefill`) against the script's own column
order. The §6.2 block also merges two separate runs — the full output lives in the commit bodies.

**§6.4/R2.2 — the pool, one invocation** (relabelled from §6.1 — §6.1 itself, a Foxfire census with
the bar PINNED at empty and at full, was never run: `scripts/weapon-census.mjs` has no flag to pin
`run.charge`, and none was added — see §7's owed list).
`node scripts/weapon-census.mjs --chapter deep --level 5 --weapons glint,sunspear,foxfire,sunlance --secs 300`:

```
  weapon           raw dps  eff dps  waste  kills/min  hits/s  dmg/hit  dud   charge
  Glint               127      104    18%      117.2     5.2     24.5  31%       14
  Sunspear            150       75    50%       97.1     1.9     79.6  15%       30
  Foxfire              88       81     8%       98.8     8.9     10.0   6%       30
  Sunlance             78       63    20%       85.6     3.6     21.5   6%       30
```

Sunspear (doubled) is neither the pool's top card nor >1.5x the next one — R2.2's retune clause does
not fire, the doubling stands. `--level 1 --weapons glint,sunspear` (the run's opening):

```
  weapon           raw dps  eff dps  waste  kills/min  hits/s  dmg/hit  dud   charge
  Glint                21       18    15%       34.7     1.7     12.3   8%       17
  Sunspear             77       57    26%       79.9     2.2     34.4   8%       30
```

Sunspear still opens well ahead of Glint (57 vs 18 eff) — the same shape as when it held the starter
slot, now reached by a level-up instead of the first cast.

**§6.2 — the bar under a maw-working player.**
`node scripts/charge-probe.mjs --chapter deep`, `full` spend row, before/after Glint's per-cast Light
cost existed (the table already in `CHAPTERS.deep.resource`'s comment predates the starter):

```
policy   mean  %at0  %DARK  %inRefill  bites    (pre-Glint, for reference)
ignore   10.0    48     99        7.8    0.3
feed     78.1     1      5       64.8    0.7
greedy   12.0    50     99       49.5   46.7

policy   mean  %at0  %DARK  %inRefill  bites    (measured now, Glint equipped)
ignore    5.4    65     99        7.7    0.0
feed     27.2     1     91       65.0    0.7
greedy   11.4    41     99       58.1   54.3
```

Glint's ~1 Light/cast on a sub-second timer moves the disciplined (`feed`) row from a mostly-lit bar
(78/100, 5% dark) to mostly-dark (27/100, 91% dark) without changing how much of the run that player
actually spends feeding (65.0% vs 64.8%) — the starter is now an ongoing drain on top of the
chapter's own. `ignore`/`greedy` were already near the floor and barely move. Checked against the
brief's refill-raise trigger with a one-off script mirroring the `feed`+`full` rig: a seeking player
sits under 25% of the bar for 41.9-53.8% of a 300s run across 3 seeds — under the 70% threshold, so
`resource.refill` stays at 16 (the maws' bite clock, `MAW_GAPE_T`/`MAW_SHUT_T`, is untouched either
way, as instructed).

**§6.3 — Foxfire on the Deep's scrim.**
`node scripts/fx-probe.mjs --scene scripts/scenes/deep-foxfire-dark.js --chapter deep --out /tmp/ffd --frames 6 --wait 20000`.
Last frame: `/tmp/ffd-05.png` (charge=0, full FOXFIRE_GLOOM, cloud maxR 118, one bred body lit inside
a cast 233px from the player). This is an owner picture per the brief; `FOXFIRE_GLOW` is untouched.

**R2.6 — the lanternfish's glow at spawn distance.**
New scene `scripts/scenes/deep-lantern-range.js` (modelled on `deep-hunt.js`), four lanternfish
pinned at 90/180/300/410px on a 20/100 bar, `run.shafts.length = 0`. Shot at both viewports:
- phone (390x844): `/tmp/lr-24b-00.png` — lamp reaches ~125px at this charge, so 180/300/410px sit
  outside it by a growing margin.
- desktop (1280x800): `/tmp/lr-desktop-00.png` — lamp reaches ~189px; the gap the glow has to
  bridge at 300/410px is smaller here than on the phone, so the phone shot is the tighter case.

`glow.frac` at its shipped value (2.4) already reads the 300px fish as a distinct glow well clear of
the pure-black scrim past the lamp (sampled peak pixel brightness ~426/765 against a ~1/765
background); the 410px fish reads the same on both viewports. **`ROSTER_LOOKS.lanternfish.glow.frac`
is unchanged** — the first value in the brief's escalation (2.4 -> 3.5 -> 5) already passes, so the
scene stopped there. (First cut of this scene shot at full brightness by mistake: `run.charge` alone
does not gate the lamp — `updateDark` reads `run.sightCharge ?? run.charge`, and `createRun` seeds
`sightCharge` at `chargeMax`; only `stepCharge` ever brings it back down, and this scene never steps
the sim after its warm-up. Fixed by setting both fields; noted in the scene's own header.)

**R2.1/§7b — the split tax.**
New script `scripts/deep-roster-probe.mjs`, 6 seeded 300s Deep runs, immortal + kiting, level-ups
ACCEPTED (first offer always — an unleveled starter never kills a tank at all under a refuse-every-
offer rig: 0/6 seeds, which cannot answer the question). Kills/xp are read directly off
`run.enemies` (id present before a step and gone after, its pre-step `.xp`), not off the `kill`
event, which carries only `{x,y,elite,etype}` — an `ARCHETYPE_TYPE`, not a `rosterId`, and no xp at
all (see the script's header for why an existence diff is exact here and needed no `sim.js` change).

**Fix round 1: "immortal" was set once and lost.** BRITTLE (`sim.js:448-452`) rewrites `maxHP` to 1
the instant it is taken by the accept-first-offer rig, and a devour deals `0.5 x maxHP` — with no
per-step reset, ordinary combat after either event ends the run early (the pre-fix baseline arm's
seed 11 died to a devour at 228s; seed 22 died 2.3s after taking BRITTLE, at 259s). Fixed by
reasserting `run.player.hp = run.player.maxHP` every step, mirroring `scripts/charge-probe.mjs:367`
(which has carried this exact line since its own rig started accepting offers). This is not a full
guarantee: BRITTLE at maxHP 1 is still lethal to the very next hit that lands *before* the next
reset runs (seed 22 still dies at 259s post-fix, ~2.3s after taking BRITTLE — a residual, honestly
reported as a truncated `secs`, not eliminated), but it removed the slow, unbounded chip-damage
leak that had truncated seed 11 (228s -> a full 300s, dead -> victory) and skewed the gulper table
below.

Raw output, `node scripts/deep-roster-probe.mjs` (`taken` kept in full, per the brief's own ask —
it is the source for the "top damage source" finding below):

```
seed 11: secs 300 level 3 kills {"lanternfish":24,"barreleye":10,"fangtooth":11} xp {"lanternfish":24,"barreleye":10,"fangtooth":11} xpShare% {"lanternfish":53.3,"barreleye":22.2,"fangtooth":24.4} taken {"lanternfish":293,"barreleye":225,"fangtooth":112,"siphonophore":444} splitChildren {}
seed 22: secs 300 level 17 kills {"lanternfish":148,"barreleye":110,"fangtooth":294,"siphonophore":11} xp {"lanternfish":148,"barreleye":113,"fangtooth":297,"siphonophore":31} xpShare% {"lanternfish":25.1,"barreleye":19.2,"fangtooth":50.4,"siphonophore":5.2} taken {"lanternfish":674,"barreleye":484,"fangtooth":133,"siphonophore":2838} splitChildren {"siphonophore":22}
seed 33: secs 300 level 12 kills {"barreleye":125,"lanternfish":173,"fangtooth":281} xp {"barreleye":128,"lanternfish":176,"fangtooth":287} xpShare% {"barreleye":21.7,"lanternfish":29.8,"fangtooth":48.6} taken {"barreleye":482,"lanternfish":460,"fangtooth":134,"siphonophore":2202} splitChildren {}
seed 44: secs 300 level 5 kills {"barreleye":31,"lanternfish":31,"fangtooth":27} xp {"barreleye":31,"lanternfish":31,"fangtooth":27} xpShare% {"barreleye":34.8,"lanternfish":34.8,"fangtooth":30.3} taken {"barreleye":540,"lanternfish":688,"fangtooth":70,"siphonophore":1161} splitChildren {}
seed 55: secs 300 level 18 kills {"barreleye":144,"lanternfish":189,"fangtooth":374,"siphonophore":7} xp {"barreleye":144,"lanternfish":195,"fangtooth":383,"siphonophore":17} xpShare% {"barreleye":19.5,"lanternfish":26.4,"fangtooth":51.9,"siphonophore":2.2} taken {"lanternfish":482,"barreleye":471,"fangtooth":215,"siphonophore":2120} splitChildren {"siphonophore":10}
seed 66: secs 300 level 4 kills {"lanternfish":20,"barreleye":15,"fangtooth":28} xp {"lanternfish":20,"barreleye":15,"fangtooth":28} xpShare% {"lanternfish":31.7,"barreleye":23.8,"fangtooth":44.4} taken {"barreleye":455,"lanternfish":573,"fangtooth":559,"siphonophore":1601} splitChildren {}
```

Derived summary, kills by roster id and level reached, in SEED ORDER (11, 22, 33, 44, 55, 66) — printed rather than
only the derived share, because the zeros need to be legible as **never killed**, not as "paid
little":

```
                lanternfish  barreleye  fangtooth  siphonophore  level  xpShare% (siphonophore)
seed 11                  24         10         11             0      3      0.0
seed 22                 148        110        294            11     17      5.2
seed 33                 173        125        281             0     12      0.0
seed 44                  31         31         27             0      5      0.0
seed 55                 189        144        374             7     18      2.2
seed 66                  20         15         28             0      4      0.0
```

Siphonophore's xp share per seed, in seed order: **[0, 5.2, 0, 0, 2.2, 0]%** — low 0, high 5.2. It
is **never killed at all in 4 of 6 seeds** (11, 33, 44, 66) — confirmed by counting live
siphonophores at t=300 in those four runs: **32, 178, 34, 26** respectively, i.e. dozens to hundreds
spawned and surviving, not merely "expensive to reach". At the same time it is the **top damage
source taken in 6/6 seeds** (444-2838 damage, against every other roster entry's low hundreds) while
dying 0-11 times — an **owner item**, not something this task's retune clause has a lever for: the
tank is currently *near-unkillable under the starter*, which is a different, larger problem than the
split tax being over- or under-priced.

The same probe against the pre-merge tree (`git archive cdd29a7 src` into `/tmp/base`, `--srcDir`,
same fix applied there too). Raw output, `node scripts/deep-roster-probe.mjs --srcDir /tmp/base/src`:

```
seed 11: secs 300 level 31 kills {"hagfish":425,"viperfish":647,"gulper":242} xp {"hagfish":437,"viperfish":665,"gulper":968} xpShare% {"hagfish":21.1,"viperfish":32.1,"gulper":46.8} taken {"hagfish":2884,"viperfish":281,"devour":2000000074} splitChildren {}
seed 22: secs 259 level 24 kills {"hagfish":377,"viperfish":353,"gulper":123} xp {"hagfish":386,"viperfish":368,"gulper":492} xpShare% {"hagfish":31,"viperfish":29.5,"gulper":39.5} taken {"hagfish":2023,"viperfish":122} splitChildren {}
seed 33: secs 300 level 30 kills {"hagfish":435,"viperfish":569,"gulper":296} xp {"hagfish":450,"viperfish":575,"gulper":1208} xpShare% {"hagfish":20.2,"viperfish":25.8,"gulper":54.1} taken {"hagfish":2359,"viperfish":380} splitChildren {}
seed 44: secs 300 level 32 kills {"hagfish":431,"viperfish":623,"gulper":269} xp {"hagfish":440,"viperfish":644,"gulper":1100} xpShare% {"hagfish":20.1,"viperfish":29.5,"gulper":50.4} taken {"hagfish":1958,"viperfish":104,"bomb":26} splitChildren {}
seed 55: secs 300 level 30 kills {"hagfish":409,"viperfish":619,"gulper":250} xp {"hagfish":421,"viperfish":634,"gulper":1000} xpShare% {"hagfish":20.5,"viperfish":30.9,"gulper":48.7} taken {"hagfish":2777,"viperfish":427} splitChildren {}
seed 66: secs 300 level 28 kills {"hagfish":409,"viperfish":609,"gulper":184} xp {"hagfish":424,"viperfish":624,"gulper":736} xpShare% {"hagfish":23.8,"viperfish":35,"gulper":41.3} taken {"hagfish":2130,"viperfish":506,"bomb":19} splitChildren {}
```

Derived summary, gulper kills and xp share, same seed order:

```
                hagfish  viperfish  gulper  level  xpShare% (gulper)
seed 11             425        647     242     31     46.8
seed 22             377        353     123     24     39.5   (truncated at 259s — see below)
seed 33             435        569     296     30     54.1
seed 44             431        623     269     32     50.4
seed 55             409        619     250     30     48.7
seed 66             409        609     184     28     41.3
```

Gulper's xp share per seed, seed order: **[46.8, 39.5, 54.1, 50.4, 48.7, 41.3]%** — low 39.5, high
54.1. (Seed 22 here is the one BRITTLE-truncated run described above; its share is close to the
others' regardless, so it does not change the low/high.) This range replaces the pre-fix reading of
**[24.8, ...54.1]**, whose low (24.8) came from baseline seed 11's own truncation (a devour ending
that run at 228s before the gulper had compounded — exactly the "recorded low came from the
truncated seed" the review named).

The retune clause ("lower `xpMul` if the new share exceeds the old") does not fire — the new tank
sits far *under* the old one at every seed (high of 5.2% against a low of 39.5%), not over. `xpMul`
stays at 0.7. Flagged rather than chased further: the gap is large enough that it plausibly also
reflects Glint being weaker against a tank than the old `finHit` was (a confound the brief's own
baseline method — comparing each chapter's shipped starter — cannot separate from the split tax
itself), so a future pass may want to ask whether the tank slot is now *near-unkillable*, which this
clause has no lever for.

**§6.5 — OVERTURNED IN PLAY, 2026-09-09 (same day).** The tables above are kept as the record of what
shipped; the owner played it and the reading was the opposite of the trigger's. "The base fire rate of
the starter weapon is too high, i lose light too fast", and — the same complaint from the other end —
"there are no anglerfish anymore? how am i supposed to get light?" The maws were untouched and still
streaming (five in the tile `deep-hunt` shoots); what changed is that a bar burning 3.8-4.9/s does not
survive the walk to one. The `charge` column above is that sentence as a number: Glint is the only
card in the pool that plays at 14-17 of 100 while the other three sit at 30.
  Three changes, and the trigger clause that said "no retune" is what a 41.9-53.8% under-25% share
misses — it measured how *often* the bar was low, never that the player could not act on it:

```
  weapon        raw  eff  waste  kills/min  hits/s  dmg/hit  dud   charge
  Glint L1  22 (21)  16 (18)  26%  32.9  1.1  20.4   3% (8%)   21 (17)
  Glint L5 128 (127) 92 (104) 28% 112.8  3.3  38.8  13% (31%)  20 (14)

  charge-probe, feed+full row:  mean 27.2 -> 38.1,  %DARK 91 -> 71,  %inRefill unchanged at 65.0
```

The cadence is now nearly FLAT across the ladder (0.90 -> 0.82) with damage carrying the growth, so a
level-up no longer buys drain; `GLINT_LIGHT_COST` is scaled by `run.chargeDrainMul`, so Slow Burn
reaches the ammo (owner: "does it cost less if the player purchased the 'lose less resource'?"); and
the cadence HOLDS while `nearestEnemy` finds nothing, which is where a third of the L5 casts were
going. The fourth complaint — "the glint itself is not visible enough" — was a missing scrim punch,
not a tune: see `GLINT_GLOW` and `scripts/scenes/deep-glint-dark.js`.

## 7. Still owed after this pass

`node scripts/chapter-stage.mjs deep` reads `ideation=owes3` today. §3.1's starter clears the
weapon line (four in the pool: two normal, two rare — no epic rung, which is a note, not a debt;
a shaft-flaring epic drafted earlier this session is void, since the sun shafts no longer exist).
After the merge The Deep owes:

1. **An anomaly of its own.** None is scoped to `deep`.
2. **A mutator of its own.** `springtide` is the book's.
3. **The owner's three gates**: a phone playtest, the French review, the assets check. Both
   chapters were at `YOU` on all three; the merged one is too.
4. **§6.1's own item, still unmeasured**: Foxfire at L5 with the bar PINNED at empty and at full,
   one invocation. `scripts/weapon-census.mjs` has no flag to pin `run.charge`; none was added this
   pass (fix round 1's controller ruling: don't add a probe feature nobody asked for). What Task 8
   *does* now know, from the un-pinned real-play numbers (Measured, above): the Deep's real bar
   already runs darker across every movement policy (91-99% dark, mean gloom 1.27-1.535) than the
   Shelf's own tuned play point (1.174 at 63% dark) — the number this card was priced against,
   with no move-speed cost behind it on this chapter. That makes the owed pinned-bar pair *more*
   informative to eventually run, not less: the untuned side of Foxfire's curve (near the empty-bar
   ceiling, 160 eff) is closer to what a Deep player actually meets than it ever was on the Shelf.

The Twilight's diel-migration hazard debt **dies with the chapter**: it existed because the
Twilight had no hazard, and The Deep has one.

## 7b. The roster is redesigned around the light (owner ruling, same session)

Owner: *"Redesign enemies relevant to the abysses."* The audit behind it: hagfish, viperfish and
gulper are real abyssal animals, but nothing they DO is about the abyss — a slime patch, a burst
dash and a hold could be any chapter's crowd. In this game the abyss means light, so the roster
is re-cut so that each creature's behaviour is about the player's lamp. Phase 1 (feel) rulings,
under `designing-an-enemy`; phases 2 (look) and 3 (numbers) each end at a further ruling.

| Slot | Creature | What you do differently | Cost |
|---|---|---|---|
| normal | **Lanternfish** shoal | It carries its own light, so it is the one enemy visible OUTSIDE your lamp. You read the dark by what glows in it, and a glow coming your way is the warning. | sim: none (flagless `normal`). render: a per-body punch in the dark scrim, the `LURE_GLOW` idiom already in `updateDark`. |
| fast | **Fangtooth** | A burst dash at you: the viperfish's behaviour under a more abyssal skin. | `dashBurst`, free. |
| tank | **Siphonophore** | A colony as long as a bus that comes apart into zooids when killed. | `split`, free. The zooids inherit `rosterId` (spawnSplitChildren), so they wear the parent's bake at `SPLIT_RADIUS_FRAC`; a second pose for the zooid is a look decision for phase 2. |

**A fourth entry, ruled during the look round: the Barreleye, a second `normal`.** Owner: "Add a
fourth 'normal' mob." Its feel is the beacon rule with a bigger number: eyes made for the dark, it
notices your lamp from further than anything else and is always the first to arrive. Flagless;
one per-creature multiplier on the beacon's notice range, so it costs nothing the beacon does not
already cost. It shares the `normal` archetype's spawn share with the lanternfish (`weight` splits
it — a phase 3 number).

**Phase 2 (look) rulings, same session, off `scripts/scenes/deep-cast.js`:**

| Creature | Picked | Note |
|---|---|---|
| Lanternfish | flank rows of photophores | over a single headlamp and a scattered constellation |
| Fangtooth | the open-jaws cut, redrawn so **"jaws are most of the fish"** | two jaws hinged a third back, thrown wide, dark throat between, small body behind |
| Siphonophore | **"both a and c"**: A's pink translucency, tentacles and glowing float on C's paired-bell stem | split children wear the same bake at `SPLIT_RADIUS_FRAC` |
| Barreleye | the realistic cut, hover pose, **dome reduced to a hint** | three rulings in a row: "ugly, make them more realistic", "more defined", "the glass dome looks plain weird". From above a real barreleye is a dark fish with two green lenses on its head; the transparent membrane is nearly invisible, and drawing it as a bright disc read as a helmet. Kept as a faint gradient and one glint. |

The lanternfish's own light is a `glow` field on its `ROSTER_LOOKS` entry, read by `updateDark`
with the lures' partial-punch idiom; the dark frame of the cast scene is what keeps it honest.

**Hagfish, viperfish and gulper leave the game** with their looks and cast thumbs, on the same
terms as §5.1's copepod and krill. The Gulper Eel therefore does move after all — out.

**Chapter-wide rule, ruled with the roster: YOUR LAMP IS A BEACON.** Everything in the abyss is
drawn to light, so the crowd notices you from further away the fuller your bar is, and an empty
bar hides you. The bar stops being purely a resource and becomes a risk dial: refill at a maw and
you leave it lit and hunted. **New sim code, one read at the seek site**, scoped by a chapter field
so every other chapter's seeking is byte-identical. The number it scales, and what "notice" means
today (enemies currently seek the player unconditionally; the only existing notion of range is a
lure's `aggro`), are phase 3 questions and are measured before they are chosen.

## 8. Risks

- **Foxfire may be over-tuned in a dark that does not slow.** Mitigation is §6.1, measured before
  the ship, and the owner's standing rule that a chapter goes to him as a grey box before tuning
  is paid for.
- **A prefix-greedy deletion takes the Wreck's ink or the Undergrowth's traps with it.** Both are
  live, both have scenarios; §5.2 names every collision found. `npm test` is the gate.
- **The Deep's finale reads thinner with three cards than with three plus the bite.** It read that
  way with three before (two of them borrowed). The fourth weapon is §7's first line.

## 9. Owner rulings, verbatim

- "let's merge those two levels that would be 2 'darkness themed' levels. I want the weapons of the
  twilight (light related) but the darkness of the abyss"
- Survivor: **The Deep** (id, name, roster, Scent, maws, dark all kept; the Twilight deleted).
- Fin Hit: **drop it, light weapons only.**
- "Also delete unused weapon code" — scoped to **all five**: Fin Hit and the four Reef leftovers.

---

# Revision 2 — after adversarial review (2026-09-09, Opus reviewer)

Rev 1 above is kept as written. Everything below CORRECTS it; where the two disagree, this wins.

## R2.1 The beacon rule is DROPPED (owner ruling)

Rev 1's §7b lamp-as-beacon and §3.1's Light-spending starter were mutually destructive: with the
starter draining the bar, an empty bar is the steady state while firing, and a rule that makes an
empty bar hide you turns firing into a stealth button. The reviewer also showed the mechanism was
not "one read at the seek site": nothing in the game wanders, `stepStragglers` (sim.js:2436) would
teleport a non-seeking body back onto the spawn ring forever, `_tgtX/_tgtY` must be published or
the crowd crabs sideways, and a notice range keyed to `lightRadius` is smaller than the spawn
distance at every bar level on every device (phone: 422 vs 525; desktop: 640 vs 814).

Owner, offered "light brings more / drop it / keep it": **"Drop the beacon rule."** Enemies seek
as in every chapter. **The Barreleye stays as a flagless second `normal`** — the roster's
baseline body, on the argument the Trawl spec made for its mackerel: with a flag on every entry
none of them reads as special. Its look is the ruling that stands.

## R2.2 Sunspear at double damage: the ruling stands, and it is MEASURED

The reviewer is right that §3.2 doubles the knob Sunspear's own block measured as wrong (-23%
dmg read BETTER, 135→140 eff, because weaker columns leave bodies alive for more columns), that
the block's `r` cut 82→66 was the compensating knob and is kept, and that Sunspear already reads
123 eff at L5 against a rare band of 109–122. Owner: **"Keep double damage, measure it, retune if
it dominates."** So §6 gains a fourth item: `weapon-census.mjs --chapter deep --level 5` with the
new starter, Sunspear, Foxfire and Sunlance in ONE invocation; if Sunspear is the pool's runaway
best the knob comes back down with the table shown, not silently.

## R2.3 The shelf→twilight save hop must be DELETED with the id, not extended

`state.js:317-320` moves `chapters.shelf` into `chapters.twilight` when the latter is absent —
written for the 2026-08-17 move, when the light chapter left slot 2. The reviewer read it as
stranding returning players' progress. **Owner: "The deep and twilight levels have never been
published so there is no existing record or score"** — and the repo agrees: The Shelf went
public at v7.196 (fa481f7), *after* the move at v7.133, so the hop never had public progress to
carry and there is nothing to migrate into `deep`. Rev 1's "nothing migrates" stands.

**But the hop is live code and its guard is the deleted key.** Today `ensureChapterMeta` creates
`chapters.twilight` on every load (it walks `ALL_CHAPTER_IDS`), so the hop fires at most once and
in practice never. Remove `twilight` from the chapter list and that key is no longer created; a
NEW player's first load skips the hop (no `chapters` yet), and their **second load fires it** —
moving their real, live Shelf ladder into a dead `twilight` slot and resetting the Shelf. So
§5.1 gains one row: **delete the hop (`state.js:305-320`, comment included) and its test
(`sim-test.js:32897-32920`)**. No replacement hop; `chapters.twilight` keys already present in
saves are left alone (additive-only) and read by nothing.

## R2.4 Deletion sites §5 missed — all added to the bill

- **`CHAPTERS.deep.eliteFlags: ['webZone']` and `render.webLook: 'slime'`** exist only for the
  hagfish. `webZone` stays a legal flag, so run VO stays green over an elite that lays slime no
  animal produces. The honest cut is **no elite behaviour flag** — elites still carry affixes. If
  `eliteFlags: []` is rejected anywhere (spawn code, run VO), the fallback is `['unshakeable']`
  on the siphonophore. `webLook` and the Deep's slime render path go with it.
- **Squid Ink owns a published enemy contract field, `blindT`** (producer sim.js:9720; consumers
  sim.js:2146/2619/2929, render.js:21839/21907/22047; state.js:966/1088). Deleting the weapon by
  §5.2's checklist leaves the whole blind machinery as a dead branch in the hottest loop. It goes
  too, and **§5.2 gains a `state.js` row** for every deleted weapon's fields and events.
- `render.js:11629` `twilight: BIOME_SHELF` and `scripts/obstacle-contrast.mjs:48` `twilight:`.
- `test/sim-test.js:1535` `NEEDS_MOTION = new Set(['finHit'])` and `:1541` `CHAPTER_FOR = { fireCoral: 'reef' }`
  in the IPECAC sweep: both become tables asserting nothing.
- `test/sim-test.js:32799` greps the suite for the literal `CHAPTERS.twilight.resource.dark` —
  self-referential, cannot be "moved"; deleted, and run DK already reads the Deep's block.
- `test/sim-test.js:32774` asserts `murk > dark` (slot 2 gentler than the light chapter's slow).
  After the merge no Book 2 chapter but the Shelf slows in the dark — the Deep's `speedFloor: 1`
  is its own recorded ruling — so the ordering has no second term. Deleted, with this paragraph
  as the reason.
- The count in §5.1 is **61** test references, not 28.
- `scripts/scenes/twilight-cast.js` is still in the tree (deep-cast.js's header says "now gone" —
  it goes with §5.1's seven).

## R2.5 The starter's wiring, which §3.1 under-specified

- **Its own `WEAPON_MODS` block, four mods**, or run MB.a2 does not even look: that lint covers
  `['surf','shelf','reef','wreck']` only. Four is the Book 2 ceiling; mirror Spike Protein's axes
  (pierce, extra dart, cast rate, damage) — never a mod that refunds or discounts the Light cost,
  the same line the Twilight's mods held ("none of them buys the BAR").
- `fireStar` pushes NO `weapon` tag on its bullets and `placeBullet` (render.js:22401) draws
  `T.bullet` unless `b.weapon` names a case. The dart needs its tag, its case and its own texture.
- `fireStar` reads `run.weaponMods.star?.*` by hardcoded id; the copy reads its own.
- The spend is `run.charge = Math.max(0, run.charge - 1)` at the cast site, once per cast.

## R2.6 Roster numbers the reviewer priced (phase 3 inputs, not decisions)

- **`split` on a `tank` is not free.** Children inherit `parent.maxHP × SPLIT_HP_FRAC` off a
  `hpMul 1.9` body and `parent.xp × 0.45` off a tank's xp 4 (a normal's is 1): the tank slot goes
  4 → 7.6 xp. `xpMul` on the siphonophore is the lever, independent of `hpMul`, and it lands in
  the back half (`WAVE_TABLE` gates tank to t ≥ 140s) so the probe runs the full 300s.
- **`cast` is three ids in all 15 chapters** and the roster is four. The title card shows
  lanternfish, fangtooth, siphonophore; the barreleye is off it (the owner's assets check can
  swap one).
- **The glow is verified at ≤230px and enemies spawn at ~525px.** Before the design claim is
  treated as true, a `deep-hunt`-style scene puts lanternfish at 90/180/300/410px on a low bar;
  `glow.frac` is the knob (38px screen radius today against the lure's 230).
- **`glow` is the only `ROSTER_LOOKS` field read outside the bake path** and nothing guards
  that; run RA gains one source-text assert that `updateDark` reads `.glow` off `ROSTER_LOOKS`.
- `sg2` (render.js:2953) is inlined.

## R2.7 Corrections to wording

- `SCENT_DMG_MUL` is applied in **`dealDamage`** (sim.js:7436), not `applyDamage` — the shared
  tail every source routes through, so the claim is stronger, not weaker.
- The stale Sunspear line is config.js:2193 *"the tagline made literal — the light only goes
  down"* (the Twilight's tagline); "the Pulse's AMMO" is in the Twilight block §5.1 deletes.
- The art commit alone (60e701e) aborts `npm run test:fast` at run RA because the config roster
  still names hagfish/viperfish/gulper; the roster lands in the same change as the plan's first
  task. Separately noted, out of scope: `run(fn)` in the suite has no try/catch, so one red
  scenario hides the 55 after it.
