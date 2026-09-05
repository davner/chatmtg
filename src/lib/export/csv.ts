/**
 * RFC 4180 quoting. Card names carry commas ("Tarmogoyf, the Ravenous") and
 * quotes ("Ach! Hans, Run!"), and a split-card name carries `//`, so every field
 * that could contain a delimiter is quoted rather than trusted.
 */
export function csvField(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return ''
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvRow(fields: (string | number | undefined | null)[]): string {
  return fields.map(csvField).join(',')
}

/**
 * LF endings and no trailing newline, matching what these apps export
 * themselves. RFC 4180 says CRLF, but ManaBox splits on \n and keeps the \r,
 * which corrupts the last column of every line — including the header, so the
 * column mapping fails and the whole file is rejected. Every real export
 * sampled from ManaBox, Moxfield, TCGplayer, and TopDecked is LF-only.
 */
export function csvDocument(header: string[], rows: (string | number | undefined | null)[][]): string {
  return [csvRow(header), ...rows.map(csvRow)].join('\n')
}
