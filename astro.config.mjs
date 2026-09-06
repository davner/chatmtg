import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

// Served from the root of its own subdomain, so there is no base path. Internal
// URLs still go through src/lib/paths.ts, which keeps this the only place the
// deployment shape is written down.
export default defineConfig({
  site: 'https://chatmtg.danavner.com',
  output: 'static',
  // A product page costs a navigation before the island can even ask for its
  // card list. Hover is the one strategy that stays at zero requests on a wall
  // of 60 tiles: it waits 80ms of pointer or keyboard focus on a single link,
  // where viewport prefetches everything on screen at once. Astro drops back to
  // prefetching on tap when the connection reports Data Saver or 2g.
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
})
