/** Print finish, spelled the way Scryfall spells it. Adapters translate outward. */
export type Finish = 'nonfoil' | 'foil' | 'etched'

/**
 * Card condition, spelled the way ManaBox spells it. Every collection site has
 * its own vocabulary for these seven grades; adapters translate outward.
 */
export type Condition =
  | 'mint'
  | 'near_mint'
  | 'excellent'
  | 'good'
  | 'light_played'
  | 'played'
  | 'poor'

/** One printing, trimmed to the fields an import needs. */
export interface Card {
  /** Scryfall id. The only identifier every collection site accepts. */
  id: string
  name: string
  /** Collector number. A string: it can carry a star, a letter, or a prefix. */
  cn: string
  rarity: string
  finishes: Finish[]
  lang: string
}

/** A set as it appears in the index grid. */
export interface SetSummary {
  code: string
  /** Scryfall's set id. The only value on the label that identifies this set alone. */
  sid: string
  name: string
  type: string
  released: string
  /** Printings actually written to disk, which can differ from Scryfall's card_count. */
  count: number
  digital: boolean
  parent?: string
  /** Filename under /icons, shared between sets. */
  icon: string
  /** Representative card art for the tile, plus the credit Scryfall's terms require. */
  art?: string
  artist?: string
}

/** One Secret Lair drop: a named product inside the `sld` set. */
export interface DropSummary {
  slug: string
  name: string
  released: string
  count: number
  /** True when every entry in the drop is foil or etched. */
  allFoil: boolean
  /**
   * What the product actually contains. A commander deck mixes finishes, so
   * `allFoil: false` alone would label it NONFOIL, which is wrong.
   */
  finishLabel: 'FOIL' | 'NONFOIL' | 'MIXED'
  /** Set when the drop's card list is known to be incomplete upstream. */
  incomplete?: string
  /** Set when the list came from somewhere other than MTGJSON. */
  provenance?: { name: string; url: string; retrieved: string; note: string }
  /** How many of this drop's printings are stand-ins rather than the real thing. */
  substituted?: number
  /** True for a 100-card Secret Lair Commander Deck rather than a drop. */
  commanderDeck?: boolean
  /** Art from a card in this drop, with the credit Scryfall's terms require. */
  art?: string
  artist?: string
}

export interface DropCard extends Card {
  /** Resolved from the MTGJSON deck entry, not from the card or the drop name. */
  finish: Finish
  qty: number
  /** Set this card's printing belongs to. Commander decks draw from many sets. */
  setCode?: string
  /**
   * True when this printing is a stand-in: the card is right, its actual
   * printing in this product is not catalogued anywhere yet.
   */
  substituted?: boolean
}

export interface DropDetail extends DropSummary {
  cards: DropCard[]
}

/** A preconstructed product from any set: commander deck, Jumpstart, theme deck. */
export interface DeckSummary extends DropSummary {
  setCode: string
  /** MTGJSON's deck type, shown as the product's kind. */
  kind: string
}

export interface DeckDetail extends DeckSummary {
  cards: DropCard[]
}

/** What a product contains, from its resolved cards. */
export function finishLabelOf(cards: { finish: Finish }[]): DropSummary['finishLabel'] {
  if (!cards.length) return 'NONFOIL'
  const anyFoil = cards.some((c) => c.finish !== 'nonfoil')
  const anyPlain = cards.some((c) => c.finish === 'nonfoil')
  return anyFoil && anyPlain ? 'MIXED' : anyFoil ? 'FOIL' : 'NONFOIL'
}
