// The final phase (the Sketch): no game chapter has this look, so the floor is the mock-up's own paper, baked once from
// OPHAN.pencil.bg into a tile. No pass.
import { Texture, CanvasSource, TilingSprite, Container } from 'pixi.js'
import { OPHAN } from '../page.js'

export default function stage(app, { W, H }) {
  const res = app.renderer.resolution, w = 390, cv = document.createElement('canvas')
  cv.width = cv.height = w * res
  const g = cv.getContext('2d'); g.setTransform(res, 0, 0, res, 0, 0); OPHAN.pencil.bg(g, w, 0)
  const tex = new Texture({ source: new CanvasSource({ resource: cv, resolution: res }) })
  tex.source.style.addressMode = 'repeat'
  const floor = new TilingSprite({ texture: tex, width: W, height: H }), boss = new Container()
  app.stage.addChild(floor, boss)
  return { boss, update() {}, setPass() {} }
}
