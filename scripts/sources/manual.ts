import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { finishLabelOf } from '../../src/lib/types.ts'
import type { Card, DropCard, DropDetail, Finish } from '../../src/lib/types.ts'

const USER_AGENT = 'chatmtg/0.1 (+https://github.com/davner/chatmtg)'

interface ManualCard {
  name: string
  count: number
  /** Collector number, where this card's own printing is already catalogued. */
  cn?: string
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

interface ScryfallCard {
  id: string
  name: string
  set: string
  collector_number: string
  rarity: string
  finishes: string[]
  lang: string
}

export interface ManualResult {
  /** The MTGJSON deck name this file stands in for. */
  standsInFor: string
  drop: DropDetail
  source: ManualSource
  substituted: number
}

/**
 * A decklist Wizards published that no card database has catalogued yet. It is a
 * stopgap with a shelf life: the moment MTGJSON publishes the real deck, the
 * caller drops this and the file stops being read.
 */
export async function loadManualDecks(
  dir: string,
  cardsBySet: Map<string, Card[]>,
): Promise<ManualResult[]> {
  const out: ManualResult[] = []
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json'))

  for (const file of files) {
    const deck: ManualDeck = JSON.parse(await readFile(join(dir, file), 'utf8'))
    const byNumber = new Map((cardsBySet.get(deck.setCode) ?? []).map((c) => [c.cn, c]))

    // A name whose own printing is catalogued nowhere needs a stand-in, so the
    // row still imports as the right card.
    const needing = [
      ...new Set(deck.groups.flatMap((g) => g.cards.filter((c) => !c.cn).map((c) => c.name))),
    ]
    const fallbacks = await resolveByName(needing)

    const cards: DropCard[] = []
    let substituted = 0

    for (const group of deck.groups) {
      for (const entry of group.cards) {
        const exact = entry.cn ? byNumber.get(entry.cn) : undefined
        if (exact) {
          cards.push({
            ...exact,
            setCode: deck.setCode,
            finish: exact.finishes.includes(group.finish) ? group.finish : exact.finishes[0]!,
            qty: entry.count,
          })
          continue
        }
        const stand = fallbacks.get(entry.name)
        if (!stand) {
          console.warn(`  manual: ${deck.slug} could not resolve "${entry.name}"`)
          continue
        }
        substituted++
        cards.push({
          id: stand.id,
          name: stand.name,
          cn: stand.collector_number,
          rarity: stand.rarity,
          finishes: stand.finishes as Finish[],
          lang: stand.lang,
          setCode: stand.set,
          // A stand-in cannot promise a finish it was never made in.
          finish: (stand.finishes.includes(group.finish)
            ? group.finish
            : stand.finishes[0]) as Finish,
          qty: entry.count,
          substituted: true,
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
      substituted,
    })
  }
  return out
}

/**
 * Scryfall's collection endpoint takes 75 identifiers per call and is capped at
 * 2 requests a second, which is stricter than the rest of the API.
 */
async function resolveByName(names: string[]): Promise<Map<string, ScryfallCard>> {
  const found = new Map<string, ScryfallCard>()
  const retry: string[] = []
  for (let i = 0; i < names.length; i += 75) {
    const res = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ identifiers: names.slice(i, i + 75).map((name) => ({ name })) }),
    })
    if (!res.ok) throw new Error(`cards/collection -> ${res.status}`)
    const body = (await res.json()) as { data: ScryfallCard[]; not_found: { name?: string }[] }
    for (const card of body.data) {
      found.set(card.name, card)
      // A double-faced card is asked for by its full name but comes back under
      // whichever form Scryfall stores, so index both.
      const front = card.name.split(' // ')[0]!
      if (!found.has(front)) found.set(front, card)
    }
    retry.push(...body.not_found.map((m) => m.name).filter((n): n is string => Boolean(n)))
    if (i + 75 < names.length) await new Promise((r) => setTimeout(r, 550))
  }

  // Scryfall indexes some double-faced cards under the front face alone.
  for (const name of retry) {
    const front = name.split(' // ')[0]!
    if (found.has(name)) continue
    await new Promise((r) => setTimeout(r, 550))
    const res = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(front)}`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
    )
    if (!res.ok) {
      console.warn(`  manual: not found "${name}"`)
      continue
    }
    found.set(name, (await res.json()) as ScryfallCard)
  }
  return found
}
