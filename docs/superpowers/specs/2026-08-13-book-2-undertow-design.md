# Book 2 — "Undertow" (design)

Status: **design agreed 2026-08-13.** Chapter 2 (The Shelf) is already built and shipped; the other
four are unbuilt. Supersedes `2026-08-12-book-2-downward-design.md`, which is now historical.

**What survives from Downward, unchanged:** the verb (a second player verb on the skill button), the
bar (`run.charge`, the button's ammo and nothing else), the BOOKS/WIP scaffold, the phone
constraints, the mod budget, and the whole of The Shelf as shipped in v7.51–v7.54.

**What changed:** the world, and the button. Downward had a verb and never had a threat model, and
its button was one effect wearing five costumes. Its chapter list (Twilight / Wrecks / Crust / Core)
is dropped, its direction is reversed, and its name is wrong.

---

## 1. The one-line difference from Book 1

> **Book 1's threats want you. Undertow adds a second threat class that does not know you exist.**

Every threat in Book 1 converges: the crowd seeks, the artillery aims, the predators hunt. A net does
not aim. A hook is just there. A plastic bag has no behaviour at all. A trawler is fishing, not
hunting. That is a threat *model*, which is the bar Downward set for what makes a book ("a book is a
verb and a threat model, not a substrate") and then never cleared.

It sharpens the button instead of duplicating it: **a shove works on a crowd and does nothing to a
net, a bag, or a wall of fish.** The book's escalation is *your verb stops working on the new
threat* — and §5 is how each chapter answers that.

The old crowd is still here — it has to be, or there is no game — and the inert class is the terrain
that fight happens in.

## 2. The arc

**You start in the wash as a bristle worm and you are dragged out and down, growing the whole way.**

Three ladders run together across five chapters:

| | Ladder | Chapter 1 → 5 |
|---|---|---|
| **You** | growth, and it is *on screen* | bristle worm → small fish → reef fish → big fish → shark |
| **Humans** | attention | underfoot and oblivious → departed → only their wreckage remains → back, as industry → cannot reach you |
| **Refill** | the spatial deal | fixed-and-drying → drifting → enclosing → welded to the danger → does not exist |

Human presence **withdraws** as you grow. That is the book's point, and its ending:

> **You can outswim people. You cannot outswim what they threw away.**

You escape the boats and find their rubbish already at the bottom, ahead of you — and something
older living in it. That recovers Downward's best line (*something got here first, and it is under
your feet*) which an ending-at-the-beach arc had thrown away.

### 2.1 Why this is not Book 1's verb again

Book 1 also grows. The difference is what the world answers with. Book 1 escalates **authority**
(immune system → animals → humans → military → cosmic) and the threat always wants you. Undertow
escalates **attention** — you begin beneath notice and end as the target — and the threat class
inverts on the way.

## 3. The name

`BOOKS.downward` → **`BOOKS.undertow`**, `name: 'Undertow'`. The undertow is the current that drags
you off a beach into deep water: the book's exact motion, and a thing that happens *to* a
protagonist who never chose to leave.

⚠ This is a rename sweep, and CLAUDE.md documents both of its silent failure modes: field names also
exist as quoted **strings** (`'downward'` in test assertions, the `state.js` doc block), and a
display-name sweep **over-matches user-facing copy**. Run
`git diff -U0 src/config.js | grep -E "name: '|desc: '"` after it, plus a grep for the old token in
quotes.

## 4. Pollution is the through-line, not a mutator

Owner ruling: pollution is more than a mode. It is the connective tissue — one hazard family, five
presentations, each rung landing on a shipped shape.

| # | Chapter | The pollution | Mechanically |
|---|---|---|---|
| 1 | Surf | the tide line — caps, filters, monofilament off the pier | **static obstacles the button cannot move.** The thesis object, taught in chapter 1 |
| 2 | Shelf | ghost gear on the sand, a tyre, a crate | first **damage-both-sides** snags (the `predators` trap shape) |
| 3 | Reef | monofilament through the coral, a lost pot, drums | the labyrinth's walls are half natural, half garbage |
| 4 | Trawl | bags at mid-water, the boat's discharge | **drifting** obstacles that **silence the button** while overhead |
| 5 | Deep | ships, containers, leaking drums | pollution **is** the terrain — the arena is made of it |

Litter → snag → wall → verb-thief → world.

**The silencing bag is the book's single best object** and it only means anything in a book with a
skill button: it is the first thing in this game that takes a *verb* away. It is introduced in
chapter 1 as inert (an obstacle the shove fails to move — the lesson), and only becomes silencing in
chapter 4. That is a three-chapter setup for one payoff, which is the right amount for a mechanic
that removes the answer the player spent the book learning to rely on.

`MUTATORS.sticky` already excludes `['beyond', 'pond', 'shelf']` — add the other four Undertow ids
for the same reason (a flat −15% player speed in a book built on travel is an unstated tax).

## 5. The bar and the button

### 5.1 What already ships

Downward's slice 1 is **done**, so this design starts from a proven base rather than a hypothesis.

`stepRepulse` (sim.js:1127) gates on `if (!ch.lane && !ch.resource) return` — **any chapter declaring
a `resource` gets the button and the cast**, both on one line so a chapter cannot have one without
the other. The charge amplification ships: `REPULSE_RADIUS 340 → PULSE_RADIUS_AT_FULL 620`,
`REPULSE_FORCE 880 → PULSE_FORCE_AT_FULL 1500`, with `spend = min(charge, PULSE_CHARGE_COST)` so an
empty bar fires the known-good v5.21 shove unchanged. `REPULSE_CD 6.0`, `REPULSE_STUN 0.55`.

The bar's rules carry over from Downward §6:

- Its only job is to fuel the button. It does not *passively* scale damage, fire rate or speed.
- **No weapon spends it.** One sink, player-controlled.
- **A refill point is a place you can fight from, never a place you go to stop.** Every chapter
  below is checked against this explicitly.

### 5.2 One gimmick and one button effect per chapter — owner ruling 2026-08-13

Downward re-skinned a single shove five times (light flash, bio-flash, air burst, heat burst) and
called that a per-chapter identity. It is not: it is one game in five costumes. **Each chapter gets
its own signature AND its own button effect**, and the two are designed as a pair — the button is
the chapter's answer to the chapter's problem.

| # | Chapter | Gimmick (signature) | Button | What it answers |
|---|---|---|---|---|
| 1 | Surf | `tide` — the waterline moves the arena | **Thrash** — the shipped v5.21 shove | the crowd. This is the base verb, taught clean |
| 2 | Shelf | `shafts` — the light drifts, you follow | **Flare** — blow your light radius wide, stun what it lights | the dark. You spend sight to buy sight *now* |
| 3 | Reef | `warren` — corridors, and no navmesh | **Bolt** — a player dash through a gap | being pinned. You cannot shove in a corridor; you leave |
| 4 | Trawl | `trawl` — a wall crosses the map | **Breach** — tear a lasting hole in the net | the inert wall. The one thing you *can* do to it |
| 5 | Deep | `dark` — blood is the bar *and* the light | **Frenzy** — a brief burst of speed, ramming what you hit | everything, badly, for a few seconds |

**The invariant that keeps the no-spiral property, globally:** at zero charge every chapter's button
fires the plain chapter-1 shove. `stepRepulse` is already shaped for this — `t = spend / cost` is 0
on an empty bar, and lane chapters (no resource) already ride that path with byte-identical
behaviour. So each chapter implements "what happens when `t > 0`", and the floor is free.

**Two of these earn their keep beyond flavour.** *Bolt* is the structural mitigation for the Reef's
own biggest risk (§8.1) — a dash out of a plug is the answer a shove cannot give in a corridor. And
*Breach* is the book's thesis stated as a verb: the inert class is immune to you, except here, at a
price, once every six seconds.

⚠ **Frenzy conflicts with a standing owner ruling** and needs an explicit call. Downward §6 forbids
the bar touching damage, because a *passive* multiplier is imperceptible in its top half and a cliff
in its bottom. Frenzy is a discrete, opt-in, player-timed spend — legible in a way a passive
multiplier never is — but it does put damage on the bar in a window. Either accept it as the one
exception (recommended: it is the shark, and the exception is what makes the last chapter feel like
an ending), or make Frenzy pure speed and let the ram damage come from Fin Hit's movement coupling,
which is already in the chapter.

## 6. The chapters

### 6.1 The Surf — onboarding

**You are a bristle worm.** Art: `drawCentipede` re-tinted with shortened parapodia — one tapered
trunk driven by `spine(t)` with **six slither phases already baked** (`phases: 6`, `lean: 90`). A
marine bristle worm is a centipede that swims; this is the cheapest new protagonist in the book.

**Gimmick `tide`.** A global shore axis — precedent: `signature: { type: 'traffic', lanes: 2 }`
proves the engine takes a world-level directional structure. The waterline sweeps up and down the
beach on a slow cycle. Above it is dry sand: your Water bar drains ~3× and you are slowed. It is not
a wall and not instant death — chapter 1 teaches "the map is not neutral" with one enormous, slow,
obvious thing, before the game asks for anything clever.

**Button: Thrash** — the shipped shove, unmodified. Chapter 1's job is to teach the base verb and
one object it fails against (the litter), so that every later chapter can mutate it.

**Bar: Water.** Refill: **tide pools** — fixed circles of standing water left as the tide ebbs, which
shrink as they dry and are restored on the flood. Fixed, and disappearing.

*Refill-is-a-fight check:* a tide pool is where everything else got stranded too — the crab is
already in it — and the crowd follows you in via `stepStragglers`. You cannot leave early, because
the sand is worse than the crowd. ✓

**Roster** (all flags shipped):

| id | archetype | flags | why |
|---|---|---|---|
| `sandhopper` | normal | `dashBurst` | amphipods literally hop; a burst is what they do |
| `shorecrab` | tank | `unshakeable` | armoured, sideways, does not stagger |
| `gull` | fast | `diveBomb` *or* `aerialStrike` — see below | swoops from off-screen |

⚠ **`aerialStrike` and `drawOwl` are built and PARKED** (sim.js:1601/1880, render.js:2399) — a gull
is a re-tinted owl, sim and art both free. But config.js:3354 documents exactly why they were
parked: aerialStrike circles at `AERIAL_RADIUS` and dives to where a kiting player *was*, so
"a clawRake loadout cleared 0% of owls" — **it is unkillable in a melee-only chapter.** The gull may
only use `aerialStrike` if The Surf's weapon pool contains a ranged option. Otherwise use
`diveBomb`. Decide this when the pool is fixed; do not discover it from a playtest.

**Weapons:** two reused from the pond, plus new **Pinch** — seize the nearest enemy, hold it while
damage ticks, fling it into the crowd on release. Nothing among the 23 shipped weapons grabs.

**Constraints that bite:** the waterline must be outpaceable (well under `baseSpeed` 220; target
40–70 px/s) and *legible before it arrives* — on a portrait phone the horizontal half-view is ~195px,
not `viewRadius` ~465, so a thing 220px to the side is off screen while still "in view" by radius
(state.js:1504-1507 documents this trap). The Surf inherits the gentle onboarding numbers
(`maxAliveMul` in line with `body`), which means **The Shelf's balance table firms up one step** now
that it is chapter 2. That is a re-tune of one table, not a rebuild.

### 6.2 The Shelf — built; gains a button, changes nothing else

Shipped v7.51–v7.54. `CHAPTERS.shelf` spreads `CHAPTERS.pond`; signature
`{ type: 'shafts', cell: 760, chance: 0.62, r: 205, minDist: 420, driftAmp: 60, driftHz: 1.0 }`;
resource Light (`drain 2.2, refill 18, killRefill 1.5, max 100`,
`dark: { from 0.5, speedFloor 0.6, dim 0.86, lightFull 820, lightEmpty 210 }`); roster
copepod / krill / moon jelly; the lamp radius via `lightRadius()` (config.js).

You are **a small fish** here. Human presence: departed, gear left behind.

**Button: Flare.** Spend charge to blow your light radius wide for a few seconds and stun everything
it reaches. The chapter's whole fantasy is *you are the lamp*; the button is that fantasy made
active, and it costs the resource that **is** your sight — so a Flare buys you vision now against
going blind sooner. The light rig ships (`lightRadius()`, the two-object scrim, the eased falloff
texture) and stun ships (`REPULSE_STUN`, `MINE_STUN`, `HYDRANT_STUN`), so this is a spend path over
two existing systems.

**This replaces Downward's specced Photophore weapon**, and absorbs the "flashlight that stuns" idea
from the owner's list. As a weapon it would have been a second charge meter sitting next to the bar,
auto-firing on a timer; as the button it is the same effect, player-timed, on the meter that already
exists. The Shelf therefore ships **no new weapon** — it reuses `flagella` (starter) and `bloom`.

*Refill-is-a-fight check:* unchanged and measured — `scripts/charge-probe.mjs`, 5 seeded 300s runs,
three spend policies. Do not re-derive it; the numbers in config.js carry their own provenance.

⚠ Flare spends the bar that also drives `lightRadius()`, so a spend **shrinks your steady-state light
while the flash is up**. That is the interesting tension and also the one thing that could feel
punishing rather than tactical — probe it with `charge-probe.mjs`'s existing spend-policy axis
before tuning by eye.

### 6.3 The Reef

**You are a reef fish.** A warren of coral heads.

**Gimmick `warren`** — a labyrinth. See §8.1: this is the chapter that can fail.

**Button: Bolt.** A short, fast player dash. Nothing in the game dashes the player today — every
movement input goes through one normalized vector — so this is the book's most novel verb, and it is
deliberately the answer to the Reef's own structural risk: **you cannot shove your way out of a
corridor, so you leave through the gap instead.** An empty bar still gives you the shove, so a
player with no charge is never trapped by design, only inconvenienced.

**Bar: Air.** Refill: air trapped under coral overhangs and **lost scuba tanks**. Fixed, and
*enclosing* — you commit to a pocket.

*Refill-is-a-fight check:* the pocket **is** the trap; the crowd plugs its mouth; Bolt is how you get
out and the shove is how you buy the second you need to aim it. ✓

**Roster:** moray (`tank`, `latch`), damselfish (`normal`, `weave`), lionfish (`fast`, `pounce`).
All four flags shipped. `latch`'s slow reads correctly in a corridor; note `slowMul` composes by
`Math.min`, so it will MASK any chapter-level slow rather than stack — the trap that kept `latch`
off the moon jelly.

**Weapons:** **Squid Ink** and **Oxygen Tank**. The tank is the chapter's refill object weaponized,
which is the kind of double-duty that keeps a weapon list from reading as a shopping list.

⚠ **Squid Ink is the only idea in the book with no shipped precedent.** "Blind" means enemies inside
the cloud lose the player and continue on their last heading — but every seek path targets
`run.player` or a trail sample, and `nearestEnemy` (sim.js:4298) is the documented choke point for
every aim site. This is one new branch in the enemy movement step, not a config value. It is small;
it is not free. If it is cut, ink falls back to a slow-and-damage zone on the shipped `webZone`
shape, and the Reef ships with Oxygen Tank alone.

### 6.4 The Trawl

**You are a big fish.** Open water, no bottom in sight. Humans are back, as industry.

**Gimmick `trawl`.** A net wall crosses the map on a timer, from a direction, killing **both** sides
and aiming at nothing. Precedent for neutral-hurts-everyone: the asteroids (sim.js:1170, "hurts the
player on contact AND grinds" enemies) and the `predators` trap field, whose config block says "it
damages BOTH sides, and that IS the mechanic."

**Button: Breach.** Spend charge to tear a hole in the net that **persists** — a door you made, which
the crowd will also use. This is the book's thesis stated as a verb: the inert class is immune to
your shove, except here, at a price, on a six-second cooldown. It is also the chapter's only counter
to being caught between the wall and the crowd, which is the situation the signature exists to
create.

**Bar: Feed.** Refill: **the churned wake behind the trawl** — sediment and prey stirred up by the
thing trying to catch you. The refill is bolted to the danger, and there is nowhere else to get it.

*Refill-is-a-fight check:* you ride alongside a moving wall that kills on contact. ✓ (The strongest
version of the rule in the book.)

**Roster:** mackerel (`normal`, the **school-as-barrier**), tuna (`fast`, `dashBurst`), sea lion
(`tank`, `pounce`).

⚠ **The school is a moving OBSTACLE, not boids.** Downward §9.1 verified that sign-flipping
`stepEnemySeparation` does nothing: `resolveSeparationPair` early-outs at `distSq >= minSep²` where
`minSep = ENEMY_SEP_FRAC(0.65) × (rA + rB)` = **20.8px for two drones**, so the pass only ever
touches already-overlapping pairs and exerts no force at shoal range. Real schooling is a new boids
pass with its own neighbour radius. **A barrier you cannot cross is one entity with a shape** — the
same picture at a tenth the cost. Take the barrier reading; do not build boids.

**Weapons: none new.** Reuses two from Book 1, per Downward §8's "cut weapons rather than invent
mods." Its identity is the signature and the button, which is exactly what §5.2 is for. If it later
needs a weapon, the candidate is a **Longline** — a tethered hook that snags one enemy and drags it —
which claims the tether shape nothing else has.

**Constraint:** the sweep must be outrunnable but not ignorable. Target 60–90 px/s: above the
joystick's 33 px/s floor (`DEADZONE 0.15 × baseSpeed 220` is a hard *cut*, not a rescale, so the
expressible speed set is `{0} ∪ [33, 220]`) and near `KITE_MIN_SPEED` 100, above which
`stepStragglers` recycles the horde into your heading — which here is *correct*: running from the net
should bring the crowd with you.

### 6.5 The Deep

**You are the shark.** Ships, containers and drums are the terrain. Humans cannot reach.

**Gimmick `dark`, and the book closes its own loop nearly for free: blood is the bar AND the light.**
The Deep reuses the Shelf's shipped light-radius rig exactly as it stands (`lightRadius()`
interpolating on `darkness()`, the two-object scrim, the eased falloff), with **kills as the only
source**. You kill to see.

