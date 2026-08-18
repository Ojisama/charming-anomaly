# Undertow — the murk chapter, and Book 2 grows to six

**Date:** 2026-08-17
**Status:** design, rev 2 (post adversarial review), approved in chat, not yet implemented
**Executes:** §6.2 of `2026-08-13-book-2-undertow-design.md` (the Clarity / murk retint), specced
2026-08-13 and never built
**Amends:** §5 of the same document (five chapters → six; see §7)

**Revision history.** Rev 1 was reviewed by three adversarial passes (design, fact-check, silent
failure) and came back with a RETHINK, thirteen false or overstated claims, and fifteen silent
failure risks. Rev 2 corrects all of them. **Where rev 1's reasoning was wrong, this document says
so rather than quietly restating the conclusion** — §3 in particular argued from a fact that is
false, and the design survives on different grounds.

---

## 1. The decision

The light mechanic leaves chapter 2 and moves down the book. Chapter 2 becomes the **murk**
chapter its own spec has always called for. Nothing is deleted, and Book 2 grows to six.

| Slot | id | Name | Resource | Signature | Button | The bar's second job |
|------|-----|------|----------|-----------|--------|----------------------|
| 2.1 | `surf` | The Surf | Humidity | `tide` | Shorebreak | **output** — humidity drives your damage |
| 2.2 | `shelf` | **The Shelf** | **Clarity** | **`shafts`, drawn as upwellings** | **Clear** | **sight** — clarity is how far you can see |
| 2.3 | `reef` | The Reef | Air | `air` | Burst | **survival** — empty air drowns you |
| 2.4 | `trawl` | The Trawl | Feed | `trawl` (the net) | Breach | **mobility** — feed is your speed |
| 2.5 | `twilight` | **The Twilight** | Light | `shafts` | Pulse | **sight** — and an empty bar slows you |
| 2.6 | `deep` | The Deep | Light | `dark` (maws) | Scent | **perception** — light is sight *and* damage |

Bold is what changes. The Surf, The Reef, The Trawl and The Deep are untouched.

The chapter's *gimmick* in §5's sense is **the murk**; its `signature.type` stays `shafts`,
because the drifting-circle geometry is what an upwelling field needs and it is already tuned.

> Rev 1 gave The Surf's button as "Thrash", inherited from the August spec. Shipped code declares
> `shorebreak: true` (`config.js:5027`) and `stepRepulse` **returns early** at `sim.js:1238-1243`,
> firing no shove at all. Corrected above.

### 1.1 Phasing

A resource retint, a new button, a HUD label, three weapons and three creatures must not land as
one commit — and must not land as a hole, because `BOOKS.undertow.chapters` cannot carry a slot
with nothing in it. Each phase ships a *playable* book, in the pattern this repo used for The Reef
and The Trawl, both of which opened with borrowed stand-ins and said so.

- **Phase 1 — the move.** Rename `shelf` → `twilight`; six-chapter order; re-cut The Twilight's
  palette / `formScale` / `balance` / `radiusFull`; author the new `CHAPTERS.shelf` running the
  shipped radius rig as **Clarity** (brown-green scrim, upwelling look, `speedFloor: 1` — see §4 —
  and the plain Pulse, with Clear deferred to Phase 2). The save migration (§10) and the whole
  test re-point (§12) land here, because they are what make the rename safe rather than silent.
  - ⚠ **Phase 1 must also give The Twilight a borrowed `tank`.** Run DA.h
    (`test/sim-test.js:18335-18348`) asserts every chapter × archetype has a non-`formationOnly`
    roster entry. §6 moves the Copepod (`normal`) and Krill (`fast`) down and leaves the tank at
    2.2, so without a stand-in `npm test` **fails**. Rev 1 budgeted stand-ins for the Shelf only.
  - **Every stand-in is named as one** in the commit and in the config comment. The 🐻 tardigrade
    shipped under a comment calling it a considered decision and cost a review round-trip.
- **Phase 2 — the button, the label and the arsenal.** The `ch.clear` branch (§4), probed on both
  of `charge-probe.mjs`'s axes; the HUD resource label (§4.1); then three natives through
  `design-a-weapon`.
- **Phase 3 — the rosters.** Three creatures through `designing-an-enemy`, plus `ROSTER_LOOKS`,
  `render.cast`, run RA and the `bake-cast.mjs` re-bake.
- **Phase 4 — The Twilight's hazard. DECLARED DEBT, NOT A MAYBE.** See §5.1.

