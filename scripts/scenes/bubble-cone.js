// Scene: the Bubble Puff's 90-degree cone, mid-cast, against a crowd.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/bubble-cone.js --chapter shelf \
//        --url http://127.0.0.1:5203/ --out /tmp/cone --frames 5
//
// WHY IT EXISTS: the cone lives in `arc` on a run.novas entry, and run.novas is a SHARED array whose
// drawers pick entries up by tag. Until v7.14x drawBreakers claimed EVERY nova carrying a sector, so
// the two ways this could go wrong are (1) the puff renders as The Surf's blue whitewater crest in a
// chapter of silt, and (2) it renders as nothing at all, because placeNova skips any nova with an
// arc and no other drawer claims it. Both are invisible to the suite: the sim measures correct
// either way. Only a frame tells them apart.
//
// What to look for, in this order:
//   1. Is there a WEDGE of bubbles, roughly a quarter of the circle, and not a full ring?
//   2. Is it pointed at the nearest body? It aims through aimAngle, so it should be on the crowd,
//      never on empty water.
//   3. Is it made of BUBBLES over a faint wash — not blue-and-white foam bands, which would mean
//      drawBreakers has claimed it again.

H.weapon('bubblePuff', 1)

// A crowd off to one side, so the aim is unambiguous in the frame: a ring of enemies all round the
// player would leave "is it pointed at the nearest body" unanswerable.
H.breed(9)
H.keep(9)
H.place((i, p) => ({
  x: p.x + 150 + (i % 3) * 78,
  y: p.y - 90 + Math.floor(i / 3) * 90,
}))

// Clean water: the murk is not the subject here and at a low bar it would sit on top of the effect.
run.charge = 100

// Wait for a real cast rather than fabricating a nova, so every field the drawer reads (arc, angle,
// look, life) is the one the shipped weapon writes.
H.until(() => (run.novas || []).length > 0, 900)
const n = (run.novas || [])[0]
if (!n) throw new Error('no bubble nova after 900 ticks — is the weapon still called bubblePuff?')

H.note(JSON.stringify({
  look: n.look,
  arcDeg: n.arc == null ? 'FULL RING' : Math.round((n.arc * 180) / Math.PI),
  aimDeg: Math.round((n.angle * 180) / Math.PI),
  novas: run.novas.length,
}))

// NOT H.scrub, and the reason cost a frame: H.scrub rewinds `life` only, but the renderer sizes the
// wedge off `n.r` — and `r` is derived from `life` inside stepNovas, which a scrub never runs. Scrub
// alone therefore replays the puff at whatever radius the last sim step left it, which straight after
// the cast is ~0. The frame comes back with the note saying arcDeg 90 and nothing visible in the
// water, i.e. indistinguishable from "no drawer claimed it" — the exact failure this scene exists to
// tell apart. So the rewind reproduces stepNovas' own line as well.
const t0 = run.novas.map((n) => n.life)
return (age) => {
  run.novas.forEach((n, i) => {
    n.life = t0[i] * (1 - age)
    const lm = n.lifeMax || t0[i]
    n.r = n.maxR * Math.min(1, Math.max(0, 1 - n.life / lm))
  })
  H.render()
}
