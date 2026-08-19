// Reproducible in-game screenshots of a visual effect, for A/B-ing a look.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/beam-prism.js --out /tmp/pr
//   node scripts/fx-probe.mjs --scene <file> --out <prefix> [--url http://127.0.0.1:5173/]
//                             [--frames 14] [--chapter city] [--wait 16000] [--w 390] [--h 844]
//
// WHY THIS EXISTS: judging "the effect looks tame" needs the SAME frame under every variant, and
// getting that is harder than it sounds. Three traps this bakes out (all of them cost real rounds
// in v6.7.7 — see the browser-probing section of CLAUDE.md):
//
//   1. Seeding Math.random from an initScript is NOT enough. The ticker runs free between boot and
//      whenever the probe gets control, and every rendered frame burns randoms (dust motes,
//      particles), so how many depends on machine load. Each variant then lands on a different
//      tile with a different crowd. This pins the RNG twice: once before any module evaluates, and
//      again right after app.ticker.stop().
//   2. One boot per frame is ~16s. A burst or a fade cannot be judged from a still, so the scene
//      returns a SCRUB function and the whole sequence comes out of a single boot.
//   3. A scene that throws renders nothing, which looks identical to "the effect is invisible".
//      Any throw is painted into the page, so the screenshot itself carries the error text.
//
// A FOURTH, added v7.6.0 after it cost a round: **H.weapon REPLACES run.weapons, it does not
// append.** Calling it twice to stage two weapons together silently drops the first, and the
// symptom is indistinguishable from trap 3 — the probe returns frames, the scene did not throw, and
// the effect you came to photograph is simply absent (an Ipecac clutter shot came back with
// `liveBullets: 0` twice before this was noticed). ONE WEAPON PER SCENE; shoot the second
// separately and stack the frames afterwards.
//
// JUDGING A ROTATION OR A PULSE: those are driven by animT, which only advances when sync() gets a
// non-zero dt. H.render() feeds it the sim time H.tick() has accumulated, so a scene that ticks
// between captures animates; a scene that only rewinds a decay field (beam-prism.js) still renders
// frozen, which is what it wants. If a captured sequence of a spinning sprite looks static, check
// that the scene is actually ticking before you go looking at the sprite.
//
// WHAT "REPRODUCIBLE" MEANS HERE: the SCENE is — same tile, same cast, same entity state, run
// after run. The pixels are not quite. A few render effects key off animT (the beam's own pulse,
// floor dust), and animT counts wall-clock time before the ticker was stopped, so two invocations
// differ by a handful of sub-pixel values. That is exactly enough to A/B a look and not enough to
// diff images: compare the frames by eye, never by md5.
//
// The scene file is plain JS evaluated in the page with (run, app, step, H) in scope. It composes
// the frame and returns either nothing (single still) or a scrub function (age 0..1 -> rendered
// frame). See scripts/scenes/beam-prism.js for the worked example and the H helper surface.
//
// Frames land at <prefix>-00.png, <prefix>-01.png, ... Stack them with ffmpeg:
//   ffmpeg -framerate 14 -i pr-%02d.png -vf crop=440:760:340:360 -loop 0 out.gif
import { writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
// Node-side only, for the header print below — this file otherwise never builds a meta itself. It
// seeds a save via the REAL localStorage + loadMeta() path in-browser (see the bootstrap string
// below), which is what already keeps it honest about the book shape: loadMeta's own migrations
// (ensureBookMeta, unlockBook, the meta.lightThief copy-forward) run for real, unlike the other four
// probes that hand createRun a meta directly and bypass loadMeta entirely.
import { bookOf } from '../src/config.js'

const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const scenePath = arg('scene')
const out = arg('out')
if (!scenePath || !out) {
  console.error('usage: node scripts/fx-probe.mjs --scene <file.js> --out <prefix> [--url U] [--frames N] [--chapter id] [--wait ms] [--w W] [--h H]')
  process.exit(1)
}
const url = arg('url', 'http://127.0.0.1:5173/')
const frames = +arg('frames', '1')
const chapter = arg('chapter', 'city')
const waitMs = +arg('wait', '16000')
const W = +arg('w', '390')
const H = +arg('h', '844')
// Header states what this shot will actually measure — the createRun(meta, opts) options-object
// trap (CLAUDE.md) silently degrades an unresolvable chapter id to Body at difficulty 1, and this
// print is what would catch it if bootstrap's seeded `chapter` field were ever wrong. Confirmed
// again below, against window.__run.chapter, once the page actually boots.
console.log(`fx-probe: scene=${scenePath} chapter=${chapter} book=${bookOf(chapter) ?? 'book1'} frames=${frames} ${W}x${H}`)

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

// The in-page half. Everything here runs before a single module evaluates.
const bootstrap = `(() => {
  // mulberry32, the generator sim-test.js uses. Pinned before boot AND again after ticker.stop().
  let _s = 0
  const reseed = () => { _s = 0x9e3779b9 }
  reseed()
  Math.random = () => {
    _s |= 0; _s = (_s + 0x6d2b79f5) | 0
    let t = Math.imul(_s ^ (_s >>> 15), 1 | _s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  // A save the loader will accept: shop:{} is load-bearing (loadMeta writes INTO it, so a save
  // without it throws and silently falls back to a fresh meta) — see CLAUDE.md.
  const chapters = {}
  for (const id of ['body', ${JSON.stringify(chapter)}]) {
    chapters[id] = { unlocked: true, maxDifficulty: 5, difficulty: 1, best: { time: 0, kills: 0 } }
  }
  // dev: true (v7.x) so a WIP chapter can be probed at all. playableChapterId downgrades a book
  // marked \`wip\` to CHAPTER_ORDER[0] for any save without this flag, so without it --chapter shelf
  // silently shoots THE BODY: a full, correct-looking frame sequence of the wrong chapter, with no
  // error anywhere. Harmless for the shipped chapters, which do not consult it.
  // nick: NON-EMPTY IS LOAD-BEARING (v7.157+). '' is "never chosen" and fires the first-load
  // nickname prompt, which is a modal over the title screen -- the seeded save never reaches a run,
  // and the symptom is fx-probe's "scene never became ready" with no page error and no __fxError,
  // i.e. indistinguishable from a scene that draws nothing. It cost a bisect against a known-good
  // scene to find. Any 3-15 char string does; this one is obviously a probe if it ever leaks.
  localStorage.setItem('charming-anomaly-save-v1', JSON.stringify({
    schema: 1, coins: 0, runs: 5, lang: 'en', chapter: ${JSON.stringify(chapter)}, dev: true,
    shop: {}, best: { time: 0, kills: 0 }, choiceSlots: 2, chapters, nick: 'fxprobe',
  }))

  // A note is DIAGNOSTIC — painted into the page so the screenshot carries it, and nothing more.
  // It must not touch __fxError: that flag aborts the run, and a scene printing its entity counts
  // would then race its own readiness flag and kill the shot it was describing.
  function note(txt, fatal) {
    const d = document.createElement('pre')
    // NB: plain concatenation, not a template literal — this whole function is already inside one
    // (the \`bootstrap\` string below), and a nested backtick closes it and breaks this file.
    d.style.cssText = 'position:fixed;left:0;bottom:0;z-index:99999;margin:0;padding:6px;background:#000;font:11px monospace;white-space:pre-wrap;max-width:100%;color:' + (fatal ? '#f66' : '#0f0')
    d.textContent = txt
    document.body.appendChild(d)
    if (fatal) window.__fxError = txt
  }

  const click = (sel) => { const el = document.querySelector(sel); if (el && !el.disabled) { el.click(); return true } return false }
  let stage = 'title'
  const iv = setInterval(() => {
    if (stage === 'title') { if (click('[data-act="play"]')) stage = 'brief'; return }
    if (stage === 'brief') { if (click('[data-act="brief-start"]')) stage = 'wait'; return }
    if (!window.__run || !window.__app || !window.__stepSim || !window.__renderer) return
    clearInterval(iv)
    try { compose() } catch (e) { note('SCENE THREW: ' + (e && e.stack || e), true) }
  }, 100)

  function compose() {
    const run = window.__run, app = window.__app, step = window.__stepSim
    app.ticker.stop()
    reseed()   // trap 1: the free-running ticker already burned an unknown number of randoms

    let pinned = []
    let pendingDt = 0
    const H = {
      // One sim step with its events dropped. Without the drain the final sync receives every
      // event of the whole warm-up at once and the frame is buried under damage numbers.
      tick(dt = 1 / 60) {
        step(run, { x: 0, y: 0 }, dt)
        run.events.length = 0
        run.player.hp = run.player.maxHP
        pendingDt += dt
      },
      // Same, but FORWARDS this step's events to the renderer instead of dropping them.
      //
      // Use it for any effect that is spawned by an EVENT rather than by a run.* array: the roar
      // band, the tail lash line, the whip, the claw — handleEvents is the only thing that creates
      // those, and H.tick + H.render (which syncs with a hardcoded []) means the event never
      // arrives, so the effect never spawns. A scene built on H.tick therefore captures a frame
      // with no effect in it AND NO ERROR, which is indistinguishable from "the effect is invisible"
      // — v7.27 shipped a claim about the roar's appearance off exactly such a frame.
      //
      // Deliberately a separate call rather than a change to tick(): a long warm-up
      // (H.until/H.breed run hundreds of ticks) must keep dropping its events, or the first render
      // is buried under the whole warm-up's damage numbers, which is what tick()'s drain is for.
      // Step the warm-up with tick(), then the frames you are capturing with tickFx().
      tickFx(dt = 1 / 60) {
        step(run, { x: 0, y: 0 }, dt)
        const events = run.events.splice(0)
        run.player.hp = run.player.maxHP
        pendingDt += dt
        window.__renderer.sync(run, Math.min(pendingDt, 0.05), events)
        pendingDt = 0
        app.renderer.render(app.stage)
        return events
      },
      until(pred, max = 4000) { let g = 0; while (!pred() && g++ < max) { H.tick(); H.pin() } return g < max },
      breed(n, max = 6000) { run.player.hp = run.player.maxHP = 99999; return H.until(() => run.enemies.length >= n, max) },
      // Take the first n bred enemies as the cast and freeze everything about them. Enemies that
      // keep spawning afterwards are NOT pinned and will wander through the shot.
      keep(n) { pinned = run.enemies.slice(0, n); run.enemies = pinned; return pinned },
      // place((i, player) => ({ x, y })) — lays the cast out and pins it there.
      place(fn) {
        pinned.forEach((e, i) => {
          const p = fn(i, run.player)
          e._fx = p.x; e._fy = p.y; e.maxHP = p.hp ?? 99999
        })
        H.pin()
      },
      // hitFlash is cleared too: a cast being struck every frame renders as white silhouettes,
      // which makes it impossible to judge an effect against the sprites it sits over.
      pin() {
        for (const e of pinned) {
          // keep() sets pinned to run.enemies ITSELF — the same array — so everything the sim spawns
          // afterwards joins the pinned list without ever going through place(). Writing an
          // undefined _fx into those is how a scene ends up with a field of NaN-positioned enemies,
          // which renders as "the effect is invisible" and reads as a bug in the effect. Only
          // bodies place() actually laid out are pinned.
          if (e._fx === undefined || e._fy === undefined) continue
          e.x = e._fx; e.y = e._fy; e.hp = e.maxHP
          e._dead = false; e.kb.x = e.kb.y = 0; e.hitFlash = 0
        }
      },
      // REPLACES run.weapons — it does not append. Calling it twice equips only the SECOND weapon,
      // silently, which reads downstream as "the first weapon never fires" (a scene once spent its
      // whole 900-tick H.until budget waiting on a weapon that was not equipped). For a two-weapon
      // scene, assign the array yourself: run.weapons = [{id:'a',level:5},{id:'b',level:5}].
      weapon(id, level = 5, mods = null) {
        run.weapons = [{ id, level }]
        if (mods) run.weaponMods[id] = { ...run.weaponMods[id], ...mods }
      },
      clean() {
        run.gems = []; run.coins = []; run.phase = 'playing'
        const ui = document.getElementById('ui')
        if (ui) ui.style.display = 'none'
      },
      // Renders with the sim time accumulated by tick() since the last render, clamped to main.js's
      // own 0.05 ceiling. NOT sync(run, 0): dt=0 is the game's "frozen behind a modal" path, which
      // holds animT still — and animT is what drives every sprite ROTATION and pulse. A probe that
      // always passed 0 could never show a spin, so a frame sequence of a turning sprite came back
      // looking static and the motion read as "the animation does not work".
      render() {
        window.__renderer.sync(run, Math.min(pendingDt, 0.05), [])
        pendingDt = 0
        app.renderer.render(app.stage)
      },
      // Remember a decaying list's lives so the same cast can be re-rendered at any point of its
      // fade. Returns the scrub function a scene should hand back.
      scrub(list) {
        const t0 = list.map((s) => s.life)
        return (age) => {
          list.forEach((s, i) => { s.life = t0[i] * (1 - age) })
          H.render()
        }
      },
      note,
    }

    const scrub = (function (run, app, step, H) { ${readFileSync(scenePath, 'utf8')} })(run, app, step, H)
    H.clean()
    H.render()
    window.__fxScrub = typeof scrub === 'function' ? scrub : () => H.render()
    window.__fxReady = true
  }
})()`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = 9333 + (process.pid % 200)   // parallel sessions must not collide on the debug port
const browser = spawn(chrome, [
  '--no-sandbox', '--hide-scrollbars', `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/fx-probe-${process.pid}`, 'about:blank',
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
  throw new Error('devtools never came up')
}

const page = await target()
const ws = new WebSocket(page.webSocketDebuggerUrl)   // global WebSocket: needs node >= 22
await new Promise((r) => { ws.onopen = r })
let msgId = 0
const pending = new Map()
// Page-side errors, echoed to this terminal. Without these, a scene (or a renderer branch it
// exercises) that THROWS produces exactly the same symptom as an effect that draws nothing: "scene
// never became ready", and no clue which. That cost a debugging round on the v6.10 hydrant A/B,
// where one of four look variants threw and the other three were fine — indistinguishable from the
// variant simply being invisible until the exception was surfaced.
const pageErrors = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params?.exceptionDetails
    const msg = d?.exception?.description || d?.text || 'unknown exception'
    pageErrors.push(msg)
    console.error('PAGE ERROR: ' + msg.split('\n').slice(0, 4).join('\n'))
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
    const msg = (m.params.args || []).map((a) => a.description ?? a.value).join(' ')
    pageErrors.push(msg)
    console.error('PAGE CONSOLE ERROR: ' + msg)
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
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: bootstrap })
await send('Page.navigate', { url: url + (url.includes('?') ? '&' : '?') + 'debug' })

