# The Wreck — defensive gameplay

Owner, 2026-08-24: *"I feel like the wreck needs its own gameplay / upgrades. Since we chase
instead of being chased, we could have 'defensive' upgrades, like 'less sensibility to slows' or
'can dodge traps' or things like that. Maybe that means changing traps, enemies, level design."*

Follows `2026-08-22-the-wreck-hunt-rework-design.md` (rev 5). Nothing here reopens that document's
§5.4 question (`spawnMul` 2.2 as ambient crowding vs discrete shoals in empty water).

**This is rev 2.** Rev 1 opened with a Part 1 that made the ambient Leak repel prey. An adversarial
review refuted it with measurement, the owner ruled it dropped, and §1.2 below is the corrected
premise. Rev 1's §1.1 table also quoted the wrong probe arm. **Do not quote rev 1 for anything.**

---

## 0. THE RESULT: the chapter's best mechanic has no cards

A defensive card is worth taking when the hazard it answers is something you go **through**. Most
of The Wreck's hazards are things you go **around** — the orca: leave the ring; elite pools: don't
stand in them; starving: keep eating. A card answering a route-around hazard can only ever say
*route less carefully*, which is a subtraction rather than a verb. That is why `armor`/`regen`/
`maxHP` — the game's only three defensive cards, all global — read as filler here.

**But one hazard here is already the other kind, and it already works.** The Leak stains: a fish
that crosses ambient oil keeps a permanent fraction of its speed off, forever, capped at
`OIL_STAIN_MAX`. Measured on the shipped build, **40.8% of all prey get stained and 36% reach the
permanent cap** (§1.1). The chapter's own config says why that matters: *"0.20 takes the damselfish
to 178 px/s, i.e. under the player, which is the point of the card"* (`config.js:10061`). Staining
is how the un-catchable fish becomes catchable.

And the Leak is also **what actually kills you** — 24.9% of a mortal hunter's damage, the tightest
row in the attribution table (§1.1).

So the chapter's central hazard is simultaneously its best hunting tool and its biggest killer, and
**not one card in the game touches it.** That is the whole gap, and it needs no world change to
close. The design is therefore smaller than rev 1's and points almost entirely at one substance:

> **Sell the player a relationship with the oil.** Cross it cheaper, burn less in it, and hit harder
> what it has marked.

Two new hazards join it, because the owner ruled *hazards first* and because the oil alone is a
thin floor: **Rust** (ground that takes prey's sight) and **the plate field** (a hazard that kills
your food and that you are just tough enough to stand in).

---

## 1. The diagnosis

### 1.1 What actually hurts you here

8 seeds × 300s, `wreck` d1, every seed printed. `hunt` walks at the nearest body; it never spends
Lunge and never routes around anything, so it is a **floor on player skill**. **The mortal arm is
the one that describes a player** — rev 1 quoted the immortal arm and then spent it as a budget,
which inverted two rows.

**`hunt`, MORTAL — what kills you.** Death at **158s** (sd 70, range 105–300).

| source | dmg/run | share | per-seed |
|---|---|---|---|
| orca | 102 | 62.6% | 41, 80, 88, 78, 82, 68, 102, 275 |
| **the Leak** | **41** | **24.9%** | **78, 33, 39, 24, 42, 30, 30, 48** |
| elite core blast | 14 | 8.5% | 0, 0, 76, 18, 0, 0, 0, 17 |
| elite soap pools | 6 | 3.5% | 2, 8, 30, 0, 2, 2, 0, 2 |
| starving | 1 | 0.5% | 0, 0, 0, 0, 0, 0, 0, 6 |

`killedBy`: slick, pool, bomb, bomb, orca, slick, orca, survived.

**`hunt`, IMMORTAL — what would touch a player who stays out the full 300s.** Same seeds.

| source | dmg/run | share | per-seed |
|---|---|---|---|
| orca | 239 | 43.0% | 246, 280, 241, 216, 202, 238, 211, 275 |
| elite soap pools | 161 | 29.0% | 2, 24, 60, 2, **466, 264, 470**, 2 |
| the Leak | 68 | 12.2% | 102, 33, 72, 159, 45, 48, 36, 48 |
| starving | 59 | 10.6% | 24, 16, 0, 146, 170, 70, 40, 6 |
| elite core blast | 28 | 5.1% | 0, 0, 152, 18, 0, 20, 20, 17 |

**`ignore`, MORTAL — the do-nothing control.** Death at **83s** (sd 19, range 66–119); starving
78.8%, the Leak 17.3%, orca 3.9%.

