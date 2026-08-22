# The Wreck — the hunt rework

**Date:** 2026-08-22
**Status:** rev 3 — **three owner rulings outstanding**, build blocked until they are taken (§9)
**Owner report that opened it:** *"I like the idea of the level (you chase instead of being chased) but I don't like the execution. Weapons are useless, enemies / preys are useless, you just go straight forward and you win."*

**Revision history**
- **rev 1** — design taken from seven owner rulings.
- **rev 2** — first adversarial pass. Added Part 0 (there is no cohesion force in the game, so no player action could compress a shoal); corrected the orca's geometry; corrected `ORCA_DMG` to a fraction of max HP; pinned the `_shoalN` increment site; reversed the i18n claim; repaired two misquotes.
- **rev 3** — second adversarial pass, **with measured probes**. Three of rev 2's load-bearing claims fell:
  - **The refill multiplier is REGRESSIVE.** Measured, it pays the straight-line player **+167%** and the hunting player **+31%** — it *halves* the reward for engaging. Root cause is structural, not tuning. §3 Part 1 is rewritten around a different currency.
  - **The shop defeats the premise.** At shop Lv10, mowing and hunting are *the same run* (1861 vs 1924 kills). Part 2's ladder was a base-save-only argument, and the whole measurement plan would have validated at Lv0 and shipped to Lv10.
  - **The orca's orbit is an evacuator, not a compressor**, and Part 3 could not see the orca at all.
  - Also: rev 1 and rev 2 both quoted a note that `config.js` itself flags as stale; the damage half is *provably* inert, not merely close to inert; `CHUM_PANIC_R` (150) exceeds gnash L1's reach (118).

---

## 1. The diagnosis

**The chapter built every herding verb, never paid for using one — and has no mechanism by which a player could herd in the first place.**

`stepPrey` (sim.js:8007) contains four steering terms: a per-shoal drift heading, a flee blend, the chum override, and bilge avoidance. **Every one of them is a translation or a repulsion. None gathers.** The drift heading is `shoal * 2.399963 + run._realTime * PREY_TURN_RATE * ±1` — a pure function of shoal id and clock, identical for every member — so the `1 - PREY_FLEE_BLEND` = 0.3 residue *translates* a school and can never contract it. `stepEnemySeparation` actively pushes bodies apart at `minSep` 20.8px every frame. **`chum` is the only attractor in the chapter**, and it is one card on a 5s cooldown.

So there are two defects, not one: no payoff for density, and no way to create density.

### Why "straight forward and you win" is literally true

| | value | source |
|---|---|---|
| player speed, base | 220 px/s | `PLAYER.baseSpeed` |
| player speed, shop Lv10 | 220 × 1.4 = **308 px/s** | `SHOP.moveSpeed` "Slippery", +4%/level (config.js:4783) |
| player mean speed, Lv10, measured | **383 px/s** (incl. Lunges) | probe |
| mackerel, fleeing | 90 × 0.85 × `PREY_FLEE_MUL` 1.35 = **103 px/s** | roster + constant |
| mackerel, *unaware* | 90 × 0.85 × `PREY_DRIFT_MUL` 0.30 = **23 px/s** | roster + constant |
| damselfish, fleeing (radial) | **205-223 px/s** — see note | roster + constant |
| notice radius | 340 px | `PREY_SIGHT_R` |
| mackerel HP | 20 × 0.55 × 0.45 = **4.95** (one bite) | `ENEMIES.drone` × roster × `enemyHpMul` |
| damselfish HP | 10 × 0.4 × 0.45 = **1.8** (one bite) | `ENEMIES.wisp` × roster × `enemyHpMul` |
| moray HP | 90 × 1.32 × 0.45 = **53.5** | `ENEMIES.tank` × roster × `enemyHpMul` |

> **The damselfish is not a flat 223.** `PREY_FLEE_BLEND` normalises *after* blending, so its radial escape component is **205-223 px/s** depending on how the school's drift heading sits against the escape vector. A player at 220 can close at up to 15 px/s when the drift runs perpendicular. Rev 1's "cannot be run down at base speed at all, ever" was wrong.

Most of the field has not seen you and drifts at **23 px/s**. The staple food runs at **half your speed**. Crossing the map in a straight line harvests continuously and needs no skill, tool or position.