Why this is a rhyme and not a repeat: in chapter 2 **the world lights you** — the sun is given, the
shafts drift past, you follow. In chapter 5 **you light yourself with what you take**, and if you
stop killing you go blind. Same curve, inverted source. It also converts the shark's bloodlust from a
damage stat (which the bar is forbidden to be, §5.1) into a *survival need*, which is the only way
that fantasy is expressible under this book's own rules.

**Bar: Blood.** Kills only. **There is no refill point on the map at all** — the end of the refill
ladder, and the reason this chapter needs no `campsResource` equivalent.

**Button: Frenzy** — see the ⚠ in §5.2, which needs an owner call before it is built.

**Roster:** hagfish (`normal`, `webZone` — slime is literally a patch it leaves behind), viperfish
(`fast`, `dashBurst`), giant isopod (`tank`, `unshakeable`).

**New weapon: Fin Hit** — movement-coupled, damage where you turn, scaling with speed. This is
Downward's cut "Wake" shape with a better motivation: it is the shark's own body, and it is the one
weapon whose output the player controls with the verb they already have.

⚠ `ANOMALIES.stillness` (config.js:885 — damage climbs to `STILLNESS_MAX_MUL` over `STILLNESS_RAMP`
seconds standing still, dropping instantly on movement) **zeroes Fin Hit entirely**, exactly as
Downward flagged it zeroing Wake. It is `weight: 1` and unconditional, so it will be offered here.
State it in the card; do not treat it as a bug.