**Four readings, and only the second is new design ground:**

1. **The orca is the dominant killer** at 62.6%, and it is ruled to have no card. This design does
   not touch the chapter's peak damage and is not trying to.
2. **The Leak is second, and it is the only tight row in the table** — 24 to 78 across eight seeds,
   no bimodality, present in every run. It is the most predictable and therefore the most
   build-against-able threat the chapter has. **That is why all three cards point at it.**
3. **The thesis works, and it works on the right player.** Starving is 78.8% of the control's death
   and **0.5%** of the hunter's. The drain punishes standing off and does not punish hunting, which
   is exactly what *"stop and you starve"* should mean.
4. **Elite pools are 3.5%** of what kills a player, so Part 3's swap costs the chapter almost
   nothing.

**Two caveats that travelled with that table**, both since resolved by the fixed-loadout re-run
below: one seed (56667) survived the full 300s and contributed ~4× the exposure of the others, and
the `bomb` row was partly seed 17072's `unstableCores`.

### 1.1b THE CANONICAL BASELINE — fixed loadout

**This is the arm every later change is diffed against.** Same 8 seeds, same rig, one change: the
level-up policy never takes an anomaly and picks the chapter's own cards in a fixed priority order.
**Fallbacks to index 0: zero**, across all four arms — the loadout is genuinely fixed, not
fixed-ish.

`hunt`, MORTAL — death at **144s** (sd 39, min 95, max 197):

| source | dmg/run | share | per-seed |
|---|---|---|---|
| orca | 92 | 66.9% | 86, 109, 132, 78, 132, 66, 102, 34 |
| **the Leak** | **35** | **25.5%** | **57, 87, 18, 24, 3, 33, 27, 33** |
| elite core blast | 7 | 5.2% | 0, 0, 0, 18, 19, 0, 0, 20 |
| elite soap pools | 3 | 2.4% | 0, 4, 0, 0, 6, 2, 0, 14 |

**What the fixed loadout changed, and what it did not:**

- **The spread tightened materially** — death sd 70 → 39, and the 300s survivor is gone. That
  outlier was inflating every mortal row.
- **§0's load-bearing claim survives.** The Leak holds at 24.9% → **25.5%**, still the row present
  in every run and still the most predictable thing in the table. All three cards point at it and
  that is still correct.
- **The `bomb` row shrank but did not vanish** (8.5% → 5.2%, three seeds). So it is *not* purely the
  `unstableCores` seed — some of it is ordinary `volatile` affix rolls, which a fixed loadout cannot
  remove. Do not attribute the whole row to the rig.
- **`ignore`/mortal is unchanged** (83s, 78.8% starvation) — that policy barely levels up, so the
  loadout policy should not move it, and it did not. That is the rig's own sanity check.
- Elite pools fall to **2.4%**, reinforcing Part 3: the soap-trail swap costs the chapter almost
  nothing that kills a player.

### 1.2 The premise rev 1 got backwards

Rev 1 claimed the two oils behaving differently — weapon-laid `look:'bilge'` blooms repel prey,
ambient `run.slicks` do not — was a one-fact-two-places drift defect, and proposed closing it.

**It is a ruling, not a drift.** `OIL_STAIN_RATE`'s own block, `config.js:10048`:

> *"BOTH oils stain: the player's `look:'bilge'` blooms and the chapter's own ambient `run.slicks` —
> it is the same substance, and the leak being usable against the shoal is the chapter reading its
> own hazard as terrain."*

Two roles on purpose. **The weapon's oil is the fence you place. The chapter's oil is terrain that
tenderises.** CLAUDE.md's drift class is one fact authored twice that came apart by accident; this
is neither.

And the measurement kills the proposal outright:

- 40.8% of prey get oil-stained (8 seeds, sd 13.6), 36.0% reach the permanent cap.
- **99.6% of that happens with the player nowhere near.** Nobody drives fish into the leak — they
  wander in, all over the map, constantly. Rev 1's "the shipped tenderizer play is unchanged" was
  false.
- The panic exemption cannot cover it. `PREY_PANIC_BLIND_R` is 260 and the ramp
  (`sim.js:9092`) is fully off only inside **130px**, against a spill of radius 190 — **380px
  across**, avoidance edge 236 with `BILGE_AVOID_PAD`. The exemption disc is smaller than the
  hazard it was supposed to open.
- A fence would push 36% of the field back over the player's own 220 px/s: mackerel 82.6 → 103.3,
  damselfish 178 → 223. That last one is the exact number the config calls "the point of the card".

