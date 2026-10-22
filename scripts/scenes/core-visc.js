// Scene: THE CORE in ordinary play, for judging render.liquid.viscosity: the real spawner, pools and
// crowd, you walking a slow circle (immortal, no weapons, so the crowd reaches you and grows arms).
//
//   FX_CHROME_ARGS='--use-gl=angle --use-angle=gl --enable-gpu --ignore-gpu-blocklist' \
//   node scripts/fx-probe.mjs --scene scripts/scenes/core-visc.js --chapter core --dpr 2 --frames 40 \
//     --url 'http://127.0.0.1:5173/' --out /tmp/cv/v1
//   One frame every 3 ticks (0.05 s) after a 25 s warm-up; set the viscosity in config.js between runs.
if (run.chapter !== 'core') throw new Error('not The Core: ' + run.chapter)
const p = run.player
run.weapons = []
let t = 0
const walk = () => { t += 1 / 60; return { x: Math.cos(t * 0.5), y: Math.sin(t * 0.5) } }
const step1 = () => {
  window.__stepSim(run, walk(), 1 / 60)
  run.events.length = 0
  p.hp = p.maxHP = 99999
}
for (let i = 0; i < 25 * 60; i++) step1()
window.__renderer.sync(run, 0.05, [])
return () => {
  for (let i = 0; i < 3; i++) step1()
  window.__renderer.sync(run, 0.05, [])
  app.renderer.render(app.stage)
}
