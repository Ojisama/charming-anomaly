# Book 2 — "Undertow" (design)

Status: **design agreed 2026-08-13**, revised the same day after owner playtest-feedback on the first
cut. Chapter 2 (The Shelf) is partly built — its bar, scrim and refill machinery ship as of
v7.51–v7.54, and §6.2 retints them. Supersedes `2026-08-12-book-2-downward-design.md`.

**What survives from Downward:** the second player verb on the skill button, `run.charge` as the
meter behind it, the BOOKS/WIP scaffold, the phone constraints, and the mod budget.

**What changed:** the world, the button, and the bar's job. Downward had a verb and never had a
threat model; its button was one effect in five costumes; and its bar was ammo and nothing else.

---

## 1. The one-line difference from Book 1

> **Book 1's threats want you. Undertow adds a second threat class that does not know you exist.**

A net does not aim. A hook is just there. A plastic bag has no behaviour at all. A trawler is
fishing, not hunting. That is a threat *model*, which is the bar Downward set for what makes a book
and then never cleared.

It sharpens the button instead of duplicating it: **a shove works on a crowd and does nothing to a
net, a bag, or a wall of fish.** §5.2 is how each chapter answers that.

## 2. The arc

**You start in the wash as a bristle worm and are dragged out and down, growing the whole way.**

| | Ladder | Chapter 1 → 5 |
|---|---|---|
| **You** | growth, and it is *on screen* | bristle worm → small fish → reef fish → big fish → shark |
| **Humans** | attention | underfoot and oblivious → departed → only wreckage → back, as industry → cannot reach you |
| **Refill** | the spatial deal | fixed-and-drying → drifting → fixed in a tunnel → welded to the danger → **it bites you** |

Human presence **withdraws** as you grow. That is the book's point, and its ending:

> **You can outswim people. You cannot outswim what they threw away.**

You escape the boats and find their rubbish already at the bottom, ahead of you, with something older
living in it.

### 2.1 Why this is not Book 1's verb again

Book 1 escalates **authority** (immune system → animals → humans → military → cosmic) and the threat
always wants you. Undertow escalates **attention** — you begin beneath notice and end as the target —
and the threat class inverts on the way.

## 3. The name

`BOOKS.downward` → **`BOOKS.undertow`**, `name: 'Undertow'`: the current that drags you off a beach
into deep water, and a thing that happens *to* a protagonist who never chose to leave.

⚠ Rename sweep — CLAUDE.md documents both silent failure modes: field names also exist as quoted
**strings**, and a display-name sweep **over-matches user-facing copy**. Run
`git diff -U0 src/config.js | grep -E "name: '|desc: '"` afterwards, plus a grep for the old token in
quotes.

## 4. Pollution is the through-line

Owner ruling: pollution is more than a mutator. It is the connective tissue — one hazard family, five
presentations, and as of §6.2 it is also a chapter's *resource pressure* rather than only its
scenery.

| # | Chapter | The pollution | Mechanically |
|---|---|---|---|
| 1 | Surf | the tide line — caps, filters, monofilament off the pier | **static obstacles the button cannot move.** The thesis object, taught in chapter 1 |
| 2 | Shelf | settled spill and sediment stirred by the swell | **the murk itself is the chapter's antagonist** (§6.2) |
| 3 | Reef | monofilament through the coral, a lost pot, drums | tunnel walls that are half reef, half garbage |
| 4 | Trawl | bags at mid-water, the boat's discharge | **drifting** obstacles that **silence the button** while overhead |
| 5 | Deep | ships, containers, leaking drums | pollution **is** the terrain — the arena is made of it |

Litter → resource pressure → wall → verb-thief → world.

**The silencing bag is the book's best object** — the first thing in this game that takes a *verb*
away. Planted inert in chapter 1 (an obstacle the shove fails to move), it only bites in chapter 4.

`MUTATORS.sticky` already excludes `['beyond', 'pond', 'shelf']` — add the other four Undertow ids.

## 5. The bar and the button

### 5.1 What already ships

`stepRepulse` (sim.js:1127) gates on `if (!ch.lane && !ch.resource) return` — **any chapter declaring
a `resource` gets the button and the cast**. The charge amplification ships:
`REPULSE_RADIUS 340 → PULSE_RADIUS_AT_FULL 620`, `REPULSE_FORCE 880 → PULSE_FORCE_AT_FULL 1500`, with
`spend = min(charge, PULSE_CHARGE_COST)` so an empty bar fires the known-good v5.21 shove unchanged.

