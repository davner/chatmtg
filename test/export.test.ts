import { describe, expect, it } from 'vitest'
import { csvField } from '../src/lib/export/csv.ts'
import { manabox } from '../src/lib/export/manabox.ts'
import { arena, plain } from '../src/lib/export/text.ts'
import type { CardRow, ExportContext } from '../src/lib/export/types.ts'

const CTX: ExportContext = { binder: 'Hatsune Miku: Winter Diva Foil Edition' }

const GIADA: CardRow = {
  name: 'Giada, Font of Hope',
  setCode: 'sld',
  setName: 'Secret Lair Drop',
  cn: '1586',
  rarity: 'rare',
  finish: 'foil',
  qty: 1,
  scryfallId: '89e2d714-2070-434a-9a81-276e72594e06',
  lang: 'en',
  condition: 'near_mint',
}

describe('csv quoting', () => {
  it('quotes only what needs it', () => {
    expect(csvField('Sol Ring')).toBe('Sol Ring')
    expect(csvField('Giada, Font of Hope')).toBe('"Giada, Font of Hope"')
    expect(csvField('Ach! Hans, Run!')).toBe('"Ach! Hans, Run!"')
  })

  it('doubles embedded quotes', () => {
    expect(csvField('Say "Cheese"')).toBe('"Say ""Cheese"""')
  })

  it('quotes fields containing newlines', () => {
    expect(csvField('a\nb')).toBe('"a\nb"')
  })

  it('renders null and undefined as empty', () => {
    expect(csvField(undefined)).toBe('')
    expect(csvField(null)).toBe('')
  })
})

describe('manabox', () => {
  const out = manabox.render([GIADA], CTX)
  const lines = out.split('\n')

  it('emits the exact header ManaBox exports', () => {
    expect(lines[0]).toBe(
      'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency',
    )
  })

  it('emits the exact row', () => {
    expect(lines[1]).toBe(
      '"Giada, Font of Hope",SLD,Secret Lair Drop,1586,foil,rare,1,,89e2d714-2070-434a-9a81-276e72594e06,,false,false,near_mint,en,',
    )
  })

  it('uses LF and no trailing newline, as ManaBox exports do', () => {
    // A stray \r ends up on the last column of every line, the header included,
    // and ManaBox then matches no columns and rejects the entire file.
    expect(out).not.toContain('\r')
    expect(out.endsWith('\n')).toBe(false)
    expect(lines).toHaveLength(2)
  })

  it('spells each finish the way ManaBox does', () => {
    const foilOf = (finish: CardRow['finish']) =>
      manabox.render([{ ...GIADA, finish }], CTX).split('\n')[1]!.split(',')[5]
    expect(foilOf('nonfoil')).toBe('normal')
    expect(foilOf('foil')).toBe('foil')
    expect(foilOf('etched')).toBe('etched')
  })

  it('maps Chinese to ManaBox script codes', () => {
    const langOf = (lang: string) =>
      manabox.render([{ ...GIADA, lang }], CTX).split('\n')[1]!.split(',').at(-2)
    expect(langOf('zht')).toBe('zh_TW')
    expect(langOf('zhs')).toBe('zh_CN')
    expect(langOf('de')).toBe('de')
  })

  it('upper-cases the set code, as ManaBox exports do', () => {
    expect(manabox.render([GIADA], CTX)).toContain(',SLD,')
  })
})

describe('text formats', () => {
  it('writes Arena lines as "qty name (SET) number"', () => {
    expect(arena.render([GIADA], CTX)).toBe('1 Giada, Font of Hope (SLD) 1586')
  })

  it('uses only the front face, which is what Arena accepts', () => {
    const dfc = { ...GIADA, name: 'Ambitious Farmhand // Seasoned Cathar', setCode: 'mid', cn: '2' }
    expect(arena.render([dfc], CTX)).toBe('1 Ambitious Farmhand (MID) 2')
  })

  it('writes names only', () => {
    expect(plain.render([GIADA], CTX)).toBe('1 Giada, Font of Hope')
  })

  it('joins multiple rows with newlines and no trailing blank', () => {
    const two = plain.render([GIADA, { ...GIADA, name: 'Sol Ring', qty: 2 }], CTX)
    expect(two).toBe('1 Giada, Font of Hope\n2 Sol Ring')
  })
})

describe('quantity clamping', () => {
  // The export layer is the last place a bad quantity can be caught before it
  // reaches someone's real collection.
  it('keeps typed quantities inside 0-99', async () => {
    const { clampQty } = await import('../src/components/CardTable.tsx')
    expect(clampQty('-3')).toBe(0)
    expect(clampQty('500')).toBe(99)
    expect(clampQty('2.7')).toBe(2)
    expect(clampQty('')).toBe(0)
    expect(clampQty('abc')).toBe(0)
    expect(clampQty('7')).toBe(7)
  })
})
