// Scene: THE SCREW, a heavy weight on a chain that bounces (owner, 2026-09-08: "a lot of inertia
// and bouncing around"). The fish swims the plan below; the weight is yanked, thrown and bounced.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/screw-drive.js --chapter wreck \
//     --url 'http://127.0.0.1:PORT/' --out /tmp/sd --frames 15 --w 1280 --h 800
//   ffmpeg -framerate 3 -i /tmp/sd-%02d.png screw-drive.gif
//
// Frames every third of a second over 5s: east for 1.5s (the weight is yanked after the fish and
// bounces between hull and chain), north for 1s (it slings wide), west for 1.5s (thrown back the
// other way), then a stop for 1s (it keeps flying and ricochets off the fish).
// Drives `step` itself rather than H.tick, which hardcodes a zero stick.
H.clean()
run.weapons = [{ id: 'screw', level: 1 }]
// ?twin=1 on the URL puts Twin Screw on: two blades abreast, one chain each.
run.weaponMods.screw = new URLSearchParams(location.search).get('twin') ? { twinScrew: 1 } : {}
const p = run.player
p.hp = p.maxHP = 99999
const PLAN = [[1.5, 1, 0], [1.0, 0, -1], [1.5, -1, 0], [1.0, 0, 0]]
let simT = 0
const stickAt = (t) => { let acc = 0; for (const [s, x, y] of PLAN) { acc += s; if (t < acc) return { x, y } } return { x: 0, y: 0 } }
const TOTAL = PLAN.reduce((a, s) => a + s[0], 0)
return (k) => {           // k is the scrub fraction 0..1 across the frames, not a frame index
  const target = Math.max(1 / 3, k * TOTAL)
  while (simT < target - 1e-6) {
    const d = Math.min(1 / 60, target - simT)
    step(run, stickAt(simT), d)
    simT += d
    run.enemies.length = 0
    run.player.hp = run.player.maxHP
    window.__renderer.sync(run, d, run.events.splice(0))
  }
  const s = run.screws[run.screws.length - 1]
  H.note(JSON.stringify({ t: +simT.toFixed(2), stick: stickAt(simT - 0.01), fish: [Math.round(p.x), Math.round(p.y)], blade: [Math.round(s.x), Math.round(s.y)] }))
  app.renderer.render(app.stage)
}
