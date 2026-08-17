// Bakes the title screen's chapter-card cast thumbnails to src/cast/<rosterId>.png.
//
// WHY A SCRIPT AND NOT RUNTIME: these are the game's own creature textures, and the only thing that
// can draw them is render.js — which needs Pixi and a GPU. The first cut extracted them live at
// boot (renderer.extract.base64), and every extract is a readPixels that stalls the pipeline until
// the GPU catches up; a late-game save asked for two dozen. Baked once into files, the cards just
// reference URLs like any other asset and boot pays nothing.
//
// ponytail: hand-run, not wired into `npm run build`. Re-run it when a creature's art changes or a
// chapter's `render.cast` names a new id — otherwise the cards keep showing the old drawing, which
// nothing will warn you about. Wire it into the build if that bites more than once.
//
//   node scripts/bake-cast.mjs
//
// It starts its own vite dev server, drives chrome-headless-shell over CDP, loads the game with
// ?debug (which exposes window.__renderer), and calls the renderer's own castThumbs().
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src', 'cast')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// chrome-headless-shell, wherever puppeteer put it. Plain Chrome's new headless mode reports a
// zero-size viewport here and never finishes the Pixi boot, so this specifically wants the shell.
function findChrome() {
  const envPath = process.env.CHROME_HEADLESS_SHELL
  if (envPath) return envPath
  const base = join(process.env.HOME ?? '', '.cache/puppeteer/chrome-headless-shell')
  if (!existsSync(base)) return null
  for (const v of readdirSync(base).sort().reverse()) {
    const p = join(base, v, 'chrome-headless-shell-linux64', 'chrome-headless-shell')
    if (existsSync(p)) return p
  }
  return null
}

const { CHAPTERS } = await import('../src/config.js')
// EVERY ROSTER ENTRY, not just each chapter's curated `render.cast`. The cast lists exist to pick the
// three or four faces a TITLE CARD shows, and they are a design choice — but from v7.120 the summary
// screen's damage recap can name ANY creature that hurt you, and a creature with no baked thumbnail
// shows an empty slot there. Widening the bake gives that screen the game's own art for all of them
// (7 were missing: patrolDrone, invader, hulk, bindnode, antibody1..3) and changes nothing about the
// title cards, which still read their own `render.cast`.
// Object.values(CHAPTERS), never CHAPTER_ORDER — that is Book 1 only, and ALL_CHAPTER_IDS still drops
// every `hidden` id, which is exactly where four of those seven live (The Blank's boss parts).
const ids = [...new Set([
  ...Object.values(CHAPTERS).flatMap((c) => c.render?.cast ?? []),
  ...Object.values(CHAPTERS).flatMap((c) => (c.roster ?? []).map((r) => r.id)),
])]
console.log(`baking ${ids.length} cast thumbnails across ${Object.keys(CHAPTERS).length} chapters:`, ids.join(', '))

const chrome = findChrome()
if (!chrome) {
  console.error('No chrome-headless-shell found. Set CHROME_HEADLESS_SHELL=/path/to/chrome-headless-shell')
  process.exit(1)
}

// ---- vite dev server ----
const vite = spawn('npx', ['vite', '--port', '5199', '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
const dead = (code) => { console.error('vite exited', code); process.exit(1) }
vite.on('exit', dead)
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite never came up')), 30000)
  vite.stdout.on('data', (b) => { if (b.toString().includes('5199')) { clearTimeout(t); res() } })
})

// ---- browser over CDP ----
const PORT = 9411
const browser = spawn(chrome, [
  '--no-sandbox', '--hide-scrollbars', '--window-size=390,844',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/bake-cast-${process.pid}`, 'about:blank',
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
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => { ws.onopen = r })
let msgId = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params = {}) => new Promise((res) => {
  const n = ++msgId
  pending.set(n, res)
  ws.send(JSON.stringify({ id: n, method, params }))
})

await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url: 'http://localhost:5199/?debug' })

// Wait for boot: ?debug parks the renderer on window.__renderer once app.init and renderer.ready
// have both resolved, which is exactly the point the textures exist.
let ready = false
for (let i = 0; i < 120 && !ready; i++) {
  await sleep(500)
  const r = await send('Runtime.evaluate', { expression: 'typeof window.__renderer', returnByValue: true })
  ready = r.result?.result?.value === 'object'
}
if (!ready) { console.error('renderer never booted'); process.exit(1) }

const res = await send('Runtime.evaluate', {
  expression: `window.__renderer.castThumbs(${JSON.stringify(ids)})`,
  awaitPromise: true,
  returnByValue: true,
})
const art = res.result?.result?.value ?? {}

mkdirSync(OUT, { recursive: true })
let written = 0
for (const id of ids) {
  const url = art[id]
  if (!url) { console.warn(`  ! no art for "${id}" — is it in render.js's ROSTER_LOOKS?`); continue }
  const b64 = url.slice(url.indexOf(',') + 1)
  writeFileSync(join(OUT, `${id}.png`), Buffer.from(b64, 'base64'))
  written++
}
console.log(`wrote ${written}/${ids.length} to src/cast/`)

ws.close()
browser.kill()
vite.off('exit', dead)
vite.kill()
process.exit(written === ids.length ? 0 : 1)
