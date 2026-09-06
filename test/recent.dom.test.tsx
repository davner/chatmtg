import {
  fireEvent,
  getDefaultNormalizer,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Recent, RecordVisit } from '../src/components/Recent.tsx'
import { RECENT_KEY, type RecentEntry } from '../src/lib/recent.ts'

const BLB: RecentEntry = {
  href: '/set/blb/',
  name: 'Bloomburrow',
  kind: 'set',
  count: 1203,
  at: 1000,
}
const DIVA: RecentEntry = {
  href: '/drop/winter-diva/',
  name: 'Winter Diva',
  kind: 'drop',
  count: 6,
  at: 2000,
}
const PRECON: RecentEntry = {
  href: '/deck/blb-commander/',
  name: 'Peace Offering',
  kind: 'deck',
  at: 3000,
}

function seed(...entries: RecentEntry[]): void {
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(entries))
}

afterEach(() => {
  window.localStorage.clear()
})

describe('the recently opened strip', () => {
  it('renders nothing at all when nothing has been opened', () => {
    const { container } = render(<Recent />)
    expect(container.innerHTML).toBe('')
  })

  it('renders one card per stored entry, newest first', () => {
    seed(BLB, DIVA)
    render(<Recent />)

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(within(links[0]!).getByText('Winter Diva')).toBeTruthy()
    expect(within(links[1]!).getByText('Bloomburrow')).toBeTruthy()
  })

  it('stamps each card with the kind it is', () => {
    seed(BLB, DIVA, PRECON)
    render(<Recent />)

    const links = screen.getAllByRole('link')
    expect(within(links[0]!).getByText('Deck')).toBeTruthy()
    expect(within(links[1]!).getByText('Drop')).toBeTruthy()
    expect(within(links[2]!).getByText('Set')).toBeTruthy()
  })

  it('groups the thousands in a card count', () => {
    seed(BLB)
    render(<Recent />)
    // The separator is the runtime's to choose, so derive it rather than
    // writing one out: de_DE groups with a dot, fr_FR with a narrow no-break
    // space. That space is also why the default normalizer is off - it
    // collapses the character on the DOM side only, leaving nothing a derived
    // expectation can match.
    expect(
      screen.getByText(`${BLB.count!.toLocaleString()} cards`, {
        normalizer: getDefaultNormalizer({ collapseWhitespace: false }),
      }),
    ).toBeTruthy()
  })

  it('leaves out the count line for an entry recorded without one', () => {
    seed(PRECON)
    render(<Recent />)

    expect(screen.getByText('Peace Offering')).toBeTruthy()
    expect(screen.queryByText(/cards/)).toBeNull()
  })

  it('caps the strip at the limit it is given', () => {
    seed(BLB, DIVA, PRECON)
    render(<Recent limit={2} />)

    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.queryByText('Bloomburrow')).toBeNull()
  })

  it('clears the history and takes the strip off the page with it', () => {
    seed(BLB, DIVA)
    render(<Recent />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(window.localStorage.getItem(RECENT_KEY)).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Recently opened' })).toBeNull()
  })

  it('renders nothing when the stored value is corrupt', () => {
    window.localStorage.setItem(RECENT_KEY, '{not json')
    const { container } = render(<Recent />)
    expect(container.innerHTML).toBe('')
  })
})

describe('recording a visit', () => {
  it('renders nothing and writes the visit', () => {
    const { container } = render(
      <RecordVisit product={{ href: BLB.href, name: BLB.name, kind: BLB.kind, count: BLB.count }} />,
    )

    expect(container.innerHTML).toBe('')
    const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? 'null')
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ href: BLB.href, name: BLB.name, kind: 'set', count: 1203 })
  })

  it('records a second product without losing the first', () => {
    render(
      <>
        <RecordVisit product={{ href: BLB.href, name: BLB.name, kind: BLB.kind }} />
        <RecordVisit product={{ href: DIVA.href, name: DIVA.name, kind: DIVA.kind }} />
      </>,
    )

    const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? 'null')
    expect(stored.map((e: RecentEntry) => e.href).sort()).toEqual([DIVA.href, BLB.href].sort())
  })
})

describe('the globals the dom setup file installs', () => {
  it('lets a test stub a global and unstub it again', () => {
    vi.stubGlobal('fetch', vi.fn())
    vi.unstubAllGlobals()
    expect(() => globalThis.fetch('/data/sets/blb.json')).toThrow(/unstubbed fetch/)
  })

  // Guards the setup file's use of `Object.defineProperty` over
  // `vi.stubGlobal`: `matchMedia` stubbed there would be restored away by the
  // unstub above, and `useReducedMotion` would then throw on the next render.
  it('survives a preceding test that unstubbed every global', () => {
    seed(BLB)
    render(<Recent />)
    expect(screen.getByText('Bloomburrow')).toBeTruthy()
  })
})
