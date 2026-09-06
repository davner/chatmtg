import { describe, expect, it } from 'vitest'
import { normalize, search, tokenize, type SearchEntry } from '../src/lib/search.ts'

const set = (name: string, code: string): SearchEntry => ({
  kind: 'set',
  name,
  href: `set/${code}/`,
  sub: `${code.toUpperCase()} · 300 cards`,
  code,
})

const drop = (name: string, slug: string): SearchEntry => ({
  kind: 'drop',
  name,
  href: `drop/${slug}/`,
  sub: 'Secret Lair · 6 cards',
})

const deck = (name: string, slug: string, code: string): SearchEntry => ({
  kind: 'deck',
  name,
  href: `deck/${slug}/`,
  sub: `${code.toUpperCase()} · Commander Deck · 100 cards`,
  code,
})

const INDEX: SearchEntry[] = [
  set('Bloomburrow', 'blb'),
  set('Bloomburrow Commander', 'blc'),
  set('Alchemy: Bloomburrow', 'yblb'),
  set('Duskmourn: House of Horror', 'dsk'),
  set('Foundations', 'fdn'),
  drop('Hatsune Miku: Winter Diva', 'hatsune-miku-winter-diva'),
  drop('Hatsune Miku: Winter Diva Foil Edition', 'hatsune-miku-winter-diva-foil-edition'),
  drop('Artist Series: José Ramos', 'artist-series-jose-ramos'),
  drop("Urza's Fun House", 'urzas-fun-house'),
  deck('Ahoy Mateys', 'lcc-ahoy-mateys', 'lcc'),
  deck('Squirreled Away', 'blc-squirreled-away', 'blb'),
  deck('Absolute Power', 'x01-absolute-power', 'x01'),
  deck('Console Commander', 'x01-console-commander', 'x01'),
]

const hrefs = (query: string, limit = 20) =>
  search(INDEX, query, limit).map((r) => r.entry.href)

describe('finding a product by the words someone remembers', () => {
  it('reaches a name whose punctuation the query does not have', () => {
    // The failure this module exists for: a substring search for the typed
    // words finds nothing across the colon in the real product name.
    expect(hrefs('Hatsune Miku Winter')).toContain('drop/hatsune-miku-winter-diva/')
    expect('Hatsune Miku: Winter Diva'.toLowerCase().includes('hatsune miku winter')).toBe(false)
  })

  it('ignores the order the words were typed in', () => {
    expect(hrefs('winter miku')).toContain('drop/hatsune-miku-winter-diva/')
    expect(hrefs('diva hatsune')).toContain('drop/hatsune-miku-winter-diva/')
  })

  it('matches through an accent the query omits', () => {
    expect(hrefs('jose ramos')).toContain('drop/artist-series-jose-ramos/')
    expect(hrefs('José')).toContain('drop/artist-series-jose-ramos/')
  })

  it('matches an apostrophe the query drops, typed either way', () => {
    expect(hrefs('urzas fun house')).toContain('drop/urzas-fun-house/')
    expect(hrefs("urza's fun")).toContain('drop/urzas-fun-house/')
    expect(hrefs('urza’s fun')).toContain('drop/urzas-fun-house/')
  })

  it('forgives one typo in a word long enough to be sure about', () => {
    expect(hrefs('bloomburow')).toContain('set/blb/')
    expect(hrefs('duskmorn')).toContain('set/dsk/')
    expect(hrefs('foundatons')).toContain('set/fdn/')
  })

  it('finds a deck by its set code and a word from its name', () => {
    expect(hrefs('lcc ahoy')).toEqual(['deck/lcc-ahoy-mateys/'])
  })
})

