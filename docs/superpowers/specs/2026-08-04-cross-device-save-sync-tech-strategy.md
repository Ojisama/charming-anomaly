# Cross-device save sync — technical strategy

**Date:** 2026-08-04
**Companion to:** `2026-08-03-cross-device-save-sync-design.md` (the design; what to build and why)
**This document:** how to build it — order, repo layout, save-schema evolution, rollout, operations.
**Status:** not started.

---

## 1. The strategy in one paragraph

Ship it in five slices, each independently useful and independently revertible, and put the two
that carry all the risk first. Slice 0 is a bug fix the shipped game needs whether or not sync ever
exists. Slice 1 is a backend nobody uses yet. Nothing the player can see moves until slice 3, and
by then the parts that can lose data have been running against tests for two slices. The kill
switch is one build variable: an empty `__SYNC_URL__` disables the whole feature at the module
level, so "turn it off" never requires a revert.

---

## 2. Save-schema evolution — the constraint that outlives this feature

**This is the load-bearing section.** The rest of the strategy is scheduling; this part changes how
every future release is written, sync or no sync.

### 2.1 Sync makes an old problem routine

Today one device runs one build. A save moves forward through builds and never backward, so only
**backward compatibility** matters: a new build reading an old save. `loadMeta` handles that well —
`ensureChapterMeta` (`state.js:93-104`) creates missing per-chapter entries on every load, the `??=`
idiom fills new scalar fields, and the v4→v5 migration shows the pattern for a structural change.

Sync introduces **forward compatibility**, which the codebase has never needed: an *old* build
reading a *newer* save. The phone auto-updates on Monday; the laptop's service worker serves the
cached bundle until its next successful network boot. In between, the laptop pulls a save the
running code has never seen. This is not an edge case — it is the normal state of a two-device
setup for hours or days after every release.

### 2.2 What already works — verified, not assumed

Executed against the real `loadMeta`/`saveMeta` with a save carrying a future chapter (`atlantis`),
a future currency (`shards`), and a future shop id (`futureUpgrade`):

| property | result |
|---|---|
| unknown chapter entry in `meta.chapters` | **survives** load |
| unknown top-level currency | **survives** load |
| unknown shop upgrade id | **survives** load |
| known-chapter progress alongside them | **intact** |
| all three after an old build *saves back* | **survive** the round-trip |

The mechanism is that `loadMeta` patches in place and returns the parsed object wholesale
(`state.js:136`), and `saveMeta` stringifies that same object. **Data added by a future build is not
destroyed by an older one.** That is the single most important property for this feature, and it is
already true. (One documented exception: the v4→v5 migration `delete`s `m.difficulty`/
`m.maxDifficulty`, `state.js:120-121`.)

### 2.3 What breaks — verified

`meta.chapter` is a **pointer**, not data. `loadMeta` only defaults it when missing
(`m.chapter ??= 'body'`, `state.js:123`), so a value naming a chapter the running build does not
have passes straight through. Then:

```
ensureChapterMeta(meta, 'atlantis')  ->  OK (it only touches meta.chapters)
createRun(meta, { chapter: 'atlantis', … })
  ->  TypeError: Cannot read properties of undefined (reading 'balance')
```

The carousel has the same shape of problem earlier: `browseChapterId = meta.chapter` (`ui.js:204`),
and the guard at `ui.js:487` checks `meta.chapters?.[browseChapterId]` — which **exists**, because it
came from the future save — rather than checking the build's own `CHAPTERS` table. Two later sites
do have fallbacks (`CHAPTERS[d.chapterId] ?? CHAPTERS.body` at `ui.js:1116`, and `ui.js:1174`),
which is why this reads as an oversight rather than a policy.

**Reachable today** by loading a stale cached bundle against a save from a newer build. **Routine
once sync ships.**

### 2.4 The rules

**R1 — Pointer fields are validated against the running build's tables, not merely defaulted.**
Data fields may be unknown; *pointers into tables* may not. `meta.chapter` is the only one today:

```js
// state.js, loadMeta, after the existing `m.chapter ??= 'body'`
if (!CHAPTERS[m.chapter]) m.chapter = CHAPTER_ORDER[0]
```

