# The Reef as a circuit — design

**Date** 2026-08-24
**Status** rev 2 — design agreed, unimplemented, every balance number provisional
**Supersedes** its own rev 1 §2, which was built on dead code. The Reef's lane, cave, air and
throttle all survive and are reused.

The Reef stops being a survival chapter. It becomes a **circuit**: a 5040px loop driven four
times against a countdown, scored on elapsed time, gated by finishing at all.

**Revision history.** Rev 1 built the track on `spurAt`'s ridge/braid/merge model. A recon pass
found that model unreachable — `stepSpurs` bails for any chapter with a `cave`, and the Reef gained
one on 2026-08-23, the day before rev 1 was written. Rev 2 rebuilds §2 on `caveAt`, the live
geometry, and re-sites the crash detection accordingly. The clock, the cards, the scoring and the
progression are unchanged.

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
| `swimthrough` | a checkpoint — the passage at its narrowest | **0** |
| `lapLen` | px per lap (5040) | **0** |
| `raceClock` | the countdown, seconds | **0** |
| `run.lap` | lap index | 3, all prose in comments about the orca spiral. No identifiers. |

`arch` was the first choice and was rejected: zero identifier collisions, but eleven prose hits in
render.js — including a *root arch* and an *arched stub* that are real drawn objects. The one file
that would draw the Reef's checkpoint already uses the word for something else, which is the
one-fact-two-places trap wearing a hat. `swimthrough` is the diving term for a passage you swim
through, and it is unique in this repo forever.

`gate` was rejected on 140 existing hits.

⚠ Rev 1 also proposed `lapSpurs` — **dropped with the ridge model**. There are no ridges to count;
the lap is a distance. Do not reintroduce the name, and do not let `spurAt`/`spurs` vocabulary back
into the circuit code: those identifiers still exist and still run, they simply have no consumer,
and a new mechanic naming itself after them would look wired when it is not.

---

## 2. The track — a loop on the CAVE, not on the ridges

⚠ **Rev 2 rewrote this section completely.** Rev 1 built the loop on `spurAt`'s ridge index and its
`merged` braid. **That model is dead code.** `stepSpurs` (sim.js:4265) opens with
`if (CHAPTERS[run.chapter].cave) { run._scraping = false; return false }`, and the Reef declares a
`cave` — so it bails every frame before touching `run.spurs`, before charging `SPUR_DPS`.
`grep "\.merged\b" src/sim.js` returns exactly one line: `spurAt`'s own assignment. **Nothing reads
it.** The cave landed 2026-08-23, one day before rev 1, on the owner's ruling that "coral forms the
caves and the paths". Rev 1 read `spurs.solid: true` in config and never checked whether the
function honouring it was reachable.

The live geometry is `caveAt(f, spec, seed)` (config.js:9423) — a **continuous** passage with no
ridge index and no discrete narrowest point:

```
c   centre, summed sines over spec.waves        [[900,1], [380,0.42], [170,0.18]]
hw  half-width, over spec.widthWave             [[640,1], [250,0.45]]
ph  a forking island's half-width, 0 elsewhere  branch { every:700, chance:0.7, span:380, frac:0.28 }
```

### The loop: retune the wavelengths to divide the lap

`f % lapLen` would repeat by construction but leaves a visible jump at the seam. Instead make the
generator **genuinely periodic**: every wavelength an exact divisor of the lap. The live values sit
remarkably close to divisors of 5040 already, so the cave keeps its character.

| | live | tuned | lap/len | drift |
|---|---|---|---|---|
| `waves[0]` | 900 | **840** | 6 | −6.7% |
| `waves[1]` | 380 | **360** | 14 | −5.3% |
| `waves[2]` | 170 | **168** | 30 | −1.2% |
| `widthWave[0]` | 640 | **630** | 8 | −1.6% |
| `widthWave[1]` | 250 | **252** | 20 | +0.8% |
| `branch.every` | 700 | **720** | 7 | +2.9% |

**Six values, not five — `branch.every` is one of them.** Verified by direct computation against the
shipped `caveAt`:

```
retuned   max|Δc| = 9.7e-13   max|Δhw| = 4.0e-13     <- repeats to float precision
live      max|Δc| = 173.1     max|Δhw| = 20.6        <- control: today it does not repeat at all
```

