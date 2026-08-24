# The Reef as a circuit — design

**Date** 2026-08-24
**Status** design agreed, unimplemented, every number provisional
**Supersedes** nothing; the Reef's lane, spur field, air and throttle all survive and are reused

The Reef stops being a survival chapter. It becomes a **circuit**: a 24-ridge loop driven four
times against a countdown, scored on elapsed time, gated by finishing at all.

Owner, 2026-08-24: *"This should be like a micromachine race, and the scores are not enemies but
time to complete X laps. With like time to beat to pass to next level."*

The chapter is already most of the way there and nobody noticed. It has a side-on Ecco-style
corridor, a throttle on the stick (0.5x–3x), solid coral that pinches the passage, a boost button
that spends air, and a crowd already ruled to be scenery. What is missing is a *loop*, a *clock*,
*momentum*, and cards that move either.

---

## 1. Naming

Greps run before a line was written, as `renaming-safely` requires. All as identifiers, across
`src/`, `test/` and `scripts/`.

| Name | Role | Existing hits |
|---|---|---|
| `circuit` | the chapter flag | **0** |
| `swimthrough` | a checkpoint — a merged ridge you pass through | **0** |
| `lapSpurs` | ridges per lap | **0** |
| `raceClock` | the countdown, seconds | **0** |
| `run.lap` | lap index | 3, all prose in comments about the orca spiral. No identifiers. |

`arch` was the first choice and was rejected: zero identifier collisions, but eleven prose hits in
render.js — including a *root arch* and an *arched stub* that are real drawn objects. The one file
that would draw the Reef's checkpoint already uses the word for something else, which is the
one-fact-two-places trap wearing a hat. `swimthrough` is the diving term for a coral arch you pass
through, and it is unique in this repo forever.

`gate` was rejected on 140 existing hits.

---

## 2. The track — a loop, from one modulo

`spurAt(i, spec, seed)` (sim.js) is already a pure function of one integer index. It reads three
hashes off `i` and a braid off `sin(2πi / braidSpurs)`. Wrap **the noise index only**:

```
thick, w1, w2   <-  hash(i % lapSpurs)     the coral repeats exactly
c               <-  sin(2πi / 8)           unchanged
f               <-  i * spacing            true world position, never wrapped
```

`lapSpurs: 24`.

**24 must stay a multiple of `braidSpurs` (8).** The braid is `sin(2πi/8)`, period 8, and 24 is
three exact periods — so wrapping the index does not move the braid at all and the seam is
automatically continuous. Any `lapSpurs` not divisible by 8 puts a braid discontinuity at the lap
line that no other ridge has. This is the single hardest constraint in the document.

Lap length = 24 × 210 = **5040px**. At a realistic 180px/s that is ~28s, which is the owner's
"a lap should be 30s average". Four laps ≈ 112s.

### Swimthroughs are structural, not tuned

A ridge is `merged` when `2|c| < (w1 + w2)/2` — the two channels have closed into one gap and the
ridge has a single way through. With `braidSpurs: 8`:

- at `i % 8 ∈ {0, 4}` the sine is **0**, so `merged` is true regardless of the rolled widths;
- at `i % 8 ∈ {1, 2, 3}` the smallest separation is `2|c| = 260` against a maximum groove of 154,
  so nothing else can merge.

Merges therefore land on exactly every 4th ridge: **6 per lap, 24 per race**. Read the swimthrough
off `spurAt().merged`, never off `i % 4`, so retuning the braid moves the checkpoints with it.

Ridge 0 is a merge, so **the lap line is itself a swimthrough**.

⚠ A merged ridge is *route*-narrow, not *width*-narrow: one gap of up to 154px versus two gaps of
108–154 each. config.js calls it "the narrowest point in the level" and means the choice, not the
squeeze. If the swimthrough art implies a tight squeeze it will contradict the collider.

### Air pockets must loop too

Pockets are a **cell grid** (`pockets.cell: 640`), and 5040 / 640 = 7.875 — they will not repeat.

- `pockets.cell: 640 -> 630`, giving exactly 8 cells per lap.
- The refill spec gains an optional `lapCells`; when set, the along-lane cell index wraps at it.
  A no-op in the Shelf, Surf and Deep, which share `streamShafts`.

