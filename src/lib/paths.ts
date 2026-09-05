/**
 * Astro's BASE_URL carries no trailing slash, so joining it by template literal
 * silently produces `/chatmtgset/blb/`. Every internal URL goes through here.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '')

export function url(path = ''): string {
  const clean = path.replace(/^\/+/, '')
  return clean ? `${BASE}/${clean}` : `${BASE}/`
}
