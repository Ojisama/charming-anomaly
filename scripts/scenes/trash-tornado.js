// Scene: the Trash Tornado's v6.8 pack. Two acts in one capture — the funnels hunting a crowd,
// then (past the halfway frame) the crowd is deleted and they spiral back into the idle ring.
// Runs in the page with (run, app, step, H) in scope; see the H surface in fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/trash-tornado.js --out /tmp/tor --frames 24
//
// This scene returns a scrub that STEPS THE SIM rather than rewinding a decay field the way
// beam-prism.js does: the tornado has no `life`, its whole subject is movement, and a still cannot
// show whether a funnel leaves the ring or comes home.

H.weapon('trashTornado', 5)

H.breed(10)
H.keep(6)
run.mods.spawnMul = 0    // AFTER breeding, or there is nothing to breed and the frame comes out
                         // empty — which looks exactly like "the hunt does not work"

// An arc of prey to the player's right, 150-230px out — inside the level-5 hunt leash (270px) and
// well off the idle ring (130px), so every funnel visibly has to leave home to reach one.
H.place((i, p) => {
  const a = -0.85 + (i / 5) * 1.7
  const r = 150 + (i % 3) * 40
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
})

// Warm up until the pack has committed to its targets.
for (let i = 0; i < 90; i++) { H.tick(); H.pin() }

H.note(JSON.stringify({
  funnels: run.debris.length,
  targeted: run.debris.filter((d) => d.tgt).length,
  distinct: new Set(run.debris.map((d) => d.tgt)).size,
  fromPlayer: run.debris.map((d) => Math.round(Math.hypot(d.x - run.player.x, d.y - run.player.y))),
}))

// Act 2 gets the longer half: coming home is a ~0.5s flight followed by a slower re-spacing
// (TORNADO_RESPACE), and cutting it short shows a clumped ring that the weapon never actually has.
let cleared = false
return (age) => {
  if (!cleared && age > 0.35) { run.enemies.length = 0; cleared = true }
  for (let i = 0; i < 4; i++) { H.tick(); H.pin() }
  H.render()
}
