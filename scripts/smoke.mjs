// Does every chapter actually RENDER, at both screen sizes?
//
//   node scripts/smoke.mjs                        # every chapter, phone + desktop
//   node scripts/smoke.mjs --chapter shelf        # one chapter
//   node scripts/smoke.mjs --phone                # skip the desktop pass
//   node scripts/smoke.mjs --url http://127.0.0.1:5173/   # defaults to a dev server on 5173
//
// WHY THIS EXISTS. render.js is 27% of this codebase and 31% of every bug fix that has reached the
// live URL, and test/sim-test.js CANNOT EXECUTE ONE LINE OF IT — Pixi and DOM make it unimportable,
// so the suite reaches it through a dozen source-text greps and nothing else. Every defect in the
// list below shipped green:
//
//   - planets that never rotated and moons painted into a static canvas (spin written once)
//   - a lightmap carried in a canvas ALPHA channel, silently dropped on the owner's phone,
//     blacking the screen out entirely
//   - Texture.from(canvas) drawing its own quad as a red rectangle on one phone
//   - a full-bar early-out for The Shelf's dark that is correct at 390x844 and leaves the corners
//     vignetted at 1280x800 — measured on the phone alone, reported as a bug within the hour
//
// The last one is why this shoots TWO viewports by default. The phone's half-diagonal is 465px and
// the desktop's is 755px, so any quantity compared against the screen can be a different mechanic
// on each, and the one you shot will look correct.
//
// WHAT IT ASSERTS — three things, deliberately crude, because a crude check that runs beats a
// precise one that does not:
//   1. NO PAGE ERRORS. Any uncaught exception or console.error while booting and rendering.
//      This alone would have caught the TDZ crash that only appeared in the prod bundle.
//   2. THE CANVAS IS NOT BLANK. A near-uniform frame is the blank-page failure, which is this
//      project's one true outage mode and is invisible to every other check it has.
//   3. THE FRAME CHANGES. Render frame 1, advance 60 sim frames, render again. Identical bytes
//      mean nothing on screen is driven by time — the "spin was written once and never advanced"
//      class. The player is moving throughout, so the camera alone guarantees motion in a healthy
//      build; this fires only when rendering has genuinely stopped tracking the sim.
//
// It is NOT a look check. It cannot tell you a sprite is ugly or drawn from the wrong angle — use
// scripts/fx-probe.mjs for that. This answers the cheaper question the suite cannot: does it draw
// at all, in every chapter, on both screens, without throwing.
//
// ALL THREE CHECKS ARE MUTATION-PROVED against a mutated copy served on its own port: a renderer
// that throws is caught by (1), a stage hidden wholesale by (2), and a sync() that runs once and
// returns forever by (3) at 0.00% delta. Two limits found while proving them, worth knowing before
// trusting a green run:
//
//   - (3) catches the picture freezing WHOLESALE. It will NOT catch one layer freezing while the
//     camera keeps moving — the camera alone repaints 30-86% of the frame, which swamps a single
//     stalled layer. The moons-painted-into-a-static-canvas bug is exactly that shape, so this
//     gate would not have caught it. Closing that needs a per-layer probe, not a looser threshold.
//   - The first mutation of (3) SURVIVED because it froze at t>0.6 while the first capture is at
//     t~0.5, leaving 0.1s of real motion between the two frames. If you add a check here, make the
//     mutation start before the first capture or it proves nothing.
//
// The measured floor is 3.7% (The Blank — a white void) and the ceiling 86% (The Shelf), against a
// DELTA_MIN of 2%. That is a wide margin on purpose: this is a smoke gate, not a balance probe.
import { existsSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
}
const url = arg('url', 'http://127.0.0.1:5173/')
const onlyChapter = arg('chapter', null)
const phoneOnly = argv.includes('--phone')
const waitMs = +arg('wait', '25000')

const cfg = await import(pathToFileURL(join(import.meta.dirname, '../src/config.js')).href)
const CHAPTERS = onlyChapter ? [onlyChapter] : Object.keys(cfg.CHAPTERS)
// 390x844 is the owner's phone. 1280x800 is the other end of the range every screen-relative
// quantity has to hold across; see the vignette bug above.
const VIEWPORTS = phoneOnly ? [[390, 844, 'phone']] : [[390, 844, 'phone'], [1280, 800, 'desktop']]

function findChrome() {
  if (process.env.CHROME_HEADLESS_SHELL) return process.env.CHROME_HEADLESS_SHELL
  const base = join(process.env.HOME ?? '', '.cache/puppeteer/chrome-headless-shell')
  if (!existsSync(base)) return null
  for (const v of readdirSync(base).sort().reverse()) {
    const p = join(base, v, 'chrome-headless-shell-linux64', 'chrome-headless-shell')
    if (existsSync(p)) return p
  }
  return null
}
const chrome = findChrome()
if (!chrome) {
  console.error('No chrome-headless-shell in ~/.cache/puppeteer. Set CHROME_HEADLESS_SHELL=<path>.')
  process.exit(1)
}

