# TableX — Planet Point Analysis → PPTX
## Project Guide for Claude

---

## What this app does

TableX takes the **point-analysis output of Planet 7.10** — pasted in as tab-separated text —
and produces the finished, commander-facing Hebrew table of *which cells serve each point and
at what predicted level*, exported as **PPTX** (drop straight into the deck) or **PDF/print**.

Each analysis point ("נקודה") becomes three table rows: the **top-3 strongest servers** at
that point, ranked 1 (strongest) → 3. Planet gives you an **English cell code** and a level.
The deck needs the **Hebrew site name**, plus sector, centre frequency and bandwidth — none of
which are in the point analysis. TableX looks those up from network databases that ship
**inside the app**.

```
Planet point analysis  →  paste  →  EN→HE lookup + sort  →  RTL table  →  PPTX / PDF
```

**The RSRP values are Planet predictions, not measurements.** They are modelled coverage at
that point. Anything this app grows must keep that distinction visible — the output goes in
front of commanders, and a predicted level presented as a measured one is a real problem.

## Why we need it

The RF team works in Planet 7.10. Commanders are shown PowerPoint. Bridging those two by hand
is the whole job this app removes:

- **Planet speaks English codes; the deck must speak Hebrew site names.** A point analysis says
  `LNN4610Da`. The slide has to say `גג בית העם  דישון`, sector `Da`, 1800 MHz, 20 MHz. That
  mapping lives in a **16,510-sector** Planet network export. Looking up three cells per point,
  across seven points, is where the time and the mistakes go.
- **It is 20+ minutes per table, by hand, if you are good.** Reading the points out of Planet,
  translating the names, building the table in PowerPoint, and getting the RTL layout and the
  formatting right takes **20 minutes or more for someone fast in both tools — 30+ for a new
  soldier.** TableX turns that into a paste and a click.
- **Pasting from an RTL sheet reverses the columns.** Copying out of a Hebrew Excel sheet hands
  you the columns backwards. Every manual rebuild is a chance to silently swap the strongest
  and weakest server. TableX bakes the reversal into the parser, so it happens the same way
  every time.
- **Levels are entered positive and must be shown negative.** `85` must print as `-85`.
- **The deliverable must look the same every time.** Same seven columns, same RTL layout, same
  purple styling, same `נק' N` grouping. Commanders read a familiar table faster than a
  correct-but-different one.

So: run the point analysis, paste, click, and the slide is ready.

---

## Sibling projects — same team, same conventions

TableX is the small one. Read these when a convention here needs justifying:

- **`d:\projects\interfex`** — Interfex, LTE interference analyzer. The big one; its `CLAUDE.md`
  is the deepest source of team/network context (OSP and CELLTS machines, ENM, DOGMA, the
  Planet 7.10 drive-test colour legend, the Electron build). It also has the conventions TableX
  copies: `tools/*.py` stdlib-only converters, self-hosted `fonts/`, a `DESIGN.md` holding a
  getdesign style spec.
- **`d:\projects\UbiPlus`** — Ubiqam fleet monitor. Source of the `start.bat` + `server.ps1`
  launcher pattern.

**Dataset overlap worth knowing:** Interfex bundles `interfex_8/data/partner_cells.json`
(14,250 commercial cells, keyed for PCI resolution). TableX's `partner.json` is built from the
same Planet export, keyed for naming. They were cross-checked on 2026-09-04 — **2,898 of 2,899
site names matched byte-for-byte, zero mismatches**, which is the verification that the Hebrew
survives the xlsx→JSON conversion. If either dataset is refreshed, the other is probably stale;
re-run that comparison rather than trusting one blindly.

**Interfex's copy is now the stale side.** TableX's `partner.json` was rebuilt on 2026-09-05 from
the `Partner_May_26_V3` group export (2,899 → 3,129 sites, 14,252 → 16,510 sectors, 558 site
names changed), so the 2026-09-04 cross-check no longer describes two matching datasets.
`partner_cells.json` still predates that refresh. Rebuild it from the same workbook before
relying on the comparison again.

Shared house style: **no internet on the target machines**, so everything is vendored and
nothing loads from a CDN; Hebrew RTL UI; a PowerShell static server started by a `start.bat`;
no build step for the app itself.

---

## How to run it

```
D:\projects\TableX\start.bat
```

Runs `server.ps1`, which serves `TableX/` over `http://localhost:8094/` and opens the browser.
Ports differ deliberately across the family so all three run at once: Interfex 8080,
UbiPlus 8093, TableX 8094.

```powershell
.\server.ps1                 # serve + open browser
.\server.ps1 -NoLaunch       # serve only
.\server.ps1 -Port 8099      # different port
```

