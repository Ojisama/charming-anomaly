# Cross-device save sync — slice 3 plan

**Date:** 2026-08-24
**Companion to:** `../specs/2026-08-03-cross-device-save-sync-design.md` (what to build and why)
and `../specs/2026-08-04-cross-device-save-sync-tech-strategy.md` (the five-slice build order).
**This document:** what slices 0–2 actually shipped, what drifted underneath them in the ~215
releases since, and the task list for slices 3 and 4.

---

## 1. Status, verified against the tree

Slices 0, 1 and 2 are **done**. They landed as `chore:` commits and therefore carry no version
number, which is why the release log shows no trace of a feature that is two thirds built.

| Slice | State | Evidence |
|---|---|---|
| 0 — harden `state.js` | shipped | `SCHEMA = 1` and the R4 `schema` field, R3 clamp-on-use (`maxDifficulty`/`choiceSlots` floored on load, clamped in `createRun`), R1 pointer guard, `NAME_MAX = 14`, `exportSlot`/`importSlot`/`freezeSaves`/`setSaveHook`. |
| 1 — the Worker | shipped **and deployed** | `worker/src/index.js` serves GET/PUT/DELETE `/v1/save`: gen-counter optimistic concurrency, `INSERT .. DO NOTHING` for the first write, tombstones, `prev_blob`/`prev_gen` operator undo, rate limiter keyed on the code hash. Live at `charming-anomaly-sync.ojisama-san.workers.dev` — no auth answers 401, a well-formed code answers 404 `no save under this code`, so the D1 `saves` table exists and the row lookup runs. `worker/test.sh` holds the curl assertions. |
| 2 — `sync.js` **decision core** | shipped | `decide` (all five rows including the resync), `deriveDirty`, `isOwnLostAck`, `schemaOk`, `adopt`, record I/O. Covered by run **ZZ.a–h**, **SM.a–e** and `testForwardCompatibleSave`. |
| 2 — `sync.js` **transport** | **missing** | There is no `fetch` in `src/sync.js` — the only occurrence of the word is in the header comment. No code generation, no `navigator.locks`, no timeout, no status classification. See S3.0. |
| 3 — UI | not started | Nothing imports `sync.js` but `test/sim-test.js`. |
| 4 — turn it on | not started | `vite.config.js` defines only `__BUILD_STAMP__`; `SYNC_URL` reads `''` in every build. |

Two design sections turn out to be **already built** as part of slices 0/2, and the strategy's
slice-3 list should not be read as still owing them:

- **§4.1 new `meta` fields** — `name`, `savedAt`, `schema` all land in the fresh literal and default
  on load (run SM.e; `savedAt` is stamped before the write).
- **§4.2 `saveSummary`** — total, tolerant of a raw untrusted blob, and reuses the hero card's ★
  field so the conflict prompt and the card can never state two different numbers.

---

## 2. Drift since 2026-08-04, and what it changes

### 2.1 Four costs the design budgeted are already paid

1. **§9.5's premise is obsolete.** The design's *"`grep '<input'` across `src/` returns nothing"* is
   no longer true: `rename-field`, `nick-field` and `dev-filter` all exist. `ui.js` states the
   handover explicitly — *"This is the codebase's first `<input>`, and the pairing field will reuse
   exactly this machinery."* All five of §9.5's listed costs are settled: the out-of-render draft +
   caret restore (the render model), actions rendered **above** the input (iOS keyboard occlusion),
   `.text-field` with `user-select: text; touch-action: auto` (the global CSS block), the full input
   attribute set, and the tab-switch reset. **This was the largest single line item in slice 3.**
2. **§9.4 is applied.** `.slot-row-wrap` holds two sibling buttons, both lines carry
   `white-space: nowrap; text-overflow: ellipsis`, and `NAME_MAX` is 14. The CSS comment already
   anticipates this feature: *"a name … can also arrive from another device once saves sync"*.
3. **§9.1's 536px budget crisis is moot.** v6.7 introduced the ⚙ settings sheet with a row component
   (`.settings-slots`: label plus a right-aligned `<i>` value) already rendering `💾 Save slots 2/3`
   and `🏆 Nickname —`. Sync becomes a third row of that component, one level **above** the slots
   sheet, so the slots sheet's height budget is untouched. See §3 decision D2.
