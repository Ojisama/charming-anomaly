// Scene: THE WORLD SWITCH — the player presses a world and its wipe grows from them: world B inside the circle, world A
// outside, the rim in B's colour, the crowd it crosses turning in place, the boss pasted over both. A PLAYED press (the
// real run._worldPress latch stepSim reads); the attacks and the hand's swaps are held off.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-wipe.js --out /tmp/oph-wipe --frames 8 --chapter ophan --url 'http://127.0.0.1:5173/?from=0&to=5'
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-wipe.js --out /tmp/oph-wipe2 --frames 8 --chapter ophan --url 'http://127.0.0.1:5173/?from=5&to=2'
//
// ?from=k: the world stood in first (pressed, its wipe run out), ?to=k: the world pressed for the shot. Frame i is the
// wipe at i/(frames-1) of its run (r 0 -> OPHAN_WIPE_END), stepped by the sim.
const q = new URLSearchParams(location.search), FROM = +(q.get('from') ?? 0), TO = +(q.get('to') ?? 5)
run.player.xpNext = 1e9   // no level-up modal in the middle of the shot
H.until(() => !!run.script?.oph, 50)
const o = run.script.oph
const hold = () => { o.atkCd = 99; o.swapIn = 99 }
H.until(() => { hold(); return o.t > 3 }, 1200)
if (FROM !== o.world) { run._worldPress = FROM; H.until(() => { hold(); return o.world === FROM && !o.wipe }, 600) }
H.until(() => { hold(); return o.t > 7 }, 1200)
const END = window.__cfg.OPHAN_WIPE_END
H.note(JSON.stringify({ chapter: run.chapter, from: o.world, to: TO, skin: o.skin, t: +o.t.toFixed(2), wipeEnd: Math.round(END),
  crowd: run.enemies.filter((e) => !e._dead && e.rosterId !== 'ophan').length }))
const show = () => { document.getElementById('ui').style.display = ''; window.__hud(run) }
let pressed = false
return (age) => {
  if (!pressed) { pressed = true; run._worldPress = TO; hold(); H.tickFx() }
  let g = 0
  while (o.wipe && o.wipe.r < age * END * 0.98 && g++ < 200) { hold(); H.tickFx(1 / 120) }
  if (g === 0) H.render()
  show()
}