### 6.6 The Kraken (hidden)

Book 2's counterpart to The Blank: a **scripted boss chapter** on `stepBossScript` and the `BLANK_*`
machinery (sim.js:755+), which is the only boss system this game has. It lives in the ship graveyard
— the thing that got here first, in the garbage that got here before you.

Unlocked by winning The Deep at difficulty 5, mirroring The Blank's gate. It sits in
`BOOKS.undertow.hidden`, outside the ladder — and note The Blank survives by being hardcoded as a
string literal in seven places across main.js, ui.js and state.js, so the Kraken needs the
generalisation those seven sites never got.

## 7. Weapons and mod budget

**Four new across five chapters**, plus reuse — under Downward's six, and one fewer than the first
cut of this design, because Flashlight became The Shelf's button instead.

| Weapon | Chapter | Shape it claims |
|---|---|---|
| **Pinch** | Surf | **A grab.** Hold one enemy, then throw it. Nothing among the 23 holds anything |
| **Squid Ink** | Reef | **A blind.** ⚠ the one new sim branch (§6.3) |
| **Oxygen Tank** | Reef | **Thrown, detonates.** The refill object weaponized |
| **Fin Hit** | Deep | **Movement-coupled.** Output scales with the verb you already have |

Shelf and Trawl ship no new weapon; their identity is their gimmick and their button.

