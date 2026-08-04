# Cross-device save sync — design + technical strategy

**Date:** 2026-08-03, revised 2026-08-04
**Status:** Revised after adversarial UI/UX + edge-case review (§14.3); all product calls settled (§14.1, §14.4). Not implemented; plan to follow.
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
directly (line 4: `import { createRun, loadMeta, saveMeta, ensureChapterMeta, activeSlot,
setActiveSlot, slotSummary, SAVE_SLOTS } from '../src/state.js'`) and stubs one browser global to
make that work — `globalThis.localStorage`. Node 22 ships a global `fetch`, so a network call inside
`loadMeta`/`saveMeta` would not throw during `npm test`; it would **silently attempt a real request**
on every save the suite performs. A test suite that quietly talks to the internet is worse than one
that fails.

Correcting an earlier draft, which said that stub appears "exactly once, in `testSaveSlots`": it is
installed at **five** sites (`sim-test.js:1763`, `1826`, `1878`, `1941`, `7105-7110`), and the one at
`1941` is `{ getItem: () => …, setItem: () => {} }` — a **no-op `setItem` that reports success**.
Under §3.2's `saveMeta` that sets `ok = true`, so the hook would fire there too. The conclusion
still holds — nothing in the suite calls `setSaveHook`, so `saveHook` stays `null` and no request is
attempted — but it holds because of the wiring, not because the suite only saves once. The residual
risk is real: five scenarios call `saveMeta` against a succeeding `setItem`, so the moment anything
installs a hook at module scope, the suite starts firing it. §11 adds a guard asserting `saveHook`
is null after a full run.

Second reason: `loadMeta()` is synchronous and is the first statement of `boot()` (`main.js:17`).
Sync cannot be part of it. `main.js` may not use top-level `await` (the Pixi v8 blank-page
constraint), and sync must never block boot regardless — a player on a train opening the PWA must
get the title screen at the same speed as always.

So the table gains one row:

| File | Role | May NOT touch |
|------|------|---------------|
| `sync.js` | **Cloud save sync.** Owns the pairing credential and its own localStorage key, decides when to pull/push, talks to the Worker, hands `main.js` a decision. Never parses gameplay data beyond the summary fields. | Pixi, DOM (incl. event listeners), `run`, `sim.js`, `render.js`, save-slot localStorage keys *directly* |

Two clauses of that row would otherwise be violated by this very design, so `main.js` owns them:

- **`run === null` is the safety invariant behind §3.3, and `sync.js` cannot read it.** `run` is a
  `let` local inside `boot()` (`main.js:19`) — not exported, not reachable from another module. So
  `main.js` passes an **`isIdle()` predicate** into `sync.js` at wiring time, and `sync.js` calls it
  before any adopt. Without this the invariant is prose with no implementation.
- **`visibilitychange` / `pagehide` are DOM registrations.** §6.3 needs them for both pull and push.
  They are registered in `main.js` — which is where §3.1's own rule puts them ("`main.js` stays glue:
  it wires `sync.js`'s callbacks") — and call into `sync.js`.

The "save-slot localStorage keys *directly*" wording is deliberate: `sync.js` reaches slots only
through `state.js`'s `exportSlot`/`importSlot`, and never constructs a key.

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

and `saveMeta` fires it **only on a successful write**, in its own try/catch, with a one-way freeze
latch in front of everything:

```js
let saveHook = null
let frozen = false
export function setSaveHook(fn) { saveHook = fn }
export function freezeSaves() { frozen = true }   // one-way; only a reload clears it

export function saveMeta(meta) {
  if (frozen) return                              // an adopt is committing; do not write over it
  const key = boundKey ?? slotKey(activeSlot())
  meta.savedAt = Date.now()
  let ok = false
  try { localStorage.setItem(key, JSON.stringify(meta)); ok = true } catch { /* private mode */ }
  if (ok) { try { saveHook?.(boundSlot ?? activeSlot()) } catch { /* sync is best-effort */ } }
}
```

Three details matter, and the middle one is a correction to an earlier draft of this document.

**The hook is wrapped.** An earlier draft fired it outside any catch, reasoning that *"a throwing
hook surfaces as a real error instead of being mistaken for private mode."* That reasoning is wrong
about where the throw lands. `saveMeta` is called by `endRun` (`main.js:329`), which is called from
inside the Pixi ticker callback (`main.js:357-358`), and PixiJS does not catch listener exceptions —
so a throwing hook takes down the frame loop, in the one code path that has just banked a run's
coins. §8's rule ("every sync failure resolves to do-nothing-and-retry") wins over the diagnostic
convenience, and the separate try/catch keeps both properties anyway: a localStorage failure is
still distinguishable from a sync failure, because they are now two different catches.

**Firing only on success** means a device whose localStorage is refusing writes never uploads state
it is about to forget.

**The freeze latch** exists for §3.3 and is explained there. In short: writing a blob to disk and
then leaving live event handlers able to write over it before the reload commits is not safe, and
this codebase has no unload handler that would have caught it.

The hook receives a **slot number**, not a key: `state.js` keeps a module-level `boundSlot`
alongside the existing `boundKey` (both set on the same line of `loadMeta`, `state.js:107`), so key
construction stays entirely inside `state.js` and `sync.js` never learns the shape of a save key.
`sync.js` compares the slot number against the one it syncs and ignores everything else.

**The hook is a nudge, not the truth.** It tells `sync.js` *when* to re-evaluate; it never sets a
"needs pushing" flag. See §6.2 — `dirty` is derived from the save's content hash, precisely so that
a save the hook never announced (an old cached bundle, a second tab, a future ninth call site)
cannot go unnoticed.

`state.js` also gains the two raw accessors `sync.js` needs, next to `slotSummary` (which already
does raw-read-without-migrating):

- `exportSlot(n)` → the slot's raw JSON string, or `null`. This is what gets pushed — **not**
  `JSON.stringify(meta)` of the live in-memory object, which may have been mutated since the last
  save. What we promise the cloud is exactly what is on disk.
- `importSlot(n, json)` → **validates shape, not syntax**, then writes.

That second point is a correction to an earlier draft, which said only *"parses first, refuses to
write if it does not parse."* A parse check does not prevent the wipe it was written to prevent.
`loadMeta` recovers to a **fresh save** — silently, via its `catch { /* corrupted save -> fresh */ }`
at `state.js:145` — for any blob whose shape it does not expect, and all of the following are
perfectly valid JSON. Verified by executing the real `loadMeta`:

| blob | `loadMeta` result |
|---|---|
| `{"coins":5,"chapters":{}}` (no `shop` key) | **fresh save — total wipe** |
| `{"coins":5,"shop":"x","chapters":{}}` | **fresh save — total wipe** |
| `{"coins":5,"shop":{},"chapters":"zzz"}` | **fresh save — total wipe** |
| `{}` | **fresh save — total wipe** |
| `null` | **fresh save — total wipe** |

The mechanism is `loadMeta:119` — `for (const id of Object.keys(SHOP)) m.shop[id] ??= 0` throws a
`TypeError` when `m.shop` is absent or not an object, and the catch swallows it. Every one of those
blobs passes a parse check, gets written to disk, and the reload lands the player on a fresh save
with their slot gone. This is reachable three ways with no attacker at all: a truncated response
body, an old-format save predating a field, or a blob written by a future build.

So `importSlot` validates:

```js
const m = JSON.parse(json)                        // throws -> refuse
if (typeof m !== 'object' || m === null) return false
if (typeof m.shop !== 'object' || m.shop === null || Array.isArray(m.shop)) return false
if (m.chapters != null && (typeof m.chapters !== 'object' || Array.isArray(m.chapters))) return false
```

and refuses on any failure. A refused import is reported to the player, never silent (§8).

### 3.3 Adopting a cloud save = write + reload

`main.js` creates one `meta` object at boot (`main.js:17`) and passes it by reference into
`initUI({ meta })`, which destructures and closes over it forever (`ui.js:180`). You cannot swap
that object out; `ui.js` would keep rendering the old one.

The codebase already has the answer, twice. `onReset` (`main.js:218`) and `onSlot` (`main.js:224`)
both mutate localStorage and call `location.reload()`, and `state.js:36-37` states the rule
outright: *"The caller … reloads the page right after, so every module re-reads `loadMeta()`
against the new slot rather than reconciling in-memory state."*

**Adopting a cloud save is `freezeSaves()`, then `importSlot(slot, blob)`, then commit the sync
record, then `location.reload()` — in that order.**

An earlier draft said *"same idiom, one line, provably correct"* and cited `onReset`/`onSlot` as
precedent. The citation is right and the conclusion was wrong: those two are safe for a reason that
does not transfer.

`location.reload()` queues a navigation; it does not stop script execution. There is **no
`beforeunload`, `pagehide` or `unload` handler anywhere in this repo** (verified: zero matches
across `src/`, `public/` and `index.html`), so the hazard is not an unload race — it is that **live
event handlers keep firing until the navigation commits**, tens to hundreds of milliseconds later,
longer with a request in flight. Any of them calls `saveMeta` with the *stale in-memory* `meta`:

- the chapter carousel's `settle`, from its own 130 ms `setTimeout` (`ui.js:471-476` →
  `main.js:171-176`) — no new tap required, a scroll already in progress is enough;
- a difficulty pip (`main.js:165`), the 🌐 toggle (`main.js:134`), a shop purchase (`main.js:144`).

That alone overwrites the freshly adopted blob with the pre-adopt save. What makes it a *sync* bug
rather than a local one is what happens next: that same `saveMeta` fires the §3.2 hook, and the
sync record has **already** been advanced to `baseGen = cloud.gen`. So the next push is
`{baseGen: <current>, blob: <stale local>}`, the server accepts it because nobody else moved, and
the other device's session is overwritten **with no 409 and no conflict prompt**. The entire
conflict machinery is bypassed precisely because the adopt half-completed.

`onReset` and `onSlot` are immune only incidentally — a clobber there rewrites a save that is about
to be erased anyway, or one bound to a different key. Adopt has no such immunity, so it needs the
explicit latch: `freezeSaves()` sets a one-way flag that makes every subsequent `saveMeta` a no-op
until the reload clears it with the whole JS context. Belt and braces, `setSaveHook(null)` too.

**Every adopt path takes the latch** — the boot/visible pull (§6.3), the pairing adopt (§5.3), and
"Take the cloud's" (§7.3).

The consequence is a real constraint: a reload destroys an in-progress run, so **sync only adopts
when `run === null`**. See §6.3 for the trigger list and §3.1/§12 for how `sync.js` learns that,
given `run` is a `let` local inside `boot()` (`main.js:19`) and is not reachable from another
module at all.

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

**Three fields** — `name`, `savedAt`, and `schema` (the last added by the tech strategy's §2.4,
where its reasoning lives: it is the only defence against a stale build pushing an older blob at a
valid `baseGen`, which the generation counter cannot catch because it orders writes, not versions).
All repaired on load with the `??=` idiom `loadMeta` already uses for `m.chapter`,
`m.choiceSlots` and `m.lang` (`state.js:130-142`) — the same repair-on-load discipline as
`ensureChapterMeta` (`state.js:93-104`), which is why no migration branch is needed.

