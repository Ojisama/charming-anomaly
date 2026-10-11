// Book 3 The Geode: ONE prism shard into crystal A splits into two sub-shards. Crystal B sits in hop
// reach up-left, a small pack stands on A's open side down-right: one sub-shard hops on to B,
// the other turns onto the pack. No weapon equipped (it would aim at the pack, never at A); the
// shard is thrown by hand. 4 sim steps per frame, events forwarded.
//   node scripts/fx-probe.mjs --scene scripts/scenes/geode-split.js --chapter geode --url http://127.0.0.1:5420/ --out /tmp/split --frames 12
H.breed(5)
const cast = H.keep(5)
run.weapons = []
const p = run.player
run.obstacles = run.obstacles.filter((o) => o.kind !== 'crystal' || Math.hypot(o.x - p.x, o.y - p.y) > 900)
const A = { x: p.x, y: p.y - 150, r: 44, kind: 'crystal', rot: 0, _cell: 'scene:A' }
const B = { x: A.x - 110, y: A.y - 170, r: 40, kind: 'crystal', rot: 0.6, _cell: 'scene:B' }
run.obstacles.push(A, B)
run._obstacleRev = (run._obstacleRev || 0) + 1
H.place((i) => ({ x: A.x + 125 + (i % 2) * 40, y: A.y + 80 + i * 32 }))
cast.forEach((e, i) => { e.elite = false; e.affixes = []; e.rosterId = i % 2 ? 'olm' : 'caveCricket'; e.radius = 14; e.speed = 0 })
run.bullets = []
const dx = A.x - p.x, dy = A.y - p.y, d = Math.hypot(dx, dy)
run.bullets.push({ x: p.x + (dx / d) * 30, y: p.y + (dy / d) * 30, vx: (dx / d) * 520, vy: (dy / d) * 520, dmg: 20, pierce: 2, _pierce0: 2,
  life: 1.2, r: 8, speed: 520, hitIds: new Set(), _shard: true, _splitDone: true, _chainsLeft: 0, weapon: 'prism' })
H.note('geode split: A r=' + A.r + ' B r=' + B.r)
return (age) => { for (let i = 0; i < 4; i++) { H.tickFx(); H.pin() } }
