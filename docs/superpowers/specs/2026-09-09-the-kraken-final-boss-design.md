# The Kraken — hidden final boss chapter (design)

Status: **revision 2, 2026-09-13 — the arm model is rebuilt.** Book 2's hidden chapter, unlocked by
winning The Deep at difficulty 5 (mirroring The Blank at Beyond d5). Not a survival run: a
**scripted parry boss** — a ring of tentacles (4, 6 or 8 — the difficulty dial) shielding a head, a
wave and a new pattern as the arms break, victory on the head's death.

This is the book's punchline made into a fight. Undertow's arc ends "with something older living in
the rubbish"; The Kraken is that thing, and the wreck field you swam *between* in The Deep is its
body.

## Revision history

**Rev 1 — 2026-09-09.** Shipped as v7.320.0, deliberately as a placeholder spine (one pattern,
borrowed weapons, dev gate only). Its arm model was *"the tentacles are tanky and they sit between
your weapons and the head"* — an arm was an ordinary roster enemy with a large HP pool, and the
head's damage was softened by a live count of standing arms. **Superseded in full by rev 2.** Read
it for the fiction, the difficulty table and the wave shape, all of which survive.

**Rev 2 — 2026-09-13.** The arm stops being a creature and becomes **a lock and a door**. Four owner
rulings (below) and a measured post-mortem of rev 1 drive it. Everything in *The model* onward is
new; *Identity*, *Difficulty*, *Unlock* and the wave fiction carry forward.

## Why rev 1 failed — the post-mortem, measured

Rev 1's arm had **two jobs that fight each other**: it was a *shield* (geometry — it stands between
your weapons and the head) and it was *an enemy* (a health bar you point at). Fifteen chapters have
trained the player that the answer to a thing in front of them is to shoot it, and the game hands
them thirty-eight weapons that do exactly that. So the arms died to the answer the player already
owned, and the parry — the one new verb in the whole book — became decoration.

Headless probe, 3 seeds × 3 rungs, immortal stationary player carrying **only the starter weapon**:

| rung | blocks played | arms killed | of those, killed inside a breather wave | parries in the whole fight |
|---|---|---|---|---|
| D1 (4 arms, 3 blocks designed) | 1.0 | 4.0 | 3.0 | 1.0–3.0 |
| D2 (6 arms, 4 blocks designed) | 1.7 | 6.0 | 3.0–4.0 | 0.0–3.3 |
| D3 (8 arms, 5 blocks designed) | 1.0 | 8.0 | **6.7** | 2.7–3.7 |

The designed five-block D3 ladder plays as **one block → one wave → the chase**. A real loadout is
faster than this probe, not slower.

Three further faults, all of the *silent* class CLAUDE.md names:

- **`_hidden` had zero readers.** Written seven times in `stepKrakenScript`, read nowhere in `src/`.
  The head did not hide between blocks: it stayed on screen, stayed targetable, and took real damage
  during the breathers (46–190 HP per fight, measured). Same shape as the `_elFrozen` freeze bug.
- **The parry had no picture.** `parry`, `parryPerfect`, `blaze` and `headLunge` had zero cases in
  `render.js`, and nothing rendered an arm's wind-up at all — so there was no telegraph and no "now"
  tick to press against. **Run EV passed**, because its rule is a render case *or* an `SFX_FOR_EVENT`
  entry *or* a `SILENT_BY_DESIGN` line, and the four events had sounds. An event with a sound and no
  picture is a clean bill of health for a mechanic the player cannot see.
- **Difficulty was arm count and nothing else.** The parry windows, the telegraph fuse, the light
  drain and the head's HP were flat scalars; rev 1's own per-rung table was never wired.

**The lesson worth keeping: arm HP is a slider between "shoot them off" and "bullet sponge", with no
value in between that makes parrying correct.** A lock you can chip is not a lock. Plugging the wave
leak alone would not have saved it.

## The rulings (owner, 2026-09-13)

1. **An arm is a lock *and* a door.** Weapons cannot kill an arm — only parries can — **and** a
   parry holds that arm's sector open until it winds up again. A broken arm's sector is open for good.
2. **No skill floor, at any rung.** Weapons never touch an arm. A player who cannot find the timing
   cannot win this chapter. It sits behind a Deep win at max difficulty; being walled is the point.
3. **Breathers, plus a late trickle.** Waves stay between blocks and the head genuinely *leaves the
   field*; the graveyard then trickles in during the last block or two so the finale is not a metronome.
