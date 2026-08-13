# Elements redesign — impact, not potency

**Date:** 2026-08-13 · **Revision 2**, after adversarial review (findings and their resolutions in §17).
**Replaces:** `2026-08-07-dot-rework-and-sim-fixes-design.md` (Track A), deleted 2026-08-13 by owner
call. Its element rework was sized against the old ~5.9% element share and is re-derived here; its
two still-live non-element bugs are carried forward in Appendix A.
**Touches:** [Track B — upgrade pool](./2026-08-07-upgrade-pool-design.md)'s `BUCKET_WEIGHTS.element`.
**Verify with:** `npm test`, `node scripts/pool-probe.mjs`, and a new `scripts/element-census.mjs`.

## The problem

**Player feedback, verbatim:** *"when you have the choice between +12% dmg and a vague '+1 potency'
and you don't really know what elements do and how they scale, the choice is clear that you take dmg
and that's it."*

That reading is correct, and it is not only a legibility problem. `PASSIVES.damage` ("Angry Goo",
base 6%) rolls +9.6% at rare and +15% at epic, and it is immediately priceable. An element card is
not — and cannot be made so by copy alone, because **its real value swings ~6× with your fire rate**:

`applyIgnite` sets `igniteDps = IGNITE_DOT_FRAC × potency × dmgDealt / IGNITE_DURATION` and
**replaces** on refresh. So at potency 1:

| weapon | burn as a share of weapon dps |
|---|---|
| one hit per ~3 s (heavy) | **~35%** — crushes +12% damage |
| one hit per 0.5 s (fast) | **~6%** — loses to +12% damage, which *also* scales the ignite |

Nothing on the card tells the player which side they are on.

### The audit behind it

Five findings from the 2026-08-12 element audit, all provable off the formulas:

1. **Cold saturates at potency 6.67.** `min(0.70, 0.30 + 0.06·P)` caps, and the slow is cold
   potency's only consumer. ~4–5 picks saturate it; the pool offers 8. Alignment (×2 potency) is a
   no-op for cold past P = 3.34.
2. **The "elites never freeze" branch out-freezes the freeze.** `min(1, slow × 1.6)` reaches 1.0 at
   P ≥ 5.42 → `slowMul = 0`, a full stop lasting the 2 s chill window with **no immunity after**,
   against the real freeze's `0.9 × k` + 3 s `FREEZE_IMMUNITY`.
3. **Cold is fully dead against `resistsCC`.** The early return precedes `enemy.chill =
   CHILL_DURATION`, so `anchored`/`unshakeable` enemies take no slow *and* carry no chill flag.
4. **Lightning's arc targets read `elementPicks`, its damage reads potency** — so a mythic Lightning
   card arcs to exactly one enemy, same as the cheapest normal one.
5. Shatter's two branches collapse to one condition (cosmetic).

**All five are addressed here** — see §17 for which dissolve and which are fixed explicitly.

## Owner directives

Quoted verbatim from the 2026-08-13 brainstorm, because they are the spec's constraints:

> 1. fire is a DoT for damage. so you can use a slow hard hitting weapon for single target DoT, or a
>    fast / aoe weapon for small DoT to lots of enemies
> 2. cold is about CC. you first slow enemies, if you apply enough slow, you freeze them. […] like in
>    PoE, one you get Frozen, you have a period of "resistance" to cold element. like 75% less
>    efficience for 5s, to prevent chain freeze
> 3. venom / poison is about weakening. […] Each stack increases damage taken by a small amount. […]
>    the enemy become greener the more stack it has
> 4. lightning : this is a about AOE, applying elements or debuffs (bleed etc) to other enemies,
>    along with a small damage hit. having "more" lighting should allow for bigger chance to forward
>    afflictions, a small bump in arc damage, and longer arc / more arcs

> - if a player manages to have a hard hitting AOE weapon at the end of a run or because he was super
>   lucky, then elements should not be "nerfed" because of it. He's been lucky, good for him.
> - elements applying chance should be easier for small enemies, and harder for tough enemies. […]
>   the portion of MaxHP your hit will deal as damage (because thinking about flat damage is complex
>   since everything scale)

> aoe or not aoe should not matter here, pretty much all weapon can become aoe and the balance should
> be in the weapon damage, not inside an element-formula hidden factor

> no more "normal" rarity elements. they all start at rare = 1, epic = 2, legend = 3, mythic = 4.
> i want to reduce how much P the player can get

> we should be careful about our formulas, since sometimes you can't freeze unless you do 100% dmg
> => you kill it instead of freezing it, so it will never freeze

**Revision 2 directive**, on the review's finding that cold freezes enemies that are already dying:

> Accept it — cold is a finisher.

---

## 1. The rule everything hangs off

Every enemy carries one number: **how much of its own health you have taken off in the last three
seconds.**

```js
// in dealDamage, AFTER the shield affix, the venom amp and the rounding —
// so the numerator is HP actually removed, not the pre-adjustment swing.
enemy.recent.add(hpRemoved / enemy.maxHP)
```

*You control an enemy as much as you hurt it.*

The owner listed four candidate normalizers — run timing, player level, enemy max HP, share of max
HP. **The fourth contains the other three**, which is why it is the one that works:

- **Run timing** — `maxHP` already carries `hpScale(t)`.
- **Player level** — your damage grows, so `recent` grows with you.
- **Enemy toughness** — literally the denominator, including `ELITE.hpMul ×5` and every chapter's
  `roster.hpMul`.
- **Difficulty** — via `enemyHpMul`, same denominator.

`hpScale` is **per chapter** (`CHAPTER_LATE_RATE`, config.js:2976): body 0.005 → 7.6× at t=300,
undergrowth 0.020 → 3.8× at t=250, **beyond 0.0605 → 43.7×**. Every sanity figure below names its
chapter and difficulty, because a number quoted without them is meaningless.

