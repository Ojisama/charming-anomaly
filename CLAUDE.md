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
```

There is no single-test runner and no test framework: `test/sim-test.js` is one plain-node file of `assert`-based scenarios that seeds `Math.random` (mulberry32) for determinism and prints `PASS …` / `ALL TESTS PASSED`. To run a subset, comment out scenarios or temporarily guard them — do not reach for jest/vitest. To add a check, append a scenario in the same style. **Only `sim.js` (+ its `config.js`/`state.js` deps) is testable this way** — it's the only module free of Pixi/DOM.

## Module architecture — the boundaries are the design

Every module has a hard rule about what it may touch. These rules are what make the sim headless-testable and the renderer swappable; **do not cross them.**

| File | Role | May NOT touch |
|------|------|---------------|
| `config.js` (1.9k lines) | All balance numbers + `CHAPTERS`/`WEAPONS`/`WEAPON_MODS`/`ELEMENTS`/`MUTATORS` tables. Treated as **read-only ground truth** by every other module. | — (pure data + pure helper fns) |
| `state.js` | `run` shape (`createRun`) + persistent save (`loadMeta`/`saveMeta`, `localStorage`) + save migrations. | Pixi, DOM (localStorage only) |
| `sim.js` (4k lines) | **Pure simulation.** `stepSim(run, input, dt)` advances the world and pushes to `run.events`. | Pixi, DOM, localStorage — nothing but `run` + `config` |
| `render.js` (5.3k lines) | PixiJS renderer. Reads `run`, **never mutates it**. Bakes entity looks into textures once; per-frame work is sprite pools. | writing to `run` |
| `ui.js` | DOM overlay (`#ui`): title, shop, HUD, level-up, pause, summary screens. | Pixi |
| `input.js` | Floating touch joystick + WASD/arrows → normalized move vector. | — |
| `audio.js` | Procedural WebAudio SFX (no audio assets — every sound is synthesized). | — |
| `main.js` | **Glue only.** Boots Pixi, owns the ticker + phase transitions, wires UI hooks. Keep logic out of here. | game logic |

### The frame loop (main.js)

`app.ticker` each frame: `stepSim(run, getInput(), dt)` → drain `run.events` into a fresh array → `renderer.sync(run, dt, events)` → map events to SFX → `ui.updateHUD` → react to phase change (`levelup`/`dead`/`victory`). `dt` is clamped to 0.05s. When paused/modal, `renderer.sync(run, 0, [])` draws a frozen world.

### The event contract

`sim.js` never calls render or audio directly. It **pushes event objects** (`{type:'hit'|'kill'|'shoot'|'explode'|'levelup'|…}`) onto `run.events`; `main.js` drains them once per frame and fans them out to the renderer (visual bursts) and `SFX_FOR_EVENT` (audio). Adding a new visible/audible effect = emit an event in sim, then handle it in render.js and the `SFX_FOR_EVENT` map. **The authoritative list of every event shape and every `run.*` field lives in the giant doc block at the top of `state.js` (lines ~150-530)** — read it before adding entities or events; keep it in sync when you change the `run` shape.

### The chapter system (v5.0+)

`CHAPTERS[id]` (config.js, ordered by `CHAPTER_ORDER`) defines each biome: its `weapons` pool (scopes the level-up weapon offers), `starter` weapon, enemy `roster` (mapped to base archetypes `normal`/`fast`/`tank` via `hpMul`/`speedMul`/behavior `flags`), `eliteFlags`, a `signature` mechanic (e.g. `currents`, `pheromones`, `predators`, `gravity`, `traffic`), `obstacles`, and a **render-only** `render` block (tints/bg, zero sim effect). Enemy behavior flags (`latch`, `split`, `dashBurst`, `diveBomb`, `pounce`, `missileVolley`, …) are chapter-agnostic strings that sim.js reads — the flag vocabulary is documented inline in `state.js`'s doc block and each flag's tuning block in config.js.

Chapters unlock progressively (win at difficulty 3+ unlocks the next); each has its own difficulty ladder in `meta.chapters[id]`. `ensureChapterMeta` (state.js) repairs/creates per-chapter save entries on every load, so a save predating a newly-shipped chapter always resolves cleanly. **When adding a chapter, add it to `CHAPTER_ORDER` + `CHAPTERS`** and the migration/unlock logic handles the rest.

## Non-obvious constraints (breaking these produces a blank page in prod)

- **No top-level `await` in `main.js`.** Suspending module evaluation deadlocks Pixi v8's dynamically-imported environment code in the production bundle (hangs on a blank page). `boot()` is a plain async fn called at the bottom.
- **`vite.config.js` sets `inlineDynamicImports: true`.** Pixi v8 auto-detects its environment via dynamic import; as a split chunk it never loads in prod. Don't remove this.
- **Asset globs use `import.meta.glob('./props/*.png', { eager: true, query: '?url' })`** in render.js — resolves to URL strings at build time, no runtime dynamic-import graph (required by the constraints above). Add art to `src/props/` (foliage) or `src/fx/` (Kenney particle PNGs, tinted per-use); they're auto-discovered.
- **`base: './'`** in vite config — the game ships to a GitHub Pages subpath, so all asset paths must stay relative.

## Conventions

- **Versioned commits.** Each release is a commit subject `vX.Y.Z: <what changed and why, in one plain sentence>` (e.g. `v5.6.16: roar and tail swipe are visible — their events were silently dropped`). Chores use `chore: …`. Follow this format.
- **`// ponytail:` comments** mark deliberate simplifications with their known ceiling and upgrade path — respect them; don't "fix" a marked shortcut without cause.
- Balance changes go in `config.js` and nowhere else. If you're typing a magic number into sim.js, it belongs in config.js as a named export.
- `.gitignore` excludes `/*.png` at the repo root — browser-verification screenshots land there and must never be committed.
- Deploy is automatic: pushing to `main` triggers `.github/workflows/deploy.yml` (build → GitHub Pages).

## Design docs

`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the v1 design, the chapters design, and the chapters implementation plan — useful background for why systems are shaped the way they are.