**`meta.name`** — the save's display name (owner requirement 2). Default `m.name ??= ''`.

Empty means unnamed, and `ui.js` renders the fallback (`Save 1`, `Save 2`, …) at display time. It
must **not** default to a baked English string: the i18n contract (v6.1) is that English source
strings are the French dictionary's keys and translation happens in `ui.js` at render time, so a
name written into the save on a French device would be a stale English literal travelling to every
other device forever. An empty string has no language.

`meta.name` is the **first player-authored free text in this codebase**, it is interpolated into
`innerHTML` (the title screen, the slot modal, the conflict prompt), and — uniquely — it arrives
**from the network**. `state.js:54-55` already documents the shape of this hazard for a value that
merely came from localStorage:

> *"`Number()` both normalizes odd shapes and defuses a tampered string coins (`"<img onerror=…>"`)
> that the slot modal would otherwise interpolate into innerHTML."*

There is no HTML-escaping helper anywhere in `ui.js` today — every interpolated value is either a
number or a trusted config/i18n string, so the templating style has never needed one.

**`name` is not the dangerous field, and an earlier draft of this section got that wrong.** It
specified `esc()` "applied to `meta.name` at every render site" and left every other field alone,
having just quoted the comment that explains why `coins` is dangerous. But that `Number()` hardening
lives in `slotSummary` (`state.js:54-55`, covered by test `SS.g`), **not in `loadMeta`** — `loadMeta`
never touches `coins` or `runs` at all. Until now that was fine, because nothing arrived from
outside the device. Verified by executing the real `loadMeta` against a tampered blob:

| field in blob | after `loadMeta` |
|---|---|
| `"coins": "<img src=x onerror=alert(1)>"` | `"<img src=x onerror=alert(1)>"` — **untouched** |
| `"runs": "<svg onload=alert(2)>"` | `"<svg onload=alert(2)>"` — **untouched** |
| `"shop": {"hp": "<b>X</b>"}` | §4.2's `upgrades` reduction returns `"0<b>X</b>00000000"` |

and `${meta.coins}` is interpolated raw into `innerHTML` at **three** live sites — `ui.js:491`
(the title coins badge), `ui.js:717` (the shop balance) and `ui.js:1132` (the reroll button). Since
§3.4 has the Worker storing an opaque blob it never parses, **every field is attacker-controlled**
for anyone holding a pairing code, and §10 concedes the code is an unrevocable bearer token. There
are two sinks, and the first one fires *before* the player decides anything: the conflict prompt
renders both summaries, so merely **reading** the comparison is the attack. The second is the next
boot, post-adopt. XSS on the game's own origin means reading and rewriting all three save slots and
the sync record itself.

So the rule is the boundary, not the render site:

1. **`importSlot` normalises before it writes** (§3.2) — `Number(m.coins) || 0`, `Number(m.runs) || 0`,
   the `name` clamp below, and the shape validation. Killing the class at the boundary beats
   escaping at N render sites, because N grows.
2. **`loadMeta` coerces too** — `m.coins = Number(m.coins) || 0`, `m.runs = Number(m.runs) || 0`.
   The same hardening `slotSummary` already has, at the site that actually feeds the UI. This is
   worth doing on its own merits and is the one fix here that improves a shipped build.
3. **§4.2's `upgrades` reduction becomes** `reduce((s, l) => s + (Number(l) || 0), 0)`.
4. **`esc()` on every interpolated summary value**, not just `name` — belt and braces behind 1–3.

The `name` clamp (control characters stripped, `nowrap`/`ellipsis` at the render site) is applied
**on receive/parse, not on adopt**. An earlier draft said "on input and on adopt", but the conflict
prompt renders the cloud's `name` *before* adopt — that is its entire purpose — so an adopt-time
clamp lets a 4 KB name reach the modal exactly as feared. The character limit is a layout question,
settled in §9: a `.slot-row` has ~193.6px of inner width and must also carry the slot label, a
status glyph and a rename affordance, so 24 characters does not fit and the cap is **14**.

**`meta.savedAt`** — epoch milliseconds, stamped by `saveMeta` on every write (§3.2). Default
`m.savedAt ??= 0`.

This is the device's own clock, and clock skew between a phone and a laptop is normal.
**The timestamp is shown to the human and never used by the protocol to decide anything.** Ordering
is the generation counter's job, always (§6.2). A sync design that resolves conflicts by comparing
wall clocks is a sync design that loses a session whenever a device's clock is wrong.

That sentence has to be qualified, because an earlier draft stated it absolutely and then broke it
three times in the same document. All three are corrected in place — §6.4 no longer keys the
lost-ACK check on `savedAt`, and §6.3's pull throttle uses `Math.abs` — but the honest statement of
the rule is: **no clock value ever orders two saves.** Where a clock is unavoidable (a throttle
window, a human-readable "8 minutes ago"), it is used for a duration or for display, never for
"which of these is newer."

Rendering rules, which §7.2 must implement and an earlier draft left contradictory:

- **`savedAt === 0` or absent renders "unknown"**, not a date. §4.1 said "unknown" while §7.2 said
  `Intl.RelativeTimeFormat` under a day and an absolute time beyond it — under which `0` renders
  *"1 January 1970"*. That lands on the first sync after upgrading, which is exactly when it is
  most confusing.
- **A `savedAt` in the future renders "unknown (clock differs)".** `Intl.RelativeTimeFormat` with a
  positive delta happily renders *"in 3 hours"*. Clamp anything more than 60 s ahead.
- **When the clock disagrees with the generation counter, say so.** The machine knows which save is
  newer (§6.2); if the older generation carries the later `savedAt`, the prompt shows a one-line
  warning rather than letting the misleading number stand. This matters because in the prompt *the
  human is the decision function*, and `savedAt` is the only row carrying recency — every other row
  can legitimately move **down** on the newer save, since coins get spent (§7.1).

Note also that `loadMeta`'s repairs are **in-memory only and never written back**, so a save that
has not been re-saved since the upgrade has no `savedAt` key *on disk* — and §3.2 pushes
`exportSlot`, "exactly what is on disk". The defaults must therefore also be added to `loadMeta`'s
`fresh` object literal (`state.js:146-155`), which has neither field today, and `saveSummary` must
tolerate both being absent (§4.2).

All three fields are additive, and `loadMeta` returns the parsed object wholesale after patching, so
unknown keys survive a round-trip: a save written by the new build still loads correctly in the old
build, and a save that visits an old build and comes back keeps its new fields. (One exception, for
accuracy: the v4→v5 migration `delete`s `m.difficulty`/`m.maxDifficulty` at `state.js:127-128`.)
The rollout cannot corrupt anything mid-flight.

### 4.2 The save summary

Owner requirement 3: the conflict prompt shows, per side, the furthest chapter and the difficulty
beaten there, the total upgrades owned, the save time, and the coins. Three derive from data that
already exists. A new pure export in `state.js`, next to `slotSummary`:

```js
export function saveSummary(meta)
// → { name, coins, upgrades, runs, chapterId, beaten, savedAt }
```

**`saveSummary` must be total.** It runs on a **raw downloaded blob**, not on a `loadMeta`-repaired
object — §3.4 requires exactly that, since the Worker does not parse and both sides are derived
client-side. An earlier draft wrote it as a set of direct property accesses, each of which throws on
a realistic blob:

- `chapters[chapterId].maxDifficulty` — `furthestUnlockedChapterId` defaults to `CHAPTER_ORDER[0]`
  when nothing is unlocked (`ui.js:73-79`), so a blob with `chapters: {}` (a legitimately fresh
  save) gives `chapters['body'] === undefined` → **TypeError**.
- `Object.values(meta.shop)` → **TypeError** on any blob missing `shop`, which §3.2's table shows is
  reachable without an attacker.
- `Intl.RelativeTimeFormat().format(NaN)` → **RangeError** when `savedAt` is absent, which §4.1
  shows is the normal state of any save not re-written since the upgrade.

A throw mid-render leaves the modal half-drawn over the title screen — and §7.2 deliberately
disables backdrop-tap and Escape, so **the player is locked out of the game** and has to clear site
data, destroying all three slots, to recover. Every access is therefore guarded, every numeric is
`Number(x) || 0`, a missing or garbage `chapters[chapterId]` yields `beaten: 0`, and §7.2 wraps the
whole render in a try/catch that falls back to a "this save could not be read — keep local" state.

- **coins** — `Number(meta.coins) || 0` (§4.1: never the raw value).
- **upgrades** — `Object.values(meta.shop ?? {}).reduce((s, l) => s + (Number(l) || 0), 0)`. The
  unguarded form of this expression already exists as `owned` in `ui.js`'s `shopFootHtml` (line
  560); reuse the idiom so the shop's sacrifice meter and the conflict prompt can never disagree
  about what "upgrades owned" means, but not the missing coercion.
- **runs** — `Number(meta.runs) || 0`. Added after review: it is already in `meta`, costs nothing,
  and is the single best "which of these is my main save?" tiebreaker in the whole blob — better
  than coins, which §7.1 proves runs *backwards* (the more advanced save often shows fewer coins,
  because coins get spent).
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
  blob       TEXT,                 -- the meta JSON verbatim, opaque to the Worker; NULL = tombstone (§5.4)
  saved_at   INTEGER NOT NULL,     -- writer's clock, epoch ms — display only, never compared
  device     TEXT    NOT NULL,     -- last writer's device id; used only for the lost-ACK check (§6.4)
  req_id     TEXT    NOT NULL,     -- last writer's per-push idempotency key (§6.4)
  updated_at INTEGER NOT NULL,     -- server clock, epoch ms — write throttle + any future sweep
  prev_blob  TEXT,                 -- the blob this write replaced; operator-only undo (§7.3)
  prev_gen   INTEGER
);
```

`req_id` replaces the earlier draft's reliance on `saved_at` for lost-ACK detection (§6.4);
`saved_at` remains stored, but exclusively for display. An earlier draft also carried
`writes_day`/`writes_n` for a per-code write cap — deleted, because the Workers rate-limiting
binding does that job with no schema (§10). `updated_at` lost its last reader when the 1-second
throttle went with it; keep it only if something is named that will read it.

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

**Linking on the first device uploads immediately, and no code is shown until the upload is
ACKed.** This is push trigger 4 (§6.3), and it exists because an earlier draft had none: linking
mints a code and writes a localStorage record, which is not a `saveMeta`, so it matched none of the
push triggers. The result was a flow that could not work — device A shows a code, the player walks
to the laptop and types all sixteen characters correctly, and gets a **404**, because A never
uploaded. §8's message for that case read *"No save found for that code — check the letters."* The
letters were fine, and the player would retype the code several times before concluding the feature
is broken, on the one screen where their patience is already spent.

So the pairing UI has explicit states — *uploading*, then *ready* — and the code appears only in
the second. The 404 copy must also cover both of its causes, since §6.1 documents that a 404 means
"no row under this code (never synced, **or** code mistyped)" and the old copy asserted only one of
them. (It was also wrong on its face: Crockford base32 is letters *and* digits.) Exact strings are
in §9.

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
  "code":       "A7K3-9WQM-2FTX-B4NE", // the bearer token
  "slot":       2,                     // which LOCAL slot this device syncs — device-local by design
  "device":     "b6f1…",               // crypto.randomUUID(), once, for the lost-ACK check
  "gen":        7,                     // baseGen: the generation the local save descends from
  "syncedHash": "9f2c…",               // hash(exportSlot(slot)) as of generation `gen`
  "reqId":      "3a70…",               // per-push idempotency key, for the lost-ACK check
  "pulledAt":   1754251180000          // last successful GET, for the pull throttle
}
```

