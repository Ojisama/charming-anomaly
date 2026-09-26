// Scene: THE GRIP, ON THE LIVE FIGHT. A bot plays The Kraken for real and frames are captured at
// points in a grip's hold, so the tether can be judged as a BAR — it frays as the hold runs down —
// against everything else that is on screen at the time.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-grip.js --out /tmp/kg \
//        --chapter kraken --difficulty 3 --frames 4
//
// WHY A SCENE OF ITS OWN rather than a moment in kraken-live.js: a grip is 2.2s out of a ~180s
// fight, so the odds of a fixed capture second landing inside one are poor, and the question here is
// specifically whether its NEW tell reads. That tell replaced a ring on the player meaning "press,
// anywhere" — which was the same affordance an arm in its parry window wears, on a thing the button
// no longer answers at all.
//
// THIS BOT DELIBERATELY DOES NOT WIGGLE. Swinging the stick tears you loose in about a second, and
// then there is no hold left to photograph. It walks straight lines, which produce no flicks, and
// so it rides every grip to the bite — the opposite of how the fight should be played and exactly
// what is needed to see the tether at rest, half-gone, and nearly parted.
//
// The bot is a CEILING on player skill on every OTHER axis: it parries every window it is offered.
// That is fine here — the question is what the screen looks like, not whether the fight is hard.
const HELD = [0.95, 0.62, 0.30, 0.08]   // fractions of a grip's hold to capture at; fx-probe cannot pass these in

H.until(() => run.script.phase === "boss" && run.krakenArms.length > 0, 8000)

const cfg = window.__cfg
const rung = cfg.krakenRung(run.difficulty)
const head = () => run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead) || null
const gripping = () => run.krakenArms.find((a) => !a.dead && a.gripT > 0) || null

// One frame of play: pick a move, decide whether to press, step, render.
function beat() {
  const p = run.player
  const h = head()
  let ix = 0, iy = 0
  let tx = p.x, ty = p.y
  const limp = run.krakenArms.filter((a) => !a.dead && a.limpT > 0)
  const winding = run.krakenArms.filter((a) => !a.dead && a.limpT <= 0 && a.tele > 0)
  if (limp.length) {
    let best = limp[0], bd = Infinity
    for (const a of limp) { const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2; if (d < bd) { bd = d; best = a } }
    tx = best.x; ty = best.y
  } else if (winding.length) {
    let best = winding[0], bt = Infinity
    for (const a of winding) { if (a.tele < bt) { bt = a.tele; best = a } }
    tx = best.x; ty = best.y
  } else if (h) {
    const ang = Math.atan2(p.y - h.y, p.x - h.x)
    tx = h.x + Math.cos(ang) * cfg.KRAKEN_ARM_REACH * 1.2
    ty = h.y + Math.sin(ang) * cfg.KRAKEN_ARM_REACH * 1.2
  }
  {
    const dx = tx - p.x, dy = ty - p.y, dl = Math.hypot(dx, dy)
    if (dl > 6) { ix = dx / dl * 0.85; iy = dy / dl * 0.85 }
  }
  const reach2 = (cfg.KRAKEN_LASH_R * 1.6) ** 2
  let press = false
  if ((run.repulseCd ?? 0) <= 0) {
    if (h && run.script.phase === 'chase' && !(run.script.staggerT > 0)) {
      const nr = (h.x - p.x) ** 2 + (h.y - p.y) ** 2 <= cfg.KRAKEN_CAGE_R ** 2
      if (nr && (h.dashWin ?? 0) > 0) press = true   // the dash, by distance (head.dashWin)
    }
    if (!press) for (const a of run.krakenArms) {
      if (a.dead || a.limpT > 0 || a.gripT > 0) continue
      if ((a.x - p.x) ** 2 + (a.y - p.y) ** 2 > reach2) continue
      if (a.tele > 0 && a.tele <= rung.window) { press = true; break }
    }
  }
  run.player.hp = run.player.maxHP        // the question is the picture, not survival
  step(run, { x: ix, y: iy, skill: press }, 1 / 60)
  const events = run.events.splice(0)
  window.__renderer.sync(run, 1 / 60, events)
  if (run.phase === 'levelup') run.phase = 'playing'
}

let shot = 0
return (age) => {
  const want = HELD[Math.min(HELD.length - 1, shot++)]
  // Play on until a grip is held and has run down to the fraction this frame wants. The guard is
  // generous: grips arrive every KRAKEN_GRIP_EVERY-th arm turn, so a wait of a few seconds is normal
  // and a wait of 200s means the block ended and there is nothing to photograph.
  let guard = 0
  while (guard++ < 60 * 200) {
    const g = gripping()
    if (g && g.gripT / cfg.KRAKEN_GRIP_DUR <= want) break
    beat()
  }
  const g = gripping()
  H.note(JSON.stringify({
    held: g ? +(g.gripT / cfg.KRAKEN_GRIP_DUR).toFixed(2) : 'NO GRIP IN FRAME',
    want, at: Math.round(run.time) + 's', phase: run.script.phase,
    limp: run.krakenArms.filter((a) => a.limpT > 0 && !a.dead).length,
    rearing: run.krakenArms.filter((a) => !a.dead && a.tele > 0).length,
    broken: run.krakenArms.filter((a) => a.dead).length,
    of: run.krakenArms.length,
    adds: run.enemies.filter((e) => !e._dead && e.rosterId !== 'krakenHead').length,
    cd: +(run.repulseCd ?? 0).toFixed(2),
    light: Math.round(run.charge),
    // HOW LONG THE TETHER ACTUALLY IS, in world px and as a fraction of the arena. Read off the
    // picture alone this line is indistinguishable from an arm's wind-up telegraph, which is also a
    // long pale stroke across the screen — and mistaking one for the other has already cost a round
    // on this boss. A grip picks ANY idle arm, never the nearest, so this can be the width of the cage.
    tether: g ? Math.round(Math.hypot(g.x - run.player.x, g.y - run.player.y)) : -1,
    cage: cfg.KRAKEN_CAGE_R,
  }))
  app.renderer.render(app.stage)
}
