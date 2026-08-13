# Elements redesign — impact, not potency

**Date:** 2026-08-13
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

**Four of the five dissolve under this design rather than getting patched.** #5 is parked with combos.

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

---

## 1. The rule everything hangs off

```js
impact = Math.min(1, dmgDealt / enemy.maxHP)
```

*You control an enemy as much as you hurt it.*

The owner listed four candidate normalizers — run timing, player level, enemy max HP, share of max
HP. **The fourth contains the other three**, which is why it is the one that works:

- **Run timing** — `maxHP` already carries `hpScale(t)`, ~7.6× by t=300.
- **Player level** — your damage grows, so `impact` grows with you.
- **Enemy toughness** — literally the denominator, including `ELITE.hpMul ×5` and every chapter's
  `roster.hpMul`.
- **Difficulty** — via `enemyHpMul`, same denominator.

One term, no per-chapter tuning, computed at a call site that already holds both numbers
(`applyElements(run, enemy, dmg)`).

### The damage / status split

- **Damage effects scale with `dmgDealt`** — fire's burn, lightning's arc. A heavy hit on a tank
  should burn hard; that is fire doing its job.
- **Status effects scale with `impact`** — cold's slow, venom's amp, and nothing else.

The owner's toughness guideline is about *application*, not damage. Keeping the split explicit is
what stops fire from becoming useless against tanks.

### The invariant that makes thresholds reachable

> **No element threshold may require cumulative `impact` ≥ 1.**

Cumulative impact reaching 1.0 *is* the point the enemy dies — you deal 100% of its max HP. Any
threshold set there is unreachable by construction: you kill it on the hit that would have triggered
it. This is why cold's multiplier must exceed 1 (see §4) and why venom has no stack cap (§5).

## 2. The curve

```js
value = HEADLINE × Math.sqrt(P)          // P = run.elements[id]
```

Steepest at the first pick, decelerating forever, never flat. On the integer ladder the arithmetic is
something a player can feel without being told: **P=1 → ×1, P=4 → ×2, P=9 → ×3.**

It satisfies all three requirements at once:

- **Pick 1 is the biggest element card you will ever take** — `√` has its steepest slope at zero.
  That is the front-load, with no pick-index bookkeeping.
- **No pick is ever dead.** The eighth pick is a small, honest increment — and against a late elite
  it is the difference between freezing and not.
- **Rarity is expressed at full strength**, because there is no flat base term to dilute it.

### Nothing saturates any more

Today cold saturates because `CHILL_SLOW_CAP` is a hard ceiling with nothing to do with the enemy.
Under this design every status effect is `impact × f(P)`, and **`impact` shrinks all run long** —
`maxHP` grows ~7.6× by t=300 and elites are ×5 on top. There is always a tougher enemy your current
multiplier cannot move, so more `P` always buys something.

Saturation stops being a curve problem. **Audit finding #1 dissolves, and `MAX_ELEMENT_PICKS` is
deleted** — `√` flattens the return by itself.

## 3. 🔥 Fire — a DoT sized by the hit

```js
burnDps = FIRE_SHARE × Math.sqrt(P) × dmgDealt / STATUS_DURATION
// on refresh: keep the stronger burn
if (newDps > enemy.burnDps) { enemy.burnDps = newDps; enemy.burnT = STATUS_DURATION }
```

No `impact` term — fire is a damage effect.

A heavy weapon gets one deep burn; a fast AoE weapon gets **many shallow ones**, which is the owner's
"small DoT to lots of enemies". Breadth is the fast weapon's payoff, not depth.

**Known and accepted:** fire is a weak card for a **fast single-target** build — one small burn,
constantly re-set. Fire is for heavy hits or for hitting many things. This is a deliberate
consequence of `max()` on refresh, chosen with the trade stated.

`P` scales the share and nothing else.

## 4. ❄️ Cold — slow that tips into a freeze

