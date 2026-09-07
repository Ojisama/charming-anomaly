// Scene: THE SCREW'S SWING. Owner ruling 2026-09-06: "the hélice should have some inertia", then
// "Not a lot of inertia but some, with a flick you should be able to have a swirl half circle."
// The claim is about a path over about three seconds, so it is captured as a sequence: settle the
// chain due east, flick north for a quarter second, then let go and let the blade swing round.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/screw-flick.js --chapter wreck \
//     --url 'http://127.0.0.1:PORT/' --out /tmp/flick --frames 8 --w 1280 --h 800
//
// ⚠ THE CROWD IS CLEARED EVERY FRAME. The subject is where the blade GOES, and a screw that is
// cutting is a screw surrounded by hit numbers and death poofs — the one thing guaranteed to sit on
// top of the path being judged. Same reason orca-three-circles.js holds the player still.
//
// ⚠ AND IT DRIVES ITS OWN INPUT rather than using H.tick, which hardcodes a stationary player. The
// flick IS an input, so a rig that cannot press a direction cannot show this at all.

H.clean()

const p = run.player
run.weapons = [{ id: 'screw', level: 5 }]
// ?twin=1 puts the second blade on the chain — the pair's stagger and their slide round the hull
// after the stop are what the 2026-09-07 collision floors are for, and one blade cannot show it.
if (new URLSearchParams(location.search).get('twin')) run.weaponMods.screw = { twinScrew: 1 }
run.screws.length = 0

H.note(JSON.stringify({ weapon: 'screw', chapter: run.chapter }))

// Seconds of sim the frames span, measured from the START of the flick — the settle before it is
// run once, off camera, because a taut chain looks the same in every frame of it.
const SETTLE = 2.0
const FLICK = Number(new URLSearchParams(location.search).get('flick') || 0.25)
const T1 = Number(new URLSearchParams(location.search).get('t1') || 2.6)

let simT = 0
const advance = (to) => {
  while (simT < to - 1e-6) {
    const d = Math.min(1 / 60, to - simT)
    run.enemies.length = 0
    const input = simT < SETTLE ? { x: 1, y: 0 }
      : simT < SETTLE + FLICK ? { x: 0, y: -1 }
        : { x: 0, y: 0 }
    step(run, input, d)
    simT += d
    run.player.hp = run.player.maxHP
    window.__renderer.sync(run, d, run.events.splice(0))
  }
}

return (k) => {
  advance(SETTLE + k * T1)
  app.renderer.render(app.stage)
}
