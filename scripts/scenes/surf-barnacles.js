// Scene: The Surf's Barnacles, with a pack part-way through being crusted. The crust is published
// as `e.barnacle`, a contract field, and render.js tints a crusted body chalky shell-white — the
// only tell the weapon has, since the grind itself is invisible.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/surf-barnacles.js --out /tmp/bn --frames 12 --chapter surf
//
// What the frames have to answer:
//   1. can you tell a crusted body from an uncrusted one AT A GLANCE, in a pack?
//   2. is the crust tint clear of the other status tints — frozen's blue, stun's grey-brown?
//   3. do the larvae read as seeds rather than as another projectile?
// A HALF-CRUSTED PACK IS THE FRAME THAT MATTERS. A fully-crusted one looks like a palette swap and
// a bare one shows nothing, so the scene deliberately crusts alternating bodies by hand and lets
// the weapon's own casts land on top of that.

H.weapon('barnacles', 5)

H.breed(18)
const crowd = H.keep(18)

// Tight ranks: this weapon is about fighting INSIDE a pack, so the frame has to show one.
H.place((i, p) => ({
  x: p.x + 100 + Math.floor(i / 6) * 54,
  y: p.y + ((i % 6) - 2.5) * 46,
}))

// Let the weapon land its own casts first, so the larvae in flight are real.
H.until(() => run.enemies.some((e) => e.barnacle), 900)

// ...then crust every OTHER body by hand, so the frame carries the comparison the eye needs. Built
// through the same shape applyBarnacle publishes rather than a bespoke object, so what is drawn is
// what the weapon actually produces.
const lvl = 4
crowd.forEach((e, i) => {
  if (i % 2 === 0) return
  e.barnacle = { t: 3.2, dur: 5.0, dmg: 10, tick: 0.5, next: 0.5, jumps: 3 }
})

H.note(JSON.stringify({
  crusted: crowd.filter((e) => e.barnacle).length,
  of: crowd.length,
  larvaeInFlight: run.bullets.filter((b) => b.weapon === 'barnacle').length,
}))

// PINNED: unlike the other two scenes, nothing here needs to travel — the read is a tint on a body
// that is standing still, and letting the pack walk only blurs the comparison between neighbours.
return (age) => { H.pin(); H.tickFx(1 / 60) }
