// Scene: the CHEEKS skin's FEET (BUTT_FEET). The stride rides `hop`, which only advances while
// p.moving and only inside renderer.sync — so a still of a standing player shows both feet parked
// and proves nothing. This one holds full speed and advances SIX sim+sync ticks per captured
// frame, which puts a whole stride cycle in about six frames instead of thirty.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/cheeks-feet.js --chapter body --out /tmp/f --frames 8
//
// Stack the frames with ffmpeg to judge the cadence. --chapter surf/skies is the control: those
// forms wear the butt as a HEAD and must show no feet at all.
run.skin = 'cheeks'
window.__renderer.reset(run)

const p = run.player
p.hp = p.maxHP = 99999

// Settle first: the jiggle spring is kicked by acceleration, and its wobble from setting off would
// otherwise sit on top of the thing being judged.
for (let i = 0; i < 90; i++) { step(run, { x: 1, y: 0 }, 1 / 60); run.events.length = 0 }

H.note(run.chapter + ' — running flat out, 6 ticks per frame')

return () => {
  for (let i = 0; i < 6; i++) {
    p.hp = p.maxHP
    p.hitFlash = 0
    step(run, { x: 1, y: 0 }, 1 / 60)
    // AFTER the step, not before: stepSim spawns the pickups, so clearing first leaves a gem
    // sparkle sitting over the very thing the shot is of.
    run.enemies.length = 0
    run.gems.length = 0
    run.coins.length = 0
    run.events.length = 0
    window.__renderer.sync(run, 1 / 60, [])
  }
  app.renderer.render(app.stage)
}
