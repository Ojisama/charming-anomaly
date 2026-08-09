// All balance numbers live here. Every module treats this as read-only ground truth.

// The world generator (v5.11). config.js stays the single place sim.js and render.js are allowed to
// import world data from, so the biome/road queries are re-exported from here — but the generator
// itself lives in src/terrain.js, which is pure (no imports, no Math.random, no DOM) and imports
// nothing from this file, so the dependency runs one way only and cannot cycle.
import {
  biomeAt, elevationAt, moistureAt, urbanAt, riverAt,
  SEA_LEVEL, SHORE_BAND, HILL_LEVEL, DESERT_MOIST, FOREST_MOIST,
  DOWNTOWN_URBAN, SUBURB_URBAN, RIVER_CORE, RIVER_MOUTH_GAIN,
  STREET_MINOR_WIDTH, STREET_MAJOR_WIDTH,
} from './terrain.js'

export const RUN_DURATION = 300 // seconds; reaching it = victory

// ---- Rarity ------------------------------------------------------------------
// Hybrid model: passive cards ROLL a rarity that multiplies their bonus;
// weapons have an INHERENT rarity that gates how often they appear in the pool.
// v6.7.13: no `color` field. It had SIX values and ZERO readers — render.js does not even import
// RARITIES, and every real consumer reads .name or .mult only. The tier colours the player actually
// sees are declared independently in styles.css's .lv-card[data-rarity=...] rules, so the field was
// a second source of truth that nothing consulted and nothing kept in sync.
export const RARITIES = {
  normal:    { name: 'Normal',    mult: 1.0 },
  rare:      { name: 'Rare',      mult: 1.6 },
  epic:      { name: 'Epic',      mult: 2.5 },
  legendary: { name: 'Legendary', mult: 4.0 },
  mythic:    { name: 'Mythic',    mult: 6.5 },
  // v6.7.6 (Track B): a SIXTH tier, not a replacement for mythic. mult 1.0 because an anomaly buys
  // no stat growth at all — it is a rule change (see ANOMALIES below), so there is nothing for a
  // multiplier to scale. The key is not decorative: every reader that walks RARITY_ORDER reads
  // .mult (test run PT.a, scripts/pool-probe.mjs's card scorer), and a missing one reads NaN.
  // The NAME is not "Anomaly" (v6.7.7): the game already spends that word on three other things
  // the same player reads in the same session — the pre-run MUTATORS ("Daily Anomaly", "Reroll
  // this anomaly", and a briefing that literally reads "Anomalies bend the rules of this run"),
  // the ENEMIES (MUTATORS.overtime.desc), and the player themselves (fr.js 'You': 'Ton
  // anomalie'). A teal card chipped ANOMALY therefore reads as a fourth mutator administered by
  // the difficulty ladder rather than a rule the player just chose — the one failure the design
  // forbids. "Rupture" is unclaimed in English. The FRENCH is deliberately a DIFFERENT word,
  // 'Brèche' (fr.js, owner call 2026-08-09): 'rupture' in everyday French reads first as a breakup
  // or a stock-out, and the chip carries no context to steer the reader toward the visceral sense
  // the English word has. The internal key stays `anomaly` everywhere (RARITY_ORDER, ANOMALIES,
  // run.anomalies, kind:'anomaly', the CSS data-rarity): renaming the id is a mechanical migration
  // best done once, with the slate.
  anomaly:   { name: 'Rupture',   mult: 1.0 },
}
// Replacing mythic (the original design) would give the mythic city starter `rainbow` a "Normal"
// chip, silently cap all 15 kind:'tier' mods at +2 via WEAPON_MOD_TIER_BONUS, break three
// assertions in test/sim-test.js, and delete the pool's only jackpot at the same moment anomalies
// stop producing stat growth. Hades precedent: legendary/duo boons stand APART from the rarity
// scale rather than replacing its top rung.
// 'anomaly' LAST IS A SLOT, NOT A FREQUENCY CLAIM. Every other entry is rarer than the one before
// it; this one is a parallel tier with no RARITY_WEIGHTS entry, rolled once per screen against the
// ordinary table's total, and it is measurably more common than mythic (run PB1's tier-eligible
// fixture: 3.3% of cards at 2 slots against mythic's ~1.1%). Anything that reads RARITY_ORDER as
// an ordering — a ladder
// walk, an indexOf comparison, a --rarityfloor — must exclude it explicitly; test/sim-test.js's
// ladder() and scripts/pool-probe.mjs's ROLL_WEIGHTS both do.
export const RARITY_ORDER = ['normal', 'rare', 'epic', 'legendary', 'mythic', 'anomaly']
// Fixed roll weights (user-tuned v4.7; no level scaling). Epic-or-better ≈ 12.3% per card,
// so a screen shows at least one epic+ on ~23% (2 cards) / ~33% (3) / ~41% (4) of level-ups.
// NO anomaly entry, deliberately: the anomaly weight depends on run eligibility (and, from
// v6.7.7, on pity), so it is computed per roll and rolled AGAINST this table's total rather than
// living inside it. That is also what keeps a failed anomaly roll from deflecting onto legendary
// — the 16.1% legendary the shim's first draft measured (F1).
export const RARITY_WEIGHTS = { normal: 100, rare: 50, epic: 12, legendary: 6, mythic: 3 }
// A weapon UPGRADE card carries NO tier — this value deliberately is not a key of RARITIES, so
// ui.js finds nothing to look up and prints no chip (see renderLevelup). `New!` cards keep their
// weapon's inherent rarity: acquiring `hole` IS the jackpot moment, levelling it is not. Letting
// upgrades keep cfg.rarity was measured, on the bucket-first pipeline that offers a weapon card on
// 22% of rolls regardless of tier, at city mythic 8.9% of ALL cards (shipped 1.4%) and beyond
// legendary 7.3% (shipped 4.4%) — the latter inside the 9-16% band the spec names as the F1
// regression signature once sampled on a fixed pool (11.3%). Every mythic card in city was one
// card: `Neon Beam Lv N`. A border that predicts WHICH weapon rather than HOW BIG is worse than
// no border, and applyChoice's weapon branch never reads rarity, so it promised nothing.
export const UPGRADE_RARITY = 'upgrade'

// Rerolling a level-up screen carries a small rarity pity: it buys BIGGER NUMBERS. Only the
// `normal` weight decays, so every other tier's share rises proportionally without needing a knob
// of its own — at the cap the ordinary table reads 51.2/50/12/6/3, i.e. the rarity roll comes up
// `normal` 41.90% of the time against 58.48% at base (exact, and run PB4 pins it against the
// element bucket, which adopts the rolled tier verbatim).
// DELIVERED, measured on the shipped roll (body/3, tier-eligible, 20000 screens per row; run PB4
// asserts every row and `pool-probe body 3 40 random --rerolls=N` regenerates them off the real
// pipeline). "normal" is the share of TIERED cards, i.e. excluding weapon upgrades, which carry
// UPGRADE_RARITY and no tier at all:
//     rerolls   normal   epic+   mean rarity mult
//        0      58.9%    10.5%        1.432
//        1      54.4%    11.9%        1.484
//        2      50.6%    12.8%        1.525
//        3      45.8%    13.9%        1.574
//        4      46.0%    14.2%        1.580   (identical to 3: the cap is exact)
// So three rerolls are worth +9.9% on the average card and +32% relative on epic-or-better. A
// nudge, deliberately: the reroll's real product is a different SET of cards, and this is the
// consolation for the one you buy and still don't like.
// WHAT IT COSTS IS A RUN NUMBER, WHICH THE CAP IS NOT. rerollCost escalates on run._rerolls (the
// whole run), while the decay reads run._screenRerolls (this screen, zeroed by stepLevelUp), so
// the price of reaching the cap depends on WHEN in the run you do it: 10+15+23 = 48 coins on the
// run's first rerolled screen, 34+51+76 = 161 after three prior rerolls, 114+171+257 = 542 after
// six. Measured income for comparison: 251 coins/run mortal (body/2 d3, `--survival`, the rig that
// answers "what does a player actually have"), 347 immortal. So the documented 48-coin row is the
// FIRST-SCREEN price and the cap is reachable at its advertised cost roughly once per run; by the
// time a player has spent five rerolls it is unaffordable. Two consequences the design accepts and
// does not hide: concentrating rerolls on one screen is worth strictly more than spreading them at
// the same price ("when you reroll, reroll to three"), and the nudge is cheapest exactly where the
// cards are smallest. Repricing the reroll per SCREEN would close both; it is an owner call about
// a gold sink shipped since v4.5, logged as open in spec B6 rather than taken here.
// It deliberately does NOT touch the anomaly tier. The tier rolls against the sum of the
// UNDECAYED table (see rollAnomalyCard), so a reroll cannot shrink the denominator it competes
// against; summing the decayed table instead measures 8.6% -> 11.6% of screens at the cap, +35%
// relative. Rerolling would then be the way to FARM the rarest tier rather than a way to fix a bad
// screen — the second half of spec B6, whose first half (repeated independent draws) v6.7.9 closed
// by deciding the tier once per screen. Measured at 8.63% -> 8.56%, 1% relative.
// NOR ANY OTHER CARD *KIND* — this is a promise about SIZE, and v6.7.11 is where that stopped
// being approximately true. A `switch` mod (Hive Mind, Sticky Scent, Cyclone, Double Slash) has no
// magnitude, so it declines every rarity above normal (see WEAPON_MODS) and is only a CANDIDATE on
// a normal roll. While the mod bucket picked its candidate off the decayed table, paying for a
// reroll therefore deleted rule-change offers to pay for bigger numbers: measured -27% to -32%
// relative at the cap on every chapter that has one (garden 9.11% -> 6.61% of mod cards, pond
// 6.04% -> 4.25%, skies 6.65% -> 4.50%, undergrowth 2.78% -> 1.94%), which is the game's #1
// standing complaint sold back to the player as an upgrade. rollCard now rolls mod CANDIDACY on
// the undecayed table and only the MAGNITUDE on the decayed one, so the switch rate is flat
// (garden 9.01% -> 9.43%, within a 0.45pt seed spread) while numeric mods keep the full nudge; run
// PB4 asserts the invariance, not a bounded loss. Same reasoning already keeps the weapon bucket's
// `New!` weights undecayed: they choose WHICH weapon, and a reroll must not buy rarer discoveries.
// HOW MUCH OF A SCREEN THE NUDGE CANNOT REACH, measured rather than waved at: a weapon card has no
// magnitude for rarity to scale (applyChoice's weapon branch never reads it — the chip is the
// acquisition jackpot) and an anomaly has no multiplier at all, so those cards are exempt by
// construction. On body/lv12, 20000 screens: 28.3% of cards at 2 slots (27.2% at 3, 24.8% at 4),
// and at the DEFAULT 2 slots 6.7% of screens hold nothing the nudge can move while another 43.4%
// hold exactly one. That is the honest size of the product being sold, and the reason the UI tell
// this feature still owes is not a polish item: a hidden +10% on part of a screen the player
// cannot identify is not a decision.
// The CAP exists because the decay is geometric: uncapped, six rerolls take the rarity roll's
// normal share to 27.0% against 41.9% at the cap, and every screen past the fourth is a pool
// nothing was balanced on. Three is where rerollCost has already reached 34 coins for the NEXT one
// on a first-screen ladder (REROLL_BASE_COST 10, x1.5 each).
export const REROLL_RARITY_DECAY = 0.8   // `normal` weight multiplier per reroll of THIS screen
export const REROLL_RARITY_CAP = 3       // rerolls of one screen past which the decay stops

// ---- Level-up buckets (v6.7, Track B) -----------------------------------------------
// The pool rolls a BUCKET first, then a rarity inside it. The shipped order was the reverse,
// which deleted a bucket entirely on every roll whose rarity no member happened to carry —
// measured as weapon share collapsing to 9.6% against a declared 22% (4.9% in city). Empty
// buckets are dropped and the rest renormalized, so these are relative weights, not percentages —
// but they are kept summing to 100 so each weight reads as its declared share of the table.
// defence and utility are TWO buckets, not one passive bucket with a weight inside it, because
// the two shares answer different questions and must be tunable (and assertable) apart:
//   defense 19 — armor/regen/maxHP, the only direct defence in the pool. 19% holds parity with
//     the 17.8% the shipped flat bag delivered, at every slot count. Do NOT rebase the PASSIVES
//     numbers to compensate for the 62% -> 30% passive cut instead: a flat base scalar is
//     regressive, measured -41% defensive picks at 2 slots against only -7% at 4.
//   utility 11 — the other seven passives, 1.6% of cards each (measured 1.5-1.8%). That IS the
//     cost of the passive cut, and it is stated here rather than falling out of a x4 weight:
//     holding defence at parity inside a 30-point bucket means the seven interesting passives
//     absorb the whole 32-point cut, ~0.27x their shipped offer rate. Variety is bought back by
//     Track A (elements) and the anomaly slate, NOT by re-inflating stat bumps.
export const BUCKET_WEIGHTS = { defense: 19, utility: 11, mod: 30, weapon: 22, element: 18 }
export const DEFENSIVE_PASSIVES = ['armor', 'regen', 'maxHP']
// Inside the weapon bucket, an UPGRADE of an owned weapon competes at this flat weight while a
// `New!` card competes at its weapon's inherent rarity weight (times newWeaponChance — see
// NEW_WEAPON_FADE below). Rarity TILTS acquisition; it must never touch LEVELLING. Weighting
// owned weapons by rarity too was measured handing beyond's normal starter 68.8% of its weapon
// cards and making city's mythic starter the hardest weapon in the chapter to level — the pool
// choosing your build for you.
// "Tilts", not "gates", and the difference is measured: with only the starter owned, beyond
// offers the legendary `hole` on 2.49% of cards against the epic `tesseractBeam`'s 4.08%, but
// 47% of hole's offers come from the rarity-blind NEW_WEAPON_MIN_RATE floor below (86% once it
// is the only unowned weapon left, where the floor picks uniformly from a list of one). The
// floor is the discovery GUARANTEE and is deliberately tier-blind; weighting it by rarity was
// measured moving hole 2.49% -> 2.14% and nothing at all in the single-unowned case, so it buys
// no gate. If a rare weapon must be a genuinely rare FIND, that lever is the floor, not this.
export const WEAPON_UP_WEIGHT = 100

// ---- Anomalies (v6.7.6, Track B) -----------------------------------------------------
// Run-changing cards with no rarity multiplier and no levels — the sixth tier in RARITY_ORDER.
// They produce NO stat growth: the behaviour lives at a trigger site in sim.js reading
// run.anomalies.<id>, the same pattern behavioural weapon mods already use, so this table stays
// data plus pure predicates.
//
// PREDICATE HAZARD: run.weaponMods / run.weaponModPicks are pre-populated for EVERY weapon, so
// `r.weaponModPicks.star?.chain` is safe. But `r.weapons.find(w => w.id === 'orbit').level` THROWS
// when the weapon is not owned — use hasWeaponAt (declared right below, in THIS file) instead,
// always. eligibleAnomalyIds catches a throwing predicate and drops that card rather than the
// whole screen, but a predicate that throws is a card that never appears, which no test would
// report as a failure. v6.7.7: the helper used to live in sim.js, which a predicate authored here
// cannot reach — config.js imports only terrain.js, and importing sim.js would be the one cycle
// this file's header forbids. Following the note would have deleted the card it was protecting.
// Run PB2 now calls every shipped predicate against a battery of run shapes so a throwing one is
// a red test rather than a card nobody ever sees.
//
// TIER NAME: the player-facing word is "Rupture", not "anomaly" — see RARITIES.anomaly above for
// why. `anomaly` remains the internal id everywhere.
//
// RATE (owner's call, spec decision #2: 1-2 per run, "each should be an event"). This is the
// number that licenses the slate's run-enders — "rarity licenses extremity" is explicitly
// conditioned on scarcity — so it is tuned against a SLATE-SHAPED table rather than against the
// one card shipped today, which cannot deliver more than 1.00/run whatever the weight says.
// Measured by transplanting 18 stand-ins carrying the shim's gate shapes into this table
// (scripts/pool-probe.mjs ANOMALY_GATES: 4 unconditional w1, 6 easy w6, 5 hard w6, 3 chapter w2)
// and driving the REAL pipeline with a take-every-anomaly bot, 30-40 runs per cell:
//                                     per-slot roll (v6.7.6)   per-screen roll, weight 12
//   body/2 d3 mortal   (to lv 17)              0.95                     0.78
//   body/2 d1 immortal (to lv 36)              2.40                     1.23
//   body/4 d1 immortal (to lv 34)              3.60                     1.63
//   city/2 d1 immortal (to lv 39)                -                      1.80
// The left column is the 2.25-3.25/run the spec named as the thing to reduce. THE WEIGHT WENT UP
// WHILE THE RATE WENT DOWN, which is not a contradiction: the number means something else now. It
// used to be rolled once per SLOT, so the delivered rate was 1-(1-p)^slots and a 4-slot player
// (60 of the 80 meta-shop levels, spent on the sacrifice ladder) got 1.5x as much of the run's
// rarest tier for having bought slots. It is rolled once per SCREEN now, and once per screen in
// the literal sense since v6.7.9 — the outcome is memoised on run._screenAnomaly, so paying for a
// reroll re-rolls the ordinary cards and nothing else. The residual 1.23 -> 1.63 spread across
// slot counts is ELIGIBILITY, not roll rate: more picks per screen satisfy build-conditional
// `when` predicates sooner, which is the tier working as designed.
//
// WHAT ANOMALY_BASE_WEIGHT IS: the FLOOR of the per-screen rate, 12/(171+12) = 6.6% — the rate on
// the first screen the tier is eligible on and on the screen right after it fires. It is NOT the
// share of screens that carry one, which this block claimed until v6.7.9 and which measured 2x
// off: pity is what the run actually spends most of its screens at. Measured share of TIER-
// ELIGIBLE screens carrying an anomaly, and the mean weight in play, off the harness's own pity
// line (`pool-probe body <slots> 40 dps [--survival --diff=3]`), 40 runs per cell:
//                            offered/eligible screen    mean weight    at the cap
//   body/2 d3 mortal                  9.3%                  20.6          0.9%
//   body/4 d3 mortal (--shop=8)       9.8%                  23.1          3.2%
//   body/2 d1 immortal               11.2%                  22.9          3.4%
// Tune the FLOOR with this constant and the SLOPE with ANOMALY_PITY_PER_SCREEN; moving either one
// moves the effective share by more than its own arithmetic suggests, so re-read that pity line
// rather than the ratio above.
//
// RE-MEASURED WITH PITY ON (v6.7.8, and again at v6.7.9 after pity stopped accruing on screens the
// tier is ineligible for). Same take-every-anomaly bot, through the harness rather than a
// transplant, so the slate column is scripts/pool-probe.mjs's own 18 stand-ins and the shipped
// column is this table's one card (which cannot exceed 1.00/run whatever the weight is) —
// `pool-probe body <slots> 40 dps --compare [--survival --diff=3 --shop=8]`, 40 runs per cell,
// shipped -> slate:
//                                      pity off        pity on (shipped)
//   body/2 d3 MORTAL   (to lv 17-20)  0.50 -> 0.80     0.75 -> 1.10
//   body/4 d3 MORTAL   (--shop=8)     0.70 -> 0.80     0.93 -> 1.30
//   body/2 d1 immortal (to lv 36)     0.95 -> 1.32     1.00 -> 1.93
//   body/4 d1 immortal (to lv 36)     0.85 -> 1.50     1.00 -> 1.90
// The MORTAL rows are the ones the rate is tuned on: an immortal run takes ~36 level-ups, twice a
// real run's, and saturates MAX_ANOMALIES_PER_RUN at any weight — 1.93/2.00 says the cap is
// working, not that the rate is right. Mortal 1.10/run on a slate-shaped table sits inside the
// owner's 1-2, so pity buys the dry run its drift without moving the base weight.
// SLOT DEPENDENCE IS READ OFF THE MORTAL ROWS, not the immortal ones (v6.7.9 correction): both
// immortal cells sit at 97% of the hard cap of 2.00, and a pinned pair says nothing about slots.
// Mortal, with the shop matched so only the slot count differs, the slate column is 1.10 at 2
// slots against 1.30 at 4 — and the 4-slot run reaches level 22.7 against 20.4, i.e. 12.5
// tier-eligible screens against 11.8, so most of the ~18% gap is simply more screens (per eligible
// screen it is 9.3% against 10.6%). Pity does not widen it: the term is per screen and reads no
// slot count (run PB3 asserts both the weight and the delivered rate at 2 and 4 slots).
// "SLOT-INDEPENDENT" IS ABOUT FREQUENCY, NOT COST. The anomaly REPLACES a rolled card rather than
// extending the screen (buildLevelUpChoices), so it eats half of a 2-slot screen and a quarter of
// a 4-slot one — and pity has raised how often that happens from 6.6% to ~9-10% of eligible
// screens. B5's "never the screen's only offer" still holds (`cards.length > 1`), but at 2 slots
// that guarantee delivers exactly one alternative, so a slate COST card collapses a 2-slot screen
// to a single real option. Whoever prices the cost cards owns that asymmetry; the fix, if it is
// one, is to make the anomaly an EXTRA card at 2 slots rather than to touch the rate.
// AND WHAT THE SHIPPED COLUMN MEANS TODAY: ANOMALIES holds ONE card, so until the slate lands the
// player-visible effect of pity is "Unstable Cores, in 75-93% of runs instead of 50-70%", not
// variety. The 1-2/run target is a slate-shaped number; do not read the shipped column as the
// design landing.
export const ANOMALY_BASE_WEIGHT = 12
// PITY (v6.7.8, Task 3). A screen that shows no anomaly adds PER_SCREEN to the next screen's
// weight, so a dry run drifts toward the tier instead of waiting on a flat coin flip.
// THE UNIT IS THE SCREEN, and the name says so: it was ANOMALY_PITY_PER_CARD, which is what the
// spec wrote while the tier was still rolled once per SLOT. Kept per card, a 4-slot player would
// accrue pity twice as fast as a 2-slot one — the same "you bought the rarest tier in the meta
// shop" defect the per-screen roll exists to close (v6.7.7 measured it as 2.40 anomalies/run at 2
// slots against 3.60 at 4), reintroduced through the pity term instead of the base rate.
// The counter it multiplies is run._screensSinceAnomaly, which INCLUDES the screen being built
// (stepLevelUp advances before the build), so sim.js multiplies by count - 1 (anomalyWeightFor):
// the weight on a screen with no dry screens behind it is exactly ANOMALY_BASE_WEIGHT, which is
// what makes the 6.6% above the floor of the range rather than a number the game never rolls at.
// EARNED ONLY WHERE IT CAN BE SPENT (v6.7.9): a screen the tier is INELIGIBLE for banks nothing.
// It used to bank one, and since ANOMALY_MIN_LEVEL gates the whole table the ineligible stretch is
// the same stretch of every run — so the credit was earned on a fixed schedule and spent the
// instant the gate opened. Measured over 400 immortal body runs that decline every card, the share
// of runs whose first offer lands within three screens of the gate: 37.0% -> 23.5% with every card
// at the table floor of 8, 28.8% -> 22.3% on the shipped table (whose one card floors at 3, so its
// ineligible stretch is short). A timing tell, not agency — the gate it clustered behind is a
// level floor, not something the player did. It also kept ANOMALY_BASE_WEIGHT entirely off the
// table: a mortal body/2 run opens ~15.7 level-up screens of which only ~8.1 are tier-eligible, so
// a run reached eligibility with about half a run of credit already banked and no screen ever
// rolled at the documented floor.
export const ANOMALY_PITY_PER_SCREEN = 2
// At the cap the per-screen rate is 45/(171+45) = 20.8%, reached after 17 dry ELIGIBLE screens.
// It is a real ceiling and not a formality: it binds on 0.9% (body/2 mortal) to 3.4% (body/2
// immortal) of tier-eligible screens — measured, off the harness's pity line, NOT the "more than a
// whole run's worth of level-ups" this comment claimed at v6.7.8, which was wrong twice over (a
// mortal body run opens 8-9 tier-eligible screens but an immortal one reaches level 36).
// It exists for the run that goes long without a hit — the tier's `when` predicates and minLevel
// gate the pool, so a build that satisfies nothing for 20 screens still accrues on every screen
// SOME card was eligible on. Without a ceiling that run detonates the tier the moment its luck
// turns, handing out MAX_ANOMALIES_PER_RUN back to back (F1).
// 20.8% IS ALSO THE CEILING A PLAYER CAN REACH, since v6.7.9: the screen's answer is decided once
// (run._screenAnomaly), so rerolls no longer buy N independent draws at the pitied weight. Before
// that, a player who rerolled until it showed measured 20.1% -> 75.5% over 5 rerolls (133 coins)
// at a saturated counter, and 6.8% -> 33.9% at base pity.
export const ANOMALY_PITY_CAP = 45
// Two, per the same decision ("1-2 per run"), down from 4. With the rate above it is a real
// ceiling rather than a formality — a 39-level city run measures 1.80/run against it — which is
// the point: the cap is what stops the longest runs from turning the tier into a shopping list.
export const MAX_ANOMALIES_PER_RUN = 2
// F10: the unconditional COST cards are eligible from level 1 and taken in ~100% of runs, so
// without a floor a new player's first encounter with the tier is a pure downside. This is the
// DEFAULT floor; a card may lower it with its own `minLevel`, and a no-cost jackpot should —
// F10's argument is about cost, and applying it wholesale measured the seed card first offered at
// t=164s of a 253s run, i.e. after 65% of the run's elites were already dead.
export const ANOMALY_MIN_LEVEL = 8

// Safe ownership test for the predicates below. `r.weapons.find(w => w.id === 'orbit').level`
// throws when the weapon is not owned, which is the single easiest way to write a card that never
// appears (see PREDICATE HAZARD above). Pure function of `run`, so it belongs with the data.
export const hasWeaponAt = (run, id, lv = 1) => {
  const w = run.weapons.find((x) => x.id === id)
  return !!w && w.level >= lv
}

export const ANOMALIES = {
  unstableCores: {
    name: 'Unstable Cores', icon: '💥',
    from: 'you killed an elite and something went critical',
    desc: 'Every elite drops an unstable core. Its blast grows with the run, and whatever it kills blows up too.',
    // The hidden gate: this card teaches itself only to a player who has met an elite. Reads the
    // run counter, never run.enemies — an elite alive on screen is not the lesson.
    when: (r) => (r._eliteKills ?? 0) > 0,
    weight: 1,      // unconditional 1 / conditional 6 / chapter inversion 2
    chapter: null,  // or a chapter id, to scope the card to one biome
    // A jackpot with no cost but its own blast radius, so F10's level floor — an argument about
    // COST cards — does not apply to it (see ANOMALY_MIN_LEVEL). Measured against the same card
    // at the table default of 8, on the same pipeline and seeds, body/2 d3 x40: first offer moves
    // t=174s (lv 12.2) -> t=146s (lv 10.4) of a ~250s run, and the share of runs that ever see it
    // 17/40 -> 23/40. The rest of the delay is the base rate, not the floor, which is what the
    // deferred "at least one by level N" guarantee is for.
    kind: 'jackpot',
    minLevel: 3,
  },
}

// ---- Level-up choice slots (v4.8: permanent, meta-shop-unlocked) ---------------------
// A level-up screen shows meta.choiceSlots/run.choiceSlots cards (2 by default). The 3rd/4th
// slot is unlocked PERMANENTLY (applies to every future run, all modes) by sacrificing already-
// purchased SHOP levels in the meta shop — see SACRIFICE_COSTS/sacrificeCost below and
// hooks.onSacrifice in main.js. No coin refund for sacrificed levels.
export const PLAYER = {
  radius: 22,
  baseHP: 100,
  baseSpeed: 220,        // px/s
  baseMagnet: 70,        // gem attraction radius, px
  pickupRadius: 26,      // actual collect radius
  baseCritChance: 0.05,
  baseCritDamage: 1.5,
  invulnTime: 0.75,      // s of invulnerability after being hit
}
// v6.3.4 anti-turtle guard: no single non-dot hit exceeds this fraction of maxHP — protects
// against multiplicative compositions (glass ×1.75 × difficulty ×1.6 × late-run ×2 × enrage ×1.5)
// crossing the one-shot line.
export const HURT_CAP_FRAC = 0.5

// ---- Weapons ----------------------------------------------------------------
// levels[i] applies at weapon level i+1 (cumulative object replaces stats).
export const WEAPONS = {
  star: {
    name: 'Spike Protein' /* v6.2 re-theme, id frozen */,
    desc: 'Flings barbed antigens at the nearest cell.',
    icon: '⭐', rarity: 'normal',
    levels: [
      { dmg: 12, interval: 0.55, count: 1, speed: 480, pierce: 1 },
      { dmg: 14, interval: 0.50, count: 2, speed: 480, pierce: 1 },
      { dmg: 16, interval: 0.45, count: 2, speed: 500, pierce: 2 },
      { dmg: 19, interval: 0.40, count: 3, speed: 520, pierce: 2 },
      { dmg: 24, interval: 0.34, count: 4, speed: 560, pierce: 3 },
    ],
  },
  orbit: {
    name: 'Phage Ring' /* v6.2 re-theme, id frozen */,
    desc: 'Tamed phages circle you, shredding whatever they touch.',
    icon: '💫', rarity: 'normal',
    levels: [
      { dmg: 10, orbs: 2, radius: 80, rotSpeed: 3.0, tick: 0.5 },
      { dmg: 12, orbs: 3, radius: 85, rotSpeed: 3.2, tick: 0.5 },
      { dmg: 15, orbs: 3, radius: 95, rotSpeed: 3.5, tick: 0.45 },
      { dmg: 18, orbs: 4, radius: 105, rotSpeed: 3.8, tick: 0.4 },
      { dmg: 24, orbs: 5, radius: 115, rotSpeed: 4.2, tick: 0.35 },
    ],
  },
  wave: {
    name: 'Cytokine Burst' /* v6.2 re-theme, id frozen */,
    desc: 'A pressure wave of alarm signals shoves the swarm back.',
    icon: '🌊', rarity: 'rare',
    levels: [
      { dmg: 18, interval: 2.4, radius: 150, knockback: 140 },
      { dmg: 22, interval: 2.2, radius: 175, knockback: 160 },
      { dmg: 27, interval: 2.0, radius: 195, knockback: 180 },
      { dmg: 33, interval: 1.8, radius: 220, knockback: 200 },
      { dmg: 42, interval: 1.5, radius: 255, knockback: 240 },
    ],
  },
  boomerang: {
    // v5.3: re-themed as The Garden's starter (Leaf Blade) — COPY ONLY, behavior unchanged
    // (still the boomerang weapon step/mods in sim.js, entity array run.boomerangs, and the
    // WEAPON_MODS.boomerang set below). Keeping the id 'boomerang' keeps render.js/main.js
    // (outside the v5.3 sim scope) working; the display name is what the player sees. Moved
    // from vaulted into the garden's weapon pool (see CHAPTERS.garden.weapons).
    // v6.6.13: the ART caught up with the name — for three releases this threw a tinted crescent
    // BLADE and a playtester said so. It is a drawn leaf now (see T.boomerang in render.js).
    name: 'Leaf Blade',
    desc: 'Flings a spinning leaf that slices out and curves back.',
    icon: '🍃', rarity: 'rare',
    levels: [
      { dmg: 16, interval: 1.20, count: 1, speed: 420, range: 240 },
      { dmg: 19, interval: 1.10, count: 1, speed: 450, range: 260 },
      { dmg: 23, interval: 1.00, count: 2, speed: 470, range: 280 },
      { dmg: 28, interval: 0.90, count: 2, speed: 500, range: 300 },
      { dmg: 34, interval: 0.78, count: 3, speed: 530, range: 330 },
    ],
  },
  mines: {
    // v5.0: re-themed as a pond native (Toxin Cysts) — copy only, behavior unchanged
    // (still the mines weapon step/mods in sim.js). Moved into the pond's weapon pool.
    name: 'Toxin Cysts',
    desc: 'Buds toxic cysts that burst on contact.',
    icon: '🫧', rarity: 'rare',
    levels: [
      { dmg: 30, interval: 2.2, radius: 100, maxAlive: 3 },
      { dmg: 37, interval: 2.0, radius: 115, maxAlive: 4 },
      { dmg: 45, interval: 1.8, radius: 125, maxAlive: 4 },
      { dmg: 54, interval: 1.6, radius: 140, maxAlive: 6 },
      { dmg: 65, interval: 1.4, radius: 150, maxAlive: 7 },
    ],
  },
  homing: {
    name: 'Seeker Cell' /* v6.2 re-theme, id frozen */,
    desc: 'A defected white cell that hunts your hunters.',
    icon: '🔮', rarity: 'epic',
    levels: [
      { dmg: 14, interval: 1.00, count: 1, speed: 320, turnRate: 5.0, life: 2.5 },
      { dmg: 17, interval: 0.92, count: 2, speed: 330, turnRate: 5.4, life: 2.5 },
      { dmg: 21, interval: 0.84, count: 2, speed: 345, turnRate: 5.8, life: 2.7 },
      { dmg: 25, interval: 0.75, count: 3, speed: 360, turnRate: 6.2, life: 2.9 },
      { dmg: 28, interval: 0.65, count: 3, speed: 380, turnRate: 6.8, life: 3.1 },
    ],
  },
  hole: {
    // v5.4: re-themed as The Beyond's native (Black-Hole Vortex) — COPY ONLY, behavior/numbers
    // unchanged (still the hole weapon step/mods in sim.js, entity array run.holes). Moved from
    // vaulted into the beyond's weapon pool (see CHAPTERS.beyond.weapons) — its thematic home.
    name: 'Black-Hole Vortex',
    desc: 'Opens a vortex that swallows the swarm.',
    icon: '🕳️', rarity: 'legendary',
    // v5.18.2 RADIUS FIX (playtest: "black hole is glitched", phone screenshot). These were
    // 510/585/675/735/795 — LARGER THAN THE PLAYER'S ENTIRE VIEW. run.viewRadius on a phone is
    // ~465px, so the vortex could never be seen as a circle at any level: its rim crossed the
    // viewport as a near-straight line, and the tint inside vs outside the disc read as a hard
    // horizontal band across the screen. It looked like a rendering artifact because, from inside,
    // an 800px circle on a 390px-wide screen IS a rectangle.
    // Now capped under a phone's view radius so the whole vortex is always on screen and reads as
    // what it is. Damage, tick, interval, duration and pull are all untouched — this is a
    // legibility fix, not a nerf, and the pull radii (260-420) were already inside the new sizes.
    levels: [
      // v5.22 RADII, second pass. v5.18.2 cut these from 510-795 to 300-460 and that was still
      // wrong: a phone viewport is ~430 CSS px WIDE, so even a 300-radius vortex is a 600px disc
      // that cannot fit on screen at any level. What the player saw was never a circle — the rim
      // crossed the viewport as a near-straight line and the tinted interior read as a flat wash
      // with a black blob in it. The binding constraint is HALF THE SCREEN WIDTH (~215), not the
      // view radius (~535, which is half the DIAGONAL and let the old numbers look defensible).
      // Damage is raised to pay for the lost area: L1 goes 300->170 radius, i.e. 0.32x the area, so
      // dmg roughly doubles and the tick quickens. It is a smaller, harder-hitting vortex now.
      { dmg: 8, tick: 0.20, interval: 6.5, radius: 170, duration: 1.8, pull: 170 },
      { dmg: 10, tick: 0.20, interval: 6.0, radius: 190, duration: 2.0, pull: 190 },
      { dmg: 12, tick: 0.18, interval: 5.5, radius: 196, duration: 2.2, pull: 196 },
      { dmg: 15, tick: 0.18, interval: 5.0, radius: 205, duration: 2.4, pull: 205 },
      { dmg: 18, tick: 0.16, interval: 4.5, radius: 215, duration: 2.6, pull: 215 },
    ],
  },
  rainbow: {
    // v5.4: re-themed as The City's starter (Neon Beam) — COPY ONLY, behavior/numbers unchanged
    // (still the rainbow weapon step/mods in sim.js, entity array run.beams, and the
    // WEAPON_MODS.rainbow set below). Keeping the id 'rainbow' keeps render.js/main.js working;
    // the display name is what the player sees. Moved from vaulted into the city's weapon pool.
    // NOTE its rarity stays 'mythic': a chapter's starter is GRANTED by createRun (state.js), so
    // rarity only gates how often it comes BACK as a level-up card — it never gates the start.
    name: 'Neon Beam',
    desc: 'A searing crimson ray sweeps everything it touches.',
    icon: '🚨', rarity: 'mythic',
    // v5.6.13 (user): intervals lowered — L1 was 8.0s with a 2.2s beam, i.e. 5.8s of dead air per
    // cycle, which is unbearable as a STARTER (a starter is the player's only weapon for minutes).
    // Now 3.8s of downtime at L1, tightening to 1.4s at L5. Also re-skinned red (sith saber, not
    // rainbow) — that half lives in render.js's T.beam bake; id stays 'rainbow' everywhere.
    // v5.6.14 (user): DOUBLE-ENDED, Darth Maul style — every cast is 2 arms 180° apart (fireBeam),
    // so `length` is ONE blade and the full staff spans 2x it; lengths are shorter than the old
    // single beam's (240 vs 380 at L1) because the staff carries twice the coverage.
    levels: [
      { dmg: 12, tick: 0.15, interval: 6.0, duration: 2.2, rotSpeed: 2.6, width: 30, length: 240 },
      { dmg: 15, tick: 0.15, interval: 5.6, duration: 2.4, rotSpeed: 2.8, width: 32, length: 275 },
      { dmg: 18, tick: 0.14, interval: 5.2, duration: 2.6, rotSpeed: 3.0, width: 34, length: 310 },
      { dmg: 22, tick: 0.14, interval: 4.9, duration: 2.9, rotSpeed: 3.2, width: 36, length: 350 },
      { dmg: 26, tick: 0.13, interval: 4.6, duration: 3.2, rotSpeed: 3.5, width: 40, length: 400 },
    ],
  },
  // Pond chapter natives (v5.0). Minimal stat tables so the level-up pool + weapon-stat
  // pipeline (effectiveWeaponStats in sim.js) resolve — Task 4 owns their actual step logic
  // (arc sweep / toxin cloud) and mods; these numbers are placeholders it may retune.
  flagella: {
    name: 'Flagella Whip',
    desc: 'Lashes a melee arc toward the nearest enemy.',
    icon: '🧫', rarity: 'normal',
    levels: [
      // v6.4: knockback 45/50/56/62/70 -> 62/68/76/85/95 (L1-L5) — panel probe measured 63% higher
      // damage intake kiting pond vs garden at d3, entirely hit-frequency (melee proximity); this
      // discharges the v6.3.4 deferred melee check.
      { dmg: 14, rate: 0.90, range: 130, arc: 1.40, knockback: 62 },
      { dmg: 17, rate: 0.82, range: 140, arc: 1.50, knockback: 68 },
      { dmg: 21, rate: 0.74, range: 150, arc: 1.60, knockback: 76 },
      { dmg: 26, rate: 0.66, range: 160, arc: 1.70, knockback: 85 },
      { dmg: 32, rate: 0.58, range: 175, arc: 1.85, knockback: 95 },
    ],
  },
  bloom: {
    name: 'Toxin Bloom',
    desc: 'Plants a spreading toxin cloud that ticks damage.',
    icon: '🧪', rarity: 'rare',
    levels: [
      { rate: 3.4, castRange: 260, dur: 3.0, maxR: 90,  dmgPerTick: 6 },
      { rate: 3.1, castRange: 270, dur: 3.2, maxR: 100, dmgPerTick: 7 },
      { rate: 2.8, castRange: 280, dur: 3.4, maxR: 110, dmgPerTick: 9 },
      { rate: 2.5, castRange: 300, dur: 3.6, maxR: 125, dmgPerTick: 11 },
      { rate: 2.2, castRange: 320, dur: 3.8, maxR: 140, dmgPerTick: 14 },
    ],
  },
  // Garden chapter natives (v5.3). See stepStingerWeapon/stepLureWeapon in sim.js for behavior.
  stinger: {
    name: 'Stinger',
    desc: 'Fires a tight cone of piercing needles at the nearest enemy.',
    icon: '🪡', rarity: 'normal',
    // count = needles per volley; spread = cone half-angle (rad); range/speed give a short-mid
    // reach (life = range/speed, derived at fire time).
    // v6.6.26 (owner: "does stinger have as many upgrades as other? It feels underpowered").
    // It already had six mods — parity on COUNT with the lure and quillBurst — but measured 64% of
    // the boomerang's kills over 240s of garden at d3, and the boomerang is the free STARTER. The
    // cause was pierce, hard-coded to 1 with no mod to raise it: a cone aimed at the NEAREST enemy
    // puts every needle on the closest body, so a 5-needle volley dumped 80 dmg into one ant and
    // stopped, while the crowd behind it (avg 83 alive, vs 43 under the boomerang) walked through
    // untouched. Every sibling volley weapon already ladders pierce AND carries a flat pierce mod
    // — quillBurst 1,1,2,2,2 + piercingQuills; realityShard 1,1,2,2,3 + pierceShard; star the same
    // 1,1,2,2,3. Stinger was the only one denied both. The ladder below (identical to star's and
    // realityShard's, deliberately — this is parity, not a promotion) plus piercingNeedles takes it
    // to seven mods, tying bloom/clawRake/sewerGeyser for the most-modded weapon in the game.
    // Nothing else about the weapon changed: same damage, same cadence, same cone.
    // Measured on the shipped tree (240s, garden d3, solo at L5, 3 seeds), as a share of the free
    // starter boomerang's kills: bare 64% -> 80%, one pick of every mod 77% -> 92%. It stays UNDER
    // the starter at every mod depth tested (x1/x3/x5) and at d3 and d5 — the aim was parity with
    // the lure, not a promotion over the thing you get for free.
    // ponytail: 87% of that gain is this ladder, not the mod — pierce 1 -> 3 is +87% dps on its
    // own, the whole piercingNeedles line adds 14% (first pick) to 39% (theoretical max). So if
    // this ever reads as too strong, the lever is the LADDER (1,1,2,2,3 -> 1,1,1,2,2), not the mod.
    // The mod also has hard diminishing returns: the cone's fixed spread and the needle's
    // range/speed lifetime cap a volley at ~11 landed hits however large the pierce budget gets,
    // so picks 3-5 are worth ~1% dps each while the card keeps being offered up to
    // MAX_WEAPON_MOD_PICKS. Left alone deliberately — star.pierce, quillBurst.piercingQuills and
    // realityShard.pierceShard all share that shape, so a per-mod pick cap belongs to all four at
    // once (a `maxPicks` field read by eligibleWeaponModCandidates) and not to a one-weapon patch.
    levels: [
      { dmg: 8,  rate: 0.85, count: 3, speed: 620, range: 320, spread: 0.20, pierce: 1 },
      { dmg: 9,  rate: 0.78, count: 3, speed: 640, range: 340, spread: 0.20, pierce: 1 },
      { dmg: 11, rate: 0.70, count: 4, speed: 660, range: 360, spread: 0.22, pierce: 2 },
      { dmg: 13, rate: 0.62, count: 4, speed: 690, range: 380, spread: 0.22, pierce: 2 },
      { dmg: 16, rate: 0.54, count: 5, speed: 720, range: 410, spread: 0.24, pierce: 3 },
    ],
  },
  lure: {
    name: 'Pheromone Lure',
    desc: 'Plants a decoy that taunts nearby foes, then bursts.',
    icon: '🌼', rarity: 'rare',
    // aggro = taunt radius (enemies within it path to the lure instead of the player); dur = s
    // before it bursts; burstR/burstDmg = the one-shot AoE on burst. castRange = plant scatter.
    levels: [
      { rate: 4.5, castRange: 240, dur: 3.0, aggro: 200, burstR: 110, burstDmg: 28 },
      { rate: 4.2, castRange: 250, dur: 3.2, aggro: 215, burstR: 118, burstDmg: 34 },
      { rate: 3.9, castRange: 260, dur: 3.4, aggro: 230, burstR: 126, burstDmg: 42 },
      { rate: 3.5, castRange: 275, dur: 3.6, aggro: 250, burstR: 136, burstDmg: 52 },
      { rate: 3.1, castRange: 290, dur: 3.8, aggro: 270, burstR: 148, burstDmg: 64 },
    ],
  },
  // Undergrowth chapter natives (v5.4). See stepClawRake/stepQuillWeapon/stepShriekWeapon in sim.js.
  clawRake: {
    name: 'Claw Rake',
    desc: 'Rake a fast arc at the nearest foe.',
    icon: '🐾', rarity: 'normal',
    // A cast rakes every enemy whose CENTER falls in the sector (arc rad, range px) centered on the
    // nearest enemy — flagella's swing geometry exactly, and like flagella it NEVER moves the player
    // (see the CLAW_* block below for why). The two melee starters are separated by shape, not by a
    // gimmick: the whip is a WIDE, SLOW, long single sweep (arc 1.40-1.85, rate 0.90-0.58, range
    // 130-175); the rake is ~2/3 of the arc at ~1.6x the cadence and shorter reach — a tighter,
    // rapid shred you point at one foe, against a lazy crowd-clearing lash.
    // v6.6.28 (owner: "base claw width +30%"): every arc x1.30 (0.70/0.75/0.82/0.88/0.95 ->
    // 0.91/0.98/1.07/1.14/1.24). The rake stays the NARROWER of the two melee starters at every
    // level — that separation is the whole design — but the old "HALF the arc" line above is no
    // longer true and has been rewritten rather than left to rot. wideRake (+30% per pick) rides
    // on top of these, so a maxed rake now reaches 1.24 x 2.5 = 3.1 rad, past flagella's ceiling;
    // that is the mod doing its job, not this change.
    levels: [
      { dmg: 11, rate: 0.42, range: 100, arc: 0.91, knockback: 32 },
      { dmg: 13, rate: 0.39, range: 106, arc: 0.98, knockback: 36 },
      { dmg: 16, rate: 0.35, range: 112, arc: 1.07, knockback: 40 },
      { dmg: 20, rate: 0.31, range: 120, arc: 1.14, knockback: 45 },
      { dmg: 25, rate: 0.27, range: 130, arc: 1.24, knockback: 50 },
    ],
  },
  quillBurst: {
    name: 'Quill Burst',
    desc: 'Bristles a ring of quills outward in every direction.',
    icon: '🦔', rarity: 'rare',
    // count = quills per burst, fired evenly around the full circle (never aimed — this is the
    // panic button, not the sniper). Each quill is a run.bullets projectile tagged weapon:'quill'
    // (life = range/speed, derived at fire time), same as stinger's needles.
    //
    // v6.6.28 (owner: "quill underpowered"). It was NOT weak at the top — measured solo against
    // undergrowth's own spawn stream at difficulty 3, level 5 bare, quillBurst does 244 dps to
    // clawRake's 250 and chitterShriek's 289, and with one pick of every mod it is the BEST of the
    // three (431 vs 392 / 418). The weakness was the LADDER. Bare dps by level used to read
    // 75/81/113/128/139 against clawRake's 96/108/118/129/139 — so the chapter's RARE card was 22%
    // weaker than the chapter's own STARTER at the moment you picked it up, and only drew level
    // with it at L5. Paper throughput (dmg x count x pierce / rate) spread 11.6x from L1 to L5;
    // clawRake spreads 3.5x. Two things caused it: pierce 1 at L1-L2, and the L2->L3 step moving
    // count 7->9 AND pierce 1->2 at once — one cliff carrying most of the weapon's growth.
    // So: pierce 2 at EVERY level (the cliff is gone) and the whole ladder re-cut around it. L5 is
    // the level held still on purpose — the complaint was about picking the card up, not about
    // owning it maxed, and L5 was already at parity.
    // Measured after (8 seeds, bare dps by level), quill vs clawRake: 99/111/120/135/143 against
    // 96/105/114/126/139 — +4/+5/+5/+8/+3%, so the rare card now opens level with the chapter's
    // starter instead of 22% behind it, and ends where it already was (+2% at L5). Kills/s at L5
    // stays a three-way tie: claw 1.935, quill 1.987, shriek 1.954.
    // L4 is NOT a rounding pass despite sitting between two small ones: dmg 17->18, rate 1.00->0.97
    // and count 10->11 together are +20% paper throughput and +6% measured dps. It is the one level
    // that gained without being part of the L1-L3 problem, and it is deliberate — L3->L4->L5 has to
    // stay monotone in FEEL after L1-L3 were lifted under it, or the ladder just moves its flat
    // stretch instead of removing it.
    levels: [
      { dmg: 11, rate: 1.20, count: 8,  speed: 460, range: 240, pierce: 2 },
      { dmg: 13, rate: 1.12, count: 9,  speed: 480, range: 255, pierce: 2 },
      { dmg: 15, rate: 1.05, count: 10, speed: 500, range: 270, pierce: 2 },
      { dmg: 18, rate: 0.97, count: 11, speed: 520, range: 285, pierce: 2 },
      { dmg: 21, rate: 0.90, count: 12, speed: 540, range: 300, pierce: 2 },
    ],
  },
  chitterShriek: {
    name: 'Chitter Shriek',
    desc: 'A shrill scream that hurts, shoves, and panics the swarm.',
    icon: '📣', rarity: 'rare',
    // The utility native (slowest clear on purpose): a run.novas ring flagged `fear` — it damages,
    // knocks back, AND makes struck enemies flee for `fear` seconds (see FEAR_* below).
    levels: [
      { dmg: 14, rate: 3.2, radius: 150, knockback: 180, fear: 1.0 },
      { dmg: 17, rate: 3.0, radius: 168, knockback: 200, fear: 1.2 },
      { dmg: 21, rate: 2.8, radius: 188, knockback: 225, fear: 1.4 },
      { dmg: 25, rate: 2.6, radius: 208, knockback: 250, fear: 1.6 },
      { dmg: 30, rate: 2.4, radius: 230, knockback: 280, fear: 1.8 },
    ],
  },
  // City chapter natives (v5.4). Neon Beam = the rainbow re-theme (see WEAPONS.rainbow).
  // See stepTornadoWeapon/stepGeyserWeapon in sim.js.
  trashTornado: {
    name: 'Trash Tornado',
    desc: 'Whips up street trash to orbit and batter what it touches.',
    icon: '🌪️', rarity: 'rare',
    // Always-on orbital, like orbit: sim recomputes every chunk's position each frame into
    // run.debris ({x, y, r}) and ticks damage to whatever they overlap every `tick` seconds.
    levels: [
      { dmg: 11, chunks: 3, radius: 90,  rotSpeed: 2.6, tick: 0.5 },
      { dmg: 13, chunks: 3, radius: 98,  rotSpeed: 2.8, tick: 0.5 },
      { dmg: 16, chunks: 4, radius: 108, rotSpeed: 3.1, tick: 0.45 },
      { dmg: 20, chunks: 5, radius: 118, rotSpeed: 3.4, tick: 0.4 },
      { dmg: 26, chunks: 6, radius: 130, rotSpeed: 3.8, tick: 0.35 },
    ],
  },
  sewerGeyser: {
    name: 'Sewer Geyser',
    desc: 'Cracks the street open; scalding jets erupt where foes stand.',
    icon: '⛲', rarity: 'rare',
    // The utility native (slowest clear on purpose): plants `count` telegraphed eruption zones
    // (run.geysers) on/near random enemies within castRange; each waits `fuse` seconds (harmless
    // telegraph), then erupts ONCE for dmg in r. Enemies only — never hurts the player.
    levels: [
      { rate: 3.0, castRange: 260, fuse: 0.70, r: 90,  dmg: 34, count: 1 },
      { rate: 2.8, castRange: 270, fuse: 0.70, r: 98,  dmg: 42, count: 1 },
      { rate: 2.6, castRange: 285, fuse: 0.65, r: 106, dmg: 52, count: 2 },
      { rate: 2.3, castRange: 300, fuse: 0.65, r: 116, dmg: 64, count: 2 },
      { rate: 2.0, castRange: 320, fuse: 0.60, r: 128, dmg: 80, count: 3 },
    ],
  },
  // Skies chapter natives (v5.4). See stepRoarWeapon/stepTailWeapon/stepDebrisWeapon in sim.js.
  roar: {
    name: 'Roar',
    desc: 'A sonic cone that flattens everything in front of you.',
    icon: '🗣️', rarity: 'normal',
    // Same sector geometry as flagella/clawRake (arc rad, range px, aimed at the nearest enemy
    // and falling back to player.facingAngle when none exists — exactly fireFlagella's rule), but
    // longer and narrower, and it shoves what it hits.
    levels: [
      { dmg: 15, rate: 1.00, range: 200, arc: 0.90, knockback: 60 },
      { dmg: 18, rate: 0.92, range: 215, arc: 0.95, knockback: 70 },
      { dmg: 22, rate: 0.84, range: 230, arc: 1.05, knockback: 80 },
      { dmg: 27, rate: 0.75, range: 250, arc: 1.15, knockback: 95 },
      { dmg: 34, rate: 0.66, range: 275, arc: 1.30, knockback: 110 },
    ],
  },
  tailSwipe: {
    name: 'Tail Swipe',
    desc: 'A heavy sweep that clears the ground around you.',
    icon: '🦖', rarity: 'rare',
    // Sector geometry again, but WIDE and short: slow, hard, and it launches. Sits between roar
    // (fast chip) and debrisToss (slow burst) in the skies pool.
    levels: [
      { dmg: 26, rate: 1.60, range: 150, arc: 2.20, knockback: 140 },
      { dmg: 31, rate: 1.50, range: 160, arc: 2.35, knockback: 155 },
      { dmg: 38, rate: 1.40, range: 172, arc: 2.50, knockback: 170 },
      { dmg: 46, rate: 1.28, range: 185, arc: 2.70, knockback: 190 },
      { dmg: 58, rate: 1.15, range: 200, arc: 2.95, knockback: 220 },
    ],
  },
  debrisToss: {
    name: 'Debris Toss',
    desc: 'Hurls a chunk of the skyline that bursts where it lands.',
    icon: '🪨', rarity: 'rare',
    // Lobs `count` chunks (run.lobs) on a `flight`-second arc toward random enemies within
    // castRange, each bursting for dmg in r on landing. Enemies only — never hurts the player.
    levels: [
      // v5.6.15: castRange raised — this is the skies' designated ANTI-AIR pick, so it must
      // comfortably outrange anything that hovers (missile standoff, strafe bank arcs), not tie it.
      // v5.15: flight times cut ~40% (0.60/0.60/0.55/0.55/0.50 -> below) — the throw was floaty.
      // Note this is a small real BUFF as well as a feel change, not just cosmetics: the burst
      // point (tx, ty) is fixed at launch and stepLobs tests it at landing, so a shorter flight is
      // less time for the target to drift out of the blast. castRange is unchanged, so the rock
      // covers the same ground faster rather than reaching further.
      { dmg: 30, rate: 2.6, castRange: 340, flight: 0.36, r: 85,  count: 1 },
      { dmg: 37, rate: 2.4, castRange: 360, flight: 0.36, r: 92,  count: 1 },
      { dmg: 45, rate: 2.2, castRange: 380, flight: 0.33, r: 100, count: 2 },
      { dmg: 55, rate: 2.0, castRange: 400, flight: 0.33, r: 110, count: 2 },
      { dmg: 70, rate: 1.8, castRange: 420, flight: 0.30, r: 122, count: 3 },
    ],
  },
  // Beyond chapter natives (v5.4). Black-Hole Vortex = the hole re-theme (see WEAPONS.hole).
  // See stepShardWeapon/stepTesseractWeapon in sim.js.
  realityShard: {
    name: 'Reality Shard',
    desc: 'Splinters of elsewhere that skip through space as they fly.',
    icon: '🔺', rarity: 'normal',
    // Fires `count` shards at the nearest enemy (fanned STAR_FAN apart, like star's volley). Each
    // shard is a run.bullets projectile tagged weapon:'shard': it flies normally, but every
    // blinkEvery seconds it TELEPORTS blinkDist px further along its own heading (skipping the
    // gap — no damage in between). life = range/speed, and a blink does NOT consume range.
    levels: [
      { dmg: 13, rate: 0.80, count: 2, speed: 380, range: 300, blinkEvery: 0.28, blinkDist: 70,  pierce: 1 },
      { dmg: 15, rate: 0.74, count: 2, speed: 395, range: 320, blinkEvery: 0.26, blinkDist: 75,  pierce: 1 },
      { dmg: 18, rate: 0.68, count: 3, speed: 410, range: 340, blinkEvery: 0.24, blinkDist: 82,  pierce: 2 },
      { dmg: 22, rate: 0.60, count: 3, speed: 430, range: 360, blinkEvery: 0.22, blinkDist: 90,  pierce: 2 },
      { dmg: 27, rate: 0.52, count: 4, speed: 450, range: 390, blinkEvery: 0.20, blinkDist: 100, pierce: 3 },
    ],
  },
  tesseractBeam: {
    name: 'Tesseract Beam',
    desc: 'Folds the arena in half and sweeps the crease.',
    icon: '🔷', rarity: 'epic',
    // A run.beams entry (same shape/step as the Neon Beam) flagged `folded: true`: the "fold" is a
    // second arm 180° opposite the first, sweeping together — i.e. one cast rakes both sides at
    // once. rate (not `interval`) is the cast cadence, matching the other v5.x natives.
    levels: [
      { dmg: 10, tick: 0.16, rate: 6.5, duration: 2.0, rotSpeed: 2.2, width: 34, length: 340 },
      { dmg: 12, tick: 0.16, rate: 6.0, duration: 2.2, rotSpeed: 2.4, width: 36, length: 360 },
      { dmg: 15, tick: 0.15, rate: 5.5, duration: 2.4, rotSpeed: 2.6, width: 38, length: 380 },
      { dmg: 18, tick: 0.15, rate: 5.0, duration: 2.7, rotSpeed: 2.8, width: 42, length: 405 },
      { dmg: 22, tick: 0.14, rate: 4.5, duration: 3.0, rotSpeed: 3.1, width: 46, length: 430 },
    ],
  },
}
export const MAX_WEAPON_LEVEL = 5
export const MAX_WEAPONS = 4 // equipped cap; new weapons stop appearing once reached

// Weapon tuning shared across levels
export const STAR_LIFE = 1.2  // s, star projectile lifetime
export const STAR_R = 10      // px, star hit radius
export const STAR_FAN = 0.15  // rad between fan shots
export const ORB_R = 12       // px, orbit spark hit radius
export const NOVA_LIFE = 0.45 // s, nova ring expansion time

// Black hole vortex shape (applies to all levels; per-level dmg/tick/radius/pull/etc above)
export const HOLE_CORE_FRAC = 0.22     // core radius as a fraction of hole radius — the "consumed" zone
export const HOLE_RIM_PULL_MUL = 0.35  // pull strength at the outer rim, as a fraction of full `pull`
export const HOLE_RESIST_CAP = 0.6     // elites/tanks: pull strength capped at this fraction of full `pull`
export const HOLE_SPIRAL_MUL = 0.6     // tangential component vs radial pull — makes enemies spiral, not beeline
export const HOLE_CORE_DMG_MUL = 3     // tick damage multiplier for enemies inside the core
export const HOLE_PULL_DECAY = 3       // /s, decay rate of e.holePull once an enemy is no longer inside a hole

// ---- In-run passives ------------------------------------------------------------
// Each pick ROLLS a rarity: applied bonus = base * RARITIES[rarity].mult. A passive carrying a
// `values` table instead rolls ONLY the listed rarities, at the listed flat amounts (v6.3.4:
// defense can't jackpot to mythic — armor/regen's turtle ceiling is capped, not just taxed).
// run.passives[id] accumulates the applied bonus; run.passivePicks[id] counts picks (max 5).
// kind 'pct' renders as +N%, 'flat' as +N <unit>.
export const PASSIVES = {
  moveSpeed:  { name: 'Zoomies',      desc: 'move speed',   base: 0.08, kind: 'pct' },
  magnet:     { name: 'Sticky Aura',  desc: 'gem magnet',   base: 0.30, kind: 'pct' },
  maxHP:      { name: 'Extra Squish', desc: 'max HP (and heals as much)', base: 20, kind: 'flat' },
  fireRate:   { name: 'Hyper Wiggle', desc: 'fire rate',    base: 0.08, kind: 'pct' },
  damage:     { name: 'Angry Goo',    desc: 'damage',       base: 0.06, kind: 'pct' },
  critChance: { name: 'Sharp Eye',    desc: 'crit chance',  base: 0.03, kind: 'pct' },
  critDamage: { name: 'Bully',        desc: 'crit damage',  base: 0.20, kind: 'pct' },
  armor:      { name: 'Thick Jelly',  desc: 'armor (flat damage block)', base: 1, kind: 'flat', values: { normal: 1, rare: 2, legendary: 4 } },
  regen:      { name: 'Self-Goo',     desc: 'HP regen per second', base: 0.5, kind: 'flat', values: { normal: 0.5, rare: 0.8, legendary: 1.5 } },
  xpGain:     { name: 'Big Brain',    desc: 'XP gain',      base: 0.08, kind: 'pct' },
}
export const MAX_PASSIVE_LEVEL = 5

// ---- Weapon mods (v4.1: weapon-mod parity) -------------------------------------
// Every equipped weapon gets its own mod pool (star's original six, plus a matching set for
// every other weapon) so no single weapon outscales the rest. Offered only while its owning
// weapon is equipped, joining the weapon/passive/element pool with equal footing (rolls a
// rarity like passives). run.weaponMods[weaponId][modId] accumulates the applied bonus;
// run.weaponModPicks[weaponId][modId] counts picks (max MAX_WEAPON_MOD_PICKS). Mod ids are
// globally unique across every weapon (never reused between weapons).
//
// kind 'flat' (base 1): bonus = max(1, round(base * rarityMult)) — an extra unit (orb/
// boomerang/mine slot/wisp/pierce/shard/bounce) per pick.
// kind 'pct' (base ~0.20): bonus = base * rarityMult, additive — a percent bump to a stat
// (radius/speed/damage/range/duration/...).
// kind 'switch' (v6.6.15): the mod is an ON/OFF unlock — sim.js reads it as `(... ?? 0) > 0` and a
// second pick changes NOTHING. Playtest caught this: Sticky Scent was declared flat base 1, so a
// legendary roll printed "+4 burst leaves a slow zone" — a number that meant nothing, on a card the
// player had already taken, and it could be offered up to MAX_WEAPON_MOD_PICKS times. A switch is
// therefore offered AT MOST ONCE, only at normal rarity (it has no magnitude for rarity to scale,
// exactly like the values-passives that decline to roll outside their own table), and its card
// prints the effect with no "+N" in front of it.
// kind 'tier': bonus = WEAPON_MOD_TIER_BONUS[rarity], extra "things per cast" (rings/echoes/
// bomblets/vortexes/beams/volleys/jumps) — tiered rather than rarityMult-multiplied so a
// mythic pick can't spiral a per-cast entity count out of control the way a flat rarityMult
// multiply would (a mythic pierce/blast pick multiplies fine; a mythic +6.5 beams would not).
//
// Behavioral mods (read directly off run.weaponMods.<weapon>.<mod> at their trigger site in
// sim.js, rather than folding into effectiveWeaponStats):
//   star.multishot/split/chain/ricochet: unchanged from v2/v3 (see fireStar/stepBullets).
//   orbit.twinRing:    N orbs on an inner ring at ORBIT_TWIN_RING_RADIUS_FRAC of the main
//                      ring's radius, counter-rotating, same dmg/tick as the main ring.
//   orbit.bigOrbs:     scales ORB_R (a constant, not a `levels[]` field) — read directly too.
//   wave.echo:         N echo novas queued per cast, each firing WAVE_ECHO_DELAY later than
//                      the previous, at WAVE_ECHO_DMG_FRAC damage (full radius/knockback).
//   boomerang.bigBlade: scales BOOMERANG_HIT_R (a constant) — read directly, like bigOrbs.
//   mines.cluster:     N bomblets flung outward when a (non-bomblet) mine pops — each a small
//                      mine (`small: true`) at MINE_CLUSTER_DMG_FRAC damage,
//                      MINE_CLUSTER_RADIUS_FRAC radius, MINE_CLUSTER_ARM arm time, scattered
//                      MINE_CLUSTER_SCATTER_MIN..MAX px away. Bomblets never cluster further.
//   homing.phantom:    +N pierce per wisp (added to a base pierce of 1) — a wisp survives a
//                      hit and keeps homing, excluding enemies already in its hitIds.
//   hole.singularity:  N extra vortexes per cast, at HOLE_SINGULARITY_FRAC radius/coreRadius/
//                      pull, spawned on other random in-view enemies (falls back to a random
//                      offset, like the main cast, when none are available).
//   rainbow.prismatic: N extra beams per cast, evenly spread around the circle (2 beams total
//                      = 180° apart, 3 = 120°, ...), same stats, all rotating together.
//
// v4.3 "crazy-mod pass" behavioral mods (bring every weapon to 6 mods — see sim.js for the
// exact trigger sites):
//   orbit.supernova:    when an orbit-orb hit KILLS an enemy, it splashes bonus × that hit's
//                       dealt damage to everything else in ORBIT_NOVA_RADIUS (no re-roll) + an
//                       explode event.
//   wave.undertow:      knockback stays normal/positive (novas always push enemies back); at
//                       cast time every gem/coin within radius * (1 + UNDERTOW_VAC_RADIUS_PER_STACK
//                       * stacks) of the cast point is marked `_vac` and homes to the player until
//                       collected, ignoring magnet range. Echo re-casts do not re-vacuum.
//   wave.tsunami:       every TSUNAMI_EVERY-th cast (tracked by run._waveCasts) multiplies that
//                       cast's radius AND damage by (1 + bonus) — a "monster wave".
//   boomerang.backhand: boomerangs deal (1 + bonus)× damage while in their 'back' (return) phase.
//   boomerang.seeker:   outbound ('out' phase only) boomerangs steer toward the nearest enemy at
//                       SEEKER_TURN_RATE × bonus rad/s, baked into the boomerang at throw time.
//   mines.magnetic:     armed (not-yet-triggered) mines crawl toward the nearest enemy at
//                       MINE_CRAWL_SPEED × bonus px/s.
//   mines.chainReaction: when a mine explodes, up to <tier bonus> other ARMED mines within its
//                       blast radius detonate immediately too (cascading breadth-first; a mine
//                       only ever detonates once).
//   homing.wispNova:    when a wisp dies (spent its last pierce on a hit, or its lifetime
//                       expired) it pops: AoE splash = bonus × the wisp's dmg in
//                       WISP_NOVA_RADIUS + explode event. Mini-wisps (see swarm) can pop too.
//   homing.swarm:       when a (non-mini) wisp's hit KILLS an enemy, spawn <tier bonus> mini
//                       wisps at the kill spot (SWARM_DMG_FRAC × dmg, SWARM_LIFE lifetime, same
//                       speed/turn rate) flagged `_mini` — mini wisps never re-trigger swarm.
//   hole.hungry:        a hole's radius (and coreRadius, kept proportional) grows by
//                       bonus × its spawn radius per second while alive — visual-safe since
//                       render already re-reads h.radius/coreRadius every frame.
//   hole.crunch:        when a hole expires, it collapses in a detonation: damage = hole tick
//                       dmg × CRUNCH_DMG_MUL × (1 + bonus) to everything within its final
//                       radius + explode event there.
//   rainbow.focus:      a beam's damage ramps linearly from 1× at cast to (1 + bonus)× at the
//                       end of its duration (recomputed every tick from elapsed/duration).
//   rainbow.strobe:     beam tick period divided by (1 + bonus), baked in at cast time (faster
//                       ticks = more hits over the same duration).
//
// Everything else (extraOrb/wideRing/overdrive/bigWave/shove/amplitude/extraRang/longThrow/
// heavyBlade/minefield/bigBoom/heavyCharge/extraWisp/longLife/agile/biggerHole/lasting/denser/
// wideBeam/longBeam/sustain) is a plain STAT mod folded into a weapon's per-level numbers by
// effectiveWeaponStats — see sim.js.
// v6.6.27 (owner: "reduce the number of redundant mods"). A mod may cap its OWN pick count below
// MAX_WEAPON_MOD_PICKS via `maxPicks` (read by eligibleWeaponModCandidates in sim.js). This is the
// v6.6.15 switch fix one step softer: a switch offered twice does literally nothing, while these
// do something worth ~1% — legal, but a trap on a card that costs you the whole level-up.
//
// Every pierce mod in the game shares one ceiling, which is why they share one constant. A
// projectile's hits per cast are bounded by GEOMETRY, not by its pierce budget: it can only meet
// what its own path crosses before its life expires. Measured on the stinger at L5 (240s garden
// d3, ~100-enemy field), volley hits plateau at ~11 no matter how large the budget gets —
// pierce 3 -> 4 buys +14% dps, 4 -> 6 buys +11%, and every pick after that is worth ~1% each while
// still consuming a card slot up to the global cap of 5. Two picks is where the curve flattens.
// Raising the ladder in a weapon's levels[] is the honest lever past that point, not more cards.
export const PIERCE_MAX_PICKS = 2
// v6.6.28, same machinery, same reason — reboundQuills' marginal value collapses well before the
// global cap. Measured solo quillBurst L5: 1 pick +9.4% dps, 2 picks +12%, 5 rare picks +17%,
// 5 MYTHIC picks (15 accumulated return trips) +20%. Picks 3-5 are worth ~1.7% each while the live
// quill count on a 390x844 phone goes from 11 to 47. `moreQuills` at three rare picks measures +15%
// at twelve live quills — strictly more damage for a quarter of the clutter — so past the second
// pick the card is dominated by its own stablemate AND is the one making the screen unreadable.
// 2 picks = 6 return trips at mythic, which is where the dps curve flattens (6 trips +18.3%,
// 15 trips +17.8%).
export const REBOUND_MAX_PICKS = 2
export const WEAPON_MODS = {
  star: {
    // blast ("Exploding Stars") removed in v4.6 — star AoE splash on every hit made it a
    // no-brainer even after the v4.4 offer caps (user call: star keeps 5 mods, no explosions).
    pierce:    { name: 'Membrane Piercer',  desc: 'antigen pierce',                    icon: '🎯', base: 1,    kind: 'flat', maxPicks: PIERCE_MAX_PICKS },
    multishot: { name: 'Split Strain',     desc: 'antigens per volley',              icon: '💫', kind: 'tier' },
    split:     { name: 'Mitosis',     desc: "shard(s) on an antigen's first hit", icon: '🔱', base: 1,    kind: 'flat' },
    chain:     { name: 'Signal Cascade',     desc: 'chain jump(s) on spent antigens',  icon: '🔗', kind: 'tier' },
    ricochet:  { name: 'Reflex Rebound',  desc: 'bounce(s) on spent antigens',      icon: '🪀', base: 1,    kind: 'flat' },
  },
  orbit: {
    extraOrb:  { name: 'Extra Phages', desc: 'phages on your ring',                  icon: '✨', base: 1,    kind: 'flat' },
    bigOrbs:   { name: 'Engorged Phages',   desc: 'phage hit radius',                     icon: '🔵', base: 0.20, kind: 'pct' },
    wideRing:  { name: 'Wide Orbit',   desc: 'ring radius',                        icon: '🪐', base: 0.20, kind: 'pct' },
    overdrive: { name: 'Fever Spin',    desc: 'orbit rotation speed',               icon: '🌀', base: 0.20, kind: 'pct' },
    twinRing:  { name: 'Double Membrane',    desc: 'counter-rotating inner ring of phages', icon: '💠', kind: 'tier' },
    supernova: { name: 'Lysis Burst', desc: 'phage-kill splash damage',         icon: '🌟', base: 0.50, kind: 'pct' },
  },
  wave: {
    bigWave:   { name: 'Systemic Surge',  desc: 'nova radius',           icon: '🌊', base: 0.20, kind: 'pct' },
    shove:     { name: 'Fever Shove', desc: 'nova knockback',        icon: '👊', base: 0.20, kind: 'pct' },
    amplitude: { name: 'Inflammation', desc: 'wave damage',           icon: '📢', base: 0.20, kind: 'pct' },
    echo:      { name: 'Immune Echo', desc: 'echo wave(s) per cast', icon: '🔁', kind: 'tier' },
    undertow:  { name: 'Chemotaxis',  desc: 'novas reel in gems and coins (wider per stack)', icon: '🧲', base: 1, kind: 'flat' },
    tsunami:   { name: 'Cytokine Storm',   desc: 'radius/damage on every 3rd (monster) wave', icon: '🌊', base: 0.60, kind: 'pct' },
  },
  // v5.3: the id stays 'boomerang' (Leaf Blade re-theme is copy-only, see WEAPONS.boomerang);
  // only the desc copy was retouched from 'boomerang' to 'leaf blade' where it named the weapon.
  boomerang: {
    // v6.6.13 (playtest): was kind 'flat' base 1, i.e. max(1, round(1 * rarityMult)) — a RARE roll
    // already handed out +2 blades and a mythic one +7, on top of the weapon's own 1/1/2/2/3 ladder.
    // That is exactly the spiral WEAPON_MOD_TIER_BONUS exists to prevent (see its note above): a
    // per-cast ENTITY COUNT must not be multiplied by rarity. As a tier mod the second blade now
    // starts at epic (1/1/2/2/3 by rarity), which is what the playtester asked for.
    extraRang:  { name: 'Extra Blades', desc: 'leaf blade(s) per throw', icon: '🍃', kind: 'tier' },
    longThrow:  { name: 'Long Throw',   desc: 'leaf blade range',      icon: '📏', base: 0.20, kind: 'pct' },
    bigBlade:   { name: 'Big Blade',    desc: 'leaf blade hit radius', icon: '⚔️', base: 0.20, kind: 'pct' },
    heavyBlade: { name: 'Heavy Blade',  desc: 'leaf blade damage',     icon: '🔨', base: 0.20, kind: 'pct' },
    backhand:   { name: 'Backhand',      desc: 'leaf blade return-swing damage',      icon: '🤛', base: 0.50, kind: 'pct' },
    seeker:     { name: 'Seeker Blades', desc: 'outbound curve-toward-target strength', icon: '🧭', base: 0.50, kind: 'pct' },
  },
  mines: {
    minefield:   { name: 'Minefield',     desc: 'max mines alive',             icon: '🪤', base: 1,    kind: 'flat' },
    bigBoom:     { name: 'Big Boom',      desc: 'mine blast radius',           icon: '💥', base: 0.20, kind: 'pct' },
    heavyCharge: { name: 'Heavy Charge',  desc: 'mine damage',                 icon: '🧨', base: 0.20, kind: 'pct' },
    cluster:     { name: 'Cluster Bombs', desc: 'bomblet(s) when a mine pops', icon: '🎆', kind: 'tier' },
    magnetic:      { name: 'Magnetic Mines', desc: 'armed-mine crawl speed toward foes', icon: '🧲', base: 0.50, kind: 'pct' },
    chainReaction: { name: 'Chain Reaction', desc: 'nearby armed mine(s) detonated by a blast', icon: '⛓️', kind: 'tier' },
  },
  homing: {
    extraWisp: { name: 'Clone Culture',   desc: 'seekers per volley', icon: '🔮', base: 1,    kind: 'flat' },
    longLife:  { name: 'Telomere Boost',     desc: 'seeker lifetime',    icon: '⏳', base: 0.20, kind: 'pct' },
    agile:     { name: 'Flagellar Motor',   desc: 'seeker turn rate',   icon: '🦋', base: 0.20, kind: 'pct' },
    phantom:   { name: 'Phase Membrane', desc: 'pierce per seeker',  icon: '👻', base: 1,    kind: 'flat' },
    wispNova:  { name: 'Apoptosis Pop', desc: 'seeker death-pop splash damage',  icon: '💥', base: 0.60, kind: 'pct' },
    swarm:     { name: 'Rapid Division',         desc: 'mini seeker(s) spawned on a seeker kill', icon: '🐝', kind: 'tier' },
  },
  hole: {
    biggerHole:  { name: 'Bigger Hole',    desc: 'vortex radius',             icon: '🕳️', base: 0.20, kind: 'pct' },
    lasting:     { name: 'Lasting Vortex', desc: 'vortex duration',           icon: '⏱️', base: 0.20, kind: 'pct' },
    denser:      { name: 'Denser Pull',    desc: 'vortex pull',               icon: '🌌', base: 0.20, kind: 'pct' },
    singularity: { name: 'Singularity',    desc: 'extra vortex(es) per cast', icon: '🌠', kind: 'tier' },
    hungry:      { name: 'Hungry Hole', desc: 'vortex growth rate while alive',       icon: '🍽️', base: 0.40, kind: 'pct' },
    crunch:      { name: 'Big Crunch',  desc: 'vortex collapse detonation damage',    icon: '🌋', base: 1.00, kind: 'pct' },
  },
  rainbow: {
    wideBeam:  { name: 'Wide Beam',       desc: 'beam width',             icon: '📡', base: 0.20, kind: 'pct' },
    longBeam:  { name: 'Long Beam',       desc: 'beam length',            icon: '↔️', base: 0.20, kind: 'pct' },
    sustain:   { name: 'Sustain',         desc: 'beam duration',          icon: '⌛', base: 0.20, kind: 'pct' },
    prismatic: { name: 'Prismatic Split', desc: 'extra beam(s) per cast', icon: '🎇', kind: 'tier' },
    focus:     { name: 'Focus Lens', desc: 'beam damage ramp by the end of its duration', icon: '🔎', base: 0.80, kind: 'pct' },
    strobe:    { name: 'Strobe Ray', desc: 'beam tick rate',                             icon: '💡', base: 0.40, kind: 'pct' },
  },
  // Pond natives (v5.0 task 4). Percents match the contract exactly (base = the normal-rarity
  // headline; rarity scales it, like every pct mod). reach/wideArc/heavyLash fold into
  // flagella's levels[] via WEAPON_STAT_MODS (sim.js); frenzy (attack speed) is read at the
  // swing's fire site (it divides the swing interval, like the global fire-rate does — a
  // levels[] `rate` bump would slow it, so it can't ride WEAPON_STAT_MODS). cyclone/barbed are
  // behavioral (read at their trigger sites — see fireFlagella/applyBleed in sim.js).
  flagella: {
    reach:     { name: 'Long Reach',  desc: 'whip range',  icon: '📏', base: 0.35, kind: 'pct' },
    // v6.6.13 (playtest: "'+X whip arc' not clear or doesn't do anything"). It does — a +30% pick
    // hits 34% more of a ring of enemies, measured. But "arc" is design vocabulary, not something
    // the player can see, so the card named a number nobody could check. All four sector weapons
    // (whip/claw/roar/tail) named theirs the same way; they now say what widens on screen.
    wideArc:   { name: 'Wide Arc',    desc: 'whip sweep width', icon: '🪭', base: 0.30, kind: 'pct' },
    frenzy:    { name: 'Frenzy',      desc: 'whip speed',  icon: '💨', base: 0.25, kind: 'pct' },
    heavyLash: { name: 'Heavy Lash',  desc: 'whip damage', icon: '🔨', base: 0.40, kind: 'pct' },
    cyclone:   { name: 'Cyclone',     desc: 'full 360° sweep (every 3rd swing)', icon: '🌀', kind: 'switch' },
    barbed:    { name: 'Barbed Lash', desc: 'bleed on struck foes (over 3s, dot)', icon: '🩸', base: 0.50, kind: 'pct' },
  },
  // bigBloom/lasting/virulent fold into bloom's levels[] via WEAPON_STAT_MODS; quickCast (cast
  // rate) is read at the plant site (divides the plant interval, same reason as flagella.frenzy).
  // twinBloom/sporeburst are behavioral (read at their trigger sites — see stepBloomWeapon/
  // stepBlooms in sim.js). twinBloom is a flat entity-count mod (+1 cloud/pick, like extraOrb).
  // v6.4: tideCarried is also behavioral (per-pick cloud drift along currentForce + a tick damage
  // bonus, both read in stepBlooms) — deliberately NOT routed through WEAPON_STAT_MODS.
  bloom: {
    bigBloom:   { name: 'Big Bloom',       desc: 'cloud radius',      icon: '🌸', base: 0.35, kind: 'pct' },
    lasting:    { name: 'Lingering Spores', desc: 'cloud duration',    icon: '⏳', base: 0.40, kind: 'pct' },
    virulent:   { name: 'Virulent',        desc: 'cloud tick damage', icon: '☣️', base: 0.35, kind: 'pct' },
    quickCast:  { name: 'Quick Cast',      desc: 'cast rate',         icon: '⏩', base: 0.25, kind: 'pct' },
    twinBloom:  { name: 'Twin Bloom',      desc: 'extra cloud(s) per cast',        icon: '🌺', base: 1, kind: 'flat' },
    sporeburst: { name: 'Sporeburst',      desc: 'mini-cloud when a foe dies inside', icon: '💥', kind: 'switch' },
    tideCarried:{ name: 'Tide-Carried',    desc: 'clouds ride the current, ticking harder', icon: '🌊', base: 1, kind: 'flat' },
  },
  // Garden natives (v5.3 task, see stepStingerWeapon/stepLureWeapon in sim.js). sharper/volley/
  // piercingNeedles fold into stinger's levels[] via WEAPON_STAT_MODS; longNeedles (range AND
  // speed) and rapid (attack
  // rate — dividing it into the levels[] `rate` would SLOW it, like flagella.frenzy) are read at the
  // fire site. venomTips/hive are behavioral (needle hit site / volley fire site).
  stinger: {
    sharper:     { name: 'Sharper Tips', desc: 'needle damage',        icon: '🗡️', base: 0.25, kind: 'pct' },
    volley:      { name: 'Wider Volley', desc: 'needles per volley',   icon: '🎯', base: 2,    kind: 'flat' },
    longNeedles: { name: 'Long Needles', desc: 'needle range & speed', icon: '📏', base: 0.30, kind: 'pct' },
    rapid:       { name: 'Rapid Fire',   desc: 'volley rate',          icon: '🚀', base: 0.25, kind: 'pct' },
    piercingNeedles: { name: 'Barbed Needles', desc: 'needle pierce', icon: '🪝', base: 1, kind: 'flat', maxPicks: PIERCE_MAX_PICKS },
    venomTips:   { name: 'Venom Tips',   desc: 'needles inject 1 venom stack', icon: '☠️', kind: 'switch' },
    hive:        { name: 'Hive Mind',    desc: 'every 4th volley fires all around', icon: '🐝', kind: 'switch' },
  },
  // widerTaunt/longerLure fold into lure's levels[] via WEAPON_STAT_MODS; bigBurst (burst dmg AND
  // radius) and fastLure (plant rate) are read at the plant/burst site. twinLure (+decoy, a flat
  // entity-count mod like twinBloom) and stickyScent are behavioral (plant/burst site).
  lure: {
    widerTaunt:  { name: 'Wider Taunt',   desc: 'lure aggro radius',     icon: '📡', base: 0.30, kind: 'pct' },
    bigBurst:    { name: 'Big Burst',     desc: 'burst damage & radius', icon: '💥', base: 0.30, kind: 'pct' },
    longerLure:  { name: 'Lasting Lure',  desc: 'lure duration',         icon: '⏳', base: 0.35, kind: 'pct' },
    fastLure:    { name: 'Quick Bait',    desc: 'plant rate',            icon: '⏩', base: 0.25, kind: 'pct' },
    twinLure:    { name: 'Twin Lure',     desc: 'extra decoy(s) per cast', icon: '🌺', base: 1, kind: 'flat' },
    stickyScent: { name: 'Sticky Scent',  desc: 'burst leaves a slow zone', icon: '🕸️', kind: 'switch' },
  },
  // ---- Undergrowth natives (v5.4) ----
  // rend/wideRake/longClaws fold into clawRake's levels[] via WEAPON_STAT_MODS; quickPaws (attack
  // rate — dividing it into the levels[] `rate` would SLOW it, like flagella.frenzy) is read at the
  // fire site. doubleSlash/bleedClaws are behavioral (see stepClawRake/applyBleed in sim.js).
  // ambushPredator (v6.5, behavioral — see slashClaws/AMBUSH_R): conditional-vs-flat vs rend — counts
  // an armed OR sprung trap near the PLAYER, so springing your own trap can't turn the buff off
  // (that anti-synergy is why the pre-panel 0.30/armed-only draft lost to plain rend).
  clawRake: {
    rend:        { name: 'Rending Claws', desc: 'claw damage', icon: '🩸', base: 0.35, kind: 'pct' },
    wideRake:    { name: 'Wide Rake',     desc: 'claw sweep width', icon: '🪭', base: 0.30, kind: 'pct' },
    longClaws:   { name: 'Long Claws',    desc: 'claw reach',  icon: '📏', base: 0.30, kind: 'pct' },
    quickPaws:   { name: 'Quick Paws',    desc: 'rake rate',   icon: '💨', base: 0.25, kind: 'pct' },
    doubleSlash: { name: 'Double Slash',  desc: 'every 3rd rake slashes twice',        icon: '🐈', kind: 'switch' },
    bleedClaws:  { name: 'Bleeding Claws', desc: 'bleed on raked foes (over 3s, dot)', icon: '🩹', base: 0.50, kind: 'pct' },
    ambushPredator: { name: 'Ambush Predator', desc: 'claws hit harder near a trap', icon: '🪤', base: 0.45, kind: 'pct' },
  },
  // sharpQuills/moreQuills fold into quillBurst's levels[] via WEAPON_STAT_MODS;
  // rapidQuills (burst rate) is read at the fire site. retaliate and reboundQuills are behavioral
  // (hurtPlayer's path — see QUILL_RETALIATE_CD below — and stepBullets' end-of-life branch).
  //
  // v6.6.28 (owner: "'quill range and speed' is useless"). `longQuills` is gone; `reboundQuills`
  // takes its slot. The owner is right, and the measurement agrees: at 8 seeds one pick of
  // longQuills was worth +4.4% dps (se 1.8) against sharpQuills' +11.3% and retaliate's +11.9% —
  // the bottom of the pool. The fault is that it scales range and speed TOGETHER, so
  // `life = range/speed` never changes: the ring is 30% wider and gone in exactly the same 0.55s.
  // A dud card is one you cannot see working, and that was the only quill mod that qualified.
  // Post-fix, 8 seeds, L5 solo, one pick each: Retaliation +7.7%, Sharp Quills +6.4%, Twitchy Spine
  // +5.3%, Rebound Quills +4.5% (and the best KILL gain of the pool, 303 -> 320), Bristling +3.6%,
  // Barbed Quills -2.0%.
  // Barbed Quills is not in that list any more. v6.6.29 (owner: "cut the card entirely") DELETED
  // it. Flattening base pierce to 2 at every level — the ladder fix, see WEAPONS.quillBurst above —
  // ate its own pierce mod: pierce on a 360-degree ring saturates, measured lambda (mean encounters
  // over a quill's whole flight) is 0.477 at L5, so pierce 2 already captures 94% of it and
  // pierce 2 -> infinity is worth +5.7% IN TOTAL. Measured at one pick it was -2.0%, i.e. the new
  // Long Quills. The owner was offered a re-point onto quill THICKNESS (the one lever that is not
  // saturated, predicted +19%/pick) and chose the cut: five cards that all do something beats six
  // with a passenger. quillBurst therefore has five mods, and the pierce the owner asked for lives
  // in the base ladder rather than in a card.
  // (An earlier 2-seed pass of this table put longQuills at +6.8% and piercingQuills at +6.1%. The
  // per-seed sd of these paired deltas is 2.6-7.3 points, so two seeds carry +-2-5 points of
  // standard error and could not resolve anything below a ~7-point gap. Eight seeds is the floor
  // for ranking mods here; the ORDER survived the re-measure, the magnitudes did not.)
  quillBurst: {
    sharpQuills:    { name: 'Sharp Quills',   desc: 'quill damage',        icon: '🗡️', base: 0.25, kind: 'pct' },
    moreQuills:     { name: 'Bristling',      desc: 'quills per burst',    icon: '🦔', base: 2,    kind: 'flat' },
    // The desc says RETURN PASSES PER QUILL, not "N quills come back", because that is what the
    // code does: fireQuills stamps `_reboundsLeft` inside its per-quill loop, so EVERY quill in the
    // ring carries the budget and the tier number is how many times each one turns around. The
    // first draft of this string ('quill(s) sweep back through on the return') read as a count of
    // quills and would have had a level-5 player believe two of twelve came back rather than all
    // twelve, twice each.
    reboundQuills:  { name: 'Rebound Quills', desc: 'return pass(es) per quill', icon: '↩️', kind: 'tier', maxPicks: REBOUND_MAX_PICKS },
    rapidQuills:    { name: 'Twitchy Spine',  desc: 'burst rate',          icon: '⏩', base: 0.25, kind: 'pct' },
    retaliate:      { name: 'Retaliation',    desc: 'getting hit fires a free burst', icon: '💢', base: 1, kind: 'flat' },
  },
  // terror/shockwave/shrill fold into chitterShriek's levels[] via WEAPON_STAT_MODS; rapidShriek
  // (cast rate) is read at the cast site. echoShriek/panicRout are behavioral (see stepShriekWeapon
  // and the fear handling in dealDamage/stepEnemyMovement).
  // v6.6.28 (owner: "maybe a couple of combining quill and shriek") adds chitterSpines. It lives on
  // the SHRIEK, not on the quill, and that is the whole design decision:
  //   - the obvious crossover — a quill mod that PANICS what it hits — is a trap. The quill ring
  //     covers 300px every 0.9s at L5, so even a 0.4s fear on that cadence is ~44% uptime of total
  //     contact immunity (fleeing enemies deal no contact damage at all), and stacked to the pick
  //     cap it is permanent. It would also make quillBurst strictly better at chitterShriek's own
  //     job: fear IS the shriek's identity, and the shriek only reaches 150-230px every 2.4-3.2s.
  //   - put the crossover the other way round and both weapons keep what they are. The shriek's
  //     weakness is REACH (it is a nova bounded by `radius`); firing quills outward on the cast
  //     gives it exactly that, using the quill as the vehicle. It also can't be a dead card: the
  //     spines are fired from the shriek's own stats, so it works with or without quillBurst owned.
  // Post-fix, 8 seeds, L5 solo, one pick each: Shrill +5.7%, Shockwave +5.6%, Chitter Spines +4.7%,
  // Echo Shriek +3.9%, Chatterbox +3.8%, Terror +1.2%, Panic Rout +0.8%. The FIRST draft of this
  // card measured +0.0% — three separate causes, all documented at fireShriekSpines in sim.js.
  // Mid-pack is the target for a reach card on a utility weapon; it is not meant to beat Shrill.
  chitterShriek: {
    terror:       { name: 'Terror',       desc: 'fear duration',  icon: '😱', base: 0.35, kind: 'pct' },
    shockwave:    { name: 'Shockwave',    desc: 'shriek radius',  icon: '📡', base: 0.30, kind: 'pct' },
    shrill:       { name: 'Shrill',       desc: 'shriek damage',  icon: '📢', base: 0.30, kind: 'pct' },
    rapidShriek:  { name: 'Chatterbox',   desc: 'shriek rate',    icon: '⏩', base: 0.25, kind: 'pct' },
    echoShriek:   { name: 'Echo Shriek',  desc: 'echo shriek(s) per cast',      icon: '🔁', kind: 'tier' },
    panicRout:    { name: 'Panic Rout',   desc: 'damage taken by fleeing foes',  icon: '🏃', base: 0.40, kind: 'pct' },
    // perTier 4: WEAPON_MOD_TIER_BONUS.normal is 1, and fireShriekSpines spaces its spines with
    // `angle = (i / count) * 2pi` — so at a bare tier bonus a normal pick fires exactly ONE spine,
    // at angle 0, due east, on every cast for the rest of the run. Measured that way the card was
    // worth +0.5% dps (se 1.4): nothing. At 4 a normal pick throws a 4-point cross and a mythic one
    // throws 12. (echoShriek gets away with a bare tier bonus because one extra echo is a whole
    // extra nova; one extra spine is one bullet out of a ring.)
    chitterSpines: { name: 'Chitter Spines', desc: 'quill(s) spat outward per shriek', icon: '🦔', kind: 'tier', perTier: 4 },
  },
  // ---- City natives (v5.4; Neon Beam rides the existing WEAPON_MODS.rainbow set above) ----
  // heavyTrash/wideTornado/fasterSpin/moreTrash fold into trashTornado's levels[] via
  // WEAPON_STAT_MODS. flingDebris/suction are behavioral (see stepTornadoWeapon in sim.js).
  trashTornado: {
    heavyTrash:  { name: 'Heavy Trash',   desc: 'debris damage',   icon: '🔨', base: 0.25, kind: 'pct' },
    wideTornado: { name: 'Wide Tornado',  desc: 'orbit radius',    icon: '🪐', base: 0.25, kind: 'pct' },
    fasterSpin:  { name: 'Faster Spin',   desc: 'spin speed',      icon: '🌀', base: 0.25, kind: 'pct' },
    moreTrash:   { name: 'More Trash',    desc: 'debris chunks',   icon: '🗑️', base: 1,    kind: 'flat' },
    flingDebris: { name: 'Fling Debris',  desc: 'chunk(s) hurled outward periodically', icon: '🎯', kind: 'tier' },
    suction:     { name: 'Suction',       desc: 'inward pull on nearby foes',           icon: '🌬️', base: 0.50, kind: 'pct' },
  },
  // pressure/wideGeyser/moreGeysers fold into sewerGeyser's levels[] via WEAPON_STAT_MODS;
  // rapidGeyser (cast rate) is read at the cast site. launch/chainGeyser/trafficMain are
  // behavioral (see stepGeysers/stepGeyserWeapon in sim.js).
  sewerGeyser: {
    pressure:    { name: 'High Pressure', desc: 'eruption damage', icon: '💥', base: 0.30, kind: 'pct' },
    wideGeyser:  { name: 'Wide Geyser',   desc: 'eruption radius', icon: '📡', base: 0.30, kind: 'pct' },
    rapidGeyser: { name: 'Burst Main',    desc: 'cast rate',       icon: '⏩', base: 0.25, kind: 'pct' },
    moreGeysers: { name: 'Broken Mains',  desc: 'geysers per cast', icon: '⛲', base: 1,   kind: 'flat' },
    launch:      { name: 'Launch',        desc: 'eruptions fling and stun what they catch', icon: '🚀', base: 1, kind: 'flat' },
    chainGeyser: { name: 'Chain Burst',   desc: 'follow-up geyser(s) per eruption',         icon: '🎆', kind: 'tier' },
    // v6.3: without the placement bias this mod's uptime is ~15-25% and uninfluencable — a trap
    // pick. The bias (stepGeyserWeapon's cast: prefer a lane-covered enemy) is the point.
    trafficMain: { name: 'Traffic Main',  desc: 'eruptions inside a live lane hit far harder — and geysers seek the street', icon: '🚦', base: 0.40, kind: 'pct' },
  },
  // ---- Skies natives (v5.4) ----
  // bellow/wideRoar/farRoar fold into roar's levels[] via WEAPON_STAT_MODS; rapidRoar (attack
  // rate) is read at the fire site. stagger/resonance are behavioral (see stepRoarWeapon).
  roar: {
    bellow:    { name: 'Bellow',      desc: 'roar damage', icon: '📢', base: 0.30, kind: 'pct' },
    wideRoar:  { name: 'Wide Roar',   desc: 'roar cone width', icon: '🪭', base: 0.30, kind: 'pct' },
    farRoar:   { name: 'Carrying Roar', desc: 'roar range', icon: '📏', base: 0.30, kind: 'pct' },
    rapidRoar: { name: 'Short Breath', desc: 'roar rate',   icon: '💨', base: 0.25, kind: 'pct' },
    stagger:   { name: 'Stagger',     desc: 'stun on roared foes',              icon: '💫', base: 0.50, kind: 'pct' },
    resonance: { name: 'Resonance',   desc: 'every 3rd roar goes all around',   icon: '🌀', kind: 'switch' },
  },
  // heavyTail/longTail/broadSweep fold into tailSwipe's levels[] via WEAPON_STAT_MODS; quickTail
  // (attack rate) is read at the fire site. wreckingTail/counterSwipe are behavioral (see
  // stepTailWeapon and the counter hook in hurtPlayer).
  tailSwipe: {
    heavyTail:    { name: 'Heavy Tail',    desc: 'swipe damage', icon: '🔨', base: 0.30, kind: 'pct' },
    longTail:     { name: 'Long Tail',     desc: 'swipe reach',  icon: '📏', base: 0.30, kind: 'pct' },
    broadSweep:   { name: 'Broad Sweep',   desc: 'tail sweep width', icon: '🪭', base: 0.25, kind: 'pct' },
    quickTail:    { name: 'Quick Tail',    desc: 'swipe rate',   icon: '💨', base: 0.25, kind: 'pct' },
    wreckingTail: { name: 'Wrecking Tail', desc: 'collateral damage where launched foes land', icon: '🎳', base: 0.40, kind: 'pct' },
    counterSwipe: { name: 'Counter Swipe', desc: 'getting hit triggers a free swipe',          icon: '💢', kind: 'switch' },
  },
  // heavyDebris/bigImpact/moreDebris fold into debrisToss' levels[] via WEAPON_STAT_MODS; longToss
  // (castRange) and rapidToss (cast rate) are read at the throw site. shrapnel is behavioral
  // (see stepLobs in sim.js).
  debrisToss: {
    heavyDebris: { name: 'Heavy Debris', desc: 'impact damage', icon: '🔨', base: 0.30, kind: 'pct' },
    bigImpact:   { name: 'Big Impact',   desc: 'burst radius',  icon: '💥', base: 0.30, kind: 'pct' },
    longToss:    { name: 'Long Toss',    desc: 'throw range',   icon: '📏', base: 0.30, kind: 'pct' },
    rapidToss:   { name: 'Quick Hands',  desc: 'throw rate',    icon: '⏩', base: 0.25, kind: 'pct' },
    moreDebris:  { name: 'Both Hands',   desc: 'chunks per throw', icon: '🪨', base: 1,  kind: 'flat' },
    shrapnel:    { name: 'Shrapnel',     desc: 'splinter(s) scattered by each impact', icon: '🎆', kind: 'tier' },
  },
  // ---- Beyond natives (v5.4; the Black-Hole Vortex rides the existing WEAPON_MODS.hole set) ----
  // keenShard/moreShards/pierceShard fold into realityShard's levels[] via WEAPON_STAT_MODS;
  // rapidShard (fire rate) is read at the fire site. riftScar/recursion are behavioral (see
  // stepShardWeapon / the shard branch of stepBullets).
  realityShard: {
    keenShard:   { name: 'Keen Shards',  desc: 'shard damage',     icon: '🗡️', base: 0.25, kind: 'pct' },
    moreShards:  { name: 'Splintering',  desc: 'shards per volley', icon: '🔺', base: 1,    kind: 'flat' },
    pierceShard: { name: 'Phase Edge',   desc: 'shard pierce',     icon: '🎯', base: 1,    kind: 'flat', maxPicks: PIERCE_MAX_PICKS },
    rapidShard:  { name: 'Quick Draw',   desc: 'volley rate',      icon: '⏩', base: 0.25, kind: 'pct' },
    riftScar:    { name: 'Rift Scar',    desc: 'each blink leaves a detonating rift', icon: '🌀', base: 0.50, kind: 'pct' },
    recursion:   { name: 'Recursion',    desc: 'shard(s) forked when one expires',    icon: '♾️', kind: 'tier' },
  },
  // wideFold/longFold/sustainFold fold into tesseractBeam's levels[] via WEAPON_STAT_MODS;
  // rapidFold (cast rate) is read at the cast site. hyperfold/collapse are behavioral (see
  // stepTesseractWeapon / the folded branch of stepBeams).
  tesseractBeam: {
    wideFold:    { name: 'Wide Fold',    desc: 'beam width',    icon: '📡', base: 0.20, kind: 'pct' },
    longFold:    { name: 'Long Fold',    desc: 'beam length',   icon: '↔️', base: 0.20, kind: 'pct' },
    sustainFold: { name: 'Held Fold',    desc: 'beam duration', icon: '⌛', base: 0.20, kind: 'pct' },
    rapidFold:   { name: 'Quick Fold',   desc: 'cast rate',     icon: '⏩', base: 0.25, kind: 'pct' },
    hyperfold:   { name: 'Hyperfold',    desc: 'extra fold arm(s) per cast',        icon: '🔷', kind: 'tier' },
    collapse:    { name: 'Collapse',     desc: 'damage when the fold snaps shut',   icon: '🌋', base: 0.80, kind: 'pct' },
  },
}
export const MAX_WEAPON_MOD_PICKS = 5
// Shared by every tier mod: a single pick's bonus is looked up by rolled rarity rather than
// base*rarityMult, so high-rarity picks stay meaningful without letting per-cast entity counts
// explode (a mythic pierce/blast pick multiplies fine; a mythic +6.5 stars-per-volley would not).
// The `anomaly: 1` entry is REQUIRED, not decorative: run PT.a asserts
// WEAPON_MOD_TIER_BONUS[r] <= max(1, round(RARITIES[r].mult)) over every RARITY_ORDER entry, and
// `undefined <= 1` is false. No mod card ever rolls the anomaly tier (rollCard returns the anomaly
// card itself), so the value is a floor, not a balance number.
export const WEAPON_MOD_TIER_BONUS = { normal: 1, rare: 1, epic: 2, legendary: 2, mythic: 3, anomaly: 1 }
// Level-up pool cap: if more weapon-mod candidates are eligible than this (many weapons owned,
// each with several mods still under MAX_WEAPON_MOD_PICKS), uniformly sample this many per
// buildLevelUpChoices call so mods don't crowd out weapon/passive/element cards.
// Attack-RATE mods divide the interval at their own fire site rather than folding into levels[]
// (folding would SLOW the weapon — see WEAPON_STAT_MODS' note in sim.js), which means a readout
// that only folds stat mods reports the wrong cadence. This is that missing half, as data: weapon
// id -> the mod that divides its interval. Weapons absent here have no rate mod.
export const WEAPON_RATE_MODS = {
  flagella: 'frenzy', bloom: 'quickCast', stinger: 'rapid', lure: 'fastLure',
  clawRake: 'quickPaws', quillBurst: 'rapidQuills', chitterShriek: 'rapidShriek',
  sewerGeyser: 'rapidGeyser', roar: 'rapidRoar', tailSwipe: 'quickTail',
  debrisToss: 'rapidToss', realityShard: 'rapidShard', tesseractBeam: 'rapidFold',
}
// Same problem for per-cast COUNTS: nearly every one folds through WEAPON_STAT_MODS, but the star's
// multishot is read straight off run.weaponMods at its fire site. Without this the readout would
// tell a player firing four bullets that they fire one.
export const WEAPON_COUNT_MODS = { star: 'multishot' }

export const MOD_POOL_MAX = 6
// Per-weapon fairness for the level-up mod pool (v4.4): a single weapon contributes at most this
// many of its eligible mods (randomly chosen) to the candidate list per level-up. Star is the
// STARTING weapon and the only one owned early, so without this its 6 mods flooded every pool —
// ~32% of ALL early cards were star mods and ~70% of level-ups offered at least one, making
// "just take another star mod" a no-brainer. Capping per-weapon candidates cuts that flood and
// keeps the pool fair once several weapons are owned (no single one dominates).
export const MOD_CANDIDATES_PER_WEAPON = 2
// Belt-and-braces with the candidate cap: at most this many mod cards from the SAME weapon may
// land in one level-up pool, so a roll can never hand a player an all-one-weapon screen.
// v6.7 (Track B): now slot-aware. A flat 2 starved nothing at 4 slots but flooded at 2 — with
// only the starter owned every mod card is a star mod, so the cap alone decides the share:
// 25.4% measured at 1 against 30.0% at 2 (testStarBalance run P.1 asserts on it). A flat 1 does
// the reverse: the mod bucket measured absent from 15.5% of rolls in beyond at 4 slots, which is
// a bucket that cannot pay its declared 30%.
export const maxModsPerWeaponPerPool = (slots) => (slots >= 4 ? 2 : 1)

// Twin Ring (orbit): inner ring radius, as a fraction of the main ring's radius.
export const ORBIT_TWIN_RING_RADIUS_FRAC = 0.6

// Echo Wave (wave): echo cadence/damage (full radius/knockback, only damage is scaled).
export const WAVE_ECHO_DELAY = 0.25   // s, delay between an Echo Wave cast and the next
export const WAVE_ECHO_DMG_FRAC = 0.6 // each echo's damage, as a fraction of the original cast's

// Cluster Bombs (mines): bomblet shape/scatter when a (non-bomblet) mine pops.
export const MINE_CLUSTER_DMG_FRAC = 0.4    // bomblet damage, as a fraction of the popped mine's
export const MINE_CLUSTER_RADIUS_FRAC = 0.6 // bomblet blast radius, as a fraction of the popped mine's
export const MINE_CLUSTER_ARM = 0.15        // s, bomblet arm time before it can trigger (short fuse)
export const MINE_CLUSTER_SCATTER_MIN = 60  // px, min scatter distance from the popped mine
export const MINE_CLUSTER_SCATTER_MAX = 120 // px, max scatter distance from the popped mine

// v6.4 pond identity: every enemy caught in a mine's blast is briefly stunned, on top of whatever
// the Cluster Bombs/Magnetic Mines mods above do — unconditional (not mod-gated), read by
// detonateMine (sim.js).
export const MINE_STUN = 0.3 // s, stunT applied to every non-ghosted enemy in a mine's blast radius

// Singularity (black hole): extra vortex radius/coreRadius/pull, as a fraction of the main cast's.
export const HOLE_SINGULARITY_FRAC = 0.55

// Split: shard damage/angle shape (picks-per-shard count lives on WEAPON_MODS.star.split above).
// v4.4: 0.5 -> 0.4. Split/chain/ricochet all multiply a star's total hits, so their per-shard/
// per-jump damage fractions compound multiplicatively when stacked together (a heavily-invested
// star hit ~9.5x its own pierce/blast baseline — the runaway that made pouring picks into star a
// no-brainer). Trimming these fractions shaves that stacked tail while barely touching a 1-pick
// dip, so star stays a strong, fun starter without spiralling past the AoE weapons.
export const STAR_SPLIT_DMG_FRAC = 0.4                    // shard damage, as a fraction of the star's own damage
export const STAR_SPLIT_BASE_ANGLE = (35 * Math.PI) / 180 // ± half-angle used for exactly 2 shards
export const STAR_SPLIT_MAX_SPREAD = (90 * Math.PI) / 180 // total fan spread once 3+ shards are out

// Chain: when a bullet's pierce is exhausted, it re-targets the nearest not-yet-hit enemy
// within range instead of dying (falls back to ricochet if none is found or no jumps remain).
export const STAR_CHAIN_RANGE = 200       // px, re-target search radius from the last hit enemy
export const STAR_CHAIN_DMG_MUL = 0.7     // damage multiplier applied per jump (v4.4: 0.8 -> 0.7, tames stacked compounding)
export const STAR_CHAIN_EXTRA_LIFE = 0.4  // s, minimum flight time granted on a chain jump

// Ricochet: once a spent bullet has no chain jumps left, it bounces off in a random new
// direction (deflected 60-120° from its incoming heading) instead of dying.
export const STAR_RICOCHET_DMG_MUL = 0.6                      // damage multiplier applied per bounce (v4.4: 0.7 -> 0.6, tames stacked compounding)
export const STAR_RICOCHET_ANGLE_MIN = (60 * Math.PI) / 180   // min deflection from incoming heading
export const STAR_RICOCHET_ANGLE_MAX = (120 * Math.PI) / 180  // max deflection from incoming heading
export const STAR_RICOCHET_EXTRA_LIFE = 0.4                   // s, minimum flight time granted on a bounce

// ---- v4.3 "crazy-mod pass" tuning (13 new behavioral mods, one set per weapon below) --------

// Supernova Sparks (orbit): splash radius around an orb-killed enemy.
export const ORBIT_NOVA_RADIUS = 85 // px

// Chemotaxis (wave.undertow): each stack widens the loot-reel burst by +50% of the nova's radius.
export const UNDERTOW_VAC_RADIUS_PER_STACK = 0.5

// Tsunami (wave): cast cadence for a "monster wave" (radius/damage both multiplied).
export const TSUNAMI_EVERY = 3 // every 3rd wave cast

// Seeker Blades (boomerang): outbound curve-toward-target turn rate at bonus=1.
export const SEEKER_TURN_RATE = 2.5 // rad/s

// Magnetic Mines: armed-mine crawl speed toward the nearest enemy at bonus=1.
export const MINE_CRAWL_SPEED = 55 // px/s

// Popping Wisps (homing): death-pop splash radius (hit-with-no-pierce-left OR lifetime expiry).
export const WISP_NOVA_RADIUS = 70 // px

// Swarm (homing): mini-wisps spawned on a (non-mini) wisp kill.
export const SWARM_DMG_FRAC = 0.5 // mini-wisp damage, as a fraction of the source wisp's
export const SWARM_LIFE = 1.2     // s, mini-wisp lifetime

// Big Crunch (black hole): collapse-detonation damage multiplier on top of the hole's own tick dmg.
export const CRUNCH_DMG_MUL = 10

// ---- Pond weapons (v5.0 task 4: Flagella Whip + Toxin Bloom) --------------------------------
// Flagella Whip (pond starter, melee arc sweep — see WEAPONS.flagella above and stepFlagellaWeapon
// in sim.js): a swing damages every enemy whose CENTER falls in the sector (arc rad, range px)
// centered on the player's facing. cyclone (behavioral): every FLAGELLA_CYCLONE_EVERY-th swing
// opens to a full 360° instead of the arc.
export const FLAGELLA_CYCLONE_EVERY = 3
// barbed (behavioral): a struck enemy bleeds a DoT whose TOTAL = the hit's dealt damage ×
// BARBED_DMG_MUL × (accumulated barbed bonus), spread over BARBED_DURATION seconds and ticked
// dot-flagged every STATUS_TICK (like ignite). Reapplying refreshes (replaces) it. One normal
// pick (bonus 0.5) bleeds ~1.5× the hit; investment/rarity ramps it toward the 3× headline.
export const BARBED_DMG_MUL = 3
export const BARBED_DURATION = 3

// Toxin Bloom (rare AoE zoner — see WEAPONS.bloom above and stepBloomWeapon/stepBlooms in sim.js):
// a planted cloud (run.blooms, see state.js) grows 0 -> maxR over dur × BLOOM_GROW_FRAC, then holds
// maxR, ticking dot-flagged damage every BLOOM_TICK to enemies inside until t reaches dur.
export const BLOOM_GROW_FRAC = 0.35
export const BLOOM_TICK = 0.5
// sporeburst (behavioral): a foe killed by a (non-mini) cloud's own tick emits a mini-cloud at
// SPOREBURST_FRAC of the parent's maxR (same dur/dmgPerTick), flagged `_mini` so it never chains.
export const SPOREBURST_FRAC = 0.35

// v6.4 pond identity: augments read by stepBlooms (sim.js). BLOOM_SLOW removes a speed fraction
// from any enemy standing inside a cloud (folded into stepEnemyMovement's slowMul); BLOOM_SLOW_T
// is the refresh window set every frame an enemy is inside, then decays like fearT/stunT/enrageT
// once it leaves. TIDE_DMG_BONUS is tideCarried's (WEAPON_MODS.bloom) per-pick tick damage bonus,
// on top of the drift along currentForce it also grants.
export const BLOOM_SLOW = 0.35     // speed fraction removed while standing in a cloud
export const BLOOM_SLOW_T = 0.15   // s, bloomSlowT refresh window
export const TIDE_DMG_BONUS = 0.35 // tideCarried: tick damage bonus per pick

// ---- Garden weapons (v5.3: Stinger + Pheromone Lure; Leaf Blade = boomerang re-theme) --------
// Stinger (garden native, needle-cone — see WEAPONS.stinger + stepStingerWeapon in sim.js): each
// needle is a run.bullets projectile tagged weapon:'stinger' so stepBullets can apply stinger-only
// behaviour (venomTips) without touching star's split/chain/ricochet (disabled per-needle).
export const STINGER_R = 7            // px, needle hit radius (added to enemy radius)
export const STINGER_HIVE_EVERY = 4   // hive (behavioral): every Nth volley fires in all directions
// Pheromone Lure (garden native, taunt decoy + burst — see WEAPONS.lure + stepLureWeapon/stepLures
// in sim.js). stickyScent (behavioral) drops a slow zone into run.webs on burst:
export const LURE_STICKY_R = 80       // px, stickyScent slow-zone radius
export const LURE_STICKY_DUR = 2      // s, stickyScent slow-zone lifetime

// ---- Undergrowth weapons (v5.5: Claw Rake + Quill Burst + Chitter Shriek) --------------------
// Claw Rake (undergrowth starter — see WEAPONS.clawRake + stepClawRake in sim.js): a plain sector
// rake at the nearest enemy, on flagella's geometry. It does NOT move the player, and must not.
//
// v5.5 — this weapon USED to be "Pounce Claws": the cast dashed the player onto the nearest foe and
// raked on landing. It is gone, and nothing like it should come back as an AUTO-cast. Two reasons,
// the second decisive:
//   1. It fed the player into contact damage. The dash landed you ON a foe and the player is not
//      invulnerable during it; post-hit invuln (0.75s) was SHORTER than the cast interval (0.95s),
//      so the starter reliably damaged its own owner once per cast.
//   2. It stole movement agency. Moving is the ONLY input this game has. An auto-cast on a timer
//      that yanks the player toward the swarm takes the game away from them at an interval they
//      never chose. I-frames would have fixed (1) and not touched (2) — the concept is simply wrong
//      for an auto-attack game. A dash belongs on a button the player presses, and there is no
//      button. Note the enemy 'pounce' below is the SAME verb done right: the CAT leaps, telegraphs
//      it, and the player dodges — that reads as a predator because the player still gets to answer.
// If you are here to re-add a dash, re-read (2) first.
// v6.6.28 (owner: "base claw crit chance +10%"). Added to the player's crit CHANCE for rake hits
// only, as PERCENTAGE POINTS, not as a relative scaling: PLAYER.baseCritChance is 0.05, so a
// +10% RELATIVE reading would be 0.05 -> 0.055 and would be indistinguishable from noise on any
// number of runs a person could play. Read as points, a rake rolls at 15% while every other source
// in the same build rolls at 5% — a real identity ("the claws find the soft spot") rather than a
// rounding error. It is ADDITIVE with the shop's Lucky Eye and the critChance passive for the same
// reason every other crit source is: crit chance is one probability, and multiplying independent
// sources of it is how a 5% roll silently becomes a 40% one. Crit DAMAGE is untouched.
export const CLAW_BASE_CRIT = 0.10
export const CLAW_DOUBLE_EVERY = 3       // doubleSlash (behavioral): every Nth rake slashes a second time
export const CLAW_DOUBLE_DELAY = 0.12    // s between the first slash and its follow-up (reads as one flurry)
export const CLAW_DOUBLE_DMG_FRAC = 0.7  // follow-up slash's damage, as a fraction of the first's
// bleedClaws (behavioral) reuses flagella's barbed bleed verbatim (applyBleed / BARBED_DMG_MUL /
// BARBED_DURATION above) — same DoT, re-themed as claw wounds. No constants of its own.

// ambushPredator (v6.5, behavioral — see slashClaws in sim.js): a conditional damage buff, counting
// an armed OR sprung trap within AMBUSH_R of the PLAYER (not the target) — springing your own trap
// must not switch the buff off, or baiting one anti-synergizes with the mod that's supposed to
// reward standing near the field. v6.5 panel math: at streamed density the armed-or-sprung ambient
// uptime near a random trap is ~39%, but a player who deliberately lurks near the field sees ~60% —
// that gap is what lets a conditional 0.45 beat rend's unconditional 0.35 (rend's 3rd-stack
// marginal value is lower than a well-played ambush stack's).
export const AMBUSH_R = 200 // px, player-to-trap radius that keeps ambushPredator's buff live

// Quill Burst (undergrowth — see WEAPONS.quillBurst + stepQuillWeapon in sim.js): each quill is a
// run.bullets projectile tagged weapon:'quill' so stepBullets applies quill-only behaviour without
// touching star's split/chain/ricochet (all disabled per-quill, exactly like stinger's needles).
export const QUILL_R = 8              // px, quill hit radius (added to enemy radius)
// retaliate (behavioral): a burst also fires the instant the player TAKES contact/zone damage
// (hurtPlayer), free of the weapon timer, at most once per QUILL_RETALIATE_CD seconds. Each pick
// (flat) adds another quill to the retaliation burst on top of the level's `count`.
export const QUILL_RETALIATE_CD = 1.2
// reboundQuills (v6.6.28, behavioral — see the `b.life <= 0` branch of stepBullets): a quill that
// runs out of flight REVERSES instead of expiring, sweeping back in through everything the
// outbound ring already passed. Each rebound refunds the quill's pierce budget and clears its
// hitIds, so the return pass hits afresh — that refund is the whole card, and it is why the tier
// bonus (number of return trips) is bounded by WEAPON_MOD_TIER_BONUS rather than being a pct.
// Damage decays per trip: a ring that came back three times at full strength would out-damage
// every other quill mod combined, and the decay is also what stops a stationary player from
// parking inside a permanent quill blender.
export const QUILL_REBOUND_DMG_MUL = 0.7   // damage multiplier applied per return trip
export const QUILL_REBOUND_SPEED_MUL = 0.85 // the return sweep is slower — it reads as a recoil, not a re-fire

// Chitter Shriek (undergrowth utility — see WEAPONS.chitterShriek + stepShriekWeapon in sim.js): a
// run.novas ring carrying an extra `fear` field (s). Enemies the ring hits get e.fearT = fear and
// flee: while e.fearT > 0, stepEnemyMovement INVERTS the seek direction (they run from the player)
// at FEAR_SPEED_MUL of their own speed and never deal contact damage. Ticks down every frame.
export const FEAR_SPEED_MUL = 1.25    // fleeing enemies scatter a bit faster than they chase
export const SHRIEK_ECHO_DELAY = 0.22 // s between an echoShriek cast and the next (cf. WAVE_ECHO_DELAY)
export const SHRIEK_ECHO_DMG_FRAC = 0.6 // each echo's damage/fear, as a fraction of the original cast's
// panicRout (behavioral): a FLEEING enemy (fearT > 0) takes (1 + bonus) × damage from EVERY source
// (applied in dealDamage, alongside the venom amp). No constant — the bonus is the whole knob.
// chitterSpines (v6.6.28, behavioral — see stepShriekWeapon): the cast also spits <tier bonus>
// quills evenly around the circle, tagged weapon:'quill' like every other quill in the game. They
// are fired from the SHRIEK's stats, never quillBurst's, so the card is not dead without quillBurst
// owned and does not silently inherit quillBurst's mods. They carry NO fear — the ring is the
// shriek's reach, not a second rout (see the WEAPON_MODS.chitterShriek block for why).
export const SHRIEK_SPINE_DMG_FRAC = 0.8   // spine damage, as a fraction of the shriek's own
export const SHRIEK_SPINE_SPEED = 500      // px/s
export const SHRIEK_SPINE_RANGE_MUL = 1.6  // flight distance, as a multiple of the shriek's radius
// Spine COUNT per cast is the mod's own banked bonus — see `perTier: 4` on chitterSpines above and
// the note in makeWeaponModCard. It is not a constant here on purpose: a second copy of the number
// at the fire site is exactly how a card ends up promising +1 and delivering 4.

// ---- City weapons (v5.4: Trash Tornado + Sewer Geyser; Neon Beam = the rainbow re-theme) -------
// Trash Tornado (city — see WEAPONS.trashTornado + stepTornadoWeapon in sim.js): chunks are evenly
// spaced on a ring around the player, sim rewrites run.debris ({x, y, r}) every frame (same
// contract as run.orbs), and each chunk damages enemies it overlaps every `tick` s (per-chunk,
// per-enemy cooldown — same bookkeeping orbit uses).
export const DEBRIS_R = 14            // px, base chunk hit radius (cf. ORB_R)
// flingDebris (behavioral): every TORNADO_FLING_EVERY seconds the tornado hurls <tier bonus> chunks
// straight outward as run.bullets tagged weapon:'trash', at TORNADO_FLING_DMG_FRAC of chunk damage.
export const TORNADO_FLING_EVERY = 1.5
export const TORNADO_FLING_DMG_FRAC = 0.8
export const TORNADO_FLING_SPEED = 430 // px/s
export const TORNADO_FLING_RANGE = 260 // px before a flung chunk expires (life = range/speed)
// suction (behavioral): enemies within TORNADO_SUCTION_RANGE of the player are dragged inward at
// TORNADO_SUCTION_PULL × bonus px/s (elites/tanks resist — capped at TORNADO_SUCTION_RESIST of it,
// mirroring HOLE_RESIST_CAP so the tornado can't trivially hold a tank).
export const TORNADO_SUCTION_RANGE = 220
export const TORNADO_SUCTION_PULL = 120
export const TORNADO_SUCTION_RESIST = 0.5

// Sewer Geyser (city utility — see WEAPONS.sewerGeyser + stepGeyserWeapon/stepGeysers in sim.js).
// run.geysers entries: { x, y, r, fuse, dur, dmg, _chained? } — fuse counts down (harmless
// telegraph; dur is its starting value so render can grow a warning ring from fuse/dur), then the
// geyser erupts ONCE (damaging ENEMIES only, never the player), emits {type:'explode', x, y,
// radius:r}, and is removed. _chained marks a chainGeyser follow-up so it never chains further.
export const GEYSER_LAUNCH_KB = 260   // launch (behavioral): knockback applied to caught enemies
export const GEYSER_STUN = 0.6        // launch: stun seconds × bonus (e.stunT — no seek, no contact damage)
export const GEYSER_CHAIN_FRAC = 0.6  // chainGeyser: follow-up radius/damage, as a fraction of the parent's
export const GEYSER_CHAIN_FUSE = 0.35 // s, follow-up telegraph (shorter than the parent's)
export const GEYSER_CHAIN_SCATTER_MIN = 70  // px, min scatter from the parent eruption
export const GEYSER_CHAIN_SCATTER_MAX = 150 // px, max scatter from the parent eruption

// ---- Skies weapons (v5.4: Roar + Tail Swipe + Debris Toss) ------------------------------------
// Roar (skies starter — see WEAPONS.roar + stepRoarWeapon in sim.js): the same sector test
// flagella/clawRake use, plus a radial shove away from the player.
export const ROAR_STUN = 0.5              // stagger (behavioral): stun seconds × bonus on roared foes (e.stunT)
export const ROAR_RESONANCE_EVERY = 3     // resonance (behavioral): every Nth roar opens to a full 360° (cf. FLAGELLA_CYCLONE_EVERY)

// Tail Swipe (skies — see WEAPONS.tailSwipe + stepTailWeapon in sim.js).
// wreckingTail (behavioral): a struck enemy is knocked back as usual, and where it ENDS UP it
// deals TAIL_COLLIDE_FRAC × bonus × the swipe's dealt damage to every OTHER enemy within
// TAIL_COLLIDE_R of it (resolved once per swipe, after all knockbacks are applied; collateral
// never re-triggers collateral).
export const TAIL_COLLIDE_R = 60
export const TAIL_COLLIDE_FRAC = 0.5
export const TAIL_COUNTER_CD = 1.5        // counterSwipe (behavioral): free swipe on taking damage, at most every N s (cf. QUILL_RETALIATE_CD)

// Debris Toss (skies utility — see WEAPONS.debrisToss + stepDebrisWeapon/stepLobs in sim.js).
// run.lobs entries: { x, y, fromX, fromY, tx, ty, t, flight, r, dmg } — t counts UP from 0 to
// flight; the chunk's drawn position lerps (fromX,fromY)->(tx,ty) with a render-side parabolic
// hop (sim only needs t/flight). On landing it bursts ONCE for dmg in r, damaging ENEMIES only
// (never the player), emits {type:'explode', x:tx, y:ty, radius:r}, and is removed. A lob is a
// projectile for gravity-well purposes (beyond bends it) but it is NOT a run.bullets entry.
export const LOB_SHRAPNEL_DMG_FRAC = 0.4   // shrapnel (behavioral): splinter damage, as a fraction of the impact's
export const LOB_SHRAPNEL_SPEED = 420      // px/s, splinters fly radially from the impact
export const LOB_SHRAPNEL_RANGE = 200      // px before a splinter expires (life = range/speed)
export const LOB_SHRAPNEL_R = 7            // px, splinter hit radius (run.bullets tagged weapon:'debris')

// ---- Beyond weapons (v5.4: Reality Shard + Tesseract Beam; Black-Hole Vortex = the hole) -------
// Reality Shard (beyond starter — see WEAPONS.realityShard + stepShardWeapon in sim.js): a
// run.bullets projectile tagged weapon:'shard' carrying _blinkCd (s until its next blink). A blink
// jumps it blinkDist px along its CURRENT heading (post gravity-well curvature) without consuming
// life, and without sweeping the gap (nothing in between is hit — that's the point).
export const SHARD_R = 9                   // px, shard hit radius (added to enemy radius)
// riftScar (behavioral): each blink leaves a rift at the shard's DEPARTURE point that detonates
// after SHARD_RIFT_FUSE for SHARD_RIFT_FRAC × bonus × the shard's damage in SHARD_RIFT_R. Rifts
// reuse run.geysers (same "telegraph then erupt, enemies only" contract) with _chained: true set
// so chainGeyser — a sewerGeyser mod — can never fire off them.
export const SHARD_RIFT_FUSE = 0.30
export const SHARD_RIFT_R = 55
export const SHARD_RIFT_FRAC = 0.8
// recursion (behavioral): when a shard's life expires (NOT when its pierce is spent) it forks into
// <tier bonus> new shards in random directions at SHARD_RECURSE_DMG_FRAC damage and
// SHARD_RECURSE_LIFE_FRAC life, flagged `_fork` so a fork never re-forks.
export const SHARD_RECURSE_DMG_FRAC = 0.5
export const SHARD_RECURSE_LIFE_FRAC = 0.6

// Tesseract Beam (beyond — see WEAPONS.tesseractBeam + stepTesseractWeapon in sim.js): a run.beams
// entry with `folded: true`. A folded beam sweeps `arms` arms evenly around the circle (2 by
// default = the fold, 180° apart; hyperfold adds more, so 3 arms = 120°, 4 = 90°, ...) — the same
// geometry rainbow.prismatic uses, but baked into ONE beam entity rather than several, so
// collapse can resolve the whole fold at once.
export const TESSERACT_ARMS = 2            // arms on a plain (unmodded) fold
// v5.22 FAN MODE (lane chapters only — gated on CHAPTERS[chapter].lane).
// The fold rakes a full 360 degrees, which is right when you can walk in any direction and wrong
// when you cannot. In the lane the player advances up a corridor and every threat is AHEAD, so a
// rotating rake spends most of its duty cycle pointed at empty space behind — and because the cast
// angle came from `nearestEnemy`, it would happily lock onto something that had already gone past.
// In fan mode the arms spread across a forward ARC instead of a circle and sweep back and forth
// across it, so no arm ever points backwards and the cast angle stops depending on target choice.
// THE CONSTRAINT: TESSERACT_FAN_ARC / 2 + TESSERACT_FAN_SWEEP must stay under PI/2, or the outer
// arm swings past the horizontal at the ends of the wiper stroke and points behind the player
// again — which is the entire bug this mode exists to fix. 0.31pi + 0.16pi = 0.47pi, with margin.
// A test pins this (run ZR.e): it walks a whole cast and asserts no arm ever has a rearward
// component, and it caught exactly this when the arc was first set to 0.78pi.
export const TESSERACT_FAN_ARC = Math.PI * 0.62   // ~112deg of forward cover the arms spread across
export const TESSERACT_FAN_SWEEP = Math.PI * 0.16 // +/- this much of wiper motion on top
export const TESSERACT_FAN_RATE = 2.2             // rad/s of that sweep
// collapse (behavioral): when a folded beam expires, everything currently inside ANY of its arms
// is yanked toward the player at TESSERACT_COLLAPSE_PULL px/s and takes TESSERACT_COLLAPSE_MUL ×
// (1 + bonus) × the beam's per-tick damage, plus an {type:'explode'} at the player.
export const TESSERACT_COLLAPSE_MUL = 8
export const TESSERACT_COLLAPSE_PULL = 400

// ---- Elements (PoE2/Warframe-style elemental status + combos) ---------------------
// Offered always (not gated behind a weapon), rolls a rarity like passives: applied
// potency = base * RARITIES[rarity].mult, added per pick. run.elements[id] accumulates
// potency; run.elementPicks[id] counts picks (max MAX_ELEMENT_PICKS). desc is the tail of the
// level-up card description (a short combo hint) — makeElementCard prefixes the rolled potency.
export const ELEMENTS = {
  fire: {
    name: 'Fire Infusion', icon: '🔥', base: 1,
    desc: 'Ignites enemies for burn damage over time. Combo: shatters chilled foes, detonates with ⚡.',
  },
  cold: {
    name: 'Cold Infusion', icon: '❄️', base: 1,
    desc: 'Chills and freezes enemies. Combo: shatters with 🔥, chilling arcs with ⚡.',
  },
  lightning: {
    name: 'Lightning Infusion', icon: '⚡', base: 1,
    desc: 'Shocks arc damage to nearby foes. Combo: detonates 🔥 ignites, spreads ❄️ chill, copies ☠️ venom.',
  },
  venom: {
    name: 'Venom Infusion', icon: '☠️', base: 1,
    desc: 'Stacking poison that amplifies all damage taken. Combo: doubled amp on ❄️, faster burn with 🔥.',
  },
}
export const MAX_ELEMENT_PICKS = 5
// v6.7 (Track B): ELEMENT_CARD_WEIGHT is GONE. It was a per-id pre-filter that let an eligible
// element join a pool only 25% of the time; with four elements, all four were dropped on
// 0.75^4 = 31.6% of pools, so an 18% element bucket would only have delivered ~12%.
// BUCKET_WEIGHTS.element is now the one and only element-frequency knob (MUTATORS.unstable's
// elementWeightMul multiplies it — see rollCard in sim.js).

// ---- Difficulty (classic runs; picked on the title screen, saved in meta) -----------
// Level 1 = the base game. Each level above 1 adds one RANDOM mutator to the run AND stacks
// +DIFFICULTY_HP_PER_LEVEL enemy HP and +DIFFICULTY_DMG_PER_LEVEL enemy damage (multiplied into
// run.mods.enemyHpMul/enemyDmgMul on top of whatever the mutators themselves do). The Daily
// Anomaly ignores this (fixed shared seed).
export const MAX_DIFFICULTY = 5
// Winning a classic run at this difficulty (or higher) unlocks the next chapter — used by
// endRun (main.js) at victory time AND by loadMeta (state.js) retroactively, since a chapter
// can ship AFTER a player already earned its unlock (their win is encoded in the previous
// chapter's maxDifficulty ladder: winning level d sets it to d+1).
export const CHAPTER_UNLOCK_DIFFICULTY = 3
export const DIFFICULTY_HP_PER_LEVEL = 0.25
export const difficultyHpMul = (d) => 1 + DIFFICULTY_HP_PER_LEVEL * (Math.max(1, d) - 1)
// HP-only difficulty made runs longer, not more dangerous — the damage tax is what makes flat
// armor decay on the ladder (v6.3.4 anti-turtle).
export const DIFFICULTY_DMG_PER_LEVEL = 0.15
export const difficultyDmgMul = (d) => 1 + DIFFICULTY_DMG_PER_LEVEL * (Math.max(1, d) - 1)
// The payout matching the tax: +25% coins per level above 1 (multiplied into
// run.mods.coinMul, and applied to the end-of-run kill bonus in main.js).
export const DIFFICULTY_COIN_PER_LEVEL = 0.25
export const difficultyCoinMul = (d) => 1 + DIFFICULTY_COIN_PER_LEVEL * (Math.max(1, d) - 1)
// v6.4.1/v6.4.3 (owner directives): difficulty 1 of the onboarding chapters spawns thinner but
// pays more xp per kill, per chapter — body (level 1-1) is the gentlest. Applied in createRun
// (state.js) ONLY when the caller passes difficulty 1 EXPLICITLY (main.js's classic ladder always
// does): daily runs and tests omit opts.difficulty, so they keep baseline density on purpose.
export const EARLY_CALM = {
  body:   { spawnMul: 0.40, xpMul: 2.22 }, // v6.4.3: 0.6·0.67 / 1.67·1.33 — another -33% / +33%
  pond:   { spawnMul: 0.6,  xpMul: 1.67 },
  garden: { spawnMul: 0.6,  xpMul: 1.67 },
}
// count distinct random mutator ids (Fisher-Yates over the full pool)
// The roll pool for a given chapter: hidden entries never roll; `chapters` (allowlist) and
// `exclude` (denylist) scope an anomaly to where its mechanic actually exists. With no
// chapterId, every scoped entry is out — a caller that doesn't say where it is gets only the
// universally-valid pool.
const mutatorPool = (chapterId) => Object.keys(MUTATORS).filter((id) => {
  const m = MUTATORS[id]
  if (m.hidden) return false
  if (m.chapters && !m.chapters.includes(chapterId)) return false
  if (m.exclude && m.exclude.includes(chapterId)) return false
  return true
})

export const randomMutators = (count, chapterId) => {
  const pool = mutatorPool(chapterId)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = pool[i]
    pool[i] = pool[j]
    pool[j] = t
  }
  return pool.slice(0, Math.max(0, Math.min(count, pool.length)))
}

// v6.6.19: the briefing's paid reroll replaces ONE anomaly by index, not the whole set. Rerolling
// everything was strictly worse than backing out to the title and pressing Play again — that
// re-rolls the whole set for free — so the coins bought nothing a quit couldn't. Targeting a single
// slot is the thing quitting CANNOT do, which is what makes it worth paying for.
// The replacement is drawn from the chapter pool minus EVERY id already staged, the replaced one
// included: paying and being handed back the same anomaly is the one outcome that reads as theft.
// Returns a NEW array, or null when the pool has nothing left to offer so the caller can decline to
// charge. (Unreachable today — the smallest chapter pool is 8 against 4 staged at MAX_DIFFICULTY.)
export const rerollMutator = (ids, index, chapterId) => {
  // Number.isInteger, not `index >= 0`: null >= 0 is TRUE in JS, so a null index would sail past a
  // bare comparison and land as next[null] — a property on the array, silently charging for nothing.
  if (!Array.isArray(ids) || !Number.isInteger(index) || index < 0 || index >= ids.length) return null
  const taken = new Set(ids)
  const pool = mutatorPool(chapterId).filter((id) => !taken.has(id))
  if (pool.length === 0) return null
  const next = ids.slice()
  next[index] = pool[Math.floor(Math.random() * pool.length)]
  return next
}

// ---- Build-focus nudge -------------------------------------------------------
// The more level-up picks a player invests in their arsenal (weapon upgrades + weapon
// mods), the rarer NEW-weapon cards get: each unowned weapon only joins a level-up's
// candidate pool with probability NEW_WEAPON_FADE^invested (floored). A fresh run is
// unchanged (p=1); a committed build stops getting nagged with weapons it doesn't want.
export const NEW_WEAPON_FADE = 0.85
export const NEW_WEAPON_FADE_MIN = 0.1
export const newWeaponChance = (invested) => Math.max(NEW_WEAPON_FADE_MIN, Math.pow(NEW_WEAPON_FADE, invested))
// Hard apparition floor (v4.6): if a level-up's 3 cards ended up with no New! weapon card
// (and the player can still equip one), this is the chance the last card gets swapped for a
// random unowned weapon — guarantees new weapons appear on at least ~5% of level-ups no
// matter how deep the focus-nudge fade goes. The pick is UNIFORM over unowned weapons: this is
// the discovery guarantee, not the rarity table, and it is measurably the dominant acquisition
// channel for a chapter's rare weapon (47-86% of `hole`'s offers in beyond — see WEAPON_UP_WEIGHT
// above). Do not read "rarity gates acquisition" as describing this line.
export const NEW_WEAPON_MIN_RATE = 0.05

// Shared DoT tick period for ignite/venom (finer than 3s duration so damage reads smoothly
// without spamming a 'hit' event every single simulation frame).
export const STATUS_TICK = 0.25

// Ignite (fire): a hit deals (IGNITE_DOT_FRAC * potency) of its OWN dealt damage as a DoT
// spread over IGNITE_DURATION seconds. Reapplying refreshes (replaces) duration + DPS.
export const IGNITE_DOT_FRAC = 0.35
export const IGNITE_DURATION = 3

// Chill (cold): slow = min(CHILL_SLOW_CAP, CHILL_SLOW_BASE + CHILL_SLOW_PER_POTENCY * potency)
// for CHILL_DURATION seconds. CHILL_STACK_TO_FREEZE chilling hits landing within an
// still-active chill window freeze the enemy (full stop) for FREEZE_DURATION, followed by
// FREEZE_IMMUNITY seconds where chill still slows but can't build back toward a freeze
// (prevents a perma-freeze lock). Elites/type 'tank' never freeze; the freeze converts into
// a stronger slow instead (chillSlow multiplied by ELITE_FREEZE_SLOW_MUL, capped at 100%).
export const CHILL_SLOW_BASE = 0.30
export const CHILL_SLOW_PER_POTENCY = 0.06
export const CHILL_SLOW_CAP = 0.70
export const CHILL_DURATION = 2
export const CHILL_STACK_TO_FREEZE = 3
export const FREEZE_DURATION = 0.9
export const FREEZE_IMMUNITY = 3
export const ELITE_FREEZE_SLOW_MUL = 1.6

// Shock (lightning): a hit arcs (SHOCK_ARC_FRAC * potency) of its own dealt damage to exactly
// run.elementPicks.lightning nearest OTHER enemies within SHOCK_RANGE of the hit enemy — one
// arc target per lightning pick (not per potency point). SHOCK_CD is a per-source-enemy
// internal cooldown so continuous weapons (orbit, beam) don't spam arcs every tick.
export const SHOCK_ARC_FRAC = 0.30
export const SHOCK_RANGE = 140
export const SHOCK_CD = 0.3

// Venom: each hit adds a stack (max VENOM_MAX_STACKS), refreshing duration to VENOM_DURATION.
// Per-second DoT = VENOM_DOT_PER_STACK * potency * stacks. Damage amp = VENOM_AMP_PER_STACK
// per stack, applied to ALL damage the enemy takes (see COMBOS.brittleAmpMul for chilled foes).
export const VENOM_MAX_STACKS = 8
export const VENOM_DURATION = 4
export const VENOM_DOT_PER_STACK = 1.5
export const VENOM_AMP_PER_STACK = 0.02

// ---- Combos (element x element reactions) ------------------------------------------
// comboCd: per-enemy, per-combo internal cooldown so ticking weapons can't machine-gun
// the same reaction every frame.
export const COMBOS = {
  shatterMul: 1.2, shatterRadius: 90,     // fire+cold Shatter
  overloadRadius: 80,                     // fire+lightning Overload
  acidBurnTickMul: 1.5,                   // fire+venom Acid Burn (both DoTs tick faster)
  brittleAmpMul: 2,                       // cold+venom Brittle (venom amp doubled on chilled foes)
  comboCd: 0.5,
}

// ---- Enemies -----------------------------------------------------------------
export const ENEMIES = {
  drone: { hp: 20, speed: 90,  dmg: 8,  radius: 16, xp: 1, coinChance: 0.10 },
  wisp:  { hp: 10, speed: 165, dmg: 5,  radius: 12, xp: 1, coinChance: 0.08 },
  tank:  { hp: 90, speed: 55,  dmg: 15, radius: 26, xp: 4, coinChance: 0.35 },
}
export const ELITE = { hpMul: 5, sizeMul: 1.5, dmgMul: 1.5, coins: 8, xpMul: 4 }

// Time-bracket spawn composition: [from-second, {type: weight}]
export const WAVE_TABLE = [
  [0,   { drone: 1 }],
  [40,  { drone: 3, wisp: 1 }],
  [90,  { drone: 3, wisp: 2 }],
  [140, { drone: 3, wisp: 2, tank: 1 }],
  [200, { drone: 2, wisp: 3, tank: 2 }],
  [240, { drone: 1, wisp: 5, tank: 3 }], // final-minute frenzy: fastest type (wisp) dominates
  [260, { drone: 1, wisp: 6, tank: 4 }],
]
// spawns/second: linear early (unchanged for t <= SPAWN_LATE_START, so the tuned early game
// doesn't shift), then an added quadratic term after that so the rate keeps accelerating all
// the way to RUN_DURATION instead of flattening out. rate(300) ≈ 19.9/s (~2.9x the old ~6.9/s).
export const SPAWN_RATE_BASE = 0.6
// v6.4.3 (owner directive: "the first enemies take too long to appear"): stepSpawning banks this
// many spawns into the accumulator once, on a run's first step, so the opening ring walks in
// immediately instead of trickling in after 1/(spawnRate(0)·spawnMul) seconds (~4s at body-calm).
// Skipped when mods.spawnMul is 0 — tests/probes that silence spawning stay perfectly quiet.
export const SPAWN_OPENING_CREDIT = 3
export const SPAWN_RATE_LINEAR = 0.021
export const SPAWN_LATE_START = 120     // s, when the late-game acceleration kicks in
export const SPAWN_LATE_QUAD = 0.0004   // extra t^2 coefficient beyond SPAWN_LATE_START
// v6.6.5 (owner directive: "have early monsters (<1min in) spawn a bit faster"): a multiplier on
// the rate that is largest at t=0 and DECAYS LINEARLY TO 1 exactly at SPAWN_EARLY_UNTIL, so the
// opening fills in faster without a step change at the one-minute mark — a flat boost that
// switched off at 60s would drop the rate ~25% mid-fight, which reads as the game losing
// interest. Separate from SPAWN_OPENING_CREDIT: that banks a few spawns on frame one so the ring
// is not empty, this shapes the whole first minute. It multiplies the CURVE, so a chapter eased
// by mods.spawnMul (body/pond) stays proportionally eased.
export const SPAWN_EARLY_BOOST = 0.35   // +35% at t=0, +17.5% at t=30, +0% from t=60
export const SPAWN_EARLY_UNTIL = 60     // s the boost tapers away over
export const spawnEarlyMul = (t) => (t >= SPAWN_EARLY_UNTIL ? 1 : 1 + SPAWN_EARLY_BOOST * (1 - t / SPAWN_EARLY_UNTIL))
export const spawnRate = (t) => {
  const base = SPAWN_RATE_BASE + t * SPAWN_RATE_LINEAR
  if (t <= SPAWN_LATE_START) return base * spawnEarlyMul(t)
  const late = t - SPAWN_LATE_START
  return base + SPAWN_LATE_QUAD * late * late
}
// enemy HP scales with time: unchanged for t <= HP_SCALE_LATE_START, then multiplied by a
// growing late-game factor so HP keeps climbing instead of leveling off (hpScale(300) ≈ 7.6x
// vs the old formula's flat 4.3x).
export const HP_SCALE_LATE_START = 150
export const HP_SCALE_LATE_RATE = 0.005
export const hpScale = (t) => {
  const base = 1 + t / 90
  if (t <= HP_SCALE_LATE_START) return base
  return base * (1 + HP_SCALE_LATE_RATE * (t - HP_SCALE_LATE_START))
}
// enemy contact damage scales with time too (v6.3.4 anti-turtle): linear ×2 at RUN_DURATION,
// deliberately milder than hpScale's late-quad — spawn rate already accelerates after 120s and a
// third accelerating curve would stack into a late wall. This is the anti-turtle fix itself: a
// stationary armor stack that floors every hit to 1 early is chipped through by t=300.
export const dmgScale = (t) => 1 + t / RUN_DURATION
export const MAX_ALIVE = 400
// v6.6.4 (owner directive): the onboarding chapters cap the on-screen swarm LOWER than the rest,
// via CHAPTERS[id].balance.maxAliveMul. Because the field saturates in the last third at every
// difficulty, this cap — not the spawn rate — is what sets the crowd a player actually looks at
// there; see the body's balance block for the measurement. The ladder (v6.6.7, owner directive
// "smooth out the chapter curve"), in CHAPTER_ORDER:
//   body 0.45 = 180   pond 0.60 = 240   garden 0.75 = 300   undergrowth onwards = 400
// The steps are even in RATIO, not in absolute count — +33% / +25% / +33% — which is the shape
// that reads as a smooth ramp, because a crowd 60 bigger matters far more at 180 than at 340. The
// pre-v6.6.7 ladder (180/320/360/400) was one cliff then two nudges: +78%, +13%, +11%.
// undergrowth is where the easing STOPS by design — it is a mid-game unlock, not onboarding — so
// the last step is a full-density step, not a fourth rung. This is a different knob
// from spawnMul: spawn RATE controls how fast enemies arrive, this controls how many may exist at
// once, i.e. the density you actually have to path through once the field saturates. Every
// MAX_ALIVE gate in sim.js goes through maxAliveFor so the two can never drift apart. The blank
// is unaffected — it has its own BLANK_MAX_ALIVE.
// This gates SPAWNING, it is not a hard ceiling: spawnSplitChildren pushes a dying enemy's clones
// unconditionally (a corpse's children have to appear), so a saturated field can sit a few over.
export const maxAliveFor = (mods) => Math.round(MAX_ALIVE * (mods?.maxAliveMul ?? 1))
// Elite cadence shrinks over the run: ELITE_EVERY_START seconds between elites at t=0,
// linearly down to ELITE_EVERY_END by RUN_DURATION (so multiple elites can be alive at once
// late-run — intended).
export const ELITE_EVERY_START = 45  // seconds, first elite still at t=40 (see state.js _nextEliteAt)
export const ELITE_EVERY_END = 12
export const eliteEveryAt = (t) => {
  const frac = Math.min(1, Math.max(0, t / RUN_DURATION))
  return ELITE_EVERY_START + (ELITE_EVERY_END - ELITE_EVERY_START) * frac
}
export const SPAWN_RING = 60    // px beyond the larger half-screen diagonal
// ---- Anti-kite straggler recycling (v6.0.1) ----
// A committed runner outruns every chaser in the game forever (player 220 px/s vs a creeped wisp's
// ~190-237), sheds the whole horde behind and wins the survival clock without ever playing.
// Enemies left beyond KITE_DROP_MUL × the spawn distance behind a MOVING player are recycled onto
// the spawn ring inside KITE_AHEAD_ARC of the player's heading — running doesn't shed the horde,
// it relocates it in front of you (the Vampire Survivors contract). A standing fight (player speed
// under KITE_MIN_SPEED) never recycles anyone, so normal play is untouched.
export const KITE_DROP_MUL = 1.35     // × (viewRadius + SPAWN_RING); beyond this a chaser is a straggler
export const KITE_MIN_SPEED = 100     // px/s of player motion below which nothing recycles
export const KITE_AHEAD_ARC = Math.PI // rad centered on the heading where recycled enemies land
// Enemy speed creep: enemies spawned later fly faster (already-spawned ones are untouched —
// applied once at spawn time, not continuously).
export const SPEED_CREEP_START = 120     // s, creep begins after this
export const SPEED_CREEP_PER_SEC = 0.0004 // +0.04%/s of base speed
export const SPEED_CREEP_CAP = 0.25       // max +25% speed
export const speedCreepMul = (t) => 1 + Math.min(SPEED_CREEP_CAP, Math.max(0, t - SPEED_CREEP_START) * SPEED_CREEP_PER_SEC)
// Enemy separation (v6.5.1, owner directive: "enemies should not stack perfectly — in the boss
// level the larvae stack 50 on top of each other and you only see one. 80% stack, not 100%").
// Two enemies may overlap until their centers are closer than ENEMY_SEP_FRAC of their combined
// radii; 0 would be full body-blocking, which is NOT wanted, and 1 would be bodies just touching.
// Overlap = 1 - FRAC, so the owner's tune reads straight off this number: the directive's "80%
// stack" was 0.2, "like 60% overlap" set 0.4, and "like 35%" sets 0.65.
export const ENEMY_SEP_FRAC = 0.65
// Fraction of a pair's intrusion resolved per frame. 1 = snap the pair to minSep outright —
// stepObstacles' own idiom. A soft 0.5 was tried first and LOST to convergence pressure: enemies
// seeking the player's exact point close ~2.8px/frame while a half-resolve pushes ~1.2px/frame
// back out, so a blank probe knot equilibrated at sub-pixel spread and still read as one sprite
// (the very bug this exists to fix). Pair fixes can still contradict each other in a dense crowd,
// but per-frame moves are ≤ a few px, so the residual jitter is invisible at sprite scale.
export const ENEMY_SEP_RESOLVE = 1
// px, spatial-hash cell for stepEnemySeparation's pair search. A pair is only ever compared when
// it lands in the same or an adjacent cell, so any intruding pair is found as long as minSep stays
// under the cell size. Worst case is two elite tanks (ENEMY_SEP_FRAC * 2 * ELITE.sizeMul *
// ENEMIES.tank.radius) = ~51px at FRAC 0.65 — under 64, but that is the headroom: raising
// ENEMY_SEP_FRAC past ~0.8 needs this cell raised with it or the biggest pairs stop separating.
export const ENEMY_SEP_CELL = 64

// ---- Progression ---------------------------------------------------------------
export const xpForLevel = (level) => 5 + level * 4
export const GEM_VALUE = 1

// ---- Meta shop (permanent upgrades, cost in coins) ----------------------------
// `icon` is UI-only (v6.6 shop redesign): one emoji per card so the grid is scannable by shape
// instead of by reading eight names. Same role as WEAPONS/ELEMENTS icons — no sim meaning.
export const SHOP = {
  damage:     { name: 'Power Gel',    desc: '+5% damage',       perLevel: 0.05, base: 20, icon: '💥' },
  fireRate:   { name: 'Twitchy',      desc: '+4% fire rate',    perLevel: 0.04, base: 20, icon: '⚡' },
  critChance: { name: 'Lucky Eye',    desc: '+2% crit chance',  perLevel: 0.02, base: 30, icon: '🎯' },
  critDamage: { name: 'Mean Streak',  desc: '+15% crit damage', perLevel: 0.15, base: 30, icon: '💢' },
  maxHP:      { name: 'Big Mochi',    desc: '+15 max HP',       perLevel: 15,   base: 15, icon: '❤️' },
  moveSpeed:  { name: 'Slippery',     desc: '+4% move speed',   perLevel: 0.04, base: 25, icon: '💨' },
  magnet:     { name: 'Magnetic Charm', desc: '+12% gem magnet', perLevel: 0.12, base: 15, icon: '🧲' },
  coinGain:   { name: 'Coin Nose',    desc: '+10% coins found', perLevel: 0.10, base: 40, icon: '🪙' },
}
export const MAX_SHOP_LEVEL = 10
export const shopCost = (id, level) => Math.round(SHOP[id].base * Math.pow(1.6, level))

// Sacrifice already-purchased SHOP levels (no coin refund) to permanently unlock the 3rd/4th
// level-up card slot (see meta.choiceSlots in state.js and hooks.onSacrifice in main.js).
export const SACRIFICE_COSTS = [20, 40]  // shop levels to give up for the 3rd, then 4th card slot
export const sacrificeCost = (slots) => SACRIFICE_COSTS[slots - 2] ?? null  // slots = current unlocked count (2..4)
// The most level-up cards THIS build can deal. Derived from the sacrifice ladder, which is what
// defines it: 2 free slots plus one per purchasable step. createRun clamps run.choiceSlots to it
// (state.js) — a save written by a future build may legitimately store MORE, and loadMeta keeps
// that number rather than writing it back lower (R3, docs/superpowers/specs/
// 2026-08-04-cross-device-save-sync-tech-strategy.md §2.4: clamp on use, never on load).
export const MAX_CHOICE_SLOTS = 2 + SACRIFICE_COSTS.length

// End-of-run coin bonus
export const runBonusCoins = (kills) => Math.floor(kills / 10)

// v6.4.2 (owner directive): a single run banks at most this many coins. Clamped at BOTH ends:
// the standing run.coinsEarned counter (stepPickups, sim.js — rerolls spend it down and it can
// re-earn back up to the cap) and the final banked total including the kill bonus (endRun, main.js).
export const COIN_CAP_PER_RUN = 999

// ---- Chapters (v5.0: macro progression above difficulty) ---------------------------
// Pure data — sim stays theme-agnostic and reads roster archetypes/behavior flags, weapon
// pools, and signature/obstacle config from the run's chapter snapshot (see state.js
// createRun). v5.4 completes the seven-chapter arc from the design doc — CHAPTER_ORDER is the
// single source of truth for sequencing, daily seeding, and how many chapters currently ship.
export const CHAPTER_ORDER = ['body', 'pond', 'garden', 'undergrowth', 'city', 'skies', 'beyond']
export const CHAPTERS = {
  body: {
    name: 'The Body', tagline: 'escape the host', icon: '🦠',
    weapons: ['star', 'orbit', 'wave', 'homing'], starter: 'star',
    // roster: archetype = existing spawn type ('normal'|'tank'|'fast'), muls vs current stats,
    // flags = behavior flags implemented in sim.js (Task 3). v6.3: two optional generic knobs,
    // read by spawnEnemy's pool pick (config.js roster comment lives here, once, for every
    // chapter) — weight (relative spawn share within the archetype pool, default 1) and minT
    // (seconds; the entry is ineligible before then, falling back to the unfiltered pool if the
    // time filter would empty it, so an archetype never goes silent early).
    roster: [
      { id: 'redcell',  archetype: 'normal', name: 'Red Blood Cell',    hpMul: 1, speedMul: 1,   flags: [] },
      { id: 'wbc',      archetype: 'tank',   name: 'White Blood Cell',  hpMul: 1, speedMul: 1,   flags: [] },
      { id: 'antibody', archetype: 'fast',   name: 'Antibody',          hpMul: 1, speedMul: 1,   flags: ['latch'] },
    ],
    eliteFlags: ['acidPool'],           // pill elites dissolve into acid pools
    signature: null,                    // intro chapter has no signature mechanic
    obstacles: null,                    // keeps the open field
    // v6.4.5 (owner directive): chapter-wide baseline easing — every difficulty AND dailies run
    // gentler here, with xp compensating the thinner swarm; difficulty taxes, mutators and the
    // d1-only EARLY_CALM all stack on top. enemyHpMul (v6.4.9, owner directive): body enemies
    // also carry 25% less HP.
    // maxAliveMul 0.7 -> 0.45 in v6.6.6 (owner directive: "still way too many enemies in chapter 1
    // in the last third"). The cap is the right knob and the late spawn RAMP is not, which is not
    // obvious: damping SPAWN_LATE_QUAD for this chapter alone (measured at 0.5/0.35/0.25) only
    // moved WHEN the field saturates, never WHETHER — past ~150s arrivals outrun any starter
    // build's kill rate, so the field fills to the cap regardless and the cap alone sets the
    // density you look at. Measured with the kite-recycler on, ~every alive enemy sits within a
    // screen of the player, so this number IS the on-screen crowd. It also self-targets the last
    // third: at d1 the field is ~27 alive at 150s and only reaches the cap around 250s, so
    // lowering it leaves the first two thirds untouched.
    balance: { spawnMul: 0.75, enemyDmgMul: 0.75, enemyHpMul: 0.75, xpMul: 1.25, maxAliveMul: 0.45 },
    // ---- render-only (v5.0 task 6; interpreted by render.js, ZERO effect on sim) ----
    // body is the baseline look: bgColor = the app's clear colour (main.js); tints are
    // multiply-identity white and there's no player tail. Enemy silhouettes are baked per
    // rosterId in render.js (v5.4 — redcell/wbc/antibody), so no per-chapter enemy map here.
    render: {
      // Hero-card cast (v6.7): three roster ids, drawn on the title's chapter card with THIS GAME'S
      // OWN baked art (render.js castThumbs), so the card says who lives there. Ids, not emoji: the
      // v6.7.1 version was an emoji per enemy and there is simply no glyph for half this bestiary —
      // the tardigrade shipped as 🐻 and read as a bear. RENDER-ONLY — sim.js never reads it.
      cast: ['redcell', 'wbc', 'antibody'],
      bgColor: 0xf4efe6,   // == main.js app background
      floorTint: 0xffffff, // multiply-identity → floor sprites keep their baked pastel tints
      playerTint: 0xffffff,
      tail: false,
    },
  },
  pond: {
    name: 'The Pond', tagline: 'nothing floats forever', icon: '💧', // v6.0.2: was three-glyph '🦠→💧' — overflowed every single-emoji slot
    weapons: ['flagella', 'mines', 'bloom'], starter: 'flagella',
    roster: [
      { id: 'amoeba',     archetype: 'normal', name: 'Amoeba',     hpMul: 1,   speedMul: 0.9, flags: ['split'] },
      { id: 'tadpole',    archetype: 'fast',   name: 'Tadpole',    hpMul: 1,   speedMul: 1,   flags: ['dashBurst'] },
      { id: 'tardigrade', archetype: 'tank',   name: 'Tardigrade', hpMul: 2.5, speedMul: 0.6, flags: ['phase'] }, // v6.4: cryptobiosis flicker (see PHASE_* below)
    ],
    eliteFlags: ['soapTrail'],
    // v6.4 pond identity: eddies are streamed vortices (run.eddies, sim.js streamEddies) that fold
    // an inward pull + tangential swirl into currentForce on top of the ambient drift above —
    // signature owns these numbers exactly like strength/scale/drift. chance is a DIRECT per-cell
    // probability, not an obstacle-style count (the count formula saturates at this cell size).
    // minDist is the same spawn-ring clearance obstacles use, measured from the run origin.
    signature: {
      type: 'currents', strength: 55, scale: 0.0011, drift: 0.13,
      eddies: { cell: 1000, chance: 0.5, r: 170, pull: 30, swirl: 120, minDist: 480 },
    },
    obstacles: { count: 14, minR: 26, maxR: 44, minDist: 220 }, // minDist from spawn point
    // v6.4.5 (owner directive): chapter-wide baseline easing — every difficulty AND dailies run
    // gentler here, with xp compensating the thinner swarm; difficulty taxes, mutators and the
    // d1-only EARLY_CALM all stack on top. enemyHpMul (v6.4.10, owner directive): the per-chapter
    // HP ladder — pond −15%.
    // maxAliveMul 0.8 -> 0.6 in v6.6.7 (owner directive: "smooth out the chapter curve"): see the
    // ladder note above MAX_ALIVE.
    balance: { spawnMul: 0.75, enemyDmgMul: 0.75, enemyHpMul: 0.85, xpMul: 1.25, maxAliveMul: 0.6 },
    // ---- render-only (v5.0 task 6) ---- murky teal-green water biome. render.js: multiplies
    // floorTint into every floor sprite's baked tint, sets the app clear colour to bgColor,
    // multiplies playerTint onto the blob + shows an animated flagellum tail (tailTint). Enemy
    // silhouettes are baked per rosterId (v5.4 — amoeba/tadpole/tardigrade), and statusless
    // soap-bubble elites shimmer through `eliteIridescent`. currents motes driven off signature.type.
    render: {
      // Hero-card cast (v6.7): three roster ids, drawn on the title's chapter card with THIS GAME'S
      // OWN baked art (render.js castThumbs), so the card says who lives there. Ids, not emoji: the
      // v6.7.1 version was an emoji per enemy and there is simply no glyph for half this bestiary —
      // the tardigrade shipped as 🐻 and read as a bear. RENDER-ONLY — sim.js never reads it.
      cast: ['amoeba', 'tadpole', 'tardigrade'],
      bgColor: 0x2e6258,    // murky teal water showing between the floor blotches
      floorTint: 0x66c2a9,  // teal multiply — pushes the green foliage toward pond weeds
      playerTint: 0xb0f0ff, // cools the mint blob toward a saturated cyan-teal
      tail: true,
      tailTint: 0x66e0d0,
      eliteIridescent: [0xbfe8ff, 0xffd9f2, 0xd9ffe8], // pale hues soap-bubble elites cycle through
    },
  },
  garden: {
    name: 'The Garden', tagline: 'your scent gives you away', icon: '🐜',
    // Leaf Blade is the boomerang re-theme (id kept as 'boomerang', see WEAPONS.boomerang);
    // stinger + lure are new v5.3 natives. Starter = the leaf blade (boomerang).
    weapons: ['boomerang', 'stinger', 'lure'], starter: 'boomerang',
    roster: [
      // v6.6.16 (owner): ants and spiders 25% smaller, the wasp 25% bigger. radiusMul is a ROSTER
      // multiplier on the archetype's base radius, so it re-sizes one creature without touching
      // the archetype every other chapter shares.
      { id: 'ant',    archetype: 'normal', name: 'Ant',    hpMul: 0.85, speedMul: 1.1, radiusMul: 0.75, flags: ['trailFollow'] },
      { id: 'wasp',   archetype: 'fast',   name: 'Wasp',   hpMul: 1.3,  speedMul: 0.8, radiusMul: 1.25, flags: ['diveBomb'] },
      // v6.6.15 (owner): spiders -20% hp. This is the ROSTER multiplier, so it thins the spider
      // alone; garden's chapter-wide enemyHpMul below still applies on top of it.
      { id: 'spider', archetype: 'tank',   name: 'Spider', hpMul: 1.2,  speedMul: 0.9, radiusMul: 0.75, flags: ['webZone'] },
    ],
    eliteFlags: [],                       // v6.6.16: the mower left the elite flag and became a
                                          // chapter hazard (see `mower` below) — it turns up on its
                                          // own schedule now, so an elite no longer summons one.
    mower: true,                          // ambient lawnmower passes; see the MOWER_* block
    // v6.6.26 (owner: "20% less spiders"). Relative spawn-share multiplier keyed by ARCHETYPE
    // (normal/fast/tank — the same vocabulary this roster is written in), applied to WAVE_TABLE
    // before the pick; see waveWeights in sim.js, which does the archetype -> spawn-type
    // translation. It has to live here rather than on the spider's roster entry: the spider is
    // garden's only `tank`, so a roster weight would be weighted-picking a one-item pool — a
    // silent no-op.
    // 0.73, NOT 0.80, because the weights are RELATIVE: cutting tank hands its share to the other
    // archetypes and the pick re-normalises, so a flat 0.80 only removes 14.5%. The exact figure
    // comes from integrating spawnRate(t) * tankShare(t) over RUN_DURATION (the pick is an
    // independent draw per arrival, so the expected count is closed-form): 0.73 -> -20.0%,
    // 0.74 -> -19.3%, 0.72 -> -20.9%. Seeded sim runs can NOT settle this to better than ~3% — one
    // different pick re-rolls the whole downstream stream — so the integral is the authority.
    // -20.0% is the figure OVER A FULL 300s RUN. The cut is row-dependent, because the late
    // WAVE_TABLE rows are tank-heavier: -23.6% in [140,200), -20.9% in [200,240), -19.1% past 260.
    // A player who dies at 200s met ~24% fewer spiders, not 20%. It is also -20% against the build
    // this feedback came from (v6.6.24); measured against v6.6.22 it is -24%, since v6.6.23 had
    // already taken 5% off spawnMul.
    // BODY COUNT is untouched — ants and wasps absorb the difference — but DIFFICULTY is not, and
    // the two are not the same thing: a 90hp tank is replaced by a 20hp drone or a 10hp wisp, so
    // this quietly removes 11.9% of the chapter's total enemy HP and 8.7% of its XP (both
    // closed-form over the same integral; measured level-ups over 300s fell 29 -> 28). Stacked on
    // v6.6.23's -10% HP that is ~-22% of the garden's HP pool across three releases for only -5%
    // bodies. Worth knowing before the next nerf: the chapter has been softened more than the
    // "5% fewer monsters" framing of those release notes suggests.
    archetypeMul: { tank: 0.73 },
    // Signature: dying trailFollow ants drop fading pheromone nodes (run.trails) that living ants
    // accelerate along. No field force (unlike currents) — the mechanic IS the ant behaviour, so
    // sim.js gates its trail logic on signature.type === 'pheromones' (future chapters' ants differ).
    signature: { type: 'pheromones' },
    obstacles: { count: 12, minR: 22, maxR: 40, minDist: 220 }, // grass stalks / pebbles
    // v6.4.10 (owner directive): per-chapter enemy HP ladder — garden −5%.
    // maxAliveMul 0.9 -> 0.75 in v6.6.7 (owner directive: "smooth out the chapter curve"): see the
    // ladder note above MAX_ALIVE.
    // v6.6.15 (owner): "reduce 20% the number of enemies" -> spawnMul 0.8, the same lever v6.4.5
    // used for "25% fewer enemies" on body/pond. maxAliveMul (the density CEILING) is left alone —
    // it was set to 0.75 in v6.6.7 for the chapter-curve pass and answers a different question.
    // v6.6.23 (owner: "5% less monster hp and 5% less monster quantity in chapter 3"): 0.8 -> 0.76
    // and 0.95 -> 0.9, each 5% off what was there. Quantity is spawnMul ALONE, deliberately:
    // maxAliveMul is the concurrent cap, and measured over 5 seeds x 300s the garden field only
    // reaches it in 0-6% of samples (avg alive 38 at d1, 79 at d5, against a cap of 300), so
    // trimming the cap moves the enemies a player actually meets by 0-1.4% — it would look like a
    // balance change and be a no-op. Cutting spawnMul 5% measures as ~5% fewer arrivals AND ~5%
    // lower average alive, which is what the directive asks for.
    balance: { spawnMul: 0.76, enemyHpMul: 0.9, maxAliveMul: 0.75 },
    // ---- render-only (v5.3; interpreted by render.js, ZERO effect on sim) ---- sunlit lawn biome.
    // Clearly brighter/cheerier than the pond's murk: warm daylight green showing between the blades,
    // a sunny grass floorTint, a bug-ish blob (tint-only skin, no tail). Enemy silhouettes are baked
    // per rosterId (v5.4 — ant/wasp/spider). render.js also draws the five garden sim systems
    // (trails/webs/strips/lures + stinger needles), all data-driven no-ops elsewhere.
    render: {
      // Hero-card cast (v6.7): three roster ids, drawn on the title's chapter card with THIS GAME'S
      // OWN baked art (render.js castThumbs), so the card says who lives there. Ids, not emoji: the
      // v6.7.1 version was an emoji per enemy and there is simply no glyph for half this bestiary —
      // the tardigrade shipped as 🐻 and read as a bear. RENDER-ONLY — sim.js never reads it.
      cast: ['ant', 'wasp', 'spider'],
      bgColor: 0x4e8240,    // sunlit lawn green between the grass blades (brighter than pond)
      floorTint: 0xaad066,  // warm sunny grass-green multiply on the floor sprites
      playerTint: 0xc2f070, // bug-ish warm caterpillar green for the blob
      tail: false,
    },
  },
  undergrowth: {
    name: 'The Undergrowth', tagline: 'the traps were already set', icon: '🐾',
    weapons: ['clawRake', 'quillBurst', 'chitterShriek'], starter: 'clawRake',
    roster: [
      // v6.6.32: was a Cat. Replaced after seven rejected art revisions — a cat has no graphic
      // hook and at 26px it was indistinguishable from this chapter's own rat (the reasoning is
      // kept in full above drawToad in render.js). A toad keeps every mechanic verbatim: the tank
      // archetype, `pounce`, the trap slam on landing. It is the one animal whose real locomotion
      // IS a telegraphed crouch-and-leap, so the state machine now describes the creature instead
      // of being bolted to it.
      // v6.7.3 (owner: "make them 33% faster [...] they a bit too easy to dodge now"): speedMul
      // 0.8 -> 1.064, i.e. 44 -> 58.5 px/s off ENEMIES.tank.speed 55. This only scales the STALK
      // (the 'hold' seek, itself x POUNCE_HOLD_SPEED_MUL) — the leap is a fixed distance over a
      // fixed time and does not read e.speed at all, so this buys pounces-per-minute rather than a
      // faster leap. A toad now walks slightly faster than a `normal` rat (0.85), which reads odd
      // on paper but not on screen: it spends most of the cycle standing still in 'aim' or frozen
      // in 'land', so its AVERAGE closing speed stays the slowest in the chapter.
      { id: 'toad', archetype: 'tank',   name: 'Toad', hpMul: 1.6,  speedMul: 1.064, flags: ['pounce'] },
      // Centipede replaces the Owl (v5.6.8). The owl used 'aerialStrike' — circles overhead at
      // AERIAL_RADIUS, dives to a marked spot — which is un-killable in a MELEE-ONLY chapter: it
      // circles past every short-range weapon and dives to where a kiting player WAS, so a
      // clawRake loadout cleared 0% of owls. aerialStrike / drawOwl are kept parked (see sim.js /
      // render.js) for a future chapter that hands out a ranged weapon. The centipede is a plain
      // fast ground predator — it closes into rake range and dies there, like every ground enemy.
      // v6.6.28 (owner: "centipede -30%hp"): hpMul 1.15 -> 0.805. The centipede is now the
      // SQUISHIEST thing in the chapter (rat 0.85), which is the point — it is the `fast` lane and
      // fast should die fast, per the FAST => COMMITTED rule this roster is built on.
      { id: 'centipede', archetype: 'fast', name: 'Centipede', hpMul: 0.805, speedMul: 1.05, flags: ['weave'] },
      { id: 'rat', archetype: 'normal', name: 'Rat', hpMul: 0.85, speedMul: 1.15, flags: [] },
      // v6.6.28 (owner: "mice should not 'jump' only walk") DELETED the 'dartRat' entry that used
      // to sit here — the v6.5 startled-darting variant. Its `dashBurst` flag is idle at 0.4x speed
      // for 1.1s and then a COMMITTED 2.6x lunge for 0.5s with no re-aim (DASH_* below), and the
      // renderer draws no leap for it, so on screen a rat simply teleports at you: exactly the
      // "jump" the owner is describing. Stripping the flag and keeping the entry would have left an
      // exact duplicate of `rat` above, so the entry goes. `dashBurst` itself STAYS — pond's tadpole
      // is still built on it, and the flag vocabulary is chapter-agnostic. Test run TT.e is the
      // tripwire: undergrowth's roster must carry no dashBurst.
    ],
    eliteFlags: ['flashlightCone'],       // exterminator elites sweep a cone that ENRAGES other enemies
    // Signature: predator telegraphs (the toad's 'pounce' is the telegraph — it crouches, aims, then
    // leaps and lands in a punish window) PLUS a field of snap traps. v6.5: traps are STREAMED by
    // sim.js's streamTraps on the same obstacle cell hash obstacles/eddies use (run._obstacleSeed),
    // not seeded once at createRun — the old origin-scatter field went dead the moment you walked
    // OBSTACLE_FIELD_RADIUS away, so "the signature is dead 15 seconds in" was the literal defect.
    // `cell`/`chance` are a per-cell occupancy probability (cell² / chance ≈ 254k px² per trap —
    // parity with the old 10-in-900px-radius field's density); `minDist` is spawn-ring clearance
    // from the run's ORIGIN only (streamed cells far from the origin are never excluded). Every
    // other trap number stays a SNAP_TRAP_* constant below.
    signature: { type: 'predators', traps: { cell: 400, chance: 0.63, minDist: 200 } },
    // v6.6.28 (owner: "20% less enemies"). Undergrowth had NO balance block at all until now, so
    // this is the chapter's first entry in that ladder.
    //
    // spawnMul ALONE, matching garden's identical v6.6.15 request. The obvious extra lever is
    // maxAliveMul, and it was in a draft of this block, because two critics measured that the
    // arrival cut evaporates late in a WEAK run: at d3 with a starter-level build, spawnMul 0.8
    // gives avg alive 271 vs 362 at t=180 and then 400 vs 400 at t=240 and t=270 — zero reduction
    // past t~225s, because stepSpawning banks blocked spawns in an unbounded _spawnAcc rather than
    // dropping them. Over a full run that turns "20% fewer" into a measured ~11%.
    // It is still not the right lever HERE, because the concurrent cap is not free real estate: the
    // v6.6.6/v6.6.7 density ladder is its own owner directive ("smooth out the chapter curve"), it
    // runs 180/240/300 across the three onboarding chapters and is deliberately full 400 from
    // undergrowth on, and it is required to climb in EVEN RATIO steps — the defect v6.6.7 fixed was
    // a ladder that went +78% / +13% / +11%. Inserting 0.8 here makes garden->undergrowth a +6.7%
    // step followed by a +25% one, i.e. re-creates exactly the shape that directive outlawed.
    // So: this number is 20% fewer ARRIVALS, which is what it says and what garden shipped. The
    // honest scope is that a run whose field is already pegged at the cap sees less than 20% —
    // see run VV for the ladder this defers to.
    // v6.6.33 (owner: "20% less toads"). Relative spawn-share multiplier keyed by ARCHETYPE,
    // applied to WAVE_TABLE before the pick — the same lever and the same arithmetic as garden's
    // v6.6.26 spider cut, and it lands on the same number for the same reason: WAVE_TABLE and
    // spawnRate are GLOBAL, so the tank share over a 300s run is identical in every chapter.
    // 0.73, NOT 0.80, because the weights are RELATIVE: scaling one weight by m does not cut its
    // share by (1-m), it cuts it by m/(m*w + rest). Closed-form integral of
    // spawnRate(t) * tankShare(t, m) over the run, bisected: 0.7309 is exact, and on the 2dp grid
    // 0.73 -> -20.1%, 0.74 -> -19.3%, 0.72 -> -20.9%. Seeded sims cannot settle this to better than
    // ~3% because the RNG stream diverges the moment one pick differs — do not "verify" it that way.
    // This is a SHARE cut and stacks multiplicatively with the spawnMul below, which is a TOTAL cut:
    // the owner asked for 20% fewer toads than they currently see, and that is what this gives.
    // The toad is undergrowth's only `tank`, which is why this has to live here rather than as a
    // roster weight — a roster weight would be weighted-picking a one-item pool, a silent no-op.
    archetypeMul: { tank: 0.73 },
    balance: { spawnMul: 0.8 },
    obstacles: { count: 15, minR: 24, maxR: 46, minDist: 220 }, // roots / bones (traps are separate, see run.traps)
    // ---- render-only (v5.4; interpreted by render.js, ZERO effect on sim) ---- dim forest floor
    // seen from ankle height: dark loam showing between leaf litter, a drab dead-leaf floorTint, a
    // furry tan critter with a tail. Deliberately the DARKEST biome so far (the garden's sunlit lawn
    // gives way to the shade under it). Enemy silhouettes are baked per rosterId (toad/centipede/rat).
    render: {
      // Hero-card cast (v6.7): three roster ids, drawn on the title's chapter card with THIS GAME'S
      // OWN baked art (render.js castThumbs), so the card says who lives there. Ids, not emoji: the
      // v6.7.1 version was an emoji per enemy and there is simply no glyph for half this bestiary —
      // the tardigrade shipped as 🐻 and read as a bear. RENDER-ONLY — sim.js never reads it.
      cast: ['toad', 'centipede', 'rat'],
      bgColor: 0x2b2417,    // dark loam/soil showing between the leaf litter
      floorTint: 0x8a7a4e,  // drab dead-leaf brown multiply on the floor sprites
      playerTint: 0xd8a86a, // warm tan fur for the blob (you're a small furry critter now)
      tail: true,
      tailTint: 0xc99a5e,   // slightly darker tan — a critter tail, not a flagellum
      // v6.5: screen-space falling leaves (render.js updateLeaves) — render-only, zero sim
      // effect, same contract as every other key in this block.
      leaves: true,
    },
  },
  city: {
    name: 'The City', tagline: 'you\'ve been reported', icon: '🏙️',
    // Neon Beam is the rainbow re-theme (id kept as 'rainbow', see WEAPONS.rainbow); trashTornado
    // + sewerGeyser are new v5.4 natives. Starter = the neon beam (rainbow).
    weapons: ['rainbow', 'trashTornado', 'sewerGeyser'], starter: 'rainbow',
    roster: [
      { id: 'vacuum',   archetype: 'tank',   name: 'Robot Vacuum',    hpMul: 1.5,  speedMul: 0.85, flags: ['lineCharge'] },
      { id: 'ratDrone', archetype: 'normal', name: 'Rat-Catcher Drone', hpMul: 1,  speedMul: 1.05, flags: [] },
      // Patrol Drone (v6.3): the owl machine (aerialStrike) finally in a ranged chapter. weight/
      // minT keep it a minority that phases in — half the bulk archetype from t=0 rewrote the
      // opening minute.
      { id: 'patrolDrone', archetype: 'normal', name: 'Patrol Drone', hpMul: 0.85, speedMul: 1.0, flags: ['aerialStrike'], weight: 0.3, minT: 60 },
      // Street Rat (v6.3): the fast PRESSURE lane (plain committed chaser). Pigeon is the lane's spice.
      { id: 'rat',      archetype: 'fast',   name: 'Street Rat',     hpMul: 0.8,  speedMul: 1.15, flags: [] },
      { id: 'pigeon',   archetype: 'fast',   name: 'Pigeon',          hpMul: 0.7,  speedMul: 1.2,  flags: ['blink'] },
    ],
    eliteFlags: ['spawner'],              // exterminator-van elites periodically disgorge minions
    // Signature: traffic lanes (run.lanes) — a marked band is telegraphed, then a vehicle sweeps
    // it end to end, deadly to the player AND to enemies. All tuning is in TRAFFIC_* below; the
    // per-chapter knob is how many lanes may be live at once.
    signature: { type: 'traffic', lanes: 2 },
    // dispatch (v6.3): the tagline ("you've been reported") finally cashes as a mechanic — every
    // city ELITE spawn (never a spawner's forceNormal minions) fires a {type:'dispatch'} event.
    // Top-level, not render-only: sim.js reads it at the elite-spawn site.
    dispatch: true,
    // roads (v6.3): city gets the same street grid skies uses (CHAPTERS.skies.roads' comment
    // covers the mechanism) — streamObstacles keeps city's chapter-wide radius band and dumpster/
    // hydrant/cone kind pool (perKindRadius stays keyed on render.districts, skies only) while
    // gaining road exclusion, blockSnap curb alignment and biome build-density.
    roads: true,
    // v6.4.10 (owner directive): per-chapter enemy HP ladder — city +5%.
    balance: { enemyHpMul: 1.05 },
    obstacles: {
      count: 16, minR: 22, maxR: 42, minDist: 220,
      // clamp biome build-density >= 1: city's floor can't show biomes, so the sprawl must never
      // visibly run out (streets fading is the edge cue)
      densityFloor: 1,
    }, // hydrants / dumpsters / cones
    // ---- render-only (v5.4) ---- night street: wet asphalt showing between concrete slabs, cold
    // grey floor, a neon-lit slime monster (no tail). Enemy silhouettes baked per rosterId
    // (vacuum/ratDrone/pigeon). render.js also draws run.lanes (hazard-striped band -> headlights).
    render: {
      // Hero-card cast (v6.7): three roster ids, drawn on the title's chapter card with THIS GAME'S
      // OWN baked art (render.js castThumbs), so the card says who lives there. Ids, not emoji: the
      // v6.7.1 version was an emoji per enemy and there is simply no glyph for half this bestiary —
      // the tardigrade shipped as 🐻 and read as a bear. RENDER-ONLY — sim.js never reads it.
      // pigeon, not patrolDrone: patrolDrone reuses drawRatDrone, so those two would put the same
      // quadrotor on the card twice and the row would look like a rendering bug.
      cast: ['vacuum', 'ratDrone', 'pigeon'],
      bgColor: 0x2c2f38,    // wet night asphalt between the pavement slabs
      floorTint: 0x9aa0ac,  // cold concrete grey multiply on the floor sprites
      playerTint: 0x9ef0c8, // neon-sign green — an urban monster lit by the storefronts
      tail: false,
      // v6.3: rain on the asphalt, no storm — chapterHasRain (render.js) is `storm || rain`, so
      // city gets the screen-space rain layer without the skies-only cloud shadows/parallax clouds.
      rain: true,
      // v6.3: cover-crush leaves a permanent wreck decal too — chapterHasRuins (render.js) is
      // `storm || ruins`. The crush event's kind is forced to 'dumpster' (sim.js stepLanes' cover
      // emit); RUIN_FOR_KIND has no 'dumpster' entry so it falls back to the 'tower' ruin bake
      // (angular rubble chunks — the closest neutral match to a smashed steel bin; no new art).
      ruins: true,
    },
  },
  skies: {
    name: 'The Skies', tagline: 'they brought the air force', icon: '🌩️',
    weapons: ['roar', 'tailSwipe', 'debrisToss'], starter: 'roar',
    roster: [
      // 'crushable' (v5.14): flying into a kaiju kills the aircraft and does NOT scratch the kaiju.
      // A jet does not bounce off a monster the size of a city block, and it certainly does not
      // hurt one by hitting it — the aircraft's threat is its STRAFE RUN (a telegraphed, dodgeable
      // attack), not its airframe. Aircraft only: the tank column below is ground armour and
      // survives being brushed, so walking into one still costs you.
      { id: 'jet',        archetype: 'fast',   name: 'Fighter Jet', hpMul: 0.8, speedMul: 1.1,  flags: ['strafe', 'crushable'] },
      // v5.6.15: hpMul 1.2 -> 0.75 — aircraft are FRAGILE; the tank column is this chapter's
      // armor. At 1.2 the roar cone cleared ~0.7 helis/s against ~1.6/s spawning, so they
      // accumulated into a missile hell (217 alive at t=180) regardless of standoff.
      { id: 'helicopter', archetype: 'normal', name: 'Helicopter',  hpMul: 0.75, speedMul: 0.9,  flags: ['missileVolley', 'crushable'] },
      // v5.13: hpMul 1.8 -> 1.25 ("tanks are a bit too tanky"). The tank column is still the
      // chapter's armour — every other skies spawn sits at or below 0.8 — but at 1.8 it outlived
      // the roar cone long enough that columns stacked up and their artillery telegraphs became a
      // permanent fixture of the screen. Cutting HP is also a CLUTTER fix: fewer live tanks is
      // fewer square telegraphs, which is the same lever as the LOD cut below.
      { id: 'tankColumn', archetype: 'tank',   name: 'Tank Column', hpMul: 1.25, speedMul: 0.55, flags: ['artillery'] },
    ],
    eliteFlags: ['artillery'],            // AA-turret elites shell you too, just harder (see ARTILLERY_*)
    // Signature: bombardment (area denial) — telegraphed artillery circles rain on the player's
    // area CONTINUOUSLY, independent of the artillery-flagged roster. Both feed run.bombs (the
    // existing volatile-bomb array: telegraph fuse -> explode, damages player AND enemies).
    // `rate` = seconds between bombardment volleys; the rest is BOMBARDMENT_* below.
    signature: { type: 'bombardment', rate: 2.6 },
    // v6.4.10 (owner directive): per-chapter enemy HP ladder — skies +15%.
    balance: { enemyHpMul: 1.15 },
    // v5.8 kaiju redesign: cell 420->260, count 13->34, minR/maxR 30/60->10/28, minDist 240->160.
    // BOTH cell and count had to move together — count is a density reference over
    // OBSTACLE_FIELD_RADIUS and is invariant under cell size alone (see STRUCTURE_KINDS' comment
    // above); shrinking just `cell` would have left the live obstacle count unchanged. Smaller,
    // denser structures are the whole point: the player is now bigger than the city, not smaller
    // than the debris (see the design doc's Problem section). minDist drops with it — at this
    // density the old 240px spawn-clear ring reads as a conspicuous bald crater, not a starting
    // clearing. `cell` is a new per-chapter override (see OBSTACLE_CELL's doc above); every other
    // chapter still falls back to the shared OBSTACLE_CELL and is untouched by this.
    // v5.9 top-down region overhaul: count 34->40. Streets now carve ~17% of the world out of the
    // buildable area (roadAt/ROAD_* above), so the same count-34 field that gave test/sim-test.js's
    // run CC.e density guard 102 live obstacles WITHOUT roads only reached 76 WITH them — legal
    // (its accepted band is 70-170) but thin, and a real step down from the v5.8 density goal this
    // number exists to serve. 40 pushes streamObstacles' fill probability past 1.0 (see its `prob`
    // formula) so every non-road cell in range gets a structure — the field is now AS dense as the
    // street grid allows, not merely dense enough to scrape past a test floor. (This saturates
    // rather than overflows: `prob` is clamped implicitly by the per-cell hash compare, so count
    // any higher than the ~38 needed to reach 1.0 buys nothing further — most other chapters'
    // fields are already at or past this same saturation point at their own `count`, e.g. city and
    // undergrowth; skies just used to sit under it.)
    // v5.9.2: minR/maxR 10/28 -> 8/32 — no longer the band every structure rolls from (see
    // STRUCTURE_RADIUS, below the STRUCTURE_KINDS section). Every kind now has its OWN band there;
    // these two fields are kept only as the overall [min, max] across all of them, for
    // test/sim-test.js's run CC.c3 (reads .minR directly to size a synthetic structure) and as
    // streamObstacles' conservative worst-case radius for position-jitter slack before a cell's
    // kind is known (see that function's comment) — not as a roll range in their own right anymore.
    // v5.11: cell 260 -> 200. The per-cell probability is count*cell^2/(pi*900^2), which at 260 came
    // out ABOVE 1 — every cell in the streamed disc always built something, so "density" had no
    // dynamic range left to express a city with. At 200 the base drops to ~0.63, which
    // BIOME_BUILD_DENSITY (terrain.js) then scales per biome: downtown still saturates (x3.2) and
    // now packs ~150 structures into the stream radius instead of ~90, while farmland thins to ~a
    // third and desert to a twelfth. Denser city AND emptier countryside from the same table.
    obstacles: { count: 40, minR: 8, maxR: 32, minDist: 160, cell: 200 }, // buildings — small, dense, crushable; per-kind sizing in STRUCTURE_RADIUS
    // crush (v5.8 kaiju redesign): gates BOTH halves of the new mechanic in sim.js — stepObstacles
    // skips the player-push loop for this chapter's obstacles (they're crushable, not terrain, for
    // the player only; enemies still collide with them normally) and stepCrush destroys any
    // structure overlapping the player's crush radius outright (see CRUSH_XP/RAMPAGE_* below).
    // Chapter-level, not per-obstacle-entry: every skies obstacle is a crushable structure, so one
    // flag on the chapter is the whole contract (no per-entry HP/crushable field to keep in sync).
    crush: true,
    // roads (v5.9 top-down region overhaul): gates streamObstacles' road-rejection check (sim.js)
    // so the street grid ONLY affects skies — every other chapter with an `obstacles` config
    // (city/pond/garden/undergrowth/beyond) streams exactly as before. Chapter-level for the same
    // reason `crush` is: one flag is the whole contract, no per-obstacle-entry field to keep in
    // sync. See roadAt above for the grid itself and sim.js's streamObstacles for the ponytail
    // note on why roads key off _obstacleSeed independently of the district map.
    roads: true,
    // ---- render-only (v5.6.17) ---- you are the kaiju rampaging under a NIGHT THUNDERSTORM: dark
    // indigo sky between shattered concrete, a wet-asphalt rubble floor, a green kaiju with a heavy
    // tail. Read as a dark, storm-lit ground (effective floor luminance ~0.07 — darker than city/
    // pond/garden, just shy of undergrowth) instead of the old washed-out daylight-at-altitude.
    // rosterId: jet/helicopter/tankColumn — see their re-lit fills at the top of the Skies section
    // in render.js (the floor flip forced a matching contrast re-pass on all three).
    render: {
      // Hero-card cast (v6.7): three roster ids, drawn on the title's chapter card with THIS GAME'S
      // OWN baked art (render.js castThumbs), so the card says who lives there. Ids, not emoji: the
      // v6.7.1 version was an emoji per enemy and there is simply no glyph for half this bestiary —
      // the tardigrade shipped as 🐻 and read as a bear. RENDER-ONLY — sim.js never reads it.
      cast: ['jet', 'helicopter', 'tankColumn'],
      bgColor: 0x2a3240,    // dark storm indigo-grey sky showing between the rubble
      floorTint: 0x717c88,  // wet-asphalt cool grey multiply — rain-slicked night wreckage
      // playerTint/tailTint: read only when `kaiju` (below) is false — render.js's syncPlayer
      // bypasses BOTH for the dedicated kaiju bake (SKIES_KAIJU carries its own final palette
      // directly, the same "plans carry their own palette" rule the top-down structures use).
      // Kept here, rather than deleted, as the schema every other chapter's render block follows
      // and as the fallback if `kaiju` were ever turned off.
      playerTint: 0x7ad07a, // classic rubber-suit kaiju green
      tail: true,
      tailTint: 0x5fb05f,   // a heavier, darker kaiju tail (tailSwipe's business end)
      // v5.11 kaiju redesign: the player was STILL the generic cross-chapter blob — identical
      // silhouette to body/pond/garden/undergrowth/city/beyond, just retinted, at ~44px on screen
      // (2 x PLAYER.radius) next to a tower that now draws up to 96px (SKIES_STRUCTURE_ART.tower).
      // `kaiju: true` gates a SKIES-ONLY body/tail rig in render.js (chapterHasKaiju, mirroring the
      // chapterHasStorm/chapterHasDistricts latch pattern) — a real top-down silhouette (shoulders,
      // jawed head, fore/hind limbs, a baked dorsal-plate spine) at a size that actually dwarfs a
      // tower, plus a proper segmented tail replacing the generic flagellum (T.fx.trace_05) that
      // pond/undergrowth's `tail: true` still uses UNCHANGED — see render.js's syncPlayer for the
      // branch. See SKIES_KAIJU below (art direction §5-adjacent, same "counts + palette in
      // config.js, geometry hardcoded in render.js" split as SKIES_STRUCTURE_ART) for the palette
      // and detail counts. PLAYER.radius (22) stays the sim hitbox — nothing here is read by sim.js.
      kaiju: true,
      storm: true,          // v5.6.18: gates the night-thunderstorm overlay (cloud-shadows,
                             // parallax clouds, rain — STORM_VIS below, render.js updateStorm)
      districts: true,      // v5.7.x: gates the per-cell Voronoi district floor/prop system
                             // (DISTRICTS/districtAt/districtTintAt below, render.js syncObstacles
                             // + the floor populate* callbacks) — a separate flag from `storm`
                             // because it's a distinct concern (ground skin vs. sky overlay) that
                             // only happens to also be skies-only today.
      // v5.8 kaiju redesign: render-only draw-scale on enemy sprites (jets/helis/tanks read as
      // specks under a kaiju) — deliberately NOT a sim radius change. Rev.1 of this redesign tried
      // an `enemyScale` sim knob and it silently rebalanced the chapter: e.radius is an addend in
      // ~12 hit tests (all three body tests inside inSector, sim.js — added in v5.6.3 specifically
      // so sector sweeps test the enemy's BODY, not its centre). Shrinking the sim radius would
      // have shrunk the roar/tailSwipe hit window along with the sprite. render.js reads this and
      // scales the sprite only; sim.js never sees it (not in this file's exports, not imported by
      // sim.js — grep confirms).
      enemyDrawScale: 0.55,
    },
  },
  beyond: {
    name: 'The Beyond', tagline: 'you were never local', icon: '🌌',
    // Black-Hole Vortex comes home here (id kept as 'hole', see WEAPONS.hole); realityShard +
    // tesseractBeam are new v5.4 natives. Starter = the reality shard.
    weapons: ['realityShard', 'hole', 'tesseractBeam'], starter: 'realityShard',
    // v5.18: the roster is now a MERGE of the two genres this chapter fuses (see `lane` below).
    //   - invader (normal): marches in rank, ignores you, never seeks. The Space Invaders half.
    //     Formation waves (stepFormations) spawn these and nothing else.
    //   - swarmDrone (fast): seeks you exactly as before. The Vampire Survivors half — the ordinary
    //     swarm still converges on you between ranks, which is the whole point of the merge.
    //   - hulk (tank): a heavy marcher. Slow, tanky, and it does NOT break rank, so a wave with one
    //     in it has a wall you must route around rather than out-damage.
    // `formationOnly` entries are NEVER picked by ordinary spawning — only stepFormations may spawn
    // them, by id. Rev.1 put `march` on the plain 'normal' archetype and the chapter came out with
    // no swarm at all for its first several minutes: early waves are ~100% 'drone' type, drone maps
    // to 'normal', and 'normal' was the marcher — so every enemy alive was a rank invader and the
    // Vampire Survivors half of the merge simply never appeared. The two halves need separate
    // entries: seekers spawn on the ring as in every other chapter, marchers arrive only in rank.
    roster: [
      { id: 'drifter',    archetype: 'normal', name: 'Drifter',       hpMul: 0.9,  speedMul: 1,    flags: [] },
      { id: 'swarmDrone', archetype: 'fast',   name: 'Swarm Drone',   hpMul: 0.75, speedMul: 1.25, flags: [] },
      { id: 'warden',     archetype: 'tank',   name: 'Warden',        hpMul: 1.25, speedMul: 0.7,  flags: [] },
      { id: 'invader',    archetype: 'normal', name: 'Invader',       hpMul: 0.6,  speedMul: 1,    flags: ['march'], formationOnly: true },  // rank fodder: dies fast, arrives six at a time
      { id: 'hulk',       archetype: 'tank',   name: 'Siege Hulk',    hpMul: 1.4,  speedMul: 0.55, flags: ['march'], formationOnly: true },
    ],
    eliteFlags: ['pullBeam'],             // UFO elites open an abduction beam that drags the player in
    // Signature: gravity wells (run.wells) — persistent field entities that BEND every projectile
    // in flight, the player's (run.bullets/homingShots/lobs) and the enemies' (run.enemyShots)
    // alike. They never damage anything; they only curve. `wells` = how many are alive at once.
    signature: { type: 'gravity', wells: 4 },
    // v5.18: planets, not pebbles. A handful of enormous bodies scrolling past instead of 11 small
    // rocks — the chapter is a STAR SYSTEM, so its terrain is planet-sized. Count stays low and the
    // cell stays wide: you should meet one every few seconds, never a crowd of them.
    obstacles: { count: 4, cell: 700, minR: 120, maxR: 260, minDist: 600 }, // planets
    // v5.18 lane: The Beyond is the one chapter that is NOT a free-roaming survivors arena. It is a
    // Space Invaders / vertical-shmup lane: the view auto-scrolls, you are pinned to a band near the
    // bottom of it, and you can only STRAFE left and right while ranks of invaders come down at you.
    //
    // HOW THE AUTO-SCROLL IS BUILT, because it is much less machinery than it sounds: the camera
    // already follows the player in every chapter, so "the world scrolls past while the player holds
    // station on screen" is exactly what you get by making the PLAYER advance forward at a constant
    // rate and taking only the x axis from the joystick. The renderer, the camera, the terrain
    // streaming and the obstacle field all keep working untouched — no scrolling layer, no second
    // camera mode, no new streaming. `lane` gates that movement rule (stepPlayerMovement), the
    // formation waves (stepFormations) and the leak penalty (stepLeaks).
    lane: true,
    // ---- render-only (v5.4) ---- deep space: near-black violet void between the asteroid crust,
    // a cold violet floor, a luminous cosmic blob (no tail — you're a shape, not an animal any
    // more). eliteIridescent gives UFO elites the same statusless shimmer the pond's soap bubbles
    // use. rosterId: blinker/flicker/swarmDrone.
    render: {
      // Hero-card cast (v6.7): three roster ids, drawn on the title's chapter card with THIS GAME'S
      // OWN baked art (render.js castThumbs), so the card says who lives there. Ids, not emoji: the
      // v6.7.1 version was an emoji per enemy and there is simply no glyph for half this bestiary —
      // the tardigrade shipped as 🐻 and read as a bear. RENDER-ONLY — sim.js never reads it.
      cast: ['drifter', 'swarmDrone', 'warden'],
      bgColor: 0x120a26,    // deep violet-black void showing between the asteroid crust
      floorTint: 0x6a5fa0,  // cold violet multiply — dead rock lit only by starlight
      playerTint: 0xe0b0ff, // luminous cosmic violet-white for the blob
      tail: false,
      eliteIridescent: [0xbfffe8, 0xd9c0ff, 0xffe8bf], // pale hues UFO elites cycle through
    },
  },
}
// v5.24: The Blank — hidden 8th chapter, deliberately OUTSIDE CHAPTER_ORDER (never in the daily
// rotation, never in the difficulty-3 chapter-unlock chain — see nextChapter/dailyChapter above).
// Unlocked by winning a classic run of The Beyond at difficulty 5 (main.js endRun). Not a
// survival run: `scripted: true` tells sim.js to run stepBossScript as the ONLY spawner (ordinary
// spawning, elites, formations, obstacles and the 300s victory timer are all gated off) and tells
// ui.js to swap the HUD timer for a wave/phase readout. `maxDifficultyCap: 3` overrides
// MAX_DIFFICULTY for this one chapter — see chapterMaxDifficulty below. weapons is the union of
// every other chapter's pool (the final exam); roster mixes ordinary wave fodder (probe/binder/
// eraser) with `formationOnly` entries only stepBossScript ever spawns by id: the binding node
// (P2 tether) and the three antibody phases (the boss itself, one run.enemies entry per phase).
CHAPTERS.blank = {
  name: 'The Blank', tagline: 'deletion in progress', icon: '⬜',
  scripted: true,          // gates victory timer + ordinary spawning (sim.js), HUD readout (ui.js)
  maxDifficultyCap: 3,     // per-chapter ladder ceiling (see chapterMaxDifficulty helper)
  weapons: ['star','orbit','wave','homing','flagella','mines','bloom','boomerang','stinger','lure',
            'clawRake','quillBurst','chitterShriek','rainbow','trashTornado','sewerGeyser',
            'roar','tailSwipe','debrisToss','realityShard','hole','tesseractBeam'], // union of all 7 pools
  starter: 'realityShard',
  roster: [
    { id: 'probe',     archetype: 'fast',   name: 'Probe',        hpMul: 0.7, speedMul: 1.15, flags: ['pastSeek'] },
    { id: 'binder',    archetype: 'normal', name: 'Binder',       hpMul: 0.9, speedMul: 1.05, flags: ['latch'] },
    { id: 'eraser',    archetype: 'tank',   name: 'Eraser',       hpMul: 1.2, speedMul: 1.2,  flags: ['wake'] },
    { id: 'bindnode',  archetype: 'normal', name: 'Binding Node', hpMul: 1,   speedMul: 0,    flags: [], formationOnly: true },
    { id: 'antibody1', archetype: 'tank',   name: 'The Antibody', hpMul: 1,   speedMul: 1,    flags: ['standoff'], formationOnly: true },
    { id: 'antibody2', archetype: 'tank',   name: 'The Antibody', hpMul: 1,   speedMul: 1,    flags: ['standoff'], formationOnly: true },
    { id: 'antibody3', archetype: 'tank',   name: 'The Antibody', hpMul: 1,   speedMul: 1,    flags: [], formationOnly: true }, // no standoff — P3 chases (BLANK_BOSS_SPEED_P3)
  ],
  eliteFlags: [],
  signature: null,
  obstacles: null,
  modsByDifficulty: { 1: [], 2: ['accelResponse', 'crossReactive'],
                      3: ['accelResponse', 'crossReactive', 'immuneMemory', 'affinityMature'] },
  render: { bgColor: 0xf2efe8, floorTint: 0xffffff, playerTint: 0x8a55d6, tail: false,
            cast: ['probe', 'binder', 'eraser'],   // see the cast note on the other chapters

            voidFloor: true,   // RENDER gates all decorative floor layers off
            ink: 0x4a4458 },   // RENDER uses for damage numbers / telegraphs that default to white
}
// Drift-current visualization (v5.2, render.js): world-space flow streaks that sample the REAL
// currentForce field (sim.js) and advect along it, exaggerated for legibility over the gentle sim push.
export const CURRENT_VIS = {
  count: 40,          // streaks alive at once (world-space, pooled)
  speedMul: 3.6,      // exaggeration over the sim's gentle push so the flow direction reads
  life: 3.0,          // s a streak lives before fading out and respawning in view
  lifeJitter: 0.5,    // ± fraction randomising each streak's life so they don't pulse in unison
  fadeIn: 0.5,        // s ramp up from spawn
  fadeOut: 0.9,       // s ramp down before respawn
  margin: 90,         // px past the viewport a streak may stray before it respawns in view
  lenPx: 34,          // base streak length (long axis)
  widthPx: 7,         // base streak width
  stretchPerSpeed: 0.02, // extra length multiplier per px/s of exaggerated flow speed
  tint: 0xa8fbef,     // saturated teal-white — reads on the murky pond floor (pale washes out, dark vanishes)
  alpha: 0.5,         // peak alpha at full fade-in
  rippleEvery: 3.2,   // s between "ripple train" accents (3 streaks single-file); 0 disables
}

// Eddy vortex visualization (v6.4 pond identity, render.js): per-eddy (run.eddies) pooled decal —
// the gravity hole's proven twirl treatment (two counter-rotating T.fx.twirl_02/twirl_01 layers at
// high alpha) plus a stroked rim ring at exactly the eddy's r, since the ring is the honest force
// boundary (same contract as an obstacle footprint's rim — the collision/force edge a player can
// learn by eye). tintA/tintB and ringTint are RAW final colours, not multiplied by chapterRender.
// floorTint — eddies are a chapter-agnostic FX pool exactly like CURRENT_VIS/the hole, not floor
// decor. Colour picked to sit apart from BOTH neighbours by hue, not just value: CURRENT_VIS.tint
// (0xa8fbef) is green-cyan (G channel highest), the gravity hole's vortex tints (0x2f1a66/0x5a2fb0)
// are red-violet (R > G, B highest), this is blue-indigo (G > R, B highest) — measured against the
// pond's effective floor (bg 0x2e6258 under floorTint 0x66c2a9, luminance ~0.186): tintA at peak
// alpha lands ~2.02x, tintB (dimmer, subordinate) ~1.21x, the ring ~2.02x — the ring clears the
// obstacle-footprint script's own >=2x rim target so the force boundary reads with the same
// confidence a collision rim does.
export const EDDY_VIS = {
  tintA: 0x2a3a8f,       // dominant twirl layer — deep indigo, spins WITH the eddy's true dir
  tintB: 0x4d5ecf,       // counter twirl layer — lighter indigo-blue, spins opposite, dimmer+slower
  alpha: 0.85,           // peak alpha for the dominant layer (the hole's "high alpha" precedent)
  counterAlphaMul: 0.9,  // tintB's alpha as a fraction of tintA's — subordinate, so dir still reads
  spinRate: 1.7,         // rad/s the dominant layer turns at (x ed.dir)
  counterRateMul: 0.6,   // tintB's rate as a fraction of spinRate, opposite sign — slower, subordinate
  twirlFrac: 1.05,       // twirl art's on-screen diameter target, as a fraction of the eddy's r
  ringTint: 0xc9d4ff,    // pale indigo-white rim, ON the eddy's true r — the force boundary contract
  ringAlpha: 0.6,
  ringWidth: 3,
  pulseAmp: 0.08,        // subtle alpha breathing so a stationary eddy doesn't look static
  pulseRate: 3.0,        // rad/s
}

// Night-thunderstorm overlay (skies chapter, v5.6.18, render.js updateStorm): three cosmetic,
// pooled, world-space layers built on the CURRENT_VIS idiom above (pooled sprites, respawn in
// view, fade envelopes). windAngle/speed drive one shared wind vector so the ground shadows,
// the overhead clouds and the rain all lean the same way. Keep shadow/cloud alphas conservative
// — this sits over live gameplay (enemies, telegraphs) and must stay readable.
export const STORM_VIS = {
  windAngle: 2.35, // rad — shared gust direction (down-and-left); every layer drifts/falls along it
  shadow: {         // ground cloud-shadows: big dark blobs UNDER entities, dimming the floor
    count: 4,        // v5.13: 6 -> 4 (declutter)
    sizePx: 900,     // blob diameter, px
    sizeJitter: 0.35, // ± fraction randomising each blob's size so they don't read as one stamp
    speed: 34,       // px/s drift along windAngle
    tint: 0x05070c,
    alpha: 0.24,     // peak alpha at full fade-in — dims the floor, doesn't blacken it
    life: 26,        // s alive before fading out and respawning in view
    lifeJitter: 0.3,
    fadeIn: 3.5,
    fadeOut: 4.5,
    margin: 300,     // px past the viewport before a (huge) blob's center may respawn
  },
  cloud: {          // overhead parallax clouds: OVER everything, lag the camera (altitude cue)
    // v5.13: this is the only storm layer that draws ON TOP of the gameplay, so it is the only one
    // that can actually hide a threat. count 5 -> 3 and alpha 0.26 -> 0.15: still an altitude cue,
    // no longer a veil over the thing you are trying to read.
    count: 3,
    sizePx: 1050,
    sizeJitter: 0.4,
    speed: 14,       // px/s of the cloud's OWN drift, on top of the parallaxed camera offset
    tint: 0x2e3644,
    alpha: 0.15,     // translucent — sparse enough to still read enemies/telegraphs underneath
    life: 34,
    lifeJitter: 0.3,
    fadeIn: 4,
    fadeOut: 5,
    margin: 350,
    parallaxFactor: 0.3, // fraction of the camera's move this layer follows — <1 reads as distant
  },
  rain: {           // foreground rain streaks: plain screen-space wind-wrap, no world tracking
    count: 50,       // v5.13: 140 -> 50. 140 moving streaks over the whole viewport is the single
                     // largest count of animated objects in the chapter, and none of them means
                     // anything. 50 still reads as rain.
    speed: 950,      // px/s fall speed along windAngle
    lenPx: 26,
    widthPx: 2.2,
    tint: 0xaebdd0,
    alpha: 0.14,     // subtle — a haze of motion, not a whiteout
  },
}

// Lightning (skies chapter, v5.7.2, render.js): re-themes the EXISTING bombardment/artillery
// telegraph -> explode contract (run.bombs, untouched — see stepBombs/stepBombardment in sim.js)
// as an electric strike instead of the generic red bomb, plus purely cosmetic ambient lightning.
// Zero sim effect: every number below only feeds render.js draw calls and render-local timers.
export const LIGHTNING = {
  // Full-field white flash (render.js `lightningFlash`, a screen-space Sprite sitting just below
  // the red damage vignette so a real hit still visibly wins if both land the same frame). One
  // fade duration for both triggers; the peak alpha is what tells a real strike from ambient weather.
  flash: {
    strikeAlpha: 0.55,  // peak alpha when an actual bombardment/artillery shell lands
    fadeDur: 0.16,       // s from peak back to 0
  },
  // Telegraph re-skin (render.js redrawBombs, skies only): same fill-then-stroke circle as the
  // default red bomb telegraph, just electric-colored, plus a core ring that COLLAPSES toward the
  // strike point as the fuse burns down (a converging target, not a swelling one).
  // v5.10 (art direction spec §2 palette law 3 + §8 kill-list item 12): these two colours were
  // ELECTRIC ICE-BLUE (0x8fd8ff / 0xeaf9ff) and that exact pair is what render.js also reached for
  // when it drew the JET STRAFE lane (updateStrafeLocks) — "the dash telegraph for planes is the
  // same colour as everything" in the user's report, literally true and traceable to this object.
  // Ice blue-white is now reserved for SEARCHLIGHT LIGHT ONLY (SKIES_LIGHT.cone below); the sky's
  // own strike goes VIOLET, which nothing else in the chapter wears. Values are the spec's
  // (SKIES_FX.sky mirrors them for the new descent-vector drawer, which is the drawer that should
  // survive — this object is kept ONLY so the existing circle telegraph's alpha ramp keeps working
  // until that drawer lands, and must end up referenced by exactly ONE drawer, per the spec's §9
  // grep audit). Render-only, skies-only: no other chapter reads LIGHTNING at all.
  telegraph: {
    color: 0xc8b4ff,     // violet descent/impact colour — the sky is firing, and only the sky is violet
    coreColor: 0xffffff, // the collapsing "about to crack" core ring, now pure white (spec: brackets/core)
    baseFillA: 0.12,
    maxFillA: 0.32,
    baseRimA: 0.55,
  },
  // Detonation bolt for a REAL strike (render.js handleEvents' 'explode' case): a jagged vertical
  // polyline cracking down into the strike point, drawn through the elemental-shock-arc pool
  // (spawnArc/redrawArcs) so it gets that system's glow-then-core double stroke for free.
  strikeBolt: {
    dropPx: 560,          // how far above the strike point the bolt's top sits
    segments: 7,          // anchor points along the drop — the big zigzag's jaggedness
    jitterPx: 50,         // max lateral wobble per anchor, tapering to 0 at the strike point
    width: 11,            // glow-stroke width (the core stroke is a fixed fraction of this)
    color: 0xf4fbff,      // near-white core stroke (unchanged — the spec's bolt core is this exact value)
    glowColor: 0xb79bff,  // v5.10: was 0x8fd8ff (ice blue). Violet glow, matching the telegraph above
                          // and SKIES_FX.sky.boltGlow — a bolt and its own warning must share a hue
    dur: 0.22,            // s the bolt stays visible before fading
    alpha: 1,              // peak stroke alpha
  },
  // v5.13: the `ambient` block is DELETED along with render.js's updateAmbientLightning. It flashed
  // the whole field every 6-14s for an event that could not be acted on, and v5.10.1 had already
  // spent a third reserved hue on making it ignorable. `flash.ambientAlpha` above goes with it.
}

// Procedural Voronoi districts (skies chapter, v5.7.x, render.js + sim.js; grown from 4 types to 6
// by the v5.9 top-down region overhaul): a seeded ground map over world-XY so roaming any direction
// crosses downtown -> suburbs -> parks -> farms -> hills -> sea and back. districtAt/districtTintAt
// are pure functions of (x, y, run._districtSeed) — no RNG stream, no run mutation — so either side
// of the sim/render boundary can call them. floorTint is RENDER-ONLY (what actually reaches the
// floor sprites — render.js multiplies it in like every other chapter's single floorTint); weight
// sets how much of the map each type gets (districtCellType below).
// v5.9.1 bugfix: districtAt is now ALSO called from sim.js's streamObstacles, to pick a structure's
// `kind` from the district-appropriate subset (DISTRICT_STRUCTURE_KINDS, below STRUCTURE_KINDS)
// instead of the full list — fixes the reported "houses in the sea" bug. run._districtSeed's own
// doc (state.js) has the full case for why this is safe for the seeded test suite; short version:
// it's drawn once at createRun same as always, and sim reading an EXISTING value costs nothing from
// the shared Math.random stream at step time. districtTintAt (the floor-tint half) stays
// render-only — sim still never reads a floor color, and still never branches game LOGIC on district.
export const DISTRICTS = {
  // v5.11: the biome list the terrain generator classifies into (src/terrain.js BIOMES). `desert`
  // and `beach` are new — deserts because the playtest report asked for them by name, beaches
  // because a coastline with no shore reads as a colour boundary rather than as a coast, and the
  // generator now produces real closed coastlines worth marking.
  // v5.11 SEPARATED BY HUE, NOT BRIGHTNESS. downtown (0x717c88) and sea (0x53687c) composited to
  // #4d5764 and #3e4d5e — near-identical slate blues only 0.04 apart in luminance, so on the region
  // map a city was indistinguishable from a lake and only its street grid gave it away. The fix
  // cannot be more contrast: the whole palette is pinned inside a documented 0.06-0.09 effective
  // luminance band (see this table's note below) that enemy readability depends on. So they are
  // pulled apart in SATURATION instead — downtown goes neutral (R~=G~=B, which is what wet asphalt
  // under sodium light actually is), water goes properly blue. Same luminance band, unmistakable
  // difference.
  downtown: { floorTint: 0x78767c }, // neutral wet asphalt — the anchor district, now hue-free
  suburbs:  { floorTint: 0x9a8a72 }, // warmer, lighter grey-tan
  parks:    { floorTint: 0x5f7a5f }, // muted storm-lit green (the wet end of the moisture axis)
  sea:      { floorTint: 0x3d5f84 }, // storm blue, now the only strongly blue ground in the region
                                     // — also carries rivers, see terrainAt
  farms:    { floorTint: 0x7c8a52 }, // khaki-olive cropland
  hills:    { floorTint: 0x8a7a6a }, // warm heather-taupe moorland, on high ground
  desert:   { floorTint: 0x9c8560 }, // dry ochre — the arid end of the moisture axis
  beach:    { floorTint: 0xa39878 }, // pale wet sand, the strip between sea and land
  // NOTE: `weight` is gone. Weights were how the OLD generator decided a biome — an independent
  // weighted die roll per cell — and that is exactly the construction v5.11 replaced (see
  // terrain.js's header). Coverage is now a CONSEQUENCE of the terrain: how much desert exists
  // depends on how much of the moisture field falls below DESERT_MOIST, not on a number here.
  // Re-tune coverage in terrain.js's thresholds, and measure it with scripts/terrain-audit.mjs.
}

// How wide the floor tint blends across a biome boundary. Retained from the Voronoi era because
// render.js's edge markers (populateEdge) key off it, but it means something slightly different
// now: districtTintAt below is continuous EVERYWHERE by construction (it lerps on the raw
// elevation/moisture/urban fields rather than classifying and then blending between two cells), so
// this is the softness of the visible band, not a patch over a hard cut.
export const DISTRICT_BLEND_PX = 90

// Which biome (x, y) sits in this run (seed = run._districtSeed). Pure + deterministic. Thin
// re-export so every existing caller in sim.js/render.js keeps working unchanged — the generator
// itself now lives in src/terrain.js.
export function districtAt(x, y, seed) {
  return biomeAt(x, y, seed)
}

function lerpColorInt(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t)
}

// Smooth 0..1 ramp between two thresholds — the continuous stand-in for a hard `<` test.
function ramp(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// The floor tint at (x, y) — CONTINUOUS EVERYWHERE, and deliberately not "classify, then blend
// between the two nearest cells" the way the Voronoi version had to be. districtAt above is a hard
// classifier (a structure is a tower or it is not), but the FLOOR has no reason to be: elevation,
// moisture and urbanisation are continuous fields, so the colour is built by ramping along each of
// them in the same order the classifier tests them. There is no border to hide, because there is no
// border — a coastline is where the water ramp reaches 1, and the sand-to-water fade either side of
// it comes out of the same expression.
//
// Order is climate -> hills -> urban -> water, and water is last because it covers everything: a
// river crossing downtown is water, not a wet street.
export function districtTintAt(x, y, seed) {
  const D = DISTRICTS
  const elev = elevationAt(x, y, seed)
  const moist = moistureAt(x, y, seed)

  // climate axis: desert -> farms -> parks
  let c = lerpColorInt(D.desert.floorTint, D.farms.floorTint, ramp(DESERT_MOIST - 0.06, DESERT_MOIST + 0.06, moist))
  c = lerpColorInt(c, D.parks.floorTint, ramp(FOREST_MOIST - 0.06, FOREST_MOIST + 0.06, moist))

  // high ground
  c = lerpColorInt(c, D.hills.floorTint, ramp(HILL_LEVEL - 0.03, HILL_LEVEL + 0.03, elev))

  // the city, as two nested rings
  const urban = urbanAt(x, y, seed)
  c = lerpColorInt(c, D.suburbs.floorTint, ramp(SUBURB_URBAN - 0.06, SUBURB_URBAN + 0.10, urban))
  c = lerpColorInt(c, D.downtown.floorTint, ramp(DOWNTOWN_URBAN - 0.10, DOWNTOWN_URBAN + 0.06, urban))

  // shore, then water — including rivers, which are the ridged-noise channel terrainAt classifies
  // as sea. The river term has to be applied on the same footing as the coast or a river would
  // render as a hard-edged blue ribbon laid over the ground.
  // v5.12: THE TINT MUST AGREE WITH THE CLASSIFIER ABOUT WHERE WATER IS. The previous ramps reached
  // water colour well OUTSIDE terrainAt's own thresholds — the river term started turning blue at
  // 1.7x the channel width and only saturated at 0.6x, so a wide blue halo was painted over ground
  // that every other system correctly treats as dry land. Measured: 39.9% of the area read as blue
  // against a 33.3% water biome, and 32.5% of ALL ROAD AREA sat on blue-looking ground. That is not
  // a road drawn in the sea; it is the sea drawn under a road, and it is the same class of mistake
  // as the two-seed split — two systems answering the same question differently.
  //
  // Both water ramps now saturate essentially AT the classifier's own boundary and carry no colour
  // beyond it. The band immediately outside is a BANK, in the beach tint, mirroring what the coast
  // already does — which is also the thing rivers were missing entirely (they went from deep water
  // to dry khaki across one razor edge, with no shore at all).
  const shore = SEA_LEVEL + SHORE_BAND
  c = lerpColorInt(c, D.beach.floorTint, ramp(shore + 0.03, shore, elev))
  const lowness = Math.max(0, Math.min(1, (HILL_LEVEL - elev) / (HILL_LEVEL - SEA_LEVEL)))
  const riverEdge = RIVER_CORE + RIVER_MOUTH_GAIN * lowness * lowness
  const river = riverAt(x, y, seed)
  c = lerpColorInt(c, D.beach.floorTint, ramp(riverEdge * 2.4, riverEdge * 1.15, river))   // the bank
  c = lerpColorInt(c, D.sea.floorTint, ramp(riverEdge * 1.34, riverEdge * 0.92, river))    // the channel
  c = lerpColorInt(c, D.sea.floorTint, ramp(SEA_LEVEL + 0.009, SEA_LEVEL - 0.005, elev))
  return c
}


// ---- District SURFACES (v5.10 art direction, spec §4.5) — render-only, skies-only ---------------
// The district system shipped in v5.7.3 gives each district a floor TINT and nothing else, so six
// "different" regions are six colours of the same ground. What actually makes an overhead view read
// as a PLACE is a signature PATTERN per region — the thing you recognise in a satellite photo before
// you recognise anything else. One bake each (T.districtGround keeps its "bake white-alpha, let
// floorTint carry the hue" contract, so these are shape/geometry data, not colour data, EXCEPT where
// a `lit*` colour appears below).
//
// `lit*` COLOURS BYPASS THE FLOOR TINT. Chlorine-blue pool water, shipping-container red, fresh
// crosswalk paint: multiply those by a district floorTint and they turn to mud. render.js is
// expected to honour a `litTint: true` prop-kind flag (`s.tint = kind.litTint ? kind.tint :
// tintMul(..., floorTint)`) — see spec §4.5's last paragraph. Saturated accents are also the
// chapter's scarcest resource: the threats own saturation (SKIES_FX), so the ONLY saturated ground
// in the region is the container yard and a suburban pool.
export const DISTRICT_SURFACE = {
  // parks: today this district has NO T.districtGround entry at all and falls through to T.blotches
  // — the same four soft radial blobs the body/pond/garden chapters use (kill list §8.10, and one
  // of the "reusing too much" complaints, literally). MOWN STRIPES are the single most recognisable
  // overhead pattern that exists (nothing else in the world looks like a mown field from above) and
  // they are one bake. Angle comes from the field's own hashed row angle — reuse farmRowSnap's
  // shared-angle machinery so a park's stripes are coherent across cells instead of per-cell noise.
  parks: {
    // v5.13: 26 -> 32. Read by render.js's T.terrainTile.parks, whose bake reference is 256px, and
    // 256/32 = 8 — an EVEN number of bands, so the light/dark alternation meets itself across a
    // cell boundary. At 26 (9.85 bands) every cell edge was a visible phase break.
    stripePx: 32,             // band width — a real mower deck read, wide enough to survive minification
    stripeAlphaA: 0.10, stripeAlphaB: 0.20,   // alternating, white; the tint carries the green
  },
  // farms: keeps its furrows, gains the OTHER instantly-recognisable overhead farm shape — the
  // centre-pivot irrigation circle. A perfect circle in a field of straight rows is unmistakable.
  farms: {
    pivotRadius: 520, pivotAlpha: 0.18, pivotArm: true,   // on the `big` floor layer
    headlandPx: 34,           // turn-strip at field edges, where the tractor comes about
  },
  // sea: a CONTAINER YARD — tiny dense saturated rectangles against dark water. Highest
  // detail-density per line of code in the whole redesign, and the only place in the chapter where
  // hue does the talking. Hues are deliberately UNTINTED (litTint) and deliberately the primary
  // colours of real shipping lines: a tinted container yard is just a grey grid.
  sea: {
    yardCols: 4, yardRows: 9, boxW: 14, boxH: 9,
    boxHues: [0xc0392b, 0x2e86c1, 0xe0a800, 0x2e8b57, 0x8e44ad, 0xd35400], litTint: true,
    riprap: true,             // breakwater arm: a chain of angular boulder polys, NOT a smooth curve
    // Kill list §8.6: T.foam is currently `T.fx.trace_05` — the sea's breaking wave IS the POND's
    // current-streak sprite, reused again by populateEdge for coastlines. A real wave crest is two
    // parallel arcs and a speckle band; there is no excuse for it being a borrowed streak.
    crestArcs: 2, crestAlpha: 0.42, foamSpeckle: 22, foam: 0xdfe9f0, litTint2: true,
  },
  // downtown: a painted parking lot. Parked cars ALIGN TO THE STALL ANGLE — random rotation is the
  // loudest possible tell that props were scattered by an algorithm rather than placed by a city.
  downtown: {
    bayRows: 2, baysPerRow: 6, bayPitch: 8,
    paint: 0xd8d4c8, paintAlpha: 0.55, litTint: true,
    loadingBayHatch: true,
  },
  // hills: keeps T.contour, gains a switchback dirt track — the one man-made line in open moorland,
  // and a zigzag is the only shape that says "slope" on a camera with no horizon.
  hills: { trackColor: 0x6b5a44, trackSegments: 3, trackW: 7 },
  // suburbs: its lot furniture (driveway, lawn, hedge L, shed, deck, bins, pool) is baked INTO the
  // house structure itself rather than scattered as separate floor props — see SKIES_STRUCTURE_ART
  // below. A driveway that doesn't touch its house is worse than no driveway.
  suburbs: null,
}

// District SEAMS (spec §8, kill list item 11): populateEdge currently draws T.fence — a picket
// fence — at EVERY land/land district border, including the one between a farm and a moor. A seam
// is a chance to say what the two regions are; three seam kinds cost three bakes.
export const DISTRICT_EDGE = {
  hedge:  { color: 0x4e6640, lobes: 7, pitchPx: 26 },     // suburb/park seams
  wall:   { color: 0x9a9184, tickPx: 9, pitchPx: 14 },    // farm/hill seams — dry-stone, tick-row
  shore:  { riprap: true, surf: true },                   // any coastline — riprap + the new crest
  // Which seam a border gets, keyed by the two districts either side (order-independent; render
  // sorts the pair). Anything not listed falls back to `hedge` on land and `shore` against sea.
  pairs: {
    'parks|suburbs': 'hedge', 'downtown|suburbs': 'hedge', 'downtown|parks': 'hedge',
    'farms|hills': 'wall', 'farms|parks': 'wall', 'hills|parks': 'wall', 'farms|suburbs': 'wall',
  },
}

// ---- The darkening (spec §4.1) — STAGE 4, GATED ON MEASUREMENT, NOT WIRED IN --------------------
// The light layer (SKIES_LIGHT, below) only reads as light if the ground is dark. But the six tints
// above are already tuned to a documented 0.06-0.09 effective-luminance band (see DISTRICTS' comment)
// that keeps the three enemy silhouettes readable (jet 0xb6c4d2, heli 0x9cae66, tank 0xb3a374), and
// enemy readability is the one thing this chapter cannot lose. So the order is fixed and not
// negotiable: BUILD THE LIGHT LAYER AT TODAY'S TINTS FIRST, see how much of the effect comes free,
// and only then consider swapping DISTRICTS[x].floorTint for the value here and STORM_VIS.shadow.alpha
// (0.24) for STORM_SHADOW_ALPHA_DARK. Re-run `node scripts/obstacle-contrast.mjs` and re-verify enemy
// contrast BEFORE committing that swap; if the numbers refuse, keep the current tints and let the
// light carry all the contrast. The chapter survives losing the darkening. It does not survive
// losing enemy readability. Exported (rather than left in the doc) so the swap is a one-line data
// change with the audit numbers attached, not a re-derivation.
export const DISTRICT_FLOOR_TINT_DARK = {
  downtown: 0x5c6672, suburbs: 0x7d7160, parks: 0x4e6650,
  sea: 0x445666, farms: 0x677245, hills: 0x736659,
}
export const STORM_SHADOW_ALPHA_DARK = 0.16   // pairs with the above (STORM_VIS.shadow.alpha 0.24 today):
                                              // darker ground needs a lighter cloud shadow or the
                                              // floor goes to black and the shadows stop reading at all

// Roads (skies only) — RE-EXPORTED FROM src/terrain.js, where the generator now lives.
//
// v5.11 replaced what used to sit here: a GLOBAL axis-aligned Manhattan lattice, on its own seed
// (run._obstacleSeed), deliberately unaware of what it crossed. That design is the direct cause of
// the "roads are 10 meters long" playtest report. Because the lattice knew nothing about districts,
// it carved streets through open sea and bare moorland, so render.js could only cope by REFUSING TO
// DRAW pavement outside a small set of urban districts (ROAD_VISIBLE_DISTRICTS) — and since a
// district cell was 600px, a street appeared for a few hundred px, vanished, and reappeared. The
// road was never short; it was a continuous infinite line being shown in 600px slices.
//
// Roads are now OWNED BY CITIES and share the world seed with everything else, which removes the
// problem at the source rather than hiding it: a street exists only inside a city's own radius, laid
// out in that city's own rotated frame, so one city is one continuous grid that ENDS where the city
// ends. Nothing has to gate the drawing, so nothing can chop it up. Highways run between
// neighbouring city centres, which is what puts long roads in the countryside that go somewhere.
//
// The returned shape is unchanged apart from an added `kind` ('street' | 'highway'), so every
// existing caller — sim.js keeping buildings off the carriageway, render.js's centreline resolution
// and decals — works verbatim.
export { roadAt } from './terrain.js'

// Widths, re-exported under their historical names so render.js's bakes and ROAD_CELL keep
// resolving. STREET_* are the terrain module's own names for the same quantities.
export const ROAD_MINOR_WIDTH = STREET_MINOR_WIDTH
export const ROAD_MAJOR_WIDTH = STREET_MAJOR_WIDTH

// The rest of the terrain surface sim.js/render.js/state.js need, re-exported through config.js so
// the "only config.js is imported by both sim and render" rule in CLAUDE.md still holds literally.
export {
  nearestCity, cityAt, blockSnap, parcelAt, PARCEL, pickWorldSeed,
  terrainAt, elevationAt, urbanAt, riverAt, clumpAt, BIOME_BUILD_DENSITY, CITY_GRID,
  STREET_SPACING_MAJOR_EVERY, HIGHWAY_WIDTH,
} from './terrain.js'


// ---- Road ART (v5.10 art direction, spec §4.2-§4.3) — render-only, skies-only -------------------
// "A road is a dashed yellow line on grass. It reads as a wireframe, not a place." The fix is not
// more lines, it is a MARKING FAMILY plus VARIATION ALONG THE STREET, split across three mechanisms
// for one blunt geometric reason:
//
// T.roadMinor/T.roadMajor are stamped by populateRoad with a NON-UNIFORM scale
// (`scale.set((cell*1.6)/ref, (half*2)/ref)` — x factor 0.48, y factor 0.34 minor / 0.62 major).
// ANYTHING baked into the carriageway tile is stretched by a different factor on each axis AND by a
// different factor per road class: circles come out as ovals, zebra bars come out at the wrong pitch,
// and the pitch is wrong by a DIFFERENT amount on a minor street than on an avenue. So the tile only
// ever carries shapes that survive that (bands and lines parallel to the axes, pre-compensated), and
// everything with a shape — manholes, patches, arrows — becomes a separate, UNIFORMLY scaled decal.
export const ROAD_PAINT = {
  // Baked INTO the carriageway tile (stretched; pre-compensate the pitch by the factors above).
  asphaltMinor: 0x33383f, asphaltMajor: 0x2b2f36,   // unchanged from what ships today
  kerb: 0x4a515b, kerbW: 2,                          // both long edges — the single strongest "this
                                                     // is a built road, not a painted strip" cue
  sheen: 0x8fa8c4, sheenAlpha: 0.10,                 // wet crown reflection down the centreline: a
                                                     // STATIC overhead reflection of the storm sky.
                                                     // ponytail: no dynamic sheen sprite — the
                                                     // full-field lightning flash already whitens it,
                                                     // and a per-road-cell additive sheen would be
                                                     // ~1000 extra sprites at ROAD_CELL = 30. Revisit
                                                     // only if the road floor layer is ever coarsened.
  polish: 0x22262c, polishAlpha: 0.25, polishAt: 0.45,  // two darker wheel-polish bands at ±0.45 of
                                                        // the half-width — where tyres actually run
  centreline: 0xd8d4c8, centrelineAlpha: 0.55,       // minor streets: dashed white
  doubleYellow: 0xdccf86, doubleYellowGap: 4, doubleYellowW: 2,   // avenues: two lines, 4px apart
  stretchX: 0.48, stretchYMinor: 0.34, stretchYMajor: 0.62,       // the known constant aspect to
                                                                  // pre-compensate against (above)
}

// The decal layer: `{ name: 'roadDecal', cell: 160, chance: 1.00, populate: populateRoadDecal }`,
// self-gating on roadAt + render.js's ROAD_VISIBLE_DISTRICTS exactly like populateRoad. ONE decal
// per cell, picked by cellHash(i, j, salt) from `kinds`. VARIATION ALONG A STREET IS WHAT STOPS A
// ROAD READING AS A WIREFRAME; one stamped tile repeated forever is what got us here.
export const ROAD_DECAL = {
  cell: 160, chance: 1.00,
  kinds: {
    manhole: { color: 0x3a3f47, r: 7, rimTicks: 6 },
    patch:   { color: 0x3d434b, sides: 5, px: 26 },     // irregular repair polygon, never a rectangle
    drain:   { color: 0x2a2f36, slotW: 11, slotH: 3, pairGap: 7 },  // kerb slots, at the kerb line
    arrow:   { color: 0xd8d4c8, alpha: 0.34, lenPx: 30 },           // faded painted turn arrow
  },
}

// Junctions (spec §4.3) — ENUMERATED, NOT STAMPED. ROAD_CELL is 30 and ROAD_SPACING is 480, so a
// junction is ~16 road cells across on each axis: "stamp a crosswalk when onV && onH" lays a dozen
// overlapping zebras on one junction. Instead render.js recovers the per-seed road grid origin ONCE
// per run (roadAt's onV depends only on x and onH only on y, so <= `latchProbes` probes along each
// axis at `latchStepPx` finds it), after which junction centres are exactly (ox + m*ROAD_SPACING,
// oy + n*ROAD_SPACING) — <= 6 on a 1280x720 view. Each gets ONE composite sprite from a pool of
// `pool`, drawn from four variants baked AT TRUE WORLD SIZE so they are never scaled at all (which
// is what lets a junction carry circles and zebra pitch that the stretched carriageway tile cannot).
export const ROAD_JUNCTION = {
  latchStepPx: 6, latchProbes: 80, pool: 8,
  variants: ['minorMinor', 'minorMajor', 'majorMinor', 'majorMajor'],
  zebraBars: 7, zebraColor: 0xd8d4c8, zebraAlpha: 0.55, zebraWornAlpha: 0.30, zebraWornEvery: 3,
  stopBarW: 3, manholes: 2, arrowsOnMajor: true,
  stalledCar: 'majorMajor',   // a sedan slewed across the box on the biggest junctions — everyone
                              // fled, and one abandoned car says that better than any effect. It is
                              // also the ONLY survivor of the cut "emergency vehicles" proposal
                              // (spec §11): a driving vehicle needs a pathfinder over roadAt, which
                              // is a point query with no graph.
}

// R1 — VALIDATE TABLE-BACKED POINTERS AT THE CONSUMER (docs/superpowers/specs/2026-08-04-cross-
// device-save-sync-tech-strategy.md §2.4). meta.chapter is a POINTER INTO CHAPTERS, not data, and
// loadMeta deliberately never repairs it (an old build saves on every chapter switch, run end and
// purchase, so a load-time repair would be written straight back over a newer save). So every
// consumer resolves it in memory instead, through this one helper — createRun (state.js) and
// main.js's onPlay/onDifficulty. Sharing it matters: if the run degrades to 'body' while onPlay
// still reads the ladder of a chapter this build does not have, the player is launched into The
// Body at a level they never unlocked there, and endRun credits that win to body's ledger.
// Object.hasOwn, not a truthiness test: '__proto__'/'constructor'/'toString' are all truthy on any
// object literal and would otherwise pass as chapter ids. Membership is tested against CHAPTERS and
// NOT against CHAPTER_ORDER — 'blank' is a real chapter that lives outside the order by design, and
// an order check would silently turn every Blank run into a body run.
export const resolveChapterId = (id) => (Object.hasOwn(CHAPTERS, id) ? id : CHAPTER_ORDER[0])

export const nextChapter = (id) => CHAPTER_ORDER[CHAPTER_ORDER.indexOf(id) + 1] ?? null
// Date-seeded over SHIPPED chapters (CHAPTER_ORDER); reuses the FNV-1a + mulberry32 helpers
// dailyMutators already uses (below), with a distinct salt ('chapter') so the two daily picks
// are independent draws from the same date key.
export const dailyChapter = (dateKey) => CHAPTER_ORDER[hashString(dateKey + 'chapter') % CHAPTER_ORDER.length]

// ---- Chapter behavior flags (v5.0 task 3, see sim.js) -------------------------------
// Maps a roster entry's `archetype` (config.js CHAPTERS[id].roster, see above) onto the
// existing spawn-type keys (ENEMIES above) that drive its base hp/speed/dmg/radius/xp —
// archetypes are just the theme-agnostic vocabulary spawnEnemy uses to pick a roster skin.
export const ARCHETYPE_TYPE = { normal: 'drone', tank: 'tank', fast: 'wisp' }
// The inverse (spawn type -> archetype), used by spawnEnemy to pick which roster entries a
// given wave-table spawn may wear. Do NOT index ARCHETYPE_TYPE by a type to get this: it
// silently "worked" for tank (its own inverse) and fell through to 'normal' for drone (right
// by luck) and wisp (WRONG) — which made every 'fast' roster entry unreachable by natural
// spawning until v5.5.
export const TYPE_ARCHETYPE = Object.fromEntries(Object.entries(ARCHETYPE_TYPE).map(([a, t]) => [t, a]))

// ---- The Beyond: the lane (v5.18, Space Invaders x survivors) --------------------------------
// See CHAPTERS.beyond.lane for how the auto-scroll is implemented (the player advances, the camera
// already follows). Everything below is gated on that flag and inert in every other chapter.
//
// The player's FORWARD speed is deliberately its own constant rather than p.speed: the scroll rate
// has to stay predictable and legible, so move-speed upgrades buy you a faster STRAFE (which is the
// skill) and never a faster scroll (which would just mean meeting more invaders per second).
// THE SCROLL MUST BE SLOWER THAN THE SWARM. This was 190 in rev.1 and it silently killed the
// chapter's entire progression loop: every enemy in the game is slower than that (ENEMIES.drone 90,
// wisp 165, tank 55), so a player advancing at 190px/s simply outran the seeking half of the roster
// forever. They never caught up, never got killed, never dropped a gem — measured XP after 50s was
// 1. The Vampire Survivors half of this merge only exists if the swarm can reach you, so the scroll
// has to sit UNDER the slowest chaser that matters, with room to spare.
// It also reads better: a slow forward drift against a quick strafe is the Space Invaders feel,
// where all your agility is sideways.
export const LANE_SCROLL_SPEED = 70      // px/s the player advances up the lane, always
export const LANE_STRAFE_MUL = 1.25      // strafe is a touch quicker than base speed — it is all you have

// THE LANE HAS WALLS, and this is the correction that makes the chapter playable at all. Rev.1 had
// an unbounded lane with ranks 900px wide centred on the player: on a phone (viewRadius ~465) most
// of every rank was off-screen, so ~65% of all damage taken came from invaders the player never saw,
// and measured survival was 15-18 seconds. Space Invaders has walls for exactly this reason — the
// formation spans the play area, the play area is what you can see, and every threat is therefore
// legible. The lane is centred on world x = 0 and the player is clamped to it.
// laneHalfWidth() shrinks the lane on a narrow viewport so a rank is ALWAYS fully visible: the
// guarantee "you can see everything that can hurt you" outranks a fixed world width.
export const LANE_HALF_W = 430           // px, half the lane's width at full size
export const LANE_VIEW_FRAC = 0.9        // lane never exceeds this fraction of the viewport radius
export const laneHalfWidth = (viewRadius) => Math.min(LANE_HALF_W, viewRadius * LANE_VIEW_FRAC)

// march: the Space Invaders half of the roster. The enemy IGNORES the player entirely and advances
// DOWN the lane in rank at its own speed, swaying side to side on a shared phase so a wave reads as
// one marching block rather than a scatter of individuals. It never seeks, never re-aims, and never
// breaks formation — dodging a rank is always possible and always your fault if you don't.
// Slow. The whole menace of a Space Invaders rank is that you can SEE it coming and still have to
// solve it — a fast descent is just a wall arriving. 0.35 of drone speed is ~31px/s of descent,
// which against the player's own 70px/s advance closes at ~100px/s: about eight seconds from the
// moment a rank crosses the top edge to the moment it reaches you.
export const MARCH_SPEED_MUL = 0.35      // fraction of the enemy's own speed, moving down the lane
export const MARCH_SWAY_PX = 46          // px of side-to-side shuffle amplitude
export const MARCH_SWAY_RATE = 1.1       // rad/s of that shuffle
// Ranks also converge on the player sideways, at this fraction of their march speed (~17px/s for a
// drone). Deliberately far below the player's own strafe: ignore a rank and it drifts onto you,
// commit to a gap and you still beat it there. Do NOT raise this toward 1 — full homing re-centres
// every rank on the player, which is rev.1's mistake documented under LANE_SPAWN_MUL: the gaps stop
// meaning anything and strafing stops being a decision.
export const MARCH_HOME_MUL = 0.55

// Formation waves (stepFormations): a rank of `march` enemies spawned ahead of the player, across
// the lane, on a cadence. Rows arrive as blocks so the screen reads as ordered ranks rather than a
// stream. Wave size grows with run time via the ordinary spawn-rate curve, not a separate ramp.
// A rank spans the LANE, not a fixed pixel width, so it always fits the screen and its columns
// always sit at the same world x. That second property is what makes strafing a decision: the rank
// is a fixed set of lanes to thread, not a wall that follows you. Rev.1 centred every rank on the
// player's own x, which meant strafing changed nothing about what arrived.
// 3.4s in rev.1 delivered 6 invaders every 3.4s (1.8/s) against a starter weapon that clears roughly
// 1/s — so the line was mathematically unholdable from second zero and 74 of 102 invaders leaked in
// the first minute. 5s is the cadence a starting loadout can actually contest.
// The lane runs TWO spawners at once — ordinary ring spawning (redirected to arrive from ahead)
// plus these ranks — and it funnels both into a corridor ~860px wide instead of a full ring around
// the player. At the shared rate that is roughly triple the density per unit of frontage, i.e. a
// wall you cannot thread. The ordinary stream yields to make room for the formation, which is the
// half that gives this chapter its identity.
// v5.19: 0.4 played too thin — the lane read as empty between ranks. Measured as raw spawn pressure
// (weapons stripped so nothing dies, 10 seeds, first 60s), this knob and FORMATION_INTERVAL together
// move it: 0.4/5.0 = 95 enemies/min, 0.5/4.6 = 114, 0.55/4.4 = 118, 0.6/4.2 = 128. 0.55/4.4 is +24%
// over the old pair. 0.6 was measurably past the point where a weak build stops keeping up and the
// alive count runs away to MAX_ALIVE, which is the unthreadable wall the paragraph above describes.
export const LANE_SPAWN_MUL = 0.55       // ordinary (non-rank) spawning rate in the lane

// Contact hurts LESS in the lane, and this is a fairness rule rather than a difficulty knob.
// Measured over 60s of play: 83% of all damage taken (236 of 283) was head-on CONTACT, against 7
// from leaks and 40 from DoT. That ratio is a property of the movement mode, not of the tuning — in
// every other chapter you dodge a body on two axes, whereas here you are driven forward at a fixed
// rate into enemies coming the other way and may only move sideways. Charging the free-roam contact
// price for a collision the player has one axis to avoid is the same unfairness the skies pass fixed
// by making aircraft crushable; this is the lane's version of that answer.
export const LANE_CONTACT_MUL = 0.4      // enemy contact damage multiplier in the lane

// Where the player sits on screen, as a fraction of viewport height. 0.5 is centred (every other
// chapter). 0.8 puts them near the bottom with four fifths of the screen ahead of them, which is
// the Space Invaders frame: you at the bottom, everything descending toward you, and enough warning
// to actually choose a gap. A centred camera spends half the screen on space already flown through.
export const LANE_CAMERA_FRAC = 0.8
export const FORMATION_INTERVAL = 4.4    // s between ranks (5.0 left visible dead air between waves)
// ponytail: density is two knobs (this + LANE_SPAWN_MUL) tuned as a pair against one measured
// number. If a third source of lane pressure ever lands, measure the trio, don't add a third knob.
export const FORMATION_COLS = 6          // invaders across a rank, spread over the full lane width
// Ranks enter from just beyond the TOP EDGE, derived from the viewport rather than fixed, so on
// every device a rank appears at the edge of sight and descends the full screen. A fixed number
// pops ranks into existence mid-screen on a tall display and wastes the warning on a short one.
// The player sits at LANE_CAMERA_FRAC of the viewport height, so the distance from them to the top
// edge is that fraction of the view; viewRadius is the half-diagonal, hence the 1.5 fudge plus a
// margin. Verified by eye: ranks fade in above the top edge, never inside it.
export const FORMATION_AHEAD_MUL = 1.5   // x run.viewRadius, the distance ahead a rank materialises
export const FORMATION_AHEAD_MIN = 700   // px floor, so a tiny viewport still gets real warning
export const FORMATION_ROW_PX = 120      // px between rows when a wave brings more than one

// The line. An invader that gets PAST you has, in this chapter's terms, got through — it costs you
// health and leaves. This is what makes strafing to intercept matter instead of simply outrunning
// everything, and it is the one place the lane departs from a normal survivors chapter, where an
// enemy behind you is merely an enemy behind you.
// LANE_LEAK_DMG was 4 in rev.1 and that was lethal by construction, for a reason that had nothing
// to do with the number: stepLeaks called hurtPlayer once per leaked enemy with no invulnerability
// gate (hurtPlayer SETS p.invuln but does not CHECK it — the check lives in stepContactDamage), so
// a rank arriving together removed 7x4 = 28 HP in a SINGLE FRAME out of 100. The gate is the real
// fix; 2 is what the number should have been anyway now that a whole rank is visible and dodgeable.
export const LANE_LEAK_BEHIND_PX = 260   // px behind the player at which a marcher counts as through
export const LANE_LEAK_DMG = 1           // HP lost per invader that gets through (invuln-gated, see stepLeaks)

// ---- Repulsion (v5.21, lane chapters — gated on CHAPTERS[chapter].lane) -------------------------
// The lane's ANSWER to its own constraint. Strafe-only movement means a rank that converges on your
// column while another sits beside it is a situation with no positional answer — you cannot back
// off, because the chapter drives you forward at a fixed rate. Repulsion is that answer: an active,
// cooldown-gated shove that buys space you cannot walk to.
// It pushes and STUNS rather than damaging, deliberately. Damage would make it a second weapon
// competing with the build; space is the thing the lane actually denies you, so space is what it
// gives back. stunT is the existing status (sim.js stepEnemyMovement checks it above every behavior
// flag, and knockback still carries a stunned body), so a shoved rank keeps sliding after the stun.
// It does NOT move asteroids. Rocks are terrain you avoid; enemies are what you shove INTO them.
// Keeping the two apart is what makes the pair a combo instead of one button that solves everything.
export const REPULSE_CD = 6.0            // s between uses — long enough that it answers ONE bad rank
export const REPULSE_RADIUS = 340        // px, generous: it must clear a full FORMATION_COLS rank
export const REPULSE_FORCE = 880         // px/s of knockback at the centre, falling off linearly
export const REPULSE_STUN = 0.55         // s of stun on top, so the shove reads as a stagger

// ---- Asteroids (v5.21, lane chapters — gated on CHAPTERS[chapter].lane) ------------------------
// Drifting rock that hurts EVERYONE. It is the lane's only neutral party: it damages the player on
// contact (so it is a thing to avoid) and grinds enemies that overlap it (so it is a thing to aim
// them at, with REPULSE above). Not destructible by weapons — a rock you can shoot is just an enemy
// with extra steps, and the point is that some of the screen is not solvable by damage.
// Damage to enemies ticks on ROCK_TICK rather than per-frame: the same cadence the DoTs use, so a
// rock grinding a rank emits a readable string of hits instead of 60 fractional ones a second.
export const ROCK_INTERVAL = 3.4         // s between rocks
export const ROCK_MAX_LIVE = 5
export const ROCK_MIN_R = 34
export const ROCK_MAX_R = 70
export const ROCK_SPEED = 155            // px/s down the lane — faster than a rank, so it overtakes
export const ROCK_DRIFT_X = 46           // px/s of sideways drift, so they never fall in clean columns
export const ROCK_SPIN = 1.3             // rad/s of tumble (render only)
export const ROCK_SPREAD_MUL = 1.15      // spawns slightly WIDER than the lane, so some pass you by
export const ROCK_DMG = 10               // HP to the player on contact (invuln-gated)
export const ROCK_TICK = 0.15            // s between grind ticks on overlapping enemies
export const ROCK_TICK_DMG = 16

// latch (e.g. body's antibody): on contact the enemy applies a move-speed debuff to the
// player then dies (spends itself) instead of dealing normal contact damage — see
// stepContactDamage in sim.js.
export const LATCH_SLOW_T = 0.9    // s, duration of the player's movement-speed debuff
export const LATCH_SLOW_MUL = 0.55 // player move speed multiplier while run.player.slowT > 0

// split (e.g. pond's amoeba): on death, spawns children at reduced hp/radius; children never
// re-split (see e._splitChild in sim.js's dealDamage death branch / spawnSplitChildren).
export const SPLIT_CHILD_COUNT = 2
export const SPLIT_HP_FRAC = 0.45     // child hp/maxHP, as a fraction of the parent's maxHP
export const SPLIT_RADIUS_FRAC = 0.7  // child radius, as a fraction of the parent's radius

// weave (v6.6.29, undergrowth's centipede — owner directive, see stepEnemyMovement's last branch):
// a serpentine lateral drift laid ON the plain seek. It exists because v6.6.28 deleted the chapter's
// dartRat ("mice should not jump"), and the toad is a `tank` that WAVE_TABLE cannot spawn before
// t=140 — so the first 140s of a 300s run, nearly half of it, was two enemies walking in perfectly
// straight lines. The centipede owns ~35% of the 60-140s window and already has 6 baked slither
// frames to sell the motion, so the rhythm goes there.
// Expressed as a ROTATION of the heading, not as extra displacement: the enemy still closes at
// exactly e.speed, so this buys back path variety without buying back pressure. And it is
// deliberately NOT a burst — a weave is unambiguously a walk, which is the owner's whole constraint,
// and it needs no telegraph precisely because nothing about it is sudden.
export const WEAVE_AMP = 0.55   // rad, peak deviation of the heading from straight-at-you
export const WEAVE_FREQ = 3.1   // rad/s of the weave's own sine — about one full S every 2s
// dashBurst (e.g. pond's tadpole): alternates idle (slow) <-> dash (fast) toward the
// player, both still along the normal seek direction — see stepEnemyMovement in sim.js.
export const DASH_IDLE_T = 1.1        // s, idle phase duration
export const DASH_T = 0.5             // s, dash phase duration
export const DASH_IDLE_SPEED_MUL = 0.4
export const DASH_SPEED_MUL = 2.6

// Pools (run.pools, see state.js): a shared array of {x, y, r, t, dps} zones that damage the
// PLAYER only (dot-flagged 'hurt' events), ticked every STATUS_TICK like other DoTs, and
// removed once t <= 0. Fed by two elite flags below.
// acidPool (body's pill elites): a pool left where the elite died.
export const ACID_R = 70
export const ACID_DUR = 3
export const ACID_DPS = 8
// soapTrail (pond's soap-bubble elites): pool nodes dropped periodically while alive.
export const SOAP_INTERVAL = 0.35 // s between dropped trail nodes
export const SOAP_R = 26
export const SOAP_DUR = 2.5
export const SOAP_DPS = 6

// Obstacles (run.obstacles, see state.js/createRun): circular colliders that push the player
// and enemies out (never projectiles), rejection-sampled from each chapter's `obstacles` config
// ({count, minR, maxR, minDist}, minDist measured from the run's origin) at createRun. These two
// are generic placement tunables shared by every chapter's obstacle field (not per-chapter data):
// v5.6.13: obstacles STREAM with the player instead of being seeded once around the origin — the
// old field left the entire world beyond OBSTACLE_FIELD_RADIUS obstacle-free ("obstacles are only
// in the beginning zone", user). sim.js's streamObstacles rolls one obstacle per OBSTACLE_CELL
// grid cell from a pure hash of (cell, run seed): deterministic per run, so walking away and back
// finds the same rock; no RNG stream is consumed (seeded tests stay stable). The chapter config's
// `count` keeps its old meaning — expected obstacles within the old origin field — and is
// converted to a per-cell probability, so density matches what the origin field used to feel like.
export const OBSTACLE_FIELD_RADIUS = 900       // px, the density reference area (and wells' scatter radius — v6.5: traps stream instead, see signature.traps)
export const OBSTACLE_CELL = 420               // px, streaming grid cell — at most one obstacle per cell
export const OBSTACLE_STREAM_RADIUS = 1400     // px, cells within this of the player materialize (beyond any screen edge)
export const OBSTACLE_DROP_RADIUS = 1900       // px, obstacles beyond this are dropped (hysteresis vs pop-in churn)
// v6.7.13: OBSTACLE_MIN_GAP removed. Its only consumer was the wells' scatterField spacing, and v6.5
// moved traps to streaming (see signature.traps) — it had been exported with no reader ever since.
export const OBSTACLE_PLACEMENT_ATTEMPTS = 200 // rejection-sampling attempts per entry (traps/wells scatterField)
// Per-chapter override of the streaming grid cell above (OBSTACLE_CELL) — absent everywhere except
// skies (v5.8 kaiju redesign): see CHAPTERS.skies.obstacles.cell and sim.js's streamObstacles,
// `cs = cfg.cell ?? OBSTACLE_CELL`. NOTE `count` is a density reference over OBSTACLE_FIELD_RADIUS
// and is invariant under cell size by construction (streamObstacles' `prob` formula) — shrinking
// `cell` alone changes NOTHING; a smaller cell needs a bigger `count` to actually read denser.

// Structure kind (v5.8 kaiju redesign; grown 4 -> 6 by the v5.9 top-down region overhaul): a purely
// cosmetic classification stamped on every streamed obstacle entry (run.obstacles[i].kind), derived
// from obstacleCellHash(i, j, seed, 4) — a FIFTH salt on the same pure hash that already picks the
// cell's position/radius (sim.js). Sim itself never branches on `kind` (crushing/pushing treat every
// obstacle the same); render.js just maps kind -> a sprite.
// v5.9.1 bugfix ("houses appear in the sea", playtest report): kind used to be picked UNIFORMLY
// across this entire list regardless of where the cell actually sat, so a downtown tower and a sea
// pier were equally likely to land in the middle of the ocean. Skies (the only chapter with a
// district map — run._districtSeed, see its doc in state.js) now picks from
// DISTRICT_STRUCTURE_KINDS[district] instead, below — see streamObstacles in sim.js. Every OTHER
// chapter (_districtSeed always null there) still picks uniformly across this full list, unchanged.
// `kind` itself is still stamped for every chapter's obstacles, not just skies' (the hash is free,
// no RNG stream, no branch cost worth gating) — only the SUBSET it's drawn from is district-gated.
// v5.9: adding barn/silo reshuffles which roll maps to which kind for EVERY existing cell in EVERY
// chapter (Math.floor(kindRoll * STRUCTURE_KINDS.length) now divides by 6, not 4) — this is fine:
// `kind` was never asserted against a specific literal value anywhere (grep confirms; the closest
// is test/sim-test.js's run CC.d, which checks kind is STABLE per (cell, seed) — its OTHER
// assertion, that kind is independent of _districtSeed, is exactly the bug fixed above, so that
// specific assertion no longer holds for skies as of v5.9.1), and no other chapter reads o.kind at
// all (only skies sets CHAPTERS[x].crush/render.js's district-skin lookup, both skies-only). Run
// `npm test` after any STRUCTURE_KINDS edit regardless — test/sim-test.js's run DD.d pins this
// array's LENGTH at exactly 6 (a tripwire against silently shrinking the ladder), so a real new
// kind needs that test updated by whoever owns test/; this file alone can't grow the vocabulary.
export const STRUCTURE_KINDS = ['tower', 'house', 'tree', 'pier', 'barn', 'silo']

// Structure kind × district (v5.9.1 bugfix, see STRUCTURE_KINDS' comment above): which kinds a
// structure may roll INSIDE a given DISTRICTS type, so a district actually reads as itself — towers
// downtown, houses in the suburbs, no land buildings poking out of the sea. parks/hills share
// 'tree' (both read as open, unbuilt land — see render.js's STRUCTURE_SKINS for how hills still gets
// its OWN silhouette without a new kind); farms gets two silhouettes (barn/silo) so a farm belt
// doesn't read as monotonous. Consulted by sim.js's streamObstacles ONLY when run._districtSeed is
// set (skies today, via CHAPTERS[chapter].render.districts — see that field's doc in state.js for
// why sim reading it is safe). Every DISTRICTS key should have an entry; streamObstacles falls back
// to the full STRUCTURE_KINDS list if one is ever missing (defensive, not expected in practice).
export const DISTRICT_STRUCTURE_KINDS = {
  downtown: ['tower'],
  suburbs:  ['house'],
  parks:    ['tree'],
  hills:    ['tree'],
  sea:      ['pier'],          // no land buildings — sea reads as sea, not a bald patch of ocean
  farms:    ['barn', 'silo'],
  // v5.11 biomes. A desert gets the same lone outbuildings farmland does, at a twelfth the density
  // (BIOME_BUILD_DENSITY, terrain.js) — an arid region reads as arid because it is EMPTY, so the
  // few things in it should be recognisable rather than novel. A beach gets nothing but the
  // occasional pier: it is a strip you cross, and anything built on it would block the coastline
  // read that the beach exists to provide.
  desert:   ['barn', 'silo'],
  beach:    ['pier'],
}

// How far a city building's CENTRE sits from the street centreline, on top of its own radius
// (sim.js streamObstacles -> blockSnap). Half a minor street is 15px, so this leaves roughly a
// 25px pavement between kerb and wall — enough for the building to read as fronting the street
// rather than standing in it, without opening a gap that makes the block look abandoned.
export const STRUCTURE_SETBACK = 40

// Per-kind collider radius (v5.9.2, px) — THE fix for the "the fuck is this?" bug report's headline
// cause: a tower used to be drawn at PROP_SCALE.tower (134-172px) around a 10-28px collider rolled
// from one chapter-wide CHAPTERS.skies.obstacles.minR/maxR band shared by every kind, so a
// max-radius house could out-collide a min-radius tower — visible structures overlapping while
// their colliders sat far apart, which IS the reported soup of blobs. sim.js's streamObstacles now
// rolls a structure's `o.r` from THIS table (keyed by the same `kind` DISTRICT_STRUCTURE_KINDS
// picks), only for the chapter that actually has per-kind structures (run._districtSeed != null,
// skies today — same gate streamObstacles already uses for kind subsetting); every other chapter's
// obstacles keep rolling from their own chapter-wide obstacles.minR/maxR, untouched.
// render.js draws each structure proportional to o.r again (the pre-existing `o.r * 1.9`/`o.r * 2.0`
// idioms) instead of an absolute PROP_SCALE target — see PROP_SCALE's own doc below for why that
// table is floor-decor-only now. Bands stay small on purpose: the whole point of the v5.8 kaiju
// redesign is a player BIGGER than the city, not a city of skyscrapers — tower is still merely "the
// largest structure in a field of small ones," not large in absolute terms.
// CHAPTERS.skies.obstacles.minR/maxR are kept as the overall [min, max] across every band below
// (8 and 32) — test/sim-test.js's run CC.c3 reads .minR directly to size a synthetic structure, and
// sim.js's streamObstacles uses .maxR as the conservative worst-case radius for position-jitter
// slack BEFORE a cell's kind (and thus its real band) is known — see that function's comment.
export const STRUCTURE_RADIUS = {
  tree:  [8, 13],   // parks/hills — a scattered trunk/boulder accent, not a building
  house: [11, 16],  // suburbs
  pier:  [11, 16],  // sea — same tier as house, a dock structure, not a skyscraper
  barn:  [16, 22],
  silo:  [16, 22],  // same tier as barn
  tower: [21, 32],  // downtown — the largest structure in the field, not a real skyscraper
}

// PROP_SCALE — the single source of truth for a FLOOR-DECOR prop CLASS's absolute on-screen
// footprint, in px (v5.9 top-down region overhaul). Fixes the reported "cars bigger than houses"
// bug: render.js's prop tables mixed TWO sizing systems — `scale: [min,max]` (a multiplier on each
// texture's OWN arbitrary baked size) and `size: [min,max]` (absolute px) — with nothing enforcing
// that one class's scale range times its baked size couldn't exceed another's. Concretely: T.car is
// baked from TRAFFIC_CAR_LEN = 150 (below) and drawn at scale [0.55, 0.75] = 82-112px; T.house is
// hand-drawn at 48px baked and drawn at scale [0.9, 1.4] = 43-67px — a car outsizing a house by up
// to 2x, because the two scale ranges were tuned independently against two unrelated baked sizes.
// render.js is expected to look a class up here and fit its baked texture to an ABSOLUTE px target
// instead — ordering is then enforced by construction (disjoint bands), not by every prop table's
// author independently getting scale-times-bake-size arithmetic right.
//
// v5.9.2: this table is FLOOR DECOR ONLY (FLOOR_LAYERS' big/mid/detail populate callbacks below —
// bushes, litter, parked cars, crop rows, ...) — it does NOT size the crushable structures a chapter
// streams into run.obstacles (o.r). It used to (render.js's syncObstacles read PROP_SCALE[o.kind] to
// pick a structure's draw size, independent of its actual collider radius o.r), and that was exactly
// the "the fuck is this?" bug report's headline cause: a tower drawn at this table's 134-172px band
// around a 10-28px collider, so visible structures overlapped while their colliders sat far apart.
// Structures now size from o.r itself (STRUCTURE_RADIUS above, sim.js's streamObstacles; render.js
// draws proportional to o.r again) — see STRUCTURE_RADIUS's own doc for the full fix. Don't reuse
// this table for a structure's silhouette again; that reintroduces the bug.
//
// Bands are DISJOINT and ORDERED: max(class) < min(next class) for every row below, so nothing in
// a later row can ever render smaller than everything in an earlier one, however the two flanking
// values happen to land inside their own bands. Rows that are genuinely the same size TIER
// (fence/hedge, house/pier, barn/silo) intentionally share one band — that isn't an overlap, it's
// one class with two names.
//
// These are NOT real-world proportions, and must not be "corrected" toward them: PLAYER.radius is
// 22 (44px across), so literal realism (a real car is ~4.5m, a real house ~10m) would put half
// these classes at sub-pixel sizes next to the player. What the redesign needs is legibility and
// STRICT RELATIVE ordering — a car unmistakably reads smaller than a house — not literal scale.
// Bare `scale:` multipliers on an arbitrary baked size are the bug this table replaces; don't
// reintroduce them for any class listed here.
export const PROP_SCALE = {
  debris: [8, 18],    // rubble chunks — the smallest read
  crop:   [8, 18],    // farm crop rows — same tier as debris, different name
  car:    [20, 30],
  fence:  [32, 42],
  hedge:  [32, 42],   // same tier as fence
  tree:   [46, 60],
  house:  [64, 82],
  pier:   [64, 82],   // same tier as house — a dock structure, not a skyscraper
  barn:   [92, 128],
  silo:   [92, 128],  // same tier as barn
  tower:  [134, 172], // tower blocks — the tallest read
}

// Floor-decor density trim (v5.9.2, skies only) — the fourth of four compounding causes behind the
// "the fuck is this?" bug report: on top of the crushable structure field, render.js's shared
// FLOOR_LAYERS (big/mid/detail — bushes, hedges, litter, ...) scatter freely over EVERY chapter's
// ground, at a cell/chance shared by every chapter, so lowering them would thin every chapter's
// grass/leaf-litter, not just skies' cities. This is a skies-only EXTRA keep-fraction multiplied on
// top of each layer's existing chance (render.js's touchFloorCell, gated on chapterHasDistricts,
// same "self-gating predicate, no-op outside its own scope" idiom the road/clutter/border floor
// layers already use) — every other chapter's identical layers are read with no `skiesKeep` set and
// are bit-identical to before. `big` is cut hardest: it's the BULKIEST tier (90-175px tree/bush
// clumps for parks/hills) and the single biggest contributor to the reported green-blob wall; `mid`
// less so; `detail`'s small leaf/pebble specks are left mostly alone — fine texture, not "blobs".
// What's left to carry each district's read is its GROUND SURFACE (T.districtGround, render.js's
// populateBlotch — a per-district signature pattern already drawn at chance 1.0, unaffected by any
// of this): sparse, deliberate decor on top of a surface that already reads as itself.
export const SKIES_FLOOR_KEEP = { big: 0.22, mid: 0.45, detail: 0.75 }

// ---- Structure ART (v5.10 art direction, spec §5-§6) — render-only, skies-only ------------------
// "A house is a box plus a triangle." Correct, and the cause is structural, not stylistic: T.house /
// T.barn / T.silo are SIDE-VIEW, upright, base-anchored bakes sitting under a TOP-DOWN camera. A
// side-view house drawn from above can only ever be a box plus a triangle. All six kinds are redrawn
// as TOP-DOWN PLANS, which is what makes room for the detail this chapter's scale actually needs
// (in kaiju fiction, scale is communicated by the DENSITY OF SMALL DETAIL around the monster — that
// is why the counts below are so specific; "some windows" bakes as a smear, "a 4x6 grid, 11 lit"
// bakes as a building).
//
// THE SHADOW LAW. Every structure and every floor prop in this chapter bakes its OWN cast shadow at
// ONE CONSTANT OFFSET FOR THE WHOLE REGION. One light direction across an entire region is the
// cheapest, strongest "this is a photograph of a place" cue available, and it costs nothing per
// frame. It also SHIFTS EVERY PROP'S BOUNDS and therefore every anchor — which is exactly the
// v5.9.2 "the fuck is this?" bug class (sprites sitting off their colliders). Mandatory in every
// shadowed bake: a symmetric zero-alpha bounds keeper drawn first,
// `g.rect(-R, -R, 2*R, 2*R).fill({ color: 0x000000, alpha: 0 })`, so ax/ay stay at 0.5.
export const SKIES_SHADOW = { dx: 0.22, dy: 0.28, color: 0x000000, alpha: 0.35 }
// Bake canvas size for a structure plan. syncObstacles draws at `o.r * 1.9 / max(tex.w, tex.h)`, so
// a tower (STRUCTURE_RADIUS.tower 21-32) lands at 40-61px ON SCREEN. Draw on 128px (-> 256px texture
// at bake()'s resolution: 2) so a 4px window survives the minification instead of dissolving.
export const SKIES_BAKE_PX = 128

// Per-kind plan palettes and DETAIL COUNTS. The counts are the spec's and are not decorative
// suggestions — they are the difference between "a roof" and "a roof with six shingle courses".
// Structures are MASS-CENTRED, not base-anchored (spec §5.1.3): render.js's STRUCTURE_SKINS entries
// for these gain `topDown: true`, clumpA sits at (0, 0) instead of (0, o.r * 0.28), and clumpB
// becomes the LOT detail tucked at the rim. T.obFoot's rim-lands-exactly-on-o.r contract is what the
// sim actually tests — re-verify it by eye after the switch (spec §9.8).
export const SKIES_STRUCTURE_ART = {
  // downtown's landmark building is currently STRUCTURE_SKINS.tower = ['rubble','rubble'] — the
  // GENERIC RUBBLE PROP, which is also downtown's floor debris (kill list §8.8).
  tower: {
    deck: 0x6d7480, edge: 0x2b3038, parapet: 0x878e99,
    gravel: 0x7d838d, gravelFlecks: 44, gravelAlpha: 0.5, gravelPx: 1.5,
    hvac: 0x9aa1ab, hvacBase: 0x3a4048, hvacUnits: 2, hvacFins: 5,
    stairwell: 0x848b96, stairDoor: 0x2a2f36,
    waterTank: 0xb0a08a, tankRungs: 6,
    mast: 0x2f343c, mastPx: 22, guyWires: 3, lampDark: 0x5a1a16,   // the LIT aviation lamp is a
                                                                   // separate pooled blink sprite —
                                                                   // see SKIES_LIGHT.aviation
    flank: 0x3c424c, windowCols: 4, windowRows: 6, windowsLit: 11, windowsDark: 13,
    windowLit: 0xffd08a, windowDark: 0x1a1f28,   // palette law 1: a <=5px static lit rectangle, the
                                                 // ONLY form warm gold is allowed to take
    fireEscape: 0x2f343c, escapeTicks: 4, escapeLandings: 3,
    chamferPx: 10,          // two corners chamfered — a chamfer reads as a designed building; a
                            // rounded blob reads as rubble, which is precisely the bug being fixed
    variantB: { helipad: true, helipadR: 16, helipadAlpha: 0.7, hvacUnits: 3, windowsLit: 7 },
                            // two variants is how "window flicker" is faked with ZERO per-frame Graphics
  },
  house: {
    roofLit: 0x8a5c46, roofShade: 0x7a4e3b, ridge: 0x5f3c2d,
    shingleCourses: 6, shingleAlpha: 0.15,
    gutter: 0xb9ae9c, chimney: 0x8f7a68, dormerPane: 0xffd08a, skylight: 0x9fc3d8, skylightAlpha: 0.6,
    garagePanels: 5,
    lot: { drive: 0x9a958a, lawn: 0x4e5f42, lawnAlpha: 0.3, hedgeLobes: 7, deckPlanks: 7,
           bins: [0x2e6f4a, 0x2b4a7a] },        // the lot is baked INTO the same texture as the
                                                // house — a driveway that doesn't touch its house
                                                // is worse than no driveway
    variantB: { pool: 0x2f6f9e, litTint: true, coping: 0xf0efe9 },  // chlorine blue must bypass the
                                                                    // floor tint or it goes to mud
    porchLamp: 0xffd08a,
  },
  barn: {
    roofLit: 0x9c3f30, roofShade: 0x74302a, battens: 9, rust: 0x7a4a2c, rustAlpha: 0.5,
    cupola: true, hayDoor: 0x2e1a14, paddockPosts: 8, muck: 0x5a4a34, bales: 3, mudTrack: 0x6b5a44,
  },
  silo: {
    body: 0xc7c9cc,         // galvanised steel — DELIBERATELY the brightest object in a farm belt at
                            // night, which is what makes a farm district legible at a glance
    facets: 16,             // conical cap as radial facet lines converging on an OFF-CENTRE apex —
                            // the off-centre apex is the ENTIRE reason it reads as a cone, not a disc
    apexOffset: 0.22,       // fraction of the radius the apex sits off centre
    seams: 4, seamAlpha: 0.35, ladderRungs: 9, spill: 0xdcc98a, spillAlpha: 0.4,
  },
  pier: {
    boards: 14, gaps: 3,    // 3 ACTUAL GAPS through which the dark water shows — a hole in the fill,
                            // not a dark line. That single detail is what sells wood over water.
    pilings: 6, bollards: 4, crane: true,
    shackRoofArcs: 9, lantern: 0xffb45a, tyre: 0x2a2c30, dinghy: true, waveLines: 2,
  },
  tree: {
    lobes: 6, scallops: 12,          // scalloped radial edge, NEVER a smooth circle
    canopyLit: 0x7f9a6a, canopyShade: 0x3d4c36, branchSpokes: 7, trunk: 0x3a2e24,
  },
  // hills' CRUSHABLE structures are currently STRUCTURE_SKINS.rock = the hills FLOOR-DECOR boulders
  // at a bigger scale (kill list §8.7). A dedicated bake, at the same cost.
  outcrop: {
    facets: 3, facetLum: [1.0, 0.78, 0.58],   // three flat planes at differing luminance
    body: 0x8c8377, lichen: 0x7f8f6a, lichenDots: 12, screeChips: 5,   // scree fans DOWNSLOPE, in
                                                                       // the SKIES_SHADOW direction
  },
}

// ---- KAIJU ART (v5.11) — render-only, skies-only ------------------------------------------------
// The player was the one thing in the chapter that DIDN'T get the top-down redraw: the same generic
// blob every other chapter tints, at ~44px on screen (2 x PLAYER.radius) next to a tower that now
// draws up to 96px (SKIES_STRUCTURE_ART.tower, above). CHAPTERS.skies.render.kaiju gates a dedicated
// body/tail rig in render.js — same "palette + detail counts live here, the actual polygon
// coordinates are hardcoded in render.js" split SKIES_STRUCTURE_ART already uses (its geometry is
// specific enough — a jaw, a dorsal ridge, four limbs — that a data-driven layout would just be a
// second, harder-to-read copy of the drawing code). PLAYER.radius (22) is untouched: it's the sim
// hitbox, and this whole pass is render-only, exactly like the structure redraw was.
export const SKIES_KAIJU = {
  // rubber-suit green family — the kaiju's FINAL colours, not a base meant to be tint-multiplied.
  // render.js's syncPlayer bypasses CHAPTERS.skies.render.playerTint (0x7ad07a) for this bake
  // entirely, the same "plans carry their own palette" rule the top-down structure bakes use
  // (STRUCTURE_SKINS' topDown entries force clumpA.tint = 0xffffff) — a uniform multiply would push
  // the pale cyan sclera below toward the same green as the body fill, right when eye contrast
  // matters most.
  bodyLit: 0x74b862,    // top-plane, biased toward the SKIES_SHADOW light direction
  bodyMid: 0x548a44,    // main fill
  bodyShade: 0x3c6633,  // flank shade, biased away from the light
  plateBase: 0x2f5a42, plateEdge: 0x8fd9a8,   // dorsal plates: BAKED anatomy first (this section);
                                               // the existing rampage charge (SKIES_FX.rampage,
                                               // render.js updateRampage) lights these SAME points
                                               // up second, rather than drawing an unrelated glow
                                               // ring that used to rotate with facingAngle regardless
                                               // of the (non-rotating) body underneath it.
  scute: 0x466f3a, band: 0x2c4a26,   // flank scutes + spine banding — surface detail, not silhouette
  jawDark: 0x22321c, teeth: 0xe8e2c8, claw: 0x241c16, horn: 0x203024,
  // v5.10 palette law 2 ("atomic cyan-green IS the player"): SKIES_PALETTE.playerHot reused
  // directly for the sclera, so the ONE non-green hue on the body is the exact hex the rest of
  // the chapter already reads as "you", not a new, third player colour to learn.
  eyeWhite: 0xd8fff4,   // pupils are the existing T.pupil sprite, just repositioned/rescaled
  // detail counts (not decorative — see SKIES_STRUCTURE_ART's own note on why these are specific
  // numbers and not "some"): dorsal plates chain-charge tail->head (SKIES_FX.rampage.plates already
  // fixes this at 7 — kept in sync here rather than restated), jaw teeth, flank scutes per side,
  // spine bands, small brow horns.
  jawTeeth: 7, scuteRows: 5, bandCount: 4,
  // ground shadow: the kaiju gets its OWN bigger shadow (T.kaijuShadow, render.js), offset by the
  // region's one light direction (SKIES_SHADOW) scaled to the kaiju's own size, instead of the
  // generic blob's small straight-down disc (pShadow's default, unchanged for every other chapter).
  shadowRx: 100, shadowRy: 48,
  // the articulated tail (replaces T.fx.trace_05, the generic streak pond/undergrowth's `tail: true`
  // still uses unchanged, for skies only): three CHAINED tapering segments (each rooted at the
  // previous one's tip, not all three fanned from one point the way tailA/tailB share pTail's
  // origin today) with an increasing whip-lag per segment.
  tail: {
    lenA: 128, lenB: 104, lenC: 82,
    rootY: 58,   // pTail's LOCAL root offset (render.js) — a fixed point near the body's rear,
                 // instead of dead centre, so the swing reads as rooted at the hip, not the belly
  },
  // TAIL SWIPE WHIP: the `tail` sim event (sim.js stepTailWeapon/WEAPONS.tailSwipe) already drives
  // spawnWhip's arc-swoosh at the hit site (render.js handleEvents); this ADDS a snap on the
  // anatomical tail itself, decaying over swipeDecay seconds, so the weapon's own limb visibly
  // moves instead of only an effect appearing where it lands.
  swipeKick: 1.0, swipeDecay: 0.55,
  // the rampage dorsal-plate glow (SKIES_FX.rampage) and the rampage screen bloom (pRampageGlow)
  // both used to be sized only off PLAYER.radius (the sim hitbox, unchanged) — fine for the OLD
  // ~44px body, but it would now read as a small diamond/halo swallowed inside the new, much
  // bigger silhouette instead of surrounding it. Two separate multipliers because the two effects
  // scale against different references: the plate glow is sized relative to the BAKED PLATE it's
  // lighting up (small), the screen bloom is sized relative to the WHOLE BODY (big).
  plateGlowScale: 1.6, bloomScale: 3.4,
  // v5.11 ("kaiju way too big", playtest report). The v5.10 bake was sized against the OLD ~44px
  // blob it replaced and overshot: the body alone came out ~250px across on a 1900px viewport, next
  // to towers that draw at ~96px, so the monster covered a seventh of the screen and buildings read
  // as scenery scattered around it rather than as a city it was standing in. Scale is the whole
  // point of a kaiju, and scale is RELATIVE — it is communicated by how much recognisable detail
  // fits beside the creature, so a monster that crowds the detail out of frame reads SMALLER, not
  // bigger. 0.62 puts the body at ~155px: still unmistakably the largest thing in the world, with
  // room for a block of buildings alongside it.
  //
  // Applied to bodyC (the container holding body, flash, plates and the whole tail chain) rather
  // than to each sprite, so every part of the rig scales together and the tail can't drift off the
  // hip. The sim hitbox (PLAYER.radius, 22) is untouched — this is render-only, like the rest of
  // this block.
  bodyScale: 0.62,
}

// Ruins (spec §5.9) — swapped in PERMANENTLY at a crush site by the render-local crush ledger
// (SKIES_LIGHT.ledger below), keyed by WORLD POSITION, not obstacle identity: by the time this
// draws, the obstacle is already gone from run.obstacles. A KIND-SPECIFIC ruin beats a generic scar
// for the same cost, and it is the only thing in the chapter that records what you did.
export const SKIES_RUIN = {
  scar: 0x0e1116, scarAlpha: 0.5, rebarTicks: 6,   // the universal foundation scar under all six
  byKind: {
    tower: { slabSteps: 3, rubbleChunks: 5, rebar: 4, cornerColumn: true, scorchRing: true },
    house: { timberX: 4, chimneyStack: true, shingles: 9, flattenedCar: true },   // a SURVIVING
                                                                                  // CHIMNEY says
                                                                                  // "house" instantly
    silo:  { splitWallArc: true, grainFan: 0xdcc98a },
    barn:  { collapsedV: true, hayDownwind: true },   // hay strewn along STORM_VIS.windAngle, so the
                                                      // wreckage agrees with the weather
    pier:  { plankRaft: 7, oilSlick: true },
    tree:  { stump: true, splinterRing: true, branches: 5 },
  },
}

// Vehicles (spec §6) — "you must be able to tell a bus from a sedan" is literally the brief.
// CLUTTER_BY_DISTRICT.suburbs currently uses T.car: the CITY chapter's yellow traffic taxi, baked
// from TRAFFIC_CAR_LEN = 150 (kill list §8.9). Three silhouettes from one bake set instead.
// Dimensions are in px at PROP_SCALE.car's band; the length ratios (26/32/54) are what carry the
// read, not the absolute size.
export const SKIES_VEHICLE = {
  sedan: { len: 26, w: 12, windows: 2, wheels: 4, mirrors: 2, seams: 2 },
  van:   { len: 32, w: 13, windows: 1, wheels: 4, roofVent: true, sliderSeam: true },  // no rear screen
  bus:   { len: 54, w: 14, windowBays: 6, wheels: 6, roofHatches: 2, destBoard: true },
  glass: 0x1e2733, glassAlpha: 0.85, wheel: 0x15181c, tail: 0xff5545, head: 0xfff6d0,
  // Deliberately DESATURATED: the saturated hues in this chapter belong to the threats (SKIES_FX)
  // and to the container yard (DISTRICT_SURFACE.sea). litTint so a parked car doesn't inherit the
  // grass green of a park or the khaki of a farm.
  bodyTints: [0x8f97a3, 0x6f7f8f, 0xa8a094, 0x7a5b52, 0x4f6b78, 0x8a8f7a], litTint: true,
  alignToKerb: true,   // PARKED CARS ALIGN TO THE KERB ANGLE (roadAt returns it) OR TO THE PAINTED
                       // STALL ANGLE. NEVER random rotation — random rotation is the single loudest
                       // tell that a scene was scattered by an algorithm.
}

// ---- Garden chapter behavior flags (v5.3, see sim.js) --------------------------------------
// pheromones signature (garden): a dying 'trailFollow' ant drops a fading node into run.trails;
// a living 'trailFollow' ant within PHEROMONE_FOLLOW_RADIUS of ANY node gets a seek-speed bonus
// (design: "others follow & accelerate on" the trail). All of this is gated on the run's chapter
// having a signature of type 'pheromones' (config CHAPTERS[id].signature) so future chapters' ants
// can differ. run.trails entries: { x, y, t } (t = seconds of life left; stepped like run.pools).
export const PHEROMONE_LIFE = 4            // s, a dropped trail node's lifetime
export const PHEROMONE_FOLLOW_RADIUS = 130 // px, node proximity that grants an ant the speed bonus
export const PHEROMONE_SPEED_MUL = 1.35    // seek-speed multiplier while following a trail

// diveBomb (garden's wasps): a hover -> telegraph -> straight accelerating dive -> recover cycle
// (state on e._diveState/_diveT/_diveDirX/_diveDirY/_diveElapsed). Every speed below is a
// multiplier of the enemy's OWN speed; the dive ramps from _START to _END (accelerating line).
// ---- v6.6.24: nothing you cannot see may commit to a leap (owner directive) --------------------
// "the bees sometimes jump on you without you seeing them, like on the phone when they come from
// the side. The rule should be: if it's not displayed on the screen, it should not be able to jump
// on you." This is the FAST => COMMITTED rule stated from the player's side: a threat may be
// impossible to IGNORE, never impossible to ESCAPE, and a dive launched from off-screen is
// unescapable by construction — you cannot dodge what was never drawn.
// The test is the VIEWPORT RECTANGLE, which is the whole point. Every existing range in this file
// is radial, and a radius cannot express the phone case: at viewRadius ~465 a wasp 220px to the
// side is comfortably "in range" and entirely off the edge of a 390px-wide screen.
export const COMMIT_EDGE_PAD = 28       // px inside the edge — half a wasp poking in is not "seen"
// True when `e` is inside the drawn viewport (with the pad), i.e. the player has actually had the
// chance to see it. Falls back to the radius when a caller has no rectangle (never in the game —
// only a hand-built test run that skipped createRun's defaults).
export const canCommitFrom = (run, e) => {
  const p = run?.player
  if (!p) return true
  const hw = (run.viewW ?? run.viewRadius ?? 0) - COMMIT_EDGE_PAD
  const hh = (run.viewH ?? run.viewRadius ?? 0) - COMMIT_EDGE_PAD
  return Math.abs(e.x - p.x) <= hw && Math.abs(e.y - p.y) <= hh
}
// How far out a hovering attacker may hold along (ux,uy) and still be inside that rectangle. The
// wasp's own DIVE_STANDOFF is 220, which EXCEEDS a portrait phone's ~195px horizontal half-view —
// so a wasp coming from the side used to hold station off-screen by construction, which is exactly
// the reported bug. Without this clamp the rule above would deadlock it: it would hover unseen,
// never be allowed to commit, and sit there forever. Vertical approaches are unaffected (a phone's
// ~350px half-height already clears 220), so this only pulls in the axis that was broken.
export const visibleStandoff = (run, ux, uy, want) => {
  const hw = (run?.viewW ?? run?.viewRadius ?? Infinity) - COMMIT_EDGE_PAD
  const hh = (run?.viewH ?? run?.viewRadius ?? Infinity) - COMMIT_EDGE_PAD
  const tx = Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity
  const ty = Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity
  return Math.max(40, Math.min(want, tx, ty))   // never collapse onto the player
}

export const DIVE_STANDOFF = 220        // px, hover distance held from the target
export const DIVE_HOVER_T = 1.4         // s, hover phase before a dive
export const DIVE_TELEGRAPH_T = 0.5     // s, telegraphed pause (dive aim locks at its start)
export const DIVE_T = 0.55              // s, dive phase (straight, accelerating, overshoots)
export const DIVE_RECOVER_T = 1.0       // s, recover drift before hovering again
export const DIVE_HOVER_SPEED_MUL = 0.9 // repositioning speed while hovering toward standoff
export const DIVE_SPEED_START = 2.0     // dive speed multiplier at dive start
export const DIVE_SPEED_END = 5.0       // ...ramped to this by dive end (dive distance > standoff -> overshoots)
export const DIVE_RECOVER_SPEED_MUL = 0.3
export const DIVE_HOVER_DEADZONE = 8    // px band around standoff where the wasp holds still (no jitter)

// webZone (garden's spiders): drop slow-zone web patches into run.webs while alive (NOT elite-gated,
// unlike soapTrail). Webs slow the PLAYER only (stepPlayerMovement) — they stack with the latch
// debuff via a MIN of the two multipliers (the stronger slow wins, they don't multiply together).
// run.webs entries: { x, y, r, t } (t = seconds of life left; stepped like run.pools, but no damage).
export const WEB_INTERVAL = 1.6  // s between dropped web patches
export const WEB_R = 72          // px, web patch radius
export const WEB_DUR = 4         // s, web patch lifetime
export const WEB_SLOW_MUL = 0.6  // player move-speed multiplier while standing in a web

// v6.6.14: the SPRAY_* block lived here (garden's pesticide-drone elites marking a rectangle on
// the player). Deleted with the mechanic — see the MOWER_* block above for what replaced it, and
// note run.strips itself is still very much alive: the Blank's erasure bands, eraser wakes and
// immuneMemory residue all feed it, all tagged look:'erase'.

// ---- Undergrowth chapter behavior flags (v5.4, see sim.js) ----------------------------------
// pounce (undergrowth's toad, a cat until v6.6.32): a hold -> telegraph -> flat leap -> land/recover cycle, state on
// e._pounceState ('hold'|'aim'|'leap'|'land') / _pounceT (s left in the phase) / _pounceDirX,
// _pounceDirY (leap heading, LOCKED at the START of 'aim' so the leap is dodgeable) — same
// bookkeeping idiom as diveBomb's _diveState/_diveT/_diveDirX/_diveDirY.
//   hold:  seeks the player normally at POUNCE_HOLD_SPEED_MUL until within POUNCE_RANGE, then 'aim'
//   aim:   STOPS dead for POUNCE_AIM_T (the telegraph; heading locks here — render draws the arc)
//   leap:  POUNCE_LEAP_T of straight flight at POUNCE_LEAP_SPEED_MUL, ignoring the player's moves
//          (it overshoots if you dodge). Contact damage is normal during the leap — no bonus.
//   land:  POUNCE_LAND_T frozen (the punish window: it can't move or deal contact damage), then 'hold'
// Damages: the PLAYER only via ordinary contact damage (stepContactDamage) — a pounce has no
// attack of its own. v6.5: the leap->land transition (sim.js stepPounce) also slams any armed trap
// under the landing toad (see POUNCE_TRAP_HP_FRAC) — the leap itself flies OVER traps untouched
// (stepTraps skips any enemy mid-'leap'), so this is the one point where the cat reads run.traps.
// v6.6.30 (owner: "cats dash 10cm then go back 10cm, so they never reach you"). The pounce was
// arithmetically incapable of connecting, and the owner's description is exactly what it looked
// like from behind the camera. Traced against a player walking away at base speed:
//     dist 196 -> aim (dead stop) -> 71 after the leap -> 134 during 'land' -> 288 back in 'hold'
// i.e. the cat lunged in and then appeared to slide straight back out. Three compounding causes:
//   1. POUNCE_LEAP_SPEED_MUL was a multiple of the cat's OWN speed, and a tank archetype at
//      speedMul 0.8 runs 44 px/s — so "6x speed for 0.40s" was a 106px hop at 264 px/s, barely
//      above the player's own 220. A gap-closer must be defined by the GAP, not by how slow the
//      thing closing it is. It is a DISTANCE now, and the flight speed falls out of it.
//   2. The frozen windows (aim 0.55 + land 0.70 = 1.25s) handed a moving player 275px per cycle
//      against that 106px of gain. Net -169px per pounce: the cat lost ground every single time
//      it attacked. Both are trimmed, but they are NOT the fix — the punish window is the whole
//      counterplay and shortening it too far would just make the cat unpunishable instead.
//   3. POUNCE_RANGE 260 let it commit from further away than it could possibly leap.
// Now: it commits inside POUNCE_RANGE and leaps POUNCE_LEAP_DIST, which is deliberately LONGER —
// the leap passes THROUGH where you were and lands beyond it, so running in a straight line is not
// an escape and stepping aside still is. That is the FAST => COMMITTED contract stated properly:
// impossible to ignore, never impossible to escape.
// v6.6.33 (owner: "the leap is wayyy too long it flies off screen. The leap build-up is too short,
// should be twice as long to prepare. [...] Toads are slow and tanky: when they land, they slowly
// turn towards the player and build-up another leap"). This retires the gap-closer framing the
// block above was written under. v6.6.30 fixed a CAT whose pounce lost ground every time it
// attacked, and the fix was a leap long enough to out-run the frozen windows: 300px. On a 390px
// phone the horizontal half-view is 195px, so a 300px leap left the screen by construction — the
// fix for one owner complaint created the next one.
// A toad is not a pursuer. It is a heavy ambusher that sits, winds up visibly, snaps a SHORT
// distance, lands hard, and takes its time coming round again. So the leap is now shorter than the
// phone half-view and the wind-up is the dominant phase of the cycle. It closes ground far more
// slowly than the cat did, and that is the intended reading rather than a regression — see run
// UG.j, whose old "must net forward against a fleeing player" assertion belonged to the cat and is
// replaced by the constraint that actually matters now: the leap must stay on screen.
// v6.7.3 (owner: "25% increase leap range. They a bit too easy to dodge now"). LEAP_DIST 150 ->
// 188, which is still inside the 195px half-view above — the two owner constraints now sit 7px
// apart, so this number has no room left to grow and the next "further" request has to buy it by
// shortening POUNCE_LEAP_T instead. POUNCE_RANGE deliberately stays at 140: the extra 48px is spent
// as OVERSHOOT, not as a longer telegraph. A toad still commits from the same distance (so the
// wind-up you react to starts where it always did) but now carries 48px PAST where you stood, and
// since contact damage is live for the whole flight (contactHarmless excludes only 'land'), that
// overshoot is the part that catches a player who backed off in a straight line. Raising RANGE
// instead would have moved the telegraph further away and made it EASIER to dodge.
export const POUNCE_RANGE = 140          // px, distance at which a holding toad commits to a leap
export const POUNCE_LEAP_DIST = 188      // px the leap covers — must stay under a phone's 195px half-view
export const POUNCE_HOLD_SPEED_MUL = 1.2 // seek speed while stalking (multiplier of its OWN speed)
export const POUNCE_AIM_T = 0.90         // s, telegraphed crouch (dead stop; heading locks at its start)
export const POUNCE_LEAP_T = 0.30        // s, leap phase (straight, no steering) — 627 px/s at 188px.
                                         // Short AND fast: a toad's leap is a snap, and holding the
                                         // old 0.42s over half the distance would have halved the
                                         // launch speed, which is not what "too long" asked for.
export const POUNCE_LAND_T = 0.50        // s frozen after a leap (the free-hits window)
// How fast the body may SWING ROUND, in rad/s. The owner's rule: "when it leaps, it turns mid air
// towards the player: it shouldn't. It has committed to a jump and should keep facing same
// direction during jump. Otherwise momentum conservation is not realistic."
// Until v6.6.33 facing was recomputed from the bearing to the player EVERY FRAME for every enemy in
// the game, so a committed leap visibly steered even though the sim had locked its heading — the
// body said one thing and the trajectory said another. Read by ROSTER_LOOKS.toad's faceDir/turnRate
// hooks in render.js; every other creature keeps the old instant facing and is untouched.
export const POUNCE_TURN_AIM = 7.0       // rad/s while winding up — it must finish aimed before launch
export const POUNCE_TURN_LEAP = 0        // rad/s mid-air. Zero. That is the whole rule.
export const POUNCE_TURN_IDLE = 1.9      // rad/s landed/stalking — ~1.7s for a half turn, a slow heavy animal
// Fraction of the LANDING cat's own maxHP a slammed trap deals, floored by max(SNAP_TRAP_DMG*2, …):
// a flat multiple of SNAP_TRAP_DMG dies against hpScale (the first cat ever to spawn, ~t=140, already
// carries ~368 HP) — the trap needs to stay a real threat, not decoration, against that curve. The
// floor keeps a tiny future pouncer's slam from rounding to nothing. Chain-slamming one cat back onto
// the same trap tops out around once per max(SNAP_TRAP_REARM, a pounce cycle) — a real bait play,
// still slower than just fighting the toad.
export const POUNCE_TRAP_HP_FRAC = 0.25

// aerialStrike (undergrowth's owl): circles out of reach, marks the ground, then drops. State on
// e._airState ('circle'|'mark'|'strike'|'climb') / _airT / _airAngle (its angle on the circle) /
// _airTargX, _airTargY (the marked point, LOCKED at the start of 'mark').
//   circle: orbits the player at AERIAL_RADIUS px, advancing _airAngle at AERIAL_ORBIT_SPEED rad/s
//           (position is SET on the circle, not seeked), for AERIAL_CIRCLE_T, then 'mark'
//   mark:   keeps circling for AERIAL_MARK_T while _airTargX/_airTargY hold the player's position
//           at the phase's start — this is the shadow telegraph render draws on the ground
//   strike: AERIAL_STRIKE_T of straight flight from wherever it is to the marked point at
//           AERIAL_STRIKE_SPEED_MUL of its own speed; it does NOT re-aim
//   climb:  AERIAL_CLIMB_T drifting back out to AERIAL_RADIUS, then 'circle'
// Damages: the PLAYER only, via ordinary contact damage — same as pounce, no attack of its own.
// v6.3: AERIAL_UNTOUCHABLE is GONE — the flag finally has a ranged-chapter home (city's patrol
// drone) and the melee-era blanket immunity doesn't belong there. damageImmune has no aerial
// branch at all now (circling/marking/striking drones are killable); contactHarmless keeps ONLY
// its 'climb' clause (a punish window: hittable, but it can't hurt you on the way out — see both
// fns in sim.js). 'circle' and 'mark' are ordinary — ordinary damage in, ordinary contact damage
// out, like a ground enemy that happens to fly.
export const AERIAL_RADIUS = 200          // px, the circling standoff — inside the city beam's L1
                                           // blade (240) with margin: at 240 the orbit sat exactly
                                           // on the tip, a ~15° hit window
export const AERIAL_ORBIT_SPEED = 1.1     // rad/s around the player while circling
export const AERIAL_CIRCLE_T = 2.0        // s of plain circling before a mark
export const AERIAL_MARK_T = 0.8          // s of telegraph (the shadow lands here)
export const AERIAL_STRIKE_T = 0.45       // s, the dive itself
export const AERIAL_STRIKE_SPEED_MUL = 5.0
export const AERIAL_CLIMB_T = 1.2         // s, recover/climb back to the circle
// v6.3: concurrent aerial enemies allowed out of 'circle' (mark/strike/climb) at once — past the
// cap, a drone ready to mark HOLDS in 'circle' instead (see stepAerialStrike in sim.js). The
// MISSILE_MAX_LIVE/SHELL_MAX_LIVE lesson (a hard concurrency backstop), applied before shipping
// this time instead of after a live-run complaint.
export const AERIAL_STRIKE_MAX_LIVE = 6

// flashlightCone (undergrowth's exterminator elites): sweeps a cone of light that ENRAGES other
// enemies. State on e._coneAngle (current sweep heading, rad) — it sweeps back and forth across
// FLASHLIGHT_SWEEP rad centered on the direction to the player, at FLASHLIGHT_SWEEP_SPEED rad/s.
// Every frame, any OTHER enemy whose center falls in the sector (FLASHLIGHT_ARC rad,
// FLASHLIGHT_RANGE px, centered on _coneAngle, origin = the elite) gets e.enrageT =
// FLASHLIGHT_ENRAGE_T; while e.enrageT > 0 that enemy's seek speed is × FLASHLIGHT_SPEED_MUL and
// its contact damage × FLASHLIGHT_DMG_MUL. Ticks down like fearT.
// Damages: NOTHING directly — the cone hurts neither the player nor enemies. It is pure buff +
// telegraph (the threat is what it turns the swarm into). No run.* array; render reads _coneAngle.
export const FLASHLIGHT_RANGE = 320
export const FLASHLIGHT_ARC = 0.55         // rad, the cone's half-angle
export const FLASHLIGHT_SWEEP = 1.4        // rad, total sweep span (± half of this around the player-facing)
export const FLASHLIGHT_SWEEP_SPEED = 1.0  // rad/s
export const FLASHLIGHT_ENRAGE_T = 2.0     // s of enrage granted (refreshed every frame in the cone)
export const FLASHLIGHT_SPEED_MUL = 1.5
export const FLASHLIGHT_DMG_MUL = 1.4

// predators signature (undergrowth): snap traps. v6.5: run.traps is STREAMED by sim.js's
// streamTraps, the exact streamEddies idiom (own cell cursor _trapCellI/_trapCellJ, own hash
// salts 15/16/17, same run._obstacleSeed, same OBSTACLE_STREAM_RADIUS/OBSTACLE_DROP_RADIUS) —
// this REPLACES the old createRun-time scatterField seeding (state.js's generateTraps, deleted),
// whose field went dead the instant a run walked OBSTACLE_FIELD_RADIUS from the origin. Traps do
// NOT block movement, so they may overlap obstacles freely.
// run.traps entries: { x, y, r, armed, rearmAt, _cell } — r is always SNAP_TRAP_R (jitter slack
// uses the constant directly, not a cfg.r — the signature's traps block carries no radius);
// armed (bool) = ready to snap; rearmAt (absolute run.time) = when a sprung trap re-arms (0 while
// armed); _cell = the streaming cell key, used to persist sprung state (see run._trapRearm below)
// and null for hand-placed test fixtures (springTrap's ledger write is guarded on _cell != null).
// Every frame, an ARMED trap whose radius r contains the center of the player OR of any enemy
// snaps: it damages THAT ONE entity (BOTH sides — this is the whole point: kite the swarm over
// them), sets armed=false / rearmAt=run.time+SNAP_TRAP_REARM, and emits {type:'explode', x, y,
// radius:r}. Player damage is a flat SNAP_TRAP_DMG through the normal armor/contactDmgTakenMul
// path (respects player.invuln — an INVULNERABLE player walks over a trap without springing it;
// this is a DELIBERATE forgiveness rule, not an accident, so a trap is never spent for free on a
// player who couldn't have taken the hit anyway). Enemy damage is SNAP_TRAP_DMG * hpScale(run.
// time) through dealDamage: a flat number on both sides looks symmetric but isn't — enemy HP
// climbs 7.6x by late-run (hpScale(300)) while a flat snap would decay from "real hazard" to
// "decoration" the swarm shrugs off, so enemy-side damage scales with the same curve enemy HP
// does; the player-side number stays flat because the player's own toughness doesn't scale.
// Traps are permanent field furniture — they never expire, they only re-arm. run._trapRearm (a
// Map, state.js) persists a sprung trap's rearmAt keyed by _cell across streaming: a cell that
// scrolls out of OBSTACLE_DROP_RADIUS and back in re-materializes disarmed until its ledger entry
// expires (materialization derives `armed` from the ledger, deleting the entry once it's stale —
// see streamTraps in sim.js).
// minDist (origin spawn-ring clearance) lives on CHAPTERS.undergrowth.signature.traps, not here —
// it's a per-cell streaming knob like cell/chance, not a fixed geometry constant.
export const SNAP_TRAP_R = 30          // px, trigger radius
export const SNAP_TRAP_DMG = 24        // damage to whichever single entity trips it (player or enemy; enemy side further scales by hpScale)
export const SNAP_TRAP_REARM = 4.0     // s before a sprung trap can snap again

// ---- City chapter behavior flags (v5.4, see sim.js) ------------------------------------------
// lineCharge (city's robot vacuums): line up -> telegraph a straight lane -> charge down it.
// State on e._chargeState ('track'|'lock'|'charge'|'stall') / _chargeT / _chargeDirX, _chargeDirY
// (heading, LOCKED at the start of 'lock').
//   track:  seeks normally at LINE_CHARGE_TRACK_SPEED_MUL until within LINE_CHARGE_RANGE -> 'lock'
//   lock:   stops for LINE_CHARGE_LOCK_T; heading locks at its start (render draws the lane —
//           LINE_CHARGE_W wide, LINE_CHARGE_LEN long, from the vacuum along the heading)
//   charge: LINE_CHARGE_T of straight flight at LINE_CHARGE_SPEED_MUL, no steering
//   stall:  LINE_CHARGE_STALL_T motionless (spinning down; no contact damage) -> 'track'
// Damages: the PLAYER only, via ordinary contact damage. No run.* array; render reads the state.
export const LINE_CHARGE_RANGE = 340
export const LINE_CHARGE_TRACK_SPEED_MUL = 0.85
export const LINE_CHARGE_LOCK_T = 0.6
export const LINE_CHARGE_T = 0.8
export const LINE_CHARGE_SPEED_MUL = 5.5
export const LINE_CHARGE_STALL_T = 0.9
export const LINE_CHARGE_LEN = 520     // px, telegraph lane length (render-only; the charge itself is speed×time)
export const LINE_CHARGE_W = 48        // px, telegraph lane width (render-only)

// spawner (city's exterminator-van elites): every SPAWNER_INTERVAL seconds, spawns SPAWNER_COUNT
// enemies of the chapter's SPAWNER_ARCHETYPE roster entry, scattered SPAWNER_SCATTER px around
// itself (spawnEnemy's normal path, so they get the chapter's roster skin/flags and the run's
// current hp/speed scaling — they are NOT elites). Emits {type:'explode', x, y, radius} at each
// spawn point so the pop reads. Capped: a spawner won't push past MAX_ALIVE.
// Damages: nothing directly — it makes more of the things that do.
export const SPAWNER_INTERVAL = 3.5
export const SPAWNER_COUNT = 3
export const SPAWNER_ARCHETYPE = 'fast'  // which of the chapter roster's archetypes it disgorges (pigeons)
export const SPAWNER_SCATTER = 70        // px, spawn scatter around the van

// traffic signature (city): run.lanes. Up to signature.lanes are alive at once; whenever fewer
// exist, sim rolls a new one every TRAFFIC_INTERVAL seconds. A lane is a band of length
// TRAFFIC_LEN and width TRAFFIC_W, positioned so it ALWAYS CROSSES the player's current position.
//
// v6.3: the roll's ANGLE (and, near a road, its exact perpendicular POSITION) now follows the real
// street grid instead of coming out uniformly random — three tiers, checked in order, in stepLanes:
//   Tier 1 (player on/near a road — roadAt(...).onRoad && dist <= TRAFFIC_SNAP_R): the lane snaps
//     FULLY onto that road's centerline. angle = the road's own heading (either direction of
//     travel); position = the player's OWN position corrected only along the perpendicular (the
//     along-axis coordinate is left exactly at the player's, so the band's length is centered on
//     them, not merely overlapping them).
//   Tier 2 (player inside a city, off-road): angle snaps to one of the city's own 4 grid axes, but
//     POSITION keeps the ordinary player-crossing offset below — the van jumps the curb and comes
//     straight for you, same as Tier 3. Destructible cover (v6.3 Task 4) is what makes this
//     survivable, not evasion.
//   Tier 3 (no world seed, or no city nearby): today's fully-random angle/offset, byte-for-byte.
// Every tier draws the SAME two Math.random() calls (dirRoll, offRoll) in the SAME order — only
// their INTERPRETATION differs by tier — so a seeded test's RNG stream never depends on which one
// fires, and CHAPTERS[..].signature.type === 'traffic' remains the only gate on stepLanes rolling
// at all (non-city chapters, and city with no seed/city nearby, are unaffected).
//
// WHY POSITION NEVER LEAVES THE PLAYER, even on a full road snap (adversarial finding — see the
// v6.3 city plan, Task 3): if Tier 1 instead centered the band on the NEAREST road segment — i.e.
// let position drift toward the street rather than correcting around the player — a player who
// simply stood in a courtyard, plaza, or mid-block dead zone could dodge every lane forever by
// never standing on the carriageway. That turns the chapter's signature threat into an opt-in
// switch and deletes it for anyone who reads the terrain and camps off-road. So Tier 1 only ever
// adjusts the perpendicular offset (and picks a travel direction) — the along-axis center is
// pinned to the player on every roll, on-road or not, exactly like Tiers 2 and 3.
// run.lanes entries: { x, y, angle, len, w, phase, t, carT, dmg }
//   x, y     = the lane band's CENTER; angle = its direction; len/w = its extent
//   phase    = 'warn' | 'sweep'
//   t        = seconds left in the current phase (TRAFFIC_WARN, then TRAFFIC_SWEEP)
//   carT     = 0..1, the vehicle's progress along the lane — sim advances it during 'sweep'
//              only (carT = 1 - t/TRAFFIC_SWEEP). The vehicle's center is
//              (x, y) + dir × ((carT - 0.5) × len) where dir = (cos angle, sin angle).
//   dmg      = TRAFFIC_DMG, snapshotted so a mid-run retune can't desync live lanes
//   hitIds   = Set<enemyId>, sim-internal: one hit per enemy per pass
// 'warn': the band is drawn hazard-striped, NOTHING is damaged. 'sweep': a TRAFFIC_CAR_LEN ×
// TRAFFIC_CAR_W box centered on the vehicle damages BOTH sides — the player (normal armor/
// contactDmgTakenMul path, gated by player.invuln, once per pass is implicit via invuln) and every
// enemy it touches (dealDamage, once each via hitIds) — plus TRAFFIC_KB knockback along `angle`.
// The lane is removed when t hits 0 in 'sweep'.
export const TRAFFIC_INTERVAL = 3.0   // s between lane rolls (while under signature.lanes alive)
export const TRAFFIC_WARN = 1.3       // s of harmless telegraph before the vehicle enters
export const TRAFFIC_SWEEP = 1.1      // s for the vehicle to traverse the full lane length
export const TRAFFIC_LEN = 1100       // px, lane length (comfortably longer than a screen)
export const TRAFFIC_W = 130          // px, lane band width
export const TRAFFIC_OFFSET = 90      // px, max perpendicular offset of the band from the player
                                       // (tiers 2/3 only — tier 1 uses the road's own dist instead)
export const TRAFFIC_SNAP_R = 150     // px: player within this of a road centerline -> the lane
                                       // snaps fully onto that road. Kept < TRAFFIC_W/2 + TRAFFIC_OFFSET
                                       // (155px) on purpose: tier 1's perpendicular correction can
                                       // never itself push the player outside the band it just built.
export const TRAFFIC_CAR_LEN = 150    // px, the vehicle's hitbox length (along `angle`)
export const TRAFFIC_CAR_W = 110      // px, the vehicle's hitbox width (across `angle`)
export const TRAFFIC_DMG = 34         // damage to the player AND to each enemy the vehicle hits
export const TRAFFIC_KB = 420         // knockback applied along the lane to struck enemies
// v5.6.14 (user): a car ONE-SHOTS the light roster — a pigeon or a cardboard drone does not
// survive being run over; only elites (and the vacuum, which is street furniture itself) take
// TRAFFIC_DMG like everyone else. rosterIds, checked non-elite-only in stepTraffic.
// v6.3: rat and patrolDrone join — street rats scurry, patrol drones circle at head height, both
// as roadkill-able as the pigeon they joined.
export const TRAFFIC_SQUASH = ['ratDrone', 'pigeon', 'rat', 'patrolDrone']
// v6.3 Task 4 (cover): an obstacle must be at least this big to stop a car — cones don't block
// traffic. Checked in sim.js's findCover (stepLanes' sweep branch): the FIRST obstacle >= this
// radius standing on the car-center -> player segment takes the hit instead of the player, and is
// destroyed outright (same {type:'crush'} event/run._crushed path stepCrush uses). Telegraphed in
// render.js's redrawLanes during 'warn' with a soft ring, and city's baked-prop pick (syncObstacles)
// forces anything this big to bake as the dumpster — the one prop actually shaped like something
// that stops a car.
export const COVER_MIN_R = 26

// ---- The Mower (v6.6.14, garden's `mower` elite flag) -----------------------------------------
// Playtest: "the rectangle yellow telegraph are what? A lawnmower attack? If so we should see the
// lawnmower like we see the taxi in city level." What it WAS: a `sprayStrip` elite marked a 340x92
// rectangle CENTRED ON THE PLAYER at a random angle, with no geometric relationship to the elite
// that fired it — so the hazard had no visible cause anywhere on screen. Now the lawn gets mowed:
// the same run.lanes machinery the city drives its taxi with (telegraph -> a vehicle crosses ->
// it flattens both sides), so there is one lane system in this codebase rather than two.
//
// v6.6.16 (owner): the mower is AMBIENT, not an elite's doing. It shows up on its own every
// MOWER_GAP_MIN..MAX seconds once the run is MOWER_FIRST_T old — the lawn is simply being mowed,
// which is a cleaner fiction than an ant summoning a machine, and it makes the hazard part of the
// chapter instead of an elite tell. Still ONE PASS AT A TIME (run.lanes must be empty to roll).
export const MOWER_FIRST_T = 30       // s before the first pass — the opening minute stays calm
export const MOWER_GAP_MIN = 5        // s, shortest gap between passes
export const MOWER_GAP_MAX = 15       // s, longest
export const MOWER_WARN = 1.3         // s of harmless telegraph before the deck arrives
export const MOWER_SWEEP = 2.8        // s to cross MOWER_LEN — 393 px/s, HALF the v6.6.15 speed
export const MOWER_LEN = 1100         // px, lane length: longer than a screen, so it enters/leaves offscreen
export const MOWER_W = 120            // px, width of the mown band (the telegraph)
// px, max perpendicular offset of the band from the player. DELIBERATELY under MOWER_DECK_W/2, so
// "always crosses you" is literally true even standing still. (TRAFFIC_OFFSET 90 is well over its
// own car's 55px half-width, so the city's van in fact misses a stationary player ~39% of rolls —
// harmless there because players move, but not a property worth copying on purpose.)
export const MOWER_OFFSET = 40
// 160x96 = 1.67:1. A real body alone is ~1.3:1, but this silhouette INCLUDES the grass bag and the
// handle, and a walk-behind with its handle is ~2.5:1 — so this still sits on the short side of the
// reference rather than past it. (Owner, on the 1.33:1 draft: "a little longer still".)
export const MOWER_DECK_LEN = 160
export const MOWER_DECK_W = 96        // the CUT: this is the width the player has to clear
export const MOWER_KB = 300           // knockback along the lane to struck enemies
// Enemies lose a FRACTION OF THEIR OWN MAX HP, not a flat number (owner: "50% hp damage to enemies,
// whatever their scaling"). A flat figure falls behind hpScale within a minute and the mower stops
// mattering; a fraction never does. Replaces the old squash list, which only ever killed ants.
export const MOWER_ENEMY_HP_FRAC = 0.5
// The player takes a FLAT amount that ramps across the run (owner: "flat 15hp in the beginning and
// a flat 30hp at the 5min mark"). Flat means flat: the hit stays dot-flagged, so armour does not
// reduce it and it grants no invulnerability — see the dot note on stepLanePasses.
export const MOWER_DMG_START = 15
export const MOWER_DMG_END = 30
export const mowerDmgAt = (t) => MOWER_DMG_START
  + (MOWER_DMG_END - MOWER_DMG_START) * Math.min(1, Math.max(0, (Number(t) || 0) / RUN_DURATION))

// ---- Skies chapter behavior flags (v5.4, see sim.js) -----------------------------------------
// strafe (skies' fighter jets): flies straight passes THROUGH the player rather than chasing.
// State on e._strafeState ('bank'|'telegraph'|'run') / _strafeT / _strafeDirX, _strafeDirY (LOCKED
// at the end of 'bank' and held through 'telegraph').
//   bank:       STRAFE_BANK_T of drifting toward a point STRAFE_STANDOFF px from the player on a
//               random bearing, at STRAFE_BANK_SPEED_MUL. At its END the heading locks onto the
//               player and a {type:'strafeLock'} event fires (state.js's event-contract doc).
//   telegraph:  STRAFE_TELEGRAPH_T of holding that locked position — the wind-up the player reacts
//               to (see below).
//   run:        STRAFE_RUN_T of straight flight at STRAFE_RUN_SPEED_MUL, no steering (it flies past
//               and well beyond you), then back to 'bank'.
// Damages: the PLAYER only, via ordinary contact damage. No run.* array.
// v5.9.1 bugfix ("jets are unavoidable when they cross the screen", playtest report): STRAFE_
// TELEGRAPH_T and the 'telegraph' state are new — there used to be NO gap between the heading
// locking and the fast run starting, so a jet crossing the screen was the first thing the player
// saw AS it hit them. 0.5s mirrors DIVE_TELEGRAPH_T (garden's wasp dive, an even faster relative
// speed multiplier that already ships with exactly this kind of pause) and is enough to dodge: the
// jet locks STRAFE_STANDOFF (420px) from the player, who moves at PLAYER.baseSpeed (220px/s) — 0.5s
// buys up to 110px of lateral clearance, over 3x the ~34px (PLAYER.radius + jet radius) needed to
// step off the dead-straight line it committed to. STRAFE_RUN_SPEED_MUL and jet contact damage
// (ENEMIES.wisp.dmg=5, ~5% of PLAYER.baseHP) are deliberately UNCHANGED: the bug was avoidability,
// not power, and jet is ~55% of late spawns (WAVE_TABLE) — a per-hit or speed nerf here would move
// overall chapter difficulty far more than this fix calls for.
export const STRAFE_STANDOFF = 420
export const STRAFE_BANK_T = 1.3
export const STRAFE_BANK_SPEED_MUL = 1.6
export const STRAFE_TELEGRAPH_T = 0.5   // s of held-position wind-up between lock and run (see above)
export const STRAFE_RUN_T = 1.0
export const STRAFE_RUN_SPEED_MUL = 4.5

// missileVolley (skies' helicopters): holds a standoff and shoots. State on e._volleyT (s until
// the next volley) / e._volleyLeft (missiles remaining in the current volley) / e._volleyGapT.
//   Movement: seeks to hold MISSILE_STANDOFF px from the player at MISSILE_HOVER_SPEED_MUL
//             (in/out, with the same MISSILE_DEADZONE band diveBomb uses, so it doesn't jitter).
//   Firing:   every MISSILE_INTERVAL s it fires MISSILE_COUNT shots MISSILE_GAP apart, each a
//             run.enemyShots entry aimed at the player's CURRENT position.
// run.enemyShots entries: { x, y, vx, vy, r, dmg, life, turnRate } — the ONLY enemy-owned
// projectile array. Sim steps it: homes toward the player at turnRate rad/s, expires at life <= 0,
// and on overlapping the player (r + PLAYER.radius) damages the PLAYER only (normal armor/
// contactDmgTakenMul path, respects invuln) and emits {type:'explode', x, y, radius: MISSILE_BLAST}.
// It never damages enemies. It IS a projectile for the beyond's gravity wells (they bend it).
// Damages: the PLAYER only.
// v5.6.15: was 300 — OUTSIDE every skies weapon's reach (roar L1 ~216 incl. body, tailSwipe 200,
// debrisToss L1 280), so the chapter's COMMON spawn was effectively unkillable and accumulated:
// measured 217 helicopters alive at t=180 on a kiting starter run, 2796 damage taken vs the
// garden's 969 — the user called the chapter impossible and was right. 180 sits inside the
// starter cone: still a hovering standoff ship, no longer a safe one. (The owl lesson, chapter-
// scale: every enemy must be killable by the chapter's own kit.)
export const MISSILE_STANDOFF = 180
export const MISSILE_HOVER_SPEED_MUL = 0.9
export const MISSILE_DEADZONE = 10      // px band around the standoff where it holds still (cf. DIVE_HOVER_DEADZONE)
export const MISSILE_INTERVAL = 7.5     // s between volleys (v5.6.17: was 4.0 — each heli shoots
                                        // occasionally; the THREAT is the pack, not any one ship.
                                        // v5.13: 6.0 -> 7.5, "helis should launch less missiles")
// v5.13: 2 -> 1. Each missile carries a LOCK TELEGRAPH — a magenta designation line drawn from the
// firing helicopter all the way to a diamond on the player (SKIES_FX.missile) — so missile volume
// is telegraph volume, one-for-one, and helicopters are the chapter's most numerous spawn. One
// rocket per pass keeps the pack pressure (the threat was always the pack, per the note above)
// while halving the magenta on screen.
export const MISSILE_COUNT = 1          // missiles per volley (v5.6.17: was 3 — volume, see FIRE_RANGE)
export const MISSILE_GAP = 0.16         // s between missiles within one volley
// v5.6.15: 240 -> 200. The comment below has ALWAYS said outrunning is the counterplay, but at
// 240 vs PLAYER.baseSpeed 220 the missile was strictly faster — the stated counterplay was
// mathematically impossible (the pull-beam rule again: impossible to IGNORE is fine, impossible
// to ESCAPE is not). Attribution probe: missiles were 81% of all damage taken in the chapter.
export const MISSILE_SPEED = 200        // px/s — under PLAYER.baseSpeed, so running works
// v5.6.17: 1.6 -> 0. Homing was the design smell: every fast attack in this game TELEGRAPHS AND
// COMMITS (pounce "ignoring the player's moves", lineCharge/strafe "no steering", artillery's
// telegraphed shell) — the missile was the lone tracking exception, and tracking is why the swarm
// read as unfair even after the volume cuts. A rocket now flies STRAIGHT at where you were when
// it fired: sidestep it like everything else. Speed stays under PLAYER.baseSpeed on top (Y.f
// pins that), so both escapes work — step out of the line, or simply outrun it.
export const MISSILE_TURN = 0           // rad/s — rockets COMMIT; dodging is the counterplay
export const MISSILE_LIFE = 2.6         // s before a missile fizzles (v5.6.15: was 4.0 — a dodged
                                        // missile is GONE, not circling back for another pass)
export const MISSILE_R = 8              // px, missile hit radius
// v5.6.17: only helicopters ON STATION fire — beyond this range of the player the volley timer
// still ticks but the volley is held (no shot). The accumulated far pack (50-85 alive by late
// run) was multiplying volleys from OFF-SCREEN into a wall of shots; "still too many missiles".
// 620 ≈ just past a phone screen's half-diagonal: everything that shoots you is visible.
// v5.16: 620 -> 460. A dart travels MISSILE_SPEED * MISSILE_LIFE = 200 * 2.6 = 520px and never
// turns (MISSILE_TURN is 0), so at 620 a helicopter on the range boundary was firing rockets that
// COULD NOT REACH the player even if they stood perfectly still — the "it doesn't seem to do
// damage" half of the same bug report. Every one of those doomed darts still cost a designation
// line, a lock reticle, a smoke ribbon and a pool slot. 460 leaves ~60px of margin for a player
// running directly away, so a missile fired is a missile that can land: fewer rockets on screen AND
// a higher fraction of them meaning something.
export const MISSILE_FIRE_RANGE = 460
// Out-of-range reacquire floor (sim.js stepMissileVolley). MUST stay above SKIES_FX.missile.lockT
// (0.6) — that is render's pre-launch telegraph window, and a heli entering range with less than
// lockT on its clock appears mid-warning and fires almost immediately. See the bugfix note at the
// call site.
export const MISSILE_REACQUIRE_T = 0.8
// v5.6.17: hard ceiling on rockets in flight, game-wide. Helis bunch at the standoff ring, so
// per-ship cadence alone can't bound the on-screen volume — measured 94 concurrent at late run
// ("still too many missiles"). A full volley is held (not queued) while the sky is saturated.
export const MISSILE_MAX_LIVE = 18
export const MISSILE_DMG = 14
export const MISSILE_BLAST = 40         // px, explode-event radius on impact (visual only — no splash)

// artillery (skies' tank columns AND its AA-turret elites): a slow mover that shells the player
// from wherever it stands. State on e._shellT (s until the next shell).
// Every ARTILLERY_INTERVAL s it pushes a run.bombs entry (the EXISTING volatile-bomb array —
// { x, y, radius, fuse, duration, dmg }) at the player's PREDICTED position: player position +
// player velocity × ARTILLERY_LEAD. So it telegraphs for ARTILLERY_FUSE seconds, then explodes,
// damaging the PLAYER and ENEMIES alike (stepBombs already does exactly this — no new code path).
// Movement is otherwise a plain slow seek. Elites use the same flag with ARTILLERY_ELITE_* below.
// v5.7.5: a tank only shells while within ARTILLERY_FIRE_RANGE of the player (out of range its
// timer holds near-ready, like MISSILE_FIRE_RANGE). Without the gate every tank on the MAP fires,
// and since tanks are near-unkillable while kiting they accumulate into a full-screen barrage
// (probe: 77 concurrent telegraphs at 5 min) that reads as "the sky wants ME dead", not weather.
export const ARTILLERY_FIRE_RANGE = 640
// Hard cap on live shell/strike telegraphs (artillery + bombardment; volatile death-bombs exempt —
// that's an elite affix, not shelling). The range gate alone fails late-game: tanks are near-
// unkillable while kiting, so 150+ accumulate AROUND the player and the barrage rebuilds inside
// the gate (probe: still 77 concurrent telegraphs). Same backstop shape as MISSILE_MAX_LIVE.
export const SHELL_MAX_LIVE = 6
export const ARTILLERY_INTERVAL = 3.0
export const ARTILLERY_FUSE = 1.1       // s of telegraph (stepBombs grows the warning from fuse/duration)
export const ARTILLERY_RADIUS = 95      // px, blast radius
export const ARTILLERY_DMG = 22
export const ARTILLERY_LEAD = 0.35      // s of player-velocity lead baked into the aim (strafe to beat it)
export const ARTILLERY_ELITE_INTERVAL = 1.8  // AA-turret elites shell nearly twice as often...
export const ARTILLERY_ELITE_RADIUS = 130    // ...wider...
export const ARTILLERY_ELITE_DMG = 30        // ...and harder.

// bombardment signature (skies): continuous area denial, INDEPENDENT of the artillery roster —
// this is the sky itself shelling you. Every signature.rate seconds, pushes BOMBARDMENT_COUNT
// run.bombs entries (same array/step as artillery above, so it's the same explode-both-sides
// contract) at AREA-uniform random points within BOMBARDMENT_SPREAD px of the player.
// v5.7.5: spread 280 → 620 and sqrt-radius sampling. The old numbers put every strike in a tight
// disc centered on the player, density peaking AT the player — targeted fire, not a storm. Wide +
// area-uniform makes lightning mostly ambient (~3% of strikes threaten), with tanks in
// ARTILLERY_FIRE_RANGE carrying the aimed pressure.
export const BOMBARDMENT_COUNT = 2
export const BOMBARDMENT_SPREAD = 620   // px, scatter radius around the player (≈ full screen)
export const BOMBARDMENT_FUSE = 1.2     // s of telegraph
export const BOMBARDMENT_RADIUS = 85    // px, blast radius
export const BOMBARDMENT_DMG = 18

// ---- Crushing & rampage (v5.8 kaiju redesign, skies-only — gated on CHAPTERS[chapter].crush,
// see sim.js's stepCrush/stepRampage) ------------------------------------------------------------
// A structure overlapping the player's crush radius is destroyed OUTRIGHT: no HP, no per-hit
// damage, no partial-crush state — it either overlaps this frame or it doesn't. Rev.1 of this
// redesign gave structures HP and that was cut on review: a structure with HP is a pocket where
// contact enemies get pushed out (stepObstacles' enemy loop) and the player doesn't (the whole
// point of `crush`) — i.e. free shelter every ~260px (CHAPTERS.skies.obstacles.cell), and "high
// HP" would just read as "longer invulnerability" while it whittles down. Instant pop removes the
// exploit by removing the structure (see the design doc §2).
//
// CRUSH_XP: xp awarded per crushed structure, via the same run.gems.push({x,y,xp}) path a kill
// uses (dealDamage, sim.js) — so it rides every existing xp multiplier (passives.xpGain,
// mods.xpMul, GEM_VALUE=1) for free. MUST stay small: stepLevelUp (sim.js) fires at most one
// level per FRAME and hands control to a blocking modal, so crushing a dense run of structures in
// a single rampage would otherwise queue back-to-back level-up screens at exactly the moment the
// design wants uninterrupted momentum (the "XP flooding" hazard, design doc §2). 1 matches the
// smallest per-kill xp in the game (ENEMIES.drone/wisp.xp, both 1) — a crush is worth exactly as
// much as the cheapest kill, never a shortcut past it.
export const CRUSH_XP = 1

// Rampage meter (run.rampage, 0..1; run.rampageT, s of the buff remaining — see state.js). Fills
// on crush (RAMPAGE_GAIN per structure), bleeds continuously at RAMPAGE_DECAY/s the rest of the
// time (after a RAMPAGE_GRACE_T grace window since the last crush, see below) — the decay IS the
// design: a bank filled at leisure rewards patience, a streak that bleeds unless you keep wrecking
// rewards momentum (the kaiju verb, design doc §3). At a FULL bar, RAMPAGE activates for
// RAMPAGE_DURATION s: the crush radius widens from PLAYER.radius to PLAYER.radius *
// RAMPAGE_CRUSH_MUL (stepCrush) — you flatten a swath without touching it.
//
// v5.14: a full bar now ALSO grants invulnerability, RAMPAGE_SPEED_MUL, RAMPAGE_DMG_MUL and
// RAMPAGE_FIRE_RATE_MUL. Rev.1 of the v5.8 redesign granted speed/damage too and they were cut,
// but read the reason carefully — it was never "the buff is too strong", it was a LIFETIME bug:
// p.speed/p.damageMul/p.fireRateMul are assigned once in createRun and only ever read through
// multipliers (stepPlayerMovement / applyDamage / stepWeapons), so writing to them in place leaks
// permanently on a re-trigger or on death mid-buff. Every buff here is therefore DERIVED at its
// read site from run.rampageT, exactly like the crush radius above — one multiplier, re-evaluated
// fresh every frame, structurally incapable of leaking. Nothing is assigned to the player.
//
// v5.9.1 retune ("the meter is unfillable and drains too fast", playtest report — exactly the
// failure design doc §3's "open tuning risk" flagged and deferred to a play pass). The shipped
// numbers (GAIN 0.05, DECAY 0.05/s) needed a sustained >1 crush/SECOND just to break even; nothing
// in the actual field supports that. Derived from the real streaming geometry instead of guessed:
//
//   - CHAPTERS.skies.obstacles is {count:40, cell:260, minDist:160} — streamObstacles' `prob`
//     formula already exceeds 1.0 at this count/cell pair (see CHAPTERS.skies.obstacles' own
//     comment, above), so structures saturate: effectively ONE per 260px cell, minus the ~17%
//     roads carve out.
//   - Committed rate — a player deliberately routing/weaving through a dense block, one structure
//     roughly every cell crossed: 260px / PLAYER.baseSpeed (220px/s) ≈ 1.18s/structure ≈ 0.85/s.
//   - Passive rate — walking a straight line with NO routing effort (crushables don't block
//     movement, so this is the true floor): swept corridor width 2*(PLAYER.radius + avg structure
//     radius) = 2*(22+19) = 82px, structure density ~0.83/(260*260)px² (saturated fill minus
//     roads) ⇒ 82 * 220 * 0.83/67600 ≈ 0.22 structures/s.
//
//   GAIN=0.15, DECAY=0.03/s: committed net rate = 0.85*0.15 - 0.03 ≈ 0.0975/s ⇒ ~9 crushes over
//   ~10.3s to fill a bar from empty — inside the target 8-15s "satisfying, committed stretch".
//   Passive net rate = 0.22*0.15 - 0.03 ≈ +0.003/s ⇒ ~300s (a full RUN_DURATION) to fill from pure
//   aimless walking — i.e. it effectively never fills without deliberately routing, which is the
//   point (raising GAIN alone without lowering DECAY would have kept the passive case net-positive
//   too, at 0.22*0.15=0.033 > the old 0.05 decay's near-miss).
export const RAMPAGE_GAIN = 0.15        // meter fraction added per crushed structure
export const RAMPAGE_DECAY = 0.03       // meter fraction lost per second while NOT in an active rampage (and past the grace window)
// v5.9.1: a couple of seconds between structures (crossing a gap, sidestepping an enemy) at the
// committed ~0.85/s crush rate above is normal cadence, not abandoning the rampage — hold decay off
// for this long after the LAST crush so ordinary gaps don't quietly bleed progress (design doc §3's
// grace-period suggestion). Set by stepCrush on every crush, ticked down by stepRampage.
export const RAMPAGE_GRACE_T = 1.5      // s of no decay after the most recent crush
export const RAMPAGE_DURATION = 5       // s the widened crush radius stays active once triggered
export const RAMPAGE_CRUSH_MUL = 3      // crush radius multiplier while rampageT > 0 (PLAYER.radius * this)
// v5.14 rampage payload. All three are read-time multipliers (see the doc block above for why they
// are never assigned onto the player). Invulnerability is the fourth buff and needs no constant —
// it is one guard at the top of hurtPlayer, which every player-damage path in sim.js funnels into.
export const RAMPAGE_SPEED_MUL = 1.5     // +50% movement speed while rampageT > 0
export const RAMPAGE_DMG_MUL = 2         // +100% weapon damage
export const RAMPAGE_FIRE_RATE_MUL = 1.5 // +50% fire rate

// ================================================================================================
// SKIES ART DIRECTION (v5.10) — docs/superpowers/specs/2026-07-25-skies-art-direction.md
// ================================================================================================
// WHY THIS SECTION EXISTS. The playtest verdict on the shipped chapter was "the designs are very
// ugly", "you are getting lazy with effects, reusing too much, the dash telegraph for planes is the
// same colour as everything, the storm hit, the tank hit, even other chapters". That was not a
// judgement call, it was a measurable fact about the data: every skies threat drew from ONE palette
// object (LIGHTNING.telegraph, above) and two shared Kenney particle textures, so six different
// things that can kill you were rendered in the same electric blue with the same soft round burst.
//
// Everything below is RENDER-ONLY, SKIES-ONLY DATA. Nothing here is imported by sim.js, nothing
// here changes a hitbox, a timing that damage keys off, or any other chapter (grep: no other
// chapter reads a SKIES_*/DISTRICT_SURFACE/ROAD_PAINT/SKIES_LIGHT key). Where an FX timing must
// line up with a real sim timing it REFERENCES the existing sim constant (STRAFE_TELEGRAPH_T,
// ARTILLERY_FUSE, BOMBARDMENT_FUSE, MISSILE_LIFE, RAMPAGE_DURATION) rather than restating it — the
// spec's "arrival clock" rule (an FX clock that finishes early or late is a bug) is only enforceable
// if the clock and the fuse are literally the same number. THAT is why this section sits down here,
// after the skies sim block, instead of up beside LIGHTNING/STORM_VIS where it thematically belongs:
// an object literal is evaluated when the module is, so referencing STRAFE_TELEGRAPH_T from above its
// declaration throws `Cannot access 'STRAFE_TELEGRAPH_T' before initialization` (const TDZ) — i.e. a
// blank page in prod, verified the hard way while writing this. Anything added here that references a
// sim constant must stay BELOW that constant's declaration.
//
// THE THREE PALETTE LAWS (spec §2) — enforce these in review, they are the whole point:
//   1. WARM SODIUM GOLD IS AMBIENCE AND IS NEVER A THREAT. Soft fill at alpha <= 0.16 or a static
//      <= 5px lit rectangle. It never strokes, never moves, never pulses.
//   2. ATOMIC CYAN-GREEN IS THE PLAYER AND IS NEVER A THREAT. If it is on screen, YOU are the danger.
//   3. ICE BLUE-WHITE IS SEARCHLIGHT LIGHT ONLY — taken away from the jet lane and the bomb
//      telegraph, both of which wore it (see LIGHTNING.telegraph's v5.10 note above).
export const SKIES_PALETTE = {
  sodium: 0xffb45a,      // law 1: street-lamp light
  sodiumLit: 0xffd08a,   // law 1: a lit window pane
  sodiumSpill: 0xffc46a, // law 1: interior spill from a structure as it collapses (ONE beat, then dark)
  sodiumMaxAlpha: 0.16,  // law 1's hard ceiling for any soft gold fill
  player: 0x4bffc8,      // law 2: atomic cyan-green — the kaiju and nothing else
  playerHot: 0xd8fff4,   // law 2: the charged/hot end of the same ramp
  searchlight: 0xdfefff, // law 3: ice blue-white, military light, exclusively
  alert: 0xff3b30,       // RED IS RESERVED FOR ALERT (klaxon rings, aviation lamps, the rampage
                         // searchlight flip) — never a telegraph. A red telegraph is what made the
                         // old chapter read as "everything is a bomb".
}

// The shadow-stroke rule (spec §2). Every threat stroke is drawn TWICE: this near-black at
// `width + widen` under the colour on top. That is what lets six SATURATED threat palettes stay
// legible over six district floor tints without raising alpha — the alternative is the mid-tint
// mush the chapter ships today. One helper in render.js (`inkStroke`), used by every telegraph.
export const SKIES_INK = { color: 0x080c14, widen: 2.5, alpha: 0.5 }

// Beyond this distance from the player a telegraph glyph degrades to its impact mark alone (drop
// the rails, the graduations, the trajectory ghost, the designation line). SHELL_MAX_LIVE (6) +
// MAX_STRAFE_LOCKS telegraphs of graduated ticks drawn live do not hold on a phone; the far ones
// carry no information a distant player can act on anyway.
// v5.13: 700 -> 420 ("too much telegraph"). 700 was chosen as a PERFORMANCE budget and it never
// fired as a LEGIBILITY one: BOMBARDMENT_SPREAD is 620, so essentially every sky strike landed
// inside the gate and drew its full descent vector, chevrons, ionisation wash and spark ticks —
// the LOD system existed and was, in practice, never reached. 420 is just outside the player's
// own threat envelope (the widest thing that can reach you from a standing start is a strafe run
// at STRAFE_STANDOFF 420), so everything still drawn in full is something you can act on, and
// the rest degrades to its impact mark. This is the single highest-leverage declutter in the
// chapter because EVERY telegraph drawer reads it.
export const SKIES_TELEGRAPH_LOD_PX = 420

// Full-field flash budget (spec §1.3) — CENTRAL, not per-effect. Photosensitivity, and legibility:
// LIGHTNING.flash.strikeAlpha is 0.55 and a late-run barrage lands several strikes a second.
// render.js keeps `flashCooldown`: a flash inside the window is admitted at `suppressedMul` of its
// requested alpha instead of being dropped (a strike you can't see is worse than a dim one), and
// the rampage screen bloom is forced to alpha 0 on any frame where the flash is above `bloomCutoff`
// — the two never co-render.
export const SKIES_FLASH = { minGap: 0.9, suppressedMul: 0.4, bloomCutoff: 0.05 }

// The second particle pool (spec §1.2). MAX_PARTICLES is ONE global 200-slot ring buffer in
// render.js and `particleCursor` wraps silently — adding persistent missile smoke, crush dust and
// artillery clods to it would evict every hit/kill/pickup particle in the GAME, with no error.
// Only three effects use this pool. The cap is derived, not guessed: `emitters` nearest live
// missiles x (puffLife / puffEvery) = 6 x 14 = 84 live puffs worst case, under `max`.
// v5.13 declutter: max 90 -> 50, emitters 6 -> 4, puffEvery 0.10 -> 0.15, puffLife 1.4 -> 1.0.
// Six simultaneous ribbons emitting every 0.10s for 1.4s each is up to 84 live puffs — a solid
// mauve mass sitting on top of the fight, which is where a lot of "too much" was coming from. The
// helix still reads (it is the only spiral in the game); it is now a trail rather than a cloud.
export const SKIES_SMOKE = { max: 50, emitters: 4, puffEvery: 0.15, puffLife: 1.0 }

// Rampage jamming (spec §3, rampage row): while run.rampageT > 0 every ENEMY telegraph glyph
// visibly breaks up — you are not just stronger, their targeting is failing. Per-frame, per glyph
// segment: drop the segment with probability `dropout`, and scale its alpha by
// `alphaMin + alphaJitter * random()`. Lock diamonds re-snap to a random offset for `resnapFrames`
// frames every ~`resnapEvery` s. On rampage END the dropout decays to 0 over `recoverT` so the
// picture RE-ACQUIRES rather than snapping back (a hard snap reads as a rendering bug).
export const SKIES_JAM = {
  dropout: 0.22, alphaMin: 0.55, alphaJitter: 0.45,
  resnapEvery: 0.5, resnapFrames: 2, resnapPx: 14, recoverT: 0.6,
}

// ---- THE THREAT TABLE (spec §3) ----------------------------------------------------------------
// Six threats separated on THREE AXES AT ONCE — colour family, shape language, motion verb — with
// NO TWO SHARING MORE THAN ONE AXIS. That constraint is the entire fix for "everything looks the
// same"; it is also an acceptance test (spec §9.4/§9.5: a reviewer who has never played must name
// each threat from a still frame, and again from that frame in GREYSCALE — which is what proves the
// separation is carried by shape and composition, not by hue).
//
//   threat     | colour            | shape                        | motion
//   -----------|-------------------|------------------------------|--------------------------------
//   strafe     | halogen + orange  | parallel hairlines + ellipse | travels ALONG a line
//   missile    | magenta           | rotating diamond + helix     | flies AT you, trail persists
//   artillery  | dull olive/ochre  | square box + diagonal hatch  | FALLS; opposed shrink/grow
//   sky        | violet            | leaning vector + chevron ring| DESCENDS, then cracks; sparks rise
//   crush      | grey/material     | squashed skirt + hard shards | SLOW settle; adds geometry
//   rampage    | atomic cyan       | rings + dorsal plates        | sustained pulse OUT FROM YOU
//
// Every INCOMING threat also carries exactly ONE travelling element that arrives on the exact frame
// damage lands (the "arrival clock"), so the player reads four clocks at four speeds instead of "the
// circle got brighter". Each clock's duration below is the SIM fuse itself, by reference.
export const SKIES_FX = {
  // JET STRAFE — the only threat whose damage point TRANSLATES across the screen, and the only one
  // with NO FILLED AREA AT ALL. Orange appears nowhere else in the chapter. Kills the shipped lane's
  // filled electric-blue band + chevrons outright (it was lineCharge's telegraph in a blue coat).
  strafe: {
    // The lane is drawn at the TRUE contact half-width, so what you see is exactly what hits you —
    // PLAYER.radius + the jet's own radius (jets are the 'wisp' archetype, ARCHETYPE_TYPE above).
    // render.js's enemyDrawScale (0.55) shrinks the SPRITE only and must NOT be applied here.
    halfW: PLAYER.radius + ENEMIES.wisp.radius,   // = 34 px
    // Lane length, derived from the sim so the drawn lane is the flight path and not a guess:
    // wisp speed 165 x skies jet speedMul 1.1 x STRAFE_RUN_SPEED_MUL 4.5 x STRAFE_RUN_T 1.0 ≈ 817.
    // (Derived here, not given in the spec — flagged in the handover.)
    laneLen: 820,
    railColor: 0xffffff, railAlpha: 0.45, railW: 1.5,  // two HAIRLINE rails, no fill between them
    poolColor: 0xfff6e2,                               // halogen landing-light pool, ADDITIVE
    poolAlphaMin: 0.10, poolAlphaMax: 0.26,            // ramps as it travels the lane
    poolAspect: 0.22,                                  // long : narrow — the T.landingPool bake ratio
    // ARRIVAL CLOCK: the halogen pool races from the jet's end of the lane to the player's end over
    // STRAFE_TELEGRAPH_T and arrives on the frame the run begins.
    telegraphT: STRAFE_TELEGRAPH_T,                    // 0.5 s (sim constant, above)
    runT: STRAFE_RUN_T,                                // 1.0 s of the run itself
    // The damage is then a STITCH: paired dashes walking the lane at STRAFE_RUN_SPEED_MUL.
    tracer: 0xff6a10, tracerCore: 0xfff2c0,            // tracer orange — unique to this threat
    dashLen: 9, dashW: 3,
    dashPitch: 30,        // px between dash pairs along the lane (derived: ~3x dashLen reads as a
                          // stitch rather than a dotted line — not specified in the spec)
    stitchTailPx: 190,    // v5.13: how far BEHIND the travelling head the dashes are drawn. The
                          // stitch used to be drawn from the lane's origin every frame, so a
                          // finished run was a static 820px orange streak. ~6 dash pairs of tail
                          // keeps it reading as motion.
    gritColor: 0x8f8a7c, gritPx: 6, scorchPx: 3,       // each dash pops a grit puff + a scorch tick
    navRed: 0xff2d2d, navGreen: 0x2dff6a,              // the jet's own nav lights (port/starboard)
  },

  // HELICOPTER MISSILE — the only travelling PHYSICAL projectile, the only SPIRAL in the game, the
  // only mark anchored to the PLAYER, and the only magenta in any of the seven chapters.
  missile: {
    designator: 0xff2d6f,   // the lock diamond + designation line: signal magenta
    reticleCore: 0xffd7e6,  // the pale core of the reticle, and the impact star
    exhaustHot: 0xfff2c0, exhaustCool: 0xffb35c,       // dart exhaust, hot core -> cooler flare
    smokeNear: 0x6a4a5e, smokeFar: 0x3a2c33,           // ribbon fades along this ramp as a puff ages
    impactCore: 0xffd7e6, impactSoot: 0x2a2620,        // magenta star over black smoke ring — NOT
                                                        // explosionBurst's orange spark_04 (kill list §8.5)
    // ARRIVAL CLOCK: a bead crawls the designation line from the helicopter's nose and reaches the
    // diamond on the LAUNCH frame; the diamond shrinks in DISCRETE SNAP STEPS, never a smooth lerp
    // (a mechanical reticle, not an organic pulse — and it reads at 4 fps of information, which
    // survives being one of eighteen on screen).
    lockT: 0.6,             // s of lock before each volley (spec §3; the sim's own cadence is MISSILE_INTERVAL)
    snapSteps: 4,           // discrete shrink steps per second
    diamondPx: 48,          // REF size of the T.lockDiamond bake
    life: MISSILE_LIFE,     // 2.6 s — the dart's own flight (sim constant, above)
    ribbonLife: 1.0,        // s the smoke helix persists AFTER the dart is gone (= SKIES_SMOKE.puffLife)
    // The dart is DEAD STRAIGHT (MISSILE_TURN = 0, a deliberate v5.6.17 sim decision); the SMOKE is
    // what curls. Lateral sine offset that GROWS as the puff ages = a corkscrew seen from above.
    helixAmpPx: 7,          // px of lateral offset at puff birth...
    helixGrowPx: 16,        // ...growing to this by end of life
    helixTurns: 2.4,        // sine cycles over the ribbon's length
  },

  // TANK ARTILLERY (run.bombs, src: 'gun') — the only SQUARE telegraph, the only HATCHED fill in the
  // game, the only DESATURATED telegraph, and the only one that draws a curved line back to a ground
  // origin. That last one is the mass-read (spec §9.7): a screenful of shells visibly RADIATES from
  // scattered tanks, where a screenful of sky strikes is all-parallel.
  artillery: {
    bracket: 0xc9b26a,      // dull ordnance ochre — the L corner brackets + ranging graduations
    hatchBar: 0x0a0d12, hatchFill: 0xc9b26a, hatchAlpha: 0.18,   // the sweeping clock hand
    shellShadow: 0x0a0c10, shellShadowAlpha: 0.55,               // the falling shell's OWN shadow
    ghost: 0xc9b26a, ghostAlpha: 0.28,                           // trajectory arc back to (ox, oy)
    eliteTick: 0x7fffb0,    // radar-green tick on the bracket — AA-turret elites only
    muzzle: 0xffd98a, muzzleT: 0.06,                             // s, the firing tank's flash
    fireball: 0xe8641e, fireballCore: 0x16120e,                  // BLACK-cored fireball: ordnance,
                                                                  // not a cartoon pop
    clod: 0x6b4a2a, clodCount: 10, clodSplashAlpha: 0.35,        // angular clods on real parabolas
    // ARRIVAL CLOCK: the hatched hand sweeps exactly 360 degrees over the fuse and completes ON
    // IMPACT, while the brackets shrink inward AND the shell shadow grows from `shadowStartPx` to
    // the full blast radius — TWO OPPOSED MOTIONS locking on the same frame.
    fuse: ARTILLERY_FUSE,   // 1.1 s (sim constant, above) — the clock IS the fuse
    shadowStartPx: 4,
    graduations: 7, gradEveryLong: 3,                            // ticks per edge; every 3rd is long
  },

  // SKY BOMBARDMENT / LIGHTNING (run.bombs, src: 'sky') — the only VIOLET, the only MASS-PARALLEL
  // telegraph, the only BRANCHING FRACTAL, and the only telegraph whose particles RISE.
  // Parallelism is the whole composition: a screenful of leaning vectors all at STORM_VIS.windAngle
  // says THE SKY IS FIRING; rings radiating from scattered points says THE GUNS ARE FIRING.
  sky: {
    descent: 0xc8b4ff,      // the descent vector dropped from off-frame
    // v5.13: 0xffffff -> the sky's own violet. The chevron ring is the ONE part of this telegraph
    // that survives the LOD gate (it is the impact mark), so it is drawn at full strength for every
    // strike on screen — and BOMBARDMENT_SPREAD scatters those over ~a full screen, where by the
    // signature's own design note only ~3% actually threaten the player. A ring of pure-white
    // chevrons ~145px across is the loudest mark the renderer can make, spent almost entirely on
    // strikes that are ambient. Violet still reads instantly, still belongs to the sky alone, and
    // the SHAPE (inward chevrons vs the gun's corner brackets) is what the v5.10.1 fix below
    // actually relies on to tell the two apart — that distinction is untouched.
    ring: 0xc8b4ff,         // v5.10.1: was `bracket` — the impact ring is now inward-pointing
                            // CHEVRONS (T.skyChevrons), not the artillery's corner brackets. See the
                            // P0 fix note on T.skyChevrons in render.js for why the shared shape was
                            // a real bug, not just a naming one: at TELEGRAPH LOD both threats used to
                            // degrade to "a bracket + a soft disc", which a greyscale reviewer cannot
                            // tell apart from gun vs sky (spec §9.5's own acceptance test).
    ionisation: 0x9d8cff, ionisationAlpha: 0.10,                 // the wash inside the ring
    boltCore: 0xf4fbff, boltGlow: 0xb79bff,                      // matches LIGHTNING.strikeBolt
    scar: 0xe6dcff, scarLife: 2.5,                               // dendritic Lichtenberg burn-in
    sparkTicks: 20,         // discrete crackling ticks on the perimeter — they travel UP, always
    // ARRIVAL CLOCK: a triple chevron slides DOWN the leaning vector, ACCELERATING, and touches
    // ground exactly at fuse = 0. Impact is instantaneous: zero travel, no heading, nothing to dodge
    // sideways — which is exactly why its clock has to be vertical and legible.
    fuse: BOMBARDMENT_FUSE, // 1.2 s (sim constant, above)
    chevrons: 3, chevronGapPx: 26, chevronAccel: 2.2,            // exponent on the descent easing
    dropPx: 560,            // where off-frame the vector starts (matches LIGHTNING.strikeBolt.dropPx)
    boltDur: 0.22,
    branchTrees: 4,         // pre-computed Lichtenberg bakes to pick from, so no two scars match
  },

  // VOLATILE ELITE BOMB (run.bombs, src: 'volatile') — v5.10.1 P0 fix. `ELITE_AFFIXES.volatile` is a
  // chapter-agnostic mechanic (config.js, rolled the same way in every chapter): a timed bomb arms
  // where the elite died. Before this fix skies had NO drawer for it at all — `bombSrc` (render.js)
  // only recognised 'gun'/'sky' and fell everything else through to the generic RED circle telegraph
  // (the exact shape the spec's palette law 3 forbids: "RED IS RESERVED FOR ALERT... a red telegraph
  // is what made the old chapter read as everything is a bomb"), and its detonation fell through
  // handleEvents' `else` branch straight into skyDetonation — a dead elite's corpse-bomb was
  // LITERALLY INDISTINGUISHABLE from the sky's own lightning strike, full-field flash included, in
  // the one chapter whose entire premise is telling the sky apart from the ground. This threat gets
  // its own colour family (sickly acid-green — unclaimed by any of the six main threats, the alert
  // red, the ambience gold or the player/searchlight reservations) and its own shape (a toothed ring
  // that grows and destabilises, the opposite motion of gun/sky's inward-closing brackets) and its
  // own detonation (a hard spike burst, not a fireball and not a bolt).
  volatile: {
    ring: 0xb6e84a, core: 0xe8ff9a,             // acid-green ring + a paler unstable core
    fuse: 0.8,   // = VOLATILE_FUSE below (chapter-agnostic, elite-affix-timed — NOT referenced by
                 // name: VOLATILE_FUSE is declared further down this file, after SKIES_FX, and this
                 // object literal evaluates at module load, so reading it here throws "Cannot access
                 // 'VOLATILE_FUSE' before initialization" — the exact blank-page-in-prod class this
                 // file's own header comment warns about for every other sim constant referenced above)
    spikeCount: 9,                              // detonation: hard acid-green spikes, not a fireball
  },

  // CRUSH ({type:'crush', x, y, kind}) — the ANTI-TELEGRAPH: no warning iconography at all, because
  // it already happened and YOU did it. The only DESATURATED event, the only SLOW one, the only one
  // that REMOVES light (windows snap dark), and the only one that adds PERMANENT geometry.
  // Replaces crushBurst's soft round Kenney circle_05/scorch_01 puff (kill list §8.4) — soft round
  // particles are precisely what makes a collapsing building read as a cartoon dust cloud.
  crush: {
    burstT: 0.9, dustT: 2.5,          // s: shard burst, then the dust skirt lingering and sinking
    skirtAspect: 0.45,                // LOW and squashed, hugging the ground — not a mushroom
    shardMin: 8, shardMax: 10,        // angular hard-edged slabs/tiles/planks with VISIBLE EDGES
    shardGravity: 900,                // px/s^2, fake gravity — shards arc back down and STOP
    scar: 0x0e1116, scarAlpha: 0.5,   // the universal foundation scar under every ruin
    spill: SKIES_PALETTE.sodiumSpill, spillT: 0.35,   // ONE beat of warm interior spill, then dark
    // Material-specific by the crush event's `kind` — the point of the whole redesign in one field:
    // brick does not fall like grain and neither falls like a pier into water.
    byKind: {
      tower: { dust: 0xc9c2b0, dustDark: 0x8d8577 },   // concrete
      house: { dust: 0xa85f45, dustDark: 0x7a4436 },   // brick
      barn:  { dust: 0xc4a06a, dustDark: 0x8f7449 },   // timber
      pier:  { dust: 0x9fc3d8, dustDark: 0xc4a06a },   // harbour spray over splintered timber
      silo:  { dust: 0xdcc98a, dustDark: 0xa8935c },   // spilled grain
      tree:  { dust: 0x6f8a5c, dustDark: 0x46583b },   // leaf litter
      // v6.3: city cover-kills (stepLanes' cover emit, sim.js) force kind: 'dumpster' so a bin
      // doesn't explode into pier "harbour timber" dust. Pale steel shards, rust-dark accent —
      // matches the baked prop's own tint/foot family (T.dumpster: 0xd8d4cc/0x161a20).
      dumpster: { dust: 0xd8d4cc, dustDark: 0xc27b4a },  // steel bin: pale metal, rusted dark accent
    },
  },

  // RAMPAGE (run.rampageT > 0) — a REGIME CHANGE, not an object added to the scene. The only
  // sustained rhythmic effect, the only one sourced AT THE PLAYER, the only cyan, and the only one
  // that changes the LIGHTING STATE of the whole region rather than drawing something new.
  rampage: {
    plateHot: SKIES_PALETTE.playerHot, plateCool: SKIES_PALETTE.player,   // seven dorsal plates,
                                                        // chain-charging tail->head
    plates: 7, chainT: 0.28,                           // s for the charge to run the length of the spine
    bloom: 0x2fe0b4, bloomAlpha: 0.10,                 // screen bloom (suppressed on any flash frame,
                                                        // see SKIES_FLASH.bloomCutoff)
    beat: 0.6,                                         // s per heartbeat ring — the ONLY looping effect
    ringMul: RAMPAGE_CRUSH_MUL,                        // the ring is rolled out to the TRUE widened
                                                        // crush radius (PLAYER.radius * this), so the
                                                        // prettiest effect is also the honest hitbox
    rimLight: 0x4bffc8, rimAlpha: 0.5,                 // cyan rim on every structure inside the ring
    // v5.16: `alert` / `alertWaveSpeed` / `reacquireT` are gone with the light layer — all three
    // described searchlights and klaxons flipping to alert red as a wave, and there are no
    // searchlights left to flip. render.js's rampWaveR (their only consumer) went with them.
    duration: RAMPAGE_DURATION,                        // 5 s (sim constant, above)
  },

  // v5.15: the debris-toss impact ring shipped in v5.14 is REMOVED, not retuned — the throw reads
  // better with nothing on the ground at all, and the chapter is in the middle of a declutter pass.
  // The lob's own arc and shadow already say where it is going; a ring was one more thing to look at.
}

// ---- THE LIGHT LAYER (spec §7) — the chapter's identity -----------------------------------------
// "TOKUSATSU NIGHT — the lights are looking for you." This is the only part of the redesign whose
// art direction is also a VERB: the prettiest thing on screen (a searchlight) is anchored to a real,
// CRUSHABLE structure. Crush the anchor and the cone dies mid-sweep. Palette decision and gameplay
// decision are the same decision, and it needs ZERO sim change — render.js already receives
// {type:'crush', x, y, kind} and can read run.obstacles.
//
// blendMode appears NOWHERE in render.js today, so additive is a new concept for that file and it is
// a CORRECTNESS requirement, not a perf note: every child of the light layer sets blendMode 'add',
// and each sub-container must draw from exactly ONE texture or Pixi v8's batcher breaks on every
// blend-mode/texture transition. Two sub-containers (lamps, cones) = two draw calls. The layer sits
// between the cloud shadows and the entities, so light cuts THROUGH cloud shadow.
// v5.16: THE LIGHT LAYER IS GONE. This export used to carry the searchlight cones, the kerb lamps,
// the klaxon rings, the blinking aviation beacons and the lightning `reveal` gain — spec §7, the
// chapter's stated identity ("TOKUSATSU NIGHT — the lights are looking for you"). It was also, by
// volume, the largest source of moving pale shapes on the floor, and it was cut as clutter along
// with the rest of the v5.13-v5.16 declutter pass. render.js's cones/lamps/beacons and their four
// bakes went with it. The one thing genuinely lost is a gameplay hook: a cone was anchored to a
// CRUSHABLE structure, so flattening the anchor killed the cone mid-sweep. Nothing else read it.
// What survives is the crush LEDGER, which never had anything to do with lighting — it is what
// leaves a permanent ruin and foundation scar where a structure was flattened.
export const SKIES_LIGHT = {
  // The crush ledger — ONE render-local structure serving THREE features, which is why it is worth
  // having at all: `const crushLedger = new Map()` keyed `${round(x/8)},${round(y/8)}` -> {x,y,kind,t}.
  // Over cap, evict the entry farthest from the player; always evict beyond `dropPx`. Cleared in
  // reset(). NEVER WRITTEN BACK TO `run` — render.js does not mutate sim state, and a ledger is
  // exactly the kind of "just this once" that would break that rule permanently.
  //   1. the ruin + scar sprites (SKIES_RUIN), pooled, <= cap;
  //   2. the LAMP BLACKOUT — any kerb lamp within `blackoutPx` of an entry renders at alpha 0, so
  //      ploughing an avenue leaves a DEAD BLACK CORRIDOR through a lit grid. That corridor is the
  //      chapter's whole fantasy expressed as a lighting state, and it costs one distance test;
  //   3. searchlight anchor invalidation.
  // v5.16: only (1) is left — (2) and (3) died with the light layer, so `blackoutPx` is unread.
  ledger: { cap: 96, cellPx: 8, dropPx: 2200 },
}


// ---- Blink behavior flag (v5.4; RETUNED v6.3 for the city pigeon, see below) ------------------
// blink: teleports instead of closing distance. State on e._blinkT (s until the next blink).
// Moves at BLINK_CRAWL_SPEED_MUL of its own speed between blinks (it barely walks — the blink IS
// its movement). Every BLINK_INTERVAL s, if further than BLINK_MIN_DIST from the player, it jumps
// BLINK_DIST px straight toward them (clamped so it never lands closer than BLINK_MIN_DIST, and
// never inside an obstacle — retry along the same heading at BLINK_DIST/2, else skip this blink)
// and emits {type:'explode', x, y, radius: BLINK_FX_R} at BOTH the departure and arrival points so
// the pop reads.
// Damages: the PLAYER only, via ordinary contact damage. No run.* array.
// v6.3: the beyond roster no longer uses this flag (no roster entry carries it) — these constants
// are retuned freely for their new and only owner, city's pigeon, as the fast lane's SPICE (not
// its entirety): faster cadence, longer hop, lands one reaction beat outside contact, quicker
// crawl. A startle-hop reads on a bird.
export const BLINK_INTERVAL = 1.6
export const BLINK_DIST = 240
export const BLINK_MIN_DIST = 70        // px, it never blinks to closer than this — lands one reaction beat outside contact
export const BLINK_CRAWL_SPEED_MUL = 0.55
export const BLINK_FX_R = 30            // px, explode-event radius at the departure/arrival points (visual only)

// phase (beyond's phase flickers): a windowed-vulnerability enemy. State on e._phaseSolid (bool) /
// e._phaseT (s left in the current window). Alternates PHASE_SOLID_T solid <-> PHASE_GHOST_T
// ghosted, forever, starting solid with _phaseT randomised across PHASE_SOLID_T at spawn so a wave
// doesn't blink in unison.
//   solid:  ordinary enemy in every respect.
//   ghost:  takes NO damage (dealDamage returns early — no numbers, no status, no crit), deals NO
//           contact damage, ignores obstacles (passes through), and moves at PHASE_GHOST_SPEED_MUL.
// Status effects already on it (ignite/venom/chill) keep ticking DOWN but deal no damage while
// ghosted. render.js reads _phaseSolid for the alpha.
// Damages: the PLAYER only (while solid), via ordinary contact damage. No run.* array.
// v6.4 pond identity: the tardigrade (CHAPTERS.pond.roster) adopts this same flag — constants stay
// global/shared, not re-tuned per chapter. Measured impact (panel-validated): ghost is
// PHASE_GHOST_T=1.0s of every (PHASE_SOLID_T+PHASE_GHOST_T)=2.6s cycle, i.e. 38.5% damage-immune
// uptime ⇒ roughly ×1.6-1.65 tank TTK once a ring can no longer land every hit. Change these
// constants with that multiplier in view — it moves with the solid:ghost RATIO, not with either
// number alone.
export const PHASE_SOLID_T = 1.6
export const PHASE_GHOST_T = 1.0
export const PHASE_GHOST_SPEED_MUL = 1.4  // it hurries while it can't be punished

// pullBeam (beyond's UFO elites): an abduction beam. State on e._beamState ('idle'|'beam') /
// e._beamT. Every PULL_BEAM_INTERVAL s it opens a beam for PULL_BEAM_T seconds: while open, if the
// player is within PULL_BEAM_RANGE, they are dragged toward the UFO at PULL_BEAM_FORCE px/s
// (applied in stepPlayerMovement AFTER their own input, so you can fight it but not fully beat it
// — PULL_BEAM_FORCE is deliberately under PLAYER.baseSpeed) and take PULL_BEAM_DPS dot-flagged
// damage every STATUS_TICK (same path as run.pools). The UFO holds still while beaming.
// Damages: the PLAYER only. No run.* array; render reads _beamState/_beamT plus the UFO->player line.
export const PULL_BEAM_INTERVAL = 5.0
export const PULL_BEAM_T = 2.0
export const PULL_BEAM_RANGE = 380
export const PULL_BEAM_FORCE = 150      // px/s toward the UFO (< PLAYER.baseSpeed 220, so you can walk out)
export const PULL_BEAM_DPS = 7
export const PULL_BEAM_W = 90           // px, beam width (render-only; the pull is a radius test)

// gravity signature (beyond): run.wells. signature.wells entries are seeded ONCE at createRun,
// rejection-sampled like run.obstacles (same OBSTACLE_FIELD_RADIUS/OBSTACLE_PLACEMENT_ATTEMPTS,
// GRAVITY_MIN_DIST from the origin, GRAVITY_MIN_GAP between two wells' edges). They are permanent
// field furniture: they never expire, never move, never damage, and never block movement.
// run.wells entries: { x, y, r, g } — r = the influence radius, g = GRAVITY_FORCE.
// Every frame, for EVERY projectile in flight — the player's (run.bullets, run.homingShots,
// run.lobs) AND the enemies' (run.enemyShots) — each well within r of it applies an acceleration
// of g × (1 - dist/r) px/s² toward (x, y), added to the projectile's velocity. Speed is then
// renormalised back to the projectile's own speed, so a well BENDS a projectile's path without
// making it faster or slower (that's the whole mechanic: curvature, not chaos). Beams (run.beams),
// orbitals (run.orbs/run.debris), zones (run.pools/blooms/geysers) and novas are NOT projectiles
// and are untouched. Enemies and the player are untouched too — this bends shots, not bodies.
export const GRAVITY_FORCE = 900        // px/s² at the well's center, falling linearly to 0 at r
export const GRAVITY_WELL_R = 190       // px, influence radius
export const GRAVITY_MIN_DIST = 260     // px, min distance from the run's origin
export const GRAVITY_MIN_GAP = 120      // px, min gap between two wells' edges

// Per-chapter difficulty ladder ceiling. Every chapter but the blank rides the shared
// MAX_DIFFICULTY (5); CHAPTERS[id].maxDifficultyCap overrides it when set (blank caps at 3 — see
// CHAPTERS.blank above). Used by state.js's ensureChapterMeta (clamp on load) and main.js's
// endRun/onDifficulty (clamp on unlock), and by ui.js for the chapter card's pip/star count.
export const chapterMaxDifficulty = (id) => CHAPTERS[id]?.maxDifficultyCap ?? MAX_DIFFICULTY

// ---- v6.2 Remaster: per-chapter fiction strings (ui.js reads these through t()) ----------------
// Endings: the one global "You escaped!/Squished" pair undercut every chapter's fantasy (a kaiju
// doesn't "escape"; dying to The Antibody isn't a "squish"). Unlock lines carry the revamp's
// subtle watcher thread — ONE quiet phrase per chapter, nowhere else (spec decision 2).
export const CHAPTER_ENDINGS = {
  body:        { victory: 'You slipped past the immune system! 🎉', death: 'Neutralized… 🩸' },
  pond:        { victory: 'You reached open water! 🎉',             death: 'Filtered out… 💧' },
  garden:      { victory: 'You outgrew the garden! 🎉',             death: 'Swatted… 🍃' },
  undergrowth: { victory: 'You out-hunted the hunters! 🎉',         death: 'Caught… 🦴' },
  city:        { victory: 'You slipped the dragnet! 🎉',            death: 'Pest control wins… 🚚' },
  skies:       { victory: 'They couldn\'t bring you down! 🎉',      death: 'Grounded… 💥' },
  beyond:      { victory: 'You crossed the edge of the map! 🎉',    death: 'Erased from the record… ✨' },
  blank:       { victory: 'THE ANTIBODY FAILED. 🎉',                death: 'DELETED. ⬜' },
}
export const CHAPTER_UNLOCK_LINES = {
  pond:        'The Pond — word of you travels downstream',
  garden:      'The Garden — something marked your trail',
  undergrowth: 'The Undergrowth — the hunters were told to expect you',
  city:        'The City — a report has been filed',
  skies:       'The Skies — this time they\'re not hiding it',
  beyond:      'The Beyond — you were never the only anomaly',
}

// ---- The Blank (v5.24, hidden final boss chapter, see sim.js's stepBossScript) ----------------
// Script table read by stepBossScript: even indices are wave blocks (3 discrete ring-spawned
// waves each, advancing on clear-or-timeout), odd indices are boss phases (one run.enemies entry
// per phase — antibody1/2/3 — so every weapon/element/mod hits it with zero new plumbing). A wave
// block ends and stage++ once its last wave's block is cleared/timed out; a boss phase ends ONLY
// on kill (no timer victory in this chapter) and stage++ starts the next wave block. Killing the
// last boss phase IS the win.
// v6.3.2→v6.3.3 (owner directive): wave counts ×4 again — the inter-phases are a HORDE now, but
// each wave body is worth a third of the xp (BLANK_WAVE_XP_MUL below), so the army is pressure
// and spectacle, not a leveling shortcut (net wave xp ≈ 4/3 of v6.3.1, spread over 4× the bodies).
export const BLANK_SCRIPT = [
  { waves: [ { n: 128, ids: ['probe'] }, { n: 176, ids: ['probe'] }, { n: 208, ids: ['probe','binder'] } ] },
  { boss: 'antibody1' },
  { waves: [ { n: 144, ids: ['binder','probe'] }, { n: 192, ids: ['binder','probe'] }, { n: 224, ids: ['binder','eraser'] } ] },
  { boss: 'antibody2' },
  { waves: [ { n: 160, ids: ['eraser','binder'] }, { n: 208, ids: ['eraser','probe','binder'] }, { n: 256, ids: ['eraser','probe','binder'] } ] },
  { boss: 'antibody3' },
]
export const BLANK_WAVE_XP_MUL = 1 / 3    // v6.3.3: wave (_wave-tagged) bodies only — recruits and the
                                          // antibody keep full value; gem xp is float-safe end to end
export const BLANK_WAVE_TIMEOUT = 20      // s, next wave arrives even if this one isn't cleared
export const BLANK_BOSS_HP = [8800, 24000, 45600] // v6.3.1: ×4 (owner directive); v6.3.2: P2 ×2, P3 ×3 on top —
                                                  // the fight ESCALATES: each phase is a bigger wall than the last
export const BLANK_BOSS_R = 80            // world px, set post-spawn; render bakes at this size
export const BLANK_BOSS_SPEED = 70        // px/s toward the band (P2)
export const BLANK_BOSS_SPEED_P1 = 120    // v6.3.1: P1 closes and circles ~70% faster — menace, not a rule change
export const BLANK_MAX_ALIVE = 700        // blank-only cap (v6.3.1 [panel/bugs]: the shared MAX_ALIVE 400 starved
                                          // nodes/recruits under big waves). v6.3.3: 500→700 with the ×4 waves —
                                          // one block's zero-clear worst case is 512; the cap keeps node/recruit
                                          // headroom above that and truncates only a truly ignored horde.
                                          // Movement/collision are O(n) (see stepEnemyMovement's ponytail note).
export const BLANK_CATCHUP_MAX = 200      // px/s ceiling on catch-up pursuit [panel/fun+gameplay]: 120×2.8=336 would
                                          // outrun even a maxed moveSpeed build (308) — fleeing must keep working
export const BLANK_BOSS_SPEED_P3 = 170    // px/s — P3 drops the standoff and RUNS YOU DOWN (player ~220)
export const BLANK_BOSS_DMG = 15          // contact damage — the band keeps it rare in P1/P2; P3 makes it a chase
export const BLANK_BOSS_XP = 60           // gem worth on each phase kill
export const BLANK_PHASE_LEVELS = 3       // level-ups banked on each NON-final phase kill (paid as xp, chained by stepLevelUp)
export const BLANK_STANDOFF_MIN = 240     // px, standoff flag: back off inside this
export const BLANK_STANDOFF_MAX = 340     // px, close in outside this
export const BLANK_STANDOFF_DRIFT_MUL = 0.5 // in-band sideways drift, fraction of speed — a drift, not a strafe
// Catch-up gear: at band range the antibody ambles (BLANK_BOSS_SPEED in P2, BLANK_BOSS_SPEED_P1 in
// P1), but a player who disengages outruns that forever (they move at ~220) and the fight stalls
// with the boss a screen behind. Past CATCHUP_D it pursues at min(speed × CATCHUP_MUL,
// BLANK_CATCHUP_MAX) — P1's 120×2.8=336 would outrun every build, so the cap keeps both phases
// under the player's ~220; fleeing always works, it just can't park the boss in another postcode.
export const BLANK_STANDOFF_CATCHUP_D = 700    // px, beyond this the boss stops ambling and pursues
export const BLANK_STANDOFF_CATCHUP_MUL = 2.8  // × speed while catching up
// P1 reads your past: run.trail is a ring buffer of recent player positions (sampled every
// BLANK_TRAIL_DT, capped BLANK_TRAIL_MAX ~9s of history). Every BLANK_READ1_T the boss detonates
// the most recent BLANK_READ1_K trail points as bombs (run.bombs, src:'trail'), oldest point
// telegraphing first (staggered fuse) so the blasts chase you along your own path in sequence.
export const BLANK_TRAIL_DT = 0.35        // s between trail samples
export const BLANK_TRAIL_MAX = 26         // samples kept (~9s of history)
export const BLANK_READ1_T = 5.0          // s between P1 trail reads
export const BLANK_READ1_K = 8            // trail points detonated per read (most recent K)
export const BLANK_READ1_FUSE = 0.9       // s telegraph on the oldest point
export const BLANK_READ1_STAGGER = 0.14   // s extra fuse per point (oldest detonates first)
export const BLANK_READ1_R = 46           // px blast radius
export const BLANK_READ1_DMG = 12
export const BLANK_PASTSEEK_LAG = 4       // trail samples behind the player probes aim at (~1.4s)
// P2 holds your present: up to BLANK_NODE_MAX 'bindnode' enemies (formationOnly, spawned by
// stepBossScript) tether the player and MIN-stack a slow by count alive; a node that survives
// BLANK_YANK_T instead yanks the player toward the boss and dies.
export const BLANK_NODE_MAX = 3
export const BLANK_NODE_T = 3.5           // s between node spawns while below max
export const BLANK_NODE_HP = 45           // set post-spawn
export const BLANK_NODE_RING = 170        // px from player where a node appears
export const BLANK_NODE_SLOW = [1, 0.78, 0.62, 0.5] // player speed mul by alive-node count (MIN-stacked)
export const BLANK_YANK_T = 8             // v6.3.1 [panel/gameplay]: at 5s the yank spent all nodes before
                                          // a 3rd could spawn — the 3-node slow tier was unreachable dead content
export const BLANK_YANK_DIST = 150        // px instant drag toward the boss
export const BLANK_YANK_DMG = 10
export const BLANK_SHOT_T = 2.4           // s between P2 aimed shots (run.enemyShots)
export const BLANK_SHOT_SPEED = 240
export const BLANK_SHOT_DMG = 10
export const BLANK_SHOT_R = 8             // px hit radius
export const BLANK_SHOT_LIFE = 3          // s before a shot fizzles
export const BLANK_SHOT_TURN = 0.4        // rad/s homing clamp — outrunnable, but you're slowed
// P3 takes your future: pre-fired erasure bands (run.strips, look:'erase') centred on the
// player's extrapolated position (pos + vel × BLANK_LEAD) — a CROSS (one band across the heading,
// one along it), plus straight aimed shot fans from a boss that is itself chasing (SPEED_P3).
export const BLANK_READ3_T = 2.6          // s between P3 pre-fired crosses
export const BLANK_LEAD = 0.55            // s of velocity extrapolation
export const BLANK_BAND_LEN = 320
export const BLANK_BAND_W = 64
export const BLANK_BAND_FUSE = 0.75       // s telegraph
export const BLANK_BAND_T = 2.0           // v6.3.1 [panel/gameplay]: active duration must stay under the
                                          // desperate cross cadence 2.6×0.75×0.8≈1.56s closely enough that
                                          // double-stars are a beat, not a state (was 2.4)
export const BLANK_BAND_DPS = 26
export const BLANK_DESPERATE_FRAC = 0.25  // any phase below this hp fraction accelerates its read/shot/node
                                          // timers ×BLANK_DESPERATE_MUL (P3's cross uses BLANK_READ3_DESPERATE_MUL)
export const BLANK_DESPERATE_MUL = 0.62
export const BLANK_FAN_N = 3              // shots per P3 fan (odd — center shot dead-on)
export const BLANK_FAN_SPREAD = 0.35      // rad between fan shots
export const BLANK_FAN_SPEED = 310        // px/s, straight (turnRate 0) — dodge the spread, not the shot
// v6.3.1 difficulty-ladder patterns. crossReactive (d2+): each phase borrows a neighboring
// phase's read — P1 fires P2's homing shot, P2 detonates a spread trail read (P1's), P3 detonates
// a short trail echo. Borrowed reads sample every XREACT_STRIDE-th trail point [panel/fun: a
// stationary player — P2's own correct play — must get a spread field, not a stacked blast].
export const BLANK_XREACT_READ1_MUL = 1.5 // P2's borrowed-read cadence, × BLANK_READ1_T
export const BLANK_XREACT_READ3_K = 4     // trail points in P3's borrowed echo
export const BLANK_XREACT_STRIDE = 3      // borrowed reads take every 3rd trail sample (~1.05s apart)
// affinityMature (d3): each phase's OWN read runs deeper.
export const BLANK_READ1_K_MATURE = 16    // full-read points at d3 (not the whole 26-buffer:
                                          // [panel/gameplay] K=26's stagger tail outlives the read cadence AND
                                          // mines an entire standoff-orbit lap; 16 doubles the base 8 cleanly)
export const BLANK_NODE_MAX_MATURE = 4    // P2 node cap at d3 (slow table unchanged — floor stays 0.5:
                                          // [panel/fun] a 0.42 tier made 240 px/s homing shots literally unoutrunnable)
export const BLANK_FAN_N_MATURE = 5       // P3 fan shots at d3
export const BLANK_BAND_ANGLES = [0, Math.PI / 2]                                    // P3 cross
export const BLANK_BAND_ANGLES_MATURE = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4] // d3: 8-arm star
export const BLANK_READ3_DESPERATE_MUL = 0.8 // [panel/gameplay] the cross keeps a MILDER desperation than the
                                             // fans' BLANK_DESPERATE_MUL (0.62): at 0.62 two 8-arm stars were
                                             // permanently live at once — undodgeable geometry, not difficulty
// eraser wake (roster flag) + immuneMemory mutator both drop residue strips (run.strips,
// look:'erase') — wake trails a live eraser, immuneMemory marks where a wave enemy died.
export const BLANK_WAKE_DT = 0.5          // s between eraser residue drops
export const BLANK_WAKE_LEN = 40
export const BLANK_WAKE_W = 30
export const BLANK_WAKE_T = 1.6
export const BLANK_WAKE_DPS = 14
export const BLANK_MEMORY_T = 2.0         // s an immuneMemory residue lives (len/w = BLANK_WAKE_*)
export const BLANK_RECRUIT_T = [6, 7, 3]  // s between recruit spawns in phase 1/2/3 — P3 pulses fast:
export const BLANK_RECRUIT_N = [3, 4, 15] // endless fodder so a low-damage build can still farm xp mid-duel
                                          // (v6.3.2: P2 adds ×2, P3 adds ×3 — the duel gets CROWDED, owner directive)
export const BLANK_ACCEL_MUL = 0.75       // accelResponse: applied to READ1_T/READ3_T/NODE_T/SHOT_T/fuses/WAVE_TIMEOUT

// ---- Gold sinks: pre-run consumables + level-up rerolls (see run fields in state.js) ----
export const CONSUMABLES = {
  revive:    { name: 'Revive Token', icon: '💖', desc: 'Come back once at 50% HP', cost: 150 },
  headstart: { name: 'Head Start',   icon: '🧪', desc: 'Start with 2 level-ups banked', cost: 60 },
  charged:   { name: 'Charged Core', icon: '🔋', desc: 'Starting weapon begins at Lv 2', cost: 80 },
}
export const REVIVE_HP_FRAC = 0.5      // hp restored on revive, as a fraction of maxHP
export const REVIVE_INVULN = 2         // s of invulnerability after reviving
export const REVIVE_SHOVE_RADIUS = 300 // px, radial knockback zone on revive
export const REVIVE_SHOVE_KB = 500     // knockback velocity applied to enemies in the zone
export const REROLL_BASE_COST = 10     // coins, first reroll of a run
export const REROLL_COST_MUL = 1.5     // cost multiplier per reroll already used this run
export const rerollCost = (used) => Math.ceil(REROLL_BASE_COST * Math.pow(REROLL_COST_MUL, used))
// v6.0.4: reroll the classic pre-run anomaly roll from the briefing screen (flat cost, repeatable
// while affordable). Not offered for The Blank (fixed ladder) or the daily (shared seed).
export const ANOMALY_REROLL_COST = 100

// ---- Mutators (pre-run modifiers; see run.mods in state.js) ----
export const MUTATORS = {
  overtime: { name: 'Overtime Shift',    icon: '🏭', desc: 'Way more anomalies, way more XP.',            effects: { spawnMul: 1.4, xpMul: 1.3 } },
  bulky:    { name: 'Bulky Batch',       icon: '🫧', desc: 'Tougher enemies, richer coin drops.',          effects: { enemyHpMul: 1.5, coinMul: 1.6 } },
  caffeine: { name: 'Caffeinated Swarm', icon: '☕', desc: 'Faster enemies, faster leveling.',             effects: { enemySpeedMul: 1.25, xpMul: 1.25 } },
  eliterush:{ name: 'Elite Convention',  icon: '👑', desc: 'Elites arrive twice as often, drop way more.', effects: { eliteEveryMul: 0.55, coinMul: 1.5 } },
  // unstable's elementWeightMul multiplies BUCKET_WEIGHTS.element (rollCard), where it used to
  // multiply the 0.25 per-id ELEMENT_CARD_WEIGHT pre-filter and saturate at min(1, 0.25*mul).
  // Same number in a different reader is a different mutator: x3 on the bucket measured 38.6% of
  // all cards elemental (against a 17.5% base and the 16.5% the shipped x3 delivered), i.e. above
  // the 37% the Track B plan names as the pathology to avoid, for the same -15% damage cost. x2
  // measures 29.6% at 2 slots / 30.3% at 4 — a 1.7x lift on a bucket that is already the
  // mutator's subject. Re-measure this share if the element bucket weight ever moves.
  unstable: { name: 'Unstable Physics',  icon: '🌀', desc: 'Elemental infusions everywhere, weapons hit softer.', effects: { elementWeightMul: 2, playerDmgMul: 0.85 } },
  glass:    { name: 'Glass Goo',         icon: '💔', desc: 'You hit much harder but take much more.',      effects: { contactDmgTakenMul: 1.75, playerDmgMul: 1.35 } },
  // exclude: the lane's magnet is already infinite (stepPickups), so this one's upside would be
  // a lie there — it'd roll as pure downside without saying so. v6.4: pond excluded too — a flat
  // player-slow stacked on the currents/eddy chapter breaks the escape-margin math (see the v6.4
  // "Pond identity" plan).
  sticky:   { name: 'Sticky Floor',      icon: '🍯', desc: 'You move slower, but pickups fly to you.',     exclude: ['beyond', 'pond'], effects: { playerSpeedMul: 0.85, magnetMul: 1.7 } },
  jumbo:    { name: 'Jumbo Anomalies',   icon: '🎈', desc: 'Big squishy enemies, bonus XP and coins.',     effects: { enemyRadiusMul: 1.25, enemyHpMul: 1.25, enemySpeedMul: 0.9, xpMul: 1.2, coinMul: 1.2 } },
  // v5.24: The Blank's named difficulty-ladder modifiers (CHAPTERS.blank.modsByDifficulty) are
  // MUTATORS entries too, so the existing HUD/pause chip machinery renders them for free — but
  // `hidden: true` pulls them out of randomMutators/dailyMutators' pools (below) since they're
  // assigned by the chapter's fixed ladder, never rolled. Their `effects` are a no-op: the actual
  // behavior (faster telegraphs, death residue) is read directly off run.mutators by sim.js.
  accelResponse: { name: 'Accelerated Response', icon: '⚡', desc: 'its telegraphs are 25% faster',      hidden: true, effects: {} },
  immuneMemory:  { name: 'Immune Memory',        icon: '🧠', desc: 'slain cells leave erasing residue',  hidden: true, effects: {} },
  crossReactive: { name: 'Cross-Reactivity',    icon: '🔀', desc: 'each phase steals a second attack from another',            hidden: true, effects: {} },
  affinityMature:{ name: 'Affinity Maturation', icon: '🧬', desc: 'every attack grows — more bombs, more nodes, a wider star', hidden: true, effects: {} },
  // v5.25: chapter anomalies — each turns ITS chapter's signature mechanic up, paired with a
  // small reward like every generic entry above. `chapters` scopes the roll to where the
  // mechanic exists: a modifier that references a system the chapter doesn't run is noise, not
  // challenge (`exclude` on sticky above is the same rule from the other side). The body has no
  // signature, so it keeps the generic pool alone.
  riptide:      { name: 'Riptide',        icon: '🌊', desc: 'The currents shove twice as hard. Richer coins.',            chapters: ['pond'],        effects: { currentForceMul: 2, coinMul: 1.25 } },
  overscent:    { name: 'Overscent',      icon: '🌼', desc: 'Pheromone trails linger twice as long. Bonus XP.',           chapters: ['garden'],      effects: { pheromoneLifeMul: 2, xpMul: 1.15 } },
  // v6.5 panel: chance x1.5 is already a net player buff (free enemy-side trap clears scale with
  // it too) — coinMul was 1.3 pre-panel, trimmed to 1.15 so an attentive player kiting around the
  // denser field doesn't also collect a near-full generic-mutator coin bonus on top.
  trapseason:   { name: 'Trap Season',    icon: '🪤', desc: 'Half again more snap traps. Richer coins.',                  chapters: ['undergrowth'], effects: { trapCountMul: 1.5, coinMul: 1.15 } },
  rushhour:     { name: 'Rush Hour',      icon: '🚦', desc: 'Traffic barely lets up. Richer coins.',                      chapters: ['city'],        effects: { trafficIntervalMul: 0.6, coinMul: 1.25 } },
  barrage:      { name: 'Carpet Barrage', icon: '🎯', desc: 'The bombardment barely pauses. Bonus XP.',                   chapters: ['skies'],       effects: { bombardIntervalMul: 0.6, xpMul: 1.2 } },
  supermassive: { name: 'Supermassive',   icon: '🕳️', desc: 'The wells pull far harder — nothing flies straight. Richer coins.', chapters: ['beyond'], effects: { wellForceMul: 1.8, coinMul: 1.25 } },
  toxicShock:   { name: 'Toxic Shock',    icon: '🧪', desc: 'Elite acid pools burn far hotter. Richer coins.', chapters: ['body'], effects: { acidPotencyMul: 1.6, coinMul: 1.25 } },
}
// Every key mergeMutatorMods can produce, all defaulted to 1 (neutral) before mutator effects
// multiply in. sim.js applies each of these at one specific point — see sim.js's module doc.
const MUTATOR_MOD_KEYS = [
  'spawnMul', 'enemyHpMul', 'enemySpeedMul', 'enemyDmgMul', 'enemyRadiusMul',
  'contactDmgTakenMul', 'playerDmgMul', 'playerSpeedMul', 'coinMul', 'xpMul',
  'eliteEveryMul', 'elementWeightMul', 'magnetMul', 'acidPotencyMul',
  'maxAliveMul',        // maxAliveFor (the concurrent-enemy cap; set per chapter, see MAX_ALIVE)
  // v5.25 chapter-anomaly knobs (each consumed at its signature's one site):
  'currentForceMul',    // currentForce (pond drift field strength)
  'pheromoneLifeMul',   // dealDamage's trailFollow drop (garden trail lifetime)
  'trapCountMul',       // streamTraps (sim.js — undergrowth snap-trap cell chance)
  'trafficIntervalMul', // stepLanes cadence (city; <1 = more often, like eliteEveryMul)
  'bombardIntervalMul', // stepBombardment cadence (skies; <1 = more often)
  'wellForceMul',       // wellForce (beyond gravity bend on every projectile)
]
// Pure helper: given a list of mutator ids (run.mutators), returns the full run.mods object —
// every key above defaulted to 1, with each selected mutator's effects multiplied in. Unknown
// ids are ignored so a stale/typo'd id in a save never throws.
export function mergeMutatorMods(ids) {
  const mods = Object.fromEntries(MUTATOR_MOD_KEYS.map((k) => [k, 1]))
  for (const id of ids ?? []) {
    const mut = MUTATORS[id]
    if (!mut) continue
    for (const [k, v] of Object.entries(mut.effects)) mods[k] *= v
  }
  return mods
}

// ---- Daily Anomaly (deterministic daily mutator pair) ------------------------------
// A fixed number of mutators are "featured" each real-world day, the same for every
// player: dailyMutators(todayKey()) hashes the date string into a PRNG seed so the
// pick is stable across repeated calls/sessions without persisting anything.
export const DAILY_MUTATOR_COUNT = 2

// Local-date YYYY-MM-DD key (not UTC, so the daily set flips at local midnight for
// the player rather than at a possibly-yesterday UTC boundary).
export function todayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Tiny FNV-1a-style string hash -> 32-bit seed.
function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// mulberry32: small deterministic PRNG (same construction test/sim-test.js uses to seed
// Math.random) — kept as a private, self-contained generator here so dailyMutators never
// depends on (or perturbs) the global Math.random stream.
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Deterministic: the same dateKey always returns the same DAILY_MUTATOR_COUNT distinct
// mutator ids (order is part of the result, but callers should treat it as a set).
export function dailyMutators(dateKey, chapterId) {
  const rand = mulberry32(hashString(dateKey))
  const pool = mutatorPool(chapterId)
  const picked = []
  for (let i = 0; i < DAILY_MUTATOR_COUNT && pool.length > 0; i++) {
    const idx = Math.floor(rand() * pool.length)
    picked.push(pool[idx])
    pool.splice(idx, 1)
  }
  return picked
}

// ---- Elite affixes (rolled at elite spawn; see enemy.affixes in state.js) ----------
export const ELITE_AFFIXES = {
  shielded:  { name: 'Shielded',    icon: '🛡️' },
  splitter:  { name: 'Splitter',    icon: '🧬' },
  volatile:  { name: 'Volatile',    icon: '💥' },
  pacer:     { name: 'Cheerleader', icon: '📣' },
  anchored:  { name: 'Anchored',    icon: '⚓' },
  frenzied:  { name: 'Frenzied',    icon: '😤' },
  gilded:    { name: 'Gilded',      icon: '👑' },
}
export const AFFIX_SECOND_AT = 150   // s; elites spawned after this roll 2 distinct affixes instead of 1
export const SHIELD_HP_FRAC = 0.5    // shielded: shield active while hp > maxHP * this fraction
export const SHIELD_DMG_MUL = 0.6    // shielded: incoming damage multiplier while the shield is up
export const SPLITTER_COUNT = 4      // splitter: wisps spawned around the corpse on death
export const VOLATILE_FUSE = 0.8     // s, volatile: delay between death and the bomb's detonation
export const VOLATILE_RADIUS = 120   // px, volatile: bomb blast radius
export const VOLATILE_DMG = 20       // volatile: damage dealt to the player (and enemies) caught in the blast
// ANOMALIES.unstableCores (v6.7.7): the corpse bomb that anomaly grants is a CORE, and its
// enemy-side damage is VOLATILE_DMG * hpScale(t) * this. The rolled `volatile` affix is untouched.
// WHY THE ENEMY SIDE ALONE SCALES: one constant was doing two jobs against two different
// denominators. The player side is priced against player maxHP, which does not follow hpScale
// (~100 -> ~200 over a run, from maxHP picks only); the enemy side is priced against enemy HP,
// which is base * hpScale and reaches 7.6x by t=300. A flat 20 therefore stops killing a
// full-health drone at t=0 and a full-health wisp at t=90 — measured, with the card FORCED ON for
// whole runs, at 1.70 blast kills of 933 = 0.18% of a run's kills, i.e. the tier's only card was
// a non-event. Scaling the enemy side holds the blast at "clears the trash it catches" for the
// whole run instead of only at t=0: 20 * 1.6 * hpScale against a drone's 20 * hpScale *
// difficultyHpMul(d) kills a FULL-HEALTH drone outright up to d3 and a wisp at every difficulty,
// at any t — which is what makes the chain below possible at all — while the player's own risk
// stays the flat, foreseeable 20 the spec priced as the card's intrinsic cost. The spec names this exact constant as "the knob if it should stay dangerous".
// CHAINS ARE UNCAPPED, on the owner's call ("that's the fun of crazy combos"). They are also the
// only reason the card's headline fantasy exists: an elite has base.hp * 5 HP, so no blast of any
// size derived from VOLATILE_DMG can ever detonate the next ELITE — the cascade has to propagate
// through the trash the blast kills, and that is what stepBombs implements.
export const CORE_BLAST_ENEMY_MUL = 1.6
export const PACER_RADIUS = 160      // px, pacer: range within which other enemies get sped up
export const PACER_SPEED_MUL = 1.3   // pacer: speed multiplier applied to enemies within PACER_RADIUS
export const FRENZY_HP_FRAC = 0.3    // frenzied: speed boost kicks in once hp drops below this fraction of maxHP
export const FRENZY_SPEED_MUL = 1.6  // frenzied: speed multiplier once below FRENZY_HP_FRAC
export const GILDED_HP_MUL = 1.3     // gilded: extra maxHP/hp multiplier at spawn (stacks with ELITE.hpMul)
export const GILDED_COIN_MUL = 2     // gilded: death coin count multiplier (on top of ELITE.coins)
