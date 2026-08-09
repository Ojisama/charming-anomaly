# Cross-device save sync — technical strategy

**Date:** 2026-08-04
**Companion to:** `2026-08-03-cross-device-save-sync-design.md` (the design; what to build and why)
**This document:** how to build it — order, repo layout, save-schema evolution, rollout, operations.
**Status:** not started.

---

## 1. The strategy in one paragraph

Ship it in five slices, each independently revertible, and put the two that carry all the risk
first. Slice 0 is bug fixes the shipped game needs whether or not sync ever exists — including two
silent data-loss paths that already affect a player who merely downgrades. Slice 1 is a backend
nobody uses yet. Slice 2 is a tested module nothing reaches, which is the one slice that is *not*
independently useful. Nothing a player can see moves until slice 3, and by then the parts that can
lose data have been under test for two slices. The kill switch is one build variable: an empty
`__SYNC_URL__` disables the whole feature at the module level, so "turn it off" never requires a
revert.

---

## 2. Save-schema evolution — the constraint that outlives this feature

**This is the load-bearing section.** The rest of the strategy is scheduling; this part changes how
every future release is written, sync or no sync.

### 2.1 Sync makes an old problem routine

Today one device runs one build. A save moves forward through builds and never backward, so only
**backward compatibility** matters: a new build reading an old save. `loadMeta` handles that well —
`ensureChapterMeta` (`state.js`) creates missing per-chapter entries on every load, the `??=`
idiom fills new scalar fields, and the v4→v5 migration shows the pattern for a structural change.

Sync introduces **forward compatibility**, which the codebase has never needed: an *old* build
reading a *newer* save. The phone auto-updates on Monday; the laptop is still running the previous
bundle. In between, the laptop pulls a save the running code has never seen.

Be accurate about how long that window is, because §2 is sized off it. `public/sw.js` is
well-behaved: `skipWaiting()` (`:19`), `clients.claim()` (`:23`), old caches purged, and navigations
refetched with `cache: 'no-store'` (`:33`). **Any online reload lands the newest bundle
immediately.** The stale window is therefore two narrower cases — an offline or failed boot falling
through to `caches.match(req)` (`:42`), and a tab or installed PWA left open across a release
without ever navigating. The second is true of every web app and is not a service-worker property.
Both are unbounded in principle and bounded in practice by the player's next successful online
reload. An earlier draft of this section said "hours or days after every release" and blamed the
service worker; that overstated the window and misattributed the cause. **The window is smaller than
that and the service worker should not change** — but it is not zero, and one device on a stale
bundle is all it takes.

### 2.2 What survives, and what does not — verified by execution

Run against the real `loadMeta`/`saveMeta`. **Additive future data survives; known fields with
out-of-range values do not.** An earlier draft tested only the first column and concluded, wrongly,
that "data added by a future build is not destroyed by an older one."

**Unknown keys survive a full round-trip** — an unknown chapter entry in `meta.chapters`, an unknown
top-level currency, an unknown shop upgrade id, all intact after an old build loads *and saves*.
The mechanism is that `loadMeta` patches in place and returns the parsed object wholesale
(`state.js`), and `saveMeta` stringifies that same object.

**Known keys are clamped to the running build's ranges and written back to disk:**

| a save from a build that raised… | after an old build's `loadMeta` → `saveMeta` |
|---|---|
| `MAX_DIFFICULTY`, so `chapters.body.maxDifficulty = 7` | **`5`** — clamped at `state.js`, persisted |
| the choice-slot ceiling, so `choiceSlots = 6` | **`4`** — clamped at `state.js`, persisted |

That is silent, permanent progression loss, and with sync it propagates back to the updated device
on the next push. It is also the *most likely* breaking release this game will ship — raising the
difficulty ladder is a routine content change, not an exotic migration — and no schema bump would
accompany it.

**A malformed blob wipes the slot.** Sync makes this a network-reachable input, so it belongs here
and not only in the design's §3.2: a blob merely **missing `shop`** makes `state.js`'s
`Object.keys(SHOP)` loop throw, the `catch` at `:145` swallows it, and `loadMeta` returns `fresh` —
coins 500 → 0. (This predates v6.6.10: the `??= 0` it replaced threw identically on an undefined
`shop`. Verified, so nobody spends time reverting a non-regression.)

