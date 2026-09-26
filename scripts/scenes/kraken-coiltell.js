// Scene: ONE COIL'S WIND-UP, in real play. The kraken-states bot plays d3 until a Coil winds up;
// frame i is taken as run.script.coilT crosses COIL_AT[i] (KRAKEN_COIL_TELE + DUR down to DUR).
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-coiltell.js --out /tmp/kct \
//        --chapter kraken --difficulty 3 --frames 3
const COIL_AT = [2.2, 1.6, 1.0]
H.until(() => run.script.phase === "boss" && run.krakenArms.length > 0, 8000)

const rung = window.__cfg.krakenRung(run.difficulty)
const head = () => run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead) || null

// One frame of play: pick a move, decide whether to press, step, render.
function beat() {
  const p = run.player
  const h = head()
  // REV 3'S ACTUAL LOOP: go and stand on whatever limb your last parry opened, because that is
  // where your weapons do their work. Nothing else in the fight rewards position.
  let ix = 0, iy = 0
  let tx = p.x, ty = p.y
  const limp = run.krakenArms.filter((a) => !a.dead && a.limpT > 0)
  const winding = run.krakenArms.filter((a) => !a.dead && a.limpT <= 0 && (a.tele > 0 || a.gripT > 0))
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
  // The parry has a RANGE. A rig that presses at anything in window regardless of distance just
  // whiffs, produces fewer limp arms than the fight really has, and then the frames used to judge
  // the wound are of a fight that was not being played properly. Mirrors krakenParry.
  const reach2 = (window.__cfg.KRAKEN_LASH_R * 1.6) ** 2
  let press = false
  if ((run.repulseCd ?? 0) <= 0) {
    // head first, mirroring krakenParry
    if (h && run.script.phase === 'chase' && !(run.script.staggerT > 0)) {
      const nr = (h.x - p.x) ** 2 + (h.y - p.y) ** 2 <= window.__cfg.KRAKEN_CAGE_R ** 2
      if (false && nr) press = true   // this scene watches the whole lunge: never parried
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
  const events = run.events.splice(0)
  window.__renderer.sync(run, 1 / 60, events)
  if (run.phase === 'levelup') run.phase = 'playing'
}

let shot = 0
return (age) => {
  const want = COIL_AT[Math.min(COIL_AT.length - 1, shot++)]
  let guard = 0
  while (!(run.script.coilT > 0 && run.script.coilT <= want) && guard++ < 60 * 600) beat()
  H.note('coilT ' + (run.script.coilT ?? 0).toFixed(2) + ' @' + Math.round(run.time) + 's')
  app.renderer.render(app.stage)
}
