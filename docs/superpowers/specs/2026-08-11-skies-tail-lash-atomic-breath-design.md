# Skies weapon rework: Tail Lash + Atomic Breath

**Date:** 2026-08-11
**Owner directive:** "replace tail whip of this chapter with something else, it's not clear, it's not
powerful, and reminds too much of flagella whip" — then, on the replacement: "let's do both 1 and 2.
for the whip, it should not pull tanks since they deal dmg" and "[the breath] should aim for closest
enemy then 'spread' like lighting to other enemies".

## The problem, measured

`scripts/weapon-census.mjs --chapter skies --level 5`, difficulty 3, 240s × 5 seeds:

| skies native | rarity | raw dps | eff dps | waste | kills/min | reach |
|---|---|---|---|---|---|---|
| Roar | **normal** (starter) | 151 | 138 | 9% | 85.2 | 200–275 |
| Tail Swipe | **rare** | 137 | 117 | 14% | 75.3 | **150–200** |
| Debris Toss | rare | 272 | 231 | 15% | 115.2 | 340+ |

Three separate defects, all confirmed rather than assumed:

1. **A rare that loses to the free starter.** Tail Swipe is beaten by Roar on effective dps, kills
   per minute AND overkill waste — and Roar is granted at t=0 for nothing. The owner's read ("base
   roar is basically the same weapon but has more upgrade, more fire rate") is exactly right.
2. **The same verb twice in a three-weapon pool.** `flagella`, `clawRake`, `roar` and `tailSwipe`
   are all `inSector` aimed melee arcs with knockback. Skies is the only chapter carrying two of
   them. "Reminds too much of flagella whip" is a structural fact, not a feel.
3. **The shortest reach in the game's most standoff-heavy chapter.** Every skies enemy is designed
   to stay away: the jet banks out to `STRAFE_STANDOFF` 420px, the helicopter holds at its missile
   standoff, tank columns shell from range. Tail Swipe reaches 150–200. `debrisToss` is already
   commented "the skies' designated ANTI-AIR pick" — the pool knew.

`wreckingTail` is **not** broken, which matters because the owner reported it as such. A/B census at
L5 with `--mods wreckingTail=5`: eff dps 117 → 138, kills/min 75.3 → 81.7. It fires correctly. It is
simply too small to perceive — five stacks buy +18% where five stacks of Heavy Tail buy +150% — and
its effect is invisible, because a struck body travels only `knockback / KB_DECAY_RATE` = 220/6 ≈
37px before the 60px collateral disc is tested. Nothing visibly moves, nothing visibly dies.

## Why the pool grows to four

`MAX_WEAPONS = 4` and level-up weapon offers are scoped to `CHAPTERS[id].weapons`. Skies offers
three natives, so **every skies run today ends with a permanently empty fourth weapon slot.**
Replacing one weapon with two fills a slot that is currently dead, rather than diluting anything.

Resulting pool: Roar (normal, starter) · **Tail Lash** (rare) · **Atomic Breath** (epic) ·
Debris Toss (rare) — four distinct verbs: close chip, reach-and-yank, formation clear, ranged burst.

## Weapon 1 — Tail Lash (replaces Tail Swipe)

The tail stops being a wide sector and becomes a long thin line. This is a **rename + rework** of
`tailSwipe`, not a new id beside it: the display name changes, so per the repo's rename rule the id,
constants, event, step functions and comments all move to `tailLash` and the old token greps to
zero. Keeping the tail fiction keeps render.js's existing kaiju tail rig and the `tail` event pulse.

**Per cast:**

1. Pick the **farthest `crushable` enemy within `reach`**. This is the inverse of every other
   weapon in the game, all of which aim at the nearest — and it is the entire point: the lash goes
   and gets the helicopter that has been standing off at 400px. With no aircraft in reach, it lashes
   the farthest enemy of any kind (damage only).
2. Damage every enemy the line crosses (thin: `width` ≈ 26–34px, the same ray test `inBeamArm`
   already implements, so no new geometry).
