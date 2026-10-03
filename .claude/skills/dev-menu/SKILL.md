---
name: dev-menu
description: Use when testing one specific card, weapon, mod, element or anomaly in Charming Anomaly by hand (on a phone against the live URL or on localhost), or when touching the dev menu, devCards, devTake, the DEV toggle or the coin-badge tap. Covers how to open it, why it ignores eligibility rules, and the leaderboard gate.
---

# The hidden dev menu — how to test one specific card

**Seven quick taps on the TITLE WORDMARK** turn DEV on (the pill appears); then **one tap on the
HUD coin badge**, mid-run, pauses the game and opens a list of *every* card the game can produce
(weapons, passives, weapon mods, elements, anomalies).
Tapping one adds it to the run; the list rebuilds, so a weapon you just took now reads `Lv 2`.
Resume closes it. It ships in the production bundle deliberately — the point is to test a card on
a phone against the live URL, not only on localhost.

- **THE BADGE HAS NO GESTURE OF ITS OWN, AND THAT IS THE POINT.** It used to take its own
  seven-tap burst, independent of the title's DEV toggle — so the game had TWO dev switches and
  therefore two different answers to "is this a dev run". The leaderboard was wired to only one of
  them: `run._devUsed`, set when a dev CARD is taken. A run played with DEV on to reach a WIP
  chapter submitted to the public board like any other, and did (v7.161.0). One switch now:
  `meta.dev` gates the card list, and `endRun` (main.js) refuses to submit anything played under
  it. If you ever give the badge its own gesture back, you have re-created the bug — run LB
  asserts the gate, so the suite will tell you.
- The title's seven taps must be within `DEV_TAP_WINDOW_MS` (1s) of each other, so the counter
  cannot creep up from stray taps.
- The filter matches title, description **and kind** — type `anomaly` to get the whole slate,
  `mod` for every weapon mod.
- `devCards(run)` (sim.js) ignores every eligibility rule on purpose: chapter pool, minLevel, an
  anomaly's `when` gate, `MAX_ANOMALIES_PER_RUN`, already-picked dedup. That is the whole point —
  SUBMISSION needs an elite kill before the real pool will offer it.
- `devTake` routes through `applyChoice` via `run.levelUpChoices`, so a dev-added card takes the
  **shipped** code path. Do not reimplement the branches here; you would be testing a second
  implementation instead of the game.
- Run DV in the suite guards both halves. Both fail silently otherwise: `devCards` walks the
  rarity ladder because `make*Card` returns null for a tier a card does not offer (a `switch` mod
  is normal-only, Sweep Loot is epic-only), and without the walk **9 cards are simply absent from
  the list** — exactly the ones whose rarity rules are unusual, i.e. the ones most worth testing.
- The dev screen is Pixi-free like the rest of ui.js, so its layout is testable with the throwaway
  `harness.html` trick in `probing-the-game` (see *When there is no MCP browser tab*) — no app
  boot needed.
