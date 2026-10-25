// The final phase (the Sketch): no game chapter has this look, so the floor is the mock-up's own paper, baked once from
// OPHAN.pencil.bg into a tile. No pass.
import { Texture, CanvasSource, TilingSprite, Container } from 'pixi.js'
import { OPHAN } from '../page.js'

export default function stage(app, { W, H }) {
  // bg rules a line every 12 px from k 12 to k < w; the mock-up draws it once per tile and never repeats it. Repeated,
  // the tile must be a whole number of rules (384) with none missing at its edge: bg is drawn 6 px up and 6 px
  // taller, so the rules sit at 6, 18 .. 378 and the next tile's first one lands 12 px on
  const res = app.renderer.resolution, w = 384, cv = document.createElement('canvas')
  cv.width = cv.height = w * res
  const g = cv.getContext('2d'); g.setTransform(res, 0, 0, res, 0, -6 * res); OPHAN.pencil.bg(g, w + 6, 0)
  const tex = new Texture({ source: new CanvasSource({ resource: cv, resolution: res }) })
  tex.source.style.addressMode = 'repeat'
  const floor = new TilingSprite({ texture: tex, width: W, height: H }), boss = new Container()
  app.stage.addChild(floor, boss)
  // pan: the stage px the camera has moved off the world's origin; the paper is world-anchored and scrolls under it
  return { boss, update(t, { pan = null } = {}) { if (pan) floor.tilePosition.set(-pan.x, -pan.y) } }
}
