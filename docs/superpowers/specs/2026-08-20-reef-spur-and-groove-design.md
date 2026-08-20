# The Reef — spur and groove (level design)

Status: **owner rulings taken 2026-08-20**, spec at **rev 4** after three adversarial review rounds
the same day (18, 23 and 22 findings; 12 blockers). Extends
`2026-08-13-book-2-undertow-design.md` §6.3; it does not replace it. The roster, the palette and the
lane axis are unchanged — this spec is the **shape of the corridor**.

Scope: the level. The chapter's two native weapons (Squid Ink, Oxygen Tank), its anomaly and its
mutator are separate tasks, deliberately not designed here.

### Revision history

**Rev 1** — spacing 340px, a braid you commit to. Killed: at 340px you cross the whole lane between
spurs with 4s to spare, and a 260px air pocket does not fit in the 250px of clear water left.

**Rev 2** — derived a crossing bound; made a pocket a break in the reef. Both wrong. **No crossing
bound can exist**: the shop sells +40% `moveSpeed` and Zoomies adds +8%/pick uncapped, so any fixed
geometry is one purchase from false. And a pocket-shaped hole removes 73% of the lane's length.

**Rev 3** — replaced the bound with a forced choice "between the crowd and the coral", enforced by
funnelling enemies into the grooves. **The funnel inverted the very tension it existed to create.**
The scrape is 8 HP per spur = **1.71 dps, flat, armor-proof and difficulty-proof**, against
`SOAP_DPS` 6 and `drown.dps` 4 — so steering the crowd *out* of the coral made coral the cheapest
place in the chapter. The dominant line was: live in the coral, enter a groove only to breathe.

**Rev 4 deletes the funnel.** Enemies pass through spurs, so coral is **strictly worse** than a
groove — damage, no steering, and the crowd is still on you. That single deletion also resolves the
knockback-suspends-it-forever case, the `stepEnemySeparation` conflict (a full snap that beats any
capped push), and the silent voiding of `stepFormations`' world-anchored brick gaps. Rev 4 also adds
the braid-separation **floor** that stops a camping lane, makes the braid a **constant** rather than
a live viewport read, fixes the clam's period inequality (it was backwards), and derives the numbers
that rev 3 asserted.

---

## 1. Why this exists

The 2026-08-13 ruling said the Reef is three things:

> *"build it as a left-to-right scroller — you go up and down to **choose tunnels**, there are
> **traps**, and the button is a dash that **breaks an obvious weak point in a wall**."*

What shipped is a left-to-right scroller with **round coral heads scattered in an open corridor**,
air pockets on a cell grid, and a Burst that smashes whatever it touches.

| The ruling | Shipped | |
|---|---|---|
| choose tunnels | open lane, coral you shoulder past | ✗ |
| there are traps | none of this chapter's own | ✗ |
| dash breaks a weak point in a wall | dash breaks any obstacle; no wall, no weak point | ⚠ half |

The chapter plays. It plays as *The Beyond, sideways, retinted*. Hold the centre line forever and
you only ever lose air.

---

## 2. Spur and groove

**Spurs** are the coral ridges of a reef front; **grooves** the sand channels between them. From
directly overhead — this game's only camera — that formation *is* this level design. Both are free
as identifiers in `src/`: seven hits total (`terrain.js:260`, `render.js:565/1674/2374/3951/3986`,
`styles.css:1534`), every one of them prose.

A **spur** is a ridge spanning the lane with two **grooves** cut through it. The grooves braid.

```
                 scroll ←──────────────────

  ════════════════════════════  lane wall
   ███  ███  ███  ███  ███
   ░░░  ███  ███  ███  ███
   ███  ░░░  ░░░  ███  ░░░        ← upper groove
   ███  ███  ███  ░░░  ███
   ███  ███  ░░░  ███  ░░░        ← lower groove
   ░░░  ░░░  ███  ███  ███
   ███  ███  ███  ███  ███
  ════════════════════════════  lane wall
    A    B    C    D    E

  A    two grooves, far apart
  B    closing
  C    converging — still two, one ridge between
  D    MERGED. One groove, the narrowest
       point in the level (§10)
  E    split again
```

The lane walls are unbroken: `stepPlayerMovement` clamps to `±laneHalfWidth` every frame.