**Ruled 2026-08-24: the fence is dropped.** The chapter already has one — Bilge, which you place.

### 1.3 Two rig lessons this cost, worth keeping

- **The immortal arm distorts attribution and it is not a small effect.** An immortal player is held
  at bar-zero for 300s and never escapes a DoT by dying, so `starve` reads 10.6% immortal against
  **0.5% mortal** (seven of eight seeds exactly zero), while `slick` reads 12.2% immortal against
  **24.9% mortal**. Immortal answers *"what would touch a player who stays out for 300s"*; only the
  mortal arm answers *"what kills"*. Rev 1 used the first to argue about the second.
- **Print every seed.** `pool` on the immortal arm ranged **2 to 470 across eight seeds** — bimodal
  on whether an elite happened to park on the player. A mean over that is not a number. This repo's
  own rule (≥6 seeds, print every one, read the spread) exists for exactly this and rev 1 ran five
  seeds and printed means.
- **`applyChoice(run, 0)` builds an uncontrolled loadout.** Three of eight seeds took anomalies; the
  one that took `unstableCores` owns most of the `bomb` row and kills 2643 against a fleet mean of
  ~1170. Any arm compared against another needs a fixed loadout.

---

## 2. Owner rulings

### 2026-08-24, round 1

| Question | Ruling |
|---|---|
| Answer the hazards it has, or change the world first? | **New hazards first, then the cards.** |
| What kind of thing is the floor? | **A + B.** A: a wall to your food and a toll on you. B: it kills your food and you are just tough enough to stand in it. **C (rival scavengers stealing kills) offered and NOT picked.** |
| The blinding cloud takes sight — whose? | **Prey only.** No toll on the player. |
| The falling plate — terrain or rhythm? | **Both.** An ambient field that the settle re-arms. |
| Elite soap trails are borrowed — replace? | **Replace with a wreck-native affix: an oil trail.** |
| Scope the slow resistance? | **Wreck-only.** |
| The orca — which card shape? | **No orca card.** |

### 2026-08-24, round 2

| Question | Ruling |
|---|---|
| The blinding cloud's noun (`silt` unavailable) | **Rust.** `rouille` is free. Coal dust and ash offered, not picked. |
| Does the elite's oil burn? | **Pure wall — `dmgPerTick: 0`.** A fence that *walks*. |
| Card names | **Sleek · Oilskin**, and see Part 4 for the third. |
| Anomaly and mutator | **Anomaly on the oil, mutator on the settle.** |

### 2026-08-24, round 3 — after the adversarial review

| Question | Ruling |
|---|---|
| Part 1 (the Leak repels prey) is measured to destroy the shipped stain play | **Drop the fence.** Bilge is the fence you place; the Leak is terrain that tenderises. Two roles, already working. A new authored wall (a bubble curtain) was offered and not picked. |
| `Low Profile` is a boolean in a Lv-5 system, and `ANOMALIES.deadfall` already does it | **Replace it with a third OIL card that PAYS** — crossing a spill becomes an advantage, not merely free. |

### 2026-08-24, round 4

| Question | Ruling |
|---|---|
| Blinding prey is an 83% speed cut, not a perception effect — keep that strength? | **Keep it strong, make it rare.** Scarce, small, placed against the oil so reaching one costs a crossing. Weakening it and giving it a toll were both offered and not picked. |
| The three cards all land in UTILITY, costing every existing utility passive 30% of its offer rate | **Split them by what they are.** Sleek + Oilskin join `DEFENSIVE_PASSIVES` (defense 3 → 5); Slick Feed stays utility (7 → 8). |

**The accepted risk on Rust, stated plainly:** it is a place where the chapter's whole problem —
food that outruns you — simply stops being true, at no cost to the player. Scarcity is the entire
balance, so §5.2 is not a tuning pass, it is the check on whether Rust becomes the only thing
anyone plays for.

---

## 3. The hazards

### Part 1 — Rust: ground that takes prey's sight

A corroding hull sheds rust into the water. Prey inside a rust cloud lose track of the player.

**The mechanic is `blindT`, and what it actually does is not what rev 1 said.** rev 1 claimed a
blinded body "captures its heading and holds it". Measured (`blind-prey.mjs`, one mackerel at
150px): sighted mean speed **87.3 px/s**, blinded **14.8 px/s** — and the heading turn is 105° in
*both* arms, which is the school-drift term and identical either way. **It does not hold a
heading. It is an 83% speed cut.**