**There is no `dirty` boolean, and no `sentAt`.** Both were in an earlier draft and both were
unsound; the replacements are `syncedHash` and `reqId`. The reasoning is in §6.2 and §6.4, and it is
the single highest-leverage correction in this document.

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
3. **`resetSave()` would destroy it.** `state.js:166-168` does `localStorage.removeItem(boundKey)` —
   the whole blob. A credential inside the blob is erased by the shop's "Erase everything" button,
   orphaning the cloud row with no code left to reach it. The player would have locked themselves
   out of their own cloud save by resetting a local one.

The sync record survives `resetSave()` precisely because it is a different key.

### 5.3 The second device names the destination slot

**Owner decision (2026-08-04).** When device B enters the code, it does not adopt the cloud save
into whatever slot happens to be active. It asks: *"Where should this save go?"* — the three slots
listed with their existing summaries, exactly the rows `slotsModalHtml` already renders. The player
points at one. That slot becomes this device's synced slot (the `slot` field of §5.2).

This is a better rule than automatic placement, and it removes a case rather than adding one. The
design previously had to answer "what if every slot is occupied", because an automatic *keep both*
needs somewhere free to put things; an explicit picker has nothing to fall back from. The two
outcomes now follow from what the player pointed at:

- **An empty slot** → `importSlot(slot, cloudBlob)`, `baseGen = cloud.gen`, `dirty` clear, reload.
  Nothing is destroyed and no prompt appears. This is the common path, and the one the owner's use
  case walks: a phone save arriving on a laptop that has a free slot.
- **An occupied slot** → the comparison prompt of §7.2, that slot's save on the left and
  the cloud's on the right. The player is choosing to overwrite *this specific save*, having just
  read what is in it.

The distinction that matters: an overwrite still happens, but only where the player aimed it, and
never as a side effect of linking two devices. Pairing is a moment when the player is thinking
"connect these", not "spend one of my three saves" — so the destructive branch must be one they
steered into, with both saves' contents in front of them.

Slot rows in the picker keep working the way they already do; the pairing flow reuses the component
and changes only its heading and its callback.

### 5.4 Reset interacts with sync, and must say so

Given the record survives, what should "Reset all progress" do when it targets the synced slot?
Two coherent answers: unlink sync and leave the cloud alone, or propagate the wipe.

**Propagate.** A player who has deliberately linked their devices expects them to agree; the
surprising outcome is the laptop re-uploading the old save an hour later and un-resetting the
phone. The confirm copy must therefore state the true scope — see §9.6 for the two conditional
bodies that replace today's static string.

**Owner decision (2026-08-04): reset writes a tombstone.** An earlier draft specified *"`onReset`
pushes the fresh save before reloading, with a 2-second bound, falling back to reset locally now and
push on the next boot."* That is not implementable, and its fallback delivers the exact outcome this
section promises to prevent — the reasons are below, kept because they are what rules out the
obvious repair of "just push a bit harder."

**Why the push-based mechanism fails**, three independent ways:

1. **There is nothing to push.** `resetSave()` (`state.js:166-168`) is a bare
   `localStorage.removeItem(boundKey)` — the key is *gone*, and `exportSlot(n)` returns `null`. The
   "fresh save" exists only in memory, and only after a reload. Pushing `null` or `""` either gets
   refused by §3.2's hardened `importSlot` or, without it, wipes the other device via `loadMeta`'s
   catch. Every resolution of the unspecified case is one of §3.2's two hazards.
2. **The fallback has no trigger, and silently un-resets the player.** With `dirty` derived from a
   content hash (§6.2), a wiped-then-reloaded device hashes its *fresh* save and compares against a
   `syncedHash` from before the wipe, so it does read as dirty — but only if the record survives in
   a coherent state, and the earlier draft's boolean version did not set anything at all, because
   nothing calls `saveMeta` at boot (verified in §6.3). Under that draft the sequence was: reset
   offline → record still says `{gen: 7, clean}` → the other device pushes gen 8 carrying the
   pre-reset progress → the wiped device pulls, sees `8 > 7` and not dirty, and **adopts it
   silently**. Every coin and chapter the player deliberately erased comes back, with no message.
3. *(An earlier draft had a third failure here: the 1-second same-row PUT throttle would 429 a
   Reset tapped moments after a run ended, dropping it straight into failure 2. That throttle is now
   deleted — §10 — so this failure is gone rather than mitigated.)*

**The mechanism: `DELETE /v1/save` writes a tombstone** — the row survives with `blob = NULL` and
`gen` incremented like any other write (§6.1). Three properties follow, and each answers one of the
failures above:

1. **A tombstone is distinguishable from an empty save.** The other device sees a deliberate
   deletion, not a blob it has to guess about — which is what removes failure 1 entirely, since
   there is no blob to push and none is pushed.
2. **It is ordered by the generation counter**, like everything else. A device holding pre-reset
   progress that pushes *after* the tombstone simply conflicts, and the player is asked; a device
   that pulls *after* it gets the deletion. Failure 2 required a device to look clean while holding
   a stale generation, and a tombstone advances the generation.
3. **Failure 3 no longer exists**, because the 1-second same-row throttle that caused it has been
   deleted outright (§10) — the generation counter already orders writes and `reqId` already makes a
   retry idempotent, so it was preventing nothing while breaking this. `DELETE` is idempotent
   regardless: repeating it against an already-tombstoned row is a no-op returning the current `gen`.

If the `DELETE` cannot complete within a 2-second bound, **the player is told before the local
wipe**, never promised a retry that has no trigger:

- `Erased here. Your other devices still have this save — open the game there and erase it too.` (90)
- `Effacé ici. Vos autres appareils ont encore cette sauvegarde — ouvrez le jeu là-bas pour l'effacer aussi.` (105)

and the local device unlinks, so it cannot later re-adopt what it just erased.

**A wipe arriving on the other device is announced, not applied silently.** Even on the happy path
the earlier draft's experience was: open the game → it reloads by itself → everything is gone → no
text, ever. That is indistinguishable from save corruption and is the most likely source of a "the
game deleted my save" report. So a tombstone is the one pull that is **confirmed before it lands**:

- title: `This save was erased` (20) / `Cette sauvegarde a été effacée` (30)
- body: `You erased it on another device. Erasing it here too keeps your devices in step.` (79) /
  `Vous l'avez effacée sur un autre appareil. L'effacer ici aussi garde vos appareils synchronisés.` (95)
- buttons: `Erase here too` (14) / `Effacer aussi ici` (17), and `Keep it here` (12) /
  `La garder ici` (13) — which **unlinks** rather than wiping. Two devices disagreeing about whether
  a save should exist is the player's call to make, not the protocol's, and the one device they are
  holding is the one they can still speak for.

`sendBeacon` is not usable in any variant — it cannot carry an `Authorization` header.

## 6. Sync protocol

### 6.1 Endpoints

Two, and the client mints its own code.

```
GET /v1/save
  Authorization: Bearer <code>
  200 { gen, blob, savedAt, device, reqId }
  404                                  no row under this code (never synced, or code mistyped)
  401                                  malformed code
  429                                  rate limited

PUT /v1/save
  Authorization: Bearer <code>
  { baseGen, blob, savedAt, device, reqId }
  200 { gen }                          accepted; gen === baseGen + 1
  409 { gen, blob, savedAt, device, reqId }   stale baseGen — the current row comes back with it
  400                                  blob too large or unparseable envelope
  401 / 429

DELETE /v1/save
  Authorization: Bearer <code>
  { baseGen }
  200 { gen }                          tombstoned: blob = NULL, gen incremented
  409 { gen, blob, savedAt, device, reqId }   stale baseGen — same shape as PUT
  401 / 429                            (exempt from the 1-second same-row throttle, §5.4)
```

**Three endpoints, and `blob: null` is a first-class value.** A tombstone is an ordinary row with
`blob = NULL` and a bumped `gen`, so it travels through the generation machinery unchanged — a
`GET` returns it, a stale `DELETE` 409s like any stale write, and a device that pushes after one
conflicts normally. Nothing in §6.2's decision table needs a new row; only the *adopt* step branches,
on `blob === null` → the confirm of §5.4 rather than `importSlot`.

**The `DELETE` statement must not reuse the PUT's shape, or the deletion does not delete.** The PUT
opens with `SET prev_blob = blob, prev_gen = gen` — copy that into `DELETE` and erasing a save
**writes the player's full save into `prev_blob`**, leaving it on the server after they were told it
was gone. That would make "Erase everything" a lie and hollow out the one operation that carries a
data-deletion promise. So:

```sql
UPDATE saves
   SET blob = NULL, prev_blob = NULL, prev_gen = NULL,
       gen = gen + 1, saved_at = ?, device = '', req_id = ?, updated_at = ?
 WHERE id = ? AND gen = ?
```

Erasing `prev_blob` here is the point, not an oversight: the operator undo of §7.3 exists to recover
a *mis-tap*, and a deliberate deletion is the one case where retaining a copy is exactly wrong. With
that, `DELETE` is the whole proportionate data-deletion story for a save holding anonymous
progression plus one 14-character name.

`DELETE` is idempotent: repeating it against an already-tombstoned row is a no-op returning the
current `gen`, which is what makes the throttle exemption safe.

`baseGen: 0` means *"I believe no row exists"* and maps to `INSERT … ON CONFLICT(id) DO NOTHING`;
zero rows affected produces the same 409 as any other stale write, carrying the existing row. So
**one client-visible code path covers first write, ordinary write, and conflict** — including the
case where a player types a code on a device that already has local progress. There is no create
endpoint and no create response to lose.

To be precise about the server side, since an earlier draft said "one code path" and then showed
only the `UPDATE`: `baseGen: 0` takes the `INSERT … ON CONFLICT DO NOTHING` and every other value
takes the `UPDATE` below — two statements and a branch. Both are followed by a `SELECT` when zero
rows changed, to build the 409 body. Write the whole thing as a **D1 batch/transaction** so the
`SELECT` cannot observe a row written between the failed write and the read; the earlier draft left
that unstated.

Client-minted codes were chosen over server-minted ones for exactly that robustness: a lost
response to a server-side create leaves an orphaned row and a player holding nothing, while a lost
response to a client-minted PUT is resolved by retrying the same idempotent request with a code the
client already has.

The write is one statement — the generation check and the write are the same operation, so there is
no read-modify-write race even under concurrent pushes:

```sql
UPDATE saves
   SET prev_blob = blob, prev_gen = gen,
       blob = ?, gen = gen + 1, saved_at = ?, device = ?, req_id = ?, updated_at = ?
 WHERE id = ? AND gen = ?           -- ?  = baseGen
```

