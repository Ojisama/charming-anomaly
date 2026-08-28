#!/bin/bash
# Mutation proof for scripts/chapter-stage.mjs: does each gate actually move ITS OWN axis?
# Works on a scratch copy; the real tree is never touched.
#
# The contract this reads is the one greppable line the single-chapter audit prints:
#   axes: ideation=ok wiring=ok played=YOU art=ok fr=ok numbers=ok reachable=wip
# Naming the axis per mutation is the point. The old harness compared one word per chapter (the
# ladder's lowest failing rung), so a mutation that broke the WRONG thing still moved that word
# and still looked like a pass — every gate proved only "something, somewhere, noticed".
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
T="$(mktemp -d)"
axes () { (cd "$T" && node scripts/chapter-stage.mjs "$1" 2>&1 | sed -n 's/^  axes: //p'); }
pick () { echo "$1" | tr ' ' '\n' | sed -n "s/^$2=//p"; }
fresh () { rm -rf "$T"; mkdir -p "$T"; cp -r "$REPO/src" "$REPO/scripts" "$REPO/test" "$T/"; }

# The ideation bar is FOUR bars and each one is its own row, so a mutation aimed at any other axis
# must lift its subject over the whole bar first — otherwise the ideation column moves and the
# mutation measures the bar instead of the gate it names.
# $1 = chapter id, $2 = that chapter's weapons array exactly as config.js writes it.
qualify () {
  sed -i "s/^  deadfall: {/  ${1}quake: { name: 'Q', icon: '🪸', from: 'x', desc: 'd', when: () => true, weight: 1, chapter: '$1', kind: 'k', minLevel: 1 },\n  deadfall: {/" "$T/src/config.js"
  sed -i "s/^  riptide:/  ${1}surge: { name: 'S', icon: '🌊', desc: 'd', chapters: ['$1'], effects: { coinMul: 1.1 } },\n  riptide:/" "$T/src/config.js"
  sed -i "s/weapons: \[$2\]/weapons: [$2, 'bloom']/" "$T/src/config.js"
}
# Only DEEP is still used (by the .maws wiring mutation below). The REEF constant was deleted with
# the reef-based ideation mutations — see the block below for why they moved to the shelf.
DEEP="'finHit', 'chitterShriek', 'mines'"

fresh
echo "BASELINE surf   $(axes surf)"
echo "BASELINE reef   $(axes reef)"
echo "BASELINE pond   $(axes pond)"
echo "BASELINE body   $(axes body)"
echo "BASELINE shelf  $(axes shelf)"
echo

# --- the four ideation bars (owner, 2026-08-20: 4 weapons, 4 mods each, 1 anomaly, 1 mutator) ---
#
# ⚠ THE SUBJECT IS THE SHELF, NOT THE REEF, AND THAT MOVED FOR A REASON WORTH READING. These six
# used to run against the reef through `qualify reef "$REEF"`, whose weapons sed anchored on
# `weapons: ['stinger', 'quillBurst', 'pulsarSweep']`. The Reef gave up its arsenal entirely — it
# is a race now, and ships `weapons: []` deliberately — so that anchor stopped matching, qualify
# became a silent no-op, and ALL SIX MUTATIONS MEASURED AN UNMUTATED CHAPTER. Every one printed the
# baseline and read as a pass. That is the exact failure this file's own header warns about: a
# mutation that does not bite is indistinguishable from a gate that does not work.
#
# The Shelf is the right subject because it CLEARS the whole bar unaided (four weapons, four mods
# on the thinnest of them, its own anomaly and its own mutator), so its baseline is ideation=ok and
# no qualify step is needed at all — which is also one less thing that can rot into a no-op. Every
# mutation below must move it off ok. It is LIVE, so a shortfall prints `debt1` rather than
# `owes1`: the vocabulary follows `reachable`, and what is being proven is that the axis MOVES.
#
# Each sed is checked: a mutation whose anchor has gone stale aborts this script instead of
# printing a reassuring row.
bite () {  # bite <file> <label> — fail loudly if the previous sed changed nothing
  if cmp -s "$T/src/$1" "$REPO/src/$1"; then
    echo "STALE ANCHOR: $2 changed nothing — the mutation is a no-op and proves nothing." >&2
    exit 1
  fi
}

fresh
sed -i "s/weapons: \['bubblePuff', 'siltVeil', 'ballast', 'downwash'\]/weapons: ['bubblePuff', 'siltVeil', 'ballast']/" "$T/src/config.js"
bite config.js "M1"
echo "M1 shelf's pool falls back to 3 weapons  ideation=$(pick "$(axes shelf)" ideation)   (want: debt1)"

# bubblePuff carries EXACTLY four mods, so deleting one crosses the bar rather than thinning a
# weapon that was already well past it. No weapon in the game sits at three any more, which is why
# this cuts rather than swapping the pool as the old M2 did.
fresh
sed -i "/^    froth:      { name: 'Froth',/d" "$T/src/config.js"
bite config.js "M2"
echo "M2 a Shelf weapon drops to 3 mods        ideation=$(pick "$(axes shelf)" ideation)   (want: debt1)"

fresh
sed -i "/^  runoff: {/,/^  },/d" "$T/src/config.js"
bite config.js "M3"
echo "M3 shelf loses its unique anomaly        ideation=$(pick "$(axes shelf)" ideation)   (want: debt1)"

fresh
sed -i "/^  deadWater:/d" "$T/src/config.js"
bite config.js "M4"
echo "M4 shelf loses its unique mutator        ideation=$(pick "$(axes shelf)" ideation)   (want: debt1)"