### 2.1 The tension, and why it survives any strafe speed

Rev 2 tried to make crossing the lane geometrically expensive. It cannot be done — `moveSpeed` is a
shop line and Zoomies is uncapped. Rev 3 tried to make the groove the dangerous place. That
backfired (see the revision history). What actually holds:

> Every 4.67 seconds the scroll carries you through a ridge. You are either **in a groove** — one of
> two specific cross positions, which the braid keeps moving — or **in coral**, where you take
> damage, cannot steer, **and the crowd is still on you**. Coral is never a refuge.
>
> So the choice is never *whether* to be in a groove. It is **which one**, every 4.67 seconds, and
> they differ by what is down them: the air (§5), the features (§4), and what got there first.

That is the owner's ruling — *"you go up and down to choose tunnels"* — stated as a loop. No speed
stat removes it, because speed lets you reach either groove; it never creates a third place.

Spacing is therefore a **pacing** knob and §7 sizes it as one. It is not a difficulty bound, because
no geometry can be one.

There is no pathfinding problem: nothing routes, and after rev 4 nothing collides either.

---

## 3. Hitting a spur

**You scrape through it.** Coral does not block, it grates.

- **`SPUR_DPS` on a tick, `dot: true`.** `hurtPlayer` floors a hit at 1 HP and rounds it, so a
  per-frame `4 × dt` becomes **1 HP sixty times a second** and kills a 100 HP player 1.7s into a
  2.0s spur. `DROWN_TICK`, `STARVE_TICK` and `SLICK_TICK` are the three precedents. The `dot` flag
  is the other half: the non-dot branch sets `p.invuln = PLAYER.invulnTime`, which would make
  scraping a **defensive** move — continuous invulnerability to contact damage while in coral.
- **It scales with the run.** `SPUR_DPS × dmgScale(run.time)`, the shipped idiom. A flat rate is
  1.7% of the bar per second at t=0 and 0.85% at t=300 (maxHP runs ~100→~200), i.e. it stops being
  a cost exactly when the chapter gets hard.
- **The tick fires on ENTRY, off a CARRIED accumulator.** Every shipped DoT zeroes on exit and
  ticks a period *after* entry, which makes clipping a groove edge for <0.5s free. But entry-ticking
  with a zeroed accumulator is worse — it charges a full tick per crossing with no cooldown, so a
  player oscillating on an edge (or shoved by a blowhole) pays 5×/s = 20 dps against a stated 4.
  Carrying the accumulator and firing on entry only when ≥ `SPUR_TICK` has elapsed since the last
  tick gives exact arithmetic with neither exploit.
- **Your strafe is slowed. The scroll is not.** The lane block forbids anything touching forward
  velocity. **It joins the `Math.min` at `sim.js:668`.** ⚠ The MIN takes the *strongest* slow, and
  every shipped value is 0.55–0.7 (`LATCH_SLOW_MUL` 0.55, `WEB_SLOW_MUL` 0.6, `SLICK_SLOW_MUL`
  0.62). Rev 3's 0.45 would have won every composition and made this chapter's own tank inert across
  43% of the lane — a latched moray contributing nothing. **0.6**, so a latched moray in coral is
  still the worst case at 0.55. It needs its own field: `p.slowT` is a boolean gate on a fixed
  multiplier and cannot carry 0.6.
- **It is bounded.** Forward motion never stops: 2.0s. Three review rounds tried to build a deadlock
  and could not.

**Or you press the button.** Burst clears a spur: `stepCrush` destroys coral within
`BURST_CRUSH_MUL 2.5 × PLAYER.radius` = 55px for the whole dash, so an empty-bar press sweeps
`BURST_DUR_MIN 0.30 × BURST_SPEED_MUL 9 × laneScroll 45` = 121.5px of travel **plus** 55px of reach
= **176.5px**. That is the real thickness ceiling — not rev 2's 121.5 (which ignored the reach) and
not rev 3's "no ceiling at all" (which ignored that §9.5 asserts one). §7's 90px clears it by 86.5.

### 3.1 Enemies pass through spurs

Rev 3 funnelled them and it inverted the chapter (revision history). **They pass through.** That
makes coral strictly worse than a groove on every axis at once, which is what §2.1 needs, and it
costs no algorithm.

