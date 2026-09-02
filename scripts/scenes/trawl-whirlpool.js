// Scene: The Trawl's Whirlpool mid-spin, a crowd being drawn into it. The frame the LOOK is judged
// on, and once more with the Mini Black Hole it replaced (?bh=1 equips 'hole' instead) as the
// contact sheet's baseline panel.
//
//   npx vite --port 5204 --strictPort
//   node scripts/fx-probe.mjs --scene scripts/scenes/trawl-whirlpool.js --chapter trawl \
//     --url 'http://127.0.0.1:5204/' --out /tmp/wp --frames 8
//
// The questions this frame has to answer, in order:
//   1. Is it WATER? The Black Hole shares run.holes and the whole rig with this, so the drawing is
//      the only thing keeping them apart — and "the Black Hole in a different colour" is exactly the
//      failure the owner named ("le chalut has black holes").
//   2. Is it PLAN VIEW? The camera looks straight down. A whirlpool from above is a spiral; from the
//      side it is a funnel, which is how v6.8 shipped the Trash Tornado. Only the first belongs here.
//   3. Does the DIRECTION read? The foam has to turn the way the bodies are dragged (counter-
//      clockwise on screen — the sign of stepHoles' tangent term). A still cannot show this, which
//      is why the sequence is ticked between captures and stacked into a GIF.
//   4. Does it stay distinct from the chapter's own two nets — the cold mesh wall and the warm gear?
//
// The crowd is placed at the RIM, not on the centre: a scene that starts them already gathered
// shows the payoff and hides the mechanic.
const BASELINE = /[?&]bh=1/.test(location.search)
H.weapon(BASELINE ? 'hole' : 'whirlpool', 5)

H.breed(16)
H.keep(16)

// A ring just inside the L5 radius (215) and a second, wider one outside it, so the frame shows
// both what is being dragged and what is not.
H.place((i, p) => {
  const a = (i / 16) * Math.PI * 2
  const r = i % 2 === 0 ? 170 : 290
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
})

// Wait for a REAL cast rather than pushing a hand-made entry: the vortex has to be the one the
// weapon's own fire site builds, or the frame is a picture of a fixture.
H.until(() => run.holes.length > 0)

// Pin the main vortex under the player so the framing is identical across every panel, and drop
// any extras (Twin Whirl is not equipped, but IPECAC-style extras would move the composition).
run.holes.length = 1
const v = run.holes[0]
v.x = run.player.x
v.y = run.player.y

for (const e of run.enemies) e.hitFlash = 0
run.player.invuln = 0

H.note(JSON.stringify({
  weapon: run.weapons[0].id,
  look: v.look ?? null,
  radius: v.radius,
  coreRadius: v.coreRadius,
  crowdInside: run.enemies.filter((e) => Math.hypot(e.x - v.x, e.y - v.y) <= v.radius).length,
}))

// Every capture advances the world by five real frames, so the foam turns and the bodies spiral
// in between panels (a rotation is animT-driven and animT only moves when sync gets time). The
// vortex's life is re-pinned each time so it never fades: the sequence is the spin, not the expiry.
const full = v.duration
return (age) => {
  if (age > 0) for (let k = 0; k < 5; k++) H.tick()
  const c = run.holes[0]
  if (c) { c.life = full * 0.7; c.x = run.player.x; c.y = run.player.y }
  for (const e of run.enemies) e.hitFlash = 0
  run.player.invuln = 0
  H.render()
}
