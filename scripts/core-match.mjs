// THE CORE GAUNTLET SHOTS: every element of the Liquid Metal FINAL demo and the game, laid out the same,
// shot at the same phone viewport (390x844 CSS px at DPR 3) and the same on-screen scale, cropped the same.
//
//   node scripts/core-match.mjs <outDir> [--url http://127.0.0.1:5173/] [--only E2,E6]
//     -> <outDir>/demo/E1.png .. E8.png and <outDir>/game/E1.png .. E8.png (E8 = a 6-frame strip while moving)
//
// Needs the dev server up (npm run dev) for the game half. Both halves draw on the real GPU.
//   demo: docs/superpowers/specs/assets/core-liquid-final.html served as it stands, its canvas laid full-width
//         (390 CSS px = its 0.741 units: 526 px per unit), its HUD, buttons and weapons off, every body pinned.
//   game: scripts/fx-probe.mjs + scripts/scenes/core-match.js, The Core's camera at its viewW framing (the same
//         526 px per unit on this phone), the player moved to the demo's spot so the floor is the same water.
// The one deliberate difference is the owner's: the player is the game's mint blob with a pole ring.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs'
import { spawn, execFileSync } from 'node:child_process'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const out = resolve(argv[0] || '/tmp/core-match')
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d }
const URL0 = opt('url', 'http://127.0.0.1:5173/')
const ONLY = opt('only', '')
const W = 390, H = 844, DPR = 3, K = W * 1.35   // CSS px per demo unit (the demo's canvas spans 1 / 1.35 units)
const GPU = '--use-gl=angle --use-angle=gl --enable-gpu --ignore-gpu-blocklist'

// ---- the scenes (demo units from the player; the player stands at (1.5, 2.0), your pole North) ----------
const rnd = (() => { let s = 12345; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } })()
const crowd = []
for (let i = 0; i < 22; i++) {
  let x, y
  do { x = (rnd() - 0.5) * 0.66; y = (rnd() - 0.5) * 0.9 } while (Math.hypot(x, y) < 0.07)
  crowd.push(['mite', +x.toFixed(3), +y.toFixed(3), rnd() < 0.5 ? 1 : -1, +(rnd() * 4).toFixed(2)])
}
const CAST = [['mite', -0.13, -0.09, 1, 0.4], ['mite', 0.07, 0.1, -1, 1.3], ['urchin', 0.15, -0.07, -1, 2.1], ['top', -0.11, 0.13, -1, 0.7],
  ['blob', 0.14, 0.15, -1, 1.9], ['eel', -0.17, 0.02, 1, 3.1], ['golem', 0.01, -0.21, -1, 2.6]]
const FIELD = { pillars: [[-0.2, -0.27, 1], [0.21, 0.2, -1]], pools: [[-0.21, 0.27, 0.1, 0.07, 0.4, -1, 0], [0.22, -0.33, 0.09, 0.065, 2.1, 1, 1]] }
// crop: [dx, dy] of its centre from the player and [w, h], CSS px
const SCENES = {
  E1: { note: 'the empty sea round the player', pillars: [], pools: [], foes: [], crop: [0, 0, 390, 520] },
  E2: { note: 'a South pool (the other pole) with you on its shore: it reaches', pillars: [], pools: [[0.135, 0.01, 0.1, 0.07, 0.3, -1, 0]], foes: [], crop: [50, 0, 260, 220] },
  E3: { note: 'a North pool (your pole) with you on its shore: it recoils', pillars: [], pools: [[0.135, 0.01, 0.1, 0.07, 0.3, 1, 0]], foes: [], crop: [50, 0, 260, 220] },
  E4: { note: 'a South pillar (the other pole) beside you: it pulls', pillars: [[0.1, -0.02, -1]], pools: [], foes: [], crop: [40, -30, 230, 280] },
  E5: { note: 'a North pillar (your pole) beside you: it pushes', pillars: [[0.1, -0.02, 1]], pools: [], foes: [], crop: [40, -30, 230, 280] },
  E6: { note: 'one of each creature round you: mites of both poles, urchin, top, blob, eel, golem', pillars: [], pools: [], foes: CAST, crop: [0, -10, 390, 300] },
  E7: { note: 'the full frame: a crowd of 22 mites and the cast, two pillars and two pools', ...FIELD, foes: [...crowd, ...CAST.slice(2)], crop: [0, 0, 390, 520] },
  E8: { note: 'E7 while walking east: 6 frames, 1/6 s apart', ...FIELD, foes: [...crowd, ...CAST.slice(2)], crop: [0, 0, 390, 520], move: [1, 0], frames: 6, every: 10 },
}
const sceneJson = (s) => ({ pole: 1, pillars: s.pillars, pools: s.pools, foes: s.foes, move: s.move ?? null, warm: 180, every: s.every ?? 10 })

