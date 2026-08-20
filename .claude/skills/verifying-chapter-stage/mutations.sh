#!/bin/bash
# Mutation proof for scripts/chapter-stage.mjs: does each gate actually MOVE the audited stage?
# Works on a scratch copy; the real tree is never touched.
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
T="$(mktemp -d)"
stage () { (cd "$T" && node scripts/chapter-stage.mjs "$1" 2>&1 | grep -oE '=> [a-z]+ is [A-Z]+' | awk '{print $4}'); }
fresh () { rm -rf "$T"; mkdir -p "$T"; cp -r "$REPO/src" "$REPO/scripts" "$REPO/test" "$T/"; }
# Gives the reef an anomaly of its own, so the new ideation bar stops masking every other gate.
give_reef_anomaly () { sed -i "s/^  deadfall: {/  reefquake: { name: 'Reef Quake', icon: '🪸', from: 'x', desc: 'd', when: () => true, weight: 1, chapter: 'reef', kind: 'k', minLevel: 1 },\n  deadfall: {/" "$T/src/config.js"; }

fresh
echo "BASELINE   surf=$(stage surf)  reef=$(stage reef)  pond=$(stage pond)  body=$(stage body)"
fresh; give_reef_anomaly
echo "M0 reef GAINS a unique anomaly           reef=$(stage reef)      (want: above IDEATING — proves the new bar is what held it)"

# --- the three ideation bars (owner, 2026-08-20) ---
fresh; give_reef_anomaly
sed -i "s/    weapons: \['gnash', 'chum', 'bilge'\],/    weapons: ['gnash', 'chum'],/" "$T/src/config.js"
sed -i "s/starter: 'gnash'/starter: 'gnash'/" "$T/src/config.js"
echo "M1 wreck's pool drops to 2 weapons       wreck=$(stage wreck)   (want: IDEATING)"

# Swap a Reef weapon for `chum`, which really does carry 3 mods. Surgically deleting mods off
# stinger (7 of them) proves nothing unless the cut crosses 4 — a mutation must cross the exact
# threshold it is testing, and the simplest way to cross it is to point at something already past it.
fresh; give_reef_anomaly
sed -i "s/    weapons: \['stinger', 'quillBurst', 'pulsarSweep'\],/    weapons: ['chum', 'quillBurst', 'pulsarSweep'],/" "$T/src/config.js"
sed -i "s/starter: 'stinger',/starter: 'chum',/" "$T/src/config.js"
echo "M2 a Reef weapon has only 3 mods         reef=$(stage reef)      (want: IDEATING)"

fresh
echo "M3 no chapter-scoped anomaly (baseline)  reef=$(stage reef)      (want: IDEATING)"

# --- the pre-existing gates, re-proven against the new baseline ---
fresh
sed -i "s/^  'Shore Crab':.*$//" "$T/src/fr.js"
echo "M4 fr.js loses 'Shore Crab'              surf=$(stage surf)    (want: below POLISHING)"

# The Deep's signature has exactly ONE payload key, so dropping it really does leave the mechanic
# inert. The Surf carries both `pools` and `bars`, so removing one there is not decisive — the
# signature stays genuinely wired and a passing audit is the CORRECT answer.
fresh
sed -i "s/^  deadfall: {/  deepdark: { name: 'Deep Dark', icon: '🌑', from: 'x', desc: 'd', when: () => true, weight: 1, chapter: 'deep', kind: 'k', minLevel: 1 },\n  deadfall: {/" "$T/src/config.js"
sed -i "s/sig?.pools ?? sig?.pockets ?? sig?.maws/sig?.pools ?? sig?.pockets/" "$T/src/config.js"
sed -i "s/CHAPTERS\[run.chapter\].signature?.maws/false/g" "$T/src/sim.js"
echo "M5 EVERY read of .maws deleted           deep=$(stage deep)   (want: IDEATING — The Deep's maws go inert)"

fresh
sed -i "s/    balance: { spawnMul: 0.75, enemyDmgMul: 0.75, enemyHpMul: 0.85, xpMul: 1.25, maxAliveMul: 0.6 },/    balance: { spawnMul: 0.75, enemyDmgMul: 0.75, enemyHpMul: 0.75, xpMul: 1.25, maxAliveMul: 0.45 },/" "$T/src/config.js"
echo "M6 pond's balance cloned from body       pond=$(stage pond)  (want: POLISHING)"

fresh
sed -i "s/      bgColor: 0x2e6258,/      bgColor: 0xf4efe6,/" "$T/src/config.js"
echo "M7 pond's bgColor cloned from body       pond=$(stage pond)   (want: BUILDING)"

fresh
sed -i "s/weapons: \['star', 'orbit', 'wave', 'homing'\], starter: 'star',/weapons: ['orbit', 'wave', 'homing'], starter: 'star',/" "$T/src/config.js"
echo "M8 body's starter falls out of its pool  body=$(stage body)   (want: IDEATING)"

rm -rf "$T"
