#!/usr/bin/env python3
"""Planet network export (.xlsx) -> TableX/data/<network>.json

    python tools/build_db.py partner path\\to\\Partner_May_26_V3.xlsx
    python tools/build_db.py idf     path\\to\\IDF_Share.xlsx

Stdlib only -- an .xlsx is a zip of XML -- so this runs anywhere Python does,
same as Interfex's tools/build_cell_map.py.

TWO WORKBOOK LAYOUTS, both found by HEADERS and never by tab name, so a
renamed tab still converts and a sheet we do not need is simply never matched:

  A. PLANET GROUP EXPORT (multi-sheet) -- what "export group" produces for
     Cellcom_Share / Partner_Share / Pelephone_Share / IDF_Share. Planet adds
     further sheets to the workbook after the first upload; we match the two we
     need by signature and ignore everything else, so the file needs no cleaning
     before import and a future Planet version that appends more sheets still
     works.

       Sites   sheet:  Site ID + a name column, and NO Sector ID
       Sectors sheet:  Sector ID + Site ID + Band Name

     Three derivations, each verified against the shipped partner.json over the
     14,008 sector ids the two sources share (2026-09-05):

       site name   <- the BEST POPULATED of Description / Site Name.
                      Planet's `Site Name` column is EMPTY in all 3,129 rows of
                      the Partner export and the Hebrew lives in `Description`,
                      so keying blindly on the column called "Site Name" builds
                      a database of blank names. Presence is not enough; count.
       sector      <- trailing letters of the Sector ID (LEA0402Da -> Da).
                      14,008/14,008 exact.
       freq + bw   <- Band Name, "1800_20" -> 1800 MHz / 20 MHz.
                      freq 14,008/14,008 exact; bw 13,984/14,008, the 24
                      differences being a real 700 MHz carrier change that the
                      export's own `Carrier Bandwidth (MHz)` column confirms.

  B. FLAT SHEET (single-sheet) -- the older DEMO_DB.xlsx shape. Kept so existing
     workbooks still import. All six headers in ONE sheet:

       Sector ID | Site ID | Site Name | Sector | Frequency (MHz) | Bandwidth (MHz)

Output shape -- names are deduplicated per site, which matters because a site
carries up to 12 sectors here and the Hebrew name is the longest field:

    {
      "network": "partner",
      "label":   "Partner",
      "source":  "Partner_May_26_V3.xlsx",
      "built":   "2026-09-05",
      "sites":   { "MN4610A": "..." },
      "sectors": { "LNN4610Da": ["MN4610A", "Da", 1800, 20] }
    }

The app keys on sector id (what Planet's point analysis reports) and falls back
to site id, flagging that row as approximate.

parseWorkbook() in TableX/js/app.js implements this SAME contract in the
browser. Change one, change the other.
"""
import datetime
import json
import os
import re
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, 'TableX', 'data')

LABELS = {'idf': 'IDF', 'cellcom': 'Cellcom',
          'partner': 'Partner', 'pelephone': 'Pelephone'}

# Layout B: every header required in one sheet.
WANT = ['sector id', 'site id', 'site name', 'sector',
        'frequency (mhz)', 'bandwidth (mhz)']

# Layout A: candidate site-name columns, best-populated wins (see module docs).
NAME_COLS = ['description', 'site name', 'site name 2']

TRAILING_ALPHA = re.compile(r'([A-Za-z]+)$')

# Operator band LABELS, in MHz. Band Name is only trusted to carry a centre
# frequency when it yields one of these. Partner writes "1800_20" and means
# 1800 MHz; Cellcom writes "2850_20" for the same column and means EARFCN 2850
# (band 7, a 2600 MHz label), and Pelephone writes "P3M_2600LTE.MIMO 3250_20".
# Nothing structural separates 1800-the-frequency from 2850-the-EARFCN, so the
# only safe discriminator is whether the number is a frequency an operator
# would print on a slide. Anything else becomes None and is counted -- a wrong
# frequency in front of a commander is worse than a blank one.
BAND_LABELS = frozenset([450, 700, 750, 800, 850, 900, 1800, 1900,
                         2100, 2300, 2600, 3500, 3600])


