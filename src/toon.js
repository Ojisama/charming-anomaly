// THE MANTLE, AS A 1930s RUBBER-HOSE CARTOON SEEN FROM ABOVE (CHAPTERS.mantle.render.toon).
// Render-only, like macro.js, pixel.js and ascii.js: it reads `run`, never writes it.
//
// EVERY VISUAL OF THE MANTLE IS DECIDED IN THIS FILE AND IN src/toon/*. render.js only calls in while
// CHAPTERS[run.chapter].render.toon is set, and draws nothing of the chapter's own:
//   src/toon/palette.js   PAL (the palette), mkCanvas, hash, whiteTwin
//   src/toon/brush.js     the brush: pressure ink, cel fills, pie-cut eyes, gloves, rubber hose
//   src/toon/cast.js      TOON_CAST (the four creatures), paintPlayer, the shore's peeking bubbles
//   src/toon/world.js     the floor shader (a GPU watercolour of rock and gouache lava, driven by the
//                         height field and the tide), its noise and bubble atlas, the film pass, the
//                         shots and the pickups
//
// ==== THE SURFACE render.js USES ===================================================================
//   TOON_CAST                 { [rosterId]: entry } — the creatures this module draws.
//   bakeCreature(id, elite)   -> { frames: [{ canvas, white, ax, ay, res }], thumb, baseR, lean,
//                             upright, poseOf, faceDir, turnRate } — render.js's enemy pool draws the
//                             creatures from these (mirrored to face their way, never turned), and
//                             scripts/bake-cast.mjs writes `thumb` to src/cast/<id>.png.
//   inkRing / inkLine / bakeAffix / bakeRingCanvas   (src/toon/marks.js) render.js's own overlays — telegraph and aura
//                             rings, a pounce lane's edges, the elite affix badges — drawn in the
//                             cast's ink instead of as flat vector strokes and emoji (render.js's
//                             toonOn hooks).
//   createToonRenderer(host)  -> renderer { hide, enter, exit, sync, event, filters }
//     host = { app, world, floor, under, over, screen } (see render.js's setToon / syncToon):
//       floor  world-space, over render.js's (hidden) floor and under every entity layer
//       under  world-space, under the pickups and the creatures (props, pickups)
//       over   world-space, over the creatures (the player, shots, flames)
//       screen screen-space, over the world
//     renderer.hide names render.js layers to switch off for the whole chapter (render.js's
//     TOON_HIDEABLE): what is hidden is drawn here instead, so a restyle can take over any of them.
//
// What the sim publishes for this chapter (state.js's doc block is the authority): run.lavaTide
// (level, phase, swell, line, ...), sim.js's lavaTideOf / mantleHeightAt / lavaFloodedAt (the ground's
// height and the lava on it), run.bullets (weapon 'match', 'coal'), run.novas (look 'steam'),
// run.boomerangs (weapon 'pitchfork'), the elemental contract fields on enemies (ignite), and the
// event tideTurn.
import { AlphaFilter, BufferImageSource, CanvasSource, Container, Filter, GlProgram, Mesh, MeshGeometry, Shader, Sprite, Texture, UniformGroup } from 'pixi.js'
import { PAL, TAU, mkCanvas, hash, whiteTwin, CLOCK } from './toon/palette.js'
import { TOON_CAST, paintPlayer, PLAYER_BOX } from './toon/cast.js'
import {
  CHUNK, CHUNK_STEP, CHUNK_N, FLOOR_VERT, FLOOR_FRAG, FILM_VERT, FILM_FRAG, NOISE_N, bakeNoise, paintBubbleAtlas,
  paintMatch, paintCoal, paintPitchfork, paintPuff, paintGem, paintCoin, paintLick, paintDot, paintSweat, paintWade, paintDaze,
} from './toon/world.js'
import { lavaTideOf, mantleHeightAt, lavaLineFor } from './sim.js'
import { gemTier } from './config.js'

export { TOON_CAST, PAL }
export { inkRing, inkLine, bakeAffix, bakeRingCanvas, bakeDigits } from './toon/marks.js'

const RES = 3   // canvas px per world px, for every bake
// the ground drawn with the tide switched off (signature.lavaTide = null): the same kind of hills, dry
const DRY_GROUND = { wave: 640, ridgeWave: 950, ridgeMix: 0.38, floodCover: 0.74 }
// a frame index that is never negative (world coordinates are)
const fi = (v, n) => ((Math.floor(v) % n) + n) % n
const canvasTex = (cv, res = RES) => new Texture({ source: new CanvasSource({ resource: cv, resolution: res }) })

