/* ═══════════════════════════════════════════════════════════════════
   SITEGEN — a new site, written in the format Planet exported

   The first Planet quest. The RF team is given a נ.צ and a plant for a site
   that will be built, and today they COPY AN EXISTING SITE IN PLANET and
   change its data by hand, 13+ times a round. This writes that workbook.

   THE ONE RULE, and it is the Decks rule one file over: we never author a
   Planet row we do not understand. A new site is built by CLONING a real
   one's rows across every sheet and overwriting only the fields the user
   supplied. The 47 columns of LTE_FDD_Sector_Carriers — PUSCH power control,
   Zadoff-Chu sequences, power recycling — keep whatever Planet itself wrote.
   What comes out is a row Planet made, with our values in it.

   THE DONOR IS PER SECTOR, NOT PER SITE. A band choice drags four other
   columns with it: 1800_20 means Propagation Model P3M_1800MHz_*.pmf,
   Carrier Name 1800_20_SB1_PHI, `Carrier: 1800_20_SB1_PHI = Allocated` with
   the others Unused, and `Group: PHI_1800 = TRUE`. Rather than hardcode that
   map — which would be a second copy of Planet's own configuration, free to
   drift — each new sector clones a sector that ALREADY CARRIES ITS BAND. The
   derived columns then come out right because Planet set them.

   EVERYTHING IS FOUND BY HEADER, never by column index, the same contract
   dbparse.js and build_db.py hold. An export with an extra column still works.

   Loaded as a plain <script> by index.html (exposing self.TableXSiteGen) and
   as a module by tools/gen_site.mjs, so the Node driver and the app share ONE
   copy of this — the pattern dbparse.js already uses, for the same reason.
   ═══════════════════════════════════════════════════════════════════ */
