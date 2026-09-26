// Scene: THE SIX BEATS OF THE KRAKEN, each caught the frame the fight reaches it.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-beats.js --out /tmp/kb \
//        --chapter kraken --difficulty 3 --frames 6
//
// kraken-live.js shoots the fight at fixed SECONDS, which answers "what does the screen look like
// over time" and is the right question for a whole-picture read. It cannot answer "what does one
// attack look like": a wind-up is under a second long, a slam's follow-through is 0.3s, and a fixed
// clock lands on them by luck. Every frame here is gated on the STATE it is meant to show, so the
// same six beats come back every run:
//
//   0  an arm at the top of its rear — hauled back, cocked, shadow at its furthest
//   1  the same arm COMING DOWN, inside the parry window
//   2  a slam that landed, the limb still planted in its print
//   3  a limb parried open — the tear
//   4  the chase with the head SEALED, taking hits it refuses
//   5  the stagger: the one window on the head
//
// A beat the fight never reaches inside the guard falls through to the last state played, and the
// note says which mark it was actually on — so a frame is never silently of something else.
// Requires --frames 6. The bot is a CEILING on player skill, not a model of one.
const rung = window.__cfg.krakenRung(run.difficulty)
const head = () => run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead) || null
const live = () => run.krakenArms.filter((a) => !a.dead)
const wind = (a) => (a.tele > 0 && a.fuse ? 1 - a.tele / a.fuse : -1)

const headNear = (d) => { const h = head(); return !!h && (h.x - run.player.x) ** 2 + (h.y - run.player.y) ** 2 < d * d }
const near = (a) => (a.x - run.player.x) ** 2 + (a.y - run.player.y) ** 2 < (window.__cfg.KRAKEN_LASH_R * 1.25) ** 2
const MARKS = [
  ['rear',    () => live().some((a) => near(a) && wind(a) >= 0.5 && wind(a) <= 0.70)],
  ['falling', () => live().some((a) => near(a) && a.tele > 0 && a.tele <= rung.window)],
  ['slam',    () => live().some((a) => near(a) && a.slamT > window.__cfg.KRAKEN_SLAM_T * 0.55)],
  ['torn',    () => live().some((a) => a.limpT > 0 && a.limpT < (rung.limp - 0.35))],
  ['sealed',  () => run.script.phase === 'chase' && !(run.script.staggerT > 0) && run.script.riseT <= 0 && headNear(190)],
  ['stagger', () => run.script.staggerT > 0 && headNear(260)],
]

H.until(() => run.script.phase === 'boss' && run.krakenArms.length > 0, 8000)

// The bot. Same policy as kraken-live: stand on whatever limb the last parry opened, press on a
// window — except that it lets the FIRST two marks happen by not parrying until they have been
// caught, because a rig that parries every window never lets a slam land and mark 2 would never
// come round. It is honest about that: `holding` is in the note.
let mark = 0
let played = 0
function beat() {
  const p = run.player
  const h = head()
  let ix = 0, iy = 0
  let tx = p.x, ty = p.y
  const limp = live().filter((a) => a.limpT > 0)
  const winding = live().filter((a) => a.limpT <= 0 && (a.tele > 0 || a.gripT > 0))
  if (limp.length) {
    let best = limp[0], bd = Infinity
    for (const a of limp) { const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2; if (d < bd) { bd = d; best = a } }
    tx = best.x; ty = best.y
  } else if (winding.length) {
    let best = winding[0], bt = Infinity
    for (const a of winding) { const t = a.gripT > 0 ? -1 : a.tele; if (t < bt) { bt = t; best = a } }
    tx = best.x; ty = best.y
  } else if (h) {
    const ang = Math.atan2(p.y - h.y, p.x - h.x)
    tx = h.x + Math.cos(ang) * window.__cfg.KRAKEN_ARM_REACH * 1.2
    ty = h.y + Math.sin(ang) * window.__cfg.KRAKEN_ARM_REACH * 1.2
  }
  {
    const dx = tx - p.x, dy = ty - p.y, dl = Math.hypot(dx, dy)
    if (dl > 6) { ix = dx / dl * 0.85; iy = dy / dl * 0.85 }
  }
  const reach2 = (window.__cfg.KRAKEN_LASH_R * 1.6) ** 2
  let press = false
  const holding = mark <= 2       // let the first slam land, so mark 2 exists at all
  if (!holding && (run.repulseCd ?? 0) <= 0) {
    if (h && run.script.phase === 'chase' && !(run.script.staggerT > 0)) {
      const nr = (h.x - p.x) ** 2 + (h.y - p.y) ** 2 <= window.__cfg.KRAKEN_CAGE_R ** 2
      if (nr && (h.dashWin ?? 0) > 0) press = true   // the dash, by distance (head.dashWin)
    }
    if (!press) for (const a of run.krakenArms) {
      if (a.dead || a.limpT > 0) continue
      if ((a.x - p.x) ** 2 + (a.y - p.y) ** 2 > reach2) continue
      if (a.tele > 0 && a.tele <= rung.window) { press = true; break }
    }
  }
  // HELD BY A GRIP: it is not parryable, it is WIGGLED out of, so the bot swings the stick — which
  // is the only thing stickFlicks can see. One full turn a second is ~4 flicks/s, a rate a thumb can
  // hold, and it clears a KRAKEN_GRIP_FLICKS grip in about a second of its 2.2s.
  {
    const g = run.krakenArms.find((a) => !a.dead && a.gripT > 0)
    if (g) { g._botA = (g._botA ?? 0) + Math.PI * 2 / 60; ix = Math.cos(g._botA); iy = Math.sin(g._botA) }
  }
  run.player.hp = run.player.maxHP        // the question is the picture, not survival
  step(run, { x: ix, y: iy, skill: press }, 1 / 60)
  window.__renderer.sync(run, 1 / 60, run.events.splice(0))
  if (run.phase === 'levelup') run.phase = 'playing'
  played++
}

return (age) => {
  const want = Math.min(MARKS.length - 1, Math.round(age * (MARKS.length - 1)))
  let guard = 0
  let reached = true
  while (mark <= want) {
    if (MARKS[mark][1]()) { mark++; continue }
    if (guard++ >= 60 * 400) { reached = false; break }
    beat()
  }
  const a0 = live().find((a) => a.tele > 0) || live().find((a) => a.limpT > 0) || live()[0] || null
  H.note(JSON.stringify({
    want: MARKS[want][0], reached,
    at: (played / 60).toFixed(1) + 's', phase: run.script.phase,
    wind: a0 ? wind(a0).toFixed(2) : 'n/a',
    slamT: a0 ? (a0.slamT ?? 0).toFixed(2) : 'n/a',
    limp: live().filter((a) => a.limpT > 0).length,
    broken: run.krakenArms.filter((a) => a.dead).length + '/' + run.krakenArms.length,
    headD: (() => { const h = head(); return h ? Math.round(Math.hypot(h.x - run.player.x, h.y - run.player.y)) : -1 })(),
    stagger: run.script.stagger + '/' + rung.staggerNeed,
    staggerT: (run.script.staggerT ?? 0).toFixed(1),
  }))
  app.renderer.render(app.stage)
}