// ---- chrome + CDP -----------------------------------------------------------------------------------
const base = join(process.env.HOME, '.cache/puppeteer/chrome-headless-shell')
const ver = readdirSync(base).sort().reverse().find((d) => existsSync(join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell')))
const chrome = join(base, ver, 'chrome-headless-shell-linux64', 'chrome-headless-shell')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function cdpPage() {
  const prof = `/tmp/core-match-${process.pid}`, portFile = join(prof, 'DevToolsActivePort')
  rmSync(prof, { recursive: true, force: true })
  const browser = spawn(chrome, ['--no-sandbox', '--hide-scrollbars', ...GPU.split(' '), `--window-size=${W},${H}`, '--remote-debugging-port=0', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' })
  let tgt, port
  for (let i = 0; i < 80 && !tgt; i++) {
    try { port = port || readFileSync(portFile, 'utf8').split('\n')[0].trim(); tgt = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page') } catch { /* not up yet */ }
    if (!tgt) await sleep(250)
  }
  const ws = new WebSocket(tgt.webSocketDebuggerUrl)
  await new Promise((r) => { ws.onopen = r })
  let id = 0
  const pend = new Map(), log = []
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error); pend.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') log.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0])
  }
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; pend.set(n, res); ws.send(JSON.stringify({ id: n, method, params })) })
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value
  const close = async () => { ws.close(); browser.kill(); await sleep(300); rmSync(prof, { recursive: true, force: true }) }
  return { send, ev, close, log }
}

// ---- the demo half -------------------------------------------------------------------------------
async function shootDemo(name, s) {
  const sj = sceneJson(s), nF = s.frames ?? 1
  const PRE = `<script>(()=>{let s=7;Math.random=function(){s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
let clk=0,n=0;window.__lim=180;window.__n=()=>n;performance.now=()=>clk;const raf=window.requestAnimationFrame.bind(window);
window.requestAnimationFrame=cb=>raf(()=>{if(n<window.__lim){n++;clk+=1000/60;}cb(clk);});})()</script>
<style>.wrap{padding:0!important;display:block!important;max-width:none!important}.wrap>div:nth-child(2),.weps,.hint{display:none!important}canvas{border:0!important;border-radius:0!important;box-shadow:none!important}</style>`
  // __post runs between the demo's step and its draw: the scene's layout, held every frame (all but the top's pole,
  // which strobes on its own clock here as it does in the game)
  const POST = `<script>(()=>{const SC=${JSON.stringify(sj)};let made=null,t0=0;
const P=window.__PIL,Q=window.__POOLS;
for(const q of P){q.x=-9;q.y=-9}for(const q of Q){q.x=-9;q.y=-9}
SC.pillars.forEach(([dx,dy,pole],i)=>{P[i].x=1.5+dx;P[i].y=2+dy;P[i].pole=pole});
SC.pools.forEach(([dx,dy,rx,ry,rot,pole,seed])=>{const q=Q[seed];q.x=1.5+dx;q.y=2+dy;q.rx=rx;q.ry=ry;q.rot=rot;q.pole=pole});
window.__post=()=>{const G=window.__G();G.started=true;G.pole=SC.pole;G.flipAt=G.t+99;G.spawn=99;for(const k of ['nextUrchin','nextEel','nextTop','nextBlob','nextGolem'])G[k]=G.t+99;
 if(!made){made=SC.foes.map(([kind,dx,dy,pole,ph])=>{const f=window.__spawn(kind,{x:1.5+dx,y:2+dy});f.ph=ph;f.pole=pole;if(kind==='eel')f.sw=pole;f._p=[1.5+dx,2+dy,pole];return f});t0=window.__n()}
 G.foes=made;for(const f of made){f.x=f._p[0];f.y=f._p[1];if(f.kind!=='top')f.pole=f._p[2];if(f.kind==='eel')f.sw=f._p[2];f.hp=f.max;f.latched=null;f.stun=0;f.cd=99}
 const n=window.__n(),mv=SC.move&&n>180?(n-180)/60*0.33:0;G.p.x=1.5+(SC.move?SC.move[0]*mv:0);G.p.y=2+(SC.move?SC.move[1]*mv:0);G.p.vx=SC.move&&n>180?SC.move[0]*0.33:0;G.p.vy=0;G.p.hp=100;G.p.hurt=0;
 G.cam.x=G.p.x-${1 / 1.35}/2;G.cam.y=G.p.y-${4 / 3 / 1.35}/2;G.needles.length=0;G.shots.length=0;G.slugs.length=0;G.beams.length=0;G.pulses.length=0;G.sparks.length=0;};})()</script>`
  let html = readFileSync(join(ROOT, 'docs/superpowers/specs/assets/core-liquid-final.html'), 'utf8')
  const subs = [
    ['\nreset();\nlet last', '\nwindow.__G=()=>G;window.__PIL=PILLARS;window.__POOLS=POOLS;window.__spawn=spawn;reset();\nlet last'],
    ['if (W) { step(dt); draw(); }', 'if (W) { step(dt); if (window.__post) window.__post(); draw(); }'],
    ['  // ---- screen space ----\n', '  // ---- screen space ----\n  if (window.__noHud) return;\n'],
    ['const WEP = { sling: true, gauss: true, lance: true, pulse: true };', 'const WEP = { sling: false, gauss: false, lance: false, pulse: false };'],
  ]
  for (const [a, b] of subs) { if (!html.includes(a)) throw new Error('demo anchor missing: ' + a.slice(0, 40)); html = html.replace(a, b) }
  const page = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + PRE + '<script>window.__noHud=1</script></head><body>' + html + POST + '</body></html>'
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(page) }).listen(0)
  const { send, ev, close, log } = await cdpPage()
  const shots = []
  try {
    await send('Page.enable'); await send('Runtime.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true })
    await send('Page.navigate', { url: `http://127.0.0.1:${srv.address().port}/` })
    const waitN = async (t) => { for (let i = 0; i < 600; i++) { if ((await ev('window.__n&&window.__n()')) >= t) { await sleep(150); return } await sleep(30) } throw new Error('demo clock stuck') }
    for (let f = 0; f < nF; f++) {
      const t = 180 + f * (s.every ?? 10)
      await ev(`window.__lim=${t}`); await waitN(t)
      const ps = await ev('(()=>{const G=window.__G();return [(G.p.x-G.cam.x)*' + K + ',(G.p.y-G.cam.y)*' + K + ']})()')
      if (f === 0) shots.demoT = await ev('window.__G().t')
      const file = join(out, 'demo', `${name}-raw${f}.png`)
      writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      shots.push({ file, ps })
    }
  } finally { await close(); srv.close() }
  if (log.length) console.log('demo page errors:', [...new Set(log)].join(' | '))
  return shots
}

