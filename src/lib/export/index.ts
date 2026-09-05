import { manabox } from './manabox.ts'
import { arena, plain } from './text.ts'
import {
  archidekt,
  cardkingdom,
  deckbox,
  dragonshield,
  moxfield,
  mtggoldfish,
  tcgplayer,
  topdecked,
} from './sites.ts'
import type { ExportFormat } from './types.ts'

/** ManaBox leads: it is the only target proven end to end through a real import. */
export const FORMATS: ExportFormat[] = [
  manabox,
  arena,
  plain,
  moxfield,
  archidekt,
  deckbox,
  dragonshield,
  mtggoldfish,
  tcgplayer,
  topdecked,
  cardkingdom,
]

export const BY_ID = new Map(FORMATS.map((f) => [f.id, f]))

export function formatById(id: string): ExportFormat {
  const f = BY_ID.get(id)
  if (!f) throw new Error(`unknown export format: ${id}`)
  return f
}

export type { CardRow, ExportContext, ExportFormat } from './types.ts'