### Why the cards read as useless

`chum` (gather) and `bilge` (wall) both answer *"the food is escaping."* Against a mackerel at 103 px/s it is not escaping, so both solve a problem the player does not have.

### Why the enemies read as useless

All three are harmless — `dmgMul: 0` plus `contactHarmless`. The damselfish is ignorable, the moray is a sponge that steals aim (`biteAim` exists solely to stop it). Nothing on the map can damage the player; the only killers are the slicks (`SLICK_DPS` 6, ~10% of the plane, routed around) and starving (4 dps, only at bar zero, against a damage floor of 1.0 — so an empty bar deals exactly what every other chapter deals).

### The fourth defect: the shop defeats the chapter's premise

**Measured kill composition, 3 seeds × 300s, difficulty 1:**

| shop | policy | kills | killed mac/dam/moray | spawned mac/dam/moray |
|---|---|---|---|---|
| Lv0 | mow | 532 | 92% / 4% / 4% | 61% / 35% / 4% |
| Lv0 | hunt | 911 | 71% / 23% / 5% | 49% / 44% / 6% |
| Lv10 | mow | **1781** | 56% / 37% / 7% | 44% / 48% / 8% |
| Lv10 | hunt | **1759** | 58% / 34% / 9% | 44% / 47% / 9% |

**At shop Lv10, mowing and hunting are the same run.** A player driving in a straight line eats damselfish at essentially their spawn rate (37% of kills against 48% of spawns). The owner's complaint is not a feeling — it is measured, and it is *worst on a progressed save*.

> **This is a structural finding and it outranks everything else in this document.** `Slippery` is a global shop line merged into every book, so the chapter's premise — *the food outruns you* — is dismantled by an upgrade the chapter does not control and cannot see. **Any fix validated only at Lv0 will pass its gate and fail the player who actually reported the bug.** Every measurement in §6 therefore runs on both axes.

---

## 2. Owner rulings (2026-08-22)

1. **The loop is trap / circle / hunt at speed.** *"the main gameplay loop i wanted was how to trap / circle / hunt enemies. i don't really want to slow down the rythm."*
2. **Some prey stays catchable.** Mackerel keeps its sub-player speed.
3. **The ball's payoff is a density multiplier on damage and Bloodlust.** No new entity. *(rev 3 asks to amend this — see §9.)*
4. **No trap bonus.** Raw density only.
5. **The orca is a real threat that can kill you**, *"comes like 4 times after 100s, very telegraph with a big shadow underneath you, a silhouette or something."*
6. **The orca circles you, then commits.**
7. **The orca cannot be killed.** It makes its passes and leaves.

---

## 3. The design

### Part 0 — Cohesion. Without this, nothing else in this spec does anything.

The design assumes the player can compress a shoal. **No such force exists** (§1). Without cohesion, `_shoalN` measures ambient spawn clumping — a number the player barely influences — and every payoff built on it is inert.

**Measured: circling is currently the *worst* policy in the chapter.**

| policy | kills | prey within 200px | nearN at kill (mean) |
|---|---|---|---|
| mow | 510 | 6.0 | 2.8 |
| hunt | 905 | 11.7 | 8.4 |
| circleTight (r=110) | **187** | **3.3** | 3.6 |
| circleWide (r=300) | **0 in 900s** | — | — |

Orbiting produces the *emptiest* neighbourhood of the three. The geometry says why: at 220 px/s one lap is 4.3s at r=150, during which an alarmed mackerel's radial escape (95-103 px/s) carries it **426px — 2.8× the orbit radius.** The shoal leaves three times over before you close one circuit. And no radius works *in principle*: `PREY_SIGHT_R` is 340, so any orbit tight enough to alarm the outer fish also covers the centroid, and the inner fish run outward *through* your orbit. **A single repulsor cannot make a ball. It can only make a ring.**

The existing behaviour is a documented shortcut (sim.js:8001):

> `// ponytail: id buckets, not boids. If schools ever need to MERGE, SPLIT or avoid each other, that is when this becomes a real flocking pass — and not one line before.`

**That comment names the exact trigger this design pulls**, so Part 0 is the marker's own upgrade path being taken, not a shortcut overridden.

