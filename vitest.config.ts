import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    // Reaches both projects: `extends: true` merges through Vite's config
    // merge, which concatenates arrays into the project rather than replacing
    // them. Moving this into the projects, or deleting it as redundant,
    // silently re-admits the networked contract tests that
    // vitest.upstream.config.ts owns.
    exclude: ['test/**/*.contract.test.ts', 'node_modules/**'],
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'node', include: ['test/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['test/**/*.test.tsx'],
          setupFiles: ['./test/setup.dom.ts'],
        },
      },
    ],
  },
})
