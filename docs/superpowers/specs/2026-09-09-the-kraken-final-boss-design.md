# The Kraken — hidden final boss chapter (design)

Status: **design in iteration, 2026-09-09.** Expands `2026-08-13-book-2-undertow-design.md` §6.6
("The Kraken (hidden) … Design deferred"), which this replaces. Book 2's hidden chapter, unlocked by winning The Deep at difficulty 5 — mirroring The Blank (Beyond
d5). Not a survival run:
a **scripted parry boss** — a ring of tentacles (4, 6 or 8 — the difficulty dial) shielding a head, a
wave and a new pattern as the arms break, victory on the head's death.

This is the book's punchline made into a fight. Undertow's arc ends "with something older living in
the rubbish"; The Kraken is that thing, and the wreck field you swam *between* in The Deep is its
body.

## Identity

- id `kraken`, name **The Kraken**, tagline the owner's line — *"the graveyard is its domain"* — icon 🐙.
- **You are the diver in the deep dark**: the wreck field you swam *between* in The Deep, where the
  field is no longer scenery. The boss owns a **light rig of its own** (The Deep's dark rig is not
  reused) — here the refill is your parry, not a light that bites, and there are no maws. The domain,
  its waves and its weapons are all the Kraken's own; **nothing in the chapter reads `CHAPTERS.deep`
  or the Twilight**, so the Deep/Twilight refactor cannot block or perturb this build.
- The boss is **the head plus a ring of tentacles** — **4 on D1, 6 on D2, 8 on D3** (the difficulty
  dial, see Difficulty). The head is the creature; the tentacles are what it wears and what hides it. The pollution through-line, literalised: the arms are **furred with the
  Trawl's gear** — nets, longlines, chain — everything the book made you dodge is its fur. The junk
  didn't sink the ships, it *marked* them.
- Fiction: it was here before the ships. You can outswim people and you can outswim what they threw
  away, but you cannot outswim what was already down here when they started throwing.

## The coherent spine: parry the shield off a thing that was hiding

One idea, deepening across the fight: **the kraken is a place that moved.**

- **Two-layer target.** The tentacles are tanky and they sit between your weapons and the head.
  A hit aimed at the head that crosses a living, resting arm lands on that arm instead. The head is
  only hurt by hits that reach it through a gap.
- **The parry is the counterplay, and the only fast way to hurt the arms.** Normal weapons chip a
  tentacle slowly (it is tanky). Parrying a tentacle's own attack negates the hit *and* lands a real
  chunk on that arm; a perfect parry, a big one.
- **An arm that is attacking cannot block.** The moment an arm swings at you its sector of the shield
  is open. So the instant you parry, you have both wounded the shield and opened it — the more you
  parry, the more the head takes. That one sentence is the whole fight.
- **The two forces that keep it tense.** Fewer arms = *less* blocking (the head bared earlier), which
  on its own would collapse the fight into "stand and shoot the head." The offset: **every two arms
   down, the kraken returns with a nastier pattern.** The shield thins and the attacks escalate, so
   pressure holds flat across the blocks instead of ramping to trivial. Protect this in tuning.

The head is **one HP pool that persists across blocks** — it hides and comes back with the same HP,
taking damage whenever it is bared. A strong player can drop it early and skip the rest; a grinding
player fights to the last block. No extra code, free difficulty scaling.

## The parry contract (the one new mechanic in the book)

The button here is the book's second verb taken to its limit: **a parry, with the global floor
intact.** The invariant is unchanged — *at zero charge, or with nothing to parry, the button is the
plain shove.* So the button is **reactive only when an attack is in its window**: press inside a
telegraph's parry window → parry; press with nothing to parry → the known-good v5.21 shove. Only "what
happens in the window" is new.

