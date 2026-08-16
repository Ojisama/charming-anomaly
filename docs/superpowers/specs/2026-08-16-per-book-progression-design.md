# Per-book permanent progression

**Date:** 2026-08-16
**Status:** design approved (rev 2, after adversarial review), not implemented

## Goal

Permanent progression becomes per-book. Each book has its own coin purse, its own upgrade
levels, and its own level-up card-slot ladder. Unlocking a book grants 100 coins to spend
inside it. Book 1's fortune cannot be carried into Book 2.

Owner rulings (2026-08-16):

- Coins are a **per-book purse**, not a global wallet.
- Every book keeps the **same eight basic upgrade lines**, and **some books add their own**.
- A book unlocks by **winning its predecessor's last chapter at difficulty 3+**.
- The sacrifice ladder buys the **3rd and 4th card slot per book**, plus **book-specific
  unlocks** (Light Thief today, more later).
- `SACRIFICE_COSTS` **stays universal at 20/40**. Book 2 will ship with **5 or 6 chapters**,
  not the 3 currently in `BOOKS.undertow` — which is what pays for the ladder.
- The Surf's opening is gentled: **spawnMul 0.8, xpMul 1.3, 40% fewer tanks**.
- The grant **stays 100 coins**. It is upgrade seed money; not covering a Revive (150) is
  intended.

## Revision history

Rev 1 specified moving `meta.coins` / `meta.shop` / `meta.choiceSlots` / `meta.lightThief`
into `meta.books[bookId]` and **deleting the top-level fields** behind a `SCHEMA` bump.
Adversarial review killed that. Verified by running today's shipped `loadMeta` against a
rev-1-migrated save:

```
input:  runs 137, chapter beyond, lang fr, name "Main", chapters.beyond {unlocked, maxD 5, won 5}
output: runs 0, chapter body, lang en, name "", beyond {"unlocked":false,"maxDifficulty":1}
```

Total wipe, then written back over the slot by the next `saveMeta`. The mechanism is
`state.js:240` — `for (const id of Object.keys(SHOP)) m.shop[id] = …` — throwing when `shop`
is absent, and `state.js:295`'s `catch { /* corrupted save -> fresh */ }` swallowing it.
`importSlot`'s own comment (`state.js:373-379`) names this exact scenario as the wipe it
exists to prevent. Reachable by: a revert, a tab open from before the deploy, an un-updated
device pushing its blob, or `public/sw.js`'s offline shell fallback booting a cached bundle.

It also violates a rule this project already wrote down — **R2**
(`2026-08-04-cross-device-save-sync-tech-strategy.md:124`): *"`meta` changes are additive.
Never rename, never repurpose. A rename is a delete plus an add, and the old build carries
the corpse forward."*

**Rev 2 is additive by construction, and therefore has no migration at all.**

## 1. Save shape

Book 1 keeps the fields it already has. `meta.books` holds **books 2 and up, only**:

```js
// unchanged, still top level — this IS book 1's purse
meta.coins, meta.shop, meta.choiceSlots

// new, additive
meta.unlocks = {}                       // book 1's sacrifice-bought flags (empty today)
meta.books = {
  undertow: { coins: 100, shop: { damage: 0, …, deepLungs: 0, slowBurn: 0, bigGulp: 0 },
              choiceSlots: 2, unlocks: { lightThief: true } },
}
meta.grants = { undertow: true }        // see §3 — monotone, never inferred
```

One accessor, and every read site goes through it:

```js
export const bookMeta = (meta, bookId) =>
  bookId === BOOK_ORDER[0] ? meta : (meta.books?.[bookId] ?? null)
```

For Book 1 it returns `meta` itself, which already carries `.coins`, `.shop` and
`.choiceSlots` under exactly those names; `.unlocks` is the one field added to make the shape
uniform. It is mildly leaky — a caller could reach `bm.runs` — and that is the whole price of
the asymmetry. Everything below is what it buys.