**Mod budget ~28 real mods, not ~42.** The 137 shipped mods are 89 `pct` + 23 `flat` + 16 `tier` +
8 `switch` + 1 `prism`, and each weapon's mod count tracks its number of independently tunable stats
almost exactly. Cut weapons rather than invent mods.

Two shipped traps to respect when writing them: an on/off mod that must be **epic** cannot be
`kind: 'switch'` (`makeWeaponModCard` returns null above normal for a switch *before* it reads
`values`) — use the Beam Prism idiom. And a new weapon **stat** must be registered twice, in
`buildReadout`'s whitelist (sim.js) and `STAT_LABEL` (ui.js), plus the French, or it is silently
absent from the pause build sheet.

## 8. What is actually at risk

Stated up front rather than discovered in a playtest.

### 8.1 Two of five chapters need corridors, and there is no navmesh

`stepObstacles` (sim.js:3114) only pushes the player and every enemy out of overlap — enemies seek
straight and get shoved — so a narrow mouth converts the crowd's spread into a solid plug of contact
damage against a player pinned by geometry. The Reef is this by design; The Deep is it at wreck
scale.

Mitigations, in order: **Bolt** (§5.2) is the designed answer and the reason the Reef's button is a
dash; corridors several player-widths wide; and **build the Reef only after the button has been
played against a crowd in a confined space**, never before.

