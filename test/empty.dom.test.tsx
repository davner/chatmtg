import {
  fireEvent,
  getDefaultNormalizer,
  render,
  screen,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardTable } from '../src/components/CardTable.tsx'
import { DropIndex } from '../src/components/DropIndex.tsx'
import { Palette } from '../src/components/Palette.tsx'
import { SetWall } from '../src/components/SetWall.tsx'
import type { TileData } from '../src/components/SlabTile.tsx'
import type { SearchEntry } from '../src/lib/search.ts'
import type { DropSummary } from '../src/lib/types.ts'

const BLB: TileData = {
  code: 'blb',
  sid: 'a2f58272-bba6-439d-871e-7a46686ac018',
  name: 'Bloomburrow',
  type: 'expansion',
  released: '2024-08-02',
  count: 1203,
  digital: false,
  icon: 'bloomburrow.svg',
}

const DIVA: DropSummary = {
  slug: 'winter-diva',
  name: 'Winter Diva',
  released: '2024-12-02',
  count: 6,
  allFoil: true,
  finishLabel: 'FOIL',
}

const MARVEL: DropSummary = {
  slug: 'marvel-spider-man',
  name: 'Marvel Spider-Man',
  released: '2025-06-30',
  count: 8,
  allFoil: false,
  finishLabel: 'MIXED',
}

const INDEX: SearchEntry[] = [
  { kind: 'set', name: 'Bloomburrow', href: 'set/blb/', sub: 'BLB · 1,203 cards', code: 'blb' },
  { kind: 'drop', name: 'Winter Diva', href: 'drop/winter-diva/', sub: 'SLD · 6 cards' },
]

/** A query nothing in any fixture can match. */
const MISS = 'zzzz'

function go(search: string): void {
  window.history.replaceState(null, '', `/${search}`)
}

/**
 * Routes a fetch by the tail of its path, because the wall fires up to three
 * requests and one shared body answers none of them honestly.
 *
 * A route value that is an `Error` rejects, which is how a dead file is asked
 * for; a value that is a promise is handed to `json()` unsettled, which is how
 * a still-loading file is asked for. An unrouted path throws synchronously
 * rather than rejecting: every island catches a rejection into its own fallback,
 * so a rejection would hide the unstubbed request instead of naming it.
 */
function stubFetch(routes: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input)
      const key = Object.keys(routes).find((path) => url.endsWith(path))
      if (key === undefined) throw new Error(`no stub for ${url}`)
      const body = routes[key]
      if (body instanceof Error) return Promise.reject(body)
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
      } as unknown as Response)
    }),
  )
}

function deferred<T>(): { promise: Promise<T>; settle: (value: T) => void } {
  let settle!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

/** Matches a derived count without the default normalizer eating a separator. */
const EXACT = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) }

beforeEach(() => {
  // Both walls seed their filters from the query string and write it back, so a
  // test that does not reset it inherits the previous one's view.
  go('')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the drop index when nothing matches', () => {
  it('names the query that found no drop', async () => {
    go(`?q=${MISS}`)
    stubFetch({ 'data/drops.json': [DIVA] })
    render(<DropIndex drops={[DIVA]} total={735} base="/" />)

    const empty = await screen.findByText(/^No drop matches/)
    expect(within(empty).getByText(MISS).tagName).toBe('STRONG')
    expect(within(empty).getByText('Winter Diva').tagName).toBe('CODE')
  })

  it('drops the empty state once the fetched catalogue answers the query', async () => {
    go('?q=marvel')
    stubFetch({ 'data/drops.json': [DIVA, MARVEL] })
    render(<DropIndex drops={[DIVA]} total={735} base="/" />)

    expect(await screen.findByRole('heading', { name: MARVEL.name })).toBeTruthy()
    expect(screen.queryByText(/^No drop matches/)).toBeNull()
  })

  it('falls back to the seed rather than emptying the list when drops.json fails', async () => {
    const seed = [DIVA]
    go('?q=diva')
    stubFetch({ 'data/drops.json': new Error('offline') })
    render(<DropIndex drops={seed} total={735} base="/" />)

    // The count is the server's total until the catalogue lands and the seed's
    // own length afterwards, so it is where the settled catch becomes visible.
    await screen.findByText(`${seed.length.toLocaleString()} drops`, EXACT)

    expect(screen.getByRole('heading', { name: DIVA.name })).toBeTruthy()
    expect(screen.queryByText(/^No drop matches/)).toBeNull()
  })

  it('says the index has no drops without quoting an empty query', () => {
    stubFetch({})
    render(<DropIndex drops={[]} total={0} base="/" />)

    const empty = screen.getByText('No drops to show.')
    expect(empty.querySelector('strong')).toBeNull()
  })
})

