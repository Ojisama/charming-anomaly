# The Ophan, rev 2: open arena, a chasing boss, monster waves between phases

Revises `2026-10-24-the-ophan-final-boss-design.md`. Where the two disagree, this one wins. Everything it does not
mention stays as shipped in v9.0.0: the six worlds and their looks, the depth gauge, the six skins, the hand, the six
attacks and the pencil sketch.

## Owner rulings (2026-10-25, binding)

| # | Ruling | Owner's words / answer |
|---|---|---|
| R1 | The arena is OPEN like the other boss arenas: no box, the player moves freely, and the camera follows the player. | "the boss arena should be open, like other bosses arena, i should be able to move around" |
| R2 | The boss FOLLOWS the player: it chases until the player is inside its attack reach, holds there, and attacks. It is no longer pinned. | "the boss should follow me" / "chases you close enough for basic attacks" |
| R3 | Every attack plays 1.5x faster: wind-up, strike and recovery. The cooldown between attacks is unchanged. | "all boss attacks should be 50% faster" / "Attacks only" |
| R4 | The sword slam's range is quadrupled. | "the sword slam should have a range quadrupled" |
| R5 | The fight has inter-phases, as the other boss fights do. | see the next table |
| R6 | The monster-only stretches are used to bake the boss art in the background. | "maybe those interphases could be used to bake in the background some frames" |
| R7 | The level must load fast. The same fight gets a faster warm-up; worlds are never gated behind readiness. | "loading the game and the level are too slow" / option A |

### R5, the fight's timeline

| Stage | What happens | Ends when |
|---|---|---|
| Opening wave | Regular monsters only. The boss is absent and the boss bar hidden. | **30 s** |
| P1 | The boss enters and fights. Phase 1 (`ph` 1). | 2 skins broken: the boss LEAVES |
| Wave 2 | Regular monsters only. The boss is absent and the bar hidden. | **15 s** |
| P2 | The boss returns. Phase 2. | 4 skins broken: the boss leaves |
| Wave 3 | Regular monsters only. | **15 s** |
| P3 | The boss returns. Phase 3. | 6 skins broken: the pencil sketch rises at once, with no wave before it |
| Sketch | As shipped. | the sketch dies: victory |

Skin hp persists across a leave, the same way The Kraken's head hp does. The phase number is the stage, which is the
same mapping v9 used (2 broken gives ph 2, 4 broken gives ph 3).

## How it works (precedents in this codebase)

- **Open arena and camera:**
  - Remove the player clamp to `OPHAN_ARENA` (sim.js:1920) and `ophanView`'s fixed camera (config.js:10222). The game's default follow camera then takes over, as for The Blank (render.js:33327).
  - The zoom stays whatever ophanView decides today (`z`) so the art keeps its size. Only camX/camY follow the player.
  - The crowd spawns on the normal off-screen ring around the player, not on a box border.
- **The floors scroll:** each of the seven stages (src/ophan/stages/*) is today a screen-fitted layer. It must become a world-anchored floor that tiles infinitely and scrolls with the camera, keeping its look; the drift gate is the judge of that. holo already notes a "world transform"; pencil already tiles a 384 px rules tile.
- **The boss moves:**
  - Delete `ophanPin`.
  - The boss steers toward the player until the player is within `OPHAN_BOSS_HOLD`. That distance is derived from its attacks' reach so the attacks can land, and it backs off if the player walks into its body.
  - It STANDS STILL from an attack's start to its end (the attack is aimed from where it stopped), as The Kraken anchors its head during ring blocks.
  - New config: `OPHAN_BOSS_SPEED` and `OPHAN_BOSS_HOLD`. Starting points are tuned by the bot probe; first guess: speed 0.9x the player's base speed.
  - The attacks' world geometry (rig toWorld, hit.js) is already relative to the boss position, so it follows the boss for free. Verify that rather than assume it.
- **Attack speed:** one multiplier, `OPHAN_ATK_SPEED = 1.5`, at the single progress line (sim.js:1895 `a.u += dt / a.dur * …`). Cooldowns (`OPHAN_ATK_CD`) are untouched.
- **Sword reach:**
  - Hoist the hard-coded blade length (rig.js:350 `LB = 1.8`) into config as `OPHAN_SWORD_REACH`, so the impact point's distance from the boss (`.5 + LB`, in R units) is 4x v9's.
  - Scale the fire line with it.
  - The rig's drawn blade and hit.js share one geometry object, so they stay in step. Pin both with a test.
- **Leave and return:** follow The Kraken's `krakenHide`/`krakenRaiseHead`.
  - Leaving is a silent removal of the boss entity, with its skins' hp kept in `run.script.oph`. `run.bossBar = null`.
  - New events `ophanLeave` and `ophanEnter`, each with a render tell and either an SFX_FOR_EVENT line or a SILENT_BY_DESIGN entry.
  - My call (owner may revise): the boss sinks into the floor when it leaves and rises out of it when it returns, at a spot near the player. Burrow is a book about digging.
- **Waves:**
  - The regular monsters are the chapter's crowd, already drawn as each world's own creatures. During a wave they spawn at a wave rate, denser than the in-phase crowd, and give full XP. Tune the rate with the bot.
  - The gauge and world switching stay live during waves.
  - On boss entry the wave's monsters stay (The Kraken keeps its dead).
- **Background baking (R6):**
  - The warm-up queue (renderer.js prewarm) drains at a small per-frame budget during the opening wave and the inter-phase waves, in the order the boss needs things. The level starts as soon as the opening wave's needs are ready: the worlds' floors and the crowd.
  - If the boss's own art is not ready at 30 s, the remaining queue drains behind a short loading tell before the boss enters. It is never baked under a frame.
  - The fight's frame gates (no frame > 100 ms on the S25) apply during waves too.

## Measures of done

- The S25 full-fight probe passes all four gates.
- Level load (Start -> playing) on the S25 is close to the other Burrow chapters (~5 s).
- `npm test` is green, and new scenarios ASSERT EFFECTS:
  - the player can leave the old box;
  - the boss's position changes and it closes to hold distance;
  - the boss is absent and the bar null during waves;
  - stage timings;
  - skin hp persists across a leave;
  - the sword's impact distance is 4x v9's, in the hit predicate and not just the constant;
  - attack progress is 1.5x per second.
- The drift gate passes for all 7 looks.
- The bot (scripts/ophan-bot.js) wins d1-d3 in an open arena. The bot needs to move and aim in open space now.
- Ships as a normal minor release behind DEV.