**The invariant, globally: at zero charge, every chapter's button falls back to the plain shove.**
`t = spend / cost` is already 0 on an empty bar and lane chapters ride that path with byte-identical
behaviour, so each chapter only implements "what happens when `t > 0`" and the floor is free.

### 5.2 One gimmick, one button, one second job — owner ruling 2026-08-13

Downward re-skinned a single shove five times and called it identity. Instead, **each chapter owns a
signature, a button effect, and one secondary effect of its own bar** — and the three are designed as
a set: the button answers the chapter's problem, and the bar's second job gives the gimmick teeth.

| # | Chapter | Gimmick | Button | The bar's second job |
|---|---|---|---|---|
| 1 | Surf | `tide` — waves shove you sideways; sandbars slow and dry you | **Thrash** — the shipped shove | **Humidity drives your damage** |
| 2 | Shelf | `murk` — fouled water closes in; clean upwellings drift | **Clear** — push the murk back | **Clarity is how far you can see** |
| 3 | Reef | `lane` — a left-to-right scroller through coral tunnels | **Burst** — dash through a marked weak point | **Empty air drowns you** (damage over time) |
| 4 | Trawl | `trawl` — a net wall crosses the map, killing both sides | **Breach** — tear a lasting hole in it | **Feed is your speed** — run dry, the net catches you |
| 5 | Deep | `dark` — anglerfish are the only light, and they bite | **Scent** — spend light to see prey and hurt it | **Light is what you can see and what you can hurt** |

Five second jobs, five different axes: **output / sight / survival / mobility / perception.**

### 5.3 Amendment: the bar may drive damage — owner ruling, overriding Downward §6

Downward forbade the bar touching damage after a four-reviewer pass. **The owner has ruled the other
way for The Surf's humidity**, and the design follows it. Recorded rather than re-argued, with what
the original ruling was protecting, so the build knows what to watch:

- **The risk is concentrated in the onboarding chapter.** Review found that an empty bar at 40%
  output put Book 2's *first* chapter past The Undergrowth's endgame effective HP during the run's
  worst 100 seconds. Mitigation: a named floor constant (`HUMIDITY_DMG_FLOOR`) that is **tuned, not
  assumed** — the multiplier's bottom is a balance number like any other and belongs in config.js.
- **A damage multiplier is imperceptible in its top half and a cliff in its bottom.** Mitigation: the
  sandbar is a *place*, so the player can always see the cause and step off it. This is what makes
  humidity survivable where a global ambient drain would not be — keep the drain tied to the
  sandbars, not to the clock.
- **It breaks census comparability.** `scripts/weapon-census.mjs` diffs enemy `hp` per step and may
  only be compared *within one invocation*; a global damage multiplier makes every Undertow reading
  non-comparable with the Book 1 numbers already banked. Mitigation: **the census needs a charge
  column before any Undertow balance claim is quotable.** This is now a blocker, not a nicety.

The other four bars keep Downward's rule — no weapon spends the bar, and no bar passively scales
damage — except The Deep's, where the *button* grants a damage bonus on a timed opt-in spend.

**The refill rule is unchanged and every chapter below is checked against it:**
*a refill point is a place you can fight from, never a place you go to stop.*

## 6. The chapters

### 6.1 The Surf — onboarding

**You are a bristle worm.** `drawCentipede` re-tinted with shortened parapodia — one tapered trunk
driven by `spine(t)` with **six slither phases already baked** (`phases: 6`, `lean: 90`). A marine
bristle worm is a centipede that swims; the cheapest new protagonist in the book.

**Gimmick `tide`, two halves.** *Waves* shove you laterally, and **the direction alternates** — surge
one way, backwash the other. This is the pond's `currentForce` shape (a periodic directional force
folded into movement), not new machinery. *Sandbars* are patches that slow you and drain Humidity
fast.

**Button: Thrash** — the shipped shove, unmodified. Chapter 1's job is to teach the base verb and one
object it fails against (the litter), so every later chapter can mutate it.

**Bar: Humidity.** Drains on sandbars, and **drives your damage** (§5.3). Refill: **tide pools** —
fixed circles left as the tide ebbs, shrinking as they dry, restored on the flood.

*Refill-is-a-fight check:* a tide pool is where everything else got stranded too — the crab is
already in it — and the crowd follows you in via `stepStragglers`. You cannot leave early, because
the sand costs you damage. ✓

