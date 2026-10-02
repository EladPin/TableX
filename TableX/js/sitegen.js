/* ═══════════════════════════════════════════════════════════════════
   SITEGEN — a new site, written in the format Planet exported

   The first Planet quest. The RF team is given a נ.צ and a plant for a site
   that will be built, and today they COPY AN EXISTING SITE IN PLANET and
   change its data by hand, 13+ times a round. This writes that workbook.

   THE ONE RULE, and it is the Decks rule one file over: we never author a
   Planet row we do not understand. A new site is built by CLONING real rows
   across every sheet and overwriting only the fields the user supplied. The
   47 columns of LTE_FDD_Sector_Carriers — PUSCH power control, Zadoff-Chu
   sequences, power recycling — keep whatever Planet itself wrote. What comes
   out is a row Planet made, with our values in it.

   THE DONOR IS PER SECTOR, NOT PER SITE. A band choice drags four other
   columns with it: 1800_20 means Propagation Model P3M_1800MHz_*.pmf,
   Carrier Name 1800_20_SB1_PHI, `Carrier: 1800_20_SB1_PHI = Allocated` with
   the others Unused, and `Group: PHI_1800 = TRUE`. Rather than hardcode that
   map — which would be a second copy of Planet's own configuration, free to
   drift — each new sector clones a sector that ALREADY CARRIES ITS BAND. The
   derived columns then come out right because Planet set them.

   THE KIT. Which means a clone never needs the whole workbook — only every
   sheet's header, one Sites row, and one donor sector per band with its rows
   on every sheet. That is a few kilobytes, so the DATABASE IMPORT keeps it
   (dbparse.js and build_db.py both call makeKit's contract) and stores it in
   data/<network>.json as `kit`. The new-site view then works from the
   databases that are already loaded: pick any site in any network, and the
   network's own kit supplies the rows. No second file to load, and no
   "which operator is this" — the site's database says.

   EVERYTHING IS FOUND BY HEADER, never by column index, the same contract
   dbparse.js and build_db.py hold. An export with an extra column still works.

   Loaded as a plain <script> by index.html (exposing self.TableXSiteGen), by
   dbparse.js's Worker through importScripts, and as a module by
   tools/gen_site.mjs — ONE copy of the clone contract for all three.
   ═══════════════════════════════════════════════════════════════════ */