**`minDist` must be applied against the TRUE unwrapped position**, not the wrapped index.
`pockets.minDist: 420` clears pockets around the run origin so you do not start inside one. Wrap
that and the clearance repeats every lap — a permanent air-free zone at the exact ridge that is
also the lap line and an unconditional merge. Unwrapped, lap 1 keeps its clearance and laps 2–4
get the pocket like any other cell.

### The player must see the loop

A procedural coral corridor that silently repeats reads as a rendering bug, not a circuit — and if
the player never notices it repeats, the whole reason for choosing a loop over procedural terrain
evaporates. Three things, together:

- the lap-line ridge gets **its own art** — a distinct swimthrough you pass through, not just
  another merge;
- a **lap counter** on the HUD;
- a **split time** that flashes on crossing, against the previous lap.

⚠ **THE ART CANNOT CARRY THIS ALONE, AND MUST NOT BE ASKED TO.** A 390x844 phone shows 312 world px
ahead of the player in an x-lane (config.js:6830-6832), and the throttle tops out at 270px/s. The
lap-line ridge streams in no earlier than any other ridge, so the player gets:

```
 45px/s (min throttle)   312/45  = 6.9s of warning
180px/s (realistic pace) 312/180 = 1.7s
270px/s (max throttle)   312/270 = 1.2s
```

At speed that is nowhere near enough to read "this ridge is different" while also threading traffic.
**The crossing EVENT carries the read, not the approaching art** — a light shake/flash on
`swimthrough` (the `hurt` handler's damped `overload` variant at render.js:18714 is the template
for a non-damage event), the SFX entry, and the HUD split landing in the same instant. All three are
already mandated by §10 anyway; the change is that they are **load-bearing for legibility and may
not be cut as polish**. The art stays a genuine pleasure for the player at low throttle who is
looking around, without being asked to do a job it structurally cannot do at 270px/s.

⚠ **Where the art branch has to live.** Ridges are neither a sprite pool nor a rig — they are drawn
straight into one `Graphics` (`spurG`), redrawn when `run._spurRev` bumps. The helper `coralSegs`
**discards `sp.i` and `sp.merged`**, flattening each ridge into anonymous `[f, c0, c1, half]` tuples.
So the lap-line branch must happen **inside the existing per-`sp` loop**, reading `sp.i`/`sp.merged`
off the spur itself. Anything downstream of `coralSegs` has already thrown away the identity it
would need. Done there it is one extra `if` — no new pool, no new rig, and nothing for `run CP` to
police.

---

## 3. The clock

`run.raceClock`, seconds, counts down in real time. Every swimthrough tops it up. Zero ends the run
where you stand.

### The cap is load-bearing

The bank **tops up to a ceiling and never past it**.

`swimTime` is the seconds a swimthrough is worth. Without a cap the mechanic is a runaway. A fast player shortens the interval between swimthroughs
*and* banks more clock, so skill pays twice: slightly generous and the countdown is decorative from
lap 2, slightly stingy and everyone dies on lap 1 and never sees the other three. The window where
it is tense across all four laps is vanishingly narrow, and it narrows further the better the
player gets — the pressure inverts for exactly the players who need it.

Capped, it is self-correcting at every skill level:

```
clean pace     swimthrough -> pinned at cap, no gain
one crash      24 -> swimthrough -> cap (recovered)
two crashes    11 -> swimthrough -> 17  (bleeding)
```

The governing comparison, which must be stated in the config block:

```
swimTime  vs  mean seconds between swimthroughs at the pace the difficulty demands
```

### The countdown replaces the par — so the par is shown separately

There is no second target to author: finishing at all means you beat it. But a countdown hides the
number the owner asked for, so par is displayed **live on the HUD** alongside the clock, and again
on the summary against your own best.

### The HUD costs one new pill, not four elements

Four new readouts sound like four widgets. They are not:

1. **The countdown replaces the existing timer pill.** `updateHUD` already switches that slot's
   meaning by chapter — `scriptedChapter` drives a WAVE-n readout in the same place (ui.js:2201-2227)
   — and `fmtTime` is already there. Zero new footprint.
2. **Lap counter and live par merge into ONE new pill** — `LAP 2/4 · +1.4s` — placed in the band
   between the xp row and the Air rail, which is empty on a lane chapter and emptier still here
   (a weaponless Reef nearly empties the weapon-chip row). Roughly 370px of unused vertical space;
   the pill costs ~30 of it.
