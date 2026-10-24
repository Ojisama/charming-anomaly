// THE OPHAN'S RENDERER: the approved mock-up's fight, on the game's own tech, hosted by render.js the toon/liquid way.
// Each world the boss wears is a SLOT: its chapter's stage (stages/<look>.js: the floor and the full-screen pass) with
// the crowd's marks under the pass and the boss painter (painters/<look>.js, on px2d) over it (art.js slot/boss and
// art-fight.js's frame, ported). render.js keeps the camera, the player, the kit, the numbers and the hurt flash on top;
// this module draws the arena under them, every frame, from run.script.oph and run.enemies. It never writes run.
// Slots are built once per renderer and reused across runs; render.js makes one renderer for the page.
import { Container, Graphics, Rectangle, RenderTexture } from 'pixi.js'
import { OPHAN, STY, TAU, INK, mk, shade, mix } from './page.js'
import { installPatches, uninstallPatches, PX2D } from './px2d.js'
import macro from './stages/macro.js'
import './painters/macro.js'
import { CHAPTERS, OPHAN_BOSS, OPHAN_ARENA, OPHAN_ATTACKS, ophanView } from '../config.js'

const STAGES = { macro }
const IMMUNE_T = 0.4, VEIL_A = 0.55

// Painters and hands talk through a few window globals (the phase, the toon boss's inking u, the Core's frame state, the
// hand's path): each slot keeps its own copy, swapped in while it draws (art.js within)
const SWAP = ['OPH_PH', 'OPHAN_TOON_U', '__liquid', 'SPIKE', 'HAND_PATH', 'HAND_SEED', 'OPHAN_PREV_STYLE']
const within = (g, f) => {
  const keep = SWAP.map((k) => window[k]); for (const k of SWAP) window[k] = g[k]
  try { f() } finally { SWAP.forEach((k, i) => { g[k] = window[k]; window[k] = keep[i] }) }
}
// the boss as its painter draws it (art.js boss). atk: an attack frame, the player at (ppx, ppy)
function boss(s, x, y, R, t, ph, atk, u, ppx, ppy, c = s.px) {
  const O = OPHAN[s.id]
  // the Magma body is a baked sheet per phase (ophan/pixel.js sheet()): a phase that eases would bake a new ~100 ms
  // sheet every frame, so it steps in quarters
  if (s.id === 'pixel') ph = Math.round(ph * 4) / 4
  c.begin()
  if (atk && s.A) s.A.call(O, c, x, y, R, t, ph, atk, u, ppx, ppy)
  else s.B.call(O, c, x, y, R, t, ph)
}

