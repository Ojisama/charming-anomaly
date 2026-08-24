// Scene: DOES THE CORAL STAY PUT ACROSS A FIELD REBUILD?
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-anchor.js --chapter reef --out /tmp/an --frames 2
//
// The coral field rebuilds once per ridge crossing (spacing / laneScroll = 2.33s at 90px/s), and
// its placement used to start from the PLAYER's position at that moment -- so every rebuild moved
// every colony and the whole reef re-randomised itself while the player watched. Nothing in the
// suite could see it: any single frame was correct, and only the CHANGE between two was wrong.
//
// This shoots one world position TWICE, from two different player positions either side of a
// rebuild, and stacks them. Anchored to the world the two halves are identical; anchored to the
// player they are two different reefs. Read it as a pair, not as a still.
const world = app.stage.children[0]

// A fixed spot to photograph, and two player positions a full rebuild apart.
const AT = 6000
const APART = 260            // > one ridge spacing (210), so _spurRev has certainly bumped

let shot = 0
run.player.x = AT
H.tick(); H.tick()

H.note([
  run.chapter,
  'world x=' + AT,
  'player moved ' + APART + 'px between frames (spacing ' + 210 + ')',
  'frames must be IDENTICAL where they overlap',
].join('  '))

return () => {
  // Put the player where the frame wants them, force the rebuild, then park the CAMERA on the
  // fixed world spot so both frames photograph the same reef rather than the same screen.
  run.player.x = AT + (shot === 0 ? 0 : APART)
  run._spurRev = (run._spurRev ?? 0) + 100 + shot
  window.__renderer.sync(run, 1 / 60, [])
  // The camera follows the lane front, so pin that to the shared spot for the photograph.
  run._laneFront = AT
  window.__renderer.sync(run, 0, [])
  app.renderer.render(app.stage)
  shot++
}
