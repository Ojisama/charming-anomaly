// THE OPHAN'S RENDERER: the approved mock-up's fight, on the game's own tech, hosted by render.js the toon/liquid way.
// Each world the boss wears is a SLOT: its chapter's stage (stages/<look>.js: the floor and the full-screen pass) with
// the crowd's marks under the pass and the boss painter (painters/<look>.js, on px2d) over it (art.js slot/boss and
// art-fight.js's frame, ported). render.js keeps the camera, the player, the kit, the numbers and the hurt flash on top;
// this module draws the arena under them, every frame, from run.script.oph and run.enemies. It never writes run.
// Slots are built once per renderer and reused across runs; render.js makes one renderer for the page.
import { AlphaFilter, Container, Graphics, Rectangle, RenderTexture, Sprite, Texture } from 'pixi.js'
import { OPHAN, STY, TAU, INK, mk, shade, mix } from './page.js'
import { installPatches, uninstallPatches, PX2D } from './px2d.js'
import macro from './stages/macro.js'
import holo from './stages/holo.js'
import ascii from './stages/ascii.js'
import pixel from './stages/pixel.js'
import toon from './stages/toon.js'
import liquid from './stages/liquid.js'
import './painters/macro.js'
import './painters/holo.js'
import './painters/ascii.js'
import './painters/pixel.js'
import './painters/toon.js'
import './painters/core.js'
import { CHAPTERS, OPHAN_BOSS, OPHAN_ARENA, OPHAN_ATTACKS, ophanView } from '../config.js'

const STAGES = { macro, holo, ascii, pixel, toon, liquid }
const IMMUNE_T = 0.4, VEIL_A = 0.55
// a slot is built this much bigger than the screen on every side, so the camera's shake never shows its edge
const OVERSCAN = 24

