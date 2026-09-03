// Scene: the net HAS the player. The wall is brought onto the body so stepTrawl's own catch fires,
// then a few ticks in the hold, and the frame is the held look — the thing the hold's design A/B
// is about. Sibling of trawl-net.js (same "ask the sim for the net, never hand-build it" rule).
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/trawl-hold.js --chapter trawl --out /tmp/th --frames 3

H.breed(10)
const crowd = H.keep(10)

run._netAcc = 0
let ticks = 0
while (!run.net && ticks < 240) { H.tick(); ticks++ }

if (run.net) {
  const net = run.net
  net.pos = run.player.x * net.nx + run.player.y * net.ny   // the line through the body: caught this tick
  net.end = net.pos + 4000
  net.holes.length = 0                                      // no tear under the player
}
// A few ticks so the hold is running (dragT > 0) and the reel has settled the body in the band.
for (let i = 0; i < 12 && run.net && !(run.net.dragT > 0.5); i++) H.tick()

const layout = () => {
  const net = run.net
  if (!net) return
  const tx = -net.ny, ty = net.nx
  H.place((i, p) => {
    const side = i < 5 ? 1 : -1
    const along = ((i % 5) - 2) * 120
    const off = side * (140 + (i % 3) * 60)
    return { x: p.x + tx * along + net.nx * off, y: p.y + ty * along + net.ny * off }
  })
}
layout()

H.note(run.net
  ? `${run.chapter} HELD dragT=${run.net.dragT?.toFixed(2)} d(player)=` +
    `${Math.round(run.player.x * run.net.nx + run.player.y * run.net.ny - run.net.pos)} tv=${new URLSearchParams(location.search).get('tv') || 0}`
  : `NO NET AFTER ${ticks} TICKS`)

// THE BAR IS DOM (ui.js's HUD), which the probe hides and main.js's stopped ticker no longer
// paints — so the shot un-hides the HUD and paints the bar the way updateHUD does, at a half-full
// bar, purely to photograph the label and chrome. The sim path is run TH.m's.
if (run.net) run.net.wiggle = 0.5
return () => {
  layout()
  const ui = document.getElementById('ui'); if (ui) ui.style.display = ''
  const w = document.querySelector('[data-wiggle]')
  if (w) { w.style.display = ''; w.querySelector('.rampage-fill').style.width = ((run.net?.wiggle ?? 0) * 100) + '%' }
  for (const e of crowd) e.hitFlash = 0
  run.player.invuln = 0
  H.pin()
  H.tickFx(1 / 60)
}