### Every element reads that one number

Elements do not *apply* anything. They **read** `recent` at their own multiplier:

```js
slow      = min(1, (recent - coldSpent) × COLD_MUL   × √P_cold)
venomAmp  =         recent              × VENOM_MUL  × √P_venom
```

This is the design's biggest simplification and it falls out of the model rather than being bolted
on. Consequences worth stating:

- **All damage counts** — weapon hits, ignite ticks, arc damage, ally damage, hazards. Not just
  `applyDamage`. That closes the leak the review measured (F8), where fire's burn killed enemies
  without filling any window and *stopped a fire+cold build freezing anything*.
- **`recent` reaching 1.0 is exactly the enemy's death**, because it now counts every source. In
  revision 1 this was an approximation; it is now an identity.
- **One rolling window per enemy, not one per element.** No per-element application hooks.
- **Lightning spreading damage already spreads chill and venom**, because the arc's damage lands in
  the target's own window — normalised against the target's own `maxHP`. No copying, no laundering
  (F1).

### The invariant

> **No element threshold may require `recent` ≥ 1.**

`recent` reaching 1.0 *is* the point the enemy dies. Any threshold set there is unreachable by
construction: you kill it on the hit that would have triggered it. Measured across 6,322 enemy deaths
in two chapters, peak `recent` **never once reached 1.0** (max 0.99) — the invariant is exactly the
right test, and §4 and §5 are both checked against it.

### Damage effects still scale with the hit

Fire's burn and lightning's arc are **damage**, sized by `dmgDealt`, not by `recent`. Only the
*status* half — cold's slow, venom's amp — reads `recent`. The owner's toughness guideline is about
application, not damage: a heavy hit on a tank should still burn hard.

## 2. The curve

```js
value = HEADLINE × Math.sqrt(P)          // P = run.elements[id]
```

Steepest at the first pick, decelerating forever, never flat. On the integer ladder the arithmetic is
something a player can feel without being told: **P=1 → ×1, P=4 → ×2, P=9 → ×3.**

- **Pick 1 is the biggest element card you will ever take** — `√` has its steepest slope at zero.
- **No pick is dead.** The eighth is a small, honest increment, and against a late elite it is the
  difference between freezing and not.
- **Rarity is expressed at full strength**, because there is no flat base term to dilute it.

### Nothing saturates

Today cold saturates because `CHILL_SLOW_CAP` is a hard ceiling with nothing to do with the enemy.
Here every status is `recent × f(P)`, and **`recent` shrinks all run long** as `maxHP` climbs. There
is always a tougher enemy your current multiplier cannot move, so more `P` always buys something.
**Audit finding #1 dissolves, and `MAX_ELEMENT_PICKS` is deleted.**

## 3. 🔥 Fire — a DoT sized by the hit

```js
burnDps = FIRE_SHARE × Math.sqrt(P) × dmgDealt / STATUS_DURATION
// on refresh: keep the stronger burn
if (newDps > enemy.burnDps) { enemy.burnDps = newDps; enemy.burnT = STATUS_DURATION }
```

A heavy weapon gets one deep burn; a fast AoE weapon gets **many shallow ones** — the owner's "small
DoT to lots of enemies". Breadth is the fast weapon's payoff, not depth.

**The 6× fire-rate swing named in the problem statement is preserved for fire, deliberately.** Burn
as a share of weapon dps is `FIRE_SHARE·√P·interval / STATUS_DURATION`: at a 3 s interval `0.35√P`,
at 0.5 s `0.058√P` — the ratio is exactly 6 at every P. This is the owner's call (`max()` on refresh
was chosen over an additive pool with the trade stated), and it is the price of fire's identity:
depth for heavy weapons, breadth for fast ones. **It is the one place the opening complaint is not
fixed**, and the card copy (§9) must therefore not imply a build-independent number.

Fire's burn damage feeds `recent` like every other source, so **fire now helps cold** rather than
starving it.

`P` scales the share and nothing else.

## 4. ❄️ Cold — the finisher

**Identity, revised.** Cold is not "space". Its meter fills with the damage *you* deal, so it locks
down what you are already killing — measured at P=1, 67.6% of freezes land on an enemy with under 2 s
of life left. **Owner call: accept it.** Cold is what finishes what you are hitting, and the card
copy must say so rather than promise protection it cannot deliver.

```js
slow = Math.min(1, Math.max(0, recent - coldSpent) × COLD_MUL × Math.sqrt(P)
                 × (coldResistT > 0 ? FREEZE_RESIST : 1))

slow >= 1  →  frozen for FREEZE_DURATION (2s)
              coldSpent = recent           // consume, do not clear the shared window
              coldResistT = FREEZE_RESIST_T (5s) once the freeze ends

each frame:   coldSpent = Math.min(coldSpent, recent)   // follows the window down
```

**100% slow *is* frozen** — no separate threshold constant, no stack counter.

`coldSpent` rather than a buffer clear, because the window is shared with venom. It is clamped to
`recent` every frame, so it can never exceed it and `slow` can never go negative — which also removes
revision 1's bug where a cleared total went negative and enemies *sprinted* (F14).

At `COLD_MUL = 2`, the freeze lands once `recent` reaches `1/(2√P)`:

| | P=1 (rare) | P=2 | P=4 (mythic) | P=9 |
|---|---|---|---|---|
| health removed in 3 s to freeze | **50%** | 35% | **25%** | 17% |

**Sanity, stated with its chapter.** undergrowth d3 at t=250, `hpScale(250, 0.020) = 3.78`:

| enemy | maxHP | to freeze at P=1 | at P=4 |
|---|---|---|---|
| drone | 113 | 57 dmg in 3 s | 28 |
| tank (`hpMul 1.2`) | 612 | 306 | 153 |
| elite tank | 3,061 | 1,531 | 765 |

