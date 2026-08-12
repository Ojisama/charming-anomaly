# Book 2 — "Downward" (design, v2)

Status: **design agreed, not built.** Owner ruling 2026-08-12: build the book, gated by a dev
toggle. Chapter 5 (The Core) remains an open question. Build order in §11.

v2 supersedes v1 after an adversarial review (four reviewers, 2026-08-12) plus two owner
corrections. The single structural change: **the resource bar is the skill's ammo, not a damage
multiplier**, because the game already has a second player verb that v1 did not know about. §12
records what the review found, what that change resolved, and what still stands.

---

## 1. Why a second book at all

Book 1 is seven chapters plus the hidden Blank: 23 weapons, 137 mods, and **two** modifier tables —
`ANOMALIES` (20 run-shaping cards) and `MUTATORS` (19). Its through-line is not "biology" — it is
**scale**. You grow, and the world's answer escalates from immune system → animals → humans →
military → cosmic authority.

The rule this design is built on:

> **A book is a verb and a threat model, not a substrate.**

Book 1's verb is GROW; its threat model is *the crowd is the danger, terrain is scenery*. A second
book with the same verb and threat model is more levels, not a new book — however good its settings
are. That is what disqualified the first sketch ("an anomaly grows in the sea, then the mantle, then
the core"): monotone escalation along a second axis, in a game that already has a water chapter.

**Book 2's verb is literal and mechanical, not thematic: Book 1 gives the player one verb, Book 2
gives them two.** See §5.

Second constraint: 7 chapters × 3 weapons = the 23 that ship today, with 137 mods hanging off them
at ~6 per weapon. A same-shaped Book 2 would double the hardest thing in the game to balance. Book 2
ships **six** new weapons across four chapters and reuses two of the pond's.

## 2. Structure: books

A book is a **parallel campaign** (owner ruling). New protagonist, own chapter-1 onboarding numbers,
own difficulty ladder per chapter. A new player could in principle start on Book 2.

Meta progression: **shared coin purse, Book 2 unlocks its own shop cards** (owner ruling). A Book 1
veteran therefore starts Book 2 carrying Power Gel and Big Mochi — intended, and it makes The Shelf
a harder tuning target than any existing chapter, because it must serve both a 0-card newcomer and
an 8-card veteran. `body` only ever had to do the first, and took five re-tunes to get there.

### 2.1 The BOOKS table

WIP books must be invisible to real players, and **v1's gate did not work.** Keeping WIP ids out of
`CHAPTER_ORDER` is insufficient — verified:

- `resolveChapterId` keys on **`CHAPTERS`**, not `CHAPTER_ORDER` (config.js:4178, and its comment
  says so). `meta.chapter` persists across sessions via `onChapter`, and **nothing ever writes
  `unlocked` back to false.** So: toggle dev on → select a WIP chapter → toggle dev off → the
  carousel hides the card while the Play button still starts it.
- `nextChapter` on an id outside the order returns **`'body'`, not `null`** — `indexOf` is `-1` and
  `-1 + 1` indexes element 0. Verified by running it: `nextChapter('blank') === 'body'`. This is a
  latent bug **today**, harmless only because body is always unlocked.
- `CHAPTER_ORDER` does three jobs at once: progression chain (`nextChapter`), daily pool
  (`dailyChapter`), completion denominator (`slotSummary`, asserted in test/sim-test.js). On ship
  day, adding Book 2 to it makes Book 1's hero card read "7 of 12" and rolls Book 2 dailies for
  players who never unlocked it; not adding it leaves Book 2 with no progression.

**Correct design — separate the three jobs:**

- `BOOKS = { book1: { name, chapters: [...], hidden: [...] }, downward: { …, wip: true } }`.
- `CHAPTER_ORDER` becomes `BOOKS.book1.chapters` — one source of truth, not two.
- `nextChapter`, `dailyChapter` and `slotSummary` each take a **book argument** and read that book's
  chapter list. `dailyChapter` draws only from non-`wip` books.
- `resolveChapterId` gains the same guard the Play path needs: an id whose book is `wip` resolves to
  the book's first chapter unless `meta.dev` is on.

The Blank is **not** a reusable precedent for this — it survives by being hardcoded as a string
literal in seven places across main.js, ui.js and state.js.

### 2.2 The dev gate

Reuse the v7.12 gesture wholesale:

- Add `data-act="dev-tap-wip"` to the title screen's `.coins-badge` (ui.js:636).
- Reuse `DEV_TAPS_TO_OPEN` (7) and `DEV_TAP_WINDOW_MS` (1000) and the existing counter block in the
  `data-act` switch (ui.js:2168).
- Seven taps toggles `meta.dev`; seven more turns it off. Persisted, because the point is testing on
  a phone against the live URL.
- **No new screen.** The toggle is the whole feature.
- While on, the title shows a **DEV** pill — otherwise you cannot tell whether the chapter you are
  looking at is shipped or WIP, which is the real danger of a hidden flag.

`meta.dev` is a plain optional boolean read (never written into) by `loadMeta`, so it needs no
migration.

**Tests to leave behind** (sim-test, no browser needed):
1. No `wip` book's chapter id is reachable from `CHAPTER_ORDER`, `dailyChapter` over a year of date
   keys, or `nextChapter` from any shipped chapter.
2. `nextChapter` returns `null` — not `'body'` — for an id outside its book's list. This also fixes
   the latent `nextChapter('blank')` bug.
3. With `meta.dev` false and `meta.chapter` set to a WIP id, the resolved play chapter is a shipped
   one.

## 3. Premise

**You are sinking, and you are running out of light.**

A spark of the anomaly fell into the sea. Life needs energy, and the sun runs out fast going down —
so you chase the next source, then the next, and each is deeper than the last. **The descent is not
your ambition, it is your bill coming due.**

Book 1's punchline was *you become the universe*. Book 2's is *something got here first, and it is
under your feet.*

## 4. What v1 got wrong, in one line

v1 made the bar scale damage (40% output at empty). Review established that this silently promotes
Book 2's *onboarding* chapter past The Undergrowth's endgame difficulty during the worst 100 seconds
of the run, is invisible in its top half and a cliff in its bottom, and adds a global damage
multiplier that makes every Book 2 `weapon-census.mjs` reading non-comparable with the Book 1
numbers this repo has banked.

**v2: the bar does not touch damage at all.** See §6.

## 5. The two verbs — the core of the book

Book 1's player has exactly one verb: the move vector. Every shipped chapter signature (`traffic`,
`bombardment`, `predators`, `gravity`, `pheromones`) is AVOID-shaped, and `gravity` wells are
documented as deliberately never blocking movement.

