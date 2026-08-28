// Scene: The Reef's CUT-BACK — what "your shortcut was refused" puts on screen (v7.x).
// Runs in the page with (run, app, step, H) in scope; see fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-cutback.js --out /tmp/cutback \
//     --chapter reef --frames 5 --w 390 --h 844 --url http://127.0.0.1:PORT/
//
// FIVE FRAMES at 0 / 0.05 / 0.10 / 0.15 / 0.20s after the player is put back, which brackets the
// CUT_IN the render case converges its motes over. Shooting them a frame apart is useless: the
// ring starts at radius 0 and the pulse has not moved, so every frame looks like the last.
// The question these answer is NOT "does something draw" — it is whether the frame reads as a
// REFUSAL rather than as an impact. The crash case two doors up throws coral chips outward from a
// collision; this event is the opposite (nothing struck the player, a gain was taken away), so the
// rings shrink and the particles fall inward. If these frames look like the crash, the tell is
// wrong even though it is present.
//
// ⚠ H.tickFx, NEVER H.tick. `cutback` is an EVENT — handleEvents is the only thing that spawns its
// rings and particles, and H.tick drops the frame's events on the floor. A scene built on tick()
// shoots an empty frame with no error, which is indistinguishable from an effect that does not
// draw at all. Same trap reef-impact.js documents.
//
// ⚠ AND THE PLAYER HAS TO BE MOVING UNDER THEIR OWN MOMENTUM. There is no stick in a headless
// page, so `getInput()` returns (0,0) forever; a circuit builds its velocity from run._headX/_headY
// x run._laneSpeed, both of which persist, so the scene sets them by hand. Without that the player
// sits in the coral and never reaches the gate, and the shot is of a mechanic that never fired.

H.tick()
const CFG = window.__cfg
const spec = CFG?.CHAPTERS?.reef?.cave || null
const LAP = spec?.lapLen ?? 5040
const R0 = spec?.ring?.r0 ?? 1820

const XY = (f, u) => {
  const t = (2 * Math.PI * f) / LAP
  const r = R0 - u
  return { x: r * Math.cos(t) - R0, y: r * Math.sin(t) }
}
// Drop the player at f, `out` px past the passage's INNER face (out 0 = on the centreline), and
// point their momentum down the track. The unwrapped angle travels with the position or the very
// next frame reads the teleport as most of a lap.
const put = (f, out) => {
  const cav = CFG.caveAt(((f % LAP) + LAP) % LAP, spec, run._obstacleSeed)
  const w = XY(f, out > 0 ? cav.c + cav.hw + out : cav.c)
  run.player.x = w.x
  run.player.y = w.y
  run._ringT = (2 * Math.PI * f) / LAP
  run._ringRaw = Math.atan2(w.y, w.x + R0)
  const ahead = XY(f + 60, out > 0 ? cav.c + cav.hw + out : cav.c)
  const dx = ahead.x - w.x, dy = ahead.y - w.y
  const d = Math.hypot(dx, dy) || 1
  run._headX = dx / d
  run._headY = dy / d
  run._laneSpeed = 540
}

const gates = spec ? CFG.swimthroughsFor(spec, run._obstacleSeed).map((s) => s.f) : []
const G = gates[2] ?? 1500

let frame = 0
let fired = false
return () => {
  if (!spec) { H.render(); return }
  if (frame === 0) {
    // On the road first, for three frames: that is what writes the snapshot the rollback returns
    // to, and without it the guard in stepCircuit declines to fire at all.
    put(G - 200, 0)
    for (let i = 0; i < 3; i++) { H.tickFx() }
    // ...then out into the coral with the dash live, and drive until the gate is crossed.
    run._burstT = 5
    const cav = CFG.caveAt(G - 200, spec, run._obstacleSeed)
    const w = XY(G - 200, cav.c + cav.hw + 150)
    run.player.x = w.x
    run.player.y = w.y
    // tickFx RETURNS the frame's events (it splices them out to hand to the renderer), so this is
    // the only place the cut-back can be seen — reading run.events afterwards finds an empty array
    // and the loop would run past the effect it came to shoot.
    for (let i = 0; i < 240 && !fired; i++) {
      fired = H.tickFx().some((e) => e.type === 'cutback')
    }
    H.note(JSON.stringify({ chapter: run.chapter, gate: Math.round(G), fired, burstT: run._burstT }))
  } else {
    // Let the ring grow and the inbound motes converge. spawnRing starts at radius 0, so the
    // landing frame is a dot and the shape only exists a few frames later.
    H.tickFx(); H.tickFx(); H.tickFx()
  }
  frame++
  H.render()
}
