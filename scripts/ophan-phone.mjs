// The Ophan's whole fight on a real device: frame time from the first fight frame to `victory`.
//
//   node scripts/ophan-phone.mjs --adb <serial> --url http://127.0.0.1:5173/?debug [--diff 3] [--out <dir>]
//   node scripts/ophan-phone.mjs --cdp http://127.0.0.1:9333 --url http://127.0.0.1:5321/?debug   # any CDP, no adb
//
// It opens --url (a vite DEV server: the bot is imported from /scripts/ophan-bot.js), seeds a DEV save on The Ophan,
// reloads, clicks Play then the brief's Start once it is enabled (so prewarm runs during the brief, as for a player),
// and drives scripts/ophan-bot.js from a rAF loop in the page: synthetic KeyW/A/S/D and Digit1-6 on window, the
// player's hp refilled every frame, the first card taken on every level-up. Every rAF delta is recorded with what was
// on screen. The bot's own per-frame cost is recorded too: a player does not pay it, so it is reported beside the fps.
// With --adb: forwards 9229, reverses the server's port, aborts on the lock screen, holds screen_off_timeout at 600000
// while measuring and puts 60000 back on every exit, and closes only the tabs it opened.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const ADB = arg('adb', null)
const CDP = arg('cdp', 'http://127.0.0.1:9229')
const URL_ = arg('url', 'http://127.0.0.1:5173/?debug')
const DIFF = +arg('diff', 3)
const OUT = arg('out', null)
const CAP_MS = 15 * 60e3
const PASS = { fps: 58, p95: 20, worst: 100 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const die = (msg, code = 2) => { console.error('ABORT: ' + msg); process.exit(code) }

// ---- device setup and the cleanup every exit path runs (sync, so it also runs from 'exit') ----------------------------
const adb = (...a) => execFileSync('adb', ['-s', ADB, ...a], { encoding: 'utf8', timeout: 20000, maxBuffer: 64e6 })
const ours = new Set()
let timeoutRaised = false
function cleanup() {
  for (const id of ours) { try { execFileSync('curl', ['-s', '-m', '5', `${CDP}/json/close/${id}`]) } catch { /* already gone */ } }
  ours.clear()
  if (timeoutRaised) {
    timeoutRaised = false
    try { adb('shell', 'settings', 'put', 'system', 'screen_off_timeout', '60000'); console.error('screen_off_timeout restored to 60000') } catch (e) { console.error('FAILED to restore screen_off_timeout: ' + e.message) }
  }
}
process.on('exit', cleanup)
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => process.exit(130))
process.on('uncaughtException', (e) => { console.error(e); process.exit(1) })
process.on('unhandledRejection', (e) => { console.error(e); process.exit(1) })

const tabs = async () => (await (await fetch(`${CDP}/json/list`)).json()).filter((t) => t.type === 'page')
if (ADB) {
  const locked = () => adb('shell', 'dumpsys', 'window').includes('isKeyguardShowing=true')
  try { adb('get-state') } catch { die(`no device ${ADB} on adb`) }
  if (locked()) die('the phone is on its lock screen (it needs the owner PIN). Nothing was changed.')
  adb('shell', 'settings', 'put', 'system', 'screen_off_timeout', '600000')
  timeoutRaised = true
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
  await sleep(2000)
  if (locked()) die('the lock screen came up on wake (it needs the owner PIN)')
  adb('forward', 'tcp:9229', 'localabstract:chrome_devtools_remote')
  adb('reverse', `tcp:${new URL(URL_).port}`, `tcp:${new URL(URL_).port}`)
}

// ---- open our tab --------------------------------------------------------------------------------------------------
let before
try { before = new Set((await tabs()).map((t) => t.id)) } catch (e) { die(`no CDP endpoint at ${CDP} (${e.message})`) }
if (ADB) adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${URL_}'`, 'com.android.chrome')
else await fetch(`${CDP}/json/new?${encodeURI(URL_)}`, { method: 'PUT' })
let pg
for (let i = 0; i < 30 && !pg; i++) {
  await sleep(1000)
  const fresh = (await tabs()).filter((t) => !before.has(t.id))
  fresh.forEach((t) => ours.add(t.id))
  pg = fresh.find((t) => t.url.startsWith(new URL(URL_).origin))
}
if (!pg) die(`no page at ${URL_} opened`)

