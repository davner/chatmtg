import { animated, useReducedMotion, useTrail } from '@react-spring/web'
import { useEffect, useMemo, useState } from 'react'
import { SlabTile, type TileData } from './SlabTile.tsx'
import { DropTile } from './DropTile.tsx'
import type { DropSummary } from '../lib/types.ts'

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
  const [drops, setDrops] = useState<DropSummary[] | null>(presetDrops ?? null)

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

  const dropHits = useMemo(() => {
    if (!drops) return []
    if (dropsTab) return q ? drops.filter((d) => d.name.toLowerCase().includes(q)) : drops
    return q ? drops.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 24) : []
  }, [drops, q, dropsTab])

  // On the drops tab the drops are the wall, so they page like sets do.
  const shownDrops = dropsTab ? dropHits.slice(0, limit) : dropHits

  const dropTrail = useTrail(dropsTab ? shownDrops.length : 0, {
    from: { opacity: 0, transform: 'translateY(10px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 260, friction: 28 },
  })

  const shown = matching.slice(0, limit)

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
            ? `${dropHits.length.toLocaleString()} Secret Lair products${
                shownDrops.length < dropHits.length ? ` · showing ${shownDrops.length}` : ''
              }`
            : matching.length === 0 && dropHits.length > 0
              ? `${dropHits.length} Secret Lair drop${dropHits.length > 1 ? 's' : ''}`
              : `${matching.length.toLocaleString()} of ${paperTotal.toLocaleString()} paper sets`}
          {!dropsTab && matching.length > 0 && dropHits.length ? ` · ${dropHits.length} drops` : ''}
          {!dropsTab && shown.length < matching.length ? ` · showing ${shown.length}` : ''}
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
          <p className="empty">Reading the drop list…</p>
        ) : shownDrops.length === 0 ? (
          <p className="empty">
            No Secret Lair matches <strong>{query}</strong>. Drop names are the name on the
            box, like <code>Winter Diva</code> or <code>Marvel: Dan Hipp</code>.
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

      {!dropsTab && dropHits.length > 0 && (
        <div className="dropband">
          <p className="field">Secret Lair drops matching “{query.trim()}”</p>
          <div className="droplist">
            {dropHits.map((d) => (
              <a className="dropcard" key={d.slug} href={`${base}drop/${d.slug}/`}>
                <div className="holo" />
                <div className="inner">
                  <h3>{d.name}</h3>
                  <div className="row">
                    <span className="when">
                      {d.released} · {d.count} cards
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
        dropHits.length === 0 ? (
          <p className="empty">
            Nothing matches <strong>{query || GROUPS.find((g) => g.id === group)?.label}</strong>.
            Try a set code like <code>blb</code>, a set name like <code>Bloomburrow</code>, or a
            Secret Lair drop like <code>Winter Diva</code>.
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