4. **Scope: the spine, plus Grip.** Rebuild the model, the sector geometry, the hide, the telegraph
   and its render tells, and wire the per-rung table — with Lash, **Grip** and the chase. Coil deferred.

## Identity

- id `kraken`, name **The Kraken**, tagline the owner's line — *"the graveyard is its domain"* — icon 🐙.
- **You are the diver in the deep dark**: the wreck field you swam *between* in The Deep, where the
  field is no longer scenery. The boss owns a **light rig of its own** — the refill is your parry,
  and there are no maws. **Nothing in the chapter reads `CHAPTERS.deep` or the Twilight.**
- The boss is **the head plus a ring of tentacles** — 4 on D1, 6 on D2, 8 on D3. The head is the
  creature; the tentacles are what it wears and what hides it. The pollution through-line,
  literalised: the arms are **furred with the Trawl's gear** — nets, longlines, chain.
- Fiction: it was here before the ships. You can outswim people and you can outswim what they threw
  away, but you cannot outswim what was already down here when they started throwing.

## The model — an arm is architecture, not a creature

### Where arms live

**Arms leave `run.enemies` and get their own array.** This is the one structural change, and the
reason is that under ruling 1 an arm is not a creature: it is a door with a health bar that exactly
one verb can turn. Leaving it in `run.enemies` means the game's ~25 `dealDamage` sites, the player's
auto-aim helper, every projectile-collision scan, the status system, the loot path, knockback,
separation, the straggler teleport and the spawn cap each have to learn an exception — and **every
one of those exceptions fails silently**. A projectile that is *consumed* by an invulnerable arm
eats your damage just as surely as one that damages it, and nothing throws.

Moving arms out makes all of those exclusions structural rather than remembered:

| Free by construction | Would otherwise be a remembered exception |
|---|---|
| No weapon can target, hit, pierce or splash an arm | ~25 damage sites + every collision scan |
| An arm drops no gem and no coin | the loot path in `dealDamage` |
| An arm cannot be frozen, chilled, ignited, feared or stunned | the elements system |
| An arm cannot be knocked back, pulled or teleported | `anchored` checks at 6+ sites |
| An arm does not count against the alive cap or the spawner | `MAX_ALIVE`, `flushSpawns` |

**The head stays an ordinary enemy.** It is a real creature you kill: weapon damage, the boss bar,
the loot on death, the win. The split is the design stated in code — *the head is a creature, the
arms are the architecture around it*.

### The three invariants — this is the contract

1. **Only a parry damages an arm.** Nothing else in the game can, at any rung.
2. **The head takes damage only from inside an open sector**, measured as the angle from the head to
   **the player**. Not the projectile, not the ally, not the orbital — the player. This keeps the
   rule to one sentence the player can act on (*stand in the gap*) and needs no source position
   threaded through `dealDamage`'s 25 call sites.
3. **A parried arm's sector is open until that arm next winds up. A broken arm's sector is open
   permanently.**

### Closed means closed

Rev 1 capped the shield so the head always took at least 20%. That leaks the metaphor: if a shut
door still lets damage through, the door is a multiplier. **A fully closed ring means the head takes
zero.** The way in is the parry, and only the parry.

### The loop, in one sentence

The arm that attacks you is the one nearest you, so the sector that opens is **the one you are
standing in**: the parry opens the door in front of you, your weapons pour through it until that arm
winds up again, and an arm you finally break leaves its door open for the rest of the fight. Your
firing lane is something you earn, lose, and eventually own.

That is also what makes the arm count a *structural* difficulty dial rather than a grind: 4/6/8 arms
is how much of the head is showing when the fight starts, and the player can see it.

### What the player is doing differently

Positioning stops being kiting and becomes **lane-keeping**: you want to be in front of an open
sector when your damage lands, which is usually the sector you just bought with a parry. The second
skill is reading wind-ups. Neither exists anywhere else in the game.

## The head hides by leaving

Rev 1's `_hidden` flag is deleted rather than given a reader. Between blocks the head **despawns**;
its HP is carried on the script state and it respawns with that HP when the ring re-forms. One
persistent pool across the whole fight, no new render contract field, and the "head is safe during
the breather" rule becomes true because the head is *not there* — which nothing can get wrong.

A strong player can still drop the head early and skip the rest of the ladder; **head death in any
block is a win.**

## Structure — the script

A scripted boss chapter: the boss script is the only spawner, and continuous spawning, formations,
elites, random anomalies and the 300 s victory timer are all off (identical to The Blank). The
Blank's phase changes are driven by boss death; the Kraken's are driven by **tentacle count**.