# Not the same edit as M4: the mutator still EXISTS and still names the shelf. It just names a
# second chapter too, which makes it the book's and not the shelf's. This is the bar that a
# chapter borrowing springtide would trip.
fresh
sed -i "s/chapters: \['shelf'\], effects: { refillChanceMul: 0.33/chapters: ['shelf', 'deep'], effects: { refillChanceMul: 0.33/" "$T/src/config.js"
bite config.js "M5"
echo "M5 shelf's mutator is SHARED with deep   ideation=$(pick "$(axes shelf)" ideation)   (want: debt1 — shared is not its own)"

# --- the unarmed-chapter exemption on the WIRING gate (v7.x, The Reef) ---
# An empty pool is a switch, not a hole: the Reef is a race and ships `weapons: []` with a null
# starter on purpose, so chapter-stage exempts that PAIR rather than the id. Both halves are proven
# — the exemption must hold for the real chapter, and must not cover a chapter that merely lost its
# weapons and still declares a starter it can no longer offer.
fresh
echo "M14a reef unarmed by design              wiring=$(pick "$(axes reef)" wiring)      (want: ok — weapons: [] + starter: null is legal)"

fresh
sed -i "s/^  weapons: \[\], starter: null,/  weapons: [], starter: 'gnash',/" "$T/src/config.js"
bite config.js "M14b"
echo "M14b reef empty pool, starter kept       wiring=$(pick "$(axes reef)" wiring)    (want: FAIL — half-deleted, not deliberate)"

# --- copy, wiring, art, numbers ---
fresh
sed -i "s/^  'Shore Crab':.*$//" "$T/src/fr.js"
echo "M6 fr.js loses 'Shore Crab'              surf fr=$(pick "$(axes surf)" fr)     (want: FAIL)"

# The Deep's signature has exactly ONE payload key, so dropping it really does leave the mechanic
# inert. The Surf carries both `pools` and `bars`, so removing one there is not decisive — the
# signature stays genuinely wired and a passing audit is the CORRECT answer.
fresh; qualify deep "$DEEP"
echo "   control: qualified deep, maws intact  deep wiring=$(pick "$(axes deep)" wiring)   (want: ok, or M7 proves nothing)"
fresh; qualify deep "$DEEP"
sed -i "s/sig?.pools ?? sig?.pockets ?? sig?.maws/sig?.pools ?? sig?.pockets/" "$T/src/config.js"
sed -i "s/CHAPTERS\[run.chapter\].signature?.maws/false/g" "$T/src/sim.js"
echo "M7 EVERY read of .maws deleted           deep wiring=$(pick "$(axes deep)" wiring) (want: FAIL — The Deep's maws go inert)"

fresh
sed -i "s/    balance: { spawnMul: 0.75, enemyDmgMul: 0.75, enemyHpMul: 0.85, xpMul: 1.25, maxAliveMul: 0.6 },/    balance: { spawnMul: 0.75, enemyDmgMul: 0.75, enemyHpMul: 0.75, xpMul: 1.25, maxAliveMul: 0.45 },/" "$T/src/config.js"
echo "M8 pond's balance cloned from body       pond numbers=$(pick "$(axes pond)" numbers) (want: FAIL)"

fresh
sed -i "s/      bgColor: 0x2e6258,/      bgColor: 0xf4efe6,/" "$T/src/config.js"
echo "M9 pond's bgColor cloned from body       pond art=$(pick "$(axes pond)" art)    (want: FAIL)"

fresh
sed -i "s/weapons: \['star', 'orbit', 'wave', 'homing'\], starter: 'star',/weapons: ['orbit', 'wave', 'homing'], starter: 'star',/" "$T/src/config.js"
echo "M10 body's starter falls out of its pool body wiring=$(pick "$(axes body)" wiring) (want: FAIL)"

# The art axis used to be `TESTS.includes('run RA (roster art)')` — a string in a file, identical
# for all 15 chapters, which no edit to any chapter's art could ever move. These two are the
# mutations that check could not have failed.
fresh
sed -i "/^    jelly: { archetype: 'tank', draw: drawJelly, lean: 90 },$/d" "$T/src/render.js"
echo "M11 shelf's jelly loses its baked look   shelf art=$(pick "$(axes shelf)" art)   (want: FAIL)"

fresh
rm -f "$T/src/cast/jelly.png"
echo "M12 shelf's jelly title-card thumb gone  shelf art=$(pick "$(axes shelf)" art)   (want: FAIL)"

# M13 mutates the SCRIPT, not the game: it is the comment stripper that is under test. A path glob
# inside a string literal — `import.meta.glob('./props/*.png')`, which render.js really has — opens
# a block comment that the next JSDoc `*/` closes, silently eating every line between. Here that is
# the whole of stepShafts. Both readings are the proof: masked, the signature is wired; unmasked,
# the same tree reports it INERT. This is the shape of the bug that shipped in v7.187 and read as
# three chapters with no test coverage.
fresh
LINE=$(grep -n "sig.type !== 'shafts'" "$T/src/sim.js" | head -1 | cut -d: -f1)
sed -i "${LINE}i const SHELF_GLOB = './props/*.png'" "$T/src/sim.js"
echo "M13 a path glob above the shafts read    shelf wiring=$(pick "$(axes shelf)" wiring)   (want: ok — the string mask absorbs it)"
sed -i "s|^const NUL = '\\\\u0000'|const NUL = ''|" "$T/scripts/chapter-stage.mjs"
echo "    the same tree, mask disabled         shelf wiring=$(pick "$(axes shelf)" wiring) (want: FAIL, or the mask proves nothing)"

rm -rf "$T"
