// Scene: Le Large's three natives firing at once, on one frame, in the chapter they belong to.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/large-arsenal.js --chapter shelf --out /tmp/la --frames 4
//
// All three reuse a SHARED entity array (run.novas, run.blooms, run.lobs), which is exactly why
// they have to be judged together rather than one at a time: the risk is not that any one of them
// is illegible, it is that two of them look like each other, or like something another chapter
// already owns. Specifically, on this frame:
//   - Bubble Puff's ring must not read as The Surf's Breaker crest (also a nova) or as its Skipping
//     Shell splash (also a nova, and deliberately a DARK mark).
//   - Silt Veil's cloud must not read as the pond's Toxin Bloom (same entity, green) or as The
//     Twilight's Foxfire (same entity, mint). It is olive-brown for that reason.
//   - Ballast's landing ring is the shared amber Debris Toss telegraph, KEPT on purpose — the one
//     thing to check is that it does not collide with the upwelling rim it may land beside.

H.breed(12)
H.keep(12)
H.place((i, p) => {
  const a = (i / 12) * Math.PI * 2
  const r = 150 + (i % 3) * 80
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
})

// All three at L5, so the frame shows the arsenal at the size the census measured.
// NOT three H.weapon() calls: that helper REPLACES run.weapons, so the first two would be silently
// dropped and the frame would show one card while claiming to show three. Set the array once.
// BALLAST ALONE for this pass: the complaint was that it looked like Debris Toss and came out
// pixelated, and a frame with three effects in it cannot answer a question about one sprite.
run.weapons = [{ id: 'ballast', level: 5 }]

// A pinned cast struck every frame never stops flashing white, and a white silhouette cannot be
// judged against the effect sitting on top of it.
for (const e of run.enemies) e.hitFlash = 0
run.player.invuln = 0

// A ballast is in the air for BALLAST_FLIGHT (0.42s) on a ~2.0s cadence, so letting the sim run and
// hoping to catch one is a coin flip per frame — the first pass of this scene came back with six
// frames and no weapon in any of them, which reads exactly like a weapon that does not fire. Pin
// ONE and scrub its own flight clock instead: age 0 is the throw, age 1 is the landing.
const p0 = run.player
run.lobs.length = 0
run.lobs.push({
  fromX: p0.x - 40, fromY: p0.y + 30,
  tx: p0.x + 210, ty: p0.y - 120,
  t: 0, flight: 0.42, dmg: 52, r: 134, look: 'ballast',
  stainDur: 4.4, stainDps: 11,
})

return (age) => {
  for (const lo of run.lobs) lo.t = 0.42 * age
  for (const e of run.enemies) e.hitFlash = 0
  run.player.invuln = 0; run.player.hurtT = 0
  H.render()
}
