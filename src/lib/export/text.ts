import type { ExportFormat } from './types.ts'

/**
 * Arena's decklist form, `1 Card Name (SET) 123`. ManaBox documents its text
 * import as MTGA format, and Moxfield and Archidekt accept the same shape.
 *
 * A double-faced card is written front-face-only: Arena rejects the `//` form
 * that Scryfall stores.
 */
export const arena: ExportFormat = {
  id: 'arena',
  label: 'Text (Arena / MTGA)',
  kind: 'text',
  ext: 'txt',
  confidence: 'header-verified',
  note: "ManaBox documents its text import as MTGA format. The exact spelling is not round-tripped.",
  render(rows) {
    return rows
      .map((r) => `${r.qty} ${frontFace(r.name)} (${r.setCode.toUpperCase()}) ${r.cn}`)
      .join('\n')
  },
}

/** Names and quantities only, for importers that match on name alone. */
export const plain: ExportFormat = {
  id: 'plain',
  label: 'Text (names only)',
  kind: 'text',
  ext: 'txt',
  confidence: 'header-verified',
  note: 'Quantity and name. Loses set, finish, and collector number.',
  render(rows) {
    return rows.map((r) => `${r.qty} ${r.name}`).join('\n')
  },
}

function frontFace(name: string): string {
  const i = name.indexOf(' // ')
  return i === -1 ? name : name.slice(0, i)
}
