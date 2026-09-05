import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  downloadIcons,
  ensureBulkFile,
  fetchSets,
  iconFileName,
  streamBulkCards,
  type ScryfallCard,
} from './sources/scryfall.ts'
import { fetchSecretLairDrops } from './sources/mtgjson.ts'
import { loadManualDecks } from './sources/manual.ts'
import type { Card, Finish, SetSummary } from '../src/lib/types.ts'

const ROOT = new URL('..', import.meta.url).pathname
const DATA = join(ROOT, 'public/data')
const ICONS = join(ROOT, 'public/icons')
const CACHE = join(ROOT, '.cache')
const MANUAL = join(ROOT, 'data/manual')

const RARITY_RANK: Record<string, number> = {
  mythic: 5,
  rare: 4,
  special: 3,
  uncommon: 2,
  common: 1,
  bonus: 0,
}

function artOf(card: ScryfallCard): string | undefined {
  return card.image_uris?.art ?? card.card_faces?.[0]?.image_uris?.art
}

/**
 * Tie-break on collector number so a rebuild against unchanged upstream data
 * produces the same tile, rather than reshuffling the grid on every run.
 */
function betterTile(a: ScryfallCard, b: ScryfallCard): ScryfallCard {
  const scan = (c: ScryfallCard) => (c.image_status === 'highres_scan' ? 1 : 0)
  if (scan(a) !== scan(b)) return scan(a) > scan(b) ? a : b
  const rank = (c: ScryfallCard) => RARITY_RANK[c.rarity] ?? 0
  if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b
  return a.collector_number.padStart(8, '0') <= b.collector_number.padStart(8, '0') ? a : b
}

async function main() {
  console.log('chatmtg: building static data')

  console.log('sets:')
  const sets = await fetchSets()
  console.log(`  ${sets.length} sets`)

  console.log('cards:')
  const bulk = await ensureBulkFile(CACHE)
  const cards = new Map<string, Card[]>()
  const tiles = new Map<string, ScryfallCard>()

  const total = await streamBulkCards(bulk, (c) => {
    let bucket = cards.get(c.set)
    if (!bucket) cards.set(c.set, (bucket = []))
    bucket.push({
      id: c.id,
      name: c.name,
      cn: c.collector_number,
      rarity: c.rarity,
      finishes: c.finishes as Finish[],
      lang: c.lang,
    })
    if (artOf(c)) {
      const best = tiles.get(c.set)
      tiles.set(c.set, best ? betterTile(best, c) : c)
    }
  })
  console.log(`  ${total} printings across ${cards.size} sets`)

  await rm(join(DATA, 'sets'), { recursive: true, force: true })
  await rm(join(DATA, 'drops'), { recursive: true, force: true })
  await mkdir(join(DATA, 'sets'), { recursive: true })
  await mkdir(join(DATA, 'drops'), { recursive: true })

  const summaries: SetSummary[] = []
  const mismatches: string[] = []

  for (const set of sets) {
    const list = (cards.get(set.code) ?? []).sort(
      (a, b) => a.cn.padStart(8, '0').localeCompare(b.cn.padStart(8, '0')) || a.name.localeCompare(b.name),
    )
    await writeFile(join(DATA, 'sets', `${set.code}.json`), JSON.stringify(list))

    const tile = tiles.get(set.code)
    summaries.push({
      code: set.code,
      sid: set.id,
      name: set.name,
      type: set.set_type,
      released: set.released_at ?? '',
      count: list.length,
      digital: set.digital,
      parent: set.parent_set_code,
      icon: iconFileName(set.icon_svg_uri),
      art: tile ? artOf(tile) : undefined,
      artist: tile?.artist ?? tile?.card_faces?.[0]?.artist,
    })
    if (list.length !== set.card_count) {
      mismatches.push(`${set.code}: ${list.length} written vs card_count ${set.card_count}`)
    }
  }

  summaries.sort((a, b) => b.released.localeCompare(a.released) || a.name.localeCompare(b.name))
  await writeFile(join(DATA, 'sets.json'), JSON.stringify(summaries))
  console.log(`  wrote ${summaries.length} set files`)
  console.log(`  ${mismatches.length} sets differ from Scryfall's card_count`)

  console.log('secret lair drops:')
  const { drops, unresolved } = await fetchSecretLairDrops()
  console.log(`  ${drops.length} from MTGJSON`)

  // A vendored decklist stands in only while MTGJSON has none of its own. Once
  // upstream publishes the deck, the manual file is ignored on the next build.
  const published = new Set(drops.map((d) => d.name))
  const stillMissing = new Set(unresolved.map((u) => u.deck))
  for (const manual of await loadManualDecks(MANUAL, cards)) {
    if (published.has(manual.drop.name) || !stillMissing.has(manual.standsInFor)) {
      console.log(`  manual: "${manual.standsInFor}" is published upstream now; file unused`)
      continue
    }
    drops.push({
      ...manual.drop,
      commanderDeck: true,
      substituted: manual.substituted,
      provenance: {
        name: manual.source.name,
        url: manual.source.url,
        retrieved: manual.source.retrieved,
        note: manual.source.why,
      },
    })
    console.log(
      `  manual: "${manual.drop.name}" ${manual.drop.count} cards, ` +
        `${manual.substituted} printings substituted (source: ${manual.source.name})`,
    )
  }
  for (const drop of drops) {
    await writeFile(join(DATA, 'drops', `${drop.slug}.json`), JSON.stringify(drop))
  }
  await writeFile(
    join(DATA, 'drops.json'),
    JSON.stringify(drops.map(({ cards: _cards, ...rest }) => rest)),
  )
  console.log(`  wrote ${drops.length} drops`)
  for (const u of unresolved) {
    console.log(`  unresolved upstream: "${u.product}" (${u.released}) -> deck "${u.deck}"`)
  }
  await writeFile(join(DATA, 'unresolved.json'), JSON.stringify(unresolved))

  console.log('icons:')
  const n = await downloadIcons(new Set(sets.map((s) => s.icon_svg_uri)), ICONS)
  console.log(`  ${n} icons available`)

  if (mismatches.length) {
    console.log('\ncard_count mismatches (first 15):')
    for (const m of mismatches.slice(0, 15)) console.log(`  ${m}`)
  }
  console.log('\ndone')
}

await main()
