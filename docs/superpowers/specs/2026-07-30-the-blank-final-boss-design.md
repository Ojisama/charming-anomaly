# The Blank — hidden final boss chapter (design)

Approved in-session 2026-07-30. A hidden eighth chapter, unlocked by winning a classic run of The
Beyond at difficulty 5. Not a survival run: a scripted boss level — waves, then a three-phase boss,
waves between phases. Victory = kill phase 3. The game's first kill-to-win condition.

## Identity

- id `blank`, name **The Blank**, tagline *"deletion in progress"*, icon ⬜.
- The Construct (Matrix) white void: warm-white background, near-white floor, **no obstacles, no
  terrain**. The player's luminous violet blob and its projectiles are the only saturated color.
- The boss is **the Antibody** — reality's immune response, come to delete the anomaly. Real
  antibodies are Y-shaped: its silhouette is a huge, slowly rotating pale tri-lobed form, edged in
  faint gray so it reads on white.
- Chapter 1 you were an infection inside a body; in the finale, reality treats YOU as the disease.

## The coherent spine: it learns you

One idea deepening across three phases — past → present → future. Each phase has a readable
counterplay that the previous phase deliberately mis-trained.

- **P1 — reads your past.** The sim keeps a ring buffer of recent player positions. Periodically
  the boss "reads": recent trail points telegraph as swelling white rings, then detonate in
  sequence oldest→newest, chasing you along your own path. A straight-line runner gets caught; a
  turner escapes. Probe minions rush where you were ~1s ago. Counterplay: keep moving, keep turning.
- **P2 — holds your present.** It extrudes 2–3 killable **binding nodes** near you; each opens a
  white filament to the player that applies a stacking slow while alive. If nodes survive too
  long, a hard yank drags the player toward the boss. The boss's direct shots are only dangerous
  because you're slowed. Counterplay: target-switching discipline — break the nodes, don't tunnel
  the boss.
- **P3 — takes your future.** It pre-fires **erasure bands** at the player's extrapolated position
  (pos + vel × lead): white flash telegraph, then the band goes blank — lethal to touch for a few
  seconds, briefly carving the arena. Below ~25% HP its reads accelerate (desperation).
  Counterplay inverts P1: feint, break your own patterns, dodge into just-expired blanks.

Each boss phase also drip-recruits a few of that phase's minion type, so AoE builds and the XP
economy never fully starve during the duel.

## Structure — the script

Six stages, declarative table in config.js: waves → boss P1 → waves → boss P2 → waves → boss P3.

- Continuous spawning, formations, elites, obstacles, random anomalies and the 300s victory timer
  are ALL off in this chapter. One new sim step (`stepBossScript`) is the only spawner.
- A wave block = 3 discrete waves spawned as ring bursts. Next wave on **clear OR timeout**
  (hybrid; leftovers linger and stack pressure). Boss phases end **only on kill** — no timer
  victory exists. Killing phase 3 IS the win.
- Each boss phase is a separate `run.enemies` entry (every weapon/element/mod hits it with zero
  new plumbing), knockback-immune, holding a mid-range distance band rather than chasing. Death of
  a phase entity triggers a "reform" — same silhouette reassembling angrier — so it plays as one
  monster. No segmented HP bars, no invulnerability windows.

## The waves — the same organism

Each block previews the mechanic the next boss phase weaponizes:

- **Probes** (fast archetype): rush the player's past position, fragile. Before P1.
- **Binders** (normal): latch and slow on contact. Before P2.
- **Erasers** (tank): slow, leave white no-go residue trails. Before P3; final wave biggest, mixed.

All-new roster ids in the boss's white visual language. No elites in this chapter.

## Difficulty — 3 rungs, named boss modifiers

The chapter's ladder caps at 3 (per-chapter override of MAX_DIFFICULTY). No random anomalies;
instead cumulative named modifiers shown where the anomaly hint normally sits:

- **L1** — the base fight.
- **L2 — Accelerated Response:** every telegraph/read timer ~25% shorter, wave timeouts shorter.
- **L3 — Immune Memory:** killed wave enemies leave brief erasure residue where they died.

Standard HP/coin difficulty multipliers still apply underneath (already wired).

## Unlock, save, UI

- `blank` lives **outside CHAPTER_ORDER**: never in the daily rotation, never in the difficulty-3
  chapter-unlock chain. New check in endRun: classic Beyond victory at difficulty 5 sets
  `meta.chapters.blank.unlocked` (the save's first "won at 5" fact).
- Chapter select appends the card only when unlocked. Before that, once Beyond's difficulty 5 is
  unlocked (one win away), a "???" mystery card appears with the hint "win The Beyond at level 5".
- Freebie: Beyond's star row shows its 5th gold star when `blank.unlocked` — the exact fact ui.js
  notes it cannot show today.
- No retroactive unlock is possible: the save never recorded past won-at-5 runs (maxDifficulty
  caps at 5 and only proves a win at 4). Players re-win Beyond at 5 once.

## Loadout and rewards

- Weapon pool = union of every chapter's pools (the final exam); starter = reality shard.
- Winning pays out through the normal endRun path; summary shows a one-off badge for the hidden
  unlock when it fires.

## Events and testing

- New sim events (bossSpawn, bossReform, bossDead, blast, erase, yank) documented in state.js's
  doc block, handled in render.js FX and SFX_FOR_EVENT.
- All script/boss/tether/erasure logic is Pixi-free: sim-test scenarios cover wave-clear advance,
  timeout advance, boss-phase-ends-only-on-kill, victory on P3 death, no timer victory, unlock
  written on Beyond d5 win, and the difficulty-3 cap.
