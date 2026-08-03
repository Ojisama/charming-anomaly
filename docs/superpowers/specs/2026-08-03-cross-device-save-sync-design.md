# Cross-device save sync — design + technical strategy

**Date:** 2026-08-03
**Status:** Design approved in-session (owner decisions marked below); implementation plan to follow.
**Use case, verbatim:** *"I start a save on my phone, I want to continue on my computer, then back
on my phone when I leave for work."*

## 1. Goal and scope

One designated save follows the player between devices without them doing anything per handoff.
Close the laptop, pick up the phone, tap Play, and the phone is holding the laptop's coins, shop
levels and chapter ladders. The player pays a one-time cost — type a code once on the second
device — and never thinks about it again.

**In scope:** the persisted `meta` blob, and only that. Coins, `meta.shop` levels,
`meta.choiceSlots`, `meta.runs`, `meta.best`, every `meta.chapters[id]` ladder, `meta.chapter`,
`meta.lang`, plus the two new fields this design adds.

**Explicitly NOT in scope: mid-run handoff.** You cannot pause a run on the phone and resume it
mid-run on the laptop. This is not a scheduling decision, it is a fact about the codebase: only
`state.js` touches localStorage, and it persists `meta` alone. The `run` object — live enemies,
bullets, novas, holes, blooms, beams, streamed obstacles, `hitIds` Sets, `_trapRearm` Maps, the
`Math.random` stream position — is never serialized, and the doc block at the top of `state.js`
(the run-shape contract) is a catalogue of exactly how much unserializable state a live run holds.
Making a run resumable would mean designing a save format for the entire simulation, versioning it
against every future chapter, and keeping it in sync with a 5.6k-line `sim.js`. That is a larger
project than this one and it buys a case the owner did not ask for: the stated use case is *runs
finish, progress travels*. A run in progress is 5 minutes long (`RUN_DURATION`); the honest
behaviour is that a run belongs to the device it started on.

Consequence for the design: sync only ever has to move ~900 bytes of progression, and it only ever
has to act between runs. Both of those simplify everything downstream.

## 2. What was rejected, and why

**Export/import a code per handoff.** Owner rejected it outright. A code you re-type on every
switch is the feature the player has to remember to use, which means the one time they forget is
the time they lose a session. Pairing is one-time; handoff is invisible.

