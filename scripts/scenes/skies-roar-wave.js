// Scene: the Roar's pressure wave with RANGE STACKED, which is the case the owner reported —
// "with 200%+ range, we almost don't see the pressure wave". farRoar is a pct mod on `range`, so
// 1.2 puts L5's 275 at ~605px, well past double.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/skies-roar-wave.js --out /tmp/roar \
//     --frames 6 --url http://127.0.0.1:PORT/ --chapter skies
//
// The roar is a RENDER-LOCAL effect (the `roars` pool in render.js), not sim state, so there is no
// life field to scrub the way run.arcs or run.drags allow. The sequence is walked by ticking the
// sim a slice at a time and rendering between ticks — roar dur is 0.34s, so the slices below cover
// one full sweep.
run.weapons = [{ id: 'roar', level: 5 }]
run.weaponMods.roar = { farRoar: 1.2 }

H.breed(6)
const crowd = H.keep(6)
crowd.forEach((e) => { e.flags = [] })
// Well out along +x so the wave has open ground to cross and the sweep is not hidden behind bodies.
H.place((i, p) => ({ x: p.x + 220 + (i % 3) * 150, y: p.y + (Math.floor(i / 3) - 0.5) * 120 }))

// Pin the facing so the wedge points +x and every frame is comparable.
run.player.facingAngle = 0

// Force the cast on the next tick rather than waiting for one — the sweep lasts 0.34s, so catching
// it by waiting is a coin flip.
run.weaponTimers.roar = 0
H.tick()

H.note(JSON.stringify({
  range: Math.round(275 * (1 + 1.2)),
  facing: run.player.facingAngle,
}))

// age 0 -> 1 walks the roar's own 0.34s life in even slices.
let last = 0
return (age) => {
  const want = age * 0.30
  while (last < want - 1e-9) { H.tick(1 / 120); last += 1 / 120 }
  run.player.facingAngle = 0
  H.render()
}