4. **No host to provision.** The leaderboard already ships the Worker's origin in the bundle
   (`scores.js`'s `SCORES_URL`). Same Worker, same deployment, same CORS story.

### 2.2 Two things changed against us

5. **Reset is dev-only.** `reset-start` fires only from `renderDev`, behind the seven-tap dev toggle
   — `ui.js` says so outright: *"Opened from the DEV screen (renderDev), not the shop — nothing else
   can reach it."* §5.4 (tombstone-on-reset) and §9.6 (two conditional reset bodies) both assumed a
   shop 🗑 that every player could tap. As shipped, **no player can erase a save at all**, so that
   branch has no player-facing trigger. See decision D1.
6. **Per-book progression landed (2026-08-16), after the design.** Books 2+ nest under
   `meta.books[bookId]`; `SCHEMA` stayed 1 because rev 2 is additive by construction. `importSlot`
   validates `shop` and `chapters` only — `loadMeta`'s own guard (run BP.ad) already survives
   `books: "x"` without wiping, so there is no hole, but the adopt path deserves its own assertion
   rather than inheriting one. Separately, `meta.nick` is now a **second** player-authored string
   that crosses devices with the save; §4.1's clamp covers `name` only.

---

## 3. Decisions taken by the owner, 2026-08-24

- **D1 — the reset/tombstone branch is cut from slice 3.** §5.4 and §9.6 are not built. The `DELETE`
  endpoint stays built and unused. **Unlink** is the only erase-adjacent control a player has, and
  it is already the feature's rollback story: it deletes the local record only, the cloud row is
  untouched, and re-pairing with the same code restores everything. Revisit the day reset becomes
  player-reachable again — the endpoint and its idempotency are already there.
- **D2 — the entry point is a ⚙ settings row, not a 💾 slots-sheet row.** `☁️ Cloud sync <i>Off</i>`
  as a third `.settings-slots` row. Three taps rather than four, an existing component reused
  verbatim, and the row's own `<i>` value **is** §9.7's ambient status signal — so that requirement
  is met with no new glyph and no new tap target. §9.1's slots-sheet row is superseded.
- **D3 — the first cut defers re-pointing.** §9.4's *"Which save syncs?"* picker is not built. The
  destination-slot picker at pairing time (§5.3) already answers the question once, which is as
  often as most players will ever ask it. Everything else in §9 ships together, conflict prompt
  included: a conflict is reachable the moment two devices exist, so there is no honest release that
  omits it.

---

## 4. The work

### S3.0 — the transport layer in `sync.js` (no UI)

The decision core has nothing to decide *with* until this exists. All of it lives inside function
bodies — the module's no-browser-globals-at-module-scope rule is what keeps `npm test` able to
import it, and it is one careless line from being lost.

- `newCode()` — 16 chars of Crockford base32 from `crypto.getRandomValues`, displayed
  `XXXX-XXXX-XXXX-XXXX`. Pure given an injected byte source, so it is testable headless.
- `canonicalize(typed)` — uppercase, `I`/`L` → `1`, `O` → `0`, strip hyphens and spaces, reject
  anything left outside the alphabet. Pure; this is the function that lets the field be generous
  about what a player types off a phone screen.
- `pull()` / `push()` / `del()` — `fetch` against `SYNC_URL`, `Authorization: Bearer <code>`,
  `AbortSignal.timeout(5000)`. Every one returns a tagged result (`ok` / `conflict` / `notFound` /
  `rateLimited` / `serverError` / `offline` / `timeout`) rather than throwing, because §8 needs the
  three failure classes to carry three different messages and "offline" is a lie when the wifi is
  fine.
- Every push wrapped in `navigator.locks.request('ca-sync', …)` (§6.3).
- `link()` — mint, write the record, **push immediately**, and surface `uploading` → `ready` only on
  the ACK. This is push trigger 4, and without it device B types a correct code and gets a 404.
- Early-return the whole module when `SYNC_URL` is `''`.

**Guard:** extend run ZZ with the canonicalizer's table (including the ambiguous-character
substitutions and a rejected string) and the tagged-result mapping for each status code. Both are
pure. Per `assert-effects-not-state`, mutation-prove them on a scratch tree.

### S3.1 — the settings row and the sync sheet

- `☁️ Cloud sync <i>…</i>` row in `settingsSheetHtml`, below `💾 Save slots`.
- A new sheet on the `.modal-backdrop` / `.confirm-sheet` idiom, with three states:
  - **unlinked** → the two-sentence explainer, `Sync Slot N` (slot number interpolated, never an
    implicit default), and `I have a code`.
  - **linked** → evidence-based status (§9.3), the code revealable, `Copy code`, `Unlink`.
  - **disabled preview** (`SYNC_URL === ''`) → renders, greyed, with a reason. It must not vanish:
    `npm run dev` sets no `SYNC_URL`, and the phone-on-the-LAN check is how the layout gets judged.
- Private-browsing case renders the row disabled with `Unavailable in private browsing.`, never
  silently.

### S3.2 — pairing, both directions

- **Device A:** `Uploading…` → `Ready — enter this code on your other device` + the grouped code +
  `Copy code` via `navigator.clipboard.writeText`.
- **Device B:** the code field — reusing the rename sheet's out-of-render draft and caret restore
  verbatim, with `autocapitalize="characters"`, `enterkeyhint="go"`, `maxlength="19"` and
  auto-inserted hyphens — then the destination-slot picker of §5.3, which is `slotRowHtml` with a
  different heading and a different `data-act`.
- Empty destination → `importSlot` + reload. Occupied destination → the S3.3 prompt, whose
  `Decide later` returns to the picker.
