# Per-Book Permanent Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each book its own coin purse, upgrade levels and card-slot ladder, granting 100 coins when a book unlocks.

**Architecture:** Purely **additive** to the save. Book 1 keeps the top-level `meta.coins` / `meta.shop` / `meta.choiceSlots` it already has; `meta.books` holds books 2+ only; `meta.grants` records the coin grant monotonically. One accessor, `bookMeta(meta, bookId)`, returns `meta` itself for Book 1 and `meta.books[id]` otherwise. No migration, no `SCHEMA` bump, no field deletion — an old build reads Book 1 where it always was and round-trips the keys it does not understand.

**Tech Stack:** Vanilla JS (ES modules), PixiJS v8, Vite. Tests are plain node `assert` scenarios in `test/sim-test.js` — no framework.

**Spec:** `docs/superpowers/specs/2026-08-16-per-book-progression-design.md` (rev 2). Read it before Task 1; every task argues from it.

## Global Constraints

- **NEVER delete or rename a `meta` field.** R2, `docs/superpowers/specs/2026-08-04-cross-device-save-sync-tech-strategy.md:124`. Rev 1 of this spec did, and it wiped saves. Additions only.
- **Do not bump `SCHEMA`.** Old and new builds must coexist.
- **Balance numbers live in `config.js` and nowhere else.** A magic number in `sim.js` is a bug.
- **New player-visible copy goes in a config TABLE**, never a bare const or a function — run XX enumerates tables only. Add French to `src/fr.js` in the same task.
- **`src/fr.js` cannot be edited by exact-string match on lines containing `: ; ! ?`** — French uses U+00A0 there. Anchor on a line with no French punctuation, or edit via node.
- **Never put a backtick inside a double-quoted zsh argument** (`node -e "…"`, `git commit -m "…"`). Write the content to a file and run/`-F` it.
- **Do not choose a version number.** These are all `chore:` commits on the working branch. `npm run ship` is not part of this plan.
- Test filter while iterating: `node test/sim-test.js <name>` matches the scenario FUNCTION name. Full `npm test` before the final commit.
- After any task that changes how many randoms are drawn: `node scripts/test-isolation.mjs`.

## File Structure

| File | Responsibility in this change |
|---|---|
| `src/config.js` | `BOOK_ORDER`, `startCoins`, `BOOK_SHOP`, `shopLines`, `ALL_SHOP_LINES`, `BOOK_UNLOCKS`, `BOOK_UNLOCK_LINES`, book-aware `shopCost`, Surf's opening balance |
| `src/state.js` | `bookMeta`, `ensureBookMeta`, book-aware `shopBonus`, `createRun` per-book snapshot, retroactive book unlock in `loadMeta` |
| `src/main.js` | `endRun` bank + unlock gate + grant; `onBuy` / `onSacrifice` / consumables / reroll routed to a book |
| `src/ui.js` | book-scoped shop + sacrifice screens, sign-aware `formatShopBonus`, shop header book name |
| `src/sim.js` | the three Undertow resource upgrades |
| `src/styles.css` | `.shop-rows` row count |
| `src/fr.js` | French for every new string |
| `test/sim-test.js` | new scenario `runBookProgression` + additions to `runBooks` |
| `scripts/*.mjs` | five probes that hand-build a flat meta |

---

### Task 1: Config foundation — book tables and a total `shopCost`

**Files:**
- Modify: `src/config.js:3442-3476` (the meta-shop block), `src/config.js:3505-3518` (BOOKS)
- Test: `test/sim-test.js` (new scenario `runBookProgression`)

**Interfaces:**
- Consumes: nothing.
- Produces: `BOOK_ORDER: string[]`, `BOOK_SHOP: Record<bookId, Record<lineId, ShopLine>>`, `shopLines(bookId: string) => Record<lineId, ShopLine>`, `BOOK_UNLOCKS: Record<bookId, Record<unlockId, {cost:number, icon:string, name:string, desc:string}>>`, and `shopCost(id, level)` keeping its **existing two-argument signature**.

A `ShopLine` is `{ name, desc, perLevel, base, icon, reduction? }` — the existing `SHOP` entry shape plus an optional `reduction: true` for lines whose `perLevel` is a decrease (Task 6 uses it).

`shopCost` deliberately keeps its signature. It resolves against a module-level merge of every book's lines, so **no call site changes** (`main.js:176`, `ui.js:1011`). The cost of that is that line ids must be globally unique; Step 1 asserts it.

- [ ] **Step 1: Write the failing test**

Add to `test/sim-test.js`, near `runBooks` (~line 4440). Register it with `run(runBookProgression)` alongside the other `run(...)` calls:

```js
function runBookProgression() {
  // (a) Every book resolves a line table; book-specific lines merge OVER the universal eight.
  const b1 = shopLines('book1')
  const ut = shopLines('undertow')
  assert.strictEqual(Object.keys(b1).length, Object.keys(SHOP).length,
    'book1 has exactly the eight universal lines — BOOK_SHOP.book1 must not exist')
  for (const id of Object.keys(SHOP)) assert.ok(ut[id], `undertow is missing universal line '${id}'`)
  for (const id of ['deepLungs', 'slowBurn', 'bigGulp']) {
    assert.ok(ut[id], `undertow is missing its own line '${id}'`)
    assert.ok(!b1[id], `book1 must NOT see undertow's line '${id}'`)
  }

  // (b) Line ids are globally unique. shopCost resolves against ONE merged table so its
  // signature never had to change, and that is only sound while ids cannot collide.
  const seen = new Map()
  for (const bookId of BOOK_ORDER) {
    for (const [id, line] of Object.entries(shopLines(bookId))) {
      const prev = seen.get(id)
      if (prev && prev !== line) assert.fail(`shop line id '${id}' is defined differently in two books — shopCost cannot resolve it`)
      seen.set(id, line)
    }
  }

  // (c) shopCost resolves for EVERY line of EVERY book at every level, and stays finite.
  // Before this change it read SHOP[id].base and threw a TypeError on any book-specific line.
  for (const bookId of BOOK_ORDER) {
    for (const id of Object.keys(shopLines(bookId))) {
      for (let lv = 0; lv < MAX_SHOP_LEVEL; lv++) {
        const c = shopCost(id, lv)
        assert.ok(Number.isFinite(c) && c > 0, `shopCost('${id}', ${lv}) must be a positive finite number, got ${c}`)
      }
    }
  }

  // (d) Every line carries the fields the shop screen reads, or it renders blank.
  for (const bookId of BOOK_ORDER) {
    for (const [id, line] of Object.entries(shopLines(bookId))) {
      for (const f of ['name', 'desc', 'perLevel', 'base', 'icon']) {
        assert.ok(line[f] !== undefined, `shop line '${id}' is missing '${f}'`)
      }
    }
  }

  // (e) Only books after the first grant coins, and BOOK_ORDER matches BOOKS.
  assert.deepStrictEqual(BOOK_ORDER, Object.keys(BOOKS), 'BOOK_ORDER must list every book, in order')
  assert.ok(!BOOKS[BOOK_ORDER[0]].startCoins, 'the first book must NOT grant startCoins — a fresh save opens at 0')
  assert.strictEqual(BOOKS.undertow.startCoins, 100, 'undertow grants 100 coins on unlock')

  // (f) Every BOOK_UNLOCKS entry is a real sacrifice target shape.
  for (const [bookId, table] of Object.entries(BOOK_UNLOCKS)) {
    assert.ok(BOOK_ORDER.includes(bookId), `BOOK_UNLOCKS names unknown book '${bookId}'`)
    for (const [id, u] of Object.entries(table)) {
      for (const f of ['cost', 'icon', 'name', 'desc']) {
        assert.ok(u[f] !== undefined, `BOOK_UNLOCKS.${bookId}.${id} is missing '${f}'`)
      }
      assert.ok(Number.isInteger(u.cost) && u.cost > 0, `BOOK_UNLOCKS.${bookId}.${id}.cost must be a positive integer`)
    }
  }
  console.log(`PASS run BK (book tables): ${BOOK_ORDER.length} books, ${seen.size} distinct shop lines, shopCost total over all of them`)
}
```

Add `BOOK_ORDER, BOOK_SHOP, shopLines, BOOK_UNLOCKS, BOOKS, MAX_SHOP_LEVEL, shopCost, SHOP` to the `config.js` import list at the top of `test/sim-test.js` if any are missing.

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/sim-test.js bookprogression`
Expected: FAIL — `shopLines is not defined` (or `not a function`).

- [ ] **Step 3: Write minimal implementation**

In `src/config.js`, add `startCoins` to Undertow and `BOOK_ORDER` beneath `BOOKS` (~line 3511):

```js
  undertow: { name: 'Undertow', chapters: ['surf', 'shelf', 'reef'], hidden: [], wip: true, startCoins: 100 },
}
// Explicit, for the same reason CHAPTER_ORDER is explicit: a sweep that means "every book, in
// campaign order" must not depend on object key order surviving an edit. The FIRST entry is the
// book whose purse lives at the top level of meta (see bookMeta in state.js).
export const BOOK_ORDER = ['book1', 'undertow']
```

