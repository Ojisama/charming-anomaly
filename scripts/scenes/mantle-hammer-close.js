// Scene: ONE CRACK HAMMER POOL'S END, played: the hammer stamps a foe 155px above the digger, then every
// frame is six live sim steps (0.1s) with the events forwarded, from 1.6s into the pool's life through
// its close and the wet rock it leaves (the floor shader's poolLive recede and its ghost).
//   node scripts/fx-probe.mjs --scene scripts/scenes/mantle-hammer-close.js --chapter mantle \
//     --url http://127.0.0.1:PORT/ --out /tmp/hc --frames 32 --wait 60000
run.weapons = []
H.breed(1)
H.keep(1)
H.place((i, p) => ({ x: p.x + 40, y: p.y - 150 }))
H.weapon('crackHammer', 1)
run.weaponTimers.crackHammer = 0
if (!H.until(() => (run.lavaPools ?? []).length > 0, 300)) throw new Error('the hammer never stamped')
run.weapons = []
run.enemies = []
while (run.lavaPools[0] && run.lavaPools[0].t < 1.6) H.tickFx()
return () => { for (let i = 0; i < 6; i++) H.tickFx() }