## 2. Why

Owner, 2026-08-17: *"abyss is light starved, so light related stuff"*, then *"the idea was about
murkiness / pollution / cleanness"*.

Light-starvation had been sitting at chapter 2, in the chapter whose own config comment calls it
*"the BRIGHTEST it ever gets"*. §6.2 ruled against that on 2026-08-13 — *"light is the wrong
resource for bright shallow water"* — and `plans/2026-08-13-undertow-chapters-3-5.md:13-21`
records that the retint was scheduled **last** on purpose, because running it before a genuinely
dark chapter existed would have left the game with no dark chapter at all. The Deep now exists.

What the August spec could not know is that chapter 2 would grow three native sun weapons and a
measured light economy. That work is finished and good; it belongs deeper.

## 3. Why a sixth chapter rather than pooling the sun weapons into The Deep

**Rev 1 argued this on a false premise and the premise is withdrawn.** It claimed the weapons
"cannot simply be pooled elsewhere" because a chapter without a `resource.dark` block makes them
inert. Three corrections:

- **The Deep has that block**, and its `from: 0.5` is identical to the Shelf's
  (`config.js:5726`). Foxfire's gloom ramp works there unchanged, and its lightmap punch works
  too — `updateDark` fires for any chapter with `res.dark`. The Deep is mechanically a **valid
  host**, and it has two admitted borrow slots.
- **"Silently inert" was wrong anyway.** Without the block, `darkness()` returns 0, so `gloom`
  resolves to 1 — Foxfire still fires, still spawns `run.blooms`, still deals `dmgPerTick`, still
  renders and still emits its event. It loses exactly two things: the ≤1.6× radius bonus and the
  lightmap punch.
- **`lightRadius()` returns `Infinity`, not zero**, for a chapter with no block
  (`config.js:7219-7221`), under a comment saying *"a 0 would black the screen out"*. Only
  `darkness()` returns a flat zero. Anything written against "both return zero" inverts.

**The real justification is fiction, and it is the owner's ruling.** A card called *Sunspear*
firing a column of sunlight at 4000m is CLAUDE.md's borrowed-art failure exactly — the maple leaf
in the open ocean. The Deep is the light-**starved** endpoint; making it also the sunlit-shafts
chapter blunts the one thing it is for. Asked directly, with Foxfire's Deep-compatibility stated
in the option text, the owner chose *"those weapons should go to the twilight, and do 3 new"*.

This is recorded rather than buried because the design reviewer's counter-proposal — pool them
into The Deep and retint 2.2 in place — is **cheaper and technically sound**, and a future reader
deserves to know it was declined on fiction, not ruled out by the code.

## 4. The Shelf (2.2) — the build

**Resource: `Clarity`. Antagonist: the murk.** The shipped radius rig is reused verbatim, on
§6.2's reasoning: *"it does not care whether the thing outside the radius is darkness or filth."*

- `lightRadius()` → **`clearRadius()`**, as §6.2 asks. Honest for every caller — the Deep's radius
  is a radius of clear space too. (Two chapters call it today; three after this.)
- The resource sub-block **keeps the key `dark`**. It names the *rig*; what sits outside the
  radius is already per-chapter presentation via `render.darkTint`. Mark it with a `ponytail:`
  comment naming the ceiling: if a fourth reading ever needs different *geometry* rather than a
  different colour, that is when the key splits.
- `render.darkTint` goes brown-green.
- **`speedFloor: 1` — the murk does NOT slow you.** Rev 1 left this unstated, which the review
  correctly called *"a fact authored in zero places"*. Three reasons it is 1: the murk is *"filth
  you can push back"*, not exhaustion; the shipped Shelf tune with both penalties recorded **the
  highest damage taken of any row** (`config.js:4870`) and Clear adds a third cost; and 2.4 and
  2.5 already both slow you, so a third is the axis collapsing.

**Signature: clean-water upwellings.** Same `shafts` geometry — the drift is tuned and load-bearing
(`driftAmp 60 × driftHz 1.0` = 60 px/s, deliberately between the joystick deadzone at 33 and
`KITE_MIN_SPEED` at 100, asserted at `test/sim-test.js:5775`). It needs its own **drawing**:
`refillLook` (`render.js:17512`) derives the look from the signature's *shape*, so keeping
`type: 'shafts'` draws warm additive sun columns in the murk chapter. Add an additive
`signature.refillLook: 'upwelling'` field and a fifth case in the switch at `render.js:10416-10420`.