**But a second verb already ships, fully built, used by exactly one chapter.** Verified:

| Piece | Where | State |
|---|---|---|
| Edge-triggered press | `input.skill`, input.js:92 | general — "sim wants a press, never a held button" |
| The on-screen button | `.skill-btn`, ui.js:1011, `data-act="skill"` | general, hidden outside lane chapters |
| Cooldown HUD readout | ui.js:1083-1095 | general |
| SFX mapping | `repulse: 'hole'`, main.js:339 | general |
| The effect | `stepRepulse`, sim.js:1097 | **gated by one line**: `if (!CHAPTERS[run.chapter].lane) return` |
| Tuning | `REPULSE_CD 6.0`, `REPULSE_RADIUS 340`, `REPULSE_FORCE 880`, `REPULSE_STUN 0.55` | shipped, tuned |

This is the same story as `lane: true` — a complete mechanic amortized over one-seventh of the game.
**Book 2's identity is that it turns the skill button on and builds a book around having two verbs.**

### 5.1 The Pulse

Book 2's skill is the v5.21 repulse, re-skinned per chapter (light flash, bio-flash, air burst, heat
burst) and **amplified by the bar** (owner ruling):

- It always works on its shipped 6-second cooldown. **An empty bar still leaves you the known-good
  shove**, so there is no spiral where having no charge prevents you from reaching charge.
- Spending charge scales radius and force above the shipped floor. Full bar ≈ two amplified pulses.
- **It deals no damage**, preserving the shipped design. `REPULSE_CD`'s config block documents why —
  read it before ever changing that, rather than assuming the reason was arbitrary.

### 5.1.1 Button placement — BUILT 2026-08-12, ships independently of this book

Owner ruling: the skill button sits on the **left** by default, with a settings toggle to move it
right for left-handed players. The reasoning is that the joystick is **floating** — it appears
wherever you touch — so the dominant thumb takes movement, which is the continuous and precise
input, and the off thumb taps the button.

This is the one part of Book 2's design that needed no part of Book 2: the button already ships in
The Beyond, where it was on the right. Implemented and verified ahead of the rest — `meta.skillSide`
(`'left' | 'right'`), a `.skill-btn--right` modifier, and a settings-sheet row reusing the language
picker's markup verbatim so it needs no CSS of its own. The row's ☉ is the button's own glyph, not a
lookalike.

