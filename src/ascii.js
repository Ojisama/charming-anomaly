// THE MINE, IN PRETTY COLOURED ASCII (CHAPTERS.mine.render.ascii). Render-only, like macro.js and
// holo.js: it reads `run`, never writes it, and nothing in sim.js knows it exists.
//
// EVERY VISUAL OF THE MINE IS DECIDED IN THIS FILE (and in src/ascii/*, if it grows). render.js only
// calls in while CHAPTERS[run.chapter].render.ascii is set and draws nothing of the chapter's own.
// An art direction for the chapter — a whole-screen glyph shader, per-entity glyph sprites lit in
// colour, neon glow glyphs — is a rewrite of THIS FILE ALONE. Keep the surface below (names and
// shapes); everything behind it is free to change.
//
// ==== THE SURFACE render.js USES ===================================================================
//
//   ASCII_CAST                { [rosterId]: entry } — the creatures this module draws. In the mine,
//                             render.js uses these looks for every roster id listed here, so the
//                             shared id 'rat' is drawn by this module in the mine and by render.js's
//                             own rat everywhere else. An entry may carry poseOf(e) -> frame index,
//                             faceDir(e) -> [dx, dy] | null, turnRate(e) -> rad/s (render.js's own
//                             enemy-look hooks, forwarded as they are).
//   bakeCreature(id, elite)   -> { frames: [{ canvas, white, ax, ay, res }], baseR, upright, lean,
//                             poseOf, faceDir, turnRate } — painted ONCE at boot. `white` is the
//                             hit-flash twin (same size and anchor), `res` canvas px per world px,
//                             `baseR` the body radius the art was drawn for (render.js scales by
//                             e.radius / baseR), `upright` = never mirrored or rotated (text must
//                             stay readable), `lean` degrees of tilt toward the player otherwise.
//                             A look with several frames and no poseOf flips through them on
//                             render.js's clock (a scurry). render.js drives these through its
//                             normal enemy pool, so the hit flash, status tints, scale and pounce
//                             poses all keep working. These same canvases are what
//                             scripts/bake-cast.mjs writes to src/cast/<id>.png.
//   paintHazard(src)          -> canvas | null — the summary's damage-recap thumbnail ('firedamp').
//   createAsciiRenderer(host) -> renderer, created once, lazily, the first time a mine run starts.
//     host = { app, world, under, over, screen }
//       app     the Pixi Application (app.screen is the viewport, app.stage the root)
//       world   the camera-transformed world container (read its scale/position, do not move it)
//       under   world-space Container UNDER the creatures (floor, light, gas, pickups)
//       over    world-space Container OVER the creatures (player, shots, carts, blasts)
//       screen  screen-space Container over the whole world (overlays; the DOM HUD sits above it)
//     renderer.hide           string[] — render.js layers switched off while the mine is up. Known
//                             names: floor dust gems coins bullets player particles novas shadows
//                             crowns enemies text telegraphs affixes obstacles. Hide 'enemies' to
//                             draw the creatures yourself from run.enemies in sync().
//     renderer.enter(run, look) a mine run starts (look = CHAPTERS.mine.render.ascii)
//     renderer.exit()         another chapter or the title starts: hide everything drawn here
//     renderer.sync(run, dt, view) every frame; dt = 0 behind a modal (hold the animation).
//                             view = { left, top, right, bottom, zoom, w, h, animT }: the visible
//                             world rectangle, the camera zoom, the viewport in px, and render.js's
//                             animation clock.
//     renderer.event(e, run)  every sim event before render.js handles it; true = swallowed
//     renderer.filters()      Pixi Filters for the WHOLE STAGE (a post pass), or null. Read at
//                             enter(); update their uniforms in sync().
//
// What the sim publishes for this chapter (state.js's doc block is the authority): run.gas (idle
// firedamp pockets {x,y,r,age,seed}), run.gasLit (pockets set off, waiting for their link
// {x,y,r,at,chain,seed}), run.booms (the last blasts, gas and dynamite, drawn at their age), run.sticks (dynamite), run.carts (minecarts), run.lanternR, run.bullets
// (the pickaxe's rock chips are weapon 'chip'), and the events gasBlast / pickaxe / dynamite / kill.
//
// THIS IS THE SCAFFOLD'S PLACEHOLDER ART: honest coloured glyphs, baked once, pooled per frame.
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js'