- Success is confirmed on the title after the reload: `Linked. Slot N now follows you between
  devices.` Sixteen typed characters ending in a silent reload is indistinguishable from failure.

### S3.3 — the conflict prompt (§7.2)

One component, two entry contexts differing only in heading. Two stacked full-width cards from
`saveSummary` — recency in the header, `runs` present, coins and upgrades on one line so the trade
reads as a trade, the ★ row rather than "beat N" — each owning its own button, plus
`The other one is deleted.` and a quiet `Decide later`.

- Whole render wrapped in try/catch falling back to a "could not be read — keep local" state.
- Recency via `Intl.RelativeTimeFormat` under a day, absolute beyond it, in the active language,
  with the `savedAt === 0` and future-clamp branches.
- 400 ms tap shield after the sheet animates in — note `pop-in` is disabled under
  `prefers-reduced-motion`, which renders both destructive buttons instantly.
- `Play` and the nav disabled while a conflict is pending: `ui.js` already documents that keyboard
  focus reaches Play behind a backdrop, and this modal cannot use the `case 'play'` force-close
  escape because it must not be dismissible.
- The prompt re-derives from the current 409 response, never from a cached one.
- After each choice, per §7.3 — including the local-side discard key, which is the counterpart to
  `prev_blob` and covers the button a player is *more* likely to hit by accident.

### S3.4 — wiring in `main.js`

Glue only, per the module rules.

- `setSaveHook` → the 10 s trailing debounce (push trigger 3).
- `isIdle: () => run === null` passed in at wiring time. `run` is a `let` local inside `boot()`;
  without this the safety invariant behind every adopt is prose with no implementation.
- **Pull** on boot after the title renders; on `visibilitychange` → visible with
  `Math.abs(Date.now() - pulledAt) > 10_000`; and **on `run` becoming `null` in `onQuit`** — the
  trigger that rescues the return leg of the owner's own use case, since the summary and pause
  screens both have `run !== null`.
- Never bump `pulledAt` for a pull whose adopt was blocked.
- **Push** at `endRun`'s `saveMeta`, on `visibilitychange` → hidden and `pagehide` while dirty, on
  the debounce, and immediately on linking.
- The adopt notice after a reload: a ~3 s non-interactive title line, the `.build-stamp` slot proving
  the shape is cheap.

### S3.5 — French

~30 new strings. Per the standing rule and `french-copy-ask-the-owner`: every English string gets an
`fr.js` entry **in the same commit**, and the French is drafted as options and put to the owner with
`AskUserQuestion` — never written alongside the English and never handed to a translation subagent.
The design's character counts are layout estimates; the owner's renderings win, and three strings
are already flagged there as likely over budget (the explainer at 110 chars, `Synchroniser
l'emplacement 2` at 28 in a 199.6px button, and the re-point confirm — the last now deferred by D3).

### S3.6 — tests

The sim-test suite cannot import `ui.js` or `main.js`, so the contracts get the source-text
treatment run UG.k and run MB.a already use, and the count in each PASS line names its denominator.

- Every sync string in `ui.js` resolves to an `fr.js` entry. This is the fourth defect class in the
  project's history and the reason the rule exists; the walk must reach the strings wherever they
  live, not merely confirm a table exists.
- `main.js` passes an `isIdle` predicate to `sync.js`, and it reads `run === null`.
- All seven pull/push triggers are present at their named call sites.
- The settings sheet renders the sync row; the disabled-preview state renders when `SYNC_URL` is
  empty rather than returning `''`.
- Carried over from §2.2: an `importSlot` assertion for a blob carrying `books`/`grants`, and a
  `nick` clamp on the adopt path to match `name`.

### Slice 4 — turn it on

- `__SYNC_URL__` in `vite.config.js`'s `define`, behind the same guard as `__BUILD_STAMP__`.
- One free line in `public/sw.js`: `if (new URL(req.url).pathname.startsWith('/v1/')) return`. The
  Worker is necessarily cross-origin today, so this survives a future custom-domain move rather than
  fixing a live problem.
- Add the sync host as a grep string to the deploy gate, so the `define` substitution is **confirmed
  in the live bundle** rather than assumed.
- Pair two real devices and walk the owner's use case end to end, including the return leg from the
  summary screen — the one an earlier draft of §6.3 got wrong.

---

## 5. Explicitly deferred

Not oversights; each has a stated trigger for revisiting.

- **Tombstone-on-reset and the conditional reset copy** (§5.4, §9.6) — D1. Revisit if reset becomes
  player-reachable.
- **Re-pointing the synced slot** (§9.4) — D3. Revisit if players ask to move sync between slots.
- **A UI for `prev_blob`** — the design already calls it an operator escape hatch, recoverable with
  one SQL statement. It stays one.
- **A second `prev_blob` generation.** One generation covers a phone and a laptop completely; three
  devices diverging at once leaves the middle session unrecoverable. Revisit if a third device
  becomes normal.