### 8.2 Five button effects is the book's real new cost

Downward budgeted one effect and five tints. This design budgets five effects. Each is small and they
land one per chapter, and two ride entirely on shipped systems (Flare over the light rig, Frenzy over
speed muls) — but Bolt and Breach are genuinely new sim work, and the `t === 0` fallback must be
re-verified per chapter or the no-spiral floor silently rots.

### 8.3 The player's body is chapter-specific today via one boolean

`chapterHasKaiju` (render.js, ~10 sites: 9303, 11459, 11714, 11996, 12508-12563) is gated on
`CHAPTERS.skies.render.kaiju`. Four new player forms means generalising that boolean into a look id —
a real refactor, and the largest single art+code cost in the book. It is also what makes the growth
*visible* rather than implied, so it is not optional.

### 8.4 Smaller, but silent

- **Squid Ink needs a new seek branch** (§6.3). Everything else lands on a shipped shape.
- **`weapon-census.mjs` cannot measure any of this as-is** — it needs a charge column before any
  Undertow balance claim is quotable, and it may only be compared **within one invocation**.
- **Four new rosters × 3 = 12 new creature looks**, each needing a `ROSTER_LOOKS` entry *and*, if
  cast on a title card, a baked `src/cast/<id>.png` from `scripts/bake-cast.mjs`. Both fail silently
  — a missing look renders a generic archetype blob with no error. Run RA guards this and sweeps
  `Object.keys(CHAPTERS)`, so it will see them; keep its printed denominator honest.

