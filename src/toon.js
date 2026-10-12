// THE MANTLE, AS A 1930s RUBBER-HOSE CARTOON SEEN FROM ABOVE (CHAPTERS.mantle.render.toon).
// Render-only, like macro.js, pixel.js and ascii.js: it reads `run`, never writes it.
//
// EVERY VISUAL OF THE MANTLE IS DECIDED IN THIS FILE AND IN src/toon/*. render.js only calls in while
// CHAPTERS[run.chapter].render.toon is set, and draws nothing of the chapter's own:
//   src/toon/palette.js   PAL (the palette), the brush (inkShape, hose, pieEye, flame, ...)
//   src/toon/cast.js      TOON_CAST (the four creatures) and paintPlayer
//   src/toon/world.js     the floor shader (height, lava, shore, swell), the film pass, props, shots,
//                         pickups
//
// ==== THE SURFACE render.js USES ===================================================================
//   TOON_CAST                 { [rosterId]: entry } — the creatures this module draws.
//   bakeCreature(id, elite)   -> { frames: [{ canvas, white, ax, ay, res }], thumb, baseR, lean,
//                             upright, poseOf, faceDir, turnRate } — render.js's enemy pool draws the
//                             creatures from these (mirrored to face their way, never turned), and
//                             scripts/bake-cast.mjs writes `thumb` to src/cast/<id>.png.
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
import { BufferImageSource, CanvasSource, Container, Filter, GlProgram, Mesh, MeshGeometry, Shader, Sprite, Texture, UniformGroup } from 'pixi.js'
import { PAL, TAU, mkCanvas, hash, whiteTwin } from './toon/palette.js'
import { TOON_CAST, paintPlayer, PLAYER_BOX } from './toon/cast.js'
import {
  CHUNK, CHUNK_STEP, CHUNK_N, FLOOR_VERT, FLOOR_FRAG, FILM_VERT, FILM_FRAG, PROP_KINDS, paintProp,
  paintMatch, paintCoal, paintPitchfork, paintPuff, paintGem, paintCoin, paintLick, paintDot,
} from './toon/world.js'
import { lavaTideOf, mantleHeightAt, lavaLineFor } from './sim.js'
import { gemTier } from './config.js'

