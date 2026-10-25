# The Ophan rev 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** open arena, a chasing boss, attacks 1.5x faster, the sword's reach x4, monster waves around three boss phases, and the boss art baked during the waves.

**Architecture:**
- sim.js owns the timeline (wave / boss / leave), the boss's movement and the attack clock.
- config.js owns every number.
- render.js's follow camera replaces ophanView's fixed one.
- The seven Ophan stages become world-anchored, infinitely tiling floors.
- The renderer's warm-up queue drains at a per-frame budget during the waves.

**Tech Stack:** vanilla JS, PixiJS v8, plain-node `assert` suite (test/sim-test.js).

**Spec:** docs/superpowers/specs/2026-10-25-ophan-open-arena-design.md (owner rulings R1-R7 binding), on top of docs/superpowers/specs/2026-10-24-the-ophan-final-boss-design.md.

## Global Constraints

- No `any` type, no eslint-disable, no attribution lines in commits.
- `// balance_decision : <10 words> <date>` one-liners only.
- Balance numbers live in config.js.
- sim.js stays pure.
- render.js and src/ophan never write to `run`.
- Every new `run.*` field goes in state.js's doc block.
- Every new event gets a render/SFX consumer or a SILENT_BY_DESIGN line (run EV).
- Player-visible strings go in config tables, with French.
- Mutation-prove every new scenario. Run `npm test` green before each commit.
- Never use adb (the controller runs the phone).
- Commit only your own paths (`git add <paths>`). Another implementer may be committing in the same worktree.

## Review Focus

1. **A boss that is absent during a wave** must not be read by anything that assumes it exists: hand swaps, attacks, the gauge's boss dot, `ophanDmgMul`, the bot.
2. **The world press during a wave** must work, with no boss mismatch immunity to compute.
3. **Leave while an attack is mid-swing:** the attack and its hit geometry must end cleanly. A tornado or laser must not stay live with no boss.
4. **The camera follows into a far corner** of a world floor: no seam, no gap, and no unbaked chunk mid-fight.
5. **The sketch rising** after the last skin breaks must happen wherever the boss stands, not at the old origin.

---

### Task 1: sim, the open fight

**Files:**
- Modify: src/config.js (the OPHAN_* block ~10170-10235)
- Modify: src/sim.js (stepOphanScript ~1740-1990)
- Modify: src/ophan/rig.js (the sword's LB ~350)
- Modify: src/state.js (doc block)
- Modify: render.js only where ophanView's camera is read (~15789, ~33326)
- Test: test/sim-test.js

**Changes:**
- **R1:** remove the player clamp and the fixed camera (camX/camY follow the player; keep z). The crowd spawns on the normal off-screen ring around the player.
- **R2:** delete ophanPin.
  - The boss steers toward the player at `OPHAN_BOSS_SPEED` until within `OPHAN_BOSS_HOLD`, which is derived from its attacks' reach. It backs off if the player is inside its body. It is anchored for the whole of an attack.
- **R3:** `OPHAN_ATK_SPEED = 1.5` at the single progress line. Cooldowns untouched.
- **R4:** `OPHAN_SWORD_REACH` in config replaces rig.js LB. The impact distance is 4x v9's (v9: .5 + 1.8 = 2.3 R), and the fire line scales with it.
- **R5:** the script stages are `open` (30 s), `p1`, `wave` (15 s), `p2`, `wave` (15 s), `p3`, then the sketch, as in the spec table.
  - Leaving is a silent removal with skin hp kept and `run.bossBar = null`.
  - Entry spawns the boss near the player, outside the screen's centre third.
  - The events are `ophanLeave` and `ophanEnter`, each with a render consumer or SILENT_BY_DESIGN.
  - Wave spawning uses the existing crowd machinery at `OPHAN_WAVE[difficulty]` rates.

**Tests:** assert effects, as listed in the spec's "Measures of done".

**Commit:** `feat(ophan): an open arena, a chasing boss and monster waves between its phases`

### Task 2: render, the floors follow the camera

**Files:** src/ophan/stages/*.js, src/ophan/renderer.js, render.js (the leave/enter tell)

**Changes:**
- Each stage becomes a world-anchored floor that tiles infinitely under the follow camera. Its look must stay identical (the drift gate).
- The boss's sink/rise tell for ophanLeave and ophanEnter.
- The chunked floors (Magma, Mantle) bake ahead of the camera's direction with no in-fight bake hitch.

**Verify:**
- shoot frames at 390x844 and 1280x800 with the player walked far from the origin, in every world;
- the drift gate;
- the desktop 4x frame probe.

**Commit:** `feat(ophan): the six worlds' floors scroll under the camera`

### Task 3: bake during the waves (R6)

**Files:** src/ophan/renderer.js, render.js prewarm wiring, ui.js's brief loading bar

**Changes:**
- Level start waits only for what the opening wave needs.
- The warm-up queue drains at `OPHAN_BG_BAKE_MS` per frame during waves, in boss-entry order.
- If the queue is not drained by the boss's entry, the boss's entry waits behind a short tell. It never bakes under a frame.

**Verify:** the controller runs the S25 load and the full-fight probe.

**Commit:** `perf(ophan): the boss's art bakes while the waves are fought`

### Task 4: the bot and the numbers

**Files:** scripts/ophan-bot.js, scripts/ophan-probe.mjs, config.js (OPHAN_BOSS_SPEED, OPHAN_BOSS_HOLD, OPHAN_WAVE)

**Changes:**
- The bot kites and dodges in open space, and switches worlds as before.
- Tune with 18 seeds per difficulty so that d1-d3 are winnable with the v9 targets (crowd share, level-ups per minute).
- Quote every seed.

**Commit:** `fix(ophan): measured numbers for the open fight`
