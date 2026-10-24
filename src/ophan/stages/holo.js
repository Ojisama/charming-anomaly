// The Geode (holo): the game's own cavern floor mesh (HOLO.CAVERN_FLOOR_FRAG over paintFoilTile + paintNacreTile) and
// FOIL pass (HOLO.FOIL_FRAG), built and fed exactly as render.js does: cavernU/cavernFloor (~12833), mkFoilU + setHolo
// (~13208-13258, look = CHAPTERS.geode.render.holo), updateMacro's holoLook branch (~13562) per frame. Geode has no
// render.viewW, so camZoom is 1 on a phone. The boss container sits between the floor and the pass, so the foil
// treats it exactly as it treats the game's creatures.
import { Container, Texture, CanvasSource, UniformGroup, Filter, GlProgram, Mesh, MeshGeometry, Shader } from 'pixi.js'
import * as HOLO from '../../holo.js'
import { CHAPTERS } from '../../config.js'

// the camera's world point: searched over cavernAt for the layout of cru/ref/geode-00.png (a cavern top right)
const CAM = { x: -2570, y: -4690 }
const canvasTex = (c, res = 1) => new Texture({ source: new CanvasSource({ resource: c, resolution: res }) })   // render.js macroCanvasTex

export default function stage(app, { W, H }) {
  const MACRO_VERT = app.macroVert
  const look = CHAPTERS.geode.render.holo
  const dark = canvasTex(HOLO.paintFoilTile(), HOLO.TILE_RES), nacre = canvasTex(HOLO.paintNacreTile(), HOLO.TILE_RES)
  dark.source.style.addressMode = nacre.source.style.addressMode = 'repeat'
  const cavernU = new UniformGroup({
    uRect: { value: new Float32Array([0, 0, 1, 1]), type: 'vec4<f32>' },
    uTime: { value: 0, type: 'f32' },
  })
  const cavernFloor = new Mesh({
    geometry: new MeshGeometry({
      positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    }),
    shader: Shader.from({ gl: { vertex: HOLO.CAVERN_FLOOR_VERT, fragment: HOLO.CAVERN_FLOOR_FRAG, name: 'holo-cavern-floor' }, resources: { cavernU, uDark: dark.source, uNacre: nacre.source } }),
  })
  const world = new Container()
  world.addChild(cavernFloor)
  const boss = new Container()
  app.stage.addChild(world, boss)

  const foilU = new UniformGroup({
    uTime: { value: 0, type: 'f32' },
    uCam: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
    uZoom: { value: 1, type: 'f32' },
    uStrength: { value: look.strength ?? 0.9, type: 'f32' },
    uSparkle: { value: look.sparkle ?? 1, type: 'f32' },
    uVignette: { value: look.vignette ?? 0.5, type: 'f32' },
    uMaskL: { value: new Float32Array([look.maskLo ?? 0.5, look.maskHi ?? 0.86]), type: 'vec2<f32>' },
    uScreen: { value: new Float32Array([W, H]), type: 'vec2<f32>' },
    uGlare: { value: look.glare ?? 0.45, type: 'f32' },
    uFire: { value: look.fire ?? 1, type: 'f32' },
  })
  const foil = new Filter({ glProgram: GlProgram.from({ vertex: MACRO_VERT, fragment: HOLO.FOIL_FRAG, name: 'holo-foil' }), resources: { foilU } })
  app.stage.filterArea = app.screen
  app.stage.filters = [foil]

  return {
    boss,
    update(t) {
      // render.js: cx = viewW/2 - camX, world at (cx*z, cy*z); the floor quad covers the view plus a 96 px margin
      const z = 1, cx = W / 2 - CAM.x, cy = H / 2 - CAM.y, M = 96
      world.scale.set(z)
      world.position.set(cx * z, cy * z)
      const fx = -cx - M, fy = -cy - M, fw = W / z + M * 2, fh = H / z + M * 2
      cavernFloor.position.set(fx, fy)
      cavernFloor.scale.set(fw, fh)
      const cr = cavernU.uniforms.uRect
      cr[0] = fx; cr[1] = fy; cr[2] = fw; cr[3] = fh
      cavernU.uniforms.uTime = t
      const u = foilU.uniforms
      u.uTime = t
      u.uCam[0] = cx; u.uCam[1] = cy
      u.uZoom = z
      u.uScreen[0] = app.screen.width; u.uScreen[1] = app.screen.height
    },
    setPass(on) { app.stage.filters = on ? [foil] : null },
  }
}
