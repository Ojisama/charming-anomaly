// Scene: THE OPHAN'S SWORD, u 0 -> 1 — the real scheduler starts it (the chapter's pool narrowed to the sword for the
// shot, as test/sim-test.js's ophStart does), the aim locks where the player stands, and the player stays there, so
// the fire runs under them and the red hurt flash fires on the hit (tickFx forwards the sim's events to the renderer).
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-attack.js --out /tmp/oph-sword --frames 14 --chapter ophan --url http://127.0.0.1:5173/
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-attack.js --out /tmp/oph-sword-wide --frames 14 --chapter ophan --w 1440 --h 900 --url http://127.0.0.1:5173/
run.player.xpNext = 1e9   // no level-up modal in the middle of the shot
const C = window.__cfg.CHAPTERS.ophan, keep = C.attacks
H.until(() => !!run.script?.oph, 50)
const o = run.script.oph
H.until(() => { o.atkCd = 99; return o.t > 5 }, 1200)   // a crowd first
C.attacks = { 1: ['sword'], 2: ['sword'], 3: ['sword'] }
o.atkCd = 0
H.tick()
C.attacks = keep
if (o.atk?.k !== 'sword') throw new Error('the scheduler did not start the sword: ' + JSON.stringify(o.atk))
const a = o.atk
H.note(JSON.stringify({ chapter: run.chapter, atk: a.k, aim: [Math.round(a.ax), Math.round(a.ay)], player: [Math.round(run.player.x), Math.round(run.player.y)] }))
const show = () => { document.getElementById('ui').style.display = ''; window.__hud(run) }
let hurts = 0
return (age) => {
  const want = Math.min(age, 0.995)
  let g = 0
  while (o.atk === a && a.u < want && g++ < 400) hurts += H.tickFx().filter((e) => e.type === 'hurt').length
  if (g === 0) H.render()
  show()
  window.__fxHurts = hurts
}