**Roster.** Owner correction on the first cut: with `dashBurst` on the sandhopper the chapter had **no
plain enemy at all**. The `normal` lane is now flagless, which is what an onboarding chapter's
baseline is for.

| id | archetype | flags | why |
|---|---|---|---|
| `sandhopper` | normal | — | it simply comes at you. The chapter's baseline |
| `shorecrab` | tank | `unshakeable` | armoured, sideways, does not stagger |
| `gull` | fast | `diveBomb` *or* `aerialStrike` — see below | from the air |

⚠ **`aerialStrike` and `drawOwl` are built and PARKED** (sim.js:1601/1880, render.js:2399) — a gull is
a re-tinted owl, sim and art both free. But config.js:3354 records why they were parked: aerialStrike
circles at `AERIAL_RADIUS` and dives to where a kiting player *was*, so "a clawRake loadout cleared
0% of owls" — **unkillable in a melee-only chapter.** The gull may only use `aerialStrike` if The
Surf's pool contains a ranged option. Otherwise `diveBomb`. Decide it with the pool; do not discover
it from a playtest.

**Weapons:** two reused from the pond, plus new **Pincer**. Owner rejected the first cut (a plain
grab-and-throw) as unfun; the replacement is his: **you hold the claw out toward the nearest enemy
like a shield, and when something reaches it you snap** — damage plus a hard yank away, then it
re-arms. That is a **parry**, and nothing among the 23 shipped weapons reacts to being *approached*;
it is a better claim than "grab" was, and it is the one weapon in the book whose value depends on
what the enemy does rather than on what you aimed at.

**Constraints:** the waterline must be outpaceable (well under `baseSpeed` 220; target 40–70 px/s)
and legible before it arrives — on a portrait phone the horizontal half-view is ~195px, not
`viewRadius` ~465 (state.js:1504-1507). The Surf inherits the gentle onboarding numbers
(`maxAliveMul` in line with `body`), so **The Shelf's balance table firms up one step** as chapter 2.

### 6.2 The Shelf — retint, not rebuild

Owner ruling: **light is the wrong resource for bright shallow water, and belongs to chapter 5.**
The Shelf's resource becomes **Clarity**, and its antagonist is the murk.

**The shipped work is relocated, not discarded.** v7.51–v7.54 built a bar, a two-object scrim (a hard
`cut()` circle under a feathered sprite at exactly 2R), an eased falloff texture with no Mach band,
`lightRadius()` interpolating on `darkness()`, and a measured tune. All of it is a *radius-of-clear-
space* mechanic; it does not care whether the thing outside the radius is darkness or filth. So:

- **Here** it retints brown-green: `lightRadius()` → `clearRadius()`, the scrim becomes fouled water
  closing in, the sun shafts become **clean-water upwellings** that drift exactly as the shafts do.
- **The dark version relocates to The Deep** (§6.5), where the chapter is genuinely dark.

Fiction: on a continental shelf the murk is **stirred sediment and old settled spill**, not fresh
diesel — a sheen is a surface thing, so diesel proper belongs to The Surf's tide line and The Trawl's
discharge. This is where pollution stops being scenery and becomes the chapter's pressure.

**Button: Clear** — push the murk back. Mechanically the same spend the first cut called Flare, under
a better fiction: your clear radius blows wide for a few seconds and everything it reaches is
stunned.

⚠ The spend shrinks the steady-state radius while the burst is up — the interesting tension, and the
one thing that could read as punishing rather than tactical. Probe it on `charge-probe.mjs`'s
existing spend-policy axis before tuning by eye.

**Weapons.** Owner: the starter is too close to the pond's, and the chapter needs new weapons. Rather
than skin `flagella` per chapter (no such system exists, and a display-name sweep is one of the two
rename traps in CLAUDE.md), **the Shelf gets its own new starter — Bubble Puff** — and `flagella`
drops out of the pool entirely. The redundancy disappears instead of being disguised. `bloom` is
still reused.

*Refill-is-a-fight check:* unchanged in shape and already measured — `scripts/charge-probe.mjs`, 5
seeded 300s runs, three spend policies. The numbers in config.js carry their own provenance; do not
re-derive them, but **do re-run them after the retint**, since the tune was fitted against shaft
coverage and upwelling coverage must match it.

**Roster unchanged:** copepod `split`, krill `dashBurst`, moon jelly `phase`+`unshakeable`.

### 6.3 The Reef — a side-scroller

