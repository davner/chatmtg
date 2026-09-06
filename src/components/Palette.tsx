import { useEffect, useMemo, useRef, useState } from 'react'
import { search, type SearchEntry } from '../lib/search.ts'

const KIND_LABEL: Record<SearchEntry['kind'], string> = {
  set: 'Set',
  drop: 'Secret Lair',
  deck: 'Deck',
}

/**
 * One lookup over every product on the site. Without it a visitor has to know
 * which of three separate searches to use, and that "Ahoy Mateys" is a deck
 * inside Lorwyn Eclipsed before they can find it.
 */
export function Palette({ base }: { base: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState<SearchEntry[] | null>(null)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Opens on the two shortcuts people already try, but never while they are
  // typing into something else.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      const typing =
        el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 85 KB of index is not worth fetching for someone who never searches.
  useEffect(() => {
    if (!open || index) return
    fetch(`${base}data/search.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setIndex)
      .catch(() => setIndex([]))
  }, [open, index, base])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else setQuery('')
  }, [open])

  const results = useMemo(
    () => (index ? search(index, query, 24) : []),
    [index, query],
  )

  useEffect(() => setActive(0), [query])

  // The highlighted row has to stay on screen when the arrows move past the fold.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((n) => Math.min(n + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((n) => Math.max(n - 1, 0))
    } else if (e.key === 'Enter') {
      const hit = results[active]
      if (hit) window.location.href = `${base}${hit.entry.href}`
    }
  }

  if (!open) {
    return (
      <button className="palettehint" onClick={() => setOpen(true)}>
        <span className="field">Find</span>
        <span className="mono">/</span>
      </button>
    )
  }

  return (
    <div className="palettewrap" role="dialog" aria-modal="true" aria-label="Find a product">
      <div className="palettescrim" onClick={() => setOpen(false)} />
      <div className="palette">
        <div className="holo" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Set, drop, or deck"
          aria-label="Search every product"
          aria-controls="palette-results"
        />
        <ul className="paletteresults" id="palette-results" ref={listRef} role="listbox">
          {results.map((hit, i) => (
            <li key={hit.entry.href} role="option" aria-selected={i === active}>
              <a
                className={i === active ? 'on' : ''}
                href={`${base}${hit.entry.href}`}
                onMouseEnter={() => setActive(i)}
              >
                <span className="pk">{KIND_LABEL[hit.entry.kind]}</span>
                <span className="pn">{hit.entry.name}</span>
                <span className="ps mono">{hit.entry.sub}</span>
              </a>
            </li>
          ))}
        </ul>
        {query && index && results.length === 0 ? (
          <p className="empty" style={{ padding: '14px 16px' }}>
            Nothing matches <strong>{query}</strong>.
          </p>
        ) : null}
        {!index ? <p className="empty" style={{ padding: '14px 16px' }}>Loading…</p> : null}
      </div>
    </div>
  )
}