describe('the wall when nothing matches', () => {
  it('offers all three example queries on the releases tab', async () => {
    go(`?q=${MISS}`)
    stubFetch({
      'data/sets.json': [BLB],
      'data/drops.json': [DIVA],
      'data/decks.json': [],
    })
    render(<SetWall sets={[BLB]} total={900} base="/" />)

    const empty = await screen.findByText(/^Nothing matches/)
    expect(within(empty).getByText(MISS).tagName).toBe('STRONG')
    expect(within(empty).getByText('blb').tagName).toBe('CODE')
    expect(within(empty).getByText('Bloomburrow').tagName).toBe('CODE')
    expect(within(empty).getByText('Winter Diva').tagName).toBe('CODE')
  })

  it('stays quiet when only a drop matched, since a result is on screen', async () => {
    go('?q=diva')
    stubFetch({
      'data/sets.json': [BLB],
      'data/drops.json': [DIVA],
      'data/decks.json': [],
    })
    render(<SetWall sets={[BLB]} total={900} base="/" />)

    expect(await screen.findByRole('heading', { name: DIVA.name })).toBeTruthy()
    expect(screen.queryByText(/^Nothing matches/)).toBeNull()
  })

  it('waits for drops.json on the Secret Lair tab before saying nothing matched', async () => {
    const drops = deferred<DropSummary[]>()
    go(`?group=secret-lair&q=${MISS}`)
    stubFetch({
      'data/sets.json': [],
      'data/drops.json': drops.promise,
      'data/decks.json': [],
    })
    render(<SetWall sets={[BLB]} total={900} base="/" />)

    // Safe to read synchronously: the drops body cannot settle until it is
    // settled below, so this is the loading branch and not a race.
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByText(/^No drop matches/)).toBeNull()

    drops.settle([DIVA])

    const empty = await screen.findByText(/^No drop matches/)
    expect(within(empty).getByText(MISS).tagName).toBe('STRONG')
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it('waits for decks.json on the decks tab before saying nothing matched', async () => {
    const decks = deferred<never[]>()
    go('?group=precons')
    stubFetch({ 'data/sets.json': [], 'data/decks.json': decks.promise })
    render(<SetWall sets={[BLB]} total={900} base="/" />)

    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByText(/^Nothing matches/)).toBeNull()

    decks.settle([])

    const empty = await screen.findByText(/^Nothing matches/)
    // With no query typed, the kind filter is what the visitor chose, so it is
    // what the sentence has to name.
    expect(within(empty).getByText('all').tagName).toBe('STRONG')
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it('keeps the seeded sets on the wall when sets.json fails', async () => {
    go('?q=blb')
    stubFetch({
      'data/sets.json': new Error('offline'),
      'data/drops.json': [],
      'data/decks.json': [],
    })
    render(<SetWall sets={[BLB]} total={900} seedCount={200} base="/" />)

    // The seed is one page of a larger catalogue, so "Show more" is offered
    // until that catalogue arrives. Its removal is the settled catch.
    await waitForElementToBeRemoved(() => screen.queryByRole('button', { name: 'Show more' }))

    expect(screen.getByText(BLB.name)).toBeTruthy()
    expect(screen.queryByText(/^Nothing matches/)).toBeNull()
  })

  it('says the Secret Lair tab has no drops without quoting an empty query', async () => {
    go('?group=secret-lair')
    stubFetch({ 'data/sets.json': [], 'data/drops.json': [] })
    render(<SetWall sets={[BLB]} total={900} base="/" />)

    const empty = await screen.findByText('No drops to show.')
    expect(empty.querySelector('strong')).toBeNull()
  })

  it('says the releases tab has nothing without quoting an empty query', () => {
    stubFetch({})
    render(<SetWall sets={[]} total={0} base="/" />)

    const empty = screen.getByText('Nothing to show.')
    expect(empty.querySelector('strong')).toBeNull()
  })
})

describe('the find palette when nothing matches', () => {
  function open(): void {
    fireEvent.click(screen.getByRole('button', { name: /Find/ }))
  }

  it('offers the hint and no dialog until it is opened', () => {
    stubFetch({})
    render(<Palette base="/" />)

    expect(screen.getByRole('button', { name: /Find/ })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reports loading, not a miss, while the index is still on its way', () => {
    const index = deferred<SearchEntry[]>()
    stubFetch({ 'data/search.json': index.promise })
    render(<Palette base="/" />)
    open()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: MISS } })

    // An index that has not arrived matches nothing, which is not the same
    // thing as nothing matching.
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByText(/^Nothing matches/)).toBeNull()
  })

  it('names the query that found no product', async () => {
    stubFetch({ 'data/search.json': INDEX })
    render(<Palette base="/" />)
    open()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: MISS } })

    const empty = await screen.findByText(/^Nothing matches/)
    expect(within(empty).getByText(MISS).tagName).toBe('STRONG')
  })

  it('says nothing at all when the index is loaded and no query is typed', async () => {
    stubFetch({ 'data/search.json': INDEX })
    render(<Palette base="/" />)
    open()

    await waitForElementToBeRemoved(() => screen.queryByText('Loading…'))

    expect(screen.queryByText(/^Nothing matches/)).toBeNull()
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('settles rather than loading forever when search.json fails', async () => {
    stubFetch({ 'data/search.json': new Error('offline') })
    render(<Palette base="/" />)
    open()

    await waitForElementToBeRemoved(() => screen.queryByText('Loading…'))

    // An empty index is a settled one: it can report a miss, where a null index
    // reports loading for as long as the palette is open.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: MISS } })
    expect(screen.getByText(/^Nothing matches/)).toBeTruthy()
  })
})

describe('the card table when nothing matches', () => {
  it('says the card table has no cards without quoting an empty query', () => {
    render(<CardTable rows={[]} page={0} onPage={() => {}} />)

    const empty = screen.getByText('No cards to show.')
    expect(empty.querySelector('strong')).toBeNull()
  })
})