3. **The split-time flash reuses that same pill** via a transient class swap — the
   `hud-timer--debt` pattern, no extra DOM.

Two rules from the existing code, both already learned the hard way here:

- ⚠ **The new pill must carry its own `max-width`.** Without one it stretches into a thin bar across
  a wide desktop window — the exact bug already fixed once for the xp-bar, whose own comment records
  it going from ~300px on a phone to 1776px on desktop.
- ⚠ **Write to the DOM only when the cached value changed.** Every existing block in `updateHUD`
  compares against a `last.*` entry first; skipping that means writing `textContent` 60x/second,
  which is the anti-pattern the whole function is built to avoid. New DOM nodes must also exist in
  the HUD template at boot — refs are looked up once.

Unrelated but found while measuring, and worth a separate look: the Air rail's `top: 56%` clearance
was tuned in **percent-of-viewport against a player sprite whose drawn size is fixed px**, so it is
phone-specific and is not guaranteed to clear the fish on a desktop window. Pre-existing, not
introduced here.

---

## 4. Driving — the one genuinely new sim piece

Today the throttle is instantaneous: stick position to speed, no inertia. A racer needs momentum,
and momentum is what makes every card legible.

Today (sim.js, in the `if (ax)` branch of `stepPlayerMovement`):

```js
p[ax.vFwd] = ax.dir * laneScrollFor(ch, run.mods) * burstMul * run._laneThrottle
```

Becomes a speed that *eases* toward that expression:

```
target          = laneScrollFor(ch, mods) * _laneThrottle * burstMul
run._laneSpeed  eases toward target at CIRCUIT_ACCEL px/s²
p[ax.vFwd]      = ax.dir * run._laneSpeed
```

and four events cost you speed rather than health:

| event | effect |
|---|---|
| crash into coral | `_laneSpeed *= CIRCUIT_CRASH_MUL`, steering locked `CIRCUIT_CRASH_LOCK` s |
| clip a fish | `_laneSpeed *= CIRCUIT_CLIP_MUL`, no damage |
| oil slick (elite) | turn rate `* CIRCUIT_SLICK_TURN` for `CIRCUIT_SLICK_T` s, no damage |
| boost | existing `BURST_SPEED_MUL`, spends air |

⚠ **OPEN: where a crash is actually detected, and whether a crash can be told from a graze.**
`stepSpurs` short-circuits to a no-op whenever the chapter declares a `cave` — and the Reef declares
**both** `cave` and `spurs`. So `spurs.solid: true` may not be what stops the player today; the cave
wall may be. Until that is settled, the crash site above is unsited.

The design question behind it matters more than the plumbing: **the corridor pinches, so the player
is frequently sliding along coral.** If every touch counts as a crash, the momentum penalty fires
almost continuously and the chapter is unplayable. Either the collision site can distinguish a
head-on hit from a glancing graze — by approach angle or by speed lost — or the crash rule needs its
own test and a graze needs to stay free. This must be resolved before `CIRCUIT_CRASH_MUL` means
anything.

Coral still **grates HP** (`SPUR_DPS`) — the owner ruled HP and death stay real — so a scraped race
can still end in death. That plus the d3+ front are the only ways to die.

**The boost already works.** `p[ax.vFwd] = ax.dir * laneScrollFor(...) * burstMul * _laneThrottle`
multiplies the *lane advance*, not just the strafe. The racing boost button exists and needs no
work beyond momentum.

### Air is fuel for the boost, and nothing else

Owner, 2026-08-24: *"Air is fuel for boost action button."*

- **`resource.drown` is removed for a circuit.** An empty bar no longer damages you and no longer
  caps your speed — it simply means no boost until you find a pocket. Coral and the d3+ front are
  the only ways to die.
- **The ambient drain stays at 1.4/s.** The bar bleeds whether you boost or not, so crossing the
  lane for a pocket is a decision you make every lap rather than only after spending. It is also
  the measured number the whole pocket field was tuned against.

⚠ **This invalidates a load-bearing config comment.** `laneThrottle`'s block states that what stops
the player simply holding 0.5x forever is the air. With air no longer lethal, that is false — **the
clock** is what prices the slow end now, and the coral still prices the fast one. Rewrite that
paragraph rather than leaving it to rot against the mechanic it describes.

### The camera and the front

In a circuit the **camera anchors to the player**. Today it anchors to the lane front's trailing
edge, which is wrong for a racer and wrong for a chase you are meant to outrun.

