// Scene: the orca's COMMIT and its bow wave (v7.x). The thing to judge here is not the sprite, it
// is the BATTLEFIELD — whether a pass visibly throws the shoal to both sides of the line and leaves
// a corridor behind it (owner ruling 2026-08-23, "it should have a massive impact on the
// battlefield, like pushing everything to each side").
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/orca-wake.js --chapter wreck \
//     --url http://127.0.0.1:PORT/ --out /tmp/orca-wake --frames 10
//
// ⚠ THE SCRUB STEPS REAL SIM TIME, unlike scenes/orca.js which poses run.orca by hand. The subject
// IS the physics — stepOrca's orcaWake writing into e.kb — so posing the animal along the line
// would draw the wake graphic over a shoal that never moved, which is exactly the frame that cannot
// tell "the wave works" from "the wave is a decal".

// A slab of shoal straddling the line, wide enough that the corridor has edges to bank against.
H.breed(46)
const cast = H.keep(46)
H.place((i, p) => ({
  x: p.x - 380 + (i % 10) * 92,
  y: p.y - 240 + Math.floor(i / 10) * 105,
}))

const p = run.player

// Dropped straight into 'committing', travelling +x through the player from off to the left. The
// rise and the ring are scenes/orca.js's subject; this one starts at the moment the line is locked.
run.orca = {
  state: 'committing',
  t: 2.2,
  cx: p.x, cy: p.y,
  r: 230, ang: 0,
  x: p.x - 620, y: p.y,
  dirX: 1, dirY: 0,
  hit: true,          // player contact latched off: the subject is displacement, not a damage flash
  alpha: 1,
  passes: 1,
}

H.note(JSON.stringify({ state: run.orca.state, cast: cast.length, chapter: run.chapter }))

// Real sim frames, spread across the capture so the sequence walks the sweep from first contact to
// the corridor it leaves. Each call advances from where the last one stopped — the probe calls the
// scrub with a monotonically rising k, so this is a play-through, not a seek.
let seen = 0
return (k) => {
  const want = Math.round(k * 48)
  while (seen < want) { H.tickFx(1 / 60); seen++ }
  H.render()
}
