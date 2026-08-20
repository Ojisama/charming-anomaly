# The Reef — spur and groove (level design)

Status: **owner rulings taken 2026-08-20**, spec at **rev 3** after two adversarial review rounds
the same day. Extends `2026-08-13-book-2-undertow-design.md` §6.3; it does not replace it. The Air
bar's tune, the roster, the palette and the lane axis are unchanged — this spec is the **shape of
the corridor** and nothing else.

Scope: the level. The chapter's two native weapons (Squid Ink, Oxygen Tank), its anomaly and its
mutator are separate tasks, deliberately not designed here.

### Revision history

**Rev 1** set spur spacing at 340px and claimed a braid you had to commit to. Two blockers killed
it: at 340px you cross the whole lane between spurs with 4s to spare, and an air pocket (260px
across) does not fit in the 250px of clear water that spacing leaves.

**Rev 2** derived the spacing from a crossing bound and made a pocket a break in the reef. Both
answers were wrong.

- **The crossing bound cannot exist.** Rev 2 derived against a fresh save's 275 px/s strafe. The
  shop's `moveSpeed` line is +4%/level to 10 levels, so a maxed build is 308 base = **385 px/s**,
  and Zoomies adds +8% a pick with **no cap**. No fixed geometry makes a crossing cost for a player
  who has bought speed. Rev 2 also derived against the wrong crossing — wall-to-wall, when there are
  no grooves at the walls; the widest a groove pair can ever be is `2·hw − w`, and every value in
  the band was already free at 210px spacing.
- **A pocket-shaped hole in the reef is a hole in the design.** A 260px pocket on a 210px pitch
  deletes one spur 33% of the time and two 67%, and pockets arrive about every 640px of lane. That
  is **73% of the lane's length with no reef in it.**

**Rev 3 stops trying to forbid the crossing.** §2.1 states the tension that actually holds, and it
holds at any strafe speed. Spacing becomes a pacing knob and says so. A pocket is a **local
widening of a groove**, not a hole. Enemy solidity gets a specified algorithm instead of a claim.
The loose bommies are cut. Four names that collided were renamed.

---

## 1. Why this exists

The 2026-08-13 ruling said the Reef is three things:

> *"build it as a left-to-right scroller — you go up and down to **choose tunnels**, there are
> **traps**, and the button is a dash that **breaks an obvious weak point in a wall**."*

What shipped is a left-to-right scroller with **round coral heads scattered in an open corridor**,
air pockets on a cell grid, and a Burst that smashes whatever it happens to touch.

| The ruling | Shipped | |
|---|---|---|
| choose tunnels | open lane, coral you shoulder past | ✗ |
| there are traps | none of this chapter's own | ✗ |
| dash breaks a weak point in a wall | dash breaks any obstacle; no wall, no weak point | ⚠ half |

The chapter plays. It plays as *The Beyond, sideways, retinted*. Every decision the cross axis
offers today is optional — hold the centre line forever and you only ever lose air.

