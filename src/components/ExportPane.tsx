import { animated, useReducedMotion, useSpring, useTransition } from '@react-spring/web'
import { useState } from 'react'
import type { RenderedFormat } from '../lib/export/render.ts'

export type { RenderedFormat }

export function ExportPane({
  formats,
  filename,
  downloadable = true,
  downloadNote,
}: {
  formats: RenderedFormat[]
  filename: string
  /** False where the host blocks saving, so no control promises what it cannot do. */
  downloadable?: boolean
  downloadNote?: string
}) {
  const [index, setIndex] = useState(0)
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle')
  const current = formats[index]!

  useReducedMotion()

  // The proof is read before it commits, so a switch crosses one sheet over
  // another rather than blanking the pane.
  const sheets = useTransition(index, {
    from: { opacity: 0, transform: 'translateY(6px)' },
    enter: { opacity: 1, transform: 'translateY(0px)' },
    leave: { opacity: 0, transform: 'translateY(-6px)' },
    exitBeforeEnter: false,
    config: { tension: 300, friction: 30 },
  })

  const confirm = useSpring({
    scale: copyState === 'done' ? 1.04 : 1,
    config: { tension: 420, friction: 14 },
  })

  async function copy() {
    try {
      await navigator.clipboard.writeText(current.body)
      setCopyState('done')
    } catch {
      // A refused clipboard has to say so: the text is on screen to select by hand.
      setCopyState('failed')
    }
    setTimeout(() => setCopyState('idle'), 2200)
  }

  function download() {
    const blob = new Blob([current.body], {
      type: current.ext === 'csv' ? 'text/csv' : 'text/plain',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.${current.ext}`
    // Anchored in the document and revoked a tick later: Safari and Firefox abort
    // a download whose blob URL is released in the same task as the click.
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      a.remove()
      URL.revokeObjectURL(url)
    }, 0)
  }

  const proven = current.confidence === 'round-tripped'
  const documented = proven || current.confidence === 'documented'

  return (
    <div className="panelbox">
      <div className="holo" />
      <div className="proofhead">
        <span className="field">Export</span>
        <select
          id="export-format"
          name="export-format"
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-label="Export format"
        >
          {formats.map((f, i) => (
            <option key={f.id} value={i}>
              {f.label} · {f.ext.toUpperCase()}
            </option>
          ))}
        </select>
        <span className={`badge ${documented ? 'proven' : 'unproven'}`}>
          {proven ? 'IMPORT VERIFIED' : documented ? 'DOCUMENTED' : 'HEADER ONLY'}
        </span>
      </div>
      <div className="proofstage">
        {sheets((style, i) => (
          <animated.pre className="proof" style={style}>
            {formats[i]!.body}
          </animated.pre>
        ))}
      </div>
      {/* Announced instead of the proof body: a screen reader reading 5584 CSV
          rows aloud on every format change is unusable. */}
      <p className="srstatus" role="status">
        {current.label} export ready, {current.body.split('\n').length - 1} lines.
      </p>

      <div className="proofactions">
        <animated.button style={confirm} onClick={copy}>
          {copyState === 'done' ? 'Copied' : copyState === 'failed' ? 'Select it instead' : 'Copy'}
        </animated.button>
        {downloadable ? (
          <button className="ghost" onClick={download}>
            Download .{current.ext}
          </button>
        ) : downloadNote ? (
          <p className="downnote">{downloadNote}</p>
        ) : null}
      </div>
    </div>
  )
}
