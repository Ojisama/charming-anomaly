# Submission (the anomaly card) — what is built, and what must land before it ships

> **STATUS 2026-08-10, after the ponytail review:** everything in "MUST FIX" below is DONE except
> where noted, and run SB in `test/sim-test.js` now covers the card (3 scenarios, mutation-proven).
> The fix was smaller than this plan assumed — see "How it was actually fixed" at the foot.

Branch `worktree-upgrade-pool-specs`. The card **was NOT shippable** when this was written. `npm test` is green and the
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

---

## How it was actually fixed (ponytail review, 2026-08-10)

The 17-item list collapsed to 8 changes, because two of them killed whole classes:

1. **The turn moved out of `dealDamage` into `turnDeadElites(run)`, called at end of frame** just
   before the `_dead` sweep. `_dead` now stays `true` for the entire frame, so the three on-kill
   weapon mods and `applyDamage`'s `applyElements` behave exactly as they do without the card —
   findings #1 and #3 died with zero guards. This was the fix I missed: I had put the turn in the
   obvious place, inside the death branch, and that is what broke other cards.
2. **`SUBMISSION_STRIP_FLAGS`** — one config list, applied with `.filter()` at the turn, replaced
   the whole six-chapter suppress-or-retarget table. `.filter()` and not an in-place splice is
   mandatory: `spawnSplitChildren` assigns `flags: parent.flags` BY REFERENCE, and a splitter elite
   spawns its children in the death branch that just ran.
3. Six one-token `isAlly(e)` guards: `applyShock`, `steerSeekerBoomerang`, `stepMagneticMines`,
   `stepMines`, `stepOpenJet`, `firstOnRay` (prism).
4. `e.fearT = 0; e.stunT = 0` in the ally branch — your own Chitter Shriek was making your ally flee.
5. Tornado guard moved from the sticky `live` set to the target PICK (it was oscillating every frame).
6. `submissionend` deleted; expiry reuses the fully-wired `{type:'explode'}`.
7. `state.js` doc block updated.

**Cut deliberately** (with reasons in the review): the spawner density-cap correction (the flag is
stripped, so a turned van never spawns), knockback/chill/vortex on an immune ally (a shove and a
slow are what your nova visibly does), and retargeting `artillery`/`missileVolley` rather than
stripping them.

**Still open:** the `redrawTelegraphs` amber telegraph on an ally (a `// ponytail:` ceiling, not
code), and a volatile elite now firing two cores per elite — one at the turn, one at expiry. That
may be exactly the Unstable Cores headline, but it doubles the card's damage contribution and the
config does not say so. Owner's call at playtest.
