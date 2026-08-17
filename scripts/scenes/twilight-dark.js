// Scene: The Twilight at every level of its Light bar, from a full bar to an empty one. Book 2's
// mechanic is "the world dims as you run out", and that is a RAMP — it cannot be judged from one
// still, and it cannot be judged from a screenshot of a live run either, because the bar is moving
// while you shoot it.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/twilight-dark.js --chapter twilight --out /tmp/sd --frames 7
//
// Frame 0 is a full bar (no scrim at all), the last frame is empty (peak dim + the slow at its
// floor). The shaft in frame is a REAL streamed shaft moved into view, not an invented one, so the
// hole the scrim cuts is exactly the radius stepCharge tests against.

// A crowd around the player at two radii — the dark's cost is that you cannot see these arriving,
// so a frame with nothing in it would show the dimming and hide the point of it.
// 10, not 16: The Twilight runs maxAliveMul 0.5, so a bigger cast can exceed what the chapter will
// keep alive at t=0 and H.breed spends its whole tick budget waiting for a 16th that cannot exist.
H.breed(10)
H.keep(10)
H.place((i, p) => {
  const a = (i / 10) * Math.PI * 2
  const r = 165 + (i % 3) * 85
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
})

// Put a shaft off to the upper-left so one frame carries BOTH states: the lit pool where the scrim
// is cut away and the world renders untouched, and the dimmed water around it. Moving an existing
// shaft rather than pushing a new object keeps every field the renderer reads (r, phase, bx/by)
// consistent — and nothing re-derives x/y here, because the scrub only renders and never ticks,
// so stepShafts' drift cannot walk it back out of frame between captures.
const p = run.player
if (run.shafts.length > 0) {
  const sh = run.shafts[0]
  sh.bx = sh.x = p.x - 150
  sh.by = sh.y = p.y - 210
  run.shafts.length = 1
}

// Report whether the swell layer is actually up. It is easy to mistake a soft effect for "not
// implemented" from a still — the FIRST cut of the swell was a pool of 34 tinted streaks that
// reported 34/34 visible and was nearly invisible on screen, and squinting at a screenshot is how
// this repo has twice called a working effect broken. world's children are [floorLayer, swellLayer,
// cloudShadowLayer, entitiesLayer]; index 1 is the swell, now a single Graphics redrawn per frame
// (so `crests` reads 1/1 when it is drawing — it counts display objects, not wave crests).
const _swell = app.stage.children[0]?.children[1]
// ...and whether the DARK is up, read off the render state rather than off run.charge: stage child
// 1 is darkLayer. "the bar is at 30" is a sim fact; "the dark is on screen" is the thing the frame
// is being asked about, and the two only agree while updateDark is actually running.
//
// The RADIUS is no longer readable here and printing one would be a lie. The dark used to be a
// falloff sprite scaled to exactly 2R, so its width was the light's diameter; it is now a single
// screen-sized sprite over a computed lightmap, and its width is the screen. Judge the reach off
// the frame itself — that is what the frame is for.
const _dark = app.stage.children[1]
// SHORT keys on purpose: the note is a non-wrapping <pre> pinned to the page, so a long JSON line
// runs off the right edge of the capture and the value you came to read is the part that is gone.
H.note([
  run.chapter,
  'shafts=' + run.shafts.length,
  'r=' + run.shafts[0]?.r,
  'swellVis=' + _swell?.visible,
  'crests=' + (_swell?.children.filter((c) => c.visible).length ?? 0) + '/' + (_swell?.children.length ?? 0),
].join(' '))

// Re-noted every frame by the scrub below, since the dark is the thing that MOVES here. `dim` is
// the sprite's own alpha: darkVis true with dim 0 is a layer that is up and painting nothing, which
// looks exactly like a working full bar and is not the same bug.
const noteAt = () => H.note([
  run.chapter,
  'charge=' + Math.round(run.charge),
  'darkVis=' + _dark?.visible,
  'dim=' + (_dark?.children[0]?.alpha ?? 0).toFixed(2),
  'shafts=' + run.shafts.length,
].join(' '))

// age 0 -> a full bar, age 1 -> empty. Deliberately NOT H.scrub (which rewinds a decay field):
// there is no decaying list here, the thing being scrubbed is a sim VALUE that both the renderer
// and sim.js read through the same darkness() curve.
return (age) => {
  run.charge = 100 * (1 - age)
  H.render()
  noteAt()   // AFTER the render: updateDark runs inside sync(), so before it the sprite is stale
}
