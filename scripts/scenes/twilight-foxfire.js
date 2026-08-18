// Scene: The Twilight's Foxfire, LIT and DARK in the same frame. The radius the dark buys is baked in
// at cast (FOXFIRE_GLOOM), so a cloud kindled while the bar was full and one kindled while it was
// empty can coexist — which is the only way to get the card's whole mechanic into one picture.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/twilight-foxfire.js --out /tmp/ff --frames 10 --chapter twilight
//
// What the frames have to answer:
//   1. are the two clouds OBVIOUSLY different sizes, at a glance, without reading the note?
//   2. is the cold blue-white clear of the Spore Bloom's green? They are the same ENTITY
//      (run.blooms) and a Shelf player must never read their own fire as a pond toxin cloud.
//   3. does a cloud read as a fire taking hold, rather than as a puddle?
//
// ⚠ THE SIM'S BAR AND THE CAMERA'S BAR ARE HELD APART, deliberately — and this scene is therefore
// ONLY valid for comparing the two RADII. It is not a picture of the card in play, and taking it for
// one is how the weapon shipped with no visual at all: every captured frame here writes
// `run.charge = run.chargeMax`, so the dark is never on screen, and in the dark the cloud used to be
// absent rather than merely dim (see FOXFIRE_GLOW in config.js). Shoot
// scripts/scenes/twilight-foxfire-dark.js for the bar the card is actually taken on.
// The bar is dropped to 0 only for the frames in which the cast is COMPUTED, and put back up for
// every frame that is captured. That is sound for the radius comparison precisely because gloom is
// snapshot at cast: the cloud keeps the size the dark bought it no matter what the bar does
// afterwards, which is the mechanic, not a cheat around it.
const lightUp = () => { run.charge = run.chargeMax }

H.weapon('foxfire', 5)

H.breed(20)
const crowd = H.keep(20)

// Two clusters well apart, so the two casts land in two places and the sizes can be compared side
// by side rather than stacked. Inside ~200px so both fit a 390px-wide phone.
H.place((i, p) => ({
  x: p.x + (i < 10 ? -125 : 130) + ((i % 5) - 2) * 22,
  y: p.y + (i < 10 ? -95 : 105) + (Math.floor((i % 10) / 5) - 0.5) * 40,
}))

// ⚠ DRIVEN BY HAND rather than with H.until, because the bar has to be written BEFORE the step that
// casts. H.until evaluates its predicate AFTER each tick, so setting the charge in there sets it one
// frame too late — the cast has already read the drained bar. The first cut of this scene did
// exactly that and came back `litR: 118, darkR: 118, ratio: 1`: two clouds at FULL gloom, labelled
// as the lit one and the dark one. The note is what caught it; the picture looked plausible.
const untilPre = (pre, pred, max = 900) => {
  for (let i = 0; i < max && !pred(); i++) { pre(); H.tick(1 / 60); H.pin() }
}

// THE LIT CAST FIRST, at a full bar: darkness() is 0 above half the bar, so this one gets gloom 1.
// ⚠ THE POOL IS EMPTIED FIRST. H.breed ticks the sim until the crowd exists, which is far longer
// than this weapon's 2.4s cadence — so by the time the scene gets control there are already several
// clouds in run.blooms, every one of them cast at whatever the bar had drained to. Without this the
// `lit` handle picks up one of THOSE, and the note reads ratio 1 while both clouds are dark ones.
run.blooms.length = 0
untilPre(lightUp, () => run.blooms.length > 0)
const lit = run.blooms[0]

// ...then empty the bar and wait for the next cast.
const before = run.blooms.length
// The lit cloud is held alive through this wait as well. `interval` (2.4s) and `glowDur` (3.2s) are
// close enough that it can burn out before the dark one is even cast — the note still reported the
// right ratio, because both handles were taken at cast, while the PICTURE had only one cloud in it.
untilPre(() => { run.charge = 0; lit.t = Math.min(lit.t, lit.dur * 0.4) }, () => run.blooms.length > before)
const dark = run.blooms[run.blooms.length - 1]

// STAGED POSITIONS, sizes untouched. pickBloomSpot lands on a RANDOM body in range and that body
// then walks, so which cloud ends up on screen is a coin toss — the previous cut of this scene had
// a correct note (ratio 1.6) above a picture containing exactly one cloud, which is the failure mode
// where the number is right and the image proves nothing. `maxR` is still whatever the sim computed
// from the bar at each cast; only where the two sit is the scene's doing.
lit.x = run.player.x - 105; lit.y = run.player.y - 120
dark.x = run.player.x + 105; dark.y = run.player.y + 110

H.note(JSON.stringify({
  litR: Math.round(lit.maxR),
  darkR: Math.round(dark.maxR),
  ratio: +(dark.maxR / lit.maxR).toFixed(2),
}))

// PINNED, both clouds held mid-life (glowDur is 3.2s and the sequence is longer than that, so
// without this the lit one expires halfway through and the comparison quietly becomes one circle).
// ⚠ STAGED BY RADIUS, NOT BY HANDLE. stepBlooms does `run.blooms = run.blooms.filter(...)` every
// step, so a handle taken at cast can fall out of the live array while the object it points at stays
// perfectly valid — writes to it then go somewhere nothing draws. That is why the previous cut
// staged two clouds and rendered one. Re-reading the live array each frame and sorting by `maxR` is
// handle-free: the small one is the lit cast and the large one is the dark cast, by construction.
return (age) => {
  lightUp()
  const p = run.player
  const live = [...run.blooms].sort((a, b) => a.maxR - b.maxR)
  for (const bl of live) bl.t = Math.min(bl.t, bl.dur * 0.45)
  if (live[0]) { live[0].x = p.x - 100; live[0].y = p.y - 125 }
  if (live[live.length - 1] && live.length > 1) {
    live[live.length - 1].x = p.x + 100
    live[live.length - 1].y = p.y + 115
  }
  H.note(JSON.stringify({ live: live.length, radii: live.map((b) => Math.round(b.maxR)) }))
  H.pin()
  H.tickFx(1 / 60)
}
