import { useMemo, useState } from 'react'
import { CARD_SORTS, compareCards, type CardSort } from '../lib/sort.ts'
import type { CardRow } from '../lib/export/types.ts'
import type { Finish } from '../lib/types.ts'

const PAGE = 200

/** A row with its position in the unfiltered list, which is where an edit lands. */
export interface ViewRow {
  row: CardRow
  index: number
}

export interface CardFilter {
  query: string
  rarity: string
  sort: CardSort
}

/**
 * The input's min and max only govern the spinner; typed and pasted values reach
 * onChange unchecked, and an unclamped quantity ships straight into the CSV.
 */
export function clampQty(raw: string | number): number {
  const n = Math.trunc(Number(raw))
  if (!Number.isFinite(n)) return 0
  return Math.min(99, Math.max(0, n))
}

/**
 * Rows are carried with their original index, because editing writes back to the
 * unfiltered list and a filtered position would point at the wrong card.
 */
export function viewRows(rows: CardRow[], { query, rarity, sort }: CardFilter): ViewRow[] {
  const q = query.trim().toLowerCase()
  const picked = rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        (rarity === 'all' || row.rarity === rarity) &&
        (!q || row.name.toLowerCase().includes(q) || row.cn.toLowerCase() === q),
    )
  return picked.sort((a, b) => compareCards(a.row, b.row, sort))
}

/**
 * A bulk edit names the rows it touches by original index. An index outside the
 * list is dropped rather than written, so a view built against a card list that
 * has since been replaced cannot set a quantity on a card nobody looked at.
 */
export function setQtyAt(rows: CardRow[], indices: readonly number[], qty: number): CardRow[] {
  const q = clampQty(qty)
  const next = rows.slice()
  for (const i of indices) {
    const row = next[i]
    if (!row || row.qty === q) continue
    next[i] = { ...row, qty: q }
  }
  return next
}

export function CardTable({
  rows,
  page,
  onPage,
  onChange,
  onBulk,
  editable = true,
}: {
  rows: CardRow[]
  page: number
  onPage: (n: number) => void
  onChange?: (index: number, patch: Partial<CardRow>) => void
  onBulk?: (indices: number[], qty: number) => void
  editable?: boolean
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<CardSort>('number')
  const [rarity, setRarity] = useState('all')
  const [announced, setAnnounced] = useState('')

  const view = useMemo(() => viewRows(rows, { query, rarity, sort }), [rows, query, sort, rarity])

  const rarities = useMemo(
    () => [...new Set(rows.map((r) => r.rarity))].sort(),
    [rows],
  )

  // Two sets run to thousands of printings, so the table pages rather than
  // handing the browser every row at once.
  const start = page * PAGE
  const slice = view.slice(start, start + PAGE)
  const pages = Math.ceil(view.length / PAGE)
  const filtered = view.length !== rows.length

  // A set page's rows all share one code, so printing it on every line says
  // nothing. A commander deck draws from many, where it is the whole point.
  const manySets = new Set(rows.map((r) => r.setCode)).size > 1

  // The finish column is as wide as the most finishes any row in this list
  // offers, so a header label sits over the values it names rather than over
  // wherever the widest row happened to push them.
  const slots =
    editable && onChange
      ? rows.reduce((n, r) => Math.max(n, (r.available ?? [r.finish]).length), 1)
      : 1

  // Paging means fewer rows are on screen than the filter matched, so the count
  // names what the buttons will write rather than what is under them.
  const scope = filtered
    ? `${view.length.toLocaleString()} matching`
    : `all ${rows.length.toLocaleString()}`

  function refine(next: () => void) {
    onPage(0)
    next()
  }

  return (
    <div className={`panelbox cardpanel fin${Math.min(3, slots)}${manySets ? ' manysets' : ''}`}>
      <div className="holo" />
      <div className="proofhead">
        <span className="field">Cards</span>
        <span className="count mono">
          {filtered
            ? `${view.length.toLocaleString()} of ${rows.length.toLocaleString()}`
            : `${rows.length.toLocaleString()} cards`}
        </span>
      </div>

      <div className="tablebar">
        <label className="lookup">
          <span className="field">Find</span>
          <input
            id="card-find"
            name="card-find"
            type="search"
            value={query}
            onChange={(e) => refine(() => setQuery(e.target.value))}
            placeholder="name or number"
            aria-label="Find a card by name or collector number"
          />
        </label>
        {rarities.length > 1 ? (
          <select
            id="card-rarity"
            name="card-rarity"
            value={rarity}
            onChange={(e) => refine(() => setRarity(e.target.value))}
            aria-label="Filter by rarity"
          >
            <option value="all">All rarities</option>
            {rarities.map((r) => (
              <option key={r} value={r}>
                {r[0]!.toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        ) : null}
        <select
          id="card-sort"
          name="card-sort"
          value={sort}
          onChange={(e) => refine(() => setSort(e.target.value as CardSort))}
          aria-label="Sort cards"
        >
          {CARD_SORTS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk edits reach the filtered rows only, and say how many those are: a
          filter is a statement about which cards are in hand, and rewriting the
          hidden ones would overstate a collection the visitor never saw. */}
      {editable && onBulk && view.length > 0 ? (
        <div className="bulkbar">
          <span className="field">Quantity</span>
          <div className="groups" role="group" aria-label="Set quantity across rows">
            <button
              className="grouptab"
              aria-label={`Set ${scope} rows to none`}
              onClick={() => {
                onBulk(view.map((v) => v.index), 0)
                setAnnounced(`${view.length} rows set to none`)
              }}
            >
              None
            </button>
            <button
              className="grouptab"
              aria-label={`Set ${scope} rows to one of each`}
              onClick={() => {
                onBulk(view.map((v) => v.index), 1)
                setAnnounced(`${view.length} rows set to one of each`)
              }}
            >
              One of each
            </button>
          </div>
          <span className="bulkscope mono">{scope}</span>
          <p className="srstatus" role="status">
            {announced}
          </p>
        </div>
      ) : null}

      {view.length === 0 ? (
        <p className="empty" style={{ padding: '14px 15px' }}>
          No card matches <strong>{query}</strong>.
        </p>
      ) : (
        <div className={`colhead${editable && onChange ? '' : ' plain'}`}>
          <span className="field qtyh">Qty</span>
          <span className="field nameh">Card</span>
          <span className="field cnh">Number</span>
          <span className="field finh">Finish</span>
        </div>
      )}

      <ul className="cardrows">
        {slice.map(({ row: r, index }) => {
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
              <span className="fincell">
                {editable && onChange ? (
                  <FinishPicker row={r} onPick={(finish) => onChange(index, { finish })} />
                ) : (
                  <span className={`chip ${r.finish}`}>{r.finish.toUpperCase()}</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      {pages > 1 ? (
        <div className="pager">
          <button className="ghost" disabled={page === 0} onClick={() => onPage(page - 1)}>
            Previous
          </button>
          <span className="mono">
            {page + 1} / {pages}
          </span>
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
