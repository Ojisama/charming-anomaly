# The Wreck — the hunt rework

**Date:** 2026-08-22
**Status:** rev 2 — design agreed, revised after an adversarial review, **two owner rulings outstanding** (see the two ⚠ blocks in Part 1)

**Revision history**
- **rev 1** — design taken from seven owner rulings.
- **rev 2** — adversarial review. Three substantive corrections, one of which invalidated the original premise:
  - **Part 0 added.** There is no cohesion force in the game, so no player action could compress a shoal. Every payoff in rev 1 was built on a mechanism that does not exist.
  - **The orca's "free gift" was geometrically wrong** — opposed fear fields produce an annulus, not a ball. It works only as a consequence of Part 0.
  - **The refill multiplier is inert for the first ~140s** because the bar is capped for exactly that long. Needs an owner ruling.
  - Plus: `ORCA_DMG` made a fraction of max HP (a flat literal decays as max HP grows); the engine's hit floor corrected from three connections to **two**; the `_shoalN` increment site pinned down (counting after the overlap early-out would cap it at 6 and silently break the design); the i18n claim reversed (the guard already exists); two misquotes repaired.
**Owner report that opened it:** *"I like the idea of the level (you chase instead of being chased) but I don't like the execution. Weapons are useless, enemies / preys are useless, you just go straight forward and you win."*

---

## 1. The diagnosis

The owner's three complaints are one defect with three faces. **The chapter built every herding verb and never paid you for using one.**

`stepPrey` already contains a real herding simulation: per-shoal golden-angle headings (`PREY_SHOAL_SIZE` 16), a flee blend tuned explicitly because "at a pure radial the shoal explodes like a firework, which is the one silhouette a bait ball never makes" (`PREY_FLEE_BLEND` 0.7, sim.js:8019), bilge avoidance that makes a shoal *peel along* a slick instead of pivoting (`BILGE_AVOID_BLEND` 0.75), and chum with a panic radius so you cannot park inside your own bait ball (`CHUM_PANIC_R` 150). The verbs are there and they work.

What is missing is the other half: **a tight ball of twenty mackerel is worth exactly what twenty strays are worth — `killBase` 5 apiece.** Herding is unrewarded, so not herding is optimal.

> **Amended after the adversarial pass.** The paragraph above was the first draft's diagnosis and it is only half right. The *steering* verbs exist — but **no force in the game gathers prey**, so a "tight ball of twenty mackerel" is not something a player can currently produce at all. See Part 0. The chapter is missing both the payoff *and* the mechanism.

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

### Part 0 — Cohesion. Without this, nothing else in this spec does anything.

**Found by the adversarial pass, and it invalidates the first draft of this document.** The design assumes the player can compress a shoal into a dense mass by circling, walling and cutting off. **No such force exists in the game.**

`stepPrey` (sim.js:8007) contains exactly four steering terms: a per-shoal drift heading, a flee blend, the chum override, and bilge avoidance. **None of them gathers.** Fleeing *spreads* a shoal. Worse, `stepEnemySeparation` actively pushes bodies apart at `minSep` 20.8px every frame. The only gathering force anywhere in the game is `chum`, and it is one card on a 5s cooldown.

Without a cohesion term, `_shoalN` measures **ambient spawn clumping** — a number the player can barely influence — and every payoff built on it is inert. Circling would push the near edge of a school away and smear it, not ball it.

The existing behaviour is a deliberate, documented shortcut (sim.js:8001):

> `// ponytail: id buckets, not boids. If schools ever need to MERGE, SPLIT or avoid each other, that is when this becomes a real flocking pass — and not one line before.`

**That comment names the exact trigger this design pulls.** It needs schools to tighten and to avoid predators, so upgrading here is the marker's own upgrade path being taken, not a shortcut being overridden.

**The term: the selfish herd.** A threatened fish steers toward the centre of its own school, not merely away from the predator — which is the actual biological reason bait balls exist.

- Accumulate a per-shoal centroid in one O(n) pass per frame, keyed on the shoal id `stepPrey` already computes (`Math.floor(e.id / PREY_SHOAL_SIZE)`), into a module-scope reused `Map` — the `_sepBuckets` idiom, no per-frame allocation.
- In `stepPrey`, blend a heading toward that centroid using the same "blend, don't pivot" form the bilge loop uses.
- **Weight it by threat.** `PREY_COHESION_BLEND` scales with how alarmed the fish is, so an unaware school still mills loosely exactly as it does today (preserving the shipped look) and a hunted one tightens. This is what makes pressure — yours or the orca's — the thing that packs a ball.

