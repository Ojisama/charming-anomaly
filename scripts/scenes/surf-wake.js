// Scene: the player's wake — the ripples a body pushes across shallow water as it moves.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/surf-wake.js --out /tmp/wk --frames 14 --chapter surf
//
// It exists because the wake is emitted per DISTANCE TRAVELLED (see WAKE_VIS), and fx-probe's own
// H.tick feeds the sim a zero input vector — so every other scene in this directory has a player
// standing perfectly still, which is exactly the state that correctly produces no wake at all. A
// pinned scene therefore CANNOT see this feature, and would report it as missing.
//
// The player is walked by hand rather than by input so the path is identical in every capture.

H.breed(6)
H.keep(6)
H.place((i, p) => {
  const a = (i / 6) * Math.PI * 2
  return { x: p.x + Math.cos(a) * 460, y: p.y + Math.sin(a) * 460 }
})

// Straight across the frame at roughly the player's own top speed (220 px/s), so the spacing between
// rings is the spacing a real run produces.
const STEP = 220 / 60
return () => {
  run.player.x += STEP
  H.pin()
  H.tickFx(1 / 60)
}
