import { describe, expect, it } from 'vitest'
import { FORMATS, formatById } from '../src/lib/export/index.ts'
import type { CardRow, ExportContext } from '../src/lib/export/types.ts'

const CTX: ExportContext = { binder: 'Bloomburrow' }

const ROW: CardRow = {
  name: 'Ambitious Farmhand // Seasoned Cathar',
  setCode: 'mid',
  setName: 'Innistrad: Midnight Hunt',
  cn: '2',
  rarity: 'uncommon',
  finish: 'nonfoil',
  qty: 1,
  scryfallId: '54d4e7c3-294d-4900-8b70-faafda17cc33',
  lang: 'en',
  condition: 'near_mint',
}

/** Header lines copied verbatim from each site's own export sample. */
const HEADERS: Record<string, string> = {
  manabox:
    'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency',
  moxfield:
    'Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Tags,Last Modified,Collector Number,Alter,Proxy,Purchase Price',
  archidekt:
    'Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number',
  deckbox:
    'Count,Tradelist Count,Name,Edition,Edition Code,Card Number,Condition,Language,Foil,Signed,Artist Proof,Altered Art,Misprint,Promo,Textless,Printing Id,Printing Note,Tags,My Price,Cost,Rarity,Price,TcgPlayer ID,Scryfall ID',
  dragonshield:
    'Folder Name,Quantity,Trade Quantity,Card Name,Set Code,Set Name,Card Number,Condition,Printing,Language,Price Bought,Date Bought',
  mtggoldfish: 'Card,Set ID,Set Name,Quantity,Foil,Variation,Collector Number,Scryfall ID',
  tcgplayer:
    'Quantity,Name,Simple Name,Set,Card Number,Set Code,Printing,Condition,Language,Rarity,Product ID,SKU',
  topdecked:
    'QUANTITY,NAME,SETCODE,SETNAME,COLLECTOR NUMBER,FINISH,PRICE,RARITY,ID,ACQUIRED DATE,ACQUIRED PRICE,LANG,PRICE SALE,SIGNING,ALTERATION,CONDITION,NOTES,TAGS',
  cardkingdom: 'title,edition,foil,quantity',
}

describe('csv adapters', () => {
  for (const [id, header] of Object.entries(HEADERS)) {
    it(`${id} emits its site's exact header`, () => {
      expect(formatById(id).render([ROW], CTX).split('\n')[0]).toBe(header)
    })

    it(`${id} emits one field per header column`, () => {
      const out = formatById(id).render([ROW], CTX)
      const [head, body] = out.split('\n')
      expect(countFields(body!)).toBe(countFields(head!))
    })
  }
})

describe('finish vocabularies', () => {
  const finishOf = (id: string, finish: CardRow['finish'], col: number) =>
    parseRow(formatById(id).render([{ ...ROW, finish }], CTX).split('\n')[1]!)[col]

  it('moxfield leaves non-foil blank', () => {
    expect(finishOf('moxfield', 'nonfoil', 6)).toBe('')
    expect(finishOf('moxfield', 'foil', 6)).toBe('foil')
    expect(finishOf('moxfield', 'etched', 6)).toBe('etched')
  })

  it('archidekt title-cases the finish', () => {
    expect(finishOf('archidekt', 'nonfoil', 2)).toBe('Normal')
    expect(finishOf('archidekt', 'etched', 2)).toBe('Etched')
  })

  it('mtggoldfish calls non-foil "regular"', () => {
    expect(finishOf('mtggoldfish', 'nonfoil', 4)).toBe('regular')
    expect(finishOf('mtggoldfish', 'foil', 4)).toBe('foil')
  })

  it('topdecked uses the Scryfall spelling', () => {
    expect(finishOf('topdecked', 'nonfoil', 5)).toBe('nonfoil')
    expect(finishOf('topdecked', 'etched', 5)).toBe('etched')
  })

  it('cardkingdom uses a boolean', () => {
    expect(finishOf('cardkingdom', 'nonfoil', 2)).toBe('FALSE')
    expect(finishOf('cardkingdom', 'foil', 2)).toBe('TRUE')
  })

  it('dragonshield has no etched grade, so etched exports as Foil', () => {
    expect(finishOf('dragonshield', 'etched', 8)).toBe('Foil')
  })
})

describe('every format', () => {
  it('quotes the comma in a card name rather than splitting the row', () => {
    for (const f of FORMATS) {
      const out = f.render([{ ...ROW, name: 'Giada, Font of Hope' }], CTX)
      if (f.kind === 'csv') {
        expect(out, f.id).toContain('"Giada, Font of Hope"')
        const [head, body] = out.split('\n')
        expect(countFields(body!), f.id).toBe(countFields(head!))
      } else {
        expect(out, f.id).toContain('Giada, Font of Hope')
      }
    }
  })

  it('renders an empty list without throwing', () => {
    for (const f of FORMATS) expect(() => f.render([], CTX), f.id).not.toThrow()
  })

  it('claims documented status for ManaBox only, and never claims more', () => {
    const documented = FORMATS.filter((f) => f.confidence === 'documented').map((f) => f.id)
    expect(documented).toEqual(['manabox'])
    // Nothing may claim to be import-proven until an import actually proves it.
    for (const f of FORMATS) expect(['documented', 'header-verified']).toContain(f.confidence)
  })

  it('never emits a carriage return, which breaks ManaBox column mapping', () => {
    for (const f of FORMATS) {
      expect(f.render([ROW], CTX), f.id).not.toContain('\r')
    }
  })

  it('gives every format a unique id', () => {
    expect(new Set(FORMATS.map((f) => f.id)).size).toBe(FORMATS.length)
  })
})

/** Minimal RFC 4180 reader, enough to count and read back fields of one row. */
function parseRow(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

function countFields(line: string): number {
  return parseRow(line).length
}
