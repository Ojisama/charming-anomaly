// The Magma (pixel): the game's own rig (PIXEL.createPixelRig) and CRT pass, driven as render.js does: setPixel
// (render.js ~13298: app.stage.filterArea = app.screen, app.stage.filters = [rig.filter]) and the per-frame
// pixelRig.sync(run, dt, { cx, cy, z, w, h, animT }) (render.js ~33312). There is NO low-res render target: the
// world is drawn at full res and CRT_FRAG snaps every art pixel (uPx = PX * z) inside the full-screen pass, so the
// boss is pixelated, lit and scanlined exactly like a creature as long as it is under app.stage. It sits where
// enemyLayer does in render.js ~14151: after pixelRig.ground, before pixelRig.air.
// CHAPTERS.magma.render.pixel only switches the look on (crt.js: its numbers are not read; CRT_LOOK is).
import { Container, Sprite } from 'pixi.js'
import { PX } from '../../pixel/canvas.js'
import { createPixelRig, bakeProps, BIOME, hash } from '../../pixel.js'
import { CHAPTERS } from '../../config.js'

// the player stands here in world px (camera centred on it), clear of spawnClear so the ground patches show
const P0 = { x: 1400, y: 900 }
const SEED = 0.73   // run._driftSeed: picks the floor (rivers, cooled flows, hot ground)