def col_index(ref):
    """'BC12' -> 54. Cell refs are the only reliable column position: xlsx
    omits empty cells entirely, so counting <c> elements shifts columns."""
    letters = re.match(r'([A-Z]+)', ref).group(1)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def shared_strings(zf):
    if 'xl/sharedStrings.xml' not in zf.namelist():
        return []
    xml = zf.read('xl/sharedStrings.xml').decode('utf8')
    return [''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S))
            for si in re.findall(r'<si>(.*?)</si>', xml, re.S)]


def unescape(s):
    return (s.replace('&lt;', '<').replace('&gt;', '>')
             .replace('&quot;', '"').replace('&apos;', "'")
             .replace('&amp;', '&'))


def rows_of(zf, sheet_path, sst):
    """Yield each row as a list, cells placed by their real column index."""
    xml = zf.read(sheet_path).decode('utf8')
    for rm in re.finditer(r'<row[^>]*>(.*?)</row>', xml, re.S):
        cells = {}
        for cm in re.finditer(r'<c\b([^>]*?)(?:/>|>(.*?)</c>)', rm.group(1), re.S):
            attrs, body = cm.group(1), cm.group(2) or ''
            ref = re.search(r'r="([A-Z]+\d+)"', attrs)
            if not ref:
                continue
            typ = re.search(r't="([^"]+)"', attrs)
            typ = typ.group(1) if typ else 'n'
            inline = re.findall(r'<t[^>]*>(.*?)</t>', body, re.S)
            val = re.search(r'<v>(.*?)</v>', body, re.S)
            if inline:                       # inlineStr
                text = ''.join(inline)
            elif val is None:
                text = ''
            elif typ == 's':                 # sharedStrings index
                idx = int(val.group(1))
                text = sst[idx] if idx < len(sst) else ''
            else:
                text = val.group(1)
            cells[col_index(ref.group(1))] = unescape(text).strip()
        if cells:
            yield [cells.get(i, '') for i in range(max(cells) + 1)]


def num(s):
    """'1800' -> 1800, '20.0' -> 20, '' -> None. Keeps the JSON small and lets
    the UI print 1800 rather than 1800.0."""
    try:
        f = float(s)
    except (TypeError, ValueError):
        return s or None
    return int(f) if f == int(f) else f


def sheet_index(zf):
    """[(display name, xml path)] in workbook order, so messages can name the
    sheet a human sees rather than 'sheet4.xml'."""
    wb = zf.read('xl/workbook.xml').decode('utf8')
    rels = zf.read('xl/_rels/workbook.xml.rels').decode('utf8')
    target = {}
    for rm in re.finditer(r'<Relationship\b[^>]*/>', rels):
        tag = rm.group(0)
        rid = re.search(r'Id="([^"]+)"', tag)
        tgt = re.search(r'Target="([^"]+)"', tag)
        if rid and tgt:
            # Targets come BOTH ways in the wild: '/xl/worksheets/sheet1.xml'
            # (absolute, DEMO_DB.xlsx) and 'worksheets/sheet1.xml' (relative to
            # xl/, Partner_May_26_V3.xlsx). Strip, then prefix only if needed.
            path = tgt.group(1).lstrip('/')
            if not path.startswith('xl/'):
                path = 'xl/' + path
            target[rid.group(1)] = path
    out = []
    for sm in re.finditer(r'<sheet\b[^>]*/>', wb):
        tag = sm.group(0)
        name = re.search(r'name="([^"]*)"', tag)
        rid = re.search(r'r:id="([^"]*)"', tag)
        if name and rid and rid.group(1) in target:
            out.append((unescape(name.group(1)), target[rid.group(1)]))
    names = set(zf.namelist())
    out = [(n, p) for n, p in out if p in names]
    if not out:                     # unreadable workbook.xml -- fall back to
        out = [(p, p) for p in sorted(                    # positional order
            n for n in names if re.match(r'xl/worksheets/sheet\d+\.xml$', n))]
    return out