(function (scope) {
  'use strict';

  // The join columns. A clone is only safe if every row that points at the
  // template site is found and re-pointed, so these are the whole contract.
  const SITE = 'site id', SECTOR = 'sector id', ANT = 'antenna id';

  // Blanked on every clone. A cloned PCI is the template's PCI, and two
  // sites radiating the same PCI in one area is the exact fault Interfex
  // exists to find — a confident wrong answer, which this codebase does not
  // ship. Blank is visible; wrong is not.
  const BLANK = ['physical cell id', 'physical cell id group',
                 'physical layer id', 'cell id'];

  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();

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
      const hdr = Object.create(null);
      head.forEach((h, i) => { const k = norm(h); if (k && !(k in hdr)) hdr[k] = i; });
      return { name, hdr, head, rows: grid.slice(1) };
    }).filter(Boolean);
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

  /* ── what a site is made of ──────────────────────────────────────── */

  // Every row on every sheet that belongs to one site, which is what the
  // clone has to reproduce. A six-sector Partner site is 37 rows over seven
  // sheets; nothing here assumes that shape, it just follows Site ID.
  function siteRows(sheets, siteId) {
    const want = norm(siteId);
    return sheets.map(sh => ({
      sheet: sh,
      rows: sh.hdr[SITE] == null ? []
        : sh.rows.filter(r => norm(at(r, sh.hdr, SITE)) === want),
    }));
  }

  // Which bands the workbook carries, each with a sector that uses it. That
  // sector is the donor for a new sector on that band.
  function bandDonors(sheets) {
    const sec = sheets.find(sh => sh.hdr[SECTOR] != null && sh.hdr['band name'] != null);
    const out = new Map();
    if (!sec) return out;
    for (const r of sec.rows) {
      const band = String(at(r, sec.hdr, 'band name') || '').trim();
      const id = String(at(r, sec.hdr, SECTOR) || '').trim();
      if (band && id && !out.has(band)) out.set(band, id);
    }
    return out;
  }

  /* ── the clone ───────────────────────────────────────────────────── */

  /**
   * One new site, as rows per sheet.
   *
   * spec = { siteId, name, lon, lat, templateSite, sectors: [ {
   *            sectorId, band, az, height, tilt, etilt, model, pwr,
   *            donorSector     // optional; defaults to a sector on that band
   *          } ] }
   *
   * Returns { rows: Map<sheet name, row[]>, warnings: [] }.
   */
  function cloneSite(sheets, spec) {
    const warn = [];
    const out = new Map();
    const donors = bandDonors(sheets);
    const add = (name, row) => {
      if (!out.has(name)) out.set(name, []);
      out.get(name).push(row);
    };

    /* the Sites row — cloned from the template site, which is where the
       columns nobody set (Candidate Priority, Site UID) come from. */
    const tmpl = siteRows(sheets, spec.templateSite);
    const siteSheet = tmpl.find(t => t.sheet.hdr[SITE] != null
      && t.sheet.hdr[SECTOR] == null && t.sheet.hdr[ANT] == null
      && t.sheet.hdr['longitude'] != null);
    if (!siteSheet || !siteSheet.rows.length) {
      warn.push('template site ' + spec.templateSite + ' has no Sites row');
    } else {
      const sh = siteSheet.sheet, row = siteSheet.rows[0].slice();
      put(row, sh.hdr, SITE, spec.siteId);
      if (spec.lon != null) put(row, sh.hdr, 'longitude', spec.lon);
      if (spec.lat != null) put(row, sh.hdr, 'latitude', spec.lat);
      // The Hebrew name lives in Description — Planet's `Site Name` column is
      // empty in all 3,129 rows of the Partner export (see the DB contract).
      if (spec.name != null) put(row, sh.hdr, 'description', spec.name);
      add(sh.name, row);
    }

    /* one antenna per sector, numbered 1..N for the new site. The template's
       own numbering is not followed: EA0402C uses 1,2,7,8,9,10, and the join
       only has to be internally consistent, not to match anyone else's. */
    spec.sectors.forEach((s, i) => {
      const antId = i + 1;
      const band = String(s.band || '').trim();
      const donorId = s.donorSector || donors.get(band);
      if (!donorId) {
        warn.push('no sector in the template workbook carries band "' + band
          + '" — sector ' + s.sectorId + ' was not written');
        return;
      }
      const donor = String(donorId);
      const dSite = sectorsSite(sheets, donor);

      for (const sh of sheets) {
        const h = sh.hdr;
        if (h[SITE] == null) continue;

        // A sheet keyed by Sector ID clones the donor's row for that sector;
        // a sheet keyed by Antenna ID alone clones the donor's antenna row.
        let src = null;
        if (h[SECTOR] != null) {
          src = sh.rows.find(r => norm(at(r, h, SECTOR)) === norm(donor));
        } else if (h[ANT] != null && dSite) {
          const aId = donorAntenna(sheets, donor);
          src = aId == null ? null : sh.rows.find(r =>
            norm(at(r, h, SITE)) === norm(dSite) && norm(at(r, h, ANT)) === norm(aId));
        }
        if (!src) continue;

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

        // Identity Planet must assign, never us. `keepIdentity` exists only
        // because whether Planet's import ACCEPTS a blank here is unknown
        // until someone tries it on TS; it is the fallback, not the default.
        if (!spec.keepIdentity) {
          for (const k of BLANK) if (h[k] != null) put(row, h, k, '');
        }

        add(sh.name, row);
      }
    });

    return { rows: out, warnings: warn };
  }

  // Which site a sector belongs to, and which antenna serves it — both read
  // off the workbook rather than derived from the id, since only Partner's
  // ids encode their site.
  function sectorsSite(sheets, sectorId) {
    for (const sh of sheets) {
      if (sh.hdr[SECTOR] == null || sh.hdr[SITE] == null) continue;
      const r = sh.rows.find(x => norm(at(x, sh.hdr, SECTOR)) === norm(sectorId));
      if (r) return String(at(r, sh.hdr, SITE) || '').trim();
    }
    return '';
  }
  function donorAntenna(sheets, sectorId) {
    const join = sheets.find(sh => sh.hdr[SECTOR] != null && sh.hdr[ANT] != null);
    if (!join) return null;
    const r = join.rows.find(x => norm(at(x, join.hdr, SECTOR)) === norm(sectorId));
    return r ? at(r, join.hdr, ANT) : null;
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
   * half. A cloned row arrives carrying the template's memberships — the
   * Partner export's rows are `Group: PARTNER = TRUE` and one `PHI_*` column
   * TRUE — so importing one unchanged would quietly add the new site to two
   * of the team's real groups in a SHARED project. A quest may add clearly
   * named new things; it must never change something that was already there.
   *
   * DELETED rather than set FALSE, because that is what was PROVEN on TS
   * (2026-10-02): an import carrying the other group columns was refused, and
   * the same workbook with them removed was accepted. Setting them FALSE was
   * this file's first answer and it was reasoning, not evidence — keeping the
   * shape Planet produced sounded safer right up until Planet disagreed.
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
  function buildWorkbook(XLSX, sheets, specs, opts) {
    const groupName = opts && opts.groupName ? String(opts.groupName).trim() : '';
    const all = specs.map(s => cloneSite(sheets, s));
    const out = XLSX.utils.book_new();
    const warnings = all.flatMap(c => c.warnings);

    for (const sh of sheets) {
      const rows = [];
      for (const c of all) if (c.rows.has(sh.name)) rows.push(...c.rows.get(sh.name));
      // The header is COPIED before the group column is renamed, so the source
      // sheets stay as they were read and a second build is not affected.
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
   * `t="inlineStr"`. Excel is lenient and reads `t="str"` happily; Planet is
   * not, and refused the file (TS, 2026-10-02). Opening it in Excel and
   * saving fixed it precisely because Excel rewrote every cell as `t="s"` and
   * built the shared-strings table SheetJS had left out.
   *
   * With it, our Sites row comes out the same shape as the row in Planet's
   * own export, shared-string indices and all.
   */
  function writeWorkbook(XLSX, wb) {
    return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', bookSST: true });
  }

  /* ── helpers the form needs ──────────────────────────────────────── */

  // THE FILE NAME IS THE GROUP NAME. Proven on TS 2026-10-02: the same
  // workbook was refused as `TableX_new_site_TX9001A.xlsx` and accepted as
  // `TableX_Test.xlsx`, the name of the group made in Planet beforehand. So
  // the download name is load-bearing, not cosmetic, and ONE FILE IS ONE
  // GROUP — several groups in a round means several files.
  const groupFileName = groupName => (String(groupName || '').trim() || 'sites') + '.xlsx';

  // Partner names a sector L + the site id without its trailing letter + the
  // sector code: EA0402C -> LEA0402Da. A SUGGESTION for the form to prefill,
  // never applied on its own — the other three operators name sectors their
  // own way, and nothing here should guess an id that goes into Planet.
  function suggestSectorId(siteId, sector) {
    const s = String(siteId || '').trim();
    if (!/^[A-Z]{2}\d{4}[A-Z]$/i.test(s)) return '';
    return 'L' + s.slice(0, -1).toUpperCase() + String(sector || '');
  }

  // Every Site ID the source export already carries, so a generated one can
  // be refused before it reaches a shared project. An import that reuses an
  // id overwrites a real site for the whole team.
  function existingSiteIds(sheets) {
    const out = new Set();
    for (const sh of sheets) {
      if (sh.hdr[SITE] == null) continue;
      for (const r of sh.rows) {
        const v = String(at(r, sh.hdr, SITE) || '').trim();
        if (v) out.add(v.toLowerCase());
      }
    }
    return out;
  }

  /* ── what the form needs to SHOW ─────────────────────────────────── */

  // Every site in the export, as {id, name}. Small enough to hand to the
  // page: 3,129 entries for Partner, against the 16,510 x 47 grid behind it.
  function siteList(sheets) {
    const sh = sheets.find(s => s.hdr[SITE] != null && s.hdr[SECTOR] == null
      && s.hdr[ANT] == null && s.hdr['longitude'] != null);
    if (!sh) return [];
    const out = [];
    for (const r of sh.rows) {
      const id = String(at(r, sh.hdr, SITE) || '').trim();
      if (!id) continue;
      out.push({
        id,
        name: String(at(r, sh.hdr, 'description') || '').trim(),
        lon: at(r, sh.hdr, 'longitude'),
        lat: at(r, sh.hdr, 'latitude'),
      });
    }
    return out;
  }

  // One site's sectors with the plant the form seeds itself from. The job
  // this replaces is "copy an existing site and change its data", so the
  // form opens holding the template's own values rather than empty fields.
  function siteDetail(sheets, siteId) {
    const want = norm(siteId);
    const sec = sheets.find(s => s.hdr[SECTOR] != null && s.hdr['band name'] != null);
    const antSh = sheets.find(s => s.hdr[ANT] != null && s.hdr['azimuth'] != null);
    const join = sheets.find(s => s.hdr[SECTOR] != null && s.hdr[ANT] != null);
    const pwrSh = sheets.find(s => s.hdr[SECTOR] != null && s.hdr['pa power (dbm)'] != null);
    const eSh = sheets.find(s => s.hdr[ANT] != null && s.hdr['electrical tilt'] != null);
    if (!sec) return { sectors: [] };

    const sectors = [];
    for (const r of sec.rows) {
      if (norm(at(r, sec.hdr, SITE)) !== want) continue;
      const id = String(at(r, sec.hdr, SECTOR) || '').trim();
      const o = { sectorId: id, band: String(at(r, sec.hdr, 'band name') || '').trim() };

      // antenna, found through the explicit sector->antenna join rather than
      // matched by azimuth: a multi-band site has two antennas on one azimuth
      // and matching by it would take whichever was indexed first.
      let aId = null;
      if (join) {
        const j = join.rows.find(x => norm(at(x, join.hdr, SECTOR)) === norm(id));
        if (j) aId = at(j, join.hdr, ANT);
      }
      if (antSh && aId != null) {
        const a = antSh.rows.find(x => norm(at(x, antSh.hdr, SITE)) === want
          && norm(at(x, antSh.hdr, ANT)) === norm(aId));
        if (a) {
          o.az = at(a, antSh.hdr, 'azimuth');
          o.height = at(a, antSh.hdr, 'height (m)');
          o.tilt = at(a, antSh.hdr, 'mechanical tilt');
          o.model = String(at(a, antSh.hdr, 'antenna file') || '').trim();
        }
      }
      if (eSh && aId != null) {
        const e = eSh.rows.find(x => norm(at(x, eSh.hdr, SITE)) === want
          && norm(at(x, eSh.hdr, ANT)) === norm(aId));
        if (e) o.etilt = at(e, eSh.hdr, 'electrical tilt');
      }
      if (pwrSh) {
        const p = pwrSh.rows.find(x => norm(at(x, pwrSh.hdr, SECTOR)) === norm(id));
        if (p) o.pwr = at(p, pwrSh.hdr, 'pa power (dbm)');
      }
      sectors.push(o);
    }
    return { sectors };
  }

  const API = { readSheets, siteRows, bandDonors, cloneSite, buildWorkbook,
                suggestSectorId, existingSiteIds, groupCols, applyGroup,
                groupFileName, writeWorkbook, siteList, siteDetail, BLANK };

  scope.TableXSiteGen = API;
  if (typeof module === 'object' && module.exports) module.exports = API;

  /* ── the Worker ──────────────────────────────────────────────────────
     Reading ALL seven sheets of a group export in full is ~6.5 s of
     straight-line CPU — more than the database import, which reads only the
     two sheets it understands. On the main thread that is long enough for
     Chrome to raise "page unresponsive".

     The workbook STAYS IN THE WORKER. Handing the page 16,510 rows x 47
     columns so it could build the file itself would be a structured clone of
     tens of megabytes; instead the worker answers small questions (the site
     list, one site's plant) and returns the finished bytes. Same reason
     dbparse.js runs in one, one step further.

     Loaded as a plain <script> by index.html too, which only defines
     self.TableXSiteGen — the wiring below is behind the importScripts check,
     so there is a main-thread fallback without a second copy of the logic. */
  if (typeof importScripts === 'function') {
    importScripts('xlsx.full.min.js');
    let sheets = null;                       // the loaded export, kept here

    scope.onmessage = ev => {
      const m = ev.data || {};
      try {
        if (m.op === 'load') {
          const wb = scope.XLSX.read(new Uint8Array(m.buf), { type: 'array' });
          sheets = readSheets(scope.XLSX, wb);
          scope.postMessage({ result: {
            sites: siteList(sheets),
            bands: [...bandDonors(sheets).keys()],
            sheets: sheets.map(s => s.name),
            taken: [...existingSiteIds(sheets)],
          } });
          return;
        }
        if (!sheets) throw new Error('no export loaded');
        if (m.op === 'site') {
          scope.postMessage({ result: siteDetail(sheets, m.siteId) });
          return;
        }
        if (m.op === 'build') {
          const { wb, warnings } = buildWorkbook(scope.XLSX, sheets, m.specs,
            { groupName: m.groupName });
          const buf = writeWorkbook(scope.XLSX, wb);
          // A fresh ArrayBuffer the page will take ownership of, so the
          // bytes are moved rather than copied.
          const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          scope.postMessage({ result: { file: ab, warnings } }, [ab]);
          return;
        }
        throw new Error('unknown op: ' + m.op);
      } catch (e) {
        scope.postMessage({ error: (e && e.message) ? e.message : String(e) });
      }
    };
  }
})(typeof self !== 'undefined' ? self : globalThis);
