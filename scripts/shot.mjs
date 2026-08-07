// Screenshot a page at a real phone viewport, without the DevTools MCP.
//
//   node scripts/shot.mjs <url> <out.png> [waitMs] [width] [height] [seed.js]
//   node scripts/shot.mjs http://localhost:5173/ /tmp/title.png 8000 390 844 /tmp/seed.js
//
// WHY THIS EXISTS: the usual probe path is the chrome-devtools MCP tab, but its browser profile is
// single-instance — a second Claude session (or a stale one) holds it and every tool call fails
// with "browser is already running". This is the fallback, and it has three traps baked out of it:
//
//   1. `google-chrome --headless=new --screenshot` reports innerWidth/innerHeight as 0 here. It
//      still paints, at some unrelated internal size, and tiles that into the output file — so the
//      capture looks like a layout bug (clipped badges, cards running off the edge) that does not
//      exist. Anything you measure from those images is fiction. `--headless=old` would honour
//      --window-size but has been removed from the Chrome binary. chrome-headless-shell, which
//      puppeteer caches, is the one that still behaves.
//   2. `--virtual-time-budget` fires the capture when VIRTUAL time expires, which has nothing to do
//      with Pixi finishing its async boot (texture loads, GPU work). The app screenshots blank. So
//      this drives CDP and sleeps on the wall clock instead.
//   3. Seeding a save needs Page.addScriptToEvaluateOnNewDocument (the CDP form of the initScript
//      rule in CLAUDE.md's Browser probing section), not setItem + reload.
//
// For pure DOM/CSS work on ui.js you usually do NOT need this at all — see the harness trick in
// CLAUDE.md, which renders any screen without booting Pixi and shoots fine in any headless mode.
import { writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const [url, out, waitMs = '8000', W = '390', H = '844', seedFile] = process.argv.slice(2)
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [waitMs] [w] [h] [seed.js]')
  process.exit(1)
}

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = 9333 + (process.pid % 200)   // parallel sessions must not collide on the debug port
const browser = spawn(chrome, [
  '--no-sandbox', '--hide-scrollbars', `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/shot-${process.pid}`, 'about:blank',
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
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) }
}
const send = (method, params = {}) => new Promise((res) => {
  const n = ++msgId
  pending.set(n, res)
  ws.send(JSON.stringify({ id: n, method, params }))
})

await send('Page.enable')
// deviceScaleFactor 2 + mobile:true so the capture matches what a phone actually renders
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 2, mobile: true })
if (seedFile) await send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(seedFile, 'utf8') })
await send('Page.navigate', { url })
await sleep(+waitMs)
const { data } = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(data, 'base64'))
console.log(`wrote ${out} (${W}x${H} @2x, waited ${waitMs}ms)`)

ws.close()
browser.kill()
process.exit(0)
