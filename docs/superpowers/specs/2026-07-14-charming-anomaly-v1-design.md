# Charming Anomaly — v1 Design

A mobile-first vampire-survivors-like rogue-lite. You are **Mochi**, a cute anomaly
escaped from a research lab, swarmed by security drones. Survive 5 minutes.

Decisions made with the user on 2026-07-14 (style picked from a live gallery):

| Decision | Choice |
|---|---|
| Theme | Charming Anomaly (cute escapee vs. lab drones) |
| Art style | "B1 — Cute Lab Pastel": kawaii squash-and-stretch blobs, cream lab tiles, soft shadows |
| Run length | ~5 min hyper runs, victory at 5:00 |
| Tech | Vite + PixiJS v8, plain JS, DOM overlay UI |
| Mobile | Floating virtual joystick (WASD on desktop), PWA on GitHub Pages |
| Scope | Minimal playable first; heavy meta roadmap after |

## Core loop

Joystick move → weapons auto-fire → kill escalating hordes → XP gems → level-up
(pick 1 of 3 upgrades) → coins drop and persist → die (run summary) or reach 5:00 (victory).

## v1 content

- **Character**: Mochi (mint blob). Base: 100 HP, 220 px/s, 5% crit ×1.5.
- **Weapons** (Lv1→5): Star Shooter (aimed projectiles), Orbit Sparks (orbiting orbs),
  Slime Wave (AoE nova). Start with Star Shooter; others join the level-up pool.
- **In-run passives**: Move Speed, Magnet, Max HP, Fire Rate.
- **Enemies**: Drone (chaser), Wisp (fast/frail), Tank (slow/beefy) + elite variants
  (5× HP, bigger, coin burst). HP scales with run time.
- **Meta shop** (permanent, localStorage coins): Damage, Fire Rate, Crit Chance,
  Crit Damage, Max HP, Move Speed, Magnet, Coin Gain — scaling costs. This is the
  RPG progression the user asked for.
- **Juice**: squash/stretch, hit flash, particles, damage numbers, screen shake,
  procedural WebAudio SFX (no audio assets).

## Architecture

Three cleanly-seamed modules so subagents can build in parallel:

- `src/sim.js` — pure simulation, no Pixi/DOM. `stepSim(run, input, dt)` mutates the
  run state and pushes events (`hit`, `kill`, `levelup`, …) consumed each frame.
- `src/render.js` — PixiJS draws the sim state: world camera, cute programmatic
  sprites, particles, shake. Reads state, never mutates it.
- `src/ui.js` + `styles.css` + `input.js` + `audio.js` — DOM overlay: title, shop,
  HUD, level-up modal, pause, summary; joystick; SFX.
- Ground truth shared by all: `src/state.js` (state shape, meta save/load) and
  `src/config.js` (all balance numbers), written first.
- `src/main.js` — glue: boot Pixi, tick loop, phase transitions.

World is unbounded; camera follows player; enemies spawn on a ring outside the view.

## Roadmap (post-v1, already requested)

More characters, unlockable weapons, castable spells, true familiars, a boss at 5:00,
weapon evolutions.

## Distribution

PWA (manifest + minimal service worker), auto-deployed to GitHub Pages via
GitHub Actions from `main` on a public repo.
