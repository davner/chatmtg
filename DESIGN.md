# Design

The Slab Label. Recorded from the built world, not from intention.

## The idea

A graded-card slab is a sealed, unarguable record of one exact printing: a hard
shell, a printed label in fixed field order, a foil rarity stamp, one
holographic authentication strip. That is what this product does — it resolves a
thing you bought into a row nothing can argue with, finish included.

It refuses the two arrangements this category always ships: arcane-fantasy chrome
with purple gradients and glowing mana, and the neutral admin table that is its
opposite.

Four disciplines were taken from directions that lost, and each is load-bearing:

| Discipline | What it means here |
|---|---|
| Literal naming | Every field carries its printed name where the value alone is ambiguous |
| The struck mark | Anything incomplete or unverified is hazard-striped, never silently omitted |
| The test strip | The export is read at full fidelity before it commits |
| Billing by scale | The set name is the largest thing on its slab |

## Tokens

All colour lives in `src/styles/tokens.css`. Nothing else declares a literal.

Light is a slab on a lightbox; dark is the same slab under low light. **The label
is a surface of the slab, not a separate white object, so it darkens with it** —
this is the rule that makes dark mode read as one object rather than a white card
pasted onto a dark page.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--ground` | `#d7dce1` | `#0d1012` | Page ground |
| `--ground-2` | `#c8ced5` | `#14181b` | Masthead, footer, art well, proof pane |
| `--panel` | `#e9ecef` | `#1b2124` | Slab and panel body |
| `--text` | `#14171a` | `#dee4ea` | Body ink |
| `--text-soft` | `#454e57` | `#8b959e` | Field names, counts, meta |
| `--label-stock` | `#fbfcfd` | `#232a2e` | The printed label surface |
| `--label-ink` | `#14171a` | `#eef2f6` | Ink on the label |
| `--label-ink-soft` | `#4d565e` | `#97a2ab` | Label fine print |
| `--gold` | `#6f5310` | `#c9a03b` | Foil, and the release stamp |
| `--mythic` | `#8e3413` | `#d96a3c` | Etched |
| `--uncommon` | `#545d66` | `#9aa4ad` | Non-foil |
| `--flag` | `#8e3413` | `#d96a3c` | Struck, and unproven exports |
| `--holo-a/b/c` | teal / violet / amber | brighter | The authentication strip |
| `--shell-lip` / `--shell-well` | white 0.85 / ink 0.09 | white 0.09 / black 0.5 | The welded shell edge |

Themes resolve in three states: bare `:root` carries the full light palette,
`@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme='light'])`
covers the unstamped default, and `:root[data-theme='dark']` covers an explicit
choice. No colour is declared only inside a media or `[data-theme]` block.

**Every light-theme pair clears WCAG AA**, recomputed against the exact surface
each sits on: 5.20 to 7.28. State is never carried by opacity — an unselected
finish chip changes weight and border, it does not fade.

### The welded shell

`--shell-lip` and `--shell-well` are inset shadows carried **inside** `--shadow`
and `--shadow-lift`, not in a separate rule. The lift spring writes `boxShadow`
inline, and `box-shadow` does not compose across declarations — a separate class
rule is silently overwritten.

## Type

| Role | Face | Setting |
|---|---|---|
| Label headings | Archivo | `wdth` 76–80, weight 800, letter-spacing 0 |
| Running text | Archivo | `wdth` 100 |
| Field names, chips, buttons | Archivo | `wdth` 70–88, uppercase, tracked 0.06–0.16em |
| Cert data, counts, the proof | Spline Sans Mono | tabular numerals |

The condensed axis is the label voice and belongs on names. Body copy stays at
normal width. Anything that is a number in a column gets `tabular-nums`.

## Components

| Class | What it is |
|---|---|
| `.slab` | A set. Holo strip, label bar, art window, fine print. Lifts on hover and focus. |
| `.labelbar` | The printed label: name, then a fixed CODE / YEAR / CARDS row |
| `.window` | Card art behind a shell gloss, with the set symbol stamped in the corner |
| `.fineprint` | Artist credit and the cert |
| `.dropcard` | A Secret Lair drop in a compact list |
| `.dropslab` | A Secret Lair drop as a wall tile: label and fine print, no art window |
| `.panelbox` | Any framed surface — card table, export pane, struck notice |
| `.chip` | Finish, named in words: NONFOIL / FOIL / ETCHED / STRUCK |
| `.badge` | DOCUMENTED or HEADER ONLY, on an export format |
| `.chip.sub` | A stand-in printing: right card, wrong version |
| `.sourced` | A card list that came from somewhere other than MTGJSON |
| `.struck` | Hazard diagonals over anything incomplete upstream |

Set symbols are CSS-masked rather than `<img>`, so a stamp takes the ink of its
kind. The stamp's colour names what kind of product the set is, matching the
filter tabs — it is not keyed to card count, which would encode nothing.

The cert is the first 8 of Scryfall's set id. It was briefly the card count
padded to five digits, which looked like a serial and certified nothing; on a
page whose thesis is an unarguable record, that field has to be real.

## Motion

React Spring throughout. `useReducedMotion()` is called in `SetWall`,
`SetExporter`, and `DropIndex` — it assigns react-spring's global
`skipAnimation` internally, so its return value is deliberately unused, and every
island that animates must call it.

| Where | Spring | Why |
|---|---|---|
| Slab hover and focus | `useSpring` | Lifts off the lightbox; the strip catches light |
| The wall, the drop index | `useTrail` | Slabs arrive in reading order |
| Format switch | `useTransition` | One proof sheet crosses over the next |
| Copy | `useSpring` | Confirmation |

The trail does not use `reset`, so filtering does not re-run 60 entrances per
keystroke.

## Layout

`.wrap` owns **only** the inline axis (`padding-inline`). It once used the
`padding` shorthand, which silently zeroed the vertical padding `section` sets,
because a class beats an element selector — vertical rhythm came from margins
alone and nobody could see why. Sections own the block axis.

The export pane is ordered above the card table below 900px, because the export
is why the visitor is here. That order lives on `.exportcol` / `.tablecol`, real
elements **inside** the island: `.opened`'s only child is an `<astro-island>`
with `display: contents`, and `order` on such a box does not move the children it
contributes to the grid.

Tables page at 200 rows; two sets run past 3000 printings.

## Rules this system keeps

1. **Never overstate what the visitor owns.** Export defaults are a starting
   point and the page says so.
2. **Say what is unverified.** Incomplete card lists are struck, stand-in
   printings are chipped `SUB`, vendored lists carry their source and date, and
   export targets are badged for how far they have actually been proven. No
   badge claims an import that has not happened.
3. **Never carry meaning in colour alone.** Finish is a word before it is a hue.
4. **A control never promises what it cannot do.** A blocked download says so
   rather than sitting there inert.
5. **Attribution ships.** Artist per slab, sources in the footer, the WotC Fan
   Content notice, and an accurate statement of what leaves the browser.

## Known distance to the ceiling

Recorded so nobody mistakes it for finished: there is no grade on the label,
which is the defining feature of a real slab; the holo strip is the same on every
element, so it authenticates nothing in particular; there is no ornament,
microprint, or registration mark; and the strip and gloss are CSS rather than
produced rasters, because no image generation was available. Card art is
hot-linked from Scryfall while the 365 set icons are served locally — the build
already proves it can self-host.
