// Scene: four lanternfish, pinned at known ranges from the player, on a 20/100 Light bar.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-lantern-range.js --chapter deep --out /tmp/lr
//
// Task 8 Step 4 (R2.6). Is the lanternfish's OWN glow (ROSTER_LOOKS.lanternfish.glow, render.js —
// read by updateDark, the same 'lighten' pass a maw's LURE_GLOW uses) enough to read the fish as a
// light source once it is past the player's own lamp, not just close up? At charge 20/100 the lamp
// itself (lightRadius: radiusEmpty 0.06, radiusFull 0.50, phone longest side 844) reaches
// ~125px — everything past that is where the fish's glow has to carry the read alone, because
// nothing else lights it (run.shafts is emptied below so no maw's LURE_GLOW competes with the
// frame). Four ranges bracket that:
//   90px  — inside the lamp already: the CONTROL, must read regardless of glow.frac
//   180/300/410px — outside it by a growing margin: what glow.frac has to reach
//
// Modelled on deep-hunt.js's header (a straight line so the frame reads as distance) and deep-cast.js's
// rosterId override (WAVE_TABLE gates the tank to t=140s and a bred body may not be a lanternfish at
// all, so the id — and the radius that comes with it — is forced rather than waited for).
const DISTS = [90, 180, 300, 410]

H.breed(DISTS.length)
const cast = H.keep(DISTS.length)
cast.forEach((e) => { e.rosterId = 'lanternfish'; e.radius = 16; e.facing = 1 })
H.place((i, p) => ({ x: p.x, y: p.y - DISTS[i] }))   // straight up: the frame reads as distance up the screen
for (const k of ['webs', 'pools', 'strips']) if (Array.isArray(run[k])) run[k].length = 0
run.shafts.length = 0   // no maw's own LURE_GLOW in the frame — this is the lanternfish's glow alone

// run.sightCharge, NOT just run.charge: updateDark reads `run.sightCharge ?? run.charge` (the
// Shelf's Clear button lends sight without touching the bar), and createRun seeds it at chargeMax
// (state.js) then only stepCharge (sim.js) ever brings it back down to track run.charge. This scene
// never steps the sim after the warm-up, so without this line the frame renders at a near-full lamp
// (~100/100) no matter what run.charge says — a wrong-brightness frame with no error anywhere,
// which is exactly what the first cut of this scene shot before the mismatch was caught here.
run.charge = 20
run.sightCharge = 20

H.note(`${run.chapter} charge=${Math.round(run.charge)}/${run.chargeMax} dists=${DISTS.join(',')}px`)

return () => {
  for (const e of cast) e.hitFlash = 0
  run.charge = 20
  run.sightCharge = 20
  H.pin()
  H.render()
}
