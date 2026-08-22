# The Wreck — the hunt rework

**Date:** 2026-08-22
**Status:** design agreed, not built
**Owner report that opened it:** *"I like the idea of the level (you chase instead of being chased) but I don't like the execution. Weapons are useless, enemies / preys are useless, you just go straight forward and you win."*

---

## 1. The diagnosis

The owner's three complaints are one defect with three faces. **The chapter built every herding verb and never paid you for using one.**

`stepPrey` already contains a real herding simulation: per-shoal golden-angle headings (`PREY_SHOAL_SIZE` 16), a flee blend tuned explicitly so a school does not "explode radially like a firework, which is the one silhouette a bait ball never makes" (`PREY_FLEE_BLEND` 0.7), bilge avoidance that makes a shoal *peel along* a slick instead of pivoting (`BILGE_AVOID_BLEND` 0.75), and chum with a panic radius so you cannot park inside your own bait ball (`CHUM_PANIC_R` 150). The verbs are there and they work.

What is missing is the other half: **a tight ball of twenty mackerel is worth exactly what twenty strays are worth — `killBase` 5 apiece.** Herding is unrewarded, so not herding is optimal.

### Why "straight forward and you win" is literally true

| | value | source |
|---|---|---|
| player speed | 220 px/s | `PLAYER.baseSpeed` |
| mackerel, fleeing | 90 × 0.85 × `PREY_FLEE_MUL` 1.35 = **103 px/s** | roster + constant |
| mackerel, *unaware* | 90 × 0.85 × `PREY_DRIFT_MUL` 0.30 = **23 px/s** | roster + constant |
| damselfish, fleeing | 165 × 1.0 × 1.35 = **223 px/s** | roster + constant |
| notice radius | 340 px | `PREY_SIGHT_R` |
| mackerel HP | 20 × 0.55 × 0.45 = **4.95** (one bite) | `ENEMIES.drone` × roster × `enemyHpMul` |
| damselfish HP | 10 × 0.4 × 0.45 = **1.8** (one bite) | `ENEMIES.wisp` × roster × `enemyHpMul` |
| moray HP | 90 × 1.32 × 0.45 = **53.5** | `ENEMIES.tank` × roster × `enemyHpMul` |

Most of the field has not seen you and is drifting at **23 px/s**. The staple food, once alarmed, runs at **half your speed**. So crossing the map in a straight line at 220 px/s harvests continuously and needs no skill, no tool and no position. It is a mowing game wearing a hunting costume.

### Why the cards read as useless

`chum` (gather) and `bilge` (wall) both answer *"the food is escaping."* Against a mackerel at 103 px/s the food is **not** escaping, so both cards solve a problem the player does not have. `gnash` is fine — it is the only card whose job (deal damage to what is in front of you) still exists.

### Why the enemies read as useless

- **mackerel** — harmless (`dmgMul: 0` + `contactHarmless`) and slower than you.
- **damselfish** — harmless, and at 223 px/s vs 220 it cannot be run down, so ignoring it is correct play. It is scenery.
- **moray** — harmless, slow, fat. It contributes nothing but a body that eats your aim; `biteAim` exists solely to stop it stealing bites.

