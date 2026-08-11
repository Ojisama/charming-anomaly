// Scene: the skies' two ground-truth marks on one frame — a helicopter's LOCK (designation line +
// diamond on you) and a tank column's ARTILLERY telegraph — with the kaiju and the aircraft at
// their real draw scales. Built for the v7.21 pass: bead removed from the lock, artillery dimmed,
// kaiju -20%, enemies +10%. All four land in this single frame.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/skies-marks.js --out /tmp/sk --chapter skies --frames 10
//   ffmpeg -y -framerate 6 -i /tmp/sk-%02d.png -loop 0 /tmp/sk.gif
//
// Hand-built rather than waited for: a heli's volley clock is MISSILE_INTERVAL (7.5s) and a tank's
// is ARTILLERY_INTERVAL, so waiting for both to line up gives a different frame every run — and the
// lock telegraph only exists for SKIES_FX.missile.lockT (0.6s) before launch, which is far too
// narrow to catch by waiting. Pinning both clocks is the only way to hold the frame still.
run.enemies.length = 0
run.weapons = []
run.player.hp = run.player.maxHP = 99999

for (let i = 0; i < 40; i++) H.tick()   // stream the street in

// Breed BEFORE muting the spawner. Zeroing run.mods.spawnMul first makes H.breed a silent no-op —
// the scene then renders a bare street and reads exactly like "the effect is invisible", which is
// trap 3 in fx-probe.mjs wearing a different hat. H.note carries the cast count for this reason.
H.breed(10)
const cast = H.keep(10)
run.mods.spawnMul = 0

const px = run.player.x, py = run.player.y

// Helicopters mid-LOCK — the mark under test. _volleyT is held inside SKIES_FX.missile.lockT so
// drawMissileLocks paints the designation line and the diamond on the player every frame.
const heli = cast.filter((e) => e.rosterId === 'helicopter').slice(0, 2)
const tanks = cast.filter((e) => e.rosterId === 'tankColumn').slice(0, 2)
const jets = cast.filter((e) => e.rosterId === 'jet').slice(0, 2)

H.place((i, p) => {
  const a = (i / cast.length) * Math.PI * 2
  return { x: p.x + Math.cos(a) * 200, y: p.y + Math.sin(a) * 170 }
})

// A tank column's telegraph: push run.bombs entries directly, with the `src: 'gun'` the renderer
// keys on (sim.js sets it at the push site; bombSrc reads it rather than inferring from duration).
// ox/oy is the firing tank, which is what the trajectory ghost arcs back to.
const FUSE = 1.1
run.bombs.length = 0
const shells = []
for (let i = 0; i < 3; i++) {
  const a = -0.5 + i * 0.9
  const t = tanks[i % Math.max(1, tanks.length)]
  const b = {
    x: px + Math.cos(a) * 120, y: py + Math.sin(a) * 95,
    radius: 62, fuse: FUSE, duration: FUSE, dmg: 30, src: 'gun',
    ox: t ? t.x : px - 260, oy: t ? t.y : py - 200,
  }
  run.bombs.push(b); shells.push(b)
}

H.note(JSON.stringify({
  helis: heli.length, tanks: tanks.length, jets: jets.length,
  bombs: run.bombs.length, cast: cast.length,
}))

// Scrub the shared clock: the artillery fuse burns 0 -> impact while the missile lock stays pinned
// inside its 0.6s window, so the bracket ramp and the designation line can both be read across the
// sequence rather than from one still.
return (age) => {
  for (const e of heli) { e._volleyT = 0.6 * (1 - age * 0.95); e._volleyLeft = 0; e._volleyGapT = 0 }
  for (const b of shells) b.fuse = Math.max(0.001, FUSE * (1 - age))
  H.tick(1 / 60)
  run.bombs.length = 0
  for (const b of shells) run.bombs.push(b)
  H.render()
}
