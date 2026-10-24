// PIXEL-DRIFT GATE: is the IN-GAME boss painter (src/ophan/painters/<look>.js, on px2d into Pixi) still the one the owner
// approved (scripts/ophan-drift/approved/<look>.js, on Canvas2D, its native target)?
//   node scripts/ophan-drift.mjs <look> [--url http://127.0.0.1:5173/] [--c2d | --self] [--out <dir>]
// Needs `npm run dev` already serving --url: the page is ophan-drift.html?drift=<look> (a dev page, never built).
// Both painters on one flat grey background, same frame (t = 2), same size: idle at phases 1-3 (pencil: 4) and every
// attack at phase 3. --c2d draws the candidate on Canvas2D too: the do-nothing control, every state must read 0.00.
// --self draws the CANDIDATE on both sides (Canvas2D vs game tech): the port alone, with no approval gap in it (not the
// Core, whose painter is px2d-only).
// Per state, over the boss box, in 4x4 device-px blocks (2 css px, so antialiasing half a pixel apart cancels): mean |diff|
// (0-255, RGB) and % of blocks with a channel off by more than 48. Writes <out>/<look>-<state>.png = [approved | candidate
// | heat]. Exit 1 if any state fails: mean > MEAN or % > BIG.
// Ported from the artifact's drift gate (cru/gametech/w/art/cmp/drift.mjs), pass line unchanged.
import { writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
// THE PASS LINE, calibrated 2026-10-24 on 2x2-css-px blocks (worst state of each run; mean / % blocks off by >48):
//   do-nothing (a painter vs itself, both Canvas2D)              0.00 / 0.00   every state
//   port noise (the same painter, Canvas2D vs game tech):        toon 1.34/0.37  holo 1.05/0.15  pencil 0.78/0.07
//                                                                macro 0.34/0.00  ascii 0.14/0.00  pixel 0.20/0.00  Core 2.37/0.61
//   known drift (approved vs the drifted painters of 10:00):     holo (eyes recoloured + silhouette) 1.95/1.83 at its mildest
//                                                                state (recall), every other state and style 2.4-30 / 2.2-28
//   The >48 share separates them (noise <= 0.61, drift >= 1.83): BIG sits between. MEAN is a backstop above the Core's
//   sheen noise (2.37), for a drift spread thin over the whole boss.
const MEAN = 3.0, BIG = 1.0
const LOOKS = ['toon', 'holo', 'pencil', 'ascii', 'macro', 'pixel', 'liquid']
const ATTACKS = [['sword', 0.45], ['blast', 0.55], ['tornado', 0.6], ['laser', 0.7], ['wheel', 0.5], ['recall', 0.5]]
const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args.splice(i, 2)[1] }
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true }
const url = opt('--url') || 'http://127.0.0.1:5173/', out = resolve(opt('--out') || '/tmp/ophan-drift'), c2d = flag('--c2d'), self = flag('--self'), [st] = args
if (!LOOKS.includes(st)) { console.error('usage: ophan-drift.mjs <' + LOOKS.join('|') + '> [--url U] [--c2d | --self] [--out dir]'); process.exit(2) }
if (!existsSync(new URL('./ophan-drift/approved/' + st + '.js', import.meta.url))) { console.error('no approved painter: scripts/ophan-drift/approved/' + st + '.js'); process.exit(2) }
const page = new URL('ophan-drift.html?drift=' + st, url).href
try { await fetch(page) } catch { console.error('NOTHING IS SERVING ' + page + ': start npm run dev (or npx vite --port N --strictPort) and pass --url'); process.exit(2) }
mkdirSync(out, { recursive: true })

// one headless browser (killed on exit and on signals)
const base = join(process.env.HOME, '.cache/puppeteer/chrome-headless-shell'), v = readdirSync(base).sort().reverse()[0], chrome = join(base, v, 'chrome-headless-shell-linux64', 'chrome-headless-shell')
const sleep = (t) => new Promise((r) => setTimeout(r, t)), PORT = 9800 + (process.pid % 150), prof = '/tmp/ophan-drift-' + process.pid
const browser = spawn(chrome, ['--no-sandbox', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=500,500', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' })
const kill = () => { try { browser.kill('SIGKILL') } catch { /* gone */ } try { rmSync(prof, { recursive: true, force: true }) } catch { /* best effort */ } }
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { kill(); process.exit(143) })
process.on('exit', kill); setTimeout(() => { console.error('TIMEOUT'); process.exit(3) }, 300000)
let tab; for (let i = 0; i < 80 && !tab; i++) { try { tab = (await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()).find((t) => t.type === 'page') } catch { /* not up */ } if (!tab) await sleep(250) }
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r })
let id = 0; const P = new Map(); ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m); P.delete(m.id) } }
const send = (method, params = {}) => new Promise((r) => { const n = ++id; P.set(n, r); ws.send(JSON.stringify({ id: n, method, params })) })
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 500, height: 500, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: page })
let ready = false
for (let i = 0; i < 120 && !ready; i++) { ready = await ev("typeof DRIFT === 'function' && !!OPHAN[" + JSON.stringify(st + '~A') + ']').catch(() => false); if (!ready) await sleep(250) }
if (!ready) { console.error('the page never became ready: ' + (await ev("document.getElementById('out').textContent").catch(() => '?'))); process.exit(3) }
await ev('document.fonts.ready.then(() => 1)'); await sleep(500)

const ph3 = st === 'pencil' ? 4 : 3
const states = (st === 'pencil' ? [4] : [1, 2, 3]).map((ph) => ['idle-ph' + ph, null, 0, ph])
for (const [k, u] of ATTACKS) if (await ev('!!OPHAN[' + JSON.stringify(st) + '].attack')) states.push([k, k, u, ph3])
console.log('drift ' + st + '  approved scripts/ophan-drift/approved/' + st + '.js  vs  candidate src/ophan/painters/' + (st === 'liquid' ? 'core' : st) + '.js' + (self ? '  (self: the candidate, Canvas2D vs game tech)' : c2d ? (st === 'liquid' ? '  (control: the approved twice, Canvas2D)' : '  (both Canvas2D)') : '  on game tech'))
console.log('pass: mean <= ' + MEAN + ' and >48 <= ' + BIG + '%\n  state      mean   >48 %   box         result')
let fail = 0
for (const [name, atk, u, ph] of states) {
  const r = await ev('DRIFT(' + JSON.stringify(st) + ', ' + JSON.stringify({ atk, u, t: 2, ph }) + ', ' + JSON.stringify(self ? 'self' : c2d ? 'c2d' : 'gt') + ')')
  const ok = r.mean <= MEAN && r.big <= BIG; if (!ok) fail++
  if (r.png) writeFileSync(join(out, st + '-' + name + '.png'), Buffer.from(r.png.split(',')[1], 'base64'))
  console.log('  ' + name.padEnd(9) + r.mean.toFixed(2).padStart(6) + r.big.toFixed(2).padStart(8) + '   ' + (r.box[2] + 'x' + r.box[3]).padEnd(11) + (ok ? 'pass' : 'FAIL'))
}
console.log(fail ? 'DRIFT GATE: FAIL (' + fail + ' of ' + states.length + ' states)' : 'DRIFT GATE: PASS')
console.log('heatmaps: ' + out + '/' + st + '-<state>.png  ([approved | candidate | heat])')
kill(); process.exit(fail ? 1 : 0)
