# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Charming Anomaly** — a browser survivors-like (Vampire Survivors genre) built with vanilla JS + PixiJS v8, bundled by Vite, shipped as a PWA to GitHub Pages. No framework, no TypeScript, no state library. One `run` object holds all game state; a handful of strictly-scoped modules read and mutate it.

## Commands

```bash
npm run dev        # vite dev server (host:true — reachable from phone on the LAN for touch testing)
npm run build      # vite build -> dist/
npm run preview    # serve the built dist/
npm test           # node test/sim-test.js — headless sim self-check, no framework. 77s, the ship gate.
node test/sim-test.js <name>   # ONLY scenarios whose FUNCTION name matches, case-insensitive.
                   # This is the one to use while iterating: `surf` is 0.09s, `element` 2.4s.
                   # 397 of the suite's 430 assertion blocks finish in 4.4s TOTAL — the whole cost
                   # is 14 functions running full 300s sims for balance curves. A partial run
                   # always prints what it skipped on the last line.
npm run test:fast  # everything except those 14 — 8.6s for 385 of 430 blocks.
node scripts/test-isolation.mjs   # does every scenario still pass ALONE? (a couple of minutes)
                   # Run after adding a scenario, and after any change to how many randoms are
                   # drawn. An order-coupled scenario makes a filtered run a liar: run V.f never
                   # seeded, its measured drift ranges 18-159px across phases, and its threshold
                   # sat at 20 — so it passed only because the full-suite ORDER lands on a passing
                   # phase, and had a ~12% chance of a mystery red on any unrelated edit.
```

**The probes and dev views — one line each. Every one has a trap that has produced a WRONG answer
in this repo (the kiting rig's own geometry, census numbers compared across invocations, map mode's
hidden layers). `probing-the-game` holds all of them; load it before you measure, not after.**