### 5.2 Why this makes the refill loop work

The review's most damaging finding was that `stepStragglers` recycles stragglers into the player's
forward half-plane whenever they move above `KITE_MIN_SPEED = 100` — **45% of joystick travel**
against a `baseSpeed` of 220. Travelling to a refill point therefore summons the crowd onto the
destination, where `campsResource` has already put a camper.

With a skill button that is not a bug, it is the beat:

> **arrive → the crowd converges → spend the pulse to clear a pocket → drink → leave**

Two shipped systems generate the loop's pressure and its answer for free. It also rescues The
Wrecks: a hull mouth packing with bodies is survivable precisely because you have a clear button
(see §12.4 for why it was not, without one).

## 6. The bar

`run.charge`, 0–100. One HUD element, **renamed per chapter** (Light / Bioluminescence / Oxygen /
Heat). Reuse the fills-and-drains rail shipped in v7.13/v7.14 for the Chaos Pact countdown.

**Its only job is to fuel the Pulse.** It does not scale damage, fire rate or speed. Empty means
your pulse is the plain shipped shove — nothing else.

Consequences of that, all deliberate:

- No `CHARGE_POWER_MIN`, no knee, no overcharge. v1's dead-zone-plus-spike scheme existed to stop a
  damage multiplier feeling like a leash; with no multiplier there is nothing to compensate for.
- **Ammo is legible at every value.** A damage multiplier is imperceptible in its top half — one
  weapon level-up is +33% dps permanently, against which a 15% overcharge for 4s is ~1.4% of a run's
  damage and simply not noticeable.
- Refilling is **rearming**, not maintenance. You go because the pulse is good, not because a
  penalty is coming.
- **No weapon spends the bar.** One sink, player-controlled. This deletes the whole collision where
  Machine Gun (`SOY_MILK_FIRE_MUL = 5`), Overload (×2) and Bazooka (1.5× net) multiply an
  auto-fired spend the player cannot opt out of.

### 6.1 Starting numbers (to be tuned in the slice)

- `CHARGE_MAX = 100`; a full-strength pulse spends ~50, so a full bar banks two.
- **Passive drain ~0.5/s** — light on purpose. The pulse is the main sink, so your refill cadence
  scales with how much you use your verb, which is build-expressive. A player who never pulses still
  visits a refill point once or twice a run, which keeps the fiction honest.
- Refill ~15/s at a refill point.
- Pulse amplification: radius 340 → ~520, force 880 → ~1400 at full spend.

All in config.js as named exports, per the repo's balance rule.

### 6.2 The rule every chapter must satisfy

> **A refill point is a place you can fight from, never a place you go to stop.**

Every chapter in §7 is checked against this explicitly — v1 claimed this and then failed to check
two of its four chapters.

## 7. Chapters

| # | Chapter | Resource | Refill | The spatial deal |
|---|---|---|---|---|
| 1 | **The Shelf** | Light | Drifting sun shafts | Open ground, and it moves — you follow it |
| 2 | **The Twilight** | Bioluminescence | Kill glowers | Which flank you kite toward |
| 3 | **The Wrecks** | Oxygen | Air pockets in sunken hulls | You trade open ground for a corner |
| 4 | **The Crust** | Heat | Magma flows | It will not wait for you |
| 5 | **The Core** | — | — | **OPEN — see §10** |
| — | **The Kernel** | hidden | — | The thing that got here first |

### 7.1 The Shelf — onboarding

Sun shafts drift across the seafloor with the surface swell. Signature `type: 'shafts'`.
`maxAliveMul` ~0.5, in line with `body`.

**Hard phone constraints, both verified:**
- `SHAFT_DRIFT_SPEED` must sit **between 33 and 100 px/s**. Below 33 the shipped joystick cannot
  track it — input.js does a hard deadzone *cut*, not a rescale (`DEADZONE 0.15` × `RADIUS 50`
  against `baseSpeed 220`), so the expressible speed set is `{0} ∪ [33, 220]`. At or above 100 it
  runs `stepStragglers` continuously.
- Shaft placement must be scoped to the **horizontal half-view (~195px)**, not `viewRadius` (~465).
  state.js:1504-1507 already documents this trap: on a portrait phone a thing 220px to the side is
  well inside `viewRadius` and completely off screen. Either that, or add an edge indicator.

