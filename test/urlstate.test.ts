// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { readState, writeState } from '../src/lib/urlstate.ts'

const DEFAULTS = { q: '', group: 'releases', sort: 'newest', show: 60 }

function go(search: string) {
  window.history.replaceState(null, '', `/${search}`)
}

beforeEach(() => go(''))

describe('reading state from the url', () => {
  it('falls back to the defaults when nothing is set', () => {
    expect(readState(DEFAULTS)).toEqual(DEFAULTS)
  })

  it('reads what is there and leaves the rest alone', () => {
    go('?q=winter+diva&sort=oldest')
    expect(readState(DEFAULTS)).toEqual({
      q: 'winter diva',
      group: 'releases',
      sort: 'oldest',
      show: 60,
    })
  })

  it('keeps numeric fields numeric', () => {
    go('?show=180')
    expect(readState(DEFAULTS).show).toBe(180)
  })

  it('ignores a number that is not one, rather than yielding NaN', () => {
    go('?show=banana')
    expect(readState(DEFAULTS).show).toBe(60)
  })
})

describe('writing state to the url', () => {
  it('omits anything left at its default, so a shared link carries only choices', () => {
    writeState({ ...DEFAULTS, sort: 'oldest' }, DEFAULTS)
    expect(window.location.search).toBe('?sort=oldest')
  })

  it('writes nothing at all when everything is default', () => {
    writeState(DEFAULTS, DEFAULTS)
    expect(window.location.search).toBe('')
  })

  it('drops a value once it returns to its default', () => {
    writeState({ ...DEFAULTS, q: 'miku' }, DEFAULTS)
    expect(window.location.search).toBe('?q=miku')
    writeState(DEFAULTS, DEFAULTS)
    expect(window.location.search).toBe('')
  })

  it('preserves query keys it does not own', () => {
    go('?utm_source=reddit')
    writeState({ ...DEFAULTS, q: 'miku' }, DEFAULTS)
    expect(window.location.search).toContain('utm_source=reddit')
    expect(window.location.search).toContain('q=miku')
  })

  it('round-trips through read', () => {
    const state = { ...DEFAULTS, q: 'ahoy', group: 'precons', sort: 'name', show: 120 }
    writeState(state, DEFAULTS)
    expect(readState(DEFAULTS)).toEqual(state)
  })
})
