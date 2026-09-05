import { finishLabelOf } from '../../src/lib/types.ts'
import type { DropDetail, Finish } from '../../src/lib/types.ts'

const SLD_URL = 'https://mtgjson.com/api/v5/SLD.json'

interface MtgjsonCard {
  uuid: string
  name: string
  number: string
  rarity: string
  finishes?: string[]
  language?: string
  identifiers: { scryfallId?: string }
}

interface DeckEntry {
  count: number
  uuid: string
  isFoil?: boolean
  isEtched?: boolean
}

interface MtgjsonDeck {
  name: string
  type: string
  releaseDate: string
  commander?: DeckEntry[]
  mainBoard?: DeckEntry[]
  sideBoard?: DeckEntry[]
}

interface DeckFileCard {
  count: number
  name: string
  number: string
  setCode: string
  rarity: string
  finishes?: string[]
  language?: string
  isFoil?: boolean
  isEtched?: boolean
  identifiers: { scryfallId?: string }
}

interface DeckListEntry {
  code: string
  name: string
  fileName: string
  releaseDate: string
  type: string
}

interface SldPayload {
  data: {
    cards: MtgjsonCard[]
    decks: MtgjsonDeck[]
    sealedProduct: {
      name: string
      releaseDate?: string
      contents?: { deck?: { name: string }[] }
    }[]
  }
}

/**
 * The finish comes from the deck entry, never from the deck name. 174 entries
 * carry `isFoil` inside a drop that is not named "Foil Edition", and Scryfall
 * cannot break the tie at all: both editions of a drop share one printing whose
 * `finishes` lists nonfoil and foil together.
 */
export function entryFinish(entry: DeckEntry): Finish {
  if (entry.isEtched) return 'etched'
  if (entry.isFoil) return 'foil'
  return 'nonfoil'
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export interface SldResult {
  drops: DropDetail[]
  /** Products whose card list MTGJSON references but has not published. */
  unresolved: { product: string; deck: string; released?: string }[]
}

async function fetchCommanderDecks(): Promise<Omit<DropDetail, 'slug'>[]> {
  const res = await fetch('https://mtgjson.com/api/v5/DeckList.json', {
    headers: { 'User-Agent': 'chatmtg/0.1' },
  })
  if (!res.ok) throw new Error(`GET DeckList.json -> ${res.status}`)
  const list = ((await res.json()) as { data: DeckListEntry[] }).data.filter(
    (d) => d.code === 'SLD' && d.type === 'Commander Deck',
  )

  const out: Omit<DropDetail, 'slug'>[] = []
  for (const entry of list) {
    const file = await fetch(`https://mtgjson.com/api/v5/decks/${entry.fileName}.json`, {
      headers: { 'User-Agent': 'chatmtg/0.1' },
    })
    if (!file.ok) {
      console.warn(`  commander deck ${entry.fileName} -> ${file.status}, skipped`)
      continue
    }
    const body = (await file.json()) as {
      data: { commander?: DeckFileCard[]; mainBoard?: DeckFileCard[]; sideBoard?: DeckFileCard[] }
    }
    const cards = [
      ...(body.data.commander ?? []),
      ...(body.data.mainBoard ?? []),
      ...(body.data.sideBoard ?? []),
    ]
      .filter((c) => c.identifiers.scryfallId)
      .map((c) => ({
        id: c.identifiers.scryfallId!,
        name: c.name,
        cn: c.number,
        rarity: c.rarity,
        finishes: (c.finishes ?? ['nonfoil']) as Finish[],
        lang: 'en',
        setCode: c.setCode.toLowerCase(),
        finish: c.isEtched ? 'etched' : c.isFoil ? 'foil' : ('nonfoil' as Finish),
        qty: c.count,
      }))
    if (!cards.length) continue
    out.push({
      name: entry.name,
      released: entry.releaseDate,
      count: cards.reduce((n, c) => n + c.qty, 0),
      allFoil: cards.every((c) => c.finish !== 'nonfoil'),
      finishLabel: finishLabelOf(cards),
      commanderDeck: true,
      cards,
    })
    await new Promise((r) => setTimeout(r, 120))
  }
  return out
}

/** Every named Secret Lair drop, with its finish already resolved per card. */
export async function fetchSecretLairDrops(): Promise<SldResult> {
  const res = await fetch(SLD_URL, { headers: { 'User-Agent': 'chatmtg/0.1' } })
  if (!res.ok) throw new Error(`GET ${SLD_URL} -> ${res.status}`)
  const { data } = (await res.json()) as SldPayload

  const byUuid = new Map(data.cards.map((c) => [c.uuid, c]))
  const seen = new Set<string>()
  const drops: DropDetail[] = []

  for (const deck of data.decks) {
    if (deck.type !== 'Secret Lair Drop') continue

    const cards: DropDetail['cards'] = []
    for (const entry of [
      ...(deck.commander ?? []),
      ...(deck.mainBoard ?? []),
      ...(deck.sideBoard ?? []),
    ]) {
      const card = byUuid.get(entry.uuid)
      // A deck entry with no matching card cannot be imported anywhere, so it is
      // dropped rather than emitted as a row that silently fails on import.
      if (!card?.identifiers.scryfallId) continue
      cards.push({
        id: card.identifiers.scryfallId,
        name: card.name,
        cn: card.number,
        rarity: card.rarity,
        finishes: (card.finishes ?? ['nonfoil']) as Finish[],
        lang: 'en',
        finish: entryFinish(entry),
        qty: entry.count,
      })
    }
    // Two drops released years apart can share a name, so the slug is suffixed.
    let slug = slugify(deck.name)
    if (seen.has(slug)) slug = `${slug}-${deck.releaseDate}`
    seen.add(slug)

    drops.push({
      slug,
      name: deck.name,
      released: deck.releaseDate,
      count: cards.reduce((n, c) => n + c.qty, 0),
      allFoil: cards.length > 0 && cards.every((c) => c.finish !== 'nonfoil'),
        finishLabel: finishLabelOf(cards),
      // An empty drop is listed upstream but has no card entries yet. It stays
      // in the index saying so, because a drop that silently vanishes reads as
      // one that never existed.
      incomplete: cards.length ? undefined : 'MTGJSON lists this drop but has not published its card list.',
      cards,
    })
  }

  const published = new Set(data.decks.map((d) => d.name))
  const unresolved = data.sealedProduct.flatMap((p) =>
    (p.contents?.deck ?? [])
      .filter((d) => !published.has(d.name))
      .map((d) => ({ product: p.name, deck: d.name, released: p.releaseDate })),
  )

  // The eight Secret Lair Commander Decks are typed differently and draw most of
  // their 100 cards from other sets, so joining against SLD.json alone would
  // silently drop three quarters of each one.
  for (const deck of await fetchCommanderDecks()) {
    let slug = slugify(deck.name)
    if (seen.has(slug)) slug = `${slug}-${deck.released}`
    seen.add(slug)
    drops.push({ ...deck, slug })
  }

  drops.sort((a, b) => b.released.localeCompare(a.released) || a.name.localeCompare(b.name))
  return { drops, unresolved }
}