```js
// chill is NOT a stored field — it is chillWin.total, the rolling 3s sum (§7).
apply:  chillWin.add(impact × COLD_MUL × Math.sqrt(P) × (coldResistT > 0 ? FREEZE_RESIST : 1))
read:   slow = Math.min(1, chillWin.total)

chillWin.total >= 1  →  frozen for FREEZE_DURATION (2s)
                        chillWin cleared, coldResistT = FREEZE_RESIST_T (5s)
```

The resist window multiplies **new applications**, not the standing total — so a freeze that has just
ended cannot be re-triggered by the damage that caused the first one.

**100% slow *is* frozen** — there is no separate threshold constant, no stack counter, no
`wasChilling`. The slow meter is the whole mechanic.

`COLD_MUL = 2` means the freeze lands once you have removed **half** an enemy's health inside the
window, which satisfies the §1 invariant with margin:

| | P=1 (rare) | P=2 | P=4 (mythic) | P=9 |
|---|---|---|---|---|
| multiplier | 2.0 | 2.8 | 4.0 | 6.0 |
| **health removed to freeze** | **50%** | 35% | **25%** | 17% |

Sanity at ×2, using real HP values: an early 20 HP drone freezes to one solid hit; a ~700 HP late
tank takes two heavy hits; a ~3400 HP elite tank takes about six. **That scales itself — there is no
elite rule, and audit finding #2 is deleted along with the branch that caused it.**

`COLD_MUL = 1.5` was considered and rejected: it pushes the first pick to 66% of a health bar, which
makes rare cold feel like it does not freeze at all.

### CC diminishing returns are dropped from cold

`CC_DR_*` (v7.17) was added for one measured exploit — Quill Burst + Chitter Shriek + Cold ×4 +
**Machine Gun** in undergrowth, holding the crowd at 162 px for **4.0 contact hits per run**. The
config block records each layer's contribution:

```
quill alone      165.7 hits        cold's share:        122.7 -> 104.3  = 15%
+ shriek         122.7             machine gun's share: 104.3 ->  50.3  = 52%
+ cold x4        104.3
+ MACHINE GUN     50.3
```

The lock was overwhelmingly **fire rate multiplying fear and knockback**; cold was a minor
contributor. And Machine Gun is `×0.2` damage for `×5` rate — **the same dps** — so under `impact`
that build applies *exactly the same cold as before it took the card*. The exploit's engine does not
turn for cold any more.

**CC-DR stays on weapon knockback and fear**, which are not damage-scaled and were 85% of the lock.
Bringing those onto `impact` too would let `CC_DR_*` be deleted outright — that is a weapons change,
not an elements change, and is explicitly out of scope here.

This also serves the owner's directive that a lucky hard-hitting AoE build must not be taxed for
being lucky.

### `anchored` / `unshakeable`

Heavily resistant, **not immune**: `impact × 0.25` for cold. Cold is never a blank card, and freezing
one of these takes a monstrous hit. **Audit finding #3 resolved.**

## 5. ☠️ Venom — pure weakening, no damage

```js
venomAmp += impact × VENOM_MUL × Math.sqrt(P)   // rolling 3s window (§7)
// in dealDamage: dmg *= (1 + enemy.venomAmp)
```

**Venom deals no damage at all.** `VENOM_DOT_PER_STACK` is deleted.

**No stack cap.** Per the §1 invariant, a cap of 8 reached at `impact × 8` would need cumulative
impact 1.0 — a full health bar — so it could never be reached anyway. Death is the ceiling and it is
a real one: total amp cannot exceed `VENOM_MUL × √P`, because that corresponds to removing the whole
health bar inside the window. `VENOM_MAX_STACKS` is deleted.

"Stacks" survive only as a **display** concept — the render tint reads `venomAmp` directly and the
sprite greens with it, per the owner's directive.

`P` scales the amp. Application rate is `impact` alone.

## 6. ⚡ Lightning — reach and forwarding

```js
arcs          = 1 + Math.floor(Math.sqrt(P))
arcDamage     = LIGHTNING_SHARE × dmgDealt
forwardChance = LIGHTNING_FORWARD × Math.sqrt(P)     // clamped to 1
// per arc target: roll forwardChance -> copy EVERY affliction the source carries
```

