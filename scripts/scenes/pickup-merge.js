// Scene: MOCKUP of merged floor pickups (endless lag fix). Staged: compares bakes, not a real frame.
// Same field of drops under every ?tv= look; tv=0 is today (every gem its own sprite).
//   node scripts/fx-probe.mjs --scene scripts/scenes/pickup-merge.js --frames 1 --out /tmp/pm0 --url 'http://127.0.0.1:5203/?tv=0'
const tv = Number(new URLSearchParams(location.search).get('tv') || 0)
H.breed(30)
const crowd = H.keep(30)
let s = 7
const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
H.place(() => ({ x: run.player.x + (rnd() - 0.5) * 360, y: run.player.y + (rnd() - 0.5) * 780 }))
// clumps of kills: centre + how many gems/coins dropped there
const p = run.player
const clumps = []
for (let i = 0; i < 42; i++) {
  const cx = p.x + (rnd() - 0.5) * 360, cy = p.y + (rnd() - 0.5) * 780
  if (Math.hypot(cx - p.x, cy - p.y) < 50) continue
  const n = [1, 2, 3, 4, 6, 8, 12, 20, 30, 60, 150][Math.floor(rnd() * 11)]
  clumps.push({ cx, cy, n, coins: Math.floor(n / 3 + rnd() * 2) })
}
const lay = () => {
  const gems = [], coins = []
  const jitter = (c, r) => ({ x: c.cx + (rnd() - 0.5) * r, y: c.cy + (rnd() - 0.5) * r })
  s = 99
  if ([1, 2, 4, 5, 6].includes(tv)) {
    for (const c of clumps) {
      gems.push({ x: c.cx, y: c.cy, xp: c.n })
      if (c.coins) coins.push({ x: c.cx + 14, y: c.cy + 6, value: c.coins })
    }
  } else {
    for (const c of clumps) {
      for (let k = 0; k < Math.min(c.n, 25); k++) gems.push({ ...jitter(c, 26 + c.n), xp: 1 })
      for (let k = 0; k < c.coins; k++) coins.push({ ...jitter(c, 30 + c.n), value: 1 })
    }
    if (tv === 3 || tv === 7 || tv === 9) {
      // over the cap: the extra goes into ONE crystal / ONE bag
      const extraG = gems.splice(120), extraC = coins.splice(25)
      gems.push({ x: p.x + 110, y: p.y - 230, xp: extraG.length, _overflow: true })
      coins.push({ x: p.x - 120, y: p.y + 260, value: extraC.length, _overflow: true })
    }
    if (tv === 8) {
      // one chest holds both
      const extraG = gems.splice(120), extraC = coins.splice(25)
      gems.push({ x: p.x + 110, y: p.y - 230, xp: extraG.length, coins: extraC.length, _chest: true })
    }
  }
  run.gems = gems; run.coins = coins
  H.note(JSON.stringify({ tv, gems: gems.length, coins: coins.length }))
}
return () => { try { lay(); H.render() } catch (e) { H.note('THREW: ' + e.message + ' ' + e.stack.split('\n')[1]) } }
