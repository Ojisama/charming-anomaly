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

---

## 5. The cards — no weapons, few level-ups

`weapons: []`, `starter: null`, a Reef-scoped racing pool. XP comes from swimthroughs; nothing is
killable, so this is forced rather than chosen. Coins likewise, plus a finish bonus scaled by time.

| stat | what it moves |
|---|---|
| top speed | the throttle ceiling above 3x |
| acceleration | how fast `_laneSpeed` recovers — the crash tax |
| handling | cross-axis speed, i.e. how tight a line you can hold |
| lungs | air capacity, so boost stays affordable |
| boost | burst duration and strength |
| hull | crash recovery, and resistance to the grate |

**Only 3–4 level-ups in a race.** Six linear stat bumps handed out eight times converges every run
on the same build and makes the level-up screen a formality — you cannot have everything, and the
order you take them in is the decision.

Names are provisional and the owner's to rule. Per `game-art-and-copy`, shoot the cards before
naming them.

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

## 10. Silent failure modes

Every one of these fails green.

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
