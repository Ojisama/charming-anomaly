# The Wreck — Undertow chapter 4 (design)

Status: **owner rulings taken 2026-08-17**, spec written the same day. Extends
`2026-08-13-book-2-undertow-design.md`; changes nothing already shipped in it.

Undertow becomes six chapters: `surf, shelf, reef, **wreck**, trawl, deep`.

---

## 1. The one-line difference from every other bar in the game

> **Every resource bar in Book 2 is a punishment meter. This is the one you push up.**

Humidity, Clarity, Air, Feed and Light all sit at a comfortable full and *cost* you as they empty —
slower, blinder, drowning. Bloodlust starts full and falls on a clock, and the only thing that puts
it back is **killing**. There is no refill circle anywhere on the map.

That makes the book's own refill rule literal rather than merely satisfied:

> *"A refill point is a place you can fight from, never a place you go to stop."*
> Here the refill **is** the fight. There is nowhere to go.

## 2. Where it sits

|  | Reef (3) | **Wreck (4)** | Trawl (5) |
|---|---|---|---|
| You | reef fish, `formScale` 1.3 | **bigger fish, 1.42** | big fish, 1.55 |
| Humans | only wreckage | **one dead boat, whole** | back, as industry |
| Refill | fixed in a tunnel | **kills, and nothing else** | welded to the danger |
| Bar's job | empty air drowns you | **full bloodlust hits harder** | feed is your speed |
| Button | Burst a wall | **Lunge — the dash-bite** | Breach the net |

The arc still reads: you were prey in a tunnel, you are the thing feeding on a wreck, you will be
what the boats come for. The Wreck is the chapter where you stop reacting.

**Name/tagline:** `The Wreck` — *"stop and you starve"*. Icon ⚓.

## 3. The place

A trawler on its side on the bottom, holds open, rotted catch spilling out. Everything in the ocean
has come to it and they are all already feeding — you are the newest mouth, not the first.

Pollution through-line: **the boat is the pollution**, and it is the first human object since The
Surf's tide line. Dead industry here, living industry one chapter later. Nothing is leaking, nothing
is collapsing, nothing is snagging you — see §4.

## 4. There is no signature hazard — owner ruling 2026-08-17

Asked to pick a threat class that does not know you exist (ghost net / settling hull / leaking
cargo), the owner ruled: **"being an aggro level is sufficient."**

So `signature: null`, on the `body` precedent. The chapter's gimmick is the bar, and the whole of its
identity is the tempo it forces. This is the cheapest chapter in Book 2 by a wide margin and that is
deliberate — the four before it each bought a spatial system, and a fifth would be the fourth field
of streamed circles in a row.

`obstacles` still ships (hull plates, ribs, containers) because that is the shipped streamed-circle
field and it is what makes the place read as a wreck rather than open water. It is scenery with
collision, not a mechanic.

## 5. The bar — Bloodlust

**Not `Frenzy`, and this is not a taste call.** `frenzy` is taken three times in the tree: the
`frenzied` elite affix (`FRENZY_HP_FRAC`/`FRENZY_SPEED_MUL`, sim.js:1846), the flagella weapon mod
`run.weaponMods.flagella.frenzy` (sim.js:6786), and **`'Frenzy': 'Frénésie'` is already a key in
fr.js** — a chapter resource under that name silently inherits a weapon mod's French, which is
CLAUDE.md's documented display-name collision, verbatim. `Blood` is nearly as bad: `Blood Pact` and
`Blood Money` are both shipped anomalies and Blood Pact is *itself* +damage-per-kill. `Bloodlust`
greps to zero in `src/` and in `fr.js`.

| | |
|---|---|
| **Starts** | full. The opening 20 seconds are the strongest you will be until you earn it back. |
| **Drains** | on a clock, always, everywhere. No sandbar, no dark, no place makes it worse. |
| **Refills** | **on a kill, by a flat amount.** Nothing else. |
| **Second job** | drives **damage AND fire rate**, from ×1.0 at empty up to a peak at full. |
| **At zero** | **starving** — damage over time until you kill something. |

**The curve floors at 1.0, it does not tax you.** Humidity's licence (§5.3 of the book spec) was
spent on an onboarding chapter and bought a multiplier whose *bottom* was below 1. This one is
entirely above it: an empty bar deals exactly the damage the rest of the game deals, and the bar is
pure upside. That matters for the death spiral — a starving player is slower to kill but never
*weaker* than baseline, so "I stopped killing" cannot compound into "I now cannot kill."

**Why the DoT is not The Reef's drowning again.** Same mechanism, opposite problem. Air is a *place*
problem — you are dying because you did not navigate to a pocket, and the fix is on the map. Bloodlust
is a *tempo* problem — you are dying because you stopped fighting, and the fix is in front of you.
The Reef punishes bad routing; The Wreck punishes hesitation. They also never appear in the same run.

### 5.1 Starting numbers, and they are starting numbers