**The server has exactly one route beyond static files**: `POST api/db/<network>`, which writes
`TableX/data/<network>.json`. That is what makes an in-app database update stick for everyone
using that copy instead of living in one browser's storage. Everything else is a static file
under the `TableX/` web root (deliberately not the repo root, so the raw source workbooks
beside it are not reachable over HTTP).

`file://` will not work any more — the app `fetch()`es `data/*.json` at startup, which a
`file://` origin blocks. Always go through the server.

**Fully offline.** Libraries and fonts are vendored; nothing loads from a CDN. Keep it that way
— the machines this runs on have no internet.

---

## Repo layout

```
start.bat                     launcher (UbiPlus/Interfex pattern)
server.ps1                    static server + the one DB write route, port 8094
DESIGN.md                     Mintlify style spec — the design system of record
tools/
  build_db.py                 Planet .xlsx → data/<network>.json (stdlib only)
  build_fonts.py              downloads + subsets Inter/Heebo into TableX/fonts/
  build_icon.py               the ghost -> .ico / .png / .svg + the nav snippet
TableX/
  index.html                  whole UI: nav, hero, paste card, DB grid, table view
  css/main.css                the Mintlify system, tokens at the top
  js/app.js                   the entire application, one IIFE
  js/dbparse.js               the workbook contract — runs as a Web Worker
  js/i18n.js                  he/en dictionary + DOM applier (chrome only)
  js/xlsx.full.min.js         SheetJS — vendored, reads an uploaded workbook
  js/pptxgen.bundle.js        PptxGenJS 3.12.0 — vendored, writes the deck
  fonts/                      self-hosted Inter (latin) + Heebo (hebrew), 9 woff2
  data/partner.json           SHIPPED — 3,129 sites / 16,510 sectors, 767 KB
  data/idf.json               empty stub, awaiting data
  data/cellcom.json           empty stub, awaiting data
  data/pelephone.json         empty stub, awaiting data
  favicon.ico                 browser tab (MUST stay under TableX/ to be served)
  img/elad.jpg                builder photo (About the builder)
  img/ghost.svg               standalone ghost mark
icon.ico / icon-256.png       Electron build icons — MUST stay at the repo root
.gitignore                    data/*.bak, icon scratch, build scaffolding
```

**The source workbooks are no longer in the repo.** `TableX/DB/DEMO_DB.xlsx` (5.9 MB) and
`Partner_170924_V3.xlsx` (7.4 MB) were removed on 2026-09-04 along with `preview.txt` — 13 MB of
Planet exports that only ever existed to build `partner.json`, which is committed. They remain in
git history: `git checkout 5ff1091 -- TableX/DB/DEMO_DB.xlsx` brings one back if a rebuild is
needed. `tools/build_db.py` therefore has nothing to run against out of the box; point it at a
fresh Planet export.

`app.js` is one IIFE, no modules, no framework, no build step. Edit and refresh.

---

## The four databases

The app ships with its databases **pre-loaded** — there is no "load a DB" step at startup,
because that step cost a click on every single use and the whole product is speed.

| Slot | Label | State |
|------|-------|-------|
| `idf` | IDF | **empty** — awaiting our own network export |
| `cellcom` | Cellcom | **empty** — added 2026-09-04 |
| `partner` | Partner | **shipped**, 3,129 sites / 16,510 sectors |
| `pelephone` | Pelephone | **empty** — data does not exist yet |

`ours` was renamed to `idf` on 2026-09-04 — the key, the file (`data/ours.json` →
`data/idf.json`), the server whitelist and the label all moved together, rather than leaving an
internal `ours` behind a display name of "IDF". No label is translated any more: all four are
proper nouns, so `label()` is a plain map and the `db.ours` i18n key is gone.

**Adding a fifth network** means touching four places: `NETWORKS` in `app.js`, `$NETWORKS` in
`server.ps1` (the write-route whitelist — a name missing here is rejected 404), `LABELS` in both
`app.js` and `tools/build_db.py`, and a `data/<net>.json` stub. The DB grid is `auto-fit` so it
reflows on its own, and `db.title` is deliberately count-agnostic ("every database") so it does
not become a lie.

All three are fetched at startup from `data/<network>.json`. A missing or empty file is a valid
state, not an error — the card renders as "ריק" with a load button.

### File shape

```jsonc
{
  "network": "partner",
  "label":   "Partner",
  "source":  "DEMO_DB.xlsx",     // which workbook this came from
  "built":   "2026-09-04",
  "sites":   { "MN4610A": "גג בית העם  דישון" },
  "sectors": { "LNN4610Da": ["MN4610A", "Da", 1800, 20] }
}
```

Site names are **deduplicated into `sites`** rather than repeated per sector — a site carries up
to 12 sectors here and the Hebrew name is by far the longest field. That halves the file
(1.26 MB → 673 KB).

