import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Build-time reads resolve from the project root. `import.meta.url` would point
 * at the bundled chunk under dist/ once Astro compiles these pages.
 */
export async function readData<T>(relative: string): Promise<T> {
  return JSON.parse(await readFile(join(process.cwd(), 'public/data', relative), 'utf8')) as T
}