```js
resource: {
  name: 'Bloodlust', drain: 5.0, refill: 0, killBase: 5, killRefill: 2, max: 100,
  damage: { floor: 1, peak: 1.8 },
  rate:   { floor: 1, peak: 1.5 },
  starve: { dps: 5 },
}
```

`refill: 0` because there is no field to stand in — The Trawl is the precedent for a `resource`
chapter whose `refillSpec()` is null.

**None of these six numbers may be quoted until they are measured.** `drain 5.0` empties a full bar
in 20s; `killBase 5` holds it steady at exactly 1 kill/s, and *nobody knows what this chapter's kill
rate is* because the chapter does not exist. CLAUDE.md's own worked example is a `killRefill` read
against the wrong chapter's kill rate. The build gate is a `charge-probe.mjs` run on this chapter
with its spend-policy axis, and the drain/killBase pair fitted to the measured rate — not to the
table above.

## 6. The button — Lunge

A dash-bite. Spend charge → dash forward, heavy damage to the first body you reach, and **a kill by
lunge banks a large chunk of Bloodlust**. Spend the bar to feed the bar: a player who commits
accelerates, a player who hoards stalls.

At zero charge it is the shipped shove, unmodified — the global invariant (`t = spend / cost` is 0 on
an empty bar), so a starving player is never structurally trapped.

⚠ **`lunge` is free as an identifier but the word appears in prose** at sim.js:1927 and :2284,
describing `dashBurst` and `pounce`. Nothing breaks; a future reader grepping "lunge" gets three
unrelated hits. Acceptable, and named here so it is a known cost rather than a surprise.

## 7. The tell — the owner picked the invisible option, so this is the design's job

The owner chose "you hit harder and faster" over "you grow", with the note in the question that a
multiplier reads as nothing on screen. That stands as his call. **Making it legible is not a
re-litigation of it**, and it is not optional: this repo shipped a freeze that tinted nothing and
"cold does nothing" is what it looked like.

Three tells, **all on contract fields render.js already reads, and zero new event types**:

1. **`pHot`** — the berserk red silhouette rig already sits over the player (render.js:15946), an
   alpha-blended red copy of whatever body shape is current. Its alpha reads `buffs.berserk` today;
   in this chapter it also reads the bar. At full Bloodlust you are visibly red. **This is one line**
   and it reuses a baked rig, a tint constant and a tuned blend ceiling.
2. **The HUD bar** — already ships for every chapter declaring a `resource`.
3. **Starving** is `{type:'hurt', dmg, dot:true}`, exactly as drowning is — the shipped red vignette,
   shake and flash, and already silenced for audio by main.js's `if (e.dot) continue`.

No `{type:'bloodlust'}` event. An event with no consumer in render.js *or* `SFX_FOR_EVENT` is the
freeze scar; and a chime on every kill is the nagging SUBMISSION's expiry was denied.

## 8. Roster

Three new ids, **zero new behaviour flags** — every flag below already ships.

| id | archetype | flags | why |
|---|---|---|---|
| `pollack` | normal | — | the shoal over the wreck. It is food, and a frenzy chapter needs a baseline that simply arrives |
| `dogfish` | fast | `pounce` | a small shark. It lunges at you the way you lunge at things |
| `wolffish` | tank | `guard` | **the counterweight.** `guard` alternates GUARDED (direct hits do nothing) and OPEN on a timer, so the one chapter that rewards chewing everything contains one thing you cannot chew on demand |

`wolffish` is the design's answer to "is this one-note?". Without it the optimal play is hold the
stick down; with it, the chapter asks *which* thing you bite, under a clock that punishes waiting.

`eliteFlags: ['soapTrail']`, consistent with all four shipped Undertow chapters.

## 9. Weapons

One new, two reused — the book's own pattern (The Reef reuses `stinger`, The Trawl reuses `hole`).

- **`gnash` (new, starter)** — a short forward bite arc on a fast cadence, whose damage rises the
  closer the target is. The chapter's thesis as a weapon: it is bad at range and there is no reason
  to be at range here. Geometry is `flagella`/`clawRake`/`roar`'s shipped sector, so it is a new
  bake and a new tuning table, not a new system.
- **`barnacles`** (from The Surf) — a wreck is *encrusted* with them. Marine art already, same book.
- **`roar`** (from The Skies) — a low-frequency boom with knockback. An abstract cone, which is
  exactly what CLAUDE.md says to prefer when borrowing across biomes.

⚠ **Borrowed-weapon art check is a build step, not a judgement call.** `git grep -n "T.barnacles\|T.roar" src/render.js` and look at what each bake actually draws before believing this list — the
Trawl shipped an orange autumn leaf into mid-water on reasoning that was otherwise sound.

## 10. Balance — starting table, same caveat as §5.1

```js
balance: { spawnMul: 0.95, enemyHpMul: 0.90, maxAliveMul: 0.95, xpMul: 0.85 }
```

