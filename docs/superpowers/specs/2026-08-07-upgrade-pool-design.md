# Track B — Upgrade pool redesign

**Status: ACTIVE — this is the track to finalise first.** Design revised twice under adversarial
review and validated in the harness; distribution is now **within ~2pts of declared on all three
reference configs**. Two things block the card list: the **net power buff** (one design call, below)
and the **card list itself** — see [Open work](#open-work).
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

Recommendation: **(2), offset**, and prefer `xpForLevel` over enemy HP. +70% enemy HP makes
everything spongier and attacks the symptom; a steeper XP curve attacks the cause (the compounding
faster-clears → more-levels loop) and leaves time-to-kill feel intact. Enemy HP was used in the
sweep only because `xpForLevel` is a module-level import the harness cannot shim.

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