Note what this costs and what it does not. `loadMeta`'s repairs are in-memory and never written
back, so an old build that merely *looks* at the save leaves the player's real selection intact for
the updated device. Only if the old build performs a save does the selection collapse to `body` —
and a lost *selection* is a different order of harm from a lost *save*. State that ceiling in a
`// ponytail:` comment rather than building selection-preservation machinery for it.

**R2 — Changes to `meta` are additive. Never rename, never repurpose.** While two builds can hold
the same save — which, with sync, is always — a rename is a delete plus an add, and the old build
carries the corpse forward. If a field must change meaning, add a new one and leave the old in
place; storage is 900 bytes against a 5 GB allowance.

**R3 — New content is additive by construction, and the existing idioms already cover it.**

| change | what makes it safe | anything to do? |
|---|---|---|
| new chapter | `ensureChapterMeta` creates the entry on load; `CHAPTER_ORDER` drives unlocks | R1, so the pointer can't dangle |
| new difficulty level | `maxDifficulty` is a number, clamped by `chapterMaxDifficulty` | nothing |
| new permanent upgrade | `for (const id of Object.keys(SHOP)) m.shop[id] = Number(…) \|\| 0` fills it | nothing |
| new currency | `m.newCurrency ??= 0` in `loadMeta`, same idiom as `m.choiceSlots` | one line |
| new mutator / weapon / element | not persisted in `meta` at all | nothing |

The one wrinkle worth knowing: an old build's `owned` sum (`ui.js:560`) includes levels of upgrades
it does not know, so the sacrifice meter reads high on a downgraded device. Cosmetic, self-correcting,
not worth code.

**R4 — `meta.schema`, and refuse to adopt from the future.** Add a single integer, bumped only on a
change an older build genuinely cannot survive (a structural migration, never an additive field).
Default `m.schema ??= 1`.

The rule is asymmetric on purpose:

- **Pulling a blob with `schema` greater than this build understands → do not adopt.** Show
  `This save is from a newer version. Reload to update.` and leave the local save untouched. The
  Worker never parses the blob (design §3.4), so this decision belongs to the client and nowhere
  else.
- **Pulling a blob with a lower `schema` → adopt normally.** That is ordinary backward
  compatibility, which `loadMeta` already handles.
- **Never push a downgrade.** A build that refused to adopt must also not overwrite the newer cloud
  save with its older one, or the updated device loses progress to the stale one. Refusing to adopt
  and continuing to push is the worst of both; the refusal has to suspend sync for that save until
  the build catches up.

R4 is the safety net for the case R1–R3 cannot cover: a genuinely breaking change. It costs one
integer and one comparison, and without it the failure mode is an old build confidently writing a
mangled save back over a good one.

### 2.5 Test obligations

Two scenarios in `test/sim-test.js`, both pure `state.js` work and both permanent:

- **Forward compatibility.** Build a save carrying an unknown chapter, an unknown currency and an
  unknown shop id; assert all three survive `loadMeta` → `saveMeta`; assert `meta.chapter` is
  clamped to a known id (R1); assert `createRun` does **not** throw.
- **`schema` gating.** The decision function returns `'too-new'` for a blob above this build's
  schema, and that outcome pushes nothing.

The forward-compat scenario is the one that will actually catch a regression, because it fails the
moment someone adds a table-backed pointer to `meta` without validating it.

---

## 3. Build order

Each slice ends green, ships on its own, and is revertible without touching the ones before it.

### Slice 0 — harden `state.js` (no sync, no backend)

Everything in the design that improves the *shipped* game, extracted so it can ship immediately and
be judged on its own:

- `loadMeta` coerces `coins`/`runs`/shop levels — **done, v6.6.10 (`c90c1cc`)**.
- R1's `meta.chapter` validation, plus the forward-compat test of §2.5.
- `esc()` in `ui.js`, applied to every interpolated summary value.

No new module, no network, no UI. If sync is abandoned entirely, this slice still deserved to ship.

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

