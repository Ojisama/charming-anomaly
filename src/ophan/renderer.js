// THE OPHAN'S RENDERER: the approved mock-up's fight, on the game's own tech, hosted by render.js the toon/liquid way.
// Each world the boss wears is a SLOT: its chapter's stage (stages/<look>.js: the floor and the full-screen pass) with
// the crowd under the pass (that world's own creatures, the others' ghosts) and the boss painter (painters/<look>.js, on
// px2d) over it (art.js slot/boss and art-fight.js's frame, ported). render.js keeps the camera, the player, the kit, the
// numbers and the hurt flash on top; this module draws the arena under them, every frame, from run.script.oph and
// run.enemies. It never writes run.
// Slots are built once per renderer and reused across runs; render.js makes one renderer for the page.
import { AlphaFilter, Container, Graphics, Rectangle, RenderTexture, Sprite, Texture } from 'pixi.js'
import { OPHAN, OPHAN_HANDS, OPHAN_RIG as RIG, STY, TAU, INK, mk } from './page.js'
import { installPatches, uninstallPatches, PX2D } from './px2d.js'
import macro from './stages/macro.js'
import holo from './stages/holo.js'
import ascii from './stages/ascii.js'
import pixel from './stages/pixel.js'
import toon from './stages/toon.js'
import liquid from './stages/liquid.js'
import pencil from './stages/pencil.js'
import './painters/macro.js'
import './painters/holo.js'
import './painters/ascii.js'
import './painters/pixel.js'
import './painters/toon.js'
import './painters/core.js'
import './painters/pencil.js'
import './hands/kit.js'
import './hands/macro.js'
import './hands/holo.js'
import './hands/ascii.js'
import './hands/pixel.js'
import './hands/toon.js'
import './hands/liquid.js'
import { CHAPTERS, OPHAN_BOSS, OPHAN_ATTACKS, OPHAN_HAND, OPHAN_BOSS_HOLD, OPHAN_BG_BAKE_MS, ophanView } from '../config.js'
import { STAGE_DUR, lookOf, STAGING } from './staging.js'
import './staging/looks.js'

const STAGES = { macro, holo, ascii, pixel, toon, liquid, pencil }
const IMMUNE_T = 0.4
// the boss leaving for a wave sinks into its world's floor, and rises out of it on its return: it shrinks to SINK_K of its
// size and fades, over SINK_T (leave) or RISE_T (enter) seconds, inside its world's pass like the creatures
const SINK_T = 0.8, RISE_T = 0.8, SINK_K = 0.55
// the chunked floors (the Magma's, the Mantle's) bake LEAD seconds of the camera's travel ahead, one chunk a frame between
// them, the worlds not shown included: a world pressed far from where it was last drawn finds its floor baked
const LEAD = 1
// a slot is built this much bigger than the screen on every side, so the camera's shake never shows its edge
const OVERSCAN = 24
const WARM_UPDATES = 8
// the warm-up runs its jobs back to back for this much of a frame, then lets one paint (the brief's loading bar), before the
// fight; in a wave it gets OPHAN_BG_BAKE_MS of a frame on average
const WARM_BUDGET_MS = 40
// a held entry's frames are still the game's (the floor shakes, the crowd moves): its back-to-back jobs stop at this
const HELD_MS = 12
// a sliced bake (a hand's) runs this long per job
const SLICE_MS = 4
// the painters whose attack warm-up draw costs more than a wave frame affords (17-27 ms at desktop 4x): baked before the level
const DEAR_ATK = new Set(['macro', 'ascii', 'toon', 'pixel'])
// what a warm-up frame may bake. fight: a run started and not left for a brief. Not in a fight (the brief): jobs back to
// back; the boss out (oph: the script the last sync saw): nothing; an entry held for the art: back to back for HELD_MS;
// a wave: on credit
const pumpMode = (fight, oph) => !fight ? 'brief' : oph && (oph.bossId != null || oph.sketch) ? 'boss' : oph?.held ? 'held' : 'wave'

// Painters and hands talk through a few window globals (the phase, the toon boss's inking u, the hand's path): each slot
// keeps its own copy, swapped in while it draws (art.js within)
const SWAP = ['OPH_PH', 'SPIKE', 'HAND_PATH', 'HAND_SEED', 'OPHAN_PREV_STYLE']
const within = (g, f) => {
  const keep = SWAP.map((k) => window[k]); for (const k of SWAP) window[k] = g[k]
  try { f() } finally { SWAP.forEach((k, i) => { g[k] = window[k]; window[k] = keep[i] }) }
}
// the boss as its painter draws it (art.js boss). atk: an attack frame, the player at (ppx, ppy)
// clip: a staging look's cut (the eraser's), a path it lays on c to clip the whole boss by; opt: the painter's own (the
// sketch's reveal)
function boss(s, x, y, R, t, ph, atk, u, ppx, ppy, c = s.px, clip = null, opt = undefined) {
  const O = OPHAN[s.id]
  // the Magma body is a baked sheet per phase (ophan/pixel.js sheet()): a phase that eases would bake a new ~100 ms
  // sheet every frame, so it steps in quarters
  if (s.id === 'pixel') ph = Math.round(ph * 4) / 4
  c.begin()
  if (clip) { c.save(); c.beginPath(); clip(c); c.clip() }
  if (atk && s.A) s.A.call(O, c, x, y, R, t, ph, atk, u, ppx, ppy)
  else s.B.call(O, c, x, y, R, t, ph, opt)
  if (clip) c.restore()
}
// look's hand at u of the change, over the boss at (x, y, R) (art.js hand); returns where its tool is, for the macro focus
function hand(c, look, x, y, R, t, u) {
  const H = RIG.hand(u)
  c.begin()
  OPHAN_HANDS[look]?.hand(c, x, y, R, t, H)
  return { x: x + H.tip.x * R, y: y + H.tip.y * R, k: Math.max(0, Math.min(1, (1 - H.z) / 0.6)) }
}
// where the hand is in its playground path (u of RIG.HAND_DUR), or null when it is off: it plays its arrival over the tell's
// last inT and lands at the paint as the skin swaps, then paints and lifts over the after-beat
export function handU(oph) {
  const W = RIG.HAND_WIN
  if (oph.tell > 0 && oph.next >= 0) return oph.tell > OPHAN_HAND.inT ? null : W.in[0] + (1 - oph.tell / OPHAN_HAND.inT) * (W.paint[0] - W.in[0])
  if (oph.after >= 0) return W.paint[0] + Math.min(1, oph.after / OPHAN_HAND.after) * (W.out[1] - W.paint[0])
  return null
}
// the hand's path seed: the swap it belongs to, the same over the tell (swaps not yet counted) as after the swap, so its
// arrival point never jumps on the swap frame
export const handSeed = (oph) => oph.swaps + (oph.tell > 0 ? 1 : 0)
// the next hand's shadow over the tell (src2.html handShadow): its shape in the mock-up's px round a boss drawn at R SH_R,
// baked at its largest scale (1.7) times SH_K, with SH_PAD px for the blur; the box's corner sits at (-SH_X, -SH_Y). Its
// black is baked at the mock-up's peak alpha SH_A, so the coloured glow shows through it as there, and the sprite fades it.
// Canvas shadowBlur ignores the transform: the bake's 20 px is scaled with the sprite, ~11 px on screen at pr 0 down to
// ~7 px at pr 1 where the mock-up's grows 8 -> 20 (the A/B passes by eye; a wider glow is a bigger blur and SH_PAD)
const SH_R = 52 * 1.35, SH_K = 2, SH_S = 1.7 * SH_K, SH_PAD = 40, SH_X = 31, SH_Y = 77, SH_A = 0.6

