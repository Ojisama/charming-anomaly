// Scene: the Roar's pressure wave with WIDTH STACKED, which is the case the owner reported —
// "it doesn't look like a roar sound pressure wave anymore when >150% roar width ... we just see
// orange lines on the screen". wideRoar is a pct mod on `arc`, so 1.5 puts L5's 1.30 rad at
// 3.25 rad (186 degrees).
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/skies-roar-wave.js --out /tmp/roar \
//     --frames 5 --url http://127.0.0.1:PORT/ --chapter skies
//
// TWO traps live here, and the first one silently produced a WRONG REPORT once already:
//
//  1. The roar band is spawned by the `roar` EVENT (handleEvents -> spawnRoar), not by a run.*
//     array. H.tick DROPS events and H.render syncs with a hardcoded [], so a scene built on those
//     two captures a frame containing no roar at all — with no error, looking exactly like "the
//     effect is invisible". Use H.tickFx, which forwards the step's events and renders.
//  2. The effect is RENDER-LOCAL (render.js's own `roars` pool), so there is no life field to scrub
//     the way run.arcs or run.drags allow. The sequence has to be walked by stepping the sim in
//     slices, which is what the returned function does.
run.weapons = [{ id: 'roar', level: 5 }]
run.weaponMods.roar = { wideRoar: 1.5 }

H.breed(6)
const crowd = H.keep(6)
crowd.forEach((e) => { e.flags = [] })
// A wide fan of targets so the roar has something to aim at and bodies sit across the whole arc.
H.place((i, p) => ({
  x: p.x + 150 + (i % 2) * 90,
  y: p.y + (Math.floor(i / 2) - 1) * 150,
}))

// Force the cast on the next step rather than waiting for one — the sweep lasts 0.34s.
run.weaponTimers.roar = 0
const fired = H.tickFx()

H.note(JSON.stringify({
  arcDeg: Math.round(1.30 * 2.5 * 180 / Math.PI),
  roarEvent: fired.some((e) => e.type === 'roar'),
}))

// age 0 -> 1 walks the roar's own 0.34s life in even slices, forwarding events the whole way.
let last = 0
return (age) => {
  const want = age * 0.30
  if (want <= 0) { H.tickFx(0); return }   // age 0: the frame the cast itself produced
  while (last < want - 1e-9) { H.tickFx(1 / 120); last += 1 / 120 }
}
