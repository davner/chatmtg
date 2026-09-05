import { animated, useSpring } from '@react-spring/web'

/**
 * A placeholder that holds the shape of what is coming, so the page does not
 * jump when it lands. The pulse is a spring rather than a CSS animation so it
 * stops with everything else under reduced motion, which the islands set
 * globally via useReducedMotion.
 */
export function Skeleton({ rows = 8, label = 'Loading' }: { rows?: number; label?: string }) {
  const pulse = useSpring({
    from: { opacity: 0.45 },
    to: { opacity: 0.85 },
    loop: { reverse: true },
    config: { duration: 900 },
  })

  return (
    <div className="panelbox skeleton" role="status" aria-live="polite">
      <div className="holo" />
      <span className="srstatus">{label}</span>
      <div className="skelhead">
        <animated.span className="skelbar wide" style={pulse} />
      </div>
      <ul className="skelrows">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i}>
            <animated.span className="skelbar qty" style={pulse} />
            <animated.span
              className="skelbar name"
              style={{ ...pulse, width: `${52 + ((i * 13) % 34)}%` }}
            />
            <animated.span className="skelbar tag" style={pulse} />
          </li>
        ))}
      </ul>
    </div>
  )
}
