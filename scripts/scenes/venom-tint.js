// Scene: one row of the same creature at a rising venom dose, to judge the green ramp.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/venom-tint.js --out /tmp/venom
//
// The dose is written straight onto `e.venom` — the contract field render.js reads — AFTER the
// last tick, because under run.newElements stepStatuses republishes it from the enemy's own damage
// window every frame and would overwrite anything set earlier. Nothing steps after a scene returns
// (fx-probe does clean() then render()), so the pinned doses survive to the capture.

run.newElements = true
run.elements.venom = 4

H.breed(12)
const cast = H.keep(6)

// One horizontal row across the phone viewport, roughly level with the player.
H.place((i, p) => ({ x: p.x - 130 + i * 52, y: p.y - 40 }))

// Nothing else in frame: the tint is being compared against the bake, not against a projectile.
run.bullets.length = 0
run.beams.length = 0
run.particles = []

// 0 is the control — the same creature, untinted, in the same light.
const DOSES = [0, 0.15, 0.3, 0.5, 0.75, 1.0]
cast.forEach((e, i) => { e.venom = DOSES[i]; e.chill = 0; e.frozen = 0; e.ignite = 0; e.hitFlash = 0 })

H.note(JSON.stringify({ doses: DOSES, rosterIds: cast.map((e) => e.rosterId ?? e.type) }))
