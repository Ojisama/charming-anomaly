// Scene: THE MANTLE'S STALAGMITES as the map streams them (run.obstacles kind 'stalagmite'), round a
// player walked out from the spawn, with a little crowd. Not staged: the field is the real one.
//   node scripts/fx-probe.mjs --scene scripts/scenes/mantle-stalagmites.js --chapter mantle \
//     --url 'http://127.0.0.1:PORT/?walk=600' --out /tmp/st --frames 1 [--w 1280 --h 800]
//   walk=N  px the player is moved north-east before streaming (another stretch of the map)
const walk = Number(new URLSearchParams(location.search).get('walk') || 600)
const p = run.player
run.weapons = []
p.x += walk * 0.7; p.y -= walk * 0.7
H.breed(10)
for (let i = 0; i < 90; i++) H.tick()
const near = run.obstacles.filter((o) => Math.hypot(o.x - p.x, o.y - p.y) < 700)
if (!near.some((o) => o.kind === 'stalagmite')) throw new Error(`no stalagmite within 700px (${run.obstacles.length} obstacles live)`)
for (let i = 0; i < 30; i++) { H.tick(); H.render() }
