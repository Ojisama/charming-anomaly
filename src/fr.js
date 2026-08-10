// French dictionary (v6.1 i18n). Keyed by the EXACT English source string — see i18n.js for the
// contract (English is the key; a missing entry falls back to English at display time).
// Two sections: UI chrome (hand-written alongside the t() sweep of ui.js), then the config.js
// content strings (weapons/mods/shop/elements/anomalies/consumables/chapters/enemies).
/* eslint-disable quote-props */

const UI = {
  // v6.6.17 pause build readout. Stat-table labels are column headers on a 320px sheet, so they
  // are kept to a single word wherever French allows one.
  'Damage': 'Dégâts',
  'Projectiles': 'Projectiles',
  'Orbs': 'Orbes',
  // v6.8: the Trash Tornado counts TORNADOES now, not chunks — 'Morceaux' (and the note about
  // débris being a mass noun) went with the orbital it labelled.
  'Tornadoes': 'Tornades',
  'Max alive': 'Actifs max',
  'Radius': 'Rayon',
  // 'Traque' alone, per the single-word rule above: it sits in the same table as 'Rayon' (the
  // idle orbit ring) with a px value beside it, so the row reads as a distance without saying so.
  'Hunt radius': 'Traque',
  'Travel speed': 'Vitesse',
  'Range': 'Portée',
  'Length': 'Longueur',
  'Width': 'Largeur',
  'Pierce': 'Perforation',
  // 'Délai', not 'Toutes les' (a dangling preposition before a value column, and wrong number
  // agreement under 2s) and NOT 'Cadence' — this dictionary already spends cadence on the INVERSE
  // ('cast rate' -> 'cadence de lancer'), where bigger means faster. This row is a raw interval.
  // 'délai entre élites/voitures/obus' is the established house term for exactly this.
  'Every': 'Délai',
  'dmg': 'dég',          // no period: weapons with base dmg under 10 render a decimal, and
                         // '6.3 dég. x3' puts two dots three characters apart at 11px
  'LV': 'NIV',
  // 'Ton anomalie' (owner call, v6.6.20), not 'Toi' and not 'Perso': every sibling heading in
  // this panel is a noun (weapon names, 'Éléments'), and a lone pronoun broke the column a
  // player scans down. It is also literally true — the player IS the anomaly — and keeps the
  // tutoiement 'Toi' was chosen for. Fits: .bd-nm ellipsises and already carries longer
  // weapon names in the same slot, with no LV badge on this row to compete for width.
  'You': 'Ton anomalie',
  'Elements': 'Éléments',
  '{n} picks': '{n} choix',
  // nav + title
  'Shop': 'Boutique',
  'Battle': 'Combat',
  'Daily': 'Défi',
  'Play': 'Jouer',
  'Play again': 'Rejouer',
  'Next level': 'Niveau suivant',
  'Menu': 'Menu',
  'Difficulty': 'Difficulté',
  'difficulty': 'difficulté',
  'the base game': 'le jeu de base',
  '+1 random anomaly': '+1 anomalie aléatoire',
  '+{n} random anomalies': '+{n} anomalies aléatoires',
  'enemy HP': 'PV ennemis',
  'coins': 'pièces',
  'win level {n} to unlock {m}': 'gagne le niveau {n} pour débloquer le {m}',
  'win {name} at difficulty 3+': 'gagne {name} en difficulté 3+',
  // 'te compte', not 'compte': objectless `compter` reads as "matters", not "is counting" — the
  // pronoun forces the intended, creepier sense while keeping "counting what?" withheld.
  'win The Beyond at level 5 — something has been counting': "gagne L'Au-delà au niveau 5 — quelque chose te compte",
  'best': 'record',
  'Boosters': 'Boosters',
  'this run only': 'cette partie seulement',
  'Done': 'OK',

  // shop
  '3rd': '3e',
  '4th': '4e',
  'All 4 upgrade slots unlocked.': 'Les 4 emplacements d\'amélioration sont débloqués.',
  'Unlock the {nth} upgrade slot — sacrifice {cost} upgrade levels (no coin refund).':
    'Débloque le {nth} emplacement d\'amélioration — sacrifie {cost} niveaux d\'amélioration (aucun remboursement).',
  // 'achat' (noun) not 'acheter' (verb): the chip sits at the end of a row whose label needs every
  // remaining px, and the verb is 4 characters longer for no added clarity on a buy button.
  'buy : 🪙 {n}': 'achat : 🪙 {n}',
  // Deliberately shorter than the English: the full phrase is 217px in a 202px pill on a 320px
  // phone. The modal this pill opens spells it out ("emplacement d'amélioration") in full.
  '{nth} upgrade slot': '{nth} emplacement',
  'Offer': 'Offrir',
  // 'Retirer', not 'Annuler': the sacrifice screen shows this per-row ↺ button AND a footer
  // Cancel at the same time, and both would otherwise read 'Annuler'. Undo takes back one offered
  // level; Cancel abandons the whole flow.
  'Undo': 'Retirer',
  'Offered {offered}/{cost}': 'Offert {offered}/{cost}',
  'Cancel': 'Annuler',
  'Confirm sacrifice': 'Confirmer le sacrifice',
  'Reset all progress': 'Réinitialiser la progression',
  'Erase everything?': 'Tout effacer ?',
  'Coins, upgrades, slots and best scores will be permanently erased.':
    'Pièces, améliorations, emplacements et records seront définitivement effacés.',
  'Erase everything': 'Tout effacer',
  'Settings': 'Réglages',
  'Save slots': 'Emplacements de sauvegarde',
  // screen-reader only (aria-label), lowercase to match how they read aloud in context
  'progress': 'progression',
  'add booster': 'ajouter un booster',
  'language': 'langue',
  'Slot': 'Emplacement',
  'Empty — new game': 'Vide — nouvelle partie',
  'Current': 'Actuel',
  // v6.6.12 save names. Two keys, not one: 'Name this save' is a heading AND the ✏️ button's
  // aria-label, where an infinitive is right for both — but the text FIELD wants a noun phrase, or a
  // screen reader announces the identical sentence twice in a row and the second carries nothing.
  'Name this save': 'Nommer cette sauvegarde',
  'Save name': 'Nom de la sauvegarde',
  // 'au numéro', not 'à un numéro': the referent is introduced two words earlier, so French requires
  // the definite article. The indefinite is an English calque that reads as "back to SOME number" —
  // the exact ambiguity this line exists to remove.
  'Slot {n} — leave it empty to go back to a number.':
    'Emplacement {n} — laisse vide pour revenir au numéro.',

  // level-up
  // 'montée de niveau' is the term the dictionary already uses for this concept elsewhere
  // ('Commence avec 2 montées de niveau en réserve'); 'niveau supérieur' named a state rather than
  // the action, giving one concept two words. Same length, so the headline is unaffected.
  'LEVEL UP!': 'MONTÉE DE NIVEAU !',
  '1-{n} · arrows · enter · R reroll': '1-{n} · flèches · entrée · R relance',
  'Reroll ({n}🪙)': 'Relancer ({n}🪙)',
  // (bare 'Reroll' retired in v6.6.19 — its only caller was the briefing's whole-set reroll button,
  // now replaced by per-anomaly ones. Run XX's dead-key sweep could not have caught it: that check
  // is a substring match and the new 'Reroll this anomaly…' keys contain the word.)
  'New!': 'Nouveau !',

  // briefings + anomalies
  'Daily Anomaly': 'Anomalie du jour',
  'Anomalies': 'Anomalies',
  // 'reroll' stays English: it is the term French players use for this action (owner's call,
  // v7.2.1), so the legend does not translate even though the aria-label below still says
  // 'Relancer cette anomalie' — that one is prose read aloud, not a label on a control.
  'reroll {n}': 'reroll {n}',
  'preview': 'aperçu',
  'Everyone gets the same anomaly today — new one at midnight.':
    'Tout le monde a la même anomalie aujourd\'hui — nouvelle à minuit.',
  'Start Daily Run': 'Lancer le défi du jour',
  'Start': 'Commencer',
  'The Blank\'s ladder is fixed — each difficulty adds its named modifier.':
    'L\'échelle du Blanc est fixe — chaque difficulté ajoute son modificateur attitré.',
  // v6.6.19 per-anomaly reroll, both INFINITIVE. The FR review argued for the imperative
  // ('Relance'), since this file reserves the infinitive for controls and addresses the player
  // directly in prose. The owner overruled it (v6.6.20) on the competing reading, which the review
  // had itself flagged as defensible: 'relancer {n}' labels the reroll buttons sitting under it,
  // and a legend labels like the control it legends. v7.1 dropped the sentence-length version of
  // that legend with the rest of the brief's prose — the price now sits on the ANOMALIES rule.
  'Reroll this anomaly ({n}🪙)': 'Relancer cette anomalie ({n}🪙)',

  // pause + summary
  'Paused': 'Pause',
  'Resume': 'Reprendre',
  'Quit to menu': 'Retour au menu',
  'You escaped! 🎉': 'Tu t\'es échappé·e ! 🎉',
  'Squished… 💦': 'Écrabouillé·e… 💦',
  'Time': 'Temps',
  'Kills': 'Victimes',
  'Level reached': 'Niveau atteint',
  'Difficulty {d} unlocked!': 'Difficulté {d} débloquée !',
  'Chapter unlocked: {name}!': 'Chapitre débloqué : {name} !',
  // v6.7 carousel counter. Stands alone in front of a numeral ("Chapitre 3"), so it takes no
  // article and no agreement — the single word is the whole string on purpose.
  'Chapter': 'Chapitre',
  'THE BLANK — the antibody that let you go wants you back': 'LE BLANC — l\'anticorps qui t\'a laissé filer veut que tu reviennes',
  'finish bonus': 'bonus de fin',
  // v7.5 SPECIALIST on the build sheet ("Spécialiste : Bouche d'Incendie Éclatée"). NBSP before the colon —
  // the one piece of French this string carries, and the reason it needs an entry at all.
  '{name}: {sub}': '{name} : {sub}',

  // HUD
  'WAVE': 'VAGUE',
  'Lv': 'Niv',
  // v6.3 dispatch beat (city elite spawn) — transient HUD banner, see updateHUD/dispatch in ui.js

  // level-up card composition parts (see tCardDesc/tCardTag in ui.js).
  // The stat-name half of a card line is deliberately NOT repeated here. Those keys ('damage',
  // 'fire rate', 'armor (flat damage block)', …) are PASSIVES descs owned by the CONFIG section
  // below, and `FR = { ...UI, ...CONFIG }` means CONFIG silently wins for any key both define — so
  // a UI copy is unreachable dead code. Ten such copies existed until v6.6.8 and two had drifted
  // apart from their live CONFIG twin, which meant the wording being maintained was the one no
  // player could ever see. Keep every config.js content string in CONFIG, and only strings ui.js
  // itself invents up here.
  'potency': 'puissance',
  '{name} upgrade': 'amélioration : {name}',
  // v7.5. Identical to the English on purpose, not an untranslated leftover: French sets the
  // tiret cadratin with a space on each side exactly as the source does, and this string is pure
  // punctuation around two placeholders. Kept as an entry so the composition is on the record as
  // reviewed (same reason 'Projectiles' and 'Berserk' sit here as identities).
  '{name} — {text}': '{name} — {text}',

  // rarities (RARITIES[..].name)
  'Normal': 'Normale',
  'Rare': 'Rare',
  'Epic': 'Épique',
  'Mythic': 'Mythique',
  'Legendary': 'Légendaire',
  // The other five are ADJECTIVES agreeing with a feminine 'rareté' ('Normale', 'Épique'); this
  // one is a NOUN, because the tier is not a degree of rarity — it is a kind of card.
  //
  // It does NOT match the English 'Rupture', deliberately (owner call, 2026-08-09). In everyday
  // French 'rupture' reads first as a breakup or a stock-out; the English word is physically
  // visceral and the chip carries no context to steer the reader toward that sense. 'Brèche' is
  // unclaimed in both dictionaries, is established FR game vocabulary, and reads as "something got
  // torn open" with no domestic sense.
  //
  // Why a fresh noun at all: the tier was called 'Anomaly'/'Anomalie', and 'anomalie' is already
  // spent on ELEVEN user-facing FR strings — the Daily's mutators ('Anomalie du jour', 'Relancer
  // cette anomalie', 'Les anomalies tordent les règles de cette partie'), MUTATORS.overtime and
  // .jumbo, and the player themselves ('Ton anomalie', line 35). The two obvious alternatives are
  // taken too: 'Faille' by riftScar and 'Singularité' by hole. And no ADJECTIVE can join the
  // Normale/Épique/Mythique series, because 'Instable' is already used twice — including by this
  // very card. A previously-unused noun was forced. See RARITIES in config.js.
  'Rupture': 'Brèche',

  'Reroll ({n}❤️)': 'Relancer ({n}❤️)',

  // v7.5 BLIND FAITH — the face-down deal. 'Face cachée' is the French card-game term of art
  // (poser une carte face cachée); 'Retournée' would name the reveal, which is the other state.
  'Face down': 'Face cachée',
  // Owner's line, verbatim, and NOT a translation of "Take it on faith": it is the Française des
  // Jeux lottery slogan every French player has heard. The French card is a BETTING joke (see
  // 'Tiercé gagnant' below) where the English one is a religious one — the 🙈 reads as a punter
  // not looking at the ticket. No final period, because the slogan has none; no NBSP before the
  // %, matching 'Les ennemis lâchent 30% de pièces en moins' in the CONFIG section.
  'Take it on faith.': '100% des gagnants ont tenté leur chance',
  // NOT 'Plus de relance': without the ne, 'plus de' reads as MORE on a button — the exact opposite
  // of what it does. 'Pas de relance' cannot be misread. Singular after 'pas de', as French wants.
  'No rerolls': 'Pas de relance',

  // v7.5 SPECIALIST — the weapon chooser (paintSubjectChooser).
  'Which weapon?': 'Quelle arme ?',
  // THIS ONE HAS A TUNING DEPENDENCY. French takes the singular after zero ('0 amélioration') and
  // after one, so a number-first phrase is only correct while {n} >= 2 — and it is: subjectPicks
  // (sim.js) is built solely from specialistSubjects, which filters weaponModPickCount >=
  // SPECIALIST_MIN_MODS, and that constant is 4 (config.js). The row cannot paint 0 or 1 today.
  // A label:value dodge ('améliorations prises : {n}') would be correct at every value forever, but
  // it is a stat line in a slot that holds card prose, so the phrase wins on the invariant.
  // IF SPECIALIST_MIN_MODS EVER DROPS BELOW 2, come back here — nothing else will tell you, run XX
  // asserts coverage and typography, not agreement.
  '{n} upgrades taken': '{n} améliorations prises',


  // anomaly cards (ANOMALIES in config.js): name, desc, and the `from` line under it
  // Title Case: every other content name in this file is ('Kystes Toxiques', 'Noyau Chargé').
  'Unstable Cores': 'Cœurs Instables',
  // 'souffle', not 'explosion': it is masculine, so the 'il' can only resolve to souffle/cœur. With
  // 'explosion' the pronoun was 'elle', whose nearest antecedent is 'la partie' three words earlier
  // — it read as "whatever THE RUN kills". 'au fil de' is the collocation for "over the run";
  // 'grandir avec' means growing alongside something. And souffle/explose keeps the blast/blows-up
  // variation the English has, where explosion/explose echoed.
  'Every elite drops an unstable core. Its blast grows with the run, and whatever it kills blows up too.':
    "Chaque élite lâche un cœur instable. Son souffle grandit au fil de la partie, et tout ce qu'il tue explose à son tour.",
  // 'un élite' (owner call): elliptical for 'un [ennemi] élite', which is the count-noun sense a
  // player means. 'une élite' is dictionary-correct for the abstract noun but reads as an elite
  // CORPS. This is the first place the game commits to a gender — everywhere else uses the neutral
  // plural ('les élites').
  // "s'est emballé", not 'est devenu critique': this dictionary already spends 'critique' on the
  // crit stat ('chance de critique', 'dégâts critiques'), so on a level-up screen "quelque chose est
  // devenu critique" can misparse as a crit proc. 's'emballer' is the FR idiom for a runaway
  // reaction and keeps the reactor wink next to 'cœur'.
  'you killed an elite and something went critical': "tu as tué un élite et quelque chose s'est emballé",

  // effect chip labels (EFFECT_LABELS in ui.js)
  'enemy spawns': 'apparitions ennemies',
  'enemy speed': 'vitesse ennemie',
  'enemy damage': 'dégâts ennemis',
  'enemy size': 'taille ennemie',
  'damage you take': 'dégâts subis',
  'your damage': 'tes dégâts',
  'your move speed': 'ta vitesse',
  'XP': 'XP',
  'time between elites': 'délai entre élites',
  'infusion card chance': 'chance de carte d\'infusion',
  'pickup magnet': 'aimant à butin',
  'current push': 'poussée du courant',
  'pheromone life': 'durée des phéromones',
  'trap count': 'nombre de pièges',
  'time between cars': 'délai entre voitures',
  'time between shells': 'délai entre obus',
  'gravity well force': 'force des puits de gravité',
  'acid pool burn': 'brûlure des flaques d\'acide',
}

