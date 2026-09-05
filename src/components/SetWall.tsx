import { animated, useReducedMotion, useTrail } from '@react-spring/web'
import { useEffect, useMemo, useState } from 'react'
import { SlabTile, type TileData } from './SlabTile.tsx'
import { DropTile } from './DropTile.tsx'
import type { DeckSummary, DropSummary } from '../lib/types.ts'
import { PRODUCT_SORTS, sortProducts, type ProductSort } from '../lib/sort.ts'

/**
 * Scryfall's 24 set types are too fine-grained to pick from. These groupings are
 * how a collector describes what they bought.
 */
const GROUPS: { id: string; label: string; types?: string[]; drops?: boolean }[] = [
  { id: 'releases', label: 'Releases', types: ['expansion', 'core', 'masters', 'draft_innovation', 'commander', 'starter'] },
  { id: 'secret-lair', label: 'Secret Lair', drops: true },
  { id: 'decks', label: 'Decks & boxes', types: ['duel_deck', 'from_the_vault', 'premium_deck', 'spellbook', 'arsenal', 'planechase', 'archenemy'] },
  { id: 'promos', label: 'Promos & tokens', types: ['promo', 'token', 'memorabilia', 'masterpiece'] },
  { id: 'all', label: 'Everything' },
]

const CHIP = { FOIL: 'foil', NONFOIL: 'nonfoil', MIXED: 'mixed' } as const

const PAGE = 60

