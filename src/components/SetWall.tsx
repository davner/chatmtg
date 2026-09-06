import { animated, useReducedMotion, useTrail } from '@react-spring/web'
import { useEffect, useMemo, useState } from 'react'
import { SlabTile, type TileData } from './SlabTile.tsx'
import { DropTile } from './DropTile.tsx'
import type { DeckSummary, DropSummary } from '../lib/types.ts'
import { PRODUCT_SORTS, sortProducts, type ProductSort } from '../lib/sort.ts'
import { readState, writeState } from '../lib/urlstate.ts'

/**
 * Scryfall's 24 set types are too fine-grained to pick from. These groupings are
 * how a collector describes what they bought.
 */
const GROUPS: { id: string; label: string; types?: string[]; drops?: boolean; precons?: boolean }[] = [
  { id: 'releases', label: 'Releases', types: ['expansion', 'core', 'masters', 'draft_innovation', 'commander', 'starter'] },
  { id: 'secret-lair', label: 'Secret Lair', drops: true },
  { id: 'boxsets', label: 'Box sets', types: ['duel_deck', 'from_the_vault', 'premium_deck', 'spellbook', 'arsenal', 'planechase', 'archenemy'] },
  { id: 'promos', label: 'Promos & tokens', types: ['promo', 'token', 'memorabilia', 'masterpiece'] },
  { id: 'precons', label: 'Decks & packs', precons: true },
  { id: 'all', label: 'Everything' },
]

const CHIP = { FOIL: 'foil', NONFOIL: 'nonfoil', MIXED: 'mixed' } as const

const PAGE = 60

const DEFAULTS = {
  q: '',
  group: 'releases',
  sort: 'newest',
  kind: 'all',
  view: 'tiles',
  show: PAGE,
}

