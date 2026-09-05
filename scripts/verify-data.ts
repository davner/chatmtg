import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Card, DropDetail, DropSummary, SetSummary } from '../src/lib/types.ts'

/**
 * Checks the built data rather than the code that built it. The unit tests prove
 * the rules; this proves the run actually produced what the site will serve, and
 * catches the failure that matters most: upstream data changing shape or going
 * quietly short without anything throwing.
 */

const ROOT = new URL('..', import.meta.url).pathname
const DATA = join(ROOT, 'public/data')
const ICONS = join(ROOT, 'public/icons')

const failures: string[] = []
const notes: string[] = []
let checks = 0

function check(ok: boolean, label: string, detail = '') {
  checks++
  if (!ok) failures.push(detail ? `${label} — ${detail}` : label)
}

const read = <T>(p: string) => readFile(join(DATA, p), 'utf8').then((s) => JSON.parse(s) as T)
const exists = (p: string) => stat(p).then(() => true, () => false)

async function main() {
  const sets = await read<SetSummary[]>('sets.json')
  const drops = await read<DropSummary[]>('drops.json')

  console.log(`verifying ${sets.length} sets and ${drops.length} Secret Lair products\n`)

  // --- sets -----------------------------------------------------------------
  check(sets.length > 1000, 'sets.json holds the full catalogue', `only ${sets.length}`)
  check(
    new Set(sets.map((s) => s.code)).size === sets.length,
    'set codes are unique',
  )

  const iconFiles = new Set(await readdir(ICONS).catch(() => []))
  let cardTotal = 0
  const badSets: string[] = []
  const missingIcons = new Set<string>()

  for (const set of sets) {
    if (!set.code || !set.name || !set.sid) {
      badSets.push(`${set.code}: missing code, name, or scryfall id`)
      continue
    }
    if (!iconFiles.has(set.icon)) missingIcons.add(set.icon)

    const cards = await read<Card[]>(`sets/${set.code}.json`).catch(() => null)
    if (!cards) {
      badSets.push(`${set.code}: no card file`)
      continue
    }
    if (cards.length !== set.count) {
      badSets.push(`${set.code}: index says ${set.count} cards, file holds ${cards.length}`)
    }
    cardTotal += cards.length

    const broken = cards.find((c) => !c.id || !c.name || !c.cn || !c.finishes?.length)
    if (broken) badSets.push(`${set.code}: card "${broken.name ?? '?'}" is missing required fields`)
  }

  check(badSets.length === 0, 'every set has a complete card file', badSets.slice(0, 5).join('; '))
  check(missingIcons.size === 0, 'every set icon was downloaded', [...missingIcons].slice(0, 5).join(', '))
  check(cardTotal > 100000, 'the whole card corpus is present', `only ${cardTotal} printings`)
  notes.push(`${cardTotal.toLocaleString()} printings across ${sets.length} sets`)

  // --- drops ----------------------------------------------------------------
  check(new Set(drops.map((d) => d.slug)).size === drops.length, 'drop slugs are unique')

  const badDrops: string[] = []
  let dropCards = 0

  for (const summary of drops) {
    const drop = await read<DropDetail>(`drops/${summary.slug}.json`).catch(() => null)
    if (!drop) {
      badDrops.push(`${summary.slug}: no detail file`)
      continue
    }
    if (drop.count !== summary.count) {
      badDrops.push(`${summary.slug}: index says ${summary.count}, file says ${drop.count}`)
    }
    // An empty product is allowed only when it says why it is empty.
    if (drop.cards.length === 0 && !drop.incomplete) {
      badDrops.push(`${summary.slug}: no cards and no explanation`)
    }
    const noId = drop.cards.find((c) => !c.id)
    if (noId) badDrops.push(`${summary.slug}: "${noId.name}" has no Scryfall id, so it cannot import`)

    const counted = drop.cards.reduce((n, c) => n + c.qty, 0)
    if (drop.cards.length && counted !== drop.count) {
      badDrops.push(`${summary.slug}: quantities sum to ${counted}, count says ${drop.count}`)
    }
    dropCards += counted
  }

  check(badDrops.length === 0, 'every drop resolves to importable cards', badDrops.slice(0, 5).join('; '))
  notes.push(`${dropCards.toLocaleString()} cards across ${drops.length} Secret Lair products`)

  const incomplete = drops.filter((d) => d.incomplete)
  notes.push(`${incomplete.length} products marked incomplete upstream`)

  // --- anchors --------------------------------------------------------------
  // Named products whose contents are known by hand. If upstream changes shape
  // these fail loudly instead of the site quietly serving something different.
  const foil = await read<DropDetail>('drops/hatsune-miku-winter-diva-foil-edition.json')
  const plain = await read<DropDetail>('drops/hatsune-miku-winter-diva.json')
  check(foil.cards.length === 6 && foil.cards.every((c) => c.finish === 'foil'),
    'Winter Diva Foil Edition is six foils')
  check(plain.cards.length === 6 && plain.cards.every((c) => c.finish === 'nonfoil'),
    'Winter Diva is six non-foils')
  check(
    foil.cards.map((c) => c.id).join() === plain.cards.map((c) => c.id).join(),
    'both Winter Diva editions share one printing, so only the entry flag separates them',
  )

  const miku = await read<DropDetail>('drops/secret-lair-commander-deck-hatsune-miku.json')
  check(miku.count === 101, 'Miku commander deck is 100 cards plus the bonus card', `got ${miku.count}`)
  check(miku.cards.every((c) => !c.substituted), 'no Miku printing is a stand-in')
  check(miku.finishLabel === 'MIXED', 'Miku deck is labelled MIXED, not NONFOIL')
  check(!!miku.provenance?.url, 'Miku deck records where its list came from')

  // Spot-checks straight off the Wizards set-code table.
  const WOTC: Record<string, string> = {
    'Aetherflux Reservoir': 'kld',
    'Angel of Indemnity': 'otc',
    'Boon Reflection': '2xm',
    'Command Tower': 'dsc',
    'Sol Ring': 'blc',
    'Nykthos Paragon': 'mh2',
    'Llanowar Elves': 'gnt',
  }
  for (const [name, code] of Object.entries(WOTC)) {
    const card = miku.cards.find((c) => c.name === name)
    check(card?.setCode === code, `Miku: ${name} is the ${code.toUpperCase()} printing`,
      card ? `got ${card.setCode?.toUpperCase()}` : 'card missing from the deck')
  }

  const commanderDecks = drops.filter((d) => d.commanderDeck)
  check(commanderDecks.length === 8, 'all eight Secret Lair commander decks are present',
    `got ${commanderDecks.length}`)
  for (const deck of commanderDecks) {
    check(deck.count >= 100, `${deck.slug} is a full deck`, `only ${deck.count} cards`)
  }

  // --- report ---------------------------------------------------------------
  for (const n of notes) console.log(`  ${n}`)
  console.log()
  if (failures.length) {
    console.error(`FAILED ${failures.length} of ${checks} checks:\n`)
    for (const f of failures) console.error(`  ✗ ${f}`)
    process.exitCode = 1
    return
  }
  console.log(`all ${checks} checks passed`)
}

await main()
