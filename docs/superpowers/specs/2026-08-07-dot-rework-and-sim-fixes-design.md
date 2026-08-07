# Track A — DoT rework + five independent sim fixes

**Status:** designed, not implemented. Ready to pick up standalone.
**Depends on:** nothing. Ships before and independently of
[Track B, the upgrade-pool redesign](./2026-08-07-upgrade-pool-design.md).
**Verify with:** `npm test`, and `node scripts/pool-probe.mjs <chapter> <slots> <runs> [policy]`.

Every finding below was surfaced by adversarial review during the upgrade-pool
brainstorm (2026-08-07) and then verified by hand against the code. None of it
requires the pool redesign — these are live defects and a self-contained element
rework. Line numbers are hints; find by function name.

---

## Part 1 — Five bugs

### A1. `hole.hungry` grows without bound

`stepHoles`, sim.js ~2739:

```js
if (hungryBonus > 0 && h.spawnRadius) {
  h.radius += hungryBonus * h.spawnRadius * dt
  h.coreRadius = h.radius * HOLE_CORE_FRAC
}
```

No clamp, on a mod that stacks to `MAX_WEAPON_MOD_PICKS = 5`. With `E[rarityMult] = 1.482`
a maxed `hungry` is ~2.96, and `spawnRadius` is itself already inflated by `biggerHole`.
Measured in a full 300s beyond run with all six hole mods maxed: **peak hole radius 39,715px**
against a `viewRadius` of 600. Enemies spawn at `viewRadius + 60 = 660px` — inside the vortex —
so peak-alive never exceeds 10 and the run plays itself.

Second-order: that hole calls `applyDamage` on every enemy inside 39,715px every 0.20s. With
lightning infused, `applyShock` runs an O(n) neighbour scan per enemy per tick — O(n²) five
times a second on a phone-targeted PWA.

**Fix.** Clamp against the spawn radius:

```js
h.radius = Math.min(h.radius + hungryBonus * h.spawnRadius * dt, h.spawnRadius * 2.5)
```

`2.5` is a starting value — it should be large enough that `hungry` still feels like growth and
small enough that the hole never swallows the spawn ring. Tune against `viewRadius`.

### A2. Enemy contact damage never scales

`spawnEnemy`, sim.js:332:

```js
const dmg = base.dmg * (isElite ? ELITE.dmgMul : 1) * run.mods.enemyDmgMul
```

No `hpScale`, no time term — while the line directly above it applies `hpScale(run.time)` to HP
(**7.6× over a run**) and `speedCreepMul` to speed. Contact damage is a flat 5/8/15 for the full
300 seconds.

And `run.mods.enemyDmgMul` has **zero producers**: it appears only in `MOD_KEYS` (config.js) and at
this one read site. No mutator sets it, so no difficulty level touches contact damage either.

The consequence is that `armor` is a **threshold stat, not a linear one**. `hurtPlayer` subtracts
armor flat with a floor of 1, so once armor approaches the flat contact damage, every hit in the
game is floored to 1. Measured damage taken across a full run, starter weapon only:

| | armor 0 | armor 7.4 | armor 16.3 | armor 34 |
|---|---|---|---|---|
| body | 1599 | 249 | 194 | 145 |
| city | 2076 | 515 | 316 | 253 |
| undergrowth | 2815 | 871 | 426 | 284 |

Armor 7.4 is what five picks already delivers today. At armor 34 the damage number equals the hit
count — every hit is 1. A probe run survived difficulty 5 with four mutators on a level-1 starter
weapon and no offensive picks at all, on armor+regen alone.

**Fix — pick at least one, this is a balance decision not a mechanical one:**

- (a) Scale contact damage with time the way HP does: `base.dmg * (1 + run.time / 240)`.
- (b) Make armor percentage mitigation, or flat-with-a-cap: `min(rawDmg * 0.75, armor)`.
- (c) At minimum, wire `enemyDmgMul` into a mutator so *something* can move it.

**This blocks any balance work on defensive passives.** Track B's defensive-weighting change was
sized against today's numbers; if contact damage starts scaling, re-measure before applying it.

