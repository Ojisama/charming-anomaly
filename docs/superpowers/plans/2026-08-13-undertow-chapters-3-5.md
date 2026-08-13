# Undertow chapters 3–5 — build notes

**Spec:** `docs/superpowers/specs/2026-08-13-book-2-undertow-design.md` (§6.3–§6.5, §7, §9)

Owner instruction, 2026-08-13 night: *"The player character is ugly, let's drop the idea of a worm.
Then code the other chapters… except the boss."* Owner asleep; every decision below is mine, made
rather than asked, and each one says what it costs if it is wrong.

---

## Ruling 1 — build order deviates from spec §9, on purpose

Spec order is Shelf-retint → Reef → Trawl → Deep. **I am building Reef → Trawl → Deep, and doing the
Shelf retint last.**

The spec's step 2 turns The Shelf's bar from Light into Clarity and its dark into murk, so that the
*dark* moves down to The Deep. That ordering assumes every later step also happens. It is not robust
to stopping early: The Shelf's light/dark rig is shipped, measured and tuned (v7.58–v7.60), and
retinting it before The Deep exists would leave the game with **no** dark chapter and nothing to show
for it. Building the new chapters first is strictly recoverable; retinting a working chapter first is
not.

*Cost if wrong:* the §5.2 ruling ("one gimmick, one button, one second job") stays unfalsified for one
more chapter than the spec wanted. That is a delay, not a defect — Reef proves the same ruling with a
gimmick that is further from The Surf's, which is a stronger test, just a more expensive one.

## Ruling 2 — one player body for the whole book, scaled per chapter

`render.formScale` (shipped with the fish). The book's "you grow in each chapter" arc is a size step,
not five animals. Ladder: Surf 1.0 → Shelf 1.15 → Reef 1.3 → Trawl 1.55 → Deep 1.85.

*Cost if wrong:* the growth reads as the camera zooming rather than the fish growing. The fix is a
per-chapter tint step on top, which the field already allows.

---

## The Reef — chapter 3, id `reef`

**Gimmick `lane`, left-to-right.** The Beyond's lane scrolls the player along −y and strafes on x.
This needs the axes swapped, so `lane` stops being a boolean and gains an axis. Everything else in
lane mode is reused untouched.

**The one real piece of work** (spec §8.3): `stepObstacles` early-returns for lane chapters. Tunnel
walls need it on. Find what that early return protects *before* removing it, and gate the change on
the chapter, never on lane in general — The Beyond must not change behaviour.

- **Roster:** moray (`tank`, `latch`), damselfish (`normal`), lionfish (`fast`, `pounce`).
- **Bar: Air.** Ambient drain; refill at air pockets fixed in the tunnels. At empty you drown — DoT,
  not a damage multiplier. (The Surf already spends the book's one licence to put the bar on damage.)
- **Button: Burst** — a directed dash that shatters a telegraphed weak point, on the shipped crush
  path. An empty bar still gives the shove, so no charge is never structurally trapping.
- **Weapons:** Squid Ink (the blind — the book's one new sim branch, reused by The Deep's Scent) and
  Oxygen Tank (the refill object weaponized).

## The Trawl — chapter 4, id `trawl`

**Gimmick `trawl`.** A net wall crosses the map on a timer from a direction, killing **both** sides
and aiming at nothing. Precedent: the asteroids and the `predators` trap field both already damage
both sides. Target sweep 60–90 px/s (spec §6.4's derivation).

- **Roster:** mackerel (`normal`), tuna (`fast`, `dashBurst`), sea lion (`tank`, `pounce`).
- **The school is a moving OBSTACLE, not boids** (spec §6.4). A barrier you cannot cross is one
  entity with a shape, at a tenth the cost of a real boids pass.
- **Bar: Feed**, refilled only in the churned wake behind the net. At empty you tire and the net
  catches you — the bar's second job and the signature are the same sentence.
- **Button: Breach** — tear a hole in the net that persists. A door you made, which the crowd also
  uses.
- **Weapons:** Longline (a line that hits everything along its sweep), Net Toss (a group hold).

## The Deep — chapter 5, id `deep`

**Gimmick `dark`.** The Shelf's shipped scrim and radius rig at full darkness.

- **Refill: the anglerfish** — a roster entry with a proximity check, not a streamed field. As your
  bar fills its mouth opens wider; gamble one second too long and it bites hard.
- **Roster:** anglerfish (the refill, a `tank` when provoked), hagfish (`normal`, `webZone`),
  viperfish (`fast`, `dashBurst`).
- **Bar: Light** — sets sight radius and fuels Scent.
- **Button: Scent** — spend light: enemies in a wide radius are outlined and take bonus damage, you
  close faster, and weak points in the wreck field are revealed. In the Reef weak points are marked
  *for* you; here you spend to see them yourself.
- **Weapon: Fin Hit** — movement-coupled, scaling with speed. ⚠ `ANOMALIES.stillness` zeroes it
  entirely and is unconditional `weight: 1`, so it *will* be offered here. Say so in the card.

---

## Scope discipline

Per chapter, in this order, and a chapter is not started until the previous one is complete:
**shell (config + registration + gate) → signature mechanic → bar + button → roster art → native
weapons → French → tests.**

If a chapter cannot be finished, it is better to have not started it: a half-registered chapter is
reachable through the dev gate and reads as a broken game rather than as an absent one.

Mod budget (spec §7): **~4 mods per weapon, and cut a weapon rather than invent mods.** Cut order if
needed: Net Toss first, then Longline.

---

## Salt allocations for the new streamed fields

`obstacleCellHash(i, j, seed, salt)` — a collision is SILENT: two fields occupy exactly the same
cells, which reads as "the mechanic spawns on top of the other one" and never as an error. Claimed
blocks today are 0-4 (obstacles), 11-14 (eddies), 15-17 (traps), 20-23 (shafts), 30-32 (sandbars).

Reserved here so the three chapters cannot collide with each other while being built in sequence:

| Block | Chapter | Field |
|---|---|---|
| 40-42 | Reef | air pockets |
| 45-47 | Trawl | anything streamed (the net itself is not a streamed field) |
| 50-52 | Deep | wreck field / weak points |
