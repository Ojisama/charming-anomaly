# Undertow — the murk chapter, and Book 2 grows to six

**Date:** 2026-08-17
**Status:** design, approved in chat, not yet implemented
**Executes:** §6.2 of `2026-08-13-book-2-undertow-design.md` (the Clarity / murk retint), which has
been specced since 2026-08-13 and never built
**Amends:** §5 of the same document (five chapters → six; see §7 below)

---

## 1. The decision

The light mechanic leaves chapter 2 and moves down the book. Chapter 2 becomes the **murk**
chapter its own spec has always called for. Nothing is deleted, and Book 2 grows to six.

| Slot | id | Name | Resource | Signature | Button | The bar's second job |
|------|-----|------|----------|-----------|--------|----------------------|
| 2.1 | `surf` | The Surf | Humidity | `tide` | Thrash | **output** — humidity drives your damage |
| 2.2 | `shelf` | **The Shelf** | **Clarity** | **`shafts`, drawn as clean upwellings** | **Clear** | **sight** — clarity is how far you can see |
| 2.3 | `reef` | The Reef | Air | `air` | Burst | **survival** — empty air drowns you |
| 2.4 | `trawl` | The Trawl | Feed | `trawl` (the net) | Breach | **mobility** — feed is your speed |
| 2.5 | `twilight` | **The Twilight** | Light | `shafts` | Pulse | **sight** — and an empty bar slows you |
| 2.6 | `deep` | The Deep | Light | `dark` (maws) | Scent | **perception** — light is sight *and* damage |

Bold is what changes. The Surf, The Reef, The Trawl and The Deep are untouched.

The chapter's *gimmick* in §5's sense is **the murk**; its `signature.type` stays `shafts`,
because the drifting-circle geometry is exactly what an upwelling field needs and it is already
tuned. Only the drawing and the fiction change — see §4.

### 1.1 Phasing — three shippable steps, not one landing

This is a full chapter build (a resource retint, a new button, three weapons, three creatures) and
it should not land as one commit. It also must not land as a hole: `BOOKS.undertow.chapters`
cannot carry a slot with nothing in it. So each phase ships a *playable* book, in the pattern this
repo has used for every chapter so far — The Reef and The Trawl both opened with borrowed
stand-ins and said so.

- **Phase 1 — the move.** Rename `shelf` → `twilight`, six-chapter order, re-cut The Twilight's
  palette / `formScale` / balance / `radiusFull`. Author the new `CHAPTERS.shelf` running the
  shipped radius rig as **Clarity** (brown-green tint, upwelling look, Clear *not yet* built — it
  keeps the plain Pulse), with the Moon Jelly plus two borrowed roster stand-ins and three
  borrowed weapons. Ships a real six-chapter book the owner can play. **Every stand-in is named as
  one in the commit and in the config comment** — the 🐻 tardigrade shipped under a comment calling
  it a considered decision and cost a review round-trip.
- **Phase 2 — the button and the arsenal.** The `ch.clear` branch, probed on both of
  `charge-probe.mjs`'s axes, then the three natives through `design-a-weapon`.
- **Phase 3 — the roster.** Three creatures through `designing-an-enemy`, plus `ROSTER_LOOKS`,
  run RA and the `bake-cast.mjs` re-bake.

Phase 1 is the one that answers the question that started this: does the light belong down there,
and does chapter 2 read as filthy water. Everything after it is content.

## 2. Why

Owner, 2026-08-17: *"abyss is light starved, so light related stuff"*, then
*"the idea was about murkiness / pollution / cleanness"*.

Light-starvation had been sitting at chapter 2, in the chapter whose own config comment calls it
*"the BRIGHTEST it ever gets"*. §6.2 of the Undertow spec ruled against that on 2026-08-13 —
*"light is the wrong resource for bright shallow water"* — and
`plans/2026-08-13-undertow-chapters-3-5.md:13-19` records that the retint was scheduled **last**
on purpose, because running it before a genuinely dark chapter existed would have left the game
with no dark chapter at all. The Deep now exists and is fully built. The gate has opened.

