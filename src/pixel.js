// Book 3, The Magma: SIMPLE PIXEL ART, REAL LIGHT, SEEN THROUGH A LIGHT CRT.
//
// Everything the chapter shows is drawn here, and render.js only delegates (CHAPTERS.magma.render
// .pixel is the switch). The look (owner: "simple design but very good lighting", after Noita's lava
// cave): flat shapes in few colours, in a cave with no light of its own — open lava, cracks, shots,
// bombs and the creatures' own embers are the only lamps. They light the floor, the props and the
// bodies around them, warm gold falling off through orange to deep red into the dark, and every
// outlined body is lit from the side that faces them (src/pixel/crt.js does the lighting).
//   src/pixel/canvas.js   PX (the one art-pixel grid), PAL (albedo palette), PixelCanvas, hash
//   src/pixel/cast.js     PIXEL_CAST (the four creatures) and paintPlayer
//   src/pixel/world.js    floor tile, props (BIOME), the crust's life stages, slag, shots, pickups
//   src/pixel/crt.js      the screen pass: snap to the grid, light, glow, scanlines
//   createPixelRig (here) places all of it every frame from `run`, and paints the LIGHT MAP the
//                         screen pass reads (render-only: it reads run and never writes it)
//
// Every texture is LOW-RES art painted one art pixel at a time, blown up by an integer factor with no
// smoothing and sampled NEAREST. One art pixel is PX world px, and the screen pass snaps the whole
// frame to the same block size, so anything else drawn in this chapter comes out on the same grid.
import { CanvasSource, Container, Filter, GlProgram, RenderTexture, Sprite, Texture, TilingSprite, UniformGroup } from 'pixi.js'
import { PX, UP, TAU, PAL, PixelCanvas, hash } from './pixel/canvas.js'
import { PIXEL_CAST, paintPlayer, paintCreature, paintCreatureMask, paintCreatureFlash, castDrawScale, castArchR, castArtScale, PLAYER_ART } from './pixel/cast.js'
import {
  TILE_ART, paintFloorTile, PIXEL_PROPS, PROP_ART, BIOME, CRACK_ART, LAVA_ART, PUDDLE_ART,
  paintCrack, paintLava, paintCool, paintPuddle, SHOT_PAINTERS, paintGem, GEM_ART, paintCoin, COIN_ART,
} from './pixel/world.js'
import { CRT_VERT, CRT_FRAG, CRT_LOOK } from './pixel/crt.js'
import { bakeGroundChunk, CHUNK_ART, PLATE_ART, paintPlate } from './pixel/ground.js'
import { magmaFloorOf, riverDepthAt } from './sim.js'

export { PX, PAL, PixelCanvas, hash, PIXEL_CAST, paintPlayer, TILE_ART, paintFloorTile, PIXEL_PROPS, PROP_ART, BIOME, SHOT_PAINTERS, paintGem, paintCoin, CRT_FRAG }

// CREATURE LIGHT: how brightly every creature's body is lit wherever it stands, on top of the lava's
// light — 0 is pure lava light (a body far from any lava sinks into the dark), 1 lights it near its
// own colours in full. It lights the BODY only (an exact mask of each sprite, outline excluded), never
// the floor round it, so it can never draw a halo.
export const CREATURE_LIGHT = 0.6

// the crack radius a crack texture is drawn at scale 1 (one art pixel per grid pixel): its arms reach
// a little past the lava it will open into, so a crack peeks out from under the beetle chasing you
export const CRACK_BAKE_R = (CRACK_ART / 2) * PX * 0.7
export const LAVA_BAKE_R = (LAVA_ART / 2 - 1.5) * PX
export const PUDDLE_BAKE_R = (PUDDLE_ART / 2 - 5) * PX

// A canvas-backed texture, sampled NEAREST: the pixels stay square at any scale.
export function pixelTex(cv, res = UP) {
  return new Texture({ source: new CanvasSource({ resource: cv, resolution: res, scaleMode: 'nearest' }) })
}
// one art grid -> { tex, ax, ay } at PX world px per art pixel
function bakeArt(pc, ax = 0.5, ay = 0.5, white = false) {
  return { tex: pixelTex(pc.toCanvas(PX * UP, white)), ax, ay, w: pc.w * PX, h: pc.h * PX }
}
// One creature frame -> { body, white, ax, ay, res, scale } canvases (render.js makes the textures).
// render.js hands in the scale it will draw this body at (drawScale). The art is PAINTED at that size
// (an elite is a bigger drawing, never a stretched one: castArtScale) and the scale is handed back,
// so render.js draws it at k = 1: one art pixel per grid pixel, whatever the body's radius.
export function bakeCreature(id, frame, drawScale = 1) {
  const sc = castArtScale(id, drawScale)
  const { pc, ax, ay } = paintCreature(id, frame, sc)
  const k = PX * UP
  return { body: pc.toCanvas(k), white: paintCreatureFlash(id, frame, sc).toCanvas(k), ax, ay, res: UP, scale: drawScale }
}
// -> { 'px_column0': { tex, ax, ay }, ... }
export function bakeProps() {
  const out = {}
  for (const [name, paint] of Object.entries(PIXEL_PROPS)) {
    for (let v = 0; v < 3; v++) {
      const [w, h] = PROP_ART[name]
      const pc = new PixelCanvas(w, h)
      paint(pc, v)
      out['px_' + name + v] = bakeArt(pc)
    }
  }
  return out
}