⚠ **The branch needs its own index wrap, and the wavelengths alone do not give it.** The island
hashes a *cell index*, `Math.floor(f / bs.every)`, which keeps climbing across laps — so the same
place on lap 2 rolls a different fork. Measured: **57px of island discrepancy** with the wavelengths
already retuned. Wrap the cell (`cell % (lapLen / bs.every)`) or the forks do not repeat. This is
the exact trap rev 1 described for the ridge index, in the one place it still applies.

Lap length stays **5040px** ≈ 28s at a realistic 180px/s — the owner's "a lap should be 30s average".
Four laps ≈ 112s.

### Checkpoints: the narrowest points of the passage

There are no merges to be checkpoints. Instead, **scan `hw(f)` across one lap and take its local
minima** — the genuinely tightest squeezes on the circuit. The lap is periodic, so this is computed
**once** and reused for every lap and every run at that seed.

This is better than what rev 1 proposed, not a fallback. A merged ridge was *route*-narrow, not
*width*-narrow — one gap of up to 154px against two gaps of 108–154 — so "the checkpoint is the
tightest point on the track" was never literally true. With a continuous width function it is.

Target ~6 per lap, matching rev 1's cadence. `widthWave` is two summed sines, so the count of minima
is a property of the tuned wavelengths and must be **verified, not assumed** — if the retune yields
too few or too many, take the N deepest, and record the actual count.

### Air pockets must loop too

Pockets are a cell grid (`pockets.cell: 640`), and 5040/640 = 7.875 — they will not repeat.

- `pockets.cell: 640 -> 630` (8 exact cells per lap), and the refill spec gains an optional
  `lapCells` that wraps the along-lane cell index. A no-op in the Shelf, Surf and Deep, which share
  `streamShafts`.
- **`minDist` applies against the TRUE unwrapped position.** `pockets.minDist: 420` clears pockets
  around the run origin; wrap that and the clearance repeats every lap, leaving a permanent air-free
  zone at the start line. Unwrapped, lap 1 keeps its clearance and laps 2–4 get the pocket.

### The player must see the loop

- the lap line gets **its own art** — a landmark you pass through;
- a **lap counter** on the HUD;
- a **split time** that flashes on crossing.

⚠ **THE ART CANNOT CARRY THIS ALONE, AND MUST NOT BE ASKED TO.** A 390x844 phone shows 312 world px
ahead of the player in an x-lane (config.js:6830-6832), and the throttle tops out at 270px/s:

```
 45px/s (min throttle)   312/45  = 6.9s of warning
180px/s (realistic pace) 312/180 = 1.7s
270px/s (max throttle)   312/270 = 1.2s
```

At speed that is nowhere near enough to read "this is the lap line" while also threading traffic.
**The crossing EVENT carries the read** — a light shake/flash (the `hurt` handler's damped
`overload` variant at render.js:18714 is the template for a non-damage event), the SFX entry, and the
HUD split landing in the same instant. All three are mandated by §10 anyway; the change is that they
are **load-bearing for legibility and may not be cut as polish**.

⚠ **Where the art branch lives.** The passage is drawn from `caveAt` into a single `Graphics`
(`spurG`), redrawn when `run._spurRev` bumps — neither a sprite pool nor a rig, so `run CP` has
nothing to police as long as no new pool is introduced. render.js's own comment states the contract:
"ONE DEFINITION, TWO CONSUMERS: stepCaveWall stops the player against the same caveAt this draws
from." The lap-line landmark must respect that — derive it from the same `caveAt` the collider
reads, or the art and the wall part company.

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

### The crash site, and telling a crash from a graze

**The site is `stepCaveWall` (sim.js:4189-4227), not `stepSpurs`** — which is dead here, per §2.

`stepCaveWall` today is a pure **position** test: `a <= lim && a >= inner`, evaluated fresh each
frame, with **no read of cross-axis velocity anywhere**. Every frame of contact sets `_caveHit` and
ticks the same flat `CAVE_HIT_DPS`, whether you clipped one corner or have been pinned against the
face for two seconds. The only thing scaling severity is *duration*, via the `_caveAcc` accumulator.

That matters because **the corridor pinches, so sliding along coral is normal play, not exceptional
play.** Hooking momentum loss to `_caveHit` would fire it near-continuously and make the chapter
unplayable.

