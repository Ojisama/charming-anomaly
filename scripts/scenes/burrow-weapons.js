// Book 3: the chapter's three weapons together on a pinned ring of its creatures, 0.15s per frame.
//   node scripts/fx-probe.mjs --scene scripts/scenes/burrow-weapons.js --chapter topsoil --url http://127.0.0.1:5912/ --out /tmp/w --frames 10
H.breed(12)
const cast = H.keep(12)
const ids = run.chapter === 'geode' ? ['olm', 'caveCricket', 'crystalCrab'] : ['earthworm', 'moleCricket', 'earthworm']
H.place((i, p) => ({ x: p.x + Math.cos(i * 0.52) * (110 + (i % 3) * 45), y: p.y + Math.sin(i * 0.52) * (110 + (i % 3) * 45) }))
cast.forEach((e, i) => { e.elite = false; e.affixes = []; e.rosterId = ids[i % 3]; e.radius = 15; e.flags = []; e.burrowed = false })
run.weapons = run.chapter === 'geode'
  ? [{ id: 'prismShard', level: 4 }, { id: 'echoPulse', level: 4 }, { id: 'stalactite', level: 4 }]
  : [{ id: 'shovel', level: 4 }, { id: 'pebbleSling', level: 4 }, { id: 'rootSnare', level: 4 }]
for (let i = 0; i < 70; i++) { H.tick(); H.pin() }
H.note(run.chapter + ' weapons: ' + run.weapons.map((w) => w.id).join(','))
return (age) => { for (let i = 0; i < 6; i++) { H.tickFx(); H.pin() } }
