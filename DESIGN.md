# Signal — TableX's design system

> A cream desk with one card on it, and under it the network at night: the sky fades down
> into pixel hills, lattice masts, coverage arcs, and the ghost walking between them. Pine
> ink, one mint — and every press answers the way the sites do: it transmits.

**Theme:** light (cream), with a dark theme that is the floor's night carried up the page.
**Adopted:** 2026-09-29, replacing the Mintlify reference system of 2026-09-04. Revised the
same day on Elad's review: the hero came out, the scene became the home page's floor, the
databases got their own view, the page's explanation moved behind a "?", and white became cream.
**Lives in:** `TableX/css/main.css` (tokens at the top, MOTION at the bottom) and
`TableX/js/motion.js`.

---

## Why it changed

The Mintlify system made the app quiet, and that part was right. It was also
recognisably *somebody else's* quiet: a pure-grey canvas that had nothing to do with the
teal hero above it, an all-caps tracked eyebrow over every heading, four identical
floating cards for the four databases, and buttons that changed colour and did nothing
else. Signal keeps the quiet and makes it TableX's own:

- **The page is cream, not white** (by request): a warm desk with lighter cream cards on
  it, which is also what lets a card read as a card without a heavy shadow. The report sheet
  stays pure white, so it is the one piece of paper on the desk.
- **The clearer the screen, the better.** Home is one card. Explanation lives behind a "?";
  the databases live on their own page; the illustration is the floor the page stands on.
- **The pixel is the one unit of ornament.** The ghost, the scene and the icon are all
  drawn on a pixel grid, so every status marker — eyebrow, DB state, paste hint, chip,
  bullet — is a small square, never a dot.
- **Every button moves, and the move says what it does.** See Motion.

## Tokens — colour

The old token *names* are kept so no component had to be renamed; read `--mist` as
"field" and `--cloud` as "rule-strong".

| Token | Light | Dark | Role |
|-------|-------|------|------|
| `--canvas` | `#f4f1e8` | `#08110e` | The page: body, nav, toolbar, loader, the paste well — and the top of the floor's sky |
| `--paper` | `#fbf9f3` | `#0c1713` | Everything ON the page: cards, modals, inputs, the text on a filled button |
| `--mist` (field) | `#ece8dc` | `#111e19` | Tracks, hover washes, the report's surround |
| `--rule` | `#e2ddd0` | `#182822` | Hairlines, card and ledger borders |
| `--cloud` (rule-strong) | `#cbc4b3` | `#26392f` | Input borders, hover outlines, empty counts |
| `--ink` (pine) | `#0f1f1a` | `#e8f2ee` | Headings, the filled button |
| `--black` | `#1e2a23` | `#d5e2dc` | Body text |
| `--muted` | `#676657` | `#8aa097` | Secondary text |
| `--mint` (signal) | `#0b7d53` | `#2fd393` | The one accent: active state, focus, rings, loaded |
| `--err` | `#a3302a` | `#f08c84` | Destructive actions only |

Light-mode mint is a shade deeper than the ghost's `#0c8c5e` so 14px mint text still clears
4.5:1 on cream. `--ink` and `--paper` **swap** in dark rather than both darkening: `--ink` is the
filled-button surface and `--paper` the text on it, so the button inverts correctly with
no per-component rule.

Shadows are tinted with the pine (`rgba(15, 31, 26, …)`), never neutral grey, and stay
small: `--sh-card` is a 1px lift, `--sh-float` is reserved for things that actually float
(the paste card, popovers, modals, the toast, a lifted primary button).

**Mint is never a large surface.** It is a line, a square, a ring, a word — the moment
something is switched on. A second accent colour is never introduced for the app chrome.

## Tokens — type

| Face | Role |
|------|------|
| **IBM Plex Sans Hebrew** | The app, in both scripts — it carries Plex Sans' Latin |
| **IBM Plex Mono** | Codes: cell ids, EARFCNs, the paste box, the column legend |
| Inter + Heebo | **The report preview only** (`.doc-page`) — see invariant 1 |

Plex is an engineered face for an engineering tool, and it has a real Hebrew design rather
than a borrowed one. The mono is not decoration here: half of this app's content is codes,
and codes have to line up and must never be mistaken for words.