**Ruling: price the overshoot depth.** `a - lim` — how far past the boundary the raw, uncorrected
position landed this frame — is *already computed* in that function as a byproduct of the clamp:

```
depth = a - lim                    (or inner - a on the island side)
depth >  CIRCUIT_CRASH_DEPTH  ->   you drove into it: momentum penalty
depth <= CIRCUIT_CRASH_DEPTH  ->   you brushed it:    free, still grates HP
```

Deep overshoot means you were carrying speed *into* the wall; a shallow one means you were running
along it. It is a few lines inside a function that already exists, needs no velocity tracking, and
leaves grazing free.

⚠ **`CAVE_HIT_DPS` is 22, not `SPUR_DPS`'s 4.** The live grate is **5.5x** what any cost table
quoting the old constant would assume. Anything pricing "a second against the wall" must use 22.

⚠ **`SPUR_SLOW_MUL` (0.6) is real but orphaned** — `run._scraping` is hardwired `false` for any
chapter with a cave, so the `scrapeMul` term in `stepPlayerMovement`'s slow chain is permanently 1
here. It is the right *precedent* for the slick's grip penalty, but it is not live code to extend.

Coral still **grates HP** (`CAVE_HIT_DPS`, 22) — the owner ruled HP and death stay real — so a scraped race
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

### XP and coins — one decision resolves four inert cards at once

**XP.** Every coin and every XP gem in the game today drops inside the enemy-death branch of
`dealDamage`. Strictly kill-gated, no other site. So a weaponless Reef earns nothing and levels
never fire — the player would see **zero cards for the entire run**. A checkpoint grant is therefore
forced, not chosen. Precedent exists: The Blank already grants XP outside the kill economy on a
scripted phase transition, through the same `p.xp`/`stepLevelUp` machinery.

The XP curve is `xpForLevel(level) = 5 + level * 4`, cumulative 9/22/39/60/85 for levels 2–6. Over
24 checkpoints that puts the 3–4 level-up target at roughly **2.5–3 XP per swimthrough** — a
starting point for the knob grid, not a shipped number.

**Coins — and the decision that matters.** The new grant must push through the existing
`run.coins.push(...)` → `collect()` pickup pipeline rather than writing `run.coinsEarned` directly.
That single choice decides the fate of four other things at once: `run.mods.coinMul`, `avarice`'s
heal-on-pickup half, `bulky` and `jumbo`'s coin halves, and the "richer coins" the *heavy traffic*
mutator already promises in its own description. Writing the total directly is marginally less code
and leaves all four silently inert. **The pipeline already exists and `collect()` already drains it
every frame, so reusing it is the lazier build as well as the correct one.**

Scale: `city` at d2 measures **593 coins over a 300s run ≈ 119/min**. Matching that rate over a 112s
race is ≈**220 coins**. Derived, not measured, and it assumes coins-per-minute is the right fairness
metric — a race either finishes or does not, so coins-per-*finish* may be the better comparison.
Settle it with the knob grid.

⚠ Do not route the checkpoint XP through `run.mods.xpMul` / `passives.xpGain`. Those exist to keep a
kill economy proportional, and there is no kill economy here to stay proportional to. Note this also
makes `CHAPTERS[].balance.xpMul` — the obvious pacing lever, used by five chapters — **inert for the
Reef**, because it multiplies gem pickups.

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

  ⚠ **Contact is not merely undamaging here — it is not detected at all.** `contactHarmless(e)`
  returns true when `(e.dmg ?? 0) <= 0`, and the loop `continue`s on it **before** the
  circle-overlap test. So for every Reef fish the position check never runs, and there is no
  discarded "you touched something" signal to piggyback on. The fix is a **six-line reorder** of the
  same `O(enemies)` loop — move the overlap test above the early exit and branch on the result — not
  a new collision pass. The loop, the array and the squared-distance math already run every frame.

  ⚠ **And the flagship example barely happens.** `WAVE_TABLE` is keyed to *absolute seconds* and its
  tank brackets start at 140s, so in a ~112s race the moray — the "chicane in the good groove" this
  mechanic is sold on — essentially never spawns. Traffic composition needs a Reef-scoped table, not
  the shared one; see §7.
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