Forwarding is the headline; damage is the garnish. The transferable set is a **single list** —
`ignite`, `chill`, `venom`, `bleed` — so a weapon debuff added later joins it by being added to one
array rather than by editing `applyShock`.

**Arc count reads `P`, not pick count. Audit finding #4 fixed**, and rarity finally means something on
lightning.

`SHOCK_CD` (per-source-enemy, 0.3 s) is retained — it exists so continuous weapons do not spam arcs
every tick, which is unrelated to any of the above.

## 7. Status storage — the rolling window

Chill and venom are **rolling 3-second sums**: the current value is *everything applied in the last
`STATUS_DURATION` seconds*, each application expiring independently.

**This must be exact, not approximated by a decaying float.** Exponential decay is proportional to
the running total, so a crit's large contribution makes every small stack sitting alongside it
evaporate faster than its own 3 s, while the crit itself lingers past 3 s. Mixed hit sizes — crits,
two weapons of different weight — are exactly where it comes apart, and this game has both.

```js
// per status, per enemy
{ total, buckets: Float32Array(6), head }      // 6 buckets x 0.5s = 3s of history

apply(x):    buckets[head] += x;  total += x
every 0.5s:  total -= buckets[head];  buckets[head] = 0;  head = (head + 1) % 6
read:        total
```

O(1) — the running total means no per-frame summation, only one subtraction when a bucket rotates.

```
// ponytail: expiry is quantised to the 0.5s bucket width, so a stack lives 2.5-3.0s
// rather than exactly 3.0. Narrow the buckets if that shows in play.
```

Fire does **not** need this (single dps + timer, strongest wins) and freeze is a plain timer.

**Durations, one number for all four:** `STATUS_DURATION = 3` (fire burn, chill window, venom window)
— replacing today's four separate numbers (ignite 3, chill 2, freeze 0.9, venom 4). Freeze is the one
exception at `FREEZE_DURATION = 2`, plus the `FREEZE_RESIST_T = 5` resistance window.

## 8. Acquisition

### The ladder

Elements roll on their own tier table and **decline `normal`**:

```js
ELEMENTS[id].values = { rare: 1, epic: 2, legendary: 3, mythic: 4 }
```

This replaces `base × RARITIES[rarity].mult` (1.6 / 2.5 / 4.0 / 6.5) and cuts `P` at every tier. It
uses the existing `values` idiom — `makePassiveCard` already returns `null` for a tier outside a
card's own table (`armor`, `regen`), and `firstTier` already walks the ladder for the dev menu.

### Frequency

Two explicit knobs rather than one implicit interaction:

- `BUCKET_WEIGHTS.element` **18 → ~7.5** — the frequency knob.
- The freed ~10.5 goes to `defense` / `utility` (19 + 21 → ~50 combined). **Owner directive:** *"i can
  make elements rare, if so you can increase the probability of 'base attributes' mods."*
- Elements roll on their own rarity table with `normal` removed and the rest renormalised — the tier
  mix knob.

`rollCard` picks the bucket first (sim.js ~line 68 of the function) and rolls rarity second, so
without the bucket cut a declining element would return `null` on 58.5% of element slots. Splitting
the knobs avoids that entirely — no null path, and both numbers are readable in config.js.

Resulting mix: elements appear on ~7.5% of cards instead of 18%; of the ones seen, ~70% rare, ~17%
epic, ~9% legendary, ~4% mythic. **Total `P` per run drops ~58%**, which is the reduction the owner
asked for.

### No pick cap

`MAX_ELEMENT_PICKS` is deleted. `√` flattens the return and the rising enemy HP keeps every pick
meaningful, so the cap has no job left. `eligibleElementIds` no longer filters on it.

`run.elementPicks` survives as bookkeeping only — the `Lv N` card tag, and the `wildfire` / `alignment`
anomaly gates. It is no longer read as a magnitude anywhere.

## 9. Card copy

The word **"potency" never appears on a card**. Each element states its actual effect in its own
units — which is the original complaint fixed at its root.

