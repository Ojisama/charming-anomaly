// Scene: the Atomic Breath alone — the fork mid-burn, chained through a formation.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/skies-atomic-breath.js --out /tmp/breath \
//     --frames 3 --url http://127.0.0.1:5199/ --chapter skies
run.weapons = [{ id: 'atomicBreath', level: 5 }]

H.breed(12)
const crowd = H.keep(12)
crowd.forEach((e) => { e.flags = [] })
// Spaced just under arcRange (200 at L5) so the fork has a real chain to walk rather than a blob.
H.place((i, p) => ({ x: p.x + 95 + (i % 4) * 82, y: p.y + (Math.floor(i / 4) - 1) * 88 }))

// BURNING, not charging: a wind-up frame shows a ring and no fork, which reads as a broken weapon.
H.until(() => run.arcs.some((a) => a.charge <= 0 && a.nodes.length > 1), 400)

H.note(JSON.stringify({ arcs: run.arcs.length, forkNodes: run.arcs.map((a) => a.nodes.length) }))
return H.scrub(run.arcs)