def load_sheets(zf, sst):
    """[(name, {normalised header: column index}, [data rows])] for every sheet
    carrying a recognisable header row in its first five lines."""
    out = []
    for name, path in sheet_index(zf):
        try:
            rows = list(rows_of(zf, path, sst))
        except KeyError:
            continue
        for i, row in enumerate(rows[:5]):
            hdr = {re.sub(r'\s+', ' ', c).strip().lower(): j
                   for j, c in enumerate(row) if c}
            if 'site id' in hdr:
                out.append((name, hdr, rows[i + 1:]))
                break
    return out


def cell(row, hdr, key):
    i = hdr.get(key)
    return row[i].strip() if i is not None and i < len(row) else ''


def best_name_col(hdr, rows):
    """Which candidate column actually holds the site name. Planet ships a
    `Site Name` column that is entirely empty, so presence is not enough --
    pick the one with the most populated cells."""
    best, best_n = None, 0
    for key in NAME_COLS:
        if key not in hdr:
            continue
        n = sum(1 for r in rows if cell(r, hdr, key))
        if n > best_n:
            best, best_n = key, n
    return best


def parse_band(s):
    """'1800_20' -> (1800, 20).  '700_5_9435' -> (700, 5).  '' -> (None, None)"""
    nums = re.findall(r'\d+', s or '')
    return (int(nums[0]) if nums else None,
            int(nums[1]) if len(nums) > 1 else None)


def build_multi(sheets):
    """Layout A. Returns (sites, sectors, description) or None."""
    sec_sheet = None
    for name, hdr, rows in sheets:
        if 'sector id' in hdr and 'site id' in hdr and (
                'band name' in hdr or
                ('frequency (mhz)' in hdr and 'bandwidth (mhz)' in hdr)):
            sec_sheet = (name, hdr, rows)
            break
    if not sec_sheet:
        return None

    site_sheet = None
    for name, hdr, rows in sheets:
        if 'sector id' in hdr:               # that is a sector sheet, not sites
            continue
        if best_name_col(hdr, rows):
            site_sheet = (name, hdr, rows)
            break
    if not site_sheet:
        return None

    s_name, s_hdr, s_rows = site_sheet
    name_col = best_name_col(s_hdr, s_rows)
    sites = {}
    for row in s_rows:
        site_id = cell(row, s_hdr, 'site id')
        if not site_id:
            continue
        nm = cell(row, s_hdr, name_col)
        if site_id not in sites or (nm and not sites[site_id]):
            sites[site_id] = nm

    c_name, c_hdr, c_rows = sec_sheet
    sectors, skipped = {}, 0
    rows = dupes = unknown_band = 0
    dupe_example = band_example = None
    for row in c_rows:
        sec_id = cell(row, c_hdr, 'sector id')
        site_id = cell(row, c_hdr, 'site id')
        if not sec_id or not site_id:
            skipped += 1
            continue
        rows += 1
        # A repeated Sector ID is not a key -- the second row overwrites the
        # first. IDF's export numbers sectors 1/2/3 PER SITE, so importing it
        # blind would collapse a whole network into a handful of rows.
        if sec_id in sectors:
            dupes += 1
            if dupe_example is None:
                dupe_example = sec_id
        sector = cell(row, c_hdr, 'sector')
        if not sector:
            m = TRAILING_ALPHA.search(sec_id)
            sector = m.group(1) if m else None
        band_name = cell(row, c_hdr, 'band name')
        freq, bw = parse_band(band_name)
        if freq is not None and freq not in BAND_LABELS:
            freq = None                               # EARFCN or worse
            unknown_band += 1
            if band_example is None:
                band_example = band_name
        if 'frequency (mhz)' in c_hdr:                # explicit beats derived
            freq = num(cell(row, c_hdr, 'frequency (mhz)')) or freq
        if 'bandwidth (mhz)' in c_hdr:
            bw = num(cell(row, c_hdr, 'bandwidth (mhz)')) or bw
        elif 'carrier bandwidth (mhz)' in c_hdr:
            bw = num(cell(row, c_hdr, 'carrier bandwidth (mhz)')) or bw
        sectors[sec_id] = [site_id, sector or None, freq, bw]

    # A site with no sectors is unreachable by any lookup, so carrying its name
    # only grows a file the browser fetches on every load. Same rule the site
    # editor applies when you remove a site's last sector.
    used = set(v[0] for v in sectors.values())
    dropped = [k for k in sites if k not in used]
    for k in dropped:
        del sites[k]

    desc = ('multi-sheet: sites=%r (name column %r), sectors=%r'
            % (s_name, name_col, c_name))
    if dropped:
        desc += '\n  dropped %d site(s) with no sectors' % len(dropped)
    if skipped:
        desc += '\n  skipped %d sector row(s) with no sector id / site id' % skipped
    if unknown_band:
        desc += ('\n  WARNING: %d/%d rows have an unrecognised Band Name (e.g. %r) '
                 '-- their frequency is left blank rather than guessed'
                 % (unknown_band, rows, band_example))
    if dupes:
        sys.exit('REFUSING: %d of %d rows repeat a sector code already seen '
                 '(e.g. %r).\nThe Sector ID column is not a unique key, so this '
                 'import would silently drop rows.\nExport with a sector code '
                 'unique across the whole network.' % (dupes, rows, dupe_example))
    return sites, sectors, desc