// The in-page half. `dev: true` is load-bearing for WIP books: without it playableChapterId
// downgrades shelf/surf/reef to CHAPTER_ORDER[0] and this would smoke-test the BODY three extra
// times while reporting the names of three other chapters. `shop: {}` likewise — loadMeta writes
// into it, so a save without it throws and falls back to a fresh meta.
const bootstrap = (chapter) => `(() => {
  // This runs on EVERY new document, including the about:blank used to reset between chapters —
  // where localStorage throws a DOMException ("Access is denied for this document") that lands in
  // the page-error channel and fails the very check it was meant to serve. Bail on anything that
  // is not the app's own origin.
  if (!location.protocol.startsWith('http')) return
  let _s = 0
  const reseed = () => { _s = 0x9e3779b9 }
  reseed()
  Math.random = () => {
    _s |= 0; _s = (_s + 0x6d2b79f5) | 0
    let t = Math.imul(_s ^ (_s >>> 15), 1 | _s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const chapters = {}
  for (const id of ['body', ${JSON.stringify(chapter)}]) {
    chapters[id] = { unlocked: true, maxDifficulty: 5, difficulty: 1, best: { time: 0, kills: 0 } }
  }
  localStorage.setItem('charming-anomaly-save-v1', JSON.stringify({
    schema: 1, coins: 0, runs: 5, lang: 'en', chapter: ${JSON.stringify(chapter)}, dev: true,
    shop: {}, best: { time: 0, kills: 0 }, choiceSlots: 2, chapters,
  }))

  const click = (sel) => { const el = document.querySelector(sel); if (el && !el.disabled) { el.click(); return true } return false }
  let stage = 'title'
  const iv = setInterval(() => {
    if (stage === 'title') { if (click('[data-act="play"]')) stage = 'brief'; return }
    if (stage === 'brief') { if (click('[data-act="brief-start"]')) stage = 'wait'; return }
    if (!window.__run || !window.__app || !window.__stepSim || !window.__renderer) return
    clearInterval(iv)
    try { measure() } catch (e) { window.__smoke = { error: String(e && e.stack || e) } }
  }, 100)

  // Read the composited frame through a 2D canvas: Pixi's is WebGL, and drawImage + getImageData
  // is the same route the map-mode workflow uses. Sampled on a grid rather than every pixel — a
  // blank frame is blank everywhere, and this runs 22 times.
  function signature() {
    const app = window.__app
    const src = app.canvas
    const c = document.createElement('canvas')
    c.width = 160; c.height = 160
    const ctx = c.getContext('2d')
    ctx.drawImage(src, 0, 0, c.width, c.height)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    const seen = new Map()
    for (let i = 0; i < d.length; i += 4) {
      const k = (d[i] >> 3) * 1024 + (d[i + 1] >> 3) * 32 + (d[i + 2] >> 3)
      seen.set(k, (seen.get(k) || 0) + 1)
    }
    const total = d.length / 4
    let top = 0
    for (const n of seen.values()) if (n > top) top = n
    // Keep the PIXELS, not a hash. A hash answers only "identical or not", which cannot separate
    // "the renderer has stopped tracking the sim" from "this frame happens to be very quiet" —
    // and it read one chapter as broken on the phone and fine on the desktop, which is the
    // signature of a binary check straddling a threshold rather than of a real defect.
    return { px: Array.from(d), distinct: seen.size, dominant: top / total }
  }
  // Fraction of sampled pixels that changed by more than a hair. Compared in-page so only the
  // number crosses the wire, not two 100KB arrays.
  function delta(a, b) {
    let n = 0
    for (let i = 0; i < a.px.length; i += 4) {
      if (Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]) > 12) n++
    }
    return n / (a.px.length / 4)
  }

  function measure() {
    const run = window.__run, app = window.__app, step = window.__stepSim
    app.ticker.stop()
    reseed()
    run.player.maxHP = run.player.hp = 1e9
    const drive = (n) => {
      for (let i = 0; i < n; i++) {
        step(run, { x: 0.5, y: 0.3 }, 1 / 60)
        const ev = run.events.splice(0)
        if (run.phase === 'levelup') run.phase = 'playing'
        window.__renderer.sync(run, 1 / 60, ev)
      }
      app.renderer.render(app.stage)
    }
    drive(30)                       // let the world stream in and the camera settle
    const t0 = run.time
    const a = signature()
    drive(60)                       // one second of sim
    const t1 = run.time
    const b = signature()
    window.__smoke = {
      distinct: b.distinct, dominant: b.dominant,
      delta: delta(a, b),
      // The sim clock at both ends. If this did not advance, a static frame is the HARNESS failing
      // to step, not the renderer failing to draw, and the two need different fixes.
      simAdvanced: t1 - t0,
      enemies: run.enemies.length, t: run.time, chapter: run.chapter, phase: run.phase,
      w: window.innerWidth, h: window.innerHeight,
    }
  }
})()`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = 9600 + (process.pid % 300)
const browser = spawn(chrome, [
  '--no-sandbox', '--hide-scrollbars', '--window-size=1280,800',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/smoke-${process.pid}`, 'about:blank',
], { stdio: 'ignore' })

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page
    } catch { /* not up yet */ }
    await sleep(250)
  }
  throw new Error('devtools never came up — is chrome-headless-shell runnable?')
}

const page = await target()
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => { ws.onopen = r })
let msgId = 0
const pending = new Map()
let pageErrors = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params?.exceptionDetails
    pageErrors.push(d?.exception?.description || d?.text || 'unknown exception')
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
    pageErrors.push((m.params.args || []).map((a) => a.description ?? a.value).join(' '))
  }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) }
}
const send = (method, params = {}) => new Promise((res) => {
  const n = ++msgId
  pending.set(n, res)
  ws.send(JSON.stringify({ id: n, method, params }))
})
const evaluate = async (expr) =>
  (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value

await send('Page.enable')
await send('Runtime.enable')

// A frame whose most common colour covers this much of it is not a scene, it is a fill. Generous
// on purpose: The Blank is a white void and The Shelf runs under a near-black scrim, so a tight
// threshold would fail the two chapters that legitimately look flat.
const DOMINANT_MAX = 0.98
const DISTINCT_MIN = 12
// The player walks all through the measured second, so the camera alone repaints most of the
// screen in a healthy build — the observed values sit far above this. It is set low deliberately:
// this check exists to catch the picture DETACHING from the sim (a spin written once, a layer that
// stops updating), not to police how busy a chapter looks.
const DELTA_MIN = 0.02

// WARM-UP, and it is not optional against a dev server. Vite compiles modules on demand, so the
// very first load pays for the whole graph — the first chapter in the list timed out at 25s while
// every later one finished comfortably, which reads as "the body chapter is broken" and is
// actually "this was the first request". One throwaway navigation moves that cost outside the
// measured loop.
await send('Page.navigate', { url: url + (url.includes('?') ? '&' : '?') + 'debug' })
await sleep(6000)

const failures = []
const rows = []
let priorScript = null
for (const [w, h, label] of VIEWPORTS) {
  for (const chapter of CHAPTERS) {
    pageErrors = []
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: label === 'phone' })
    // REMOVE the previous one first. addScriptToEvaluateOnNewDocument ACCUMULATES: without this,
    // iteration N runs N bootstraps on every load, each writing a different chapter into the same
    // localStorage key and each installing its own polling interval. The last writer wins, so the
    // run silently measures the wrong chapter — and the symptom is a timeout much later, in a
    // different chapter, which is about as misleading as a harness bug gets.
    if (priorScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: priorScript })
    priorScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: bootstrap(chapter) }))?.identifier
    await send('Page.navigate', { url: 'about:blank' })
    await sleep(150)
    await send('Page.navigate', { url: url + (url.includes('?') ? '&' : '?') + 'debug' })

    let s = null
    for (let i = 0; i < Math.ceil(waitMs / 500); i++) {
      s = await evaluate('window.__smoke || null')
      if (s) break
      await sleep(500)
    }
    const tag = `${chapter}/${label}`
    if (!s) { failures.push(`${tag}: never reached a rendered run within ${waitMs}ms`); rows.push([tag, 'TIMEOUT', '', '', '']); continue }
    if (s.error) { failures.push(`${tag}: threw while measuring — ${s.error.split('\n')[0]}`); rows.push([tag, 'THREW', '', '', '']); continue }

    const probs = []
    if (pageErrors.length) probs.push(`${pageErrors.length} page error(s): ${pageErrors[0].split('\n')[0].slice(0, 110)}`)
    if (s.dominant > DOMINANT_MAX) probs.push(`blank-ish canvas — one colour covers ${(100 * s.dominant).toFixed(1)}% of the frame`)
    if (s.distinct < DISTINCT_MIN) probs.push(`only ${s.distinct} distinct colours in the frame`)
    if (s.simAdvanced < 0.5) probs.push(`the SIM barely advanced (${s.simAdvanced.toFixed(2)}s over 60 steps, phase '${s.phase}') — this is the harness, not the renderer`)
    else if (s.delta < DELTA_MIN) probs.push(`only ${(100 * s.delta).toFixed(2)}% of the frame changed over a second of sim with the player walking — the picture has stopped tracking the world`)
    if (s.chapter !== chapter) probs.push(`asked for '${chapter}' but the run is '${s.chapter}' — the save seed did not take`)

    rows.push([tag, probs.length ? 'FAIL' : 'ok', `${s.w}x${s.h}`, `${s.enemies} enemies`,
      `${s.distinct} colours, top ${(100 * s.dominant).toFixed(0)}%, moved ${(100 * s.delta).toFixed(1)}%`])
    for (const p of probs) failures.push(`${tag}: ${p}`)
  }
}

console.log('')
for (const r of rows) {
  console.log(`  ${r[0].padEnd(20)} ${r[1].padEnd(8)} ${(r[2] || '').padEnd(10)} ${(r[3] || '').padEnd(14)} ${r[4] || ''}`)
}
ws.close()
browser.kill()

if (failures.length) {
  console.log(`\n${failures.length} PROBLEM(S):`)
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`\nALL ${rows.length} CHAPTER/VIEWPORT COMBINATIONS RENDER: no page errors, no blank canvas, every frame advancing.`)
process.exit(0)
