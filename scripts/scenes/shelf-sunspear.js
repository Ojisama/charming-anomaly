// Scene: The Shelf's Sunspear, mid-fall and landing. A column is a run.lobs entry that never
// travels (fromX/fromY are its target), so what is on screen while it falls is drawn by
// drawColumns — an aperture closing onto the splash radius, with motes converging inward.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/shelf-sunspear.js --out /tmp/ss --frames 14 --chapter shelf
//
// What the frames have to answer, in order:
//   1. is the telegraph READABLE as light coming down, or as a blast that already happened?
//   2. is it a PLAN VIEW? A column drawn as a cone with a wide top and a narrow foot would be a
//      side elevation — the Trash Tornado's mistake, and the one thing this drawing must not be.
//   3. do three columns read as THREE, or as one bright patch? (The whole level axis is `count`.)
// Question 1 needs the sequence: an aperture that closes and one that opens look identical in a
// still.

// ⚠ THE BAR IS HELD FULL FOR THE CAMERA, not for the weapon. This chapter's light radius is a
// function of run.charge, and fx-probe's warm-up drains it: the first cut of this scene came back
// as a black rectangle with the note reading "columns: 3" — the weapon had fired perfectly, 190px
// outside the lit disc. Sunspear does not read the bar at all, so holding it up costs the
// measurement nothing here; the two scenes that DO read it hold the sim's bar and the camera's bar
// apart on purpose (see shelf-foxfire.js / shelf-sunlance.js).
const lightUp = () => { run.charge = run.chargeMax }

H.weapon('sunspear', 5)

H.breed(22)
const crowd = H.keep(22)

// Three loose clusters, far enough apart that the three columns of an L5 cast land on three
// different ones — which is what question 3 is asking about. Inside castRange (380 at L5).
// Kept inside ~150px so all three clusters, and all three columns, fit a 390px-wide phone — the
// framing that actually has to be judged.
H.place((i, p) => {
  const g = Math.floor(i / 8)                 // three groups
  const a = -1.9 + g * 1.9
  const r = 120 + (i % 8) * 5
  return { x: p.x + Math.cos(a) * r + ((i % 3) - 1) * 20, y: p.y + Math.sin(a) * r + ((i % 4) - 1.5) * 18 }
})

H.until(() => { lightUp(); return (run.lobs || []).some((lo) => lo.column) })

const cols = () => (run.lobs || []).filter((lo) => lo.column)
H.note(JSON.stringify({
  columns: cols().length,
  spread: cols().length > 1
    ? Math.round(Math.hypot(cols()[0].tx - cols()[1].tx, cols()[0].ty - cols()[1].ty))
    : 0,
  r: Math.round(cols()[0]?.r ?? 0),
}))

// The first 70% of the sequence SCRUBS the fall by hand (the sim is not stepped, so nothing lands
// and the aperture can be read frame by frame); the rest lets real time run so the columns actually
// hit and the burst plays. Both halves matter and neither is judgeable from the other.
return (age) => {
  lightUp()
  if (age < 0.7) {
    for (const lo of cols()) lo.t = lo.flight * (age / 0.7) * 0.98
    H.pin()
    H.render()
  } else {
    // Real time, so the columns genuinely land and the 'sunfall' burst plays through handleEvents.
    for (let i = 0; i < 4; i++) { lightUp(); H.tickFx(1 / 60) }
  }
}