> Name it `refillLook`, **not** `look`. `look` is already six unrelated reads in the same render
> neighbourhood (`bl.look === 'foxfire'`, `s.look === 'erase'`, `ln.look === 'mower'`,
> `n.look === 'foam'`, `b.look === 'sunlance'`), which is CLAUDE.md's grep-the-name rule.
> `refillLook` is also latched once in `reset()` and its bake cache already keys on it
> (`render.js:10522`), so a re-bake is free.

**Button: Clear.** A new `ch.clear` branch in `stepRepulse`. Two corrections to rev 1:

- It must **`return`**, like `ch.shorebreak` (`sim.js:1238-1243`), **not** fall through like
  `ch.scent` / `ch.breach`. The shorebreak comment states the rule: *"Returning here also means a
  chapter can never end up with two second verbs at once."* Copying `ch.scent` gives 2.2 both the
  shove and Clear.
- §6.2's stated effect — *"blows wide for a few seconds and everything it reaches is stunned"* —
  is close to what the base repulse already does via `REPULSE_STUN`, so **a `ch.clear` branch that
  never fires is nearly indistinguishable in play from one that works.** It needs a behavioural
  assert (radius differs at a full vs an empty bar), not just a vocabulary one.

> ⚠ §6.2's own warning: **the spend shrinks the steady-state radius while the burst is up.** Every
> other Book 2 button carries an explicit anti-spiral floor citing §8.2 — `BURST_DUR_MIN`,
> `BREACH_R_MIN`, `SCENT_DUR_MIN`, and the Pulse's `min(charge, PULSE_CHARGE_COST)`. All of them
> floor the button's **output**; none floors **sight**, because in no other chapter does the button
> cost sight. **Prefer paying Clear's cost in recovery time** — the burst clears wide, then the
> radius rebuilds over N seconds — which gives the same tension with no legibility spiral. If the
> radius cost is kept instead, name a `CLEAR_RADIUS_FLOOR` beside the other three. Probe on both
> of `charge-probe.mjs`'s axes; that harness lies about anything that slows you.

**Three new weapons.** §6.2 names the starter — **Bubble Puff** — and rules `flagella` out of the
pool, which shipped code already did. Each goes through `design-a-weapon`.

**Also required at this slot, all pre-existing defects rather than new ones:**

- **`form: 'fish'` + `formScale: 1.15`** — chapter 2 is the only Book 2 chapter with no `form`,
  a leftover from `{...CHAPTERS.pond}`. 1.15 is the rung `CHAPTERS.trawl:5601` already names.
- **`playerTint`** — the config comments say it MUST be white with a `form`, but **The Deep ships
  `form: 'fish'` with `playerTint: 0xcfe6f2`**, so the rule is not held in shipped code and its
  level-up minimes are already pale-blue. Decide deliberately and add the assert (§12) so whichever
  way it goes is enforced rather than assumed.
- **`obstacles`** — still the Pond's, by reference (`shelf.obstacles === pond.obstacles` is
  literally `true`). Wants settled rubbish or `null`, not lily pads.
- **`icon`** — needed, and interpolated with **no `??` fallback** at `ui.js:454`, `:590`, `:1912`.
- **`eliteFlags`** — `['soapTrail']` today; both chapters need a decision, and
  `DMG_SRC_NAME`'s comment counts them by name (`config.js:7469`).
- **The `swell` block stays here** — it is the only one in the game, and surface waves seen from
  below cannot be seen at 2.5.
- **Balance stays here** — today's slot-2 cut is still slot 2's.

### 4.1 The resource bar gets a label (owner ruling, 2026-08-17)

**`resource.name` is currently rendered nowhere in `src/`.** The HUD rail reads
`CHAPTERS[run.chapter].resource` for its numbers and never its name, which is why `Light`,
`Humidity`, `Air` and `Feed` have no French and have never needed any. So without this, "the
resource becomes Clarity" is a change only a developer can see.

Scope is exactly the six Book 2 chapters — Book 1 declares no `resource` at all, so its rail is
already hidden by the existing `!!res` gate (`ui.js:1457-1461`). Five distinct strings:
Humidity / Clarity / Air / Feed / Light.

The rail is **vertical** (`.chaos-vrail--charge`, and it moves for an x-lane chapter via
`charge--lanex`), so the label is a layout question, not just a string. Add `resource.name` to run
XX's copy walk in the same commit — it is not walked today — and ask the owner for the French.