**Save slots.** There are three (`SAVE_SLOTS`, `state.js`), and everything above is per-slot.
Only one syncs. Every rule below is about the synced slot; the other two are untouched by any of it.

### 2.3 The crash — verified, and smaller than it looks

`meta.chapter` is a **pointer into a table**, not data. `loadMeta` only defaults it when missing
(`m.chapter ??= 'body'`, `state.js`), so a value naming a chapter the running build does not
have passes straight through to:

```
state.js   const bal = CHAPTERS[opts.chapter ?? 'body'].balance
  ->  TypeError: Cannot read properties of undefined (reading 'balance')
```

**But the blast radius is one button, not the game.** Traced: `carouselHtml`/`titleBelowHtml` read
`meta.chapters?.[…]`, `chapterMaxDifficulty` returns a default for an unknown id rather than
throwing, and `positionCarousel` early-returns on the missing card. The title screen renders fine.
Only **Play** throws, out of a click handler, non-fatally — and it self-heals on the first carousel
swipe, because `settle()` (`ui.js`) reassigns `browseChapterId` and calls `hooks.onChapter`.
The honest symptom is *"Play does nothing until you swipe once."* An earlier draft of §7 called it
"the game is unopenable", which is false and inflated the fix's urgency.

### 2.4 The rules

**R1 — Validate table-backed pointers at the consumer, never destructively on load.**

`meta.chapter` is not the only pointer; `meta.lang` is one too, and the codebase already handles it
correctly — `setLang` does `(l === 'en' || DICTS[l]) ? l : 'en'` (`i18n.js`), and `ui.js` does
`CHAPTERS[x] ?? CHAPTERS.body` twice (`:1116`, `:1174`). Three existing precedents, all at the
consumer, all non-destructive. So:

```js
// state.js, replacing the existing `opts.chapter ?? 'body'`
const bal = CHAPTERS[CHAPTERS[opts.chapter] ? opts.chapter : CHAPTER_ORDER[0]].balance
```

An earlier draft instead proposed repairing `m.chapter` inside `loadMeta`, arguing the damage was
limited because "`loadMeta`'s repairs are in-memory and never written back". That reasoning does not
survive contact with the code: old builds save constantly — `onChapter` (`main.js`), every run
end, every purchase — so the collapse to `body` is immediate, not conditional, and with sync it
propagates to the updated device. It was a **destructive** repair sold as a benign one, it invented
a new rule where the codebase already had an idiom, and it protected only `createRun` while missing
`meta.lang` entirely.

**R2 — `meta` changes are additive. Never rename, never repurpose.** A rename is a delete plus an
add, and the old build carries the corpse forward.

**R3 — Widening a range is a breaking change. Clamp on use, never on load.**

This is the rule §2.2's second table demands, and an earlier draft had it exactly inverted — it
listed "new difficulty level → nothing to do", citing the very clamp that eats the newer save.

```js
// state.js — preserve what is stored; clamp only what is played
entry.maxDifficulty = Math.max(1, entry.maxDifficulty ?? 1)
entry.difficulty = Math.max(1, Math.min(Math.min(chapterMaxDifficulty(id), entry.maxDifficulty), entry.difficulty ?? 1))
```

Storing a `maxDifficulty` above what this build offers is harmless — `main.js` already caps the
selectable difficulty with `chapterMaxDifficulty` — while *lowering* it is unrecoverable. Same
shape for `choiceSlots` (`state.js`): keep the stored value, clamp at the consumer.

| change | safe because | to do |
|---|---|---|
| new chapter | `ensureChapterMeta` creates the entry; unknown entries survive | R1 |
| **new difficulty level** | **nothing — this is the breaking one** | **R3** |
| new permanent upgrade | the `Object.keys(SHOP)` loop fills it; unknown ids survive | nothing |
| new currency | `m.newCurrency ??= 0`, same idiom as `m.choiceSlots` | one line |
| **raising any ceiling** (`choiceSlots`, a chapter cap) | **nothing** | **R3** |
| new mutator / weapon / element | not persisted in `meta` | nothing |

**R4 — `meta.schema`, and refuse to adopt from the future.** One integer, default `??= 1`, bumped
only for a change an older build genuinely cannot survive.

```js
if (remote.schema > SCHEMA) return 'too-new'   // adopt nothing, push nothing
```

