# The Ophan — Book 3 (Burrow) final boss level

Status: owner-approved rulings, 2026-10-24. Ships DEV-only as v9.0.0 (`npm run ship "…" --major`).

## Intent

The Ophan is Book 3's final boss: a biblically accurate seraph (wings around one great eye, eyes in the
feathers, talon tips) that lives at the centre of the Earth and wears the six Burrow chapters as skins.
You can only hurt it while you stand in the world whose skin it is wearing. The owner designed and
approved its look over 50 revisions of a mock-up
(https://claude.ai/artifact/39D48WBeBaRMhQy3GhQs23, v51). This level puts that fight into the game.

**The approved mock-up is the visual spec** (owner rule: "a port must look the same"). Its game-tech
build already draws every world with the game's own `src/` renderers and every boss/hand with the
approved painters through px2d, and every boss passes a pixel-drift gate against the approved painter.

## Goals

- A seventh Burrow level, `ophan`, reachable in DEV, playable on a phone end to end: fight, die, win.
- It looks like the mock-up: same boss painters, same hands, same worlds, same wipe, same gauge.
- It plays as a normal run (joystick, weapon build, level-ups, a crowd that hurts), with the boss as the
  main threat.

## Non-goals

- Leaderboard, French copy review, balance sign-off: owner playtest first (DEV-gated).
- Removing the DEV gate.
- New weapons: the kit reuses six existing ones.

## Anti-goals (a failure even if it works)

- A boss or world that does not look like the approved mock-up (it fails the drift gate).
- Lag: below 58 fps / p95 above 20 ms on the owner's S25.
- An attack you cannot read: every attack is announced by a pose of the wings, and its telegraph is
  subtle and part of the world (no reticles, no guide strips).

## Owner rulings (2026-10-24)

| Topic | Ruling |
|---|---|
| Player | **Normal run.** Joystick, a weapon build with level-ups; boss attacks hurt; you can die. |
| Unlock | Beat **The Core at difficulty 3**. DEV opens it anyway. |
| Crowd | **Each world's own roster** spawns while that world is active, hurts you, gives XP. |
| Kit | **Fixed boss kit, one weapon per Burrow world:** each chapter's starter — shovel (Topsoil), prismShard (Geode), pickaxe (Mine), slagLadle (Magma), hotCoals (Mantle), sling (Core). |
| Switching worlds | **Tap a band** of the six-band depth gauge on the left edge (keys 1-6 on desktop). Broken worlds are greyed and refuse. |
| Mismatch | **Fully immune:** your weapons' hits on the boss bounce (the immune ring) unless the world matches its skin. The crowd dies in any world. |
| Attack pool | **By difficulty, as the approved notes say:** d1 2 attacks, d2 4, d3 6. Eye attacks wait for their phase (laser from phase 2). Difficulty capped at 3. |
| Arena | **One screen**, the mock-up's framing: boss in the top third, no scrolling, crowd walks in from the edges. |
| Ending | **A sketch phase fight.** Once all six skins are broken, the pencil sketch fights on with its own health bar; no world matching. Its moves: the six attacks drawn in pencil, plus **Divine judgment**, **Isaac beams** and **the eraser** (below), all nine at every difficulty, same speed. |
| Old crowd on a switch | **Turns in place:** as the wipe circle passes a creature, it becomes the new world's equivalent at the same spot, same archetype, same health share. |
| Hazards | **None:** each world is its floor, its look and its crowd. No signature mechanics, no obstacles. The boss's attacks are the hazards. |
| Kit weapons | **Always fire**, in every world. |
| Mismatch | The boss is immune, but **its attacks always hurt you**, matched or not. |
| Sketch arena | **Paper floor, no crowd**, the gauge greyed out: you and the sketch alone. |
| v9.0.0 scope | **Ships without** judgment, Isaac beams and the eraser: v9's sketch uses the six pencil attacks. The three come in a later release, after their look pass. |

## The fight (from the approved mock-up, src2.html step())

- **Six skins**, one per chapter, each with its own health bar. The boss wears one skin at a time.
- **Hand change:** every 3.4-5.0 s (never mid-attack) a hand drawn in the next skin's style, holding its
  tool, repaints the boss. Its shadow slides in 1.4 s ahead, tinted the next skin's colour (the tell).
- **Resonance:** if you switch to the next skin's world during the tell and are still matched when the
  swap lands, the boss is staggered for 1.4 s and takes double damage.
- **Wipe:** switching worlds grows a circle from the player (1400 px/s) inside which the new world is drawn.
- **Breaking:** a skin at 0 hp breaks for good; the boss jumps to another unbroken skin, and that band of
  the gauge greys out. **Phases:** 1 + min(2, floor(broken / 2)): phase 1 four wings and no eyes, phase 2
  six wings and four eyes, phase 3 the great eye. Six broken: phase 4, the sketch.
- **Attacks:** one at a time (a scheduler hands out turns), never during a hand-change tell, each
  announced by a wing pose, each ending in a recovery where the wings hang open and the boss takes
  double damage. Durations from the mock-up: blast 1.8 s, tornado 4.5 s, laser 3.85 s, wheel 4.2 s,
  recall 4.4 s, sword 3.4 s. Hit areas follow the drawn shapes (the painters' own geometry, shared
  through `OPHAN_RIG`), not a separate hitbox the player cannot see. Aim locks when an attack starts.
  - Blast (wing cone), Tornado (funnel that travels), Laser (four eye lanes, phase 2+), Wheel (rolls
    three straight legs, ricochets twice, cuts a groove), Feather recall (ten feathers stake the floor
    round you, then fly home through you), Sword slam (a feather blade slams toward you; a line of fire
    in the world's element runs on past you).
- **Sketch phase (phase 4):** the pencil sketch, its own health bar, no immunity. Uses the six attacks
  drawn in pencil, plus three sketch-only attacks:
  - **Divine judgment:** every wing rises to the sky, the great eye looks up, the arena darkens; a
    ring of light marks the ground under you, then a column of light lands on you and follows you
    (slower than you run) for about 4 s. Afterwards the wings fall open: the longest damage window.
  - **Isaac beams** (Binding of Isaac's light from above): marked spots on the floor, then beams of
    light crash down on several at once.
  - **The eraser:** the pencil's eraser wipes a band across the arena; leave the band before it passes.
  These three have no approved look yet: they get a look pass (labelled variants on one frame, owner
  picks) before they are built, in a release after v9.0.0.
- **Win:** the sketch's bar empties. **Lose:** your hp empties.

## Constraints

- Module boundaries hold (CLAUDE.md): the fight's rules live in sim.js (`stepBossScript` dispatch, like
  `stepKrakenScript`), state on `run`, events on `run.events`; render reads `run`, never writes it.
- Every number in config.js; balance lines in the one-line `balance_decision` format.
- `meta` is additive-only.
- New player-visible strings in config tables, with French (drafted, owner reviews).
- Pixi v8, no top-level await, `inlineDynamicImports` unchanged.

## How it gets made (my calls, flagged)

- **Rendering:** the game cannot show two chapter renderers at once (they are singletons on one world
  and camera; `app.stage.filters` is one slot), and the wipe needs two. The game-tech build already
  solves it: one stage per world on its own container, the six built up front, plus px2d for the
  painters. So the Ophan level gets **its own renderer module (src/ophan/), ported from the game-tech
  build** — px2d, the six stages (which already import the real `src/` renderers), the painters, the
  hands, the gauge and the wipe — and render.js hands the screen to it for this chapter, the way it
  hands it to toon/ascii/liquid. The Core's liquid stage uses a modified copy of `src/liquid/gl.js`
  (splats/ripples for the boss): fold that change into `src/liquid/gl.js` behind a flag rather than
  ship a second copy.
- **Boss draw layer:** every boss is drawn over its world's screen pass (owner ruling 2026-10-24).
- **Gauge placement:** the mock-up's six-band gauge on the left edge, low, clear of the game's other
  touch buttons (joystick, dash) and HUD; bands at least 44 css px tall.
- **Crowd look:** each world's creatures as that chapter draws them. How (reuse each chapter
  renderer's creature bakes, or the mock-up's per-style marks) is settled in the plan by shooting both;
  the mock-up's marks are the fallback.
- **Attack pool per difficulty** (d1 2 / d2 4 / d3 6, within the six drawn attacks): d1 sword + blast,
  d2 adds tornado + laser (laser still waits for phase 2), d3 adds wheel + recall.
- **Starter weapon:** the shovel; the other five come as level-up offers.
- **Numbers** (skin hp, boss damage, crowd density, xpNeedMul) start from the Kraken's and the mock-up's,
  then are measured with a headless bot (≥6 seeds, spread shown) before the owner plays.

## Left to the builder

Hit-area geometry per attack (from the painters' shapes), the gauge's touch target sizes (phone),
event names and SFX choices, test scenarios (mutation-proven), the exact port layout under src/ophan/.

## Verification

- `npm test` green, including updated hidden-chapter tests (`hiddenChapters()` gains 'ophan', BU3.d still
  pins non-dev invisibility) and new mutation-proven Ophan scenarios.
- Drift gate on the in-game boss (each skin + attacks) against the approved painter.
- Shot frames of the live level (idle, every attack, a wipe, a hand change, the sketch phase).
- S25 measurement: ≥ 58 fps, p95 ≤ 20 ms through a full fight.
