import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RECENT_KEY,
  RECENT_LIMIT,
  WARM_LIMIT,
  clearRecent,
  dataUrlFor,
  readRecent,
  recordRecent,
  warmProductData,
} from '../src/lib/recent.ts'
import { url } from '../src/lib/paths.ts'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  }
}

function install(storage: Storage | (() => never) | undefined): void {
  Reflect.deleteProperty(globalThis, 'localStorage')
  if (typeof storage === 'function') {
    // Reading the property itself throws when an origin has storage disabled.
    Object.defineProperty(globalThis, 'localStorage', { get: storage, configurable: true })
  } else if (storage) {
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  }
}

const SET = { href: '/set/blb/', name: 'Bloomburrow', kind: 'set', count: 1203 } as const
const DROP = { href: '/drop/winter-diva/', name: 'Winter Diva', kind: 'drop', count: 6 } as const

afterEach(() => {
  install(undefined)
  vi.unstubAllGlobals()
})

describe('recording what was opened', () => {
  it('reads back what it recorded', () => {
    install(memoryStorage())
    recordRecent(SET, 1000)
    expect(readRecent()).toEqual([{ ...SET, at: 1000 }])
  })

  it('puts the newest first', () => {
    install(memoryStorage())
    recordRecent(SET, 1000)
    recordRecent(DROP, 2000)
    expect(readRecent().map((e) => e.name)).toEqual(['Winter Diva', 'Bloomburrow'])
  })

  it('keeps one row per href and moves a repeat to the front', () => {
    install(memoryStorage())
    recordRecent(SET, 1000)
    recordRecent(DROP, 2000)
    recordRecent(SET, 3000)
    expect(readRecent().map((e) => e.href)).toEqual(['/set/blb/', '/drop/winter-diva/'])
  })

  it('caps the list and drops the oldest', () => {
    install(memoryStorage())
    for (let i = 0; i <= RECENT_LIMIT; i++) {
      recordRecent({ href: `/set/s${i}/`, name: `Set ${i}`, kind: 'set' }, 1000 + i)
    }
    const hrefs = readRecent().map((e) => e.href)
    expect(hrefs).toHaveLength(RECENT_LIMIT)
    expect(hrefs[0]).toBe(`/set/s${RECENT_LIMIT}/`)
    expect(hrefs).not.toContain('/set/s0/')
  })

  it('omits a count the page did not state', () => {
    install(memoryStorage())
    recordRecent({ href: '/deck/x/', name: 'X', kind: 'deck' }, 1)
    expect(readRecent()[0]).toEqual({ href: '/deck/x/', name: 'X', kind: 'deck', at: 1 })
  })

  it('records nothing for a product with no name', () => {
    const store = memoryStorage()
    install(store)
    expect(recordRecent({ href: '/set/blb/', name: '', kind: 'set' }, 1000)).toEqual([])
    expect(store.getItem(RECENT_KEY)).toBeNull()
  })
})

describe('storage that is not there', () => {
  it('reads empty when there is no localStorage at all', () => {
    install(undefined)
    expect(readRecent()).toEqual([])
  })

  it('records without throwing when there is no localStorage at all', () => {
    install(undefined)
    expect(recordRecent(SET, 1000)).toEqual([{ ...SET, at: 1000 }])
  })

  it('survives an origin where reading the property throws', () => {
    install(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    })
    expect(readRecent()).toEqual([])
    expect(() => recordRecent(SET, 1000)).not.toThrow()
    expect(() => clearRecent()).not.toThrow()
  })

  it('survives getItem throwing', () => {
    install({ ...memoryStorage(), getItem: () => { throw new Error('nope') } })
    expect(readRecent()).toEqual([])
  })

  it('still answers the page when the quota is full', () => {
    install({ ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError') } })
    expect(recordRecent(SET, 1000)).toEqual([{ ...SET, at: 1000 }])
    expect(readRecent()).toEqual([])
  })

  it('survives removeItem throwing', () => {
    install({ ...memoryStorage(), removeItem: () => { throw new Error('nope') } })
    expect(() => clearRecent()).not.toThrow()
  })

  it('clears the key', () => {
    const store = memoryStorage()
    install(store)
    recordRecent(SET, 1000)
    clearRecent()
    expect(store.getItem(RECENT_KEY)).toBeNull()
    expect(readRecent()).toEqual([])
  })
})

describe('whatever is already in the key', () => {
  const surviving = (raw: string) => {
    install(memoryStorage({ [RECENT_KEY]: raw }))
    return readRecent()
  }

  it('ignores unparseable text', () => {
    expect(surviving('{{{')).toEqual([])
    expect(surviving('')).toEqual([])
  })

  it('ignores JSON that is not a list', () => {
    expect(surviving('null')).toEqual([])
    expect(surviving('42')).toEqual([])
    expect(surviving('"a string"')).toEqual([])
    expect(surviving('{"href":"/set/blb/"}')).toEqual([])
  })

  it('drops rows that are not entries and keeps the ones that are', () => {
    const good = { href: '/set/blb/', name: 'Bloomburrow', kind: 'set', at: 5 }
    const raw = JSON.stringify([null, 7, 'x', [], {}, { href: '/set/x/' }, good])
    expect(surviving(raw)).toEqual([good])
  })

  it('drops a row whose kind is not a product kind', () => {
    const raw = JSON.stringify([{ href: '/x/', name: 'X', kind: 'article', at: 5 }])
    expect(surviving(raw)).toEqual([])
  })

  it('drops a row whose timestamp is not a finite number', () => {
    const raw = JSON.stringify([
      { href: '/set/a/', name: 'A', kind: 'set', at: '5' },
      { href: '/set/b/', name: 'B', kind: 'set', at: null },
    ])
    expect(surviving(raw)).toEqual([])
  })

  it('drops a count that is not a finite number rather than the whole row', () => {
    const raw = JSON.stringify([{ href: '/set/a/', name: 'A', kind: 'set', at: 5, count: 'many' }])
    expect(surviving(raw)).toEqual([{ href: '/set/a/', name: 'A', kind: 'set', at: 5 }])
  })

  it('sorts and deduplicates a list written in any order', () => {
    const raw = JSON.stringify([
      { href: '/set/a/', name: 'A old', kind: 'set', at: 1 },
      { href: '/set/b/', name: 'B', kind: 'set', at: 2 },
      { href: '/set/a/', name: 'A new', kind: 'set', at: 3 },
    ])
    expect(surviving(raw).map((e) => e.name)).toEqual(['A new', 'B'])
  })

  it('caps a list longer than the limit', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      href: `/set/s${i}/`,
      name: `Set ${i}`,
      kind: 'set',
      at: i,
    }))
    expect(surviving(JSON.stringify(rows))).toHaveLength(RECENT_LIMIT)
  })
})