The mechanism, and it is invisible to a code read: `stepEnemyMovement` rewrites `tx`/`ty` to
`e + _blindH * INK_BLIND_REACH` (`sim.js:2216`, `INK_BLIND_REACH` = 4000) *before* `d` is computed
at `sim.js:2222`. `stepPrey`'s flee gate is `d < PREY_SIGHT_R` (340). 4000 is not < 340, so a
blinded fish falls out of the flee branch entirely into `PREY_DRIFT_MUL` 0.30 milling. `stepPrey`
never reads `blindT` at all — which is why grepping for it finds nothing and concluding "inert" is
exactly backwards.

**So a rust cloud is a kill box**: ambient ground that drops all food to 17% of escape speed at no
cost to the player. That is far stronger than the ruling assumed — and **ruled kept** (round 4). It
is a rare place where the chapter's whole problem, food that outruns you, simply stops being true.
Three consequences:

- **Scarcity is the entire balance.** Small, rare, and placed against the oil so reaching one costs
  a crossing. §5.2 is not a tuning pass — it is the check on whether Rust becomes the only thing
  anyone plays for.
- **`slow: 0` is not the knob rev 1 thought it was.** `slow: 0` gates the **enemy** branch
  (`sim.js:8584`) — `bloomSlowT` and the oil stain. The player's bloom slow is keyed on look, not
  on `slow`: `sim.js:721` is `if (bl.look !== 'inkjet' || bl.r <= 0) continue`. A rust bloom cannot
  slow the player whatever `slow` is set to. Omitting `slow: 0` would slow the **prey** it is
  blinding, making the kill box worse.

**It cannot be a `run.blooms` entry.** `run.blooms`' only cull is lifetime (`sim.js:8650`); there
is no distance splice, and an ambient streamed field needs one — a hunter travels 57–96k px per
run. It also gets scanned per skittish body by the avoidance loop. **Rust needs its own
`run.rust` array**, streamed on the `run.slicks` cell-hash idiom with its own salt, which means it
**does** trip run CP and must be named in `clearWorld`'s flat list and handed to `syncPool`.

**Naming:** `silt` is unavailable — `Silt Veil` / `Voile de Vase` is shipped and `fr.js:1481`
explicitly pins `vase` to that weapon. `rust` / `rouille` is free in both files.

### Part 2 — The plate field, and the settle

Hull sections hanging over the wreck, armed. Trip one and it comes down on whatever is under it —
prey included.

`run.traps` is the right **shape**: `{ x, y, r, armed, rearmAt, _cell }`, streamed by cell, trips on
player or enemy, flat damage through the normal `armor`/`contactDmgTakenMul` path, then disarms and
re-arms. The player/enemy split is clean (`sim.js:5737`).

**It is not a re-skin, and four things fail silently if it is treated as one:**

1. **Three gates on `sig.type === 'predators'`, not one** — `streamTraps` (`sim.js:5265`),
   `stepTraps` (`sim.js:5718`), and the pounce-slam (`sim.js:2646`).
2. **The art already exists and is wrong.** `T.trapArmed`/`T.trapSprung` are baked
   unconditionally (`render.js:7386`) and `syncPool(trapPool, …, run.traps || [], …)`
   (`render.js:20659`) is not chapter-gated. So a "plate" **draws** — as an undergrowth bear trap,
   spread steel jaws and bared teeth, 30px, on the sea floor. Rev 1's wiring row said it would not
   draw at all; the opposite is true, and borrowed art that renders is the harder failure to notice.
   `placeTrap` (`render.js:16434`) has no fall, no hang and no telegraph.
3. **The summary would say "Snap Traps".** `sim.js:5741` hardcodes
   `hurtPlayer(run, SNAP_TRAP_DMG, false, 'trap')` and `DMG_SRC_NAME.trap` is `'Snap Traps'`
   (`config.js:11198`, comment: *"the undergrowth"*). Reuse the array unchanged and a French
   post-mortem screen in an ocean reads *Pièges à Mâchoires*, with **run DA green** — the guard only
   catches an *unknown* bucket, not a wrong one. A new `src` key at the trip site is required.
4. **`{type:'explode'}`** is what `springTrap` emits (`sim.js:5765`) — an explosion underwater, for
   a falling plate.

**The settle** re-arms the whole field on a fixed interval. **Two writes, not one:** off-screen
plates live in `run._trapRearm`, a Map keyed by cell, read back at `sim.js:5295`. A sweep over
`run.traps` alone leaves them disarmed; `run._trapRearm.clear()` is required.