export function SetWall({
  sets: seed,
  total,
  seedCount,
  base,
  hrefFor,
  searchDrops = true,
  presetDrops,
}: {
  /** The first screenful, server-rendered. The rest arrives on demand. */
  sets: TileData[]
  total?: number
  /** How many sets the seeded view really holds, before the rest is fetched. */
  seedCount?: number
  base: string
  hrefFor?: (set: TileData) => string
  searchDrops?: boolean
  /** Preloaded drops, for a page that cannot fetch. */
  presetDrops?: DropSummary[]
}) {
  const [all, setAll] = useState<TileData[] | null>(null)
  const sets = all ?? seed

  // The wall hides digital-only sets until they are searched for, so the
  // denominator counts the same population the masthead does. Two different
  // set totals on one screen is the page arguing with itself. The server knows
  // it up front; the seed alone would undercount.
  const paperTotal = useMemo(
    () => total ?? sets.filter((s) => !s.digital).length,
    [total, sets],
  )
  // Seeded from the query string so a shared or reloaded link opens on the same
  // view it was copied from.
  const initial = readState(DEFAULTS)
  const [query, setQuery] = useState(initial.q)
  const [group, setGroup] = useState(initial.group)
  const [limit, setLimit] = useState(initial.show)
  const [view, setView] = useState(initial.view)
  const [sort, setSort] = useState<ProductSort>(initial.sort as ProductSort)
  const [drops, setDrops] = useState<DropSummary[] | null>(presetDrops ?? null)
  const [decks, setDecks] = useState<DeckSummary[] | null>(null)
  const [kind, setKind] = useState(initial.kind)

  useReducedMotion()

  useEffect(() => {
    writeState({ q: query, group, sort, kind, view, show: limit }, DEFAULTS)
  }, [query, group, sort, kind, view, limit])

  const q = query.trim().toLowerCase()

  // The full catalogue is only needed once someone searches, filters, or asks
  // for more than the first page.
  const needAll = Boolean(q) || group !== 'releases' || limit > PAGE || sort !== 'newest'
  useEffect(() => {
    if (!needAll || all) return
    fetch(`${base}data/sets.json`)
      .then((r) => (r.ok ? r.json() : seed))
      .then(setAll)
      .catch(() => setAll(seed))
  }, [needAll, all, base, seed])

  const dropsTab = GROUPS.find((g) => g.id === group)?.drops === true
  const preconTab = GROUPS.find((g) => g.id === group)?.precons === true

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
    if (!searchDrops || decks || (!q && !preconTab)) return
    fetch(`${base}data/decks.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setDecks)
      .catch(() => setDecks([]))
  }, [q, decks, base, searchDrops, preconTab])

  const deckHits = useMemo(() => {
    if (!decks) return []
    if (preconTab) {
      return decks.filter(
        (d) => (kind === 'all' || d.kind === kind) && (!q || d.name.toLowerCase().includes(q)),
      )
    }
    return q ? decks.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 24) : []
  }, [decks, q, preconTab, kind])

  // MTGJSON names 46 product types. Listing them by frequency puts the ones
  // people actually buy at the top of the menu.
  const kinds = useMemo(() => {
    const tally = new Map<string, number>()
    for (const d of decks ?? []) tally.set(d.kind, (tally.get(d.kind) ?? 0) + 1)
    return [...tally].sort((a, b) => b[1] - a[1])
  }, [decks])

  const shownDecks = preconTab ? deckHits.slice(0, limit) : deckHits

  const matching = useMemo(() => {
    if (dropsTab || preconTab) return []
    const types = GROUPS.find((g) => g.id === group)?.types
    return sets.filter((s) => {
      // Digital-only sets cannot be bought as cards, so they stay out unless searched for.
      if (s.digital && !q) return false
      if (types && !types.includes(s.type)) return false
      if (!q) return true
      return s.name.toLowerCase().includes(q) || s.code.includes(q)
    })
  }, [sets, q, group, dropsTab, preconTab])

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
    from: { transform: 'translateY(10px)' },
    to: { transform: 'translateY(0px)' },
    config: { tension: 260, friction: 28 },
  })

  const shown = ordered.slice(0, limit)

  const trail = useTrail(shown.length, {
    from: { transform: 'translateY(10px)' },
    to: { transform: 'translateY(0px)' },
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
          {preconTab
            ? `${deckHits.length.toLocaleString()} products`
            : dropsTab
            ? `${dropHits.length.toLocaleString()} drops`
            : matching.length === 0 && (dropHits.length || deckHits.length)
              ? `${dropHits.length + deckHits.length} products`
              : // While seeded, the seed's length is a page, not a total.
                `${(all || q || group !== 'releases'
                  ? matching.length
                  : (seedCount ?? paperTotal)
                ).toLocaleString()} sets`}
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
        {preconTab && kinds.length > 1 ? (
          <label className="sortby">
            <span className="field">Kind</span>
            <select
              value={kind}
              onChange={(e) => change(() => setKind(e.target.value))}
              aria-label="Filter by product kind"
            >
              <option value="all">All kinds</option>
              {kinds.map(([k, n]) => (
                <option key={k} value={k}>
                  {k} ({n})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="viewswitch">
          <span className="field" id="viewswitch-name">
            View
          </span>
          <div className="switchshell" role="group" aria-labelledby="viewswitch-name">
            <button
              type="button"
              className={`viewseg${view === 'tiles' ? ' on' : ''}`}
              aria-pressed={view === 'tiles'}
              onClick={() => setView('tiles')}
            >
              Tiles
            </button>
            <button
              type="button"
              className={`viewseg${view === 'table' ? ' on' : ''}`}
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              Table
            </button>
          </div>
        </div>
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
            {query ? (
              <>
                No drop matches <strong>{query}</strong>. Try <code>Winter Diva</code>.
              </>
            ) : (
              'No drops to show.'
            )}
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

      {preconTab ? (
        decks === null ? (
          <p className="empty">Loading…</p>
        ) : shownDecks.length === 0 ? (
          <p className="empty">
            Nothing matches <strong>{query || kind}</strong>.
          </p>
        ) : (
          <>
            <div className="droplist">
              {shownDecks.map((d) => (
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
            {shownDecks.length < deckHits.length ? (
              <div className="more">
                <button onClick={() => setLimit((n) => n + PAGE)}>Show more</button>
              </div>
            ) : null}
          </>
        )
      ) : null}

      {!dropsTab && !preconTab && deckHits.length > 0 && (
        <div className="dropband">
          <p className="field">Decks and packs</p>
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

      {dropsTab || preconTab ? null : shown.length === 0 ? (
        dropHits.length === 0 && deckHits.length === 0 ? (
          <p className="empty">
            {query ? (
              <>
                Nothing matches <strong>{query}</strong>. Try <code>blb</code>,{' '}
                <code>Bloomburrow</code>, or <code>Winter Diva</code>.
              </>
            ) : (
              'Nothing to show.'
            )}
          </p>
        ) : null
      ) : (
        <>
          {view === 'table' ? (
            <div className="catalogue">
              <table>
                <thead>
                  <tr>
                    <th>Set</th>
                    <th>Code</th>
                    <th>Year</th>
                    <th className="right">Cards</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((set) => (
                    <tr key={set.code}>
                      <td>
                        <a href={hrefFor ? hrefFor(set) : `${base}set/${set.code}/`}>{set.name}</a>
                      </td>
                      <td className="mono">{set.code.toUpperCase()}</td>
                      <td className="mono">{set.released.slice(0, 4) || '—'}</td>
                      <td className="mono right">{set.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
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
          )}
          {shown.length < (all ? matching.length : (seedCount ?? matching.length)) ? (
            <div className="more">
              <button onClick={() => setLimit((n) => n + PAGE)}>Show more</button>
            </div>
          ) : null}
        </>
      )}
    </>
  )
}
