// Scene: OPEN GUARD / HAIR TRIGGER in real play — kraken-live.js's bot holding one parry card.
// ?card=openGuard | hairTrigger | none (default none). Frame 0: an arm FLASH_AT s from its strike,
// the bot's press held back that frame, so the flash reads on/off per card on one moment of the
// fight. Frame 1: a few frames after a landed parry (Hair Trigger's hot skin).
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-flash.js --out /tmp/kf --chapter kraken --frames 2 --url 'http://127.0.0.1:PORT/?card=openGuard'
// ponytail: the bot is copied from kraken-live.js (scenes are eval'd bodies and cannot import).

H.until(() => run.script.phase === "boss" && run.krakenArms.length > 0, 8000)

const card = new URLSearchParams(location.search).get('card') || 'none'
run.anomalies = card === 'none' ? {} : { [card]: true }
run.krakenLesson = 0   // the fight, not the parry lesson (its slowed arm and its banner)
const rung = window.__cfg.krakenRungFor(run)
const FLASH_AT = 0.30
const head = () => run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead) || null

// One frame of play: pick a move, decide whether to press, step, render.
function beat(hold = false) {
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
  if (!hold && (run.repulseCd ?? 0) <= 0) {
    // head first, mirroring krakenParry
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
  const events = run.events.splice(0)
  window.__renderer.sync(run, 1 / 60, events)
  if (run.phase === 'levelup') run.phase = 'playing'
  return events
}

let shot = 0
return (age) => {
  let guard = 0
  if (shot++ === 0) {
    // step until a plain slam is about to cross FLASH_AT, then hold the press for the frame shot
    const next = () => run.krakenArms.find((a) => !a.dead && a.limpT <= 0 && !a.grabArm && !a.coilArm && a.tele > FLASH_AT && a.tele - FLASH_AT < 1 / 60)
    while (!next() && guard++ < 60 * 120) beat(true)   // no presses: a parry would end the wind-up before FLASH_AT
    const a = next()
    while (a && a.tele > FLASH_AT && guard++ < 60 * 130) beat(true)
    H.note(JSON.stringify({ card, window: +rung.window.toFixed(2), tele: a ? +a.tele.toFixed(2) : null, inFlash: a ? a.tele <= rung.window : null }))
  } else {
    let hit = false
    while (!hit && guard++ < 60 * 120) hit = beat().some((e) => e.type === 'parry' || e.type === 'parryPerfect')
    for (let i = 0; i < 10; i++) beat()
    H.note(JSON.stringify({ card, parried: hit, boostT: +(run._hairTriggerT ?? 0).toFixed(1) }))
  }
  app.renderer.render(app.stage)
}
