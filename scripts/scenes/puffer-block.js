// Scene: BITING A PUFFED PUFFERFISH. The owner (2026-09-06) reported that it is not clear enough
// that the first bite is refused, and these frames are what that judgement has to be made on.
//
//   npx vite --port 5211 --strictPort
//   node scripts/fx-probe.mjs --scene scripts/scenes/puffer-block.js --chapter wreck \
//     --url 'http://127.0.0.1:5211/?fxphase=armed' --out /tmp/puff-armed --frames 2
//   node scripts/fx-probe.mjs --scene scripts/scenes/puffer-block.js --chapter wreck \
//     --url 'http://127.0.0.1:5211/?fxphase=block' --out /tmp/puff-block --frames 5
//
// SHOOT BOTH STATES: `armed` is the inflated warning and `block` is the refusal, and a telegraph
// judged only on its payoff frame is not judged.
//
// ⚠ THE REFUSAL IS AN EVENT EFFECT, SO IT MUST BE CAUGHT ON H.tickFx AND NOT H.tick. The burst is
// spawned by handleEvents off {type:'puffblock'}; H.tick DROPS its step's events and H.render syncs
// with a hardcoded [], so a scene built on those captures a frame with the effect simply absent and
// no error — indistinguishable from "the tell is invisible", which is the exact question being
// asked here. The first cut of this file did that and reported a blocked bite with nothing on
// screen. tickFx forwards them.
const phase = new URLSearchParams(location.search).get('fxphase') || 'block'

H.weapon('gnash', 3)
// A real crowd, because the tell has to survive THIS chapter: ~120 bodies and the biggest spawn
// rate in the game. A mark that reads against empty water is not the question.
H.breed(16)
const crowd = H.keep(16)
H.place((i, p) => ({
  x: p.x + 60 + Math.floor(i / 4) * 62 + (i % 3) * 14,
  y: p.y + ((i % 4) - 1.5) * 58,
}))

// The subject: a real pufferfish, PINNED BY IDENTITY and parked inside the jaw's reach so the next
// sweep lands on it. Never by array index — this chapter splices constantly.
const puff = crowd.find((e) => e.rosterId === 'pufferfish') ?? crowd[0]
puff.rosterId = 'pufferfish'
if (!puff.flags.includes('puffup')) puff.flags.push('puffup')
puff.hp = puff.maxHP = 1e7
const hold = () => {
  puff.x = run.player.x + 46
  puff.y = run.player.y
  puff.speed = 0
  // A pinned cast struck every frame never stops flashing white over the thing being judged, and a
  // body that dies mid-warm-up leaves a hole in the frame.
  for (const e of run.enemies) { e.hp = e.maxHP; e.hitFlash = 0 }
  run.player.hp = run.player.maxHP
  run.player.invuln = 0
}

// Inflate it. stepPuffUp arms inside PUFFER_TRIGGER_R, so holding it close does the work. Warm up on
// H.until (which drops events) so the capture is not buried under the whole warm-up's numbers.
H.until(() => { hold(); return (puff.puffT ?? 0) > 0 }, 600)

if (phase === 'armed') {
  hold()
  H.note(JSON.stringify({ phase, puffT: +(puff.puffT ?? 0).toFixed(2), pose: 'inflated ball' }))
  return
}

// Now hand over to tickFx and let the jaw land, so the refusal's own burst actually reaches the
// renderer. Waits on puffPopT rather than on the event: run.events is spliced every step, so a
// one-frame event is a coin flip to catch, and PUFFER_POP_T is ~19 frames of window.
let fired = null
for (let i = 0; i < 240 && !fired; i++) {
  hold()
  const evs = H.tickFx(1 / 60)
  const ev = evs.find((x) => x.type === 'puffblock')
  if (ev) fired = { angle: +(ev.angle ?? 0).toFixed(2), r: Math.round(ev.r ?? 0) }
}

H.note(JSON.stringify({
  phase,
  blocked: !!fired,
  ev: fired,
  puffT: +(puff.puffT ?? 0).toFixed(2),        // 0 — the MECHANIC ends on the refused bite...
  puffPopT: +(puff.puffPopT ?? 0).toFixed(2),  // ...and this is what holds the BALL up for a beat
  hpUnchanged: puff.hp === puff.maxHP,         // true — no damage was dealt
}))

// Frames from the refusal onward at real time, so the burst's whole life is covered and the shot is
// honest about how long the player actually has to notice anything.
return () => {
  hold()
  H.tickFx(1 / 60)
  hold()
  H.tickFx(1 / 60)
}
