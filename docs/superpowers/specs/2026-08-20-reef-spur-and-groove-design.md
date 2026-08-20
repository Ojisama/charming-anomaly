# The Reef — spur and groove (level design)

Status: **owner rulings taken 2026-08-20**, spec at **rev 2** after adversarial review the same day.
Extends `2026-08-13-book-2-undertow-design.md` §6.3; it does not replace it. Nothing about the Air
bar's tune, the roster, the palette or the lane axis changes here — this spec is about the **shape
of the corridor** and nothing else.

Scope: the level. The chapter's two native weapons (Squid Ink, Oxygen Tank), its anomaly and its
mutator are separate tasks and are deliberately not designed here.

**Revision history.** Rev 1 set spur spacing at 340px and claimed a braid the player had to commit
to. Review showed the two blockers that killed it: at 340px the player can cross the whole lane
between spurs with 4s to spare, so nothing ever cost anything; and an air pocket (`r` 130, diameter
260) does not fit in the 250px of clear water 340px spacing leaves. Those two pull in opposite
directions and rev 1 had no answer. Rev 2 derives the spacing from the crossing bound (§7) and takes
the pocket out of the constraint entirely by making a pocket a **break in the reef** (§5). Rev 1
also assumed the Reef has marching ranks; it does not (§3), which is what licenses the biggest
change here — **spurs are solid to enemies as well as to the player**.

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

The chapter plays. It just plays as *The Beyond, sideways, retinted*. Every decision the cross axis
offers today is optional — you can hold the centre line forever and only ever lose air. This spec
makes the cross axis the chapter.

