import type { CardRow } from '../lib/export/types.ts'
import type { Finish } from '../lib/types.ts'

const PAGE = 200

/**
 * The input's min and max only govern the spinner; typed and pasted values reach
 * onChange unchecked, and an unclamped quantity ships straight into the CSV.
 */
export function clampQty(raw: string): number {
  const n = Math.trunc(Number(raw))
  if (!Number.isFinite(n)) return 0
  return Math.min(99, Math.max(0, n))
}

export function CardTable({
  rows,
  page,
  onPage,
  onChange,
  editable = true,
}: {
  rows: CardRow[]
  page: number
  onPage: (n: number) => void
  onChange?: (index: number, patch: Partial<CardRow>) => void
  editable?: boolean
}) {
  // Two sets run to thousands of printings, so the table pages rather than
  // handing the browser every row at once.
  const start = page * PAGE
  const slice = rows.slice(start, start + PAGE)
  const pages = Math.ceil(rows.length / PAGE)

  // A set page's rows all share one code, so printing it on every line says
  // nothing. A commander deck draws from many, where it is the whole point.
  const manySets = new Set(rows.map((r) => r.setCode)).size > 1

  return (
    <div className="panelbox">
      <div className="holo" />
      <div className="proofhead">
        <span className="field">Cards</span>
        <span className="count mono">
          {rows.length.toLocaleString()} printings
          {pages > 1 ? ` · ${start + 1}–${Math.min(start + PAGE, rows.length)}` : ''}
        </span>
      </div>

      <ul className="cardrows">
        {slice.map((r, i) => {
          const index = start + i
          return (
            <li key={r.scryfallId + r.cn}>
              {editable && onChange ? (
                <input
                  className="qtyin mono"
                  id={`qty-${r.scryfallId}-${r.cn}`}
                  name={`qty-${r.scryfallId}-${r.cn}`}
                  type="number"
                  min="0"
                  max="99"
                  step="1"
                  value={r.qty}
                  aria-label={`Quantity of ${r.name}`}
                  onChange={(e) => onChange(index, { qty: clampQty(e.target.value) })}
                />
              ) : (
                <span className="qty">{r.qty}&times;</span>
              )}
              <span className="nm" title={r.name}>{r.name}</span>
              {r.substituted ? (
                <span className="chip sub" title="This card's printing in this product is not catalogued yet; an older printing stands in.">
                  SUB
                </span>
              ) : null}
              <span className="cn">
                {manySets ? `${r.setCode.toUpperCase()} ` : ''}#{r.cn}
              </span>
              {editable && onChange ? (
                <FinishPicker row={r} onPick={(finish) => onChange(index, { finish })} />
              ) : (
                <span className={`chip ${r.finish}`}>{r.finish.toUpperCase()}</span>
              )}
            </li>
          )
        })}
      </ul>

      {pages > 1 ? (
        <div className="pager">
          <button className="ghost" disabled={page === 0} onClick={() => onPage(page - 1)}>
            Previous
          </button>
          <span className="mono">{page + 1} / {pages}</span>
          <button className="ghost" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Only the finishes this printing was actually made in are offered, so the table
 * cannot record a foil that does not exist.
 */
function FinishPicker({ row, onPick }: { row: CardRow; onPick: (f: Finish) => void }) {
  const available = row.available ?? [row.finish]
  if (available.length < 2) return <span className={`chip ${row.finish}`}>{row.finish.toUpperCase()}</span>
  return (
    <span className="finishpick">
      {available.map((f) => (
        <button
          key={f}
          className={`chip ${f}${f === row.finish ? ' on' : ''}`}
          aria-pressed={f === row.finish}
          aria-label={`${row.name}: ${f}`}
          onClick={() => onPick(f)}
        >
          {f.toUpperCase()}
        </button>
      ))}
    </span>
  )
}