// the soft disc every light is drawn with (the screen pass bands it into pixel-art steps and turns a
// warm light's fringe red)
function lightDisc() {
  const n = 64
  const cv = document.createElement('canvas')
  cv.width = cv.height = n
  const ctx = cv.getContext('2d')
  const img = ctx.createImageData(n, n)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2)
    // a hot core and a long tail, like a real lamp's (inverse-square, pinned to zero at the rim)
    const v = d >= 1 ? 0 : Math.pow(1 - d, 1.4) / (1 + 6 * d * d)
    const i = (y * n + x) * 4
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(v * 255)
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return new Texture({ source: new CanvasSource({ resource: cv, resolution: 1, scaleMode: 'linear' }) })
}

// light colours
const L_LAVA = 0xffa040, L_HOT = 0xff6a20, L_CRACK = 0xc8300c, L_SLAG = 0xffa040, L_PLAYER = 0xa8c0ff, L_GEM = 0x40d8ff
const L_COIN = 0xffc040, L_GLASS = 0xb0a0ff, L_RIVER = 0xffa040
// the ground (src/pixel/ground.js): river light per point, hot ground's glow, plates on the river
const GROUND = { riverR: 92, riverA: 0.42, hotR: 70, hotA: 0.11, pulse: 2.1, plateCycle: 64, plateSpeed: 9, bakesPerFrame: 2 }
const UNDERGLOW = { cell: 420, chance: 0.55, r: 360, col: 0xc0401c, a: 0.2 }

