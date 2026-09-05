# Where the data comes from

Every card list on this site is assembled at build time from three upstream
sources. Nothing is fetched at runtime. This document is the record of which
source answers which question, why, and what each one cannot tell you.

## The short version

| Question | Answered by |
|---|---|
| What sets exist? | Scryfall `/sets` |
| What cards are in a set? | Scryfall bulk `default_cards` |
| What set symbol does a set use? | Scryfall `icon_svg_uri`, downloaded locally |
| What is in a Secret Lair **drop**? | MTGJSON `SLD.json` `decks` |
| Non-foil or foil edition? | MTGJSON's per-entry `isFoil` / `isEtched` |
| What is in a Secret Lair **commander deck**? | MTGJSON `/decks/<file>.json` |
| What is in any **other** preconstructed deck? | MTGJSON `AllDeckFiles.tar.gz` |
| Which *printing* of a reprint ships? | The Wizards decklist announcement |

---

## 1. Scryfall — sets and cards

**`GET https://api.scryfall.com/sets`** returns all 1,049 sets in one response
and does not paginate. The build fails loudly if `has_more` is ever true rather
than silently taking page one.

**`GET https://api.scryfall.com/bulk-data/default-cards`** gives the bulk file
metadata. The download field is **`jsonl_download_uri`** and the payload is
gzipped **JSONL**, one card per line. There is no JSON-array form; anything that
reads `download_uri` is written against an API that no longer exists.

The file is ~78 MB compressed and streamed line by line, never parsed as one
string. It is cached in `.cache/` keyed by the upstream `updated_at`, so repeat
builds do not re-download it — Scryfall asks that consumers cache rather than
refetch.

Requests send an identifying `User-Agent`. Scryfall blocks generic agents.

### What gets kept

Each card is trimmed to what an import needs: Scryfall id, name, collector
number, rarity, finishes, language. That is ~215 bytes per card, so the whole
corpus is ~25 MB of JSON and about 5 MB gzipped.

**Cards with no finish are dropped.** Three cards inside paper sets are
digital-only and report `finishes: []`. They cannot be owned in paper, and every
export row must name a finish, so they are skipped and the count is reported.

### Set icons

`icon_svg_uri` is downloaded to `public/icons/`. Scryfall asks that icons be
served locally rather than hot-linked, because the artwork changes. 1,049 sets
share 365 icon files.

### What Scryfall cannot tell you

Scryfall models a printing, not a product. A Secret Lair drop and its Foil
Edition are **one** printing whose `finishes` lists `nonfoil` and `foil`
together. Scryfall cannot say which of the two you bought, and it has no concept
of "the Miku drop" at all — every Secret Lair ever printed shares the code `sld`.

---

## 2. MTGJSON — what is actually in a product

**`GET https://mtgjson.com/api/v5/SLD.json`** carries a `decks` array. The 735
entries typed `Secret Lair Drop` are the individual products, each with its card
list.

### The finish rule

Finish comes from the **deck entry**, never from the card and never from the
deck's name:

| Entry | Finish |
|---|---|
| `isEtched: true` | etched |
| `isFoil: true` | foil |
| neither key present | nonfoil |

The name suffix "Foil Edition" is not reliable — 174 entries carry `isFoil` in a
deck *not* named Foil Edition. This is the single most consequential rule in the
pipeline: getting it backwards records a foil someone does not own.

**Two models exist, and assuming one is a mistake.** Of 321 Foil Edition pairs,
300 reuse a single printing and separate the editions by the entry flag alone,
while 21 give the foil its own star-suffixed collector number — Sakura Superstar
is `1587` and `1587★`. So a Foil Edition holds the same *cards and quantities* as
its twin, not necessarily the same *printings*. `verify:data` checks all 321
pairs against that rule, which is how the narrower assumption was caught.

### Commander decks are different

The eight Secret Lair **Commander Decks** are typed `Commander Deck`, not
`Secret Lair Drop`, and draw most of their 100 cards from other sets — Goblin
Storm is 63 cards from The List. `SLD.json` only carries their `sld`-exclusive
cards, so joining against it alone would silently drop three quarters of each
deck.

They are read instead from **`/api/v5/decks/<fileName>.json`**, listed in
`DeckList.json`. Those standalone files carry whole card objects with set code,
collector number, and Scryfall id, so no cross-set index is needed.

### Every other preconstructed deck

Secret Lair is one product family of many. MTGJSON publishes 3,029 decks and only
743 are Secret Lair; the rest are commander decks, Jumpstart packs, theme decks,
intro packs, planeswalker decks, and toolkits.

Fetching those one file at a time is 2,285 requests, so the whole archive comes
from **`AllDeckFiles.tar.gz`** (~257 MB), cached by MTGJSON's build version the
way the Scryfall bulk file is. Each file inside carries whole card objects with
set code, collector number, and Scryfall id.