export function SetWall({
  sets,
  base,
  hrefFor,
  searchDrops = true,
  presetDrops,
}: {
  sets: TileData[]
  base: string
  hrefFor?: (set: TileData) => string
  searchDrops?: boolean
  /** Preloaded drops, for a page that cannot fetch. */
  presetDrops?: DropSummary[]
}) {
  // The wall hides digital-only sets until they are searched for, so the
  // denominator counts the same population the masthead does. Two different
  // set totals on one screen is the page arguing with itself.
  const paperTotal = useMemo(() => sets.filter((s) => !s.digital).length, [sets])
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('releases')
  const [limit, setLimit] = useState(PAGE)
  const [sort, setSort] = useState<ProductSort>('newest')
  const [drops, setDrops] = useState<DropSummary[] | null>(presetDrops ?? null)
  const [decks, setDecks] = useState<DeckSummary[] | null>(null)

  useReducedMotion()

  const q = query.trim().toLowerCase()

  const dropsTab = GROUPS.find((g) => g.id === group)?.drops === true

  // People search for the name printed on the box — "Winter Diva", not "SLD".
  // Those are drops inside one set, so the lookup has to reach past sets.
  useEffect(() => {
    if (!searchDrops || drops || (!q && !dropsTab)) return
    fetch(`${base}data/drops.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setDrops)
      .catch(() => setDrops([]))
  }, [q, drops, base, searchDrops, dropsTab])

  // Precon decks are products people buy by name, so the lookup reaches them.
  useEffect(() => {
    if (!searchDrops || decks || !q) return
    fetch(`${base}data/decks.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setDecks)
      .catch(() => setDecks([]))
  }, [q, decks, base, searchDrops])

  const deckHits = useMemo(
    () => (q && decks ? decks.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 24) : []),
    [decks, q],
  )

  const matching = useMemo(() => {
    if (dropsTab) return []
    const types = GROUPS.find((g) => g.id === group)?.types
    return sets.filter((s) => {
      // Digital-only sets cannot be bought as cards, so they stay out unless searched for.
      if (s.digital && !q) return false
      if (types && !types.includes(s.type)) return false
      if (!q) return true
      return s.name.toLowerCase().includes(q) || s.code.includes(q)
    })
  }, [sets, q, group, dropsTab])

  const ordered = useMemo(
    // Sets carry no card-count-free date of their own, so they sort on the same
    // three fields products do.
    () => sortProducts(matching.map((s) => ({ ...s, released: s.released || '0000-00-00' })), sort),
    [matching, sort],
  )

  const dropHits = useMemo(() => {
    if (!drops) return []
    if (dropsTab) return q ? drops.filter((d) => d.name.toLowerCase().includes(q)) : drops
    return q ? drops.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 24) : []
  }, [drops, q, dropsTab])

  const orderedDrops = useMemo(() => sortProducts(dropHits, sort), [dropHits, sort])

  // On the drops tab the drops are the wall, so they page like sets do.
  const shownDrops = dropsTab ? orderedDrops.slice(0, limit) : orderedDrops

  const dropTrail = useTrail(dropsTab ? shownDrops.length : 0, {
    from: { opacity: 0, transform: 'translateY(10px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 260, friction: 28 },
  })

  const shown = ordered.slice(0, limit)

  const trail = useTrail(shown.length, {
    from: { opacity: 0, transform: 'translateY(10px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 260, friction: 28 },
  })

  function change(next: () => void) {
    setLimit(PAGE)
    next()
  }

  return (
    <>
      <div className="shead">
        <h2>The Wall</h2>
        <span className="count">
          {dropsTab
            ? `${dropHits.length.toLocaleString()} drops`
            : matching.length === 0 && (dropHits.length || deckHits.length)
              ? `${dropHits.length + deckHits.length} products`
              : `${matching.length.toLocaleString()} sets`}
          {!dropsTab && matching.length > 0 && dropHits.length ? ` · ${dropHits.length} drops` : ''}
        </span>
      </div>

      <div className="controls">
        <label className="lookup" htmlFor="wall-lookup">
          <span className="field">Lookup</span>
          <input
            id="wall-lookup"
            name="lookup"
            type="search"
            value={query}
            onChange={(e) => change(() => setQuery(e.target.value))}
            placeholder={dropsTab ? 'winter diva, marvel, artist series' : 'bloomburrow, blb, winter diva'}
            aria-label="Search sets and Secret Lair drops by name or code"
          />
        </label>
        <label className="sortby">
          <span className="field">Sort</span>
          <select
            value={sort}
            onChange={(e) => change(() => setSort(e.target.value as ProductSort))}
            aria-label="Sort order"
          >
            {PRODUCT_SORTS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="groups" role="group" aria-label="Filter sets by kind">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              className={`grouptab${g.id === group ? ' on' : ''}`}
              aria-pressed={g.id === group}
              onClick={() => change(() => setGroup(g.id))}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {dropsTab ? (
        drops === null ? (
          <p className="empty">Loading…</p>
        ) : shownDrops.length === 0 ? (
          <p className="empty">
            No drop matches <strong>{query}</strong>. Try <code>Winter Diva</code>.
          </p>
        ) : (
          <>
            <div className="wall">
              {dropTrail.map((style, i) => {
                const d = shownDrops[i]!
                return (
                  <animated.div key={d.slug} style={style}>
                    <DropTile drop={d} href={`${base}drop/${d.slug}/`} />
                  </animated.div>
                )
              })}
            </div>
            {shownDrops.length < dropHits.length ? (
              <div className="more">
                <button onClick={() => setLimit((n) => n + PAGE)}>
                  Show {Math.min(PAGE, dropHits.length - shownDrops.length)} more
                </button>
              </div>
            ) : null}
          </>
        )
      ) : null}

      {!dropsTab && deckHits.length > 0 && (
        <div className="dropband">
          <p className="field">Decks and boxes</p>
          <div className="droplist">
            {deckHits.map((d) => (
              <a className="dropcard" key={d.slug} href={`${base}deck/${d.slug}/`}>
                <div className="holo" />
                {d.art ? (
                  <div className="window">
                    <img src={d.art} alt={`Art from ${d.name}`} loading="lazy" />
                    <div className="gloss" />
                  </div>
                ) : null}
                <div className="inner">
                  <h3>{d.name}</h3>
                  <div className="row">
                    <span className="when">
                      {d.setCode.toUpperCase()} · {d.kind} · {d.count} cards
                      {d.artist ? ` · Art: ${d.artist}` : ''}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {!dropsTab && dropHits.length > 0 && (
        <div className="dropband">
          <p className="field">Secret Lair drops</p>
          <div className="droplist">
            {dropHits.map((d) => (
              <a className="dropcard" key={d.slug} href={`${base}drop/${d.slug}/`}>
                <div className="holo" />
                {d.art ? (
                  <div className="window">
                    <img src={d.art} alt={`Art from ${d.name}`} loading="lazy" />
                    <div className="gloss" />
                  </div>
                ) : null}
                <div className="inner">
                  <h3>{d.name}</h3>
                  <div className="row">
                    <span className="when">
                      {d.released} · {d.count} cards
                      {d.artist ? ` · Art: ${d.artist}` : ''}
                    </span>
                    {d.incomplete ? (
                      <span className="chip struck">STRUCK</span>
                    ) : (
                      <span className={`chip ${CHIP[d.finishLabel]}`}>{d.finishLabel}</span>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {dropsTab ? null : shown.length === 0 ? (
        dropHits.length === 0 && deckHits.length === 0 ? (
          <p className="empty">
            Nothing matches <strong>{query}</strong>. Try <code>blb</code>,{' '}
            <code>Bloomburrow</code>, or <code>Winter Diva</code>.
          </p>
        ) : null
      ) : (
        <>
          <div className="wall">
            {trail.map((style, i) => {
              const set = shown[i]!
              return (
                <animated.div key={set.code} style={style}>
                  <SlabTile
                    set={set}
                    href={hrefFor ? hrefFor(set) : `${base}set/${set.code}/`}
                    iconUrl={`${base}icons/${set.icon}`}
                  />
                </animated.div>
              )
            })}
          </div>
          {shown.length < matching.length ? (
            <div className="more">
              <button onClick={() => setLimit((n) => n + PAGE)}>
                Show {Math.min(PAGE, matching.length - shown.length)} more
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  )
}