Then, immediately after the `SHOP` / `MAX_SHOP_LEVEL` block (~line 3452), add:

```js
// ---- Book-specific upgrade lines (v7.x) --------------------------------------------
// Every book gets the eight lines in SHOP. A book may add its own on top. Undertow's three all
// act on the RESOURCE BAR, which is what makes them book lines rather than chapter ones: all
// three of its chapters run one (Humidity/Light/Air), so none of them is dead in its own book.
//
// `reduction: true` marks a line whose perLevel is a DECREASE. formatShopBonus (ui.js) reads it —
// without it, -0.04 renders as "+-40%".
export const BOOK_SHOP = {
  undertow: {
    deepLungs: { name: 'Deep Lungs', desc: '+8% resource capacity', perLevel: 0.08, base: 20, icon: '🫁' },
    slowBurn:  { name: 'Slow Burn',  desc: '-4% resource drain',    perLevel: 0.04, base: 30, icon: '🕯️', reduction: true },
    bigGulp:   { name: 'Big Gulp',   desc: '+10% refill per pickup', perLevel: 0.10, base: 25, icon: '💧' },
  },
}
// The line table for one book. EVERY consumer goes through this — never SHOP directly, or a
// book-specific line is invisible in exactly one place. Run BK's source-text lint guards it.
export const shopLines = (bookId) => ({ ...SHOP, ...(BOOK_SHOP[bookId] ?? {}) })
// Every line in the game, for the lookups that are book-agnostic (shopCost). Line ids are
// globally unique — run BK asserts it — which is what lets shopCost keep its two-arg signature
// and spares ~6 call sites.
const ALL_SHOP_LINES = Object.assign({}, SHOP, ...Object.values(BOOK_SHOP))
```

Change `shopCost` (~line 3462) to read the merged table:

```js
export const shopCost = (id, level) => Math.min(
  SHOP_COST_CAP[id] ?? SHOP_COST_CAP_DEFAULT,
  Math.round(ALL_SHOP_LINES[id].base * Math.pow(1.6, level) * (1.2 + 1.8 * (level / (MAX_SHOP_LEVEL - 1)))),
)
```

Add `BOOK_UNLOCKS` next to `SACRIFICE_COSTS` (~line 3470). Move Light Thief's copy here from `ui.js:819-823` — leave `LIGHT_THIEF_COST` where it is and reference it:

```js
// Sacrifice targets that belong to ONE book, alongside the universal card-slot ladder. This is
// the seam for "more later": a new permanent unlock is a row here plus a read in state.js, not a
// new meta field and a new onSacrifice branch. Keyed by book, then by the flag it sets in
// bookMeta(meta, book).unlocks.
export const BOOK_UNLOCKS = {
  undertow: {
    lightThief: {
      cost: LIGHT_THIEF_COST, icon: '🔦', name: 'Light Thief',
      desc: 'Kills give back Light — sacrifice {cost} upgrade levels (no coin refund).',
    },
  },
}
```

`LIGHT_THIEF_COST` is declared at `config.js:6080`, *below* this point. A `const` referenced inside an object literal must already be initialized, so **either** move `LIGHT_THIEF_COST` up beside `SACRIFICE_COSTS` (preferred — `HUMIDITY_DMG_FLOOR` at `config.js:3525` is the existing precedent for exactly this) **or** declare `BOOK_UNLOCKS` after line 6080. Take the precedent.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/sim-test.js bookprogression`
Expected: PASS, printing `PASS run BK (book tables): 2 books, 11 distinct shop lines, …`

Then confirm nothing else broke: `npm run test:fast`

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/sim-test.js
git commit -m "chore: book shop-line and unlock tables, with a total shopCost"
```

---

### Task 2: `bookMeta` / `ensureBookMeta` and per-book run snapshots

**Files:**
- Modify: `src/state.js` (add accessors near `shopBonus` at `:413-416`; `createRun` at `:1411-1501`, `:1626`)
- Test: `test/sim-test.js` (`runBookProgression`)

**Interfaces:**
- Consumes: `BOOK_ORDER`, `shopLines` (Task 1).
- Produces:
  - `bookMeta(meta, bookId) => object | null` — Book 1 returns `meta` itself.
  - `ensureBookMeta(meta, bookId) => object` — pure repair, creates with `coins: 0`. **Never grants.**
  - `shopBonus(bm, id)` — now takes a *book entry*, not `meta`.

**The trap this task exists to avoid:** `createRun`'s first statement is `const maxHP = PLAYER.baseHP + shopBonus(meta, 'maxHP')` at `state.js:1412`, and `const chapter = resolveChapterId(opts.chapter)` is at `state.js:1443` — **31 lines later**. Making `shopBonus` book-aware without moving the chapter resolution up is a TDZ `ReferenceError` on every run start. Do not reach for `opts.chapter` instead: it is unvalidated, which is the whole reason `resolveChapterId` exists.

- [ ] **Step 1: Write the failing test**

Append to `runBookProgression`:

```js
  // (g) bookMeta: book 1 IS the meta (its fields never moved — R2); other books nest.
  const m = makeMeta()
  m.chapters = {}
  assert.strictEqual(bookMeta(m, 'book1'), m, 'bookMeta(meta, book1) returns meta itself — book 1 keeps its top-level fields')
  assert.strictEqual(bookMeta(m, 'undertow'), null, 'an absent purse reads null, it is not conjured by a read')

  // (h) ensureBookMeta is a PURE REPAIR. It never grants — that is the unlock path's job (Task 3).
  const ut = ensureBookMeta(m, 'undertow')
  assert.strictEqual(ut.coins, 0, 'ensureBookMeta creates a purse at ZERO — creation must not be a payout')
  assert.strictEqual(ut.choiceSlots, 2, 'a new book starts at 2 card slots')
  assert.deepStrictEqual(ut.unlocks, {}, 'a new book has no unlocks')
  for (const id of Object.keys(shopLines('undertow'))) {
    assert.strictEqual(ut.shop[id], 0, `new purse must carry line '${id}' at 0`)
  }
  ut.coins = 55
  assert.strictEqual(ensureBookMeta(m, 'undertow').coins, 55, 'ensureBookMeta REPAIRS IN PLACE — it must not rebuild the entry')

  // (i) A future build's unknown line and unknown BOOK survive the repair (R3: clamp on use,
  // never on load). Rebuilding the map instead of repairing it would delete both.
  m.books.undertow.shop.futureLine = 7
  m.books.someBook3 = { coins: 12, shop: {}, choiceSlots: 3, unlocks: {} }
  ensureBookMeta(m, 'undertow')
  assert.strictEqual(m.books.undertow.shop.futureLine, 7, "a future build's shop line must survive the repair")
  assert.strictEqual(m.books.someBook3.coins, 12, "a future build's whole BOOK must survive the repair")

  // (j) UPGRADE ISOLATION — the reset is real. This is the assertion the whole design is for.
  const rich = makeMeta()
  rich.shop.damage = MAX_SHOP_LEVEL          // book 1 maxed
  rich.chapters = { surf: { unlocked: true, maxDifficulty: 1, difficulty: 1, best: { time: 0, kills: 0 } } }
  const b1run = createRun(rich, { chapter: 'body' })
  const utrun = createRun(rich, { chapter: 'surf' })
  assert.ok(b1run.player.damageMul > 1, 'book 1 upgrades apply in a book 1 chapter')
  assert.strictEqual(utrun.player.damageMul, 1, "book 1's damage upgrade must NOT apply in an Undertow chapter")

  // (k) SLOT RESET — 4 slots in book 1 does not deal 4 cards in book 2.
  rich.choiceSlots = MAX_CHOICE_SLOTS
  assert.strictEqual(createRun(rich, { chapter: 'body' }).choiceSlots, MAX_CHOICE_SLOTS, 'book 1 keeps its slots')
  assert.strictEqual(createRun(rich, { chapter: 'surf' }).choiceSlots, 2, 'a book 2 run resets to 2 card slots')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/sim-test.js bookprogression`
Expected: FAIL — `bookMeta is not defined`.

- [ ] **Step 3: Write minimal implementation**

In `src/state.js`, replace `shopBonus` (`:413-416`) and add the accessors above it:

```js
// The one place that knows where a book's progression lives. Book 1's purse is the top-level
// meta.coins/meta.shop/meta.choiceSlots it has always used — NOT moved, because R2 forbids
// deleting a field an older build reads (see the spec's revision history: rev 1 moved them and
// wiped every save that a pre-change bundle touched). Books 2+ nest under meta.books.
//
// It returns `meta` itself for book 1, which is mildly leaky — a caller could reach bm.runs —
// and that leak is the entire price of never migrating anything.
export const bookMeta = (meta, bookId) =>
  bookId === BOOK_ORDER[0] ? meta : (meta.books?.[bookId] ?? null)

// Creates and repairs, mirroring ensureChapterMeta — but note it is NOT swept over every book on
// load, and it NEVER grants coins. The 100-coin grant is an explicit, monotone act of the unlock
// path (main.js); tying it to creation makes every accidental read a payout.
// Repairs IN PLACE, keyed by id: rebuilding the map would delete a future build's book or line
// (R3 — clamp on use, never on load).
export function ensureBookMeta(meta, bookId) {
  if (bookId === BOOK_ORDER[0]) {
    meta.unlocks ??= {}
    return meta
  }
  meta.books ??= {}
  const entry = (meta.books[bookId] ??= { coins: 0, shop: {}, choiceSlots: 2, unlocks: {} })
  entry.coins = Number(entry.coins) || 0
  entry.shop = (entry.shop && typeof entry.shop === 'object' && !Array.isArray(entry.shop)) ? entry.shop : {}
  for (const id of Object.keys(shopLines(bookId))) entry.shop[id] = Number(entry.shop[id]) || 0
  entry.choiceSlots = Math.max(2, Number(entry.choiceSlots) || 2)
  entry.unlocks = (entry.unlocks && typeof entry.unlocks === 'object' && !Array.isArray(entry.unlocks)) ? entry.unlocks : {}
  return entry
}

// Effective permanent multipliers/bonuses from ONE BOOK's shop levels. The book id is passed
// explicitly rather than stashed on the entry: bookMeta returns `meta` itself for book 1, so a
// `_bookId` field would be written onto the save blob.
function shopBonus(bm, bookId, id) {
  return (shopLines(bookId)[id]?.perLevel ?? 0) * (bm.shop?.[id] ?? 0)
}
```

In `createRun`, hoist the chapter resolution **above** the first `shopBonus` call. Move `const chapter = resolveChapterId(opts.chapter)` from `:1443` to the top of the function, then:

```js
export function createRun(meta, opts = {}) {
  // Hoisted above every shopBonus call: the book decides which purse those bonuses come from,
  // and shopBonus at the old first-statement position ran 31 lines before `chapter` existed.
  const chapter = resolveChapterId(opts.chapter)
  const bookId = bookOf(chapter) ?? BOOK_ORDER[0]
  const bm = ensureBookMeta(meta, bookId)
  const maxHP = PLAYER.baseHP + shopBonus(bm, bookId, 'maxHP')
```

Replace every remaining `shopBonus(meta, X)` in `createRun` (`:1491-1501`) with `shopBonus(bm, bookId, X)`, and the `choiceSlots` line (`:1487`):

```js
    choiceSlots: Math.max(2, Math.min(MAX_CHOICE_SLOTS, Number(bm.choiceSlots) || 2)),
```

and `killRefill` (`:1626`):

```js
    killRefill: bm.unlocks?.lightThief === true ? (CHAPTERS[chapter].resource?.killRefill ?? 0) : 0,
```

Delete the now-duplicate `const chapter = …` at the old `:1443` site. Import `BOOK_ORDER`, `shopLines`, `bookOf` from `config.js`.

**`bookOf(chapter) ?? BOOK_ORDER[0]`** is deliberate: `run.chapter` is a `CHAPTERS` key, not an `ALL_CHAPTER_IDS` key, so an orphan chapter would otherwise index `meta.books[null]`. Task 10 lints that no orphan exists; this is the belt.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/sim-test.js bookprogression`
Expected: PASS.

Then: `npm test` (full — `createRun` is on every scenario's path), and `node scripts/test-isolation.mjs`.

- [ ] **Step 5: Commit**

```bash
git add src/state.js test/sim-test.js
git commit -m "chore: per-book run snapshots via bookMeta/ensureBookMeta"
```

---

### Task 3: The unlock gate, the monotone grant, and retroactive unlock

**Files:**
- Modify: `src/main.js:439-455` (`endRun`'s chapter-unlock block), `src/state.js:257-264` (`loadMeta`'s retroactive chain)
- Test: `test/sim-test.js` (`runBookProgression`)

**Interfaces:**
- Consumes: `ensureBookMeta` (Task 2), `BOOK_ORDER`, `BOOKS` (Task 1).
- Produces: `grantBook(meta, bookId) => boolean` in `state.js` — returns true only the first time; `meta.grants[bookId]` is the record.

**Three things rev 1 got wrong, all fixed here:**

1. The gate was `nextChapter(run.chapter) === null`. That is true for **three** different facts — a book's last chapter, a `hidden` chapter, and an unclaimed id. `nextChapter('blank') === null` and `chapterMaxDifficulty('blank') === 3 === CHAPTER_UNLOCK_DIFFICULTY`, so a **Blank** win at 3 unlocked Book 2. Test the fact directly.
2. The grant was a side effect of a purse being created. Purse existence is not monotone: a UI read creates it early (burning the grant), and a fresh-save literal that builds every book grants 100 coins to everyone. Record the grant.
3. There is no retroactive unlock, so on ship day every veteran who already beat The Beyond at 3+ is locked out forever.

- [ ] **Step 1: Write the failing test**

Append to `runBookProgression`:

```js
  // (l) THE GATE IS THE LAST CHAPTER, stated as a fact — not "nextChapter returned null", which
  // is also true of The Blank (hidden, and its ladder tops out at exactly CHAPTER_UNLOCK_DIFFICULTY).
  assert.strictEqual(nextChapter('blank'), null, 'precondition: The Blank has no next chapter')
  assert.strictEqual(chapterMaxDifficulty('blank'), CHAPTER_UNLOCK_DIFFICULTY,
    'precondition: a Blank win at its cap sits exactly at the book-unlock difficulty — this is why a null check is not enough')
  assert.strictEqual(isBookFinale('beyond'), true, "The Beyond is book 1's finale")
  assert.strictEqual(isBookFinale('blank'), false, 'The Blank is HIDDEN — winning it must not unlock the next book')
  assert.strictEqual(isBookFinale('reef'), true, "The Reef is Undertow's finale")
  assert.strictEqual(isBookFinale('pond'), false, 'a mid-ladder chapter is not a finale')

  // (m) THE GRANT IS MONOTONE. Creating a purse pays nothing; granting twice pays once.
  const g = makeMeta(); g.chapters = {}
  ensureBookMeta(g, 'undertow')
  assert.strictEqual(bookMeta(g, 'undertow').coins, 0, 'a purse that exists but was never granted holds 0')
  assert.strictEqual(grantBook(g, 'undertow'), true, 'the first grant fires')
  assert.strictEqual(bookMeta(g, 'undertow').coins, 100, 'the grant is BOOKS.undertow.startCoins')
  assert.strictEqual(grantBook(g, 'undertow'), false, 'the second grant is a no-op')
  assert.strictEqual(bookMeta(g, 'undertow').coins, 100, 'granting twice must not pay twice')
  // ...and it survives the purse being spent to zero, which "creation is the grant" could not.
  bookMeta(g, 'undertow').coins = 0
  assert.strictEqual(grantBook(g, 'undertow'), false, 'a spent purse must not re-grant')

  // (n) A FRESH SAVE HAS EXACTLY ONE PURSE, and it is book 1. This is the assertion that catches
  // a fresh-meta literal that helpfully builds every book — which would hand 100 free coins to
  // every new player and still pass a "purse === startCoins" test.
  const fresh = makeMeta()
  assert.ok(!fresh.books || Object.keys(fresh.books).length === 0,
    'a fresh save must not pre-create any book 2+ purse')
  assert.ok(!fresh.grants || Object.keys(fresh.grants).length === 0, 'a fresh save has granted nothing')
