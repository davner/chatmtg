/**
 * Search over every browsable product at once: sets, Secret Lair drops, and
 * preconstructed decks all live in one flat index written to
 * `public/data/search.json`.
 *
 * Matching is tokenised rather than substring, because the names people type
 * are not the names the products carry. "Hatsune Miku Winter" is the real
 * product spelled "Hatsune Miku: Winter Diva", and a substring search finds
 * nothing at all across that colon.
 */

/** Which population an entry came from, and which page it links to. */
export type ProductKind = 'set' | 'drop' | 'deck'

export interface SearchEntry {
  kind: ProductKind
  /** The name printed on the product, shown as the result's title. */
  name: string
  /** Path below the site base, so a caller renders `${base}${href}`. */
  href: string
  /** Set code, product kind, and card count, already joined for display. */
  sub: string
  /** Set code, lowercase. Sets carry their own; a deck carries its set's. */
  code?: string
}

export interface SearchResult {
  entry: SearchEntry
  /**
   * Higher is better. Composed of, in descending weight: the match band, the
   * quality of the individual token matches, whether the name opens on the
   * query, the kind, and the brevity of the name. Only the ordering is
   * meaningful; do not display it.
   */
  score: number
}

/** Bands, best first. A band beats every difference inside the band below it. */
const BAND = {
  /** The query is a set code, spelled exactly. */
  code: 6,
  /** The query is the whole name. */
  exact: 5,
  /** The query opens the name. */
  prefix: 4,
  /** Every token is somewhere in the name. */
  tokens: 3,
  /** Every token is in the name, one of them only after a correction. */
  fuzzy: 2,
} as const

/** How well one query token matched, summed across the query inside a band. */
const QUALITY = { exact: 4, prefix: 3, inside: 2, fuzzy: 1 } as const

/**
 * Below this length a token matches a prefix and nothing else. "sol" is inside
 * "absolute" and one edit from "son" and "soul", so anything more forgiving
 * returns half the catalogue for three letters.
 */
const FUZZY_MIN = 4

/**
 * Long queries are truncated rather than scored in full: past this the extra
 * tokens do not change the ranking, and the score bands assume a bounded sum.
 */
const MAX_TOKENS = 8

/** A set is the thing a code names; a deck merely sits inside one. */
const KIND_RANK: Record<ProductKind, number> = { set: 2, drop: 1, deck: 0 }

const COMBINING = /\p{M}+/gu
const APOSTROPHE = /['’ʼ]/g
const SEPARATOR = /[^\p{L}\p{N}]+/gu

/**
 * Case, accents, and punctuation all have to stop blocking a match: "Jose"
 * finds "José", "urzas" finds "Urza's", and the colon in "Miku: Winter Diva"
 * becomes a word break like any other.
 *
 * An apostrophe closes up rather than splitting, so "Urza's" tokenises as
 * "urzas" and matches what someone types without the punctuation.
 */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING, '')
    .toLowerCase()
    .replace(APOSTROPHE, '')
    .replace(SEPARATOR, ' ')
    .trim()
}

export function tokenize(text: string): string[] {
  const normalized = normalize(text)
  return normalized ? normalized.split(' ') : []
}

interface Prepared {
  entry: SearchEntry
  name: string
  tokens: string[]
  /** The first name token alone, scored against separately when ranking. */
  head: string[]
  code: string
}

/**
 * Normalising 4,190 names costs more than matching them does, so it happens
 * once per index rather than once per keystroke. The index is treated as
 * immutable; a different array, or one that changed length, is prepared again.
 */
const cache = new WeakMap<readonly SearchEntry[], Prepared[]>()

function prepare(index: readonly SearchEntry[]): Prepared[] {
  const hit = cache.get(index)
  if (hit && hit.length === index.length) return hit

  const rows = index.map((entry) => {
    const name = normalize(entry.name)
    const tokens = name ? name.split(' ') : []
    const code = entry.code ? normalize(entry.code) : ''
    // The code is searchable as a token too, so "lcc ahoy" narrows to one deck.
    if (code && !tokens.includes(code)) tokens.push(code)
    return { entry, name, tokens, head: tokens.slice(0, 1), code }
  })
  cache.set(index, rows)
  return rows
}

/**
 * True when one insertion, deletion, or substitution turns `a` into `b`.
 * A bounded walk rather than a Levenshtein matrix: the answer is only ever
 * needed for a distance of one, and this runs on every keystroke.
 */
function withinOneEdit(a: string, b: string): boolean {
  const drift = a.length - b.length
  if (drift > 1 || drift < -1) return false

  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++edits > 1) return false
    if (drift > 0) i++
    else if (drift < 0) j++
    else {
      i++
      j++
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

/** How well a single query token matches an entry, or 0 when it does not. */
function scoreToken(token: string, tokens: string[]): number {
  let best = 0
  for (const candidate of tokens) {
    if (candidate === token) return QUALITY.exact
    if (candidate.startsWith(token)) {
      if (best < QUALITY.prefix) best = QUALITY.prefix
      continue
    }
    if (token.length < FUZZY_MIN) continue
    if (candidate.includes(token)) {
      if (best < QUALITY.inside) best = QUALITY.inside
      continue
    }
    if (best < QUALITY.fuzzy && withinOneEdit(candidate, token)) best = QUALITY.fuzzy
  }
  return best
}

/**
 * Ranked matches, best first. Every token has to land somewhere in the entry,
 * in any order, so "winter miku" and "miku winter" both reach Winter Diva.
 *
 * An empty or punctuation-only query matches nothing rather than everything:
 * the caller shows its own listing when nobody has typed yet.
 */
export function search(
  index: readonly SearchEntry[],
  query: string,
  limit = 20,
): SearchResult[] {
  const normalized = normalize(query)
  if (!normalized) return []

  const tokens = normalized.split(' ').slice(0, MAX_TOKENS)
  const results: SearchResult[] = []

  for (const row of prepare(index)) {
    let quality = 0
    let weakest = QUALITY.exact as number
    let matched = true

    for (const token of tokens) {
      const got = scoreToken(token, row.tokens)
      if (!got) {
        matched = false
        break
      }
      quality += got
      if (got < weakest) weakest = got
    }
    if (!matched) continue

    const band =
      row.code === normalized
        ? BAND.code
        : row.name === normalized
          ? BAND.exact
          : row.name.startsWith(normalized)
            ? BAND.prefix
            : weakest === QUALITY.fuzzy
              ? BAND.fuzzy
              : BAND.tokens

    // A name that opens with a word from the query is likelier the one meant,
    // which is what puts "Duskmourn: House of Horror" above "Alchemy:
    // Duskmourn" for a query neither of them starts with exactly.
    const opensWith = tokens.some((token) => scoreToken(token, row.head) > 0)

    results.push({
      entry: row.entry,
      score:
        band * 1_000_000 +
        quality * 10_000 +
        (opensWith ? 4_000 : 0) +
        KIND_RANK[row.entry.kind] * 1_000 +
        Math.max(0, 999 - row.name.length),
    })
  }

  // Name is the tiebreak, as it is everywhere else, so equal matches keep a
  // stable order between renders.
  results.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
  return results.slice(0, limit)
}