**No elite rule** — elites resist because they have 5× the HP. **Audit finding #2 deleted with the
branch that caused it.**

> Revision 1 offered "an early 20 HP drone freezes to one solid hit" as its sanity check. That was
> wrong: a hit big enough to remove half a 20 HP drone's health usually kills it, and `applyDamage`
> skips a dead enemy. The examples above are sized so the freezing damage is survivable.

### `resistsCC`: full slow, no freeze

`anchored` and `unshakeable` take **the slow at full strength and never freeze at all.**

Revision 1 gave them `recent × 0.25`, which the review proved makes the freeze need `recent ≥ 2/√P`
— **≥ 1.0 at every rarity on the ladder**, i.e. exactly the unreachable case §1's invariant forbids;
measured 0 of 558. A flat "cannot be frozen" is honest, legible, gives those enemies a real identity,
respects the invariant, and **needs no constant at all** — `CC_RESIST_IMPACT` is deleted.

Cold is never a blank card against them (they slow normally), so **audit finding #3 is resolved**
rather than relocated.

### CC diminishing returns are dropped from cold

`CC_DR_*` (v7.17) was added for one measured exploit — Quill Burst + Chitter Shriek + Cold ×4 +
**Machine Gun** in undergrowth, holding the crowd at 162 px for **4.0 contact hits per run**.

**Revision 1's argument for dropping it was wrong** and is replaced. It compared new-with-card
against new-without-card; the load-bearing comparison is **old against new**, and `ccScale` carries
*two* multipliers — the per-enemy DR **and** `p.ccMul`, which `SOY_MILK_CC_MUL = 0.45` sets for
Machine Gun (config.js:647, sim.js:350). Taking cold off `ccScale` deletes an explicitly owner-tuned
price as well as the DR. Measured for that exact build:

| | effective cold |
|---|---|
| **today** — P≈5.93, `_ccDR` pinned at floor 0.25, `ccMul` 0.45 → k = 0.1125 | 7.4% slow, 0.10 s freeze |
| **new** — multiplier `2√5.86` = 4.84, freeze at `recent ≥ 0.207` | ~82% of the crowd fully frozen |

**This is a large buff to the exploit build, not a neutral change.** It is retained anyway, because
the owner's directive is explicit that a lucky hard-hitting build must not be taxed, and because
`impact` prices control by *damage* rather than by cadence — which is the correct axis. But it is a
deliberate, quantified risk, and §13's census must re-run that exact build before it ships.

**CC-DR stays on weapon knockback and fear**, which are not damage-scaled and were the larger part of
the lock. Bringing those onto `recent` too would let `CC_DR_*` be deleted outright — a weapons
change, explicitly out of scope.

## 5. ☠️ Venom — pure weakening, no damage

```js
venomAmp = recent × VENOM_MUL × Math.sqrt(P)     // derived, never stored
// in dealDamage: dmg *= (1 + venomAmp)
```

**Venom deals no damage at all** (`VENOM_DOT_PER_STACK` deleted) and has **no stack cap**
(`VENOM_MAX_STACKS` deleted). Per §1's invariant a cap of 8 reached at `recent × 8` would need
`recent = 1` — the full health bar — so it could never be reached. Death is the ceiling.

"Stacks" survive only as a **display** concept: the render tint reads `venomAmp` and the sprite
greens with it, per the owner's directive.

**Measured** (replaying real damage traces through this formula): mean damage-weighted amp is
**+12.5% at P=1** in undergrowth d3 and +10.6% in beyond d5, against `PASSIVES.damage` rare's +9.6%;
P=2 → +17.7%, P=4 → +25.0%. Competitive at every tier, multiplicative with damage passives, and it
amps DoT ticks too, since `dealDamage` is the shared path.

`P` scales the amp; `recent` is the application.

## 6. ⚡ Lightning — reach and forwarding

```js
arcs          = 1 + Math.floor(Math.sqrt(P))
arcRange      = SHOCK_RANGE × (1 + LIGHTNING_RANGE × Math.sqrt(P))
arcDamage     = LIGHTNING_SHARE × Math.sqrt(P) × dmgDealt
forwardChance = Math.min(1, LIGHTNING_FORWARD × Math.sqrt(P))
// per arc target: roll forwardChance -> copy the source's IGNITE and BLEED
```

All four of the owner's asks are implemented — more arcs, longer arcs, a bump in arc damage, a higher
forward chance. Revision 1 had `arcs` as the only `P` term, which left **a 7-point dead zone**
(P=10–15 bought nothing until the next arc) and dropped `potency` from arc damage entirely, quietly
nerfing every multi-pick lightning build (F7). Range and damage now scale continuously between
the arc steps.

**Forwarding copies only the damage-shaped afflictions — ignite and bleed.** Chill and venom are
*not* copied and do not need to be: the arc's damage lands in the target's own `recent`, normalised
against the target's own `maxHP`, so lightning spreads them correctly and automatically. Revision 1
copied chill's magnitude across enemies of different `maxHP`, which let a hit on a 113 HP drone hand
a freeze-worth of chill to a 6,380 HP `anchored` elite (F1). That channel no longer exists.

**Audit finding #4 fixed** — arc count reads `P`, not pick count.

`SHOCK_CD` (per-source-enemy, 0.3 s) is retained: it stops continuous weapons spamming arcs every
tick and is orthogonal to everything here.

## 7. The rolling window

One per enemy. `recent` is a **rolling 3-second sum** of `hpRemoved / maxHP`, each contribution
expiring independently.

