// Scene: The Surf's Skipping Shell working through a loose crowd. The shell is a run.bullets
// carrier — it deals no contact damage — and leaves a foam splash nova at every touch-down, then
// re-aims from where it landed.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/surf-shell.js --out /tmp/sh --frames 16 --chapter surf
//
// What the frames have to answer:
//   1. does the shell read as a SHELL skimming edge-on, or as another gold spark?
//   2. is the ricochet visible — does the path visibly bend at a touch-down?
//   3. do the splashes read as sand-and-foam rather than as small Cytokine Bursts?
// (2) only exists across frames, which is why this scene returns a live ticker rather than a scrub
// over a decaying list: the shell's whole read is its PATH.

H.weapon('skippingShell', 5)

H.breed(20)
const crowd = H.keep(20)

// Scattered, not ranked — a shell that re-aims needs somewhere to bend TO, and a neat grid makes
// every ricochet land on the same straight line by construction.
H.place((i, p) => {
  const a = i * 2.399                     // golden-angle scatter: no accidental rows or columns
  const r = 95 + (i % 5) * 62
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
})

H.until(() => run.bullets.some((b) => b.weapon === 'shell'))
const sh0 = run.bullets.find((b) => b.weapon === 'shell')

H.note(JSON.stringify({
  shells: run.bullets.filter((b) => b.weapon === 'shell').length,
  skipsLeft: run.bullets.find((b) => b.weapon === 'shell')?.skips,
  splashR: sh0?.r,
  // Where the shell actually IS, relative to the player. Kept because the first cut of this weapon
  // was drawn as a cream-tinted needle and was simply invisible on the pale sand — the note is what
  // told the difference between "it never fired" and "it fired and you cannot see it".
  dxFromPlayer: Math.round((sh0?.x ?? 0) - run.player.x),
  dyFromPlayer: Math.round((sh0?.y ?? 0) - run.player.y),
}))

// UNPINNED: the shell has to actually travel and actually bend. Bodies are held alive by tickFx's
// own hp reset, so the crowd does not thin out mid-flight and change the picture between frames.
return (age) => { H.tickFx(1 / 60) }
