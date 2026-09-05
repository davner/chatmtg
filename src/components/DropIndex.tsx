import { animated, useReducedMotion, useTrail } from '@react-spring/web'
import { useMemo, useState } from 'react'
import type { DropSummary } from '../lib/types.ts'
import { PRODUCT_SORTS, sortProducts, type ProductSort } from '../lib/sort.ts'

const CHIP = { FOIL: 'foil', NONFOIL: 'nonfoil', MIXED: 'mixed' } as const

const PAGE = 48

/**
 * 735 drops is far too many to scroll, and this page is where the wall sends
 * every Secret Lair visitor, so it carries its own lookup.
 */
export function DropIndex({ drops, base }: { drops: DropSummary[]; base: string }) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [sort, setSort] = useState<ProductSort>('newest')

  useReducedMotion()

  const q = query.trim().toLowerCase()
  const matching = useMemo(
    () => sortProducts(q ? drops.filter((d) => d.name.toLowerCase().includes(q)) : drops, sort),
    [drops, q, sort],
  )
  const shown = matching.slice(0, limit)

  const trail = useTrail(shown.length, {
    from: { opacity: 0, transform: 'translateY(8px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 280, friction: 28 },
  })

  return (
    <>
      <div className="shead">
        <h2>Drops</h2>
        <span className="count">{matching.length.toLocaleString()} drops</span>
      </div>

      <div className="controls">
        <label className="lookup" htmlFor="drop-lookup">
          <span className="field">Lookup</span>
          <input
            id="drop-lookup"
            name="drop-lookup"
            type="search"
            value={query}
            onChange={(e) => {
              setLimit(PAGE)
              setQuery(e.target.value)
            }}
            placeholder="winter diva, marvel, artist series"
            aria-label="Search Secret Lair drops by name"
          />
        </label>
        <label className="sortby">
          <span className="field">Sort</span>
          <select
            value={sort}
            onChange={(e) => {
              setLimit(PAGE)
              setSort(e.target.value as ProductSort)
            }}
            aria-label="Sort order"
          >
            {PRODUCT_SORTS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="empty">
          No drop matches <strong>{query}</strong>. Try <code>Winter Diva</code>.
        </p>
      ) : (
        <>
          <div className="droplist">
            {trail.map((style, i) => {
              const d = shown[i]!
              return (
                <animated.a
                  className="dropcard"
                  key={d.slug}
                  href={`${base}drop/${d.slug}/`}
                  style={style}
                >
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
                </animated.a>
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