Zero rows changed → read the row and return 409 with it (in the same transaction, above).

### 6.2 The generation counter

`gen` is a plain integer, incremented by the server on every accepted write. The client stores the
generation its local save descends from (`record.gen`, "baseGen").

**`dirty` is derived, never stored:**

```js
const dirty = hash(exportSlot(record.slot)) !== record.syncedHash
```

An earlier draft made `dirty` a boolean that `saveMeta`'s hook set and a successful push cleared.
That is wrong in three independent ways, and all three are silent data loss:

1. **A save that lands while a push is in flight is invisible.** Phone finishes a run → disk is
   **B1**, push sent. 400 ms later the player buys a booster → disk is **B2**; the hook fires and
   sets `dirty = true`, which it already was — **a no-op, so the new data leaves no trace**. The
   ACK arrives, `dirty` clears, baseGen advances. Cloud holds B1, disk holds B2, and no trigger
   will ever push B2. The laptop then pulls B1 and adopts it; when it pushes, the phone adopts
   *that* and B2 is destroyed on both devices with no prompt. This needs no exotic timing —
   trigger 3 below is a push deliberately issued *while the player is still shopping*, so the
   window is seconds wide by design.
2. **Two tabs share the record with no atomicity.** localStorage has no compare-and-swap. Two tabs
   both read `{gen: 7}`, both push from it, one wins, the loser's 409 lands on a record the winner
   has already rewritten — and the loser's disk content is the one that survives locally while
   `dirty` reads false.
3. **An old cached bundle has no hook at all.** `public/sw.js` falls back to `caches.match(req)`
   when the network fails, so an offline boot serves the **previous build**. It writes the same
   slot key, advances real progress, and sets nothing. §3.2 argued the hook exists because "eight
   edits that a ninth call site will silently skip" — right instinct, wrong depth: an entire
   *build* is the ninth call site.

A content hash fixes all three at once because it asks the disk rather than trusting a writer. No
writer cooperation is required, so tabs, cached bundles and future call sites are all covered, and
a lost race is self-healing rather than silently cleared. `hash` can be any cheap non-cryptographic
32-bit string hash over ~900 bytes — this is a change-detector, not a security boundary.

The decision function stays pure:

| `dirty` (derived) | cloud `gen` vs baseGen | decision |
|---|---|---|
| false | equal | **nothing** — the common case |
| false | greater | **pull** — adopt, `importSlot` + reload (announced, see §8) |
| true | equal | **push** |
| true | greater | **conflict** — both sides moved from a common ancestor; prompt (§7) |
| any | **less** | **resync, then re-run this table** |

That last row was `push` in an earlier draft, with the parenthetical *"our baseGen wins the next
write anyway."* It does not. §6.1's write is `UPDATE … WHERE id = ? AND gen = ?` with `? = baseGen`;
if the row's `gen` is *lower* than baseGen, the predicate can never match, because the row only
counts up from where it is and each step is written by some other device using *its* baseGen. Zero
rows change → 409 → **a conflict prompt on every trigger, forever.** And it is reachable without a
database restore: §8 says a 404 outside pairing means "treat as `baseGen: 0` and push", so if device
B ever recreates a deleted row at gen 1 while device A holds baseGen 12, device A is permanently
wedged — and every wedge is a modal inviting the player to overwrite something. `cloud.gen < baseGen`
is not a decision, it is a desynchronisation: set `baseGen = cloud.gen` unconditionally and evaluate
the table again (which lands on `push` if dirty, `nothing` if not).

**On every successful push**, set `baseGen = gen` from the response and
`syncedHash = hash(<the exact blob that was sent>)` — not a fresh `exportSlot()` read, which may
already have moved. If the disk has changed since, the next evaluation derives `dirty = true` on its
own and the following push is a clean fast-forward rather than a conflict.

Nothing in this table consults a timestamp. That is the point, and §6.4 no longer breaks it.

### 6.3 When to pull, when to push

**Pull** — fire-and-forget, never awaited by `boot()`:

- on boot, after the title screen has rendered;
- on `visibilitychange` → visible, when `Math.abs(Date.now() - pulledAt)` is more than 10 seconds;
- **when `run` transitions to `null`** — i.e. `onQuit` (`main.js:211-215`), returning to the title
  from the pause or summary screen.

A pull may be issued at any time (a GET is harmless), but an *adopt* only happens when `isIdle()`
(§3.1), because adopting means reloading (§3.3).

**The third trigger and the `Math.abs` are both corrections, and the first one rescues the owner's
own use case.** An earlier draft listed only boot and `visible`, and gated the `visible` pull on
`run === null`. But `run` is set to `null` in exactly one place — `onQuit`, `main.js:212` — so
**the summary screen and the pause screen both have `run !== null`**. Walk the return leg of the
stated use case:

- Laptop plays, pushes → gen 8. The player closes the lid with the tab open **on the summary
  screen**, which is where a run ends.
- Phone plays → gen 9.
- The player reopens the laptop. `visibilitychange` → visible fires, but `run !== null`, so no
  adopt. The GET itself succeeds, so `pulledAt` updates and the 10-second throttle now suppresses
  retries. **Nothing ever re-evaluates**, because no trigger was tied to leaving that screen.
- The laptop plays a whole session on the stale gen-8 save, then pushes → 409 against gen 9 →
  the destructive prompt, with the phone's session on the line.

*"then back on my phone when I leave for work"* is the use case; that was its return leg landing on
the modal instead of the invisible handoff §1 promises. Two rules prevent it: pull when `run`
becomes `null`, and **never bump `pulledAt` for a pull whose adopt was blocked** — otherwise the
throttle remembers a decision that was never made.

The `Math.abs` guards a device whose clock steps *backwards*: a bare `Date.now() - pulledAt > 10_000`
goes negative and suppresses every pull for the duration of the jump, during which the device runs
on a stale save and accumulates divergence.

**Push** — three triggers, in owner-estimated order of importance:

1. run end (`endRun`'s `saveMeta`, `main.js:329`) — the one that carries a session's progress;
2. `visibilitychange` → hidden, and `pagehide`, while dirty — pocketing the phone;
3. a 10-second trailing debounce after any save on the synced slot, so a tab closed without ever
   being hidden loses at most ten seconds of menu shopping;
4. **immediately on linking** (§5.1), which is not a `saveMeta` and therefore matched none of the
   three triggers above. Without it, device A mints a code and never uploads, so device B types a
   *correct* code and gets a 404. See §5.1 — this was a real dead end in an earlier draft.

Trigger 3 collapses a burst of shop purchases into one request. Measured against the eight save
sites, this lands at roughly 3–5 pushes per session — against a 100,000-row/day allowance.

**Pushes are serialised per device.** Wrap every push in `navigator.locks.request('ca-sync', …)` —
universally available wherever Pixi v8 runs, the same availability argument §5.1 makes for `crypto`.
Two tabs otherwise interleave freely on a store with no compare-and-swap (§6.2, reason 2). The
derived `dirty` makes a lost race self-healing; the lock makes it rare.

A dropped push is never fatal: the hash still differs, so the next evaluation derives `dirty = true`
and retries. The worst case is that the other device pulls a slightly older generation, is not
itself dirty, adopts it, and gets corrected on the next pull. The failure mode degrades toward *a
stale but valid save*, never toward silent divergence — because the moment the second device has
its own changes, its hash differs, and the table above routes to the prompt.

One verified detail, which mattered more when `dirty` was a flag but is still worth recording:
nothing calls `saveMeta` at boot without a user action. In particular the chapter carousel does not
— `positionCarousel` scrolls programmatically and fires `scroll`, but `settle` early-returns when
the centred card already matches `browseChapterId` (`ui.js:471`, plus a second guard at `:474` on
`browseChapterId !== meta.chapter`), and `browseChapterId` is initialised from `meta.chapter`
(`ui.js:204`), which is the card `positionCarousel` centres. No spurious save on a freshly adopted
device, so no spurious conflict prompt.

### 6.4 The lost-ACK case

If a push is accepted but the response never arrives, the client keeps a stale `baseGen`. Its next
push 409s against a row that it wrote itself, and the player would be shown a conflict between their
save and their own save.

**The check is keyed on a per-push `reqId`, not on a timestamp.** The client mints
`reqId = crypto.randomUUID()`, writes it into the sync record *before* the request goes out, and
sends it as a column the server stores alongside the row. On a 409: if
`server.device === record.device` **and** `server.reqId === record.reqId`, this is our own lost
acknowledgement — set `baseGen = server.gen`, re-derive `dirty` from the disk hash (§6.2), no
prompt.

An earlier draft used `server.savedAt === record.sentAt`, where `sentAt` was "the `savedAt` of the
push currently in flight" — a `Date.now()` value. That broke §4.1's own rule that no clock decides
anything, and it broke the check in both directions:

- **False negative — the rule fails exactly when it matters.** Phone pushes B1 at `savedAt = T`;
  the server accepts, the response is lost. The player shops; `saveMeta` writes B2 at `T'`. The
  retry carries `sentAt = T'` and 409s against a row whose `savedAt` is still `T`. `device` matches,
  the timestamps do not → **conflict prompt, comparing the phone against its own older save**. Tap
  "Take the cloud's" and the shopping is destroyed. The rule only fired when *no save happened*
  between the lost push and the retry — while trigger 3 exists specifically to batch a burst of
  saves into that same window. It removed one member of the class it claimed to remove.
- **False positive — silent loss.** A device whose clock steps backwards can stamp two different
  saves with the same `savedAt`. Push B1 at T (accepted, ACK lost); clock rolls back; B2 also lands
  on T; the retry's `sentAt` matches the row's `savedAt` → "our own lost ACK" → adopt the gen and
  clear. **B2 is never pushed, and the flag is cleared over it.** Using a wall clock as an
  idempotency key is precisely the failure §4.1 swore off.

A `reqId` has neither failure: it is unique per attempt, the client cannot accidentally reproduce
one, and it is compared against a value the server echoes back rather than against a clock either
side owns. Resolution is always *adopt the gen, then re-derive `dirty`* — never an unconditional
clear, which is what turned this check into a data-loss path rather than a convenience.

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

It has exactly two entry contexts, and one component serves both:

1. **At pairing**, when the player aimed the cloud save at an occupied slot (§5.3).
2. **In steady state**, when a push 409s because both devices advanced from the same generation
   (§6.2) — the case the feature exists to survive.

They differ only in copy. Context 1 is a deliberate act with a known target, so its heading reads
*"Slot 2 already has a save"*; context 2 is news, so it reads *"Two versions of this save"*. The
rows, the data, the two buttons and the consequences are identical, which is the point of routing
both through one component: the choice a player makes about their progress should look the same
wherever it reaches them.

**Two stacked full-width cards, not a three-column table.** An earlier draft used side-by-side
columns; the arithmetic rules it out. At 320px, `.confirm-sheet` is `width: min(88vw, 340px)` =
281.6px, less 3px borders and 20px padding each side → **235.6px of content**. Three columns with a
66px label column leaves **~84px per side ≈ 14 characters** at 0.7rem. `The Undergrowth`
(`config.js`) is 15 characters *before* the difficulty suffix, and French runs 15–25% longer
(`Les Sous-Bois · niveau 3 battu` = 30). The layout is roughly 2× over budget in English and worse
in French, and `.confirm-sheet` is `text-align: center`, so every cell would need an override too.

Each card owns its own button, which also removes the "which button belongs to which column"
ambiguity:

```
              Two versions of this save
  ┌──────────────────────────────────────┐
  │ THIS DEVICE                8 min ago │
  │ 🐾 The Undergrowth          ★★★☆☆     │
  │ 12 runs · 42 upgrades · 🪙 1 204      │
  │           [ Use this one ]           │
  └──────────────────────────────────────┘
  ┌──────────────────────────────────────┐
  │ THE CLOUD                  yesterday │
  │ 🌌 The Beyond               ★★★★☆     │
  │  9 runs · 47 upgrades · 🪙 310        │
  │           [ Use this one ]           │
  └──────────────────────────────────────┘
           The other one is deleted.
                 [ Decide later ]
```

Height ≈ 20 + 24 + 12 + 130 + 12 + 130 + 12 + 18 + 12 + 44 + 20 ≈ **434px**, inside the 536px
budget at 320×568 even with the title wrapping to two lines in French.

Four things changed in the content, all of them corrections:

1. **Recency is promoted to the header.** It is the strongest signal for "which one has last
   night's session in it", and it was the *last* row before.
2. **`runs` is added** (§4.2) — the best "which is my main save" tiebreaker in the blob.
3. **Coins and upgrades share one line**, so the trade between them reads as a trade. §7.1 proves
   coins get *spent*, so the more advanced save routinely shows the **smaller** coin number — the
   earlier draft's mock put `Upgrades 42 vs 47` above `Coins 1 204 vs 310` as if they were peers,
   which invites the player to pick the save that is behind. The document identified that exact
   trap in §7.1 and then rendered it in §7.2.
4. **`beat 3` is replaced by the ★ row.** "beat N" is vocabulary this game has never used; progress
   is shown as numbered difficulty pips (`ui.js:404-408`) or the hero card's gold ★ row
   (`ui.js:250-258`, `:279`). Reusing the ★ row costs no horizontal pixels, is language-neutral,
   and means the card and the prompt can never state two different numbers. Introducing a third
   phrasing on the one screen where the player makes an irreversible choice is the worst place for
   it.

**The loser is deleted, and the prompt must say so.** Nothing in the earlier draft told the player
that the save they do not pick is destroyed. `The other one is deleted.` (25) / FR
`L'autre sera supprimée.` (23) is not optional copy.

Every value comes from `saveSummary` (§4.2), which must be **total** — see there for the three
throws that would otherwise leave this modal half-drawn. The whole render is wrapped in a try/catch
falling back to a "this save could not be read — keep local" state. Recency renders with
`Intl.RelativeTimeFormat` under a day and an absolute local time beyond it, in the active language,
with the `savedAt === 0` → "unknown" and future-clamp branches of §4.1. Every new string needs an
`fr.js` entry in the same commit — the standing i18n rule — and the French goes through an
adversarial review pass, never written alongside the English.

**There is a way out (owner decision, 2026-08-04):** `Decide later` (12) / `Plus tard` (9), styled
quietly below the two cards. At pairing it returns to the slot picker; in steady state it dismisses,
leaves the local save dirty, and the prompt returns on the next trigger.

An earlier draft offered no cancel at all, arguing *"the two saves have already diverged and the
decision is not improved by postponing it."* That argument is sound for the steady-state case and
**false for the pairing case**, which then inherited it: at pairing nothing has diverged, the player
has just typed a code and tapped a slot row, and the likeliest reason they are looking at this modal
is that they **aimed at the wrong row**. Handing that player two buttons, both of which destroy a
save, with no way back to the picker, is the design failing exactly the person it was built for.
The asymmetry decides it: postponing costs nothing, because both saves still exist either way,
while a mis-tap costs a session.

Backdrop-tap and Escape stay inert. That is defensible once a *labelled* exit exists — the risk was
never dismissibility, it was an accidental dismissal being indistinguishable from a decision.

**Guarding against mis-taps.** This modal appears unbidden over the title screen while the thumb
may already be travelling toward `.btn--play`, and two of its three buttons destroy a save. So: a 400 ms
tap shield after the sheet animates in (no such pattern exists in the codebase today, and note that
`pop-in` is disabled under `prefers-reduced-motion` at `styles.css:809`, which renders both buttons
*instantly*), and `Play` plus the nav are disabled while a conflict is pending. That last part is
load-bearing: `ui.js:1272` documents that keyboard focus can already reach Play behind a modal
backdrop, and the existing workaround (`case 'play'` force-closes `slotsOpen`) is unavailable to a
modal that must not be dismissible. Without it, Tab-then-Enter starts a run under the prompt, whose
held `cloudBlob`/`gen` are then stale — so the prompt must always re-derive from the current 409
response rather than from a cached one.

### 7.3 After each choice

In the pairing context the cloud's generation arrived on the GET; in the steady-state context the
409 response carried it. Everything below is the same either way.

**Keep this device's** → push with `baseGen = cloud.gen`.
That write is accepted (nobody else moved in between), the cloud row advances to `gen + 1` holding
the local blob, and `syncedHash` is set from the pushed blob. No reload — the local save was already
the truth on this device. The cloud's previous content is preserved in `prev_blob`.

**Take the cloud's** → stash the outgoing local blob (below), then `freezeSaves()`,
`importSlot(slot, cloudBlob)` (which refuses a malformed blob, §3.2), commit `baseGen = cloud.gen`
and `syncedHash = hash(cloudBlob)`, then `location.reload()`. The order matters and the freeze is
not optional — see §3.3. The local divergence is gone.

Committing the sync record **before** the reload is also what prevents a boot loop: a crash between
`importSlot` and the record write would otherwise leave a device that re-adopts on every boot.

**Decide later** → dismiss, change nothing. Both saves survive, the local one still hashes
differently from `syncedHash`, and the next trigger re-evaluates to `conflict` and asks again.
Because nothing is written, this is the only one of the three that is safe to reach by accident.

**Both sides are recoverable (owner decision, 2026-08-04).**

- *Cloud side* — `prev_blob`/`prev_gen`, one column pair and one clause in an UPDATE that already
  runs. There is **no endpoint and no UI** for it: an operator escape hatch, recoverable with one
  SQL statement when a player says they tapped the wrong button. Stated plainly so nobody mistakes
  it for a feature.
- *Local side* — one extra localStorage key holding the blob that "Take the cloud's" discarded,
  overwritten each time. An earlier draft left this out on the grounds that "the player explicitly
  chose to discard it", but that is the same argument `prev_blob` already rejects for the cloud
  side, and it applies to the button a player is **more** likely to hit by accident. Symmetry here
  is not tidiness; it is the difference between a recoverable mis-tap and a lost session.

**`prev_blob` covers exactly one generation, and that ceiling is stated rather than implied.** With
three devices diverging at once — a plane trip, an offline session each — the sequence B pushes, A
overwrites, C overwrites leaves **B's session unrecoverable even by the operator**: it is in no
column and on no device. A two-slot ring would cover it for one more `TEXT` column, and was
considered and declined: the realistic deployment is a phone and a laptop, which one generation
covers completely. If a third device ever becomes normal, this is the line to revisit.

## 8. Offline and failure behaviour

**localStorage stays the source of truth. Sync is best-effort and never blocks play or boot.**

Every entry point in `sync.js` is wrapped and every failure resolves to "do nothing, stay dirty,
retry on the next trigger" — the same swallow-and-continue idiom `state.js` already uses **six**
times over (`:31`, `:39`, `:57`, `:145`, `:161`, `:167`, each with a `/* private mode */` or
`/* corrupted save -> fresh */` comment saying why).

Status copy is **evidence, not intent** — see H3 in §9. Character counts are English / French.

- **Network failure, timeout, 5xx** — requests carry `AbortSignal.timeout(5000)`. No modal, no
  toast, no interruption; the local save has lost nothing. But the three cases must not share one
  message, because "offline" is a lie when the wifi is fine:
  - offline → `Offline — your progress is safe here.` (37) / `Hors ligne — ta progression est en sécurité ici.` (47)
  - 5xx → `Sync is down right now. Nothing is lost.` (40) / `La synchro est indisponible. Rien n'est perdu.` (46)
  - dirty and waiting → `Not uploaded yet — waiting for a connection.` (44) / `Pas encore envoyé — en attente de connexion.` (44)

  The earlier draft's `offline — will sync later` promised a retry it cannot keep if the app is
  never reopened online.
- **429** — same as offline, plus back off to the next natural trigger. Never retry in a loop.
- **404 on GET** — the row does not exist yet. Two causes, and §6.1 documents both, so the message
  must cover both: `No save under that code yet. Check the code, and make sure the other device says "Ready".` (88)
  / `Aucune sauvegarde pour ce code. Vérifiez le code, et que l'autre appareil affiche « Prêt ».` (91).
  The earlier draft's *"check the letters"* asserted only the mistype cause — and Crockford base32
  contains digits. Outside pairing a 404 means the row was deleted; treat as `baseGen: 0` and push.
- **`importSlot` refuses a blob** (§3.2) — never silent. The pull is abandoned, the local save is
  untouched, and the status reads `That cloud save could not be read. Your save here is untouched.` (61)
  / `Cette sauvegarde cloud est illisible. Celle-ci n'a pas changé.` (61).
- **Private browsing / localStorage throws** — `activeSlot()` already falls back to 1 and
  `saveMeta` already no-ops. `sync.js` reads its record inside a try/catch; on a throw it returns
  `null` and every entry point early-returns. No localStorage means no sync — which is correct,
  because without a durable credential and baseGen every page load would mint a new code and orphan
  a row. **But not silently:** the earlier draft said "silently", which leaves a dead button with no
  explanation. Render the sync row disabled with a reason:
  `Unavailable in private browsing.` (32) / `Indisponible en navigation privée.` (34)
- **A pull that adopts is announced, never silent.** §6.2 row 2 called it "adopt silently", which is
  right about the decision (none is needed) and wrong about the feedback: the player sees the app
  reload under them and every number change, which is indistinguishable from a crash or a
  save-corruption bug. After the reload, a one-line title-screen notice for ~3 s —
  `Loaded your latest save from the cloud.` (38) / `Dernière sauvegarde chargée depuis le cloud.` (44).
  There is no toast component today; the `.build-stamp` slot proves a small non-interactive
  title-screen line is cheap.
- **Service worker** — a non-issue for this deployment, and an earlier draft over-argued it.
  `public/sw.js:28` early-returns on `req.method !== 'GET' || !req.url.startsWith(self.location.origin)`,
  and the Worker is *necessarily* cross-origin: GitHub Pages cannot host a Cloudflare Worker route
  on `github.io`, so the same-origin configuration the draft worried about is unreachable rather
  than merely unchosen. Add `if (new URL(req.url).pathname.startsWith('/v1/')) return` anyway — one
  free line that survives a future custom-domain move — and skip the browser probe for it.
- **PWA cold start offline** — the game boots from cache as it does today, sync fails on the first
  pull, the player plays, the disk hash diverges, and the first online boot pushes.
- **No `__SYNC_URL__`** (a fork, a local build, `npm test`) — `sync.js` disables itself entirely.
  The sync UI still **renders in a disabled preview state** rather than vanishing: hiding it made
  §14's own deferred layout question unanswerable, since `npm run dev` sets no `SYNC_URL` and the
  phone-on-the-LAN check `CLAUDE.md` is built around would show the sheet without the feature in it.

## 9. UI surface

**Owner decision (2026-08-04): sync lives inside the existing 💾 slots sheet. The title screen
gains nothing.** It already carries 🌐 (`ui.js:489`), 💾 n/3 (`ui.js:490`) and a coins badge, and a
fourth control competes for the top edge of a 320px phone. Sync and slots are one mental category —
"which of my saves, and where does it live" — so the sheet the player already opens to switch saves
is also where they will look to link them. The cost of this choice is one extra tap to reach sync;
the benefit is that the title screen stays legible at its narrowest, which is the screen the game is
most often seen on.

### 9.1 One row in the slots sheet, one dedicated sync sheet behind it

An earlier draft put a whole sync *section* inside `slotsModalHtml` (`ui.js:508-533`). It does not
fit. Counting the linked state at 320×568, where `.confirm-sheet` gives 235.6px of content width and
`max-height: calc(100dvh - 32px)` gives a **536px** budget:

| element | px |
|---|---|
| sheet padding, top + bottom | 40 |
| title (FR `Emplacements de sauvegarde`, 26 ch, wraps to 2 lines at 20px/900) | 48 |
| 3 slot rows grown to hold name + rename + status glyph (a 44px target + 2 text lines ⇒ ≥64px) | 198 |
| sync section: heading 18 + status 18 + code chip 34 + bearer warning (FR wraps to 3 lines) 44 + Unlink 48 + gaps 32 | 194 |
| Cancel | 48 |
| 5 × 12px sheet gaps | 60 |
| **total** | **588** |

English lands ~550. Even the most generous variant — rows stay 56px, no divider, warning at 2 lines
— is 510px, inside 536 by 26px, with nothing left for a notch, for iOS `dvh` behaviour, or for the
*pairing* state which adds an input and a soft keyboard. At 568×320 landscape it is roughly 2× the
288px budget. And `.confirm-sheet`'s `overflow-y: auto` is not headroom to spend: `styles.css:1309`
says it exists because *"The slot picker (v6.4.6) is tall enough to clip in short landscape"* — it
is a documented failure fallback that this feature would be leaning on from day one.

There is a latent container bug this would push over the line, worth fixing while here:
`.modal-backdrop` pads with `calc(16px + env(safe-area-inset-bottom))` while `.confirm-sheet`
subtracts a flat 32px, so on a home-indicator phone the sheet can exceed the backdrop's content box
and `align-items: center` clips it at **both** ends.

So the slots sheet gains **one row**, shaped like the three above it so it reads as one more item in
the list, and everything else moves into a dedicated sync sheet behind it:

```
  Cloud sync
  Off — this save stays on this device            →
```

- `Cloud sync` (10) / `Synchro cloud` (13)
- off: `Off — this save stays on this device` (36) / `Non — cette sauvegarde reste sur cet appareil` (45)
- on: `On — Slot 2, updated 2 min ago` (30) / `Oui — emplacement 2, il y a 2 min` (33)

New total: **426px** French, **402px** English. Fits portrait with ~110px spare.

Do **not** label the entry point `Sync this save`: French is `Synchroniser cette sauvegarde` (30 ch
≈ 240px in a 199.6px button), so the feature's own front door would overflow.

### 9.2 What lives in the sync sheet

**First run must explain itself.** An unlinked device opens to a two-sentence explainer and two
explicit buttons — because a bare "Sync this save" answers none of *sync to what, which of my three
saves, do I need an account, does it cost anything, can I undo it*:

- `Keep one save in step across your phone and computer. No account — you type a code once.` (87)
  / `Gardez une sauvegarde à jour entre votre téléphone et votre ordinateur. Sans compte — un code à saisir une fois.` (110 — 4 lines at 0.85rem; flag for the French reviewer, may need trimming)
- `Sync Slot 2` (11) / `Synchroniser l'emplacement 2` (28 — fits a 199.6px button only at ≤0.9rem; flag)
- `I have a code` (13) / `J'ai déjà un code` (17)

Those two buttons also close a gap: an earlier draft said *"linking from the first device shows the
generated code; linking from a second shows a code entry field"* — **the client cannot know which it
is.** One unpaired device is indistinguishable from another. The branch was missing, and it is a
whole screen. Interpolating the slot number into the first button also removes an unstated default:
§5.3 goes to real trouble to stop device *B* adopting into "whatever slot happens to be active", and
the earlier draft then had device A designate one implicitly.

**Linking (device A)** shows `Uploading…` (10) / `Envoi…` (6), then — only once the push is ACKed
(§5.1, §6.3 trigger 4) — `Ready — enter this code on your other device` (43) /
`Prêt — saisissez ce code sur l'autre appareil` (45), the code itself, and a `Copy code` (9) /
`Copier` (6) button using `navigator.clipboard.writeText`. §5.1 estimated "about fifteen seconds of
typing"; with shift-per-character on a soft keyboard and one retry it is 30–60 s, and a copy button
turns the phone→laptop direction into a paste.

**Linking (device B)** shows the code field, then the destination-slot picker of §5.3 — the same
three rows, with a different heading.

**Success is confirmed.** An earlier draft ended pairing with `importSlot` + reload and *nothing
else*: sixteen typed characters, a slot choice, then a page reload and no word. On a slow connection
that is indistinguishable from failure. Land on the title with
`Linked. Slot 2 now follows you between devices.` (46) /
`Lié. L'emplacement 2 vous suit maintenant d'un appareil à l'autre.` (65), same mechanism as §8's
adopt notice.

**Linked state** shows the evidence-based status (below), the code revealable, and Unlink.

### 9.3 Status must report evidence, not intent

`Synced · 2 minutes ago` is derived from the last successful handshake, so it can read reassuringly
while every push has failed for an hour. Worse, it survives a broken pairing entirely: unlink on the
phone and re-pair it (new code, new row), and **the laptop keeps pushing happily to the old row** —
200s, `gen` climbing, status reading "Synced". Every word true, the player's conclusion false. This
is the worst failure class for this feature: not data loss, but a confident, accurate-looking UI
asserting a relationship that no longer exists, discovered only when a handoff silently doesn't
happen.

Silence is the only symptom, so surface silence as the symptom:

- recent round trip → `On — Slot 2, updated 2 min ago` (30)
- long quiet → `On — nothing new in 12 days` (27) / `Oui — rien de neuf depuis 12 jours` (34)
- on unlink → `Your other devices are still using the old code. Unlink there too.` (66) /
  `Vos autres appareils utilisent encore l'ancien code. Déliez-les aussi.` (70)

### 9.4 Slot rows, names, and re-pointing

**Re-pointing moves into the sync sheet. The ☁️ on a slot row is read-only.** The owner's decision
stands — re-pointing is allowed, behind a confirm — but the earlier draft's *mechanism* (tap the ☁️
marker on another row) cannot be built:

1. **Buttons cannot nest.** The row is `<button class="btn btn--soft slot-row" data-act="slot-pick" …>`
   (`ui.js:518`), so a tappable ☁️ inside it is invalid HTML. The codebase already hit this and
   documented the fix at `ui.js:624`: *"A div, not a button: the row holds two real buttons now and
   buttons cannot nest."* Converting the row changes its markup, hit target and semantics — so
   §5.3's claim that the picker "keeps working the way it already does" would have been false.
2. **The active slot's row is `disabled`**, so clicks on it and its descendants never fire. You
   could never designate the save you are *currently playing* as the synced one — the single most
   likely thing a player wants.
3. **There is no ☁️ to tap on the other rows**, since by definition only the synced slot has one.
   The draft contradicted itself between "the synced slot gets a marker" and "tap the marker on a
   different row".

On top of which, the row's whole-row tap **switches saves and reloads the page**; a ~24px glyph
inside it, where a miss costs a reload into a different save, is a hostile target. So re-pointing is
a `Which save syncs?` picker inside the sync sheet, reusing the same three-row component §5.3 needs
anyway — one picker, two entry points — and the ☁️ on a slot row goes back to being what every other
emoji in that sheet is: a status glyph.

The confirm names both sides, because the earlier copy said neither what happens to the abandoned
slot nor when:

- `Slot 3 becomes your synced save. Slot 1 stops syncing, and its cloud copy is replaced as soon as you play.` (105)
- `L'emplacement 3 devient votre sauvegarde synchronisée. L'emplacement 1 cesse d'être synchronisé et sa copie cloud sera remplacée dès votre prochaine partie.` (154 — 6 lines; flag, likely wants splitting)

**Names are capped at 14 characters, not 24.** §4.1's 24 came from an abuse ceiling, not a layout:
`.slot-row` has 193.6px of inner width, `.slot-row-name` is 1rem/800 ≈ 22 characters for the whole
line, and the line must also carry `Slot 2`, `— Current`, the status glyph and a rename affordance
(two 44px targets = 88px, leaving ~12 characters). `.slot-row-name` has no `white-space: nowrap` /
`text-overflow: ellipsis` today, so an over-long name wraps and pushes the row past 56px, cascading
into §9.1's budget. Add both, cap at 14, and move rename out of the row into the slot detail.

### 9.5 The codebase has no text inputs, and this feature adds two

`grep '<input'` across `src/` returns **nothing**. Everything below is a cost this design incurs and
the earlier draft did not mention while calling the work "reusing existing components":

1. **The re-render model destroys them.** `renderTitle()` replaces `screens.title.innerHTML`
   wholesale and the slots sheet is inside that template (`ui.js:498`). Any re-render — the 🌐
   toggle (`ui.js:1300`), a booster tap (`ui.js:1263`), `slots-cancel` — wipes a half-typed code and
   drops focus. The pairing input must hold its value in a module-level variable and restore value
   *and* caret after every render, or live outside the template.
2. **iOS keyboard occlusion.** The sheet is centred in a `position: fixed; inset: 0` backdrop; iOS
   shrinks the visual viewport but not the layout viewport, so the sheet does not move and a field
   in its lower half is covered. Switch to `align-items: flex-start` with a top offset while an
   input is focused, or track `visualViewport.resize`.
3. **Global CSS blocks it.** `body { user-select: none }` (`styles.css:32-34`) and
   `html, body { touch-action: none }` (`:4`) need per-input overrides or the caret and selection
   handles misbehave.
4. **Input attributes** for a 16-char uppercase base32 field: `inputmode="text"`,
   `autocapitalize="characters"`, `autocorrect="off"`, `autocomplete="off"`, `spellcheck="false"`,
   `enterkeyhint="go"`, `maxlength="19"`, and auto-inserted hyphens. Without `autocapitalize`, every
   character needs a manual shift.
5. **Tab switches discard the flow.** `switchTab` sets `slotsOpen = false` when leaving the title
   (`ui.js:1241`), as does `case 'play'` (`:1272`). A player who checks the shop mid-pairing loses
   the sheet and the typed code. The code is recoverable from localStorage — so the sync sheet must
   offer to show it again rather than restarting the flow.

