# The Trawl — a normal chapter (design)

Status: **design agreed 2026-09-01** (owner, this session). Amends
`2026-08-13-book-2-undertow-design.md` §5.2 and §6.4 — it does not supersede them; everything about
the book outside The Trawl still stands.

---

## 1. Why this exists

The owner asked for a **normal level between The Reef and The Wreck**: "we already had several
unusual levels". The audit says he is right and that there is nothing to move into that slot.

| Chapter | Why it is not normal |
|---|---|
| Surf | Humidity bar drives your damage |
| Shelf | the murk closes in; Clear button |
| Reef | a four-lap **race**, no weapons and no combat at all |
| Wreck | a **hunt** — the roster is food, not enemies |
| Trawl | net wall + Feed bar + Breach button — three systems stacked |
| Twilight | Light bar; no hazard at all, which is its own known debt |
| Deep | dark; anglerfish are the only light and they bite |

The Twilight is the closest to normal, and moving it up the book undoes the owner's own 2026-08-17
ruling ("abyss is light starved"). So the normal chapter has to be **made**, and The Trawl is the
cheapest one to make it out of: the owner's read is that it "was designed quickly a long time ago,
with defaults", and the file agrees — its balance block is flagged in-margin as an *unmeasured first
cut*, its `normal` roster entry is an admitted stand-in, and its elite flag is borrowed.

**Owner ruling: strip it to normal.** Keep the net, delete the bar and the button.

## 2. What it becomes, in one line

> **Open water, and a torn net sweeping through it every half-minute that kills you and the crowd
> alike. Read the wall, reach a gap, decide who goes through it with you.**

No resource bar. No chapter button. No meter to learn. Free-roam, a hostile crowd, a weapon pool,
kill things and level up — mechanically a Book 1 chapter wearing Book 2's water, with one
environmental hazard on a timer. That shape already ships twice: The City's traffic and The
Undergrowth's snap traps, both in normal chapters.

## 3. The order

`BOOKS.undertow.chapters` becomes:

```
['surf', 'shelf', 'reef', 'trawl', 'wreck', 'twilight', 'deep']
```

`wipFrom: 3` is **unchanged** and needs no edit — it is an index, so The Reef stays the last live
rung and The Trawl becomes the WIP one. Saves are keyed by chapter id, not position, so
`ensureChapterMeta` resolves an old save with no migration.

The story improves with the swap: reef → a boat fishing above you → the same boat on the bottom.
And it settles the tension `CHAPTERS.wreck`'s own signature block records — "two adjacent chapters
whose hazard is human gear tangled in the water are one chapter told twice" — because dead industry
now follows living industry instead of preceding it.

## 4. What gets deleted

The pass is mostly subtraction, and the renderer is almost untouched.

| Delete | Notes |
|---|---|
| `CHAPTERS.trawl.resource` (Feed) | drain 2.6, refill 9, max 100, `tire: { from: 0.45, speedFloor: 0.62 }` |
| `CHAPTERS.trawl.breach` | the `ch.breach` branch in `stepRepulse` (sim.js:1712) is its only reader |
| `BREACH_R_MIN` / `BREACH_R_AT_FULL` / `BREACH_REACH` / `BREACH_MAX_HOLES` | `BREACH_MAX_HOLES` is **kept and repurposed** — see §5 |
| the `{ type: 'breach' }` emit + its `case 'breach'` in render.js | delete together, or run EV goes red on a consumerless event |

Consequences to walk deliberately:

- **`stepRepulse` gates on `if (!ch.lane && !ch.resource) return`.** Removing `resource` removes the
  chapter's button entirely, which is the intent — a normal chapter has no second verb. The owner
  ruled this explicitly ("no bar at all") before the direction was even settled on The Trawl.
- **`inWake` (sim.js:5293) loses its only consumer.** `stepCharge:5923` is the sole caller and it
  cannot run in a chapter with no `resource`. The function is generic and exported; leaving it costs
  nothing, but it is then dead code and should be deleted with the rest rather than left as a
  landmine.
- **`TRAWL_WAKE_DEPTH` (420) stops being a refill geometry** and becomes render-only: the churn
  behind a pass is still the tell for where the net has been. Keep the visual, drop the sim read.
- **`scripts/charge-probe.mjs --chapter trawl` stops meaning anything.** Its third movement family
  (`ride`) was grown specifically for this chapter's bar. Leave the family — it costs nothing and the
  probe is generic — but no balance claim about The Trawl may cite it again.