Six product set codes (`q01`–`q08`, the Challenger Decks) exist in MTGJSON but
not in Scryfall's set list. The 22 decks under them resolve card by card and are
kept; only their set breadcrumb has nowhere to point, and `verify:data` reports
them as a note rather than a failure.

### What MTGJSON cannot tell you

Only what it has ingested. A product released before its decklist is imported
appears in `sealedProduct` pointing at a deck that does not exist yet — the
decklists come from a separately-scheduled upstream job
([mtgjson/mtg-sealed-content#512](https://github.com/mtgjson/mtg-sealed-content/issues/512)).

Four drops are listed with no card entries at all. They are shown struck rather
than hidden, so a gap upstream never looks like a search that failed.

---

## 3. Wizards of the Coast — which printing ships

This is the source of truth for **which version** of a reprint is in the box, and
it is the one that is easy to miss.

A decklist announcement such as
`magic.wizards.com/en/news/announcements/secret-lair-commander-deck-hatsune-miku-decklist`
renders as plain card names. But its HTML contains a table:

```
Card Name                | Set Code
Aetherflux Reservoir     | KLD
Angel of Indemnity       | OTC
Boon Reflection          | 2XM
```

The table sits inside a JSON-escaped blob, so tools that read only the rendered
text see names and nothing else. Unescape the page first and the set code for
every reprint is there.

This is the same table MTGJSON's own deck data is transcribed from. Verified by
fetching the **Goblin Storm** announcement — a deck whose true printings MTGJSON
already publishes — and confirming its table matches
(`Frontline Heroism | J25` against MTGJSON's `PLST:J25-15`).

### How it is used

`data/manual/` holds a vendored decklist for any product MTGJSON has not
published. Each entry names either a collector number in the product's own set,
or the set the reprint comes from. Both resolve against card data already on
disk, so no extra API calls are made and nothing can be rate-limited.

Where a set prints a card several times, the **ordinary** printing wins over
showcase and borderless treatments, which are numbered above the main run.

A vendored file is used **only** while MTGJSON has no deck of its own. The first
build after upstream publishes ignores it and logs that it did.

### Corrections

The announcement is not infallible. Corrections are recorded in the data file
with the original value and printed during the build rather than applied
silently:

| Card | Announcement says | Actually |
|---|---|---|
| Nykthos Paragon | `MH3` | `MH2` #22 |

---

## Rate limits and etiquette

| Rule | Where it applies |
|---|---|
| Identify with a real `User-Agent` | Every Scryfall request |
| Keep under 10 requests/second | Scryfall generally |
| 2 requests/second | Scryfall `/cards/collection` |
| Cache downloads rather than refetching | The 78 MB bulk file |
| Serve set icons locally | Scryfall asks for this explicitly |

The build makes roughly 370 Scryfall requests on a cold run — one for the set
list, one for bulk metadata, one bulk download, and 365 icon downloads at 60 ms
apart — plus a handful to MTGJSON. On a warm cache it makes almost none.

A swallowed rate-limit error once produced a 53-card deck that looked complete.
Anything that cannot be resolved now fails the build instead.

---

## Proving it works

| Command | What it covers |
|---|---|
| `pnpm test` | 76 unit tests: the finish rule, slugs, name matching, printing choice, URL joining, language vocabularies, the vendored-list resolver, and every export adapter's exact bytes |
| `pnpm verify:data` | The built data itself: 42 invariants over 1,049 sets, 743 Secret Lair products, and 2,285 precon decks |
| `pnpm test:upstream` | The live sources, against the assumptions below |
| `pnpm check` | Types across the whole project |

### Upstream contract tests

`pnpm test:upstream` checks the assumptions on this page against the live
sources: that `/sets` is unpaginated, that bulk data is still JSONL under
`jsonl_download_uri`, that MTGJSON still separates a Foil Edition by a per-entry
flag, that commander-deck files still carry whole cards, and that the Wizards
announcement still publishes its set-code table.

These break for reasons that are nobody's fault, and a broken assumption makes
the build produce *wrong* data rather than fail, so they run apart from the
deploy: on demand via the **Upstream contract** workflow, and weekly. A scheduled
failure opens an issue; a manual run just reports.

One of them is a reminder rather than an assertion: it reports when MTGJSON has
published a deck that `data/manual/` currently stands in for, which is the signal
to delete the vendored file.

`verify:data` is the one that catches upstream drift, because it inspects what
the run actually produced rather than the code that produced it. It asserts that
every set has a complete card file matching its index count, every icon exists,
every drop resolves to cards carrying Scryfall ids, quantities sum to the stated
count, an empty product carries an explanation, and named anchors still hold —
Winter Diva's two editions differ only by the entry flag, and the Miku deck is
101 cards with every printing matching the Wizards table.

It found three unownable cards on its first run. CI runs it between
`build:data` and `build`, so a deploy cannot ship data that fails it.
