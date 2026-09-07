// Scene: THE STRIKE'S LANE, drawn a full circle before the orca runs it. Owner ruling 2026-09-06:
// "what I want is to prevent the orca to dash somewhere that is not telegraph."
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/orca-aim.js --chapter wreck \
//     --url 'http://127.0.0.1:PORT/' --out /tmp/aim --frames 8 --w 1280 --h 800
//
// ⚠ IT KEEPS THE SHOAL, and that is a review note rather than set dressing. The previous version of
// this scene cleared run.enemies every step, which made it structurally incapable of showing the one
// thing most likely to break the tell: the lane competing with floating damage numbers, hit arrows
// and a crowd, all of which are pale and all of which land in the same place. A telegraph judged
// only in empty water is judged in a frame the game never produces.
//
// ⚠ AND IT DRIVES ITS OWN INPUT, WHICH IS WHY IT DOES NOT USE H.tick. H.tick hardcodes {x:0,y:0};
// the coil only separates from the player once they swim, so a rig that cannot press a direction
// shoots the one frame the tell never has to survive — the lane sitting on top of the player.
// The loop below stands still until the line is drawn and then swims SQUARE TO IT, which is the
// dodge the telegraph exists to make possible and therefore the frame worth judging.

H.clean()
H.breed(26)
H.keep(26)

const p = run.player
H.place((i) => ({
  x: p.x + Math.cos(i * 2.399963) * (70 + (i % 5) * 46),
  y: p.y + Math.sin(i * 2.399963) * (70 + (i % 5) * 46),
}))

run.orca = {
  state: 'rising', t: 1.5,
  cx: p.x, cy: p.y, r: 440, ang: 0,
  x: p.x + 440, y: p.y,
  dirX: 0, dirY: 0, hit: false, alpha: 0, passes: 1,
}

H.note(JSON.stringify({ state: run.orca.state, prey: run.enemies.length, chapter: run.chapter }))

// Rise (1.5) + the close lap (2.0) + the first held lap (1.38) lands at 4.88s, which is the moment
// the lane is drawn. The window runs from a beat before that to past the strike.
const T0 = Number(new URLSearchParams(location.search).get('t0') || 4.6)
const T1 = Number(new URLSearchParams(location.search).get('t1') || 2.9)
let simT = 0
return (k) => {
  const target = T0 + k * T1
  while (simT < target - 1e-6) {
    const d = Math.min(1 / 60, target - simT)
    const o = run.orca
    const aimed = o && o.ax !== undefined
    step(run, aimed ? { x: -o.dirY, y: o.dirX } : { x: 0, y: 0 }, d)
    simT += d
    run.player.hp = run.player.maxHP
    run.player.invuln = 0
    for (const e of run.enemies) { e.hitFlash = 0 }
    window.__renderer.sync(run, d, run.events.splice(0))
  }
  app.renderer.render(app.stage)
}
