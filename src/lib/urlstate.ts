/**
 * Filter and sort state lives in the query string, so a view can be bookmarked,
 * shared, and reached with the back button. Held in memory it is lost on every
 * reload, and "all Commander decks, oldest first" is not a thing anyone can send
 * to anyone else.
 */

export type StateShape = Record<string, string | number | undefined>

/** Reads the current query string. Returns nothing during a server render. */
export function readState<T extends StateShape>(defaults: T): T {
  if (typeof window === 'undefined') return defaults
  const params = new URLSearchParams(window.location.search)
  const out = { ...defaults }
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const raw = params.get(key)
    if (raw === null) continue
    out[key] = (typeof defaults[key] === 'number'
      ? (Number(raw) || defaults[key])
      : raw) as T[keyof T & string]
  }
  return out
}

/**
 * Writes state back without adding a history entry per keystroke. Values equal
 * to the default are omitted, so a shared link carries only what was chosen.
 */
export function writeState<T extends StateShape>(state: T, defaults: T): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  for (const key of Object.keys(defaults)) {
    const value = state[key]
    if (value === undefined || value === '' || value === defaults[key]) params.delete(key)
    else params.set(key, String(value))
  }
  const query = params.toString()
  const next = `${window.location.pathname}${query ? `?${query}` : ''}`
  if (next !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(null, '', next)
  }
}