> **⚠ It fights separation by construction.** Cohesion pulls in; `stepEnemySeparation` pushes out at 20.8px. The equilibrium spacing between those two forces is what actually determines the achievable `_shoalN`, so **`BALL_FULL_N` cannot be fitted until this term exists and its equilibrium has been measured.** The ~34 geometric ceiling below is an upper bound that assumes perfect packing; the real ceiling is wherever these two settle.

### Part 1 — Density pays

Give every enemy a per-frame neighbour count and multiply the two things that matter by it.

**Where the count comes from: the separation pass, for free.** `stepEnemySeparation` (sim.js:4497) already builds `_sepBuckets` — a module-scope `Map` of 64px cells (`ENEMY_SEP_CELL`) keyed on a packed integer, rebuilt every frame, visiting each enemy's own cell plus the four "forward" neighbours so every unordered pair of **eligible** enemies is tested exactly once. Every pair it already finds increments **both** members' counters. Zero new loops, zero new allocation, no spatial index to write.

- New field: `e._shoalN`, zeroed at the top of the separation pass.
- Documented in `state.js`'s doc block alongside the other `run.*`/entity contract fields.

> **⚠ "Eligible", not "every".** Pass 1 (sim.js:4503-4508) skips `_dead`, `_phaseSolid === false` (ghosted phase-flicker), `rosterId === 'bindnode'`, and any `affixes.includes('anchored')` body before bucketing. None of those occur in The Wreck's roster today, so the count is exact here — but the exclusion list is a live dependency, and a future Wreck body wearing `anchored` would silently stop counting toward any ball.

**⚠ WHERE THE INCREMENT LANDS DECIDES WHETHER THE DESIGN WORKS AT ALL.** This is the single most important implementation detail in this spec, and the first draft left it ambiguous.

`resolveSeparationPair` (sim.js:4546) early-returns on `distSq >= minSep * minSep`, where `minSep = ENEMY_SEP_FRAC 0.65 × (rA + rB)` — **20.8 px** for two mackerel (radius 16 each).

- **Increment AFTER that early-out** (i.e. only pairs actually overlapping) and `_shoalN` means *"bodies touching me"*. The 2D kissing number caps that at **6**. `BALL_FULL_N = 8` would then be **unreachable** — `ballMul` could never exceed 1 + gain × 6/8, i.e. 1.75 of a 3.0 cap — and the mechanic would be permanently stuck below its own ceiling with nothing throwing. **This is the trap.**
- **Increment BEFORE it**, gated on its own `distSq < BALL_R * BALL_R`, and `_shoalN` means *"bodies within `BALL_R`"*, which is the honest reading of density. **This is the specified behaviour.**

**`BALL_R` MUST BE ≤ `ENEMY_SEP_CELL` (64px).** The half-neighbourhood scan (own cell + 4 forward neighbours) is guaranteed to visit every pair whose members are within one cell of each other; beyond that, coverage becomes anisotropic and a ball would score differently depending on where it sits relative to the cell grid. First cut: `BALL_R` = **64**.

**Reachability at those numbers:** hexagonal packing at 20.8px spacing is one body per ~375 px²; a 64px disc is ~12,870 px², so the geometric ceiling is **~34 neighbours**. `BALL_FULL_N = 8` therefore sits at ~24% of maximum packing — reachable, and likely on the low side. Fit it to an observed `_shoalN` distribution from a real run, **not** to this geometric maximum.

**Where the multiplier lands:**

| site | effect |
|---|---|
| Bloodlust refill on kill | `killBase` × `ballMul(e._shoalN)` — **the real payoff** |
| `biteGnash` damage | × `ballMul(e._shoalN)` — see the caveat below |

**Shape and constants** — all UNMEASURED first cuts, must not be quoted:

```
ballMul(n) = 1 + BALL_GAIN * Math.min(1, n / BALL_FULL_N)
```