export function createOphanRenderer(host) {
  const { app, root } = host
  const RES = app.renderer.resolution || 1
  const worlds = CHAPTERS.ophan.worlds
  const slots = {}
  const rings = []                       // ophanImmune sparks: { x, y, life } in world px
  // bottom up (art-fight.js frame): the worlds (A, then B inside the wipe's circle), the hole the Core shows through, the
  // wipe's rim, the boss pasted in over a foreign world, then the immune sparks
  const scene = new Container(), hole = new Graphics(), ring = new Graphics(), over = new Container()
  const fx = new Graphics()
  // the camera moves overCam and handCam alike (px2d owns its roots' scale), in the boss's slot's stage px: the boss when
  // pasted in; then, over everything, the next hand's shadow and the hand, coming down from above the camera
  const overCam = new Container(), handCam = new Container(), handShade = new Sprite(), handC = new Container()
  overCam.addChild(over); handCam.addChild(handShade, handC)
  root.addChild(scene, hole, ring, overCam, fx, handCam)
  // the sink and the rise fade the boss whole (a group alpha: its painter's overlapping layers do not show through each other)
  const fade = new AlphaFilter()
  let sink = null, rise = null, lastS = null, lastPh = 1
  // THE STAGING (staging.js): the beats playing, each { kind, look, age, dur, e (its event), from (the slot the boss was last
  // drawn in when it started), ph }; lastS0/lastXY: that slot and the boss's world point, kept through a wave and past death
  const beats = []
  let nsp = 0   // sprites of the layer used this frame
  let lastS0 = null, lastXY = { x: 0, y: 0 }
  const crowdXY = []   // the crowd's x, y, radius, world px, flat, as of the last frame
  function beat(kind, e, from = null) {
    const look = lookOf(kind, from?.id ?? (lastS0?.id ?? worlds[0].look))
    if (!look) return
    for (let i = beats.length - 1; i >= 0; i--) if (beats[i].kind === kind) beats.splice(i, 1)   // one of a kind at a time
    beats.push({ kind, look, age: 0, dur: look.dur ?? STAGE_DUR[kind], e, from, world: lastA, ph: lastPh, x: e.x ?? lastXY.x, y: e.y ?? lastXY.y })
  }
  // a skin's boss as a texture, for a look that cuts it up (a break's shards): drawn once into a px2d of its own and
  // rendered to a texture R*3 wide, centred on the boss; one per slot, phase and size, kept for the fight
  const snapC = new Container(), snapPx = PX2D(snapC.addChild(new Container()), RES), snaps = new Map()   // a child: px2d scales its root by 1/RES, which generateTexture would not see
  function snap(s, ph, R) {
    const key = s.id + ':' + ph + ':' + Math.round(R)
    let tx = snaps.get(key)
    if (!tx) {
      const W = Math.ceil(R * 3)
      within(s.g, () => { window.OPH_PH = ph; boss(s, W / 2, W / 2, R, 0, ph, null, 0, 0, 0, snapPx) })
      tx = app.renderer.generateTexture({ target: snapC, frame: new Rectangle(0, 0, W, W), resolution: RES })
      snaps.set(key, tx)
    }
    return tx
  }
  // the look's view of a beat this frame (staging.js): its clock, the boss as the fight would draw it, and what it may draw with
  function stageK(q, f) {
    return {
      kind: q.kind, u: Math.min(1, q.age / q.dur), age: q.age, dur: q.dur, e: q.e, from: q.from, ph0: q.ph,
      S: f.S, A: f.A, B: f.B, alive: !!f.b, x: f.bx, y: f.by, R: f.R, z: f.z, t: f.t, ph: f.ph, boss: f.ov,
      // where a world point sits in the boss's slot (stage px), e.g. the event's own x, y
      at: (wx, wy) => ({ x: f.sx(f.S, wx), y: f.sy(f.S, wy) }),
      px: (i) => spx[i],
      // the floor of the world shown, under its pass and the boss (the crowd's px2d, after the crowd): a tear, a scar
      floor: f.A.ent,
      // spare px2d i faded whole (a group alpha, as the sink's) and scaled sc about (x, y): set before drawing into it
      fadePx(i, a, sc = 1, x = 0, y = 0) {
        const r = spx[i].root
        sfade[i].alpha = a; r.filters = a < 1 ? [sfade[i]] : null
        r.scale.set(sc / RES); r.position.set(spxK[i].x + x * (1 - sc), spxK[i].y + y * (1 - sc))
      },
      layer,
      // the n-th sprite of this frame in the layer over the boss (pooled; hidden again next frame)
      sprite(tex) { const c = layer.children[nsp] ?? layer.addChild(new Sprite()); nsp++; c.visible = true; c.texture = tex; c.anchor.set(0.5); c.alpha = 1; c.rotation = 0; c.scale.set(1); c.tint = 0xffffff; return c },
      // a skin's boss drawn into px2d c (one boss per px2d a frame). opt.atk, opt.u: posed as that attack at u (its own
      // painter's attack frame), the player taken at (opt.px, opt.py)
      drawBoss(s, c, x, y, R, ph, clip = null, opt = undefined) { within(s.g, () => { window.OPH_PH = ph; boss(s, x, y, R, f.t, ph, opt?.atk ?? null, opt?.u ?? 0, opt?.px ?? x, opt?.py ?? y + 2.4 * R, c, clip, opt) }) },
      snap: (s, ph = f.ph) => snap(s, Math.round(ph), f.R),
      slots, worlds,
      look: (k) => slots[worlds[k].look],
      col: (s) => s?.id === 'pencil' ? '#3a3a3a' : worlds.find((w) => w.look === s?.id)?.col ?? '#ffffff',
    }
  }
  let tellPx = null   // the px2d the sink or the rise scaled and faded this frame, and its root's own position, put back next frame
  // puts it back: every frame, and on enter and exit (a fight left mid-tell under a dt-0 modal leaves it scaled)
  const untell = () => { if (tellPx) { const r = tellPx.px.root; r.filters = null; r.scale.set(1 / RES); r.position.set(tellPx.x, tellPx.y); tellPx = null } }
  let cam0 = null   // the camera's centre last frame, world px, and its eased velocity, world px/s
  const vel = { x: 0, y: 0 }
  root.visible = false
  const opx = PX2D(over, RES), hpx = PX2D(handC, RES)
  // the staging's layers over the boss, in its slot's stage px like it: a sprite layer, then spare px2ds (one boss each)
  const layer = overCam.addChild(new Container())
  const spx = [0, 1, 2].map(() => PX2D(overCam.addChild(new Container()), RES))
  const spxK = spx.map((p) => ({ x: p.root.x, y: p.root.y })), sfade = spx.map(() => new AlphaFilter())
  const shades = []   // the hand shadow's texture per world, baked in the warm-up
  // the wipe's circle is an alpha mask, not a stencil: a stencil nested under the hole's inverse stencil drops most of world B
  const disc = mk(256, 256), dg = disc.getContext('2d'); dg.fillStyle = '#fff'; dg.beginPath(); dg.arc(128, 128, 127, 0, TAU); dg.fill()
  const wipeMask = new Sprite(Texture.from(disc)); wipeMask.anchor.set(0.5)
  // the warm-up's own px2ds (a boss, a hand over it): they never touch a live slot
  const warmC = new Container(), wpx = PX2D(warmC.addChild(new Container()), RES), whpx = PX2D(warmC.addChild(new Container()), RES)
  let rt = null, jobs = [], raf = 0, saved = null, mine = null, entered = false, sceneKey = '', lastA = null
  let afterLook = null   // the after-beat's hand, latched for its whole window
  // the warm-up: worlds queued (or done) are not queued again; one promise settles when the level can start (no job of
  // need 0 left). oph: the fight's script as the last sync saw it, which tells the pump a wave from a fight frame
  const warmed = new Set()
  // briefing: from a prewarm (the brief) to the next enter (the run's start); a fight still entered behind the brief (the
  // summary's Play again, a resumed run the player left) is not a fight to the pump
  let warmP = null, warmDone = null, oph = null, credit = 0, briefing = false
  const drained = () => { const d = warmDone; warmP = warmDone = null; onStep = null; d?.() }

  // a ghost ring is baked once per rim colour at GHOST_R and drawn scaled, so a zoom pulse never bakes a new size
  const GHOST_R = 32
  const bakes = new Map()
  const bake = (key, w, f) => {
    let b = bakes.get(key)
    if (!b) { b = mk(w * RES, w * RES); const g = b.getContext('2d'); g.setTransform(RES, 0, 0, RES, 0, 0); f(g, w / 2); bakes.set(key, b) }
    return b
  }
  const put = (c, b, x, y, w) => c.drawImage(b, x - w / 2, y - w / 2, w, w)
  // a body of its own world: render.js's sprite for it (host.body, posed, turned, tinted and flashed by its syncEnemies,
  // in the chapter look ROSTER_LOOKS bakes for that id) and its ground shadow, copied into the slot under its pass; the
  // layer render.js draws them in stays hidden. o is in world px, the copy in the slot's stage px (z = z0 / s.k)
  function body(s, o, x, y, z) {
    const c = s.bodies.children[s.nb] ?? s.bodies.addChild(new Sprite())
    s.nb++
    c.visible = true; c.texture = o.texture; c.anchor.copyFrom(o.anchor); c.rotation = o.rotation
    c.position.set(x, y); c.scale.set(o.scale.x * z, o.scale.y * z)
    c.alpha = o.alpha; c.tint = o.tint; c.blendMode = o.blendMode
  }
  // a body of another world: the mock-up's dashed ghost ring (r 10 in a 28 box), inked on the light-floored looks
  function ghost(c, st, x, y, r) {
    const rim = STY[st].id === 'holo' || STY[st].id === 'toon' ? INK : '#fff', k = GHOST_R / 10
    c.globalAlpha = 0.28
    put(c, bake('g' + rim, 28 * k, (g, m) => { g.setLineDash([3 * k, 3 * k]); g.strokeStyle = rim; g.lineWidth = 1.5 * k; g.beginPath(); g.arc(m, m, GHOST_R, 0, TAU); g.stroke() }), x, y, r * 2.8)
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
    s.g.SPIKE = { app: fake, px: s.px }
    const ents = new Container(); ents.position.copyFrom(st.boss.position); st.boss.parent.addChildAt(ents, st.boss.parent.getChildIndex(st.boss))
    s.ent = PX2D(ents, RES)
    s.bodies = st.boss.parent.addChildAt(new Container(), st.boss.parent.getChildIndex(ents))
    s.bodies.position.copyFrom(st.boss.position)
    s.nb = 0; s.core = []; s.nc = 0   // the Core's feed: { e, x, y, r } reused, s.nc of them live
    if (s.glc) s.glc.style.display = 'none'
    wrap.visible = false
    fit(s)
    return (slots[id] = s)
  }
  // the warm-up draws into a screen-sized target, so its render targets and the GPU's pipelines are the fight's own
  const shot = (c) => {
    const v0 = c.visible; c.visible = true
    app.renderer.render({ container: c, target: (rt ??= RenderTexture.create({ width: app.screen.width, height: app.screen.height, resolution: RES })) })
    c.visible = v0
  }
  // a world drawn the ways the fight draws it, so its first wipe in finds the GPU ready: plain (world A), inside the wipe's
  // circle as it grows (world B), and the Core through the hole's inverse mask with its melt canvas shown (under the opaque
  // page canvas and behind it, z -1, for these frames only)
  const tmp = new Container(), holeW = new Graphics()
  function gpuWarm(s, pass) {
    const w = app.screen.width, h = app.screen.height, wp = s.wrap.parent, wi = wp ? wp.getChildIndex(s.wrap) : 0, m0 = s.wrap.mask, mp = wipeMask.parent
    tmp.addChild(s.wrap); const v0 = s.wrap.visible; s.wrap.visible = true
    if (pass === 0) { s.wrap.mask = null; shot(tmp) }
    else {
      tmp.addChild(wipeMask); s.wrap.mask = wipeMask; wipeMask.position.set(w / 2, h / 2)
      wipeMask.width = wipeMask.height = [0.3, 1, 2.4][pass - 1] * Math.max(w, h)
      if (s.id === 'liquid') { tmp.addChild(holeW.clear().circle(w / 2, h / 2, 0.15 * w).fill(0xffffff)); tmp.setMask({ mask: holeW, inverse: true }) }
      shot(tmp)
      tmp.mask = null; s.wrap.mask = null
    }
    tmp.removeChildren(); s.wrap.visible = v0
    s.wrap.mask = m0
    if (wp) wp.addChildAt(s.wrap, wi)
    if (mp) mp.addChild(wipeMask)
  }
  const glcWarm = (s, on) => { if (s.glc) Object.assign(s.glc.style, on ? { display: 'block', zIndex: '-1' } : { display: 'none', zIndex: '' }) }
  // a job marked alone runs as a frame's only job: the melt canvas is shown for a frame of its own, and hidden after one
  const alone = (f) => Object.assign(f, { alone: true })
  // the loader bar's share: need-0 jobs run of those queued (a sliced bake re-queues itself, so it is a floor, clamped)
  let onStep = null, need0 = 0
  const progress = () => { if (onStep && need0) onStep(Math.min(1, 1 - jobs.filter((j) => j.need === 0).length / need0)) }
  const run1 = () => {
    const j = jobs.shift(), tj = performance.now()
    try { j() } catch (e) { console.error(e) }
    const ms = performance.now() - tj
    window.__warmLog?.push([j.tag ?? '?', +ms.toFixed(1), j.need, entered && !briefing, Math.round(tj)])
    return ms
  }
  // a wave bakes on credit, OPHAN_BG_BAKE_MS a frame; a job dearer than that runs, and the frames after it bake nothing until
  // it is paid off, but never more than one frame's worth (a wave job dearer than that is mis-classed: see prewarm)
  const pump = () => {
    raf = 0
    const t0 = performance.now(), mode = pumpMode(entered && !briefing, oph)
    if (mode === 'boss') credit = 0
    else if (mode === 'wave') for (credit = Math.min(OPHAN_BG_BAKE_MS, Math.max(-OPHAN_BG_BAKE_MS, credit) + OPHAN_BG_BAKE_MS); jobs.length && credit > 0;) credit -= run1()
    else for (let n = 0, b = mode === 'held' ? HELD_MS : WARM_BUDGET_MS; jobs.length && (n === 0 || (!jobs[0].alone && performance.now() - t0 < b)); n++) { const a = jobs[0].alone; run1(); if (a) break }
    progress()
    if (!jobs.length || jobs[0].need > 0) drained()
    if (jobs.length) raf = requestAnimationFrame(pump)
    else { if (!entered) uninstallPatches(); rt?.destroy(true); rt = null }
  }
  // a bake a hand or a stage can slice (a generator): one job a slice of SLICE_MS, of the same need, until it returns
  const sliced = (need, it) => { const go = () => { const t0 = performance.now(); while (performance.now() - t0 < SLICE_MS) if (it.next().done) return; jobs.unshift(go) }; go.need = need; return go }
  // a warm-up cut short (the brief backed out of, the fight left): only the worlds with jobs still queued are queued
  // again next time, a finished one is kept. Its waiters are released, not left hanging, and its target is made again
  // at the screen's size then. A fight on keeps its warm-up
  function stopWarm() {
    if (entered) return
    for (const j of jobs) warmed.delete(j.tag?.split(':')[0])
    jobs = []
    rt?.destroy(true); rt = null
    if (raf) cancelAnimationFrame(raf); raf = 0
    briefing = false
    drained()
    uninstallPatches()
  }

  return {
    hide: ['floor', 'dust', 'enemies', 'shadows', 'crowns', 'affixes', 'obstacles', 'telegraphs'],
    // a world can be pressed once its slot is built and rendered once (its pass compiled, its floor uploaded)
    ready: (k) => !!slots[worlds[k]?.look]?.warm,
    // the last boss phase (0..3) whose art is all baked: the sim holds the boss's entry into a later one (input.ophanReady)
    readyPhase: () => Math.max(0, Math.min(3, jobs.length ? jobs[0].need - 1 : 3)),
    // art-fight.js's warm-up, as jobs, each with a NEED: the boss phase that first shows it (0: the level's start). The queue
    // is kept in need order, so it drains in the order the fight first shows things. A wave frame runs a job whole, so only
    // a job that stays under a frame (measured at desktop 4x CPU: ~16 ms) waits for the waves; every dearer one is need 0:
    //   0  every world's floor: its slot built and rendered once off screen (its pass compiles, its floor uploads), drawn
    //      the ways the fight draws it (gpuWarm), and every draw that bakes as it goes: the boss in every world and phase
    //      (the first draw is 50-110 ms; one job per frame of the Magma's sheet, 17 ms each), the attacks the dear painters
    //      bake (DEAR_ATK), the pencil body, and every world's hand (each has a bake step or first draw of 18-115 ms);
    //   1  the liquid boss's sliced bake (6 ms a slice), the other attacks phase 1 rolls, the hands' shadows;
    //   2, 3  the cheap attacks that phase first rolls; 3 also the pencil sketch's paper and attacks.
    // Before the fight the jobs run back to back for up to ms of each animation frame (at least one a frame), then in the
    // waves on credit (pump). Idempotent: a world already queued or warmed is skipped. The promise settles when no job of
    // need 0 is left, so the level never starts under one.
    prewarm(step = null) {
      onStep = step; briefing = true
      const ch = CHAPTERS.ophan, z = ophanView(app.screen.width, app.screen.height).z, add = []
      const first = (k) => +Object.keys(ch.attacks).find((p) => ch.attacks[p].includes(k))
      // need n, jobs fs, tagged for the load probe (window.__warmLog)
      const q = (need, tag, ...fs) => { for (const f of fs) { f.need = need; f.tag = tag; add.push(f) } }
      for (const id of new Set([...ch.worlds.map((w) => w.look), 'pencil'])) {
        if (warmed.has(id)) continue
        warmed.add(id)
        const at = (f) => () => { const s = slot(id), R = OPHAN_BOSS.R * z / s.k; wpx.grace = whpx.grace = 2; within(s.g, () => f(s, R)) }
        const sk = id === 'pencil', fl = sk ? 3 : 0
        q(fl, id + ':slot', () => slot(id), () => { const s = slot(id); s.st.update(0); shot(s.wrap); s.warm = true })
        // a chunked floor (the Mantle's, the Magma's) bakes the chunks in view at once and its margin two a frame: WARM_UPDATES
        // more frames bake the whole margin here, not on the world's first frames in the fight
        q(fl, id + ':glc', alone(() => glcWarm(slot(id), true)))
        for (let k = 0; k < WARM_UPDATES; k++) q(fl, id + ':floor', () => slot(id).st.update(0))
        for (let k = 0; k < 4; k++) q(fl, id + ':gpu', () => gpuWarm(slot(id), k))
        q(fl, id + ':glc', alone(() => glcWarm(slot(id), false)))
        if (id === 'liquid') { const lb = () => {
          const s = slot(id), step = s.st.warmBoss([OPHAN_BOSS.R * z / s.k * RES])
          const go = () => { if (!step(6)) jobs.unshift(go) }
          go.need = lb.need; go.tag = 'liquid:boss'
          go()
        }; q(1, id + ':boss', lb) }
        // the boss through its phases (the painters bake per size and phase). The Magma's body is a sheet of frames, each
        // baked on its first showing: one frame a job (t picks it: the idle loop shows frame floor(10 t))
        const FN = OPHAN[id].frames
        for (const ph of sk ? [4] : [1, 2, 3]) {
          if (FN) for (let j = 0; j < FN; j++) q(0, id + ':frame', at((s, R) => { wpx.grace = 0; window.OPH_PH = ph; boss(s, s.w / 2, s.h / 3, R, (j + 0.5) / 10, ph, null, 0, 0, 0, wpx); shot(warmC) }))
          else q(0, id + ':boss', at((s, R) => { window.OPH_PH = ph; boss(s, s.w / 2, s.h / 3, R, 0, ph, null, 0, 0, 0, wpx) }), () => shot(warmC))
        }
        for (const k of sk ? ch.sketchAttacks : [...new Set(Object.values(ch.attacks).flat())]) {
          const ph = sk ? 4 : Math.max(1, OPHAN_ATTACKS[k].minPh), need = DEAR_ATK.has(id) ? 0 : sk ? 3 : first(k)
          // the Magma cuts an attack's frames as the fight first shows them, at the fight's own aim: one frame warms its draw
          if (FN) q(need, id + ':atk', at((s, R) => { wpx.grace = 0; window.OPH_PH = ph; boss(s, s.w / 2, s.h / 3, R, 0, ph, k, 0, s.w / 2, s.h / 3 + OPHAN_BOSS_HOLD * R / OPHAN_BOSS.R, wpx); shot(warmC) }))
          else q(need, id + ':atk', at((s, R) => { window.OPH_PH = ph; boss(s, s.w / 2, s.h / 3, R, 0, ph, k, 0.5, s.w / 2, s.h * 0.72, wpx) }), () => shot(warmC))
        }
        if (sk) continue
        // its hand (a hand's first draw bakes it), its bake sliced first where the hand offers one, then drawn through
        // arrival, paint and lift, the liquid hand's cut masked by the warm boss it is drawn over
        const H = OPHAN_HANDS[id]
        const hb = () => { const s = slot(id); jobs.unshift(sliced(hb.need, H.bake(OPHAN_BOSS.R * z / s.k))); jobs[0].tag = id + ':hand' }
        if (H?.bake) q(0, id + ':hand', hb)
        for (const u of [0.1, 0.5, 0.9])
          q(0, id + ':hand', at((s, R) => { window.OPH_PH = 1; boss(s, s.w / 2, s.h / 3, R, 0, 1, null, 0, 0, 0, wpx); window.SPIKE.px = wpx; hand(whpx, id, s.w / 2, s.h / 3, R, 0, u) }), () => shot(warmC))
        // the hand's shadow, one texture per world colour (a sprite placed per frame, never a per-frame blur)
        const k = ch.worlds.findIndex((w) => w.look === id), col = ch.worlds[k].col
        q(1, id + ':shade', () => {
          if (shades[k]) return   // a world queued again after a cut-short warm-up keeps the one it baked
          const c = mk((SH_X + 53) * SH_S + 2 * SH_PAD, (SH_Y + 30) * SH_S + 2 * SH_PAD), g = c.getContext('2d')
          g.translate(SH_PAD + SH_X * SH_S, SH_PAD + SH_Y * SH_S); g.scale(SH_S, SH_S)
          g.shadowColor = col; g.shadowBlur = 20; g.fillStyle = g.strokeStyle = 'rgba(0,0,0,' + SH_A + ')'; g.lineCap = 'round'
          g.beginPath(); g.ellipse(0, 0, 25, 29, 0, 0, TAU); g.fill()
          for (const [x0, y0, x1, y1] of [[-17, -24, -21, -60], [-6, -28, -6, -70], [6, -28, 8, -68], [17, -24, 21, -56], [24, 4, 46, -14]]) { g.lineWidth = 13; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke() }
          shades[k] = Texture.from(c)
          shot(new Sprite(shades[k]))   // uploaded now, not under the hand's first arrival
        })
      }
      jobs = [...jobs, ...add].sort((a, b) => a.need - b.need)   // stable: each need keeps the order it was queued in
      need0 = jobs.filter((j) => j.need === 0).length; progress()
      if (!jobs.length) return Promise.resolve()
      installPatches()   // the painters draw on px2d here too; the drain takes them off again unless a fight is on
      if (!raf) raf = requestAnimationFrame(pump)
      return jobs[0].need > 0 ? Promise.resolve() : (warmP ??= new Promise((r) => { warmDone = r }))
    },
    enter(run) {
      installPatches()
      entered = true; briefing = false
      const bg = app.renderer.background
      // a fight entered again without an exit (the summary's Play again) keeps the page it first found, not the arena's
      saved ??= { alpha: bg.alpha, color: bg.color.toNumber(), pos: app.canvas.style.position }
      sceneKey = ''
      // the Core's melt canvas sits under Pixi's: Pixi clears transparent (and black: it composites as added light) and is
      // positioned so it paints over it (liquid.js enter)
      bg.color = 0x000000; bg.alpha = 0; app.canvas.style.position = 'relative'
      mine = { alpha: bg.alpha, color: bg.color.toNumber(), pos: app.canvas.style.position }
      slot(worlds[0].look)
      for (const s of Object.values(slots)) fit(s)
      untell(); rings.length = 0; beats.length = 0; sink = rise = lastS = lastS0 = cam0 = null; vel.x = vel.y = 0
      root.visible = true
    },
    // puts back what enter() changed, unless a look entered after it (render.js resets each look in turn) changed it since
    exit() {
      if (saved) {
        if (app.renderer.background.alpha === mine.alpha) app.renderer.background.alpha = saved.alpha
        if (app.renderer.background.color.toNumber() === mine.color) app.renderer.background.color = saved.color
        if (app.canvas.style.position === mine.pos) app.canvas.style.position = saved.pos
      }
      saved = mine = null; sceneKey = ''
      for (const s of Object.values(slots)) { s.wrap.visible = false; glcWarm(s, false) }
      untell(); beats.length = 0; sink = rise = lastS = lastS0 = null
      oph = null; credit = 0
      entered = false
      stopWarm()
      rings.length = 0
      root.visible = false
    },
    stopWarm,
    beats,   // the staging playground (scripts/ophan-stage/) scrubs a beat by setting its age
    resize() { for (const s of Object.values(slots)) fit(s) },
    event(e) {
      switch (e.type) {
        case 'ophanImmune': rings.push({ x: e.x, y: e.y, life: IMMUNE_T }); return true
        // the boss sinks where it stood, in the skin it was last drawn in; its return rises where the sim put it
        // at the phase it was last drawn in: the sim's eases toward the next one as it goes, and an eased phase is a new bake
        case 'ophanLeave': sink = lastS && { x: e.x, y: e.y, s: lastS, ph: lastPh, life: SINK_T }; rise = null; beat('leave', e, lastS0); return true
        case 'ophanEnter': rise = { life: RISE_T }; sink = null; beat(e.stage === 'p1' ? 'arrive' : 'return', e); return true
        // the staging's other beats: the slot the boss was last drawn in is the skin that broke, or the one that dies
        case 'ophanBreak': beat('break', e, lastS0); return true
        case 'ophanResonance': beat('resonance', e); return true
        // the crowd it sweeps off is gone from the run by now: where it stood last frame, for the look to scribble out
        case 'ophanSketch': beat('sketch', { ...e, gone: e.gone ?? crowdXY.slice() }, lastS0); return true
        case 'bossDead': beat('death', e, lastS0); return true   // not the Blank's white-out, which render.js would draw
      }
      return false
    },
    sync(run, dt, view) {
      // a fight frame that moves ends the brief: a parked run resumed behind the pause sheet warms up back to back there
      // (prewarm after enter), on wave credit once it plays
      if (dt > 0) briefing = false
      oph = run.script?.oph ?? null
      const wi = oph ? oph.world : 0, wipe = oph?.wipe ?? null
      // never a slot built mid-fight (a hitch): a world not yet warm is not drawn, the last A held, B left out of the wipe
      // until it is (main.js awaits the prewarm, so play never meets one; the gauge's dim on a cold world is Task 9's)
      const built = (k) => (slots[worlds[k].look]?.warm ? slots[worlds[k].look] : null)
      // the sketch: the paper replaces every world, and the boss on it is the pencil drawing (no wipe runs in it)
      const sk = oph?.sketch && slots.pencil?.warm ? slots.pencil : null
      let A = (lastA = sk ?? built(wipe ? wipe.from : wi) ?? lastA ?? slot(worlds[0].look)), B = wipe ? built(wi) : null
      // a staging beat may take the world wipe over (the paper draining in from the boss, the worlds blooming back on its
      // death): its own A and B, its circle round a world point; null leaves the fight's
      let sw = null
      for (const q of beats) {
        const o = q.look.scene?.({ u: Math.min(1, q.age / q.dur), age: q.age, dur: q.dur, x: q.x, y: q.y, world: q.world, slots, worlds, look: (k) => slots[worlds[k].look], view })
        if (o && o.A?.warm && (!o.B || o.B.warm)) { A = o.A; B = o.B ?? null; sw = o }
      }
      crowdXY.length = 0
      for (const e of run.enemies) if (!e._dead && e.rosterId !== 'ophan') crowdXY.push(e.x, e.y, e.radius ?? 12)
      const core = slots.liquid
      // the camera: each slot's stage px are laid out in a rest framing at ophanView's zoom centred where the follow camera
      // looks, so a slot always covers the screen; its stage scrolls its floor by pan, the stage px the camera has moved
      // off the world's origin. The game camera's zoom off that framing scales every slot about the screen's centre, its
      // floor, crowd and boss alike (zr, dx, dy), as it scales render.js's world
      const z0 = ophanView(app.screen.width, app.screen.height).z
      const cwx = view.left + view.w / (2 * view.zoom), cwy = view.top + view.h / (2 * view.zoom)
      const left0 = cwx - app.screen.width / (2 * z0), top0 = cwy - app.screen.height / (2 * z0)
      const zr = view.zoom / z0, dx = (left0 - view.left) * view.zoom, dy = (top0 - view.top) * view.zoom
      const place = (s, c) => { c.scale.set(s.k * zr); c.position.set(s.ox * zr + dx, s.oy * zr + dy) }
      const pan = (s) => ({ x: cwx * z0 / s.k, y: cwy * z0 / s.k })
      // world px -> a slot's stage px
      const sx = (s, x) => ((x - left0) * z0 - s.ox) / s.k, sy = (s, y) => ((y - top0) * z0 - s.oy) / s.k
      const t = oph ? oph.t : 0, ph = oph ? oph.ph : 1
      const p = run.player, psx = (p.x - view.left) * view.zoom, psy = (p.y - view.top) * view.zoom

      // the scene: world A, world B inside the wipe's circle round the player, the hole the Core comes in through
      // (re-parented and re-masked only when A, B or the hole change, not every frame)
      const key = A.id + '|' + (B ? B.id : '')
      if (key !== sceneKey) {
        sceneKey = key
        scene.removeChildren(); scene.mask = null
        for (const s of Object.values(slots)) { s.wrap.visible = false; s.wrap.mask = null }
        for (const s of [A, B]) if (s) { s.wrap.visible = true; scene.addChild(s.wrap) }
        if (B) { scene.addChild(wipeMask); B.wrap.mask = wipeMask }
        if (B && B === core) scene.setMask({ mask: hole, inverse: true })
      }
      for (const s of [A, B]) if (s) place(s, s.wrap)
      // the circle B shows through: the fight's wipe round the player, or the staging's round its own point
      const cx = sw ? (sw.x - view.left) * view.zoom : psx, cy = sw ? (sw.y - view.top) * view.zoom : psy
      const cr = sw ? sw.r * view.zoom : wipe ? wipe.r * view.zoom : 0
      if (B) { wipeMask.position.set(cx, cy); wipeMask.width = wipeMask.height = 2 * cr }
      hole.clear()
      if (B && B === core) hole.circle(cx, cy, cr).fill(0xffffff)
      ring.clear()
      if (sw ? B && sw.col : wipe) ring.circle(cx, cy, cr).stroke({ width: sw?.w ?? 3, color: sw ? sw.col : worlds[wi].col, alpha: sw?.a ?? 1 })
      if (core?.glc) core.glc.style.display = A === core || B === core ? 'block' : 'none'

      // the crowd, every live body but the boss: its own world's creature in that world, a ghost in the other. Each slot
      // draws every body and the wipe's mask shows world B's inside the circle, so a body wears the world under it. The
      // Core's bodies are the melt's own (gl.js, fed by its stage): render.js's sprite for one is empty
      for (const s of [A, B]) if (s && s !== sk) {
        const k = worlds.findIndex((w) => w.look === s.id), st = STY.findIndex((y) => y.id === s.id), z = z0 / s.k
        s.ent.begin(); s.nb = 0; s.nc = 0
        for (const e of run.enemies) {
          if (e._dead || e.rosterId === 'ophan') continue
          const x = sx(s, e.x), y = sy(s, e.y)
          if ((e.world ?? k) !== k) { ghost(s.ent, st, x, y, Math.max(3, Math.round((e.radius ?? 12) * z))); continue }
          if (s === core) { const c = (s.core[s.nc++] ??= {}); c.e = e; c.x = x; c.y = y; c.r = e.radius * z; continue }
          const o = host.body(e)
          if (!o?.visible) continue
          if (o._shadow?.visible) body(s, o._shadow, sx(s, o._shadow.x), sy(s, o._shadow.y), z)
          body(s, o, sx(s, o.x), sy(s, o.y), z)
        }
        for (let i = s.nb; i < s.bodies.children.length; i++) s.bodies.children[i].visible = false
      }
      // the boss in its skin's look, where the sim has it, on the sim's own clock, an attack aimed where the sim locked it:
      // inside its own world's pass when the player stands in it, pasted in over a foreign world (or a wipe) otherwise; gone
      // in a wave (after its sink) and once the last skin breaks
      opx.begin(); hpx.begin(); for (const s of Object.values(slots)) s.px.begin()
      if (sk) sk.ent.begin()   // the paper has no crowd, but the staging may draw on its floor
      handShade.visible = false
      let focus = null
      const b = run.enemies.find((e) => e.rosterId === 'ophan' && !e._dead), a = b ? oph?.atk : null
      if (sink && (sink.life -= dt) <= 0) sink = null
      if (rise && (rise.life -= dt) <= 0) rise = null
      for (let i = beats.length - 1; i >= 0; i--) if ((beats[i].age += dt) >= beats[i].dur) beats.splice(i, 1)
      // a beat that outlives the boss (its leaving, its death) keeps drawing in the slot it started in
      const held = b ? null : beats.find((q) => q.from && (q.kind === 'leave' || q.kind === 'death'))
      const S = b ? sk ?? slots[worlds[oph ? oph.skin : wi].look] : sink?.s ?? held?.from
      lastS = b ? S : null
      if (S) lastS0 = S
      if (b) { lastXY.x = b.x; lastXY.y = b.y }
      untell()
      for (const [i, q] of spx.entries()) { const r = q.root; r.filters = null; r.alpha = 1; r.scale.set(1 / RES); r.position.set(spxK[i].x, spxK[i].y); q.begin() }
      for (const c of layer.children) c.visible = false
      nsp = 0
      if (S) {
        const inPass = !B && S === A, z = z0 / S.k, bpx = inPass ? S.px : opx
        place(S, overCam); place(S, handCam)
        const wx = b ? b.x : sink ? sink.x : held.x, wy = b ? b.y : sink ? sink.y : held.y
        let bx = sx(S, wx), by = sy(S, wy) + (b && oph?.stagger > 0 && !a ? 6 * z : 0)
        const R = OPHAN_BOSS.R * z
        let bph = sk ? 4 : b ? ph : sink ? sink.ph : held.ph
        // THE STAGING: each beat's look sees the boss as the fight would draw it and may change that (ov), drawing its own
        // marks over it. A beat that owns the boss's coming and going replaces the plain rise and sink
        const ov = { S, hide: false, scale: 1, alpha: 1, dx: 0, dy: 0, ph: bph }
        let owns = false
        for (const q of beats) {
          owns ||= q.kind === 'arrive' || q.kind === 'return' || q.kind === 'leave'
          q.look.draw(stageK(q, { S, A, B, b, bx, by, R, z, t, ph: bph, ov, sx, sy, view }))
        }
        // the sink and the rise: k 1 is the boss whole, 0 gone under the floor. Its px2d root is scaled about the boss, not
        // its R: the painters bake per size, and a size that eases would bake every frame
        const k = owns ? 1 : b ? (rise ? 1 - rise.life / RISE_T : 1) : sink ? sink.life / SINK_T : 1, ke = k * k * (3 - 2 * k)
        const sc = (SINK_K + (1 - SINK_K) * ke) * ov.scale, al = ke * ov.alpha
        bx += ov.dx; by += ov.dy; bph = ov.ph
        const BS = ov.S ?? S, bp = BS === S ? bpx : opx
        if (BS !== S) place(BS, overCam)
        if (sc !== 1 || al !== 1) {
          const r = bp.root
          tellPx = { px: bp, x: r.x, y: r.y }
          fade.alpha = al; r.filters = al < 1 ? [fade] : null
          r.scale.set(sc / RES); r.position.set(r.x + bx * (1 - sc), r.y + by * (1 - sc))
        }
        lastPh = bph
        if (!ov.hide && al > 0) within(BS.g, () => {
          window.OPH_PH = bph
          boss(BS, bx, by, R, t, bph, a && a.k, Math.min(1, a ? a.u : 0), a ? sx(BS, a.ax) : 0, a ? sy(BS, a.ay) : 0, bp)
        })
        // THE HAND: the next world's hand shadow slides in over the tell (src2.html handShadow, eased), tinted its colour
        if (b && oph?.tell > 0 && oph.next >= 0 && shades[oph.next]) {
          const pr = 1 - oph.tell / OPHAN_HAND.tell, e = pr * pr * (3 - 2 * pr), q = R / SH_R, hx = 130 - 85 * e, hy = -210 + 165 * e
          handShade.texture = shades[oph.next]
          handShade.anchor.set((SH_PAD + SH_X * SH_S) / handShade.texture.width, (SH_PAD + SH_Y * SH_S) / handShade.texture.height)
          handShade.position.set(bx + hx * q, by + hy * q); handShade.rotation = Math.atan2(-hy, -hx) + Math.PI / 2
          handShade.scale.set((1.7 - 0.55 * e) * q / SH_S); handShade.alpha = (0.22 + 0.38 * e) / SH_A; handShade.visible = true
        }
        // then that world's hand comes down over it and lands as the skin swaps, paints the new skin on and lifts (window
        // HAND_SEED: one path per swap, the same before and after it; OPHAN_PREV_STYLE: the old skin is still under the
        // stroke until the swap; SPIKE.px: the boss the liquid hand's cut is masked by). The after-beat's look is latched when
        // it starts: a skin break mid-paint does not swap the hand for another world's
        const u = b && oph ? handU(oph) : null
        afterLook = oph?.after >= 0 ? afterLook ?? worlds[oph.skin].look : null
        const H = u == null ? null : slots[oph.tell > 0 ? worlds[oph.next].look : afterLook]
        if (H?.warm) {
          H.g.HAND_SEED = handSeed(oph); H.g.OPHAN_PREV_STYLE = oph.tell > 0 ? S.id : null; H.g.SPIKE.px = bpx
          hpx.id = A.id + '-hand'   // the liquid hand's rim mirrors the floor under it (hands/liquid.js floorOf)
          within(H.g, () => { window.OPH_PH = ph; focus = hand(hpx, H.id, bx, by, R, t, u) })
          focus.src = S
        }
      }
      for (const s of [A, B]) if (s) within(s.g, () => {
        window.OPH_PH = ph
        // the macro lens racks to the hand's tool (stage px of the boss's slot, carried into this one's)
        const f = focus && { x: (focus.x * focus.src.k + focus.src.ox - s.ox) / s.k, y: (focus.y * focus.src.k + focus.src.oy - s.oy) / s.k, k: focus.k }
        s.st.update(t, { pan: pan(s), px: sx(s, p.x), py: sy(s, p.y), cam: { zr, ex: (s.ox * (zr - 1) + dx) / s.k, ey: (s.oy * (zr - 1) + dy) / s.k }, focus: f, crowd: s.core, crowdN: s.nc })
      })
      // the floors ahead: where the camera will look LEAD seconds on, the world shown first, then the others, a row of a
      // chunk at a time for OPHAN_BG_BAKE_MS of the frame at most. The floors come before the warm-up: a press may show any
      // world at any frame, the boss can wait behind its tell. One budget a frame: in a wave with warm-up jobs queued the
      // floors' time is taken out of the warm-up's credit
      if (dt > 0 && cam0) { const e = Math.min(1, dt * 4); vel.x += ((cwx - cam0.x) / dt - vel.x) * e; vel.y += ((cwy - cam0.y) / dt - vel.y) * e }
      cam0 = { x: cwx, y: cwy }
      const tb = performance.now(), until = tb + OPHAN_BG_BAKE_MS, warming = jobs.length && !b && !sk
      if (dt > 0) for (const s of [A, ...Object.values(slots).filter((s) => s !== A)]) {
        if (!s.warm || !s.st.prebake) continue
        const q = pan(s), k = LEAD * z0 / s.k
        if (s.st.prebake({ x: q.x + vel.x * k, y: q.y + vel.y * k }, until)) break
      }
      if (warming) credit -= performance.now() - tb

      // the immune sparks: a white ring off the sealed boss
      fx.clear()
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i], k = r.life / IMMUNE_T
        fx.circle((r.x - view.left) * view.zoom, (r.y - view.top) * view.zoom, (6 + 18 * (1 - k)) * view.zoom).stroke({ width: 2.5 * view.zoom, color: 0xffffff, alpha: k })
        if ((r.life -= dt) <= 0) rings.splice(i, 1)
      }
    },
  }
}
