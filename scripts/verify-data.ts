import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { finishLabelOf } from '../src/lib/types.ts'
import type { Card, DeckDetail, DeckSummary, DropDetail, DropSummary, SetSummary } from '../src/lib/types.ts'

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

async function main() {
  // Verifying output means there has to be output. Saying so beats a stack
  // trace from a missing file.
  if (!(await stat(join(DATA, 'sets.json')).then(() => true, () => false))) {
    console.error('No built data found. Run `pnpm build:data` first.')
    process.exitCode = 1
    return
  }

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

  // --- rules that hold for every product, including ones added later --------
  // The hand-written anchors below only cover products someone thought to list.
  // These catch a new product that arrives broken.

  const setIndex = new Map(sets.map((s) => [s.code, s]))
  const cardIndex = new Map<string, Set<string>>()
  const crossRef: string[] = []
  const labelWrong: string[] = []
  const badDates: string[] = []
  const undatedProducts = new Set<string>()
  const badProvenance: string[] = []
  const byName = new Map<string, DropDetail>()

  for (const summary of drops) {
    const drop = await read<DropDetail>(`drops/${summary.slug}.json`).catch(() => null)
    if (!drop) continue
    byName.set(drop.name, drop)

    if (drop.released && !/^\d{4}-\d{2}-\d{2}$/.test(drop.released)) {
      badDates.push(`${drop.slug}: released "${drop.released}"`)
    }
    if (!drop.released) undatedProducts.add(drop.slug)
    if (drop.provenance && !(drop.provenance.url && drop.provenance.retrieved)) {
      badProvenance.push(`${drop.slug}: provenance without a url and date`)
    }
    if (drop.cards.length && finishLabelOf(drop.cards) !== drop.finishLabel) {
      labelWrong.push(`${drop.slug}: labelled ${drop.finishLabel}, cards say ${finishLabelOf(drop.cards)}`)
    }

    // Every card must point at a printing that actually exists in that set.
    for (const card of drop.cards) {
      const code = card.setCode ?? 'sld'
      if (!setIndex.has(code)) {
        crossRef.push(`${drop.slug}: "${card.name}" names set ${code.toUpperCase()}, which does not exist`)
        continue
      }
      let numbers = cardIndex.get(code)
      if (!numbers) {
        const cards = await read<Card[]>(`sets/${code}.json`).catch(() => [])
        numbers = new Set(cards.map((c) => c.cn))
        cardIndex.set(code, numbers)
      }
      if (!numbers.has(card.cn)) {
        crossRef.push(`${drop.slug}: "${card.name}" ${code.toUpperCase()} #${card.cn} is not in that set`)
      }
    }
  }

  check(crossRef.length === 0, 'every drop card points at a printing that exists',
    crossRef.slice(0, 5).join('; '))
  check(labelWrong.length === 0, 'every finish label matches its own cards',
    labelWrong.slice(0, 5).join('; '))
  check(badDates.length === 0, 'every release date is a real date', badDates.slice(0, 3).join('; '))
  if (undatedProducts.size) {
    notes.push(`${undatedProducts.size} products carry no release date upstream`)
  }
  check(badProvenance.length === 0, 'a vendored list always says where it came from',
    badProvenance.slice(0, 3).join('; '))

  // A Foil Edition holds the same cards in the same quantities as its twin, all
  // in a foil finish. It does NOT always hold the same printings: some drops
  // reuse one printing and separate the editions by the entry flag alone, while
  // others give the foil its own star-suffixed collector number.
  const twinProblems: string[] = []
  let twins = 0
  let sharedPrinting = 0
  const tally = (cards: DropDetail['cards']) => {
    const m = new Map<string, number>()
    for (const c of cards) m.set(c.name, (m.get(c.name) ?? 0) + c.qty)
    return [...m].sort().map(([n, q]) => `${q}x${n}`).join('|')
  }

  for (const [name, foilDrop] of byName) {
    if (!name.endsWith(' Foil Edition')) continue
    const plainDrop = byName.get(name.slice(0, -' Foil Edition'.length))
    if (!plainDrop || !plainDrop.cards.length || !foilDrop.cards.length) continue
    twins++

    if (tally(foilDrop.cards) !== tally(plainDrop.cards)) {
      twinProblems.push(`${foilDrop.slug}: holds different cards from its non-foil twin`)
      continue
    }
    if (!foilDrop.cards.every((c) => c.finish !== 'nonfoil')) {
      twinProblems.push(`${foilDrop.slug}: a Foil Edition containing a non-foil card`)
    }
    if (plainDrop.cards.some((c) => c.finish !== 'nonfoil')) {
      twinProblems.push(`${plainDrop.slug}: a non-foil edition containing a foil card`)
    }
    if (foilDrop.cards.map((c) => c.id).sort().join() === plainDrop.cards.map((c) => c.id).sort().join()) {
      sharedPrinting++
    }
  }
  check(twinProblems.length === 0,
    `all ${twins} Foil Edition pairs hold the same cards in the right finish`,
    twinProblems.slice(0, 5).join('; '))
  notes.push(
    `${twins} Foil Edition pairs verified — ${sharedPrinting} share one printing, ` +
      `${twins - sharedPrinting} use separate foil printings`,
  )

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

  // --- preconstructed decks from every other set ----------------------------
  const decks = await read<DeckSummary[]>('decks.json')
  check(decks.length > 2000, 'the precon catalogue is present', `only ${decks.length}`)
  check(new Set(decks.map((d) => d.slug)).size === decks.length, 'deck slugs are unique')
  check(decks.every((d) => d.setCode !== 'sld'), 'Secret Lair is not duplicated into the decks list')

  const badDecks: string[] = []
  const orphanSets = new Set<string>()
  let deckCards = 0
  for (const summary of decks) {
    // A product set Scryfall does not carry is fine as long as the cards do
    // resolve; only the breadcrumb has nowhere to point.
    if (!setIndex.has(summary.setCode)) orphanSets.add(summary.setCode)
    if (!summary.kind) badDecks.push(`${summary.slug}: no product kind`)
    const deck = await read<DeckDetail>(`decks/${summary.slug}.json`).catch(() => null)
    if (!deck) {
      badDecks.push(`${summary.slug}: no detail file`)
      continue
    }
    if (!deck.cards.length) badDecks.push(`${summary.slug}: no cards`)
    const noId = deck.cards.find((c) => !c.id)
    if (noId) badDecks.push(`${summary.slug}: "${noId.name}" has no Scryfall id`)
    const strayCard = deck.cards.find((c) => c.setCode && !setIndex.has(c.setCode))
    if (strayCard) {
      badDecks.push(`${summary.slug}: "${strayCard.name}" names set ${strayCard.setCode}`)
    }
    const counted = deck.cards.reduce((n, c) => n + c.qty, 0)
    if (counted !== deck.count) {
      badDecks.push(`${summary.slug}: quantities sum to ${counted}, count says ${deck.count}`)
    }
    deckCards += counted
  }
  check(badDecks.length === 0, 'every precon deck resolves to importable cards',
    badDecks.slice(0, 5).join('; '))
  if (orphanSets.size) {
    notes.push(
      `${orphanSets.size} product sets are not in Scryfall's catalogue ` +
        `(${[...orphanSets].join(', ')}); their cards still resolve`,
    )
  }
  notes.push(
    `${deckCards.toLocaleString()} cards across ${decks.length} precon decks in ` +
      `${new Set(decks.map((d) => d.setCode)).size} sets`,
  )

  // The products this was built to surface, named so a regression is obvious.
  for (const [slug, label] of [
    ['lcc-ahoy-mateys', 'Ahoy Mateys'],
    ['sos-lifegain', 'Lifegain'],
    ['ecl-angels', 'Angels'],
  ] as const) {
    const found = decks.find((d) => d.slug === slug)
    check(!!found && found.count > 0, `${label} is reachable`, found ? '' : 'missing')
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
