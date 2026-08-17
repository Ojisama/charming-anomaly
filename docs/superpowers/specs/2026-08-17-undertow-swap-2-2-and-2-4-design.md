# Undertow — swapping chapters 2.2 and 2.4

**Date:** 2026-08-17
**Status:** design, approved in chat, not yet implemented
**Supersedes:** §6.2 of `2026-08-13-book-2-undertow-design.md` (the "Clarity / murk" retint — see §4 below for why it is dropped rather than executed)

---

## 1. The decision

The Shelf and The Trawl **trade positions on Book 2's ladder.** Chapter slots keep their
depth; the chapters that stand in them swap, and both are renamed to fit where they now are.

| Slot | Today | After | Resource | Signature | Button |
|------|-------|-------|----------|-----------|--------|
| 2.1 | The Surf | The Surf | Humidity | `tide` | — |
| **2.2** | **The Shelf** (light) | **The Shelf** (the net) | **Feed** / `tire` | `trawl` | Breach |
| 2.3 | The Reef | The Reef | Air | `air` | — |
| **2.4** | **The Trawl** (the net) | **The Twilight** (light) | **Light** / `dark` | `shafts` | Pulse |
| 2.5 | The Deep | The Deep | Light / `dark` | `dark` (maws) | Scent |

Ids follow the names, per the repo's rename rule: `shelf` → `twilight`, then `trawl` → `shelf`.

**The Deep's code is untouched; its comments are not.** Its config block explains itself by
pointing at the chapter it borrowed its rig from — *"The rig is The Shelf's, shipped and tuned"*,
*"radiusFull 0.50 against The Shelf's 1.0"*, *"see resource.dark in CHAPTERS.shelf"* — and
`test/sim-test.js:19418` (run DP.f) says *"which is The Shelf's bargain, not this one"*. After the
swap every one of those names the wrong chapter. They must be re-pointed at The Twilight in the
same commit, or the file's own explanation becomes a lie that reads as truth.

## 2. Why

Owner, 2026-08-17: *"abyss is light starved, so light related stuff."*

Light-starvation was sitting two chapters from the surface, in the chapter whose own config
comment calls it *"the BRIGHTEST it ever gets"*. That is the wrong end of the book for it.

This is not a new ruling — it is the unexecuted half of an existing one.
`2026-08-13-book-2-undertow-design.md:186-198` already says *"light is the wrong resource for
bright shallow water, and belongs to chapter 5"*, and
`plans/2026-08-13-undertow-chapters-3-5.md:13-19` records that the retint was deliberately
scheduled **last**, because doing it before The Deep existed would have left the game with no
dark chapter at all. The Deep now exists and is fully built (maws, Scent, roster art, runs
DP.a–DP.j). The gate has opened.

Two things fall out for free:

- **Bottom trawling is a continental-shelf industry.** Naming the net chapter *The Shelf* and
  putting it at 2.2 is factually right, and better than today's arrangement, where the net works
  a chapter whose own render comment says *"no bottom in sight"*.
- **The twilight zone is the real oceanographic layer between the sunlit surface and the
  midnight zone.** *The Twilight* at 2.4, immediately above *The Deep*, is the name the water
  column already has.

Both taglines survive the move unchanged and are **more** true at their new depths:
*"the net is not aiming at you"* at 2.2, *"the light only goes down"* at 2.4.

## 3. Why whole chapters move, and not just their parts

A contents-swap is not available. **Each resource is welded to its signature by `refillSpec()`**
(`config.js`), the one function that answers *"where does this chapter's food come from"*:

- `Light` is refilled by standing in **sun shafts** (`signature.shafts`).
- `Feed` is refilled by the **net's wake** (`signature.trawl`) — a burst economy of six passes
  per 300s that the drain of 2.6 was explicitly tuned against (`config.js:5480-5503`).

