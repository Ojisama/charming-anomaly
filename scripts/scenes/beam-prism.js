// Scene: a mythic Beam Prism refracting off a crowd. The worked example for scripts/fx-probe.mjs
// (v6.7.7 shipped off this exact frame). Runs in the page with (run, app, step, H) in scope; see
// the H surface documented in fx-probe.mjs. Return a scrub function to get an animated sequence.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/beam-prism.js --out /tmp/pr --frames 14

// The Neon Beam is forced in regardless of which chapter started — the effect under test belongs
// to the weapon, not the biome. prism:4 is the mythic ladder [4,3,2].
H.weapon('rainbow', 5, { prism: 4 })

// Let the sim breed its own enemies, so every one is a real pool entity with a real rosterId.
H.breed(22)
const crowd = H.keep(22)

// Ranks marching away from the player, kept inside ~230px so the whole refraction tree stays on a
// 390px-wide phone viewport — the framing that actually has to be judged.
H.place((i, p) => ({
  x: p.x + 70 + Math.floor(i / 6) * 58 + (i % 6 % 2) * 18,
  y: p.y + ((i % 6) - 2.5) * 34 + Math.floor(i / 6) * 8,
}))

// Wait for a cast, then nail the arms onto the crowd. rotSpeed 0 stops the beam sweeping off it.
H.until(() => run.beams.length > 0)
for (const b of run.beams) { b.angle = 0; b.rotSpeed = 0 }

// ...then wait for a refraction to actually land, re-pinning the heading every frame.
run.prisms.length = 0
H.until(() => {
  for (const b of run.beams) b.angle = 0
  return run.prisms.length > 0
}, 600)

H.note(JSON.stringify({
  prisms: run.prisms.length,
  generations: [...new Set(run.prisms.map((s) => s.d))],
  ladder: run.beams[0]?.prism,
}))

// run.prisms is render-only and decays on `life`, so rewinding it replays the splash. 0 = cast.
return H.scrub(run.prisms)
