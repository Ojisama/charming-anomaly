// Scene: THE APPROACH AND THE ARRIVAL — the first forty seconds of The Kraken, which until
// 2026-09-14 did not exist. The chapter opened with one wave and then stood a whole boss arena up
// on a single frame, 100px from the player; the owner's read was "currently you are 'teleported' to
// the boss, thats weird and confusing".
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-approach.js --out /tmp/ka \
//        --chapter kraken --difficulty 3 --frames 6
//
// Six frames, and every one of them is picked by STATE rather than by a clock, because the approach
// has no fixed length: a wave ends when it is dead or when it times out. They are, in order: the
// graveyard crowd (which is also the frame that answers "are the base enemies visible enough on the
// background"), the last frame before the ring starts moving, three across the closing ring, and the
// first ring block. Requires --frames 6.
//
// The bot walks at the nearest dead thing and never presses: the approach has nothing to parry.
const MARKS = [
  ['crowd',      () => played > 60 * 7],
  ['pre-arrive', () => run.script.phase === 'arrive'],
  ['closing-30', () => arriveK() >= 0.30],
  ['closing-65', () => arriveK() >= 0.65],
  ['closing-95', () => arriveK() >= 0.95],
  ['block',      () => run.script.phase === 'boss' && blockFrames > 60 * 2.5],
]

function arriveK() {
  const s = run.script
  if (s.phase !== 'arrive') return s.phase === 'boss' ? 1 : 0
  return s.arriveMax > 0 ? 1 - s.arriveT / s.arriveMax : 1
}

let played = 0
let blockFrames = 0

function beat() {
  const p = run.player
  let ix = 0, iy = 0
  // walk at the nearest graveyard dead so the waves actually clear; during the arrival there is
  // nothing left to walk at and the bot simply drifts, which is what a player does here too
  let best = null, bd = Infinity
  for (const e of run.enemies) {
    if (e._dead || e.rosterId === 'krakenHead' || e.rosterId === 'krakenArm') continue
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
    if (d < bd) { bd = d; best = e }
  }
  if (best && bd > 70 * 70) {
    const dx = best.x - p.x, dy = best.y - p.y, dl = Math.hypot(dx, dy) || 1
    ix = dx / dl * 0.85; iy = dy / dl * 0.85
  }
  run.player.hp = run.player.maxHP        // the question is the picture, not survival
  step(run, { x: ix, y: iy, skill: false }, 1 / 60)
  window.__renderer.sync(run, 1 / 60, run.events.splice(0))
  if (run.phase === 'levelup') run.phase = 'playing'
  played++
  if (run.script.phase === 'boss') blockFrames++
}

let mark = 0
return (age) => {
  const want = Math.min(MARKS.length - 1, Math.round(age * (MARKS.length - 1)))
  let guard = 0
  while (mark <= want && guard++ < 60 * 200) {
    if (MARKS[mark][1]()) { mark++; continue }
    beat()
  }
  H.note(JSON.stringify({
    mark: MARKS[Math.min(MARKS.length - 1, want)][0],
    at: (played / 60).toFixed(1) + 's',
    phase: run.script.phase,
    openW: run.script.openW,
    arrive: arriveK().toFixed(2),
    reach: run.krakenArms.length
      ? Math.round(Math.hypot(run.krakenArms[0].x - (run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead)?.x ?? 0),
                              run.krakenArms[0].y - (run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead)?.y ?? 0)))
      : -1,
    adds: run.enemies.filter((e) => !e._dead && e.rosterId !== 'krakenHead' && e.rosterId !== 'krakenArm').length,
  }))
  app.renderer.render(app.stage)
}