```

Then a second block for the retroactive chain, which needs `loadMeta` and therefore the localStorage stub the suite already uses for save tests (copy the pattern from the `loadMeta` scenario around `test/sim-test.js:4171`):

```js
  // (o) RETROACTIVE UNLOCK. A veteran beat The Beyond at 3+ BEFORE Undertow shipped. endRun can
  // only fire on a live victory, so without this every existing player is locked out on ship day
  // — including everyone holding The Blank, which requires a Beyond win at 5. loadMeta already
  // runs exactly this chain for CHAPTERS (state.js:257) and its comment says why.
  const vet = {
    schema: 1, coins: 4200, shop: {}, choiceSlots: 4, runs: 137, chapter: 'beyond', lang: 'fr',
    best: { time: 300, kills: 4000 },
    chapters: { beyond: { unlocked: true, maxDifficulty: 5, difficulty: 5, won: 5 } },
  }
  const loaded = loadMetaFrom(vet)   // helper: stub localStorage with this blob, call loadMeta()
  assert.strictEqual(loaded.grants?.undertow, true, 'a Beyond win at 3+ already in the save grants Undertow on load')
  assert.strictEqual(bookMeta(loaded, 'undertow').coins, 100, 'the retroactive grant pays exactly once')
  assert.strictEqual(loaded.chapters.surf?.unlocked, true, "Undertow's first chapter unlocks retroactively")
  // Idempotent across loads — the flag, not the purse, is what stops the second payout.
  bookMeta(loaded, 'undertow').coins = 0
  const twice = loadMetaFrom(loaded)
  assert.strictEqual(bookMeta(twice, 'undertow').coins, 0, 'reloading must not re-grant')

  // A player who never finished book 1 gets nothing.
  const rookie = { schema: 1, coins: 0, shop: {}, runs: 3, chapters: { body: { unlocked: true, maxDifficulty: 2, difficulty: 1, won: 1 } } }
  const r = loadMetaFrom(rookie)
  assert.ok(!r.grants?.undertow, 'a player who has not beaten the finale at 3+ gets no grant')
  assert.ok(!r.chapters.surf?.unlocked, 'and no Undertow unlock')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/sim-test.js bookprogression`
Expected: FAIL — `isBookFinale is not defined`.

- [ ] **Step 3: Write minimal implementation**

In `src/config.js`, beside `nextChapter` (~`:5580`):

```js
// Is this chapter the LAST rung of its book's ladder? The book-unlock gate tests this rather than
// `nextChapter(id) === null`, which is ALSO true of a hidden chapter and of an id no book claims.
// The Blank is the live counter-example: nextChapter('blank') is null and its ladder caps at 3,
// which is exactly CHAPTER_UNLOCK_DIFFICULTY, so a null check unlocks the next book off a Blank win.
export const isBookFinale = (id) => {
  const chapters = BOOKS[bookOf(id)]?.chapters ?? []
  return chapters.length > 0 && chapters[chapters.length - 1] === id
}
// The book after this one on the shelf, or null.
export const nextBook = (bookId) => BOOK_ORDER[BOOK_ORDER.indexOf(bookId) + 1] ?? null
```

In `src/state.js`, beside `ensureBookMeta`:

```js
// The 100-coin welcome, recorded rather than inferred. meta.grants[bookId] is monotone and
// additive: it survives the purse being spent, rebuilt, or created early by an incidental read.
// Returns true only on the payout, so callers can gate the announcement on the grant itself.
export function grantBook(meta, bookId) {
  meta.grants ??= {}
  if (meta.grants[bookId]) return false
  const amount = BOOKS[bookId]?.startCoins ?? 0
  meta.grants[bookId] = true
  if (amount > 0) ensureBookMeta(meta, bookId).coins += amount
  return true
}

// Unlock a book: its first chapter, plus the grant. Idempotent. Refuses a WIP book unless the
// save is a dev save, which is what keeps Book 2 invisible until it ships.
export function unlockBook(meta, bookId) {
  if (!bookId || (BOOKS[bookId]?.wip === true && meta.dev !== true)) return false
  const first = BOOKS[bookId].chapters[0]
  const chMeta = ensureChapterMeta(meta, first)
  const granted = grantBook(meta, bookId)
  if (chMeta.unlocked && !granted) return false
  chMeta.unlocked = true
  return true
}
```

In `src/main.js`'s `endRun`, extend the existing chapter-unlock block (`:439-451`). **Order matters: bank the run's coins before unlocking**, so the win that opens Book 2 pays into Book 1 where it was earned:

```js
    const next = nextChapter(run.chapter)
    if (next) {
      const nextMeta = ensureChapterMeta(meta, next)
      if (!nextMeta.unlocked) {
        nextMeta.unlocked = true
        unlockedChapter = CHAPTERS[next].name
        unlockedChapterId = next
      }
    } else if (isBookFinale(run.chapter)) {
      // No next chapter AND this is the book's finale: open the next book. Not a bare
      // `!next` test — that is also true of The Blank (see isBookFinale in config.js).
      const nb = nextBook(bookOf(run.chapter))
      if (nb && unlockBook(meta, nb)) {
        unlockedBook = BOOKS[nb].name
        unlockedBookCoins = BOOKS[nb].startCoins ?? 0
      }
    }
```

Declare `let unlockedBook = null; let unlockedBookCoins = 0` beside `unlockedChapter`, and pass both into the summary payload the way `unlockedChapter` already is.

Also change the coin bank (`main.js:414`) to route to the run's book:

```js
  ensureBookMeta(meta, bookOf(run.chapter) ?? BOOK_ORDER[0]).coins += earned
```

`ensureBookMeta` at the call site, not `?? 0` — `saveMeta` sits at `main.js:484`, *after* this, and `state.js:355-358` warns that a throw here takes down the Pixi frame loop in the one path that has just banked a run's coins. The write must land somewhere real.

In `src/state.js`'s `loadMeta`, after the existing retroactive chapter chain (`:263`):

```js
      // Retroactive BOOK unlock, exactly the same argument as the chapter chain above: a book
      // that shipped AFTER the player already beat the previous book's finale at
      // CHAPTER_UNLOCK_DIFFICULTY+ unlocks on load, because endRun could not unlock a book that
      // did not exist yet. Without this, every veteran is locked out of Book 2 permanently —
      // including everyone holding The Blank, which requires a Beyond win at 5.
      for (let i = 1; i < BOOK_ORDER.length; i++) {
        const prevFinale = BOOKS[BOOK_ORDER[i - 1]].chapters.at(-1)
        const prev = m.chapters?.[prevFinale]
        const beat = Math.max(Number(prev?.won) || 0, (Number(prev?.maxDifficulty) || 1) - 1)
        if (beat >= CHAPTER_UNLOCK_DIFFICULTY) unlockBook(m, BOOK_ORDER[i])
      }
```

`maxDifficulty - 1` is the fallback for saves written before `won` existed: `maxDifficulty` is the level *unlocked*, so having unlocked N means having won N-1. `state.js:210` backfills `won` for The Beyond already.

Add the `loadMetaFrom(blob)` helper to the test file beside `makeMeta`, stubbing `globalThis.localStorage` with the blob under `charming-anomaly-save-v1` and calling `loadMeta()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/sim-test.js bookprogression`
Expected: PASS.

**Mutation-prove three of these** against a scratch tree — extract with `git archive HEAD src | tar -x -C /tmp/mut`, edit *there*, never the working tree:
1. Replace `isBookFinale(run.chapter)` with `true` → test (l)/(o) must fail (the Blank case).
2. Make `grantBook` add coins before checking the flag → test (m) must fail.
3. Delete the retroactive loop → test (o) must fail.

Each mutation must be **distinct** and express its pathology; two mutations that are the same edit under different labels prove nothing.

- [ ] **Step 5: Commit**

```bash
git add src/config.js src/state.js src/main.js test/sim-test.js
git commit -m "chore: book unlock gate on the finale, monotone grant, retroactive unlock"
```

---

### Task 4: Old-build compatibility regression test

**Files:**
- Test: `test/sim-test.js` (`runBookProgression`)

**Interfaces:** Consumes everything from Tasks 1-3. Produces nothing.

This is the regression that rev 1 of the spec shipped, and it is the single most important test in this plan. It asserts the whole architecture: the save stays readable by a build that predates it.

- [ ] **Step 1: Write the failing test**

```js
  // (p) OLD-BUILD COMPATIBILITY. The entire architecture is "additive, so no migration". This is
  // the assertion that says so. Rev 1 of the spec moved book 1's fields into meta.books and
  // deleted the originals; today's shipped loadMeta reading such a save produced runs 137 -> 0,
  // The Beyond unlocked -> LOCKED, fr -> en, name erased — and saveMeta then wrote that over the
  // slot. Reachable by a revert, a tab open from before the deploy, an un-updated device pushing
  // its blob, or sw.js's offline shell booting a cached bundle.
  const rev2Save = {
    schema: 1, runs: 137, chapter: 'beyond', lang: 'fr', name: 'Main',
    coins: 4200, shop: { damage: 10, fireRate: 10, maxHP: 10 }, choiceSlots: 4,
    best: { time: 300, kills: 4000 },
    chapters: { beyond: { unlocked: true, maxDifficulty: 5, difficulty: 5, won: 5 } },
    unlocks: {}, grants: { undertow: true },
    books: { undertow: { coins: 100, shop: { damage: 3, slowBurn: 2 }, choiceSlots: 2, unlocks: { lightThief: true } } },
  }
  // (p1) Book 1 is exactly where an old build looks for it.
  for (const f of ['coins', 'choiceSlots', 'shop']) {
    assert.ok(Object.hasOwn(rev2Save, f), `top-level '${f}' must still exist — R2 forbids moving it`)
  }
  const back = loadMetaFrom(rev2Save)
  assert.strictEqual(back.coins, 4200, "book 1's coins survive a load")
  assert.strictEqual(back.runs, 137, 'runs survive')
  assert.strictEqual(back.lang, 'fr', 'language survives')
  assert.strictEqual(back.chapters.beyond.unlocked, true, 'chapter unlocks survive')
  assert.strictEqual(back.shop.damage, 10, "book 1's shop levels survive")
  // (p2) And book 2's state survives a round trip through a build that knows nothing about it.
  assert.strictEqual(back.books.undertow.coins, 100, "book 2's purse survives")
  assert.strictEqual(back.books.undertow.shop.slowBurn, 2, "book 2's own shop line survives")
  assert.strictEqual(back.books.undertow.unlocks.lightThief, true, "book 2's unlock survives")
  assert.strictEqual(back.grants.undertow, true, 'the grant record survives')
