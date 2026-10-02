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
  mapping lives in a **14,252-sector** Planet network export. Looking up three cells per point,
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

- **`c:\projects\interfex`** — Interfex, LTE interference analyzer. The big one; its `CLAUDE.md`
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

**Which Partner ships changed three times, and the middle move was made on a wrong premise.**
On 2026-09-05 `partner.json` was rebuilt from the `Partner_May_26_V3` group export (3,129 sites /
16,510 sectors). On 2026-09-29 it was reverted to `Partner_170924_V3.xlsx` — the 2024 export —
on the grounds that the May-26 one "carried names and carriers only" and the 2024 one carried the
**physical plant**. **That was true of the BUILD, not of the FILE.** The optional `coords` / `ant` /
`pwr` / `crs` keys were not added to either parser until 2026-09-29, three weeks *after* the May-26
import ran, so the plant was never missing from the workbook — it was simply not being read. Nobody
re-parsed it before reverting.

**On 2026-10-02 Partner was rebuilt from `Partner_May_26_V3.xlsx` again**, and today's parser takes
everything out of it: **3,129 sites / 16,510 sectors, with 3,129 coords, 16,510 antennas, 16,510
power values and 16,510 CRS values** — the full plant, on the current network. That is what ships
now, and it closes the "434 sites short" gap the revert accepted. Measured against the 2024 build it
replaced: 434 sites and 2,502 sectors added, 203 sites and 244 sectors gone, 2,803 PA-power values
and 2,500 antennas changed (real swaps — `742270_1800.pafx` → `ODI2065R15M18JJ02Q.pafx`), and 807
sector rows whose *site id* moved between the two exports. The e2e suites were 144/144 after it,
which is the evidence that they assert against the database's own values rather than fixed counts.

**The cost is ANT_DIMS coverage**, and it is a fair trade rather than a regression: 67% of the
16,510 antennas now match a datasheet entry and 33% fall through to `TYPICAL`, against roughly 80%
before — because the current network carries models the 2024 one did not. The top unmatched, each
one `ANT_DIMS` line away: `80020899` (2,654), `ODI065R12M15JJJ02GQ` (505), `80020892` (479),
`ODI2065R15M18JJ02Q` (416), `84510891` (130). `<GENERIC>` (752) is Planet's own placeholder for a
site with no real antenna assigned, not a model, and must never be given a size.