// config.js content strings — filled by the translation pass (see fr-config section below).
const CONFIG = {
  // ---- v7.2 anomaly slate ------------------------------------------------------------
  // These are config.js CONTENT strings, so they live in CONFIG and not in UI — FR spreads
  // { ...UI, ...CONFIG } and CONFIG silently wins, which is how ten keys drifted in v6.6.8. The
  // Unstable Cores block above set the wrong precedent by sitting in UI; do not follow it.
  //
  // KEYS ARE COMPOSED AT RUNTIME. Every desc is a template literal interpolating its own tuning
  // constant, so the key is not a literal anywhere in src/ and cannot be hand-typed safely: one
  // ASCII 'x' where the source has U+00D7 and the lookup can never hit. Regenerate rather than
  // retype. Retuning a constant is caught loudly — run XX's coverage check goes red naming the new
  // English string (mutation-proven: BERSERK_DURATION 5 -> 4 fires it).
  //
  // CONVENTIONS, all checked against this dictionary rather than assumed: French decimal COMMA
  // (ui.js's dec() already renders every build-sheet number that way, so a card reading x0.2 would
  // be the only dot on screen); durations without a space ('5s', following 'sur 3s' in the whip
  // mods); U+00A0 before : ; ! ? in VALUES only; the inclusive '·e' where a past participle agrees
  // with the player. Vocabulary is REUSED, never invented: cadence de tir, PV, XP, gemmes, pièces,
  // élite, pièges à mâchoires, combos/élémentaire, soigner/soins, relance, victimes for kills.
  //
  // Three names are deliberate departures from the literal, each fixing a collision the literal
  // would have caused:
  //   Minimes  -> 'Mini-Moi'. FRENCH FALSE FRIEND: 'minime' means minimal/trivial (and is a youth
  //              sports bracket), so the literal names the card "the negligible ones" and says
  //              nothing about copies of you. Mini-Moi is the French dub's Mini-Me and is invariable.
  //   Wildfire -> 'Traînée de Feu'. 'Incendie' collides with Bouche d'Incendie Éclatée (the city's
  //              Burst Hydrant).
  //   Deadfall -> 'Chausse-Trappe'. 'Traquenard' shares its stem with ~10 existing entries that all
  //              mean HUNT/SEEK (Cellule Traqueuse, traqueurs, Traque, Traque Élargie, rayon de
  //              traque), so the card reads as a seeker card until the desc corrects you.
  //
  // Two that look like errors and are not: 'Martyr' takes no '·e' (the feminine 'martyre' is a
  // homograph of 'le martyre' = martyrdom), and "tu t'es demandé" takes no agreement either
  // (se demander puts the reflexive in the indirect object, so the participle does not agree).
  'Berserk': 'Berserk',
  'Taking a hit doubles your damage for 5s. No cooldown, no threshold.': 'Être touché double tes dégâts pendant 5s. Sans recharge, sans seuil.',
  'something hit you, and you liked it': "quelque chose t'a frappé, et ça t'a plu",
  'Stillness': 'Immobilité',
  'Stand still and your damage climbs to ×3 over 2s. Moving drops it instantly.': "Reste immobile et tes dégâts montent jusqu'à ×3 en 2s. Bouger les fait retomber aussitôt.",
  'the world learned to wait for you': "le monde a appris à t'attendre",
  'Martyr': 'Martyr',
  'Every point of HP you lose detonates around you, harder as the run goes on.': 'Chaque point de PV que tu perds détone autour de toi, de plus en plus fort au fil de la partie.',
  'you bled, and the ground answered': 'tu as saigné, et le sol a répondu',
  'Chaos Pact': 'Pacte du Chaos',
  'Every minute: 15s of +50% enemies, then +50% damage until the next one.': "Chaque minute : 15s avec +50% d'ennemis, puis +50% de dégâts jusqu'à la suivante.",
  'you agreed to a rhythm you did not set': "tu as accepté un rythme que tu n'as pas choisi",
  'Deadfall': 'Chausse-Trappe',
  'Snap traps ignore you, and re-arm 5 times faster.': "Les pièges à mâchoires t'ignorent et se réarment 5 fois plus vite.",
  'the traps stopped caring about you': 'les pièges se sont désintéressés de toi',
  'Alignment': 'Alignement',
  'Element combos have no cooldown. Every hit that can trigger one, does.': "Les combos élémentaires n'ont plus de recharge. Chaque coup qui peut en déclencher un le fait.",
  'two elements found the same beat': 'deux éléments ont trouvé le même tempo',
  'Time Debt': 'Dette Temporelle',
  'Everything arrives 50% sooner — enemies, elites, the ending. Gems pay +50% XP.': "Tout arrive 50% plus tôt — ennemis, élites, la fin. Les gemmes rapportent +50% d'XP.",
  'the clock started running against you': "l'horloge s'est mise à tourner contre toi",
  'Brittle': 'Fragile',
  'Your max HP becomes 1. Your damage is ×4.': 'Tes PV max tombent à 1. Tes dégâts passent à ×4.',
  'you traded every future hit for this one': 'tu as troqué tous les coups à venir contre celui-ci',
  'Overload': 'Surcharge',
  '×2 fire rate and ×2 damage, for 0.75 HP every second.': 'Cadence de tir ×2 et dégâts ×2, contre 0,75 PV par seconde.',
  'you found the part of you that burns': 'tu as trouvé la part de toi qui brûle',
  'Blood Pact': 'Pacte de Sang',
  'You can never heal again. Every kill makes you permanently stronger — around ×2 by the end.': 'Tu ne peux plus jamais te soigner. Chaque victime te renforce définitivement — environ ×2 en fin de partie.',
  'you swore off healing': 'tu as renoncé aux soins',
  'Blood Money': 'Prix du Sang',
  'Rerolls cost 10 HP instead of coins.': 'Les relances coûtent 10 PV au lieu de pièces.',
  'you rerolled once, and wondered what it was really worth': "tu as relancé une fois, et tu t'es demandé ce que ça valait vraiment",
  'Avarice': 'Avarice',
  'Enemies drop 30% fewer coins, and 1 in 5 you pick up heals 5 HP instead of paying.': 'Les ennemis lâchent 30% de pièces en moins, et 1 sur 5 que tu ramasses te rend 5 PV au lieu de rapporter.',
  'the coins started tasting like medicine': 'les pièces ont pris un goût de médicament',
  // The card is a MACHINE GUN now (🔫), not soy milk. `Mitraillette` is the owner's word: strictly
  // the submachine gun ('mitrailleuse' is the belt-fed one), which is the toy-loud register the
  // ×5-shots-for-×0,2-damage spray asks for.
  'Machine Gun': 'Mitraillette',
  '×5 fire rate, ×0.2 damage. Burn, chill and shock land 5 times as often.': 'Cadence de tir ×5, dégâts ×0,2. Brûlure, froid et foudre se déclenchent 5 fois plus souvent.',
  'your elements wanted more chances, not bigger ones': 'tes éléments voulaient plus de chances, pas plus de puissance',
  'Wildfire': 'Traînée de Feu',
  'When a burning enemy dies, the fire jumps to the nearest one — up to 3 times.': "Quand un ennemi qui brûle meurt, le feu saute sur le plus proche — jusqu'à 3 fois.",
  'your fire found something worth spreading to': 'ton feu a trouvé vers quoi se propager',
  'Minimes': 'Mini-Moi',
  'Copies of you peel off every 6s, pull the swarm away, and detonate.': "Des copies de toi se détachent toutes les 6s, attirent l'essaim au loin, puis explosent.",
  'there started being more of you than there was of you': "il s'est mis à y avoir plus de toi qu'il n'y avait de toi",
  // ---- v7.5 upgrade-pool cards ------------------------------------------------------
  // Same rules as the v7.2 slate above (composed keys — regenerate, never retype; French decimal
  // comma; U+00A0 before : ; ! ? in VALUES only; vocabulary reused, never invented).
  //
  // 'Tiercé gagnant' is the owner's word, verbatim: a PMU horse-betting reference, so the FRENCH
  // card is a gambling joke where the English one is a religious one. Nothing else in the entry
  // needs to move — 'face cachée', 'sort' and 'relancer' are card-and-betting vocabulary already,
  // and 'relancer' is literally the poker verb. Sentence case, unlike every other card name in
  // this file: it is a slogan-shaped phrase, set the way French sets one, and it is the owner call.
  // Kept from the pre-rename entry, because they govern the DESC below, which does not change:
  // 'ne sort' and NOT 'n'est tiré' — this dictionary spends *tirer* on SHOOTING (cadence de tir,
  // and 'Chaque arme envoie…' two cards down was itself written to dodge the verb), so a card
  // reading "rien … n'est tiré" parses as NOTHING GETS FIRED; 'sortir' is the French draw verb,
  // reused by Spécialiste below. Likewise 'tu n'en vois que la bordure' rather than 'seule sa
  // bordure apparaît' — *apparaître* is spent on things that SPAWN ('apparitions ennemies', 'Les
  // élites apparaissent'), and the border does not come into view, it is what never leaves it.
  // 'Épique' must stay spelled exactly as the RARITIES entry — the English key interpolates
  // RARITIES[BLIND_FAITH_FLOOR].name, so the two strings are one fact, and a French card naming a
  // tier the chip does not is a rule the player cannot check.
  'Blind Faith': 'Tiercé gagnant',
  'you stopped needing to know': "tu n'as plus eu besoin de savoir",
  'Every card is face down — only its border shows. Nothing below Epic is rolled, and you can never reroll.':
    "Chaque carte est face cachée — tu n'en vois que la bordure. Rien en dessous d'Épique ne sort, et tu ne peux plus jamais relancer.",
  // 'Bazooka' is the owner's word and is the same in both languages (it is in the Petit Robert).
  // The entry exists so run XX's coverage check sees the name, not because anything is translated.
  'Bazooka': 'Bazooka',
  // Conditionnel passé, not 'n'allait jamais suffire': the futur proche in the past is a calque
  // here — French wants a past anchor for it, and without one 'jamais' pulls toward a temporal
  // reading ("never got round to being enough") instead of the fatalism the English carries.
  'once was never going to be enough': "une seule fois n'aurait jamais suffi",
  // 'envoie', NOT 'tire'. Intransitive *tirer* + *plus* defaults to FREQUENCY in French ("tire 3
  // fois plus" = fires three times as often), which is the exact opposite of the clause that
  // follows, and no amount of trailing context undoes a misparse the reader has already made.
  // *envoyer* is quantitative — "envoyer plus" begs *plus de quoi* — it covers the orbs, beams and
  // tornadoes the English's "as much" exists to cover, and it drops the tire/tir echo.
  // 'dans 3 directions', not 'sur': *sur* goes with *réparti sur trois axes*; with *éventail* and
  // *direction* it is a calque of "spread across".
  // Words rather than 'cadence de tir ×0,5' (the Mitraillette / Surcharge idiom) because the
  // English says "at half the fire rate" and prints no multiplier either. 'pour' is the price —
  // 'contre' is the slate's other word for a cost, and either would do here.
  'Every weapon fires 3 times as much, spread in 3 directions — at half the fire rate.':
    'Chaque arme envoie 3 fois plus, en éventail dans 3 directions — pour une cadence de tir divisée par deux.',
  'Specialist': 'Spécialiste',
  // 'faire comme si' is the French for pretending; 'prétendre' is the false friend (it means to
  // CLAIM) and would have read as a calque.
  'you stopped pretending the rest of them were the plan': 'tu as arrêté de faire comme si les autres étaient le plan',
  // 'sortent' (to come up in a draw) is the card verb, kept distinct from 'apparaissent', which
  // this dictionary spends on things that SPAWN.
  // NOT an imperative. The pre-rename English opened 'Pick a weapon:' and this line opened
  // 'Choisis une arme :' — but the pause build sheet reprints the desc AFTER the weapon is locked
  // in, as 'Spécialiste : Bouche d'Incendie Éclatée — <desc>', where an order to pick one arrives twenty
  // minutes late. 'l'arme que tu désignes' is a generic present that is true in both places: on
  // the level-up card the naming is still to come, on the sheet it says which weapon that was —
  // exactly the load the English "the weapon you name" carries.
  // 'les prendre chacune', not 'prendre chacune': bare *chacune* as a direct object is grammatical
  // but stilted, and the clitic pins the antecedent to *les améliorations* (the sentence subject)
  // rather than leaving it to hop back over 'l'arme'.
  // '2 fois de plus' is safe here: it only collides with 'deux fois plus' (twice as many) inside a
  // comparative, and the English's "than anyone else" is gone — there was no anyone else anyway.
  // (Rendering it would have forced either that ambiguity or a 'plafond' the UI never prints —
  // modLine shows a mod's accumulated bonus, never its pick count.)
  // Last sentence spelled out rather than 'en proposent moins': the pronoun's antecedent is three
  // clauses back, and 'proposent moins' alone can be read as offering less VALUE.
  'Upgrades for the weapon you name come up far more often, and you may take 2 more of each. Every other weapon offers less.':
    "Les améliorations de l'arme que tu désignes sortent bien plus souvent, et tu peux les prendre chacune 2 fois de plus. Toutes les autres armes proposent moins d'améliorations.",
  // v6.2 Remaster — per-chapter endings
  'You slipped past the immune system! 🎉': 'Tu as déjoué le système immunitaire ! 🎉',
  'Neutralized… 🩸': 'Neutralisé·e… 🩸',
  'You reached open water! 🎉': 'Tu as atteint les eaux libres ! 🎉',
  'Filtered out… 💧': 'Filtré·e… 💧',
  'You outgrew the garden! 🎉': 'Tu as dépassé le jardin ! 🎉',
  'Swatted… 🍃': 'Balayé·e… 🍃',
  'You out-hunted the hunters! 🎉': 'Tu as chassé les chasseurs ! 🎉',
  'Caught… 🦴': 'Attrapé·e… 🦴',
  'You slipped the dragnet! 🎉': 'Tu as échappé au coup de filet ! 🎉',
  'Pest control wins… 🚚': 'La dératisation gagne… 🚚',
  'They couldn\'t bring you down! 🎉': 'Ils n\'ont pas pu t\'abattre ! 🎉',
  'Grounded… 💥': 'Cloué·e au sol… 💥',
  'You crossed the edge of the map! 🎉': 'Tu as franchi le bord de la carte ! 🎉',
  'Erased from the record… ✨': 'Effacé·e des registres… ✨',
  'THE ANTIBODY FAILED. 🎉': 'L\'ANTICORPS A ÉCHOUÉ. 🎉',
  'DELETED. ⬜': 'SUPPRIMÉ·E. ⬜',
  // v6.2 Remaster — watcher unlock lines
  'The Pond — word of you travels downstream': 'La Mare — la rumeur descend le courant',
  'The Garden — something marked your trail': 'Le Jardin — quelque chose a marqué ta piste',
  'The Undergrowth — the hunters were told to expect you': 'Les Sous-Bois — les chasseurs ont été prévenus',
  'The City — a report has been filed': 'La Ville — un signalement a été déposé',
  'The Skies — this time they\'re not hiding it': 'Les Cieux — cette fois ils ne s\'en cachent plus',
  'The Beyond — you were never the only anomaly': 'L\'Au-delà — tu n\'as jamais été la seule anomalie',
  'Toxic Shock': 'Choc Toxique',
  'Elite acid pools burn far hotter. Richer coins.': 'Les flaques d\'acide des élites brûlent bien plus fort. Pièces plus riches.',
  'Spike Protein': 'Protéine Spike',
  'Flings barbed antigens at the nearest cell.': 'Projette des antigènes barbelés sur la cellule la plus proche.',
  'Phage Ring': 'Anneau de Phages',
  'Tamed phages circle you, shredding whatever they touch.': 'Des macrophages attaquent les ennemis proches.',
  'Cytokine Burst': 'Salve de Cytokines',
  'A pressure wave of alarm signals shoves the swarm back.': 'Une onde de signaux d\'alarme repousse l\'essaim.',
  'Boomerang Leaf': 'Feuille Boomerang',
  'Flings a spinning leaf that slices out and curves back.': 'Lance une feuille tournoyante qui tranche puis revient en courbe.',
  'Toxin Cysts': 'Kystes Toxiques',
  'Buds toxic cysts that burst on contact.': 'Fait pousser des kystes toxiques qui éclatent au contact.',
  'Seeker Cell': 'Cellule Traqueuse',
  'A defected white cell that hunts your hunters.': 'Un globule blanc rallié qui chasse tes chasseurs.',
  'Mini Black Hole': 'Mini Trou Noir',
  'Opens a vortex that swallows the swarm.': 'Ouvre un vortex qui engloutit l\'essaim.',
  'Neon Beam': 'Rayon Néon',
  'A searing crimson ray sweeps everything it touches.': 'Un rayon écarlate brûlant balaie tout ce qu\'il touche.',
  'Flagella Whip': 'Fouet de Flagelle',
  'Lashes a melee arc toward the nearest enemy.': 'Fouette un arc au corps à corps vers l\'ennemi le plus proche.',
  'Toxin Bloom': 'Éclosion Toxique',
  'Plants a spreading toxin cloud that ticks damage.': 'Plante un nuage toxique qui s\'étend et inflige des dégâts continus.',
  'Stinger': 'Dard',
  'Fires a tight cone of piercing needles at the nearest enemy.': 'Tire un cône serré d\'aiguilles perforantes sur l\'ennemi le plus proche.',
  'Pheromone Lure': 'Leurre à Phéromones',
  'Plants a decoy that taunts nearby foes, then bursts.': 'Plante un leurre qui provoque les ennemis proches, puis explose.',
  'Claw Rake': 'Griffure',
  'Rake a fast arc at the nearest foe.': 'Lacère un arc rapide vers l\'ennemi le plus proche.',
  'Quill Burst': 'Salve de Piquants',
  'Bristles a ring of quills outward in every direction.': 'Hérisse un anneau de piquants dans toutes les directions.',
  'Chitter Shriek': 'Cri Strident',
  'A shrill scream that hurts, shoves, and panics the swarm.': 'Un cri perçant qui blesse, repousse et sème la panique dans l\'essaim.',
  'Trash Tornado': 'Tornade de Détritus',
  'Whips up street trash into funnels that hunt down what comes near.': 'Soulève les détritus de la rue en tornades qui traquent tout ce qui approche.',
  'Burst Hydrant': 'Bouche d\'Incendie Éclatée',
  'Shears a hydrant open; it hoses down whatever comes near.': 'Arrache une bouche d\'incendie ; elle arrose tout ce qui approche.',
  'Roar': 'Rugissement',
  'A sonic cone that flattens everything in front of you.': 'Un cône sonique qui aplatit tout ce qui se trouve devant toi.',
  'Tail Swipe': 'Coup de Queue',
  'A heavy sweep that clears the ground around you.': 'Un lourd balayage qui dégage le terrain autour de toi.',
  'Debris Toss': 'Jet de Débris',
  'Hurls a chunk of the skyline that bursts where it lands.': 'Projette un morceau de gratte-ciel qui explose à l\'impact.',
  'Reality Shard': 'Éclat de Réalité',
  'Splinters of elsewhere that skip through space as they fly.': 'Des éclats d\'ailleurs qui ricochent à travers l\'espace en volant.',
  'Pulsar Sweep': 'Rayon Pulsar',
  'Two lasers sweep back and forth across the way ahead.': 'Deux lasers balaient la voie devant toi.',
  'Membrane Piercer': 'Perce-Membrane',
  'antigen pierce': 'perforation d\'antigène',
  'Split Strain': 'Souche Divisée',
  'antigens per volley': 'antigènes par salve',
  'Mitosis': 'Mitose',
  'shard(s) on an antigen\'s first hit': 'éclat(s) au premier impact d\'un antigène',
  'Signal Cascade': 'Propagation',
  'jump(s) to the next enemy': 'saut(s) vers l\'ennemi suivant',
  'Extra Phages': 'Phages Bonus',
  'phages circling you': 'phages qui t\'entourent',
  'Engorged Phages': 'Phages Gorgés',
  'phage hit radius': 'rayon d\'impact des phages',
  'Wide Orbit': 'Orbite Large',
  'how far out they circle': 'périmètre de protection',
  'Fever Spin': 'Rotation Fiévreuse',
  'orbit rotation speed': 'vitesse de rotation de l\'orbite',
  'Double Membrane': 'Double Membrane',
  'a second row of phages around you': 'une seconde rangée de phages autour de toi',
  'Lysis Burst': 'Éclat de Lyse',
  'phage-kill splash damage': 'dégâts de zone quand un phage tue',
  'Systemic Surge': 'Poussée Systémique',
  'burst radius': 'rayon de l\'éruption',
  'Fever Shove': 'Poussée Fébrile',
  'burst knockback': 'recul de l\'éruption',
  'Inflammation': 'Inflammation',
  'wave damage': 'dégâts de la vague',
  'Immune Echo': 'Écho Immunitaire',
  'echo wave(s) per cast': 'vague(s) en écho par lancer',
  'Chemotaxis': 'Chimiotaxie',
  'bursts reel in gems and coins (wider per stack)': 'les éruptions ramènent gemmes et pièces (portée accrue par cumul)',
  'Cytokine Storm': 'Tempête de Cytokines',
  'radius/damage on every 3rd (monster) wave': 'rayon/dégâts toutes les 3 vagues (monstres)',
  'Extra Leaves': 'Feuilles Bonus',
  'leaf(s) per throw': 'feuille(s) par lancer',
  'Long Throw': 'Lancer Long',
  'leaf range': 'portée de la feuille',
  'Big Leaf': 'Grande Feuille',
  'leaf hit radius': 'rayon d\'impact de la feuille',
  'Heavy Leaf': 'Feuille Lourde',
  'leaf damage': 'augmente les dégâts',
  'Backhand': 'Revers',
  'leaf return-swing damage': 'dégâts au retour',
  'Minefield': 'Champ de Mines',
  'max cysts alive': 'nombre max de kystes actifs',
  'Big Boom': 'Grand Boum',
  'cyst blast radius': 'rayon d\'explosion des kystes',
  'Heavy Charge': 'Charge Lourde',
  'cyst damage': 'dégâts des kystes',
  'Cluster Bombs': 'Bombes à Fragmentation',
  'bomblet(s) when a cyst pops': 'sous-munition(s) à l\'explosion d\'un kyste',
  'Magnetic Cysts': 'Kystes Magnétiques',
  'armed-cyst crawl speed toward foes': 'vitesse de rampement des kystes armés vers les ennemis',
  'Chain Reaction': 'Réaction en Chaîne',
  'nearby armed cyst(s) detonated by a blast': 'kyste(s) armé(s) voisin(s) détoné(s) par une explosion',
  'Clone Culture': 'Culture de Clones',
  'seekers per volley': 'traqueurs par salve',
  'Telomere Boost': 'Boost de Télomères',
  'seeker lifetime': 'durée de vie des traqueurs',
  'Flagellar Motor': 'Moteur Flagellaire',
  'seeker turn rate': 'rapidité de volte-face',
  'Phase Membrane': 'Membrane Fantôme',
  'pierce per seeker': 'perforation par traqueur',
  'Apoptosis Pop': 'Pop d\'Apoptose',
  'seeker death-pop splash damage': 'dégâts de zone à la mort d\'un traqueur',
  'Rapid Division': 'Division Rapide',
  'mini seeker(s) spawned on a seeker kill': 'mini-traqueur(s) créés quand un traqueur tue',
  'Bigger Hole': 'Trou Plus Grand',
  'vortex radius': 'rayon du vortex',
  'Lasting Vortex': 'Vortex Durable',
  'vortex duration': 'durée du vortex',
  'Denser Pull': 'Attraction Intense',
  'vortex pull': 'force d\'attraction du vortex',
  'Singularity': 'Singularité',
  'extra vortex(es) per cast': 'vortex bonus par lancer',
  'Hungry Hole': 'Trou Vorace',
  'vortex growth rate while alive': 'vitesse de croissance du vortex tant qu\'il est actif',
  'Big Crunch': 'Grand Effondrement',
  'vortex collapse detonation damage': 'dégâts de détonation à l\'effondrement du vortex',
  'Big Beam': 'Grand Rayon',
  'beam width & length': 'largeur et longueur du rayon',
  'Beam Prism': 'Prisme',
  'sub-beams where the beam lands': 'sous-rayons là où le rayon frappe',
  'sub-beams where the beam lands, each splitting again': 'sous-rayons là où le rayon frappe, se divisant à leur tour',
  'Sustain': 'Endurance',
  'beam duration': 'durée du rayon',
  'Prismatic Split': 'Division Prismatique',
  'extra beam(s) per cast': 'rayon(s) bonus par lancer',
  'Focus Lens': 'Lentille Focale',
  'beam damage ramp by the end of its duration': 'montée en dégâts du rayon en fin de durée',
  'Strobe Ray': 'Rayon Stroboscopique',
  'beam tick rate': 'fréquence des dégâts du rayon',
  'Long Reach': 'Longue Portée',
  'whip range': 'portée du fouet',
  'Wide Arc': 'Arc Large',
  'whip sweep width': 'largeur du fouet',
  'Frenzy': 'Frénésie',
  'whip speed': 'vitesse du fouet',
  'Heavy Lash': 'Lanière Lourde',
  'whip damage': 'dégâts du fouet',
  'Cyclone': 'Cyclone',
  'full 360° sweep (every 3rd swing)': 'balayage à 360° complet (tous les 3 coups)',
  'Barbed Lash': 'Lanière Barbelée',
  'inflicts bleeding for 3s on enemies hit': 'inflige saignement pendant 3s aux ennemis touchés',
  'Big Bloom': 'Grande Éclosion',
  'cloud radius': 'rayon du nuage',
  'Lingering Spores': 'Spores Persistantes',
  'cloud duration': 'durée du nuage',
  'Virulent': 'Virulent',
  'cloud tick damage': 'dégâts continus du nuage',
  'Quick Cast': 'Lancer Rapide',
  'cast rate': 'cadence de lancer',
  'Twin Bloom': 'Double Éclosion',
  'extra cloud(s) per cast': 'nuage(s) bonus par lancer',
  'Sporeburst': 'Explosion de Spores',
  'mini-cloud when a foe dies inside': 'mini-nuage à la mort d\'un ennemi à l\'intérieur',
  'Tide-Carried': 'Porté par le Courant',
  'clouds ride the current, ticking harder': 'les nuages suivent le courant, dégâts continus accrus',
  'Sharper Tips': 'Pointes Affûtées',
  'needle damage': 'dégâts des aiguilles',
  'Wider Volley': 'Volée Élargie',
  'needles per volley': 'aiguilles par volée',
  'Long Needles': 'Longues Aiguilles',
  'needle range & speed': 'portée et vitesse des aiguilles',
  'Rapid Fire': 'Tir Rapide',
  'volley rate': 'cadence de volée',
  'Barbed Needles': 'Aiguilles Barbelées',
  'needle pierce': 'perforation des aiguilles',
  'Venom Tips': 'Pointes Venimeuses',
  'needles inject 1 venom stack': 'les aiguilles injectent 1 charge de venin',
  'Hive Mind': 'Esprit Ruche',
  'every 4th volley fires all around': '1 volée sur 4 tire tout autour',
  'Wider Taunt': 'Provocation Élargie',
  'lure aggro radius': 'rayon d\'aggro du leurre',
  'Big Burst': 'Grande Explosion',
  'burst damage & radius': 'dégâts et rayon de l\'explosion',
  'Lasting Lure': 'Leurre Durable',
  'lure duration': 'durée du leurre',
  'Quick Bait': 'Appât Rapide',
  'plant rate': 'cadence de pose',
  'Twin Lure': 'Double Leurre',
  'extra decoy(s) per cast': 'leurre(s) bonus par lancer',
  'Sticky Scent': 'Odeur Collante',
  'burst leaves a slow zone': 'l\'explosion laisse une zone qui ralentit',
  'Rending Claws': 'Griffes Déchirantes',
  'claw damage': 'dégâts des griffes',
  'Wide Rake': 'Griffure Large',
  'claw sweep width': 'largeur des griffes',
  'Long Claws': 'Longues Griffes',
  'claw reach': 'portée des griffes',
  'Quick Paws': 'Pattes Rapides',
  'rake rate': 'cadence de griffure',
  'Double Slash': 'Double Entaille',
  'every 3rd rake slashes twice': '1 griffure sur 3 tranche deux fois',
  'Bleeding Claws': 'Griffes Sanglantes',
  'inflicts bleeding for 3s on raked foes': 'applique saignement pendant 3s',
  'Ambush Predator': 'Prédateur Embusqué',
  'claws hit harder near a trap': 'les griffes frappent plus fort près d\'un piège',
  'Sharp Quills': 'Piquants Acérés',
  'quill damage': 'dégâts des piquants',
  'Bristling': 'Hérissement',
  'quills per burst': 'piquants par salve',
  'Rebound Quills': 'Piquants Boomerang',
  'return pass(es) per quill': 'passage(s) de retour par piquant',
  'Twitchy Spine': 'Échine Nerveuse',
  'burst rate': 'cadence de salve',
  'Retaliation': 'Riposte',
  'getting hit fires a free burst': 'être touché déclenche une salve gratuite',
  'Terror': 'Terreur',
  'fear duration': 'durée de la peur',
  'Shockwave': 'Onde de Choc',
  'shriek radius': 'rayon du cri',
  'Shrill': 'Strident',
  'shriek damage': 'dégâts du cri',
  'Chatterbox': 'Moulin à Paroles',
  'shriek rate': 'cadence du cri',
  'Echo Shriek': 'Cri en Écho',
  'echo shriek(s) per cast': 'cri(s) en écho par lancer',
  'Panic Rout': 'Déroute Panique',
  'damage taken by fleeing foes': 'dégâts subis par les ennemis en fuite',
  'Chitter Spines': 'Cri Épineux',
  'quill(s) spat outward per shriek': 'piquant(s) craché(s) à chaque cri',
  'Heavy Trash': 'Détritus Lourds',
  'funnel damage': 'dégâts des tornades',
  // v6.8 replaced the two orbit cards ('Tornade Large' / 'Rotation Rapide') one for one — the
  // orbit is only what the funnels do while there is nothing to hunt, so tuning it stopped being
  // worth a level-up. 'Traque' is the verb the weapon's own description now uses.
  'Wide Hunt': 'Traque Élargie',
  'hunting radius': 'rayon de traque',
  'Fast Winds': 'Vents Rapides',
  'travel speed': 'vitesse de déplacement',
  'More Tornadoes': 'Plus de Tornades',
  'tornadoes': 'tornades',
  'Fling Debris': 'Projection de Débris',
  'chunk(s) hurled outward periodically': 'morceau(x) projeté(s) vers l\'extérieur périodiquement',
  // v6.9: the tornado stopped pulling ENEMIES and started sweeping LOOT, so 'Aspiration' /
  // 'attraction ... sur les ennemis proches' went with the mechanic. 'Balayeuse' is the actual
  // French word for a street-sweeping vehicle, which is exactly what the card depicts, and the
  // effect line reuses this dictionary's established phrasing for the same job on wave.undertow
  // ('les éruptions ramènent gemmes et pièces') so two cards doing one thing read as one thing.
  'Street Sweeper': 'Balayeuse de Rue',
  'funnels reel in gems and coins': 'les tornades ramènent gemmes et pièces',
  'High Pressure': 'Haute Pression',
  'stream damage': 'dégâts du jet',
  'Long Hose': 'Tuyau Long',
  'hydrant reach': 'portée de la bouche d\'incendie',
  'Burst Main': 'Conduite Éclatée',
  'Split Nozzle': 'Lance Multiple',
  'foes hosed at once': 'ennemis arrosés à la fois',
  'Deep Main': 'Conduite Profonde',
  'how long a hydrant runs': 'durée de la bouche d\'incendie',
  'Cap Blast': 'Bouchon Éjecté',
  'the blown cap flings and stuns what it catches': 'le bouchon éjecté projette et étourdit ce qu\'il atteint',
  'Traffic Main': 'Conduite Principale',
  'hydrants in a live lane hit far harder — and seek the street': 'les bouches d\'incendie dans une voie active frappent bien plus fort — et cherchent la rue',
  'Bellow': 'Beuglement',
  'roar damage': 'dégâts du rugissement',
  'Wide Roar': 'Rugissement Large',
  'roar cone width': 'largeur du rugissement',
  'Carrying Roar': 'Rugissement Porteur',
  'roar range': 'portée du rugissement',
  'Short Breath': 'Souffle Court',
  'roar rate': 'cadence du rugissement',
  'Stagger': 'Chancellement',
  'stun on roared foes': 'étourdissement des ennemis touchés par le rugissement',
  'Resonance': 'Résonance',
  'every 3rd roar goes all around': 'un rugissement sur 3 part dans toutes les directions',
  'Heavy Tail': 'Queue Lourde',
  'swipe damage': 'dégâts du coup de queue',
  'Long Tail': 'Longue Queue',
  'swipe reach': 'portée du coup de queue',
  'Broad Sweep': 'Large Balayage',
  'tail sweep width': 'largeur du coup de queue',
  'Quick Tail': 'Queue Rapide',
  'swipe rate': 'cadence du coup de queue',
  'Wrecking Tail': 'Queue Dévastatrice',
  'collateral damage where launched foes land': 'dégâts collatéraux là où atterrissent les ennemis projetés',
  'Counter Swipe': 'Contre-Coup',
  'getting hit triggers a free swipe': 'être touché déclenche un coup de queue gratuit',
  'Heavy Debris': 'Débris Lourds',
  'impact damage': 'dégâts d\'impact',
  'Big Impact': 'Grand Impact',
  'impact radius': 'rayon d\'explosion',
  'Long Toss': 'Long Lancer',
  'throw range': 'portée du lancer',
  'Quick Hands': 'Mains Rapides',
  'throw rate': 'cadence de lancer',
  'Both Hands': 'À Deux Mains',
  'chunks per throw': 'morceaux par lancer',
  'Shrapnel': 'Shrapnel',
  'splinter(s) scattered by each impact': 'éclat(s) dispersé(s) à chaque impact',
  'Keen Shards': 'Éclats Acérés',
  'shard damage': 'dégâts des éclats',
  'Splintering': 'Éclatement',
  'shards per volley': 'éclats par volée',
  'Phase Edge': 'Tranchant Phasé',
  'shard pierce': 'perforation des éclats',
  'Quick Draw': 'Dégainage Rapide',
  'Rift Scar': 'Cicatrice de Faille',
  'each blink leaves a detonating rift': 'chaque saut laisse une faille qui détone',
  'Recursion': 'Récursion',
  'shard(s) forked when one expires': 'éclat(s) dédoublé(s) quand l\'un expire',
  'Wide Sweep': 'Balayage Large',
  'Held Sweep': 'Balayage Soutenu',
  'Quick Sweep': 'Balayage Rapide',
  'More Arms': 'Bras Supplémentaires',
  'extra arm(s) per cast': 'bras bonus par lancer',
  'Collapse': 'Effondrement',
  'damage when the sweep ends': 'dégâts à la fin du balayage',
  'Power Gel': 'Gel de Puissance',
  '+5% damage': '+5% dégâts',
  'Twitchy': 'Nerveux',
  '+4% fire rate': '+4% cadence',
  'Lucky Eye': 'Œil Chanceux',
  '+2% crit chance': '+2% chance crit.',
  'Mean Streak': 'Coup Vicieux',
  '+15% crit damage': '+15% dégâts crit.',
  'Big Mochi': 'Gros Mochi',
  '+15 max HP': '+15 PV max',
  'Slippery': 'Glissant',
  '+4% move speed': '+4% vitesse',
  'Magnetic Charm': 'Charme Magnétique',
  '+12% gem magnet': '+12% aimant',
  'Coin Nose': 'Flair à Pièces',
  '+10% coins found': '+10% pièces',
  'Fire Infusion': 'Infusion de Feu',
  'Ignites enemies for burn damage over time. Combo: shatters chilled foes, detonates with ⚡.': 'Enflamme les ennemis pour des dégâts de brûlure sur la durée. Combo : brise les ennemis gelés, détone avec ⚡.',
  'Cold Infusion': 'Infusion de Givre',
  'Chills and freezes enemies. Combo: shatters with 🔥, chilling arcs with ⚡.': 'Refroidit et gèle les ennemis. Combo : éclate avec 🔥, arcs glaçants avec ⚡.',
  'Lightning Infusion': 'Infusion de Foudre',
  'Shocks arc damage to nearby foes. Combo: detonates 🔥 ignites, spreads ❄️ chill, copies ☠️ venom.': 'Électrocute les ennemis proches par arcs de dégâts. Combo : détone les brûlures 🔥, propage le froid ❄️, copie le venin ☠️.',
  'Venom Infusion': 'Infusion de Venin',
  'Stacking poison that amplifies all damage taken. Combo: doubled amp on ❄️, faster burn with 🔥.': 'Un poison cumulatif qui amplifie tous les dégâts subis. Combo : amplification doublée sur ❄️, brûlure plus rapide avec 🔥.',
  'Overtime Shift': 'Heures Sup\'',
  'Way more anomalies, way more XP.': 'Beaucoup plus d\'anomalies, beaucoup plus d\'XP.',
  'Bulky Batch': 'Lot Costaud',
  'Tougher enemies, richer coin drops.': 'Ennemis plus coriaces, pièces plus généreuses.',
  'Caffeinated Swarm': 'Essaim Caféiné',
  'Faster enemies, faster leveling.': 'Ennemis plus rapides, montée de niveau plus rapide.',
  'Elite Convention': 'Convention d\'Élites',
  'Elites arrive twice as often, drop way more.': 'Les élites apparaissent deux fois plus souvent et lâchent bien plus de butin.',
  'Unstable Physics': 'Physique Instable',
  'Elemental infusions everywhere, weapons hit softer.': 'Des infusions élémentaires partout, mais les armes frappent moins fort.',
  'Glass Goo': 'Gelée de Verre',
  'You hit much harder but take much more.': 'Tu frappes bien plus fort, mais tu encaisses bien plus aussi.',
  'Sticky Floor': 'Sol Collant',
  'You move slower, but pickups fly to you.': 'Tu te déplaces plus lentement, mais le butin vole jusqu\'à toi.',
  'Jumbo Anomalies': 'Anomalies Jumbo',
  'Big squishy enemies, bonus XP and coins.': 'De gros ennemis tout mous, XP et pièces en bonus.',
  'Accelerated Response': 'Réponse Accélérée',
  'its telegraphs are 25% faster': 'ses attaques s\'annoncent 25% plus vite',
  'Immune Memory': 'Mémoire Immunitaire',
  'slain cells leave erasing residue': 'les cellules tuées laissent une trace qui t\'efface',
  'Cross-Reactivity': 'Réactivité Croisée',
  'each phase steals a second attack from another': 'chaque phase vole une seconde attaque à une autre',
  'Affinity Maturation': 'Maturation d\'Affinité',
  'every attack grows — more bombs, more nodes, a wider star': 'chaque attaque s\'amplifie — plus de bombes, plus de nœuds, une étoile plus large',
  'Riptide': 'Courant de Fond',
  'The currents shove twice as hard. Richer coins.': 'Les courants poussent deux fois plus fort. Pièces plus généreuses.',
  // 'Persistant', not 'Intense': the anomaly extends pheromone DURATION, and its own desc below
  // already says 'persistent deux fois plus longtemps' — the name now matches the effect.
  'Overscent': 'Effluve Persistant',
  'Pheromone trails linger twice as long. Bonus XP.': 'Les traces de phéromones persistent deux fois plus longtemps. XP en bonus.',
  'Trap Season': 'Saison des Pièges',
  'Half again more snap traps. Richer coins.': '50% de pièges à mâchoires en plus. Pièces plus généreuses.',
  'Rush Hour': 'Heure de Pointe',
  'Traffic barely lets up. Richer coins.': 'La circulation ne faiblit presque jamais. Pièces plus généreuses.',
  'Carpet Barrage': 'Tir de Barrage',
  'The bombardment barely pauses. Bonus XP.': 'Le bombardement ne s\'arrête presque jamais. XP en bonus.',
  'Supermassive': 'Supermassif',
  'The wells pull far harder — nothing flies straight. Richer coins.': 'Les puits gravitationnels attirent bien plus fort — plus rien ne vole droit. Pièces plus généreuses.',
  'Revive Token': 'Jeton de Résurrection',
  'Come back once at 50% HP': 'Reviens une fois à 50% PV',
  'Head Start': 'Longueur d\'Avance',
  'Start with 2 level-ups banked': 'Commence avec 2 montées de niveau en réserve',
  'Charged Core': 'Noyau Chargé',
  'Starting weapon begins at Lv 2': 'L\'arme de départ commence au Niv. 2',
  'The Body': 'Le Corps',
  'escape the host': 'échappe-toi de l\'hôte',
  'Red Blood Cell': 'Globule Rouge',
  'White Blood Cell': 'Globule Blanc',
  'Antibody': 'Anticorps',
  'The Pond': 'La Mare',
  'nothing floats forever': 'rien ne flotte pour toujours',
  'Amoeba': 'Amibe',
  'Tadpole': 'Têtard',
  'Tardigrade': 'Tardigrade',
  'The Garden': 'Le Jardin',
  'your scent gives you away': 'ton odeur te trahit',
  'Ant': 'Fourmi',
  'Wasp': 'Guêpe',
  'Spider': 'Araignée',
  'The Undergrowth': 'Les Sous-Bois',
  'the traps were already set': 'les pièges étaient déjà posés',
  'Toad': 'Crapaud',
  'Centipede': 'Mille-Pattes',
  'Rat': 'Rat',
  'The City': 'La Ville',
  'you\'ve been reported': 'tu as été signalé·e',
  'Robot Vacuum': 'Robot Aspirateur',
  'Rat-Catcher Drone': 'Drone Chasse-Rats',
  'Pigeon': 'Pigeon',
  'Patrol Drone': 'Drone de Patrouille',
  'Street Rat': 'Rat des Rues',
  'The Skies': 'Les Cieux',
  'they brought the air force': 'ils ont amené l\'armée de l\'air',
  'Fighter Jet': 'Avion de Chasse',
  'Helicopter': 'Hélicoptère',
  'Tank Column': 'Colonne de Chars',
  'The Beyond': 'L\'Au-delà',
  'you were never local': 'tu n\'as jamais été d\'ici',
  'Drifter': 'Vagabond',
  'Swarm Drone': 'Drone d\'Essaim',
  'Warden': 'Gardien',
  'Invader': 'Envahisseur',
  'Siege Hulk': 'Colosse de Siège',
  'The Blank': 'Le Blanc',
  'deletion in progress': 'suppression en cours',
  'Probe': 'Sonde',
  'Binder': 'Relieur',
  'Eraser': 'Gomme',
  'Binding Node': 'Nœud de Reliure',
  'The Antibody': 'L\'Anticorps',
  'Zoomies': 'Ruée Folle',
  'move speed': 'vitesse de déplacement',
  'Sticky Aura': 'Aura Collante',
  'gem magnet': 'aimant à gemmes',
  'Extra Squish': 'Extra Moelleux',
  'max HP (and heals as much)': 'PV max (et soigne d\'autant)',
  'Hyper Wiggle': 'Hyper Frétillement',
  'fire rate': 'cadence de tir',
  'Angry Goo': 'Gelée en Colère',
  'damage': 'dégâts',
  'Sharp Eye': 'Œil Perçant',
  'crit chance': 'chance de critique',
  'Bully': 'Brute',
  'crit damage': 'dégâts critiques',
  'Thick Jelly': 'Gelée Épaisse',
  'armor (flat damage block)': 'armure (blocage fixe de dégâts)',
  'Self-Goo': 'Auto-Gelée',
  'HP regen per second': 'régén. de PV par seconde',
  'Big Brain': 'Gros Cerveau',
  'XP gain': 'gain d\'XP',
}

export const FR = { ...UI, ...CONFIG }
