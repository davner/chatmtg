import { animated, useSpring } from '@react-spring/web'
import { useState } from 'react'
import { warmProductData } from '../lib/recent.ts'
import type { SetSummary } from '../lib/types.ts'

export interface TileData extends SetSummary {
  /** Base64 JPEG, used where the page must be self-contained. */
  art64?: string
  /** Inline SVG markup, used where the icon file cannot be fetched. */
  iconSvg?: string
}

/**
 * The stamp's ink names what kind of product the set is, matching the filter
 * tabs. Keying it to card count would colour it by nothing a collector cares
 * about.
 */
const RELEASE_TYPES = new Set([
  'expansion', 'core', 'masters', 'draft_innovation', 'commander', 'starter',
])

function stampClass(type: string): string {
  if (type === 'box') return 'mythic'
  if (RELEASE_TYPES.has(type)) return 'rare'
  return ''
}

export function SlabTile({
  set,
  href,
  iconUrl,
}: {
  set: TileData
  href: string
  iconUrl?: string
}) {
  const [lifted, setLifted] = useState(false)

  // A slab lifts off the lightbox and its authentication strip catches the light.
  const lift = useSpring({
    transform: lifted ? 'translateY(-3px)' : 'translateY(0px)',
    boxShadow: lifted ? 'var(--shadow-lift)' : 'var(--shadow)',
    config: { tension: 320, friction: 26 },
  })
  const sheen = useSpring({
    backgroundPosition: lifted ? '100% 0%' : '0% 0%',
    config: { tension: 120, friction: 30 },
  })

  const art = set.art64 ? `data:image/jpeg;base64,${set.art64}` : set.art

  return (
    <animated.a
      className="slab"
      href={href}
      style={lift}
      onMouseEnter={() => {
        setLifted(true)
        warmProductData(href)
      }}
      onMouseLeave={() => setLifted(false)}
      onFocus={() => {
        setLifted(true)
        warmProductData(href)
      }}
      onBlur={() => setLifted(false)}
      onTouchStart={() => warmProductData(href)}
    >
      <animated.div className="holo" style={sheen} />
      <div className="labelbar">
        <div className="setname">{set.name}</div>
        <div className="attrs">
          <div className="attr">
            <span className="field">Code</span>
            <span className="v">{set.code.toUpperCase()}</span>
          </div>
          <div className="attr">
            <span className="field">Year</span>
            <span className="v">{set.released.slice(0, 4) || '—'}</span>
          </div>
          <div className="attr">
            <span className="field">Cards</span>
            <span className="v">{set.count.toLocaleString()}</span>
          </div>
        </div>
      </div>
      <div className="window">
        {art ? <img src={art} alt={`Art from ${set.name}`} loading="lazy" /> : null}
        <div className="gloss" />
        <div className={`symbol ${stampClass(set.type)}`} aria-hidden="true">
          {set.iconSvg ? (
            <span className="symbolsvg" dangerouslySetInnerHTML={{ __html: set.iconSvg }} />
          ) : iconUrl ? (
            // Masked rather than an <img>, so the stamp takes the ink of its kind.
            <span className="symbolmask" style={{ ['--icon' as string]: `url("${iconUrl}")` }} />
          ) : null}
        </div>
      </div>
      <div className="fineprint">
        <span>Art: {set.artist ?? 'uncredited'}</span>
        <span className="cert">{set.sid.slice(0, 8).toUpperCase()}</span>
      </div>
    </animated.a>
  )
}