*(The Beyond's drifting rocks do reach this chapter; §6 cuts them. They are a hazard, not one of
this chapter's traps.)*

---

## 2. Spur and groove

**Spurs** are the coral ridges that run out from a reef front; **grooves** are the sand channels
between them. From directly overhead — this game's only camera — that formation *is* this level
design. Both are free as identifiers in `src/` (one prose hit, `render.js:565`).

A **spur** is a ridge spanning the lane with two **grooves** cut through it. The grooves braid: each
is a slowly-drifting cross position along the lane; they wander apart, converge, merge, split again.

```
                 scroll ←──────────────────

  ════════════════════════════  lane wall
   ███  ███  ███  ███  ███
   ░░░  ░░░  ███  ███  ░░░        ← upper groove
   ███  ███  ░░░  ░░░  ███
   ░░░  ░░░  ░░░  ███  ░░░        ← lower groove
   ███  ███  ███  ███  ███
  ════════════════════════════  lane wall
    A    B    C    D    E

  A,B  two grooves, far apart
  C    converging — now adjacent
  D    MERGED. One groove, and the
       narrowest point in the level (§10)
  E    split again
```

The lane walls are unbroken: `stepPlayerMovement` clamps to `±laneHalfWidth` every frame.

### 2.1 The tension — and why it does not depend on how fast you are

Rev 2 tried to make crossing the lane geometrically expensive. It cannot be done: `moveSpeed` is a
shop line and Zoomies is an uncapped passive, so any bound is one purchase from false.

**The property that actually holds, at any strafe speed, is this:**

> Every 4.67 seconds, the scroll carries you through a spur. At that moment you are either **in a
> groove** — where §3.1 has funnelled the entire crowd — or **in coral**, taking damage and unable
> to manoeuvre. There is no third place, and no amount of speed creates one.

So the chapter is a repeating forced choice between **the crowd and the coral**, arriving on a
metronome. A fast player does not escape it; they simply get to pick which groove. That is what the
cross axis is for, and it is what the bubbles (§5.3), the traps (§4) and the air (§5) are all
arguing about.

Spacing is therefore a **pacing** knob — how often the choice arrives — and §7 sizes it as one. It
is not load-bearing for difficulty, and rev 2's derivation claiming otherwise is deleted.

There is no pathfinding problem. `lane` retired that before this design existed, and §3.1's enemy
handling is a push-out, not a route.

---

## 3. Hitting a spur

**You scrape through it.** Coral does not block, it grates.

- **Chip damage on a tick, not per frame.** `SPUR_TICK = 0.5`, `dot: true`. `hurtPlayer` floors a
  hit at 1 HP and rounds it, so a per-frame `4 × dt` becomes **1 HP sixty times a second** and kills
  a 100 HP player 1.7s into a 2.0s spur. `DROWN_TICK`, `STARVE_TICK` and `SLICK_TICK` are the three
  precedents. The `dot` flag is the other half: the non-dot branch sets `p.invuln =
  PLAYER.invulnTime`, which would make scraping a **defensive** move — continuous invulnerability
  to contact damage for as long as you stay in coral.
- **It ticks on ENTRY, then every `SPUR_TICK`.** Every shipped DoT accumulator zeroes on exit and
  fires its first tick a full period *after* entry, which makes clipping a groove edge for under
  0.5s **free** — a dodge that costs nothing, which is §10's "spurs become optional" risk arriving
  through a side door. Ticking on entry closes it and makes the arithmetic exact: a 2.0s traversal
  is 4 ticks (t = 0, 0.5, 1.0, 1.5), a clip is 1.
- **Your strafe is slowed. The scroll is not.** Inside a spur you cannot manoeuvre. It is also the
  only legal slow — the lane block forbids anything touching the forward velocity. **It joins the
  `Math.min` at `sim.js:668`, it does not multiply.** The moray carries `latch` (`LATCH_SLOW_MUL`
  0.55), so a multiplied scrape would be 0.2475 and every latch in this chapter would be strictly
  nastier than the identical one elsewhere. It needs its own field: `p.slowT` is a boolean gate on a
  fixed multiplier and cannot carry 0.45.
- **It is bounded.** Forward motion never stops, so a scrape always ends: thickness ÷ scroll = 2.0s.
  Two review rounds tried to construct a deadlock and could not.

**Or you press the button.** Burst clears a spur — `stepCrush` destroys coral within
`BURST_CRUSH_MUL 2.5 × PLAYER.radius` = 55px for the whole dash, so the dash *removes* the ridge
ahead of it rather than having to outlast it.

⚠ **Rev 2 claimed spur thickness had a structural ceiling. It does not.** `BURST_DUR_MIN`'s block
says the no-spiral floor exists because *"in a lane where the coral is SOLID 'trapped' is a thing
that can actually happen"* — and spurs are not solid. A thicker spur costs one more tick; it never
traps. The 121.5px figure measures the wrong thing. Thickness is a **damage budget**, nothing more.

### 3.1 Enemies are funnelled by spurs — the algorithm, not the claim

Rev 1 let enemies pass through, borrowing `laneSolid`'s reason: a rank shoved apart by terrain stops
reading as a rank.

**The Reef has no marchers.** `stepFormations` forces `rosterId: 'invader'`, and its own comment
names this chapter — *"The Reef, until it has a marcher of its own"* — falling through to the
ordinary roster pick. `march` is Beyond-only. So the rank-cohesion argument does not apply here.

⚠ **But `stepFormations` still fires**, gated only on `lane`: six damselfish every
`FORMATION_INTERVAL` 4.4s, spread across the full lane, up to three rows, 700px ahead. With 43% of
the lane's length in coral, **whole rows are born inside a spur.** That case is part of the spec
below, not an edge to discover later.

**The rule:** a spur applies a **cross-axis-only correction to enemies**, capped per frame, and
never touches their forward speed.

1. **Cross-only, capped.** An uncapped solve snaps an enemy up to ~200px sideways in one frame —
   a lateral teleport, and exactly the class of move `stepLaneSolid` forbids for the player. Cap the
   correction at a stated px/frame so the crowd *slides* into a groove over several frames.
2. **Forward untouched.** Enemies close along the lane, so this never stops one; it steers them.
   That is the intent: the crowd ends up **in the grooves**, which is what makes §2.1's choice a
   choice.
3. **Born inside** — an enemy spawned inside a spur is stepped out over the same capped frames, in
   whichever cross direction is nearer, rather than resolved instantly.
4. **Mid-leap is exempt.** A `pounce` lionfish crosses a 90px spur regardless; a fish leaping a
   ridge is the correct reading, not a bug. `latch`, once attached, rides the player wherever the
   player goes, coral included.
5. **Knockback** (weapons, and Burst's shove) may push an enemy into a spur. The cap applies on the
   way out; it must not fight the knockback into a jitter, so the correction yields while a
   knockback impulse is live.

⚠ **This inverts the tactical reading, deliberately.** A spur does not give the player cover — it
aims the crowd at the two cross positions the player must occupy. That is §2.1's whole point: the
groove is the road *and* the fight. If playtesting says it is miserable, the fix is fewer enemies,
not permeable coral.

⚠ **`soapTrail`, this chapter's elite flag, is unmodelled.** `SOAP_R` is 26px, dodgeable inside a
110–200px groove — the stacking rev 2 worried about does not happen. The real case is an elite
travelling down a **merged** groove, laying a dotted line along the level's only route. That is the
dynamic form of §4's static clam ban, and §4's ban cannot bind it.

### 3.2 The hole Burst leaves

The streamer must not re-roll a crushed ridge while it is still inside `OBSTACLE_STREAM_RADIUS`.
(Permanence is not the reason — the lane advances monotonically, so a crushed cell is behind you
within ~42s and never seen again.)

**The spur field is one object per lane index `i`, not a 2-D grid.** Rev 2 said "spurs on cell 210",
which cannot express the geometry: a 210px grid across an 836.8px lane is 3.98 cells, and you cannot
cut a 110px groove out of a 210px cell. The ridge is indexed along the lane only; its grooves come
from the braid function. That also fixes §8's streaming cost — a 1-D cursor along the lane, not a
225-cell rescan every time a 275 px/s strafe crosses a cross-axis boundary.

A Burst therefore records `(i, band)` where `band` is a quantised cross slot of stated width, in a
**spur-owned registry**, not `run._crushed`. That Set's key is a bare `i + ',' + j` with no salt and
no grid identity, so sharing it across fields on different cell sizes deletes things silently.

⚠ **This is a fourth removal path, not a reuse.** `stepCrush` iterates `run.obstacles`, tests circle
overlap, splices from that array and pays a `CRUSH_XP` gem per removal. A spur is a different shape
in a different array; decide the gem count deliberately rather than inheriting one per band.

### 3.3 Groove positions are fractions, and the cap is not `hw`

`laneHalfWidth` is `min(LANE_HALF_W 430, viewRadius × 0.9)` — **418.4 on a phone, 430.0 on a
desktop** — recomputed every frame and changing on rotate. An absolute cross coordinate is inside
the lane on one viewport and outside the clamp on the other.

But a fraction of `hw` is **not enough**, and this is the trap `LANE_HALF_W`'s own ponytail comment
names: `viewRadius` is the half **diagonal**, orientation-blind. On a 1280×800 desktop the cap binds
at 430 while the cross half-extent is only 400 — so a groove at `0.95·hw` = 408px is legal,
reachable, and **8px off the bottom of the screen**.

**Braid amplitude is bounded by `min(hw, cross half-extent)`**, and §9 asserts both grooves are
**on screen**, not merely inside the walls, at both viewports.

---

## 4. The traps — owner ruling: "both and more"

Four, each doing a different job. Table name **`SPUR_FEATURES`** — `REEF_TRAPS` collides with the
undergrowth's shipped `run.traps` / `streamTraps` / `SNAP_TRAP_*` / `DMG_SRC_NAME.trap`.

| Trap | What it does | Its job |
|---|---|---|
| **Clam** | A groove held by a giant clam that shuts on a slow rhythm | Makes a route **conditional** |
| **Fire coral** | A stinging patch inside the wide, obvious groove | Makes a route **cost something** |
| **Urchins** | A spiny stretch of spur; scraping *there* costs ×3 | Makes **where** you miss matter |
| **Blowhole** | A floor jet that shoves you hard across the lane | **Takes the wheel** for a second |

**Renamed from "vent jet".** `jet` is taken four ways — `JET_BAKE_R`, `run.zones` `jet`/`jetDur`
(Burst Hydrant), the Skies' Fighter Jet, and two French values already keyed on *Jet de …*.
`blowhole` has zero hits in `src/`.

**The clam is not a timing puzzle, deliberately.** You cannot slow down in a lane, so you cannot
wait one out. You read it at distance and take the other groove, or Burst through before it closes.

**4.1 — A clam may never sit on a merged groove.** At a merge there is one groove; a clam there
makes every route through that spur a damaging one.

**4.2 — A clam's period must be shorter than the phone's lookahead** (6.93s), or "read it at
distance" is false on the device the game ships to.

**4.3 — A shut clam is a spur, not a new damage source.** Swim into one and you scrape. No new
event, no new label, no new art.

**4.4 — Damage sources are two, not four:** `scrape` (urchins are a ×3 multiplier on the same
source) and `fireCoral`. The blowhole shoves and does not damage. §8 lists the four sites each one
must reach.

⚠ **The blowhole needs its own lane re-clamp.** The wall clamp runs early in the step;
`stepLaneSolid` re-clamps at its own exit precisely because it moves the player later — *"the lane
wall outranks the coral, always"*. A shove applied after that puts the player outside the walls for
a frame.

---

## 5. Air, and the plume

### 5.1 A pocket is a groove that widens, not a hole in the reef

Rev 1 placed a pocket between spurs; it did not fit. Rev 2 deleted the spurs where a pocket sat,
which removes 73% of the reef.

**Rev 3: the groove balloons.** Where a pocket sits, that groove locally widens to hold it — a sand
bowl in the ridge. The spur is still there, the ridge is unbroken above and below, and the pocket
keeps `r` 130 with the Air tune untouched. The break spans the pocket's own cross extent and nothing
more.

### 5.2 The pocket moves onto its groove, and stays clear of the centre

**This is a placement change, not a filter, and rev 2 called it both.** A pocket's cross position
today comes from a pure cell hash (`cell: 640`, `|cross| ∈ [150, 490]`) that knows nothing of any
other field — and 490 exceeds the phone's wall at 418.4. Under rev 3 the pocket's cross position
**is** its groove's cross position at that lane index.

⚠ **Consequence to budget for:** every measured number in `CHAPTERS.reef.resource` and both RF.a and
RF.b counts move with it. §9 lists the re-measure.

**The clearance rule, and the boundary matters.** The shipped ruling that **the Reef has no tide**
is on measurements:

> *"across it (90 deg), the water walks a player who is not steering **205px sideways, into the air
> pockets (r 130) — RF.a's centre-line run ended on 93 of 100 Air instead of 0**."*

205px of *unintended* drift took a centre-holder from 0 Air to 93. A braid moves grooves further
than that by design, so a pocket riding a groove past the centre line hands the centre-holder free
air and collapses the 76%-at-zero vs 0%-at-zero gap that proves this bar is a map and not a clock.

**Rule: a pocket spawns only where its groove's centre is at least `r + 20` from the centre line**
— that is 150px, centre-to-centre, which is exactly the shipped geometry (`refillCircleAt`'s slack
is `cs/2 − r − 20`). **Not "at least `r`":** RF.a and RF.b both test `<= sh.r`, so `|cross| == r`
*fails* both. The 20px is the margin the shipped chapter already keeps and rev 2 quietly spent.

### 5.3 The plume, and what it is actually for

A pocket emits a **plume** — bubbles the current carries back down its own groove to you. The plume
draws the groove: **you do not navigate the reef, you follow the plume.**

Named `PLUME_*`; `bubble` collides with the Bubble Puff weapon and `breath` with the Skies' Atomic
Breath.

**It exists for the phone, and the spec says so rather than pretending otherwise.** The player sits
at `LANE_CAMERA_FRAC` 0.8 along the viewport, so lookahead is 0.8 × screen width:

| | phone 390×844 | desktop 1280×800 |
|---|---|---|
| Lookahead | 312 px = **6.93 s** | 1024 px = **22.76 s** |
| Spur periods visible | 1.49 | 4.88 |
| Lane half-width | 418.4 | 430.0 |
| Cross half-extent | 422 | **400 — smaller than `hw`** (§3.3) |

On a desktop you see nearly five spurs and the pocket itself; the plume is redundant there and
harmless. On a phone it is the only thing between the player and a coin flip.

This asymmetry is **pre-existing and shared with The Beyond**. Two ponytail comments name it —
`laneScrollFor`'s (the scroll should derive from a shared warning time and the live viewport) and
`LANE_HALF_W`'s (the lane should measure the axis it is actually across). Both move The Beyond and
need run LN re-captured with a stated reason. Not this spec's job; naming them is.

⚠ **The blowhole must not read as a plume.** Both are bubbles and one is a lie about the other.
Plume: fine, steady, drifting down-lane toward you, anchored to a pocket. Blowhole: violent column,
static, pinned to the floor. If they are not separable at distance the signpost lies, which is worse
than no signpost.

### 5.4 The Air tune stands — and the shipped rig can no longer measure it

`drain 1.4, refill 9, killRefill 0.2, max 100, drown.dps 4` is unchanged.

**But `charge-probe`'s two lane policies are invalid**, which is the "pick the rig for the question"
failure CLAUDE.md documents — the one that returns confident numbers instead of an error:

- `pocket` steers on a pure cross-reachability test with **no notion of terrain**. It drives through
  every spur, paying scrape damage it does not model, and never routes along a groove.
- `centre` holds the centre line, which under a braid is sometimes groove and sometimes coral. The
  row stops meaning "a player who has not learned the chapter" and starts meaning "a player who
  scrapes constantly".

**A third policy is required — `groove`: follow the plume, cross only at merges.** Report `centre`,
`pocket` and `groove` together, and state plainly that the two shipped rows are **not comparable to
their pre-spur values**.

---

## 6. What gets cut

**The drifting rocks, in this chapter only.** `ROCK_INTERVAL 3.4`, `ROCK_MAX_LIVE 5`, `ROCK_SPEED
155` down-lane against your 45 up-lane — a 200 px/s closing hazard for `ROCK_DMG 20` every few
seconds. With spurs, four traps and a drowning clock the corridor is full, and the blowhole does
"something knocks you off your line" with a telegraph, on the chapter's own terms.

The Beyond keeps its rocks.

⚠ **This red-lines run LX.d**, which asserts `rocksChecked > 0` over 30s — a hard fail the moment
`rocks: false` lands, and whose rock-geometry asserts become dead code. Restate it (move the rock
half to `beyond`), do not delete it. **Run LN is beyond-only and cannot see this chapter**; rev 1
named the wrong test.

⚠ **And it re-phases every seeded Reef scenario.** `stepRocks` draws **five** `Math.random()` per
rock, so removing them re-rolls every sampled statistic in RF.a–f. Expect red bands unrelated to
correctness, and apply CLAUDE.md's protocol — ask whether the assertion's subject is reachable from
the change, then re-run on a different seed — rather than retuning the design to satisfy them.

**The loose bommies too** (`obstacles: count 8, cell 620`). Rev 2 kept them because they were free.
They are not: after §3.1 the chapter would have coral heads the crowd swims through and coral ridges
it cannot, drawn from the same `BIOME_REEF` palette, with nothing telling the player which is which.
Cutting them makes the collision rule one rule, and removes the `run._crushed` key collision §3.2
would otherwise have to defend against. Reef texture comes from spurs and non-colliding props.

*(This leaves `RF.f` — which pins that enemy obstacle collision stays OFF in the lane — with no
obstacles in this chapter to observe. Restate it against The Beyond, or against the spur rule.)*

---

## 7. The numbers

Phone 390×844 unless stated. Scroll `laneScroll` 45 px/s.

⚠ **Strafe is not one number.** `PLAYER.baseSpeed 220 × LANE_STRAFE_MUL 1.25` = 275 px/s on a fresh
save; a maxed `moveSpeed` shop line (+4% × 10) makes it **385**; Zoomies (+8%/pick, uncapped) goes
higher. Every knob below is stated as pacing or as a damage budget for exactly this reason — see
§2.1. Nothing here is a difficulty bound, because no geometry can be one.

| Knob | Start | Why that |
|---|---|---|
| `SPUR_SPACING` | **210 px** | **Pacing.** A forced choice every 4.67s, with 1.49 periods visible on a phone so the next spur is always on screen |
| `SPUR_THICK` | **90 px** | 2.0s inside = a 4-tick damage budget. Not a structural bound (§3) |
| Groove width | 110–200 px | ~37% of the lane open (phone), 36% (desktop) |
| Braid amplitude | ≤ `min(hw, cross half-extent)` | §3.3 — a groove must be **on screen**, not merely inside the walls |
| Braid period | ~5 spurs | a merge about every 23s |
| `SPUR_TICK` | **0.5 s**, `dot: true`, ticks on entry | 4 dps × 0.5 = **2 HP exactly**; 4 ticks per spur = 8 HP of a 100 HP bar; a clip costs 1 tick, never 0 (§3) |
| Urchin stretch | ×3 | 12 × 0.5 = **6 HP exactly** per tick = 24 HP for a full bad scrape |
| Scrape strafe | ×0.45 | joins the `Math.min` at `sim.js:668`, never multiplies |
| Pocket clearance | `r + 20` = 150px | centre-to-centre; RF.a/RF.b both test `<= r` (§5.2) |

Both tick products are exact integers — a config number `hurtPlayer` rounds is not the damage the
player takes.

**43% of the lane's length is coral.** Dense, and intentional: a reef is mostly reef, the grooves
are the map. Also the number most likely to be wrong (§10).

⚠ **Anchor the scrape against the other DoTs, not against contact damage.** `dot: true` skips armor
**and** `contactDmgTakenMul`, so 8 HP is 8 HP at every difficulty and against every armor purchase,
while `ROCK_DMG` and lane contact both shrink with armor and grow with difficulty. The comparable
numbers are `DROWN` 4 dps and `SLICK` 6 dps, which live under the same rules. *(`LANE_LEAK_DMG` is
inert here — the leak line gates on `march`, which no Reef enemy carries.)*

⚠ **MARTYR detonates on DoT ticks**, by deliberate design in `hurtPlayer`. A chapter that ticks the
player four times per spur, every 4.67s, hands that anomaly a near-permanent aura. Measure it.

**None of this has been through a probe.** The gate is §9.

Every knob is a named export in `config.js`. None is typed into `sim.js`.

---

## 8. The whole code change

| Where | What |
|---|---|
| `config.js` | `CHAPTERS.reef.spurs` descriptor (spacing, thickness, groove band, braid period + amplitude cap, salt block **44+**). `SPUR_FEATURES` table. `SPUR_*`, `BLOWHOLE_*`, `PLUME_*` constants. `rocks: false`, `obstacles` removed. |
| `sim.js` | `streamSpurs` (1-D cursor along the lane, §3.2). `stepSpurs` — entry-tick damage + strafe slow into the MIN. Enemy correction (§3.1, five cases). Gate in `stepRocks`. New Burst removal path + spur-owned crushed registry. |
| `render.js` | Spur bake, groove floor, four features, plume and blowhole emitters. Publish status into fields render.js **already reads**. |
| `state.js` | New `run.*` fields and the spur registry into the doc block. |
| `fr.js` | Every new string, same commit. |

**Four more sites, each with a shipped guard that goes red:**

- **`DMG_SRC_NAME` + `hazardThumbs` + `scripts/bake-cast.mjs`.** Each damage source (`scrape`,
  `fireCoral`) needs a labelled `hurtPlayer(…, 'x')` (run DA.d), a `DMG_SRC_NAME` row **plus
  French**, and a `src/cast/<src>.png` baked from `hazardThumbs` — or a written reason in
  `DMG_SRC_NO_ART`. Run DA.g asserts that partition is exact. `bake-cast.mjs` is hand-run.
- **`clearWorld`'s pool registry.** New spur / feature / plume pools go in the flat list **or** the
  rig block; the wrong choice sets a dead property with no throw and last run's entities stay on
  screen. Run CP enforces membership, not the choice.
- **Pocket placement must consult the braid** (§5.2). It is a new placement path, and the shipped
  RF.a/RF.b counts move with it.
- **run XX's walk is a hardcoded list of named tables.** `SPUR_FEATURES` is as invisible as a bare
  const **until a line is added**. Add it, watch it go red, then write the French.

### 8.1 The tell — a deliberate decision, not an omission

Rev 2 said "no new events, cheapest way to satisfy run EV". That is the freeze scar's reasoning with
the sign flipped. `hurtPlayer` pushes `{type:'hurt', dot:true}` and `main.js` does `if (e.dot)
continue // DoT ticks are silent`, so a scrape would have **no sound**, and its only visual would be
the red vignette the Air bar already produces. **In the one chapter running two DoTs at once, the
player could not tell coral from drowning.**

- **Visual:** a distinct field render.js already reads, so scraping shows coral grit at the player,
  separate from the drown vignette.
- **Sound:** one on **entering** coral, not per tick. A tick fires ~0.85×/s while scraping; an entry
  fires at most once per 4.67s, which is rare enough to bear a sound.
- **Burst-through** reuses `{type:'crush'}` — it already has a render case and an SFX entry.

**`stepObstacles`'s early return stays.** Spurs are a new field under `laneSolid`'s restrictions,
not a lifting of the return.

---

## 9. What the suite has to pin

New label **`run RS`** (Reef Spurs) — `run RF` is taken twice already, so `RF.h` would be ambiguous.
Every assertion mutation-proved on a **scratch tree**, never the working one.

1. **Every spur has at least one groove passable WITHOUT DAMAGE**, asserted with clams live (§4.1)
   and at both viewports. *(Not "passable" — §3 makes every spur passable by definition, so that
   phrasing has no failing mutation.)*
2. **A merge occurs within N spurs** — the braid actually braids.
3. **The scrape never touches the forward scroll.** Asserted as an effect.
4. **A player holding a fixed cross position scrapes.** This is §2.1's forced choice, as a test: if
   a groove ever sits still long enough to be camped, the braid is not doing its job.
5. **An empty-bar Burst clears a spur** — by crushing, not by outlasting (§3).
6. **A crushed band is not re-rolled** while inside `OBSTACLE_STREAM_RADIUS`, and the spur registry
   is separate from `run._crushed`.
7. **A pocket sits on its groove, and its centre is ≥ `r + 20` from the centre line.** Restate
   **both** RF.a (the effect) and RF.b (the geometry) — both pin this, and rev 2 wrongly accused
   `config.js`'s comment of miscrediting RF.a.
8. **The funnel funnels, and nothing beaches.** Enemy cross positions cluster at grooves, and the
   crowd still reaches the player — both as a **ratio against a spurs-disabled control on the same
   seed**, never as a bare literal. Report **median nearest-enemy distance over the back half**, the
   metric CLAUDE.md prescribes for a wall; a contact count cannot tell "nothing reached me" from "I
   killed it first".
9. **Both grooves are on screen** at 390×844 **and** 1280×800 (§3.3).
10. **The Beyond is bit-identical** — run LN's golden master, re-run, **not re-baselined**.
11. **Run LX.d restated**, not deleted. **Run RF.f restated** — it observes obstacles this chapter
    no longer has (§6).

**Ratios, not pixels.** Denominator printed in every sweep's log line.

---

## 10. Risks

| Risk | Why it might bite | Answer |
|---|---|---|
| **43% coral is too dense** | narrow grooves with the whole crowd funnelled into them | The most likely wrong number in §7. Widen the groove band first — it is free, and spacing is only pacing. |
| **§3.1 makes the chapter miserable** | a spur aims the crowd at you, it does not shelter you | Stated as intent in §3.1. If play disagrees, cut enemy count — do **not** make coral permeable, which returns the chapter to rev 1. |
| **The funnel jitters** | capped correction vs knockback vs spawn-inside | §3.1 cases 1, 3, 5 exist for this. Assertion 8 measures it. |
| **A merge is the most dangerous point, not a free door** | one groove ⇒ ~18% open vs 37% | Say so — §2's figure labels D as the narrowest point, and §4.1 bans a clam there. |
| **Pocket re-placement moves the Air numbers** | §5.2 is a new placement path | Expected and budgeted. Three probe policies, reported together. |
| **The plume reads as decoration** | the game is full of ambient particles | Shoot it. A tell nobody reads is the same as no tell. |
| **The braid reads as random** | two drifting lines can look like noise | Judge it in **map mode**, wide-area. A gameplay screenshot shows one spur. |

*(Rev 2 offered a fallback — "solid only within a groove's width of a groove" — which is
geometrically inverted: it makes the walls permeable and a merge the *most* permeable point. Deleted
rather than corrected; §3.1's cases are the real answer.)*

---

## 11. Considered and cut

- **Moray ambush hole** — terrain that spawns enemies muddles "what is scenery" exactly when the
  plume is teaching the player to read scenery.
- **Camouflaged stonefish** — same reason, harder: the signposting depends on trusting terrain.
- **Currents.** ⚠ **Already ruled and already recorded** — `config.js` carries eight lines under
  *"THE REEF HAS NO TIDE, deliberately (owner ruling, on these measurements)"*. Rev 1 proposed a
  config note and a different, poetic reason; both were wrong. Nothing to do, and that block's
  205px measurement is load-bearing for §5.2.
- **Truly solid spurs.** Solid requires stopping forward motion; the lane promises it never stops.
- **Short commits** (~7s channels sized to the screen). Removes the coin-flip by removing the
  commitment, which removes the design.
- **A VERTICAL lane.** Owner reopened this 2026-08-20 — *"being an horizontal run is not a fixed
  decision. If vertical scrolled makes this easier and gameplay better, that's fine."* Closed on
  measurement: **horizontal stays.** `laneHalfWidth` is orientation-blind (418.3px on a phone either
  way), but the visible cross half-extent is not — 422px horizontal (the 844 axis) against 195px
  vertical (the 390 axis). A vertical Reef puts a lane **2.15× the screen width** on a portrait
  phone, so the far groove the player is choosing between is simply off screen. That is The Beyond's
  shipped bug, named in `LANE_HALF_W`'s own ponytail comment, and inheriting it would need that
  upgrade done first — which moves The Beyond and needs run LN re-baselined with a stated reason.
  Vertical does buy 675px of lookahead against horizontal's 312 (`0.8 × the forward screen axis`),
  and that is the one real argument for it — but the plume (§5.3) buys the same thing for the cost
  of a particle emitter, and a vertical Reef is The Beyond again, which loses the owner's own
  *"I know it's very different gameplay but I like varying."*
- **A geometric crossing bound** (rev 2). Impossible — see the revision history and §2.1.
- **A pocket-shaped hole in the reef** (rev 2). 73% of the lane; §5.1 replaced it.
- **Loose bommies** (rev 2 kept them). Two coral types with opposite collision rules and one palette.

---

## 12. Build order

1. Spurs and grooves, streamed and drawn, player-only. Shoot in **map mode**; judge the braid.
2. The scrape (§3) and the Burst path (§3.2). Assertions 1–7, 9.
3. Enemy funnelling (§3.1, all five cases). Assertion 8, against a control. **The change most
   likely to need reverting** — measure before and after.
4. Pockets onto grooves, off the centre line (§5.1, §5.2) + the plume. Add `charge-probe`'s `groove`
   policy; report three rows.
5. The four features, one table, French, and the run XX line.
6. Cut the rocks and the bommies (§6). Restate LX.d and RF.f. Expect re-phased Reef bands.
7. Balance pass on §7, with a probe, at both viewports.

Steps 1–3 are the chapter. Everything after is dressing that can ship separately.