**The term: the selfish herd.** A threatened fish steers toward the centre of its own school — the actual biological reason bait balls exist.

- Accumulate a per-shoal centroid in one O(n) pass per frame, keyed on the shoal id `stepPrey` already computes, into a module-scope reused `Map` (the `_sepBuckets` idiom, no per-frame allocation).
- Blend a heading toward it using the same "blend, don't pivot" form the bilge loop uses.
- **Weight it by threat**, gated on `d < PREY_SIGHT_R`, so an unaware school still mills loosely exactly as today (preserving the shipped look) and a hunted one tightens.

> **⚠ It fights separation by construction.** Cohesion pulls in; `stepEnemySeparation` pushes out at 20.8px. Their equilibrium sets the achievable `_shoalN`, so **`BALL_FULL_N` cannot be fitted until this term exists and that equilibrium is measured.**

> **⚠ Build it as O(n), NOT as a neighbour query.** One pass accumulating `(sum_x, sum_y, count)` per shoal id into a reused `Map`, then an O(1) lookup per prey — ~620 iterations plus ~577 lookups per frame, with no pair checks at all. Written as "each fish looks at its neighbours" it becomes the same ~358k-test-per-frame trap Part 3 documents, against a budget sim.js:4470 already rejects in writing. The shoal id makes the cheap version available; use it.

**Gate:** build Part 0 alone and prove `nearN@kill` rises under circling *before pricing anything*. If circling does not raise it, stop — the rest of the design rests on it.

### Part 1 — What density pays, and why it must not be the refill

**Rev 2 specified a multiplier on `killBase`. Measured, that is regressive:**

| policy | kills | ballMul | CONTROL bar | BALL bar | lift |
|---|---|---|---|---|---|
| mow | 510 | 1.64 | 16.3 | 43.5 | **+167%** |
| hunt | 905 | 1.93 | 43.9 | 57.7 | **+31%** |
| circleTight | 187 | 1.80 | 6.6 | 14.1 | +115% |

Control separation mow:hunt is **2.69×**; with the ball bonus it collapses to **1.33×**. **The mechanic halves the reward for engaging** — the precise opposite of the chapter's thesis. At shop Lv10 it degenerates further, to +13% (mow) against +5% (hunt).

**The cause is structural.** Bloodlust is clamped at `run.chargeMax`. *A multiplier on refill is worth most to whoever is furthest from the clamp — i.e. the player doing worst.* It is a rubber band. And the bar's only sinks are the damage/rate line (floor 1 → peak 1.8/1.5) and Lunge presses at `LUNGE_KILL_REFILL` 45 against `PULSE_CHARGE_COST` 45 — a near-wash by design. **The design would increase the supply of a currency with almost nothing to buy.**

The distribution is also the wrong shape to teach a verb: median `nearN@kill` is **2-3** against `BALL_FULL_N` 8, while the mean is 8.4 — a fat tail from the late-game blob. Most bites pay nothing extra; a minority pay triple.

**Two replacement currencies, neither clamped. Both need an owner ruling (§9).**

- **(A, recommended) Density SLOWS THE DRAIN while you are inside the mass.** Scale `drainPerSpawn` by a factor falling with prey density *around the player*. Never clamped — a full bar simply stays full longer. It rewards *being in the ball* rather than killing out of it, which is the verb, and a straight-line player is never inside anything. Measured prey-within-200px separates cleanly: mow 6.0, hunt 11.7. On the HUD it reads as the bar falling slower, which is a visible tell for free. It also restates the chapter's line honestly: *stop and you starve* becomes *be among the food and you don't*.
- **(B, additive) Put the multiplier on `LUNGE_KILL_REFILL`, not `killBase`.** Skill-gated — press, aim, connect, inside a mass — unfarmable by walking straight, and it finally gives the button a job beyond +5 net.

**The damage half is dropped. It is provably inert, not merely close to inert:**
- `ballMul` reads the **victim's** neighbour count. Part 3 makes prey flee the moray, so **a moray's neighbourhood is empty by design** — the one body the bonus could matter for is the one body guaranteed never to have neighbours.
- Elites do not rescue it: an elite mackerel at `ELITE.hpMul` 5 is ~25 HP against gnash L1's 15 × `GNASH_MAW_MUL` 1.9 = **28.5**. Still one bite.

