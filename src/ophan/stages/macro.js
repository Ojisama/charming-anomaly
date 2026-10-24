// Topsoil (macro): the game's own floor tile (MACRO.paintTopsoilTile) and LENS pass, uniforms as render.js setMacro /
// updateMacro set them for CHAPTERS.topsoil.render.macro. The boss container sits between the floor and the pass.
import { Container, Texture, CanvasSource, TilingSprite, UniformGroup, Filter, GlProgram } from 'pixi.js'
import { LENS_FRAG, paintTopsoilTile, TILE_RES } from '../../macro.js'
import { CHAPTERS } from '../../config.js'

const tone = (h) => new Float32Array([(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255])
export default function stage(app, { W, H }) {
  const MACRO_VERT = app.macroVert
  const L = CHAPTERS.topsoil.render.macro
  const ftex = new Texture({ source: new CanvasSource({ resource: paintTopsoilTile(), resolution: TILE_RES }) })
  ftex.source.style.addressMode = 'repeat'
  const floor = new TilingSprite({ texture: ftex, width: W, height: H })
  const boss = new Container()
  app.stage.addChild(floor, boss)
  const lensRes = Math.min(1.5, app.renderer.resolution || 1)
  const macroU = new UniformGroup({
    uTime: { value: 0, type: 'f32' }, uBlurPx: { value: (L.blur ?? 7) * lensRes, type: 'f32' },
    uFocus: { value: new Float32Array([0.5, 0.5]), type: 'vec2<f32>' }, uLightDir: { value: new Float32Array([-0.62, -0.78]), type: 'vec2<f32>' },
    uKey: { value: L.key ?? 0.4, type: 'f32' }, uExposure: { value: 1, type: 'f32' },
    uShadowTone: { value: tone(L.shadowTone ?? 0x8090b0), type: 'vec3<f32>' }, uLightTone: { value: tone(L.lightTone ?? 0xffe8c0), type: 'vec3<f32>' },
    uVignette: { value: L.vignette ?? 0.7, type: 'f32' }, uGrain: { value: L.grain ?? 0.06, type: 'f32' }, uSharpR: { value: L.sharp ?? 0.62, type: 'f32' },
    uSunTone: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' }, uSkyTone: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
    uKeyTint: { value: 0, type: 'f32' },
  })
  const lens = new Filter({ glProgram: GlProgram.from({ vertex: MACRO_VERT, fragment: LENS_FRAG, name: 'macro-lens' }), resources: { macroU } })
  lens.resolution = lensRes
  app.stage.filterArea = app.screen
  app.stage.filters = [lens]
  return {
    boss,
    // focus rides the player, held near the middle of the frame (updateMacro)
    // and racks to the painter's tool as the hand comes down (focus.k: 0 high, 1 at the paper)
    update(t, { px = W / 2, py = H * 0.72, focus = null } = {}) {
      macroU.uniforms.uTime = t
      const k = focus ? focus.k * focus.k * (3 - 2 * focus.k) : 0
      macroU.uniforms.uFocus[0] = (0.5 + (px / W - 0.5) * 0.6) * (1 - k) + (focus ? focus.x / W : 0) * k
      macroU.uniforms.uFocus[1] = (0.5 + (py / H - 0.5) * 0.6) * (1 - k) + (focus ? focus.y / H : 0) * k
    },
    setPass(on) { app.stage.filters = on ? [lens] : null },
  }
}
