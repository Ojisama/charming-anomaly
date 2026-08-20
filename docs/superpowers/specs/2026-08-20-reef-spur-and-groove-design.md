# The Reef — spur and groove (level design)

Status: **owner rulings taken 2026-08-20**, spec written the same day. Extends
`2026-08-13-book-2-undertow-design.md` §6.3; it does not replace it. Nothing about the Air bar's
tune, the roster, the palette or the lane axis changes here — this spec is about the **shape of the
corridor** and nothing else.

Scope: the level. The chapter's two native weapons (Squid Ink, Oxygen Tank), its anomaly and its
mutator are separate tasks and are deliberately not designed here.

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
| there are traps | none | ✗ |
| dash breaks a weak point in a wall | dash breaks any obstacle; no wall, no weak point | ⚠ half |

The chapter plays. It just plays as *The Beyond, sideways, retinted*. Every decision the cross axis
offers today is optional — you can hold the centre line forever and only ever lose air. This spec
makes the cross axis the chapter.

---

## 2. Spur and groove

The names are the real geomorphology of a reef front: **spurs** are the coral ridges that run out
from the reef, **grooves** are the sand channels between them. Seen from directly overhead — which
is this game's only camera — that formation *is* this level design. Both words are free as
identifiers in `src/` (checked 2026-08-20; the only hits are prose in unrelated comments, and
`bommie`, already this chapter's word for a coral head, stays what it is).

**A spur** is a ridge of coral spanning the lane, with two **grooves** cut through it.

**The grooves braid.** Each is a slowly-drifting height along the lane. They wander apart, converge
and merge, then split again. Following one is your route.

```
scroll ←────────────────────────────────────

██████        ██████        ██████    ██████
  ·······upper groove······          ·······
██████                  ████████████████████
 >you  ·····lower groove······    ·······
██████        ██████        ██████    ██████
      ^apart          ^merge        ^split again
       (crossing      (free          (pick one)
        costs)         crossing)
```

**The property that makes it a design rather than a maze: you are never locked in, you only pay to
change your mind.** A merge is a free door. Between merges, switching grooves means going through a
spur, and §3 is what that costs. There is no state to be trapped in, which is also why there is no
pathfinding problem and no navmesh — the 2026-08-13 spec named "corridors with no navmesh" as this
chapter's biggest risk, and a braid of two open channels retires it by construction.

---

## 3. Hitting a spur

**You scrape through it.** Coral does not block, it grates.

- **Chip damage** while you are inside it.
- **Your strafe is slowed. The scroll is not.** This is the whole punish and it is the right one:
  inside a spur you cannot manoeuvre, so you cannot dodge the rank that is arriving. It is also the
  only slow that is legal here — sim.js's lane block forbids anything from touching the forward
  velocity, and `stepLaneSolid`'s comment says why (a push along the lane locally reverses the one
  constant the mode guarantees).
- **It is bounded.** Forward motion never stops, so a scrape always ends. Spur thickness ÷ scroll
  is the exact duration, ~2s at the numbers in §7.

**Or you press the button.** Burst punches a hole straight through and you take nothing. The coral
is **gone for good** — it records into `run._crushed` and `streamObstacles` never re-rolls that
cell, which is the shipped permanent-removal path (`{type:'crush'}`, sim.js) that v6.3's cover
system and the Wreck already use. Burst is a third entry point to it, exactly as the 2026-08-13
spec proposed; this spec only gives it something wall-shaped to be pointed at.

⚠ **The hole must be cell-addressable**, because `run._crushed` is a Set of cell keys. Spurs
therefore live on the existing `obstacleCellHash` grid like every other streamed field, not on a
pure function of x. See §8.

**Enemies swim over spurs.** They are solid to the player alone — the rule `laneSolid` already
ships with, and for the reason its comment already gives: a rank shoved apart by terrain stops
reading as a rank. Top-down, the fish are above the reef and you are in it.

---

## 4. The traps — owner ruling: "both and more"

Four, each doing a different job. Two more were designed and cut (a moray ambush hole, a
camouflaged stonefish); they are recorded in §11 so the next person does not re-propose them.

| Trap | What it does | Its job |
|---|---|---|
| **Clam** | A groove held by a giant clam that shuts on a slow rhythm | Makes a route **conditional** |
| **Fire coral** | A stinging patch inside the wide, obvious groove | Makes a route **cost something** |
| **Urchins** | A spiny stretch of spur; scraping *there* costs ~3× | Makes **where** you miss matter |
| **Vent jet** | A floor jet that shoves you hard across the lane | **Takes the wheel** for a second |

**The clam is not a timing puzzle, and that is deliberate.** You cannot slow down in a lane, so you
cannot wait one out. You read it at distance and take the other groove, or you Burst to get through
before it closes. It informs the fork instead of competing with it, and it gives the action button
a second job.

