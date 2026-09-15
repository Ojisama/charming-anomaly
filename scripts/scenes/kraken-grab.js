// Scene: A WHOLE GRAB, FROM REACH TO RETRACT, at fixed offsets from the latch frame.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-grab.js --out /tmp/kgr \
//        --chapter kraken --difficulty 3 --frames 10
//
// kraken-grip.js captures at points of the HOLD, which was the right question while the grip was a
// pose. It cannot see an action: the extend is K_GRIP_EXTEND_T and the retract K_GRIP_RETRACT_T,
// both under half a second, and both are render-side easing that a state-gated scene lands on by
// luck. Owner, 2026-09-15: "there should be an animation of the tentacle extending to grab you and
// retracting when you free yourself."
//
// Every frame here is a fixed number of SIM FRAMES after the latch, so the same beats come back
// every run and the sequence can be read as a strip:
//   the reach leaving the ring, the tip arriving, the coil winding on, the hold,
//   then the stick goes in and the limb unwinds and straightens back out.
const AT = [2, 8, 14, 20, 30, 46, 54, 62, 72, 84]  // sim frames after the latch
const WIGGLE_FROM = 46                              // ...and when the bot starts fighting it
// MAGNIFY THE CANVAS BEFORE CAPTURING. Owner, 2026-09-15: "zoom further you would see that's just
// plain wrong" -- and he was right, because a grip is ~130 world px on a 390px phone and judging it
// from a whole-screen frame is judging a thumbnail. The fight's own camera cannot be pushed in (it
// is clamped to 1 and sized off the arena), so this scales the STAGE about the screen centre, which
// is where the renderer has already put the player. Everything the canvas draws grows with it, so
// what comes back is the real geometry at a size defects cannot hide at.
const ZOOM = 3.4

H.until(() => run.script.phase === "boss" && run.krakenArms.length > 0, 8000)

const cfg = window.__cfg
const rung = cfg.krakenRung(run.difficulty)
const head = () => run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead) || null
const gripping = () => run.krakenArms.find((a) => !a.dead && a.gripT > 0) || null

let since = -1        // sim frames since the latch, -1 until one happens
let wig = 0

function beat() {
  const p = run.player
  const h = head()
  let ix = 0, iy = 0
  if (since >= WIGGLE_FROM) {
    // SWINGING THE STICK, at about 8 flicks a second — fast enough to tear loose inside the frame
    // budget. stickFlicks measures the ANGLE the stick sweeps, so this is what it can see.
    wig += Math.PI * 4 / 60
    ix = Math.cos(wig); iy = Math.sin(wig)
  } else if (h && since < 0) {
    // before the grab, hold station near the head so the limb has somewhere to reach FROM
    const d = Math.hypot(p.x - h.x, p.y - h.y) || 1
    if (d > cfg.KRAKEN_ARM_REACH * 0.9) { ix = (h.x - p.x) / d * 0.85; iy = (h.y - p.y) / d * 0.85 }
  }
  run.player.hp = run.player.maxHP
  step(run, { x: ix, y: iy, skill: false }, 1 / 60)
  const events = run.events.splice(0)
  if (since < 0 && events.some((e) => e.type === 'gripLatch')) since = 0
  else if (since >= 0) since++
  window.__renderer.sync(run, 1 / 60, events)
  if (run.phase === 'levelup') run.phase = 'playing'
}

let shot = 0
return (age) => {
  const want = AT[Math.min(AT.length - 1, shot++)]
  let guard = 0
  while (guard++ < 60 * 240 && (since < 0 || since < want)) beat()
  const g = gripping()
  H.note(JSON.stringify({
    sinceLatch: since, want,
    gripT: g ? +g.gripT.toFixed(2) : 0,
    state: g ? 'HELD' : (since >= 0 ? 'let go' : 'no grab yet'),
    at: Math.round(run.time) + 's',
  }))
  if (ZOOM !== 1) {
    app.stage.scale.set(ZOOM)
    app.stage.position.set(app.screen.width / 2 * (1 - ZOOM), app.screen.height / 2 * (1 - ZOOM))
  }
  app.renderer.render(app.stage)
}