// ---- glyphs ------------------------------------------------------------------------------------
const FONT = '"DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", "Courier New", monospace'
const G = 48   // px a glyph is baked at; sprites scale it to the size asked for
const glyphCache = new Map()
const mkCanvas = (w, h) => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h))
  return c
}
const canvasTex = (c, res = 1) => new Texture({ source: new CanvasSource({ resource: c, resolution: res }) })
// A white glyph (tinted per sprite), with an optional dark outline so it reads over any floor.
function glyphTex(ch, outline = false) {
  const key = ch + (outline ? '|o' : '')
  let t = glyphCache.get(key)
  if (t) return t
  const c = mkCanvas(G * 1.25, G * 1.25)
  const x = c.getContext('2d')
  x.font = `bold ${G}px ${FONT}`
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  if (outline) {
    x.lineJoin = 'round'
    x.lineWidth = G * 0.16
    x.strokeStyle = 'rgba(0,0,0,0.85)'
    x.strokeText(ch, c.width / 2, c.height / 2)
  }
  x.fillStyle = '#fff'
  x.fillText(ch, c.width / 2, c.height / 2)
  t = canvasTex(c)
  glyphCache.set(key, t)
  return t
}
// A soft round pool of light (additive, tinted per sprite). A gradient, not a filter.
let lightTex = null
function getLightTex() {
  if (lightTex) return lightTex
  const c = mkCanvas(128, 128)
  const x = c.getContext('2d')
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 128, 128)
  lightTex = canvasTex(c)
  return lightTex
}

// Immediate-mode sprite batch: begin(), put() as many glyphs as this frame needs, end() hides the
// rest. Sprites are pooled for the life of the page; nothing is created per frame once warm.
function makeBatch(parent) {
  const sprites = []
  let n = 0
  const slot = () => {
    let s = sprites[n]
    if (!s) { s = new Sprite(); s.anchor.set(0.5); parent.addChild(s); sprites.push(s) }
    n++
    return s
  }
  return {
    begin() { n = 0 },
    put(ch, x, y, color, alpha = 1, size = 16, rot = 0, add = false, outline = false) {
      const s = slot()
      const t = glyphTex(ch, outline)
      if (s.texture !== t) s.texture = t
      s.visible = true
      s.position.set(x, y)
      s.tint = color
      s.alpha = alpha
      s.scale.set(size / G)
      s.rotation = rot
      const bm = add ? 'add' : 'normal'
      if (s.blendMode !== bm) s.blendMode = bm
      return s
    },
    light(x, y, r, color, alpha) {
      const s = slot()
      const t = getLightTex()
      if (s.texture !== t) s.texture = t
      s.visible = true
      s.position.set(x, y)
      s.tint = color
      s.alpha = alpha
      s.scale.set((r * 2) / 128)
      s.rotation = 0
      if (s.blendMode !== 'add') s.blendMode = 'add'
      return s
    },
    end() { for (let i = n; i < sprites.length; i++) sprites[i].visible = false },
  }
}