**Overkill carry replaces it, as the first cut rather than the fallback.** Excess damage from a one-shot rolls to the next body in the sweep. `biteGnash` is an `inSector` sweep that already hits every body in the wedge, so this is the only version of "biting into a mass" a one-shot roster can express — and it is what the card's own line already promises: *"the closer it lands, the deeper it goes."*

**`_shoalN` — the counting rule.** `stepEnemySeparation` visits pairs; `resolveSeparationPair` (sim.js:4546) then early-outs on `distSq >= minSep²`. The two readings measure **35-47× apart** and *both* are unusable raw:

| reading | what it counts | field mean (mow/hunt) | p90 | verdict |
|---|---|---|---|---|
| A — every pair **visited** (3×3 cell box, 192px) | cell-adjacency | 16.4 / 19.3 | 25 / 36 | `BALL_FULL_N` 8 **saturated by the spawner** |
| B — every pair **resolved** (overlapping, 20.8px) | actual overlap | 0.41 / 0.51 | 1 / 2 | **inert**; also self-defeating — the pass exists to *prevent* overlap |

**Specified: neither.** Increment **before** the early-out, gated on its own `distSq < BALL_R * BALL_R`. `BALL_R` **must be ≤ `ENEMY_SEP_CELL` (64)** — the half-neighbourhood scan (`SEP_NEIGHBOR_OFFSETS = [[1,0],[-1,1],[0,1],[1,1]]`, plus reciprocal coverage) visits every pair within one cell exactly once, and beyond that coverage turns anisotropic.

> **⚠ Incrementing *after* the early-out caps `_shoalN` at the 2D kissing number of 6**, making `BALL_FULL_N` 8 permanently unreachable with nothing thrown. This is the single highest-risk implementation detail in the document.

> **⚠ "For free" is not quite true, and rev 2 hid a cost.** A cell count is grid-quantised — under reading A it snaps to `Math.floor(x/64)`, so two fish 5px apart can differ by a whole cell-load and the proposed tint tell would pop along invisible 64px world lines. The `BALL_R` gate *is* a real radius query: one extra squared-distance compare per visited pair. Cheap, but it is a cost, not zero.

**`BALL_FULL_N` is deliberately left unset.** Fit it to a logged `_shoalN` histogram taken **after** Part 0 exists, on both shop axes. Rev 2's 8 is wrong by ~3× under reading A and must be re-derived, never chosen.

### Part 2 — The income ladder (base save only — do not over-claim it)

- **Mackerel** (103 px/s, 4.95 HP) is subsistence and pays for the Lunge.
- **Damselfish** (205-223 px/s radial) is *near*-uncatchable at base speed — closable at up to 15 px/s on a favourable drift, otherwise needing a ball or a Lunge.

> **⚠ This ladder exists only on a base save.** At shop Lv10 a mowing player already eats damselfish at their spawn rate (§1). Part 2 is therefore a description of the Lv0 experience, **not** a mechanism the design may lean on. It is not a build step.

### Part 3 — The moray breaks balls

Prey flees the player and avoids bilge; it does not flee **predators**. Add a flee-blend term for non-`skittish` bodies within `PREY_PREDATOR_FEAR_R`, on the bilge loop's "blend, don't pivot" idiom.

**Three corrections to rev 2:**

- **⚠ The cost argument was wrong.** Rev 2 said *"cost is bounded: `archetypeMul` tank 0.3 keeps morays rare."* That bounds how many terms **apply**, not the **scan that finds them**. `stepPrey` is called per skittish body from inside `stepEnemyMovement`'s own `for (const e of run.enemies)` (sim.js:2093), so a naive inner loop is ~577 prey × 620 bodies ≈ **358,000 distance tests per frame** at this chapter's own cap — and sim.js:4470 rejects exactly this magnitude in writing (*"700²/2 ≈ 244k pair checks/frame is not a phone-friendly budget"*), which is why the bucket grid exists at all. The grid is **not** available here: `stepEnemyMovement` runs at sim.js:259, `stepEnemySeparation` at sim.js:284 — stale and too late. **Fix: hoist a per-frame array of non-skittish bodies once, then loop that.** One line, but it must be written down or the O(n²) gets built.
- **⚠ It is a no-op for the first half of every run.** Morays are `tank`; `WAVE_TABLE` does not introduce `tank` until **t = 140s**. Measured spawn share 4% (Lv0 mow) to 9% (Lv10) and **zero before t=140**. So Part 3 cannot deliver "ground you must clear before you can hunt" — there is not enough of it. Treat it as texture, not as a pillar.
- **⚠ A SUBMISSION-converted moray is a non-skittish ALLY** (`allyT`, sim.js:6260). Under a bare *"prey flees anything not itself prey"* rule, an anomaly the player chose would scatter their own balls. **Exclude allies explicitly.**

