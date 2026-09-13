// Scene: THE PARRY'S OWN STATE, on the player. Everything the button can be doing, staged so the
// three reads the owner reported missing can be judged next to each other (2026-09-13: "there's
// almost no player feedback when a parry is active, when a parry misses, when a parry does dmg").
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-parry.js --out /tmp/kp \
//        --chapter kraken --difficulty 3 --frames 3
//
// The three captured frames are three different answers to "what is the button doing right now":
//   00  READY, AND THERE IS SOMETHING TO HIT — an arm is inside its parry window and the cooldown
//       is clear. The player wears a bright ring; this is the "press" state.
//   01  SPENT, TOO EARLY — the cooldown arc is filling and an arm is STILL in window, which is the
//       punish the whiff buys. The arc goes warm to say so.
//   02  AGAINST THE WALL — the player is at KRAKEN_CAGE_R and leaning on it. Before this existed
//       the arena had no edge at all and you could simply walk off across the map.
// The Light bar is held FULL throughout: this scene is about the player's own 30px of screen, and
// kraken-ring.js is the one that judges the same art down a dark bar.
H.until(() => run.script.phase === 'boss' && run.krakenArms.length > 0, 3000)
H.tick(); H.tick()

if (!window.__cfg) throw new Error('no window.__cfg — probe the page with ?debug')
const C = window.__cfg
const rung = C.krakenRung(3)
const head = run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead)
const arms = run.krakenArms
if (!head) throw new Error('no head on the field — the scene never reached a ring block')

// One arm sitting in its window, one worn most of the way through, the rest quiet and shut.
for (const a of arms) { a.dead = false; a.open = false; a.gripT = 0; a.tele = 2.0 }
arms[0].tele = rung.window * 0.7
arms[1].hp = arms[1].maxHP * 0.18
arms[2].open = true

const near = () => { run.player.x = head.x + Math.cos(arms[2].ang) * 70; run.player.y = head.y + Math.sin(arms[2].ang) * 70 }
near()

H.note(JSON.stringify({
  cageR: Math.round(C.KRAKEN_CAGE_R), armReach: C.KRAKEN_ARM_REACH, parryCd: C.KRAKEN_PARRY_CD,
  window: rung.window, perfect: rung.perfect,
}))

return (age) => {
  H.light(1)
  // Re-assert every frame: the arm's own tele is not stepped here, but the script's timers are.
  arms[0].tele = rung.window * 0.7
  run.script.cageT = 0
  if (age < 0.33) {           // ready, and something to hit
    near()
    run.repulseCd = 0
  } else if (age < 0.66) {    // spent too early: the arc is the cost of the miss
    near()
    run.repulseCd = C.KRAKEN_PARRY_CD * 0.55
  } else {                    // leaning on the cage
    const ang = arms[4] ? arms[4].ang : 0
    run.player.x = head.x + Math.cos(ang) * C.KRAKEN_CAGE_R
    run.player.y = head.y + Math.sin(ang) * C.KRAKEN_CAGE_R
    run.repulseCd = 0
    run.script.cageT = 0.18
  }
  H.render()
}
