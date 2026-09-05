/** Sort orders offered for a list of products, and for a list of cards. */

export interface Sortable {
  name: string
  released: string
  count: number
}

export type ProductSort = 'newest' | 'oldest' | 'name' | 'largest'

export const PRODUCT_SORTS: { id: ProductSort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'name', label: 'A–Z' },
  { id: 'largest', label: 'Most cards' },
]

/**
 * Name is the tiebreak everywhere, so a page of products sharing a release date
 * keeps a stable order between renders rather than shuffling.
 */
export function sortProducts<T extends Sortable>(items: T[], by: ProductSort): T[] {
  const out = [...items]
  switch (by) {
    case 'oldest':
      return out.sort((a, b) => a.released.localeCompare(b.released) || a.name.localeCompare(b.name))
    case 'name':
      return out.sort((a, b) => a.name.localeCompare(b.name))
    case 'largest':
      return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    default:
      return out.sort((a, b) => b.released.localeCompare(a.released) || a.name.localeCompare(b.name))
  }
}

export type CardSort = 'number' | 'name' | 'rarity'

export const CARD_SORTS: { id: CardSort; label: string }[] = [
  { id: 'number', label: 'Number' },
  { id: 'name', label: 'Name' },
  { id: 'rarity', label: 'Rarity' },
]

const RARITY_ORDER: Record<string, number> = {
  mythic: 0,
  rare: 1,
  special: 2,
  uncommon: 3,
  common: 4,
  bonus: 5,
}

/** Collector numbers are strings that sort wrongly unless padded: 2 before 10. */
export function padCn(cn: string): string {
  return cn.padStart(8, '0')
}

export function compareCards(
  a: { name: string; cn: string; rarity: string },
  b: { name: string; cn: string; rarity: string },
  by: CardSort,
): number {
  switch (by) {
    case 'name':
      return a.name.localeCompare(b.name) || padCn(a.cn).localeCompare(padCn(b.cn))
    case 'rarity':
      return (
        (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9) ||
        padCn(a.cn).localeCompare(padCn(b.cn))
      )
    default:
      return padCn(a.cn).localeCompare(padCn(b.cn))
  }
}