The fight opens with a wave, each non-final block ends in a hide + wave, and the final chase block
does not — 3 waves on D1, 4 on D2, 5 on D3. The full D3 ladder:

| Block | Arms | Pattern | Between blocks |
|---|---|---|---|
| 1 | 8 | teach: the **Lash** | → hide + wave |
| 2 | 6 | adds the **Grip** | → hide + wave |
| 3 | 4 | Lash + Grip, denser | → hide + wave |
| 4 | 2 | denser still, **+ the trickle** | → hide + wave |
| 5 | **0** | the head, fully bared — **the chase** | — victory on head death |

- A block ends when **two arms are down**, or earlier on head death.
- **D1 (4 arms)** — 3 blocks: Lash → Lash denser → the chase.
- **D2 (6 arms)** — 4 blocks: Lash → +Grip → both denser → the chase.
- **D3 (8 arms)** — 5 blocks, as above.
- **The late trickle** (ruling 3): from the block before the chase onward, graveyard dead arrive a
  few at a time *during* the block, so the last stretch is a choice between the arm winding up in
  front of you and the thing on your back.

## The patterns

- **P1 — the Lash** (all rungs, the teach). A telegraphed tentacle slab sweeps a band across the
  arena. The swinging arm is the parry target. Teaches the window, the tick, and the door.
- **P2 — the Grip** (D2 and up; first shown in block 2). An arm latches and yanks the player toward
  the head, pinning; parry at close range to break. **Its role under rev 2 is sharper than under rev
  1:** the grip drags you *out of the lane you earned*, and the parry that frees you opens the sector
  of the arm that grabbed you — which is wherever you have just been dragged. It is the pattern that
  proves the sector model, which is why it is the one built alongside the spine. Reuse the Blank's
  P2 binding-node shape and its existing `yank` event rather than inventing a movement machine.
- **P5 — the chase** (all rungs, the finale). 0 arms, the head is bared and it hunts, weaving the
  wreck field. Every few seconds it does a telegraphed **lunge** between the hulls — the one move of
  its own that keeps the finale from reading as The Blank's P3 with props.
- **P3 — the Coil** — **deferred** (ruling 4). A constricting ring closing the arena from the edges,
  survivable through a gap and deliberately *not* parryable, so the verb keeps meaning by not being
  the only answer. It is the right third pattern; it is not in this pass.

## Difficulty — 3 rungs, named modifiers

The ladder caps at 3 (per-chapter override, as the Blank does — **no D4**). Each rung is a smaller
boss (fewer arms, a shorter pattern ladder) *and* tighter in time and tolerance. **Rev 2 wires this
table; rev 1 shipped it as prose and left flat scalars in the code.**

| Rung | Name | Tentacles | Patterns | Parry window (good/perfect) | Telegraph fuse | Light drain | Head HP | Waves |
|---|---|---|---|---|---|---|---|---|
| **D1** | *First Light* | **4** | 2 — Lash, chase | 320 / 140 ms | 0.90 s | 1.0× | 1.0× | 3 |
| **D2** | *The Current* | **6** | 3 — +Grip | 250 / 110 ms | 0.70 s | 1.3× | 1.15× | 4 |
| **D3** | *No Light* | **8** | 3 — +Grip, denser | 210 / 115 ms | 0.55 s | 1.6× | 1.30× | 5 |

- Pattern cadence steps too: D1 1.0×, D2 1.15×, D3 1.30×.
- D3's perfect window is **115 ms, not 90**: 90 sat at phone-tap latency and read as luck. The good
  window stays above the ~150–200 ms reaction floor at every rung.
- The D3 **double telegraph** (two arms swinging in close succession) is the top of the curve and the
  single most phone-risky element. ⚠ *Iterate:* confirm on a ~195 px half-view with at most 1–2
  parryable strikes in flight.

## The parry contract

The global floor is intact: *at zero charge, or with nothing to parry, the button is the plain
shove.* The Kraken declares the second-verb flag and a no-spend resource, and the press site gets one
chapter-gated branch — an arm in its window → parry; nothing in a window → the floor.

- **Good** — press in the last window before impact. Hit negated, the arm takes a medium chunk, the
  sector opens, the bar refills a little.
- **Perfect** — a tighter sub-window at the very end. Bigger chunk, more refill.
- A *successful* parry does not eat the shove cooldown; a short parry cooldown stands in on the
  in-window path.

