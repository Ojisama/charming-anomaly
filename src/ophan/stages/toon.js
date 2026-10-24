// The Mantle (toon): the game's own renderer, src/toon.js createToonRenderer, driven the way render.js
// setToon (~14238) and syncToon (~14259, called per frame at ~33401) drive it: its chunked watercolour
// floor (FLOOR_VERT/FLOOR_FRAG) under a world container, and its FILM pass on app.stage. The boss
// container sits between the world and the film, where render.js's creatures are.
import { Container } from 'pixi.js'
import { createToonRenderer } from '../../toon.js'
import { lavaLineFor, mantleHeightAt } from '../../sim.js'
import { CHAPTERS, MANTLE_START_DRY } from '../../config.js'

export default function stage(app, { W, H }) {
  const look = CHAPTERS.mantle.render.toon, L = CHAPTERS.mantle.signature.lavaTide
  // render.js's layering: world (toonFloor, toonUnder, toonOver), then the creatures; zoom 1 (no render.viewW)
  const world = new Container(), floor = new Container(), under = new Container(), over = new Container(), screen = new Container()
  world.addChild(floor, under, over)
  const boss = new Container()
  app.stage.addChild(world, boss, screen)
  const r = createToonRenderer({ app, world, floor, under, over, screen })
  // a fake run: the player at the origin, the tide at the ebb (the reference frame, t 60, is the second ebb).
  // The seed is sim.js stepLavaTide's: lavaGroundSeed (sim.js ~18208, not exported) re-derived until the start is dry
  const p = { x: 0, y: 0, facing: 1, invuln: 0, afloat: false }
  let seed = (Math.floor(1.7 * 1e8) ^ 0x1a7a) | 0
  const dry = lavaLineFor(L, MANTLE_START_DRY)
  for (let k = 1; k <= 64 && mantleHeightAt(L, seed, p.x, p.y) < dry; k++) seed = (((Math.floor(1.7 * 1e8) ^ 0x1a7a) | 0) + Math.imul(k, 0x9e3779b1)) | 0
  const run = {
    chapter: 'mantle', time: 0, player: p, enemies: [], boats: [], lavaPools: [], novas: [], quenchCrusts: [],
    lavaTide: { level: 0, phase: 'ebb', t: 0, dur: 13, cycle: 1, swell: 0, cover: L.ebbCover, line: lavaLineFor(L, L.ebbCover), rising: false, turnIn: 13, seed },
  }
  // the player has since walked off the dry start into the lava, as in the reference (?cam=x,y to move it)
  const cam = (new URLSearchParams(location.search).get('cam') || '1800,-2400').split(',').map(Number)
  p.x = cam[0]; p.y = cam[1]
  r.enter(run, look)
  over.visible = false   // the player and shots: not this stage's job
  const film = r.filters()
  app.stage.filterArea = app.screen
  app.stage.filters = film
  let last = null
  return {
    boss,
    // the camera centred on the player (render.js: cx = viewW/2 - player.x, world at cx * z with z 1)
    update(t) {
      const dt = last === null ? 0 : Math.max(0, t - last)
      last = t
      run.time = t
      const cx = W / 2 - p.x, cy = H / 2 - p.y
      world.position.set(cx, cy)
      r.sync(run, dt, { left: -cx, top: -cy, right: -cx + W, bottom: -cy + H, zoom: 1, w: W, h: H, animT: t })
    },
    setPass(on) { app.stage.filters = on ? film : null },
  }
}
