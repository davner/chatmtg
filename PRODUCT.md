# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro 7 (static output), TypeScript, Tailwind CSS 4, pnpm. Node >= 22.12.
Data is baked at build time by `scripts/build-data.ts`; the site makes no runtime
API calls. Deployed to GitHub Pages at the custom subdomain
`chatmtg.danavner.com`, which serves from the root, so there is no Astro `base`;
`public/CNAME` carries the domain into every deploy. Internal URLs still go
through `src/lib/paths.ts` so the deployment shape is written down once.

## Users

Magic: The Gathering collectors who buy sealed product and want it recorded in a
collection app without typing it in card by card. Public: a visitor arrives cold,
may not know what a set code is, and may have found the site from a link. The
owner is one such collector and the first user.

The visitor's job: "I just bought this product. Give me something I can paste
into ManaBox."

## Product Purpose

Turn "I bought this" into an importable file. Pick a set or a Secret Lair drop,
see its card list rendered in the exact format a collection app wants, copy or
download it.

Success is a visitor landing on a set page and leaving with a correct import
inside a minute, without an account and without reading instructions.

## Positioning

Secret Lair drops are not sets. Every Secret Lair ever printed lives inside one
set code, `sld`, currently 2754 cards across 204 release dates, so no card
database can answer "the Miku drop" - not Scryfall, and not the collection apps
themselves. This site resolves the 735 named drops individually by joining
Scryfall against MTGJSON's per-drop card lists.

That join also settles finish, which Scryfall alone cannot: a drop and its Foil
Edition share one printing whose `finishes` lists nonfoil and foil together, and
only MTGJSON's per-entry flag distinguishes them.

## Operating Context

The visitor has just opened a package. They are on a phone as often as a desktop,
switching between this site and a collection app, and they are copy-pasting or
downloading a file into an import screen. They know the product's marketing name
("Winter Diva"), not its set code or collector numbers.

Collection apps in scope: ManaBox (primary), Moxfield, Archidekt, Deckbox, Dragon
Shield, MTGGoldfish, TCGplayer, TopDecked, Card Kingdom.

## Capabilities and Constraints

- 1049 sets, 117,627 printings, 743 Secret Lair products (735 drops plus 8
  commander decks), all prerendered. Each drop is its own product on the wall,
  because the drop is the thing a collector buys.
- Export as CSV or plain text, per target app, previewed on the page before
  download. The preview and the downloaded file are the same bytes.
- Two sets are far larger than the rest and must not stall the page: `plst`
  (5584 cards) and `prm` (3094).
- Some card lists are incomplete upstream and must say so rather than appear
  empty or complete: 4 drops MTGJSON lists without card entries.
- `Secret Lair Commander Deck Hatsune Miku` (2026-08-10) is served from a
  vendored copy of Wizards' own decklist while MTGJSON's is pending. Its 100
  cards are right; 71 printings are stand-ins because no database has catalogued
  them. Both facts must stay visible on the page, and the vendored file must stop
  being used the moment upstream publishes.
- No export target has been round-tripped through a real import. ManaBox's
  columns match the list ManaBox documents; the rest come from real export
  headers, which is evidence, not proof. The UI must show the difference and
  must never claim an import that has not happened.
- No accounts, no tracking, no analytics, no ads. Static files only.

## Brand Commitments

Name: chatmtg.

Required by the terms of the upstream data, not by preference:

- Card art must carry its artist's name in the same interface (Scryfall).
- Set icons are served locally rather than hotlinked (Scryfall).
- The site carries the Wizards of the Coast Fan Content Policy notice and states
  it is unofficial and not endorsed by Wizards (WotC).
- Scryfall data may not be paywalled, gated behind accounts, or made conditional
  on surveys, subscriptions, or follows (Scryfall).

## Evidence on Hand

- Live Scryfall and MTGJSON data, built into `public/data/`.
- ManaBox CSV header and value vocabulary, taken from a real 3743-row export.
- Export headers for eight further collection apps, from real export samples.
- No user testimonials, usage numbers, press, or endorsements exist. Do not
  invent them, and do not imply affiliation with Wizards, Scryfall, MTGJSON, or
  any collection app.

## Product Principles

1. **Never overstate what the visitor owns.** Export defaults are a starting
   point, not a claim. An import that records the wrong finish is worse than no
   import, because undoing it is manual.
2. **Say what is unverified.** Incomplete card lists, stand-in printings,
   vendored sources, and unproven export targets are labeled in the interface,
   not buried in a README.
3. **The marketing name is the way in.** People search "Winter Diva", not `sld`
   or collector number 1586.
4. **Nothing between the visitor and the file.** No account, no wait, no
   redirect. The list is on the page and the bytes are visible before download.
5. **Ship the credit.** Attribution is part of the product, not a footer
   afterthought to be trimmed.

## Accessibility & Inclusion

No standard was set by the user. The interface's two hard cases are a grid of
1049 image tiles and a table of up to 5584 rows; both must remain keyboard
navigable and must not depend on color alone to convey finish or rarity.
