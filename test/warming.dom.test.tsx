import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DropTile } from '../src/components/DropTile.tsx'
import { Recent } from '../src/components/Recent.tsx'
import { SlabTile } from '../src/components/SlabTile.tsx'
import { RECENT_KEY, warmProductData, type RecentEntry } from '../src/lib/recent.ts'
import type { DropSummary, SetSummary } from '../src/lib/types.ts'

// The components below import `warmProductData` statically, and a static
// binding stays bound to the module instance it was linked against: resetting
// the registry and re-importing yields a second copy that nothing on screen
// calls. `vi.mock` is hoisted above those imports and rewrites the specifier
// for every importer, which is what reaches a binding already linked.
//
// Only the one function is replaced: `Recent` reads its history through the
// real `readRecent`, so a wholesale mock leaves the strip with nothing to draw.
vi.mock('../src/lib/recent.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/recent.ts')>()),
  warmProductData: vi.fn(),
}))

const warm = vi.mocked(warmProductData)

const BLB: SetSummary = {
  code: 'blb',
  sid: '0b0b0b0b-1111-2222-3333-444444444444',
  name: 'Bloomburrow',
  type: 'expansion',
  released: '2024-08-02',
  count: 1203,
  digital: false,
  icon: 'blb.svg',
}
const DSK: SetSummary = {
  code: 'dsk',
  sid: '0d0d0d0d-5555-6666-7777-888888888888',
  name: 'Duskmourn',
  type: 'expansion',
  released: '2024-09-27',
  count: 1052,
  digital: false,
  icon: 'dsk.svg',
}

const DIVA: DropSummary = {
  slug: 'winter-diva',
  name: 'Winter Diva',
  released: '2023-12-04',
  count: 6,
  allFoil: true,
  finishLabel: 'FOIL',
}
const BOOKS: DropSummary = {
  slug: 'read-the-fine-print',
  name: 'Read The Fine Print',
  released: '2024-02-19',
  count: 4,
  allFoil: false,
  finishLabel: 'NONFOIL',
}

const BLB_RECENT: RecentEntry = {
  href: '/set/blb/',
  name: 'Bloomburrow',
  kind: 'set',
  count: 1203,
  at: 1000,
}
const DIVA_RECENT: RecentEntry = {
  href: '/drop/winter-diva/',
  name: 'Winter Diva',
  kind: 'drop',
  count: 6,
  at: 2000,
}

function seed(...entries: RecentEntry[]): void {
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(entries))
}

/**
 * The anchor wrapping a product's name. Every case renders two products, so a
 * handler wired to the wrong href fails rather than matching the only one on
 * screen.
 */
function linkFor(name: string): HTMLAnchorElement {
  const link = screen.getByText(name).closest('a')
  if (!link) throw new Error(`no link wraps ${name}`)
  return link
}

beforeEach(() => {
  warm.mockClear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('a set tile on the wall', () => {
  function wall() {
    render(
      <>
        <SlabTile set={BLB} href="/set/blb/" />
        <SlabTile set={DSK} href="/set/dsk/" />
      </>,
    )
  }

  it('warms its own card list when the cursor enters it', () => {
    wall()
    fireEvent.mouseEnter(linkFor('Duskmourn'))
    expect(warm.mock.calls).toEqual([['/set/dsk/']])
  })

  it('warms its own card list when it takes focus', () => {
    wall()
    fireEvent.focus(linkFor('Duskmourn'))
    expect(warm.mock.calls).toEqual([['/set/dsk/']])
  })

  it('warms its own card list when a finger lands on it', () => {
    wall()
    fireEvent.touchStart(linkFor('Duskmourn'))
    expect(warm.mock.calls).toEqual([['/set/dsk/']])
  })

  it('does not warm again when the cursor leaves it', () => {
    wall()
    const tile = linkFor('Duskmourn')
    fireEvent.mouseEnter(tile)
    warm.mockClear()

    fireEvent.mouseLeave(tile)

    expect(warm.mock.calls).toEqual([])
  })

  it('does not warm again when it loses focus', () => {
    wall()
    const tile = linkFor('Duskmourn')
    fireEvent.focus(tile)
    warm.mockClear()

    fireEvent.blur(tile)

    expect(warm.mock.calls).toEqual([])
  })
})

describe('a drop tile on the wall', () => {
  function wall() {
    render(
      <>
        <DropTile drop={DIVA} href="/drop/winter-diva/" />
        <DropTile drop={BOOKS} href="/drop/read-the-fine-print/" />
      </>,
    )
  }

  it('warms its own card list when the cursor enters it', () => {
    wall()
    fireEvent.mouseEnter(linkFor('Read The Fine Print'))
    expect(warm.mock.calls).toEqual([['/drop/read-the-fine-print/']])
  })

  it('warms its own card list when it takes focus', () => {
    wall()
    fireEvent.focus(linkFor('Read The Fine Print'))
    expect(warm.mock.calls).toEqual([['/drop/read-the-fine-print/']])
  })

  it('warms its own card list when a finger lands on it', () => {
    wall()
    fireEvent.touchStart(linkFor('Read The Fine Print'))
    expect(warm.mock.calls).toEqual([['/drop/read-the-fine-print/']])
  })

  it('does not warm again when the cursor leaves it', () => {
    wall()
    const tile = linkFor('Read The Fine Print')
    fireEvent.mouseEnter(tile)
    warm.mockClear()

    fireEvent.mouseLeave(tile)

    expect(warm.mock.calls).toEqual([])
  })

  it('does not warm again when it loses focus', () => {
    wall()
    const tile = linkFor('Read The Fine Print')
    fireEvent.focus(tile)
    warm.mockClear()

    fireEvent.blur(tile)

    expect(warm.mock.calls).toEqual([])
  })
})

describe('a card in the recently opened strip', () => {
  function strip() {
    seed(BLB_RECENT, DIVA_RECENT)
    render(<Recent />)
  }

  it('warms its own card list when the cursor enters it', () => {
    strip()
    fireEvent.mouseEnter(linkFor('Bloomburrow'))
    expect(warm.mock.calls).toEqual([['/set/blb/']])
  })

  it('warms its own card list when it takes focus', () => {
    strip()
    fireEvent.focus(linkFor('Bloomburrow'))
    expect(warm.mock.calls).toEqual([['/set/blb/']])
  })

  it('warms its own card list when a finger lands on it', () => {
    strip()
    fireEvent.touchStart(linkFor('Bloomburrow'))
    expect(warm.mock.calls).toEqual([['/set/blb/']])
  })

  // A strip card carries no lift to drop, so leaving and blurring it have
  // nothing to do at all. These pin that absence: the cheapest regression here
  // is a warm call following the tiles' shape onto an anchor that never wanted
  // one.
  it('does not warm again when the cursor leaves it', () => {
    strip()
    const card = linkFor('Bloomburrow')
    fireEvent.mouseEnter(card)
    warm.mockClear()

    fireEvent.mouseLeave(card)

    expect(warm.mock.calls).toEqual([])
  })

  it('does not warm again when it loses focus', () => {
    strip()
    const card = linkFor('Bloomburrow')
    fireEvent.focus(card)
    warm.mockClear()

    fireEvent.blur(card)

    expect(warm.mock.calls).toEqual([])
  })
})
