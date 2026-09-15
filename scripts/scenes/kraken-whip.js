// Scene: ONE ARM, ONE STRIKE, CONSECUTIVE FRAMES. The only way to judge whether an attack reads as
// a WHIP rather than a rod pivoting on its shoulder.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-whip.js --out /tmp/kw \
//        --chapter kraken --difficulty 3 --frames 8
//
// kraken-beats.js gates each frame on a STATE, so two of its frames are never two consecutive
// moments — it answers "what does a slam look like", never "what does the swing look like". A whip
// is entirely a question about consecutive frames: the shape of any single one of them is not the
// point, the travel of the bend from shoulder to tip across them is. Stills of the same limb one
// frame apart are the evidence; stack them with ffmpeg to watch it.
//
// It plays the real fight until a chosen arm is most of the way through its fuse, then steps
// STRIDE frames between captures so the whole wind-up, the strike and the follow-through fall
// inside the frame budget. The bot does not parry that arm — a parried strike never happens, which
// is the one outcome this scene must not produce.
const STRIDE = 5           // sim frames between captures; the slam's follow-through is KRAKEN_SLAM_T
const START_AT = 0.45      // fraction of the fuse burnt before the first capture

H.until(() => run.script.phase === "boss" && run.krakenArms.length > 0, 8000)

const cfg = window.__cfg
const rung = cfg.krakenRung(run.difficulty)
const head = () => run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead) || null
const wind = (a) => (a.tele > 0 && a.fuse ? 1 - a.tele / a.fuse : -1)
// the subject is pinned by IDENTITY, never by array position: a rearing arm that finishes and a
// different one starting would otherwise look like one continuous swing that never happened.
let subject = null

function beat(press) {
  const p = run.player
  const h = head()
  let ix = 0, iy = 0
  // stand still and close, so the limb fills the frame and nothing about the picture is the bot
  // walking. The rig is a camera stand here, not a player.
  if (h) {
    const d = Math.hypot(p.x - h.x, p.y - h.y) || 1
    if (d > cfg.KRAKEN_ARM_REACH * 0.9) { ix = (h.x - p.x) / d * 0.85; iy = (h.y - p.y) / d * 0.85 }
  }
  run.player.hp = run.player.maxHP
  step(run, { x: ix, y: iy, skill: !!press }, 1 / 60)
  const events = run.events.splice(0)
  window.__renderer.sync(run, 1 / 60, events)
  if (run.phase === 'levelup') run.phase = 'playing'
}

let armed = false
return (age) => {
  if (!armed) {
    // play on until some arm is START_AT through its fuse, and adopt it
    let guard = 0
    while (guard++ < 60 * 200) {
      const c = run.krakenArms.find((a) => !a.dead && wind(a) >= START_AT && wind(a) <= START_AT + 0.12)
      if (c) { subject = c; armed = true; break }
      beat(false)
    }
  } else {
    for (let i = 0; i < STRIDE; i++) beat(false)
  }
  const a = subject
  H.note(JSON.stringify({
    arm: a ? a.i : 'NONE ADOPTED',
    windup: a ? +wind(a).toFixed(2) : -1,
    tele: a ? +a.tele.toFixed(3) : -1,
    slamT: a ? +(a.slamT ?? 0).toFixed(3) : -1,
    limp: a ? +(a.limpT ?? 0).toFixed(2) : -1,
    at: Math.round(run.time) + 's',
  }))
  app.renderer.render(app.stage)
}