Owner ruling: **build it as a left-to-right scroller** — you go up and down to choose tunnels, there
are traps, and the button is a dash that breaks an obvious weak point in a wall. *"I know it's very
different gameplay but I like varying."*

**This is far cheaper than the first cut of this spec claimed, and that claim was wrong.**

- **`lane: true` already is this.** config.js:3718 describes The Beyond as "not a free-roaming
  survivors arena… the view auto-scrolls, you are pinned to a band," and says how, in its own words:
  *"much less machinery than it sounds — the camera already follows the player, so advancing the
  PLAYER at a constant rate IS the auto-scroll. The renderer, the camera, the terrain streaming and
  the obstacle field all keep working untouched."* sim.js:588 is the whole of it:
  `p.vy = -LANE_SCROLL_SPEED`, `p.vx = ix * speed * LANE_STRAFE_MUL`. **Left-to-right is those two
  lines with the axes swapped** — a parameter on `lane`, not a second mode.
- **Telegraphed destructible walls already ship.** v6.3's cover system (sim.js:3373 —
  "telegraphed, destructible") destroys a qualifying obstacle outright through the `{type:'crush'}` /
  `run._crushed` permanent-removal path, reused rather than duplicated. Burst is a third entry point
  to it.
- **The lane brings its own tuning for free**: `LANE_CONTACT_MUL` ("one axis to dodge on"),
  `LANE_SPAWN_MUL`, `laneEarlyMul`, and `magnet = Infinity` (sim.js:7095).
- **It also retires this chapter's biggest risk.** The first cut flagged "corridors with no navmesh"
  as the thing most likely to sink the Reef. A lane has no pathfinding problem, because nothing is
  trying to path anywhere.

⚠ **The one real piece of work:** `stepObstacles` early-returns for lane chapters (sim.js:3122), so
lane mode has no obstacle collision today. Tunnel walls means turning it on for this chapter and
re-checking what that early return was protecting. That is the job — not a camera, not a streaming
layer.

**Button: Burst** — a directed dash that shatters a telegraphed weak point. An empty bar still gives
the shove, so a player with no charge is never structurally trapped, only slowed.

**Bar: Air.** Refill: air under coral overhangs and **lost scuba tanks**, fixed in the tunnels — you
commit to a branch to reach one. At empty, **you drown**: damage over time until you breathe.

*Refill-is-a-fight check:* the tunnel with the air in it is a tunnel you cannot leave sideways. ✓

**Roster:** moray (`tank`, `latch`), damselfish (`normal`, `weave`), lionfish (`fast`, `pounce`).
All shipped. Note `slowMul` composes by `Math.min`, so `latch`'s slow will MASK a chapter-level slow
rather than stack — the trap that kept `latch` off the moon jelly.

**Weapons: Squid Ink** and **Oxygen Tank** — the tank is the chapter's refill object weaponized.

⚠ **Squid Ink carries the only new sim branch in the book.** "Blind" means enemies inside the cloud
lose the player and continue on their last heading, but every seek path targets `run.player` or a
trail sample and `nearestEnemy` (sim.js:4298) is the documented choke point for every aim site. It is
one branch in the enemy movement step; small, not free — **and The Deep's Scent reuses it**, so it is
paid for twice over. If it is cut anyway, ink falls back to a slow-and-damage zone on the shipped
`webZone` shape.

### 6.4 The Trawl

**You are a big fish.** Open water, no bottom in sight. Humans are back, as industry.

