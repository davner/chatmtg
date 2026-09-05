import { useReducedMotion } from '@react-spring/web'
import { useEffect, useMemo, useState } from 'react'
import { CardTable } from './CardTable.tsx'
import { ExportPane } from './ExportPane.tsx'
import { FORMATS } from '../lib/export/index.ts'
import { renderAll } from '../lib/export/render.ts'
import type { CardRow } from '../lib/export/types.ts'
import type { Card, DropCard } from '../lib/types.ts'

type Source =
  | { kind: 'set'; url: string; setCode: string; setName: string }
  | { kind: 'drop'; url: string; setCode: string; setName: string }

/**
 * Card lists are fetched rather than inlined: the biggest set runs to 5584
 * printings, and every one of the 1049 pages would otherwise carry its whole
 * list in the HTML.
 */
export function SetExporter({
  source,
  binder,
  filename,
}: {
  source: Source
  binder: string
  filename: string
}) {
  // Set and drop pages animate too, so they need the reduced-motion global set
  // here as well; the wall's copy only covers the index.
  useReducedMotion()

  const [rows, setRows] = useState<CardRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [page, setPage] = useState(0)
  const [includeSubs, setIncludeSubs] = useState(true)

  useEffect(() => {
    let live = true
    fetch(source.url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then((data) => {
        if (!live) return
        setRows(source.kind === 'set' ? fromSet(data, source) : fromDrop(data, source))
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [source.url])

  const substituted = useMemo(() => (rows ?? []).filter((r) => r.substituted).length, [rows])
  const included = useMemo(
    () => (rows ?? []).filter((r) => r.qty > 0 && (includeSubs || !r.substituted)),
    [rows, includeSubs],
  )
  const exports = useMemo(
    () => renderAll(FORMATS, included, { binder }),
    [included, binder],
  )

  function change(index: number, patch: Partial<CardRow>) {
    setRows((prev) => {
      if (!prev) return prev
      const next = prev.slice()
      next[index] = { ...next[index]!, ...patch }
      return next
    })
  }

  if (failed) {
    return (
      <div className="panelbox">
        <div className="holo" />
        <p className="empty" style={{ padding: '16px 15px' }}>
          The card list for this set did not load. Reload the page; if it keeps failing the
          data file is missing from the build.
        </p>
      </div>
    )
  }

  if (!rows) {
    return (
      <div className="panelbox">
        <div className="holo" />
        <p className="empty" style={{ padding: '16px 15px' }}>Reading the card list…</p>
      </div>
    )
  }

  return (
    <>
      <div className="tablecol">
        <CardTable rows={rows} page={page} onPage={setPage} onChange={change} />
      </div>
      <div className="exportcol">
        <ExportPane formats={exports} filename={filename} />
        {substituted > 0 && (
          <div className="subswitch">
            <p className="field">Printings not catalogued yet</p>
            <div className="groups" role="group" aria-label="Stand-in printings">
              <button
                className={`grouptab${includeSubs ? ' on' : ''}`}
                aria-pressed={includeSubs}
                onClick={() => setIncludeSubs(true)}
              >
                All {rows.reduce((n, r) => n + r.qty, 0)} cards
              </button>
              <button
                className={`grouptab${includeSubs ? '' : ' on'}`}
                aria-pressed={!includeSubs}
                onClick={() => setIncludeSubs(false)}
              >
                Exact printings only
              </button>
            </div>
            <p className="disclaimer" style={{ marginTop: '8px' }}>
              {includeSubs
                ? `${substituted} of these rows use a stand-in printing, because this product's own printings are not catalogued anywhere yet. The cards are right; those versions are not.`
                : `Only the ${included.length} rows whose exact printing is known. Correct, but not the whole product.`}
            </p>
          </div>
        )}
        <p className="disclaimer">
          Quantities start at one of each card, non-foil where the printing allows it. That
          is a starting point, not a record of what you own — set the quantity to zero for
          anything you do not have, and pick the finish you actually pulled.
        </p>
      </div>
    </>
  )
}

function fromSet(cards: Card[], s: Source): CardRow[] {
  return cards.map((c) => ({
    name: c.name,
    setCode: s.setCode,
    setName: s.setName,
    cn: c.cn,
    rarity: c.rarity,
    finish: c.finishes.includes('nonfoil') ? 'nonfoil' : c.finishes[0]!,
    available: c.finishes,
    qty: 1,
    scryfallId: c.id,
    lang: c.lang,
    condition: 'near_mint',
  }))
}

function fromDrop(drop: { cards: DropCard[] }, s: Source): CardRow[] {
  // A drop states its own finish, so it is fixed rather than offered as a choice.
  // A commander deck spans many sets, so each row carries its own set code.
  return drop.cards.map((c) => ({
    name: c.name,
    setCode: c.setCode ?? s.setCode,
    setName: c.setCode && c.setCode !== s.setCode ? c.setCode.toUpperCase() : s.setName,
    cn: c.cn,
    rarity: c.rarity,
    finish: c.finish,
    available: [c.finish],
    qty: c.qty,
    scryfallId: c.id,
    lang: c.lang,
    condition: 'near_mint',
    substituted: c.substituted,
  }))
}
