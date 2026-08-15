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
node scripts/obstacle-contrast.mjs   # WCAG contrast audit of obstacle footprints per biome
node scripts/bake-cast.mjs           # re-bake src/cast/*.png (title cards' creature thumbnails)
node scripts/shot.mjs <url> <out.png> [waitMs] [w] [h] [seed.js]   # phone-viewport screenshot without the MCP tab
node scripts/fx-probe.mjs --scene scripts/scenes/beam-prism.js --out /tmp/pr --frames 14
                                     # reproducible in-game frames of ONE effect, for A/B-ing a look
node scripts/prop-scale.mjs          # PROP_SCALE ladder audit + render.js bare-`scale:` regression grep
node scripts/charge-probe.mjs        # what a chapter RESOURCE bar (The Shelf's Light) actually does
                                     # over real 300s runs, across THREE axes: spend policy, MOVEMENT
                                     # policy, and whether Light Thief is bought. One spend policy
                                     # cannot tell "the bar cannot fill" from "this player spent it
                                     # all" — a greedy player pins the bar at zero under every tune
                                     # there is, which is what the first cut of this probe reported.
                                     # Rig is immortal + KITING and accepts level-ups: two earlier
                                     # cuts printed full-looking tables for a 36s and a 100s run
                                     # (exited at the first level-up; then died).
                                     # THE MOVEMENT AXIS EXISTS BECAUSE THE KITING RIG LIES ABOUT ANY
                                     # MECHANIC THAT SLOWS YOU. The walk turns at a fixed rate, so
                                     # its circle has radius speed/0.35/2pi — 628px at full speed,
                                     # 377px once the dark slows you to x0.6. Shaft cells are 760px
                                     # apart, so slowing the player SHRINKS THE SAMPLED AREA below
                                     # the spacing of the thing being sampled, and %inLight fell
                                     # 11.8 -> 3.0. That reads exactly like the chapter trapping the
                                     # player in the dark, and it is a property of walking in a
                                     # circle. `seek` (walk toward the nearest shaft when low) is
                                     # the honest model; report the pair, never `kite` alone.
                                     # Generalise it: before believing a probe's damning number, ask
                                     # whether the RIG's own geometry moved when the knob did.
node scripts/weapon-census.mjs       # what a weapon actually DOES over real runs, headless
                                     #   --chapter city --level 5 --weapons sewerGeyser --mods launch=1
                                     # raw vs EFFECTIVE dps, overkill waste, kills/min, hits/s, and a
                                     # per-zone breakdown for run.geysers weapons. Run it before
                                     # answering "is this weapon weak?" — this repo has guessed at
                                     # that twice and been wrong both times.
                                     # COMPARE WITHIN ONE INVOCATION, NEVER ACROSS RUNS: every
                                     # weapon in --weapons is measured off ONE seeded RNG stream, so
                                     # changing weapon A re-phases B's draws. v7.25 read Tail Lash
                                     # at 246 then 263 with no lash change at all — the re-phasing
                                     # trap the sim-test section documents, in the harness. A number
                                     # that moved without a matching code change is noise; re-run
                                     # the whole table and read the ORDER, not the absolute value.

