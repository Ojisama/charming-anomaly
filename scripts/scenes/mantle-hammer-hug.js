// Scene: THE CRACK HAMMER ON A FOE TOUCHING YOU: the stamp lands with no pool (hammerStamp), and the swing
// is drawn off that event. Every frame is one live sim step, from the cast.
//   node scripts/fx-probe.mjs --scene scripts/scenes/mantle-hammer-hug.js --chapter mantle \
//     --url http://127.0.0.1:PORT/ --out /tmp/hug --frames 26 --wait 60000
run.weapons = []
H.breed(1)
H.keep(1)
H.place((i, p) => ({ x: p.x + 36, y: p.y - 10 }))
H.weapon('crackHammer', 1)
run.weaponTimers.crackHammer = 0
return () => { H.tickFx(); window.__stampPools = (run.lavaPools ?? []).length }