**The chapter's one new enemy is the whole lesson: the Basker**, which seeks the nearest shaft
instead of the player (`campsResource`, §8). You clear your own refill point — which is the first
thing the Pulse is for.

Weapons: `flagella` (starter, reused), `bloom` (reused), **Photophore** (new).

*Refill-is-a-fight check:* Photophore charges while you are in the light; the Basker is already
sitting there; the crowd arrives behind you via `stepStragglers`.

### 7.2 The Twilight

You refill by killing **glowers** — specific enemies that drop a light mote.

v1 called this "target choice"; that is **not expressible** — `nearestEnemy` (sim.js:4125) measures
from the player and is the documented choke point for every aim site, no weapon accepts a
player-supplied target, and ~10 weapons have no target concept at all. So:

- Glowers **cluster on one flank** rather than being scattered. The decision is which way you kite —
  a movement choice, which is a verb the player has.
- Chapter-2 weapons get a glower-priority aim override, using the precedent Tail Lash already sets
  by overriding `nearestEnemy` for `crushable`.

Weapons: **Siphon**, **Whale Fall**.

*Refill-is-a-fight check:* the refill **is** the fight.

### 7.3 The Wrecks

**You breathe out of sunken ships.** An upturned hull traps a pocket of air. Refilling means swimming
into a confined space while the crowd follows.

This also answers "the deep generates nothing": a wreck field is a prop set — freighters, containers,
a submarine, a downed plane, a pipeline. The city's building vocabulary, sunk. `upright` props exist.

*Refill-is-a-fight check:* this chapter is **only viable because of the Pulse.** There is no navmesh
and no avoidance — `stepObstacles` (sim.js:2528) pushes the player and every enemy out of overlap,
so enemies seek straight at you and get shoved, and a hull mouth converts the crowd's spread into a
solid plug of contact damage against a player pinned by geometry. The pulse is what opens the mouth.
Build this chapter **after** the Pulse is proven, never before.

`campsResource` bites hardest here: an eel nests in the hull.

