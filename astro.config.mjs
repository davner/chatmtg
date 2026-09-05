import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

// Served from the root of its own subdomain, so there is no base path. Internal
// URLs still go through src/lib/paths.ts, which keeps this the only place the
// deployment shape is written down.
export default defineConfig({
  site: 'https://chatmtg.danavner.com',
  output: 'static',
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
})
