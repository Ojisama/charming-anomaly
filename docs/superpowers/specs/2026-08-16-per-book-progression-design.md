# Per-book permanent progression

**Date:** 2026-08-16
**Status:** design approved, not implemented

## Goal

Permanent progression becomes per-book. Each book has its own coin purse, its own upgrade
levels, and its own level-up card-slot ladder. Unlocking a book grants 100 coins to spend
inside it. Book 1's fortune cannot be carried into Book 2.

Owner rulings behind this (2026-08-16):

- Coins are a **per-book purse**, not a global wallet. A shared wallet makes the 100-coin
  grant a rounding error for anyone who has finished Book 1.
- Every book keeps the **same eight basic upgrade lines**, and **some books add their own**.
- A book unlocks by **winning its predecessor's last chapter at difficulty 3+** — the same
  gate every chapter unlock already uses.
- The sacrifice ladder buys the **3rd and 4th card slot per book**, plus **book-specific
  unlocks** (Light Thief today, more later).

## What this replaces

Today all permanent progression is flat and book-agnostic:

| Field | Today | After |
|---|---|---|
| `meta.coins` | one bank | `meta.books[b].coins` |
| `meta.shop` | 8 lines × 10 levels | `meta.books[b].shop` |
| `meta.choiceSlots` | 2..4 globally | `meta.books[b].choiceSlots` |
| `meta.lightThief` | one bool | `meta.books[b].unlocks.lightThief` |

Unchanged and still global: `meta.runs`, `meta.best`, `meta.chapters`, `meta.lang`,
`meta.skillSide`, `meta.dev`, `meta.name`, `meta.schema`.

## 1. Save shape

```js
meta.books = {
  book1:    { coins: 0, shop: { damage: 0, … }, choiceSlots: 2, unlocks: {} },
  undertow: { coins: 100, shop: { damage: 0, …, deepLungs: 0, slowBurn: 0, bigGulp: 0 },
              choiceSlots: 2, unlocks: { lightThief: true } },
}
```

`unlocks` is a bag of sacrifice-bought flags rather than a named field per unlock. That is
the whole reason it exists: "more later" costs a `BOOK_UNLOCKS` row and nothing else — no
new `meta.*` field, no new migration branch, no new `onSacrifice` target string.

`ensureBookMeta(meta, bookId)` mirrors `ensureChapterMeta`: fetches the entry, creating and
repairing it on every load, so a save written before a book existed always resolves. It
seeds `coins` from `BOOKS[bookId].startCoins ?? 0` and fills every line of
`shopLines(bookId)` with 0.

### Why not hoist the active book

The alternative considered and rejected: keep `meta.coins` / `meta.shop` / `meta.choiceSlots`
at the top level as *the current book's* values, and stash inactive books in
`meta.books[id]`, swapping on book change. It preserves all ~40 existing read sites and all
65 test references untouched.

It is rejected because it authors every number in two places and needs a notion of "which
book is hoisted right now" that nothing else in the codebase has. That is precisely the
defect class the architecture audit found to be 28% of everything that reached the live URL
(CLAUDE.md, cross-file contracts). No read site actually needs the hoist: every one of them
already has a chapter in hand, and `bookOf(chapter)` resolves the book from it.

## 2. Config surface

```js
// BOOKS gains one optional field.
BOOKS.undertow.startCoins = 100        // absent on book1 => 0, so a fresh save is unchanged

// Explicit order, for the same reason CHAPTER_ORDER is explicit.
export const BOOK_ORDER = ['book1', 'undertow']

// Extra upgrade lines, merged OVER SHOP per book.
export const BOOK_SHOP = { undertow: { … } }
export const shopLines = (bookId) => ({ ...SHOP, ...(BOOK_SHOP[bookId] ?? {}) })

// Extra sacrifice targets, per book.
export const BOOK_UNLOCKS = {
  undertow: {
    lightThief: { cost: LIGHT_THIEF_COST, icon: '🔦', name: 'Light Thief',
                  desc: 'Kills give back Light …' },
  },
}
```