### A3. `applyIgnite` overwrites strong ignites with weak ones

sim.js ~1675:

```js
function applyIgnite(enemy, potency, dmgDealt) {
  enemy.ignite = IGNITE_DURATION
  enemy.igniteDps = (IGNITE_DOT_FRAC * potency * dmgDealt) / IGNITE_DURATION  // unconditional
}
```

A 200-damage star hit sets `igniteDps ≈ 172`. An orbit tick for 5 damage, 0.1s later, **overwrites
it to 4.3**. Every continuous-tick weapon in the game — orbit, rainbow, flagella, bloom — is a fire
extinguisher for the player's own build, and fire gets *worse* the more weapons you own. This is
invisible: nothing in the UI shows ignite DPS.

The config comment documents "reapplying refreshes (replaces) duration + DPS" as intentional, but
the downward case is almost certainly not.

Path of Exile solved this: ignite doesn't stack, **only the highest-damage ignite deals damage**,
all applied ignites remain for their full duration, and the next-highest takes over when the
biggest expires.

**Fix.** Take the 95% version — PoE's queue needs a per-enemy pending-ignite array, which is real
GC pressure with 400 enemies alive:

```js
// ponytail: highest-ignite-wins, but a weaker ignite is dropped rather than queued behind the
// strong one (PoE keeps both and promotes on expiry). Upgrade to a per-enemy ignite list if
// multi-weapon fire builds ever want the queued tail.
const dps = (IGNITE_DOT_FRAC * potency * dmgDealt) / IGNITE_DURATION
if (dps >= (enemy.igniteDps || 0)) { enemy.igniteDps = dps; enemy.ignite = IGNITE_DURATION }
else enemy.ignite = Math.max(enemy.ignite, /* keep the stronger burn alive */ enemy.ignite)
```

Simplest correct form: only refresh duration when the new DPS wins, so a weak hit can neither
lower the DPS nor extend a burn it didn't earn.

### A4. `pickWeighted({})` throws

sim.js ~247:

```js
function pickWeighted(weights) {
  const entries = Object.entries(weights)
  ...
  return entries[entries.length - 1][0]   // entries[-1] is undefined when empty
}
```

Not reachable today (all current call sites pass non-empty tables), but it is one line and it is
called from inside `app.ticker` — an uncaught TypeError there means `stepSim` throws every frame,
phase never leaves `playing`, and the run is unrecoverable with no error surfaced. Track B's
"drop empty buckets and renormalize" hands it `{}` directly.

**Fix.** `if (entries.length === 0) return null`, and make callers handle null.

### A5. Cold picks 4 and 5 are worth exactly zero

config.js ~1052 and `applyChill`, sim.js ~1683:

```js
CHILL_SLOW_BASE = 0.30, CHILL_SLOW_PER_POTENCY = 0.06, CHILL_SLOW_CAP = 0.70
slow = min(CHILL_SLOW_CAP, CHILL_SLOW_BASE + CHILL_SLOW_PER_POTENCY * potency)
```

The cap is reached at potency **6.67**. `MAX_ELEMENT_PICKS = 5` at `E[rarityMult] = 1.482` averages
potency **7.4**. So the last one-to-two cold picks buy nothing, and `CHILL_STACK_TO_FREEZE` is a
fixed 3, so they don't buy freezes either. Lightning is currently the only element with a discrete
per-pick step (`maxTargets = run.elementPicks.lightning`).

**Fix.** Folded into Part 2 below — give cold a threshold at pick 3.

---

## Part 2 — DoT rework

### The finding

Each element already scales off a **different** thing. That is good design; it just isn't written
down anywhere, and one of the four is broken.

| Element | Formula | Actually scales with | Precedent |
|---|---|---|---|
| **fire** | `0.35 × pot × dmgDealt / 3` per sec, refresh-replaces | **your damage** | PoE ignite, Warframe slash |
| **venom** | `1.5 × pot × stacks` per sec, stacks to 8 | **nothing** — flat | *broken* |
| **lightning** | `0.30 × pot × dmgDealt` → N targets, 0.3s CD | **enemy count** | — |
| **cold** | no DoT; slow capped at 0.70 | **time denial** | — |