**The build seam** (review fold, 2026-09-09, three adversarial passes). The floor is *not* free the way
the first pass assumed: declaring the Light `resource` is what makes the button exist at all
(`stepRepulse`'s `!ch.lane && !ch.resource` gate), and a `resource` chapter **automatically spends
charge** on the shove (`sim.js` `stepRepulse`, `spend = min(run.charge, PULSE_CHARGE_COST)`). Left
alone, a parry press would double-fire a shove that drains the bar and re-arm it — an undesigned third
flow in a rig that has exactly two. So the parry is wired the way the book's other second verbs are
(the Surf's `shorebreak`, the Reef's `burst`, the Shelf's `clear`, the Deep's `scent` — same press,
same floor):
- `CHAPTERS.kraken` declares `parry: true` (the second-verb flag) and `resource.noSpend: true` (the
  button does not spend Light; parry is the bar's only writer, beside passive drain).
- `stepRepulse` gets **one** chapter-gated branch at its single press site: if any arm is in its parry
  window → parry (negate + chunk that arm + refill Light; blaze if the bar was full) and return; else it
  falls through to the floor shove, which with `noSpend` is the base shove (the v5.21 read, unchanged).
- A *successful* parry does not eat the 6 s shove cooldown (the bar's rhythm is the parry's, not the
  shove's); only a mistimed floor shove pays it. A short `KRAKEN_PARRY_CD` stands in for the full
  `REPULSE_CD` on the in-window path.

**The windows** (phone-sized; the reaction floor is ~150–200 ms; per-rung values in the Difficulty
table — ~210–320 ms good, ~90–140 ms perfect across the three rungs):

- **Good** — press in the last ~210–320 ms before impact. Hit negated, the attacking arm takes a
  medium chunk (~25% of its HP), the bar refills a little.
- **Perfect** — a tighter sub-window (~90–140 ms) at the very end. Hit negated, the arm takes a big
  chunk (~50%), the bar refills more.
- **The tell is the one genuinely new render thing.** Shipped telegraphs (0.55–0.9 s fuses) are
  *get-ready* telegraphs. A parry needs a second-stage **"now" tick** at the window's start: a flash
  on the telegraph plus one SFX (rare enough to earn a `SFX_FOR_EVENT` entry). Without the tick the
  window is unplayable on a phone. **The tick and the blaze must not read as the same thing** (review
  fold, M2): the tick is a sharp 1–2-frame pale pop *on the attacking arm* (a rare SFX); the blaze is a
  slow radial bloom from the head at full radius (its own SFX, or none). D3's double telegraph needs the
  two most distinct — at that cadence a single "flash" vocabulary would be unreadable.

**Blocking — the invariants** (the precise model, raycast-coverage vs absorb-by-nearest, is pinned in
the build; these two are the contract):

- *Fewer arms → strictly less blocking.* Coverage is a function of how many arms are alive and where.
- *An arm mid-attack blocks nothing.* Its sector is open for the duration of the swing.

**The bar is light, and it is revenge.** It is your sight radius — the boss's own rig on the shipped
scrim/radius machinery (a new `resource` on `CHAPTERS.kraken`, not The Deep's) — but the refill is
the fight, not the map: **parries refill it, nothing else does** (there are no anglerfish in the boss's
domain, and it must never read as an HP bar — so a hit taken does *not* drain it). Its passive drain
is the boss's own and tuned gentler, so the bar is a *skill bank*, not a clock. At full, the next parry
**blazes**: the attacking arm breaks outright regardless of its HP and the arena flashes to full radius
— the rig at 1.0, the one frame that must stay dark the rest of the fight. One meter, two readings
(sight + a charged counter), and it is the book's light grammar landing as a boss move.

**The sight floor** (review fold, B2). The bar is also the telegraph's legibility, so it may not read to
zero: `dark.radiusEmpty` is floored at a readable radius (not The Deep's 0.06 — the near-field stays lit
enough to read the next "now" tick even at an empty bar), and the fight opens at a readable Light level
(`KRAKEN_LIGHT_START`), not 0, so block 1's teach is legible from the first frame.

**Level economy.** Each tentacle kill pays **1 level** (as XP, chained like the Blank's phase levels —
`BLANK_PHASE_LEVELS` pays "as xp, chained by `stepLevelUp`"; same shape). The arms pay **up to N**
levels (N if you clear every block; fewer when the head dies early), and the waves top it up — the
head's death is the win, not a level source.

⚠ *Iterate:* that many level-up screens inside one boss fight is a lot of modal interruption (8 on
D3). If it plays choppy, bank the tentacle XP and pay the level-ups on the hide instead — same total,
fewer screens. The "1 level per arm" call is the owner's; only the *cadence* of the screens is open.

## Structure — the script

A **scripted boss chapter**: `stepBossScript` is the only spawner. Continuous spawning, formations,
elites, random anomalies and the 300 s victory timer are all off (identical to The Blank). One twist
on the Blank's model: **its phase changes are driven by boss death; the Kraken's are driven by
tentacle count.** The head never "dies" between blocks — it hides.

**The arm count is the difficulty dial — 4 (D1), 6 (D2), 8 (D3). The boss starts with N arms and
returns with two fewer each block until the head is bared; the pattern ladder advances one step per
block (Lash first, the chase always last). The fight **opens with a wave** (the graveyard wakes) —
exactly the Blank's script (wave → P1 → wave → P2 → wave → P3) — and each non-final block ends in a
hide + wave; the final chase block does not. That is **3 waves on D1, 4 on D2, 5 on D3** (the opening
wave + one after each non-final block). The full D3 ladder (8 arms, 5 blocks):**

| Block | Arms | Pattern | Between blocks |
|---|---|---|---|
| 1 | 8 | teach: the **Lash** | → hide + wave |
| 2 | 6 | adds the **Grip** | → hide + wave |
| 3 | 4 | adds the **Coil** | → hide + wave |
| 4 | 2 | everything (the current moves, denser) | → hide + wave |
| 5 | **0** | the head, fully bared — **the chase** | — victory on head death |

- **The distinct patterns are the real payload: D1 faces 2, D2 faces 3, D3 faces 4.** A lower rung is
  the same ladder with fewer arms — fewer blocks and a shorter ladder, so the deeper moves (Grip,
  Coil) drop off while the Lash teach, the denser pre-chase climber, and the chase stay:
  - **D1 (4 arms)** — 3 blocks: **Lash** → (Lash, denser) → **the chase**. Patterns: **Lash, chase** (2).
  - **D2 (6 arms)** — 4 blocks: **Lash** → **Grip** → (both, denser) → **the chase**. Patterns: **Lash, Grip, chase** (3).
  - **D3 (8 arms)** — 5 blocks: **Lash** → **Grip** → **Coil** → (all, denser) → **the chase**. Patterns: **Lash, Grip, Coil, chase** (4).
- A block ends when its **two** arms are down (threshold, not per-arm), **or earlier on head death**
  (early death allowed — that is the skill expression, no threshold to wait for).
- The arms pay up to that many levels (one per arm — fewer if the head dies early; the waves add more). See Level economy above.
- The wave is the breather and the XP source, on The Blank's gap-door: the kraken drops below the wreck
  field, the field spawns its own dead in a ring with a 90° gap door, clear-or-timeout on the boss's own
  constants (`KRAKEN_WAVE_GAP` π/2, `KRAKEN_WAVE_TIMEOUT` 12 s, ×⅓ XP via `KRAKEN_WAVE_XP_MUL`; the sim
  shares one `stepScriptWave` helper, not a copy of `stepBossScript`'s wave half). The timeout is
  **shorter than the Blank's 20 s and always advances** — the waves are breathers, not sub-fights
  (review fold, M3): a full 20 s of fresh dead reads as a second fight and resets the tension the block
  just built, so clearing is the bonus, not the cost.

## The waves — the graveyard wakes

The kraken is the domain; the waves are *its* field. **The roster is the Kraken's own graveyard dead** —
new, boss-scoped ids in `CHAPTERS.kraken.roster`, written against the game's chapter-agnostic behaviour
flags, with **no read on `CHAPTERS.deep.roster` or the Twilight** (the Deep's roster is mid-merge and
must not gate this). A small set (3–5), built around the one enemy that is unambiguously the boss's own:

- **a wall enemy (working name *barnacle*)** — anchored, very slow, high HP, it holds the gap door and
  the lanes. The anchor shape; needs `ROSTER_LOOKS` and a pass through designing-an-enemy.
- **the rest of the graveyard (2–4 more; ids and shapes TBD at build)** — designed for this boss via
  designing-an-enemy on the existing flags (a fast one, a latching one, a splitter, …), so the waves
  read as *the field's own dead*, not a borrowed chapter roster.
- No elites, no random anomalies. Kraken-wave skins in the Trawl's rust and net-grey, not the white of
  the Blank.

## The patterns (escalation, shapes TBD)

Each block adds one *new* move and keeps the rest — except the denser pre-chase climber, which
densifies what is already on the field rather than adding one — so the player is always reacting to a
larger vocabulary. The moves the fight can reach are capped by the arm count, so a lower rung simply never
learns the deeper moves — **D1 meets 2 patterns, D2 meets 3, D3 meets 4** (the denser pre-chase
climber, P4, reuses the moves already on the field and is not a new pattern). Shapes are to be
designed (designing-an-enemy); the *role* of each is fixed:

- **P1 — the Lash** (all rungs, the teach). A telegraphed tentacle slab sweeps a band across the
  arena. The swinging tentacle is the parry target. Teaches the window, the tick, the block-open.
- **P2 — +the Grip** (present on D2 and up — first shown in block 2). An arm latches and yanks the
  player toward the head (bind-node style), pinning; parry at close range to break. Teaches "an
  attacking arm cannot block" — the pin is the opening.
- **P3 — +the Coil** (D3 only — first shown in block 3). A constricting ring of arms closes
  the arena from the edges; survive the gap, *not* parryable — the first environmental (non-parryable)
  pattern, so the verb keeps meaning by not being the only answer.
- **P4 — the denser climber** (every rung that has a block before the chase). The moves already on the
  field (Lash; Lash + Grip; Lash + Grip + Coil) run at a denser cadence. Not a new move — it is the
  "the whole vocabulary at once" beat right before the finale.
- **P5 — the chase** (all rungs, always the finale). 0 arms, the head is bared and it *hunts*: the same
  170 chase the Blank's P3 runs (`BLANK_BOSS_SPEED_P3`, catch-up, the P3's milder desperation) — but the
  Blank's P3 runs the empty white plane, whereas this one runs you across the **wreck field**, weaving
  hulls and drums. The head itself is the threat, nothing between it and you. The last stand.
  **One signature beat** (review fold, M4): the head is *also* killable while it chases, and every ~4 s
  it does a telegraphed **lunge** between the hulls (`KRAKEN_HEAD_LUNGE_T`) — the one move of its own
  that keeps the finale from reading as "the Blank's P3 with props."

⚠ *Iterate (open):* confirm on a ~195 px half-view that the wreck-field chase + the killable bared head
+ the lunge read as a distinct finale, not the Blank's P3 with props.

## Difficulty — 3 rungs, named modifiers (skill, size, and a little damage)

The ladder caps at **3** (per-chapter override of `MAX_DIFFICULTY`, as the Blank does — **the cap is
3, no D4**). Difficulty is now *structural as well as skillful*: each rung is a smaller boss (fewer
arms, a shorter pattern ladder) **and** tighter in time and tolerance, plus a touch more head HP. So
the three rungs feel different in two dimensions — how many arms shield the head, and how many
patterns you must master — not just "the same fight a little faster." Cumulative named modifiers,
shown where the anomaly hint sits:

| Rung | Name | Tentacles | Patterns | Parry window (good/perfect) | Telegraph fuse | Light drain | Head HP | Waves |
|---|---|---|---|---|---|---|---|---|
| **D1** | *First Light* | **4** | 2 — Lash, chase | 320 / 140 ms | 0.90 s | 1.0× | 1.0× | 3, easy, slow |
| **D2** | *The Current* | **6** | 3 — +Grip | 250 / 110 ms | 0.70 s | 1.3× | 1.15× | 4, +1 |
| **D3** | *No Light* | **8** | 4 — +Coil | 210 / 115 ms | 0.55 s | 1.6× | 1.30× | 5, full graveyard + double telegraph |

- **Pattern cadence** (how fast the on-field moves rotate within a block) also steps up a little:
  D1 1.0×, D2 1.15×, D3 1.30× — folded into the rung, not a separate row.
- **Parry windows tightened a step** from the first pass (D1 350/150 → 320/140, D2 280/120 → 250/110,
  D3 250/100 → 210/90), **then D3's perfect was widened back 90 → 115 ms** (review fold, 2026-09-09):
  90 ms sat at phone-tap latency and read as luck; the good window still stays above the ~150–200 ms
  reaction floor on D3 (210 ms) so it remains a reflex, not luck.

The D3 **double telegraph** (two arms swing in close succession) is the top of the skill curve — the
single most phone-risky element. ⚠ *Iterate:* confirm it is legible on a ~195px half-view with at
most 1–2 parryable strikes in flight; the reaction floor is ~150–200 ms.

Standard HP/coin difficulty multipliers still apply underneath (already wired).

~~D4 — "What's Down There"~~ is **void**: the structural dial is now *inside* the three rungs (4/6/8
arms, 2/3/4 patterns), so there is no D4 to add a 9th arm on top of. The cap is 3.

## Unlock, save, UI

- `kraken` lives **outside `CHAPTER_ORDER`**: never in the daily rotation, never in the chapter-unlock
  chain. New check in `endRun`: winning The Deep at difficulty 5 sets `meta.chapters.kraken.unlocked`,
  exactly the shape of the Blank's Beyond-d5 unlock.
- The Blank's hardcoded sites — the **seven code sites** (main.js:169/177/190/783, state.js:107,
  ui.js:624/3075) plus the `hidden` data entry (the `hidden` array on each book's `BOOKS` entry —
  book1's `['blank']`, and the undertow line where the Kraken's own id gets added) — become a small
  `hiddenChapters()` list. The second hidden chapter is the moment that generalization pays for itself.
- Chapter select: a `???` mystery card appears once The Deep's difficulty 5 is unlocked (one win away),
  hint *"win The Deep at level 5"*; the full card only when `kraken.unlocked`.
- The Deep's star row shows its 5th gold star when `kraken.unlocked` — the same freebie the Blank gives
  the Beyond.

## Loadout and rewards

- Weapon pool and starter are **the Kraken's own** — nothing is read from `CHAPTERS.deep`'s pool or
  starter (both mid-merge), so the refactor cannot perturb the boss's build. Two shappable shapes,
  decide at build: (a) a small **dedicated boss set** designed for this chapter + its own starter, or
  (b) a **fixed snapshot** of the already-shipped Surf→Wreck pools (excluding Deep/Twilight) + its own
  starter. Either way the starter is light-based (the domain is dark) and the pool never includes a
  Deep or Twilight weapon.
- Winning pays out through the normal `endRun` path; summary shows a one-off badge for the hidden
  unlock when it fires.
- **Victory line** (the book's landing): *"It was here before the ships. It will be here after you."*
  ⚠ *Iterate:* alt — *"You took its arms one by one. The sea keeps what you leave."*

## Events and testing

- New sim events (parry, parryPerfect, blaze, tentacleBreak, headBare, headHide, coilClose, gripLatch)
  documented in state.js's doc block, handled in render.js FX and `SFX_FOR_EVENT`.
- All logic is Pixi-free. Sim-test scenarios to cover: block advances on **two arms down** (not one);
  **head death in any block is a win** (early death); head HP **persists across blocks**; a parry
  negates + chunks the attacking arm + refills the bar; a perfect parry chunks more; **an arm
  mid-attack blocks nothing**; **fewer arms → less blocking** (a head-targeted hit lands on the head
  through a gap); **blaze at full bar breaks the arm outright + full-radius flash**; wave
  clear-or-timeout advance; no timer victory; unlock written on Deep-d5 win; difficulty-3 cap.

## Build notes — review fold (2026-09-09, three adversarial passes)

The parry seam, the sight floor, D3's window, the P5 lunge, and the wave breathers above are folded into
their sections. The rest of the fold is sim/render-phase and is pinned here so the build does not drop it:

- **The arms must not read as terrain** (B3). The graveyard is rust and net-grey; arms furred in the same
  palette would dissolve into the wreck field, and at low Light the whole read vanishes. Arms are the
  **pale** shape (net-grey/twine dominant, rust only as accent) with an always-on scrim punch
  (`ROSTER_LOOKS` `glow`, the lanternfish idiom), so the ring reads as *life* against the dead field at
  any bar level.
- **An arm's death is a staged tell, not a pop** (M5): furred → furred-and-torn → bare → peels and sinks.
  And at rest, adjacent arms are sized to leave a visible **sector gap** between them — the head shows
  through the gaps, which is the whole "fewer arms = less blocking" read made visible.
- **Arm dispositions are pinned, not free** (M7): each arm is anchored (or `speedMul 0`), deals **no
  contact damage**, and drops **no gem/coin** — its kill pays exactly 1 level, chained like the Blank's
  phase levels. An arm is a shield to manage, not a loot source.
- **Push-out ordering** (M6): the arms' per-frame push-out runs at/after the `stepObstacles` slot, not
  early in the script, or an arm could carry the player through a wreck in the same frame the wreck pushes
  back.
- **The icon owns the read** (M8): the head is the dominant 🐙 face, the arms a secondary low-contrast
  ring behind it (tips curled inward). The card sells "a place that moved," not "eight tentacles."
- **One wave helper, not two** (M9): `stepKrakenScript` and the Blank share a `stepScriptWave` helper for
  the gap-door half; do not 40-line-copy `stepBossScript`.
- **Blaze cadence** (M1): tune so a full bar (a blaze) lands **1–2× per fight**, not per block — the bar
  is a charged counter you build, not a meter that tops out every block.
- **D3 level modal** (minor): D3 is 8 arms = up to 8 level-up screens; if it plays choppy, cap D3's
  on-fight level-ups (~6) and bank the rest — the "1 level per arm" total is unchanged, only the cadence.

## Open / iterate (the review list)

1. ~~Merge coupling~~ **Resolved: the boss is self-contained.** Its wave roster, weapon pool, starter
   and light rig are all the Kraken's own — nothing reads `CHAPTERS.deep` or the Twilight, so the
   Deep/Twilight refactor (a separate agent's in-flight work) neither blocks nor perturbs this build.
   New work it replaces: **design the boss's own wave roster (3–5 graveyard dead, one = the barnacle
   wall) and its weapon pool + starter** in the build, via designing-an-enemy / design-a-weapon.
2. ~~Difficulty cap: 3 or a D4 structural rung.~~ **Resolved: the cap is 3** (matching the Blank). No
   D4 — the structural dial now lives *inside* the three rungs.
3. ~~Does D3 touch structure (a 9th arm) or stay on the skill axes?~~ **Resolved:** structure *is* the
   dial — the tentacle count (4/6/8) and the pattern depth (2/3/4) scale down the ladder, so D3 is the
   biggest (8 arms, all 4 patterns). The old "9th arm on D3" idea is void; nothing is added on top.
4. The **blocking model** — raycast-coverage vs absorb-by-nearest, and exact per-arm coverage
   fractions (the two invariants above are the contract; the geometry is a build detail).
5. Whether the weapon-targeting default (head = boss-priority, arms block on the path) is what the
   existing boss-priority code gives for free or needs a small branch.
6. ~~Level-up cadence~~ **Resolved (fold):** literal "1 level per arm," with the D3-only mitigation — if
   8 on-fight screens plays choppy, cap D3 at ~6 and bank the rest (same total, smoother cadence).
7. ~~P5 vs the Blank's P3~~ **Resolved (fold):** the distinction is the **arena** (wreck field vs the
   empty plane) + the bared killable head + the one **lunge** beat (`KRAKEN_HEAD_LUNGE_T`). Still to
   confirm on a phone that the three together read as a distinct finale (see the P5 iterate note).
8. The D3 **double telegraph** legibility on a ~195px half-view.
9. ~~Icon~~ **Resolved (fold):** the head owns the read (dominant 🐙 face, arms a secondary ring).
   Victory line — the book's landing is picked; the alt is still on the table.
