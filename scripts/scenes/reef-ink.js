// Scene: The Reef's Squid Ink. The cloud on the player, and the bodies it has blinded — which is
// two drawings that have to be told apart at phone size: the ink hanging in the water, and the
// stain on a creature that has lost you.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-ink.js --chapter reef --out /tmp/ink --frames 8
//
// ⚠ H.tickFx, not H.tick, for the captured frames: the {type:'ink'} jet is an EVENT, and handleEvents
// is the only thing that spawns its smoke. A scene built on tick() photographs the cloud with no
// jet in it and no error, which is the trap fx-probe's own header documents.
H.weapon('squidInk', 5)

H.breed(16)
const crowd = H.keep(16)

// Two ranks: one inside the cloud (which will be blinded) and one clear of it, so the frame carries
// its own control — an inked body next to a clean one, same bake, same light.
H.place((i, p) => ({
  x: p.x + (i < 8 ? -60 + (i % 4) * 46 : 260 + (i % 4) * 46),
  y: p.y + (i < 8 ? -70 + Math.floor(i / 4) * 90 : -70 + Math.floor((i - 8) / 4) * 90),
}))

// Wait for a jet, then let the cloud grow onto the near rank.
H.until(() => run.blooms.some((b) => b.look === 'ink'))
for (let i = 0; i < 90; i++) { H.tick(); H.pin() }

H.note(JSON.stringify({
  clouds: run.blooms.filter((b) => b.look === 'ink').length,
  r: Math.round(run.blooms.find((b) => b.look === 'ink')?.r ?? -1),
  blinded: run.enemies.filter((e) => (e.blindT ?? 0) > 0).length,
  clear: run.enemies.filter((e) => !(e.blindT > 0)).length,
}))

// Animated: the cloud boils and the ink sheds off the blinded bodies, neither of which reads from
// a still. Bodies stay pinned so only the effect moves.
return (age) => { for (let i = 0; i < 4; i++) { H.pin(); H.tickFx() } }