## 5. The Twilight (2.5)

**Moves down intact, no design work:** the `Light` resource and its `dark` block, the `shafts`
signature, the Pulse, `Sunspear` / `Foxfire` / `Sunlance`, and the Copepod and Krill.

**Does not move, and must be re-cut** — all encoded against *slot 2*, not against the chapter:

- **Palette.** Today's `bgColor 0x18567f` / `floorTint 0x9fd6f0` is the surface blue. At 2.5 the
  base water goes dim and the shafts stay bright. ⚠ The floor ladder is currently an **unmeasured
  claim at both ends**: `obstacle-contrast.mjs` has no `trawl` and no `deep` row, so
  *"Trawl lower → Deep lowest"* exists only in prose. Fix the audit first (§9).
- **`formScale`.** ⚠ **There is no clean rung.** Shipped steps are +15%, +13%, +19% (1.0 → 1.15 →
  1.3 → 1.55 → 1.7). Inserting between 1.55 and 1.7 makes the last two steps **+4.8% and +4.6%** —
  a third of every earlier step, at exactly the point the fantasy is "you have become the shark".
  Growth should accelerate into a finale. **Re-cut the whole ladder**, do not interpolate.
- **`balance`.** ⚠ `maxAliveMul` runs 0.55 → 0.65 → 0.75 → 0.85 → **0.80** — it already turns over
  at The Deep, deliberately (`config.js:5766`), so there is no interval to slot a sixth value into.
  Same for `spawnMul` (0.68 → 0.75 → 0.76 → 0.80 → 0.75). Re-cut, do not interpolate.
- **`radiusFull`.** Currently `1.0`; probably too generous one chapter above a Deep tuned to `0.50`
  so the corners stay dark. Assert the **ratio**, never px, and shoot both viewports.
- **`render.cast`** — `['copepod','krill','jelly']` today, and §6 splits those across two chapters.
- **`CHAPTER_LATE_RATE`** (`config.js:3898`) has **no Book 2 keys at all** — every Undertow
  chapter silently falls back to The Body's gentlest difficulty curve. Pre-existing, and this is
  where it belongs on the fix list.

So *"a move, not a build"* is true of the mechanic and its arsenal, and **false of the chapter**.

### 5.1 The Twilight has no hazard — declared debt (owner ruling, 2026-08-17)

Every other Book 2 chapter carries a threat system on top of its bar: the Surf's `surge`/`bars`,
the Reef's lane, the Trawl's net, the Deep's maws that bite the hand that feeds. **The Shelf's
signature is pure refill geometry and nothing else** — the Reef's own comment establishes the
reading (`config.js:5287`). That was fine at slot 2, the book's gentlest rung. At slot 5 it puts
the book's thinnest chapter at its second-most-demanding position, and it regresses the book's
refill ladder (fixed-and-drying → drifting → fixed-in-a-tunnel → welded-to-the-danger →
it-bites-you) back to rung 2 one step before the climax.

**Owner ruling: ship it bar-only, add the hazard later.** Recorded here as **Phase 4, a debt with
a name**, not an open question — because this repo's track record on "later" is the silencing bag,
owed since August. Two consequences to hold:

- Until Phase 4, The Twilight's `speedFloor 0.6` slow is **not distinguishable from The Trawl's
  `tire`** — see §7. The hazard is what will differentiate the chapter; until it lands, 2.4 and
  2.5 share an axis and that is a known, accepted cost.