### Part 4 — The orca

The chapter's only active threat, and deliberately the opposite grammar to the leak, which *"does not chase, does not aim, does not spawn on a timer and does not know the player exists"* (config.js:~8971). A chapter whose every threat obeys that rule is the chapter the owner just played.

**⚠ Rev 2's orbiting point does not work, and its "free gift" was backwards.** With the player and the orca both repulsors:
- A fish **between** them gets antiparallel vectors — resultant ≈ 0. It **stalls** at its current radius.
- A fish on the **far side of the player** gets both vectors pointing the same way. They **add**, and it leaves at full `PREY_FLEE_MUL`.

At any instant half the enclosed population is in the second case, and the orbit sweeps every bearing, so each fish spends ~half the circling phase accelerating outward: ~0.5 × 5s × 99 px/s ≈ **248px of net outward drift per visit** — larger than any plausible orbit radius. **The orbit is an evacuator, not a compressor**, and what it leaves is a rotating radial spoke of stalled fish anchored *away* from the player. Nothing can ever rest on the player's position; that is what `skittish` means.

**Specified instead: a CLOSING RING.** The orca's fear field is an annulus that **tightens**, not a point that orbits. This is how real carousel feeding works — the predators form a wall the prey cannot cross. A contracting ring of fear **stacks with** the player's own repulsion instead of fighting it, and it delivers the compression rev 2 only asserted. **Ruling 6 survives verbatim** — it still circles you, then commits.

> **⚠ Part 3 cannot see the orca.** Rev 2 claimed Part 3 *"composes with the orca with no extra code."* False by the spec's own entity choice: Part 3 loops `run.enemies`, and the orca is `run.orca` — a single nullable object, never in that array. It needs an **explicit second term**.

> **⚠ One constant cannot do both jobs.** `PREY_PREDATOR_FEAR_R` must be **small and local** to make a moray break balls, and **at least the ring radius** to reach across the orca's. Set it large and the orca evacuates a disc of ~2R around the player. **Two constants.**

**Entity shape — `run.net`'s shipped idiom.** `run.orca`, a single nullable object with a `run._orcaAcc` countdown; `stepOrca(run, dt)` returns `true` if the player died, called from `stepSim` beside `stepTrawl`. No `syncPool`, no `clearWorld` array registration.

| state | duration | behaviour |
|---|---|---|
| `rising` | ~3.5s | Not in the play plane. Drawn on the deep parallax layer the hull already uses — hazed, growing, sharpening. Converges on the player, so the telegraph is literally *a big shadow underneath you*. No collision. |
| `circling` | ~5s | The closing ring, contracting from `ORCA_RING_R` to `ORCA_RING_MIN_R`. **Harmless on contact** — the commit is the damage — so the compression is safe to collect. |
| `committing` | short | Locks a line through the player's position as the ring breaks, dashes along it at `ORCA_DASH_SPEED`, overshoots. Damage **once per pass**, not a DoT. |
| `leaving` | ~2s | Descends back to the deep layer and fades. |

**Cadence:** `ORCA_FIRST_PASS` 100s, `ORCA_INTERVAL` 50s → t = 100, 150, 200, 250. **Four visits, one commit each.** `ORCA_PASSES` is the knob if that measures thin; deliberately not shipped on the first cut.

**Damage: `ORCA_DMG_FRAC`, a fraction of max HP — never a flat literal.** First cut **0.34**.