### Lookup: sector first, then site

`lookup(code)` walks every loaded network, **sectors first, then sites**:

1. **Sector-id hit** (`LNN4610Da`) → exact. Sector, frequency and bandwidth are the real values
   for the cell Planet named. Row is tagged with its network.
2. **Site-id hit** (`MN4610A`) → **approximate**. The site's name is right, but sector/freq/BW
   come from an arbitrary (first-seen) sector of that site. The row is tagged
   `סקטור משוער` in the app so nobody mistakes it for exact.
3. **No hit** → the raw code is rendered and the code is collected into a warning banner above
   the table.

This is why the DB is keyed per sector: Planet's point analysis reports a cell, and keying per
site made sector/freq/BW an arbitrary pick. The site path survives only as a graceful fallback.

**Networks are auto-detected** — there is no "which operator is this" selector. `NETWORKS` order is the resolution order, so IDF wins if a code somehow appears in two databases. A point served
by a mix of operators resolves correctly, and each row shows its network as a small chip.

### Updating a database

DB card → **עדכן** → pick an `.xlsx`. The browser parses it with SheetJS, POSTs the result to
`api/db/<network>`, and the server writes `data/<network>.json` (keeping one `.bak`). The card
and the nav chip refresh immediately.

**Two workbook layouts are accepted, and both are found by HEADERS, never by tab name** — so a
renamed tab still imports and a sheet we do not need is simply never matched.

**A. Planet group export (multi-sheet) — the normal path.** `Partner_Share`, `Cellcom_Share`,
`Pelephone_Share` and `IDF_Share` are groups the team *already* maintains in Planet, because the
area analysis depends on them being current. So: `export group` → load. There is no cleaning step
and no bespoke sheet to build. Planet appends extra sheets to the workbook after the first
upload and they are ignored, which also means a future Planet version that adds more sheets
still imports.

Two of the seven sheets are used:

| Sheet | Matched by | Gives |
|-------|------------|-------|
| `Sites`   | `Site ID` + a name column, and **no** `Sector ID` | Site ID → Hebrew name |
| `Sectors` | `Sector ID` + `Site ID` + `Band Name`            | the sector row |

Three values are derived, each verified against the shipped `partner.json` across the 14,008
sector ids the two sources share (2026-09-05):

- **The site name comes from `Description`, not `Site Name`.** Planet emits a `Site Name` column
  that is **empty in all 3,129 rows** of the Partner export, while the Hebrew lives in
  `Description`. The parser therefore picks the **best-populated** of `Description` /
  `Site Name` / `Site Name 2` rather than the first one present — keying on the column merely
  *called* "Site Name" builds a database of 3,129 blank names.
- **The sector is the trailing letters of the Sector ID** (`LEA0402Da` → `Da`).
  14,008 / 14,008 exact.
- **Frequency and bandwidth come from `Band Name`** (`1800_20` → 1800 MHz / 20 MHz;
  `700_5_9435` → 700 / 5). **No EARFCN conversion is needed** — Planet already reports MHz here.
  Frequency 14,008 / 14,008 exact; bandwidth 13,984 / 14,008, the 24 differences being a real
  700 MHz carrier change that the export's own `Carrier Bandwidth (MHz)` column confirms.

An explicit `Frequency (MHz)` / `Bandwidth (MHz)` column on the sectors sheet beats the derived
value when one is present. Sites carrying no sectors are dropped: a site no sector points at is
unreachable by any lookup, which is the same rule the site editor applies.

**B. Flat sheet (single-sheet) — the legacy path**, still accepted so older workbooks import. All
six headers in ONE sheet, case- and space-insensitive:

```
Sector ID | Site ID | Site Name | Sector | Frequency (MHz) | Bandwidth (MHz)
```

Flat is tried **first**, which is what keeps `DEMO_DB.xlsx` reproducing its old output exactly —
it turns out to be this same Planet group export with a hand-built `DB` tab appended, and that
hand-built tab is precisely the manual step this path removes.

`tools/build_db.py` implements the *same* contract offline, for building a DB without the app:

```
python tools/build_db.py partner path\to\planet_export.xlsx
```

Keep the two parsers in step — if you change the accepted headers, the derivations or the output
shape in one, change the other. Verify by parsing the same workbook with both and diffing: on
`Partner_May_26_V3.xlsx` and `DEMO_DB.xlsx` they agree on every site and every sector.

**An import REPLACES the database — it does not merge.** A group export filtered to one region
would otherwise quietly shrink a live DB, and the first sign of trouble is a table of
untranslated English codes — the exact failure this app exists to prevent. So if the incoming
sector count is **below 60% of the current one**, the import confirms first (`db.shrink`), and
cancelling leaves the file untouched. A refresh that grows — the normal case — is never
interrupted.

