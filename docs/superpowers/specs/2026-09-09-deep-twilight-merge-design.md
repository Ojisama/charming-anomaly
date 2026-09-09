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
weapons: ['sunspear', 'foxfire', 'sunlance'], starter: 'sunspear'
```

Fin Hit, Chitter Shriek and mines leave the pool. Sunspear is the starter because it is the one
light card that does not read the bar, which is the same reason it was the Twilight's.

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

## 7. Still owed after this pass

`node scripts/chapter-stage.mjs deep` reads `ideation=owes3` today and this design clears none
of it, deliberately — the bar is a backlog. After the merge The Deep owes:

1. **A fourth weapon.** The pool is three. Its rungs are normal / rare / rare, so the gap is the
   epic, the same slot Bring It In filled for The Trawl. A design was drafted this session for a
   shaft-flaring epic ("Sunburst") and is void: it read the sun shafts, which no longer exist. The
   maws are the place a Deep epic reads.
2. **An anomaly of its own.** None is scoped to `deep`.
3. **A mutator of its own.** `springtide` is the book's.
4. **The owner's three gates**: a phone playtest, the French review, the assets check. Both
   chapters were at `YOU` on all three; the merged one is too.

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