### Part 3 — The elite oil trail

`eliteFlags: ['soapTrail']` becomes the chapter's own flag: an elite drags a wall of oil behind it,
laid on `soapTrail`'s cadence at the same site (`sim.js:2452`) as a `run.blooms` entry tagged
`look: 'bilge'`. Tagging it `bilge` is what makes it one substance rather than a lookalike — it
inherits the prey avoidance, the stain and the shipped render, and needs no new art.

**Ruled: it does not burn** (`dmgPerTick: 0`). The elite becomes a **fence that walks** — nothing
else in the game drags a moving wall across the field.

**Rev 1's budget argument for this was false and is withdrawn.** It claimed soap pools are 20.7% of
a hunter's damage and that removing them takes a fifth of the chapter's budget. That was the
immortal arm. On the mortal arm elite pools are **3.5%**, off a per-seed range of 2 to 470. Removing
them costs the chapter almost nothing that kills a player. The real argument for the swap is
identity, not budget, and it should be made on those terms.

**Two silent failures:**

- **`SUBMISSION_STRIP_FLAGS`** (`config.js:497`) lists `soapTrail`. A replacement that is not on it
  means a submitted elite becomes **your own ally laying oil walls across the field**.
- **`run SB.a` could not see this chapter, and widening it is NOT enough.** The test guarding that
  list looped `for (const id of CHAPTER_ORDER)` — `BOOKS.book1.chapters` — so it walked 5 of 13
  chapters and no Book 2 chapter at all. **Fixed** to `Object.keys(CHAPTERS)`; the count in its PASS
  line now reads 13.
  **But the real gap is the ASSERTION, not the loop, and this affects Part 3 directly.** SB.a
  measures *damage* against a no-ally control, so a hostile affix that deals no HP damage is
  invisible to it however many chapters it walks. Proven: dropping `webZone` from
  `SUBMISSION_STRIP_FLAGS` leaves SB.a **green**, because a web slows and never hurts.
  **The oil trail is `dmgPerTick: 0` by ruling — so it is exactly that kind of affix.** A submitted
  elite dragging oil walls across the field would pass SB.a silently. Part 3 must therefore ship its
  own assertion: the flag is stripped, or the ally lays no `look:'bilge'` bloom. Do not rely on
  SB.a's pass.
- **PLAUSIBLE, unproven:** the stain line sits *inside* `if (bl.slow !== 0)` (`sim.js:8601`), so an
  elite trail set to `slow: 0` to avoid double-slowing would inherit avoidance but **not** the
  stain. Build the entity and check before assuming either way.

---

## 4. The cards

### 4.1 The vehicle

`PASSIVES` carries no chapter scoping. One optional `chapters` field plus one clause in
**`eligiblePassiveIds`** (`sim.js:11636`) — *not* `makePassiveCard`, and not the `passiveOpts` local
in `rollCard`. `devCards` (`sim.js:12037`) calls `makePassiveCard` directly to bypass eligibility on
purpose, so putting the clause in the card factory would break the dev menu.

**Two card-format constraints rev 1 violated:**

- **`makePassiveCard` GENERATES the desc**: `+${Math.round(bonus*100)}% ${cfg.desc}` for `pct`
  (`sim.js:11818`). Every shipped `PASSIVES[].desc` is a **noun fragment** — `'move speed'`,
  `'gem magnet'`, `'armor (flat damage block)'`. Rev 1's sentences would have rendered as
  *"+15% Oil and ink drag on you less."* All three descs below are noun fragments.
- **The icon is hardcoded `'💪'`** (`sim.js:11822`) and `PASSIVES` entries carry no icon field.
  Three chapter-identity cards with a generic bicep. **Add an optional `icon` on the entry** and
  read it — one line, and the alternative is shipping the chapter's signature cards looking like
  every global stat.

**A boolean cannot be a passive.** Passives stack to `MAX_PASSIVE_LEVEL` 5 and accumulate
`run.passives[id] += bonus`. That is why rev 1's `Low Profile` is dead: offered five times, printing
`+1 …`, doing nothing after the first pick — the inert-card class, and **MB.a only covers weapon
mods, so nothing goes red.** It was also a duplicate: `ANOMALIES.deadfall` is already *"Snap traps
ignore you, and re-arm 5 times faster."*

### 4.2 The three cards

All three point at the oil, which is both the chapter's best hunting tool and its biggest killer.

