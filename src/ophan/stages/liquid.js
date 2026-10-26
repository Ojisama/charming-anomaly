// The Core (liquid): the game's own src/liquid.js renderer (createLiquidRenderer -> src/liquid/gl.js createCoreGL on its
// own WebGL2 canvas UNDER Pixi's), driven the way render.js setLiquid / syncLiquid drive it, with a fake host and a run
// holding only the crowd's Core bodies and the player's chrome drop: no pools, no pillars. The boss container sits on
// the transparent Pixi stage, over the melt, where the game's entities draw. The melt runs on the dt update() is given.
import { Container, Sprite, Texture, CanvasSource } from 'pixi.js'
import { createLiquidRenderer } from '../../liquid.js'
import { coreOld, kOf } from '../painters/core.js'
import { CHAPTERS, viewZoom } from '../../config.js'

export default function stage(app, { W, H }) {
  const look = CHAPTERS.core.render.liquid
  const z = viewZoom(CHAPTERS.core.render, app.screen.width)   // render.js chapterZ (camZoom with no fight/punch)
  const world = new Container(), floor = new Container(), under = new Container(), over = new Container(), boss = new Container()
  app.stage.addChild(world, boss)
  world.addChild(floor, under, over)
  world.scale.set(z)
  const R = createLiquidRenderer({ app, world, floor, under, over })
  // createLiquidRenderer put its canvas before app.canvas: the host places and sizes it over the stage's box
  const glc = app.canvas.previousSibling
  glc.style.width = W + 'px'; glc.style.height = H + 'px'
  // the camera sits on the world origin; with no player handed in it is dead so gl.js draws no drop (S.p.R = 0) and parked
  // far off screen, or the floor shader's dimple under it (uPl) shows as a bead in mid-screen with nothing on it. Pole North.
  const run = { chapter: 'core', time: 0, player: { x: 0, y: 1e5, dead: true, invuln: 0 }, polarity: { pole: 1 },
    enemies: [], obstacles: [], corePools: [], moons: [], lodestones: [] }
  R.enter(run, look)
  // The game's Pixi context is created with backgroundAlpha 0 (main.js ~143) so the canvas under it shows through.
  // An Application made opaque (alpha false) can never turn transparent: then the melt canvas goes INTO Pixi as the
  // bottom sprite, re-uploaded after every gl.js frame (same pixels, one texture copy per frame).
  let melt = null, last = null
  // the crowd's Core bodies as gl.js reads them: the Core roster's flags (kindOf picks a body's shape by them; the Ophan
  // roster strips them) and a pole, the body's own or alternating by id. One clone per body, kept while it lives; LIVE are
  // the body's fields liquid.js reads for its look, refreshed every frame with its place
  const FLAGS = Object.fromEntries(CHAPTERS.core.roster.map((r) => [r.id, r.flags]))
  const LIVE = ['stunT', 'spike', 'hx', 'hy', 'hp', 'maxHP', '_pph']
  const clones = new WeakMap()
  const api = {
    boss,
    glc,
    // cam: the game camera's move off the arena's rest framing, in stage px (zr its zoom ratio, ex/ey its offset), so the
    // melt moves with the Pixi layers the host transforms the same way
    // crowd: the bodies of this world, { e, x, y, r } in stage px, the first crowdN of it live
    // pan: the stage px the camera has moved off the world's origin; the melt is world-anchored and scrolls under it
    // player: the fight's own at (px, py) stage px and pr px round, gl.js's chrome drop (null: dead and parked, no drop)
    update(t, { pan = { x: 0, y: 0 }, cam = null, crowd = null, crowdN = 0, px = 0, py = 0, pr = 0, player = null } = {}) {
      const dt = last === null ? 0 : Math.max(0, t - last)
      last = t
      run.time = t
      const zr = cam ? cam.zr : 1, zz = z * zr, w = app.screen.width / zz, h = app.screen.height / zz
      const left = (pan.x - app.screen.width / 2) / z - (cam ? cam.ex : 0) / zz, top = (pan.y - app.screen.height / 2) / z - (cam ? cam.ey : 0) / zz
      if (player) Object.assign(run.player, player, { x: left + px / zz, y: top + py / zz, _drawR: pr / zz })
      else Object.assign(run.player, { x: 0, y: 1e5, dead: true })
      run.enemies.length = 0
      for (let i = 0; i < crowdN; i++) {
        const { e, x, y, r } = crowd[i]
        let c = clones.get(e)
        if (!c) clones.set(e, (c = { ...e, flags: FLAGS[e.rosterId] ?? [], pole: e.pole ?? (e.id % 2 ? 1 : -1) }))
        c.x = left + x / zz; c.y = top + y / zz; c.radius = r / zz
        for (const f of LIVE) c[f] = e[f]
        run.enemies.push(c)
      }
      R.sync(run, dt, { left, top, right: left + w, bottom: top + h, zoom: zz, w: app.screen.width, h: app.screen.height, animT: t })
      melt?.texture.source.update()
    },
    // the Core has no Pixi full-screen pass (liquidR.filters() is null): the melt's look is all gl.js
    // the boss's per-size bakes and sheen shader ahead of time: radii = the boss's body radius in device px, one per size it
    // is drawn at (coreOld.ks() lists the buckets built so far). Returns step(ms = 8), true once done
    warmBoss: (radii) => coreOld.warm([...new Set(radii.map(kOf))], app.renderer),
  }
  api.update(0)   // the first sync sizes the gl canvas (core.resize): the texture wraps it at that size
  if (!app.renderer.gl.getContextAttributes().alpha) {
    glc.style.display = 'none'
    api.glc = null   // drawn through the sprite, never shown: nothing may toggle it back on
    melt =new Sprite(new Texture({ source: new CanvasSource({ resource: glc, resolution: glc.width / W }) }))
    app.stage.addChildAt(melt, 0)
  }
  return api
}
