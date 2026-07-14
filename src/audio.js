// Procedural WebAudio SFX, no assets. Names: shoot, hit, kill, gem, coin,
// levelup, hurt, death, victory, click, buy.

let ctx = null
let master = null
let noiseBuf = null
const lastPlay = {}
const THROTTLE_MS = { shoot: 40, hit: 40 } // these fire constantly — avoid mush

/** Create/resume the AudioContext. Must be called from a user gesture (Play button). */
export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
    noiseBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.2), ctx.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') ctx.resume()
}

const rnd = (a, b) => a + Math.random() * (b - a)

function tone(freq, { type = 'sine', dur = 0.1, gain = 0.15, at = 0, slide = 0 } = {}) {
  const t0 = ctx.currentTime + at
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t0 + dur)
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  osc.connect(g).connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function noise({ dur = 0.12, gain = 0.15, at = 0 } = {}) {
  const t0 = ctx.currentTime + at
  const src = ctx.createBufferSource()
  const g = ctx.createGain()
  src.buffer = noiseBuf
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  src.connect(g).connect(master)
  src.start(t0)
  src.stop(t0 + dur)
}

const SFX = {
  shoot() { tone(rnd(820, 940), { type: 'triangle', dur: 0.06, gain: 0.05 }) },
  hit() { tone(2100, { type: 'square', dur: 0.03, gain: 0.035 }) },
  kill() {
    tone(560, { type: 'triangle', dur: 0.07, gain: 0.14 })
    tone(360, { type: 'triangle', dur: 0.09, gain: 0.12, at: 0.055 })
  },
  gem() { tone(rnd(1150, 1350), { dur: 0.09, gain: 0.09 }) },
  coin() {
    tone(1500, { dur: 0.07, gain: 0.1 })
    tone(1950, { dur: 0.09, gain: 0.1, at: 0.07 })
  },
  levelup() {
    const notes = [523, 659, 784, 1047]
    notes.forEach((f, i) => tone(f, { type: 'triangle', dur: 0.15, gain: 0.14, at: i * 0.09 }))
  },
  hurt() {
    tone(130, { dur: 0.18, gain: 0.3, slide: 55 })
    noise({ dur: 0.12, gain: 0.12 })
  },
  death() {
    tone(420, { type: 'triangle', dur: 0.7, gain: 0.2, slide: 90 })
    tone(300, { dur: 0.7, gain: 0.1, slide: 70, at: 0.06 })
  },
  victory() {
    const notes = [523, 659, 784, 659, 880, 1047]
    notes.forEach((f, i) => tone(f, { type: 'triangle', dur: 0.17, gain: 0.15, at: i * 0.11 }))
  },
  click() { tone(700, { type: 'triangle', dur: 0.04, gain: 0.08 }) },
  buy() {
    tone(950, { dur: 0.07, gain: 0.12 })
    tone(1400, { dur: 0.1, gain: 0.12, at: 0.08 })
  },
}

export function playSfx(name) {
  if (!ctx) return
  // while resuming, still schedule — WebAudio queues events until the context runs
  if (ctx.state === 'suspended') ctx.resume()
  else if (ctx.state !== 'running') return
  const min = THROTTLE_MS[name]
  if (min) {
    const now = performance.now()
    if (lastPlay[name] && now - lastPlay[name] < min) return
    lastPlay[name] = now
  }
  SFX[name]?.()
}
