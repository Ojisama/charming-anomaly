// Scene: the Tail Lash alone — three aircraft hooked at once (L5 carries hooks:3) and reeled in,
// with the ground armour beside them deliberately untouched.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/skies-tail-lash.js --out /tmp/lash \
//     --frames 3 --url http://127.0.0.1:5199/ --chapter skies
//
// See scripts/scenes/skies-lash-breath.js for the combined frame, and for why H.weapon() cannot be
// called twice (it REPLACES run.weapons rather than appending).
run.weapons = [{ id: 'tailLash', level: 5 }]

H.breed(10)
const crowd = H.keep(10)
// Alternating aircraft / ground armour, so the frame proves the owner's rule on its own: every
// tether ends on a plane, and every tank is still standing exactly where it started.
crowd.forEach((e, i) => { e.flags = i % 2 === 0 ? ['crushable'] : ['unshakeable'] })
H.place((i, p) => ({ x: p.x + 110 + (i % 3) * 74, y: p.y + (Math.floor(i / 3) - 1.2) * 78 }))

// Force the cast rather than waiting for one: a drag lives LASH_PULL_T (0.22s), so catching one by
// waiting is a coin flip, and every tick spent waiting spawns unpinned enemies into the shot.
run.weaponTimers.tailLash = 0
H.tick(); H.tick()

H.note(JSON.stringify({
  drags: run.drags.length,
  hookedAreAircraft: run.drags.length > 0 && run.drags.every((d) =>
    run.enemies.find((x) => x.id === d.id)?.flags?.includes('crushable')),
}))
return H.scrub(run.drags)
