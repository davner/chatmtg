import { animated, useSpring } from '@react-spring/web'
import { useState } from 'react'
import type { DropSummary } from '../lib/types.ts'

const CHIP = { FOIL: 'foil', NONFOIL: 'nonfoil', MIXED: 'mixed' } as const

/**
 * A Secret Lair drop as a slab in its own right. A drop is the thing someone
 * buys, so it sits on the wall beside sets rather than one level underneath.
 */
export function DropTile({ drop, href }: { drop: DropSummary; href: string }) {
  const [lifted, setLifted] = useState(false)

  const lift = useSpring({
    transform: lifted ? 'translateY(-3px)' : 'translateY(0px)',
    boxShadow: lifted ? 'var(--shadow-lift)' : 'var(--shadow)',
    config: { tension: 320, friction: 26 },
  })
  const sheen = useSpring({
    backgroundPosition: lifted ? '100% 0%' : '0% 0%',
    config: { tension: 120, friction: 30 },
  })

  return (
    <animated.a
      className="slab dropslab"
      href={href}
      style={lift}
      onMouseEnter={() => setLifted(true)}
      onMouseLeave={() => setLifted(false)}
      onFocus={() => setLifted(true)}
      onBlur={() => setLifted(false)}
    >
      <animated.div className="holo" style={sheen} />
      <div className="labelbar">
        <div className="setname">{drop.name}</div>
        <div className="attrs">
          <div className="attr">
            <span className="field">Released</span>
            <span className="v">{drop.released}</span>
          </div>
          <div className="attr">
            <span className="field">Cards</span>
            <span className="v">{drop.count}</span>
          </div>
          <div className="attr">
            <span className="field">Finish</span>
            <span className="v">
              {drop.incomplete ? (
                <span className="chip struck">STRUCK</span>
              ) : (
                <span className={`chip ${CHIP[drop.finishLabel]}`}>{drop.finishLabel}</span>
              )}
            </span>
          </div>
        </div>
      </div>
      <div className="fineprint">
        <span>{drop.commanderDeck ? 'Commander deck' : 'Secret Lair drop'}</span>
        <span className="cert">SLD</span>
      </div>
    </animated.a>
  )
}
