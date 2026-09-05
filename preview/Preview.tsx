import { useReducedMotion } from '@react-spring/web'
import { useState } from 'react'
import { ExportPane } from '../src/components/ExportPane.tsx'
import type { RenderedFormat } from '../src/lib/export/render.ts'
import { SetWall } from '../src/components/SetWall.tsx'
import type { TileData } from '../src/components/SlabTile.tsx'
import { CardTable } from '../src/components/CardTable.tsx'
import type { CardRow } from '../src/lib/export/types.ts'
import type { DropDetail, DropSummary } from '../src/lib/types.ts'

export interface PreviewData {
  tiles: TileData[]
  drop: DropDetail
  rows: CardRow[]
  exports: RenderedFormat[]
  incomplete: DropSummary[]
  dropSample: DropSummary[]
  totalSets: number
  totalDrops: number
}

export function Preview({ data }: { data: PreviewData }) {
  const [page, setPage] = useState(0)
  // Assigns react-spring's global skipAnimation, so every spring below settles
  // instantly for a visitor who asked for less motion.
  useReducedMotion()

  const { drop } = data

  return (
    <>
      <header>
        <div className="holo" />
        <div className="wrap mast">
          <div className="mark">
            <div className="stamp">MTG</div>
            <div>
              <h1>chatmtg</h1>
              <p className="sub">
                Certified card lists for every set and Secret Lair drop, ready to import.
              </p>
            </div>
          </div>
          <p className="sub mono" style={{ fontSize: '11px' }}>
            {data.totalSets.toLocaleString()} sets · {data.totalDrops} drops ·{' '}
            117,627 printings
          </p>
        </div>
      </header>

      <main>
        <section className="wrap">
          <SetWall
            sets={data.tiles}
            base="#"
            hrefFor={() => '#opened'}
            searchDrops={false}
            presetDrops={data.dropSample}
          />
        </section>

        {drop.provenance && (
          <section className="wrap" id="opened">
            <div className="panelbox sourced">
              <div className="holo" />
              <div className="strucknote">
                <strong>Sourced</strong>
                <span>
                  MTGJSON has not published this deck yet, so the card list comes from{' '}
                  <a href={drop.provenance.url}>{drop.provenance.name}</a>, retrieved{' '}
                  {drop.provenance.retrieved}. All {drop.count} cards are correct.{' '}
                  {drop.substituted ? (
                    <>
                      <strong className="inlineflag">
                        {drop.substituted} printings are stand-ins
                      </strong>{' '}
                      — those cards' actual printings in this product are not catalogued by
                      Scryfall or MTGJSON yet, so an older printing is used. The card is right;
                      the exact version is not. Rows affected are marked SUB.
                    </>
                  ) : null}
                </span>
              </div>
            </div>
          </section>
        )}

        <section className="wrap">
          <div className="shead">
            <h2>Opened</h2>
            <span className="count">Resolved from {data.totalDrops} named Secret Lair drops</span>
          </div>
          <div className="opened">
            <div className="tablecol">
              <div className="panelbox" style={{ marginBottom: '18px' }}>
                <div className="holo" />
                <div className="dropbar">
                  <span className="field">Secret Lair</span>
                  <h3>{drop.name}</h3>
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
                        <span className="finflag">{drop.finishLabel}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <CardTable rows={data.rows} page={page} onPage={setPage} editable={false} />
            </div>

            <div className="exportcol">
              <ExportPane
                formats={data.exports}
                filename={slug(drop.name)}
                downloadable={false}
                downloadNote="Copy works here. Downloading is blocked inside this preview frame; the deployed site saves the file."
              />
            </div>
          </div>
        </section>

        <section className="wrap">
          <div className="shead">
            <h2>Struck</h2>
            <span className="count">Incomplete upstream, never silently omitted</span>
          </div>
          <div className="panelbox struck">
            <div className="strucknote">
              <strong>Struck</strong>
              <span>
                {data.incomplete.map((d) => d.name).join(' · ')} — MTGJSON lists these drops
                but has not published their card lists, so they stay on the wall marked
                rather than disappearing from it.
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div className="legend">
            <div>
              <span className="chip nonfoil">NONFOIL</span>
              <span>as printed</span>
            </div>
            <div>
              <span className="chip foil">FOIL</span>
              <span>foil edition</span>
            </div>
            <div>
              <span className="chip etched">ETCHED</span>
              <span>etched foil</span>
            </div>
          </div>
          <p>
            Card data from <a href="https://scryfall.com">Scryfall</a>; Secret Lair drop
            contents from <a href="https://mtgjson.com">MTGJSON</a>. Set art is shown with its
            artist credited on each slab.
          </p>
          <p>
            chatmtg is unofficial Fan Content permitted under the Wizards of the Coast Fan
            Content Policy. Not approved or endorsed by Wizards. Portions of the materials used
            are property of Wizards of the Coast. &copy; Wizards of the Coast LLC.
          </p>
        </div>
      </footer>
    </>
  )
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