# Terrain, two dev views. Neither ships in the bundle.
#  1. /terrain-preview.html?seed=1&span=14000&cx=0&cy=0  (npm run dev) — the GENERATOR alone: biome
#     tint + roads straight from terrain.js, fast, good for checking coastlines/cities/parcels.
#  2. MAP MODE — the REAL renderer, wide-area. Load the game with ?debug (exposes window.__app,
#     __run, __renderer, __stepSim), then in the console:
#       __renderer.setMapMode(true, 1); document.getElementById('ui').style.display = 'none'
#     and stitch tiles by setting run.player.x/y, calling __stepSim (to stream that tile's
#     buildings — streamObstacles only materialises within 1400px of the player, so tiles must stay
#     under ~2800px), then __renderer.sync(run,0,[]) + app.renderer.render(app.stage) and
#     drawImage(app.canvas) into an offscreen canvas. setMapMode hides the player, entities, weather
#     and light but KEEPS buildings (obstacleLayer lives inside entitiesLayer — hiding that layer
#     wholesale gives you a map of bare roads).
#     A gameplay screenshot shows about one city block; every layout property worth judging —
#     whether a coastline is straight, whether blocks agree with their streets, whether a road
#     network goes anywhere — only exists at several thousand px. Judge layout in map mode.
```

There is no single-test runner and no test framework: `test/sim-test.js` is one plain-node file of `assert`-based scenarios that seeds `Math.random` (mulberry32) for determinism and prints `PASS …` / `ALL TESTS PASSED`. To run a subset, comment out scenarios or temporarily guard them — do not reach for jest/vitest. To add a check, append a scenario in the same style. **Anything free of Pixi and DOM is testable this way** — the suite already imports `sim.js`, `config.js`, `state.js`, `sync.js` and `fr.js`. (`sync.js` deliberately keeps browser globals out of its module scope precisely so it can be imported here.) `render.js` and `main.js` are not importable, but the suite still asserts against them as **source text** — see run UG.k, which greps `render.js` to prove a declared hook is actually forwarded and read. Reach for that trick when a render-side contract has no other guard.

**Five scenarios lint CROSS-FILE CONTRACTS as source text, and they are the cheapest guards here.**
An architecture audit over 273 releases found the single largest root-cause class — 28% of every
defect that reached the live URL — is *one fact authored in two places that drifted apart*, and
none of those places is an import, so nothing throws. `run EV` (every `{type:'x'}` sim emits has a
render case, an `SFX_FOR_EVENT` entry, or a written line in `SILENT_BY_DESIGN`), `run SQ`
(`run.enemies.push` confined to `spawnEnemy` + `flushSpawns`; nothing indexes the array to recover
what it just made), `run CP` (every array handed to `syncPool` is named in `clearWorld`'s flat
list, and no pool sits in both lists), `run VO` (roster behaviour flags, elite affixes, sfx names
and structure kinds all resolve on the other side), and run XX's config-table walk. Add to these
rather than inventing a new mechanism: they cost ~200ms and they caught four consumerless events,
a pool that leaked its sprites into the next run, and five untranslated build-sheet rows on the day
they were written. **The corollary for new copy: put player-visible strings in a config TABLE.**
run XX enumerates tables, so copy in a function or a bare const is exempt from it by construction —
that exemption has now shipped untranslated strings four separate times.

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

**Seven quick taps on the HUD coin badge**, mid-run, pauses the game and opens a list of *every*
card the game can produce (190 of them: weapons, passives, weapon mods, elements, anomalies).
Tapping one adds it to the run; the list rebuilds, so a weapon you just took now reads `Lv 2`.
Resume closes it. It ships in the production bundle deliberately — the point is to test a card on
a phone against the live URL, not only on localhost.

- The taps must be within `DEV_TAP_WINDOW_MS` (1s) of each other, so the counter cannot creep up
  across a run from stray taps.
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

- **Never choose a version number. `npm run ship` assigns it.** A release is still a commit subject
  `vX.Y.Z: <what changed and why, in one plain sentence>` (e.g. `v5.6.16: roar and tail swipe are
  visible — their events were silently dropped`), but you write only the sentence:
  `npm run ship "<that sentence>"` fetches `main`, takes the next free number, amends HEAD to carry
  it, and pushes to `main`. With no argument it reuses HEAD's own subject. Flags need the bare form
  (`node scripts/ship.mjs "…" --patch`): `--patch`/`--major` override the default minor bump,
  `--dry-run` prints the version and subject and touches nothing. Chores use `chore: …` and stay on
  your branch. Ship prints the exact `scripts/deploy-watch.sh "vX.Y.Z · <sha>"` to verify with.
  **Ship amends HEAD with `git commit --amend -m`, which replaces the WHOLE message — any BODY on
  that commit is destroyed.** So write the reasoning where it survives: on the commits below the
  release, or push the branch first (the pre-amend commit stays reachable there) and ship after.
  Also expect the retry path to fire for real: it merged `main` and renumbered twice in one
  afternoon while another session was shipping, which is working as designed — check
  `git log --oneline origin/main..HEAD` comes back empty afterwards rather than assuming.
  Why it exists: an agent that picks a number when it STARTS work picks it hours before `main` is
  next read, and on 2026-08-09 `v6.7.6` and `v6.7.7` each shipped twice — a published duplicate is
  unfixable without rewriting history. ship closes that window to the seconds between fetch and
  push, and if it loses even that race it unlabels the number it never published, merges what
  landed, takes the number free at that moment, and retries — so neither a duplicate nor a gap can
  reach the log. (`scripts/ship.mjs --selftest` asserts the numbering; the race path was proven
  end-to-end against a throwaway remote.)
- **The stamp no longer needs the release commit at HEAD.** `buildStamp()` (`vite.config.js`) reads
  HEAD's subject, and when that isn't a release it falls back to the most recent `vX.Y.Z` in HEAD's
  ancestry, marked `v7.7.0+ · <sha>` — the `+` meaning "there are commits after that release". A
  `chore:`, a docs-only push or a merge commit at HEAD therefore stamps honestly instead of `dev`,
  which is what killed the old land-the-chores-first choreography. It stamped `dev` twice for real:
  v6.10.1 shipped to fix the chore form, and a CLAUDE.md-only push took the live page from
  `v6.10.0 · 969a0e8` to `dev · 4f17cad` one command after that rule was written down. The sha is
  still the part that cannot be duplicated or guessed.
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
- **Measuring damage from `hit` events over-reports.** `{type:'hit', dmg}` carries the RAW swing,
  not HP removed, so it credits overkill in full and flatters exactly the weapons with the biggest
  per-hit numbers. In v6.10 that read the Sewer Geyser as the city's highest-damage weapon (531)
  when it was its lowest (383 effective, 28% wasted) and inverted the ranking of all three natives.
  Diff enemy `hp` across the step instead — `scripts/weapon-census.mjs` does, and documents the
  other trap in the same breath (`run.events` must be drained every step, as main.js does, or the
  backlog is recounted every frame and dps reads ~2800× high).
- **`CHAPTER_ORDER` IS BOOK 1 ONLY. A sweep over "every chapter" that uses it silently skips The
  Blank and the whole of Book 2.** It is `BOOKS.book1.chapters`; `ALL_CHAPTER_IDS` adds the other
  books' ladders but still drops every `hidden` id. The honest denominator for "does every chapter
  satisfy X" is `Object.keys(CHAPTERS)`. This is not theoretical: run RA (roster art) was written
  specifically to guard The Shelf's new roster, shipped green over `CHAPTER_ORDER`, and a mutation
  deleting the copepod's `ROSTER_LOOKS` entry passed it — the test could not see the only chapter it
  existed for. The tell is a count in the PASS line that you have not checked against reality: it
  read "25 roster entries across 7 chapters" when the answer is 35 across 9. Print the denominator
  in every sweep's log line, and assert the set contains the id you are actually working on.
- **`// ponytail:` comments** mark deliberate simplifications with their known ceiling and upgrade path — respect them; don't "fix" a marked shortcut without cause.
- **A PER-CAST COUNT IS USUALLY WRITTEN TWICE — as the loop bound AND as the divisor that spaces
  what the loop spawns.** `for (i < stats.orbs)` with `angle = (i / stats.orbs) * 2pi`,
  `(i - (count - 1) / 2) * STAR_FAN`, `(2 * BOOMERANG_FAN) / (count - 1)`, `i / count` in the quill
  and shriek rings: eight sites across the weapons. Multiply ONE of them and the extra output stacks
  on top of the original instead of spreading — and it **renders identically to no change at all**,
  because three projectiles sharing a point look like one projectile. v7.6.0 shipped Ipecac tripling
  orbit's loop bound to 15 while the divisor still read `stats.orbs` (5): fifteen phages in five
  positions, three deep, which is the "same hit, bigger" shape that whole card was rewritten to
  escape. It was caught by eye, from a screenshot that looked unchanged. Introduce ONE local for the
  count and use it in both places, and assert **distinct positions** rather than a count — a count
  passes happily when things spawn on top of each other (run PB7's every-weapon block does this).
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
- **A new weapon STAT has to be registered twice, and fails silently otherwise.** Adding a key to a
  weapon's `levels[]` is not enough for it to appear on the pause build sheet: `buildReadout`
  (sim.js) only copies keys on its own hardcoded whitelist array, and `STAT_LABEL` (ui.js) supplies
  the row label — miss either and the stat is simply absent, with no warning. Add the French too
  (run XX asserts config coverage, not UI-chrome coverage, so it will not catch a missing label).
  The whitelist is ordered and the sheet caps at `STAT_MAX_ROWS`, so where you insert the key
  decides which stats get dropped.
- **An on/off weapon mod that must be EPIC cannot be `kind: 'switch'`.** `makeWeaponModCard` tests
  `kind === 'switch'` and returns null above normal rarity BEFORE it ever looks at `values`, so a
  switch is a normal-rarity card by construction. Use `values: { epic: 1 }` (the Beam Prism idiom)
  on a non-switch kind, plus `maxPicks: 1`, and write the wording with `descFor` since there is no
  meaningful "+N". `trashTornado.sweepLoot` is the worked example.
- **The camera looks straight down. Every entity bake is drawn from directly overhead.** Buildings
  and props are the ONE exception (they stand upright, deliberately — see `upright` in the district
  tables); creatures, weapons, effects and pickups are all plan views. v6.8 shipped the Trash
  Tornado as a side elevation — a funnel with a mouth at the top and a tip dragging along the
  street — which is a coherent drawing of a tornado and the wrong projection for this game, and it
  took a whole version to undo. A screenshot does not catch this on its own: the v6.8 capture was
  read for "does it look like a tornado" and passed. Ask the second question explicitly — *is this
  the same viewpoint as the sprites around it?* — because the answer is in the same image.
  **The rule is about a FLOOR, and v7.70 established the exception that follows from that.** Owner:
  "it's a top down game but those chapters are in the water so the jellyfish can be sideways." An
  animal hanging in a water column has no floor to lie on, so a side elevation reads as a body at a
  depth rather than as a prop lying down — the tornado failed the mirror-image test, being
  ground-attached and drawn as though it were not. The Shelf's Moon Jelly is therefore the one
  side-on creature in the game, deliberately; do not "fix" it back to plan view. **A side-on body
  costs a matching `lean`, and getting that pair wrong fails silently:** the jelly puts its apex at
  +x and streams everything to -x, which is bilaterally symmetric about the forward axis and so
  earns `lean: 90` (it swims bell-first at you, tentacles behind, using the existing facing code).
  Bell-UP with tentacles hanging down would instead have a distinct UP, i.e. `lean: 30`. Pick the
  wrong one and nothing throws — the body just never turns while its trailing parts point in one
  fixed screen direction. Run RA asserts both halves for the jelly.
- **UI that depicts a game entity uses the game's art, not a lookalike.** render.js already draws every creature (`ROSTER_LOOKS`), every weapon and every prop; if a menu needs to show one, route the real thing out (the `src/cast/*.png` bake is the worked example) rather than reaching for an emoji or a stand-in shape. v6.7.1 shipped 🐜🐝🕷️ per chapter and the tardigrade came out as 🐻 — a bear — while `drawTardigrade` sat in render.js the whole time. Emoji only survive where the glyph *is* the thing (a coin, a lock).
- **Say when something is a stand-in.** If you do ship a placeholder or an approximation, name it as one in the commit and the report. That 🐻 shipped under a code comment calling it "the cheapest honest answer", which read as a considered decision and cost a review round-trip to undo.
- `.gitignore` covers `node_modules/`, `dist/`, `.claude/worktrees/`, `.wrangler/` and `/*.png` — **and no other scratch artifact**. The last one is the trap: only a `.png` at the repo ROOT is ignored. A PNG in a subdirectory is not; neither is a `.json` dump, nor a screenshot in any other format. A 464 KB `_p4.jpg` sat tracked at the repo root for eleven versions for exactly that reason. Delete every scratch file explicitly before committing, and check `git status --short` rather than trusting the ignore rule.
- **`public/` is tracked PWA assets, not scratch** (`sw.js` is registered by `main.js`). Do not "clean up" anything in it. If you need the dev server to serve a probe artifact, put it somewhere you will delete and verify with `git status --short`.
- Deploy is automatic: pushing to `main` triggers `.github/workflows/deploy.yml` (build → GitHub Pages).
- **PLAYER-VISIBLE COPY THAT CONTAINS A NUMBER MUST BE A `tt()` TEMPLATE, and the French coverage
  assert only sees config TABLES.** Two separate traps that landed together in v7.55, where the
  whole elements redesign shipped to the live URL untranslatable and the suite was green:
  - `t()` is keyed by the **exact English source string** (i18n.js — the English IS the key). A
    sentence built with its numbers already in it therefore has a *different key every time the
    value changes*, and no dictionary can ever hold enough of them: every element card and every
    Codex page fell through to English in every language. `tt('…{pct}% over {secs}s…', {pct, secs})`
    is the fix and predates the bug by a year — the key is the TEMPLATE, which is also what lets the
    translation put the numbers where French wants them. Keep a plain-string composer next to it
    (`elText`) for the consumers that need one (a card's own `desc`, the dev-menu filter, tests) so
    the two can never drift. Placeholder parity is asserted across the whole dictionary in run XX;
    a misspelt `{pct}` prints literal braces to the player and reads perfectly in review.
  - run XX's coverage walk enumerates config **tables** (`WEAPONS`, `ELEMENTS`, `ANOMALIES`,
    `WEAPON_MODS`, `ELITE_AFFIXES`, …) reading `name`/`desc`/`title`/`from`. **Copy that lives in a
    function or a bare const is exempt from it by construction** — as `elementCardDesc`,
    `elementCodex` and `ELEMENT_CODEX_INTRO` were. This is the THIRD time that exemption has
    shipped untranslated strings (two City enemies in v6.3, every weapon mod in v6.6.26). When you
    add player-visible strings anywhere, add them to that walk in the same commit and watch it go
    red before you write the French.
- **Editing `src/fr.js` by exact-string match fails on the NBSP.** French values carry U+00A0
  before `: ; ! ?` (`'Nouveau !'`, `'MONTÉE DE NIVEAU !'`, `'achat : 🪙 {n}'`), and it is
  indistinguishable from a space on screen — an anchor that includes one of those lines will not
  match no matter how carefully you copy it. Anchor on a single line with no French punctuation,
  or make the edit with node/python. Same reason a NBSP must never reach a KEY: the key is the
  English source string, so one U+00A0 in it means the lookup can never hit (run XX asserts this).
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
- **A RENAME SWEEP HAS TWO SILENT FAILURE MODES, and only one of them is a test failure.** Renaming
  `sewerGeyser` → `burstHydrant` and `tesseractBeam` → `pulsarSweep` in v7.10 hit both:
  - **Field names also exist as quoted STRINGS**, which an identifier sweep cannot see. `run.geysers`
    was renamed everywhere except `LISTS = [… 'geysers' …]` in test/sim-test.js's every-weapon IPECAC
    block, and the doc block in state.js indexes fields the same way. The suite caught this one, but
    only because that assertion happened to enumerate the array by name.
  - **A DISPLAY-name sweep over-matches user-facing copy.** `leaf blade` → `boomerang leaf` also
    rewrote the boomerang's five mod descriptions, shipping `'boomerang leaf(s) per throw'` — which
    is not English, and which every test passes happily. Nothing catches this but reading it.
  The check that finds both, run after the sweep and before the commit:
  `git diff -U0 src/config.js | grep -E "name: '|desc: '"` — every user-facing string the rename
  touched, in one screen — plus a grep for the OLD token in quotes. Also leave verbatim quotations
  alone: the sweep rewrote a playtest quote (`"leaf blade doesn't look like a leaf"`) into words
  nobody said.
- **A WEAPON'S BEHAVIOUR IS CHAPTER-CONDITIONAL — read the branch its own chapter takes.** Several
  systems fork on `CHAPTERS[id].lane`, and `beyond` is the only lane chapter. So `firePulsar`'s
  `lane ? PULSAR_FAN_ARC : 0` means the full-circle rotating rake — the behaviour its comments
  describe at length, and the one you will describe to the owner if you read the function
  top-to-bottom — **never happens in The Beyond**, the only chapter that offers the weapon: there it
  is a ~112° forward fan wipering left-right-left. (It does run in `blank`, whose pool is all 22
  weapons, which is exactly why "what does this weapon do" has more than one answer.) Before
  describing a mechanic, list the chapters whose pool contains it and check the branch each takes.
  v7.10 got this wrong out loud and was corrected from play.

## Headless sim probes (node against sim.js — no browser)

`sim.js`/`config.js`/`state.js` import cleanly into plain node, which makes "what does this actually
do over a real run" a 30-line script rather than a browser session. `scripts/weapon-census.mjs` and
`scripts/pool-probe.mjs` are the worked examples. Four traps, all of which produced CONFIDENT WRONG
NUMBERS in v7.16 — every one of them fails silently, and three of them were only caught because a
downstream detail looked odd:

- **`createRun(meta, opts)` TAKES AN OPTIONS OBJECT.** `createRun(meta, 'undergrowth', 3)` does not
  throw and does not warn — `opts` is a string, `opts.chapter` is undefined, and you get **body at
  difficulty 1**. A whole session's measurements were quoted as "undergrowth d3" before a roster-id
  breakdown came back `redcell`/`antibody`. Use `createRun(meta, { chapter, difficulty })`, and
  print `run.chapter` in the probe's own header so the output states what it measured.
- **The probe meta must UNLOCK the chapters**, exactly like a seeded save (see the browser section
  below). With `chapters: {}` `ensureChapterMeta` defaults `unlocked` to `id === 'body'` and
  `resolveChapterId` falls back — the same wrong-chapter failure, from a different direction.
- **SEED `Math.random`** (mulberry32, as test/sim-test.js does) and average several runs. Unseeded,
  the same build measured 11 and then 34 contact hits — enough to invent or erase any effect you
  are about to report. Seed per run, use the same seed set on both sides of an A/B.
- **`WAVE_TABLE` GATES ARCHETYPES BY TIME.** `tank` does not spawn until **t=140s** and `wisp` not
  until t=40. A 120s probe therefore cannot see a single tank, so anything about tanks — a roster
  flag, a behaviour, a counter to a strategy — measures as "absent" rather than "absent from this
  window". Run the full 300s when the question involves late-run composition.

**PICK THE RIG FOR THE QUESTION, not just the parameters.** The traps above are all things you can
get wrong in a correct rig; this is the one that makes a correct probe structurally incapable of
seeing the answer, and it costs whole rounds because it returns confident numbers rather than an
error. Three rigs, three different questions:

- **immortal + stationary** (the offer probe): what the pool OFFERS, what a weapon DOES, dps,
  proc rates. `pool-probe.mjs` says in its own header that it is not valid for survival — that
  warning is broader than it looks.
- **immortal + KITING** (walk away from the crowd; a floor on player skill, not a model of one):
  can anything REACH you. Anything about slows, knockback, fear, walls or "I'm invincible" needs
  this. A stationary player is surrounded whatever the crowd's speed, so it reports the same
  180-350 contact hits for every build and hides the effect completely — v7.17 read that as "no
  lock exists" while the lock was on screen in a screenshot.
- **mortal + kiting**: can you SURVIVE. Only this one may be quoted as a win rate.

Match the metric too. For a wall, damage taken is the wrong number — it conflates "nothing reached
me" with "I killed it first". Use the **median distance of the nearest enemy** over the back half of
the run: a crowd sitting at a stable radius is a lock, whatever the damage column says.

And when several effects compose (knockback + slow + fear + fire rate), add them to the REAL build
one at a time. Testing each alone finds nothing and reads as "cannot reproduce" — see the layered
table in the CC_DR_* block of config.js.

To A/B a change, extract the old tree rather than editing back and forth:
`git archive HEAD src | tar -x -C <tmp>`, then point the same probe at each `src` in turn (take a
src path as argv). That also keeps the mutation rule intact — the working tree is never touched.

## Browser probing (headless / backgrounded tabs)

- Background tabs throttle rAF to a crawl: never wait wall-clock for the sim. Drive frames
  explicitly — `let now = performance.now(); for (…) app.ticker.update(now += 50)` — or stop the
  ticker and call `__stepSim` + `__renderer.sync(run, dt, run.events.splice(0))` +
  `app.renderer.render(app.stage)` manually.
- main.js reacts to phase transitions (levelup/dead/victory) ONLY when its own ticker's stepSim
  flips them. Forcing `run.phase` or stepping via `__stepSim` never fires endRun — set the
  preconditions instead (e.g. `run.time = 299.9` while 'playing') and let `ticker.update` cross
  the line.
- Screenshotting short-lived FX: `app.ticker.stop()` first, drive frames manually, render, then
  shoot — the live rAF loop otherwise expires the effect between evaluate and screenshot.
- **Judging a LOOK (an effect, a weapon animation, a telegraph): use `scripts/fx-probe.mjs`.** It
  boots once, seeds a save, pins the RNG, composes a scene from `scripts/scenes/<name>.js`, and
  captures a frame sequence — `node scripts/fx-probe.mjs --scene scripts/scenes/beam-prism.js
  --out /tmp/pr --frames 14`. Write a new scene file per effect; `beam-prism.js` is the worked
  example and documents the `H` helper surface (`weapon`/`breed`/`keep`/`place`/`pin`/`scrub`).
  Stack the frames with `ffmpeg` into a labelled contact sheet or GIF. The three traps it exists to
  bake out, which cost real rounds in v6.7.7 and will again if you hand-roll a probe:
  - **One `initScript` seeding of `Math.random` does NOT give you the same frame twice.** The
    ticker runs free between boot and whenever the probe gets control, and each rendered frame
    burns randoms (dust motes, particles), so how many depends on machine load — every variant
    lands on a different tile with a different crowd. Pin it in the initScript AND **again right
    after `app.ticker.stop()`**. Even then only the SCENE is reproducible, not the pixels (animT
    drives the beam pulse and floor dust): compare by eye, never by md5.
  - **Don't re-boot per frame** (~16s each). Stop the ticker, compose once, then rewind the
    effect's own life field (`s.life = full * (1 - age)`) and re-render between captures. A burst
    or a fade cannot be judged from a still.
  - **A scene that throws renders nothing, which looks exactly like "the effect is invisible".**
    Paint the caught exception into the page so the screenshot carries it, and read that before
    re-shooting anything.
- **ANYTHING THAT READS THE VIEWPORT IS NOT VERIFIED UNTIL IT HAS BEEN SHOT AT TWO VIEWPORTS.**
  `fx-probe.mjs` defaults to a 390x844 phone; pass `--w 1280 --h 800` for the second. The phone's
  half-diagonal is 465px and the desktop's is 755px, so any quantity compared against the screen —
  a radius, a cull margin, a vignette, an early-out — can be a different mechanic on each, and the
  one you shot will look correct. v7.58 shipped a full-bar early-out for The Shelf's dark with a
  config comment calling it a considered decision; it was measured on the phone alone, where it is
  right, and on a desktop the same code left the corners vignetted at a full bar. It came back as a
  bug report within the hour (v7.60 fixed it by stating the light in screen half-diagonals). Assert
  the RATIO in the suite, never px: px passes at exactly one screen size, which is how it shipped.
- Enemies that render as white silhouettes are `hitFlash`, not a bug — a pinned cast being struck
  every frame never stops flashing. Clear it, or you cannot judge an effect against the sprites it
  sits over. Same class of trap: a final `sync` handed the whole warm-up's `run.events` buries the
  frame in damage numbers, so drain events every step.
- **A/B-ing a BAKE (an entity's texture, not its motion): put every candidate behind a throwaway
  query param** — `const V = Number(new URLSearchParams(location.search).get('tv') || 0)` at
  render.js module scope, one bake per value, then `--url 'http://127.0.0.1:PORT/?tv=N'` per shot
  (fx-probe appends its own `&debug`). One edit and N probe runs, instead of editing render.js
  between every shot and hoping the frame came back the same. Bakes happen once at boot, so the
  param has to be read at module scope, not per frame. Delete the switch and the losing bakes with
  the pick — grep the param name to prove it is gone before committing.
- A probe that runs thousands of `__stepSim` calls synchronously BLOCKS the main thread, and a
  screenshot taken during that block is plain white. That is not a blank-page bug — confirm which
  one you have by shooting the same URL with no seed script at all before reporting a prod outage.
- `vite preview` snapshots the dist file list at startup (always restart it AFTER `npm run
  build`) and serves at `/`, not the Pages subpath. Stale preview servers from other sessions
  squat ports — pick a fresh one (`--port N --strictPort`) rather than killing unattributed pids.
- Seeding a save: use a DevTools navigate `initScript` (runs on the fresh document before app
  boot). NOT `localStorage.setItem` + `location.reload()` from inside an evaluate — the reload
  silently does not take, and you are left probing the pre-seed app while localStorage shows the
  right bytes. (This repo has no unload handler; `state.js` says so explicitly. If a seed looks
  ignored, suspect the reload or the save shape, not a clobber.) Open tabs share localStorage —
  use isolated browser contexts or close extras first.
- **A seeded save MUST carry `shop: {}`.** `loadMeta` does `m.shop[id] = …` inside its own
  try/catch, so a save without it throws and falls back to a FRESH meta with no warning — the
  symptom is a title screen at difficulty 1 in English while localStorage holds your seed. Same
  trap for any field the loader writes into rather than reads: read `loadMeta` before hand-building
  its input. A working seed is `{schema:1, coins, runs, lang, chapter, shop:{}, best:{}, chapters:{…}}`.
- Judging layout at 320px: the devtools window will not resize below ~500px, and `resize_page`
  fails SILENTLY (it reports success; `innerWidth` still reads 500). Always read `innerWidth` back
  before trusting a width. To actually test the phone width, inject a style constraining the
  screen + `.modal` to 320/294px — `.modal` is `min(92vw, 390px)`, so the viewport alone will not
  do it — and measure there.
- `scripts/deploy-watch.sh "vX.Y.Z · <sha>" ["more strings" …]` watches the Pages deploy to
  completion, then greps the LIVE bundle for each string — the standard post-push gate. **Only
  pass strings that survive minification**: user-visible copy, config text, French translations,
  anything that is a string LITERAL in the source. Never an identifier — esbuild renames locals and
  private functions, so grepping a variable name reports `0` and proves nothing (v6.7.7 asked it
  for `prismBodyG`). A change with no new string literals cannot be gated this way at all; verify
  it by shooting the built bundle instead (`npm run build`, `vite preview`, `scripts/fx-probe.mjs`).

### When there is no MCP browser tab

The chrome-devtools MCP profile is single-instance: another Claude session (or a stale one) holding
it makes every tool call fail with *"browser is already running"*, and claude-in-chrome needs the
extension connected. Both can be unavailable at once. Fallbacks, in order:

- **Pure DOM/CSS work on ui.js needs no browser boot at all.** Write a throwaway `harness.html` at
  the repo root that imports `ui.js` + `state.js` + `config.js`, hand-builds a `meta`, stubs every
  hook with `() => {}`, and calls `initUI` — optionally `ui.showScreen('brief'|'shop'|…)`. ui.js is
  Pixi-free by contract, so it renders instantly, in any headless mode, with no WebGL. This is the
  fast path for title/shop/summary layout; delete the file before committing.
- **Anything needing the real app** (the Pixi canvas, `window.__renderer`, a real run):
  `node scripts/shot.mjs <url> <out.png> [waitMs] [w] [h] [seed.js]`. Its header documents why it
  exists; the three traps it exists to avoid are worth knowing on their own:
  - `google-chrome --headless=new --screenshot` / `--dump-dom` report `innerWidth` as **0** here.
    The page still paints at some unrelated size and gets tiled into the file, so captures show
    clipped badges and overflowing cards that do not exist. **Do not debug layout from them** — one
    session lost several rounds "fixing" CSS against these. `--headless=old` would honour
    `--window-size`, but it has been removed from the Chrome binary. Use `chrome-headless-shell`
    (puppeteer's cache, `~/.cache/puppeteer/chrome-headless-shell/*/`), which still behaves.
  - `--virtual-time-budget` fires the capture when VIRTUAL time expires, which is unrelated to Pixi
    finishing its async boot — the app screenshots blank. Drive CDP and sleep on the wall clock.
  - If you must hand-roll CDP: node >= 22 has a global `WebSocket`, so no dependency is needed, and
    `Page.addScriptToEvaluateOnNewDocument` is the CDP form of the initScript seeding rule above.

## Design docs

`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the v1 design, the chapters design, and the chapters implementation plan — useful background for why systems are shaped the way they are.
