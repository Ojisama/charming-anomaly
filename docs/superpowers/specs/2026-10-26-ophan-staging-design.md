# The Ophan's staging — design

Owner rulings 2026-10-25, looks picked in the playground (`ophan-stage.html`) 2026-10-25/26.
`STAGE_PICK` in `src/ophan/staging.js` is the source of truth for the looks; `OPHAN_STAGE`,
`OPHAN_BEATS` and `OPHAN_OUTRO` in `src/config.js` for the timings and words.

## Beats

| Beat | What plays | Pick |
|---|---|---|
| Arrival | The fight opens in the Core. A white-hot geyser erupts out of a hole and the boss rides up the column. The Kraken-style title card (the chapter's name and tagline) on the half of the screen the boss is not on. Harmless for `OPHAN_STAGE.arrive` s: its first attack and hand tell are held past it, your hits land. | D |
| Return (p2, p3) | The same eruption in the world it comes back in; the new wings snap out at the crest (the great eye opens in p3). A short card: MORE WINGS / THE GREAT EYE. Harmless the same way. | C |
| Skin break | `OPHAN_STAGE.breakStop` s hit-stop (`run.hitStop`), then the skin DIES in its world's medium while the next skin shows under it. | macro A (bursts from the centre) · holo B (cracks, falls apart; the Geode wheel ring is gone from the skin) · ascii A (glyphs scatter and fall) · pixel C (pixel burst) · toon A (cloud + POOF!, 1.2 s) · liquid B (peeled outward, no ring, pieces fall) |
| Resonance | The wings buckle back, two rings in the next world's colour. | B |
| Leave | The drill: wings folded, it corkscrews into the floor. The hole stays as a scar and the wave's crowd crawls out of it for `OPHAN_STAGE.hole.t` s. | B |
| Sketch | The paper drains in from the boss, the standing crowd is frozen, harmless and unpaid until its scribble crosses it out, the sketch draws itself wing by wing. Card: IT WAS NEVER FINISHED. Harmless `OPHAN_STAGE.sketch` s. | A |
| Death | 7 s on `OPHAN_OUTRO` (main.js's `BOSS_OUTRO`), skippable after 1 s: the eraser scrubs the sketch off in zigzags, the great eye last; the six worlds bloom back, the Core first; the OPHAN ERASED banner, the dark, the summary. The kill step opens no card screen (`ophanWinPending`). | A |

## Wiring

- The cards are render.js's Kraken ceremony (`krakenBeat`, `slainBanner`), fed by `ophanCard(e)`, which runs before
  `src/ophan/renderer.js` consumes the event.
- The holes are baked in the renderer's prewarm queue (`warmHole`): the Core's before the fight, the others before
  the first leave.
- Guards: run OP.stage (the sim side and that every pick is registered), run KC (both bosses' outros),
  run XX (`OPHAN_BEATS` in French).