**The traps are one config TABLE**, per this repo's standing rule — copy in a function or a bare
const is invisible to run XX's translation walk, and that exemption has shipped untranslated
strings four times. One row per trap, French added in the same commit, and run XX watched go red
before the French is written.

---

## 5. Air, and the bubbles

Today an air pocket lands on a 640px cell grid with jitter. **It moves onto a groove**, at the far
end of one branch. Reaching one means committing to a route — which is the "refill is a fight" test
the book's own spec sets for every bar, satisfied structurally instead of by assertion.

**The bubbles do two jobs at once, and the second one is why they exist.** A pocket streams bubbles
and the current carries them back down its own groove to you.

On a phone you see **312 world px ahead — 6.9 seconds**. A branch commits you for longer than that,
so without a signpost every fork is a coin flip. The bubble trail is the signpost, and because it
travels *to* you it works past the screen edge, which a static marker cannot. It also draws the
groove: **you do not navigate the reef, you follow the bubbles.**

⚠ **The vent jet must not read as air.** They are both bubbles and one of them is a lie about the
other. Required distinction, and it is a hard requirement rather than a polish note:

|  | Air pocket | Vent jet |
|---|---|---|
| Form | fine, steady stream | violent column |
| Motion | drifts down-lane toward you | static, pinned to the floor |
| Where | at the end of a groove | anywhere, including inside one |

If a player cannot tell them apart at distance the signpost lies, and a lying signpost is worse
than none.

**The Air tune does not change here** — `drain 1.4, refill 9, killRefill 0.2, max 100, drown.dps 4`
stands. But **it must be re-measured**, because it was fitted against cell-grid pocket coverage and
this changes where pockets are. `scripts/charge-probe.mjs --chapter reef` already has the two lane
policies (`centre`, `pocket`); the shipped table's headline is 76% of the run at zero for `centre`
against 0% for `pocket`, and that gap is the thing that must survive. Re-run, report the pair, and
do not re-derive the numbers from taste.

---

## 6. What gets cut

**The drifting rocks, in this chapter only.**

The Reef inherits The Beyond's asteroids because `stepRocks` fires for every `lane` chapter:
`ROCK_INTERVAL 3.4`, `ROCK_MAX_LIVE 5`, `ROCK_SPEED 155` down-lane against your 45 up-lane — a 200
px/s closing hazard for `ROCK_DMG 20` every few seconds. With spurs, ranks, four traps and a
drowning clock, the corridor is full.

More to the point, the vent jet and the rock do **the same job** — something knocks you off your
line — and the vent does it with a telegraph, on the chapter's own terms. Two systems, one job.

The Beyond keeps its rocks untouched.

**Kept, deliberately:** the loose bommies that already ship (`obstacles: count 8, cell 620`). They
are free, they are already solid and Burst-able, and they give the button something to smash
between spurs. Reducing their count is a tuning question for §7's probe, not a design change.

---

## 7. Starting numbers, and they are starting numbers

Phone, 390×844: the lane is **±418px** (`laneHalfWidth`, 836 tall), you see **312px ahead**, the
scroll is **45 px/s** — so **6.9s** of lookahead.

| Knob | Start | Why that |
|---|---|---|
| Spur spacing | 340 px | 7.5s — one spur arrives as the last leaves |
| Spur thickness | 90 px | 2.0s inside on a full scrape |
| Groove width | 110–200 px | ~36% of the lane open at any spur |
| Braid period | ~4 spurs | a free crossing about every 30s |
| Scrape | 4 dps, strafe ×0.45 | ~8 HP of a 100 HP bar per full scrape |
| Urchin stretch | ×3 scrape | ~24 HP — a quarter bar for a bad miss |

**None of this has been through a probe.** It is sized against shipped reference points — `ROCK_DMG`
20, `LANE_LEAK_DMG` 2, lane contact at `LANE_CONTACT_MUL` 0.4, `PLAYER.baseHP` 100 — and against the
lane's own geometry, which is arithmetic rather than taste. It is not a balance claim. The gate is
§9.

Every one of these is a named export in `config.js`. None of them is typed into `sim.js`.

---

## 8. The whole code change

| Where | What |
|---|---|
| `config.js` | `CHAPTERS.reef.spurs` descriptor (spacing, thickness, groove widths, braid period, salt block **44+** — the registry above `obstacleCellHash` says 44 is the next free one). A `REEF_TRAPS` table. `SPUR_*` constants. `rocks: false` on the chapter. |
| `sim.js` | `streamSpurs` beside `streamShafts` — same cell hash, same stream/drop radii, same `run._crushed` check. `stepSpurs` for the scrape (damage + strafe slow). One gate in `stepRocks`. Burst's existing crush call learns about spurs. |
| `render.js` | Spur bake (top-down coral ridge), groove floor, the four traps, the bubble emitters. Status must publish into fields render.js already reads — do not teach it a new one. |
| `fr.js` | Trap names and descriptions, same commit. |
| `state.js` | New `run.*` fields into the doc block. New event types into it too. |