`meta.lightThief` **stays where it is** as Book 1-shaped legacy and is read as
`meta.books.undertow.unlocks.lightThief` going forward; the old field is left in place rather
than deleted (R2), and `loadMeta` copies it forward once if the new location is unset.

### What the asymmetry buys

Rev 1 rejected exactly this shape as "asymmetric, and `bookOf` still has to branch". That was
wrong, because the symmetric shape is not reachable without deleting fields, and deleting
fields wipes saves. Concretely, rev 2 needs **none** of the following, all of which rev 1
required and all of which were defects:

- No `SCHEMA` bump. Old and new builds coexist indefinitely.
- No migration branch, so no fresh-meta-on-throw path to get wrong.
- No `importSlot` change. Every save still carries a top-level `shop`, so the guard at
  `state.js:384` keeps working unmodified and keeps rejecting the four blobs `state.js:374`
  enumerates. (Rev 1's prescribed fix here was backwards: requiring `books` would have refused
  every legitimate blob pushed from an un-updated device and told the player their own save
  was corrupt.)
- No change to `slotSummary` or `saveSummary`. Both read raw, unmigrated blobs by design
  (`state.js:82-89` says so), and both keep reporting Book 1's coins and upgrade count —
  which remains the right "is this my main save" signal. Rev 1's three-level walk would have
  reported **0** for every un-updated slot in the *undismissable* sync conflict modal,
  inviting the player to overwrite their real save.
- No round-trip risk. An old build's `loadMeta` mutates the same object it parsed, so unknown
  keys (`books`, `grants`, `unlocks`) survive `saveMeta` untouched.

There is no `isValidMeta` in this repo — rev 1 invented the name. The function is `importSlot`
(`state.js:380`), and its only caller is `sync.js:154`. There is no `createMeta` either; the
fresh-save literal lives inside `loadMeta` (`state.js:296-315`).

## 2. Config surface

```js
BOOKS.undertow.startCoins = 100          // absent on book1 => 0
export const BOOK_ORDER = ['book1', 'undertow']

export const BOOK_SHOP = { undertow: { deepLungs: {…}, slowBurn: {…}, bigGulp: {…} } }
export const shopLines = (bookId) => ({ ...SHOP, ...(BOOK_SHOP[bookId] ?? {}) })

export const BOOK_UNLOCKS = {
  undertow: { lightThief: { cost: LIGHT_THIEF_COST, icon: '🔦', name: …, desc: … } },
}
```

`SACRIFICE_COSTS = [20, 40]`, `MAX_CHOICE_SLOTS`, `MAX_SHOP_LEVEL` and `SHOP_COST_CAP` stay
universal and unchanged.

**`shopCost` is NOT unchanged — rev 1 said it was, and it throws.** It reads `SHOP[id].base`
(`config.js:3462`); verified, `shopCost('deepLungs', 0)` raises `TypeError`. It must take the
book (or the line object) and read `shopLines(book)[id].base`. It fires the moment Undertow's
shop renders — `main.js:176` (`onBuy`) and `ui.js:1011` (`renderShop`).

**Every consumer reads `shopLines(bookId)`, never `SHOP` directly.** `SHOP` is imported at
`state.js:3`, `main.js:4` and `ui.js:2`, so this contract needs a source-text lint (the
`run UG.k` grep idiom) or it will drift.

### Undertow's three book-specific lines

All three Undertow chapters carry a `resource` block — Humidity (surf, drain 0.3 / refill 20),
Light (shelf, 2.2 / 18), Air (reef, 1.4 / 9). That shared spine is what makes these *book*
lines rather than chapter ones, and none is dead in any chapter of its own book.

| id | name | effect | hook |
|---|---|---|---|
| `deepLungs` | Deep Lungs 🫁 | +8% resource capacity per level | resource `max`, snapshotted at `createRun` |
| `slowBurn` | Slow Burn 🕯️ | −4% resource drain per level | the drain rate applied in `stepSim` |
| `bigGulp` | Big Gulp 💧 | +10% refill per pickup per level | the refill application site |

