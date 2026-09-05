import { describe, expect, it } from 'vitest'

/**
 * Contract tests against the live upstreams. These are the assumptions the
 * pipeline is built on; when one breaks, the build starts producing wrong data
 * rather than failing, so they are worth checking deliberately.
 *
 * Not part of `pnpm test` — they need the network, they are slow, and they can
 * fail for reasons that are nobody's fault. Run with `pnpm test:upstream`, or
 * trigger the "Upstream contract" workflow from GitHub.
 */

const UA = 'chatmtg/0.1 (+https://github.com/davner/chatmtg)'
const SLOW = 60_000

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(init?.headers ?? {}) },
  })
  expect(res.ok, `${url} -> ${res.status}`).toBe(true)
  return (await res.json()) as T
}

const pause = () => new Promise((r) => setTimeout(r, 150))

describe('Scryfall: sets', () => {
  it('returns the whole catalogue in one unpaginated response', { timeout: SLOW }, async () => {
    const body = await json<{ data: unknown[]; has_more: boolean }>(
      'https://api.scryfall.com/sets',
    )
    // The build reads page one only and throws if this is ever true.
    expect(body.has_more).toBe(false)
    expect(body.data.length).toBeGreaterThan(1000)
  })

  it('still carries every field a set summary is built from', { timeout: SLOW }, async () => {
    await pause()
    const set = await json<Record<string, unknown>>('https://api.scryfall.com/sets/sld')
    for (const field of ['id', 'code', 'name', 'set_type', 'card_count', 'digital', 'icon_svg_uri']) {
      expect(set[field], `sld.${field}`).toBeDefined()
    }
    expect(String(set.icon_svg_uri)).toMatch(/\.svg(\?|$)/)
  })
})

describe('Scryfall: bulk data', () => {
  it('serves gzipped JSONL, not a JSON array', { timeout: SLOW }, async () => {
    await pause()
    const bulk = await json<Record<string, unknown>>(
      'https://api.scryfall.com/bulk-data/default-cards',
    )
    // A build written against `download_uri` targets an API that is gone.
    expect(bulk.jsonl_download_uri, 'jsonl_download_uri').toBeDefined()
    expect(String(bulk.jsonl_download_uri)).toMatch(/\.jsonl\.gz$/)
    expect(bulk.compressed_size).toBeTypeOf('number')
    expect(bulk.updated_at).toBeDefined()
  })
})

describe('Scryfall: card fields', () => {
  it('keeps the fields a card row needs', { timeout: SLOW }, async () => {
    await pause()
    const card = await json<Record<string, unknown>>(
      'https://api.scryfall.com/cards/search?q=e%3Ablb&unique=prints',
    ).then((b) => (b as { data: Record<string, unknown>[] }).data[0]!)
    for (const field of ['id', 'name', 'collector_number', 'rarity', 'finishes', 'lang', 'set']) {
      expect(card[field], field).toBeDefined()
    }
    expect(Array.isArray(card.finishes)).toBe(true)
  })
})

describe('MTGJSON: Secret Lair drops', () => {
  it('still separates a Foil Edition by a per-entry flag', { timeout: 180_000 }, async () => {
    const { data } = await json<{
      data: {
        decks: {
          name: string
          type: string
          mainBoard?: { count: number; uuid: string; isFoil?: boolean; isEtched?: boolean }[]
        }[]
        sealedProduct: unknown[]
      }
    }>('https://mtgjson.com/api/v5/SLD.json')

    const drops = data.decks.filter((d) => d.type === 'Secret Lair Drop')
    expect(drops.length).toBeGreaterThan(700)
    expect(data.sealedProduct.length).toBeGreaterThan(900)

    const foil = data.decks.find((d) => d.name === 'Hatsune Miku: Winter Diva Foil Edition')
    const plain = data.decks.find((d) => d.name === 'Hatsune Miku: Winter Diva')
    expect(foil, 'Winter Diva Foil Edition').toBeDefined()
    expect(plain, 'Winter Diva').toBeDefined()
    // The whole finish rule rests on this shape.
    expect(foil!.mainBoard!.every((e) => e.isFoil === true)).toBe(true)
    expect(plain!.mainBoard!.every((e) => e.isFoil === undefined)).toBe(true)
    expect(foil!.mainBoard!.map((e) => e.uuid).sort()).toEqual(
      plain!.mainBoard!.map((e) => e.uuid).sort(),
    )
  })
})

describe('MTGJSON: commander decks', () => {
  it('publishes standalone deck files carrying whole cards', { timeout: 120_000 }, async () => {
    const { data } = await json<{
      data: { code: string; type: string; fileName: string; name: string }[]
    }>('https://mtgjson.com/api/v5/DeckList.json')

    const decks = data.filter((d) => d.code === 'SLD' && d.type === 'Commander Deck')
    expect(decks.length).toBeGreaterThanOrEqual(7)

    await pause()
    const one = await json<{
      data: { mainBoard: { name: string; setCode: string; number: string; identifiers: { scryfallId?: string } }[] }
    }>(`https://mtgjson.com/api/v5/decks/${decks[0]!.fileName}.json`)

    const card = one.data.mainBoard[0]!
    // SLD.json alone would resolve only a fraction of these.
    expect(card.identifiers.scryfallId, 'scryfallId').toBeDefined()
    expect(card.setCode).toBeTruthy()
    expect(card.number).toBeTruthy()
    expect(new Set(one.data.mainBoard.map((c) => c.setCode)).size).toBeGreaterThan(1)
  })
})

describe('Wizards: the set-code table', () => {
  it('still publishes which printing each reprint is', { timeout: SLOW }, async () => {
    const res = await fetch(
      'https://magic.wizards.com/en/news/announcements/secret-lair-commander-deck-hatsune-miku-decklist',
      { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36' } },
    )
    expect(res.ok, `wizards -> ${res.status}`).toBe(true)
    const raw = await res.text()

    // The table lives inside a JSON-escaped blob, so the rendered text has only
    // names. Unescaping first is the whole trick.
    const un = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    expect(un).toContain('Set Code')

    const rows = [
      ...un.matchAll(
        /<td[^>]*>(?:<auto-card[^>]*>)?\s*([^<]+?)\s*(?:<\/auto-card>)?<\/td>\s*<td[^>]*>\s*([A-Z0-9]{2,6})\s*<\/td>/gs,
      ),
    ]
    expect(rows.length, 'card/set pairs').toBeGreaterThanOrEqual(72)

    const table = new Map(rows.map((m) => [m[1]!.trim(), m[2]!.trim()]))
    // The values the vendored decklist was built from.
    expect(table.get('Aetherflux Reservoir')).toBe('KLD')
    expect(table.get('Angel of Indemnity')).toBe('OTC')
    expect(table.get('Boon Reflection')).toBe('2XM')
    expect(table.get('Sol Ring')).toBe('BLC')
  })
})

describe('vendored decklists', () => {
  it('reports when MTGJSON has caught up and a vendored file can go', { timeout: 120_000 }, async () => {
    const { data } = await json<{ data: { name: string; code: string }[] }>(
      'https://mtgjson.com/api/v5/DeckList.json',
    )
    const published = data.some((d) => d.code === 'SLD' && d.name === 'Hatsune Miku')

    if (published) {
      // Not a failure — the build already prefers upstream and ignores the file.
      console.warn(
        '\n  MTGJSON now publishes the "Hatsune Miku" deck.\n' +
          '  data/manual/hatsune-miku.json is no longer used and can be deleted.\n',
      )
    }
    expect(typeof published).toBe('boolean')
  })
})
