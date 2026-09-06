import { useReducedMotion } from '@react-spring/web'
import { useEffect, useMemo, useState } from 'react'
import { CardTable, setQtyAt } from './CardTable.tsx'
import { Skeleton } from './Skeleton.tsx'
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

  // The indices come from the table's filtered view, so a bulk action reaches
  // the rows the visitor can see and no others.
  function bulk(indices: number[], qty: number) {
    setRows((prev) => (prev ? setQtyAt(prev, indices, qty) : prev))
  }

  if (failed) {
    return (
      <div className="panelbox loadingpanel">
        <div className="holo" />
        <p className="empty" style={{ padding: '16px 15px' }}>
          The card list did not load. Try reloading.
        </p>
      </div>
    )
  }

  // The skeleton holds the height the table is about to take, so the page does
  // not jump when the card list lands.
  if (!rows) return <Skeleton rows={10} label="Loading the card list" />

  return (
    <>
      <div className="tablecol">
        <CardTable rows={rows} page={page} onPage={setPage} onChange={change} onBulk={bulk} />
      </div>
      <div className="exportcol">
        <ExportPane formats={exports} filename={filename} />
        {substituted > 0 && (
          <div className="subswitch">
            <p className="field">Uncatalogued printings</p>
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
                ? `${substituted} rows use a stand-in version. Right cards, wrong printing.`
                : `Only the ${included.length} rows with a known printing.`}
            </p>
          </div>
        )}
        <p className="disclaimer">
          One of each to start. Set anything you do not own to zero.
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