**This throws away measured work, knowingly.** The Feed bar is the best-evidenced mechanic in the
chapter: a 12-cell drain × refill knob grid picked against a stated predicate, and the block quotes
the traces (`ignore` pinned at 0, `ride` cycling 23→100 with the passes). It is being deleted because
the chapter's job changed, not because the tuning was wrong. Recorded here so nobody re-derives it as
a mistake.

## 5. The net's new teeth — tears

**The tire was the net's teeth.** The net is an infinite line — a unit normal plus a signed offset,
with no ends, so it can never be walked around. At `TRAWL_SPEED` 75 against the player's 220 you
simply swim ahead of it; the only reason that was not free is that an empty Feed bar dropped you to
136 px/s and collapsed the margin from 145 to 61. Delete the bar and the net is a thing you jog away
from. Delete Breach too and its 9-damage contact tick is a toll you pay or ignore.

**Owner ruling: the net arrives already torn.** A handful of gaps per pass, seeded from the pass and
fixed for its whole transit. You read the wall as it comes in, pick a gap, and thread it with the
pack on you.

Why this is the cheap answer as well as the right one:

- **The data structure already exists.** `run.net.holes` is written by Breach today and the renderer
  already draws the mesh *in the segments the holes leave of it* (render.js:13659, holes stored in
  the sim's own `t` space). Seeding the list at pass creation instead of on a button press is the
  same array with a different author — **render.js needs no change at all.**
- **The collision already exists**, and sim.js:5277 already records that one function answers "am I
  in the mesh" for contact, the wake, Breach and the renderer alike.
- **The crowd already uses them.** The Breach block's own words: "the hole is a gap in one line and
  the line does not know who is standing in it." That was written about a door you made; it is now
  true of a door you found, which is strictly better — the gap is where the fight happens.
- `BREACH_MAX_HOLES` (6, "a wall cut to lace is not a wall") survives as the per-pass tear count,
  renamed. The ceiling it expresses is unchanged.

**Two derivations die with the bar and must be redone, not inherited:**

- `TRAWL_SPEED` 75 was derived as "outrunnable but not ignorable" — and *not ignorable* was carried
  by the tire. The tears carry it now, so the number needs re-deriving against gap spacing rather
  than against a speed floor. Its lower bound still holds for its own reason: staying under
  `KITE_MIN_SPEED` (100) is what stops `stepStragglers` recycling the horde into your heading, i.e.
  stops the net herding the crowd onto you.
- `TRAWL_FIRST_PASS` 10 was justified entirely by the bar ("`tire` begins biting at ~21s, before the
  first wall would appear"). That reasoning is gone. Teaching the net early is probably still right,
  but the comment must state a new reason or the number is unowned.

`TRAWL_LEAD_MUL` 1.6 is untouched and stays load-bearing: it is a multiple of `run.viewRadius`, never
world px, so the warning is 9.9s on a phone and 16.1s on desktop. The warning **is** the mechanic,
and now more than before, because reading the wall is the whole verb.

## 6. The roster — three to five

Owner rulings this session, all in feel terms before any field was named:

| # | Creature | Archetype | Behaviour | Status |
|---|---|---|---|---|
| 1 | Mackerel | `normal` | flagless | keep — see below |
| 2 | **Remora** | — | `latch` (exists) | **new** |
| 3 | **Sea turtle** | — | holds its spawn heading | **new**, needs new movement |
| 4 | Tuna | `fast` | `dashBurst` | keep, re-motivate |
| 5 | Sea Lion | `tank` | `pounce` | keep |

**The school is cancelled.** Spec §6.4 wanted the mackerel to become a *school-as-barrier* — one
entity with a shape you cannot cross. Owner ruled it out: the chapter already has one wall, and a
second one is one idea too many. The mackerel stays the deliberately flagless `normal` baseline, on
the standing argument that with a flag on every entry none of them reads as special.

**The mackerel is shared with The Wreck on purpose.** It appears in both rosters — a chaser here,
food there. Owner ruling: keep it, because with The Trawl moving in front it becomes the book's "you
got bigger" arc made literal, at zero cost, and it only reads that way in this order.

**The remora holds you.** `latch` already exists and The Wreck's moray uses it, so the behaviour is
free. The concept is what earns it: a remora attaches *because you are big*, which makes the
player's own size the reason it is there — and being held while the wall closes is this chapter's
fear expressed as a creature. It turns the gap moment into something you can lose.

**The sea turtle ignores you.** The book's second threat class — "a threat model that does not know
you exist" — made into a creature that swims a straight line to somewhere else and does not stop for
you. It costs you *attention* rather than health.

⚠ **This is the one piece of new movement code in the roster, and it was surfaced as a cost before
it was chosen.** No existing flag is genuinely oblivious: `march` (The Beyond) is welded to the lane
axis via `laneAxes` and still homes weakly on the player, and `skittish` (The Wreck) flees rather
than ignores. Holding the heading the enemy spawned with is a short branch beside `stepMarch` in the
movement chain — small, but new, and it must sit in the override chain rather than modify seeking
(the same placement argument `weave`'s comment makes for being last).

⚠ **`WAVE_TABLE` gates `tank` to t ≥ 140s**, so the sea lion is absent from the first half of every
run and from any probe shorter than that. Nothing may lean on it for early pressure, and every
measurement of this chapter must run the full 300s.

## 7. The elite affix — trailing lost net

`eliteFlags: ['soapTrail']` is the borrowed pond soap-bubble pool, and The Trawl is the last Undertow
chapter still on the loan; The Wreck replaced its with a native `oilTrail` in v7.255.

**Owner ruling: the elite drags a length of torn mesh** — a small unscheduled piece of the wall,
moving on a creature's logic instead of the sweep's. It means the wall can find you *between*
passes, which is exactly what the quiet stretch needs now that the bar no longer fills it.

Build it on `oilTrail`'s machinery (sim.js:2945 — same timer cadence, pushing a trail entity), not
on a new `run.*` array. It must go in `SUBMISSION_STRIP_FLAGS` alongside `soapTrail`/`oilTrail`, or a
submitted elite keeps laying the chapter's hazard while fighting for you.

## 8. Still owed after this pass

`node scripts/chapter-stage.mjs trawl` reads `ideation=owes3`. This design clears none of it, and
that is deliberate — the ideation bar is a backlog, not a gate, and 9 of the 15 shipped chapters sit
under it.

1. **A fourth weapon.** The pool is `['longline', 'netToss', 'hole']`, one under the bar, and `hole`
   is the borrowed slot. Its own task, under `design-a-weapon`. Note the book spec's mod ceiling: hold
   at ~4 mods apiece and cut a weapon rather than invent mods.
2. **An anomaly of its own.** None is scoped to this chapter.
3. **A mutator of its own.** `springtide` is the *book's* — it names every chapter with a `tide` —
   and by the stated rule none of the six may count it.
4. **A measured `balance` block.** Currently `{ spawnMul: 0.8, enemyHpMul: 1, maxAliveMul: 0.85 }`,
   flagged in-file as an unmeasured first cut, and its own comment names the right question: the net
   takes a real bite out of the crowd on every pass, so if the net is doing the thinning then
   `spawnMul` is the wrong knob and `maxAliveMul` is the right one. Measure before tuning; six seeds
   minimum, print the spread.
5. **The silencing bags are formally dropped.** Book spec §4 calls them "the book's best object" —
   the first thing in the game to take a *verb* away, planted inert in The Surf to bite here. A
   chapter with no button has no verb to take, so the object has nowhere to land in this design. If
   it is ever wanted, it needs a new home chapter.

## 9. The depth ladder

The book's floors step down one measured stop per chapter, and the swap inverts the last step. Today:

| Chapter | `bgColor` | `floorTint` | effective floor |
|---|---|---|---|
| Reef | — | — | `#06294d` |
| Wreck | `0x082a44` | `0x9ec4b8` | ~`#052031` |
| Trawl | `0x05203f` | `0x93b6cc` | ~`#031732` |

The Trawl is currently the *darker* of the two, so in the new order the sea gets lighter as you
descend. Physically the new order is more right — open water under a working boat should be brighter
than a hull settling into silt — so **The Trawl lightens; the palettes do not swap.** The Wreck's
green-grey silt cast is chapter identity and travels with it.

This follows the rule this repo already wrote when The Twilight moved into The Shelf's slot:
**depth-encoded fields stay with the slot, identity-encoded fields travel with the chapter.**

⚠ Not a number to pick from arithmetic. Shoot both floors on one identical frame and let the owner
choose, then re-run `node scripts/obstacle-contrast.mjs` — `BIOME_WRECK`'s steel is the palest
obstacle family in the book and has to stay clear of the roster.

## 10. Stale comments this pass must fix

Found while auditing; each is a fact authored twice that has already drifted.

- The chapter block still carries **⚠ "Longline and Net Toss (spec §7) are not built; the three
  weapons below are BORROWED STAND-INS"**. They shipped, with 4+ mods each. The warning is false.
- The `render` block claims a **`formScale` ladder ("Surf 1.0, Shelf 1.15, Reef 1.3, here 1.55")**.
  No chapter declares `formScale` any more — the ladder was deleted book-wide. `render.js` still
  reads `chapterRender.formScale ?? 1`, so the mechanism is live and only the ladder is gone; the
  comment describes numbers that are not in the file.
- **Book 2 chapter numbers are wrong in three places** and were already wrong before this change:
  The Twilight, The Trawl and The Deep all say "chapter 5". After the swap the order is Surf 1,
  Shelf 2, Reef 3, **Trawl 4, Wreck 5**, Twilight 6, Deep 7. One comment is fixed by accident — The
  Trawl's `speedFloor` note says "recognises it in chapter 1 … in chapter 4", which becomes true.
- `CHAPTERS.wreck`'s LEAK block says **"The Trawl one chapter later is the net"** and "dead industry
  here and living industry next door". Both reverse.
- The `STARVING` block says **"The Reef's `drown` shape, one chapter later"** — it becomes two.
- `test/sim-test.js:4626` asserts `isWipChapter('wreck')` with the message *"the rung below The Reef
  is still gated"*. The assertion still passes (wreck stays past `wipFrom`), but the sentence stops
  being true. Fix the message and add the matching assert for `trawl`, so the test names the order.

## 11. Risks

- **The chapter could come out thin.** Removing two systems and adding one hazard variation is a net
  subtraction. The mitigation is the first playtest, not more design: per the owner's 2026-08-21
  ruling a chapter goes to him on a phone as a wired grey box before art and tuning are paid for.
- **A missing visual tell reads exactly like a broken mechanic.** The tears must be legible in the
  wall from `TRAWL_LEAD_MUL`'s distance on a *phone*, or the chapter will feel like an unfair toll
  rather than a routing puzzle. Judge it in MAP MODE and at the phone viewport, not from a desktop
  gameplay frame.
- **The turtle's new movement is the only new machine here.** If it is not worth the branch after one
  playtest, `march` is the fallback and the chapter loses one roster idea, not its shape.

## 12. Owner rulings, verbatim

- "i want a new level between the reef and the wreck. A normal level, because we already had several
  'unusual' levels."
- "No humans should be absent, I want a level with crab traps, fishnets to avoid, a level about human
  fishing" — *superseded by the decision to redesign The Trawl instead of building a new chapter; the
  human-fishing content is what The Trawl already is.*
- "the trawl was design quickly a long time ago, with defaults. Let's do a complete pass again on the
  level design"
- "i don't wanna ship the wreck after the reef, that's two 'original' levels back to back, i want a
  'normal' level inbetween. i don't care if the wreck is more advanced"
- Direction: **strip it to normal** — keep the net, delete the Feed bar and the Breach button.
- The net's teeth: **tears you must thread.**
- Roster: **drop the school**; add **something that HOLDS you** (remora) and **something that IGNORES
  you** (sea turtle); **keep the shared mackerel** as the growth tell.
- Elite affix: **trailing lost net.**
- Bar: **no bar at all.**

---

# Revision 2 — after adversarial review (2026-09-01)

Rev 1 above is kept as written. Everything below CORRECTS it; where the two disagree, this wins.

## R2.1 The tear SPAN, which rev 1 omitted and the design lives on

Rev 1 fixed a tear *count* (6) and no *span*. Measured, that does not work.

| | phone (`viewRadius` 465) |
|---|---|
| wall drawn each side of the player (`render.js:13622`, `max(600, viewRadius * 1.6)`) | 744 px |
| pass duration (`2 * lead / TRAWL_SPEED`) | 19.8 s |
| along-wall distance a 220 px/s player covers in one pass | **4365 px** |

Six tears over a band the player can traverse is one per ~730 px against a 1488 px window, so
whether any gap is visible is a coin flip — and a player who drifts past the seeded band meets a
solid infinite wall for the rest of the pass.

**Tears are periodic across the whole reachable band, not a fixed count.** Spacing is a multiple of
`viewRadius` (screen-relative, the same rule `TRAWL_LEAD_MUL` exists for), and the band is *derived*
from constants already in the file rather than being a new magic number:

```
band  = pass duration * PLAYER.baseSpeed + lead      // everywhere the player could reach
space = viewRadius * TRAWL_TEAR_SPACE_MUL            // slightly wider than the drawn window
```

At `TRAWL_TEAR_SPACE_MUL` around 1.3 that is one gap per ~967 px against a 1488 px window: usually
exactly one on screen, sometimes none, which is the tension. **Tear radius stays world px, not
screen-relative** — it is a hole your body fits through, which is what `BREACH_R_MIN`'s 70 measured.

`BREACH_MAX_HOLES` does NOT survive as the tear count. Its sentence ("a wall cut to lace is not a
wall") was a budget on what a *player* may cut, and it has no bearing on how torn a found net is.

## R2.2 render.js is NOT untouched

Rev 1's central claim is wrong in three ways:

- **The segment merge has never run off-centre.** Breach places its hole at the *player's own t*
  (`sim.js:1716`), so every hole `render.js:13661-13673` has ever merged sat at local x near 0.
  Seeded tears are the first ones drawn away from the player. The data contract is unchanged; the
  code path is genuinely new coverage and must be shot at both viewports before it is believed.
- **Two comments become false.** `render.js:13659` ("the SEGMENTS a Breach has left of it") and
  `13697` ("at every edge that is a CUT ... the tell has to say *you did this*"). The tell now has
  to say *the net came this way*, which is a drawing decision, not a comment edit.
- **`sim.js:5276` is already wrong today** and gets fixed with this: it claims "contact, the wake,
  Breach, **and the renderer** call these", but `netAlong`/`inNetHole` are module-local and
  `render.js:13617` re-implements the arithmetic inline. Nothing tests that the drawn gap and the
  damaging gap agree, which is exactly the defect class that block was written to prevent.

## R2.3 The test suite CRASHES, it does not merely fail

Rev 1 named one test. Three sites dereference `CHAPTERS.trawl.resource` with no optional chaining:

| Site | What breaks |
|---|---|
| `test/sim-test.js:6955` run CL.f | `CHAPTERS[id].resource.max` over `['surf','reef','trawl',...]` -> TypeError |
| `test/sim-test.js:29748` run TR | `const res = CHAPTERS.trawl.resource` then `res.max` / `res.tire.speedFloor` / `res.drain` -> TypeError |
| `test/sim-test.js:31132` run US(e1) | `BARS.trawl === 'Feed'` -> assertion red |

**Run TR is a rewrite, not an edit.** It is ~280 lines and four of its eight cases (c, d, e, f) are
Feed and Breach. And TR.d asserts, verbatim, that no hole appears without the button being pressed —
which this design negates on purpose. TR.a and TR.b also go non-deterministic: `standAt(run, d)`
moves the player along the net's *normal* and preserves their `t`, so a tear seeded near the
player's along-position makes "the net does not damage the player" fire at random. Every rig in that
scenario assumes an unbroken mesh. The replacement must assert **the tears** — spacing,
reachability, and that the crowd uses them too.

## R2.4 The sea turtle costs four things, not one

Rev 1 said "a short new branch beside `stepMarch`". All four of these are required:

1. **A `stepStragglers` exemption.** `sim.js:2502-2521` teleports anything beyond
   `KITE_DROP_MUL * (viewRadius + SPAWN_RING)` from a player moving over `KITE_MIN_SPEED` onto the
   spawn ring *inside `KITE_AHEAD_ARC` of their heading*. The exemptions are `_dead`, ally, the
   `anchored` affix and chapter-level `lane`/`scripted`/`circuit` — The Trawl is none of them. A
   creature that swims somewhere else is by construction the one that falls behind fastest, so
   without an exemption the oblivious turtle keeps reappearing in front of you. That is the design
   inverted.
2. **A `maxAlive` cap.** `sim.js:2329-2338` already states this rule for the anglerfish and ends:
   *"Any future roster entry that does not chase the player will need this too."* A turtle is never
   approached and so never killed; `sim.js:1133` caps spawns on `run.enemies.length`, so turtles
   silently eat the whole crowd budget.
3. **Placement ABOVE the behaviour machines, not beside `stepMarch`.** Rev 1 cited weave's
   last-place argument, which is the wrong precedent — weave is a *modifier* to seeking, an
   oblivious mover is a *replacement* for it. The two shipped oblivious movers, `passiveCrowd`
   (`sim.js:2791`) and `skittish` (`2826`), both sit directly under stun/fear and above every
   machine, each carrying the same written reason: *"a fish that is not hunting you is not running
   its hunting routine either."*
4. **A render.js facing fix.** `render.js:20792`'s `facesOwnHeading` predicate lists `allyT`,
   `blindT`, `skittish` and chapter `passiveCrowd`. A turtle outside it draws facing the player
   while swimming sideways — the bug `sim.js:2818-2825` documents and v7.202 shipped.

## R2.5 Art was missing from the spec entirely

Two new creatures means two new `ROSTER_LOOKS` entries in render.js (run RA,
`test/sim-test.js:10294`) and two `src/cast/<id>.png` on disk (run DA.e, `29399`, which walks
**every** roster id across `Object.values(CHAPTERS)`), re-baked with `node scripts/bake-cast.mjs`.
Both are ship-gate reds. Top-down plan view, and `lean` is a decision per `designing-an-enemy`: a
turtle has a distinct forward axis, a remora is bilaterally symmetric about one.

## R2.6 Roster fields rev 1 left blank

`spawnEnemy` picks the archetype first and only then narrows to the roster entries wearing it, with
a weighted pick inside that bucket. Adding two entries without declaring `archetype` and `weight`
silently halves or thirds the mackerel's and tuna's share of every spawn — which invalidates the
`balance` block rev 1 §8.4 already says needs measuring. Every new row declares both.

## R2.7 The elite affix needs its own look

Rev 1 said "build it on `oilTrail`'s machinery". That machinery tags `run.blooms` entries
`look: 'bilge'` *specifically* to inherit Bilge/Leak's stain, prey-avoidance and render for free
(`sim.js:2961-2973`, `render.js:13120`, `render.js:16253`). The Trawl has no Bilge weapon and no
Leak, so reusing the look draws trailing net as an **oil slick** — the borrowed-art trap. The trail
*entity* is reused; the `look` is new, and it costs a `syncSlicks` branch.

## R2.8 Corrections to rev 1's own claims

- **`'Feed'` becomes a dead French key.** It appears once in `src/` outside `fr.js`, at the resource
  block. Deleting the resource orphans the `fr.js` entry and run XX's dead-key check
  (`test/sim-test.js:17480`) goes red. Delete the entry and its naming comment with the resource.
- **`KITE_MIN_SPEED` is an UPPER bound on `TRAWL_SPEED`, not a lower one.** Rev 1 §5 has it
  backwards. The genuine lower bound is the `DEADZONE * baseSpeed` = 33 px/s floor. Note also that
  `stepStragglers` gates on the *player's* velocity, so the constraint only binds for a player
  choosing to match the net's pace.
- **The stale-comment list in §10 was wrong in both directions.** Actual state: `config.js:8117`
  (Trawl, "chapter 5") is correct today and *becomes* wrong; `config.js:7679` and `fr.js:1663` (both
  Wreck, "chapter 4") are correct today and *become* wrong — neither was on rev 1's list;
  `fr.js:764` and `fr.js:1645` (Trawl, "chapter 4") are wrong today and become correct;
  `fr.js:1621` (Twilight) and `fr.js:1651` (Deep) say "chapter 5", are wrong today and stay wrong
  unless fixed. The Twilight and The Deep carry their bad numbers in **fr.js**, not in their chapter
  blocks.
- **A second dead `formScale` ladder** sits at `config.js:7630` and contradicts itself in one
  sentence: "no formScale anywhere; The Surf leaves it at the default 1, The Shelf is 1.15 and The
  Twilight 1.62". No chapter declares one.
- **Rev 1 §9's Reef row is wrong.** `CHAPTERS.reef.render` declares `bgColor: 0x0a3358`,
  `floorTint: 0xa9cfe0`; the effective floor is `#07294d`, not `#06294d`. Wreck and Trawl check out.

## R2.9 Accepted, not fixed: three shop lines go inert here

`BOOK_SHOP.undertow`'s `deepLungs`, `slowBurn` and `bigGulp` are bought with the book's purse and
act only through `CHAPTERS[chapter].resource`. With no resource they are dead money in The Trawl,
with no tell in the shop. This is the known "a chapter rule can make a card inert" shape and it is
**the accepted price of a chapter with no bar** — the same way `springtide` is the book's mutator
and not every chapter's. Recorded so it is a decision rather than a discovery. If it ever needs a
tell, the shop row is where it goes, not the chapter.
