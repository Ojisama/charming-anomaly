// Scene: The Shelf's Downwash mid-pour, dragging a crowd into its middle. The frame the LOOK gate
// is judged on — shot once per candidate drawing behind ?dw=N (render.js, DW_LOOK).
//
//   npx vite --port 5203 --strictPort            # fx-probe navigates, it does not start a server
//   node scripts/fx-probe.mjs --scene scripts/scenes/shelf-downwash.js --chapter shelf \
//     --url 'http://127.0.0.1:5203/?dw=0' --out /tmp/dw0 --frames 6
//
// The question this frame has to answer, in this order:
//   1. Is it CLEAN WATER, or is it the Mini Black Hole in a different colour? Both weapons live in
//      run.holes and share the whole rig, so the drawing is the only thing keeping them apart — and
//      a purple singularity in a brown-green murk chapter is the borrowed-art trap arriving without
//      anything actually being borrowed.
//   2. Is it PLAN VIEW? The camera looks straight down. A column of falling water is the one shape
//      in this game most likely to be drawn as a side elevation by accident, which is how v6.8
//      shipped the Trash Tornado and spent a whole version undoing it.
//   3. Does it read as GATHERING rather than as burning? The card's promise is that the crowd ends
//      up in one place; if the frame reads as a damage zone, the promise is only in the tooltip.
//
// The crowd is placed at the RIM, not on the centre: a scene that starts them already gathered
// shows the payoff and hides the mechanic, which is the same mistake as judging a telegraph on its
// payoff frame.

H.weapon('downwash', 5)

H.breed(16)
H.keep(16)

// A ring just inside the column's own L5 radius (180) plus a second, wider ring outside it — so the
// frame shows both what is being dragged and what is not, which is what makes the reach legible.
H.place((i, p) => {
  const a = (i / 16) * Math.PI * 2
  const r = i % 2 === 0 ? 150 : 250
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
})

// Wait for a real cast rather than pushing a hand-made entry: the column has to be the one
// fireDownwash builds, or the frame is a picture of a fixture.
H.until(() => run.holes.some((h) => h.look === 'downwash'))

// Pin it under the player so the framing is stable across all four shots — pickDownwashSpot lands on
// the densest clump, which moves as the crowd is pulled, and a column that drifts off-centre between
// variants makes the four panels incomparable.
const col = run.holes.find((h) => h.look === 'downwash')
col.x = run.player.x
col.y = run.player.y

// Enemies struck every frame never stop flashing white, and a white crowd hides the effect it is
// supposed to sit behind. Same reason the player's invuln is cleared.
for (const e of run.enemies) e.hitFlash = 0
run.player.invuln = 0

H.note(JSON.stringify({
  look: col.look,
  radius: col.radius,
  burst: col.burst,
  crowdInside: run.enemies.filter((e) => Math.hypot(e.x - col.x, e.y - col.y) <= col.radius).length,
}))

// age 0 = the column at full pour, age 1 = the last frame before it bursts. Its life is the field
// both the sim and the renderer read, so rewinding it replays the real pour rather than an
// animation invented for the probe.
const full = col.duration
return (age) => {
  const c = run.holes.find((h) => h.look === 'downwash')
  if (c) {
    c.life = full * (1 - age * 0.9)
    c.x = run.player.x
    c.y = run.player.y
  }
  for (const e of run.enemies) e.hitFlash = 0
  H.render()
}
