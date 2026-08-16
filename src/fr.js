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
  // The Surf's build-sheet rows. 'Ricochets' rather than 'Rebonds' for Skips: a rebond is any
  // bounce, a ricochet is specifically a flat stone skipping off a surface — and the weapon is
  // already 'Coquille Ricochet', so the card and the sheet use one word for one thing. 'Croûte'
  // keeps the single-word column rule the block above sets out; the row carries a seconds value
  // beside it, so the noun alone reads as a duration without saying 'dure'.
  'Skips': 'Ricochets',
  'Crust lasts': 'Croûte',
  // The five rows that were still rendering in ENGLISH on the French build sheet — they were only
  // reachable by the coverage walk once STAT_KEYS became a config table, because that walk
  // enumerates tables and copy living in a bare const is exempt from it by construction.
  // Owner's wording, game-idiom over literal: 'harponnés' because the Tail Lash is a hook that
  // drags an aircraft down, not a fastener; 'Bonds' because the Atomic Breath's fork LEAPS to the
  // next target, and 'Fourches' would name the shape rather than the action. 'Durée' and 'Brûlure'
  // keep the single-word column rule the block above sets out — a noun beside a seconds value
  // reads as a duration without a verb, the same reasoning as 'Croûte'.
  'Aircraft hooked': 'Avions harponnés',
  'Forks': 'Bonds',
  // Never a build-sheet ROW (row: false in STAT_KEYS — it would push the cadence off the bottom),
  // so this one appears in the picked-mods list where the extra width costs nothing.
  'Fork range': 'Portée des bonds',
  'Runs for': 'Durée',
  'Line lasts': 'Ligne',
  'Glow lasts': 'Lueur',
  'Holds for': 'Maintien',
  'Burns for': 'Brûlure',
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
  // Book 2 (dev-gated). 'Voleur de Lumiere' keeps the owner's own framing - he described the
  // mechanic as STEALING light - rather than a neutral 'Recuperateur'. Same sentence shape as the
  // slot line above, so the two sacrifice targets read as siblings on one screen.
  'Light Thief': 'Voleur de Lumière',
  'Kills give back Light — sacrifice {cost} upgrade levels (no coin refund).':
    'Les éliminations rendent de la Lumière — sacrifie {cost} niveaux d\'amélioration (aucun remboursement).',
  // 'achat' (noun) not 'acheter' (verb): the chip sits at the end of a row whose label needs every
  // remaining px, and the verb is 4 characters longer for no added clarity on a buy button.
  'buy : 🪙 {n}': 'achat : 🪙 {n}',
  // Deliberately shorter than the English: the full phrase is 217px in a 202px pill on a 320px
  // phone. The modal this pill opens spells it out ("emplacement d'amélioration") in full.
  '{nth} upgrade slot': '{nth} emplacement',
  // The sacrifice view's target STRIP, narrower still than the shop pill above — two buttons
  // sharing 288px at 320px wide.
  '{nth} slot': '{nth} empl.',
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
  'add booster': 'ajouter un booster',
  'language': 'langue',
  'skill button': 'bouton d\'action',
  'Left': 'Gauche',
  'Right': 'Droite',
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
  'THE BLANK — the antibody that let you go wants you back': 'LE BLANC — l\'anticorps qui t\'a laissé filer veut que tu reviennes',
  'finish bonus': 'bonus de fin',
  // v7.5 SPECIALIST on the build sheet ("Spécialiste : Borne Incendie"). NBSP before the colon —
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
  // taken too: 'Faille' by tornSeam and 'Singularité' by hole. And no ADJECTIVE can join the
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
  //   Wildfire -> 'Traînée de Feu'. 'Incendie' collides with Borne Incendie (the city's
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
  'Every 30s a 10s chaos wave brings +50% enemies. Survive one and keep +10% damage — for the rest of the run, every time.':
    "Toutes les 30s, une vague de chaos de 10s amène +50% d'ennemis. Survis-en une et tu gardes +10% de dégâts — pour le reste de la partie, à chaque fois.",
  'you agreed to a rhythm you did not set': "tu as accepté un rythme que tu n'as pas choisi",
  'Deadfall': 'Chausse-Trappe',
  'Snap traps ignore you, and re-arm 5 times faster.': "Les pièges à mâchoires t'ignorent et se réarment 5 fois plus vite.",
  'the traps stopped caring about you': 'les pièges se sont désintéressés de toi',
  'Alignment': 'Alignement',
  'All your elements now have ×2 potency.': 'Tous les éléments ont maintenant une puissance doublée.',
  'two elements found the same beat': 'deux éléments ont trouvé le même tempo',
  'Time Debt': 'Dette Temporelle',
  'Everything arrives 50% sooner — enemies, elites, the ending. Gems pay +50% XP.': "Tout arrive 50% plus tôt — ennemis, élites, la fin. Les gemmes rapportent +50% d'XP.",
  'the clock started running against you': "l'horloge s'est mise à tourner contre toi",
  'Submission': 'Soumission',
  'Elites arrive three times as often — and the ones you kill turn instead of dying, fighting the swarm for 20s at 50% of your damage. Nothing you fire can touch them.':
    'Les élites arrivent trois fois plus souvent — et celles que tu tues changent de camp au lieu de mourir : elles combattent l\'essaim pendant 20s pour 50% de tes dégâts. Tes tirs ne peuvent pas les toucher.',
  'they only obey the strongest': "ils n'obéissent qu'au plus puissant",
  'Brittle': 'Fragile',
  'Your max HP becomes 1. Your damage is ×4.': 'Tes PV max tombent à 1. Tes dégâts passent à ×4.',
  'you traded every future hit for this one': 'tu as troqué tous les coups à venir contre celui-ci',
  'Overload': 'Surcharge',
  '×2 fire rate and ×2 damage, for 1 HP every second.': 'Cadence de tir ×2 et dégâts ×2, contre 1 PV par seconde.',
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
  'Copies of you peel off every 4s, pull the swarm away, and detonate.': "Des copies de toi se détachent toutes les 4s, attirent l'essaim au loin, puis explosent.",
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
  // in, as 'Spécialiste : Borne Incendie — <desc>', where an order to pick one arrives twenty
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
  'Burst Hydrant': 'Borne Incendie',
  'Shears a hydrant open; it hoses down whatever comes near.': 'Arrache une borne incendie ; elle arrose tout ce qui approche.',
  'Roar': 'Rugissement',
  'A sonic cone that flattens everything in front of you.': 'Un cône sonique qui aplatit tout ce qui se trouve devant toi.',
  'Tail Lash': 'Fouet Caudal',
  'Snaps out and drags an aircraft down to be crushed underfoot.': 'Se détend et précipite un aéronef au sol pour l\'écraser.',
  'Atomic Breath': 'Souffle Atomique',
  'A charged blast that forks from body to body like lightning.': 'Une décharge concentrée qui saute de corps en corps comme la foudre.',
  'Debris Toss': 'Jet de Débris',
  'Hurls a chunk of the skyline that bursts where it lands.': 'Projette un morceau de gratte-ciel qui explose à l\'impact.',
  'Reality Shard': 'Éclat de Réalité',
  'Splinters of elsewhere that skip through space as they fly.': 'Des éclats d\'ailleurs qui ricochent à travers l\'espace en volant.',
  'Pulsar Sweep': 'Rayon Pulsar',
  'Two lasers sweep back and forth across the way ahead.': 'Deux lasers balaient la voie devant toi.',
  // The Surf (Book 2 chapter 1) — three natives. 'Déferlante' over 'Rouleau' for Breaker: a rouleau
  // is the SHAPE of a wave, a déferlante is the wave arriving on you, and this card is about the
  // arrival. 'Balanes' is the zoological name for acorn barnacles and the word a French player has
  // actually read on a hull or a rock; 'Bernacles' is the goose barnacle, a different animal.
  // 'gerbe' for the shell's splash rather than 'éclaboussure': a gerbe is the spray thrown UP by an
  // impact, which is the thing being drawn, and it is one word instead of five syllables on a card.
  'Sunspear': 'Rai de Lumière',
  'Calls down a column of light on what is nearest. More columns as it grows.': 'Abat une colonne de lumière sur ce qui est le plus proche. Et davantage de colonnes en montant de niveau.',
  'Foxfire': 'Feu Follet',
  'A cold fire that barely shows in the light and takes hold in the dark.': 'Un feu froid qui se voit à peine dans la lumière et qui prend dans le noir.',
  'Sunlance': 'Lance Solaire',
  'Spears a shaft of hard light through the crowd. It reaches as far as your Light does.': 'Transperce la foule d\'un trait de lumière dure. Sa portée est celle de votre Lumière.',
  'Breaker': 'Déferlante',
  'A wave rolls out ahead of you, dragging what it catches along with it.': 'Une vague déferle devant vous et emporte tout ce qu\'elle attrape.',
  'Skipping Shell': 'Coquille Ricochet',
  'Skims a shell that skips off the sand, splashing at every touch.': 'Fait ricocher une coquille sur le sable : une gerbe à chaque rebond.',
  'Barnacles': 'Balanes',
  'Seeds larvae that crust onto what they hit — and jump to the next body when it dies.': 'Sème des larves qui s\'incrustent sur ce qu\'elles touchent — et sautent sur le corps suivant à sa mort.',
  // The Trawl (Book 2 chapter 4) — two natives, both named by the OWNER, and in both cases the
  // plainly-readable option over the exact fishing term. 'Palangre' and 'Épervier' are what a
  // French fisherman calls this gear and both were rejected: a weapon name has to land on a player
  // who does not fish. Do not "correct" these toward the domain vocabulary.
  //   'ferré' is kept, though — it is the fishing verb for setting a hook in a fish and it is also
  //   ordinary French, so it costs the reader nothing and says exactly what the hooks do.
  //   The Filet Lesté desc deliberately does NOT repeat 'filet lesté', which is now the card's own
  //   name: a card whose description restates its title wastes the only two lines it has.
  'Longline': 'Ligne à Hameçons',
  'Sets a baited line across their path. Everything that touches it is hooked and bleeds.': 'Pose une ligne appâtée en travers de leur route. Tout ce qui la touche est ferré et saigne.',
  'Net Toss': 'Filet Lesté',
  'Throws a weighted net over a pack and holds them where they stand.': 'Jeté sur un groupe entier, il le cloue sur place.',
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
  'hole radius': 'rayon du trou',
  'Lasting Hole': 'Trou Durable',
  'hole duration': 'durée du trou',
  'Denser Pull': 'Attraction Intense',
  'hole pull': 'force d\'attraction du trou',
  'Singularity': 'Singularité',
  'extra hole(s) per cast': 'trou(s) bonus par lancer',
  'Hungry Hole': 'Trou Vorace',
  'hole growth rate while alive': 'vitesse de croissance du trou tant qu\'il est actif',
  'Big Crunch': 'Grand Effondrement',
  'hole collapse detonation damage': 'dégâts de détonation à l\'effondrement du trou',
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
  'damage climbs by {n} the longer it fires': 'les dégâts augmentent de {n} pendant la durée du tir',
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
  'Hive Mind': 'Esprit Ruche',
  'Necrotic Tips': 'Pointes Nécrosantes',
  'needles leave a bleeding wound': 'les aiguilles laissent une plaie qui saigne',
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
  'Rebound Quills': 'Piquants Rebondissants',
  'quills make {n} round trip(s)': 'les piquants font {n} aller-retour(s)',
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
  '{n} echo(es) of the first shriek': '{n} écho(s) du cri initial',
  'Panic Rout': 'Déroute Panique',
  'damage taken by fleeing foes': 'dégâts subis par les ennemis en fuite',
  'Chitter Spines': 'Cri Épineux',
  'quill(s) spat outward per shriek': 'piquant(s) craché(s) à chaque cri',
  'Heavy Trash': 'Détritus Lourds',
  'tornado damage': 'dégâts des tornades',
  // v6.8 replaced the two orbit cards ('Tornade Large' / 'Rotation Rapide') one for one — the
  // orbit is only what the funnels do while there is nothing to hunt, so tuning it stopped being
  // worth a level-up. 'Traque' is the verb the weapon's own description now uses.
  'Wide Hunt': 'Traque Élargie',
  'attack radius': 'rayon d\'attaque',
  'Fast Winds': 'Vents Rapides',
  'travel speed': 'vitesse de déplacement',
  'More Tornadoes': 'Plus de Tornades',
  'tornadoes': 'tornades',
  // v6.9: the tornado stopped pulling ENEMIES and started sweeping LOOT, so 'Aspiration' /
  // 'attraction ... sur les ennemis proches' went with the mechanic. 'Balayeuse' is the actual
  // French word for a street-sweeping vehicle, which is exactly what the card depicts, and the
  // effect line reuses this dictionary's established phrasing for the same job on wave.undertow
  // ('les éruptions ramènent gemmes et pièces') so two cards doing one thing read as one thing.
  'Street Sweeper': 'Balayeuse de Rue',
  'tornadoes reel in gems and coins': 'les tornades ramènent gemmes et pièces',
  'High Pressure': 'Haute Pression',
  'stream damage': 'dégâts du jet',
  'Long Hose': 'Tuyau Long',
  'hydrant reach': 'portée de la borne',
  'Burst Main': 'Conduite Éclatée',
  'Split Nozzle': 'Lance Multiple',
  'foes hosed at once': 'ennemis arrosés à la fois',
  'Deep Main': 'Conduite Profonde',
  'how long a hydrant runs': 'durée de la borne',
  'Cap Blast': 'Bouchon Éjecté',
  'stuns nearby foes when the hydrant blows': 'étourdit les ennemis proches à l\'apparition de la borne',
  'Traffic Main': 'Conduite Principale',
  'hydrants in a live lane hit far harder — and seek the street': 'les bornes apparaissent dans les rues et font plus de dégâts',
  'Bellow': 'Beuglement',
  'roar damage': 'dégâts du rugissement',
  'Wide Roar': 'Rugissement Large',
  'roar cone width': 'largeur du rugissement',
  'Carrying Roar': 'Rugissement Porteur',
  'roar range': 'portée du rugissement',
  'Short Breath': 'Souffle Court',
  'roar rate': 'cadence du rugissement',
  'Stagger': 'Chancellement',
  'stuns roared foes for {n}s': 'étourdit les ennemis touchés pendant {n} s',
  'Resonance': 'Résonance',
  'every 3rd roar goes all around': 'un rugissement sur 3 part dans toutes les directions',
  'Heavy Tail': 'Queue Lourde',
  'lash damage': 'dégâts du fouet',
  'Long Tail': 'Longue Queue',
  'lash reach': 'portée du fouet',
  'Quick Tail': 'Queue Rapide',
  'lash rate': 'cadence du fouet',
  'Double Hook': 'Double Harpon',
  'aircraft dragged down per lash': 'aéronef(s) précipité(s) au sol par coup de fouet',
  'Wrecking Ball': 'Boule de Démolition',
  'damage dealt by a dragged aircraft': 'dégâts infligés par un aéronef traîné au sol',
  'Counter Lash': 'Contre-Fouet',
  'getting hit triggers a free lash': 'subir des dégâts déclenche un coup de fouet',
  'Overcharge': 'Surcharge',
  'breath damage': 'dégâts du souffle',
  'Forked Breath': 'Souffle Ramifié',
  'extra fork(s) per breath': 'ramification(s) supplémentaire(s) par souffle',
  'Arc Reach': 'Portée d\'Arc',
  'fork distance': 'distance de ramification',
  'Held Breath': 'Souffle Prolongé',
  'breath duration': 'durée du souffle',
  'Quick Breath': 'Souffle Rapide',
  'breath rate': 'cadence du souffle',
  'Fallout': 'Retombées',
  'sets everything the breath touches burning': 'enflamme tout ce que le souffle touche',
  'Heavy Debris': 'Débris Lourds',
  'impact damage': 'dégâts d\'impact',
  'Big Impact': 'Grand Impact',
  'impact radius': 'rayon d\'impact',
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
  // Owner call, 2026-08-12. 'Faille de Réalité' deliberately rhymes with the weapon's own
  // 'Éclat de Réalité' above, so the card reads as belonging to it. His spare, if another Beyond
  // mod ever needs a name in this register: 'Réalité Décousue' — which keeps the unstitched-seam
  // sense the English 'Torn Seam' carries and 'Faille' drops.
  'Torn Seam': 'Faille de Réalité',
  'the skipped gap tears open for {n} damage': "l'espace sauté se déchire pour {n} de dégâts",
  'Recursion': 'Récursion',
  'shard(s) forked when one burns out': 'éclat(s) dédoublé(s) en fin de course',
  'Wide Sweep': 'Balayage Large',
  'Held Sweep': 'Balayage Soutenu',
  'Quick Sweep': 'Balayage Rapide',
  'More Arms': 'Bras Supplémentaires',
  'extra arm(s) per cast': 'bras bonus par lancer',
  'Collapse': 'Effondrement',
  'damage when the sweep ends': 'dégâts à la fin du balayage',
  // The Surf's mods. 'Contre-Courant' for Backwash rather than 'Ressac': 'Le Ressac' is already
  // this chapter's own name, and a mod card sharing the chapter's title reads as a chapter
  // modifier rather than as a weapon upgrade.
  // 'Dérive Littorale' is the real name of the longshore current, which is what the mod is named
  // after in English — a player who knows the beach gets the joke in both languages.
  // 'Naissain' for Seedbed is the French shellfish-farming word for spat, the larvae you seed a bed
  // with. It is exactly the noun this mod is about and it costs nothing to use the right one.
  // 'wave damage' is NOT re-added here: Cytokine Burst already ships that exact English key, and
  // the dictionary is keyed by the English source string, so a second entry is a duplicate that
  // silently kills the first (run XX asserts this).
  'Swell': 'Houle',
  'Longshore': 'Dérive Littorale',
  'how far the wave rolls': 'jusqu\'où la vague déferle',
  'Broad Crest': 'Crête Large',
  'wave width': 'largeur de la vague',
  'Backwash': 'Contre-Courant',
  'a second wave rolls out behind you': 'une seconde vague déferle derrière vous',
  'Skimmer': 'Coquille Tranchante',
  'shell damage': 'dégâts de la coquille',
  'Flat Stone': 'Galet Plat',
  'extra skip(s) per throw': 'rebond(s) supplémentaire(s) par lancer',
  'Wide Splash': 'Grande Gerbe',
  'splash radius': 'rayon de la gerbe',
  'Fast Skim': 'Lancer Rapide',
  'High Noon': 'Plein Midi',
  'column damage': 'dégâts de la colonne',
  'Broad Beam': 'Faisceau Large',
  'column radius': 'rayon de la colonne',
  'Zenith': 'Zénith',
  'how far a column can be called': 'portée d\'appel d\'une colonne',
  'Second Sun': 'Second Soleil',
  'extra column(s) per cast': 'colonne(s) supplémentaire(s) par lancer',
  'Quick Kindle': 'Allumage Rapide',
  'Emberfeed': 'Attise-Braise',
  'foxfire damage per tick': 'dégâts du feu follet par tic',
  'Gloaming': 'Crépuscule',
  'foxfire radius': 'rayon du feu follet',
  'Long Burn': 'Combustion Longue',
  'how long a foxfire burns': 'durée de combustion du feu follet',
  'Whetted': 'Affûtée',
  'lance damage per tick': 'dégâts de la lance par tic',
  'Far Reach': 'Longue Portée',
  'lance length': 'longueur de la lance',
  'Broad Edge': 'Tranchant Large',
  'lance width': 'largeur de la lance',
  'Held Lance': 'Lance Maintenue',
  'how long the lance is held': 'durée de maintien de la lance',
  'Grinder': 'Râpe',
  'crust damage per tick': 'dégâts de la croûte par tic',
  'Encrust': 'Incrustation',
  'how long a crust lasts': 'durée de la croûte',
  'Spawnfall': 'Pluie de Larves',
  'extra larva(e) per cast': 'larve(s) supplémentaire(s) par lancer',
  'Seedbed': 'Naissain',
  'extra jump(s) when a crusted body dies': 'saut(s) supplémentaire(s) à la mort d\'un corps incrusté',
  // The Trawl's two natives. 'par tic' matches the Balanes rows just above — the same wording for
  // the same idea, so a player reading two grinder cards is not told it twice in two ways.
  'Barbed Hooks': 'Hameçons Barbelés',
  'hook damage per tick': 'dégâts des hameçons par tic',
  'Long Set': 'Longue Pose',
  'line length': 'longueur de la ligne',
  'Deep Set': 'Pose Profonde',
  'how long a set line lasts': 'durée de la ligne posée',
  'Twin Set': 'Double Pose',
  'extra line(s) per cast': 'ligne(s) supplémentaire(s) par lancer',
  'Wide Net': 'Grand Filet',
  'net radius': 'rayon du filet',
  'Heavy Mesh': 'Maille Lourde',
  // 'maintien' rather than 'immobilisation': it is the same word as the build sheet's own row label
  // for this stat, so the card and the sheet say one word for one thing (the rule the Coquille
  // Ricochet comment states), and it fits a narrow row where the longer noun does not.
  'how long the hold lasts': 'durée du maintien',
  'Weighted': 'Lesté',
  'Double Haul': 'Double Lancer',
  'extra net(s) per cast': 'filet(s) supplémentaire(s) par lancer',
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
  // BOOK_SHOP.undertow (Task 6, per-book progression) — Undertow's three own shop lines, merged
  // on top of the eight above by shopLines('undertow'). All three act on a chapter's resource bar.
  'Deep Lungs': 'Apnée',
  '+8% resource capacity': '+8% de capacité',
  'Slow Burn': 'Économe',
  "-4% resource drain": "-4% d'usure",
  'Big Gulp': 'Grande Lampée',
  '+10% refill per pickup': '+10% par ramassage',
  'Fire Infusion': 'Infusion de Feu',
  'Cold Infusion': 'Infusion de Givre',
  'Lightning Infusion': 'Infusion de Foudre',
  'Venom Infusion': 'Infusion de Venin',


  // ---- elements: the level-up cards and the Codex. The English is
  // a TEMPLATE with {placeholders}, not a finished sentence, so word order here is French's own
  // business — see elementCardDesc/elementCodex in config.js and tt() in i18n.js.
  // Deliberately terser than the English: these are reference pages, read mid-run. PV, not
  // "points de vie" — the abbreviation this file already standardises on everywhere else.

  "Every hit sets its target burning, for a share of that hit.":
    "Chaque coup enflamme sa cible, pour une part de ses dégâts.",
  "A new hit only replaces the burn if it would be stronger.":
    "Seule une brûlure plus forte remplace la précédente.",
  "Yours: {pct}% of the hit, over {secs}s.":
    "Actuellement : {pct}% du coup, sur {secs}s.",
  "Damage chills. Chill fills with the health you have just taken off an enemy; a full gauge freezes it.":
    "La jauge de givre se remplit avec les PV que tu viens de retirer. Pleine, elle gèle l'ennemi.",
  "A freeze holds for {freeze}s. Afterwards the enemy resists cold for {resist}s.":
    "Le gel dure {freeze}s, puis {resist}s de résistance au givre.",
  "Yours: take {pct}% of an enemy’s health within {secs}s to freeze it.":
    "Actuellement : {pct}% des PV en {secs}s pour geler.",
  "Damage weakens. A weakened enemy takes more damage from every source — your weapons, your burns, everything.":
    "Tes dégâts affaiblissent : la cible subit plus de dégâts de toutes sources, armes et brûlures comprises.",
  "Venom deals no damage of its own. It makes everything else hurt more.":
    "Le venin n'inflige aucun dégât : il amplifie celui de tout le reste.",
  "Yours: +{pct}% for an enemy at half health.":
    "Actuellement : +{pct}% pour un ennemi à mi-vie.",
  "Your hits arc to nearby enemies for a share of the damage, and can pass on the burning and bleeding the first one is suffering.":
    "Chaque coup part en arc vers les ennemis proches, pour une part des dégâts, et peut leur transmettre brûlure et saignement.",
  "The arc deals real damage, so it chills and weakens its targets like anything else does.":
    "L'arc inflige de vrais dégâts : il givre et affaiblit ses cibles comme tout le reste.",
  "More lightning means more arcs, longer arcs, harder arcs and a better chance to pass afflictions on.":
    "Plus de foudre : plus d'arcs, plus longs, plus forts, et plus de propagation.",
  "Yours: {arcs} arcs, {dmg}% damage, {spread}% to pass afflictions on.":
    "Actuellement : {arcs} arcs, {dmg}% de dégâts, {spread}% de propagation.",
  "Elements read one number: how much of an enemy’s own health you have taken off in the last three seconds.":
    "Les éléments ne lisent qu'un chiffre : la part de ses propres PV que tu as retirée à un ennemi ces 3 dernières secondes.",
  "That is why a hit which devastates a drone barely troubles a tank — the same damage is a smaller share of a bigger health bar. Nothing is immune for being big; big things simply need more.":
    "Un coup qui pulvérise un petit ennemi entame à peine un gros : mêmes dégâts, part plus faible de ses PV. Rien n'est immunisé par sa taille.",
  "It is also why elements grow with your weapons. As your damage climbs, so does everything they do.":
    "Les éléments montent donc avec tes armes : plus de dégâts, plus d'effet.",
  "Back":
    "Retour",

  // The cards carry ONLY the figure that decides the pick; the Codex has the rest.
  "Burns for {pct}% of the hit.":
    "Enflamme l'ennemi pour {pct}% des dégâts du coup.",
  "Take {pct}% of an enemy’s health to freeze it. Less than that slows it.":
    "Retire {pct}% des PV d'un ennemi pour le geler. Moins que ça le ralentit.",
  "Wounded enemies take more damage: +{pct}% at half health.":
    "Les ennemis blessés prennent plus de dégâts : +{pct}% à mi-vie.",
  "Arcs transfer {dmg}% of the damage and its afflictions to {arcs} nearby enemies.":
    "Des éclairs transmettent {dmg}% des dégâts et les afflictions à {arcs} ennemis proches.",

  // ---- elite affixes (ELITE_AFFIXES). Shown on the elite itself; "Ancré" is the one the
  // element Codex names, since anchored elites are the only ones cold can never freeze.
  'Shielded': 'Blindé',
  'Splitter': 'Diviseur',
  'Volatile': 'Instable',
  'Cheerleader': 'Meneuse',
  'Anchored': 'Ancré',
  'Frenzied': 'Enragé',
  'Gilded': 'Doré',

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
  // Book names (BOOKS[].name) — on the shelf's brass plate, and (per-book progression) on the
  // shop's balance header beside the coin count, which is where a player learns whose purse they
  // are spending.
  'The Anomaly': 'L\'Anomalie',
  'Undertow': 'Lame de Fond',
  // Spine names (CHAPTER_SPINE, config.js) — the chapter name with its article dropped, because a
  // spine sets its title vertically and has about 110px of height for it.
  'Body': 'Corps',
  'Pond': 'Mare',
  'Garden': 'Jardin',
  'Undergrowth': 'Sous-Bois',
  'City': 'Ville',
  'Skies': 'Cieux',
  'Beyond': 'Au-delà',
  'Blank': 'Blanc',
  'Surf': 'Snorkeling',
  'Shelf': 'Large',
  'Reef': 'Récif',
  'Trawl': 'Chalut',
  'Book {n}': 'Livre {n}',
  'locked chapter': 'chapitre verrouillé',
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
  // The Shelf (Book 2). 'Krill' is the French word too. 'Méduse Lune' over the real common
  // name 'Aurélie', which is correct but reads as a first name rather than an animal.
  // The Surf (Book 2 chapter 1).
  'The Surf': 'Snorkeling',
  'The Shelf': 'Le Large',
  'The Reef': 'Le Récif',
  'the tide decides': 'la marée décide',
  'the light only goes down': 'la lumière ne fait que diminuer',
  'the current only runs one way': 'le courant décide pour toi',
  // The Trawl (Book 2 chapter 4). 'Le Chalut' is the net itself — 'chalutage' is the activity and
  // 'drague' is a different gear (and slang for chatting someone up).
  // THE TAGLINE IS THE OWNER'S OWN LINE, not a translation of the English, and deliberately so:
  // the English says the net is indifferent to you, and this says the humans will catch every one
  // of you. Same chapter, aimed from the other end. If the English is ever brought into line with
  // it, remember the English string IS the key — changing it orphans this entry.
  'The Trawl': 'Le Chalut',
  'the net is not aiming at you': 'Ils vous pêcheront tous',
  'Sand Hopper': 'Puce de mer',
  'Shore Crab': 'Crabe vert',
  'Sea Roach': 'Cloporte de mer',
  'Copepod': 'Copépode',
  'Krill': 'Krill',
  'Moon Jelly': 'Méduse Lune',
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