The front (`stepLaneFront`) then exists **only at difficulty ≥3**, and there it advances at a
fixed `chasePace` px/s, *not* carried forward by the player as it is today
(`Math.max(front + …, along(p.fwd))`). Decoupling it is the whole point: it means getting ahead
banks real distance, and the wall behind you is the par time made spatial.

`sweepAstern` needs no change — it measures against `along(p)`, the player, not the front.

⚠ **The camera branch must key off `circuit`, never off `lane`.** It is one line —
`camFwd = run._laneFront ?? …` at render.js:20602 — but `chapterHasLane` is `cfg.lane === true`
and **The Beyond sets that too**. Hanging the player-anchored camera off `lane` silently converts
The Beyond's chase camera as well, which is exactly wrong for a chapter whose whole design is being
pursued. There is no existing per-chapter camera branch to hang this on; the camera code is
entirely generic today.

---

## 5. The cards — no weapons, few level-ups

`weapons: []`, `starter: null`, a Reef-scoped racing pool. XP comes from swimthroughs; nothing is
killable, so this is forced rather than chosen. Coins likewise, plus a finish bonus scaled by time.

**Four new entries, not six.** Two of the six stats first proposed already exist:

| stat | how it is delivered |
|---|---|
| top speed | **new** — the throttle ceiling above 3x |
| acceleration | **new** — how fast `_laneSpeed` recovers, i.e. the crash tax |
| lungs | **new** — air capacity, so boost stays affordable |
| boost | **new** — burst duration and strength |
| handling | **`PASSIVES.moveSpeed`, unchanged.** In a lane chapter `moveSpeed` feeds the CROSS axis only — sim.js's own comment: "move-speed upgrades buy a faster strafe and never a faster scroll". That is precisely handling, already shipped, already translated, already balanced. |
| ~~hull~~ | **cut. `PASSIVES.armor` already is it** — it blocks the coral grate through `hurtPlayer`, which every player-damage path funnels through. A new card doing the same job is the thing this project keeps deleting. |

`armor`, `regen` and `maxHP` stay in the Reef's pool: coral damage is real, so all three still work.

**Only 3–4 level-ups in a race**, against a measured baseline of **35 in a full 300s run**
(`body`, d1, immortal — config.js:250-256). That is an 8–9x cut in level-up *rate*
(0.117/s → 0.031/s), not merely a shorter race, and it is the point: four linear stat bumps handed
out thirty times converges every run on the same build and makes the screen a formality.

Names are provisional and the owner's to rule. Per `game-art-and-copy`, shoot the cards before
naming them.

### Scoping the pool — extend the mechanism that exists

`ANOMALIES` already carry a `chapter` field, checked in `eligibleAnomalyIds` (sim.js:11919), and
three cards use it today — including `lastBreath: 'reef'`. **Copy that pattern; do not invent a
scoping primitive.** One `if` each in `eligiblePassiveIds` and `eligibleElementIds`, beside the
`lane && id === 'magnet'` exclusion that already does this same kind of thing (sim.js:11671).

Three pools must be scoped, and the third is not optional:

1. **Passives** — the Reef offers the four new stats plus `moveSpeed`, `armor`, `regen`, `maxHP`.
   `damage`, `fireRate`, `critChance` and `critDamage` are dead without a weapon. (`magnet` is
   already excluded in every lane chapter.)
2. **Elements** — **all of them are dead.** `run.elements[id]` only becomes an effect through
   `applyElements`, called from `applyDamage`'s hit path, which requires a weapon hit. Cheapest
   general fix, covering any future weaponless chapter for free: return `[]` when the chapter's
   weapon pool is empty.
3. **Anomalies** — an **allowlist**, not a blocklist. See §6a.

⚠ **The element gate is load-bearing for more than card quality.** The `heal` fallback in
`buildLevelUpChoices` only fires when all four pools are empty at once. Without the gate,
`elementIds` never empties, so every level-up past passive-exhaustion silently deals a dead element
card forever. With the gate, exhaustion needs ~30 picks against a 3–4 pick budget, so the fallback
is unreachable in practice — which is the correct outcome.

### `starter: null` is an audit, not a line

`createRun` (state.js) builds `weapons: [{ id: starterId, level: startWeaponLevel }]`
**unconditionally**, so a null starter puts `{ id: null }` into the array rather than leaving it
empty. Every firing site, the HUD, `MAX_WEAPONS`, the level-up offer builder and the summary screen
assume a populated weapon list. All of them need checking.

