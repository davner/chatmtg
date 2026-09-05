import type { Condition, Finish } from '../types.ts'
import { csvDocument } from './csv.ts'
import { archidektLang, languageName } from './lang.ts'
import type { ExportFormat } from './types.ts'

/**
 * Every site below spells the same two concepts differently, so each keeps its
 * own vocabulary rather than sharing one with flags. Values come from real
 * exports; where a site's sample never showed a grade, the nearest documented
 * spelling is used and the format's note says so.
 */

const HEADER_NOTE = 'Header taken from a real export. Not round-tripped through an import.'

// Moxfield leaves non-foil blank rather than naming it.
const MOXFIELD_FOIL: Record<Finish, string> = { nonfoil: '', foil: 'foil', etched: 'etched' }
const MOXFIELD_CONDITION: Record<Condition, string> = {
  mint: 'Mint',
  near_mint: 'Near Mint',
  excellent: 'Near Mint',
  good: 'Good (Lightly Played)',
  light_played: 'Good (Lightly Played)',
  played: 'Played',
  poor: 'Damaged',
}

export const moxfield: ExportFormat = {
  id: 'moxfield',
  label: 'Moxfield',
  kind: 'csv',
  ext: 'csv',
  confidence: 'header-verified',
  note: `${HEADER_NOTE} Moxfield grades collapse seven conditions into five.`,
  render(rows) {
    return csvDocument(
      ['Count', 'Tradelist Count', 'Name', 'Edition', 'Condition', 'Language', 'Foil', 'Tags', 'Last Modified', 'Collector Number', 'Alter', 'Proxy', 'Purchase Price'],
      rows.map((r) => [
        r.qty,
        '',
        r.name,
        r.setCode.toLowerCase(),
        MOXFIELD_CONDITION[r.condition],
        languageName(r.lang),
        MOXFIELD_FOIL[r.finish],
        '',
        '',
        r.cn,
        'False',
        'False',
        '',
      ]),
    )
  },
}

const ARCHIDEKT_FINISH: Record<Finish, string> = {
  nonfoil: 'Normal',
  foil: 'Foil',
  etched: 'Etched',
}
const ARCHIDEKT_CONDITION: Record<Condition, string> = {
  mint: 'M',
  near_mint: 'NM',
  excellent: 'LP',
  good: 'LP',
  light_played: 'MP',
  played: 'HP',
  poor: 'D',
}

export const archidekt: ExportFormat = {
  id: 'archidekt',
  label: 'Archidekt',
  kind: 'csv',
  ext: 'csv',
  confidence: 'header-verified',
  note: `${HEADER_NOTE} Archidekt abbreviates grades.`,
  render(rows) {
    return csvDocument(
      ['Quantity', 'Name', 'Finish', 'Condition', 'Date Added', 'Language', 'Purchase Price', 'Tags', 'Edition Name', 'Edition Code', 'Multiverse Id', 'Scryfall ID', 'Collector Number'],
      rows.map((r) => [
        r.qty,
        r.name,
        ARCHIDEKT_FINISH[r.finish],
        ARCHIDEKT_CONDITION[r.condition],
        '',
        archidektLang(r.lang),
        '',
        '',
        r.setName,
        r.setCode.toUpperCase(),
        '',
        r.scryfallId,
        r.cn,
      ]),
    )
  },
}

const TITLE_CONDITION: Record<Condition, string> = {
  mint: 'Mint',
  near_mint: 'Near Mint',
  excellent: 'Good',
  good: 'Good',
  light_played: 'Played',
  played: 'Played',
  poor: 'Poor',
}

export const deckbox: ExportFormat = {
  id: 'deckbox',
  label: 'Deckbox',
  kind: 'csv',
  ext: 'csv',
  confidence: 'header-verified',
  note: `${HEADER_NOTE} Deckbox marks foils by presence, leaving non-foil blank.`,
  render(rows) {
    return csvDocument(
      ['Count', 'Tradelist Count', 'Name', 'Edition', 'Edition Code', 'Card Number', 'Condition', 'Language', 'Foil', 'Signed', 'Artist Proof', 'Altered Art', 'Misprint', 'Promo', 'Textless', 'Printing Id', 'Printing Note', 'Tags', 'My Price', 'Cost', 'Rarity', 'Price', 'TcgPlayer ID', 'Scryfall ID'],
      rows.map((r) => [
        r.qty,
        '',
        r.name,
        r.setName,
        r.setCode.toUpperCase(),
        r.cn,
        TITLE_CONDITION[r.condition],
        languageName(r.lang),
        r.finish === 'nonfoil' ? '' : 'foil',
        '', '', '', '', '', '', '', '', '', '', '', r.rarity, '', '',
        r.scryfallId,
      ]),
    )
  },
}