`worker/` is **not** built or deployed by `.github/workflows/deploy.yml`, which runs `npm ci` →
`npm run build` → uploads `dist/`. Verified. So the Worker deploys separately:

- `worker/` holds `wrangler.toml`, `schema.sql`, `src/index.js`, `test.sh`, its own `package.json`.
- Deployed with `wrangler deploy` from that directory — manually at first. A second workflow is
  premature until the Worker changes more than once a quarter.
- The D1 database is created once by hand (`wrangler d1 create`) and its id lives in
  `wrangler.toml`.
- **`SYNC_URL` is a build-time `define`**, alongside `__BUILD_STAMP__` (`vite.config.js:24`), read
  through the same `typeof` guard `ui.js:18` uses. It is a public URL, not a secret — the secret is
  the player's pairing code, which never leaves their devices in plaintext.
- A fork building without `SYNC_URL` gets sync disabled at the module level, which is the correct
  default and now a stated intention.

**Service worker interaction.** `public/sw.js:28` early-returns on non-GET and cross-origin, so
Worker calls bypass the cache — but only while `SYNC_URL` is cross-origin. Add the explicit
pathname guard from design §8 so the property is enforced by code rather than by hostname choice.

Worth noting for §2's sake: the service worker is *why* forward compatibility matters. A player on
a stale bundle stays there until a successful network boot replaces it. Whatever the SW's update
policy is, it is now part of this feature's blast radius.

---

## 5. Rollout and reversal

- **Kill switch:** ship with `SYNC_URL` empty; set it when ready. Unsetting it disables the feature
  on the next deploy without a code revert. Already-paired devices stop syncing and keep playing;
  local saves are untouched, because localStorage is the source of truth throughout.
- **Rollback:** unlinking deletes only the local sync record. The cloud row survives, so re-pairing
  with the same code restores everything. That is the rollback story for the whole feature.
- **No migration required.** Both new `meta` fields are additive and defaulted on load, so every
  existing save works with no migration branch, and a save that visits an old build and comes back
  keeps them (§2.2).

---

## 6. Operations

- **Cost:** free tier throughout. ~3 writes/session against 100,000 rows/day; ~1 KB/row against
  5 GB. The binding constraint is Workers' 100,000 requests/day, which §10 of the design now
  rate-limits for rather than assuming.
- **The quota is shared.** One abused code degrades every player, which is why the per-code daily
  write cap exists and not only the per-IP limit.
- **Monitoring:** Cloudflare's built-in Worker analytics. Do not build a dashboard. The signal worth
  watching is 409 rate — a rising one means the conflict prompt is firing more than the design
  predicts, which would mean a bug in the decision function rather than in the players.
- **Support:** `prev_blob` recovers a cloud save clobbered by a wrong tap, via one SQL statement. It
  covers one generation; the ceiling is stated in design §7.3.
- **Logging:** never the `Authorization` header, never the blob.

---

## 7. Risks, ranked by what they cost if they land

| risk | cost | mitigation |
|---|---|---|
| A data-loss path survives review | a player's progress, silently | slice 2 is headless and over-tested; the three known paths each have a named regression assert |
| Forward incompatibility crashes an un-updated device | the game is unopenable until it updates | §2's R1 + R4, and the forward-compat test |
| The 320px budgets are wrong on real glass | rework in slice 3 | slice 3 builds against the disabled preview state specifically so this is found before traffic |
| Free-tier exhaustion by abuse | sync down for everyone until midnight UTC | four rate-limit layers; local saves unaffected either way |
| The owner stops wanting to run a backend | the feature dies | slices 0 and 2 keep their value; slice 0 has already shipped |

---

## 8. What this strategy deliberately does not do

- **No CI for the Worker.** Eight-plus `curl` assertions in one file, run by hand on change. Add a
  workflow when the Worker changes often enough to forget.
- **No staging environment.** `wrangler dev --local` is the staging environment.
- **No account system, no per-device tokens, no code expiry.** All rejected in the design with
  their upgrade paths; the paths stay open because the Worker never parses the blob.
- **No dashboard, no metrics pipeline, no alerting.** A single-player browser game with a
  900-byte save does not need an on-call rotation.
