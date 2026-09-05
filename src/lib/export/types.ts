import type { Condition, Finish } from '../types.ts'

/** One line of an export: a card plus the decisions a collection needs. */
export interface CardRow {
  name: string
  setCode: string
  setName: string
  cn: string
  rarity: string
  finish: Finish
  /** Finishes this printing was made in, so the UI cannot offer one that does not exist. */
  available?: Finish[]
  /** True when this printing stands in for one no database has catalogued. */
  substituted?: boolean
  qty: number
  scryfallId: string
  /** Scryfall language code, e.g. `en`, `de`, `zhs`. Adapters translate outward. */
  lang: string
  condition: Condition
}

export interface ExportContext {
  /** Names the binder, folder, or list the import lands in, where a target has one. */
  binder: string
}

/**
 * How far a target has actually been proven. Only a completed import settles it,
 * so the UI shows this rather than implying every target is equally trustworthy.
 *
 * `round-tripped`  a generated file was imported into the real app and accepted
 * `documented`     the site publishes the columns it accepts, and these match
 * `header-verified` the header came from a real export, which is evidence the
 *                   site reads it back, not proof
 */
export type Confidence = 'round-tripped' | 'documented' | 'header-verified'

export interface ExportFormat {
  id: string
  label: string
  kind: 'csv' | 'text'
  /** File extension for the download, without the dot. */
  ext: 'csv' | 'txt'
  confidence: Confidence
  /** What was checked, shown next to the preview. */
  note: string
  render(rows: CardRow[], ctx: ExportContext): string
}