// Dragon Shield writes grades without the space: NearMint, LightlyPlayed.
const DRAGONSHIELD_CONDITION: Record<Condition, string> = {
  mint: 'Mint',
  near_mint: 'NearMint',
  excellent: 'Excellent',
  good: 'Good',
  light_played: 'LightPlayed',
  played: 'Played',
  poor: 'Poor',
}

export const dragonshield: ExportFormat = {
  id: 'dragonshield',
  label: 'Dragon Shield',
  kind: 'csv',
  ext: 'csv',
  confidence: 'header-verified',
  note: `${HEADER_NOTE} Dragon Shield has no etched finish, so etched cards export as Foil.`,
  render(rows, ctx) {
    return csvDocument(
      ['Folder Name', 'Quantity', 'Trade Quantity', 'Card Name', 'Set Code', 'Set Name', 'Card Number', 'Condition', 'Printing', 'Language', 'Price Bought', 'Date Bought'],
      rows.map((r) => [
        ctx.binder,
        r.qty,
        0,
        r.name,
        r.setCode.toUpperCase(),
        r.setName,
        r.cn,
        DRAGONSHIELD_CONDITION[r.condition],
        r.finish === 'nonfoil' ? 'Normal' : 'Foil',
        languageName(r.lang),
        0,
        '',
      ]),
    )
  },
}

export const mtggoldfish: ExportFormat = {
  id: 'mtggoldfish',
  label: 'MTGGoldfish',
  kind: 'csv',
  ext: 'csv',
  confidence: 'header-verified',
  note: `${HEADER_NOTE} MTGGoldfish carries no condition or language, so both are dropped.`,
  render(rows) {
    return csvDocument(
      ['Card', 'Set ID', 'Set Name', 'Quantity', 'Foil', 'Variation', 'Collector Number', 'Scryfall ID'],
      rows.map((r) => [
        r.name,
        r.setCode.toUpperCase(),
        r.setName,
        r.qty,
        r.finish === 'nonfoil' ? 'regular' : 'foil',
        '',
        r.cn,
        r.scryfallId,
      ]),
    )
  },
}

export const tcgplayer: ExportFormat = {
  id: 'tcgplayer',
  label: 'TCGplayer',
  kind: 'csv',
  ext: 'csv',
  confidence: 'header-verified',
  note: `${HEADER_NOTE} Product ID and SKU are TCGplayer's own identifiers and are left blank.`,
  render(rows) {
    return csvDocument(
      ['Quantity', 'Name', 'Simple Name', 'Set', 'Card Number', 'Set Code', 'Printing', 'Condition', 'Language', 'Rarity', 'Product ID', 'SKU'],
      rows.map((r) => [
        r.qty,
        r.name,
        r.name.replace(/[^A-Za-z0-9 /]/g, ''),
        r.setName,
        r.cn,
        r.setCode.toUpperCase(),
        r.finish === 'nonfoil' ? 'Normal' : 'Foil',
        TITLE_CONDITION[r.condition] === 'Good' ? 'Lightly Played' : TITLE_CONDITION[r.condition],
        languageName(r.lang),
        r.rarity.charAt(0).toUpperCase() + r.rarity.slice(1),
        '',
        '',
      ]),
    )
  },
}

export const topdecked: ExportFormat = {
  id: 'topdecked',
  label: 'TopDecked',
  kind: 'csv',
  ext: 'csv',
  confidence: 'header-verified',
  note: `${HEADER_NOTE} TopDecked spells finishes exactly as Scryfall does.`,
  render(rows) {
    return csvDocument(
      ['QUANTITY', 'NAME', 'SETCODE', 'SETNAME', 'COLLECTOR NUMBER', 'FINISH', 'PRICE', 'RARITY', 'ID', 'ACQUIRED DATE', 'ACQUIRED PRICE', 'LANG', 'PRICE SALE', 'SIGNING', 'ALTERATION', 'CONDITION', 'NOTES', 'TAGS'],
      rows.map((r) => [
        r.qty,
        r.name,
        r.setCode.toLowerCase(),
        r.setName,
        r.cn,
        r.finish,
        '',
        r.rarity,
        r.scryfallId,
        '', '',
        r.lang,
        '', '', '',
        r.condition,
        '', '',
      ]),
    )
  },
}

export const cardkingdom: ExportFormat = {
  id: 'cardkingdom',
  label: 'Card Kingdom',
  kind: 'csv',
  ext: 'csv',
  confidence: 'header-verified',
  note: `${HEADER_NOTE} Card Kingdom matches on set name rather than code, and carries no condition.`,
  render(rows) {
    return csvDocument(
      ['title', 'edition', 'foil', 'quantity'],
      rows.map((r) => [
        r.name,
        r.setName,
        r.finish === 'nonfoil' ? 'FALSE' : 'TRUE',
        r.qty,
      ]),
    )
  },
}