### Two shared curves cannot deliver the traffic lever, and must be replaced rather than retuned

Both are calibrated against reaching t=200–300s, and a 112s race provably never gets there:

- **`eliteEveryAt(t)`** ramps 45s → 12s across the run. At t=112 it is still ≈32.7s, so a race sees
  roughly **three elites total**, all near the ramp's start. Since the elite *is* the oil slick,
  this is the slick's whole cadence — it cannot be made to rise across a race by reparametrising a
  function whose range needs 300s to traverse.
- **`WAVE_TABLE`** is absolute-second brackets; the tank bracket opens at 140s. The moray never
  arrives. Composition, not just density, needs a Reef-scoped table.

Everything else on the shared curves is fine sampled short and should be **left alone**:
`spawnTiltMul` is already inert here (`reef` declares no `balance.spawnTilt`), `dmgScale` multiplies
a contact damage that `passiveCrowd` has already forced to zero, and `hpScale`'s base term is
`1 + t/90` — nothing to do with `RUN_DURATION` — so it is at 2.24x by t=112 already.

Two things genuinely break and both need fixing regardless of balance:

- **`chaosPact.when`** gates on `RUN_DURATION - run.time >= 120`. In a 112s race that is true for
  all but the last 8 seconds, so its "don't offer this too late" guard never engages. Moot if the
  anomaly allowlist (§6a) excludes it, which it should.
- ⚠ **The HUD counts down to 5:00.** `ui.js:2222` renders `RUN_DURATION - run.time` every frame.
  This is not a balance curve sampled short — it is a **player-facing lie**, a timer ticking toward
  a mark that has nothing to do with the race. It must be branched for a circuit chapter, and the
  template is two lines above it: `updateHUD` already switches that slot for `scriptedChapter`.

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
| Pistol Shrimp | **orphaned** — out of the Reef's pool, kept in `WEAPONS` with its mods and art |
| Fire Coral | **orphaned**, same |

**Orphaned, not deleted**, on the `squidInk` precedent already in the codebase. They stay
dev-takeable for testing, the French file loses nothing, and flipping the Reef back to combat
restores them. The cost is code no player can reach — which is why §10 requires a new assertion
proving they appear in **zero** chapter pools, since `run MB.a` structurally cannot see it.

⚠ Fire Coral is the last live consumer of `spurAt` (sim.js:11348, its burn geometry). Once it leaves
the pool, `spurAt`/`streamSpurs`/`run.spurs` have **no gameplay consumer at all** — still called
every frame, still costing time, feeding only a dead early-return and a disabled debug draw path.
Removing that machinery is a separate, larger cleanup and is deliberately **not** in this scope; do
not let it grow into this work. It is recorded here so the next reader knows it is known.

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

- **Nothing today would catch a track that fails to loop.** A new assertion must sample `caveAt`
  densely across a lap boundary and assert `caveAt(f) ≡ caveAt(f + lapLen)` in `c`, `hw` **and**
  `ph`. Two distinct mutations must turn it red, and they must be different edits rather than one
  relabelled: **(1)** put any one of the six wavelengths back to a non-divisor — `waves[0]`
  840 → 900; **(2)** leave the wavelengths alone and drop the branch cell wrap, which breaks `ph`
  only. The measured signals for both are recorded in §2 (173px of centre drift; 57px of island
  discrepancy), so the assertion's thresholds have a real scale to sit against rather than an
  eyeballed epsilon.
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
  construction, which has shipped untranslated strings four times. Specifically:

  - **The racing cards get their OWN table, not `PASSIVES`.** Adding them to `PASSIVES` would give
    free i18n coverage — it is already table #7 in the walk's literal list — but `PASSIVES` has no
    per-chapter scoping field at all, so lane-momentum stats would be offered in every chapter
    unless a hardcoded exclusion is bolted on beside the existing `lane && id === 'magnet'` line.
    That puts the scoping rule outside the table it describes: one fact, two places. A new flat
    table costs **one line in config.js and one line in the test's table list** — the same price
    `PASSIVES` already pays — and scopes correctly.
  - ⚠ **The four HUD strings are the real gap.** ui.js writes screen chrome as bare `t('…')` calls,
    and `t` is `DICTS[lang]?.[s] ?? s` — a missing entry **silently falls through to English**. The
    walk never scans ui.js for `t()` call sites, so a lap counter, split, par and countdown written
    inline would render fine, ship in English, and turn nothing red. This is precisely the failure
    CLAUDE.md records four times. The project already has the fix template: `MUTATOR_EFFECT_LABELS`
    lived in a bare const inside ui.js until it was promoted into a config table so the walk could
    reach it. Do the same, and have ui.js read from the table.
  - Orphaning rather than deleting the two weapons means **`fr.js` loses nothing** — the walk's
    `produced` set enumerates `WEAPONS`/`WEAPON_MODS` directly and never consults pool membership.
    Deleting them would instead have forced ~12 name entries plus their descs out of `fr.js` in the
    same commit. This is why §9's orphan/delete ruling had to be explicit.
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

