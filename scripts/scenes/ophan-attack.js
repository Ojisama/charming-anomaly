// Scene: ONE OF THE OPHAN'S ATTACKS, u 0 -> 1 — the real scheduler starts it (the chapter's pool narrowed to that attack
// for the shot, as test/sim-test.js's ophStart does), the aim locks where the player stands, and the player stays there,
// so the attack lands on them and the red hurt flash fires on a hit (tickFx forwards the sim's events to the renderer).
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-attack.js --out /tmp/oph-sword --frames 14 --chapter ophan --url 'http://127.0.0.1:5173/?atk=sword'
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-attack.js --out /tmp/oph-wheel --frames 14 --chapter ophan --url 'http://127.0.0.1:5173/?atk=wheel&world=4&skin=1'
//
// ?atk=<id> (default sword). ?world=k: the player presses world k first (the real press). ?skin=k: the boss WEARS world
// k — set by hand (the hand's swap is random in time), STAGED in the note; skin != world is the boss pasted in.
const q = new URLSearchParams(location.search), K = q.get('atk') || 'sword'
const W = q.has('world') ? +q.get('world') : null, SK = q.has('skin') ? +q.get('skin') : null
run.player.xpNext = 1e9   // no level-up modal in the middle of the shot
const C = window.__cfg.CHAPTERS.ophan, keep = C.attacks
H.until(() => !!run.script?.oph, 50)
const o = run.script.oph
const hold = () => { o.atkCd = 99; o.swapIn = 99 }
H.until(() => { hold(); return o.t > 3 && o.bossId != null }, 6000)   // through the opening wave: the boss is not out before it
if (W !== null && W !== o.world) { run._worldPress = W; H.until(() => { hold(); return o.world === W && !o.wipe }, 600) }
const boss = () => run.enemies.find((e) => e.rosterId === 'ophan' && !e._dead)
if (SK !== null && SK !== o.skin) { o.hp[o.skin] = boss().hp; o.skin = SK; boss().hp = o.hp[SK] }
// an attack gated on a later phase (the laser) needs worlds broken first: two that are neither stood in nor worn, STAGED
const need = 2 * (window.__cfg.OPHAN_ATTACKS[K].minPh - 1)
for (let k = 0, n = 0; k < 6 && n < need; k++) if (k !== o.world && k !== o.skin && !o.broken[k]) { o.broken[k] = true; n++ }
H.until(() => { hold(); return o.t > 5 && o.ph >= window.__cfg.OPHAN_ATTACKS[K].minPh }, 1200)   // a crowd first
C.attacks = { 1: [K], 2: [K], 3: [K] }
o.atkCd = 0
H.tick()
C.attacks = keep
if (o.atk?.k !== K) throw new Error('the scheduler did not start the ' + K + ': ' + JSON.stringify(o.atk))
const a = o.atk
H.note(JSON.stringify({ chapter: run.chapter, atk: a.k, world: o.world, skin: o.skin + (SK !== null ? ' (STAGED)' : ''), ph: +o.ph.toFixed(2) + (need ? ' (STAGED: ' + need + ' broken)' : ''),
  aim: [Math.round(a.ax), Math.round(a.ay)], player: [Math.round(run.player.x), Math.round(run.player.y)] }))
const show = () => { document.getElementById('ui').style.display = ''; window.__hud(run) }
let hurts = 0
return (age) => {
  const want = Math.min(age, 0.995)
  let g = 0
  while (o.atk === a && a.u < want && g++ < 400) { o.swapIn = 99; hurts += H.tickFx().filter((e) => e.type === 'hurt').length }
  if (g === 0) H.render()
  show()
  window.__fxHurts = hurts
}