The refusal *is* the suspension — an earlier draft added a "suspend sync for that save" state, which
is a concept with no implementation behind it. What R4 buys that nothing else does: **the generation
counter orders writes, not versions.** A stale build holding a correct `baseGen` pushes its older
blob at `gen+1` and the server accepts it, with no 409 and no prompt. That is the one hole R1–R3
cannot close.

**R4 ships in slice 0.** A build released without the comparison can never be taught to refuse
anything; by the time slice 2 exists, the entire population it protects is already in the wild.
This is the only rule here with a deadline.

### 2.5 Test obligations

Two permanent scenarios in `test/sim-test.js`, both pure `state.js`:

- **Range preservation (R3).** A save with `maxDifficulty: 7` and `choiceSlots: 6` survives
  `loadMeta` → `saveMeta` without being written back lower. **This is the assert that would have
  caught a real bug**, and it fails today.
- **Pointer safety (R1).** With `meta.chapter` naming an unknown chapter, `createRun` does not
  throw. Also fails today.

An earlier draft additionally asserted that unknown chapters/currencies/shop ids survive a
round-trip. Those pass today and are testing `JSON.parse` → `JSON.stringify`; they document a
property rather than defending one. Drop them.

Note what these tests do **not** do, so nobody mistakes them for a guarantee: they are hardcoded to
`meta.chapter`, `maxDifficulty` and `choiceSlots`. Adding a *new* pointer or a *new* bounded field
fails nothing. R1–R3 are rules for humans; only these three instances are enforced.

The `schema` gate (R4) is asserted with slice 2's decision function, not here.

## 3. Build order

Each slice ends green and is revertible without touching the ones before it. **Slices 0, 1, 3 and 4
ship on their own; slice 2 does not** — it is a tested module nothing reaches, and calling it
independently useful would be a lie about what a player gets.

### Slice 0 — harden `state.js` (no sync, no backend)

Everything that improves the *shipped* game, extracted so it can ship immediately and be judged on
its own. Every item here is worth doing even if sync is abandoned:

- `loadMeta` coerces `coins`/`runs`/shop levels — **done, v6.6.10 (`c90c1cc`)**.
- **R3's clamp-on-use** (`state.js`, `:141`) plus its range-preservation test. This is the
  one that silently eats a newer save's progression, so it is the highest-value item in the slice.
- **R1's consumer-side pointer guard** (`state.js`) plus its test.
- **R4's `schema` comparison.** It ships here and nowhere later, for the reason §2.4 gives: a build
  released without the check can never be taught to refuse. The `sync.js` side that *uses* it lands
  in slice 2; the field and the constant land now.

Not in this slice: `esc()`. The design's §4.1 settles that the boundary beats the render site and
lists `esc()` as belt-and-braces *behind* the boundary normalisation — which lives in `importSlot`,
which does not exist until slice 2. Shipping the sweep here would guard a threat that cannot exist
until slice 4, at the cost of touching every render site. The `name` clamp the design already
applies on receive is the cheaper half and lands with `importSlot`.

No new module, no network, no UI.

### Slice 1 — the Worker, standalone

`worker/` as its own deployable with its own `package.json` and `wrangler.toml`. D1 schema, the
three endpoints, the rate limits, `worker/test.sh` of `curl` assertions against
`wrangler dev --local`. **The game does not know it exists.** Deployed and exercised by hand before
a single line of client code is written, because a backend is far cheaper to change while nothing
depends on it.

### Slice 2 — `sync.js`, headless

The module, its localStorage record, and the pure decision function — with **no UI and no
listeners**. Wired only far enough for `npm test` to assert the decision table, the derived `dirty`
hash, the lost-ACK `reqId` rule, and the `schema` gate. This is where every data-loss bug the
adversarial review found either gets caught or ships; it is the slice to over-test.

`state.js` gains `setSaveHook`, `freezeSaves`, `exportSlot`, `importSlot` here — all four are
testable without a browser, which is the whole reason the design put them in `state.js` rather than
in `sync.js`.

### Slice 3 — UI, behind an empty `__SYNC_URL__`

The sync row, the sync sheet, pairing, the destination-slot picker, the conflict prompt, the
tombstone confirm, the revised reset copy. Built against the disabled preview state (design §8), so
the 320px layout budgets get verified on a phone before any real traffic exists.