## 9. Build order

1. **The Surf.** The book's new onboarding chapter, the `tide` gimmick, the bristle-worm player form
   (which forces the `chapterHasKaiju` generalisation early, where it is cheapest), Pinch, and the
   `undertow` rename. Re-tune The Shelf one step firmer as chapter 2.
2. **The Shelf's Flare.** One chapter, one button, over two shipped systems — the cheapest possible
   test of whether §5.2's per-chapter-button ruling actually produces distinct chapters, and it
   needs no new biome, roster or art to answer that.
3. **The Trawl.** Its gimmick is the book's identity and the school-as-barrier reframe is the
   riskiest *cheap* thing. Breach proves the "one verb against the inert class" idea.
4. **The Reef.** Only after the button has been played against a crowd in a confined space. Bolt
   ships with it, because the chapter is not safe without it.
5. **The Deep.** Reuses the light rig; needs the Reef's corridor lesson first.
6. **The Kraken.** Needs the seven hardcoded Blank sites generalised.

Step 2 is deliberately out of chapter order: it is the smallest experiment that can falsify the
single most expensive ruling in this document.

Honest cost, carried from Downward §11.1 and unchanged: **~1 day to build a chapter, 20–32 releases
over 25+ days to make it good.** 78% of this repo's releases landed after all seven Book 1 chapters
existed. The settling tail is the cost, not the build.

The dev toggle (`meta.dev`, seven taps on the title coin badge) exists so the WIP book can be played
on a phone against the live URL. Downward §11.2 records the risk of building gated and it still
stands: work that does not face a player stops moving. Use the toggle.