**If the POST fails** (someone opened the page without the server), the parsed DB is still used
for that session and the toast says plainly that it will not persist. Silent in-memory-only
success would be worse than the error.

### Clearing a database

`נקה` on a loaded card empties that network. It POSTs an empty database to the **same
`api/db/<network>` route** the import uses, so the server takes its one `.bak` on the way past —
and the confirm says so out loud, because `data/*.bak` is gitignored and the source workbooks are
no longer in the repo, which makes that rollback copy the only one.

Three deliberate details:

- **The button only renders on a loaded card.** There is nothing to clear on an empty one, and a
  button that is present but inert reads as broken.
- **A failed clear is NOT applied in memory** — deliberately the opposite of a failed import. An
  import that cannot reach the server still leaves the user their parsed work, so it is kept for
  the session with a warning. A clear that cannot reach the server has changed nothing on disk,
  so emptying the card would be a lie that un-tells itself on the next refresh.
- **It writes the same stub shape the empty slots ship with**, so a cleared network is
  byte-identical to one that was never filled. Verified by seeding `idf`, clearing it through the
  UI, and diffing the file against the committed stub — no diff.

When testing this, clear a **stub** network, never `partner`; seed `idf` with a few rows first if
you need a loaded card. Same rule the write route already carries, for the same reason.

### The parse runs in a Worker, and why

Parsing an 8 MB Planet group export is **4–6 s of straight-line CPU**. On the main thread that is
long enough for Chrome to raise **"הדף אינו מגיב" / "page unresponsive"** — alarming in a browser,
unacceptable once TableX is packaged as an exe. So `js/dbparse.js` runs as a Web Worker and
`app.js` only awaits it. Verified in headless Chrome: a 20 ms heartbeat on the main thread ticked
163 times *during* a full Partner import, where a blocking parse would have ticked ~0.

Three things here are load-bearing:

- **`dbparse.js` is loaded BOTH ways** — as a `new Worker('js/dbparse.js')` and as a plain
  `<script>` in `index.html`. As a script it only defines `self.TableXParse`; the `onmessage`
  wiring is behind an `importScripts` check. That is what gives a main-thread fallback when a
  Worker cannot start **without a second copy of the parser that could drift**. `app.js` itself no
  longer references `XLSX` at all — the only reason `xlsx.full.min.js` still loads on the main
  thread is that fallback, which is cheap enough against the loader's own minimum to leave alone.
- **The buffer is structured-cloned, not transferred.** A transfer detaches it in the page, and
  the inline fallback would then have nothing left to parse.
- **Two passes, and the second is the point.** Pass 1 reads with `sheetRows`, so every sheet
  yields its header row for almost nothing; pass 2 re-reads with `sheets: [...]` and fully parses
  **only** the one or two that matched. Reading all seven sheets of the Partner export costs
  ~6.5 s and most of the memory; the two we use cost ~3 s. Pass 1 must therefore choose sheets
  from **headers alone** — which is why it hands pass 2 *every* plausible site sheet and lets
  `bestNameCol` pick the winner from full rows, exactly as `build_db.py` does. Narrowing that to
  one candidate in pass 1 would silently diverge from the Python parser.

---

## Input format

Two formats, auto-detected on **column 0**: *not* a number → Planet paste, a number → legacy.
Lines with fewer than 7 tab-separated columns are silently skipped.

**Planet point analysis**, pasted via an RTL Excel sheet, so it reads right-to-left and the
parser un-reverses it with the `[2, 1, 0]` index map:

```
site_3rd    site_2nd    site_1st    pwr_3rd  pwr_2nd  pwr_1st  point
LIN0625Da   LNE4295Da   LNN4610Da   93       89       85       1
```

- **Column 2 is the strongest**, and becomes rank 1 in the output.
- **Exactly 3 servers per point.** This is the format the report expects, not a limitation —
  the parser is hardwired to 3 and ignores anything past column 7 on purpose. Changing it
  changes the deliverable, so don't generalize it speculatively.
- Levels are typed as **positive** magnitudes and rendered negative. **Decimals are kept**:
  `85` → `-85`, `84.3` → `-84.3`, `84.30` → `-84.3`, `84.333` → `-84.33`. A non-numeric level
  → `-`. One `level()` helper formats the column for both input formats — at most 2 decimals,
  trailing zeros trimmed, and no `-0`. It replaced a `toFixed(0)` that silently rounded a
  pasted `84.3` down to `84` (a real value change in a commander-facing table, reported
  2026-09-04) and a `toFixed(2)` on the legacy path that forced `84.30` in the same column.
  The PPTX builder stringifies `r.power` as-is, so it inherits this automatically.