```

- [ ] **Step 2: Run test to verify it fails**

Temporarily delete `coins` from `rev2Save` to prove (p1) has teeth, run
`node test/sim-test.js bookprogression`, see it fail, then restore it.

- [ ] **Step 3: Write minimal implementation**

None — Tasks 1-3 already satisfy this by construction. If it does not pass, the architecture is wrong, not the test. **Stop and re-read the spec's revision history before changing anything.**

- [ ] **Step 4: Verify against the ACTUAL old build**

The in-suite test uses this build's `loadMeta`. Prove it against the real thing:

```bash
git archive <the-commit-before-Task-1> src | tar -x -C /tmp/oldbuild
```

Then write a throwaway script that stubs `localStorage` with `rev2Save`, imports `/tmp/oldbuild/src/state.js`, calls `loadMeta()` and `saveMeta()`, and asserts the same facts. **Assert the extracted tree really is the old code** (grep it for `bookMeta` and expect zero hits) — pointed at the wrong ref, this compares HEAD against itself and prints reassuring passes.

Delete the throwaway script afterwards and confirm with `git status --short`.

- [ ] **Step 5: Commit**

```bash
git add test/sim-test.js
git commit -m "chore: regression test that a book-2 save stays readable by an older build"
```

---

### Task 5: main.js purchase hooks routed to a book

**Files:**
- Modify: `src/main.js:35-41` (consumables), `:140-143` (anomaly reroll), `:174-179` (`onBuy`), `:289-309` (`onSacrifice`), `:322` (`onReset`)
- Modify: `src/ui.js` — hook call sites, to pass the book id
- Test: `test/sim-test.js`

**Interfaces:**
- Consumes: `bookMeta`, `ensureBookMeta` (Task 2), `BOOK_UNLOCKS`, `shopLines` (Task 1).
- Produces: `onBuy(id, bookId)`, `onSacrifice(picks, target, bookId)` — both gain a trailing book id. `target` is `'slot'` or a `BOOK_UNLOCKS` key.

**Why the signature changes:** `browseChapterId` is a `let` inside `initUI` (`ui.js:285`); `main.js` cannot see it and can only guess `bookOf(playableChapterId(meta))`. Those two deliberately diverge — `ui.js:622` persists via `onChapter` only for *available* chapters, so a locked preview browses without persisting. Inside Book 1 they always name the same book, so nothing breaks today; the moment Task 7 surfaces Book 2's first chapter as a preview card, the title badge would show Undertow's purse while `onBuy` spent Book 1's, silently. Pass it explicitly.

- [ ] **Step 1: Write the failing test**

`main.js` is not importable headless, so assert against it as **source text** — the `run UG.k` idiom (`test/sim-test.js` greps `render.js` to prove a declared hook is forwarded). Append to `runBookProgression`:

```js
  // (q) The purchase hooks must take a book id. A defaulted book is the silent-wrong-purse bug:
  // ui.js's browseChapterId and meta.chapter deliberately diverge (ui.js:622 persists only for
  // AVAILABLE chapters), so main.js cannot recover which book the player is looking at.
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.match(mainSrc, /onBuy\s*\(\s*id\s*,\s*bookId\s*\)/, 'onBuy must take an explicit bookId')
  assert.match(mainSrc, /onSacrifice\s*\(\s*picks\s*,\s*target[^)]*,\s*bookId[^)]*\)/, 'onSacrifice must take an explicit bookId')
  assert.doesNotMatch(mainSrc, /meta\.shop\[/, 'main.js must not index meta.shop directly — it goes through bookMeta')
  assert.doesNotMatch(mainSrc, /meta\.coins\s*[-+]=/, 'main.js must not mutate meta.coins directly — it goes through bookMeta')

  const uiSrc = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8')
  assert.match(uiSrc, /onBuy\([^)]*,\s*shopBookId\(\)\)/, 'ui.js must pass its browsed book to onBuy')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/sim-test.js bookprogression`
Expected: FAIL on the `onBuy` signature match.

- [ ] **Step 3: Write minimal implementation**

`src/main.js` — `onBuy`:

```js
  onBuy(id, bookId) {
    const bm = ensureBookMeta(meta, bookId)
    const level = bm.shop[id] ?? 0
    const cost = shopCost(id, level)
    if (level >= MAX_SHOP_LEVEL || bm.coins < cost) return false
    bm.coins -= cost
    bm.shop[id] = level + 1
    saveMeta(meta)
    return true
  },
```

`onSacrifice` — `target` is now `'slot'` or a `BOOK_UNLOCKS[bookId]` key:

```js
  onSacrifice(picks, target = 'slot', bookId = BOOK_ORDER[0]) {
    const bm = ensureBookMeta(meta, bookId)
    const slots = bm.choiceSlots ?? 2
    let cost
    if (target === 'slot') cost = sacrificeCost(slots)
    else cost = bm.unlocks?.[target] === true ? null : BOOK_UNLOCKS[bookId]?.[target]?.cost
    if (cost == null) return false
    const lines = shopLines(bookId)
    let offered = 0
    for (const [id, count] of Object.entries(picks)) {
      if (!lines[id] || !Number.isInteger(count) || count < 0 || count > (bm.shop[id] ?? 0)) return false
      offered += count
    }
    if (offered !== cost) return false
    for (const [id, count] of Object.entries(picks)) bm.shop[id] -= count
    if (target === 'slot') bm.choiceSlots = slots + 1
    else (bm.unlocks ??= {})[target] = true
    saveMeta(meta)
    return true
  },
```

Consumables (`:35-41`) and the anomaly reroll (`:140-143`) both run in the brief flow, where the chapter is known — resolve `const bm = ensureBookMeta(meta, bookOf(chapterBeingPlayed))` and swap `meta.coins` for `bm.coins`.

`onReset` keeps wiping everything (it already writes a whole fresh meta); confirm the fresh meta carries no `books`/`grants` — Task 3's test (n) covers it.

In `src/ui.js`, add near `browseChapterId`:

```js
  // Which book's shop is on screen. The shop is reached from the bottom nav with no chapter
  // argument, so it follows whatever the carousel last settled on — which is also what the coin
  // badge reads, so the two can never disagree.
  const shopBookId = () => bookOf(browseChapterId) ?? BOOK_ORDER[0]
