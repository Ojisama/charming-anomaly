// Glue: boots Pixi, owns the tick loop and phase transitions. Keep logic in sim/ui/render.
import { Application } from 'pixi.js'
import { loadMeta, saveMeta, createRun } from './state.js'
import { shopCost, SHOP, MAX_SHOP_LEVEL, runBonusCoins } from './config.js'
import { stepSim, applyChoice } from './sim.js'
import { createRenderer } from './render.js'
import { initUI } from './ui.js'
import { initInput, getInput } from './input.js'
import { initAudio, playSfx } from './audio.js'

// No top-level await: suspending module evaluation deadlocks Pixi's dynamically
// imported environment code in the production bundle (TDZ/hang on a blank page).
boot()

async function boot() {
const meta = loadMeta()
let run = null

const app = new Application()
await app.init({
  resizeTo: window,
  background: 0xf4efe6,
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
})
document.getElementById('game').appendChild(app.canvas)

const renderer = createRenderer(app)
await renderer.ready // prop sprites load async
if (new URLSearchParams(location.search).has('debug')) window.__app = app
initInput(document.body)

const ui = initUI({
  meta,
  onPlay() {
    initAudio()
    run = createRun(meta)
    if (new URLSearchParams(location.search).has('debug')) window.__run = run
    renderer.reset(run)
    ui.showScreen('hud')
  },
  onBuy(id) {
    const level = meta.shop[id]
    const cost = shopCost(id, level)
    if (level >= MAX_SHOP_LEVEL || meta.coins < cost) return false
    meta.coins -= cost
    meta.shop[id] = level + 1
    saveMeta(meta)
    playSfx('buy')
    return true
  },
  onChoose(i) {
    if (!run || run.phase !== 'levelup') return
    applyChoice(run, i)
    run.phase = 'playing'
    ui.showScreen('hud')
    playSfx('click')
  },
  onPauseToggle() {
    if (!run) return
    if (run.phase === 'playing') { run.phase = 'paused'; ui.showScreen('pause') }
    else if (run.phase === 'paused') { run.phase = 'playing'; ui.showScreen('hud') }
  },
  onQuit() {  // from pause or summary back to title
    run = null
    renderer.reset(null)
    ui.showScreen('title')
  },
})

const SFX_FOR_EVENT = {
  hit: 'hit', kill: 'kill', gem: 'gem', coin: 'coin',
  levelup: 'levelup', hurt: 'hurt', dead: 'death', victory: 'victory', shoot: 'shoot',
  explode: 'explode', zap: 'zap', hole: 'hole', beam: 'beam',
  // element combos reuse the closest existing sfx
  shatter: 'explode', overload: 'explode', frostarc: 'zap', conduct: 'zap',
}

function endRun(victory) {
  const bonus = runBonusCoins(run.kills)
  const earned = run.coinsEarned + bonus
  meta.coins += earned
  meta.runs += 1
  meta.best.time = Math.max(meta.best.time, Math.floor(run.time))
  meta.best.kills = Math.max(meta.best.kills, run.kills)
  saveMeta(meta)
  ui.showScreen('summary', { victory, time: run.time, kills: run.kills, level: run.player.level, earned, bonus })
}

app.ticker.add((ticker) => {
  const dt = Math.min(ticker.deltaMS / 1000, 0.05)
  if (!run) { renderer.idle(dt); return }

  if (run.phase === 'playing') {
    run.viewRadius = Math.hypot(app.screen.width, app.screen.height) / 2
    stepSim(run, getInput(), dt)
    const events = run.events
    run.events = []
    renderer.sync(run, dt, events)
    for (const e of events) {
      if (e.dot) continue // DoT ticks are silent — they'd drone constantly
      const s = SFX_FOR_EVENT[e.type]
      if (s) playSfx(s)
    }
    ui.updateHUD(run)
    if (run.phase === 'levelup') ui.showScreen('levelup', run.levelUpChoices)
    else if (run.phase === 'dead') endRun(false)
    else if (run.phase === 'victory') endRun(true)
  } else {
    renderer.sync(run, 0, [])   // frozen world behind modals
  }
})

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
}