| Command | Answers |
|---|---|
| `node scripts/shot.mjs <url> <out.png> [waitMs] [w] [h] [seed.js]` | phone-viewport screenshot, no MCP tab |
| `node scripts/fx-probe.mjs --scene scripts/scenes/beam-prism.js --out /tmp/pr --frames 14` | reproducible in-game frames of ONE effect, for A/B-ing a look |
| `node scripts/weapon-census.mjs --chapter city --level 5 --weapons sewerGeyser --mods launch=1` | what a weapon actually DOES over real runs: raw vs effective dps, overkill, kills/min |
| `node scripts/charge-probe.mjs` | what a chapter RESOURCE bar (The Twilight's Light) does over real 300s runs |
| `node scripts/wreck-threat.mjs` | WHAT KILLS YOU, by source, per seed — 8 seeds x hunt/ignore x mortal/immortal, FIXED loadout. Read the MORTAL arm for lethality: the immortal one cannot die, so its rows are a damage-taken profile and not a cause of death |
| `node scripts/obstacle-contrast.mjs` | WCAG contrast audit of obstacle footprints per biome |
| `node scripts/prop-scale.mjs` | PROP_SCALE ladder audit + render.js bare-`scale:` regression grep |
| `node scripts/bake-cast.mjs` | re-bake `src/cast/*.png` (title cards' creature thumbnails) |
| `/terrain-preview.html?seed=1&span=14000&cx=0&cy=0` (npm run dev) | the GENERATOR alone: biome tint + roads, fast |
| MAP MODE (`?debug`, then `__renderer.setMapMode(true,1)`) | the REAL renderer, wide-area — **judge any layout question here**, a gameplay shot shows one city block |

There is no single-test runner and no test framework: `test/sim-test.js` is one plain-node file of `assert`-based scenarios that seeds `Math.random` (mulberry32) for determinism and prints `PASS …` / `ALL TESTS PASSED`. To run a subset, pass a name (above) — do not reach for jest/vitest. To add a check, append a scenario in the same style. **Anything free of Pixi and DOM is testable this way** — the suite already imports `sim.js`, `config.js`, `state.js`, `sync.js` and `fr.js`. (`sync.js` deliberately keeps browser globals out of its module scope precisely so it can be imported here.) `render.js` and `main.js` are not importable, but the suite still asserts against them as **source text** — see run UG.k, which greps `render.js` to prove a declared hook is actually forwarded and read. Reach for that trick when a render-side contract has no other guard.

**Six scenarios lint CROSS-FILE CONTRACTS as source text, and they are the cheapest guards here.**
An architecture audit over 273 releases found the single largest root-cause class — 28% of every
defect that reached the live URL — is *one fact authored in two places that drifted apart*, and
none of those places is an import, so nothing throws. `run EV` (every `{type:'x'}` sim emits has a
render case, an `SFX_FOR_EVENT` entry, or a written line in `SILENT_BY_DESIGN`), `run SQ`
(`run.enemies.push` confined to `spawnEnemy` + `flushSpawns`; nothing indexes the array to recover
what it just made), `run CP` (every array handed to `syncPool` is named in `clearWorld`'s flat
list, and no pool sits in both lists), `run VO` (roster behaviour flags, elite affixes, sfx names
and structure kinds all resolve on the other side), run XX's config-table walk, and `run MB.a`
(every weapon mod in the game — 201 across 38 weapons — resolves to a `WEAPON_STAT_MODS` fold, a
`WEAPON_RATE_MODS` division, or a read at its own fire site; anything else is an INERT CARD, offered
and picked and banked and doing nothing, with nothing thrown and no test red). **MB.a strips
comments from sim.js before searching, and that line is load-bearing:** every mod id is discussed in
prose right beside its wiring, so a raw substring search is satisfied by the comment alone — delete
a fold and leave the sentence explaining it and the card goes inert while the check stays green.
That exact edit is a mutation in its proof table and it passed until the strip existed. Add to these
rather than inventing a new mechanism: they cost ~200ms and they caught four consumerless events,
a pool that leaked its sprites into the next run, and five untranslated build-sheet rows on the day
they were written. **The corollary for new copy: put player-visible strings in a config TABLE.**
run XX enumerates tables, so copy in a function or a bare const is exempt from it by construction —
that exemption has now shipped untranslated strings four separate times. **A table is not enough on
its own: the walk reads `.name`/`.desc` one level deep, so copy NESTED deeper is just as invisible.**
`CHAPTERS[].roster[].name` sat unwalked for the whole life of the project and three of the game's 46
creature names were still English — found in v7.120 by SHOOTING the French panel, not by any assert,
because a creature's name had no French-facing surface until the summary screen's "Killed by …" line
invented one. **A new screen can CREATE an i18n gap, not only reveal one:** when you put an existing
field in front of the player for the first time, check that field is in the walk, not just that its
table is.

**A PROFILER TELLS YOU WHERE TIME GOES, NEVER HOW MUCH A FIX SAVED.** `--cpu-prof` does not tax
uniformly: it weighs allocation heavily, so optimising away allocations measures far better under
the profiler than in reality. The separation rewrite read as 25% faster comparing a profiled
before against an unprofiled after, and was 6.4% with neither side instrumented. Quote the A/B,
not the profile. And when a change is meant to be behaviour-neutral, PROVE it — extract the old
tree (`git archive <ref> src | tar -x -C <tmp>`) and diff full end state across several seeded
runs, rather than inferring it from a green suite. Make the harness assert the old tree really
contains the old code: pointed at the wrong ref it compares HEAD against itself and prints a
screenful of reassuring IDENTICALs.

Corollary worth stating, because it is easy to run `npm test` as a ritual: **`scripts/` and `docs/` are not in that import graph.** A harness-only or spec-only diff gets zero coverage from the suite — it will pass whatever you did. The real check for a `scripts/*.mjs` change is running the script; `git status --short` is what tells you whether you strayed into `src/`.

## The hidden dev menu (v7.12) — how to test one specific card

**Seven quick taps on the TITLE WORDMARK** turn DEV on (the pill appears); then **one tap on the
HUD coin badge**, mid-run, pauses the game and opens a list of *every* card the game can produce
(190 of them: weapons, passives, weapon mods, elements, anomalies).
Tapping one adds it to the run; the list rebuilds, so a weapon you just took now reads `Lv 2`.
Resume closes it. It ships in the production bundle deliberately — the point is to test a card on
a phone against the live URL, not only on localhost.

- **THE BADGE HAS NO GESTURE OF ITS OWN, AND THAT IS THE POINT.** It used to take its own
  seven-tap burst, independent of the title's DEV toggle — so the game had TWO dev switches and
  therefore two different answers to "is this a dev run". The leaderboard was wired to only one of
  them: `run._devUsed`, set when a dev CARD is taken. A run played with DEV on to reach a WIP
  chapter submitted to the public board like any other, and did (v7.161.0). One switch now:
  `meta.dev` gates the card list, and `endRun` (main.js) refuses to submit anything played under
  it. If you ever give the badge its own gesture back, you have re-created the bug — run LB
  asserts the gate, so the suite will tell you.
- The title's seven taps must be within `DEV_TAP_WINDOW_MS` (1s) of each other, so the counter
  cannot creep up from stray taps.
- The filter matches title, description **and kind** — type `anomaly` to get the whole slate,
  `mod` for all 134 weapon mods.
- `devCards(run)` (sim.js) ignores every eligibility rule on purpose: chapter pool, minLevel, an
  anomaly's `when` gate, `MAX_ANOMALIES_PER_RUN`, already-picked dedup. That is the whole point —
  SUBMISSION needs an elite kill before the real pool will offer it.
- `devTake` routes through `applyChoice` via `run.levelUpChoices`, so a dev-added card takes the
  **shipped** code path. Do not reimplement the branches here; you would be testing a second
  implementation instead of the game.
- Run DV in the suite guards both halves. Both fail silently otherwise: `devCards` walks the
  rarity ladder because `make*Card` returns null for a tier a card does not offer (a `switch` mod
  is normal-only, Sweep Loot is epic-only), and without the walk **9 cards are simply absent from
  the list** — exactly the ones whose rarity rules are unusual, i.e. the ones most worth testing.
- The dev screen is Pixi-free like the rest of ui.js, so its layout is testable with the throwaway
  `harness.html` trick below (see *When there is no MCP browser tab*) — no app boot needed.

## Module architecture — the boundaries are the design

Every module has a hard rule about what it may touch. These rules are what make the sim headless-testable and the renderer swappable; **do not cross them.**

| File | Role | May NOT touch |
|------|------|---------------|
| `terrain.js` | **The world generator** (v5.11). Pure fns of `(x, y, seed)`: elevation/moisture noise fields, rivers, cities (each owning its street grid), biome classification, road queries. Imports nothing; `config.js` re-exports its surface so sim/render keep one import source. | anything — no imports at all |
| `config.js` (4.9k lines) | All balance numbers + `CHAPTERS`/`WEAPONS`/`WEAPON_MODS`/`ELEMENTS`/`MUTATORS` tables. Treated as **read-only ground truth** by every other module. | — (pure data + pure helper fns) |
| `state.js` | `run` shape (`createRun`) + persistent save (`loadMeta`/`saveMeta`, `localStorage`) + save migrations. | Pixi, DOM (localStorage only) |
| `sim.js` (6.3k lines) | **Pure simulation.** `stepSim(run, input, dt)` advances the world and pushes to `run.events`. | Pixi, DOM, localStorage — nothing but `run` + `config` |
| `render.js` (12k lines) | PixiJS renderer. Reads `run`, **never mutates it**. Bakes entity looks into textures once; per-frame work is sprite pools. | writing to `run` |
| `ui.js` | DOM overlay (`#ui`): title, shop, HUD, level-up, pause, summary screens. | Pixi |
| `input.js` | Floating touch joystick + WASD/arrows → normalized move vector. | — |
| `audio.js` | Procedural WebAudio SFX (no audio assets — every sound is synthesized). | — |
| `main.js` | **Glue only.** Boots Pixi, owns the ticker + phase transitions, wires UI hooks. Keep logic out of here. | game logic |

### The frame loop (main.js)

`app.ticker` each frame: `stepSim(run, getInput(), dt)` → drain `run.events` into a fresh array → `renderer.sync(run, dt, events)` → map events to SFX → `ui.updateHUD` → react to phase change (`levelup`/`dead`/`victory`). `dt` is clamped to 0.05s. When paused/modal, `renderer.sync(run, 0, [])` draws a frozen world.

`sync`'s `dt` also drives `animT`, which every sprite ROTATION and pulse is derived from — so `dt = 0` freezes the animation as well as the sim. That is the intended modal behaviour, and it is also the reason anything driving frames by hand has to pass real time when it wants motion (see `scripts/fx-probe.mjs`).

### Sprite pools vs. rigs (render.js)

One sprite per entity goes through `syncPool`. An entity needing independently-transformed parts (counter-rotating rings, scrolling beam streaks) is a **rig** instead: a `Container` per pool slot, acquired by its own `acquireX()`, hidden by `.root.visible = false`. Which pool is which is not guessable — read `reset()`, where the flat ones sit in one array literal and every rig gets its own `.root` line.

**Converting a flat pool to a rig has a second site that fails silently.** `reset()` walks a hardcoded list of flat pools doing `for (const s of pool) s.visible = false`. Leave a rig pool in that list and it sets a dead property on a plain object — no throw, no warning, and the previous run's entities stay on screen. Move it down to the `.root.visible = false` block with the other rigs.

### The event contract

`sim.js` never calls render or audio directly. It **pushes event objects** (`{type:'hit'|'kill'|'shoot'|'explode'|'levelup'|…}`) onto `run.events`; `main.js` drains them once per frame and fans them out to the renderer (visual bursts) and `SFX_FOR_EVENT` (audio). Adding a new visible/audible effect = emit an event in sim, then handle it in render.js and the `SFX_FOR_EVENT` map. **The authoritative list of every event shape and every `run.*` field lives in the giant doc block in `state.js` (lines 438-1115)** — read it before adding entities or events; keep it in sync when you change the `run` shape.

**A NEW MECHANIC IS INVISIBLE UNTIL IT REACHES A CONTRACT FIELD, and invisible is
indistinguishable from broken.** render.js tints, holds poses and spawns status particles off
NAMED fields it reads straight from the enemy — `frozen`, `chill`, `venom`, `ignite`, `fearT`,
`stunT` (the "Elemental status (contract fields, guarded)" block). It never learns about your
flag: the v7.5x elements rework kept freeze in a private `_elFrozen`, and `grep -n "_elFrozen"
src/render.js` returned nothing, so frozen enemies simply stopped dead — no ice tint, no held
animation — and the `{type:'freeze'}` event sim pushed had no consumer in render.js *or*
`SFX_FOR_EVENT`. On screen that is exactly what "cold does nothing" looks like, and it shipped to
the live URL that way. So: **publish into the existing contract field rather than teaching
render.js a new one** — sim owns those fields, render only reads them, and a one-line publish
restores the whole tell. Before shipping any new status, grep render.js for the field you are
actually setting. A missing tell is also worth a deliberate decision on SOUND: `SFX_FOR_EVENT`
gets a new entry only if the event is rare enough to bear one (freezes fire dozens of times a
minute, which is why SUBMISSION's expiry has no sound either).

### The chapter system (v5.0+)

`CHAPTERS[id]` (config.js, ordered by `CHAPTER_ORDER`) defines each biome: its `weapons` pool (scopes the level-up weapon offers), `starter` weapon, enemy `roster` (mapped to base archetypes `normal`/`fast`/`tank` via `hpMul`/`speedMul`/behavior `flags`), `eliteFlags`, a `signature` mechanic (e.g. `currents`, `pheromones`, `predators`, `gravity`, `traffic`), `obstacles`, and a **render-only** `render` block (tints/bg, zero sim effect). Enemy behavior flags (`latch`, `split`, `dashBurst`, `diveBomb`, `pounce`, `missileVolley`, …) are chapter-agnostic strings that sim.js reads — the flag vocabulary is documented inline in `state.js`'s doc block and each flag's tuning block in config.js.

Chapters unlock progressively (win at difficulty 3+ unlocks the next); each has its own difficulty ladder in `meta.chapters[id]`. `ensureChapterMeta` (state.js) repairs/creates per-chapter save entries on every load, so a save predating a newly-shipped chapter always resolves cleanly. **When adding a chapter, add it to `CHAPTER_ORDER` + `CHAPTERS`** and the migration/unlock logic handles the rest.

## Non-obvious constraints (breaking these produces a blank page in prod)

- **No top-level `await` in `main.js`.** Suspending module evaluation deadlocks Pixi v8's dynamically-imported environment code in the production bundle (hangs on a blank page). `boot()` is a plain async fn, *called* near the top of `main.js` and *declared* just below it — hoisting makes that legal, and the point is that nothing awaits at module scope.
- **`vite.config.js` sets `inlineDynamicImports: true`.** Pixi v8 auto-detects its environment via dynamic import; as a split chunk it never loads in prod. Don't remove this.
- **Asset globs use `import.meta.glob('./props/*.png', { eager: true, query: '?url', import: 'default' })`** in render.js — resolves to URL strings at build time, no runtime dynamic-import graph (required by the constraints above). Add art to `src/props/` (foliage) or `src/fx/` (Kenney particle PNGs, tinted per-use); they're auto-discovered. `src/cast/*.png` (ui.js) is the same idiom, but those files are **generated**, not authored — `node scripts/bake-cast.mjs` re-bakes them from render.js's own creature textures. Nothing warns you if they go stale.
- **`base: './'`** in vite config — the game ships to a GitHub Pages subpath, so all asset paths must stay relative.

## Conventions

- **Never choose a version number. `npm run ship "<one plain sentence>"` assigns it**, amends HEAD
  and pushes to `main`. Chores use `chore: …` and stay on your branch. **Load
  `shipping-a-release` before you ship, push, or reconcile a branch** — it carries why the number is
  never yours to pick, that ship's amend DESTROYS the commit body, that a rejected push is often
  another session's branch and `git pull` is the dangerous fix, and that `main` can delete the
  function you are mid-way through rewriting (it did, costing a whole task's work).
- **`git log --oneline origin/main..HEAD` before shipping tells you what you are about to publish,
  and it is the list you must actually READ**, not just confirm is short. `git fetch && git log
  --oneline HEAD..origin/main` costs one second — run it before rewriting any shared function.
- **`meta` FIELDS ARE ADDITIVE-ONLY. Never rename, never repurpose, never delete a top-level field**
  (R2, `docs/superpowers/specs/2026-08-04-cross-device-save-sync-tech-strategy.md:124`): *"A rename
  is a delete plus an add, and the old build carries the corpse forward."* An old build is always
  still out there — a revert, a stale tab, an un-updated device, `public/sw.js`'s offline shell —
  and it will push its blob over a slot the new build already migrated. Proven on this project's own
  per-book-progression design: rev 1 moved `meta.coins`/`shop`/`choiceSlots`/`lightThief` under
  `meta.books[bookId]` behind a SCHEMA bump; running that save back through the ALREADY-SHIPPED
  `loadMeta` wiped it completely (137 runs, fr, beyond unlocked → 0 runs, en, locked), because
  `loadMeta`'s own `catch { /* corrupted save -> fresh */ }` swallows the TypeError with no warning.
  Rev 2 is additive by construction and needs no migration step at all — see that spec's "Revision
  history" before you touch the save shape.
- **A SUBAGENT DISPATCHED TO REVIEW UNCOMMITTED WORK MUST BE TOLD, IN ITS PROMPT, NOT TO MUTATE THE
  TREE.** Spell out the allowed set (`git diff`, `git show`, `git log`, file reads) and the forbidden
  set (`git stash` in any form, `git reset`, `git checkout`, `git restore`, `git clean`, `git add`,
  `git commit`, and any edit). On 2026-08-09 an adversarial reviewer, asked to check whether a test
  failure pre-existed, ran `git stash` — which reverted the entire uncommitted change it had been
  asked to review, across five files. It is recoverable (`git stash list --format='%H %gs'`, then
  `git stash apply <sha>`, then drop the entry), but only if you notice; the symptom is edits
  "disappearing" from files you know you wrote. A reviewer has no reason to touch the tree, so say
  so — the model will otherwise reach for stash the moment it wants a clean baseline. This compounds
  with the shared stash stack across worktrees: an agent's stash lands on the same stack every other
  session pops from.
- **`CHAPTER_ORDER` IS BOOK 1 ONLY. A sweep over "every chapter" that uses it silently skips The
  Blank and the whole of Book 2.** It is `BOOKS.book1.chapters`; `ALL_CHAPTER_IDS` adds the other
  books' ladders but still drops every `hidden` id. The honest denominator for "does every chapter
  satisfy X" is `Object.keys(CHAPTERS)`. This is not theoretical: run RA (roster art) was written
  specifically to guard the new Book 2 roster, shipped green over `CHAPTER_ORDER`, and a mutation
  deleting the copepod's `ROSTER_LOOKS` entry passed it — the test could not see the only chapter it
  existed for. The tell is a count in the PASS line that you have not checked against reality: it
  read "25 roster entries across 7 chapters" when the answer is 35 across 9. Print the denominator
  in every sweep's log line, and assert the set contains the id you are actually working on.
- **`// ponytail:` comments** mark deliberate simplifications with their known ceiling and upgrade path — respect them; don't "fix" a marked shortcut without cause.
- **A BALANCE DECISION GETS ONE LINE, IN A FIXED FORMAT — NOT AN ESSAY** (owner, 2026-08-17:
  "stop adding so many comments about balance decisions etc. just have a common template"):

  ```js
  // balance_decision : [10 word desc max] [date]
  //  - [optional: ONE bullet, only if it needs a warning]
  ```

  The bullet is for a warning a future editor would otherwise trip over ("does not reach the gull",
  "`src === 'gull'` is load-bearing"), not for the reasoning, the measurement, the owner's quote, or
  the history of previous tunes. **Where the reasoning goes instead: the commit body.** That is what
  `git log`/`git blame` are for, and unlike a comment it cannot rot against the number it describes.
  This rule EXISTS because those blocks were reaching 25 lines for a two-decimal change and the
  arithmetic in them was already restating what the diff shows. Do not reinstate a deleted one.
  Note the interaction with `npm run ship`: it amends HEAD with `-m` and destroys the body, so push
  the branch (or write the reasoning on the commit BELOW the release) before shipping.
- **SEVEN RULE SETS LIVE IN SKILLS, NOT HERE — load the skill BEFORE the work, not after.** They
  were moved out because they only apply to one kind of task and this file is read on every call;
  moving them does not make them optional. If you are about to do the thing in the left column and
  you have not loaded the skill, stop.

  | About to… | Load |
  |---|---|
  | measure anything, run a probe, shoot a frame, judge a layout | `probing-the-game` (or dispatch the `measure` agent) |
  | draw or bake anything, write a card name, desc or any player-visible string, touch `fr.js` | `game-art-and-copy` |
  | rename an existing id/field/display name, or name a new mechanic | `renaming-safely` |
  | add or redesign a weapon or weapon mod | `design-a-weapon` |
  | add or rework an enemy, elite affix, boss or hazard | `designing-an-enemy` |
  | ship, push to `main`, or reconcile a branch whose push was rejected | `shipping-a-release` |
  | say how far along a chapter is, or move one past a dev stage | `verifying-chapter-stage` |

  Weapon-wiring specifics (`STAT_KEYS`, the epic-switch idiom, per-cast counts, shared entity
  arrays, chapter-conditional behaviour) live in `design-a-weapon`'s phase 4 checklist — one copy,
  deliberately, because this file previously held a second copy of two of them and both went stale.
- **`.screen` is `position: absolute; inset: 0`; a screen-level class must NEVER re-declare
  `position`.** Run SP in the suite lints this from `styles.css` — put the declaration on a child
  or a `::before`, never on the screen element itself.
- Balance changes go in `config.js` and nowhere else. If you're typing a magic number into sim.js, it belongs in config.js as a named export.
- **A red `sim-test` band is not proof your change caused it — several bands are eyeballed literals
  under 3σ.** The suite seeds `Math.random` once per scenario, so ANY change that alters how many
  randoms get drawn re-phases the whole stream and re-rolls every sampled statistic. Two bands were
  measured sitting at 2.6–2.8σ: the anomaly slot-uniformity check (±0.06 on ~400 anomaly pools,
  where 1σ = 2.2pts) and `mod > 24` in the partial-arsenal fixtures. v7.7 moved five bucket weights
  and drew a false red on the first — slot 2 of 4 at 31.6% — for a placement that is
  `Math.floor(random * cards.length)` and cannot read `BUCKET_WEIGHTS` at all. **Protocol:** before
  attributing a red to your diff, ask whether the assertion's subject is even reachable from what
  you changed, then re-run with a different seed. If it goes green, the band is under-powered — fix
  it with a power calculation (state N, 1σ, and the size of the pathology it must still catch), and
  mutation-prove the widened band still fails on that pathology. Do NOT retune your change to
  satisfy a noisy test.
- **Mutate a scratch copy, never the working tree.** Mutation-proofing an assertion means editing
  `sim.js`, and `git checkout src/sim.js` to undo it silently discards any real edit you already had
  in that file (v7.7 lost a comment fix this way and only caught it from `git status`). Either
  extract a throwaway tree (`git archive <ref> | tar -x -C <tmp>`) and mutate there, or re-read
  `git status --short` after every revert.
  **Every mutation must be DISTINCT as well as applied.** A harness that skips on a missing anchor
  still cannot see two entries whose `from`/`to` are the same edit under different labels — that is
  a passing check that checks nothing, and it inflates the count you then quote as proof. v7.62
  shipped a four-mutation table where two entries both just deleted the `flushSpawns(run)` line, one
  of them captioned "the flush moves to the BOTTOM"; it was caught by re-reading the harness, not by
  running it. Diff the entries, and prefer a mutation that expresses the pathology (move the call)
  over one that merely removes the code.
- `.gitignore` covers `node_modules/`, `dist/`, `.claude/worktrees/`, `.wrangler/` and `/*.png` — **and no other scratch artifact**. The last one is the trap: only a `.png` at the repo ROOT is ignored. A PNG in a subdirectory is not; neither is a `.json` dump, nor a screenshot in any other format. A 464 KB `_p4.jpg` sat tracked at the repo root for eleven versions for exactly that reason. Delete every scratch file explicitly before committing, and check `git status --short` rather than trusting the ignore rule.
- **`public/` is tracked PWA assets, not scratch** (`sw.js` is registered by `main.js`). Do not "clean up" anything in it. If you need the dev server to serve a probe artifact, put it somewhere you will delete and verify with `git status --short`.
- Deploy is automatic: pushing to `main` triggers `.github/workflows/deploy.yml` (build → GitHub Pages).
- **NEVER put a backtick inside ANY double-quoted zsh argument** — `node -e "…"`, and `git commit -m
  "…"` just as much. The shell is zsh: backticks inside a double-quoted
  argument are command substitution, so `` `swept` `` runs `swept` as a command and substitutes its
  (empty) output. The visible symptom is a `command not found` line — which reads as "the command
  failed", while node **has already run** with your string silently shortened. v7.10 lost four calls
  to this: the run applied most of its replacements and ate one `` `swept` `` out of a comment, then
  the follow-up script reported 33 misses because the work was already done. Anything with backticks,
  nested quotes or newlines goes in a `.cjs` file that you run — the same reason the NBSP rule above
  sends fr.js edits through node rather than through an exact-string anchor. v7.16 hit the SAME
  trap in `git commit -m`, where it is quieter still: the commit SUCCEEDS, and two backticked
  identifiers are simply missing from the message. Write a non-trivial commit message to a file and
  use `git commit -F <file>` — and if you only notice afterwards, `git commit --amend -F` fixes it
  while the commit is still unpushed.
## Design docs

`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the v1 design, the chapters design, and the chapters implementation plan — useful background for why systems are shaped the way they are.