// ---- colour helpers ----------------------------------------------------------------------------
const lerp = (a, b, k) => a + (b - a) * k
function mixHex(a, b, k) {
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, k))
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, k))
  const bl = Math.round(lerp(a & 255, b & 255, k))
  return (r << 16) | (g << 8) | bl
}
const hash2 = (i, j, s = 0) => {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const PAL = {
  stone: 0x6b5a48, rubble: 0x8a7f74, vein: 0x5ad7ff, gold: 0xffd34a,
  gas: [0x7dff6a, 0x4fe08a, 0xb8ff7a, 0x2fd6a0], fire: [0xfff4b0, 0xffd04a, 0xff8a2a, 0xff3a1a],
  torch: 0xffb766, player: 0xfff0b8, chip: 0xd9c2a0,
}

// ---- the creatures -----------------------------------------------------------------------------
// Each look is a little arrangement of glyphs: [char, dx, dy, colour, size] in world px around the
// body's centre, drawn for a body of radius `baseR`. A few frames each (poses or a scurry).
const RAT = (tail) => [
  [tail, -15, 6, 0xe7a3a3, 16], ['r', 1, 0, 0xc9a77f, 30], ['"', 13, -9, 0xf2e2c8, 12],
]
const SPIDER = (legs) => [
  [legs[0], -13, -12, 0xa078ff, 18], [legs[1], 13, -12, 0xa078ff, 18],
  ['-', -16, 0, 0x8a5cf0, 18], ['-', 16, 0, 0x8a5cf0, 18],
  [legs[1], -13, 12, 0xa078ff, 18], [legs[0], 13, 12, 0xa078ff, 18],
  ['s', 0, -1, 0xe0c8ff, 26], ['.', -4, -9, 0xff4a6a, 10], ['.', 4, -9, 0xff4a6a, 10],
]
const KOBOLD = (lamp) => [
  ['*', 0, -24, lamp, 18], ['k', 0, 0, 0xff8a3a, 36], ['/', 18, -4, 0xb8c4cf, 26], ['=', 0, 18, 0x9a6a3a, 16],
]
const GOLEM = (eye) => [
  ['#', -20, -18, 0x7d8a9e, 26], ['=', 0, -20, 0x9aa7b8, 26], ['#', 20, -18, 0x7d8a9e, 26],
  ['[', -20, 2, 0x9aa7b8, 30], ['G', 0, 1, eye, 34], [']', 20, 2, 0x9aa7b8, 30],
  ['#', -20, 22, 0x7d8a9e, 26], ['#', 20, 22, 0x7d8a9e, 26],
]
export const ASCII_CAST = {
  rat: { baseR: 16, frames: [RAT('~'), RAT('-')] },
  // its pounce poses (the 'pounce' flag publishes e._pounceState): hold, aim (legs drawn in), leap
  caveSpider: {
    baseR: 12, frames: [SPIDER(['\\', '/']), SPIDER(['|', '|']), SPIDER(['<', '>'])],
    poseOf: (e) => ({ hold: 0, aim: 1, leap: 2, land: 0 })[e._pounceState] ?? 0,
  },
  kobold: { baseR: 26, frames: [KOBOLD(0xffe066), KOBOLD(0xffb03a)] },
  golem: { baseR: 26, frames: [GOLEM(0x9cf6ff), GOLEM(0xe8fdff)] },
}
const RES = 3
function paintCells(cells, white, crown) {
  const all = crown ? [...cells, ['^', 0, -34, 0xffd34a, 20]] : cells
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [, dx, dy, , sz] of all) {
    x0 = Math.min(x0, dx - sz * 0.6); x1 = Math.max(x1, dx + sz * 0.6)
    y0 = Math.min(y0, dy - sz * 0.7); y1 = Math.max(y1, dy + sz * 0.7)
  }
  const pad = 4
  const w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2
  const c = mkCanvas(w * RES, h * RES)
  const x = c.getContext('2d')
  x.scale(RES, RES)
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.lineJoin = 'round'
  for (const [ch, dx, dy, col, sz] of all) {
    x.font = `bold ${sz}px ${FONT}`
    x.lineWidth = sz * 0.18
    x.strokeStyle = white ? '#fff' : 'rgba(8,5,3,0.9)'
    x.strokeText(ch, dx - x0 + pad, dy - y0 + pad)
    x.fillStyle = white ? '#fff' : '#' + col.toString(16).padStart(6, '0')
    x.fillText(ch, dx - x0 + pad, dy - y0 + pad)
  }
  return { canvas: c, ax: (-x0 + pad) / w, ay: (-y0 + pad) / h }
}
export function bakeCreature(id, elite) {
  const M = ASCII_CAST[id]
  if (!M) return null
  const crown = elite && id !== 'golem'
  const frames = M.frames.map((cells) => {
    const a = paintCells(cells, false, crown), b = paintCells(cells, true, crown)
    return { canvas: a.canvas, white: b.canvas, ax: a.ax, ay: a.ay, res: RES }
  })
  return { frames, baseR: M.baseR, upright: true, lean: 0, poseOf: M.poseOf ?? null, faceDir: M.faceDir ?? null, turnRate: M.turnRate ?? null }
}
export function paintHazard(src) {
  if (src !== 'firedamp') return null
  return paintCells([
    ['~', -14, -10, PAL.gas[0], 22], ['≈', 10, -12, PAL.gas[1], 22], ['~', -6, 10, PAL.gas[2], 22],
    ['*', 8, 6, PAL.fire[1], 30], ['+', 16, 14, PAL.fire[2], 18],
  ], false, false).canvas
}

