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
  // the same player reads in the same session — the pre-run MUTATORS ("Reroll
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
// DELIVERED, measured on the shipped roll (body/3, tier-eligible, 6000 seeded screens per row —
// run PB4's own `sample`, which asserts every row). Not `pool-probe --rerolls=N`: at 40 runs it
// swings 3.6pts row to row, wider than the cap effect this table exists to show.
// "normal" is the share of TIERED cards, i.e. excluding weapon upgrades, which carry
// UPGRADE_RARITY and no tier at all:
//     rerolls   normal   epic+   mean rarity mult
//        0      53.4%    11.8%        1.495
//        1      49.6%    13.2%        1.547
//        2      45.4%    13.9%        1.583
//        3      41.3%    15.1%        1.636
//        4      41.2%    15.3%        1.627   (equal to 3 within noise: the cap is exact)
// v7.79 moved every row down: the elements rework took the element bucket from 18 to 7.5 AND made
// an element card decline `normal` outright, so the pool carries fewer normal cards before a
// single reroll is bought.
// So three rerolls are worth +9.4% on the average card and +28% relative on epic-or-better. A
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
//   utility 21 — the other seven passives (moveSpeed/magnet/fireRate/damage/crit x2/xpGain),
//     3.0% of cards each. This was 11 (1.6% each) and is where v7.7's 10 freed points went; see
//     the weapon/mod note below for why they were freed and why they landed HERE. Raising the
//     BUCKET is not the thing the paragraph above forbids — that is rebasing the PASSIVES base
//     VALUES, which is regressive across slot counts; a bucket weight is flat in slots.
//   v7.7 — weapon 22 -> 17 and mod 30 -> 25, the owner's call after playing the shipped table:
//     weapon + mod cards are the two kinds that both read as "a weapon roll" (every mod card is
//     titled `<Weapon> upgrade`), so their COMBINED share is the number a player actually feels,
//     and at 22+30 it was 52% — measured 49.9-51.7% of cards across all seven chapters at 4
//     slots. It is now 42%. The 10 points went to utility rather than to defence (which is held
//     at parity by the note above) or to element (which is the mutator `unstable`'s subject:
//     element 18 -> 22 measured 35.3% elemental cards under unstable, against the 37% the plan
//     names as the pathology, and would have forced elementWeightMul to be re-priced with it).
//   v7.79 — element 18 -> 7.5, shipped with the elements rework. Each element card is now worth
//     far more (the ladder starts at rare and there are only four of them), so at 18 the slate
//     was routine; at 7.5 an element is a FIND, and the freed weight goes to the base attributes.
export const BUCKET_WEIGHTS = { defense: 19, utility: 21, mod: 25, weapon: 17, element: 7.5 }
export const DEFENSIVE_PASSIVES = ['armor', 'regen', 'maxHP']
// Inside the weapon bucket, an UPGRADE of an owned weapon competes at this flat weight while a
// `New!` card competes at its weapon's inherent rarity weight (times newWeaponChance — see
// NEW_WEAPON_FADE below). Rarity TILTS acquisition; it must never touch LEVELLING. Weighting
// owned weapons by rarity too was measured handing beyond's normal starter 68.8% of its weapon
// cards and making city's mythic starter the hardest weapon in the chapter to level — the pool
// choosing your build for you.
// "Tilts", not "gates", and the difference is measured: with only the starter owned, beyond
// offers the legendary `hole` on 2.49% of cards against the epic `pulsarSweep`'s 4.08%, but
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
// v7.20 (owner, from play): A RUPTURE IS AN ORDINARY CARD ON A REROLL. v6.7.9 memoised the tier's
// answer for the whole screen so a reroll could neither draw it nor throw it away — which stopped
// coins buying the rarest tier, but meant an unwanted Rupture OCCUPIED A SLOT on every re-deal.
// Reproduced: five paid rerolls of one screen returned Overload in all five, only changing slot,
// so on a 2-slot screen the player was paying an escalating price for half a reroll, forever.
// The tier is now rolled fresh on every deal like everything else, at this fraction of its natural
// weight on any deal the player PAID for. Rerolling can therefore lose a Rupture as well as find
// one — which is the point: it is a card, not a fixture.
// The anti-purchase rule (spec B6) is kept by the two things that actually carry it: the halved
// weight, and PITY CHARGED AT MOST ONCE PER SCREEN (see _screenAnomalyPaid in sim.js) so a player
// cannot spend the dry-run credit twice on one screen or burn it repeatedly by rerolling.
export const ANOMALY_REROLL_MUL = 0.5
// ...and REROLLING ONE AWAY COSTS HALF THE DRY-STREAK CREDIT, not all of it (v7.30, owner).
// The credit (_screensSinceAnomaly) is spent when the tier is OFFERED, which was a fair trade while
// the offer was guaranteed to stay on screen until the player acted on it. v7.29 broke that link:
// a re-deal can now lose a Rupture, so a reroll bought for an unrelated reason could silently burn
// an 18-screen streak and hand back nothing. The numbers: the weight climbs 12 -> 45 over 18 dry
// screens, i.e. 6.6% -> 20.8% chance a screen carries the tier, and the re-deal that loses it rolls
// at 3.4%. Losing all of that invisibly, for a reroll you wanted for a different reason, is not a
// trade anyone agreed to.
// Refunding it in FULL was the other option and was rejected: declining a Rupture must still cost
// something, or the tier simply re-offers until accepted. Half is the price of changing your mind.
export const ANOMALY_REROLL_PITY_REFUND = 0.5
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

// ---- Anomaly tuning (v7.2) ----------------------------------------------------------
// One block per card that carries a number, so the slate's balance lives here and the trigger
// sites in sim.js stay free of magic numbers (the standing rule). Each constant names the
// measurement or the ruling it came from — several of these were set by the owner directly and
// must not be "corrected" by eye.

// TIME DEBT. run.time advances at this rate; every consumer already derives from it (hpScale,
// dmgScale, spawnRate, eliteEvery, victory at RUN_DURATION), so the whole run compresses.
// 1.5x (not 2x) is the owner's number. The XP compensation is NOT decoration: measured at 1.5x
// with no upside the card cost ~3 levels over a run and bought nothing, which is a trade, not a
// pivot. With it the card is roughly power-neutral and sells INTENSITY — the same run in 200
// real seconds at 1.5x density.
export const TIME_DEBT_MUL = 1.5
export const TIME_DEBT_XP_MUL = 1.5
// BRITTLE. The pure run-ender the rarity licence exists to permit. maxHP 1 does NOT accidentally
// grant immortality through HURT_CAP_FRAC: Math.round(1 * 0.5) is 1 in JS (half rounds up) and
// hurtPlayer's non-dot branch floors at 1 anyway. One hit, one death, as intended.
export const BRITTLE_MAX_HP = 1
export const BRITTLE_DMG_MUL = 4
// BERSERK. No cooldown and no threshold, by owner ruling, and the v6.3.4 turtle objection does not
// hold: `armor` measures 2.4-3.7 in real runs while dmgScale(300) = 2x puts late contact at 16-30
// before difficulty, so armor blocks 10-20% of a hit rather than flooring it to nothing.
// Sustaining the window therefore costs 16-30 HP every PLAYER.invulnTime (0.75s) — 21-40 dps
// against ~150 maxHP, and it gets WORSE as dmgScale climbs. The cost is the damage.
export const BERSERK_DURATION = 5
export const BERSERK_DMG_MUL = 2
// OVERLOAD. The cost is per SECOND, not per shot — measured: fires/s spans 0.5/s (city, a beam) to
// 3.8/s (body) across chapters, a 7.6x lottery, and "per shot" is undefined for a beam entirely.
// This is the same error the Ipecac count table exists to avoid. 2x (not 3x) is the owner's call:
// "otherwise life would drain instantly".
export const OVERLOAD_FIRE_MUL = 2
export const OVERLOAD_DMG_MUL = 2
// THE COST RIDES dmgScale, and this is the v7.4 fix for the slate's one measured defect. A FLAT
// drain made OVERLOAD strictly better than not taking it, which is the one thing the rarity
// licence does not cover. Measured, body d3, 120 runs, kite-and-collect bot (a floor on player
// skill, not a model of one), against a take-an-anomaly-and-skip control:
//   win 90.0% vs 25.0% — +65 points, +75% kills, level 27.4 vs 17.0.
// The HP ledger is why, and it is the whole argument: 4x dps clears the field before anything
// reaches you, so the card LOSES 144.7 HP to its own drain but saves 170.8 HP of contact damage
// (real hits/run 1.4 against 9.9). Net cost NEGATIVE — 176.0 HP spent against the control's 205.9.
// The spec's "75% win, costs 25 points" was taken at d1 where the baseline was already 100% (it
// says so: "saturated and blind") and with the drain emulated from t=0 rather than from the level
// the card is actually offered at.
// A flat cost cannot work here BY CONSTRUCTION: the contact damage the card prevents grows with
// dmgScale all run, so the cost has to grow with it too or the trade inverts. 0.75 -> 1.5 HP/s
// over 300s integrates to ~250 HP against the flat 145. Bracketed by measurement rather than
// guessed — flat 1.5 measured 19.2% win and flat 2.0 measured 2.5%, so the ramp lands between the
// shipped card and the one that is unplayable, which is where a licensed-extreme trade belongs.
// RE-MEASURED AFTER THE CHANGE, same rig and seeds: win 90.0% -> 32.5%, which is +7.5 against the
// skip control and exactly level with the do-not-take-any-anomaly baseline. It is still a big
// power card — 1125.7 kills against the control's 752.9, level 25.0 against 17.0 — but it now
// dies: 81 deaths in 120 runs, median 272.8s. A much stronger run that ends slightly more often
// than not taking it IS the trade this card is supposed to be.
// v7.15: 0.75 -> 1, from play. The measurements above describe the SHAPE of the trade — the cost
// has to ride dmgScale or it inverts — and that is still true; only the constant moved, so read
// them as history rather than as a bound on this number. Playtest sets it.
export const OVERLOAD_HP_PER_SEC = 1
// AVARICE. THE HEAL IS THE OPEN NUMBER ON THIS CARD, and the figure it was originally set against
// was wrong twice over. The original pricing said "593 coins/run, and every coin is value 1, so
// that is also the PICKUP count", concluding ~83-111 heals and setting 5 HP to reach 1.4-1.85 HP/s.
// Both halves fail:
//   1. coinsEarned is NOT the pickup count. It multiplies by p.coinGainMul * run.mods.coinMul
//      (~2x at a realistic shop), so city d2 measures 740.5 coins from only 370.3 pickups. The
//      denominator this card converts is about half what the pricing used.
//   2. A MORTAL run picks up far fewer than an immortal probe: 99.7 (body) to 167.1 (beyond).
// Measured at HEAD (body d3, 120 runs, kite-and-collect bot): 4.2 heals/run = 21 HP, against a
// stated design target of 415-555 HP. One twentieth.
// LEFT AT 5 PENDING THE OWNER'S CALL, deliberately, because the data says a flat number cannot fix
// it: the card measures +2.5 points of win rate in body and +12.0 in beyond (20.7 heals/run there),
// so raising the heal to reach body would make beyond's arm roughly three times stronger again.
// This is a chapter-variance problem wearing a tuning problem's clothes.
export const AVARICE_HEAL_CHANCE = 0.2
export const AVARICE_HEAL_HP = 5
export const AVARICE_COIN_DROP_MUL = 0.7
// A coin past COIN_CAP_PER_RUN still heals. The cap bounds the META payout; runs already measure
// 791/999 against it, so without this the card would silently switch off late in exactly the runs
// that need it. The healing is deliberately NOT capped by the coin cap.
// BLOOD PACT. Owner's numbers. +1%/kill was the first draft and ends the run at x6.7 (body) to
// x19.9 (city) — that is not "explodes", it is "the last two minutes have no threat left", which
// the rarity licence does not cover. At these rates: body x1.68, city x2.99, beyond x2.77.
// RE-MEASURED v7.4, AND THE PREMISE HAS MOVED. The two-clause design rests on "kills vary 3.3x
// across chapters while elites are invariant", so the per-kill clause was the chapter lottery and
// the per-elite clause the fair one. Re-run on the shipped pipeline (immortal probe, d2, 30 runs):
//   kills/run   body 1411.9 / beyond 1636.4 / city 1968.4  -> a 1.39x spread, not 3.3x
//   elites/run  body 10.63  / beyond 8.37   / city 10.30   -> still invariant, as claimed
//   end state   body x2.39  / city x2.93    / beyond x2.66
// The body row in the original table (x1.68, off 569.9 kills/run) does not reproduce at all; the
// same rig now measures 2.5x the kills there. Most of that is v7.1.0's per-chapter hpScale tail,
// which lengthened body runs. So the "3x chapter lottery" this card was flagged for is largely
// gone — the end states sit in a x2.4-x2.9 band — and the argument for rebalancing the two clauses
// toward elites is correspondingly weaker. Still an owner call; the numbers are the user's.
export const BLOOD_PACT_PER_KILL = 0.001
export const BLOOD_PACT_PER_ELITE = 0.01
// SUBMISSION. A killed elite does not die — it turns, and fights the swarm for you.
// THE DENOMINATOR IS MEASURED, NOT GUESSED: full 300s runs land 8.6-10.6 elites, and that count is
// chapter-INVARIANT because `eliteEvery` is a TIME cadence, not a kill cadence (spec
// 2026-08-07-upgrade-pool-design.md:1157-1163). So the duration below is "how much of a run is
// spent with an ally out", against ~9 triggers: at 20s that is ~180 ally-seconds of a ~300s run,
// and stacking (uncapped, owner's call) is what happens when two elites die inside one loan.
// AND THE CARD BRINGS ITS OWN ELITES. Owner's call, and the measurement is why: at the base
// cadence a run sees 8.6-10.6 elites, so a 20s loan means one ally at a time, occasionally, and
// the uncapped stacking the card is specced around would essentially never happen. Tripling the
// cadence is what makes the card's own premise reachable — and it is the difference between "a
// nice thing that sometimes occurs" and a card anyone would spend an anomaly slot on.
// Read-time only, never folded into run.mods: that table is the run's MUTATOR product, fixed
// before the run, and writing an anomaly into it would corrupt it permanently (the same reason
// RAMPAGE's multipliers are read at use). Applied at spawnEnemy's cadence step.
// Knock-on, stated rather than hidden: elites carry ELITE.coins and ELITE.xpMul, so 3x elites is
// also ~3x elite coins and elite xp. On a jackpot that is intended, but it is a second buff.
//
// ⚠ SHARED WITH UNSTABLE CORES since 2026-08-18 (owner: "when picking up the exploding elites,
// there should be 3x more elites, like picking submission"), which is why it is no longer named
// after Submission. Both cards are jackpots gated on the same elite kill and both are dead weight
// at the base cadence — a card about what elites drop is worth as little without elites as a card
// about what they become.
//
// THE TWO DO NOT COMPOUND. Holding both is intended and the spec names the combination as the
// point (an ally's expiry fires its core), but multiplying the cadence twice is 9x elites, which
// is not "three times as often" twice over — it is a different game mode. spawnEnemy applies this
// once if EITHER card is held.
export const ELITE_SURGE_EVERY_MUL = 1 / 3   // interval multiplier -> three times the elites
export const SUBMISSION_DURATION = 20      // seconds the loan runs before the ally falls
export const SUBMISSION_DMG_FRAC = 0.5     // the spec's "50% of your damage"; fire rate and crit are 100%
// Contact is the ONLY attack most of the roster has — pounce, dive, charge and strafe all resolve
// to stepContactDamage, and of the four run.enemyShots push sites three belong to The Blank's
// scripted boss. So this cadence, not any weapon table, is what an ally's damage output IS.
// WHAT A TURNED ELITE STOPS DOING. Every one of these points at the PLAYER by construction and
// bypasses the retarget seam, so without stripping them your ally keeps shelling you (skies
// artillery), laying damaging pools under you (pond soapTrail), abducting you (beyond pullBeam),
// disgorging HOSTILE minions (city spawner) or enraging the swarm it is supposed to be fighting
// (undergrowth flashlightCone). Derived from every chapter's `eliteFlags` plus the roster flags
// that can land on an elite (garden's spider webZone, skies' helicopter missileVolley).
//   `acidPool` is deliberately NOT here: it is an on-DEATH flag and it already fired when the
// elite died, one statement before the turn.
// ponytail: stripping beats a per-flag suppress-or-retarget table. Contact is the whole arsenal
// for the rest of the roster anyway (pounce, dive, charge and strafe all resolve to contact
// damage), so the fidelity lost is one turret's aim. Upgrade path is retargeting `artillery`,
// whose shells already damage enemies via run.bombs.
export const SUBMISSION_STRIP_FLAGS = [
  'soapTrail', 'webZone', 'wake', 'artillery', 'missileVolley', 'spawner', 'flashlightCone', 'pullBeam',
]
export const SUBMISSION_HIT_EVERY = 0.5    // seconds between an ally's contact hits on one target
// BLOOD MONEY. Owner overruled a maxHP proposal: flat current HP, and the objection ("that is 23
// rerolls") was overstated because it priced against regen AVERAGED across runs (0.41/s) when
// regen is bimodal — most runs never pick it, so the real budget is maxHP alone, ~11 rerolls.
// The card's point is that it RE-PRICES THE PASSIVE POOL: it makes regen the enabler of an
// offensive strategy. A max-regen build (2.5 HP/s = 750 HP/run) rerolling every screen is a
// legitimate build bought with 5 passive picks, not an exploit — but it is a known consequence.
// Floored, not fatal: the reroll is blocked below the cost rather than killing you on a modal.
export const BLOOD_MONEY_HP = 10
// AND IT ESCALATES, like the coin ladder it replaces. This was the real defect in the flat
// version, and neither side of the original argument named it: `rerollCost` climbs
// 10/15/23/34/51/76/114/171/257/385 over a run, so charging a flat HP price does not merely make
// rerolls CHEAPER, it deletes the ladder. Measured with an always-reroll bot (body d3, 120 runs,
// kite-and-collect — a floor on player skill):
//   coins                                  6.08 rerolls/run
//   Blood Money, spending down to the floor 23.47
//   Blood Money, keeping 50% HP in reserve  12.79
// 3.9x greedy, 2.1x played cautiously, against ~17 screens in a run — i.e. up to 1.4 rerolls per
// screen. The overruled "that is 23 rerolls" objection was closer to right than the counter, and
// the maxHP figure it was argued against (110-127) is itself low: the probe's own realistic
// mid-game save measures 228.8.
// Same 1.5^n curve as the coins, so the two wallets stay legible against each other and the card
// keeps its actual design argument — it RE-PRICES the passive pool, making regen the enabler of an
// offensive strategy rather than simply handing out free rerolls.
export const BLOOD_MONEY_ESCALATION = 1.5
// STILLNESS. Keyed off INPUT, never velocity: pond's currents shove the player (currentForceMul),
// so a velocity test would hard-counter the card in exactly one chapter and nowhere else.
export const STILLNESS_RAMP = 2      // s of no input to reach the cap
export const STILLNESS_MAX_MUL = 3   // damage multiplier at the cap
// The player-SKIN tells for these two (v7.14, owner: "very subtle, I like the Isaac way of
// changing the skin of the player to show the active buffs"). Look numbers, not balance — they
// move no damage — but they live here because config.js is the one place a number may be tuned
// from, and these are exactly the kind you tune by eye and want to find again.
// SUBMISSION's ally ring (v7.14). GREEN, because green is what an ally reads as — the ring shipped
// gold in v7.11 and gold in this game already means coins, the xp bar and the rampage bar. A green
// distinct from the player's own mint (0x7de3c3), so a turned elite never reads as a second you.
export const ALLY_RING = 0x86e37a
export const ALLY_RING_ARC = 0xd8f7c8   // the draining loan clock, a shade paler than the ring
export const STILL_STEPS = 5          // rungs of the baked circle->triangle ladder (render.js)
export const STILL_MORPH_MAX = 0.55   // how far the top rung goes; 1 would be a hard polygon
// An alpha blend toward red over the mint body (0x7de3c3) lands on BROWN at mid strength, because
// mint's green and blue channels survive it — a subtle red on a green character IS a brown. Six
// candidates were shot on one identical frame (0.72 / 0.50 / 0.35 / 0.22, a darker red, a coral)
// and every one below 0.72 was some brown or olive; there is no alpha that reads "faintly red".
// The owner's ruling is that the brown is fine and 0.72 was too loud, so this is 0.50 — the tile
// that changed the creature without turning it into a tomato. Do not "fix" the brown by raising
// the alpha; that is the tomato, and it was rejected in play.
export const BERSERK_TINT = 0xff2a1a  // what the skin runs toward while the window is open
export const BERSERK_TINT_MAX = 0.5   // blend while the window is open
// The wash holds FULL until the last 25% of the window, then fades out. The reason is correctness:
// BERSERK_DMG_MUL is constant for the whole window — it does not ramp down — so a tell that faded
// the whole way would be lying about the buff it reports. The short tail doubles as the "about to
// expire" cue.
export const BERSERK_TINT_TAIL = 0.25
// MARTYR. Priced on a MEASURED denominator (body/2 d3, kite-and-collect bot, 40 runs): 11.3 hits
// taken/run, 207.4 HP lost/run, 18.4 HP per hit. So x3 is ~55 raw per detonation and ~620 over a
// run — which against ~64 HP trash at mid-run is about one enemy per hit, i.e. nothing.
// It rides hpScale for the same reason UNSTABLE CORES' bombs had to: a flat number derived from
// player HP is scary early and cosmetic late, because player maxHP does not ride hpScale and enemy
// HP rides it 7.6x-33.6x. Scaled, the burst stays worth ~3 trash kills at every t, which is what
// makes it a panic button (it clears the crowd that just hit you) rather than a dps source.
// x10, RAISED FROM x3 ON MEASUREMENT. At x3 the card was inert and its own flagship pairings were
// inert with it (body d3, 120 runs, kite-and-collect bot, against a take-and-skip control):
//   solo               +3.6% kills, -2.5 points of win rate — 10.7 detonations a run, worth about
//                      one trash enemy each, exactly as the x3 arithmetic predicted.
//   MARTYR + OVERLOAD  86.7% against OVERLOAD alone at 90.0%. The pair the slate was designed
//                      around — "OVERLOAD's drain becomes a permanent damage aura" — contributes
//                      NOTHING, because the drain is spent in whole-HP chunks: ~190 detonations of
//                      1 HP each, firecrackers rather than an aura.
//   BERSERK + MARTYR   +0.0 against BERSERK alone.
// A card holding 4.7% of the rarest tier's offers has to do something. x10 makes a detonation
// worth ~3 trash kills at any t (it rides hpScale) and the drain-aura pair worth having, while
// staying self-limiting on BRITTLE — at 1 maxHP a hit removes 1 HP, so the burst is 10 x hpScale
// rather than the ~184 a normal run's 18.4 HP hit produces.
// RE-MEASURED AFTER THE CHANGE, and the honest reading is that this card is partly unmeasurable
// here: kills went +3.6% -> +6.5% but win rate stayed flat (24.2% against the control's 25.0%).
// That is expected rather than damning. MARTYR is a PANIC BUTTON — its value is clearing the crowd
// at the moment you are surrounded — and the harness bot flees at 170px instead of ever being
// surrounded, so the exact situation the card exists for is the one situation it never enters.
// It also fires only ~10.7 times a run by construction, because that is how often you are hit.
// x10 is therefore set from the kill contribution and the pair arithmetic, not from a win rate.
// Do not chase win rate with a bigger number here without a human playtest first.
export const MARTYR_DMG_MUL = 10
export const MARTYR_RADIUS = 140
// CHAOS PACT. Owner's restructure from a one-shot into a repeating 60s cycle, and the numbers are
// explicitly deferred to playtest: "number will be toyed with by playing."
// The suspicion recorded here before implementation — "the cycle is 25% danger and 75% payoff, and
// spawn rate is the GENTLEST danger knob, so this may read as a near-permanent +50% damage with a
// siren" — is now MEASURED, and it was right: +19.2 points of win rate and +32.8% kills against a
// take-and-skip control (body d3, 120 runs, kite-and-collect bot). It plays as a gift.
// UNCHANGED ON PURPOSE. The owner deferred these numbers to play, and this is exactly the card
// where a harness reading is weakest: the bot outruns density mechanically, which is the whole
// mechanism being measured. When it is tuned, raise the DANGER window (spawn x2, or lend it
// enemyDmgMul) before shortening the payoff — the long payoff is what makes the rhythm legible.
// Also measured, and it settles an open question: TIME DEBT does NOT amplify this card. The cycle
// is `run.time % PERIOD >= SURGE`, so scaling time changes the beat FREQUENCY and leaves the 25/75
// duty cycle exactly where it was. The pair reads 34.2% against chaosPact's own arm — no
// interaction beyond the two cards separately.
// v7.x PLAYTEST (owner, from play): "it's not very visible to the player when the rush is active".
// Two changes, and the invisibility is what drove both. The beat is now TWICE as frequent (30s, not
// 60) and the surge is a clean 10s, so the rhythm is short enough to feel as a rhythm rather than
// as weather; and the payoff became a RAMP the player can watch climb instead of a flat multiplier
// that silently toggled on and off. A HUD countdown now names the state outright — see ui.js.
// THE PAYOFF STACKS: every wave you live through is +CHAOS_PACT_DMG_PER_WAVE, permanently, for the
// rest of the run. A 300s run has 10 waves, so it ends around +100% — a card you earn by enduring,
// where the shipped version handed you +50% for 45 of every 60 seconds and asked nothing.
// Derived from run.time alone (no accumulator on `run`), which keeps it a pure read like the
// spawn half and means a reload or a paused frame cannot double-count a wave.
//   TIME DEBT still does not amplify it: scaling time changes the beat FREQUENCY, and since the
// ramp counts waves, a compressed run simply reaches its waves sooner — the per-wave value is
// untouched. (The old note below measured the duty cycle; that argument still holds for the surge.)
export const CHAOS_PACT_PERIOD = 30
export const CHAOS_PACT_SURGE = 10    // s of the cycle spent under the spawn surge
export const CHAOS_PACT_SPAWN_MUL = 1.5
export const CHAOS_PACT_DMG_PER_WAVE = 0.10   // permanent damage gained per wave survived

// A RAMP NEEDS RUNWAY, so the card stops being offered once there is not enough run left to pay it
// back (owner: "it won't be worth it"). At 120s remaining a fresh pick banks at most 4 waves, i.e.
// +40% for the tail of a run — against jackpots that pay in full the moment they are taken. This is
// a `when` gate rather than a weight tweak because the problem is not that it is rare, it is that
// late it is a dead pick, and a dead pick on a 3-card screen is a lost choice.
export const CHAOS_PACT_MIN_REMAINING = 120   // s of run that must remain for the card to be offered
// CHAOS PACT's cycle, in ONE place because three readers must agree on it to the frame: the spawn
// surge (sim), the damage ramp (sim) and the HUD countdown (ui). A countdown that disagreed with
// the sim is precisely the "I can't tell when the rush is active" complaint this card was changed
// to fix, so they are not allowed to be two implementations. Pure functions of the clock.
export const chaosSurgeActive = (time) => time % CHAOS_PACT_PERIOD < CHAOS_PACT_SURGE
// Completed waves only — the one in progress does not pay until you have survived it.
export const chaosWavesSurvived = (time) =>
  Math.floor(time / CHAOS_PACT_PERIOD) + (time % CHAOS_PACT_PERIOD >= CHAOS_PACT_SURGE ? 1 : 0)
// Everything the HUD needs: which state, how long left in it, how far through it (for a bar that
// drains), and what the ramp is worth so far.
export const chaosStatus = (time) => {
  const into = time % CHAOS_PACT_PERIOD
  const active = into < CHAOS_PACT_SURGE
  const span = active ? CHAOS_PACT_SURGE : CHAOS_PACT_PERIOD - CHAOS_PACT_SURGE
  const elapsed = active ? into : into - CHAOS_PACT_SURGE
  return {
    active,
    left: span - elapsed,
    frac: 1 - elapsed / span,
    waves: chaosWavesSurvived(time),
    bonus: chaosWavesSurvived(time) * CHAOS_PACT_DMG_PER_WAVE,
  }
}

// ALIGNMENT. Multiplies the potency of every element the player carries.
export const ALIGNMENT_POTENCY_MUL = 2
// DEADFALL. The trap field is undergrowth's identity, so this is a chapter inversion: the hazard
// stops being something you route around and becomes furniture you kite ACROSS.
export const DEADFALL_REARM_MUL = 0.2
// SOY MILK. Shipped as "paper-neutral and measured neutral (+4.6% kills)", with a note that the
// probe could not see its real upside because element procs are counted PER HIT. That note was
// right, and v7.4 quantified it: against a take-and-skip control (body d3, 120 runs) the card is
// +25.8 POINTS of win rate. The mechanism is DEFENSIVE, which is why a kills-based reading missed
// it — five times the hits is five times the chill/freeze applications, and hits TAKEN drop 9.9 ->
// 7.3 with HP lost 202 -> 144. Strong, but it is a real build pivot with a real cost, so it stays.
// WORTH CHASING SEPARATELY: fireRateMul x5 delivers 3150 fires against 794, i.e. x3.97, not x5.
// Something is clamping cadence at the top end and it is not this card's doing.
export const SOY_MILK_FIRE_MUL = 5
export const SOY_MILK_DMG_MUL = 0.2
// The card's CROWD-CONTROL price, deliberately NOT the same number as its damage price. Charging
// x0.2 for control as well made the card strictly worse than skipping it (see CC_DR_* below); this
// is the tuned value, and having it separate is the point — the rate/damage trade and the
// rate/control trade do not have to balance at the same ratio.
export const SOY_MILK_CC_MUL = 0.45
// WILDFIRE. Ignite jumps to the nearest enemy when a burning one dies, carrying the same dps.
// THE BUDGET IS THE WHOLE BALANCE, and it is the risk the spec named before implementation:
// "ignite jumping on every death in a 200-enemy field never stops". The budget rides on the ENEMY
// (_fireJumps), is set when a weapon hit applies ignite, and decrements on each jump — so one
// application can travel WILDFIRE_JUMPS enemies deep and no further, however dense the crowd.
// A fresh weapon hit re-arms it, which is what keeps the card about ENGAGING the pack rather than
// lighting one straggler and walking away.
export const WILDFIRE_JUMPS = 3
export const WILDFIRE_JUMP_R = 160   // px, how far a jump reaches — about two body-lengths
// MINIMES. Decoys that flee outward and detonate. The decoy SYSTEM already ships as the `lure`
// weapon (run.lures: enemies inside `aggro` path to the decoy instead of the player, and it bursts
// for AoE at expiry), so this card is a cadence, a velocity and a set of numbers rather than a new
// entity — the three things the lure does not have.
// ANCHORED TO THE SHIPPED WEAPON, not invented: WEAPONS.lure level 3 is dur 3.4, aggro 230,
// burstR 126, burstDmg 42. Minimes sit near there deliberately, so the card reads as "a lure you
// did not have to equip" rather than as a second, differently-tuned decoy. The burst goes through
// applyDamage like the lure's, which is what makes it scale off PLAYER stats (the spec's
// requirement) rather than off a weapon's levels[] the card does not own.
// v7.x PLAYTEST (owner, from play): interval 6 -> 4 and speed 190 -> 95. Both come from the same
// complaint — "they stay like 2s on screen" — and the second number is the one that caused it.
// A decoy at 190px/s crosses a phone's half-height (~380px) in TWO SECONDS, so most of its 4s life
// was spent off-screen: the card was doing its job somewhere the player could not watch, which
// reads as the card doing nothing. At 95px/s it travels ~380px over the full 4s, i.e. it is visible
// for essentially its whole life and bursts around the edge of view, which is where a decoy that
// drags the swarm away is supposed to burst.
// THE COST, STATED: 4s interval against a 4s life means there is now ALWAYS one out, where before
// the field was empty a third of the time. The block below used to warn against exactly this — "if
// decoys hold aggro reliably they do not add pressure, they DELETE it" — so watch for the swarm
// feeling permanently defused rather than redirected. If it does, the lever is the interval (back
// toward 5-6s), not the speed: the speed is what makes the card legible.
export const MINIME_INTERVAL = 4      // s between spawns
export const MINIME_LIFE = 4          // s before it detonates
export const MINIME_SPEED = 95        // px/s outward — slow enough to stay in view for its whole life
export const MINIME_AGGRO = 230
export const MINIME_BURST_R = 126
export const MINIME_BURST_DMG = 42
// A minime is drawn as a SMALL COPY OF THE PLAYER (render.js reuses T.playerBody, the player's own
// bake) rather than as the Pheromone Lure's amber beacon it inherited by sharing run.lures. The
// card's whole fiction is "copies of you"; a gold star does not read as one.
export const MINIME_DRAW_SCALE = 0.55  // fraction of the player's own size
// SPECIALIST (v7.5). "I commit to one weapon and the game commits back." The spec is emphatic that
// the deliverability half is a TARGETING tool and not a deliverability FIX — focus redistributes
// where mod cards land, it cannot create them.
// THE FIRST VERSION OF THIS CARD WAS MEASURED WORTHLESS, TWICE, AND BOTH FAILURES ARE DESIGNED
// AGAINST HERE:
//  1. AUTO-ASSIGNMENT. The harness pointed focus at the first weapon past the gate — always the
//     starter, already at 82-97% deliverability with no headroom — and starved the weapons that
//     were the actual problem: mean 60.3% -> 57.2%, a card that made the run WORSE. Weighting the
//     subject by investment instead of order does NOT fix this: measured over 300 runs it named the
//     starter 86-94% of the time, i.e. the same weapon by a longer route. So the subject is
//     PLAYER-CHOSEN. Taking the card opens a chooser (ui.js) listing every qualifying weapon, which
//     is what the spec asked for in the first place — "point it at the geyser you are building, not
//     the rainbow you are not".
//  2. A NUDGE INSIDE A BUCKET IS NOT A CARD. Measured over 400 seeded runs, the x2.5 weighting on
//     its own is worth +0.56 mod picks for the rest of the run — for one of the run's TWO anomaly
//     slots, on a slate whose neighbours make every elite explode. A player who QUALIFIES for this
//     card (4 picks on one weapon) already takes that weapon's mods whenever they appear, so focus
//     can only convert the screens that offered none. Half a pick is not a rarest-tier card.
// So the card has TWO mechanisms, and the second is the one you feel:
export const SPECIALIST_FOCUS_MUL = 2.5   // the named weapon's mods win the mod bucket's pick
// A CEILING ONLY A SPECIALIST HAS. The focused weapon's mods may be taken SPECIALIST_EXTRA_PICKS
// past MAX_WEAPON_MOD_PICKS — a rule change no other card grants, visible the first time you take a
// 6th pick of something the game had stopped offering. It also inverts the card's worst case into
// its best: an EXHAUSTED weapon used to be a dead subject (and, weighted by pick count, the most
// likely one — measured 84.6%), and is now precisely the weapon this card rescues.
// Per-mod `maxPicks` overrides are NOT lifted: a mod that declares its own ceiling declared it
// because its marginal value collapses there (PIERCE_MAX_PICKS, REBOUND_MAX_PICKS), and that is a
// statement about the mod, not about the global cap.
export const SPECIALIST_EXTRA_PICKS = 2
// ...and the price, which is what keeps the whole card a redistribution rather than a buff: every
// OTHER weapon puts one fewer mod into the candidate pool. You gave up breadth for a ceiling.
export const SPECIALIST_OTHER_PENALTY = 1
// BLIND FAITH (v7.5). The user's ruling, verbatim: "you can't roll normal or rare anymore, but all
// picks are hidden (just the border visible, and the ones you don't chose are revealed somehow to
// make you frustrated)". It is Isaac's Curse of the Blind with a rarity floor bolted on.
// THE FLOOR IS ENORMOUS AND THAT IS THE POINT. Average RARITIES.mult per roll is
// Sum(weight x mult)/Sum(weight): 1.48 on the shipped table, 3.50 with normal and rare removed —
// so every stat pick for the rest of the run is x2.36, and tier mods go x1.88
// (WEAPON_MOD_TIER_BONUS 1.14 -> 2.14). Measured before implementation (40 runs, body/2 d3, a
// random-picking bot): picking blind costs -27.5% kills, the floor pays +83%, net +32% kills and
// +26s alive against a bot that picks WELL at normal rarities. And that is a FLOOR on the card's
// strength, not an estimate: the probe ignored the border, where a real player reads it.
// SO IT NEEDS A COST, and the slate has one pure-upside card too many already. The spec offered
// two. THE FIRST ONE WAS TRIED AND IT WAS A NO-OP — recorded because it looked obviously right:
// "drop to 2 cards while blind" fits the fiction perfectly, and `choiceSlots` DEFAULTS TO 2
// (state.js). So Math.min(2, 2) charged the default player exactly nothing, and the 3rd/4th slot is
// a 60-shop-level meta purchase — meaning the only players who paid anything were the most invested
// ones, and the game's most expensive permanent unlock made its strongest card worse for them.
// Worse still: the +32% measurement that proved a cost was NEEDED was itself taken at 2 slots
// (pool-probe's default), so the price was definitionally zero against the number that motivated
// it. A cost has to be checked against the DEFAULT configuration, not the maximal one.
// So it is the spec's option 2 instead, which charges the same at every slot count:
export const BLIND_FAITH_NO_REROLL = true   // you cannot reroll a screen you cannot read
// It also happens to be the honest one. Under the floor a reroll ALREADY buys nothing but a
// different screen: REROLL_RARITY_DECAY only ever multiplies the `normal` weight, and the floor has
// deleted `normal`, so the rarity table is byte-identical at 0 rerolls and at REROLL_RARITY_CAP.
// Charging coins (or, under BLOOD MONEY, escalating HP) for a purchase that quietly lost its
// advertised effect is worse than not selling it.
// AND IT KEEPS THE REVEAL WHOLE, which the slot cost was fighting: the emotion the owner asked for
// is "the ones you don't chose are revealed to make you frustrated", and at 2 cards that reveal
// showed exactly one passed card.
export const BLIND_FAITH_FLOOR = 'epic'  // the lowest rarity a blind screen may roll
// A NOTE ON THE SWITCH-MOD SIDE EFFECT, corrected. An earlier version of this comment called losing
// rule-change mods "a real price for x2.36" and "the most interesting thing about the trade". It is
// neither, in half the game: switches per chapter weapon pool are body 0/23, city 0/19, beyond
// 0/17, undergrowth 1/19, pond 2/19, skies 2/18, garden 3/19. Three of seven chapters pay nothing,
// INCLUDING the one the card was measured in. sim.js still drops them under the floor, but for the
// correctness reason only — they are offered at normal rarity by construction, so they could only
// ever reach a blind screen through the all-declined fallback, wearing a border the card forbade.

// IPECAC (v7.5). The owner's revision of a card that had already failed once, and the failure is
// the whole reason this version is shaped the way it is.
// V1 WAS 1/2 FIRE RATE FOR x3 DAMAGE. On paper +50% dps; MEASURED +1.1%, inside the noise. The
// entire multiplier was eaten by OVERKILL WASTE — tripling per-hit damage against enemies that were
// already dying pays nothing, while halving the fire rate pays its cost in full.
// V2 IS x3 COUNT, and the owner named the fix: "instead of 3x damage, can we do 3x projectiles, or
// beam arms, or 3 claws in different directions around you". Three things in DIFFERENT SPACE cannot
// overkill the same enemy, so the surplus lands on targets that were not already dead. That is the
// rule every weapon's reading is written against, and any row that resolves to "the same hit,
// bigger" has failed and needs re-authoring.
// WHY IT IS PER WEAPON: "+N count" is not commensurable across weapons. A generic +2 measured x1.35,
// not x3 — star.multishot +2 on a 1-projectile volley genuinely is x3, wave.echo +2 adds echoes at a
// FRACTION of damage, and orbit.extraOrb +2 adds to a persistent ring that never "fires" at all.
// Nine of the 22 weapons have no count axis whatsoever (mines, flagella, clawRake, roar, tailLash,
// wave, hole, chitterShriek, pulsarSweep), so for those "three of it" is authored rather than
// multiplied — three sectors at 120 degrees, three novas at different radii, three scattered cysts.
// THE HALVED FIRE RATE STAYS. It was only ever in doubt because the measured +2 grant was worth
// x1.35; authored properly every row is a true x3 of output, so the paper trade returns to x1.5 —
// and unlike the damage version, spread output is the kind overkill cannot reclaim.
export const IPECAC_COUNT_MUL = 3
export const IPECAC_FIRE_MUL = 0.5
// CLUTTER IS THE KNOWN RISK, and it is a real one rather than a theoretical one: REBOUND_MAX_PICKS'
// note already records live quill counts going 11 -> 47 and being "the one making the screen
// unreadable" on a 390x844 phone. This card does that to four equipped weapons at once, by design —
// the owner chose density everywhere over a gentler reading for the radial weapons. Whatever ships
// needs looking at ON A PHONE, not just in a kill count.

export const SPECIALIST_MIN_MODS = 4   // mod picks on ONE weapon before the card is offered

// Total mod picks a run has spent on one weapon — the gate's "have you committed to something yet".
export const weaponModPickCount = (run, id) =>
  Object.values(run.weaponModPicks?.[id] ?? {}).reduce((a, b) => a + b, 0)
// The per-mod ceiling for one weapon, which is the ONLY place the extra-picks rule is expressed.
// `focused` is the weapon SPECIALIST named, or null.
export const modPickCap = (weaponId, modId, focused) => {
  const cfg = WEAPON_MODS[weaponId]?.[modId]
  if (!cfg) return 0
  if (cfg.kind === 'switch') return 1
  if (cfg.maxPicks != null) return cfg.maxPicks   // a mod's own ceiling is never lifted — see above
  return MAX_WEAPON_MOD_PICKS + (weaponId === focused ? SPECIALIST_EXTRA_PICKS : 0)
}
// Which of the player's weapons SPECIALIST may name. Reads run.weapons rather than the picks map so
// a weapon that somehow left the loadout can never be offered as a focus.
// NOTE it does NOT require remaining headroom: under the extra-picks rule an exhausted weapon is
// the single best thing this card can be pointed at, because the card is what un-exhausts it.
export const specialistSubjects = (run) => (run.weapons ?? [])
  .map((w) => w.id)
  .filter((id) => weaponModPickCount(run, id) >= SPECIALIST_MIN_MODS)

// WEIGHTS (v7.2). The old note read "unconditional 1 / conditional 6 / chapter inversion 2", and
// it inverted the tier the moment the slate grew past one card. It assumed a GATED card is a RARE
// card — but these gates are not rare: `_hitsTaken > 0`, `coinsEarned >= 50`, `_rerolls > 0` and
// "owns any element" are all near-universal by ANOMALY_MIN_LEVEL. So the three near-unconditional
// TRADES took 42% of the tier's weight between them, while the four cards the rarity licence was
// written to permit (BRITTLE, TIME DEBT, OVERLOAD, BLOOD PACT) sat at 9% combined — about one
// sighting every eight runs. Measured mix before: 33% pivot / 16% jackpot / 51% trade, against a
// stated design target of roughly 56 / 25 / 19. At ~1.3 anomalies per run that made the modal
// experience of the game's rarest tier a COST card.
// So weight now answers two questions, in this order:
//   1. How much of the tier should this KIND own? Pivots are the point (the tier exists to change
//      how you play); jackpots are the feeling; trades are meant to be rare, because scarcity is
//      exactly what buys the licence to be extreme.
//   2. How rare is this card's GATE, really? A near-universal gate needs no compensation. Only a
//      genuinely narrow one does (ALIGNMENT wants two distinct elements; DEADFALL wants a chapter).
// Shipped mix, non-chapter-scoped: 50% pivot / 25% jackpot / 25% trade.
// STILL OWED, and deliberately not done here: the spec's Decision #1 asks for per-KIND weighting
// (roll the kind, then the card) rather than one flat list. `kind` is descriptive today — nothing
// reads it. Hand-tuned weights hit the same mix for THIS slate and will drift as the remaining six
// cards land, which is the right time to build the real thing.
export const ANOMALIES = {
  unstableCores: {
    name: 'Unstable Cores', icon: '💥',
    from: 'you killed an elite and something went critical',
    desc: 'Elites arrive three times as often, and every one drops an unstable core. Its blast grows with the run, and whatever it kills blows up too.',
    // The hidden gate: this card teaches itself only to a player who has met an elite. Reads the
    // run counter, never run.enemies — an elite alive on screen is not the lesson.
    when: (r) => (r._eliteKills ?? 0) > 0,
    // WEIGHT IS ABOUT HOW RARE THE GATE IS, AND HOW MUCH OF THE TIER THIS KIND SHOULD OWN — see
    // the block above ANOMALIES for the whole scheme. A jackpot is the kind the tier should feel
    // like, so this one carries a real share rather than the 1 it had while it was the only card.
    weight: 4,
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
  submission: {
    // The id, the constants and the event types all say `submission` too. Renaming a card means
    // renaming it IN THE CODE — the soyMilk/ipecac precedent (keep the id, change the name) is
    // what a future session gets lost in, hunting a `soyMilk` that the game calls Machine Gun.
    name: 'Submission', icon: '🎖️',
    from: 'they only obey the strongest',
    desc: `Elites arrive three times as often — and the ones you kill turn instead of dying, fighting the swarm for ${SUBMISSION_DURATION}s at ${Math.round(SUBMISSION_DMG_FRAC * 100)}% of your damage. Nothing you fire can touch them.`,
    // The same gate as unstableCores, and for the same reason: the card teaches itself only to a
    // player who has already met an elite. It also scopes the card correctly for free — The Blank
    // is `scripted`, sim.js:643 returns before the elite cadence there, so _eliteKills never rises
    // and Submission is simply never offered in the one chapter where it could do nothing.
    when: (r) => (r._eliteKills ?? 0) > 0,
    // Weight matches unstableCores: both are jackpots gated on the same event, and a tier should
    // feel like its jackpots. Two elite-keyed cards in the pool is deliberate — they combine
    // (an ally's expiry fires its core), which is the interaction the spec names as the point.
    weight: 4,
    chapter: null,
    kind: 'jackpot',
    // A jackpot with no cost, so ANOMALY_MIN_LEVEL's argument (which is about COST cards) does not
    // apply — same reasoning as unstableCores, whose measurement is quoted in its block above.
    minLevel: 3,
  },

  // ---- PIVOTS: no direct cost, but they change how the run is PLAYED ------------------
  // A jackpot means no COST, not no DECISION. A card that changes nothing about how you play has
  // failed regardless of its tier — which is the bar every row below is written against.

  berserk: {
    name: 'Berserk', icon: '😤',
    from: 'something hit you, and you liked it',
    desc: `Taking a hit doubles your damage for ${BERSERK_DURATION}s. No cooldown, no threshold.`,
    // Inverts the core loop: you stop avoiding damage and start seeking it. The gate teaches the
    // card — it is only offered to a player who has actually been hit.
    when: (r) => (r._hitsTaken ?? 0) > 0,
    weight: 6, chapter: null, kind: 'pivot',
  },
  stillness: {
    name: 'Stillness', icon: '🧘',
    from: 'the world learned to wait for you',
    desc: `Stand still and your damage climbs to ×${STILLNESS_MAX_MUL} over ${STILLNESS_RAMP}s. Moving drops it instantly.`,
    // Inverts the one rule the genre teaches for 300 seconds. Unconditional (weight 1): there is
    // no build state that would make "you can stand still" a lesson the run has already taught.
    when: () => true,
    weight: 4, chapter: null, kind: 'pivot',
  },
  martyr: {
    name: 'Martyr', icon: '🩸',
    from: 'you bled, and the ground answered',
    desc: 'Every point of HP you lose detonates around you, harder as the run goes on.',
    // The connective tissue for the four HP-cost cards: OVERLOAD's drain becomes a permanent
    // damage aura, BERSERK already wants you hit, BLOOD MONEY turns a reroll into a bomb. It does
    // NOT break BRITTLE — at 1 maxHP a hit removes 1 HP, so the detonation is worth MARTYR_DMG_MUL
    // x hpScale (a few damage early, ~17 late in body) instead of the ~55 a normal run's 18.4-HP
    // hit produces. The obvious degenerate pair is self-limiting.
    when: (r) => (r._hitsTaken ?? 0) >= 3,
    weight: 6, chapter: null, kind: 'pivot',
  },
  chaosPact: {
    name: 'Chaos Pact', icon: '🌀',
    from: 'you agreed to a rhythm you did not set',
    desc: `Every ${CHAOS_PACT_PERIOD}s a ${CHAOS_PACT_SURGE}s chaos wave brings +${Math.round((CHAOS_PACT_SPAWN_MUL - 1) * 100)}% enemies. Survive one and keep +${Math.round(CHAOS_PACT_DMG_PER_WAVE * 100)}% damage — for the rest of the run, every time.`,
    // Keys off run.time, which TIME DEBT inflates 1.5x — so under both cards the beats arrive half
    // again as often in real seconds. Intended: the ramp counts WAVES, so a compressed run simply
    // reaches more of them, and the per-wave value is untouched.
    // NOT OFFERED IN THE LAST CHAOS_PACT_MIN_REMAINING SECONDS (owner: "it won't be worth it").
    // The payoff is a ramp, so a late pick banks a handful of waves and is a dead choice on a
    // screen that only has three. `?? 0` because `when` must not throw on the fixture run shapes
    // that run PB drives it with.
    when: (r) => (RUN_DURATION - (r.time ?? 0)) >= CHAOS_PACT_MIN_REMAINING,
    weight: 4, chapter: null, kind: 'pivot',
  },
  wildfire: {
    name: 'Wildfire', icon: '🔥',
    from: 'your fire found something worth spreading to',
    desc: `When a burning enemy dies, the fire jumps to the nearest one — up to ${WILDFIRE_JUMPS} times.`,
    // Rewards ENGAGING a crowd instead of picking off stragglers: light the front rank and let it
    // propagate. Gated on two fire picks, which is both the condition that makes it mean anything
    // and a real narrowing — it is the reason this card carries more weight than an ungated pivot.
    when: (r) => (r.elementPicks?.fire ?? 0) >= 2,
    weight: 6, chapter: null, kind: 'pivot',
  },
  minimes: {
    name: 'Minimes', icon: '👥',
    from: 'there started being more of you than there was of you',
    desc: `Copies of you peel off every ${MINIME_INTERVAL}s, pull the swarm away, and detonate.`,
    // SPLITS THE SWARM — positioning stops being about where YOU are and becomes about where your
    // decoys will be. Pairs with STILLNESS without either card mentioning the other (the decoys buy
    // you the standing time), which is the good kind of synergy.
    // minLevel 12 over the table's 8: this is a no-cost pivot, and a swarm that is already being
    // split is not a swarm the player has learned to read yet.
    when: () => true,
    weight: 4, chapter: null, kind: 'pivot',
    minLevel: 12,
  },
  deadfall: {
    name: 'Deadfall', icon: '🪤',
    from: 'the traps stopped caring about you',
    // "80% faster" was WRONG, not just weak: REARM_MUL 0.2 makes the re-arm TIME 20% of normal,
    // which is five times faster — "80% faster" would be time / 1.8. It also undersold the card
    // badly, which is the tell that the wording was doing arithmetic nobody checked.
    desc: `Snap traps ignore you, and re-arm ${Math.round(1 / DEADFALL_REARM_MUL)} times faster.`,
    // The chapter inversion (weight 2): undergrowth's signature hazard changes sides, so you kite
    // ACROSS the trap field instead of away from it. KNOWN RISK, accepted: this may trivialise the
    // chapter by turning its identity into a free weapon. It is gated to undergrowth and to lv 10
    // so a player meets the hazard as a hazard first.
    when: () => true,
    weight: 2, chapter: 'undergrowth', kind: 'pivot',
    minLevel: 10,
  },

  // ---- JACKPOTS: no cost at all -------------------------------------------------------

  alignment: {
    name: 'Alignment', icon: '⚗️',
    from: 'two elements found the same beat',
    desc: `All your elements now have ×${ALIGNMENT_POTENCY_MUL} potency.`,
    // Gated on owning two distinct elements: that is the fiction, and it keeps the card off a
    // screen where it would read as a single-element buff.
    when: (r) => Object.values(r.elementPicks ?? {}).filter((n) => n > 0).length >= 2,
    weight: 6, chapter: null, kind: 'jackpot',
  },

  // ---- TRADES: a real cost, paid up front and read before you take it -----------------
  // RARITY LICENSES EXTREMITY (owner): a card that can end a run is the payoff, not a balance
  // failure, PROVIDED it is rare. The limit is opt-in, not survivability — the player reads the
  // card first, so a self-inflicted catastrophe is a choice. These all sit at the table's default
  // ANOMALY_MIN_LEVEL, deliberately (F10: a new player's first encounter with the tier must not be
  // a pure downside).

  timeDebt: {
    name: 'Time Debt', icon: '⏳',
    from: 'the clock started running against you',
    // MIS-SIGNED IN ITS FIRST WORDING. It led with the run clock and the XP in one breath, which
    // reads cold as "shorter run AND more XP" — pure upside — when the actual bargain is that hpScale,
    // dmgScale, spawnRate and eliteEvery ALL accelerate with the clock, and you have a third less
    // real time to walk to your gems. Name the thing the player will feel, not the variable.
    desc: `Everything arrives ${Math.round((TIME_DEBT_MUL - 1) * 100)}% sooner — enemies, elites, the ending. Gems pay +${Math.round((TIME_DEBT_XP_MUL - 1) * 100)}% XP.`,
    when: () => true,
    weight: 1, chapter: null, kind: 'trade',
  },
  brittle: {
    name: 'Brittle', icon: '🥚',
    from: 'you traded every future hit for this one',
    desc: `Your max HP becomes ${BRITTLE_MAX_HP}. Your damage is ×${BRITTLE_DMG_MUL}.`,
    when: () => true,
    weight: 1, chapter: null, kind: 'trade',
  },
  overload: {
    name: 'Overload', icon: '⚡',
    from: 'you found the part of you that burns',
    desc: `×${OVERLOAD_FIRE_MUL} fire rate and ×${OVERLOAD_DMG_MUL} damage, for ${OVERLOAD_HP_PER_SEC} HP every second.`,
    // The drain uses hurtPlayer's dot path, which skips invulnTime, HURT_CAP_FRAC and armor — so
    // the cost cannot be turtled away, which is what makes it a real resource. It IS suppressed by
    // run.rampageT (RAMPAGE = INVULNERABLE, the one guard covering every damage path), so skies'
    // rampage becomes a free-fire window. Good emergent beat, not a bug.
    when: () => true,
    weight: 1, chapter: null, kind: 'trade',
  },
  bloodPact: {
    name: 'Blood Pact', icon: '🫀',
    from: 'you swore off healing',
    // Print the DESTINATION, not the increment. "+0.1% damage" reads as an insult next to "never
    // heal again", and no player on a phone integrates it over the 570-1900 kills a run actually
    // produces. The end state is x1.68 (body) to x2.99 (city) — "around x2" is the honest middle
    // and is the number that makes the trade legible in the second the player has to read it.
    desc: 'You can never heal again. Every kill makes you permanently stronger — around ×2 by the end.',
    when: () => true,
    weight: 1, chapter: null, kind: 'trade',
  },
  bloodMoney: {
    name: 'Blood Money', icon: '💉',
    from: 'you rerolled once, and wondered what it was really worth',
    desc: `Rerolls cost ${BLOOD_MONEY_HP} HP instead of coins.`,
    // Gated on having actually paid for a reroll: the card is meaningless to a player who has
    // never used the button, and this is the one gate on the slate the player can deliberately
    // open. Anti-synergies stay legible and are meant to be read off the two cards: BRITTLE
    // (maxHP 1) disables rerolls entirely, BLOOD PACT (no healing) makes every reroll permanent.
    when: (r) => (r._rerolls ?? 0) > 0,
    weight: 2, chapter: null, kind: 'trade',
  },
  avarice: {
    name: 'Avarice', icon: '🩹',
    from: 'the coins started tasting like medicine',
    desc: `Enemies drop ${Math.round((1 - AVARICE_COIN_DROP_MUL) * 100)}% fewer coins, and 1 in ${Math.round(1 / AVARICE_HEAL_CHANCE)} you pick up heals ${AVARICE_HEAL_HP} HP instead of paying.`,
    // The cost is dual and it is the sharpest thing on the slate: run.coinsEarned is BOTH the
    // end-of-run meta payout AND the in-run reroll wallet. Avarice trades level-up agency for
    // survivability — agency being the exact complaint this redesign exists to answer.
    // NEVER OFFERED ALONGSIDE BLOOD PACT. Measured (body d3, 120 runs): the pair wins 40.0%
    // against BLOOD PACT alone at 50.0%, with coins down 347 -> 245. Blood Pact suppresses every
    // heal, so Avarice's entire upside is zero while its -30% coin penalty applies in full — the
    // player spends BOTH of a run's two rare slots to buy a strict penalty. The v7.3.0 `canHeal`
    // guard stopped the coins being destroyed outright; it could not make the pair worth taking.
    // A predicate is the right tool rather than a special case at the trigger site: this is the
    // one combination on the slate with no upside at all in either direction.
    when: (r) => (r.coinsEarned ?? 0) >= 50 && !r.anomalies?.bloodPact,
    weight: 2, chapter: null, kind: 'trade',
  },
  soyMilk: {
    name: 'Machine Gun', icon: '🔫',
    from: 'your elements wanted more chances, not bigger ones',
    desc: `×${SOY_MILK_FIRE_MUL} fire rate, ×${SOY_MILK_DMG_MUL} damage. Burn, chill and shock land ${SOY_MILK_FIRE_MUL} times as often.`,
    when: (r) => Object.values(r.elementPicks ?? {}).some((n) => n > 0),
    weight: 2, chapter: null, kind: 'trade',
  },
  blindFaith: {
    name: 'Blind Faith', icon: '🙈',
    from: 'you stopped needing to know',
    desc: `Every card is face down — only its border shows. Nothing below ${RARITIES[BLIND_FAITH_FLOOR].name} is rolled, and you can never reroll.`,
    // Unconditional: there is no build state that makes "you could pick without looking" a lesson
    // the run has already taught, and gating it would only delay the run it reshapes.
    when: () => true,
    // The rarest weight on the slate. It is the single most powerful card here by a wide margin
    // (x2.36 on the magnitude of every remaining pick), and the licence for that is scarcity.
    weight: 1, chapter: null, kind: 'trade',
  },
  ipecac: {
    name: 'Bazooka', icon: '🚀',
    from: 'once was never going to be enough',
    desc: `Every weapon fires ${IPECAC_COUNT_MUL} times as much, spread in ${IPECAC_COUNT_MUL} directions — at half the fire rate.`,
    // Unconditional: it re-reads every weapon in the game, so there is no build state that makes it
    // a lesson the run has already taught.
    when: () => true,
    weight: 2, chapter: null, kind: 'trade',
  },
  specialist: {
    name: 'Specialist', icon: '🎯',
    // Not "the other three": six of the seven chapters ship exactly 3 weapons against MAX_WEAPONS 4,
    // so the player owns at most three in total and the line was wrong nearly everywhere.
    from: 'you stopped pretending the rest of them were the plan',
    // NO MULTIPLIER IN THE COPY. x2.5 is the odds ratio inside the candidate list, never the
    // frequency a player experiences: measured, it delivers 2.16x at four weapons, 1.54x at two and
    // exactly 1.00x at one. A card must not print a number it only sometimes pays.
    desc: `Upgrades for the weapon you name come up far more often, and you may take ${SPECIALIST_EXTRA_PICKS} more of each. Every other weapon offers less.`,
    // The gate IS the fiction: you cannot specialise in something you have not been building.
    when: (r) => specialistSubjects(r).length > 0,
    // `subjects` is what makes this a card PER WEAPON rather than one auto-assigned rule — the only
    // anomaly that carries one. rollAnomalyCard picks among these, weighted by investment, and
    // applyChoice banks the weapon id instead of `true` (still truthy, so every `?.specialist`
    // read keeps working).
    subjects: specialistSubjects,
    weight: 2, chapter: null, kind: 'trade',
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
    // v5.3: re-themed as The Garden's starter (Boomerang Leaf) — COPY ONLY, behavior unchanged
    // (still the boomerang weapon step/mods in sim.js, entity array run.boomerangs, and the
    // WEAPON_MODS.boomerang set below). Keeping the id 'boomerang' keeps render.js/main.js
    // (outside the v5.3 sim scope) working; the display name is what the player sees. Moved
    // from vaulted into the garden's weapon pool (see CHAPTERS.garden.weapons).
    // v6.6.13: the ART caught up with the name — for three releases this threw a tinted crescent
    // BLADE and a playtester said so. It is a drawn leaf now (see T.boomerang in render.js).
    name: 'Boomerang Leaf',
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
    // v5.4: re-themed as The Beyond's native (Mini Black Hole) — COPY ONLY, behavior/numbers
    // unchanged (still the hole weapon step/mods in sim.js, entity array run.holes). Moved from
    // vaulted into the beyond's weapon pool (see CHAPTERS.beyond.weapons) — its thematic home.
    name: 'Mini Black Hole',
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
    // to seven mods, tying bloom/clawRake/burstHydrant for the most-modded weapon in the game.
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
  // See stepTornadoWeapon/stepHydrantWeapon in sim.js.
  trashTornado: {
    name: 'Trash Tornado',
    desc: 'Whips up street trash into funnels that hunt down what comes near.',
    icon: '🌪️', rarity: 'rare',
    // v6.8: HUNTERS, not an orbital. Each funnel is a persistent run.debris entry the sim moves
    // itself: with prey inside `hunt` px OF THE PLAYER it flies at that enemy at travelSpeed and
    // parks on it; with nothing in reach it spirals back into a ring of `radius` around you and
    // circles at rotSpeed. Damage still ticks on the per-enemy cooldown run.orbs uses. `hunt` is a
    // leash around the PLAYER, not around the funnel — that is what keeps the weapon a bubble of
    // threat you carry rather than a pack that wanders off and never comes home.
    // Stat key order matters: the pause sheet shows the first five it recognises (buildReadout).
    levels: [
      { dmg: 11, chunks: 3, radius: 90,  hunt: 190, travelSpeed: 190, rotSpeed: 1.5, tick: 0.5 },
      { dmg: 13, chunks: 3, radius: 98,  hunt: 205, travelSpeed: 205, rotSpeed: 1.6, tick: 0.5 },
      { dmg: 16, chunks: 4, radius: 108, hunt: 225, travelSpeed: 220, rotSpeed: 1.8, tick: 0.45 },
      { dmg: 20, chunks: 5, radius: 118, hunt: 245, travelSpeed: 240, rotSpeed: 2.0, tick: 0.4 },
      { dmg: 26, chunks: 6, radius: 130, hunt: 270, travelSpeed: 260, rotSpeed: 2.2, tick: 0.35 },
    ],
  },
  burstHydrant: {
    // Renamed from `sewerGeyser` (the pre-v6.10 name, when it was a one-shot sewer pop) once the
    // display name had been Burst Hydrant for a while and the mismatch was just a trap. Weapon ids
    // live only in `run`, never in the save, so the rename needed no migration. The zones it plants
    // are still run.zones — that array is shared with the Reality Shard's rifts and stays generic.
    name: 'Burst Hydrant',
    desc: 'Shears a hydrant open; it hoses down whatever comes near.',
    // STAND-IN: 🚒 is a fire ENGINE — there is no hydrant emoji, and 🚿 is already Split Nozzle's.
    // Kept knowingly (the alternative, 💦, reads as sweat); swap it the day this gets real art.
    icon: '🚒', rarity: 'rare',
    // The area-denial native: plants `count` telegraphed zones (run.zones) on the path between a
    // foe and the player within castRange; each waits `fuse` seconds (harmless telegraph), erupts
    // for `dmg`, then STAYS OPEN for `jetDur`, spraying every `tick`. Enemies only — never hurts
    // the player.
    //
    // v6.10 reworked this from a one-shot pop. Measured with scripts/weapon-census.mjs, the pop
    // threw away about half its damage budget: 27% of eruptions caught nothing (a wisp covers
    // 107px during the 0.65s fuse and simply left the 128px circle), and 28% of what did land was
    // overkill from one 93-damage hit on a 20-HP-base roster. Standing still cut the whiff rate by
    // 2.4x, i.e. the weapon punished kiting. A jet that stays open recovers both: nothing has to be
    // on the mark at one exact instant, and the damage arrives in tick-sized pieces.
    //
    // `dmg` is the ERUPTION punch; each spray tick is dmg * HYDRANT_SPRAY_FRAC.
    //
    // v6.10.3 (owner): fuse flat 0.20s at every level, down from 0.70-0.60. The telegraph is pure
    // anticipation here, not a safety cue — a hydrant never hurts the player — so the only thing
    // the long fuse bought was a delay between the cast and anything happening. It also fed the
    // lead (leadSpot: speed x fuse), which now self-corrects to ~20-35px instead of ~100.
    //
    // v6.10.2 (owner): r and jetDur both +35% over the v6.10 ladder. `r` is the turret's RANGE, not
    // a damage area — widening it costs no screen clutter now that the only radial art is the
    // fuse-phase ring, and it buys the hydrant more time hosing before the swarm walks out the far
    // side. Longer jetDur means more hydrants alive at once; ZONE_MAX_LIVE is the backstop.
    levels: [
      { rate: 3.0, castRange: 260, fuse: 0.20, r: 122, dmg: 22, count: 1, jetDur: 3.40, tick: 0.40, streams: 2 },
      { rate: 2.8, castRange: 270, fuse: 0.20, r: 132, dmg: 27, count: 1, jetDur: 3.50, tick: 0.40, streams: 2 },
      { rate: 2.6, castRange: 285, fuse: 0.20, r: 143, dmg: 32, count: 2, jetDur: 3.65, tick: 0.40, streams: 3 },
      { rate: 2.3, castRange: 300, fuse: 0.20, r: 157, dmg: 40, count: 2, jetDur: 3.85, tick: 0.40, streams: 3 },
      { rate: 2.0, castRange: 320, fuse: 0.20, r: 173, dmg: 48, count: 3, jetDur: 4.05, tick: 0.40, streams: 4 },
    ],
  },
  // Skies chapter natives (v5.4). See stepRoarWeapon/stepLashWeapon/stepDebrisWeapon in sim.js.
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
  // v7.23 (owner: "replace tail whip of this chapter, it's not clear, it's not powerful, and
  // reminds too much of flagella whip"). All three were true and all three were measured, not
  // assumed — see docs/superpowers/specs/2026-08-11-skies-tail-lash-atomic-breath-design.md:
  //   - a RARE that loses to the FREE STARTER on every axis (eff dps 117 vs roar's 138, kills/min
  //     75.3 vs 85.2, waste 14% vs 9%);
  //   - the fourth `inSector` aimed melee arc in the game, and the only chapter carrying TWO of
  //     them (roar is the other) — "reminds too much of flagella whip" is structural, not a feel;
  //   - reach 150-200, the SHORTEST in the game's most standoff-heavy chapter. Every skies enemy
  //     is built to stay away (jet banks to STRAFE_STANDOFF 420, helicopter holds at its missile
  //     standoff, tanks shell from range), and debrisToss' own comment already calls itself "the
  //     skies' designated ANTI-AIR pick". The pool knew.
  // So the tail stops being a wide sector and becomes a LONG THIN LINE that reaches out and drags
  // the air force down to you. See stepLashWeapon/fireLash in sim.js and LASH_* below.
  tailLash: {
    name: 'Tail Lash',
    desc: 'Snaps out and drags an aircraft down to be crushed underfoot.',
    icon: '🦖', rarity: 'rare',
    // Aimed at the FARTHEST crushable enemy in reach — the inverse of every other weapon in the
    // game, which all aim at the nearest, and the entire point: it goes and gets the helicopter
    // standing off at 400px rather than the drone already at your feet.
    // `hooks` is the LADDER, and it has to be, for a reason the first cut got wrong. Most of this
    // weapon's output is the free crush on arrival (stepEnemies' crushable branch), whose value is
    // the aircraft's whole HP bar and is completely independent of `dmg` — so a ladder that only
    // grew dmg/range measured 149 -> 217 eff dps across five levels (+46%) while Roar doubled.
    // Levelling has to buy MORE AIRCRAFT PER LASH or it barely registers.
    levels: [
      // The RATE ladder is steep for the same reason: a lash's value is dominated by how often it
      // gets to crush something, not by `dmg`. At a flat-ish 1.50->1.12 the L1 card measured 149
      // eff dps against Debris Toss' 78 — twice a rare's opening, because one free crush every
      // 1.5s is already most of a weapon. Slow the opening, keep the top.
      { dmg: 30, rate: 3.10, range: 340, width: 26, hooks: 1 },
      { dmg: 36, rate: 2.60, range: 370, width: 28, hooks: 1 },
      { dmg: 43, rate: 2.05, range: 400, width: 30, hooks: 2 },
      { dmg: 52, rate: 1.55, range: 430, width: 32, hooks: 2 },
      { dmg: 64, rate: 1.15, range: 460, width: 34, hooks: 3 },
    ],
  },
  // v7.23: the kaiju's answer to an air force. Charges (a readable telegraph), then burns while
  // FORKING like lightning from body to body — owner's spec: "it should aim for closest enemy then
  // 'spread' like lighting to other enemies".
  // WHY THIS IS NOT A THIRD BEAM: a run.beams entry is a ray from the player at an angle (rainbow
  // auto-rotates, pulsarSweep wipers a fixed fan). A fork is a CHAIN OF SEGMENTS BETWEEN BODIES,
  // all live at once — it cannot be expressed as an angle and a length. It is also not
  // tryChainBullet (Chain Stars), which re-targets one travelling projectile, so only ever one
  // segment exists. Hence its own array, run.arcs. See stepArcs/fireBreath in sim.js.
  atomicBreath: {
    name: 'Atomic Breath',
    desc: 'A charged blast that forks from body to body like lightning.',
    icon: '☢️', rarity: 'epic',
    // The fork REBUILDS on every damage tick: dead branches drop out and fresh targets snap in
    // while the beam is still burning. That is what makes it read as lightning rather than a ray,
    // and it is also the mechanic — the breath keeps finding new bodies for its whole duration.
    levels: [
      // balance_decision : Atomic Breath tuned to clear the chapter's rares as an epic v7.23-v7.25
      //  - JUMPS is the lever, not dmg: with the root pulled in to `range` the binding constraint
      //    is bodies REACHED, and L5 dmg 29 -> 32 moved eff dps 261 -> 259 (all overkill). Also
      //    `interval` IS BREATH_CHARGE_T + duration on purpose — raising it reintroduces dead air.
      { dmg: 10, jumps: 2, arcRange: 150, range: 240, duration: 1.00, interval: 1.50, tick: 0.14 },
      { dmg: 13, jumps: 3, arcRange: 160, range: 265, duration: 1.10, interval: 1.60, tick: 0.14 },
      { dmg: 16, jumps: 4, arcRange: 175, range: 290, duration: 1.20, interval: 1.70, tick: 0.13 },
      { dmg: 22, jumps: 5, arcRange: 190, range: 315, duration: 1.30, interval: 1.80, tick: 0.13 },
      { dmg: 29, jumps: 6, arcRange: 200, range: 340, duration: 1.40, interval: 1.90, tick: 0.12 },
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
  // Beyond chapter natives (v5.4). Mini Black Hole = the hole re-theme (see WEAPONS.hole).
  // See stepShardWeapon/stepPulsarWeapon in sim.js.
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
  pulsarSweep: {
    name: 'Pulsar Sweep',
    desc: 'Two lasers sweep back and forth across the way ahead.',
    // 🔷 is inherited from the Tesseract Beam and was re-checked on the card against 🔦/✴️/🩻/📶:
    // kept, because it is the only one whose colour agrees with the violet render.js actually bakes
    // this sweep in (T.beamSweep) and with The Beyond's palette. The literal "beam" glyphs all read
    // as a household torch or a status indicator, and the star ones render orange.
    icon: '🔷', rarity: 'epic',
    // A run.beams entry (same shape/step as the Neon Beam) flagged `swept: true`: a second arm
    // sits 180° opposite the first and sweeps with it — i.e. one cast rakes both sides at
    // once. rate (not `interval`) is the cast cadence, matching the other v5.x natives.
    levels: [
      { dmg: 10, tick: 0.16, rate: 6.5, duration: 2.0, rotSpeed: 2.2, width: 34, length: 340 },
      { dmg: 12, tick: 0.16, rate: 6.0, duration: 2.2, rotSpeed: 2.4, width: 36, length: 360 },
      { dmg: 15, tick: 0.15, rate: 5.5, duration: 2.4, rotSpeed: 2.6, width: 38, length: 380 },
      { dmg: 18, tick: 0.15, rate: 5.0, duration: 2.7, rotSpeed: 2.8, width: 42, length: 405 },
      { dmg: 22, tick: 0.14, rate: 4.5, duration: 3.0, rotSpeed: 3.1, width: 46, length: 430 },
    ],
  },
  // ---- The Surf natives (Book 2 chapter 1) ----
  // THREE weapons, and the chapter borrows nothing from The Pond. All three obey the same three
  // rules, which are owner rulings and apply to any weapon added here later:
  //   1. FIRE ON A TIMER. This is a survivors-like: a weapon runs on its own clock, not on what the
  //      crowd happens to do and not on the chapter's own tide.
  //   2. SPEND NO RESOURCE. The action button and the damage multiplier already compete for the one
  //      Humidity bar (see CHAPTERS.surf.resource), and a third claimant makes that unreadable.
  //   3. NEVER COUPLE OUTPUT TO MOVEMENT. Where the player walks is not an input to how hard a
  //      weapon hits.
  //
  // Each claims a SHAPE the other 23 do not have, which is the bar a new weapon clears here —
  // projectile-at-nearest (5 cards), melee arc and cone (4), nova-from-you (3), planted zone (3),
  // beam (3) and vortex (3) are all several deep already:
  //   breaker        a MOVING FRONT that CARRIES. Every other area attack is anchored — centred on
  //                  you (nova, cone, ring) or on a fixed point (cloud, vortex, hose). Nothing
  //                  travels across the field taking bodies with it.
  //   skippingShell  MULTI-IMPACT ALONG A PATH. Atomic Breath forks instantly, the Boomerang
  //                  returns, Reality Shard blinks over gaps; nothing lands repeatedly as it flies.
  //   barnacles      ATTACH-AND-SPREAD. Wildfire does this, but it is a late gated anomaly, it is
  //                  fire-only, and it needs two element picks before it can be offered at all.
  //
  // ⚠ THE LEVEL LADDERS BELOW ARE UNMEASURED STARTING POINTS, not tuned numbers. They are pinned to
  // the nearest shipped relatives (see each block) so the weapons are playable enough to look at;
  // scripts/weapon-census.mjs against this chapter's own `balance` table is what settles them, and
  // that pass is still owed. Do not quote these as balance.
  breaker: {
    name: 'Breaker',
    desc: 'A wave rolls out ahead of you, dragging what it catches along with it.',
    icon: '💦', rarity: 'normal',
    // The chapter's starter, and the simplest thing a starter can be: a wave comes through and
    // wrecks what is in the way. It is a run.novas ring with two extra fields — see spawnNova and
    // stepNovas in sim.js, where a nova carrying `arc` is limited to a sector and a nova carrying
    // `carry` keeps pushing what it already hit.
    //   arc     the FULL cone angle in radians, matching roar/flagella/clawRake's convention
    //           (inSector halves it) — one convention per concept, so a number copied between two
    //           cone weapons still means the same thing.
    //           1.6 rad is ~92 degrees at L1, opening to ~126 at L5.
    //   radius  how far the front travels before it dies. The nova's own NOVA_LIFE sets how long
    //           that takes, so a longer reach is also a FASTER front — deliberate: a bigger wave
    //           should look like it is moving harder, not like it is wading.
    //   carry   px/s^2 of outward push applied every frame to a body the front has ALREADY hit,
    //           for as long as the front is alive. This is the whole
    //           difference between this and Cytokine Burst: `knockback` is the one-shot shove every
    //           nova in the game deals, and `carry` is what makes a body RIDE the wave out instead
    //           of being batted once. Set it to 0 and this weapon is a cone-shaped Cytokine Burst,
    //           which is the regression to watch for.
    //           ⚠ IT HAS TO BE READ AGAINST KB_DECAY_RATE (6/s, sim.js) OR IT DOES NOTHING VISIBLE.
    //           Knockback is a velocity that decays at that rate, so an acceleration of `carry`
    //           settles at a terminal speed of carry/6 — the first cut used 260-400, i.e. 43-67
    //           px/s, against a crest that travels radius/NOVA_LIFE = 467-690 px/s. The body was
    //           left standing while the wave went past it, which on screen is indistinguishable
    //           from no carry at all. These numbers put terminal at 183-267 px/s: a real ride, and
    //           still well under the crest, so a body is overtaken by the wave rather than glued to
    //           it. Any retune of this stat has to re-do that division.
    // Pinned against Cytokine Burst (rare: dmg 18-42, interval 2.4-1.5, radius 150-255): this is a
    // normal-rarity STARTER covering roughly a third of the circle, so it trades the ring's whole
    // coverage for reach and cadence. Damage sits under the burst's at every level.
    levels: [
      { dmg: 16, interval: 1.67, radius: 210, arc: 1.60, knockback: 120, carry: 1100 },
      { dmg: 20, interval: 1.54, radius: 230, arc: 1.75, knockback: 135, carry: 1200 },
      { dmg: 25, interval: 1.42, radius: 255, arc: 1.90, knockback: 150, carry: 1320 },
      { dmg: 31, interval: 1.29, radius: 280, arc: 2.05, knockback: 170, carry: 1450 },
      { dmg: 39, interval: 1.17, radius: 310, arc: 2.20, knockback: 190, carry: 1600 },
    ],
  },
  skippingShell: {
    name: 'Skipping Shell',
    desc: 'Skims a shell that skips off the sand, splashing at every touch.',
    icon: '🐚', rarity: 'rare',
    // ONE rule produces both halves of the read. The shell flies, and every `skipEvery` seconds it
    // TOUCHES DOWN: a small splash where it lands, and it re-aims at the nearest enemy it has not
    // already splashed. So it visibly bounces along a path AND it visibly changes course to chase —
    // which is a ricochet — without two mechanics, two entities or two tuning surfaces. It dies
    // when its skips run out, not on a timer, so `skips` is the reach knob as much as `speed` is.
    //   skips      touch-downs remaining. The shell is spawned with this many and spends one each.
    //   skipEvery  seconds of flight between touch-downs.
    //   r          splash radius of one touch-down. Whitelisted in buildReadout, so it reaches the
    //              build sheet; `skips` is whitelisted alongside it for the same reason.
    // The splash is a run.novas ring (spawnNova, no arc, no carry) rather than a fourth bespoke
    // AoE — same reason the Shelf reuses run.bombs and run.strips instead of adding arrays.
    // Pinned against Reality Shard and the Boomerang, the two rare travelling weapons.
    levels: [
      { dmg: 20, interval: 1.70, speed: 430, skips: 3, skipEvery: 0.24, r: 46 },
      { dmg: 25, interval: 1.58, speed: 450, skips: 3, skipEvery: 0.23, r: 50 },
      { dmg: 31, interval: 1.46, speed: 470, skips: 4, skipEvery: 0.22, r: 54 },
      { dmg: 38, interval: 1.34, speed: 490, skips: 4, skipEvery: 0.21, r: 59 },
      { dmg: 47, interval: 1.20, speed: 515, skips: 5, skipEvery: 0.20, r: 65 },
    ],
  },
  barnacles: {
    name: 'Barnacles',
    desc: 'Seeds larvae that crust onto what they hit — and jump to the next body when it dies.',
    icon: '🦪', rarity: 'rare',
    // The one weapon that rewards walking INTO the pack instead of picking off the stragglers: a
    // crust does nothing on a body that was going to die anyway, and everything in a crowd where
    // each death re-seeds the next. See stepBarnacleWeapon (delivery) and stepBarnacles (the tick
    // and the jump) in sim.js.
    //   count      larvae per cast, spread across the aim.
    //   dmg        damage per TICK, not per cast — a crust is a slow grinder, so this number is
    //              small and the row on the build sheet says so (STAT_LABEL calls it 'crust damage
    //              per tick'). Reading it as a hit is the misread to guard against.
    //   crustDur   how long a crust lasts on one body, refreshed by a fresh larva but never stacked
    //              (see stepBarnacles — stacking turns a 4s grind into an execute). NOT spelled
    //              `duration`: that key is shared with the beam weapons and is labelled 'Burns for'
    //              on the build sheet, which is a lie about a shell crust.
    //   jumps      how many NEW bodies one crust seeds when its host dies, AND how deep the chain
    //              can run: each child inherits `jumps - 1`, so one cast's infection is at most this
    //              many generations deep however dense the crowd is. Letting children inherit the
    //              full count reads as exactly the same card and is unbounded — one lucky pack would
    //              crust the entire field. It is a level stat and a tier mod rather than a
    //              percentage because 2 -> 3 is a different weapon and +30% of 2 is not a number.
    //              The chain is also gated on KILLS, not on time, so it only advances as fast as the
    //              player is actually killing — which is what stops it outrunning its own damage.
    // ⚠ A crust is INVISIBLE unless render.js is told about it. The status fields render.js reads
    // off an enemy are a fixed named list (frozen/chill/venom/ignite/fearT/stunT) and it never
    // learns a new one on its own — the v7.5x elements rework shipped freeze into a private field
    // and froze enemies with no ice tint at all. `e.barnacle` is published as a contract field and
    // drawn as a crust of pale shell lumps; see the status block in render.js.
    levels: [
      { dmg: 4, interval: 2.80, count: 2, castRange: 250, speed: 520, crustDur: 3.6, tick: 0.5, jumps: 2 },
      { dmg: 5, interval: 2.65, count: 2, castRange: 265, speed: 530, crustDur: 3.9, tick: 0.5, jumps: 2 },
      { dmg: 6, interval: 2.50, count: 3, castRange: 280, speed: 545, crustDur: 4.2, tick: 0.5, jumps: 2 },
      { dmg: 8, interval: 2.35, count: 3, castRange: 300, speed: 560, crustDur: 4.5, tick: 0.5, jumps: 3 },
      { dmg: 10, interval: 2.15, count: 4, castRange: 320, speed: 580, crustDur: 5.0, tick: 0.5, jumps: 3 },
    ],
  },
  // -- The Trawl's two natives (spec §7) -------------------------------------------------------
  // The chapter is the humans' gear pointed back at the water, so both weapons ARE fishing gear.
  // The shapes they claim, and why neither is a weapon this game already has:
  //   longline  A LINE YOU LEAVE BEHIND. Every other area denial in the game is a disc (holes,
  //             mines, zones, blooms) or a moving front (novas). Nothing else is a static segment.
  //             ⚠ It is NOT a swept beam: run.beams already carries `swept` + `rotSpeed` + `arms`
  //             and that is Pulsar Sweep. A longline that rotated around the player would be a
  //             third rotating rake wearing a different name.
  //   netToss   A GROUP HOLD. Pincer answers ONE approach; this stops a pack. It reuses run.lobs
  //             wholesale for the throw (see the snare branch in stepLobs) and adds no array.
  // Both damage-and-control rather than burst, because the chapter's own wall does the executing:
  // what the player needs from their gear is to keep the crowd OFF them and STILL long enough for
  // the net to arrive. Longline is the starter and Net Toss the rare — the pair is a fence and a
  // snare, which is the whole fishing verb split in two.
  longline: {
    name: 'Longline',
    desc: 'Sets a baited line across their path. Everything that touches it is hooked and bleeds.',
    icon: '🪝', rarity: 'normal',
    // Laid PERPENDICULAR to the nearest enemy, `offset` px toward them — a fence between you and
    // the pack, which works standing still as well as running. (Laying it in the player's wake
    // instead was the first idea and it is Fin Hit's job: a weapon that only works while moving is
    // The Deep's claim, not this one.)
    //   dmg      damage per TICK, not per cast. Small on purpose — a line is a grinder, and the
    //            value is the number of bodies crossing it, never the number on one of them.
    //   length   the segment's full length. LONGLINE_HALF_W is its thickness and is fixed: a line
    //            that got thicker with level would stop being a line.
    //   setDur   how long a set line stays in the water. Deliberately NOT `duration` — that key is
    //            shared with the beam weapons and the build sheet labels it 'Burns for', which is a
    //            lie about a rope. Same reasoning as barnacles' `crustDur` above.
    //   offset   how far ahead of the player the line is set.
    // The catch (LONGLINE_SNAG) fires ONCE PER BODY PER LINE — see the `snagged` set in
    // stepLonglines. A stun refreshed every tick would be a permanent lock, and at tick 0.40s
    // against a 0.5s stun that is exactly what a per-tick application would produce.
    // PINNED AGAINST BREAKER, the book's other normal-rarity starter, measured in ONE census
    // invocation off one RNG stream (weapon-census.mjs --chapter surf, 240s x 5 seeds):
    //
    //                          L1 eff  L5 eff  L5 waste  L5 dud  L5 hits/s
    //   Breaker                    66     100       23%      8%        4.0
    //   Longline (first cut)       87     133       12%      3%        8.9
    //   Longline (dmg -25%)        81     123        9%      2%       11.0
    //   Longline (shipped)         66     107        9%      4%        9.4
    //
    // The first cut sat a third above the sibling starter AND was the most reliable weapon in the
    // table — a grinder wastes little and almost never fires at nothing, where a burst starter
    // whiffs 8% of its casts outright. Reliability is already an edge, so parity on paper is the
    // ceiling here, not the target.
    //
    // ⚠ DAMAGE IS THE WRONG KNOB ON A GRINDER, and the middle row is the proof: cutting dmg 25%
    // bought only 7% less dps, because weaker ticks leave bodies alive to eat MORE ticks — hits/s
    // rose 8.9 -> 11.0 and absorbed most of the cut. The weapon's throughput is set by how much
    // LINE-TIME is in the water, not by the number on a tick. `setDur` is therefore what came down
    // (6.0 -> 4.2 at L5): it is the count of lines live at once, setDur/interval, which now runs
    // 1.3 at L1 to 2.1 at L5. Reach for the coverage stat, not the damage stat, on anything that
    // ticks. The snag is untouched throughout — the catch is what the card IS, the damage is what
    // it costs.
    // ⚠ Do NOT read these against the numbers the same census prints for --chapter trawl (Longline
    // 318/411 on the first cut there). `eff dps` is a global enemy-HP diff, so in the Trawl it
    // credits every weapon with the chapter's own net — roughly two thirds of the figure. Surf is
    // the control chapter precisely because nothing in it damages the crowd on its own.
    levels: [
      { dmg: 5,  interval: 2.60, length: 260, setDur: 3.4, tick: 0.40, offset: 90 },
      { dmg: 6,  interval: 2.45, length: 285, setDur: 3.6, tick: 0.40, offset: 95 },
      { dmg: 8,  interval: 2.30, length: 315, setDur: 3.8, tick: 0.40, offset: 100 },
      { dmg: 10, interval: 2.15, length: 345, setDur: 4.0, tick: 0.40, offset: 105 },
      { dmg: 13, interval: 2.00, length: 380, setDur: 4.2, tick: 0.40, offset: 110 },
    ],
  },
  netToss: {
    name: 'Net Toss',
    desc: 'Throws a weighted net over a pack and holds them where they stand.',
    icon: '🕸️', rarity: 'rare',
    //   r       the mesh's radius where it lands. This is the stat that decides whether it is a
    //           group hold or an expensive single-target stun, so it is the one `wideNet` buys.
    //   hold    seconds held, BEFORE diminishing returns. Every application goes through
    //           ccScale/spendCC like every other control in the game, so a pack caught twice in a
    //           row is held for less the second time and an elite resists outright — without that,
    //           a rare weapon with a 1.75s group stun on a 2.6s cadence is a permanent lock.
    //   flight  seconds in the air. Long enough to read as thrown, short enough that a fast pack
    //           has not walked out of the landing spot.
    // Pinned against the book's other two rares in ONE census invocation (--chapter surf, the
    // control chapter — see the warning in WEAPONS.longline about reading trawl numbers):
    //
    //                          L5 eff  L5 waste   the reading
    //   Skipping Shell            114       26%
    //   Barnacles                  93        8%   the other rare bought for what it DOES
    //   Net Toss (first cut)       87       26%   bottom of the rares AND the most wasteful
    //   Net Toss (cadence +10%)    82       26%   MORE casts measured WORSE — see below
    //   Net Toss (shipped)         88       25%
    //
    // Two knobs were tried and the first one moved it backwards. At 26% waste the burst is already
    // overkilling what it lands on, so neither a bigger number nor more casts buys anything — both
    // are spent on corpses. `r` is the knob that matches what the card IS: a wider mesh catches more
    // BODIES per throw, which is more hold as well as more damage, and it is the one stat whose
    // increase cannot be eaten by overkill. It stays the lowest-damage rare in the book on purpose —
    // the hold is the rest of the price, and Barnacles at 93 is the honest neighbour to sit beside.
    levels: [
      { dmg: 22, interval: 3.40, r: 100, hold: 1.10, flight: 0.42, castRange: 260 },
      { dmg: 27, interval: 3.20, r: 109, hold: 1.25, flight: 0.42, castRange: 275 },
      { dmg: 34, interval: 3.00, r: 119, hold: 1.40, flight: 0.42, castRange: 290 },
      { dmg: 42, interval: 2.80, r: 130, hold: 1.55, flight: 0.42, castRange: 305 },
      { dmg: 52, interval: 2.60, r: 142, hold: 1.75, flight: 0.42, castRange: 320 },
    ],
  },
  // -- The Twilight's three natives ---------------------------------------------------------------
  // The chapter is one resource seen from three sides. `resource` (CHAPTERS.shelf) is a bar that
  // drains in the dark and refills in a sun shaft, and until now it bought exactly one thing: the
  // Pulse's shove. These three make it a BUILD decision as well as a timer — the starter ignores it,
  // and the two rares read it in opposite directions, so a player who owns both is never simply
  // "topped up" or "empty", they are always strong at one end of their own bar.
  //
  // ⚠ THIS IS NOT resourceDamageMul, AND THE DIFFERENCE IS THE WHOLE ARGUMENT. That helper's block
  // says §5.3 spent the book's ONE licence for a bar that drives weapon output, spent it on The
  // Surf's Humidity, and that The Twilight is deliberately untouched by it. Two things keep that rule
  // intact here:
  //   - it is COVERAGE that moves, never a damage multiplier. A bloom's radius and a lance's reach
  //     are things the player watches change on screen; the reviewed failure was a multiplier you
  //     cannot feel in its top half and fall off a cliff in its bottom, and neither of these is a
  //     multiplier on a number at all. (It is also the knob WEAPONS.longline's block proves is the
  //     real one on anything that ticks: throughput is set by how much of the field you cover, not
  //     by the number on a tick.)
  //   - it is OPT-IN PER CARD, not per chapter. resourceDamageMul taxes every weapon a chapter has;
  //     these are two cards out of a pool, and Sunspear — the starter, the one weapon every Shelf
  //     run begins with — reads the bar not at all. A run that never picks a rare never meets this.
  // Neither rare can spiral, for the same reason BURST_DUR_MIN and BREACH_R_MIN exist: Sunlance is
  // the one that gets WORSE as the bar empties, so its reach has a floor (SUNLANCE_REACH_MIN) and an
  // empty bar still fires a real lance. Foxfire moves the other way and needs no floor.
  //
  // NO NEW run.* ARRAY, which is the standard THE SURF's block above sets. A column is a run.lobs
  // entry that falls instead of flying, a foxfire is a run.blooms entry, a lance is a run.beams
  // entry that does not rotate.
  sunspear: {
    name: 'Sunspear',
    desc: 'Calls down a column of light on what is nearest. More columns as it grows.',
    icon: '☀️', rarity: 'normal',
    // The chapter's starter and the tagline made literal — the light only goes down. A column is a
    // run.lobs entry whose `fromX/fromY` ARE its target, so it does not travel: it hangs for
    // SUNSPEAR_FALL seconds as a telegraph and then lands. That is the whole trick, and it is why
    // this needed no entity of its own (see the `column` branch in stepLobs).
    //   count      columns per cast, and THE LEVEL AXIS. L5 is three separate strikes on three
    //              separate bodies, never one fatter strike — see sunspearSpots in sim.js, which
    //              picks DISTINCT enemies and pads any shortfall onto a ring rather than stacking.
    //   r          splash radius where a column lands.
    //   castRange  how far out it will look for a body to drop on.
    // ⚠ `count` IS WRITTEN TWICE — as the loop bound AND as the divisor that spaces the padding
    // ring — which is the failure CLAUDE.md documents at length: multiply one and the extra columns
    // land on top of each other, which renders identically to no change at all. sunspearSpots
    // therefore takes ONE `count` and derives both from it, and run SH.a asserts DISTINCT POSITIONS
    // rather than a count, because a count passes happily when three columns share a point.
    // Pinned against Breaker and Longline, the book's other two normal-rarity starters. This one
    // aims, so it wastes far less than a cone and whiffs far less than a burst; the price is that it
    // covers only where bodies already are, and it can do nothing at all on an empty field.
    //
    // MEASURED, ONE census invocation (--chapter shelf, 240s x 5 seeds, L1 and L5) so every row is
    // off one RNG stream and the ORDER is the reading, never the absolute value:
    //
    //                      L1 eff  L5 eff  L5 waste  L5 dud
    //   Breaker                63     106       45%     11%   the book's other BURST starter
    //   Longline               73     156       11%      4%   the book's other starter, a grinder
    //   Sunspear (shipped)     56     123       29%      6%
    //   Barnacles              19     114        9%      2%   the rare band, for scale
    //   Net Toss               65     111       34%      2%
    //
    // It opens BELOW the sibling burst starter and ends above it, which is `count` doing its job:
    // 1 -> 3 columns is the level axis, so the weapon grows by covering more of the field rather
    // than by hitting harder, and a chapter-1 player is not handed the top of the table.
    // ⚠ DAMAGE WAS THE WRONG KNOB, AND THE FIRST CUT PROVED IT: -23% on `dmg` measured BETTER
    // (135 -> 140 eff), because weaker columns leave bodies alive to eat MORE columns — waste fell
    // 34% -> 29% and hits/s rose 3.8 -> 4.8, which more than absorbed the cut. `r` is what came down
    // instead (82 -> 66 at L5). That is WEAPONS.longline's rule about grinders, and it applies here
    // because a multi-strike that re-aims at whatever is still standing IS one.
    levels: [
      { dmg: 17, interval: 2.10, count: 1, r: 50, castRange: 300 },
      { dmg: 21, interval: 1.98, count: 1, r: 54, castRange: 320 },
      { dmg: 26, interval: 1.85, count: 2, r: 58, castRange: 340 },
      { dmg: 32, interval: 1.72, count: 2, r: 62, castRange: 360 },
      { dmg: 40, interval: 1.60, count: 3, r: 66, castRange: 380 },
    ],
  },
  foxfire: {
    name: 'Foxfire',
    desc: 'A cold fire that barely shows in the light and takes hold in the dark.',
    icon: '🌘', rarity: 'rare',
    // The card that gives the dark an UPSIDE. The chapter measures at 63% of a run spent dark (see
    // CHAPTERS.shelf.resource), which until now was pure cost: no sight, and a move-speed penalty.
    // This is the first thing in the chapter that pays you for being down there.
    //   dmg      damage per TICK, not per cast — a foxfire is a grinder like the longline and the
    //            crust, and the value is the number of bodies standing in it.
    //   maxR     the bloom's radius IN THE LIGHT. What the dark buys is up to FOXFIRE_GLOOM times
    //            this, and the multiplier is SNAPSHOT AT CAST rather than tracked per tick: a fire
    //            you lit while you were dark keeps the hold it took, which is what makes it a
    //            decision ("cast it now, while it will catch") instead of a number that wobbles.
    //   glowDur  how long it burns. NOT `duration`: that key is shared with the beam weapons and
    //            the build sheet labels it 'Burns for', which would be the same words for two
    //            different things on one screen. Same reasoning as barnacles' `crustDur`.
    // It reuses run.blooms wholesale and carries `slow: 0` — the pond's Spore Bloom slows what
    // stands in it, and inheriting that here would hand a second slow to the one chapter that
    // already has one, unadvertised, on a card whose text says nothing about it.
    //
    // MEASURED in the same invocation as Sunspear above. The rare band it has to sit in is
    // Barnacles 114 and Net Toss 111:
    //
    //                                  L5 eff  L5 waste  hits/s
    //   Foxfire (first cut)               159       11%    12.8
    //   Foxfire (radius -19%)             139       12%    11.2
    //   Foxfire (shipped, tick -29%)      109        9%    12.0
    //
    // COVERAGE WAS TRIED FIRST, on WEAPONS.longline's rule, and it SATURATED: a same-stream probe
    // carrying 1.6x the radius bought only +23% (139 -> 171), because this chapter's spawn rate caps
    // what any grinder can remove and the extra area lands on water. Tick damage was the knob with
    // leverage left, and at 9% waste there was no overkill to absorb it — which is the OPPOSITE of
    // the reading Sunspear gave two blocks up. Neither knob is right by default; measure which one
    // the weapon is currently bounded by.
    //
    // ⚠ THE CEILING IS 160, AND IT IS ONLY REACHED ON A FULLY EMPTY BAR. The same probe pinned at
    // maximum gloom read 160 eff, ~40% clear of the rare band. That is not the number this card
    // plays at: scripts/charge-probe.mjs measures a real Shelf run at 63% dark and MEAN DEPTH 0.29,
    // so a typical gloom is about 1.17 rather than 1.6 and play sits near the 109 end. The 160 is
    // what a player buys by running on empty — which costs them the Pulse and 40% of their move
    // speed at the same time. That trade IS the card, and it is why the base had to come down to
    // the bottom of the band rather than the middle of it.
    levels: [
      { dmg: 4,  interval: 3.00, maxR: 54, glowDur: 2.4, castRange: 280 },
      { dmg: 5,  interval: 2.85, maxR: 59, glowDur: 2.6, castRange: 295 },
      { dmg: 6,  interval: 2.70, maxR: 64, glowDur: 2.8, castRange: 310 },
      { dmg: 8,  interval: 2.55, maxR: 69, glowDur: 3.0, castRange: 325 },
      { dmg: 10, interval: 2.40, maxR: 74, glowDur: 3.2, castRange: 340 },
    ],
  },
  sunlance: {
    name: 'Sunlance',
    desc: 'Spears a shaft of hard light through the crowd. It reaches as far as your Light does.',
    icon: '✴️', rarity: 'rare',
    // Foxfire's mirror, and the reason the pair is worth more than either alone: they are strong at
    // opposite ends of the same bar, so the bar stops being a thing you keep topped up and becomes a
    // thing you STEER. A lance is a run.beams entry with `rotSpeed: 0` — it does not sweep, which is
    // deliberate and is the one shape this weapon must not have (run.beams already carries
    // `swept` + `arms`, and that is Pulsar Sweep; a third rotating rake is what CLAUDE.md warns the
    // Trawl's longline away from too).
    //   length    reach at a FULL bar. At an empty one it is SUNLANCE_REACH_MIN of this and still a
    //             real weapon — the no-spiral floor, in the same idiom as BURST_DUR_MIN.
    //   duration  how long the lance is held out. It ticks while it is there, so a body walking
    //             across the line during those frames is struck as surely as one standing on it.
    //   dmg       per TICK. duration/tick is 3 ticks, so a body held on the line for the whole
    //             stab takes three of these.
    // MEASURED in the same invocation: 122 eff at L5 at 18% waste, against the rare band's 114
    // (Barnacles) and 111 (Net Toss). Left there rather than trimmed onto the anchor, deliberately:
    // the census rig sits at a charge of 63, which is 80% reach, and this is the one card in the
    // chapter that gets WORSE as the bar empties. A real run is under half a bar for 63% of its
    // length, so this weapon's PLAY average sits below the number above rather than on it — trimming
    // to parity with a static rare would ship it under the band it is supposed to be in.
    levels: [
      { dmg: 10, interval: 2.20, length: 360, width: 26, duration: 0.40, tick: 0.13 },
      { dmg: 12, interval: 2.08, length: 405, width: 29, duration: 0.40, tick: 0.13 },
      { dmg: 14, interval: 1.96, length: 455, width: 32, duration: 0.40, tick: 0.13 },
      { dmg: 17, interval: 1.84, length: 505, width: 35, duration: 0.40, tick: 0.13 },
      { dmg: 21, interval: 1.70, length: 560, width: 38, duration: 0.40, tick: 0.13 },
    ],
  },
  // ---- The Shelf's three natives (v7.x) -------------------------------------------------
  // Le Large's arsenal, replacing the borrowed stand-ins (stinger/mines/hole) it opened with. The
  // chapter is about not being able to see and about what has been dumped in the water, and these
  // three are the second of those: the murk is not only the antagonist here, it is the material.
  //
  // NONE OF THEM READS THE CLARITY BAR, deliberately. The Twilight's Foxfire and Sunlance are the
  // pair that live at opposite ends of a bar, and doing that twice in one book would make the two
  // chapters the same chapter with different weather. Here the bar decides what you can SEE and the
  // weapons decide what you can reach; they meet in the player's hands, not in a stat.
  bubblePuff: {
    name: 'Bubble Puff',
    desc: 'Blows a cone of bubbles that scours what it touches.',
    icon: '🫧', rarity: 'normal',
    // THE STARTER, named in §6.2 of the Undertow spec. A run.novas entry LIMITED TO A SECTOR — the
    // same machinery as The Surf's Breaker, which is where `arc` is documented at length — tagged
    // look: 'bubble' so the renderer can tell it from a crest without inferring it from the radius.
    //   arc        the FULL cone angle in radians, matching breaker/roar/flagella/clawRake's
    //              convention (stepNovas halves it). 1.571 is 90 degrees.
    //              ⚠ FLAT ACROSS THE LADDER, and that is the design rather than an oversight.
    //              Owner, 2026-08-18: "i think the bubble puff shouldn't be 360 by default. maybe
    //              90°, with mods to increase width." So WIDTH IS THE AXIS THE MODS OWN: levels buy
    //              damage and reach, and Flare is the only thing that buys coverage. The
    //              Breaker grows its arc with level instead — do not copy that here, or Flare is
    //              competing with the level-up for the same number.
    //   r          the cone's outer radius. Short on purpose: this is the card that says "you are a
    //              small fish", and its answer to a crowd is to out-cut it, not to out-reach it.
    // NO `knockback`, AND ITS ABSENCE IS THE DESIGN (owner, 2026-08-19: "let's remove the knockback
    // entirely on bubble puff"). It shoved until then, and the shove was what made STANDING STILL
    // the best way to play the chapter: with Flare x5 and Long Puff x5 the ring held a 408px bubble
    // nothing crossed, and a motionless player beat a walking one by 43s and won 29% of runs against
    // a walker's 0% (mortal, 300s, 7 seeds). Deleting it takes that to 0%. The weapon is now a fast
    // short cone that CUTS — every other card on it (Froth, Flare, Long Puff, Scour, Backblow) still
    // buys exactly what it says, and none of them ever sold the shove.
    // It aims through aimAngle — nearest body first, facing only as the fallback. A cone that
    // pointed where you MOVE would point at empty water, because a survivors player kites away
    // from the pack; that is fireFlagella's hard-won rule and this weapon inherits it.
    levels: [
      // rate is /1.15 at every rung, 2026-08-18: the cone costs the card three quarters of its
      // coverage, so the compensation is cadence rather than width — widening it back would undo
      // the change the owner asked for. SMALLER IS FASTER here; `rate` is an interval.
      { dmg: 14, rate: 0.800, r: 155, arc: 1.571 },
      { dmg: 17, rate: 0.748, r: 168, arc: 1.571 },
      { dmg: 20, rate: 0.696, r: 181, arc: 1.571 },
      { dmg: 25, rate: 0.652, r: 195, arc: 1.571 },
      { dmg: 29, rate: 0.609, r: 210, arc: 1.571 },
    ],
  },
  siltVeil: {
    name: 'Silt Veil',
    desc: 'Stirs the bottom into a cloud that poisons and scatters what swims in.',
    icon: '🌫️', rarity: 'normal',
    // A run.blooms entry tagged look: 'silt', dropped at the player's feet on a timer — the same
    // array the pond's Toxin Bloom and The Twilight's Foxfire use, and the third card to carry a
    // look tag so the three cannot be told apart by radius (which is a guess that starts being
    // wrong the first time any of them is retuned).
    //
    // `fear` IS THE CARD, and it is published into e.fearT — the contract field the roster, the
    // renderer and SFX_FOR_EVENT already read. A brand-new "blinded" flag would have needed its own
    // tint, its own particle and its own sound before it was distinguishable from doing nothing,
    // which is the failure CLAUDE.md's elements rework shipped. Fish scatter out of a silt cloud;
    // that IS fear, and it already has a full tell.
    //   `slow: 0` is set at cast: this chapter does not slow you and must not quietly slow them
    //   either — a card whose text never mentions a slow must not add one.
    levels: [
      // `castRange` (2026-08-19): the cloud is planted ON A BODY, not at the player's feet -- owner,
      // "the clouds of vase should appear under enemies not under the player". This is how far it can
      // reach to find one, and the ladder is set beside Toxin Bloom's (260 -> 320), the shipped
      // weapon whose targeting this now shares. Slightly shorter at the bottom: this chapter is
      // about not being able to see, and a first-level cast that reaches further than the murk does
      // would be the weapon arguing with its own chapter.
      //
      // `clouds` is FLAT ACROSS THE LADDER: levels buy damage, reach and duration, and Roil is the
      // only thing that buys a second cloud -- the same split Flare owns on the Bubble Puff's width,
      // and for the same reason (a level-up that also grew it would compete with the card).
      //
      // NOT named `count`: STAT_KEYS labels that key 'Projectiles', which is a lie about a cloud of
      // silt on the pause build sheet. `skips`, `crustDur`, `setDur` and `hooks` all exist for
      // exactly this reason -- a per-weapon key earns a per-weapon label, and being unique to this
      // weapon's levels[] means no other build sheet gains a row.
      { dmgPerTick: 6,  rate: 4.4, maxR: 116, dur: 3.4, fear: 0.9, clouds: 1, castRange: 240 },
      { dmgPerTick: 8,  rate: 4.1, maxR: 126, dur: 3.7, fear: 1.0, clouds: 1, castRange: 260 },
      { dmgPerTick: 11, rate: 3.8, maxR: 136, dur: 4.0, fear: 1.1, clouds: 1, castRange: 280 },
      { dmgPerTick: 13, rate: 3.5, maxR: 148, dur: 4.4, fear: 1.2, clouds: 1, castRange: 300 },
      { dmgPerTick: 15, rate: 3.2, maxR: 162, dur: 4.8, fear: 1.4, clouds: 1, castRange: 320 },
    ],
  },
  ballast: {
    name: 'Ballast',
    desc: 'Drops dumped weight on the crowd. What it lands in stays fouled.',
    icon: '⚓', rarity: 'rare',
    // THE POOL'S ONLY ANSWER TO DISTANCE. Bubble Puff is a ring on the player and Silt Veil is a
    // cloud at their feet, so without this the chapter has no card that reaches and the whole
    // arsenal is one radius. A run.lobs entry, the array Debris Toss and Sunspear already share.
    //
    // ⚠ run.lobs HAS THREE RENDER CONSUMERS (syncLobs, redrawHazards' amber landing ring, and
    // drawColumns) and nothing about the array says so — the Sunspear shipped wearing Debris Toss's
    // landing ring for exactly this reason. look: 'ballast' is filtered OUT of the other two.
    //
    // The stain is a second run.blooms entry pushed at the landing, so the lingering half of the
    // card is the same cloud machinery Silt Veil uses rather than a fourth kind of zone. That is
    // also what makes the two cards combine: a ballast dropped into your own veil is one patch of
    // water doing both jobs.
    levels: [
      // `weights` flat across the ladder, and named for the same reason Silt Veil's `clouds` is:
      // 'Projectiles' is the wrong noun for a dumped weight. Jetsam owns the second one.
      { dmg: 26, rate: 2.60, r: 96,  stainDur: 3.0, stainDps: 5,  weights: 1 },
      { dmg: 31, rate: 2.45, r: 104, stainDur: 3.3, stainDps: 6,  weights: 1 },
      { dmg: 37, rate: 2.30, r: 112, stainDur: 3.6, stainDps: 7,  weights: 1 },
      { dmg: 44, rate: 2.15, r: 122, stainDur: 4.0, stainDps: 9,  weights: 1 },
      { dmg: 52, rate: 2.00, r: 134, stainDur: 4.4, stainDps: 11, weights: 1 },
    ],
  },
  // -- The Deep's native (spec §6.5) -------------------------------------------------------------
  finHit: {
    name: 'Fin Hit',
    desc: 'Your own body, swung where you turn. Worthless standing still — it hits as hard as you swim.',
    icon: '🦈', rarity: 'normal',
    // MOVEMENT-COUPLED, and the only weapon in the game that is. Two halves, both of which need the
    // player to be moving, and neither of which asks them to aim:
    //   WHERE   a sector swung to the OUTSIDE OF YOUR TURN — the shark's body doing what a body does
    //           when it changes direction. Swimming straight, it alternates sides like a tail beat.
    //           Nothing else here decides its direction from the player's steering rather than from
    //           where the enemies are, which is what makes it feel like the animal instead of a gun.
    //   HOW HARD  damage scales LINEARLY WITH YOUR CURRENT SPEED, from 0 at a standstill to full at
    //           base speed, and it keeps climbing past that to FINHIT_SPEED_CAP — so Zoomies and
    //           every move-speed source finally has a weapon that reads them.
    //
    // ⚠ THE ZERO AT A STANDSTILL IS REAL AND IS THE CARD. It is also why the desc says so out loud:
    // ANOMALIES.stillness ramps damage the longer you DO NOT MOVE, is `weight: 1` and unconditional,
    // so it WILL be offered in this chapter, and the two cards cancel each other exactly. A player
    // who takes both has one of them switched off at all times, and nothing else in the game would
    // tell them that.
    //
    // ⚠ QUOTE THIS WEAPON AT `--stick 1` OR NOT AT ALL. weapon-census.mjs walks a FIXED input whose
    // default magnitude is 0.447 — measured, 98 px/s against a 220 px/s base — so the default rig
    // runs this card at 45% power and prints a plausible row that is 2.24x too low. It is the first
    // weapon in the game that reads the player's speed, and the `--stick` flag was added for it.
    //
    // Pinned against Breaker and Longline, the book's other two normal-rarity starters, in ONE
    // invocation at `--stick 1` (surf, 240s x 5 seeds):
    //
    //              L1 eff   L5 eff   L5 waste   L5 dud
    //   Fin Hit        62      118        23%      21%
    //   Breaker        63      126        21%       5%
    //   Longline       70      121         8%       3%
    //
    // Parity at both levels WHEN MOVING, which is the deal: the same output as its siblings for a
    // card that pays with a hard zero at a standstill. The dud column is the other half of that
    // price and is meant to be high — this is the one weapon that does not aim, so a fifth of its
    // sweeps find nothing. Do not "fix" that by aiming it; aiming it deletes the card.
    //
    // The first cut measured 165 at L5 in real-play terms (74 on the 45% rig) and was cut 32%, then
    // the backward sweep bias raised its hit rate and it needed cutting again — see
    // FINHIT_SWEEP_BIAS. Both knobs move throughput, so retune them together, not in sequence.
    levels: [
      { dmg: 20, interval: 1.05, range: 132, arc: 1.70, knockback: 55 },
      { dmg: 25, interval: 1.00, range: 140, arc: 1.78, knockback: 60 },
      { dmg: 31, interval: 0.94, range: 150, arc: 1.86, knockback: 66 },
      { dmg: 39, interval: 0.88, range: 160, arc: 1.95, knockback: 72 },
      { dmg: 48, interval: 0.82, range: 172, arc: 2.05, knockback: 80 },
    ],
  },
  // -- The Wreck's native (spec §9, built v7.x with the prey rework) -----------------------------
  gnash: {
    name: 'Gnash',
    desc: 'A short bite, straight ahead. The closer it lands, the deeper it goes.',
    icon: '🦷', rarity: 'normal',
    // THE CHAPTER'S THESIS AS A WEAPON. The Wreck pays you for closing on food that is running
    // away; this is the card that says so — a sector UNDER the reach of the long melee starters,
    // whose damage rises from x1 at the tip of the arc to GNASH_MAW_MUL at the jaw. The RAMP is the
    // identity, not the absolute reach: there is no reason to be at range here, and the card pays
    // you for every px you close.
    //
    // NOT A SECOND FIN HIT, and the axis is the whole distinction: finHit reads the player's SPEED
    // and swings to the outside of your turn, gnash reads the TARGET'S DISTANCE and points where
    // you aim. One is the animal's body, the other is its mouth. They are also two chapters apart
    // and never share a pool outside `blank`.
    //
    // ⚠ IT DOES NOT CLOSE ITS OWN GAP, AND NOTHING IN THE GAME'S ARSENAL DOES (owner,
    // 2026-08-18: "attacks = no movement that's the golden rule"). It is a short jaw in the one
    // chapter whose crowd RUNS at 103-223 px/s, so the gap is the player's
    // problem and the chapter sells three answers to it: the Lunge button, chum to turn them round,
    // bilge to wall them off. A weapon that travelled would make all three redundant and read as a
    // teleport. Run PY.g asserts the rule over every weapon in the game, not just this one.
    //
    // ⚠ KNOCKBACK IS ZERO AND THAT IS A DESIGN DECISION, NOT AN OMISSION. Every other melee weapon
    // in the game shoves what it hits, because everywhere else the crowd is walking into you and
    // buying space is the point. Here the crowd is LEAVING: a bite that shoves pushes your dinner
    // further away, out of the very falloff band that makes the next bite worth more. Adding
    // knockback to this weapon would make it worse the harder it hit.
    //
    // Geometry is clawRake/flagella/finHit's shipped `inSector` sweep — a new bake and a new tuning
    // table, not a new system.
    // ⚠ UNMEASURED FIRST CUT. Pitched between the two melee starters at the JAW and under both at
    // the tip: dmg 15 x GNASH_MAW_MUL 1.9 = 28.5 at L1 point blank against flagella's flat 14 and
    // the rake's 11, on a cadence between theirs. weapon-census it against Fin Hit and Breaker in
    // ONE invocation before quoting any of it.
    // balance_decision : reach carries the closing the dart used to do 2026-08-18
    //  - swept 78/100/118/135px base against the census: whiffed casts 60% -> 47%, kills/min
    //    49 -> 78 at L1. It does NOT reach the dart's 26% and is not meant to — the rest of that
    //    gap is the button's, chum's and bilge's job, and buying it back with reach would make all
    //    three redundant.
    levels: [
      { dmg: 15, rate: 0.60, range: 118, arc: 1.05 },
      { dmg: 18, rate: 0.56, range: 125, arc: 1.10 },
      { dmg: 22, rate: 0.52, range: 133, arc: 1.16 },
      { dmg: 27, rate: 0.47, range: 142, arc: 1.22 },
      { dmg: 34, rate: 0.42, range: 152, arc: 1.30 },
    ],
  },
  // -- The Wreck's herding gear (v7.x, owner: "stuff to dash, to slow enemies, to circle them add
  // barriers something") ------------------------------------------------------------------------
  // THE CHAPTER'S PROBLEM IS NOT DAMAGE, IT IS REACH. Every other chapter's arsenal answers "how do
  // I hurt the crowd"; this one's crowd is food that runs, so the question is "how do I get to eat
  // it". These two are the answer and they are the opposite halves of one verb: chum GATHERS, bilge
  // WALLS. Neither does much damage and that is deliberate — gnash is the mouth.
  //
  // ⚠ BOTH ARE DELIBERATELY DISTINCT FROM THE SHELF'S NEW SET, which landed on main while this was
  // being written (v7.136.0: Bubble Puff, Silt Veil, Ballast). Silt Veil already SCATTERS with fear
  // and Bubble Puff already SHOVES with a ring, so a wreck card that scattered or shoved would be
  // that chapter's card in another hat. Chum is the inverse of a scatter and bilge is a wall.
  chum: {
    name: 'Chum',
    desc: 'Tears the rotted catch out of the hold. What was fleeing turns and gathers.',
    icon: '🪣', rarity: 'normal',
    // THE INVERSE OF EVERY DECOY IN THE GAME. A Pheromone Lure taunts things that were already
    // coming for you; this turns things that were RUNNING. That is the same entity — a point in
    // run.lures with an aggro radius — so it is `bait: true` on the shipped array rather than a
    // fourth kind of zone, and stepPrey reads the tag to swim TOWARD instead of away.
    //
    // ⚠ WITHOUT THE TAG IT WOULD DO THE EXACT OPPOSITE OF THE CARD. The lure override sets the seek
    // target, and stepPrey flees from the seek target — so an untagged chum would be a repellent
    // that reads as a bug, and nothing would throw.
    //
    // No burst and no damage: the card is the gather. `dur` is long and `rate` slow because a bait
    // ball has to have time to form — a 1s gather is a flinch, not a shoal turning round.
    levels: [
      { rate: 5.0, castRange: 250, dur: 4.0, aggro: 240 },
      { rate: 4.6, castRange: 265, dur: 4.4, aggro: 265 },
      { rate: 4.2, castRange: 280, dur: 4.8, aggro: 290 },
      { rate: 3.8, castRange: 300, dur: 5.2, aggro: 320 },
      { rate: 3.4, castRange: 320, dur: 5.6, aggro: 355 },
    ],
  },
  bilge: {
    name: 'Bilge',
    desc: 'Splits a drum. The oil crawls out, it drags on anything in it, and nothing will swim into it.',
    icon: '🛢️', rarity: 'normal',
    // THE BARRIER, and it is the chapter's own hazard turned into a tool: the leak is what kills you
    // here (CHAPTERS.wreck.signature), and this card is you doing it back. That is the book's
    // pollution through-line pointed at the player's hand rather than at the player.
    //
    // A run.blooms entry tagged look: 'bilge' — the fourth card on that array after the pond's Toxin
    // Bloom, The Twilight's Foxfire and The Shelf's Silt Veil. `dmgPerTick: 0` because this is not a
    // damage zone; what it does is SLOW (bloomSlowT, the shipped enemy-side contract field) and, for
    // anything `skittish`, act as a wall it will not enter.
    //
    // THE TWO HALVES LOOK LIKE THEY FIGHT AND DO NOT. Prey refuse to enter, so the slow rarely
    // catches them — that is the point: you do not lay this ON the shoal, you lay it where the shoal
    // was going. The slow is what it does to everything that is NOT prey (the moray) and to prey you
    // drive into it with a Lunge. One card, two readings, and the player learns the second one.
    levels: [
      { rate: 4.2, dur: 4.5, maxR: 120 },
      { rate: 3.9, dur: 4.9, maxR: 132 },
      { rate: 3.6, dur: 5.3, maxR: 144 },
      { rate: 3.3, dur: 5.7, maxR: 158 },
      { rate: 3.0, dur: 6.2, maxR: 174 },
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
//   star.multishot/split/chain: unchanged from v2/v3 (see fireStar/stepBullets).
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
//   mines.magnetic:     armed (not-yet-triggered) mines crawl toward the nearest enemy at
//                       MINE_CRAWL_SPEED × bonus px/s.
//   mines.chainReaction: when a mine explodes, up to <tier bonus> other ARMED mines within its
//                       blast radius detonate immediately too (cascading breadth-first; a mine
//                       only ever detonates once).
//   homing.wispNova:    when a wisp dies (spent its last pierce on a hit, or its lifetime
//                       expired) it pops: AoE splash = bonus × the wisp's dmg in
//                       WISP_NOVA_RADIUS + explode event. Mini-wisps (see swarm) can pop too.
//                       v6.9.3: the splash goes through applyDamage, so it crits and takes the
//                       player's damage multipliers — the wisp's stored dmg is a RAW config stat.
//   homing.swarm:       when a (non-mini) wisp's hit KILLS an enemy, spawn <tier bonus> mini
//                       wisps at the kill spot (SWARM_DMG_FRAC × dmg, SWARM_LIFE lifetime, same
//                       speed/turn rate) flagged `_mini` — mini wisps never re-trigger swarm.
//   hole.hungry:        a hole's radius (and coreRadius, kept proportional) grows by
//                       bonus × its spawn radius per second while alive — visual-safe since
//                       render already re-reads h.radius/coreRadius every frame.
//   hole.crunch:        when a hole expires, it collapses in a detonation: damage = hole tick
//                       dmg × CRUNCH_DMG_MUL × (1 + bonus) to everything within its final
//                       radius + explode event there. v6.9.3: through applyDamage, so it crits
//                       and takes the player's damage multipliers (the tick dmg is raw config).
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
// Beam Prism's two card phrases (WEAPON_MODS.rainbow.prism). Hoisted to consts rather than written
// inline inside its `descFor` template so both stay COMPLETE QUOTED LITERALS in this file: run XX's
// dead-key sweep matches fr.js keys as whole literals against src/*.js, and a phrase that only ever
// exists as part of a template string reads to it as a translation nobody can produce. Its own
// comment offers an exemption list for that case; a literal costs less and keeps the sweep honest.
const PRISM_DESC = 'sub-beams where the beam lands'
const PRISM_DESC_DEEP = 'sub-beams where the beam lands, each splitting again'
// ICON CONVENTION, and what the icon audit deliberately did NOT fix.
// Mod icons are a vocabulary, not decoration: 📏 range, ⏩ rate, 🪭 cone width, 📡 radius,
// ⏳ duration, 🔨/🗡️ damage, 🧲 pull, 🌺 twin, 💢 retaliate, 🔁 echo. The same glyph on the same
// KIND of stat across weapons is the point — do not "de-duplicate" those. Separately, each
// weapon's count mod ("more of them") reuses the weapon's own glyph; every weapon does this
// exactly once, which is the check that caught Cytokine Burst showing 🌊 three times.
// Left alone knowingly, because the pause build sheet stacks weapons, mods, elements, anomalies
// and mutators together and these read fine in context: 🌀 means six things there (orbit spin,
// cyclone, resonance, rift scar, Chaos Pact, Unstable Physics), 🪤 four, ⚡ four, 💥 nine. And
// stinger.volley uses 🎯 for a COUNT while 🎯 is pierce on star and realityShard.
// stagger (behavioral): the mod's banked bonus IS the stun in SECONDS, so one normal pick is
// STAGGER_STUN_PER_PICK seconds flat and four are 1.40s (× rarity, × ccScale). It used to be
// ROAR_STUN(0.5) × a pct bonus(0.5/pick) = 0.25s, which is the same shape every duration in this
// file avoids: two multiplied constants in two places, neither of which states the answer. Nothing
// in the game told you the number — the card said "+50%" of something it never named — and the
// owner's question was literally "what does stun do, it doesn't seem to do much". Measured before
// the change: 4 picks moved contact hits 181 -> 179, i.e. nothing. See STAGGER_STUN_PER_PICK on
// WEAPON_MODS.roar.stagger; there is no stun CHANCE anywhere in the game, every stun is 100% on
// what it catches (cf. REPULSE_STUN, MINE_STUN, HYDRANT_STUN).
export const STAGGER_STUN_PER_PICK = 0.35 // s of stun per normal Stagger pick — the card states it
export const WEAPON_MODS = {
  star: {
    // blast ("Exploding Stars") removed in v4.6 — star AoE splash on every hit made it a
    // no-brainer even after the v4.4 offer caps (user call: no explosions). Reflex Rebound
    // (ricochet) removed later, on the owner's call — it and Signal Cascade both read as "a spent
    // antigen keeps going", and the random bounce was the weaker of the two. star keeps 4 mods.
    pierce:    { name: 'Membrane Piercer',  desc: 'antigen pierce',                    icon: '🎯', base: 1,    kind: 'flat', maxPicks: PIERCE_MAX_PICKS },
    multishot: { name: 'Split Strain',     desc: 'antigens per volley',              icon: '💫', kind: 'tier' },
    split:     { name: 'Mitosis',     desc: "shard(s) on an antigen's first hit", icon: '🔱', base: 1,    kind: 'flat' },
    chain:     { name: 'Signal Cascade',     desc: 'jump(s) to the next enemy',        icon: '🔗', kind: 'tier' },
  },
  orbit: {
    extraOrb:  { name: 'Extra Phages', desc: 'phages circling you',                  icon: '✨', base: 1,    kind: 'flat' },
    bigOrbs:   { name: 'Engorged Phages',   desc: 'phage hit radius',                     icon: '🔵', base: 0.20, kind: 'pct' },
    wideRing:  { name: 'Wide Orbit',   desc: 'how far out they circle',                        icon: '🪐', base: 0.20, kind: 'pct' },
    overdrive: { name: 'Fever Spin',    desc: 'orbit rotation speed',               icon: '🌀', base: 0.20, kind: 'pct' },
    twinRing:  { name: 'Double Membrane',    desc: 'a second row of phages around you', icon: '💠', kind: 'tier' },
    supernova: { name: 'Lysis Burst', desc: 'phage-kill splash damage',         icon: '🌟', base: 0.50, kind: 'pct' },
  },
  wave: {
    bigWave:   { name: 'Systemic Surge',  desc: 'burst radius',           icon: '🌊', base: 0.20, kind: 'pct' },
    shove:     { name: 'Fever Shove', desc: 'burst knockback',        icon: '👊', base: 0.20, kind: 'pct' },
    amplitude: { name: 'Inflammation', desc: 'wave damage',           icon: '📢', base: 0.20, kind: 'pct' },
    echo:      { name: 'Immune Echo', desc: 'echo wave(s) per cast', icon: '🔁', kind: 'tier' },
    undertow:  { name: 'Chemotaxis',  desc: 'bursts reel in gems and coins (wider per stack)', icon: '🧲', base: 1, kind: 'flat' },
    tsunami:   { name: 'Cytokine Storm',   desc: 'radius/damage on every 3rd (monster) wave', icon: '🌡️', base: 0.60, kind: 'pct' },
  },
  // v5.3: the id stays 'boomerang' (Boomerang Leaf re-theme is copy-only, see WEAPONS.boomerang);
  // only the desc copy was retouched from 'boomerang' to 'leaf' where it named the weapon.
  boomerang: {
    // v6.6.13 (playtest): was kind 'flat' base 1, i.e. max(1, round(1 * rarityMult)) — a RARE roll
    // already handed out +2 blades and a mythic one +7, on top of the weapon's own 1/1/2/2/3 ladder.
    // That is exactly the spiral WEAPON_MOD_TIER_BONUS exists to prevent (see its note above): a
    // per-cast ENTITY COUNT must not be multiplied by rarity. As a tier mod the second blade now
    // starts at epic (1/1/2/2/3 by rarity), which is what the playtester asked for.
    extraRang:  { name: 'Extra Leaves', desc: 'leaf(s) per throw', icon: '🍃', kind: 'tier' },
    longThrow:  { name: 'Long Throw',   desc: 'leaf range',      icon: '📏', base: 0.20, kind: 'pct' },
    bigBlade:   { name: 'Big Leaf',    desc: 'leaf hit radius', icon: '🌿', base: 0.20, kind: 'pct' },
    heavyBlade: { name: 'Heavy Leaf',  desc: 'leaf damage',     icon: '🔨', base: 0.20, kind: 'pct' },
    backhand:   { name: 'Backhand',      desc: 'leaf return-swing damage',      icon: '🤛', base: 0.50, kind: 'pct' },
  },
  mines: {
    minefield:   { name: 'Minefield',     desc: 'max cysts alive',             icon: '🪤', base: 1,    kind: 'flat' },
    bigBoom:     { name: 'Big Boom',      desc: 'cyst blast radius',           icon: '💥', base: 0.20, kind: 'pct' },
    heavyCharge: { name: 'Heavy Charge',  desc: 'cyst damage',                 icon: '🧨', base: 0.20, kind: 'pct' },
    cluster:     { name: 'Cluster Bombs', desc: 'bomblet(s) when a cyst pops', icon: '🎆', kind: 'tier' },
    magnetic:      { name: 'Magnetic Cysts', desc: 'armed-cyst crawl speed toward foes', icon: '🧲', base: 0.50, kind: 'pct' },
    chainReaction: { name: 'Chain Reaction', desc: 'nearby armed cyst(s) detonated by a blast', icon: '⛓️', kind: 'tier' },
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
    biggerHole:  { name: 'Bigger Hole',    desc: 'hole radius',             icon: '🕳️', base: 0.20, kind: 'pct' },
    lasting:     { name: 'Lasting Hole', desc: 'hole duration',           icon: '⏱️', base: 0.20, kind: 'pct' },
    denser:      { name: 'Denser Pull',    desc: 'hole pull',               icon: '🌌', base: 0.20, kind: 'pct' },
    singularity: { name: 'Singularity',    desc: 'extra hole(s) per cast', icon: '🌠', kind: 'tier' },
    // 0.40 -> 0.20 (owner, "it's too strong"): the growth compounds against a radius that is
    // already the hitbox, and it runs for the whole of a hole's duration, so the tier read as a
    // second Bigger Hole stacked on top of itself rather than a flavour on the same card.
    hungry:      { name: 'Hungry Hole', desc: 'hole growth rate while alive',       icon: '🍽️', base: 0.20, kind: 'pct' },
    crunch:      { name: 'Big Crunch',  desc: 'hole collapse detonation damage',    icon: '🌋', base: 1.00, kind: 'pct' },
  },
  // v6.7.6 (owner: "merge beam length and beam width into one series"). Wide Beam and Long Beam
  // were the same card twice — both +20% pct, both plain geometry, and between them plus Sustain
  // the player met a "+20% beam something" card on one level-up in five (measured, v6.7.5). One
  // card now moves both numbers by the same 20%, so the ceiling is unchanged (five picks still buy
  // 2x width and 2x length, i.e. 4x the swept area) and it costs half the level-ups to reach.
  // WEAPON_STAT_MODS.rainbow folds the pair; the name says both, per v6.6.13's rule that a card
  // must name what changes on screen.
  rainbow: {
    wideBeam:  { name: 'Big Beam',        desc: 'beam width & length',    icon: '📡', base: 0.20, kind: 'pct' },
    sustain:   { name: 'Sustain',         desc: 'beam duration',          icon: '⌛', base: 0.20, kind: 'pct' },
    prismatic: { name: 'Prismatic Split', desc: 'extra beam(s) per cast', icon: '🎇', kind: 'tier' },
    focus:     { name: 'Focus Lens', desc: 'damage climbs by {n} the longer it fires', icon: '🔎', base: 0.80, kind: 'pct' },
    strobe:    { name: 'Strobe Ray', desc: 'beam tick rate',                             icon: '💡', base: 0.40, kind: 'pct' },
    // v6.7.6 Beam Prism (owner spec). A `values` mod — the SAME idiom PASSIVES.armor/regen use:
    // it rolls only the listed rarities at the listed exact amounts, and makeWeaponModCard returns
    // null at any other tier, so no card is offered at normal at all. That is deliberate and it is
    // the whole design: RARITY IS THE STAT here. The number below is how many sub-beams the FIRST
    // refraction throws; each layer after it throws one fewer, down to 2, then stops (see
    // prismLadder). maxPicks 1 because a second pick would have nothing to add — the ladder is
    // fully determined by the rarity of the card you took.
    // `descFor` (not a plain `desc`) because a rare prism and a mythic one are different mechanics,
    // not different magnitudes of one — and a card that read identically at both tiers would be the
    // v6.6.13 defect exactly: a number nobody can check. It returns the same "+N <phrase>" shape
    // every other card uses, so ui.js's tCardDesc strips the number and translates the phrase with
    // no special case, and fr.js needs the two phrases and nothing else.
    prism:     { name: 'Beam Prism', desc: PRISM_DESC, icon: '🔺',
                 kind: 'prism', maxPicks: 1, values: { rare: 2, epic: 2, legendary: 3, mythic: 4 },
                 descFor: (n) => `+${n} ${n > 2 ? PRISM_DESC_DEEP : PRISM_DESC}` },
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
    barbed:    { name: 'Barbed Lash', desc: 'inflicts bleeding for 3s on enemies hit', icon: '🩸', base: 0.50, kind: 'pct' },
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
  // fire site. hive and necroticTips are behavioral (volley fire site / needle hit site).
  stinger: {
    sharper:     { name: 'Sharper Tips', desc: 'needle damage',        icon: '🗡️', base: 0.25, kind: 'pct' },
    volley:      { name: 'Wider Volley', desc: 'needles per volley',   icon: '🎯', base: 2,    kind: 'flat' },
    longNeedles: { name: 'Long Needles', desc: 'needle range & speed', icon: '📏', base: 0.30, kind: 'pct' },
    rapid:       { name: 'Rapid Fire',   desc: 'volley rate',          icon: '🚀', base: 0.25, kind: 'pct' },
    piercingNeedles: { name: 'Barbed Needles', desc: 'needle pierce', icon: '🪝', base: 1, kind: 'flat', maxPicks: PIERCE_MAX_PICKS },
    hive:        { name: 'Hive Mind',    desc: 'every 4th volley fires all around', icon: '🐝', kind: 'switch' },
    necroticTips:{ name: 'Necrotic Tips', desc: 'needles leave a bleeding wound', icon: '☠️', kind: 'switch' },
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
  // deepBite folds into gnash's levels[] via WEAPON_STAT_MODS; bloodInTheWater, deathRoll,
  // bloodrush and gorge are behavioral (see biteGnash, stepPlayerMovement and dealDamage).
  //
  // GNASH CARRIES NO WIDTH AND NO RATE MOD, and both were removed rather than never written (owner,
  // 2026-08-18: "mods for this level are not relevant enough ... every bite mod is useless").
  // A bite arc and a bite cadence are the two most generic numbers a melee weapon has — the rake
  // already sells both — and in the one chapter where the crowd RUNS, neither answers the question
  // the player is actually asking, which is "how do I get to it and what do I get for landing one".
  // bloodrush and gorge are those two questions as cards.
  //
  // THERE IS NO REACH MOD, and it is the one card a reader will expect to find here. Gnash's damage
  // is a linear falloff over its OWN range (GNASH_MAW_MUL at the jaw, x1 at the tip), so a mod that
  // lengthened the sweep would stretch the ramp over the new distance and make every bite outside
  // the old reach weaker than the card that bought it. Long Claws works on the rake because the
  // rake's damage does not know where in the arc it landed.
  gnash: {
    deepBite:        { name: 'Deep Bite',  desc: 'bite damage', icon: '🦷', base: 0.35, kind: 'pct' },
    // THE MOMENTUM CARD. Stacking is what makes it a mechanic instead of a flat bonus with a
    // duration painted on: gnash fires 1.5-2.4 times a second, so a non-stacking 2s window would be
    // refreshed long before it ever lapsed and the card would just read "+5% move speed". Stacked,
    // a chain of bites builds you up to RUSH_MAX_STACKS and losing the shoal costs it straight back.
    bloodrush:       { name: 'Bloodrush',  desc: 'move speed per bite for 2s, stacking 5 times', icon: '🏊', base: 0.05, kind: 'pct' },
    // THE ELITE PAYOFF. A switch rather than a tiered refill because a fraction of a bar is the one
    // shape this must not have: Bloodlust drives your damage AND buys the Lunge, so "an elite pays
    // 40% of a bar" is a number nobody can feel, while "an elite pays for everything" is a reason to
    // go and pick a fight you were avoiding. Normal rarity, because makeWeaponModCard returns null
    // for a switch above normal — see the note on trashTornado.sweepLoot for the epic idiom.
    gorge:           { name: 'Gorge',      desc: 'eating an elite fills Bloodlust', icon: '🫀', kind: 'switch' },
    bloodInTheWater: { name: 'Blood in the Water', desc: 'bite damage against wounded prey', icon: '🩸', base: 0.55, kind: 'pct' },
    // `secs`, not `tier`: a tier mod banks an integer COUNT of things-per-cast, and this banks a
    // DURATION. That kind exists precisely so the raw product does not reach the player as
    // 1.4000000000000001. The desc names PREY rather than saying "holds for {n}s" — in the one
    // chapter where the player is the fast thing, an unqualified hold reads as a buff on you.
    deathRoll:       { name: 'Death Roll', desc: 'holds bitten prey for {n}s', icon: '🌀', base: 0.35, kind: 'secs' },
  },
  // chum's three. widerChum/longerChum fold into levels[] via WEAPON_STAT_MODS; deepChum is
  // behavioral (it is read where the bait's pull is applied, in stepPrey).
  chum: {
    widerChum:  { name: 'Wide Slick',  desc: 'chum spread',              icon: '🌊', base: 0.30, kind: 'pct' },
    longerChum: { name: 'Ripe Catch',  desc: 'how long chum lasts',      icon: '🐟', base: 0.35, kind: 'pct' },
    // The one that changes what the card DOES rather than how much of it there is: a baited fish
    // that keeps its nerve closer in. Priced against CHUM_PANIC_R, so at full stacks the ball still
    // breaks — an unbreakable one would be a pause button on the chapter.
    deepChum:   { name: 'Deep Chum',   desc: 'baited fish hold their nerve closer to you', icon: '🩸', base: 0.30, kind: 'pct' },
  },
  // thickOil/wideBilge fold into levels[] via WEAPON_STAT_MODS; slickTrail is behavioral.
  bilge: {
    wideBilge:  { name: 'Split Seam',  desc: 'oil spread',               icon: '🛢️', base: 0.30, kind: 'pct' },
    thickOil:   { name: 'Thick Oil',   desc: 'how long the oil lasts',   icon: '⏳', base: 0.35, kind: 'pct' },
    // Turns the wall into a fence you can DRAW. Without it a bilge is one circle at a time and the
    // player is placing dots; with it they are cutting the water into rooms, which is the play the
    // card exists for.
    slickTrail: { name: 'Trailing Slick', desc: 'the oil pours behind you as you swim', icon: '〰️', kind: 'switch' },
    // A PEN, NOT A CAGE (owner: "mazout rings that traps groups of enemies"). RING_N pools on a
    // circle around the target instead of one pool on it — prey will not cross oil, so a shoal
    // caught inside stays there. The gaps between pools are deliberately crossable: an airtight
    // ring would be a hard lock on the chapter's own crowd, and this card is for gathering a
    // mouthful, not for switching the level off. Mutually exclusive with slickTrail by shape — a
    // fence drawn behind you and a ring thrown around a fish cannot both be where the oil went, so
    // slickTrail wins and the ring stands down (see stepBilgeWeapon).
    oilRing:    { name: 'Oil Ring',       desc: 'the oil lands as a ring, penning what is inside', icon: '⭕', kind: 'switch' },
  },
  clawRake: {
    rend:        { name: 'Rending Claws', desc: 'claw damage', icon: '🩸', base: 0.35, kind: 'pct' },
    wideRake:    { name: 'Wide Rake',     desc: 'claw sweep width', icon: '🪭', base: 0.30, kind: 'pct' },
    longClaws:   { name: 'Long Claws',    desc: 'claw reach',  icon: '📏', base: 0.30, kind: 'pct' },
    quickPaws:   { name: 'Quick Paws',    desc: 'rake rate',   icon: '💨', base: 0.25, kind: 'pct' },
    doubleSlash: { name: 'Double Slash',  desc: 'every 3rd rake slashes twice',        icon: '🐈', kind: 'switch' },
    bleedClaws:  { name: 'Bleeding Claws', desc: 'inflicts bleeding for 3s on raked foes', icon: '🩹', base: 0.50, kind: 'pct' },
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
    reboundQuills:  { name: 'Rebound Quills', desc: 'quills make {n} round trip(s)', icon: '↩️', kind: 'tier', maxPicks: REBOUND_MAX_PICKS },
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
    echoShriek:   { name: 'Echo Shriek',  desc: '{n} echo(es) of the first shriek',      icon: '🔁', kind: 'tier' },
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
  // heavyTrash/wideHunt/fastWinds/moreTrash fold into trashTornado's levels[] via WEAPON_STAT_MODS.
  // sweepLoot is behavioral (see stepTornadoWeapon in sim.js).
  // v6.8: the two cards that tuned the ORBIT are gone with the orbit's primacy — orbit radius
  // (wideTornado) and spin speed (fasterSpin) now describe what the funnels do while idle, which
  // is not a thing worth a level-up. They are replaced one for one by the two numbers that decide
  // how the weapon actually kills: how far it hunts, and how fast it gets there.
  trashTornado: {
    heavyTrash:  { name: 'Heavy Trash',   desc: 'tornado damage',   icon: '🔨', base: 0.25, kind: 'pct' },
    wideHunt:    { name: 'Wide Hunt',     desc: 'attack radius',  icon: '🧭', base: 0.25, kind: 'pct' },
    fastWinds:   { name: 'Fast Winds',    desc: 'travel speed',    icon: '💨', base: 0.25, kind: 'pct' },
    moreTrash:   { name: 'More Tornadoes', desc: 'tornadoes',      icon: '🌪️', base: 1,    kind: 'flat' },
    // v6.9 (owner): the tornado used to pull ENEMIES inward. It now sweeps up LOOT instead — the
    // same job wave.undertow (Chemotaxis) does one chapter over, marking gems and coins `_vac` so
    // stepPickups reels them in past magnet range. A funnel that hunts across the street and drags
    // the drops home is a better fit than one that hands the player a pile of foes at point blank.
    //
    // On/off, epic only, one pick. `values` (the Beam Prism idiom) rather than kind:'switch',
    // because makeWeaponModCard refuses a switch above normal rarity and this one is meant to BE
    // an epic. maxPicks 1: a second pick would have nothing to add.
    sweepLoot: {
      name: 'Street Sweeper', icon: '🧲', kind: 'flat', maxPicks: 1, values: { epic: 1 },
      desc: 'tornadoes reel in gems and coins',
      descFor: () => 'tornadoes reel in gems and coins',
    },
  },
  // pressure/longHose/moreStreams/deepMain fold into burstHydrant's levels[] via WEAPON_STAT_MODS;
  // rapidHydrant (cast rate) is read at the cast site. launch/trafficMain are behavioral (see
  // stepZones/stepHydrantWeapon in sim.js).
  // v6.10: rebuilt around the turret. The old set described a one-shot radial pop — "eruption
  // radius", "geysers per cast", "follow-up geyser(s) per eruption" — and half of it stopped
  // describing what the weapon does once the hydrant started aiming at things.
  //
  // Two dropped, and both were measured or reasoned out rather than trimmed for space:
  //   moreGeysers  planting MORE marks on the same crowd was the worst line in the whole census
  //                (avg 1.48 foes caught per zone against 2.16 without it) — the extra hydrants
  //                landed on foes the first one had already killed. "More streams" is the same
  //                fantasy pointed somewhere that isn't already dead.
  //   chainHydrant  scattering weak follow-ups at random offsets was coherent when placement was
  //                random anyway. Against a turret that picks its targets, random extra turrets is
  //                noise, and it was the only 'tier' mod on the weapon.
  burstHydrant: {
    pressure:    { name: 'High Pressure', desc: 'stream damage', icon: '💥', base: 0.30, kind: 'pct' },
    longHose:    { name: 'Long Hose',     desc: 'hydrant reach', icon: '📏', base: 0.30, kind: 'pct' },
    rapidHydrant: { name: 'Burst Main',    desc: 'cast rate',     icon: '⏩', base: 0.25, kind: 'pct' },
    // The flagship turret mod: one more foe hosed at once. Reads instantly on screen because the
    // streams ARE the damage now — an extra pick is an extra visible jet.
    moreStreams: { name: 'Split Nozzle',  desc: 'foes hosed at once', icon: '🚿', base: 1, kind: 'flat' },
    deepMain:    { name: 'Deep Main',     desc: 'how long a hydrant runs', icon: '⏳', base: 0.30, kind: 'pct' },
    launch:      { name: 'Cap Blast',     desc: 'stuns nearby foes when the hydrant blows', icon: '🚀', base: 1, kind: 'flat' },
    // v6.3: without the placement bias this mod's uptime is ~15-25% and uninfluencable — a trap
    // pick. The bias (stepHydrantWeapon's cast: prefer a lane-covered enemy) is the point.
    trafficMain: { name: 'Traffic Main',  desc: 'hydrants in a live lane hit far harder — and seek the street', icon: '🚦', base: 0.40, kind: 'pct' },
  },
  // ---- Skies natives (v5.4) ----
  // bellow/wideRoar/farRoar fold into roar's levels[] via WEAPON_STAT_MODS; rapidRoar (attack
  // rate) is read at the fire site. stagger/resonance are behavioral (see stepRoarWeapon).
  roar: {
    bellow:    { name: 'Bellow',      desc: 'roar damage', icon: '📢', base: 0.30, kind: 'pct' },
    wideRoar:  { name: 'Wide Roar',   desc: 'roar cone width', icon: '🪭', base: 0.30, kind: 'pct' },
    // balance_decision : roar range per pick cut 40%, it reached three screens v7.22
    //  - stacked picks bought 1323px against a phone's ~420px view radius; now ~905px.
    farRoar:   { name: 'Carrying Roar', desc: 'roar range', icon: '📏', base: 0.18, kind: 'pct' },
    rapidRoar: { name: 'Short Breath', desc: 'roar rate',   icon: '💨', base: 0.25, kind: 'pct' },
    // kind 'secs': not one of the four kinds makeWeaponModCard branches on, so it takes the default
    // `base × rarityMult` and renders {n} as a plain number — the same route pivot/trade/jackpot
    // already take. The name is documentation, and it is what lets the card say "0.4s" instead of
    // the "+50%" that named no unit and no subject.
    stagger:   { name: 'Stagger',     desc: 'stuns roared foes for {n}s',       icon: '💫', base: STAGGER_STUN_PER_PICK, kind: 'secs' },
    resonance: { name: 'Resonance',   desc: 'every 3rd roar goes all around',   icon: '🌀', kind: 'switch' },
  },
  // heavyTail/longTail fold into tailLash's levels[] via WEAPON_STAT_MODS; doubleHook adds to
  // `hooks` at the fire site (WEAPON_COUNT_MODS/WEAPON_COUNT_KEYS); quickTail
  // (attack rate) is read at the fire site. wreckingBall/counterLash are behavioral (see
  // stepLashWeapon and the counter hook in hurtPlayer).
  // v7.23: heavyTail/longTail/quickTail keep their ids AND their names — damage, reach and rate
  // are axes both the old sector and the new line have, so there is nothing to rename, no clash
  // with flagella's Heavy Lash/Long Reach, and their French entries carry over untouched.
  // broadSweep is gone: "sweep width" is meaningless on a thin line. wreckingBall is wreckingTail
  // with its defect fixed — the old card dealt its collateral inside an invisible 60px disc after
  // a 37px nudge (knockback/KB_DECAY_RATE), which is why the owner reported it as not working: it
  // FIRED correctly (A/B census, 5 stacks = +18% eff dps) but nothing visibly moved or died. Now
  // the damage is dealt along a 340-460px drag you watch happen.
  tailLash: {
    heavyTail:    { name: 'Heavy Tail',    desc: 'lash damage', icon: '🔨', base: 0.30, kind: 'pct' },
    longTail:     { name: 'Long Tail',     desc: 'lash reach',  icon: '📏', base: 0.30, kind: 'pct' },
    quickTail:    { name: 'Quick Tail',    desc: 'lash rate',   icon: '💨', base: 0.25, kind: 'pct' },
    doubleHook:   { name: 'Double Hook',   desc: 'aircraft dragged down per lash', icon: '🪝', base: 1, kind: 'flat' },
    wreckingBall: { name: 'Wrecking Ball', desc: 'damage dealt by a dragged aircraft', icon: '🎳', base: 0.40, kind: 'pct' },
    counterLash:  { name: 'Counter Lash',  desc: 'getting hit triggers a free lash',  icon: '💢', kind: 'switch' },
  },
  // overcharge/arcReach/heldBreath fold into atomicBreath's levels[] via WEAPON_STAT_MODS;
  // quickBreath (cast rate) is read at the cast site and `forked` (+jumps) at the fork site.
  // fallout is behavioral (see stepArcs in sim.js).
  atomicBreath: {
    overcharge:  { name: 'Overcharge',    desc: 'breath damage',   icon: '🔨', base: 0.30, kind: 'pct' },
    forked:      { name: 'Forked Breath', desc: 'extra fork(s) per breath', icon: '⚡', base: 1, kind: 'flat' },
    arcReach:    { name: 'Arc Reach',     desc: 'fork distance',   icon: '📏', base: 0.25, kind: 'pct' },
    heldBreath:  { name: 'Held Breath',   desc: 'breath duration', icon: '⌛', base: 0.25, kind: 'pct' },
    quickBreath: { name: 'Quick Breath',  desc: 'breath rate',     icon: '⏩', base: 0.25, kind: 'pct' },
    // fallout reuses applyIgnite verbatim — the same idiom flagella.barbed uses for bleed. An
    // atomic breath that sets what it touches burning needs no new DoT system.
    fallout:     { name: 'Fallout',       desc: 'sets everything the breath touches burning', icon: '☣️', base: 0.50, kind: 'pct' },
  },
  // heavyDebris/bigImpact/moreDebris fold into debrisToss' levels[] via WEAPON_STAT_MODS; longToss
  // (castRange) and rapidToss (cast rate) are read at the throw site. shrapnel is behavioral
  // (see stepLobs in sim.js).
  debrisToss: {
    heavyDebris: { name: 'Heavy Debris', desc: 'impact damage', icon: '🔨', base: 0.30, kind: 'pct' },
    bigImpact:   { name: 'Big Impact',   desc: 'impact radius',  icon: '💥', base: 0.30, kind: 'pct' },
    longToss:    { name: 'Long Toss',    desc: 'throw range',   icon: '📏', base: 0.30, kind: 'pct' },
    rapidToss:   { name: 'Quick Hands',  desc: 'throw rate',    icon: '⏩', base: 0.25, kind: 'pct' },
    moreDebris:  { name: 'Both Hands',   desc: 'chunks per throw', icon: '🪨', base: 1,  kind: 'flat' },
    shrapnel:    { name: 'Shrapnel',     desc: 'splinter(s) scattered by each impact', icon: '🎆', kind: 'tier' },
  },
  // ---- Beyond natives (v5.4; the Mini Black Hole rides the existing WEAPON_MODS.hole set) ----
  // keenShard/moreShards/pierceShard fold into realityShard's levels[] via WEAPON_STAT_MODS;
  // rapidShard (fire rate) is read at the fire site. tornSeam/recursion are behavioral (see
  // stepShardWeapon / the shard branch of stepBullets).
  realityShard: {
    keenShard:   { name: 'Keen Shards',  desc: 'shard damage',     icon: '🗡️', base: 0.25, kind: 'pct' },
    moreShards:  { name: 'Splintering',  desc: 'shards per volley', icon: '🔺', base: 1,    kind: 'flat' },
    pierceShard: { name: 'Phase Edge',   desc: 'shard pierce',     icon: '🎯', base: 1,    kind: 'flat', maxPicks: PIERCE_MAX_PICKS },
    rapidShard:  { name: 'Quick Draw',   desc: 'volley rate',      icon: '⏩', base: 0.25, kind: 'pct' },
    tornSeam:    { name: 'Torn Seam',    desc: 'the skipped gap tears open for {n} damage', icon: '🌀', base: 0.50, kind: 'pct' },
    recursion:   { name: 'Recursion',    desc: 'shard(s) forked when one burns out',    icon: '♾️', kind: 'tier' },
  },
  // wideSweep/sustainSweep fold into pulsarSweep's levels[] via WEAPON_STAT_MODS; rapidSweep (cast
  // rate) is read at the cast site. hyperSweep/collapse are behavioral (see stepPulsarWeapon /
  // the swept branch of stepBeams).
  // v6.7.6: Long Fold merged into Wide Sweep (both were named "... Fold" until this weapon stopped
  // being the Tesseract Beam), for the reason spelled out on rainbow.wideBeam above — this weapon
  // carried the identical redundant trio, and leaving it would fix the complaint in one chapter and
  // leave it standing in another. The prism does NOT follow: the Pulsar's identity is the opposed
  // pair and its collapse, and a second splitting mechanic on a weapon whose arms already rake the
  // full circle adds noise rather than a decision.
  pulsarSweep: {
    wideSweep:    { name: 'Wide Sweep',   desc: 'beam width & length', icon: '📡', base: 0.20, kind: 'pct' },
    sustainSweep: { name: 'Held Sweep',   desc: 'beam duration', icon: '⌛', base: 0.20, kind: 'pct' },
    rapidSweep:   { name: 'Quick Sweep',  desc: 'cast rate',     icon: '⏩', base: 0.25, kind: 'pct' },
    hyperSweep:   { name: 'More Arms',    desc: 'extra arm(s) per cast',             icon: '🔷', kind: 'tier' },
    collapse:    { name: 'Collapse',     desc: 'damage when the sweep ends',       icon: '🌋', base: 0.80, kind: 'pct' },
  },
  // ---- The Surf natives ----
  // FOUR mods each, and no fifth. The Undertow design budgets ~4 per weapon and says outright to
  // cut a weapon rather than invent mods: 137 mods ship today and each weapon's count tracks its
  // number of independently tunable stats almost exactly. This chapter now carries three natives
  // where it carried one, so it is the heaviest mod load in Book 2 and the place that budget will
  // break first if any of these grows a fifth.
  //
  // Every rate mod here is registered in WEAPON_RATE_MODS below and divides the interval at its
  // fire site. Folding a rate pick into `interval` through WEAPON_STAT_MODS would SLOW the weapon —
  // the trap that map exists to route around.
  breaker: {
    swell:      { name: 'Swell',       desc: 'wave damage',        icon: '💥', base: 0.30, kind: 'pct' },
    longshore:  { name: 'Longshore',   desc: 'how far the wave rolls', icon: '📏', base: 0.25, kind: 'pct' },
    broadCrest: { name: 'Broad Crest', desc: 'wave width',         icon: '🪭', base: 0.28, kind: 'pct' },
    // NOT a percentage on `carry`, because a player cannot read a 30% change to an acceleration.
    // A switch that sends the wave the other way as well is the same want — more of the crowd
    // moved — expressed as something you can see happen. Read at the cast site (stepBreakerWeapon).
    backwash:   { name: 'Backwash',    desc: 'a second wave rolls out behind you', icon: '🌊', kind: 'switch' },
    // The 5th, above the ~4 this block argues for (owner, 2026-08-19: "add a 5th to each"). Cadence
    // rather than shove or carry: `carry` is an acceleration and a percentage of one is unreadable
    // (see the 37px nudge the Fever Shove block describes), and a KNOCKBACK mod here would walk this
    // weapon toward the shove lock the CC_DR_FLOOR block measures.
    // balance_decision : the breaker buys cadence, never shove 2026-08-19
    //  - checked against that block's own model first: at kb 190 on a 1.17s interval the breaker
    //    clears the lock by x1.88 even at 5 picks with Twitchy 10 AND Soy Milk, where the Bubble
    //    Puff (kb 300, 0.609s) is LOCKED in that same build. The interval is the whole margin.
    quickBreak: { name: 'Quick Break', desc: 'wave rate',          icon: '⏩', base: 0.25, kind: 'pct' },
  },
  // The Shelf's starter. WIDTH IS THE POINT OF THIS SET: the weapon gives up the full circle it
  // used to have and Flare is how a player buys it back, so the two cards below are the whole
  // reason the cone is 90 degrees rather than 360. Flare compounds and stepBubblePuffWeapon caps
  // the result at a full turn, so a build that stacks it does end up back at a ring — deliberately,
  // as the top of that ladder rather than as a separate card.
  //
  // ⚠ THIS WEAPON MAY NOT SELL CADENCE OR SHOVE, and that is a measurement rather than a taste.
  // It no longer HAS a shove (see the ladder in WEAPONS.bubblePuff), so a knockback mod would be
  // re-introducing the stat the owner deleted; and cadence stays out because the same set of mods
  // that made standing still optimal is still on the card. That earlier fence was written against
  // the CC_DR_FLOOR block's per-body model -- a floored shove moves a body kb x ccResist x
  // CC_DR_FLOOR / KB_DECAY_RATE px, and the lock holds once the cast interval drops under the time
  // that body needs to walk it back -- and the model was RIGHT about one body and blind to the
  // crowd: it waived `r` and `arc` as safe, and those two together are what the report was about.
  // balance_decision : the puff sells radius and damage, never rate or shove 2026-08-19
  //  - `r` and `arc` are only cheap now because the shove is gone. Measured (mortal, 300s, 7 seeds,
  //    The Shelf): Flare x5 alone and Long Puff x5 alone each leave WALKING ahead of standing still;
  //    together, with a shove, standing still won 29% of runs and walking won 0%.
  bubblePuff: {
    froth:      { name: 'Froth',       desc: 'puff damage',        icon: '💥', base: 0.30, kind: 'pct' },
    flare:      { name: 'Flare',       desc: 'puff width',         icon: '🪭', base: 0.30, kind: 'pct' },
    longPuff:   { name: 'Long Puff',   desc: 'puff radius',        icon: '📏', base: 0.25, kind: 'pct' },
    // The chapter's bar, sold as a card. Read at the cast site off pollutionFrac, so it is worth
    // nothing in clean water and everything in the filth -- which makes it the one card that pays
    // you for NOT running to a clean patch, against a bar whose every other consumer pays you for
    // going. No knockback and no cadence, so it is outside the fence above.
    //
    // ⚠ THE COPY MUST NAME THE BAR. It first shipped as "up to {n} in the filthiest water", which
    // states the fiction and never connects it to the rail -- owner, from reading the card: "as a
    // player, i don't understand how this mechanic works by reading this. I am the one that gets
    // polluted, is it related to my pollution bar?" It is, and the card now says so. The register is
    // the Sunlance's ('It reaches as far as your Light does.'), which is the shipped precedent for a
    // card that reads a bar: name it, possessively, and let the rail do the rest.
    scour:      { name: 'Scour',       desc: 'puff damage, rising with your Pollution (up to {n})', icon: '🪣', base: 0.50, kind: 'pct' },
    // The Breaker's Backwash idiom, and safe here for the reason the block above gives: a body in
    // the rear cone is still shoved once per cast, so coverage doubles and the per-body race does
    // not move. Read at the cast site (stepBubblePuffWeapon).
    backblow:   { name: 'Backblow',    desc: 'a second cone blows out behind you', icon: '🌬️', kind: 'switch' },
  },
  skippingShell: {
    skimmer:    { name: 'Skimmer',     desc: 'shell damage',       icon: '💥', base: 0.30, kind: 'pct' },
    flatStone:  { name: 'Flat Stone',  desc: 'extra skip(s) per throw', icon: '🥏', kind: 'tier' },
    wideSplash: { name: 'Wide Splash', desc: 'splash radius',      icon: '💦', base: 0.28, kind: 'pct' },
    fastSkim:   { name: 'Fast Skim',   desc: 'throw rate',         icon: '⏩', base: 0.25, kind: 'pct' },
    // The 5th (owner, 2026-08-19). `speed` is the shell's last free stat and it has no STAT_KEYS
    // row, so it shows in the picked-mods list rather than as a sheet row -- the `streams`
    // treatment, and deliberate: `speed` is a key on a dozen weapons' levels[], and giving it a row
    // would push a row off the bottom of five other build sheets. A faster shell reaches its target
    // sooner and strides further between touch-downs; stepShellSkip fires on ARRIVAL as well as on
    // the timer, so the longer stride does not cost it the chase.
    sidearm:    { name: 'Sidearm',     desc: 'shell travel speed', icon: '💨', base: 0.22, kind: 'pct' },
  },
  barnacles: {
    // 'crust damage' and not 'barnacle damage': the number is per TICK, and naming the thing rather
    // than the event is what keeps a player from reading it as a hit. The same wording is on the
    // build-sheet row (STAT_LABEL in ui.js) so the card and the sheet cannot drift.
    grinder:    { name: 'Grinder',     desc: 'crust damage per tick', icon: '💥', base: 0.30, kind: 'pct' },
    encrust:    { name: 'Encrust',     desc: 'how long a crust lasts', icon: '⌛', base: 0.25, kind: 'pct' },
    spawnfall:  { name: 'Spawnfall',   desc: 'extra larva(e) per cast', icon: '🔷', kind: 'tier' },
    // The card that turns the weapon on. jumps 1 -> 2 is the difference between "it moved once" and
    // "the pack ate itself", so it is a tier pick (a flat count, rarity-scaled) rather than a
    // percentage of a number that is 1. Read at the jump site (stepBarnacles).
    seedbed:    { name: 'Seedbed',     desc: 'extra jump(s) when a crusted body dies', icon: '🦪', kind: 'tier' },
    // The 5th (owner, 2026-08-19). `castRange` is the larva's whole life -- stepBarnacleWeapon flies
    // it for castRange/speed seconds -- so this is reach, and it is the stat that decides whether
    // the fan finds a body at all. Broadcast spawning is what a barnacle actually does.
    broadcast:  { name: 'Broadcast',   desc: 'how far larvae are cast', icon: '📏', base: 0.25, kind: 'pct' },
  },
  // The Shelf's other two, which shipped with NO mods at all -- the chapter could offer exactly two
  // distinct mod cards in a whole run, and its mod bucket measured 20.4% against a declared 27.9%
  // (pool-probe, shelf, 3 slots, 25 runs), the worst drift of any bucket in either Book 2 chapter.
  // Neither weapon carries a knockback stat -- nor, since 2026-08-19, does the Bubble Puff -- so
  // nothing in this chapter's arsenal can shove at all, and all three may sell counts freely.
  siltVeil: {
    // 'silt damage per tick' for the reason barnacles says 'crust damage per tick': the number is
    // small because it is per tick, and a player reading it as a per-hit number concludes the weapon
    // is broken. Name the thing, not the event.
    grit:       { name: 'Grit',        desc: 'silt damage per tick', icon: '💥', base: 0.30, kind: 'pct' },
    billow:     { name: 'Billow',      desc: 'cloud radius',        icon: '💨', base: 0.28, kind: 'pct' },
    // A flat count, and the cast site's ONE local is both its loop bound and the divisor that rings
    // the clouds -- the eight-site trap CLAUDE.md documents, where multiplying only the bound spawns
    // the extras on top of each other and renders identically to no change at all.
    roil:       { name: 'Roil',        desc: 'extra cloud(s) per cast', icon: '🔷', kind: 'tier' },
    // THE CARD THAT COSTS YOU SOMETHING (owner's pick, 2026-08-19). A cloud dropped inside a live
    // clean-water patch is bigger, hangs longer and bites harder, and SPENDS that patch -- the
    // chapter's own drawdown, set by writing the `drawdown` field stepCharge already counts and
    // render.js already fades the circle off, so the tell is the one the player has been reading
    // since the chapter shipped. It is the only card in the book that asks you to burn your refill.
    //
    // ⚠ THE COPY MUST NOT SAY 'upwelling'. The first cut did, and that word appears NOWHERE else the
    // player can see it -- not the HUD, not the brief, not fr.js outside this line. A card is the
    // wrong place to introduce a proper noun for a mechanic that has never been named. It says
    // 'clean water' and 'the patch', which is what the player is actually looking at.
    // ONE multiplier for all three numbers, and the card says all three (owner's wording,
    // 2026-08-19). It scaled only size and duration when it first shipped, which made the card and
    // the code two different promises.
    foulSpring: { name: 'Foul Spring', desc: 'a cloud in clean water has {n} more duration, damage and size, but fouls the patch', icon: '🌀', base: 0.50, kind: 'pct' },
  },
  ballast: {
    deadweight: { name: 'Deadweight',  desc: 'impact damage',       icon: '💥', base: 0.30, kind: 'pct' },
    // Registered in WEAPON_RATE_MODS and divided at the fire site: folding a rate pick into `rate`
    // would SLOW the weapon, which is the trap that table exists to route around.
    quickWinch: { name: 'Quick Winch', desc: 'drop rate',           icon: '⏩', base: 0.25, kind: 'pct' },
    jetsam:     { name: 'Jetsam',      desc: 'extra weight(s) per drop', icon: '🔷', kind: 'tier' },
    // The pollution card (owner, 2026-08-19: "the more pollution you have the bigger / the more
    // damaging is the stain"). BOTH numbers, which is why the name says the stain rather than one of
    // its stats -- the Big Beam idiom. The stain's radius stops being tied to the crater's here: the
    // filth spreads further than the splash, which is the whole picture of the card.
    // Same wording rule as Scour above, for the same reason and from the same reading: the card
    // names the bar it reads.
    foulWater:  { name: 'Foul Water',  desc: 'stain size and damage, rising with your Pollution (up to {n})', icon: '🛢️', base: 0.50, kind: 'pct' },
  },
  // Four apiece for the Trawl's natives, and four is the CEILING, not a starting point (spec §7:
  // the pool's real mod budget is ~28, and the rule is to cut a weapon rather than invent mods).
  // Each of these buys exactly one stat the weapon already has — there is no behavioural mod here
  // because neither weapon has a second behaviour to switch on, and inventing one to fill a slot is
  // what dilutes the pool.
  longline: {
    // 'hook damage per tick' for the same reason barnacles says 'crust damage per tick' above: the
    // number is small because it is per tick, and a player reading it as a per-hit number concludes
    // the weapon is broken. Name the thing, not the event.
    barbed:   { name: 'Barbed Hooks', desc: 'hook damage per tick', icon: '🪝', base: 0.30, kind: 'pct' },
    longSet:  { name: 'Long Set',     desc: 'line length', icon: '📏', base: 0.25, kind: 'pct' },
    deepSet:  { name: 'Deep Set',     desc: 'how long a set line lasts', icon: '⌛', base: 0.25, kind: 'pct' },
    // A flat count, not a percentage: +30% of one line is one line. The second rope also doubles
    // the CATCHES available, since the snag is once per body per line — so this is the control mod
    // as much as the damage one, which is why it is the tier pick.
    twinSet:  { name: 'Twin Set',     desc: 'extra line(s) per cast', icon: '🔷', kind: 'tier' },
  },
  netToss: {
    wideNet:   { name: 'Wide Net',   desc: 'net radius', icon: '⭕', base: 0.25, kind: 'pct' },
    heavyMesh: { name: 'Heavy Mesh', desc: 'how long the hold lasts', icon: '⏳', base: 0.25, kind: 'pct' },
    weighted:  { name: 'Weighted',   desc: 'impact damage', icon: '💥', base: 0.30, kind: 'pct' },
    doubleHaul:{ name: 'Double Haul', desc: 'extra net(s) per cast', icon: '🔷', kind: 'tier' },
  },
  // Four apiece for The Twilight's three natives, the same ceiling the two blocks above hold to. Each
  // buys one stat the weapon already has; none of them buys the BAR. That is the line this chapter
  // has to keep — a mod that widened the dark's bonus or raised the lance's floor would be selling
  // the chapter's own resource back to the player as a card, and the resource has to stay the thing
  // you steer with your feet.
  sunspear: {
    highNoon:  { name: 'High Noon',  desc: 'column damage', icon: '💥', base: 0.30, kind: 'pct' },
    broadBeam: { name: 'Broad Beam', desc: 'column radius', icon: '⭕', base: 0.28, kind: 'pct' },
    zenith:    { name: 'Zenith',     desc: 'how far a column can be called', icon: '📏', base: 0.25, kind: 'pct' },
    // A flat count, not a percentage: +30% of one column is one column. It folds through
    // WEAPON_STAT_MODS as 'flat' because `count` is a real key in levels[] — which also means
    // sunspearSpots reads the MODIFIED count and the padding ring divides by that same number.
    secondSun: { name: 'Second Sun', desc: 'extra column(s) per cast', icon: '🔷', kind: 'tier' },
  },
  foxfire: {
    // 'foxfire damage per tick', for the reason barnacles and longline both spell out above: the
    // number is small because it is per tick, and a player reading it as a per-hit number concludes
    // the card is broken.
    emberfeed:  { name: 'Emberfeed',   desc: 'foxfire damage per tick', icon: '💥', base: 0.30, kind: 'pct' },
    gloaming:   { name: 'Gloaming',    desc: 'foxfire radius', icon: '⭕', base: 0.28, kind: 'pct' },
    // NOT 'Slow Burn': that display name is already taken, and the French dictionary is keyed by the
    // ENGLISH SOURCE STRING — so a second mod called 'Slow Burn' would silently inherit the other
    // one's translation ('Économe', i.e. thrifty), which is not what this buys. A duplicate display
    // name is also just confusing on its own. Check the name against fr.js before adding a mod.
    longBurn:   { name: 'Long Burn',   desc: 'how long a foxfire burns', icon: '⌛', base: 0.25, kind: 'pct' },
    quickKindle:{ name: 'Quick Kindle', desc: 'cast rate', icon: '⏩', base: 0.25, kind: 'pct' },
  },
  sunlance: {
    whetted:   { name: 'Whetted',   desc: 'lance damage per tick', icon: '💥', base: 0.30, kind: 'pct' },
    farReach:  { name: 'Far Reach', desc: 'lance length', icon: '📏', base: 0.25, kind: 'pct' },
    broadEdge: { name: 'Broad Edge', desc: 'lance width', icon: '🪭', base: 0.28, kind: 'pct' },
    heldLance: { name: 'Held Lance', desc: 'how long the lance is held', icon: '⌛', base: 0.25, kind: 'pct' },
  },
  finHit: {
    serrated:  { name: 'Serrated',   desc: 'fin damage', icon: '💥', base: 0.30, kind: 'pct' },
    broadFin:  { name: 'Broad Fin',  desc: 'how wide the sweep is', icon: '📐', base: 0.22, kind: 'pct' },
    longFin:   { name: 'Long Fin',   desc: 'sweep reach', icon: '📏', base: 0.25, kind: 'pct' },
    // The cadence mod, registered in WEAPON_RATE_MODS below rather than folded into levels[] —
    // folding an attack-rate mod into `interval` would SLOW the weapon, which is the trap that block
    // documents. Named for what a shark does, and it is the mod that compounds hardest with the
    // speed scaling: swimming fast already makes each hit bigger, so more of them is more of both.
    thrash:    { name: 'Thrash',     desc: 'sweep rate', icon: '⚡', base: 0.20, kind: 'pct' },
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
  burstHydrant: 'rapidHydrant', roar: 'rapidRoar', tailLash: 'quickTail',
  debrisToss: 'rapidToss', realityShard: 'rapidShard', pulsarSweep: 'rapidSweep',
  atomicBreath: 'quickBreath', skippingShell: 'fastSkim', finHit: 'thrash', foxfire: 'quickKindle',
  breaker: 'quickBreak', ballast: 'quickWinch',
  // chum and bilge are absent DELIBERATELY: neither carries a rate mod, and this table's own
  // header says a weapon with none simply does not appear here. Naming one that does not exist
  // would put a phantom row in the pause build sheet's cadence line.
}
// Same problem for per-cast COUNTS: nearly every one folds through WEAPON_STAT_MODS, but the star's
// multishot is read straight off run.weaponMods at its fire site. Without this the readout would
// tell a player firing four bullets that they fire one.
// v7.23: the lash's doubleHook (how many aircraft one lash drags down) and the breath's `forked`
// (+jumps) are read at their own sites too, for the same reason — folding a count into levels[]
// via WEAPON_STAT_MODS only works for keys effectiveWeaponStats already carries.
export const WEAPON_COUNT_MODS = { star: 'multishot', tailLash: 'doubleHook', atomicBreath: 'forked' }
// ...and WHICH levels[] key that mod adds to. The star's is literally `count`, which is why this
// map did not exist before; the two v7.23 weapons count different things. Missing entry = 'count'.
export const WEAPON_COUNT_KEYS = { tailLash: 'hooks', atomicBreath: 'jumps' }

// ---- The pause build sheet's stat rows -------------------------------------------------------
// ONE ordered table, because this was two: an ordered whitelist array inside buildReadout (sim.js)
// deciding WHICH stats become rows and in what order, and a separate STAT_LABEL map in ui.js
// supplying the words. A stat needed both, and missing either made it silently absent from the
// sheet — no warning, no error, just a row that is not there. Both files' comments said so in
// almost the same words, which is the tell that the two lists were one list all along.
//
// ORDER IS LOAD-BEARING. ui.js appends the cadence row and slices to STAT_MAX_ROWS (5), so where a
// key sits decides what falls off the bottom. The history is worth keeping because each entry was
// a real fight for one of five slots:
//  - jetDur after 'r': the Burst Hydrant then emits dmg, count, r, jetDur + every = exactly 5.
//  - `streams` is deliberately absent — a sixth row would push `every` off, and Split Nozzle
//    already shows in the mod list under the table, as every behavioural mod does.
//  - v7.23 jumps/duration for the Atomic Breath, placed so it emits dmg, jumps, duration + range
//    + every = 5. `duration` is shared: it also surfaces rainbow's Sustain and pulsarSweep's Held
//    Sweep, which were invisible before, and both sit at 4 rows so neither loses one.
//  - v7.26 `arcRange` carries a label but is NOT a row: the breath already has `range` (reach to
//    its first target), and a sixth row would push the cadence off. Arc Reach still appears in the
//    picked-mods list, the same treatment `streams` gets.
//  - v7.55 `knock`/`cd` for the Pincer, after 'r', so it emits dmg, r, knock, cd and stops — it
//    has no rate/interval, making it the one weapon with no cadence row, which is the point of it.
//    Both keys are unique to the Pincer's levels[] (every other knockback stat is `knockback`), so
//    no other weapon gains a row.
// `row: false` means "label only, never a row" — the entry still needs its French.
export const STAT_KEYS = [
  { key: 'dmg', label: 'Damage' },
  { key: 'count', label: 'Projectiles' },
  { key: 'hooks', label: 'Aircraft hooked' },
  { key: 'jumps', label: 'Forks' },
  { key: 'orbs', label: 'Orbs' },
  { key: 'chunks', label: 'Tornadoes' },
  { key: 'maxAlive', label: 'Max alive' },
  { key: 'radius', label: 'Radius' },
  { key: 'hunt', label: 'Hunt radius' },
  { key: 'travelSpeed', label: 'Travel speed' },
  { key: 'r', label: 'Radius' },
  // The Skipping Shell then emits dmg, r, skips + every = 4. Unique to that weapon's levels[].
  { key: 'skips', label: 'Skips' },
  // The Shelf's two zone weapons, same reasoning one line up and the same reasoning as crustDur
  // below: both are per-cast COUNTS, and the shared `count` key is labelled 'Projectiles', which is
  // the wrong noun for a cloud of silt and for a dumped weight. Each is unique to its own weapon's
  // levels[], so no other build sheet gains a row and nothing is pushed off the bottom.
  // Silt Veil then emits clouds + radius + every = 3; Ballast dmg + r + weights + every = 4.
  { key: 'clouds', label: 'Clouds' },
  { key: 'weights', label: 'Weights' },
  { key: 'jetDur', label: 'Runs for' },
  // Deliberately NOT the shared `duration` key: that one reads 'Burns for' for the beam weapons,
  // and a shell crust does not burn. Barnacles emit dmg, count, jumps, crustDur + every = 5,
  // exactly at the cap — a sixth key on that weapon would push its cadence row off the bottom.
  { key: 'crustDur', label: 'Crust lasts' },
  // Same reasoning as crustDur, twice more: `duration` below is labelled 'Burns for' and is shared
  // with the beam weapons, which is a lie about a rope in the water and about a net over a pack.
  { key: 'setDur', label: 'Line lasts' },
  // Foxfire's own duration key. Not `duration` ('Burns for') even though a foxfire literally burns:
  // that key is the beam weapons' and a Shelf run can hold a Sunlance at the same time, which would
  // put the same two words on two rows meaning two different things.
  { key: 'glowDur', label: 'Glow lasts' },
  { key: 'hold', label: 'Holds for' },
  { key: 'duration', label: 'Burns for' },
  { key: 'maxR', label: 'Radius' },
  { key: 'range', label: 'Range' },
  { key: 'length', label: 'Length' },
  { key: 'width', label: 'Width' },
  { key: 'pierce', label: 'Pierce' },
  { key: 'every', label: 'Every', row: false },      // the cadence, appended by ui after the slice
  { key: 'arcRange', label: 'Fork range', row: false },
]
// The ordered keys buildReadout walks. Derived, so adding a row can never again mean editing sim.
export const STAT_ROW_KEYS = STAT_KEYS.filter((s) => s.row !== false).map((s) => s.key)

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
// v4.4: 0.5 -> 0.4. Split and chain both multiply a star's total hits, so their per-shard/
// per-jump damage fractions compound multiplicatively when stacked together (a heavily-invested
// star hit ~9.5x its own pierce/blast baseline — the runaway that made pouring picks into star a
// no-brainer). Trimming these fractions shaves that stacked tail while barely touching a 1-pick
// dip, so star stays a strong, fun starter without spiralling past the AoE weapons.
export const STAR_SPLIT_DMG_FRAC = 0.4                    // shard damage, as a fraction of the star's own damage
export const STAR_SPLIT_BASE_ANGLE = (35 * Math.PI) / 180 // ± half-angle used for exactly 2 shards
export const STAR_SPLIT_MAX_SPREAD = (90 * Math.PI) / 180 // total fan spread once 3+ shards are out

// Chain: when a bullet's pierce is exhausted, it re-targets the nearest not-yet-hit enemy
// within range instead of dying (it simply dies if none is found or no jumps remain).
export const STAR_CHAIN_RANGE = 200       // px, re-target search radius from the last hit enemy
export const STAR_CHAIN_DMG_MUL = 0.7     // damage multiplier applied per jump (v4.4: 0.8 -> 0.7, tames stacked compounding)
export const STAR_CHAIN_EXTRA_LIFE = 0.4  // s, minimum flight time granted on a chain jump

// ---- v4.3 "crazy-mod pass" tuning (13 new behavioral mods, one set per weapon below) --------

// Supernova Sparks (orbit): splash radius around an orb-killed enemy.
export const ORBIT_NOVA_RADIUS = 85 // px

// Chemotaxis (wave.undertow): each stack widens the loot-reel burst by +50% of the nova's radius.
export const UNDERTOW_VAC_RADIUS_PER_STACK = 0.5

// Tsunami (wave): cast cadence for a "monster wave" (radius/damage both multiplied).
export const TSUNAMI_EVERY = 3 // every 3rd wave cast


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
// in sim.js): a swing damages every enemy whose BODY falls in the sector (arc rad, range px)
// centered on the player's facing — inSector, shared with clawRake/roar/tailLash.
// cyclone (behavioral): every FLAGELLA_CYCLONE_EVERY-th swing opens to a full 360° instead of
// the arc.
export const FLAGELLA_CYCLONE_EVERY = 3
// barbed (behavioral): a struck enemy bleeds a DoT whose TOTAL = the hit's dealt damage ×
// BARBED_DMG_MUL × (accumulated barbed bonus), spread over BARBED_DURATION seconds and ticked
// dot-flagged every STATUS_TICK (like ignite). Reapplying refreshes (replaces) it. One normal
// pick (bonus 0.5) bleeds ~1.5× the hit; investment/rarity ramps it toward the 3× headline.
export const BARBED_DMG_MUL = 3
// The stinger's Necrotic Tips reuses that same bleed at a fixed strength, because it is a SWITCH
// and has no accumulating bonus to scale. Priced at one Barbed Lash pick (0.50) — a needle volley
// refreshes rather than stacks, exactly like barbed, so the whole volley is worth one bleed.
export const NECROTIC_BLEED_FRAC = 0.5
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

// ---- Garden weapons (v5.3: Stinger + Pheromone Lure; Boomerang Leaf = boomerang re-theme) --------
// Stinger (garden native, needle-cone — see WEAPONS.stinger + stepStingerWeapon in sim.js): each
// needle is a run.bullets projectile tagged weapon:'stinger' so stepBullets can apply stinger-only
// behaviour without touching star's split/chain (disabled per-needle).
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
// touching star's split/chain (both disabled per-quill, exactly like stinger's needles).
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
// at FEAR_SPEED_MUL of their own speed. Ticks down every frame.
export const FEAR_SPEED_MUL = 1.25    // fleeing enemies scatter a bit faster than they chase
// v7.16 — THE MACHINE-GUN LOCK. Fear was refreshed with Math.max on every ring, so ANY cadence
// shorter than the duration pinned it at 100%, and a feared enemy could not deal contact damage at
// all. MEASURED, undergrowth d3, 150s, stationary player: Chitter Shriek alone took 11 contact hits
// with enemies touching at 36px; the same build under MACHINE GUN (x5 fire rate) took 0 hits and
// nothing came closer than 189px. A permanent, field-wide, untouchable wall.
//
// The root cause is that KNOCKBACK AND FEAR ARE PRICED AT NOTHING. Both are applied per HIT at a
// magnitude that ignores damage, so a card trading x0.2 damage for x5 rate — a fair trade for dps,
// which is what it was priced against — buys five times the crowd control for free. Pure knockback
// is not the problem (Claw Rake + MACHINE GUN still took 12 hits, enemies still reached 19px);
// fear is, because it also disarms.
//
// Two independent fixes, both owner-picked:
//   1. A REFRACTORY. Once an enemy's fear expires it cannot be feared again for this long, so
//      uptime is capped by the enemy's own timer instead of by the weapon's cadence — 1.8s of fear
//      on a 3.8s cycle is ~47%, at any fire rate. A fixed constant rather than "as long as the fear
//      lasted" so the `terror` mod (+35% duration) still buys uptime instead of extending its own
//      lockout and doing nothing.
//   2. `unshakeable` (roster flag) — see the tank entries in CHAPTERS. One per chapter, always the
//      TANK. It RESISTS crowd control; it is never immune to it (see UNSHAKEABLE_CC_MUL).
// Feared enemies now also STILL DEAL CONTACT DAMAGE (contactHarmless no longer checks fearT) — they
// run from you, but a fleeing thing pinned against the crowd behind it is still a threat.
export const FEAR_REFRACTORY = 2      // s an enemy is fear-proof after its own fear runs out

// ONLY THE `anchored` ELITE AFFIX IGNORES CROWD CONTROL OUTRIGHT. Owner ruling, 2026-08-17: "Tanks
// should not be immune to Fear, knockback and other CC, except if they have the elite modifiers
// related. The CCs should instead be harder to proc, but never impossible." This is the same ruling
// the elements redesign already applied to freeze and chill (see elNeverFreezes in sim.js, owner
// ruling 2026-08-13) — a roster tank resists by being heavy, not by being exempt.
//
// So `unshakeable` is a MULTIPLIER on every player-sourced control that lands on the tank, folded
// into ccScale so it reaches every status at once — fear duration, knockback, stun, and any control
// written after this line. A shriek turns a toad for 0.9s of its 1.8s rather than for none.
// Uptime, not just magnitude, is what this buys: fear runs its duration and then arms
// FEAR_REFRACTORY regardless, so a tank flees 0.9s out of every 2.9s (31%) against an ordinary
// enemy's 1.8 out of 3.8 (47%). Two thirds of the uptime and half the shove, and never a zero —
// which is what "harder to proc, but never impossible" asks for.
//
// Why the immunity was safe to delete: it was fix #2 of three for the v7.16 machine-gun lock, and
// the other two both outlived it. FEAR_REFRACTORY caps fear uptime by the ENEMY's timer at any fire
// rate, and v7.17's CC_DR_* pricing then solved the whole class generically, for every status
// including ones not written yet. A blanket per-roster exemption on top of those is a special case
// paying for a bug that is already fixed twice over.
export const UNSHAKEABLE_CC_MUL = 0.5   // an `unshakeable` tank takes this much of any control

// ---- GLOBAL CROWD-CONTROL PRICING (v7.17) ------------------------------------------------------
// THE CLASS OF BUG, not one instance of it: every crowd-control effect in this game is applied PER
// HIT at a magnitude that reads neither the damage of the hit nor how recently that enemy was
// already controlled. So ANY card that buys fire rate buys crowd control for free, and the effects
// stack on each other — knockback pushes the crowd out, chill means it cannot crawl back before the
// next push, fear inverts it outright. Patching one status at a time (v7.16 did fear) just moves
// the exploit to the next one.
//
// MEASURED on the reported build (undergrowth d3, 300s, kiting bot, 3 seeded runs — Quill Burst +
// Chitter Shriek + Cold x4 + MACHINE GUN). Each layer widens the ring the crowd is held at, and the
// x5 fire rate multiplies all of them at once without adding any mechanic of its own:
//   quill alone                  165.7 contact hits, crowd held at  31px
//   + shriek                     122.7 hits,                        68px
//   + cold x4                    104.3 hits,                        71px
//   + MACHINE GUN                 50.3 hits,                       112px   (4.0 hits / 162px pre-v7.16)
//
// TWO RULES, both owner-picked, applied at every player-sourced CC site:
//
//   A. DIMINISHING RETURNS, per enemy. Each application multiplies by that enemy's current
//      resistance and then spends it (x CC_DR_STEP); it recovers to full over CC_DR_RECOVER seconds
//      without CC. The FIRST hit always lands in full — a slow heavy weapon is untouched by this —
//      while the fifth inside a second lands at the floor. Fire rate stops buying control, for
//      every status including ones not written yet.
//   B. A CC MULTIPLIER on the player (p.ccMul), which cards set explicitly. MACHINE GUN takes it to
//      SOY_MILK_DMG_MUL, so its x0.2 damage pays for its x5 rate in control as well as in dps.
//      Deliberately its own stat rather than a read of p.damageMul: damage passives would otherwise
//      launder the discount away, and a card like BRITTLE (x4 damage) would INHERIT a control buff.
//
// Chapter hazards (traffic, hydrant jets, the lane's repulse) are NOT scaled — they are not bought
// with a card and cannot be stacked by fire rate. Same scoping as `unshakeable` above.
// v7.17.x, RETUNED FROM PLAY ("a bit too weak now"). The first pass was a genuine over-correction:
// it left the reported build taking MORE contact hits with MACHINE GUN (128.5) than without it
// (104.5), i.e. the card was a straight downgrade. Measured across a knob grid, same seeds — the
// NO-CARD row does not move at all across the whole grid (104.5 to 105.5), which is the useful
// finding: these constants only bite on stacked cadence, so they can be loosened without touching
// ordinary builds. 0.7/0.25 with SOY_MILK_CC_MUL 0.45 lands the card at 83.5 hits against a 104.5
// baseline — about 20% safer than not taking it, against 4.0 hits (invincible) before any of this.
export const CC_DR_STEP = 0.7       // each application is worth this much of the last
export const CC_DR_RECOVER = 2.5    // s of no control to climb back from the floor to full
export const CC_DR_FLOOR = 0.25     // never near zero: a hit should always do something REAL

// THE HOLE CC_DR LEAVES: it floors how STRONG each application is, and nothing caps how OFTEN one
// lands. A shove is a velocity that decays at KB_DECAY_RATE, so a floored one still moves a body
// `kb x ccResist x CC_DR_FLOOR / KB_DECAY_RATE` px — and once the ring interval drops below the
// time the body needs to walk that back, every shove out-runs the walk and the push compounds
// without bound. Measured on Le Large's Bubble Puff (300s, d3, x3 seeds, standing still), the
// crossover is exactly where the arithmetic puts it — 6.3px / 33 px/s = 0.189s:
//     ring every 0.35s   97.7 jelly contact hits   crowd held at  37px
//     ring every 0.20s   32.3                                    142px
//     ring every 0.175s   3.3                                    172px   <- invincible
//     no ring at all    152.0                                     12px
// Slow archetypes lose this race FIRST — the threshold is shove-px / speed, so the Moon Jelly goes
// at 0.189s while the Sand Hopper needs 0.139s and the Sea Roach 0.066s. That is why the report
// named the jellyfish. `unshakeable` does not save them: halving the shove does not outweigh being
// the slowest thing on the field.
// balance_decision : tanks may be shoved once per second, not per hit 2026-08-18
//  - the window is the ENEMY's timer, so no fire rate can shorten it. It must stay above the worst
//    shove-px/speed in the game (0.342s, The Deep's gulper vs a maxed Chitter Shriek) or the lock
//    simply returns at a higher cadence. At 1s it clears every pair with 2.9x to spare, and it is
//    also LONGER than most rings' own base interval — so a tank now rides one shove per second
//    whatever you are firing, which is the point: it walks in between them.
export const TANK_KB_REFRACTORY = 1  // s a tank is immune to further KNOCKBACK after being shoved
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

// ---- City weapons (v5.4: Trash Tornado + Burst Hydrant; Neon Beam = the rainbow re-theme) -------
// Trash Tornado (city — see WEAPONS.trashTornado + stepTornadoWeapon in sim.js). v6.8: run.debris
// is PERSISTENT, not rewritten every frame — each entry is a funnel that hunts (see the levels[]
// comment). Damage is unchanged: a funnel damages enemies it overlaps every `tick` s, on the
// per-enemy cooldown orbit uses (e._debrisCd, the run.orbs/orbCd bookkeeping).
export const DEBRIS_R = 20            // px, base funnel hit radius. Was 14 while these were single
                                      // scraps of junk; a funnel has to read as one from a phone.
// How hard an idle funnel is pulled back toward its evenly-spaced slot on the ring, in rad of
// correction per second per rad of error (~0.8s to close most of a gap). Without it funnels rejoin
// the ring wherever they happened to break off, two hunts running leaves them bunched, and the
// idle state stops reading as an orbit at all — which is the half of the weapon that was already
// right. Small on purpose: snapping them into place looks mechanical.
export const TORNADO_RESPACE = 1.2
// Street Sweeper (sweepLoot, behavioral — v6.9, replaces the enemy-pulling `suction`): every gem
// and coin within this of ANY funnel is marked `_vac`, exactly as wave.undertow marks its own, and
// stepPickups then homes it to the player ignoring magnet range. Radius is per FUNNEL, not per
// player: the point of the mod is that a pack out hunting brings the drops back with it.
// 120 is a little under the level-5 orbit ring (130), so an idle pack alone sweeps a ring roughly
// twice the base magnet — generous but not "collect the whole screen", which would make the magnet
// passive and Sticky Aura pointless in this chapter.
export const TORNADO_SWEEP_R = 120

// Burst Hydrant (city area denial — see WEAPONS.burstHydrant + stepHydrantWeapon/stepZones in
// sim.js). run.zones entries: { x, y, r, fuse, dur, dmg, jetDur?, tick?, jet?, _cd?, _chained?,
// a?, d? }. fuse counts down (harmless telegraph; dur is its starting value so render can grow a
// warning ring from fuse/dur), then the zone erupts for dmg against ENEMIES only, never the player.
//
// SHAPE is decided by `d` (v7.29). Without it the zone is the historical DISC of radius r about
// (x, y). With it the zone is a CAPSULE: everything within r of the segment running d px from
// (x, y) along heading `a`. Only the Reality Shard's tornSeam sets a/d — the seam it cuts is the
// gap the shard skipped — and render.js draws the identical segment, so the art and the hitbox
// are the same two numbers and cannot drift.
//
// What happens next depends on jetDur, and BOTH paths are live:
//   jetDur > 0  — the Burst Hydrant. The jet stays open for jetDur, spraying every `tick`, then is
//                 removed. `jet` counts the remaining open time; `_cd` is the per-(enemy, jet) tick
//                 cooldown, keyed by enemy id — per JET, not per enemy, so overlapping jets stack.
//   jetDur nil  — the Reality Shard's tornSeam. One pop and gone, exactly as before v6.10. Seams
//                 must keep this: a jet field that quietly made them persistent would be a
//                 cross-weapon balance change nothing in the shard's own tuning accounts for.
// Both emit {type:'explode', x, y, radius:r, rift?, a?, d?} on eruption; the last three are
// render's, and mark the seam so it closes rather than detonating. _chained marks a seam; nothing
// in the sim reads it since v6.10 dropped chainHydrant (`d` is what decides the shape now), but
// tornSeam still sets it and it costs nothing as the "not a Burst Hydrant cast" marker.
export const HYDRANT_LAUNCH_KB = 260   // launch (behavioral): knockback applied to caught enemies
export const HYDRANT_STUN = 0.6        // launch: stun seconds × bonus (e.stunT — no seek, no contact damage)
// v6.10 jet constants.
export const HYDRANT_SPRAY_FRAC = 0.45 // each spray tick, as a fraction of the eruption punch (dmg)
export const HYDRANT_IDLE_FRAC = 0.35  // with nothing in castRange, plant within this fraction of it
                                      // around the player — whatever arrives next arrives HERE, so a
                                      // mark out at the rim just expires in empty street.
export const HYDRANT_JET_PUSH = 300    // px/s^2 outward on enemies inside a live jet. kb decays at
                                      // KB_DECAY_RATE (6/s), so this settles at ~50px/s drift —
                                      // well under a drone's 90px/s walk, so seekers wade back in
                                      // and mill at the rim. A jet that ejected its own targets
                                      // would defeat itself; this is a soft wall, not a repulsor.
export const ZONE_MAX_LIVE = 12     // cap on simultaneous zones. A fast cast rate plus count can
                                      // otherwise carpet the street with live hydrants.
// Hard ceiling on streams per hydrant. The render rig allocates this many stream sprites per
// hydrant up front, so the sim MUST clamp to it — otherwise Split Nozzle stacks past the rig and
// the extra targets take damage with no jet drawn, which is the worst possible failure for a
// weapon whose whole readability rests on the art showing what is being hit.
export const HYDRANT_STREAMS_MAX = 8
export const HYDRANT_STREAMS_FALLBACK = 3 // foes an open hydrant hoses at once when its zone carries
                                      // no nStreams — only tornSeam-shaped zones, which never open a
                                      // jet, so in practice this is a guard rather than a tuning
                                      // number. The real value is WEAPONS.burstHydrant.levels[].streams,
                                      // which Split Nozzle adds to. The eruption is
                                      // still radial (it blows the cap off); everything after it is
                                      // aimed. A radial damage AREA is what made the effect
                                      // unreadable — it has to be drawn at its own full radius, and
                                      // several overlapping fill the screen. Streams put the damage
                                      // where the art is.
export const HYDRANT_STAGGER = 0.28    // s of extra fuse per zone within one cast, so a cast rolls
                                      // out instead of landing all at once. Measured: with three
                                      // marks opening on the same frame, 39% of jets never caught
                                      // anything — not because they missed, but because the first
                                      // jet killed what the other two were planted on (one mark per
                                      // cast at L1 is 2.6% dry). A stagger lets the crowd re-flow
                                      // between openings, and reads as a main tearing open along
                                      // its length rather than three unrelated pops.

// ---- Skies weapons (v5.4: Roar + Tail Swipe + Debris Toss) ------------------------------------
// Roar (skies starter — see WEAPONS.roar + stepRoarWeapon in sim.js): the same sector test
// flagella/clawRake use, plus a radial shove away from the player.
export const ROAR_RESONANCE_EVERY = 3     // resonance (behavioral): every Nth roar opens to a full 360° (cf. FLAGELLA_CYCLONE_EVERY)

// Tail Lash (skies — see WEAPONS.tailLash + stepLashWeapon/fireLash in sim.js). run.drags entries:
// { id, dmg, t, dur, hitIds } — an aircraft being reeled in, one per hooked target.
//
// WHY ONLY AIRCRAFT GET PULLED (owner directive: "it should not pull tanks since they deal dmg"):
// `crushable` is already exactly "aircraft" in this roster — jet and helicopter carry it,
// tankColumn does not — and it already means "harmless on contact": stepEnemies' crushable branch
// destroys the airframe outright and costs the player NO damage and NO invuln window. So dragging
// a helicopter into the kaiju IS the kill, with no new code, and dragging a TANK there would just
// park a contact-damage dealer on the player's face. One flag answers both halves.
export const LASH_PULL_T = 0.22           // s to reel a hooked aircraft in (it dies on arrival, via crushable)
export const LASH_DRAG_FRAC = 0.5         // wreckingBall: a dragged body deals this × bonus × the lash's damage
                                          // to each enemy it plows through, once per body per drag.
export const LASH_DRAG_R = 34             // px, how close the dragged body must pass to hurt something
export const LASH_COUNTER_CD = 1.5        // counterLash (behavioral): free lash on taking damage, at most every N s (cf. QUILL_RETALIATE_CD)

// Atomic Breath (skies — see WEAPONS.atomicBreath + stepArcs/fireBreath in sim.js).
// run.arcs entries: { life, duration, charge, tick, acc, dmg, jumps, arcRange, falloutBonus,
// nodes: [{x,y}...] }. `nodes` is the fork polyline (player -> body -> body -> ...), REBUILT on
// every damage tick and read by render.js — it is the entity, there is no angle and no length.
export const BREATH_CHARGE_T = 0.5        // s of wind-up before the first tick — dead time, and the telegraph
export const BREATH_JUMP_DMG_MUL = 0.85   // damage multiplier per fork jump (cf. STAR_CHAIN_DMG_MUL 0.7; gentler
                                          // because the breath re-forks every tick and would otherwise decay to
                                          // nothing on a long chain that keeps being rebuilt from the root)

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

// ---- Beyond weapons (v5.4: Reality Shard + Pulsar Sweep; Mini Black Hole = the hole) -------
// Reality Shard (beyond starter — see WEAPONS.realityShard + stepShardWeapon in sim.js): a
// run.bullets projectile tagged weapon:'shard' carrying _blinkCd (s until its next blink). A blink
// jumps it blinkDist px along its CURRENT heading (post gravity-well curvature) without consuming
// life, and without sweeping the gap (nothing in between is hit — that's the point).
export const SHARD_R = 9                   // px, shard hit radius (added to enemy radius)
// seamRip (behavioral, was tornSeam): each blink leaves a SEAM spanning the skip — from the
// shard's departure point to where it came out, blinkDist px along the heading — which closes over
// SHARD_RIFT_FUSE and cuts everything within SHARD_RIFT_W of the LINE for SHARD_RIFT_FRAC × bonus ×
// the shard's damage. Seams reuse run.zones (same "telegraph then erupt, enemies only" contract)
// carrying `d` (the skip length); a zone with a `d` is hit-tested as a capsule, everything else as
// the historical disc. They carry no jetDur, so they take the one-pop path, never hydrant turrets.
//
// v7.29 turned a 55px disc at the departure point into this capsule, and W is picked so the
// FOOTPRINT barely moves: π·55² = 9503px², and a capsule of half-width 32 over the level-5 skip of
// 100px is π·32² + 2·32·100 = 9617px². It comes out slightly smaller at low levels (7697px² at the
// level-1 skip of 70px) and grows with blinkDist, which is the honest shape for a mod that draws
// the jump — but it means the mod is a shade weaker at Lv1 than the disc it replaced. That is the
// whole balance delta; nothing else about the weapon moved.
export const SHARD_RIFT_FUSE = 0.30
export const SHARD_RIFT_W = 32
export const SHARD_RIFT_FRAC = 0.8
// recursion (behavioral): when a shard's life expires (NOT when its pierce is spent) it forks into
// <tier bonus> new shards in random directions at SHARD_RECURSE_DMG_FRAC damage and
// SHARD_RECURSE_LIFE_FRAC life, flagged `_fork` so a fork never re-forks.
export const SHARD_RECURSE_DMG_FRAC = 0.5
export const SHARD_RECURSE_LIFE_FRAC = 0.6

// Pulsar Sweep (beyond — see WEAPONS.pulsarSweep + stepPulsarWeapon in sim.js): a run.beams
// entry with `swept: true`. A swept beam rakes `arms` arms evenly around the circle (2 by
// default = the opposed pair, 180° apart; hyperSweep adds more, so 3 arms = 120°, 4 = 90°, ...) — the same
// geometry rainbow.prismatic uses, but baked into ONE beam entity rather than several, so
// collapse can resolve every arm at once.
export const PULSAR_ARMS = 2            // arms on a plain (unmodded) cast
// v5.22 FAN MODE (lane chapters only — gated on CHAPTERS[chapter].lane).
// The arms rake a full 360 degrees, which is right when you can walk in any direction and wrong
// when you cannot. In the lane the player advances up a corridor and every threat is AHEAD, so a
// rotating rake spends most of its duty cycle pointed at empty space behind — and because the cast
// angle came from `nearestEnemy`, it would happily lock onto something that had already gone past.
// In fan mode the arms spread across a forward ARC instead of a circle and sweep back and forth
// across it, so no arm ever points backwards and the cast angle stops depending on target choice.
// THE CONSTRAINT: PULSAR_FAN_ARC / 2 + PULSAR_FAN_SWEEP must stay under PI/2, or the outer
// arm swings past the horizontal at the ends of the wiper stroke and points behind the player
// again — which is the entire bug this mode exists to fix. 0.31pi + 0.16pi = 0.47pi, with margin.
// A test pins this (run ZR.e): it walks a whole cast and asserts no arm ever has a rearward
// component, and it caught exactly this when the arc was first set to 0.78pi.
export const PULSAR_FAN_ARC = Math.PI * 0.62   // ~112deg of forward cover the arms spread across
export const PULSAR_FAN_SWEEP = Math.PI * 0.16 // +/- this much of wiper motion on top
export const PULSAR_FAN_RATE = 2.2             // rad/s of that sweep
// collapse (behavioral): when a swept beam expires, everything currently inside ANY of its arms
// is yanked toward the player at PULSAR_COLLAPSE_PULL px/s and takes PULSAR_COLLAPSE_MUL ×
// (1 + bonus) × the beam's per-tick damage, plus an {type:'explode'} at the player.
// v6.9.3: through applyDamage, so it crits and takes the player's damage multipliers — the
// beam's stored per-tick dmg is a RAW config stat, not an already-rolled hit.
export const PULSAR_COLLAPSE_MUL = 8
export const PULSAR_COLLAPSE_PULL = 400

// ---- Beam Prism (v6.7.6, rainbow.prism — behavioral, read in stepBeams) -----------------------
// Owner spec: "when a beam touches an enemy, it splits into N sub-beams like a prism (each deal
// 75% of initial beam and 50% length)". The refraction happens AT the body that was hit, fanning
// forward around the parent's heading — a prism bends light onward, it does not seek targets.
//
// Rarity is the entire stat (see WEAPON_MODS.rainbow.prism's `values`): the card's number is how
// many sub-beams the first refraction throws, and each layer below throws one fewer, down to 2,
// then stops. That is prismLadder, and it reproduces the spec exactly:
//   rare / epic  ->  [2]        split once into 2; a sub-beam that hits something just stops
//   legendary    ->  [3, 2]     3 sub-beams; each that hits re-splits into 2 (i.e. into a rare)
//   mythic       ->  [4, 3, 2]  4, then 3, then 2
// The recursion is bounded three ways, and it needs all three — at mythic the tree is 4 + 12 + 24
// = 40 rays per refraction:
//   1. only the NEAREST body in the arm refracts per tick, not every body the arm crosses (light
//      bends at the first surface it meets, and per-body would square the whole tree),
//   2. a ray stops at the FIRST body it touches — that IS the spec's "it stops",
//   3. one shared already-hit set per refraction, so no body is damaged twice by one cast and two
//      sub-beams cannot ping-pong between the same pair forever.
export const PRISM_DMG_MUL = 0.75    // each sub-beam's damage, as a share of the beam it came from
export const PRISM_LEN_MUL = 0.50    // ...and its reach, as a share of that same parent
// Total fan width of one refraction. Sub-beams spread evenly across it, centred on the parent's
// heading — so an odd count keeps one ray going dead straight (the beam "carried on through"),
// which is what makes the effect read as refraction rather than as a scatter.
export const PRISM_SPREAD = 1.4      // rad, ~80deg corner to corner
// How long a drawn sub-beam segment lingers (render-only, no damage). This MUST exceed the beam's
// tick interval (0.13-0.15s, WEAPONS.rainbow.levels) or the splash blinks out between refractions
// and reads as a flicker instead of a spray — v6.7.6 shipped it at 0.12 and that gap is most of
// why the effect was invisible. At 0.26 consecutive refractions overlap, so a sweeping beam drags
// a continuous fan behind whatever it is cutting through.
export const PRISM_FLASH_T = 0.26

// ---- Surf weapon shape constants ---------------------------------------------------------------
// Backwash (breaker switch mod): the second wave goes out the opposite way at this share of the
// first's damage. Not 1.0 — the pick doubles the weapon's coverage, and paying nothing for that
// would make it the only correct first mod on the starter every single run.
export const BREAKER_BACKWASH_DMG_FRAC = 0.6

// SHELL_RETARGET_R: how far a touch-down looks for its next target. A shell that re-aims at the
// nearest enemy ANYWHERE would curve back across the whole map and read as a homing shot, which is
// a shape the game already has three of; capping the search keeps it a skimmed stone that bounces
// on toward whatever is near where it landed.
export const SHELL_RETARGET_R = 420
// How long one touch-down's splash ring takes to reach its full radius. Far under NOVA_LIFE (0.45s)
// because these are small rings: on the default life a 46px splash lands its damage nearly half a
// second after the shell visibly touched down, which reads as the splash missing the thing it is
// drawn on top of. See spawnNova's `life` option.
export const SHELL_SPLASH_LIFE = 0.14
// The shell's OWN hit radius, which is not its splash radius. The two were one number in the
// first cut and that made the weapon deal no damage at all: the shell counted as having ARRIVED at
// a body 62px away (splash r 46 + body 16) while its splash ring, expanding from zero over its
// life, only ever reaches ~44px. It landed just short, every time, and looked like it was chasing
// correctly. A shell is a small thing; it arrives when it touches.
export const SHELL_R = 10

// Radians between larvae in one Barnacles cast. Wide enough that a 4-larva spread visibly covers
// more of a pack than a 2-larva one; narrow enough that the cast still reads as aimed.
export const BARNACLE_FAN = 0.22
// Hit radius of a larva in flight. Small: it is a seed, and a fat one would attach to the first
// body in the general direction rather than the one the player aimed at.
export const BARNACLE_LARVA_R = 8

// BARNACLE_JUMP_R: how far a crust looks for a new host when its own dies. Deliberately short — the
// spread is a reward for fighting inside a pack, and a long jump would make it work identically on
// a scattered field, which is the version of this weapon with no decision in it.
export const BARNACLE_JUMP_R = 190

// ---- The Trawl's two natives ---------------------------------------------------------------
// LONGLINE_HALF_W: how close to the segment counts as touching it, and therefore the line's whole
// visual thickness. Fixed across levels on purpose — `length` is what grows, and a rope that also
// got fatter would slide toward being a rectangle. Read it against the smallest enemy radius
// (~14px): a body has to genuinely cross the rope, not merely pass near it.
export const LONGLINE_HALF_W = 22
// LONGLINE_SNAG: the catch, in seconds. ONCE PER BODY PER LINE (the `snagged` set in
// stepLonglines) — never per tick. At tick 0.40s a per-tick 0.5s stun is a permanent lock, which
// turns a fence into an invulnerability field; the once-per-line rule is what makes `twinSet` and
// laying a second line the way you buy MORE control, rather than the line itself being infinite.
export const LONGLINE_SNAG = 0.5
// Twin Set lays parallel lines this far apart. Wider than LONGLINE_HALF_W * 2 so the two ropes are
// visibly separate and a body is caught by each in turn; much wider and the pack walks between them.
export const LONGLINE_TWIN_GAP = 54
// Live-line cap. A readability guard first (the water fills with rope at high fire rate) and a
// balance one second. Drops the OLDEST, like ZONE_MAX_LIVE — cutting the newest would eat the cast
// the player just made.
export const LONGLINE_MAX_LIVE = 8

// ---- The Twilight's three natives ---------------------------------------------------------------
// How long a Sunspear column hangs before it lands. It is a TELEGRAPH, so it has to be long enough
// to see and short enough that the body it was called on is still standing there: at the roster's
// top speed (krill, speedMul 1, ~120 px/s at this chapter's balance) a body walks 31px in this
// window, against a splash radius of 62-82. So a column that was aimed correctly still lands on
// what it was aimed at, and a player still gets a frame of warning to read.
export const SUNSPEAR_FALL = 0.26
// Where a SURPLUS column goes when the field holds fewer bodies than the cast has columns. They are
// pushed onto a ring of this radius around the last real target, evenly divided — which keeps the
// cast's full output AND keeps every column at a distinct position. Both halves matter: stacking
// them renders identically to not having fired them (CLAUDE.md's per-cast-count trap), and dropping
// them makes `count` — the weapon's whole level axis — do nothing against a lone tank.
// Under the splash radius at every level that can actually pad. Padding only happens when `count`
// exceeds the bodies in range, so it cannot fire below L3 (count 1 until then) — and L3's r is 58,
// against which 48 still leaves a padded column covering the body it was padded around rather than
// missing beside it. Re-check this pair if either the `r` ladder or `count` moves.
export const SUNSPEAR_SPREAD = 48
// What a fully dark bar multiplies a foxfire's radius by, snapshot at the moment it is cast. 1.6 on
// the radius is 2.56x the AREA, which is the number that matters for a thing that ticks on whatever
// stands in it — and it is why this is the radius rather than the damage (see WEAPONS.longline's
// block: on a grinder, coverage is throughput and the damage number is not).
export const FOXFIRE_GLOOM = 1.6
// RENDER-ONLY, and it is what makes the card true. A foxfire is drawn inside `world`; the dark is a
// MULTIPLY scrim on the stage above `world` at dim 1.0 — so a cloud cast outside the player's lamp
// is not dim, it is ABSENT, exactly as The Deep's anglerfish was before LURE_GLOW existed. Shot on
// scripts/scenes/shelf-foxfire-dark.js: an L5 cloud at full gloom (maxR 118) staged 233px out was
// clearly readable at a full bar, a ghost at a quarter bar, and gone at an empty one — i.e. the one
// card in the game that pays you for being dark had no picture in the dark, which is where it is
// worth taking. It also has no SFX by design (main.js), so on an empty bar it was floating damage
// numbers over black.
//   A FIRE IS A LIGHT, so it punches the lightmap like a lure does, and the stops mean the same
// things (see LURE_GLOW): `lit` is how lit the pool of floor is, `core` un-multiplies the cloud's own
// body so the mint puffs keep their value instead of being multiplied down to grey.
//   Deliberately NOT a full punch-out like a sun shaft: a shaft is somewhere you play normally, and
// a fire you can see by is not the same offer as daylight. The radius rides `r`, which already
// carries the gloom the cast was made at — so a fire lit deep in the dark lights more floor, with no
// second knob to keep in step.
export const FOXFIRE_GLOW = {
  frac: 1.5,       // glow radius as a multiple of the cloud's own r — the fire lights past what it burns
  lit: 0.55,       // 0 = the chapter's dark, 1 = a shaft
  core: 0.95,      // ...at the centre, where the puffs are drawn
  coreFrac: 0.5,   // how much of the glow's radius that core covers
}
// The Sunlance's reach at an EMPTY bar, as a fraction of its `length`. The no-spiral floor, in the
// same idiom as BURST_DUR_MIN and BREACH_R_MIN: this is the one card in the chapter that gets worse
// as the bar empties, and the bar empties fastest exactly when a player is in trouble, so a lance
// that shrank to nothing would be the structural trap spec §8.2 forbids. At 0.45 an empty-bar L5
// lance still reaches 252px, comfortably past the 205px radius of the shaft you are trying to get
// back to.
export const SUNLANCE_REACH_MIN = 0.45

// BALLAST (The Shelf). Flight time, and the fallback throw distance when nothing is in range —
// without the second one a cast with no target lands on the player's own head, which is not a
// misfire the card should be able to make.
export const BALLAST_FLIGHT = 0.42       // seconds from the throw to the landing
export const BALLAST_BLIND_THROW = 260   // px ahead, when there is nothing to aim at
// The size of the THROWN JUNK on screen, which is deliberately not `r`. `r` is where it will
// LAND — 96 to 134px — and the lob rig scaled its payload by exactly that, off a 12px bake, so a
// ballast flew as the kaiju's masonry chunk magnified 8-11x: the same sprite as Debris Toss and
// stepped on every edge. Owner from play, 2026-08-18: "Lest looks too much like debris toss. It's
// ugly and pixelated." The net beside it already had this fix and its comment already said why.
export const BALLAST_THROW_R = 26
// The landing ring. Debris Toss's is amber (0xffb37a) and Ballast shared it, which was a second
// reason the two read as one weapon on top of the sprite — owner from play, 2026-08-18. Silt
// ochre-green instead: still unmistakably "something lands here", and nowhere near the warm
// peach that means the kaiju is throwing masonry at you.
export const BALLAST_RING = { line: 0xb2c065, fill: 0x8d9c4a }
// ---- The Deep's anglerfish: the refill IS the trap ---------------------------------------------
// Owner, 2026-08-17: "I want a huge hidden anglerfish like size 6, but as a trap. In the surf there
// are pools that refill your bar. In the deep i want those pools to be the anglerfishes that refill
// your light, but if you stay too close too long, they devour you." And, settling it: "the
// anglerfishes dont move, they are not enemies, they are traps."
//
// SO AN ANGLERFISH IS A REFILL CIRCLE, NOT A ROSTER ENTRY. That is the whole of this rewrite and it
// is a change of SYSTEM, not of numbers. The first cut made it an enemy with a proximity check —
// which meant it spawned on the WAVE_TABLE clock, wandered in from off screen, could be killed,
// shoved, frozen, feared and counted as a kill, and needed `maxAlive` to stop it carpeting the map.
// Every one of those is a property of a MOB, and none of them belongs to a thing that is supposed to
// be lying on the sea floor with its mouth open, waiting.
//   `signature.maws` puts it in the same vocabulary as The Surf's tide `pools`, The Twilight's sun
// `shafts` and The Reef's air `pockets` — a streamed field of circles the player stands in, keyed on
// run._obstacleSeed, materialised by streamShafts into run.shafts and refilled from by stepCharge.
// refillSpec() is the ONE function that answers "where does this chapter's food come from", so
// teaching it one more field name is the entire wiring. The chapter needed no new spatial system; it
// needed the one it already had.
//
// WHAT MAKES IT A TRAP RATHER THAN A POOL is `gape`, and the geometry is deliberately the simplest
// statement of the owner's sentence: THE WHOLE CIRCLE IS THE MOUTH. There is no safe outer ring and
// no inner kill zone — the escape is TIME, not distance, because "if you stay too close too long" is
// a clock, and drawing it as two radii would turn it into a map-reading problem instead. You are in
// the mouth or you are out of it; the mouth opens while you feed and shuts on whatever is inside.
export const MAW_GAPE_T = 3.2           // s inside a maw to go from shut to full — i.e. to the swallow
// Closes faster than it opens, so backing off genuinely resets the gamble rather than pausing it.
// Equal rates would make the chapter one long approach to a single unavoidable swallow.
export const MAW_CLOSE_MUL = 1.9
// THE DEVOUR. Two halves, and the second is the one that reads as being eaten:
//   - damage at exactly HURT_CAP_FRAC of max HP. hurtPlayer caps a single non-dot hit there
//     (v6.3.4's anti-one-shot guard), so this is the largest hit the game permits, and asking for
//     more would silently deliver the same number. Two swallows from full is dead.
//   - IT TAKES THE LIGHT. You came here for light and it swallowed you along with it, so the bar
//     goes to zero: you leave the mouth at half health, blind, in the dark, needing to find another
//     maw. That costs far more than a bigger number would, and it is the only punishment in the
//     chapter denominated in the chapter's own resource.
export const MAW_DEVOUR_FRAC = 0.5      // of max HP — HURT_CAP_FRAC exactly; see above
export const MAW_SHUT_T = 4.0           // s the mouth stays shut afterwards: it does not feed and its
                                        // lure goes out. The visible signal that this one is spent.
// RENDER-ONLY, and it is what makes "a HIDDEN anglerfish" true rather than merely dark.
// The body is drawn inside `world`, and the dark is a MULTIPLY scrim on the stage above `world` — so
// at any distance the animal is simply not there, and the only thing you can see is what punches
// through the scrim. That is exactly the trap: from across the map an anglerfish is a single green
// light, and the mouth around it does not exist until you are inside it. Photographed on the earlier
// ENEMY cut, before this punch existed (Light 20/100 on a phone): of four anglerfish at
// 90/180/300/410px only the one at 90 was on screen at all — which is a death spiral rather than a
// trap, because the bait was invisible too. scripts/scenes/deep-hunt.js is the surviving frame:
// a real streamed maw at a known range on a low bar, which is the shot that has to keep passing.
//   `lit` is deliberately PARTIAL: a full punch-out would light the mouth you are standing in and
// hand you the crowd around it, and the whole point is that the bait is visible and the animal is
// not.
//   THREE STOPS, NOT TWO, and the innermost one is the bait itself. Shot with a single `lit` stop
// (scripts/scenes/deep-maw.js): the esca came out a dead grey disc, because it is drawn inside
// `world` like everything else and a half-lit scrim multiplies white down to half. A lure that is
// the same value as the water around it is not a lure. `core` un-multiplies the bait alone —
// `coreFrac` of the glow's radius, i.e. a pinprick — while the mouth it hangs in front of stays at
// `lit`. The two numbers are the difference between "a light out there" and "a lit room out there".
export const LURE_GLOW = {
  frac: 1.15,      // glow radius as a multiple of the maw's own r — a halo just past the jaws
  lit: 0.5,        // 0 = the chapter's dark, 1 = a shaft. How lit the body of the glow is.
  core: 0.96,      // ...and at the very centre, where the esca is drawn
  coreFrac: 0.12,  // how much of the glow's radius that core covers
}
// How a maw is drawn (render.js, updateShafts' `maw` branch). Every other refill field in the game
// caches its geometry on the radius and redraws once; this one is redrawn every frame, because the
// gape is the drawing.
//
// ⚠ THE TEETH GROW INWARD, THE MOUTH'S EDGE DOES NOT MOVE. That is the one decision in this block
// and it is a gameplay one, not a look. The obvious drawing of "closing" is the tooth ring
// contracting toward the centre — and it would put the thing you can SEE at a different radius from
// the thing stepCharge and stepMaws actually TEST, at every moment except the two ends. The escape
// boundary has to be findable by eye under pressure, so the rim stays exactly at `r` for the whole
// countdown and the needles reaching in from it are what says how long you have left.
export const MAW_VIS = {
  head: 0x140e1c, headA: 0.62, headFrac: 1.26,  // the body behind the mouth — a rim of animal around the hole
  throat: 0x05070b, throatA: 0.72,              // inside the mouth: darker than any floor this chapter has
  tooth: 0xe8e2d4, toothA: 0.9,
  teeth: 22,                                    // needles around the ring
  toothW: 0.05,                                 // each needle's base width, as a fraction of r
  toothShut: 0.09, toothFull: 0.40,             // needle length at gape 0 and gape 1, as fractions of r
  rimCold: 0x7d6a58, rimHot: 0xff5a3c,          // the rim as the swallow approaches — colour, not just size
  rimW: 3, rimWGape: 5,                         // stroke width at gape 0, and how much it grows by
  escaCore: 0xf2fffb, escaMid: 0xaef4e2, escaHalo: 0x5fd8c0,
  escaR: 0.075,                                 // the bait's core radius, as a fraction of r
  shutA: 0.35,                                  // everything dims to this while the mouth is shut and spent
}

// ---- The Deep's Scent -------------------------------------------------------------------------
// The button. Owner's framing: "you use the light to see the weak points, or to see the enemies
// better, so you can do more damage or move faster towards your prey."
// Three of those four are here; the weak points are not (see CHAPTERS.deep's header for why).
// Bought with the SAME press, cooldown and `t` as the Pulse — never a second button, never a second
// bar (spec §5.2, one gimmick / one button / one second job).
export const SCENT_R = 620              // px, how far the smell carries — marks, amps and is drawn
export const SCENT_DUR_MIN = 1.3        // s on an EMPTY bar. Never 0: spec §8.2's no-spiral floor.
export const SCENT_DUR_AT_FULL = 4.2
export const SCENT_DMG_MUL = 1.5        // damage multiplier against a marked body
export const SCENT_SPEED_MUL = 1.26     // and you close on them faster while it lasts

// ---- Fin Hit's movement coupling --------------------------------------------------------------
// Damage scales with the player's ACTUAL speed as a fraction of PLAYER.baseSpeed (220 px/s), so:
// standing still is 0, a normal swim is 1.0, and every move-speed source in the game pushes past
// that up to this cap. The cap exists because the multiplier compounds with `serrated` and with
// every ordinary damage passive, and an uncapped speed term would make Zoomies the best damage
// card in the chapter rather than a good one.
export const FINHIT_SPEED_CAP = 1.6
// Radians of heading change since the last sweep before the fin commits to that side. Below it the
// player is swimming straight and the fin ALTERNATES, which is a tail beat; without a threshold the
// float noise in a held joystick direction would pick a random side every sweep and the weapon
// would read as having no rule at all.
export const FINHIT_TURN_MIN = 0.12
// Extra radians BEHIND square, added to the 90 degrees the sweep already sits off the heading. A
// tail beat drives water BACKWARD, and — more to the point — the crowd in this genre is behind you,
// because you are running away from it. At a dead 90 degrees the sector points at empty water on
// either flank and the census measured 26% of casts landing nothing at all at L5; biasing the
// centre back to ~110 degrees puts the swept wedge over the shoulder where the chasers actually are.
export const FINHIT_SWEEP_BIAS = 0.35

/** The split ladder for a `first` sub-beam count: [first, first-1, ..., 2]. See the block above. */
export const prismLadder = (first) => {
  const out = []
  for (let n = Math.round(first) || 0; n >= 2; n--) out.push(n)
  return out
}

// ---- Elements (PoE2/Warframe-style elemental status + combos) ---------------------
// Offered always (not gated behind a weapon), rolls a rarity like passives: applied
// potency = base * RARITIES[rarity].mult, added per pick. run.elements[id] accumulates
// potency; run.elementPicks[id] counts picks (max MAX_ELEMENT_PICKS). desc is the tail of the
// level-up card description (a short combo hint) — makeElementCard prefixes the rolled potency.
// A card's description is NOT here: it depends on the potency the player will have after taking
// it, so elementCardDesc(id, P) builds it as a {template, numbers} pair further down. Only the
// name and the icon are fixed per element.
export const ELEMENTS = {
  fire:      { name: 'Fire Infusion',      icon: '🔥' },
  cold:      { name: 'Cold Infusion',      icon: '❄️' },
  lightning: { name: 'Lightning Infusion', icon: '⚡' },
  venom:     { name: 'Venom Infusion',     icon: '☠️' },
}
// At the cap `eligibleElementIds` drops the id from the pool, so this is the point an elemental
// build stops being offered the thing it committed to.
export const MAX_ELEMENT_PICKS = 8
// v6.7 (Track B): ELEMENT_CARD_WEIGHT is GONE. It was a per-id pre-filter that let an eligible
// element join a pool only 25% of the time; with four elements, all four were dropped on
// 0.75^4 = 31.6% of pools, so an 18% element bucket would only have delivered ~12%.
// BUCKET_WEIGHTS.element is now the one and only element-frequency knob (MUTATORS.unstable's
// elementWeightMul multiplies it — see rollCard in sim.js).

// ---- Difficulty (classic runs; picked on the title screen, saved in meta) -----------
// Level 1 = the base game. Each level above 1 adds one RANDOM mutator to the run AND stacks
// +DIFFICULTY_HP_PER_LEVEL enemy HP and +DIFFICULTY_DMG_PER_LEVEL enemy damage (multiplied into
// run.mods.enemyHpMul/enemyDmgMul on top of whatever the mutators themselves do).
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
// does): tests omit opts.difficulty, so they keep baseline density on purpose.
export const EARLY_CALM = {
  body:   { spawnMul: 0.40, xpMul: 2.22 }, // v6.4.3: 0.6·0.67 / 1.67·1.33 — another -33% / +33%
  pond:   { spawnMul: 0.6,  xpMul: 1.67 },
  garden: { spawnMul: 0.6,  xpMul: 1.67 },
  // balance_decision : Surf d1 thinned and paid up, four compounding rulings 2026-08-17
  //  - now the game's gentlest opening (0.29 spawn / x3.03 xp) vs body's 0.30 / x2.78
  surf:   { spawnMul: 0.43, xpMul: 2.42 },
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

// Shared DoT tick period (finer than the effect's duration so damage reads smoothly without
// spamming a 'hit' event every single simulation frame). The burn has its own, coarser
// EL_BURN_TICK; bleed and the player's own DoTs use this one.
export const STATUS_TICK = 0.25

// applyIgnite's burn: a hit deals (IGNITE_DOT_FRAC * potency) of its OWN dealt damage as a DoT
// spread over IGNITE_DURATION seconds. Reapplying refreshes (replaces) duration + DPS. The fire
// ELEMENT no longer comes through here (it sets igniteDps itself, off EL_FIRE_SHARE) — this is
// now the fallout anomaly's burn, and the shape WILDFIRE re-lights with.
export const IGNITE_DOT_FRAC = 0.35
export const IGNITE_DURATION = 3

// Lightning's arcs: SHOCK_RANGE is the base reach (elArc scales it by potency) and SHOCK_CD a
// per-source-enemy cooldown, so continuous weapons (orbit, beam) can't spam arcs every tick.
export const SHOCK_RANGE = 140
export const SHOCK_CD = 0.3

// ---- Elements ----------------------------------------------------------------------
// Spec: docs/superpowers/specs/2026-08-13-elements-redesign-design.md.
//
// The whole model in one line: every status is bought with damage relative to the enemy's OWN
// health, so a hit that is huge to a drone is small to a tank with no special case anywhere.
//
//    recent = (HP the PLAYER removed from this enemy in the last EL_WINDOW seconds) / enemy.maxHP
//
// and each element reads that one number at CONSTANT x sqrt(P), where P is its accumulated potency.
// sqrt because the first pick must be the biggest card you ever take (steepest slope at zero) while
// no later pick is ever worth zero — and on the integer ladder below it is legible: P1 = x1,
// P4 = x2, P9 = x3.
export const EL_WINDOW = 3          // s of damage history every element reads
export const EL_BUCKETS = 6         // ring-buffer resolution: 0.5s each. See stepElementWindows.
export const EL_FIRE_SHARE = 0.35   // burn per hit, as a share of THAT hit's damage
export const EL_COLD_MUL = 2        // slow per unit of `recent`; 1/(2*sqrt(P)) of a health bar freezes
export const EL_FREEZE_T = 2        // s a freeze holds
export const EL_FREEZE_RESIST = 0.25  // post-freeze, cold accumulates at this rate...
export const EL_FREEZE_RESIST_T = 5   // ...for this long. Applied to INTAKE, never to the threshold:
// scaling the threshold instead is arithmetically "cannot freeze at any rarity", which is the bug
// an adversarial review caught in revision 2 of the spec.
export const EL_VENOM_MUL = 0.6     // damage-taken amp per unit of `recent`. Venom deals NO damage.
export const EL_LIGHT_SHARE = 0.30  // arc damage, as a share of the hit
export const EL_LIGHT_RANGE = 0.15  // arc range bonus per sqrt(P)
export const EL_LIGHT_FORWARD = 0.35 // chance per sqrt(P) to forward the source's ignite/bleed
// The burn's own tick, twice the length of the shared STATUS_TICK. A burn is a share of ONE hit
// spread over EL_WINDOW, so at 0.25s it landed 12 ticks of ~4% of the hit each: on a median hit
// that is 1.06, printed as "1", and 3.1% of all ticks rounded to 0 and dealt NOTHING (measured
// over a 300s run). Halving the tick count doubles each number without touching the total.
export const EL_BURN_TICK = 0.5
// ...and a tick never deals less than this. Owner's call: a burn that prints 0 reads as broken,
// and rounding down was silently deleting a slice of every small burn. Note it is a floor on the
// tick, so a very small hit now burns for slightly MORE than its share — deliberate, so that fire
// is never a dead card on a weak weapon.
export const EL_BURN_MIN = 1

/** The redesign's potency ladder. No `normal` tier — an element card is always rare or better. */
export const EL_VALUES = { rare: 1, epic: 2, legendary: 3, mythic: 4 }

export const elScale = (P) => Math.sqrt(Math.max(0, P))

/**
 * Every player-facing number for one element at a given potency — ONE source, read by the level-up
 * card AND by the Codex, so the two can never drift apart. Pure: no `run`, no config lookups beyond
 * this file's own constants (the `hasWeaponAt` precedent for a config.js helper).
 * Percentages are returned already rounded for display; the sim never reads these.
 */
export const elementFacts = (id, P) => {
  const k = elScale(P)
  switch (id) {
    case 'fire':
      return { burnPct: Math.round(EL_FIRE_SHARE * k * 100) }
    case 'cold':
      // The freeze lands once you have removed this share of an enemy's health inside the window.
      return { mul: EL_COLD_MUL * k, freezePct: Math.round(100 / (EL_COLD_MUL * k)), freezeT: EL_FREEZE_T }
    case 'venom':
      // Quoted at half a health bar, which is the honest "typical", not the ceiling.
      return { ampPct: Math.round(EL_VENOM_MUL * k * 0.5 * 100), maxAmpPct: Math.round(EL_VENOM_MUL * k * 100) }
    case 'lightning':
      return {
        arcs: 1 + Math.floor(k),
        dmgPct: Math.round(EL_LIGHT_SHARE * k * 100),
        forwardPct: Math.round(Math.min(1, EL_LIGHT_FORWARD * k) * 100),
      }
    default:
      return {}
  }
}

// Player-visible element copy is a TEMPLATE plus its numbers, never a finished sentence — the
// dictionary is keyed by the English source (see i18n.js), so a sentence with its numbers already
// baked in has a different key every time the player levels up and can never be translated. The
// first cut of this shipped composed strings and was untranslatable by construction: `t()` fell
// through to English for every element card and every Codex page, in every language.
// `s` is the key and `p` its parameters; ui.js renders with tt(), which lets the translation put
// the numbers wherever French wants them. elText() composes the English for everything that needs
// a plain string (the card's own `desc`, the dev-menu filter, the tests).
export const elText = ({ s, p }) => s.replace(/\{(\w+)\}/g, (_, k) => p[k] ?? `{${k}}`)

/** The level-up card's description under the flag: the effect in the element's own units. */
export const elementCardDesc = (id, P) => {
  const f = elementFacts(id, P)
  switch (id) {
    case 'fire':      return { s: 'Burns for {pct}% of the hit.', p: { pct: f.burnPct } }
    case 'cold':      return { s: 'Take {pct}% of an enemy’s health to freeze it. Less than that slows it.', p: { pct: f.freezePct } }
    case 'venom':     return { s: 'Wounded enemies take more damage: +{pct}% at half health.', p: { pct: f.ampPct } }
    case 'lightning': return { s: 'Arcs transfer {dmg}% of the damage and its afflictions to {arcs} nearby enemies.', p: { arcs: f.arcs, dmg: f.dmgPct } }
    default:          return { s: '', p: {} }
  }
}

/** Codex body for one element: the rule, then where the player currently stands. Same {s,p} shape. */
export const elementCodex = (id, P) => {
  const f = elementFacts(id, P)
  const line = (s, p = {}) => ({ s, p })
  // `mine` marks the one line that is about THIS run rather than about the rule. The Codex sets it
  // apart visually (see .codex-p--mine) so it does not read as another sentence of explanation —
  // a flag on the data, not a pattern match on the text, which would break the moment it is translated.
  const mine = (s, p = {}) => ({ s, p, mine: true })
  switch (id) {
    case 'fire': return [
      // An enemy carries ONE burn, never a stack of them — which is exactly what the replacement
      // rule below says, so the page must not also imply that a fast weapon layers them up.
      line('Every hit sets its target burning, for a share of that hit.'),
      line('A new hit only replaces the burn if it would be stronger.'),
      P > 0 ? mine('Yours: {pct}% of the hit, over {secs}s.', { pct: f.burnPct, secs: EL_WINDOW }) : null,
    ].filter(Boolean)
    case 'cold': return [
      line('Damage chills. Chill fills with the health you have just taken off an enemy; a full gauge freezes it.'),
      line('A freeze holds for {freeze}s. Afterwards the enemy resists cold for {resist}s.', { freeze: EL_FREEZE_T, resist: EL_FREEZE_RESIST_T }),
      P > 0 ? mine('Yours: take {pct}% of an enemy’s health within {secs}s to freeze it.', { pct: f.freezePct, secs: EL_WINDOW }) : null,
    ].filter(Boolean)
    case 'venom': return [
      line('Damage weakens. A weakened enemy takes more damage from every source — your weapons, your burns, everything.'),
      line('Venom deals no damage of its own. It makes everything else hurt more.'),
      P > 0 ? mine('Yours: +{pct}% for an enemy at half health.', { pct: f.ampPct }) : null,
    ].filter(Boolean)
    case 'lightning': return [
      // Only burning and bleeding are COPIED (elArc, sim.js). Chill and weakening reach the arc's
      // targets anyway, because the arc deals real damage into each one's own window — so the page
      // says that instead of listing them as things lightning "spreads", which would be a lie about
      // the mechanic and would also read as "arcs chill even for zero damage".
      line('Your hits arc to nearby enemies for a share of the damage, and can pass on the burning and bleeding the first one is suffering.'),
      line('The arc deals real damage, so it chills and weakens its targets like anything else does.'),
      line('More lightning means more arcs, longer arcs, harder arcs and a better chance to pass afflictions on.'),
      P > 0 ? mine('Yours: {arcs} arcs, {dmg}% damage, {spread}% to pass afflictions on.', { arcs: f.arcs, dmg: f.dmgPct, spread: f.forwardPct }) : null,
    ].filter(Boolean)
    default: return []
  }
}

/** The Codex's opening page — the one rule the whole system hangs off. */
export const ELEMENT_CODEX_INTRO = [
  'Elements read one number: how much of an enemy’s own health you have taken off in the last three seconds.',
  'That is why a hit which devastates a drone barely troubles a tank — the same damage is a smaller share of a bigger health bar. Nothing is immune for being big; big things simply need more.',
  'It is also why elements grow with your weapons. As your damage climbs, so does everything they do.',
]

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
// v7.1: the tail steepens PER CHAPTER — a LATE-GAME DIFFICULTY RAMP, not a clawback of Track B's
// power gain. Do not describe it as an offset; two measurements say it cannot be one:
//   - body is exempt BY DESIGN (0.005 is the shipped rate). Owner call 2026-08-09: chapter 1 keeps
//     the full gift of the redesign. body/2 d3, 40 runs: 0.005 -> 25.0% win / level 17.5;
//     0.022 -> 10.0% / 15.3; 0.045 -> 0.0% / 13.2. So an offset there would be ~0.022, and is
//     deliberately not applied.
//   - city is exempt BY ACCIDENT. Its bot dies at 132s and the tail starts at 150s, so rate 0.028
//     measured byte-identical to 0.005. Any chapter dying before HP_SCALE_LATE_START is untouchable
//     at any rate.
// The lever was still the right choice over a flat enemy-HP multiplier, which reached the same
// difficulty by deleting 10% of a run's level-ups — a level-up is a choice moment, and choice
// moments are what the redesign exists to create.
//
// TWO PROPERTIES OF THIS LEVER, both measured, both worth knowing before tuning it:
//   1. It is SELF-TARGETING, which is the argument for it: a run that dies before
//      HP_SCALE_LATE_START is never touched at all. A struggling player is left alone by
//      construction, where a flat multiplier punishes them hardest.
//   2. The same property makes it INERT wherever runs end early. Measured: city at rate 0.028 is
//      byte-identical to 0.005 (median death 132.3s, level 5.2, weaponLvSum 2.8) because its bot
//      dies 18s before the tail begins. Raising a chapter's number here cannot make its EARLY game
//      harder — only HP_SCALE_LATE_START can, and lowering that is the thing this lever exists to
//      avoid.
// beyond 0.045 -> 0.0605 (owner): the last chapter's endgame should keep climbing. Solved, not
// guessed — 0.0605 is the rate that lands hpScale(300) exactly 30% above what 0.045 gave
// (33.58x -> 43.66x). The ramp is smooth and self-targeting as ever: +0% at t=150, +19.8% at 180,
// +27.6% at 240, +30.0% at 300. Front-loaded, because the factor is (1 + rate * dt) and a ratio of
// two such lines rises fastest at the start of the window — worth knowing before reading the
// middle of the curve as a mistake.
// ⚠ BOOK 2 IS STILL MOSTLY ABSENT, AND THAT IS A BUG RATHER THAN A DECISION (found 2026-08-17 in
// adversarial review of the murk-chapter change). `lateRateFor` falls back to HP_SCALE_LATE_RATE
// for anything absent, so the six chapters below The Surf — including The Deep, the book's finale —
// still run The Body's gentlest late curve. They keep the fallback deliberately: none of them is
// reachable by a player yet (BOOKS.undertow.wipFrom), and re-difficultying six unshipped chapters
// is a balance move that belongs with the release that reveals them. Book 2 wants its own ladder
// here, one rung per chapter, written as each one ships.
//
// balance_decision : The Surf takes the Pond's rung as Book 2's first 2026-08-18
//  - only the chapter being REVEALED is filled in; the other six still fall back on purpose
export const CHAPTER_LATE_RATE = {
  body: 0.005, pond: 0.010, garden: 0.015, undergrowth: 0.020,
  city: 0.028, skies: 0.036, beyond: 0.0605,
  surf: 0.010,
}
// Unknown/absent chapter (the Blank, a test run with no chapter) keeps the shipped curve.
export const lateRateFor = (chapterId) => CHAPTER_LATE_RATE[chapterId] ?? HP_SCALE_LATE_RATE
// `rate` defaults to the shipped constant so the two ENEMY-SIDE damage call sites (the snap trap's
// damage TO enemies, and a core blast's) keep the old curve. Scaling those with the chapter ladder
// would make a late beyond run's traps and Ruptures hit 6x harder than a body run's — a player BUFF
// riding on a difficulty knob, which is the opposite of the intent.
export const hpScale = (t, rate = HP_SCALE_LATE_RATE) => {
  const base = 1 + t / 90
  if (t <= HP_SCALE_LATE_START) return base
  return base * (1 + rate * (t - HP_SCALE_LATE_START))
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
// balance_decision : more elites late in The Beyond, ramping from HP_SCALE_LATE_START
//  - 1.5 is NOT a mirror of the HP tail's number and must not be "corrected" into one. The cadence
//    is coarse — only ~7 elites land after t=150 — so +30% would buy exactly one more all run.
export const CHAPTER_LATE_ELITE = { beyond: 1.5 }
export const lateEliteFor = (chapterId) => CHAPTER_LATE_ELITE[chapterId] ?? 0
export const eliteEveryAt = (t, late = 0) => {
  const frac = Math.min(1, Math.max(0, t / RUN_DURATION))
  const base = ELITE_EVERY_START + (ELITE_EVERY_END - ELITE_EVERY_START) * frac
  if (!late) return base
  const k = Math.min(1, Math.max(0, (t - HP_SCALE_LATE_START) / (RUN_DURATION - HP_SCALE_LATE_START)))
  return base / (1 + late * k)
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
// `icon` is the emoji FALLBACK only — ui.js draws every one of these (SHOP_ICONS) and the emoji
// is what a line added without a drawing gets, so the row is never a blank box.
//
// `family` is what the row is FOR, and it is DECLARED rather than inferred from position. It picks
// the icon's colour (SHOP_FAMILY below), and the table's order is asserted to keep each family
// contiguous — so the four colour blocks on the screen can never drift apart from a careless
// insertion. Four of them, and they are the whole taxonomy:
//   atk  — you hit harder      vit  — you last longer
//   loot — you leave richer    res  — the chapter's own resource bar (Book 2's lines)
// EARNING THE COSMETIC: chapters of ONE book finished at their own top difficulty. Declared here
// rather than beside BOOKS below because SHOP.cheeks reads it inside an object literal, and a const
// referenced there must already be initialized - the same hoist HUMIDITY_DMG_FLOOR needs.
export const MASTERY_UNLOCK = 2
export const SHOP = {
  damage:     { name: 'Power Gel',    desc: '+5% damage',       perLevel: 0.05, base: 20, icon: '💥', family: 'atk' },
  fireRate:   { name: 'Twitchy',      desc: '+4% fire rate',    perLevel: 0.04, base: 20, icon: '⚡', family: 'atk' },
  critChance: { name: 'Lucky Eye',    desc: '+2% crit chance',  perLevel: 0.02, base: 30, icon: '🎯', family: 'atk' },
  critDamage: { name: 'Mean Streak',  desc: '+15% crit damage', perLevel: 0.15, base: 30, icon: '💢', family: 'atk' },
  maxHP:      { name: 'Big Mochi',    desc: '+15 max HP',       perLevel: 15,   base: 15, icon: '❤️', family: 'vit' },
  moveSpeed:  { name: 'Slippery',     desc: '+4% move speed',   perLevel: 0.04, base: 25, icon: '💨', family: 'vit' },
  magnet:     { name: 'Magnetic Charm', desc: '+12% gem magnet', perLevel: 0.12, base: 15, icon: '🧲', family: 'loot' },
  coinGain:   { name: 'Coin Nose',    desc: '+10% coins found', perLevel: 0.10, base: 40, icon: '🪙', family: 'loot' },
  // THE ONE LINE HERE THAT BUYS NO NUMBER. It swaps the player's head for a pair of cheeks
  // (drawButt in render.js) on whichever body the book you bought it in uses - the blob and the
  // kaiju in book 1, the fish in Undertow. `perLevel: 0` is honest rather than a placeholder:
  // shopBonus multiplies it and there is no stat to move.
  //   `cosmetic` keeps it off the SACRIFICE screen, whose rows are priced in "what one level of
  // this gives you" - a row reading "+0% -> +0%" is what that screen would say about it.
  //   It JIGGLES - see CHEEK_JIGGLE below for how, and why that is not a whole-sprite wobble.
  cheeks:     { name: 'Cheeky', desc: 'your head becomes a butt', perLevel: 0, base: 0, cost: 9999, maxLevel: 1, cosmetic: true, needsMastery: MASTERY_UNLOCK, icon: '🍑', family: 'skin' },
}
// The palette a family paints with. Three tones each, because the icons are FILLED rather than
// stroked: a body, a darker edge that outlines it, and a light tone for the details inside.
// `res` is BOOKS.undertow.cloth lightened to hold its own on cream — the lines that exist in one
// book alone wear that book's colour.
export const SHOP_FAMILY = {
  atk:  { ico: '#d2415c', edge: '#8e2338', lite: '#ffdbe2' },
  vit:  { ico: '#2f9a7b', edge: '#1c6350', lite: '#d3f2e7' },
  loot: { ico: '#e0a91c', edge: '#8f6708', lite: '#ffeec2' },
  res:  { ico: '#3585b3', edge: '#1f5c7c', lite: '#d5ebf7' },
  // violet, because the four above have the warm/cool corners taken and a cosmetic must not read
  // as an attack line (red) or a coin line (gold) at row size
  skin: { ico: '#9a6fd0', edge: '#5c3d8a', lite: '#e8dcf7' },
}
export const MAX_SHOP_LEVEL = 10
// v7.49 (owner directive): the old bare 1.6^level curve got a surcharge on top — +20% on the FIRST
// level, rising linearly to +200% on the LAST. `level` is the count already owned, so the last
// purchase is at level MAX_SHOP_LEVEL - 1 and that is what the ramp divides by.
// Then a hard ceiling per line: the lines listed in SHOP_COST_CAP climb to their own number,
// everything else stops at SHOP_COST_CAP_DEFAULT. The default BINDS today (critDamage and moveSpeed
// blow past 4999 at level 9) — it is a real price, not a safety rail. coinGain sits under its 9999
// at 8246, so its entry is headroom rather than a live clamp.
// THE CHEEKS SKIN'S JIGGLE. A damped spring kicked by the player's own ACCELERATION, driving the
// cheek mass alone: render.js bakes the outline and the shadow into the body and the two lit cheeks
// into a separate layer over it, so the wobble reads as weight shifting INSIDE a rim that never
// moves. Wobbling the whole sprite instead would deform the fish and the kaiju entire, which is not
// what a butt does.
//   `max` is a FRACTION OF THE BUTT'S OWN HALF-WIDTH, never px: the three bodies are drawn at
// different sizes (the blob's butt is 23 half-wide, the kaiju's 42, the fish's 17) and a px clamp
// would be three different mechanics. Same rule as every other screen-relative value here.
export const CHEEK_JIGGLE = {
  kick: 0.34,    // how hard a change in velocity throws the mass, per px/s^2
  k: 130,        // spring constant back to rest; sets the wobble's pitch (~1.8 Hz here)
  damp: 5.5,     // below ~4 it never settles, above ~10 there is no overshoot left to see
  max: 0.26,     // clamp, as a fraction of the butt's half-width
  squash: 0.8,   // how much of the offset also shows as squash along the travel direction
}
export const SHOP_COST_CAP = { damage: 9999, maxHP: 9999, critChance: 9999, coinGain: 9999 }
export const SHOP_COST_CAP_DEFAULT = 4999

// ---- Book-specific upgrade lines (v7.x) --------------------------------------------
// Every book gets the eight lines in SHOP. A book may add its own on top. Undertow's three all
// act on the RESOURCE BAR, which is what makes them book lines rather than chapter ones: all
// FIVE of its chapters run one (Humidity/Light/Air/Feed/Light), so none of them is dead in its
// own book.
//
// `reduction: true` marks a line whose perLevel is a DECREASE. formatShopBonus (ui.js) reads it —
// without it, -0.04 renders as "+-40%".
//
// `maxLevel` overrides MAX_SHOP_LEVEL for ONE line — see lineMax/shopCost below for how the price
// ladder follows it. Every consumer of a level count must go through lineMax, never the global.
//
// slowBurn's floor on chargeDrainMul (state.js createRun): stops a future maxLevel raise
// from inverting the drain into a refill. At today's 5 levels x 6%/level this never binds (floor
// is 0.5, the tuned ceiling is 0.7) — it exists for the level cap that hasn't shipped yet.
export const SLOW_BURN_FLOOR = 0.5
// currentResist's floor on currentResistMul (state.js createRun), the same guard SLOW_BURN_FLOOR is:
// a future maxLevel raise must not invert the tide's push into a pull. Never binds at today's 5
// levels x 8%, which bottom out at 0.6.
export const CURRENT_RESIST_FLOOR = 0.4
// balance_decision : book-2 bar lines halve to 5 deeper levels 2026-08-17
//  - shopBonus (state.js) clamps to lineMax, so a save holding 10 of these reads as 5
export const BOOK_SHOP = {
  undertow: {
    // PLAIN NAMES, unlike the eight universal lines' flavour ones (owner, 2026-08-17). These three
    // are the newest thing on the screen and the only ones naming a system the player met one
    // chapter ago; "Deep Lungs" made you decode a joke before you could tell what you were buying.
    deepLungs: { name: 'Resource Capacity', desc: '+12% resource capacity', perLevel: 0.12, base: 20, icon: '🫁', maxLevel: 5, family: 'res' },
    slowBurn:  { name: 'Resource Drain',    desc: '-6% resource drain',     perLevel: 0.06, base: 30, icon: '🕯️', reduction: true, maxLevel: 5, family: 'res' },
    bigGulp:   { name: 'Resource Refill',   desc: '+15% refill per pickup', perLevel: 0.15, base: 25, icon: '💧', maxLevel: 5, family: 'res' },
    // balance_decision : tide resistance, 5 levels x -8% player push 2026-08-19
    //  - PLAYER only. stepTide still moves the crowd the full amount on purpose, or the surge stops
    //    reading as weather; "current" is the owner's word for what the code calls the tide.
    currentResist: { name: 'Current Resistance', desc: '-8% current push', perLevel: 0.08, base: 25, icon: '⚓', reduction: true, maxLevel: 5, family: 'res' },
  },
}
// The line table for one book. EVERY consumer goes through this — never SHOP directly, or a
// book-specific line is invisible in exactly one place. Run BP's source-text lint guards it.
export const shopLines = (bookId) => ({ ...SHOP, ...(BOOK_SHOP[bookId] ?? {}) })
// Every line in the game, for the lookups that are book-agnostic (shopCost). Line ids are
// globally unique — run BP asserts it — which is what lets shopCost keep its two-arg signature
// and spares ~6 call sites.
const ALL_SHOP_LINES = Object.assign({}, SHOP, ...Object.values(BOOK_SHOP))
// How many levels ONE line sells. The global is the default; a line may buy fewer, deeper ones.
// EVERY level count goes through this — a bare MAX_SHOP_LEVEL in a notch rail, a `maxed` test or a
// progress denominator is the one-fact-two-places bug this file is built around, and it fails
// silently: a 5-level line draws 10 notches and sells an 11th level nobody priced.
export const lineMax = (id) => ALL_SHOP_LINES[id]?.maxLevel ?? MAX_SHOP_LEVEL
// A SHORT LINE WALKS THE SAME PRICE LADDER IN FEWER, BIGGER STRIDES. `l` re-expresses the line's
// own level as a position on the ten-rung curve, so a 5-level line's first and last purchases cost
// exactly what a 10-level line's do — halving the levels raises the price per level instead of
// making the line cheap. Dividing by `MAX_SHOP_LEVEL - 1` below is therefore still correct: `l` is
// already in that ladder's units, not the line's.
export const shopCost = (id, level) => {
  // A FLAT-PRICED LINE STATES ITS NUMBER. The ladder below is a function of the levels you already
  // own, so a line selling ONE level has no ladder to climb - and landing that single price on a
  // chosen figure through the curve would take TWO knobs (a `base` reverse-engineered through the
  // 1.2 first-rung surcharge, plus a SHOP_COST_CAP entry to stop the default 4999 clamping it),
  // which is one fact in two places for a number that is simply decided.
  if (ALL_SHOP_LINES[id]?.cost != null) return ALL_SHOP_LINES[id].cost
  const l = level * ((MAX_SHOP_LEVEL - 1) / Math.max(1, lineMax(id) - 1))
  return Math.min(
    SHOP_COST_CAP[id] ?? SHOP_COST_CAP_DEFAULT,
    Math.round(ALL_SHOP_LINES[id].base * Math.pow(1.6, l) * (1.2 + 1.8 * (l / (MAX_SHOP_LEVEL - 1)))),
  )
}

// SELLING A LINE BACK PAYS HALF OF WHAT IT COST. Walks the same ladder shopCost charges rather
// than storing what was paid: the price of a level is a function of the level, so the sum is
// recoverable and a save carries no per-line spend field (meta is additive-only, R2).
// balance_decision : refunds return half the coins spent [2026-08-19]
//  - it is a LOSS by design; buying back what you refunded costs the other half again
export const REFUND_RATE = 0.5
// Clamped to lineMax the way shopLevel is (R3, clamp on use): a legacy save holding more levels
// than the line sells today is paid for the levels this build actually priced, and no more.
export const refundValue = (id, level) => {
  const owned = Math.min(lineMax(id), Math.max(0, Number(level) || 0))
  let paid = 0
  for (let i = 0; i < owned; i++) paid += shopCost(id, i)
  return Math.floor(paid * REFUND_RATE)
}

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

// Light Thief's costs, hoisted ahead of BOOK_UNLOCKS below (same reason as HUMIDITY_DMG_FLOOR
// above CHAPTERS: a const referenced inside an object literal must already be initialized).
// See "Light Thief (v7.x Book 2)" further down in this file for the full rationale.
//
// THREE levels, not one purchase (owner ruling): 5, then 10, then 15 sacrificed shop levels. The
// first rung is cheap enough to try and the last is a real commitment, where a single 15 made it
// all-or-nothing in a shop where every other line has a ladder.
export const LIGHT_THIEF_COSTS = [5, 10, 15]

// Sacrifice targets that belong to ONE book, alongside the universal card-slot ladder. This is
// the seam for "more later": a new permanent unlock is a row here plus a read in state.js, not a
// new meta field and a new onSacrifice branch. Keyed by book, then by the flag it sets in
// bookMeta(meta, book).unlocks.
// `costs` is a LADDER: one entry per level, in the order they are bought. A single-purchase unlock
// is simply a one-entry array, so there is one shape here and no branch anywhere downstream.
export const BOOK_UNLOCKS = {
  undertow: {
    // `desc` is the EFFECT ALONE, with no price clause: it is rendered on the shop's unlock list
    // beside a chip already showing the cost, and the offer view composes the "sacrifice N levels"
    // sentence itself. It used to carry a {cost} template and so could only be shown somewhere the
    // cost was in scope — which is most of why the one line saying what this unlock DOES never
    // appeared until you were two taps into a modal.
    // THE KEY IS A SAVE FIELD (bm.unlocks.lightThief, plus the legacy top-level meta.lightThief the
    // loadMeta migration reads) and is frozen by R2 — additive only, never rename. The DISPLAY name
    // moved to Scavenger in v7.x and the key cannot follow it, which is why the two disagree.
    // Why it moved: the unlock is BOOK-WIDE and was named after one chapter's bar. It gives kills
    // back Humidity in The Surf, Air in The Reef and Feed in The Trawl — "Light Thief" is true in
    // exactly one of the four chapters where it does anything (The Deep's killRefill is 0).
    lightThief: {
      costs: LIGHT_THIEF_COSTS, icon: '🦴', name: 'Scavenger',
      desc: 'Kills give back resource.', family: 'res',
    },
  },
}
// How many levels an unlock has, the cost of the NEXT one (null when there is none left), and the
// level a save actually owns.
export const unlockMax = (bookId, id) => BOOK_UNLOCKS[bookId]?.[id]?.costs.length ?? 0
export const unlockCost = (bookId, id, level) =>
  BOOK_UNLOCKS[bookId]?.[id]?.costs[Math.max(0, Math.floor(Number(level) || 0))] ?? null
// `true` is a save from before the ladder: it paid the single full price and had the whole effect,
// so it reads as the TOP level. Never take away what was bought. Everything else coerces and
// clamps, so a tampered value cannot grant a level that does not exist.
export const unlockLevel = (bm, bookId, id) => {
  const v = bm?.unlocks?.[id]
  const max = unlockMax(bookId, id)
  return v === true ? max : Math.max(0, Math.min(max, Math.floor(Number(v) || 0)))
}

// End-of-run coin bonus: sqrt(kills) + level reached (owner directive). The sqrt flattens the
// kill term so a long farm run can't outrun a short deep one, and levelling is paid directly.
export const runBonusCoins = (kills, level = 1) => Math.floor(Math.sqrt(Math.max(0, kills)) + level)

// v6.4.2 (owner directive): a single run banks at most this many coins. Clamped at BOTH ends:
// the standing run.coinsEarned counter (stepPickups, sim.js — rerolls spend it down and it can
// re-earn back up to the cap) and the final banked total including the kill bonus (endRun, main.js).
export const COIN_CAP_PER_RUN = 999

// ---- Chapters (v5.0: macro progression above difficulty) ---------------------------
// Pure data — sim stays theme-agnostic and reads roster archetypes/behavior flags, weapon
// pools, and signature/obstacle config from the run's chapter snapshot (see state.js
// createRun). v5.4 completes the seven-chapter arc from the design doc — CHAPTER_ORDER is the
// single source of truth for sequencing and how many chapters currently ship.
// ---- Books (v7.x) ------------------------------------------------------------------
// A book is a campaign: its own chapters, its own ladder, its own protagonist. Book 1 is the
// shipped game.
//
// `wipFrom` IS AN INDEX INTO `chapters`, NOT A BOOLEAN, and that is what lets a book ship one
// chapter at a time. Every chapter at that index or later is hidden from players entirely and
// reachable only behind meta.dev — see isWipChapter, playableChapterId and titleBookshelf below.
// Omit the key for a fully-shipped book; `wipFrom: 0` is the old `wip: true`, the whole book gated.
// Undertow sits at 1: The Surf is live, the six below it are not.
//
// Revealing the next chapter is therefore BUMPING ONE NUMBER — and the suite's own denominator
// (shippedChapterIds, test/sim-test.js) is derived from this, so the bump immediately demands that
// chapter's endings, unlock line, French and unshakeable tank before it can go green. That is the
// point: the checklist is the flag, not a document someone has to remember to read.
//
// CHAPTER_ORDER is an ALIAS for book 1's chapters, and that is the whole design of this refactor:
// every existing read site — slot summaries, the retroactive unlock chain, ~40 test
// assertions — keeps working untouched and keeps meaning "the shipped chapters, in order". Adding a
// book therefore cannot break Book 1 by omission; the only way to reach another book's chapters is
// to ask for that book by name.
//
// `hidden` is for chapters that belong to a book but sit outside its ladder — The Blank is Book 1's,
// unlocked by winning The Beyond at 5 rather than by finishing the chapter before it.
// `cloth` is the Book's binding colour on the title bookcase — every volume standing on that
// étage is bound in it, and a LOCKED volume is turned fore-edge out with only its boards showing,
// so the cloth is the sole thing tying a covered chapter to the Book that owns it. Render-only,
// like CHAPTERS[].render: no sim meaning. Pick a dark one — the spine's foil title and its gold
// stars are drawn on top, and both need the contrast.
export const BOOKS = {
  book1: {
    name: 'The Anomaly',
    cloth: '#3d5c47',
    chapters: ['body', 'pond', 'garden', 'undergrowth', 'city', 'skies', 'beyond'],
    hidden: ['blank'],
  },
  undertow: { name: 'Undertow', cloth: '#1f5c7c', chapters: ['surf', 'shelf', 'reef', 'wreck', 'trawl', 'twilight', 'deep'], hidden: [], wipFrom: 1, startCoins: 100 },
}
// Explicit, for the same reason CHAPTER_ORDER is explicit: a sweep that means "every book, in
// campaign order" must not depend on object key order surviving an edit. The FIRST entry is the
// book whose purse lives at the top level of meta (see bookMeta in state.js).
export const BOOK_ORDER = ['book1', 'undertow']
export const CHAPTER_ORDER = BOOKS.book1.chapters
// A locked line sits on the shelf from the start with its name and effect MASKED and this count in
// their place - a visible goal rather than a surprise, which is the whole reason it is not simply
// absent from the list.
//   Counted over ONE BOOK's own ladder, because the line is per book: every book sells its own copy
// of the skin (SHOP is merged into every book's table by shopLines) and each is earned in its own
// campaign.
//   Against chapterMaxDifficulty(id) rather than the global MAX_DIFFICULTY: a chapter with a
// shorter ladder (blank caps at 3) is finished when ITS top rung falls, and a bare 5 here would
// make such a chapter uncountable forever. `won` is the highest difficulty actually BEATEN (main.js
// writes it on victory) - never maxDifficulty, which is only how far the ladder has been UNLOCKED.
export const chaptersMastered = (meta, bookId) => (BOOKS[bookId]?.chapters ?? [])
  .filter((id) => (Number(meta?.chapters?.[id]?.won) || 0) >= chapterMaxDifficulty(id)).length
// A line with no `needsMastery` is always offered, which is every line but the cosmetic.
export const shopLineUnlocked = (meta, bookId, id) => {
  const need = ALL_SHOP_LINES[id]?.needsMastery
  return !need || chaptersMastered(meta, bookId) >= need
}
// Every id on any book's LADDER. Deliberately excludes `hidden`: The Blank has always sat outside
// every loop (saveSummary and ui.js both say so in their own comments, and ui.js's carousel repair
// branches on its ledger entry being ABSENT), so sweeping it in here would change shipped
// behaviour for a refactor that is supposed to change none.
export const ALL_CHAPTER_IDS = Object.values(BOOKS).flatMap((b) => b.chapters)

// Humidity's damage floor (owner ruling 2026-08-13, §5.3 of the design doc — see resourceDamageMul
// below, beside refillSpec, for the full explanation). Declared here, ahead of CHAPTERS, purely so
// CHAPTERS.surf.resource can reference the name directly instead of duplicating the number as a
// second literal — a `const` referenced inside an object literal must already be initialized, and
// CHAPTERS is built as one literal below.
export const HUMIDITY_DMG_FLOOR = 0.7

// EVERY REFILL FIELD IN BOOK 2 DRAWS DOWN, NOT JUST THE SHELF'S (owner, 2026-08-18: "in all zones of
// book 2 except pools in 2-1, the resource gathering zones should disappear when you've charged 33%
// of your resource bar"). The mechanism is the one The Shelf shipped — `drawdownSecs` on the field,
// the circle fading on the same number stepCharge counts — and this is only what sets it: the
// owner's rule is a share of the BAR, so the seconds are derived from the chapter's own numbers
// rather than written down three times.
//
// spendSecs() is net of the drain, because the bar is what the ruling is denominated in: at The
// Shelf's 18/s against 2.2/s a third of the bar arrives in 2.1s, and at The Reef's 9/s against
// 1.4/s it takes 4.3s. One clock for both would be two different rules wearing one number.
// ponytail: the seconds are fixed at authoring time, so the two shop lines that move the arithmetic
//   (Deep Lungs raises chargeMax, Big Gulp raises the refill) leave the SECONDS right and the SHARE
//   slightly off — a maxed Deep Lungs turns a third of the bar into a fifth of it. The upgrade path
//   is to meter the drawdown on charge GAINED in stepCharge instead of on dt, which costs the
//   render fade its divisor and Big Gulp its per-circle value; not worth it until it is felt.
// balance_decision : a refill circle is spent after a third of the bar 2026-08-18
//  - The Deep is the one Book 2 field with none: a third of its bar arrives at 2.4s and its maw
//    needs MAW_GAPE_T (3.2s) to swallow, so a drawdown would delete the trap the chapter is built on.
// FOUL SPRING's fouling animation (The Shelf's Silt Veil mod). The patch stops feeding you the
// INSTANT it is fouled -- that is the card's cost and it is not on a timer -- but the picture of it
// needs a beat, and without one the clean water simply blinks out of existence. Owner, 2026-08-19:
// "foul spring should have a specific animation, currently the clean water just disappears."
//
// This is the length of that picture, not of the mechanic: `drawdown` is set to full in the same
// breath, so nothing about the refill waits for this. render.js reads `fouled` (seconds REMAINING,
// counted down by stepShafts) and draws the silt taking the patch over that window instead of the
// linear alpha fade a normal occupancy spend gets.
export const FOUL_SPRING_FOUL_T = 0.85
export const REFILL_ZONE_SPEND = 0.33
export const spendSecs = (res, spend = REFILL_ZONE_SPEND) => +((res.max * spend) / (res.refill - res.drain)).toFixed(2)
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
      { id: 'wbc',      archetype: 'tank',   name: 'White Blood Cell',  hpMul: 1, speedMul: 1,   flags: ['unshakeable'] },
      { id: 'antibody', archetype: 'fast',   name: 'Antibody',          hpMul: 1, speedMul: 1,   flags: ['latch'] },
    ],
    eliteFlags: ['acidPool'],           // pill elites dissolve into acid pools
    signature: null,                    // intro chapter has no signature mechanic
    obstacles: null,                    // keeps the open field
    // balance_decision : the body runs gentlest of all, every difficulty and dailies v6.4.5-v6.6.6
    //  - maxAliveMul is the knob for a crowded LAST THIRD, not the spawn ramp: damping
    //    SPAWN_LATE_QUAD only moved WHEN the field saturates, never whether. Past ~150s arrivals
    //    outrun any starter build, so the cap alone sets the crowd you look at.
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
      { id: 'tardigrade', archetype: 'tank',   name: 'Tardigrade', hpMul: 2.5, speedMul: 0.6, flags: ['phase', 'unshakeable'] }, // v6.4: cryptobiosis flicker (see PHASE_* below)
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
    // balance_decision : pond eased chapter-wide, HP ladder -15% v6.4.5-v6.6.7
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
    // Boomerang Leaf is the boomerang re-theme (id kept as 'boomerang', see WEAPONS.boomerang);
    // stinger + lure are new v5.3 natives. Starter = the Boomerang Leaf (id `boomerang`).
    weapons: ['boomerang', 'stinger', 'lure'], starter: 'boomerang',
    roster: [
      // v6.6.16 (owner): ants and spiders 25% smaller, the wasp 25% bigger. radiusMul is a ROSTER
      // multiplier on the archetype's base radius, so it re-sizes one creature without touching
      // the archetype every other chapter shares.
      { id: 'ant',    archetype: 'normal', name: 'Ant',    hpMul: 0.85, speedMul: 1.1, radiusMul: 0.75, flags: ['trailFollow'] },
      { id: 'wasp',   archetype: 'fast',   name: 'Wasp',   hpMul: 1.3,  speedMul: 0.8, radiusMul: 1.25, flags: ['diveBomb'] },
      // v6.6.15 (owner): spiders -20% hp. This is the ROSTER multiplier, so it thins the spider
      // alone; garden's chapter-wide enemyHpMul below still applies on top of it.
      { id: 'spider', archetype: 'tank',   name: 'Spider', hpMul: 1.2,  speedMul: 0.9, radiusMul: 0.75, flags: ['webZone', 'unshakeable'] },
    ],
    eliteFlags: [],                       // v6.6.16: the mower left the elite flag and became a
                                          // chapter hazard (see `mower` below) — it turns up on its
                                          // own schedule now, so an elite no longer summons one.
    mower: true,                          // ambient lawnmower passes; see the MOWER_* block
    // balance_decision : 20% fewer garden spiders, the chapter's only tank v6.6.26
    //  - RELATIVE weight, so 0.73 and NOT 0.80: the cut share re-normalises onto the other
    //    archetypes and a flat 0.80 removes only 14.5%. Derive the next one by integrating
    //    spawnRate(t)·tankShare(t); seeded runs cannot settle it closer than ~3%.
    archetypeMul: { tank: 0.73 },
    // Signature: dying trailFollow ants drop fading pheromone nodes (run.trails) that living ants
    // accelerate along. No field force (unlike currents) — the mechanic IS the ant behaviour, so
    // sim.js gates its trail logic on signature.type === 'pheromones' (future chapters' ants differ).
    signature: { type: 'pheromones' },
    obstacles: { count: 12, minR: 22, maxR: 40, minDist: 220 }, // grass stalks / pebbles
    // balance_decision : garden thinned and softened over four passes v6.4.10-v6.6.23
    //  - quantity is spawnMul ALONE: the garden field reaches maxAliveMul in 0-6% of samples, so
    //    trimming the cap here would look like a balance change and measure as a no-op.
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
    // 🍄 not 🐾: the paw belongs to Claw Rake, this chapter's own starter weapon, and the two sit
    // side by side on the brief screen and the pause sheet.
    name: 'The Undergrowth', tagline: 'the traps were already set', icon: '🍄',
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
      { id: 'toad', archetype: 'tank',   name: 'Toad', hpMul: 1.6,  speedMul: 1.064, flags: ['pounce', 'unshakeable'] },
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
    // balance_decision : 20% fewer undergrowth toads (share) and arrivals (total) v6.6.28/v6.6.33
    //  - two different levers, stacking multiplicatively. archetypeMul is a RELATIVE share (0.73,
    //    not 0.80 — see the garden spider block); spawnMul is a TOTAL arrival cut, and a run
    //    already pegged at the concurrent cap sees less than 20% of it. maxAliveMul is NOT the
    //    lever to reach for next: the 180/240/300 ladder must climb in even ratio steps (run VV).
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
    // + burstHydrant are new v5.4 natives. Starter = the neon beam (rainbow).
    weapons: ['rainbow', 'trashTornado', 'burstHydrant'], starter: 'rainbow',
    roster: [
      { id: 'vacuum',   archetype: 'tank',   name: 'Robot Vacuum',    hpMul: 1.5,  speedMul: 0.85, flags: ['lineCharge', 'unshakeable'] },
      { id: 'ratDrone', archetype: 'normal', name: 'Rat-Catcher Drone', hpMul: 1,  speedMul: 1.05, flags: [] },
      // Patrol Drone. v6.10.3 (owner: "some drones circle and dash, remove that") — it has lost
      // `aerialStrike` (circle -> mark -> strike -> climb, see stepAerialStrike in sim.js) and is
      // now a plain committed chaser. The flag itself stays in the codebase; skies still uses it.
      // What is left is a reskin of ratDrone at 0.85 hp with its own name and silhouette, which is
      // fine — but the weight/minT gating below is now guarding nothing dangerous and could go if
      // the opening minute ever wants the extra body.
      { id: 'patrolDrone', archetype: 'normal', name: 'Patrol Drone', hpMul: 0.85, speedMul: 1.0, flags: [], weight: 0.3, minT: 60 },
      // Street Rat (v6.3): the fast PRESSURE lane (plain committed chaser). Pigeon is the lane's spice.
      // v6.9 (owner: "pigeons are still dashing/teleporting. just make them move normally, but they
      // can go through (fly over) obstacles. make them 15% slower and rats too"). The pigeon drops
      // `blink` for `flyover`: v6.7.5 made the burst continuous rather than a teleport and it STILL
      // read as one, because a 686 px/s hop between crawls is a discontinuity in speed even when it
      // is not a discontinuity in position. Both speeds are the old ones x0.85.
      { id: 'rat',      archetype: 'fast',   name: 'Street Rat',     hpMul: 0.8,  speedMul: 0.98, flags: [] },
      { id: 'pigeon',   archetype: 'fast',   name: 'Pigeon',          hpMul: 0.7,  speedMul: 1.02, flags: ['flyover'] },
    ],
    eliteFlags: ['spawner'],              // exterminator-van elites periodically disgorge minions
    // Signature: traffic lanes (run.lanes) — a marked band is telegraphed, then a vehicle sweeps
    // it end to end, deadly to the player AND to enemies. All tuning is in TRAFFIC_* below; the
    // per-chapter knob is how many lanes may be live at once.
    // v6.10.3 (owner: "15% less Robo tanks at the beginning of their apparitions"). The Robot
    // Vacuum is city's ONLY `tank`, so a roster weight would be weighted-picking a one-item pool —
    // a silent no-op. This is the archetype-share lever garden and beyond already use, applied to
    // WAVE_TABLE before the pick (see waveWeights in sim.js).
    //
    // 0.825, not 0.85, because the weights are RELATIVE: scaling one weight by m does not cut its
    // share by (1-m). In the row where tanks FIRST appear, [140,200) = {drone 3, wisp 2, tank 1},
    // the share goes 1/6 -> m/(5+m), so the cut is 1 - 6m/(5+m); solving for 0.15 gives m = 0.8252.
    // (The same formula reproduces garden's documented -23.6% at m=0.73 exactly, which is what
    // makes it trustworthy — seeded sims cannot settle this to better than ~3%.)
    //
    // The cut is deliberately front-loaded, which is what was asked for: -15.0% in [140,200) where
    // they first show up, -13.2% in [200,240), -12.4% past 240. A flat share multiplier does this
    // for free because the later WAVE_TABLE rows are tank-heavier.
    archetypeMul: { tank: 0.825 },
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
    // v6.9.5 (owner: "why city ends? why not just repeating squares of roads?"). The street grid
    // repeats over the whole plane here instead of ending at the urban falloff: this chapter IS
    // downtown, and a player who walks far enough to find the edge of it has found the edge of the
    // fiction. `skies` deliberately does NOT set this — it has farmland and parks that a street
    // grid must not pave over. Read by sim.js and render.js, passed into roadAt/blockSnap.
    endlessGrid: true,
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
    // v7.23: FOUR natives, not three. MAX_WEAPONS is 4 and level-up weapon offers are scoped to
    // this array, so a three-weapon chapter leaves every run of it ending with a permanently empty
    // fourth weapon slot. Replacing Tail Swipe with two weapons fills a slot that was dead, rather
    // than diluting anything. Four distinct verbs now: close chip (roar), reach-and-yank
    // (tailLash), formation clear (atomicBreath), ranged burst (debrisToss).
    weapons: ['roar', 'tailLash', 'atomicBreath', 'debrisToss'], starter: 'roar',
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
      { id: 'tankColumn', archetype: 'tank',   name: 'Tank Column', hpMul: 1.25, speedMul: 0.55, flags: ['artillery', 'unshakeable'] },
    ],
    eliteFlags: ['artillery'],            // AA-turret elites shell you too, just harder (see ARTILLERY_*)
    // balance_decision : 10% fewer skies tank columns, half of a telegraph-clutter pass v7.21
    //  - ⚠ the multiplier is not the cut (0.9 gives -7.4%), and seeded sims CANNOT tune it: a new
    //    multiplier re-phases the whole RNG stream, which read 0.865 and 0.84 backwards. Solve
    //    m/((1-s) + m·s) per wave row instead — that is where 0.866 comes from.
    archetypeMul: { tank: 0.866 },
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
      // playerTint/tailTint: read only when `form` (below) isn't 'kaiju' — render.js's syncPlayer
      // bypasses BOTH for the dedicated kaiju bake (SKIES_KAIJU carries its own final palette
      // directly, the same "plans carry their own palette" rule the top-down structures use).
      // Kept here, rather than deleted, as the schema every other chapter's render block follows
      // and as the fallback if `form` were ever cleared.
      playerTint: 0x7ad07a, // classic rubber-suit kaiju green
      tail: true,
      tailTint: 0x5fb05f,   // a heavier, darker kaiju tail (tailLash's business end)
      // v5.11 kaiju redesign, generalised (undertow): the player was STILL the generic cross-chapter
      // blob — identical silhouette to body/pond/garden/undergrowth/city/beyond, just retinted, at
      // ~44px on screen (2 x PLAYER.radius) next to a tower that now draws up to 96px
      // (SKIES_STRUCTURE_ART.tower). `form: 'kaiju'` gates a SKIES-ONLY body/tail rig in render.js
      // (playerForm, mirroring the chapterHasStorm/chapterHasDistricts latch pattern) — a real
      // top-down silhouette (shoulders, jawed head, fore/hind limbs, a baked dorsal-plate spine) at
      // a size that actually dwarfs a tower, plus a proper segmented tail replacing the generic
      // flagellum (T.fx.trace_05) that pond/undergrowth's `tail: true` still uses UNCHANGED — see
      // render.js's syncPlayer for the branch. See SKIES_KAIJU below (art direction §5-adjacent,
      // same "counts + palette in config.js, geometry hardcoded in render.js" split as
      // SKIES_STRUCTURE_ART) for the palette and detail counts. PLAYER.radius (22) stays the sim
      // hitbox — nothing here is read by sim.js. (CHAPTERS.surf.render.form === 'fish' is the same
      // idiom's second user — see that chapter's own render block.)
      form: 'kaiju',
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
      // have shrunk the roar/tailLash hit window along with the sprite. render.js reads this and
      // scales the sprite only; sim.js never sees it (not in this file's exports, not imported by
      // sim.js — grep confirms).
      // v7.21 (owner directive): 0.55 -> 0.605, a flat +10%. Still render-only for exactly the
      // reason spelled out above — the sim radius is an addend in ~12 hit tests and moving it would
      // resize the roar/tailLash hit window along with the sprite. See SKIES_KAIJU.bodyScale,
      // which drops 20% in the same change.
      enemyDrawScale: 0.605,
    },
  },
  beyond: {
    name: 'The Beyond', tagline: 'you were never local', icon: '🌌',
    // Mini Black Hole comes home here (id kept as 'hole', see WEAPONS.hole); realityShard +
    // pulsarSweep are new v5.4 natives. Starter = the reality shard.
    weapons: ['realityShard', 'hole', 'pulsarSweep'], starter: 'realityShard',
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
      { id: 'warden',     archetype: 'tank',   name: 'Warden',        hpMul: 1.25, speedMul: 0.7,  flags: ['unshakeable'] },
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
// v5.24: The Blank — hidden 8th chapter, deliberately OUTSIDE CHAPTER_ORDER (never in the
// difficulty-3 chapter-unlock chain — see nextChapter above).
// Unlocked by winning a classic run of The Beyond at difficulty 5 (main.js endRun). Not a
// survival run: `scripted: true` tells sim.js to run stepBossScript as the ONLY spawner (ordinary
// spawning, elites, formations, obstacles and the 300s victory timer are all gated off) and tells
// ui.js to swap the HUD timer for a wave/phase readout. `maxDifficultyCap: 3` overrides
// MAX_DIFFICULTY for this one chapter — see chapterMaxDifficulty below. weapons is the union of
// every other chapter's pool (the final exam); roster mixes ordinary wave fodder (probe/binder/
// eraser) with `formationOnly` entries only stepBossScript ever spawns by id: the binding node
// (P2 tether) and the three antibody phases (the boss itself, one run.enemies entry per phase).
// The union of all 7 book-1 pools — The Blank is the book's finale, so nothing is out of place
// in it. Doubles as its STARTER pool.
const BLANK_WEAPONS = ['star','orbit','wave','homing','flagella','mines','bloom','boomerang','stinger','lure',
  'clawRake','quillBurst','chitterShriek','rainbow','trashTornado','burstHydrant',
  'roar','tailLash','atomicBreath','debrisToss','realityShard','hole','pulsarSweep']

CHAPTERS.blank = {
  name: 'The Blank', tagline: 'deletion in progress', icon: '⬜',
  scripted: true,          // gates victory timer + ordinary spawning (sim.js), HUD readout (ui.js)
  maxDifficultyCap: 3,     // per-chapter ladder ceiling (see chapterMaxDifficulty helper)
  weapons: BLANK_WEAPONS,
  // balance_decision : the blank rolls its starter from its own pool 2026-08-19
  //  - an ARRAY, not a string: createRun (state.js) rolls one per run. Every other chapter keeps
  //    a plain string, which is the only shape the rest of the game has ever seen.
  starter: BLANK_WEAPONS,
  roster: [
    // probe speedMul 1.15 -> 1.3 (owner directive): 165 x 1.3 = 214 px/s, just under the player's 220 — it
    // shadows a runner and punishes any pause, but outrunning the opening wave still WORKS (the same rule
    // BLANK_CATCHUP_MAX keeps for the boss). Paired with BLANK_PASTSEEK_LAG 4 -> 1.
    { id: 'probe',     archetype: 'fast',   name: 'Probe',        hpMul: 0.7, speedMul: 1.3,  flags: ['pastSeek'] },
    { id: 'binder',    archetype: 'normal', name: 'Binder',       hpMul: 0.9, speedMul: 1.05, flags: ['latch'] },
    { id: 'eraser',    archetype: 'tank',   name: 'Eraser',       hpMul: 1.2, speedMul: 1.2,  flags: ['wake', 'unshakeable'] },
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

// THE TIDE, BOOK-WIDE (owner, 2026-08-19: every Undertow chapter gets the currents The Surf has).
// Lifted OUT of CHAPTERS.surf.signature, because a chapter gets exactly one `signature` and the
// others already spend theirs (shafts, air, leak, trawl, dark). Now a chapter-declared block in the
// same idiom as `gulls`/`shorebreak`/`crush`: read by tideForce/stepTide (sim.js) and by render's
// flow streaks, and absent = no tide, so Book 1 keeps The Pond's own `currents` field untouched.
// surge/period are The Surf's shipped numbers — see its signature block for why 46.
//
// Same strength, a different bearing each (owner ruling): the push is a sine that reverses, so a
// bearing and its opposite are one field and the range is 0-180 degrees. In book order: 0, 70,
// (Reef: none), 120, 45, 95, 150 — no two adjacent chapters within 45 degrees.
//
// THE REEF HAS NO TIDE, deliberately (owner ruling, on these measurements). A zero-mean sine
// displaces 102px at its extreme, and its lane cannot pay that in either direction:
//  - across it (90 deg), the water walks a player who is not steering 205px sideways, into the air
//    pockets (r 130) — RF.a's centre-line run ended on 93 of 100 Air instead of 0, i.e. the water
//    made the chapter's one decision for them.
//  - along it (20 deg), the advance swings 2-88 px/s against a steady 45.
// For any future lane chapter: a tide costs you the scroll or the cross-lane decision, so measure
// both — the sway came in at 205px where the sine alone predicts 102, the lane's terms adding to it.
export const TIDE = { surge: 46, period: 14 }
export const tideAt = (deg) => ({ ...TIDE, axis: deg * Math.PI / 180 })

// v7.x Book 2 ("Undertow") chapter 5 — THE TWILIGHT. This block was The Shelf until 2026-08-17,
// when the light mechanic moved down the book: light-starvation had been sitting two chapters from
// the surface, in the chapter whose own render comment called it "the BRIGHTEST it ever gets".
// Owner: "abyss is light starved, so light related stuff". The 2026-08-13 Undertow spec §6.2 had
// already ruled the same way ("light is the wrong resource for bright shallow water") and
// scheduled the move last, because doing it before a genuinely dark chapter existed would have
// left the game with no dark chapter at all. The Deep now exists, so the gate opened.
//
// Everything about the light — the bar, the shafts, the radius rig, the three natives — arrived
// here UNCHANGED and is the shipped, measured work; read the comments below as the history they
// are. What was re-cut for slot 5 is only what was encoded against slot 2: palette, formScale,
// balance, radiusFull, and the roster split (see CHAPTERS.shelf below for where the jelly went).
//
// ⚠ THIS CHAPTER HAS NO HAZARD, and that is a known debt, not an oversight. `signature.shafts` is
// pure refill geometry — every other Book 2 chapter carries a threat on top of its bar (the Surf's
// surge, the Reef's lane, the Trawl's net, the Deep's maws that bite the hand that feeds). That was
// fine at slot 2, the book's gentlest rung; at slot 5 it puts the thinnest chapter one below the
// finale. Owner ruling 2026-08-17: ship it bar-only, add the hazard later. The candidate is the
// DIEL MIGRATION COLUMN — a vertical band of biomass crossing on a clock, which is the mesopelagic's
// defining event, the same crosses-on-a-timer shape the net already proves, a threat that does not
// aim at you, and the direct consequence of the copepod and the krill living here.
//
// Sharing the pond's nested objects by reference is safe BECAUSE config.js is read-only ground
// truth; this block replaces them wholesale rather than mutating them.
CHAPTERS.twilight = {
  ...CHAPTERS.pond,
  name: 'The Twilight',
  tagline: 'the light only goes down',
  icon: '🌒',

  // The spread above brings in The Pond's pool (flagella/mines/bloom) and its starter, which is what
  // this chapter fought with for its whole life. These three are its own — see the block at the end
  // of WEAPONS for what they are and why the two rares are allowed to read the chapter bar when
  // resourceDamageMul's block says Book 2 spent that licence elsewhere.
  weapons: ['sunspear', 'foxfire', 'sunlance'], starter: 'sunspear',

  // ---- Book 2's mechanic (phase 2). Everything ABOVE this line is still the pond's. ----
  // A NEW object, never a mutation: the spread shares pond's nested objects by reference, so
  // editing `signature` in place would rewrite The Pond's currents too.
  //
  // Sun shafts: streamed pools of light you stand in to refill the bar. `cell`/`chance`/`r`/
  // `minDist` are the eddy block's vocabulary exactly (see signature.eddies above) — chance is a
  // DIRECT per-cell occupancy probability, minDist is spawn-ring clearance measured from the run
  // ORIGIN. cell 760 at chance 0.62 with r 205 lights 14.2% of the plane (chance x pi r^2 / cell^2);
  // a travelling player actually catches about half of that, which is the number the tune below is
  // balanced against rather than the geometric one.
  //
  // driftAmp/driftHz are the wander. driftHz is RADIANS per second, so peak drift speed is
  // driftAmp x driftHz = 60 px/s, which has to sit between two hard numbers:
  //   - above 33 px/s (DEADZONE 0.15 x baseSpeed 220, the joystick's minimum non-zero speed and a
  //     hard cut rather than a rescale) or the player cannot follow it slowly enough to matter;
  //   - below KITE_MIN_SPEED (100), above which stepStragglers may recycle the horde into your
  //     heading — chasing the light would then also summon the crowd onto it.
  //
  // DEVIATION from the plan, which pinned driftAmp under ~20px against the streamer's jitter slack
  // (cs/2 - r - 20). At 20px a shaft moves a tenth of its own radius and the drift is a shimmer,
  // not something you travel to follow — which is the whole fantasy the phase gate exists to judge.
  // streamShafts subtracts driftAmp from its own jitter slack instead (sim.js), so jitter and drift
  // share the budget and their sum still stays inside the cell. Slack here is
  // 760/2 - 205 - 20 - 60 = 95px, comfortably positive.
  // The cast. Owner: "the enemies should be new, this is open sea not a pond" — and, on a first set
  // of jellyfish/squid/turtle, "too big, those could be for next chapter. maybe plankton, shrimp
  // and jelly". So this is the plankton column at the pond's own size class, and the reach for
  // shelf-sized animals is banked for a chapter further down.
  //
  // EVERY FLAG IS THE PONDS'S, UNCHANGED, and that is the point: this is a repaint, so the spawn
  // economy that scripts/charge-probe.mjs's refill sweep was tuned against is untouched and none of
  // those numbers need re-reading. Each one also fits its new animal better than its old one:
  //   split       a gravid copepod carries TWO egg sacs that burst into nauplii, which is literally
  //               SPLIT_CHILD_COUNT at SPLIT_RADIUS_FRAC. Drawn on the body, so the tell is on the
  //               animal before it dies (render.js drawCopepod).
  //   dashBurst   a krill's escape response is one flick of the tail fan. It IS a burst.
  //   phase       a moon jelly is already the translucent thing you cannot get hold of; ghosting
  //               through an obstacle out of damage suits it far better than it ever suited a water
  //               bear in cryptobiosis.
  // hpMul/speedMul are carried over one-for-one from pond's amoeba/tadpole/tardigrade.
  // ROSTER SPLIT 2026-08-17, decided on realism (owner: "whatever is most realistic"). The copepod
  // and the krill stayed with the light and came down here; the moon jelly went the other way, to
  // CHAPTERS.shelf. Diel vertical migration — the largest animal migration on Earth — is what
  // DEFINES the mesopelagic, and it is made mostly of copepods and krill, so this is the water they
  // actually live in. Aurelia aurita is a coastal shallow-water jelly whose blooms are the textbook
  // signal of eutrophic, oxygen-poor, polluted water, which is the murk chapter's whole subject.
  //
  // ⚠ THE GULPER EEL IS A BORROWED STAND-IN, NOT A DESIGN — it is The Deep's tank, on loan because
  // the split left this chapter without one and run DA.h requires every chapter to cover all three
  // archetypes. It is the honest borrow (gulper eels do range up out of the bathypelagic, and it is
  // the chapter directly below) and it is still a borrow. Phase 3 replaces it; do not read its
  // numbers as a tune.
  roster: [
    { id: 'copepod', archetype: 'normal', name: 'Copepod',    hpMul: 1,   speedMul: 0.9, flags: ['split'] },
    // balance_decision : krill dash half speed, half length, half as often 2026-08-17
    //  - the three compound: 429 px/s x 0.35s = a 150px lunge becomes 215 px/s x 0.175s = 38px, so
    //    the flick no longer crosses a body length. spdMul is a NEW knob; restMul is the Sea Roach's
    //    number because the derivation is the same one (cycle = idle + dash, doubled).
    { id: 'krill',   archetype: 'fast',   name: 'Krill',      hpMul: 1,   speedMul: 1,   flags: ['dashBurst'],
      dash: { restMul: 2.48, lenMul: 0.5, spdMul: 0.5 } },
    { id: 'gulper',  archetype: 'tank',   name: 'Gulper Eel', hpMul: 1.9, speedMul: 0.62, flags: ['latch'] },
  ],

  // 95° — see the TIDE block for how the six bearings are spread.
  tide: tideAt(95),
  signature: { type: 'shafts', cell: 760, chance: 0.62, r: 205, minDist: 420, driftAmp: 60, driftHz: 1.0 },

  // The bar. Owner ruling: it is the Pulse's AMMO and nothing else — it does not scale damage, fire
  // rate or speed, so an empty bar costs you the amplified shove and never turns the run into an
  // unwinnable slide. `drain` is the ambient pressure ("you are running out of light"), `refill` is
  // per second standing in a shaft, and `killRefill` is per kill — the one refill geometry that asks
  // for no verb the player lacks.
  //
  // MEASURED, not guessed: scripts/charge-probe.mjs, 5 seeded 300s runs, immortal + kiting, under
  // three spend policies, because one policy cannot tell "the bar cannot fill" apart from "this
  // player spent it all". The first cut (drain 1.5 / refill 22 / kill 1.5 over a 4.4%-lit plane)
  // read as a cycling bar under a greedy player and was actually the spiral this design says must
  // not exist: HOARDING — never firing at all — still drained to zero by t=100s and never came back.
  // A second cut over-corrected until hoarding pinned at 99% armed, i.e. the drain was dead config.
  // These numbers hold the middle: hoarding HOVERS at 70-100 rather than pinning either way, a
  // player who spends whenever they can afford a full pulse gets one every ~18s, and a player who
  // mashes the button gets the floor shove two times in three. Avoiding the light entirely nets
  // about -1.6/s, so it empties in roughly a minute — the drain bites without being a countdown.
  //
  // v7.x REVISION (owner, 2026-08-12), on two counts:
  //   - `killRefill` is now SHOP-ONLY. It is the value you get at FULL Light Thief level, and
  //     zero until then — createRun gates it into run.killRefill so sim.js never reads meta. The
  //     first cut had it on by default at 0.5/kill, which was both unbought and invisible: 0.5 of a
  //     100 bar is a rounding error next to a 2.2/s drain. Bought, it is worth roughly a third of
  //     the drain at a normal kill rate, so it BLUNTS the dark rather than abolishing it.
  //   - the bar now drives `dark` (see darkness() above): the world dims and the player slows on
  //     one curve. `from: 0.5` puts the threshold at half a bar, which the probe measures as the
  //     level a shaft-working player crosses a few times a run and a player ignoring the light
  //     falls under permanently.
  //
  // REFILL IS THE KNOB, and finding that took a wrong sweep first. A drain x shaft-density grid came
  // back FLAT — a seeking player went 21% -> 33% dark across a doubled drain AND halved coverage —
  // because at the old refill of 45/s a shaft refilled the whole bar in 2.3s, so light was a
  // checkpoint you TOUCHED and nothing upstream of that could matter. At 18/s it is a place you have
  // to STAND (6.3s for a full bar, 3.2s to climb back out of the dark), which is the version with
  // an actual decision in it: standing still in a survivors-like is what the crowd is waiting for.
  // Measured across refill 45/18/10/6 x drain 2.2/3.2 (5 rows either side of this one):
  //   - 45: 35% of the run dark, 27% of it lit. The dark is a nuisance you outrun.
  //   - 18: 63% dark at mean depth 0.29, 52% lit, and the HIGHEST damage taken of any row — the
  //         player is out in the open travelling, or parked and being closed on. This one.
  //   - 10 and 6: 95-99% lit. The chapter degenerates into standing in a circle, and at 6 the
  //         damage doubles because you never leave. A slower refill is not a harder chapter.
  resource: {
    name: 'Light', drain: 2.2, refill: 18, killRefill: 1.5, max: 100,
    // radiusFull 1 / radiusEmpty 0.1 are MULTIPLES OF THE SCREEN'S LONGEST SIDE, straight from the
    // owner's spec: "base light radius at 100% bar filled is the biggest dimension of the screen,
    // then it reduces down linearly to 10% that radius". On a 390x844 phone that is 844px -> 84px.
    //
    // It took three shipped attempts to get here and every one of them failed the same way, so the
    // reason is worth keeping. All three gated the light on `from` (half a bar) and expressed it
    // against the HALF-DIAGONAL, which is the radius at which a circle just covers the screen's
    // corners. That radius is 2.38x the one that covers the nearest EDGE (465px vs 195px on a
    // phone), so a light large enough to leave no dark corner is far larger than the screen in
    // every other direction, and shrinking it through that band changes nothing anyone can see:
    // measured mean luminance 85.5 at 50% of the bar, 85.3 at 40%, 84.6 at 35%. Reported three
    // times — "only full dark or full light, with a threshold at somewhere around 41%", then "the
    // light fix still doesn't work", then the spec above.
    //
    // Anchoring on the LONGEST SIDE and running linearly across the WHOLE bar fixes both halves of
    // that: the rim is off-screen at a full bar (so the chapter opens clean on any aspect ratio) and
    // it is inside the screen for most of the range, so every point of Light spent moves something.
    // dim 1.0 (owner, 2026-08-13, "much darker when light = 0", picked off a 4-way shot): outside
    // the light there is the tint and nothing else. CONSTANT — an attempt to ramp it was rejected in
    // play ("I want the light radius to fade, not the whole screen") and had measured as a no-op
    // besides. The radius is what the player reads; the far field is just what lies beyond it.
    // radiusFull STAYS AT 1.0 THROUGH THE MOVE, deliberately, and the open question is recorded
    // rather than answered. The argument for cutting it is real — 1.0 puts the rim off-screen at a
    // full bar, which is generous one rung above a Deep tuned to 0.50 precisely so its corners stay
    // dark — but 1.0 is not an inherited default, it is an OWNER RULING ("base light radius at 100%
    // bar filled is the biggest dimension of the screen, then it reduces down linearly to 10% that
    // radius"), it took three shipped attempts to land, and run DK asserts it by name. Overriding a
    // ruling with an unmeasured guess, in the same change that moves the chapter, is the wrong
    // order: shoot the variants at BOTH viewports and let the owner pick. Until then this is the
    // shipped, judged value and the move stays a move.
    dark: { from: 0.5, speedFloor: 0.6, dim: 1.0, radiusFull: 1, radiusEmpty: 0.1 },
  },

  // ⚠ UNMEASURED FIRST CUT for slot 5, stated rather than implied — exactly as The Reef's and The
  // Trawl's were. The slot-2 numbers this chapter used to carry (0.75/0.75/0.9/1.25/0.65) stayed
  // behind with the slot and now live in CHAPTERS.shelf.
  //
  // One step firmer than The Trawl and stopping just short of The Deep. Note `maxAliveMul` does NOT
  // interpolate cleanly: the book runs 0.55 -> 0.65 -> 0.75 -> 0.85 -> 0.80 and already TURNS OVER
  // at The Deep, deliberately (see its own block), so there is no gap to slide a sixth value into
  // and 0.82 is a judgement rather than a step. `xpMul` drops back to 1 because the +25% was a
  // chapter-2 on-ramp, not a property of the light.
  balance: { spawnMul: 0.78, enemyDmgMul: 1.05, enemyHpMul: 1.08, maxAliveMul: 0.82 },

  // ---- render-only. RE-CUT FOR SLOT 5 (2026-08-17) ----
  // The palette this block used to carry was the "brightest it ever gets" surface blue
  // (0x18567f / 0x9fd6f0, WCAG luminance 0.210). That was encoded against SLOT 2, not against the
  // light, so it stayed behind — see CHAPTERS.shelf. The governing rule for the move was:
  // DEPTH-ENCODED FIELDS STAY WITH THE SLOT, IDENTITY-ENCODED FIELDS TRAVEL WITH THE CHAPTER.
  // Palette, formScale, balance and the swell stayed; the bar, the shafts, the arsenal, the cast
  // and `darkTint` came here.
  //
  // On screen the point of the move is this: THE BASE WATER GOES DIM AND THE SHAFTS STAY BRIGHT, so
  // the same mechanic reads as scarcity rather than as abundance. The floor lands between The
  // Trawl's and The Deep's on obstacle-contrast.mjs's ladder. ⚠ FIRST CUT — that audit had no row
  // for either neighbour until this change added them, so the ladder was an unmeasured claim in
  // prose at both ends. Re-run it rather than trusting these three numbers.
  //
  // `form: 'fish'` + formScale 1.62. This chapter had NO `form` at all until now — the player was
  // still the Pond's blob, the only Book 2 chapter like it, a leftover from the spread above.
  // ⚠ THE LADDER FLATTENS HERE AND IT IS NOT IDEAL: the shipped rungs step +15%, +13%, +19%
  // (1.0 -> 1.15 -> 1.3 -> 1.55 -> Deep 1.7), and inserting between 1.55 and 1.7 makes the last two
  // steps +4.5% each, a third of every earlier step, exactly where the fantasy is "you have become
  // the shark". The honest fix is to re-cut the whole ladder so growth ACCELERATES into the finale,
  // which means moving The Deep's 1.7 — out of scope for this change. Recorded so the next edit to
  // that ladder knows why this rung is cramped.
  render: {
    cast: ['copepod', 'krill', 'gulper'],
    form: 'fish', formScale: 1.62,
    bgColor: 0x04192e,     // mid-water: no surface above, no floor below
    floorTint: 0x80a0b8,   // one stop under The Trawl's 0x93b6cc, one above The Deep's 0x6f8ea6
    playerTint: 0xffffff,  // MUST stay white with a `form` — the level-up minimes read it directly
    tail: true,
    tailTint: 0x7fc4e0,
    eliteIridescent: [0xbfe8ff, 0xffd9f2, 0xd9ffe8],

    // The colour of the dark (render.js updateDark). Blue-black rather than pure black: black reads
    // as a screen fade — a UI event — where a blue-black reads as depth, which is the thing Book 2
    // is descending into. The CURVE it is multiplied by lives with the mechanic, in resource.dark,
    // because sim.js reads that same curve for the move-speed penalty.
    //
    // Taken down from 0x02131f to here (owner, 2026-08-13). With `dim` now 1.0 this IS the far
    // field's colour rather than a wash over the water, so the tint alone decides how black the
    // chapter goes, and 0x02131f left it reading as murky water instead of no light at all. The
    // blue is deliberately kept — it survives the drop (there is still 5x more blue than red in it)
    // and it is the whole reason this is not a fade to black.
    darkTint: 0x00060b,

  },
}

// v7.x Book 2 ("Undertow") chapter 2 — THE SHELF, the murk chapter. Authored 2026-08-17, executing
// §6.2 of the 2026-08-13 Undertow spec, which had been written and never built: "light is the wrong
// resource for bright shallow water… The Shelf's resource becomes Pollution, and its antagonist is
// the murk." Owner, restating the intent: "the idea was about murkiness / pollution / cleanness."
//
// This is the same SLOT the light chapter used to occupy, and it keeps everything that was encoded
// against the slot rather than against the light: the balance table, the swell, the bright floor,
// and the moon jelly. What it does not keep is the light — that went to CHAPTERS.twilight.
//
// THE RIG IS THE SHIPPED ONE, REUSED VERBATIM, on §6.2's own reasoning: "All of it is a
// radius-of-clear-space mechanic; it does not care whether the thing outside the radius is darkness
// or filth." So `resource.dark` here is the SAME field the light chapters use, and it keeps that
// key deliberately — it names the RIG, not the fiction, and what sits outside the radius is already
// per-chapter presentation via render.darkTint.
// ponytail: one key, two fictions. If a fourth reading ever needs different GEOMETRY rather than a
// different colour, that is when `dark` splits into per-chapter blocks.
//
// ⚠ PHASE 1 OF 3. What is real here: the bar, the murk, the upwellings, the roster's tank, the
// slot's balance and palette. WHAT IS A STAND-IN AND SAYS SO: all three weapons, two of three
// roster entries, and the button (it is still the plain Pulse — §6.2's `Clear` is Phase 2, and
// its ⚠ about the spend shrinking the resting radius has to be probed on charge-probe.mjs's
// spend-policy AND movement axes before it is tuned by eye).
CHAPTERS.shelf = {
  ...CHAPTERS.pond,
  name: 'The Shelf',
  tagline: 'in troubled water',
  icon: '🫧',

  // ⚠ ALL THREE ARE BORROWED STAND-INS, NOT A DESIGN. §6.2 rules the natives are Bubble Puff (the
  // starter it names) plus two more, and rules `flagella` out of the pool entirely rather than
  // re-skinned — shipped code had already done the second half. Picked per CLAUDE.md's borrowed-art
  // rule, which is about the SPRITE and not only the shape: every one of these has an ABSTRACT cast
  // that drags no biome in with it, and none is the pond's, because "the starter is too close to
  // the pond's" is the complaint §6.2 opens with.
  //   stinger  the starter. A tight cone of needles — reliable, readable, and already proven as a
  //            Book 2 starter in The Reef.
  //   mines    Toxin Cysts. The one borrow that is thematically RIGHT rather than merely neutral:
  //            a chapter about what has been dumped in the water, fighting with toxic cysts.
  //   hole     an abstract vortex, the third answer to a crowd (move it). Same reasoning, and the
  //            same weapon, The Trawl borrows for the same slot.
  weapons: ['bubblePuff', 'siltVeil', 'ballast'], starter: 'bubblePuff',

  // Clean-water upwellings. The GEOMETRY is the shipped sun-shaft field, unchanged and already
  // tuned — driftAmp x driftHz = 60 px/s has to stay above 33 (DEADZONE x baseSpeed, the joystick's
  // minimum non-zero speed) and below KITE_MIN_SPEED (100), and that is asserted in the suite. See
  // CHAPTERS.twilight.signature for the full derivation; this is the same field wearing clean water
  // instead of sunlight, which is exactly what §6.2 asked for ("the sun shafts become clean-water
  // upwellings that drift exactly as the shafts do").
  //
  // `refillLook` is what stops it DRAWING as sunlight. render.js derives the refill drawing from the
  // signature's SHAPE (refillLook, ~render.js:17512), so a `shafts` signature renders warm additive
  // sun columns wherever it appears — in a murk chapter that is the borrowed-art trap with no
  // borrowed weapon involved. Named `refillLook` rather than `look` on purpose: `look` is already
  // six unrelated reads in the same render neighbourhood (bl.look === 'foxfire', s.look === 'erase',
  // ln.look === 'mower', n.look === 'foam', b.look === 'sunlance').
  // `blob` opts the field into a LOBED outline (LOBE_SHAPES) rather than a disc, the same per-field
  // flag The Surf's tide pools use. Owner, 2026-08-17: "the clean water spot look too much like
  // light spots in other chapter… less circle, different shapes." A disc of pale light is what The
  // Twilight's shafts and The Reef's air pockets already are, and three round bright patches across
  // one book is the borrowed-look trap arriving by convergence rather than by copying. Clean water
  // rising through silt has no edge a circle would describe.
  //
  // `drawdownSecs` is the mechanic (owner, same ruling): "they disappear when you stand in them,
  // linearly in 5s". Standing in an upwelling USES IT UP, fading the whole way so the clock is on
  // screen rather than in the HUD: an upwelling is a place you can park ONCE, and the chapter's
  // answer to "where is the water clear" stops being a fixed map you learn and becomes a thing you
  // consume as you travel. It is no longer written here, and no longer 5s: the second ruling
  // (2026-08-18) made the drawdown a share of the BAR and gave it to the whole book, so every field
  // that takes one is set together from REFILL_ZONE_SPEND, below CHAPTERS.deep. 2.09s here.
  // ponytail: a spent circle is not remembered once it streams out of range, so walking far away and
  //   back regenerates it — now true of three fields, not one. That reads as the water moving (which
  //   it does, driftAmp 60), and the upgrade path if it ever matters is a per-cell spent-set on
  //   `run`, not a field on the circle.
  // 70° — see the TIDE block for how the six bearings are spread.
  tide: tideAt(70),
  signature: { type: 'shafts', refillLook: 'upwelling', blob: true, cell: 760, chance: 0.62, r: 205, minDist: 420, driftAmp: 60, driftHz: 1.0 },

  // The bar. Same numbers as the light rig it reuses — drain 2.2 / refill 18 / killRefill 1.5 were
  // measured over 5 seeded 300s runs under three spend policies (see CHAPTERS.twilight.resource for
  // the full provenance and for why refill is THE knob), and the roster below is two-thirds
  // stand-ins, so re-tuning them now would be tuning against a chapter that does not exist yet.
  // ⚠ Phase 3 changes two of three creatures, which changes the kill rate, which is what killRefill
  // is read against — re-run charge-probe's FULL refill sweep then, not just the Clear spend policy.
  //
  // speedFloor 0.7 — THE MURK SLOWS YOU. Owner from play, 2026-08-18: "it should also slow you
  // down". This overturns the speedFloor 1 that shipped in v7.133, whose argument was that 2.4
  // (Feed) and 2.5 (the dark) already both slow you and a third would collapse the axis. That
  // argument lost to the chapter actually being played: water you cannot see through is water you
  // move carefully in, and a chapter whose only cost was sight turned out not to bite.
  //
  // 0.7 rather than The Twilight's 0.6, because this is slot 2 and that is slot 6 — the book should
  // still tighten as it descends rather than arriving at its full weight in the second chapter.
  resource: {
    // The one bar in Book 2 that FILLS as it goes wrong: it is pollution, not a supply. The sim
    // still counts how clear the water is, exactly as the other five chapters count their resource
    // — only the rail's readout is flipped, which is what `invert` means and all it means.
    // ponytail: display-only. If anything ever needs the pollution NUMBER (a card, an event, a
    //   summary row), give run.charge a real inverted twin rather than flipping it a second time.
    name: 'Pollution', invert: true, drain: 2.2, refill: 18, killRefill: 1.5, max: 100,
    dark: { from: 0.5, speedFloor: 0.7, dim: 1.0, radiusFull: 1, radiusEmpty: 0.1 },
  },

  // ⚠ TWO OF THREE ARE BORROWED STAND-INS. The moon jelly is the one that is a design: Aurelia
  // aurita is a coastal shallow-water jelly, and moon-jelly blooms are the textbook signal of
  // eutrophic, oxygen-poor, polluted coastal water — close to the ideal creature for this chapter,
  // which is why it stayed when the copepod and the krill went down to the mesopelagic with the
  // light (see CHAPTERS.twilight.roster).
  //
  // The sand hopper and the sea roach are on loan from The Surf, one chapter up, and they are the
  // honest borrow rather than a neutral one: an amphipod detritus-feeder and a marine isopod are
  // both scavengers of enriched, degraded water. They are still stand-ins.
  //
  // ⚠ PHASE 3, READ THIS FIRST: pick for the FLAG VOCABULARY and then find the realistic animal,
  // not the other way round. The first pass at this chose Mnemiopsis for `fast` (it swims at
  // centimetres per second) and Capitella for `normal` (a 1cm burrowing deposit-feeder, not a
  // chaser) — realism that reaches the name and not the movement is worse than none. This chapter's
  // antagonist is NOT BEING ABLE TO SEE, so its creatures should exploit that: something that hides
  // in the murk and is legible only close up. Also note `unshakeable` is UNSHAKEABLE_CC_MUL 0.5, so
  // Clear's headline verb ("everything it reaches is stunned") lands at HALF duration on the jelly
  // — revisit its flags when Clear ships or the button under-delivers on first contact.
  roster: [
    { id: 'sandhopper', archetype: 'normal', name: 'Sand Hopper', hpMul: 0.9,   speedMul: 1,   flags: [] },
    { id: 'searoach',   archetype: 'fast',   name: 'Sea Roach',   hpMul: 0.68,  speedMul: 1.15, flags: ['dashBurst'] },
    { id: 'jelly',      archetype: 'tank',   name: 'Moon Jelly',  hpMul: 1.875, speedMul: 0.6, xpMul: 1.25, flags: ['phase', 'unshakeable'] },
  ],

  // Book 2's second chapter, and these are the slot's own numbers — they did not move when the light
  // did. They firm up from The Surf by exactly the step Book 1 takes for the same chapter1->chapter2
  // move (body -> pond leaves spawnMul/enemyDmgMul/xpMul flat and moves only enemyHpMul +0.10 and
  // maxAliveMul +0.15). The coin purse is shared, so this still has to read for a 0-card newcomer as
  // much as an 8-card veteran — one step, not a wall.
  balance: { spawnMul: 0.75, enemyDmgMul: 0.75, enemyHpMul: 0.9, xpMul: 1.25, maxAliveMul: 0.65 },

  // ---- render-only ----
  // ⚠ FIRST CUT, NOT A JUDGED LOOK. These three numbers decide whether the chapter reads as filthy
  // water or as "the pond again", which is the complaint that started this whole redesign, and that
  // question cannot be settled from a hex value — shoot it (scripts/fx-probe.mjs, both viewports)
  // and put variants in front of the owner before treating any of this as decided.
  //
  // The constraint the palette has to satisfy: this slot is the BRIGHTEST floor below The Surf on
  // obstacle-contrast.mjs's ladder (the light chapter used to hold it at WCAG luminance 0.210, with
  // The Reef one stop down at 0.150). Murk is not darkness — a turbid shallow sea in daylight is
  // BRIGHT and low-contrast, which is a different problem from The Twilight's dim and high-contrast.
  //
  // Deliberately NOT the pond's saturated teal (0x2e6258 / 0x66c2a9): "this looks too much like the
  // pond, we're not in a pond, so green is weird" is on the record and applies just as hard to a
  // murk chapter as it did to a sunlit one. This is a desaturated silty blue-green — the colour of
  // suspended sediment, not of algae — and it is also deliberately not The Surf's sand tan.
  render: {
    cast: ['sandhopper', 'searoach', 'jelly'],
    form: 'fish', formScale: 1.15,   // the rung the ladder was always written for; see CHAPTERS.trawl
    bgColor: 0x2e4f52,     // silty water, daylight through it
    floorTint: 0xb6c9bd,   // milky wash — sediment in suspension, not a green bottom
    playerTint: 0xffffff,  // MUST stay white with a `form` — the level-up minimes read it directly
    tail: true,
    tailTint: 0xa9c4bb,
    eliteIridescent: [0xd8e8d4, 0xffe9c8, 0xcfe4dd],

    // The colour of the MURK (render.js updateDark), where the light chapters put a blue-black.
    //
    // ⚠ THIS IS THE NUMBER THAT DECIDES WHETHER THE CHAPTER IS A REDESIGN OR A RESKIN, and the
    // first cut got it wrong in a way only a screenshot could show. It was 0x141a12, an olive-BLACK,
    // chosen by analogy with the light chapters' 0x00060b — and at dim 1.0 the far field became an
    // absence of light, so an empty bar read as NIGHT IN SEPIA. That is The Twilight wearing a
    // different hue, which is exactly what §6.2 exists to avoid.
    //
    // The physics is the fix. Darkness is the ABSENCE of light: dim and high-contrast, and black is
    // the right end of it. Murk is the SCATTERING of light: turbid shallow water in daylight is
    // BRIGHT and low-contrast — you cannot see far because the water throws light back at you, not
    // because there is none. So the far field here has to stay luminous and go flat, which means a
    // pale silty tone, not a dark one. The scrim is a MULTIPLY, so this value is roughly the
    // fraction of the floor that survives at full murk: ~0.37, i.e. hazed out rather than blacked
    // out. It was 0x8c9a80 (~0.55) until play called the murk too thin to read as a cost.
    // Judge it on scripts/scenes/shelf-murk.js, whose whole first question is this one.
    darkTint: 0x5f6b4e,

    // SWELL (v7.x): the waves — STAYED WITH THE SLOT when the light left. Surface waves seen from
    // below belong in shallow water and cannot be seen at 2.5, which is why this block did not
    // travel. Drawn sine crest lines running along world x and travelling +y; see updateSwell in
    // render.js for why this is a Graphics and not the pooled sprite field it started as. Seen from
    // directly overhead (the camera's only projection) a wave IS a crest line, so this is the honest
    // shape rather than a stylisation.
    //   spacing   px between crests
    //   amp       px of sideways wander per crest
    //   wavelength px along the crest for one full wander
    //   speed     px/s the whole field scrolls. Far under DEADZONE x baseSpeed (33 px/s), the
    //             joystick's minimum non-zero speed: a swell that outran your slowest walk would
    //             read as the world dragging you somewhere, not as the surface moving under you.
    //   band      fraction of `spacing` each of the two shading bands covers. 0.5 tiles exactly.
    //   light/dark  the lit face and the shadowed one. Two soft bands per crest, never a stroked
    //             line — a line reads as a contour, which is what the first cut of this looked like.
    // Owner's pick off a three-scale sheet, then "even softer": A's scale, ~60% of its contrast.
    // Re-tinted for silty water rather than clear blue; the scale and the alphas are the judged ones
    // and are deliberately untouched.
    swell: { spacing: 96, amp: 22, wavelength: 320, speed: 26, band: 0.5,
             light: 0xd6e4d2, lightA: 0.08, dark: 0x1d3a34, darkA: 0.10 },
  },
}
// Book 2 chapter 1. Spreads pond for the same reason The Shelf does — a working balance table and
// obstacle field to start from — then overrides everything that makes it a beach: its own roster,
// signature (the tide, its sandbars and its tide pools), Humidity, arsenal, balance table and
// render block. Nothing but `obstacles`, `eliteFlags` and the chapter-agnostic scaffolding is
// still the pond's.
CHAPTERS.surf = {
  ...CHAPTERS.pond,
  name: 'The Surf',
  tagline: 'the tide decides',
  icon: '🏖️',
  // The `normal` lane is deliberately FLAGLESS. An onboarding chapter needs one enemy that simply
  // walks at you: with a flag on all three there is no baseline against which the other two read as
  // special. (The first draft gave the sandhopper dashBurst and had no plain enemy at all.)
  roster: [
    { id: 'sandhopper', archetype: 'normal', name: 'Sand Hopper', hpMul: 0.9, speedMul: 1,    flags: [] },
    { id: 'shorecrab',  archetype: 'tank',   name: 'Shore Crab',  hpMul: 2.2, speedMul: 0.75, flags: ['unshakeable', 'guard'] }, // raises its claw half the time — see the CRAB_GUARD_* block
    // The GULL used to hold this slot as a diveBomb enemy. It is now a HAZARD, not a creature
    // (owner ruling: "this should rather be a trap like thunder in the skies... this is not an
    // enemy per say") — see the GULL_* block below and stepGullStrike in sim.js. Taking it out left
    // the chapter with no `fast` entry at all, and an empty archetype pool does not fail loudly:
    // spawnEnemy's `rosterPool` comes back empty and every fast spawn falls through to the generic
    // pink wisp blob, which by t=260 is 6/11 of everything on screen. The Sea Roach is that slot.
    // hpMul 0.68 (owner ruling 2026-08-16: 15% less, was 0.8): the chapter's one fast enemy is a
    // thing that darts in and dies rather than a thing that arrives already on you.
    //
    // THE PER-ROSTER OVERRIDES BELOW EXIST BECAUSE THE DASH KNOBS ARE GLOBAL. Owner, 2026-08-17:
    // "The dasher should dash much less often and less far. like 50%. And deal 50% less dmg. It's
    // the first level of the book, that's too harsh." That reason is about THIS CHAPTER — but
    // DASH_IDLE_T / DASH_T are shared by every dashBurst enemy in the game (pond's tadpole, shelf's
    // krill, reef's tuna, trawl's viperfish), and halving the reach of The Trawl's dasher because
    // Book 2's FIRST level is harsh would be a straightforward mistake. So the softening lives on
    // the roster entry, where hpMul and speedMul already live, and the globals stay put.
    //   dash.lenMul  0.5   -> DASH_T 0.35 x 0.5 = 0.175s. The dash SPEED is untouched (x2.6), so
    //                        halving the window halves the LUNGE: 174px -> 87px, i.e. 45% of a
    //                        390px phone's half-width, down from 89%.
    //   dash.restMul 2.48  -> DASH_IDLE_T 1.1 x 2.48 = 2.728s. Derived, not eyeballed: "half as
    //                        often" is about the whole CYCLE, and the cycle is idle + dash. It was
    //                        1.1 + 0.35 = 1.45s; doubling it needs 2.90s total, and the dash half
    //                        now only supplies 0.175s, so the rest must carry 2.725s. The shipped
    //                        pair gives 2.903s — a dash every 2.90s against every 1.45s, which is
    //                        0.4995 of the old rate.
    //   dmgMul       0.5   -> a straight halving of contact damage, on top of the chapter's own
    //                        balance.enemyDmgMul 0.7. See spawnEnemy: this is a NEW roster field,
    //                        added in the same shape as hpMul/speedMul/radiusMul/xpMul, because no
    //                        per-roster damage term existed at all before.
    { id: 'searoach',   archetype: 'fast',   name: 'Sea Roach',   hpMul: 0.68, speedMul: 1.15, flags: ['dashBurst'],
      dmgMul: 0.5, dash: { restMul: 2.48, lenMul: 0.5 } },
  ],

  // The tide. `surge` is peak lateral speed in px/s and `period` a full surge->backwash cycle; the
  // push is a sine, so it is zero-mean and cannot walk the player off the map over a 300s run.
  // axis is radians — 0 means the shore runs along y and the water shoves you along +/- x.
  //
  // 46 px/s sits inside the two hard numbers the joystick imposes (see CHAPTERS.shelf.signature's
  // block for the full derivation): above 33, the DEADZONE 0.15 x baseSpeed 220 floor, or the
  // player cannot express a slow correction against it; and far under 220, or the surge is not a
  // push but a wall. It is deliberately felt rather than fought — chapter 1 teaches "the map is not
  // neutral" and then lets you win the argument.
  //
  // GULLS. A chapter-declared HAZARD, not the signature — a chapter gets exactly one `signature` and
  // The Surf's is the tide. Declaring it as its own flag is the same idiom `resource`, `crush` and
  // `dispatch` use, and it is a no-op in every chapter that does not set it. See the GULL_* block.
  gulls: true,
  // THE BUTTON. Same idiom as CHAPTERS.reef.burst / trawl.breach / deep.scent — a boolean the one
  // shared stepRepulse branches on, so the chapter never gets a second button or a second bar. This
  // is the only one of the four that REPLACES the Pulse's shove rather than adding to it; see the
  // SHOREBREAK_* block in this file for why, and stepRepulse for where the skip happens.
  shorebreak: true,
  // 0°, shore-normal. PINNED — the sandbar and pool fields and the whole Humidity tune below were
  // measured against this bearing. See the TIDE block for how the six are spread.
  tide: tideAt(0),
  signature: {
    type: 'tide',
    // Sandbars: dry ground you can walk onto. `slowMul` composes with every other slow by MIN (see
    // the slow-composition note in sim.js), so it is the FLOOR the chapter can impose, never a stack.
    // drainMul multiplies the resource drain while you stand on one. See `resource` below for the
    // measured split between this and the ambient drain, and for why the first tune was a clock.
    //
    // `chance` IS NOT THE DENSITY YOU GET — it is the density before streamSandbars drops every bar
    // that would touch a tide pool (owner, 2026-08-15: the two must not overlap; see the block above
    // streamSandbars for why the sandbar is the one that yields). At the shipped pool field that
    // rule rejects a third of them, so the raw roll had to come up to keep the beach the same beach.
    // Measured with the streamers themselves, 3 seeds over a 9000px box, area coverage by 120k-point
    // Monte Carlo — the honest metric here, since a bar dropped for overlapping is not a bar that
    // shrank, and counting bars would have read the change as 40% worse than it is:
    //   overlap rule OFF, chance 0.42 (as shipped): 7.53% of the map is dry sand — 219 of 697 bars
    //                                               touching a pool, the worst pair concentric.
    //   overlap rule ON,  chance 0.42:              5.82%, 0 overlaps  <- the hazard quietly thinned
    //   overlap rule ON,  chance 0.52:              7.52%, 0 overlaps
    //
    // AND THE SAME BILL CAME AGAIN WITH THE LOBES (see LOBE_SHAPES). A lobed outline only ever pulls
    // IN from r, so it costs area — about 30% of it, on both fields, measured the same way. At the
    // old rolls that put dry ground at 5.23% and the pools at 6.61%, so both rolls come up:
    //   lobes, chance 0.52 / pools 0.55:  5.23% dry, 6.61% pool
    //   lobes, chance 0.93 / pools 0.77:  7.60% dry, 9.61% pool  <- shipped, 0 overlaps
    // 0.93 is a high-looking roll that is not a dense field: it is the roll BEFORE the lobes take
    // their 30% and before the pools reject their share, and the number that matters — how much of
    // the map is dry — is the same 7.5% it has been since the hazard was tuned. Pool coverage lands
    // 2% over its old 9.44%, deliberately on the generous side of the target rather than under it,
    // because this field's failure mode is a bar the player cannot fill.
    // So the beach a player walks is unchanged in how much of it is dry, which is what the whole
    // Humidity tune below was measured against, and no patch of it is two things at once any more.
    bars: { cell: 620, chance: 0.93, r: 150, minDist: 380, slowMul: 0.62, drainMul: 24 },

    // Tide pools: the refill. Same vocabulary as the shelf's shafts and the pond's eddies — cell is
    // the grid, chance a DIRECT per-cell occupancy probability, minDist spawn-ring clearance from
    // the run ORIGIN. No drift: a pool is a hole in the sand, and the thing that moves in this
    // chapter is the water, not the ground.
    // `blob` opts this field into a lobed outline (LOBE_SHAPES) rather than a disc. Per-field, not
    // chapter-wide: The Twilight's sun shafts and The Reef's air pockets are round things and stay
    // round. See `chance` below for what the lobes cost in area and how it was paid back.
    pools: { cell: 700, chance: 0.77, r: 165, minDist: 420, blob: true },
  },

  // Humidity. `drain` is the ambient cost of being out of the water at all, and standing on a
  // sandbar multiplies it by signature.bars.drainMul.
  //
  // THE SPLIT BETWEEN THOSE TWO IS THE WHOLE DESIGN, and the first cut had it backwards. §5.3
  // accepts a bar that drives damage only because "the sandbar is a PLACE, so the player can always
  // see the cause and step off it" — which is false the moment the ambient drain is the bigger
  // number. At 1.6/s ambient x4 on the bar, scripts/charge-probe.mjs measured a kiting player at
  // 15.5% sandbar occupancy losing 1.6/s no matter where they stood against 0.74/s from the sand:
  // 68% of the loss was a CLOCK the player could do nothing about.
  //
  // THE FIX IS NOT "MAKE THE SAND HURT MORE" — the sandbar's cost barely moved (6.4/s -> 7.2/s).
  // What changed is that standing ANYWHERE ELSE is now nearly free, which is what turns the bar from
  // a countdown into a map. Measured, 300s x 3 seeded runs, all three spend policies, all four
  // movement/thief rows (scripts/charge-probe.mjs --chapter surf), before -> after:
  //   - the ambient share of a kiting player's loss: 68% -> 22%. The sand is now 78% of it.
  //   - base kite hoard (pure supply vs drain, a player ignoring the mechanic): mean 31.1 -> 56.7,
  //     and the time pinned at zero 29% -> 1%. That is the headline: the floor stopped being the
  //     resting state, so the multiplier now lives in its top half where a player can feel it move.
  //   - base seek hoard (a player working the pools): 76.7 -> 89.2, %atMax 2% -> 8%.
  //   - a kiting player who ACTUALLY avoids the sand loses only 0.3/s against a passive 1.6/s of
  //     pool coverage, i.e. pins at full. Avoiding sandbars is now a real, sufficient strategy, and
  //     that is the "place, not a clock" claim being literally true rather than asserted.
  // The ambient drain is NOT zero on purpose: over 300s it is still 90 points, so a player who
  // never touches a pool ends the run dry. It is a slope, not a countdown.
  //
  // ⚠ The `full` and `greedy` spend rows stay low (12.7 and 4.7 mean) and that is NOT this tune
  // failing: PULSE_CHARGE_COST is 45 of 100 on a ~6s cooldown, so a player who uses the button is
  // spending up to 7.5/s — five times the whole drain — and the button and the damage multiplier
  // are simply competing for one bar. That is a DESIGN question for the owner (which of the two the
  // bar is for), not a number to retune here, and it is unresolved.
  //
  // `damage` is the §5.3 owner-ruling override: only Humidity carries this key, which is what makes
  // resourceDamageMul() (config.js) a no-op everywhere else. floor reuses HUMIDITY_DMG_FLOOR rather
  // than a second literal, so the two never drift apart.
  resource: { name: 'Humidity', drain: 0.3, refill: 20, killRefill: 1.2, max: 100, damage: { floor: HUMIDITY_DMG_FLOOR } },

  // A NEW object, never a mutation of the spread one: `...CHAPTERS.pond` above shares pond's
  // `balance` table BY REFERENCE (see CHAPTERS.shelf.obstacles === CHAPTERS.pond.obstacles in
  // shipped code — the same hazard, one field over), so `CHAPTERS.surf.balance.spawnMul = …` in
  // place would rewrite The Pond's own curve too.
  //
  // The Surf is Book 2's onboarding chapter, so it takes the gentle numbers The Shelf held while IT
  // was chapter 1. Humidity taxes damage on top of everything here (see resourceDamageMul), which is
  // a pressure no other first chapter carries — hence spawnMul under the pond's own 0.75.
  //
  // balance_decision : every Surf enemy hits 25% softer, chapter-wide 2026-08-17
  //  - does not reach the gull: that blast is a flat GULL_DMG, tuned at its own constant
  balance: { spawnMul: 0.68, enemyDmgMul: 0.525, enemyHpMul: 0.85, xpMul: 1.25, maxAliveMul: 0.55 },

  // balance_decision : 20% fewer Shore Crabs, chapter-wide at every difficulty 2026-08-17
  //  - ⚠ 0.41 is MEASURED, not derived: the arithmetic 0.6·0.8 = 0.48 gives only 9.5%. The weight
  //    is relative AND crabs are the tank, so thinning them speeds turnover and the total spawn
  //    count rises, diluting the cut twice. Re-measure any retune; do not compute it.
  archetypeMul: { tank: 0.41 },

  // ---- the arsenal. A NEW array, never a push onto the spread one: `...CHAPTERS.pond` above shares
  // pond's `weapons` array BY REFERENCE, so `CHAPTERS.surf.weapons.push(…)` would hand The Pond a
  // beach weapon and nothing would throw (the same hazard the render block below documents, and the
  // reason CHAPTERS.shelf.obstacles === CHAPTERS.pond.obstacles is `true` in shipped code).
  //
  // THREE NATIVES, NOTHING BORROWED (owner ruling). Book 2's first chapter opens with three weapons
  // that exist nowhere else, each claiming a shape the other 23 do not have: a moving front that
  // carries, multi-impact along a path, and attach-and-spread. See the block above WEAPONS.breaker
  // for why those three and not others. Anything added here later has to clear the same bar — a
  // fourth aimed projectile or a fifth melee arc is a card this chapter already has in spirit.
  //
  // The Breaker is the starter because it is the LEAST clever of the three: a wave comes through and
  // wrecks what is in the way. That is what a book's first weapon should be — the unusual cards are
  // what the chapter's OTHER two slots are for.
  weapons: ['breaker', 'skippingShell', 'barnacles'], starter: 'breaker',

  // NO OBSTACLES ON THE BEACH (owner, 2026-08-15). Overriding the pond's pebble-and-stalk field with
  // the same `null` the intro chapter uses ("keeps the open field") rather than an empty table —
  // streamObstacles early-returns on a falsy cfg, so this costs nothing per frame and run.obstacles
  // simply stays [].
  //
  // It is also the one chapter where the furniture was fighting the floor. Everything the ground
  // does here is already a circle you read and act on — a sandbar to stay off, a tide pool to stand
  // in — and a scattered field of collidable rocks put a THIRD kind of circle among them that looks
  // like the other two from above and means something else entirely. The signature is the map, so
  // the map is what the floor should be saying.
  obstacles: null,

  // ---- render-only. Written WHOLESALE rather than spread from the pond's, exactly as The Shelf's
  // is: `...CHAPTERS.pond` above shares the pond's render object BY REFERENCE, so writing
  // `CHAPTERS.surf.render.cast = […]` in place would rewrite The Pond's render block too (see
  // CHAPTERS.shelf.obstacles === CHAPTERS.pond.obstacles in shipped code).
  //
  // THE BEACH PALETTE. This chapter wore the pond's teal (0x2e6258 / 0x66c2a9) for four commits
  // while its three creatures were deliberately baked against pale warm sand — see the "Surf
  // chapter (Book 2 ch 1, pale sand)" block in render.js, whose whole contrast argument (the crab
  // is the one hue sand never reaches, the hopper a step down in VALUE from it, the gull the cold
  // near-white the warm floor cannot touch) was true of a floor that did not exist yet.
  //
  // DAMP sand, not dry, and that is load-bearing rather than flavour: the sandbars are DRY sand, and
  // a pale patch on a pale floor is a patch nobody can see. Wet sand really is a value step darker
  // than dry, so the floor takes the darker warm tan and SANDBAR_VIS keeps the bright one — the
  // mechanic and the physics want the same picture. The gull still wins on value from above, the
  // crab still owns a hue the sand cannot reach, and the tide pools (deep blue) read as holes.
  //
  // playerTint is 0xffffff and not the pond's cyan: syncPlayer forces white for a chapter with its
  // own `form`, so the fish's rust-coral bake shows as drawn — but the level-up MINIME copies read
  // chapterRender.playerTint directly, and pond's 0xb0f0ff turned those into teal ghosts of a
  // red fish. Same rule as skies, which sets its own for exactly this reason.
  //
  // form: 'fish' (v5.11 kaiju redesign, generalised for undertow): the player is a small fish here,
  // not the generic cross-chapter blob — see render.js's drawFish (in this chapter's own roster
  // section) and the playerForm branches in syncPlayer. Same idiom CHAPTERS.skies.render's
  // `form: 'kaiju'` uses. ONE body serves all of Book 2; `formScale` is the book's "you grow in each
  // chapter" arc and The Surf, being the smallest you ever are, leaves it at its default 1.
  // tail: false overrides pond's inherited `tail: true` — the fish's own body already ends in a
  // caudal fin, so pond's separate trailing flagellum sprite would double up on one.
  render: {
    // The cast is the chapter's three ENEMIES, so the gull comes out with it: it is a hazard now,
    // and a title card promising a bird you never fight is a lie about what the chapter is.
    cast: ['sandhopper', 'shorecrab', 'searoach'],
    form: 'fish',
    // SUSPENDED, NOT BLOWN. render.js's ambient dust sprite is a white radial dot shared by every
    // chapter; over this floor it reads as smudges on a lens, so it takes a grain darker than the
    // sand. What changed with the water is the MOTION: the same 14 sprites were drifting up-right at
    // a wind's pace across a floor that is now underwater, and sand does not blow through water — it
    // hangs in it and takes a long time to fall. speedMul cuts them to a fifth, and `sway` adds a
    // slow lateral wander so they are moved BY something rather than travelling on their own.
    // Both default to no-ops (1 and 0), so every other chapter's dust is untouched.
    dust: { tint: 0x8a6f45, alpha: 0.45, speedMul: 0.2, sway: 5 },
    bgColor: 0xbca27a,     // damp warm sand between the floor blotches
    floorTint: 0xe0c79c,   // sun-bleached wash over the wrack and marram (see BIOME_SURF)
    playerTint: 0xffffff,
    tail: false,
    eliteIridescent: [0xbfe8ff, 0xffd9f2, 0xd9ffe8], // soapTrail elites, inherited with the pond's flag

    // YOU ARE STANDING IN THE WATER (owner, 2026-08-15: "a light blueish tint to make it more
    // obvious this is a bit underwater"). A flat wash of this colour over the whole world — see
    // waterWash in render.js for why it is a layer between the camera and the scene rather than a
    // recolouring of the floor, and for what deliberately sits above it.
    //
    // `add`, AND THAT IS THE WHOLE TRICK — arrived at by measuring the floor rather than by taste,
    // after three shipped-looking variants that all came out grey. The damp sand is (188,162,122):
    // its blue channel is its SMALLEST. Any overlay that only darkens — a normal blend toward blue,
    // a multiply by a cyan — pulls red and green down toward blue but can never lift blue past
    // green, so the floor's route to "blue" runs through grey and it stops at the grey. Shot at four
    // strengths and two hues before that was obvious in the arithmetic; adding light is the only
    // cheap operation that can make blue the dominant channel, and it is also the physical one, since
    // shallow water scatters skylight back up at you rather than filtering it out.
    //
    // The tint is therefore the light being ADDED, not the colour the floor becomes: a blue with
    // some green in it, because pure blue over warm sand goes violet.
    //
    // 0.36 is the strength at which the sand is still sand, bracketed on one identical frame: 0.16
    // is indistinguishable from no water at all, 0.28 reads wet, and 0.45 is where the sand is gone,
    // the sandbar has blown out to white and the chapter's whole contrast argument has gone with it.
    // Landed on 0.28 and taken up on the owner's "a tad bit more blue" — which is what this number
    // is for, since it trades "obviously wet" against a floor whose job is to keep three creatures
    // and two kinds of circle readable. The one number here that wants an eye rather than a rule:
    //   node scripts/fx-probe.mjs --scene scripts/scenes/surf-floor.js --chapter surf
    // puts both circles and the cast in one frame to judge it on, at either viewport.
    water: { tint: 0x0062dd, alpha: 0.36, blend: 'add' },

    // The light on the sea floor. Presence turns both the caustics and the player's wake on (see
    // CAUSTIC_VIS and WAKE_VIS) — one key means "this chapter is under water", so a later underwater
    // chapter gets the whole set by declaring it rather than by having three flags found for it.
    caustics: true,
  },
}
// Book 2 chapter 3 — THE FIRST LEFT-TO-RIGHT SCROLLER. Written as a WHOLE literal rather than
// `{ ...CHAPTERS.shelf }`, deliberately: the spread shares every nested object BY REFERENCE
// (CHAPTERS.shelf.obstacles === CHAPTERS.pond.obstacles is literally true in shipped code), and
// this chapter overrides every one of them anyway — so spreading would buy nothing but the standing
// risk that a later edit "modifies" one in place and silently rewrites The Twilight's. It also means
// The Twilight's `resource` (Light) and `signature` (sun shafts) do NOT leak in, which is the whole
// difference between a shell to build on and a copy of chapter 2 that scrolls.
//
// THE LANE, SIDEWAYS. `lane: true` is what The Beyond has always meant — the view auto-scrolls, you
// hold station on screen, and the joystick gives you nothing but the two directions ACROSS the
// corridor. `laneAxis: 'x'` is the only new thing: forward is +x instead of -y, so the reef streams
// past from the right and your strafe is up and down. Everything the lane already owns follows the
// axis through laneAxes() (config.js, beside laneHalfWidth): the walls, the ranks, the drifting
// rock, the leak line, the camera's trailing-edge anchor. `lane` stays the BOOLEAN true — sim.js
// compares it with strict equality in two places, so the direction had to be its own field.
//
// ⚠ EVERYTHING BELOW MARKED "borrowed" IS A STAND-IN, not a design. The chapter's own art, its two
// native weapons (Squid Ink, Oxygen Tank) and its signature mechanic are all later tasks; this
// exists so the x-lane is playable and testable today.
CHAPTERS.reef = {
  name: 'The Reef', tagline: 'the current only runs one way', icon: '🪸',
  lane: true,
  laneAxis: 'x',
  // 45 rather than the shared 70 — see laneScrollFor's block. Measured, not felt: on a 390x844 phone
  // an x-lane has only 312 world px ahead of the player against the y-lane's 675, so at 70 this
  // chapter would give HALF The Beyond's reaction time on the device the game ships to.
  laneScroll: 45,

  // BORROWED ARSENAL — placeholder until Squid Ink and Oxygen Tank land. Picked for the LANE rather
  // than for the theme, because a scroller only works if the starter can answer things arriving from
  // ahead: the stinger is a forward cone at the nearest enemy, the quill ring does not care which way
  // you face at all, and the Pulsar Sweep is the one weapon in the game that already knows what a
  // lane is (firePulsar anchors its fan to the chapter's forward heading instead of to nearestEnemy —
  // which is now this chapter's +x rather than The Beyond's -y, off the same laneAxes descriptor).
  weapons: ['stinger', 'quillBurst', 'pulsarSweep'], starter: 'stinger',

  // The cast. All three flags already exist in sim.js and are chapter-agnostic, so this roster is
  // real behaviour rather than a placeholder: the damselfish is the deliberately FLAGLESS baseline
  // (the same argument CHAPTERS.surf's roster makes — with a flag on all three, none of them reads
  // as special), the moray latches and slows you, and the lionfish pounces.
  //
  // Each has its own baked body in render.js's ROSTER_LOOKS (drawMoray/drawDamselfish/drawLionfish),
  // all three in PLAN VIEW, and each drawing telegraphs its flag: the moray's gape, the lionfish's
  // fan (which folds flat on the leap, off the pounce state machine), and the damselfish's plain
  // barred spindle. See that block for the palette argument.
  roster: [
    { id: 'damselfish', archetype: 'normal', name: 'Damselfish', hpMul: 1,   speedMul: 1,    flags: [] },
    { id: 'moray',      archetype: 'tank',   name: 'Moray',      hpMul: 2.2, speedMul: 0.7,  flags: ['latch'] },
    { id: 'lionfish',   archetype: 'fast',   name: 'Lionfish',   hpMul: 0.9, speedMul: 1.15, flags: ['pounce'] },
  ],
  eliteFlags: ['soapTrail'],   // the Undertow's own elite flag, shared with The Surf and The Shelf

  // AIR POCKETS. The signature carries no mechanic of its own — the LANE is this chapter's gimmick
  // — it carries the geometry of the one thing that refills the bar, in the same vocabulary as the
  // Shelf's shafts, the Surf's tide pools, the pond's eddies and the undergrowth's traps: `cell` is
  // the grid, `chance` a DIRECT per-cell occupancy probability, `r` the radius that is both drawn
  // and tested, `minDist` spawn-ring clearance from the run ORIGIN. refillSpec() finds it, so
  // streamShafts materialises it, render.js draws it and scripts/charge-probe.mjs measures it with
  // no chapter name anywhere in any of the three.
  //
  // `salt` is REQUIRED HERE and is the one field the other two refill specs do not set. Salts are
  // the streamers' anti-collision registry (sim.js, above obstacleCellHash): 0-4 obstacles, 11-14
  // eddies, 15-17 traps, 20-23 shafts/pools, 30-32 sandbars. A collision is SILENT — two fields
  // land in identical cells and it reads as "the mechanic spawns on top of the other one", never as
  // an error — so this chapter claims block 40, reserved for it in the Book 2 plan, rather than
  // inheriting streamShafts' 20 because it happens to be the function doing the streaming.
  //
  // THE REFILL IS A FIGHT, which §5.2 requires of every one of them, and here it falls out of the
  // arithmetic rather than being asserted. Jitter slack is cell/2 - r - 20 = 170, so a pocket's
  // centre sits at |cross| in [150, 490] and its inner edge at |cross| in [20, 360]: there is NO
  // pocket on the centre line. Taking one means committing to a side of a lane you cannot stop in,
  // while the scroll carries you through it in at most 2r/laneScroll = 5.8s and everything that
  // wants to kill you keeps arriving from ahead. Run RF.a pins the no-pocket-on-the-centre-line
  // property, because it is the whole of that claim and it is one bad `chance` away from being
  // false.
  signature: {
    type: 'air',
    pockets: { cell: 640, chance: 0.5, r: 130, minDist: 420, salt: 40 },
  },

  // AIR. Ambient drain, always — you are a fish carrying a lungful through a reef, and the clock
  // is the chapter. Refill ONLY at the pockets above; there is no second source and no passive
  // trickle, which is what makes the pockets worth crossing the lane for.
  //
  // A SLOPE, NOT A COUNTDOWN, which is the lesson The Surf's own resource block was rewritten
  // around: a bar that falls at a rate the player cannot argue with is a timer wearing a resource's
  // clothes. Here the argument is the pockets, and the check is that the two poles come out on
  // OPPOSITE SIDES of empty.
  //
  // MEASURED — scripts/charge-probe.mjs --chapter reef, 300s x 3 seeded runs, difficulty 1,
  // immortal. Its `kite`/`seek` policies CANNOT BE EXPRESSED IN A LANE (the stick has no forward
  // component here), so the probe grew two lane policies for this chapter and the pair is the
  // answer — `centre` holds the middle and never commits to a side, `pocket` steers at the nearest
  // reachable pocket ahead. Never quote one alone:
  //
  //   policy               mean  %at0  %atMax  %inPocket   the reading
  //   base centre hoard    12.2    76       0        0.0   ignore it and you drown
  //   base pocket hoard    88.1     0       9       21.2   work it and the bar cycles, 24..100
  //   base pocket full     18.3    28       0       26.3   ...and spend it on the button as well
  //   thief centre hoard   20.7    17       0        0.0   Light Thief roughly halves the drowning
  //   thief pocket hoard   96.0     0      15       17.6
  //
  // The two hoard rows are the headline: 76% of the run at zero against 0%, off the same tune, on
  // the same seeds, decided entirely by whether the player commits to a side of the lane. That is
  // the bar being a map rather than a clock, stated as a measurement instead of as an intention.
  // The `centre` row is not a strawman — %inPocket is exactly 0.0 because the jitter budget puts
  // every pocket's centre at |cross| >= 150, so a player who never leaves the middle physically
  // cannot touch one.
  //
  // ⚠ THE BUTTON AND THE SECOND JOB SHARE ONE BAR, and `pocket full` is where that shows: a player
  // who spends PULSE_CHARGE_COST (45 of 100, ~6s cooldown) whenever they can afford it drives the
  // bar into a 0..45 sawtooth and spends 28% of the run drowning. That is NOT this tune failing —
  // it is the same unresolved design question CHAPTERS.surf.resource records, and it is arguably
  // healthier here: on The Surf the cost is a damage multiplier nobody can feel, where here it is a
  // trade the player can name ("I spent my air on a dash, now I am drowning"). Light Thief is the
  // shipped mitigation and prices itself accordingly (28% -> 11%).
  //
  // killRefill 0.2 AND NOT THE SHELF'S 1.5, because the chapter kills six times as fast: the lane
  // runs two spawners and the probe measures ~4.8 kills/s here against ~0.8 on The Twilight. At 1.2 it
  // paid 5.8/s against a 1.4/s drain and simply ABOLISHED the bar — `thief centre hoard` pinned at
  // 100 with the player never touching a pocket, i.e. the purchase deleting the chapter's mechanic
  // rather than changing how it is played. Read a killRefill against its chapter's KILL RATE, never
  // against another chapter's number.
  //
  // `drown` is this bar's second job (§5.2): at empty you take drown.dps as damage over time until
  // you breathe. See DROWN_TICK's block for why it is a DoT and not a damage multiplier, and for
  // why it deliberately introduces no new event.
  //
  // killRefill is shop-gated exactly as The Shelf's and The Surf's are (meta.lightThief ->
  // run.killRefill at createRun), so the numbers above have to work with it at ZERO.
  resource: { name: 'Air', drain: 1.4, refill: 9, killRefill: 0.2, max: 100, drown: { dps: 4 } },

  // Coral heads: bigger than the pond's pebbles, far smaller than The Beyond's planets, and spaced
  // so you meet one every few seconds rather than a field of them.
  obstacles: { count: 8, cell: 620, minR: 70, maxR: 150, minDist: 420 },

  // THE CORAL IS SOLID, and only here. `stepObstacles` early-returns for every `lane` chapter, and
  // its comment names exactly what that protects: the radial push-out was shoving the player back
  // DOWN the lane on ~10% of frames, locally reversing the one constant the mode guarantees, and it
  // broke rank by shoving formations apart sideways. Both are still true, so this field turns
  // collision on under three restrictions rather than lifting the early return:
  //   1. THE PLAYER ONLY. Enemies keep passing through, so a marching rank still holds its shape —
  //      that half of the old comment is not a bug to be fixed, it is the reason ranks read as ranks.
  //   2. ACROSS THE LANE ONLY. The push-out resolves on the cross axis, so a wall may shoulder you
  //      sideways and can never move you along the lane in EITHER direction — not backward (the
  //      shipped bug) and not forward either, which would be a free Burst.
  //   3. ONLY WHERE YOU COULD HAVE GONE ROUND. A coral whose circle pokes out of the lane is
  //      scenery; solidity there would be a stretch of corridor with no gap, i.e. the structural
  //      trap §8.2 forbids, and it would fight the wall clamp for the player's position every frame.
  // ⚠ It is a per-chapter field and NOT a widening of `lane`, so The Beyond comes out bit-identical
  // — run LN is the proof, and it must stay a captured golden master rather than be re-baselined.
  laneSolid: true,

  // The button. See BURST_* above for the cast; the flag is here so the chapter reads as a set with
  // `lane` and `laneSolid` — the lane denies you the forward axis, the coral makes that denial cost
  // something, and this is what buys it back.
  burst: true,

  // ⚠ UNMEASURED FIRST CUT. It mirrors the step Book 1 takes from its own chapter 2 to its chapter 3
  // (pond -> garden: the damage and xp cushions come off, spawnMul +0.01, enemyHpMul +0.05,
  // maxAliveMul +0.10) applied to The Shelf's numbers, which is the same argument CHAPTERS.shelf's
  // own balance block makes for its position in the ladder. It has NOT been through a headless probe.
  // Read it alongside the lane's own pressure, which multiplies on top and is not in this table:
  // LANE_SPAWN_MUL thins the ordinary ring stream to 0.55 and stepFormations adds ranks beside it.
  balance: { spawnMul: 0.76, enemyHpMul: 0.95, maxAliveMul: 0.75 },

  // ---- render-only (ZERO sim effect) ----
  // DEEPER WATER THAN THE SHELF'S, ON PURPOSE. bgColor/floorTint are the pair render.js composites
  // into the "effective floor" every prop and creature is judged against (the model in
  // scripts/obstacle-contrast.mjs): slot 2 held WCAG luminance 0.210 as 0x18567f/0x9fd6f0 when it was
  // the light chapter, and holds roughly that rung as the murk chapter's 0x2e4f52/0xb6c9bd,
  // these land at 0.150 — one clear step darker, i.e. deeper water. That step is what buys the reef
  // its own identity, because the chapter's decor is WARM (coral reds, magentas, violets — see
  // BIOME_REEF in render.js) and warm decor needs a floor that is unambiguously cold and dark to sit
  // on. Keeping The Shelf's floor and only retinting the props would have read as The Shelf with red
  // weeds in it.
  //   ⚠ floorTint is a MULTIPLY, and it multiplies the PROPS too. At 0xa9cfe0 = (0.66, 0.81, 0.88)
  //   every warm prop tint loses a third of its red before it reaches the screen, so BIOME_REEF's raw
  //   tints are authored several steps hotter than the colour they are meant to end up as. Cool the
  //   tint further and the corals cannot read as coral at all; warm it and the water stops being blue.
  // form: 'fish' + formScale — ONE body serves all of Book 2 and grows a step per chapter (The Surf
  // leaves it at the default 1, The Shelf is 1.15 and The Twilight 1.62). playerTint MUST stay white with a `form`:
  // syncPlayer forces white for the body itself, but the level-up MINIME copies read this value
  // directly and a tinted one turns them into coloured ghosts of the fish (see CHAPTERS.surf.render).
  render: {
    // The chapter's own three, normal/fast/tank like every other card. These are baked into
    // src/cast/<id>.png by `node scripts/bake-cast.mjs` — hand-run, and nothing warns you if they
    // go stale, so re-run it whenever one of the three draw fns changes.
    cast: ['damselfish', 'lionfish', 'moray'],
    form: 'fish',
    formScale: 1.3,
    bgColor: 0x0a3358,
    floorTint: 0xa9cfe0,
    playerTint: 0xffffff,
    tail: false,
    // COOL, and deliberately so on the one warm chapter in the book. The iridescence multiplies the
    // creature's own bake, so a warm cycle on a warm reef is the one combination that could let an
    // elite melt into the coral behind it; aqua and mint cannot. A first cut ran coral/rose/aqua and
    // turned the elite damselfish — the chapter's only achromatic body — pink.
    eliteIridescent: [0xc4f0ff, 0xd9fff0, 0xffd9e8],
  },
}
// Book 2 chapter 4 — THE ONE BAR YOU PUSH UP. Written as a WHOLE literal for the same reason every
// chapter below is: `{ ...CHAPTERS.x }` shares every nested object BY REFERENCE, so an edit
// "modifying" this chapter in place would silently rewrite another one's.
//
// Every other resource in this game is a punishment meter. It sits full, and it costs you as it
// empties — slower, blinder, drowning. Bloodlust starts full, falls on a clock that nothing on the
// map can slow, and the ONLY thing that puts it back is killing. There is no refill circle anywhere
// in this chapter, which is what makes the book's own rule literal instead of merely satisfied:
// "a refill point is a place you can fight from, never a place you go to stop" — here the refill IS
// the fight, and there is nowhere to go.
//
// ⚠ NOT CALLED FRENZY, which is what it was designed as. `frenzy` is taken three times in this tree
// — the `frenzied` elite affix (FRENZY_HP_FRAC/FRENZY_SPEED_MUL), the flagella weapon mod
// `run.weaponMods.flagella.frenzy`, and `'Frenzy': 'Frénésie'` is ALREADY A KEY in fr.js, so a
// chapter resource under that name would silently inherit a weapon mod's French. `Blood` is nearly
// as bad: Blood Pact and Blood Money are both shipped anomalies and Blood Pact is itself
// +damage-per-kill. One grep before the first line of code, per CLAUDE.md.
//
// ⚠ PHASE 1 — IT PLAYS, IT DOES NOT YET LOOK LIKE A WRECK. The arsenal, the three creature bakes and
// the floor are BORROWED FROM THE REEF wholesale, exactly as The Reef and The Trawl each shipped
// borrowed. What is real here is the bar, the button, the starving and the roster's behaviour.
CHAPTERS.wreck = {
  name: 'The Wreck', tagline: 'stop and you starve', icon: '⚓',

  // ---- THE ARSENAL, AND EVERY CARD IN IT IS ABOUT REACHING FOOD THAT RUNS -----------------------
  // Owner, 2026-08-18: "the attacks must be changed to something more chapter related." They were
  // The Garden's needle cone and a generic mine, borrowed for their SHAPE against a fleeing target,
  // and shape was the wrong axis — a chapter reads by its nouns, and neither of those is a noun this
  // place owns. All three are now the wreck's own.
  //
  // Every other chapter's pool answers "how do I hurt the crowd". This one's crowd is food, and the
  // real problem is that it is faster than you and leaving. So the pool is a HERDING KIT:
  //   gnash  the mouth, and it now DARTS onto its target rather than snapping at where the fish
  //          was — see its own block for why a 78-98px reach was a defect in this chapter.
  //   chum   GATHERS. The one card in the game that turns something already running.
  //   bilge  WALLS. Prey will not enter it, so it is how you take an escape route away; everything
  //          that is not prey just slows in it.
  // Between them the chapter's verbs are close, gather, cut off — which is how anything actually
  // hunts a shoal, and none of it is a damage number.
  weapons: ['gnash', 'chum', 'bilge'], starter: 'gnash',

  // ---- THE ROSTER IS FOOD. This is the one chapter where "enemy" is a lie the code tells. ------
  // Owner, 2026-08-17: "about you, a shark, chasing after schools of fishes that run in fear.
  // Turning around the premise of the game."
  //
  // Two of the three carry `skittish`, which is one flag saying two things because they are one
  // design fact: it RUNS from you, and it CANNOT HURT YOU (contactHarmless, sim.js). Nothing on
  // this map is aiming at the player — the thing that kills you is the leak, below.
  //
  // ⚠ BORROWED IDS, STILL, AND DELIBERATELY. syncEnemies resolves a look as
  // `T.roster[rosterId] || T.enemies[archetype]` (render.js), so an invented id does NOT fall back
  // to a sibling fish — it falls back to the GENERIC BOOK 1 ARCHETYPE BLOB, which is three grey
  // blobs in an ocean chapter with nothing thrown. These three are baked and they are the right
  // three animals: mackerel are THE schooling fish, a damselfish is a small reef fish that scatters
  // over wreckage, and a moray is the animal that actually lives inside a sunken hull. The trawl
  // also fields a mackerel; a chapter reusing another's id is precedented all through this book.
  //
  // THE HUNT IS A TRIANGLE, and it falls out of shipped archetype speeds rather than being tuned:
  //   mackerel   90 x 0.85 x PREY_FLEE_MUL = 103 px/s. You outswim it. The staple, and the bar's
  //              whole income — this is why spawnMul goes up rather than the refill.
  //   damselfish 165 x 1.0 x PREY_FLEE_MUL = 223 px/s, i.e. FASTER THAN THE PLAYER'S 220. It cannot
  //              be caught by chasing it, at all, ever. It is what the Lunge button exists for, and
  //              it is the reason the button's cost/refill wash is the chapter's core loop rather
  //              than a nicety.
  //   moray      does NOT flee — no `skittish`, so it runs the ordinary seek and comes to you.
  //              Harmless (`dmgMul: 0`, honoured by contactHarmless), slow, fat, and worth
  //              `resource.tankRefill` of Bloodlust when eaten. It is the answer to "why is this
  //              not just holding the stick down": the prize you break off the chase FOR.
  //   ⚠ IT CARRIED THE CRAB'S `guard` UNTIL v7.x AND IT EARNED NOTHING. Measured over three 300s
  //              runs with the full kit: the shield refused 7.6% of bites — far too few to read as
  //              a timing puzzle — while 78% of morays never died at all and the bite was pointed
  //              at one on 32.8% of FRAMES, because aimAngle takes the nearest body and a creature
  //              that neither flees nor hurries is nearly always it. So the chapter's only damage
  //              source spent a third of itself on a sponge the player had not chosen, which is
  //              exactly what the owner reported: "they slow you down and clutter the screen".
  //              The counter is biteAim (sim.js), not a shield.
  // ⚠ WAVE_TABLE does not introduce `tank` until t = 140s, so that answer is absent for the first
  // half of a 300s run — the same gate CHAPTERS.deep's roster block records biting it too.
  //
  // `dmgMul: 0` MEANS IT, and contactHarmless is what makes that true: hurtPlayer floors every hit
  // at Math.max(1, ...), so before that clause existed the moray chipped 1 HP per touch and did 204
  // damage across three 300s runs — against the leak's 234, in the one chapter whose whole premise
  // is that the leak is the only thing that can kill you. The other two are disarmed by `skittish`
  // as well; the moray has no skittish, and now needs none.
  roster: [
    { id: 'mackerel',   archetype: 'normal', name: 'Mackerel',   hpMul: 0.55, speedMul: 0.85, dmgMul: 0, flags: ['skittish'] },
    { id: 'damselfish', archetype: 'fast',   name: 'Damselfish', hpMul: 0.4,  speedMul: 1,    dmgMul: 0, flags: ['skittish'] },
    // balance_decision : moray HP -40%, the chapter's kit is crowd control 2026-08-18
    //  - chum and bilge deal NO damage at all, so gnash is the entire damage budget all run
    { id: 'moray',      archetype: 'tank',   name: 'Moray',      hpMul: 1.32, speedMul: 0.7,  dmgMul: 0, flags: [] },
  ],
  eliteFlags: ['soapTrail'],   // shared with surf/shelf/reef/trawl. NOT the whole book: deep is webZone

  // 70% FEWER MORAYS. Owner ruling 2026-08-18: "70% less tanks (murènes)". The moray is the one
  // thing in this chapter that does not flee and cannot be eaten on demand, so it is the chapter's
  // texture — and at WAVE_TABLE's stock tank share it was the texture rather than the accent.
  //
  // `archetypeMul`, NOT a roster `weight`, and the difference is load-bearing: spawnEnemy picks the
  // TYPE first and only then narrows to the roster entries wearing it, so weighting a chapter's one
  // and only `tank` is a weighted pick over a one-item pool — a silent no-op. See waveWeights.
  // Weights are relative, so the 0.7 the moray gives up is handed to the mackerel and the damselfish
  // and the total spawn count is untouched; this makes the field MORE prey, not emptier.
  archetypeMul: { tank: 0.3 },

  // THE LEAK. Owner ruling 2026-08-17, and it REVERSES the ruling taken earlier the same day —
  // "being an aggro level is sufficient", i.e. signature: null — because the premise moved under it.
  // That ruling was correct for a chapter whose crowd was hunting you. Once the roster became food,
  // "the gimmick IS the bar" left a chapter with no way to lose except a tempo failure, and the
  // owner's own question was the right one: "do sharks have predators? We could add traps maybe,
  // human traps, or pollution?"
  //
  // Pollution, not traps, and the reason is a noun rather than a mechanic: The Trawl is the net, one
  // chapter later, and two adjacent chapters whose hazard is human gear tangled in the water are one
  // chapter told twice. This is the book's own line made literal instead — "the boat IS the
  // pollution", dead industry here and living industry next door.
  //
  // See SLICK_* above for the numbers and for why this rides refillCircleAt but lives in run.slicks
  // rather than run.shafts.
  // 120° — see the TIDE block for how the six bearings are spread.
  tide: tideAt(120),
  signature: {
    type: 'leak',
    // chance/cell together set how much of the floor is poisoned. 0.34 of a 900px cell at r 190
    // covers roughly a tenth of the plane — enough that a straight line across the map usually
    // meets one and never enough to wall a route off, which is the whole difference between a
    // hazard you route around and a hazard you resent. ⚠ UNMEASURED FIRST CUT.
    // `blob: true` because a spill has an outline and a bubble does not: LOBE_SHAPES is the same
    // lobed-outline opt-in The Surf's tide pools use, and sim and render both read the stored
    // shape/rot rather than re-deriving it (the documented way those two drift apart).
    slicks: { cell: 900, chance: 0.34, r: 190, minDist: 620, salt: 50, blob: true },
  },

  // BLOODLUST. Ambient drain, always, everywhere — no sandbar makes it worse and no place makes it
  // better, because there is no place. `refill: 0` is load-bearing rather than a default: there is
  // no field for refillSpec() to find, so stepCharge's shaft loop never fires and The Trawl is the
  // precedent for a `resource` chapter with nothing to stand in.
  //
  // `killBase` IS THE CHAPTER. It is the per-kill refill that is NOT shop-gated — every other
  // chapter's kill refill is Scavenger's and reads 0 on an unbought save (owner ruling: "none by
  // default, only via the shop"). That rule cannot hold here, because a bar with no field and no
  // baseline kill refill has no refill at all. Scavenger still stacks on top via `killRefill`.
  //
  // THE DAMAGE LINE IS ENTIRELY ABOVE 1.0, which is the opposite of Humidity's and is what makes
  // this the one bar that pays rather than taxes. §5.3's licence was spent on a multiplier whose
  // BOTTOM was 0.7; this one's bottom is exactly baseline, so an empty bar deals precisely what the
  // rest of the game deals. That is the anti-spiral: hesitating makes you slower to kill and never
  // weaker than a player in any other chapter, so "I stopped killing" cannot compound into "I can no
  // longer kill". The same line drives fire rate through `rate`.
  //
  // `starve` is this bar's second job, and it is DROWNING'S MECHANISM ANSWERING THE OPPOSITE
  // PROBLEM — see STARVE_TICK's block for why that duplication is deliberate.
  //
  // ⚠ EVERY NUMBER ON THIS LINE IS A GUESS AND MUST NOT BE QUOTED. drain 5.0 empties a full bar in
  // 20s; killBase 5 holds it steady at exactly 1 kill/s — and NOBODY KNOWS THIS CHAPTER'S KILL RATE,
  // because until this commit the chapter did not exist. CHAPTERS.reef.resource's own block is the
  // worked example of what reading a refill against the wrong chapter's kill rate does (1.2 here
  // ABOLISHED the bar there). The gate is scripts/charge-probe.mjs on this chapter, both movement
  // policies, with the drain/killBase pair fitted to what it measures.
  resource: {
    // `drainPerSpawn`, NOT `drain` — see stepCharge. The drain rides the same curve the crowd
    // arrives on, because this is the only bar in the game fed by kills and the kill rate is not a
    // constant (0.5/s at t=0 to ~15/s at t=280).
    //
    // ⚠ REFITTED FOR THE PREY REWORK, AND THE OLD NUMBER WAS MEASURABLY WRONG. 4.5 was fitted when
    // this chapter's spawnMul was 0.95; at 2.2 the same constant more than doubles the drain. Worse,
    // the rig that produced that fit could not see this chapter at all — every movement policy in
    // charge-probe.mjs modelled a player being CHASED, and this crowd runs away, so all of them
    // measured a player who never eats. WRECK_MOVES (`hunt` against `ignore`) exists because of
    // that, and this table is off it:
    //      drainPerSpawn    hunt: mean / at-zero     ignore: mean / at-zero     separation
    //           1.0             66.9 /  20%              52.8 /  23%              1.27x
    //           1.6             56.8 /  29%              40.0 /  28%              1.42x
    //           2.4             51.6 /  38%               9.6 /  58%              5.38x
    //           4.5             25.4 /  51%               4.9 /  76%              5.18x
    //   (base save, hoard spend, 3 seeds x 300s, immortal, `hunt` and `ignore` from WRECK_MOVES.)
    //
    // THE COLUMN THAT DECIDES IT IS THE SEPARATION, not either bar on its own — this chapter's
    // thesis is "stop and you starve", so what has to be true is that ENGAGING pays and STANDING
    // OFF does not. At 1.6 it barely does: a player who never closes still holds a mean of 40
    // against a hunter's 56.8, which is a chapter about hunting where hunting is worth 40% more.
    // At 2.4 the same comparison is 9.6 against 51.6 — engage and you are strong, stand off and the
    // bar is gone — while a hunter still only sits at zero 38% of the time, against 4.5's 51%.
    // 4.5 buys no more separation and simply starves the player who is doing the right thing.
    // ⚠ 2.4 IS A MEASURED VALUE, not an interpolation between two that were. It was also very
    // nearly skipped for wall-clock, and 1.6 was briefly committed in its place; the sweep's own
    // table is why that is not what shipped. Do not re-tune this from three of the four rows.
    //
    // ⚠ ONE STRUCTURAL FINDING THE FIT DOES NOT ADDRESS, recorded because it is an owner decision
    // and not a knob: break-even RISES with spawnRate(t) (~30x over a run) while the achievable kill
    // rate does not — it is bounded by weapon dps and by how fast you can physically reach a fleeing
    // fish. At EVERY value swept the per-10s trace has the same shape: pinned at 98-100 for the
    // first ~140s, then zero for the last third, whatever the player does. The constant only slides
    // where that cliff falls; it cannot make the bar cycle. That is not a death spiral — the damage
    // floor is 1.0, so an empty bar deals exactly what the rest of the game deals — but the bar's
    // upside is front-loaded and the final minutes cannot be influenced. Damping the law (a cap, or
    // a sub-linear power on spawnRate) is the fix if that is not wanted, and it is not a change to
    // make unasked.
    // tankRefill (v7.x): what a MORAY is worth, on top of killBase, and the whole reason to break
    // off a chase for one. Sized against the bar rather than against the kill: at 30 of a 100 bar
    // it is three ordinary fish and change, which is enough to be a decision and short of the full
    // bar Gorge pays for an elite — the elite must stay the bigger prize.
    name: 'Bloodlust', drainPerSpawn: 2.4, refill: 0, killBase: 5, killRefill: 2, tankRefill: 30, max: 100,
    damage: { floor: 1, peak: 1.8 },
    rate: { floor: 1, peak: 1.5 },
    // 4, not 5, and the reason is arithmetic rather than balance: hurtPlayer ROUNDS a dot hit, so
    // 5 x STARVE_TICK 0.5 = 2.5 -> 3, i.e. a config saying 5 and a game doing 6. STARVE_TICK's own
    // block states that the cadence exists so the config number survives the multiply, and then the
    // first number written against it did not. 4 x 0.5 = 2 exactly, as DROWN_TICK's own dps 4 does.
    starve: { dps: 4 },
  },

  // Hull plates, ribs and spilled containers. Scenery with collision, in the shipped streamed-circle
  // field — it is what makes the place read as a wreck rather than as open water, and it is not a
  // mechanic. Sized between the reef's coral heads and nothing at all.
  obstacles: { count: 9, cell: 640, minR: 55, maxR: 120, minDist: 420 },

  // The button. See LUNGE_* above for the cast.
  lunge: true,

  // ⚠ UNMEASURED FIRST CUT. This is by a wide margin the densest and softest table in the game
  // (reef 0.76/0.95/0.75, trawl 0.8/1/0.85, and the previous cut of THIS chapter 0.95/0.9/0.95),
  // and every one of those four numbers is a consequence of the roster being food rather than a
  // difficulty statement:
  //   spawnMul 2.2    "very numerous" is the owner's word and it is the picture the chapter is for.
  //                   It is also arithmetic: prey RUN, so a given fish is in reach for a fraction
  //                   of the time an enemy that walks at you would be. A field tuned for a crowd
  //                   that closes is a thin field once it turns and leaves.
  //   enemyHpMul 0.45 x the roster's own hpMul, so a mackerel lands at ~5 HP — one bite, no
  //                   chewing. A bait ball that takes two hits per fish is not a bait ball, it is a
  //                   wall of HP wearing fish sprites.
  //   maxAliveMul 1.55 -> 620 concurrent. Held under a doubling ON PURPOSE and it is a perf number
  //                   as much as a design one: this has not been profiled on a phone, and fleeing
  //                   bodies spread out (cheaper separation) but also stay alive longer.
  //   xpMul 0.5       the kill count roughly triples; level pace should not.
  // ⚠ THE RESOURCE BLOCK ABOVE WAS FITTED TO THE OLD CHAPTER AND IS NOW LYING. drainPerSpawn is
  // denominated in spawnRate(t), so raising spawnMul to 2.2 raises the DRAIN 2.3x by itself, while
  // the kill rate moves by some other factor entirely. Re-run scripts/charge-probe.mjs before any
  // balance claim about this chapter leaves the branch — that is the same gate the previous cut
  // wrote for itself, and the premise change invalidated its answer.
  balance: { spawnMul: 2.2, enemyHpMul: 0.45, maxAliveMul: 1.55, xpMul: 0.5 },

  // ---- render-only (ZERO sim effect) ----
  // formScale 1.42 is the book's growth arc and is NOT a shark: owner ruling 2026-08-17, asked
  // directly whether The Wreck should take the shark identity from The Deep (which owns it — 1.7,
  // `finHit`, "the shark's own body"). He kept the arc: "predator, not literally a shark". So this
  // chapter is where you START hunting rather than reacting, one step bigger than the reef fish
  // (1.3) and one step under the big fish (1.55). The premise inversion is in the roster and the
  // bar, not in the body.
  render: {
    cast: ['mackerel', 'damselfish', 'moray'],
    form: 'fish',
    formScale: 1.42,
    // THE SUNKEN SHIP. Owner, 2026-08-17: "there is no sunken ship asset or design in the level",
    // and "I'd like a big sunken ship behind with parallax effect".
    //
    // He was right twice over — the chapter shipped with `wreck: BIOME_REEF` in render.js, so the
    // nine obstacles this block calls hull plates drew as CORAL HEADS AND SEA WHIPS, and there was
    // no ship anywhere at all. BIOME_WRECK (render.js) fixes the first half; this fixes the second.
    //
    // WHY PARALLAX IS COHERENT IN A TOP-DOWN GAME, since the camera looks straight down and every
    // sprite in this repo is a plan view: a layer that scrolls SLOWER than the world reads as
    // further from the camera, and further from a downward camera means DEEPER. So the hull is not
    // "behind" in the side-scroller sense — it is a wreck lying on a terrace below you, seen
    // through the water you are swimming in. That is why it is hazed and desaturated rather than
    // drawn at full strength, and it is why it must stay UNDER the floor decor: silt settles on top
    // of a wreck, not under it.
    //
    // A GRID, NOT ONE SHIP, and that is the only honest answer on an infinite map. A single hull at
    // the run origin is a landmark you swim away from in twenty seconds, after which the chapter is
    // called The Wreck and has no wreck in it. `cell` is deliberately huge so two are never on
    // screen together and the repeat cannot read as tiling; variant and rotation are hashed per
    // cell off the run's own obstacle seed, like every other streamed field here.
    // ⚠ EVERY NUMBER BELOW WAS CORRECTED FROM A SCREENSHOT, and the first cut was wrong in the two
    // ways this repo keeps being wrong about art: it was invisible, and it was the wrong size.
    hull: {
      // 1250, DOWN FROM 2200, AND THE REASON IS A SHAPE MISMATCH RATHER THAN A TASTE CALL. The grid
      // is square and a hull is not: at 950 x 205 in a 2200 cell it covered 43% of the span across
      // its length and 9% across its beam, so the chance of one intersecting the viewport at all
      // was about one frame in twenty-five. On screen that is a chapter with no wreck in it, which
      // is precisely the report this whole change answers. Measured off the frames, not reasoned.
      // Owner, 2026-08-18: "boats should be wayyyy bigger." cell tracks len at ~1.35x so a bigger
      // hull does not simply overlap its neighbour — the grid spacing and the object's own length
      // are one decision, and moving either alone is how a graveyard turns into a pile-up.
      cell: 2450,
      chance: 0.8,       // under 1 so the field reads as a graveyard rather than as a lattice
      parallax: 0.45,    // fraction of camera motion the layer takes. 1 = welded to the world, 0 =
                         // pinned to the screen. Under 1 = deeper. Far under and it reads as a
                         // painted backdrop that slides, which is the failure mode to shoot for.
      // 1820. THE EARLIER CUT TO 620 FIXED THE WRONG HALF OF THE PROBLEM. At 1560 the hull read as a
      // pale slab, and the diagnosis — "a landmark has to FIT" — was wrong: what actually failed was
      // that all its detail sat at the bow and the stern, so the crop a player really sees was empty
      // fill. That was fixed separately by making the structure CONTINUOUS (spine, deck rails,
      // evenly spaced transverse frames), and once a crop reads as built, size stops being the
      // constraint and starts being the point. Owner: "boats should be wayyyy bigger."
      // 1820 is ~45x the player's own body and about two phone-screens down its length.
      len: 1820,
      // Lighter than the floor, not darker: underwater, distance makes a thing PALER and BLUER,
      // because the water column between you and it scatters light in. The first cut used 0x14242c
      // on the reasoning that dead steel is dark and it vanished completely.
      // ⚠ THEN IT OVERSHOT. 0x54737d at alpha 0.6 was the BRIGHTEST thing in the chapter, and a
      // backdrop that wins the frame is not a backdrop — it read as a pale wall rather than as
      // something deep. This pair is the third reading, and the rule it follows is that the hull
      // must be clearly separable from the floor and clearly quieter than the roster.
      tint: 0x486a74,
      alpha: 0.34,
    },
    // The bar's tell. Opt-in per chapter so pHot keeps meaning "berserk" everywhere else — see
    // LUST_TINT_MAX. Render-only, like everything in this block.
    lustTell: true,
    // ITS OWN PALETTE AT LAST — this block used to be The Reef's, borrowed whole and labelled
    // "phase 2" for the day someone gave the chapter a floor. A wreck sits on SILT, not on clean
    // sand and not on coral, so the tint carries a green-grey cast its two neighbours refuse: The
    // Reef is warm and saturated, The Trawl is clean open blue, and this is the murk between them.
    // Effective floor (bgColor x floorTint, the obstacle-contrast.mjs model) lands between the two,
    // which is the book's depth ladder — reef #06294d, HERE, trawl #021732.
    // ⚠ Re-run scripts/obstacle-contrast.mjs after touching either number: BIOME_WRECK's steel is
    // the palest obstacle family in the book and it is the one that has to stay clear of the roster.
    bgColor: 0x082a44,
    floorTint: 0x9ec4b8,
    playerTint: 0xffffff,
    tail: false,
    eliteIridescent: [0xc4f0ff, 0xd9fff0, 0xffd9e8],
    // Silt, not marine snow: heavier and slower than The Trawl's, because this is bottom sediment
    // stirred by a crowd of fish rather than detritus falling from the surface.
    dust: { tint: 0xbfae94, alpha: 0.3, speedMul: 0.12, sway: 5 },
  },
}
// Book 2 chapter 5 — THE ONE THING THAT IS NOT AIMING AT YOU. Written as a WHOLE literal for the
// same reason CHAPTERS.reef and CHAPTERS.surf are: `{ ...CHAPTERS.x }` shares every nested object BY
// REFERENCE (CHAPTERS.shelf.obstacles === CHAPTERS.pond.obstacles is literally true in shipped code),
// so a later edit "modifying" this chapter's balance or weapons in place would silently rewrite
// another chapter's.
//
// You are a big fish in open water and the humans are back, as industry. Everything else in this
// game is pointed at the player — the swarm seeks, the gull picks a target, the artillery leads you.
// The net does not know you exist. It crosses on a timer, it kills whatever is in it, and it is the
// only threat in Book 2 you cannot make a mistake in front of, because it is not watching.
//
// ⚠ THE NATIVE ARSENAL IS OWED. Longline and Net Toss (spec §7) are not built; the three weapons
// below are BORROWED STAND-INS, exactly as The Reef shipped with three of them. The school-as-barrier
// mackerel (spec §6.4) and the drifting bags that silence the button (§4) are owed too. Everything
// else here — the net, the wake, Feed, the tire, Breach — is real.
CHAPTERS.trawl = {
  name: 'The Trawl', tagline: 'the net is not aiming at you', icon: '🎣',

  // The `normal` lane is the deliberately FLAGLESS baseline, the same argument CHAPTERS.surf and
  // CHAPTERS.reef make in their own rosters: with a flag on all three, none of them reads as
  // special. Here it is also a placeholder with a name — spec §6.4 wants the mackerel to be a
  // SCHOOL, one moving obstacle with a shape rather than a boids pass, and that is not built. It is
  // a plain open-water chaser today and it is the one entry in this chapter that is a stand-in.
  //
  // The tuna's speed is the point of the tuna: it is the fastest fish in the ocean, and this is the
  // chapter where the player's own speed is the resource. Meeting something that is simply quicker
  // than you while your Feed bar is low is the chapter stating its thesis with a creature.
  roster: [
    { id: 'mackerel', archetype: 'normal', name: 'Mackerel', hpMul: 1,    speedMul: 1.05, flags: [] },
    { id: 'sealion',  archetype: 'tank',   name: 'Sea Lion', hpMul: 2.4,  speedMul: 0.85, flags: ['pounce'] },
    { id: 'tuna',     archetype: 'fast',   name: 'Tuna',     hpMul: 0.95, speedMul: 1.25, flags: ['dashBurst'] },
  ],
  eliteFlags: ['soapTrail'],   // the Undertow's own elite flag, shared with the other three

  // THE NET. See the TRAWL_* block for the geometry (an infinite line, because a streamed world has
  // no edges for a wall to span) and for why 75 px/s is the one number here with a derived band.
  // This block carries only what is per-chapter: how often a pass comes, and how deep the wake it
  // leaves is. Everything else about a net is the same net.
  //
  // The signature is ALSO the refill geometry, which is unique in the book and is the whole design:
  // The Shelf's shafts, The Surf's pools and The Reef's pockets are all PLACES, so refillSpec() finds
  // them and the same streamer materialises all three. There is no place here. The only food in the
  // chapter is the churn behind a wall moving at 75 px/s, so the bar can only be filled by riding
  // alongside the thing that kills you. refillSpec() returns null for a `trawl` signature with no
  // special case (it looks for shafts/pools/pockets and finds none), and stepCharge asks inWake().
  //
  // NO NUMBERS IN THIS BLOCK, deliberately: every other signature carries its own geometry because
  // several chapters share a mechanic and tune it differently, where a net is the same net and only
  // one chapter has one. They live in the TRAWL_* block with the rest of the wall's constants. Note
  // that block sits BELOW this one in the file, so pulling one in here would be a TDZ throw at
  // import — see HUMIDITY_DMG_FLOOR above CHAPTERS for the one value that genuinely needed hoisting.
  // 45° — see the TIDE block for how the six bearings are spread.
  tide: tideAt(45),
  signature: { type: 'trawl' },

  // FEED, and the second job is SPEED (§5.2's table: five bars, five different axes — output, sight,
  // survival, mobility, perception; this is mobility). At the bottom of the bar you tire, and in this
  // chapter specifically that means the net catches you. The bar's second job and the signature are
  // the same sentence, which is the strongest version of §5.2's rule in the book.
  //
  // `tire` reads through tiredness() (see barRamp), the same curve The Shelf's dark runs on: a ramp
  // that starts at `from` and reaches full at empty, NOT a cliff at zero. A cliff at exactly 0 gives
  // the player no warning and no way to trade, where a ramp starting at 45% of the bar is something
  // you can watch arriving and decide about — which is the same argument the dark's own block makes
  // for its threshold, and it is worth more here because the consequence is a wall.
  //
  // speedFloor 0.62 IS ALSO THE NUMBER THAT MAKES THE NET CATCHABLE, and that pins it rather than
  // leaving it to taste: base speed is 220, so a fully tired player moves at 136 px/s against a
  // 75 px/s net. That is still faster than the net — running dry must never be an unrecoverable
  // trap (spec §8.2) — but the margin falls from 145 px/s to 61, i.e. outrunning the wall stops
  // being free and starts being the only thing you are doing. The Surf's sandbar floor is 0.62 too,
  // and that is not a copied number: both are "you can still move, and you will not like it", and
  // keeping them equal means a player who learned the feel in chapter 1 recognises it in chapter 4.
  //
  // MEASURED — scripts/charge-probe.mjs --chapter trawl, 300s x 3 seeded runs, difficulty 1,
  // immortal. Its `kite`/`seek` policies CANNOT BE EXPRESSED HERE (they both walk toward the nearest
  // entry of run.shafts, which is permanently empty in this chapter), so the probe grew a third
  // movement family for it and the TRIO is the answer — never one row alone:
  //
  //   policy               mean  %at0  %atMax  %inRefill   the reading
  //   base ignore hoard    17.3    41       0       13.6   the wake washes over you and it is not enough
  //   base flee   hoard     6.4    87       0        0.0   outrun the net and you eat nothing at all
  //   base ride   hoard    71.8     0      22       43.9   work it and the bar cycles, 23..100
  //   thief ignore hoard   37.1    16       1       10.8   Light Thief roughly halves the starving
  //   thief flee  hoard     9.0    45       0        0.0
  //   thief ride  hoard    80.5     0      34       44.3
  //
  // THE SHAPE IS THE EVIDENCE, not the mean — `ride hoard` samples every 10s of run 1 read
  //   74 100 100 89 63 37 52 100 93 67 41 42 100 97 71 45 31 95 100 75 49 23 85 100 80 54 28 74 100
  // which is a bar CYCLING with the passes: it fills as the net goes by and drains until the next
  // one, 23..100, never resting at either end. `flee hoard` on the same seed is
  //   74 48 22 0 0 0 0 0 0 0 0 0 0 0 ...
  // for the remaining 280 seconds. A mean cannot tell those two apart from a bar pinned mid-range,
  // which is why the probe prints the trace and why this block quotes it.
  //
  // ⚠ `ignore` IS THE ROW THAT SET THE DRAIN, and it is why this chapter's drain (2.6) is the
  // highest in the book against The Shelf's 2.2 and The Reef's 1.4. Every other Book 2 refill is a
  // place you must go to; this one MOVES, so it sweeps over a player who never engages, free, for
  // TRAWL_WAKE_DEPTH / TRAWL_SPEED = 5.6s per pass. At the first tune (drain 1.1, refill 14) that
  // paid for the whole run and `ignore` came out at a mean of 80/100 — the mechanic rewarding a
  // player who never looked at it. The knob grid that fixed it swept drain x refill over 12 cells
  // against a stated predicate (ignore mostly at zero, ride high and stable, flee worst), and two
  // cells passed; this is the one with the wider separation.
  //
  // The food also ARRIVES IN BURSTS rather than being continuously available — six passes in 300s,
  // against a pocket field you can steer into whenever you like — which is the second reason the
  // drain is high: with a bar that only empties slowly, a burst economy would never bite.
  //
  // killRefill 0.4, and it is NOT the number that "sits between" the other chapters — read a
  // killRefill against its OWN chapter's kill rate, exactly as The Reef's block insists. This
  // chapter runs ~4 kills/s, so at The Shelf's 1.5 it would pay 6/s against a 2.6/s drain and simply
  // ABOLISH the bar. At 0.4 the thief rows above still order correctly (ride 80.3 > ignore 40.1 >
  // flee 8.8) and no policy pins at max, which is the test: the purchase must change how the chapter
  // is played, never delete it.
  resource: { name: 'Feed', drain: 2.6, refill: 9, killRefill: 0.4, max: 100, tire: { from: 0.45, speedFloor: 0.62 } },

  // The button. See BREACH_* for the cast. The flag sits here beside `signature` because the two are
  // one design: the net is the chapter's problem and this is the only answer to it that is not
  // "swim faster".
  breach: true,

  // NOTHING TO HIDE BEHIND. Open water is the point — the net spans everything, and furniture would
  // offer cover from a hazard that is not aiming at you anyway, which is a promise the geometry
  // cannot keep. Same `null` The Body and The Surf use; streamObstacles early-returns on a falsy cfg
  // so run.obstacles simply stays [].
  obstacles: null,

  // ⚠ UNMEASURED FIRST CUT, exactly as The Reef's was, and stated so rather than implied. It is one
  // step up from The Reef's on the ladder Book 1 walks between its own chapters 3 and 4. Read it
  // knowing the net is NOT in this table and takes a real bite out of the crowd on every pass — the
  // first probe of this chapter should measure how much, because if the net is doing the thinning
  // then spawnMul is the wrong knob and maxAliveMul is the right one.
  balance: { spawnMul: 0.8, enemyHpMul: 1, maxAliveMul: 0.85 },

  // ---- the arsenal. The chapter's problem is that you spend it running in a straight line with the
  // crowd behind you and a wall periodically making you turn, so what the gear has to do is keep the
  // pack OFF you and STILL — the chapter's own net does the executing.
  //   longline — the starter. A fence set between you and the pack; see WEAPONS.longline.
  //   netToss  — the pack held where it stands, for the wall to arrive into.
  //   hole     — swallows the swarm. The one borrowed slot, kept because a vortex is the third
  //              answer to a crowd (move it) that neither native gives, and because it is ABSTRACT.
  //
  // ⚠ THE BORROWED SLOT IS CHOSEN FOR ITS SPRITE AS WELL AS ITS SHAPE, which is not usually a weapon
  // criterion and is one here because a borrowed weapon brings its old chapter's ART with it. The
  // first cut of this list opened with the Boomerang, on the honest reasoning that "out along a line
  // and back" is Longline's shape one weapon early — and the first probe frame of the chapter came
  // back with an ORANGE MAPLE LEAF spinning through the open ocean, because T.boomerang is baked as
  // a leaf and the card is called Boomerang Leaf. A vortex carries no biome with it. Check the
  // sprite, not only the shape, when borrowing.
  weapons: ['longline', 'netToss', 'hole'], starter: 'longline',

  // ---- render-only (ZERO sim effect) ----
  // DEEPER AGAIN. The book's floors step down one measured stop per chapter (obstacle-contrast.mjs's
  // model — mean blotch x floorTint over bgColor): slot 2 at ~0.210, The Reef 0.150, and this one
  // lands lower still, which is what "no bottom in sight" has to mean in a game that always draws a
  // floor. The Deep gets the bottom of that ladder, so this stops short of it deliberately.
  //
  // WHAT IS ON THE FLOOR IS RUBBISH (spec §4 — this chapter's pollution is "bags at mid-water, the
  // boat's discharge"). Read as the discharge that has already settled: bags, netting scraps and
  // sunken litter, dark and low-contrast so it reads as junk lying far below you rather than as a
  // seabed you are walking on. See BIOME_TRAWL in render.js.
  // ponytail: prop DENSITY is a global constant (the big/mid/detail cells in render.js), so "sparse"
  // here is bought with tint and alpha rather than with count. SKIES_FLOOR_KEEP is the shipped knob
  // for thinning a chapter's floor and it is gated on `chapterHasDistricts`; generalising it is the
  // upgrade path if this floor ever reads as too busy.
  //
  // form: 'fish' + formScale 1.55 — ONE body serves all of Book 2 and grows a step per chapter
  // (Surf 1.0, Shelf 1.15, Reef 1.3, here 1.55). playerTint MUST stay white with a `form`: syncPlayer
  // forces white for the body itself, but the level-up MINIME copies read this value directly and a
  // tinted one turns them into coloured ghosts of the fish (see CHAPTERS.surf.render).
  render: {
    cast: ['mackerel', 'tuna', 'sealion'],
    form: 'fish',
    formScale: 1.55,
    bgColor: 0x05203f,
    floorTint: 0x93b6cc,
    playerTint: 0xffffff,
    tail: false,
    // MARINE SNOW: the same ambient dust sprite every chapter shares, taken cold and near-white and
    // slowed almost to a stop. In open water the drift is the tell that you are suspended in
    // something rather than standing on it — The Surf's own dust block made the same move for the
    // same reason, and both default to no-ops (speedMul 1, sway 0) everywhere else.
    dust: { tint: 0xcfe0ec, alpha: 0.4, speedMul: 0.15, sway: 6 },
    // Cool, like The Reef's and for the inverse reason: this floor is cold and dark, so a warm
    // iridescence would be the one thing on screen the water cannot swallow. Kept in the family.
    eliteIridescent: [0xbfe8ff, 0xd9f2ff, 0xcfe8e0],
  },
}

// ---- Book 2 chapter 5: The Deep ---------------------------------------------------------------
// "You are the shark. Ships, containers and drums are the terrain. Humans cannot reach." The book's
// arc lands here: the humans who were the whole threat in The Trawl cannot follow you down, and what
// is left of them is wreckage on the bottom.
//
// A WHOLE LITERAL, never a spread. The Shelf and The Surf spread The Pond and both carry a warning
// about it, because a spread shares its nested objects BY REFERENCE — editing `signature` or
// `render` in place afterwards silently rewrites the chapter it was copied from. Written out, this
// chapter cannot reach into another one.
//
// THREE THINGS THE SPEC ASKED FOR THAT ARE NOT HERE, named rather than quietly dropped:
//   * Scent revealing BREAKABLE WEAK POINTS in the wreck field. The spec's own justification was
//     that it "reuses the Reef's crush path and Squid Ink's perception branch" — neither exists.
//     There is no weak-point system in this codebase (`crushable` is a skies flag meaning "an
//     aircraft, harmless on contact"), and Squid Ink is still unbuilt. Inventing a destructible-
//     terrain system to satisfy one clause of a button is how a chapter's scope doubles. The other
//     three things the owner's own framing names — see them better, hurt them more, close faster —
//     are all here.
//   * The Kraken. Design deferred by the owner, and it needs the generalisation The Blank's seven
//     hardcoded string literals never got.
CHAPTERS.deep = {
  name: 'The Deep',
  tagline: 'nothing up there can reach you',
  icon: '🦈',

  // THE DARKEST CHAPTER, and the one where the light finally matters. The rig is The Twilight's,
  // shipped and tuned — same `dark` block, same lightmap in render.js, same linear radius across the
  // whole bar. What changes is the numbers, and one of them is a mechanic:
  //
  //   speedFloor 1, i.e. NO SPEED PENALTY, unlike The Twilight. (The Shelf is also 1, for its own
  //   reason — its murk costs sight only. The chapter this contrasts with is the DARK one.) Deliberate, and it is the chapter's
  //   inversion: you are the apex predator here, so the dark does not slow the shark down — it
  //   only decides how much of the water you can SEE. Light does not stop being punishing; it stops
  //   being punishing in the same way twice. Spending it on Scent then BUYS speed (SCENT_SPEED_MUL),
  //   so in this chapter light is what makes you fast rather than dark being what makes you slow.
  //   Stacking a Shelf-style slow on top would also have been two penalties on one bar, against a
  //   roster whose whole job is that you cannot see it coming.
  //
  //   radiusFull 0.50 against The Twilight's 1.0. Both are MULTIPLES OF THE SCREEN'S LONGEST SIDE (the
  //   owner's spec, and the anchor three shipped attempts got wrong before it — see resource.dark in
  //   CHAPTERS.twilight for why the half-diagonal is the wrong ruler). At 1.0 the rim is off-screen at a
  //   full bar, which is right for the chapter called "the light only goes down" and wrong for the
  //   bottom of the ocean: here a FULL bar must still leave the screen CORNERS dark, which is what
  //   "the darkest chapter" has to mean if it means anything.
  //
  //   ⚠ THAT CLAIM IS AN INEQUALITY AND IT HAS TO BE CHECKED ON BOTH SCREENS, which is the whole of
  //   the v7.58 scar (a light measured on a phone, where it was right, and wrong on a desktop). The
  //   corners are dark only while radiusFull x longestSide < the HALF-DIAGONAL:
  //     phone   390x844  -> 0.50 x 844 = 422px against a 465px half-diagonal  ✓
  //     desktop 1280x800 -> 0.50 x 1280 = 640px against a 755px half-diagonal ✓
  //   The first cut shipped 0.62 with this same paragraph attached, and 0.62 x 844 = 523 > 465 — the
  //   light covered the phone's corners at a full bar and the comment asserted the opposite. Any
  //   raise above ~0.55 makes the sentence above false again on the narrower screen.
  //
  // `from` is inert while speedFloor is 1 (darkness() feeds only the speed multiplier — see
  // stepPlayerMovement), and is left at the Shelf's value so that turning the slow back on is a
  // one-number change rather than a re-derivation.

  // THE MAWS. A streamed field of anglerfish lying on the bottom, in the same vocabulary as The
  // Surf's tide pools and The Twilight's sun shafts — see the MAW_* block for why the chapter's refill
  // is a circle rather than a roster entry, and `type: 'dark'` above for the light itself.
  //
  // r 200 IS "SIZE 6" IN THE OWNER'S UNITS. The enemy cut it replaces topped out at radiusMul 6 =
  // a 96px body; a maw is the whole animal, so its jaws ring a 200px circle and the drawing spans
  // ~460px — comfortably wider than a phone screen. You do not see one coming, you arrive inside it.
  //
  // SPARSER THAN EVERY OTHER REFILL IN THE BOOK (chance 0.42 against the Shelf's 0.62, the Surf's
  // 0.77 and the Reef's 0.50), and a bigger cell with it. Two reasons and they point the same way:
  // this is the darkest chapter, so light has to be worth crossing the map for; and every one of
  // these is a decision to walk into a mouth, which stops being a decision if there is always
  // another one in sight.
  // ⚠ NO `drawdownSecs` (the one Book 2 field with none — see REFILL_ZONE_SPEND). A third of this
  // bar arrives at 2.4s inside a maw (16/s against a 2.0/s drain) where MAW_GAPE_T needs 3.2s, so a
  // drawdown would fade every mouth in the chapter out a second before it could close. Run DP.c went
  // red the day it was tried. The maw already takes itself away: it shuts for MAW_SHUT_T on a
  // swallow, which is this chapter's own version of a circle you can only use once.
  // 150° — see the TIDE block for how the six bearings are spread.
  tide: tideAt(150),
  signature: { type: 'dark', maws: { cell: 900, chance: 0.42, r: 200, minDist: 460 } },

  // THE BAR: Light. The maws above are the ONLY source — no shafts, no kill refill, nothing else on
  // the floor. That is what makes this chapter's refill "a place you can fight from, never a place
  // you go to stop": the refill point is a mouth that is closing.
  //
  // killRefill 0 is load-bearing and is the difference between this chapter and every other one in
  // the book. At any positive value the player tops the bar up by doing what they were going to do
  // anyway, and walking into a mouth stops being the only decision in the chapter.
  //
  // MEASURED: scripts/charge-probe.mjs --chapter deep, 300s x 3 seeded runs, immortal, under three
  // MOVEMENT policies — because one policy cannot tell "the bar cannot fill" from "this player never
  // went looking". The `full` spend row of each:
  //
  //   policy   mean  %at0  %DARK  %inMaw  devours   the reading
  //   ignore   10.0    48     99     7.8      0.3   never seek a lure and you spend the run blind
  //   feed     78.1     1      5    64.8      0.7   approach, take it, LEAVE before the mouth shuts
  //   greedy   12.0    50     99    49.5     46.7   never leave: eaten 47 times, and BLIND ANYWAY
  //
  // THE GREEDY ROW IS THE WHOLE MECHANIC, and it only reads this way because a devour zeroes the
  // bar. A player who refuses to leave spends HALF THE RUN inside a mouth — 49.5% against the
  // disciplined player's 64.8%, i.e. very nearly as much feeding — and ends on a mean of 12 against
  // 78, at 99% dark, because every few seconds the thing feeding them takes it all back. Greed does
  // not merely cost more than it earns here; it costs you the exact resource you were greedy for,
  // and it does it while looking like the row that is doing the most of the right thing.
  //   That is the shape the earlier ENEMY cut could not reach. There, greed bought a genuinely
  // better bar (mean 82.6 against 73.3) and paid in health alone, so the decision was a damage
  // trade the player could out-heal. Pricing the punishment in the chapter's own resource is what
  // makes it a trap rather than a toll.
  //   The `ignore` row is the CONTROL and answers "does this chapter have the dark from the chapter
  // before it": 99% of the run dark, a bar at 10 of 100, half of it pinned at empty. It does.
  resource: {
    name: 'Light', drain: 2.0, refill: 16, killRefill: 0, max: 100,
    dark: { from: 0.5, speedFloor: 1, dim: 1.0, radiusFull: 0.50, radiusEmpty: 0.06 },
  },
  scent: true,        // stepRepulse's third per-chapter branch, beside `burst` and `breach`

  // THE ROSTER, AND THE ANGLERFISH IS NOT IN IT. Owner, 2026-08-17: "the anglerfishes dont move,
  // they are not enemies, they are traps." It is `signature.maws` above — a streamed refill circle,
  // the same system The Surf's tide pools use — and the MAW_* block in this file says why at length.
  //
  // WHAT THAT COST, and it is the reason the deletion is worth a paragraph rather than a line: the
  // earlier cut held `normal` for a forced reason, and removing it un-forces that reason rather than
  // leaving a hole. spawnEnemy picks the WAVE_TABLE spawn TYPE first and only then narrows to the
  // roster entries wearing it, and WAVE_TABLE does not introduce `tank` until t = 140s — so as a
  // tank the chapter's only source of Light could not have existed for the first two and a half
  // minutes of a five-minute run. That whole trap simply does not apply to a streamed field: a maw
  // is on the map from t = 0 because streamShafts materialises it from the terrain seed, with no
  // archetype, no wave clock and no live cap to keep it from carpeting the floor.
  //
  // The three that remain still cover normal/fast/tank, which every chapter must — the tank share of
  // WAVE_TABLE from t=140s otherwise finds an empty pool. The gulper eel was added for exactly that
  // reason back when the anglerfish held `normal`, and it keeps the slot now for its own sake.
  roster: [
    // Slime is literally a patch it leaves behind, which is what webZone already is — the flag and
    // the animal are the same fact for once, rather than a behaviour borrowed onto a new skin.
    { id: 'hagfish',    archetype: 'normal', name: 'Hagfish',    hpMul: 1,   speedMul: 0.92, flags: ['webZone'] },
    { id: 'viperfish',  archetype: 'fast',   name: 'Viperfish',  hpMul: 0.9, speedMul: 1.08, flags: ['dashBurst'] },
    // The big slow mouth. `latch` for the same reason webZone suits the hagfish: a gulper eel that
    // grabs and holds is the flag and the animal being one fact rather than two.
    { id: 'gulper',     archetype: 'tank',   name: 'Gulper Eel', hpMul: 1.9, speedMul: 0.62, flags: ['latch'] },
  ],
  eliteFlags: ['webZone'],

  // The wreck field. Ships, containers and drums lying on the bottom — big and sparse, the Reef's
  // size class rather than the Shelf's, because the fantasy is swimming BETWEEN hulls rather than
  // around rocks. Plan view like everything else that is not a building: these are lying down.
  obstacles: { count: 9, cell: 700, minR: 62, maxR: 138, minDist: 400 },

  // One step on from The Trawl, the same size step Book 1 takes between its own chapters 4 and 5.
  // The dark is doing work the numbers cannot see — an enemy you meet at 200px is a different fight
  // from one you watched cross the screen — so the crowd is smaller here and hits harder rather than
  // being simply denser.
  balance: { spawnMul: 0.75, enemyHpMul: 1.15, enemyDmgMul: 1.1, maxAliveMul: 0.8 },

  // ---- the arsenal. One native and two borrowed, and BOTH BORROWS ARE ABSTRACT CASTS — the rule
  // The Trawl's own list block records after opening with a weapon whose sprite is a maple leaf.
  //   finHit        the native. The shark's own body; see WEAPONS.finHit.
  //   chitterShriek staggered violet panic rings (render.js) — a ring that hurts, shoves and panics,
  //                 aimed at nothing. In a chapter where you cannot see, a weapon that does not need
  //                 you to aim is the honest borrow, and a ring pulsing out of an animal in the dark
  //                 is echolocation whatever the card calls it.
  //   mines         a coral glow behind a red-pink diamond core (T.mine) — a planted light on the
  //                 sea floor of a wreck field, which is what it already looks like.
  weapons: ['finHit', 'chitterShriek', 'mines'], starter: 'finHit',

  // ---- render-only (ZERO sim effect) ----
  // The bottom of the descent. The floor steps down one more measured stop from The Trawl's, and the
  // dark tint goes as close to black as this book allows: the blue is what keeps it reading as depth
  // rather than as a screen fade (a UI event), and there is barely any of it left.
  render: {
    // The maw is NOT in the cast: `cast` is roster thumbnails (scripts/bake-cast.mjs bakes them
    // from ROSTER_LOOKS), and the anglerfish is no longer a roster entry. Its art lives in
    // T.maw instead — a whole animal ringing a 200px circle, which is not a 34px portrait.
    cast: ['hagfish', 'viperfish', 'gulper'],
    form: 'fish', formScale: 1.7,   // the shark: the biggest body the player has had
    bgColor: 0x03101d,
    floorTint: 0x6f8ea6,
    playerTint: 0xcfe6f2,
    tail: true,
    tailTint: 0x9fc4dc,
    eliteIridescent: [0xa8d8f0, 0xc9e4f4, 0xbcd6cc],
    darkTint: 0x000305,
    // The hagfish's slow patch is SLIME, not silk. `webZone` is a chapter-agnostic flag whose only
    // art was the garden spider's orb web, and the first probe frame of this chapter came back with
    // the abyssal plain under giant white spider webs — the loudest thing on a screen whose premise
    // is that there is almost no light. Render-only: the radius, the slow and the mechanic are
    // byte-identical to the garden's, and only the drawing changes (see syncWebs).
    webLook: 'slime',
    // Marine snow, thinner and slower than The Trawl's: less of it survives this far down, and what
    // does is falling through water nothing is stirring.
    dust: { tint: 0xb8ccdc, alpha: 0.28, speedMul: 0.1, sway: 4 },
  },
}

// THE DRAWDOWN, APPLIED TO THE WHOLE BOOK (owner, 2026-08-18 — see REFILL_ZONE_SPEND above). Written
// HERE rather than inside each chapter's literal because the seconds are derived from that chapter's
// OWN resource block, and a literal cannot reference a sibling key of the object it is inside. One
// place also makes the exemptions readable as a list rather than as three absences.
//   surf   — tide pools, exempt by the ruling itself ("except pools in 2-1"). The beach is scenery.
//   wreck  — no refill field at all; Bloodlust is fed by killing.
//   trawl  — its food is the net's wake, which is not a place and cannot be used up.
//   deep   — exempt: see the ⚠ at CHAPTERS.deep.signature. The maw already takes itself away.
for (const [id, spec] of [
  ['shelf', CHAPTERS.shelf.signature],                 // upwellings: was a flat 5s, now the book's rule
  ['twilight', CHAPTERS.twilight.signature],           // sun shafts
  ['reef', CHAPTERS.reef.signature.pockets],           // air pockets
]) spec.drawdownSecs = spendSecs(CHAPTERS[id].resource)

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

// ---- The Surf's three visible mechanics (v7.x Book 2, render.js) ----------------------------
// All three of the chapter's map mechanics shipped as SIM ONLY: the tide shoved you, the sandbars
// slowed and dried you, and the tide pools refilled Humidity, with nothing on screen for any of
// them. The design's own §6.1 asks this chapter to teach "the map is not neutral", and §5.3's named
// mitigation for letting the bar drive damage is that "the sandbar is a PLACE, so the player can
// always see the cause and step off it" — neither survives an invisible map. These are the numbers
// behind the three renderers, here rather than in render.js because every tunable in this repo is.

// The surge, drawn. The tide reuses the pond's flow-streak field (render.js updateCurrents) rather
// than inventing a second one — same pool, same fade envelopes, sampling tideForce(run) instead of
// currentForce(). Spread over CURRENT_VIS so only what the beach actually changes is stated here.
//   - speedMul 2.2 (vs the pond's 3.6): the tide's 46 px/s peak is already three times the pond's
//     ambient drift, so the pond's exaggeration would have the water outrunning the player.
//   - tint: pale blue-white foam, not the pond's green-cyan — this is the open surface, and the
//     floor it draws over is sand rather than weed.
//   - the streaks REVERSE with the surge, which is the whole point: a cue that only ever pointed
//     one way would read as a wind, not as a tide with a backwash.
//   - the streaks are BIGGER and far more opaque than the pond's, and that is not a taste call: the
//     pond's tint is a saturated teal-white on a dark murky floor, where this draws over pale sand.
//     Measured against the beach's effective floor (bgColor 0xbca27a, luminance ~0.38), the pond's
//     own 0.5 alpha lands a contrast of about 1.5x — under the >=2x the obstacle-footprint audit
//     asks of anything whose job is to be noticed. 0.72 on white takes it to ~2.0x. The first cut
//     shipped the pond's numbers and the surge was, on screen, a scatter of faint flecks.
// ⚠ THE CONTRAST ARGUMENT ABOVE INVERTED WHEN THE CHAPTER WENT UNDER WATER. White at 0.72 was
// picked to clear 2x against damp sand at luminance ~0.38; the floor is now a pale blue-white (an
// additive wash plus caustics on top of it), so those streaks stopped being foam and became grey
// lozenges scattered in rows — identified by ablating the layer, after reading the code had blamed
// the swell. Same lesson the dust look records one block up: a mark in the floor's own value is the
// wrong mark, and the fix is to cross the floor rather than to push further the way it already went.
// So the streaks are now DARKER than the beach instead of lighter — displaced water with the depth
// showing through it, which is what a surge over pale sand actually looks like from above.
export const TIDE_VIS = { ...CURRENT_VIS, speedMul: 2.2, tint: 0x35708a, alpha: 0.26, lenPx: 74, widthPx: 13, rippleEvery: 2.6 }

// Tide pools (render.js updateShafts, the `pool` look). The Shelf's shafts and The Surf's pools are
// the same circle in the sim — both live in run.shafts, both come from refillSpec() — and must not
// be the same circle on screen: a shaft is a warm additive column of light, a pool is a dip in the
// ground. Seen from directly overhead like everything else in this game.
//
// A DEPRESSION IN THE SEA FLOOR, READ BY VALUE ALONE (owner, 2026-08-15: "the little pools colors
// should be inverted, darker = deeper at the center. Also make them less defined since we're already
// underwater, maybe several steps").
//
// The first cut was a tide pool on a DRY beach: a bright meniscus rim, a damp collar, and a pale
// shelf sitting off-centre inside the dark water. Every one of those details is a waterLINE — the
// edge where air meets water — and once the whole chapter went under, there is no waterline here to
// draw. What is left is bathymetry: ground that goes down, seen through water that is already there.
//
// So the pool is now STEPS, concentric and each darker than the last, because that is exactly how a
// depth is read on a chart and how it looks in life — light travels less far back up to you from
// deeper ground. Concentric is the point rather than a simplification: the off-centre shelf existed
// to stop the old pool reading as a bullseye, and a bullseye is precisely what a hole IS when the
// only cue left is depth. Value alone does the whole job; no outline is needed and none is drawn.
//
// `steps` runs OUTSIDE IN, each entry {frac, color, alpha} with frac as a fraction of r. The first
// must sit at 1.0 or the pool would not reach the radius stepCharge tests against — the
// drawn-extent-IS-tested-extent contract every refill circle in this file keeps, since the player
// has to be able to tell "am I in it" at a glance. What that contract does NOT require is a hard
// edge, and this look deliberately spends its outermost step on a wide, low-contrast shoulder: the
// pool fades into the sand instead of being stamped on it.
export const TIDE_POOL_VIS = {
  // SIX steps, and the alpha ramp is gentle on purpose. Three or four with big jumps between them
  // draws a bullseye — the boundaries become the subject, which is "more defined", the opposite of
  // the ask. The eye finds an EDGE far more readily than it finds a contrast, so the way to make a
  // shape soft without blurring it is to give it more edges that each say less. Each step also stays
  // close in hue to the one outside it and to the floor itself: a saturated blue on a desaturated
  // beach reads as a portal cut in the ground rather than as ground.
  steps: [
    { frac: 1.00, color: 0x5f7a7d, alpha: 0.15 }, // the shoulder — barely there, just a cooling of the sand
    { frac: 0.88, color: 0x52707a, alpha: 0.19 },
    { frac: 0.75, color: 0x466674, alpha: 0.23 },
    { frac: 0.61, color: 0x3a5b6c, alpha: 0.27 },
    { frac: 0.46, color: 0x2f5062, alpha: 0.31 },
    { frac: 0.30, color: 0x264657, alpha: 0.35 }, // the deep middle
  ],
  sheen: 0xbfe0e8, sheenA: 0.055, sheenFrac: 0.95, // light on the water over it (additive, breathing)
  breathe: 0.06,                     // ± fraction the sheen's size wanders — calm water, not a pulse
}

// ---- LOBED GROUND SHAPES (owner, 2026-08-15: "make pools and sandbars variable shapes, not only
// circles") --------------------------------------------------------------------------------------
// A radial profile: the patch's radius as a function of the angle around it, r(theta) = r * factor.
// Sandbars and tide pools both wear one, so a beach stops being a field of stamped discs.
//
// THIS IS NOT A RENDER DETAIL, and that is the whole reason it lives in config rather than in the
// bake it started in. `onSandbar` and `stepCharge` decide whether you are standing on dry sand or in
// a refill by comparing a distance against the patch radius, so the moment the DRAWING stops being a
// circle while the TEST stays one, the edge you can see and the edge you can feel come apart —
// worst exactly at the lobes, which is where the eye is drawn. Every refill circle in this game
// keeps the drawn-extent-IS-tested-extent contract; a lobed patch keeps it only if both sides read
// the same table. So sim and render both call lobeFactor(), and run US.l asserts they agree.
//
// A TABLE OF SIX rather than a shape rolled per patch, because the sandbar is a BAKED texture: one
// bake per shape, picked per patch by cell hash and then rotated by a per-patch angle, which is
// enough that six never read as six. Rolling a unique shape per patch would mean a Graphics per
// sandbar and no bake at all — a real cost for variety the rotation already supplies.
//
// Each entry is a list of [harmonic, amplitude, phase]. THE AMPLITUDES MUST SUM TO 1: that is what
// bounds the profile to [1 - LOBE_DEPTH, 1], and the upper bound is load-bearing twice over — a
// patch that could exceed r would poke out of its own streaming cell (breaking the jitter slack that
// keeps neighbours apart) and out of the sandbar/tide-pool separation rule, which compares plain
// radii. Run US.l asserts the sum.
export const LOBE_DEPTH = 0.34   // how far the profile can pull IN from r; 0 is a circle
// How many points around each outline the sandbar/tide-pool separation rule samples (sim.js
// overlapsPool). Runs only at cell crossings and only for pairs whose circles already overlap, so
// this is not a per-frame cost. 48 puts a sample every 7.5 degrees — at r=165 that is an ~22px arc,
// comfortably finer than the notch between two adjacent lobes of the highest harmonic in the table.
export const SEPARATION_SAMPLES = 48
export const LOBE_SHAPES = [
  [[2, 0.50, 0.0], [3, 0.32, 1.7], [5, 0.18, 3.9]],
  [[3, 0.46, 0.9], [4, 0.34, 2.6], [7, 0.20, 0.4]],
  [[2, 0.58, 2.2], [5, 0.26, 0.7], [7, 0.16, 4.5]],
  [[3, 0.40, 3.1], [5, 0.36, 1.3], [8, 0.24, 2.0]],
  [[2, 0.44, 1.5], [4, 0.30, 4.2], [6, 0.26, 2.8]],
  [[3, 0.52, 5.0], [6, 0.28, 1.9], [9, 0.20, 3.3]],
]
// The profile at an angle, as a fraction of r. `rot` turns the shape with its patch, so the same six
// shapes present a different silhouette per patch; passing the patch's own stored rotation is what
// keeps sim and render looking at the SAME lobe rather than two independently-derived ones.
// A patch with no shape (every chapter but The Surf) returns 1 and is exactly the circle it was.
export function lobeFactor(shapeIdx, theta, rot) {
  if (shapeIdx == null) return 1
  const h = LOBE_SHAPES[shapeIdx]
  if (!h) return 1
  const t = theta - (rot || 0)
  let w = 0
  for (let i = 0; i < h.length; i++) w += h[i][1] * Math.sin(h[i][0] * t + h[i][2])
  return 1 - LOBE_DEPTH * (1 - w) * 0.5
}
// Is (px, py) inside the lobed patch centred on `p`? The one containment test, shared by
// onSandbar (dry ground) and stepCharge (refill), so the two can never disagree about an edge.
export function inLobe(p, px, py) {
  const dx = px - p.x, dy = py - p.y
  const d = Math.hypot(dx, dy)
  if (d > p.r) return false                     // cheap reject: the profile never exceeds r
  if (p.shape == null) return true
  return d <= p.r * lobeFactor(p.shape, Math.atan2(dy, dx), p.rot)
}

// CAUSTICS (render.js updateCaustics, The Surf). The moving net of light on a sea floor: sunlight
// refracted by the moving surface above and focused into bright creases. It is THE signal for
// "this is underwater" — a flat blue cast says "someone tinted this image", and a cast that MOVES in
// a pattern the water could have made says the water is there. Everything else in this chapter's
// realism pass is detail on top of that one cue.
//
// Two layers at different scales drifting in DIFFERENT DIRECTIONS, which is the whole trick and the
// reason one layer is not enough: a single tiled pattern slides across the floor as a rigid sheet,
// and reads as a texture being scrolled — which is exactly what it is. Two of them crossing make the
// bright creases appear, brighten, and dissolve in place, and it is that flicker, not the motion,
// that the eye reads as water. Same reasoning as the swell's two shading bands.
//
// Additive, and deliberately faint. Caustics are LIGHT: they can only add. And the floor beneath
// them still has to keep three creatures and two kinds of circle readable, so this is a shimmer you
// notice and then stop noticing, exactly the brief the swell was tuned to.
export const CAUSTIC_VIS = {
  tint: 0xdff6ff,      // the sky's own light, not a colour of its own
  tile: 256,           // px of the baked pattern; frequencies below are integer so it tiles seamlessly
  // THESE ALPHAS ARE MUCH LOWER THAN THEY LOOK LIKE THEY SHOULD BE, and that is the note worth
  // keeping. The pattern is additive WHITE and its creases sit near full alpha, so the two layers at
  // 0.16/0.11 — numbers that read as "faint" beside every other alpha in this file — buried the
  // beach under a bright net and took the crowd's readability with it. An additive layer's alpha is
  // not a fraction of the result, it is light added on top of a floor that is already pale.
  layers: [
    { scale: 1.00, alpha: 0.055, vx: 11, vy: -7 },   // px/s the pattern drifts
    { scale: 1.45, alpha: 0.040, vx: -8, vy: 13 },
  ],
  // Ridge shaping of the baked tile. `sharp` is how tightly the bright crease hugs the zero crossing
  // (higher = thinner, more caustic-like and less like a plasma cloud); `gamma` shapes the falloff.
  // Thin is also what keeps the total light down: it is the AREA of the bright part, not its
  // brightness, that decides how much of the floor this washes out.
  sharp: 3.4,
  gamma: 3.4,
}

// WAKE (render.js, any chapter with `render.water`). Ripples spreading from where a body just was.
// A fish crossing ankle-deep water and leaving the surface untouched is the single most obvious
// thing wrong with a still beach, and unlike the caustics it costs nothing new: it reuses the splash
// rings the gull strike already draws.
//
// Emitted per DISTANCE travelled rather than per second, so the trail is a property of moving rather
// than of time passing — standing still leaves nothing, which is both correct and what stops a
// stationary player from slowly disappearing under their own ripples.
export const WAKE_VIS = {
  every: 30,      // px of travel between rings
  r: 30,          // impact radius handed to the splash, i.e. how big the ring grows
  life: 0.85,     // s — longer than a strike's, since nothing is driving it but the water settling
  alpha: 0.24,    // much fainter than a gull hitting the surface, which is the point of comparison
}

// Splash rings (render.js, The Surf). What a body hitting shallow water actually leaves behind:
// concentric rings spreading OUT and slowing as they go, not a puff. Used by the gull strike
// (owner, 2026-08-15: "when seagulls hits, there should be a little splash/ripple") and available to
// anything else that lands hard on this chapter.
//
// The rings are STAGGERED rather than simultaneous — one wave front per `stagger` seconds — because
// a single expanding circle reads as a shockwave decal, and it is the second ring chasing the first
// that says "water". They also EASE OUT (see the sqrt in stepSplashes): a real ring travels fastest
// at birth and spends itself, so a linear ring reads as an expanding UI element.
export const SPLASH_VIS = {
  rings: 3,          // wave fronts per splash
  stagger: 0.085,    // s between one ring being born and the next
  life: 0.62,        // s a ring lives
  rMax: 2.35,        // furthest radius, as a multiple of the impact radius
  r0: 0.22,          // radius a ring is born at, same units
  width: 3.2,        // px stroke at birth; thins as it spreads, like a real front losing height
  color: 0xdff4ff,   // near-white with the water's own blue in it
  alpha: 0.62,
  crown: 0xffffff,   // the bright disc of thrown-up water at the point of contact
  crownA: 0.5,
  crownLife: 0.20,
  drops: 11,         // droplets thrown clear of the surface
}

// Sandbars (render.js syncSandbars). run.webs is the idiom — a ground patch that slows you, baked
// once and scaled per patch — and the reason a sandbar has to READ as ground rather than as an
// overlay is §5.3: humidity drives damage, and a damage multiplier is "imperceptible in its top
// half and a cliff in its bottom" unless the player can see the place that caused it.
// The rim is drawn at exactly `r`, same drawn-extent-is-tested-extent contract as the pool above.
// HEADROOM FOR THE WATER (2026-08-15). These values are chosen for what the sandbar looks like
// AFTER `render.water` has added its blue over the top, not for what they look like on their own —
// the wash is additive and lands on the brightest thing in the chapter hardest. At the old
// 0xe8d9b0/0.9 the bar clipped to flat white and took its own ripples and shell grit with it, which
// is the one patch of the beach that cannot afford to lose texture: it is dry sand, and reading as
// dry sand is the whole mechanic (see signature.bars — standing here multiplies the Humidity drain
// by 24). Taken down a step so the wash has somewhere to go. It is STILL brighter than the floor
// around it, which is the only comparison that matters.
export const SANDBAR_VIS = {
  sand: 0xd6c290, sandA: 0.9,        // DRY sand — deliberately a value step above the damp floor
  crown: 0xe2d3aa, crownA: 0.3,      // the driest, highest part, offset off centre
  // The ripples have to survive being the ONLY texture on the patch without becoming contour lines:
  // at 0.42 on a brown they drew a topographic map, which is a different thing from wind on sand.
  ripple: 0xc8ad80, rippleA: 0.22,   // wind ripples: what makes a pale blob read as SAND from above
  damp: 0x8a7148, dampA: 0.5, dampW: 5, // the wet margin at the waterline — the edge you step over
  // IT BREAKS THE SURFACE (owner, 2026-08-15). A sandbar is dry ground standing out of shallow
  // water, so it is the one part of this chapter the water is NOT in front of — and the flat blue
  // wash was treating it as seabed like everything else. This is warm light laid over the bar in the
  // aboveWater layer, i.e. after the wash, cancelling the blue the wash added and putting the sun
  // back on it. That it is ADDITIVE is what makes it correct rather than a patch: it also warms
  // whatever is STANDING on the bar, and a crab up in the sunlight should be lit like one.
  //   dryFrac keeps the light inside the bar's own radius, so the edge stays a waterline rather than
  //   a glow bleeding into the sea around it. It is soft-edged (T.fx.light_01), so there is no
  //   second hard circle competing with the rim the mechanic is actually tested on.
  // 0.18, not the 0.30 this started at: additive light lands hardest on the brightest thing, and the
  // bar is already the brightest thing in the chapter — the SAME clipping trap the sand/crown values
  // above were just taken down a step for, arriving from the other direction. At 0.30 the middle of
  // every bar went white and lost its ripples again, which is the texture the mechanic reads by.
  dry: 0xffa851, dryA: 0.18, dryFrac: 0.92,
  speck: 0xa88a56, speckA: 0.36,     // shell grit
  ripples: 7,                        // ripple lines across the patch
  specks: 26,
}

// Air pockets (v7.x, The Reef — render.js updateShafts, refillLook 'pocket'). The third look on
// the ONE refill-circle pool, beside the Shelf's shaft and the Surf's tide pool, and the third
// answer to the same drawn-extent-IS-tested-extent contract: the rim sits at exactly `r`, because
// stepCharge tests centre-to-centre against that radius and the player has to be able to tell "am I
// IN it" at a glance while the lane carries them through it.
//
// CLEAN WATER RISING THROUGH MURK (The Shelf, v7.x). The refill circle for the murk chapter, and it
// is drawn against the SUN SHAFT rather than from scratch, because the two are the same geometry in
// two chapters and the whole risk is that they read as one another: a shaft is warm light arriving
// from ABOVE (glow 0xfff0c0, a single hard gold rim), so this is cold clear water arriving from
// BELOW. Pale blue-white, and a soft DOUBLE rim rather than one hard stroke — an upwelling has a
// boundary you can see through, where a shaft's is where the light stops.
//
// The rim still sits ON r, exactly as the tide pool's and the air pocket's do: the drawn extent is
// the tested extent, so the edge you can see is the edge that refills you.
// RAW final colours — shaftLayer lives in entitiesLayer and is never multiplied by render.floorTint.
// FOUL SPRING's fouling (The Shelf). The silt taking a clean patch, drawn over FOUL_SPRING_FOUL_T.
// The colours are the SILT CLOUD's own (syncBlooms' 0x9a9670 / 0x6e6a4c) rather than a new pair:
// the thing doing the fouling is on screen at the same moment, and a patch that turned some other
// brown would read as a third substance rather than as the player's own cloud arriving.
export const FOUL_SPRING_VIS = {
  silt: 0x9a9670, siltA: 0.55,   // the pale olive of a silt cloud's outer wisps
  deep: 0x6e6a4c, deepA: 0.62,   // its darker core, the body of the fouling
  rim: 0x8a8560, rimA: 0.5,      // the boundary going muddy as it is taken
  sheen: 0x9a9670,               // the glow sprite's tint, following it from cold blue to olive
}
export const UPWELLING_VIS = {
  // BLUE, and the blue is the point (owner, 2026-08-17). The first cut was a pale green-white and
  // read as "a light spot" — the same thing The Twilight's gold shafts and The Reef's silver air
  // pockets already are, so a player crossing three chapters met one idea three times. Clean water
  // in a silty green chapter is the one thing on screen that is NOT the local colour, and blue is
  // what water reads as when the water around it has stopped reading as water.
  core: 0xa8d4f0, coreA: 0.34,        // the clear water itself, seen through the silt around it
  rim: 0xd4ecff, rimA: 0.48, rimW: 3, // ON r — the boundary the mechanic is tested against
  innerFrac: 0.62,                    // the second, fainter rim: depth without a hard edge
  sheen: 0x9cc8ea,                    // the additive glow sprite's tint, cold against the shaft's gold
  glowA: 0.22,                        // faint and small: the outline is the shape, not this disc
  // DRAWDOWN (signature.drawdownSecs). The circle fades linearly to nothing as it is used up, so the
  // five seconds are legible from the water rather than from the bar. `floorA` is what survives at
  // the very end — deliberately 0: "they disappear" was the ask, and a ghost left behind would read
  // as a spot that still feeds you.
  floorA: 0,
}

// PLAN VIEW OF TRAPPED AIR, which is the one thing on this list that is not a colour choice. A
// pocket held under a coral overhang, looked at from directly above, is a MIRROR — total internal
// reflection makes it a hard silver disc with a bright meniscus, not a soft glow. So it is drawn as
// a near-white body with a crisp white rim and one offset lobe, over a dark collar for the rock's
// shadow. That silver is also the one value the chapter cannot otherwise produce: The Reef's floor
// is deep cold blue (bgColor 0x0a3358) and every prop on it is warm coral, so a bright achromatic
// disc cannot be confused with either. RAW final colours — shaftLayer lives in entitiesLayer and is
// never multiplied by render.floorTint, exactly like the eddy and tide-pool decals.
export const AIR_POCKET_VIS = {
  shade: 0x0d2b44, shadeA: 0.55,     // the overhang's shadow: the collar the air is trapped under
  air: 0xe4f4ff, airA: 0.82,         // the air itself — a silver mirror, hard-edged, not a glow
  lobe: 0xffffff, lobeA: 0.55,       // the brighter blob inside it, offset so it is not a bullseye
  rim: 0xffffff, rimA: 0.9, rimW: 3, // the meniscus, ON r — the edge the mechanic is tested against
  airFrac: 0.86,                     // air edge as a fraction of r; the shade collar spans this..1
  sheen: 0xbfe9ff, sheenA: 0.18, sheenFrac: 1.15, // additive spill onto the water around it
  breathe: 0.05,                     // ± fraction the sheen's size wanders — trapped air, not a beacon
}

// A coral head shattering under a Burst (v7.x, The Reef — render.js coralShatter, driven by the
// SHIPPED {type:'crush'} event that stepCrush already emits). The skies' own crush FX cannot serve
// this: it is a dust skirt, brick shards and a warm interior spill, and it leaves a permanent RUIN
// in the render-local ledger — three things that mean something about a demolished building and
// nothing at all about coral underwater, where there is no dust and no window light.
//
// So: hard angular CHUNKS in the bommie's own plum-red (BIOME_REEF.obstacle.tint), which sink under
// fake gravity rather than drifting, plus a SILT puff that hangs and a few BUBBLES that rise — the
// three things that actually happen when you break rock in water. No ledger entry and no scar: the
// coral is simply gone, which is what run._crushed already guarantees in the sim.
//
// ⚠ THE CHUNKS ARE THE COLOUR OF THE INSIDE, NOT OF THE OUTSIDE, and that is a legibility fix
// arrived at from a screenshot rather than from taste. A first cut threw chunks in the bommie's own
// surface plum (0x8f3a56 over a 0x0a3358 floor); they drew, they were the right shape, and they
// were INVISIBLE — dark warm on dark cold, at 25px, for half a second. The honest picture is also
// the readable one: coral is a white calcium skeleton with a thin living skin, so breaking one open
// shows bone. Same lesson as the tide pool being darker than its sand — pick the value from what
// the material actually is, then check it against the floor it lands on.
export const CORAL_CRUSH = {
  chunks: 9, chunkSpeed: 150, chunkSpread: 190, chunkT: 0.6, chunkGrav: 190,
  chunkTint: 0xf7e3d8, chunkTintDark: 0xd79aa6,   // bone, and bone still wearing some of its skin
  silt: 4, siltSpeed: 50, siltT: 1.2, siltTint: 0xc0aa9e,
  bubbles: 6, bubbleRise: 95, bubbleT: 0.9, bubbleTint: 0xdff2ff,
  ringT: 0.34, ringTint: 0xe4f4ff,   // the extent ring, drawn at the coral's own radius
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

// Widths, re-exported under their historical names so render.js's carriageway bakes keep resolving.
// STREET_* are the terrain module's own names for the same quantities.
export const ROAD_MINOR_WIDTH = STREET_MINOR_WIDTH
export const ROAD_MAJOR_WIDTH = STREET_MAJOR_WIDTH

// The rest of the terrain surface sim.js/render.js/state.js need, re-exported through config.js so
// the "only config.js is imported by both sim and render" rule in CLAUDE.md still holds literally.
export {
  nearestCity, cityAt, blockSnap, parcelAt, PARCEL, pickWorldSeed,
  terrainAt, elevationAt, urbanAt, riverAt, clumpAt, BIOME_BUILD_DENSITY, CITY_GRID,
  STREET_SPACING_MAJOR_EVERY, HIGHWAY_WIDTH, highwaysNear, BLOCK_U, BLOCK_V,
} from './terrain.js'


// ---- Road ART (v5.10 art direction, spec §4.2-§4.3) — render-only, skies-only -------------------
// "A road is a dashed yellow line on grass. It reads as a wireframe, not a place." The fix is not
// more lines, it is a MARKING FAMILY plus VARIATION ALONG THE STREET.
//
// v6.9.1: the carriageway is a TilingSprite laid along a whole street run, so the tile below is
// baked at TRUE WORLD SIZE — `tilePitch` px along the street by the street's own width across it —
// and never distorted. That deletes the old stretch pre-compensation (the tile used to be stamped
// per 26px floor cell at x0.48 / y0.34-0.62, so every baked shape came out as a different oval on a
// side street than on an avenue). Shapes that vary ALONG the street — manholes, patches, arrows —
// are still separate, uniformly scaled decals: they are placed at random, and a tiling pattern is
// by definition not random.
export const ROAD_PAINT = {
  tilePitch: 48,                                     // px along the street per repeat = the dash pitch
  asphaltMinor: 0x33383f, asphaltMajor: 0x2b2f36,   // unchanged from what ships today
  kerb: 0x4a515b, kerbW: 2,                          // both long edges — the single strongest "this
                                                     // is a built road, not a painted strip" cue
  sheen: 0x8fa8c4, sheenAlpha: 0.10,                 // wet crown reflection down the centreline: a
                                                     // STATIC overhead reflection of the storm sky.
                                                     // ponytail: no dynamic sheen sprite — the
                                                     // full-field lightning flash already whitens it.
  polish: 0x22262c, polishAlpha: 0.25, polishAt: 0.45,  // two darker wheel-polish bands at ±0.45 of
                                                        // the half-width — where tyres actually run
  centreline: 0xd8d4c8, centrelineAlpha: 0.55, dashLen: 22,       // minor streets: dashed white
  doubleYellow: 0xdccf86, doubleYellowGap: 4, doubleYellowW: 2,   // avenues: two lines, 4px apart
}

// The decal layer: `{ name: 'roadDecal', cell: 160, chance: 1.00, populate: populateRoadDecal }`,
// self-gating on roadAt, the way the carriageway did before it became one strip per street. ONE decal
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

// Junctions (spec §4.3) — ENUMERATED, NOT STAMPED. A junction is many floor cells across on each
// axis, so "stamp a crosswalk wherever two streets cross" lays a dozen overlapping zebras on one
// junction. render.js instead walks each visible city's own grid indices (updateJunctions, the same
// enumeration updateStreets uses for the carriageway) — <= 6 on a 1280x720 view. Each gets ONE
// composite sprite from a pool of
// `pool`, drawn from four variants baked AT TRUE WORLD SIZE so they are never scaled at all (which
// is what lets a junction carry circles and zebra pitch that the stretched carriageway tile cannot).
export const ROAD_JUNCTION = {
  pool: 8,   // latchStepPx/latchProbes lived here until v6.9.1: leftovers of the pre-v5.11 global
             // grid-origin probe, read by nothing since the cities got their own frames.
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

// Which book claims this chapter (ladder or hidden), or null for an id no book knows.
export const bookOf = (id) => Object.keys(BOOKS).find((b) => BOOKS[b].chapters.includes(id) || BOOKS[b].hidden.includes(id)) ?? null
// Is this chapter behind the WIP gate — i.e. does it still need meta.dev to be reachable?
//
// PER CHAPTER, not per book (see `wipFrom` on BOOKS). The position in its OWN book's ladder is
// what decides, so a book may be half-shipped: Undertow's wipFrom is 1, which makes The Surf live
// and everything below it gated. `?? Infinity` is what keeps a book with no `wipFrom` fully
// shipped, and index 0 is what makes `wipFrom: 0` mean the whole book.
//
// A `hidden` chapter is NOT on the ladder, so indexOf returns -1 and it can never be wip by
// position — The Blank is earned rather than unfinished, and the two must not be conflated (the
// old boolean got this right for free; the index form has to say so).
export const isWipChapter = (id) => {
  const book = BOOKS[bookOf(id)]
  if (!book) return false
  const i = book.chapters.indexOf(id)
  return i >= 0 && i >= (book.wipFrom ?? Infinity)
}

// The next chapter in the id's OWN book, or null past its end and for any id no book claims.
// Was `CHAPTER_ORDER[CHAPTER_ORDER.indexOf(id) + 1] ?? null`, which returned 'body' for every
// outside id because indexOf is -1 and -1 + 1 indexes element 0. That was latent rather than live —
// both call sites are inert, ui.js only ever feeding it ids already filtered through CHAPTER_ORDER
// and main.js following it with an `unlocked` check body always passes — but a second book is
// exactly what makes an outside id routine, so it is fixed before it can matter.
export const nextChapter = (id) => {
  const order = BOOKS[bookOf(id)]?.chapters ?? []
  const i = order.indexOf(id)
  return i < 0 ? null : (order[i + 1] ?? null)
}

// Is this chapter the LAST rung of its book's ladder? The book-unlock gate tests this rather than
// `nextChapter(id) === null`, which is ALSO true of a hidden chapter and of an id no book claims.
// The Blank is the live counter-example: nextChapter('blank') is null and its ladder caps at 3,
// which is exactly CHAPTER_UNLOCK_DIFFICULTY, so a null check unlocks the next book off a Blank win.
export const isBookFinale = (id) => {
  const chapters = BOOKS[bookOf(id)]?.chapters ?? []
  return chapters.length > 0 && chapters[chapters.length - 1] === id
}
// The book after this one on the shelf, or null past the end AND for any id no book claims.
// NOT `BOOK_ORDER[BOOK_ORDER.indexOf(bookId) + 1] ?? null` — indexOf(-1) + 1 indexes element 0,
// so an unclaimed id would silently resolve to BOOK_ORDER[0] ('book1'). Same latent defect
// nextChapter was fixed for above; caught here by run BP's direct nextBook('nope') coverage
// before it ever reached a live call site (endRun's book-finale branch is only entered when
// isBookFinale is true, which is itself false for a bookOf-less id — so this was never triggered
// in practice, but the function's own contract must hold regardless of who currently guards it).
export const nextBook = (bookId) => {
  const i = BOOK_ORDER.indexOf(bookId)
  return i < 0 ? null : (BOOK_ORDER[i + 1] ?? null)
}

// The chapter the PLAY path may actually start — the one and only place the WIP gate belongs.
// Deliberately NOT folded into resolveChapterId: createRun resolves a SECOND time (state.js) and
// has no meta to consult there, so a dev-aware resolveChapterId would silently downgrade every
// gated run to CHAPTER_ORDER[0] — no throw, no warning, and endRun crediting the wrong chapter's
// ledger. resolveChapterId stays a pure "is this a real chapter" test so every sim-adjacent caller
// passes a legitimately-selected WIP id straight through; visibility is asked for explicitly, here.
export const playableChapterId = (meta) => {
  const id = resolveChapterId(meta?.chapter)
  return isWipChapter(id) && meta?.dev !== true ? CHAPTER_ORDER[0] : id
}

// May this save select and play this chapter? Unlocked the ordinary way, OR a WIP chapter with the
// gate on — meta.dev IS the permission for a chapter that has no unlock path yet.
//
// One helper because `unlocked` is read at FIVE places that each decide a different thing: whether
// the carousel card is a "???" preview, whether Play is enabled, whether scrolling to it persists
// the selection, whether the pre-run brief is a preview, and whether a tap is honoured at all. The
// first cut of phase 1 fixed only the last one, so The Shelf appeared in the carousel as a locked
// card with a dead Play button — listed and unreachable, which is the same dead end the plan was
// rewritten to avoid, reached from one step further along.
//
// NOT by marking WIP chapters `unlocked` in the save instead: that writes a permission to disk that
// outlives the gate, so turning dev back off would leave an unlocked WIP chapter behind.
export const chapterAvailable = (meta, id) =>
  !!meta?.chapters?.[id]?.unlocked || (meta?.dev === true && isWipChapter(id))

// The name printed on a chapter's SPINE — its own name with the article dropped. A spine is about
// 47px wide and reads its title VERTICALLY, which leaves roughly 110px of height for it: 'The
// Undergrowth' needs about 135px and simply does not fit, while 'Undergrowth' does.
//
// Its own table rather than a `short` key inside each CHAPTERS entry, for one reason: run XX's
// French coverage walk enumerates config TABLES, and a key buried in a chapter's body would be
// exempt from it by construction — which is exactly how two City enemies, every weapon mod and the
// whole elements rework each shipped untranslated. As a table it is one line in that walk.
export const CHAPTER_SPINE = {
  body: 'Body', pond: 'Pond', garden: 'Garden', undergrowth: 'Undergrowth',
  city: 'City', skies: 'Skies', beyond: 'Beyond', blank: 'Blank',
  surf: 'Surf', shelf: 'Shelf', reef: 'Reef', wreck: 'Wreck', trawl: 'Trawl', twilight: 'Twilight', deep: 'Deep',
}
// Falls back to the full name rather than throwing: a chapter added without a spine entry renders
// with its article and looks slightly wrong, which is a far better failure than a blank spine.
export const spineName = (id) => CHAPTER_SPINE[id] ?? CHAPTERS[id]?.name ?? id

// The BOOKCASE the title screen draws: one ÉTAGE per Book, one VOLUME per chapter. Pure function
// of the save, no DOM, so the suite can assert it — ui.js cannot be imported headless because
// import.meta.glob is Vite-only, which is the same reason titleChapterList lived here before it.
//
// This replaces titleChapterList, which flattened every Book into ONE strip. That is what made The
// Surf render as "CHAPTER 8" — the counter indexed the flat list — and why nothing separated The
// Beyond from the next Book at all. Grouping by Book fixes both without a counter.
//
// Three states, and they are the whole design:
//   - an unlocked chapter is a SPINE: cloth, icon, vertical title, one gold star per difficulty won
//   - a locked chapter in a STARTED Book is a volume turned fore-edge out with a padlock printed on
//     the page edges — you can see a book is there without being told which
//   - a Book with nothing unlocked at all comes back `started: false`, and ui.js drapes ONE dust
//     sheet over the whole étage rather than covering each volume. That is deliberate: per-volume
//     covers would count the chapters, and for a Book you have never opened the count is the tease.
//
// A `hidden` chapter (The Blank) joins its own Book's étage, and only once unlocked. Before that it
// must not even occupy a covered slot, or the shelf silently counts a chapter whose existence the
// carousel went to some trouble to withhold.
export function titleBookshelf(meta) {
  const shelf = []
  for (const [book, def] of Object.entries(BOOKS)) {
    // The WIP gate, now PER CHAPTER (see isWipChapter). A gated chapter does not take a covered
    // slot on the étage, for exactly the reason a locked `hidden` chapter does not: a fore-edge
    // volume announces that a chapter is there, so drawing six of them for a book that has written
    // one would count chapters that do not exist. A book with NOTHING live is absent entirely —
    // same meaning the old boolean had, reached from the other end.
    const ladder = def.chapters.filter((id) => meta?.dev === true || !isWipChapter(id))
    if (ladder.length === 0) continue
    const ids = [...ladder, ...def.hidden.filter((id) => meta?.chapters?.[id]?.unlocked)]
    const volumes = ids.map((id) => ({ id, unlocked: chapterAvailable(meta, id) }))
    shelf.push({
      book,
      name: def.name,
      cloth: def.cloth,
      started: volumes.some((v) => v.unlocked),
      // Summed from `won`, the highest difficulty actually beaten (state.js) — NOT maxDifficulty,
      // which is the highest UNLOCKED and stops moving once the ladder is finished.
      stars: volumes.reduce((n, v) => n + Math.max(0, Number(meta?.chapters?.[v.id]?.won) || 0), 0),
      volumes,
    })
  }
  return shelf
}
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
// PER-CHAPTER OVERRIDE (CHAPTERS[].laneScroll), because the axis changed what 70 MEANS.
//
// What a lane chapter actually owes the player is SECONDS OF WARNING — how long between a thing
// appearing at the leading edge and reaching them — and that is `viewport-ahead / scroll`, not the
// scroll alone. The player sits at LANE_CAMERA_FRAC (0.8) of the viewport along the forward axis, so
// the distance ahead is 0.8 x the screen extent ALONG THAT AXIS. Rotating the lane 90 degrees on a
// portrait phone therefore swaps which screen dimension pays for warning, and measured on a 390x844
// phone at zoom 1.000 (scripts/fx-probe.mjs, both chapters, same frame):
//
//     The Beyond (y): 675 world px ahead  -> 9.6s at 70 px/s
//     The Reef   (x): 312 world px ahead  -> 4.5s at 70 px/s
//
// The ratio is exactly the screen's aspect (844/390 = 2.16 against 9.6/4.5 = 2.13), which is the
// proof that this is a property of the DEVICE and the axis, not of the chapter's tuning. Half the
// reaction time on the platform this game actually ships to is not a difficulty choice.
//
// So The Reef scrolls slower, chosen against the warning it buys rather than against how it feels:
// 312/45 = 6.9s, most of The Beyond's, without going glacial on a wide screen.
//
// ponytail: the principled fix is to stop storing px/s at all and derive the scroll from a shared
// LANE_WARNING_SECONDS and the live viewport, which would make every device and both axes agree by
// construction. It is not done here because it MOVES THE BEYOND on any viewport that is not this
// phone (640 px ahead on a 1280x800 desktop would give it 66 px/s, not 70), and The Beyond is
// shipped and tuned. Doing it means re-capturing run LN's golden master with a stated reason.
export const laneScrollFor = (ch) => ch?.laneScroll ?? LANE_SCROLL_SPEED
export const LANE_STRAFE_MUL = 1.25      // strafe is a touch quicker than base speed — it is all you have

// THE LANE HAS WALLS, and this is the correction that makes the chapter playable at all. Rev.1 had
// an unbounded lane with ranks 900px wide centred on the player: on a phone (viewRadius ~465) most
// of every rank was off-screen, so ~65% of all damage taken came from invaders the player never saw,
// and measured survival was 15-18 seconds. Space Invaders has walls for exactly this reason — the
// formation spans the play area, the play area is what you can see, and every threat is therefore
// legible. The lane is centred on world CROSS-AXIS 0 (x for The Beyond, y for The Reef) and the
// player is clamped to it.
// laneHalfWidth() shrinks the lane on a narrow viewport so a rank is ALWAYS fully visible: the
// guarantee "you can see everything that can hurt you" outranks a fixed world width.
//
// ONE NUMBER FOR BOTH AXES, and that is a decision rather than an oversight. viewRadius is the half
// DIAGONAL (main.js), so it is orientation-blind by construction: an x-lane and a y-lane get the
// same world-width lane on the same device, which is what keeps every constant measured against it
// — LANE_HALF_W, FORMATION_COLS' pitch, ROCK_SPREAD_MUL — meaning the same thing in both chapters.
// ponytail: the honest cross-axis extent is run.viewW/viewH (state.js), and feeding the lane the
// one it is actually measured ACROSS would deliver the "fully visible" guarantee above literally
// rather than approximately — today a portrait phone (viewRadius 465, half-width 195) gets a
// ±418px y-lane more than twice as wide as the screen, which is a pre-existing gap this comment is
// only now naming. Upgrade path: pass laneAxes(ch).cross's half-extent instead, and re-shoot BOTH
// chapters at BOTH viewports (the shipped Beyond numbers move the moment you do, so it needs the
// golden master re-captured with a stated reason).
export const LANE_HALF_W = 430           // px, half the lane's width at full size
export const LANE_VIEW_FRAC = 0.9        // lane never exceeds this fraction of the viewport radius
export const laneHalfWidth = (viewRadius) => Math.min(LANE_HALF_W, viewRadius * LANE_VIEW_FRAC)

// THE LANE HAS AN AXIS (v7.x). The Beyond scrolls bottom-to-top; The Reef (Book 2 ch 3) scrolls
// left-to-right. `lane: true` still means "this chapter is a scroller" and is compared with STRICT
// equality in at least two places in sim.js, so the DIRECTION is a separate optional chapter field,
// `laneAxis: 'x'` — absent means The Beyond's original 'y'. Do NOT turn `lane` into an object.
//
// laneAxes() is the ONE description of "forward" every lane site reads, instead of the same ternary
// written out at each of them:
//   fwd / cross      the position FIELD NAMES. Everything the lane does is either ALONG the lane
//                    (the scroll, the leak line, how far ahead a rank materialises) or ACROSS it
//                    (the strafe, the walls, a rank's columns, a rock's sideways drift).
//   vFwd / vCross    the matching velocity fields on run.player.
//   dir              +1/-1, which way along `fwd` the player advances. Multiplying a coordinate by
//                    it gives a SIGNED "how far up the lane is this", which is the question the
//                    leak test and the rock cull actually ask (see stepLeaks in sim.js).
//   angle / fx, fy   that same heading as radians and as a unit vector — p.facingAngle, the Pulsar
//                    Sweep's fan anchor, and the repulse shove's dead-centre fallback.
// Takes the CHAPTER OBJECT, not an id, so render.js can hand it the `cfg` it has already resolved
// (including the null it holds on the title screen). Anything that is not an x-lane reads 'y',
// which is exactly the (0, -1) the non-lane callers hardcoded before.
export const LANE_AXIS_Y = Object.freeze({
  fwd: 'y', cross: 'x', vFwd: 'vy', vCross: 'vx', dir: -1, angle: -Math.PI / 2, fx: 0, fy: -1,
})
export const LANE_AXIS_X = Object.freeze({
  fwd: 'x', cross: 'y', vFwd: 'vx', vCross: 'vy', dir: 1, angle: 0, fx: 1, fy: 0,
})
export const laneAxes = (ch) => (ch?.laneAxis === 'x' ? LANE_AXIS_X : LANE_AXIS_Y)

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

// balance_decision : the lane opens 33% denser and decays to the shipped rate by t=120
//  - must multiply BOTH lane spawners: ranks are 63% of the first 30s, so putting it all on the
//    ring stream would need +89% and would flip the swarm/rank mix the chapter exists to merge.
export const LANE_EARLY_BOOST = 0.33     // +33% at t=0, +16.5% at t=60, +0% from t=120
export const LANE_EARLY_UNTIL = SPAWN_LATE_START
export const laneEarlyMul = (t) => (t >= LANE_EARLY_UNTIL ? 1 : 1 + LANE_EARLY_BOOST * (1 - t / LANE_EARLY_UNTIL))

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
// 1 -> 2 (owner): letting a rank through should cost something you notice. Note this lands on the
// number the paragraph above already argued for — the rev.1 disaster was the missing invuln gate,
// not the size of the hit, and 1 was the over-correction that outlived it.
export const LANE_LEAK_BEHIND_PX = 260   // px behind the player at which a marcher counts as through
export const LANE_LEAK_DMG = 2           // HP lost per invader that gets through (invuln-gated, see stepLeaks)

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

// ---- The Pulse (v7.x Book 2 — chapters declaring a `resource`) --------------------------------
// The same cast as REPULSE above, AMPLIFIED by spending the chapter's bar. The REPULSE_* numbers
// stay exactly as they are and become the FLOOR: an empty bar still fires the shipped v5.21 shove,
// which is what stops the obvious spiral where having no charge prevents you from earning charge.
// Everything above the floor is bought with charge, linearly, so a half-spend reads as half-way
// between the two — no thresholds to learn.
//
// It still deals NO DAMAGE. That is not an oversight and it is not a balance knob left unturned:
// REPULSE_CD's block above says why, and Book 2's whole premise is that the second verb is
// POSITIONAL. A pulse that also killed would collapse back into "another weapon, on a button".
export const PULSE_CHARGE_COST = 45      // charge a full-strength pulse spends; a full bar is two of them
export const PULSE_RADIUS_AT_FULL = 620  // px at a full spend (floor REPULSE_RADIUS 340)
export const PULSE_FORCE_AT_FULL = 1500  // px/s at a full spend (floor REPULSE_FORCE 880)

// ---- THE SHOREBREAK (v7.x, The Surf — chapters declaring `shorebreak: true`) -------------------
// NAMED `shorebreak` AFTER TWO COLLISIONS, and the list is worth keeping because every obvious word
// for this move is already spoken for somewhere in this repo. `wave` is three things (WAVE_TABLE the
// spawn schedule, WEAPONS.wave, WAVE_ECHO_* its mod) and would have made WAVE_RADIUS read as that
// weapon's radius; `swell` is two (WEAPON_MODS.breaker.swell, name 'Swell', and the `render.swell`
// water field that render.js's updateSwell draws — a stepSwell beside an updateSwell doing unrelated
// work is exactly the trap CLAUDE.md is built around). Also taken: `surge` (signature.surge),
// `riptide` (an ANOMALIES entry), `backwash` and `breaker` (both Breaker mods), `crest`
// (broadCrest), `undertow` (the BOOK id). Shorebreak has zero hits in src/ and matches the register
// of the other three buttons — BURST, BREACH, SCENT — which are named for what the press DOES.
//
// The Surf's half of the button, and the ONE chapter where the second verb REPLACES the Pulse's
// shove instead of riding along with it. Owner, 2026-08-16: the button "should be revamped to a
// bubble shield or wave shield that lasts for a bit so the player can go through a wall of circling
// enemies", then picked the wave over the bubble — you plough through the wall rather than becoming
// intangible to it, so the crowd you crossed stays scattered behind you.
//
// WHY A WINDOW AND NOT A BIGGER SHOVE. A shove is one frame of impulse: the ring is already closing
// again while the 6s cooldown runs, so it answers a bad moment and cannot answer a bad PLACE. The
// ask is explicitly about crossing something, which is a distance, which takes time. So the wave is
// the same positional verb spread over a duration — it rides with the player, and the corridor it
// opens is the one you are walking down.
//
// It still deals NO DAMAGE, for the reason REPULSE_CD's block gives at length: Book 2's second verb
// is positional, and a button that also killed would collapse into another weapon on a cooldown.
//
// WHY THE INSTANT SHOVE IS SKIPPED rather than fired alongside (see stepRepulse): firing both puts
// an 880-1500 px/s impulse on frame one and the wave's own push on every frame after, which reads
// as the old Pulse with a tail rather than as a new move — and worse, the crowd that impulse flings
// to the rim is a crowd the wave then never touches, so the two halves actively cancel.
export const SHOREBREAK_DUR_MIN = 0.9          // s on an EMPTY bar — spec §8.2's no-spiral floor
export const SHOREBREAK_DUR_AT_FULL = 2.4      // s at a full PULSE_CHARGE_COST spend
// Deliberately UNDER the Pulse's 340px floor, let alone its 620px full spend. A sustained push does
// not need the shove's reach: the shove has one frame to catch everything that matters, where the
// crest gets every frame for up to 2.4s and travels with you, so its true footprint is this radius
// swept along your path.
//
// 190 IS SET BY THE NARROWEST SCREEN, and it is the one number here that is not free. render.js
// draws the rim AT this radius, on the contract every other button keeps — a burst that lies about
// its reach makes the cooldown feel arbitrary — and the rim is the only place a player can read
// where the push falls to zero. A 390x844 phone has a half-WIDTH of 195, so at 190 the whole crest
// edge is on screen on every axis; the first cut at 300 put 105px of it past each side, meaning the
// edge was unreadable on exactly the axis you walk along. Owner, 2026-08-16, off a three-way look
// sheet: "let's do B but with less radius."
//
// It stays WORLD px rather than a fraction of the viewport, like every other reach in the book: this
// is a gameplay quantity, and a screen-relative one would hand a desktop player a bigger button.
// The screen only sets the CEILING.
export const SHOREBREAK_RADIUS = 190           // px, centred on the player and moving with them
// An ACCELERATION (px/s per second), not an impulse — the `n.carry` idiom in stepNodes, where the
// comment spells the maths out: e.kb is a VELOCITY that decays at KB_DECAY_RATE (6/s), so a
// constant push settles at a terminal speed of SHOREBREAK_FORCE / 6. 1300 puts that at ~217 px/s dead
// centre, falling off linearly to 0 at SHOREBREAK_RADIUS.
//
// THAT NUMBER IS CHOSEN AGAINST ENEMY SPEED, NOT AGAINST REPULSE_FORCE. What the move has to
// guarantee is that the wall cannot close while you are inside it, so terminal must beat the crowd's
// own approach — the fast archetypes here run ~190 px/s — with enough margin to actually gain
// ground. It must NOT be anchored to the shove's 880: sustained for 2.4s that is ~2000px of drift,
// thirteen times what one Pulse moves a body, which does not open a corridor so much as evacuate
// the map and leave you standing in an empty chapter.
export const SHOREBREAK_FORCE = 1300
// Refreshed every frame a body is inside, and short on purpose: it must expire almost as soon as
// the wave leaves, so the read is "staggered while the surf is on me" and not a 2.4s lockdown in a
// 300px bubble. `stunT` is the shipped contract field (stepEnemyMovement checks it above every
// behavior flag, and render.js holds the pose off it), so the tell costs nothing new — and a body
// that cannot act is a body that cannot dash back into the corridor you just made.
export const SHOREBREAK_STAGGER = 0.22         // s, refreshed per frame while inside

// ---- BURST (v7.x, The Reef — chapters declaring `burst: true`) ---------------------------------
// The Reef's half of the same button. One press, one cooldown, one spend: the Pulse's shove above
// fires exactly as it always does, and a `burst` chapter ALSO gets a forward dash that shatters
// whatever coral it goes through. Not a second button and not a second bar — the design's rule is
// one gimmick, one button, one second job for the bar, and a chapter that spent its press on a
// choice between two casts would be spending it on a menu.
//
// WHY A DASH IS THE RIGHT ANSWER HERE and a bigger shove is not: the lane already denies you the
// forward axis. Every other chapter's answer to "something is in my face" is to walk somewhere
// else; here the only two things you own are a strafe and this button. The Pulse buys sideways
// room, so the Burst buys the axis you cannot otherwise touch — which is also what makes the coral
// mean anything (see CHAPTERS.reef.laneSolid).
//
// THE FLOOR IS THE DURATION, not the existence of the dash. spec §8.2's no-spiral rule says a
// player with no charge must never be structurally trapped, only slowed, and that has to be
// re-verified per chapter rather than assumed — so an empty bar still dashes, just BURST_DUR_MIN
// instead of BURST_DUR_AT_FULL, and still shatters what it touches. Run RF.c pins that.
// At laneScroll 45 x BURST_SPEED_MUL 9 = 405 px/s:
//   empty bar  0.30s -> 122px travelled, 108px of it bought (13.5px was the scroll anyway)
//   full bar   0.75s -> 304px travelled, 270px bought — one whole coral head's diameter (maxR 150)
// The speed is FIXED across that range on purpose: a dash whose speed changed with the bar would be
// a different move at every charge level, where a dash whose LENGTH changes is the same move, more
// of it.
export const BURST_SPEED_MUL = 9         // x the chapter's own laneScroll while the dash is live
export const BURST_DUR_MIN = 0.30        // s of dash on an EMPTY bar — the no-spiral floor
export const BURST_DUR_AT_FULL = 0.75    // s of dash at a full PULSE_CHARGE_COST spend
// Shatter reach while dashing, x PLAYER.radius (22) -> 55px. Deliberately under the rampage's own
// x3: this is a lance, not a wrecking ball. It reads off stepCrush, the shipped permanent-removal
// path (splice + run._crushed + {type:'crush'} + a CRUSH_XP gem), so a burst through coral pays the
// same XP a kaiju gets for a shed and nothing new had to be invented for it.
//
// IT MUST STAY ABOVE 1, and by more than one frame of dash. stepObstacles (and so stepLaneSolid,
// which makes reef coral solid at o.r + PLAYER.radius) runs BEFORE stepCrush in stepSim's ordered
// list, so if the shatter reach were not the larger of the two the player would be shouldered
// sideways by the coral on the frame before it broke — a dash that visibly bounces off the thing it
// is about to destroy. The gap here is 55 - 22 = 33px against 6.8px of dash per 1/60 frame (20px at
// main.js's 0.05 clamp), so the coral is always gone several frames before the push-out could fire.
export const BURST_CRUSH_MUL = 2.5

// ---- LUNGE (v7.x, The Wreck — chapters declaring `lunge: true`) --------------------------------
// The Wreck's half of the same one button. Same press, same cooldown, same PULSE_CHARGE_COST spend
// as the Pulse and the Burst — never a second button, never a second bar.
//
// IT IS THE ONLY BUTTON IN THE BOOK THAT PAYS ITS OWN COST BACK, and that is the chapter rather than
// a generosity. Bloodlust is fed by kills and nothing else, so a button that spends bar to make a
// kill more likely is the loop stated as a verb: commit and you accelerate, hoard and you stall. The
// other four chapters' buttons all spend a bar you refill somewhere else, so none of them could have
// this shape.
//
// A DASH-BITE RATHER THAN A DASH. The Reef's Burst buys an axis the lane denies you; The Wreck is
// free-roaming and denies you nothing, so distance alone would be a worse Pulse. What this chapter
// is short of is TIME — the bar is falling the whole time — so the button buys a kill, not a
// position. Hence the damage on the first body and, above all, LUNGE_KILL_REFILL.
//
// THE NO-SPIRAL FLOOR IS THE SHIPPED SHOVE, not a weakened lunge, and that is the global invariant
// (stepRepulse's `t = spend / cost` is 0 on an empty bar). A starving player still gets the v5.21
// Pulse unchanged. That matters more here than anywhere else in the book: this is the one chapter
// where being at zero is itself the failure state, so the button must not ALSO be gone.
export const LUNGE_SPEED = 900           // px/s while the dash is live — well over baseSpeed 220
export const LUNGE_DUR_AT_FULL = 0.30    // s at a full spend -> 270px. No _MIN twin: see above,
                                         // an empty bar fires the shove instead of a short lunge.
// x PLAYER.radius (22) -> 62px, a touch wider than BURST_CRUSH_MUL's 55 for the same reason that one
// must exceed the collision radius: the bite has to land before the body it is aimed at can shoulder
// the player, or the move reads as bouncing off what it is supposed to be eating.
export const LUNGE_BITE_MUL = 2.8
// HOW FAR THE DASH MUST CARRY YOU BEFORE THE BITE ARMS. Without it the button had no dash at all in
// its most common case: stepRepulse runs after stepPlayerMovement and stepBite later in the same
// step, so a body already standing in the bite radius was bitten on the press frame — 45 charge, one
// nibble, zero of the 270px. In a chapter whose whole premise is standing in a crowd, that is the
// case rather than the corner.
//
// IT ALSO SETTLES WHAT THE TWO HALVES OF THE PRESS ARE FOR, which was the real problem underneath.
// One press fires the Pulse AND the Lunge, and they had been pulling in opposite directions — the
// shove throws the crowd away from you while the dash drags you into it. Arming the bite past the
// shove's own business separates them cleanly: THE SHOVE HANDLES WHAT IS ON TOP OF YOU, THE LUNGE
// HANDLES WHAT IS OUT THERE. Complementary rather than cancelling, off one button.
//
// 110px: comfortably past the bite's own reach (LUNGE_BITE_MUL x PLAYER.radius = 62, plus a body's
// radius) so a mob that was adjacent at press time is genuinely left behind, and comfortably under
// the 270px a full spend buys, so the armed window is most of the dash.
export const LUNGE_ARM_DIST = 110
// Flat, times the run's own damageMul, on MINIME_BURST_DMG's precedent — the shipped player ability
// that also deals a one-off number. ONE BODY ONLY, the first one reached, and the bite ENDS the
// dash: a move that cleaves a crowd is the Pulse with damage on it, and this chapter's bar wants you
// to choose a target rather than to sweep.
// ⚠ FLAT MEANS IT DECAYS. A literal that is a real hit at t=60 is a scratch at t=300, and this one
// has never been measured against either. It is the second thing charge-probe has to answer, after
// the drain/killBase pair.
export const LUNGE_DMG = 46
// THE WHOLE POINT, and the number is set so the arithmetic actually says what the design claims.
// A kill BY THE BITE banks this, and the ordinary killBase lands on the same kill, against a
// PULSE_CHARGE_COST of 45. An earlier cut sat at 30, which with killBase's 5 came to 35 — i.e. a
// connecting kill still cost you 10 net, while the block above it asserted the button "pays its own
// cost back". It did not, and the suite's own PASS line printed the disproof (a full bar ending a
// connecting kill on 87.4) without anything reading it as one.
//   45 + 5 = 50 against 45: a lunge that connects is NET POSITIVE by 5, a lunge that whiffs costs
// the full 45, and hoarding costs you the kills the button would have bought. That is the loop the
// chapter exists for, and it only works if connecting is genuinely better than not pressing.
// ⚠ Deliberately a near-wash rather than a big win: at a large surplus the optimal play collapses
// back into holding the button down, which is the autoplay failure the roster's guard tank exists
// to prevent. If this is ever raised, check that first.
export const LUNGE_KILL_REFILL = 45

// RENDER-ONLY. How red the player goes at a FULL Bloodlust bar, as pHot's alpha — the same
// alpha-blended red silhouette the berserk anomaly uses, because the alternative was teaching
// render.js a second red for the same idea.
//
// DELIBERATELY UNDER BERSERK_TINT_MAX (0.5), and the gap is the point. Berserk is a rare timed
// window that must stay the loudest red in the game; bloodlust is the ambient state of a whole
// chapter, and at the same ceiling it would sit at full wash for minutes and stop carrying
// information. render.js takes the MAX of the two rather than adding them, so a berserk window
// inside a full bar still reads as the berserk.
export const LUST_TINT_MAX = 0.34

// ---- GNASH (v7.x, The Wreck's native) ---------------------------------------------------------
// The falloff, and it runs the OPPOSITE way to every other reach number in this file. A body at the
// jaw takes GNASH_MAW_MUL x the card's damage; a body at the very tip of the arc takes exactly the
// card's damage. Linear in between, off the enemy's centre distance against the sweep's own range —
// so the mod that lengthens the reach also dilutes the ramp, which is why there is no reach mod.
export const GNASH_MAW_MUL = 1.9
// The rake's +10 points of crit is the precedent; a bite is the same kind of committed melee.
// ⚠ A FRACTION, NOT A PERCENT. applyDamage adds this straight onto p.critChance (0.05), so the
// units here are the same as CLAW_BASE_CRIT's: "+10 points" is 0.10. Written as `10` it makes
// `Math.random() < 10` unconditionally true — every bite a guaranteed crit, and the card silently
// dealing 1.40x its tuned damage (mean x1.5 against the intended x1.075). It shipped that way and
// was found from play: "bite has 100% crit chance i dont know why". Run PY.m asserts the RATE.
export const GNASH_BASE_CRIT = 0.10
// ---- BLOODRUSH (v7.x, gnash) -------------------------------------------------------------------
// Owner: "biting an enemy increases speed by 5% for 2s". The 5% is the card's own base; these two
// are the shape around it. MULTIPLIED into the player's speed rather than MIN-composed with the
// chapter's slows, for the reason SCENT_SPEED_MUL gives at the same site: those are floors on how
// slow the world may make you, this is a bonus you bought.
export const RUSH_DUR = 2.0          // s, refreshed by every landed bite
export const RUSH_MAX_STACKS = 5     // ceiling, so a long chain cannot outrun the chapter entirely

// ---- OIL RING (v7.x, bilge) --------------------------------------------------------------------
// RING_N pools on a circle instead of one pool at the target. Two constraints fight here and both
// are load-bearing:
//   CLOSURE. Neighbours must overlap, or prey walk out of the gap: 2*rr*sin(pi/RING_N) <= 2*pr.
//     That caps rr at pr/sin(pi/RING_N) — 2*pr for six pools, 2.61*pr for eight.
//   AN INTERIOR. The hole is rr - pr, and BILGE_AVOID_PAD (46px) eats into it from every side, so
//     the free water in the middle is rr - pr - 46. At six pools and the maximum legal rr that is
//     8px at L1 — no interior at all, and the ring's own avoidance then shoves the school out
//     through the gaps. Measured: a 6-pool ring HELD 4 of 6 drifting fish where no ring at all
//     held 5, i.e. it was worse than nothing.
// Eight pools buys the room: at L1, eight 60px pools on a 144px circle, neighbours 110px apart
// against 120px of width (closed), leaving an 84px hole and 38px of genuinely free water.
export const RING_N = 8
export const RING_R_MUL = 2.4
export const RING_POOL_MUL = 0.5

// bloodInTheWater: below this fraction of max HP a body counts as wounded and the mod's bonus
// applies. A third, not a half, so it is a finisher rather than a flat damage mod wearing a
// condition — at half, the majority of a soft prey chapter's bodies qualify on the FIRST bite and
// the card is just Deep Bite again.
export const GNASH_FINISH_FRAC = 0.34
// deathRoll (WEAPON_MODS.gnash) is THE MOD MOST ADAPTED TO THIS CHAPTER — where the whole
// difficulty is that dinner is faster than you, a bite that stops the thing it lands on is worth
// more than damage. Its duration lives on the card as `base` rather than as a constant here,
// because the card's banked bonus IS the number the sim reads and a second copy is the one-fact-
// two-places trap. Two facts about it that are NOT on the card:
//   - it is routed through ccScale/spendCC like every other stun in this file, so it takes CC
//     diminishing returns and cannot become the permanent field-wide lock v7.16 removed;
//   - it publishes to `stunT`, which render.js already reads and holds the pose for. A private
//     field would be a status with no tell, which is exactly what "cold does nothing" looked like.

// ---- CHUM (v7.x, The Wreck) --------------------------------------------------------------------
// A run.lures entry with `bait: true`. The tag is read in exactly two places — stepEnemyMovement's
// lure override (which already sets the seek target) and stepPrey (which inverts its response to
// it) — and nowhere else, because a bait and a decoy ARE the same object pointed at two kinds of
// animal.
// How hard a baited fish commits, as a fraction of its own speed. ABOVE PREY_DRIFT_MUL and below
// PREY_FLEE_MUL: a shoal coming to food moves with more purpose than one milling about, and less
// than one running for its life.
export const CHUM_PULL_MUL = 0.85
// Chum does not override PANIC. Inside this radius of the player a baited fish bolts anyway, which
// is what stops the card from being an off-switch for the chapter: you cannot stand in your own
// bait ball and have dinner hold still, you have to come in from outside it.
export const CHUM_PANIC_R = 150

// ---- BILGE (v7.x, The Wreck) -------------------------------------------------------------------
// The oil's drag is BLOOM_SLOW's, not its own number. bloomSlowT is a boolean-ish window — it
// records THAT a cloud touched this frame, never which one — so a second magnitude would need a
// second field, a second decay and a second tell before it was distinguishable from the first. The
// card quotes no figure, so there is nothing for a shared constant to make untrue.
// slickTrail: the card stops being one circle at a time and becomes a line you draw. Implemented as
// a faster, smaller cast rather than as a new entity — a trail IS a chain of pools, and the shipped
// bloom already knows how to be one. The pair has to move together: keeping the radius while
// tripling the cadence would carpet the map in oil, which is a wall against the whole chapter.
export const BILGE_TRAIL_RATE_MUL = 0.36   // x the cast interval
export const BILGE_TRAIL_R_MUL = 0.58      // x the pool radius
// How far OUTSIDE the oil a skittish fish starts turning away. The wall has to have a shoulder or
// prey clip the rim before they react and the barrier reads as porous.
export const BILGE_AVOID_PAD = 46
// How hard the avoidance steers, blended against whatever the fish was already doing. At 1 they
// pivot on the spot, which reads as a force field; this is a fish declining to go that way.
export const BILGE_AVOID_BLEND = 0.75

// ---- PREY (v7.x, The Wreck) — the `skittish` flag ---------------------------------------------
// THE ONE THING IN THIS GAME THAT IS NOT COMING FOR YOU. Every other creature in every other
// chapter resolves to "walk at the player"; a skittish one walks AWAY, and it cannot hurt you at
// all (contactHarmless, sim.js). Both halves are the same design fact — this is food — which is
// why they hang off one flag rather than two.
//
// The flee itself is not new code: `fearT` has inverted the seek since v5.4 and render.js already
// reads it. What is new is that it is PERMANENT and INTRINSIC rather than a status a weapon
// applies, and that distinction is load-bearing rather than pedantic — v7.16 removed fear's
// disarm precisely because a field-wide permanent fear made an unkillable machine-gun lock out of
// a weapon mod. A roster flag cannot be stacked, refreshed or spread by a build.
export const PREY_SIGHT_R = 340        // px. Outside it the shoal has not seen you and mills about.
// x the fish's OWN speed while running. The whole hunt falls out of this number against the three
// archetype base speeds (ENEMIES above) and the player's 220:
//   normal 90 x 0.85 x 1.35 = 103 px/s  — easy meat, and the bar's staple
//   fast  165 x 1.00 x 1.35 = 223 px/s  — FASTER THAN YOU. It cannot be caught by swimming at it;
//                                         it is what the Lunge button (900 px/s) is for.
//   the tank does not flee at all — see CHAPTERS.wreck.roster.
// So do not read 1.35 as flavour: raise it and the fast prey becomes uncatchable full stop, lower
// it and the button stops having a job.
export const PREY_FLEE_MUL = 1.35
export const PREY_DRIFT_MUL = 0.30     // x its own speed while it has not seen you — a slow mill
export const PREY_TURN_RATE = 0.45     // rad/s the idle drift heading swings
// A SCHOOL FOR THE PRICE OF A MODULO. Consecutive enemy ids arrive in the same spawn burst, so
// bucketing by id gives fish that appeared together a shared drift heading and a shared escape
// heading — they mill as a body and they break as a body. That is what reads as a shoal on screen.
// Deliberately NOT boids: neighbour queries over 500+ bodies to buy the same silhouette is the
// trade this repo's separation pass already regretted once.
// ponytail: id buckets, not neighbours — if schools ever need to MERGE or SPLIT on contact, that
// is when this becomes a real flocking pass and not before.
export const PREY_SHOAL_SIZE = 16
// How much of the escape heading is "straight away from you" vs "the way my school is already
// going". At 1.0 a shoal explodes radially like a firework, which is the one silhouette a bait
// ball never makes; the blend is what keeps it a body of fish peeling off in a direction.
export const PREY_FLEE_BLEND = 0.7

// ---- THE LEAK (v7.x, The Wreck's signature) ----------------------------------------------------
// THE BOAT IS THE POLLUTION. Owner ruling 2026-08-17, taken when the chapter turned into a hunt:
// with the whole roster demoted to food, nothing on the map is a threat any more, and a chapter you
// cannot lose is not a chapter. The threat had to be human — a shark's only predators are orcas and
// people — and it had to not be a NET, because The Trawl one chapter later is the net and owns that
// noun outright.
//
// So the wreck leaks. Drums and cargo split open on the bottom, and what comes out of them sits
// there. It does not chase, does not aim, does not spawn on a timer and does not know the player
// exists — the same "not aiming at you" grammar The Trawl's net is built on, one chapter early and
// in a form that stays still. What makes it dangerous is entirely that the food is on the other
// side of it.
//
// Geometry is refillCircleAt's (sim.js) — the same pure cell->circle function that already places
// The Shelf's shafts, The Surf's pools and The Reef's pockets. This is the fourth field through it
// and the first that HURTS rather than feeds, which is why it lives in run.slicks and not in
// run.shafts: stepCharge loops run.shafts to hand out resource, and a poison the bar thanks you for
// standing in would be exactly the kind of one-word semantic collision this file keeps warning
// about. Salt 50 — obstacles hold 0-4, eddies 11-14, traps 15-17, refill circles 20-23 and 30-34,
// The Reef's pockets 40-45.
export const SLICK_TICK = 0.5          // s between damage ticks, DROWN_TICK/STARVE_TICK's cadence
// ⚠ 6 dps IS AN UNMEASURED FIRST CUT and must not be quoted. It is deliberately ABOVE starve's 4:
// starving is a self-inflicted tempo failure with the fix in front of you, while a slick is a place
// you chose to swim into, and the chapter has nothing else that can kill you. x SLICK_TICK 0.5 = 3
// exactly, so the config number survives hurtPlayer's dot rounding (STARVE_TICK's own scar).
export const SLICK_DPS = 6
// The one thing it does besides damage, and it is the half that makes it a decision rather than a
// tax: oil fouls you. You come out the other side slower than you went in, for a moment, which is
// how a shortcut through a slick costs you the fish you were chasing as well as the health.
export const SLICK_SLOW_MUL = 0.62
export const SLICK_SLOW_T = 1.4        // s the fouling lasts after you leave

// ---- THE TRAWL (v7.x Book 2 ch 4 — chapters whose signature is `trawl`) ------------------------
// A net wall crosses the map on a timer, from a direction, and it AIMS AT NOTHING. It kills the
// player and it kills the crowd, in the same pass, on the same tick. That last part is the chapter,
// not a side effect: every other threat in this game is pointed at you, and the one thing in Book 2
// that is indifferent to you is the one that makes the ocean feel industrial.
//
// Precedent for hurting both sides is shipped twice already — stepRocks ("hurts the player on
// contact AND grinds" enemies) and the undergrowth's snap traps, whose config block says outright
// "it damages BOTH sides, and that IS the mechanic". This is those two at map scale.
//
// THE NET IS AN INFINITE LINE, not an entity with ends, and that is a deliberate consequence of the
// world being streamed and unbounded. A wall with ends is a wall you walk around, and at 300s a
// player can be 20,000px from the origin — so "the map" has no edges to span. The line is carried as
// a unit normal (nx, ny) and a signed offset `pos` along it, and sweeps by advancing `pos`. Every
// test in stepTrawl is then one dot product, which is also why the cost does not grow with distance.
//
// ⚠ SPEED IS THE ONE NUMBER WITH A DERIVED BAND, from spec §6.4: outrunnable but not ignorable.
// The joystick's expressible speed set is {0} ∪ [33, 220] — DEADZONE 0.15 x baseSpeed 220 is a hard
// CUT, not a rescale — so anything under 33 is beneath the slowest correction a player can even
// make, and anything near 220 is a wall rather than a sweep. 75 sits mid-band, and above
// KITE_MIN_SPEED (100) is deliberately NOT crossed: stepStragglers recycles the horde into the
// heading of a player moving faster than that, which here would mean the net herding the crowd onto
// you. Running from the net should bring the crowd with you, but as a consequence of your own
// speed, not of the net's.
export const TRAWL_SPEED = 75            // px/s the wall sweeps — spec §6.4's 60-90 band
export const TRAWL_INTERVAL = 26         // s from one pass clearing to the next one arriving
// The FIRST pass, which is deliberately not TRAWL_INTERVAL and is a teaching decision rather than a
// tuning one. The bar starts full and drains at 2.6/s, so `tire` (below 45% of 100) begins biting at
// ~21s — which is BEFORE the first wall would ever have appeared on the shipped interval. A player
// would spend their first half-minute slowing down for no visible reason, in a chapter whose entire
// answer to that is a thing they have not been shown yet. Ten seconds puts the wall on screen while
// the bar is still comfortable, so the order the chapter teaches itself in is: here is the net, here
// is what it leaves behind, here is why you needed it.
export const TRAWL_FIRST_PASS = 10
export const TRAWL_HALF = 30             // px half-thickness of the mesh itself
// How far ahead of the player a pass STARTS, and how far past them it runs before it is dropped —
// as a multiple of run.viewRadius, never in world px. A world-px lead is a different amount of
// warning on a 390x844 phone than on a 1280x800 desktop (half-diagonals 465 and 755), and the
// warning IS the mechanic: this is the shipped bug the Shelf's dark had, written down as a rule in
// CLAUDE.md, applied here before it can happen again. At 1.6 the wall enters vision with
// 1.6 x 465 / 75 = 9.9s of warning on a phone and 16.1s on a desktop — the phone's is the one that
// has to be survivable, and the desktop simply sees it coming sooner, which is the right way round.
export const TRAWL_LEAD_MUL = 1.6
export const TRAWL_TICK = 0.35           // s between contact ticks, for player and enemies alike
export const TRAWL_DMG = 9               // player damage per tick in the mesh
export const TRAWL_ENEMY_DMG = 34        // enemy damage per tick — the net out-kills you, and should
// The churned wake: sediment and prey stirred up by the thing trying to catch you, and the ONLY
// place Feed comes from. World px, like every other refill geometry in the book (the shelf's shafts,
// the surf's pools, the reef's pockets are all world radii), because it is a place on the map rather
// than a quantity compared against the screen.
//
// 420 against TRAWL_SPEED 75 is 5.6 seconds of feeding per pass if you ride it the whole way, and
// riding it means holding station beside a wall that kills on contact. That is §5.2's refill rule —
// "a place you can fight from, never a place you go to stop" — in its strongest form in the book:
// there is nowhere to stop, because the only food in the chapter is moving at 75 px/s.
export const TRAWL_WAKE_DEPTH = 420

// ---- BREACH (v7.x, The Trawl — the button) ----------------------------------------------------
// The same press, the same cooldown and the same spend as the Pulse and the Burst: `t` comes from
// stepRepulse, so a chapter never gets a second button or a second bar. Breach tears a hole in the
// net at the player's own position on it, and THE HOLE PERSISTS for the rest of that pass — a door
// you made, which the crowd will also use, because the hole is a gap in one line and the line does
// not know who is standing in it.
//
// THE FLOOR IS THE RADIUS, exactly as the Burst's floor is its duration, and here it is load-bearing
// rather than a courtesy. This chapter's second job is that an empty bar makes you SLOW, and a slow
// player is one the net catches — so if an empty bar also could not tear a hole, running dry would
// be the structural trap spec §8.2 forbids, with the two halves of the chapter conspiring to build
// it. BREACH_R_MIN is therefore wider than the player: at zero Feed you can still cut your way out,
// you just cannot cut a door for the crowd to follow you through.
export const BREACH_R_MIN = 70           // px hole radius on an EMPTY bar — the no-spiral floor
export const BREACH_R_AT_FULL = 220      // px at a full PULSE_CHARGE_COST spend
// You must be NEAR the net to cut it. Without this the button is free — pressed on cooldown from
// anywhere, the wall is never a decision. With it, breaching means turning back toward the thing
// that is killing you while it is still 500px out, which is the trade the chapter is made of.
export const BREACH_REACH = 520          // px from the mesh's centre line, either side
export const BREACH_MAX_HOLES = 6        // per pass; a wall cut to lace is not a wall

// ---- THE DARK (v7.x Book 2, owner directive) --------------------------------------------------
// The bar is no longer only the Pulse's ammo. Owner's words: "if we're stealing light, then our
// surroundings should be dark, and darker the less light we have", plus a drawback while you are
// down there. The SLOW rides `darkness(charge, res)` below, which is 0 until the bar falls under
// `from` and then ramps — a penalty that only bites once you are genuinely low.
//
// THE LIGHT DOES NOT. Owner, 2026-08-13, after three attempts that all gated it on `from`: "I want
// the light radius to fade, not the whole screen. Base light radius at 100% bar filled is the
// biggest dimension of the screen, then it reduces down linearly to 10% that radius." So the radius
// is a plain linear function of the RAW bar across its whole range, and it is the one thing the
// player reads continuously — every point of Light spent is visible immediately, rather than the
// top half of the bar doing nothing while the threshold waits.
//
// The two schedules are therefore deliberately different, which reverses an earlier ruling that
// they must be one fact. That ruling is what produced three shipped versions in which the light was
// unreadable for the top half of the bar; the slow keeps `from` because a penalty wants a
// threshold, and the readout does not.
//
// The chapter declares `resource.dark = { from, speedFloor, dim, radiusFull, radiusEmpty }`:
//   from        - charge FRACTION at and above which THE SLOW does nothing. It does NOT gate the
//                 light: see radiusFull.
//   speedFloor  - player move-speed multiplier at charge 0 (sim; see stepPlayer's slowMul MIN).
//   dim         - alpha of the darkness OUTSIDE your light. A CONSTANT: the radius is the readout
//                 and the far field is simply what lies beyond it. (RENDER ONLY, but it lives here
//                 with the rest of the mechanic rather than in the `render` block.)
//   radiusFull  - the light's radius AT A FULL BAR, as a multiple of the screen's LONGEST SIDE.
//   radiusEmpty - ...and at an empty bar. Linear between the two, in raw charge.
//
// YOU ARE THE LAMP (owner, 2026-08-12, revising the first cut). The first version ramped the alpha
// of a UNIFORM screen-wide sheet, which is the wrong picture twice over: "I thought the light
// dimming would be the light RADIUS diminishing, you being slowly engulfed in darkness, not the
// whole screen diminishing. like you are the source light, you EMIT the light, but the less light
// you have, the less far you emit." A flat sheet says the sun went out; a shrinking radius says the
// light is yours and it is running out, which is the only reading under which stealing it back off
// the sea floor is a thing you would want to do. It also fixes a legibility problem the flat sheet
// had by construction — dimming everything uniformly costs you the far field and the enemy on your
// hip in equal measure, where a radius always leaves the metre around you at full strength and
// takes the horizon, which is the trade a survivors-like can actually be played against.
//
// `dim` is a CONSTANT, and an attempt to ramp it was rejected in play: "I want the light radius to
// fade, not the whole screen". Fading the far field's alpha is the flat sheet the paragraph above
// rejects wearing a second coat — it dims the horizon and the enemy on your hip together, and it
// measured as doing nothing anyway, because at a large radius there is almost no far field for an
// alpha to act on (mean screen luminance at 30% of the bar came back LIGHTER: 84.3 against 82.5).
// The radius is the whole readout. The far field is just what lies outside it.
//
// WHICH drawback is an owner ruling, taken 2026-08-12 against three alternatives. Move speed, not
// damage and not accuracy, because weapons auto-fire: a slow player still kills at the same rate,
// so kills still pay (with LIGHT_THIEF bought) and the state is escapable. Damage-down and
// shots-go-wide both cut the kill rate, which is the same spiral the Pulse's floor exists to
// prevent, one level up.
//
// SPEED, NOT VISION, is also why the dim can be generous: it stacks on top of "you cannot see the
// crowd arriving", which in a survivors-like is already a real cost.
// THE BOTTOM-OF-THE-BAR RAMP, shared by the two chapters whose bar has a second job that fades in
// rather than switching on. 0 at the threshold, 1 at an empty bar. Factored out of darkness() when
// The Trawl wanted the same CURVE for a different CONSEQUENCE — one shape, two meanings, rather than
// the same four lines written twice a thousand lines apart and left to drift.
// The `!block` test comes first so a chapter with no such block never reads res.max, which is what
// lets both wrappers below be called unconditionally from a hot path.
//
// `max` (v7.x Book 2, per-book progression): the CEILING the fraction divides by, defaulted to
// `res.max` so every existing call keeps meaning what it used to. Deep Lungs (run.chargeMax) can
// raise a run's own ceiling above `res.max`, and this function has no `run` to read (config.js is
// pure data + pure helpers, and imports nothing) — so the caller passes its OWN ceiling in rather
// than this reaching into `run` itself. Without it, a Deep Lungs run's `frac` saturates at 1 for
// the entire band between res.max and the raised chargeMax: the screen would read "fully lit" and
// hold there, motionless, for the first slice of every drain — the mechanic's one piece of
// feedback going silent right when the bar is at its fullest. It is threaded through the RAMP
// rather than through darkness() alone so The Trawl's tiredness inherits the same fix; the two
// wrappers share a curve, so they must share its ceiling or they drift the moment one is tuned.
const barRamp = (charge, res, block, max = res?.max) => {
  if (!block) return 0
  const frac = max > 0 ? charge / max : 1
  return frac >= block.from ? 0 : (block.from - frac) / block.from
}
export const darkness = (charge, res, max = res?.max) => barRamp(charge, res, res?.dark, max)
// How TIRED you are, given `resource.tire` — The Trawl's second job. Same curve as the dark's, and
// deliberately not the same consequence: the dark takes what you can SEE and this takes what you can
// OUTRUN, which in a chapter whose signature is a moving wall is the difference between a handicap
// and a death sentence. See CHAPTERS.trawl.resource for the measured split.
export const tiredness = (charge, res, max = res?.max) => barRamp(charge, res, res?.tire, max)

// How far the light reaches, in screen px, given `maxDim` — the screen's LONGEST SIDE. Linear in
// the raw bar from radiusFull down to radiusEmpty, per the owner's spec (see THE DARK above).
//
// MEASURED AGAINST THE SCREEN, not in world px, and that part is a shipped bug rather than a
// preference: a fixed world radius is compared against a screen that is 844px tall on a phone and
// 1280px wide on a desktop, so one number meant "the light never reaches the edge" on one device
// and "the light always covers everything" on the other. Every dark chapter wants the same FRACTION
// of the screen lit, so the fraction is the thing to write down.
//
// The longest side, specifically, and not the half-diagonal: it is the dimension the player can
// actually name ("about a screen"), and at radiusFull 1 it puts the rim comfortably off-screen at a
// full bar on every aspect ratio, so the chapter opens clean everywhere.
//
// RAW charge, not darkness(): the light is a continuous readout of the bar and must move at 90% as
// visibly as at 20%. Infinity (not 0) for a chapter with no dark block — "this chapter lights
// everything" is the identity here, and a 0 would black the screen out.
//
// `max` (v7.x Book 2 Task 9 fix round): same reasoning as darkness() above — a fourth, TRAILING
// parameter (maxDim already owns position 3) so a caller with a run's own chargeMax passes it
// explicitly, and everything else defaults to res.max exactly as before.
export const lightRadius = (charge, res, maxDim, max = res?.max) => {
  const d = res?.dark
  if (!d) return Infinity
  const frac = max > 0 ? Math.min(1, Math.max(0, charge / max)) : 1
  return maxDim * (d.radiusEmpty + (d.radiusFull - d.radiusEmpty) * frac)
}

// Where a chapter's refill circles come from. run.shafts is the ONE list of "streamed circles you
// stand in to refill", and three chapters fill it from different places: The Shelf's shafts ARE its
// signature (cell/chance/r/minDist sit directly on it), while The Surf's tide pools and The Reef's
// air pockets are sub-blocks, because those signatures already own something else (the surge and
// the sandbars; the lane).
//
// Returning the signature OBJECT ITSELF for shafts — not a copy — is deliberate and asserted: the
// Shelf's tune was measured against that exact object, and a copy would be a second thing to keep
// in sync for no gain.
//
// ONE function, THREE readers — streamShafts (sim.js, which decides existence), reset/updateShafts
// (render.js, which decides what the circle looks like) and scripts/charge-probe.mjs. Adding a
// chapter's refill geometry here is what keeps those three from becoming three independent chapter
// tests that can disagree; that is not hypothetical, it is exactly how The Surf's tide pools — its
// entire refill mechanic — shipped invisible behind a `signature.type === 'shafts'` test in
// render.js while the sim was streaming them fine.
// `maws` (v7.x, The Deep) is the fourth name and the one that is not a place at all — it is an
// animal with its mouth open. It reads through here for exactly the reason this function exists:
// streaming, refilling and drawing a field of circles is one problem with one answer, and the only
// thing The Deep changes is what happens if you STAY (stepMaws). A chapter that had grown its own
// streamer for this would have grown its own bugs for it too.
export const refillSpec = (sig) => (sig?.type === 'shafts' ? sig : (sig?.pools ?? sig?.pockets ?? sig?.maws ?? null))

// DOES THIS CHAPTER NEED run._obstacleSeed? Five streamers hash off that one seed — obstacles,
// eddies, traps, refill circles and sandbars — but createRun used to draw it for the FIRST of them
// alone, `CHAPTERS[chapter].obstacles ? … : null`, back when it was the only one. That held right up
// until a chapter wanted a streamed floor and no furniture on it: The Surf turned `obstacles` off
// (owner, 2026-08-15) and lost its sandbars AND its tide pools in the same line — the whole
// signature, the whole resource economy — because every streamer early-returns on a null seed.
// Silently, and nowhere near the edit: nothing throws, the chapter just comes up as bare sand.
//
// So the predicate names what actually consumes the seed. Every chapter that has any of these today
// also has obstacles, so this returns exactly what the old expression did everywhere except The
// Surf — which matters beyond tidiness, because the draw is a Math.random() call and a chapter that
// starts or stops making it re-phases its entire run.
export const usesObstacleSeed = (ch) => !!ch.obstacles || !!refillSpec(ch.signature) ||
  !!(ch.signature && (ch.signature.eddies || ch.signature.traps || ch.signature.bars))

// How hard you hit, as a function of the chapter bar. OWNER RULING 2026-08-13, overriding the
// earlier rule that the bar never touches damage — see the design doc's §5.3 for what that rule was
// protecting and which mitigations replace it. HUMIDITY_DMG_FLOOR itself lives just above CHAPTERS
// (it is referenced directly inside CHAPTERS.surf.resource, which is built before this point in the
// file — see the comment there).
//
// Opt-in per chapter: only a resource declaring a `damage` block participates, so The Shelf, The
// Reef and The Trawl are untouched and their census numbers stay comparable with Book 1's.
//
// LINEAR from the floor to 1.0, deliberately: the reviewed failure was a multiplier you cannot feel
// in its top half and fall off a cliff in its bottom, and a curve with a knee is that shape by
// construction. A straight line at least reports its own state honestly.
//
// `max` (v7.x Book 2 Task 9 fix round): same trailing-default idiom as darkness()/lightRadius()
// above — defaults to res.max, a caller holding a run passes run.chargeMax instead.
// `peak` (v7.x, The Wreck): the line's TOP, defaulting to 1.0 — which is what every caller before
// this chapter got implicitly, so The Surf comes out byte-identical (floor .7, no peak -> .7 + .3t,
// character for character the expression this replaces). It exists because Bloodlust is the first
// bar that pays rather than taxes: floor 1 / peak 1.8 is a line entirely ABOVE baseline, where
// Humidity's is entirely below it. One curve, both directions, so there is never a second helper
// to drift against this one.
// The shared line. `b` absent -> 1, i.e. the chapter does not participate and pays nothing.
const rampOn = (b, charge, max) => {
  if (!b) return 1
  const lo = b.floor ?? 1, hi = b.peak ?? 1
  return lo + (hi - lo) * Math.min(1, Math.max(0, charge) / (max || 1))
}
export const resourceDamageMul = (charge, res, max = res?.max) => rampOn(res?.damage, charge, max)

// The same line on `res.rate`, driving the global fire-rate multiplier. A separate BLOCK rather
// than a second field on `damage` because a chapter may want one without the other, and separate
// blocks are what make that expressible without a sentinel.
export const resourceRateMul = (charge, res, max = res?.max) => rampOn(res?.rate, charge, max)

// ---- POLLUTION (The Shelf) --------------------------------------------------------------------
// `run.charge` counts how CLEAR the water is in every chapter, this one included; `invert: true` on
// CHAPTERS.shelf.resource flips the RAIL'S READOUT and nothing else, which is what that block says
// and all it says. Two weapon mods now want the pollution NUMBER, which is the case its own
// `ponytail:` note was written for -- and its stated upgrade path, "give run.charge a real inverted
// twin rather than flipping it a second time", is taken here as a DERIVATION rather than as a run
// field. A stored twin is a second place the same fact lives, and it would have to be kept in step
// at every site that writes run.charge; one pure function cannot drift from its own input.
// 0 in clean water, 1 in the filthiest. A chapter whose bar is not inverted has no business asking.
export const pollutionFrac = (charge, max) => 1 - Math.min(1, Math.max(0, charge) / (max || 1))

// ---- STARVING (v7.x, The Wreck — resources declaring a `starve` block) -------------------------
// The Reef's `drown` shape, one chapter later, and the duplication is deliberate rather than
// factored: they are the same MECHANISM answering opposite PROBLEMS, and a shared `dot` block would
// hide that. Air is a routing problem — you are at zero because you did not cross the lane to a
// pocket, and the fix is on the map. Bloodlust is a tempo problem — you are at zero because you
// stopped killing, and the fix is the thing in front of you. Same red pulse, different sentence.
//
// Same half-second cadence as DROWN_TICK and for the same two reasons (hurtPlayer rounds a DoT hit,
// so the config number must survive the multiply; and two bigger beats read as a state where four
// small ones read as static). Same shipped tell — {type:'hurt', dot:true} — and no new event.
export const STARVE_TICK = 0.5

// ---- DROWNING (v7.x, The Reef — resources declaring a `drown` block) ---------------------------
// The Reef's second job for its bar, and the opposite SHAPE from The Surf's. §5.3 spends the book's
// one licence for a bar that drives damage on Humidity, and spends it on an onboarding chapter
// whose cause is a place you can physically step off. Empty air is not that: it is a state you are
// in, so it hurts on a clock rather than scaling an output, and it stops the instant you breathe.
// A multiplier is imperceptible in its top half and a cliff in its bottom; a DoT is legible at
// every level because it is the same red pulse every time and it only exists at zero.
//
// A HALF-SECOND CADENCE, not STATUS_TICK's 0.25. Two reasons, and both are about being read:
//   - hurtPlayer floors a DoT hit at 1 HP and ROUNDS it, so a tick has to be big enough that the
//     config number is the damage actually delivered. drown.dps 6 x 0.5 = 3 exactly; at 0.25 it
//     would be 1.5 -> 2, i.e. a config saying 6 and a game doing 8.
//   - render.js's `hurt` case scales its shake/vignette/flash by the hit's fraction of maxHP, so
//     two bigger beats a second read as drowning where four small ones read as static.
// The tell itself is entirely the shipped one: {type:'hurt', dmg, dot:true} already draws a red
// vignette + shake + flash, and main.js already silences `e.dot` for audio. NO new event type, on
// purpose — an event with no consumer in render.js or SFX_FOR_EVENT is the freeze scar, and a
// chime twice a second for as long as you are empty is the nagging SUBMISSION's expiry was denied.
export const DROWN_TICK = 0.5            // s between drowning ticks while the bar is empty

// ---- The death outro (v7.x Book 2) ------------------------------------------------------------
// A BEAT BETWEEN THE KILLING BLOW AND THE SUMMARY. Owner report: "the player sees the death modal
// almost before seeing the enemy last hitting you." That is literally true and it is not a tuning
// problem — hurtPlayer sets phase 'dead' and main.js's very next line calls endRun, so the modal
// goes up on the SAME frame the last hit lands. There were no frames to lengthen; this creates them.
//
// WHO OWNS THE CLOCK. main.js, in `run.deathT`, because main.js owns phase transitions (see its
// header) and because the alternative — a timer in main.js for the modal and a second one in
// render.js for the picture — is exactly the one-fact-two-places drift this project's whole test
// strategy is built around. render.js READS run.deathT and never writes it, same as every other
// contract field.
//
// UNDERTOW ONLY, deliberately. Book 1's chapters are not underwater and the vent/roll/sink below is
// a drowning fish; a chapter with no outro keeps the shipped instant-modal behaviour rather than
// getting a frozen frame with nothing happening in it, which would read as a hitch.
//
// SKIPPABLE, and that is not a nicety. You die a great many times in this genre; an unskippable
// 1.3s every death is charming on run 3 and an obstacle on run 50. `skipLock` exists because the
// input that killed you is usually still held — without it the joystick or a held key eats the
// whole outro on the frame it starts, i.e. the feature would appear not to work at all.
export const DEATH_OUTRO = {
  time: 1.3,            // s from the killing blow to the summary screen
  skipLock: 0.25,       // s before input can skip — the stick is still held from the fight
  // The VENT: the last breath leaving the body. Bubbles are the only thing here moving UP while
  // everything else falls, which is what sells the picture as underwater rather than merely blue —
  // the same reasoning CORAL_CRUSH's block states for the coral burst, and the same particle idiom.
  // A RATE, not a count: one burst is a pop, a stream that thins out is a body running out of air.
  ventT: 0.75,          // s the vent lasts — well short of `time`, so the bubbles stop before the dark
  // MEASURED FROM THE PROBE, not chosen. A linear taper emits rate x ventT / 2 bubbles in total, so
  // the first cut's 34 was 13 bubbles for an entire death — countable, and it read as a few stray
  // motes rather than as air leaving a body. 76 gives ~28, which is a stream.
  ventRate: 76,         // bubbles/s at the start of the vent, tapering linearly to 0 at ventT
  ventRise: 130,        // px/s upward
  ventSpread: 46,       // px/s lateral scatter
  ventLife: 1.15,       // s per bubble
  ventScale: 0.05,      // as spawnParticle scale — matched to CORAL_CRUSH.bubbles
  ventTint: 0xdff2ff,   // CORAL_CRUSH.bubbleTint — the chapter already has one colour for air
  // The BODY: a fish that stops swimming. `roll` squashes the body's y scale toward a sliver, which
  // in a PLAN VIEW is what turning belly-up looks like — the camera looks straight down (see the
  // projection rule in CLAUDE.md), so a roll cannot be a rotation. `list` is the slow uncontrolled
  // turn on top of it; `sink` drifts the whole rig down-screen away from the held camera.
  roll: 0.34,           // final bodyC y-scale multiplier
  list: 1.5,            // rad of drift over the outro
  sink: 40,             // px the body settles
  dim: 0.45,            // final playerC alpha. 0.3 in the first cut put the body BELOW the dimmed
                        // floor's own value, so the creature the outro is about was the hardest thing
                        // in the last frame to find — a fading body still has to be the subject.
  // The DARK: light loss with depth, which is what drowning actually looks like. Closes from the
  // edges in on the body, then goes flat — the iris both IS the "you're gone" beat and covers the
  // handoff to the summary, so the modal no longer cuts into a live-looking world.
  //
  // ⚠ THE SCALE NEVER GOES BELOW 1.0, AND THAT IS A CORRECTNESS BOUND, NOT TASTE. The iris is one
  // radial gradient sprite sized relative to the screen, so shrinking it below the screen leaves the
  // area OUTSIDE the sprite untouched: on a 390x844 phone a sprite closed to a tight pinhole is
  // ~500px across and does not reach the top and bottom, so the "fade to black" ends with two bright
  // bands. That is the shipped-on-one-viewport bug this project has already paid for twice (v7.58's
  // light early-out; see the two-viewports rule in CLAUDE.md). Closing is therefore done with the
  // ALPHA RAMP, which cannot uncover anything, plus a scale that only ever comes DOWN TO 1.0.
  //
  // ⚠ AND 1.0 IS ONLY ENOUGH FOR A SPRITE CENTRED ON THE SCREEN. This iris is centred on the BODY,
  // and `lane: true` chapters hold the player off-centre on purpose — The Reef puts them 20% across.
  // The first probe of this effect had a hard dark band down the right side of every frame for
  // exactly that reason. irisCoverMul (above) raises the multiplier to whatever the actual centre
  // needs, so these two numbers are the intent and it is the floor; do not remove the call and trust
  // the bound.
  irisTint: 0x04121e,   // deep-water black-blue, not pure black — the sea, not a fade-out
  irisFrom: 1.5,        // x screen: oversized, so its gradient ramp starts off-screen and dims little
  irisTo: 1.0,          // x screen: the whole ramp is now on screen. NEVER less than 1 — see above.
  irisAlpha: 1,         // peak alpha of the gradient
  irisHold: 0.35,       // fraction of `time` the dark waits before starting — the vent gets the stage
  // Short of 1 deliberately: the last thing on screen should be the body, faintly, not an empty black
  // rectangle. 0.68 rather than the first cut's 0.58 because The Reef's tide pools are very
  // light-valued objects and simply outlasted the dark at 0.58 — the brightest thing in the final
  // frame was a pool, not the creature the frame is about.
  flatAlpha: 0.68,
  // NO SHAKE KNOB, deliberately. hurtPlayer pushes {type:'hurt'} for the fatal hit BEFORE it flips
  // the phase, so render.js's existing hurt case has already fired a shake, a white/red body flash
  // and the red vignette on this very frame — scaled by the hit's fraction of maxHP, so a killing
  // blow is already the loudest one the game draws. A second shake on {type:'dead'} would double it
  // and, because that event fires in every chapter, would also change Book 1 for no visible gain
  // (its summary modal covers the screen on the next frame regardless).
}

// The death outro's progress: 0 at the killing blow, 1 at the summary — AND 1 FOREVER AFTER.
//
// ⚠ THE SATURATION IS THE POINT, and it is a pure function purely so that the suite can see it. The
// first cut had run.deathT counting DOWN and derived progress as `1 - deathT/time`, which is correct
// at every instant except the one that matters: the clock has to reach 0 to be finished, 0 is also
// the value every run that is not dying carries, and the renderer must read that as "clear the dark".
// So the terminating frame wiped the entire effect and the summary opened over a fully-lit world.
//
// The full suite, the isolation run and SEVEN mutations were all green against that. Every assertion
// proved WIRING — a clock exists, it is advanced, render.js reads it — and no assertion could see
// "the last frame is bright", because the end state lived in an inline expression inside an
// unimportable file. It was found by eye, from a probe frame that came back brighter than the one
// before it. Extracting the expression is what turns that into a testable claim (run DO.e).
export function deathProgress(deathT) {
  // Math.max floors a negative (nothing produces one today; the clamp costs nothing and means a
  // future caller cannot drive the iris backwards). Math.min is the saturation.
  return Math.min(1, Math.max(0, (deathT ?? 0) / DEATH_OUTRO.time))
}

// How big must the death outro's iris be, as a multiple of the screen, to cover the whole screen
// while centred at (cx, cy)? Returns a multiplier >= `mult`, never less.
//
// ⚠ THIS EXISTS BECAUSE THE PLAYER IS NOT ALWAYS AT THE CENTRE OF THE SCREEN, AND THAT COST A ROUND.
// The iris is centred on the BODY (the last thing you should see is yourself, not empty water), and
// `lane: true` chapters deliberately hold the player off-centre — laneFrac in render.js puts them
// LANE_CAMERA_FRAC of the way down/across the view. The Reef is an x-lane, so its player sits at
// 1 - 0.8 = 20% across: 78px of a 390px phone. A sprite of width 1.5x the screen centred there
// reaches only to 78 + 293 = 371 of 390, and the first probe frames came back with a hard-edged dark
// BAND down the right side — the uncovered strip — at every frame of the outro.
//
// Two things this fixes that a comment alone did not. (1) `irisTo >= 1` guarantees coverage only
// for a sprite centred on the SCREEN; the guarantee does not survive re-centring it on an
// off-centre subject, which is what the config block above originally claimed. (2) It is now a
// pure function of the geometry, so the suite can assert it against the real lane fraction at both
// viewports instead of the bound being an untestable render-side expression (run DO.d).
//
// ONE multiplier for both axes, taken as whichever axis needs more, so the iris keeps the screen's
// aspect the way the red vignette does. Scaling the axes independently would cover just as well but
// change the iris's shape as it closed, which is a different effect than the one being tuned.
export function irisCoverMul(mult, cx, cy, w, h) {
  // Distance from the centre to the FURTHEST edge on each axis — the half-extent the sprite must
  // reach. A centred subject gives w/2, i.e. a need of exactly 1.0 and no change to `mult` at all.
  const needW = (2 * Math.max(cx, w - cx)) / w
  const needH = (2 * Math.max(cy, h - cy)) / h
  return Math.max(mult, needW, needH)
}

// ---- What killed you (v7.x) -------------------------------------------------------------------
// Display copy for every non-enemy `src` label hurtPlayer can carry (run.dmgBySrc / run.killedBy —
// see state.js's doc block). ENEMY sources are deliberately absent: they key on the roster id and
// already have a translated name in CHAPTERS[].roster[].name, so duplicating them here would be the
// one-fact-two-places drift this project's test strategy is built around. dmgSrcName below resolves
// either kind, and it is the ONLY resolver — ui.js must not do its own lookup.
//
// A FLAT id -> string TABLE, on purpose. run XX's generic walk reads `.name`/`.desc` off table
// values and so cannot see a bare string map, but the file already has the idiom for exactly this
// (CHAPTER_SPINE, CHAPTER_UNLOCK_LINES) and run XX walks those explicitly with
// `for (const v of Object.values(X)) need(v)`. DMG_SRC_NAME is joined to that list in the same
// commit — copy in a function or a bare const is what has shipped untranslated four times.
//
// `unknown` is a real, reachable row, not a defensive default: hurtPlayer buckets an unlabelled
// caller under it. Seeing "Unknown" on the summary is how a future damage path that forgot its label
// announces itself, which is worth more than a silent misattribution to something else.
// EVERY COMMENT BELOW NAMES THE CHAPTER THAT PRODUCES THE LABEL, and it is not decoration: a label
// whose comment drifted off its producer is a label the player is shown for the wrong thing. Three of
// these were wrong when the audit of 2026-08-17 read them against the sim — `spray` was still called
// Pesticide a whole version after the garden's spray strips were deleted (v6.6.14), `beam` was
// credited to the skies when pullBeam is The Beyond's elite affix, and the missile helicopter was
// credited to the city when it flies in the skies. Re-check the producer, not the comment.
export const DMG_SRC_NAME = {
  // Book 2's hazards and resource costs
  // THE REEF ONLY, and this comment was briefly "every Book 2 chapter" until the audit checked:
  // stepDrown returns early unless the chapter's resource declares `drown`, and The Reef's Air is the
  // only one that does. Humidity, Feed and Light run dry into a SPEED or DAMAGE floor instead, which
  // is not a hurtPlayer call at all. Guessing from "Book 2 is underwater" is how the wrong comment
  // got written in the first place — read the gate.
  drown: 'Drowning',
  // THE WRECK ONLY, on the same gate-reading rule the comment above insists on: stepStarve returns
  // early unless the chapter's resource declares `starve`, and Bloodlust is the only one that does.
  // Its own row rather than sharing 'Drowning' — they are the same DoT mechanism, and the whole
  // reason they are separate functions is that they mean opposite things (see stepStarve).
  starve: 'Starvation',
  // THE WRECK's other one, and after the prey rework it is the chapter's ONLY external killer — the
  // whole roster is food and cannot damage the player at all (contactHarmless). A run that ends
  // here ends on this row or on Starvation, and nothing else.
  slick: 'The Leak',
  trawl: 'The Net',            // The Trawl: the mesh wall
  devour: 'Swallowed',         // The Deep: an anglerfish maw closed on you (a run.shafts entry)
  // Book 1's hazards — with the caveat that `pool` is the single most widespread hazard in the game
  pool: 'Caustic Pools',       // acidPool (body) AND soapTrail, which is the elite affix in pond,
                               // shelf, surf, reef and trawl — four of them Book 2. Not Book 1 only.
  erase: 'Erasure',            // The Blank: boss bands, eraser wakes, immuneMemory residue. All
                               // three push look:'erase' strips; NOTHING in the game sprays pesticide
                               // any more, which is what this label used to claim.
  trap: 'Snap Traps',          // the undergrowth
  traffic: 'Traffic',          // the city's lanes — look:'car'
  mower: 'The Mower',          // the garden's lanes — look:'mower', same stepper, other vehicle.
                               // Split out because "Killed by Traffic" is a lie about a lawnmower.
  missile: 'Missiles',         // the SKIES helicopter's volley, plus The Blank's boss fans and its
                               // standoff antibodies — every run.enemyShots entry draws as a missile
                               // (placeShot), so one label matches what the player actually sees.
  beam: 'Abduction Beam',      // THE BEYOND's pullBeam elite
  bomb: 'Blasts',              // volatile elites' corpse bombs, the skies' artillery, Surf gulls
  rock: 'Asteroids',           // The Beyond's drifting rocks
  leak: 'The Line',            // The Beyond: marching invaders that slipped behind you (stepLeaks
                               // gates on `lane`, but only beyond fields `march` enemies)
  yank: 'The Pull',            // The Blank's boss, phase 2 — the pull of its bind nodes
  // Costs you chose to pay. Both are anomalies, and both names match the card's own so the summary
  // reads as the card you took rather than as a mystery source of damage.
  overload: 'Overload',
  bloodMoney: 'Blood Money',
  // The bucket that should always be empty — see the block comment above.
  unknown: 'Unknown',
  // Archetype fallbacks, for a spawn with no roster entry (stepContactDamage keys on
  // `e.rosterId ?? e.type`). Rosters are complete today, so these are the formation/scripted-spawn
  // safety net rather than the normal path.
  drone: 'Drone', wisp: 'Wisp', tank: 'Tank',
}

// Resolve a `src` label to display copy. Enemy labels are roster ids, so they are looked up in the
// roster of the chapter that has one — searched across CHAPTERS rather than only the run's own
// chapter because a formation or the scripted chapter can field a creature the current chapter's
// roster does not list, and a wrong-chapter name is worse than the id.
// Returns null for a label nothing claims, so the caller decides whether to hide the row or print
// the raw key; it never invents a name.
export function dmgSrcName(src) {
  if (!src) return null
  if (DMG_SRC_NAME[src]) return DMG_SRC_NAME[src]
  for (const ch of Object.values(CHAPTERS)) {
    const hit = ch.roster?.find((r) => r.id === src)
    if (hit) return hit.name
  }
  return null
}

// Which baked thumbnail a `src` shows on the summary's damage recap, when it is not its own id.
// src/cast/<id>.png is keyed by src for every hazard that has art of its own (scripts/bake-cast.mjs
// bakes those from render.js's own draw code) — this table is only for the sources whose honest
// picture is a CREATURE the game already draws, so aliasing costs no new art at all:
//   yank — the drag is the pull of The Blank's bind nodes, and a bindnode is an enemy with a face.
//   leak — a rank that slipped behind you, and stepFormations forces `rosterId: 'invader'` on ranks.
// Not a general indirection: keep it at two entries and give a hazard its own bake instead. The
// summary must never show a creature that did not do the thing (v6.7.1's 🐻 for the tardigrade is
// the same mistake with a different mechanism).
export const DMG_SRC_ART = { yank: 'bindnode', leak: 'invader' }

/** Thumbnail id for a damage source: its alias if it has one, else the src itself. */
export function dmgSrcArt(src) {
  if (!src) return null
  return DMG_SRC_ART[src] ?? src
}

// The damage sources that deliberately show NO picture, each with the reason, because an empty slot
// is otherwise indistinguishable from a bake that failed — which is the whole bug being fixed here.
// Together with DMG_SRC_ART this PARTITIONS DMG_SRC_NAME: every remaining key must have a
// src/cast/<key>.png baked from render.js's hazardThumbs. Run DA.g asserts that partition is exact,
// so adding a damage source without deciding its picture is a red suite rather than a blank column.
export const DMG_SRC_NO_ART = {
  // `beam` used to sit here — "no art of its own, shared telegraph amber, no saucer texture to borrow".
  // The owner picked a saucer from three shot variants, so it has a drawing now (hazardThumbs.beam,
  // and the hull is new art, said out loud there). Left as a note only because the reason it was
  // blank is the reason the drawing had to be authored rather than extracted.
  // ⚠ OWED, NOT EXEMPT — the only entry in this table that is a debt rather than a reason, and it is
  // written here so the guard does not block a chapter that cannot be played yet. The Wreck ships in
  // two phases (see CHAPTERS.wreck) and every picture it needs is phase 2; `drown` proves a resource
  // DoT can carry a drawing, so "it is a state, not a world object" is NOT the argument here and must
  // not be borrowed from the two anomalies below. DELETE THIS LINE when hazardThumbs.starve lands.
  starve: 'OWED — The Wreck phase 2 has not authored its art yet, not a permanent exemption',
  // Costs you chose to pay. Neither has a world object; their honest picture is the anomaly card.
  overload: 'a card you took, not a thing in the world',
  bloodMoney: 'a card you took, not a thing in the world',
  // Unreachable: every hurtPlayer call site is labelled (run DA.d), and all 13 chapters cover all
  // three archetypes, so nothing keys on the fallbacks today (run DA.h).
  unknown: 'unreachable — every damage site is labelled',
  drone: 'unreachable — every chapter roster covers `normal`',
  wisp: 'unreachable — every chapter roster covers `fast`',
  tank: 'unreachable — every chapter roster covers `tank`',
}

// ---- Light Thief (v7.x Book 2) ----------------------------------------------------------------
// Kills give light back — but ONLY once bought. Owner ruling, and a reversal of the first cut which
// had it on by default: "none by default, only via the shop". So the baseline chapter is tuned to
// be survivable on shafts alone (scripts/charge-probe.mjs measures exactly that), and this is a
// permanent unlock that changes how the chapter is PLAYED rather than a percentage on a stat.
//
// Priced in the sacrifice ladder's currency — purchased SHOP levels, burned with no coin refund —
// because that is the game's existing vocabulary for "permanent, and it costs you something you
// already own". 15 sits deliberately BELOW the 3rd card slot's 20: it is the cheapest thing on that
// screen, so it is a plausible first sacrifice rather than a late-game luxury.
// LIGHT_THIEF_COSTS itself lives up near SACRIFICE_COSTS (BOOK_UNLOCKS.undertow.lightThief
// references it directly, and that table is built before this point in the file).

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
export const ROCK_DMG = 20               // 10 -> 20 (owner): a rock you failed to dodge should hurt.
                                         // HP to the player on contact (invuln-gated)
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
//
// THE DASH IS GATED ON canCommitFrom, like diveBomb's dive and pounce's leap. v6.6.24 established
// that rule for the whole game on an owner report — "if it's not displayed on the screen, it should
// not be able to jump on you" — and dashBurst was the one dash machine that never got it, because
// it is the one with no distance test of any kind: a pure DASH_IDLE_T timer that fires wherever the
// body happens to be. Enemies spawn at run.viewRadius + SPAWN_RING, i.e. always off-screen, so a
// fresh dasher could and did complete its whole idle phase out of sight and arrive already dashing.
// Owner, 2026-08-16, asking for the same fix on The Surf's Sea Roach: "like all other dashers in
// the game, they should [not] dash on you from outside your screen."
//
// Off screen the machine does NOT idle — it walks in at full speed (see stepDashBurst). Idling out
// there would be strictly worse than the bug: DASH_IDLE_SPEED_MUL is 0.4, and the spawn ring is a
// RADIUS while the gate is a RECTANGLE, so a body arriving along the short axis of a phone has ~358
// px to cover before it is even eligible. At 0.4x that is ~4.7s of a crowd crawling just out of
// sight, which reads as the chapter being empty. Full speed until seen, then the full idle wind-up
// on screen where the player can read it, is the shape that keeps the pressure and buys the tell.
export const DASH_IDLE_T = 1.1        // s, idle phase duration
// balance_decision : dash 30% shorter, so a lunge cannot cross half a screen 2026-08-16
//  - the WINDOW, never DASH_SPEED_MUL: the speed is what makes a burst read as a burst, and was
//    never the complaint. 0.5s travelled 249px (128% of a phone's half-width), 0.35s travels 174px.
export const DASH_T = 0.35            // s, dash phase duration
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
// draws up to 96px (SKIES_STRUCTURE_ART.tower, above). CHAPTERS.skies.render.form === 'kaiju' gates a dedicated
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
  // TAIL SWIPE WHIP: the `tail` sim event (sim.js stepLashWeapon/WEAPONS.tailLash) already drives
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
  // balance_decision : kaiju drawn smaller twice, scale reads RELATIVE to nearby detail v5.11/v7.21
  //  - RENDER-ONLY: the sim hitbox is PLAYER.radius (22) and does not move. Applied to bodyC so the
  //    tail chain scales with the hip. A monster that crowds buildings out of frame reads SMALLER.
  bodyScale: 0.496,
  // v7.26: how far forward of the player's centre the MOUTH sits, in the same local pre-scale units
  // drawKaijuBody draws in (its head polygon runs y -60 to the snout tip at -134, so this sits just
  // inside the jaw). Render multiplies by bodyScale and rotates by facingAngle — see redrawBreath.
  // The Atomic Breath is emitted from here rather than from the player's centre: a breath weapon
  // leaving the middle of the body reads as the body being on fire, not as the creature breathing.
  // Render-only, like everything else in this block — no hitbox moves, and the fork's damage is
  // unchanged (sim still chains body to body; this only moves where the FIRST segment is drawn from).
  muzzle: 118,
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
// _pounceDirY (leap heading, tracked for the first POUNCE_AIM_TRACK_T of 'aim' and LOCKED for the
// rest of it, so the leap is committed before it launches and stays dodgeable) — same
// bookkeeping idiom as diveBomb's _diveState/_diveT/_diveDirX/_diveDirY.
//   hold:  seeks the player normally at POUNCE_HOLD_SPEED_MUL until within POUNCE_RANGE, then 'aim'
//   aim:   STOPS dead for POUNCE_AIM_T (the telegraph). Two halves: it keeps LINING UP on you for
//          the first POUNCE_AIM_TRACK_T, then the heading freezes and the attack is committed.
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
// balance_decision : the toad's wind-up SPLITS into tracking then committed halves v6.7.4
//  - not a speed or reach problem: locking the heading at the start of a 0.9s crouch aimed at
//    where you were ~198px ago, so 0% of leaps connected against a moving player. Locking at
//    LAUNCH fixes it but is "a homing toad" (owner). Dodge window is the committed remainder plus
//    the flight, ~0.6s. The telegraph sweeps during the tracking half and stopping IS the commit.
export const POUNCE_AIM_T = 0.60         // s, telegraphed crouch (dead stop). Was 0.90.
export const POUNCE_AIM_TRACK_T = 0.30   // s of that crouch spent still tracking; the rest is committed.
                                         // MUST stay < POUNCE_AIM_T or the leap re-aims to the last
                                         // instant and the toad becomes the homing version, which was
                                         // measured, rejected by name, and is what run UG.j6 guards.
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
export const POUNCE_TURN_AIM = 7.0       // rad/s while winding up — it must finish aimed before launch.
                                         // Deliberately NOT lowered to the 180 deg/s below: this is
                                         // the wind-up alignment, and it now has only
                                         // POUNCE_AIM_TRACK_T to finish in. At 180 deg/s it could
                                         // swing 54 deg in that window and would launch visibly
                                         // off-line at anything approaching from the side.
export const POUNCE_TURN_LEAP = 0        // rad/s mid-air. Zero. That is the whole rule.
// v6.7.4 (owner: "the turning rate of the toad should be faster, like 180 deg per second"): 1.9 ->
// PI rad/s, i.e. a half turn in 1.0s rather than 1.7s. v6.6.33 read "toads are slow and tanky [...]
// they slowly turn towards the player" as slowly as the words allowed, and it overshot — a toad
// that cannot come round inside its own recovery window just presents its back.
export const POUNCE_TURN_IDLE = Math.PI  // rad/s landed/stalking — 180 deg/s
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
// v6.9.1 (owner: "cars should spawn 30% less often"). 3.0 -> 4.3 is a 0.7x rate, not a 0.7x gap:
// the ask is about how often a car shows up, and the roll cadence is its reciprocal.
export const TRAFFIC_INTERVAL = 4.3   // s between lane rolls (while under signature.lanes alive)
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
// v6.9.1 (owner: "their telegraph should be like headlights, not a bland yellow rectangle — it
// should move in front of the car, get brighter when the car is closer"). What it WAS: a static
// 1100x130 amber slab with four chevrons on it, i.e. a diagram of the hazard rather than a sign of
// it. Now the warning is the thing that actually warns you on a real street — a pair of headlights
// coming up it. The lamps start TRAFFIC_APPROACH px BEHIND the lane's entry and slide forward so
// they reach the entry exactly as the sweep begins, throwing TRAFFIC_BEAM px of light ahead of
// themselves; the beam therefore washes over a player standing at the lane centre partway through
// the telegraph and keeps brightening. The numbers are picked against each other and against a
// phone screen (~460px of lane visible either side of the player): at the start of the fuse the
// lamps are offscreen and only their far spill shows, by the end the beam is past the player.
export const TRAFFIC_APPROACH = 520
export const TRAFFIC_BEAM = 760
export const TRAFFIC_DMG = 34         // damage to the PLAYER (and the pre-v6.7.5 enemy figure — see below)
export const TRAFFIC_KB = 420         // knockback applied along the lane to struck enemies
// v6.7.5 (owner: "taxis should do as much dmg as lawnmowers"). Enemies now lose a FRACTION OF THEIR
// OWN MAX HP under the van, exactly like the mower — and for the reason MOWER_ENEMY_HP_FRAC already
// spells out: a flat 34 falls behind hpScale inside the first minute, after which the city's
// signature hazard visibly bounces off everything it hits while the garden's flattens the field.
// v6.9.3: this is now the WHOLE rule. It used to share the job with a TRAFFIC_SQUASH roadkill list
// (v5.6.14) that one-shot non-elite ratDrone/pigeon/rat/patrolDrone by dealing them their remaining
// hp — so the fraction below only ever applied to the heavy half of the roster, the damage number
// a player saw over a drone was "whatever was left" rather than 50%, and rounding that remainder is
// what produced the 0s in the v6.9.2 report. Owner: "car one shots drones. it should do 50% hp
// damage". One rule, every enemy, elites included.
export const TRAFFIC_ENEMY_HP_FRAC = 0.5
// v6.10.3 (owner: "cars should 1 shot birds and rats always"). Roster ids a vehicle kills outright
// instead of dealing TRAFFIC_ENEMY_HP_FRAC to. This is a NARROW re-introduction of the v6.9.3
// TRAFFIC_SQUASH list, which was deleted the same day for good reason — it covered ratDrone and
// patrolDrone too, and "a car one-shots drones" is exactly what was complained about. The light
// street life is the part that should never survive a taxi; the drones are not.
//
// Elites are exempt: an elite carries 5x hp and is a rare, deliberate spawn, and letting an
// ambient car delete one removes the fight rather than resolving it. Same exemption the old list
// had. The blow is dealt as the enemy's MAX hp, not its remaining hp — dealing "whatever is left"
// is what produced the unreadable 0s and 9s of the v6.9.x damage bug, because the number on screen
// was never the same twice.
export const TRAFFIC_ROADKILL = ['pigeon', 'rat']
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
// v5.6.15: was 300 — OUTSIDE every skies weapon's reach (roar L1 ~216 incl. body, tailLash 200,
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
    // v7.21: `reticleCore` lived here for the crawling lock BEAD and nothing else (its comment also
    // claimed the impact star, which has always used impactCore below). The bead is gone — a bright
    // dot travelling from a helicopter to your feet reads as a projectile, so it was taken for a
    // missile that hit and did nothing. Removed rather than left dangling.
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
    // v7.21 (owner directive) — "make the tank telegraph more subtle". Every alpha on this threat
    // dropped ~35-45%, and the two that were inline literals in render.js (the bracket ramp and the
    // hatch bars) moved here so the whole mark has ONE loudness knob instead of three.
    // What did NOT change: the shape, the arrival clock, or the ORDER of the ramp. This is a
    // telegraph for real damage, so it is dimmer, not slower and not later — the bracket still
    // brightens as the fuse burns and still peaks on the impact frame. The ornament (trajectory
    // ghost, hatch fill, shell shadow) is cut hardest and the impact bracket least, because the
    // bracket is the part that actually tells you WHERE, and tanks stack: this mark being loud
    // x8 on screen is what "too much" meant. Paired with archetypeMul tank 0.9 in CHAPTERS.skies,
    // which removes ~10% of the marks outright — dimmer AND fewer, the same two levers v5.13 used.
    bracketAlpha: 0.36, bracketAlphaRamp: 0.34,                  // 0.36 -> 0.70 over the fuse (was 0.55 -> 0.95)
    hatchBar: 0x0a0d12, hatchFill: 0xc9b26a, hatchAlpha: 0.10,   // the sweeping clock hand (was 0.18)
    hatchBarAlpha: 0.45,                                         // was an inline 0.75 in render.js
    shellShadow: 0x0a0c10, shellShadowAlpha: 0.36,               // the falling shell's OWN shadow (was 0.55)
    ghost: 0xc9b26a, ghostAlpha: 0.15,                           // trajectory arc back to (ox, oy) (was 0.28)
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


// ---- `blink` behavior flag: RETIRED v6.9 ------------------------------------------------------
// It closed in bursts instead of walking: crawl at 0.55x, then cover 240px in 0.35s, every 1.6s.
// v6.7.5 already tried to save it — the burst was a literal teleport, so it was made continuous at
// 686 px/s — and the owner's verdict on that was "pigeons are still dashing/teleporting", which is
// the correct read: a 12x speed step between crawl and burst is a discontinuity in VELOCITY, and
// the eye reports that as teleporting whether or not the position is interpolated. Two attempts at
// making a rhythm-mover legible is enough; city's pigeon (its last and only user) is now an
// ordinary chaser with `flyover`, and the flag, its constants and stepBlink are gone rather than
// left dead for the next session to re-apply. Its cousin `dashBurst` survives on pond's tadpole.
// Nothing named blink* below this line belongs to it — realityShard's blinkEvery/blinkDist are a
// bullet's own skip and share only the word.

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

// guard (v7.x The Surf: the Shore Crab). State on e.guarding (bool) / e._guardT (s left in the
// current window) / e.guardAngle (the bearing the guard was raised at). Alternates
// CRAB_GUARD_T guarded <-> CRAB_OPEN_T open, forever, phase-randomised at spawn like `phase` above
// so a wave does not raise in unison.
//   open:     an ordinary enemy in every respect.
//   guarded:  DIRECT damage does nothing — no number, no crit. Everything else about it is normal:
//             it is solid, it still deals contact damage, it still gets shoved. That is the whole
//             distinction from `phase`, whose contract is "eats nothing, deals nothing": a ghost is
//             absent, a guarding crab is ARMOURED and still coming at you.
//
// TWO THINGS DELIBERATELY GET THROUGH THE GUARD, and they are what make this a puzzle rather than a
// wait (owner ruling 2026-08-14: "status lands, damage bounces, but the shield is up like 50% of
// the time not 100, so when it's not up regular hits work"):
//   - DoT TICKS. dealDamage's `dot` flag already exists and is already threaded from every burn,
//     bleed and poison site, so a fire build kills a crab through its own guard.
//   - STATUS APPLICATION. Your shot still lands ignite/venom/chill while the guard is up; only the
//     raw damage bounces. Without this the counter is unreachable by construction — you cannot
//     light something you cannot hit, and "bring a DoT" would be advice a player can never take.
//
// THE ARC IS 120 DEGREES AND IT DOES NOT TRACK YOU (owner ruling: "the side facing you, 120deg").
// CRAB_GUARD_ARC is the HALF-angle, so the guard spans 2x it. The bearing is latched when the guard
// RAISES and held for that window, which is the only reading under which the angle means anything:
// an arc that re-aims every frame is a 360-degree guard with extra arithmetic, and there would be
// no way round it. Latched, moving is the counter — and it is why render.js turns the crab as it
// raises rather than leaving it at lean 0.
// ---- The Surf's gulls (v7.x): a HAZARD, not an enemy -------------------------------------------
// Owner: "this should rather be a trap like thunder in the skies. A telegraph seagull shadow that
// gets bigger and darker as the seagull plunges towards you, then you see a big bird plunging and
// taking off immediately. This is not an enemy per say."
//
// So it reuses run.bombs, exactly as the skies' bombardment does — the telegraph -> blast contract
// already exists and is the same one the thunder rides (see BOMBARDMENT_* above; LIGHTNING re-skins
// that same entity without touching sim). No new run.* array: the designing-an-enemy skill asks for
// a stated reason before adding one, and there is none here.
//
// TWO THINGS FALL OUT OF stepBombs FOR FREE, and they are why this shape was chosen:
//   - a bomb already damages the PLAYER and EVERY ENEMY inside its radius. The owner's rule is that
//     a gull "targets any enemy or you, they want to feed" — so the entity's existing
//     explode-both-sides contract IS the design, with nothing added.
//   - it already carries a `src` discriminator that render branches on, so the gull gets its own
//     look without a second entity or a special case in the sim.
// A gull is therefore a THIRD PARTY on the beach rather than an attack aimed at the player: it eats
// whatever it lands on, which is also what stops it being pure denial — a strike that lands on the
// crowd chasing you is doing your work.
export const GULL_RATE = 3.4        // s between plunges (the chapter declares `gulls: true`)
export const GULL_FUSE = 1.3        // s of shadow before it lands — one beat longer than the sky's
                                    // 1.2, because this one you can WALK out of rather than dodge
export const GULL_RADIUS = 62       // px. Deliberately under BOMBARDMENT_RADIUS (85): the owner
                                    // asked for a small radius, and a bird is a point threat where
                                    // a shell is an area one
// balance_decision : gull blast halved, and an active shorebreak blocks it 2026-08-17
//  - flat: rides no dmgScale, no enemyDmgMul, no difficulty tax. Immunity gate is in stepBombs.
export const GULL_DMG = 8
// How often the plunge aims at the PLAYER rather than at some enemy. Not 50/50: gulls outnumber you
// on their own beach and most of what is alive down there is not you, so a mostly-ambient hazard
// that occasionally has your name on it reads as wildlife rather than as artillery.
export const GULL_PLAYER_SHARE = 0.35

export const CRAB_GUARD_T = 2.0        // s guarded
export const CRAB_OPEN_T = 2.0         // s open — a 50/50 duty cycle, as specified
export const CRAB_GUARD_ARC = 1.047    // half-angle, rad (60 deg -> a 120 deg guard)

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
// orbitals (run.orbs/run.debris), zones (run.pools/blooms/zones) and novas are NOT projectiles
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
  // Undertow opens here. The death line names HUMIDITY rather than whatever landed the last hit:
  // the bar is the chapter's own clock and the thing a beach kills you with, exactly as the pond
  // kills you by filtering you out however you actually died.
  surf:        { victory: 'You rode it out! 🎉',                    death: 'Dried out… ☀️' },
}
export const CHAPTER_UNLOCK_LINES = {
  pond:        'The Pond — word of you travels downstream',
  garden:      'The Garden — something marked your trail',
  undergrowth: 'The Undergrowth — the hunters were told to expect you',
  city:        'The City — a report has been filed',
  skies:       'The Skies — this time they\'re not hiding it',
  beyond:      'The Beyond — you were never the only anomaly',
}

// Book-unlock badge copy (v7.x), keyed by the book that just OPENED. Flat id -> string like
// CHAPTER_UNLOCK_LINES above, and in a table for the same reason: run XX's config-table walk is
// what catches a missing French translation, and a tt() literal in ui.js is invisible to it by
// construction. {n} is the welcome purse (BOOKS[id].startCoins) — a tt() TEMPLATE, so the number
// must never be baked into the string, or the key changes every time the grant is retuned and no
// dictionary can hold enough of them. Every book except BOOK_ORDER[0] needs a row (run BU asserts
// it): the first book is where you start, so it is never unlocked.
export const BOOK_UNLOCK_LINES = {
  undertow: 'UNDERTOW — a second book opens, for a new adventure… 🪙 {n} to begin',
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
export const BLANK_WAVE_GAP = Math.PI / 2 // rad (90°, owner directive — was 45°) of the wave ring left EMPTY — the door.
                                          // A wave of 128-256 spawns as a closed ring at viewRadius + SPAWN_RING;
                                          // with the probes now shadowing you (BLANK_PASTSEEK_LAG) a closed ring is
                                          // a hug with no out. One wedge, re-rolled per wave, is the escape the
                                          // player aims for — a quarter of the ring, so it reads as a direction to
                                          // commit to rather than a needle to thread, and the remaining bodies pack
                                          // into 270° (the same n, ~33% denser wherever they DO stand).
                                          // Wave blocks ONLY — a boss phase's recruits (and the
                                          // nodes) keep spawning all the way round.
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
export const BLANK_BOSS_DMG = 30          // contact damage — the band keeps it rare in P1/P2; P3 makes it a chase
                                          // (owner directive: every boss-sourced number below is ×2 — contact,
                                          // shots, trail bombs, erasure bands, the yank. Minion damage — the
                                          // eraser's BLANK_WAKE_DPS — is NOT the boss and stays put.)
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
export const BLANK_READ1_DMG = 24         // ×2 with the rest of the boss's damage
export const BLANK_PASTSEEK_LAG = 1       // trail samples behind the player probes aim at (~0.7s; was 4 ≈ 1.4-1.75s)
                                          // Owner directive "the first enemies wait too much": at 4 a probe
                                          // perpetually arrived where you had already left, so the opening waves
                                          // never touched a moving player. At 1 they cut the corner and land on you;
                                          // the flag still reads the PAST, it just isn't a free pass any more.
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
export const BLANK_YANK_DMG = 20          // ×2 with the rest of the boss's damage
export const BLANK_SHOT_T = 2.4           // s between P2 aimed shots (run.enemyShots)
export const BLANK_SHOT_N = 2             // shots per aimed volley (P2's own, and P1's borrowed one at d2+).
                                          // Owner directive "double every projectile the boss deals": the single
                                          // aimed shot is a PAIR straddling the aim line by BLANK_FAN_SPREAD. Both
                                          // halves home (BLANK_SHOT_TURN), so the pair reconverges — the gap down
                                          // the middle is a beat, not a free lane. Same doubling on the P3 fans
                                          // below (BLANK_FAN_N/_MATURE).
export const BLANK_SHOT_SPEED = 240
export const BLANK_SHOT_DMG = 20          // ×2 with the rest of the boss's damage (every shot the boss fires)
export const BLANK_SHOT_R = 8             // px hit radius
export const BLANK_SHOT_LIFE = 3          // s before a shot fizzles
export const BLANK_SHOT_TURN = 0.4        // rad/s homing clamp — outrunnable, but you're slowed
// P3 takes your future: pre-fired erasure bands (run.strips, look:'erase') centred on the
// player's extrapolated position (pos + vel × BLANK_LEAD) — a CROSS (one band across the heading,
// one along it), plus straight aimed shot fans from a boss that is itself chasing (SPEED_P3).
export const BLANK_READ3_T = 3.25         // s between P3 pre-fired crosses — 25% slower than the 2.6 it shipped at
                                          // (owner directive: the star "hits too soon"). Cadence, growth and damage
                                          // all move together on that note; see BLANK_BAND_GROW/DPS below.
export const BLANK_LEAD = 0.55            // s of velocity extrapolation
export const BLANK_BAND_LEN = 320
export const BLANK_BAND_W = 64
export const BLANK_BAND_FUSE = 0.75       // s telegraph
export const BLANK_BAND_T = 2.0           // v6.3.1 [panel/gameplay]: active duration must stay under the
                                          // desperate cross cadence — now 3.25×0.75×0.8≈1.95s, so the double-star
                                          // window is down to 0.05s, even more of a beat than the 2.6 it was
                                          // written against (was 2.4)
export const BLANK_BAND_GROW = 1.0        // s the band takes to reach BLANK_BAND_LEN, growing from its centre
                                          // outward once LIVE (owner directive: the star "hits too soon"). The
                                          // hitbox is the CURRENT length, so the arms sweep out and reach the far
                                          // end a full second after the telegraph fires — standing at arm's length
                                          // is now a second of warning instead of none. The 0.75s fuse still draws
                                          // the star at full extent first, so the danger zone is known before
                                          // anything bites. Generic: stepStrips grows any strip carrying `grow`.
export const BLANK_BAND_DPS = 34          // owner directive: the star hit too hard as well as too soon. Was 26,
                                          // doubled to 52 with the rest of the boss's damage, now 34 — a full
                                          // BLANK_BAND_T of exposure is 68, so the band is the fight's heaviest
                                          // hazard without being lethal on its own to a base 100 HP player
export const BLANK_DESPERATE_FRAC = 0.25  // any phase below this hp fraction accelerates its read/shot/node
                                          // timers ×BLANK_DESPERATE_MUL (P3's cross uses BLANK_READ3_DESPERATE_MUL)
export const BLANK_DESPERATE_MUL = 0.62
export const BLANK_FAN_N = 6              // shots per P3 fan (owner directive ×2, was 3). Even now, so there is no
                                          // dead-on center shot — the pair straddles your line instead, and the arc
                                          // widens to 5×BLANK_FAN_SPREAD ≈ 100°: more angles denied, gaps still real.
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
export const BLANK_FAN_N_MATURE = 10      // P3 fan shots at d3 (owner directive ×2, was 5) — a 9×0.35 ≈ 180° wall
                                          // from a boss already chasing you; the shots diverge, so the gaps open with
                                          // distance and backing off is the answer
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
export const BLANK_RECRUIT_N = [9, 12, 45] // endless fodder so a low-damage build can still farm xp mid-duel
                                          // (v6.3.2: P2 adds ×2, P3 adds ×3 — the duel gets CROWDED, owner directive)
                                          // ×3 again (owner directive): a boss phase is now a horde fight, not a
                                          // duel with garnish. P3 pushes 15 bodies/s at BLANK_MAX_ALIVE, so the cap
                                          // (not this number) is what the field settles at if you can't clear.
                                          // NOTE: recruits keep FULL xp (BLANK_WAVE_XP_MUL is _wave-tagged only),
                                          // so this triples the mid-duel xp faucet as well as the pressure.
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
// while affordable). Not offered for The Blank (fixed ladder).
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
  sticky:   { name: 'Sticky Floor',      icon: '🍯', desc: 'You move slower, but pickups fly to you.',     exclude: ['beyond', 'pond', 'shelf', 'surf', 'reef', 'wreck', 'trawl', 'twilight', 'deep'], effects: { playerSpeedMul: 0.85, magnetMul: 1.7 } },
  jumbo:    { name: 'Jumbo Anomalies',   icon: '🎈', desc: 'Big squishy enemies, bonus XP and coins.',     effects: { enemyRadiusMul: 1.25, enemyHpMul: 1.25, enemySpeedMul: 0.9, xpMul: 1.2, coinMul: 1.2 } },
  // v5.24: The Blank's named difficulty-ladder modifiers (CHAPTERS.blank.modsByDifficulty) are
  // MUTATORS entries too, so the existing HUD/pause chip machinery renders them for free — but
  // `hidden: true` pulls them out of randomMutators' pool (below) since they're
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
  // Undertow's first. x1.8 rather than Riptide's x2 because the tide is ZERO-MEAN and the pond's
  // drift is not: a sine that peaks at 83 px/s spends the whole cycle reversing, so the number a
  // player fights is the peak and there is no ceiling protecting them from it the way the pond's
  // escape-margin math protects that field. 46 -> 83 keeps the peak under PLAYER baseSpeed 220,
  // which is the hard bound CHAPTERS.surf.signature's own block sets: past that the surge stops
  // being a push and becomes a wall.
  springtide:   { name: 'Spring Tide',    icon: '🌊', desc: 'The tide shoves far harder. Richer coins.',                  chapters: Object.keys(CHAPTERS).filter((id) => CHAPTERS[id].tide), effects: { tideSurgeMul: 1.8, coinMul: 1.25 } },
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
  'tideSurgeMul',       // tideForce (surf tide peak surge)
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
