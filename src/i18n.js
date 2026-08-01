// Translation-at-display (v6.1.0). config.js stays the English ground truth everywhere in the
// codebase — sim.js, tests and save data never see a translated string. ui.js passes every
// player-visible string through t() at render time; a missing dictionary entry falls through to
// the English source, so coverage can grow (or a new string can ship untranslated) without ever
// breaking a screen. Dictionaries are keyed by the EXACT English source string (no key system —
// the English IS the key), one module per language.
import { FR } from './fr.js'

const DICTS = { fr: FR }
// [id, native label] — the title-screen toggle cycles through this list.
export const LANGS = [['en', 'English'], ['fr', 'Français']]

let lang = 'en'
export const setLang = (l) => { lang = (l === 'en' || DICTS[l]) ? l : 'en' }
export const getLang = () => lang
export const t = (s) => DICTS[lang]?.[s] ?? s
// Interpolated sentences: the dict key is the English TEMPLATE ('win level {n} to unlock {m}'),
// so word order is the translation's business, not the call site's.
export const tt = (s, params) => t(s).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`)