*(The Beyond's drifting rocks do reach this chapter, and §6 cuts them. They are a hazard, not one
of this chapter's traps; the scorecard above is about the Reef having threats of its own.)*

---

## 2. Spur and groove

The names are the real geomorphology of a reef front: **spurs** are the coral ridges that run out
from the reef, **grooves** are the sand channels between them. Seen from directly overhead — which
is this game's only camera — that formation *is* this level design. Both words are free as
identifiers in `src/` (checked 2026-08-20; the only hits are prose in unrelated comments, and
`bommie`, already this chapter's word for a coral head, stays what it is).

**A spur** is a ridge of coral spanning the lane, with two **grooves** cut through it.

**The grooves braid.** Each is a slowly-drifting cross position along the lane. They wander apart,
converge and merge, then split again. Following one is your route.

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
  C    converging — they are now adjacent
  D    MERGED. One groove, and the
       narrowest point in the level (§10)
  E    split again
```

The lane walls are unbroken — `stepPlayerMovement` clamps to `±laneHalfWidth` every frame with no
exceptions, so a hole in a lane wall is not a thing that can exist.

**A crossing costs, and §7 derives how much rather than asserting it.** At rev 2's numbers you can
make an adjacent groove comfortably and you cannot swing wall-to-wall without going through coral.
Local corrections are free; changing your mind about the whole lane is not. That is the texture the
design wants and it is a bound, not a feeling — see §7's first table.

There is still no pathfinding problem here. `lane` retired that before this design existed
(2026-08-13 spec: *"A lane has no pathfinding problem, because nothing is trying to path
anywhere"*), and §3's enemy collision is a push-out, not a route.

---

## 3. Hitting a spur

**You scrape through it.** Coral does not block, it grates.

- **Chip damage on a tick, not per frame.** `SPUR_TICK = 0.5`, `dot: true`. This is not a detail:
  `hurtPlayer` floors a hit at 1 HP and rounds it, so a per-frame `4 × dt` becomes **1 HP sixty
  times a second** and kills a 100 HP player 1.7s into a 2.0s spur. `DROWN_TICK`'s own block says
  so in as many words, and `ROCK_TICK`, `STARVE_TICK` and `SLICK_TICK` are all the same fix. The
  `dot` flag is the other half: the non-dot branch sets `p.invuln = PLAYER.invulnTime`, which would
  make scraping a **defensive** move — continuous invulnerability to contact damage for as long as
  you stay in the coral.
- **Your strafe is slowed. The scroll is not.** This is the whole punish and it is the right one:
  inside a spur you cannot manoeuvre. It is also the only slow that is legal here — sim.js's lane
  block forbids anything from touching the forward velocity, and `stepLaneSolid`'s comment says why.
  **The slow joins the `Math.min` at `sim.js:668`, it does not multiply.** Five comments in that
  block give the reason, and it is live here: the moray carries `latch` (`LATCH_SLOW_MUL` 0.55), so
  a multiplied scrape would be 0.2475 and every latch in this chapter would be strictly nastier than
  the identical one anywhere else. It needs its own field — `p.slowT` is a boolean gate on a fixed
  multiplier and cannot carry 0.45.
- **It is bounded.** Forward motion never stops, so a scrape always ends: thickness ÷ scroll, 2.0s
  at §7's numbers. Review tried to construct a deadlock and could not — you exit on the forward
  axis regardless of cross position, and the gap that follows always has the strafe budget to reach
  a groove.

**Or you press the button.** Burst punches a hole straight through and you take nothing.

⚠ **Spur thickness has a hard ceiling and it is not in the same config block.** An empty bar still
bursts, for `BURST_DUR_MIN` 0.30s at `laneScroll × BURST_SPEED_MUL` = 405 px/s = **121.5px of
forward travel**. A spur thicker than that cannot be punched through at zero Air, which is exactly
the structural trap `BURST_DUR_MIN` exists to prevent. §7 sets 90px; the bound is
`SPUR_THICK < BURST_DUR_MIN × BURST_SPEED_MUL × laneScroll` and §9 asserts it.

### 3.1 Enemies are stopped by spurs too — and rev 1 was wrong about why they wouldn't be

Rev 1 said enemies pass through, borrowing `laneSolid`'s reason: a rank shoved apart by terrain
stops reading as a rank.

**The Reef has no ranks.** `stepFormations` forces `rosterId: 'invader'`, and its own comment says a
lane chapter with no `invader` entry — *"The Reef, until it has a marcher of its own"* — falls
through to `spawnEnemy`'s ordinary roster pick. `march` exists only on The Beyond's invader and
hulk. What arrives here is a block of six **seekers** that turn and chase. Two things follow:

- **The rank-cohesion argument does not apply to this chapter at all**, so the reason for letting
  enemies through evaporates.
- If they did pass through, a player in a groove behind a spur would be attacked *through the coral*
  by the whole crowd while unable to retreat. Spurs could never be used as cover — the one tactical
  use a wall has.

**So spurs are solid to enemies as well**, under the same cross-axis-only push-out the player gets.
The crowd funnels into the grooves. The groove becomes both your road and theirs, which is what
makes the borrowed forward-cone starter read as the right weapon for the chapter.

Risk, and it is real: enemies pinned against coral that never reach you would trivialise the
chapter. §9 asserts a floor on contact, and §10 carries the fallback.

⚠ Also unmodelled until someone models it: `soapTrail`, this chapter's elite flag, drops damaging
pools. An elite in a groove leaves them **in** the groove, so a player takes pool DoT and scrape DoT
together. That is arguably good and definitely untested.

### 3.2 The hole Burst leaves

It records into a crushed-cell registry so the streamer never re-rolls it. **It must not be
`run._crushed` as-is.** That key is `i + ',' + j` built from each field's own cell size, with no
salt and no grid identity: Reef obstacles are on `cell: 620`, pockets on 640, spurs would be on 210.
Bursting spur cell `(5,2)` writes `"5,2"` and silently deletes the coral head 620px away on the
obstacle grid — and vice versa. **Namespace it** (`'spur:' + i + ',' + j`) or give spurs their own
Set.

⚠ **This is a fourth removal path, not the reuse rev 1 claimed.** `stepCrush` iterates
`run.obstacles`, tests circle overlap, splices from that array and pays a `CRUSH_XP` gem per
removal. A spur is a different shape in a different array. If a spur is subdivided into N crushable
cells, one Burst pays N gems — decide that deliberately.

The reason spurs must be cell-addressable is **re-streaming, not permanence**. The lane advances
monotonically, so a crushed cell is behind you within ~42s and never seen again; what matters is
that it is not re-rolled while still inside `OBSTACLE_STREAM_RADIUS`.

### 3.3 Groove positions are fractions, never pixels

`laneHalfWidth` is `Math.min(LANE_HALF_W, viewRadius × LANE_VIEW_FRAC)` — **418.4 on a phone, 430.0
on a desktop**, recomputed from `app.screen` every frame and changing on rotate. A groove authored
at an absolute cross coordinate near the wall is inside the lane on desktop and **outside the clamp
on the phone**, i.e. unreachable — the structural trap §9.1 forbids, passing on one viewport and
failing on the other.

Groove offsets are a **fraction of `hw`**, resolved at read time. `streamShafts` hit this and solved
it by dropping circles wholly outside the lane; a groove cannot be dropped, it must be repositioned.

---

## 4. The traps — owner ruling: "both and more"

Four, each doing a different job. Two more were designed and cut; §11 records them.

| Trap | What it does | Its job |
|---|---|---|
| **Clam** | A groove held by a giant clam that shuts on a slow rhythm | Makes a route **conditional** |
| **Fire coral** | A stinging patch inside the wide, obvious groove | Makes a route **cost something** |
| **Urchins** | A spiny stretch of spur; scraping *there* costs ×3 | Makes **where** you miss matter |
| **Vent jet** | A floor jet that shoves you hard across the lane | **Takes the wheel** for a second |

**The clam is not a timing puzzle, and that is deliberate.** You cannot slow down in a lane, so you
cannot wait one out. You read it at distance and take the other groove, or you Burst through before
it closes.

Three constraints, each of which makes something unplayable or unreadable if skipped:

1. **A clam may never sit on a merged groove.** At a merge there is one groove; a clam there is a
   spur with zero passable grooves, which is the unplayability §9.1 exists to prevent — reachable
   through a mechanic this section introduces. §9.1 must be asserted *with clams live*.
2. **A clam's period must be shorter than the phone's lookahead** (6.93s), or "you read it at
   distance" is false on the device the game ships to.
3. **A clam closing is a spur, not a new damage source.** Swim into a shut clam and you scrape. No
   new event, no new label, no new art. That is the whole implementation.

**Damage sources are two, not four**, and each needs more than a config row: `scrape` (urchins are a
×3 multiplier on the same source) and `fireCoral`. The vent jet shoves and does not damage. See §8
for the four sites each one has to reach.

⚠ **The vent jet needs its own lane re-clamp.** The wall clamp runs early in the step;
`stepLaneSolid` re-clamps at its own exit precisely because it moves the player later — *"the lane
wall outranks the coral, always"*. A shove applied after that puts the player outside the walls for
a frame.

---

## 5. Air, and the bubbles

### 5.1 A pocket is a break in the reef

Rev 1 said a pocket sits in a groove and that broke immediately: pocket diameter is 260px and rev
1's spacing left 250px of clear water. Nothing fit anywhere.

**So the pocket is not placed between spurs — the spur is absent where the pocket is.** A blue hole:
the reef opens out into a sand bowl, you breathe, the ridges resume. This dissolves the constraint
instead of tuning against it, keeps `r` at 130 and leaves the Air tune untouched.

### 5.2 A pocket sits where its groove is FAR from the centre line

This is the one the shipped code already had an opinion about, and rev 1 walked into it.

`config.js` carries an owner ruling, on measurements, that **the Reef has no tide**:

> *"across it (90 deg), the water walks a player who is not steering **205px sideways, into the air
> pockets (r 130) — RF.a's centre-line run ended on 93 of 100 Air instead of 0**, i.e. the water made
> the chapter's one decision for them."*

205px of *unintended* cross displacement was enough to take a centre-holder from 0 Air to 93. A
braid moves grooves across the lane **by design**, further than that. So "pockets sit on grooves"
would hand the centre-holder free air every time a groove wandered past them, and the 76%-at-zero
vs 0%-at-zero gap — the measurement that proves this bar is a map and not a clock — would collapse.

**Placement rule: a pocket only spawns where its groove is at least `r` clear of the centre line.**
That preserves the shipped geometry assertion and the gap it protects. It is a placement filter, not
a new system.

### 5.3 The bubbles, and what they are actually for

A pocket streams bubbles and the current carries them back down its own groove to you. The bubble
trail draws the groove: **you do not navigate the reef, you follow the bubbles.**

**They exist for the phone, and the spec should say so rather than pretend otherwise.** The player
sits at `LANE_CAMERA_FRAC` (0.8) along the viewport, so lookahead is 0.8 × screen width:

| | phone 390×844 | desktop 1280×800 |
|---|---|---|
| Lookahead | 312 px = **6.93 s** | 1024 px = **22.76 s** |
| Spur periods visible | 1.49 | 4.88 |
| Lane half-width | 418.4 | 430.0 |

On a desktop you see nearly five spurs and the pocket itself; the bubbles are redundant there and
harmless. On a phone they are the only thing between the player and a coin flip. This asymmetry is
**pre-existing and shared with The Beyond** — `laneScrollFor`'s own ponytail comment names it and
names the upgrade path (derive the scroll from a shared `LANE_WARNING_SECONDS` and the live
viewport), which moves The Beyond and so needs run LN re-captured with a stated reason. Not this
spec's job. Naming it is.

### 5.4 The Air tune does not change, and cannot be measured by the shipped rig

`drain 1.4, refill 9, killRefill 0.2, max 100, drown.dps 4` stands.

**But `charge-probe`'s two lane policies are now invalid**, and this is the "pick the rig for the
question" failure CLAUDE.md documents — the one that returns confident numbers instead of an error:

- `pocket` steers by a pure cross-reachability test with **no notion of terrain**. It drives through
  every spur, paying scrape damage it does not model, and never routes along a groove.
- `centre` holds the centre line, which under a braid is sometimes groove and sometimes coral. The
  row stops meaning "a player who has not learned the chapter" and starts meaning "a player who
  scrapes 100% of the time".

**A third policy is required — `groove`: follow the bubble trail, cross only at merges.** Report
`centre`, `pocket` and `groove` together. The two shipped rows are **not comparable to their
pre-spur values** and must not be quoted as though they were.

---

## 6. What gets cut

**The drifting rocks, in this chapter only.** `ROCK_INTERVAL 3.4`, `ROCK_MAX_LIVE 5`, `ROCK_SPEED
155` down-lane against your 45 up-lane — a 200 px/s closing hazard for `ROCK_DMG 20` every few
seconds. With spurs, four traps and a drowning clock the corridor is full, and the vent jet already
does "something knocks you off your line" with a telegraph and on the chapter's own terms.

The Beyond keeps its rocks untouched.

⚠ **This red-lines a shipped assertion, and it is not the one rev 1 named.** Run LN's golden master
runs only on `beyond` and cannot see the Reef; re-running it proves nothing here. The test that
breaks is **run LX.d**, which asserts `rocksChecked > 0` over 30s — a hard fail the moment
`rocks: false` lands — and whose rock-geometry asserts become dead code. It must be restated
(move the rock half to `beyond`), not deleted.

⚠ **And it re-phases every seeded Reef scenario.** `stepRocks` draws 3–4 `Math.random()` per rock;
removing them re-rolls every sampled statistic in RF.a–f. Expect red bands that have nothing to do
with whether the change is correct, and apply CLAUDE.md's protocol — ask whether the assertion's
subject is even reachable from the change, then re-run on a different seed — rather than retuning
the design to satisfy them.

**Kept, deliberately:** the loose bommies that already ship (`obstacles: count 8, cell 620`). Free,
already solid and Burst-able, and they give the button something to smash between spurs.

---

## 7. The numbers, and where they come from

Phone 390×844 unless stated. Scroll is `laneScroll` 45 px/s. Strafe is `PLAYER.baseSpeed 220 ×
LANE_STRAFE_MUL 1.25` = **275 px/s**.

**The spacing is derived, not chosen.** For a wall-to-wall crossing to cost anything:

```
full-lane crossing   836.8 / 275            = 3.04 s   (phone)
                     860.0 / 275            = 3.13 s   (desktop)
clear water needed   < 3.04 s               = < 137 px
so                   spacing - thickness    < 137 px
at thickness 90                             spacing < 227 px
```

| Knob | Start | Why that |
|---|---|---|
| `SPUR_SPACING` | **210 px** | 4.67s period. Clear water 120px = 2.67s < the 3.04s crossing, so wall-to-wall costs on **both** viewports |
| `SPUR_THICK` | **90 px** | 2.0s inside. Ceiling is 121.5px (§3's burst bound) — 90 keeps 31.5px of margin |
| Groove width | 110–200 px | ~37% of the lane open (phone), 36% (desktop) |
| Braid period | ~5 spurs | a merge about every 23s |
| `SPUR_TICK` | **0.5 s**, `dot: true` | 4 dps × 0.5 = **2 HP exactly** per tick, 4 ticks per spur = 8 HP of a 100 HP bar |
| Urchin stretch | ×3 | 12 × 0.5 = **6 HP exactly** per tick = 24 HP for a full bad scrape |
| Scrape strafe | ×0.45 | joins the `Math.min` at `sim.js:668`, never multiplies |

Both tick products are exact integers, which is the point — a config number that `hurtPlayer` rounds
is not the damage the player takes.

**43% of the lane's length is coral.** That is dense and it is intentional: a reef is mostly reef,
and the grooves are the map. It is also the knob most likely to be wrong — see §10.

**None of this has been through a probe.** It is sized against shipped reference points —
`ROCK_DMG` 20, lane contact at `LANE_CONTACT_MUL` 0.4, `PLAYER.baseHP` 100 — and against lane
geometry, which is arithmetic rather than taste. It is not a balance claim. The gate is §9.

*(`LANE_LEAK_DMG` is deliberately **not** in that list. The leak line gates on `march`, which this
chapter has no enemy carrying, so it is inert here — `DMG_SRC_NAME.leak`'s own comment says so. Rev
1 cited it as a calibration anchor; it anchors nothing.)*

Every knob is a named export in `config.js`. None is typed into `sim.js`.

---

## 8. The whole code change

| Where | What |
|---|---|
| `config.js` | `CHAPTERS.reef.spurs` descriptor (spacing, thickness, groove width band, braid period, salt block **44+** — the registry says 44 is next free). `REEF_TRAPS` table. `SPUR_*` constants. `rocks: false`. |
| `sim.js` | `streamSpurs` beside `streamShafts` — same cell hash, same stream/drop radii. `stepSpurs` (tick damage + strafe slow into the MIN). Enemy push-out (§3.1). One gate in `stepRocks`. A **new** Burst removal path (§3.2). |
| `render.js` | Spur bake (top-down coral ridge), groove floor, four traps, bubble emitters. Publish status into fields render.js **already reads** — do not teach it a new one. |
| `state.js` | New `run.*` fields and any new event into the doc block. |
| `fr.js` | Every new string, same commit. |

**Four more sites, each with a shipped guard that goes red, and rev 1 listed none of them:**

- **`DMG_SRC_NAME` + `hazardThumbs` + `scripts/bake-cast.mjs`.** Each new damage source (`scrape`,
  `fireCoral`) needs a labelled `hurtPlayer(…, 'x')` (run DA.d), a `DMG_SRC_NAME` row **plus
  French**, and a `src/cast/<src>.png` baked from `hazardThumbs` — or a written reason in
  `DMG_SRC_NO_ART`. Run DA.g asserts that partition is exact. `bake-cast.mjs` is hand-run and
  nothing warns you when it goes stale.
- **`clearWorld`'s pool registry.** New spur / trap / bubble pools go in the flat list **or** the rig
  block, and getting the split wrong sets a dead property with no throw — the previous run's
  entities just stay on screen. Run CP enforces the membership, not the choice.
- **Pocket placement must consult the spur field.** §5.1 and §5.2 both require it. Pockets are placed
  today by a pure cell hash at `cell: 640` with no knowledge of any other field, and the two grids'
  relative phase walks. Somebody has to wire it; budget for it.
- **run XX's walk is a hardcoded list of named tables.** A new `REEF_TRAPS` is exactly as invisible
  as a bare const **until a line is added for it**. Add the line, watch it go red, then write the
  French.

**Events: no new ones.** The Burst-through reuses `{type:'crush'}`, which already has a render case
and an SFX entry. The scrape publishes through `hurtPlayer` and needs no event at all. Run EV only
requires that every emitted type has a consumer — adding none is the cheapest way to satisfy it.

**`stepObstacles`'s early return stays.** This chapter already turns collision on through
`laneSolid` under three restrictions; spurs are a fourth field under the same rules, not a lifting
of the return.

---

## 9. What the suite has to pin

New label **`run RS`** (Reef Spurs) — `run RF` is already taken twice in the suite (the Reef's
resource and refunds), so `RF.h` would be ambiguous. Each assertion mutation-proved on a scratch
tree, never on the working one.

1. **No structural trap** — every spur has at least one groove wide enough to pass, asserted **with
   clams live** (§4.1) and **at both viewports** (§3.3).
2. **A free crossing exists within N spurs.** Otherwise the braid is two prisons.
3. **The scrape never touches the forward scroll.** The lane's one guarantee, asserted as an effect.
4. **Crossing wall-to-wall between two spurs is impossible without a scrape.** §7's derivation, as a
   test, so a spacing tune cannot silently undo the design.
5. **`SPUR_THICK < BURST_DUR_MIN × BURST_SPEED_MUL × laneScroll`** — an empty bar can always punch
   through. Two constants 500 lines apart; nothing else will catch this.
6. **A Burst hole is not re-rolled** while inside `OBSTACLE_STREAM_RADIUS`, **and** crushing a spur
   leaves the bommie grid untouched (§3.2's key collision, both directions).
7. **A pocket is never inside a spur, and never within `r` of the centre line.** Run RF.b — *not*
   RF.a — is the shipped geometry assert; restate it, do not delete it. (RF.a asserts the effect.
   `config.js`'s own comment miscredits this; do not inherit the error.)
8. **Enemies still reach the player.** A floor on contact events over a full run, because §3.1's
   solid spurs could otherwise strand the crowd and trivialise the chapter.
9. **The Beyond is bit-identical** — run LN's golden master, re-run, **not re-baselined**.
10. **Run LX.d restated**, not deleted (§6).

**Ratios, not pixels**, for anything compared against the screen, and shot at 390×844 **and**
1280×800. Denominator printed in every sweep's log line.

---

## 10. Risks

| Risk | Why it might bite | Answer |
|---|---|---|
| **43% coral is too dense** | narrow grooves + a crowd funnelled into them | The most likely wrong number in §7. Widen the groove band before touching spacing — spacing is derived (§7), width is free. |
| **Solid spurs strand the crowd** | §3.1 is a real behaviour change | Assertion 8. Fallback: make spurs solid to enemies **only within a groove's width of one**, so the funnel works and nothing beaches. |
| **A merge is the most dangerous point, not a free door** | one groove ⇒ ~18% open vs 37% elsewhere | Say so rather than hide it — §2's figure labels D as the narrowest point. It is where the clam ban (§4.1) matters. |
| **Scrape-through makes spurs optional** | if the cost is too low you ignore grooves | §5.4's `groove` policy measures exactly this: %time in a groove under `centre`. |
| **Bubbles read as decoration** | the game is full of ambient particles | Shoot it. A tell nobody reads is the same as no tell; this repo has shipped that twice. |
| **The braid reads as random** | two drifting lines can look like noise | Judge it in **map mode**, wide-area. A gameplay screenshot shows one spur. |
| **Air re-measure moves the tune** | pockets move; both shipped policies are invalid (§5.4) | Expected. Three policies, reported together. |

---

## 11. Considered and cut

- **Moray ambush hole** — a hole in the spur a moray lunges from. Cut: the moray is already the
  chapter's tank, and terrain that spawns enemies muddles "what is scenery" exactly when the bubbles
  are teaching the player to read scenery.
- **Camouflaged stonefish** — a bommie that is an enemy. Cut for the same reason, harder: the whole
  signposting design depends on the player trusting what terrain looks like.
- **Currents.** ⚠ **Already ruled and already recorded** — `config.js` carries eight lines of it
  under *"THE REEF HAS NO TIDE, deliberately (owner ruling, on these measurements)"*, with the
  numbers. Rev 1 proposed adding a config note and a different, poetic reason; both were wrong.
  Nothing to do, and the measurement in that block is load-bearing for §5.2.
- **Truly solid spurs** that stop you and rake you along to a groove. Cut by owner ruling: solid
  requires stopping forward motion, and the lane promises it never stops.
- **Short commits** (~7s channels sized to the screen). Cut in favour of bubbles: it removes the
  coin-flip by removing the commitment, which removes the design.
- **Spacing at 340px** (rev 1). Cut by §7's derivation — it made every crossing free.

---

## 12. Build order

1. Spurs and grooves, streamed and drawn, player-solid only. Shoot it in **map mode**; judge the braid.
2. The scrape (§3) and the Burst path (§3.2). Assertions 1–7.
3. Enemy solidity (§3.1). Assertion 8. Measure before and after — this is the change most likely to
   need reverting.
4. Pockets onto breaks, off the centre line (§5.1, §5.2) + the bubble trail. Add `charge-probe`'s
   `groove` policy; report three rows.
5. The four traps, one table, with French and the run XX line.
6. Cut the rocks (§6). Restate run LX.d. Expect re-phased Reef bands.
7. Balance pass on §7, with a probe, at both viewports.

Steps 1–3 are the chapter. Everything after is dressing that can ship separately.