### 9.6 Reset copy is conditional, and "slots" is overloaded

Today's body is `Coins, upgrades, slots and best scores will be permanently erased.` (`ui.js:661`).
An earlier draft simply appended the propagation clause. Three problems:

1. **It is static.** `resetModalHtml()` renders one string; the propagation sentence is only true
   when the reset targets the synced slot. Appending it unconditionally alarms players resetting an
   unsynced one.
2. **No slot context.** `reset-start` fires from `shopFootHtml`'s 🗑 (`ui.js:583`) on the **shop**
   screen, which shows no slot indicator. With three named saves and one of them synced, "which save
   am I erasing" has to be on screen.
3. **"slots" now means three things.** In that sentence it means *upgrade choice slots*
   (`meta.choiceSlots`); the player has just come from a sheet titled `Save slots`; and this feature
   adds a *synced slot*. A player reading it will reasonably fear all three saves are going.

Two conditional bodies, slot number interpolated:

- unsynced: `Coins, upgrades and best scores in Slot 2 are erased for good. Your other saves are untouched.` (93)
  / `Les pièces, améliorations et records de l'emplacement 2 sont effacés définitivement. Vos autres sauvegardes ne changent pas.` (122)
- synced: `Slot 2 and its cloud copy are erased. Every linked device wipes itself the next time it opens.` (93)
  / `L'emplacement 2 et sa copie cloud sont effacés. Chaque appareil lié s'effacera à sa prochaine ouverture.` (103)

The synced version states a **future action on a device not in the player's hand**, which is the
fact the earlier phrasing left out and the whole reason the warning exists.

### 9.7 Everything else

- **The conflict prompt** (§7.2).
- **An ambient sync signal on the title screen, costing no new control:** `💾 2/3` becomes
  `💾 2/3 ☁️` when the active slot is the synced one. Without it there is no way to notice §9.3's
  broken-link case outside the sheet. One glyph, no new tap target.
- **Unlinking deletes the local sync record only.** The cloud row is untouched, so re-pairing with
  the same code restores everything — the rollback story for the whole feature.
- **Every new string needs an `fr.js` entry in the same commit**, and the French goes through an
  adversarial review pass rather than being written alongside the English. Counts above are
  estimates for layout budgeting; the reviewer's renderings win.

## 10. Security and abuse

**The code is a bearer token.** Anyone who has it has full read/write on that save, forever. There
is no revocation short of minting a new code, which orphans the old row — and because the old row
still holds the old save, "unlink and re-pair" is a genuine recovery for a leaked code rather than
a euphemism. Both facts belong in the sync panel's copy, in one line, not a wall of text:
`Anyone with this code can load or overwrite your save.` (53) /
`Toute personne ayant ce code peut charger ou écraser ta sauvegarde.` (66). An earlier draft said
only *"can load your save"* — the code is read **and** write, and understating that in the one line
the player reads about it is the wrong place to be brief.

**Size caps.** Reject `Content-Length` over 8 KB and blobs over 4 KB with 400. Today's save is 893
bytes; 4 KB is ~4.5× headroom for a save that keeps gaining chapters. A cap that is not tight is
not a cap.

**Rate limiting.** An earlier draft set one Cloudflare Rate Limiting rule at **60 requests/minute
per IP** and called the residual acceptable. The arithmetic says otherwise: 60 × 60 × 24 =
**86,400 requests/day from a single IP**, against the **100,000/day** Workers free tier §2 names as
the platform ceiling. One IP, entirely inside the published limit, takes 86% of the daily budget;
two exceed it before lunch. No pairing code is needed — a 404 still costs a Worker invocation.