You cannot hand The Shelf a Feed bar without also handing it the net, and you cannot hand The
Trawl a Light bar without shafts. The resource, the signature, the button that spends the bar,
and the arsenal built around the bar all travel as one unit — so the unit that moves is the
chapter.

The move itself is nearly free, because **nothing in `src/` branches on these chapter ids**.
`refillSpec`, `streamShafts`, `stepCharge`, `stepMaws`, `darkness`, `lightRadius`, `updateDark`,
`updateShafts`/`refillLook`, the HUD resource rail and every weapon dispatch are all data-driven.
The only hardcoded sites are the order array, the bookcase spine labels, one anomaly exclude,
and two `BIOMES` keys.

## 4. What deliberately does NOT change

- **The Deep.** Not touched.
- **The bar stays `Light` in both 2.4 and 2.5.** §6.2 of the Undertow spec called for renaming
  the shallower light chapter's bar to `Clarity` with `murk` as its antagonist. That ruling is
  **dropped, not deferred**: its stated reason was *"light is the wrong resource for **bright
  shallow water**"*, and 2.4 is neither bright nor shallow once the swap lands. What is left of
  the objection is only that two adjacent chapters share a bar name — and they should, because
  they are one arc. The escalation is already built and already sharp:

  | | 2.4 The Twilight | 2.5 The Deep |
  |---|---|---|
  | empty bar | blinds **and** slows (`speedFloor 0.6`) | blinds only (`speedFloor 1`) |
  | full bar | rim off-screen (`radiusFull 1.0`) | corners still dark (`radiusFull 0.50`) |
  | refill | shafts drift **toward** you, 14.2% of the plane | anglerfish maws only, and they bite |
  | kills refill? | yes, 1.5 (shop-gated) | **no** — `killRefill 0` is load-bearing |

  Same resource, getting scarcer as you descend. Renaming 2.4's bar would hide that.
  It also saves a `murk` render pass that does not exist, against a `murk` token already
  in use in `render.js`.

- **Every mechanic.** No weapon, roster entry, signature behaviour, button or balance *system*
  is redesigned. This is a move plus a re-cut of position-encoded numbers.

- **The arsenal keeps its names, and reads better for the move.** Sunspear and Sunlance are not
  contradicted at 2.4: the twilight zone is *defined* as the layer sunlight still reaches while
  fading, which is exactly what the shafts are. Foxfire gains the most — *"a cold fire that barely
  shows in the light and takes hold in the dark"*, a card that scales its radius by `FOXFIRE_GLOOM`
  the darker you are, has spent its whole life in the chapter its own config calls the brightest
  in the book. At 2.4 it finally sits somewhere its text is true.

## 5. The depth re-cut (required, not optional)

Book 2 encodes depth as **monotone ladders across the slot order**, so a swap that carried each
chapter's render block with it would invert them. The governing rule:

> **Depth-encoded fields stay with the SLOT. Identity-encoded fields travel with the CHAPTER.**

**Stay with the slot** (2.2 must be the brightest below the Surf; 2.4 the second-darkest):
`bgColor`, `floorTint`, the floor prop set (`BIOME_*`), `formScale`, `balance`, and the `swell`
block — surface waves seen from below belong at 2.2, under the boat, and cannot be seen at 2.4.

What that means on screen: **the light chapter's base water goes dim at 2.4, and its shafts stay
bright.** Today its blue is the "brightest it ever gets" surface palette; at 2.4 the water is
mid-column and the shafts are what is left of the sun reaching down — the same mechanic reading
as scarcity rather than as abundance, which is the whole point of the move. The `swell` block
travels **to slot 2.2** with its two tints re-cut against the net chapter's palette; it is moved
and re-tuned, never re-authored.

**Travel with the chapter:** `cast` (its own roster art), `tailTint`, `eliteIridescent`, and
`darkTint` — the lightmap's scrim colour, meaningless without a `dark` block.

Four concrete items, each a known defect the swap exposes rather than creates:

1. **`formScale`.** Today: Surf (base) → **Shelf: no `form` at all** → Reef 1.3 → Trawl 1.55 →
   Deep 1.7. The light chapter is the only Book 2 chapter where the player is still the Pond's
   blob — a leftover from it being built as `{...CHAPTERS.pond}`. After the swap it sits at 2.4
   between 1.3 and 1.7, so it **must** gain `form: 'fish'` + `formScale: 1.55`; the net chapter
   drops 1.55 → **1.15**, which is the value the ladder was always written for — `CHAPTERS.trawl`'s
   own render comment states the intended rungs as *"Surf 1.0, Shelf 1.15, Reef 1.3, here 1.55"*,
   so slot 2.2's number already exists and has simply never been used. `playerTint` must go white
   wherever `form` is set (level-up minimes read it directly).
2. **`obstacles`.** The net chapter's `obstacles: null` is a deliberate design statement (open
   water, nothing to hide behind from a hazard that is not aiming at you) and stays correct at
   2.2. The light chapter still inherits **The Pond's** obstacles by reference from its spread —
   wrong at 2.4. Set `null` or cut a mid-water set; `null` is the lazy correct answer unless
   playtest says otherwise.
3. **`balance`.** The light chapter's `{spawnMul .75, enemyDmgMul .75, enemyHpMul .9, xpMul 1.25,
   maxAliveMul .65}` is the book's gentlest cut and belongs at slot 2 → goes to the net chapter.
   The net chapter's `{spawnMul .8, enemyHpMul 1, maxAliveMul .85}` is a step-4 cut → goes to the
   light chapter. Both are then **verified**, not assumed — the net takes a real bite out of the
   crowd on every pass and it is not in that table.
4. **Floor contrast.** Measured with `node scripts/obstacle-contrast.mjs`, not eyeballed. Today
   Shelf 0.210 → Reef 0.150 → Trawl lower → Deep lowest. After the swap the new 2.2 must be
   ≥ 0.210-ish and the new 2.4 must land between the Reef and the Deep. **`obstacle-contrast.mjs:38`
   hardcodes a duplicate of the Shelf's render colours** and has no `trawl`/`deep` row — fix that
   in the same commit or the audit lies.

## 6. The rename, which is the risky part

Two renames, and the second one's **target is the first one's source** — the exact failure mode
CLAUDE.md documents (*"the name you are renaming to is the collision"*). Sequence and gate:

1. `shelf` → `twilight`, chapter-sense occurrences only.
2. **Verify zero chapter-sense `shelf` tokens remain.** Only then:
3. `trawl` → `shelf`.

⚠ **`shelf` is also the title-screen bookcase's vocabulary and must not be touched:**
`titleBookshelf`, `spineName`, `shelf.started`, `shelf.volumes`, `shelves`, and the CSS classes
`.shelf-row` / `.shelf-board` / `.shelf-plate` / `.shelf-stars` (`ui.js:314-606, 1053-1055`,
`styles.css`). A blind sweep destroys the title screen. Rename only: `CHAPTERS.<id>`, the quoted
literals `'shelf'` / `'trawl'`, `BIOME_SHELF` / `BIOME_TRAWL`, and the chapter-keyed table rows.

Harness rules that apply (all from CLAUDE.md, all learned here the hard way):

- Assert a **measured** (`grep -c`) count per replacement, and **do not write any file** if one
  misses. Collect every edit, verify them all, then write — or exit non-zero having touched
  nothing.
- Repair against `git show HEAD:<file>`, never against memory.
- After the sweep, `git diff -U0 src/config.js | grep -E "name: '|desc: '"` to read every
  user-facing string the rename touched, and grep the old tokens to zero.
- Leave verbatim quotations and prose uses of the English words alone.

## 7. Sites to touch

**`src/config.js`** — `BOOKS.undertow.chapters` order; the two `CHAPTERS.*` blocks (name, icon,
tagline, render, balance, obstacles); `CHAPTER_SPINE` (`:6655`); `ANOMALIES.sticky.exclude`
(`:9398`); the census comment at `:1899` (`--chapter shelf`). Also **delete the stale ⚠ at
`:5447`** claiming Longline and Net Toss "are not built" — both have full sim (`sim.js:8536`,
`:8606`) and render (`render.js:10695+`) implementations, so the warning currently misinforms
anyone scoping this chapter.

**`src/render.js`** — `BIOMES` keys (`:9299`, and the `trawl` entry), `BIOME_SHELF`/`BIOME_TRAWL`
const names. A missing `BIOMES` entry falls back to `BIOMES.body` **silently**, so assert the key
set rather than trusting the rename.

**`src/fr.js`** — keyed by the **English source string**, so the French follows the *name*, not
the chapter. Today `'The Shelf': 'Le Large'` (`:1121`) and `'The Trawl': 'Le Chalut'` (`:1142`).
After the swap `'Le Large'` ("the open sea") lands on the net chapter, which it fits; **`'Le
Chalut'` is orphaned and must be deleted**, and `'The Twilight'` needs a French name that does not
exist yet. That is an owner question, not a translation task — draft options and ask, previewing
each in the whole spine/title context. Taglines and roster names travel with their chapters.
Editing this file by exact-string anchor fails on the NBSP — make the edits with node.

