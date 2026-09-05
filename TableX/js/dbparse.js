/* ═══════════════════════════════════════════════════════════════════
   DBPARSE — Planet workbook (.xlsx) → { sites, sectors }

   Runs in a Web Worker. Parsing an 8 MB Planet group export is 4–6 s of
   straight-line CPU; on the main thread that is long enough for Chrome to
   raise "page unresponsive", which is alarming in a browser and unacceptable
   once TableX is packaged as an exe. Nothing here touches the DOM.

   The SAME file is also loaded as a plain <script> by index.html, which
   exposes parseBuffer as self.TableXParse for app.js to call directly if a
   Worker cannot start. That is deliberate: it keeps ONE copy of the workbook
   contract instead of a worker copy and a fallback copy that can drift.

   TWO WORKBOOK LAYOUTS, both found by HEADERS and never by tab name, so a
   renamed tab still imports and a sheet we do not need is never matched:

     A. PLANET GROUP EXPORT (multi-sheet) — a Sites sheet joined to a Sectors
        sheet. Planet appends more sheets after the first upload; they are
        ignored, so the workbook needs no cleaning before import.
     B. FLAT SHEET (single-sheet) — the older DEMO_DB.xlsx shape, tried first.

   tools/build_db.py implements this SAME contract offline. Change one, change
   the other, and verify by parsing the same workbook with both and diffing.
   ═══════════════════════════════════════════════════════════════════ */
