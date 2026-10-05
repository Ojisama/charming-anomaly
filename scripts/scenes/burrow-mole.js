// Book 3 Topsoil: one mole from dig to cave-in. A mole starts 300px left of a still player and digs
// in (the travelling ridge), quakes under the player (cracks), erupts, and its tunnel caves in to pits
// that a ring of worms walks into. Each frame advances 0.2s with events forwarded.
//   node scripts/fx-probe.mjs --scene scripts/scenes/burrow-mole.js --chapter topsoil --url http://127.0.0.1:5912/ --out /tmp/mole --frames 26
H.breed(10)
const cast = H.keep(10)
const p = run.player
H.place((i) => i === 0 ? { x: p.x - 320, y: p.y + 40 } : { x: p.x - 360 + (i % 3) * 30, y: p.y - 120 + Math.floor(i / 3) * 60 })
const mole = cast[0]
mole.rosterId = 'mole'; mole.type = 'tank'; mole.radius = 26; mole.flags = ['tunnel', 'unshakeable']; mole.elite = false; mole.affixes = []
mole._fx = undefined; mole._fy = undefined
for (let i = 1; i < cast.length; i++) { cast[i].rosterId = 'earthworm'; cast[i].radius = 14; cast[i].elite = false; cast[i].affixes = []; cast[i]._fx = undefined; cast[i]._fy = undefined; cast[i].speed = 30 }
run.weapons = []
H.note('topsoil mole: dig -> quake -> erupt -> cave-in')
return (age) => { for (let i = 0; i < 12; i++) { H.tickFx(); run.weapons = [] } }
