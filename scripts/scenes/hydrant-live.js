// Scene: the Burst Hydrant casting NATURALLY in a real city run — no hand-placed zones.
//
// The look was developed against hand-built run.zones entries, which proves the renderer but not
// the path that actually feeds it: stepHydrantWeapon -> pickHydrantSpot -> the zone's own fields.
// A bad `streams` snapshot, a mis-set jetDur or a mod that folds into nothing all look perfect in a
// hand-placed shot and produce nothing here.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/hydrant-live.js --out /tmp/hl --frames 6 --chapter city

H.weapon('burstHydrant', 5, { moreStreams: 1, deepMain: 0.3, longHose: 0.3 })

H.breed(24)
H.keep(24)
H.place((i, p) => ({
  x: p.x - 150 + (i % 6) * 62,
  y: p.y - 120 + Math.floor(i / 6) * 74,
}))

// Let the weapon cast and at least one hydrant actually open its main.
const ok = H.until(() => (run.zones || []).some((g) => g.jet > 0), 1200)

const live = (run.zones || []).filter((g) => g.jet > 0)
H.note(JSON.stringify({
  opened: ok,
  zones: (run.zones || []).length,
  open: live.length,
  nStreams: live[0]?.nStreams ?? null,
  jetDur: live[0]?.jetDur?.toFixed?.(2) ?? null,
  streaming: live.reduce((a, g) => a + (g.streams?.length ?? 0), 0),
}))

return (age) => {
  for (let i = 0; i < 3; i++) H.tick()
  H.pin()                 // the streams damage the cast every frame; unpinned they render white
  H.render()
  void age
}
