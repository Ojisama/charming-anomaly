// Scene: THE OPHAN FIGHT ENDING, both ways, through main.js's REAL ticker (app.ticker.update), so endRun and the
// summary screen fire exactly as in play. Only the precondition is set; the ticker crosses the line:
//   ?end=dead  the scheduler starts the sword (pool narrowed for the shot), the player stands on the locked aim at 1 hp
//   ?end=win   every skin broken, then the pencil sketch taken off; the next step ends the fight
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-end.js --out /tmp/oph-dead --frames 4 --chapter ophan --url 'http://127.0.0.1:5173/?end=dead'
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-end.js --out /tmp/oph-win --frames 4 --chapter ophan --url 'http://127.0.0.1:5173/?end=win'
// Frame 0 is the first frame past the line; the last is the summary screen. The note prints the phase it saw.
const mode = new URLSearchParams(location.search).get('end') || 'dead'
const CFG = window.__cfg, C = CFG.CHAPTERS.ophan
run.player.xpNext = 1e9
H.until(() => !!run.script?.oph, 50)
const o = run.script.oph
H.until(() => { o.atkCd = 99; return o.t > 3 }, 600)
let now = performance.now(), crossed = null, seen = []
const tick = () => { app.ticker.update(now += 1000 / 60); if (!seen.includes(run.phase)) seen.push(run.phase) }
const summary = () => !!document.querySelector('.screen--summary.screen--visible')
return (age) => {
  document.getElementById('ui').style.display = ''
  if (!crossed) {
    run.phase = 'playing'   // H.clean() already set it; stated here because the line is crossed from 'playing'
    if (mode === 'dead') {
      const keep = C.attacks
      C.attacks = { 1: ['sword'], 2: ['sword'], 3: ['sword'] }
      o.atkCd = 0
      tick()
      C.attacks = keep
      run.player.hp = 1
    } else {
      // every skin broken the real way (stood in the worn world, STAGED, put at the floor), then the sketch taken off
      // (STAGED: the kill itself is run OP.sketch's): the next step finds it gone and ends the fight
      const b = () => run.enemies.find((e) => e.rosterId === 'ophan' && !e._dead)
      for (let g = 0; !o.sketch && g < 12; g++) { o.world = o.skin; b().hp = CFG.OPHAN_BREAK_FLOOR; tick() }
      b().hp = 0; b()._dead = true
    }
    let g = 0
    while (run.phase === 'playing' && g++ < 600) tick()
    crossed = { phase: run.phase, steps: g, atk: o.atk?.k ?? null }
  }
  // the outro, then the summary: about 1 s of real ticker per captured frame, the last until the summary shows
  let g = 0
  while (g++ < 60 || (age >= 1 && !summary() && g < 600)) tick()
  H.note(JSON.stringify({ mode, crossed, phases: seen, summary: summary(), t: +o.t.toFixed(2) }))
}
