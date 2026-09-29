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

  // Which part of a sector id names the sector within its site:
  //   LEA0402Da    → Da    trailing letters            (Partner)
  //   3634249_270  → 270   after the last underscore   (Cellcom — the azimuth)
  //   935739_22    → 22    after the last underscore   (Pelephone)
  // Partner never reaches the second rule, since its ids always end in letters,
  // so the path verified across 14,008 sectors is untouched.
  const TRAILING_ALPHA = /([A-Za-z]+)$/;
  const AFTER_UNDERSCORE = /_([^_]+)$/;

  function sectorOf(secId) {
    const a = TRAILING_ALPHA.exec(secId);
    if (a) return a[1];
    const u = AFTER_UNDERSCORE.exec(secId);
    return u ? u[1] : '';
  }

  // Band Name says the frequency THREE different ways, one per operator:
  //
  //   Partner    "1800_20"                   the band label, in MHz
  //   Pelephone  "P3M_2600LTE.MIMO 3250_20"  label, then EARFCN, then width
  //   Cellcom    "2850_20"                   EARFCN only — band 7, a 2600 label
  //
  // Nothing structural separates 1800-the-frequency from 2850-the-EARFCN; both
  // are <int>_<int>. So: take an operator band LABEL if the string carries one,
  // else convert an EARFCN to its band's label using the 3GPP 36.101 downlink
  // ranges. That second path is anchored to a published standard rather than to
  // any operator's file, which matters because the Cellcom and Pelephone
  // workbooks live on an isolated network and can never be checked here.
  // Neither path resolving yields null, counted and surfaced — a blank
  // frequency in front of a commander is recoverable, a confident wrong one is
  // not.
  const BAND_LABELS = new Set([450, 700, 750, 800, 850, 900, 1800, 1900,
                               2100, 2300, 2600, 3500, 3600]);

  // [first DL EARFCN, last, the label an operator prints] — the bands in use
  // here: 1, 3, 5, 7, 8, 20, 28 and the two TDD ones.
  const EARFCN_BANDS = [
    [0, 599, 2100], [1200, 1949, 1800], [2400, 2649, 850], [2750, 3449, 2600],
    [3450, 3799, 900], [6150, 6449, 800], [9210, 9659, 700],
    [37750, 38249, 2600], [38650, 39649, 2300],
  ];

  // Legal LTE channel widths in MHz (1 stands in for the 1.4 MHz carrier).
  const LTE_BW = new Set([1, 3, 5, 10, 15, 20]);

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

  // A site name may carry a trailing parenthetical NOTE. The IDF export's
  // Description reads `אמיתי (סקטורים 2,3 הם של ק.ד 235)` — RF-team
  // information, not a site name, and שם אתר משרת is the one column a
  // commander actually reads. Split it: the name goes to the deliverable,
  // the note is kept and shown in the app.
  //
  // Safe because it was MEASURED, not assumed: of the 3,129 site names in the
  // shipped partner.json, 17 contain a parenthesis and ZERO end in one. The
  // convention is already the team's — the ENM name list carries exactly this
  // trailing note on Asaf_M4 and Rafah_M5.
  const TRAILING_NOTE = /^(.*?)\s*\(([^()]*)\)\s*$/;

  function splitName(v) {
    const t = String(v == null ? '' : v).trim();
    const m = TRAILING_NOTE.exec(t);
    // A name that is ONLY a parenthetical is a name, not a note.
    if (!m || !m[1]) return [t, null];
    return [m[1], m[2].trim() || null];
  }

  // One sector can be served by more than one antenna (MIMO), and one antenna
  // by more than one sector. Where they agree, that is the value; where they
  // DISAGREE, the answer is nothing — the same rule the Pelephone bandwidth
  // path follows, because a confident wrong azimuth on a slide going to an
  // operator is worse than a visibly missing one. Applied per field, so a
  // disagreement about tilt does not blank the height.
  function agreed(values) {
    let out;
    for (const v of values) {
      if (v === null || v === undefined || v === '') continue;
      if (out === undefined) out = v;
      else if (out !== v) return null;
    }
    return out === undefined ? null : out;
  }

  function countDupes(list, keyOf) {
    const seen = Object.create(null);
    let n = 0, example = null;
    for (const r of list) {
      const k = keyOf(r);
      if (k in seen) { n++; if (example === null) example = k; }
      else seen[k] = 1;
    }
    return { n, example };
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

  // THE PHYSICAL PLANT. Three more sheets, all optional, all matched by
  // header like everything else here. They carry what a site-data slide needs
  // and the sector sheet does not: where the antenna points, how high it is,
  // what it is, and how hard it is driven.
  //
  //   Antennas         Site ID + Antenna ID + Azimuth/Height/Antenna File,
  //                    and a `Sectors` column naming what each one serves.
  //   Sector_Antennas  the same join stated separately, in older exports.
  //   PA Power (dBm)   on LTE_FDD_Sectors in the 2024 Partner export and on
  //                    LTE_FDD_Sector_Carriers in the Planet the team runs
  //                    now, so it is found by header on whichever sheet has
  //                    it rather than by tab name.
  const isAntennaSheet = sh =>
    'site id' in sh.hdr && 'antenna id' in sh.hdr &&
    ('azimuth' in sh.hdr || 'height (m)' in sh.hdr || 'antenna file' in sh.hdr);

  const isJoinSheet = sh =>
    'site id' in sh.hdr && 'sector id' in sh.hdr && 'antenna id' in sh.hdr &&
    !isAntennaSheet(sh);

  const isPowerSheet = sh =>
    'site id' in sh.hdr && 'sector id' in sh.hdr && 'pa power (dbm)' in sh.hdr;

  // CRS — `Reference Signal Power Boosting (dB)`. It sits beside PA Power on
  // LTE_FDD_Sectors in the 2024 Partner export, and is found by header on its
  // own for the same reason power is: a Planet version that moves one of the
  // two must not take the other with it.
  const CRS_COL = 'reference signal power boosting (db)';
  const isCrsSheet = sh =>
    'site id' in sh.hdr && 'sector id' in sh.hdr && CRS_COL in sh.hdr;

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
    // The plant sheets are optional: a workbook without them still imports,
    // and the site-data slide simply shows nothing for those columns rather
    // than inventing them.
    const extra = heads.filter(sh => isAntennaSheet(sh) || isJoinSheet(sh) ||
                                     isPowerSheet(sh) || isCrsSheet(sh)).map(sh => sh.name);
    return { layout: 'multi',
             names: [sec.name].concat(sites.map(s => s.name)).concat(extra) };
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

  // '1800_20' → [1800, 20]   '700_5_9435' → [700, 5]   '2850_20' → [2600, 20]
  // 'P3M_2600LTE.MIMO 3250_20' → [2600, 20]            '' → [null, null]
  //
  // MODE 'earfcn' keeps the EARFCN ITSELF instead of the band it lands in.
  // IDF's תדר מרכזי column is the raw EARFCN, because the team reads ENM and
  // that is the number they recognise — so `P3M_750LTE.MIMO 9260_10` has to
  // store 9260, not 750. Every other network still stores MHz.
  //
  // The EARFCN is the first number that is in a downlink range and is NEITHER
  // a legal channel width NOR a band label, which is what skips the `3` of the
  // `P3M_` prefix (a legal width) and the `750` of the band label before
  // reaching 9260. Bandwidth is unaffected and stays MHz for every network.
  function parseBand(s, mode) {
    const nums = (String(s == null ? '' : s).match(/\d+/g) || []).map(Number);

    let freq = null;
    if (mode === 'earfcn') {
      for (const n of nums) {
        if (LTE_BW.has(n) || BAND_LABELS.has(n)) continue;
        for (const b of EARFCN_BANDS) {
          if (n >= b[0] && n <= b[1]) { freq = n; break; }
        }
        if (freq !== null) break;
      }
    }
    if (freq === null) for (const n of nums) if (BAND_LABELS.has(n)) { freq = n; break; }
    if (freq === null) {
      for (const n of nums) {
        for (const b of EARFCN_BANDS) {
          if (n >= b[0] && n <= b[1]) { freq = b[2]; break; }
        }
        if (freq !== null) break;
      }
    }

    // The LAST legal channel width, not the first: "P3M_…" leads with a 3 that
    // is part of the operator's prefix, while Partner's "700_5_9435" carries
    // its width in the middle and a carrier number at the end.
    let bw = null;
    for (const n of nums) if (LTE_BW.has(n)) bw = n;

    return [freq, bw];
  }

  // The band an EARFCN lands in. The import toast names these alongside the
  // raw values for an EARFCN network, because that line is the only check
  // available on a machine whose files never leave: `9260, 3525 (700, 900)`
  // is obviously right, and a band column read as an EARFCN would not be.
  function bandOf(earfcn) {
    for (const b of EARFCN_BANDS) if (earfcn >= b[0] && earfcn <= b[1]) return b[2];
    return null;
  }

  function buildFlat(sheets) {
    for (const sh of sheets) {
      if (!WANT.every(w => w in sh.hdr)) continue;
      const sites = Object.create(null), notes = Object.create(null);
      const sectors = Object.create(null);
      let rows = 0, dupes = 0, dupeExample = null;
      for (const row of sh.rows) {
        const secId = cellAt(row, sh.hdr, 'sector id');
        const siteId = cellAt(row, sh.hdr, 'site id');
        if (!secId || !siteId) continue;
        rows++;
        if (secId in sectors) { dupes++; if (!dupeExample) dupeExample = secId; }
        const split = splitName(cellAt(row, sh.hdr, 'site name'));
        const nm = split[0];
        if (!(siteId in sites) || (nm && !sites[siteId])) {
          sites[siteId] = nm;
          if (split[1]) notes[siteId] = split[1];
          else delete notes[siteId];
        }
        sectors[secId] = [siteId, cellAt(row, sh.hdr, 'sector') || null,
                          num(cellAt(row, sh.hdr, 'frequency (mhz)')),
                          num(cellAt(row, sh.hdr, 'bandwidth (mhz)'))];
      }
      // The flat path reads explicit Frequency (MHz) / Bandwidth (MHz)
      // columns, so there is no band derivation here to distrust.
      // The flat sheet carries six columns and none of them is plant, so a
      // legacy workbook imports exactly as it always did.
      return { layout: 'flat', sheet: sh.name, sites, notes, sectors,
               coords: {}, ant: {}, pwr: {}, crs: {},
               rows, dupes, dupeExample, composite: false,
               unknownBand: 0, bandExample: null };
    }
    return null;
  }

  function buildMulti(sheets, mode) {
    const secSheet = sheets.find(isSectorSheet);
    if (!secSheet) return null;
    const siteSheet = sheets.find(sh => isSiteSheet(sh) && bestNameCol(sh));
    if (!siteSheet) return null;

    const nameCol = bestNameCol(siteSheet);
    const sites = Object.create(null), notes = Object.create(null);
    for (const row of siteSheet.rows) {
      const siteId = cellAt(row, siteSheet.hdr, 'site id');
      if (!siteId) continue;
      const split = splitName(cellAt(row, siteSheet.hdr, nameCol));
      const nm = split[0];
      if (!(siteId in sites) || (nm && !sites[siteId])) {
        sites[siteId] = nm;
        if (split[1]) notes[siteId] = split[1];
        else delete notes[siteId];
      }
    }

    const hdr = secSheet.hdr;
    const raw = [];
    let rows = 0;
    let unknownBand = 0, bandExample = null;
    for (const row of secSheet.rows) {
      const secId = cellAt(row, hdr, 'sector id');
      const siteId = cellAt(row, hdr, 'site id');
      if (!secId || !siteId) continue;
      rows++;
      const sector = cellAt(row, hdr, 'sector');
      const bandName = cellAt(row, hdr, 'band name');
      let band = parseBand(bandName, mode);
      let freq = band[0], bw = band[1];
      // A Band Name that is present but resolves to neither a label nor an
      // EARFCN is a shape nobody here has seen. Leave it blank and count it.
      if (freq === null && bandName) {
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
      raw.push({ secId: secId, siteId: siteId, sector: sector, freq: freq, bw: bw });
    }

    // THE KEY. A Sector ID that repeats is not a key — the second row
    // overwrites the first, and IDF's export numbers sectors 1/2/3 PER SITE,
    // so the plain column collapses a whole network into a handful of rows.
    //
    // `<Site ID>_<Sector ID>` is tried next, and it is not a guess: that
    // composite IS what Planet's point inspect reports for IDF. Site ID
    // `IDF_Amitay` and Sector ID `1` give `IDF_Amitay_1`, checked 2026-09-23
    // against the ENM-built idf.json — 44 of the 45 cells legible in a
    // photograph of IDF_Share.xlsx exist there, including the two that carry
    // the fingerprint (Fares has 1/3/4 and no 2; Astra carries a 3_900).
    //
    // It is only REACHED when the plain key has already failed and only
    // ACCEPTED when it is itself unique, so Partner, Cellcom and Pelephone —
    // whose Sector IDs are already unique — never take this path.
    const plain = countDupes(raw, r => r.secId);
    let composite = false, dupes = plain.n, dupeExample = plain.example;
    if (dupes) {
      const comp = countDupes(raw, r => r.siteId + '_' + r.secId);
      if (!comp.n) { composite = true; dupes = 0; dupeExample = null; }
    }

    const sectors = Object.create(null);
    for (const r of raw) {
      // With the composite, the Sector ID column IS the sector — sectorOf()
      // reads the key, and `IDF_Astra_3_900` would hand it `900`.
      const sector = r.sector || (composite ? r.secId : sectorOf(r.secId));
      sectors[composite ? r.siteId + '_' + r.secId : r.secId] =
        [r.siteId, sector || null, r.freq, r.bw];
    }

    // A site with no sectors is unreachable by any lookup, so carrying its name
    // only grows a file the browser fetches on every load. Same rule the site
    // editor applies when you remove a site's last sector.
    const used = Object.create(null);
    for (const k in sectors) used[sectors[k][0]] = 1;
    for (const k in sites) {
      if (k in used) continue;
      delete sites[k];
      delete notes[k];          // same pass — sites[k] is gone after this
    }

    // ── the physical plant ────────────────────────────────────────────
    // Gathered AFTER the key is chosen, because every one of these is keyed by
    // sector and the sector key may be the composite.
    const secKey = (siteId, secId) =>
      composite ? siteId + '_' + secId : secId;

    const coords = Object.create(null);
    if ('longitude' in siteSheet.hdr && 'latitude' in siteSheet.hdr) {
      for (const row of siteSheet.rows) {
        const siteId = cellAt(row, siteSheet.hdr, 'site id');
        if (!siteId || !(siteId in sites)) continue;
        const x = num(cellAt(row, siteSheet.hdr, 'longitude'));
        const y = num(cellAt(row, siteSheet.hdr, 'latitude'));
        // Planet writes WGS84 degrees in one project and projected metres in
        // another under these same two headers, so nothing here converts: the
        // pair is stored as the workbook states it and labelled at render.
        if (typeof x === 'number' && typeof y === 'number') coords[siteId] = [x, y];
      }
    }

    // sector key -> [[height, azimuth, tilt, file], ...] before agreement
    const antBy = Object.create(null);
    const push = (key, v) => { (antBy[key] || (antBy[key] = [])).push(v); };

    const antSheet = sheets.find(isAntennaSheet);
    const antById = Object.create(null);          // siteId + '\u0000' + antId
    if (antSheet) {
      for (const row of antSheet.rows) {
        const siteId = cellAt(row, antSheet.hdr, 'site id');
        const antId = cellAt(row, antSheet.hdr, 'antenna id');
        if (!siteId) continue;
        const a = [num(cellAt(row, antSheet.hdr, 'height (m)')),
                   num(cellAt(row, antSheet.hdr, 'azimuth')),
                   num(cellAt(row, antSheet.hdr, 'mechanical tilt')),
                   cellAt(row, antSheet.hdr, 'antenna file') || null];
        if (antId !== undefined && antId !== null && antId !== '') {
          antById[siteId + '\u0000' + antId] = a;
        }
        // The Antennas sheet names what it serves itself, and one antenna can
        // serve several: `1, 3`.
        const served = cellAt(row, antSheet.hdr, 'sectors');
        if (served === undefined || served === null || served === '') continue;
        for (const one of String(served).split(',')) {
          const t = one.trim();
          if (t) push(secKey(siteId, t), a);
        }
      }
    }

    // Older exports state the join on their own sheet instead.
    const joinSheet = sheets.find(isJoinSheet);
    if (joinSheet && antSheet) {
      for (const row of joinSheet.rows) {
        const siteId = cellAt(row, joinSheet.hdr, 'site id');
        const secId = cellAt(row, joinSheet.hdr, 'sector id');
        const antId = cellAt(row, joinSheet.hdr, 'antenna id');
        if (!siteId || !secId) continue;
        const a = antById[siteId + '\u0000' + antId];
        if (a) push(secKey(siteId, secId), a);
      }
    }

    const ant = Object.create(null);
    for (const key in antBy) {
      if (!(key in sectors)) continue;            // an antenna on no sector
      const list = antBy[key];
      const row = [agreed(list.map(a => a[0])), agreed(list.map(a => a[1])),
                   agreed(list.map(a => a[2])), agreed(list.map(a => a[3]))];
      if (row.some(v => v !== null)) ant[key] = row;
    }

    // PA Power, in dBm as the workbook states it. Watts are a render-time
    // conversion (10^((dBm-30)/10)), not a stored number, so the file keeps
    // what Planet actually said.
    const pwrBy = Object.create(null);
    const pwrSheet = sheets.find(isPowerSheet);
    if (pwrSheet) {
      for (const row of pwrSheet.rows) {
        const siteId = cellAt(row, pwrSheet.hdr, 'site id');
        const secId = cellAt(row, pwrSheet.hdr, 'sector id');
        if (!siteId || !secId) continue;
        const v = num(cellAt(row, pwrSheet.hdr, 'pa power (dbm)'));
        if (typeof v !== 'number') continue;
        const k = secKey(siteId, secId);
        (pwrBy[k] || (pwrBy[k] = [])).push(v);
      }
    }
    const pwr = Object.create(null);
    for (const k in pwrBy) {
      if (!(k in sectors)) continue;
      const v = agreed(pwrBy[k]);
      if (v !== null) pwr[k] = v;
    }

    // CRS boost, in dB as the workbook states it — agreed or nothing, the
    // same as power, since one sector can carry several carrier rows.
    const crsBy = Object.create(null);
    const crsSheet = sheets.find(isCrsSheet);
    if (crsSheet) {
      for (const row of crsSheet.rows) {
        const siteId = cellAt(row, crsSheet.hdr, 'site id');
        const secId = cellAt(row, crsSheet.hdr, 'sector id');
        if (!siteId || !secId) continue;
        const v = num(cellAt(row, crsSheet.hdr, CRS_COL));
        if (typeof v !== 'number') continue;
        const k = secKey(siteId, secId);
        (crsBy[k] || (crsBy[k] = [])).push(v);
      }
    }
    const crs = Object.create(null);
    for (const k in crsBy) {
      if (!(k in sectors)) continue;
      const v = agreed(crsBy[k]);
      if (v !== null) crs[k] = v;
    }

    return { layout: 'multi', sheet: siteSheet.name + ' + ' + secSheet.name,
             sites, notes, sectors, coords, ant, pwr, crs,
             rows, dupes, dupeExample, composite, unknownBand, bandExample };
  }

  /* ── inspector ───────────────────────────────────────────────────── */

  // What is actually IN a workbook: every sheet, every column, a sample value
  // and whether the column is populated at all.
  //
  // It exists because the Cellcom, Pelephone and IDF workbooks live on TS and
  // can never leave it — the only channel out is a photograph of a screen. A
  // screen that prints the headers is a far better photograph than the sheet
  // itself, and it carries the fill counts, which is the signal that actually
  // matters: Planet ships a `Site Name` column that is EMPTY in all 3,129 rows
  // of the Partner export, and a list of header names alone would never say so.
  //
  // It is also the answer to "why did my file not import". The roles below are
  // decided by the SAME predicates the import uses, so this reports what the
  // importer sees rather than a second opinion that can disagree with it.
  const SAMPLE_ROWS = 25;

  // Excel's own column name, so a column can be found in the sheet by eye.
  function colLetter(i) {
    let s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) {
      s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    }
    return s;
  }

  function inspectSheet(name, ws) {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

    // The header is the WIDEST of the first five rows, not simply the first: a
    // sheet can open with a title line above its real header, and picking that
    // would report a one-column sheet.
    let hr = 0, widest = -1;
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const n = (rows[r] || []).reduce((a, c) => a + (norm(c) ? 1 : 0), 0);
      if (n > widest) { widest = n; hr = r; }
    }

    const head = rows[hr] || [], body = rows.slice(hr + 1);
    const hdr = {};
    head.forEach((c, i) => { const k = norm(c); if (k) hdr[k] = i; });

    const cols = head.map((c, i) => {
      let fill = 0, sample = '';
      for (const row of body) {
        const v = row[i];
        if (v === undefined || v === null || v === '') continue;
        fill++;
        if (!sample) sample = String(v);
      }
      return { col: colLetter(i), head: String(c == null ? '' : c).trim(),
               fill, sample: sample.slice(0, 48) };
    });

    return { name, hdr, cols, sampled: body.length };
  }

  function inspectBuffer(ab) {
    const data = new Uint8Array(ab);
    // Same trick as pass 1 of parseBuffer: sheetRows caps every sheet, so even
    // a 47-column x 18,891-row carriers sheet is nearly free to look at.
    const wb = XLSX.read(data, { type: 'array', sheetRows: SAMPLE_ROWS + 6 });

    const sheets = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      if (ws) sheets.push(inspectSheet(name, ws));
    }

    // Only a sheet carrying a Site ID is a candidate, exactly as readSheets
    // decides it. Without that, a sheet with a Description column and no
    // sectors (Antenna_Model_Bands, say) would be reported as the site list.
    const eligible = sheets.filter(sh => 'site id' in sh.hdr);
    const flat = eligible.find(sh => WANT.every(w => w in sh.hdr));
    const sec = eligible.find(isSectorSheet);
    const sites = eligible.filter(isSiteSheet);

    const role = Object.create(null);
    if (flat) role[flat.name] = 'flat';
    else {
      if (sec) role[sec.name] = 'sectors';
      for (const s of sites) if (!role[s.name]) role[s.name] = 'sites';
    }

    return {
      layout: flat ? 'flat' : (sec && sites.length ? 'multi' : null),
      sheets: sheets.map(sh => ({
        name: sh.name, sampled: sh.sampled, cols: sh.cols,
        role: role[sh.name] || null,
      })),
    };
  }

  /* ── entry point ─────────────────────────────────────────────────── */

  // TWO passes, and the second is why this is fast enough to be bearable:
  // reading all seven sheets of the Partner export costs ~6 s and most of the
  // memory, while the two we actually use cost ~2 s.
  function parseBuffer(ab, report, opts) {
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
    return pick.layout === 'flat'
      ? buildFlat(sheets)
      : buildMulti(sheets, opts && opts.freq);
  }

  // Main-thread fallbacks for app.js when a Worker cannot start.
  scope.TableXParse = parseBuffer;
  scope.TableXInspect = inspectBuffer;

  // app.js needs EARFCN → MHz too, to resolve Pelephone's point-inspect code
  // (its trailing field is an EARFCN). Exported rather than copied: a second
  // table in app.js would drift from the one the importer actually uses.
  scope.TableXBands = EARFCN_BANDS;

  // The site editor's add form writes the same two numeric slots this parser
  // does, so it reads them with the same helper. It used to have its own copy
  // of `num`; when the parser moved out of app.js into this file the copy went
  // with it and the editor's call became a ReferenceError, which is why the
  // Add button did nothing at all from bac72b0 until now. Exported rather than
  // reinstated there, for the reason above it.
  scope.TableXNum = num;

  // app.js names the bands an EARFCN import derived, for the toast.
  scope.TableXBandOf = bandOf;

  if (IN_WORKER) {
    scope.onmessage = ev => {
      // The buffer used to arrive bare; it now travels in an envelope so the
      // inspector can share this Worker. Both shapes are accepted, so neither
      // side depends on the other being updated in the same breath.
      const msg = ev.data;
      const op = (msg && msg.op) || 'parse';
      const buf = (msg && msg.buf) || msg;
      try {
        const result = op === 'inspect'
          ? inspectBuffer(buf)
          : parseBuffer(buf, stage => scope.postMessage({ stage }), msg && msg.opts);
        scope.postMessage({ result });
      } catch (e) {
        scope.postMessage({ error: (e && e.message) ? e.message : String(e) });
      }
    };
  }
})(self);
