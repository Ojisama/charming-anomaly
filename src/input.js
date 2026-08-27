// Floating touch joystick (anchors where the thumb lands) + WASD/arrows + hold-to-steer mouse on desktop.
// Visuals live in #ui but are pointer-events:none so they never block buttons.

const RADIUS = 50
const DEADZONE = 0.15
// HOLD SHIFT TO EASE OFF. A key is either down or it is not, so the keyboard hands getInput a
// vector of length 1 or of length 0 and nothing between — which is fine where the magnitude scales
// a walk, and is the whole mechanic where it scales a THROTTLE. A circuit chapter reads the stick's
// magnitude as the gas (CHAPTERS.reef.laneThrottle), so on keys the throttle was full or nothing
// and "ease off into the corner" — the move that chapter is built around — could not be typed.
//   A STICK DEFLECTION AND NOT A THROTTLE, which is why the number lives here beside DEADZONE
// rather than in config.js. getInput returns a direction and a magnitude; what each chapter does
// with 0.5 of a stick is that chapter's own curve, and on The Reef it happens to land exactly on
// laneThrottle.min. Every other chapter reads it as a slow walk, which costs nothing and is only
// ever opt-in — you have to be holding the key.
const HALF_STICK = 0.5

const vec = { x: 0, y: 0 }
const keys = new Set()
let skillPending = false
let joyId = null
let baseX = 0
let baseY = 0
let mouseHeld = false
let mouseX = 0
let mouseY = 0
let joyEl = null
let knobEl = null

function moveKnob(dx, dy) {
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`
}

function setVec(dx, dy) {
  const len = Math.hypot(dx, dy)
  const scale = len > RADIUS ? RADIUS / len : 1
  const kx = dx * scale
  const ky = dy * scale
  moveKnob(kx, ky)
  if (len / RADIUS < DEADZONE) { vec.x = 0; vec.y = 0 }
  else { vec.x = kx / RADIUS; vec.y = ky / RADIUS }
}

function resetJoy() {
  joyId = null
  vec.x = 0
  vec.y = 0
  joyEl.classList.remove('joy--on')
}

/** Attach listeners. rootEl is document.body. */
export function initInput(rootEl) {
  joyEl = document.createElement('div')
  joyEl.className = 'joy'
  joyEl.innerHTML = '<div class="joy-base"></div><div class="joy-knob"></div>'
  document.getElementById('ui').appendChild(joyEl)
  knobEl = joyEl.querySelector('.joy-knob')

  rootEl.addEventListener('touchstart', (e) => {
    if (joyId !== null) return                                   // a second finger is free to hit buttons
    if (e.target.closest('button, .card, [data-ui]')) return     // don't steal taps from the UI
    const t = e.changedTouches[0]
    joyId = t.identifier
    baseX = t.clientX
    baseY = t.clientY
    joyEl.style.left = `${baseX}px`
    joyEl.style.top = `${baseY}px`
    joyEl.classList.add('joy--on')
    setVec(0, 0)
    e.preventDefault()
  }, { passive: false })

  rootEl.addEventListener('touchmove', (e) => {
    if (joyId === null) return
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue
      setVec(t.clientX - baseX, t.clientY - baseY)
      e.preventDefault()
      break
    }
  }, { passive: false })

  const onEnd = (e) => {
    if (joyId === null) return
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) { resetJoy(); break }
    }
  }
  rootEl.addEventListener('touchend', onEnd)
  rootEl.addEventListener('touchcancel', onEnd)

  // Hold the left button and you swim toward the cursor -- the desktop reading of the same stick.
  // The guard is the touchstart one for the same reason: a click on a card or the skill button is a
  // click, not a move order.
  rootEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    if (e.target.closest('button, .card, [data-ui]')) return
    mouseHeld = true
    mouseX = e.clientX
    mouseY = e.clientY
    e.preventDefault()   // holding the button would otherwise start a text selection drag
  })
  window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY })
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseHeld = false })
  // Released outside the window there is no mouseup to hear, and a stuck hold walks the player into
  // the crowd while the tab is not even focused.
  document.addEventListener('mouseleave', () => { mouseHeld = false })

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    // v6.6.12: a focused text field owns its keystrokes. This handler binds keys that are also
    // ordinary characters — Space latches a skill press that SURVIVES until the next getInput(), so
    // before this guard, typing a space into a save name spent the next run's skill before it
    // started, and Escape fired game-pause mid-word. The rename field is the codebase's first
    // <input>; the pairing field will be the second.
    const el = e.target
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
    if (e.code === 'Escape' || e.code === 'KeyP') {
      window.dispatchEvent(new CustomEvent('game-pause'))
      return
    }
    // Space is the desktop binding for the active skill. e.repeat is already filtered above, so
    // holding it fires exactly once — sim.js's stepRepulse wants a press, never a held button.
    if (e.code === 'Space') { pressSkill(); return }
    keys.add(e.code)
  })
  window.addEventListener('keyup', (e) => keys.delete(e.code))
  window.addEventListener('blur', () => { keys.clear(); mouseHeld = false })
}

/**
 * Queue one activation of the active skill. Edge-triggered and LATCHED rather than polled: the
 * press can arrive from a DOM button (ui.js) between frames, and it must survive until the next
 * getInput() rather than being missed because it landed mid-tick.
 */
export function pressSkill() {
  skillPending = true
}

/**
 * Cursor steering: offset from the player IN SCREEN PX -> move vector. Same proportional-then-
 * clamped shape as the touch stick (setVec), so a cursor parked on the player crawls and one held a
 * stick's length away runs -- which is what the lane chapters read as their scroll throttle, and
 * what makes "put the pointer on yourself" a way to stop. Pure and exported so the suite can assert
 * it without a DOM.
 */
export function steerFromAnchor(dx, dy) {
  const len = Math.hypot(dx, dy)
  const t = len > 0 ? Math.min(len, RADIUS) / RADIUS : 0
  if (t < DEADZONE) return { x: 0, y: 0 }
  return { x: (dx / len) * t, y: (dy / len) * t }
}

/**
 * @param {{x:number, y:number}} [anchor] the player's SCREEN position (renderer.playerScreen).
 *   Without it the mouse is ignored -- there is nothing to steer from.
 * @returns {{x:number, y:number, skill:boolean}} move vector + one-shot skill press
 */
export function getInput(anchor) {
  const skill = skillPending
  skillPending = false
  if (joyId !== null) return { x: vec.x, y: vec.y, skill }
  let x = 0
  let y = 0
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1
  if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2 }
  // Applied AFTER the diagonal normalisation, so a half-pressed diagonal is half a stick and not
  // half of an over-long one. Both shifts, because which one is under the hand depends on which
  // half of the keyboard you steer with.
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) { x *= HALF_STICK; y *= HALF_STICK }
  // Keys win while any are down: the two would otherwise fight over the same frame.
  if (x === 0 && y === 0 && mouseHeld && anchor) {
    const m = steerFromAnchor(mouseX - anchor.x, mouseY - anchor.y)
    x = m.x
    y = m.y
  }
  return { x, y, skill }
}
