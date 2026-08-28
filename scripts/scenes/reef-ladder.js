// Scene: THE DIFFICULTY LADDER'S TRACK — the same stretch of circuit at whichever rung the probe
// seeded, so two shots can be laid side by side. Runs in the page with (run, app, step, H) in
// scope; see the H surface in fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-ladder.js --out /tmp/reef-d1 \
//     --chapter reef --difficulty 1 --frames 1 --w 1280 --h 800
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-ladder.js --out /tmp/reef-d5 \
//     --chapter reef --difficulty 5 --frames 1 --w 1280 --h 800
//
// ⚠ DO NOT PIN _obstacleSeed HERE. The obvious way to make two shots comparable — assign a fixed
// seed at the top of the scene — regenerates the whole lap UNDER a player who was placed on the
// start line of the old one (createRun computes that position from the seed, ringCentre), so the
// frame comes back as open water with the track somewhere off screen. It looks exactly like "the
// coral stopped drawing". fx-probe already pins Math.random in its initScript, so both runs draw
// the SAME seed on their own; the note below prints it, and two shots whose seeds differ are not a
// pair however similar they look.
//
// The zoom is chosen to frame a few hundred px either side of the passage rather than the whole
// lap: the question here is the width of the corridor, and at lap scale a 15% change in a 400px
// passage is under a pixel.
// GAMEPLAY ZOOM, NOT MAP MODE, and that is the opposite of this repo's usual layout advice for a
// reason worth writing down: map mode does not draw the coral WALL. It is the layer the whole
// question is about, so the wide view comes back as open water with a few props in it and reads
// exactly like "the track stopped rendering". Judge the passage at 1:1 on a wide viewport instead.
H.tick()
H.tick()

const spec = run.caveSpec
H.note(JSON.stringify({
  chapter: run.chapter,
  difficulty: run.difficulty,
  seed: run._obstacleSeed,
  passage: `${Math.round(spec.halfMin * 2)}-${Math.round(spec.halfMax * 2)}px`,
  chapterPassage: `${Math.round(spec.halfMin * 2)}-${Math.round(spec.halfMax * 2)}px` === '360-480px' ? 'BASE' : 'narrowed from 360-480px',
  raceClockMul: run.mods.raceClockMul,
  clock: Math.round(run.raceClock ?? 0),
}))
