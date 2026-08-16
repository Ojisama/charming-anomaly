// Scene: The Trawl's three creatures, side by side and holding still, normal and elite bakes.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/trawl-cast.js --chapter trawl --out /tmp/tc --frames 2
//
// The same three reasons its siblings (reef-cast.js, surf-cast.js) override the roster rather than
// waiting for a spawn, and they bite identically here:
//   * WAVE_TABLE gates archetypes by TIME — no tank before t=140s, no fast before 40s — so a crowd
//     bred at t=0 photographs nine mackerel and reports the other two as missing. syncEnemies keys
//     the texture off e.rosterId alone, so a re-labelled body gets the right bake immediately.
//   * RADIUS has to be set with it: syncEnemies draws at k = e.radius / look.baseR, so a body bred
//     at t=0 is a `drone` (16) whatever you call it, and the tank would render at 16/26 of its true
//     size — i.e. relative size, the one thing a cast shot exists to judge, comes out wrong.
//   * hitFlash must be cleared EVERY frame: a pinned cast inside weapon range is struck continuously
//     and renders as a white silhouette, which is indistinguishable from a draw fn that fills white.
//
// UNLIKE the reef's, this chapter is NOT a lane, so the layout is the plain symmetric one and the
// player does not slide out of frame. What this scene is actually for: the three are all pelagic and
// two of them are silver, so the question it has to answer is whether they read as THREE ANIMALS —
// the mackerel's fork against the tuna's crescent, and the sea lion's flippers against both.
const IDS = [['sealion', 26], ['mackerel', 16], ['tuna', 12]]

H.breed(6)
const cast = H.keep(6)
cast.forEach((e, i) => {
  const [id, rad] = IDS[i % 3]
  e.rosterId = id
  e.radius = rad
  e.elite = i >= 3
})

// column = species, row = normal / elite. The elite row is not decoration: eliteCrown() and the
// elite tint are a SEPARATE bake (makeRosterLook bakes the pair), so a normal-only shot proves
// nothing about half of what ships.
// ±135px, NOT the ±190 this started at: a phone is 390 CSS px wide and the world is drawn at a scale
// under 1, but a sea lion is 26 radius before its flippers and the outer columns went half off the
// frame at 190 — a cast shot that clips the thing it exists to photograph. Judge it at both
// viewports; the phone is the one that constrains this number.
const layout = () => H.place((i, p) => ({ x: p.x + (i % 3 - 1) * 135, y: p.y + (i < 3 ? -125 : 105) }))
layout()

H.note([run.chapter, 'cast=' + cast.map((e) => e.rosterId + '@' + e.radius + (e.elite ? '*' : '')).join(',')].join(' '))

return () => {
  layout()
  for (const e of cast) e.hitFlash = 0
  run.player.invuln = 0   // syncPlayer blinks playerC to 0.4 alpha while invuln runs
  H.render()
}
