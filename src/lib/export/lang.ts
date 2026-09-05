/**
 * Scryfall language codes translated into each site's spelling. Scryfall uses
 * `zhs`/`zht` where most collection sites split Chinese by script name.
 */
const NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
  zhs: 'Simplified Chinese',
  zht: 'Traditional Chinese',
  he: 'Hebrew',
  la: 'Latin',
  grc: 'Ancient Greek',
  ar: 'Arabic',
  sa: 'Sanskrit',
  ph: 'Phyrexian',
}

const MANABOX: Record<string, string> = { zhs: 'zh_CN', zht: 'zh_TW' }

/** ManaBox spells languages as short codes: `en`, `de`, `zh_TW`. */
export function manaboxLang(code: string): string {
  return MANABOX[code] ?? code
}

/** Moxfield, Deckbox, and Dragon Shield spell languages in full: `English`. */
export function languageName(code: string): string {
  return NAMES[code] ?? code
}

/** Archidekt uses an uppercase two-letter code: `EN`. */
export function archidektLang(code: string): string {
  return (MANABOX[code] ?? code).toUpperCase()
}