```
Fire Infusion                                   [rare]
Hits burn for 35% of their damage over 3s.

Cold Infusion                                   [epic]
Hits slow enemies by as much as they hurt them.
Take 35% of an enemy's health to freeze it.

Venom Infusion                                  [rare]
Hits weaken. A weakened enemy takes up to +30%
damage from every source. Deals no damage itself.

Lightning Infusion                              [legendary]
Arcs to 2 nearby enemies for 30% damage.
61% chance to spread your afflictions to each.
```

Every number above is derived from the constants in §10 at the stated rarity, and each was checked
against its own formula: fire `0.35 × √1`; cold `1 / (2 × √2)`; venom `0.6 × √1` at half a health
bar; lightning `1 + ⌊√3⌋` arcs and `0.35 × √3` forward chance.

Each number is derived from current `P` at card-build time, so the card always states what the player
will actually get.

## 10. Constants

Starting values. A census pass (§12) is expected to move them; the *shape* is what this spec fixes.

```js
export const STATUS_DURATION   = 3      // fire burn, chill window, venom window
export const FIRE_SHARE        = 0.35   // burn as a share of the hit that lit it
export const COLD_MUL          = 2      // slow gained per unit of impact
export const FREEZE_DURATION   = 2
export const FREEZE_RESIST     = 0.25   // cold effectiveness after a freeze
export const FREEZE_RESIST_T   = 5
export const VENOM_MUL         = 0.6    // amp gained per unit of impact
export const LIGHTNING_SHARE   = 0.30   // arc damage as a share of the hit
export const LIGHTNING_FORWARD = 0.35   // forward chance per sqrt(P), clamped to 1
export const CC_RESIST_IMPACT  = 0.25   // impact mul for anchored / unshakeable
```

### Net constant count: this is a delete

```
GONE   CHILL_SLOW_BASE  CHILL_SLOW_PER_POTENCY  CHILL_SLOW_CAP
       CHILL_STACK_TO_FREEZE  FREEZE_IMMUNITY  ELITE_FREEZE_SLOW_MUL
       VENOM_MAX_STACKS  VENOM_DOT_PER_STACK  VENOM_AMP_PER_STACK
       IGNITE_DURATION  CHILL_DURATION  VENOM_DURATION
       MAX_ELEMENT_PICKS  CC_DR on cold                              = 14

NEW    STATUS_DURATION  COLD_MUL  VENOM_MUL
       FREEZE_RESIST  FREEZE_RESIST_T  LIGHTNING_FORWARD
       CC_RESIST_IMPACT                                              =  7
```

Two are renames rather than additions: `IGNITE_DOT_FRAC` → `FIRE_SHARE` and `SHOCK_ARC_FRAC` →
`LIGHTNING_SHARE`, both keeping their values. `SHOCK_RANGE` and `SHOCK_CD` are unchanged.

Each element ends up as **one constant × `√P`**, times `impact` for the status half.

## 11. Run shape and render

**`run` / enemy shape** (the doc block in `state.js` lines 438–1115 must be updated in the same
commit — CLAUDE.md requires it):

- **Added:** `e.chillWin` and `e.venomWin`, each `{ total, buckets, head }`; `e.venomAmp` (derived,
  = `venomWin.total`); `e._coldResistT`.
- **Removed:** `e._chillStack`, `e._freezeImmuneT`, `e.venom` (integer stacks), `e.venomT`,
  `e.chill` / `e.chillSlow` as independent fields (now derived from `chillWin`).
- `e._ccDR` and friends stay — still used by knockback and fear.

**render.js:**

