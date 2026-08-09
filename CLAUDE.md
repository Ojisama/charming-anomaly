# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Charming Anomaly** — a browser survivors-like (Vampire Survivors genre) built with vanilla JS + PixiJS v8, bundled by Vite, shipped as a PWA to GitHub Pages. No framework, no TypeScript, no state library. One `run` object holds all game state; a handful of strictly-scoped modules read and mutate it.

## Commands

```bash
npm run dev        # vite dev server (host:true — reachable from phone on the LAN for touch testing)
npm run build      # vite build -> dist/
npm run preview    # serve the built dist/
npm test           # node test/sim-test.js — headless sim self-check, no framework
node scripts/obstacle-contrast.mjs   # WCAG contrast audit of obstacle footprints per biome
node scripts/bake-cast.mjs           # re-bake src/cast/*.png (title cards' creature thumbnails)
node scripts/shot.mjs <url> <out.png> [waitMs] [w] [h] [seed.js]   # phone-viewport screenshot without the MCP tab
node scripts/fx-probe.mjs --scene scripts/scenes/beam-prism.js --out /tmp/pr --frames 14
                                     # reproducible in-game frames of ONE effect, for A/B-ing a look
node scripts/prop-scale.mjs          # PROP_SCALE ladder audit + render.js bare-`scale:` regression grep
node scripts/weapon-census.mjs       # what a weapon actually DOES over real runs, headless
                                     #   --chapter city --level 5 --weapons sewerGeyser --mods launch=1
                                     # raw vs EFFECTIVE dps, overkill waste, kills/min, hits/s, and a
                                     # per-zone breakdown for run.geysers weapons. Run it before
                                     # answering "is this weapon weak?" — this repo has guessed at
                                     # that twice and been wrong both times.

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

Corollary worth stating, because it is easy to run `npm test` as a ritual: **`scripts/` and `docs/` are not in that import graph.** A harness-only or spec-only diff gets zero coverage from the suite — it will pass whatever you did. The real check for a `scripts/*.mjs` change is running the script; `git status --short` is what tells you whether you strayed into `src/`.

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

### The chapter system (v5.0+)

`CHAPTERS[id]` (config.js, ordered by `CHAPTER_ORDER`) defines each biome: its `weapons` pool (scopes the level-up weapon offers), `starter` weapon, enemy `roster` (mapped to base archetypes `normal`/`fast`/`tank` via `hpMul`/`speedMul`/behavior `flags`), `eliteFlags`, a `signature` mechanic (e.g. `currents`, `pheromones`, `predators`, `gravity`, `traffic`), `obstacles`, and a **render-only** `render` block (tints/bg, zero sim effect). Enemy behavior flags (`latch`, `split`, `dashBurst`, `diveBomb`, `pounce`, `missileVolley`, …) are chapter-agnostic strings that sim.js reads — the flag vocabulary is documented inline in `state.js`'s doc block and each flag's tuning block in config.js.

Chapters unlock progressively (win at difficulty 3+ unlocks the next); each has its own difficulty ladder in `meta.chapters[id]`. `ensureChapterMeta` (state.js) repairs/creates per-chapter save entries on every load, so a save predating a newly-shipped chapter always resolves cleanly. **When adding a chapter, add it to `CHAPTER_ORDER` + `CHAPTERS`** and the migration/unlock logic handles the rest.

## Non-obvious constraints (breaking these produces a blank page in prod)

- **No top-level `await` in `main.js`.** Suspending module evaluation deadlocks Pixi v8's dynamically-imported environment code in the production bundle (hangs on a blank page). `boot()` is a plain async fn, *called* near the top of `main.js` and *declared* just below it — hoisting makes that legal, and the point is that nothing awaits at module scope.
- **`vite.config.js` sets `inlineDynamicImports: true`.** Pixi v8 auto-detects its environment via dynamic import; as a split chunk it never loads in prod. Don't remove this.
- **Asset globs use `import.meta.glob('./props/*.png', { eager: true, query: '?url', import: 'default' })`** in render.js — resolves to URL strings at build time, no runtime dynamic-import graph (required by the constraints above). Add art to `src/props/` (foliage) or `src/fx/` (Kenney particle PNGs, tinted per-use); they're auto-discovered. `src/cast/*.png` (ui.js) is the same idiom, but those files are **generated**, not authored — `node scripts/bake-cast.mjs` re-bakes them from render.js's own creature textures. Nothing warns you if they go stale.
- **`base: './'`** in vite config — the game ships to a GitHub Pages subpath, so all asset paths must stay relative.

## Conventions

- **Versioned commits.** Each release is a commit subject `vX.Y.Z: <what changed and why, in one plain sentence>` (e.g. `v5.6.16: roar and tail swipe are visible — their events were silently dropped`). Chores use `chore: …`. Follow this format.
- **WHATEVER IS AT HEAD WHEN YOU PUSH TO `main` MUST CARRY A `vX.Y.Z:` SUBJECT.** `buildStamp()` in `vite.config.js` regexes the version out of `git log -1 --pretty=%s` and falls back to the literal string `dev`, so a `chore:` commit at HEAD — *or a merge commit* — stamps the live page `dev` and destroys the one thing the stamp exists to answer ("is the code in front of me the code that was pushed?"). v6.10.1 shipped to fix the chore form; the **merge** form bit again on 2026-08-09, when merging a long-lived branch put `Merge remote-tracking branch…` at HEAD. Land the merge, then put a release commit on top of it. Verify after every deploy with `scripts/deploy-watch.sh "vX.Y.Z · <sha>"`.
- **On a long-lived branch, `git fetch` and read `git log origin/main -1` BEFORE choosing a release number.** `main` moves. A branch that picked `v6.7.6`/`v6.7.7` offline while `main` shipped different changes under those same two labels leaves a permanent duplicate in the history — unfixable afterwards without rewriting published commits. (That is exactly what happened on 2026-08-09.)
- **The release commit must be HEAD when you build and push.** `vite.config.js` derives
  `__BUILD_STAMP__` from `git log -1 --pretty=%s` at BUILD time and regexes a leading `vX.Y.Z` out
  of it — so a `chore:` commit sitting on top of the release ships a page stamped `dev · <sha>`,
  and `scripts/deploy-watch.sh "vX.Y.Z · <sha>"` then reports 0 for a deploy that actually
  succeeded. Land WIP chores first and put the `vX.Y.Z:` commit last (squashing the chores into it
  is fine — the never-squash rule is about not merging two *releases* into one).
  **This applies to docs-only commits too, and it bit the session that wrote this rule down, one
  command after writing it:** a `chore:` touching only CLAUDE.md was pushed to main on top of
  v6.10.0, the workflow rebuilt (it runs on every push to main, path-independent), and the live
  page went from `v6.10.0 · 969a0e8` to `dev · 4f17cad`. Push docs-only commits to your BRANCH, or
  accept that the next thing you land on main has to be a `vX.Y.Z:` commit to restore the stamp.
- **Measuring damage from `hit` events over-reports.** `{type:'hit', dmg}` carries the RAW swing,
  not HP removed, so it credits overkill in full and flatters exactly the weapons with the biggest
  per-hit numbers. In v6.10 that read the Sewer Geyser as the city's highest-damage weapon (531)
  when it was its lowest (383 effective, 28% wasted) and inverted the ranking of all three natives.
  Diff enemy `hp` across the step instead — `scripts/weapon-census.mjs` does, and documents the
  other trap in the same breath (`run.events` must be drained every step, as main.js does, or the
  backlog is recounted every frame and dps reads ~2800× high).
- **`// ponytail:` comments** mark deliberate simplifications with their known ceiling and upgrade path — respect them; don't "fix" a marked shortcut without cause.
- Balance changes go in `config.js` and nowhere else. If you're typing a magic number into sim.js, it belongs in config.js as a named export.
- **A red `sim-test` band is not proof your change caused it — several bands are eyeballed literals
  under 3σ.** The suite seeds `Math.random` once per scenario, so ANY change that alters how many
  randoms get drawn re-phases the whole stream and re-rolls every sampled statistic. Two bands were
  measured sitting at 2.6–2.8σ: the anomaly slot-uniformity check (±0.06 on ~400 anomaly pools,
  where 1σ = 2.2pts) and `mod > 24` in the partial-arsenal fixtures. v7.6 moved five bucket weights
  and drew a false red on the first — slot 2 of 4 at 31.6% — for a placement that is
  `Math.floor(random * cards.length)` and cannot read `BUCKET_WEIGHTS` at all. **Protocol:** before
  attributing a red to your diff, ask whether the assertion's subject is even reachable from what
  you changed, then re-run with a different seed. If it goes green, the band is under-powered — fix
  it with a power calculation (state N, 1σ, and the size of the pathology it must still catch), and
  mutation-prove the widened band still fails on that pathology. Do NOT retune your change to
  satisfy a noisy test.
- **Mutate a scratch copy, never the working tree.** Mutation-proofing an assertion means editing
  `sim.js`, and `git checkout src/sim.js` to undo it silently discards any real edit you already had
  in that file (v7.6 lost a comment fix this way and only caught it from `git status`). Either
  extract a throwaway tree (`git archive <ref> | tar -x -C <tmp>`) and mutate there, or re-read
  `git status --short` after every revert.
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
- **UI that depicts a game entity uses the game's art, not a lookalike.** render.js already draws every creature (`ROSTER_LOOKS`), every weapon and every prop; if a menu needs to show one, route the real thing out (the `src/cast/*.png` bake is the worked example) rather than reaching for an emoji or a stand-in shape. v6.7.1 shipped 🐜🐝🕷️ per chapter and the tardigrade came out as 🐻 — a bear — while `drawTardigrade` sat in render.js the whole time. Emoji only survive where the glyph *is* the thing (a coin, a lock).
- **Say when something is a stand-in.** If you do ship a placeholder or an approximation, name it as one in the commit and the report. That 🐻 shipped under a code comment calling it "the cheapest honest answer", which read as a considered decision and cost a review round-trip to undo.
- `.gitignore` covers `node_modules/`, `dist/`, `.claude/worktrees/`, `.wrangler/` and `/*.png` — **and no other scratch artifact**. The last one is the trap: only a `.png` at the repo ROOT is ignored. A PNG in a subdirectory is not; neither is a `.json` dump, nor a screenshot in any other format. A 464 KB `_p4.jpg` sat tracked at the repo root for eleven versions for exactly that reason. Delete every scratch file explicitly before committing, and check `git status --short` rather than trusting the ignore rule.
- **`public/` is tracked PWA assets, not scratch** (`sw.js` is registered by `main.js`). Do not "clean up" anything in it. If you need the dev server to serve a probe artifact, put it somewhere you will delete and verify with `git status --short`.
- Deploy is automatic: pushing to `main` triggers `.github/workflows/deploy.yml` (build → GitHub Pages).
- **Editing `src/fr.js` by exact-string match fails on the NBSP.** French values carry U+00A0
  before `: ; ! ?` (`'Nouveau !'`, `'MONTÉE DE NIVEAU !'`, `'achat : 🪙 {n}'`), and it is
  indistinguishable from a space on screen — an anchor that includes one of those lines will not
  match no matter how carefully you copy it. Anchor on a single line with no French punctuation,
  or make the edit with node/python. Same reason a NBSP must never reach a KEY: the key is the
  English source string, so one U+00A0 in it means the lookup can never hit (run XX asserts this).

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