Fire wants big slow hits. Venom wants fast small hits (it stacks per hit). Lightning wants crowds.
Cold is control. Four distinct build identities — and the card text says nothing about any of it,
carrying only combo hints.

### The break: venom does not scale with the run

`stepStatuses`: `perSecond = VENOM_DOT_PER_STACK * potVenom * e.venom`. No `dmgDealt` term, no
player damage multipliers. At five picks and eight stacks that is **88.8 flat DPS, forever**, while
enemy HP scales **7.6×** across a run. Venom is dominant at t=0 and noise at t=300 — a trap pick in
a 300-second game, and it is the only element disconnected from every multiplier the player owns.

(Correction to an earlier claim made during review: fire and lightning **do** inherit crit, because
`applyDamage` computes the post-crit `dmg` and passes it into `applyElements`. The DoT *tick* does
not re-roll crit, which matches Warframe and is correct. Venom alone is disconnected.)

Meanwhile venom's *amp* — the interesting half — is `VENOM_AMP_PER_STACK = 0.02`, so +16% at eight
stacks, +32% on chilled foes via `brittleAmpMul`. The fantasy is "venom makes everything else hurt
more" and the number is 16%.

### The fix: give venom the Risk of Rain 2 burn model

RoR2's burn deals **5% of maximum health per second** — it scales off the *target*, not the
attacker. That is structurally immune to `hpScale`: a %maxHP DoT keeps exact pace with enemy HP
growth by construction, with no tuning and no drift.

```js
// Venom DoT is a fraction of the TARGET's max HP per second, per stack — so it never falls off
// as hpScale climbs (cf. RoR2 burn). Element picks raise the stack CAP rather than the per-tick
// number, which keeps venom's "rewards fast weapons" identity: fast hitters reach the cap.
export const VENOM_HP_FRAC_PER_STACK = 0.005   // 8 stacks = 4%/s ≈ 16% of max HP per window
export const venomMaxStacks = (potency) => 4 + Math.round(potency)
```

`0.005` is a guess; measure it. **Decide deliberately:** %maxHP makes venom the elite-killer, since
`ELITE.hpMul = 5` means elites take five times more absolute damage from it. That is a clean role
("venom melts the big things") but it wants either a cap or an explicit "yes, that's the point."

### The rest of the rework

- **Cold** gets a discrete step so its ladder stops dead-ending: at 3 picks, freeze at 2 chill
  stacks instead of `CHILL_STACK_TO_FREEZE = 3`. Fixes A5.
- **Fire** gets A3's `Math.max`.
- **Lightning** is fine as-is — it already has a per-pick discrete step.
- **Card text** states the scaling law. This is the cheapest "aha" in the whole project: the
  identities already exist in the code, and the player is told none of them.

```
fire      Ignites for a share of the hit that lit it. Bigger hits, bigger burns.
venom     Stacks. Eats a share of the target's own health — the bigger they are, the more it takes.
lightning Arcs to one more enemy per pick. Wants a crowd.
cold      Slows, then freezes. Buys time, not damage.
```

Keep the existing combo hints appended — they're good.

---

## Verification

1. `npm test` — must stay green. `test/sim-test.js` has assertions touching rarity distribution
   and mod tiers; A1–A5 shouldn't trip them, but the venom change may need a scenario update.
2. `node scripts/pool-probe.mjs body 2 40` — `short pools` must stay `0/N`.
3. For A1: a scenario that maxes `hole.hungry` and asserts `h.radius <= h.spawnRadius * 2.5`.
4. For A3: apply a big ignite then a small one, assert `igniteDps` did not drop.
5. For venom: run the probe before/after and confirm late-run kill rate didn't collapse or spike.
   The probe is immortal, so it measures throughput, not survival — do not read survival numbers
   off it.

## Not in scope

Bucket weights, anomaly cards, rarity-table changes, passive rebalance. All of that is Track B.
The one coupling: **A2 must be resolved before Track B's defensive-weighting numbers are trusted**,
because those were sized against today's non-scaling contact damage.