**This must be exact, not approximated by a decaying float.** Exponential decay is proportional to
the running total, so a crit's large contribution makes every small contribution alongside it
evaporate faster than its own 3 s while the crit itself lingers past 3 s. Mixed hit sizes — crits,
two weapons of different weight — are exactly where it comes apart, and this game has both.

```js
// per enemy — ONE of these, shared by cold and venom
{ total, buckets: [0,0,0,0,0,0], head }     // 6 buckets x 0.5s = 3s of history

add(x):      buckets[head] += x;  total += x
every 0.5s:  total -= buckets[head];  buckets[head] = 0;  head = (head + 1) % 6
read:        total
```

A plain JS array, not a `Float32Array`: a float32 store against a float64 running total drifts by
~1e-7 per application, so `total` would never return to exactly zero after the last contribution
expired (F14). At six elements a plain array is also faster in V8.

There is **no `clear()`**. Cold consumes with `coldSpent` (§4), which cannot desynchronise the total.

```
// ponytail: expiry is quantised to the 0.5s bucket width, so a contribution lives 2.5-3.0s
// rather than exactly 3.0. Narrow the buckets if that shows in play.
```

Fire does not use it (single dps + timer, strongest wins) and freeze is a plain timer.

**Durations:** `STATUS_DURATION = 3` for the window and fire's burn, replacing today's ignite 3 /
chill 2 / venom 4. Freeze is `FREEZE_DURATION = 2`, plus `FREEZE_RESIST_T = 5`.

**Not a memory concern.** Enemies are not pooled (`run.enemies = run.enemies.filter(...)`,
sim.js:4516), so these are per-spawn allocations: at `MAX_ALIVE = 400` that is 400 small arrays,
~45 KB resident, ~20 allocations/s at t=300.

## 8. Acquisition

### The ladder

Elements roll on their own tier table and **decline `normal`**:

```js
ELEMENTS[id].values = { rare: 1, epic: 2, legendary: 3, mythic: 4 }
```

This replaces `base × RARITIES[rarity].mult` (1.6 / 2.5 / 4.0 / 6.5) and cuts `P` at every tier.

### The element branch must re-roll, or screens truncate

**Two independent knobs, and both are needed:**

1. `BUCKET_WEIGHTS.element` **18 → 7.5** — how often the element bucket wins.
2. The element branch of `rollCard` **re-rolls the tier on its own renormalised table** when the
   slot's rarity is one the element declines.

Revision 1 claimed the bucket cut removed the null path. **It does not** — `rollCard` picks the
bucket (sim.js:7669) and the rarity (sim.js:7693) as *independent* draws, so `normal` still lands on
100/171 = 58.5% of element slots whatever the bucket weight is. The element branch is the one branch
with no fallback:

```js
// sim.js:7789-7790 — today
const eid = elementOpts[Math.floor(Math.random() * elementOpts.length)]
return makeElementCard(run, eid, rarity)
```

`buildLevelUpChoices` does `if (!card) break` (sim.js:7819), and the mod branch's own comment records
the measured consequence: *"40% of such blind screens collapsed to a single card."* Without the
re-roll, 4.4% of slots return null and **16.4% of four-slot screens lose a card** (1 − 0.956⁴).

Follow the passive branch's idiom (sim.js:7719-7739), which re-rolls on the card's own `values` keys
renormalised. That is also what produces §8's stated mix, so the numbers and the code finally agree.

### Resulting mix

Elements appear on ~7.5% of cards instead of 18%; of those, 70.4% rare, 16.9% epic, 8.5% legendary,
4.2% mythic. **Total `P` per run drops 58.8%** — mean `RARITIES.mult` weighted by `RARITY_WEIGHTS` is
1.482, the new mean tier value is 1.465, so `1 − (7.5×1.465)/(18×1.482)`.

The freed ~10.5 weight goes to `defense`/`utility` (19 + 21 → ~50 combined). **Owner directive:**
*"i can make elements rare, if so you can increase the probability of 'base attributes' mods."*

**`MUTATORS.unstable` must be re-priced.** Its `elementWeightMul: 2` (config.js:6450) was set against
a bucket of 18; at 7.5 its absolute effect halves. PB1's assertions still pass either way, so nothing
will catch this automatically.

### No pick cap

`MAX_ELEMENT_PICKS` is deleted; `eligibleElementIds` no longer filters on it. `run.elementPicks`
survives as bookkeeping only — the `Lv N` card tag and the `wildfire`/`alignment` anomaly gates.

> **Consequence to handle:** with `eligibleElementIds` always returning 4, the pool-exhaustion branch
> in `buildLevelUpChoices` (sim.js:7807) becomes unreachable and the "Snack Break" heal card is dead
> code. Either keep a cap purely to preserve that path, or delete the path deliberately.

## 9. Card copy

The word **"potency" never appears in the UI** — not on cards, and **not on the pause build sheet**,
which today prints `fmtNum(el.potency)` next to each element name (ui.js:1934 and :1936, with a
matching `fr.js` entry). Revision 1 fixed the cards and left the exact number the complaint is about
sitting on the screen players check their build on.

Each number is derived at card-build time from **the `P` the player will have after taking the
card** — not from the tier's value alone.

```
Fire Infusion                          [rare]     P 0 -> 1
Your hits set enemies burning for 35% of
their damage over 3s. Best on heavy hits.

Cold Infusion                          [epic]     P 0 -> 2
Damage chills. Take 35% of an enemy's health
within 3s and it freezes for 2s.

Venom Infusion                         [rare]     P 0 -> 1
Damage weakens. A worn-down enemy takes up to
+30% damage from every source. Deals none itself.

Lightning Infusion                     [legendary]  P 0 -> 3
Arcs to 2 enemies for 52% damage, at 126% range.
61% chance to spread burning to each.
```