def build_flat(sheets):
    """Layout B. Returns (sites, sectors, description) or None."""
    for name, hdr, rows in sheets:
        if not all(w in hdr for w in WANT):
            continue
        sites, sectors, skipped = {}, {}, 0
        n_rows = dupes = 0
        dupe_example = None
        for row in rows:
            sec_id = cell(row, hdr, 'sector id')
            site_id = cell(row, hdr, 'site id')
            if not sec_id or not site_id:
                skipped += 1
                continue
            n_rows += 1
            if sec_id in sectors:
                dupes += 1
                if dupe_example is None:
                    dupe_example = sec_id
            nm = cell(row, hdr, 'site name')
            if site_id not in sites or (nm and not sites[site_id]):
                sites[site_id] = nm
            sectors[sec_id] = [site_id, cell(row, hdr, 'sector') or None,
                               num(cell(row, hdr, 'frequency (mhz)')),
                               num(cell(row, hdr, 'bandwidth (mhz)'))]
        desc = 'flat sheet: %r' % name
        if skipped:
            desc += '\n  skipped %d row(s) with no sector id / site id' % skipped
        if dupes:
            sys.exit('REFUSING: %d of %d rows repeat a sector code already seen '
                     '(e.g. %r).\nThe Sector ID column is not a unique key, so '
                     'this import would silently drop rows.'
                     % (dupes, n_rows, dupe_example))
        return sites, sectors, desc
    return None


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    network, xlsx = sys.argv[1], sys.argv[2]
    if network not in LABELS:
        sys.exit('network must be one of: %s' % ', '.join(LABELS))
    if not os.path.exists(xlsx):
        sys.exit('no such file: %s' % xlsx)

    zf = zipfile.ZipFile(xlsx)
    sst = shared_strings(zf)
    sheets = load_sheets(zf, sst)
    print('sheets read: %s' % ', '.join(repr(s[0]) for s in sheets))

    built = build_flat(sheets) or build_multi(sheets)
    if not built:
        sys.exit('No usable layout. Needs EITHER one sheet carrying\n  %s\n'
                 'OR a Planet group export with a Sites sheet (Site ID + a '
                 'name column)\nand a Sectors sheet (Sector ID + Site ID + '
                 'Band Name).' % ' | '.join(WANT))
    sites, sectors, desc = built
    print('layout: %s' % desc)

    out = {
        'network': network,
        'label': LABELS[network],
        'source': os.path.basename(xlsx),
        'built': datetime.date.today().isoformat(),
        'sites': sites,
        'sectors': sectors,
    }
    os.makedirs(DATA, exist_ok=True)
    dest = os.path.join(DATA, '%s.json' % network)
    if os.path.exists(dest):                       # the .bak has saved this
        with open(dest, 'rb') as fh:               # database twice already
            prev = fh.read()
        with open(dest + '.bak', 'wb') as fh:
            fh.write(prev)
    with open(dest, 'w', encoding='utf8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))

    print('sites:   %6d' % len(sites))
    print('sectors: %6d' % len(sectors))
    print('wrote:   %s  (%.1f KB)' % (dest, os.path.getsize(dest) / 1024.0))


if __name__ == '__main__':
    main()
