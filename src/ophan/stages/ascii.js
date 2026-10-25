// The Mine (ascii): the game's own src/ascii.js renderer, created and driven exactly as render.js setAscii /
// syncAscii do (render.js ~14176-14216): world-space `under` (floor, gas, drops, mob) and `over` (weapons, fx,
// numbers, the miner) inside a world container, a screen-space container above the world, black background.
// The boss container sits right above ascii's mob layer (the last child of `under`) and below `over`.
// ascii.js has NO full-screen pass (filters() returns null) and render.js hides its own vignette for this
// chapter, so the look is the glyph floor lit by the miner's lamp pool, nothing over it.
import { Container } from 'pixi.js'
import { createAsciiRenderer } from '../../ascii.js'
import { CHAPTERS } from '../../config.js'

export default function stage(app, { W, H }) {
  const look = CHAPTERS.mine.render.ascii
  app.renderer.background.color = 0x000000
  // world px == stage px: the Mine's viewZoom is 1 (no render.viewW), so the camera is a pure translation
  const world = new Container(), under = new Container(), over = new Container(), screen = new Container()
  const boss = new Container()
  world.addChild(under, boss, over)
  app.stage.addChild(world, screen)
  const R = createAsciiRenderer({ app, world, under, over, screen })
  R.enter(null, look)
  // the miner is the player: leave it out (its lamp's light on the floor stays, that is sync's light list)
  for (const c of over.children) if (c.label === 'ascii-me') c.visible = false
  const run = { chapter: 'mine', time: 0, lanternR: 0, enemies: [], gas: [], gasLit: [], booms: [], gems: [], coins: [],
    player: { x: W / 2, y: H / 2, radius: 14, facingAngle: -Math.PI / 2, vx: 0, vy: 0, maxHP: 100 } }
  const view = { left: 0, top: 0, right: W, bottom: H, zoom: 1, w: W, h: H, animT: 0 }
  let last = null
  return {
    boss,
    // the camera centres the player (render.js ~33229); here the lamp pool simply follows (px, py). pan: the stage px the
    // camera has moved off the world's origin; the glyph floor (under, over) scrolls by it and the boss container stays
    // in stage px
    update(t, { pan = { x: 0, y: 0 }, px = W / 2, py = H / 2 } = {}) {
      const dt = last == null ? t : Math.max(0, t - last)
      last = t
      under.position.set(-pan.x, -pan.y); over.position.set(-pan.x, -pan.y)
      view.left = pan.x; view.top = pan.y; view.right = pan.x + W; view.bottom = pan.y + H
      run.time = t; run.player.x = px + pan.x; run.player.y = py + pan.y; view.animT = t
      R.sync(run, dt, view)
    },
    // the glyph floor's chunks round where pan will look, baked without a draw until performance.now() reaches until (renderer.js)
    prebake: (pan, until) => R.prebake({ left: pan.x, top: pan.y, right: pan.x + W, bottom: pan.y + H, zoom: 1 }, until),
    // there is no pass to switch: the screen layer only ever carries the hurt flare
    setPass(on) { screen.visible = on },
  }
}
