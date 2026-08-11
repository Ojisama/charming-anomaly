// Scene: the Atomic Breath's WIND-UP — the seven dorsal plates charging tail->head before the
// fork fires. This is the frame the combined scene deliberately skips past (it waits for
// charge <= 0), and the one the owner asked about.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/skies-breath-charge.js --out /tmp/charge \
//     --frames 5 --url http://127.0.0.1:5199/ --chapter skies
run.weapons = [{ id: 'atomicBreath', level: 5 }]

H.breed(8)
const crowd = H.keep(8)
crowd.forEach((e) => { e.flags = [] })
H.place((i, p) => ({ x: p.x + 110 + (i % 3) * 80, y: p.y + (Math.floor(i / 3) - 1) * 84 }))

// Stop the instant a breath is CHARGING — one tick later and the plates have moved on.
H.until(() => run.arcs.some((a) => a.charge > 0), 400)

const a = run.arcs.find((x) => x.charge > 0)
H.note(JSON.stringify({ charging: !!a, charge: a ? +a.charge.toFixed(3) : null, forkNodes: a ? a.nodes.length : null }))

// Scrubbing the CHARGE itself walks the wind-up: age 0 = the instant of the cast (plates cold, the
// wavefront still at the tail), age 1 = the moment it fires (spine fully lit at the head). That is
// the whole point of the sequence — a build-up cannot be judged from one still.
const c0 = run.arcs.map((x) => x.charge)
return (age) => {
  run.arcs.forEach((x, i) => { x.charge = c0[i] * (1 - age) })
  H.render()
}