- A typical job is ~7 points ⇒ 21 rows ⇒ one slide.

**Legacy format** (already-resolved rows, no lookup, level to 2 decimals) is still parsed:
`נקודה | מס"ד | שם אתר | סקטור | תדר | רוחב פס | עוצמה`. Note the two paths differ: legacy
**appends** to a point's group, Planet **replaces** it — two Planet lines with the same point
number means the first is discarded.

---

### What the other three exports actually look like

Captured from Planet on 2026-09-05: the Site Editor for a Cellcom site, plus the `Sites` and
`Sectors` sheets of the Cellcom, Pelephone and IDF group exports. **No workbook has been supplied
for these three — this is read off photographs of a screen.** Treat the column positions as strong
evidence and any parsing rule derived from them as unverified until a real file exists.

| | Site ID | Sector ID | Hebrew name? | Band Name |
|---|---|---|---|---|
| **Partner** | `MN4610A` | `LNN4610Da` | yes, in `Description` | `1800_20` — MHz_BW ✓ |
| **Cellcom** | `14196` | `3634249_270` — ECI_azimuth | yes, in `Description` | `2850_20` — **EARFCN**_BW |
| **Pelephone** | `P935739` | `935739_22` | no — Latin (`EINAV`, `HERMESH`) | `P3M_2600LTE.MIMO 3250_20` |
| **IDF** | `IDF_Amitay` | **`1` / `2` / `3`** | no — `Description` mostly empty | `P3M_750LTE.MIMO 9260_10` |

Partner is the only one of the four that imports cleanly. Three separate blockers stand in the way
of the others, and each now has a guard so the failure is loud instead of silent.

**1. IDF's `Sector ID` is not a key.** It numbers sectors `1` / `2` / `3` *per site*, so the same
value repeats across every site in the network. Keying on it collapses a few hundred sectors into
about four, and the import would report success. Both parsers now **refuse outright** when any
sector code repeats, naming the count and an example. The correct key for IDF is presumably
`Site ID` + `Sector ID`, but which composite Planet's point analysis actually reports is unknown,
so nothing is joined speculatively.

**2. `Band Name` carries an EARFCN for everyone except Partner.** Partner writes `1800_20` and
means 1800 MHz — verified across 14,008 sectors. Cellcom writes `2850_20` in the same column and
means EARFCN 2850, which is band 7 at a **2600** MHz label; the Site Editor confirms it, since that
sector's only ticked band group is `Cellcom_2600`. Checked against 3GPP 36.101 for the three
carriers on Cellcom site 14196:

```
9360_10  -> EARFCN 9360 = band 28,  773.0 MHz   operator label "700"
1400_20  -> EARFCN 1400 = band 3 , 1825.0 MHz   operator label "1800"
2850_20  -> EARFCN 2850 = band 7 , 2630.0 MHz   operator label "2600"
```

Nothing **structural** separates `1800`-the-frequency from `2850`-the-EARFCN — both are
`<int>_<int>`. So the only safe discriminator is whether the number is a frequency an operator
would actually print on a slide, and that is what `BAND_LABELS` is: a derived frequency outside it
becomes `null` and is counted, never guessed. Left unguarded the old rule produced **3 MHz /
2600 MHz bandwidth** for a Pelephone row and **2850 MHz** for a Cellcom one. A blank frequency in
front of a commander is recoverable; a confident wrong one is not.

The import then *asks* rather than refusing (`db.unknownBand`), because the site names may still be
worth having even with the frequency column blank. Refusing is reserved for data loss.

**3. Pelephone and IDF have no Hebrew site names in the export.** Pelephone's `Description` holds
Latin transliterations (`EINAV`, `HERMESH`, `KDUMIM`); IDF's is empty for most rows, with the
identity carried by the Site ID (`IDF_Har_Dov`). This is a **product** problem, not a parsing one:
the entire reason TableX exists is turning an English code into a Hebrew site name for the deck. An
unnamed site falls back to its Site ID in `lookup()`, so a row renders readably rather than blank —
but it renders in Latin. Filling `Description` in Planet, or naming sites through the site editor,
is the fix; the importer cannot invent Hebrew that is not in the file.

### The Cellcom point-analysis code, settled

An earlier reading of `75_3422485_13369` left the leading field ambiguous between azimuth and PCI.
The Site Editor settles it: Cellcom's sector name is `<ECI>_<azimuth>`, and site 14196's nine
sectors are `3634197_70`, `3634198_160`, `3634199_270`, `3634207_70` … whose trailing values are
exactly the azimuths of the three antennas mounted there (70°, 160°, 270°). **The leading field is
the azimuth.**

The ECI arithmetic holds throughout — `ECI = eNodeB ID × 256 + local Cell ID`:

```
site 14196 * 256 = 3634176
  3634197..199 -> cells 21,22,23   carrier 9360_10
  3634207..209 -> cells 31,32,33   carrier 1400_20
  3634247..249 -> cells 71,72,73   carrier 2850_20
```

So a Cellcom point analysis reports the azimuth, the ECI and the site id — the same three values
the `Sectors` sheet holds as `Sector ID` (`ECI_azimuth`) and `Site ID`. **The field ORDER in the
paste is still unconfirmed**, because both samples were photographed from an RTL-rendered table,
where a run of underscore-separated numbers is displayed in reverse. Settle that with an actual
paste into a text file, never another photograph — the byte order is only unambiguous in text.

### What is still needed

1. The real `.xlsx` for Cellcom, Pelephone and IDF group exports. Screenshots established the
   shape; they cannot establish encodings, empty-vs-whitespace, or row counts.
2. A **pasted** (not photographed) Cellcom and Pelephone point analysis, so the composite code's
   field order and separator are known exactly.
3. A decision on how IDF sites get Hebrew names, since the export does not carry them.

---

## Output

**Table** (`renderTable`): points ascending, rows by rank, `נק' N` as a `rowspan` over the
point's rows, group background alternating by **group** index so each point reads as one block.

**Network / approximation chips are app-only.** They are `.tag` spans, `display:none` in print,
and the PPTX builder never reads them — so the deliverable stays seven clean columns.

**PPTX** (`btnPptx`): PptxGenJS, `LAYOUT_WIDE`, **one slide**, fixed `colW`. Two traps:

- **Column order is reversed by hand.** PowerPoint tables have no RTL column order —
  `rtlMode: true` only sets text direction *inside* a cell. The row arrays are built
  strongest-column-last, mirroring the HTML. Change one, change the other.
- **The point cell is not merged.** PptxGenJS supports `rowspan`, but the export emits a filled
  purple cell per row with empty text for rows 2–3. It *looks* merged; it isn't.

The slide title is the fixed `טבלת נתונים`, deliberately — the deck supplies mission context.

**Print/PDF**: `window.print()`; `@media print` strips the nav, toolbar, chips and warning
banner and prints `.doc-page` alone.

---

## Icon and brand mark

The ghost is the app's identity: the loader sprite, the nav mark, and the icon are **one 14x14
grid**, defined once in `tools/build_icon.py` and mirrored by hand in the CSS. Regenerate with
`python tools/build_icon.py` (needs Pillow) — it writes `icon.ico` + `icon-256.png` to the repo
root, `favicon.ico` to `TableX/`, `ghost.svg` to `TableX/img/`, and prints the inline SVG snippet
the nav uses. Do not hand-edit any of them, and do not screenshot the loader to make an icon.

**Those paths are split on purpose — do not consolidate them into one folder.** They briefly were
(2026-09-04) and it was reverted the same day:

- `icon.ico` / `icon-256.png` live at the **repo root** because that is where an Electron build
  expects them, matching Interfex. Moving them breaks the build.
- `favicon.ico` lives under **`TableX/`** because that is the web root; anything above it is never
  reachable over HTTP, so a root-level favicon would 404 in the browser.

There is no single folder that satisfies both. The split is the correct answer, not untidiness.

Two traps that already bit once, both commented in the script:

- Saving only the 256px frame with a `sizes` list makes Pillow **LANCZOS-resample it down**, so
  every smaller frame arrives with ~50 alpha values instead of 2 and every pixel edge smears.
  Pass the pre-rendered frames via `append_images`.
- Pillow's ICO writer **skips any requested size larger than the base image**, so saving from the
  16px frame silently emits a one-frame icon. Save from the largest and append the rest.

24px is deliberately absent: `24 // 14 == 1`, so the sprite would fill 58% of that canvas against
87-98% everywhere else and visibly shrink at that one size.

## Design

**`DESIGN.md` is the design system of record** (Mintlify — white canvas, one mint green, square
4px/16px/24px geometry, whisper shadows). Read its "How TableX applies this" section before
touching the UI; it records the three deliberate deviations.

The one that matters most: **the generated report table is not part of the design system.** Its
purple palette is the *deliverable's*, matched to what commanders already see. The Mintlify
system governs the app **around** the document. Do not restyle the table to match the UI.

**Fonts are self-hosted and Hebrew needs its own face** — Inter has no Hebrew glyphs, so Heebo
carries Hebrew via `unicode-range`. Regenerate with `python tools/build_fonts.py` (needs
internet; run it on the dev box, commit the result).

Animation is restrained and everything respects `prefers-reduced-motion`: staggered entrances,
a count-up on the DB numbers, a per-row table reveal **capped at 18 rows** so a long table never
makes anyone wait for decoration.

