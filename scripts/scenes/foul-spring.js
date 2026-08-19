// Scene: Foul Spring taking a patch of clean water on The Shelf. Runs in the page with
// (run, app, step, H) in scope; see the H surface documented in scripts/fx-probe.mjs.
//
//   npx vite --port 5203 --strictPort &            # fx-probe does NOT start a server
//   node scripts/fx-probe.mjs --scene scripts/scenes/foul-spring.js \
//     --url 'http://127.0.0.1:5203/?fv=1' --out /tmp/fs1 --frames 8
//
// ?fv= picks the candidate look (0 = the shipped instant spend, the baseline panel). Run the
// invocations ONE AT A TIME -- two fx-probes launched together both die with "scene never became
// ready".
//
// WHY IT DOES NOT WAIT FOR A REAL CAST: Silt Veil's interval is 3.2s and its cloud is planted on a
// BODY within castRange, so waiting for the sim to land one inside a streamed upwelling is a long
// wait on two independent rolls. The mod's own sim path is asserted in run MB.g; what has to be
// judged here is the PICTURE, so the circle is placed and marked directly.

H.weapon('siltVeil', 5, { foulSpring: 1 })
H.breed(6)
const crowd = H.keep(6)

// Bodies off to one side, well clear of the patch: they are here so the frame reads as a real
// chapter rather than an empty floor, not as the thing under test.
H.place((i, p) => ({ x: p.x + 210 + (i % 2) * 46, y: p.y - 120 + Math.floor(i / 2) * 62 }))

// ONE upwelling, centred a little below the player so the whole lobed outline is on a 390px
// viewport with the player's own sprite clear of it.
run.shafts.length = 0
const sh = {
  x: run.player.x, y: run.player.y + 120,
  bx: run.player.x, by: run.player.y + 120,
  r: 205, phase: 0, shape: 2, rot: 0.6, _cell: 'probe', drawdown: 0,
}
run.shafts.push(sh)

// A silt cloud sitting on the patch, because it is what does the fouling and the frame is a lie
// without it -- the question being judged is whether the water reads as taken BY that cloud.
run.blooms.push({ x: sh.x, y: sh.y, r: 150, maxR: 150, t: 0.6, dur: 4.8, dmgPerTick: 15, look: 'silt', slow: 0, fear: 1.4 })

// Mark it fouled. FOUL_SPRING_FOUL_T is 0.85; the scrub below walks that clock down so the whole
// animation is judged from one composed frame instead of one arbitrary moment of it.
const FOUL_T = 0.85
sh.fouled = FOUL_T
sh.drawdown = 2.09 // what foulUpwelling slams it to: the patch is spent the instant it is marked

H.note(JSON.stringify({ fv: new URLSearchParams(location.search).get('fv'), shafts: run.shafts.length, blooms: run.blooms.length }))

// age 0 = the moment it is fouled, age 1 = the end of the animation. Re-pins the shaft each frame
// because stepShafts drifts it and streamShafts would otherwise stream it away.
return (age) => {
  run.shafts = [sh]
  sh.x = sh.bx; sh.y = sh.by
  sh.fouled = FOUL_T * (1 - age)
  sh.drawdown = 2.09
  H.render()
}
