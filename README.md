# chatmtg

Pick a Magic set, a Secret Lair drop, or any preconstructed deck, and get its
card list in the format your collection app wants.

Secret Lair drops are not sets. Every Secret Lair ever printed lives inside one
set code, `sld` — currently 2754 cards across 204 release dates — so no card
database can answer "the Miku drop". This site resolves the 735 named drops
individually by joining Scryfall against MTGJSON's per-drop card lists.

That join also settles finish, which Scryfall alone cannot: a drop and its Foil
Edition share one printing whose `finishes` lists nonfoil and foil together, and
only MTGJSON's per-entry flag tells them apart.

## Export targets

| Target | Format | Verified how |
|---|---|---|
| ManaBox | CSV | **Imported into ManaBox successfully** |
| Arena / MTGA | text | ManaBox documents its text import as MTGA format; spelling not round-tripped |
| Plain names | text | Quantity and name only |
| Moxfield | CSV | Header and vocabulary from a real 7385-row export |
| Archidekt | CSV | Header from a real export |
| Deckbox | CSV | Header from a real export |
| Dragon Shield | CSV | Header from a real 32-row export |
| MTGGoldfish | CSV | Header and vocabulary from a real 535-row export |
| TCGplayer | CSV | Header and vocabulary from a real 1010-row export |
| TopDecked | CSV | Header and vocabulary from a real 3169-row export |
| Card Kingdom | CSV | Header from a real export |

**Only ManaBox has been round-tripped.** A generated file was imported into the
real app and accepted. The rest are built from real export headers, which is
evidence a site reads them back, not proof. Each format carries its own badge in
the interface — `IMPORT VERIFIED`, `DOCUMENTED`, or `HEADER ONLY` — so the
difference is visible at the moment you copy.

**CSVs are written with LF endings and no trailing newline.** RFC 4180 says CRLF,
but ManaBox splits on `\n` and keeps the `\r`, which lands on the last column of
every line. The header becomes `Purchase price currency\r`, no column matches,
and the entire file is rejected. Every export sampled from ManaBox, Moxfield,
TCGplayer, and TopDecked is LF-only.

ManaBox's docs enumerate the columns it accepts on import: card name, set code or
set name, quantity, foil, collector number, language, condition, purchase price
and currency, misprint, altered, and Scryfall ID. `Binder Name` and `Binder Type`
appear in ManaBox *exports* but are **not** on that list, so this project does not
emit them.

The same concept is spelled differently by every site, which is why each target
owns its own adapter and its own fixture test rather than sharing one function
with flags:

| Target | Non-foil | Foil | Etched | Near mint |
|---|---|---|---|---|
| ManaBox | `normal` | `foil` | `etched` | `near_mint` |
| Moxfield | *(blank)* | `foil` | `etched` | `Near Mint` |
| Archidekt | `Normal` | `Foil` | `Etched` | `NM` |
| Dragon Shield | `Normal` | `Foil` | — | `NearMint` |
| TCGplayer | `Normal` | `Foil` | — | `Near Mint` |
| MTGGoldfish | `regular` | `foil` | — | *(no column)* |
| TopDecked | `nonfoil` | `foil` | `etched` | *(column, unused)* |
| Card Kingdom | `FALSE` | `TRUE` | — | *(no column)* |

## Deploying

Lives at **https://chatmtg.danavner.com**, built by GitHub Actions and served
from GitHub Pages. `.github/workflows/deploy.yml` runs the tests, fetches the
data, builds, and publishes on every push to `main`.

Because it serves from the root of its own subdomain there is no base path;
`astro.config.mjs` sets `site` only. `public/CNAME` ships the custom domain into
`dist/`, which is what stops GitHub Pages resetting the domain on each deploy.

Two things to set once, outside this repo:

| Where | What |
|---|---|
| DNS for `danavner.com` | `CNAME` record, host `chatmtg`, value `davner.github.io` |
| Repo → Settings → Pages | Source: GitHub Actions. The domain fills itself in from `public/CNAME`. |

HTTPS takes a few minutes to provision after DNS resolves; tick "Enforce HTTPS"
once GitHub offers it.

## Running it

Requires Node >= 22.12 and pnpm.

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm build:data` | Fetch Scryfall and MTGJSON into `public/data/` (~50s, downloads 78 MB once) |
| `pnpm dev` | Dev server |
| `pnpm build` | Build the static site into `dist/` (~4200 pages) |
| `pnpm preview` | Serve `dist/` |
| `pnpm test` | 87 unit tests: pipeline rules, sorting, the vendored-list resolver, and every export adapter |
| `pnpm verify:data` | 42 invariants over the built data |
| `pnpm test:upstream` | Live contract checks against Scryfall, MTGJSON, and Wizards |
| `pnpm check` | Typecheck |

`build:data` must run before `build` or `dev` — the pages read from
`public/data/`, which is gitignored and generated. The Scryfall bulk file is
cached in `.cache/` and reused until upstream publishes a new one.

## Loading

Only the first screenful is server-rendered. The wall ships 60 sets and the
Secret Lair index 48 drops; the full catalogue is fetched the moment someone
searches, filters, sorts, or asks for more. That took the home page from 632 KB
to 100 KB of markup, and the Secret Lair page from 372 KB to 60 KB.

Entrance animations move rather than fade. Fading text renders it below 4.5:1
contrast for the length of the fade, which an audit catches and a reader on a
slow device notices.

Lighthouse on mobile: accessibility, best practices, and SEO all 100.

## Verifying it

`pnpm test` proves the rules. `pnpm verify:data` proves the run — it inspects
what was actually written to `public/data/` rather than the code that wrote it.
CI runs both, and `verify:data` sits between `build:data` and `build`, so a
deploy cannot ship data that fails it.

`pnpm test:upstream` checks the live sources against the assumptions the pipeline
is built on. It is deliberately outside the deploy, because it fails for reasons
that are nobody's fault; run it from the **Upstream contract** workflow on
demand, and it runs weekly on its own. That one matters because a changed
upstream does not break the build — it makes the build produce wrong data.

[SOURCES.md](SOURCES.md) documents every upstream source, what each one can and
cannot answer, and the rate limits that apply.

## How it is put together

No runtime API calls. `scripts/build-data.ts` bakes Scryfall and MTGJSON into
static JSON at build time, so the site cannot be rate-limited, has nothing to
keep running, and every click is a local file read.

```
scripts/build-data.ts        Orchestrator
  sources/scryfall.ts        Sets index, bulk JSONL stream, icon download
  sources/mtgjson.ts         SLD.json -> 735 drops, plus 7 commander decks
  sources/manual.ts          Vendored decklists, used only while upstream lacks them
