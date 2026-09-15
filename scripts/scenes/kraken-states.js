// Scene: THE FIGHT AS IT ACTUALLY HAPPENS. A bot plays The Kraken — moves, parries on the window,
// takes the hits — and frames are captured at natural moments, with nothing hand-set.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-live.js --out /tmp/kl \
//        --chapter kraken --difficulty 3 --frames 6
//
// THIS EXISTS BECAUSE THE SCENES IT REPLACED LIED BY CONSTRUCTION. kraken-ring.js and
// kraken-parry.js assigned arm state directly to stage five cases side by side,
// which is the right tool for judging one bake against another and the WRONG one for judging
// whether the screen is readable: it produces a frame that never occurs in play, at a moment the
// fight never reaches, with none of the weapons, adds, crusts or damage numbers that are actually
// on screen. v7.330 shipped four "fixed" reads verified that way and the owner's first phone
// capture of the real thing was unreadable — a purple wash under a flower of barnacles, with none
// of the four tells visible in it. A staged frame cannot show you what the picture as a whole is
// doing, and the picture as a whole is the thing being judged.
//
// The bot is a CEILING on player skill, not a model of one: it parries every window it is offered.
// That is fine here — the question is what the screen looks like, not whether the fight is hard.
const SHOTS = [12, 34, 62, 92, 120, 148]   // seconds; fx-probe has no way to pass these in   // seconds into the fight to capture at

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
      if (nr && h.lungeT > 0 && h.lungeT <= rung.window) press = true
    }
    if (!press) for (const a of run.krakenArms) {
      if (a.dead || a.limpT > 0) continue
      if ((a.x - p.x) ** 2 + (a.y - p.y) ** 2 > reach2) continue
      if (a.gripT > 0 || (a.tele > 0 && a.tele <= rung.window)) { press = true; break }
    }
  }
  run.player.hp = run.player.maxHP        // the question is the picture, not survival
  step(run, { x: ix, y: iy, skill: press }, 1 / 60)
  const events = run.events.splice(0)
  window.__renderer.sync(run, 1 / 60, events)
  if (run.phase === 'levelup') run.phase = 'playing'
}

let played = 0
return (age) => {
  const target = SHOTS[Math.min(SHOTS.length - 1, Math.round(age * (SHOTS.length - 1)))]
  let guard = 0
  while (played < target * 60 && guard++ < 60 * 200) { beat(); played++ }
  H.note(JSON.stringify({
    // DIAGNOSTIC ONLY (throwaway): which arm on screen is in which state. Bearing is the compass
    // direction from the player, so a state in this list can be matched to a limb in the picture
    // without staging anything — the frame is still the live fight.
    arms: run.krakenArms.map((a) => {
      const deg = (Math.atan2(a.y - run.player.y, a.x - run.player.x) * 180 / Math.PI + 360) % 360
      const dir = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][Math.round(deg / 45) % 8]
      const st = a.dead ? 'BROKEN' : a.limpT > 0 ? 'LIMP' : a.hitT > 0 ? 'FLASH'
        : (rung && a.tele > 0 && a.tele <= rung.window) ? 'WINDOW'
          : a.tele > 0 ? 'REAR' + Math.round((1 - a.tele / a.fuse) * 100) : 'idle'
      return dir + ':' + st + '(' + Math.round(a.hp / a.maxHP * 100) + '%)'
    }).join(' '),
    at: Math.round(played / 60) + 's', phase: run.script.phase,
    limp: run.krakenArms.filter((a) => a.limpT > 0 && !a.dead).length,
    rearing: run.krakenArms.filter((a) => !a.dead && a.tele > 0).length,
    stagger: run.script.stagger, staggerT: +(run.script.staggerT ?? 0).toFixed(1),
    broken: run.krakenArms.filter((a) => a.dead).length,
    of: run.krakenArms.length,
    adds: run.enemies.filter((e) => !e._dead && e.rosterId !== 'krakenHead').length,
    headHp: Math.round(run.script.headHp),
    light: Math.round(run.charge),
  }))
  app.renderer.render(app.stage)
}
