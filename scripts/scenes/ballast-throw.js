// Scene: one Ballast (Lest) in flight over The Shelf, scrubbed across its whole arc.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/ballast-throw.js --chapter shelf \
//        --url 'http://127.0.0.1:5203/?bv=1' --out /tmp/bv1 --frames 6
//
// WHY IT SCRUBS THE ARC RATHER THAN SHOOTING ONE STILL: the thrown block is the ONE sprite in this
// game whose rotation is driven by its own progress (`k * 2.2 + i` in syncLobs) instead of by animT,
// so re-rendering without ticking still turns it — and a silhouette has to be judged tumbling, not
// at one lucky angle. Reported twice from play as "ugly": v0 was a 12px rock magnified 8-11x, and
// its replacement was still a jittered polygon, which is rockChunk's silhouette whatever it is
// filled with. What is being judged here is therefore the OUTLINE, at every angle it will be seen.
//
// What to look for, in this order:
//   1. At a glance and while turning, is it obviously not the kaiju's masonry chunk (Debris Toss)?
//      A jittered blob fails this at every colour.
//   2. Does it read as something MADE and dumped — the chapter's subject — rather than as a stone?
//   3. Does it hold up against a pale sage floor (floorTint 0xb6c9bd) in real murk? A muddy brown
//      on that is low-contrast, which is most of what "ugly" meant.

H.weapon('ballast', 5)

// A small crowd so the block has sprites to be judged against for size and palette. maxAliveMul is
// 0.65 here, so 8 is comfortably under what the chapter keeps alive at t=0.
H.breed(8)
H.keep(8)
H.place((i, p) => {
  const a = (i / 8) * Math.PI * 2 + 0.4
  return { x: p.x + Math.cos(a) * 250, y: p.y + Math.sin(a) * 250 }
})

// Murk at working strength: the sprite has to survive the chapter it is thrown through, not a
// clean-water frame. Below resource.dark.from (0.5 of 100) so darkness() is actually engaged.
run.charge = 40

// Wait for a real cast rather than fabricating a lob, so every field syncLobs reads (flight, r,
// snare, look) is the one the shipped weapon writes.
H.until(() => (run.lobs || []).length > 0, 900)
const lb = (run.lobs || [])[0]
if (!lb) throw new Error('no ballast lob after 900 ticks — is the weapon still called ballast?')

// Re-aim it across the middle of the frame. Left-to-right and slightly up, so the parabola's peak
// sits near the player rather than off the top of a 390x844 phone.
const p = run.player
lb.fromX = p.x - 150; lb.fromY = p.y + 90
lb.tx = p.x + 150;    lb.ty = p.y - 60

H.note(JSON.stringify({ look: lb.look, r: lb.r, flight: lb.flight, lobs: run.lobs.length }))

// Deliberately NOT H.scrub: that rewinds a `life` field and a lob has none. The thing being scrubbed
// is flight PROGRESS, which drives the height, the shadow and the tumble all at once.
return (age) => {
  lb.t = lb.flight * (0.06 + 0.88 * age)
  H.render()
}
