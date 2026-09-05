import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { join } from 'node:path'

/** Scryfall blocks generic agents outright, and asks that this identify the app. */
const USER_AGENT = 'chatmtg/0.1 (+https://github.com/davner/chatmtg)'
const API = 'https://api.scryfall.com'

export interface ScryfallSet {
  id: string
  code: string
  name: string
  set_type: string
  released_at?: string
  card_count: number
  digital: boolean
  parent_set_code?: string
  icon_svg_uri: string
}

/** The subset of a bulk card object this project reads. */
export interface ScryfallCard {
  id: string
  name: string
  set: string
  collector_number: string
  rarity: string
  finishes: string[]
  lang: string
  artist?: string
  image_status?: string
  image_uris?: Record<string, string>
  card_faces?: { image_uris?: Record<string, string>; artist?: string }[]
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

/** Every set in one response. Scryfall does not paginate this endpoint. */
export async function fetchSets(): Promise<ScryfallSet[]> {
  const body = await getJson<{ data: ScryfallSet[]; has_more: boolean }>(`${API}/sets`)
  if (body.has_more) throw new Error('/sets paginated unexpectedly; fetch the next page')
  return body.data
}

interface BulkMeta {
  updated_at: string
  /** Gzipped JSONL, one card per line. Scryfall serves no JSON-array form. */
  jsonl_download_uri: string
  compressed_size: number
}

/**
 * Download the bulk card file, reusing a cached copy of the same upstream build.
 * Scryfall asks that downloads be cached rather than refetched per run.
 */
export async function ensureBulkFile(cacheDir: string): Promise<string> {
  const meta = await getJson<BulkMeta>(`${API}/bulk-data/default-cards`)
  const stamp = meta.updated_at.replace(/[^0-9]/g, '')
  const target = join(cacheDir, `default-cards-${stamp}.jsonl.gz`)

  await mkdir(cacheDir, { recursive: true })
  const cached = await stat(target).catch(() => null)
  if (cached?.size === meta.compressed_size) {
    console.log(`  bulk: cached ${target} (${(cached.size / 1e6).toFixed(1)} MB)`)
    return target
  }

  console.log(`  bulk: downloading ${(meta.compressed_size / 1e6).toFixed(1)} MB ...`)
  const res = await fetch(meta.jsonl_download_uri, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok || !res.body) throw new Error(`bulk download -> ${res.status}`)
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(target))

  // Drop older builds so the cache does not grow by 78 MB per upstream release.
  for (const name of await readdir(cacheDir)) {
    if (name.startsWith('default-cards-') && !target.endsWith(name)) {
      await unlink(join(cacheDir, name)).catch(() => {})
    }
  }
  return target
}

/**
 * Stream the gzipped JSONL line by line. The decompressed file is several
 * hundred megabytes, so it is never held in memory as one string.
 */
export async function streamBulkCards(
  path: string,
  onCard: (card: ScryfallCard) => void,
): Promise<number> {
  const lines = createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity,
  })
  let n = 0
  for await (const line of lines) {
    if (!line.trim()) continue
    onCard(JSON.parse(line) as ScryfallCard)
    n++
  }
  return n
}

/**
 * Scryfall asks that set icons be served locally rather than hotlinked, because
 * the artwork changes over time. 1049 sets share 365 icon files.
 */
export async function downloadIcons(uris: Set<string>, dir: string): Promise<number> {
  await mkdir(dir, { recursive: true })
  let done = 0
  for (const uri of uris) {
    const name = iconFileName(uri)
    const target = join(dir, name)
    if (await stat(target).catch(() => null)) {
      done++
      continue
    }
    const res = await fetch(uri, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) {
      console.warn(`  icon: ${name} -> ${res.status}, skipped`)
      continue
    }
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(target))
    done++
    await new Promise((r) => setTimeout(r, 60)) // Scryfall asks for <10 req/s.
  }
  return done
}

/** `https://svgs.scryfall.io/sets/sld.svg?123` -> `sld.svg` */
export function iconFileName(uri: string): string {
  return uri.split('?')[0]!.split('/').pop()!
}