// ---- the crowd's marks: the mock-up's creatures (art-fight.js marks / src2.html blob), baked once per look and size
// where they lean on what the game cannot do per frame (the macro one's soft shadow) ----
const wob = (t, k) => Math.sin(t*14 + k*1.7)*.8
function blob(c, st, x, y, r, col, t){
  const id = STY[st].id;
  if (id === 'ascii'){ c.fillStyle = col; c.font = `bold ${r*1.6}px JetBrains Mono, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('@', x, y); return; }
  c.beginPath();
  if (id === 'toon'){ for (let k=0;k<=16;k++){ const a = k/16*TAU, rr = r + wob(t,k); k ? c.lineTo(x+Math.cos(a)*rr, y+Math.sin(a)*rr) : c.moveTo(x+Math.cos(a)*rr, y+Math.sin(a)*rr); } }
  else c.arc(x, y, r, 0, TAU);
  if (id === 'macro'){ const g = c.createRadialGradient(x-r*.35, y-r*.4, r*.1, x, y, r); g.addColorStop(0, '#fff'); g.addColorStop(.25, col); g.addColorStop(1, shade(col,-.55)); c.save(); c.shadowColor = 'rgba(10,5,2,.6)'; c.shadowBlur = r*.9; c.shadowOffsetY = r*.35; c.fillStyle = g; c.fill(); c.restore(); }
  else if (id === 'liquid'){ const g = c.createLinearGradient(x, y-r, x, y+r); g.addColorStop(0, '#fbfdff'); g.addColorStop(.46, mix(col,'#ffffff',.3)); g.addColorStop(.52, '#20262e'); g.addColorStop(1, col); c.fillStyle = g; c.fill(); }
  else { c.fillStyle = id === 'pixel' ? shade(col,-.2) : col; c.fill(); if (id !== 'pixel'){ c.lineWidth = 3; c.strokeStyle = INK; c.stroke(); } else { c.lineWidth = 2; c.strokeStyle = '#1a0603'; c.stroke(); } }
  c.fillStyle = id === 'liquid' ? '#11161c' : '#fff';
  for (const s of [-1,1]){ c.beginPath(); c.arc(x + s*r*.32, y, r*.2, 0, TAU); c.fill(); }
  c.fillStyle = id === 'liquid' ? '#fff' : INK;
  for (const s of [-1,1]){ c.beginPath(); c.arc(x + s*r*.32, y - r*.04, r*.1, 0, TAU); c.fill(); }
}

export function createOphanRenderer(host) {
  const { app, root } = host
  const RES = app.renderer.resolution || 1
  const slots = {}
  const rings = []                       // ophanImmune sparks: { x, y, life } in world px
  const fx = new Graphics(), veil = new Graphics()
  root.addChild(fx, veil)                 // slots go under both
  root.visible = false
  const warmC = new Container(), wpx = PX2D(warmC, RES)   // the warm-up's own px2d: it never touches a live slot
  let rt = null, jobs = [], raf = 0, saved = null, mine = null, entered = false
  // the warm-up: worlds queued (or done) are not queued again; one promise settles when the queue drains
  const warmed = new Set()
  let warmP = null, warmDone = null
  const drained = () => { const d = warmDone; warmP = warmDone = null; d?.() }

  // a mark is baked once per look and colour at MARK_R and drawn scaled, so a zoom pulse never bakes a new size; the
  // ascii one draws text, so its key carries the font state and it is baked once more when the fonts land
  const MARK_R = 32
  const bakes = new Map()
  const bake = (key, w, f) => {
    let b = bakes.get(key)
    if (!b) { b = mk(w * RES, w * RES); const g = b.getContext('2d'); g.setTransform(RES, 0, 0, RES, 0, 0); f(g, w / 2); bakes.set(key, b) }
    return b
  }
  const put = (c, b, x, y, w) => c.drawImage(b, x - w / 2, y - w / 2, w, w)
  function mark(c, st, x, y, r, col, t) {
    const id = STY[st].id
    if (id === 'toon') return blob(c, st, x, y, r, col, t)   // its outline wobbles: plain paths
    const key = 'b' + st + col + (id === 'ascii' ? document.fonts.status : '')
    put(c, bake(key, MARK_R * 4, (g, m) => blob(g, st, m, m, MARK_R, col, 0)), x, y, r * 4)
  }

  // a slot fills the screen it was built on; a later screen scales it to cover and centres it (the stage keeps its size)
  function fit(s) {
    const w = app.screen.width, h = app.screen.height
    s.k = Math.max(w / s.w, h / s.h); s.ox = (w - s.w * s.k) / 2; s.oy = (h - s.h * s.k) / 2
    s.wrap.scale.set(s.k); s.wrap.position.set(s.ox, s.oy)
  }
  // art.js slot: the stage gets an app whose stage, screen and canvas are the slot's, so its floor and its pass
  // (filterArea = the slot) land in the slot; the boss is drawn OVER the pass (art.js top), the crowd under it
  function slot(id) {
    if (slots[id]) return slots[id]
    const w = app.screen.width, h = app.screen.height
    const wrap = new Container(), sroot = new Container()
    wrap.addChild(sroot); root.addChildAt(wrap, 0)
    if (id !== 'liquid') sroot.addChild(new Graphics().rect(0, 0, w, h).fill(0x000000))   // the game clears to black under its floor
    const fake = Object.create(app, { stage: { value: sroot }, screen: { value: new Rectangle(0, 0, w, h) }, canvas: { value: app.canvas }, macroVert: { value: host.macroVert } })
    const st = STAGES[id](fake, { W: w, H: h })
    const top = sroot.filters?.length ? wrap.addChild(new Container()) : null
    const s = { id, st, wrap, root: sroot, fake, w, h, g: {}, B: OPHAN[id].boss, A: OPHAN[id].attack, k: 1, ox: 0, oy: 0 }
    s.px = PX2D(top || st.boss, RES)
    const ents = new Container(); ents.position.copyFrom(st.boss.position); st.boss.parent.addChildAt(ents, st.boss.parent.getChildIndex(st.boss))
    s.ent = PX2D(ents, RES)
    wrap.visible = false
    fit(s)
    return (slots[id] = s)
  }
  const shot = (c) => {
    const v0 = c.visible; c.visible = true
    app.renderer.render({ container: c, target: (rt = rt || RenderTexture.create({ width: 64, height: 64 })) })
    c.visible = v0
  }
  const pump = () => {
    raf = 0
    const j = jobs.shift()
    if (j) try { j() } catch (e) { console.error(e) }
    if (jobs.length) raf = requestAnimationFrame(pump)
    else { if (!entered) uninstallPatches(); drained() }
  }

  return {
    hide: ['floor', 'dust', 'enemies', 'shadows', 'crowns', 'affixes', 'obstacles', 'telegraphs'],
    // art-fight.js's warm-up, one job per animation frame: each world's slot built and rendered once off screen (its pass
    // compiles, its floor uploads), then its boss drawn at the fight's R through the phases and every attack the chapter
    // can roll (the painters bake per size, phase and attack), each drawing rendered once. Idempotent: a world already
    // queued or warmed is skipped. The promise settles when the queue drains, so the fight never starts under it.
    prewarm() {
      const ch = CHAPTERS.ophan, z = ophanView(app.screen.width, app.screen.height).z
      const atks = [...new Set(Object.values(ch.attacks).flat())]
      for (const { look: id } of ch.worlds) {
        if (warmed.has(id)) continue
        warmed.add(id)
        const at = (f) => () => { const s = slot(id), R = OPHAN_BOSS.R * z / s.k; wpx.grace = 2; within(s.g, () => f(s, R)) }
        jobs.push(() => slot(id), () => { const s = slot(id); s.st.update(0); shot(s.wrap) })
        for (const ph of id === 'pixel' ? [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3] : [1, 2, 3])
          jobs.push(at((s, R) => { window.OPH_PH = ph; boss(s, s.w / 2, s.h / 3, R, 0, ph, null, 0, 0, 0, wpx) }), () => shot(warmC))
        for (const k of atks) {
          const ph = Math.max(1, OPHAN_ATTACKS[k].minPh)
          jobs.push(at((s, R) => { window.OPH_PH = ph; boss(s, s.w / 2, s.h / 3, R, 0, ph, k, 0.5, s.w / 2, s.h * 0.72, wpx) }), () => shot(warmC))
        }
      }
      if (!jobs.length) return warmP ?? Promise.resolve()
      installPatches()   // the painters draw on px2d here too; the drain takes them off again unless a fight is on
      warmP ??= new Promise((r) => { warmDone = r })
      if (!raf) raf = requestAnimationFrame(pump)
      return warmP
    },
    enter(run) {
      installPatches()
      entered = true
      const bg = app.renderer.background
      saved = { alpha: bg.alpha, color: bg.color.toNumber(), pos: app.canvas.style.position }
      for (const w of CHAPTERS[run.chapter].worlds) fit(slot(w.look))
      mine = { alpha: bg.alpha, color: bg.color.toNumber(), pos: app.canvas.style.position }
      rings.length = 0
      root.visible = true
    },
    // puts back what enter() changed, unless a look entered after it (render.js resets each look in turn) changed it since
    exit() {
      if (saved) {
        if (app.renderer.background.alpha === mine.alpha) app.renderer.background.alpha = saved.alpha
        if (app.renderer.background.color.toNumber() === mine.color) app.renderer.background.color = saved.color
        if (app.canvas.style.position === mine.pos) app.canvas.style.position = saved.pos
      }
      saved = mine = null
      for (const s of Object.values(slots)) { s.wrap.visible = false; if (s.glc) s.glc.style.display = 'none' }
      // a warm-up cut short is queued again next time; its waiters are released, not left hanging
      if (jobs.length) { jobs = []; warmed.clear() }
      if (raf) cancelAnimationFrame(raf); raf = 0
      entered = false
      drained()
      uninstallPatches()
      rings.length = 0
      root.visible = false
    },
    resize() { for (const s of Object.values(slots)) fit(s) },
    filters: () => null,
    event(e) {
      switch (e.type) {
        case 'ophanImmune': rings.push({ x: e.x, y: e.y, life: IMMUNE_T }); return true
      }
      return false
    },
    sync(run, dt, view) {
      const oph = run.script?.oph, worlds = CHAPTERS[run.chapter].worlds, w = worlds[oph ? oph.world : 0]
      const s = slot(w.look), st = STY.findIndex((y) => y.id === s.id), z = view.zoom / s.k
      for (const o of Object.values(slots)) o.wrap.visible = o === s
      // world px -> this slot's stage px
      const sx = (x) => ((x - view.left) * view.zoom - s.ox) / s.k, sy = (y) => ((y - view.top) * view.zoom - s.oy) / s.k
      const t = oph ? oph.t : 0, ph = oph ? oph.ph : 1, a = oph?.atk
      // the crowd, every live body but the boss, in the worn world's look
      s.ent.begin()
      for (const e of run.enemies) {
        if (e._dead || e.rosterId === 'ophan') continue
        mark(s.ent, st, sx(e.x), sy(e.y), Math.max(3, Math.round((e.radius ?? 12) * z)), w.col, t)
      }
      // the boss on the sim's own clock, an attack aimed where the sim locked it; gone once the last skin breaks
      const alive = run.enemies.some((e) => e.rosterId === 'ophan' && !e._dead)
      const bx = sx(OPHAN_BOSS.x), by = sy(OPHAN_BOSS.y) + (oph?.stagger > 0 && !a ? 6 * z : 0), R = OPHAN_BOSS.R * z
      within(s.g, () => {
        window.OPH_PH = ph
        if (alive) boss(s, bx, by, R, t, ph, a && a.k, Math.min(1, a ? a.u : 0), a ? sx(a.ax) : 0, a ? sy(a.ay) : 0)
        else s.px.begin()
        s.st.update(t, { px: sx(run.player.x), py: sy(run.player.y) })
      })
      // the immune sparks: a white ring off the sealed boss
      fx.clear()
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i], k = r.life / IMMUNE_T
        fx.circle((r.x - view.left) * view.zoom, (r.y - view.top) * view.zoom, (6 + 18 * (1 - k)) * view.zoom).stroke({ width: 2.5 * view.zoom, color: 0xffffff, alpha: k })
        if ((r.life -= dt) <= 0) rings.splice(i, 1)
      }
      // the floor beyond the arena reads as outside: a veil over everything off the arena rect
      const x0 = (-OPHAN_ARENA.w / 2 - view.left) * view.zoom, x1 = (OPHAN_ARENA.w / 2 - view.left) * view.zoom
      const y0 = (-OPHAN_ARENA.h / 2 - view.top) * view.zoom, y1 = (OPHAN_ARENA.h / 2 - view.top) * view.zoom
      veil.clear()
      if (y0 > 0) veil.rect(0, 0, view.w, y0)
      if (y1 < view.h) veil.rect(0, y1, view.w, view.h - y1)
      if (x0 > 0) veil.rect(0, Math.max(0, y0), x0, Math.min(view.h, y1) - Math.max(0, y0))
      if (x1 < view.w) veil.rect(x1, Math.max(0, y0), view.w - x1, Math.min(view.h, y1) - Math.max(0, y0))
      veil.fill({ color: 0x000000, alpha: VEIL_A })
    },
  }
}
