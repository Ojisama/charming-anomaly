// Scene: Sewer Geyser open jets over a crowd, for the v6.10 look A/B (render.js GEYSER_LOOK, ?gv=N).
// Runs in the page with (run, app, step, H) in scope; see the H surface in fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/geyser-jets.js --out /tmp/gv1 --frames 12 \
//     --url 'http://127.0.0.1:PORT/?gv=1'
//
// The jets are HAND-PLACED rather than left to the weapon's own casts. Placement is the one thing
// this shot must not vary: the four looks have to sit on identical geometry or the comparison is
// between two crowds, not two looks. Casting naturally would also give every variant a different
// arrangement, since the cast site draws randoms.
//
// Three jets at three DIFFERENT ages in one frame, so a single still carries the whole life —
// freshly erupted, mid-life, and closing. A burst or a fade cannot be judged from a still that only
// shows one instant of it, and re-booting per age costs ~16s a frame.

H.weapon('sewerGeyser', 5)

H.breed(20)
const crowd = H.keep(20)

// A loose crowd across the jets, close enough that the rims overlap the sprites — the rim is the
// hitbox now, so how it reads AGAINST enemies is the thing being judged, not how it reads on bare
// asphalt.
H.place((i, p) => ({
  x: p.x - 120 + (i % 5) * 62 + (Math.floor(i / 5) % 2) * 24,
  y: p.y - 96 + Math.floor(i / 5) * 66,
}))

// Let the weapon cast once so the run is in a real state, then take the zones over.
H.until(() => run.geysers.length > 0, 900)

// r=128 is the real L5 radius and it is ENORMOUS against a 390px-wide viewport — two jets already
// cover most of the screen. Three plus a telegraph, the first framing tried here, was an unreadable
// pile of overlapping discs where no look could be told from any other. Two open jets at different
// ages plus one telegraph is the most this framing can carry, and the crowding is itself a finding:
// it is the whole reason the few-and-big / many-and-small question is worth measuring.
// Stop the weapon casting once the run is warm. Every H.tick() in the scrub advances the real sim,
// so left equipped it keeps planting fresh hydrants mid-shot and the frame stops being a controlled
// comparison — the extra ones are real, but they are not the thing being judged.
run.weapons = []

const R = 128, DUR = 3.0                      // the L5 numbers from config.js
const jet = (x, y, age) => ({
  x: run.player.x + x, y: run.player.y + y,
  r: R, fuse: -1, dur: 0.6, dmg: 48,
  jetDur: DUR, tick: 0.4, jet: DUR * (1 - age), _cd: new Map(),
})
run.geysers = [jet(-104, -150, 0.10), jet(96, 60, 0.55)]

// A zone still on its fuse, so the telegraph and the open jet can be compared side by side — they
// have to be tellable apart at a glance, since one is harmless and one is not.
run.geysers.push({ x: run.player.x - 60, y: run.player.y + 250, r: R, fuse: 0.22, dur: 0.6, dmg: 48, jetDur: DUR, tick: 0.4 })

H.note(JSON.stringify({ zones: run.geysers.length }))

// Scrub the jets' remaining life to sweep them through their whole cycle together. Not H.scrub:
// that rewinds a `life` field, and a jet's clock is `jet` counting DOWN from jetDur.
const base = run.geysers.map((g) => g.jet)
return (age) => {
  run.geysers.forEach((g, i) => {
    if (base[i] == null) return
    // Each jet keeps its own offset so the frame always shows distinct ages, and wraps rather than
    // dying — a jet at jet<=0 is removed by the sim and there would be nothing to photograph.
    //
    // Confined to 0.08..0.72 of the life. Past 0.8 the shared envelope fades a jet out, and a frame
    // that happened to catch one there showed an almost empty circle — which reads as "this look
    // draws nothing" when it is really "this look is 90% faded". The tail gets judged in the GIF,
    // where it is motion and not an accident of which frame got picked.
    const k = 0.08 + (((1 - base[i] / DUR) + age) % 1) * 0.64
    g.jet = DUR * (1 - k)
  })
  H.tick(1 / 60)      // real time so animT advances: every pulse in these looks rides on it
  // Re-pin AFTER the tick. The jets damage the crowd every single frame, and a cast being struck
  // continuously never stops flashing — without this every enemy renders as a white silhouette and
  // the effect cannot be judged against the sprites it sits over.
  H.pin()
  H.render()
}
