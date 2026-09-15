// Scene: ONE SLAM, FROM THE FRAME ITS FUSE IS LIT TO THE FRAME IT LANDS.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-arm.js --out /tmp/ka \
//        --chapter kraken --difficulty 3 --frames 8
//
// kraken-beats.js catches STATES — cocked, coming down, landed — which is the right question for
// "what does each beat look like" and the wrong one for "does the wind-up read as a wind-up".
// A telegraph is an ANIMATION: the owner asked for the mark to "grow to show the arm arming the
// slam", and you cannot see growth in frames chosen by state, because every one of them lands at a
// different point in the fuse by luck.
//
// So every frame here is a fixed number of SIM FRAMES after the {type:'armRear'} event, which is
// the exact frame `a.tele` is set. The fuse is `rung.fuse` seconds at 60fps, so the offsets below
// are read as fractions of it and the last one lands on the strike.
//
// ⚠ THE FUSE IS DIFFICULTY-DEPENDENT (2.20 / 1.80 / 1.50s), so the offsets are computed from the
// rung rather than written down: a fixed frame list shot at d3 and read as d1 is off by 40%.
const STOPS = [0.0, 0.14, 0.30, 0.46, 0.60, 0.74, 0.88, 1.0] // fractions of the fuse
const ZOOM = Number(new URLSearchParams(location.search).get('kz') ?? 1)

H.until(() => run.script.phase === "boss" && run.krakenArms.length > 0, 8000)

const cfg = window.__cfg
const rung = cfg.krakenRung(run.difficulty)
const FUSE_FRAMES = Math.round(rung.fuse * 60)

let since = -1 // sim frames since this arm's fuse was lit, -1 until one lights

function beat() {
  // the player holds station near the middle so the corridor crosses them and the mark is judged
  // against something, rather than being drawn in empty water at the arena edge
  run.player.hp = run.player.maxHP
  step(run, { x: 0, y: 0, skill: false }, 1 / 60)
  const events = run.events.splice(0)
  if (since < 0 && events.some((e) => e.type === 'armRear')) since = 0
  else if (since >= 0) since++
  window.__renderer.sync(run, 1 / 60, events)
  if (run.phase === 'levelup') run.phase = 'playing'
}

let shot = 0
return (age) => {
  const want = Math.round(STOPS[Math.min(STOPS.length - 1, shot++)] * FUSE_FRAMES)
  let guard = 0
  while (guard++ < 60 * 240 && (since < 0 || since < want)) beat()
  const armed = run.krakenArms.filter((a) => !a.dead && a.tele > 0)
  H.note(JSON.stringify({
    sinceRear: since, want, fuseFrames: FUSE_FRAMES,
    tele: armed.length ? +armed[0].tele.toFixed(2) : 0,
    through: FUSE_FRAMES ? +(since / FUSE_FRAMES).toFixed(2) : 0,
    armed: armed.length,
  }))
  if (ZOOM !== 1) {
    app.stage.scale.set(ZOOM)
    app.stage.position.set(app.screen.width / 2 * (1 - ZOOM), app.screen.height / 2 * (1 - ZOOM))
  }
  app.renderer.render(app.stage)
}