**Slow Burn is the first REDUCTION line in the game, and the UI cannot render it.**
`formatShopBonus` (`ui.js:129-131`) is `per < 1 ? '+' + round(per*levels*100) + '%' : …` — a
percent-vs-flat discriminator with a hardcoded `+`, not a sign-aware formatter. Stored as
`-0.04` it prints **`+-40%`**; stored as `+0.04` it prints `+40%` for a 40% *reduction*. This
is the sacrifice view's "current → after" preview (`ui.js:922`), the screen where the player
chooses what to destroy. The formatter needs a sign-aware branch and a `reduction: true` flag
on the line, tested in both views.

**Slow Burn's ceiling stays a ship gate.** At Lv10 it is −40% drain; The Shelf drains 2.2/s,
so a maxed player runs it at 1.32/s — enough to flatten the chapter's dark mechanic. The gate
is `scripts/charge-probe.mjs` at Lv0 vs Lv10 across its **three** spend policies (`hoard`,
`full`, `greedy` — `charge-probe.mjs:81-85`; rev 1 said two) and both movement policies. **The
probe needs work before it can be that gate** — see §5.

## 3. Unlock gate and the grant

### The gate is the last chapter, stated explicitly

Rev 1 said "when `nextChapter` returns null, walk `BOOK_ORDER`". That is wrong:
`nextChapter` returns null for **three** different facts — the last chapter of a book, a
`hidden` chapter, and an id no book claims. Verified: `nextChapter('blank') === null` and
`chapterMaxDifficulty('blank') === 3`, which *is* `CHAPTER_UNLOCK_DIFFICULTY`. So the null
check unlocks Book 2 off a **Blank** win, which is not the book's last chapter.

Test the fact directly: `run.chapter === BOOKS[bookOf(run.chapter)].chapters.at(-1)`.

### The grant is an explicit, monotone flag

Rev 1 made the grant a side effect of a purse being *created*, and argued that made
double-granting impossible. It does the opposite — purse existence is not monotone, and all
three reviewers broke it independently:

- Rev 1's own migration step 2 created `books.undertow` (to hold `lightThief`) with no
  `coins` key, so the later grant found an existing entry and repaired `coins` to **0** while
  the banner announced 100.
- Seven-tap dev gate → the carousel appends WIP chapters (`config.js:5634`) → scrolling to
  The Surf makes the title coin badge *render* the purse into existence at 100 → spend it →
  toggle dev off. The real unlock months later finds 0.
- The idiomatic spelling of the fresh-save literal (`Object.fromEntries(BOOK_ORDER.map(…))`,
  mirroring `state.js:298`) grants 100 coins to **every brand-new save**. Rev 1's §7 test 4
  passes under that bug.

So: `meta.grants[bookId]` is set once, in the unlock path only, and the coins are added in the
same statement. It is additive, monotone, and survives a purse being rebuilt by any path.
`ensureBookMeta` becomes a **pure repair** that seeds `coins: 0` and never grants.

The test that catches the fresh-save leak is *"a fresh save has exactly one purse and it is
book1"*, not *"the purse equals startCoins"*.

### Retroactive unlock — required, same commit

`loadMeta` already runs a retroactive chapter-unlock chain (`state.js:257-264`) for exactly
this class of problem; its comment says so. But it iterates `CHAPTER_ORDER` — **Book 1 only**.

With the gate living solely in `endRun`, every existing veteran is **permanently locked out**
on ship day: a player who beat The Beyond at 3+ last month sees nothing, gets no grant, and
has no hint that the requirement is a fight they already won. That includes everyone holding
The Blank, since reaching it requires a Beyond win at 5.

The evidence is already in the save: `chapters.beyond.won >= CHAPTER_UNLOCK_DIFFICULTY`
(stamped at `main.js:437`, backfilled at `state.js:210`). Extend the existing chain to cross
book boundaries, granting through the same monotone path as §3. ~4 lines. It must land with
the gate, not after Book 2 ships — post-hoc it becomes a second grant-timing problem.