**Workers KV as the store.** Rejected on consistency, not on quota. KV's free tier would have been
tight but survivable — 100,000 reads/day but only **1,000 writes/day**, and writes to the same key
are capped at roughly one per second
([limits](https://developers.cloudflare.com/kv/platform/limits/)). The decisive problem is that KV
is eventually consistent by design: Cloudflare documents that a write "may take up to 60 seconds or
more" to become visible in other locations
([how KV works](https://developers.cloudflare.com/kv/concepts/how-kv-works/)). The owner's exact
pattern — close the laptop, pick up the phone thirty seconds later — lands inside that window. The
phone reads a stale copy, correctly concludes that nothing has changed since it last synced, and
overwrites the laptop's session. No client-side version check can catch it, because the store is
not lying: it is reporting the truth as it knows it, and the generation counter it hands back is a
real generation counter that is simply old. Silent progress loss with no detectable symptom is the
one failure mode this feature exists to prevent.

**D1 is strongly consistent** and its free tier is not close to binding: 5 million rows read/day,
**100,000 rows written/day**, 5 GB storage
([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)). Workers' own free tier is
100,000 requests/day ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/))
and is never the binding constraint here either. Real usage: `saveMeta` fires 10–20× per session
(eight call sites in `main.js`, below), but pushes are debounced to run-end and tab-hidden, so
roughly **3 writes per session**. Two orders of magnitude of headroom on the tightest number.

## 3. Architecture

### 3.1 Where the client code lives — a new module

**Recommendation: a new `src/sync.js`.** Not inside `state.js`.

The module table in `CLAUDE.md` gives `state.js` the rule *"May NOT touch: Pixi, DOM (localStorage
only)"*. `fetch` is a Web API, so putting network I/O in `state.js` breaks that row on its face —
but the concrete harm is better than the stylistic one. `test/sim-test.js` imports `state.js`
directly (line 3: `import { createRun, loadMeta, saveMeta, ensureChapterMeta, activeSlot,
setActiveSlot, slotSummary, SAVE_SLOTS } from '../src/state.js'`) and stubs exactly one browser
global to make that work — `globalThis.localStorage`, in `testSaveSlots`. Node 22 ships a global
`fetch`, so a network call inside `loadMeta`/`saveMeta` would not throw during `npm test`; it would
**silently attempt a real request** on every save the suite performs. A test suite that quietly
talks to the internet is worse than one that fails.

Second reason: `loadMeta()` is synchronous and is the first statement of `boot()` (`main.js:17`).
Sync cannot be part of it. `main.js` may not use top-level `await` (the Pixi v8 blank-page
constraint), and sync must never block boot regardless — a player on a train opening the PWA must
get the title screen at the same speed as always.

So the table gains one row:

| File | Role | May NOT touch |
|------|------|---------------|
| `sync.js` | **Cloud save sync.** Owns the pairing credential and its own localStorage key, decides when to pull/push, talks to the Worker, hands `main.js` a decision. Never parses gameplay data beyond the four summary fields. | Pixi, DOM, `run`, `sim.js`, `render.js`, save-slot localStorage keys |

`sync.js` must keep its module scope free of browser globals — `fetch` and `localStorage` only
inside function bodies, and `__SYNC_URL__` behind the same `typeof` guard `ui.js:18` already uses
for `__BUILD_STAMP__`. That discipline is what keeps it importable from plain node, which in turn
is what makes its decision logic unit-testable in `npm test` (§11). Write that constraint into the
module's header comment, because it is one careless import away from being lost.

`main.js` stays glue: it wires `sync.js`'s callbacks the same way it already wires `ui.js` hooks.
`ui.js` owns every pixel — the sync panel, the pairing sheet, the conflict prompt.

### 3.2 How `sync.js` learns that a save happened

There are eight `saveMeta(meta)` call sites in `main.js`:

| Line | Trigger |
|---|---|
| 39 | `startClassic` — spending coins on pre-run boosters |
| 125 | `onBriefReroll` — spending `ANOMALY_REROLL_COST` on a fresh anomaly roll |
| 134 | `onLang` — the title screen's 🌐 toggle |
| 144 | `onBuy` — a shop purchase |
| 165 | `onDifficulty` — a difficulty pip |
| 174 | `onChapter` — the chapter carousel settling on a new card |
| 206 | `onSacrifice` — confirming an upgrade-slot sacrifice |
| 329 | `endRun` — coins banked, `runs`, both `best` records, difficulty/chapter unlocks |

Adding a `syncPush(meta)` line next to each is eight edits that a ninth call site will silently
skip. Instead, `state.js` gains a two-line observer, in the spirit of the event contract that
already runs this codebase (sim announces, main routes):

```js
let saveHook = null
export function setSaveHook(fn) { saveHook = fn }   // sync.js, wired once from main.js
```

and `saveMeta` fires it **only on a successful write**, outside the try/catch:

```js
export function saveMeta(meta) {
  const key = boundKey ?? slotKey(activeSlot())
  meta.savedAt = Date.now()
  let ok = false
  try { localStorage.setItem(key, JSON.stringify(meta)); ok = true } catch { /* private mode */ }
  if (ok) saveHook?.(boundSlot ?? activeSlot())
}
```

Two details matter. Firing outside the catch means a throwing hook surfaces as a real error instead
of being mistaken for private mode. And firing only on success means a device whose localStorage is
refusing writes never uploads state it is about to forget.

The hook receives a **slot number**, not a key: `state.js` keeps a module-level `boundSlot`
alongside the existing `boundKey` (both set on the same line of `loadMeta`, `state.js:107`), so key
construction stays entirely inside `state.js` and `sync.js` never learns the shape of a save key.
`sync.js` compares the slot number against the one it syncs and ignores everything else.

`state.js` also gains the two raw accessors `sync.js` needs, next to `slotSummary` (which already
does raw-read-without-migrating):

- `exportSlot(n)` → the slot's raw JSON string, or `null`. This is what gets pushed — **not**
  `JSON.stringify(meta)` of the live in-memory object, which may have been mutated since the last
  save. What we promise the cloud is exactly what is on disk.
- `importSlot(n, json)` → parses first, refuses to write if it does not parse, then writes. A
  corrupted download must not be able to brick a slot; `loadMeta`'s catch would silently recover to
  a fresh save, which is worse than refusing.

### 3.3 Adopting a cloud save = write + reload

`main.js` creates one `meta` object at boot (`main.js:17`) and passes it by reference into
`initUI({ meta })`, which destructures and closes over it forever (`ui.js:180`). You cannot swap
that object out; `ui.js` would keep rendering the old one.

The codebase already has the answer, twice. `onReset` (`main.js:218`) and `onSlot` (`main.js:224`)
both mutate localStorage and call `location.reload()`, and `state.js:36-37` states the rule
outright: *"The caller … reloads the page right after, so every module re-reads `loadMeta()`
against the new slot rather than reconciling in-memory state."*

**Adopting a cloud save is `importSlot(slot, blob)` then `location.reload()`.** Same idiom, one
line, provably correct.

The consequence is a real constraint: a reload destroys an in-progress run, so **sync only acts
when `run === null`**. Pull on boot, and pull when the tab becomes visible while at a menu. During a
run, nothing happens — which costs nothing, because `saveMeta` never fires mid-run either (all
eight call sites above are menu actions or `endRun`).

### 3.4 The Worker never parses the save

The Worker stores an opaque string. It does not know what a chapter is, what coins are, or what
version of the game wrote the row. Both conflict summaries — local and cloud — are derived
**client-side** by one shared pure function, from blobs the client already has.

This is worth stating as an architectural rule because of what it buys: shipping a new chapter, a
new shop stat, or a new meta field never requires touching or redeploying the Worker; the Worker
and the game version-skew independently; and the payload could become encrypted later without
changing a line of server code (§10).

## 4. Data model

### 4.1 New `meta` fields

Two fields, both repaired on load with the `??=` idiom `loadMeta` already uses for `m.chapter`,
`m.choiceSlots` and `m.lang` (`state.js:123-135`) — the same repair-on-load discipline as
`ensureChapterMeta` (`state.js:93-104`), which is why no migration branch is needed.

**`meta.name`** — the save's display name (owner requirement 2). Default `m.name ??= ''`.

Empty means unnamed, and `ui.js` renders the fallback (`Save 1`, `Save 2`, …) at display time. It
must **not** default to a baked English string: the i18n contract (v6.1) is that English source
strings are the French dictionary's keys and translation happens in `ui.js` at render time, so a
name written into the save on a French device would be a stale English literal travelling to every
other device forever. An empty string has no language.

`meta.name` is the **first player-authored free text in this codebase**, it is interpolated into
`innerHTML` (the title screen, the slot modal, the conflict prompt), and — uniquely — it arrives
**from the network**. `state.js:55-56` already documents the shape of this hazard for a value that
merely came from localStorage:

> *"`Number()` both normalizes odd shapes and defuses a tampered string coins (`"<img onerror=…>"`)
> that the slot modal would otherwise interpolate into innerHTML."*

There is no HTML-escaping helper anywhere in `ui.js` today — every interpolated value is either a
number or a trusted config/i18n string, so the templating style has never needed one. This design
introduces the first value that breaks that assumption, so it must also introduce the helper: a
four-line `esc()` in `ui.js` applied to `meta.name` at every render site, plus a hard clamp
(24 characters, control characters stripped) applied on input **and** on adopt, so a hostile blob
cannot arrive with a 4 KB name.

**`meta.savedAt`** — epoch milliseconds, stamped by `saveMeta` on every write (§3.2). Default
`m.savedAt ??= 0`, which the prompt renders as "unknown" — seen once, on the first sync after
upgrading.

This is the device's own clock, and clock skew between a phone and a laptop is normal.
**The timestamp is shown to the human and never used to decide anything.** Ordering is the
generation counter's job, always (§6.2). A sync design that resolves conflicts by comparing wall
clocks is a sync design that loses a session whenever a device's clock is wrong.

Both fields are additive, and `loadMeta` returns the parsed object wholesale after patching, so
unknown keys survive a round-trip: a save written by the new build still loads correctly in the old
build, and a save that visits an old build and comes back keeps its new fields. The rollout cannot
corrupt anything mid-flight.

### 4.2 The four-field summary

Owner requirement 3: the conflict prompt shows, per side, the furthest chapter and the difficulty
beaten there, the total upgrades owned, the save time, and the coins. Three derive from data that
already exists. A new pure export in `state.js`, next to `slotSummary`:

```js
export function saveSummary(meta)
// → { name, coins, upgrades, chapterId, beaten, savedAt }
```

- **coins** — `meta.coins`.
- **upgrades** — `Object.values(meta.shop).reduce((s, l) => s + l, 0)`. This exact expression
  already exists as `owned` in `ui.js`'s `shopFootHtml` (line 560); reuse the idiom so the shop's
  sacrifice meter and the conflict prompt can never disagree about what "upgrades owned" means.
- **chapterId** — the last `CHAPTER_ORDER` id whose `chapters[id].unlocked` is true, which is
  exactly `furthestUnlockedChapterId` (`ui.js:73-79`), **then overridden by `'blank'` when
  `meta.chapters.blank?.unlocked`**. The Blank lives outside `CHAPTER_ORDER` by design (see
  `ui.js:43-47`), so the walk cannot see it, yet it is unambiguously the furthest a save can get.
- **beaten** — `Math.max(0, chapters[chapterId].maxDifficulty - 1)`, which is the semantics the
  title card's star row already encodes and documents at `ui.js:250-253`: *"maxDifficulty is the
  highest UNLOCKED level, so levels actually BEATEN = maxDifficulty - 1"*. With the same documented
  exception at `ui.js:258`: for `beyond`, `chapters.blank.unlocked` is the save's one genuine
  "won at 5" fact, so `beaten` is 5 when it is set. Using the identical rule means the card and the
  prompt never tell the player two different numbers.
- **savedAt / name** — straight through.

`saveSummary` is pure, lives in the testable set (`state.js`), and is called for both sides: the
local blob and the downloaded cloud blob. `slotSummary(n)` additionally gains `name` in its return
so the existing slot picker can show names too — an added field, so the shape asserted by the
existing `SS.e` scenario stays valid.

### 4.3 D1 schema

```sql
CREATE TABLE saves (
  id         TEXT    PRIMARY KEY,  -- lowercase hex SHA-256 of the pairing code; the code is never stored
  gen        INTEGER NOT NULL,     -- optimistic-concurrency counter, +1 per accepted write
  blob       TEXT    NOT NULL,     -- the meta JSON verbatim; opaque to the Worker
  saved_at   INTEGER NOT NULL,     -- writer's clock, epoch ms — display only, never compared
  device     TEXT    NOT NULL,     -- last writer's device id; used only for the lost-ACK check (§6.4)
  updated_at INTEGER NOT NULL,     -- server clock, epoch ms — write throttle + any future sweep
  prev_blob  TEXT,                 -- the blob this write replaced; operator-only undo (§7.3)
  prev_gen   INTEGER
);
```

No secondary index. Every query is a primary-key point lookup on `id`; adding an index on
`updated_at` only makes sense once something sweeps by age, and at ~1 KB per row against a 5 GB
allowance nothing needs sweeping for millions of saves. `updated_at` is stored anyway because it
cannot be reconstructed later.

**The blob is stored as raw JSON, uncompressed.** A maxed-out save is 893 bytes; deflate+base64url
takes it to 315 characters. Both are noise against 5 GB, and compressing would buy a
`CompressionStream` round trip, a base64 layer, a decompress on read, and a fallback path — for
nothing. The measured size is precisely what makes it safe not to bother.

## 5. Identity and pairing

### 5.1 One value, typed once

**The pairing code *is* the credential.** Device A generates it; device B types it once; both
devices now hold the same bearer token and sync forever. There is no pairing session, no ephemeral
short code, no per-device token exchange, no TTL state machine.

The alternative — a 6-digit code with a 10-minute expiry, exchanged for per-device tokens — needs a
second table, expiry sweeping, a token table, and revocation UI. That is a real authentication
system for a single-player browser game with a 900-byte save. Rejected; the upgrade path is written
below.

Format: **Crockford base32, 16 characters = 80 bits**, displayed grouped as `XXXX-XXXX-XXXX-XXXX`.
Crockford excludes I, L, O and U, so there is no 0/O or 1/l ambiguity when reading a code off a
phone screen, and its canonicalization rules (uppercase, `I`/`L`→`1`, `O`→`0`, strip hyphens) mean
the client can be generous about what the player types. Generated with
`crypto.getRandomValues` — the codebase uses no crypto today, but `crypto` is universally available
in anything that runs Pixi v8, and `crypto.subtle.digest('SHA-256', …)` is needed anyway (below).
80 bits is beyond brute force by any margin that matters, and 16 characters is about fifteen seconds
of typing.

**The Worker stores `SHA-256(code)` as the row id and never stores the code.** A plain SHA-256 is
the correct hash here — and only here — because the input is a full-entropy 80-bit random value,
not a human-chosen password: there is no dictionary to attack and no work factor to buy. The
consequence is that a database leak yields no usable credential for any save, only a pile of hashes
whose preimages are unguessable.

### 5.2 The credential lives outside the meta blob

The sync record is its own localStorage key, `charming-anomaly-sync`, entirely separate from every
`slotKey(n)`:

```jsonc
{
  "code":     "A7K3-9WQM-2FTX-B4NE", // the bearer token
  "slot":     2,                     // which LOCAL slot this device syncs — device-local by design
  "device":   "b6f1…",               // crypto.randomUUID(), once, for the lost-ACK check
  "gen":      7,                     // baseGen: the generation the local save descends from
  "dirty":    true,                  // local save changed since gen was last confirmed
  "sentAt":   1754251200000,         // savedAt of the push currently in flight
  "pulledAt": 1754251180000          // last successful GET, for the pull throttle
}
```

Putting any of this inside `meta` would be wrong in three distinct ways, and the third is fatal:

1. **It would travel.** The meta blob is exactly what gets uploaded and downloaded. A credential
   inside it rides to the server and back down onto every paired device. With two devices that is
   merely redundant; with three it becomes a foot-gun, because a blob adopted into a *different*
   slot or a *different* sync identity carries the old credential with it, and two saves silently
   start writing to the same row.
2. **It would be per-slot.** There are three local slots and exactly one syncs (owner requirement
   1). Which slot that is, is a property of *this device* — the phone might sync slot 1 and the
   laptop slot 3. A field inside a slot's blob cannot express that, and switching slots would
   switch identity.
3. **`resetSave()` would destroy it.** `state.js:159-161` does `localStorage.removeItem(boundKey)` —
   the whole blob. A credential inside the blob is erased by the shop's "Erase everything" button,
   orphaning the cloud row with no code left to reach it. The player would have locked themselves
   out of their own cloud save by resetting a local one.

The sync record survives `resetSave()` precisely because it is a different key.

### 5.3 Reset interacts with sync, and must say so

Given the record survives, what should "Reset all progress" do when it targets the synced slot?
Two coherent answers: unlink sync and leave the cloud alone, or propagate the wipe.

**Propagate.** A player who has deliberately linked their devices expects them to agree; the
surprising outcome is the laptop re-uploading the old save an hour later and un-resetting the
phone. So `onReset` on the synced slot pushes the fresh save before reloading, and the confirm
modal's copy — today *"Coins, upgrades, slots and best scores will be permanently erased."*
(`ui.js:661`) — gains *"…on this device and on every device linked to this save."* Anything less is
a lie about scope.

Mechanically: `onReset` awaits the push with a 2-second bound before `location.reload()` (it is a
modal-confirmed destructive action; a brief spinner is acceptable), and falls back to "reset
locally now, push on the next boot" if the network is gone. `sendBeacon` is not usable here — it
cannot carry an `Authorization` header.

## 6. Sync protocol

### 6.1 Endpoints

Two, and the client mints its own code.

```
GET /v1/save
  Authorization: Bearer <code>
  200 { gen, blob, savedAt, device }
  404                                  no row under this code (never synced, or code mistyped)
  401                                  malformed code
  429                                  rate limited

PUT /v1/save
  Authorization: Bearer <code>
  { baseGen, blob, savedAt, device }
  200 { gen }                          accepted; gen === baseGen + 1
  409 { gen, blob, savedAt, device }   stale baseGen — the current row comes back with it
  400                                  blob too large or unparseable envelope
  401 / 429
```

`baseGen: 0` means *"I believe no row exists"* and maps to `INSERT … ON CONFLICT(id) DO NOTHING`;
zero rows affected produces the same 409 as any other stale write, carrying the existing row. So
**one code path covers first write, ordinary write, and conflict** — including the case where a
player types a code on a device that already has local progress. There is no create endpoint and no
create response to lose.

Client-minted codes were chosen over server-minted ones for exactly that robustness: a lost
response to a server-side create leaves an orphaned row and a player holding nothing, while a lost
response to a client-minted PUT is resolved by retrying the same idempotent request with a code the
client already has.

The write is one statement — the generation check and the write are the same operation, so there is
no read-modify-write race even under concurrent pushes:

```sql
UPDATE saves
   SET prev_blob = blob, prev_gen = gen,
       blob = ?, gen = gen + 1, saved_at = ?, device = ?, updated_at = ?
 WHERE id = ? AND gen = ?           -- ?  = baseGen
```

Zero rows changed → read the row and return 409 with it.

### 6.2 The generation counter

`gen` is a plain integer, incremented by the server on every accepted write. The client stores the
generation its local save descends from (`record.gen`, "baseGen") plus a `dirty` flag set whenever
`saveMeta` fires on the synced slot and cleared on a successful push.

Those two values are the entire decision function, and it is pure:

| local `dirty` | cloud `gen` vs baseGen | decision |
|---|---|---|
| false | equal | **nothing** — the common case |
| false | greater | **pull** — adopt silently, `importSlot` + reload |
| true | equal | **push** |
| true | greater | **conflict** — both sides moved from a common ancestor; prompt (§7) |
| any | less | **push** (server rolled back or was restored; our baseGen wins the next write anyway) |

Nothing in this table consults a timestamp. That is the point.

### 6.3 When to pull, when to push

**Pull** — fire-and-forget, never awaited by `boot()`:

- on boot, after the title screen has rendered;
- on `visibilitychange` → visible, when `run === null` and `pulledAt` is more than 10 seconds old.

A pull may be issued at any time (a GET is harmless), but an *adopt* only happens when
`run === null`, because adopting means reloading (§3.3).

**Push** — three triggers, in owner-estimated order of importance:

1. run end (`endRun`'s `saveMeta`, `main.js:329`) — the one that carries a session's progress;
2. `visibilitychange` → hidden, and `pagehide`, while dirty — pocketing the phone;
3. a 10-second trailing debounce after any save on the synced slot, so a tab closed without ever
   being hidden loses at most ten seconds of menu shopping.

Trigger 3 collapses a burst of shop purchases into one request. Measured against the eight save
sites, this lands at roughly 3–5 pushes per session — against a 100,000-row/day allowance.

A dropped push is never fatal: `dirty` stays set, and the next trigger retries. The worst case is
that the other device pulls a slightly older generation, is not itself dirty, adopts it, and gets
corrected on the next pull. The failure mode degrades toward *a stale but valid save*, never toward
silent divergence — because the moment the second device has its own changes, it is dirty, and the
table above routes to the prompt.

One verified detail that decides whether `dirty` is trustworthy on a freshly adopted device:
nothing calls `saveMeta` at boot without a user action. In particular the chapter carousel does not
— `positionCarousel` scrolls programmatically and fires `scroll`, but `settle` early-returns when
the centred card already matches `browseChapterId` (`ui.js:471`), and `browseChapterId` is
initialised from `meta.chapter` (`ui.js:204`), which is the card `positionCarousel` centres. No
spurious save, so no spurious dirty flag, so no spurious conflict prompt.

### 6.4 The lost-ACK case

If a push is accepted but the response never arrives, the client keeps `dirty` and a stale
`baseGen`. Its next push 409s against a row that it wrote itself, and the player would be shown a
conflict between their save and their own save.

The `device` column closes this: on a 409, if `server.device === record.device` **and**
`server.savedAt === record.sentAt`, this is our own lost acknowledgement — adopt `server.gen` as
the new baseGen, clear `dirty`, no prompt. `sentAt` is written into the record *before* the request
goes out, so the check works even though the response was lost. Three lines, and it removes an
entire class of spurious prompt.

## 7. Conflict detection and resolution

### 7.1 Progression is not auto-mergeable

The tempting rule is "take the larger number per field". It is wrong, and specifically it is wrong
because **coins get spent**. A player with 900 coins who buys a 600-coin upgrade on the laptop has
300 coins and one more shop level; the phone still shows 900 and no upgrade. Field-wise maximum
yields 900 coins *and* the upgrade — the purchase, refunded. Repeat across `meta.shop`,
`meta.choiceSlots` (bought with sacrificed levels, `main.js:193-209`) and pre-run booster spending
(`main.js:38`), and "merge" is a slow-motion duplication exploit rather than a convenience.

The honest answer is **last-write-wins with an explicit user choice**. The machine detects
divergence exactly (§6.2); the human decides which session survives, because only the human knows
which one they care about.

### 7.2 The prompt

Rendered as a modal over the title screen, reusing the existing `.modal-backdrop` /
`.confirm-sheet` idiom (`styles.css:1198`, `1307`) that the slot picker and the reset confirm
already share — same backdrop-tap-to-cancel guard as `slots-cancel` (`ui.js:1311-1316`). It can
only appear while `run === null`.

Four rows, per owner requirement 3, both sides side by side, plus the name so the player can tell
which save is which at a glance:

```
              Two versions of this save

                    THIS DEVICE            THE CLOUD
  Name              Pocket run             Pocket run
  Furthest          The Skies · beat 3     The Beyond · beat 4
  Upgrades          42                     47
  Coins             1 204                  310
  Saved             8 minutes ago          yesterday, 19:41

      [ Keep this device's ]   [ Take the cloud's ]
```

Every value comes from `saveSummary` (§4.2). `Saved` is rendered with `Intl.RelativeTimeFormat`
under a day and an absolute local time beyond it, both in the active language. Every new string
needs an `fr.js` entry in the same commit — the standing i18n rule.

Cancelling is not offered: the two saves have already diverged and the decision is not improved by
postponing it. Backdrop tap and Escape are inert on this one modal.

### 7.3 After each choice

**Keep this device's** → push with `baseGen = cloud.gen`, which the 409 response already carried.
That write is accepted (nobody else moved in between), the cloud row advances to `gen + 1` holding
the local blob, `dirty` clears. No reload — the local save was already the truth on this device.
The cloud's previous content is preserved in `prev_blob`.

**Take the cloud's** → `importSlot(slot, cloudBlob)`, set `baseGen = cloud.gen`, clear `dirty`,
`location.reload()`. The local divergence is gone.

`prev_blob`/`prev_gen` exist because this is the single most destructive tap in the feature and it
costs one column and one clause in an UPDATE that already runs. There is **no endpoint and no UI**
for it: it is an operator escape hatch, recoverable with one SQL statement when a player says they
tapped the wrong button. Stated plainly so nobody mistakes it for a feature. It covers the cloud
side only; the discarded *local* blob is genuinely gone, and making that symmetric would mean
stashing it under another localStorage key (§12).

## 8. Offline and failure behaviour

**localStorage stays the source of truth. Sync is best-effort and never blocks play or boot.**

Every entry point in `sync.js` is wrapped and every failure resolves to "do nothing, stay dirty,
retry on the next trigger" — the same swallow-and-continue idiom `state.js` already uses five times
over (`:31`, `:39`, `:138`, `:154`, `:160`, each with a `/* private mode */` or
`/* corrupted save -> fresh */` comment saying why).

- **Network failure, timeout, 5xx** — requests carry `AbortSignal.timeout(5000)`. The sync panel's
  status line reads "offline — will sync later". No modal, no toast, no interruption. A 5xx is
  treated exactly like an offline failure: the server is not to be trusted this second, and the
  local save has lost nothing.
- **429** — same as offline, plus back off to the next natural trigger. Never retry in a loop.
- **404 on GET** — the row does not exist yet (nothing has ever been pushed under this code, or the
  player mistyped during pairing). During pairing this is the actionable error: *"No save found for
  that code — check the letters."* Outside pairing it means the row was deleted; treat as
  `baseGen: 0` and push.
- **Private browsing / localStorage throws** — `activeSlot()` already falls back to 1 and
  `saveMeta` already no-ops. `sync.js` reads its record inside a try/catch; on a throw it returns
  `null` and every entry point early-returns. **No localStorage means no sync, silently.** That is
  correct rather than merely convenient: without a durable credential and a durable baseGen, every
  page load would mint a new code and orphan a row.
- **Service worker** — verified non-issue. `public/sw.js`'s fetch handler early-returns on
  `!req.url.startsWith(self.location.origin)`, so Worker calls are cross-origin, bypass the cache
  entirely, and can never be served stale. A cached `GET /v1/save` would have been a disaster; the
  existing guard prevents it and a browser probe should assert it (§11).
- **PWA cold start offline** — the game boots from cache as it does today, sync fails on the first
  pull, the player plays, `dirty` accumulates, and the first online boot pushes.
- **No `__SYNC_URL__`** (a fork, a local build, `npm test`) — `sync.js` disables itself entirely and
  the sync UI does not render.

## 9. UI surface

Four additions, all in `ui.js`, all reusing existing components:

1. **A sync panel**, reached from the title screen. States: *not linked* (a "Sync this save"
   button), *linked* ("Synced · 2 minutes ago", the code revealable, an "Unlink" button), *offline*.
   Linking from the first device shows the generated code; linking from a second shows a code entry
   field.
2. **Save names** in the existing slot modal (`slotsModalHtml`, `ui.js:508-533`), which already
   renders one row per slot with a coins/chapters summary — the row gains the name and a rename
   affordance, and a synced slot gets a small 🔗 marker.
3. **The conflict prompt** (§7.2).
4. **The reset modal's revised copy** (§5.3).

Where the entry point lives is a layout question flagged in §13 — the title screen already carries
🌐 (`ui.js:489`) and 💾 (`ui.js:490`) buttons in its corners and a third competes for space on a
320px phone.

Unlinking deletes the local sync record only. The cloud row is untouched, so re-pairing with the
same code restores everything — which is also the rollback story for the whole feature.

## 10. Security and abuse

**The code is a bearer token.** Anyone who has it has full read/write on that save, forever. There
is no revocation short of minting a new code, which orphans the old row — and because the old row
still holds the old save, "unlink and re-pair" is a genuine recovery for a leaked code rather than
a euphemism. Both facts belong in the sync panel's copy, in one line, not a wall of text: *"Anyone
with this code can load your save."*

**Size caps.** Reject `Content-Length` over 8 KB and blobs over 4 KB with 400. Today's save is 893
bytes; 4 KB is ~4.5× headroom for a save that keeps gaining chapters. A cap that is not tight is
not a cap.

**Rate limiting.** Two layers, neither elaborate. In the Worker: reject a PUT arriving less than one
second after the row's `updated_at` with 429 — the row already carries the timestamp, so this costs
nothing extra. Outside it: one Cloudflare Rate Limiting rule on the route (60 requests/minute per
IP). Be honest about the residual: an attacker with many IPs can still create rows, and the blast
radius is quota — sync stops working until the next day — not data loss or corruption. At 100,000
row-writes/day against ~3 legitimate writes per session, that is an acceptable exposure for a free
hobby backend.

**Guessing a code** is not a threat: 80 bits against a 60/minute limiter. `GET` returns 404 for an
unknown code, which leaks only the existence of a random 128-hex-digit id — not sensitive, and it
is what lets the pairing screen distinguish "typo" from "nothing pushed yet".

**CORS** is set to the Pages origin plus the dev origin — and it is *not* a security boundary. The
credential is an `Authorization` header, not a cookie, so CSRF does not apply, and any HTTP client
can call the API regardless of what the browser is told. CORS is here so browsers behave, and
claiming otherwise would be theatre.

**Logging.** The Worker must never log the `Authorization` header or the blob.

### Client-side encryption: recommended against

The proposition is to derive an AES-GCM key from the code (HKDF with a distinct info string from
whatever the id uses) and store only ciphertext, so the operator cannot read player saves and a
database leak is worthless. It is genuinely cheap — WebCrypto is built in, the Worker already
treats the blob as opaque, call it 25 lines.

**It should not ship, because the threat it addresses is already handled and the cost lands on the
wrong side of the ledger.** A leaked database contains, per row: `SHA-256(code)`, which cannot be
inverted for a full-entropy 80-bit secret and therefore yields **no working credential for any
save**, and a JSON blob of coins, shop levels, best times and chapter unlocks for an anonymous
player. There is no email, no password, no payment data, no identifier linking a row to a person.
Encryption would hide a coin count.

Against that, encryption adds a key-derivation step on every pull and push, a versioned envelope,
an IV, a migration path if the scheme ever changes, and — the real cost — a new way to lose a save
permanently: a mis-derived or corrupted key turns a recoverable blob into an unrecoverable one,
with no way for anyone to help. For a payload whose worst-case disclosure is "a stranger knows
someone has 4,000 coins", that is a bad trade in a feature whose entire purpose is not losing
progress.

Two caveats stated rather than buried. First, `meta.name` is free text and the operator can read it;
if a player types their real name it is visible. The mitigations are the 24-character cap and the
fact that names are only ever displayed on the owner's own devices. Second, the upgrade path is
clean *because* the Worker never parses the blob (§3.4): adding an envelope later is a client-only
change plus a one-byte version prefix on the stored string, with no schema migration and no server
deploy. If the save ever grows to hold something personal, revisit then.

## 11. Testing strategy

The constraint is real and worth restating: `test/sim-test.js` is one plain-node file of
`assert`-based scenarios with no framework, and only `sim.js` plus its `config.js`/`state.js`
dependencies are testable that way, because everything else needs Pixi or the DOM.

**Headless (`npm test`)** — a new scenario function appended at the *end* of `test/sim-test.js`,
following `testSaveSlots`'s pattern of stubbing `globalThis.localStorage` with a `Map`
(`sim-test.js:7101-7106`) and registered in the call list at the bottom. Appending at the end is not
cosmetic: the suite seeds `Math.random` and scenario order is part of its determinism contract.

- `meta.name` and `meta.savedAt` defaults, on a fresh save and on an old save missing both.
- `saveMeta` stamps `savedAt`; a later save stamps a later value.
- The save hook fires with the bound slot number on a successful write, and does **not** fire when
  the write throws (stub a `setItem` that throws).
- `saveSummary` on hand-built metas: coins; upgrades as the sum of `meta.shop`; furthest chapter as
  the last unlocked `CHAPTER_ORDER` id; `'blank'` overriding it when unlocked; `beaten` as
  `maxDifficulty - 1`; and the beyond/blank exception producing 5.
- `exportSlot`/`importSlot` round-trip, and `importSlot` refusing unparseable JSON without
  clobbering the existing slot.
- **The decision function** from §6.2, which is the heart of the feature and is pure: given
  `{ baseGen, dirty }` and `{ gen }`, it returns `'none' | 'pull' | 'push' | 'conflict'`. This is
  what makes §3.1's module-scope discipline pay: `sync.js` stays importable from plain node, so
  this can be asserted directly across all five rows of the table.
- The lost-ACK rule (§6.4): a 409 whose `device` and `savedAt` match the in-flight record resolves
  to "adopt gen, no prompt"; a 409 that differs in either field resolves to "conflict".
- The 24-character name clamp and control-character stripping applied on adopt.

**Browser probe** (Chrome DevTools, following `CLAUDE.md`'s probing notes) — everything involving
`ui.js`, reloads, or the service worker:

- Two **isolated browser contexts** — the notes are explicit that open tabs share localStorage and
  clobber seeded saves. Seed context A via a navigate `initScript` (the documented idiom;
  `setItem` + `reload()` gets clobbered by the app re-saving during unload).
- Pair B with A's code; assert B adopts A's save after the reload and that the title screen shows
  A's coins and chapter ladder.
- Make both dirty; assert the prompt renders all four fields per side, and that each button
  produces the state §7.3 describes — including that "Keep this device's" leaves the local save
  untouched and bumps the cloud generation.
- Paste a name containing `<img src=x onerror=…>` into the cloud blob and assert it renders as text
  on the other device. This is the `SS.g` scenario's lesson (`sim-test.js:7150-7156`) applied to a
  field that now arrives over the network.
- DevTools offline mode: boot, play a full run, reach the summary — no modal, no console error, no
  perceptible delay at boot.
- `list_network_requests` to assert no `/v1/save` request is served from the service worker cache.

**The Worker, separately.** It is a different deployable with its own `package.json`; the "no jest,
no vitest" rule is about the game's suite and does not extend to it. Even so, the smallest thing
that works is a short `worker/test.sh` of `curl` assertions against `wrangler dev --local` (D1 runs
against local SQLite), covering: first write with `baseGen: 0`; a normal write; a stale-`baseGen`
409 carrying the current row; an unknown code 404; an oversize blob 400; a missing/malformed
`Authorization` 401; and the one-second throttle 429. Seven cases, one file, no framework.

**Post-push gate.** `scripts/deploy-watch.sh "vX.Y.Z · <sha>" "<sync host>"` — the repo's standard
gate, with the sync host as an extra grep string so the `define` substitution is confirmed to have
landed in the live bundle rather than assumed.

## 12. Migration and rollout

No existing player loses anything, and nothing changes for a player who never opts in. The two new
meta fields are `??=` repairs in `loadMeta` (§4.1), forward and backward compatible, and `sync.js`
early-returns on every entry point until a sync record exists.

Three releases, each shippable and useful alone:

1. **Save names + the summary primitives.** `meta.name`, `meta.savedAt`, `saveSummary`,
   `exportSlot`/`importSlot`, the save hook, `esc()` in `ui.js`, names shown and editable in the
   slot modal, `fr.js` entries. No network, no Worker, no new module. Named save slots are a real
   quality-of-life win on their own, and this release carries every headless test from §11.
2. **The Worker.** Lives in `worker/` in this repo but is **not** part of the Pages workflow, which
   builds `dist/` and nothing else (`.github/workflows/deploy.yml`); it deploys by hand with
   `wrangler deploy`. Verified against `worker/test.sh`. Zero client change, so this release is
   invisible and unbreakable.
3. **Sync in the client.** `sync.js`, the sync panel, the pairing sheet, the conflict prompt, the
   revised reset copy. Inert until a player pairs.

**Worker URL configuration.** `vite.config.js` already uses `define` for `__BUILD_STAMP__`; add
`__SYNC_URL__: JSON.stringify(process.env.SYNC_URL ?? '')` beside it, read through the same
`typeof` guard as `ui.js:18` so the module stays importable outside a Vite build. The Actions
workflow supplies `SYNC_URL` from a repository **variable**, not a secret — the URL is public the
moment the bundle ships, and pretending otherwise would just make it harder to debug. An empty
value disables sync entirely, which is what a fork, a local `node` import and `npm test` all see.

Rollback for release 3 is "unlink", which deletes one localStorage key and leaves the cloud row
intact for re-pairing.

## 13. What could be cut

Named deliberately, so the shortcuts are choices rather than omissions — and each with its ceiling.

- **The 10-second trailing debounce push (trigger 3, §6.3).** Run-end and tab-hidden carry the real
  cases. Ceiling: a tab closed from the title screen right after a shop spree loses those purchases
  until the next boot pushes them — and if the other device made progress meanwhile, that surfaces
  as a conflict prompt rather than as loss. Cheapest thing to drop first.
- **The `device` column and the lost-ACK rule (§6.4).** Cost of cutting: an occasional conflict
  prompt where both sides are actually the same save, after a dropped response. Annoying, never
  destructive. Second cheapest.
- **`prev_blob`/`prev_gen` (§7.3).** One column pair with no reader until a player emails. Cutting
  it makes "Keep this device's" irreversible. Keep it; it is the cheapest insurance in the design.
- **Stashing the discarded *local* blob** on "Take the cloud's", for symmetry with `prev_blob`. One
  extra localStorage key. Not in the main design because the player explicitly chose to discard it;
  add it if support requests appear.
- **Compression, encryption, per-device tokens, code expiry, a retention sweep.** All rejected
  above with their evidence; each has a clean upgrade path precisely because the Worker never
  parses the blob and the client owns the code.

## 14. Open questions

1. **Who operates the Worker, on whose Cloudflare account?** The design assumes a single operator
   for the canonical deploy. A fork gets an empty `__SYNC_URL__` and no sync at all, which is the
   right default but should be a stated intention rather than an accident.
2. **What should pairing do when the second device's synced slot already has a save?** As designed,
   the PUT 409s and the standard four-field prompt appears — one save survives. A better experience
   might be a third option at pairing time only: *"Keep both — put the cloud save in slot 3."* The
   machinery exists (three slots, `importSlot`, the slot picker), but whether the extra branch earns
   its place is a product call, not something the codebase can settle.
3. **May the player change which slot syncs after pairing?** Default assumption: yes, re-pointing is
   allowed and the next push overwrites the cloud with the newly designated slot. That is a policy
   choice with a destructive edge, and it may deserve its own confirm.
4. **Where does the sync entry point live on the title screen?** It already carries 🌐 and 💾 in its
   corners plus a coins badge, and a 320px phone is the constraint that decides. My recommendation
   is a third corner button next to 💾 (sync and slots are the same mental category), but that needs
   to be seen on a real phone before it is fixed.
5. **Should the daily challenge care about sync?** Investigated and, as far as the save is
   concerned, no: nothing in `meta` records daily participation (the fields are `coins`, `shop`,
   `best`, `runs`, `choiceSlots`, `chapter`, `chapters`, `lang`), so there is no per-day flag that
   two devices could disagree about or that a player could double-dip by switching devices. Noted
   because it is the kind of thing that gets assumed rather than checked — but if a daily streak or
   a once-per-day reward is ever added to `meta`, it becomes the first field where sync and fairness
   interact, and it should be designed with that in mind.
