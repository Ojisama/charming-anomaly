// Scene: The Reef's IMPACTS — what driving into coral and clipping a fish actually put on screen
// (v7.x). Runs in the page with (run, app, step, H) in scope; see fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-impact.js --out /tmp/impact \
//     --chapter reef --frames 6 --w 390 --h 844 --url http://127.0.0.1:PORT/
//
// SIX FRAMES: 0 the crash landing, 1-2 the chips in flight, 3 a sustained scrape, 4 the scrape a
// third of a second in, 5 a traffic bump. Each is a different question and none is answerable from
// another — the crash is a one-shot burst, the scrape is a trickle that has to stay a trickle, and
// the bump has to read as lighter than either.
//
// ⚠ H.tickFx, NEVER H.tick. Both the crash and the bump are EVENTS: handleEvents is the only thing
// that spawns their particles, and H.tick drops the frame's events on the floor. A scene built on
// tick() shoots an empty frame and no error, which is indistinguishable from an effect that does
// not draw — the trap fx-probe.mjs documents on tickFx itself.
//
// ⚠ AND THE CONTRAST QUESTION IS THE POINT. The chips are baked out of SPUR_VIS.tones, i.e. the
// chapter's OWN coral palette, against a wall drawn from the same six colours. That is the honest
// choice (what flies off the wall is the wall) and it is exactly the choice that can vanish — read
// these frames for whether the burst separates from what it is standing on, not for whether it
// exists.

H.tick()
const CFG = window.__cfg
const spec = CFG?.CHAPTERS?.reef?.cave || null
const LAP = spec?.lapLen ?? 5040
const R0 = spec?.ring?.r0 ?? 1820

// Drop the player onto the track at f, `into` px past the OUTER face (decreasing u, which is the
// side away from the loop's hub). stepCaveWall reads the overshoot as (inward px/s x dt), so a
// teleport of `into` px is a crash of `into * 60` px/s — well past circuit.crashSpeed at any value
// worth shooting, and the only way to stage one without driving a whole approach.
const put = (f, into) => {
  const cav = CFG.caveAt(f, spec, run._obstacleSeed)
  const u = cav.c - (cav.hw - 22) - into
  const t = (2 * Math.PI * f) / LAP
  const r = R0 - u
  run.player.x = r * Math.cos(t) - R0
  run.player.y = r * Math.sin(t)
  run._ringRaw = undefined
  run._laneSpeed = 540
}

const F = 1500
H.note(JSON.stringify({
  chapter: run.chapter,
  crashSpeed: CFG?.circuitKnob?.(CFG.CHAPTERS.reef, 'crashSpeed'),
  crashKick: CFG?.circuitKnob?.(CFG.CHAPTERS.reef, 'crashKick'),
  r0: R0,
}))

let frame = 0
return () => {
  if (!spec) { H.render(); return }
  if (frame === 0) {
    put(F, 26)                       // 1560px/s inward — an unambiguous stuff
    H.tickFx()
  } else if (frame === 1 || frame === 2) {
    H.tickFx(); H.tickFx(); H.tickFx()
  } else if (frame === 3) {
    // THE SCRAPE, which is not an event at all: run._caveHit is a per-frame flag and render.js
    // reads it directly. Held ON the face rather than driven through it, so the crash cannot fire
    // and what is on screen is only the grit.
    put(F + 900, 3)
    for (let i = 0; i < 4; i++) { put(F + 900, 3); H.tickFx() }
  } else if (frame === 4) {
    for (let i = 0; i < 18; i++) { put(F + 900, 3); H.tickFx() }
  } else {
    // THE BUMP. A real spawned body walked onto the player — run SQ confines enemies.push to
    // spawnEnemy, and a literal here would be a second kind of fish.
    put(F + 1800, -60)               // safely inside the passage: no coral contact to confuse it
    H.until(() => run.enemies.some((e) => !e._dead), 900)
    put(F + 1800, -60)               // ...the wait drove the player; put them back
    const fish = run.enemies.find((e) => !e._dead)
    if (fish) {
      fish._bumpAt = -999
      fish.x = run.player.x + 20
      fish.y = run.player.y + 20
      // ...and let the ring GROW. spawnRing starts at radius 0, so the frame the event lands on is
      // a dot — the same reason frame 0 of the crash reads faint and frame 1 does not.
      for (let i = 0; i < 4; i++) H.tickFx()
    } else {
      H.note('no fish to bump')
      H.render()
    }
  }
  frame++
  H.render()
}