### The carousel cannot show another book, and `wip` does not gate what rev 1 thought

`titleChapterList` (`config.js:5617-5636`) filters `CHAPTER_ORDER` (Book 1), takes its "???"
preview from `nextChapter` (book-local, null past `beyond`), and reaches another book through
exactly one line: `if (meta.dev) for (const b of Object.values(BOOKS)) if (b.wip) base.push(…)`.

So removing `wip: true` on ship day makes Undertow **less** reachable, not more — the dev
append stops firing and nothing replaces it. Setting `chapters.surf.unlocked = true` changes
nothing the title screen reads. Rev 1 claimed this seam was already handled; it is not.
`titleChapterList` must be taught to cross the book boundary, and that is part of this work.

## 4. UI

The shop's balance header carries the book name beside the coins (`🪙 100 · Undertow`), or a
returning player reads the reset as a bug.

**`.shop-rows` hardcodes the row count**: `styles.css:267` is
`grid-template-rows: repeat(8, minmax(max-content, 1fr))`. Undertow has 11 lines. Two defects,
not one:

- **Overflow.** At ~39.2px per row, 11 rows need ~477px against `viewportH − 209` available:
  fits at 390×844, overflows by 19px at 375×667, 46px at 360×640 and **118px (about three
  rows below the fold) at 320×568**.
- **A height step even where it fits.** Only 8 rows are `1fr`; rows 9-11 fall into implicit
  `grid-auto-rows: auto`, so at 390×844 rows 1-8 render ~59px and rows 9-11 ~39px. The `--sac`
  variant already knows the fix (`styles.css:1484` uses `grid-auto-rows: minmax(max-content, 1fr)`).

Rev 1 also misquoted the reason for the v6.6 shop redesign: `styles.css:253-256` says the
eight rows were made to fit **without scrolling**; `ui.js:1000-1006` gives horizontal room at
320px as the actual rationale.

The sacrifice view is under *more* pressure than rev 1 claimed, not less: `.sac-targets`
renders whenever there are ≥2 targets (`ui.js:945`), which for Undertow (Light Thief + the
slot ladder) is every real player, where today it is dev-only.

Measure at 320px with an injected style, not `resize_page` — it fails silently below ~500px.

### The browsed chapter and the shop's chapter are not the same thing

`browseChapterId` is a `let` inside `initUI` (`ui.js:285`); `onBuy(id)` / `onSacrifice(picks,
target)` (`main.js:174`, `:292`) cannot see it and can only reach
`bookOf(playableChapterId(meta))`. The two deliberately diverge — `ui.js:622` persists via
`onChapter` only for *available* chapters ("the locked preview only browses"). Within Book 1
they always name the same book, so nothing breaks today. The moment §3's carousel fix
surfaces Book 2's first chapter as a preview card, **the title badge shows Undertow's purse
while `onBuy` spends Book 1's**, silently. Pass the book id through the hook signature.

`renderShop` is also reached from the bottom nav with no chapter argument, so "which book's
shop is this" is answered by whatever the carousel last settled on — including after a run.

## 5. Read-site sweep

Beyond rev 1's list (whose file:line references were all verified accurate), four categories
it missed:

- **`createRun`'s first statement has no chapter.** `state.js:1412` is
  `const maxHP = PLAYER.baseHP + shopBonus(meta, 'maxHP')`; `const chapter =
  resolveChapterId(opts.chapter)` is at `:1443`, **31 lines later**. A book-aware `shopBonus`
  at 1412 is a TDZ `ReferenceError` on every run start. Using `opts.chapter` instead is the
  silent version — it is unvalidated, which is what `resolveChapterId` exists for. Hoist the
  chapter resolution above the first `shopBonus`.