**`test/sim-test.js`** — 128 `shelf` sites, 21 `trawl` sites. The DP.* block asserts The Deep and
is untouched. **Add the guard that makes the swap self-checking:** one scenario walking
`BOOKS.undertow.chapters` in order and asserting (a) the slot→id map is what this doc says,
(b) `formScale` is strictly increasing, (c) floor contrast is strictly decreasing, (d) every id
resolves in `CHAPTERS` and every `BIOMES` key exists. Print the denominator in the PASS line.
Mutation-prove it: reorder the array and it must go red.

**`scripts/`** — `charge-probe.mjs:53` default chapter; `obstacle-contrast.mjs:38` hardcoded row;
9 scene files to rename (`shelf-cast`, `shelf-dark`, `shelf-foxfire`, `shelf-foxfire-dark`,
`shelf-sunlance`, `shelf-sunspear`, `trawl-cast`, `trawl-gear`, `trawl-net`) plus their
`--chapter` doc-comments.

## 8. Save data — no migration, deliberately

Undertow is `wip: true`, and `unlockBook` returns false unless `meta.dev === true`
(`state.js:518`). **No player save carries Book 2 progress.** A dev save does: after the rename
`meta.chapters.shelf` (old light-chapter progress) is read as the net chapter's, and
`meta.chapters.trawl` becomes dead bytes. `meta` is additive-only so nothing is deleted, and
`ensureChapterMeta` creates `twilight` fresh on first read.

The cost is re-winning two difficulty ladders on a dev-gated WIP book. That is cheaper than a
one-shot migration, which would need its own flag to be safe against re-running, on data no
player has. **Stated, not built** — the owner's Book 2 ladders reset.

## 9. Out of scope

New art, new weapons, new roster entries, The Deep, the `Clarity`/`murk` retint, the Trawl's
owed school-of-mackerel (§6.4) and drifting bags (§4), breakable weak points, and The Kraken.

## 10. Verification

- `npm test` green, plus the new ladder scenario, mutation-proven.
- `node scripts/test-isolation.mjs` — the rename changes how many randoms are drawn.
- `node scripts/obstacle-contrast.mjs` — the floor ladder is measured, and the audit's own
  hardcoded rows are fixed first.
- `node scripts/weapon-census.mjs` on both chapters at their new balance cuts, comparing within
  one invocation.
- `scripts/fx-probe.mjs` on both chapters **at two viewports** (390x844 and 1280x800) — the
  light chapter's `radiusFull` is stated in screen multiples and has shipped a viewport bug once.
- The live URL with the dev taps, after `npm run ship`.