| card | desc (noun fragment) | renders as | site |
|---|---|---|---|
| **Sleek** | `resistance to slows` | *"+15% resistance to slows"* | the `Math.min` in `stepPlayerMovement` |
| **Oilskin** | `resistance to the Leak's burn` | *"+20% resistance to the Leak's burn"* | `stepSlick`'s `SLICK_DPS` tick |
| **Slick Feed** | `damage to oil-stained prey` | *"+18% damage to oil-stained prey"* | the bite's damage resolution, reading `e.oiled` |

**Slick Feed is the card that pays**, per the round-3 ruling. It rewards the loop the review proved
is the chapter's real working mechanic — drive fish through oil, they come out permanently slower,
now they also take more from you. It is the exact opposite of rev 1's Part 1: rather than replacing
the stain play, it doubles down on it.

**`Sleek` is honest, and it does not violate the `Math.min` reasoning.** Exactly two of the nine
composed terms are reachable in this chapter: `foulMul` (the Leak) and `inkMul` (the squid).
`latchMul` needs the `latch` flag (not in this roster), `webMul` needs `webZone` (this chapter is
`soapTrail`), `_bindSlow` is The Blank's boss, `darkMul`/`tireMul` need `resource.dark`/`.tire`,
`sandMul` needs `signature.type === 'tide'`, `scrapeMul` is Reef spurs. And the five comment blocks
around that `Math.min` forbid a chapter's own slow **multiplying** with latch/web — a post-min
resist does not do that.

**Three things that must be specified or the pair breaks:**

1. **Diminishing returns, not a clamp** (ruled 2026-08-24). `run.passives[id] += bonus` is uncapped
   (`sim.js:361`), so base 0.15 × mythic 6.5 × 5 picks = **4.875** — read raw, `1 - (1 - slowMul)
   (1 - 4.875) > 1` is **a speed bonus for standing in oil.**
   *(An earlier revision said 2.1 here. That was wrong arithmetic, inherited from the adversarial
   review and propagated unchecked; the implementer caught it. 0.15 × 6.5 × 5 = 4.875.)*
   A hard clamp at 1 was rejected: it stops the speed bonus but still permits **total immunity**,
   and at 0.975 from a single mythic pick that is a lucky roll rather than a build. The shipped form
   is asymptotic — `resistFrac(r) = r / (r + PASSIVE_RESIST_K)`, K = 1 — so every pick is worth less
   than the last and **the toll never reaches zero**. The chapter's central hazard cannot be switched
   off, however invested you are. Curve: 0.15 → 0.130, 0.975 (one mythic) → 0.494, 4.875 (five
   mythic) → 0.830.
2. **An integer tick quantises a percentage resist into nothing at the low end.** `SLICK_DPS` 6 ×
   `SLICK_TICK` 0.5 = 3, and `hurtPlayer` rounds a dot — so a resist must clear 1/6 of the tick just
   to move it by one. `resistFrac(0.20)` is 0.1667, giving 2.50, which `Math.round` takes straight
   back to 3: **a first normal-rarity Oilskin pick was measurably inert**, with nothing red (MB.a
   covers weapon mods only). The fix is to carry the fractional damage between ticks and spend whole
   points, **not** to raise the base until it clears the boundary — `SLICK_DPS` is itself an unswept
   first cut and any re-tune would silently re-break the card. Any future percentage resist against
   a small integer tick has this same failure mode.
3. **Sleek + Oilskin together** are the whole toll of one hazard bought down by two cards in one
   bucket, both repeatable to 5. Under DR that is a genuine build rather than a switch, but it must
   still be priced in §5, not discovered.

### 4.3 Bucketing — ruled, because the default silently taxes `moveSpeed`

`DEFENSIVE_PASSIVES` is a hardcoded `['armor','regen','maxHP']` (`config.js:174`), and `rollCard`
picks uniformly inside a bucket (`sim.js:12148`) against a fixed `BUCKET_WEIGHTS`. Left alone, all
three new cards land in **utility**, taking that pool 7 → 10 in The Wreck — **every existing utility
passive loses 30% of its offer rate there**, `moveSpeed` included, which the previous spec named as
the stat that dismantles this chapter's premise.

**Ruled: split them by what they are.**

- **Sleek and Oilskin join `DEFENSIVE_PASSIVES`** — they reduce harm. Defense goes 3 → 5.
- **Slick Feed stays utility** — it is a damage card. Utility goes 7 → 8, a 14% dilution rather than
  30%.

Two consequences that follow and are wanted:

- **BRITTLE now voids Sleek and Oilskin**, because it voids the whole defensive bucket. That is
  correct rather than collateral: at `maxHP` 1 a single `SLICK_DPS` tick kills you regardless of any
  resistance, so both cards are genuinely dead under that anomaly and leaving them in the pool would
  be the "offers a card that does nothing" failure BRITTLE's own block argues against.
- **Defensive passives are weighted heavier inside their bucket**, so the chapter's own cards are
  seen more often than a utility slot would have shown them.

`DEFENSIVE_PASSIVES` is a flat array with no chapter awareness, so adding two ids to it names them
defensive in **every** chapter. That is safe here, and by construction rather than by luck: the
bucket split at `sim.js:12134` runs on `passiveOpts`, which derives from `eligiblePassiveIds` — so
the chapter scope filter has already removed them everywhere else before `defenseOpts` is built. The
ordering is correct as shipped; it just must not be inverted by whoever adds the clause.

### 4.4 What is fine (walked, so nobody re-walks it)

- `run.passives` / `run.passivePicks` initialisation: built from `Object.keys(PASSIVES)` every run
  (`state.js:2281`). No save migration — run state is not persisted.
- run XX's i18n walk already covers `PASSIVES` for `name`/`desc` (`test/sim-test.js:17229`).
- BRITTLE / BLIND FAITH / BLOOD PACT: none touch these three, as long as they carry no `values`
  table.
- The shop: `SHOP` and `PASSIVES` are separate namespaces and already share keys.
- **Id collisions, stated correctly.** The review called this a gap "in the reverse direction"; it
  is not. `takenIds` (`test/sim-test.js:2064`) is
  `WEAPONS ∪ PASSIVES ∪ ELEMENTS ∪ WEAPON_MODS`, and every anomaly id is asserted against it — so a
  new passive colliding with this design's new anomaly **is** caught, whichever was added first.
  Collision is symmetric; the direction does not matter.
  **The actual uncovered case** is a new passive colliding with a WEAPON, ELEMENT or MOD id:
  `takenIds` is a `Set`, so duplicates *among those four* are swallowed at construction and nothing
  asserts within it. This design adds three passive ids, so grep all four namespaces for `sleek`,
  `oilskin` and `slickFeed` by hand — the suite will not do it for you.

### 4.5 The owed anomaly and mutator

- **Anomaly** (`chapter: 'wreck'`, `kind: 'pivot'`) — **on the oil**, ruled. The Leak is everywhere
  and worse. It is the card that takes Sleek/Oilskin/Slick Feed from useful to load-bearing.
- **Mutator** (`chapters: ['wreck']`) — **on the settle**, ruled. The wreck groans constantly and
  plates re-arm on a fast beat. Richer coins, following the `trapseason`/`rushhour` idiom.

---

## 5. What must be measured

None of this may be quoted until run. **≥6 seeds, print every one, read the spread. Mortal arm for
anything about lethality; fixed loadout for anything comparative.**

1. **DONE — §1.1b is the canonical baseline.** 8 seeds, per-seed, all four arms, fixed loadout, zero
   fallbacks. Probe: `wreck-threat-spread-fixed.mjs`, run against a frozen `git archive` extraction
   so a concurrently-edited tree could not contaminate it. Diff every later change against 1.1b, not
   1.1.
2. **Rust's `chance`, `r` and cloud count — the single most important number in this document.**
   Ruled strong-and-rare, so the knob is scarcity and nothing else. Measure **what share of a run's
   kills happen inside one**, and **what share of the run the player spends in or adjacent to one**.
   If either is large, Rust is the chapter now and the ruling's accepted risk has landed. Also
   measure it against a **no-Rust control** — this is a mechanic whose whole value is what it
   PREVENTS (a fish escaping), and that needs a feature-removed arm, not a before/after.
3. **The plate field's `count`/`cell`/damage and the settle interval.** Trips per run, split player
   vs prey. A field that mostly catches the player is a tax; one that mostly catches prey is a gift.
   Both columns must be non-trivial.
4. **The elite oil trail** — does a walking wall visibly change where prey can go? If not, the affix
   is invisible and the swap is a pure downgrade with no compensating identity.
5. **Each card alone, on a fixed loadout**, measured by what it lets you *do* (kills/min, Bloodlust
   mean), not only by damage avoided. Then **Sleek + Oilskin together**, which is the pair that
   zeroes the oil's toll.
6. **The bucket split (§4.3)** — measure the realised offer rate of `moveSpeed` (utility) and of
   `armor`/`regen`/`maxHP` (defense) in The Wreck before and after. The split moves the tax from
   utility onto defense; confirm the defensive three do not drop below the rate that made them worth
   taking.