// ---- the game half -------------------------------------------------------------------------------
function shootGame(name, s, demoT) {
  const nF = s.frames ?? 1, b64 = Buffer.from(JSON.stringify({ ...sceneJson(s), demoT })).toString('base64')
  const prefix = join(out, 'game', `${name}-raw`), json = prefix + '.json'
  const url = URL0 + (URL0.includes('?') ? '&' : '?') + 'scene=' + encodeURIComponent(b64)
  execFileSync('node', [join(ROOT, 'scripts/fx-probe.mjs'), '--scene', join(ROOT, 'scripts/scenes/core-match.js'), '--chapter', 'core', '--url', url,
    '--out', prefix, '--frames', String(nF), '--dpr', String(DPR), '--json', json], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, FX_CHROME_ARGS: GPU } })
  const fr = JSON.parse(readFileSync(json, 'utf8')).frames
  return fr.map((ps, f) => ({ file: `${prefix}-${String(f).padStart(2, '0')}.png`, ps }))
}

// ---- crop (and strip) ------------------------------------------------------------------------------
const PY = `
import sys, json
from PIL import Image
a = json.loads(sys.argv[1])
tiles = []
for s in a['shots']:
    im = Image.open(s['file']).convert('RGB')
    cx, cy = (s['ps'][0] + a['crop'][0]) * a['dpr'], (s['ps'][1] + a['crop'][1]) * a['dpr']
    w, h = a['crop'][2] * a['dpr'], a['crop'][3] * a['dpr']
    tiles.append(im.crop((round(cx - w / 2), round(cy - h / 2), round(cx + w / 2), round(cy + h / 2))))
if len(tiles) > 1:
    tiles = [t.resize((t.width // 2, t.height // 2), Image.LANCZOS) for t in tiles]
    st = Image.new('RGB', (sum(t.width for t in tiles) + 6 * (len(tiles) - 1), tiles[0].height), (0, 0, 0))
    x = 0
    for t in tiles:
        st.paste(t, (x, 0)); x += t.width + 6
    st.save(a['out'])
else:
    tiles[0].save(a['out'])
`
const crop = (shots, s, file) => execFileSync('python3', ['-c', PY, JSON.stringify({ shots, crop: s.crop, dpr: DPR, out: file })])

mkdirSync(join(out, 'demo'), { recursive: true }); mkdirSync(join(out, 'game'), { recursive: true })
for (const [name, s] of Object.entries(SCENES)) {
  if (ONLY && !ONLY.split(',').includes(name)) continue
  const d = await shootDemo(name, s)
  crop(d, s, join(out, 'demo', name + '.png'))
  const g = shootGame(name, s, d.demoT)
  crop(g, s, join(out, 'game', name + '.png'))
  for (const x of [...d, ...g]) rmSync(x.file, { force: true })
  rmSync(join(out, 'game', `${name}-raw.json`), { force: true })
  console.log(`${name} done`)
}
// every scene's note, also after --only
writeFileSync(join(out, 'NOTES.txt'), Object.entries(SCENES).map(([k, s]) => `${k}: ${s.note}`).join('\n') + '\n')
console.log('wrote', out)
