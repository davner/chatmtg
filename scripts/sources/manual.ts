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
        // Dropping the row would publish a short deck that looks complete.
        if (!stand) throw new Error(`${deck.slug}: no printing found for "${entry.name}"`)
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
 * A stand-in printing should look like ordinary Magic. Scryfall's default for a
 * name is its newest printing, and the newest printings are currently Marvel,
 * Avatar, and other crossovers, which put wildly wrong-looking cards into a
 * collection. Universes Beyond, promos, Secret Lair, tokens, digital-only, and
 * joke sets are all excluded, and the newest ordinary paper printing wins.
 */
const ORDINARY =
  '-is:ub -is:promo -is:digital -st:funny -st:box -st:memorabilia -st:masterpiece -st:token lang:en'

async function resolveByName(names: string[]): Promise<Map<string, ScryfallCard>> {
  const found = new Map<string, ScryfallCard>()

  // One request per name is 71 requests and Scryfall rate-limits it. Names are
  // OR'd into a handful of queries instead, then the newest printing of each is
  // picked from the merged result.
  for (let i = 0; i < names.length; i += 12) {
    const batch = names.slice(i, i + 12)
    const clause = batch.map((n) => `!"${front(n)}"`).join(' or ')
    const cards = await searchAll(`(${clause}) ${ORDINARY}`)

    for (const name of batch) {
      const key = front(name).toLowerCase()
      const matches = cards.filter((c) => front(c.name).toLowerCase() === key)
      // Sorted newest-first by the query, so the first match is the pick.
      if (matches[0]) found.set(name, matches[0])
    }
    if (i + 12 < names.length) await new Promise((r) => setTimeout(r, 250))
  }

  // Anything the batch missed gets one direct look before it is called absent.
  for (const name of names) {
    if (found.has(name)) continue
    const card = await search(`!"${front(name)}" ${ORDINARY}`)
    if (card) found.set(name, card)
    await new Promise((r) => setTimeout(r, 250))
  }
  return found
}

async function searchAll(q: string): Promise<ScryfallCard[]> {
  const out: ScryfallCard[] = []
  let page = 1
  for (;;) {
    const body = await searchPage(q, page)
    out.push(...(body.data ?? []))
    if (!body.has_more) return out
    page++
    await new Promise((r) => setTimeout(r, 250))
  }
}

/** Scryfall indexes some double-faced cards under the front face alone. */
function front(name: string): string {
  return name.split(' // ')[0]!
}

/**
 * 404 means the query matched nothing and is a real answer. Anything else is a
 * transport problem — a swallowed 429 silently shortens a card list, which is
 * the one failure this project must never produce quietly.
 */
async function search(q: string): Promise<ScryfallCard | undefined> {
  return (await searchPage(q, 1)).data?.[0]
}

async function searchPage(
  q: string,
  page: number,
): Promise<{ data?: ScryfallCard[]; has_more?: boolean }> {
  const url = new URL('https://api.scryfall.com/cards/search')
  url.searchParams.set('q', q)
  url.searchParams.set('unique', 'prints')
  url.searchParams.set('order', 'released')
  url.searchParams.set('dir', 'desc')
  url.searchParams.set('page', String(page))

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    })
    if (res.status === 404) return {}
    if (res.ok) return (await res.json()) as { data?: ScryfallCard[]; has_more?: boolean }
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt))
      continue
    }
    throw new Error(`cards/search ${res.status} for ${q}`)
  }
  throw new Error(`cards/search kept failing for ${q}`)
}
