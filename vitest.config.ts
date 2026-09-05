import { defineConfig } from 'vitest/config'

// Contract tests reach the network and are excluded here on purpose; they run
// from vitest.upstream.config.ts via `pnpm test:upstream`.
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.contract.test.ts', 'node_modules/**'],
  },
})