**Gimmick `trawl`.** A net wall crosses the map on a timer, from a direction, killing **both** sides
and aiming at nothing. Precedent: the asteroids (sim.js:1170, "hurts the player on contact AND
grinds" enemies) and the `predators` trap field, whose config block says "it damages BOTH sides, and
that IS the mechanic."

**Button: Breach** — spend charge to tear a hole in the net that **persists**, a door you made and the
crowd will also use. The book's thesis as a verb: the inert class is immune to you, except here, at a
price, once every six seconds.

**Bar: Feed.** Refill: **the churned wake behind the trawl** — sediment and prey stirred up by the
thing trying to catch you, and there is nowhere else to get it. At empty, **you tire**: your speed
falls, which in this chapter specifically means the net catches you. The bar's second job and the
signature are the same sentence.

*Refill-is-a-fight check:* you ride alongside a moving wall that kills on contact. ✓ The strongest
version of the rule in the book.

**Roster:** mackerel (`normal`, the **school-as-barrier**), tuna (`fast`, `dashBurst`), sea lion
(`tank`, `pounce`).

⚠ **The school is a moving OBSTACLE, not boids.** Downward §9.1 verified that sign-flipping
`stepEnemySeparation` does nothing: `resolveSeparationPair` early-outs at `distSq >= minSep²` where
`minSep = ENEMY_SEP_FRAC(0.65) × (rA + rB)` = **20.8px for two drones**, so the pass only touches
already-overlapping pairs. Real schooling is a new boids pass. **A barrier you cannot cross is one
entity with a shape** — the same picture at a tenth the cost.

**Weapons** (owner: this chapter needs its own): **Longline** — a sweeping line of hooks that hits
everything along it, claiming the *line* shape — and **Net Toss**, their gear turned around: a thrown
net that holds a **group**, where Pincer answers one.

**Constraint:** the sweep must be outrunnable but not ignorable. Target 60–90 px/s: above the
joystick's 33 px/s floor (`DEADZONE 0.15 × baseSpeed 220` is a hard *cut*, not a rescale, so the
expressible speed set is `{0} ∪ [33, 220]`) and near `KITE_MIN_SPEED` 100, above which
`stepStragglers` recycles the horde into your heading — which here is **correct**: running from the
net should bring the crowd with you.

### 6.5 The Deep

**You are the shark.** Ships, containers and drums are the terrain. Humans cannot reach.

**Gimmick `dark`: this is the darkest chapter, and it is where light finally matters.** The Shelf's
shipped scrim and radius rig arrive here in their original colour — true dark rather than murk.

**The refill is the best thing in the book: the anglerfish.** A living refill point that
**telegraphs its own betrayal** — as your bar fills, its mouth opens wider, and if you gamble on one
more second it bites for heavy damage. It satisfies "a refill point is a place you can fight from,
never a place you go to stop" harder than anything else here, because the refill point *is* the
fight, and the timer on your greed is drawn on the enemy's face.

It is also the one refill geometry that needs no new spatial system: an anglerfish is a roster entry
with a proximity check, not a streamed map object.

**Bar: Light.** Anglerfish are the only source. It sets your sight radius, and it fuels:

**Button: Scent** — owner's framing: *"you use the light to see the weak points, or to see the
enemies better, so you can do more damage or move faster towards your prey."* Spend light and for a
few seconds every enemy in a wide radius is outlined and takes bonus damage, you close on them
faster, and **the breakable weak points in the wreck field are revealed.**

That last clause is the book's best ladder: **in the Reef the weak points are marked for you; in the
Deep you spend to see them yourself.** Same object, one chapter of escalation, and it reuses both the
Reef's crush path and Squid Ink's perception branch.

**Roster:** anglerfish (the refill, and a `tank` when provoked), hagfish (`normal`, `webZone` — slime
is literally a patch it leaves behind), viperfish (`fast`, `dashBurst`).

**New weapon: Fin Hit** — movement-coupled, damage where you turn, scaling with speed. Downward's cut
"Wake" shape with a better motivation: it is the shark's own body, and the bloodlust fantasy lives
here rather than in the bar.

⚠ `ANOMALIES.stillness` (config.js:885 — damage climbs to `STILLNESS_MAX_MUL` over `STILLNESS_RAMP`
seconds standing still, dropping instantly on movement) **zeroes Fin Hit entirely**. It is
`weight: 1` and unconditional, so it *will* be offered here. State it in the card.

### 6.6 The Kraken (hidden)

Owner: **the kraken sank the vessels, and the graveyard is its domain.** Design deferred.

A **scripted boss chapter** on `stepBossScript` and the `BLANK_*` machinery (sim.js:755+), the only
boss system this game has. Unlocked by winning The Deep at difficulty 5, mirroring The Blank — which
survives by being hardcoded as a string literal in seven places across main.js, ui.js and state.js,
so the Kraken needs the generalisation those seven sites never got.

## 7. Weapons and mod budget

**Seven new**, up from four after the owner asked for weapons in chapters 2 and 4.

| Weapon | Chapter | Shape it claims |
|---|---|---|
| **Pincer** | Surf | **A parry.** Triggers on being approached — nothing else does |
| **Bubble Puff** | Shelf | Its own starter, so `flagella` can leave the pool |
| **Squid Ink** | Reef | **A blind.** ⚠ the one new sim branch (§6.3), reused by Scent |
| **Oxygen Tank** | Reef | **Thrown, detonates.** The refill object weaponized |
| **Longline** | Trawl | **A line.** Hits everything along its sweep |
| **Net Toss** | Trawl | **A group hold**, where Pincer answers one |
| **Fin Hit** | Deep | **Movement-coupled.** Scales with the verb you already have |