- The strongest candidate, for when Phase 4 comes: **the diel migration column** — a vertical band
  of biomass crossing on a clock. It is the mesopelagic's defining event, it is the same
  crosses-on-a-timer shape the net already proves, it is a threat that does not aim at you (Book
  2's thesis), and it is the direct consequence of the Copepod and Krill living here (§6).

## 6. The roster split, decided on realism

Owner: *"whatever is most realistic."*

| Creature | Goes to | Why |
|---|---|---|
| **Moon Jelly** | **2.2 Shelf** | *Aurelia aurita* is a coastal shallow-water jelly, and moon-jelly blooms are the textbook signal of eutrophic, oxygen-poor, polluted coastal water. Close to the ideal creature for a pollution chapter. Keeps its `lean: 90` side-on body. |
| **Copepod** | **2.5 Twilight** | Diel vertical migration defines the mesopelagic and is mostly copepods and krill. |
| **Krill** | **2.5 Twilight** | Same, and krill are its iconic migrator. |

Gaps: 2.2 holds the `tank` and needs a `normal` and a `fast`; 2.5 holds `normal` + `fast` and needs
a `tank` (borrowed in Phase 1 — see §1.1).

**Pick for the flag vocabulary first, then find the realistic animal that fits it.** Rev 1 did the
reverse and the review caught it: *Mnemiopsis* swims at centimetres per second, so `fast` is a lie
about it; *Capitella* is a 1cm burrowing deposit-feeder, so `normal` (a chaser) is a lie about it.
Realism that only reaches the name and not the movement is worse than no realism.

Two further constraints found in review:

- **Do not put a slow gelatinous drifter in both chapters.** "Siphonophore at 2.5" plus "Moon Jelly
  at 2.2" is one creature concept twice. 2.2's antagonist is *not being able to see*, so its
  creatures should exploit that — something that **hides in the murk** and is legible only close up.
- **`unshakeable` is `UNSHAKEABLE_CC_MUL = 0.5`**, so Clear's headline verb ("everything it reaches
  is stunned") lands at half duration on the chapter's only shipped creature. Revisit the jelly's
  flags when Clear lands, or the button under-delivers on first contact.

⚠ **Changing two of three creatures changes the kill rate, which changes `killRefill: 1.5`.** The
shipped tune's premise is stated at `config.js:4812` — *"EVERY FLAG IS THE POND'S, UNCHANGED… the
spawn economy that charge-probe's refill sweep was tuned against is untouched."* Re-run the full
refill sweep, not just the Clear spend policy.

## 7. Six chapters, five axes — the honest version

Rev 1 amended §5's "five distinct second jobs" to *"no two **adjacent** chapters share an axis"*.
**That amendment does not survive review and is withdrawn.** It failed three ways:

1. It fails at the pair it creates — 2.5 and 2.6 *are* adjacent, and 2.6's "perception" contains
   2.5's "sight".
2. It defended a duplication in the *second-job* column using the *button* column, which makes it
   vacuous: no two chapters share a button, so nothing could ever violate it.
3. Adjacency is not experienced. Chapters are re-played at five difficulties and picked freely
   from a carousel once unlocked, so "separated by two chapters" is a property of the bookshelf,
   not of a session.

**What replaces it: an accepted, time-boxed duplication.** 2.2, 2.5 and 2.6 all meter sight. 2.2 is
differentiated now (it does not slow you, and its antagonist can be pushed back). 2.5 and 2.6 are
differentiated by rules that already ship — 2.5 slows you and can fill the screen; 2.6 never fills
it, refills only from something that bites, and spends the bar on damage. **2.4 and 2.5 are not
differentiated at all**, and §5.1 names the hazard as the fix.

> Rev 1 claimed the two were distinct because *"the Trawl's bar is a **direct** speed multiplier
> and the Twilight's slow a **floor**"*. **That describes code that does not exist.**
> `darkness()` and `tiredness()` are the same function — `barRamp` (`config.js:7187-7197`) — and
> the shipped comment says so: *"the same curve The Shelf's dark runs on… deliberately sharing
> barRamp() so the two curves cannot drift."* Both compose into one `Math.min` at `sim.js:639`.
> At an empty bar they differ by 3% speed (0.60 vs 0.62) and 5 threshold points. Acting on rev 1's
> sentence would have meant editing The Trawl, which §11 puts out of scope.

## 8. The rename — the `shelf` token has three senses, not two

One rename, `shelf` → `twilight`, then a **new** `CHAPTERS.shelf` authored from scratch. Rename
first, verify zero chapter-sense `shelf` remains, only then create the new one.

**Census (bare `\bshelf\b`, case-insensitive), from review:**

| file | occurrences | of which bookcase-sense |
|---|---|---|
| `src/config.js` | 83 | **4** |
| `src/render.js` | 35 | 0 |
| `src/ui.js` | 33 | 23 |
| `src/styles.css` | 24 | 11 |
| `src/sim.js` | 18 | 0 |
| `src/state.js` | 9 | 0 |
| `src/fr.js` | 4 | 1 |
| `src/main.js` | 1 | 0 |
| **src/ total** | **207** | |
| `test/sim-test.js` | 128 lines / 165 matches | ~18 |
| `scripts/` | 20 lines / 10 files | 0 |

**Sense 1 — chapter.** The rename target.

**Sense 2 — the title screen's bookcase.** `titleBookshelf`, `shelf.started`, `shelf.volumes`,
`shelves`, `.shelf-row` / `.shelf-board` / `.shelf-plate` / `.shelf-stars`. Rev 1's line
references were wrong: the bookcase code is `ui.js:164-190` and `405-500` (`etageHtml(shelf, n)`
at `:462`), plus `640-641`, `664`, `705`, `858`, `1153-1160`, `2465-2538`. **`ui.js:314` is the
summary-screen JSDoc and `ui.js:1053-1055` is the shop sacrifice row — neither is bookcase code.**
And `spineName` contains no `shelf` substring at all, so it was never at risk.

⚠ **Bookcase-sense lives inside the primary rename-target file:** `config.js:6684` `const shelf =
[]` and `:6691` `shelf.push({…})`, both inside `titleBookshelf`. This is CLAUDE.md's "a rename
sweep can clobber a pre-existing identifier you did not know about", in the file you are sweeping.

**Sense 3 — geometric.** The tide-pool drawing's literal shelf: `config.js:5896`, `:5902`,
`render.js:10379`, `:10546`. Neither chapter nor bookcase. Rev 1 did not know this sense existed.

**Also leave alone:** `styles.css:2110` (*"shot over a real Shelf frame"*) is a provenance
quotation — CLAUDE.md's rule is to leave verbatim quotations untouched.

Harness rules: assert a **measured** (`grep -c`) count per replacement and **write nothing** if one
misses; repair against `git show HEAD:<file>`, never memory; afterwards read every touched
user-facing string via `git diff -U0 src/config.js | grep -E "name: '|desc: '"`.

⚠ **Do not use "128 shelf sites" as a sweep precondition.** ~18 of them are bookcase-sense and must
not change, so the count is either a false abort or — worse — satisfiable by renaming
`titleBookshelf`.

**The Deep's self-explaining comments point at The Shelf in ten places, not three:**
`config.js:5628, 5648, 5652, 5657, 5660, 5662, 5677, 5681, 5688, 5758`, plus
`test/sim-test.js:19418` (run DP.f). Every one must be re-pointed at The Twilight, or the file's
own explanation becomes a lie that reads as truth.

## 9. Sites to touch

**`src/config.js`** — `BOOKS.undertow.chapters`; rename `CHAPTERS.shelf` → `CHAPTERS.twilight` and
re-cut palette / `formScale` / `balance` / `radiusFull` / `render.cast`; author the new
`CHAPTERS.shelf`; `CHAPTER_SPINE` (`:6655`); **`MUTATORS.sticky.exclude` (`:9398`) — *not*
`ANOMALIES.sticky`**, which does not exist, and `'twilight'` is **added alongside** `'shelf'`, not
substituted; `CHAPTER_LATE_RATE` (`:3898`, no Book 2 keys at all); the `DMG_SRC_NAME` comments at
`:7469` ("four of them Book 2") and `:7544` ("all 13 chapters"); the census comment at `:1899`.
**Trim, do not delete, the ⚠ at `:5447`** — Longline and Net Toss *are* built (`sim.js:8536`,
`:8606`; `render.js:10695+`), but the same warning also names the mackerel-school and the silencing
bags, which are still genuinely owed.

**`src/state.js` — omitted entirely from rev 1.** Nine chapter-sense references, including the
authoritative run-shape doc block CLAUDE.md tells you to keep in sync: `:709`, `:1044`, `:1066`
(*"gated on `signature.type === 'shafts'` so only The Shelf"* — false with two `shafts` chapters),
`:1067`, `:1077`, `:1100`, `:1469`, `:1924`, `:1933`. Plus the migration and unlock fix (§10).

**`src/sim.js`** — the `ch.clear` branch (must `return`, §4); the three new weapons' steppers.

**`src/render.js`** — `BIOMES` keys (`:9299`) — a missing entry falls back to `BIOMES.body`
**silently** (`:17554`); `BIOME_SHELF` **and the three prop arrays it is built from**,
`BIG_SHELF` / `MID_SHELF` / `DETAIL_SHELF` (`:9050, 9055, 9064, 9070`); the `refillLook` switch
(`:10416-10420`, derived at `:17512`, declared at `:246`); `ROSTER_LOOKS`; the Clear tell.

**`src/ui.js`** — the resource label (§4.1). Note `ui.js:1257` hardcodes `aria-label="Pulse"` and a
**sun glyph ☉** for every chapter's button, untranslated — a sun glyph in a murk chapter is the
borrowed-art trap.

**`src/main.js:445`** — the `SFX_FOR_EVENT` comment block naming The Shelf's weapons.

**`src/fr.js`** — rev 1 listed only *new* keys and missed the live hazard: **`:1121` `'The Shelf':
'Le Large'`** ("the open sea") and **`:1102` `'Shelf': 'Large'`**. The murk chapter keeps the
English name, so a translation authored for bright shelf water silently follows it onto a pollution
chapter — verbatim the `Slow Burn` failure, and **run XX is perfectly happy because the key is
covered.** Also the comment headers at `:1086` and `:1117`. New keys: The Twilight, the new
tagline, the five resource names (§4.1), three weapons, three creatures.

**`test/sim-test.js`** — see §12; this is the largest and most dangerous surface.

**`scripts/`** — `charge-probe.mjs:53` default plus its comments at `:11`/`:51`;
`obstacle-contrast.mjs:38` (hardcoded Shelf colours, no `trawl`/`deep` rows) **and `:19`
`BLOTCHES`, a second hand-copy of render.js's `T.blotches`** — `bg`/`floorTint` should be imported
from `CHAPTERS[].render` rather than re-transcribed; `smoke.mjs:4` and `:92`; six `shelf-*.js`
scene headers — **and `scenes/jelly.js:3` must NOT change**, since the Moon Jelly stays at 2.2.
Scene ids live in *comments*, so no identifier sweep sees them and the documented command would
silently shoot the wrong chapter.

## 10. Save data — a migration IS needed

Rev 1 said "no migration, one ladder reset". **That was wrong in both directions.**

- `ensureChapterMeta` (`state.js:218-220`) creates a missing entry as
  `{ unlocked: id === 'body', … }`, so **`twilight` arrives LOCKED** holding none of the progress
  it earned.
- The retroactive intra-book unlock chain loops **`CHAPTER_ORDER`** (`state.js:286`), which is
  `BOOKS.book1.chapters` — **there is no Book 2 equivalent.** So a save that had unlocked `deep`
  ends with a **locked rung at 2.5 under an unlocked 2.6**, re-openable only by re-beating The
  Trawl at d3+.
- Meanwhile `chapters.shelf` — five wins, best times — is read as the **murk chapter's**, so a
  never-played chapter shows five gold stars on the bookcase and someone else's records.

The R2 round-trip itself is safe (`bookMeta`/`ensureBookMeta` are per-book, and an old build
preserves `chapters.twilight` as an unknown key). This is not a wipe; it is **silently
misattributed progress**, which is worse, because nothing looks wrong.

**Fix, additive and R2-clean, no flag needed** — guarded on `twilight` being absent, so it runs
once: move `chapters.shelf` to `chapters.twilight` and let `ensureChapterMeta` rebuild a fresh
`shelf`. And **generalise the retroactive unlock loop from `CHAPTER_ORDER` to every book's
chapters** — that is a real fix worth more than this change.

⚠ Rev 1 also claimed *"no player save carries Book 2 progress"* because the book is `wip`. The gate
is real (`state.js:518`), but **`meta.dev` is player-reachable in the shipped production bundle** —
seven taps on the title wordmark (`ui.js:690` → `:2671` → `main.js:157`), and the unlock it writes
persists after dev is switched back off. The affected population is "anyone who tapped the wordmark
seven times", not "nobody".

## 11. Out of scope

The Surf, The Reef, The Trawl and The Deep. §4's silencing bag and the school-of-mackerel, both
still owed to the Trawl. Breakable weak points. The Kraken. Any change to the Deep's tuning.

## 12. Verification — and the guards this change actually needs

**⚠ THE HEADLINE RISK: ~20 test sites would silently re-point onto the new murk chapter and keep
passing.** `runShelf:5692`, `runDark:6305`, `runLightThief:6680`, `shelfRun:17158`,
`testSunspear:17189`, `testFoxfire:17275`, `run0ChargeMax:17374`, `testSunlance:17381`,
`testUndertowLadder:19851`, `runRosterArt:6631`, the `shelfMeta()` helpers at `:5689`/`:6308`, and
every `createRun(…, { chapter: 'shelf' })`. Because the murk chapter keeps a `resource` with a
`dark` block and a `shafts` signature, all of them still resolve, still run and still go green
while measuring a chapter they were not written for — and **The Twilight ends with zero coverage of
the mechanic it owns.** Only `testShelfPool:17174` goes red, so an implementer fixes that one and
stops. This is the single most important thing in this document.

**Guards to add**, in the run EV/SQ/CP/VO source-text style:

1. **Re-point lint.** After the rename, `test/sim-test.js` must contain **zero**
   `CHAPTERS.shelf.resource.dark` / `CHAPTERS.shelf.signature`, and at least one
   `CHAPTERS.twilight.resource.dark`. Plus `assert.strictEqual(CHAPTERS.twilight.resource.name,
   'Light')` at the top of each moved scenario.
2. **Extend `testUndertowLadder` (`:19839`) — do not add a second scenario.** Rev 1 proposed a
   duplicate, which is the one-fact-two-places shape this repo's worst defect class is made of.
   Its `LADDER_PREFIX = ['surf','shelf','reef']` (`:19879`) is **blind by construction** — the
   prefix is unchanged while slot 2's meaning is replaced wholesale. Assert the id → **resource
   name** map (`shelf → 'Clarity'`, `twilight → 'Light'`), which is the fact the rename moves.
3. **Ladder monotonicity — floor LUMINANCE, not contrast.** Rev 1's guard said "contrast strictly
   decreasing", which would enforce *"the game gets progressively less legible"*, the opposite of
   why that audit exists. Assert the luminance ladder, plus a WCAG contrast **floor** per chapter.
   Also assert every `Object.keys(CHAPTERS)` id has a row in `obstacle-contrast.mjs`.
4. **`signature.refillLook` vocabulary** (run VO): every declared value appears as a literal in
   render.js's switch, and every branch is produced by some chapter. Note `test/sim-test.js:17995`
   is a source anchor on that exact ternary and will need updating.
5. **`ch.*` button vocabulary** (run VO): every `ch.<flag>` read inside `stepRepulse` is declared
   by some chapter, and every boolean chapter key is read somewhere. Plus the behavioural assert
   that Clear's radius differs at a full vs an empty bar.
6. **`render.cast` ⊆ roster** (run RA): every cast id is in that chapter's own roster, with a named
   exemption list. Without it both title cards silently advertise the wrong creatures — run RA's
   existing checks (`ROSTER_LOOKS` entry + `src/cast/<id>.png` on disk) stay true after the split.
7. **Roster-id uniqueness** across `Object.keys(CHAPTERS)`. `dmgSrcName` (`config.js:7504`) returns
   the **first** match in a flat namespace, and there is **already** a duplicate — `rat` in both
   `undergrowth` and `city`. Grandfather it by name with a written reason.
8. **`playerTint` with `form`** (run US.f, `:19664`): it checks four things about forms and never
   the tint, while two config comments say it MUST be white and The Deep contradicts them.
9. **Save migration** (§10): seed `chapters.shelf = {unlocked:true, maxDifficulty:5, won:5}`, run
   the repair, assert the progress lands on `twilight` and that no locked rung sits below an
   unlocked one. Print the denominator.
10. **`state.js` prose lint**: no `The Shelf's Light` remains after the rename.

⚠ **run XX cannot go red for this chapter copy.** `shippedChapterIds` filters `!b.wip`
(`test/sim-test.js:190`), so every Undertow chapter name, tagline and creature name is exempt while
the book is WIP — rev 1's *"watch it go red before writing the French"* is unrunnable for chapter
and creature copy. New **weapons** and the new **resource names** would be caught (`WEAPONS` is
walked flat), so write those French entries against a red bar and the rest by inspection.

Also unactionable as rev 1 wrote it: **`CHAPTER_ENDINGS` and `CHAPTER_UNLOCK_LINES` have no Book 2
rows at all** (`config.js:9160-9177`) — every Undertow death already prints the generic fallback.
There is nothing to rename, and run JJ.d cannot see the book either way.

**Then:**

- `npm test` green, new guards mutation-proven.
- `node scripts/test-isolation.mjs` — new weapons change how many randoms are drawn.
- `node scripts/obstacle-contrast.mjs` — six rows, audit's own hardcoded rows fixed first.
- `node scripts/charge-probe.mjs --chapter shelf` across **both** the spend-policy and movement
  axes, plus the **full refill sweep** re-run because the roster change moves the kill rate.
- `node scripts/weapon-census.mjs`, comparing **within one invocation**.
- `scripts/fx-probe.mjs` on both chapters at **two viewports**, run **sequentially**.
- The live URL with the dev taps, after `npm run ship`.