Reasoning, so the probe knows what it is testing: a bar fed only by kills needs **more bodies and
softer ones** than the chapters either side (reef `0.76/0.95/0.75`, trawl `0.8/1/0.85`), or the bar
cannot be held up by a competent player and the chapter is a starvation simulator. `xpMul` comes
down because the kill count comes up and level pace should not.

## 11. The whole code change

| File | Change | Size |
|---|---|---|
| config.js | `CHAPTERS.wreck`; insert `'wreck'` into `BOOKS.undertow.chapters` | data |
| config.js | `CHAPTER_SPINE.wreck = 'Wreck'` — the title bookcase's spine label, and **run XX walks this table**, so it needs French in the same commit | 1 line |
| config.js | `MUTATORS.sticky.exclude` gains `'wreck'`. All five Undertow ids are already there, and a slow is worst here: slower means fewer kills means starving | 1 line |
| config.js | `resourceDamageMul` generalised to `lo + (hi - lo) * t`, `lo = d.floor ?? 1`, `hi = d.peak ?? 1`. **Byte-identical for The Surf** (floor .7, no peak → .7 + .3t) | 2 lines |
| config.js | `resourceRateMul` — same curve on `res.rate`; `STARVE_TICK`; `LUNGE_*` | ~10 lines |
| sim.js | kill site (:5039) gains `+ (_res.killBase ?? 0)`. Undefined in all five shipped chapters → `?? 0` → no behaviour change anywhere | 1 line |
| sim.js | `globalFireRate(run)` — one helper replacing the **duplicated** `p.fireRateMul * (1 + run.passives.fireRate)` at :5444 and :5503, × `resourceRateMul`. The duplication is pre-existing and is CLAUDE.md's #1 defect class; folding it is the fix, not a refactor of convenience | ~4 lines |
| sim.js | `stepStarve` — `stepDrown` in shape, gated on `resource.starve`, returns true on death like its siblings | ~12 lines |
| sim.js | `stepRepulse` Lunge branch, gated on `CHAPTERS[id].lunge` | ~25 lines |
| render.js | `pHot.alpha` also reads the bar; wreck floor/props; 3 roster bakes; `gnash` bake | the bulk of the work |
| fr.js | every new string, **owner picks the French** | data |
| ui.js | **nothing** — `STAT_LABEL` derives from `STAT_KEYS`, chapter cards are data-driven | — |
| test/sim-test.js | new scenario, mutation-proved | ~40 lines |

**Four shipped source-text lints already cover most of this and must go red before they go green.**
run RA (every roster id has a `ROSTER_LOOKS` bake — and it must be run over `Object.keys(CHAPTERS)`,
never `CHAPTER_ORDER`, which is book 1 only), run XX (French coverage over config tables, including
`CHAPTER_SPINE`), run EV (every `{type:'x'}` sim emits has a render case, an `SFX_FOR_EVENT` entry or
a line in `SILENT_BY_DESIGN`), run VO (roster flags and elite affixes resolve on the other side).
Adding to these is cheaper than any new mechanism and is where this chapter's real regressions live.

**Save migration: none, and this is verified rather than assumed.** `undertow` is `wip: true`, so no
real save holds Undertow progress. `ensureChapterMeta` creates a locked entry for any id it has not
seen (state.js:220) and `nextChapter` reads the book's array, so inserting `'wreck'` makes
`nextChapter('reef') === 'wreck'` and `nextChapter('wreck') === 'trawl'` with no other edit. A dev
save that already unlocked `trawl` keeps it — the ladder gains a locked rung, never a dead end. R2
holds: nothing is renamed, repurposed or deleted.

## 12. Risks

1. **The numbers in §5.1 and §10 are guesses and are labelled as such.** The single largest failure
   mode here is shipping them. Gate: `charge-probe.mjs` on this chapter, both movement policies,
   before any balance claim leaves the branch.
2. **Death spiral.** Mitigated structurally by the 1.0 floor (§5) — but `starve.dps 5` against a
   player who cannot find a body is still a clock. Probe with the **mortal + kiting** rig; a
   stationary or immortal rig cannot answer "can you survive this", and quoting one that did is a
   documented scar in this repo.
3. **`guard` on the tank may over-correct.** `wolffish` exists to stop the chapter being one-note; if
   it instead makes the bar unholdable it becomes flagless and the counterweight moves to the elite.
4. **The `pHot` tell competes with the hurt vignette.** Both are red. Shoot a starving player at full
   HP and a healthy player at full Bloodlust, at two viewports, and confirm they do not read as the
   same state.
5. **`roar` and `barnacles` art unverified** (§9).

## 13. Build order

Two phases, so there is something playable before the art lands.

- **Phase 1 — it plays.** config entry, the four sim/config changes, Lunge, `stepStarve`, the `pHot`
  tell, tests. Reuses The Reef's art wholesale. This is the phase the probe runs against.
- **Phase 2 — it looks like a wreck.** Floor and props, three roster bakes, the `gnash` bake, the
  cast thumbnails (`scripts/bake-cast.mjs`), French.