Checked against §11's constants: fire `0.35 × √1`; cold `1 / (2 × √2)`; venom `0.6 × √1` at half a
health bar; lightning `1 + ⌊√3⌋` arcs, `0.30 × √3` damage, `1 + 0.15 × √3` range, `0.35 × √3`
forwarding.

Fire's line says *"Best on heavy hits"* rather than a build-independent promise, because §3's 6×
swing is real and the card must not hide it.

## 10. The codex — where the rules actually live

**Owner directive:** *"we might need a 'Help' window or a 'Codex' or 'Rules' or something that the
player can dig to understand more deeply the rules / principles of elements."*

A card has room for one sentence. The rules underneath it — that status is bought with damage
relative to the enemy's health, that 100% slow is a freeze, that a frozen enemy resists cold for 5 s,
that elites resist by having more HP rather than by a special case — are the interesting part of the
design and currently have nowhere to be read. Without this screen the redesign fixes *pricing* one
card at a time and still never teaches the system.

### Entry points

Two, both opt-in — a player who does not care never sees it:

- **The pause screen**, next to the build sheet. That is where a player already goes to ask "what is
  my cold actually doing", so the answer belongs one tap away from the question.
- **The title screen**, for reading between runs.

### Structure

Five pages, and no more for now:

1. **How elements work** — the shared rule. Damage taken in the last 3 s, as a share of the enemy's
   own health, is what every element reads. Why a tank resists (5× the HP), why late enemies resist
   (`hpScale`), why a big hit does more than the same damage in ten small ones does not.
2–5. **One page per element** — its job in one line, the exact rule, its numbers *at the player's
   current P*, and what the next pick would change.

### Every number is generated, never written

**This is the load-bearing engineering constraint.** A codex page with `35%` typed into it is wrong
the first time anyone tunes `COLD_MUL`, and nothing will fail — it will simply lie to players, which
is worse than not having the screen. Every figure is derived from `config.js` at render time, from
the same helpers that compose the card descriptions in §9, so the card and the codex cannot disagree.

This repo has been bitten by exactly this class of staleness before: `src/cast/*.png` goes stale
silently, and `STAT_LABEL` omissions drop a stat off the build sheet with no warning. Treat a
hand-typed number in the codex as a bug.

Show both the rule and the player's own position:

```
❄️  COLD — the finisher

Damage chills. When an enemy is fully chilled it freezes.

  Your cold        P 4        slow = 4.0 x recent damage
  To freeze        take 25% of an enemy's health within 3s
  Freeze lasts     2s, then it resists cold for 5s
  Next pick        epic -> P 6, freeze at 20%

Elites and tanks are not immune - they simply have more health,
so the same hit is a smaller share of it. Anchored and unshakeable
enemies slow normally but never freeze.
```

### Implementation notes

- **The number-composing helpers live in `config.js` as pure functions**, not inside `ui.js`. `ui.js`
  only renders what they return. That is what makes the generated figures assertable by
  `test/sim-test.js`, which cannot import `ui.js` — and it is the same source the card descriptions
  in §9 call, so the two surfaces cannot drift apart.
- `ui.js` is Pixi-free by contract, so the rendering half is plain DOM and is testable with the
  throwaway `harness.html` trick (CLAUDE.md, *When there is no MCP browser tab*) — no app boot, no
  WebGL.
- Reuse the element icons the cards already use; do not introduce a second set of art.
- **French copy is drafted and confirmed with the owner, never machine-translated** — and every key
  must be the English source string with no U+00A0 in it (CLAUDE.md's `fr.js` trap; run XX asserts
  it).
- The page list is deliberately elements-only. It may later want weapons or anomalies; do not build
  that structure now.

## 11. Constants

Starting values. The census (§13) is expected to move them; the *shape* is what this spec fixes.

```js
export const STATUS_DURATION   = 3      // rolling window, and fire's burn
export const FIRE_SHARE        = 0.35   // burn as a share of the hit that lit it
export const COLD_MUL          = 2      // slow per unit of recent damage
export const FREEZE_DURATION   = 2
export const FREEZE_RESIST     = 0.25   // cold effectiveness during the resist window
export const FREEZE_RESIST_T   = 5
export const VENOM_MUL         = 0.6    // amp per unit of recent damage
export const LIGHTNING_SHARE   = 0.30   // arc damage as a share of the hit
export const LIGHTNING_RANGE   = 0.15   // arc range bonus per sqrt(P)
export const LIGHTNING_FORWARD = 0.35   // forward chance per sqrt(P), clamped to 1
```

### Net constant count: this is a delete

```
GONE   CHILL_SLOW_BASE  CHILL_SLOW_PER_POTENCY  CHILL_SLOW_CAP
       CHILL_STACK_TO_FREEZE  FREEZE_IMMUNITY  ELITE_FREEZE_SLOW_MUL
       VENOM_MAX_STACKS  VENOM_DOT_PER_STACK  VENOM_AMP_PER_STACK
       IGNITE_DURATION  CHILL_DURATION  VENOM_DURATION
       MAX_ELEMENT_PICKS  CC_DR on cold                              = 14
       COMBOS.shatterMul  .shatterRadius  .overloadRadius
             .acidBurnTickMul  .brittleAmpMul  .comboCd   (§14)      =  6
                                                            total    = 20

NEW    STATUS_DURATION  COLD_MUL  VENOM_MUL  FREEZE_RESIST
       FREEZE_RESIST_T  LIGHTNING_RANGE  LIGHTNING_FORWARD           =  7
```

`IGNITE_DOT_FRAC` → `FIRE_SHARE` and `SHOCK_ARC_FRAC` → `LIGHTNING_SHARE` are renames at unchanged
values. `SHOCK_RANGE` and `SHOCK_CD` keep their values. Revision 1's `CC_RESIST_IMPACT` is gone (§4).

