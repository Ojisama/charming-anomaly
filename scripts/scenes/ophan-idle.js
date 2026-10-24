// Scene: THE OPHAN between attacks — its Topsoil stage, the boss painter on the sim's clock, the crowd's marks
// walking in from the arena's border, the shovel at work, the boss bar's pill. A PLAYED frame (the real stepSim
// from the first step; only the first attack is held off), not a staged one.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-idle.js --out /tmp/oph-idle --frames 6 --chapter ophan --url http://127.0.0.1:5173/
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-idle.js --out /tmp/oph-idle-wide --frames 6 --chapter ophan --w 1440 --h 900 --url http://127.0.0.1:5173/
//
// The LAST frame also forwards one STAGED ophanImmune event (labelled in the note): with one world the boss can
// never be mismatched, so the immune ring has no played moment yet, and this is the only way to see it drawn.
run.player.xpNext = 1e9   // no level-up modal in the middle of the shot
H.until(() => !!run.script?.oph, 50)
const o = run.script.oph
const hold = () => { o.atkCd = 99 }
H.until(() => { hold(); return o.t > 7 }, 1200)
H.note(JSON.stringify({ chapter: run.chapter, t: +o.t.toFixed(2), ph: +o.ph.toFixed(2), crowd: run.enemies.filter((e) => !e._dead && e.rosterId !== 'ophan').length, frames: 'idle; last frame: + one STAGED ophanImmune' }))
const show = () => { document.getElementById('ui').style.display = ''; window.__hud(run) }
return (age) => {
  for (let i = 0; i < 18; i++) { hold(); H.tick() }
  if (age >= 1) {
    const b = run.enemies.find((e) => e.rosterId === 'ophan' && !e._dead)
    window.__renderer.sync(run, 0.05, [{ type: 'ophanImmune', x: b.x, y: b.y + 50, ang: Math.PI / 2 }])
    window.__renderer.sync(run, 0.05, [])
    app.renderer.render(app.stage)
  } else H.render()
  show()
}
