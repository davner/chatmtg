import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { finishLabelOf } from '../../src/lib/types.ts'
import type { Card, DropCard, DropDetail, Finish } from '../../src/lib/types.ts'

interface ManualCard {
  name: string
  count: number
  /** Collector number within the product's own set. */
  cn?: string
  /** Set the reprint comes from, as the announcement names it. */
  set?: string
  /** Recorded where the announcement's own set code is wrong. */
  setCorrectedFrom?: string
}

export interface ManualSource {
  name: string
  url: string
  retrieved: string
  why: string
}

interface ManualDeck {
  deck: string
  product: string
  slug: string
  released: string
  setCode: string
  source: ManualSource
  groups: { label: string; finish: Finish; cards: ManualCard[] }[]
}

export interface ManualResult {
  /** The MTGJSON deck name this file stands in for. */
  standsInFor: string
  drop: DropDetail
  source: ManualSource
  /** Printings the announcement named wrongly, corrected here. */
  corrections: string[]
}

/**
 * A decklist Wizards published that MTGJSON has not ingested yet. The
 * announcement carries a Card Name / Set Code table, so every printing is the
 * one Wizards names rather than a guess, and each resolves against card data
 * already on disk. Used only while MTGJSON's own deck is missing.
 */
export async function loadManualDecks(
  dir: string,
  cardsBySet: Map<string, Card[]>,
): Promise<ManualResult[]> {
  const out: ManualResult[] = []
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json'))

  for (const file of files) {
    const deck: ManualDeck = JSON.parse(await readFile(join(dir, file), 'utf8'))
    const cards: DropCard[] = []
    const corrections: string[] = []

    for (const group of deck.groups) {
      for (const entry of group.cards) {
        const from = entry.cn ? deck.setCode : entry.set
        if (!from) throw new Error(`${deck.slug}: "${entry.name}" names neither a number nor a set`)

        const pool = cardsBySet.get(from)
        if (!pool) throw new Error(`${deck.slug}: no card data for set "${from}"`)

        const card = entry.cn
          ? pool.find((c) => c.cn === entry.cn)
          : plainest(pool.filter((c) => matches(c.name, entry.name)))

        // A missing card would publish a short deck that still looks complete.
        if (!card) {
          throw new Error(`${deck.slug}: "${entry.name}" not found in ${from.toUpperCase()}`)
        }
        if (entry.setCorrectedFrom) {
          corrections.push(
            `${entry.name}: announcement says ${entry.setCorrectedFrom}, card is ${from.toUpperCase()}`,
          )
        }

        cards.push({
          ...card,
          setCode: from,
          finish: card.finishes.includes(group.finish) ? group.finish : card.finishes[0]!,
          qty: entry.count,
        })
      }
    }

    out.push({
      standsInFor: deck.deck,
      drop: {
        slug: deck.slug,
        name: deck.product.replace(/^Secret Lair /, ''),
        released: deck.released,
        count: cards.reduce((n, c) => n + c.qty, 0),
        allFoil: cards.length > 0 && cards.every((c) => c.finish !== 'nonfoil'),
        finishLabel: finishLabelOf(cards),
        cards,
      },
      source: deck.source,
      corrections,
    })
  }
  return out
}

export function front(name: string): string {
  return name.split(' // ')[0]!
}

export function matches(cardName: string, wanted: string): boolean {
  return cardName === wanted || front(cardName) === front(wanted)
}

/**
 * A set lists a card at its ordinary number and again for each showcase or
 * borderless treatment, which are numbered above the main run. The shortest,
 * lowest number is the ordinary printing, which is what a precon ships.
 */
export function plainest(cards: Card[]): Card | undefined {
  return [...cards].sort((a, b) => a.cn.length - b.cn.length || a.cn.localeCompare(b.cn))[0]
}
