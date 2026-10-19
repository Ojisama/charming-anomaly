// Topsoil's elites, at rest (frame 0) and mid hit-flash (frame 1): what they wear must survive the
// flash, and no crown may appear. STAGED — compares two states of one bake, not evidence about play.
//   node scripts/fx-probe.mjs --scene scripts/scenes/topsoil-elite-flash.js --chapter topsoil --url http://127.0.0.1:5912/ --out /tmp/ef --frames 2
H.breed(3)
const cast = H.keep(3)
const ids = ['earthworm', 'moleCricket', 'badger']
H.place((i, p) => ({ x: p.x - 90 + i * 90, y: p.y - 90 }))
cast.forEach((e, i) => { e.elite = true; e.affixes = [['shielded'], ['splitter', 'frenzied'], ['gilded']][i]; e.rosterId = ids[i]; e.radius = 18; e.flags = []; e.burrowed = false; e.hp = e.maxHP })
run.weapons = []
for (let i = 0; i < 30; i++) { H.tick(); H.pin() }
H.note('topsoil elites: frame 0 at rest, frame 1 flashing')
return (age) => { cast.forEach((e) => { e.hitFlash = age > 0.5 ? 0.1 : 0; e.hp = e.maxHP }); H.render() }
