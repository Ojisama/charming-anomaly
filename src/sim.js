// STUB — implemented by the sim subagent. Pure logic, no Pixi/DOM.
// Contract: see state.js (run shape + events) and config.js (all numbers).

/** Advance the simulation by dt seconds. input = {x, y} normalized move vector. */
export function stepSim(run, input, dt) {
  run.time += dt
}

/** Apply run.levelUpChoices[i] to the run (weapon add/level, passive, heal). */
export function applyChoice(run, i) {
  run.levelUpChoices = null
}