---

## 6. Traffic, slicks and mutators

- **The fish are traffic.** `passiveCrowd` already zeroes their contact damage chapter-wide and
  makes them swim down the lane. Clipping one costs momentum. A moray parked in the good groove is
  a chicane — the roster stops being decoration and becomes the thing that makes the fast line hard
  to hold.
- **The elite is an oil slick.** `soapTrail` keeps laying its trail; in a circuit it deals no damage
  and instead costs grip. An unkillable fish leaving a slick down the racing line is a proper
  hazard, and it is the flag that already exists.
- **The mutator roll is replaced.** Eight of the Reef's twelve eligible mutators go inert in a
  weaponless race (`enemyHpMul`, `playerDmgMul`, `contactDmgTakenMul` — contact damage is already
  zero — and all four element mutators), and `tidalRace` hands out a 1.4x scroll, which is free
  time on a board sorted fastest-first. Three race mutators replace them:

  | | effect |
  |---|---|
  | heavy traffic | denser crowd, richer coins |
  | tight braid | `grooveMax` reduced |
  | thin air | pocket chance reduced |

  **Nothing in the race set may touch scroll, throttle or speed** — that is what keeps times
  comparable within a difficulty.

  `tidalRace` itself is **orphaned**: kept in `MUTATORS` with no chapter, mirroring the `squidInk`
  precedent for a retired-but-not-deleted entry. Reversible, and it keeps the art and copy.

---

## 6a. The inert-card class — the real size of it

Removing the weapons does not merely delete combat; it silently guts three card pools, and the
worst of what is left is not *nothing*, it is a **trap**. Every entry below was verified against
its trigger site, not inferred from its name.

| category | cards | what the player experiences |
|---|---|---|
| **Content-free** | `berserk`, `stillness`, `ipecac` | offered, taken, banked, does literally nothing |
| **Net-negative traps** | `brittle`, `overload`, `bloodPact` | **real cost, fake payoff.** `brittle` sets max HP to 1 for a damage buff that cannot exist; `overload` drains HP continuously for a fire-rate bonus with no weapon to fire; `bloodPact` stops all healing for a per-kill snowball in a chapter with no kills. Each reads as a fair trade and loses the run. |
| **Live but purposeless** | `martyr`, `minimes` | real mechanics that damage fish which were never a threat |
| **Self-excluding** | `specialist`, `wildfire`, `alignment`, `soyMilk`, `unstableCores`, `submission` | their `when` predicates already fail with no weapon, no element or no kill. No work. |
| **Fully alive** | `bloodMoney`, `blindFaith` | no weapon or kill dependency at all |
| **Needs a ruling** | `chaosPact`, `timeDebt`, `avarice` | partially real. `chaosPact` is the worst: its `when` gates on `RUN_DURATION - run.time`, so in a 112s race it reads "plenty of time left" throughout — a real cost (denser traffic) for a dead reward. |

**The allowlist is the fix, and it must be an allowlist.** A blocklist fails *open*: every anomaly
added to the game later is offered in the Reef by default, and whoever adds it has to remember this
one chapter has no weapons. An allowlist fails *safe* — a new card is off here until someone opts
it in deliberately.

### `lastBreath` is already shipped and already falsified

`ANOMALIES.lastBreath` is `chapter: 'reef'` — the Reef's own exclusive anomaly, live today, needing
no gate to be reachable. Its fiction is **drowning**: *"your damage rises as your Air empties…
while you are drowning, everything hurts you twice as much."* §4 of this document deletes drowning.
Its damage half is dead (weapon-dependent); its double-damage-taken half still works.

**Ruling: re-point it at the race clock.** ⚠ This is a new mechanic under an existing name, which
is exactly the trap `renaming-safely` describes — so the name has to still be *true*, not merely
reused. It is: on a circuit, your last breath is the last seconds on the clock.

Proposed, and to be confirmed before implementation: when `raceClock` falls below a threshold the
fish makes a desperate surge — a real speed gain — and takes double damage for as long as it lasts.
That keeps the card a *trade* rather than a death spiral (the original was a trade too: you chose
to run dry), gives a losing race a comeback line, and reuses the already-live double-damage half at
sim.js:3160 with only its trigger condition changed. **The copy must be rewritten with the
mechanic**, in the same commit, or the card contradicts itself the way it does today.

