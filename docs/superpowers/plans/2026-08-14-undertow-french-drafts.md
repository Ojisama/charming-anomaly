# French drafts — The Reef and The Trawl (and the Pincer strings still unauthorised from The Surf)

Nothing here is applied. Per the standing rule, French copy is the owner's call, so these are drafts
to pick from rather than a fait accompli. Pick one per row and I will apply them.

⚠ Before ANY of this lands: run XX's coverage walk enumerates `CHAPTER_ORDER`, which is **Book 1
only**, so it does not check a single Undertow string. Widen it to `Object.keys(CHAPTERS)` FIRST and
watch it go red — that is what tells us the true list of missing strings rather than this one, which
is assembled by hand and therefore certainly incomplete.

⚠ `src/fr.js` values carry U+00A0 before `: ; ! ?`, which is indistinguishable from a space on
screen. Edits go through node/python, never an exact-string anchor.

---

## The Reef — chapter

| English | A | B | C |
|---|---|---|---|
| `The Reef` | **Le Récif** | — | — |
| tagline `the current only runs one way` | **le courant ne va que dans un sens** | un seul sens, jamais l'autre | le courant ne se retourne pas |

A is literal and keeps the tagline's flat statement-of-fact tone, which is what the other chapters'
taglines do ("the tide decides" → "la marée décide"). B is punchier but loses "current". C reads as a
promise being made to you, which is arguably better drama but says something slightly different — the
English is about the world, C is about your expectations.

## The Reef — creatures

| English | A | B | Note |
|---|---|---|---|
| `Moray` | **Murène** | — | Unambiguous; no alternative worth offering. |
| `Damselfish` | **Demoiselle** | Poisson-demoiselle | A is the actual French common name AND keeps the English's girl/damsel pun exactly. B is clearer to a non-fishkeeper but clumsy. |
| `Lionfish` | **Rascasse volante** | Poisson-lion | A is the standard French name. B is a calque, but it is the one everyone recognises from aquariums and games, and it keeps the "lion" that makes the creature sound dangerous. |

My lean: Murène / Demoiselle / **Poisson-lion** — breaking from the standard name only for the
lionfish, because "Rascasse volante" is three syllables of unfamiliar and the card has to read fast.

## The Reef — bar and button

Not yet built at the time of writing; drafts held until the English is fixed. Expect `Air` (identical
in French) and a Burst verb, where the candidates are **Percée** (a breakthrough — same word used for
a military breach), **Ruée** (a rush/charge) and **Élan** (momentum, gentler).

---

## The Trawl — chapter (added 2026-08-16)

Status of the ⚠ above, one chapter on: run XX's denominator **is** fixed — it now derives from
`BOOKS[].wip` (`shippedChapterIds()`), so the day Undertow drops its `wip` flag, all four chapters'
strings go red together instead of shipping in English. That is why this list can still be assembled
by hand without much risk: the suite is now the thing that will find what I miss.

| English | A | B | C |
|---|---|---|---|
| `The Trawl` | **Le Chalut** | La Drague | Le Chalutage |
| tagline `the net is not aiming at you` | **le filet ne vous vise pas** | le filet ne vise personne | rien ici ne vous vise |

*Le Chalut* is the net itself; *le chalutage* is the activity; *la drague* is a different gear
(dredging) and also slang for chatting someone up, which is a joke the chapter does not want.

On the tagline: A is the literal English and keeps the second person — the point of the line is that
the thing is indifferent *to you specifically*, which is unsettling in a way "aims at nobody" is not.
B states the general fact and is colder. C is the widest and the least about the net.

## The Trawl — creatures

| English | A | B | Note |
|---|---|---|---|
| `Mackerel` | **Maquereau** | — | Unambiguous. ⚠ *maquereau* is also slang for "pimp"; it is nonetheless the ordinary word for the fish and no French speaker will misread it on a bestiary card. |
| `Tuna` | **Thon** | Thon rouge | A is the plain word. B ("bluefin") is more precise and more evocative, and it is the tuna a trawler is actually chasing. |
| `Sea Lion` | **Otarie** | Lion de mer | A is the correct French name and what everyone says. B is a calque that keeps the "lion", the same trade-off as the lionfish above — but here A is the common word rather than the technical one, so the argument for B is much weaker. |

My lean: Maquereau / **Thon rouge** / Otarie.

## The Trawl — bar and button

| English | A | B | C |
|---|---|---|---|
| `Feed` (the bar) | **Pâture** | Ration | Festin |
| `Breach` (the button) | **Brèche** | Déchirure | Percée |

*Pâture* is what an animal feeds on — a food supply rather than a meal — which is exactly what the bar
is. *Ration* is too administrative for a wild animal; *Festin* (feast) is the wrong register for
something you are scraping out of churned water.

*Brèche* is a gap torn in a barrier and is the standard military/siege word, so it carries "you made
this hole" rather than "a hole exists". *Déchirure* is a tear in fabric, which is more literally what
happens to a net but reads as damage rather than as a door. *Percée* was also offered for the Reef's
Burst above — if that one is taken, this one should not be.

⚠ None of the above is applied. The Trawl also has no card-copy strings yet: its three weapons are
borrowed (`clawRake` / `hole` / `chitterShriek`) and already have French, and its two natives —
Longline and Net Toss — are not built.

---

## Still unauthorised from The Surf (drafted earlier, never picked)

| English | A | B | Note |
|---|---|---|---|
| `Pincer` | **Pince** | Pincer | A is the noun (a crab's claw); B reads as the verb "to pinch" in French and is wrong for a weapon name. |
| `Backwash` | **Contre-Courant** | Ressac | B is the literal word BUT it is now the French name of The Surf itself (Le Ressac), so it would collide. |

Twelve Pincer strings in total are drafted and waiting on these two head words.

---

## Applied without a ruling, because leaving it would have been worse

The Pincer's card copy changed with the 2026-08-14 shield-arc redesign ("held out at the nearest
enemy" is simply no longer what it does). `t()` is keyed by the exact English source string, so
changing the English ORPHANS the French entry and the card falls back to English for every French
player — which is a worse outcome than a translation you have not signed off. So both moved together:

| English (new) | French (applied, wants your eye) |
|---|---|
| `Guards the side you face with an open claw, and snaps whatever reaches it.` | `Protège le côté où vous regardez avec une pince ouverte et broie tout ce qui l'atteint.` |

Alternative if that reads stiff: `Pare du côté visé avec une pince ouverte et broie tout ce qui
l'atteint.` — shorter and more "parry", but *parer* is fencing rather than crab.
