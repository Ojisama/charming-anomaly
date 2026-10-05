// Book 3 The Geode: prism shards bouncing off a crystal. The player stands just right of the nearest
// crystal pillar with a pack beyond it on the far side; the starter's shots strike the crystal and
// turn (light-trails show the bend), the crystal chimes. 0.1s per frame, events forwarded.
//   node scripts/fx-probe.mjs --scene scripts/scenes/burrow-bounce.js --chapter geode --url http://127.0.0.1:5912/ --out /tmp/bounce --frames 12
H.breed(8)
const cast = H.keep(8)
const p = run.player
const cs = (run.obstacles || []).filter((o) => o.kind === 'crystal')
cs.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
const c = cs[0]
p.x = c.x + c.r + 48; p.y = c.y
H.place((i) => ({ x: c.x - c.r - 60 - (i % 3) * 36, y: c.y + (i - 3.5) * 40 }))
cast.forEach((e, i) => { e.elite = false; e.affixes = []; e.rosterId = i % 2 ? 'olm' : 'caveCricket'; e.radius = 14 })
H.weapon('prismShard', 3)
H.note('geode bounce: crystal r=' + Math.round(c.r) + ' crystals=' + cs.length)
return (age) => { for (let i = 0; i < 6; i++) { H.tickFx(); H.pin() } }
