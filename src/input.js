// STUB — implemented by the ui subagent.
// Floating touch joystick (appears where the thumb lands) + WASD/arrows on desktop.

/** Attach listeners. Joystick DOM/visual lives here too. */
export function initInput(rootEl) {}

/** @returns {{x:number, y:number}} normalized move vector, {0,0} when idle */
export function getInput() {
  return { x: 0, y: 0 }
}
