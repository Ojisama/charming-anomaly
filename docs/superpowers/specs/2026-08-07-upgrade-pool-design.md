# Track B — Upgrade pool redesign

**Status: ACTIVE.** Design revised twice under adversarial review and validated in the harness.
Distribution is **within ~2pts of declared on all three reference configs**, and the net power buff
is **resolved** — offset with enemy HP ×1.8, measured to difficulty parity. The one remaining
blocker is the **card list itself** — see [Open work](#open-work).
**Blocks:** [Track A](./2026-08-07-dot-rework-and-sim-fixes-design.md), which is on hold until this
design is final (user call, 2026-08-07 — A's DoT numbers are sized against today's 5.9% element
share, which this design moves to 18%).
**Verify with:** `node scripts/pool-probe.mjs <chapter> <slots> <runs> [policy] [--proposed|--compare]`.

## Harness validation (body, 2 slots, 30 runs)

`node scripts/pool-probe.mjs body 2 30 random --compare` against the pipeline in B1–B5:

| | current | proposed | target |
|---|---|---|---|
| passive share | 62.1% | **30.1%** | 30% |
| mod share | 21.0% | **29.7%** | 30% |
| weapon share | 10.5% | **21.7%** | 22% |
| element share | 6.4% | **18.6%** | 18% |
| **defence share** | 18.6% | **18.0%** | parity, no rebasing |
| **legendary share** | 4.5% | **2.6%** | ≤ shipped, **not** 9–16% (F1) |
| mythic share | 1.9% | 1.5% | retained as jackpot |
| short pools | 0/1106 | **0/1377** | 0 (F2) |
| anomalies/run | — | **3.00** | ≤ 4 (F11/F13) |

All guards pass, all four buckets land within 0.6pts of declared. `empty-pool rolls 23.8/run`
confirms the F1 path fires on ~35% of card rolls while legendary stays *below* baseline — under the
first draft every one of those deflected into a legendary (measured 16.1%).

**Unresolved, surfaced by the harness — this is the one open design call.** The proposal is a **net
power buff**, and the ordering fix made it larger than first measured:

| | body/2 | city/2 | beyond/4 |
|---|---|---|---|
| cards/run | 55.3 → 68.8 (**+24%**) | 64.5 → 77.7 (**+20%**) | 85.7 → 112.0 (**+31%**) |
| **weaponLvSum** | 4.1 → **7.4** (1.8×) | 2.5 → **8.1** (3.2×) | 2.5 → **6.1** (2.4×) |
| level reached | 28.6 → 35.4 | 33.4 → 39.9 | 22.4 → 29.0 |

The headline is not the extra cards, it is **weapon investment roughly tripling** — a direct
consequence of the weapon bucket finally receiving its declared 22% instead of the 5–10% it
emergently got. Combined with cutting filler passives, clears are faster → more XP → more levels →
more cards, a compounding loop.

Three ways to go, and it must be decided before ~32 anomalies are balanced against it:

1. **Accept it.** The game gets more generous; anomalies are authored against the stronger baseline.
2. **Offset globally** via `xpForLevel` or enemy HP — keeps the composition, restores the curve.
3. **Lower `BUCKET_WEIGHTS.weapon`** below 22 — but then the ceiling problem returns by choice
   rather than by accident, and weapons stay the thing you rarely get to build.

### Survival measurement — the buff is real, and it is worth ≈ +70% enemy HP

`--survival` drops the HP refill and the 4000px magnet and drives a **kite-and-collect bot**
(flees enemies 1/d inside 600px, else walks to the nearest gem; pure flee inside 170px; no
projectile dodging, no cover, no obstacle pathing). It is a **floor on player skill, not a model of
one** — quote the policy with every number, per the standing repo rule.

Two rig findings that invalidate naive readings, recorded so they are not re-learned:

- **A pure kiter never collects, so it never levels** (level 6.3 vs 28.6 immortal). A probe whose
  bot barely levels cannot see a change to the level-up pool at all — it reported "+0.0pts, no
  difference" for a pool that is in fact much stronger. Gem-seeking is load-bearing.
- **Shop progression must be modelled.** `makeMeta()` originally gave every shop upgrade level 0.
  Nobody reaches city (ch5) or buys a 4th slot on an empty save, and at shop 0 the bot reached
  level 1.1 in city and died at 54s — measuring the empty save, not the pool. `--shop=N` now
  defaults off the sacrifice ladder: `SACRIFICE_COSTS` is `[20, 40]`, so a **4-slot player has spent
  60 of the 80 available shop levels** and can hold ~2/upgrade, while a 2-slot player can hold 8.

Results (40 runs, `dps` pick policy, shop as noted):

| config | win rate | median survival | level | weaponLvSum |
|---|---|---|---|---|
| body/2 d1 shop8 | 90% → 100% | — | 28.4 → 29.8 | — |
| **body/2 d3 shop8** | **7.5% → 35.0%** | 213.8 → 237.1s (+11%) | 14.2 → 19.6 | 3.2 → 6.3 |
| city/2 d1 shop8 | 0% → 0% | 118.3 → 137.4s (**+16%**) | 5.4 → 6.3 | 1.6 → 2.9 |
| beyond/4 d1 shop2 | 2.5% → 0% | 120.6 → 190.7s (**+58%**) | 11.3 → 17.3 | 3.0 → 7.7 |

body/2 **d1** is at the ceiling (the bot already wins 90% with a stocked shop) and cannot
discriminate — use d3+ for this question. city and beyond never win, so read survival time there.

**Offset sweep** (`--offset=N`, enemy HP ×N on the proposed pipeline only, body/2 d3 shop8):

| offset | win rate | median survival | weaponLvSum |
|---|---|---|---|
| ×1.0 | 7.5% → 35.0% | +10.9% | 3.2 → 6.3 |
| ×1.4 | 7.5% → 20.0% | +7.7% | 3.2 → 5.8 |
| ×1.6 | 7.5% → 15.0% | −2.0% | 3.2 → 4.5 |
| **×1.8** | **7.5% → 7.5%** | **−3.9%** | 3.2 → **5.1** |

**≈1.7× enemy HP neutralises the entire gain** — that is the size of the buff, stated as a lever.

**The finding that decides this: at ×1.8, difficulty is back at baseline but `weaponLvSum` is still
5.1 against 3.2.** Composition and difficulty are **separable**. The redesign's actual goal — you
get to build a weapon instead of collecting filler passives — survives a full clawback. So this is
not "more fun vs. same difficulty"; you can have both.

### Which lever — and why it is NOT `xpForLevel`

Decision (user, 2026-08-08): **offset rather than accept**. The lever was initially specced as
`xpForLevel`, on the reasoning that it attacks the compounding faster-clears → more-levels loop
while leaving time-to-kill feel intact. **Measurement reversed that.**

`xpForLevel` is a module-level import (config.js:1544) the harness cannot shim, so the sweep used
`run.mods.xpMul` (sim.js:5705), which scales gem xp at pickup and moves total picks the same way.
Cumulative xp to level L is `sum(5 + 4l) ≈ 5L + 2L²`, so the quadratic term dominates and cost
scales ~linearly in the coefficient: **`xpMul = m` ≈ `xpForLevel = 5 + level * (4/m)`**.

The buff is **composition, not volume.** At a stocked shop the offer probe shows cards/run moving
only 67.0 → 70.5 (**+5%**) while `weaponLvSum` goes 4.7 → 8.3 (**+77%**). Cutting the XP curve ~40%
to offset a +5% volume change is a large correction aimed at the wrong variable.

(The earlier "+24% cards" figure was measured at **shop 0**. It is real for a first-ever run and
much smaller for a progressed player — every card-count claim needs its shop level attached.)

Both levers reach difficulty parity; they differ in what they cost. Body/2 d3 shop8, 40 runs:

| lever | win rate | level-ups | weaponLvSum | verdict |
|---|---|---|---|---|
| baseline | 7.5% | 14.2 | 3.2 | — |
| no offset | 35.0% | 19.6 | 6.3 | far too easy |
| **enemy HP ×1.8** | **7.5%** | **12.8** | **5.1** | parity, −10% screens |
| xpMul 0.6 (`5+level*6.67`) | 10.0% | 11.2 | 4.3 | parity, **−21% screens** |

A level-up screen *is* a choice moment, so screens are the currency of the stated goal (more agency,
more "aha"). The XP lever spends more of them for the same difficulty, because it cuts xp directly
while enemy HP only does so through slower clears.

**Recommendation: enemy HP for difficulty, `xpForLevel` only if screen count needs its own tuning.**
Two orthogonal knobs, each doing one job:

1. `hpScale`/`enemyHpMul` ≈ **×1.7–1.8** restores the difficulty baseline.
2. If ~13 level-ups/run is too few, lower `xpForLevel` *deliberately* to buy screens back — do not
   let screen count be a side effect of a difficulty knob.

Note the standing tension, which no lever removes: **at difficulty parity you cannot also have more
level-ups.** Parity difficulty means parity survival time, which means roughly parity kills, which
means roughly parity xp income. Screens are structurally pinned near ~13 here.

Two-knob sweep confirming that (body/2 d3 shop8, 40 runs; baseline win 7.5%, level 14.2):

| HP × | xpMul | win rate | level-ups | weaponLvSum |
|---|---|---|---|---|
| 1.4 | 0.85 | 17.5% | 13.9 | 5.2 | 
| 1.7 | 0.92 | 5.0% | 12.7 | 4.8 |
| **1.8** | **1.0** | **7.5%** | **12.8** | **5.1** |
| 2.0 | 1.15 | 7.5% | 13.3 | 4.8 |

Raising xp to buy screens back needs a matching HP raise to stay at parity, and the extra HP
suppresses kill count — which suppresses xp. ×2.0 sponge buys **+0.5 levels** over ×1.8 alone. Not
worth it.

**Superseded — see [the hpScale tail](#better-lever-steepen-the-hpscale-tail-not-a-flat-multiplier).**
Flat enemy HP ×1.8 reaches parity but costs 10% of the level-up screens. Reshaping the tail reaches
the same parity while *gaining* 7%, so the flat multiplier is strictly dominated. The ×1.8 figure is
retained here only as the size of the buff, stated as a lever.

Watch item: ×1.8 lengthens time-to-kill and spongy enemies are a known feel-killer on this repo.
Re-run the sweep against `hpScale` (the shipping lever) and check TTK in playtest before locking it.
If TTK degrades, prefer accepting slightly-easier over pushing HP higher.

### SUPERSEDED — flat per-chapter multiplier, replaced by the hpScale tail below

Kept for the ×3 measurement, which still stands. The ladder itself is superseded by
[the tail reshape](#better-lever-steepen-the-hpscale-tail-not-a-flat-multiplier).

### Per-chapter ladder (user, 2026-08-08): "no change in ch1, up to ×3 in the last"

**The channel already exists** — `CHAPTERS[id].balance.enemyHpMul`, folded at state.js:1098. This is a
table edit, not new machinery. Current ladder:

| body | pond | garden | undergrowth | city | skies | beyond |
|---|---|---|---|---|---|---|
| 0.75 | 0.85 | 0.9 | 1.0 | 1.05 | 1.15 | **1.0** |

Note it **already goes down at the last step** (skies 1.15 → beyond 1.0): undergrowth and beyond
carry no `enemyHpMul` at all, so the final chapter is currently softer than the two before it.

**First: the offset needed for parity is roughly UNIFORM, ~1.9.** Measured 1.8 (body/2 d3 shop8) and
1.9 (beyond/4 d1 shop2). An earlier read that "the easing scales with slot count" was **confounded**
— the 4-slot config also runs at shop 2, because `SACRIFICE_COSTS` [20,40] spends 60 of the 80
available shop levels, while the 2-slot config runs at shop 8. That was the shop, not the slots.
(beyond/2 shop8: win 22.5% → 72.5%, level 21.3 → 32.9 — the buff is large at 2 slots too.)

So a rising ladder is **not compensation, it is a deliberate re-cut of the difficulty curve.** That
is a legitimate goal — "difficulty that never plateaus" is stated user taste — but it must be
costed as such, not mistaken for neutralising the pool.

**Second: ×3 at the top is too far.** It does not make the last chapter harder, it makes it
*shorter* (beyond/4, 40 runs):

| offset | median survival | **level-ups** | weaponLvSum |
|---|---|---|---|
| baseline | 120.6s | 11.3 | 3.0 |
| ×1.0 | 190.7s (+58%) | 17.3 | 7.7 |
| ×1.9 | 128.9s (+7%) | 11.8 | 5.7 |
| ×2.2 | 95.6s (−21%) | 9.3 | 4.8 |
| ×2.5 | 89.3s (−26%) | 7.9 | 4.4 |
| ×3.0 | 71.9s (−40%) | **6.3** | **3.7** |

At ×3 level-ups collapse 11.3 → 6.3 and `weaponLvSum` falls back to 3.7 — approximately the **old**
pool. You die before you can build, so the redesign's entire payoff (meaningful build choices) is
deleted in the chapter that should show it off best. **×2.2 is the practical ceiling**: clearly
harder (−21% survival) while level-ups hold at 9.3.

**Proposed ladder** — stated as TOTAL `enemyHpMul`, i.e. what goes in `CHAPTERS[id].balance`:

| | body | pond | garden | undergrowth | city | skies | beyond |
|---|---|---|---|---|---|---|---|
| **new** | **0.75** | 1.00 | 1.25 | 1.55 | 1.85 | 2.10 | **2.35** |
| vs parity (1.9×current) | 52% | 62% | 73% | 82% | 93% | 96% | **124%** |
| step | — | +33% | +25% | +24% | +19% | +14% | +12% |

Chapter 1 is untouched, so it keeps the full gift of the redesign — appropriate for onboarding, and
consistent with how heavily body is already eased (net spawn 0.30, xp 2.775). The curve then
tightens monotonically to *harder than today* in beyond. Steps decelerate and all stay under +40%,
matching the shape v6.6.7 established for the `maxAliveMul` ladder.

**Before shipping:**

1. Verify per chapter — only body, city and beyond are measured; pond/garden/undergrowth/skies are
   interpolated. Run `--survival --compare --offset=<new/current>` for each.
2. Add a monotonicity assert walking `CHAPTER_ORDER` (fails on a step that goes DOWN or exceeds
   +40%), mirroring Run VV's `maxAliveMul` guard. The current ladder would fail it today.
3. Re-check TTK per chapter at the top of the ladder — 2.35 is a lot of sponge on beyond's roster.

### BETTER LEVER: steepen the hpScale tail, not a flat multiplier

User, 2026-08-08: *"rather than flat hp multiply, increase the top end of hp curve at the end of a
5min run."* **Measured better than the flat multiplier on the metric that matters, and adopted.**

The knob already exists and is already isolated (config.js:1467):

```js
hpScale(t) = (1 + t/90) * (t <= HP_SCALE_LATE_START ? 1 : 1 + HP_SCALE_LATE_RATE * (t - START))
// shipped: START 150s, RATE 0.005  ->  hpScale(300) ≈ 7.6x
```

Body/2 d3 shop8, 40 runs, at difficulty parity either way:

| | baseline | flat HP ×1.8 | **tail RATE 0.022** |
|---|---|---|---|
| win rate | 7.5% | 7.5% | 7.5% |
| **level-ups** | 14.2 | 12.8 (**−10%**) | **15.2 (+7%)** |
| weaponLvSum | 3.2 | 5.1 | 5.3 |

Same difficulty, same build quality, but the tail **keeps the level-ups the flat multiplier ate** —
because the curve is unchanged until 150s and most levelling happens before then. This directly
fixes what killed ×3: a flat multiplier taxes the early game where you are still building, so it
buys difficulty by deleting choice moments. The tail buys it from the part of the run where the
player is already established.

**The tail is self-targeting, which is the real argument for it.** It only affects runs that survive
deep enough to reach it. beyond/4 (shop 2 — a player who spent 60 of 80 shop levels on slots) dies
at a median 120s, *before* the 150s start, so the reshape does not touch them at all, while the same
chapter's buffed runs reaching 190s+ do get hit. A struggling player is left alone by construction;
a flat multiplier punishes them hardest.

Cost: it is weaker against a strong progressed player, who out-scales it. beyond/2 shop8 (baseline
win 22.5%) needs RATE **0.05** to come down from +50pts to +10pts, and still does not fully
neutralise — but even there it holds level-ups *above* baseline (27.0 vs 21.3).

**Proposed ladder on `HP_SCALE_LATE_RATE`** (per chapter, replacing the flat `enemyHpMul` ladder):

| | body | pond | garden | undergrowth | city | skies | beyond |
|---|---|---|---|---|---|---|---|
| **RATE** | **0.005** | 0.010 | 0.015 | 0.020 | 0.028 | 0.036 | **0.045** |
| hpScale(300) | 7.6× | 9.6× | 11.5× | 13.4× | 16.5× | 19.6× | 22.6× |

Chapter 1 keeps the shipped curve, so it keeps the full gift of the redesign — right for onboarding,
and consistent with how heavily body is already eased. The end of the run then gets progressively
more brutal per chapter, which is "difficulty that never plateaus" expressed on the axis where it
costs no choice moments.

**Before shipping:**

1. `HP_SCALE_LATE_RATE` is a module-level export read by `hpScale`; making it per-chapter means
   routing it through `CHAPTERS[id].balance` and having `hpScale` take the chapter (or folding the
   ratio into `run.mods` at spawn). Pick one — do not let sim.js read the constant directly.
2. Verified on body/2 d3 and beyond/2 only; the rest are interpolated. Sweep each chapter.
3. **TTK check is mandatory at the top.** beyond at 0.045 is 22.6× enemy HP at t=300 against a
   shipped 7.6×. The player's power grows ~2.7× under the new pool, so this is not as lopsided as it
   looks, but the last 60s of beyond needs to be played before locking the number.
4. Harness support: `--laterate=N --latestart=N` (drives `run.mods.enemyHpMul` by the ratio of the
   new curve to the shipped one, which reproduces the reshape exactly for enemies spawned after the
   change — the same read-once-at-spawn semantics the real `hpScale` has).

Caveats: one bot policy, one pick policy (`dps`), 40 runs — win rates carry a wide binomial
interval, and the offset bracket is ±0.2 at best. Treat ≈1.7× as an order of magnitude, and re-run
the sweep against whichever lever actually ships.

### RESOLVED — bucket weights are now honoured: roll the bucket, *then* the rarity

The first draft rolled **rarity first, then bucket**, and filtered weapon candidates by the rolled
rarity (`wOk = wp.filter(w => w.rarity === rarity)`). On any rarity no available weapon happened to
carry, the weapon bucket did not exist at all and its 22 points redistributed to whatever remained.
Same shape for mods via the per-pool cap. Measured drift against a declared
`{passive 30, mod 30, weapon 22, element 18}`:

| | body/2 | city/2 | beyond/4 | worst drift |
|---|---|---|---|---|
| passive | 28.6% | **34.0%** | **34.6%** | +4.6 |
| mod | 28.8% | 30.4% | **22.1%** | −7.9 |
| weapon | 16.9% | **6.7%** | 11.9% | **−15.3** |
| element | 17.4% | **21.4%** | **23.3%** | +5.3 |

**Rarity is a bonus scalar; it has no business choosing the kind of card.** The fix is ordering:

1. Anomaly tier, rolled against the *whole* ordinary table rather than as an entry inside it.
2. Bucket, from `BUCKET_WEIGHTS`, dropping only genuinely empty buckets.
3. Rarity *within* the bucket, purely to scale the bonus.

Weapon inherent rarity becomes a **weight inside the bucket, never a filter** — `hole` (legendary)
and `rainbow` (mythic) stay rare finds without a rarity roll being able to delete the bucket.

Measured after the fix (`--compare`, 40 runs, all buckets ±2pts):

| bucket | declared | body/2 | city/2 | beyond/4 | absent |
|---|---|---|---|---|---|
| passive | 30% | 30.1% | 31.7% | 31.7% | 0.0% |
| mod | 30% | 29.7% | 30.8% | 30.0% | ≤3.9% |
| weapon | 22% | 21.7% | 20.2% | 20.4% | 2.5–9.5% |
| element | 18% | 18.6% | 17.4% | 18.0% | 0.0% |

Re-verified after `--shop` defaults landed (longer runs → more capacity exhaustion): worst drift
1.4pts, so the result is not an artifact of an empty save.

Two secondary findings fell out of it:

- **Weapon rarity must gate acquisition, not levelling.** Weighting *owned* weapons by inherent
  rarity too made beyond read 16.6% legendary weapon offers and city 4.2% mythic (vs 1.4% shipped) —
  the colour re-fired every pool for a jackpot the player already had. A `New!` card carries the
  weapon's rarity; an upgrade card competes as a common and shows no tier. Legendary then lands at
  **2.6 / 2.9 / 4.2%** against a shipped 4.5 / 3.4 / 4.4 — at or below baseline everywhere.
- **`MAX_MODS_PER_WEAPON_PER_POOL` must be 2, not 1.** At 4 slots the shipped 1 left the mod bucket
  empty on **15.1%** of rolls (−4.6pts). At 2: absent 2.6%, drift 0.0pts, and 2-slot configs are
  unaffected (body mod absence 3.6% → 0.0%). Note this permits a 2-card pool of two mods from the
  same weapon — acceptable, but confirm it reads well before shipping.

Still open: `MAX_WEAPONS = 4` vs the six chapters that ship 3 weapons. It now costs only ~1.8pts
(weapon bucket absent 9.5% in city, since the arsenal fills and maxes out), so it is a design
question about whether owning everything should be the default outcome (measured 73–99% of runs),
not a distribution bug.

### Anomaly rate is not controlled across chapters

Measured **2.25/run (beyond/4) to 3.25/run (city/2)** — a 1.44× spread, tightened from 1.9× by the
ordering fix but not eliminated, and it still does *not* track slot count: the 4-slot config produces
the *fewest* anomalies. Two causes compound — chapter XP economies differ (city reaches level 39,
beyond 28), and the level-gated anomaly tiers (`level >= 8`/`>= 10`) consume a larger fraction of a
short run. F13 was filed as "city farms anomalies"; the real problem is that the rate is uncontrolled
in both directions.

If "≈3 anomalies per run" is a design target rather than an average, drive pity off `run.time`
instead of card count. Otherwise state the spread as intended and move on — but state it.

Goal stated by the user: more fun, more player agency, more "aha moments" — via the rarity system,
bucket percentages, per-chapter uniques, and card text/numbers/feel.

---

## Diagnosis (measured, not assumed)

`rollCard` (sim.js ~3916) rolls a rarity, gathers **every** eligible candidate of that rarity into
one flat array, and picks uniformly. Card-kind share is therefore emergent from list length: ten
passives are always eligible, so they swamp everything.

`node scripts/pool-probe.mjs`, 40 runs per config:

| chapter | slots | avg level | cards/run | passive | mod | weapon | element |
|---|---|---|---|---|---|---|---|
| body | 2 | 21.0 | 40.0 | 62.2% | 21.8% | 10.6% | 5.4% |
| body | 4 | 24.1 | 92.6 | 63.6% | 20.2% | 10.2% | 5.9% |
| city | 2 | 32.2 | 62.4 | **67.8%** | 21.5% | **4.9%** | 5.9% |
| beyond | 4 | 19.2 | 72.7 | **68.4%** | 18.2% | 6.9% | 6.5% |

Measured rarity: normal ~58%, rare ~29%, epic ~7%, legendary ~3.5%, mythic ~1.8%.

Three problems:

1. **Passives are 62–68% of every card**, and they are ten flat stat lines.
2. **Rarity only multiplies a number.** All tiers draw from the same bag, so a mythic roll — 1.8%
   of cards, well under one per run — is still ~65% likely to be "+52% Zoomies". The rarest event
   in the game resolves to a bigger number on the most forgettable card.
3. **The pool flattens as chapters progress.** Later chapters ship 3 weapons instead of 4, so
   passives dominate *more* in the chapters players reach after investing the most hours. New-weapon
   discovery collapses to **4.9%** in city — about three weapon cards in a 62-card run.

Also note **the card budget is small and varies 2.3×**: 40 cards/run at the default 2 slots, 93 at
4. Any per-card rate must be checked at both ends.

---

## Design

### B1. Explicit buckets replace the flat bag

```js
BUCKET_WEIGHTS = { passive: 30, mod: 30, weapon: 22, element: 18 }
```

Roll pipeline:

```
1. compute anomaly eligibility FIRST; if the pool is empty, anomalyWeight = 0
2. roll rarity on RARITY_WEIGHTS (pity-adjusted anomaly weight, reroll-adjusted normal weight)
3. anomaly tier  -> pick from eligible ANOMALIES (weighted, see B4)
   else          -> roll a bucket, drop empty buckets and renormalize,
                    re-roll among remaining buckets if the chosen one is empty at pick time,
                    then pick within it; card adopts the rolled rarity
```

**Never walk down the rarity ladder into a bucket roll, and never fall through from an empty
anomaly tier to legendary** — see F1.

Deletions this enables: `MOD_POOL_MAX`, `ELEMENT_CARD_WEIGHT` (but see F8).
Kept: `MOD_CANDIDATES_PER_WEAPON`, `MAX_MODS_PER_WEAPON_PER_POOL`, `NEW_WEAPON_FADE`,
`NEW_WEAPON_MIN_RATE`.

**Weapons keep inherent-rarity gating inside their bucket.** `wc.rarity === rarity` is the only
mechanism making `hole` (legendary) and `rainbow` (mythic) rare finds; uniform-pick-in-bucket
deletes it. Weapon cards also keep `cfg.rarity` for their chip rather than adopting the rolled
rarity — `applyChoice`'s weapon branch never reads rarity, so an adopted one would be a border
colour that means nothing.

### B2. Defensive passives are weighted inside the passive bucket

**Do not retune `PASSIVES` bases.** Cutting passive share 62% → 30% is a survivability cut, because
`armor`/`regen`/`maxHP` are the only direct defence in the pool. But it is **regressive**: measured
defensive picks/run drop **7.70 → 4.51 (−41%)** at 2 slots and only **6.14 → 5.71 (−7%)** at 4. A
flat base scalar cannot bridge that — at `pscale = 1.7` the 4-slot player ends up **+60% armor**
over today.

Instead, weight inside the bucket:

```js
// armor/regen/maxHP weight 4, the other seven weight 1
// -> defensive share 12/19 x 30% = 17.4% of cards, vs 17.8% today. Parity at every slot count.
```

Equivalent alternative: `{ defense: 19, passive: 14, mod: 27, weapon: 22, element: 18 }`.

### B3. Anomaly is a **sixth** rarity tier — mythic stays

```js
RARITY_ORDER   = ['normal','rare','epic','legendary','mythic','anomaly']
RARITY_WEIGHTS = { normal: 100, rare: 50, epic: 12, legendary: 6, mythic: 3, anomaly: 8 }
```

The original design replaced mythic with anomaly. **That was wrong**, and keeping mythic resolves
five findings at once:

- `WEAPONS.rainbow` is `rarity: 'mythic'` **and** the city starter — deleting the tier gives it a
  "Normal" chip and dead CSS.
- `WEAPON_MOD_TIER_BONUS = {…, mythic: 3}` — deleting the tier **silently caps all 15 `kind:'tier'`
  mods at +2 instead of +3**, a stealth nerf nobody would trace.
- `test/sim-test.js` has three assertions naming mythic.
- It preserves the **jackpot card**. Anomalies produce no stat growth, so removing the 6.5×
  multiplier at the same time makes the distribution flatter *and* higher — the worst shape for the
  genre.
- Hades precedent: legendary/duo boons *stand apart from the rarity scale* rather than replacing
  its top rung.

Anomalies carry **no rarity multiplier and no levels** — one-shot rule changes, stored in
`run.anomalies`, filtered out once taken.

### B4. Anomaly cards

```js
export const ANOMALIES = {
  wildfireArc: {
    name: 'Wildfire Arc', icon: '🔥',
    from: 'your 🔥 Fire found your Chain Stars',   // shown on the card — see "hidden conditions"
    desc: 'Chain jumps carry ignite. Burning foes chain one further.',
    when: (r) => (r.elementPicks.fire ?? 0) >= 2 && r.weaponModPicks.star?.chain > 0,
    weight: 6,        // conditional 6 / unconditional 1 / chapter inversion 2
    chapter: null,    // or a chapter id
  },
}
```

Behaviour lives at trigger sites in sim.js reading `run.anomalies.<id>` — the same pattern
behavioural weapon mods already use. Config stays data plus pure predicates.

**Predicate authoring hazard:** `run.weaponMods` / `run.weaponModPicks` are pre-populated for
*every* weapon, so `r.weaponModPicks.star?.chain` is safe. But
`r.weapons.find(w => w.id === 'orbit').level` **throws** when the weapon isn't owned. Write a
shared `hasWeaponAt(r, id, lv)` helper and use it everywhere.

### B5. Pity, capped and non-deflecting

```js
anomalyWeight = eligible.length === 0 ? 0 : Math.min(45, 8 + 2 * run._cardsSinceAnomaly)
```

- Reset when the anomaly tier is **rolled**, not when a card is produced (F1).
- Advance **once per level-up screen** in `stepLevelUp`, not per card and not on reroll (F5).
- `MAX_ANOMALIES_PER_RUN = 4`, and **at most one anomaly per pool**.
- **An anomaly may never occupy the last remaining slot** — always guarantee one non-anomaly card,
  so a forced pick can never be "take a curse or take a curse."

### B6. Reroll nudges rarity, never the anomaly tier

User design call: reroll should carry a small pity factor raising average rarity slightly.

```js
export const REROLL_RARITY_DECAY = 0.8   // `normal` weight multiplier per reroll of THIS screen
export const REROLL_RARITY_CAP = 3
```

| rerolls this screen | normal | epic+ | cumulative coins |
|---|---|---|---|
| 0 | 59.5% | 10.7% | — |
| 1 | 54.1% | 12.2% | 10 |
| 2 | 48.5% | 13.6% | 25 |
| 3 | 43.0% | 15.1% | 48 |

It deliberately **does not touch the anomaly weight** — rerolling buys bigger numbers, not more
rule-changes. Without that separation reroll becomes a pity pump: 133 coins takes anomaly-on-screen
from 21% to 65%.

No `main.js` change needed: `stepLevelUp` sets `run._screenRerolls = -1` before calling
`buildLevelUpChoices`, which increments on entry. First call lands on 0; each reroll steps up; the
next level-up resets. Keeps the "rerolling is just calling it again" contract in state.js:529.

### B7. New run fields

`createRun` gains `anomalies: {}`, `_cardsSinceAnomaly: 0`, `_screenRerolls: 0`.
`applyChoice` gains an `else if (choice.kind === 'anomaly')` branch — today the chain is closed over
`weapon|passive|mod|element|heal` and an anomaly card would be **silently consumed with no effect**.
Update the `run` doc block in state.js (CLAUDE.md makes it normative) with the new fields and the
new `levelUpChoices[i]` kind.

**No save migration needed** — `run` is never serialized; `saveMeta`/`loadMeta` touch only `meta`.

---

## Player-facing decisions already made (do not relitigate)

- **Anomaly conditions are hidden.** No codex, no near-miss UI. The only teaching is the `from:`
  line on the card. *Recommended companion, not yet accepted:* passive pick-counts are currently
  invisible everywhere in the UI, so a player cannot count their own Sharp Eye picks even while
  trying. Adding passive chips to the HUD and the taken anomalies to `renderSummary` would make
  hidden conditions learnable without a codex.
- **Ship in two tracks** — Track A first, this second.

---

## Adversarial findings this design already answers

Four agents reviewed the first draft (fun / balance / edge cases / cheese); everything below was
verified by hand against the code. Recorded so a future pass doesn't re-derive them.

| # | Finding | Resolution |
|---|---|---|
| F1 | Pity deflects onto **legendary** when the anomaly pool is dry — measured **16.1%** legendary in beyond/4 vs 3.5% today, and the counter deadlocks at cap | B5: eligibility computed first, weight 0, re-roll on the base table; reset on tier rolled |
| F2 | Bucket-first returns **fewer cards than `choiceSlots`** — `MAX_MODS_PER_WEAPON_PER_POOL = 1` caps the mod bucket at one card/pool, ~9% of body/2 screens. `test/sim-test.js:1669` asserts `length === slots` | B1: re-roll among remaining buckets per slot |
| F3 | `pickWeighted({})` throws inside `app.ticker` — hard softlock | Track A / A4 |
| F4 | `NEW_WEAPON_MIN_RATE` overwrites the **last** card slot unconditionally and would delete anomalies | Skip the swap if any card is `kind:'anomaly'`; move the pity reset after the final array |
| F5 | Reroll is a pity pump *and* burns credit when you reroll past an unwanted anomaly | B5: advance once per screen in `stepLevelUp`; B6 keeps reroll on the rarity axis only |
| F6 | Deleting mythic breaks `rainbow` (city starter), `WEAPON_MOD_TIER_BONUS`, three tests, and the jackpot | B3: mythic stays |
| F7 | Buckets silently delete **weapon inherent-rarity gating**; adopted rarity on weapon cards is meaningless | B1: gate inside the bucket, keep `cfg.rarity` on the chip |
| F8 | Deleting `ELEMENT_CARD_WEIGHT` strands `MUTATORS.unstable` (`elementWeightMul: 3`) — it becomes a pure −15% damage debuff while ui.js still advertises "infusion card chance ×3", on ~25% of Dailies | Fold into the bucket: `BUCKET_WEIGHTS.element * run.mods.elementWeightMul` before renormalizing |
| F9 | **Chapter inversions are auto-picks** — measured `jaywalk` 1.00/run, `localPhysics` 1.00/run. They switch off each biome's identity mechanic in 100% of its runs | Weight 2, and gate behind surviving the hazard (`run._trafficHits >= 5`) |
| F10 | The four unconditional cost cards are taken in ~100% of runs and are the *only* early-eligible anomalies — a new player's first encounter with the new rarest tier is a pure downside | Gate on `player.level >= 8`; B5's last-slot rule |
| F11 | Anomalies ate **22.8%** of level-ups while producing zero stat growth | `MAX_ANOMALIES_PER_RUN = 4`; mythic retained as the jackpot |
| F12 | `weight = 1 + picks` on mods measured a bounded 3× and cut distinct mods 13.7 → 11.4 — it buys repeat picks, not reveals | **Deleted.** If build focus is wanted, bias at the *sampling* stage in `eligibleWeaponModCandidates` |
| F13 | city farms anomalies — the rate is per-card and city reaches level 32 vs beyond's 19 | `MAX_ANOMALIES_PER_RUN`; or drive pity off `run.time` |
| F14 | 70% of mods (92/131) are numbers, not behaviours; only ~6 of a run's 18–23 available mods are behavioural | **Open** — see below |
| F15 | Elements: pick 1 turns the mechanic on, picks 2–5 scale a scalar; cold picks 4–5 are worth zero | Track A part 2 |

**Premise corrected:** the Daily has no shared world seed. `dailyMutators`/`dailyChapter` seed only
the mutator pair and chapter id; obstacles, spawns, and every rarity roll are unseeded per player.
There is no daily-determinism risk. If a seeded daily is ever a goal, `run.anomalies` is
choice-dependent and the pity counter would need folding into the seeded stream.

---

## Open work

**The card list is not done.** The original 35 were written against a mental model rather than the
code; adversarial review killed roughly half. Cards must be re-authored **against verified trigger
sites**, with a `when` predicate, a `from:` line, a weight, and the sim.js site that implements it.

#### Design decisions (user, 2026-08-08)

1. **Anomaly character: mostly pivots, some of each.** Target mix ≈ 18 build-pivots (change *how*
   the kit works — the Hades duo-boon shape), ≈ 8 jackpots (strictly good, flashy), ≈ 6 risky trades
   (real cost to play around). The pool needs per-kind weighting, not one flat anomaly list.
2. **Anomaly rate: rarer — 1–2 per run**, down from the 2.25–3.25 currently measured. Each should be
   an event. **Consequence to handle:** at that rate a run can roll zero, which is a flat run — so
   the design needs a *guarantee* (at least one by level N) alongside the lower base weight.
   Supersedes the "≈3/run" target; `MAX_ANOMALIES_PER_RUN` and `ANOMALY_BASE_WEIGHT` both drop.
3. **Arsenal: leave `MAX_WEAPONS = 4` alone — more weapons are coming later.** Do not build a
   scarcity mechanic; the cap will bite on its own once chapters ship a 4th weapon.
4. **What actually feels flat** (the part measurement could not supply):
   - Cards are boring — mostly stat bumps.
   - **There is a dominant build per chapter** ("maxing claw damage near traps"); everything else
     feels underwhelming. This is a *balance* problem, distinct from the variety problem this spec
     has been solving, and it is not addressed by bucket weights at all.
   - **Not enough agency: you cannot pursue a mod.** "Frustrating to aim for some mod (like laser
     prism sub-beams) and not see any in the run."

#### Deliverability — measured, and it is real

`--compare` now reports, per mod, the share of runs that offered it **at least once** (city, 40 runs):

| mod | shipped | proposed |
|---|---|---|
| `rainbow.prismatic` (the named one) | **62.5%** | **95.0%** |
| `rainbow.*` (starter, owned from t=0) | 60–80% | 82–95% |
| `trashTornado.*` / `sewerGeyser.*` | **20–40%** | 27–45% |
| MEAN across all 19 city mods | 42.9% | 51.7% |

So the complaint is exact: **a named mod is missing from more than one run in three, and a
non-starter weapon's mod from four runs in five.** The redesign fixes the starter case for free
(mod share 21% → 30% is most of it) but barely moves non-starter weapons.

Two levers tested and **neither worked**, recorded so they are not retried:

- `MOD_CANDIDATES_PER_WEAPON` 2 → 4: mean 51.7% → 54.2%, worst case no better. It changes *which*
  mods are eligible, not *how many* mod cards a run contains, so it dilutes rather than delivers.
- A ×3 mod-bucket focus on one weapon: `trashTornado.*` moved only 37.5% → 45%.

**Hypothesis for the residual (unverified — check before designing against it):** non-starter
weapons are *acquired late*, so few pools remain no matter how their mods are weighted. Note the
pool is fully owned in 73–99% of runs, so this is ownership **timing**, not ownership rate. If it
holds, the lever is earlier/more reliable weapon acquisition, not mod weighting.

#### Player-directed roll weights (user idea, 2026-08-08)

> *"the anomaly where dmg is decreased but infusion chance increased is fun. I'd like more of those
> … trade 'passive upgrade roll chance' for weapon upgrade roll chance, or decrease the chance of
> rolling certain weapon mods … via permanent upgrades or gold in the starting view, or during a run"*

**This is the same machinery this redesign already builds, exposed to the player.** `BUCKET_WEIGHTS`
was specced as an internal balance knob; this makes it a mechanic. The precedent already ships:
`MUTATORS.unstable` is `{ elementWeightMul: 3, playerDmgMul: 0.85 }` — a bucket weight traded for a
real cost — and the bucket shim already preserves that hook
(`BUCKET_WEIGHTS.element * (run.mods.elementWeightMul ?? 1)`).

Generalise to one mod key per bucket: `passiveWeightMul` / `modWeightMul` / `weaponWeightMul` /
`elementWeightMul`, all defaulting to 1 and all folded in `MUTATOR_MOD_KEYS` the way
`elementWeightMul` already is. Three delivery surfaces, as named:

| surface | shape | example |
|---|---|---|
| **Shop (permanent)** | a standing bias bought once | "Tinkerer — weapon-mod offers ×1.4, passive offers ×0.8" |
| **Pre-run (gold)** | one-run booster at the briefing | spend the run's opening coins on a bucket tilt |
| **In-run (anomaly)** | a trade card, `unstable`'s shape | "Scattershot — mod offers ×2.5, −15% damage" |

Design rules: every tilt carries a **cost** (that is what makes `unstable` fun rather than free);
tilts are multipliers on the declared weights so the capacity ceilings and fidelity guards still
hold; and a tilt must never zero a bucket (`pickWeighted` throws on an empty object, sim.js:246 —
and a zeroed bucket also reintroduces short pools, which `test/sim-test.js` asserts against).

"Decrease the chance of rolling certain weapon mods" is the same lever pointed at one id — a
suppress/banish. Cheapest honest version: a per-run **focus on one weapon**, which is the shape
already stubbed in the harness as `--focus`. Note the measurement above says focus alone did *not*
fix non-starter deliverability, so ship it for the agency, not as the deliverability fix.

#### THE MOD-KEY VOCABULARY IS FULLY OCCUPIED — read before designing any card

**Every `run.mods` knob is already spent by a `MUTATORS` entry.** All six chapter-signature knobs
and every global one:

| knob | taken by | knob | taken by |
|---|---|---|---|
| `currentForceMul` | **Riptide** (pond) | `spawnMul`/`xpMul` | Overtime |
| `pheromoneLifeMul` | Overscent (garden) | `enemyHpMul`/`coinMul` | Bulky |
| `trapCountMul` | Trap Season (undergrowth) | `enemySpeedMul` | Caffeine |
| `trafficIntervalMul` | Rush Hour (city) | `eliteEveryMul` | Elite Convention |
| `bombardIntervalMul` | Carpet Barrage (skies) | `elementWeightMul`/`playerDmgMul` | Unstable |
| `wellForceMul` | Supermassive (beyond) | `contactDmgTakenMul` | Glass Goo |
| | | `playerSpeedMul`/`magnetMul` | Sticky Floor |
| | | `enemyRadiusMul` | Jumbo |

Consequences:

1. **A card built on these knobs is a mutator with extra steps, and it STACKS with one.** Riptide
   mutator + a Riptide card = `currentForceMul` 4 on a chapter tuned for 2.
2. **Correction to the audit below: "Riptide is revived" was WRONG.** `MUTATORS.riptide` already
   ships (`currentForceMul: 2`, pond). The sim.js:1975 comment *"riptide anomaly turns the field
   up"* names that mutator, not a planned card. The hook is occupied, not free.
3. The "free hooks, zero sim code" route is therefore closed for pivots. The cheap cards are taken.

**Anomalies must do what mutators structurally cannot.** A mutator is chosen before the run and
cannot see your build; an anomaly fires mid-run against a hidden condition. So the territory is
**build-conditional effects and rule changes**, not global multipliers.

#### THE SLATE AS IT STANDS (2026-08-08) — read this first

Two waves and several rounds of cuts have accumulated below. Current status of every card, in one
place. Numbers marked **open** are proposals awaiting the user's call, not decisions.

| card | kind | status | numbers |
|---|---|---|---|
| **TIME DEBT** | pivot | **FINAL** | 1.5× run clock, +50% XP |
| **BRITTLE** | trade | **FINAL** | maxHP → 1, damage ×4 |
| **BERSERK** | pivot | **FINAL** | ×2 damage 5s on taking a hit; no cooldown, no threshold |
| **UNSTABLE CORES** | jackpot | **FINAL** | every elite dies volatile; chains intended, uncapped |
| **OVERLOAD** | trade | **FINAL** | 2× fire rate, 2× damage, 0.75 HP/s — measured 75% win, deaths cluster at 271s |
| **AVARICE** | trade | effect final, **heal open** | 20% of coins heal, drops −30%, **5 HP** per converted coin |
| **BLOOD PACT** | trade | **FINAL** | cannot heal; +0.1% damage/kill and +1%/elite → ×1.7–3.0 end state |
| **BLOOD MONEY** | trade | **FINAL** | rerolls cost 10 HP flat instead of coins (floor at 10 HP) |
| **MINIMES** | pivot | **cadence open** | fleeing self-copies that taunt and detonate, scaling off player stats |
| **WILDFIRE** | pivot | **budget open** | ignite jumps on death; needs a jump budget |
| **ALIGNMENT** | jackpot | accepted | element combos lose their cooldown |
| **DEADFALL** | pivot | accepted | trap immunity, trap re-arm −80% |
| **SPECIALIST** | trade | accepted, downgraded | player-named weapon; targeting tool, NOT a deliverability fix |
| **STILLNESS** | pivot | accepted | damage ramps while you give no move input; decays on moving |
| **MARTYR** | pivot | accepted | HP you lose detonates around you — makes HP into ammunition |
| **CHAOS PACT** | pivot | accepted | repeating 60s cycle: 15s of +50% spawns, then +50% damage |
| **CONSCRIPTION** | jackpot | accepted | killed elites fight for you, inheriting 50% damage / 100% fire rate & crit |
| **BLIND FAITH** | trade | accepted, **cost open** | no normal/rare rolls; cards hidden but for the border; passed cards revealed |
| **SOY MILK** | trade | accepted | ×5 fire rate/projectiles, −80% damage — measured ~neutral, ships as written |
| **IPECAC** | trade | accepted, **shape open** | ½ fire rate, ×3 **count** (user's revision) — must be authored per weapon |

**Cut:** Event Horizon, Supercooled, Slow Burn, Toxic Bloom, Recoil, Riptide, Twin Study, Native,
Harvest, Synchrony, Second Wind (a revive already ships in the shop), Thorns (`retaliate` is already
a quill mod).

#### Card slate (drafted with the user, 2026-08-08)

**THE BAR (user, 2026-08-08): judge on fun, balance and gameplay — NOT implementation cost.** An
earlier draft of this table ranked cards by how cheap they were to build, which is how two stat
bumps in a costume (Alignment, Avarice) got onto a list whose whole purpose is to stop shipping stat
bumps. Cost is a footnote, not a column.

**A jackpot means no COST, not no DECISION.** Unstable Cores is the model: strictly good, and it
still changes where you stand. A card that changes nothing about how you play has failed regardless
of its rarity tier.

**RARITY LICENSES EXTREMITY (user, 2026-08-08):** *"it's ok to have some crazy combos that would
explode and break everything including you, if they're rare enough."* A card that can end a run is
not a balance failure — it is the payoff, provided it is rare. Consequences for authoring:

- Do **not** sand the swing off a card to make it safe. Gate it behind rarity instead.
- The **risky trades** tier (≈6 cards) may be genuinely brutal, up to and including run-enders.
- This composes with the decision to make anomalies **rarer, 1–2/run**: scarcity is what buys the
  licence, so the two decisions are load-bearing on each other. If the rate ever climbs back toward
  3+/run, the extreme cards must be re-priced.
- The limit is **opt-in, not survivability**. The player reads the card before taking it, so a
  self-inflicted catastrophe is a choice and is fair. What stays forbidden is catastrophe the player
  could neither foresee nor act on — which is why the escape check on Unstable Cores below still
  matters even though the combo itself is intended.

Ranked by how much they change *playing*:

| card | kind | hidden gate | what it changes about playing |
|---|---|---|---|
| **BERSERK** | pivot | took a real hit | **Inverts the core loop** — you stop avoiding damage and start seeking it. ×2 damage for 5s on taking a hit. |
| **MINIMES** | pivot | lv ≥ 12 | Copies of you flee outward on a cadence and detonate. **Splits the swarm**; positioning becomes about where your decoys will be. Scales off *player* stats, not a weapon. |
| **UNSTABLE CORES** | jackpot | any elite killed | Every elite dies volatile. Adds a **"back off before it dies"** beat, and packs chain-detonate. |
| **WILDFIRE** | pivot | fire ≥ 2 | Ignite jumps to the nearest enemy on death. **Rewards engaging crowds** — light the front, let it propagate. |
| **DEADFALL** | pivot | undergrowth, lv ≥10 | Immune to traps, traps re-arm 80% faster. **Kite *across* the field instead of away from it.** |
| **ALIGNMENT** | jackpot | 2+ distinct elements | *(redesigned)* Element combos lose their cooldown — shatter/detonate/acid-burn/chilling-arc fire on **every** qualifying hit. Makes the interaction the star instead of a potency number. |
| **AVARICE** | trade | — | *(redesigned)* 20% of coins heal instead of paying out, **and all coin drops −30%**. Turns kill rate into sustain and spends your rerolls to buy it. |
| **SPECIALIST** | trade | 4+ mod picks on one weapon | Meta-level agency only; changes nothing moment-to-moment. Keep, but it is not a pivot. |

*(SUPERCOOLED cut by the user, 2026-08-08 — it was a cap number in a costume. The dead-investment
defect it was covering for is real and stays on the list as a `config.js` fix, not a card: the cold
cap is reached at potency 6.67 while 5 cold picks average 7.4, so the last pick is silently dead.)*

Notes on the two newest, both user-authored:

- **BERSERK takes NO cooldown and NO threshold** (user call, verified). The obvious objection was the
  v6.3.4 turtle cheese — armor floors hits to 1, contact is constant, so a refreshing 5s window
  would be permanent. **It no longer holds:** `armor` rolls 1/2/4 over at most 5 picks and measures
  **2.4–3.7** in real runs, while `dmgScale(300)` = 2× puts late contact at 16 (drone) to 30 (tank)
  before difficulty and elite multipliers. Armor blocks 10–20% of a hit, not 100%. Sustaining ×2
  therefore costs 16–30 damage every `invulnTime` (0.75s) ≈ 21–40 dps against ~150 maxHP.
  **The cost IS the damage, and it scales with `dmgScale`** — the card gets more dangerous the longer
  the run runs, which is exactly the fantasy. No guard needed.
- **MINIMES**: the decoy system already ships as the `lure` weapon — `run.lures`, enemies inside the
  aggro radius path to the decoy instead of the player (sim.js:1103-1107, machines take the seek
  target too), and it bursts for AoE at expiry (sim.js:4883-4884). New: auto-spawn cadence, fleeing
  movement (lures are static), and reading player stats rather than weapon `levels[]`. This also
  refines the Pack Leader kill below — allies that *fight* still do not exist, but decoys that taunt
  and detonate are fully supported.

**Balance risks to resolve before implementation** (named now, not discovered later):

| card | risk |
|---|---|
| UNSTABLE CORES | **Not a risk — INTENDED.** User call: "that's the fun of crazy combos, high risk high reward." Do NOT cap the chain or add falloff; stacking with Elite Convention (`eliteEveryMul: 0.55`) is the payoff, consistent with the standing rule that spiky elites are a feature. **Verified escapable**, which is the test that actually matters (a threat may be impossible to ignore, never impossible to escape): `VOLATILE_FUSE` 0.8s vs `VOLATILE_RADIUS` 120px at `baseSpeed` 220px/s — the player clears the blast in 0.55s, and each bomb in a chain carries its own fuse, so a cascade propagates at 0.8s steps *behind* a running player. Watch instead: `VOLATILE_DMG` is a flat 20 and does **not** scale with `hpScale`, so the cascade is scary early and cosmetic late — that is the knob if it should stay dangerous. **Taken, v6.7.7**, and the paragraph above was wrong about where the chain comes from. Measured with the card forced on for whole runs, flat 20 produced **1.70 blast kills of 933 = 0.18% of a run's kills** and **zero** chained detonations, because a blast can never kill an ELITE (elite HP is `base.hp * ELITE.hpMul * hpScale`, so any blast derived from `VOLATILE_DMG` is 20-30% of it at every `t`) — "each bomb in a chain detonates the next elite" describes a mechanic the code could not produce. Shipped fix: the anomaly's bombs carry `core`, whose **enemy-side** damage is `VOLATILE_DMG * hpScale(t) * CORE_BLAST_ENEMY_MUL`, and **whatever a core kills drops its own core**. The cascade therefore runs through the trash, uncapped, as ruled. The player side stays flat 20 (priced against player maxHP, which does not ride `hpScale`), so escapability is unchanged. Re-measured, same rig: **21.5 detonations/run of which 15.5 are chained, 28.9 blast kills = 3.55% of kills**, self-hits 1.5/run. |
| WILDFIRE | Uncapped cascade — ignite jumping on every death in a 200-enemy field never stops. Needs a jump budget per application. |
| MINIMES | If decoys hold aggro reliably they do not add pressure, they **delete** it. Cadence and duration are the entire balance. |
| DEADFALL | May trivialise undergrowth by turning its signature hazard into a free weapon — that hazard is the chapter's identity. |
| BERSERK | Resolved (see above): self-limiting through damage taken. |

**Cut, with reasons worth keeping:**

- *Slow Burn* (3× ignite duration, ⅓ tick) — net-neutral damage, so it is a **sidegrade**. A card
  costing a level-up must be an upgrade or a real trade.
- *Toxic Bloom* (venom stops expiring while chilled) — needs venom **and** cold **and** for the
  interaction to matter. Three conditions at 1–2 anomalies/run means it almost never fires.
- *Recoil* (knockback shoves you) — breaks "auto-attacks MUST NOT move the player", the rule that
  killed pounceClaws.
- *Riptide* — already a shipped mutator (see above).
- *Twin Study* (two weapons share mod effects) — **mod namespaces are not portable.** The
  `{mod: [field, kind]}` table shows `dmg/pct` is the only field EVERY weapon shares; `clawRake` has
  `arc`/`range`, `tesseractBeam` has `width`/`length`/`duration`. Claws+roar would share richly,
  claws+mines only damage — so it collapses to "+X% damage in a costume" on most pairs, and creates
  a new dominant pair on the rest.

Notes for authoring: **UNSTABLE CORES has an intrinsic cost** — bombs damage the player too
(`hurtPlayer`, sim.js) as well as every enemy in radius. **A bomb's kill cannot detonate the next
ELITE and never could** (see the risk table above): the chain is carried by ordinary enemies the
blast kills, each of which drops its own core, so packs chain over `VOLATILE_FUSE` from the trash
outward rather than elite to elite.

#### AVARICE — priced against a measured coin rate (2026-08-08)

The heal was going to be fixed at 1 HP by eye. Measured instead — city, difficulty 2, `dps` policy,
12 runs, `coinsEarned` at end of run:

| pool | coins/run | cap |
|---|---|---|
| current | **593.0** | 999 |
| proposed | **790.7** | 999 |

Every coin is `value: 1` (sim.js:3195/3198), so that is also the **pickup count** — the quantity
Avarice actually converts, since it heals per pickup and is therefore immune to every `coinMul`
mutator.

**At 20% conversion with drops at −30%: 415–554 coins survive, ~83–111 of them heal.**

That is the number that kills the 1 HP version. Spread over a 300s run, 83–111 HP is **0.28–0.37
HP/s** — and the `regen` passive pays **0.5 HP/s at its *first* normal roll**, up to 2.5 HP/s over
`MAX_PASSIVE_LEVEL` 5. A card that costs 44% of the run's coins would be worth *less than one
ordinary regen pick*. It fails the bar on power, not just on flavour.

**Fix the heal at 5 HP.** That pays 415–555 HP/run ≈ **1.4–1.85 HP/s**, roughly three regen levels —
but gated on kill rate, so it evaporates exactly when you are overwhelmed and cannot clear. That
gating is what makes it a pivot rather than a stat: sustain becomes something you *earn per second*,
and disengaging to survive stops working.

The cost is real and dual: `run.coinsEarned` is **both** the end-of-run meta payout **and** the
in-run reroll wallet (main.js:203-205). At `rerollCost` 10 × 1.5^n the ladder is 10/15/23/34/51/76/
114/171/256/385, so 593 coins buys ~8 rerolls and 332 buys ~6. **Avarice trades level-up agency for
survivability** — which is the sharpest thing on the slate, because agency is the exact complaint
the redesign exists to answer.

Open call: whether a coin past `COIN_CAP_PER_RUN` still heals. Recommend **yes** — the cap exists to
bound the meta payout, and proposed already measures 791/999, so late-run runs would otherwise watch
the card silently switch off.

#### Second wave — user rulings (2026-08-08)

| card | ruling |
|---|---|
| **TIME DEBT** | **FINAL — 1.5× clock + 50% XP.** User accepted 1.5× (not 2×), then accepted the +XP compensation once measured. Nothing left open on this card. |
| **OVERLOAD** | **ACCEPTED at 2× fire rate** (not 3× — *"otherwise life would drain instantly"*) **plus +50% damage.** |
| **EVENT HORIZON** | **CUT.** *"Enemies already swarm towards you, I don't see the point."* Correct, and both halves are redundant, not one: enemies path to the player every frame by default, and dragging pickups in is precisely the `magnet` passive. The card re-skinned two shipped behaviours. |
| **BLOOD PACT** | Kept — *"could be fun, would need balancing."* Rate measured below. |
| **BRITTLE** | **ACCEPTED as written** (maxHP → 1, damage ×4). |
| **BLOOD MONEY** *(new, user)* | *"rerolls cost 10 HP instead of coins."* See pricing below — the idea is the strongest on either wave, the flat-HP number is the one thing that needs changing. |

##### OVERLOAD must cost per SECOND, not per shot (measured)

"Every shot costs 1 HP" is unshippable, and the harness now says so. Weapon fires counted by
rising-edge on `run.weaponTimers` (which covers **every** weapon — only 7 emit a `shoot` event, and
none of the city three do):

| chapter | fires/run | fires/s |
|---|---|---|
| body | 1142.9 | **3.8/s** |
| beyond | 888.4 | **3.0/s** |
| city | 163.4 | **0.5/s** |

**A 7.6× spread.** At 1 HP/shot with fire rate doubled that is 7.6 HP/s in the body and 1.0 HP/s in
the city — the same card is a death sentence in one chapter and free in another. Worse, it
*perversely punishes the fast-firing builds the card exists to enable*, and it is **undefined for
beams and auras**: city's 0.5/s is the rainbow beam registering one "fire" per activation and then
sustaining. A third of the arsenal has no "shot" to charge for.

**Cost per second.** Uniform across builds and chapters, readable on the card, one number to tune.
The harness takes `--overload=N` (N = HP/s), applying 2× `fireRateMul` and 1.5× `damageMul` with it.

**The rate is far lower than it looks.** Body, 2 slots, d1, shop 8/10, 24 runs, `dps`, against a
proposed-pool baseline of 100% win / level 29.8:

| HP/s | drain/run | win rate | median death | level |
|---|---|---|---|---|
| baseline | — | 100% | — | 29.8 |
| **0.5** | 150 HP | **100%** | — | **31.5** |
| **1** | 300 HP | **29.2%** | 235.3s | 24.8 |
| **2** | 600 HP | **0%** | 181.2s | 15.7 |
| **4** | 1200 HP | **0%** | 180.4s | 13.6 |

**There is a cliff between 0.5 and 1, and almost nothing in between.** At 0.5 HP/s the card is a
straight *buff* — level goes **up**, 29.8 → 31.5, because 3× DPS kills faster, drops more gems and
outruns the drain. At 1 HP/s it costs 71 points of win rate.

The arithmetic explains the cliff exactly. The run's total HP budget measures **~233–250** (~110–127
maxHP plus `regen` averaging 0.41/s ≈ 123 HP healed over 300s). 0.5 HP/s spends 150 of it — a
comfortable 60%. 1 HP/s spends 300 — more than everything you have. The card flips from free to
fatal because the drain crosses the budget line, not because of anything subtler.

##### CONFIRMED — 2× fire rate, 2× damage, 0.75 HP/s (user, 2026-08-08)

The user raised the damage clause from +50% to **double** and took 0.75 HP/s. Re-measured at those
numbers (same rig), against the proposed-pool baseline of 100% win / level 29.8 / weaponLvSum 10.5:

| | baseline | **OVERLOAD final** |
|---|---|---|
| win rate | 100% | **75.0%** |
| deaths | 0/24 | **6/24** |
| median death | — | **270.9s** |
| level reached | 29.8 | **30.8** |
| weaponLvSum | 10.5 | 10.6 |

**Well-tuned, and the shape is right.** It costs 25 points of win rate; it pays slightly *more*
levels (4× DPS clears faster and drops more gems); and **every death lands in the final minute**
(median 270.9s of a 300s run). The doomsday-clock property flagged below is real but arrives as a
last-minute crescendo rather than a mid-run collapse — which is exactly the fantasy. No further
change; the hand-play check below still applies, but the bot no longer says the card is broken.

Conclusions from the rate sweep that produced it:

1. **0.75 HP/s** (225 HP, sitting right on the budget line) is the only rate that is neither free nor
   fatal — confirmed above.
2. **The cliff is the design, not a defect.** Landing the cost at the budget line makes survival
   depend on sustain investment, which is exactly what a build-conditional card should do — and it
   gets there without a hard gate. It does mean the card is near-binary: a regen build lives, a
   glass build dies.
3. **A flat HP/s is still a doomsday clock** — constant while your survivability grows. If the
   binary feel plays badly, the fix is to scale the cost with `dmgScale` so it ramps with the run
   rather than dominating the opening.

**Read the lethality as an upper bound.** The kite-and-collect bot is *"a FLOOR on player skill, not
a model of one"* — it does not convert Overload's 3× DPS into fewer enemies touching it, which is
exactly how a real player pays for the drain. This is the card where bot-vs-player divergence is
widest, so **0.75 must be confirmed by hand-play before shipping.** Do not set it from the bot alone.

##### TIME DEBT at 1.5× costs LEVELS, not survival — so it needs an upside

Emulated by advancing `run.time` past real time after each step (`--timescale=1.5`), which is exactly
the card: the clock runs 1.5× while weapons, movement and regen stay on the real one. Body, 2 slots,
d1, shop 8/10, 24 runs, `dps`, proposed-vs-proposed:

| | baseline | +TIME DEBT 1.5× |
|---|---|---|
| win rate | 100% | **100%** |
| level reached | 29.8 | **21.3** |
| weaponLvSum | 10.5 | **7.9** |

**Survival is untouched; progression falls 28%.** The mechanism is not difficulty — it is collection
time. The same total enemies spawn (the spawn integral is over `run.time`, which is unchanged), but
they arrive in 200 real seconds instead of 300, and **gem pickup is rate-limited by walking, not by
spawning.** You out-run your own ability to collect what you killed.

Two consequences:

1. **The card as stated is pure downside.** Density ×1.5 and an early endgame are the *feel*, but
   nothing pays for a third of your levels. A pivot needs a reward, and "the run is shorter" is only
   a reward for meta-farming (same kills and coins per run, in ⅔ the wall-clock — coins per real
   minute up 50%).
2. The obvious fix is **+50% XP**, and it works. Measured (`--timescale=1.5 --xpmul=1.5`):

| | baseline | 1.5× clock | 1.5× clock **+50% XP** |
|---|---|---|---|
| win rate | 100% | 100% | 100% |
| level reached | 29.8 | 21.3 | **27.7** |
| weaponLvSum | 10.5 | 7.9 | **9.1** |

**+50% XP recovers the loss to −7% of levels**, down from −28%. It does not recover it fully —
compensation cannot be exact, because the shortfall is walking time, not XP — and that ~7% residual
is a fair price. **SHIP TIME DEBT AS 1.5× CLOCK + 50% XP.** That makes it roughly power-neutral,
which promotes it from a trade to a true **pivot**: the same run, compressed to 200 seconds at 1.5×
density. The intensity *is* the product.

**Caveat on this run:** both arms sit at 100% win at d1 body with shop 8/10, so **win rate is
saturated and blind here** — level reached is the only live signal. A harder config is needed before
claiming Time Debt costs no survival in general.

##### BLOOD PACT — SETTLED at +0.1%/kill and +1%/elite (user, 2026-08-08)

+1% per kill was the first draft and it ends the run at ×6.7 (body) to ×19.9 (city) — past "absurd"
and into "the last two minutes have no threat left", which the rarity licence does not cover (it
permits runs that *explode*, not runs that go inert). The user set **+0.1% per kill plus +1% per
elite kill**. Measured denominators:

| chapter | kills/run | elites/run | from kills | from elites | **end state** |
|---|---|---|---|---|---|
| body | 569.9 | 10.6 | +57.0% | +10.6% | **×1.68** |
| city | 1901.7 | 8.6 | +190.2% | +8.6% | **×2.99** |
| beyond | 1678.6 | 9.5 | +167.9% | +9.5% | **×2.77** |

**×1.7–3.0 is a good end state** — strong, memorable, still leaves the last minute threatening.

**The finding worth acting on: elite count is chapter-INVARIANT.** 8.6–10.6 across three chapters
whose *total* kill counts differ by 3.3×, because `eliteEvery` is a **time** cadence, not a kill
cadence. That makes the two clauses do opposite jobs:

- the **per-kill** clause is the chapter lottery (+57% to +190%, a 3.3× spread);
- the **per-elite** clause is the chapter-fair one (+8.6% to +10.6%, near-uniform).

At the chosen rates the fair clause contributes only **4–6% of the total bonus** — "+1% per elite"
is very nearly decorative. If elites are meant to be *felt*, raise that clause to ~5% (+43–53%,
uniform) and cut per-kill toward +0.02%; the card then rewards hunting elites and stops varying 3×
by chapter. **Flagged, not changed — the shipped numbers are the user's +0.1% / +1%.**

##### BLOOD MONEY — SETTLED at flat 10 HP (user overruled the maxHP proposal, 2026-08-08)

**The user is right and the objection below was overstated.** It priced rerolls against a budget of
"maxHP + regen", using `regen` **averaged across runs** (0.41/s in the body sample). That average
hides a bimodal reality: *regen is not picked in most runs at all*. With no regen the budget is just
maxHP (~110–127) — about 11 rerolls, not 23 — and the user's design argument follows from exactly
that:

> *"regen is not in every run, sometimes you don't pick regen. picking this will force you to pick
> regen, which in turn will give you less upgrades for damage, so good trade i think."*

That is the card working as intended: it does not merely *spend* HP, it **re-prices the passive
pool**, turning a defensive pick into the enabler of an offensive strategy. Opportunity cost in
level-up picks is a better cost than a flat resource drain, and it is paid in the currency the whole
redesign is about — what you choose on the level-up screen.

**FINAL: rerolls cost 10 HP, flat, replacing the coin cost.** Keep in mind at implementation:

- **Floor it** — block the reroll below 10 HP rather than allowing a death on a modal screen.
- **The ceiling is real and intended.** A dedicated max-`regen` build (2.5 HP/s = 750 HP/run) can
  reroll essentially every screen. That is a legitimate build bought with 5 passive picks, not an
  exploit — but it should be a known consequence, not a discovery.
- Anti-synergies stay legible: BRITTLE (maxHP 1) disables rerolls entirely, BLOOD PACT (no healing)
  makes every reroll permanent.

<details><summary>Superseded proposal — charge 10 maxHP (kept for the reasoning)</summary>

The idea targets the exact complaint that started this redesign (*"not enough agency… frustrating to
aim for some mod and not see any"*), and it is the only card that converts survivability directly
into agency. But **flat 10 current-HP does not bind.** Measured body run: ~111–127 maxHP plus
`regen` averaging 0.41/s ≈ 123 HP healed across 300s — a budget of 230+ HP, or **23 rerolls**,
against only ~28–37 level-up screens in the whole run. That is unlimited rerolls, which destroys the
scarcity that makes a reroll a decision.

**Charge 10 maxHP, permanently.** Keeps the user's number and the readability, and:

- **Self-limiting without a cap** — you start at ~110–127 maxHP, so the run affords ~5–8 rerolls
  before the cost becomes suicidal. No regen exploit, because regen cannot restore a ceiling.
- **Escalating in real terms** — each reroll makes the next hit relatively worse.
- **Revives a dead passive.** `maxHP` (Extra Squish / Big Mochi) becomes reroll fuel, which is a
  genuine build decision where today it is the boring pick.
- Anti-synergises sharply with BRITTLE (maxHP 1 = no rerolls at all) and with BLOOD PACT (no
  healing, so every reroll is permanent) — both good, both legible before you take the card.

</details>

#### Third wave — user rulings (2026-08-08)

Requested as *"design some more unique mods… thinking of isaac item combos, warframe abilities,
hades boons, or other arpg/survivor/roguelite games."* Eight proposed, six survive.

**Two died before they were written down**, killed by reading `config.js` rather than by argument —
worth recording as the pattern, not the instances:

- **Second Wind** (revive on death) — `SHOP.revive` already ships it: 150 coins, `REVIVE_HP_FRAC`
  0.5, `REVIVE_SHOVE_RADIUS` 300.
- **Thorns** (retaliate on being hit) — `WEAPON_MODS.quillBurst.retaliate` already is exactly that.

**Cut by the user:**

- **NATIVE** (the chapter's signature hazard changes sides — 6 faces, absorbing Deadfall as its
  undergrowth face): *"not interesting enough we already have cars, lawnmowers etc."* The hazards
  already exist as spectacle; reversing their polarity adds a rule, not an experience.
- **HARVEST** (uncollected gems detonate instead of paying XP): *"no, not fun."*
- **SYNCHRONY** (all weapons discharge together on a 3s beat) — replaced by the Soy Milk / Ipecac
  pair below, which is the same "restructure the shot" idea with a live decision in it.

**STILLNESS** — accepted as proposed. Damage ramps (~×3 over 2s) while you give no movement input,
decaying instantly on moving. Inverts the one rule the genre teaches for 300 seconds.

> **Key it off INPUT, not velocity.** Pond's currents shove the player (`currentForceMul`), so a
> velocity test would hard-counter the card in exactly one chapter and nowhere else.

Best pairing on the board is **MINIMES**: decoys buy you the standing time. Neither card mentions
the other, which is the good kind of synergy.

**MARTYR** — accepted (*"sounds fun with crazy combos"*). Every point of HP you lose detonates for
N× that around you, from any source. This is the connective tissue for the four HP-trade cards
already final: **OVERLOAD**'s 0.75 HP/s becomes a permanent damage aura, **BERSERK** already wants
you hit, **BLOOD MONEY** turns a reroll into a bomb. It does *not* break **BRITTLE** — at 1 maxHP the
detonation is worth ~4 damage, so the obvious degenerate pair is self-limiting.

**Open number:** needs **hits taken per run** measured before N is written. Not per-kill — kills
swing 3.3× across chapters (see the cadence rule).

**CHAOS PACT** — accepted, restructured by the user from a one-shot into a **repeating 60s cycle**:
the first 15s of each minute run +50% enemy spawns, then from 16s you hold +50% damage. Numbers
explicitly deferred: *"number will be toyed with by playing."*

Recorded so the playtest starts from the right suspicion: **the cycle is 25% danger and 75% payoff**,
and spawn rate is the gentlest of the danger knobs — a kiting player outruns density, where enemy
damage or HP would actually bite. As written this reads closer to a near-permanent +50% damage with
a siren than to a pact. If it plays as a gift, raise the danger window (spawn ×2, or lend it
`enemyDmgMul`) before shortening the payoff — the long payoff is what makes the rhythm legible.

Interacts with **TIME DEBT**: the cycle keys off `run.time`, which Time Debt inflates 1.5×, so the
beats arrive half again as often in real seconds. Intended, and worth a line of card text.

**CONSCRIPTION** — accepted (*"fun, but a lot of balance to do"*), with the user's own simplification:
conscripts inherit **50% of your damage, 100% of your fire rate and crit**. Cleanest reading is that
a conscripted elite mirrors your weapon loadout at half damage — a second you, briefly — which is
also how **MINIMES** was specced (scaling off player stats, not off a weapon), so the two share a
concept rather than a system.

Elites are the **chapter-fair** denominator: over full 300s runs they land 8.6–10.6 per run across
chapters (1.2× spread) against kills' 3.3× and fires' 7.6×. (Under the survival probe elite counts
track alive time instead — 5.0 to 8.6 here — so quote the invariance for full runs only.)

**Open:** stacking. Elites die in clusters, so 2–3 concurrent conscripts is reachable. Left uncapped
pending playtest, consistent with rarity licensing extremity. Combos into **UNSTABLE CORES** — your
ally detonates when the loan expires, a third behaviour neither card describes.

#### BLIND FAITH — measured, and it is the strongest card on the slate

User ruling: *"ahhhh that's fun! let's say you can't roll normal or rare anymore, but all picks are
hidden (just the border visible, and the ones you don't chose are revealed somehow to make you
frustrated)."*

An early objection of mine was **wrong and is withdrawn**: I claimed a hidden border would convey no
information once the bottom tiers were banned. There are five tiers, not four. Banning normal and
rare leaves `epic 12 / legendary 6 / mythic 3` → **57% / 29% / 14%**, so the border still varies and
a mythic border stays a genuine event.

**The arithmetic first.** Average `RARITIES.mult` per roll is `Σ(weight × mult) / Σweight`:

| | normal | rare | epic | legendary | mythic | **avg mult** |
|---|---|---|---|---|---|---|
| shipped weights | 100 × 1.0 | 50 × 1.6 | 12 × 2.5 | 6 × 4.0 | 3 × 6.5 | **1.48** |
| epic floor | — | — | 12 × 2.5 | 6 × 4.0 | 3 × 6.5 | **3.50** |

So Blind Faith is **×2.36 on the magnitude of every stat pick** for the whole run (and ×1.88 on tier
mods, `WEAPON_MOD_TIER_BONUS` going 1.14 → 2.14). Permanently. For free.

**Measured** (`--rarityfloor=epic`, new flag; body/2 d3 shop 8, 40 runs, proposed pipeline in every
arm, kite-and-collect bot — a floor on player skill, not a model of one):

| arm | policy | level | mean alive | kills | maxHP from picks |
|---|---|---|---|---|---|
| baseline — picks well, normal rarities | dps | 19.6 | 263.6s | 922 | 6.1 |
| picks blind, normal rarities | random | 15.9 | 241.1s | 668 | 29.7 |
| **BLIND FAITH** — picks blind, epic floor | random | **24.2** | **289.6s** | **1221** | **105.0** |

Decomposed: **picking blind costs −27.5% kills; the rarity floor pays +83%.** Net, Blind Faith beats
*skilled picking* by **+32% kills and +26s alive while choosing at random.** The information you give
up is worth about a third of what the floor hands back.

**And that understates it.** The probe's `random` policy ignores the border — but the card explicitly
shows it, so a real player picks the mythic over the epic every time. The measured +32% is a **floor**
on the card's strength, not an estimate of it.

**This is the one card on the slate that is pure upside.** Overload buys 2×/2× for 17pts of win rate;
Blind Faith buys ×2.36 on everything for an emotion. It also sits oddly against the slate's own bar —
*a jackpot means no cost, not no decision* — because blind picking removes decisions rather than
adding them. The frustration reveal is a real design goal (it is Isaac's Curse of the Blind, and it
works), but frustration is a feeling, not a price.

**Cost options, recommended first:**

1. **Drop to 2 card slots while blind.** Fits the fiction exactly — you cannot shop around in the
   dark — and it cuts the residual choice value the border still gives. Measurable today (`slots` is
   already a probe positional).
2. **No rerolls at all.** Interacts hard with **BLOOD MONEY** and **SPECIALIST**, both of which exist
   to buy information back.
3. **Accept it** as the deliberate top of the power curve, and rely on rarity to gate it.

#### SOY MILK / IPECAC — the paper multipliers are not the real ones

User ruling, replacing Synchrony: *"why not the soy milk and the ipecac from isaac… x5 fire rate
and / or projectile, but -80% damage. good for element infusions. then the opposite: halves the fire
rate / projectile, but triples the damage."*

Both ride `player.fireRateMul` / `player.damageMul` — the knobs Overload already uses. Unlike
Overload's cost, a **multiplier carries no cadence hazard**: it scales a 0.5/s beam and a 3.8/s
shotgun alike, which is exactly why per-shot Overload had to be rewritten and these do not.

Measured (same rig and caveats as above; `--fire` / `--dmg`, new flags):

| arm | paper dps | fires/s | level | mean alive | kills | **measured vs baseline** |
|---|---|---|---|---|---|---|
| baseline | 1.00× | 3.1 | 19.6 | 263.6s | 922 | — |
| **SOY MILK** ×5 fire / ×0.2 dmg | 1.00× | 15.5 | 20.1 | 270.6s | 964 | **+4.6%** |
| **IPECAC** ×0.5 fire / ×3 dmg | **1.50×** | 1.6 | 20.1 | 264.0s | 932 | **+1.1%** |

- **Soy Milk ships as written.** Paper-neutral, measures neutral (+4.6%, near the noise floor), and
  its stated upside — element procs are counted **per hit**, not per damage — is not even captured
  here, since the probe does not read proc counts. The card is a genuine build-direction pivot that
  costs nothing to balance.
- **Ipecac's ×3 is not enough.** A paper **+50%** dps arrives as **+1.1%** — the entire multiplier is
  eaten by **overkill waste**: tripling per-hit damage against enemies that were already dying pays
  nothing, and halving the fire rate pays the cost in full. To feel like the trade the user described,
  the damage multiplier needs to go up (×4–5 is the range to sweep), or the card needs to convert its
  surplus into something overkill cannot waste — pierce, or splash.

This is the **measure-the-denominator rule** paying out again: both cards were "obviously" a
dps-neutral trade and a +50% trade. Neither was.

#### IPECAC, revised — ×3 COUNT instead of ×3 damage (user, 2026-08-08)

> *"instead of 3x damage, can we do 3x projectiles, or beam arms, or 3 claws in different directions
> around you, etc?"*

**The instinct is right and it targets the measured failure.** ×3 damage died to overkill waste —
surplus damage poured into an enemy that was already dying. Three projectiles in *different
directions* cannot overkill the same enemy, so the surplus lands on targets that were not already
dead. It is also the better fantasy: `rainbow.prismatic` already spreads beams at 180°/120°, which is
exactly the "beam arms" picture.

**Measured** (`--spread=N`, new flag: grants +N to each owned weapon's count mod as it is acquired;
body/2 d3 shop 8, 40 runs, dps picks, proposed pipeline, kite-and-collect bot):

| arm | kills | vs baseline | mean alive |
|---|---|---|---|
| baseline | 922 | — | 263.6s |
| ½ fire, ×3 damage | 932 | +1.1% | 264.0s |
| **½ fire, +2 count** | 645 | **−30%** | 237.6s |
| ½ fire, +4 count | 990 | +7.4% | 270.6s |
| ½ fire, +6 count | 1071 | +16% | 277.4s |
| +2 count, **full** fire | 1217 | **+32%** | 291.3s |

Two things fall out, and the second is the one that matters.

**1. "+2 things" is worth ×1.35, not ×3.** A halved fire rate needs roughly **+4** to break even.
Priced at "+2 per cast" the card is a −30% trap. The count grant on its own, with no fire penalty, is
already a strong card at +32%.

**2. Count is NOT COMMENSURABLE ACROSS WEAPONS — this is the per-shot-Overload error again.**
`+N` means something different for every weapon, which is why +2 bought ×1.35 rather than ×3:

- `star.multishot` +2 on a 1-projectile volley genuinely is ×3.
- `wave.echo` +2 adds echoes that land at `WAVE_ECHO_DMG_FRAC` — a *fraction* of damage, not a copy.
- `orbit.extraOrb` +2 adds to a **persistent ring** that never "fires" at all, so halving fire rate
  and adding orbs are not even acting on the same quantity.

**And four weapons have no count axis whatsoever.** Most do — `multishot`, `extraOrb`, `echo`,
`extraRang`, `minefield`, `extraWisp`, `singularity`, `prismatic`, `twinBloom`, `twinLure`,
`doubleSlash`, `moreQuills`, `echoShriek`, `moreTrash`, `moreGeysers`, `moreDebris`, `moreShards` —
but **`roar`, `tailSwipe`, `flagella` and `tesseractBeam` have none**, and for a 360° roar or a tail
sweep "three of them in different directions" is not a weak effect, it is an undefined one. Exactly
the position a beam was in when Overload was priced per shot.

> **A measurement that was thrown away, recorded so it is not re-run:** a beyond/4 arm read +2.1% and
> looked like proof of a chapter lottery. It was an artifact — beyond's weapons are `realityShard`,
> `hole`, `tesseractBeam` and the probe's `COUNT_MOD` table covered only `hole`, so two of three
> weapons received no grant. **Check that an emulation actually reaches the subject before reading
> its number.** The body figures above are valid: all four of its weapons are covered.

**Recommendation — author the count PER WEAPON, and do not price it against fire rate globally.**

A generic `+N` cannot produce the thing the user actually asked for; "3 claws in different
directions" is an authored shape, not a counter bump. Each weapon needs its own reading of "three of
it" (roar → three staggered pulses; tailSwipe → a three-hit sweep), or it declines the card. That is
the same resolution the chapter-signature idea wanted and did not get, and here it is load-bearing
rather than decorative.

Open: whether the fire-rate halving survives at all. On the body numbers the count grant alone is
+32%, so there is a real card here with no downside clause — but that would make it a second BLIND
FAITH (pure upside), which the slate already has one too many of.

> **Clutter watch.** `REBOUND_MAX_PICKS`' note records live quill counts going 11 → 47 and being
> "the one making the screen unreadable" on a 390×844 phone. A global count multiplier across four
> equipped weapons is that failure mode by design — whatever number ships needs a look on a phone,
> not just a kill count.

#### IPECAC — the per-weapon table (user: *"Alright, per weapon it is"*, 2026-08-08)

**One claim from the previous round is withdrawn.** I wrote that `roar`, `tailSwipe`, `flagella` and
`tesseractBeam` have no meaningful reading. Missing a count *mod* is not the same as the effect being
undefined, and three of those four are among the **easiest** rows in the table: roar is *"a sonic
**cone** in front of you"*, flagella *"lashes a melee **arc**"*, tesseractBeam *"sweeps the
**crease**"* — a cone, an arc and a line all split into three directions cleanly. What actually
resists the split is not melee, it is **radial symmetry**.

**The rule the table follows:** the ×3 must be a *genuine* 3× of output, landing in **different
space or on different targets**. That is the whole reason this version beats ×3 damage — overkill
eats surplus poured into one dying enemy, and cannot touch surplus that went somewhere else. Any row
that resolves to "the same hit, bigger" has failed and should be re-authored.

Three classes, by how a weapon can be made to spread:

**A. DIRECTIONAL — 3 at spread angles, or 3 different targets.** The fantasy lands hardest here.

| weapon | what it is | ×3 reads as |
|---|---|---|
| `star` | flings antigens at nearest | 3-antigen fan (`multishot`) |
| `boomerang` | leaf out and back | **3 blades at 120°** |
| `stinger` | tight cone of needles | 3 cones at the 3 nearest foes |
| `homing` | seeker that hunts | 3 seekers, **each locking a different target** |
| `realityShard` | splinters that skip | 3 shards fanned (`moreShards`) |
| `debrisToss` | hurls a chunk | 3 chunks, 3 landing spots (`moreDebris`) |
| `flagella` | melee arc at nearest | **3 lashes at 120°** |
| `clawRake` | fast arc at nearest | **3 rakes at 120°** (`doubleSlash` is 2) |
| `roar` | sonic cone in front | **3 cones — front, left, right** |
| `tesseractBeam` | folds and sweeps a crease | **3 creases at different angles** |
| `rainbow` | sweeping ray | **3 beam arms at 120°** (`prismatic`) |

> `homing`'s "different target" clause is the load-bearing one in the whole table. Three seekers that
> all lock the nearest enemy is a ×3 that overkill eats whole — i.e. it silently becomes the ×3
> damage card that already measured as a wash.

**B. PLACED — 3 at different positions.** Spread comes from where they land, not which way they face.

| weapon | ×3 reads as |
|---|---|
| `mines` | 3 cysts scattered (`minefield`) |
| `bloom` | 3 smaller clouds at 3 spots (`twinBloom` is 2) |
| `lure` | 3 decoys at 3 spots (`twinLure`) — splits the crowd three ways |
| `hole` | 3 smaller vortexes (`singularity`) |
| `sewerGeyser` | 3 geysers under 3 different foes (`moreGeysers`) |
| `trashTornado` | 3 separate tornadoes, not one denser one |

**C. RADIAL — already 360°, so angle cannot spread them.** These are the genuinely hard rows, and
the ones to watch: their honest reading is **density or staggered timing**, which is weaker and
clutters more.

| weapon | ×3 reads as | risk |
|---|---|---|
| `wave` | **3 full-damage rings at different radii** — NOT `echo`, whose rings land at `WAVE_ECHO_DMG_FRAC` | the fractional-echo trap that made +2 worth ×1.35 |
| `quillBurst` | 3× quills in the ring (`moreQuills`) | **the documented clutter case** — 11 → 47 quills |
| `chitterShriek` | 3 shrieks at expanding radii | reads as one thicker scream |
| `tailSwipe` | a 3-hit sweep combo | timing, not space — overkill can reach it |
| `orbit` | 3× phages on the ring | persistent, so "half fire rate" is halving a *tick*, not a cast |

**Cost: the halved fire rate survives, and should stay.** It was only ever in doubt because the
measured +2 grant was worth ×1.35 instead of ×3. Authored properly every row above is a true ×3 of
output, so the paper trade returns to ×1.5 — and unlike the damage version, spread output is the kind
overkill cannot reclaim. The bracket already measured says parity sits near +4 and +6 buys +16%, so a
true ×3 across a loadout should land meaningfully positive without another downside clause. That also
keeps it from becoming a second pure-upside card next to BLIND FAITH.

**This is where the harness stops.** `--spread=N` grants the *existing* count mods, whose semantics
are exactly what this table replaces — so it can bracket the authored card but cannot represent it.
No further number should be quoted for Ipecac until the per-weapon shapes are implemented; the next
honest measurement is a post-implementation one. Labelling that limit rather than reporting a
convenient proxy is the point.

#### Second wave — as first proposed (2026-08-08)

Requested after the first slate settled: *"then propose 5 new fun crazy cards."* Authored under the
rarity-licenses-extremity rule, so several are run-enders by design. **Each one is crazy along a
different axis** — the failure mode to avoid is five cards that are all "big number, big drawback".

| card | axis | effect | what it changes about playing |
|---|---|---|---|
| **TIME DEBT** | the clock | Run time advances at **2×** | Victory in ~150 real seconds — but `hpScale`, `dmgScale`, spawn rate and the elite cadence all read `run.time`, so late-game pressure arrives at double speed too. A short run, front-loaded. Slow builds stop being viable. |
| **OVERLOAD** | the resource | **3× fire rate**; every shot costs **1 HP** | **HP becomes ammo.** Regen, armor and heals all convert into damage. Composes viciously with Berserk and Avarice. |
| **EVENT HORIZON** | space | Enemies and pickups are dragged toward you continuously | Inverts the kiting game the whole title is built on. The swarm never strings out, so AoE gets enormous value and any gap in your damage kills you. |
| **BLOOD PACT** | the economy | **Cannot heal, ever.** Every kill: **+1% damage, permanent, uncapped** | A snowball with no ceiling and no safety net. Dead early or absurd late. The card most dependent on the rarity licence, and memorable *because* it can end the run. |
| **BRITTLE** | glass | maxHP → **1**; damage **×4** | The pure run-ender the "rare enough" rule exists to permit. |

Coherence checks done at authoring time (the failure mode that killed half the first list was naming
systems that do not exist):

- **OVERLOAD's self-damage works as written.** `hurtPlayer(run, dmg, dot = true)` (sim.js:1819)
  skips the `invulnTime` window, skips `HURT_CAP_FRAC`, **and skips armor subtraction** — so the cost
  cannot be turtled away, which is what makes it a real resource. Note it *is* suppressed by
  `run.rampageT > 0` (RAMPAGE = INVULNERABLE, the one guard covering every damage path), so rampage
  becomes a free-fire window. That is a good emergent beat, not a bug.
- **BRITTLE does NOT accidentally grant immortality.** The concern was `HURT_CAP_FRAC` 0.5 flooring a
  hit to zero at maxHP 1. It does not: `Math.round(1 * 0.5)` is **1** in JS (half rounds up), and the
  non-dot branch is `Math.min(1, Math.max(1, …))` = 1. One hit, one death — as intended, no bypass
  needed.
- **EVENT HORIZON is new, not a re-skin.** The beyond's gravity wells bend **projectiles** only
  (config.js:4211), and `pullBeam` drags the **player** (config.js:4197). Dragging *enemies* toward
  the player exists nowhere and is the inverse of the UFO beam.
- **BLOOD PACT has three heal sites to suppress**, not one: sim.js:230 (level-up bonus), 241 (pickup
  +30), 312 (`passives.regen`). There is no `healPlayer` funnel — unlike damage, which has exactly
  one. Worth adding the funnel if this ships.
- **TIME DEBT** touches only `run.time`'s advance, and every consumer already derives from it
  (`hpScale`, `dmgScale` = `1 + t/RUN_DURATION`, `spawnRate`, `eliteEvery`, victory at
  `RUN_DURATION` 300).

Strongest two if the list must be cut: **OVERLOAD** (spending health as ammo re-prices every
defensive card you own) and **BLOOD PACT** (uncapped stacking is the only thing here that reaches a
genuinely absurd end state).

#### Specialist is a targeting tool, not a deliverability fix (measured)

Seeded A/B, city, 40 runs, `dps` policy, focus ×2.5 gated at 4 mod picks. Proposed-vs-proposed:

| | Δ vs no-Specialist |
|---|---|
| focused weapon (`rainbow.*`) | **+1.7 pts** |
| other weapons | **−6.5 pts** (worst `heavyTrash` −17.5, `rapidGeyser` −15) |
| MEAN | 60.3% → **57.2%** |

**Focus redistributes deliverability, it does not create it.** The gain is small because the harness
auto-assigns focus to the *first* weapon reaching the gate — the starter, already at 82–97% and with
no headroom — while stripping the starved weapons that were the actual problem.

That argues for **player-chosen** focus (one card instance per qualifying weapon) rather than
auto-assignment: point it at the geyser you are building, not the rainbow you are not. Naming a
weapon is worth ~5–17 points on its mods, taken from the others. Ship it for agency; do not sell it
as the deliverability fix.

**METHODOLOGY — this A/B was run twice.** The first attempt was unseeded and worthless: the
`current` column, which both arms share and which `--specialist` cannot touch, swung **6.1 pts**
between invocations — larger than the 4 pt effect being measured. Per-run seeding now applies in
**every** mode (it was `--survival` only), and the control columns are byte-identical across
invocations. **The noise floor at 40 runs is ~6 pts on the mean and worse per mod: no deliverability
claim under ~10 pts is meaningful without seeding.**

#### Trigger-site audit — COMPLETE (2026-08-08)

The kill reasons were written from review notes, not re-checked against code. All twelve are now
verified. **Ten hold, one was outright false, one was wrong about the gate but not the effect** —
so two cards come back.

| Claim | Status | Evidence |
|---|---|---|
| `run.traps` scatters once and dies past the origin | **FALSE — stale** | v6.5 moved traps to `streamTraps` (cell-hash, salts 15–17): permanent streamed field furniture. state.js:875–886. **Trapper is revived.** |
| Riptide cannot gate on `wave` (pond lacks it) | TRUE — **and the card is dead for a second reason** | `CHAPTERS.pond.weapons = ['flagella','mines','bloom']` (config.js:1638). An earlier revision of this row claimed the effect hook was free and the card revivable; that was **wrong** — `MUTATORS.riptide` already ships `currentForceMul: 2`, and the sim.js:1975 comment names that mutator. See the mod-key section above. |
| `run.wells` scatters once and dies past the origin | TRUE, and deliberate | `generateWells` → `scatterField`, within `OBSTACLE_FIELD_RADIUS` of the origin. state.js:405–414, 430–436: *"a signature field is the arena's opening hand, not terrain."* Local Physics stays dead unless that call is reopened. |
| Elementalist re-triggers elemental application | TRUE | sim.js:3276–3277 — DoT ticks use `dealDamage` *specifically* so they don't recursively re-trigger it. The guard is documented by name. |
| Overtuned has no per-pick rarity to promote | TRUE | `mods[choice.id] = (mods[choice.id] ?? 0) + choice.bonus`, sim.js:235 — one accumulated float. |
| Hunger's `collect()` serves gems **and** coins | TRUE | one closure `collect(list, onPickup)` over a shared `pickupSq`, sim.js:5683–5690. Radius 0 ends XP *and* the reroll economy. |
| Slipstream: there is no "caught in a current" state | TRUE | `currentForce` is a sum of four sines over (x, y, t), nonzero wherever the signature is `currents`. sim.js:1966–1976. |
| Counter-Scent: nothing follows the player | TRUE | pheromone nodes are dropped by *dying ants* and followed by other ants. sim.js:3227–3229. |
| Flak: `run.bombs` is shared | TRUE | four producers — blank boss trail (738), artillery (1299, 2969), volatile elite (3214). Gating it neuters all of them. |
| Sonic Boom: no input sequences roar/tailSwipe | TRUE | both are **weapons** stepped in the auto-fire loop (sim.js:3640–3641). |
| Debris Field: `run.debris` is rewritten every frame | TRUE | `run.debris = []` each frame, *"exactly like run.orbs"*. sim.js:3617, 5199–5211. |
| Pack Leader needs allied units | TRUE | no `run.allies`, no allied/friendly entity anywhere in sim.js or state.js. |

**Net: Trapper and Riptide return to the card list.** The rest stay dead as written — but note the
pattern in *why*: most died because the card named a system that exists under a different shape
(shared bomb list, per-frame array, auto-fire weapon), not because the fantasy was wrong. Re-author
the fantasy against the real hook rather than discarding the card.

Dead as written, with reasons worth keeping:

| Card | Why |
|---|---|
| Riptide | Gated on `wave`, which pond doesn't have (`['flagella','mines','bloom']`) |
| Elementalist | Routing all damage through `applyElements` re-applies ignite from ignite ticks. Measured: DoT ticks 2,015 → 143,619, combo cascade depth 0 → 176, 4× frame cost. sim.js:1662 documents the guard by name |
| Overtuned | `applyChoice` stores `mods[id] += bonus` as one accumulated float — **per-pick rarity is never retained**, so there is no tier to promote. Redefine as a flat read-time multiplier |
| Hunger | `collect()` is one closure serving gems **and** coins off the same `pickupSq`; radius 0 requires exact float equality, so nothing is ever collected again — it ends XP *and* the reroll economy |
| Monoculture | "Exactly 1 weapon" is unenforceable with no skip, and `NEW_WEAPON_MIN_RATE` force-injects weapons |
| Hollow | Measured level 34.9 → 25.8 (−27% picks): trap at 4 slots (−13%), break-even at 2. Also `run.choiceSlots` is unclamped in sim while `ui.js` maps only Digit1–4 and `.lv-cards` has no `overflow-y`. Devalues 60 sacrificed shop levels |
| Trapper, Local Physics | `run.traps`/`run.wells` scatter once at `createRun` inside 900px and never stream — dead past ~60s. `GRAVITY_FORCE = 900 px/s²` with no body clamp also flings the player off the map |
| Slipstream | `currentForce` is a sum of sines, nonzero across **92%** of the world — there is no "caught in a current" state, so it degrades to a global damage aura and enemies die before reaching you |
| Counter-Scent | Pheromones are trails dropped by *dying* ants that speed up other ants. Nothing follows the player; there is nothing to decoy |
| Flak | `run.bombs` is shared with volatile-elite and artillery bombs; gating it neuters those too |
| Sonic Boom | roar and tailSwipe auto-fire on independent timers — the player has no input that sequences them |
| Pack Leader | Needs an allied-unit system that does not exist |
| Debris Field | `run.debris` is rewritten every frame; "chunks never expire" fights the architecture |
| Blood Sugar, Glass Eye, Cell Division, Second Wind, Thermal Shock, Thick Skin | Secretly a number, or imperceptible. Second Wind's 1.5s window also exceeds `PLAYER.invulnTime = 0.75`, making it a permanent ≥50% contact-damage cut |

Survives with rework: the six chapter inversions (re-scoped to what each mechanic actually does),
the weapon-pair anomalies (but "own both" is not a decision — six of seven chapters ship exactly 3
weapons against `MAX_WEAPONS = 4`, so the whole pool is owned in 73–99% of runs; gate on **levels or
mod investment** instead), and Glass Anomaly (drop to +45% and apply `maxHPMul` continuously so
later HP picks are halved too — otherwise it is strictly better taken early).

**Also open:**

- **F14 — the mod bucket is 70% stat bumps.** Raising mod share 21% → 30% may just swap one flavour
  of boring for another. Consider splitting `modNew` / `modStack` and weighting first picks up.
- **Duo/Deep gates are statistically unreachable at 2 slots.** A *specific* passive is offered ~1.3
  times per run, so "3 picks of two named passives" is P≈0. Measured: Blood Sugar 1.0%, Thick Skin
  0.7%. Gate at 2+2, or gate on a *category* ("any two defensive passives ≥2").
- ~~The weapon bucket at 22% overflows its ceiling~~ — **resolved** by rolling the bucket before the
  rarity; the weapon bucket now lands at 20.2–21.7% against a declared 22%, and is empty on only
  2.5–9.5% of rolls. What remains is the design question of whether owning all 3 weapons in 73–99%
  of runs is wanted, not a distribution bug.
- **Damage-multiplier asymmetry (pre-existing).** 17 `dealDamage` sites bypass `damageMul`/crit
  entirely versus 17 `applyDamage` sites that don't. "+70% damage" is a true +70% for a star build
  and closer to +30% for a fire/venom or hole build. Any card balanced on a damage percentage is
  affected.

---

## Verification

`node scripts/pool-probe.mjs <chapter> <slots> <runs> [random|defense|dps]` reports level reached,
cards/run, **short pools (must stay 0)**, kind and rarity distribution, and defensive totals/run.

Before/after every distribution change, at minimum: `body 2`, `city 2`, `beyond 4` — **never one
config alone.** Every drift finding in this document was invisible in at least one of the three;
tuning against a single chapter/slot count silently ships a different pool to every other one.

`--compare` prints a **bucket fidelity** block (declared vs achieved share of ordinary cards) and a
**bucket absent** line. Absence is the entire drift budget: a bucket empty on A% of rolls can lose at
most A% of its weight, so drift materially larger than absence is a bug in the roll, not a ceiling.

Targets: all four buckets within ~2pts of declared, defensive share ~18%, short pools 0, anomalies
≤4/run, legendary at or below the shipped baseline (**not** 9–16% — that is the F1 regression).

The probe is immortal and vacuums gems; it measures offer distribution and throughput, never
survival. `npm test` must stay green — `test/sim-test.js` asserts pool length, rarity membership,
and the epic+ rate, all of which this design touches.
