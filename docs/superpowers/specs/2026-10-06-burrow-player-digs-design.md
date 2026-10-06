# Burrow — "the player digs" (design, PARKED)

Status: **parked 2026-10-06, nothing built.** Owner ruling: play the shipped Topsoil (v7.421.0,
DEV-only) on a phone first, then choose between it and this. This file only records the rulings so
the choice can be made later without re-asking them.

## Rulings (owner, 2026-10-06, one question each)

| Question | Ruling |
|---|---|
| Book 3's core | **Burrow: you dig.** Arc goes straight down: topsoil → rock → crust → mantle → core |
| How digging plays | **Movement is digging.** The world is earth; every step carves a tunnel behind you |
| How solid the earth is | **Slow earth, fast tunnels — for everyone.** Your trail becomes a highway for you and the crowd alike; old tunnel segments cave in after N seconds (caps the trail) |
| Threat model | **They hunt by vibration.** Creatures are blind and home on your last NOISE, not on your position |
| What makes noise | **Digging is loud.** Carving new earth pings your position; moving through existing tunnel is silent. Tunnels = fast + quiet + temporary; earth = slow + loud |
| Hero | **The anomaly itself** (Book 1's blob), no new form |
| Skill button | **None.** One-thumb, like Book 1 |

## How this differs from the shipped Topsoil

Shipped Topsoil (v7.421.0): **the moles dig, the player does not.** Moles travel as ground bumps,
erupt where you stood, and their tunnels cave in to pits that swallow the crowd. Open floor, normal
survivors movement. This design moves the digging onto the player and makes noise the targeting rule.

Reusable from the shipped chapter whichever way it goes: the roster (earthworm, mole cricket, mole,
badger) and their bakes, the three weapons, the macro-photography floor, and `run.pits` cave-ins.

## Engine facts that bound the build (read 2026-10-06)

- **No tile grid exists.** World is continuous circles + noise fields; streaming hash cells only
  (sim.js `streamObstacles`). A tunnel would be a new structure: the player's trail as a capped chain
  of circles, with speed (not collision) read off "inside any trail circle".
- **Darkness already exists**: The Deep's lightmap (render.js, MULTIPLY canvas sprite) can draw
  "earth everywhere, lit where you dug".
- **Runtime terrain removal exists**: `run._crushed` + `_obstacleRev` (Skies' `stepCrush`).
- Noise targeting is new: enemies currently steer at `run.player`; this needs a `run.noise` point
  they steer at instead (render must show it, or it reads as broken AI — CLAUDE.md "a new mechanic
  is invisible until it reaches a contract field").

## Open, not yet asked

Chapter-1 roster/weapons under this model, the cave-in timer, whether non-digging enemies also slow
in earth by the same factor, how the noise ping is drawn, and whether this replaces Topsoil or
becomes a deeper chapter.