Each element ends up as **one constant × `√P`**, reading one shared number per enemy.

## 12. Run shape and render

**Enemy shape** (the doc block in `state.js` lines ~438-1115 must be updated in the same commit —
CLAUDE.md requires it):

- **Added:** `e.recent` — `{ total, buckets, head }`, the shared window; `e.coldSpent`;
  `e.coldResistT`.
- **Removed:** `e._chillStack`, `e._freezeImmuneT`, `e.venom`, `e.venomT`, `e.chill`, `e.chillSlow`.
  `slow` and `venomAmp` are **derived at read time** and stored nowhere. (Revision 1 contradicted
  itself on this — §5 wrote `venomAmp +=` while §12 called it derived. Derived is correct.)
- `e._ccDR` and friends stay — still used by knockback and fear.

**render.js:**

- `const venom = e.venom || 0` (render.js:12665) drives the tint at :12703 and
  `Math.min(venom, 8)` at :12752 — **a hardcoded second copy of `VENOM_MAX_STACKS`**. Both must move
  to the derived `venomAmp` (range 0…~1.2), and the tint becomes continuous, which it is not today
  (:12703 is a single fixed `0xa8e6a0`).
- The chill visual reads the derived slow rather than a stack count.

**ui.js:** `buildReadout` (sim.js:4441-4443) exports raw `potency`; ui.js:1934/1936 print it. Both
must move to each element's own units (§9).

## 13. Testing

`test/sim-test.js`, same plain-assert style. **Every scenario must be mutation-proved** — assert
effects, not state.

| run | asserts | mutation that must make it fail |
|---|---|---|
| EL.a | the same damage produces ~10× the slow on a 20 HP enemy as on a 200 HP one | drop the `/ maxHP` |
| EL.b | cold at P=1 freezes only after ≥50% of an enemy's health is removed inside the window, and never before | set `COLD_MUL = 1` — nothing ever freezes |
| EL.c | rolling window: adding 0.2/s plateaus at ~0.6 and returns to 0 within 3.5 s of stopping | swap the ring buffer for a decaying float |
| EL.d | a large contribution and a small one expire independently | same swap — the small one dies early |
| EL.e | **a fire+cold build freezes at least as often as cold alone** (the F8 regression) | feed the window from `applyDamage` only |
| EL.f | no element card ever rolls `normal`, and **no level-up screen ever returns fewer cards than requested**, over ≥2000 rolls | remove the element branch's re-roll |
| EL.g | venom removes zero HP on its own | restore the DoT tick |
| EL.h | an **elite** freezes given enough damage | restore the `elite \|\| tank` branch |
| EL.i | `anchored` slows at full strength and never freezes | restore the ×0.25 impact, or the early `return` |
| EL.j | lightning arc damage and range both rise between arc-count steps (P=10 vs P=15) | drop the `√P` from damage and range |
| EL.k | `slow` is never negative and never exceeds 1 after a freeze | remove the `coldSpent` clamp |
| EL.l | the codex's figures come from the same pure helpers as the card descs, and **both move when a constant moves** (change `COLD_MUL` in the fixture, assert the stated freeze threshold changes) | hardcode a number in either surface |

Plus a source-text assertion (the run UG.k trick) that `render.js` reads `venomAmp`, since the tint
has no other guard.

**Existing scenarios that this breaks and must be rebuilt, not just re-tuned:**

- **PB4's exact analytic pin** (test/sim-test.js:2353-2396) asserts
  `|elemNormal − rollNormal(rr)| < 2`. Its comment says element cards are *"the one bucket that
  adopts the rolled rarity with nothing in between … which is what makes the analytic pin exact
  rather than a band"*, and that it is what catches a decay applied to the wrong key, applied twice,
  or not renormalised. After §8 **no bucket adopts the rolled rarity verbatim**, so the instrument
  has to be rebuilt against a different bucket or that guard is lost outright. Do not simply delete
  it.
- The `maxed` anomaly fixture (test/sim-test.js:1846) references `MAX_ELEMENT_PICKS`.

**`scripts/element-census.mjs`** (new): seeded, 300 s, per chapter, across a `P` ladder × weapon
weight × **element pairs** — not one element at a time, per CLAUDE.md's layered-composition rule,
since F8 was precisely a cross-element interaction. Reports effective dps contribution, freeze
uptime, median nearest-enemy distance (the honest control metric), and amp uptime. It must also
re-run the v7.17 exploit build (Quill Burst + Chitter Shriek + Cold ×4 + Machine Gun, undergrowth d3)
**against both the old and the new model**, per §4.

**`scripts/pool-probe.mjs`** must be re-run for the bucket cut and `MUTATORS.unstable`.

## 14. Combos — all six are deleted

**Owner call:** *"also remove all element combo, that's ok for now."* Not parked, not ported —
removed outright, deliberately and visibly, in the same change.

This matters because revision 1 called them "parked" while the code changes would have killed five of
them **silently**: removing `e.venom`, `e.chill`, `e.chillSlow` and `e._chillStack` turns every combo
gate into `undefined > 0` → `false`. No throw, no failing test, four visible mechanics gone with
nobody noticing. Deleting them on purpose is the honest version of what was going to happen anyway.

Two of the six were already redundant under the new model: **Frost Arc** and **Conduct** existed to
spread chill and venom along a lightning arc, and §6 does that automatically now — the arc's damage
lands in the target's own window.

### Removal surface

