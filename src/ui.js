// STUB — implemented by the ui subagent. DOM overlay inside #ui. No Pixi.

/**
 * Contract used by main.js:
 *   const ui = initUI({ meta, onPlay, onBuy(id)->bool, onChoose(i), onPauseToggle, onQuit })
 *   ui.showScreen('title' | 'shop' | 'hud' | 'levelup' | 'pause' | 'summary', data?)
 *     - 'levelup' data: run.levelUpChoices array
 *     - 'summary' data: { victory, time, kills, level, earned, bonus }
 *   ui.updateHUD(run)   called every frame while playing
 */
export function initUI(hooks) {
  return {
    showScreen(name, data) {},
    updateHUD(run) {},
  }
}
