// Scene: The Reef's three creatures, side by side and holding still, in both their normal and elite
// bakes.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-cast.js --chapter reef --out /tmp/rc --frames 2
//
// Same three reasons this overrides the roster rather than waiting for a spawn, all of which the
// sibling surf-cast.js documents at length and which bite exactly as hard here:
//
//   * WAVE_TABLE gates archetypes by TIME (tank not until t=140s, fast not until 40s), so a scene
//     that breeds a crowd at t=0 photographs nine damselfish and reports the moray and the lionfish
//     as "missing". syncEnemies keys the texture off e.rosterId alone, so re-labelling a bred body
//     gets the right bake without fast-forwarding five minutes of a run.
//   * RADIUS has to be set with it. syncEnemies draws at k = e.radius / look.baseR, so a body bred
//     at t=0 is a `drone` (radius 16) whatever you relabel it, and the tank renders at 16/26 of its
//     real size — i.e. the one thing a cast shot exists to judge, relative size, comes out wrong by
//     default. These are the ENEMIES.drone/wisp/tank radii each draw fn was authored at, so every
//     column lands at k = 1.
//   * hitFlash is cleared EVERY frame, not once: a pinned cast sits inside the player's weapon range
//     and is struck continuously, and a creature that never stops flashing renders as a white
//     silhouette — indistinguishable from a draw function that filled with white.
//
// Two things this scene has to do that the surf's does not, BOTH because the reef is a LANE:
//
//   * The player advances at laneScroll every step and cannot stop, so a cast placed once slides out
//     of frame within a second. Everything is re-pinned relative to the player's CURRENT position on
//     every captured frame.
//   * The lane camera puts the player at LANE_CAMERA_FRAC of the way ACROSS the screen (near the
//     left edge, with four fifths of the view ahead), so a cast laid out symmetrically about them —
//     which is what every non-lane cast scene does — puts its first column off the left edge. The
//     first cut of this scene did exactly that and photographed two of the three creatures, with
//     nothing to say the third was missing; hardcoding an offset ahead of the player then pushed the
//     LAST column off the right edge instead. So the columns are spread across the measured forward
//     span rather than placed at fixed offsets — which is also what makes the same scene correct at
//     both viewports, and this has to be shot at both.
const IDS = [['moray', 26], ['damselfish', 16], ['lionfish', 12]]

H.breed(6)
const cast = H.keep(6)
cast.forEach((e, i) => {
  const [id, rad] = IDS[i % 3]
  e.rosterId = id
  e.radius = rad
  e.elite = i >= 3
})

// column = species, row = normal / elite. The elite row exists because eliteCrown() and the elite
// tint are a SEPARATE bake (makeRosterLook bakes the pair), so a normal-only shot proves nothing
// about half of what actually ships.
// The forward span actually visible, in WORLD px: from the player to the leading screen edge.
const world = app.stage.children[0]
const fwdSpan = () => (app.screen.width - (world.position.x + run.player.x * world.scale.x)) / world.scale.x
const layout = () => {
  const span = fwdSpan()
  H.place((i, p) => ({ x: p.x + span * (0.22 + (i % 3) * 0.29), y: p.y + (i < 3 ? -108 : 82) }))
}
layout()

H.note([
  run.chapter,
  'cast=' + cast.map((e) => e.rosterId + '@' + e.radius + (e.elite ? '*' : '')).join(','),
].join(' '))

return () => {
  layout()
  for (const e of cast) e.hitFlash = 0
  run.player.invuln = 0   // syncPlayer blinks playerC to 0.4 alpha while invuln runs
  H.render()
}
