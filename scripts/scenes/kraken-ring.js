// Scene: The Kraken's tentacle ring, with every arm state staged in ONE frame so the new read can
// be judged side by side. Runs in the page with (run, app, step, H) in scope.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-ring.js --out /tmp/kr \
//        --chapter kraken --difficulty 3 --frames 3
//
// WHAT IS BEING JUDGED: "which way is open" is the one genuinely new read in the game and it has no
// precedent to copy. A shut sector draws a band of fence at ring radius; an open or broken one draws
// nothing, so the ring is a wall with holes in it. This has to survive a DARK chapter at a LOW Light
// bar on a phone, which is why the scrub below sweeps the bar from empty to full across the frames
// rather than shooting one comfortable moment.

// Drive the fight past its opening breather into the first ring block. The wave clears on a timeout
// (KRAKEN_WAVE_TIMEOUT), so this is ~12s of sim, then two more ticks for the ring to go out.
H.until(() => run.script.phase === 'boss' && run.krakenArms.length > 0, 3000)
H.tick()
H.tick()

const s = run.script
const head = run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead)
const arms = run.krakenArms
if (!head) throw new Error('no head on the field — the scene never reached a ring block')
if (arms.length < 5) throw new Error(`only ${arms.length} arms; this scene stages five distinct states`)

// Five states, adjacent so they can be compared without panning:
//   [0] BROKEN      — a permanent hole in the ring
//   [1] OPEN        — the door a parry just bought (shuts on its next wind-up)
//   [2] WIND-UP     — inside the telegraph fuse, not yet parryable
//   [3] WINDOW      — parryable now (the "press" state)
//   [4] PERFECT     — the tail of the window
//   rest            — shut, the default state of the ring
// Read the rung off config rather than copying its numbers: a hardcoded copy here would stage the
// wrong states the moment the table is retuned, and the frame would look fine while lying.
// `window.__cfg` is the whole config module behind ?debug. It was `window.__config` here, which has
// never existed anywhere in this repo, so this file took its hardcoded fallback on EVERY shot it has
// ever been used for — the exact failure the comment above warns about, three lines below the
// comment. There is no fallback now on purpose: a scene that cannot read the real table must fail
// loudly, not quietly stage the wrong states.
if (!window.__cfg) throw new Error('no window.__cfg — probe the page with ?debug, or this scene stages invented numbers')
const rung = window.__cfg.krakenRung(3)
arms[0].dead = true; arms[0].open = true; arms[0].hp = 0; arms[0].breakT = 0
arms[1].dead = false; arms[1].open = true; arms[1].tele = 2.0
arms[2].dead = false; arms[2].open = false; arms[2].tele = rung.fuse * 0.7
arms[3].dead = false; arms[3].open = false; arms[3].tele = rung.window * 0.8
arms[4].dead = false; arms[4].open = false; arms[4].tele = rung.perfect * 0.5
for (let i = 5; i < arms.length; i++) { arms[i].dead = false; arms[i].open = false; arms[i].tele = 2.0 }
// A partly-worn arm, so the WEAR read is in the frame too: an arm's health is this fight's only
// progress bar and it is drawn as a warm bruise on the tentacle itself.
arms[2].hp = arms[2].maxHP * 0.35
// ...and one caught mid-flash, the frame just after a parry landed on it. Wear and flash are
// deliberately different channels — they used to share white with the parry WINDOW, which made a
// worn arm read as permanently parryable.
if (arms[5]) { arms[5].hp = arms[5].maxHP * 0.6; arms[5].hitT = window.__cfg.KRAKEN_ARM_HIT_T * 0.8 }

// Stand in the open door at weapon range — the position the fight actually asks the player to find.
// INSIDE the cage, in the open sector: that is where the fight is fought now.
run.player.x = head.x + Math.cos(arms[1].ang) * 70
run.player.y = head.y + Math.sin(arms[1].ang) * 70

// Nothing else on the field: the breather's dead are cleared, and block 1 is before the trickle.
H.note(JSON.stringify({
  phase: s.phase, arms: arms.length, armsTotal: s.armsTotal,
  shut: arms.filter((a) => !a.dead && !a.open).length,
  broken: arms.filter((a) => a.dead).length,
  strays: run.enemies.filter((e) => e.rosterId !== 'krakenHead' && !e._dead).length,
  chargeMax: run.chargeMax,
  // THE FRAMING NUMBERS: how much WORLD fits across a phone screen, against what the arena
  // actually measures. READ OFF CONFIG, never restated — these were literals (`150 * 2`, `78`) and
  // they were rev 1's, so this note went on reporting a head 2.4x too small and a ring 4.1x too
  // small from the very commit that moved them.
  worldPxAcross: Math.round(app.renderer.width / (app.stage.scale.x || 1)),
  cageDiameter: Math.round(window.__cfg.KRAKEN_CAGE_R * 2),
  headR: window.__cfg.KRAKEN_HEAD_R,
  armReach: window.__cfg.KRAKEN_ARM_REACH,
  playerToHead: Math.round(Math.hypot(run.player.x - head.x, run.player.y - head.y)),
  stageScale: app.stage.scale.x,
}))

// Sweep the Light bar empty -> full across the captured frames. Frame 00 is the worst case the
// chapter can put a player in: an empty bar, where `radiusEmpty` decides whether the telegraph is
// legible at all. Rev 1 shipped The Deep's 0.06 here and the near field went black.
return (age) => {
  // H.light, not `run.charge =`. The dark reads run.sightCharge; setting charge alone froze it, and
  // these frames were byte-identical for the whole life of this file.
  H.light(age)
  H.render()
}
