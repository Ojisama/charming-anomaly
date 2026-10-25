// THE OPHAN'S STAGING, SHOT: frames of ophan-stage.html (the real renderer and looks, a staged run) at chosen points of a
// beat, one page load for all of them (the warm-up bakes every world first, ~20 s). Writes <out>/<beat>-<look>-<u>.png,
// the stage only (the controls cropped off), and prints each look's label.
//
//   npx vite --port 5291 --strictPort &
//   FX_CHROME_ARGS='--use-gl=angle --use-angle=gl --enable-gpu --ignore-gpu-blocklist' \
//     node scripts/ophan-stage-strip.mjs --beat arrive --looks A,B,C --us 0.1,0.3,0.5,0.7,0.95 --out /tmp/stage
//   (--world 0..5 the skin worn or broken, --ph 1..3, --url to point elsewhere, --w/--h the viewport)
//
// Same Chrome and CDP path as scripts/shot.mjs (read its header for why it is not the MCP tab).
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] }
const BEAT = arg('beat', 'arrive'), LOOKS = arg('looks', 'A').split(','), US = arg('us', '0.2,0.5,0.8').split(',').map(Number)
const WORLD = +arg('world', 0), PH = +arg('ph', 1), OUT = arg('out', '/tmp/ophan-stage'), W = +arg('w', 390), H = +arg('h', 844)
const URL0 = arg('url', 'http://localhost:5291/ophan-stage.html')
try { await fetch(URL0, { signal: AbortSignal.timeout(4000) }) } catch { console.error('NOTHING IS SERVING ' + URL0 + ': start the dev server first'); process.exit(2) }
const base = join(process.env.HOME ?? '', '.cache/puppeteer/chrome-headless-shell')
const chrome = process.env.CHROME_HEADLESS_SHELL ?? (existsSync(base) ? readdirSync(base).sort().reverse().map((v) => join(base, v, 'chrome-headless-shell-linux64', 'chrome-headless-shell')).find(existsSync) : null)
if (!chrome) { console.error('No chrome-headless-shell in ~/.cache/puppeteer. Set CHROME_HEADLESS_SHELL=<path>.'); process.exit(1) }
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = 9333 + (process.pid % 200)
const browser = spawn(chrome, ['--no-sandbox', '--hide-scrollbars', `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/strip-${process.pid}`,
  ...(process.env.FX_CHROME_ARGS ? process.env.FX_CHROME_ARGS.split(' ') : []), 'about:blank'], { stdio: 'ignore' })
let page = null
for (let i = 0; i < 80 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page') } catch { /* not up */ } if (!page) await sleep(250) }
if (!page) { browser.kill(); throw new Error('devtools never came up') }
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => { ws.onopen = r })
let n = 0
const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise((res) => { const id = ++n; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (expr) => { const m = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (m.result?.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails)); return m.result?.result?.value }
const errs = []
await send('Runtime.enable'); await send('Page.enable')
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails?.exception?.description ?? 'exception') })
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: URL0 })
let ok = false
for (let i = 0; i < 240 && !ok; i++) { await sleep(500); ok = await ev('!!window.__stage?.ready').catch(() => false) }
if (!ok) { console.error('the playground never got ready' + (errs.length ? ': ' + errs[0] : '')); browser.kill(); process.exit(1) }
const barH = await ev("document.getElementById('bar').offsetHeight")
for (const look of LOOKS) {
  // a break's looks are per world: '<that world's look>:<variant>'
  const id = BEAT === 'break' ? ['macro', 'holo', 'ascii', 'pixel', 'toon', 'liquid'][WORLD] + ':' + look : look
  for (const u of US) {
    const label = await ev(`window.__stage.show(${JSON.stringify(BEAT)}, ${JSON.stringify(id)}, ${WORLD}, ${PH}, ${u})`)
    await sleep(120)
    const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H - barH, scale: 1 } })
    const f = join(OUT, `${BEAT}-${look.replace(':', '_')}-${u}.png`)
    writeFileSync(f, Buffer.from(result.data, 'base64'))
    if (u === US[0]) console.log(`${look}: ${label}`)
  }
}
if (errs.length) console.error('PAGE ERRORS: ' + errs.slice(0, 3).join(' | '))
ws.close(); browser.kill(); process.exit(errs.length ? 1 : 0)
