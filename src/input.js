// Floating touch joystick (anchors where the thumb lands) + WASD/arrows on desktop.
// Visuals live in #ui but are pointer-events:none so they never block buttons.

const RADIUS = 50
const DEADZONE = 0.15

const vec = { x: 0, y: 0 }
const keys = new Set()
let joyId = null
let baseX = 0
let baseY = 0
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

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    if (e.code === 'Escape' || e.code === 'KeyP') {
      window.dispatchEvent(new CustomEvent('game-pause'))
      return
    }
    keys.add(e.code)
  })
  window.addEventListener('keyup', (e) => keys.delete(e.code))
  window.addEventListener('blur', () => keys.clear())
}

/** @returns {{x:number, y:number}} normalized move vector, {0,0} when idle */
export function getInput() {
  if (joyId !== null) return { x: vec.x, y: vec.y }
  let x = 0
  let y = 0
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1
  if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2 }
  return { x, y }
}