// ---- the rig: places all of it every frame from `run` ---------------------------------------------
// env: { app, addShake(amp, dur) }. render.js adds rig.floor to its floor layer, rig.ground under the
// crowd, rig.air over it and rig.player inside the player's container, then calls the hooks below.
export function createPixelRig(env) {
  const { app } = env
  const T = {}
  const art = (w, h, paint, ax = 0.5, ay = 0.5) => { const pc = new PixelCanvas(w, h); paint(pc); return bakeArt(pc, ax, ay) }
  for (const [k, [w, h, paint]] of Object.entries(SHOT_PAINTERS)) T[k] = art(w, h, paint)
  // the obsidian shards' four turning frames (src/pixel/world.js)
  T.obsidianF = [0, 1, 2, 3].map((f) => art(SHOT_PAINTERS.obsidian[0], SHOT_PAINTERS.obsidian[1], (pc) => SHOT_PAINTERS.obsidian[2](pc, f)))
  T.splinterF = [0, 1, 2, 3].map((f) => art(SHOT_PAINTERS.splinter[0], SHOT_PAINTERS.splinter[1], (pc) => SHOT_PAINTERS.splinter[2](pc, f)))
  const shardPhase = new WeakMap()
  let shardN = 0
  T.gem = [0, 1].map((f) => art(GEM_ART[0], GEM_ART[1], (pc) => paintGem(pc, f)))
  T.coin = [0, 1].map((f) => art(COIN_ART[0], COIN_ART[1], (pc) => paintCoin(pc, f)))
  const V = [0, 1, 2, 3]
  T.crack = [0, 1, 2].map((st) => V.map((v) => art(CRACK_ART, CRACK_ART, (pc) => paintCrack(pc, v, st))))
  T.lava = V.map((v) => [0, 1, 2].map((f) => art(LAVA_ART, LAVA_ART, (pc) => paintLava(pc, v, f))))
  T.cool = V.map((v) => art(LAVA_ART, LAVA_ART, (pc) => paintCool(pc, v)))
  T.puddle = [0, 1, 2].map((v) => [0, 1, 2].map((f) => art(PUDDLE_ART, PUDDLE_ART, (pc) => paintPuddle(pc, v, f))))
  T.player = [0, 1].map((f) => art(PLAYER_ART[0], PLAYER_ART[1], (pc) => paintPlayer(pc, f)))
  T.playerWhite = [0, 1].map((f) => { const pc = new PixelCanvas(PLAYER_ART[0], PLAYER_ART[1]); paintPlayer(pc, f); return bakeArt(pc, 0.5, 0.5, true) })
  T.floor = pixelTex(paintFloorTile().toCanvas(PX), 1)
  T.plate = [0, 1, 2].map((v) => [0, 1, 2].map((sz) => art(PLATE_ART[sz][0], PLATE_ART[sz][1], (pc) => paintPlate(pc, v, sz))))
  T.floor.source.style.addressMode = 'repeat'
  T.light = lightDisc()
  // each creature frame's body MASK (outline excluded), for the emissive map, painted at the same
  // art scale as the body it covers (plain and elite), on first sight
  const maskCache = new Map()
  const maskOf = (id, elite, f) => {
    const key = id + (elite ? '*' : '') + f
    let m = maskCache.get(key)
    if (!m) {
      const { pc, ax, ay } = paintCreatureMask(id, f, castArtScale(id, castDrawScale(id, elite)))
      m = { tex: pixelTex(pc.toCanvas(PX * UP), UP), ax, ay }
      maskCache.set(key, m)
    }
    return m
  }

  // the floor: the basalt tile, then the ground over it (rivers, cooled flows, hot ground's
  // fissures), then the crust plates riding the rivers — all under the cracks and the crowd
  const floorTile = new TilingSprite({ texture: T.floor, width: 1, height: 1 })
  const chunkLayer = new Container(), fissLayer = new Container(), plateLayer = new Container()
  const floor = new Container()
  floor.addChild(floorTile, chunkLayer, fissLayer, plateLayer)
  floor.visible = false
  // baked ground chunks, keyed 'ci,cj' (null = plain crust there), for the floor of one seed
  const chunks = new Map()
  let chunkSeed = null, chunkF = null
  const dropChunk = (k) => {
    const c = chunks.get(k)
    if (c) for (const s of [c.base, c.fiss]) if (s) s.destroy({ texture: true, textureSource: true })
    chunks.delete(k)
  }
  const chunkSprite = (cv, layer, x, y) => {
    if (!cv) return null
    const s = new Sprite(pixelTex(cv, 1))
    s.position.set(x, y)
    s.scale.set(PX)
    layer.addChild(s)
    return s
  }
  const ground = new Container()
  const air = new Container()
  const player = new Container()
  ground.visible = air.visible = player.visible = false
  const pSprite = new Sprite(T.player[0].tex)
  pSprite.anchor.set(0.5)
  player.addChild(pSprite)

  // the light map: one texel per art pixel on screen, repainted every frame, never on the stage
  const lightRoot = new Container()
  // a black sheet under the lights: the map starts every frame from darkness (an explicit clear of a
  // render texture is not honoured on every path, and stale light would smear behind moving lamps)
  const lightBase = new Sprite(Texture.WHITE)
  lightBase.tint = 0x000000
  lightRoot.addChild(lightBase)
  let lightRT = RenderTexture.create({ width: 64, height: 64, resolution: 1, scaleMode: 'nearest' })
  // THE EMISSIVE MAP, on the light map's grid: green = this cell is a creature's body (it takes the
  // creature light). Its own pass, so the light can never spill off a body onto the floor.
  const emitRoot = new Container()
  const emitBase = new Sprite(Texture.WHITE)
  emitBase.tint = 0x000000
  emitRoot.addChild(emitBase)
  let emitRT = RenderTexture.create({ width: 64, height: 64, resolution: 1, scaleMode: 'nearest' })
  const heldFrame = new WeakMap()
  const crtU = new UniformGroup({
    uBodyLight: { value: CREATURE_LIGHT, type: 'f32' },
    uPx: { value: PX, type: 'f32' }, uScan: { value: CRT_LOOK.scan, type: 'f32' }, uMask: { value: CRT_LOOK.mask, type: 'f32' },
    uVignette: { value: CRT_LOOK.vignette, type: 'f32' }, uGlow: { value: CRT_LOOK.glow, type: 'f32' },
    uGain: { value: CRT_LOOK.gain, type: 'f32' }, uSteps: { value: CRT_LOOK.steps, type: 'f32' }, uHeat: { value: CRT_LOOK.heat, type: 'f32' },
    uRim: { value: CRT_LOOK.rim, type: 'f32' },
    uAmbient: { value: new Float32Array(CRT_LOOK.ambient), type: 'vec3<f32>' },
    uAmbRim: { value: new Float32Array(CRT_LOOK.ambRim), type: 'vec3<f32>' },
    uLightSize: { value: new Float32Array([64, 64]), type: 'vec2<f32>' },
    uLightOff: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
  })
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: CRT_VERT, fragment: CRT_FRAG, name: 'pixel-lava-crt' }),
    resources: { crtU, uLightTex: lightRT.source, uEmitTex: emitRT.source },
  })

  // one growable pool of plain sprites per thing drawn
  const pool = (parent, blend) => {
    const list = []
    let n = 0
    return {
      begin() { n = 0 },
      next(t) {
        let s = list[n]
        if (!s) { s = new Sprite(t.tex ?? t); if (blend) s.blendMode = blend; parent.addChild(s); list.push(s) }
        n++
        const tex = t.tex ?? t
        if (s.texture !== tex) s.texture = tex
        s.anchor.set(t.ax ?? 0.5, t.ay ?? 0.5)
        s.visible = true; s.alpha = 1; s.tint = 0xffffff; s.rotation = 0
        return s
      },
      end() { for (let i = n; i < list.length; i++) list[i].visible = false },
      hide() { n = 0; this.end() },
      get count() { return n },
    }
  }
  // three sub-layers, so a pool that grows later can never slip its sprites above another's: the
  // slag lies UNDER the crust (the lava that burns must always read), shadows over both
  const subLayer = () => { const c = new Container(); ground.addChild(c); return c }
  const gPuddle = pool(subLayer()), gCrust = pool(subLayer()), gShadow = pool(subLayer())
  const gPlate = pool(plateLayer)
  const aLob = pool(air), aGust = pool(air)
  const lights = pool(lightRoot, 'add')
  const masks = pool(emitRoot)
  // lights gathered by the per-entity hooks (bullets, gems, coins) land in the NEXT frame's map
  const pending = []
  const flashes = []   // transient light from events: {x, y, r, col, a, life, max}
  // pixel sparks: render-local, never in run
  const sparks = []
  const sparkLayer = new Container()
  air.addChild(sparkLayer)
  function burst(x, y, n, colors, speed, life, size = 1, grav = 160) {
    for (let i = 0; i < n; i++) {
      let p = sparks.find((q) => q.life <= 0)
      if (!p) { if (sparks.length >= 240) return; p = { s: new Sprite(T.spark.tex), life: 0 }; p.s.anchor.set(0.5); sparkLayer.addChild(p.s); sparks.push(p) }
      const a = Math.random() * TAU, v = speed * (0.4 + Math.random() * 0.6)
      p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - speed * 0.3; p.g = grav
      p.life = p.max = life * (0.6 + Math.random() * 0.6)
      p.s.tint = colors[i % colors.length]
      p.s.scale.set(size * (1 + Math.round(Math.random())))
      p.s.visible = true
    }
  }
  function flash(x, y, r, col, a, life) {
    let f = flashes.find((q) => q.life <= 0)
    if (!f) { if (flashes.length >= 48) return; f = {}; flashes.push(f) }
    Object.assign(f, { x, y, r, col, a, life, max: life })
  }
  const hex = (c) => parseInt(c.slice(1), 16)
  const EMBERS = [hex(PAL.lava3), hex(PAL.lava4), hex(PAL.lava2), hex(PAL.lava5)]
  const ASH = [hex(PAL.ash), hex(PAL.ashHi), hex(PAL.rk2)]
  const GLASS = [hex(PAL.glassHi), hex(PAL.glass2)]
  const FLAME = [hex(PAL.lava3), hex(PAL.lava4), hex(PAL.lava2)]

  // a pickup's glint: on for about a sixth of a 1.2s cycle, phased by where it lies
  const glintOn = (t, x, y) => ((t / 1.2 + hash(Math.round(x), Math.round(y), 17)) % 1) < 0.16
  let look = null
  let burning = false, flameT = 0
  const v4 = (x, y) => Math.floor(hash(Math.round(x), Math.round(y), 5) * 4)
  // a light at world (x, y), radius r world px, colour col, strength a (0..1)
  const addLight = (x, y, r, col, a) => {
    if (a <= 0.01 || r <= 1) return
    const s = lights.next(T.light)
    s.position.set(x, y)
    s.scale.set((r * 2) / 64)
    s.tint = col
    s.alpha = Math.min(1, a)
  }

  const rig = {
    T, floor, ground, air, player, filter,
    get active() { return look != null },
    enable(l) {
      look = l
      floor.visible = ground.visible = air.visible = player.visible = true
    },
    disable() {
      look = null
      floor.visible = ground.visible = air.visible = player.visible = false
      rig.clear()
    },
    clear() {
      gCrust.hide(); gPuddle.hide(); gPlate.hide(); gShadow.hide(); aLob.hide(); aGust.hide(); lights.hide(); masks.hide()
      pending.length = 0
      burning = false
      for (const f of flashes) f.life = 0
      for (const p of sparks) { p.life = 0; p.s.visible = false }
    },
    // cam: { cx, cy, z, w, h, animT } (w/h in world px)
    sync(run, dt, cam) {
      if (!look) return
      const t = cam.animT
      const z = cam.z || 1
      // the floor, nailed to the world
      const M = 128
      floorTile.position.set(Math.round(-cam.cx - M), Math.round(-cam.cy - M))
      floorTile.width = cam.w + M * 2
      floorTile.height = cam.h + M * 2
      floorTile.tilePosition.set(-floorTile.x, -floorTile.y)
      const x0 = -cam.cx - 80, y0 = -cam.cy - 80, x1 = -cam.cx + cam.w + 80, y1 = -cam.cy + cam.h + 80
      const onScreen = (x, y, r = 0) => x + r > x0 && x - r < x1 && y + r > y0 && y - r < y1

      lights.begin()
      // the light the hooks gathered last frame
      for (const L of pending) addLight(L[0], L[1], L[2], L[3], L[4])
      pending.length = 0

      // THE GROUND (src/pixel/ground.js): bake the chunks the view needs, nearest first (every one
      // on screen now, a few of the margin's a frame); then light the rivers and the hot ground and
      // drift the rivers' crust plates
      const FL = magmaFloorOf(run)
      gPlate.begin()
      if (FL) {
        if (chunkSeed !== FL.seed || chunkF !== FL.F) { for (const k of [...chunks.keys()]) dropChunk(k); chunkSeed = FL.seed; chunkF = FL.F }
        const CW = CHUNK_ART * PX
        const vi0 = Math.floor(-cam.cx / CW), vi1 = Math.floor((-cam.cx + cam.w) / CW)
        const vj0 = Math.floor(-cam.cy / CW), vj1 = Math.floor((-cam.cy + cam.h) / CW)
        const i0 = vi0 - 1, i1 = vi1 + 1, j0 = vj0 - 1, j1 = vj1 + 1
        const pcx = -cam.cx + cam.w / 2, pcy = -cam.cy + cam.h / 2
        const todo = []
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          if (!chunks.has(i + ',' + j)) todo.push([i, j, ((i + 0.5) * CW - pcx) ** 2 + ((j + 0.5) * CW - pcy) ** 2])
        }
        todo.sort((a, b) => a[2] - b[2])
        let budget = GROUND.bakesPerFrame
        for (const [i, j] of todo) {
          const inView = i >= vi0 && i <= vi1 && j >= vj0 && j <= vj1
          if (!inView && budget <= 0) continue
          if (!inView) budget--
          const g = bakeGroundChunk(FL.F, FL.seed, i, j, PX)
          chunks.set(i + ',' + j, g && { ...g, base: chunkSprite(g.base, chunkLayer, i * CW, j * CW), fiss: chunkSprite(g.fiss, fissLayer, i * CW, j * CW) })
        }
        const far = []
        for (const [k, c] of chunks) {
          const [a, b] = k.split(',').map(Number)
          const near = a >= i0 && a <= i1 && b >= j0 && b <= j1
          if (!near && (a < i0 - 3 || a > i1 + 3 || b < j0 - 3 || b > j1 + 3)) far.push(k)
          if (!c) continue
          if (c.base) c.base.visible = near
          if (c.fiss) c.fiss.visible = near
          if (!near) continue
          for (const [x, y, d] of c.riverLights) {
            if (onScreen(x, y, GROUND.riverR)) addLight(x, y, GROUND.riverR, L_RIVER, GROUND.riverA * (0.6 + 0.4 * d) * (0.9 + 0.1 * Math.sin(t * 3 + x * 0.05 + y * 0.03)))
          }
          const pulse = 0.7 + 0.3 * Math.sin(t * GROUND.pulse)
          for (const [x, y, d] of c.hotLights) {
            if (onScreen(x, y, GROUND.hotR)) addLight(x, y, GROUND.hotR * (0.7 + 0.5 * d), L_CRACK, GROUND.hotA * d * pulse)
          }
          for (const [x, y, ph] of c.plates) {
            const k = (t * GROUND.plateSpeed / GROUND.plateCycle + ph) % 1
            const off = (k - 0.5) * GROUND.plateCycle
            const px = x + c.flow[0] * off, py = y + c.flow[1] * off
            if (!onScreen(px, py, 20) || riverDepthAt(FL.F, px, py, FL.seed) < 0.4) continue
            // a plate crusts over, rides the flow and melts back in: small, grown, small again
            const sz = k < 0.12 || k > 0.88 ? 0 : k < 0.26 || k > 0.74 ? 1 : 2
            const s = gPlate.next(T.plate[Math.floor(ph * 3)][sz])
            s.position.set(Math.round(px / PX) * PX, Math.round(py / PX) * PX)
          }
        }
        for (const k of far) dropChunk(k)
        fissLayer.alpha = 0.72 + 0.28 * Math.sin(t * GROUND.pulse)
      }
      gPlate.end()

      // HEAT FROM BELOW: the magma chamber glows faintly up through the crust in broad, slow pools
      // hundreds of px across — no shape, no edge, nothing that could pass for a crack, just warm
      // and cold ground, so the dark between the lava is never one flat black
      const G = UNDERGLOW.cell
      for (let gx = Math.floor(x0 / G) - 1; gx <= Math.floor(x1 / G) + 1; gx++) {
        for (let gy = Math.floor(y0 / G) - 1; gy <= Math.floor(y1 / G) + 1; gy++) {
          const h = hash(gx, gy, 211)
          if (h > UNDERGLOW.chance) continue
          const lx = (gx + hash(gx, gy, 212)) * G, ly = (gy + hash(gx, gy, 213)) * G
          const br = 0.75 + 0.25 * Math.sin(t * 0.7 + h * 40)
          addLight(lx, ly, UNDERGLOW.r * (0.7 + 0.6 * hash(gx, gy, 214)), UNDERGLOW.col, UNDERGLOW.a * br)
        }
      }
      // the crust
      const p = run.player
      let onLava = null
      gCrust.begin()
      for (const c of run.cracks || []) {
        if (!onScreen(c.x, c.y, c.r * 3)) continue
        const v = v4(c.x, c.y)
        if (c.state === 'crack') {
          // it heats as it nears opening: fresh -> warming -> hot. The tell for whoever stands on it.
          const left = Math.max(0, c.openAt - run.time)
          const span = Math.max(0.2, (c.t ?? 0) + left)
          const k = 1 - Math.min(1, left / span)
          const st = k < 0.45 ? 0 : k < 0.8 ? 1 : 2
          const s = gCrust.next(T.crack[st][v])
          s.position.set(c.x, c.y)
          s.rotation = (v * Math.PI) / 2
          s.scale.set(c.r / CRACK_BAKE_R)
          const pulse = st === 2 ? 0.75 + 0.25 * Math.sin(t * 30) : 1
          addLight(c.x, c.y, c.r * (1.2 + k * 1.6), st === 0 ? L_CRACK : L_HOT, (0.2 + k * 0.5) * pulse)
        } else if (c.state === 'lava') {
          const f = Math.floor(t * 5 + v) % 3
          const s = gCrust.next(T.lava[v][f])
          s.position.set(c.x, c.y)
          // it wells up over its first tenth of a second
          const pop = Math.min(1, 0.4 + (run.time - c.openAt) / 0.15)
          s.scale.set((c.r / LAVA_BAKE_R) * Math.max(0.4, pop))
          const flared = (c._flareT ?? 0) > run.time
          if (flared) s.tint = 0xfff4d0
          // the last half second it dims toward crust
          const end = c.lavaEnd - run.time
          const dim = end < 0.5 ? Math.max(0.35, end / 0.5) : 1
          if (end < 0.5) s.tint = 0xd88060
          const fl = 0.9 + 0.1 * Math.sin(t * 7 + v * 1.7) + 0.05 * Math.sin(t * 17 + v)
          addLight(c.x, c.y, c.r * (flared ? 5.5 : 4.2) * Math.max(0.5, pop), L_LAVA, (flared ? 1 : 0.8) * fl * dim)
          if (p && Math.hypot(p.x - c.x, p.y - c.y) < c.r + 6) onLava = c
        } else {
          const s = gCrust.next(T.cool[v])
          s.position.set(c.x, c.y)
          s.scale.set(c.r / LAVA_BAKE_R)
          const a = Math.max(0, Math.min(1, (c.coolEnd - run.time) / (c.coolT || 1)))
          s.alpha = a   // dead crust: it throws no light at all
        }
      }
      gCrust.end()
      // a lava river under you burns as open lava does, so it shows as open lava does
      if (!onLava && FL && p && riverDepthAt(FL.F, p.x, p.y, FL.seed) > 0) onLava = true
      gPuddle.begin()
      for (const sp of run.slagPools || []) {
        const pv = v4(sp.x, sp.y) % 3
      // it cools as it lies: molten, then crusting dull red, then (as it fades) dark glassy slag
        const left = sp.dur - sp.t
        const st = sp.t < 0.9 ? 0 : left > 0.6 ? 1 : 2
        const s = gPuddle.next(T.puddle[pv][st])
        s.position.set(sp.x, sp.y)
        s.rotation = (v4(sp.x, sp.y) * Math.PI) / 2
        const grow = Math.min(1, sp.t / 0.12)
        s.scale.set((sp.r / PUDDLE_BAKE_R) * grow)
        const a = Math.max(0, Math.min(1, left / 0.5))
        s.alpha = a
        addLight(sp.x, sp.y, sp.r * (st === 0 ? 2 : 1.4), st === 0 ? L_HOT : L_CRACK, [0.3, 0.16, 0][st] * a * grow)
      }
      gPuddle.end()
      // lobs: a shadow on the ground, the blob or rock arcing over it, its light falling round it
      gShadow.begin(); aLob.begin()
      for (const l of run.magmaLobs || []) {
        const k = Math.min(1, l.t / l.flight)
        const x = l.fromX + (l.x - l.fromX) * k, y = l.fromY + (l.y - l.fromY) * k
        const bomb = l.kind === 'bomb'
        const hgt = Math.sin(Math.PI * k) * (bomb ? 110 : 46)
        const sh = gShadow.next(T.shadow)
        sh.position.set(x, y)
        sh.scale.set((bomb ? 1.2 : 0.8) * (1 - 0.35 * Math.sin(Math.PI * k)))
        const s = aLob.next(bomb ? T.bomb : T.slag)
        s.position.set(x, y - hgt)
        if (bomb) s.rotation = Math.round(((l.spin ?? 0) + k * 6) * 2) * (Math.PI / 4)
        addLight(x, y - hgt * 0.5, bomb ? 90 : 50, bomb ? L_HOT : L_SLAG, bomb ? 0.5 : 0.4)
      }
      gShadow.end(); aLob.end()
      // the bellows' gust and the lava it flares
      aGust.begin()
      for (const n of run.novas || []) {
        if (n.look === 'bellows') {
          const k = 1 - Math.max(0, n.life / (n.lifeMax || 1))
          // a fan of hot-air ripples streaming out along the blast, thinning as it goes
          const puffs = 5
          for (let i = 0; i < puffs; i++) {
            const a = n.angle - n.arc / 2 + (n.arc * (i + 0.5)) / puffs
            for (const rr of [0.35, 0.65, 0.95]) {
              const s = aGust.next(T.puff)
              const d = n.r * (rr * (0.6 + 0.4 * k))
              s.position.set(n.x + Math.cos(a) * d, n.y + Math.sin(a) * d)
              s.rotation = Math.round(a / (Math.PI / 4)) * (Math.PI / 4)
              s.alpha = 0.55 * (1 - k) * (1.1 - rr * 0.5)
            }
          }
          addLight(n.x + Math.cos(n.angle) * n.r * 0.6, n.y + Math.sin(n.angle) * n.r * 0.6, n.r * 0.9, L_SLAG, 0.25 * (1 - k))
        } else if (n.look === 'flare') {
          const s = aGust.next(T.flare)
          s.position.set(n.x, n.y)
          s.scale.set(Math.max(0.3, n.r / (10 * PX)))
          const a = Math.max(0, n.life / (n.lifeMax || 1))
          s.alpha = a + 0.2
          addLight(n.x, n.y, n.r * 2.4, L_LAVA, 0.8 * a)
        }
      }
      aGust.end()
      // the creatures' own glow (their embers light the floor round them), and each body's MASK in
      // the emissive map, placed exactly as render.js draws the body: same frame, same mirror (a
      // Magma creature faces you, or what it fights while an ally), same scale
      masks.begin()
      for (const e of run.enemies || []) {
        const M = PIXEL_CAST[e.rosterId]
        if (!M || !onScreen(e.x, e.y, 60)) continue
        const [mul, col, a] = M.light
        addLight(e.x, e.y, e.radius * mul * (e.elite ? 1.3 : 1), col, a * (e.elite ? 1.2 : 1))
        const halted = (e.frozen || 0) > 0 || (e.stunT || 0) > 0
        let f = heldFrame.get(e)
        if (!halted || f === undefined) { f = Math.floor(t * 10 + e.id * 1.7) % M.frames; heldFrame.set(e, f) }
        const s = masks.next(maskOf(e.rosterId, !!e.elite, f))
        s.position.set(e.x, e.y)
        let tdx = p ? p.x - e.x : 1
        if ((e.allyT || 0) > 0 && e._tgtX !== undefined) tdx = e._tgtX - e.x
        const k = e.radius / (castArchR(e.rosterId) * castDrawScale(e.rosterId, !!e.elite))
        s.scale.set(k * (tdx < 0 ? -1 : 1), k)
      }
      masks.end()
      // the player's own small, cool light: enough to read the nearest foes, never a torch
      if (p) { addLight(p.x, p.y, 130, L_PLAYER, 0.2); addLight(p.x, p.y, 30, 0xffffff, 0.12) }
      // ON OPEN LAVA: the lava that is burning you must read even under your own sprite — it flares
      // round you, licks of flame climb off your edges, and you glow hot (syncPlayer)
      burning = !!onLava
      if (onLava && p) {
        addLight(p.x, p.y, 120, L_LAVA, 0.7 + 0.2 * Math.sin(t * 22))
        flameT -= dt
        if (flameT <= 0) {
          flameT = 0.05
          const a = Math.random() * TAU, rr = 14 + Math.random() * 6
          burst(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.7 + 6, 2, FLAME, 40, 0.45, 1, -160)
        }
      }
      // event flashes
      for (const f of flashes) {
        if (f.life <= 0) continue
        f.life -= dt
        if (f.life > 0) addLight(f.x, f.y, f.r, f.col, f.a * (f.life / f.max))
      }
      // sparks, each a speck of light on the grid
      for (const sp of sparks) {
        if (sp.life <= 0) continue
        sp.life -= dt
        if (sp.life <= 0) { sp.s.visible = false; continue }
        sp.vy += sp.g * dt
        sp.x += sp.vx * dt; sp.y += sp.vy * dt
        sp.s.position.set(Math.round(sp.x / PX) * PX, Math.round(sp.y / PX) * PX)
        sp.s.alpha = Math.min(1, (sp.life / sp.max) * 2)
      }
      lights.end()

      // paint the light map: one texel per art pixel of the screen, aligned with the screen pass's grid
      const lw = Math.ceil(cam.w / PX) + 2, lh = Math.ceil(cam.h / PX) + 2
      if (lightRT.width !== lw || lightRT.height !== lh) lightRT.resize(lw, lh)
      lightRoot.scale.set(1 / PX)
      lightRoot.position.set(cam.cx / PX, cam.cy / PX)
      lightBase.position.set(-cam.cx - PX * 4, -cam.cy - PX * 4)
      lightBase.width = cam.w + PX * 12; lightBase.height = cam.h + PX * 12
      app.renderer.render({ container: lightRoot, target: lightRT, clear: true, clearColor: [0, 0, 0, 1] })
      if (emitRT.width !== lw || emitRT.height !== lh) emitRT.resize(lw, lh)
      emitRoot.scale.set(1 / PX)
      emitRoot.position.set(cam.cx / PX, cam.cy / PX)
      emitBase.position.set(lightBase.x, lightBase.y)
      emitBase.width = lightBase.width; emitBase.height = lightBase.height
      app.renderer.render({ container: emitRoot, target: emitRT, clear: true, clearColor: [0, 0, 0, 1] })
      const u = crtU.uniforms
      u.uPx = PX * z
      u.uLightSize[0] = lw; u.uLightSize[1] = lh
    },
    syncPlayer(p, dt, animT, flash) {
      if (!look) return
      const f = Math.floor(animT * 5) % 2
      const lk = (flash ? T.playerWhite : T.player)[f]
      if (pSprite.texture !== lk.tex) pSprite.texture = lk.tex
      pSprite.scale.set(p.facing < 0 ? -1 : 1, 1)
      // the player keeps its own colour even in lava (it is emissive, src/pixel/crt.js): the burn reads
      // from the flames licking off its edges and the lava flaring round it
      pSprite.tint = 0xffffff
    },
    // A sim event drawn here. Returns true when it is fully handled (render.js then skips it).
    event(e) {
      if (!look) return false
      switch (e.type) {
        case 'crackOpen':
          burst(e.x, e.y, e.by === 'step' ? 4 : 12, EMBERS, 100, 0.55)
          flash(e.x, e.y, (e.r || 34) * (e.by === 'step' ? 4 : 6), L_LAVA, 0.6, 0.35)
          if (e.by !== 'step') env.addShake?.(2.5, 0.14)
          return true
        case 'crustCrack':
          burst(e.x, e.y, 3, ASH, 50, 0.35)
          return true
        case 'lavaFlare':
          burst(e.x, e.y, 12, EMBERS, 170, 0.6)
          flash(e.x, e.y, 160, L_LAVA, 0.6, 0.4)
          return true
        case 'slagSplash':
          burst(e.x, e.y, 9, EMBERS, 120, 0.45)
          flash(e.x, e.y, 90, L_SLAG, 0.5, 0.25)
          return true
        case 'bombLand':
          burst(e.x, e.y, 26, [...EMBERS, ...ASH], 240, 0.75)
          flash(e.x, e.y, 260, L_LAVA, 0.9, 0.5)
          env.addShake?.(4, 0.2)
          return true
      }
      return false
    },
    // Pool hooks: return true when the sprite is drawn here.
    placeBullet(s, b, animT = 0) {
      if (!look) return false
      const glass = b.weapon === 'obsidian' || b.weapon === 'splinter'
      // glass turns as it flies, each shard on its own beat, and catches the light on every turn
      let ph = 0
      if (glass) { ph = shardPhase.get(b); if (ph === undefined) { ph = (shardN++ * 0.37) % 1; shardPhase.set(b, ph) } }
      const gf = Math.floor(animT * 9 + ph * 4) % 4
      const t = b.weapon === 'obsidian' ? T.obsidianF[gf] : b.weapon === 'splinter' ? T.splinterF[gf] : T.ember
      if (s.texture !== t.tex) { s.texture = t.tex; s.anchor.set(t.ax, t.ay) }
      s.tint = 0xffffff
      s.position.set(b.x, b.y)
      // eight headings only: a pixel shard turns in 45-degree steps, like a sprite sheet would
      s.rotation = Math.round(Math.atan2(b.vy, b.vx) / (Math.PI / 4)) * (Math.PI / 4)
      s.scale.set(1)
      if (pending.length < 160) pending.push([b.x, b.y, glass ? 34 : 30, glass ? L_GLASS : L_SLAG, glass ? 0.32 : 0.4])

      return true
    },
    placeNova(s, n) {
      if (!look) return false
      if (n.look === 'bellows' || n.look === 'flare') { s.visible = false; return true }
      return false
    },
    placeGem(s, g, animT) {
      if (!look) return false
      // now and then a facet catches the light: a short glint, each gem on its own beat
      const gk = T.gem[glintOn(animT, g.x, g.y) ? 1 : 0]
      if (s.texture !== gk.tex) { s.texture = gk.tex; s.anchor.set(gk.ax, gk.ay) }
      s.position.set(g.x, g.y - (Math.floor(animT * 4 + (g.x + g.y) * 0.01) % 2) * PX)
      s.scale.set(1)
      if (pending.length < 200) pending.push([g.x, g.y, 24, L_GEM, 0.45])
      return true
    },
    placeCoin(s, c, animT) {
      if (!look) return false
      const ck = T.coin[glintOn(animT * 1.3, c.x + 7, c.y) ? 1 : 0]
      if (s.texture !== ck.tex) { s.texture = ck.tex; s.anchor.set(ck.ax, ck.ay) }
      s.position.set(c.x, c.y)
      s.scale.set(Math.floor(animT * 3 + (c.x - c.y) * 0.01) % 3 === 0 ? 0.5 : 1, 1)   // a coin spinning, in three frames
      if (pending.length < 200) pending.push([c.x, c.y, 22, L_COIN, 0.3])
      return true
    },
    // the summary recap's picture for hurt src 'lava'
    hazardThumb(src) {
      if (src !== 'lava') return null
      const s = new Sprite(T.lava[0][0].tex)
      s.anchor.set(0.5)
      return s
    },
  }
  return rig
}