> `p.maxHP` grows within a run (`p.maxHP += choice.bonus`, sim.js:341) and across saves (`PLAYER.baseHP + shopBonus(bm, bookId, 'maxHP')`, state.js:1938). A flat number repeats the scar already recorded against `LUNGE_DMG` (*"FLAT MEANS IT DECAYS"*).
>
> **The engine floor is TWO connections, not three.** `hurtPlayer` (sim.js:2830) is `Math.min(Math.round(p.maxHP * HURT_CAP_FRAC), Math.max(1, Math.round((rawDmg - run.passives.armor) * run.mods.contactDmgTakenMul)))` — capped against **max** HP, applied **last**. At `HURT_CAP_FRAC` 0.5 no `ORCA_DMG_FRAC` above 0.5 does anything. Armour and `contactDmgTakenMul` apply *before* the cap, so this is a pre-mitigation number. The real dial is commits-per-visit.

**Not killable.** No health pool, no vulnerability window. The reward is the mass its ring leaves behind.

---

## 4. A defect this spec does not create but must not ignore

**`CHUM_PANIC_R` (150) exceeds gnash L1's reach (118).** Chum is the chapter's only attractor, and it switches **off** inside a radius larger than the radius in which the player can bite — so at weapon level 1, *every fish you can reach is already bolting*. `deepChum` (buying the radius down to ~22px at its 0.85 cap) is therefore load-bearing for the entire design rather than a nice-to-have. Either the constant or the card's gating needs revisiting before balls are priced.

---

## 5. Wiring — every site that fails silently

- **run EV** — new events `orcaRise`, `orcaStrike`, `orcaHit` each need a render case, an `SFX_FOR_EVENT` entry, or a written `SILENT_BY_DESIGN` line. All three are rare (four per run), so all three get sound.
- **Contract fields** — `_shoalN` must be read by `render.js` or the ball has no tell. This is the `_elFrozen` failure mode exactly: a mechanic published into a private field render never learns about is indistinguishable from broken. Grep `render.js` for `_shoalN` before claiming the tell exists. (See §3 Part 1 on grid quantisation before choosing a tint tell.)
- **`DMG_SRC_NAME`** — needs an `orca:` row. **Already guarded:** `test/sim-test.js:15874` walks `Object.values(DMG_SRC_NAME)` (added v7.120.0, ac9adc8), so a row without French turns the suite **red**, not silent. **The French wording is an owner decision** — do not invent it.
- **`clearWorld` / `createRun`** — `run.orca = null`, `run._orcaAcc` reset, orca graphics cleared, on the net's precedent.
- **`state.js` doc block** — `run.orca`, `run._orcaAcc`, `e._shoalN`.
- **Pass 1 exclusions** — `stepEnemySeparation` skips `_dead`, `_phaseSolid === false`, `rosterId === 'bindnode'`, and `affixes.includes('anchored')` (sim.js:4503-4508). None occur in The Wreck today, but a future body wearing `anchored` would silently stop counting toward any ball.
- **Art** — load `game-art-and-copy` first; the orca needs two readings (hazed deep-layer silhouette, full play-plane animal) and obeys the top-down projection rule.

---

## 6. What must be measured

**Every measurement runs on both shop axes — `--shop=0` and `--shop=10`.** §1's table is why: the design would otherwise be validated at Lv0 and shipped to the player who reported the bug.

