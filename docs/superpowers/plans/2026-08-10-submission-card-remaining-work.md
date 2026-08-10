# Submission (the anomaly card) — what is built, and what must land before it ships

Branch `worktree-upgrade-pool-specs`. The card is **NOT shippable yet**. `npm test` is green and the
bundle builds, and neither fact means anything here: the suite has no coverage of this card, and it
passes just as happily with every defect below present.

## Built and measured

- An elite killed under the card pays out completely normally (kill event, 4x xp gem, 8 coins,
  `_eliteKills`, blood-pact stacks, its volatile core and splitter wisps) and *then the body gets
  up* — `sim.js` death branch, last statement. `_turned` is the idempotence guard.
- Elite cadence tripled: measured **11 -> 33 elite spawns** over a 300s body run (baseline matches
  the documented 8.6–10.6).
- Ally is damage-immune and harmless to the player through ONE `damageImmune()` clause (which
  `contactHarmless()` also consults).
- Excluded from: `nearestEnemy` (the aim choke), all four random AoE pickers, Wildfire's jump, the
  straggler teleport, and the spawn density cap. Six projectile loops pass through it.
- Faces its target (render derives bearing from the player otherwise); gold ground ring whose inner
  arc drains with the loan. **The ring is a stand-in** for a real "turned" bake.
- EN **Submission** / FR **Soumission**, "they only obey the strongest" /
  "ils n'obéissent qu'au plus puissant". Identifiers renamed to match (`submission`, `SUBMISSION_*`,
  `type:'submission'`, `stepSubmission`, and "ally" as the entity noun everywhere).

## MUST FIX — the ally attacks the player, in every chapter

These are the chapters' `eliteFlags`, which a turned elite keeps. `e.elite` deliberately stays true,
so every one of these guards still passes. Each reads `run.player` directly and bypasses the
retarget seam.

| chapter | flag | what the ally does to you | site |
|---|---|---|---|
| skies | `artillery` | keeps shelling your predicted position (~11 strikes / 300 HP per loan) | sim.js ~1622 |
| skies | `missileVolley` | fires enemy missiles at you | sim.js ~1991 (`fireEnemyMissile`) |
| pond | `soapTrail` | lays player-only damaging pools (~372 HP of DoT per loan) | sim.js ~1580 |
| beyond | `pullBeam` | keeps abducting and burning you | sim.js ~3535 (`stepPullBeams`) |
| city | `spawner` | disgorges HOSTILE minions every 3.5s | sim.js ~1652 |
| undergrowth | `flashlightCone` | aims its cone at you AND enrages the swarm it should be fighting | sim.js ~2077 |

Decide per flag: **suppress** on an ally (soapTrail, webZone, wake, spawner, flashlightCone, pacer,
pullBeam) or **retarget** (artillery and missileVolley already land in `run.bombs` /
`run.enemyShots`, which damage enemies too — artillery is nearly free once aimed).

## MUST FIX — defects in the current implementation

1. **`enemy._dead = false` silently disables every on-kill weapon mod for elites.** Supernova
   Sparks, Swarm and Sporeburst all test `e._dead` *after* the damage call, so taking Submission
   turns those mods off on the biggest kill in the game. This breaks OTHER cards. (sim.js ~3779)
2. **Trash Tornado guard is on the wrong line.** `isAlly` was added to the `live` set (the sticky
   check) but not to the "nearest unclaimed" *pick*, so a funnel drops the ally and immediately
   re-picks it, every frame. (sim.js ~5978)
3. **Elements are applied to the brand-new ally** — `applyDamage`'s next line is
   `if (!enemy._dead) applyElements(...)`, and the resurrection just cleared `_dead`. (sim.js ~3808)
4. **Crowd control still lands**: `damageImmune` gates damage only, so nova fear/knockback/stun,
   vortex pull and Frost Arc chill all still apply to an immune ally.
5. **Seeker Blades** run their own nearest scan instead of `nearestEnemy` — blades home onto the
   ally. (sim.js ~4683)
6. **Mines**: an ally trips the whole field for zero damage. (sim.js ~4830)
7. **Beam Prism refracts off the ally** — a direct violation of "blocks nothing". (sim.js ~5241)
8. **Lightning arcs** burn a chain slot on the ally (`applyShock`'s `nearby`). (sim.js ~3922)
9. **The city spawner's own cap** missed the `+ allyCount(run)` correction. (sim.js ~1656)
10. **`{type:'submissionend'}` is a dead event** — no render case, no SFX. The loan ending has zero
    feedback.
11. **`state.js`'s doc block was never updated** (CLAUDE.md calls it authoritative): `allyT`,
    `_turned`, `_allyHitT`, `_tgtX/_tgtY`, and both new event shapes are undocumented.

## MUST FIX — tests

There are none. Minimum set, each with the mutation that must redden it:
- payout runs exactly once per elite (mutation: drop `_turned`) — count gems/coins over a real run
- ally never damages the player, per chapter, driven from `CHAPTERS[*].eliteFlags` (mutation: remove
  a suppression) — enumerate from the config table, never a hand-written list
- player weapons neither target nor damage nor are consumed by an ally (mutation: drop the
  `isAlly` guard in `nearestEnemy` / a projectile loop)
- `e.elite` stays true through the turn (mutation: clear it)
- expiry fires the volatile core but spawns no hostile children
- allies excluded from the density cap

## Open French questions for the owner (do NOT decide these alone)

- `pour 50% de tes dégâts` reads as a **price** — the dictionary uses `pour`/`contre` for costs
  elsewhere (Surcharge: "…contre 0,75 PV par seconde"). Probably wants `avec` or a recast.
- `Tes tirs ne peuvent pas les toucher` is **narrower than the mechanic** — the immunity covers
  orbits, novas, mines and beams, not just shots. An orbit build would misread it.
- `arrivent` vs `apparaissent`: the Elite Convention mutator already renders the same English as
  "Les élites **apparaissent** deux fois plus souvent".
- `changent de camp` is a *defection* metaphor on a card called **Soumission** whose flavour line is
  about obedience — three fictions in one card.
- `au plus puissant` vs the set phrase **`la loi du plus fort`**.
