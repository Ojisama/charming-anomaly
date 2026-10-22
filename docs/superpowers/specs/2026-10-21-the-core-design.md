# The Core — Book 3 (Burrow) chapter 6, polarity

Source of truth for the GAMEPLAY: the owner-played prototype `core-polarity.html` (job tmp; copied to
`docs/superpowers/specs/assets/core-polarity.html`). Source of truth for the LOOK: the crucible's
Liquid Metal FINAL (`liquid/r14/play.html`, copied to `docs/superpowers/specs/assets/core-liquid-final.html`).
Owner, 2026-10-21: "ship the level to game behind dev gate".

Two ships, both DEV-only (Burrow has `wipFrom: 0`, so appending the id hides it from players):

1. **Wired box** — the chapter, its signature, roster, 4 weapons, pillars and pools, HUD pole clock,
   drawn with archetype looks tinted by pole. Goes to the owner's phone first ("play it before you dress it").
2. **Liquid Metal** — `src/liquid.js`, a chapter renderer on the `src/toon.js` pattern
   (`createLiquidRenderer(host)`), porting the r14 floor (mirror sea, ink-blot pools, levitator pillars)
   and the chrome cast.

## Scale

1 prototype unit = **667 px** (matches speed: 0.33 u/s -> 220 px/s = `PLAYER.baseSpeed`).
Prototype hp x10 = game hp (sling 1 dmg -> 10). Player hp is 100 in both, so enemy damage to the
player carries over unchanged.

## Signature `polarity` (`CHAPTERS.core.signature = { type: 'polarity', polarity: {...} }`)

- **Owner, 2026-10-21, replacing the prototype's 15 s player flip:** "rather than the player flipping
  polarity every 15 seconds, it could be the proportion of enemies spawning as north or south ...
  sinusoidal, flipping also every 15 seconds, and the player has the agency to walk into a pool to
  change its own polarity."
- `run.polarity = { pole, mix, poolCd }`, built lazily by `stepPolarity` like `stepLavaTide`;
  `pole` is +1 (N, red) / -1 (S, blue), starting N. **Your pole changes ONLY in a pool.**
- **The spawn tide:** `mix` = share of new spawns that are North = `0.5 + 0.4 * sin(2*pi*t / 30)`
  (10%..90%; the majority changes side every 15 s). Every spawn rolls its pole against `mix`;
  the Golem still spawns opposite to you.
- Changing pole (in a pool) ejects every latched mite (outward 467 px/s, stunned 0.6 s). Event
  `{type:'poleFlip', pole}` on every change of YOUR pole (sound: yes).
- **Damage rule**, in `dealDamage` (the one funnel): x2 if the enemy's pole is opposite yours, x0.5 if
  the same. Flat hits (Dipole Lance) skip it. An eel takes the pole of its segment nearest the player.
- **Pillars**: `obstacles: { kind: 'pillar', ... }` (solid, r 21 px), each with a hashed `pole`.
  Within **213 px** a pillar pulls opposite-pole bodies and pushes same-pole ones:
  player +-93 px/s x (1 - d/213); enemies (not eel/top) 0.22 u -> accel 147 x 6 px/s^2 x (1 - d/213).
- **Pools**: streamed per cell (boats pattern) into `run.corePools` `{x, y, rx 47-80, ry 33-60, rot, pole}`.
  You entering an opposite pool take its pole at once (1.2 s cooldown): your only way to change pole. An enemy (not eel/top) entering one takes
  the pool's pole. Event `{type:'poolFlip', x, y, pole}` (silent).

- **Magnetic loot** (owner pick, 2026-10-21): every XP gem dropped in the Core carries `g.pole`, the
  pole of the creature that dropped it. Gems of your OPPOSITE pole are pulled from 3x the normal magnet
  radius; gems of your SAME pole slide away from you at 60 px/s while within 120 px (walking onto one still
  collects it). Changing pole in a pool turns the other half of the floor into a harvest. Render tints
  each gem by its pole.
- **The crowd sorts itself** (owner pick, 2026-10-21): in the enemy separation step, opposite-pole
  creatures that touch attract and STICK (they cluster into knots) and grind each other for 3 hp/s
  each; same-pole creatures repel at 1.5x the normal separation reach. The eel is exempt. A grind kill
  counts as a kill and drops loot (no hazard credit games: it is the chapter's rule, not a weapon).

## Roster (hp from prototype x10, speeds x667, damage as prototype)

| id | archetype | proto hp | behaviour (prototype `step`) |
|---|---|---|---|
| ferriteMite | normal | 2 | opposite: rushes (cap 180 px/s) and LATCHES (pinned to you, 1.5 hp/s, each latched mite -8% speed, floor 40%); same: orbits at 187 px and spits a needle every 2-3.2 s |
| needleUrchin | normal | 5 | holds 253 px whatever the poles, fan of 5 needles every 3.2 s |
| spinningTop | fast | 4 | pole strobes every 2 s; seeks 200 (opp) / 120 (same) px/s with a wobble; contact 8 |
| ferroBlob | tank | 10 | slow 40 px/s; opposite and within 147 px grows spikes (contact reach +33 px, 12 hp/s); splits into 2 ferroBlobSmall (4 hp, 67 px/s) of its pole |
| dipoleEel | fast | 14 | head N / tail S (x sw); leads with the end opposite yours, 100 px/s; bite 10 + shove 20 px; turns round when your pole changes |
| lodestoneGolem | tank | 36 | spawns opposite; opposite: drags you in (107 px/s at 0, radius 333 px), crawls 33 px/s, contact 16 hp/s; same: shoves you (67 px/s), orbits at 240 px, fan of 3 needles every 3 s |

Needles: `run.enemyShots`, `turnRate: 0`, 200-240 px/s, 4 dmg, 3.5 s, stopped by pillars.
Spawn cadence follows the prototype's timers (urchin 7 s, top 9 s, blob 14 s, eel 16 s, golem 30 s, mites
continuous) through the chapter's ordinary roster weights; balance is a first guess, tuned after the playtest.