`SACRIFICE_COSTS = [20, 40]` and `MAX_CHOICE_SLOTS` stay universal — every book re-earns its
3rd and 4th slot on the same ladder. `MAX_SHOP_LEVEL`, `shopCost`, `SHOP_COST_CAP` are
unchanged and apply to book-specific lines too.

**Every consumer reads `shopLines(bookId)`, never `SHOP` directly.** That is the contract
that keeps a book-specific line from being invisible in exactly one place.

### Undertow's three book-specific lines

All three of Undertow's chapters run a resource bar — Humidity (surf), Light (shelf), Air
(reef) — each with `drain` / `refill` / `killRefill` / `max`. That shared spine is what makes
a resource upgrade a *book* line rather than a chapter one, and it means none of the three is
dead in any chapter of its own book.

| id | name | effect | hook |
|---|---|---|---|
| `deepLungs` | Deep Lungs 🫁 | +8% resource capacity per level | resource `max`, snapshotted at `createRun` |
| `slowBurn` | Slow Burn 🕯️ | −4% resource drain per level | the drain rate applied in `stepSim` |
| `bigGulp` | Big Gulp 💧 | +10% refill per pickup per level | the refill application site |

**Slow Burn carries a known ceiling and it is the first thing to measure.** At Lv10 it is
−40% drain; The Shelf's drain is 2.2/s, so a maxed player runs it at 1.32/s. That is enough
to flatten the chapter's entire dark mechanic. The owner chose the line with that stated, so
it ships — but `scripts/charge-probe.mjs` exists to answer exactly this question over real
300s runs, and the implementation plan gates the shipped `perLevel` on running it at Lv0 vs
Lv10 across both its spend policies **and both its movement policies** (the kiting rig lies
about anything that slows you — see the script's header in CLAUDE.md). If the probe says the
chapter degenerates, the knob is `perLevel`, not the line.

`killRefill` stays gated on `unlocks.lightThief` rather than becoming a shop line, unchanged
from today apart from where the flag lives.

## 3. Unlock gate and the 100-coin grant

In `endRun` (main.js), the existing chapter-unlock block already fires on a classic victory
at `run.difficulty >= CHAPTER_UNLOCK_DIFFICULTY`. `nextChapter(run.chapter)` returns null at
the end of a book. When it does, walk `BOOK_ORDER` to the next book instead:

- If the next book exists and its first chapter is not yet unlocked: unlock that chapter and
  `ensureBookMeta` its purse, which seeds `startCoins`.
- Guarded on "not already unlocked", so replaying the win announces nothing — the same idiom
  as the chapter and Blank unlocks sitting beside it.
- **`wip: true` blocks the unlock for a non-dev save.** Undertow is WIP today, so this ships
  invisible to real players and flips on the day Book 2 lands — the same shape as
  `sacTargets()`'s current dev gate on Light Thief.

The summary screen's unlock banner gains a book variant: the book's name plus what the grant
is. New player-visible copy, so it goes through `tt()` with `{coins}` as a placeholder, never
a pre-interpolated string.

The grant is expressed as *seeding a purse that did not exist*, not as `coins += 100` — see
§4 for why that removes the double-grant failure mode entirely.

**What 100 coins buys**, measured against the shipped curve rather than estimated: the first
levels cost maxHP 18, magnet 18, damage 24, fireRate 24, moveSpeed 30, critChance 36,
critDamage 36, coinGain 48. 100 buys three or four of them (18+18+24+24 = 84, and the next
cheapest purchase after that is 34). A seed, not a head start.

## 4. Migration

Bump `SCHEMA`. The migration branch must stamp `m.schema = SCHEMA`, the way the v4→v5 branch
does.

Detected by the absence of `meta.books`:

1. `books.book1 = { coins: m.coins, shop: m.shop, choiceSlots: m.choiceSlots, unlocks: {} }`.
2. `m.lightThief === true` → `books.undertow.unlocks.lightThief = true`. Only dev saves can
   hold this today, but dropping it would silently un-buy a purchase.
3. Delete `m.coins`, `m.shop`, `m.choiceSlots`, `m.lightThief` — the v4→v5 branch's precedent
   for deleting migrated top-level fields.
4. `ensureBookMeta(meta, 'book1')` to repair the entry just built. **Nothing pre-creates a
   purse for a book that is not unlocked** — see below.

`ensureBookMeta` creates on demand, and that is the whole grant mechanism: the first time
anything asks for a book's entry, it is created holding `startCoins`. Locked books are never
asked for (the shop only ever renders the browsed chapter's book, and a locked chapter cannot
be browsed), so a purse comes into existence at the moment of unlock and holds exactly 100.
Making the grant a side effect of *creation* rather than an `+= 100` statement is what makes
double-granting structurally impossible — there is no code path that can run it twice.

R3 (clamp on use, never on load) still holds per book: `loadMeta` floors `choiceSlots` at 2
and preserves a future build's higher value; `createRun` clamps to `MAX_CHOICE_SLOTS`.

### The landmine

`isValidMeta` (state.js:384) rejects any blob whose top-level `shop` is not an object. That
guard is the defense against a truncated save silently wiping the slot — state.js:374
documents `{"coins":5,"chapters":{}}` as a blob that must be rejected. **After this change
there is no top-level `shop`, so every existing save fails validation unless that check moves
to `books` in the same commit.** It must reject a blob with no `books` object, and the
migration path must run before validation or validate the pre-migration shape too.

Two doc sites state the old requirement and drift silently otherwise:

- CLAUDE.md's browser-probing rule, "a seeded save MUST carry `shop: {}`" → `books: {}`, with
  a worked seed shape.
- state.js's `run`/meta doc block (lines 152-161, 904, 1367-1371) names `meta.coins`,
  `meta.shop`, `meta.choiceSlots` and `meta.lightThief` by path.

## 5. Read-site sweep

Every site below has a chapter in hand and resolves its book with `bookOf(chapter)`. Listed
in full rather than summarized, because "and update the call sites" is how one gets missed:

**state.js**
- `shopBonus(meta, id)` → takes a book entry, reads `shopLines(bookId)[id].perLevel`.
- `createRun` — maxHP (1412), speed/magnet/critChance/critDamage/damageMul (1491-95),
  fireRateMul/coinGainMul (1500-01), `choiceSlots` (1487), `killRefill` (1626). It already
  receives `chapter`, so it resolves the book itself.
- `slotSummary` (57) — coins becomes the **sum of every purse**. It is a "which of these is
  my main save" heuristic and a sum keeps that meaning; §7.1 already notes coins run
  backwards as a signal.
- `saveSummary` (104-111) — `upgrades` becomes the sum of levels across every book's shop.
- `loadMeta` numeric coercion (238, 240, 269, 283) moves inside the per-book repair.
- `createMeta` (297-308) — replaces the four flat fields with `books`.

**main.js**
- `onBuy` (174-179) — spends and levels within the browsed chapter's book.
- `onSacrifice` (289-309) — `target` is now `'slot'` or a `BOOK_UNLOCKS` key; validation
  walks `shopLines(book)`; writes `books[b].choiceSlots` or `books[b].unlocks[target]`.
- `endRun` (414) — banks into `books[bookOf(run.chapter)].coins`.
- consumables spend (35-41) and anomaly reroll (140-143) — both in the brief flow, chapter known.
- `onReset` (322) — full wipe, every book.

**ui.js**
- `formatShopBonus` (126-130) — `shopLines(book)[id]`.
- title coin badge (647) — the **browsed chapter's** book purse, so browsing The Surf shows
  Undertow's 100.
- brief-sheet affordability (471), anomaly reroll affordability + badge (1785, 1794).
- `sacTargets` (819-825) — reads `BOOK_UNLOCKS[book]` plus the universal slot ladder; the
  hardcoded `thief` branch and its `meta.dev` gate are replaced by the book's own WIP gate.
- `shopFootHtml` (854), `sacrificeViewHtml` rows (909-910), `renderShop` (985, 1008-1012),
  balance header (1034), sacrifice handler (2505).

**Daily runs** draw from `dailyChapter`, which is `CHAPTER_ORDER` (Book 1 only), so a daily
banks into `book1`. No special case needed; worth one comment so it is not re-derived.

## 6. UI

The shop screen must say **which book's purse this is**, or a returning player reads the
reset as a bug. The balance header carries the book name beside the coins: `🪙 100 · Undertow`.
One line, and it is the whole affordance.

**Undertow's shop is 11 rows, not 8.** The v6.6 shop redesign exists because eight rows
already scrolled on a small phone. 11 must be measured at 320px before it is called done —
and per CLAUDE.md, `resize_page` fails silently below ~500px, so the check is an injected
style constraining the screen and `.modal` to 320/294px with `innerWidth` read back, not a
devtools resize. The sacrifice view filters to owned lines, so it is under less pressure.

## 7. Tests

New scenarios in `test/sim-test.js`, each mutation-proved against a scratch tree (never the
working tree — extract with `git archive`), and each asserting an **effect**, not that a field
moved:

1. **Purse isolation** — earn in `body`, assert `books.book1.coins` rose and
   `books.undertow.coins` did not. Mutation: bank into a fixed book.
2. **Upgrade isolation** — max `book1.shop.damage`, `createRun` on a `surf` chapter, assert
   `damageMul === 1`. This is the one that proves the reset is real.
3. **Slot reset** — `book1.choiceSlots = 4`, assert a `surf` run deals 2 cards.
4. **Unlock + grant fires once** — win `beyond` at 3 twice; `undertow` unlocked, purse is
   exactly `startCoins`, second win changes nothing. Mutation: drop the already-unlocked
   guard, and separately make the grant additive.
5. **WIP gate** — a non-dev save winning `beyond` at 3 does *not* unlock a `wip` book.
6. **Migration** — a flat pre-schema save produces the right `book1` entry, moves
   `lightThief` into `undertow.unlocks`, and leaves no top-level `shop`/`coins`.
7. **`isValidMeta`** — the truncated blobs state.js:374 enumerates are still rejected under
   the new shape, and a valid migrated save is accepted.
8. **`shopLines` merge** — `undertow` has all 8 basics plus its 3; `book1` has exactly 8.
9. **run XX coverage** — `BOOK_SHOP` and `BOOK_UNLOCKS` join the config-table walk, and the
   unlock banner's `tt()` template joins the placeholder-parity check. Watch it go red before
   writing the French (CLAUDE.md: copy outside a config table has shipped untranslated four
   times).

Run `node scripts/test-isolation.mjs` afterwards — this changes how many randoms several
scenarios draw.

## 8. Risks and levers

**The cliff.** A player finishing Book 1 at 8×Lv10 with 4 card slots enters The Surf with
zero and 2 slots. That is the requested design and it is right for a fresh campaign, but it
only feels good if Undertow is tuned as a chapter-1 ladder rather than as a continuation of
The Beyond. The lever is `BOOKS.undertow.startCoins`; the measurement is a mortal + kiting
probe of surf/1 at 0 upgrades against body/1 at 0 upgrades, which is the honest comparison.

**Slow Burn's ceiling**, §2 — gated on `charge-probe.mjs` before the `perLevel` is fixed.

**Coin economy per book.** `COIN_CAP_PER_RUN`, `runBonusCoins` and `DIFFICULTY_COIN_PER_LEVEL`
are unchanged and shared. Undertow's three chapters therefore fill their purse at Book 1's
rate, which is the intended behaviour — the reset is about the starting point, not the income.

## Out of scope

- Retuning Undertow's difficulty ladder for a zero-upgrade opening.
- Book-specific *card slot* costs (`SACRIFICE_COSTS` stays universal).
- Any second book-specific unlock beyond Light Thief. `BOOK_UNLOCKS` is the seam; filling it
  is a later change.
- A cross-book prestige or carry-over of any kind.