Weapons: **Bubble Net**. (v1's Blowout is gone — it *is* the Pulse.)

### 7.4 The Crust

Energy is everywhere, but **the refill points move** — magma flows that will not wait. The chapter
where standing still stops working.

Weapons: **Wake**, **Slag Shell**.

*Refill-is-a-fight check:* the refill is a chase, so you are already moving.

### 7.5 The Kernel (hidden)

Book 2's counterpart to The Blank. The incumbent in the core: much older than you, and here first.

## 8. Weapons

Six new, plus two reused. Selection rule: **claim an unclaimed shape** — 23 weapons in, fan, ring,
beam, cone, mine, boomerang, lob, orbit and vortex are all taken.

| Weapon | Chapter | Shape it claims |
|---|---|---|
| **Photophore** | Shelf | **Charge-up.** Charges in the light, discharges when you leave — the refill window becomes a wind-up rather than downtime. (`BREATH_CHARGE_T = 0.5` is atomicBreath's wind-up, so the shape is shallowly claimed, not unclaimed.) |
| **Siphon** | Twilight | **Tether.** A link between two points, draining one enemy into damage and into your bar. Nothing in the game is a link. |
| **Whale Fall** | Twilight | **Minion.** A corpse that lands, blocks, and feeds a swarm of your own scavengers. There is no minion *weapon* (`minimes` is an anomaly). |
| **Bubble Net** | Wrecks | **A wall.** ⚠ See §12.5 — it must win an authority fight with `stepObstacles`, and it supports ~3 honest mods, not 6. Weakest of the six; cut it before cutting anything else. |
| **Wake** | Crust | **Movement-coupled.** Turbulence behind you, scaling with speed. |
| **Slag Shell** | Crust | **Defensive→offensive.** Armor that crusts on, then shatters outward. |

Reused in chapter 1: `flagella` (starter), `bloom`.

**Mod budget is ~28 real mods plus filler, not the ~42 a 6-per-weapon rate implies.** The 137
shipped mods are 89 `pct` + 23 `flat` + 16 `tier` + 8 `switch` + 1 `prism` — every one is "+X% of a
named numeric stat" or "+N of a countable" — and each weapon's mod count tracks its number of
independently tunable stats almost exactly. Bubble Net has three (radius, duration, cooldown);
Whale Fall four; Photophore three, two of which duplicate the new shop cards. Cut weapons rather
than invent mods.

### 8.1 Cut during design

| Cut | Because |
|---|---|
| **Blowout** | It *is* the Pulse. "Spends oxygen for a big hit" is the skill, not a weapon — and as a weapon it was unbuildable, since all 23 firing sites go through `fireOnTimer` and no player-initiated cast exists. |
| Lantern Lure | Pheromone Lure — *and* a refill point **you place**, in a chapter whose tension is that refill points belong to the map. |
| Sonar Pulse | Three rings already ship |
| Thermocline | Torn Seam, v7.33 |
| Brine Pool | Toxin Cysts + the spider's `webZone` |
| Implosion | Mini Black Hole with extra steps |
| Breach (rise and drop) | Owner ruling: out. Book 2 stays on the flat plane. |

## 9. Enemy behaviour and meta

### 9.1 Flags

- **`campsResource`** — seeks the nearest refill point instead of the player. Note: this is a new
  target-selection branch plus a spatial query, not a one-line flag; every existing seek path
  targets `run.player` or a trail sample.
- **`ambush`** — buried in silt, invisible until you are close. **The plain is not empty, it is
  under the sand** — the review's favourite idea here, because it makes open ground interesting
  without spending the player's move vector. Two constraints: `phase`'s shipped contract is
  *"eats nothing, deals nothing"* while hidden, so an invisible-**and**-lethal enemy is a new and
  harsher contract that needs a tell; and buried enemies are not in `stepEnemySeparation`'s
  exemption list, so visible enemies being shoved around them will leak their positions for free.
- **`school`** — ⚠ **not free.** v1 claimed it was `stepEnemySeparation` sign-flipped. Verified
  false: `resolveSeparationPair` early-outs at `distSq >= minSep²` where
  `minSep = ENEMY_SEP_FRAC(0.65) × (rA + rB)` = **20.8px for two drones** (sim.js:2927-2929) — the
  pass only ever touches already-overlapping pairs, so inverted it exerts no force at shoal range.
  Real schooling is a new boids pass with its own neighbour radius. "Reduced damage while dense" is
  separately unmeasurable, since the shipped pass guarantees minimum spacing every frame, and it
  would tax ~19 of 23 weapons. **Cost it as a system or cut it.**

### 9.2 Shop cards

Three cards, all on axes the Pulse creates. v1's four collided with shipped cards:

| Card | Effect |
|---|---|
| **Reservoir** | +bar capacity — more pulses banked |
| **Wick** | +refill rate |
| **Bright** | +pulse amplification per charge spent |

v1's **Ballast** (gems sink slower) is cut: `stepPickups` has exactly one lever
(`magnet = p.magnet × (1 + passives.magnet) × mods.magnetMul`, sim.js:6918), so "sinking" is the
Magnetic Charm axis wearing a hat — and the shared purse means a veteran has already bought the
counter to a tax aimed at them. **The gem-sink micro-dose goes with it**; it was the last remnant of
descent-as-cost and it duplicated an existing axis. v1's **Deep Rating** (−drain) is cut too: with
drain at 0.5/s it was buying almost nothing.

`MUTATORS.sticky` (`playerSpeedMul 0.85`, `magnetMul 1.7`) already excludes `beyond` and `pond`.
Book 2's chapters need adding to that `exclude` for the same reason — a flat −15% player speed in a
book built on travel is an unstated tax.

Title screen gets a **book pager** above the chapter grid.

## 10. Open question: The Core

Deliberately unresolved. The sketch — "the bar pins full and the map is the enemy, convection cells
as `gravity` wells with the sign flipped" — is a mood, not a mechanic: it removes the book's system
and replaces it with nothing specific, and it is the only chapter with no weapons.

Two acceptable resolutions: it earns a real mechanic and the book is five chapters plus the Kernel;
or **the book ends at four chapters plus the Kernel**, which is a good shape and is the default.

Do not build The Core on the current sketch.

## 11. Build order

**Slice 1: the Pulse, in an existing chapter, behind the dev toggle.**

Ungate `stepRepulse` for one shipped chapter, add `run.charge` with passive drain, refill-by-kill
(no map object needed), and bar-scaled amplification. That is one `if`, one scalar, one config
block, and a HUD rail that already exists. It answers the book's real crux — **is a second verb fun
here, and is a bar worth chasing to fuel it?** — with zero art, zero biome, zero roster, and it is
testable on a phone via the seven-tap menu against the live URL.

If the Pulse is not fun, nothing downstream matters and nothing downstream was built.

**Slice 2: The Shelf.** The `shafts` signature, `campsResource`, Photophore, `flagella` + `bloom`
reused, the BOOKS/WIP/pager scaffold.

**Then** Twilight → Wrecks (never before the Pulse is proven, §7.3) → Crust.

### 11.1 Honest cost, corrected

v1 estimated "months at this repo's pace" and mitigated the wrong risk. The log says chapters are
**planned and shipped the same day** — v6.3 city, v6.4 pond, v6.5 undergrowth each have plan and
release commits sharing a date; The Blank went spec-to-shipped in one day. The cost is the
**settling tail**: beyond ~32 follow-up releases, skies ~22 across four spec documents totalling
1,465 lines and two re-themes, garden/undergrowth ~25, city ~19 — and none of the seven has
converged. 78% of this repo's releases landed after all seven chapters existed.

So: **~1 day to build a chapter, 20–32 releases over 25+ days to make it good.** A vertical slice
cannot de-risk a tail proportional to chapter count — which is why slice 1 is the Pulse alone, the
one thing that is actually in question, rather than a whole chapter that bundles it with five things
that are not.

### 11.2 The known risk of building gated

Owner has accepted this, and it is recorded rather than re-argued. Every quality correction of
consequence in this log came from the shipped build being played: v6.8.1's side-elevation tornado,
v6.9.0's city playtest, v7.22.0's off-screen artillery, v7.23.0's Tail Swipe losing to the free
starter, and CLAUDE.md's own note that the pulsar's chapter branch was *"corrected from play."* And
`src/sync.js` — 163 lines, specced across 2,128 lines, with a Worker built and deployed on
2026-08-04 — has **zero importers in `src/`**: work that does not have to face a player stops moving.

**Mitigation:** the dev toggle exists precisely so the WIP book can be played on a phone against the
live URL. Use it that way — the gate is only safe if it is actually played behind.

## 12. Review record (2026-08-12)

Four reviewers: genre fit, minute-by-minute play, shipped-system collisions, opportunity cost. Every
claim below was re-verified against source before being recorded.

### Resolved by the Pulse (§5)

1. **"A sink you control" did not exist.** All 23 firing sites go through `fireOnTimer`; the only
   player-triggered action was `REPULSE`, lane-gated. → Resolved: the skill channel is general and
   already built; Blowout became the Pulse; no weapon spends the bar.
2. **An empty bar at 40% output** put Book 2's *onboarding* chapter past Undergrowth's endgame
   effective HP during the run's worst 100 seconds. → Resolved: the bar does not touch damage.
3. **The dead zone made the bar ignorable then a cliff**, and overcharge (+15%/4s ≈ 1.4% of a run's
   damage) could not carry the "chore into chase" claim against a +33%-permanent level-up every
   ~17s. → Resolved: deleted with the multiplier.
4. **`stepStragglers` put the horde on your destination.** → Resolved as the intended loop (§5.2).
5. **The Wrecks' corner was a death trap** with no navmesh. → Resolved conditionally: viable only
   with the Pulse, hence its build order.

### Downgraded by owner ruling

6. **Stillness** (`when: () => true`, ×3 damage after 2s still, `_stillT` resets on raw input) would
   make a refill point the best DPS spot in the game. Owner: one opt-in card out of 20, and a player
   who takes it already parks everywhere. Recorded as a build interaction, not a design inversion.
   Note it still zeroes Wake, so a Stillness + Crust build is inert.

### Still standing — must be handled

7. **No targeting** → §7.2 (movement choice + aim override).
8. **The WIP gate leaked** and `nextChapter` is buggy today → §2.1, with three tests.
9. **`school` is not a knob** → §9.1: cost it as a boids pass or cut it.
10. **Phone constraints** — joystick minimum 33 px/s, `KITE_MIN_SPEED` 100 px/s, horizontal
    half-view ~195px not 465 → §7.1.
11. **Mod budget ~28, not 42**, and Bubble Net supports ~3 → §8.
12. **Shop card collisions** (Ballast = Magnetic Charm, Deep Rating ≈ Slippery) → §9.2, both cut.
13. **`weapon-census.mjs` cannot measure any of this** as-is — it diffs enemy `hp` per step, and it
    may only be compared within one invocation. It needs a charge column before any Book 2 balance
    claim is quotable.
14. **Opportunity cost.** Reviewers recommended shipping the bar as a single anomaly card instead of
    a book, and a second `lane:` chapter as the better content cycle. Owner ruled for the book.
    Recorded; §11.1 and §11.2 carry the parts of that argument that still apply.
