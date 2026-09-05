import type { CardRow, ExportContext, ExportFormat } from './types.ts'

/** One format's output plus the labelling the UI shows beside it. */
export interface RenderedFormat {
  id: string
  label: string
  ext: string
  confidence: ExportFormat['confidence']
  note: string
  body: string
}

/** Pre-render every format so switching is instant and the preview cannot drift. */
export function renderAll(
  formats: ExportFormat[],
  rows: CardRow[],
  ctx: ExportContext,
): RenderedFormat[] {
  return formats.map((f) => ({
    id: f.id,
    label: f.label,
    ext: f.ext,
    confidence: f.confidence,
    note: f.note,
    body: f.render(rows, ctx),
  }))
}