scripts/verify-data.ts       Invariants over the built data; CI gates the deploy on it
src/lib/export/              One adapter per collection site, each fixture-tested
src/components/              React islands; motion is react-spring throughout
public/data/                 Generated: sets.json, sets/<code>.json, drops/<slug>.json
```

Card lists are fetched by the page rather than inlined, because the largest set
runs to 5584 printings and all 1049 set pages would otherwise carry their whole
list in the HTML. Set pages are ~9 KB each as a result.

### Data notes

- Scryfall's bulk endpoint serves gzipped **JSONL** via `jsonl_download_uri`.
  There is no JSON-array download field.
- Set icons are downloaded and served locally, which Scryfall asks for. 1049
  sets share 365 icon files.
- One set disagrees with Scryfall's own count: `fra` writes 49 rows against a
  `card_count` of 47. The build reports mismatches rather than hiding them.

### Everything Secret Lair sells

Beyond the 735 named drops, three product shapes would otherwise be unreachable
and are resolved too: the 8 commander decks, 15 single-card promo and
replacement packs whose contents are loose cards rather than a deck, and 113
superdrop bundles, which are several drops sold as one purchase and can nest
inside each other. A bundle resolves recursively into the union of its members,
so one purchase is one import. 22 products carry no release date upstream; a
bundle borrows the date of the drops inside it, and the rest are listed undated
rather than hidden.

### Preconstructed decks

MTGJSON publishes 3,029 decks; only 743 of them are Secret Lair. The other 2,285
are commander decks, Jumpstart packs, theme decks, intro packs, planeswalker
decks, and toolkits — products people buy sealed and want in a collection just
as much.

They come from `AllDeckFiles.tar.gz`, one ~257 MB download rather than 2,285
requests, cached like the Scryfall bulk file. Each deck file carries whole card
objects, so no cross-set index is needed. A set page lists its own decks, and
the wall's lookup reaches them by name.

Six product set codes (`q01`–`q08`, Challenger Decks) are not in Scryfall's
catalogue. Those 22 decks still resolve card by card, so they ship; only their
breadcrumb has nowhere to point.

### Secret Lair Commander Decks

The eight Secret Lair Commander Decks are 100 cards each and draw most of those
from other sets — Goblin Storm is 63 cards from The List. MTGJSON types them
`Commander Deck` rather than `Secret Lair Drop`, and `SLD.json` only carries their
`sld`-exclusive cards, so they are resolved from the standalone deck files at
`/api/v5/decks/<fileName>.json`, which carry whole card objects.

### Vendored decklists

`data/manual/` holds decklists Wizards has published that no card database has
catalogued yet. A file there is used **only** while MTGJSON has no deck of its
own; the first build after upstream publishes ignores it and says so.

`hatsune-miku.json` is the one that exists today. Seven of the eight Secret Lair
Commander Decks are published; this is the newest and is still pending upstream
(mtgjson/mtg-sealed-content#512 — decklists come from a separately-scheduled job,
so a new product lags its own list).

**Every printing is exact.** The announcement's visible text is only card names,
but its HTML carries a `Card Name | Set Code` table — inside a JSON-escaped blob,
so text extraction misses it. That table is the source of truth for which version
of each reprint ships, and it is what MTGJSON itself is transcribed from.

Set codes resolve against card data already on disk, so the build makes no extra
API calls and cannot be rate-limited. Where a set prints a card several times,
the ordinary printing is taken over showcase and borderless treatments, which are
numbered above the main run.

One correction is recorded in the file: the announcement lists Nykthos Paragon as
`MH3`, but the card exists only in `MH2`. Corrections print during the build
rather than being applied silently.

### Known incomplete upstream

Four drops are listed by MTGJSON without card lists, and are shown struck rather
than hidden, so a gap upstream never looks like a search that failed:
`Oishii! Tokens` and `The Hobbit: Second Breakfast and Beyond`, each in both its
plain and Foil Edition form.

## Credits and terms

Card data from [Scryfall](https://scryfall.com). Secret Lair drop contents from
[MTGJSON](https://mtgjson.com). Set art is shown with its artist credited on each
slab, as Scryfall's terms require.

chatmtg is unofficial Fan Content permitted under the Wizards of the Coast Fan
Content Policy. Not approved or endorsed by Wizards. Portions of the materials
used are property of Wizards of the Coast. © Wizards of the Coast LLC.
