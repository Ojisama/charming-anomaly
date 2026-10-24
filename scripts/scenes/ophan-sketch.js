// Scene: THE SKETCH, after the last skin — the paper floor, the pencil boss at ph 4, the gauge greyed, the single bar.
// Every skin is broken the real way (worn, stood in, put at the break floor; the next step breaks it), so the sim's own
// last break raises the sketch. Only standing in the worn world is set by hand (STAGED in the note), as the hand's swap
// order is random.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-sketch.js --out /tmp/oph-sk --frames 6 --chapter ophan --url 'http://127.0.0.1:5173/?atk=idle'
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-sketch.js --out /tmp/oph-sk-sword --frames 14 --chapter ophan --url 'http://127.0.0.1:5173/?atk=sword'
//
// ?atk=idle (default): between attacks. ?atk=<id>: the real scheduler starts that attack (the sketch's pool narrowed to it
// for the shot), aimed where the player stands, u 0 -> 1 over the frames.
const q = new URLSearchParams(location.search), K = q.get('atk') || 'idle'
const CFG = window.__cfg, C = CFG.CHAPTERS.ophan
run.player.xpNext = 1e9   // no level-up modal in the middle of the shot
run.player.hp = run.player.maxHP = 1e6   // the attacks land without ending the shot
H.until(() => !!run.script?.oph, 50)
const o = run.script.oph
const hold = () => { o.atkCd = 99; o.swapIn = 99 }
H.until(() => { hold(); return o.t > 3 }, 1200)
const boss = () => run.enemies.find((e) => e.rosterId === 'ophan' && !e._dead)
for (let g = 0; !o.sketch && g < 12; g++) { o.world = o.skin; boss().hp = CFG.OPHAN_BREAK_FLOOR; H.tick() }
if (!o.sketch) throw new Error('the last break did not raise the sketch: ' + JSON.stringify(o.broken))
H.until(() => { o.atkCd = 99; return o.ph >= 3 && o.after < 0 }, 1200)
let a = null
if (K !== 'idle') {
  const keep = C.sketchAttacks
  C.sketchAttacks = [K]; o.atkCd = 0
  H.tick()
  C.sketchAttacks = keep
  if (o.atk?.k !== K) throw new Error('the scheduler did not start the ' + K + ': ' + JSON.stringify(o.atk))
  a = o.atk
}
H.note(JSON.stringify({ chapter: run.chapter, sketch: o.sketch, atk: a?.k ?? 'idle', world: o.world + ' (STAGED per break)', ph: +o.ph.toFixed(2),
  bar: run.bossBar, crowd: run.enemies.filter((e) => !e._dead && e.rosterId !== 'ophan').length }))
const show = () => { document.getElementById('ui').style.display = ''; window.__hud(run) }
return (age) => {
  if (a) {
    const want = Math.min(age, 0.995)
    let g = 0
    while (o.atk === a && a.u < want && g++ < 400) H.tickFx()
    if (g === 0) H.render()
  } else for (let g = 0; g < 12; g++) { o.atkCd = 99; H.tickFx() }
  show()
}