Scale (Bringhurst's): **12 · 14 · 16 · 18 · 21 · 24 · 36 · 60**. Weights 400 / 500 / 600.

| Role | Size | Notes |
|------|------|-------|
| Hero | 60 | 600, −0.02em, `text-wrap: balance` (40 → 34 on small screens) |
| Section title | 36 | 600, −0.015em |
| Modal title | 24 | 600 |
| Card title | 21 | 600 |
| Body | 16 | line-height 1.5–1.7 |
| UI / buttons | 14–15 | 500 |
| Captions, meta | 12–13 | |

**No all-caps and no letter-spacing on labels, anywhere.** Hebrew has no case, and a
tracked Latin label shouting above a Hebrew heading was the loudest thing on every page.
Network names print as the proper nouns they are (`Partner`, not `PARTNER`).

All self-hosted in `TableX/fonts/`, built by `python tools/build_fonts.py` (needs internet
once; commit the result). Nothing loads from a CDN.

## Geometry

Three radii, chosen by the size of the thing, never one radius on everything:

| Token | Value | For |
|-------|-------|-----|
| `--r-btn` / `--r-input` | 6px | buttons, inputs, chips |
| `--r-card` | 12px | cards, the ledger, modals, search bars |
| `--r-lg` | 20px | the document sheet |

Status squares are 6px with a 1px radius. No pills, no circles — except the rings, which
are the one round thing in the system because they are the one thing that is a signal.

Page max-width 1200px; section gap 96px; 32px side gutter, 20px under 900px, 16px under 560px.

## Layout

- **Nav** — brand, links, status chip, gear. Nothing in between.
- **Home** — one card: title, *load sample*, the **"?"**, the paste box (a well in the canvas
  colour that comes up to paper when you are in it), the hint (a square that lights when the
  paste parses) and the one filled button.
- **The floor** — the bottom of the home page, full width: a sky that fades down from the
  cream into night (interpolated in oklch — mixed as plain transparency it went grey), the
  pixel landscape at full scale with the ghost walking between the sites, and the footer
  standing on its ground. It is the one bold thing on the page. Switched off in settings, the
  night goes with it and the footer returns to the cream.
- **The "?"** — a five-step walkthrough, Planet → copy → paste → generate → export, each
  step with a small drawing of its subject (the Planet grid, the keys, the paste box with its
  column legend, the report, the export buttons). Steps slide in from the side you are
  reading towards. The last button loads the sample and hands focus to *generate*.
- **Databases** — their own view. The four networks are one instrument, so they sit in ONE ruled
  panel (`.db-ledger`), not four floating cards. Rules are each cell's own end/bottom
  border and the panel clips the outermost ones, which keeps them right at every reflow
  (4 → 2 → 1 columns). A loaded network is marked by a filled mint square, an empty one
  by a hollow one.
- **Views** (databases, lookup, site data, decks) — section head, then the tool.

## Motion

One vocabulary (`--ease-out` to settle, `--spring` for one small overshoot, `--t-fast`
140ms, `--t-med` 260ms), and one signature.

### The signature: a press transmits

Every click on a button sends two thin mint rings out from the point you pressed — the
same coverage arcs the floor's sites emit. Red for a destructive button. A keyboard press
transmits from the button's centre. Rings are drawn in one fixed layer above everything
(`.fx-layer`), **never inside the button**: `app.js` and `i18n.js` rewrite button text
freely, and a child element of ours would be wiped or would leak into a `textContent` read.

List rows and the tiny on-thumbnail controls press but do not transmit — rings off every
search result would be noise, not an answer.

### The press

Anything pressable gives ~5px under the pointer and springs back on release. It is a Web
Animation with `composite: 'add'`, so it stacks on whatever transform a component already
carries — which is what lets one rule in `motion.js` cover every kind of button without
touching every component's transition list.

### Each kind of button's own hover — one move, saying what it does

| Button | Hover |
|--------|-------|
| Primary (pine) | lifts 1px; a mint line draws across its foot from the centre; the arrow steps forward in reading direction |
| Ghost | a field wash grows out from the middle |
| Outline | the border tightens to ink and the button rises to meet it |
| ✕ (every close / remove) | turns a quarter |
| + (add sector, new template, add site) | turns a quarter — it is about to add |
| Gear | turns 45°; open, 90° and mint |
| Brand ghost | lifts off the ground, as the loader's ghost does |
| Chips, credit, template cards | rise with a spring |

**Arrows point the way the page reads** — left in Hebrew, right in English — and step that
way. Hover motion uses the individual `translate` / `rotate` / `scale` properties, never
`transform`, so it composes with a component's own transform and with the press.

### Selection glides

The nav's active link is marked by one mint bar, and every segmented control by one paper
thumb, that **slide** to the new choice (`motion.js` measures; CSS draws from `--ind-x` /
`--ind-w`). A marker that jumps says "you are here"; one that slides also says where you
came from. Until the script has measured, `.on` paints its own tile, so the control is
never wrong, only still.

### Arrivals

- Views rise 8px and fade in; modals rise with a spring from 97%; the scrim fades.
- The report sheet is laid down once, like paper on a desk.
- The theme **sweeps** out as a circle from the button that asked for it (a view
  transition); the language switch cross-fades, because the page is mirroring and a sweep
  across a mirroring page reads as a glitch.
- Copying a value flashes the value you clicked, not only the toast.
- On a first visit the "?" transmits twice once the loader lifts — never again once the
  tour has been opened.

### Restraint

The only motion nobody asked for is the floor's scene, the one page-load entrance and the
first-visit "?" nudge. Nothing
else animates on its own. Under `prefers-reduced-motion` there is no press, no ring, no
sweep, and the markers jump instead of sliding.

## Components

- **Primary button** — pine fill, paper text, 6px, 15/500 (14 small). One per context.
- **Ghost button** — text only until hovered. Destructive ghosts carry `--err`.
- **Outline button** — 1px `--cloud`, for "update / load" beside a ghost.
- **Input / well** — field background and a rule border at rest; paper, a mint border and a
  4px mint-wash ring when focused. The search bars are wells at card radius.
- **Segmented control** — a field track with a sliding paper thumb.
- **Eyebrow** — 14px mint, sentence case, a 6px square before it. Where you are, not a
  category shout.
- **Toast** — pine, 8px radius, springs up from the bottom centre.
- **Focus** — one treatment for every control: a 2px mint outline offset 2px, so it never
  fights a button's own fill.

## Invariants — what this system must never touch

1. **The report is not restyled by the app's design.** Its looks are its OWN three output
   styles, chosen by the user and kept per machine (CLAUDE.md "Output styles"):
   **Classic** — the purple (`#4a3f8c` / `#6b5fb5` / `#f0eeff`) commanders already know, the
   default, unchanged; **Clean** — black on white, rules only; **Coverage** — Clean with the
   levels tinted in Planet's RSRP legend; and, for the site sheet only, **Stylish** — each site
   drawn as it stands, in 2.5D and to scale (the mast, its antennas at their datasheet sizes, a
   wedge and arrow per azimuth on the ground) beside its colour-matched table. None of them
   borrows the app's cream, pine or mint, and none changes with the app's theme. **One
   exception, asked for by name:** the network chip beside a site name (`.tag-net`'s green,
   `NET_CHIP` in app.js) rides the report into print and both PPTX writers. Stylish's tree and
   person are scale references in a diagram of the site's data, not illustration — invariant 2
   is about decorating the working UI. `.doc-page` is also
   **pinned to the type it had before this redesign** — Inter + Heebo, their OpenType
   features, the old system mono for its codes — because the sheet is the deliverable and
   the chrome changing face is no reason for the document to. The PPTX writers use Arial
   and are untouched.

2. **Illustration lives in exactly two places: the home page's floor and the loader.** The
   scene is drawn in nothing but its own teal ramp and one mint, and stays in the floor.
   Neither is licence to illustrate the working UI. (The tour's drawings are diagrams of the
   UI and the data, not illustration.) The scene has a settings switch (תפאורה / Night
   scene).

3. **The dark theme is a token swap only** (`:root[data-theme="dark"]`); every component
   has exactly one definition. Two things the swap must never touch:
   - **The floor's night** (`--hero-top` / `--hero-bot` and the `--sc-*` ramp on `.floor`)
     — dark in *both* themes; the dark theme only deepens it.
   - **`.doc-page`** — hardcoded `#ffffff`, never `var(--paper)`. It previews a white
     PowerPoint slide; the chrome goes cream or pine around it and the sheet stays white,
     the way a PDF viewer works.

4. **The template preview renders somebody else's design.** The Decks editor draws a
   wireframe of the user's own `.pptx` — their background, pictures, type. The system
   governs the frame around it (card, rail, toolbar, mint slot rectangles); inside it,
   whatever colours come out of the file are the ones that belong there.

5. **Nothing is inserted into a button** for motion. See "The signature".

## Do / don't

**Do** keep mint to lines, squares, rings and words · use the pixel square for every
status marker · give each new button kind exactly one hover move that says what it does ·
use `translate` / `rotate` / `scale` for hover motion · put every string in `i18n.js`.

**Don't** add all-caps or tracked labels · add a second accent colour to the chrome · put
a gradient or a blur anywhere outside the floor · put explanation on the home page
(it goes behind the "?") · animate something nobody pressed · restyle the report or the
template preview · append elements to a button to animate it.
