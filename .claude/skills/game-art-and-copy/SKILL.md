---
name: game-art-and-copy
description: Use when adding or changing anything the player SEES or READS in Charming Anomaly — a creature or weapon bake, an effect, a prop, a UI icon, a card name or description, a menu string, a French translation. Carries the top-down projection rule and its water exception, the borrowed-art trap, the rule that a card must name the bar it reads in the words on the HUD, and the two i18n rules that have shipped untranslatable copy four separate times. Triggers on "draw", "bake", "make it look like", "the sprite", "the icon", "new card text", "the wording", "translate", "French", "fr.js".
---

# Art and copy in Charming Anomaly

Everything here fails quietly: the art rules produce a drawing that is coherent and *wrong for this
game*, and the copy rules produce English on a French screen, or a sentence that names a mechanic
the player has never seen — with a green suite either way.

## Projection — the camera looks straight down

- **The camera looks straight down. Every entity bake is drawn from directly overhead.** Buildings
  and props are the ONE exception (they stand upright, deliberately — see `upright` in the district
  tables); creatures, weapons, effects and pickups are all plan views. v6.8 shipped the Trash
  Tornado as a side elevation — a funnel with a mouth at the top and a tip dragging along the
  street — which is a coherent drawing of a tornado and the wrong projection for this game, and it
  took a whole version to undo. A screenshot does not catch this on its own: the v6.8 capture was
  read for "does it look like a tornado" and passed. Ask the second question explicitly — *is this
  the same viewpoint as the sprites around it?* — because the answer is in the same image.
  **The rule is about a FLOOR, and v7.70 established the exception that follows from that.** Owner:
  "it's a top down game but those chapters are in the water so the jellyfish can be sideways." An
  animal hanging in a water column has no floor to lie on, so a side elevation reads as a body at a
  depth rather than as a prop lying down — the tornado failed the mirror-image test, being
  ground-attached and drawn as though it were not. The Shelf's Moon Jelly is therefore the one
  side-on creature in the game, deliberately; do not "fix" it back to plan view. **A side-on body
  costs a matching `lean`, and getting that pair wrong fails silently:** the jelly puts its apex at
  +x and streams everything to -x, which is bilaterally symmetric about the forward axis and so
  earns `lean: 90` (it swims bell-first at you, tentacles behind, using the existing facing code).
  Bell-UP with tentacles hanging down would instead have a distinct UP, i.e. `lean: 30`. Pick the
  wrong one and nothing throws — the body just never turns while its trailing parts point in one
  fixed screen direction. Run RA asserts both halves for the jelly.
  **v7.143-4 WIDENED THAT EXCEPTION FROM "sideways" TO "any orientation" — BUT IT IS A PERMISSION,
  NOT A STYLE, and that distinction cost a release to learn.** Owner: "you're always drawing stuff
  either top down or facing view. this is underwater, so stuff can be whatever 3D rotated." The
  no-floor argument does not care what kind of thing is falling, so a piece of junk sinking through
  water may be turned. **Turn a piece only when the turn BUYS something.** Of Ballast's five
  (`T.ballastJunk`) exactly ONE is: the oil drum. Seen from directly overhead a drum is a rounded
  rectangle, and five rounds of surface detail on a rounded rectangle failed to make one read as a
  drum — it came back as a sliced loaf, a crate, a biscuit. No amount of paint fixes a silhouette;
  turned in space the lid is an ellipse with two bungs and the answer is instant.
  The same session then turned the other four for CONSISTENCY and shipped it, and the owner's
  verdict was immediate: *"anchor / tyre were good before, here they just look like someone force
  perspective on them they're ugly."* They were reverted the same day. The tell is worth having:
  a wheel is radially symmetric and a beam is a long straight thing, so turning either adds no
  information and only skews a shape that already read — which is exactly what "applied rather
  than seen" looks like. **A mixed set is FINE**; the "it would be inconsistent" argument is what
  produced the bad release, so do not reach for it again. `ellPts()` next to `piece()` in render.js
  is the tool when a turn IS justified: `Graphics.ellipse` is axis-aligned, and every foreshortened
  circle is an ellipse that has been TURNED.

- **A BORROWED WEAPON BRINGS ITS OLD CHAPTER'S ART WITH IT.** A new chapter's arsenal is normally
  picked for what the weapons DO — the Reef's placeholder set says so explicitly, "picked for the
  LANE rather than for the theme" — and that reasoning is sound and still lands you a maple leaf in
  the open ocean. v7.x's Trawl opened with the Boomerang on the honest ground that "out along a line
  and back" is its unbuilt native's shape one weapon early; `T.boomerang` is baked as a LEAF (the
  card is Boomerang Leaf), so the first probe frame of a chapter set in mid-water had an orange
  autumn leaf spinning through it. The check is one grep of the bake, not a judgement call: find the
  weapon's `T.<id>` in render.js and look at what it draws. Prefer abstract casts (an arc, a vortex,
  a sound ring) when borrowing across biomes, and shoot the chapter before believing the list.