3. If the hooked target is `crushable`, **drag it to the player** over `LASH_PULL_T`, dealing
   `LASH_DRAG_FRAC × dmg` to everything it plows through. On arrival the existing `crushable`
   contact path (`sim.js` ~2419: "flying into a kaiju destroys the aircraft outright and costs the
   player NOTHING") kills it. **The payoff needs no new code.**
4. **Anything without `crushable` takes the line damage and is never moved.** This is the owner's
   constraint — tanks deal contact damage, so pulling one to your feet is self-harm. `crushable` is
   the correct discriminator because it is already exactly "aircraft" in this chapter's roster
   (jet + helicopter carry it, tankColumn does not) and it already means "harmless on contact".

**Levels** (reach clears Roar's 200–275 and closes on the standoff distances):

| L | dmg | rate | reach | width |
|---|---|---|---|---|
| 1 | 30 | 1.50 | 340 | 26 |
| 2 | 36 | 1.42 | 370 | 28 |
| 3 | 43 | 1.34 | 400 | 30 |
| 4 | 52 | 1.24 | 430 | 32 |
| 5 | 64 | 1.12 | 460 | 34 |

**Mods** (six, matching the house pattern — three fold via `WEAPON_STAT_MODS`, one rate mod read at
the fire site, two behavioural):

| id | name | effect | kind | status |
|---|---|---|---|---|
| `heavyTail` | Heavy Tail | lash damage | pct 0.30 | **unchanged** |
| `longTail` | Long Tail | lash reach | pct 0.30 | **unchanged** |
| `quickTail` | Quick Tail | lash rate | pct 0.25 (rate site) | **unchanged** |
| `doubleHook` | Double Hook | +1 aircraft hooked per lash | flat 1 | replaces `broadSweep` |
| `wreckingBall` | Wrecking Ball | damage dealt by a dragged body | pct 0.40 | renamed from `wreckingTail` |
| `counterLash` | Counter Lash | getting hit triggers a free lash | switch | renamed from `counterSwipe` |

Three ids survive untouched because they describe the new weapon exactly as well as the old one —
damage, reach and rate are axes both shapes have. That is deliberate laziness with a real payoff:
no clash with `flagella`'s "Heavy Lash"/"Barbed Lash"/"Long Reach", and their French already exists
in `fr.js`, so the translation ask shrinks to only genuinely new copy.

`broadSweep` (sweep width) has no meaning on a thin line and is dropped for `doubleHook`.
`wreckingBall` is `wreckingTail` reborn with the defect fixed: the damage is dealt along a visible
340–460px drag rather than inside an invisible 60px disc after a 37px nudge, so a pick is legible.
`counterLash` keeps the existing `tryCounterSwipe` hook in `hurtPlayer` (renamed).

## Weapon 2 — Atomic Breath (new, epic)

Charges `BREATH_CHARGE_T` ≈ 0.5s (a readable telegraph — the kaiju's dorsal fins light), then burns
for `duration`. It roots on the **nearest** enemy and **forks like lightning** to up to `jumps` more,
each within `arcRange` of the previous, damage decaying `BREATH_JUMP_DMG_MUL` per jump.

**The fork rebuilds on every damage tick.** Dead branches drop out and fresh targets snap in while
the beam is still burning. That is what makes it read as lightning rather than as a ray, and it is
also the mechanic: the breath keeps finding new bodies for its whole duration.

**Why this is not a third beam.** `run.beams` entries are a ray from the player at an angle
(`rainbow` auto-rotates, `pulsarSweep` wipers a fixed fan). A fork is a *chain of segments between
bodies*, all live simultaneously — it cannot be expressed as an angle and a length. It also is not
`tryChainBullet` (Chain Stars), which re-targets a single travelling projectile so only one segment
exists at a time. So Atomic Breath gets its own array, `run.arcs`.

**Levels:**

| L | dmg | jumps | arcRange | duration | interval | tick |
|---|---|---|---|---|---|---|
| 1 | 20 | 2 | 150 | 1.00 | 5.5 | 0.14 |
| 2 | 25 | 3 | 160 | 1.10 | 5.1 | 0.14 |
| 3 | 31 | 3 | 175 | 1.20 | 4.7 | 0.13 |
| 4 | 38 | 4 | 190 | 1.30 | 4.3 | 0.13 |
| 5 | 46 | 5 | 200 | 1.40 | 4.0 | 0.12 |

**Mods:**

| id | name | effect | kind |
|---|---|---|---|
| `overcharge` | Overcharge | breath damage | pct 0.30 |
| `forked` | Forked Breath | +1 fork per breath | flat 1 |
| `arcReach` | Arc Reach | fork distance | pct 0.25 |
| `heldBreath` | Held Breath | breath duration | pct 0.25 |
| `quickBreath` | Quick Breath | breath rate | pct 0.25 (rate site) |
| `fallout` | Fallout | forks that kill leave a burning patch | pct 0.50 |

## Data shapes

`run.arcs` — one entry per live breath:

```js
{
  life, duration,          // s remaining / total
  tick, acc,               // damage cadence
  dmg, jumps, arcRange,    // snapshotted at cast (mods picked mid-burn must not retune a live cast,
                           //   the same rule fireBeam already applies to Strobe and Beam Prism)
  charge,                  // s of wind-up remaining; no damage and no nodes while > 0
  falloutBonus,
  nodes: [{x, y}, ...],    // player -> target -> target ..., rebuilt each tick, read by render
}
```

Events: `{type:'breath', x, y}` on cast (charge start), `{type:'arc', nodes}` per tick for render
and SFX. `{type:'lash', x, y, tx, ty}` for the lash line; the existing `tail` event stays as the
kaiju's tail-pulse trigger.

## Registration checklist (each of these fails silently if missed)

- `WEAPONS`, `WEAPON_MODS` (config.js)
- `WEAPON_STAT_MODS` (sim.js ~4175) — folds the pct mods into `levels[]`
- `WEAPON_RATE_MODS` (config.js ~2080) — `tailLash: 'quickLash'`, `atomicBreath: 'quickBreath'`
- `WEAPON_COUNT_MODS` — `atomicBreath: 'forked'`, `tailLash: 'doubleHook'`
- weapon step dispatch (sim.js ~4301)
- `CHAPTERS.skies.weapons` **and** the `blank` union pool (config.js ~3519)
- `buildReadout`'s ordered whitelist (sim.js ~4235) — capped at `STAT_MAX_ROWS`, so insertion
  position decides which stats get dropped
- `STAT_LABEL` (ui.js) — missing labels are silently absent rows
- `SFX_FOR_EVENT` (main.js) + render.js event handling
- `state.js` doc block — `run.arcs` and the new event shapes
- `src/fr.js` — every new name and desc

## Testing

New sim-test scenarios, each mutation-proved (assert the *effect*, never that a field moved):

- **Lash pulls only aircraft.** A `crushable` enemy at 400px ends the cast adjacent to the player; a
  non-`crushable` enemy at the same spot has not moved at all, and took damage. This is the owner's
  constraint and it is the one that must never regress.
- **Lash targets the FARTHEST**, not the nearest: with two aircraft in reach, the far one is hooked.
- **Lash out of reach does nothing** (range gate).
- **Dragged body damages what it plows through**, and only with `wreckingBall` picked.
- **Breath forks:** with N enemies chained within `arcRange`, exactly `jumps + 1` take damage, and
  the (jumps+2)th — placed just beyond `arcRange` — takes none.
- **Fork damage decays per jump** — the last node takes strictly less than the root.
- **The fork rebuilds:** kill the root mid-burn and assert a previously-unreached enemy starts
  taking damage before the breath expires.
- **Charge is dead time:** no damage is dealt during `BREATH_CHARGE_T`.
- Existing run Y.g and the `tailSwipe` fixtures update to the new ids.

Balance gate: `scripts/weapon-census.mjs --chapter skies --level 5` must show Tail Lash **above**
Roar on effective dps (it is a rare; Roar is the free starter), and Atomic Breath above both (epic).
Ship neither if the census disagrees — this repo has guessed at weapon strength twice and been
wrong both times, which is why every number above is measured rather than reasoned.

## Open decisions

1. **French copy** for the genuinely new strings — two weapon names, two descriptions, and the
   eight new mods (`doubleHook`, `wreckingBall`, `counterLash` + all six breath mods). Per house
   rule this is drafted as options and put to the owner, never machine-translated. Heavy/Long/Quick
   Tail keep their existing entries.

## Out of scope

Retuning Roar or Debris Toss. Touching the bombardment signature or the artillery gate (shipped
separately in v7.22.0). Any change to `flagella`/`clawRake`, whose shared sector geometry is fine
where it is — the defect was two of them landing in one pool.