- `BALL_R` — the radius `_shoalN` counts within. First cut **64**, and see the hard constraint below: it **must not exceed `ENEMY_SEP_CELL`**.
- `BALL_FULL_N` — neighbour count that counts as a fully formed ball. First cut **8**.
- `BALL_REFILL_GAIN` — first cut **2.0**, i.e. up to ×3 Bloodlust out of a packed ball.
- `BALL_DMG_GAIN` — first cut **1.0**, i.e. up to ×2 damage.

The cap is load-bearing: a 620-body field would otherwise produce unbounded multipliers.

> **⚠ Flagged for an owner ruling — the refill multiplier is worth ZERO for the first half of every run.** `CHAPTERS.wreck.resource`'s own sweep note records that Bloodlust sits **pinned at 98-100 for the first ~140s** and at zero for the last third, *whatever the player does*. A multiplier on refill against a **capped** bar is arithmetically nothing. So under the design as written, herding pays literally nothing during the entire stretch in which a player learns the chapter — they learn that mowing works, and the mechanic that was supposed to teach itself is invisible until it is too late to matter.
>
> This is the single biggest risk in this document. Two candidate fixes:
>
> - **Overfill (recommended).** A ball kill may push Bloodlust **past `max`**, up to `BALL_OVERFILL_MUL` × max, and the `damage`/`rate` lines extrapolate above their `peak` accordingly (capped). A full bar stops being a ceiling and becomes the state in which herding pays *most* — which is also the chapter's fantasy stated honestly: a shark in a feeding frenzy. `LUST_TINT_MAX` already exists as the tell and would simply run hotter. **This changes the bar's semantics, so it needs an explicit ruling.**
> - **A second currency.** Density also pays XP or coins, felt immediately. Cheaper, but this chapter sets `xpMul: 0.5` deliberately and inflating it fights that decision.
>
> Doing neither means accepting that the chapter's core mechanic is inert for 140 seconds.

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

The chapter's only active threat. The leak stays exactly as it is; the orca is deliberately the opposite grammar. The leak block in `config.js` (~8971) states that the hazard *"does not chase, does not aim, does not spawn on a timer and does not know the player exists"* — and a chapter whose every threat obeys that rule is the chapter the owner just played.

> **The best property of it is nearly free — but the first draft of this spec described it wrongly.** Prey flees predators (Part 3), and the orca is a predator. While it orbits the player at radius R, a fish between the two is pushed **outward by the player** and **inward by the orca**, and those two vectors are *directly opposed*. They do not compress the fish onto the player; they cancel at an equilibrium ring somewhere between the two, whose position depends on the relative fall-off of the two fear fields.
>
> So the honest geometry is: **the orca produces an annulus, not a ball** — and an annulus is a poor bait ball and a worse silhouette. **Part 0's cohesion term is what collapses it.** With a threat-weighted pull toward the shoal centroid, a school squeezed into that ring is simultaneously being pulled into its own middle, so the ring closes into a mass at the point on it where the school already was. The orca still hands you the densest crowd of the run at the moment you must dodge — but it does so **only if Part 0 exists.** Without cohesion this whole paragraph is false.

This is the clearest illustration of why Part 0 is a prerequisite rather than a refinement: the orca's best property is a *consequence* of cohesion, not an independent feature.

**Entity shape — `run.net`'s shipped idiom, not a pool.** `run.orca` is a single nullable object with a `run._orcaAcc` countdown, and `stepOrca(run, dt)` returns `true` if the player died, called from `stepSim` beside `stepTrawl`. One object, no `syncPool`, no `clearWorld` array registration — the net is the precedent for all of it.

**State machine:**

| state | duration | behaviour |
|---|---|---|
| `rising` | `ORCA_RISE_DUR` ~3.5s | **Not in the play plane.** Drawn on the deep parallax layer the hull already uses — hazed and desaturated, growing and sharpening as it comes up. Converges on the player's position, so the telegraph is literally *a big shadow underneath you*. No collision. |
| `circling` | `ORCA_CIRCLE_DUR` ~5s | In the play plane. Orbits the player, tightening from `ORCA_ORBIT_R` toward `ORCA_ORBIT_MIN_R`. **Harmless on contact** — the commit is the damage — so the compression gift is safe to collect. Prey flees it (Part 3, free). |
| `committing` | `ORCA_COMMIT_DUR` | Locks a line through the player's position at the moment it breaks orbit, dashes along it at `ORCA_DASH_SPEED`, overshoots by `ORCA_OVERSHOOT`. `ORCA_DMG` on contact, **once per pass** — not a DoT. |
| `leaving` | `ORCA_LEAVE_DUR` | Descends back to the deep layer and fades. |

