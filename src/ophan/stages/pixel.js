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
const SEED = +(new URLSearchParams(globalThis.location?.search).get('seed') ?? 0.73)   // run._driftSeed: picks the floor (rivers, cooled flows, hot ground)

export default function stage(app, { W, H }) {
  globalThis.PIXEL_ART_PX = PX / 2 * app.renderer.resolution   // device px per boss art pixel: the mock-up paints the Ophan on a grid twice as fine as the world (src2.html lowF)
  const look = CHAPTERS.magma.render.pixel
  const rig = createPixelRig({ app, addShake() {} })
  rig.enable(look)
  const world = new Container()
  // render.js's floor scatter (midLayer/detailLayer) is not importable: a hash scatter of the game's own baked
  // props (PIXEL.bakeProps + BIOME sizes) stands in for it
  const T = bakeProps(), props = new Container()
  const G = 150
  for (let gx = Math.floor((P0.x - W) / G); gx <= (P0.x + W) / G; gx++) for (let gy = Math.floor((P0.y - H) / G); gy <= (P0.y + H) / G; gy++) {
    const h = hash(gx, gy, 901)
    const set = h < 0.03 ? BIOME.big : h < 0.12 ? BIOME.mid : h < 0.32 ? BIOME.detail : null
    if (!set) continue
    const d = set[Math.floor(hash(gx, gy, 902) * set.length)], t = T[d.name]
    const s = new Sprite(t.tex)
    s.anchor.set(t.ax, t.ay)
    s.position.set(Math.round((gx + hash(gx, gy, 903)) * G / 2) * 2, Math.round((gy + hash(gx, gy, 904)) * G / 2) * 2)
    const sz = d.size[0] + (d.size[1] - d.size[0]) * hash(gx, gy, 905)
    s.scale.set(sz / Math.max(t.w, t.h))
    props.addChild(s)
  }
  const boss = new Container()
  boss.position.set(P0.x - W / 2, P0.y - H / 2)   // boss-local coords = stage px
  world.addChild(rig.floor, props, rig.ground, boss, rig.air)
  app.stage.addChild(world)
  app.stage.filterArea = app.screen
  app.stage.filters = [rig.filter]

  // the crust the chapter always shows round a moving player: a trail of open lava on hot ground and fresh
  // cracks warming to open (their life is pinned, so a frozen ?t= frame holds them)
  const L = (dx, dy, r = 49) => ({ x: P0.x + dx, y: P0.y + dy, r, state: 'lava', openAt: -1e9, lavaEnd: 1e9 })
  const C = (dx, dy, k, r = 34) => ({ x: P0.x + dx, y: P0.y + dy, r, state: 'crack', left: 0.9 * (1 - k), t: 0.9 * k })
  const cracks = [L(110, 0), L(135, -70), L(155, -145), L(180, -225), L(200, -300), L(220, -380),
    C(70, -195, 0.3), C(150, -385, 0.6), C(140, 255, 0.1), C(-60, 330, 0.85, 30)]
  const run = { chapter: 'magma', _driftSeed: SEED, time: 0, player: { x: P0.x, y: P0.y, facing: 1 }, cracks, enemies: [], slagPools: [], magmaLobs: [], novas: [] }
  let last = null
  return {
    boss,
    update(t) {
      const dt = last === null ? 1 / 60 : Math.max(0, Math.min(0.1, t - last))
      last = t
      run.time = t
      for (const c of cracks) if (c.state === 'crack') c.openAt = t + c.left
      // render.js ~33226: z = camZoom() (magma has no viewW -> 1), cx = viewW()/2 - player.x
      const z = 1, cx = W / 2 - P0.x, cy = H / 2 - P0.y
      world.scale.set(z)
      world.position.set(cx * z, cy * z)
      rig.sync(run, dt, { cx, cy, z, w: W / z, h: H / z, animT: t })
    },
    setPass(on) { app.stage.filters = on ? [rig.filter] : null },
  }
}
