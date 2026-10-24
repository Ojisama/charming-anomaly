// Scene: THE OPHAN between attacks — a world's stage, the boss painter on the sim's clock, the crowd's marks walking in
// from the arena's border, the shovel at work, the boss bar's pill. A PLAYED frame (the real stepSim from the first
// step; only the attacks and the hand's swaps are held off), not a staged one.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-idle.js --out /tmp/oph-idle --frames 6 --chapter ophan --url 'http://127.0.0.1:5173/?world=2&skin=2'
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-idle.js --out /tmp/oph-idle-wide --frames 6 --chapter ophan --w 1440 --h 900 --url http://127.0.0.1:5173/
//
// ?world=k: the player presses world k first (the real press, its wipe run out). ?skin=k: the boss WEARS world k — set
// by hand (the hand's swap is random in time), labelled STAGED in the note. A world the boss does not wear seals it:
// every frame then ticks with the sim's events forwarded until the shovel's hit on the sealed boss raises a REAL
// ophanImmune, and the note counts them.
const q = new URLSearchParams(location.search), W = q.has('world') ? +q.get('world') : null, SK = q.has('skin') ? +q.get('skin') : null
run.player.xpNext = 1e9   // no level-up modal in the middle of the shot
H.until(() => !!run.script?.oph, 50)
const o = run.script.oph
const hold = () => { o.atkCd = 99; o.swapIn = 99 }
H.until(() => { hold(); return o.t > 3 }, 1200)
if (W !== null && W !== o.world) { run._worldPress = W; H.until(() => { hold(); return o.world === W && !o.wipe }, 600) }
const boss = () => run.enemies.find((e) => e.rosterId === 'ophan' && !e._dead)
if (SK !== null && SK !== o.skin) { o.hp[o.skin] = boss().hp; o.skin = SK; boss().hp = o.hp[SK] }
H.until(() => { hold(); return o.t > 7 }, 1200)
H.note(JSON.stringify({ chapter: run.chapter, world: o.world, skin: o.skin + (SK !== null ? ' (STAGED)' : ''), t: +o.t.toFixed(2), ph: +o.ph.toFixed(2),
  crowd: run.enemies.filter((e) => !e._dead && e.rosterId !== 'ophan').length }))
const show = () => { document.getElementById('ui').style.display = ''; window.__hud(run) }
const line = [...document.querySelectorAll('pre')].pop(), head = line.textContent
window.__fxImmune = 0
return () => {
  if (o.world !== o.skin) {
    // played: tick (events forwarded) until the sealed boss refuses a hit, then a few frames more so the ring is mid-grow
    // the player is stood just under the boss (STAGED), so the shovel's nearest target is the boss rather than the crowd
    const b = boss(), stand = () => { run.player.x = b.x; run.player.y = b.y + b.radius + 40 }
    let g = 0, seen = 0
    while (!seen && g++ < 600) { hold(); stand(); seen = H.tickFx().filter((e) => e.type === 'ophanImmune').length }
    for (let i = 0; i < 6; i++) { hold(); seen += H.tickFx().filter((e) => e.type === 'ophanImmune').length }
    window.__fxImmune += seen
    line.textContent = head + '\nPLAYED ophanImmune events so far: ' + window.__fxImmune + ' (player STAGED under the boss)'
  } else {
    for (let i = 0; i < 18; i++) { hold(); H.tick() }
    H.render()
  }
  show()
}