It also leaves three shipped mechanisms alone that rev 3 would have broken:

- **`stepEnemySeparation` is a full snap** (`ENEMY_SEP_RESOLVE` = 1), and its own comment says it
  must be — *"a partial resolve equilibrates a dense knot at sub-pixel spread"*. Any capped terrain
  correction loses to it every frame.
- **`stepFormations` anchors its columns to the world** at `2·hw/6` pitch with alternate rows offset
  half a pitch, because *"the gaps are always in the same places, so you are choosing which gap to
  be in"* and *"a brick pattern, so holding one gap all the way through a multi-row wave never
  works"*. Funnelling collapsed all six columns onto the two groove positions and voided both.
- **`kb` is a decaying velocity, not an impulse** (`KB_DECAY_RATE` 6/s, zeroed below 0.5 px/s), so
  any weapon knocking back on a ≤1.2s cadence would have held the crowd permanently exempt.

⚠ **`soapTrail`, this chapter's elite flag, sets a floor on groove width.** `SOAP_R` 26 is a
*radius*, so the stripe is 52px wide, dropped every `SOAP_INTERVAL` 0.35s for `SOAP_DUR` 2.5s — a
continuous line, not a dot. A `PLAYER.radius` 22 body is 44px. Rev 3's 110px minimum groove left
110 − 52 − 44 = **14px of total slack**, which is threading, not dodging. §7's floor is 140px.
`SOAP_DPS` 6 also exceeds the scrape, so a soaped groove is genuinely worse than the coral beside
it — that is a real and interesting moment, and it is only fair if you can see it coming.

### 3.2 The hole Burst leaves

The streamer must not re-roll a crushed ridge while it is inside `OBSTACLE_STREAM_RADIUS`.
Permanence is not the reason — the lane advances monotonically, so a crushed band is behind you
within ~42s and never seen again.

**The spur field is one object per lane index `i`, not a 2-D grid.** A 210px grid across an 836.8px
lane is 3.98 cells, and you cannot cut a 140px groove out of a 210px cell. The ridge is indexed
along the lane only; its grooves come from the braid. That also gives the field a **1-D cursor**
instead of a 225-cell rescan every time a 275+ px/s strafe crosses a cross-axis boundary.

**The removal is a swept crush circle**, matching `stepCrush`, and it records `(i, band)` — `band`
being a quantised cross slot of stated width — in a **spur-owned registry**. Not `run._crushed`,
whose key is a bare `i + ',' + j` with no salt or grid identity.

⚠ This is a **fourth removal path**, not a reuse: `stepCrush` iterates `run.obstacles`, tests circle
overlap, splices, and pays a `CRUSH_XP` gem per removal. Decide the gem count for a multi-band sweep
deliberately.

### 3.3 The braid is a constant, not a viewport read

Rev 3 bounded braid amplitude by `min(hw, cross half-extent)`. Two errors:

- **`laneHalfWidth` does not change on rotate.** `viewRadius` is the half **diagonal**
  (`Math.hypot(w,h)/2`), which is rotation-invariant; `config.js` calls it *"orientation-blind by
  construction"*. Rev 3 said otherwise in the same document that said the opposite in §11.
- **Observer-dependent quantities must filter, never place.** `refillCircleAt` states the rule: the
  lane clamp and the streaming radius *"are about the OBSERVER rather than the field"*. Sizing the
  braid off the live viewport makes the spurs — and via §5.2 the pockets — **move on resize**, and
  §3.2's `(i, band)` key would name a different piece of reef afterwards.

**So the braid separation is a config constant**, chosen to satisfy both bounds at every supported
viewport with no runtime read:

```
floor    S > grooveWidthMax          (else a camping lane exists — see below)
ceiling  S/2 + grooveWidthMax/2  ≤  min(cross half-extent)
         240 + 100 = 340           ≤  400  (desktop 1280×800; phone is 422)
S = 480, grooves 140–200          ⇒  both hold, on both viewports
```

⚠ **The floor is what stops a permanent camping lane, and rev 3 had none.** For two grooves braiding
symmetrically with peak separation `S`, the cross position `±S/2` from the merge line sits **inside a
groove at every spur** whenever `S ≤ w`. Rev 3 permitted `w` up to 200 and gave no floor on `S`, so
any `S ≤ 200` handed the player a lane they never had to leave — and the obvious form of §9.4 (hold
the centre, assert damage) certifies it as healthy. `S > w_max` is the exact condition.

