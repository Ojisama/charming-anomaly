// Glue: boots Pixi, owns the tick loop and phase transitions. Keep logic in sim/ui/render.
import { Application } from 'pixi.js'
import { loadMeta, saveMeta, resetSave, createRun, ensureChapterMeta } from './state.js'
import { shopCost, SHOP, MAX_SHOP_LEVEL, runBonusCoins, dailyMutators, todayKey, randomMutators, MAX_DIFFICULTY, CHAPTER_UNLOCK_DIFFICULTY, difficultyCoinMul, CONSUMABLES, rerollCost, ANOMALY_REROLL_COST, sacrificeCost, CHAPTERS, nextChapter, dailyChapter, chapterMaxDifficulty } from './config.js'
import { stepSim, applyChoice, buildLevelUpChoices } from './sim.js'
import { createRenderer } from './render.js'
import { initUI } from './ui.js'
import { initInput, getInput, pressSkill } from './input.js'
import { initAudio, playSfx } from './audio.js'
import { setLang } from './i18n.js'

// No top-level await: suspending module evaluation deadlocks Pixi's dynamically
// imported environment code in the production bundle (TDZ/hang on a blank page).
boot()

async function boot() {
const meta = loadMeta()
setLang(meta.lang) // i18n before any screen renders — ui.js translates at render time
let run = null
let runMode = 'classic'
// v6.0.2: a classic run staged behind the anomaly briefing screen — set by onPlay when the
// roll produced anomalies, consumed by onBriefStart. Overwritten by the next Play if the
// player backs out via the nav (nothing was created or spent, so abandoning it is free).
let pendingPlay = null

// Spend boosters (cheapest-first affordability, ui already gates but belt-and-braces), create
// the classic run with the EXACT mutators the briefing showed, and start it.
function startClassic(chapter, difficulty, mutators, consumableIds) {
  const ids = []
  if (consumableIds && consumableIds.length) {
    const sorted = [...consumableIds].sort((a, b) => (CONSUMABLES[a]?.cost ?? 0) - (CONSUMABLES[b]?.cost ?? 0))
    let remaining = meta.coins
    for (const id of sorted) {
      const cost = CONSUMABLES[id]?.cost ?? 0
      if (cost <= remaining) { ids.push(id); remaining -= cost }
    }
    if (ids.length > 0) {
      meta.coins -= ids.reduce((sum, id) => sum + (CONSUMABLES[id]?.cost ?? 0), 0)
      saveMeta(meta)
      playSfx('buy')
    }
  }
  run = createRun(meta, { chapter, mutators, difficulty, consumables: ids })
  beginRun()
}

function beginRun() {
  if (new URLSearchParams(location.search).has('debug')) window.__run = run
  renderer.reset(run)
  ui.showScreen('hud')
}

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
if (new URLSearchParams(location.search).has('debug')) {
  window.__app = app
  // MAP MODE (v5.12, dev only): lets a debug session hide the player/entities/weather and stitch a
  // wide-area view of the procedural world by driving renderer.sync + a direct render() per tile.
  // A gameplay viewport shows about one city block, which is far too small a window to judge
  // whether a coastline is straight or whether blocks agree with the streets they front.
  window.__renderer = renderer
  // streamObstacles only materialises structures within OBSTACLE_STREAM_RADIUS of the player, so a
  // map-mode capture has to advance the sim at each tile position to stream that tile's buildings
  // in before rendering it.
  window.__stepSim = stepSim
}
initInput(document.body)

const ui = initUI({
  meta,
  onPlay(mode, consumableIds = []) {
    initAudio()
    runMode = mode
    // Daily = fixed shared seed, date-seeded chapter (see dailyChapter in config.js), base
    // difficulty — allowed on a chapter this player hasn't unlocked yet (spec: preview day).
    // Its anomaly is already explained by the daily briefing screen the player just came from.
    if (mode === 'daily') {
      const chapter = dailyChapter(todayKey())
      run = createRun(meta, { chapter, mutators: dailyMutators(todayKey(), chapter) })
      beginRun()
      return
    }
    // Classic = the selected chapter (meta.chapter) at ITS OWN difficulty ladder (level 1 adds
    // nothing, each level above adds one random mutator + enemy HP) — see meta.chapters[id] in
    // state.js. v6.0.2: when the roll produced anomalies, the run does NOT start yet — the
    // briefing screen explains them first, and only its Start button (onBriefStart) creates the
    // run, with the exact ids shown. Nothing is spent yet, so backing out via the nav is free.
    const chMeta = ensureChapterMeta(meta, meta.chapter)
    // The Blank's difficulty ladder is a fixed, named set of modifiers per level (see
    // CHAPTERS.blank.modsByDifficulty) rather than random picks — its whole point is a
    // scripted, repeatable fight.
    const mutators = meta.chapter === 'blank'
      ? (CHAPTERS.blank.modsByDifficulty[chMeta.difficulty] ?? [])
      : randomMutators(chMeta.difficulty - 1, meta.chapter)
    if (mutators.length > 0) {
      pendingPlay = { chapter: meta.chapter, difficulty: chMeta.difficulty, mutators, consumableIds }
      ui.showScreen('brief', { chapterId: meta.chapter, difficulty: chMeta.difficulty, mutators, reroll: meta.chapter !== 'blank' })
      return
    }
    startClassic(meta.chapter, chMeta.difficulty, mutators, consumableIds)
  },
  onBriefStart() {
    if (!pendingPlay) return
    const p = pendingPlay
    pendingPlay = null
    startClassic(p.chapter, p.difficulty, p.mutators, p.consumableIds)
  },
  // v6.0.4: reroll the staged anomaly set for ANOMALY_REROLL_COST, repeatable while affordable.
  // Blank never gets here (its brief passes reroll: false and the guard below is belt-and-braces —
  // its ladder is fixed by design).
  onBriefReroll() {
    if (!pendingPlay || pendingPlay.chapter === 'blank') return
    if (meta.coins < ANOMALY_REROLL_COST) return
    meta.coins -= ANOMALY_REROLL_COST
    saveMeta(meta)
    playSfx('buy')
    pendingPlay.mutators = randomMutators(pendingPlay.difficulty - 1, pendingPlay.chapter)
    ui.showScreen('brief', { chapterId: pendingPlay.chapter, difficulty: pendingPlay.difficulty, mutators: pendingPlay.mutators, reroll: true })
  },
  // v6.1 i18n: the title screen's 🌐 toggle. Persist, switch the live dictionary, and let ui.js
  // re-render the title itself (same pattern as onDifficulty/onChapter).
  onLang(l) {
    meta.lang = l
    saveMeta(meta)
    setLang(l)
    playSfx('click')
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
    // Belt-and-braces with the UI: never let a locked level (above the SELECTED chapter's
    // maxDifficulty) stick, even if a stray click somehow got through disabled/no-op pips.
    const chMeta = ensureChapterMeta(meta, meta.chapter)
    chMeta.difficulty = Math.max(1, Math.min(chMeta.maxDifficulty, Math.min(chapterMaxDifficulty(meta.chapter), d)))
    saveMeta(meta)
    playSfx('click')
  },
  // Title screen's chapter selector (v5.0). Belt-and-braces with the UI: never select a chapter
  // that isn't unlocked, even if a stray click somehow got through a disabled locked card. ui.js
  // re-renders the title itself right after calling this (same pattern as onDifficulty above).
  onChapter(id) {
    if (!ensureChapterMeta(meta, id).unlocked) return
    meta.chapter = id
    saveMeta(meta)
    playSfx('click')
  },
  onReroll() {
    if (!run || run.phase !== 'levelup') return
    const cost = rerollCost(run._rerolls ?? 0)
    // Rerolls spend the RUN's coins (the HUD counter), not the meta bank — spending mid-run
    // shrinks the end-of-run payout, and the number next to the button matches what you see
    // in the HUD (v5.1 fix; players read the two same-icon wallets as one).
    if ((run.coinsEarned ?? 0) < cost) return
    run.coinsEarned -= cost
    run._rerolls = (run._rerolls ?? 0) + 1
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
  onSkill() { pressSkill() },   // v5.21 lane: HUD button -> input.js latch -> stepSim's input.skill
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
    coins: run.coinsEarned,  // run coins — rerolls spend these, see onReroll
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
  // v5.8 kaiju redesign (skies): a structure destroyed by crushing — own sfx (audio.js), throttled
  // there like shoot/hit/zap so a rampage flattening dozens of structures a second doesn't machine-
  // gun the audio graph (design doc §2, "audio machine-gunning").
  crush: 'crush',
  // v5.21 lane (beyond): the active shove reuses the hole whoosh, and a rock clipping the player
  // is an ordinary hurt — it is damage, not a special occasion.
  repulse: 'hole', rockhit: 'hurt',
  // v5.24 The Blank: the boss's scripted arrival/final kill and the P2 node yank each get their
  // own beat (audio.js) — the fight only has three of these total, no throttling needed.
  bossSpawn: 'bossRise', bossDead: 'bossFall', yank: 'zap',
}

function endRun(victory) {
  const bonus = Math.round(runBonusCoins(run.kills) * difficultyCoinMul(run.difficulty ?? 1))
  const earned = run.coinsEarned + bonus
  meta.coins += earned
  meta.runs += 1
  // meta.best: all-time aggregate across every chapter (see state.js doc block), kept
  // unconditionally alongside the per-chapter best below.
  meta.best.time = Math.max(meta.best.time, Math.floor(run.time))
  meta.best.kills = Math.max(meta.best.kills, run.kills)

  const chMeta = ensureChapterMeta(meta, run.chapter)
  chMeta.best.time = Math.max(chMeta.best.time, Math.floor(run.time))
  chMeta.best.kills = Math.max(chMeta.best.kills, run.kills)

  // Difficulty unlock (v4.10, now per-chapter): winning a classic run at the run's chapter's
  // current ceiling unlocks the next level FOR THAT CHAPTER. Only fires on the level actually
  // at the ceiling (winning a lower, already-unlocked level doesn't re-unlock anything), and
  // only while there's a level left to unlock.
  const runChapterMaxDifficulty = chapterMaxDifficulty(run.chapter)
  const unlockedDifficulty = victory && runMode === 'classic' &&
    (run.difficulty ?? 1) >= chMeta.maxDifficulty && chMeta.maxDifficulty < runChapterMaxDifficulty
  if (unlockedDifficulty) chMeta.maxDifficulty = Math.min(runChapterMaxDifficulty, (run.difficulty ?? 1) + 1)

  // Chapter unlock (v5.0): winning a classic run at difficulty 3+ unlocks the NEXT chapter (see
  // nextChapter in config.js), if there is one and it isn't already unlocked. Guarded on "not
  // already unlocked" purely so the summary badge only fires once (replaying at 3+ afterward
  // shouldn't keep announcing it).
  let unlockedChapter = null
  if (victory && runMode === 'classic' && (run.difficulty ?? 1) >= CHAPTER_UNLOCK_DIFFICULTY) {
    const next = nextChapter(run.chapter)
    if (next) {
      const nextMeta = ensureChapterMeta(meta, next)
      if (!nextMeta.unlocked) {
        nextMeta.unlocked = true
        unlockedChapter = CHAPTERS[next].name
      }
    }
  }

  // Hidden chapter unlock (v5.24): winning The Beyond at its top difficulty (5) reveals The
  // Blank — no entry in CHAPTER_ORDER, no per-difficulty ladder tie-in, just this one gate.
  // Guarded on "not already unlocked" so replaying the win doesn't keep announcing it.
  let unlockedHiddenChapter = null
  if (victory && runMode === 'classic' && run.chapter === 'beyond' && (run.difficulty ?? 1) >= 5) {
    const blankMeta = ensureChapterMeta(meta, 'blank')
    if (!blankMeta.unlocked) {
      blankMeta.unlocked = true
      unlockedHiddenChapter = CHAPTERS.blank.name
    }
  }

  saveMeta(meta)
  ui.showScreen('summary', {
    victory, time: run.time, kills: run.kills, level: run.player.level, earned, bonus,
    mutators: run.mutators, mode: runMode,
    unlockedDifficulty: unlockedDifficulty ? chMeta.maxDifficulty : null,
    unlockedChapter,
    unlockedHiddenChapter,
  })
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