```

and pass `shopBookId()` at every `onBuy` / `onSacrifice` call site.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/sim-test.js bookprogression`, then `npm run test:fast`.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/ui.js test/sim-test.js
git commit -m "chore: route shop purchases and sacrifices through an explicit book"
```

---

### Task 6: The shop and sacrifice screens, per book

**Files:**
- Modify: `src/ui.js:126-131` (`formatShopBonus`), `:647` (coin badge), `:471` (brief affordability), `:805-845` (`sacTargets`), `:854` (`shopFootHtml`), `:909-910`, `:985`, `:1008-1012`, `:1034`, `:1785`, `:1794`, `:2505`
- Modify: `src/styles.css:267`
- Test: `test/sim-test.js`

**Interfaces:** Consumes `shopLines`, `BOOK_UNLOCKS` (Task 1), `bookMeta` (Task 2), `shopBookId` (Task 5).

- [ ] **Step 1: Write the failing test**

```js
  // (r) A REDUCTION line must not render "+-40%". formatShopBonus is a percent-vs-flat
  // discriminator (per < 1) with a hardcoded '+', and Slow Burn is the game's first decrease.
  // This is the sacrifice view's "now -> after" preview — the screen where you choose what to
  // destroy — so a wrong sign there is a wrong decision.
  const uiSrc2 = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8')
  assert.match(uiSrc2, /reduction/, 'formatShopBonus must know about reduction lines')
  assert.doesNotMatch(uiSrc2, /`\+\$\{Math\.round\(per \* levels \* 100\)\}%`/,
    'the hardcoded + in formatShopBonus must be sign-aware')

  // (s) Every book-specific line has a French name AND desc. run XX walks config TABLES, and
  // BOOK_SHOP/BOOK_UNLOCKS are two levels deep — the flat walk reads .name off the per-book dict,
  // gets undefined, and SKIPS. That is verbatim the WEAPON_MODS hole documented beside it.
  for (const [bookId, table] of Object.entries(BOOK_SHOP)) {
    for (const [id, line] of Object.entries(table)) {
      assert.ok(FR[line.name], `BOOK_SHOP.${bookId}.${id}.name ('${line.name}') has no French`)
      assert.ok(FR[line.desc], `BOOK_SHOP.${bookId}.${id}.desc ('${line.desc}') has no French`)
    }
  }
  for (const [bookId, table] of Object.entries(BOOK_UNLOCKS)) {
    for (const [id, u] of Object.entries(table)) {
      assert.ok(FR[u.name], `BOOK_UNLOCKS.${bookId}.${id}.name ('${u.name}') has no French`)
      assert.ok(FR[u.desc], `BOOK_UNLOCKS.${bookId}.${id}.desc has no French`)
    }
  }

  // (t) .shop-rows must not hardcode 8 — Undertow has 11 lines.
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.doesNotMatch(css, /grid-template-rows:\s*repeat\(8,/,
    '.shop-rows hardcodes 8 rows; Undertow has 11 and rows 9-11 fall into grid-auto-rows at a different height')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/sim-test.js bookprogression`
Expected: FAIL on the `reduction` match.

- [ ] **Step 3: Write minimal implementation**

`formatShopBonus` (`ui.js:126-131`):

```js
  // A line's total bonus at a given level, formatted the way its shop-row desc reads. `reduction`
  // lines (Slow Burn) store a POSITIVE perLevel and display as a decrease — storing -0.04 instead
  // would render "+-40%" here and invert the `per < 1` percent test one line down.
  function formatShopBonus(bookId, id, levels) {
    const line = shopLines(bookId)[id]
    const per = line.perLevel
    const sign = line.reduction ? '-' : '+'
    return per < 1 ? `${sign}${Math.round(per * levels * 100)}%` : `${sign}${Math.round(per * levels)}`
  }
```

`sacTargets` — replace the hardcoded Light Thief branch and its `meta.dev` gate with the book's own table. The WIP gate now does that job: an Undertow target can only be reached by browsing an Undertow chapter, which requires the book unlocked, which requires dev while `wip`.

```js
  function sacTargets(bookId) {
    const bm = bookMeta(meta, bookId) ?? ensureBookMeta(meta, bookId)
    const out = []
    for (const [id, u] of Object.entries(BOOK_UNLOCKS[bookId] ?? {})) {
      if (bm.unlocks?.[id] === true) continue
      out.push({ id, cost: u.cost, icon: u.icon, label: t(u.name), short: t(u.name), desc: tt(u.desc, { cost: u.cost }) })
    }
    const slots = bm.choiceSlots ?? 2
    const slotCost = sacrificeCost(slots)
    if (slotCost != null) {
      const nth = slots === 2 ? t('3rd') : t('4th')
      out.push({
        id: 'slot', cost: slotCost, icon: '🩸',
        label: tt('{nth} upgrade slot', { nth }), short: tt('{nth} slot', { nth }),
        desc: tt('Unlock the {nth} upgrade slot — sacrifice {cost} upgrade levels (no coin refund).', { nth, cost: slotCost }),
      })
    }
    return out.sort((a, b) => a.cost - b.cost)   // cheapest first, as today
  }
```

Every remaining `meta.shop` / `meta.coins` / `meta.choiceSlots` read in `ui.js` becomes `bookMeta(meta, shopBookId())`, and every `Object.entries(SHOP)` becomes `Object.entries(shopLines(shopBookId()))`. The coin badge (`:647`) and the shop balance (`:1034`) read the browsed book's purse.

Add the book's name to the shop balance header so the reset does not read as a bug:

```js
      <header class="shop-head">
        <span class="shop-balance">🪙 <b>${bm.coins}</b></span>
        <span class="shop-book">${t(BOOKS[shopBookId()].name)}</span>
      </header>
```

`src/styles.css:267`:

```css
  grid-auto-rows: minmax(max-content, 1fr);
```

replacing `grid-template-rows: repeat(8, minmax(max-content, 1fr));`. This is the fix the `--sac` variant already uses at `styles.css:1484`. It removes the height step; it does **not** stop 11 rows overflowing a short screen — see Step 4.

Add the French for the three lines, Light Thief's name/desc, and the book name to `src/fr.js`. **Do not anchor an edit on a line containing `: ; ! ?`** — those carry U+00A0.

- [ ] **Step 4: Run test to verify it passes, then measure the layout**

Run: `node test/sim-test.js bookprogression`, then `npm run test:fast`.

Then measure 11 rows for real. The devtools window will not resize below ~500px and `resize_page` fails **silently** (it reports success; `innerWidth` still reads 500), so inject a style constraining the screen and `.modal` to 320/294px and read `innerWidth` back before trusting it. Build a throwaway `harness.html` at the repo root importing `ui.js` + `state.js` + `config.js` with stubbed hooks — `ui.js` is Pixi-free by contract, so it renders with no app boot.

11 rows need ~477px against `viewportH − 209` available: expect a fit at 390×844 and an overflow of ~19px at 375×667, ~46px at 360×640 and ~118px at 320×568. Confirm `.shop-rows` scrolls rather than clipping, and that the sacrifice view still fits with `.sac-targets` present (it now renders for every Undertow player, where today it is dev-only).

Delete `harness.html` and verify with `git status --short`.

- [ ] **Step 5: Commit**

```bash
git add src/ui.js src/styles.css src/fr.js test/sim-test.js
git commit -m "chore: book-scoped shop and sacrifice screens, sign-aware bonus formatting"
```

---

### Task 7: Let the title carousel cross books

**Files:**
- Modify: `src/config.js:5617-5636` (`titleChapterList`)
- Test: `test/sim-test.js` (`runBooks`)

**Interfaces:** Consumes `BOOK_ORDER`, `nextBook` (Tasks 1, 3).

**The bug:** `titleChapterList` filters `CHAPTER_ORDER` (Book 1 only) and takes its "???" preview from `nextChapter`, which is book-local and null past `beyond`. The only line that reaches another book is `if (meta.dev) … if (b.wip)`. So on the day `wip: true` is removed, the dev append stops firing and **nothing replaces it** — Undertow becomes unreachable for players *and* for dev, while the summary banner cheerfully announces it.

- [ ] **Step 1: Write the failing test**

Append to `runBooks`:

```js
  // (c) The carousel must follow an unlocked book. Removing `wip` from a book is what SHIPS it,
  // and before this the only line that surfaced another book's chapters was gated on `wip` —
  // so shipping made Book 2 LESS reachable, not more.
  const shipped = { ...BOOKS, undertow: { ...BOOKS.undertow, wip: false } }
  const withBook2 = {
    dev: false,
    chapters: {
      ...Object.fromEntries(CHAPTER_ORDER.map((id) => [id, { unlocked: true, maxDifficulty: 3 }])),
      surf: { unlocked: true, maxDifficulty: 1 },
    },
  }
  const list = titleChapterList(withBook2, shipped)
  assert.ok(list.includes('surf'), 'an unlocked Undertow chapter must appear on the title carousel')
  assert.ok(list.includes('beyond'), 'book 1 chapters are still listed')
  assert.ok(!list.includes('reef'), 'a LOCKED chapter of the new book must not be listed as playable')
  // The "???" tease crosses the boundary too: book 1 finished, book 2 not yet unlocked.
  const onCusp = { dev: false, chapters: Object.fromEntries(CHAPTER_ORDER.map((id) => [id, { unlocked: true, maxDifficulty: 3 }])) }
  const cuspList = titleChapterList(onCusp, shipped)
  assert.ok(cuspList.includes('surf'), "the next BOOK's first chapter shows as the ??? preview once book 1's ladder is done")
  // A player mid-book-1 sees nothing of book 2.
  const early = { dev: false, chapters: { body: { unlocked: true, maxDifficulty: 1 } } }
  assert.ok(!titleChapterList(early, shipped).some((id) => BOOKS.undertow.chapters.includes(id)),
    'a player who has not finished book 1 must see no Undertow chapter at all')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/sim-test.js books`
Expected: FAIL — `surf` is absent from the list.

- [ ] **Step 3: Write minimal implementation**

Rewrite `titleChapterList` to walk `BOOK_ORDER`. Take `books = BOOKS` as an injectable second parameter so the test can simulate a shipped Undertow without editing config:

```js
export function titleChapterList(meta, books = BOOKS) {
  const base = []
  for (const bookId of BOOK_ORDER) {
    const b = books[bookId]
    if (!b || (b.wip && !meta.dev)) continue
    const unlocked = b.chapters.filter((id) => meta.chapters?.[id]?.unlocked)
    base.push(...unlocked)
    // One "???" tease per book: the next rung of THIS book's ladder.
    const locked = b.chapters[unlocked.length]
    if (unlocked.length > 0 && locked && !meta.chapters?.[locked]?.unlocked) base.push(locked)
    // A WIP book behind the dev gate shows its whole ladder, as before.
    if (b.wip && meta.dev) base.push(...b.chapters.filter((id) => !base.includes(id)))
  }
  if (!base.length) base.push(CHAPTER_ORDER[0])
  // The Blank: outside every ladder, appended explicitly (unchanged from v5.24).
  if (meta.chapters?.blank?.unlocked) base.push('blank')
  else if (meta.chapters?.beyond?.maxDifficulty >= MAX_DIFFICULTY) base.push('blank')
  return base
}
```

Verify the existing `runBooks` and `run T` carousel assertions still pass — this function has ~40 existing assertions against it.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/sim-test.js books`, then `node test/sim-test.js chapter`, then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/sim-test.js
git commit -m "chore: title carousel follows every unlocked book, not just book 1"
```

---

### Task 8: Repair the five probe scripts

**Files:**
- Modify: `scripts/charge-probe.mjs:67`, `:179`; `scripts/pool-probe.mjs:174-178`; `scripts/weapon-census.mjs:88-89`; `scripts/element-probe.mjs:154-155`; `scripts/fx-probe.mjs:109-110`

**Interfaces:** Consumes `ensureBookMeta`, `grantBook` (Tasks 2-3).

`scripts/` is **not in the test import graph**, so `npm test` proves nothing here — the check is running each script. `charge-probe.mjs` does `createRun({ ...meta, lightThief: thief }, …)`; once `lightThief` lives in `books[b].unlocks` that spread is a **no-op** and the probe prints a full thief/no-thief table in which both halves are the same run. Task 9 makes that probe a ship gate, so it must be honest first.

- [ ] **Step 1: Confirm the breakage before fixing it**

```bash
node scripts/charge-probe.mjs --chapter shelf
```
Expected today: a table whose `thief` and `no-thief` rows are identical (or near-identical within seed noise). Record the numbers — that is the "before".

- [ ] **Step 2: Fix the meta builders**

In each script, replace the hand-built flat meta's book-relevant fields with a call through the real accessors. For `charge-probe.mjs`, the meta literal at `:67` and the `createRun` at `:179`:

```js
// Probe metas are hand-built and never pass through loadMeta, so they must construct the book
// shape the same way the game does — a bare spread of `lightThief` has been a silent no-op since
// the unlock moved into books[b].unlocks.
const bookOfChapter = bookOf(CHAPTER)
function probeMeta({ thief = false, shopLevel = 0 } = {}) {
  const meta = { coins: 0, shop: {}, choiceSlots: 2, best: {}, runs: 0, chapters: {}, dev: true }
  ensureChapterMeta(meta, CHAPTER)
  meta.chapters[CHAPTER].unlocked = true
  const bm = ensureBookMeta(meta, bookOfChapter)
  if (thief) bm.unlocks.lightThief = true
  for (const id of Object.keys(shopLines(bookOfChapter))) bm.shop[id] = shopLevel
  return meta
}
```

and call `createRun(probeMeta({ thief }), { chapter: CHAPTER, difficulty: DIFFICULTY })`.

- [ ] **Step 3: Add the shop-level axis charge-probe needs to be a gate**

Task 9 gates Slow Burn on Lv0 vs Lv10. The probe has no upgrade-level parameter today. Add `--shop=N` (the flag `pool-probe.mjs` already uses, same spelling) feeding `probeMeta({ shopLevel })`, and print the level in the header so the output states what it measured.

- [ ] **Step 4: Verify each script runs and reports honestly**

```bash
node scripts/charge-probe.mjs --chapter shelf
node scripts/pool-probe.mjs body 4 dps
node scripts/weapon-census.mjs --chapter city --level 5 --weapons burstHydrant
node scripts/element-probe.mjs
node scripts/fx-probe.mjs --scene scripts/scenes/beam-prism.js --out /tmp/pr --frames 3
```

The thief/no-thief rows must now **differ**. If they still match, the fix did not land — do not proceed to Task 9.

Each probe should print `run.chapter` and the book in its own header, so the output states what it measured (`createRun(meta, 'undertow', 3)` silently measures body at difficulty 1 — `opts` is an options object).

`rm -rf /tmp/pr` and confirm `git status --short` is clean of artifacts.

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "chore: probe scripts build the per-book meta shape"
```

---

### Task 9: The three Undertow resource upgrades

**Files:**
- Modify: `src/state.js` (`createRun` resource snapshot), `src/sim.js` (drain and refill sites)
- Test: `test/sim-test.js`

**Interfaces:** Consumes `shopBonus` (Task 2), `BOOK_SHOP` (Task 1).

| line | effect | where |
|---|---|---|
| `deepLungs` | +8%/level resource capacity | new `run.chargeMax` field; **two** clamp sites in sim |
| `slowBurn` | −4%/level drain | the drain applied per step in `stepSim` |
| `bigGulp` | +10%/level per refill pickup | the refill application site |

**The resource bar has no run-side ceiling today.** The run field is `run.charge` (`state.js:1620`),
and the *maximum* is read straight from config at both clamp sites — `sim.js:3450`
(`run.charge = Math.max(0, Math.min(res.max, c))`) and `sim.js:4594` (the Light Thief kill refill,
`Math.min(_res.max, …)`). So Deep Lungs is not a one-line multiply on an existing field: it needs a
new `run.chargeMax`, and **both** clamp sites must read it. Miss the second and a Deep Lungs player's
bar refills past its cap on kills but is clamped back down on the next drain tick — a flicker, not a
throw.

- [ ] **Step 1: Write the failing test**

```js
  // (u) The three Undertow lines act on the resource bar, in all three of its chapters.
  for (const chapter of ['surf', 'shelf', 'reef']) {
    const base = makeMeta(); base.chapters = {}
    const r0 = createRun(base, { chapter })
    const up = makeMeta(); up.chapters = {}
    ensureBookMeta(up, 'undertow').shop.deepLungs = MAX_SHOP_LEVEL
    const r1 = createRun(up, { chapter })
    assert.ok(r1.chargeMax > r0.chargeMax,
      `deepLungs must raise the resource ceiling in '${chapter}' (${r0.chargeMax} -> ${r1.chargeMax})`)
    assert.ok(Math.abs(r1.chargeMax / r0.chargeMax - (1 + 0.08 * MAX_SHOP_LEVEL)) < 1e-6,
      'deepLungs scales linearly at 8% per level')
    assert.strictEqual(r1.charge, r1.chargeMax, 'the bar starts full at the RAISED ceiling')
  }

  // The ceiling must bind at BOTH clamp sites. sim.js:4594 (the Light Thief kill refill) clamps
  // separately from sim.js:3450 (the drain), and a refill still clamped to the config max would
  // let the bar refill past its cap on kills and snap back on the next drain tick — a flicker
  // that no "does the ceiling move" assertion can see.
  const bothClamps = makeMeta(); bothClamps.chapters = {}
  const bcBm = ensureBookMeta(bothClamps, 'undertow')
  bcBm.shop.deepLungs = MAX_SHOP_LEVEL
  bcBm.unlocks.lightThief = true
  const bc = createRun(bothClamps, { chapter: 'shelf' })
  bc.charge = bc.chargeMax
  bc.killRefill = 50
  stepSim(bc, { x: 0, y: 0 }, 1 / 60)
  assert.ok(bc.charge <= bc.chargeMax + 1e-6, 'the kill-refill clamp must use run.chargeMax, not the config max')

  // slowBurn and bigGulp are RATES — assert the effect over stepped time, not the stored field.
  // A test that reads run.drainMul passes with the multiplier never applied to anything.
  const drainRun = (levels) => {
    const m = makeMeta(); m.chapters = {}
    ensureBookMeta(m, 'undertow').shop.slowBurn = levels
    const r = createRun(m, { chapter: 'shelf' })
    r.resource = r.resourceMax
    for (let i = 0; i < 60; i++) stepSim(r, { x: 0, y: 0 }, 1 / 60)
    return r.resource
  }
  assert.ok(drainRun(MAX_SHOP_LEVEL) > drainRun(0) + 1e-6,
    'slowBurn must leave MORE resource after a second of draining — assert the drain, not the multiplier')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/sim-test.js bookprogression`
Expected: FAIL — `r1.resourceMax` equals `r0.resourceMax`.

- [ ] **Step 3: Write minimal implementation**

In `createRun`, beside the existing `charge:` line (`state.js:1620`), add the ceiling and the two rate multipliers as run fields — sim reads the run, never `meta`:

```js
    // The bar's ceiling as a RUN field. It used to be read straight from config at both clamp
    // sites; Deep Lungs is what makes it per-run. 0 in every chapter that declares no resource.
    chargeMax: (CHAPTERS[chapter].resource?.max ?? 0) * (1 + shopBonus(bm, bookId, 'deepLungs')),
    charge: (CHAPTERS[chapter].resource?.max ?? 0) * (1 + shopBonus(bm, bookId, 'deepLungs')),
    chargeDrainMul: Math.max(SLOW_BURN_FLOOR, 1 - shopBonus(bm, bookId, 'slowBurn')),
    chargeRefillMul: 1 + shopBonus(bm, bookId, 'bigGulp'),
```

Hoist the ceiling into a local so it is authored once rather than twice — a per-cast count written
twice is this repo's documented trap, and the same argument applies here:

```js
    const chargeMax = (CHAPTERS[chapter].resource?.max ?? 0) * (1 + shopBonus(bm, bookId, 'deepLungs'))
```

Then in `src/sim.js`, change **both** clamp sites from the config max to the run field:

- `:3450` — `run.charge = Math.max(0, Math.min(run.chargeMax, c))`
- `:4594` — `run.charge = Math.min(run.chargeMax, run.charge + run.killRefill)`

and multiply `chargeDrainMul` in at the drain and `chargeRefillMul` at the refill pickup.

`slowBurn` stores a **positive** `perLevel` and is subtracted here; the `reduction: true` flag is what makes the UI print it as a decrease (Task 6). The floor keeps a future `MAX_SHOP_LEVEL` raise from inverting the drain:

```js
export const SLOW_BURN_FLOOR = 0.5   // config.js, beside the other resource constants
```

Add all four fields (`chargeMax`, `chargeDrainMul`, `chargeRefillMul`, and the changed `charge`) to the `run` doc block in `state.js` (lines 438-1115), next to `charge`'s existing entry at `:850-885`. A `run.*` field absent from that block is invisible to the next reader — the block is the authoritative list of every `run` field by contract.

- [ ] **Step 4: Run test to verify it passes, then gate Slow Burn**

Run: `node test/sim-test.js bookprogression`, then `npm test`.

**The ship gate.** Slow Burn at Lv10 is −40% drain; The Shelf drains 2.2/s, so a maxed player runs it at 1.32/s — enough to flatten the chapter's dark mechanic entirely. Measure before fixing `perLevel`:

```bash
node scripts/charge-probe.mjs --chapter shelf --shop=0
node scripts/charge-probe.mjs --chapter shelf --shop=10
```

Read **all three** spend policies (`hoard`, `full`, `greedy`) and **both** movement policies (`kite`, `seek`). Report the pair, never `kite` alone: the walk turns at a fixed rate, so slowing the player shrinks the sampled area below the spacing of the thing being sampled and `%inLight` collapses for reasons that are a property of walking in a circle, not of the chapter.

If `%inLight` at Lv10 shows the chapter degenerating into "always lit", lower `perLevel` in `BOOK_SHOP.undertow.slowBurn` and re-measure. **Do not** ship the number without this table; record it in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/config.js src/state.js src/sim.js test/sim-test.js
git commit -F <file containing the charge-probe table and the chosen perLevel>
```

---

### Task 10: The Surf's opening, contract lints, and the full sweep

**Files:**
- Modify: `src/config.js` (`EARLY_CALM`, `CHAPTERS.surf.archetypeMul`)
- Modify: `test/sim-test.js` (run XX nested walk, run VO additions)
- Modify: `CLAUDE.md`

**Interfaces:** Consumes everything.

- [ ] **Step 1: Write the failing test**

```js
  // (v) THE SURF IS NOW THE FIRST RUN OF A CAMPAIGN. Measured before this change: body d1 runs an
  // effective spawn of 0.30 (balance 0.75 x EARLY_CALM 0.40) at x2.22 xp; surf ran 0.68 at x1.0 —
  // 2.3x the spawn rate at 45% of the xp, which was correct only while nobody reached it without
  // a stocked book-1 shop.
  assert.ok(EARLY_CALM.surf, "The Surf needs an EARLY_CALM entry — it is a book's first chapter now")
  assert.strictEqual(EARLY_CALM.surf.spawnMul, 0.8, 'owner ruling 2026-08-16')
  assert.strictEqual(EARLY_CALM.surf.xpMul, 1.3, 'owner ruling 2026-08-16')
  assert.strictEqual(CHAPTERS.surf.archetypeMul?.tank, 0.6, '40% fewer Shore Crabs (owner ruling 2026-08-16)')
  // The archetypeMul key must be a real ARCHETYPE, not a WAVE_TABLE spawn type — indexing the
  // wrong way silently did nothing until v5.5 (see TYPE_ARCHETYPE in config.js).
  for (const [id, mul] of Object.entries(CHAPTERS.surf.archetypeMul)) {
    assert.ok(['normal', 'fast', 'tank'].includes(id), `archetypeMul key '${id}' is not an archetype`)
    assert.ok(mul > 0 && mul <= 1, `archetypeMul.${id} must be a reduction in (0,1]`)
  }

  // (w) EVERY chapter resolves to a book. bookOf returns null for an unclaimed id, and run.chapter
  // is a CHAPTERS key, not an ALL_CHAPTER_IDS key — so an orphan chapter banks coins into
  // meta.books[null], a purse no screen can render. The honest denominator is Object.keys(CHAPTERS).
  const allChapters = Object.keys(CHAPTERS)
  for (const id of allChapters) {
    assert.ok(bookOf(id), `chapter '${id}' belongs to no book — add it to BOOKS or its coins vanish`)
  }
  assert.ok(allChapters.includes('surf'), 'sanity: the sweep can see the chapter this work is for')

  // (x) No consumer reads SHOP directly — every one goes through shopLines(bookId), or a
  // book-specific line is invisible in exactly one place. Source-text lint (the run UG.k idiom).
  for (const f of ['state.js', 'main.js', 'ui.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
    const bare = src.match(/\bSHOP\[[^\]]+\]|Object\.(keys|entries|values)\(SHOP\)/g) ?? []
    assert.deepStrictEqual(bare, [], `${f} reads SHOP directly (${bare.join(', ')}) — use shopLines(bookId)`)
  }
  console.log(`PASS run BK (book progression): ${BOOK_ORDER.length} books, ${allChapters.length} chapters all booked, ${Object.keys(shopLines('undertow')).length} Undertow lines`)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/sim-test.js bookprogression`
Expected: FAIL — `EARLY_CALM.surf` is undefined.

- [ ] **Step 3: Write minimal implementation**

`src/config.js`, `EARLY_CALM` (~`:3034`):

```js
  // v7.x: The Surf is Undertow's first chapter, and per-book progression makes surf/d1 the literal
  // first run of a campaign — at zero upgrades, where it used to be reached with a stocked book-1
  // shop. Gentler than it was, harder than body/pond (owner: "Book 2 should be harder, but maybe
  // not that hard").
  surf:   { spawnMul: 0.8,  xpMul: 1.3 },
```

`CHAPTERS.surf` (~`:4359`) — note it spreads `CHAPTERS.pond` and `config.js:4483` warns some inherited arrays are shared **by reference**; this adds a new key, so it is safe:

```js
  // 40% fewer Shore Crabs (owner ruling 2026-08-16). CHAPTER-WIDE, at every difficulty, matching
  // how garden ({tank:0.73}) and city ({tank:0.825}) declare theirs. Making it difficulty-1-only
  // is not a config change: sim.js:1440 reads CHAPTERS[run.chapter].archetypeMul straight from
  // this table and never consults createRun's mods, so a d1 gate means plumbing a new run field
  // through every chapter's spawn path.
  archetypeMul: { tank: 0.6 },
```

Extend run XX's config-table walk to handle **two-level** tables for `BOOK_SHOP` and `BOOK_UNLOCKS`. The flat walk does `for (const v of Object.values(table)) need(v?.name)`, which for a nested table yields the per-book dicts, reads `undefined`, and skips — verbatim the WEAPON_MODS hole documented eight lines below it. Use the `WEAPON_MODS` nested idiom already in the file.

Extend run VO to resolve `BOOK_UNLOCKS` keys against the flags `state.js` actually reads.

Update `CLAUDE.md`: the browser-probing rule's worked save seed gains `books: {}` / `grants: {}` as optional (a seed **must** still carry `shop: {}` — that has not changed and is why this design is safe), and a line under Conventions recording that `meta` fields are additive-only per R2, with a pointer to this spec's revision history as the worked example.

- [ ] **Step 4: Run the whole thing**

```bash
npm test
node scripts/test-isolation.mjs
node scripts/obstacle-contrast.mjs
npm run build
```

`npm test` must print `ALL TESTS PASSED` with **no** `PARTIAL RUN` line. `test-isolation` matters here: several tasks change how many randoms are drawn.

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/sim-test.js CLAUDE.md
git commit -m "chore: Surf opening balance, book contract lints, nested table coverage"
```

---

## Self-Review

**Spec coverage.** §1 save shape → Tasks 2, 4. §2 config surface → Tasks 1, 9. §3 gate/grant/retroactive/carousel → Tasks 3, 7. §4 UI → Task 6. §5 read-site sweep → Tasks 2, 5, 6, 8. §6 Surf opening → Task 10. §7 tests → distributed, with the old-build regression isolated as Task 4 because it is the one that would have caught rev 1. §8 risks → the Slow Burn gate is Task 9 Step 4; the `SACRIFICE_COSTS` decision is out of scope by ruling.

**Two things this plan deliberately does NOT do**, both from the spec's Out of scope: book-specific `SACRIFICE_COSTS`, and widening `dailyChapter` past Book 1. The second has a trap worth restating — a daily is playable on a chapter you have **not** unlocked (`ui.js:1724`, "preview"), so widening it would route a preview daily's `endRun` into a Book 2 purse for a player who never beat The Beyond. The monotone grant flag is what keeps that from being a payout; Task 3's comment records it.

**Interface consistency check.** `shopBonus(bm, bookId, id)` — three args, used identically in Tasks 2 and 9. `bookMeta(meta, bookId)` and `ensureBookMeta(meta, bookId)` — two args throughout. `onBuy(id, bookId)` / `onSacrifice(picks, target, bookId)` — book id trailing in both. `shopCost(id, level)` — unchanged two-arg signature by design, which is why no task edits its call sites. `formatShopBonus(bookId, id, levels)` gained a leading `bookId`; its call sites are all in Task 6.

**One correction made during review, worth carrying into implementation.** The plan originally had Deep Lungs multiplying a `run.resourceMax` field. That field does not exist: the run carries `run.charge` (`state.js:1620`) and the *ceiling* is read from config at **two** independent clamp sites, `sim.js:3450` (drain) and `sim.js:4594` (Light Thief kill refill). Task 9 now introduces `run.chargeMax` and changes both, and its test asserts the second clamp specifically — because missing it produces a flicker (refill past the cap on a kill, snapped back on the next drain tick) that a "does the ceiling move" assertion cannot see. Assume the same class of error is lurking wherever this plan says "the refill application site": **find the real site before writing the multiply, and check whether there are two of them.**

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-16-per-book-progression.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
