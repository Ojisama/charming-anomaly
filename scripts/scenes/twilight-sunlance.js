// Scene: The Twilight's Sunlance at both ends of the bar. A lance is a run.beams entry with
// rotSpeed 0 — it does not sweep — whose LENGTH is bought with Light: full at a full bar, down to
// SUNLANCE_REACH_MIN of it at an empty one.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/twilight-sunlance.js --out /tmp/sl --frames 12 --chapter twilight
//
// What the frames have to answer:
//   1. is it clearly SUNLIGHT and not the Neon Beam? The two share run.beams AND the beam pool, and
//      an unswept beam used to fall straight into the Neon Beam's red.
//   2. does the reach visibly change between the first half of the sequence (full bar) and the
//      second (empty)? That difference is the entire card, and it cannot be judged from a still.
//   3. does it read as a STAB held on one bearing rather than a sweep? A third rotating rake is the
//      shape this weapon must not have.
//
// ⚠ THE SIM'S BAR AND THE CAMERA'S BAR ARE HELD APART, as in shelf-foxfire.js: the bar is dropped to
// 0 for the step that COMPUTES the empty-bar cast and put back up for every captured frame, because
// this chapter's light radius is a function of run.charge and an honest empty-bar shot is a black
// rectangle. Sound because `length` is computed once, at cast, and never re-read.
const lightUp = () => { run.charge = run.chargeMax }

// Drives the sim with the bar written BEFORE each step. H.until evaluates its predicate AFTER the
// tick, which sets the bar one frame too late — the cast has already read the old value.
const untilPre = (pre, pred, max = 900) => {
  for (let i = 0; i < max && !pred(); i++) { pre(); H.tick(1 / 60); H.pin() }
}

H.weapon('sunlance', 5)

H.breed(20)
const crowd = H.keep(20)

// A file of bodies running away along +x, out past the full-bar reach (560px at L5) so the tip of
// the lance always has something to stand on and the two lengths are read against the same rank.
H.place((i, p) => ({ x: p.x + 60 + i * 28, y: p.y + ((i % 3) - 1) * 20 }))

// H.breed has already run the sim for far longer than this weapon's cadence, so the pool is cleared
// first — otherwise the handle picks up a beam cast at whatever the bar had drained to, which is the
// bug that made the first cut of the foxfire scene report two identical clouds.
run.beams.length = 0
untilPre(lightUp, () => run.beams.length > 0)

H.note(JSON.stringify({
  reach: Math.round(run.beams[0]?.length ?? 0),
  swept: run.beams[0]?.swept ?? false,
  look: run.beams[0]?.look ?? null,
}))

// FULL BAR for the first half, EMPTY for the second, with the lance HELD ALIVE either way: it lives
// 0.40s against a 1.70s cadence, so most frames of an honest sequence would have no beam in them at
// all. Re-arming the timer and clearing the pool at the switch is what makes the second half a
// genuine empty-bar CAST rather than the first one redrawn shorter.
let switched = false
return (age) => {
  if (age >= 0.5 && !switched) {
    switched = true
    run.beams.length = 0
    run.weaponTimers.sunlance = 0
    untilPre(() => { run.charge = 0 }, () => run.beams.length > 0, 300)
  }
  lightUp()
  for (const b of run.beams) { b.angle = 0; b.rotSpeed = 0; b.life = b.duration * 0.7 }
  H.pin()
  H.render()
}