⚠ The **cap is on the groove's far edge, not its centre.** Rev 3 capped the centre, which at max
width put 100px of groove outside the wall the player is clamped to.

---

## 4. The features — owner ruling: "both and more"

Table name **`SPUR_FEATURES`**; `REEF_TRAPS` collides with the undergrowth's `run.traps` /
`streamTraps` / `SNAP_TRAP_*` / `DMG_SRC_NAME.trap`.

| Feature | What it does | Its job |
|---|---|---|
| **Clam** | A groove held by a giant clam that shuts on a slow rhythm | Makes a route **conditional** |
| **Fire coral** | A stinging patch inside the wide, obvious groove | Makes a route **cost something** |
| **Urchins** | A spiny stretch of spur; scraping *there* costs ×3 | Makes **where** you miss matter |
| **Blowhole** | A floor jet that shoves you hard across the lane | **Takes the wheel** for a second |

Renamed from *vent jet*: `jet` is taken four ways — `JET_BAKE_R`, `run.zones` `jet`/`jetDur` (Burst
Hydrant), the Skies' Fighter Jet, and two French values keyed on *Jet de …*. `blowhole` has zero
hits in `src/`.

**4.1 — At most ONE route-affecting feature per spur, and never on a merged groove.** Rev 3 banned
only the clam from a merge, which left fire coral in the single merged groove fully legal — the same
unplayability, arriving through a different table row. It also left a shut clam in groove A *and*
fire coral in groove B legal on the same spur, which fails §9.1 on ordinary placement rather than on
a mutation. One rule over the whole table fixes both.

**4.2 — A clam's period must be at least `2 × lookahead` = 13.9s, and rev 3 had this backwards.**
Lookahead is 312px ÷ 45 = 6.93s between first sight and arrival. For the state you *read* to be the
state you *meet*, the half-period must exceed the approach — so the period must be **longer**, not
shorter. Rev 3's "shorter than 6.93s" guaranteed the clam changed state during every approach,
making it exactly the timing puzzle §4 says it is not.

**4.3 — A shut clam is a spur.** Swim into one and you scrape. No new event, no new label, no art.

**4.4 — Two damage sources:** `scrape` (urchins are a ×3 multiplier on the same source) and
`fireCoral`. The blowhole shoves and does not damage.

⚠ **The blowhole needs its own lane re-clamp.** The wall clamp runs early in the step;
`stepLaneSolid` re-clamps at its own exit precisely because it moves the player later — *"the lane
wall outranks the coral, always"*. A shove after that point leaves the player outside the walls for
a frame.

---

## 5. Air, and the plume

### 5.1 A pocket interrupts the reef at its own cross band — stated plainly

Rev 1 put a pocket between spurs; it did not fit. Rev 2 deleted whole spurs; that removed 73% of the
lane. Rev 3 said the groove "widens locally", which is a euphemism: a 260px pocket on a 210/90 pitch
**consumes a whole ridge** at its band, or 70 of 90px from each of two.

**Say it as it is: a pocket is a sand bowl, 260px across, that interrupts one or two ridges within
its own 260px cross band and nothing outside it.** That band is 31% of the lane's width, so the
ridge survives above and below it and the corridor is never open wall-to-wall — which is the
property rev 2 lost and the only one that mattered. A pocket that lands between two ridges simply
sits in open water and interrupts neither.

### 5.2 The pocket rides its groove, clear of the centre

A pocket's cross position today comes from a pure cell hash (`cell: 640`, `|cross| ∈ [150, 490]` —
and 490 exceeds the phone's wall at 418.4). Under rev 4 it **is** its groove's cross position at
that lane index. That is a **placement change, not a filter**; rev 3 called it both.