No balance number in this document is measured. Load `probing-the-game` first.

### ⚠ Every Reef air number in the repo was taken at one throttle

`charge-probe.mjs`'s lane policies (`centre`, `pocket`) build their input through `crossInput`,
which **hard-sets the forward axis to 0** — the comment says so: "only the cross component survives
the lane". With `fwdIn` always 0, `_laneThrottle` is pinned at exactly **1.0** for every existing
Reef row. The 0.5x–3x range the chapter shipped has never been measured at all, and the resource
block's own note that the 3x ratio is unmeasured is more literally true than it reads.

`reef-astern`/`reef-pileup` do pass a nonzero forward stick (`{x:0.4}` → throttle 1.8), which proves
throttle **can** be injected through the existing input contract — but it is one hardcoded constant,
never swept, in rigs that measure something else.

**So a throttle axis is the first thing the rig needs**, crossed with the existing movement family.
Mind the axis math: the forward literal has to land on whichever of x/y is `ax.fwd`.

### What to build

| # | measurement | rig |
|---|---|---|
| 1 | lap-time distribution across skill policies | **one new file**, `scripts/reef-lap-probe.mjs`, cloning `reef-burst-grid.mjs`'s shape (seeded, paired seeds, policy table) plus the throttle axis |
| 2 | `swimTime` + cap per difficulty | **a flag on #1**, same idiom as `charge-probe`'s `--drainPerSpawn` |
| 3 | air economy under momentum | **not a new rig** — `charge-probe.mjs --chapter reef` once its lane policies gain the throttle axis |
| 4 | clip rate per lap | **a column on #1**, counted off the event stream inline |

One new file total.

### Traps that apply, and the one that decides whether the number is real

- **Paired seeds, one invocation.** Two rigs already say this in their own comments: a delta must
  come from one invocation sharing a seed list, never two runs eyeballed against each other.
- **A do-nothing control is required.** Every real rig here has one. The lap probe needs a row with
  the clock removed, or "the countdown makes laps X% harder" is unmeasurable — you would only have
  "laps take Y seconds" with no idea how much of Y the clock owns.
- **The rig's own geometry.** The steering-reachability windows these policies use are tuned
  constants *on the rig*, not the game. If they make the "aggressive" policy too timid to react at
  270px/s, the probe reports a harder track than exists — it is measuring its own reaction time.
- ⚠ **Track or policy?** A lap time is only trustworthy once it **moves when a track knob moves at
  fixed policy**, *and* **separates a floor policy from a ceiling policy at fixed track**. If a track
  knob barely moves either number while the floor/ceiling gap stays large and constant, the probe is
  measuring the driver, not the circuit. Run both directions before quoting anything.

### Sequencing — measurement starts earlier than it looks

Only two things must land before the first probe run means anything:

1. **the loop** (retuned wavelengths, branch cell wrap, pocket `lapCells`, unwrapped `minDist`);
2. **momentum** and the crash/clip/slick speed costs.

Without (2) especially, lap time collapses to `lapLen / throttled speed` — near-deterministic
algebra where every policy converges and there is no signal to measure.

**Not required first:** the camera anchor, the HUD, the lap-line art, the card set. None of them
touch a headless number, and they can proceed in parallel with the balance phase. The throttle axis
on the probe has no dependency at all and can be written immediately.

---

## 12. Deferred

- Card names and art — shoot them first, then name them (`game-art-and-copy`).
- French copy for every new string — the owner's call, never a translation subagent.
- Whether the summary's "Killed by …" line needs a new source label for the clock.