## Weapons (pool: sling, dipoleLance, mercuryMoons, decoyLodestone; starter sling — Rev 3)

| id | rule |
|---|---|
| sling | an iron ball of your pole; half the time it targets a latched mite |
| dipoleLance | short two-coloured beam, ignores poles |
| mercuryMoons | chrome drops orbit you in your pole's colour and tug foes of the other pole into their path |
| decoyLodestone | dropped at your feet with your pole; drifts foes of the other pole toward it, bursts on a fuse with its own pole, tears latched mites off you |

Numbers live in config.js (`WEAPONS`); the Gauss Coil and the Reversal Pulse were removed in Rev 3.

4 mods each (`WEAPON_MODS` in config.js). The owner approved the French for the two Rev 3 weapons.

## HUD

A spawn-tide gauge in the chapter-resource rail slot: how much of what spawns now is North (red) vs
South (blue) and which way it is heading, with your own pole beside it. No flip warning is needed:
nothing changes your pole but a pool. The player wears its pole (tint), and a pool change gets one
short, small, local pulse (owner rule: no full-screen flash).

## Not in scope (YAGNI, add when asked)

The prototype's Nexus and bounded 3x4 map (the game streams an endless world and has its own victory).
A Core anomaly and mutator (chapter-stage will show `owes`).

## Rev 2 (2026-10-21, after the adversarial review of v8.90.0) — owner rulings

**THE RULE (owner): opposite ATTRACTS — it comes at you, attacks, takes x2. Same REPELS — it keeps
away, cannot hurt you, takes x0.5.** Matching the majority is safe but slow; opposing it is risky but
fast; the tide moves the majority every 15 s, so the pools are the decision.

| creature | opposite to you | same as you |
|---|---|---|
| Ferrite Mite | rushes, clings (slows you, small dot) | scatters away. **No ranged attack (owner).** |
| Needle Urchin | needle fan at you | still fires, but each needle carries the urchin's pole: a needle of YOUR pole bounces off you harmlessly (spark) |
| Ferro Blob | spikes toward you, splits on death | balls up (curled, still), no contact damage |
| Lodestone Golem | drags you toward it, contact damage | shoves you away, no damage, no needles |
| Spinning Top | pole strobes every 2 s: it only hurts while opposite; hit it on the right beat | (same rule, per beat) |
| Dipole Eel | two poles: bites with the end opposite you; RARE; its tail is a hittable segment with its own pole | |

- **Grind: stick only, no damage** (owner). Opposite bodies still clump into knots.
- **Gauge: the live N/S split of the creatures on screen** (owner), not the spawn mix.
- **Reversal Pulse: turns every creature it touches to the pole OPPOSITE yours** (owner) — prey for
  your x2, threat for your hull — and shakes off clinging mites.
- Review fixes: spawn composition back near the prototype's (heavies were 5x: eels 121 vs ~19, golems
  53 vs ~10 per 300 s) with a cap on concurrent heavies; polar damage-over-time capped and respecting
  the hit cap; the player stays the mint blob with a pole RING (South colour lightened for contrast);
  a steel needle (the amber dart read as loot); the prototype's tells restored (x2 = bold red spark,
  x0.5 = thin grey spark; pillar pull/push animated rings; golem field rings); grind has no numbers;
  pools never under pillars; eel/top/golem xp raised to match their hp.

## Rev 3 (2026-10-22) — owner rulings on the arsenal and the player

- **The Reversal Pulse is gone** (owner: "the ring that inverts polarity removes the point of pools"),
  and the **Gauss Coil** left the pool (nothing else offered it, so it is deleted too).
- Pool: sling, dipoleLance, **mercuryMoons**, **decoyLodestone**; starter sling.
- **Mercury Moons** (Gouttes orbitales): chrome drops orbit you in YOUR pole (live), hit by the pole rule,
  and tug foes of the other pole into their orbit. Mods: Heavy Mercury, Extra Moon, Fast Orbit, Strong Tug.
- **Decoy Lodestone** (Leurre aimanté): drops at your feet with your pole and keeps it; for its fuse it
  draws foes of the other pole (to it) toward itself, a drift fast chasers out-run, never closer than a
  rim (owner, rev 3b: "pull less"); then it bursts, damage by the
  pole rule from ITS pole, and throws off every mite clinging to you (the Pulse's old job).
  Mods: Heavy Charge, Strong Field, Quick Drop, Twin Lodestones.
- The player is the demo's drop tinted toward its pole (easing through mint on a swap), no ring.
- The floor's molten trough glow is removed (variant B); the pillar-foot heat stays.
