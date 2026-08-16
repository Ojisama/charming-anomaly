// Scene: The Trawl's net wall crossing the map, with the churned wake behind it and a Breach torn
// through it, and a crowd on both sides so the "it kills both of us" claim is visible rather than
// asserted.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/trawl-net.js --chapter trawl --out /tmp/tn --frames 3
//
// SHOOT IT AT BOTH VIEWPORTS. The drawn span of the wall is 1.6 x run.viewRadius (updateNet), and the
// warning the player gets before a pass arrives is TRAWL_LEAD_MUL x the same number — so a phone and
// a desktop see a different amount of this mechanic by construction, and the phone is the one that
// has to work. `--w 1280 --h 800` for the second.
//
// The net is not placed by hand. stepTrawl owns the geometry — the normal, the offset, and which
// side the wake is on — so the scene TICKS UNTIL A PASS EXISTS and then advances it to the player.
// Writing run.net here would be a second implementation of the thing being photographed, and the
// most likely bug in this feature is the wake landing on the wrong side of the mesh, which is
// exactly the fact a hand-built net would fake rather than test.

H.breed(16)
const crowd = H.keep(16)

// EVERYTHING ABOUT THE NET HAPPENS AFTER THE BREED, and that ordering cost two wasted shots — both
// of which returned a plausible-looking frame of empty ocean rather than an error. H.breed ticks the
// sim for several hundred frames to grow a crowd, and stepTrawl runs on every one of them:
//   * a net POSITIONED before the breed has sailed 680px past the player by capture time (the note
//     read `d(player)=531` while the frame showed nothing);
//   * a net SPAWNED before the breed passes its own `end` during those frames and is dropped
//     outright, which is what "NO NET AFTER 1 TICKS" meant — the loop had worked perfectly.
//
// A pass arrives on TRAWL_INTERVAL (26s), which is ~1560 ticks of waiting and far too slow to sit
// through. run._netAcc is the sim's OWN countdown to the next pass, so zeroing it says "the next pass
// is due now" and lets stepTrawl build the net — as opposed to writing run.net here, which would be a
// second implementation of the exact thing this scene exists to photograph.
run._netAcc = 0
let ticks = 0
while (!run.net && ticks < 240) { H.tick(); ticks++ }

// Bring the wall to the player: `pos` is the sim's own field and advancing it is precisely what
// stepTrawl does every frame, so this is fast-forwarding the pass rather than faking one.
if (run.net) {
  const net = run.net
  net.pos = run.player.x * net.nx + run.player.y * net.ny + 150   // 150px PAST the player, so the
  // wake — which is always on the side already crossed — falls between the player and the wall, and
  // a shot that shows it on the far side is the sign error this scene exists to catch.
  net.end = net.pos + 4000
}

// Half the crowd ahead of the wall and half behind it, along the net's own normal, so one frame
// carries both the fish about to be caught and the fish already through. Laid out in the NET's frame
// rather than the screen's, because the pass direction is random per seed.
const layout = () => {
  const net = run.net
  if (!net) return
  const tx = -net.ny, ty = net.nx        // along the wall
  H.place((i, p) => {
    const side = i < 8 ? 1 : -1          // +1 = not yet crossed, -1 = behind, in the churn
    const along = ((i % 8) - 3.5) * 105
    const off = side * (90 + (i % 3) * 70)
    return { x: p.x + tx * along + net.nx * off, y: p.y + ty * along + net.ny * off }
  })
}
layout()

// THE BREACH, torn through the mesh at the player's own position on it — the same call the button
// makes, with a full-bar spend so the hole is at BREACH_R_AT_FULL and the frayed ends are legible.
// Pushed straight onto the sim's list, which is what stepRepulse does, so the drawn gap and the gap
// that stops damaging things are read from one array by both sides.
if (run.net) {
  run.net.holes.push({ t: run.player.x * -run.net.ny + run.player.y * run.net.nx, r: 220 })
}

H.note(run.net
  ? `${run.chapter} net n=(${run.net.nx.toFixed(2)},${run.net.ny.toFixed(2)}) d(player)=` +
    `${Math.round(run.player.x * run.net.nx + run.player.y * run.net.ny - run.net.pos)} holes=${run.net.holes.length}` +
    ` viewR=${Math.round(run.viewRadius)}`
  : `NO NET AFTER ${ticks} TICKS — stepTrawl never spawned a pass, so this frame is a bare ocean`)

return () => {
  layout()
  for (const e of crowd) e.hitFlash = 0
  run.player.invuln = 0
  H.pin()
  H.tickFx(1 / 60)
}