**The loader** (`#loader`) covers the async DB fetch. It is determinate — the bar fills as each
database lands, then once more when `document.fonts.ready` resolves, so the hero does not
repaint under the user as the loader lifts. Three deliberate properties, all load-bearing:
a **620 ms minimum** on screen (a loader that flashes for 80 ms reads as a glitch), the font
wait **raced with a 2.5 s timeout** (fonts are cosmetic and must never hold the app hostage),
and an **8 s safety timeout** that removes it no matter what — if JS throws, the page must not
stay covered.

The mark is a **pixel ghost** (adapted from Uiverse.io by moraxh) — a 14×14 CSS grid at 10px a
cell, recoloured mint body / paper-white face, whose bottom two rows flicker between two phases
to wave the skirt. Four things were changed from the source and are worth not re-breaking:

- **`an14` belonged to no flicker group** in the original, so that cell stayed permanently
  transparent — a fixed notch in the skirt. Column 4 mirrors column 11, so it is `flicker1`.
- **`#eye`/`#eye1` were dropped.** Their `::before`/`::after` were body-coloured on a
  body-coloured area and drew nothing; the scared ghost's eyes *are* the solid pupils.
- **The ground shadow was re-placed.** `rotateX(80deg)` on a 140px circle puts its centre ~180px
  down — outside the sprite box, on top of the wordmark. It is now an explicit ellipse at the
  ghost's feet.
- **Reduced motion pins one frame** (`f1` filled, `f0` empty). Without it the global
  reduce-motion rule ends the flicker animations and the cells fall back to no background at
  all, shearing the bottom off the ghost.

Face pieces live **inside `.gh-body`** so they ride the bob; the shadow lives outside it so it
stays on the ground.

---

## Site editor — per-site add/remove

`Edit sites` on any database card opens an editor for that network: search, expand a site to see
its sectors, `+` to add one, `-` to remove a sector or a whole site.

**Why it exists:** Partner and Pelephone are refreshed from a Planet export every few months, but
our own sites change by roughly **one site a month**. Re-importing a whole workbook to add one row
is exactly the friction this app was built to remove, so single rows can be edited in place. The
xlsx import stays for the bulk refresh; the two paths write the same file.

Behaviour worth preserving:

- **Edits are staged on a deep copy and written only on Save.** A per-change POST would mean a
  689 KB round trip per edit and could leave the file half-written if one failed. The footer counts
  staged changes and the Save button names the number; closing with unsaved changes confirms first.
- **Removing a site's last sector drops the site too.** A site with no sectors is unreachable by
  any lookup, so leaving its name behind would be an orphan record that only grows the file.
  Verified both ways on 2026-09-04.
- **`ED_ROW_CAP = 150`.** Partner has 3,129 sites; rendering them all janks the modal. Search
  narrows, the cap holds, and a footer line says how many of how many are shown.
- Save posts to the **same `api/db/<network>` route** the xlsx import uses, then refreshes the
  cards and the nav chip in place.

## Settings: theme and language

A gear in the nav opens a popover with two segmented controls. Both persist in
`localStorage` (`tablex_theme`, `tablex_lang`) and are applied by an **inline script in
`<head>`**, before any stylesheet paints — that is what prevents a white flash for a dark-mode
user and an RTL→LTR jump for an English one. That script only touches `<html>` attributes;
everything else waits for `js/i18n.js`.

**Theme** is a pure token swap under `:root[data-theme="dark"]`; no component has a
second definition. First run seeds from `prefers-color-scheme`. See DESIGN.md deviation 5 for
the two tokens the swap must never touch (`--hero-fg`, `.doc-page`).

**Language translates the app chrome ONLY. The generated report does not translate, ever.**
`renderTable()` and the PPTX builder hardcode their Hebrew column headers. That table is the
deliverable that goes in front of commanders; letting a per-browser UI preference silently
change what ships would be a genuine hazard, and someone could mail an English table without
realising. In English the chrome flips to LTR and the document stays a white RTL Hebrew sheet
inside it — like a PDF viewer. If an English *deliverable* is ever wanted it needs its own
explicit setting, separate from this one. The settings popover says so in `set.note`.

`js/i18n.js` holds both dictionaries. Markup uses `data-i18n` (textContent),
`data-i18n-html` (innerHTML, only for strings carrying markup), `data-i18n-placeholder` and
`data-i18n-title`. Dynamic strings go through `T('key', {vars})`. **Anything rendered from JS
must be rebuilt on a language switch** — `I18N.apply()` only refreshes static nodes, which is
why `relocalize()` also re-runs `renderDbCards`, `updateChip`, `updateHint`, `renderFacts` and
(if a table is open) `renderTable`. A missing key falls back to Hebrew rather than rendering
the raw key.