**The event contract applies.** Every `{type:'…'}` this adds needs a render case, an
`SFX_FOR_EVENT` entry, or a written line in `SILENT_BY_DESIGN` — run EV enforces it. A scrape fires
often enough that it probably wants no sound of its own; a Burst-through a spur is rare enough that
it does.

**`stepObstacles`'s early return stays.** This chapter already turns collision on through
`laneSolid`, under the three restrictions its comment lists (player only, cross axis only, only
where you could have gone round). Spurs are a fourth field under the same three rules, not a
lifting of the return.

---

## 9. What the suite has to pin

Run RF exists; these join it. Each is mutation-proved on a scratch tree, never on the working one.

1. **No structural trap.** Every spur has at least one groove wide enough to pass. This is §8.2 of
   the book's spec and it is the single property that can make the chapter unplayable.
2. **A free crossing always exists within N spurs.** Otherwise the braid is two prisons.
3. **The scrape never touches the forward scroll.** The lane's one guarantee, asserted as an
   effect, not as state.
4. **A Burst hole is permanent** — the cell is in `run._crushed` and re-streaming does not re-roll it.
5. **An air pocket is always in a groove**, never inside a spur. The shipped run RF.a pins
   "no pocket on the centre line"; that claim is now about grooves and must be restated, not deleted.
6. **The Beyond is bit-identical.** Run LN's golden master, re-run, **not re-baselined**.
7. **Ratios, not pixels**, for anything compared against the screen — and shot at both 390×844 and
   1280×800. A px threshold passes at exactly one screen size, which is how v7.58 shipped a
   half-dark desktop.

Denominator printed in every sweep's log line.

---

## 10. Risks

| Risk | Why it might bite | Answer |
|---|---|---|
| The corridor is too busy | spurs + ranks + 4 traps + drowning | Rocks are already cut. If it is still crowded, thin the ranks (`FORMATION_INTERVAL`) before touching spurs — spurs are the chapter. |
| Scrape-through makes spurs meaningless | if the cost is too low, you ignore grooves entirely | This is exactly what §7's probe measures: %time in a groove under a `centre` policy. If a centre-holder never pays, the scrape is too cheap. |
| Bubbles read as decoration | the game already has ambient particles everywhere | Shoot it. A tell nobody reads is the same as no tell — this repo has shipped that failure at least twice. |
| The braid reads as random | two drifting lines can look like noise | Judge it in **map mode**, wide-area. A gameplay screenshot shows one spur; whether the braid is legible only exists at several thousand px. |
| Air re-measure moves the tune | pockets move, coverage moves | Expected. Re-run `charge-probe`, report `centre` and `pocket` together, never one alone. |

---

## 11. Considered and cut

Recorded so they are not re-proposed.

- **Moray ambush hole** — a hole in the spur beside a groove that a moray lunges from. Cut: the
  moray is already the chapter's tank, and making the terrain spawn enemies muddles "what is
  scenery" right when the bubbles are teaching the player to read scenery.
- **Camouflaged stonefish** — a bommie that is an enemy. Cut for the same reason, more strongly:
  the whole signposting design depends on the player trusting what terrain looks like.
- **Currents.** The Reef is the only Book 2 chapter without them (v7.165 gave every other one).
  **Leave it that way, on purpose: a reef is the thing that breaks the current.** That is a reason,
  not an omission, and it is worth a line in the chapter's config block so nobody "fixes" it.
- **Truly solid spurs** that stop you and rake you along to a groove. Cut by owner ruling in favour
  of the scrape: solid requires stopping forward motion, and the lane promises it never stops.
- **Short commits** (~7s channels sized to the screen, so a fork is never blind). Cut in favour of
  bubbles: it removes the coin-flip by removing the commitment, which removes the design.

---

## 12. Build order

1. Spurs and grooves, streamed and drawn. Nothing else. Shoot it in map mode; judge the braid.
2. The scrape (damage + strafe slow) and Burst-through. Run RF's new assertions 1–4, 6.
3. Air pockets onto grooves + the bubble trail. Re-run `charge-probe`; report both policies.
4. The four traps, as one table, with French.
5. Cut the rocks. Re-run run LN.
6. Balance pass on §7's table, with a probe, at both viewports.

Steps 1–2 are the chapter. Everything after is dressing that can ship separately.
