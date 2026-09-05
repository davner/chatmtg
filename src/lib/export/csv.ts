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
 * CRLF line endings, because several importers are Windows-first spreadsheet
 * tools and RFC 4180 specifies CRLF. A trailing newline closes the final record.
 */
export function csvDocument(header: string[], rows: (string | number | undefined | null)[][]): string {
  return [csvRow(header), ...rows.map(csvRow)].join('\r\n') + '\r\n'
}
