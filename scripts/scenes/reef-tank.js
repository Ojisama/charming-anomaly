// Scene: The Reef's Oxygen Tank. Three drawings that have to be told apart, in one frame each:
// the tank TUMBLING up the lane with its landing ring under it, the RUPTURE, and the BOIL the
// player then swims into.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-tank.js --chapter reef --out /tmp/tank --frames 10
//
// ⚠ H.tickFx, not H.tick: the {type:'rupture'} bubbles are spawned by handleEvents and by nothing
// else, so a scene built on tick() photographs the boil with no bang in front of it and no error.
H.weapon('oxygenTank', 5)

H.breed(12)
const crowd = H.keep(12)

// A rank sitting on the landing point, so the rupture has something to go off against.
H.place((i, p) => ({
  x: p.x + 120 + (i % 4) * 44,
  y: p.y + ((i % 4) - 1.5) * 40 + Math.floor(i / 4) * 74,
}))

// Wait for a tank to be in the air, hold it near the top of its arc for the first frames.
H.until(() => (run.lobs || []).some((l) => l.tank))
H.note(JSON.stringify({
  inAir: (run.lobs || []).filter((l) => l.tank).length,
  boils: (run.blooms || []).filter((b) => b.airHold).length,
  pockets: (run.shafts || []).length,
  charge: Math.round(run.charge),
}))

// The sequence: flight -> landing -> boil, ticked with events forwarded so the bang is drawn.
// 10 ticks a frame: the flight is 0.85s, so 5 a frame spent the whole capture in the air and the
// note came back with boils: 0 — a scene that photographs everything except the thing it is for.
return (age) => { for (let i = 0; i < 10; i++) { H.pin(); H.tickFx() } }
