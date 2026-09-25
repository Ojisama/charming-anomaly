// Scene: PLAIN SLAMS IN REAL PLAY, recorded at 20fps, for judging "when do I press" and "did the
// parry land". A bot plays The Kraken the way kraken-live.js does, stands on the line of the next
// plain slam coming at it, and answers it according to ?sm= on the url:
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-slam.js --chapter kraken --difficulty 3 \
//        --url 'http://127.0.0.1:PORT/?sm=parry' --frames 90 --out /tmp/ks/parry
//
//   sm=parry  presses KS_REACT seconds after the window opens (a human's reaction, not frame one)
//   sm=early  presses KS_EARLY seconds BEFORE the window opens
//   sm=none   never presses
//
// Nothing is painted into the page (no H.note): the frames go to a blind critic, so the only text in
// them is the game's own. Diagnostics go to the console, which fx-probe echoes.
const MODE = new URLSearchParams(location.search).get('sm') || 'parry'
const KS_REACT = 0.07
const KS_EARLY = 0.2
const BEATS = 3   // 1/60s steps per captured frame -> 20fps

H.until(() => run.script.phase === 'boss' && run.krakenArms.length > 0, 8000)
run.krakenLesson = 0   // the first-parry lesson slows the first window; this records the fight after it
const rung = window.__cfg.krakenRung(run.difficulty)
const C = window.__cfg
const reachW = C.KRAKEN_LASH_W * 0.8
const plain = (a) => !a.dead && !a.grabArm && !a.coilArm && a.limpT <= 0 && a.gripT <= 0 && a.tele > 0

let target = null
let played = 0
function closest(a, p) {
  const dx = a.lx1 - a.lx0, dy = a.ly1 - a.ly0, l2 = dx * dx + dy * dy || 1
  const t = Math.max(0.35, Math.min(0.85, ((p.x - a.lx0) * dx + (p.y - a.ly0) * dy) / l2))
  return { x: a.lx0 + dx * t, y: a.ly0 + dy * t }
}
function beat() {
  const p = run.player
  if (!target || !plain(target)) {
    target = null
    // the freshest plain slam whose struck line the fish can reach before its window opens
    let bt = -1
    for (const a of run.krakenArms) {
      if (!plain(a) || a.tele < rung.window + 0.6) continue
      const q = closest(a, p)
      if (Math.hypot(q.x - p.x, q.y - p.y) > 260) continue
      if (a.tele > bt) { bt = a.tele; target = a }
    }
  }
  let ix = 0, iy = 0
  // stand ON the struck line of the slam being answered; step off any grab's line
  if (target) {
    const q = closest(target, p)
    const dx = q.x - p.x, dy = q.y - p.y, dl = Math.hypot(dx, dy)
    if (dl > reachW * 0.5) { ix = dx / dl * 0.85; iy = dy / dl * 0.85 }
  }
  let press = false
  if (target && (run.repulseCd ?? 0) <= 0) {
    const w = rung.window
    if (MODE === 'parry' && target.tele <= w - KS_REACT) press = true
    if (MODE === 'early' && target.tele <= w + KS_EARLY && target.tele > w) press = true
  }
  const g = run.krakenArms.find((a) => !a.dead && a.gripT > 0)
  if (g) { g._botA = (g._botA ?? 0) + Math.PI * 2 / 60; ix = Math.cos(g._botA); iy = Math.sin(g._botA) }
  run.player.hp = run.player.maxHP
  step(run, { x: ix, y: iy, skill: press }, 1 / 60)
  const events = run.events.splice(0)
  for (const e of events) if (/^(parry|parryPerfect|parryWhiff|parryEarly|slamWindow|lash)$/.test(e.type)) console.error('EV', 'frame', frameNo + 1, (played / 60).toFixed(2), e.type)
  window.__renderer.sync(run, 1 / 60, events)
  if (run.phase === 'levelup') run.phase = 'playing'
  played++
}
let started = false
let frameNo = -1   // the index fx-probe will write this call's frame under
return () => {
  if (!started) {
    // warm up, then start recording as a plain slam begins rearing near the fish
    let guard = 0
    while (played < 8 * 60 && guard++ < 60 * 60) beat()
    guard = 0
    while (guard++ < 60 * 60) {
      beat()
      if (target && target.tele > rung.window + 0.55 && target.tele < rung.window + 0.75) {
        const q = closest(target, run.player)
        if (Math.hypot(q.x - run.player.x, q.y - run.player.y) < reachW) break
      }
    }
    started = true
  } else for (let i = 0; i < BEATS; i++) beat()
  frameNo++
  app.renderer.render(app.stage)
}