| where | what |
|---|---|
| config.js | the whole `COMBOS` table — `shatterMul`, `shatterRadius`, `overloadRadius`, `acidBurnTickMul`, `brittleAmpMul`, `comboCd` |
| config.js | the combo hints in each `ELEMENTS[id].desc` (§9's copy replaces them) |
| sim.js | `triggerShatter`, `triggerOverload`, `comboReady`, `triggerCombo`, `e._comboCd` and its per-frame decay in `stepStatuses` |
| sim.js | the Brittle branch in `dealDamage` (:3897-3901), the Shatter block in `applyElements` (:4221-4229), the Frost Arc / Conduct blocks in `applyShock` (:4185-4200), the Acid Burn tick multiplier in `stepStatuses` (:4248) |
| sim.js | the `shatter`, `overload`, `frostarc` and `conduct` event pushes |
| render.js | `case 'shatter'` (:11972), `case 'overload'` (:11986), `case 'frostarc'` (:11999), `case 'conduct'` (:12008), and the `e.src === 'overload'` branch (:11832) |
| main.js | four entries in `SFX_FOR_EVENT` (:361) |

**`shockarc` survives** — it is lightning's own plain arc, not a combo. The arc rig at render.js:6233
and the polyline visual at :11572 stay; only two of their three cases go. `explosionBurst`'s
elemental-recolour path (:11275) loses its only elemental caller and should be checked before it is
removed.

A leftover event type is harmless (nothing handles it, nothing throws), so there is no test to write
here — but leaving render cases for events that can never fire is dead code, and the grep above is
the checklist.

**`alignment` is broken, not parked.** `alignmentMul` is read at four sites this spec rewrites, and
its card says *"All your elements now have ×2 potency."* (config.js:964, fr.js:343). Under `√P` a
doubled `P` multiplies the effect by 1.41, so the card would be lying. Either make it ×4 `P` (a true
doubling of effect) or reword it. It cannot simply be left alone.

## 15. Deleting the old code

**Owner directive:** clean up the old code as part of this change.

Everything this spec replaces is **deleted in the same commit** — not commented out, not left behind
a dead branch, not preserved "in case". No tombstone comments: the code says what it *is*, and what
it used to be lives in git history (repo convention).

This matters more here than in a normal rework, because **the old element code fails silently when
it is only half-removed.** Every combo gate is `x > 0` on a field that becomes `undefined`, which is
`false` — no throw, no failing test (§14). A half-deletion of this system looks exactly like a
working one.

### Manifest

| file | delete |
|---|---|
| `config.js` | the 20 constants in §11's GONE list, including the whole `COMBOS` table; the combo hints in every `ELEMENTS[id].desc` |
| `sim.js` | `applyChill`, `applyVenomStack`, `applyShock`'s combo blocks, `triggerShatter`, `triggerOverload`, `comboReady`, `triggerCombo`; the `elite \|\| tank` freeze branch; the `resistsCC` early return; the `_chillStack` / `_freezeImmuneT` machinery; `elementPicks` as a *magnitude* read in `applyShock`; `MAX_ELEMENT_PICKS`'s filter in `eligibleElementIds`; the `shatter` / `overload` / `frostarc` / `conduct` event pushes; `buildReadout`'s raw `potency` export |
| `state.js` | the removed enemy fields **and their entries in the doc block** (lines ~438-1115) — the block is the authoritative contract, so a stale entry there is a defect |
| `render.js` | `case 'shatter'` / `'overload'` / `'frostarc'` / `'conduct'`; the `e.src === 'overload'` branch; `const venom = e.venom \|\| 0` and the hardcoded `Math.min(venom, 8)` |
| `ui.js` | the `potency` rows on the build sheet (:1934, :1936) and the `potency` desc-composition branch (:1396) |
| `main.js` | the four combo entries in `SFX_FOR_EVENT` (:361) |
| `fr.js` | every key orphaned by the above — the combo hint tails, `'potency'`, and any element desc string that no longer exists |
| `test/sim-test.js` | the `MAX_ELEMENT_PICKS` reference in the `maxed` fixture (:1846); PB4's element pin **rebuilt, not deleted** (§13) |

### Verification, before the commit

These greps must return **zero hits in `src/`**:

```
IGNITE_DOT_FRAC|CHILL_SLOW_|CHILL_STACK_TO_FREEZE|FREEZE_IMMUNITY|ELITE_FREEZE_SLOW_MUL
VENOM_MAX_STACKS|VENOM_DOT_PER_STACK|VENOM_AMP_PER_STACK|MAX_ELEMENT_PICKS|SHOCK_ARC_FRAC|COMBOS
_chillStack|_freezeImmuneT|_comboCd|chillSlow|venomT
'shatter'|'overload'|'frostarc'|'conduct'
```

A name that *survives* with a new body (`applyIgnite`, `applyElements`) must not keep its old
semantics — check the body, not the identifier.

Then the rename check CLAUDE.md prescribes, because **a field name also exists as a quoted string and
an identifier sweep cannot see it** (`run.geysers` survived a sweep inside a test's `LISTS` array),
and because a display-name sweep over-matches user-facing copy:

```
git diff -U0 src/config.js | grep -E "name: '|desc: '"
```

Every user-facing string the change touched, on one screen. Read it.

## 16. Risks

1. **Dropping CC-DR from cold is a measured buff to the v7.17 exploit build**, from a 7.4% effective
   slow to roughly 82% of the crowd frozen (§4). It is retained on the owner's explicit directive
   about lucky builds, but this is the single riskiest change here and the census must re-run that
   build old-vs-new before it ships.
2. **`FREEZE_DURATION = 2` is the number most likely to be wrong.** A full stop is the strongest
   effect in the game. It is defensible because the price rose so much — today's freeze costs 3 hits
   of any size, this one costs half a health bar inside 3 s — but it is the first knob to pull.
3. **Cold as a finisher is an accepted downgrade of its stated job.** It no longer holds back the
   part of the crowd your weapons are not pointed at. The owner accepted this; if it plays badly, the
   fix is not a constant, it is a different application rule for cold.
4. **The bucket cut changes a measured Track B result.** `BUCKET_WEIGHTS.element = 18` came from
   pool-probe data; 7.5 needs the same treatment, including what the extra ~10.5 does to the
   defense/utility mix.
5. **10.8% of enemies die on the first step that damages them** and so never carry any status at
   all. That is inherent to a damage-proportional model and mostly harmless — those are enemies you
   were killing anyway — but it means element uptime figures should always be quoted against enemies
   that survived their first hit.

## 17. Adversarial review — findings and resolutions

Reviewed 2026-08-13 by an adversarial agent that wrote its own seeded headless probes (6,322 enemy
deaths across undergrowth d3 and beyond d5). Line references spot-checked by hand.

| # | severity | finding | resolution |
|---|---|---|---|
| F1 | fatal | Lightning copied a chill magnitude computed against the source's `maxHP` onto a target with a different one — a hit on a 113 HP drone could freeze a 6,380 HP `anchored` elite | **Removed the channel.** Chill and venom are never copied; arc damage feeds the target's own window (§6) |
| F2 | fatal | `resistsCC × 0.25` made the freeze need `recent ≥ 2/√P` — ≥1.0 at every rarity, violating the spec's own invariant. 0 of 558 measured | **Full slow, no freeze** (§4). `CC_RESIST_IMPACT` deleted |
| F3 | fatal | "No null path" was false — bucket weight and rarity roll are independent draws; 16.4% of screens would lose a card | **Element branch re-rolls its tier** (§8) |
| F4 | major | The CC-DR argument compared the wrong pair and missed `SOY_MILK_CC_MUL` | **Argument replaced with the old-vs-new measurement**, and the change reclassified as a deliberate buff (§4, risk 1) |
| F5 | major | Cold freezes enemies already dying — 67.6% of freezes with <2 s of life left | **Owner call: accepted.** Cold's identity rewritten as a finisher (§4, risk 3) |
| F6 | major | Five of six combos die silently on `undefined > 0` | **All six deleted outright** (owner call), with a removal manifest in the combos section and a cleanup rule of its own |
| F7 | major | Lightning had a 7-point dead zone and lost `potency` from arc damage | **Range and damage now scale with `√P`** (§6) |
| F8 | major | Fire's burn killed enemies without filling any window, dropping a fire+cold build below the freeze threshold | **Window fed from `dealDamage`**, so all damage counts (§1). Guarded by EL.e |
| F9 | major | Fire keeps the 6× fire-rate swing the spec opens by calling the problem | **Stated explicitly as an accepted trade** (§3), and the card no longer implies a build-independent number |
| F10 | major | Removing `normal` destroys PB4's exact analytic pin | **§13**, flagged as rebuild-not-retune |
| F11 | major | 10.8% of enemies die on the first damaging hit; §4's drone example was impossible | **Sanity examples resized** (§4), and risk 5 added |
| F12 | minor | `hpScale ≈7.6×` is body's; beyond is 43.7× | **Per-chapter rates cited** (§1); every figure now names its chapter |
| F13 | minor | `impact`'s numerator was pre-shield, pre-amp, pre-round | **Window fed with HP actually removed** (§1) |
| F14 | minor | No `clear()`; clearing `total` would go negative → enemies sprint at 140%. `Float32Array` vs float64 drift | **`coldSpent` instead of a clear; plain JS array** (§4, §7) |
| F15 | minor | Build sheet still printed potency; `alignment` a no-op; §5/§12 contradiction; render's hardcoded 8-cap; `unstable` re-pricing | **§9, §12, §14, §8** |

**Confirmed sound by the review and unchanged:** `recent` as a normalizer (peak never reached 1.0
across 6,322 deaths); `maxHP` set at every spawn site and never mutated mid-life, with splits
correctly re-based; the 58.8% `P` reduction; audit findings #1, #2 and #4 genuinely dissolving; the
ring buffer beating exponential decay; `SHOCK_CD`'s retention; and venom measuring competitive at
every tier.

---

## Appendix A — two live bugs inherited from the deleted Track A spec

**Nothing to do with elements.** Recorded here only because the file that held them was deleted;
verified still live against `src/` on 2026-08-13. Strip this appendix once they ship.

### A1. `hole.hungry` grows without bound

`stepHoles`, sim.js:5385 — no clamp, on a mod that stacks to `MAX_WEAPON_MOD_PICKS = 5`:

```js
if (hungryBonus > 0 && h.spawnRadius) {
  h.radius += hungryBonus * h.spawnRadius * dt
  h.coreRadius = h.radius * HOLE_CORE_FRAC
}
```

Measured in a full 300 s beyond run with all six hole mods maxed: **peak hole radius 39,715 px**
against a `viewRadius` of 600. Enemies spawn at `viewRadius + 60 = 660 px` — inside the vortex — so
peak-alive never exceeds 10 and the run plays itself. Second-order: that hole calls `applyDamage` on
every enemy inside 39,715 px every 0.20 s, and with lightning infused `applyShock` runs an O(n)
neighbour scan per enemy per tick — O(n²) five times a second on a phone.

**Fix.** Clamp against the spawn radius; `2.5` is a starting value, tune against `viewRadius`:

```js
h.radius = Math.min(h.radius + hungryBonus * h.spawnRadius * dt, h.spawnRadius * 2.5)
```

### A4. `pickWeighted({})` throws

sim.js:675 — an empty weights object gives `entries.length === 0`, the loop never runs, and the
fallback dereferences `entries[-1]`:

```js
return entries[entries.length - 1][0]   // TypeError on {}
```

**Fix.** Return `null` for an empty map and make callers handle it, or guard at each call site.
Harder to reach than it looks — `rollCard` guards with `if (Object.keys(buckets).length === 0) return
null` at sim.js:7667 — but the function is called from several places and the guard is not universal.