describe('the card list behind a product link', () => {
  it('matches the url the product page actually fetches', () => {
    expect(dataUrlFor(url('set/blb/'))).toBe(url('data/sets/blb.json'))
    expect(dataUrlFor(url('drop/winter-diva/'))).toBe(url('data/drops/winter-diva.json'))
    expect(dataUrlFor(url('deck/blb-bloom-and-doom/'))).toBe(
      url('data/decks/blb-bloom-and-doom.json'),
    )
  })

  it('keeps a base path in front of the data directory', () => {
    expect(dataUrlFor('/chatmtg/set/blb/')).toBe('/chatmtg/data/sets/blb.json')
  })

  it('reads a link with no trailing slash, a query, or a hash', () => {
    expect(dataUrlFor('/set/blb')).toBe('/data/sets/blb.json')
    expect(dataUrlFor('/set/blb/?from=wall')).toBe('/data/sets/blb.json')
    expect(dataUrlFor('/set/blb/#cards')).toBe('/data/sets/blb.json')
  })

  it('answers nothing for a link that is not a product', () => {
    expect(dataUrlFor('/')).toBeNull()
    expect(dataUrlFor('/set/')).toBeNull()
    expect(dataUrlFor('https://scryfall.com/sets/blb')).toBeNull()
  })
})

describe('warming that card list', () => {
  const inBrowser = () => {
    const asked: string[] = []
    vi.stubGlobal('window', {})
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url)
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })
    })
    return asked
  }

  const fresh = async () => {
    vi.resetModules()
    return import('../src/lib/recent.ts')
  }

  it('does nothing on the server, where there is no window', () => {
    expect(() => warmProductData('/set/blb/')).not.toThrow()
  })

  it('asks for the card list once per url', async () => {
    const asked = inBrowser()
    const { warmProductData: warm } = await fresh()
    warm('/set/blb/')
    warm('/set/blb/')
    expect(asked).toEqual(['/data/sets/blb.json'])
  })

  it('ignores a link that is not a product', async () => {
    const asked = inBrowser()
    const { warmProductData: warm } = await fresh()
    warm('/')
    expect(asked).toEqual([])
  })

  it('stops well short of a wall of tiles under a sweeping cursor', async () => {
    const asked = inBrowser()
    const { warmProductData: warm } = await fresh()
    for (let i = 0; i < 60; i++) warm(`/set/s${i}/`)
    expect(asked).toHaveLength(WARM_LIMIT)
  })

  it('warms nothing on a metered connection', async () => {
    const asked = inBrowser()
    vi.stubGlobal('navigator', { connection: { saveData: true } })
    const { warmProductData: warm } = await fresh()
    warm('/set/blb/')
    expect(asked).toEqual([])
  })

  it('warms nothing on 2g', async () => {
    const asked = inBrowser()
    vi.stubGlobal('navigator', { connection: { saveData: false, effectiveType: '2g' } })
    const { warmProductData: warm } = await fresh()
    warm('/set/blb/')
    expect(asked).toEqual([])
  })

  // An unhandled rejection here fails the run, which is the assertion that the
  // warming request cannot reach the page it was fired from.
  it('stays quiet when the warming request fails', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
    const { warmProductData: warm } = await fresh()
    expect(() => warm('/set/blb/')).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
