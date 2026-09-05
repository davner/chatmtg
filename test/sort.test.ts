import { describe, expect, it } from 'vitest'
import { compareCards, padCn, sortProducts } from '../src/lib/sort.ts'

const p = (name: string, released: string, count: number) => ({ name, released, count })

const PRODUCTS = [
  p('Winter Diva', '2025-02-11', 6),
  p('Artist Series: Ian Miller', '2026-09-01', 4),
  p('Bitterblossom Dreams', '2019-12-03', 5),
  p('Alpha Order', '2026-09-01', 9),
]

describe('sorting products', () => {
  it('puts the newest first by default', () => {
    expect(sortProducts(PRODUCTS, 'newest').map((x) => x.name)).toEqual([
      'Alpha Order',
      'Artist Series: Ian Miller',
      'Winter Diva',
      'Bitterblossom Dreams',
    ])
  })

  it('reverses for oldest', () => {
    expect(sortProducts(PRODUCTS, 'oldest')[0]!.name).toBe('Bitterblossom Dreams')
  })

  it('sorts by name', () => {
    expect(sortProducts(PRODUCTS, 'name').map((x) => x.name)).toEqual([
      'Alpha Order',
      'Artist Series: Ian Miller',
      'Bitterblossom Dreams',
      'Winter Diva',
    ])
  })

  it('sorts by size', () => {
    expect(sortProducts(PRODUCTS, 'largest')[0]!.count).toBe(9)
  })

  it('breaks a shared date on name, so the order is stable between renders', () => {
    const sameDay = sortProducts(PRODUCTS, 'newest').slice(0, 2).map((x) => x.name)
    expect(sameDay).toEqual(['Alpha Order', 'Artist Series: Ian Miller'])
  })

  it('does not mutate the list it was given', () => {
    const before = PRODUCTS.map((x) => x.name)
    sortProducts(PRODUCTS, 'name')
    expect(PRODUCTS.map((x) => x.name)).toEqual(before)
  })
})

describe('sorting cards', () => {
  const c = (cn: string, name: string, rarity = 'common') => ({ cn, name, rarity })

  it('orders collector numbers numerically, not as text', () => {
    // "10" sorts before "2" without padding, which is the whole reason padCn exists.
    const rows = [c('10', 'Ten'), c('2', 'Two'), c('100', 'Hundred')]
    expect(rows.sort((a, b) => compareCards(a, b, 'number')).map((r) => r.cn)).toEqual([
      '2',
      '10',
      '100',
    ])
    expect(padCn('2') < padCn('10')).toBe(true)
  })

  it('handles a suffixed collector number without throwing', () => {
    const rows = [c('1602★', 'Star'), c('1602', 'Plain')]
    expect(rows.sort((a, b) => compareCards(a, b, 'number')).map((r) => r.name)).toEqual([
      'Plain',
      'Star',
    ])
  })

  it('sorts by name', () => {
    const rows = [c('9', 'Zebra'), c('1', 'Apple')]
    expect(rows.sort((a, b) => compareCards(a, b, 'name'))[0]!.name).toBe('Apple')
  })

  it('sorts rarest first, then by number', () => {
    const rows = [c('5', 'C', 'common'), c('9', 'M', 'mythic'), c('1', 'R', 'rare')]
    expect(rows.sort((a, b) => compareCards(a, b, 'rarity')).map((r) => r.rarity)).toEqual([
      'mythic',
      'rare',
      'common',
    ])
  })

  it('puts an unknown rarity last rather than first', () => {
    const rows = [c('1', 'Odd', 'weird'), c('2', 'Common', 'common')]
    expect(rows.sort((a, b) => compareCards(a, b, 'rarity'))[0]!.rarity).toBe('common')
  })
})