const ws = new WebSocket(pg.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0
const P = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m); P.delete(m.id) } }
const send = (method, params = {}) => new Promise((r) => { const n = ++id; P.set(n, r); ws.send(JSON.stringify({ id: n, method, params })) })
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.error || r.result?.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.error ?? r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}
const until = async (expr, ms, what) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(500)) { try { if (await ev(expr)) return } catch { /* mid-reload */ } }
  die(what)
}
await send('Page.bringToFront')
await until(`document.readyState === 'complete' && !!document.querySelector('[data-act="play"]')`, 40000, 'the title never loaded')

// ---- seed a DEV save on The Ophan, reload, Play, Start ----------------------------------------------------------------
const chapters = Object.fromEntries(['body', 'ophan'].map((c) => [c, { unlocked: true, maxDifficulty: 5, difficulty: DIFF, best: { time: 0, kills: 0 } }]))
const save = { schema: 1, coins: 0, runs: 5, lang: 'en', chapter: 'ophan', dev: true, shop: {}, best: { time: 0, kills: 0 }, choiceSlots: 2, chapters, nick: 'phonetest' }
await ev(`localStorage.setItem('charming-anomaly-slot', '1'); localStorage.removeItem('charming-anomaly-run'); sessionStorage.removeItem('ca-brief-resume');
  localStorage.setItem('charming-anomaly-save-v1', ${JSON.stringify(JSON.stringify(save))}); location.reload(); 1`)
await sleep(1500)
await until(`document.readyState === 'complete' && !!document.querySelector('[data-act="play"]:not([disabled])')`, 40000, 'the title never came back after the reload')
await ev(`document.querySelector('[data-act="play"]').click(); 1`)
const briefAt = Date.now()

// ---- the driver + recorder, one rAF loop in the page, armed during the brief ------------------------------------------
// Re-armed whenever the page has lost it: Start reloads the page when it finds a newer build (main.js onBriefStart).
const DRIVER = `(async () => {
  const { ophanBot } = await import(new URL('/scripts/ophan-bot.js', location.origin).href)
  const rec = window.__oph15 = { d: [], tag: [], bot: [], hidden: 0, done: false, end: '' }
  const held = new Set()
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }))
  const hold = (code, on) => { if (on === held.has(code)) return; on ? held.add(code) : held.delete(code); key(on ? 'keydown' : 'keyup', code) }
  const T = 0.38   // past sin(22.5 deg): the stick's 16 directions land on the nearest of the keyboard's 8
  let last = -1, pressAt = 0, t0 = -1
  const f = (now) => {
    const run = window.__run, o = run?.script?.oph
    // idle through the brief: the first delta recorded ends on the fight's second frame
    if (t0 < 0) { if (run?.phase === 'playing' && o) t0 = last = now; requestAnimationFrame(f); return }
    {
      rec.d.push(+(now - last).toFixed(2))
      if (document.visibilityState !== 'visible') rec.hidden++
      rec.tag.push(o ? [o.atk?.k ?? '-', o.wipe ? 'wipe' : '', o.tell > 0 ? 'tell' : o.after >= 0 ? 'swap' : '', 'w' + o.world, 's' + o.skin,
        o.sketch ? 'sketch' : '', run.phase === 'playing' ? '' : run.phase].filter(Boolean).join(' ') : run?.phase ?? '?')
    }
    last = now
    if (!run || run.phase === 'victory' || run.chapter !== 'ophan' || now - t0 > ${CAP_MS}) {
      for (const c of held) key('keyup', c)
      rec.end = run?.phase === 'victory' ? 'victory' : now - t0 > ${CAP_MS} ? 'cap' : 'left the fight (' + run?.phase + ')'
      rec.done = true
      return
    }
    const b0 = performance.now()
    run.player.hp = run.player.maxHP
    if (run.phase === 'levelup') document.querySelector('#ui [data-choose], #ui [data-subject]')?.click()
    else if (run.phase === 'playing' && o) {
      const v = ophanBot(run)
      hold('KeyW', v.y < -T); hold('KeyS', v.y > T); hold('KeyA', v.x < -T); hold('KeyD', v.x > T)
      // one press per 0.2 s at most: a refused press (a broken band) would otherwise fire every frame
      if (v.world >= 0 && v.world !== o.world && now - pressAt > 200) { pressAt = now; key('keydown', 'Digit' + (v.world + 1)); key('keyup', 'Digit' + (v.world + 1)) }
    }
    rec.bot.push(+(performance.now() - b0).toFixed(3))
    requestAnimationFrame(f)
  }
  requestAnimationFrame(f)
  return 1
})()`
await until(`(async () => { if (!window.__oph15) await ${DRIVER}
  if (window.__run?.phase === 'playing' && window.__run.script?.oph) return true
  const b = document.querySelector('[data-act="brief-start"]'); if (b && !b.disabled) b.click(); return false })()`, 120000,
'the fight never started (no brief-start, no script.oph, or the bot failed to import from /scripts/ophan-bot.js)')
const brief = Date.now() - briefAt
const ch = await ev(`[window.__run.chapter, window.__run.difficulty]`)
if (ch[0] !== 'ophan') die(`wrong chapter: ${ch[0]}`)
if (ch[1] !== DIFF) die(`wrong difficulty: ${ch[1]} (asked ${DIFF})`)
console.error(`fight started (brief ${(brief / 1000).toFixed(1)} s, d${DIFF}); recording to victory, cap ${CAP_MS / 60e3} min`)
for (let t = 0; !(await ev('window.__oph15.done')); t++) {
  await sleep(5000)
  if (t % 6 === 5) console.error(`  ${await ev(`(() => { const o = __run.script?.oph; return __oph15.d.length + ' frames, t ' + Math.round(o?.t ?? 0) + ' s, broken ' + (o?.broken.join('') ?? '-') + (o?.sketch ? ' sketch' : '') })()`)}`)
}
const rec = await ev('window.__oph15')

