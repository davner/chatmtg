/**
 * Recently opened products, held in localStorage and nowhere else. The footer
 * promises nothing leaves the browser, so this history carries no identifier
 * and has no server side.
 *
 * Every read treats what is in the key as hostile: another site on the same
 * origin, an older shape of this list, or a half-written value can all be
 * sitting there, and none of them may reach the UI as a thrown error.
 */

export const RECENT_KEY = 'chatmtg:recent'

/** Enough to hold one shopping haul without turning the strip into a second wall. */
export const RECENT_LIMIT = 8

export type ProductKind = 'set' | 'drop' | 'deck'

/** What a product page knows about itself at the moment it is opened. */
export interface RecentProduct {
  /** Already joined through `url()`, so it is the link the strip renders. */
  href: string
  name: string
  kind: ProductKind
  /** Printings in the product, where the page states one. */
  count?: number
}

export interface RecentEntry extends RecentProduct {
  /** Epoch ms, used for ordering alone. */
  at: number
}

const KINDS: readonly string[] = ['set', 'drop', 'deck']

/**
 * Touching `localStorage` throws outright when a browser blocks storage, so the
 * property lookup itself sits inside the guard rather than the calls below it.
 */
function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function entryOf(value: unknown): RecentEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const { href, name, kind, count, at } = value as Record<string, unknown>
  if (typeof href !== 'string' || !href) return null
  if (typeof name !== 'string' || !name) return null
  if (typeof kind !== 'string' || !KINDS.includes(kind)) return null
  if (typeof at !== 'number' || !Number.isFinite(at)) return null

  const entry: RecentEntry = { href, name, kind: kind as ProductKind, at }
  if (typeof count === 'number' && Number.isFinite(count)) entry.count = count
  return entry
}

/** Newest first, deduplicated by href, capped. Never throws. */
export function readRecent(): RecentEntry[] {
  const raw = readRaw()
  if (!raw) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const entries: RecentEntry[] = []
  for (const item of parsed) {
    const entry = entryOf(item)
    if (entry) entries.push(entry)
  }
  entries.sort((a, b) => b.at - a.at)

  const seen = new Set<string>()
  const out: RecentEntry[] = []
  for (const entry of entries) {
    if (seen.has(entry.href)) continue
    seen.add(entry.href)
    out.push(entry)
    if (out.length === RECENT_LIMIT) break
  }
  return out
}

/**
 * Records one visit and returns the list as the strip should now read it. The
 * returned list stands even when the write fails, so a browser that refuses
 * storage still behaves within the page it is on.
 */
export function recordRecent(product: RecentProduct, now: number = Date.now()): RecentEntry[] {
  const entry = entryOf({ ...product, at: now })
  if (!entry) return readRecent()

  const next = [entry, ...readRecent().filter((e) => e.href !== entry.href)].slice(0, RECENT_LIMIT)
  const s = store()
  if (s) {
    try {
      s.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
      // Quota or a blocked origin. The visit is lost, the page is not.
    }
  }
  return next
}

export function clearRecent(): void {
  const s = store()
  if (!s) return
  try {
    s.removeItem(RECENT_KEY)
  } catch {
    // Nothing to do and nothing worth surfacing: the list is already unreadable.
  }
}

function readRaw(): string | null {
  const s = store()
  if (!s) return null
  try {
    return s.getItem(RECENT_KEY)
  } catch {
    return null
  }
}

const DATA_DIR: Record<ProductKind, string> = { set: 'sets', drop: 'drops', deck: 'decks' }

/**
 * The card list a product page fetches after its HTML lands. Warming the page
 * alone still leaves the island waiting on this file, which is the request the
 * skeleton is actually showing.
 *
 * Derived from the href rather than passed in, so a caller with nothing but a
 * link can warm it.
 */
export function dataUrlFor(href: string): string | null {
  const path = href.split(/[?#]/)[0] ?? ''
  const parts = path.split('/').filter(Boolean)
  const slug = parts.at(-1)
  const kind = parts.at(-2)
  if (!slug || !kind || !KINDS.includes(kind)) return null

  const prefix = parts.slice(0, -2).join('/')
  return `/${prefix ? `${prefix}/` : ''}data/${DATA_DIR[kind as ProductKind]}/${slug}.json`
}

/**
 * A wall of 60 tiles under a sweeping cursor must not become 60 downloads, so
 * warming is bounded per page load as well as deduplicated.
 */
export const WARM_LIMIT = 6

const warmed = new Set<string>()

interface Metered {
  saveData?: boolean
  effectiveType?: string
}

/** Someone on Data Saver or 2g is paying for a page they have not opened yet. */
function metered(): boolean {
  const nav = globalThis.navigator as (Navigator & { connection?: Metered }) | undefined
  const c = nav?.connection
  return c?.saveData === true || c?.effectiveType === 'slow-2g' || c?.effectiveType === '2g'
}

/**
 * Warms the card list behind a product link. Safe to call on every hover and
 * focus: repeats and links that are not products are dropped here.
 *
 * A low-priority `fetch` rather than `<link rel="prefetch">`, because this is
 * the same request the island will make - same mode, same destination, same
 * credentials - and only an identical request is certain to read back out of
 * the HTTP cache. The body is drained so the transfer finishes and lands there.
 */
export function warmProductData(href: string): void {
  if (typeof window === 'undefined') return
  const url = dataUrlFor(href)
  if (!url || warmed.has(url) || warmed.size >= WARM_LIMIT || metered()) return
  warmed.add(url)

  fetch(url, { priority: 'low' })
    .then((r) => r.arrayBuffer())
    .catch(() => {
      // The island refetches on its own page and reports its own failure there.
    })
}
