// Glue: boots Pixi, owns the tick loop and phase transitions. Keep logic in sim/ui/render.
import { Application } from 'pixi.js'
import { loadMeta, saveMeta, resetSave, createRun, ensureChapterMeta, setActiveSlot, activeSlot, setSlotName, cleanName } from './state.js'
import { shopCost, SHOP, MAX_SHOP_LEVEL, runBonusCoins, dailyMutators, todayKey, randomMutators, rerollMutator, MAX_DIFFICULTY, CHAPTER_UNLOCK_DIFFICULTY, difficultyCoinMul, CONSUMABLES, ANOMALY_REROLL_COST, sacrificeCost, LIGHT_THIEF_COST, CHAPTERS, nextChapter, dailyChapter, chapterMaxDifficulty, resolveChapterId, playableChapterId, chapterAvailable, COIN_CAP_PER_RUN } from './config.js'
import { stepSim, applyChoice, rerollLevelUpChoices, rerollPrice, buildReadout, devCards, devTake } from './sim.js'
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
// v6.0.2: a classic run staged behind the pre-run summary screen — set by onPlay, consumed by
// onBriefStart. Overwritten by the next Play if the player backs out via the nav (nothing was
// created or spent, so abandoning it is free).
let pendingPlay = null
// The dev menu's current card list. ui.js hands back an INDEX into it, so it has to be the same
// array the screen was rendered from — rebuilt on every open and every take (see onDevOpen).
let devList = []

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
  onPlay(mode) {
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
    // state.js. v6.0.2: the run does NOT start yet — the pre-run summary explains the anomalies
    // and takes the booster picks first, and only its Start button (onBriefStart) creates the run,
    // with the exact ids shown. Nothing is spent yet, so backing out via the nav is free.
    // R1 (see resolveChapterId in config.js): meta.chapter is a pointer into CHAPTERS and loadMeta
    // never repairs it, so a save from a build that shipped a chapter this one lacks can name one
    // that isn't here. createRun already degrades such a run to CHAPTER_ORDER[0] — resolve the same
    // way BEFORE reading any ladder, so the difficulty, the anomaly roll, the briefing and (via
    // run.chapter) endRun's credit all name the chapter that will actually be played. Reading the
    // unknown chapter's ladder instead would launch The Body at a level the player never unlocked
    // there and hand it that chapter's win. In memory only: meta.chapter is never written back.
    // v7.x: playableChapterId, which is resolveChapterId plus the WIP gate. THE PLAY PATH IS THE
    // ONLY PLACE THAT GATE BELONGS — putting it inside resolveChapterId instead would reach
    // createRun's own second resolve (state.js), which has no meta, and silently turn every gated
    // run into a Body run credited to body's ledger. onDifficulty below must use the same helper:
    // it writes into the ledger of whatever this launches, so the two moving apart is a mismatch.
    const chapterId = playableChapterId(meta)
    const chMeta = ensureChapterMeta(meta, chapterId)
    // The Blank's difficulty ladder is a fixed, named set of modifiers per level (see
    // CHAPTERS.blank.modsByDifficulty) rather than random picks — its whole point is a
    // scripted, repeatable fight.
    const mutators = chapterId === 'blank'
      ? (CHAPTERS.blank.modsByDifficulty[chMeta.difficulty] ?? [])
      : randomMutators(chMeta.difficulty - 1, chapterId)
    // v6.7: EVERY classic run stops here first, even a difficulty-1 roll with no anomalies at all —
    // the brief is the pre-run summary now and owns the booster picks, so skipping it when the roll
    // is empty would make boosters unreachable at difficulty 1. The booster picks arrive one hook
    // later, on onBriefStart (see the ui.js contract).
    pendingPlay = { chapter: chapterId, difficulty: chMeta.difficulty, mutators }
    ui.showScreen('brief', { chapterId, difficulty: chMeta.difficulty, mutators, reroll: chapterId !== 'blank' })
  },
  onBriefStart(consumableIds = []) {
    if (!pendingPlay) return
    const p = pendingPlay
    pendingPlay = null
    startClassic(p.chapter, p.difficulty, p.mutators, consumableIds)
  },
  // v6.0.4/v6.6.19: reroll ONE staged anomaly (by index) for ANOMALY_REROLL_COST, repeatable while
  // affordable — see rerollMutator in config.js for why a whole-set reroll was worthless. Blank
  // never gets here (its brief passes reroll: false and the guard below is belt-and-braces — its
  // ladder is fixed by design). Charge only once the swap is known to be possible.
  onBriefReroll(i) {
    if (!pendingPlay || pendingPlay.chapter === 'blank') return
    if (meta.coins < ANOMALY_REROLL_COST) return
    const next = rerollMutator(pendingPlay.mutators, i, pendingPlay.chapter)
    if (!next) return
    meta.coins -= ANOMALY_REROLL_COST
    saveMeta(meta)
    playSfx('buy')
    pendingPlay.mutators = next
    ui.showScreen('brief', { chapterId: pendingPlay.chapter, difficulty: pendingPlay.difficulty, mutators: pendingPlay.mutators, reroll: true })
  },
  // v6.1 i18n: the language rows in the title's ⚙ settings sheet (v6.7; it was a floating 🌐
  // toggle before). Persist, switch the live dictionary, and let ui.js
  // re-render the title itself (same pattern as onDifficulty/onChapter).
  onLang(l) {
    meta.lang = l
    saveMeta(meta)
    setLang(l)
    playSfx('click')
  },
  // The WIP gate: seven taps on the TITLE coin badge (ui.js). Persist only — ui.js owns repainting
  // the title and the DEV pill, the same split as onLang. This flag gates which chapters are
  // OFFERED and never reaches sim.js: a run behind the gate is played by exactly the shipped code
  // path, so what gets tested here is what ships.
  onDev(on) {
    meta.dev = on
    saveMeta(meta)
    playSfx('click')
  },
  // Which side the skill button sits on ('left' is the right-handed default — see the .skill-btn
  // block in styles.css). Persist only; ui.js owns moving the element, same split as onLang.
  onSkillSide(side) {
    meta.skillSide = side
    saveMeta(meta)
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
  // v7.5: `subject` is the weapon the player named on a SUBJECTED anomaly card (SPECIALIST). ui.js
  // passes it after its chooser; sim.js validates it against the run, so this stays glue.
  onChoose(i, subject = null) {
    if (!run || run.phase !== 'levelup') return
    applyChoice(run, i, subject)
    run.phase = 'playing'
    ui.showScreen('hud')
    playSfx('click')
  },
  onPauseToggle() {
    if (!run) return
    if (run.phase === 'playing') { run.phase = 'paused'; ui.showScreen('pause', pauseData()) }
    else if (run.phase === 'paused') { run.phase = 'playing'; ui.showScreen('hud') }
    // The same sheet, opened OVER a level-up — "should I reroll this?" is a question about
    // the build you already have, and it was only answerable from the pause screen, which the
    // level-up had no way back to. run.phase deliberately STAYS 'levelup': the ticker freezes on
    // any phase but 'playing' (so there is nothing to juggle), the pick stays unspent, and Resume
    // re-shows the same cards. ui.js refuses the toggle while a pick is in flight — see its
    // 'pause' case for why that one is not optional.
    else if (run.phase === 'levelup') {
      if (ui.activeScreen() === 'pause') ui.showScreen('levelup', levelupData())
      else ui.showScreen('pause', pauseData())
    }
  },
  // ---- hidden dev menu (v7.12) ----------------------------------------------------------
  // Seven taps on the HUD coin badge. Pauses the run the same way the pause button does — the
  // ticker keeps calling sync with dt 0, so the world is frozen and still drawn behind the modal.
  // devCards is a read-only projection of what the pools COULD produce (sim.js), which is why the
  // list is rebuilt on every open and after every take: a weapon already owned reads "Lv 3", not
  // "New!".
  onDevOpen() {
    if (!run || run.phase !== 'playing') return
    devList = devCards(run)
    run.phase = 'paused'
    ui.showScreen('dev', { cards: devList, newElements: run.newElements })
  },
  onDevTake(i) {
    if (!run || run.phase !== 'paused') return
    // subject stays null: applyChoice falls back to the first legal weapon on a SUBJECTED card
    // (SPECIALIST), which is documented there and is the right default for a test menu — the
    // chooser is a level-up-screen flow, not something to rebuild here.
    devTake(run, devList[i])
    devList = devCards(run)
    ui.showScreen('dev', { cards: devList, newElements: run.newElements })
  },
  onDevClose() {
    if (!run || run.phase !== 'paused') return
    run.phase = 'playing'
    ui.showScreen('hud')
  },
  // v7.53: flips the elements-redesign flag (run.newElements — see the "Elements REDESIGN" block
  // in config.js) so a card can be tested against the live URL without waiting for the redesign to
  // ship for real. Per-run and never persisted (state.js), same as every other dev-only lever here.
  // devCards' output depends on it (makeElementCard branches on run.newElements), so the list is
  // rebuilt exactly like a take.
  onDevToggleElements() {
    if (!run || run.phase !== 'paused') return
    run.newElements = !run.newElements
    devList = devCards(run)
    ui.showScreen('dev', { cards: devList, newElements: run.newElements })
  },
  // ---- element codex (v7.53) ------------------------------------------------------------------
  // Explains the elements-redesign rule to a player, reachable two ways: the title's ⚙ sheet (no
  // run — every element reads P=0, so the pages show the rule with no "yours" line) and the pause
  // build sheet (P = this run's own run.elements). ui.js never touches `run` itself, so it hands
  // back `from` and main.js — the only module that knows whether a run exists — decides where
  // Close lands, the same split as onPauseToggle's screen memory above.
  onCodexOpen(from) {
    ui.showScreen('codex', { elements: from === 'pause' && run ? run.elements : null, from })
  },
  onCodexClose(from) {
    if (from === 'pause' && run) ui.showScreen('pause', pauseData())
    else ui.showScreen('title')
  },
  onDifficulty(d) {
    // Belt-and-braces with the UI: never let a locked level (above the SELECTED chapter's
    // maxDifficulty) stick, even if a stray click somehow got through disabled/no-op pips.
    // Same R1 resolution as onPlay above, for the same reason plus one of its own: writing a
    // clamped difficulty into the entry of a chapter this build cannot play would LOWER a newer
    // save's stored selection on disk — the exact clamp-and-persist loss R3 exists to prevent.
    const chapterId = playableChapterId(meta)
    const chMeta = ensureChapterMeta(meta, chapterId)
    chMeta.difficulty = Math.max(1, Math.min(chMeta.maxDifficulty, Math.min(chapterMaxDifficulty(chapterId), d)))
    saveMeta(meta)
    playSfx('click')
  },
  // Title screen's chapter selector (v5.0). Belt-and-braces with the UI: never select a chapter
  // that isn't unlocked, even if a stray click somehow got through a disabled locked card. ui.js
  // re-renders the title itself right after calling this (same pattern as onDifficulty above).
  onChapter(id) {
    // chapterAvailable, not the raw `unlocked` flag: a WIP chapter has no unlock path yet and
    // meta.dev IS its permission. ensureChapterMeta still runs first, so the entry is created and
    // repaired exactly as before — only the verdict changes. ui.js gates the card, the Play button,
    // the scroll-persist and the brief on the same helper, so all five agree by construction.
    ensureChapterMeta(meta, id)
    if (!chapterAvailable(meta, id)) return
    meta.chapter = id
    saveMeta(meta)
    playSfx('click')
  },
  onReroll() {
    if (!run || run.phase !== 'levelup') return
    // The purchase itself is sim.js's (rerollLevelUpChoices): price, spend the RUN's coins, step
    // both reroll counters, re-deal the screen. Keeping it there rather than here is what puts it
    // under test at all — test/sim-test.js never imports main.js, so while the _screenRerolls bump
    // lived in this file the whole rarity-decay feature could be deleted with the suite still
    // green. Glue keeps the guard, the sfx and the re-show; it returns false when the run cannot
    // afford it, having changed nothing.
    if (!rerollLevelUpChoices(run)) return
    playSfx('buy')
    ui.showScreen('levelup', levelupData())
  },
  // Sacrifice already-purchased shop levels for a permanent unlock (v4.8; picks is
  // { [statId]: count }). Validates independently of the UI (which disables the confirm button) --
  // belt and braces, and now it has to, because `target` arrives from a data- attribute.
  //
  // v7.x: `target` names WHICH unlock. 'slot' is the original 3rd/4th level-up card slot
  // (meta.choiceSlots, sacrificeCost); 'thief' is Book 2's Light Thief (meta.lightThief,
  // LIGHT_THIEF_COST). Defaulted to 'slot' so an older caller -- or a replayed event from a stale
  // DOM -- keeps meaning exactly what it used to.
  onSacrifice(picks, target = 'slot') {
    const slots = meta.choiceSlots ?? 2
    // Resolve the cost from the target FIRST, and refuse an already-owned unlock here rather than
    // trusting the button to be absent. The two costs differ (15 vs 20/40), so charging the wrong
    // one is a silent overcharge rather than an error.
    let cost = null
    if (target === 'thief') cost = meta.lightThief === true ? null : LIGHT_THIEF_COST
    else if (target === 'slot') cost = slots >= 4 ? null : sacrificeCost(slots)
    if (cost == null) return false
    let total = 0
    for (const [id, count] of Object.entries(picks ?? {})) {
      if (!SHOP[id] || !Number.isInteger(count) || count < 0 || count > (meta.shop[id] ?? 0)) return false
      total += count
    }
    if (total !== cost) return false
    for (const [id, count] of Object.entries(picks)) meta.shop[id] -= count
    if (target === 'thief') meta.lightThief = true
    else meta.choiceSlots = slots + 1
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
  // Save-slot switch (title's 💾 button) — write the pointer and reload, same idiom as onReset:
  // every module re-reads loadMeta() from the new slot rather than reconciling in-memory state.
  onSlot(n) {
    setActiveSlot(n)
    location.reload()
  },
  // v6.6.12 save names (the slots sheet's ✏️). Two paths, and they are not interchangeable: the
  // slot being played is renamed in MEMORY and saved, because patching its blob on disk would be
  // overwritten by the next saveMeta from this same object. Any other slot is patched on disk,
  // because its blob is the only copy that exists.
  onRename(n, name) {
    if (n === activeSlot()) { meta.name = cleanName(name); saveMeta(meta) }
    else setSlotName(n, name)
    playSfx('click')
  },
})