// ---- the creatures -------------------------------------------------------------------------------
function paintBody(id, f, elite, res = RES) {
  const M = TOON_CAST[id]
  const [x0, y0, x1, y1] = M.box
  const cv = mkCanvas((x1 - x0) * res, (y1 - y0) * res)
  const ctx = cv.getContext('2d')
  ctx.scale(res, res); ctx.translate(-x0, -y0)
  M.paint(ctx, f, elite)
  return { canvas: cv, ax: -x0 / (x1 - x0), ay: -y0 / (y1 - y0) }
}
// The title card / recap thumbnail: the creature on a cream paper disc with an ink rim.
function paintThumb(id, elite) {
  const b = paintBody(id, TOON_CAST[id].thumbFrame ?? 0, elite, 4)
  const S = Math.max(b.canvas.width, b.canvas.height) + 16
  const cv = mkCanvas(S, S)
  const x = cv.getContext('2d')
  x.fillStyle = PAL.paper; x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 3, 0, TAU); x.fill()
  x.lineWidth = 4; x.strokeStyle = PAL.ink; x.stroke()
  x.save(); x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 5, 0, TAU); x.clip()
  x.drawImage(b.canvas, (S - b.canvas.width) / 2, (S - b.canvas.height) / 2)
  x.restore()
  return cv
}
export function bakeCreature(id, elite) {
  const M = TOON_CAST[id]
  if (!M) return null
  const frames = []
  for (let f = 0; f < M.frames; f++) {
    const b = paintBody(id, f, elite)
    frames.push({ canvas: b.canvas, white: whiteTwin(b.canvas), ax: b.ax, ay: b.ay, res: RES })
  }
  return { frames, thumb: paintThumb(id, elite || id === 'brimstoneDragon'), baseR: M.baseR, lean: 0, upright: false, poseOf: M.poseOf ?? null, faceDir: null, turnRate: null }
}
// THE PLAYER'S KEYLINE: its silhouette (no ground shadow) grown by a couple of px and filled with ink,
// drawn under it: a thick-thin brush contour with a thin, broken margin of paper round it, so the
// digger reads at a glance over a dragon's wing or a pile of imps without looking cut out.
function keyline(f) {
  const [x0, y0, x1, y1] = PLAYER_BOX
  const bare = mkCanvas((x1 - x0) * RES, (y1 - y0) * RES), bx = bare.getContext('2d')
  bx.scale(RES, RES); bx.translate(-x0, -y0); paintPlayer(bx, f, true)
  // grown silhouette of the bare body by radius k (in world px), filled with one colour. The radius
  // wanders round the body the way a brush's pressure does (thick on the shadow side, lower right,
  // thin toward the light, and uneven everywhere), so it reads as hand ink, never as a cut-out.
  const grow = (k0, k1, col, ph) => {
    const g = mkCanvas(bare.width, bare.height), c = g.getContext('2d')
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU
      const wob = 0.3 * Math.sin(a * 3 + ph + f * 1.7) + 0.22 * Math.sin(a * 7 + ph * 2.3) + 0.12 * Math.sin(a * 13 + ph * 0.7)
      const R = RES * Math.max(0.3, k0 + k1 * Math.max(0, Math.cos(a - 0.98)) + wob)
      c.drawImage(bare, Math.cos(a) * R, Math.sin(a) * R)
    }
    c.globalCompositeOperation = 'source-in'
    c.fillStyle = col; c.fillRect(0, 0, g.width, g.height)
    return g
  }
  // the margin of paper the inker left round the cel: thin, uneven, and broken in places where the
  // brush of the background paint came right up to the ink
  const margin = grow(2.0, 1.1, PAL.paper ?? '#f3e6c4', 4.1)
  {
    const m = margin.getContext('2d'), w = margin.width, h = margin.height
    m.globalCompositeOperation = 'destination-out'
    let sd = 977 + f * 131
    const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647 }
    for (let i = 0; i < 9; i++) {
      m.globalAlpha = 0.55 + 0.45 * rnd()
      m.beginPath(); m.ellipse(rnd() * w, rnd() * h, RES * (2 + 4 * rnd()), RES * (1.5 + 3 * rnd()), rnd() * TAU, 0, TAU); m.fill()
    }
    m.globalAlpha = 1
  }
  // the ink: a thick-thin brush contour hugging the silhouette
  const cv = mkCanvas(bare.width, bare.height), c = cv.getContext('2d')
  c.globalAlpha = 0.9; c.drawImage(margin, 0, 0); c.globalAlpha = 1
  c.drawImage(grow(1.0, 1.6, PAL.ink ?? '#1e1513', 0.0), 0, 0)
  return cv
}
// ---- the renderer --------------------------------------------------------------------------------
export function createToonRenderer(host) {
  const { app, floor, under, over } = host
  // textures, baked once
  const art = (b) => ({ tex: canvasTex(b.canvas, b.res), ax: b.ax, ay: b.ay })
  const T = {
    match: [0, 1, 2].map((f) => art(paintMatch(f))),
    coal: [0, 1].map((f) => art(paintCoal(f))),
    fork: art(paintPitchfork()),
    puff: [0, 1, 2].map((v) => art(paintPuff(v))),
    gem: [0, 1, 2].map((t) => [0, 1].map((f) => art(paintGem(t, f)))),
    coin: [0, 1, 2, 3].map((f) => art(paintCoin(f))),
    lick: [0, 1, 2].map((f) => art(paintLick(f))),
    dot: art(paintDot()),
    daze: art(paintDaze()),
    sweat: art(paintSweat()),
    wade: [0, 1].map((f) => art(paintWade(f))),
    player: [0, 1, 2, 3].map((f) => {
      const [x0, y0, x1, y1] = PLAYER_BOX
      const cv = mkCanvas((x1 - x0) * RES, (y1 - y0) * RES), ctx = cv.getContext('2d')
      ctx.scale(RES, RES); ctx.translate(-x0, -y0); paintPlayer(ctx, f)
      return { tex: canvasTex(cv), key: canvasTex(keyline(f)), ax: -x0 / (x1 - x0), ay: -y0 / (y1 - y0) }
    }),
  }

  // one growable pool of plain sprites per thing drawn
  const pool = (parent) => {
    const list = []
    let n = 0
    return {
      begin() { n = 0 },
      next(t) {
        let s = list[n]
        if (!s) { s = new Sprite(t.tex); parent.addChild(s); list.push(s) }
        n++
        if (s.texture !== t.tex) s.texture = t.tex
        s.anchor.set(t.ax ?? 0.5, t.ay ?? 0.5)
        s.visible = true; s.alpha = 1; s.tint = 0xffffff; s.rotation = 0; s.scale.set(1)
        return s
      },
      end() { for (let i = n; i < list.length; i++) list[i].visible = false },
      hide() { n = 0; this.end() },
    }
  }
  const pickLayer = new Container()
  under.addChild(pickLayer)
  const playerLayer = new Container(), shotLayer = new Container(), fxLayer = new Container()
  const playerFx = new Container()
  over.addChild(fxLayer, playerLayer, playerFx, shotLayer)
  const gems = pool(pickLayer), coins = pool(pickLayer)
  const dazes = pool(playerFx)
  const shots = pool(shotLayer), forks = pool(shotLayer), puffs = pool(shotLayer), wades = pool(fxLayer), pwade = pool(playerFx), licks = pool(fxLayer), sweats = pool(fxLayer), burns = pool(fxLayer)
  const playerKey = new Sprite(T.player[0].key)
  playerKey.anchor.set(T.player[0].ax, T.player[0].ay)
  playerKey.alpha = 1
  const playerSprite = new Sprite(T.player[0].tex)
  playerSprite.anchor.set(T.player[0].ax, T.player[0].ay)
  playerLayer.addChild(playerKey, playerSprite)

  // THE FLOOR: chunk meshes, each with its own height texture, sharing one uniform group, the noise
  // texture the watercolour is painted with, and the atlas of the shore's bubbles
  const floorU = new UniformGroup({
    uLine: { value: 0, type: 'f32' }, uSwell: { value: 0, type: 'f32' }, uTime: { value: 0, type: 'f32' },
    uPulse: { value: 0, type: 'f32' }, uTexel: { value: 1 / CHUNK_N, type: 'f32' }, uStep: { value: CHUNK_STEP, type: 'f32' },
    uUVW: { value: (1 - 1 / CHUNK_N) / CHUNK, type: 'f32' }, uLo: { value: 0.3, type: 'f32' }, uHi: { value: 0.8, type: 'f32' },
    uFlood: { value: -1, type: 'f32' }, uWet: { value: -1, type: 'f32' }, uWetK: { value: 0, type: 'f32' },
  })
  const noiseSrc = new BufferImageSource({ resource: bakeNoise(), width: NOISE_N, height: NOISE_N, format: 'rgba8unorm', scaleMode: 'linear', addressMode: 'repeat', alphaMode: 'no-premultiply-alpha' })
  const bubSrc = new CanvasSource({ resource: paintBubbleAtlas(), scaleMode: 'linear', mipmapFilter: 'linear', autoGenerateMipmaps: true })
  const chunks = new Map()   // 'i,j' -> { mesh, tex, props: [...] }
  let chunkKey = null
  function dropChunk(k) {
    const c = chunks.get(k)
    if (c) { c.mesh.destroy(); c.tex.destroy(true) }
    chunks.delete(k)
  }
  function bakeChunk(L, seed, i, j) {
    // raw bytes, never a canvas: a canvas upload may be colour-managed, which bends the heights
    const data = new Uint8Array(CHUNK_N * CHUNK_N * 4)
    const x0 = i * CHUNK, y0 = j * CHUNK
    for (let b = 0; b < CHUNK_N; b++) for (let a = 0; a < CHUNK_N; a++) {
      // 16 bits of height: high byte in r, low byte in g (linear in both, so it interpolates exactly)
      const v = Math.max(0, Math.min(65535, Math.round(mantleHeightAt(L, seed, x0 + a * CHUNK_STEP, y0 + b * CHUNK_STEP) * 65535)))
      const o = (b * CHUNK_N + a) * 4
      data[o] = v >> 8; data[o + 1] = v & 255; data[o + 2] = 0; data[o + 3] = 255
    }
    const tex = new Texture({ source: new BufferImageSource({ resource: data, width: CHUNK_N, height: CHUNK_N, format: 'rgba8unorm', scaleMode: 'linear', alphaMode: 'no-premultiply-alpha' }) })
    // texel centres: sample a lands exactly on world x0 + a * CHUNK_STEP, so neighbours share an edge
    const u0 = 0.5 / CHUNK_N, u1 = 1 - 0.5 / CHUNK_N
    const mesh = new Mesh({
      geometry: new MeshGeometry({
        positions: new Float32Array([x0, y0, x0 + CHUNK, y0, x0 + CHUNK, y0 + CHUNK, x0, y0 + CHUNK]),
        uvs: new Float32Array([u0, u0, u1, u0, u1, u1, u0, u1]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      }),
      shader: Shader.from({ gl: { vertex: FLOOR_VERT, fragment: FLOOR_FRAG, name: 'toon-floor' }, resources: { floorU, uHeight: tex.source, uNoise: noiseSrc, uBub: bubSrc } }),
    })
    floor.addChild(mesh)
    chunks.set(i + ',' + j, { mesh, tex })
  }

  // THE FILM: one filter over the stage
  const filmU = new UniformGroup({
    uTime: { value: 0, type: 'f32' }, uGrain: { value: 0.08, type: 'f32' }, uVignette: { value: 0.55, type: 'f32' },
    uFlicker: { value: 0.035, type: 'f32' }, uSepia: { value: 0.22, type: 'f32' }, uWeave: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
    uPx: { value: 1, type: 'f32' },
  })
  // at the screen's own resolution and antialiasing: a filter otherwise draws the whole stage at 1x into
  // a plain texture, which blurs the cast on a 2x phone and steps every inked ring into jaggies
  const film = new Filter({ glProgram: GlProgram.from({ vertex: FILM_VERT, fragment: FILM_FRAG, name: 'toon-film' }), resources: { filmU }, resolution: 'inherit', antialias: 'inherit' })

  // THE WORLD IS PAINTED AT 1x, THE CAST AT THE SCREEN'S OWN RESOLUTION: the floor (a soft watercolour,
  // the costliest shader here) goes through a plain pass at resolution 1, so a 2x phone pays for its
  // pixels once and the cast keeps its crisp ink over it, the way mock f has the world soft and the
  // cast sharp
  const floorPass = new AlphaFilter({ alpha: 1, resolution: 1 })
  // ?debug: the floor's and the film's uniforms and the baked chunks, for a probe scene to read or tweak
  if (typeof window !== 'undefined' && /[?&]debug/.test(window.location?.search ?? '')) window.__toon = { floorU, filmU, chunks }
  let floodLine = -1
  let look = null, pulse = 0, t = 0, prevX = null, prevY = 0
  // the tide's memory: the highest line the last flood reached, and how fresh the rock it left is
  let wetLine = -1, wetK = 0, maxLine = -1, levelsKey = null
  const r = {
    // render.js layers this chapter draws itself (render.js's TOON_HIDEABLE names)
    hide: ['floor', 'dust', 'gems', 'coins', 'bullets', 'boomerangs', 'novas', 'player', 'obstacles', 'vignette', 'shadows'],
    enter(run, lk) {
      look = lk
      filmU.uniforms.uGrain = lk.grain ?? 0.08
      filmU.uniforms.uVignette = lk.vignette ?? 0.55
      filmU.uniforms.uFlicker = lk.flicker ?? 0.035
      filmU.uniforms.uSepia = lk.sepia ?? 0.22
      wetLine = -1; wetK = 0; maxLine = -1; levelsKey = null
      for (const k of [...chunks.keys()]) dropChunk(k)
      chunkKey = null
      floor.visible = under.visible = over.visible = true
      floor.filters = [floorPass]
    },
    exit() {
      look = null
      floor.filters = null
      for (const k of [...chunks.keys()]) dropChunk(k)
      for (const p of [dazes, gems, coins, shots, forks, puffs, wades, pwade, licks, sweats, burns]) p.hide()
      wetLine = -1; wetK = 0; maxLine = -1
    },
    filters() { return [film] },
    // view = { left, top, right, bottom, zoom, w, h, animT }
    sync(run, dt, view) {
      if (!look) return
      t = view.animT
      CLOCK.t = t
      // the world's and the film's clock: the sim's own time (it runs with the game, stops when it is
      // paused), so the lava churns and every speck of dust, hair and scratch lands somewhere new
      const clock = run.time ?? t
      const tide = lavaTideOf(run) ?? { L: DRY_GROUND, T: { seed: 0, line: -1, swell: 0 } }
      const p = run.player
      const pad = 160
      const onScreen = (x, y, rr = 0) => x + rr > view.left - pad && x - rr < view.right + pad && y + rr > view.top - pad && y - rr < view.bottom + pad
      // the floor: bake the chunks the view needs (every one in view now, two of the margin a frame)
      {
        const { L, T: TD } = tide
        const key = TD.seed + '/' + L.wave + '/' + L.ridgeWave + '/' + L.ridgeMix
        if (key !== chunkKey) { for (const k of [...chunks.keys()]) dropChunk(k); chunkKey = key }
        const vi0 = Math.floor(view.left / CHUNK), vi1 = Math.floor(view.right / CHUNK)
        const vj0 = Math.floor(view.top / CHUNK), vj1 = Math.floor(view.bottom / CHUNK)
        let budget = 2
        for (let j = vj0 - 1; j <= vj1 + 1; j++) for (let i = vi0 - 1; i <= vi1 + 1; i++) {
          if (chunks.has(i + ',' + j)) continue
          const inView = i >= vi0 && i <= vi1 && j >= vj0 && j <= vj1
          if (!inView && budget-- <= 0) continue
          bakeChunk(L, TD.seed, i, j)
        }
        for (const [k, c] of chunks) {
          const [a, b] = k.split(',').map(Number)
          if (a < vi0 - 3 || a > vi1 + 3 || b < vj0 - 3 || b > vj1 + 3) dropChunk(k)
          else c.mesh.visible = a >= vi0 - 1 && a <= vi1 + 1 && b >= vj0 - 1 && b <= vj1 + 1
        }
        pulse = Math.max(0, pulse - dt * 1.6)
        const u = floorU.uniforms
        // the ground's tones are absolute (pale hills, dark basins): its quantiles, once per spec
        const lk2 = L.wave + '/' + L.ridgeWave + '/' + L.ridgeMix + '/' + L.floodCover
        if (lk2 !== levelsKey) {
          levelsKey = lk2
          u.uLo = lavaLineFor(L, L.ebbCover ?? 0.1); u.uHi = lavaLineFor(L, 0.985)
          floodLine = TD.line < 0 && !run.lavaTide ? -1 : lavaLineFor(L, L.floodCover)
        }
        if (TD.line > maxLine) maxLine = TD.line
        // the drain: rock the lava has just left stays wet for a while after the flood
        const ph = run.lavaTide?.phase
        if (ph === 'flood' || ph === 'falling') { wetLine = Math.max(wetLine, TD.line); wetK = 1 }
        else { wetK = Math.max(0, wetK - dt / 9); if (wetK === 0) wetLine = -1 }
        u.uLine = TD.line; u.uSwell = TD.swell; u.uTime = clock; u.uPulse = pulse
        u.uFlood = run.lavaTide ? Math.max(floodLine, maxLine) : -1
        u.uWet = wetLine; u.uWetK = wetK
      }
      // pickups: gems bob, coins spin
      gems.begin()
      let ng = 0
      for (const g of run.gems ?? []) {
        if (!onScreen(g.x, g.y) || ng++ > 500) continue
        const tier = gemTier(g.xp ?? 1, run)
        const s = gems.next(T.gem[Math.min(2, tier)][fi(t * 1.5 + (g.x + g.y) * 0.003, 5) === 0 ? 1 : 0])
        s.position.set(g.x, g.y - Math.abs(Math.sin(t * 3 + g.x * 0.05)) * 3)
      }
      gems.end()
      coins.begin()
      let nc = 0
      for (const c of run.coins ?? []) {
        if (!onScreen(c.x, c.y) || nc++ > 300) continue
        const s = coins.next(T.coin[fi(t * 8 + c.x * 0.1, 4)])
        s.position.set(c.x, c.y)
      }
      coins.end()
      // flames licking off every walking body standing in the lava (the lava burns it)
      wades.begin(); pwade.begin(); licks.begin(); sweats.begin()
      if (tide.T.line > 0) {
        const { L, T: TD } = tide
        for (const e of run.enemies) {
          if (e._dead || (e.flags && e.flags.includes('flying')) || !onScreen(e.x, e.y, 40)) continue
          if (mantleHeightAt(L, TD.seed, e.x, e.y) >= TD.line) continue
          // it wades: the lava closes over its legs
          const wd = wades.next(T.wade[fi(t * 3 + e.id * 0.5, 2)])
          wd.position.set(e.x, e.y + e.radius * 0.62)
          wd.scale.set(e.radius / 11.5)
          const n = e.radius > 20 ? 3 : 2
          for (let k = 0; k < n; k++) {
            const s = licks.next(T.lick[fi(t * 9 + e.id + k, 3)])
            const a = (k / n) * TAU + e.id
            s.position.set(e.x + Math.cos(a) * e.radius * 0.7, e.y + e.radius * 0.6 + Math.sin(a) * e.radius * 0.3)
            s.scale.set(Math.max(0.7, e.radius / 16))
          }
          // and it sweats: two drops flying off, the panic of a body in the lava
          for (let k = 0; k < 2; k++) {
            const ph2 = (t * 1.6 + e.id * 0.37 + k * 0.5) % 1
            const s = sweats.next(T.sweat)
            const sg = k ? 1 : -1
            s.position.set(e.x + sg * e.radius * (0.8 + ph2 * 0.6), e.y - e.radius * (0.9 + ph2 * 0.5) + ph2 * ph2 * 10)
            s.rotation = sg * 0.6; s.alpha = 1 - ph2
          }
        }
        if (mantleHeightAt(L, TD.seed, p.x, p.y) < TD.line) {
          const wd = pwade.next(T.wade[fi(t * 3, 2)])
          wd.position.set(p.x, p.y + 17)
          wd.scale.set(1.45)
          for (let k = 0; k < 4; k++) {
            const s = licks.next(T.lick[fi(t * 9 + k, 3)])
            const a = (k / 4) * TAU + t * 2
            s.position.set(p.x + Math.cos(a) * 15, p.y + 20 + Math.sin(a) * 5)
            s.scale.set(1.3)
          }
        }
      }
      wades.end(); pwade.end(); licks.end(); sweats.end()
      // a body set alight (the elemental contract field ignite): inked flames lick up off its two
      // flanks, never over its face
      burns.begin()
      for (const e of run.enemies) {
        if (e._dead || !((e.ignite || 0) > 0) || !onScreen(e.x, e.y, 40)) continue
        for (const k of [-1, 1]) {
          const s = burns.next(T.lick[fi(t * 10 + e.id + (k > 0 ? 1 : 0), 3)])
          s.position.set(e.x + k * e.radius * 1.15, e.y + e.radius * 0.5)
          s.scale.set(Math.max(0.75, e.radius / 13) * (k > 0 ? -1 : 1), Math.max(0.75, e.radius / 13))
        }
      }
      burns.end()
      // the player: walks while moving, blinks white for the moment after a hit
      const moving = prevX !== null && Math.hypot(p.x - prevX, p.y - prevY) > 0.2
      prevX = p.x; prevY = p.y
      const inv = p.invuln ?? 0
      const pf = T.player[moving ? fi(t * 8, 4) : 0]
      // hurt: the old cartoon way, never a fade. For the first moment of the sim's invulnerability
      // clock the digger's paper margin blinks dark (never a tint on the body), and for all of it a ring of little
      // inked stars spins round its hat — solid and readable over the crowd, and plainly "hit"
      const hurt = inv > 0.4 && Math.floor(inv * 14) % 2 === 0
      if (playerSprite.texture !== pf.tex) playerSprite.texture = pf.tex
      if (playerKey.texture !== pf.key) playerKey.texture = pf.key
      // no tint (a red-tinted digger melts into the imps): the hit shows as the paper margin blinking
      playerKey.tint = hurt ? 0x2a1c18 : 0xffffff
      dazes.begin()
      if (inv > 0) for (let k = 0; k < 3; k++) {
        const a = t * 7 + (k / 3) * TAU
        const s = dazes.next(T.daze)
        s.position.set(p.x + Math.cos(a) * 15, p.y - 22 + Math.sin(a) * 5)
        s.rotation = t * 5 + k
      }
      dazes.end()
      for (const s of [playerKey, playerSprite]) {
        s.anchor.set(pf.ax, pf.ay)
        s.position.set(p.x, p.y)
        s.scale.set(p.facing < 0 ? -1 : 1, 1)
      }
      // shots: matches and coals, and a plain inked bead for anything else
      shots.begin()
      for (const b of run.bullets ?? []) {
        if (!onScreen(b.x, b.y)) continue
        const tk = b.weapon === 'match' ? T.match[fi(t * 12 + b.x, 3)] : b.weapon === 'coal' ? T.coal[fi(t * 8, 2)] : T.dot
        const s = shots.next(tk)
        s.position.set(b.x, b.y)
        if (b.weapon === 'match') s.rotation = Math.atan2(b.vy, b.vx)
        else if (b.weapon === 'coal') s.rotation = t * 9 + (b.x + b.y) * 0.01
      }
      shots.end()
      forks.begin()
      for (const b of run.boomerangs ?? []) {
        if (!onScreen(b.x, b.y)) continue
        const s = forks.next(T.fork)
        s.position.set(b.x, b.y)
        // it tumbles as it flies
        s.rotation = (b.angle ?? 0) + t * 14
        s.scale.set((b.hitR ?? 18) / 18)
      }
      forks.end()
      // novas: the whistle's steam ring is a ring of puffs; any other ring is a thinner one
      puffs.begin()
      for (const n of run.novas ?? []) {
        if (!onScreen(n.x, n.y, n.maxR)) continue
        const k = 1 - Math.max(0, n.life / (n.lifeMax || 1))
        const R = Math.max(6, n.r || n.maxR * k)
        const steam = n.look === 'steam'
        const cnt = Math.max(8, Math.min(40, Math.round((R * TAU) / (steam ? 26 : 40))))
        for (let i = 0; i < cnt; i++) {
          const a = (i / cnt) * TAU + (n.x * 0.01)
          const s = puffs.next(T.puff[i % 3])
          s.position.set(n.x + Math.cos(a) * R, n.y + Math.sin(a) * R)
          s.alpha = steam ? 1 - k * k : 0.6 * (1 - k)
          s.scale.set(steam ? 0.9 + 0.5 * k : 0.6)
        }
      }
      puffs.end()
      // the film's clock and its gate weave
      filmU.uniforms.uTime = clock
      const wv = filmU.uniforms.uWeave
      wv[0] = Math.sin(t * 1.7) * (look.weave ?? 0.6) * 0.6; wv[1] = Math.sin(t * 2.3 + 1) * (look.weave ?? 0.6)
    },
    // A sim event drawn here. Returns true when fully handled (render.js then skips it).
    event(e) {
      if (!look) return false
      if (e.type === 'tideTurn') { pulse = 1; return true }
      return false
    },
  }
  return r
}