// Painters and hands talk through a few window globals (the phase, the toon boss's inking u, the hand's path): each slot
// keeps its own copy, swapped in while it draws (art.js within)
const SWAP = ['OPH_PH', 'OPHAN_TOON_U', 'SPIKE', 'HAND_PATH', 'HAND_SEED', 'OPHAN_PREV_STYLE']
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
  const worlds = CHAPTERS.ophan.worlds
  const slots = {}
  const rings = []                       // ophanImmune sparks: { x, y, life } in world px
  // bottom up (art-fight.js frame): the worlds (A, then B inside the wipe's circle), the hole the Core shows through, the
  // wipe's rim, the boss pasted in over a foreign world, then the immune sparks and the veil outside the arena
  const scene = new Container(), hole = new Graphics(), ring = new Graphics(), over = new Container()
  const fx = new Graphics(), veil = new Graphics()
  const overCam = new Container(); overCam.addChild(over)   // the camera moves overCam: px2d owns its root's scale
  root.addChild(scene, hole, ring, overCam, fx, veil)
  root.visible = false
  const opx = PX2D(over, RES)
  // the wipe's circle is an alpha mask, not a stencil: a stencil nested under the hole's inverse stencil drops most of world B
  const disc = mk(256, 256), dg = disc.getContext('2d'); dg.fillStyle = '#fff'; dg.beginPath(); dg.arc(128, 128, 127, 0, TAU); dg.fill()
  const wipeMask = new Sprite(Texture.from(disc)); wipeMask.anchor.set(0.5)
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
  // a body of another world: the mock-up's dashed ghost ring (r 10 in a 28 box), inked on the light-floored looks
  function ghost(c, st, x, y, r) {
    const rim = STY[st].id === 'holo' || STY[st].id === 'toon' ? INK : '#fff', k = MARK_R / 10
    c.globalAlpha = 0.28
    put(c, bake('g' + rim, 28 * k, (g, m) => { g.setLineDash([3 * k, 3 * k]); g.strokeStyle = rim; g.lineWidth = 1.5 * k; g.beginPath(); g.arc(m, m, MARK_R, 0, TAU); g.stroke() }), x, y, r * 2.8)
    c.globalAlpha = 1
  }

  // a slot covers the screen (plus its overscan) and is centred; a later screen scales it to cover (the stage keeps its
  // size). The Core's melt canvas is a DOM canvas under Pixi's: it is placed over the same box
  function fit(s) {
    const w = app.screen.width + 2 * OVERSCAN, h = app.screen.height + 2 * OVERSCAN
    s.k = Math.max(w / s.w, h / s.h); s.ox = (app.screen.width - s.w * s.k) / 2; s.oy = (app.screen.height - s.h * s.k) / 2
    s.wrap.scale.set(s.k); s.wrap.position.set(s.ox, s.oy)
    if (s.glc) Object.assign(s.glc.style, { left: s.ox + 'px', top: s.oy + 'px', width: s.w * s.k + 'px', height: s.h * s.k + 'px' })
  }
  // art.js slot: the stage gets an app whose stage, screen and canvas are the slot's, so its floor and its pass
  // (filterArea = the slot) land in the slot; the boss is drawn OVER the pass (art.js top), the crowd under it
  function slot(id) {
    if (slots[id]) return slots[id]
    const w = app.screen.width + 2 * OVERSCAN, h = app.screen.height + 2 * OVERSCAN
    const wrap = new Container(), sroot = new Container()
    wrap.addChild(sroot)
    if (id !== 'liquid') sroot.addChild(new Graphics().rect(0, 0, w, h).fill(0x000000))   // the game clears to black under its floor
    const fake = Object.create(app, { stage: { value: sroot }, screen: { value: new Rectangle(0, 0, w, h) }, canvas: { value: app.canvas }, macroVert: { value: host.macroVert } })
    // a stage builds as if it owned the page (the Mine's black clear, the Core's transparent positioned canvas): the page
    // is put back as it was, and enter() sets what the fight needs
    const bg = app.renderer.background, keep = [bg.alpha, bg.color.toNumber(), app.canvas.style.position]
    const st = STAGES[id](fake, { W: w, H: h })
    bg.alpha = keep[0]; bg.color = keep[1]; app.canvas.style.position = keep[2]
    const top = sroot.filters?.length ? wrap.addChild(new Container()) : null
    const s = { id, st, wrap, root: sroot, fake, w, h, g: {}, B: OPHAN[id].boss, A: OPHAN[id].attack, k: 1, ox: 0, oy: 0, glc: st.glc ?? null, warm: false }
    // the Mine has no pass, and its glyphs are ParticleContainers, which the wipe's mask does not clip: a plain pass over
    // the box draws them into a texture first, and that the mask does clip
    if (id === 'ascii') { sroot.filterArea = fake.screen; sroot.filters = [new AlphaFilter()] }
    s.px = PX2D(top || st.boss, RES)
    // the hand comes down from above the camera: its own layer over the whole world and the boss
    const hl = new Container(); if (top) wrap.addChild(hl); else { hl.position.copyFrom(st.boss.position); (st.boss.parent || sroot).addChild(hl) }
    s.hpx = PX2D(hl, RES); s.hpx.bossRoot = s.px.root
    s.g.SPIKE = { app: fake, px: s.px }
    const ents = new Container(); ents.position.copyFrom(st.boss.position); st.boss.parent.addChildAt(ents, st.boss.parent.getChildIndex(st.boss))
    s.ent = PX2D(ents, RES)
    if (s.glc) s.glc.style.display = 'none'
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
    // a world can be pressed once its slot is built and rendered once (its pass compiled, its floor uploaded)
    ready: (k) => !!slots[worlds[k]?.look]?.warm,
    // art-fight.js's warm-up, one job per animation frame: each world's slot built and rendered once off screen (its pass
    // compiles, its floor uploads), then its boss drawn at the fight's R through the phases and every attack the chapter
    // can roll (the painters bake per size, phase and attack), each drawing rendered once; the Core's boss bakes in
    // slices. Idempotent: a world already queued or warmed is skipped. The promise settles when the queue drains, so the
    // fight never starts under it.
    prewarm() {
      const ch = CHAPTERS.ophan, z = ophanView(app.screen.width, app.screen.height).z
      const atks = [...new Set(Object.values(ch.attacks).flat())]
      for (const id of new Set(ch.worlds.map((w) => w.look))) {
        if (warmed.has(id)) continue
        warmed.add(id)
        const at = (f) => () => { const s = slot(id), R = OPHAN_BOSS.R * z / s.k; wpx.grace = 2; within(s.g, () => f(s, R)) }
        jobs.push(() => slot(id), () => { const s = slot(id); s.st.update(0); shot(s.wrap); s.warm = true })
        if (id === 'liquid') jobs.push(() => {
          const s = slot(id), step = s.st.warmBoss([OPHAN_BOSS.R * z / s.k * RES])
          const go = () => { if (!step(6)) jobs.unshift(go) }
          go()
        })
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
      // the Core's melt canvas sits under Pixi's: Pixi clears transparent (and black: it composites as added light) and is
      // positioned so it paints over it (liquid.js enter)
      bg.color = 0x000000; bg.alpha = 0; app.canvas.style.position = 'relative'
      mine = { alpha: bg.alpha, color: bg.color.toNumber(), pos: app.canvas.style.position }
      slot(worlds[0].look)
      for (const s of Object.values(slots)) fit(s)
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
      const oph = run.script?.oph, wi = oph ? oph.world : 0, wipe = oph?.wipe ?? null
      const A = slot(worlds[wipe ? wipe.from : wi].look), B = wipe ? slot(worlds[wi].look) : null
      const core = slots.liquid
      // the camera: the arena's rest framing (ophanView) is what each slot's stage px are laid out in; the game camera's
      // zoom and shake off it move every slot, its floor, crowd and boss alike (zr, dx, dy), as they move render.js's world
      const v0 = ophanView(app.screen.width, app.screen.height), z0 = v0.z
      const left0 = v0.camX - app.screen.width / (2 * z0), top0 = v0.camY - app.screen.height / (2 * z0)
      const zr = view.zoom / z0, dx = (left0 - view.left) * view.zoom, dy = (top0 - view.top) * view.zoom
      const place = (s, c) => { c.scale.set(s.k * zr); c.position.set(s.ox * zr + dx, s.oy * zr + dy) }
      // world px -> a slot's stage px
      const sx = (s, x) => ((x - left0) * z0 - s.ox) / s.k, sy = (s, y) => ((y - top0) * z0 - s.oy) / s.k
      const t = oph ? oph.t : 0, ph = oph ? oph.ph : 1, a = oph?.atk
      const p = run.player, psx = (p.x - view.left) * view.zoom, psy = (p.y - view.top) * view.zoom

      // the scene: world A, world B inside the wipe's circle round the player, the hole the Core comes in through
      scene.removeChildren(); scene.mask = null
      for (const s of Object.values(slots)) { s.wrap.visible = false; s.wrap.mask = null }
      for (const s of [A, B]) if (s) { s.wrap.visible = true; scene.addChild(s.wrap); place(s, s.wrap) }
      if (B) { wipeMask.position.set(psx, psy); wipeMask.width = wipeMask.height = 2 * wipe.r * view.zoom; scene.addChild(wipeMask); B.wrap.mask = wipeMask }
      hole.clear()
      if (B && B === core) { hole.circle(psx, psy, wipe.r * view.zoom).fill(0xffffff); scene.setMask({ mask: hole, inverse: true }) }
      ring.clear()
      if (wipe) ring.circle(psx, psy, wipe.r * view.zoom).stroke({ width: 3, color: worlds[wi].col })
      if (core?.glc) core.glc.style.display = A === core || B === core ? 'block' : 'none'

      // the crowd, every live body but the boss: its own world's creature in that world, a ghost in the other
      for (const s of [A, B]) if (s) {
        const k = worlds.findIndex((w) => w.look === s.id), st = STY.findIndex((y) => y.id === s.id), z = z0 / s.k
        s.ent.begin()
        for (const e of run.enemies) {
          if (e._dead || e.rosterId === 'ophan') continue
          const r = Math.max(3, Math.round((e.radius ?? 12) * z))
          if ((e.world ?? k) === k) mark(s.ent, st, sx(s, e.x), sy(s, e.y), r, worlds[k].col, t)
          else ghost(s.ent, st, sx(s, e.x), sy(s, e.y), r)
        }
      }
      // the boss in its skin's look, on the sim's own clock, an attack aimed where the sim locked it: inside its own world's
      // pass when the player stands in it, pasted in over a foreign world (or a wipe) otherwise; gone once the last skin breaks
      opx.begin(); for (const s of Object.values(slots)) s.px.begin()
      const alive = run.enemies.some((e) => e.rosterId === 'ophan' && !e._dead)
      if (alive) {
        const S = slot(worlds[oph ? oph.skin : wi].look), inPass = !wipe && S === A, z = z0 / S.k
        place(S, overCam)
        const bx = sx(S, OPHAN_BOSS.x), by = sy(S, OPHAN_BOSS.y) + (oph?.stagger > 0 && !a ? 6 * z : 0), R = OPHAN_BOSS.R * z
        within(S.g, () => {
          window.OPH_PH = ph
          boss(S, bx, by, R, t, ph, a && a.k, Math.min(1, a ? a.u : 0), a ? sx(S, a.ax) : 0, a ? sy(S, a.ay) : 0, inPass ? S.px : opx)
        })
      }
      for (const s of [A, B]) if (s) within(s.g, () => {
        window.OPH_PH = ph
        s.st.update(t, { px: sx(s, p.x), py: sy(s, p.y), cam: { zr, ex: (s.ox * (zr - 1) + dx) / s.k, ey: (s.oy * (zr - 1) + dy) / s.k } })
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
