// Scene: the CHEEKS skin's jiggle (CHEEK_JIGGLE). The spring is kicked by ACCELERATION, so a
// frame of someone running at a steady speed shows nothing — the shot has to contain a CHANGE of
// pace. This one runs the player up to full speed, holds it until the spring settles, then stops
// dead on frame 3 and captures the wobble that follows.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/cheeks-jiggle.js --chapter body --out /tmp/j --frames 12
//
// Throwaway-adjacent but kept: it is the only way to see this effect at all, and a still cannot
// show it. Stack the frames with ffmpeg to judge the decay.
run.skin = 'cheeks'
window.__renderer.reset(run)

const p = run.player
p.hp = p.maxHP = 99999

// Run right long enough for the spring to settle at speed — otherwise frame 0 already carries the
// kick from setting off and there is nothing to compare the stop against.
for (let i = 0; i < 90; i++) { step(run, { x: 1, y: 0 }, 1 / 60); run.events.length = 0 }

let f = 0
H.note(run.chapter + ' — running, dead stop at frame 3')

return () => {
  p.hp = p.maxHP
  p.hitFlash = 0
  step(run, f < 3 ? { x: 1, y: 0 } : { x: 0, y: 0 }, 1 / 60)
  // AFTER the step, not before: stepSim spawns the pickups, so clearing first leaves a gem
  // sparkle sitting over the very thing the shot is of.
  run.enemies.length = 0
  run.gems.length = 0
  run.coins.length = 0
  run.events.length = 0
  window.__renderer.sync(run, 1 / 60, [])
  app.renderer.render(app.stage)
  f++
}
