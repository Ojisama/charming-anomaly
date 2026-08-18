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
run.weapons = [
  { id: 'bubblePuff', level: 5 },
  { id: 'siltVeil', level: 5 },
  { id: 'ballast', level: 5 },
]

// A pinned cast struck every frame never stops flashing white, and a white silhouette cannot be
// judged against the effect sitting on top of it.
for (const e of run.enemies) e.hitFlash = 0
run.player.invuln = 0

return (age) => {
  // Run real time so the ring expands, the cloud grows and the weight completes its arc — none of
  // these three can be read from a single still, and a frozen frame would show three shapes at
  // whatever radius they happened to be born at.
  // 1.4s PER FRAME, not 0.1. The three cadences at L5 are 0.70s / 3.2s / 2.0s, so a tenth of a
  // second per frame runs the whole capture inside the FIRST cast of the fastest card and comes back
  // showing an empty chapter — which reads exactly like three weapons that do not work.
  H.tick(1.4)
  for (const e of run.enemies) e.hitFlash = 0
  run.player.invuln = 0; run.player.hurtT = 0
  H.render()
}
