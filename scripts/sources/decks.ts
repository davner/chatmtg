import { createWriteStream } from 'node:fs'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { join } from 'node:path'
import { list } from 'tar'
import { finishLabelOf, type DropDetail, type Finish } from '../../src/lib/types.ts'

const UA = 'chatmtg/0.1 (+https://github.com/davner/chatmtg)'
const BASE = 'https://mtgjson.com/api/v5'

interface DeckFileCard {
  count: number
  name: string
  number: string
  setCode: string
  rarity: string
  finishes?: string[]
  isFoil?: boolean
  isEtched?: boolean
  identifiers: { scryfallId?: string }
}

interface DeckFile {
  name: string
  code: string
  type: string
  releaseDate: string
  commander?: DeckFileCard[]
  mainBoard?: DeckFileCard[]
  sideBoard?: DeckFileCard[]
}

export interface PreconDeck extends DropDetail {
  /** Set the product belongs to, so a set page can list its own decks. */
  setCode: string
  /** MTGJSON's deck type: Commander Deck, Jumpstart, Theme Deck, and so on. */
  kind: string
}

/**
 * Every preconstructed deck MTGJSON publishes, not just Secret Lair. Fetching
 * 3000 deck files one at a time is thousands of requests, so the whole archive
 * is taken in one download and cached the way the Scryfall bulk file is.
 */
export async function fetchAllDecks(cacheDir: string): Promise<PreconDeck[]> {
  const archive = await ensureArchive(cacheDir)
  const decks: PreconDeck[] = []
  const seen = new Set<string>()

  await list({
    file: archive,
    onReadEntry(entry) {
      if (!entry.path.endsWith('.json')) {
        entry.resume()
        return
      }
      const chunks: Buffer[] = []
      entry.on('data', (c: Buffer) => chunks.push(c))
      entry.on('end', () => {
        let file: { data?: DeckFile }
        try {
          file = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          return
        }
        const deck = file.data
        if (!deck) return

        const cards = [
          ...(deck.commander ?? []),
          ...(deck.mainBoard ?? []),
          ...(deck.sideBoard ?? []),
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
            finish: (c.isEtched ? 'etched' : c.isFoil ? 'foil' : 'nonfoil') as Finish,
            qty: c.count,
          }))
        if (!cards.length) return

        const code = deck.code.toLowerCase()
        let slug = slugify(`${code} ${deck.name}`)
        // Two sets can ship a deck of the same name, and a set can ship two.
        if (seen.has(slug)) slug = `${slug}-${decks.length}`
        seen.add(slug)

        decks.push({
          slug,
          name: deck.name,
          released: deck.releaseDate ?? '',
          count: cards.reduce((n, c) => n + c.qty, 0),
          allFoil: cards.every((c) => c.finish !== 'nonfoil'),
          finishLabel: finishLabelOf(cards),
          setCode: code,
          kind: deck.type,
          cards,
        })
      })
    },
  })

  return decks
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function ensureArchive(cacheDir: string): Promise<string> {
  const meta = (await fetch(`${BASE}/Meta.json`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  }).then((r) => r.json())) as { data: { version: string } }

  const stamp = meta.data.version.replace(/[^0-9a-z.]/gi, '')
  const target = join(cacheDir, `AllDeckFiles-${stamp}.tar.gz`)
  await mkdir(cacheDir, { recursive: true })

  if (await stat(target).then((s) => s.size > 0, () => false)) {
    console.log(`  decks: cached ${target}`)
    return target
  }

  console.log('  decks: downloading AllDeckFiles (~257 MB) ...')
  const res = await fetch(`${BASE}/AllDeckFiles.tar.gz`, { headers: { 'User-Agent': UA } })
  if (!res.ok || !res.body) throw new Error(`AllDeckFiles -> ${res.status}`)
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(target))

  // Keep one build's worth; the archive is large.
  for (const name of await readdir(cacheDir)) {
    if (name.startsWith('AllDeckFiles-') && !target.endsWith(name)) {
      await unlink(join(cacheDir, name)).catch(() => {})
    }
  }
  return target
}
