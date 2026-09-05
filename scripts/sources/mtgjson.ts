import { finishLabelOf } from '../../src/lib/types.ts'
import type { DropCard, DropDetail, Finish } from '../../src/lib/types.ts'

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

interface SealedProduct {
  name: string
  subtype?: string
  releaseDate?: string
  contents?: {
    deck?: { name: string }[]
    card?: { name: string; number?: string; set?: string; uuid?: string; foil?: boolean }[]
    sealed?: { count: number; name: string }[]
  }
}

interface SldPayload {
  data: {
    cards: MtgjsonCard[]
    decks: MtgjsonDeck[]
    sealedProduct: SealedProduct[]
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

  // Products that ship loose cards rather than a deck: single-card promos and
  // replacement packs. Nothing else reaches them, so they would be invisible.
  const byUuidAll = byUuid
  const dropByDeckName = new Map(drops.map((d) => [d.name, d]))
  for (const product of data.sealedProduct) {
    const loose = product.contents?.card
    if (!loose?.length || product.contents?.deck?.length) continue
    const cards: DropCard[] = []
    for (const entry of loose) {
      const card = entry.uuid ? byUuidAll.get(entry.uuid) : undefined
      if (!card?.identifiers.scryfallId) continue
      cards.push({
        id: card.identifiers.scryfallId,
        name: card.name,
        cn: card.number,
        rarity: card.rarity,
        finishes: (card.finishes ?? ['nonfoil']) as Finish[],
        lang: 'en',
        setCode: 'sld',
        finish: entry.foil ? 'foil' : 'nonfoil',
        qty: 1,
      })
    }
    if (!cards.length) continue
    const name = product.name.replace(/^Secret Lair (Drop )?/, '')
    let slug = slugify(name)
    if (seen.has(slug)) slug = `${slug}-promo`
    if (seen.has(slug)) continue
    seen.add(slug)
    drops.push({
      slug,
      name,
      released: product.releaseDate ?? '',
      count: cards.reduce((n, c) => n + c.qty, 0),
      allFoil: cards.every((c) => c.finish !== 'nonfoil'),
      finishLabel: finishLabelOf(cards),
      cards,
    })
    dropByDeckName.set(name, drops[drops.length - 1]!)
  }

  // A superdrop bundle is several drops sold together, and bundles can contain
  // bundles. Resolving one gives a single import for what was a single purchase.
  const productByName = new Map(data.sealedProduct.map((p) => [p.name, p]))
  const resolveBundle = (
    product: SealedProduct,
    depth = 0,
    into: DropCard[] = [],
  ): DropCard[] => {
    if (depth > 4) return into
    for (const deckRef of product.contents?.deck ?? []) {
      const drop = dropByDeckName.get(deckRef.name)
      if (drop) into.push(...drop.cards)
    }
    for (const member of product.contents?.sealed ?? []) {
      const inner = productByName.get(member.name)
      if (inner && inner !== product) resolveBundle(inner, depth + 1, into)
    }
    return into
  }

  for (const product of data.sealedProduct) {
    if (product.subtype !== 'secret_lair_bundle') continue
    const cards = resolveBundle(product)
    if (!cards.length) continue

    // The same card can arrive from two members of one bundle.
    const merged = new Map<string, DropCard>()
    for (const c of cards) {
      const key = `${c.id}|${c.finish}`
      const seenCard = merged.get(key)
      if (seenCard) seenCard.qty += c.qty
      else merged.set(key, { ...c })
    }
    const list = [...merged.values()]

    const name = product.name.replace(/^Secret Lair Bundle /, '')
    let slug = slugify(`bundle ${name}`)
    if (seen.has(slug)) continue
    seen.add(slug)

    // Some bundles carry no date upstream. The drops inside were all sold in the
    // same superdrop window, so the earliest of them is the bundle's date.
    const memberDates = (product.contents?.deck ?? [])
      .map((d) => dropByDeckName.get(d.name)?.released)
      .filter((d): d is string => Boolean(d))
      .sort()

    drops.push({
      slug,
      name,
      released: product.releaseDate ?? memberDates[0] ?? '',
      count: list.reduce((n, c) => n + c.qty, 0),
      allFoil: list.every((c) => c.finish !== 'nonfoil'),
      finishLabel: finishLabelOf(list),
      bundle: true,
      cards: list,
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
