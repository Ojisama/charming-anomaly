// Scene: the v7.23 skies rework — the Tail Lash hooking aircraft and the Atomic Breath forking
// through a formation, in one frame, in the real renderer.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/skies-lash-breath.js --out /tmp/skies \
//     --frames 10 --url http://127.0.0.1:5199/ --chapter skies
//
// NOTE H.weapon() REPLACES run.weapons, it does not append — calling it twice equips only the
// second weapon, which is how the first cut of this scene spent 900 ticks waiting for a lash that
// was never equipped. Two weapons means assigning the array.
run.weapons = [{ id: 'tailLash', level: 5 }, { id: 'atomicBreath', level: 5 }]

H.breed(14)
const crowd = H.keep(14)

// Half AIRCRAFT (the only thing the lash can drag — see the LASH_* block in config.js), half ground
// armour, so one frame shows both halves of the owner's rule: planes get yanked, tanks stay put.
crowd.forEach((e, i) => { e.flags = i % 2 === 0 ? ['crushable'] : ['unshakeable'] })

// A loose formation out to the right and above — far enough that the lash's 460px reach is visibly
// doing something a 200px sector never could, close enough to stay on a 390px-wide phone viewport.
H.place((i, p) => ({
  x: p.x + 80 + (i % 4) * 60,
  y: p.y + (Math.floor(i / 4) - 1.2) * 66,
}))

// Wait for the BREATH to be burning (past its charge, with a real fork), not merely cast: a frame
// taken during the wind-up shows a ring and no fork, which reads as a broken weapon. Capped tight,
// because every tick spent here spawns unpinned enemies that wander through the shot.
H.until(() => run.arcs.some((a) => a.charge <= 0 && a.nodes.length > 1), 400)

// Now force a lash on the very next tick so the drag tethers are FRESH at capture — a drag lives
// LASH_PULL_T (0.22s), so waiting for one to happen to coincide with the breath is a coin flip.
run.weaponTimers.tailLash = 0
H.tick()
H.tick()

H.note(JSON.stringify({
  arcs: run.arcs.length,
  forkNodes: run.arcs.map((a) => a.nodes.length),
  drags: run.drags.length,
  hookedAreAircraft: run.drags.length > 0 && run.drags.every((d) => {
    const e = run.enemies.find((x) => x.id === d.id)
    return !!(e && e.flags && e.flags.includes('crushable'))
  }),
}))

// run.arcs rebuild their nodes every tick, so scrubbing their `life` replays the burn. 0 = cast.
return H.scrub(run.arcs)