- Venom tint scales continuously with `venomAmp` (the owner's "becomes greener the more stacks").
- The freeze/chill visual reads the derived slow rather than a stack count.
- `frostarc` / `conduct` events are combo-owned and unchanged here (parked, §13).

## 12. Testing

`test/sim-test.js`, same plain-assert style. **Every scenario must be mutation-proved** — assert
effects, not state (a test that a timer moved passes with the feature deleted).

| run | asserts | mutation that must make it fail |
|---|---|---|
| EL.a | the same hit produces ~10× the chill on a 20 HP enemy as on a 200 HP one | drop the `/ maxHP` — assert becomes equal |
| EL.b | cold at P=1 freezes only after ≥50% of an enemy's health is removed inside the window, and never before | set `COLD_MUL = 1` — nothing ever freezes |
| EL.c | rolling window: applying 2/s plateaus at ~6 and reaches 0 within 3.5 s of stopping | swap the ring buffer for a decaying float — the plateau and the clean zero both break |
| EL.d | a big application and a small one expire independently (the crit case in §7) | same swap — the small one dies early |
| EL.e | no element card ever rolls `normal`, over ≥2000 rolls | add `normal: 1` to `values` |
| EL.f | venom removes zero HP on its own; only weapon hits reduce `hp` | restore the DoT tick |
| EL.g | an **elite** freezes given enough impact | restore the `elite \|\| tank` branch |
| EL.h | `anchored` takes ×0.25 chill, not zero | restore the early `return` |
| EL.i | lightning arc count rises with a single high-rarity pick | read `elementPicks` again |

Also: a source-text assertion (the run UG.k trick) that `render.js` reads `venomAmp`, since the tint
has no other guard.

**`scripts/element-census.mjs`** (new): seeded, 300 s, per chapter, across a `P` ladder × weapon
weight. Reports, per element: effective dps contribution, freeze uptime, median nearest-enemy
distance (the honest control metric — damage taken conflates "nothing reached me" with "I killed it
first"), and amp uptime. Sets `VENOM_MUL`, `LIGHTNING_FORWARD`, and confirms or moves `COLD_MUL` and
the 2 s freeze.

**`scripts/pool-probe.mjs`** must be re-run: the bucket cut (18 → 7.5) moves a Track B number that
was measured, not guessed.

## 13. Parked

- **The six combos** — shatter, overload, frost arc, conduct, acid burn, brittle. All of them read
  the statuses this spec rewrites, so they get a follow-up section once the four elements land.
  Owner call: *"we can ignore element combination for now."*
- **`alignment` (anomaly, ×2 potency)** needs re-derivation: under `√P`, doubling `P` multiplies the
  *effect* by 1.41, so a card promising "×2" would be lying. Recommendation: make it ×4 `P` so the
  effect genuinely doubles, or reword. Decide with the combos.
- **Bringing weapon knockback and fear onto `impact`**, which would let `CC_DR_*` be deleted
  outright. A weapons change; out of scope.

## 14. Risks

1. **The 2 s freeze is the number most likely to be wrong.** A full stop is the strongest effect in
   the game. It is defensible because the price rose so much — today's freeze costs 3 hits of any
   size, this one costs half a health bar inside 3 s — but it is the first knob to pull if the crowd
   feels over-controlled.
2. **Dropping CC-DR from cold could partially restore the v7.17 lock.** The measurement says cold was
   15% of it and Machine Gun is dps-neutral under `impact`, so this should be safe — but the census
   must re-run that exact build (Quill Burst + Chitter Shriek + Cold ×4 + Machine Gun, undergrowth
   d3) and report contact hits and median nearest-enemy distance before the change ships.
3. **The bucket cut changes a measured Track B result.** `BUCKET_WEIGHTS.element = 18` was set from
   pool-probe data; 7.5 needs the same treatment, including what the extra ~10.5 does to the
   defense/utility mix.
4. **The rolling window adds per-enemy state** on a phone-targeted PWA. Two `Float32Array(6)` plus
   two ints per enemy at a few hundred enemies is small, and the running total keeps it O(1), but it
   should be watched in a real 300 s run rather than assumed.

---

## Appendix A — two live bugs inherited from the deleted Track A spec

**Nothing to do with elements.** They are recorded here only because the file that held them was
deleted; verified still live against `src/` on 2026-08-13. Strip this appendix once they ship.

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

sim.js — an empty weights object gives `entries.length === 0`, the loop never runs, and the fallback
dereferences `entries[-1]`:

```js
return entries[entries.length - 1][0]   // TypeError on {}
```

**Fix.** Return `null` for an empty map and make every caller handle it, or guard at each call site.
Reachable whenever a bucket map ends up empty — which the element-bucket change in §8 makes *less*
likely, not more, but does not remove.