export { TOON_CAST, PAL }

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
  const b = paintBody(id, 0, elite, 4)
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
  return { frames, thumb: paintThumb(id, elite || id === 'brimstoneDragon'), baseR: M.baseR, lean: 0, upright: false, poseOf: null, faceDir: null, turnRate: null }
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
    props: Object.fromEntries(PROP_KINDS.map((k) => [k, [0, 1, 2].map((v) => art(paintProp(k, v)))])),
    player: [0, 1, 2, 3].map((f) => {
      const [x0, y0, x1, y1] = PLAYER_BOX
      const cv = mkCanvas((x1 - x0) * RES, (y1 - y0) * RES), ctx = cv.getContext('2d')
      ctx.scale(RES, RES); ctx.translate(-x0, -y0); paintPlayer(ctx, f, true)
      return { tex: canvasTex(cv), white: canvasTex(whiteTwin(cv)), ax: -x0 / (x1 - x0), ay: -y0 / (y1 - y0) }
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
  const propLayer = new Container(), pickLayer = new Container()
  under.addChild(propLayer, pickLayer)
  const playerLayer = new Container(), shotLayer = new Container(), fxLayer = new Container()
  over.addChild(fxLayer, playerLayer, shotLayer)
  const props = pool(propLayer), gems = pool(pickLayer), coins = pool(pickLayer)
  const shots = pool(shotLayer), forks = pool(shotLayer), puffs = pool(shotLayer), licks = pool(fxLayer)
  const playerSprite = new Sprite(T.player[0].tex)
  playerSprite.anchor.set(T.player[0].ax, T.player[0].ay)
  playerLayer.addChild(playerSprite)

  // THE FLOOR: chunk meshes, each with its own height texture, sharing one uniform group
  const floorU = new UniformGroup({
    uLine: { value: 0, type: 'f32' }, uSwell: { value: 0, type: 'f32' }, uTime: { value: 0, type: 'f32' },
    uPulse: { value: 0, type: 'f32' }, uTexel: { value: 1 / CHUNK_N, type: 'f32' }, uStep: { value: CHUNK_STEP, type: 'f32' },
    uInk: { value: 4, type: 'f32' },
  })
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
      const v = Math.max(0, Math.min(255, Math.round(mantleHeightAt(L, seed, x0 + a * CHUNK_STEP, y0 + b * CHUNK_STEP) * 255)))
      const o = (b * CHUNK_N + a) * 4
      data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255
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
      shader: Shader.from({ gl: { vertex: FLOOR_VERT, fragment: FLOOR_FRAG, name: 'toon-floor' }, resources: { floorU, uHeight: tex.source } }),
    })
    floor.addChild(mesh)
    // props: a few per chunk, on ground the flood never reaches
    const dryLine = lavaLineFor(L, Math.min(0.97, L.floodCover + 0.14))
    const P = []
    for (let k = 0; k < 9; k++) {
      const px = x0 + hash(i, j, 31 + k) * CHUNK, py = y0 + hash(i, j, 57 + k) * CHUNK
      if (mantleHeightAt(L, seed, px, py) < dryLine) continue
      P.push({ x: px, y: py, kind: PROP_KINDS[Math.floor(hash(i, j, 91 + k) * PROP_KINDS.length)], v: Math.floor(hash(i, j, 13 + k) * 3), flip: hash(i, j, 7 + k) < 0.5 })
    }
    chunks.set(i + ',' + j, { mesh, tex, props: P })
  }

  // THE FILM: one filter over the stage
  const filmU = new UniformGroup({
    uTime: { value: 0, type: 'f32' }, uGrain: { value: 0.08, type: 'f32' }, uVignette: { value: 0.55, type: 'f32' },
    uFlicker: { value: 0.035, type: 'f32' }, uSepia: { value: 0.22, type: 'f32' }, uWeave: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
  })
  const film = new Filter({ glProgram: GlProgram.from({ vertex: FILM_VERT, fragment: FILM_FRAG, name: 'toon-film' }), resources: { filmU } })

  // ?debug: the floor's and the film's uniforms and the baked chunks, for a probe scene to read or tweak
  if (typeof window !== 'undefined' && /[?&]debug/.test(window.location?.search ?? '')) window.__toon = { floorU, filmU, chunks }
  let look = null, pulse = 0, t = 0, lastInvuln = 0, hitT = 0, prevX = null, prevY = 0
  const r = {
    // render.js layers this chapter draws itself (render.js's TOON_HIDEABLE names)
    hide: ['floor', 'dust', 'gems', 'coins', 'bullets', 'boomerangs', 'novas', 'player', 'obstacles', 'vignette', 'shadows'],
    enter(run, lk) {
      look = lk
      filmU.uniforms.uGrain = lk.grain ?? 0.08
      filmU.uniforms.uVignette = lk.vignette ?? 0.55
      filmU.uniforms.uFlicker = lk.flicker ?? 0.035
      filmU.uniforms.uSepia = lk.sepia ?? 0.22
      for (const k of [...chunks.keys()]) dropChunk(k)
      chunkKey = null
      floor.visible = under.visible = over.visible = true
    },
    exit() {
      look = null
      for (const k of [...chunks.keys()]) dropChunk(k)
      for (const p of [props, gems, coins, shots, forks, puffs, licks]) p.hide()
    },
    filters() { return [film] },
    // view = { left, top, right, bottom, zoom, w, h, animT }
    sync(run, dt, view) {
      if (!look) return
      t = view.animT
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
        u.uLine = TD.line; u.uSwell = TD.swell; u.uTime = t; u.uPulse = pulse
        u.uInk = 3.2 / Math.max(0.4, view.zoom)
      }
      // props on the dry ground, back to front
      props.begin()
      for (const [, c] of chunks) {
        if (!c.mesh.visible) continue
        for (const pr of c.props) {
          if (!onScreen(pr.x, pr.y, 60)) continue
          const s = props.next(T.props[pr.kind][pr.v])
          s.position.set(pr.x, pr.y)
          if (pr.flip) s.scale.x = -1
        }
      }
      props.end()
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
      licks.begin()
      if (tide.T.line > 0) {
        const { L, T: TD } = tide
        for (const e of run.enemies) {
          if (e._dead || (e.flags && e.flags.includes('flying')) || !onScreen(e.x, e.y, 40)) continue
          if (mantleHeightAt(L, TD.seed, e.x, e.y) >= TD.line) continue
          const n = e.radius > 20 ? 3 : 2
          for (let k = 0; k < n; k++) {
            const s = licks.next(T.lick[fi(t * 9 + e.id + k, 3)])
            const a = (k / n) * TAU + e.id
            s.position.set(e.x + Math.cos(a) * e.radius * 0.7, e.y + e.radius * 0.6 + Math.sin(a) * e.radius * 0.3)
            s.scale.set(Math.max(0.7, e.radius / 16))
          }
        }
        if (mantleHeightAt(L, TD.seed, p.x, p.y) < TD.line) {
          for (let k = 0; k < 4; k++) {
            const s = licks.next(T.lick[fi(t * 9 + k, 3)])
            const a = (k / 4) * TAU + t * 2
            s.position.set(p.x + Math.cos(a) * 15, p.y + 20 + Math.sin(a) * 5)
            s.scale.set(1.3)
          }
        }
      }
      licks.end()
      // the player: walks while moving, blinks white for the moment after a hit
      const moving = prevX !== null && Math.hypot(p.x - prevX, p.y - prevY) > 0.2
      prevX = p.x; prevY = p.y
      const inv = p.invuln ?? 0
      if (inv > lastInvuln + 1e-6) hitT = 0.2
      lastInvuln = inv
      hitT = Math.max(0, hitT - dt)
      const pf = T.player[moving ? fi(t * 8, 4) : 0]
      const white = hitT > 0.1
      const pt = white ? pf.white : pf.tex
      if (playerSprite.texture !== pt) playerSprite.texture = pt
      playerSprite.anchor.set(pf.ax, pf.ay)
      playerSprite.position.set(p.x, p.y)
      playerSprite.scale.set(p.facing < 0 ? -1 : 1, 1)
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
      filmU.uniforms.uTime = t
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