**Clearance: the groove's centre must be ≥ `r + 20` = 150px from the centre line**, centre-to-centre
— exactly the shipped geometry (`refillCircleAt`'s slack is `cs/2 − r − 20`). **Not "≥ r":** RF.a and
RF.b both test `<= sh.r`, so `|cross| == r` *fails* both.

The reason is measured, not felt. The shipped ruling that the Reef has no tide says:

> *"across it (90 deg), the water walks a player who is not steering **205px sideways, into the air
> pockets (r 130) — RF.a's centre-line run ended on 93 of 100 Air instead of 0**."*

205px of *unintended* drift took a centre-holder from 0 Air to 93. A braid moves grooves further
than that by design, so a pocket riding a groove past the centre line hands the centre-holder free
air and collapses the 76%-at-zero vs 0%-at-zero gap that proves this bar is a map, not a clock.

⚠ **This can suppress pockets, and that needs a floor.** Where both grooves are inside ±150 — near
every merge — no pocket may spawn. In a chapter with exactly one refill source and a 71s
drain-to-empty, field density is a safety property. §9 asserts a floor on it.

### 5.3 The plume

A pocket emits a **plume**: bubbles the current carries back down its own groove to you. The plume
draws the groove — **you do not navigate the reef, you follow the plume.** (`PLUME_*`; `bubble`
collides with Bubble Puff and `breath` with Atomic Breath.)

It exists for the phone. The player sits at `LANE_CAMERA_FRAC` 0.8 along the viewport:

| | phone 390×844 | desktop 1280×800 |
|---|---|---|
| Lookahead | 312 px = **6.93 s** | 1024 px = **22.76 s** |
| Spur periods visible | 1.49 | 4.88 |
| `laneHalfWidth` | 418.4 | 430.0 |
| Cross half-extent | 422 | **400 — smaller than `hw`** |

On a desktop you see nearly five spurs and the pocket itself. On a phone the plume is the only thing
between the player and a coin flip.

This asymmetry is pre-existing and shared with The Beyond; two ponytail comments name it
(`laneScrollFor`'s and `LANE_HALF_W`'s). Both move The Beyond and need run LN re-captured with a
stated reason. Not this spec's job — naming them is.

⚠ **The blowhole must not read as a plume.** Plume: fine, steady, drifting down-lane toward you,
anchored to a pocket. Blowhole: violent column, static, pinned to the floor. If they are not
separable at distance the signpost lies, which is worse than no signpost.

### 5.4 The Air tune is PROVISIONAL

`drain 1.4, refill 9, killRefill 0.2, max 100, drown.dps 4` is unchanged **as a starting point**,
and rev 3 contradicted itself by calling it both settled and moved. §5.2 relocates every pocket, so
those numbers must be re-derived. §12 has a step for it.

**Both shipped `charge-probe` lane policies are invalid** — the "pick the rig for the question"
failure CLAUDE.md documents, which returns confident numbers instead of an error:

- `pocket` steers on a pure cross-reachability test with **no notion of terrain**: it drives through
  every spur, paying scrape damage it does not model, and never routes along a groove.
- `centre` holds the centre line, which under a braid is sometimes groove and sometimes coral.

**A third policy is required — `groove`: follow the plume, cross only at merges.** Report all three,
and state plainly that the two shipped rows are not comparable to their pre-spur values.

---

## 6. What gets cut

**The drifting rocks, in this chapter only.** A 200 px/s closing hazard for `ROCK_DMG` 20 every 3.4s,
on top of spurs, four features and a drowning clock. The blowhole does "knocks you off your line"
with a telegraph, on the chapter's own terms. The Beyond keeps its rocks.

⚠ **This red-lines run LX.d** (`rocksChecked > 0` over 30s) and makes its rock-geometry asserts dead
code. Restate it against `beyond`; do not delete it. Run LN is beyond-only and cannot see this
chapter.

⚠ **And it re-phases every seeded Reef scenario** — `stepRocks` draws **five** `Math.random()` per
rock, so RF.a–f all re-roll. Apply CLAUDE.md's protocol (is the assertion's subject even reachable
from the change? then re-run on another seed) rather than retuning the design to satisfy a band.

**The loose bommies too** (`obstacles: count 8, cell 620`) — otherwise the chapter has coral heads
that push the player out and coral ridges that do not, from one palette, with nothing telling them
apart.

⚠ **Cutting them makes `laneSolid: true` dead, and rev 3 named the wrong test.** RF.f and RF.e both
**hand-place their own colliders** (`run.obstacles.length = 0; … push(…)`), so both keep passing
while asserting a path no longer reachable in play — RF.e in particular pins a Burst removal path
§3.2 replaces. Decide explicitly: either drop `laneSolid` from the chapter and `stepLaneSolid` with
it (deletion preferred, and RF.e/RF.f go with them), or keep both with a written reason. Do not
leave a green test guarding dead code — the same defect §6 flags for LX.d.