- **UI that depicts a game entity uses the game's art, not a lookalike.** render.js already draws every creature (`ROSTER_LOOKS`), every weapon and every prop; if a menu needs to show one, route the real thing out (the `src/cast/*.png` bake is the worked example) rather than reaching for an emoji or a stand-in shape. v6.7.1 shipped 🐜🐝🕷️ per chapter and the tardigrade came out as 🐻 — a bear — while `drawTardigrade` sat in render.js the whole time. Emoji only survive where the glyph *is* the thing (a coin, a lock).

- **Say when something is a stand-in.** If you do ship a placeholder or an approximation, name it as one in the commit and the report. That 🐻 shipped under a code comment calling it "the cheapest honest answer", which read as a considered decision and cost a review round-trip to undo.

## Copy — legibility first, then translatability

- **A CARD THAT READS A GAME SYSTEM MUST NAME THAT SYSTEM IN THE WORDS THE PLAYER SEES — and must
  never coin a noun for something the game shows nowhere else.** Two failures of the same kind, both
  shipped in v7.163 and both found by the owner READING THE CARD, not by any assert:
  - The Shelf's two Pollution mods said *"up to 50% in the filthiest water"*. That states the
    fiction and never points at the rail on the HUD, so the card describes a mood rather than a
    mechanic. Owner: *"as a player, i don't understand how this mechanic works by reading this. I am
    the one that gets polluted, is it related to my pollution bar?"* It is. **The shipped precedent
    was already in the file:** the Sunlance says *"It reaches as far as your Light does."* — it names
    the bar, possessively, and lets the HUD do the rest. Copy that idiom instead of inventing one.
  - Foul Spring said *"spends the upwelling"*, and `upwelling` appears **nowhere the player can
    reach it** — not the HUD, not the brief, not fr.js outside that one line. A card is the wrong
    place to introduce a proper noun for a mechanic that has never been named; it now says "clean
    water" and "the patch", which is what is actually on screen. A careful French translation had
    already been written (`remontée`) for a word no player has ever seen.

  The process gap both came from: the new strings were checked for fr.js key collisions and for
  `tt()` template correctness, and never for **legibility**. Those checks prove a string is unique
  and translatable, not that it means anything. So before writing a card that reads a bar, a zone or
  a resource, **grep for how an existing card phrases the same kind of dependency** (`grep -n "your
  " src/config.js` finds the Sunlance's line), and **grep every noun you are about to use against
  the player-facing surfaces** — `src/fr.js`, `src/ui.js`, the chapter's `name`/`tagline` — not just
  against the config for a collision. A noun that only exists in comments is a noun you invented.

- **PLAYER-VISIBLE COPY THAT CONTAINS A NUMBER MUST BE A `tt()` TEMPLATE, and the French coverage
  assert only sees config TABLES.** Two separate traps that landed together in v7.55, where the
  whole elements redesign shipped to the live URL untranslatable and the suite was green:
  - `t()` is keyed by the **exact English source string** (i18n.js — the English IS the key). A
    sentence built with its numbers already in it therefore has a *different key every time the
    value changes*, and no dictionary can ever hold enough of them: every element card and every
    Codex page fell through to English in every language. `tt('…{pct}% over {secs}s…', {pct, secs})`
    is the fix and predates the bug by a year — the key is the TEMPLATE, which is also what lets the
    translation put the numbers where French wants them. Keep a plain-string composer next to it
    (`elText`) for the consumers that need one (a card's own `desc`, the dev-menu filter, tests) so
    the two can never drift. Placeholder parity is asserted across the whole dictionary in run XX;
    a misspelt `{pct}` prints literal braces to the player and reads perfectly in review.
  - run XX's coverage walk enumerates config **tables** (`WEAPONS`, `ELEMENTS`, `ANOMALIES`,
    `WEAPON_MODS`, `ELITE_AFFIXES`, …) reading `name`/`desc`/`title`/`from`. **Copy that lives in a
    function or a bare const is exempt from it by construction** — as `elementCardDesc`,
    `elementCodex` and `ELEMENT_CODEX_INTRO` were. This is the THIRD time that exemption has
    shipped untranslated strings (two City enemies in v6.3, every weapon mod in v6.6.26). When you
    add player-visible strings anywhere, add them to that walk in the same commit and watch it go
    red before you write the French.

- **Editing `src/fr.js` by exact-string match fails on the NBSP.** French values carry U+00A0
  before `: ; ! ?` (`'Nouveau !'`, `'MONTÉE DE NIVEAU !'`, `'achat : 🪙 {n}'`), and it is
  indistinguishable from a space on screen — an anchor that includes one of those lines will not
  match no matter how carefully you copy it. Anchor on a single line with no French punctuation,
  or make the edit with node/python. Same reason a NBSP must never reach a KEY: the key is the
  English source string, so one U+00A0 in it means the lookup can never hit (run XX asserts this).

- **A new weapon MOD's display name must not already exist in fr.js.** The dictionary is keyed by
  the English source string, so a second mod called `Slow Burn` silently inherits the first one's
  translation — a real French word, on the right screen, describing the wrong thing, and run XX is
  perfectly happy because the key IS covered. It is also just confusing to have two. Grep fr.js for
  the name before adding it. (The Twilight's Foxfire hit this and shipped as `Long Burn` instead.)