That is not merely a quota problem, which is how the earlier draft characterised it ("the blast
radius is quota … not data loss or corruption"). It is one hop from the worst UI in the design: when
the daily limit trips the Worker fails for *everyone*, §8 treats that as offline, both devices
accumulate divergence, and the first successful sync after the outage is **the destructive conflict
prompt**. A trivially cheap DoS converts into a modal asking players to discard a save.

A four-layer replacement was drafted next. It was also wrong, for a reason no amount of tuning
fixes: **this deployment has no Cloudflare zone.** The game is served from `ojisama.github.io`
(no `CNAME` in the repo, no custom domain), and WAF rate-limiting rules are a zone feature that does
not apply to `*.workers.dev`. There is nothing to attach a rule to. And even with a zone, the free
plan allows **one rule, IP only, a 10-second counting period only** — "10 per minute" is not
expressible, and a threshold of 1 per 10 s still permits 8,640/day/IP.

What actually works here:

1. **The Workers rate-limiting binding.** `[[ratelimits]]` in `wrangler.toml`
   (`simple = { limit = 10, period = 60 }`) plus `await env.LIMITER.limit({ key: idHash })`. Three
   lines of config, one line of code, keyed on the **code hash** rather than an IP, and it works on
   `workers.dev`. It is enforced per Cloudflare location, so it is a loose filter rather than a hard
   cap — which is all the in-row counter would have been too. This replaces both the WAF rule and
   the `writes_day`/`writes_n` columns of an earlier draft.
2. **Reject a malformed or absent `Authorization` before any D1 query**, so garbage costs one CPU
   microsecond and zero row reads.
3. **Short-circuit `OPTIONS` before auth and before D1** — see the preflight note below, which is
   also why the request estimate in §2 is ~10/session rather than ~3.

The 1-second same-row PUT throttle of the earlier draft is **deleted**, not tuned. The generation
counter already orders writes and `reqId` already makes a retry idempotent, so it prevented nothing
the design did not already prevent — while creating the §5.4 failure where a player who finishes a
run and immediately taps Reset gets a 429 on the one write that must not be dropped. Deleting it
deletes that failure, its DELETE exemption, and the last reader of `updated_at`.

**Be honest about what none of this covers.** Every layer above runs *inside* the Worker, so each
still costs an invocation. Only a pre-Worker edge rule saves one, and that is the zone feature this
deployment does not have. **The 100,000 requests/day budget is unprotectable on the free tier as
deployed.** An attacker can exhaust the day; the blast radius is that sync stops until 00:00 UTC,
surfacing as a 5xx → §8's *"Sync is down right now. Nothing is lost."* Local saves are the source of
truth and lose nothing either way. Cloudflare's free 1,000 req/minute burst ceiling is automatic and
is the first thing an abuser hits. State this as an accepted risk rather than claiming a mitigation
that does not exist — and note the budget is **shared**, so one abused code degrades every player.

**CORS preflights double the request count unless one header prevents it.** `Authorization` is not a
CORS-safelisted header, so even the `GET` preflights; `PUT`/`DELETE` preflight on method too. The
default `Access-Control-Max-Age` is **5 seconds**, which means effectively every request is two
invocations. Set `Access-Control-Max-Age: 7200` (Chromium's cap; Firefox honours 86400) and
preflights collapse to roughly one per two hours per browser.

**Guessing a code** is not a threat: 80 bits against the limiter above. `GET` returns 404 for an
unknown code, which leaks only the existence of a random **64**-hex-digit id (SHA-256 is 32 bytes;
an earlier draft said 128) — not sensitive, and it is what lets the pairing screen distinguish
"typo" from "nothing pushed yet".

**CORS** is `Access-Control-Allow-Origin: *`, and it is *not* a security boundary. The
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
if a player types their real name it is visible. The mitigations are the 14-character cap (§9.4) and the
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
(the stub literal is `sim-test.js:7105-7110`) and registered in the call list at the bottom.
Appending at the end is not cosmetic: the suite seeds `Math.random` and scenario order is part of
its determinism contract.

- `meta.name` and `meta.savedAt` defaults, on a fresh save **and** on an old save missing both —
  including the `fresh` object literal (`state.js:146-155`), which has neither field today (§4.1).
- `saveMeta` stamps `savedAt`; a later save stamps a later value.
- The save hook fires with the bound slot number on a successful write, does **not** fire when the
  write throws (stub a `setItem` that throws), and **a throwing hook does not propagate** (§3.2) —
  the one that protects the Pixi ticker.
- `freezeSaves()` makes every subsequent `saveMeta` a no-op (§3.3). This is the guard for the
  worst silent-loss path in the design, so it is the one assert that must exist.
- **Hostile-blob hardening**, all executable against `state.js` alone (§4.1):
  - `loadMeta` coerces `coins` and `runs` — a blob with `coins: "<img src=x onerror=…>"` yields
    a number, not the string. (Verified today: it currently yields the string verbatim.)
  - `importSlot` **refuses** each of `{"coins":5,"chapters":{}}` (no `shop`), `shop` as a string,
    `chapters` as a string, `{}` and `null`, and leaves the existing slot intact. Every one of
    these is valid JSON that `loadMeta` silently resolves to a **fresh save** — a total wipe — so a
    parse-only guard passes them (§3.2).
  - the `upgrades` reduction returns a number on a hostile `shop`, not `"0<b>X</b>00000000"`.
- `saveSummary` on hand-built metas: coins; upgrades as the sum of `meta.shop`; runs; furthest
  chapter as the last unlocked `CHAPTER_ORDER` id; `'blank'` overriding it when unlocked; `beaten`
  as `maxDifficulty - 1`; and the beyond/blank exception producing 5.
- **`saveSummary` is total** (§4.2): it returns a value rather than throwing on `chapters: {}`,
  on a blob with no `shop`, and on a missing `savedAt`. Each of those is a `TypeError`/`RangeError`
  in the naive form, and each would leave the uncancellable prompt half-drawn.
- `exportSlot`/`importSlot` round-trip.
- **The decision function** from §6.2, which is the heart of the feature and is pure: given
  `{ baseGen, syncedHash }`, the current disk blob, and `{ gen }`, it returns
  `'none' | 'pull' | 'push' | 'conflict' | 'resync'`. This is what makes §3.1's module-scope
  discipline pay: `sync.js` stays importable from plain node, so it can be asserted directly across
  all five rows — **including `cloud.gen < baseGen` resolving to `resync`, not `push`**, which is
  the wedged-forever case.
- **Derived `dirty`** (§6.2): a save landing between "push sent" and "ACK received" still reads as
  dirty afterwards. Concretely — snapshot the blob, mutate the slot, apply the success handler with
  the snapshot's hash, and assert the next evaluation is `push`, not `none`. That single assert is
  the regression guard for the design's worst silent-loss path.
- The lost-ACK rule (§6.4): a 409 whose `device` and **`reqId`** match the in-flight record resolves
  to "adopt gen, re-derive dirty, no prompt"; a 409 differing in either resolves to "conflict".
  Explicitly assert the two clock cases that broke the earlier `savedAt`-keyed version: a save
  *between* push and retry must still not be lost, and two saves sharing one `savedAt` (backwards
  clock) must not be treated as an ACK.
- `savedAt` rendering branches (§4.1): `0`/absent → "unknown"; a future value → "unknown (clock
  differs)"; and the clock-vs-generation disagreement warning.
- The **14**-character name clamp and control-character stripping, applied **on receive**, not on
  adopt — the prompt renders the cloud's name before any adopt happens.
- **Tombstones** (§5.4): a pulled `blob === null` resolves to `'erased'` rather than `'pull'`, and
  never reaches `importSlot`. Assert it separately from the null-blob *refusal* case in
  `importSlot`, since the two look identical from a distance and mean opposite things — one is a
  deliberate deletion to confirm, the other is a corrupt payload to reject.
- A guard that `saveHook` is still `null` at the end of a full suite run, so nothing has quietly
  wired sync into a suite that stubs a succeeding `setItem` at five sites (§3.1).

**Browser probe** (Chrome DevTools, following `CLAUDE.md`'s probing notes) — everything involving
`ui.js`, reloads, or the service worker:

- Two **isolated browser contexts** — the notes are explicit that open tabs share localStorage and
  clobber seeded saves. Seed context A via a navigate `initScript` (the documented idiom;
  `setItem` + `reload()` gets clobbered by the app re-saving during unload).
- Pair B with A's code; assert B adopts A's save after the reload and that the title screen shows
  A's coins and chapter ladder.
- Make both dirty; assert the prompt renders every field per side, and that each button produces
  the state §7.3 describes — including that "Keep this device's" leaves the local save untouched
  and bumps the cloud generation.
- Put `<img src=x onerror=…>` in the cloud blob's **`coins`** as well as its `name`, and assert both
  render as text. `coins` is the field that is actually unguarded today (§4.1) and it reaches
  `innerHTML` at `ui.js:491`, `:717` and `:1132`. This is the `SS.g` scenario's lesson
  (`sim-test.js:7154-7160`) applied to fields that now arrive over the network.
- **The adopt-then-reload race** (§3.3): with a pull adopting, fire a `saveMeta`-producing
  interaction in the same tick and assert the adopted blob survives — this is the freeze latch
  proving itself against live handlers, since there is no unload handler in this repo to catch it.
- **The return leg of the use case** (§6.3): leave device A on the *summary* screen (not the
  title), push from device B, bring A back to the foreground, quit to title, and assert A adopts.
  Without the `run → null` pull trigger this is the case that silently runs a whole session stale.
- DevTools offline mode: boot, play a full run, reach the summary — no modal, no console error, no
  perceptible delay at boot.
- `list_network_requests` to assert **preflight behaviour**, which is the one that costs money:
  after `Access-Control-Max-Age` lands, a session should show roughly one `OPTIONS` per host rather
  than one per request (§10). The service-worker cache assertion an earlier draft specified here is
  dropped — the same-origin configuration it tested is unreachable on GitHub Pages (§8).
- **Layout at 320×568 and 568×320**, both languages: the slots sheet with the sync row, the sync
  sheet in each of its states, and the conflict prompt — no scrolling, nothing clipped, Cancel
  reachable. §9's budgets are arithmetic and want confirming on glass.

**The Worker, separately.** It is a different deployable with its own `package.json`; the "no jest,
no vitest" rule is about the game's suite and does not extend to it. Even so, the smallest thing
that works is a short `worker/test.sh` of `curl` assertions against `wrangler dev --local` (D1 runs
against local SQLite), covering: first write with `baseGen: 0`; a normal write; a stale-`baseGen`
409 carrying the current row **and its `reqId`**; an unknown code 404; an oversize blob 400; a
missing/malformed `Authorization` 401 **without a D1 read**; an `OPTIONS` preflight answered
**before** auth and before any D1 query, carrying `Access-Control-Max-Age`; the rate-limit binding
returning 429; a `DELETE` tombstoning the row (`blob` NULL, `gen` bumped, **and `prev_blob` NULL**);
a repeated `DELETE` being a no-op that returns the same `gen`; and a `GET` on a tombstoned row
returning `blob: null` rather than 404. Eleven cases, one file, no framework.

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
- **The `device`/`req_id` columns and the lost-ACK rule (§6.4).** Cost of cutting: an occasional
  conflict prompt where both sides are actually the same save, after a dropped response. Annoying,
  never destructive — *provided* resolution re-derives `dirty` rather than clearing it. Second
  cheapest.
- **`prev_blob`/`prev_gen` (§7.3).** One column pair with no reader until a player emails. Cutting
  it makes "Keep this device's" irreversible. Keep it; it is the cheapest insurance in the design.
  Its ceiling is stated rather than implied: it covers **one** generation, which covers the phone +
  laptop deployment completely and leaves a three-way divergence's middle save unrecoverable. A
  two-slot ring was considered and declined (§7.3).
- **The local stash** on "Take the cloud's" (§7.3) — now **in** the design, not a cut. One
  localStorage key, and the only recovery for the more mis-tappable of the two destructive buttons.

**Not cuttable, though an earlier draft treated them as optional or absent:** the derived `dirty`
hash (§6.2), the `freezeSaves()` latch (§3.3), `importSlot`'s shape validation (§3.2) and
`saveSummary`'s totality (§4.2). Each is the only thing standing between a routine sequence of
events and silent, unrecoverable loss — they are the design's floor, not its polish.
- **Compression, encryption, per-device tokens, code expiry, a retention sweep.** All rejected
  above with their evidence; each has a clean upgrade path precisely because the Worker never
  parses the blob and the client owns the code.


## 14. Decisions taken, corrections applied, and what remains open

### 14.1 Settled by the owner, 2026-08-04

1. **The second device names the destination slot** (§5.3). An empty slot adopts silently; an
   occupied one routes through the comparison prompt. This deleted the "what if all three slots are
   full" branch an automatic *keep both* would have needed.
2. **Re-pointing which slot syncs is allowed, behind a confirm** (§9.4). The *mechanism* changed
   after review — the ☁️ marker on a slot row cannot be a tap target (§9.4) — but the decision
   stands; re-pointing lives in the sync sheet.
3. **The entry point lives in the 💾 slots sheet** (§9.1). Also survived review, though as one
   *row* rather than a whole section, because a section does not fit at 320px.

### 14.2 Settled by investigation

4. **The Worker runs on the owner's own Cloudflare account.** A fork builds with an empty
   `__SYNC_URL__` and has no sync — though the UI still renders in a disabled preview state (§8),
   because hiding it made §9's layout unverifiable on the dev server.
5. **The daily challenge does not interact with sync.** Nothing in `meta` records daily
   participation. **This stops being true the moment a daily streak or once-per-day reward is added
   to `meta`** — that field is where sync and fairness would first collide.

### 14.3 Corrected after adversarial review, 2026-08-04

Two independent reviews — one on UI/UX, one on edge cases and protocol correctness — were run
against this document and the codebase. Every claim below was verified against the source or by
executing `state.js` before being applied; the corrections are folded into the sections named.

**Silent data loss, three independent paths:**

- **`dirty` as a writer-set boolean** (§6.2) — invisible to a save landing mid-push, unsafe across
  two tabs, and entirely absent from an offline-cached old bundle. Replaced by a derived content
  hash. This is the highest-leverage change in the revision.
- **The unfenced reload window** (§3.3) — live handlers kept writing the *pre-adopt* save over a
  freshly adopted blob, and because baseGen had already advanced, the result then propagated to the
  other device with a **valid** generation and no conflict prompt. Fixed with a `freezeSaves()`
  latch. The repo has no unload handler that would have caught this.
- **The `savedAt`-keyed lost-ACK check** (§6.4) — broke this document's own rule that no clock
  decides anything, and failed in both directions. Replaced by a per-push `reqId`.

**Hostile or merely malformed blobs, verified by executing the real `loadMeta`:**

- **`esc()` was specified for the wrong field** (§4.1). `coins` and `runs` pass through `loadMeta`
  completely uncoerced and reach `innerHTML` at three sites; `name` was never the dangerous one.
  The `Number()` hardening this document *quoted* lives in `slotSummary`, not `loadMeta`.
- **`importSlot`'s parse check does not prevent the wipe it was written to prevent** (§3.2). Five
  shapes of valid JSON — including `{}` and a blob merely missing `shop` — resolve to a **fresh
  save**. Now validates shape.
- **`saveSummary` threw on realistic blobs** (§4.2), which would have left the *uncancellable*
  prompt half-drawn and locked the player out of the game.

**Correctness and reachability:**

- `cloud.gen < baseGen` wedged a device into a permanent conflict prompt (§6.2).
- **Pairing never uploaded** (§5.1) — a correct code got a 404 telling the player to check the
  letters.
- **The pull triggers missed the owner's own use case** (§6.3): `run` is null only in `onQuit`, so a
  laptop left on the summary screen never re-evaluated.
- The 60/min/IP rate limit allowed one IP to consume 86% of the daily Workers quota (§10).
- A throwing save hook would have propagated out of the Pixi ticker (§3.2).

**UI, all measured against a 320px viewport:**

- The sync *section* overran the sheet budget by ~50px (§9.1) — now one row plus a dedicated sheet.
- The three-column comparison table was ~2× over its column budget (§7.2) — now stacked cards.
- The ☁️ re-point gesture was unbuildable: nested buttons, and the active row is `disabled` (§9.4).
- Coins and upgrades as peer rows invited picking the *older* save, by this document's own §7.1
  argument (§7.2).
- Unlinking one device left the other reading "Synced" indefinitely (§9.3).
- Reset copy, first-run explanation, success confirmation, and the fact that the losing save is
  **deleted** — all absent (§9.2, §9.6, §7.2).
- The codebase contains **zero** `<input>` elements; this feature adds two, with everything that
  costs (§9.5).

Line-reference corrections: `state.js:54-55` (not `:55-56`); **six** swallow-and-continue sites in
`state.js` (not five); `sim-test.js` line **4** (not 3); the localStorage stub appears at **five**
sites (not once, in `testSaveSlots`); `SS.g` is `sim-test.js:7154-7160`; SHA-256 is **64** hex
digits (not 128).

### 14.4 Settled by the owner after review, 2026-08-04

6. **Reset writes a tombstone** (§5.4, §6.1). `DELETE /v1/save` sets `blob = NULL` and bumps `gen`,
   so a deletion is distinguishable from an empty save, ordered by the same counter as everything
   else. A tombstone arriving on another device is
   **confirmed before it lands**, with "Keep it here" unlinking rather than wiping — two devices
   disagreeing about whether a save should exist is the player's call.
7. **The conflict prompt gains `Decide later`** (§7.2). Both saves survive a postponement, so the
   only thing it costs is a second prompt later; a mis-tap costs a session. Backdrop-tap and Escape
   stay inert now that a labelled exit exists.
8. **The discarded local blob is stashed** (§7.3). One localStorage key, symmetric with the cloud
   side's `prev_blob`, covering the button players are more likely to hit by accident.
9. **`prev_blob` stays one generation deep, and the ceiling is written down** (§7.3). A phone and a
   laptop are fully covered; a three-way divergence's middle save is not, and the spec says so
   rather than implying safety it does not have.

**No product questions remain open.**

### 14.5 Open — deferred to implementation

- **The exact copy of every new string, in both languages.** The counts in §7–§10 are estimates for
  layout budgeting. Per the standing rule the French goes through an adversarial review pass rather
  than being written alongside the English, and anything uncertain comes back as a question.
- **Confirming §9's layout arithmetic on glass**, at 320×568 and 568×320, in both languages.
