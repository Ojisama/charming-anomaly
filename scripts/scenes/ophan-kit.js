// Scene: ONE KIT WEAPON FIRING IN ONE OPHAN WORLD — the real stepSim with the sim's events forwarded (a thrown pick is
// an event, not an entity), the attacks and the hand's swaps held off, the boss wearing the world it stands in. One
// weapon per scene (fx-probe trap 4); shoot each world separately and lay the frames out side by side.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-kit.js --out /tmp/kit-slag-3 --frames 6 --chapter ophan --url 'http://127.0.0.1:5173/?wpn=slagLadle&world=3'
//
// ?wpn=<id> (default shovel; any of CHAPTERS.ophan.weapons). ?world=k (default 0): the player presses world k first
// (the real press, its wipe run out) and the boss's skin follows it, STAGED.
const q = new URLSearchParams(location.search), WPN = q.get('wpn') || 'shovel', W = +(q.get('world') || 0)
run.player.xpNext = 1e9   // no level-up modal in the middle of the shot
H.until(() => !!run.script?.oph, 50)
const o = run.script.oph
const hold = () => { o.atkCd = 99; o.swapIn = 99 }
H.until(() => { hold(); return o.t > 3 }, 1200)
if (W !== o.world) { run._worldPress = W; H.until(() => { hold(); return o.world === W && !o.wipe }, 600) }
const boss = () => run.enemies.find((e) => e.rosterId === 'ophan' && !e._dead)
if (W !== o.skin) { o.hp[o.skin] = boss().hp; o.skin = W; boss().hp = o.hp[W] }
H.weapon(WPN, 5)
const t0 = o.t
H.until(() => { hold(); return o.t > t0 + 3 }, 1200)   // a few volleys in the air first
H.note(JSON.stringify({ chapter: run.chapter, wpn: WPN, world: o.world, look: window.__cfg.CHAPTERS.ophan.worlds[o.world].look,
  skin: o.skin + ' (STAGED)', crowd: run.enemies.filter((e) => !e._dead && e.rosterId !== 'ophan').length }))
const show = () => { document.getElementById('ui').style.display = ''; window.__hud(run) }
const line = [...document.querySelectorAll('pre')].pop(), head = line.textContent
// each frame: played on until the weapon fires (its 'shoot', or the pick's own event), then 8 ticks so the cast is in flight
const fired = (e) => e.type === 'pickaxe' || (e.type === 'shoot' && e.weapon)
return () => {
  const ev = {}
  const tally = (es) => { for (const e of es) ev[e.type + (e.weapon || '')] = (ev[e.type + (e.weapon || '')] || 0) + 1; return es }
  let g = 0
  while (g++ < 300 && !tally(H.tickFx()).some(fired)) hold()
  for (let i = 0; i < 8; i++) { hold(); tally(H.tickFx()) }
  line.textContent = head + '\nlive: ' + JSON.stringify({ bullets: run.bullets.length, novas: run.novas.length, picks: run.picks.length,
    magmaLobs: run.magmaLobs.length, slagPools: run.slagPools.length, w: run.weapons.map((w) => w.id), ev, t: o.t.toFixed(1), ph: run.phase })
  show()
}
