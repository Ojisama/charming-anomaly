// Scene: THE OPHAN'S FLIGHT, PLAYED — the real stepSim every step, the player standing then walking a slow curve, the
// boss circling, swooping to slap and pulling back out. Only the big attacks and the hand's swaps are held off.
// One frame = 4 sim steps (1/15 s), synced with that dt and the step's events, so a frame sequence plays at 15 fps.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-fly.js --out /tmp/oph-fly --frames 60 --chapter ophan --url 'http://127.0.0.1:5173/?world=3&skin=3'
// ?world=k: the player presses world k first. ?skin=k: the boss WEARS world k (set by hand; match world to skin or the
// boss is sealed, which changes nothing about its flight).
const q = new URLSearchParams(location.search), W = q.has('world') ? +q.get('world') : null, SK = q.has('skin') ? +q.get('skin') : null
run.player.xpNext = 1e9
H.until(() => !!run.script?.oph, 50)
const o = run.script.oph
const hold = () => { o.atkCd = 99; o.swapIn = 99 }
H.until(() => { hold(); return o.t > 3 && o.bossId != null }, 6000)
if (W !== null && W !== o.world) { run._worldPress = W; H.until(() => { hold(); return o.world === W && !o.wipe }, 600) }
const boss = () => run.enemies.find((e) => e.rosterId === 'ophan' && !e._dead)
if (SK !== null && SK !== o.skin) { o.hp[o.skin] = boss().hp; o.skin = SK; boss().hp = o.hp[SK] }   // STAGED: the boss wears skin SK
H.until(() => { hold(); return o.t > 7 }, 1200)
let n = 0
const tag = document.body.appendChild(document.createElement('div'))
tag.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99;font:bold 20px monospace;color:#fff;background:#000a;padding:2px 6px'
return () => {
  for (let i = 0; i < 4; i++, n++) {
    hold(); run.player.hp = run.player.maxHP
    const s = n / 60, a = s * 0.9, go = s > 2 && s < 2.8 ? 1 : 0   // stand, a short walk, stand
    window.__stepSim(run, { x: Math.cos(a) * go, y: Math.sin(a) * go }, 1 / 60)
  }
  window.__renderer.sync(run, 4 / 60, run.events.splice(0))
  const b = run.enemies.find((e) => e.rosterId === 'ophan' && !e._dead)
  tag.textContent = b ? `${o.atk ? o.atk.k : o.fm} ${(n / 60).toFixed(2)}s` : '-'   // what the flight is doing, burned into the frame
  window.__app.renderer.render(window.__app.stage)
}