⚠ **This is at or slightly over the mod ceiling.** The budget is ~28 real mods, not the ~42 a
6-per-weapon rate implies — the 137 shipped mods are 89 `pct` + 23 `flat` + 16 `tier` + 8 `switch` +
1 `prism`, and each weapon's mod count tracks its number of independently tunable stats almost
exactly. Seven weapons at 4 mods each is 28; at 6 each it is 42 and the pool dilutes. **Hold the line
at ~4 apiece and cut a weapon rather than invent mods.** If one must go, the cut order is Net Toss
(nearest neighbour to Pincer), then Longline.

Two shipped traps when writing them: an on/off mod that must be **epic** cannot be `kind: 'switch'`
(`makeWeaponModCard` returns null above normal for a switch *before* it reads `values`) — use the
Beam Prism idiom. And a new weapon **stat** must be registered twice, in `buildReadout`'s whitelist
(sim.js) and `STAT_LABEL` (ui.js), plus the French, or it is silently absent from the pause build
sheet.

## 8. What is actually at risk

1. **Humidity drives damage in the onboarding chapter** (§5.3). The accepted risk, with its
   mitigations named there. `HUMIDITY_DMG_FLOOR` is a tuned number, and **`weapon-census.mjs` needs a
   charge column before any Undertow balance claim is quotable.**
2. **Five button effects is the real new cost** against Downward's one. Thrash and Clear ride shipped
   systems, Burst rides the crush path, but Breach and Scent are new, and the `t === 0` fallback must
   be re-verified per chapter or the no-spiral floor silently rots.
3. **Lane obstacles.** `stepObstacles` returns early for lane chapters (sim.js:3122) — the Reef needs
   that on, and needs to know what the early return was protecting.
4. **The player's body is chapter-specific via one boolean.** `chapterHasKaiju` (render.js ~10 sites:
   9303, 11459, 11714, 11996, 12508-12563) is gated on `CHAPTERS.skies.render.kaiju`. Four new forms
   means generalising it into a look id — the largest single art+code cost in the book, and not
   optional, because it is what makes the growth visible rather than implied.
5. **Squid Ink's perception branch** (§6.3) — the only idea with no shipped precedent, now paying for
   itself twice.
6. **Twelve new creature looks**, each needing a `ROSTER_LOOKS` entry *and*, if cast on a title card,
   a baked `src/cast/<id>.png`. Both fail silently — a missing look renders a generic archetype blob
   with no error. Run RA sweeps `Object.keys(CHAPTERS)` and will see them; keep its printed
   denominator honest.

## 9. Build order

1. **The Surf.** New onboarding chapter, the `tide` gimmick, the bristle-worm player form (which
   forces the `chapterHasKaiju` generalisation early, where it is cheapest), Pincer, humidity with a
   tuned floor, and the `undertow` rename. Re-tune The Shelf one step firmer as chapter 2.
2. **The Shelf's retint and Clear.** One chapter, one button, over systems that already ship — the
   cheapest possible test of whether §5.2's per-chapter ruling actually produces distinct chapters,
   with no new biome, roster or art needed to answer it.
3. **The Reef.** The lane axis parameter, lane obstacles, Burst on the crush path. It is now the
   *cheapest* new chapter rather than the riskiest, and it proves the scroller before The Trawl and
   The Deep depend on nothing from it.
4. **The Trawl.** The school-as-barrier reframe and Breach — the "one verb against the inert class"
   idea, which is the book's thesis and its least proven part.
5. **The Deep.** Reuses the light rig, the crush path and the perception branch; it is deliberately
   last because it is the chapter that pays for the least new machinery.
6. **The Kraken.** Needs the seven hardcoded Blank sites generalised.

Step 2 is deliberately out of chapter order: it is the smallest experiment that can falsify the most
expensive ruling in this document.

Honest cost, carried from Downward §11.1: **~1 day to build a chapter, 20–32 releases over 25+ days
to make it good.** 78% of this repo's releases landed after all seven Book 1 chapters existed. The
settling tail is the cost, not the build.

The dev toggle (`meta.dev`, seven taps on the title coin badge) exists so the WIP book can be played
on a phone against the live URL. Downward §11.2's warning stands: work that does not face a player
stops moving. Use the toggle.