What the earlier spec could not have known is that chapter 2 would go on to grow **three native
sun weapons** (Sunspear, Foxfire, Sunlance, v7.5x–v7.12x) and a measured, tuned light economy.
That work is good and it is finished; it simply belongs deeper. So rather than retire it, it moves
down as its own chapter and Book 2 becomes six — which also gives §4's pollution ladder an extra
rung, and Book 1 already runs seven chapters, so the bookcase and the unlock ladders need no work.

## 3. Why the sun weapons cannot simply be pooled elsewhere

`darkness()` and `lightRadius()` both test for the resource's sub-block **before** reading
anything else, *"so a chapter with no such block never reads `res.max`"* (`config.js:7174`). A
chapter without one therefore returns a flat zero rather than throwing. Consequences:

- **Foxfire is silently inert** in any chapter without that block. It scales its radius by
  `darkness()` up to `FOXFIRE_GLOOM`, and it also **punches the lightmap as a light source**
  (`FOXFIRE_GLOW`; `render.js:11303` — *"a fire is a light, and this is the line that says so"*).
  A light source does not clear filth: its contract is with a **dark** scrim specifically, not
  with the radius rig in general.
- **Sunlance** reads `run.charge / run.chargeMax` generically and would work anywhere, but its
  whole text — *"it reaches as far as your Light does"* — is a claim about the bar it is standing
  next to.

This is the *"a new mechanic is invisible until it reaches a contract field"* failure in CLAUDE.md,
approached from the other side: the field exists, the weapon reads it, and the chapter simply does
not publish it. Nothing throws and nothing warns. Hence a whole chapter, not a pooling change.

## 4. The Shelf (2.2) — the build

**Resource: `Clarity`. Antagonist: the murk.** The shipped radius rig is reused verbatim, on
§6.2's own reasoning: *"All of it is a radius-of-clear-space mechanic; it does not care whether
the thing outside the radius is darkness or filth."* Concretely:

- `lightRadius()` → **`clearRadius()`**, as §6.2 asks. The rename is honest for all three
  chapters that call it — the Deep's radius is a radius of clear space too.
- The resource sub-block **keeps the key `dark`**. It names the *rig*, not the fiction, and what
  sits outside the radius is already per-chapter presentation via `render.darkTint`. Renaming a
  shared key across three chapters, two helpers and the render lightmap buys nothing the tint does
  not already buy. Mark it with a `ponytail:` comment naming the ceiling: if a fourth reading ever
  needs different *geometry* rather than a different colour, that is when the key splits.
- `render.darkTint` goes brown-green: fouled water closing in, rather than dark closing in.

**Signature: clean-water upwellings.** Same `shafts` geometry — the drift is the point and it is
already tuned (`driftAmp` × `driftHz` = 60 px/s, deliberately between the joystick deadzone at
33 px/s and `KITE_MIN_SPEED` at 100). It needs its own **look**, because `refillLook`
(`render.js:17509`) picks the drawing from the signature's *shape* and would otherwise draw sun
shafts in a murk chapter. Add an additive `look: 'upwelling'` field and a third case; do not
branch on chapter id.

**Button: Clear.** A new `ch.clear` flag branch in `stepRepulse`, exactly the shape `ch.scent`
(`sim.js:1278`) and `ch.breach` (`sim.js:1282`) already use. Effect per §6.2: the clear radius
blows wide for a few seconds and everything it reaches is stunned.

> ⚠ §6.2's own warning, carried forward: **the spend shrinks the steady-state radius while the
> burst is up.** That is the interesting tension and it is also the one thing that could read as
> punishing rather than tactical. Probe it on `charge-probe.mjs`'s existing spend-policy axis
> before tuning by eye — and read the **movement** axis alongside it, because that harness lies
> about any mechanic that slows you (see the `charge-probe` note in CLAUDE.md).

**Three new weapons.** §6.2 names the starter — **Bubble Puff** — and rules `flagella` out of the
pool entirely rather than re-skinning it. Each goes through the `design-a-weapon` skill; none is
designed here.

