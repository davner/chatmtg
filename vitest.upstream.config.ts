import { defineConfig } from 'vitest/config'

// Live upstream checks: slow, networked, and able to fail for reasons that are
// nobody's fault. Kept out of the normal suite and the deploy.
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.contract.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    retry: 1,
  },
})