---

## 7. The numbers

Phone 390×844 unless stated. Scroll `laneScroll` 45 px/s.

⚠ **Strafe is not one number.** `PLAYER.baseSpeed 220 × LANE_STRAFE_MUL 1.25` = 275 px/s fresh; a
maxed `moveSpeed` shop line makes it **385**; Zoomies (+8%/pick, uncapped) goes higher. Nothing below
is a difficulty bound — see §2.1.

| Knob | Start | Why that |
|---|---|---|
| `SPUR_SPACING` | **210 px** | **Pacing.** A choice every 4.67s, 1.49 periods visible on a phone so the next ridge is always on screen |
| `SPUR_THICK` | **90 px** | 2.0s inside. Ceiling is the empty-bar Burst's swept reach, 121.5 + 55 = **176.5px** (§3) |
| Groove width | **140–200 px** | Floor derived: `2·SOAP_R + 2·PLAYER.radius` = 96px is bare contact, so 140 leaves 44px of real slack (§3.1). ~40% of the lane open |
| `SPUR_BRAID_SEP` | **480 px** | Peak groove separation. **Constant, not a viewport read** (§3.3). Floor `> 200` kills the camping lane; ceiling `240 + 100 = 340 ≤ 400` keeps the far edge on screen at both viewports |
| Braid period | ~5 spurs | 23.3s, and a symmetric braid merges at **both** zero crossings — a merge every **11.7s**, not 23 |
| `SPUR_DPS` | **4**, × `dmgScale(run.time)` | Anchored against the other DoTs, which share its rules: `DROWN` 4, `SLICK` 6. Scales so it does not fade (§3) |
| `SPUR_TICK` | **0.5 s**, `dot: true`, entry tick off a carried accumulator | 4 × 0.5 = **2 HP exactly**; 4 ticks per spur = 8 HP; a clip costs 1 tick, an oscillation costs no more than committing (§3) |
| Urchin stretch | ×3 | 12 × 0.5 = **6 HP exactly** per tick = 24 HP for a full bad scrape |
| Scrape strafe | **×0.6** | Weaker than `LATCH_SLOW_MUL` 0.55, so the MIN still lets a latched moray bite (§3) |
| Pocket clearance | `r + 20` = 150 px | Centre-to-centre; RF.a/RF.b both test `<= r` (§5.2) |
| Clam period | **≥ 13.9 s** | `2 × lookahead ÷ laneScroll` on the phone (§4.2) |

Both tick products are exact integers — a config number `hurtPlayer` rounds is not the damage taken.

**43% of the lane's length is coral.** Dense, intentional, and the number most likely to be wrong
(§10).

⚠ **`dot: true` skips armor and `contactDmgTakenMul`**, which is why the scrape is anchored against
`DROWN`/`SLICK` and not against contact damage or `ROCK_DMG`. (`LANE_LEAK_DMG` is inert here — the
leak line gates on `march`, which no Reef enemy carries.)

⚠ **MARTYR detonates on DoT ticks**, deliberately, in `hurtPlayer`. A chapter that ticks the player
four times every 4.67s hands that anomaly a near-permanent aura. Measure it.

**None of this has been through a probe.** The gate is §9. Every knob is a named export in
`config.js`; none is typed into `sim.js`.

---

## 8. The whole code change

| Where | What |
|---|---|
| `config.js` | `CHAPTERS.reef.spurs` descriptor (spacing, thickness, groove band, braid separation + period, salt block **44+**). `SPUR_FEATURES` table. `SPUR_*`, `BLOWHOLE_*`, `PLUME_*` constants. `rocks: false`; `obstacles` and `laneSolid` removed (§6). |
| `sim.js` | `streamSpurs` (1-D cursor, §3.2). `stepSpurs` — carried-accumulator entry tick + strafe slow into the MIN. Gate in `stepRocks`. New swept Burst removal + spur-owned registry. |
| `render.js` | Spur bake, groove floor, four features, plume and blowhole emitters. Publish status into fields render.js **already reads**. |
| `state.js` | New `run.*` fields and the spur registry into the doc block. |
| `fr.js` | Every new string, same commit. |