(function (scope) {
  'use strict';

  // The join columns. A clone is only safe if every row that points at the
  // donor is found and re-pointed, so these are the whole contract.
  const SITE = 'site id', SECTOR = 'sector id', ANT = 'antenna id';

  // Blanked on every clone. A cloned PCI is the donor's PCI, and two sites
  // radiating the same PCI in one area is the exact fault Interfex exists to
  // find — a confident wrong answer, which this codebase does not ship. Blank
  // is visible; wrong is not. Proven accepted by Planet's import on TS
  // (2026-10-02). The UIDs and the E-UTRAN cell id are identity of the same
  // kind: empty in the Partner export, and a copied one would claim to be
  // somebody else's cell.
  const BLANK = ['physical cell id', 'physical cell id group',
                 'physical layer id', 'cell id', 'e-utran cell id', 'sector uid'];

  // Set on every cloned row, whatever the donor carries. Elad, 2026-10-03:
  // `Synchronization and broadcast power boosting (dB)` must be 0 for a new
  // site — every one of the 16,510 sectors in the May-26 Partner export reads
  // 3, so every donor would hand that 3 on. A column, its value; only applied
  // where the export carries the column.
  const DEFAULTS = { 'synchronization and broadcast power boosting (db)': 0 };

  // The Sites row is the DONOR's, not the template's, so every column that
  // names a site is cleared before the new identity is written in. Carrying
  // a stranger's name or UID into a new site is the one thing worse than a
  // blank.
  const SITE_BLANK = ['site uid', 'description', 'site name', 'site name 2'];

  // Bumped if the kit's shape ever changes, so a database imported by an
  // older TableX can be told apart from a current one.
  const KIT_VERSION = 1;

  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  const str = v => String(v == null ? '' : v).trim();

  /* ── reading a workbook as rows ──────────────────────────────────── */

  // Every sheet as { name, hdr: {normalised header: index}, head: [...], rows }
  // with rows kept as ARRAYS, so a column nobody here understands survives
  // the round trip verbatim.
  function readSheets(XLSX, wb) {
    return wb.SheetNames.map(name => {
      const ws = wb.Sheets[name];
      if (!ws) return null;
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      if (!grid.length) return null;
      const head = grid[0];
      return { name, hdr: hdrOf(head), head, rows: grid.slice(1) };
    }).filter(Boolean);
  }

  function hdrOf(head) {
    const hdr = Object.create(null);
    head.forEach((h, i) => { const k = norm(h); if (k && !(k in hdr)) hdr[k] = i; });
    return hdr;
  }

  const at = (row, hdr, key) => {
    const i = hdr[key];
    return i == null || i >= row.length ? '' : row[i];
  };
  function put(row, hdr, key, val) {
    const i = hdr[key];
    if (i == null) return false;
    while (row.length <= i) row.push('');
    row[i] = val;
    return true;
  }

  // A header is trimmed of trailing blanks and every stored row is cut or
  // padded to it. SheetJS pads a row to the sheet's range and build_db.py to
  // the row's last cell, so without this the two parsers would store the
  // same kit at two different widths.
  function trimHead(head) {
    let n = head.length;
    while (n && (head[n - 1] === '' || head[n - 1] == null)) n--;
    return head.slice(0, n);
  }
  const fit = (row, n) => {
    const r = row.slice(0, n);
    while (r.length < n) r.push('');
    return r;
  };

  /* ── the kit ─────────────────────────────────────────────────────── */

  const isSiteRows = sh => sh.hdr[SITE] != null && sh.hdr[SECTOR] == null
    && sh.hdr[ANT] == null && sh.hdr['longitude'] != null;

  /**
   * Everything a new site needs from a group export, and nothing else.
   *
   *   { v, sheets: [{name, head}],     every sheet, headers verbatim
   *     site: {sheet, row},            one Sites row, the columns a site inherits
   *     name: 'description',           the column the site name goes in
   *     composite: bool,               Sector ID repeats per site (IDF)
   *     bands: { '1800_20': { site, sector, fb: [freq, bw],
   *                           rows: { <sheet>: [row, ...] } } },
   *     idle: [site ids the export carries that hold no sector] }
   *
   * opts = { band: name -> [freq, bw], nameCol, composite } — supplied by the
   * importer, which is what knows how this network's Band Name parses.
   *
   * Returns null when the workbook has no sectors sheet: nothing to clone.
   */
  function makeKit(sheets, opts) {
    const o = opts || {};
    const sec = sheets.find(sh => sh.hdr[SITE] != null && sh.hdr[SECTOR] != null
      && sh.hdr['band name'] != null);
    if (!sec) return null;

    const pair = (site, sector) => norm(site) + '\u0000' + norm(sector);
    const secKeyed = sheets.filter(sh => sh.hdr[SITE] != null && sh.hdr[SECTOR] != null);
    const antKeyed = sheets.filter(sh => sh.hdr[SITE] != null && sh.hdr[ANT] != null
      && sh.hdr[SECTOR] == null);
    const join = secKeyed.find(sh => sh.hdr[ANT] != null);

    // How many rows each sector has on every sector-keyed sheet. A donor with
    // exactly one everywhere is preferred: one carrier, one antenna, nothing
    // for the clone to have to choose between. Every sector in the May-26
    // Partner export is that shape; a MIMO one is only taken when its band
    // has nothing simpler.
    const counts = secKeyed.map(sh => {
      const m = new Map();
      for (const r of sh.rows) {
        const k = pair(at(r, sh.hdr, SITE), at(r, sh.hdr, SECTOR));
        m.set(k, (m.get(k) || 0) + 1);
      }
      return m;
    });
    const simple = k => counts.every(m => m.get(k) === 1);

    const chosen = new Map(), first = new Map();
    for (const r of sec.rows) {
      const band = str(at(r, sec.hdr, 'band name'));
      const site = str(at(r, sec.hdr, SITE)), sector = str(at(r, sec.hdr, SECTOR));
      if (!band || !site || !sector || chosen.has(band)) continue;
      if (!first.has(band)) first.set(band, { site, sector });
      if (simple(pair(site, sector))) chosen.set(band, { site, sector });
    }
    for (const [band, d] of first) if (!chosen.has(band)) chosen.set(band, d);

    // The antenna serving a sector: the explicit join when the export states
    // one, else an antenna sheet that names what it serves. Never matched by
    // azimuth — a multi-band site has two antennas on one.
    function antennaOf(site, sector) {
      if (join) {
        const r = join.rows.find(x =>
          pair(at(x, join.hdr, SITE), at(x, join.hdr, SECTOR)) === pair(site, sector));
        return r ? at(r, join.hdr, ANT) : null;
      }
      for (const sh of antKeyed) {
        if (sh.hdr['sectors'] == null) continue;
        const r = sh.rows.find(x => norm(at(x, sh.hdr, SITE)) === norm(site)
          && String(at(x, sh.hdr, 'sectors')).split(',').some(t => norm(t) === norm(sector)));
        if (r) return at(r, sh.hdr, ANT);
      }
      return null;
    }

    const width = new Map(sheets.map(sh => [sh.name, trimHead(sh.head).length]));
    const bands = {};
    // Map order is first appearance in the sectors sheet — the same order
    // build_db.py's dict keeps, so both parsers write the same JSON.
    for (const band of first.keys()) {
      const d = chosen.get(band);
      const antId = antennaOf(d.site, d.sector);
      const rows = {};
      for (const sh of sheets) {
        const h = sh.hdr;
        let got = [];
        if (h[SITE] != null && h[SECTOR] != null) {
          got = sh.rows.filter(r => pair(at(r, h, SITE), at(r, h, SECTOR)) === pair(d.site, d.sector)
            // a join sheet carries one row per antenna; keep the one cloned
            && (h[ANT] == null || antId == null || norm(at(r, h, ANT)) === norm(antId)));
        } else if (h[SITE] != null && h[ANT] != null && antId != null) {
          got = sh.rows.filter(r => norm(at(r, h, SITE)) === norm(d.site)
            && norm(at(r, h, ANT)) === norm(antId));
        }
        if (got.length) rows[sh.name] = got.map(r => fit(r, width.get(sh.name)));
      }
      bands[band] = { site: d.site, sector: d.sector,
                      fb: o.band ? o.band(band) : null, rows };
    }

    // One Sites row: the first donor's own, so it comes from a site that is
    // known to be whole. Every column that names a site is cleared at clone
    // time (SITE_BLANK), so whose row it was never reaches the output.
    const siteSheet = sheets.find(isSiteRows);
    let site = null;
    if (siteSheet) {
      const d = chosen.get(first.keys().next().value);
      const r = (d && siteSheet.rows.find(x => norm(at(x, siteSheet.hdr, SITE)) === norm(d.site)))
        || siteSheet.rows.find(x => str(at(x, siteSheet.hdr, SITE)));
      if (r) site = { sheet: siteSheet.name, row: fit(r, width.get(siteSheet.name)) };
    }

    // Site ids the export carries that the DATABASE will not: a site with no
    // sector is dropped from it (unreachable by any lookup), but it is still
    // a site in Planet, and a new site must not reuse its id.
    const withSectors = new Set();
    for (const r of sec.rows) withSectors.add(norm(at(r, sec.hdr, SITE)));
    const idle = [], seen = new Set();
    for (const sh of sheets) {
      if (sh.hdr[SITE] == null) continue;
      for (const r of sh.rows) {
        const id = str(at(r, sh.hdr, SITE));
        if (!id || withSectors.has(norm(id)) || seen.has(id)) continue;
        seen.add(id);
        idle.push(id);
      }
    }

    return {
      v: KIT_VERSION,
      sheets: sheets.map(sh => ({ name: sh.name, head: trimHead(sh.head) })),
      site,
      name: o.nameCol || 'description',
      composite: !!o.composite,
      bands,
      idle,
    };
  }

  // The band a database sector is on, by the [freq, bw] the importer parsed
  // it to. Unique or nothing: where two bands parse alike the form asks
  // rather than picks — the rule the Pelephone bandwidth path follows.
  function bandFor(kit, freq, bw) {
    if (!kit || freq == null) return '';
    const hits = Object.keys(kit.bands).filter(b => {
      const fb = kit.bands[b].fb;
      return fb && fb[0] === freq && (bw == null || fb[1] === bw);
    });
    return hits.length === 1 ? hits[0] : '';
  }

  /* ── the clone ───────────────────────────────────────────────────── */

  /**
   * One new site, as rows per sheet.
   *
   * spec = { siteId, name, lon, lat, sectors: [ {
   *            sectorId, band, az, height, tilt, etilt, model, pwr, crs } ] }
   *
   * Returns { rows: Map<sheet name, row[]>, warnings: [] }.
   */
  function cloneSite(kit, spec) {
    const warn = [];
    const out = new Map();
    const heads = new Map(kit.sheets.map(s => [s.name, hdrOf(s.head)]));
    const add = (name, row) => {
      if (!out.has(name)) out.set(name, []);
      out.get(name).push(row);
    };

    if (!kit.site) {
      warn.push('the template carries no Sites row — the site was not written');
    } else {
      const h = heads.get(kit.site.sheet), row = kit.site.row.slice();
      for (const k of SITE_BLANK) put(row, h, k, '');
      put(row, h, SITE, spec.siteId);
      if (spec.lon != null) put(row, h, 'longitude', spec.lon);
      if (spec.lat != null) put(row, h, 'latitude', spec.lat);
      // The name goes in whichever column the importer found it in —
      // `Description` for Partner, whose `Site Name` is empty in all 3,129
      // rows (see the DB contract).
      if (spec.name != null) put(row, h, kit.name || 'description', spec.name);
      add(kit.site.sheet, row);
    }

    /* one antenna per sector, numbered 1..N for the new site. The donor's
       own numbering is not followed: the join only has to be internally
       consistent, not to match anyone else's. */
    spec.sectors.forEach((s, i) => {
      const antId = i + 1;
      const band = str(s.band);
      const d = kit.bands[band];
      if (!d) {
        warn.push('no sector in the export carries band "' + band
          + '" — sector ' + s.sectorId + ' was not written');
        return;
      }
      for (const name of Object.keys(d.rows)) {
        const h = heads.get(name);
        if (!h) continue;
        for (const src of d.rows[name]) {
          const row = src.slice();
          put(row, h, SITE, spec.siteId);
          if (h[SECTOR] != null) put(row, h, SECTOR, s.sectorId);
          if (h[ANT] != null) put(row, h, ANT, antId);
          // The antenna sheet names the sector it serves in its own column.
          if (h['sectors'] != null) put(row, h, 'sectors', s.sectorId);

          // user values, each only where that sheet carries the column
          if (spec.lon != null) put(row, h, 'longitude', spec.lon);
          if (spec.lat != null) put(row, h, 'latitude', spec.lat);
          if (s.az != null) put(row, h, 'azimuth', s.az);
          if (s.height != null) put(row, h, 'height (m)', s.height);
          if (s.tilt != null) put(row, h, 'mechanical tilt', s.tilt);
          if (s.etilt != null) put(row, h, 'electrical tilt', s.etilt);
          if (s.model) put(row, h, 'antenna file', s.model);
          if (s.pwr != null) put(row, h, 'pa power (dbm)', s.pwr);
          // the CRS boost, on whichever sheet carries it — LTE_FDD_Sectors in
          // the 2024 Partner export, the carriers sheet in the May-26 one
          if (s.crs != null) put(row, h, 'reference signal power boosting (db)', s.crs);

          // `keepIdentity` predates the TS trial that proved a blank is
          // accepted; it is kept as the fallback, with no known use.
          if (!spec.keepIdentity) for (const k of BLANK) if (h[k] != null) put(row, h, k, '');
          for (const k in DEFAULTS) if (h[k] != null) put(row, h, k, DEFAULTS[k]);
          add(name, row);
        }
      }
    });

    return { rows: out, warnings: warn };
  }

  /* ── groups ──────────────────────────────────────────────────────── */

  // `Group: <name>` columns, which exist on the Sectors sheet and nowhere
  // else. Their values are the STRINGS "TRUE"/"FALSE" in Planet's own export,
  // not booleans, so that is what is written back.
  const groupCols = head => head
    .map((h, i) => [String(h == null ? '' : h), i])
    .filter(([h]) => /^\s*group:\s*/i.test(h));

  /**
   * Put every new sector in ONE group, and in no other.
   *
   * The team creates a group in Planet first, and a sector joins it by having
   * a column headed with that group's EXACT name. So the first `Group:`
   * column is renamed to the group the user made and set TRUE on every row.
   *
   * EVERY OTHER `Group:` COLUMN IS DELETED, and that is the load-bearing
   * half. A cloned row arrives carrying the donor's memberships — the Partner
   * export's rows are `Group: PARTNER = TRUE` and one `PHI_*` column TRUE —
   * so importing one unchanged would quietly add the new site to two of the
   * team's real groups in a SHARED project. A quest may add clearly named
   * new things; it must never change something that was already there.
   *
   * Deleting them was never proven NECESSARY for the import (the TS trial
   * that removed them also re-saved the file in Excel, which is what made it
   * import). They are deleted for the membership reason above, which stands
   * on its own — do not "simplify" this back to FALSE.
   */
  function applyGroup(head, rows, groupName) {
    const warn = [];
    const cols = groupCols(head);
    if (!cols.length) return warn;

    if (!groupName) {
      // Every group column goes, so the import cannot put the site in any
      // team group. Joining nothing is recoverable; joining PARTNER is not.
      warn.push('no group name given — every Group: column was removed, so '
        + 'the import cannot add these sectors to a team group. Create the '
        + 'group in Planet, name it here, and name the FILE after it too.');
      dropCols(head, rows, cols.map(([, i]) => i));
      return warn;
    }

    // If the name the user made already has a column, use THAT one rather
    // than renaming the first — two columns headed the same would be a
    // workbook with a duplicate field.
    const want = norm('group: ' + groupName);
    const existing = cols.find(([h]) => norm(h) === want);
    const target = existing ? existing[1] : cols[0][1];
    if (!existing) head[target] = 'Group: ' + groupName;

    for (const r of rows) {
      while (r.length <= target) r.push('');
      r[target] = 'TRUE';          // every new sector joins the one group
    }
    dropCols(head, rows, cols.map(([, i]) => i).filter(i => i !== target));
    return warn;
  }

  // Remove columns from a header and its rows together. Descending, so an
  // earlier splice cannot shift an index that has not been used yet.
  function dropCols(head, rows, idx) {
    const order = idx.slice().sort((a, b) => b - a);
    for (const i of order) {
      if (i < head.length) head.splice(i, 1);
      for (const r of rows) if (i < r.length) r.splice(i, 1);
    }
  }

  /* ── the workbook ────────────────────────────────────────────────── */

  /**
   * A workbook carrying ONLY the new sites, with every sheet and every header
   * of the source export. The team imports single sites routinely, so a small
   * file of new rows is what their own routine already expects.
   */
  function buildWorkbook(XLSX, kit, specs, opts) {
    const groupName = opts && opts.groupName ? String(opts.groupName).trim() : '';
    const all = specs.map(s => cloneSite(kit, s));
    const out = XLSX.utils.book_new();
    const warnings = all.flatMap(c => c.warnings);

    for (const sh of kit.sheets) {
      const rows = [];
      for (const c of all) if (c.rows.has(sh.name)) rows.push(...c.rows.get(sh.name));
      // The header is COPIED before the group column is renamed, so the kit
      // stays as it was read and a second build is not affected.
      const head = sh.head.slice();
      if (rows.length) warnings.push(...applyGroup(head, rows, groupName));
      // Every sheet is emitted, headers and all, even when empty — the export
      // keeps the shape Planet produced rather than a subset of it.
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([head, ...rows]), sh.name);
    }
    return { wb: out, warnings };
  }

  /**
   * The bytes. ALWAYS written through here, never with a bare XLSX.write.
   *
   * `bookSST: true` IS NOT OPTIONAL. Without it SheetJS writes every text cell
   * as `t="str"`, which in OOXML means a FORMULA's cached string result, not a
   * literal text cell — a literal is `t="s"` indexing `sharedStrings.xml`, or
   * `t="inlineStr"`. Excel is lenient and reads `t="str"` happily; Planet's
   * own export and Excel's re-save both use `t="s"`, and ours now does too.
   * (It did not, on its own, make Planet accept the file — the Excel re-save
   * still does that. See CLAUDE.md "The Excel round trip".)
   */
  function writeWorkbook(XLSX, wb) {
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array', bookSST: true });
  }

  /* ── helpers the form needs ──────────────────────────────────────── */

  // THE FILE NAME IS THE GROUP NAME — Elad's own knowledge of how Planet
  // names a group, and the TS trial is consistent with it. So the download
  // name is load-bearing, not cosmetic, and ONE FILE IS ONE GROUP — several
  // groups in a round means several files.
  const groupFileName = groupName => (String(groupName || '').trim() || 'sites') + '.xlsx';

  // Partner names a sector L + the site id without its trailing letter + the
  // sector code: EA0402C -> LEA0402Da. A SUGGESTION for the form to prefill,
  // never applied on its own — the other operators name sectors their own
  // way, and nothing here should guess an id that goes into Planet.
  function suggestSectorId(siteId, sector) {
    const s = String(siteId || '').trim();
    if (!/^[A-Z]{2}\d{4}[A-Z]$/i.test(s)) return '';
    return 'L' + s.slice(0, -1).toUpperCase() + String(sector || '');
  }

  // Every Site ID a full export carries, for tools/gen_site.mjs. (The app
  // checks against the loaded databases plus each kit's `idle` instead.)
  function existingSiteIds(sheets) {
    const out = new Set();
    for (const sh of sheets) {
      if (sh.hdr[SITE] == null) continue;
      for (const r of sh.rows) {
        const v = str(at(r, sh.hdr, SITE));
        if (v) out.add(v.toLowerCase());
      }
    }
    return out;
  }

  const API = { readSheets, makeKit, bandFor, cloneSite, buildWorkbook,
                suggestSectorId, existingSiteIds, groupCols, applyGroup,
                groupFileName, writeWorkbook, BLANK, DEFAULTS, KIT_VERSION };

  scope.TableXSiteGen = API;
  if (typeof module === 'object' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : globalThis);