## Gotchas learned the hard way

- **The `.bak` copy has now saved the Partner database twice.** Both times a probe against the
  write route overwrote a live file — once via the case-insensitivity bug below, once by POSTing
  a throwaway payload to all four networks to test the whitelist. When testing that route, post
  to a stub network or restore from `.bak` immediately afterwards; `data/*.bak` is gitignored and
  is the only copy, since the source workbooks are no longer in the repo.
- **PowerShell comparison operators are case-INSENSITIVE by default.** The DB write route
  originally used `-match '^api/db/([a-z]+)$'` and `-notcontains`, so `POST /api/db/Partner`
  matched, passed the whitelist, and — on Windows' case-insensitive filesystem — wrote
  `Partner.json` straight over `partner.json`, destroying the 14k-sector DB. It is now
  `-cmatch` / `-cnotcontains`. **The `.bak` copy is what saved the data**; keep it.
- **The DBs load asynchronously, and generating before they land produces a table of
  untranslated English codes** — precisely the failure the app exists to prevent. `dbsReady`
  gates the generate button. Do not remove that gate, and do not add a code path that renders
  a table without checking it.
- **Never write JSON with PS 5.1's `Set-Content`/`Out-File`** — they add a BOM and `JSON.parse`
  chokes on it. The route uses `[IO.File]::WriteAllText` with `UTF8Encoding($false)`.
- **`docPage.innerHTML` is built by string concatenation** but every interpolated value now goes
  through `esc()`. Keep it that way.
- **`xl/_rels/workbook.xml.rels` gives sheet targets BOTH ways.** `DEMO_DB.xlsx` writes them
  absolute (`/xl/worksheets/sheet1.xml`), the Partner group export writes them relative
  (`worksheets/sheet1.xml`). Prefixing blindly produces `xl/xl/...`, every sheet lookup misses,
  and `build_db.py` reports *no usable layout* on a perfectly good workbook. Strip the leading
  slash, then add `xl/` only if it isn't already there — and keep the `namelist()` guard that
  falls back to positional order if `workbook.xml` can't be read.
- **Verifying Hebrew in a terminal is useless here** — the console codepage mangles it and it
  looks like corruption when the data is fine. Verify by *comparing against a known-good
  source* (that is what the Interfex cross-check is for), not by eyeballing console output.

## Known gaps

- **`idf`, `cellcom` and `pelephone` are empty.** The slots, both write paths and every UI state
  work, and `export group` in Planet on `IDF_Share` / `Cellcom_Share` / `Pelephone_Share` is the
  intended route — but as of 2026-09-05 **none of the three would import correctly even with the
  file in hand.** IDF's sector codes are not unique, Cellcom's and Pelephone's Band Name is an
  EARFCN, and neither Pelephone nor IDF carries a Hebrew site name at all. See "What the other
  three exports actually look like"; the guards make each of those fail loudly rather than write
  a bad database, but the underlying work is not done.
- **PPTX is one slide with no pagination.** ~7 points (21 rows) fits; past ~15 rows the table
  runs off the bottom. `slide.addTable` supports `autoPage`; not enabled.
- **The site editor caps the rendered list at 150 rows** (`ED_ROW_CAP`). Fine for IDF-sized
  data; on Partner you must search to reach a specific site.
- **No tests, no build, no lint.** Verification is: `start.bat`, "טען דוגמה", generate, and
  check the table, the PPTX and the print view.

## Conventions for changes

- **Speed of use is the product.** The value is 20–30 minutes saved per table. Any change that
  adds a step to paste → generate → export works against the point of the app.
- Keep it **dependency-free and offline**. Vendor into `TableX/js/` or `TableX/fonts/`; never a
  CDN tag.
- Keep it **one file per concern** — `app.js` is small and readable on purpose.
- **Every user-facing string goes in `js/i18n.js`, in BOTH dictionaries**, and is reached with
  `T('key')` or a `data-i18n` attribute. No new inline Hebrew in markup or JS. The one deliberate
  exception is the generated report: `renderTable()` and the PPTX builder hardcode their Hebrew
  headers on purpose — see "Settings: theme and language".
- Anything **rendered from JS must be re-rendered in `relocalize()`**, or it keeps the old
  language after a switch.
- When you touch the table shape, **touch all three renderers**: HTML (`renderTable`), PPTX
  (`btnPptx`), and the print CSS.
- When you touch the workbook contract, **touch both parsers**: `js/dbparse.js` and
  `tools/build_db.py`.
- When you add a network, **touch four places**: `NETWORKS` and `LABELS` in `app.js`, `$NETWORKS`
  in `server.ps1`, `LABELS` in `tools/build_db.py`, and a `data/<net>.json` stub.
