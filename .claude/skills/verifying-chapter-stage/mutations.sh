#!/bin/bash
# Mutation proof for scripts/chapter-stage.mjs: does each gate actually MOVE the audited stage?
# Works on a scratch copy; the real tree is never touched.
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
T="$(mktemp -d)"
stage () { (cd "$T" && node scripts/chapter-stage.mjs "$1" 2>&1 | grep -oE '=> [a-z]+ is [A-Z]+' | awk '{print $4}'); }
fresh () { rm -rf "$T"; mkdir -p "$T"; cp -r "$REPO/src" "$REPO/scripts" "$REPO/test" "$T/"; }

# The ideation bar is FOUR bars and the audit reports only the first that fails. Every chapter in
# the game fails at least one of them, so a mutation aimed at any other gate must lift its subject
# over the whole bar first — otherwise it measures the bar and not the gate it names.
# $1 = chapter id, $2 = that chapter's weapons array exactly as config.js writes it.
qualify () {
  sed -i "s/^  deadfall: {/  ${1}quake: { name: 'Q', icon: '🪸', from: 'x', desc: 'd', when: () => true, weight: 1, chapter: '$1', kind: 'k', minLevel: 1 },\n  deadfall: {/" "$T/src/config.js"
  sed -i "s/^  riptide:/  ${1}surge: { name: 'S', icon: '🌊', desc: 'd', chapters: ['$1'], effects: { coinMul: 1.1 } },\n  riptide:/" "$T/src/config.js"
  sed -i "s/weapons: \[$2\]/weapons: [$2, 'bloom']/" "$T/src/config.js"
}
REEF="'stinger', 'quillBurst', 'pulsarSweep'"
DEEP="'finHit', 'chitterShriek', 'mines'"

fresh
echo "BASELINE   surf=$(stage surf)  reef=$(stage reef)  pond=$(stage pond)  body=$(stage body)"
fresh; qualify reef "$REEF"
echo "M0 reef CLEARS the whole ideation bar    reef=$(stage reef)      (want: above IDEATING — proves the bar is what held it)"

# --- the four ideation bars (owner, 2026-08-20: 4 weapons, 4 mods each, 1 anomaly, 1 mutator) ---
fresh; qualify reef "$REEF"
sed -i "s/weapons: \[$REEF, 'bloom'\]/weapons: [$REEF]/" "$T/src/config.js"
echo "M1 reef's pool falls back to 3 weapons   reef=$(stage reef)      (want: IDEATING)"

# Swap a Reef weapon for 'chum', which really does carry 3 mods. Surgically deleting mods off
# stinger (7 of them) proves nothing unless the cut crosses 4 — a mutation must cross the exact
# threshold it is testing, and the simplest way to cross it is to point at something already past it.
fresh; qualify reef "$REEF"
sed -i "s/weapons: \['stinger', /weapons: ['chum', /" "$T/src/config.js"
sed -i "s/starter: 'stinger',/starter: 'chum',/" "$T/src/config.js"
echo "M2 a Reef weapon has only 3 mods         reef=$(stage reef)      (want: IDEATING)"

fresh; qualify reef "$REEF"
sed -i "/^  reefquake:/d" "$T/src/config.js"
echo "M3 reef loses its unique anomaly         reef=$(stage reef)      (want: IDEATING)"

fresh; qualify reef "$REEF"
sed -i "/^  reefsurge:/d" "$T/src/config.js"
echo "M4 reef loses its unique mutator         reef=$(stage reef)      (want: IDEATING)"

# Not the same edit as M4: the mutator still EXISTS and still names the reef. It just names a
# second chapter too, which makes it the book's and not the reef's. This is the bar that a
# chapter borrowing springtide would trip.
fresh; qualify reef "$REEF"
sed -i "s/chapters: \['reef'\], effects: { coinMul: 1.1 }/chapters: ['reef', 'deep'], effects: { coinMul: 1.1 }/" "$T/src/config.js"
echo "M5 reef's mutator is SHARED with deep    reef=$(stage reef)      (want: IDEATING — shared is not its own)"

# --- the pre-existing gates, re-proven against the new baseline ---
fresh
sed -i "s/^  'Shore Crab':.*$//" "$T/src/fr.js"
echo "M6 fr.js loses 'Shore Crab'              surf=$(stage surf)    (want: below POLISHING)"

# The Deep's signature has exactly ONE payload key, so dropping it really does leave the mechanic
# inert. The Surf carries both `pools` and `bars`, so removing one there is not decisive — the
# signature stays genuinely wired and a passing audit is the CORRECT answer.
fresh; qualify deep "$DEEP"
echo "   control: qualified deep, maws intact  deep=$(stage deep)   (want: above IDEATING, or M7 proves nothing)"
fresh; qualify deep "$DEEP"
sed -i "s/sig?.pools ?? sig?.pockets ?? sig?.maws/sig?.pools ?? sig?.pockets/" "$T/src/config.js"
sed -i "s/CHAPTERS\[run.chapter\].signature?.maws/false/g" "$T/src/sim.js"
echo "M7 EVERY read of .maws deleted           deep=$(stage deep)   (want: IDEATING — The Deep's maws go inert)"

fresh
sed -i "s/    balance: { spawnMul: 0.75, enemyDmgMul: 0.75, enemyHpMul: 0.85, xpMul: 1.25, maxAliveMul: 0.6 },/    balance: { spawnMul: 0.75, enemyDmgMul: 0.75, enemyHpMul: 0.75, xpMul: 1.25, maxAliveMul: 0.45 },/" "$T/src/config.js"
echo "M8 pond's balance cloned from body       pond=$(stage pond)  (want: POLISHING)"

fresh
sed -i "s/      bgColor: 0x2e6258,/      bgColor: 0xf4efe6,/" "$T/src/config.js"
echo "M9 pond's bgColor cloned from body       pond=$(stage pond)   (want: PLAYTESTING)"

fresh
sed -i "s/weapons: \['star', 'orbit', 'wave', 'homing'\], starter: 'star',/weapons: ['orbit', 'wave', 'homing'], starter: 'star',/" "$T/src/config.js"
echo "M10 body's starter falls out of its pool body=$(stage body)   (want: IDEATING)"

rm -rf "$T"