---

## 7. The difficulty ladder

A 112s race only reaches the first ~37% of `hpScale`, `dmgScale` and `spawnRate`, all of which are
tuned against the 300s clock. Those curves are nearly inert here, so the ladder cannot rest on
them. Three levers, each a different kind of pressure:

| lever | d1 → d5 | why it is a different pressure |
|---|---|---|
| `swimTime` | falls monotonically | the race gets tighter |
| clock cap | falls monotonically | less recovery is bankable from a clean stretch |
| traffic density | rises monotonically | the fast line is harder to hold, not just tighter |
| the front | **absent below d3**, chases at `chasePace` from d3 up | a spatial deadline instead of a numeric one |

No cell here carries a number: all four are outputs of §11's knob grid, and writing a guess into
this table is how it becomes the number that ships. The *shape* is the ruling — monotonic on the
first three, a hard step at d3 on the fourth.

Winning at difficulty ≥3 still unlocks the next chapter, unchanged.

---

## 8. Score, save and leaderboard

- **Score is `run._realTime`** at the moment lap 4 completes. It is already tracked and already
  immune to the Time Debt anomaly, per its own comment in sim.js.
- **The leaderboard is nearly free.** A shortest-first time board already exists, built for boss
  kill times, with `timeMs` null everywhere else and NULL rows skipped by the Worker. Widen one
  condition:

  ```js
  // today
  timeMs: victory && CHAPTERS[chapter]?.scripted ? Math.round(run.time * 1000) : null
  ```

  ⚠ **The condition and the unit both change.** That line reads `run.time`, not `run._realTime`.
  Widening the condition alone lets Time Debt distort a race time on a fastest-first board.

  `kills` goes null for a circuit chapter — a kills board of all zeroes is a board about nothing.
- **`best.time` must not be repurposed.** It is max-compare today ("longest survived"); a race best
  is min-compare. `meta` is additive-only (R2): add `best.lapTime`, absent or 0 meaning none. A
  rename is a delete plus an add, and the old build carries the corpse forward.

---

## 9. What leaves the Reef

| | where it goes |
|---|---|
| Oxygen Tank | **rehomed to the Wreck** — a scuba tank in a shipwreck is where it always belonged |
| Pistol Shrimp | dropped |
| Fire Coral | dropped |

The Pistol Shrimp redesign shipped in v7.227.0, two releases before this document. Dropping it is a
deliberate decision taken with that known, not a side effect.

---

## 9a. THE FIRST COMMIT, ALONE — the null starter aborts the whole suite

This is a sequencing constraint, not a cleanup, and it outranks everything else in the document.

`createRun` pushes `weapons: [{ id: starterId, level: startWeaponLevel }]` unconditionally
(state.js:2273), so `starter: null` seeds a `{ id: null }` **corpse** rather than an empty array.
`effectiveWeaponStats` then dereferences `WEAPONS[w.id].levels` (sim.js:6878) from `stepWeapons`
**every frame**, so a Reef run throws on frame 1.

The part that matters: **`run(fn)` in test/sim-test.js:192 has no try/catch.** One uncaught
`TypeError` ends the synchronous script, and every scenario registered after it never executes and
never reports. `npm test` does not go red in a legible way — it aborts partway and reports nothing
past that point. Four reef fixtures drive `stepSim` without clearing `run.weapons` first, and
`run LX` is among the earliest to run.

```js
// state.js:2273 — the whole fix
weapons: starterId ? [{ id: starterId, level: startWeaponLevel }] : [],
```

Land this **first, on its own, verified** before any other work. Every other throw in the audit
collapses into it. A genuinely empty `run.weapons` is already safe and already exercised: dozens of
existing scenarios disarm the player with `run.weapons = []` mid-test and keep stepping, and
render.js contains zero references to `run.weapons` at all.

---

## 10. Silent failure modes

Every one of these fails green.

**Three existing guards give false confidence — none of them will catch what they look like they
cover:**

- **`run MB.a` structurally cannot see the weapon orphaning.** It is a source-text existence check,
  so it stays green whether or not any player can reach Pistol Shrimp or Fire Coral. The codebase
  already has the right pattern — the `squidInk` orphan check — asserting a weapon is in `WEAPONS`,
  has mods, and appears in **zero** chapter pools. Write that for both dropped weapons.