// The scene runs thousands of sim steps SYNCHRONOUSLY, which blocks the main thread — a capture
// taken during that block is plain white and looks exactly like a blank-page bug. So poll for the
// ready flag rather than trusting a wall-clock wait.
// ALWAYS kill the browser on the way out. A bail-out that leaves it running turns one failed run
// into a permanent CPU tax: the next probe boots slower, times out, leaks another browser, and the
// failures look like flaky scenes rather than the pile-up they are (8 orphans in one session).
const die = (msg) => {
  console.error(msg)
  if (pageErrors.length) console.error(`\n${pageErrors.length} page error(s) above are almost certainly the cause.`)
  browser.kill()
  process.exit(1)
}
let ready = false
for (let i = 0; i < Math.ceil(waitMs / 500) + 40; i++) {
  if (await evaluate('window.__fxReady === true')) { ready = true; break }
  const err = await evaluate('window.__fxError || null')
  if (err) die(err)
  await sleep(500)
}
if (!ready) die('scene never became ready — raise --wait, or check that the page reached a run')

// Confirm the run that actually booted is the chapter this shot claims to be — playableChapterId
// (main.js) or a stale/garbage seed could otherwise have quietly landed on CHAPTER_ORDER[0].
const actualChapter = await evaluate('window.__run && window.__run.chapter')
if (actualChapter !== chapter) die(`asked for chapter=${chapter}, but window.__run.chapter=${actualChapter}`)
console.log(`run.chapter confirmed: ${actualChapter}`)

for (let i = 0; i < frames; i++) {
  await evaluate(`window.__fxScrub(${frames > 1 ? (i / (frames - 1)).toFixed(4) : '0'})`)
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${out}-${String(i).padStart(2, '0')}.png`, Buffer.from(data, 'base64'))
}
console.log(`wrote ${frames} frame(s): ${out}-00.png${frames > 1 ? ` .. ${out}-${String(frames - 1).padStart(2, '0')}.png` : ''}`)

ws.close()
browser.kill()
process.exit(0)