**The bar is light, and it is revenge.** It is your sight radius, on the shipped scrim/radius
machinery, but **parries are the only thing that refills it** — and a hit taken does *not* drain it,
so it can never read as an HP bar. At full, the next parry **blazes**: the attacking arm breaks
outright and the arena flashes to full radius.

⚠ **Rev 1 bug to not re-introduce:** the blaze fired only on the parry that *crossed* to full, so a
bar already at maximum could not blaze at all. It worked out to 1–2 per fight purely because the
passive drain cleared maximum within a frame. The rule is **"at full, the next parry blazes"** — test
the state before the refill, not the crossing.

- **The sight floor.** The bar is the telegraph's legibility, so it may not read to zero: the empty
  radius is floored at a readable value (**not** The Deep's 0.06, which rev 1 copied verbatim), and
  the fight opens at a readable level.

## Level economy

Each arm is worth a level, as chained XP — **but banked and paid on the hide**, one level-up screen
per block instead of one per arm. Eight modals inside one fight is too much interruption; the total
is unchanged. The waves top it up; the head's death is the win, not a level source.

## The waves — the graveyard wakes

The roster is the Kraken's own graveyard dead, boss-scoped ids written against the game's
chapter-agnostic behaviour flags, with **no read on `CHAPTERS.deep.roster`**. The kraken drops below
the wreck field, the field spawns its own dead in a ring with a gap door, clear-or-timeout on the
boss's own constants. The timeout is **shorter than the Blank's 20 s and always advances** — a
breather, not a second fight.

⚠ Rev 1 exported a wave-gap constant and never read it: the ring spawned closed. The gap door is part
of this pass.

## The loadout — an open problem worth naming

A parry boss pays damage in short windows, which makes **burst weapons excellent and sustained or
damage-over-time weapons close to worthless** — and the player has no way to know which they were
just offered. Rev 1 borrowed three weapons from other chapters and did not consider this.

Two shapes, undecided: hold sectors open long enough that sustained weapons still land (a tuning
answer to a design problem), or give the chapter a small dedicated set built for punish windows (its
own job, via design-a-weapon). **Not resolved in this pass** — flagged so the first playtest can
judge it with the question already asked.

## Render contract — what must exist for the fight to be playable

Rev 1's whole render surface for the boss was four SFX entries. Every item here is a thing the
player cannot play without:

- **The wind-up.** An arm's telegraph, visible as it counts down. There is no fight without it.
- **The "now" tick** at the parry window's start: a sharp 1–2 frame pale pop *on the attacking arm*,
  with its own rare SFX. The blaze is the *other* thing — a slow radial bloom from the head at full
  radius. **The two must not share a vocabulary**; at D3's cadence a single "flash" would be unreadable.
- **Open vs closed sector.** The single most important new read, and the one with no precedent in the
  game. It must be legible at a low bar, on a phone, against a rust-and-net-grey field.
- **A staged arm death**, not a pop: furred → furred-and-torn → bare → peels and sinks. At rest,
  adjacent arms leave a visible gap between them, so "fewer arms = less blocking" is visible.
- **The arms must not read as terrain.** Arms are the **pale** shape (net-grey/twine dominant, rust
  only as accent) with an always-on scrim punch, so the ring reads as *life* against the dead field.
- **The icon owns the read**: the head is the dominant 🐙 face, the arms a secondary low-contrast ring
  behind it. The card sells "a place that moved", not "eight tentacles".

**Run EV is not a sufficient guard here** — it accepts a sound in place of a picture. Any new guard
for this chapter's tells has to assert the render case specifically.

## Unlock, save, UI

- `kraken` lives outside the book's chapter ladder: never in the daily rotation, never in the unlock
  chain. Winning The Deep at difficulty 5 sets its unlocked flag — the shape of the Blank's Beyond-d5
  unlock. **Rev 1 never wired this**; the dev gate was the only way in.
- The Blank's hardcoded sites plus the per-book `hidden` array become a small shared
  `hiddenChapters()` list. The second hidden chapter is where that generalization pays for itself.
- Chapter select: a `???` mystery card once The Deep's difficulty 5 is unlocked, hint *"win The Deep
  at level 5"*; the full card only once unlocked. The Deep's star row shows its 5th gold star.
- **A stage-audit bug this chapter exposed:** the WIP check indexes a book's `chapters` array, which a
  `hidden` id is never in — so `wipFrom` structurally cannot gate a hidden chapter, and
  `chapter-stage.mjs` reported the Kraken as `live`, which auto-passed all three owner gates
  (played / art / fr) for a boss nobody had played. Worth fixing in the script independently.

## Loadout and rewards

- Weapon pool and starter are the Kraken's own; the starter is light-based and the pool never
  includes a Deep or Twilight weapon. See *The loadout* above for the open question.
- Winning pays out through the normal end-of-run path; the summary shows a one-off badge for the
  hidden unlock.
- **Victory line:** *"It was here before the ships. It will be here after you."*
  ⚠ *Iterate:* alt — *"You took its arms one by one. The sea keeps what you leave."*

## Testing

All logic is Pixi-free. Scenarios this pass must cover — **rev 1 shipped with four references to the
chapter, all of them about the dev gate, and nothing that played the fight**:

- **Only a parry damages an arm** — a full weapon volley into a standing arm leaves its HP untouched.
- **The head takes zero through a closed ring**, and real damage from inside an open sector.
- **A parry opens the parried arm's sector**, and it closes again on that arm's next wind-up.
- **A broken arm's sector stays open** for the rest of the fight.
- A block advances on **two** arms down, not one; head HP **persists across blocks**; **head death in
  any block is a win**; the head is **absent** during a breather.
- A perfect parry chunks more than a good one; **a parry at a full bar blazes** (the rev 1 bug).
- Wave clear-or-timeout advance; no timer victory; difficulty-3 cap; unlock on a Deep-d5 win.
- The per-rung table is **read**: the window, fuse, drain and head HP differ between D1 and D3.

## Measured — rev 2 as built (2026-09-13)

Headless probe, 6 seeds × 3 rungs × 4 policies, immortal player. The bot does the two things the
fight asks for: press inside the window, and **stand in an open sector**. `no-parry` keeps the
positioning and drops the button, which is the control that proves the lock.

| rung | policy | win | fight | blocks | parries (good/perfect) | blaze | grip | arms broken | head dmg in breather |
|---|---|---|---|---|---|---|---|---|---|
| D1 | no-parry | **0/6** | — | 1 | 0/0 | 0 | 0 | **0** | 0 |
| D1 | good | 6/6 | 127 s | 2 | 19/1 | 2 | 0 | 4 | 0 |
| D1 | perfect | 6/6 | 133 s | 2 | 0/10 | 2 | 0 | 4 | 0 |
| D2 | no-parry | **0/6** | — | 1 | 0/0 | 0 | 0 | **0** | 0 |
| D2 | good | 6/6 | 156 s | 3 | 32/0 | 2 | 1 | 6 | 0 |
| D3 | no-parry | **0/6** | — | 1 | 0/0 | 0 | 0 | **0** | 0 |
| D3 | good | 6/6 | 157 s | 4 | 19/12 | 3 | 5.7 | 8 | 0 |
| D3 | perfect | 6/6 | 162 s | 4 | 9/18 | 3 | 6 | 8 | 0 |

- **The lock is absolute.** Zero arms broken and zero head damage without the button, at every rung.
- **The ladder runs.** D1 2 ring blocks, D2 3, D3 4, then the chase — against rev 1's 1 at every rung.
- **The head is gone in the breather** (0 damage, against rev 1's 46–190 a fight).
- Fight length 111–162 s everywhere, which is the band the whole tuning pass was aimed at.
- Blaze 2–3 a fight, against the doc's 1–2 target. Slightly hot; left as-is for the first playtest.

Three bugs the build surfaced, all of the class that does not throw:

1. **Perfect parries were a net LOSS.** One parry opens one door, so fewer-but-better parries meant
   fewer firing windows: D3 perfect play read 255 s against good play's 167 s. Fixed by making a
   perfect parry *stall the arm's re-arm* — the reward has to be more door, not more chunk.
2. **The blaze could not fire.** The obvious "is the bar at max when you press" test has rev 1's
   disease from the other side: the drain leaves the ceiling within a frame, so peak Light read
   100/100 on every run and not one blazed. It is a **latch** now — the bar *having* filled is the event.
3. **The first parry of every run was a free broken arm.** `createRun` hands every resource chapter
   a full bar, so the latch armed on frame 1. Caught by run KR, not by eye.

## Open / iterate

1. **The loadout** (above) — burst vs sustained, dedicated set vs snapshot. First playtest decides.
2. **The Coil** — deferred by ruling 4, still the right third pattern.
3. **The open/closed sector read** — no precedent in the game; needs look options shot in-game
   against the real field, not chosen on paper.
4. **D3's double telegraph** legibility on a ~195 px half-view.
5. **The trickle's density** in the late blocks — enough to break the metronome, not enough to bury
   the wind-up you have to read.
6. Victory line — the book's landing is picked; the alt is still on the table.
