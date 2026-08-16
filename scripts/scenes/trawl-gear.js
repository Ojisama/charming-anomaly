// Scene: The Trawl's two natives on one frame — a set Longline with a crowd caught along it, and a
// Net Toss mesh landed over a pack, with the chapter's own net wall in the background.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/trawl-gear.js --chapter trawl --out /tmp/tg --frames 4
//
// SHOOT IT AT BOTH VIEWPORTS (`--w 1280 --h 800` for the second). Nothing here is compared against
// the screen, so neither weapon CAN be a different mechanic on a phone — but the wall behind them is
// (its drawn span is 1.6 x run.viewRadius), and the question this scene exists to answer is whether
// the player's own gear stays distinguishable from that wall. That is a question about what shares
// the frame, so it has to be asked on both frames.
//
// ⚠ THE WHOLE POINT OF THE COMPOSITION IS THE TWO NETS TOGETHER. Both weapons and the chapter's
// hazard are literally fishing nets; if the player's gear and the killing wall read alike, the
// chapter's core skill — knowing where the wall is — breaks every time you fire. The gear is drawn
// warm (GEAR_VIS) and the wall cold (NET_VIS) for exactly this reason, and this frame is where that
// claim is checked rather than asserted.

// ASSIGNED, not two H.weapon calls: H.weapon REPLACES run.weapons rather than appending, so calling
// it twice equips only the second and the first silently never fires. This scene's first shot came
// back with a Net Toss bundle in mid-air, a landing telegraph, and no rope anywhere — which is
// exactly what "the weapon is broken" looks like. The probe's own header documents the trap.
run.weapons = [{ id: 'longline', level: 5 }, { id: 'netToss', level: 5 }]
H.breed(18)
const crowd = H.keep(18)

// Everything below happens AFTER the breed, the ordering trawl-net.js documents at length: H.breed
// ticks the sim for hundreds of frames, and anything positioned before it has been carried away (or,
// for a net, dropped past its own `end`) by the time the frame is captured.

// The wall, brought up behind the player so both kinds of net share the frame. Same fast-forward as
// trawl-net.js: run._netAcc is the sim's own countdown, so zeroing it asks stepTrawl to build the
// pass rather than hand-writing one.
run._netAcc = 0
let ticks = 0
while (!run.net && ticks < 240) { H.tick(); ticks++ }
if (run.net) {
  const net = run.net
  net.pos = run.player.x * net.nx + run.player.y * net.ny + 430   // well clear of the gear below
  net.end = net.pos + 4000
}

// Fire both weapons by TICKING, never by pushing onto run.longlines/run.lobs by hand: the placement
// rule (perpendicular to surfAim, `offset` px along it) is the thing most likely to be wrong, and a
// hand-placed rope would photograph the bug as though it were the design.
let fired = 0
for (let i = 0; i < 400 && (run.longlines.length === 0 || fired < 2); i++) {
  H.tick()
  if (run.longlines.length > 0) fired = 2
}

// A pack laid ALONG the rope, so the frame shows bodies caught at intervals down its length rather
// than a rope with nothing on it. Read from the line's own frame — the aim is decided by wherever
// the crowd happened to be, so the bearing is not knowable in advance.
const layout = () => {
  const l = run.longlines[0]
  if (!l) return
  const tx = -l.ny, ty = l.nx                    // along the rope
  H.place((i, p) => {
    void p
    if (i < 10) {                                // on the rope, spread down its length
      const along = ((i % 10) - 4.5) * (l.len / 11)
      const across = ((i % 3) - 1) * 10
      return { x: l.x + tx * along + l.nx * across, y: l.y + ty * along + l.ny * across }
    }
    // The rest bunched under the thrown net. Placed relative to the PLAYER, not to the rope: the
    // rope's bearing is whatever surfAim picked, so an offset along its normal swings the mesh
    // anywhere including off the edge of the frame — which is how the first shot ended up judging
    // the net's alphas from a quarter of it at the screen border.
    const a = (i / 8) * Math.PI * 2
    return { x: run.player.x + 210 + Math.cos(a) * 62, y: run.player.y + 250 + Math.sin(a) * 62 }
  })
}
layout()

// The landed Net Toss mesh. It has NO sim entity behind it — the hold lives on each body as stunT
// and the drawing is render-local, born from the {type:'snare'} event — so the only honest way to
// put one in the frame is to emit that event, which is exactly what stepLobs does on landing.
const l0 = run.longlines[0]
if (l0) {
  const nx = run.player.x + 210, ny = run.player.y + 250
  // The shipped L5 hold. Getting a fresh, fully-open mesh in the frame is the job of the tickFx dt
  // below, NOT of inflating this number — inflating it was tried and photographs a different bug
  // each way round (a mesh mid-fade at the real value, a mesh mid-OPEN at 8s), which is how the
  // fractional-envelope bug in updateGear was found. Shoot the state you mean to judge, by aging
  // the effect to it.
  run.events.push({ type: 'snare', x: nx, y: ny, radius: 142, hold: 1.75, caught: 8 })
  // And hold the bodies under it, so the pose render reads off `stunT` is visible in the same frame.
  for (const e of crowd) {
    if (Math.hypot(e.x - nx, e.y - ny) <= 142) e.stunT = 1.75
  }
}

H.note(l0
  ? `${run.chapter} gear: ${run.longlines.length} line(s) len=${Math.round(l0.len)} ` +
    `n=(${l0.nx.toFixed(2)},${l0.ny.toFixed(2)}) snagged=${l0.snagged.size} ` +
    `wall=${run.net ? 'yes' : 'NO'} viewR=${Math.round(run.viewRadius)}`
  : `NO LONGLINE AFTER ${ticks} TICKS — the weapon never fired, so this frame proves nothing`)

return () => {
  layout()
  // A pinned cast being struck every frame never stops flashing, and a field of white silhouettes
  // cannot be judged against the gear drawn over it.
  for (const e of crowd) e.hitFlash = 0
  run.player.invuln = 0
  H.pin()
  // 0.3s per frame, not 1/60. The landed mesh needs OPEN_T (0.14s) of render time to spread from a
  // bundle to a full disc, and at a 60Hz dt the capture lands two frames in — a mesh 8% open, which
  // photographs as "the net barely draws". This also makes each captured frame a legible step
  // through the net's life rather than 16ms of it.
  H.tickFx(0.3)
}
