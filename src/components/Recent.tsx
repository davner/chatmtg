import { animated, useReducedMotion, useTrail } from '@react-spring/web'
import { useEffect, useState } from 'react'
import {
  clearRecent,
  RECENT_LIMIT,
  readRecent,
  recordRecent,
  warmProductData,
  type ProductKind,
  type RecentEntry,
  type RecentProduct,
} from '../lib/recent.ts'

const KIND: Record<ProductKind, string> = { set: 'Set', drop: 'Drop', deck: 'Deck' }

/**
 * The products this browser has opened, newest first. Importing a haul means
 * several products in a row with the wall in between, and this is the thread
 * back to where that was.
 *
 * The history is only ever in localStorage, which the build cannot read, so the
 * strip is empty until it hydrates and renders nothing at all when it is.
 */
export function Recent({ limit = RECENT_LIMIT }: { limit?: number }) {
  const [entries, setEntries] = useState<RecentEntry[]>([])

  useReducedMotion()
  useEffect(() => setEntries(readRecent()), [])

  const shown = entries.slice(0, limit)
  const trail = useTrail(shown.length, {
    from: { transform: 'translateY(6px)' },
    to: { transform: 'translateY(0px)' },
    config: { tension: 280, friction: 28 },
  })

  if (!shown.length) return null

  return (
    <>
      <div className="shead recenthead">
        <h2>Recently opened</h2>
        <button
          type="button"
          className="ghost recentclear"
          onClick={() => {
            clearRecent()
            setEntries([])
          }}
        >
          Clear
        </button>
      </div>

      <ul className="recentstrip">
        {trail.map((style, i) => {
          const entry = shown[i]
          if (!entry) return null
          return (
            <li key={entry.href}>
              <animated.a
                className="dropcard recentcard"
                href={entry.href}
                style={style}
                onMouseEnter={() => warmProductData(entry.href)}
                onFocus={() => warmProductData(entry.href)}
                onTouchStart={() => warmProductData(entry.href)}
              >
                <span className="inner">
                  <span className="field">{KIND[entry.kind]}</span>
                  <span className="rname">{entry.name}</span>
                  {entry.count === undefined ? null : (
                    <span className="when">{entry.count.toLocaleString()} cards</span>
                  )}
                </span>
              </animated.a>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/**
 * Renders nothing. A product page mounts this to record that it was opened,
 * which is the only thing that ever writes the strip's history.
 */
export function RecordVisit({ product }: { product: RecentProduct }) {
  const { href, name, kind, count } = product
  useEffect(() => {
    recordRecent({ href, name, kind, count })
  }, [href, name, kind, count])
  return null
}