**Cadence:** `ORCA_FIRST_PASS` = 100s, `ORCA_INTERVAL` = 50s → arrivals at t = 100, 150, 200, 250, i.e. **four visits in a 300s run**, matching the ruling. **One commit per visit** — four dodges per run, not eight to twelve. If that measures as too thin, an `ORCA_PASSES` count is the knob, and it is deliberately not shipped on the first cut.

**Damage: `ORCA_DMG_FRAC`, a fraction of max HP — NOT a flat number.** First cut **0.34**, i.e. three connections kill from full at any HP total.

> **Why a fraction.** `p.maxHP` is not fixed: it grows *within* a run (`p.maxHP += choice.bonus`, sim.js:341) and *across* saves (`PLAYER.baseHP + shopBonus(bm, bookId, 'maxHP')`, state.js:1938). A flat literal would be three hits on a base save and a scratch on an upgraded one — the identical scar already recorded against `LUNGE_DMG` ("⚠ FLAT MEANS IT DECAYS. A literal that is a real hit at t=60 is a scratch at t=300"). Do not repeat it.

> **The engine's floor is TWO connections, not three.** `hurtPlayer` (sim.js:2830) computes the non-dot path as `Math.min(Math.round(p.maxHP * HURT_CAP_FRAC), Math.max(1, Math.round((rawDmg - run.passives.armor) * run.mods.contactDmgTakenMul)))` — so the cap is against **max** HP (not current), is applied **last** as the outermost `Math.min`, and cannot be composed past by any later multiply. At `HURT_CAP_FRAC` 0.5 the largest possible single hit is half the bar, so **two connections is the hard floor** and no `ORCA_DMG_FRAC` above 0.5 does anything at all. The knob that makes the orca more dangerous is commits-per-visit, not damage.
>
> Note also that `armor` is subtracted and `contactDmgTakenMul` applied **before** the cap, so `ORCA_DMG_FRAC` is a pre-mitigation number and an armoured player takes materially less.

**Not killable.** No health pool, no vulnerability window, no reward for engaging it. The reward is the ball it leaves compressed on your position.

---

## 4. Wiring — every site that fails silently

Per `CLAUDE.md`, each of these is enforced by a cross-file source-text scenario and each fails with nothing thrown:

- **run EV** — every `{type:'x'}` emitted needs a render case, an `SFX_FOR_EVENT` entry, or a written `SILENT_BY_DESIGN` line. New events: `orcaRise`, `orcaStrike`, `orcaHit`. All three are **rare** (four per run), so all three get sound — the opposite of the freeze/SUBMISSION reasoning, which withheld sound for events firing dozens of times a minute.
- **Contract fields.** `_shoalN` is a new field render must read for the ball tell. This is exactly the `_elFrozen` failure mode — a new mechanic published into a private field that `render.js` never learns about is indistinguishable from broken. Grep `render.js` for `_shoalN` before claiming the tell exists.
- **The ball needs a visible tell.** A player must be able to see a ball forming or the whole mechanic is invisible. Cheapest honest option: prey tints/brightens with `_shoalN`, so a forming ball glows as it packs.
- **`DMG_SRC_NAME`** — a new `orca:` row, or a death by orca prints nothing on the summary screen. **This one is already guarded, and the first draft of this spec had it backwards.** `DMG_SRC_NAME`'s values are bare strings rather than objects with `.name`, so the generic one-level table walk cannot see them — but `test/sim-test.js:15874` carries a dedicated line for exactly that reason (`for (const v of Object.values(DMG_SRC_NAME ?? {})) need(v)`), added in v7.120.0 (ac9adc8, 2026-08-17) the day the summary screen's killer line landed. So an `orca:` row shipped without a French entry turns the suite **red**, not silent. The test can demand a translation exists; it cannot write one. **The French wording is an owner decision** (L'Orque / L'Épaulard / something else) — do not invent it.
- **`clearWorld` / `createRun`** — `run.orca = null` and `run._orcaAcc` reset, plus whatever render-side graphics the orca owns cleared, on the net's precedent ("a run that ends mid-pass must not leave a net"). A run ending mid-visit must not carry an orca into the next one.
- **`state.js` doc block** — `run.orca`, `run._orcaAcc` and `e._shoalN` all added.
- **Art** — the orca bake obeys the top-down projection rule; load `game-art-and-copy` before drawing it. It needs two readings: the hazed deep-layer silhouette and the full play-plane animal.