// ---- the renderer ------------------------------------------------------------------------------
export function createAsciiRenderer(host) {
  const floorC = new Container(), lightC = new Container(), gasC = new Container(), dropC = new Container()
  const objC = new Container(), meC = new Container(), fxC = new Container()
  host.under.addChild(floorC, lightC, gasC, dropC)
  host.over.addChild(objC, meC, fxC)
  const floor = makeBatch(floorC), light = makeBatch(lightC), gas = makeBatch(gasC), drops = makeBatch(dropC)
  const obj = makeBatch(objC), me = makeBatch(meC), fxB = makeBatch(fxC)
  const all = [floor, light, gas, drops, obj, me, fxB]
  let look = { cell: 18, floorAlpha: 0.55 }
  let clock = 0
  // transient glyph particles: { ch, x, y, vx, vy, t, life, c0, c1, size, add, rot, vr, a0, outline }
  const fx = []
  const MAX_FX = 900
  const spawn = (p) => { if (fx.length < MAX_FX) fx.push({ t: 0, vx: 0, vy: 0, rot: 0, vr: 0, add: false, a0: 1, outline: false, ...p }) }
  function burst(x, y, r, palette, n, chars, life = 0.45, size = 18) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4
      const sp = (r / life) * (0.6 + Math.random() * 0.5)
      spawn({ ch: chars[i % chars.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life * (0.8 + Math.random() * 0.4),
        c0: palette[0], c1: palette[palette.length - 1], size: size * (0.8 + Math.random() * 0.5), add: true, rot: a, vr: (Math.random() - 0.5) * 6 })
    }
  }
  const flashes = []   // light pools that fade: { x, y, r, color, t, life }
  const clearAll = () => { fx.length = 0; flashes.length = 0; for (const b of all) { b.begin(); b.end() } }

  return {
    hide: ['floor', 'dust', 'gems', 'coins', 'bullets', 'novas', 'player', 'particles', 'shadows', 'crowns'],
    enter(run, lk) { look = { ...look, ...(lk || {}) }; clearAll() },
    exit() { clearAll() },
    filters() { return null },
    event(e) {
      switch (e.type) {
        // The blasts themselves are drawn from run.booms in sync() (state, so a frame that missed the
        // event still shows a chain at its age); the event only throws the loose smoke and grit.
        case 'gasBlast':
        case 'dynamite':
          for (let i = 0; i < 5; i++) spawn({ ch: '.', x: e.x + (Math.random() - 0.5) * e.r, y: e.y + (Math.random() - 0.5) * e.r, vy: -20, life: 0.9, c0: 0x8a8070, c1: 0x3a3430, size: 14 })
          return true
        case 'pickaxe':
          spawn({ ch: '/', x: e.x, y: e.y, life: 0.18, c0: 0xffffff, c1: 0xb8c4cf, size: 34, rot: e.angle ?? 0, outline: true })
          burst(e.x, e.y, e.r * 0.8, [0xe8d2b0, 0x7a6a58], 6, ['.', ',', "'"], 0.3, 14)
          return true
        case 'kill':
          spawn({ ch: '%', x: e.x, y: e.y, life: 0.7, c0: e.elite ? 0xffd34a : 0xd06a5a, c1: 0x3a2420, size: e.elite ? 30 : 20, outline: true })
          return false
        default:
          return false
      }
    },
    sync(run, dt, view) {
      if (dt > 0) clock += dt
      const C = look.cell || 18
      const p = run.player
      // ---- this frame's lights: your torch, the lantern, the gas, the blasts ----
      const lights = [{ x: p.x, y: p.y, r: 360, i: 1, c: PAL.torch }]
      if ((run.lanternR ?? 0) > 0) lights.push({ x: p.x, y: p.y, r: run.lanternR * 1.5, i: 0.9, c: 0xffa040 })
      for (const g of run.gas ?? []) lights.push({ x: g.x, y: g.y, r: g.r * 1.6, i: 0.55, c: 0x6cff7a })
      for (const L of run.gasLit ?? []) lights.push({ x: L.x, y: L.y, r: L.r * 1.8, i: 0.9, c: 0xfff06a })
      for (const f of flashes) lights.push({ x: f.x, y: f.y, r: f.r, i: 1.4 * (1 - f.t / f.life), c: f.color })
      const BOOM_T = 0.5
      for (const b of run.booms ?? []) {
        const k = (run.time - b.at) / BOOM_T
        if (k >= 0 && k < 1) lights.push({ x: b.x, y: b.y, r: b.r * 1.8, i: 1.5 * (1 - k), c: b.kind === 'dynamite' ? 0xff6a2a : 0xff9a3a })
      }
      // ---- the floor: a world-aligned grid of dim glyphs, coloured by the lights above ----
      floor.begin()
      const i0 = Math.floor(view.left / C) - 1, i1 = Math.ceil(view.right / C) + 1
      const j0 = Math.floor(view.top / C) - 1, j1 = Math.ceil(view.bottom / C) + 1
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const h = hash2(i, j)
          const x = i * C + C / 2, y = j * C + C / 2
          // a slow noise for rubble patches and ore veins, so the floor has places and not only grain
          const n = hash2(i >> 3, j >> 3, 7)
          let ch = '.', base = PAL.stone, size = C * 0.9
          if (n > 0.86 && h < 0.5) { ch = h < 0.25 ? '#' : '%'; base = PAL.rubble; size = C }
          else if (n < 0.05 && h < 0.3) { ch = h < 0.1 ? '*' : '+'; base = h < 0.15 ? PAL.vein : PAL.gold; size = C * 0.8 }
          else if (h < 0.1) ch = ','
          else if (h < 0.16) ch = "'"
          else if (h < 0.19) ch = ':'
          else if (h > 0.985) { ch = '"'; base = 0x6f8a5a }
          let lr = 0, lg = 0, lb = 0, li = 0
          for (const L of lights) {
            const dx = x - L.x, dy = y - L.y, d2 = dx * dx + dy * dy
            if (d2 > L.r * L.r) continue
            const k = 1 - Math.sqrt(d2) / L.r
            const w = k * k * L.i
            li += w
            lr += ((L.c >> 16) & 255) * w; lg += ((L.c >> 8) & 255) * w; lb += (L.c & 255) * w
          }
          const lit = Math.min(1, 0.16 + li)
          let col = base
          if (li > 0) {
            const lc = ((Math.min(255, lr / li) | 0) << 16) | ((Math.min(255, lg / li) | 0) << 8) | (Math.min(255, lb / li) | 0)
            col = mixHex(base, lc, Math.min(0.75, li * 0.8))
          }
          floor.put(ch, x, y, mixHex(col, 0xffffff, Math.max(0, lit - 0.8)), (look.floorAlpha ?? 0.55) * (0.3 + lit * 0.9), size)
        }
      }
      floor.end()
      // ---- soft light pools over the floor ----
      light.begin()
      light.light(p.x, p.y, 260, PAL.torch, 0.10)
      if ((run.lanternR ?? 0) > 0) light.light(p.x, p.y, run.lanternR * 1.25, 0xff9a30, 0.22 + 0.04 * Math.sin(clock * 9))
      for (const f of flashes) light.light(f.x, f.y, f.r, f.color, 0.55 * (1 - f.t / f.life))
      for (const b of run.booms ?? []) {
        const k = (run.time - b.at) / BOOM_T
        if (k >= 0 && k < 1) light.light(b.x, b.y, b.r * 1.7, b.kind === 'dynamite' ? 0xff6a2a : 0xff9a3a, 0.6 * (1 - k))
      }
      light.end()
      // ---- firedamp: idle pockets are drifting green ~ glyph clouds; set-off ones flare yellow ----
      gas.begin()
      for (const g of run.gas ?? []) {
        if (g.x < view.left - g.r || g.x > view.right + g.r || g.y < view.top - g.r || g.y > view.bottom + g.r) continue
        gas.light(g.x, g.y, g.r * 1.25, 0x3cff6a, 0.16)
        const n = 6 + Math.round(g.r / 9)
        for (let k = 0; k < n; k++) {
          const a = hash2(g.seed, k, 3) * Math.PI * 2 + clock * 0.25 * (k % 2 ? 1 : -1)
          const d = Math.sqrt(hash2(g.seed, k, 5)) * g.r * 0.85
          const pulse = 0.55 + 0.35 * Math.sin(clock * 2.2 + k * 1.7 + g.seed)
          gas.put(k % 3 === 0 ? '≈' : '~', g.x + Math.cos(a) * d, g.y + Math.sin(a) * d + Math.sin(clock * 1.6 + k) * 3,
            PAL.gas[k % PAL.gas.length], pulse, 15 + (k % 3) * 3)
        }
      }
      for (const L of run.gasLit ?? []) {
        gas.light(L.x, L.y, L.r * 1.5, 0xffe04a, 0.4)
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + clock * 6
          gas.put(k % 2 ? '*' : '+', L.x + Math.cos(a) * L.r * 0.6, L.y + Math.sin(a) * L.r * 0.6, k % 2 ? 0xfff06a : 0xffa030, 0.95, 18, 0, true)
        }
      }
      gas.end()
      // ---- pickups: gems are coloured *, coins are $ ----
      drops.begin()
      let nd = 0
      for (const g of run.gems ?? []) {
        if (g.x < view.left || g.x > view.right || g.y < view.top || g.y > view.bottom) continue
        if (++nd > 500) break
        drops.put('*', g.x, g.y, g.xp >= 5 ? 0xff7ae8 : g.xp >= 2 ? 0x8aff7a : 0x6ae4ff, 0.95, 15, 0, false, true)
      }
      nd = 0
      for (const c of run.coins ?? []) {
        if (c.x < view.left || c.x > view.right || c.y < view.top || c.y > view.bottom) continue
        if (++nd > 300) break
        drops.put('$', c.x, c.y, PAL.gold, 1, 17, 0, false, true)
      }
      drops.end()
      // ---- the Mine's weapons, and every other shot ----
      obj.begin()
      for (const st of run.sticks ?? []) {
        const k = Math.min(1, st.t / st.flight)
        const x = lerp(st.fromX, st.x, k), y = lerp(st.fromY, st.y, k) - Math.sin(k * Math.PI) * 60
        obj.put('!', x, y, 0xff5a4a, 1, 26, k < 1 ? k * 9 : 0, false, true)
        if (Math.floor(clock * 20) % 2 === 0) obj.put('*', x + 4, y - 14, 0xffe060, 1, 14, 0, true)
        if (k >= 1 && dt > 0 && Math.random() < 0.5) {
          spawn({ ch: Math.random() < 0.5 ? '`' : "'", x: x + 4, y: y - 14, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 40, life: 0.3, c0: 0xffe060, c1: 0xff5020, size: 12, add: true })
        }
      }
      for (const c of run.carts ?? []) {
        const ux = Math.cos(c.angle), uy = Math.sin(c.angle), vx = -uy, vy = ux
        obj.put('#', c.x, c.y, 0xc89a5a, 1, 26, c.angle, false, true)
        obj.put('*', c.x + ux * 2, c.y + uy * 2, PAL.gold, 1, 14, 0, true)
        for (const s of [-1, 1]) {
          for (const f of [-1, 1]) obj.put('o', c.x + vx * s * c.w * 0.75 + ux * 10 * f, c.y + vy * s * c.w * 0.75 + uy * 10 * f, 0x9aa0a8, 1, 16, 0, false, true)
        }
        if (dt > 0 && Math.random() < 0.6) spawn({ ch: '=', x: c.x - ux * 16, y: c.y - uy * 16, life: 0.5, c0: 0x9a7a52, c1: 0x3a2a1a, size: 16, rot: c.angle })
      }
      for (const b of run.bullets ?? []) {
        if (b.x < view.left || b.x > view.right || b.y < view.top || b.y > view.bottom) continue
        const a = Math.atan2(b.vy, b.vx)
        if (b.weapon === 'chip') obj.put(Math.floor(b.x / 9) % 2 ? "'" : ',', b.x, b.y, PAL.chip, 1, 16, a, false, true)
        else obj.put('*', b.x, b.y, 0xffe28a, 1, 16, a, false, true)
      }
      for (const n of run.novas ?? []) {
        if (!(n.life > 0) || !(n.r > 2)) continue
        const m = Math.max(8, Math.round(n.r / 12))
        const k0 = 1 - n.life / (n.lifeMax || 0.45)
        const lantern = n.look === 'lantern'
        for (let k = 0; k < m; k++) {
          const a = (k / m) * Math.PI * 2 + (lantern ? clock : 0)
          obj.put(lantern ? (k % 2 ? '*' : '^') : 'o', n.x + Math.cos(a) * n.r, n.y + Math.sin(a) * n.r,
            lantern ? mixHex(0xffe080, 0xff6a20, k0) : 0xffd08a, (lantern ? 0.7 : 0.8) * (1 - k0 * 0.6), 14, 0, true)
        }
      }
      if ((run.lanternR ?? 0) > 0) {
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 + clock * 0.7
          obj.put(k % 2 ? '*' : '`', p.x + Math.cos(a) * run.lanternR, p.y + Math.sin(a) * run.lanternR, k % 2 ? 0xffb040 : 0xffe080, 0.55, 14, 0, true)
        }
      }
      obj.end()
      // ---- you: the roguelike's @, under your own lamp ----
      me.begin()
      const blink = (p.invuln ?? 0) > 0 && Math.floor(clock * 16) % 2 === 0
      me.light(p.x, p.y, 70, 0xffd890, 0.35)
      me.put('@', p.x, p.y, PAL.player, blink ? 0.35 : 1, 38, 0, false, true)
      me.end()
      // ---- transient glyphs ----
      if (dt > 0) {
        for (const f of flashes) f.t += dt
        for (let i = flashes.length - 1; i >= 0; i--) if (flashes[i].t >= flashes[i].life) flashes.splice(i, 1)
        const damp = Math.pow(0.15, dt)
        for (const q of fx) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= damp; q.vy *= damp; q.rot += q.vr * dt }
        for (let i = fx.length - 1; i >= 0; i--) if (fx[i].t >= fx[i].life) fx.splice(i, 1)
      }
      fxB.begin()
      for (const b of run.booms ?? []) {
        const k = (run.time - b.at) / BOOM_T
        if (!(k >= 0 && k < 1)) continue
        const dyn = b.kind === 'dynamite'
        const pal = dyn ? [0xfff0c0, 0xff7a2a, 0xc0201a] : PAL.fire
        const chars = dyn ? ['#', '*', '%', '&'] : ['*', '#', '+', '%', 'x']
        const n = dyn ? 22 : 18
        const out = 1 - (1 - k) * (1 - k)
        for (let i = 0; i < n; i++) {
          const h = hash2(Math.round(b.at * 1000) + i, b.chain, 11)
          const a = (i / n) * Math.PI * 2 + h * 0.5
          const d = b.r * out * (0.55 + 0.5 * hash2(i, Math.round(b.x), 13))
          const c = k < 0.5 ? mixHex(pal[0], pal[1], k * 2) : mixHex(pal[1], pal[pal.length - 1], k * 2 - 1)
          fxB.put(chars[i % chars.length], b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, c, 1 - k * k, (dyn ? 24 : 21) * (1.15 - k * 0.4), a + k * 3, true)
        }
        if (k < 0.35) fxB.put('*', b.x, b.y, 0xfff8d0, 1 - k / 0.35, b.r * 0.9, k * 4, true)
        // the link's number at its heart: a chain reads as 1, 2, 3... running down the seam
        if (!dyn) fxB.put(b.chain > 9 ? '+' : String(b.chain || '*'), b.x, b.y, mixHex(0xffffff, 0xffd04a, k), 1 - k * k, 30, 0, false, true)
      }
      for (const q of fx) {
        const k = q.t / q.life
        fxB.put(q.ch, q.x, q.y, mixHex(q.c0, q.c1, k), q.a0 * (1 - k * k), q.size, q.rot, q.add, q.outline)
      }
      fxB.end()
    },
  }
}
