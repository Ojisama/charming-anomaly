// Glue: boots Pixi, owns the tick loop and phase transitions. Keep logic in sim/ui/render.
import { Application } from 'pixi.js'
import { loadMeta, saveMeta, resetSave, createRun } from './state.js'
import { shopCost, SHOP, MAX_SHOP_LEVEL, runBonusCoins, dailyMutators, todayKey, randomMutators, MAX_DIFFICULTY, difficultyCoinMul, CONSUMABLES, rerollCost, sacrificeCost } from './config.js'
import { stepSim, applyChoice, buildLevelUpChoices } from './sim.js'
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
let runMode = 'classic'

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
  onPlay(mode, consumableIds = []) {
    initAudio()
    runMode = mode
    // Boosters never apply to daily runs (ui.js already passes [] there, but classic is the
    // only mode that gets to spend meta.coins on them — belt-and-braces here too).
    let ids = []
    if (mode === 'classic' && consumableIds && consumableIds.length) {
      // Affordability: keep cheapest-first until meta.coins runs out, silently drop the rest.
      const sorted = [...consumableIds].sort((a, b) => (CONSUMABLES[a]?.cost ?? 0) - (CONSUMABLES[b]?.cost ?? 0))
      let remaining = meta.coins
      for (const id of sorted) {
        const cost = CONSUMABLES[id]?.cost ?? 0
        if (cost <= remaining) { ids.push(id); remaining -= cost }
      }
      if (ids.length > 0) {
        const totalCost = ids.reduce((sum, id) => sum + (CONSUMABLES[id]?.cost ?? 0), 0)
        meta.coins -= totalCost
        saveMeta(meta)
        playSfx('buy')
      }
    }
    // Daily = fixed shared seed at base difficulty; classic = meta.difficulty
    // (level 1 adds nothing, each level above adds one random mutator + enemy HP).
    run = mode === 'daily'
      ? createRun(meta, { mutators: dailyMutators(todayKey()) })
      : createRun(meta, { mutators: randomMutators((meta.difficulty ?? 1) - 1), difficulty: meta.difficulty ?? 1, consumables: ids })
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
    if (run.phase === 'playing') { run.phase = 'paused'; ui.showScreen('pause', { mutators: run.mutators, mode: runMode }) }
    else if (run.phase === 'paused') { run.phase = 'playing'; ui.showScreen('hud') }
  },
  onDifficulty(d) {
    meta.difficulty = Math.max(1, Math.min(MAX_DIFFICULTY, d))
    saveMeta(meta)
    playSfx('click')
  },
  onReroll() {
    if (!run || run.phase !== 'levelup') return
    const cost = rerollCost(run._rerolls ?? 0)
    if (meta.coins < cost) return
    meta.coins -= cost
    run._rerolls = (run._rerolls ?? 0) + 1
    saveMeta(meta)
    run.levelUpChoices = buildLevelUpChoices(run)
    playSfx('buy')
    ui.showScreen('levelup', levelupData())
  },
  // Sacrifice already-purchased shop levels for a permanent 3rd/4th level-up card slot (v4.8;
  // see meta.choiceSlots in state.js and sacrificeCost in config.js). picks: { [statId]: count }.
  // Validates independently of the UI (which disables the confirm button) — belt and braces.
  onSacrifice(picks) {
    const slots = meta.choiceSlots ?? 2
    if (slots >= 4) return false
    const cost = sacrificeCost(slots)
    if (cost == null) return false
    let total = 0
    for (const [id, count] of Object.entries(picks ?? {})) {
      if (!SHOP[id] || !Number.isInteger(count) || count < 0 || count > (meta.shop[id] ?? 0)) return false
      total += count
    }
    if (total !== cost) return false
    for (const [id, count] of Object.entries(picks)) meta.shop[id] -= count
    meta.choiceSlots = slots + 1
    saveMeta(meta)
    playSfx('buy')
    return true
  },
  onQuit() {  // from pause or summary back to title
    run = null
    renderer.reset(null)
    ui.showScreen('title')
  },
  // Shop's "Reset all progress" button (full new-game wipe) — erase the save and reload so
  // every module re-reads a fresh loadMeta() rather than trying to reconcile in-memory state.
  onReset() {
    resetSave()
    location.reload()
  },
})

// Everything the level-up screen needs to render its cards + footer buttons.
function levelupData() {
  return {
    choices: run.levelUpChoices,
    rerollCost: rerollCost(run._rerolls ?? 0),
    coins: meta.coins,
  }
}

const SFX_FOR_EVENT = {
  hit: 'hit', kill: 'kill', gem: 'gem', coin: 'coin',
  levelup: 'levelup', hurt: 'hurt', dead: 'death', victory: 'victory', shoot: 'shoot',
  explode: 'explode', hole: 'hole', beam: 'beam',
  // element combos reuse the closest existing sfx
  shatter: 'explode', overload: 'explode', frostarc: 'zap', conduct: 'zap',
  // Revive Token firing reuses the levelup jingle — it's a "good news" beat, same register
  revive: 'levelup',
}

function endRun(victory) {
  const bonus = Math.round(runBonusCoins(run.kills) * difficultyCoinMul(run.difficulty ?? 1))
  const earned = run.coinsEarned + bonus
  meta.coins += earned
  meta.runs += 1
  meta.best.time = Math.max(meta.best.time, Math.floor(run.time))
  meta.best.kills = Math.max(meta.best.kills, run.kills)
  saveMeta(meta)
  ui.showScreen('summary', { victory, time: run.time, kills: run.kills, level: run.player.level, earned, bonus, mutators: run.mutators, mode: runMode })
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
    if (run.phase === 'levelup') ui.showScreen('levelup', levelupData())
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