French copy goes through the adversarial review pass in this slice, not after it.

### Slice 4 — turn it on

Set `SYNC_URL` in the build. Pair two real devices. Walk the owner's use case end to end, including
the return leg from the summary screen. Then the deploy-watch gate with the sync host as a grep
string, so the `define` substitution is confirmed in the live bundle rather than assumed.

---

## 4. Repo and deployment

**The game is served from `ojisama.github.io`** — no `CNAME` in the repo, no custom domain. That
single fact decides most of this section and all of §6's abuse story: **the deployment has no
Cloudflare zone**, so every zone-scoped feature (WAF rate-limiting rules, status-code analytics) is
unavailable regardless of plan. Buying a domain is the only way to get them, and that is a priced
decision, not a config tweak.

`worker/` deploys separately from the game:

- `worker/` holds `wrangler.toml`, `schema.sql`, `src/index.js`, `test.sh`, its own `package.json`.
- Deployed with `wrangler deploy` from that directory — manually. Design §3.4 makes the Worker
  independent of every game change, so it changes approximately never; a workflow is premature.
- **The drift risk is the schema, not the deploy.** `schema.sql` sits in the repo against a
  hand-created database that nothing compares it to. Write it `CREATE TABLE IF NOT EXISTS` and
  record `wrangler d1 execute DB --remote --file=schema.sql` as the one command that applies it.
- **There are no secrets here.** `database_id` in `wrangler.toml` is an identifier, useless without
  an account-scoped API token; the only credential is the operator's local `wrangler` login. Stated
  explicitly because a public repo will keep raising the question.
- **`SYNC_URL` is a build-time `define`**, alongside `__BUILD_STAMP__` (`vite.config.js`), read
  through the same `typeof` guard `ui.js` uses. It ships in a public bundle, which is fine: the
  only capability it grants is burning the shared request budget, and that is unprotectable anyway
  (§6) — hiding a URL does not fix it. The player's pairing code is the actual secret and never
  leaves their devices in plaintext.
- Write the define as `JSON.stringify(process.env.SYNC_URL ?? '')`. `JSON.stringify(undefined)`
  returns `undefined`, not `'undefined'`, and Vite's `define` does not substitute it the way you
  want — one missing `?? ''` is a blank-page debug.
- **`.github/workflows/deploy.yml` has no `env:` block today.** Adding one is a required step and
  was missing from an earlier draft of this list. Forget it and `__SYNC_URL__` is empty: a feature
  that looks shipped and silently does nothing. Slice 4's deploy-watch grep is the only gate that
  catches it, which is why that gate is not optional.
- A fork building without `SYNC_URL` gets sync disabled at the module level — the correct default,
  and now a stated intention.

**Service worker.** `sw.js` already early-returns on non-GET and cross-origin, and the Worker is
*necessarily* cross-origin: GitHub Pages cannot host a Cloudflare Worker route on `github.io`, so
the same-origin hazard design §8 defends against is unreachable for this deployment. Keep the
one-line pathname guard — it is free and it survives a future custom-domain move — and drop the
argument around it.

---

## 5. Rollout and reversal

- **Kill switch:** ship with `SYNC_URL` empty; set it when ready. Unsetting it disables the feature
  on the next deploy without a code revert. Already-paired devices stop syncing and keep playing;
  local saves are untouched, because localStorage is the source of truth throughout.
- **Rollback:** unlinking deletes only the local sync record. The cloud row survives, so re-pairing
  with the same code restores everything. That is the rollback story for the whole feature.
- **No migration required.** The three new `meta` fields — `name`, `savedAt`, `schema` — are
  additive and defaulted on load, so every existing save works with no migration branch, and a save
  that visits an old build and comes back keeps them (§2.2).

---

## 6. Operations

**Cost:** free tier throughout, and all three cited limits are current — D1 at 5 M rows read/day,
100 k rows written/day, 5 GB; Workers at 100 k requests/day. Writes are not close to binding.
Requests are the constraint, and **the real figure is ~10 invocations per session, not 3**, because
CORS preflights count (below). That is ~10,000 sessions/day — comfortable, but one order of
magnitude of headroom, not two.