- **`run LB` will read green whether or not the `_realTime` switch happens.** It regex-matches the
  words "victory" and "scripted" in the `timeMs` expression and never inspects *which time field* is
  used, nor the `kills` gating. Both of §8's requirements are invisible to it.
- **`run DV` gives zero Reef coverage.** Every `createRun` in it resolves to `body`, so it never
  instantiates a Reef run and proves nothing about a weaponless dev menu.

**And one gap where no guard exists at all:**

- **Nothing today would catch a broken `spurAt` wrap.** `spurAt` is called twice in the entire
  suite, both comparing a snapshot against a live call *at the same index* — that proves internal
  consistency, never periodicity or seam continuity. A new assertion must sample across the lap
  boundary and assert `spurAt(i) ≡ spurAt(i + lapSpurs)`. Changing `lapSpurs` from 24 to 25 must
  turn it red, and it needs a second, distinct mutation that breaks periodicity without touching
  `lapSpurs`.
- **Nothing enumerates chapter/mutator compatibility either**, which is why "eight of twelve go
  inert" was invisible. A new race mutator shipping with no measurable effect would be equally
  invisible.

**Known breaks, all evidenced — these are honest test rewrites, not regressions:**

| scenario | why |
|---|---|
| `run RN.a` | asserts the Reef's exact pool and starter; its leak-check also fires once Oxygen Tank joins the Wreck |
| `run RS.e` | asserts full 3x throttle velocity after **one 1/60s frame** at 1e-6 tolerance — categorically impossible under momentum |
| `run RP.i` | asserts `tidalRace.chapters === ['reef']` |
| `run DA.a/b/c` | all three use drowning as the Reef's only damage source; DA.c must be rebuilt to drive into coral, since "stand still and die" no longer exists |

⚠ **`_laneSpeed` must initialise to the chapter's nominal scroll, not 0**, or The Beyond's control
check in `run RS.e` breaks too.

⚠ **Dropping the two weapons may orphan their `fr.js` entries.** `run XX` checks for *dead* French
keys as well as missing ones, so this can turn red from the opposite direction.

- **The 300s victory must be gated off.** `stepSim` wins at `run.time >= RUN_DURATION` unless the
  chapter is `scripted`; a circuit needs the same exemption or every race ends at 300s regardless.
- **run EV** — new events (`swimthrough`, `lap`, `crash`, `slick`) each need a render case, an
  `SFX_FOR_EVENT` entry, or a written line in `SILENT_BY_DESIGN`.
- **run XX** — new card and HUD copy must sit in a config **table** with `.name`/`.desc` **one
  level deep**, plus `fr.js`. Copy in a function or a bare const is exempt from the walk by
  construction, which has shipped untranslated strings four times.
- **run MB.a** — dropping the weapons orphans their mods. MB.a will not catch it: the mods still
  resolve to their folds, they are simply unreachable.
- **run CP / `reset()`** — anything new that pools sprites must be in `clearWorld`'s flat list, and
  a rig must be moved out of the flat-pool loop or its `visible = false` sets a dead property on a
  plain object and last race's entities stay on screen.
- **`CHAPTER_ORDER` is Book 1 only.** The Reef is Book 2. Any sweep asserting "every chapter" must
  use `Object.keys(CHAPTERS)` and print its denominator.
- **Spawn density** is tuned against 300s and a race sees a third of it. Traffic needs its own
  number rather than inheriting the ramp.

---

## 11. What must be measured before anything ships

No number in this document is measured. Load `probing-the-game` first.

1. **Lap time distribution** — a new probe driving the circuit at several skill policies, to
   establish the mean seconds between swimthroughs. Everything about the clock derives from it.
2. **`swimTime` and the cap, per difficulty** — a knob grid, not a guess. A countdown tuned by
   feel ships unplayable.
3. **The air economy under momentum** — `scripts/charge-probe.mjs --chapter reef`. Its own comment
   already flags the 3x throttle ratio as unmeasured, and momentum changes the px-of-lane-per-second
   relationship the pocket field was tuned against.
4. **Traffic density per difficulty** — clip rate per lap is the readable statistic.

---

## 12. Deferred

- Card names and art — shoot them first, then name them (`game-art-and-copy`).
- French copy for every new string — the owner's call, never a translation subagent.
- Whether the summary's "Killed by …" line needs a new source label for the clock.