Nothing on the map can damage the player. The only two killers are the oil slicks (`SLICK_DPS` 6, ~10% of the plane, routed around trivially) and starving (`starve.dps` 4, only at bar zero — and the damage line's floor is 1.0, so an empty bar deals exactly what every other chapter deals). **"Stop and you starve" is not true. Stop and you are merely ordinary.**

### The fourth defect, already recorded in `config.js`

The chapter's own sweep note states that `drainPerSpawn` rides `spawnRate(t)`, which grows ~30× over a run, while the achievable kill rate does not. Every swept value produces the same trace: Bloodlust pinned at 98–100 for the first ~140s, then zero for the last third, **whatever the player does**. Both halves of the run have a fake resource decision.

---

## 2. Owner rulings (2026-08-22)

Taken in order, verbatim where recorded:

1. **The loop is trap / circle / hunt at speed.** *"the main gameplay loop i wanted was how to trap / circle / hunt enemies. i don't really want to slow down the rythm."* — so the fix must not introduce stalking, approach-speed control, or any mechanic that makes standing still or moving slowly correct.
2. **Some prey stays catchable.** Mackerel keeps its sub-player speed as the baseline food; the herding play is an opportunity ladder, not a gate.
3. **The ball's payoff is a density multiplier on damage and Bloodlust.** No new entity, no ball-object with its own HP.
4. **No trap bonus.** Raw density only — one rule. Walls and chum are paid for indirectly, by helping you pack the mass.
5. **The orca is a real threat that can kill you**, *"comes like 4 times after 100s, very telegraph with a big shadow underneath you, a silhouette or something."*
6. **The orca circles you, then commits.**
7. **The orca cannot be killed.** It makes its passes and leaves.

---

## 3. The design

Four parts. Part 1 is the fix; parts 2–4 are what make it a chapter.

### Part 1 — Density pays

Give every enemy a per-frame neighbour count and multiply the two things that matter by it.

**Where the count comes from: the separation pass, for free.** `stepEnemySeparation` (sim.js) already builds `_sepBuckets` — a module-scope `Map` of 64px cells (`ENEMY_SEP_CELL`) keyed on a packed integer, rebuilt every frame, visiting each enemy's own cell plus the four "forward" neighbours so every unordered pair is tested exactly once. Every pair it already finds increments **both** members' counters. Zero new loops, zero new allocation, no spatial index to write.

- New field: `e._shoalN`, zeroed at the top of the separation pass.
- Documented in `state.js`'s doc block alongside the other `run.*`/entity contract fields.

**Where the multiplier lands:**

| site | effect |
|---|---|
| Bloodlust refill on kill | `killBase` × `ballMul(e._shoalN)` — **the real payoff** |
| `biteGnash` damage | × `ballMul(e._shoalN)` — see the caveat below |

**Shape and constants** — all UNMEASURED first cuts, must not be quoted:

```
ballMul(n) = 1 + BALL_GAIN * Math.min(1, n / BALL_FULL_N)
```

- `BALL_FULL_N` — neighbour count that counts as a fully formed ball. First cut **8**.
- `BALL_REFILL_GAIN` — first cut **2.0**, i.e. up to ×3 Bloodlust out of a packed ball.
- `BALL_DMG_GAIN` — first cut **1.0**, i.e. up to ×2 damage.

The cap is load-bearing: a 620-body field would otherwise produce unbounded multipliers.

> **⚠ Flagged for an owner ruling — the damage half is close to inert on prey.** `gnash` deals 15 at L1 (×1.9 at the jaw) into a **4.95 HP** mackerel and a **1.8 HP** damselfish. Both die to one bite with an order of magnitude to spare, so a damage×density multiplier changes nothing about either. It only does real work against the moray (53.5 HP) and against elites (`ELITE.hpMul` 5). If the damage half is meant to *feel* like biting into a mass, the mechanic that would actually deliver it is **overkill carry** — excess damage from a one-shot rolling to the next body in the sweep, so one bite chews through a ball instead of stopping at the first fish. That is also the honest reading of the card's own line, *"the closer it lands, the deeper it goes."* Recommendation: ship `BALL_DMG_GAIN` as specified, measure it, and treat overkill carry as the upgrade if the damage half measures as noise.

### Part 2 — The income ladder, with no new config field

This falls out of numbers already in the file and needs no code:

- **Mackerel** (103 px/s, catchable, 4.95 HP) is subsistence. It keeps the bar alive and it pays for the Lunge.
- **Damselfish** (223 px/s against the player's 220) **cannot be run down at base speed at all.** There are exactly two ways to eat one: the **Lunge** (`LUNGE_SPEED` 900 px/s, `LUNGE_KILL_REFILL` 45 against `PULSE_CHARGE_COST` 45, so a connecting lunge is net positive by 5), or **catching it inside a ball**, where it is no longer running in a straight line away from you.
- Because a damselfish is therefore only ever eaten **in a ball or off a Lunge**, the density multiplier makes it worth several times a mackerel automatically. **No per-roster refill field is added.**

> **Correction against the first draft of this spec: Bloodrush is not base behaviour.** It is `WEAPON_MODS.gnash.bloodrush` (base 0.05, *"move speed per bite for 2s, stacking 5 times"*), an **opt-in card**. A player who takes it reaches 220 × 1.25 = **275 px/s** and can then run a damselfish down by hand. That makes Bloodrush a card whose value rises sharply once density pays — worth watching in the census — but it is **not** part of the chapter's baseline ladder and the design must not assume the player has it.

The baseline ladder is therefore: *mow mackerel for the bar → spend the bar on Lunges and on herding → eat the good fish out of the ball.* All of it at full speed, per ruling 1.

### Part 3 — The moray breaks balls

Prey currently flees the player and avoids bilge. It does not flee **predators**, which is why a moray is inert scenery.

- In `stepPrey`, add a flee-blend term for every **non-`skittish`** enemy within `PREY_PREDATOR_FEAR_R`, on the same "blend, don't pivot" idiom the bilge loop uses.
- Written as *"prey flees anything that is not itself prey"* rather than as `rosterId === 'moray'`, so it is one rule rather than a special case, and it composes with the orca in Part 4 with no extra code.
- Cost is bounded: `archetypeMul: { tank: 0.3 }` keeps morays rare, and they are the only non-skittish bodies this chapter spawns.

**What it buys:** a moray parked in a patch keeps blowing apart any ball you try to form there, so it becomes ground you must clear before you can hunt it. That is the "prize you break off the chase for" the chapter already wanted — with a reason attached. It replaces the `guard` shield that was measured earning nothing (7.6% of bites refused, 78% of morays never died).

### Part 4 — The orca

The chapter's only active threat. The leak stays exactly as it is; the orca is deliberately the opposite grammar. The leak block in `config.js` states that the hazard was chosen to *"not chase, not aim, not spawn on a timer and not know the player exists"* — and a chapter whose every threat obeys that rule is the chapter the owner just played.

> **The best property of it is free.** Prey flees predators (Part 3), and the orca is a predator. While it orbits the player at radius R, every fish **inside** that orbit flees away from the orca — i.e. **inward, onto the player**. The orca does to the player exactly what the player does to the shoal, and the by-product is the densest mass of the run compressed onto your position at the precise moment you have to dodge. Survive the commit and you are standing in the best meal in the chapter. That makes an unkillable, unfightable hazard into the run's biggest opportunity **without touching ruling 7.**

**Entity shape — `run.net`'s shipped idiom, not a pool.** `run.orca` is a single nullable object with a `run._orcaAcc` countdown, and `stepOrca(run, dt)` returns `true` if the player died, called from `stepSim` beside `stepTrawl`. One object, no `syncPool`, no `clearWorld` array registration — the net is the precedent for all of it.

**State machine:**

| state | duration | behaviour |
|---|---|---|
| `rising` | `ORCA_RISE_DUR` ~3.5s | **Not in the play plane.** Drawn on the deep parallax layer the hull already uses — hazed and desaturated, growing and sharpening as it comes up. Converges on the player's position, so the telegraph is literally *a big shadow underneath you*. No collision. |
| `circling` | `ORCA_CIRCLE_DUR` ~5s | In the play plane. Orbits the player, tightening from `ORCA_ORBIT_R` toward `ORCA_ORBIT_MIN_R`. **Harmless on contact** — the commit is the damage — so the compression gift is safe to collect. Prey flees it (Part 3, free). |
| `committing` | `ORCA_COMMIT_DUR` | Locks a line through the player's position at the moment it breaks orbit, dashes along it at `ORCA_DASH_SPEED`, overshoots by `ORCA_OVERSHOOT`. `ORCA_DMG` on contact, **once per pass** — not a DoT. |
| `leaving` | `ORCA_LEAVE_DUR` | Descends back to the deep layer and fades. |

**Cadence:** `ORCA_FIRST_PASS` = 100s, `ORCA_INTERVAL` = 50s → arrivals at t = 100, 150, 200, 250, i.e. **four visits in a 300s run**, matching the ruling. **One commit per visit** — four dodges per run, not eight to twelve. If that measures as too thin, an `ORCA_PASSES` count is the knob, and it is deliberately not shipped on the first cut.

**Damage:** `ORCA_DMG` must be sized as a fraction of player max HP so that surviving is about dodging rather than about HP totals. First cut: enough that three connections kill. Unmeasured; see §5.

**Not killable.** No health pool, no vulnerability window, no reward for engaging it. The reward is the ball it leaves compressed on your position.

---

## 4. Wiring — every site that fails silently

Per `CLAUDE.md`, each of these is enforced by a cross-file source-text scenario and each fails with nothing thrown:

- **run EV** — every `{type:'x'}` emitted needs a render case, an `SFX_FOR_EVENT` entry, or a written `SILENT_BY_DESIGN` line. New events: `orcaRise`, `orcaStrike`, `orcaHit`. All three are **rare** (four per run), so all three get sound — the opposite of the freeze/SUBMISSION reasoning, which withheld sound for events firing dozens of times a minute.
- **Contract fields.** `_shoalN` is a new field render must read for the ball tell. This is exactly the `_elFrozen` failure mode — a new mechanic published into a private field that `render.js` never learns about is indistinguishable from broken. Grep `render.js` for `_shoalN` before claiming the tell exists.
- **The ball needs a visible tell.** A player must be able to see a ball forming or the whole mechanic is invisible. Cheapest honest option: prey tints/brightens with `_shoalN`, so a forming ball glows as it packs.
- **`DMG_SRC_NAME`** — a new `orca:` row, or a death by orca prints nothing on the summary screen. `DMG_SRC_NAME`'s values are bare strings, **not** objects with `.name`, so run XX's one-level table walk does **not** cover them: the French must be hand-added to `fr.js` beside `'Starvation': 'Famine'` / `'The Leak': 'La Fuite'` / `'The Net': 'Le Filet'`. **The French wording is an owner decision** (L'Orque / L'Épaulard / something else) — do not invent it.
- **`clearWorld` / `createRun`** — `run.orca = null` and `run._orcaAcc` reset, plus whatever render-side graphics the orca owns cleared, on the net's precedent ("a run that ends mid-pass must not leave a net"). A run ending mid-visit must not carry an orca into the next one.
- **`state.js` doc block** — `run.orca`, `run._orcaAcc` and `e._shoalN` all added.
- **Art** — the orca bake obeys the top-down projection rule; load `game-art-and-copy` before drawing it. It needs two readings: the hazed deep-layer silhouette and the full play-plane animal.

---

## 5. What must be measured before any of this ships

**The rig does not exist yet, and that is the first deliverable.** `scripts/charge-probe.mjs` already carries `WRECK_MOVES` (`hunt` vs `ignore`) precisely because every earlier movement policy modelled a player being *chased* and therefore measured a player who never eats. The same gap exists again one level up: **there is no policy that herds.**

- **New policy axis: `herd` vs `mow`.** `mow` crosses the map in a straight line at full speed — the current dominant strategy. `herd` works shoals. The design succeeds only if `herd` measures materially better than `mow` on mean Bloodlust and on kills/min. If it does not, `BALL_FULL_N` and `BALL_REFILL_GAIN` are wrong, not the design.
- **`scripts/weapon-census.mjs`** on `gnash` with and without the density term, to size `BALL_DMG_GAIN` and to settle the flagged question of whether the damage half does anything at all on ~5 HP prey.
- **`ORCA_DMG` and the dodge window** against real runs — four unavoidable hits would make it a tax, four dodgeable ones make it the chapter's highlight.
- Re-run **`scripts/obstacle-contrast.mjs`** if the ball tell changes any prey tint: `BIOME_WRECK`'s steel is already the palest obstacle family in the book and must stay clear of the roster.

Per `CLAUDE.md`: quote the A/B, never the profile, and print the denominator in every sweep line.

---

## 6. Tests

New scenarios in `test/sim-test.js`, in the existing plain-`assert` style, each **mutation-proved on a scratch tree** (`git archive` — never `git checkout src/sim.js`, which silently discards real edits):

1. `_shoalN` is zeroed every frame and does not accumulate across steps.
2. A kill out of a dense cluster refills Bloodlust by more than an isolated kill of the same roster id — **assert the effect, not the field**.
3. Prey flees a non-skittish enemy: a shoal placed beside a moray moves away from it.
4. The orca does not exist before `ORCA_FIRST_PASS`, and arrives after it.
5. The orca deals damage only in `committing` — a player standing inside the orbit during `circling` takes zero.
6. The orca never appears outside The Wreck (chapter gate read, not assumed).
7. Contract compliance: the three new events resolve on the render/SFX side (run EV), and `run.orca` is cleared between runs.

Then `node scripts/test-isolation.mjs` — this change alters how many randoms are drawn, which re-phases the whole seeded stream and re-rolls every sampled statistic in the suite. **A red band elsewhere is not automatically caused by this diff**; check whether the assertion's subject is even reachable before attributing it.

---

## 7. Explicitly out of scope

- **The late-run bar cliff is damped, not cured.** Density income scales with crowd size, which is exactly where the drain outran the player — so a good herder can now earn late where before nobody could. The underlying law (`drainPerSpawn` × a `spawnRate(t)` that grows ~30× against a bounded kill rate) is unchanged. Capping the drain or putting a sub-linear power on `spawnRate` is the real fix and is **not a change to make unasked**.
- **The damselfish's 3 px/s margin** over the player (223 vs 220) is left alone. Bloodrush is the intended counter and it already exists.
- **Slick tuning.** `SLICK_DPS` 6 is still an unmeasured first cut; the orca does not change that and it is not re-opened here.
- **The chapter's phase-2 art debt.** `CHAPTERS.wreck` is still marked *"IT PLAYS, IT DOES NOT YET LOOK LIKE A WRECK"* — three creature bakes borrowed from The Reef. The orca bake does not discharge that.

---

## 8. Build order

1. **Part 1** (`_shoalN` + the two multipliers) and its `herd`/`mow` probe policy. This is the whole fix; play it before building anything else.
2. **Part 3** (prey flees predators) — a handful of lines, and it is a prerequisite for the orca's best property.
3. **Part 4** (the orca) — the largest piece: new entity, state machine, two bakes, three events, an i18n row.

Part 2 is not a build step. It is what parts 1 and 3 already imply.
