import type { Condition, Finish } from '../types.ts'
import { csvDocument } from './csv.ts'
import { manaboxLang } from './lang.ts'
import type { ExportFormat } from './types.ts'

const HEADER = [
  'Name',
  'Set code',
  'Set name',
  'Collector number',
  'Foil',
  'Rarity',
  'Quantity',
  'ManaBox ID',
  'Scryfall ID',
  'Purchase price',
  'Misprint',
  'Altered',
  'Condition',
  'Language',
  'Purchase price currency',
]

const FOIL: Record<Finish, string> = {
  nonfoil: 'normal',
  foil: 'foil',
  etched: 'etched',
}

/** ManaBox spells conditions in snake case, which is this project's canonical form. */
const CONDITION: Record<Condition, string> = {
  mint: 'mint',
  near_mint: 'near_mint',
  excellent: 'excellent',
  good: 'good',
  light_played: 'light_played',
  played: 'played',
  poor: 'poor',
}

export const manabox: ExportFormat = {
  id: 'manabox',
  label: 'ManaBox',
  kind: 'csv',
  ext: 'csv',
  confidence: 'round-tripped',
  note: "Imported into ManaBox successfully. LF line endings matter: a CRLF file leaves a stray return on the last column and ManaBox rejects every row.",
  render(rows) {
    return csvDocument(
      HEADER,
      rows.map((r) => [
        r.name,
        r.setCode.toUpperCase(),
        r.setName,
        r.cn,
        FOIL[r.finish],
        r.rarity,
        r.qty,
        '',
        r.scryfallId,
        '',
        'false',
        'false',
        CONDITION[r.condition],
        manaboxLang(r.lang),
        '',
      ]),
    )
  },
}
