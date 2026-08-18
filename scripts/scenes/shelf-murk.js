// Scene: The Shelf's murk at every level of its Clarity bar, from a full bar to an empty one.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/shelf-murk.js --chapter shelf --out /tmp/sm --frames 7
//
// This is the twilight-dark scene's question asked of the OTHER chapter that runs the same radius
// rig, and the reason it needs its own scene is that the two must not read as one another. §6.2 of
// the Undertow spec reused the light chapter's scrim on the ground that "it does not care whether
// the thing outside the radius is darkness or filth" — which is true of the CODE and is exactly the
// thing that has to be checked by eye, because if the murk just reads as a browner dark then the
// chapter is a reskin rather than a redesign.
//
// What to look for, in this order:
//   1. Does the far field read as FILTHY WATER or as NIGHT? Murk is bright and low-contrast; dark is
//      dim and high-contrast. If frame 6 looks like The Twilight in sepia, darkTint is wrong.
//   2. Are the upwellings clearly not sun shafts? They share the geometry exactly (same cell, chance,
//      radius and drift), so the drawing is the ONLY thing keeping them apart — see UPWELLING_VIS.
//   3. Does the player still slow down? It must NOT. The murk costs sight only (resource.dark
//      speedFloor 1), which is the one number in this chapter that is a decision rather than an
//      inheritance. A frame cannot show this; it is here so the reader does not go looking.

// A crowd at two radii — the murk's cost is that you cannot see these arriving, so an empty frame
// would show the dimming and hide the point of it. The Shelf runs maxAliveMul 0.65, so 10 is safely
// under what the chapter will keep alive at t=0.
H.breed(10)
H.keep(10)
H.place((i, p) => {
  const a = (i / 10) * Math.PI * 2
  const r = 165 + (i % 3) * 85
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
})

// One real streamed upwelling moved into view, so the hole the scrim cuts is exactly the radius
// stepCharge tests against rather than an invented circle at an invented size.
const p = run.player
if (run.shafts.length > 0) {
  const sh = run.shafts[0]
  sh.bx = sh.x = p.x - 150
  sh.by = sh.y = p.y - 210
  run.shafts.length = 1
}

// age 0 -> a full bar, age 1 -> empty. Deliberately NOT H.scrub (which rewinds a decay field):
// there is no decaying list here, the thing being scrubbed is a sim VALUE that both the renderer
// and sim.js read through the same darkness() curve. Same shape as twilight-dark's, so the two
// contact sheets can be laid side by side and compared frame for frame.
// TWO sweeps in one scene, because the question that brought it back is about their INTERACTION.
// The bar is held LOW and fixed so the murk is at its working strength in every frame, and what
// moves across the sequence is the upwelling's own drawdown: frame 0 is fresh water, the last frame
// is water that has been fully used up.
//
// What to look for: by the last frame the upwelling must be gone AND THE MURK MUST HAVE CLOSED OVER
// IT. Reported from play 2026-08-18 — "faded out clear water pools still give light" — because
// updateDark punched its hole unconditionally, so a circle that had visibly vanished and had
// stopped refilling the bar was still cutting a full-strength window in the scrim.
return (age) => {
  run.charge = 15
  for (const sh of run.shafts) sh.drawdown = 5 * age
  H.render()
}