export default function stage(app, { W, H }) {
  globalThis.PIXEL_ART_PX = PX / 2 * app.renderer.resolution   // device px per boss art pixel: the mock-up paints the Ophan on a grid twice as fine as the world (src2.html lowF)
  const look = CHAPTERS.magma.render.pixel
  const rig = createPixelRig({ app, addShake() {} })
  rig.enable(look)
  const world = new Container()
  // render.js's floor scatter (midLayer/detailLayer) is not importable: a hash scatter of the game's own baked
  // props (PIXEL.bakeProps + BIOME sizes) stands in for it, one cell of G px at a time round the camera
  const T = bakeProps(), props = new Container(), G = 150
  const prop = (gx, gy) => {
    const h = hash(gx, gy, 901)
    const set = h < 0.03 ? BIOME.big : h < 0.12 ? BIOME.mid : h < 0.32 ? BIOME.detail : null
    if (!set) return null
    const d = set[Math.floor(hash(gx, gy, 902) * set.length)], t = T[d.name]
    const s = new Sprite(t.tex)
    s.anchor.set(t.ax, t.ay)
    s.position.set(Math.round((gx + hash(gx, gy, 903)) * G / 2) * 2, Math.round((gy + hash(gx, gy, 904)) * G / 2) * 2)
    const sz = d.size[0] + (d.size[1] - d.size[0]) * hash(gx, gy, 905)
    s.scale.set(sz / Math.max(t.w, t.h))
    return props.addChild(s)
  }
  const boss = new Container()
  boss.position.set(P0.x - W / 2, P0.y - H / 2)   // boss-local coords = stage px
  world.addChild(rig.floor, props, rig.ground, boss, rig.air)
  app.stage.addChild(world)
  app.stage.filterArea = app.screen
  app.stage.filters = [rig.filter]

  // the crust the chapter always shows round a moving player: a trail of open lava on hot ground and fresh
  // cracks warming to open (their life is pinned, so a frozen ?t= frame holds them). The set is the reference frame's,
  // round P0; the open floor repeats it in cells of CT px, each copy left out, shifted up to CJ px, turned and mirrored by
  // its cell's hash, so two copies in one desktop frame (CT is under a desktop stage's width) never read as the same trail
  const CT = 1100, CJ = 200
  const crust = (ox, oy, m, a = 0) => {
    const cs = Math.cos(a), sn = Math.sin(a), at = (dx, dy) => ({ x: ox + cs * m * dx - sn * dy, y: oy + sn * m * dx + cs * dy })
    const L = (dx, dy, r = 49) => ({ ...at(dx, dy), r, state: 'lava', openAt: -1e9, lavaEnd: 1e9 })
    const C = (dx, dy, k, r = 34) => ({ ...at(dx, dy), r, state: 'crack', left: 0.9 * (1 - k), t: 0.9 * k })
    return [L(110, 0), L(135, -70), L(155, -145), L(180, -225), L(200, -300), L(220, -380),
      C(70, -195, 0.3), C(150, -385, 0.6), C(140, 255, 0.1), C(-60, 330, 0.85, 30)]
  }
  const run = { chapter: 'magma', _driftSeed: SEED, time: 0, player: { x: P0.x, y: P0.y, facing: 1 }, cracks: [], enemies: [], slagPools: [], magmaLobs: [], novas: [] }
  // the cells round the camera, built once each: a prop per G cell, a crust copy per CT cell; win is the last window
  const cells = new Map(), crusts = new Map()
  let win = ''
  const around = (P) => {
    const k = Math.floor(P.x / G) + ',' + Math.floor(P.y / G)
    if (k === win) return
    win = k
    const keep = new Set()
    for (let gx = Math.floor((P.x - W / 2) / G) - 1; gx <= (P.x + W / 2) / G + 1; gx++) for (let gy = Math.floor((P.y - H / 2) / G) - 1; gy <= (P.y + H / 2) / G + 1; gy++) {
      const c = gx + ',' + gy
      keep.add(c)
      if (!cells.has(c)) cells.set(c, prop(gx, gy))
    }
    for (const [c, s] of cells) if (!keep.has(c)) { s?.destroy(); cells.delete(c) }
    run.cracks.length = 0
    const keepC = new Set()
    const mx = W / 2 + CJ + 500, my = H / 2 + CJ + 500   // a copy reaches CJ + ~400 px off its cell's corner
    for (let i = Math.floor((P.x - P0.x - mx) / CT); i <= Math.ceil((P.x - P0.x + mx) / CT); i++) for (let j = Math.floor((P.y - P0.y - my) / CT); j <= Math.ceil((P.y - P0.y + my) / CT); j++) {
      const c = i + ',' + j, home = !i && !j, jit = (s) => (home ? 0 : (hash(i, j, s) * 2 - 1) * CJ)
      keepC.add(c)
      if (!crusts.has(c)) crusts.set(c, home || hash(i, j, 906) < 0.55 ? crust(P0.x + i * CT + jit(908), P0.y + j * CT + jit(909), home || hash(i, j, 907) < 0.5 ? 1 : -1, home ? 0 : hash(i, j, 910) * Math.PI * 2) : [])
      run.cracks.push(...crusts.get(c))
    }
    for (const c of crusts.keys()) if (!keepC.has(c)) crusts.delete(c)
  }
  let last = null
  return {
    boss,
    // pan: the stage px the camera has moved off the world's origin. The world stays put (the boss container in it keeps
    // stage px) and its layers scroll by pan; the rig's camera is the panned one
    update(t, { pan = { x: 0, y: 0 } } = {}) {
      const dt = last === null ? 1 / 60 : Math.max(0, Math.min(0.1, t - last))
      last = t
      run.time = t
      const P = { x: P0.x + pan.x, y: P0.y + pan.y }
      around(P)
      run.player.x = P.x; run.player.y = P.y
      for (const c of run.cracks) if (c.state === 'crack') c.openAt = t + c.left
      // render.js ~33226: z = camZoom() (magma has no viewW -> 1), cx = viewW()/2 - player.x
      const z = 1, cx = W / 2 - P.x, cy = H / 2 - P.y
      world.scale.set(z)
      world.position.set((W / 2 - P0.x) * z, (H / 2 - P0.y) * z)
      for (const l of [rig.floor, props, rig.ground, rig.air]) l.position.set(-pan.x, -pan.y)
      rig.sync(run, dt, { cx, cy, z, w: W / z, h: H / z, animT: t })
    },
    // the ground chunks round where pan will look, baked without a draw until performance.now() reaches until (renderer.js)
    prebake(pan, until) { return rig.prebake(run, { cx: W / 2 - P0.x - pan.x, cy: H / 2 - P0.y - pan.y, w: W, h: H }, until) },
  }
}