- **Five harness scripts hand-build a flat meta and are outside the test import graph**:
  `charge-probe.mjs:67`/`:179`, `pool-probe.mjs:174-178`, `weapon-census.mjs:88-89`,
  `element-probe.mjs:154-155`, `fx-probe.mjs:109-110`. `charge-probe` does
  `createRun({ ...meta, lightThief: thief }, …)` — once `lightThief` lives in
  `books[b].unlocks` that spread is a **no-op** and the probe prints a full thief/no-thief
  table in which both halves are the no-thief run. §2 makes that probe the gate on Slow Burn.
- **`endRun` must not bank into a purse that may not exist.** `saveMeta` sits at
  `main.js:484`, *after* the bank, and `state.js:355-358` says a throw there takes down the
  Pixi frame loop in the one path that has just banked a run's coins. Guard the bank with
  `ensureBookMeta` at the call site; `?? 0` is not enough, the write must land somewhere.
- **`ui.js:854`** already sums `Object.values(meta.shop)` with no `Number()||0`, where
  `saveSummary:111` has the coercion and says why. Per-book shops multiply that.

`bookOf` returns `null` for an unclaimed id (`config.js:5570`), and `run.chapter` is a
`CHAPTERS` key, not an `ALL_CHAPTER_IDS` key — so `meta.books[null]` is reachable by adding a
chapter and forgetting its `BOOKS` entry. Lint it (§7).

**Daily runs** are Book 1 only (`dailyChapter` → `CHAPTER_ORDER`) and take neither consumables
nor rerolls (`main.js:90-95` bypasses the brief), so there is no spend site. But a daily is
playable on a chapter you have **not unlocked** (`ui.js:1724`, "preview"). If `dailyChapter`
ever widens past Book 1, a preview daily on The Surf reaches `endRun` → a Book 2 purse for a
player who has never beaten The Beyond. The monotone grant flag (§3) is what keeps that from
being a payout; leave a comment saying so.

## 6. The Surf's opening

This change makes surf/d1-at-zero-upgrades the literal first run of a campaign. Measured
today: body d1 runs an effective spawn of 0.30 (balance 0.75 × EARLY_CALM 0.40) at ×2.22 xp;
The Surf runs **0.68 at ×1.0** — 2.3× the spawn rate at 45% of the xp. `EARLY_CALM` covers
body, pond and garden only.

Per the owner ruling:

```js
EARLY_CALM.surf = { spawnMul: 0.8, xpMul: 1.3 }
CHAPTERS.surf.archetypeMul = { tank: 0.6 }     // 40% fewer Shore Crabs
```

`archetypeMul` is the shipped lever — `waveWeights` (`sim.js:696`) multiplies WAVE_TABLE
weights by archetype, and garden (`{tank:0.73}`) and city (`{tank:0.825}`) already use it.
Surf's `tank` is the Shore Crab (`hpMul: 2.2`, flags `unshakeable`/`guard`).

**Assumption stated:** the tank cut is applied **chapter-wide**, at every difficulty, matching
how garden and city declare theirs. Making it difficulty-1-only is not one line —
`sim.js:1440` reads `CHAPTERS[run.chapter].archetypeMul` directly from config and never
consults `createRun`'s `mods`, so a d1 gate means plumbing a new run field through the spawn
path for every chapter. Flag for the owner if d1-only was intended.

