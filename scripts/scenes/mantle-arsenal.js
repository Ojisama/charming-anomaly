// Scene: THE MANTLE'S SPRING GLOVE AND PINBALL COAL, PLAYED (nothing hand-set but the loadout and the
// spot). The digger stands near a stalagmite while a real crowd walks in; every frame is two live sim
// steps with their events forwarded, so punches, coal bounces and Bumper sparks are the game's own.
//   node scripts/fx-probe.mjs --scene scripts/scenes/mantle-arsenal.js --chapter mantle \
//     --url http://127.0.0.1:PORT/ --out /tmp/ma --frames 40 --wait 60000
const p = run.player
run.weapons = []
for (let i = 0; i < 5; i++) H.tick()
// stand 170px off the nearest stalagmite, so the coals have a rock to bounce off
const o = (run.obstacles ?? []).filter((q) => q.kind === 'stalagmite').sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
if (!o) throw new Error('no stalagmite streamed in near the start')
p.x = o.x - 170; p.y = o.y + 20
for (let i = 0; i < 5; i++) H.tick()
H.breed(30)
run.weapons = [{ id: 'springGlove', level: 5 }, { id: 'hotCoals', level: 5 }]
run.weaponMods.springGlove = { secondSpring: 1, bowlingPunch: 0.5 }
run.weaponMods.hotCoals = { bumper: 0.5 }
for (let i = 0; i < 90; i++) H.tick()
return () => { H.tickFx(); H.tickFx() }