7. **The bar.** `CHAPTERS.wreck.resource`: *re-run the wreck sweep after ANY roster/chum/orca
   change; the number tracks the kill rate.* Rust and the plates both move it.
   `scripts/charge-probe.mjs --chapter wreck`, both `WRECK_MOVES` policies.

**Rig note, learned the hard way:** neither `hunt` nor `ignore` routes around anything — `hunt`
walks straight through oil, pools and the orca ring. Every hazard share they produce is an **upper
bound on a player who never routes**, and must not be spent as a budget. `ignore` is not a control
either: it travels ~216 px/s on a 629px orbit, i.e. the previous spec's measured-worst `circleWide`.

---

## 6. Tests

Assert effects, not state; mutation-prove each on a scratch tree (`git archive` to a temp dir —
never `git checkout src/sim.js` over a live edit).

- **Rust** — a prey body inside a rust cloud has `blindT > 0` **and its speed drops toward
  `PREY_DRIFT_MUL`**; the player's speed is unchanged by the same cloud. Do **not** assert "holds a
  heading" — measured, it turns 105° either way, so that assertion passes on a broken build.
- **`run.rust` streaming** — the field culls at distance. run CP covers the pool/clearWorld half.
- **Plates** — a plate trips on prey and on the player; the settle re-arms a sprung plate **and one
  held in `run._trapRearm`**; the damage carries the new `src` key, not `'trap'`.
- **The elite trail** — an elite carrying the flag lays a bloom a skittish body avoids *and* that
  stains it. Assert the spawned entity, never the config table.
- **Cards** — each changes the measured quantity at its own site. Assert the comparison or the
  effect; a grep for the field name is not a guard. Include the **clamp**: five mythic Sleek picks
  must not produce a speed above baseline in oil.
- **run SB.a's denominator** — change `CHAPTER_ORDER` to `Object.keys(CHAPTERS)` and confirm it goes
  red on removing the wreck's flag from `SUBMISSION_STRIP_FLAGS`. **This fixes a live pre-existing
  hole**, independent of everything else here.
- `node scripts/test-isolation.mjs` — every part changes how many randoms are drawn.

---

## 7. Explicitly out of scope

- **The Leak as a fence.** Ruled dropped, twice measured. Do not re-propose it without re-reading
  §1.2.
- **The 4th weapon** `chapter-stage.mjs` asks for. Hazards and upgrades only.
- **The level-up card's number localisation.** Found while extracting `passiveEffectText`: the
  card's `+N ` head has never been locale-formatted — `tCardDesc` translates the tail and passes the
  number through untouched, so French reads `+2.4` where the pause sheet reads `+2,4`. Pre-existing,
  on a different surface, and deliberately NOT bundled into a passive-cards commit. The composer now
  takes an injected formatter, so fixing it is passing one argument at the card's call site — but it
  affects every passive in the game and wants its own change and its own French check.
- **The orca.** Ruled: no card. Its share is untouched; this design does not reduce the chapter's
  peak damage and is not trying to.
- **A bubble curtain** (offered as the fence's replacement, not picked).
- **Rival scavengers.** Not picked.
- **`SLICK_DPS` 6** remains the unmeasured first cut the previous spec flagged. Oilskin puts
  pressure on it; retuning is a separate decision.
- **Global slow resistance.** Ruled wreck-only.
- **Chapter stage.** `played`/`art`/`fr` are all `YOU` and stay that way. Ship blockers, not
  paperwork.

---

## 8. Build order

Each step is shippable and measurable alone. Stop at any step whose measurement does not move.

1. **§5.1 — the honest baseline.** Nothing else can be costed until it exists. Rev 1 skipped this
   and every downstream number in it was wrong.
2. **§4.1's mechanism, plus Sleek and Oilskin.** The smallest thing that delivers the owner's own
   example, and both answer a hazard that already exists — neither is blocked on a later part.
   Includes the clamp and the §4.3 bucket decision.
3. **Slick Feed.** Needs only `e.oiled`, which is shipped.
4. **Part 2** (plates + the settle) with its own art, its own `src` key and the `run._trapRearm`
   sweep. The largest single piece of work here.
5. **Part 1** (Rust) — last of the hazards, because it is the strongest and the easiest to cut if
   §5.2 says it eats the chapter.
6. **Part 3** (the elite oil trail) **and the run SB.a denominator fix in the same commit**, then
   **§5.7 re-fit the bar**.
7. **§4.5** (anomaly + mutator), which closes the ideation axis.
