import { describe, expect, it } from 'vitest'
import { url } from '../src/lib/paths.ts'
import { archidektLang, languageName, manaboxLang } from '../src/lib/export/lang.ts'

describe('internal urls', () => {
  // Joining BASE_URL by template literal once produced `/chatmtgset/blb/` on
  // every link in the site, because BASE_URL carries no trailing slash.
  it('joins without doubling or dropping the separator', () => {
    expect(url()).toBe('/')
    expect(url('set/blb/')).toBe('/set/blb/')
    expect(url('/set/blb/')).toBe('/set/blb/')
    expect(url('data/sets/blb.json')).toBe('/data/sets/blb.json')
  })

  it('never returns a bare empty string, which would be a relative link', () => {
    expect(url('')).toBe('/')
  })
})

describe('language vocabularies', () => {
  it('splits Chinese by script the way each site does', () => {
    expect(manaboxLang('zhs')).toBe('zh_CN')
    expect(manaboxLang('zht')).toBe('zh_TW')
    expect(languageName('zhs')).toBe('Simplified Chinese')
    expect(languageName('zht')).toBe('Traditional Chinese')
    expect(archidektLang('zht')).toBe('ZH_TW')
  })

  it('passes English through in each site’s own spelling', () => {
    expect(manaboxLang('en')).toBe('en')
    expect(languageName('en')).toBe('English')
    expect(archidektLang('en')).toBe('EN')
  })

  it('passes an unknown code through rather than inventing one', () => {
    expect(manaboxLang('qya')).toBe('qya')
    expect(languageName('qya')).toBe('qya')
  })
})
