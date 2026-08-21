// Scene: the Silt Veil's CONES, mid-life, against a crowd. Owner from play, 2026-08-21: "vase should
// not be a cloud but a cone starting from you because it's just hitting nothing rn".
//
//   npx vite --port 5203 --strictPort &            # fx-probe does NOT start a server
//   node scripts/fx-probe.mjs --scene scripts/scenes/silt-clouds.js --chapter shelf \
//     --url 'http://127.0.0.1:5203/' --out /tmp/silt --frames 8
//
// It waits for a REAL cast rather than fabricating blooms, which is the whole point after the
// reshape: `arc` and `angle` are new fields on a SHARED array (run.blooms also carries the pond's
// toxin, The Twilight's foxfire and The Wreck's bilge), and the two ways this goes wrong are both
// invisible to the suite — (1) syncBlooms ignores the wedge and draws the old disc, so the picture
// and the hitbox disagree, and (2) the extra puffs of a recycled cone rig stay visible on a disc.
// run MB.c measures the sim either way. Only a frame tells them apart.
//
// What to look for, in this order:
//   1. Is it a WEDGE that starts at the player and widens away, not a blob sitting on a body?
//   2. Does it point at the crowd? It aims through aimAngle, the Bubble Puff's own chooser.
//   3. With Roil held, do the three cones TILE outward instead of stacking on one bearing — and do
//      they churn differently from each other (owner, same day: "vase clouds look too similar")?
//
// ⚠ SHOOT IT AT BOTH VIEWPORTS. A 162px cone on a 390px phone is most of the screen; on 1280x800 it
// is a small plume, which is the harder read and the one that matters.

H.weapon('siltVeil', 5, { roil: 2 })

// A crowd off to ONE side, so "is it pointed at the nearest body" is answerable from the frame. A
// ring all round the player would leave the aim untestable.
H.breed(6)
H.keep(6)
H.place((i, p) => ({ x: p.x + 250 + (i % 2) * 46, y: p.y - 150 + Math.floor(i / 2) * 62 }))

// Clean water: the murk is not the subject here, and at a low bar it sits on top of the effect.
run.charge = 100

H.until(() => (run.blooms || []).some((b) => b.look === 'silt'), 900)
const cones = (run.blooms || []).filter((b) => b.look === 'silt')
if (!cones.length) throw new Error('no silt cone after 900 ticks — is the weapon still called siltVeil?')

const p = run.player
// PARK THE PLAYER ON THE APEX. The cone is planted, not attached, so by the time H.until returns
// the player has already swum off it -- correct behaviour, and a frame that hides the one thing
// being judged. Moving the player back is honest: it is where they stood when the cast fired.
p.x = cones[0].x; p.y = cones[0].y
H.note(JSON.stringify({
  cones: cones.length,
  arcDeg: cones[0].arc == null ? 'DISC — the reshape did not reach the cast site' : Math.round((cones[0].arc * 180) / Math.PI),
  aimDeg: cones.map((c) => Math.round((c.angle * 180) / Math.PI)),
  apexOnPlayer: cones.every((c) => Math.hypot(c.x - p.x, c.y - p.y) < 1e-6),
  maxR: Math.round(cones[0].maxR),
}))

// HOLD THEM MID-LIFE and reproduce stepBlooms' own growth line, for the reason bubble-cone.js
// documents: the renderer sizes the wedge off `bl.r`, which the sim derives from `bl.t`. Rewinding
// the age alone replays the cone at whatever radius the last step left it. The puffs also churn on
// animT, so the frames must advance real time or all eight are one picture.
return () => {
  for (const b of run.blooms) {
    if (b.look !== 'silt') continue
    b.t = b.dur * 0.45          // past the grow ramp, well before the fade
    b.r = b.maxR
  }
  H.render()
}