**Roster: Moon Jelly stays, two new.** See §6.

**Also required at this slot, and pre-existing defects rather than new ones:**

- **`form: 'fish'` + `formScale: 1.15`.** Chapter 2 is the only Book 2 chapter with no `form` at
  all — the player is still the Pond's blob, a leftover from it having been built as
  `{...CHAPTERS.pond}`. 1.15 is the rung the ladder was always written for: `CHAPTERS.trawl`'s
  render comment states the intended set as *"Surf 1.0, Shelf 1.15, Reef 1.3, here 1.55"*.
  `playerTint` must go white wherever `form` is set — the level-up minimes read it directly.
- **`obstacles`.** Still the Pond's, by reference, from the same spread. §4 gives this chapter
  *"settled spill and sediment stirred by the swell"*, so it wants settled rubbish or `null` —
  not lily pads.
- **The `swell` block stays here.** Surface waves seen from below belong in shallow water and
  cannot be seen at 2.5.
- **Balance stays here.** Today's `{spawnMul .75, enemyDmgMul .75, enemyHpMul .9, xpMul 1.25,
  maxAliveMul .65}` is the book's gentlest cut and this is still slot 2.

## 5. The Twilight (2.5) — mostly a move, and where it is not

**Moves down intact, no design work:** the `Light` resource and its whole `dark` block, the
`shafts` signature, the Pulse, `Sunspear` / `Foxfire` / `Sunlance`, and the Copepod and Krill.

**Does not move, and must be re-cut** — these are all encoded against *slot 2*, not against the
chapter:

- **Palette.** Today's bgColor `0x18567f` / floorTint `0x9fd6f0` is the "brightest it ever gets"
  surface blue. At 2.5 it must land between The Trawl and The Deep on
  `obstacle-contrast.mjs`'s ladder (Shelf 0.210 → Reef 0.150 → Trawl lower → Deep lowest).
  On screen: **the base water goes dim and the shafts stay bright** — the same mechanic reading as
  scarcity rather than abundance, which is the whole point of the move.
- **`formScale`.** A new rung between the Trawl's 1.55 and the Deep's 1.7.
- **Balance.** A step-5 cut, which today's slot-2 numbers are not.
- **`radiusFull`.** Currently `1.0`, a full multiple of the screen's longest side, so the rim is
  off-screen at a full bar. That is right for chapter 2 and probably too generous at 2.5, one
  chapter above a Deep tuned to `0.50` precisely so the corners stay dark. Re-measure; assert the
  **ratio**, never px, and shoot both viewports (this exact value shipped a desktop-only bug once).

So *"a move, not a build"* is true of the mechanic and its arsenal, and not true of the chapter.
Recording that plainly, because the tempting version of this task is to rename the block and
declare it done.

## 6. The roster split, decided on realism

Owner: *"whatever is most realistic."* That gives a cleaner answer than either option originally
offered, and it happens to be the more thematic one too.

| Creature | Goes to | Why |
|---|---|---|
| **Moon Jelly** | **2.2 Shelf** | *Aurelia aurita* is a coastal shallow-water jelly, and moon-jelly blooms are the textbook signal of eutrophic, oxygen-poor, polluted coastal water. It is close to the ideal creature for a pollution chapter. Keeps its `lean: 90` side-on body — it hangs in the water column either way. |
| **Copepod** | **2.5 Twilight** | Diel vertical migration — the largest animal migration on Earth — is what defines the mesopelagic, and it is mostly copepods and krill. |
| **Krill** | **2.5 Twilight** | Same, and krill are its iconic migrator. |

Archetype gaps that follow: 2.2 holds the `tank` (jelly) and needs a `normal` and a `fast`; 2.5
holds `normal` (copepod) and `fast` (krill) and needs a `tank`. Three new creatures either way,
each landing where it is true.

**Candidates, on the same realism test** — for design through the `designing-an-enemy` skill, not
settled here:

- 2.2 `normal`: **Bristle Worm** (*Capitella capitata* is *the* classic organic-pollution
  indicator, thriving in sewage-enriched sediment).
- 2.2 `fast`: **Comb Jelly** (*Mnemiopsis*, famous for taking over polluted, overfished seas).
  Both are genuine pollution-indicator organisms, which makes the whole roster say what the
  chapter is about.
- 2.5 `tank`: **Siphonophore** — the mesopelagic's signature giant, slow and drifting.

Each needs a `ROSTER_LOOKS` entry (run RA guards this, and it must be run over
`Object.keys(CHAPTERS)`, never `CHAPTER_ORDER` — that is book 1 only) and a `bake-cast.mjs` re-bake
for its title-card thumbnail.

## 7. Amendment to §5 — six chapters, five axes

§5 gives each chapter a distinct second job and lists five: **output / sight / survival / mobility
/ perception**. With six chapters, 2.2 (Clarity) and 2.5 (Light) both answer *how far can you see*.

**The amendment: no two ADJACENT chapters share an axis.** 2.2 and 2.5 are separated by the Reef
and the Trawl, and the two are not the same question — 2.2 is sight against **filth you can push
back** (Clear is a burst, and it costs you steady-state radius to fire), 2.5 is sight against
**dark that also slows you**, and 2.6 is sight that is **also your damage** and refills only from
something that bites. Three antagonists asking one question, escalating, which is what a book's
spine should do.

The tension worth watching is 2.4 → 2.5: the Trawl's axis *is* mobility, and the Twilight's dark
carries `speedFloor 0.6`. Keep them distinct by keeping the Trawl's bar a **direct** speed
multiplier and the Twilight's slow a **floor** that only bites near empty. If playtest says they
blur, the Twilight's slow is the one to soften — not the Deep's `speedFloor: 1`, which is that
chapter's deliberate inversion.

## 8. The rename

One rename, `shelf` → `twilight`, then a **new** `CHAPTERS.shelf` authored from scratch. Order
matters: rename first, verify zero chapter-sense `shelf` remains, and only then create the new
one — otherwise the two are indistinguishable mid-sweep.

⚠ **`shelf` is also the title screen's bookcase vocabulary and must not be touched:**
`titleBookshelf`, `spineName`, `shelf.started`, `shelf.volumes`, `shelves`, and the CSS classes
`.shelf-row` / `.shelf-board` / `.shelf-plate` / `.shelf-stars` (`ui.js:314-606, 1053-1055`,
`styles.css`). A blind sweep destroys the title screen. Rename only `CHAPTERS.<id>`, the quoted
literal `'shelf'`, `BIOME_SHELF`, and chapter-keyed table rows.

Harness rules that apply, all from CLAUDE.md:

- Assert a **measured** (`grep -c`) count per replacement and **write nothing** if one misses —
  collect every edit, verify them all, then write, or exit non-zero having touched nothing.
- Repair against `git show HEAD:<file>`, never against memory.
- Afterwards, `git diff -U0 src/config.js | grep -E "name: '|desc: '"` to read every user-facing
  string the rename touched, and grep the old token to zero.

**The Deep's comments explain themselves by pointing at the chapter they borrowed the rig from** —
*"The rig is The Shelf's, shipped and tuned"*, *"radiusFull 0.50 against The Shelf's 1.0"*, *"see
resource.dark in CHAPTERS.shelf"* (`config.js:5603-5678`) — and `test/sim-test.js:19418` (run DP.f)
says *"which is The Shelf's bargain, not this one"*. Every one of those must be re-pointed at The
Twilight, or the file's own explanation becomes a lie that reads as truth.

## 9. Sites to touch

**`src/config.js`** — `BOOKS.undertow.chapters` (six ids, new order); rename `CHAPTERS.shelf` →
`CHAPTERS.twilight` and re-cut its palette/`formScale`/balance/`radiusFull`; author the new
`CHAPTERS.shelf`; `CHAPTER_SPINE` (`:6655`); `CHAPTER_ENDINGS` and `CHAPTER_UNLOCK_LINES`;
`ANOMALIES.sticky.exclude` (`:9398`); the census comment at `:1899`. Also **delete the stale ⚠ at
`:5447`** claiming Longline and Net Toss "are not built" — both have full sim (`sim.js:8536`,
`:8606`) and render (`render.js:10695+`), so the warning currently misinforms anyone scoping the
Trawl.

**`src/sim.js`** — the `ch.clear` button branch in `stepRepulse` (~`:1278`); the three new weapons'
steppers.

**`src/render.js`** — `BIOMES` keys (`:9299`) and a new `BIOME_SHELF` for the murk chapter, with
`BIOME_TWILIGHT` taking today's. A missing `BIOMES` entry falls back to `BIOMES.body`
**silently**, so assert the key set rather than trusting the rename. `refillLook` (`:17509`) gains
the upwelling case. `ROSTER_LOOKS` gains three creatures. The Clear burst needs a tell.

**`src/ui.js`** — nothing structural: the HUD resource rail reads `CHAPTERS[run.chapter].resource`
generically and `STAT_LABEL` is derived from `STAT_KEYS`.

**`src/fr.js`** — keyed by the **English source string**. New keys for The Twilight, the new
Shelf's tagline, `Clarity`, `Clear`, three weapons, three creatures, and any new card copy.
**Player-visible copy containing a number must be a `tt()` template, never an interpolated
string** — the key is the template, and this is the trap that shipped the whole elements redesign
untranslatable. Editing this file by exact-string anchor fails on the NBSP; make the edits with
node. Ask the owner for the French rather than drafting it silently.

**`test/sim-test.js`** — 128 `shelf` sites. The DP.* block asserts The Deep; its prose references
need re-pointing. **Add the guard that makes this self-checking:** one scenario walking
`BOOKS.undertow.chapters` in order and asserting the slot→id map, that `formScale` is strictly
increasing, that floor contrast is strictly decreasing, that every id resolves in `CHAPTERS`, and
that every `BIOMES` key exists. Print the denominator in the PASS line, and mutation-prove it —
reorder the array and it must go red. Extend run XX's copy walk in the same commit and watch it
go red *before* writing the French.

**`scripts/`** — `charge-probe.mjs:53` default chapter; `obstacle-contrast.mjs:38`, which hardcodes
a duplicate of the Shelf's render colours and has rows for neither the Trawl nor the Deep — fix
that first or the ladder audit lies; six `shelf-*.js` scene files to rename plus new scenes for the
murk chapter; `bake-cast.mjs` re-bake.

## 10. Save data — no migration, deliberately

Undertow is `wip: true` and `unlockBook` returns false unless `meta.dev === true`
(`state.js:518`), so **no player save carries Book 2 progress.** A dev save does: after the rename
`meta.chapters.shelf` is read as the new murk chapter's, and `twilight` is created fresh by
`ensureChapterMeta`. `meta` is additive-only, so nothing is deleted.

The cost is re-winning one difficulty ladder on a dev-gated WIP book. That is cheaper than a
one-shot migration needing its own flag to be safe against re-running, on data no player has.
**Stated, not built.**

## 11. Out of scope

The Surf, The Reef, The Trawl and The Deep. §4's silencing bag and the school-of-mackerel, both
still owed to the Trawl. Breakable weak points. The Kraken. Any change to the Deep's tuning.

## 12. Verification

- `npm test` green, plus the new ladder scenario, mutation-proven.
- `node scripts/test-isolation.mjs` — new weapons change how many randoms are drawn.
- `node scripts/obstacle-contrast.mjs` — six rows, and the audit's own hardcoded rows fixed first.
- `node scripts/charge-probe.mjs --chapter shelf` across **both** the spend-policy and the
  movement axes, for the Clear burst's steady-state cost.
- `node scripts/weapon-census.mjs` for the three new weapons, comparing **within one invocation**.
- `scripts/fx-probe.mjs` on both chapters at **two viewports** (390×844 and 1280×800), run
  sequentially — parallel invocations both fail with *"scene never became ready"*.
- The live URL with the dev taps, after `npm run ship`.
