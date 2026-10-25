// THE OPHAN'S STAGING: the boss's big beats (its arrival, its returns, a skin breaking, a resonance, its leaving, the
// sketch rising, its death), drawn by src/ophan/renderer.js over the fight. A beat is started by a sim event, runs `dur`
// seconds on the renderer's clock, and each frame calls its look's draw(k) BEFORE the boss is drawn: the look may hide,
// move, scale, fade or reskin the boss (k.boss) and draws its own marks into the spare px2ds and the sprite layer that sit
// over the boss (k.px(i), k.layer), or onto the floor of the world shown (k.floor, under that world's pass).
// docs/superpowers/specs/2026-10-25-ophan-staging-design.md
//
// The looks register themselves from src/ophan/staging/*.js. STAGE_PICK is the one chosen per beat (per world for a
// break); the playground (scripts/ophan-stage/) swaps it to show the others on the same code path the fight draws.
//
// k, a beat's frame (renderer.js stageK), every position in the boss's slot's stage px:
//   u 0..1 of the beat · age, dur seconds · e its event · kind · from the slot the boss was drawn in when it started (a
//   break's broken skin, the dying sketch) · ph0 the phase then · alive the sim still has the boss
//   S, A, B the boss's slot, the world shown, the world inside a wipe · x, y, R, z the boss as the fight places it, its
//   radius, stage px per world px · t the fight's animation clock · ph its phase now
//   boss: what the fight is about to draw, the look may change it: { S, hide, scale, alpha, dx, dy, ph }
//   floor: a px2d on the world's floor, under its pass and the boss · px(i): spare px2d i (0-2) over the boss, one boss
//   each · fadePx(i, a, sc, x, y): fade it whole and scale it about (x, y), before drawing · layer + sprite(tex): pooled
//   sprites over the boss · drawBoss(slot, c, x, y, R, ph): a skin's boss into px2d c · snap(slot, ph): that skin's boss
//   as a texture R*3 wide centred on it (shards cut from it: new Texture({ source: tx.source, frame }) or a masked sprite)
//   at(wx, wy): a world point in stage px · look(k): world k's slot · col(slot): its gauge colour · slots, worlds
// A look must stay a pure function of u (the playground scrubs it): randomness comes from hash(), never Math.random,
// and a canvas it bakes is baked once (cached by size), never per frame (px2d flags that).
export const STAGING = {}   // kind -> look id -> { label, dur?, draw(k), warm?(R) }
// a stable pseudo-random 0..1 for (i, j): the same every frame
export const hash = (i, j = 0) => { const s = Math.sin(i * 12.9898 + j * 78.233 + 0.5) * 43758.5453; return s - Math.floor(s) }
export const STAGE_DUR = { arrive: 3, return: 3, break: 0.8, resonance: 0.6, leave: 1.2, sketch: 3, death: 6 }
export const STAGE_PICK = { arrive: 'D', return: 'B', break: { macro: 'A', holo: 'B', ascii: 'B', pixel: 'A', liquid: 'A' }, resonance: 'B', leave: 'B', sketch: 'A', death: 'A' }   // the owner's picks, 2026-10-25
export const stage = (kind, id, look) => { (STAGING[kind] ??= {})[id] = look; return look }
// the look a beat plays: a break's is per world (its key is the broken skin's look), every other beat's is one
export function lookOf(kind, world) {
  const set = STAGING[kind]
  if (!set) return null
  const p = STAGE_PICK[kind]
  return (typeof p === 'object' ? set[world + ':' + (p[world] ?? 'A')] : set[p]) ?? null
}
export const ease = (u) => u * u * (3 - 2 * u)
export const clamp01 = (u) => Math.max(0, Math.min(1, u))
// u of a window [a, b] of the beat, clamped
export const win = (u, a, b) => clamp01((u - a) / (b - a))