**Four more sites, each with a shipped guard that goes red:**

- **`DMG_SRC_NAME` + `hazardThumbs` + `scripts/bake-cast.mjs`.** Each source (`scrape`, `fireCoral`)
  needs a labelled `hurtPlayer(…, 'x')` (run DA.d), a `DMG_SRC_NAME` row **plus French**, and a
  `src/cast/<src>.png` — or a written reason in `DMG_SRC_NO_ART`. Run DA.g asserts the partition is
  exact. `bake-cast.mjs` is hand-run.
- **`clearWorld`'s pool registry.** New pools go in the flat list **or** the rig block; the wrong
  choice sets a dead property with no throw and last run's entities stay on screen.
- **Pocket placement must consult the braid** (§5.2) — a new placement path; RF.a/RF.b counts move.
- **run XX's walk is a hardcoded list of tables.** `SPUR_FEATURES` is as invisible as a bare const
  until a line is added. Add it, watch it go red, then write the French.

### 8.1 The tell — a decision, not an omission

`hurtPlayer` pushes `{type:'hurt', dot:true}` and `main.js` does `if (e.dot) continue // DoT ticks
are silent`, so a scrape has **no sound**, and its only visual would be the red vignette the Air bar
already produces. **In the one chapter running two DoTs at once, the player could not tell coral
from drowning.**

- **Visual:** a distinct field render.js already reads — coral grit at the player, separate from the
  drown vignette.
- **Sound:** on **entering** coral, not per tick. A tick fires ~0.85×/s while scraping; an entry at
  most once per 4.67s, which is rare enough to bear one.
- **Burst-through** reuses `{type:'crush'}` — it already has a render case and an SFX entry.

---

## 9. What the suite has to pin

New label **`run RS`** — `run RF` is taken twice already. Every assertion mutation-proved on a
**scratch tree**, never the working one.

1. **Every spur has at least one groove passable WITHOUT DAMAGE**, with features live (§4.1). *(Not
   "passable": §3 makes every spur passable by definition, so that phrasing has no failing
   mutation.)*
2. **No cross position survives N consecutive spurs without a tick.** A **sweep over
   `[−hw, +hw]`** with the denominator printed — not one position. This is the camping-lane
   property (§3.3) and the obvious one-position form certifies the pathology as healthy.
3. **A merge occurs within N spurs** — the braid actually braids.
4. **The scrape never touches the forward scroll.** As an effect.
5. **An empty-bar Burst clears a 90px spur**, by the swept crush circle (§3.2), and the ceiling
   `SPUR_THICK ≤ BURST_DUR_MIN × BURST_SPEED_MUL × laneScroll + BURST_CRUSH_MUL × PLAYER.radius`
   holds. Two constants 500 lines apart.
6. **An oscillating player pays no more per second than a committing one** (§3's carried
   accumulator) — the exploit, as a test.
7. **Scrape + latch composes to 0.55, not 0.6** — the MIN ordering (§3), which this repo has shipped
   wrong before.
8. **A crushed band is not re-rolled** inside `OBSTACLE_STREAM_RADIUS`. *(The "registry is not
   `run._crushed`" half is a **source-text lint**, not a behavioural assert — with the bommies cut,
   nothing else writes that Set in a Reef run, so the behavioural version has no failing mutation.)*