The source file is **`C:\Users\<user>\OneDrive\Desktop\Partner_May_26_V3.xlsx`** — it IS on the dev
box, contrary to what this file said until 2026-10-02 (`D:` and `F:` do not exist on this machine at
all, so the `D:\Downloads\` and `F:\IDF_DB_FOR_CLAUDE\` paths recorded elsewhere here are dead too).
`git show cfd7b62:TableX/data/partner.json` is the 2026-09-05 May-26 build and
`git show e9bf098:TableX/data/partner.json` the 2024 one, if either is ever wanted back;
`partner.json.bak` is now the 2024 database rather than the 90-byte empty file the gotchas warn
about. Interfex's `partner_cells.json` is from the 2024 export, so the two are **out of step again**
and the cross-check is due; `c:\projects\interfex` is not on this dev box, so it was not re-run.

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

**The server has two route families beyond static files**, and both exist for the same reason —
so what someone builds in the app belongs to that *copy* of the app rather than to one browser's
storage:

```
POST   api/db/<network>      writes TableX/data/<network>.json
GET    api/tpl               lists deck templates (metadata only)
POST   api/tpl/<id>          writes TableX/data/tpl/<id>.json   (metadata)
POST   api/tpl/<id>/deck     writes TableX/data/tpl/<id>.pptx   (raw bytes)
DELETE api/tpl/<id>          removes both
```

Everything else is a static file under the `TableX/` web root (deliberately not the repo root, so
the raw source workbooks beside it are not reachable over HTTP) — including the stored `.pptx`,
which the app fetches back over the ordinary static route.

**The deck rides its own route as raw bytes, not base64 inside JSON.** PS 5.1's
`ConvertFrom-Json` is backed by `JavaScriptSerializer` and throws on a long string, which a
multi-MB deck comfortably is. Raw bytes also skip base64's 33% inflation, and mean the stored
template is a real `.pptx` anyone can just open.

**Template ids are constrained, not whitelisted** — the user creates them, so `$TPL_ID` allows
`[a-z0-9-]` only, which contains no `.` and no separator and therefore cannot name a path outside
`data\tpl`. Matched with **`-cmatch`**, for exactly the reason the database route documents.

`file://` will not work any more — the app `fetch()`es `data/*.json` at startup, which a
`file://` origin blocks. Always go through the server.

**Fully offline.** Libraries and fonts are vendored; nothing loads from a CDN. Keep it that way
— the machines this runs on have no internet.

---

## Packaging as an exe (Electron)

The TS machines have no Node.js, so TableX ships as a portable Electron folder. The shell does
nothing but spawn `server.ps1 -NoLaunch -Port 8094` and point a `BrowserWindow` at
`http://localhost:8094/` — the same thing `start.bat` does, wrapped in a window. Same pattern as
Interfex (`c:\projects\interfex`), whose CLAUDE.md has the original recipe.

**The scaffolding is NOT committed** — `.gitignore` already excludes `main.js`, `package.json`,
`package-lock.json`, `node_modules/` and `dist/`. Recreate it from this section when a build is
needed, then delete it again, keeping only the zip.

```powershell
# PowerShell's ExecutionPolicy blocks npm directly — go through bypass:
powershell -ExecutionPolicy Bypass -Command "npm install"
powershell -ExecutionPolicy Bypass -Command "npm run build"
Compress-Archive -Path 'dist\win-unpacked\*' -DestinationPath 'dist\TableX.zip' -Force
```

Last build **2026-09-29 at commit `251a296`**, version 1.2.0: electron 33.4.11 + electron-builder
26.15.3, target `dir`, no winCodeSign symlink error. **`dist\TableX.zip`, 111.2 MB.** Carries the
Signal redesign, the output styles and Stylish, the CRS column, the chip in the export, the
maximized window, and the 2024 Partner export with its plant (1.8 MB of the growth). Verified on
**the zip itself**, expanded to a scratch folder: its own `server.ps1` under all three suites,
**144/144**; its `data/` holds the four databases with no `.bak` and no `tpl/`; and its exe,
launched with `ELECTRON_RUN_AS_NODE` cleared and read through `user32`, showed a first visible frame
already maximized, (−8,−8) → (1928,1048) on 1920×1080, and left no process behind on close.
`main.js` was recreated from the 2026-09-23 build's own copy (`dist\win-unpacked\resources\app\`)
with the `createWindow()` below swapped in. (Before that: 2026-09-23 at `a037fa7`, 110.8 MB,
116/116; 2026-09-10 at `7e612e9`, 110.8 MB, 40/40; 2026-09-06 at `fd7ae0d`, 110.7 MB.)

The app (`main.js`, `server.ps1`, `icon.ico`, all of `TableX/**`) lands in `resources/app/`.
**Point the suites at the PACKAGED server, not the repo one** — that is what makes the shipped
build checked rather than assumed.

`package.json` — the settings that matter:

```json
{ "main": "main.js",
  "devDependencies": { "electron": "33.4.11", "electron-builder": "26.15.3" },
  "build": { "productName": "TableX", "asar": false, "win": { "target": "dir", "icon": "icon.ico" },
  "files": ["main.js","package.json","server.ps1","icon.ico","TableX/**",
            "!TableX/data/*.bak","!TableX/data/tpl/**"] } }
```

**The two negations are not optional.** `"TableX/**"` sweeps in `data/*.bak` and `data/tpl/` alike,
and the 2026-09-10 build shipped a stale `idf.json.bak` before they were added — a rollback copy of
somebody's database riding inside everyone's install, which is the same leak the `tpl/` warning
below describes, one directory over. Both are gitignored, so `git status` says nothing either way.

`asar: false` and `target: "dir"` are both deliberate: `dir` avoids the winCodeSign symlink failure
that `--win portable` hits, and an unpacked app means `server.ps1` can read `TableX/` off disk.
`server.ps1` resolves its web root from `$PSScriptRoot`, so it needs no change when packaged.

**Still look in `TableX/data/tpl/` before building.** The `!TableX/data/tpl/**` negation above now
keeps it out of the package, but a deck template is somebody's actual presentation and the
directory is gitignored, so `git status` will not warn you either way — and a build config is one
edit away from losing that line. Look at the folder; it costs a second.

**`main.js` must keep the `serverReady` guard and `res.resume()`.** Straight from Interfex, same
root cause: not draining the poll response leaves the socket open; when the server later closes it
the error handler fires, the poller retries, finds the server up, and opens a SECOND window — the
app then grows a new window every few minutes.

```js
let serverReady = false;
function waitForServer(cb, tries = 0) {
  if (serverReady) return;
  http.get(URL, res => {
    res.resume();                        // drain so the socket closes cleanly
    if (!serverReady) { serverReady = true; cb(); }
  }).on('error', () => {
    if (!serverReady && tries < 40) setTimeout(() => waitForServer(cb, tries + 1), 400);
  });
}
```

The server child is killed with `taskkill /pid <pid> /f /t` on `window-all-closed` and
`before-quit`. Verified 2026-09-06: closing the window leaves zero `TableX` processes and releases
port 8094.

**`main.js` must open the window MAXIMIZED.** Every build up to 2026-09-23 created a fixed
1440×940 window, which on TS opened as a floating box that had to be maximized by hand on every
launch — and on a 768px-tall screen did not even fit. Reported 2026-09-29. Create it hidden and
reveal it already maximized, so it never flashes at the small size first; `width`/`height` are
only what "restore down" returns to. Maximized, deliberately not `fullscreen`: the title bar and
taskbar stay, and F11 (Electron's default menu) still gives true fullscreen for a briefing.

```js
const { app, BrowserWindow, screen } = require('electron');

function createWindow() {
  const work = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1440, work.width),
    height: Math.min(940, work.height),
    show: false,
    backgroundColor: '#f4f1e8',          // the app's cream (--canvas)
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  const reveal = () => {
    if (!win || win.isVisible()) return;
    win.maximize();
    win.show();
  };
  win.once('ready-to-show', reveal);
  setTimeout(reveal, 4000);              // never leave it hidden if the page stalls
  win.loadURL(URL);
  win.on('closed', () => { win = null; });
}
```

Verified 2026-09-29 against the real Electron 33 binary (the 2026-09-23 `win-unpacked` with this
`createWindow()` swapped in), by reading the window through `user32`: the unpatched build's first
visible frame was a 1440×940 window at (240,50); the patched one's was `IsZoomed` true, (−8,−8) →
(1928,1048) on a 1920×1080 screen. **Shipped in the 2026-09-29 build**, and checked the same way on
the zip; check it again after any rebuild.

### The trap that wastes an afternoon: `ELECTRON_RUN_AS_NODE`

**VS Code and Claude Code set `ELECTRON_RUN_AS_NODE=1` in their integrated terminals.** With it
set, `TableX.exe` runs `main.js` as plain Node, `require('electron')` resolves to the npm package
(which exports a path string, not the module), `app` is `undefined`, and the exe **exits instantly
with no window, no error dialog and nothing on stderr**. It looks exactly like a broken build.

The exe is fine — the terminal is not. Test from a normal `cmd`/PowerShell window, or clear it:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

Diagnose it by running `.\node_modules\.bin\electron.cmd .`, which prints the real
`Cannot read properties of undefined (reading 'whenReady')` that the packaged exe swallows.

## Repo layout

```
start.bat                     launcher (UbiPlus/Interfex pattern)
server.ps1                    static server + the one DB write route, port 8094
DESIGN.md                     "Signal" — the design system of record
tools/
  build_db.py                 Planet .xlsx → data/<network>.json (stdlib only)
  build_idf.py                ENM CLI dump + name list → data/idf.json (stdlib only)
  build_fonts.py              downloads + subsets Plex (+ Inter/Heebo) into TableX/fonts/
  build_icon.py               the ghost -> .ico / .png / .svg + the nav snippet
  gen_site.mjs                new-site workbook writer — drives TableX/js/sitegen.js
  e2e/run.mjs                 the end-to-end suites — see "Tests" (no npm install)
  e2e/cdp.mjs                 shared DevTools-Protocol harness
  e2e/{engine,deck,app,quest}.mjs   one suite each
TableX/
  index.html                  whole UI: nav, paste card (+ the floor), DB view, lookup, table view
  css/main.css                the Signal system: tokens at the top, MOTION at the bottom
  js/app.js                   the entire application, one IIFE
  js/pptx.js                  reads a .pptx and fills it in — the template engine
  js/deck.js                  the Decks view: templates, slots, the build
  js/scene.js                 the home page's pixel floor + the ghost that walks it
  js/dbparse.js               the workbook contract — runs as a Web Worker
  js/sitegen.js               a new site, cloned from a real one — the format
                              contract. Also runs as a Web Worker
  js/quest.js                 the אתרים חדשים view: load an export, pick a
                              template, edit, generate
  js/i18n.js                  he/en dictionary + DOM applier (chrome only)
  js/motion.js                press, rings and sliding indicators, for every button
  js/tour.js                  the "?" on the paste card — Planet -> paste -> table, in 5 steps
  js/xlsx.full.min.js         SheetJS — vendored, reads an uploaded workbook
  js/pptxgen.bundle.js        PptxGenJS 3.12.0 — vendored, writes the deck.
                              ALSO where window.JSZip comes from; pptx.js needs it
  fonts/                      self-hosted, 17 woff2: IBM Plex Sans Hebrew + Plex Mono
                              (the app), Inter + Heebo (the report preview only)
  data/partner.json           SHIPPED — 2,898 sites / 14,252 sectors + the plant, 1.8 MB
  data/idf.json               SHIPPED — 334 sites / 792 sectors, from the ENM dump
  data/cellcom.json           empty stub - the real DB is built on TS, cannot ship
  data/pelephone.json         empty stub - the real DB is built on TS, cannot ship
  data/tpl/                   deck templates, written by the server — GITIGNORED,
                              per-installation, and never in a build (see Electron)
  favicon.ico                 browser tab (MUST stay under TableX/ to be served)
  img/elad.jpg                builder photo (About the builder)
  img/ghost.svg               standalone ghost mark
icon.ico / icon-256.png       Electron build icons — MUST stay at the repo root
.gitignore                    data/*.bak, data/tpl/, icon scratch, build scaffolding
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
| `idf` | IDF | **shipped**, 334 sites / 792 sectors — built from an ENM CLI dump, 236 sites carry a Hebrew name |
| `cellcom` | Cellcom | **ships empty**, but the import is proven — 2,575 sites / 18,891 sectors on TS |
| `partner` | Partner | **shipped**, 2,898 sites / 14,252 sectors, with the plant — the 2024 export (see "Sibling projects") |
| `pelephone` | Pelephone | **ships empty**, but the import is proven — 2,383 sites / 18,217 sectors on TS |

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
  "sectors": { "LNN4610Da": ["MN4610A", "Da", 1800, 20] },
  "notes":   { "IDF_Amitay": "סקטורים 2,3 הם של ק.ד 235" },      // optional
  "coords":  { "IDF_Amitay": [622321.5, 3452921] },              // optional
  "ant":     { "IDF_Amitay_1": [50, 60, 0, "LNX-6515DS.pafx"] }, // optional
  "pwr":     { "IDF_Amitay_1": 49.03 },                          // optional
  "crs":     { "IDF_Amitay_1": 0 }                               // optional
}
```

**The five optional keys are omitted when empty**, so a database with none of
them is shape-identical to one built before they existed. `ant` is
`[height m, azimuth, mechanical tilt, antenna file]`, `pwr` is **PA Power in
dBm as the workbook states it** — watts are a render-time conversion
(`10^((dBm-30)/10)`, so 49.03 → 80 W and 46.02 → 40 W), never a stored number —
and `crs` is Planet's **`Reference Signal Power Boosting (dB)`**, also as stated.

**Every one of them has to be carried by the import, the backup, the restore AND
the site editor's Save.** A Save posts the whole database, so a key left out of
that payload silently wipes what the import collected, the next time somebody
adds a sector. `OPTIONAL` in `app.js` is the one list all four read. **The
restore used not to** — until 2026-09-29 restoring a `.json` backup kept only
`sites` and `sectors` and dropped every coordinate, antenna and power value.

Site names are **deduplicated into `sites`** rather than repeated per sector — a site carries up
to 12 sectors here and the Hebrew name is by far the longest field. That halves the file
(1.26 MB → 673 KB).

### Lookup: sector first, then site

`lookup(code, mhz)` walks every loaded network, **sectors first, then sites**:

1. **Sector-id hit** (`LNN4610Da`) → exact. Sector, frequency and bandwidth are the real values
   for the cell Planet named. Row is tagged with its network.
2. **Site-id hit** (`MN4610A`) → **approximate**. The site's name is right, but sector/freq/BW
   come from an arbitrary (first-seen) sector of that site. The row is tagged
   `סקטור משוער` in the app so nobody mistakes it for exact.
3. **No hit** → the raw code is rendered and the code is collected into a warning banner above
   the table.

This is why the DB is keyed per sector: Planet's point analysis reports a cell, and keying per
site made sector/freq/BW an arbitrary pick. The site path survives only as a graceful fallback.

### Cellcom's סקטור column is the ECI, not the azimuth

Cellcom's Sector ID is `<ECI>_<azimuth>`, and **the ECI is what names the cell in Planet's Site
Editor**. Site 13207 carries `3381013_90`, `3381023_90` and `3381063_90` — three different cells,
three different carriers (700/5, 1800/20, 2600/20), all on azimuth **90**. Printing the azimuth put
the same `90` on all three and made them impossible to tell apart on the slide.

`sectorLabel()` therefore reads the leading field off the sector KEY for Cellcom, and returns the
stored sector for every other network (Partner `Ia`, IDF `1`). It is read back off the key rather
than restored into the database, so **no Cellcom re-import is needed** — which matters, because
that database is rebuilt from a group export inside TS and cannot be regenerated out here.

`build_db.py` and `dbparse.js` still store the azimuth in the sector slot; this is a display rule,
not a change to the workbook contract, so the two parsers stay untouched.

### Pelephone prints its own code, and looks up only the bandwidth

`P630012_630012_1911236_9260` is `<SiteID>_<siteNum>_<cell>_<EARFCN>`. **There is no azimuth
anywhere in it**, so Pelephone can never reach step 1 — there is nothing to look a sector up by.
It used to land on step 2 and report whichever sector was indexed first, which made a 700 MHz cell
print 2600 MHz. Wrong, and invisibly so, because `סקטור משוער` is stripped from the PPTX.

Settled 2026-09-06: **print what the code carries and guess nothing.**

| column | source | |
|--------|--------|---|
| שם אתר משרת | the DB, by Site ID | Latin (`EINAV`) — accepted, Pelephone has no Hebrew names |
| סקטור | **the code**, field 3 | `1911236`, the cell id — not an azimuth like the other three |
| תדר מרכזי | **the code**, field 4 | the raw EARFCN `9260`, same as IDF prints |
| רוחב פס | the DB | the only field the code lacks — see below |

Nothing in those three is estimated, so **the row is not tagged `סקטור משוער`.**

**Bandwidth is the one lookup.** `lookupPlanet()` converts the EARFCN to MHz *internally* and
passes it to `lookup(code, mhz)`, which filters the site's sectors to that carrier and reads the
width off them: unanimous → that width; disagreeing, or no sector on that carrier → **`-`**. Never
a pick. A wrong width on a commander's slide is worse than a visibly missing one.

`mhzOf()` reads `EARFCN_BANDS` **through `self.TableXBands`, exported by `dbparse.js`** — not a
copy. A second table in `app.js` would drift from the one the importer uses, which is the failure
this codebase has already had once with `NET_TAG`. `planetCarrier()` returns null for every other
operator's code shape, so nothing but Pelephone takes this path.

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
- **The sector is the trailing letters of the Sector ID** (`LEA0402Da` → `Da`), falling back to
  the segment after the last underscore when the id ends in digits — `3634249_270` → `270` for
  Cellcom (its azimuth), `935739_22` → `22` for Pelephone. Partner never reaches that fallback,
  since its ids always end in letters, so the path below is untouched by it.
  14,008 / 14,008 exact.
- **Frequency and bandwidth come from `Band Name`** (`1800_20` → 1800 MHz / 20 MHz;
  `700_5_9435` → 700 / 5). **No EARFCN conversion is needed** — Planet already reports MHz here.
  Frequency 14,008 / 14,008 exact; bandwidth 13,984 / 14,008, the 24 differences being a real
  700 MHz carrier change that the export's own `Carrier Bandwidth (MHz)` column confirms.

**The key is the Sector ID, or `<Site ID>_<Sector ID>` when that repeats.** IDF's export numbers
sectors `1` / `2` / `3` per site, so the plain column collapses a whole network into a handful of
rows — the import used to refuse it outright. The composite is not a guess: it **is** the
point-inspect code, since Site ID `IDF_Amitay` and Sector ID `1` give `IDF_Amitay_1`. It is only
reached once the plain key has failed and only accepted when itself unique, so Partner, Cellcom
and Pelephone keep the exact path their data was verified on — and a workbook whose composite
*also* collides is still refused. When it is used, the Sector ID column is the sector verbatim:
`sectorOf()` reads the KEY, and `IDF_Astra_3_900` would hand it `900`. **The success toast names
the key** (`מפתח: Site ID + Sector ID`), for the same reason it names the bands.

**A trailing parenthetical is a NOTE, not part of the name.** The IDF export's `Description` reads
`אמיתי (סקטורים 2,3 הם של ק.ד 235)` — RF-team information, and שם אתר משרת is the one column a
commander reads. `splitName()` puts the name in `sites` and the note in `notes`. Safe because it
was measured: of the 3,129 names in the May-26 `partner.json`, **17 contain a parenthesis and
zero end in one**, and the ENM name list already used this convention on `Asaf_M4` and `Rafah_M5`.
A name that is *only* a parenthetical stays a name. **The note is app-only** — the lookup and the
site editor show it, `renderTable()` and both PPTX writers never see it, the same rule the network
chips follow.

**Four more columns-or-sheets are read when present, all optional and all matched by header.**
They carry what a site-data slide needs and the sector sheet does not:

| Sheet | Matched by | Gives |
|-------|------------|-------|
| `Antennas` | `Site ID` + `Antenna ID` + one of `Azimuth` / `Height (m)` / `Antenna File` | height, azimuth, mechanical tilt, antenna file — and a `Sectors` column naming what each one serves |
| `Sector_Antennas` | `Site ID` + `Sector ID` + `Antenna ID`, and NOT an antenna sheet | the same join stated separately, in older exports |
| whichever has it | `Site ID` + `Sector ID` + `PA Power (dBm)` | the power |
| whichever has it | `Site ID` + `Sector ID` + `Reference Signal Power Boosting (dB)` | the CRS boost |

**`PA Power (dBm)` moves between sheets across Planet versions** — `LTE_FDD_Sectors` in the 2024
Partner export, `LTE_FDD_Sector_Carriers` in the Planet the team runs now — which is exactly why it
is found by header and never by tab name. **CRS is found on its own, the same way**: it sits beside
PA Power on `LTE_FDD_Sectors` in the 2024 export (Elad marked the column, 2026-09-29), and a Planet
version that moves one must not take the other with it. Verified on `Partner_170924_V3.xlsx`
(commit `24d73ec`): both parsers read **14,252 CRS values, identical** — every one `0` in that
export.

**CRS here is the BOOST, not the reference-signal power.** `Reference Signal Power Boosting (dB)`
is the RS power relative to the data REs, so `0 dB` is the normal answer. If a request form ever
wants the RS power itself (RS EPRE, dBm) it is `PA power − 10·log10(12 × N_RB) + boost` —
49 dBm on 20 MHz is ~18.2 dBm — a render-time conversion like watts, never a stored number.

**Where two sources disagree the answer is nothing.** One sector can be served by several antennas
(MIMO) and one antenna by several sectors (`1, 3`), so each field is agreed or blank — the rule the
Pelephone bandwidth path already follows, because a confident wrong azimuth on a form going to an
operator is worse than a visibly missing one. Per FIELD, so a disagreement about tilt does not
blank the height.

`num()` in `build_db.py` returns an **int** for a whole number, so a guard written against `float`
alone silently drops `PA Power` 49 and the IDF export's whole-number eastings. That bug was caught
by diffing the two parsers, which is what that check is for.

Verified 2026-09-23 on the Partner group export (`DEMO_DB.xlsx` with its hand-built `DB` tab
removed): **14,252 of 14,252 sectors carry an antenna and a power value**, `LNN4610Da` reading
17 m / azimuth 20 / `742270_1800.pafx` / 49 dBm, and both parsers agree on every entry.

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

### Seeing what is in a workbook — `בדיקת קובץ`

The DB section's **בדיקת קובץ** button loads any `.xlsx` and reports what is in it: every
sheet, every column, a sample value, and **which columns are empty**. It writes nothing and
touches no database, so it is safe to point at a live export with nothing at risk.

**It exists because the operator workbooks live on TS and the only channel out is a photograph
of a screen.** Every parser in this repo was designed from one. A screen that prints the headers
is a far better photograph than the sheet itself, and it carries the fill counts — which is the
fact a list of header names cannot: Planet ships a `Site Name` column empty in all 3,129 rows of
the Partner export, and the inspector marks it `עמודה ריקה` in red rather than leaving emptiness
to be inferred from a blank sample.

It doubles as **"why did my file not import"**. The `גיליון האתרים` / `גיליון הסקטורים` /
`גיליון שטוח` tags are decided by the SAME predicates `pickSheets()` uses, so it reports what
the importer sees rather than a second opinion that can disagree with it.

`inspectBuffer()` lives in `dbparse.js` beside the parser and rides the same Worker. The message
is now an envelope (`{op, buf}`) and the bare-buffer shape is still accepted, so neither side
depends on the other being updated in the same breath. Verified 2026-09-22 against `DEMO_DB.xlsx`:
envelope and bare buffer both build 14,252 sectors with byte-identical sites.

### What a Planet group export actually contains

`DEMO_DB.xlsx` is still in git history — `git show 5ff1091:TableX/DB/DEMO_DB.xlsx > out.xlsx` —
and it carries **eight** sheets, not the two the importer reads. Dumped 2026-09-22:

| sheet | keyed by | what it carries |
|---|---|---|
| `Sites` | Site ID | `Longitude` `Latitude`, `Description` = the Hebrew name; `Site Name` and `Site Name 2` both EMPTY |
| `Antennas` | Site ID + Antenna ID | `Antenna File` `Height (m)` `Azimuth` `Mechanical Tilt` `Twist`, and a `Sectors` column naming what it serves |
| `Antenna_Electrical_Parameters` | Site ID + Antenna ID | `Electrical Tilt` / `Azimuth` / `Beamwidth` |
| `Sectors` | Sector ID | `Band Name` — the sheet the importer reads |
| `Sector_Antennas` | Site ID + Sector ID + Antenna ID | **the explicit sector→antenna join**, plus `MIMO Group`, `Cable Length` |
| `LTE_FDD_Sectors` | Site ID + Sector ID | `PA Power (dBm)` `Total EIRP (dBm)` `Physical Cell ID` |
| `LTE_FDD_Sectors_Carriers` | Site ID + Sector ID + Carrier Name | `Cell ID`, `TAC`; `Cell Name` and `E-UTRAN Cell ID` both EMPTY here |
| `DB` | Sector ID | the hand-built flat tab — which is why flat is tried first |

Four things follow that are worth not re-deriving:

- **`Sector_Antennas` means the sector→antenna join never has to be guessed.** Matching an antenna
  to a sector by azimuth breaks on any multi-band site — a 700 and an 1800 antenna both on azimuth
  90 would take whichever was indexed first, the same class of silent wrong answer the Pelephone
  bandwidth path refuses to give.
- **`PA Power (dBm)` moves between sheets across Planet versions**: it is on `LTE_FDD_Sectors` here
  and on `LTE_FDD_Sector_Carriers` in the Planet the team runs now (photographed 2026-09-22). Find
  it by header on whichever sheet carries `Site ID` + `Sector ID` + `PA Power (dBm)`, never by tab
  name — the rule the rest of the contract already follows. Watts are `10^((dBm-30)/10)`, so
  49.03 → 80 W and 46.02 → 40 W, which is the `80WAT` / `40WAT` an operator request form prints.
- **`Longitude` / `Latitude` are not always degrees.** WGS84 degrees in this Partner export
  (`35.517217`), projected metres in the IDF one (`735054` / `3684600`, UTM 36N). Same header,
  different units, decided by the project's coordinate system — so anything reading them has to
  tell which it has (`|value| <= 180` is degrees) rather than assume.
- **`Antenna File` is a file name, not always a model name.** Partner's read `742270_1800.pafx`;
  the IDF project's read `ODI-032R20M-Q.pafx`. A slide that wants the antenna MODEL gets it only
  where the planner named the file after one.

### IDF used to come from an ENM CLI dump — it now imports like the rest

**Superseded 2026-09-23.** Elad filled every IDF site's `Description` in Planet with its Hebrew
name, so `IDF_Share.xlsx` now carries everything the importer needs and IDF goes through the
ordinary `עדכן` button: export the group, load it. That also closes the 95-Latin-names gap, and
the names survive every future export because they live in Planet rather than in a CSV here.

Three things make it work, all documented under the workbook contract: the `<Site ID>_<Sector ID>`
composite key (which is what point inspect reports), the trailing-note split, and `'earfcn'` mode
for the frequency column.

**`tools/build_idf.py` and the ENM dump are kept as the fallback** until the Planet import has been
run for real on TS. The rest of this section describes that path, and the chained-site reasoning in
it is still the best record of which IDF sites are fibred where.

### The ENM CLI dump path (superseded)

IDF is the one network the xlsx import cannot serve: its Planet export numbers sectors 1/2/3 per
site, so the sector code is not a key. `tools/build_idf.py` reads an ENM CLI dump instead:

```
python tools/build_idf.py F:/IDF_DB_FOR_CLAUDE/IDF_DB.txt                           F:/IDF_DB_FOR_CLAUDE/NAMES_TO_FILL_FILLED.txt
```

The dump writes its header block vertically, one field per line, then tab-separated rows. Four
things it settles, and one it cannot:

- **Keyed by `EUtranCellFDDId`**, because that is exactly what Planet reports — `IDF_Halif_11_SL_1`
  is `IDF_` + the cell id. All 792 cells round-trip through `lookupPlanet()` as Planet codes.
- **IDF prints the raw EARFCN in the תדר מרכזי column, not MHz** — `9335`, not `700`. Requested
  2026-09-06: the team reads ENM, and the EARFCN is the number they recognise. **The Planet
  import stores it the same way** (2026-09-23): `EARFCN_NETS` in `app.js` selects `parseBand`'s
  `'earfcn'` mode for IDF, so `P3M_750LTE.MIMO 9260_10` stores **9260**, not 750, and the
  ENM-built and Planet-built databases agree. `freqText()` reads the same set, so the importer
  and the renderer cannot disagree about which networks those are. **Every other
  network still prints MHz**, so a point served by both shows `1800` and `9335` in the same column
  with nothing marking the unit change. That is a known and accepted property, not an oversight.
  **Bandwidth** comes from `dlChannelBandwidth` (kHz → MHz) and is in MHz for every network.
- **The band label is still derived, purely to verify the dump.** `build_idf.py` prints both lines:
  the EARFCNs it stored and the bands they imply. `700, 900, 2600` is obviously right;
  `1400, 2850, 9360` would mean an EARFCN column had been read as MHz. Same check the import toast
  performs for the workbook path, and the reason `EARFCN_BANDS` still lives in this tool. The dump
  also verifies itself: every cell named `*_900` carries EARFCN 3525, which 3GPP band 8 puts at
  exactly 900 MHz.
- **The sector is the TRAILING number of the cell id**, after stripping a `_900` band suffix. Not
  the leading one: 88 cells are not prefixed by their own NodeId, and reading forwards turns
  `G_004_2` into sector `004` and `MMSL_1005_1` into `1005`. That bug shipped once and was caught
  by a distribution check — every sector should be a single digit 1-9.
- **51 cell ids repeat across nodes** (`G_006` / `G_006_SL` / `G_006_T`) and 12 of those disagree
  on frequency or bandwidth. Planet reports only the cell id, so one row has to win: an ENABLED
  cell first, then the node the cell is actually named after. Deterministic, and the tool says how
  many it had to resolve that way.

#### Chained sites — אתרים משורשרים

An RRU standing at one site, fibred back to a **different** site's baseband. ENM names such a cell
after the site the antenna is on and hangs it under the baseband's `NodeId`, prefixed with its cell
number on that baseband:

```
node Nahal_Sion   1_Nahal_Sion_1   2_Zivanit_2  3_Zivanit_3   4_Hadas_1  5_Hadas_2  6_Hadas_3
                  ^ its own        ^ Zivanit's mast          ^ Hadas's mast
node Mizpe_Zor    Mizpe_Zor_1..4   KD27_5       ^ the fifth sector of KD27, which is also a node
```

**The node says where the electronics are; the cell id says where the radio is, and the deck needs
the radio.** Attributing `KD27_5` to its baseband printed מצפה צור on a slide for a point served by
the mast at ק.ד 27 — and not even tagged `סקטור משוער`, because the cell id itself matched exactly.
`site_of()` therefore attributes a chained cell to the site it is *named* after. Reported 2026-09-10.

**Which sites are chained is CONFIRMED WITH THE TEAM, never inferred** — the `CHAINED` set in
`build_idf.py`. Nothing in the dump tells a chained site apart from a cell merely *named after what
it points at*, and of the eight candidates the id shapes suggest, **four turned out not to be
chained**: `Kirya_2`'s `1-Aman_1` / `2-Agat_2` / `3-Asiya_3` are three sectors of קרייה 2 pointed at
three buildings — and `Aman` is אמ"ן, which the name list already carries as a suffix at
`Kisufim_Aman` and `Yarkon_Aman` — while `Petel_296`'s `Petel_002_*` cells are a renumbering the
cell names never followed. So the tool prints a **`CHECK :`** line naming every cell whose name
disagrees with its node and is *not* in `CHAINED`. A new one there is a question for the team, not
a thing to resolve by reading the id.

`MMSL_Takti4_SL_1` under node `MMSL_Takti_4_SL` is neither: a missing underscore, caught by
comparing with the separators removed, or the typo would fork one site into two.

**Planet drops the slot prefix.** A point inspect reports `IDF_Hadas_1`, not `IDF_4_Hadas_1` (two
real codes off a soldier's paste, 2026-09-10), so one cell has two spellings — and before this,
every chained cell simply came back **לא נמצא**. `aliasIndex()` in `app.js` maps the Planet spelling
onto the ENM key so both resolve; see "The code shape differs per operator". Aliasing rather than
re-keying is deliberate: the ENM id is what the team reads in ENM and stays searchable in חיפוש אתר.

**A chained cell that was named after its baseband anyway is invisible here**, and no rule can
recover it — the dump has no field for the antenna's location. If a table ever names a site the RF
team knows is wrong, that is the case to suspect.

A chained site needs its **own** `SITE` row in the name list: `Hadas` / `Zivanit` / `Ido` are sites
in their own right now, not sectors of נחל שיאון and חרמון, so they no longer inherit a name from
anything. `הדס` / `זיוונית` / `עידו` were added on 2026-09-10. `KD27` needed nothing — the existing
`FAMILY KD{N} → ק.ד {N}` row already covered it, which is why its chained cell picked up ק.ד 27 the
moment it was attributed correctly.

**The Hebrew names cannot come from the dump** — it has none, and DOGMA only names 12 sites. They
are written by hand into a name list the tool reads, which takes two row types: a `SITE` row naming
one site, or a `FAMILY` row naming a whole numbered family with `{N}` for the number
(`MMSL_Takti_{N}` → `בארי {N}`, leading zeros dropped, so `T_014` is `תק"ש 14`). `_SL` and `_T`
are variants of one physical site and share its name. **Unescape Excel's CSV quoting when reading
that file** — it writes `מצפ"ש` as `"מצפ""ש"`, and the doubled quote would otherwise reach the slide.

**An IDF refresh does not go through the `עדכן` button** — that path is xlsx-only. Re-run the tool.

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

### Backing up and restoring a database

DB card → **גבה** downloads that network as `<net>-YYYY-MM-DD.json`; **עדכן** now
accepts a `.json` as well as an `.xlsx` and restores it.

**This exists because the server's `.bak` is one deep and gitignored.** It has already
saved Partner twice (see the gotchas), and one `.bak` means a *second* mistake overwrites
the only rollback copy there is. IDF is the worst case: it is built from an ENM dump
rather than a workbook, so a cleared `idf.json` cannot be rebuilt from inside the app at
all — `tools/build_idf.py` and the original dump are the only way back. Before this,
backing one up meant finding the file on disk, which is not a thing to ask of someone who
has just wiped it.

- **The download is rebuilt from memory, not re-fetched from `data/<net>.json`** — so a
  database that only ever loaded for the session (because the server write failed) can
  still be saved out. `dbFileShape()` emits exactly the six documented keys, dropping the
  two lookup indexes `indexDb()` adds in place. Verified against the shipped `idf.json`:
  the blob is 40,681 bytes to the file's 40,681, same key order, same values.
- **Restore rides the SAME `api/db/<network>` route** the xlsx import uses, so the server
  takes its `.bak` on the way past and a restored file is shape-identical to an imported
  one. `confirmShrink()` and `persistDb()` are shared by both paths so they cannot drift.
- **A backup names its own network, and that beats the card that was clicked.** Restoring
  `partner.json` onto the IDF card would replace a good database with another network's
  rows — the same data loss the shrink guard and the server's `-cmatch` whitelist exist to
  prevent. Mismatch is refused outright, naming both networks.
- **The backup's provenance survives the round trip.** A restored IDF database still
  reports `IDF_DB.txt` / `2026-09-06`, not a `.json` and today's date; `source` and `built`
  come from the file and only fall back to the upload when it carries neither.
- **`גבה` only renders on a loaded card**, the same rule `נקה` follows: there is nothing to
  back up on an empty one, and a present-but-inert button reads as broken.
- Malformed input is refused with the reason named (`sites`, `sectors`, or the first sector
  whose value is not an array), because "invalid file" tells the user nothing actionable.

Four buttons made the card's action row wrap at whatever point the labels happened to
reach — 3+1 in Hebrew, 2+2 in English. `.db-actions` is now a fixed two-column grid, so it
reads the same in both: change-the-contents on the first row, manage-the-file on the second.

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

Two formats, auto-detected on **the shape of the row**: three numeric levels in columns 1-3 with
a non-numeric code in column 4 -> Planet point inspect, anything else -> legacy. Detection used to
key on column 0 alone, which cannot work any more: point inspect puts the point number there, so
both formats now start with a number. Lines with fewer than 7 tab-separated columns are skipped.

**Planet Point Inspect** — pasted straight out of Planet's point inspect tool:

```
point  RSRP1     RSRP2     RSRP3     BS1                BS2               BS3
1      -72.4245  -78.8269  -84.1238  NC4050C_LNC4050Ia  13207_3381063_90  IDF_Halif_11_SL_1
```

This **replaced** the old RTL-Excel paste (`site site site pwr pwr pwr point`, columns reversed,
levels positive) on 2026-09-06. That format is gone; the layout above is what Planet actually
emits, confirmed against a real point inspect.

- **BS1/BS2/BS3 order is kept exactly as Planet emits it** — rank 1 is BS1, *not* the strongest.
  In a normal single-network point inspect Planet already emits strongest-first, so the two
  agree; where they disagree, Planet wins. Decided 2026-09-06. Do not add a sort.
- **Levels arrive already negative** and print as-is — `level(raw, false)`. The old path negated
  positive magnitudes; negating these would flip the sign of every value in the table.
- **`-9999` is Planet's "no server"**, in the level column and the BS column alike
  (`-9999.000000`). That slot renders `-` across the whole row and is deliberately NOT collected
  into the unresolved-code banner — it is an empty slot, not a code we failed to resolve.
- **Exactly 3 servers per point.** This is the format the report expects, not a limitation — the
  parser is hardwired to 3 and ignores anything past column 7 on purpose. Changing it changes the
  deliverable, so don't generalize it speculatively.
- **Decimals are kept**: `-84.3` -> `-84.3`, `-84.30` -> `-84.3`, `-84.333` -> `-84.33`. A
  non-numeric level -> `-`. One `level()` helper formats the column for both input formats — at
  most 2 decimals, trailing zeros trimmed, and no `-0`. It replaced a `toFixed(0)` that silently
  rounded a pasted `84.3` down to `84` (a real value change in a commander-facing table, reported
  2026-09-04) and a `toFixed(2)` on the legacy path that forced `84.30` in the same column. The
  PPTX builder stringifies `r.power` as-is, so it inherits this automatically.
- A typical job is ~7 points => 21 rows => one slide.
- **The paste box's placeholder is point-inspect shaped, and must stay that way.** It
  still showed the retired RTL-Excel layout — positive levels, bare sector codes — while
  `paste.note` directly above it said "עוצמות כבר שליליות" and gave a
  `NC4050C_LNC4050Ia` code, so the card contradicted itself and taught a new soldier a
  format the parser no longer expects to see pasted. It now carries the first two rows of
  `SAMPLE`, so the ghost text and טען דוגמה teach the same thing. The textarea is
  `wrap="off"`: a point-inspect row is wider than the box, and wrapping split one point
  across two visual lines, which read as an extra row. One point per line also means the
  line count is the point count at a glance. Like the site editor's `EXAMPLES`, these are
  sample **data** — identical in both languages, so they stay out of `i18n.js`.
- **The column legend reads in the paste's own order** — point, level 1-3, site 1-3, left to
  right, like the rows it describes. It survived the placeholder fix still listing the retired
  RTL-Excel layout (sites first, point last), so it labelled every column of a point-inspect
  paste backwards. Fixed 2026-09-29; the legend and the format note now live in step 3 of the "?"
  tour rather than over the box. If the input format ever changes, the placeholder, `SAMPLE` and
  the tour's `pasteBox()` change together.

### The code shape differs per operator

Point inspect reports `<SiteID>_<cell>`, and the tail differs per network. `planetKey()` in
`app.js` normalises each to the key its database is actually keyed by, then `lookupPlanet()` tries
the derived key first and the raw code second (so a bare sector id typed by hand still resolves).
All four were verified on 2026-09-06 against one real point inspect:

| Network | Point-inspect code | Key used | Verified |
|---------|--------------------|----------|----------|
| Partner   | `NC4050C_LNC4050Ia`           | `LNC4050Ia` — text after the first `_` | 5/5 against `partner.json` |
| Cellcom   | `13207_3381063_90`            | `3381063_90` — `<ECI>_<azimuth>`       | 4/4, ECI arithmetic |
| IDF       | `IDF_Halif_11_SL_1`           | `Halif_11_SL_1` — the `EUtranCellFDDId`| 2/2 against the ENM dump |
| Pelephone | `P630012_630012_1911236_9260` | `P630012` — **site only**              | shape only, DB is empty |

**Pelephone's code carries no sector at all.** The trailing field is the EARFCN, so the frequency
is exact, but nothing in the code identifies which of the site's sectors was served. It therefore
resolves through the site path and is tagged `סקטור משוער`, which is the honest answer rather than
an arbitrary sector presented as fact.

**One IDF cell has two spellings, and `lookup()` accepts both.** ENM prefixes a cell with its
number on the baseband — `4_Hadas_1` — and Planet's point inspect reports it without one,
`IDF_Hadas_1`. `aliasIndex()` builds `stripped id → real key` at load and `lookup()` consults it
straight after the exact-sector pass, so an alias hit is **exact**, not the approximate site
fallback. Three rules keep it safe:

- **IDF only.** Every other network's ids lead with digits that mean something else — stripping
  Cellcom's `3634249_270` would leave a bare `270` claiming to be a cell id, on hundreds of rows.
- **A real key is never shadowed by an alias**, and an alias two cells both claim resolves to
  neither. A wrong site on a slide is worse than a missing one — the rule the Pelephone bandwidth
  path already follows.
- It is a rule about **spelling**, independent of `CHAINED`, which is about *attribution*. The
  hyphen family (`1-Aman_1`) is aliased too even though those cells are not chained, because
  whether Planet writes the prefix there has never been observed and aliasing costs nothing.

**Never read a code off Planet's own grid — only off a paste.** Planet renders the table RTL, so
`13207_3381063_90` is *displayed* as `90_3381063_13207`. Both are the same bytes in a different
direction, and the reversed reading is what produced the wrong conclusion recorded below.

**Legacy format** (already-resolved rows, no lookup) is still parsed:
`נקודה | מס"ד | שם אתר | סקטור | תדר | רוחב פס | עוצמה`. Note the two paths differ: legacy
**appends** to a point's group, point inspect **replaces** it — two point-inspect lines with the
same point number means the first is discarded.

---

### What the other three exports actually look like

Captured from Planet on 2026-09-05: the Site Editor for a Cellcom site, plus the `Sites` and
`Sectors` sheets of the Cellcom, Pelephone and IDF group exports.

**These workbooks are read off photographs of a screen, and that is permanent.** Planet runs on TS
— software goes *in* through הלבנת תוכנה and nothing comes *out* but phone photos, the same
constraint Interfex works under. So there is no future session where the real file gets checked;
column positions here are strong evidence that will never be upgraded to certainty. Build
accordingly: rules grounded in published standards rather than in a sample, and a way to verify the
result from inside TS by reading one line off the screen.

| | Site ID | Sector ID | Hebrew name? | Band Name |
|---|---|---|---|---|
| **Partner** | `MN4610A` | `LNN4610Da` | yes, in `Description` | `1800_20` — MHz_BW ✓ |
| **Cellcom** | `14196` | `3634249_270` — ECI_azimuth | yes, in `Description` | `2850_20` — **EARFCN**_BW |
| **Pelephone** | `P935739` | `935739_22` | no — Latin (`EINAV`, `HERMESH`) | `P3M_2600LTE.MIMO 3250_20` |
| **IDF** | `IDF_Amitay` | **`1` / `2` / `3`** | no — `Description` mostly empty | `P3M_750LTE.MIMO 9260_10` |

**All of this was written before any of the three had been tried, and two of them now work.**
`Cellcom_Share` and `Pelephone_Share` both imported cleanly on 2026-09-06 — see "Proven on TS"
below. Read the rest of this section as the reasoning that got the parsers there, not as current
status. Three separate blockers stood in the way
of the others, and each now has a guard so the failure is loud instead of silent.

**1. IDF's `Sector ID` is not a key.** It numbers sectors `1` / `2` / `3` *per site*, so the same
value repeats across every site in the network. Keying on it collapses a few hundred sectors into
about four, and the import would report success. Both parsers now **refuse outright** when any
sector code repeats, naming the count and an example.

**The composite is now confirmed, 2026-09-23: the key is `<Site ID>_<Sector ID>`, and it IS the
point-inspect code verbatim.** `IDF_Share.xlsx` was photographed on TS: `Site ID` reads
`IDF_Amitay`, `Sector ID` reads `1` / `2` / `3`, and concatenating them gives `IDF_Amitay_1` —
exactly what Planet's point inspect reports. No transformation, no `planetKey()` step.

Checked against the ENM-built `idf.json` rather than assumed: **44 of the 45 site+sector pairs
legible in that photograph exist as cells in the dump**, and two fingerprints make it more than
a coincidence of shape — the photo shows `Fares` carrying sectors 1, 3 and 4 with **no 2**, and
`idf.json` independently holds exactly `Fares_1`, `Fares_3`, `Fares_4`; the photo shows `Astra`
carrying an odd `3_900`, and the dump holds `Astra_3_900`. Two sources built from different
systems agree on the same gaps and the same band-suffixed sector. (The 45th, `Cabri`, is in
Planet and absent from ENM — a real difference between the two, not a misread.)

**`Cell Name` and `E-UTRAN Cell ID` are EMPTY in the IDF export**, so the cell id itself is not
in the workbook. It does not need to be: the composite reconstructs it.

**This also explains — and retires — the chained-site machinery.** "Planet drops the slot prefix"
(below) is the wrong description: Planet is not dropping anything, it models `Hadas` as a site in
its own right, which is precisely the attribution `site_of()` and the hand-confirmed `CHAINED` set
exist to reconstruct from ENM's node hierarchy. An IDF database built from the Planet export needs
no `CHAINED` list, no `CHECK :` line and no `aliasIndex()` — the export already says where the
radio is.

**2. `Band Name` carries an EARFCN for everyone except Partner.** Solved — see "Band Name is three different formats" below.

**3. Pelephone and IDF have no Hebrew site names in the export.** Pelephone's `Description` holds
Latin transliterations (`EINAV`, `HERMESH`, `KDUMIM`); IDF's is empty for most rows, with the
identity carried by the Site ID (`IDF_Har_Dov`). This is a **product** problem, not a parsing one:
the entire reason TableX exists is turning an English code into a Hebrew site name for the deck. An
unnamed site falls back to its Site ID in `lookup()`, so a row renders readably rather than blank —
but it renders in Latin. Filling `Description` in Planet, or naming sites through the site editor,
is the fix; the importer cannot invent Hebrew that is not in the file.

### Band Name is three different formats, and none of them can be checked here

**The Cellcom and Pelephone workbooks live on TS and can never be sent out.** Same constraint as
Interfex: software goes *in* through הלבנת תוכנה, nothing comes *out* but photographs of a screen.
So "wait for the file and verify" is not a plan for those two — it is a permanent block. Anything
TableX does with their data has to be right by construction, and checkable *inside* TS by a soldier
reading one line off the screen.

The three formats, captured 2026-09-05:

```
Partner    1800_20                    band label, in MHz
Pelephone  P3M_2600LTE.MIMO 3250_20   label, then EARFCN, then width
Cellcom    2850_20                    EARFCN only — band 7, which is a 2600 label
```

Nothing **structural** separates `1800`-the-frequency from `2850`-the-EARFCN: both are
`<int>_<int>`. So `parseBand()` resolves it in two passes:

1. **An operator band label if the string carries one** — Partner's `1800`, Pelephone's `2600`.
2. **Otherwise an EARFCN**, converted to its band's label through the 3GPP 36.101 downlink ranges
   in `EARFCN_BANDS` — Cellcom's `2850` → band 7 → `2600`.

The second pass is anchored to a **published standard rather than to anyone's file**, which is
exactly what makes it usable for data nobody here can inspect. Neither pass resolving leaves the
frequency `null`, counted, and surfaced — the import asks before writing a database with blank
frequencies. A blank frequency in front of a commander is recoverable; a confident wrong one is not.

Bandwidth is **the LAST legal channel width** in the string, not the first: Pelephone's `P3M_`
prefix leads with a `3` that is not a bandwidth, while Partner's `700_5_9435` carries its width in
the middle and a carrier number at the end. Both fall out correctly from "last of 1/3/5/10/15/20".

Verified against every sample there is — the eleven Band Names observed across all three operators
all resolve correctly, **and Partner's 16,510 sectors come out byte-identical to the committed
`partner.json`**, so the rule that reads the other two costs the verified one nothing.

**An EARFCN network's toast names the bands too** — `תדרים: 9260, 3525 (700, 900)`. The raw
values mean nothing at a glance, so the bands they land in are printed beside them, which is what
keeps that line a *check*. Same reason `build_idf.py` printed both, and `build_db.py` now prints a
`freqs:` line doing the same.

**How to check it inside TS without sending anything out:** the success toast names the distinct
bands it derived — `עודכן Cellcom — N סקטורים נשמרו בשרת · תדרים: 700, 1800, 2600`. That line is
the whole verification. `700, 1800, 2600` is obviously right; `1400, 2850, 9360` is obviously an
EARFCN column read as MHz. Photograph the toast, and the parse is either confirmed or diagnosed.
Do not remove `{f}` from `toast.dbSaved` — on a machine whose files never leave, it is the only
check available.

### The Cellcom point-analysis code, settled

An earlier reading of `75_3422485_13369` left the leading field ambiguous between azimuth and PCI.
The Site Editor settles it: Cellcom's sector name is `<ECI>_<azimuth>`, and site 14196's nine
sectors are `3634197_70`, `3634198_160`, `3634199_270`, `3634207_70` … whose trailing values are
exactly the azimuths of the three antennas mounted there (70°, 160°, 270°). **The azimuth
TRAILS; the leading field is the site id.**

The ECI arithmetic holds throughout — `ECI = eNodeB ID × 256 + local Cell ID`:

```
site 14196 * 256 = 3634176
  3634197..199 -> cells 21,22,23   carrier 9360_10
  3634207..209 -> cells 31,32,33   carrier 1400_20
  3634247..249 -> cells 71,72,73   carrier 2850_20
```

So a Cellcom point analysis reports the site id, the ECI and the azimuth — the same three values
the `Sectors` sheet holds as `Site ID` and `Sector ID` (`ECI_azimuth`).

**The field order is now settled: `<SiteID>_<ECI>_<azimuth>`.** A real point inspect pasted into
Notepad on 2026-09-06 reads `13207_3381063_90`, and `ECI - SiteID*256` lands in 0..255 on every
sample (cells 71, 73, 21, 73). An earlier reading of this doc concluded the *leading* field was
the azimuth — that was `75_3422485_13369` read off an RTL-rendered grid, which un-reverses to
`13369_3422485_75`. Same bytes, opposite direction. The lookup key is the code minus its leading
site id, which is exactly the `Sector ID` on the sectors sheet.

### What is still needed

1. ~~The real `.xlsx` files.~~ **Not obtainable — they live on TS and cannot leave it.** Anything
   TableX does with Cellcom or Pelephone data has to be right by construction and checkable from
   inside, which is what the band-distribution line in the success toast is for.
2. ~~A **pasted** Cellcom and Pelephone point analysis.~~ **Done 2026-09-06** — see the code-shape
   table under "Input format". All four operators' point-inspect codes are settled and
   `planetKey()` resolves them.
3. IDF is **not** coming from a Planet group export — an ENM CLI dump is the source, and it
   arrived on 2026-09-06 (849 rows / 343 nodes / 792 cells). It carries site, sector,
   `dlChannelBandwidth` (kHz) and `earfcndl`, keyed by **NodeId + EUtranCellFDDId** — the cell id
   alone repeats across 51 ids. Still missing: the **Hebrew site names**, written by hand into
   `NAMES_TO_FILL.csv` (14 family patterns covering 205 sites, plus 105 singletons). 104 of 105
   singletons and 4 of 14 families came back on 2026-09-06; the last **10 family patterns** are
   what still leaves 95 sites rendering their Latin node id.

   **Both source files live on `F:/IDF_DB_FOR_CLAUDE/`, not `D:`** — they were moved after the
   first build and the old path in this file sent a later session looking for a rebuild it could
   not run. Re-verified 2026-09-10: `build_idf.py` against those two files reproduces the shipped
   `idf.json` **byte for byte** (40,681 bytes, same sha256), which is what makes them trustworthy
   as the rebuild path rather than merely present. `DOGMA_API_OUTPUT.txt` sits beside them.

### Proven on TS — 2026-09-06

The packaged exe was run inside TS and the whole chain worked end to end, which retires most of the
caveats above. What was actually observed:

- **`Cellcom_Share` imported: 2,575 sites / 18,891 sectors.** `Pelephone_Share` imported: 2,383
  sites / 18,217 sectors. Both through the in-app `עדכן` button, first try, no cleaning step. The
  EARFCN-vs-MHz `parseBand()` rule and the header-matching contract are therefore **verified against
  real workbooks**, not just against photographs.
- **A real Planet point inspect pasted and generated**: 5 points, 15 rows, all four networks
  resolving in one table — Cellcom, Partner, Pelephone and IDF rows side by side.
- **Point numbering is 1-based and unique in a real analysis** (נק' 1..5). The worry that a single
  analysis might repeat the point id — which would have silently collapsed a paste into one point,
  since the point-inspect path REPLACES a group — did not materialise. Still the thing to re-check
  if a table ever comes out short.

**The repo still ships `cellcom.json` and `pelephone.json` as empty stubs**, and that is correct:
those workbooks live on TS and cannot leave it, so the databases exist only on the TS machine. What
changed is that the *import path* is no longer unproven — anyone with the group export gets a
working database from it.

---

## Output

**Table** (`renderTable`): points ascending, rows by rank, `נק' N` as a `rowspan` over the
point's rows, group background alternating by **group** index so each point reads as one block.

### Output styles — the report: Classic, Clean, Coverage · the site sheet: Classic, Clean, Stylish

Added 2026-09-29 on request. **Two settings, one per deliverable**, each a segmented picker in
that sheet's own toolbar and each **kept per machine** — `tablex_style` for the point-analysis
report (`[data-out-style]`), `tablex_site_style` for the site sheet (`[data-site-style]`). They
were one shared setting for an hour and were split because the two sheets offer different styles:
Coverage needs RSRP, which only the report has; Stylish needs azimuths, which only the site sheet
has. Kept per machine for the same reason the rest of this section exists: a commander reads a
familiar table faster than a correct-but-different one, so whichever style a team settles on has
to come out the same every time.

| style | what it is |
|---|---|
| **Classic** — `קלאסי` | the purple table. **The default, and byte-for-byte what every earlier build wrote** — the `classic` branch of `tableMatrix()` is the old function untouched, and the app suite asserts the purple header survives a round trip through the other two styles. |
| **Clean** — `נקי` | black on white, no fills. A 1.5pt ink rule under the header, 0.5pt hairlines between rows, a 0.75pt darker rule where a point ends, no vertical lines, the rank in grey. The point label sits on its group's first row and its column draws no line inside the group, so it reads as one merged cell. Title right-aligned, 22pt. |
| **Coverage** — `כיסוי` | Clean, plus each level cell tinted by the class **Planet 7.10's own RSRP legend** puts it in — the colours on the coverage-map screenshots beside the table in a deck — and that legend under the table, labelled `RSRP חזוי (Planet)`. |

Things that are load-bearing:

- **One definition feeds every renderer.** `outStyle` + `LEAN` + `RSRP_CLASSES` in `app.js`:
  the HTML reads them through `.out-lean` / `data-style` on the sheet (main.css "OUTPUT STYLES"
  must say what the matrix says, value for value); both PPTX writers read them through
  `tableMatrix()` → `leanMatrix()`; the template path gets the legend through
  `TableXReport.caption()` → `TableXPptx.insertCaption()`.
- **Borders are per cell** in the lean styles: `bd: {t, r, b, l}`, each a line or `null`. The
  standalone writer turns that into PptxGenJS's `[top, right, bottom, left]` array (`pgBorder`);
  `pptx.js cellXml` writes `lnL/lnR/lnT/lnB`. **A null edge is written as an explicit
  `<a:noFill/>`**, never left out — a missing edge falls back to whatever table style the
  template's theme carries, and a clean table would come out gridded in someone's deck.
  Verified 2026-09-29 by reading the written XML edge by edge.
- **A shared edge is stated by both cells that meet at it, and they must agree** — each cell's
  `t` is the `b` of the cell above it. Where two cells disagree PowerPoint picks one, and which
  is not something to leave to chance. The app suite checks every edge of the matrix.
- **The legend is written LEFT-TO-RIGHT** (its own text box / `dir="ltr"` span), with the Hebrew
  label in a separate RTL box. A range like `−75…−60` inside an RTL paragraph is exactly the run
  the bidi algorithm turns around.
- **Coverage's classes are Interfex's, not new ones**: `interfex_8/js/drivecore.js`, min
  inclusive / max exclusive — ≥−60, −75…−60, −90…−75, −110…−90, −120…−110, <−120. The cell fill
  is each legend colour **tinted 35% on white** so black text still reads on it; the pure legend
  green `#40D63E` would not. If Interfex's legend ever changes, this one follows.
- **The legend label says PREDICTED** (`חזוי`). Colour makes a level look measured more than a
  bare number does — the exact confusion the top of this file warns about.
- **The site sheet's Classic and Clean are the same two looks** as the report's, drawn by the
  same `LEAN` constants, so the two deliverables cannot drift apart.

### Stylish — the site as it stands, in 2.5D

Elad's sketches, 2026-09-29: a mast, an arrow per sector at its real azimuth, the degrees at the
tips, the height beside it, trees at the foot; then "almost like 2/3D, be precise — find how the
antennas are really sized and place them relative to the site." Each picked site becomes a
**card** (and, in the PPTX, a **slide of its own**): the name large under a short Classic-purple
bar, id · operator · coordinates under it, the sector table on the right and the drawing on the
left. Every table row carries its azimuth's colour as a stripe, so the eye goes arrow → row.

**The drawing is an oblique view looking NORTH from 28° above the horizon** (`EL`), so north is
into the page and an arrow on the ground points the way a map would. Everything above the ground
is **to scale in one px-per-metre** fitted to the site: a tapered square lattice (about a tenth as
wide as it is tall at the foot, 1.1 m at the top), a head-frame ring at each mounting height, and
each antenna as a shaded box **of its datasheet size, at its own height, facing its own azimuth,
tilted by its own mechanical tilt** (the top leans out — that is what downtilt is). A 1.75 m person
and a 7 m tree stand at the foot for scale; the dimension line beside the mast gives the heights,
merged into a range (`25–26 m`) where two are too close to letter apart. **The compass on the
ground is NOT to scale** — coverage is kilometres and the mast is metres — it carries direction
only: a wedge per azimuth as wide as the antenna's horizontal beamwidth, an arrow, the degrees and
that azimuth's carriers at the rim.

**At true scale a 2.7 m antenna on a 40 m mast is a few pixels**, so each tier of antennas (bodies
within 3 m of each other; up to three tiers) gets an **inset**: a circle in the top-left showing
the same antennas in the same projection, magnified (`×N` is printed) — a similarity of the main
drawing about the tier's own centre, framed on the antennas' corners with the box's DIAGONAL fitted
to the circle so nothing is clipped. Every tall site gets one — under ×1.3 it would say nothing,
and "sometimes there is a zoom and sometimes not" read as a fault (Elad, 2026-09-29), so the
threshold is low and the factor is printed to one decimal below ×3.

**The structure follows the heights.** Over 6 m it is the lattice. **A site whose antennas all end
by 6 m stands on a concrete block (בטונדה)** — Elad's call for the small ones: a New Jersey barrier
section (0.81 m tall, 0.61 m at the base, 0.15 m at the top, its two slopes breaking at 0.33 m,
2 m long, laid at an angle so a slope and an end both show) with a 76 mm pipe on it, the antennas
clamped to the pipe and no head frame. Drawn at up to 95 px/m, so a 2 m site fills the picture
beside a person of the same scale; no tree there — a 7 m tree beside a 2 m block would become the
subject — and no inset, since nothing is small. A tall site of omnis only is a thin pole. The SVG
says which it drew in `data-mount` (`lattice` / `block` / `pole` / `none`) and `data-shapes`,
which the `app` suite reads.

- **Antenna sizes come from datasheets — `ANT_DIMS` in `app.js`.** Planet's antenna FILE is
  per band (`EGV465DR6_700.pafx`, `EGV465DR6_1800.pafx`) but is one physical antenna, so the model
  is the file name upper-cased, hyphens dropped, cut at the first `_`; antennas are grouped by
  model + height on each azimuth. **A model is matched exactly first, then by the longest entry it
  STARTS with** (`antSpec`), so `80010892V01`, `LNX6515DSA1M` and a Vega `CC12V` find their line
  without one per spelling.
- **IDF's models** (Elad's list, 2026-09-29: 80010866, 80010867, 80010864, CC12V (Vega), ODI032,
  "and more"; the mock export adds LNX-6515DS-VTM): Kathrein 800 10864 is 1402 × 377 × 169 and
  800 10867 is 1459 × 377 × 169 (datasheets); LNX-6515DS 2449 × 301 × 181 (CommScope). **The Vega
  CC12-WB is a parabolic grid dish, not a panel** — 2.0 m aperture, 690–960 MHz, 10.5–13° beam
  (Comarcom's datasheet) — so `ANT_DIMS` carries a fifth field, `'dish'`, and it draws as a pale
  mesh disc with its rim in the azimuth's colour: ribs from behind, the feed on three struts from
  in front, and a 13° wedge on the ground. **The Comba ODI-032R20M-Q is an estimate** (2.6 × 0.6 ×
  0.2 m, 32°): no published size was found, and 19.5 dBi over 32° in 694–960 MHz needs about the
  length of CommScope's 2.4–2.7 m low-band panels at twice their width. Its beamwidth is real. Researched 2026-09-29 against Partner's 2024 export (69 models,
  13,270 physical antennas; the table covers the 15 largest plus 5 beamwidth-only entries):
  CommScope/Andrew product pages (`andrew.com/products/base-station-antennas/antennas/item…`) for
  EGV4-65D-R6, RVV65D-C3-3XR, RV4PX306R, RV4PX310R-V2, DBXLH-6565C (TBXLHA-6565C the same body),
  RVV-33B-R3 (1830 × 640 mm, 33°); EGZV5-65D-R6 from its reseller sheet; RV4-65D-R5 from its V2-V6
  sheets; Comba ODI-065R17M18JJJJ-GQ; and Kathrein's own datasheets for 800 10866 (2441 × 377 × 169),
  800 10892, 800 10292, 800 10622 and 742 264. `845 10866` is listed in Kathrein's catalogue as a
  configuration of `800 10866` and shares its body. **741571 is an indoor ceiling omni** (78 mm ×
  ⌀210 mm) — Partner's data agrees: 830 of 836 sit at 2 m, azimuth 0 — so it draws as a puck on a
  pole with a full ring on the ground and the label `Omni`, never an arrow at 0°.
- **TNA340A33 is an estimate, and says so here.** Two Israeli radiation surveys (Tel Aviv 2017,
  Akko 2018) give its "maximum dimension" as 0.80 m, but the same surveys give it a 13.4° vertical
  beamwidth at 900 MHz, which needs about 1.3 m of aperture (λ·50.8/θ) — the size Kathrein's
  similar 742 264 has. 1.3 m it is. If a datasheet turns up, replace it.
- **A model with no datasheet entry is drawn at the typical size for what it carries** (`TYPICAL`):
  2.6 × 0.35 × 0.17 m if any of its carriers is below 1 GHz — the median of the multibands above —
  else 1.4 × 0.30 × 0.12 m. That covers `80020899` (20% of Partner's antennas, whose datasheet could
  not be found) until someone adds a line. The size is illustration, never data on the table.
- **Antennas that would overlap stand side by side** on the mount, as a real head frame carries
  them — NC0543D has an EGV4-65D-R6 at 25 m and a Kathrein 800 10622 at 26 m on each of two
  azimuths. **Nothing is guessed**: an antenna without both a height and an azimuth is not stood on
  the mast; an azimuth without a height still gets its wedge; a site with no plant gets a pale
  generic 30 m mast with no dimensions and no insets.
- **Layout goes before paint.** The rim labels, the dimension line and the insets are placed
  first and recorded as boxes; labels are clamped inside the picture; then the tree tries eleven
  spots (preferring the left and the front, since the heights are written on the right) and takes
  the one that covers the fewest labels (weighted hardest — covering words is the worst thing it
  can do), arrows and the mast. A tree that would hang off the edge is not drawn at all. The
  person stands at the mast's foot where the tree is not. The painter draws back to front: ground, what stands north of the mast,
  the back faces of the lattice, antennas facing away, the front faces, antennas facing you.
- **Arrows are per DISTINCT azimuth, not per sector.** A real site stacks carriers on one azimuth
  (Cellcom 14196: 700, 1800 and 2600 all on 70°); three arrows on top of each other read as one.
  The rim lists that azimuth's **carriers**, sorted (`700/1800/2600`, or EARFCNs for IDF).
- **The drawing is ONE SVG string used twice** — inline on the sheet, and rasterised at 3× to a
  PNG for the slide (`svgPng`), so the slide shows exactly what the screen showed. A PNG rather
  than an SVG picture because SVG in PPTX needs PowerPoint 2019+, and the TS machines' Office is
  unknown. The data stays a **native table** on the slide, so the numbers remain editable.
  Gradient and clip-path ids are unique per card (`svgSeq`), since every card is inline in one page.
- **`direction="ltr"` on the SVG is load-bearing.** Inline on an RTL page the SVG inherits `rtl`,
  which flips `text-anchor`: every label grew back over its own arrow on screen while the
  rasterised copy (an image, so LTR) did not, and slide and screen disagreed.
- **The drawing's text is digits, `°`, `m`, `N`, `×` and `Omni` only, in Arial.** An SVG painted as
  an image cannot reach the page's webfonts, so Hebrew inside it would be the one thing that renders
  differently on the slide. The Hebrew (name, headers) lives outside the drawing.
- **"All sites on one slide" steps aside** (`#sdPer` hidden) under Stylish — a card is a slide.
- **How it is tested without data**: the `app` suite hands the page a seeded Cellcom through
  `Page.addScriptToEvaluateOnNewDocument` — `fetch('data/cellcom.json')` answers from the seed —
  so no database file is written, not even a `.bak`. Use the same trick for any view that needs
  data the shipped databases lack. For LOOKING at it, the shipped `partner.json` (the 2024 export,
  which carries the plant) is the richer test: SO5949A (one tier), NC0543D (side-by-side pairs), NC4127A and TR0830B (two tiers, 59/41 and
  36/20 m), SO5320K (four azimuths), SI5505A (the indoor omni).
- **The output's text never translates**, style or not: the legend label is fixed Hebrew like
  the headers. Only the picker's labels are in `i18n.js`.

**The network chip rides the export; the other two annotations do not.** Asked for 2026-09-29:
a slide that mixes operators has to say which row is whose. `NET_CHIP` in `app.js` states the
app's green `.tag-net` as file colours, and the matrix hands it to both writers as `tag` on the
site-name cell — **a second, smaller, highlighted run in the SAME cell**, so the table keeps its
seven columns and the chip wraps with the name instead of floating over it. Print shows it too
(`.tag:not(.tag-net)` is what print hides). `סקטור משוער` and `לא נמצא` stay app-only. A row that
resolved to no network gets no chip. `<a:highlight>` is what PowerPoint has for a chip; a version
too old to draw it still shows the green text.

**Cells are editable in place.** Click (or focus and press Enter on) any of the five value cells
and it becomes an input; Enter or Tab commits and moves on, Escape cancels, blur commits. This is
the last mile: a lookup that comes back slightly wrong used to mean fixing it in PowerPoint, which
is exactly the 20 minutes the app removes. Details that are load-bearing:

- **Every renderer reads `lastRows`**, so an edit reaches the HTML table, the PPTX and the print
  view with no second code path. The cell's address travels in `data-e="<point>:<row>:<field>"`
  because the table is rebuilt on every commit and the DOM node is gone by then.
- **`origRows` is a deep copy taken at generate**, and `שחזר` restores it through `ask()`. Editing
  a value *back* to its original clears the mark rather than counting a second edit.
- **An edited value is marked in the app and NOT in the export** — the same rule the chips follow.
  That is deliberate but it is also the one place a hand-typed number could pass as a Planet
  prediction, so the toolbar states the count out loud in mint whenever it is above zero. **Do not
  remove that counter**; it is what keeps the edit honest.
- **The row-reveal stagger is suppressed after the first render** (`tableAnim` → `.no-anim`), or
  the whole table re-animates on every keystroke's commit.

**PPTX** (`btnPptx`): PptxGenJS, `LAYOUT_WIDE`, **one slide**, fixed `colW`. Two traps:

- **Column order is reversed by hand.** PowerPoint tables have no RTL column order —
  `rtlMode: true` only sets text direction *inside* a cell. The row arrays are built
  strongest-column-last, mirroring the HTML. Change one, change the other.
- **The point cell is not merged.** PptxGenJS supports `rowspan`, but the export emits a filled
  purple cell per row with empty text for rows 2–3. It *looks* merged; it isn't.
- **PptxGenJS 3.12 writes a paragraph's `<a:pPr>` before EVERY run**, so any multi-run paragraph —
  the chip beside a name, the coverage legend's swatches — carried several, where the schema
  allows one, first. That is the kind of file PowerPoint offers to "repair". Every presentation is
  therefore made through `tidyPptx(new PptxGenJS())`, which wraps `exportPresentation` (both
  `write()` and `writeFile()` go through it) and keeps each paragraph's first `<a:pPr>` only. The
  runs carry `rtlMode` themselves, so the one that survives still says `rtl="1"`. Found 2026-09-29
  by reading the chip's XML; the coverage legend had shipped with the same fault that morning.

The slide title is the fixed `טבלת נתונים`, deliberately — the deck supplies mission context.

**Print/PDF**: `window.print()`; `@media print` strips the nav, toolbar, app-only tags and
warning banner and prints `.doc-page` alone.

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

**`DESIGN.md` is the design system of record** — "Signal", adopted 2026-09-29 in place of the
Mintlify reference system: a **cream** page (`--canvas`) with lighter cream cards (`--paper`) on
it, pine ink, one mint, 6/12/20px geometry, the pixel square as the only ornament, the night
landscape as the home page's floor, and a motion layer in which every button moves. Read its **Invariants** before
touching the UI.

**The nav names the five jobs, in the order they are done** (2026-10-02): `ניתוח נקודות` ·
`מפרט אתר` · `אתרים חדשים` · `חיפוש אתר` · `מצגות`, then `מסדי נתונים`. The point analysis is no
longer first because it is the only thing the app does — it is first because it is the oldest. The
paste card keeps its own title (`paste.title`), which describes the action in the card rather than
naming the view, so renaming the nav left it alone.

**The home page is the paste and nothing else** (2026-09-29): no hero, no headline, no format
note. The databases have their own view (`viewDb`, the nav's Databases link and the status chip
both go there), and how to get the paste out of Planet is behind the "?" — see below.

**`--canvas` and `--paper` are two tokens on purpose.** The page, the nav, the toolbar and the
loader sit on `--canvas`; everything ON the page — cards, modals, popovers, inputs, the text on a
filled button — is `--paper`. The paste box is a well in the canvas colour, so it reads as
recessed into its card. `.doc-page` stays hardcoded `#ffffff`: the report is a white sheet on the
cream desk, in both themes.

The one that matters most: **the generated report table is not part of the design system.** Its
purple palette is the *deliverable's*, matched to what commanders already see, and `.doc-page` is
**pinned to the type it had before the redesign** (Inter + Heebo and the old system mono) so the
app changing face did not change the document. Do not restyle the table to match the UI.

**Fonts are self-hosted.** The app is IBM Plex Sans Hebrew (it carries Plex's Latin too, so one
family serves both scripts) with Plex Mono for codes; Inter + Heebo ship only for the report
preview, routed by `unicode-range`. Regenerate with `python tools/build_fonts.py` (needs
internet; run it on the dev box, commit the result).

**Every button moves, through `js/motion.js` — never by inserting anything into a button.**
`app.js` and `i18n.js` rewrite button text freely, so a child span added for an effect would be
wiped, or would leak into a `textContent` read. Three shared behaviours, all delegated from the
document:

- **The press** is a Web Animation with `composite: 'add'`, so it stacks on whatever transform a
  component carries. That is what lets one rule cover every kind of button without editing twenty
  transition lists — keep component hover motion on the individual `translate` / `rotate` /
  `scale` properties, never `transform`, or the two will fight.
- **The rings** — a click transmits two thin mint rings from the press point, the scene's coverage
  arcs — are drawn in one fixed `.fx-layer`. List rows (`.sd-hit`, `.ins-head`) and the tiny
  thumbnail controls are `QUIET`: they press but do not transmit.
- **The sliding markers** (the nav's active bar, every `.seg` thumb) are pseudo-elements placed
  from `--ind-x` / `--ind-w`. A MutationObserver on `class` moves them; a ResizeObserver re-measures
  when a language switch, the fonts, or a popover opening from `display:none` changes geometry.
  `place()` guards its `classList.remove` — removing an absent class still queues a mutation
  record, which would otherwise re-trigger the observer every frame while a control is hidden.

The **theme** change is a view transition that sweeps from the pressed button (`setTheme()` in
`app.js`, `themeSweep` in `main.css`); the **language** switch cross-fades. Both fall back to an
instant swap without `startViewTransition` or under reduced motion.

Animation is restrained and everything respects `prefers-reduced-motion`: staggered entrances,
a count-up on the DB numbers, a per-row table reveal **capped at 18 rows** so a long table never
makes anyone wait for decoration.

**The loader** (`#loader`) covers the async DB fetch. It is determinate — the bar fills as each
database lands, then once more when `document.fonts.ready` resolves, so the page does not
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

## The floor — the network at night, under the home page

`js/scene.js` draws a **pixel landscape of cell sites at night** — hills, lattice towers, a rooftop
site, an analysis-point pin, coverage arcs, and the **ghost mark itself** drifting between them.
Technique lifted from UbiPlus's header lobby (`D:\projects\UbiPlus`, `js/lobby.js`): inline SVG
rects on one integer grid, no assets, nothing from a CDN. The *subject* is not: a living room says
nothing about this app, so it became the thing TableX is actually about.

**Where it lives changed on 2026-09-29, twice.** It was the hero's bottom 184px, with the paste
card planted on its horizon. Elad wanted the home page clear — no headline, no explanation — so
the hero went. The scene spent an afternoon as a half-scale window in the nav, and then moved to
where he marked it: the **floor of the home page** (`.floor` → `#sceneHost`), full width, back at
**full scale** (`S` 4, `HZ` 24, three ground rows), under a 48px sky that fades down from the
cream into night. **The footer stands on its ground** — `.floor .foot` takes `--sc-ground`, which
is why the scene palette lives on `.floor` rather than on `#scene`. The old coupling — `.bridge`
−84px ↔ `GROUND_PX` — went with the hero; nothing binds the floor's height but `.scene-host`.

It is on the home page only, and it is still bounded: the bottom of one page (DESIGN.md
invariant 2).

Things worth not re-breaking:

- **Colour lives in `main.css`, reached through CLASSES, never a `fill=""` attribute.** A theme
  switch then costs nothing — no re-render, no MutationObserver (UbiPlus needs one; this does
  not). The window is dark in *both* themes, so one palette serves both with a small dark nudge.
- **Opacity that the tick animates is set as an ATTRIBUTE, and must not also be declared in CSS**
  — a CSS property wins over a presentation attribute and would silently freeze the pulse. That
  applies to `.sc-arc`, `.sc-star` and `.sc-lamp`; `.sc-site`'s base opacity is CSS because the
  tick only toggles a class there.
- **The ghost is the mark, cell for cell** — the same 14×14 grid as the nav SVG, the `.ico` and
  the loader, with the loader's two skirt phases read off its CSS grid areas. It is not a
  lookalike, and it must not become one: if `build_icon.py` changes the mark, `GH` changes too.
- **Crest wavelengths are in CELLS, and were tuned to 220–870px at 4px a cell** (110–435px now).
  The first attempt used ~0.02 rad/cell, whose period is wider than the viewport, and every ridge
  came out a dead-flat slab. Each crest also carries a ripple term, without which `round()` holds
  one row for fifty columns and the lit rim reads as a ruled line rather than a ridge.
- **Four ranges, not three.** Three read as stacked bands; the fourth is what turns them into
  distance. Value carries it — the most distant is lightest (it sits in the horizon haze) and each
  nearer layer steps darker, down to a near-black foreground.
- **The horizon glow is a CSS radial, not pixels.** A dithered pixel gradient costs a thousand
  rects for what one gradient does better.
- **The tick parks itself** off-screen (IntersectionObserver — which is also what parks it on
  every view but home, where the floor is `display:none`), in a background tab
  (`visibilitychange`), under `prefers-reduced-motion`, and when the scene is switched off. Under
  reduced motion `_render()` pins one still frame with a site lit, or the coverage arcs would
  simply be missing.
- **`cells` is rounded UP** and the host clips the spare pixels. Rounded down, the drawing came
  up to 3px short of a full-bleed host and the sky showed through as a sliver at each end of the
  ground.
- **The sky fade is interpolated in oklch from `--canvas`.** Mixed as plain transparency, cream
  into pine went through a dead grey. Under 360px wide nothing is drawn (`MIN_W`); a phone gets
  the ghost and one mast.
- **Switched off in settings, the night goes with the landscape**: `.floor:has(#scene.off)`
  collapses the sky and returns the footer to the page's own cream, so a scene-less page does not
  end in a dark slab with nothing on it.

---

## The "?" — how to get the data out of Planet

The home page carries no explanation any more: a card, a box, a button. The column legend and the
format note that used to sit over the paste box, and the hero's headline, all went behind a **"?"**
on the paste card (`js/tour.js`): five steps, Planet → copy → paste → generate → fix and export,
each with a small markup drawing of what that step is about.

- **The drawings are markup, not screenshots.** Nothing to go stale in a second place, and they
  theme with the app — except step 4's, which is the report's purple and white and fixed Hebrew
  headers, because it IS the report (invariant 1): it does not translate, like the real one.
- **The sample rows in them are DATA** — the first rows of `SAMPLE` — so they live in `tour.js`,
  not `i18n.js`, the same rule the paste placeholder and the site editor's `EXAMPLES` follow.
- **The last button does the thing**: it presses `#btnSample` (so `app.js` stays the one owner of
  `SAMPLE`), closes, and hands focus to generate, which answers with a mint cue.
- **First visit only**, the "?" transmits twice once the loader lifts (`.nudge`), and never again
  after the tour has been opened once (`tablex_tour_seen`).
- **Escape is caught at the document in the capture phase**, so the tour answers it before
  `app.js`'s own Escape chain (on `window`) can close something beneath it.
- **Steps 1-2 are written from what this file records about point inspect** — the tool's name,
  its seven columns, and that Planet renders its grid RTL so a code read by eye comes out reversed.
  The exact Planet menu path to open it was never recorded. If a soldier reports a step that does
  not match Planet, the words are `tour.*` in `i18n.js`, both dictionaries.

---

## Decks — a whole PowerPoint from a template

`מצגות` in the nav. Upload a real `.pptx` once, mark the places that change, and every later deck
is: drop the Planet screenshots, press generate. `js/pptx.js` is the engine (read + patch a
package), `js/deck.js` is the view.

### The one idea the whole feature rests on: we never re-author the deck

The obvious design is to read a `.pptx`, learn what it contains, and *generate* a new one that
looks like it. That loses every time. A real deck carries a theme, masters, layouts, fonts,
gradients, grouped vector logos, animations, speaker notes and a unit's branding — a rebuild
reproduces the 10% we understood and silently drops the rest. What comes out is *like* the deck,
and "like" is exactly what makes it unusable in front of a commander.

**So the template IS the uploaded file**, kept whole. Generating only ever:

- adds media parts and the relationships pointing at them,
- inserts `<p:pic>` / `<p:graphicFrame>` into a slide's `<p:spTree>`,
- clones, drops or reorders entries in `<p:sldIdLst>`.

Everything untouched survives because it was never touched. That also lets the parser stay
ignorant: it understands slide size, the slide list, shape rectangles and the relationship graph,
and a shape it cannot read is a shape it leaves alone.

**This is why the editor does not let you retype the deck's own text.** Editing arbitrary
PowerPoint content in a browser means reimplementing PowerPoint badly, and the output would be
worse than the file the user already has. PowerPoint edits the deck; TableX marks it up.

### Things that are load-bearing

- **JSZip is already on `window`** — `js/pptxgen.bundle.js` is a UMD bundle whose first module is
  JSZip, so the deck *writer* vendored for the table export turned out to carry the zip *reader*
  too. `js/pptx.js` must load after it. No new dependency was added for any of this.
- **Clone before patch.** In `build()`, every repeated slide is cloned in pass 1, before pass 2
  writes anything into any slide. Cloning after patching copies the first copy's picture into the
  second — the bug the two passes exist to prevent.
- **Slide ORDER is `<p:sldIdLst>`, never the file names.** `slide7.xml` can be the second slide.
  That is what makes reorder and delete safe: nothing is renumbered, so every other part's
  relationships keep pointing where they did.
- **A deleted slide is deleted, not hidden.** Removing it from `sldIdLst` alone would leave the
  content in the file; `deleteSlide()` also purges the part, its rels, its content-type override,
  the presentation relationship and any notes slide that pointed at it. "Deleted" has to mean
  deleted in something that goes to a commander.
- **A `graphicFrame` carries `<p:xfrm>`, not `<a:xfrm>`** — the presentation namespace, not
  drawingml. Reading only the drawingml form skipped every table and chart in a template
  *silently*, so they never appeared in the preview. Caught by the E2E suite; `xfrmOf()` checks
  `p:` first because a chart's own drawing can contain a nested `a:xfrm` that would win.
- **Pictures are centre-cropped, never stretched**, via `<a:srcRect>`. A Planet screenshot
  squashed to a slot's aspect ratio is a distorted map, which on a coverage slide is a factual
  error rather than a cosmetic one. The crop is expressed in the file, so it can be undone in
  PowerPoint.
- **A missing `<Default Extension="png">` in `[Content_Types].xml`** is the classic "PowerPoint
  found a problem and needs to repair" prompt. `ensureDefault()` exists for that.
- **The report table has ONE definition.** `tableMatrix()` + `TBL` in `app.js` are consumed by
  both writers — the standalone slide and the injector — through the `TableXReport` bridge. They
  used to be one function, and a copy would have drifted the moment either was touched. The
  columns are still reversed by hand in both: PowerPoint tables have no RTL column order.
- **`js/deck.js` speaks through `TableXUI`** (`toast`, `ask`) rather than growing its own, so a
  prompt still speaks in the app's voice and never becomes `window.confirm()`.

### Assignment is positional, on purpose

Images are one ordered list; slots consume it in deck order. There is no drag-an-image-onto-a-slot
step to get wrong, reordering the strip is the only control, and **the plan is rendered in full
before anything is generated** — so the output is never a surprise. A slide marked *repeating*
consumes as many images as it has picture slots, once per repetition, until they run out; a
two-maps-per-slide layout therefore just works.

---

## Planet quests — driving Planet 7.10 from TableX

> **STEP 1 IS BUILT AND WORKING ON TS; STEPS 2 AND 3 ARE NOT BUILT.** `אתרים חדשים` in the nav
> (`TableX/js/quest.js`, engine in `TableX/js/sitegen.js`) writes a new-site workbook, and Planet
> imports it — after the file is opened in Excel and saved, which is the one manual step and is
> explained below. The rest of this section is design plus what photographs taken on TS on
> **2026-09-18** established. Read "What is still unknown" before believing any of it is settled.

Asked for by Elad, 2026-09-18: an app that "rides" on Planet and does the repetitive jobs the RF
team gives it. **Decided the same day: a menu of recipes, not an AI.**

**Why no AI, written down so it is not re-litigated.** TS has no internet, so nothing can call
Claude from there. A model running locally means several GB through הלבנת תוכנה, a machine with a
GPU, approval for an AI on a classified network, and — once all that is paid for — a small model
that drives tools *worse* than a fixed recipe does. The recipes have to exist either way, because
an AI layer could only ever choose between them. So the recipes are the product; if a local model
is ever approved it can be added on top of them without changing anything underneath.

### The first quest: בחינות אתרים

What the team does by hand today, and what the quest replaces:

1. Data arrives for a site that will be built — a נ.צ plus its plant.
2. **Copy an existing site in Planet and change its data** to the new site's: נ.צ, azimuth,
   height, tilt, frequency, **PA power** (49 dBm ≈ 80 W is the default) and **antenna model**
   (`80010866`, Vega `CC12W`, `ODI32`, and a few more — the same models `ANT_DIMS` already draws).
3. Run an **LTE FDD Analysis** per scenario. Four are in use, and they are **combinations of
   groups**, not settings: `מצב קיים` · the new site **alone** · `קיים + the new site` ·
   `קיים + the new site, without Partner_Share`.
4. Screenshot the result — **usually the RSRP layer only** — into the commander's deck.

**This is 13+ sites in a round**, three or four analyses each. That is the whole reason the quest
exists, and the arithmetic is the same one the point-analysis table removed: a job that is purely
mechanical, repeated dozens of times, where every repetition is a chance to get one field wrong.

**The analysis AREA is a polygon the team sets per job**, not per site and not the country — "I
take all of this area when working here, not less, because I can ruin the כיסוי by taking fewer
sites". The spec file names it (`AreaGridName`), so a cloned analysis inherits whichever area the
template analysis used. Do not try to compute an area per site.

### The one rule: write Planet's INPUTS, never drive its UI or its database

Planet 7.10 is a .NET application hosted on **MapInfo Pro 64-bit** (its ribbon carries MapInfo's
own `Table` / `Map` / `Spatial` / `Raster` tabs, and MapInfo's Tool Manager and
`Run MapBasic Program` are both reachable). That opens three plausible ways in — clicking the UI
through Windows automation, calling .NET assemblies, or writing files Planet already reads — and
**only the third is worth building**. The first breaks on any dialog change; the second has no
public surface (see below); the third uses code Infovista wrote and the team already trusts.

So each of the three steps rides a channel that already exists:

```
TableX: new sites + a template site ──► group-export .xlsx ──► Planet: Import (the team's own routine)
TableX: scenarios × sites           ──► analysis folders   ──► Planet: Scheduler → Start, once
MapBasic inside Planet: open each result, zoom, Save Window ──► PNGs ──► TableX מצגות ──► PPTX
```

**There is no desktop API, and that was checked rather than assumed.** The install carries no SDK
or scripting documentation (`Help\` is MadCap web help plus `Getting Started Guide.pdf` and
`ReleaseNote.pdf`; `Assembly\` is 551 files of implementation — `aexio.*`, `Accord.*`, `EFAL\`),
and Infovista's published "open APIs" belong to **Planet Cloud**, not to the desktop product.

**Three constraints that shape every decision here**, all of them already familiar from Interfex:

- **The project is SHARED** (`Hoshen_MASTER_03-2026`, with the `*_Share` groups the whole team
  depends on). A quest may **add** clearly-named new things; it must never edit or delete anything
  that was already there, and **a generated Site ID must never collide with an existing one** —
  an import that reuses an id would overwrite a real site in everyone's project.
- **Development is blind.** Planet is on TS, software goes in through הלבנת תוכנה, and nothing
  comes out but photographs. Same rule the workbook parsers were built under: prefer rules
  grounded in a published format over rules fitted to one sample, and give every quest a line a
  soldier can photograph to prove it worked — the import toast's band list is the model.
- **A program that operates Planet is a different category from a static app** for whoever
  approves הלבנת תוכנה. Say so up front rather than discovering it at the gate.

**v1 should hand the user files to download and let them do the import themselves.** The server
writes only under `TableX/data`, and pointing a write route at `C:\Projects\<project>\` to save a
few clicks would put the app's one dangerous capability next to the team's live project. Download,
then import, is the same number of decisions and none of the risk.

### What the photographs established

**Step 1 — sites.** The team imports and exports groups *and single sites* routinely; that is
already how they refresh TableX's own databases. The export is the workbook
[the contract](#updating-a-database) describes, with more sheets than the importer reads
(`Sites`, `Antennas`, `Antenna_Electrical_Parameters`, `Antenna_Constraints`,
`Link_Configurations`, `Antenna_Model_Bands`, `Summary`, and the sectors sheets). **TableX writes
one back**: load an export of the template site, clone its rows across *every* sheet once per new
site, rewrite the ids and the changed fields, leave every other column alone. That is exactly what
"copy a site and change its data" does by hand, and it means the columns nobody here understands —
propagation settings, constraints, link configurations — keep the template's values instead of
being invented. **SheetJS is already vendored and writes `.xlsx`**, so this adds no dependency.
The `Sites` sheet's `Longitude` / `Latitude` held **UTM 36N metres** in the photographed export
(`622321.5` / `3452921`); `coordText()` already decides degrees-or-metres by magnitude and this
must do the same, not assume.

**Step 2 — analyses.** An analysis is **a folder** under `C:\Projects\<project>\LTEFDD_Analyses\`:

```
17092026_סע_למעלה\
  AnalysisSpecification.xml      ~161 KB — the settings
  Sectors.bin                    2-3 KB  — contents unknown
  <name>_RSRP_Common_M.mrr/.TAB/.ghx     — the results, as MapInfo rasters
  <name>_BestServer_1..3, _BestServerRSRP_2..3, _RSRQ_Common_M, one .PPRC
```

`AnalysisSpecification.xml` is plain text: .NET `DataContractSerializer` output (namespace
`http://mentum.com/planetservice/v1`, `z:Id` reference ids) holding `LTEAnalysisSettings` —
`AnalysisAreaTypeSelection = Predictions`, `AreaGridName` (the area polygon),
`CoverageProbability 85`, `EquipmentType Man-LEX20`, `Bound`, and an `LTERapidAnalysisSettings`
block. **Cloning it means changing VALUES, never structure**: `z:Id` ids must stay unique and the
references that point at them must keep pointing, so adding or removing elements is a different
and much riskier job than editing the text inside one.

**The Scheduler already solves running them.** `Automation → Schedule` lists every saved analysis
with a checkbox and a `Start` button, and the team's list is full of exactly these jobs
(`15 מצב קיים`, `504 small zval + partner`, `הר דוב_אזימוט 340`). Nothing needs to be built to run
39 analyses — only to *create* them.

**Step 3 — images.** The results are MapInfo tables (`..._RSRP_Common_M.TAB`, with the `.mrr`
raster and a `.ghx` carrying the colours), which the team opens in MapInfo. So MapBasic can open
each one, add it to the map the user already has set up, zoom to the site and `Save Window ... As
... Type "PNG"`. The PNGs then go to `מצגות` in order, which is positional — so **name them in the
order the deck consumes them** (site 1 קיים, site 1 + new, site 1 without Partner, site 2 …).

### The site writer — `sitegen.js`, built 2026-10-02

Elad's idea, and it is better than waiting for the single-site photograph: **a full group export is
already a complete specimen of the format.** `Partner_May_26_V3.xlsx` is on the dev box, so unknown
#1 below stopped being a photograph and became a file that was read. A new site is written by
cloning a real one.

**The donor is per SECTOR, not per site, and that is the whole trick.** A band choice drags four
other columns with it — `1800_20` means `Propagation Model P3M_1800MHz_FinishTuned_2018.pmf`,
`Carrier Name 1800_20_SB1_PHI`, `Carrier: 1800_20_SB1_PHI = Allocated` with the other three
`Unused`, and `Group: PHI_1800 = TRUE`. None of that is hardcoded. Each new sector clones a sector
that **already carries its band**, so Planet's own configuration supplies every derived column and
there is no second copy of it here to drift. Verified on a 6-sector test site: the 1800 sectors came
out with the 1800 propagation model and carrier, the 700 ones with `P3M_750MHz_FinishTuned_2018.pmf`
and `700_10_SB1_PHI`, all six with the right group flags.

#### The group: the FILE NAME decides it, the column marks it

**`Group: <name>` is a TRUE/FALSE column on the `Sectors` sheet and nowhere else** (`Group: PARTNER`,
`Group: PHI_1800`, `Group: PHI_2600`, `Group: PHI_700`, `Group: PHI_700_9435` in the Partner
export). Group membership is **a column in the workbook**, which is a partial answer to unknown #2
and was not known before: the scenario combinations may be expressible by writing a column rather
than by cloning `AnalysisSpecification.xml` at all.

**How the team actually uses it** (Elad, 2026-10-02). The group is created **in Planet first**, and
a sector joins it by the sheet carrying a column headed with that group's **exact** name. So the
writer takes a group name, renames the FIRST `Group:` column to `Group: <name>`, and writes `TRUE`
on every row — all the new sectors go into the one group. The remaining `Group:` columns are
removed, for the reason below.

**They are not merely irrelevant, they are dangerous, and that is the load-bearing half.** A cloned
row arrives carrying the TEMPLATE's memberships — every Partner row is `Group: PARTNER = TRUE` and
one of the `PHI_*` columns `TRUE` — so importing one unchanged adds the new site to two of the
team's **real** groups in a shared project. That is exactly what "a quest may add clearly-named new
things; it must never change something that was already there" forbids.

**PROVEN ON TS, 2026-10-02 — and two of this file's own answers were wrong.** The first test
workbooks were refused; the same data imported once Elad renamed the file and deleted columns. What
that settled:

- **THE FILE NAME IS THE GROUP NAME.** The identical workbook was refused as
  `TableX_new_site_TX9001A.xlsx` and accepted as `TableX_Test.xlsx`, the name of the group created
  in Planet beforehand. **The download name is load-bearing, not cosmetic**, and **one file is one
  group** — a round covering several groups is several files. Nothing inside the workbook says this;
  it could not have been derived by reading the format, only by trying it.
- **The other `Group:` columns must be DELETED, not set FALSE.** This file's first answer was to keep
  them and write `FALSE`, reasoning that the export should keep the shape Planet produced and that a
  missing column is a guess about what the importer tolerates. That was reasoning, not evidence, and
  Planet disagreed with it. `dropCols()` removes them (18 columns → 14 on the Sectors sheet).
- **A blank `Physical Cell ID` / `Cell ID` is ACCEPTED.** The file that imported was `TX9001A`, the
  variant with those four fields emptied, so the design under `BLANK` stands and TableX never has to
  invent a PCI. The `keepIdentity` fallback stays in the module but has no known use.

#### The Excel round trip is the accepted recipe, and why

**Planet will not import the workbook as TableX writes it. Opening it in Excel and saving makes it
import.** Three trials on TS (Elad, 2026-10-02) narrowed this and then stopped, because the
workaround costs about ten seconds and the feature is worth having now:

1. **Unblocked, never opened in Excel → refused.** That ruled out the Mark of the Web, which had
   been the leading theory, and put the fault in the package itself.
2. **`bookSST: true` added → still refused.** It is kept anyway, because it fixed a REAL defect:
   SheetJS writes `t="str"` for every text cell, which in OOXML means a FORMULA's cached string
   result, where a literal text cell must be `t="s"` indexing `sharedStrings.xml`. Planet's own
   export and Excel's re-save both use `t="s"`; ours now does too, shared-string indices and all.
   Excel reads `t="str"` happily, which is why the Excel round trip hid this for so long.
3. **Opened in Excel and saved → imports.** Every time.

**`writeWorkbook()` in `sitegen.js` is the only place the bytes are produced**, and it passes
`bookSST: true`. Never call `XLSX.write` directly for a Planet workbook.

**What is still different, after diffing our output against Excel's re-save of that same file part
by part — and it is now exactly one thing:** `xl/metadata.xml`, which SheetJS 0.20.3 writes
unconditionally (it is there even for a two-cell workbook) and which neither file Planet accepts
carries. Everything else is cosmetic: Excel adds `mc`/`x14ac` namespaces, `<pageMargins>`,
`spans`/`ht`/`dyDescent` on rows, and orders two attributes differently. `[Content_Types].xml` was
checked for the classic fault and is clean in both — no Override names a part that does not exist,
and no part is undeclared.

**So `metadata.xml` is the last suspect, and it is UNTESTED.** Nothing references it from a cell (no
`vm=` attribute anywhere), so it can be dropped — but only together with its `[Content_Types].xml`
Override and its `workbook.xml.rels` Relationship, or the package ships a dangling relationship,
the exact defect the Decks engine's suite checks for. Doing it needs a zip rewrite: JSZip is on
`window` in the app (from `pptxgen.bundle.js`) but that bundle throws when required in Node, so the
Node driver needs its own. **Not built** — it is one more trip to TS to test a guess, and Elad
decided the Excel step is cheap enough to live with.

**If it is ever worth removing the step entirely, the server can do the round trip itself.** Excel
is automatable over COM from PowerShell — `New-Object -ComObject Excel.Application`, `.Open()`,
`.Save()`, `.Quit()` — which is exactly how the diffs above were produced on the dev box. That
would make `server.ps1` depend on Office being installed and activated on the TS machines, which is
a heavier dependency than anything else in this repo, so it is an option and not a plan.

**The diagnosis technique is the reusable part.** Excel being automatable here means the exact
transformation that makes Planet accept a file can be reproduced on the dev box and diffed part by
part. That turns "Planet refused it" from a question only TS can answer into one this box can
mostly answer, which is worth remembering for the analysis-folder work.

#### The view — `אתרים חדשים`

Four numbered steps, each revealed by the one before it, because the order is not optional.

1. **Load a group export.** The clone needs the WORKBOOK, not the database: `partner.json` carries
   names, carriers and plant, but not `Propagation Model`, `TAC`, `Carrier Name` or the other forty
   columns a Planet row has. Only the export has those, which is the whole reason a new site is
   cloned from a real row rather than written from nothing.
2. **Pick a template site.** Its sectors **seed the form**, so the fields open holding real values
   to adjust rather than empty boxes to fill. That is the job restated: copy a site, change its
   data. The plant is read through the explicit sector→antenna join, never matched by azimuth — a
   multi-band site has two antennas on one azimuth and matching by it would take whichever was
   indexed first, the same silent-wrong-answer the Pelephone bandwidth path refuses to give.
3. **Name the group**, which must already exist in Planet.
4. **Edit and generate.** Only the identity starts blank: the Site ID and the name are the two
   things that must be new. A Site ID the export already carries is refused outright.

**The workbook stays in the Worker.** Reading all seven sheets in full is ~6.5 s — more than the
database import, which reads only the two sheets it understands — so it cannot run on the main
thread. But it also must not come BACK: handing the page 16,510 rows × 47 columns would be a
structured clone of tens of megabytes. The worker instead answers small questions (the site list,
one site's plant) and returns the finished bytes, transferred rather than copied. `sitegen.js`
carries the same dual-load tail `dbparse.js` uses, so the Worker and the main-thread fallback are
one copy of the logic rather than two that can drift.

**The view states the Excel step every time it generates**, in the toast and in a panel under the
button. It is the one thing between a generated file and a working import, and burying it in a
README would mean rediscovering it.

#### What the writer is checked against

- **Out here:** 37 rows over all seven sheets for a 6-sector site, the shape a real one has; every
  user field applied; every derived column correct, including the per-band propagation model and
  carrier; one group column kept TRUE and the rest dropped, with the no-name and
  name-already-exists paths both exercised; the collision guard refusing a Site ID the export
  already carries and writing nothing; and **`build_db.py` parsing the generated workbook back** as
  a valid Planet group export, recovering all 6 sectors, the plant, the Hebrew name and the coords.
- **On TS:** Planet's Import accepts it — see above for the two rules that trial corrected and the
  one question it left open.
- **Not covered anywhere:** how a site generated this way behaves in an ANALYSIS. The import is
  proven; that its predictions are sane is not, and the first real round is the test.

`TX9001A` is the test site and **`TX` is a prefix no real Partner site uses**, so a test import
cannot collide with anything in `Hoshen_MASTER`. Delete it and its group afterwards — a shared
project should not keep our scaffolding.

### What is still unknown — the next session starts here

Round 3 was asked for on 2026-09-18 and has not come back. In rough order of how much it blocks:

1. ~~**Every sheet of a single-site export.**~~ **Answered 2026-10-02 without a photograph** — a
   group export is a complete specimen of the format and `Partner_May_26_V3.xlsx` is on the dev box.
   Seven sheets, every column, every join (Site ID / Sector ID / Antenna ID) read directly. What
   remains is not knowledge but a trial: **does Planet's Import accept what we write.**
2. **Where `AnalysisSpecification.xml` records WHICH sectors or group it covers**, and what
   `Sectors.bin` holds. At 161 KB the XML is big enough to carry a few thousand sector ids
   outright. Notepad + Ctrl+F for `Group`, `Sector`, the analysis's own name and `Partner`, plus
   the last screen (Ctrl+End), answers it. **Until this is known, step 2 is a guess** — and if the
   selection turns out to be a static sector list rather than a group reference, TableX computes
   it from group exports, which it can already read.
3. **Whether Planet discovers an analysis folder written by hand.** The test costs five minutes
   and no software: copy `AnalysisSpecification.xml` + `Sectors.bin` into a new
   `LTEFDD_Analyses\TEST_COPY\`, reopen Planet, look at the Scheduler, then delete the folder (and
   don't press Synchronize while it is there). If Planet only learns about analyses from its own
   project registry, step 2 needs a different route.
4. **Whether MapInfo's MapBasic window is reachable inside Planet and runs typed statements**
   (`Note "TableX"` is the whole test; Ctrl+Q searches the ribbon for it). If yes, step 3 needs no
   compiled program at all — TableX generates the script text and the user pastes it. If no, it
   needs a `.mbx`, and then **MapInfo Pro's exact version matters**, because a compiled MapBasic
   program has to match it (`Planet 7.10\mapinfo\MapInfoPro.exe` → Properties → Details).
5. **Predictions.** A copied site's sectors presumably need `Generate Predictions` (it is on the
   group right-click menu) before an analysis can use them. Nobody has said whether the analysis
   or the Scheduler does that itself.
6. **What coordinate format the incoming נ.צ arrive in** — the export is UTM 36N metres; if the
   data arrives as ITM or degrees, TableX converts, and that conversion is published mathematics
   that can be verified against a known point rather than against a photograph.
7. **The naming convention for new sites**, so generated ids cannot collide with real ones.

### What TableX already has that this needs

Most of the quest is glue, which is the reason to build it here rather than as a new app: the
group-export parser (`dbparse.js`), SheetJS to write one back, `coords` / `ant` / `pwr` already
carried per sector, the site search, the Decks engine for the PPTX, and `ask()` / toasts /
i18n for anything it says. What is genuinely new is a quests view, a workbook *writer*, and an
`AnalysisSpecification.xml` cloner.

---

## Tests

```
.\server.ps1 -NoLaunch            # in one window
node tools/e2e/run.mjs            # in another — 171 checks, ~85 s
node tools/e2e/run.mjs deck       # one suite
node tools/e2e/run.mjs --keep-shots
```

Zero dependencies, like `tools/*.py`: Node 22+ has a global `WebSocket` and `fetch`, so nothing
is installed and nothing is downloaded. It drives headless Edge (or Chrome) over the DevTools
Protocol and exits non-zero on failure. `TABLEX_BROWSER` overrides the browser, `TABLEX_URL` the
server, `TABLEX_VERBOSE=1` prints passing checks too.

| suite | what it covers |
|-------|----------------|
| `engine` | `js/pptx.js` — parse a package, insert a picture, clone/reorder/delete slides, then **re-open the output** and assert on it, including that no relationship dangles |
| `deck`   | the whole Decks flow — upload a template, mark slots, mark a slide repeating, save to the server, drop images, build, re-open, and confirm the report table came out as a native `<a:tbl>` |
| `app`    | the lookup view, in-table editing, the site editor's add form, that a chained cell resolves under BOTH its ENM and its Planet spelling, the site-data sheet, the databases view, and the "?" tour end to end |
| `quest`  | אתרים חדשים end to end — builds a seven-sheet group export in the page, loads it, picks a template, refuses a Site ID the export already carries, generates, and reads the workbook back: one group column named after the group and TRUE, the per-band donor's propagation model, PCI blanked, antennas renumbered, and a `sharedStrings` part with no `t="str"` cell |

**Why a browser and not unit tests.** Everything worth testing here is interactive — clicking a
slot onto a slide, dragging it, typing into a table cell, feeding a `.pptx` through a file input.
None of it is reachable from Node, and all of it is where the bugs were: both defects these
suites have caught (a clone taking an already-patched slide, and `graphicFrame` using the
presentation namespace for its transform) were invisible to reading the code.

**What they cannot cover.** The fixtures are built by the app's own PptxGenJS, so no file from
real PowerPoint passes through them, and nothing here checks how a deck *looks*. Treat a green
run as "the packages are well-formed and the flow holds together", not as "it is right".

**The deck suite cleans up after itself, and deletes only what it made.** It used to assert
that the server held exactly one template, while never removing the one it saved — so it
passed on a clean machine and failed on every run after, which is the worst possible
behaviour for a check you are told to run before pushing. It now records the template ids
that existed first, asserts on the single new one, and `DELETE`s just that at the end. It
must never clear the directory wholesale: a deck template is somebody's actual presentation.

**A suite that needs the server is not optional about it** — the runner refuses to start rather
than reporting a wall of failures. Suites each get a fresh page, because one leaving a saved
template or a generated table behind would make the next pass for the wrong reason.

---

## Lookup — the databases as a reference, not only as a step

`חיפוש אתר` in the nav opens its own view (`viewLookup`) that searches **all four databases at
once**: type a sector code, a site id or a Hebrew name and get the site, its sectors, and each
sector's frequency and bandwidth.

**Why it exists.** The databases are the app's real asset — tens of thousands of sectors carrying
Hebrew site names that exist in usable form nowhere else on these machines. Until now they were
reachable only *in service of* generating a table, or through the site editor's search, which is a
modal about **editing one network**. "What is `LNN4610Da`?" is a question the team answers many
times a day, and the answer was a Planet session.

- **All four networks at once, deliberately.** A code read off Planet does not say which operator
  it belongs to — the same reason `lookup()` walks every network instead of taking a selector.
- **The direct-hit card runs `lookupPlanet()`**, the *same* function the generator uses. So a code
  pasted straight out of Point Inspect resolves here exactly as it will in the table — including
  Pelephone's read-it-off-the-code path and Cellcom's ECI — and an approximate match is labelled
  `התאמה לפי אתר` rather than presented as exact. If the two ever disagree, that is a bug in one
  of them, not two opinions.
- **`freqText(v, net)` takes the network now.** It used to read `ed.net`, the site editor's open
  network, which is meaningless in a list showing all four; the argument defaults to the old
  behaviour so the editor's calls are unchanged. IDF still prints `EARFCN 9335` and everyone else
  MHz, here as everywhere.
- **Two caps, for different reasons.** `LK_SCAN_CAP = 400` stops *collecting*, because
  `localeCompare('he')` over every Partner site on a two-letter query is what would make this feel
  slow; `LK_ROW_CAP = 60` stops *rendering*. A capped result says so.
- **It reuses the site editor's row classes** rather than a parallel set. Both show the same shape
  of thing — a site and its sectors — and one visual language for that is worth more than bespoke
  styling.
- **A miss names the empty databases.** `cellcom` and `pelephone` ship empty, so out of the box a
  Cellcom code finds nothing — and a bare "not found" reads as a broken search rather than a
  missing database. The no-hits message lists whichever networks are empty on that machine.
- **The sector columns are floored, not content-sized** (`.ed-spec.sec/.freq/.bw`, right
  aligned). A site whose carriers read 1800/1800/1800/700/700/700 stepped the frequency
  column 14px in and out row to row, and the bandwidth with it — in the one view whose job
  is reading a site's carriers at a glance. A floor rather than a fixed width because a
  sector label is `Da` on Partner and a 7-digit ECI on Cellcom, and all of one site's
  sectors share a network, so the floor removes the drift that actually occurs (digit
  count) while an unusual value can still grow instead of being clipped. The `app` suite
  asserts each column has exactly ONE x-position across the rows; with the floors removed
  it sees five, so the guard is not vacuous.
  **Do not make the code column `flex: 1` to chase the last case.** It was tried: it fixes
  the 27 IDF sites (of 334) whose cell ids differ in length within one site — `Halif_11_SL_1`
  against `Halif_11_SL_2_900` — but it un-packs the row from the RTL start edge and strands
  the code in the middle of the line for **all 16,510 Partner sectors, every one of which is
  exactly 9 characters** and therefore never drifted. Those 28 sites shift as a block, which
  reads as a longer code rather than as a broken column.
- **The query is marked wherever it occurs** (`lkHi()` → `mark.lk-hi`), in the site name,
  the site id and the sector code. A broad query matches hundreds of sites in wildly
  different positions and the list gave no clue why any row was in it. Escaping is per
  fragment, AFTER the split, so match indices are computed against the raw string —
  building the HTML first and searching it second would cut an escape sequence in half on
  a name containing `&` or `"`. A row that is already tinted (`.lk-sector.hit`) drops the
  mark's background, or the mint sits on mint.
- **Empty, hint and no-hit states are one panel** (`lkPanel()` → `.lk-empty`), not bare
  text in a 200px void, which read as a search that had broken rather than as an answer.
  The "these databases are empty on this machine" line belongs INSIDE that panel rather
  than as a second orphaned paragraph. Deliberately not `.ed-msg`: `deck.js` styles its own
  empty states with that class and has no reason to change. **No illustration here** — that
  stays on the home page's floor and in the loader.
- Site names, site ids and sector codes are click-to-copy (`data-copy`, delegated).

---

## Site spec — the sheet a coverage request needs

`מפרט אתר` in the nav (`Site spec`). Search sites across all four networks, pick any number of them,
and get a white RTL sheet of every sector they carry — **סקטור · תדר מרכזי · רוחב פס ·
אזימוט · גובה · דגם אנטנה · הספק · CRS** — under the site's Hebrew name, id, operator and
coordinates. PPTX or print, same two buttons as the report. CRS was added 2026-09-29 (see the
workbook contract: it is the boost in dB, printed as `0 dB`).

**Why it exists.** A commander who wants better כיסוי in an area files a request with the
operator, and that form wants the site's whole physical plant. Elad was reading the first
three columns out of TableX and typing the rest into PowerPoint by hand, off a Planet
screenshot — the same 20 minutes the point-analysis table already removes, one form over.

- **It is the DELIVERABLE's palette, not the app's.** `.doc-page` and `.data-table`, the
  purple the report already uses, because this is a thing that gets sent rather than app
  chrome. The chrome around it is the ordinary Signal system. Same split, same reason.
- **A missing field renders `-`, never blank and never a guess.** Partner ships with the plant
  (every one of its 14,252 sectors has antenna, power and CRS); IDF's ENM-built `idf.json` has
  none, so its columns read `-` until the `IDF_Share` export is imported. A gap in the export has
  to be visible; the `app` suite asserts the plant columns against the database's OWN values, `-`
  where it has none — so it holds for a database with the plant and one without alike.
- **Watts are computed, not stored** — `10^((dBm-30)/10)`, so 49.03 dBm prints 80 W and
  46.02 prints 40 W, the numbers the request form uses. **Nothing is snapped to a
  "standard" wattage**: 49 dBm is 79 W and prints 79, because rounding it up to 80 would be
  inventing a number Planet did not state.
- **The coordinate unit is decided by the VALUE, not assumed.** Planet writes WGS84 degrees
  in one project and projected metres in another under the same `Longitude` / `Latitude`
  headers, so `coordText()` formats 6 decimals when both values are within ±180 and 3
  otherwise. Nothing converts between them.
- **`sectorLabel(net, key, sec)` takes the whole sector ARRAY** and reads `sec[1]` itself.
  Handing it the sector STRING silently printed that string's second character — `a` for
  `Da` — on every row of a commander-facing sheet. It shipped for about ten minutes and the
  `app` suite now asserts the column against the database's own sector values.
- **The site's note rides the screen but not the export.** A trailing parenthetical is
  RF-team information (see the workbook contract), so it shows while you are building the
  sheet and is stripped from print and from the PPTX — the rule the network chips and
  `סקטור משוער` already follow. **The operator chip is NOT stripped**: a request goes *to*
  an operator, and the source document Elad was copying names it too.
- **`שקופית לכל אתר` / `כל האתרים בשקופית אחת` is a per-export toggle**, not a setting:
  one request usually covers an area rather than one mast, but a site with nine sectors
  wants its own slide.
- **The columns are reversed by hand in the PPTX**, like every other table here — PowerPoint
  tables have no RTL column order. Change one, change the other.
- The network and site id travel as **two data attributes**, never one packed string: a NUL
  separator does not survive an HTML attribute (the parser turns it into U+FFFD), and
  nothing about a site id or a network name is then reserved.

**Known gap: it is one table per site with no pagination**, the same limit the report has.
A site with many carriers runs off the bottom of its slide.

## Site editor — per-site add/remove

`Edit sites` on any database card opens an editor for that network: search, expand a site to see
its sectors, `+` on a site row to add a sector to it, `-` to remove a sector or a whole site.

**The per-site `+` fills the add form in rather than opening a second one.** Until 2026-09-06 the
only way in was the toolbar's "add site", which meant retyping a site's code and name to give it
one more sector — and a typo there silently forks one site into two, which no error would catch.
The `+` prefills the site id and name and puts the cursor on the sector code. For the same reason
**the site id and name survive a submit** (only the sector fields clear), so sectors 2 and 3 go in
straight after sector 1.

**Why it exists:** Partner and Pelephone are refreshed from a Planet export every few months, but
our own sites change by roughly **one site a month**. Re-importing a whole workbook to add one row
is exactly the friction this app was built to remove, so single rows can be edited in place. The
xlsx import stays for the bulk refresh; the two paths write the same file.

**The add-sector form's examples are per network** (`EXAMPLES` in `app.js`, applied by
`applyExamples()` when the editor opens). Every network used to show Partner's shapes —
`LNN4610Da` / `MN4610A` / `Da` — which taught the wrong format to anyone adding a Cellcom or
Pelephone site by hand, since those look like `3634249_270` / `14196` / `270` and
`935739_22` / `P935739` / `22`. They are sample **data**, identical in both languages like the
paste box's example rows, so they live beside `LABELS` rather than in `i18n.js`; moving them there
also got the one piece of inline Hebrew out of `index.html`. **IDF's were deliberately empty while
its format was unknown**; the ENM dump landed on 2026-09-06 and they are now a real row from it
(`Halif_11_SL_1` / `Halif_11_SL` / `1` / `9335` / `5`).

**The frequency field is labelled without a unit, on purpose.** `ed.freq` is plain תדר /
"Frequency" because IDF's value is an EARFCN and everyone else's is MHz — a fixed `(MHz)` in the
label is simply wrong for one of the four networks. The per-network placeholder carries the
concrete example instead (`9335` against `1800`), which disambiguates it better than a unit would.
The sector list applies the same rule through `freqText()`: `EARFCN 9335` for IDF, `1800 MHz` for
everyone else. Bandwidth is MHz for every network and keeps its unit.

Behaviour worth preserving:

- **Edits are staged on a deep copy and written only on Save.** A per-change POST would mean a
  689 KB round trip per edit and could leave the file half-written if one failed. The footer counts
  staged changes and the Save button names the number; closing with unsaved changes confirms first.
- **Removing a site's last sector drops the site too.** A site with no sectors is unreachable by
  any lookup, so leaving its name behind would be an orphan record that only grows the file.
  Verified both ways on 2026-09-04.
- **`ED_ROW_CAP = 150`.** Partner has about 3,000 sites; rendering them all janks the modal. Search
  narrows, the cap holds, and a footer line says how many of how many are shown.
- Save posts to the **same `api/db/<network>` route** the xlsx import uses, then refreshes the
  cards and the nav chip in place.

## Prompts are in-app, never `window.confirm()`

`confirm()` renders as **"האתר localhost:8094 אומר"** — the browser's voice, not the app's — and in
the packaged exe it becomes Electron's chrome instead of TableX's. Every prompt goes through
`ask(text, opts)` in `app.js`: an `alertdialog` reusing `.ed-overlay` for the backdrop, so there is
one scrim treatment in the app rather than two that drift.

It takes the **same multi-paragraph strings** `confirm()` took — first paragraph becomes the
question, the rest the body — and returns a `Promise<boolean>`, which is why `closeEditor` is
async. Four details worth keeping:

- **Focus lands on Cancel.** A stray Enter on a destructive prompt must not be what empties a
  database.
- **The confirm button is labelled for the action** (`נקה`, `עדכן`), not a generic OK, via
  `opts.ok`. `opts.danger` styles it.
- **Escape is answered by the dialog before the editor**, or Escape closes the editor out from
  under its own "discard unsaved changes?" prompt.
- **`.btn-primary.danger` uses `--err` on `--paper`.** Both swap with the theme, so it is dark red
  on white in light and light red on near-black in dark, with no second hardcoded colour.

Four prompts use it: `db.clearConfirm`, `db.shrink`, `db.unknownBand` and `ed.discard`. Adding a
fifth means a string in **both** dictionaries, as always.

## Settings: theme, language and the scene

A gear in the nav opens a popover with three segmented controls. Theme and language persist in
`localStorage` (`tablex_theme`, `tablex_lang`) and are applied by an **inline script in
`<head>`**, before any stylesheet paints — that is what prevents a white flash for a dark-mode
user and an RTL→LTR jump for an English one. That script only touches `<html>` attributes;
everything else waits for `js/i18n.js`.

**Theme** is a pure token swap under `:root[data-theme="dark"]`; no component has a
second definition. First run seeds from `prefers-color-scheme`. See DESIGN.md invariant 3 for
the two tokens the swap must never touch (`--hero-fg`, `.doc-page`). The dark theme is the
hero's night carried down the page — pine, not neutral black.

**Language translates the app chrome ONLY. The generated report does not translate, ever.**
`renderTable()` and the PPTX builder hardcode their Hebrew column headers. That table is the
deliverable that goes in front of commanders; letting a per-browser UI preference silently
change what ships would be a genuine hazard, and someone could mail an English table without
realising. In English the chrome flips to LTR and the document stays a white RTL Hebrew sheet
inside it — like a PDF viewer. If an English *deliverable* is ever wanted it needs its own
explicit setting, separate from this one. The settings popover says so in `set.note`.

**The scene** is the third control (`tablex_scene`, key read in `SCENE.init()`, not in the
head script — it is decoration, so a flash of it is not a defect worth a third inline read).
See "The floor" below.

`js/i18n.js` holds both dictionaries. Markup uses `data-i18n` (textContent),
`data-i18n-html` (innerHTML, only for strings carrying markup), `data-i18n-placeholder` and
`data-i18n-title`. Dynamic strings go through `T('key', {vars})`. **Anything rendered from JS
must be rebuilt on a language switch** — `I18N.apply()` only refreshes static nodes, which is
why `relocalize()` also re-runs `renderDbCards`, `updateChip`, `updateHint`, `renderFacts`,
`renderLookup`, `TableXDeck.render()` and (if a table is open) `renderTable`. A missing key falls back to Hebrew rather than rendering
the raw key.

## Gotchas learned the hard way

- **The `.bak` copy has now saved the Partner database twice.** Both times a probe against the
  write route overwrote a live file — once via the case-insensitivity bug below, once by POSTing
  a throwaway payload to all four networks to test the whitelist. When testing that route, post
  to a stub network or restore from `.bak` immediately afterwards; `data/*.bak` is gitignored and
  is the only copy, since the source workbooks are no longer in the repo.
  **It is one deep, and it backs up whatever is there — including nothing.** On 2026-09-29 Partner
  was empty just before the 16:50 re-import, so `partner.json.bak` is now a 90-byte empty
  database and the real rollback it held is gone (the tests were checked: none writes or clears a
  database). Git is the rollback for a shipped network; `גבה` before any clear or import is the
  rollback for one that is not.
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
- **An RTL page reverses an all-digit code — and TableX was doing it to its own output.**
  A Cellcom code is digits and underscores, and inside an RTL paragraph the bidi algorithm
  reorders it: `13207_3381063_90` *painted* as `90_3381063_13207`, in the unresolved-code
  banner and in the table cell that becomes the slide. This is the exact reversal documented
  under "the Cellcom point-analysis code, settled" — the one that already produced a wrong
  conclusion once when read off Planet's own RTL grid — except this time with our name on it.
  Pelephone's `P630012_...` looked fine only because a leading letter anchors the run, which
  is luck, not safety. Direction now follows CONTENT: `isLtrText()` (no Hebrew in the string)
  drives a `td-ltr` class in the HTML, `rtlMode` in the standalone PPTX writer and `rtl="0"`
  in `pptx.js`'s cell, so all of the HTML, the print view and both PPTX paths agree. `.mono`
  carries `direction: ltr; unicode-bidi: isolate` for the same reason — several call sites
  were already setting `dir="ltr"` by hand and the banner was the one that forgot, so the
  class now makes it impossible to forget. A user-typed value interpolated into a Hebrew
  sentence (the lookup's "no site found for X") goes through `bidiIso()` instead, which wraps
  it in U+2068/U+2069 — a FIRST STRONG ISOLATE takes its direction from the value's own first
  strong character, so it is right whether the query is Hebrew or Latin.
- **A helper that moves files leaves its callers behind, and nothing here would tell you.** When
  `bac72b0` moved the workbook parser out of `app.js` into `dbparse.js`, `num()` went with it — but
  the site editor's add form still called it. Every press of `הוסף` threw `ReferenceError: num is
  not defined` *after* `preventDefault()`, so the form did not submit, no toast appeared, nothing
  was staged, and the only trace was a console line nobody had open. It shipped broken for three
  commits. There is no build and no lint, so a moved function is exactly the defect this codebase
  cannot catch by itself — which is why `num` is now reached as `self.TableXNum`, the way `mhzOf()`
  reaches `EARFCN_BANDS`, and why the `app` suite now presses that button.
- **Verifying Hebrew in a terminal is useless here** — the console codepage mangles it and it
  looks like corruption when the data is fine. Verify by *comparing against a known-good
  source* (that is what the Interfex cross-check is for), not by eyeballing console output.

## Open threads — where 2026-09-29 left off

Things raised with Elad and not settled. Each is small; none is a defect in what shipped.

- ~~**Partner is the 2024 export**, 434 sites short of today's network.~~ **Closed 2026-10-02** —
  rebuilt from `Partner_May_26_V3.xlsx`, which carried the plant all along (see "Sibling projects").
  What is now open instead: **33% of its antennas have no `ANT_DIMS` entry** and draw at `TYPICAL`,
  `80020899` alone being 2,654 of them, and **Interfex's `partner_cells.json` is out of step again**.
- **The site writer imported into Planet on 2026-10-02** — the gate is cleared. What is left before
  the view is built: one import of a file Excel has never opened, since the accepted workbook had
  been re-saved by Excel on the way. `TableX_Test.xlsx` on the Desktop is that test. See
  "Planet quests".
- **Levels show their minus on the right in the Hebrew report** — `72.42-`, in all three styles
  and in the old table too. It is the bidi algorithm placing a neutral `-` in an RTL cell. Offered
  and not changed, because it changes the deliverable; the fix is to isolate the level cell as LTR
  the way `td-ltr` does for codes. Check the PPTX cell as well as the HTML before calling it done.
- **CRS is Planet's BOOST** (`0 dB` on every sector of the 2024 export). If the operator's request
  form turns out to want the RS power itself, it is the render-time conversion under the workbook
  contract — ask which the form wants before building it.
- **`80020899` has no datasheet** — about 20% of Partner's antennas, drawn at the `TYPICAL` size.
  One `ANT_DIMS` line when someone finds its dimensions.
- **IDF's real `Antenna File` spellings have not been seen.** Elad's list (80010866, 80010867,
  80010864, CC12V (Vega), ODI032, "and more") is in `ANT_DIMS` and prefix matching should catch
  the variants, but the `IDF_Share` Antennas sheet has only been seen as the mock. A `בדיקת קובץ`
  photo of it settles the spellings and names the rest. ODI-032R20M-Q's size is an estimate.
- **ENM power and CRS for Partner exist, unread**: `D:\Downloads\PARTNER DB 19052026\Book1-O.xlsx`
  is an ENM dump from 2026-05-19 — `configuredMaxTxPower [mW]` per sector carrier and
  `crsGain [dB]` per cell, ~26.6k rows each — beside `Book1.xlsx` (cell id, EARFCN, eNB id). Not a
  Planet export and no importer reads it; noted only as a possible source for sectors the 2024
  export lacks, if that is ever wanted.
- **The Planet quests are waiting on seven photographs** — see "Planet quests", which is the
  design for the next feature and the record of everything known about Planet's own file formats.
  Nothing is built, and the round-3 list there is what unblocks it.

## Known gaps

- **`cellcom` and `pelephone` ship empty**, so out of the box their point-inspect codes resolve to
  nothing. This is not an open problem any more — both imported cleanly from their group exports on
  TS on 2026-09-06 (see "Proven on TS"). The databases simply cannot live in this repo, because the
  workbooks never leave TS. Anyone setting up a fresh copy runs `export group` and loads it.
- **95 of IDF's 334 sites still render their Latin node id**, because 10 numbered families have no
  Hebrew pattern yet — `MMSL_{N}` (21 sites), `Relay_{N}` (14), `Beeri_Pakar_{N}` (13),
  `Petel_{N}` (10), `G_{N}`, `MiniSite_{N}`, `MMSL_Pakar_{N}`, `M_Zefoni_{N}`, `Mehola_{N}`,
  `Ofek_{N}`. Ten lines in the name list would cover 83 of them. A Latin name is the deliberate
  fallback rather than a guess, but it is still Latin on a Hebrew slide.
- **A chained site can only be found by its cell's NAME.** `site_of()` moves a cell to the site it
  is named after, and `CHAINED` says which of those names are real sites — but a chained cell that
  was named after its *baseband* in ENM looks exactly like an ordinary one, and the dump carries no
  field for where the antenna is. So the table would name the baseband's site with no sign anything
  is wrong. If the RF team ever says a row names the wrong site, this is the first thing to suspect.
  The build's `CHECK :` line is the only routine guard against it drifting further.
- **IDF's frequency column is an EARFCN, every other network's is MHz.** A mixed point prints
  `1800` and `9335` side by side under תדר מרכזי. Requested 2026-09-06 and accepted with that
  consequence understood; it is the one place in the deliverable where a column carries two units.
  This also retired the earlier band-28-prints-700-not-750 question — IDF no longer prints a band
  label at all, so the disagreement with Planet's `750` label is moot.
- **PPTX is one slide with no pagination.** ~7 points (21 rows) fits; past ~15 rows the table
  runs off the bottom. `slide.addTable` supports `autoPage`; not enabled. The template path has
  the same limit: a table slot gets one table, however many rows it holds.
- **The template preview is a wireframe, not a renderer.** Background, pictures and text land in
  the right place at roughly the right size; gradients collapse to their first stop, and
  SmartArt, charts and WordArt draw as an empty frame. It exists so someone can point at a place
  on a slide. The *output* is unaffected — none of it is re-authored.
- **No `.pptx` from real PowerPoint has been through the INPUT side.** The suites build their
  fixture with PptxGenJS — a valid package, but not an exotic one — so nothing has yet proved the
  parser against a deck carrying SmartArt, charts, embedded video or a corporate theme. The
  design copies whatever it does not understand rather than interpreting it, which is what that
  gap is defended by. The *output* side is in better shape: a generated deck opened correctly in
  an online PPTX viewer on 2026-09-06, which is the first evidence from outside this repo that
  the packages we write are well-formed. A real unit template, opened in real PowerPoint, is
  still the test that matters.
- **Deck templates are gitignored** (`TableX/data/tpl/`) — they are somebody's actual
  presentation, per-installation data like `data/*.bak`.
- **The site editor caps the rendered list at 150 rows** (`ED_ROW_CAP`). Fine for IDF-sized
  data; on Partner you must search to reach a specific site.
- **The lookup stops scanning at 400 matching sites** (`LK_SCAN_CAP`), so a very broad query
  reports `400+` rather than a true total. Narrowing the query is the answer; sorting every
  Partner site on a two-letter query is not worth the wait.
- **A hand-edited cell is marked in the app but not in the PPTX.** Consistent with `סקטור משוער`
  and with the chips, and the toolbar always shows the count — but it does mean an exported slide
  cannot distinguish a Planet-derived value from a typed one.
- **The site-data sheet has no pagination either** — one table per site, so a site with many
  carriers runs off the bottom of its slide. Same limit, same unenabled `autoPage`.
- **No build, no lint** — and the tests only cover what a browser can be driven through. See
  "Tests" above for what they do and do not reach. The manual pass is still worth doing on
  anything visual: `start.bat`, "טען דוגמה", generate, and check the table, the PPTX and the
  print view.

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
- When you touch the table shape, **touch all FOUR renderers**: HTML (`renderTable`), the
  standalone PPTX slide (`btnPptx`), the table injected into a template slot
  (`TableXPptx.insertTable`, via `js/deck.js`), and the print CSS. The two PPTX writers both read
  `tableMatrix()`, so for a column or colour change that is the one place to edit — but the row
  markup, the print rules and the reversed column order still live in three files. **And in all
  THREE output styles** — `tableMatrix()`'s classic branch and `leanMatrix()` build the same
  columns separately, and main.css's "OUTPUT STYLES" block is the lean styles' HTML half.
- **Never `window.confirm()` / `alert()`** — use `ask()`, so a prompt speaks in the app's voice
  rather than the browser's (or Electron's).
- **A new button gets its press and its rings from `motion.js` for free.** A new button KIND gets
  at most one hover move of its own, saying what it does, on `translate` / `rotate` / `scale` —
  never `transform`, and never by adding an element inside the button. See DESIGN.md "Motion".
- **Illustration stays on the home page's floor and in the loader.** If you touch the scene, keep
  colour in `main.css` and animated opacity in attributes — see "The floor".
- When you touch the workbook contract, **touch both parsers**: `js/dbparse.js` and
  `tools/build_db.py`.
- When you add a network, **touch four places**: `NETWORKS` and `LABELS` in `app.js`, `$NETWORKS`
  in `server.ps1`, `LABELS` in `tools/build_db.py`, and a `data/<net>.json` stub.
- When you add a VIEW, **touch four places**: the `<main class="view">` in `index.html`, its nav
  button, `show()` in `app.js`, and **`GOTO` in `app.js`** — that last one is a list of the views a
  `data-goto` button may reach, and a name missing from it silently sends the button HOME instead.
  It was an if-chain with a fall-through until 2026-10-02, when `quest` landed and did exactly that.
  Anything the view renders from JS also needs a line in `relocalize()`.
- **Never re-author a template's slide content.** If a deck feature seems to need it, it is the
  wrong feature; see "Decks".
- **Run the suites before you push**: `node tools/e2e/run.mjs` (the server must be up). They are
  fast, they need nothing installed, and they have already caught two defects that no amount of
  reading would have.
