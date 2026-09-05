import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build } from 'esbuild'
import { FORMATS } from '../src/lib/export/index.ts'
import { renderAll } from '../src/lib/export/render.ts'
import type { CardRow } from '../src/lib/export/index.ts'
import type { DropDetail, DropSummary, SetSummary } from '../src/lib/types.ts'

/**
 * Bundles the real components into one self-contained HTML file. The artifact
 * host blocks every external request except Google Fonts, so React, the springs,
 * the styles, and the set art all have to be inlined.
 */

const ROOT = new URL('..', import.meta.url).pathname
const ART = process.env.ART_DIR ?? join(ROOT, '.cache/preview-art')
const OUT = process.env.OUT_FILE ?? join(ROOT, '.cache/slab-label.html')

const CODES = ['sld', 'blb', 'fin', 'otj', 'mh3', 'ltr', 'who', 'dsk', 'mkm', 'lci', 'bro', 'one']
const DROP_SLUG = process.env.PREVIEW_DROP ?? 'secret-lair-commander-deck-hatsune-miku'

async function main() {
  const sets: SetSummary[] = JSON.parse(
    await readFile(join(ROOT, 'public/data/sets.json'), 'utf8'),
  )

  const tiles = []
  for (const code of CODES) {
    const set = sets.find((s) => s.code === code)
    if (!set) throw new Error(`preview set ${code} missing; run build:data first`)
    const art64 = (await readFile(join(ART, `${code}.jpg`))).toString('base64')
    const iconSvg = await readFile(join(ROOT, 'public/icons', set.icon), 'utf8')
      .then((s) => s.replace(/<\?xml[^>]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim())
      .catch(() => undefined)
    tiles.push({ ...set, art64, iconSvg })
  }

  const drop: DropDetail = JSON.parse(
    await readFile(join(ROOT, `public/data/drops/${DROP_SLUG}.json`), 'utf8'),
  )
  const rows: CardRow[] = drop.cards.map((c) => ({
    name: c.name,
    setCode: c.setCode ?? 'sld',
    setName: c.setCode && c.setCode !== 'sld' ? c.setCode.toUpperCase() : 'Secret Lair Drop',
    cn: c.cn,
    rarity: c.rarity,
    finish: c.finish,
    qty: c.qty,
    scryfallId: c.id,
    lang: c.lang,
    condition: 'near_mint',
    substituted: c.substituted,
  }))

  const allDrops: DropSummary[] = JSON.parse(
    await readFile(join(ROOT, 'public/data/drops.json'), 'utf8'),
  )
  // Enough drops for the Secret Lair tab to behave like the real wall.
  const dropSample = allDrops.slice(0, 120)

  const data = {
    tiles,
    drop,
    rows,
    exports: renderAll(FORMATS, rows, { binder: drop.name }),
    incomplete: allDrops.filter((d) => d.incomplete).slice(0, 2),
    dropSample,
    totalDropsAll: allDrops.length,
    totalSets: sets.length,
    totalDrops: allDrops.length,
  }

  const bundled = await build({
    entryPoints: [join(ROOT, 'preview/entry.tsx')],
    bundle: true,
    minify: true,
    format: 'iife',
    jsx: 'automatic',
    target: 'es2022',
    define: { 'process.env.NODE_ENV': '"production"' },
    write: false,
  })
  const js = bundled.outputFiles![0]!.text

  const css =
    (await readFile(join(ROOT, 'src/styles/tokens.css'), 'utf8')) +
    '\n' +
    (await readFile(join(ROOT, 'src/styles/slab.css'), 'utf8'))

  const html = `<title>The Slab Label</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=Spline+Sans+Mono:wght@400;500;700&display=swap">
<style>
${css}
</style>

<!--
THESIS: Every row is a sealed, unarguable record of one exact printing. Refuses
the arcane-fantasy chrome this category ships and the neutral admin table opposite.
OWN-WORLD: Graded-slab certification. Shell, printed label, foil rarity stamp, one
holographic authentication strip. The label is a surface of the slab, so it darkens
with it. Archivo condensed label type over Spline Sans Mono cert data, fixed field
order, every field carrying its printed name.
STORY: The visitor recognizes a product they own, opens it, reads the exact bytes,
and takes the file.
FIRST VIEWPORT: Masthead, then a wall of slabs, each with holo strip, label bar, art
window, fine print. Primary action is opening a slab.
FORM: The Slab Label, candidate 6 of the grounded list; seed key 5425e949.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
-->

<div id="root"></div>
<script>window.__CHATMTG__ = ${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>${js}</script>
`

  await writeFile(OUT, html)
  console.log(`preview: ${OUT} (${(html.length / 1e6).toFixed(2)} MB, js ${(js.length / 1024).toFixed(0)} KB)`)
}

await main()
