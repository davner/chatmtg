import { describe, expect, it } from 'vitest'
import { entryFinish, slugify } from '../scripts/sources/mtgjson.ts'
import { front, matches, plainest } from '../scripts/sources/manual.ts'
import { iconFileName } from '../scripts/sources/scryfall.ts'
import { finishLabelOf } from '../src/lib/types.ts'
import type { Card } from '../src/lib/types.ts'

const card = (cn: string, name = 'Sol Ring'): Card => ({
  id: `id-${cn}`,
  name,
  cn,
  rarity: 'rare',
  finishes: ['nonfoil'],
  lang: 'en',
})

describe('finish, resolved from the deck entry', () => {
  // Getting this backwards records a foil someone does not own, or misses one
  // they do. It is the single most consequential rule in the pipeline.
  it('reads etched, then foil, then plain', () => {
    expect(entryFinish({ count: 1, uuid: 'u', isEtched: true, isFoil: true })).toBe('etched')
    expect(entryFinish({ count: 1, uuid: 'u', isFoil: true })).toBe('foil')
    expect(entryFinish({ count: 1, uuid: 'u' })).toBe('nonfoil')
  })

  it('never infers foil from the absence of a flag', () => {
    expect(entryFinish({ count: 1, uuid: 'u', isFoil: false })).toBe('nonfoil')
    expect(entryFinish({ count: 1, uuid: 'u', isEtched: false, isFoil: false })).toBe('nonfoil')
  })
})

describe('finish label for a whole product', () => {
  it('says MIXED rather than picking a side', () => {
    expect(finishLabelOf([{ finish: 'foil' }, { finish: 'nonfoil' }])).toBe('MIXED')
  })

  it('counts etched as a foil for labelling', () => {
    expect(finishLabelOf([{ finish: 'etched' }, { finish: 'foil' }])).toBe('FOIL')
  })

  it('labels single-finish products plainly', () => {
    expect(finishLabelOf([{ finish: 'foil' }, { finish: 'foil' }])).toBe('FOIL')
    expect(finishLabelOf([{ finish: 'nonfoil' }])).toBe('NONFOIL')
  })

  it('does not call an empty product foil', () => {
    expect(finishLabelOf([])).toBe('NONFOIL')
  })
})

describe('slugs', () => {
  it('survives punctuation drops are actually named with', () => {
    expect(slugify('Hatsune Miku: Winter Diva Foil Edition')).toBe(
      'hatsune-miku-winter-diva-foil-edition',
    )
    expect(slugify("Marvel's Hulk: SMASH!")).toBe('marvels-hulk-smash')
    expect(slugify('Artist Series: Ian Miller')).toBe('artist-series-ian-miller')
  })

  it('handles the curly apostrophe upstream uses', () => {
    expect(slugify('Everyone’s Invited!')).toBe('everyones-invited')
  })

  it('leaves no leading or trailing separator', () => {
    expect(slugify('!!! Loud !!!')).toBe('loud')
  })
})

describe('card name matching', () => {
  it('matches a double-faced card by its front face', () => {
    expect(matches('Dazzling Theater // Prop Room', 'Dazzling Theater // Prop Room')).toBe(true)
    expect(matches('Dazzling Theater // Prop Room', 'Dazzling Theater')).toBe(true)
    expect(front('Ambitious Farmhand // Seasoned Cathar')).toBe('Ambitious Farmhand')
  })

  it('does not match a different card', () => {
    expect(matches('Sol Ring', 'Sol Talisman')).toBe(false)
  })
})

describe('picking the ordinary printing', () => {
  // A precon ships the plain card, not the showcase or borderless treatment,
  // and those are numbered above the main run.
  it('prefers the low, short collector number', () => {
    expect(plainest([card('295'), card('96'), card('412')])?.cn).toBe('96')
  })

  it('prefers a plain number over a suffixed variant', () => {
    expect(plainest([card('96z'), card('96')])?.cn).toBe('96')
  })

  it('returns nothing for an empty pool rather than guessing', () => {
    expect(plainest([])).toBeUndefined()
  })
})

describe('icon filenames', () => {
  it('strips the cache-busting query Scryfall appends', () => {
    expect(iconFileName('https://svgs.scryfall.io/sets/sld.svg?1788148800')).toBe('sld.svg')
    expect(iconFileName('https://svgs.scryfall.io/sets/star.svg')).toBe('star.svg')
  })
})
