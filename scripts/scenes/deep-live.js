// Scene: THE DEEP AS IT ACTUALLY PLAYS. A bot walks the dark, dodges the maws it can see and
// fights what comes; frames are captured at natural moments across a 300s run.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-live.js --out /tmp/dl \
//        --chapter deep --difficulty 3 --frames 6
//   ...and again with --w 1280 --h 800: the dark is a multiple of the screen's longest side, so
//   how far you can see is a different mechanic per device by construction (v7.58 shipped that bug).
//
// WHY, WHEN THIRTEEN `deep-*` SCENES ALREADY EXIST: every one of them stages its subject — a row of
// maws at fixed gapes, a cast placed on a circle, the bar pinned by hand. That is the right tool
// for judging one bake against another and the wrong one for "is this chapter readable", which is a
// property of the WHOLE picture: the crowd, the weapons' ink, the status crusts, the damage
// numbers and the dark all competing for the same pixels. kraken-live.js's header records what
// judging readability off staged frames cost — four shipped releases of an unreadable fight.
//
// ONE THING IS HAND-SET, deliberately, and it is the loadout: nothing exposes applyChoice to a
// scene, so a bot that plays cannot take cards, and a Deep run with only its starter puts almost no
// weapon ink on screen — which is exactly the absence that hid The Kraken's barnacles. The four
// pool weapons go on at levels a 300s run would plausibly reach. Everything else — the dark, the
// streamed maws, the crowd, the statuses, the bar — is whatever the sim does.
const SHOTS = [20, 60, 110, 170, 230, 290]   // seconds into the run to capture at

// The Deep's own pool, at a mid-run ladder. See the header: this is the one staged fact.
run.weapons = [
  { id: 'glint', level: 5 }, { id: 'sunspear', level: 4 },
  { id: 'foxfire', level: 3 }, { id: 'sunlance', level: 3 },
]

const maws = () => run.shafts

// ⚠ A BOT THAT AVOIDS THE MAWS PINS THIS CHAPTER'S BAR AT ZERO, AND THE FRAMES LOOK LIKE A BROKEN
// CHAPTER. The first cut of this scene fled every mouth — the obvious policy, since a full gape
// eats you — and every frame past 60s read `light: 0/100` with the lamp at its `radiusEmpty` 0.06.
// That is not the chapter being unplayable, it is the rig refusing the only refill in it: The
// Deep's Light has exactly one source and it is `inMaw`, standing INSIDE an anglerfish's mouth
// (resource.refill 16/s against a drain of 2). The gamble — the gape climbs while you soak and a
// full one swallows you — IS the chapter. A bot that will not take it cannot photograph it.
//
// So the policy is the honest one: soak when the bar is low, leave at 70% gape, flee a mouth whose
// jaws are past that. Same lesson charge-probe's header records for its own movement axis.
const SOAK_BELOW = 0.55    // fraction of the bar under which it is worth the gamble
const LEAVE_GAPE = 0.7     // back out with three tenths of the countdown still in hand

function beat() {
  const p = run.player
  let ix = 0, iy = 0
  const frac = run.charge / run.chargeMax
  // The mouth it is currently standing in, if any.
  const inside = maws().find((m) => Math.hypot(m.x - p.x, m.y - p.y) < m.r && !(m._shutT > 0))
  let target = null
  let soaking = false
  if (inside && inside.gape < LEAVE_GAPE && frac < 1) {
    soaking = true                                // hold still in the mouth and watch the face
  } else if (inside) {
    ix = (p.x - inside.x) / (Math.hypot(p.x - inside.x, p.y - inside.y) || 1)   // out, now
    iy = (p.y - inside.y) / (Math.hypot(p.x - inside.x, p.y - inside.y) || 1)
  } else if (frac < SOAK_BELOW) {
    // Go and find one. Nearest mouth that is neither shut nor still closing from someone's visit.
    let bd = Infinity
    for (const m of maws()) {
      if (m._shutT > 0 || (m.gape ?? 0) > 0.2) continue
      const d = Math.hypot(m.x - p.x, m.y - p.y)
      if (d < bd) { bd = d; target = m }
    }
    if (target) {
      const dx = target.x - p.x, dy = target.y - p.y, dl = Math.hypot(dx, dy) || 1
      ix = dx / dl; iy = dy / dl
    }
  }
  if (!soaking && !ix && !iy) {
    // Bar is healthy (or there is nothing to walk to): kite away from the centroid of the crowd.
    let cx = 0, cy = 0, n = 0
    for (const e of run.enemies) { if (e._dead) continue; cx += e.x; cy += e.y; n++ }
    if (n) {
      const dx = p.x - cx / n, dy = p.y - cy / n, dl = Math.hypot(dx, dy) || 1
      ix = dx / dl; iy = dy / dl
    } else { const a = run.time * 0.4; ix = Math.cos(a); iy = Math.sin(a) }
  }
  run.player.hp = run.player.maxHP        // the question is the picture, not survival
  step(run, { x: ix, y: iy }, 1 / 60)
  const events = run.events.splice(0)
  window.__renderer.sync(run, 1 / 60, events)
  if (run.phase === 'levelup') run.phase = 'playing'
}

// SOAKS AND DEVOURS ARE THE PROOF THE BOT PLAYED THE CHAPTER. A frame sequence with zero soaks is
// the first cut of this scene again — a bar at zero because nothing ever went for it — and the two
// are indistinguishable from the picture alone.
let soaks = 0, devours = 0
let played = 0
return (age) => {
  const target = SHOTS[Math.min(SHOTS.length - 1, Math.round(age * (SHOTS.length - 1)))]
  let guard = 0
  while (played < target * 60 && guard++ < 60 * 400) {
    const before = run.charge
    beat()
    if (run.charge > before + 0.01) soaks++
    if (before > 1 && run.charge === 0) devours++
    played++
  }
  H.note(JSON.stringify({
    at: Math.round(played / 60) + 's',
    light: Math.round(run.charge) + '/' + Math.round(run.chargeMax),
    soakFrames: soaks, devoured: devours,
    maws: maws().length,
    crowd: run.enemies.filter((e) => !e._dead).length,
    roster: [...new Set(run.enemies.filter((e) => !e._dead).map((e) => e.rosterId))].join(','),
    lvl: run.level,
  }))
  app.renderer.render(app.stage)
}