describe('not matching everything', () => {
  it('holds a short token to a prefix, so three letters do not open the catalogue', () => {
    // "sol" sits inside "absolute" and one edit from "soul"; neither is what
    // someone typing three letters is looking for. A prefix still counts.
    expect(hrefs('sol')).toEqual([])
    expect(hrefs('con')).toEqual(['deck/x01-console-commander/'])
  })

  it('needs every token to land somewhere', () => {
    expect(hrefs('winter diva goblin')).toEqual([])
  })

  it('returns nothing for an empty or punctuation-only query', () => {
    expect(search(INDEX, '', 20)).toEqual([])
    expect(search(INDEX, '   ', 20)).toEqual([])
    expect(search(INDEX, ':,-', 20)).toEqual([])
  })

  it('corrects one letter and no more, so a mangled word finds nothing', () => {
    expect(hrefs('blomburow')).toEqual([])
  })
})

describe('ranking', () => {
  it('puts a set code typed exactly at the very top', () => {
    const found = hrefs('blb')
    expect(found[0]).toBe('set/blb/')
    expect(found).toContain('deck/blc-squirreled-away/')
  })

  it('puts an exact name above a name that merely starts with the query', () => {
    expect(hrefs('bloomburrow')).toEqual(['set/blb/', 'set/blc/', 'set/yblb/'])
  })

  it('puts the name that opens on the query above one that only mentions it', () => {
    // Both are corrections of the same typo, so only where the word sits in
    // the name separates them.
    expect(hrefs('bloomburow')).toEqual(['set/blb/', 'set/blc/', 'set/yblb/'])
  })

  it('puts the set above a deck when the word only appears mid-name in both', () => {
    expect(hrefs('commander')).toEqual(['set/blc/', 'deck/x01-console-commander/'])
  })

  it('ranks an exact spelling above the same query corrected', () => {
    const found = hrefs('duskmourn')
    expect(found[0]).toBe('set/dsk/')
    expect(hrefs('duskmourne')[0]).toBe('set/dsk/')
  })

  it('prefers the shorter name when nothing else separates two matches', () => {
    expect(hrefs('winter diva')).toEqual([
      'drop/hatsune-miku-winter-diva/',
      'drop/hatsune-miku-winter-diva-foil-edition/',
    ])
  })

  it('honours the limit', () => {
    expect(hrefs('a', 2).length).toBeLessThanOrEqual(2)
    expect(hrefs('winter', 1)).toEqual(['drop/hatsune-miku-winter-diva/'])
  })
})

describe('results', () => {
  it('hands back the entry it was given, so a caller can render and link it', () => {
    const [top] = search(INDEX, 'ahoy mateys', 5)
    expect(top?.entry).toEqual(INDEX.find((e) => e.href === 'deck/lcc-ahoy-mateys/'))
    expect(top?.entry.sub).toBe('LCC · Commander Deck · 100 cards')
    expect(top?.score).toBeGreaterThan(0)
  })

  it('does not mutate the index it was given', () => {
    const before = JSON.stringify(INDEX)
    search(INDEX, 'winter diva', 5)
    expect(JSON.stringify(INDEX)).toBe(before)
  })

  it('keeps working when the index it was handed grows', () => {
    const growing = [...INDEX]
    expect(search(growing, 'brothers war', 5)).toEqual([])
    growing.push(set("The Brothers' War", 'bro'))
    expect(search(growing, 'brothers war', 5).map((r) => r.entry.href)).toEqual(['set/bro/'])
  })
})

describe('normalising', () => {
  it('strips accents, case, and punctuation', () => {
    expect(normalize('Hatsune Miku: Winter Diva')).toBe('hatsune miku winter diva')
    expect(normalize('José')).toBe('jose')
    expect(normalize('  Duskmourn - House of Horror  ')).toBe('duskmourn house of horror')
  })

  it('closes an apostrophe up rather than breaking the word at it', () => {
    expect(normalize("Urza's")).toBe('urzas')
    expect(normalize('Urza’s')).toBe('urzas')
  })

  it('splits into tokens, and finds none in punctuation', () => {
    expect(tokenize('Hatsune Miku: Winter Diva')).toEqual(['hatsune', 'miku', 'winter', 'diva'])
    expect(tokenize('   ')).toEqual([])
  })
})