**Two Worker-level limits worth naming**, since neither is a daily quota: the free plan's **10 ms
CPU per request** (fine here — a SHA-256 of 16 bytes plus one primary-key point lookup, and D1 I/O
wait is not CPU time — but it is the only limit that fails *per request*, so let `wrangler dev`
prove it), and the **1,000 requests/minute burst ceiling**, which is free, automatic, and the first
thing an abuser actually hits.

**Preflights double the request count unless one header says otherwise.** `Authorization` is not a
CORS-safelisted header, so even the `GET` preflights, and the default `Access-Control-Max-Age` is
**5 seconds**. Set it to 7200 (Chromium's cap; Firefox honours 86400) and short-circuit `OPTIONS`
before auth and before any D1 query.

**The 100 k/day request budget is unprotectable on the free tier as deployed. Say so rather than
claiming otherwise.** Both the Workers rate-limiting binding and any in-row counter run *inside*
the Worker, so they cap writes and abuse but not invocations; only a pre-Worker edge rule saves an
invocation, and that needs the zone §4 says does not exist. The accepted consequence: an attacker
can exhaust the day. The blast radius is already handled correctly — error 1027 surfaces as a 5xx,
design §8 renders *"Sync is down right now. Nothing is lost."*, local saves are untouched, and the
quota resets at 00:00 UTC.

**Rate limiting is one binding, not four layers.** `[[ratelimits]]` in `wrangler.toml`
(`simple = { limit = 10, period = 60 }`) plus `await env.LIMITER.limit({ key: idHash })` — three
lines of config, one line of code, keyed on the code hash rather than IP, and it works on
`workers.dev`. It is enforced **per Cloudflare location**, so it is a loose filter rather than a
hard cap; that is all the alternatives were too. This replaces the WAF rule that cannot exist, the
`writes_day`/`writes_n` columns, and the 1-second same-row throttle (the generation counter already
orders writes and `req_id` already makes a retry idempotent).

**Backups: D1 Time Travel, already on.** Point-in-time restore to any minute in the last 7 days on
the free plan, automatic, zero setup. `wrangler d1 time-travel restore` is the whole procedure.
Build nothing. This also demotes `prev_blob` from "the cheapest insurance in the design" to what it
actually is — the *surgical* one-row fix that avoids a destructive whole-database restore.

**Retention: none, deliberately.** 900 B × 100 k players ≈ 90 MB against 5 GB, and an orphaned row
is indistinguishable from an idle one, so it could never be swept safely anyway.

**Deletion:** `DELETE /v1/save` is the whole data-deletion story, and it is proportionate for
anonymous progression plus one 14-character free-text name. It must genuinely erase — see the
design's §5.4 correction about `prev_blob`.

**Monitoring:** `wrangler tail` when a player emails. Cloudflare's built-in Worker analytics gives
requests, errors, CPU time and invocation status — **not** a status-code breakdown, which is zone
analytics and unavailable here, so the "watch the 409 rate" plan in an earlier draft had nothing to
watch it with. Analytics Engine would work and is exactly the pipeline §8 refuses.

**Logging:** never the `Authorization` header, never the blob.

---

## 7. Risks, ranked by what they cost if they land

| risk | cost | mitigation |
|---|---|---|
| A data-loss path survives review | a player's progress, silently | slice 2 is headless and over-tested; every known path has a named regression assert |
| **A future release widens a range** (a 6th difficulty, a 5th choice slot) | the newer save's progression, silently, then synced back over the good copy | R3 + its range-preservation test — the likeliest of these to actually happen |
| Forward incompatibility on an un-updated device | Play does nothing until the player swipes the carousel once (§2.3) | R1 + its test |
| Free-tier exhaustion by abuse | sync down for everyone until 00:00 UTC | **not preventable on this deployment (§6)** — accepted; local saves unaffected either way |
| The owner stops wanting to run a backend | the feature dies | slice 0 keeps its value and has already begun shipping |

---

## 8. What this strategy deliberately does not do

- **No CI and no staging for the Worker.** `curl` assertions in one file, `wrangler dev --local`,
  both run by hand. The Worker changes approximately never.
- **No custom domain** — and therefore no edge rate limiting and no status-code analytics. The
  consequence is §6's accepted risk, made explicit here so it is a choice rather than a discovery.
- **No backup system** — because D1 Time Travel already is one.
- **No retention policy** — because 5 GB.
- **No dashboard, no metrics pipeline, no alerting.** A single-player browser game with a 900-byte
  save does not need an on-call rotation.
