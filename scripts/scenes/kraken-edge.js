// Scene: STANDING ON THE CAGE WALL, LOOKING OUT. The one place the arms' SHOULDERS come into frame.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-edge.js --out /tmp/ke \
//        --chapter kraken --difficulty 3 --frames 4
//
// Every other Kraken scene keeps the player near the head, because that is where the fight is. The
// arms are drawn from a shoulder out at KRAKEN_RING_R and the camera is centred on the PLAYER, so
// walking to the cage wall (KRAKEN_CAGE_R) closes the gap to the shoulder on that side by the full
// cage radius — and whatever the base of a tentacle looks like, that is when you see it.
// Owner, 2026-09-15: "you can move to the edge of the boss arena and see the cut at the base of the
// tentacle, it's unprofessional."
//
// Four bearings, because which arm you end up looking at depends on where you stand and the ring is
// not symmetric about the player. The note prints the distance from the player to the NEAREST
// shoulder in world px beside the viewport's own half-width, so "is it in frame" is a number rather
// than a judgement about a picture.
const BEARINGS = [0, Math.PI / 2, Math.PI, -Math.PI / 2]

H.until(() => run.script.phase === "boss" && run.krakenArms.length > 0, 8000)

const cfg = window.__cfg
const head = () => run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead) || null

function beat(ix, iy) {
  run.player.hp = run.player.maxHP
  step(run, { x: ix, y: iy, skill: false }, 1 / 60)
  const events = run.events.splice(0)
  window.__renderer.sync(run, 1 / 60, events)
  if (run.phase === 'levelup') run.phase = 'playing'
}

let shot = 0
return (age) => {
  const ang = BEARINGS[Math.min(BEARINGS.length - 1, shot++)]
  // push hard at the wall for long enough to be pinned against it, whatever the cage is doing
  for (let i = 0; i < 150; i++) beat(Math.cos(ang), Math.sin(ang))
  const h = head()
  const p = run.player
  let near = Infinity, nearArm = -1
  for (const a of run.krakenArms) {
    if (a.dead) continue
    // the SHOULDER, built the way syncKrakenArms builds it: out along the arm's own bearing at
    // whichever is further, the extended ring or 560 past its tip. ⚠ this mirrors render.js by
    // hand, so it is a second author of one number — if the drawn shoulder moves, move it here too
    // or the note reports a distance to a place nothing is drawn.
    const tipR = Math.hypot(a.x - h.x, a.y - h.y) || cfg.KRAKEN_ARM_REACH
    const sr = Math.max(cfg.KRAKEN_RING_R + 360, tipR + 560)
    const sx = h.x + Math.cos(a.ang) * sr, sy = h.y + Math.sin(a.ang) * sr
    const d = Math.hypot(sx - p.x, sy - p.y)
    if (d < near) { near = d; nearArm = a.i }
  }
  H.note(JSON.stringify({
    bearing: Math.round(ang * 180 / Math.PI) + 'deg',
    fromHead: Math.round(Math.hypot(p.x - h.x, p.y - h.y)),
    cage: Math.round(run.script.cageR > 0 ? run.script.cageR : cfg.KRAKEN_CAGE_R),
    nearestShoulder: Math.round(near), arm: nearArm,
    // the viewport in WORLD px, which is what decides whether that shoulder is on screen at all
    halfW: Math.round(window.innerWidth / 2 / (window.__renderer.zoom?.() ?? 1)),
    at: Math.round(run.time) + 's',
  }))
  app.renderer.render(app.stage)
}