// buildReadout is a read-only projection (see sim.js): main is the only place allowed to hand sim
// data to ui, which never imports sim. Two callers — a plain pause, and the same sheet opened
// over a level-up.
const pauseData = () => ({ mutators: run.mutators, mode: runMode, build: buildReadout(run) })

// Everything the level-up screen needs to render its cards + footer buttons.
function levelupData() {
  // v7.2: the price and its CURRENCY both come from sim.js (rerollPrice), because BLOOD MONEY
  // moves rerolls onto HP and the button has to print what is actually charged.
  const price = rerollPrice(run)
  return {
    choices: run.levelUpChoices,
    rerollCost: price.cost,
    rerollCurrency: price.currency,
    // v7.5: false under BLIND FAITH, whose whole price is that the reroll is not for sale. sim.js
    // refuses it too — this only stops the button offering a purchase that cannot happen.
    canReroll: price.available !== false,
    coins: run.coinsEarned,  // run coins — rerolls spend these, see onReroll
    hp: Math.floor(run.player.hp),
    // v7.5: BLIND FAITH deals the screen face down. The RULE (which rarities are dealt, how many
    // cards) is entirely sim-side; this flag only tells ui.js how to paint what it was handed.
    blind: !!run.anomalies?.blindFaith,
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
  // SUBMISSION: an elite changing sides is the same register as a Revive — the run just went
  // your way — so it borrows the same jingle. Its expiry deliberately gets NO sound: with 3x the
  // elite cadence these fire often, and a chime every time a loan lapses is nagging, not feedback.
  // (The kill sfx already plays at the turn itself, from the ordinary `kill` event.)
  submission: 'levelup',
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
  // v6.2: the shriek used to arrive as a generic 'shoot' — same voice, its own event. Blinks are
  // deliberately silent (a per-bullet ~0.5s cadence would machine-gun any voice we gave it).
  shriek: 'shoot',
  // v6.3 dispatch beat (city elite spawn): a two-tone alarm wail — own synth (audio.js), no
  // throttle entry needed (elite cadence is seconds apart, nothing like shoot/hit's per-frame rate).
  dispatch: 'siren',
  // v7.23 skies weapon rework. `breath` fires once per cast (4-5.5s apart) so it takes the beam
  // voice untouched. `arc` fires once per DAMAGE TICK — up to ~8/s while a fork burns — so it takes
  // 'zap', which audio.js already throttles for exactly this reason (see shoot/hit/zap). The `tail`
  // event has never had an entry and still doesn't: the lash is heard through the hits it lands.
  breath: 'beam', arc: 'zap',
}

function endRun(victory) {
  const bonus = Math.round(runBonusCoins(run.kills, run.player.level) * difficultyCoinMul(run.difficulty ?? 1))
  // v6.4.2 (owner directive): the kill bonus can still push a near-capped run over COIN_CAP_PER_RUN — clamp the final banked total too.
  const earned = Math.min(COIN_CAP_PER_RUN, run.coinsEarned + bonus)
  meta.coins += earned
  meta.runs += 1
  // meta.best: all-time aggregate across every chapter (see state.js doc block), kept
  // unconditionally alongside the per-chapter best below.
  meta.best.time = Math.max(meta.best.time, Math.floor(run._realTime ?? run.time))
  meta.best.kills = Math.max(meta.best.kills, run.kills)

  const chMeta = ensureChapterMeta(meta, run.chapter)
  chMeta.best.time = Math.max(chMeta.best.time, Math.floor(run._realTime ?? run.time))
  chMeta.best.kills = Math.max(chMeta.best.kills, run.kills)

  // Difficulty unlock (v4.10, now per-chapter): winning a classic run at the run's chapter's
  // current ceiling unlocks the next level FOR THAT CHAPTER. Only fires on the level actually
  // at the ceiling (winning a lower, already-unlocked level doesn't re-unlock anything), and
  // only while there's a level left to unlock.
  const runChapterMaxDifficulty = chapterMaxDifficulty(run.chapter)
  const unlockedDifficulty = victory && runMode === 'classic' &&
    (run.difficulty ?? 1) >= chMeta.maxDifficulty && chMeta.maxDifficulty < runChapterMaxDifficulty
  if (unlockedDifficulty) chMeta.maxDifficulty = Math.min(runChapterMaxDifficulty, (run.difficulty ?? 1) + 1)
  // v6.6.12: record the level actually WON, separately from the level unlocked. Winning the ladder's
  // last level unlocks nothing (the guard above requires maxDifficulty < the cap), so before this the
  // save had no way to express "beat the hardest one" and the hero card's final star never lit.
  // Math.max, not assignment: replaying an easier level must not walk the record back down.
  if (victory && runMode === 'classic') chMeta.won = Math.max(Number(chMeta.won) || 0, run.difficulty ?? 1)

  // Chapter unlock (v5.0): winning a classic run at difficulty 3+ unlocks the NEXT chapter (see
  // nextChapter in config.js), if there is one and it isn't already unlocked. Guarded on "not
  // already unlocked" purely so the summary badge only fires once (replaying at 3+ afterward
  // shouldn't keep announcing it).
  let unlockedChapter = null
  let unlockedChapterId = null
  if (victory && runMode === 'classic' && (run.difficulty ?? 1) >= CHAPTER_UNLOCK_DIFFICULTY) {
    const next = nextChapter(run.chapter)
    if (next) {
      const nextMeta = ensureChapterMeta(meta, next)
      if (!nextMeta.unlocked) {
        nextMeta.unlocked = true
        unlockedChapter = CHAPTERS[next].name
        unlockedChapterId = next
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

  // v6.4.4: a classic win below the chapter's cap advances the saved difficulty selection, so
  // the summary's main button becomes "Next level" and — via the same onPlay flow as the title
  // Play button, which reads chMeta.difficulty — actually starts it (via the pre-run summary).
  // Wins at the cap, deaths and dailies keep "Play again".
  let nextDifficulty = null
  if (victory && runMode === 'classic') {
    // R3 (state.js's ensureChapterMeta): chMeta.maxDifficulty may now sit ABOVE this build's
    // ladder — a save from a build that shipped more levels keeps its number instead of being
    // written back lower — so cap the bump with the chapter's own ceiling too. Without it, a win
    // at the cap would advance the saved selection to a level this build has no pip for and never
    // balanced, and the summary's "Next level" button would start it.
    const nextD = Math.min(runChapterMaxDifficulty, chMeta.maxDifficulty, (run.difficulty ?? 1) + 1)
    if (nextD > (run.difficulty ?? 1)) { chMeta.difficulty = nextD; nextDifficulty = nextD }
  }

  saveMeta(meta)
  ui.showScreen('summary', {
    victory, time: run.time, kills: run.kills, level: run.player.level, earned, bonus,
    mutators: run.mutators, mode: runMode, nextDifficulty,
    unlockedDifficulty: unlockedDifficulty ? chMeta.maxDifficulty : null,
    unlockedChapter,
    unlockedChapterId,
    unlockedHiddenChapter,
  })
}

app.ticker.add((ticker) => {
  const dt = Math.min(ticker.deltaMS / 1000, 0.05)
  if (!run) { renderer.idle(dt); return }

  if (run.phase === 'playing') {
    run.viewRadius = Math.hypot(app.screen.width, app.screen.height) / 2
    // v6.6.24: the rectangle, not just its diagonal — see run.viewW/viewH in state.js and
    // canCommitFrom in config.js. The camera centres the player in every chapter but the lane.
    run.viewW = app.screen.width / 2
    run.viewH = app.screen.height / 2
    stepSim(run, getInput(), dt)
    const events = run.events
    run.events = []
    renderer.sync(run, dt, events)
    for (const e of events) {
      if (e.dot) continue // DoT ticks are silent — they'd drone constantly
      const s = SFX_FOR_EVENT[e.type]
      if (s) playSfx(s)
    }
    ui.updateHUD(run, events)
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
