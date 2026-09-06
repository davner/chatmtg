import { describe, expect, it } from 'vitest'
import { setQtyAt, viewRows } from '../src/components/CardTable.tsx'
import type { CardRow } from '../src/lib/export/types.ts'

const card = (name: string, cn: string, rarity: string, qty = 1): CardRow => ({
  name,
  setCode: 'blb',
  setName: 'Bloomburrow',
  cn,
  rarity,
  finish: 'nonfoil',
  available: ['nonfoil', 'foil'],
  qty,
  scryfallId: `id-${cn}`,
  lang: 'en',
  condition: 'near_mint',
})

// Deliberately out of collector-number order, so a sorted view cannot pass by
// accidentally agreeing with the source order.
const ROWS: CardRow[] = [
  card('Zoraline, Cosmos Caller', '10', 'mythic'),
  card('Bakersbane Duo', '2', 'common'),
  card('Hugs, Grisly Guardian', '100', 'rare'),
  card('Fecund Greenshell', '3', 'uncommon'),
]

const ALL = { query: '', rarity: 'all', sort: 'number' as const }

/** The pair the whole table rests on: a view position and the row it came from. */
function resolves(rows: CardRow[], view: { row: CardRow; index: number }[]): boolean {
  return view.every(({ row, index }) => rows[index] === row)
}

describe('the table view', () => {
  it('carries every row back to its own position in the unfiltered list', () => {
    expect(resolves(ROWS, viewRows(ROWS, ALL))).toBe(true)
  })

  it('keeps the original index after sorting reorders the rows', () => {
    const byName = viewRows(ROWS, { ...ALL, sort: 'name' })
    expect(byName.map((v) => v.row.name)[0]).toBe('Bakersbane Duo')
    expect(byName.map((v) => v.index)).not.toEqual([0, 1, 2, 3])
    expect(resolves(ROWS, byName)).toBe(true)
  })

  it('keeps the original index after a rarity filter drops rows', () => {
    const rares = viewRows(ROWS, { ...ALL, rarity: 'rare' })
    expect(rares.map((v) => v.index)).toEqual([2])
    expect(resolves(ROWS, rares)).toBe(true)
  })

  it('matches a name anywhere in it, case-insensitively', () => {
    expect(viewRows(ROWS, { ...ALL, query: 'GRISLY' }).map((v) => v.index)).toEqual([2])
  })

  it('matches a collector number only in full, so 10 does not pull in 100', () => {
    expect(viewRows(ROWS, { ...ALL, query: '10' }).map((v) => v.row.cn)).toEqual(['10'])
  })

  it('ignores surrounding space in a search', () => {
    expect(viewRows(ROWS, { ...ALL, query: '  duo ' }).map((v) => v.index)).toEqual([1])
  })

  it('returns nothing rather than everything when a search matches no card', () => {
    expect(viewRows(ROWS, { ...ALL, query: 'Black Lotus' })).toEqual([])
  })

  it('does not mutate the list it was given', () => {
    viewRows(ROWS, { ...ALL, sort: 'name' })
    expect(ROWS.map((r) => r.cn)).toEqual(['10', '2', '100', '3'])
  })
})

describe('bulk quantity edits', () => {
  it('writes only the rows it was given', () => {
    const next = setQtyAt(ROWS, [1, 3], 0)
    expect(next.map((r) => r.qty)).toEqual([1, 0, 1, 0])
  })

  // The bug this whole shape exists to stop: a filtered position is not a row.
  it('sets the filtered rows and leaves every hidden row alone', () => {
    const shown = viewRows(ROWS, { ...ALL, query: 'e', sort: 'name' })
    const next = setQtyAt(ROWS, shown.map((v) => v.index), 0)
    const zeroed = next.filter((r) => r.qty === 0).map((r) => r.name).sort()
    expect(zeroed).toEqual(shown.map((v) => v.row.name).sort())
    expect(zeroed).toHaveLength(3)
    expect(next.find((r) => r.name === 'Hugs, Grisly Guardian')!.qty).toBe(1)
  })

  it('sets one of each across the whole list', () => {
    const emptied = setQtyAt(ROWS, [0, 1, 2, 3], 0)
    const refilled = setQtyAt(emptied, viewRows(emptied, ALL).map((v) => v.index), 1)
    expect(refilled.map((r) => r.qty)).toEqual([1, 1, 1, 1])
  })

  it('clamps a quantity the same way a typed one is clamped', () => {
    expect(setQtyAt(ROWS, [0], 500)[0]!.qty).toBe(99)
    expect(setQtyAt(ROWS, [0], -1)[0]!.qty).toBe(0)
  })

  it('drops an index the list does not have, rather than growing the list', () => {
    const next = setQtyAt(ROWS, [2, 9, -1], 0)
    expect(next).toHaveLength(ROWS.length)
    expect(next.map((r) => r.qty)).toEqual([1, 1, 0, 1])
  })

  it('does not mutate the rows it was given', () => {
    const next = setQtyAt(ROWS, [0, 1, 2, 3], 4)
    expect(ROWS.map((r) => r.qty)).toEqual([1, 1, 1, 1])
    expect(next[0]).not.toBe(ROWS[0])
  })

  it('leaves a row that already holds the quantity untouched', () => {
    const next = setQtyAt(ROWS, [0], 1)
    expect(next[0]).toBe(ROWS[0])
  })

  it('keeps every other field of a row it writes', () => {
    const next = setQtyAt(ROWS, [0], 0)[0]!
    expect(next).toEqual({ ...ROWS[0]!, qty: 0 })
  })
})