---

## 5. What must be measured before any of this ships

**The rig does not exist yet, and that is the first deliverable.** `scripts/charge-probe.mjs` already carries `WRECK_MOVES` (`hunt` vs `ignore`) precisely because every earlier movement policy modelled a player being *chased* and therefore measured a player who never eats. The same gap exists again one level up: **there is no policy that herds.**

- **New policy axis: `herd` vs `mow`.** `mow` crosses the map in a straight line at full speed — the current dominant strategy. `herd` works shoals. The design succeeds only if `herd` measures materially better than `mow` on mean Bloodlust and on kills/min. If it does not, `BALL_FULL_N` and `BALL_REFILL_GAIN` are wrong, not the design.
- **`scripts/weapon-census.mjs`** on `gnash` with and without the density term, to size `BALL_DMG_GAIN` and to settle the flagged question of whether the damage half does anything at all on ~5 HP prey.
- **`ORCA_DMG_FRAC` and the dodge window** against real runs — four unavoidable hits would make it a tax, four dodgeable ones make it the chapter's highlight. Measure the **connect rate** first: a commit that lands 100% of the time is not a dodge, it is a scheduled HP tax, and no damage number fixes that.
- **The `_shoalN` distribution itself**, before fitting `BALL_FULL_N`. Log a histogram of `_shoalN` over a real run and set the threshold off what a genuine ball actually reaches — the geometric ceiling is ~34, but the number that matters is what the 90th percentile of a herded shoal hits, which nobody knows yet.
- Re-run **`scripts/obstacle-contrast.mjs`** if the ball tell changes any prey tint: `BIOME_WRECK`'s steel is already the palest obstacle family in the book and must stay clear of the roster.

Per `CLAUDE.md`: quote the A/B, never the profile, and print the denominator in every sweep line.

---

## 6. Tests

New scenarios in `test/sim-test.js`, in the existing plain-`assert` style, each **mutation-proved on a scratch tree** (`git archive` — never `git checkout src/sim.js`, which silently discards real edits):

0. **Cohesion tightens a threatened shoal.** Place a school, step it with a threat present, and assert mean pairwise distance **falls**; assert it does *not* fall for an unaware school (the `PREY_COHESION_BLEND` threat weighting). This is the load-bearing one — mutation-prove it by deleting the cohesion term and confirming the test goes red.
1. `_shoalN` is zeroed every frame and does not accumulate across steps.
1b. **`_shoalN` counts within `BALL_R`, not within `minSep`.** Place two bodies 40px apart (outside `minSep` 20.8, inside `BALL_R` 64) and assert each reports a neighbour. This is the exact regression that would silently cap `_shoalN` at the kissing number of 6 — it must fail if the increment is moved after `resolveSeparationPair`'s early-out.
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

1. **Part 0 (cohesion) FIRST, and alone.** Nothing else in this spec has an effect without it. Build the term, then *look at the game* — a shoal must visibly tighten under pressure before a single balance number is written. If it does not, stop; the rest of the design is built on it.
2. **Part 1** (`_shoalN` + the multipliers) and its `herd`/`mow` probe policy. Fit `BALL_FULL_N` to a logged `_shoalN` histogram **after** Part 0's cohesion/separation equilibrium is measured, never before.
3. **Part 3** (prey flees predators) — a handful of lines, and a prerequisite for the orca's best property.
4. **Part 4** (the orca) — the largest piece: new entity, state machine, two bakes, three events, an i18n row.

Part 2 is not a build step. It is what parts 0, 1 and 3 already imply.

**The gate between step 1 and step 2 is a visual one, not a numeric one.** Per this project's standing rule, verify the art/behaviour by *shooting a frame*, not by reasoning from the code — a shoal that does not visibly ball on screen has not balled, whatever `_shoalN` reports.