// ---- report -------------------------------------------------------------------------------------------------------
if (!rec.d.length) die('no frames recorded')
if (rec.hidden) die(`${rec.hidden} frames ran with the page hidden (screen off or tab switched): not a measurement`)
const n = rec.d.length, sorted = [...rec.d].sort((a, b) => a - b), tot = rec.d.reduce((a, b) => a + b, 0)
const fps = n * 1000 / tot, q = (p) => sorted[Math.min(n - 1, Math.floor(n * p))]
const r = { device: ADB ?? CDP, url: URL_, diff: DIFF, end: rec.end, briefS: +(brief / 1000).toFixed(1), frames: n, seconds: +(tot / 1000).toFixed(1),
  fps: +fps.toFixed(1), p50: q(0.5), p95: q(0.95), worst: sorted.at(-1), over50: rec.d.filter((d) => d > 50).length, over100: rec.d.filter((d) => d > 100).length,
  botMeanMs: +(rec.bot.reduce((a, b) => a + b, 0) / rec.bot.length).toFixed(3), botMaxMs: Math.max(...rec.bot) }
console.log(`${r.end.toUpperCase()} after ${r.seconds} s, ${n} frames (d${DIFF}, ${r.device})`)
console.log(`mean ${r.fps} fps   p50 ${r.p50} ms   p95 ${r.p95} ms   worst ${r.worst} ms   >50 ms: ${r.over50}   >100 ms: ${r.over100}`)
console.log(`bot cost (in the frame, a player does not pay it): mean ${r.botMeanMs} ms, max ${r.botMaxMs} ms`)
console.log('10 worst frames:')
const worst = rec.d.map((d, i) => [d, i]).sort((a, b) => b[0] - a[0]).slice(0, 10)
for (const [d, i] of worst) console.log(`  ${d.toFixed(1).padStart(7)} ms  frame ${String(i).padStart(6)} @ ${(rec.d.slice(0, i).reduce((a, b) => a + b, 0) / 1000).toFixed(1).padStart(6)} s  ${rec.tag[i]}`)
const checks = [[`mean >= ${PASS.fps} fps`, r.fps >= PASS.fps], [`p95 <= ${PASS.p95} ms`, r.p95 <= PASS.p95], [`no frame > ${PASS.worst} ms`, r.worst <= PASS.worst], ['reached victory', r.end === 'victory']]
for (const [c, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${c}`)
if (OUT) {
  mkdirSync(OUT, { recursive: true })
  const f = join(OUT, `ophan-phone-d${DIFF}-${Date.now()}.json`)
  writeFileSync(f, JSON.stringify({ ...r, d: rec.d, tag: rec.tag, bot: rec.bot }))
  console.log('raw: ' + f)
}
ws.close()
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