9. **A pocket sits on its groove, centre ≥ `r + 20` from the centre line, and field density holds a
   floor** (§5.2's suppression case). Restate **both** RF.a (effect) and RF.b (geometry).
10. **Both grooves are on screen** at 390×844 **and** 1280×800 — and add **844×390** if portrait
    ever stops being enforced (§11).
11. **The Beyond is bit-identical** — run LN, re-run, **not re-baselined**.
12. **Run LX.d restated**; **RF.e / RF.f resolved** with `laneSolid` (§6).

**Ratios, not pixels.** Denominator printed in every sweep. Any probe comparison uses **several
seeds and a stated distribution**, never one seed against one seed — a behaviour change re-phases
the stream on both sides.

---

## 10. Risks

| Risk | Why it might bite | Answer |
|---|---|---|
| **43% coral is too dense** | narrow grooves, whole crowd in the lane | Most likely wrong number in §7. Widen the groove band first — spacing is only pacing. |
| **Coral is still too cheap** | `SPUR_DPS` 4 vs `SOAP_DPS` 6, `drown` 4 | The failure that killed rev 3. Now scaled by `dmgScale`; §5.4's `groove` policy measures whether a coral-dweller beats a groove-follower. If it does, the chapter is broken again. |
| **A merge is the most dangerous point** | one groove ⇒ ~20% open vs 40% | Stated: §2's figure labels D, §4.1 bans every feature there. |
| **Pocket suppression starves the bar** | §5.2 forbids pockets near merges | §9.9's density floor. |
| **Pocket re-placement moves the Air tune** | §5.2 is a new placement path | §5.4 marks the tune provisional; §12 has the re-derive step. |
| **The plume reads as decoration** | the game is full of ambient particles | Shoot it. A tell nobody reads is the same as no tell. |
| **The braid reads as random** | two drifting lines can look like noise | Judge in **map mode**, wide-area. A gameplay screenshot shows one ridge. |

---

## 11. Considered and cut

- **Funnelling enemies into the grooves** (rev 3). It made coral the safest place in the chapter,
  lost to `stepEnemySeparation`'s full snap, voided `stepFormations`' world-anchored gaps, and was
  suspended indefinitely by any knockback weapon. See the revision history.
- **A geometric crossing bound** (rev 2). Impossible — `moveSpeed` and Zoomies.
- **A pocket-shaped hole in the reef** (rev 2). 73% of the lane's length.
- **Loose bommies** (rev 1/2). Two collision rules, one palette.
- **Moray ambush hole / camouflaged stonefish.** Terrain that spawns enemies muddles "what is
  scenery" exactly when the plume is teaching the player to read scenery.
- **Currents.** ⚠ **Already ruled and recorded** — `config.js` carries eight lines under *"THE REEF
  HAS NO TIDE, deliberately (owner ruling, on these measurements)"*. That block's 205px measurement
  is load-bearing for §5.2.
- **Truly solid spurs.** Solid requires stopping forward motion; the lane promises it never stops.
- **A VERTICAL lane.** Owner reopened this 2026-08-20 — *"being an horizontal run is not a fixed
  decision. If vertical scrolled makes this easier and gameplay better, that's fine."* **Horizontal
  stays**, but not for rev 3's reason, which was wrong: a per-chapter `laneHalfW` override is the
  established idiom here (`laneScrollFor` is exactly that, added for exactly this chapter), so
  vertical would *not* have forced a change to The Beyond. The reasons that survive:
  - **The screen, not the lane.** This design needs `SPUR_BRAID_SEP` 480 + a 200px groove = **680px
    of cross range**. A portrait phone gives horizontal 844px across and vertical **390**. No
    per-chapter override buys screen that is not there.
  - **Vertical does not fix the clam.** Its 15.0s lookahead means §4.2's period floor rises to
    **30s**, not falls. Longer sight makes readability *harder* to satisfy, not easier.
  - The owner's own *"I know it's very different gameplay but I like varying."*
  ⚠ Horizontal's disqualifier is symmetric: on a **landscape phone** (844×390) the cross half-extent
  is 195 and this design does not fit either. `public/manifest.webmanifest` sets
  `"orientation": "portrait"`, but that is a PWA install hint, not a browser-tab lock. §9.10 adds the
  shot if that ever changes.

---

## 12. Build order

1. Spurs and grooves, streamed and drawn. Shoot in **map mode**; judge the braid.
2. The scrape (§3) and the swept Burst path (§3.2). Assertions 1–8, 10.
3. Pockets onto grooves, off the centre line (§5.1, §5.2) + the plume. Assertion 9.
4. **Re-derive the Air tune** (§5.4) with `charge-probe`'s new `groove` policy; report three rows
   over several seeds. This is the step rev 3 did not have.
5. The four features, one table, French, and the run XX line. Assertions 1 and 3 re-run with them live.
6. Cut the rocks and the bommies (§6). Resolve `laneSolid`, LX.d, RF.e/RF.f.
7. Balance pass on §7, with a probe, at both viewports. Confirm §10's "coral is still too cheap" row
   is closed by measurement, not by assertion.

Steps 1–4 are the chapter.