Note `CHAPTERS.surf = { ...CHAPTERS.pond, … }` (`config.js:4359`) — it spreads The Pond, and
`config.js:4483` warns that some of its inherited arrays are shared **by reference**. Surf
carries its own `balance` object (verified distinct from pond's), but check before mutating
any inherited field in place.

## 7. Tests

Existing suite: **~100 meta-side lines** need rewriting (57 of 64 `choiceSlots` mentions are
meta-side, plus 18 `coins:` literals, 23 `shop:` literals, 6 `lightThief` lines). Rev 1
budgeted 9 new scenarios and never mentioned this. Because rev 2 leaves Book 1's fields where
they are, **most of those keep working unchanged** — only fixtures that assert Book 2
behaviour need the accessor.

New scenarios, each mutation-proved against a scratch tree (`git archive`, never the working
tree), each asserting an **effect**:

1. **Old-build compatibility** — today's `loadMeta` (extracted at the pre-change ref) reading
   a rev-2 save keeps runs, chapters, lang and coins intact, and round-trips `books`
   untouched. This is the regression that rev 1 shipped; it is the most important test here.
2. **Purse isolation** — earn in `body`, `meta.coins` rises, `books.undertow.coins` does not.
3. **Upgrade isolation** — max `meta.shop.damage`, a `surf` run has `damageMul === 1`.
4. **Slot reset** — `meta.choiceSlots = 4`, a `surf` run deals 2 cards.
5. **Grant is monotone** — a purse created by a UI read holds 0; only the unlock path grants;
   granting twice is a no-op; **a fresh save has exactly one purse and it is book1**.
6. **Gate is the last chapter** — a Blank win at 3 does NOT unlock Book 2; a Beyond win at 3
   does. Mutation: revert to the `nextChapter === null` check.
7. **Retroactive unlock** — a save with `chapters.beyond.won >= 3` and no Undertow entry
   unlocks and grants on load, once.
8. **WIP gate** — a non-dev save winning `beyond` at 3 does not unlock a `wip` book.
9. **`shopLines` merge** — `undertow` has 8 basics + 3; `book1` has exactly 8; `shopCost`
   resolves for every line of every book.
10. **`formatShopBonus` sign** — Slow Burn renders as a reduction in both the shop row and the
    sacrifice preview, with no `+-`.
11. **Lints** — every `Object.keys(CHAPTERS)` id resolves to a book; every `shopLines(b)` id
    has French copy; a source-text grep proving no consumer reads `SHOP` directly.
12. **run XX coverage** — `BOOK_SHOP` and `BOOK_UNLOCKS` are **two levels deep**, so the flat
    table walk (`test/sim-test.js:11700-11702`, `Object.values(table)` → `v?.name`) yields the
    per-book dicts, reads `undefined`, and skips. That is verbatim the WEAPON_MODS hole
    documented eight lines below it — *"every weapon mod in the game was exempt from this
    assert while appearing to be covered by it"*. Use the nested `WEAPON_MODS` idiom.

The unlock banner's copy must live in a **config table** (`CHAPTER_UNLOCK_LINES` or an
equivalent), not as a `tt()` literal in `ui.js` — run XX enumerates tables, so copy in a
function or bare const is exempt by construction, which has shipped untranslated strings four
times.

Run `node scripts/test-isolation.mjs` afterwards.

## 8. Risks and levers

**The cliff is smaller than rev 1 measured, because Book 2 is bigger.** Re-earning the ladder
costs, cheapest-first against the shipped curve: Light Thief 570 coins, the 3rd slot 958, the
3rd+4th together **22,699** — about 23 runs at `COIN_CAP_PER_RUN` 999, and 60 of the 80 levels
the eight-line shop contains. The owner ruled 20/40 stays universal because Undertow will ship
with 5-6 chapters rather than the 3 currently listed in `BOOKS.undertow`. **That chapter count
is load-bearing for this decision** — if Book 2 ships at 3 chapters, revisit.

Undertow's 11 lines also raise its level ceiling from 80 to 110, so `shopFootHtml`'s
`owned/cost` meter (`ui.js:854`) means something different per book. And because sacrifice
picks are cheapest-first, `BOOK_SHOP`'s per-line `base` costs are effectively **the price of
Book 2's card slots** — they are a ladder tuning decision, not just a shop tuning one.

**100 coins buys three or four opening levels** (maxHP 18, magnet 18, damage 24, fireRate 24 =
84; the cheapest remaining purchase is then moveSpeed at **30**, so the last 16 buys nothing).
It does not cover a Revive (150) — ruled intended.

## Out of scope

- Book-specific `SACRIFICE_COSTS` (owner ruling: universal 20/40).
- Any second book-specific unlock beyond Light Thief. `BOOK_UNLOCKS` is the seam.
- A cross-book prestige or carry-over.
- Widening `dailyChapter` past Book 1 (see §5 for what it would require first).