1. **The go/no-go gate — and it must be stated as a WINDOW, not a direction.**

   The naive form ("does circling raise `nearN@kill` once Part 0 exists?") **cannot fail**, because cohesion strength is a knob and you can always crank it until circling wins. A gate that a parameter can buy its way past is not a gate. Sweep `PREY_COHESION_BLEND` and require **one value to satisfy all three at once**:

   - **(i) It works.** Circling raises `nearN@kill` materially over mowing. Today circling *lowers* it (3.6 against hunt's 8.4), so the bar is a real reversal, not a nudge.
   - **(ii) It doesn't come for free to the mower.** The mow:hunt separation must **widen**. If cohesion densifies the field for everyone, it has recreated F1's regressiveness in a different variable.
   - **(iii) The school still looks like a school.** An *unthreatened* shoal must not visibly collapse toward its centroid. This is the constraint the knob cannot buy — judged by shooting a frame, per this project's standing rule, not by a number.

   **If the window is empty — no cohesion value satisfies all three — the design fails here and stops.** That is the outcome this gate exists to be able to produce.
2. **A `herd` vs `mow` policy axis in `charge-probe.mjs`.** `WRECK_MOVES` today is `hunt`/`ignore`; neither herds. ⚠ A scripted herd policy approximates a human — if it is crude, the experiment measures the *policy*, not the design. State the approximation in the output.
3. **The `_shoalN` histogram**, on both axes, before `BALL_FULL_N` is chosen.
4. **The drain-slow (A) and Lunge-gated (B) currencies against the same control**, checking the mow:hunt separation **widens** rather than narrows. That is the criterion rev 2 got backwards.
5. **The orca's connect rate.** A commit that always lands is not a dodge, it is a scheduled HP tax, and no damage number fixes it.
6. **`weapon-census`** on gnash with and without overkill carry.
7. Re-run **`obstacle-contrast.mjs`** if any prey tint changes.

Per `CLAUDE.md`: quote the A/B, never the profile; print the denominator in every sweep line; and a red band elsewhere is not automatically caused by this diff — this change re-phases the seeded stream.

---

## 7. Tests

Each mutation-proved **on a scratch tree** (`git archive`), never by `git checkout src/sim.js`.

0. **Cohesion tightens a threatened shoal** — mean pairwise distance falls under threat, and does *not* fall for an unaware school. Mutation-prove by deleting the term.
1. `_shoalN` is zeroed every frame and does not accumulate.
2. **`_shoalN` counts within `BALL_R`, not `minSep`** — two bodies 40px apart (outside 20.8, inside 64) each report a neighbour. This is the regression that would silently cap the count at 6.
3. A kill out of a dense cluster pays more than an isolated kill of the same roster id — **assert the effect, not the field**.
4. Prey flees a non-skittish enemy, **and does not flee a SUBMISSION ally**.
5. The orca does not exist before `ORCA_FIRST_PASS`; arrives after.
6. The orca damages only in `committing` — zero inside the ring during `circling`.
7. The orca never appears outside The Wreck (gate read, not assumed).
8. Contract compliance: the three events resolve render/SFX-side; `run.orca` clears between runs.

Then `node scripts/test-isolation.mjs`.

---

## 8. Explicitly out of scope

- **The late-run break-even** is genuinely improved and worth claiming honestly: at t=250, drain = 2.4 × spawnRate(250) = 30.3/s, so break-even is 6.06 kills/s at `killBase` 5 and **2.02 kills/s at a saturated ×3**. Real — but under rev 2's refill design it was equally available to the mower, which is F1.
- **Slick tuning.** `SLICK_DPS` 6 remains an unmeasured first cut.
- **The chapter's phase-2 art debt** — three creature bakes still borrowed from The Reef. The orca bake does not discharge it.
- **`Slippery`'s effect on every other chapter.** §1's finding is chapter-scoped here; whether a global +40% move speed is healthy book-wide is a separate question and not opened by this document.

---

## 9. Blocked on three owner rulings

1. **The payoff currency.** Ruling 3 said *"density multiplier on damage and Bloodlust."* Measured, a refill multiplier is regressive (+167% mow against +31% hunt) and the damage half is provably inert. **Recommended: (A) density slows the drain, plus (B) the multiplier on `LUNGE_KILL_REFILL`, with overkill carry replacing the damage half.** All three stay inside "density pays"; none is clamped. This needs your yes.
2. **The orca's shape.** Ruling 6 (*"circles you, then commits"*) is preserved, but as a **closing ring** rather than an orbiting point — an orbiting point measurably evacuates the area instead of compressing it.
3. **The French for the orca's `DMG_SRC_NAME` row.**

## 10. Build order

1. **Part 0 alone.** Then *look at a frame* — a shoal must visibly tighten under pressure. Verify by shooting it, not by reasoning from code. If it does not, stop.
2. **Measurement 1** (does circling raise `nearN@kill`?). This is the go/no-go for the whole design.
3. **Part 1** with the ruled currency; fit `BALL_FULL_N` off the histogram, both shop axes.
4. **Part 3** (prey flees predators, with the hoisted array and the ally exclusion).
5. **Part 4** (the orca).
