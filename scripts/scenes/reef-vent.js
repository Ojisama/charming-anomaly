// Scene: THE AIR VENT AS A PICKUP — a charged vent, the gulp, and the spent vent it leaves behind.
// Runs in the page with (run, app, step, H) in scope; see the H surface in fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-vent.js --out /tmp/vent-charged \
//     --chapter reef --frames 1 --w 1280 --h 800 --url 'http://127.0.0.1:5211/?vent=charged'
//   ...and again with ?vent=gulp and ?vent=spent.
//
// ONE PHASE PER INVOCATION, because fx-probe captures its own frames after the scene returns —
// there is no H.shot() to take three moments in one run. The three are the whole question, since
// 2026-08-26 turned the vent into a pickup: it hands its air over the instant you touch it, so
// `feeding` is true for a single frame and the rising column that used to mark a live vent is gone.
//   charged  a dark mouth wearing a rim of stuck bubbles, worth steering for
//   gulp     the airgulp burst, air going UP, at the moment of taking
//   spent    the same mouth, bare, so a used vent reads as used at a glance
// If charged and spent look the same, the field is a guess — that is the defect this scene catches.
//
// ⚠ THE GULP FRAME USES H.tickFx, NOT H.tick. tick() DROPS the step's events so a long warm-up does
// not bury the frame in damage numbers; the burst is spawned by handleEvents off the airgulp event
// and nothing else, so a tick()-built frame captures no burst AND NO ERROR — indistinguishable from
// "the effect is invisible", which is the trap fx-probe's own header describes.
const PHASE = new URLSearchParams(location.search).get('vent') || 'charged'

const sh = run.shafts && run.shafts[0]
if (!sh) {
  H.note('NO VENT STREAMED — nothing to shoot')
} else {
  run.charge = 10                      // real headroom, or the vent is left alone by design
  if (PHASE === 'charged') {
    run.player.x = sh.x + 400          // beside it, untouched
    run.player.y = sh.y
    H.tick()
  } else {
    run.player.x = sh.x
    run.player.y = sh.y
    // 'spent' TAKES THE VENT WITH tick(), NOT tickFx(), AND THAT IS AN ABLATION RATHER THAN AN
    // OVERSIGHT. tick() drops the step's events, so the airgulp burst is never spawned at all —
    // which means every pale bubble left in the 'spent' frame belongs to the VENT'S OWN drawing.
    // Shot with the burst live, its particles linger near the vent and are indistinguishable from a
    // rim that failed to switch off, i.e. the frame cannot answer the question it was taken for.
    if (PHASE === 'spent') H.tick(); else H.tickFx()
    if (PHASE === 'spent') {
      // BACK TO WHERE THE 'charged' FRAME WAS SHOT FROM, and long enough for the burst to expire.
      // Shot from on top of the vent the frame is all burst and the player's own body, which says
      // nothing about the thing being asserted: whether a SPENT vent looks different from a charged
      // one. The two frames have to be the same camera on the same vent.
      run.player.x = sh.x + 400
      run.player.y = sh.y
      for (let i = 0; i < 90; i++) H.tick()
    }
  }
  H.note(JSON.stringify({
    phase: PHASE,
    taken: !!sh.taken,
    charge: Math.round(run.charge),
    grant: 25,
  }))
}
