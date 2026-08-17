// Scene: a Foxfire cast in the DARK, shot honestly — the bar stays where it was cast.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/shelf-foxfire-dark.js --chapter shelf --out /tmp/ffd --frames 5
//
// scripts/scenes/shelf-foxfire.js — the scene this weapon shipped on — writes `run.charge =
// run.chargeMax` on EVERY captured frame, and says why in its own header: "the honest way to shoot
// the dark cast — bar at zero — is a black rectangle with the effect somewhere inside it". That
// sentence is the bug, not a limitation of the probe: the chapter measures 63% of a run dark, the
// scrim is `dim: 1.0` over `darkTint: 0x00060b`, and updateDark punches holes for the player's lamp,
// the shafts and The Deep's lures — and for nothing else. A cloud cast at castRange (280-340px)
// while the lamp is 0.1x the screen's longest side (84px on a phone) is under an opaque scrim.
//
// So this scene scrubs the BAR instead of the cloud's life, with the cloud pinned at a fixed offset
// the whole time: frame 0 is a full bar, the last frame is empty. What the frames answer is one
// question — at what point on this chapter's own ramp does the card stop being on screen at all?
H.weapon('foxfire', 5)

H.breed(8)
H.keep(8)
// A ring at the cloud's own distance, so the frame also shows what the dark costs: these are the
// bodies standing in the fire.
H.place((i, p) => {
  const a = (i / 8) * Math.PI * 2
  return { x: p.x + Math.cos(a) * 240, y: p.y + Math.sin(a) * 240 }
})

// Cast on an EMPTY bar (full FOXFIRE_GLOOM), which is the state the card is sold on. The bar has to
// be written before the step that casts — the same reason shelf-foxfire.js drives its own loop
// rather than using H.until, whose predicate runs after the tick.
run.blooms.length = 0
for (let i = 0; i < 900 && run.blooms.length === 0; i++) { run.charge = 0; H.tick(1 / 60); H.pin() }

const noteAt = () => {
  const bl = [...run.blooms].sort((a, b) => b.maxR - a.maxR)[0]
  H.note([
    'charge=' + Math.round(run.charge),
    'darkVis=' + app.stage.children[1]?.visible,
    'clouds=' + run.blooms.length,
    'maxR=' + Math.round(bl?.maxR ?? 0),
    'dist=' + Math.round(Math.hypot((bl?.x ?? 0) - run.player.x, (bl?.y ?? 0) - run.player.y)),
  ].join(' '))
}

// age 0 -> full bar, age 1 -> empty. Held mid-life and staged at a fixed offset so the eye has one
// place to look across the whole ramp; `maxR` is untouched, so the cloud stays the size the empty
// bar bought it.
//
// ⚠ `r` IS WRITTEN HERE, NOT JUST `t`. stepBlooms grows r from t every step and this scrub only
// RENDERS — so a cloud caught on the frame it was cast keeps r ~ 0 and syncBlooms scales it to a
// couple of pixels. The first cut of this scene did exactly that and came back with an empty frame
// at a FULL bar, which reads as the bug it was written to find.
return (age) => {
  run.charge = run.chargeMax * (1 - age)
  const p = run.player
  for (const bl of run.blooms) {
    bl.t = bl.dur * 0.45
    bl.r = bl.maxR
    bl.x = p.x - 110; bl.y = p.y - 205
  }
  H.render()
  noteAt()   // AFTER the render: updateDark runs inside sync(), so before it the layer is stale
}
