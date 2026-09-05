import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadManualDecks } from '../scripts/sources/manual.ts'
import type { Card } from '../src/lib/types.ts'

/** Resolving a vendored decklist against card data, with no network involved. */

const card = (cn: string, name: string, finishes: Card['finishes'] = ['nonfoil']): Card => ({
  id: `id-${cn}`,
  name,
  cn,
  rarity: 'rare',
  finishes,
  lang: 'en',
})

const CARDS = new Map<string, Card[]>([
  ['sld', [card('2429', "Trostani, Selesnya's Voice", ['foil']), card('2444', 'Growing Ranks')]],
  ['kld', [card('192', 'Aetherflux Reservoir')]],
  // A set that prints one card three ways: ordinary, showcase, borderless.
  ['blc', [card('129', 'Sol Ring'), card('312', 'Sol Ring'), card('9999', 'Sol Ring')]],
  ['dsk', [card('3', 'Dazzling Theater // Prop Room')]],
])

let dir: string

const deck = (groups: unknown[]) => ({
  deck: 'Test Deck',
  product: 'Secret Lair Commander Deck Test Deck',
  slug: 'test-deck',
  released: '2026-08-10',
  setCode: 'sld',
  source: { name: 'Test', url: 'https://example.test', retrieved: '2026-09-05', why: 'test' },
  groups,
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'chatmtg-manual-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function load(groups: unknown[]) {
  await writeFile(join(dir, 'deck.json'), JSON.stringify(deck(groups)))
  return loadManualDecks(dir, CARDS)
}

describe('resolving a vendored decklist', () => {
  it('takes a collector number from the product’s own set', async () => {
    const [res] = await load([
      { label: 'Commander', finish: 'foil', cards: [{ name: 'X', count: 1, cn: '2429' }] },
    ])
    expect(res!.drop.cards[0]!.name).toBe("Trostani, Selesnya's Voice")
    expect(res!.drop.cards[0]!.setCode).toBe('sld')
    expect(res!.drop.cards[0]!.finish).toBe('foil')
  })

  it('takes a reprint from the set the announcement names', async () => {
    const [res] = await load([
      {
        label: 'Non-foil reprints',
        finish: 'nonfoil',
        cards: [{ name: 'Aetherflux Reservoir', count: 1, set: 'kld' }],
      },
    ])
    expect(res!.drop.cards[0]!.setCode).toBe('kld')
    expect(res!.drop.cards[0]!.cn).toBe('192')
  })

  it('prefers the ordinary printing over showcase treatments', async () => {
    const [res] = await load([
      { label: 'r', finish: 'nonfoil', cards: [{ name: 'Sol Ring', count: 1, set: 'blc' }] },
    ])
    expect(res!.drop.cards[0]!.cn).toBe('129')
  })

  it('matches a double-faced card by its front face', async () => {
    const [res] = await load([
      { label: 'r', finish: 'nonfoil', cards: [{ name: 'Dazzling Theater', count: 1, set: 'dsk' }] },
    ])
    expect(res!.drop.cards[0]!.name).toBe('Dazzling Theater // Prop Room')
  })

  it('never claims a finish the printing was not made in', async () => {
    // Growing Ranks exists only as non-foil, so a foil group cannot make it foil.
    const [res] = await load([
      { label: 'foils', finish: 'foil', cards: [{ name: 'X', count: 1, cn: '2444' }] },
    ])
    expect(res!.drop.cards[0]!.finish).toBe('nonfoil')
  })

  it('counts quantities rather than rows', async () => {
    const [res] = await load([
      { label: 'lands', finish: 'nonfoil', cards: [{ name: 'Growing Ranks', count: 7, cn: '2444' }] },
    ])
    expect(res!.drop.count).toBe(7)
    expect(res!.drop.cards).toHaveLength(1)
  })

  it('records a corrected set code instead of applying it silently', async () => {
    const [res] = await load([
      {
        label: 'r',
        finish: 'nonfoil',
        cards: [
          { name: 'Aetherflux Reservoir', count: 1, set: 'kld', setCorrectedFrom: 'KLDX' },
        ],
      },
    ])
    expect(res!.corrections).toEqual([
      'Aetherflux Reservoir: announcement says KLDX, card is KLD',
    ])
  })

  it('labels a mixed deck MIXED', async () => {
    const [res] = await load([
      { label: 'a', finish: 'foil', cards: [{ name: 'X', count: 1, cn: '2429' }] },
      { label: 'b', finish: 'nonfoil', cards: [{ name: 'Y', count: 1, cn: '2444' }] },
    ])
    expect(res!.drop.finishLabel).toBe('MIXED')
  })
})

describe('a vendored decklist that cannot be resolved', () => {
  // Dropping the row would publish a short deck that still looks complete,
  // which is the failure this project must never produce quietly.
  it('fails on a card missing from the named set', async () => {
    await expect(
      load([{ label: 'r', finish: 'nonfoil', cards: [{ name: 'Black Lotus', count: 1, set: 'kld' }] }]),
    ).rejects.toThrow(/not found in KLD/)
  })

  it('fails on a collector number that does not exist', async () => {
    await expect(
      load([{ label: 'c', finish: 'foil', cards: [{ name: 'X', count: 1, cn: '9999' }] }]),
    ).rejects.toThrow(/not found in SLD/)
  })

  it('fails on a set with no card data', async () => {
    await expect(
      load([{ label: 'r', finish: 'nonfoil', cards: [{ name: 'X', count: 1, set: 'zzz' }] }]),
    ).rejects.toThrow(/no card data for set/)
  })

  it('fails on an entry naming neither a number nor a set', async () => {
    await expect(
      load([{ label: 'r', finish: 'nonfoil', cards: [{ name: 'X', count: 1 }] }]),
    ).rejects.toThrow(/neither a number nor a set/)
  })
})
