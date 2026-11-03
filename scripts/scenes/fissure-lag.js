// Scene: WHAT THE FISSURE COSTS TO DRAW. 360 frames per config; sync+render timed (gl finish), split
// into frames while a crack grows vs not. Warm-up config first, so JIT lands outside the rows.
// Read growMed / growP90. NOT growMax: this machine stalls 300-900ms now and then with no weapon at all.
// For a before/after, extract the old tree (git archive HEAD) and serve it on a second vite port:
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/fissure-lag.js --chapter magma \
//     --url 'http://127.0.0.1:PORT/' --out /tmp/lag --frames 5 --json /tmp/lag.json
//
// Copy it for another in-play bake: swap the weapon and the worst-build mods in CFG.
const CFG = [
  ['warmup', 5, { fragileGround: 5 }],
  ['L5', 5, {}],
  ['L5+both', 5, { fragileGround: 5, bubblingLava: 1 }],
  ['L5 again', 5, {}],
  ['L5+both again', 5, { fragileGround: 5, bubblingLava: 1 }],
]
const result = { rows: [] }
window.__fxResult = result
run.weapons = []
if (!H.breed(12)) throw new Error('never bred')
H.keep(12)
const SPOTS = [[90, 6], [170, -8], [250, 10], [-150, 120], [-200, -60], [40, -190], [120, 180], [-60, 210], [220, -150], [-230, 30], [10, 260], [-120, -220]]
H.place((i, pl) => ({ x: pl.x + SPOTS[i][0], y: pl.y + SPOTS[i][1] }))
for (let i = 0; i < 30; i++) { H.tick(); H.pin() }
let i = 0
const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return +s[Math.floor(q * (s.length - 1))].toFixed(2) }
return async () => {
  const [name, lvl, mods] = CFG[Math.min(i++, CFG.length - 1)]
  run.weapons = []; run.cracks = []; run.fissures = []; run.slagPools = []; run.magmaLobs = []
  H.weapon('fissure', lvl); run.weaponMods.fissure = { ...mods }; run.weaponTimers.fissure = 1e-4
  const grow = [], idle = []
  for (let f = 0; f < 360; f++) {
    if (run.phase === 'levelup') { run.phase = 'playing'; run.levelUpChoices = [] }
    H.tick(); H.pin()
    const b = performance.now()
    window.__renderer.sync(run, 1 / 60, run.events.splice(0))
    app.renderer.render(app.stage)
    app.renderer.gl?.finish?.()
    ;(run.fissures.length ? grow : idle).push(performance.now() - b)
  }
  const sum = (xs) => +xs.reduce((p, x) => p + x, 0).toFixed(0)
  result.rows.push({ name, growN: grow.length, growMed: pct(grow, 0.5), growP90: pct(grow, 0.9), growMax: pct(grow, 1), growSum: sum(grow), idleMed: pct(idle, 0.5), idleP90: pct(idle, 0.9) })
}