(function (scope) {
  'use strict';

  const IN_WORKER = typeof importScripts === 'function';
  if (IN_WORKER) importScripts('xlsx.full.min.js');

  // Header rows are in row 1 in every Planet export seen so far; readSheets
  // scans the first five, and this leaves a row of margin on top of that.
  const HEAD_ROWS = 6;

  // Layout B: every header required in one sheet.
  const WANT = ['sector id', 'site id', 'site name', 'sector',
                'frequency (mhz)', 'bandwidth (mhz)'];

  // Layout A: candidate site-name columns. Best-POPULATED wins, not first
  // present — Planet ships a `Site Name` column that is empty in all 3,129
  // rows of the Partner export while the Hebrew lives in `Description`, so
  // keying on the column called "Site Name" builds a database of blank names.
  const NAME_COLS = ['description', 'site name', 'site name 2'];

  const TRAILING_ALPHA = /([A-Za-z]+)$/;

  // Operator band LABELS, in MHz. Band Name is only trusted to carry a centre
  // frequency when it yields one of these.
  //
  // Partner writes "1800_20" and means 1800 MHz — verified against 14,008
  // sectors. Cellcom writes "2850_20" for the SAME kind of column and means
  // EARFCN 2850, which is band 7 at a 2600 MHz label; Pelephone writes
  // "P3M_2600LTE.MIMO 3250_20". Nothing in the STRUCTURE separates 1800-the-
  // frequency from 2850-the-EARFCN, so the only safe discriminator is whether
  // the number is a frequency an operator would actually print on a slide.
  // Anything else yields null and is counted, never a guess: a wrong frequency
  // in front of a commander is worse than a blank one.
  const BAND_LABELS = new Set([450, 700, 750, 800, 850, 900, 1800, 1900,
                               2100, 2300, 2600, 3500, 3600]);

  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();

  const cellAt = (row, hdr, k) => {
    const i = hdr[k];
    if (i == null || !row || row[i] == null) return '';
    return String(row[i]).trim();
  };

  function num(s) {
    const f = parseFloat(s);
    return isNaN(f) ? (s || null) : f;
  }

  /* ── sheet discovery ─────────────────────────────────────────────── */

  // Every sheet carrying a recognisable header row in its first five lines.
  // A sheet the workbook lists but XLSX.read was told not to parse is absent
  // from wb.Sheets, so it is skipped rather than throwing.
  function readSheets(wb) {
    const out = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      for (let r = 0; r < Math.min(5, rows.length); r++) {
        const hdr = {};
        (rows[r] || []).forEach((c, i) => { const k = norm(c); if (k) hdr[k] = i; });
        if ('site id' in hdr) { out.push({ name, hdr, rows: rows.slice(r + 1) }); break; }
      }
    }
    return out;
  }

  const isSectorSheet = sh =>
    'sector id' in sh.hdr && 'site id' in sh.hdr &&
    ('band name' in sh.hdr ||
     ('frequency (mhz)' in sh.hdr && 'bandwidth (mhz)' in sh.hdr));

  // A sheet with a Sector ID is a sector sheet, never the site list.
  const isSiteSheet = sh =>
    !('sector id' in sh.hdr) && NAME_COLS.some(k => k in sh.hdr);

  // Which sheets are worth fully parsing, decided from header rows alone.
  function pickSheets(heads) {
    const flat = heads.find(sh => WANT.every(w => w in sh.hdr));
    if (flat) return { layout: 'flat', names: [flat.name] };

    const sec = heads.find(isSectorSheet);
    if (!sec) return null;
    // EVERY plausible site sheet, not just the first: which name column is
    // actually populated can only be decided once the rows are read, and that
    // is what keeps this selection identical to build_db.py's.
    const sites = heads.filter(isSiteSheet);
    if (!sites.length) return null;
    return { layout: 'multi', names: [sec.name].concat(sites.map(s => s.name)) };
  }

  /* ── builders ────────────────────────────────────────────────────── */

  function bestNameCol(sh) {
    let best = null, bestN = 0;
    for (const k of NAME_COLS) {
      if (!(k in sh.hdr)) continue;
      let n = 0;
      for (const row of sh.rows) if (cellAt(row, sh.hdr, k)) n++;
      if (n > bestN) { best = k; bestN = n; }
    }
    return best;
  }

  // '1800_20' → [1800, 20].  '700_5_9435' → [700, 5].  '' → [null, null]
  function parseBand(s) {
    const nums = String(s == null ? '' : s).match(/\d+/g) || [];
    return [nums.length ? +nums[0] : null, nums.length > 1 ? +nums[1] : null];
  }

  function buildFlat(sheets) {
    for (const sh of sheets) {
      if (!WANT.every(w => w in sh.hdr)) continue;
      const sites = Object.create(null), sectors = Object.create(null);
      let rows = 0, dupes = 0, dupeExample = null;
      for (const row of sh.rows) {
        const secId = cellAt(row, sh.hdr, 'sector id');
        const siteId = cellAt(row, sh.hdr, 'site id');
        if (!secId || !siteId) continue;
        rows++;
        if (secId in sectors) { dupes++; if (!dupeExample) dupeExample = secId; }
        const nm = cellAt(row, sh.hdr, 'site name');
        if (!(siteId in sites) || (nm && !sites[siteId])) sites[siteId] = nm;
        sectors[secId] = [siteId, cellAt(row, sh.hdr, 'sector') || null,
                          num(cellAt(row, sh.hdr, 'frequency (mhz)')),
                          num(cellAt(row, sh.hdr, 'bandwidth (mhz)'))];
      }
      // The flat path reads explicit Frequency (MHz) / Bandwidth (MHz)
      // columns, so there is no band derivation here to distrust.
      return { layout: 'flat', sheet: sh.name, sites, sectors,
               rows, dupes, dupeExample, unknownBand: 0, bandExample: null };
    }
    return null;
  }

  function buildMulti(sheets) {
    const secSheet = sheets.find(isSectorSheet);
    if (!secSheet) return null;
    const siteSheet = sheets.find(sh => isSiteSheet(sh) && bestNameCol(sh));
    if (!siteSheet) return null;

    const nameCol = bestNameCol(siteSheet);
    const sites = Object.create(null);
    for (const row of siteSheet.rows) {
      const siteId = cellAt(row, siteSheet.hdr, 'site id');
      if (!siteId) continue;
      const nm = cellAt(row, siteSheet.hdr, nameCol);
      if (!(siteId in sites) || (nm && !sites[siteId])) sites[siteId] = nm;
    }

    const hdr = secSheet.hdr, sectors = Object.create(null);
    let rows = 0, dupes = 0, dupeExample = null;
    let unknownBand = 0, bandExample = null;
    for (const row of secSheet.rows) {
      const secId = cellAt(row, hdr, 'sector id');
      const siteId = cellAt(row, hdr, 'site id');
      if (!secId || !siteId) continue;
      rows++;
      // A Sector ID that repeats is not a key — the second row overwrites the
      // first. IDF's export numbers sectors 1/2/3 PER SITE, so importing it
      // blind would collapse a whole network into a handful of rows.
      if (secId in sectors) { dupes++; if (!dupeExample) dupeExample = secId; }
      let sector = cellAt(row, hdr, 'sector');
      if (!sector) {                               // LEA0402Da → Da
        const m = TRAILING_ALPHA.exec(secId);
        sector = m ? m[1] : '';
      }
      const bandName = cellAt(row, hdr, 'band name');
      let band = parseBand(bandName);
      let freq = band[0], bw = band[1];
      if (freq != null && !BAND_LABELS.has(freq)) {
        freq = null;                               // EARFCN or worse — see above
        unknownBand++;
        if (!bandExample) bandExample = bandName;
      }
      if ('frequency (mhz)' in hdr) {              // explicit beats derived
        freq = num(cellAt(row, hdr, 'frequency (mhz)')) || freq;
      }
      if ('bandwidth (mhz)' in hdr) {
        bw = num(cellAt(row, hdr, 'bandwidth (mhz)')) || bw;
      } else if ('carrier bandwidth (mhz)' in hdr) {
        bw = num(cellAt(row, hdr, 'carrier bandwidth (mhz)')) || bw;
      }
      sectors[secId] = [siteId, sector || null, freq, bw];
    }

    // A site with no sectors is unreachable by any lookup, so carrying its name
    // only grows a file the browser fetches on every load. Same rule the site
    // editor applies when you remove a site's last sector.
    const used = Object.create(null);
    for (const k in sectors) used[sectors[k][0]] = 1;
    for (const k in sites) if (!(k in used)) delete sites[k];

    return { layout: 'multi', sheet: siteSheet.name + ' + ' + secSheet.name,
             sites, sectors, rows, dupes, dupeExample, unknownBand, bandExample };
  }

  /* ── entry point ─────────────────────────────────────────────────── */

  // TWO passes, and the second is why this is fast enough to be bearable:
  // reading all seven sheets of the Partner export costs ~6 s and most of the
  // memory, while the two we actually use cost ~2 s.
  function parseBuffer(ab, report) {
    const data = new Uint8Array(ab);

    if (report) report('dbScan');
    // Pass 1 — header rows only. sheetRows caps every sheet at a few rows, so
    // even a 47-column x 16,510-row carriers sheet is nearly free to look at.
    const head = XLSX.read(data, { type: 'array', sheetRows: HEAD_ROWS });
    const pick = pickSheets(readSheets(head));
    if (!pick) return null;

    if (report) report('dbBuild');
    // Pass 2 — full parse of ONLY the sheets pass 1 matched.
    const full = XLSX.read(data, { type: 'array', sheets: pick.names });
    const sheets = readSheets(full);
    return pick.layout === 'flat' ? buildFlat(sheets) : buildMulti(sheets);
  }

  // Main-thread fallback for app.js when a Worker cannot start.
  scope.TableXParse = parseBuffer;

  if (IN_WORKER) {
    scope.onmessage = ev => {
      try {
        const result = parseBuffer(ev.data, stage => scope.postMessage({ stage }));
        scope.postMessage({ result });
      } catch (e) {
        scope.postMessage({ error: (e && e.message) ? e.message : String(e) });
      }
    };
  }
})(self);
