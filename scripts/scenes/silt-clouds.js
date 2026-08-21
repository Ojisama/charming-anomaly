// Scene: THREE SILT CLOUDS OF ONE CAST, side by side. Owner from play, 2026-08-21: "vase clouds
// look too similar to each other" — with Roil held, one Silt Veil cast plants two or three clouds
// at once, and every one of them used to be the identical drawing (three puffs, fixed 0.4r offset,
// fixed angle ladder, same churn direction).
//
//   npx vite --port 5203 --strictPort &            # fx-probe does NOT start a server
//   node scripts/fx-probe.mjs --scene scripts/scenes/silt-clouds.js \
//     --url 'http://127.0.0.1:5203/' --out /tmp/silt --frames 8
//
// The variation is hashed off each cloud's own x/y (see syncBlooms in render.js), so the ONLY thing
// that makes these three differ is where they were planted — which is exactly the situation the
// weapon creates. Placing them by hand rather than waiting for a real cast is the same shortcut
// foul-spring.js takes and for the same reason: the sim path is asserted in run MB.c, what is being
// judged here is the picture.
//
// ⚠ SHOOT IT AT BOTH VIEWPORTS. Three clouds at 150px on a 390px phone is most of the screen; on
// 1280x800 they are three small patches, which is the harder read and the one that matters.

H.weapon('siltVeil', 5, { roil: 2 })
H.breed(6)
H.keep(6)

// Bodies off to one side so the frame reads as a real chapter rather than an empty floor.
H.place((i, p) => ({ x: p.x + 250 + (i % 2) * 46, y: p.y - 150 + Math.floor(i / 2) * 62 }))

// Three clouds in a row, at the spacing a real cast produces (planted on separate bodies within
// castRange, which at L5 is 195px). Same r, same age, same tint: every difference in the frame is
// the per-cloud hash and nothing else.
const p = run.player
const R = 118
run.blooms.length = 0
for (let i = 0; i < 3; i++) {
  run.blooms.push({
    x: p.x + (i - 1) * 170, y: p.y + 130,
    r: R, maxR: R, t: 2.0, dur: 4.8, dmgPerTick: 40, look: 'silt', slow: 0, daze: 1.4,
  })
}

H.note(JSON.stringify({ blooms: run.blooms.length, r: R }))

// The puffs orbit on animT, so the frames have to advance real time or all eight are one picture.
return () => {
  if (run.blooms.length !== 3) { run.blooms.length = 0; for (let i = 0; i < 3; i++) run.blooms.push({ x: p.x + (i - 1) * 170, y: p.y + 130, r: R, maxR: R, t: 2.0, dur: 4.8, dmgPerTick: 40, look: 'silt', slow: 0, daze: 1.4 }) }
  for (const b of run.blooms) { b.t = 2.0; b.r = R }   // hold them mid-life so nothing fades out
  H.render()
}
