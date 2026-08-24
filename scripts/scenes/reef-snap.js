// Scene: The Reef's Pistol Shrimp crack, at L5 (the widest bar the ladder makes — 130px, which is
// where the bake's silhouette actually has to read). The point of the frame is the BLADE: what the
// weapon looks like on screen, against the chapter's own floor and its own bodies.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-snap.js --chapter reef --out /tmp/snap --frames 5
//
// The blade bake is chosen at BOOT from ?tv=N (render.js, SNAP_TV) — a variant is a different URL,
// not a different scene. Shoot them one at a time; two fx-probes in one message both fail.
//
// ⚠ THE CORAL CANNOT BE EMPTIED FROM HERE, and trying was a wasted round. run RN clears run.spurs
// per frame and that works for the SIM; syncSpurs packs the ridge straight off the pure
// spurAt/caveAt geometry every frame, so the renderer refills the picture whatever the array says.
// The answer is to aim the crack down the PASSAGE instead — which is also where a player fires it.
// run.shafts is different: the renderer reads that array, so dropping it does remove the air
// pockets, and this frame is about the blade rather than the bar.
H.weapon('pistolShrimp', 5)

const clear = () => { run.shafts.length = 0 }

// A pack for the claw to pick from, and the reason the aim is worth photographing: since v7.x the
// crack tracks the NEAREST body (fireSnap -> aimAngle), so the frame should show it pointed at one.
H.breed(14)
const crowd = H.keep(14)

// The near clump sits AHEAD AND BELOW, i.e. down the open water of the passage, so the blade lies
// over floor rather than into a wall of fronds — the coral is opaque and busy and a pale cyan bar
// over it cannot be judged at all. The far clump is the control: it must stay untouched.
H.place((i, p) => (i < 6
  ? { x: p.x + 130 + (i % 3) * 54, y: p.y + 96 + Math.floor(i / 3) * 44 }
  : { x: p.x + 300 + (i % 4) * 54, y: p.y - 190 - Math.floor((i - 6) / 4) * 48 }))

// Wait for a cast. The muzzle boil is an EVENT ({type:'snap'}), so tickFx is what spawns it —
// a scene built on tick() photographs the blade with no bubbles at the claw and no error.
clear()
H.until(() => { clear(); return run.beams.length > 0 }, 900)
for (let i = 0; i < 3; i++) { clear(); H.pin(); H.tickFx() }

H.note(JSON.stringify({
  beams: run.beams.length,
  width: Math.round(run.beams[0]?.width ?? -1),
  length: Math.round(run.beams[0]?.length ?? -1),
  angleDeg: Math.round(((run.beams[0]?.angle ?? 0) * 180) / Math.PI),
  looks: [...new Set(run.beams.map((b) => b.look))],
}))

// The blade's envelope (BEAM_ENVELOPE) squashes it in and fades it out inside 0.14s, so a single
// still is one arbitrary point on that curve. Rewind `life` to walk the whole cast.
const scrub = H.scrub(run.beams)
return (age) => { clear(); H.pin(); scrub(age) }
