// Scene: THE OPHAN'S CARDS AND ERASURE in the real game. The run is brought to just before the moment headless (H.until,
// events dropped), then crosses it on main.js's REAL ticker (app.ticker.update), so the event reaches render.js's Kraken
// ceremony exactly as in play. ?beat= picks the moment, each later frame ?step= seconds of ticker after the last:
//   arrive  the first ophanEnter (the name card)      return  p2's ophanEnter (MORE WINGS)
//   sketch  the last skin's break (IT WAS NEVER FINISHED)   win  the sketch killed (the eraser, the bloom, OPHAN ERASED)
//
//   FX_CHROME_ARGS='--use-gl=angle --use-angle=gl --enable-gpu --ignore-gpu-blocklist' node scripts/fx-probe.mjs \
//     --scene scripts/scenes/ophan-cards.js --out /tmp/oph-cards --frames 8 --chapter ophan --url 'http://127.0.0.1:5291/?beat=win&step=1'
const q = new URLSearchParams(location.search), beat = q.get('beat') || 'arrive', dS = +(q.get('step') || 0.5)
const CFG = window.__cfg, n = CFG.CHAPTERS.ophan.worlds.length
run.player.xpNext = 1e9
H.until(() => !!run.script?.oph, 50)
const o = run.script.oph
let now = performance.now()
const tick = () => { app.ticker.update(now += 1000 / 60); if (run.phase === 'levelup') run.phase = 'playing' }
const b = () => run.enemies.find((e) => e.rosterId === 'ophan' && !e._dead)
const nb = () => o.broken.reduce((s, v) => s + v, 0)
// STAGED: the worn skin put at the floor while the player stands in its world, so the next hit breaks it the real way
const breakTo = (k) => H.until(() => { const e = b(); if (e && nb() < k) { o.world = o.skin; e.hp = CFG.OPHAN_BREAK_FLOOR; o.atkCd = 99 } return nb() >= k }, 40000)
// the headless half stops one wave-clock short of the moment, the ticker crosses it
const wave = (stage) => H.until(() => o.stage === stage && o.waveT > 0 && o.waveT < 0.1, 40000)
let at = null
return async () => {
  document.getElementById('ui').style.display = ''
  if (!at) {
    // the warm-up first: in play the waves bake the later phases' art (the pencil paper is need 3) and the sim holds the
    // boss until they have; the headless skip below would outrun them
    for (let f = 0; window.__renderer.ophanReady() < 3 && f < 60 * 120; f++) await new Promise(requestAnimationFrame)
    run.player.hp = run.player.maxHP = 1e6
    if (beat === 'arrive') wave('open')
    if (beat === 'return') { breakTo(2); wave('wave') }
    if (beat === 'sketch' || beat === 'win') breakTo(n - 1)
    run.phase = 'playing'
    let g = 0
    const done = { arrive: () => o.bossId != null, return: () => o.stage === 'p2' && o.bossId != null, sketch: () => o.sketch, win: () => o.sketch }[beat]
    while (!done() && g++ < 60 * 60) {
      const e = b(); if (e && beat !== 'arrive' && beat !== 'return') { o.world = o.skin; e.hp = CFG.OPHAN_BREAK_FLOOR; o.atkCd = 99 }
      tick()
    }
    if (!done()) throw new Error('never reached ' + beat + ': ' + JSON.stringify({ stage: o.stage, waveT: o.waveT, broken: o.broken }))
    if (beat === 'win') { for (let i = 0; i < 4 * 60; i++) tick(); b().hp = 0; let k = 0; while (run.phase === 'playing' && k++ < 600) tick() }
    at = { ticks: g, t: +o.t.toFixed(2) }
  } else for (let i = 0; i < dS * 60; i++) tick()
  H.note(JSON.stringify({ beat, at, phase: run.phase, outro: +(run.bossOutroT ?? 0).toFixed(2), t: +o.t.toFixed(2) }))
}
