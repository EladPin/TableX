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

# Which part of a sector id names the sector within its site:
#   LEA0402Da    -> Da    trailing letters            (Partner)
#   3634249_270  -> 270   after the last underscore   (Cellcom -- the azimuth)
#   935739_22    -> 22    after the last underscore   (Pelephone)
# Partner never reaches the second rule, since its ids always end in letters, so
# the path verified across 14,008 sectors is untouched.
TRAILING_ALPHA = re.compile(r'([A-Za-z]+)$')
AFTER_UNDERSCORE = re.compile(r'_([^_]+)$')


def sector_of(sec_id):
    m = TRAILING_ALPHA.search(sec_id)
    if m:
        return m.group(1)
    m = AFTER_UNDERSCORE.search(sec_id)
    return m.group(1) if m else ''

# Band Name says the frequency THREE different ways, one per operator:
#
#   Partner    "1800_20"                   the band label, in MHz
#   Pelephone  "P3M_2600LTE.MIMO 3250_20"  label, then EARFCN, then width
#   Cellcom    "2850_20"                   EARFCN only -- band 7, a 2600 label
#
# Nothing structural separates 1800-the-frequency from 2850-the-EARFCN; both are
# <int>_<int>. So: take an operator band LABEL if the string carries one, else
# convert an EARFCN to its band's label using the 3GPP 36.101 downlink ranges.
# That second path is anchored to a published standard rather than to any
# operator's file, which matters because the Cellcom and Pelephone workbooks
# live on an isolated network and can never be checked here.
BAND_LABELS = frozenset([450, 700, 750, 800, 850, 900, 1800, 1900,
                         2100, 2300, 2600, 3500, 3600])

# (first DL EARFCN, last, the label an operator prints)
EARFCN_BANDS = [(0, 599, 2100), (1200, 1949, 1800), (2400, 2649, 850),
                (2750, 3449, 2600), (3450, 3799, 900), (6150, 6449, 800),
                (9210, 9659, 700), (37750, 38249, 2600), (38650, 39649, 2300)]

# Legal LTE channel widths in MHz (1 stands in for the 1.4 MHz carrier).
LTE_BW = frozenset([1, 3, 5, 10, 15, 20])


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


EARFCN_NETS = frozenset(['idf'])


def band_of(earfcn):
    """The band an EARFCN lands in, for the build's own verification line."""
    for lo, hi, label in EARFCN_BANDS:
        if lo <= earfcn <= hi:
            return label
    return None


def parse_band(s, mode=None):
    """'1800_20' -> (1800, 20)   '700_5_9435' -> (700, 5)   '2850_20' -> (2600, 20)
    'P3M_2600LTE.MIMO 3250_20' -> (2600, 20)   '' -> (None, None)

    MODE 'earfcn' keeps the EARFCN ITSELF instead of the band it lands in.
    IDF's frequency column is the raw EARFCN, because the team reads ENM and
    that is the number they recognise, so 'P3M_750LTE.MIMO 9260_10' has to
    store 9260 rather than 750. Every other network still stores MHz.

    The EARFCN is the first number in a downlink range that is NEITHER a legal
    channel width NOR a band label, which skips the 3 of the 'P3M_' prefix (a
    legal width) and the 750 of the band label before reaching 9260. Bandwidth
    is unaffected and stays MHz for every network.
    """
    nums = [int(n) for n in re.findall(r'\d+', s or '')]

    freq = None
    if mode == 'earfcn':
        for n in nums:
            if n in LTE_BW or n in BAND_LABELS:
                continue
            for lo, hi, _label in EARFCN_BANDS:
                if lo <= n <= hi:
                    freq = n
                    break
            if freq is not None:
                break
    if freq is None:
        for n in nums:
            if n in BAND_LABELS:
                freq = n
                break
    if freq is None:
        for n in nums:
            for lo, hi, label in EARFCN_BANDS:
                if lo <= n <= hi:
                    freq = label
                    break
            if freq is not None:
                break

    # The LAST legal channel width, not the first: "P3M_..." leads with a 3 that
    # is part of the operator's prefix, while Partner's "700_5_9435" carries its
    # width in the middle and a carrier number at the end.
    bw = None
    for n in nums:
        if n in LTE_BW:
            bw = n

    return freq, bw


TRAILING_NOTE = re.compile(r'^(.*?)\s*\(([^()]*)\)\s*$')


def split_name(v):
    """A site name plus a trailing parenthetical NOTE -> (name, note).

    The IDF export's Description carries RF-team information after the name --
    "sectors 2,3 belong to KD 235" -- and the site-name column is the one a
    commander reads on the slide. Measured rather than assumed: of the 3,129
    site names in the shipped partner.json, 17 contain a parenthesis and ZERO
    end in one, and the ENM name list already uses this exact convention on
    Asaf_M4 and Rafah_M5.
    """
    t = (v or '').strip()
    m = TRAILING_NOTE.match(t)
    if not m or not m.group(1):        # a name that is ONLY a parenthetical
        return t, None
    return m.group(1), (m.group(2).strip() or None)


def count_dupes(rows, key_of):
    seen, n, example = set(), 0, None
    for r in rows:
        k = key_of(r)
        if k in seen:
            n += 1
            if example is None:
                example = k
        else:
            seen.add(k)
    return n, example


def is_antenna_sheet(hdr):
    return ('site id' in hdr and 'antenna id' in hdr and
            ('azimuth' in hdr or 'height (m)' in hdr or 'antenna file' in hdr))


def is_join_sheet(hdr):
    return ('site id' in hdr and 'sector id' in hdr and 'antenna id' in hdr
            and not is_antenna_sheet(hdr))


def is_power_sheet(hdr):
    return 'site id' in hdr and 'sector id' in hdr and 'pa power (dbm)' in hdr


# CRS -- `Reference Signal Power Boosting (dB)`. Beside PA Power on
# LTE_FDD_Sectors in the 2024 Partner export; found by header on its own, like
# power, so a Planet version that moves one does not take the other with it.
CRS_COL = 'reference signal power boosting (db)'


def is_crs_sheet(hdr):
    return 'site id' in hdr and 'sector id' in hdr and CRS_COL in hdr


def is_number(v):
    """num() returns an int for a whole number and a float otherwise, so a
    test against float alone drops PA Power 49 and the IDF export's
    whole-number eastings. bool is excluded because it is an int in Python."""
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def agreed(values):
    """Where the sources agree that is the value; where they DISAGREE, None.

    One sector can be served by several antennas (MIMO) and one antenna by
    several sectors. A confident wrong azimuth on a slide going to an operator
    is worse than a visibly missing one -- the rule the Pelephone bandwidth
    path already follows. Applied per field, so a disagreement about tilt does
    not blank the height.
    """
    out = None
    seen = False
    for v in values:
        if v is None or v == '':
            continue
        if not seen:
            out, seen = v, True
        elif out != v:
            return None
    return out if seen else None


def build_multi(sheets, mode=None):
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
    sites, notes = {}, {}
    for row in s_rows:
        site_id = cell(row, s_hdr, 'site id')
        if not site_id:
            continue
        nm, note = split_name(cell(row, s_hdr, name_col))
        if site_id not in sites or (nm and not sites[site_id]):
            sites[site_id] = nm
            if note:
                notes[site_id] = note
            else:
                notes.pop(site_id, None)

    c_name, c_hdr, c_rows = sec_sheet
    raw, skipped = [], 0
    rows = unknown_band = 0
    band_example = None
    for row in c_rows:
        sec_id = cell(row, c_hdr, 'sector id')
        site_id = cell(row, c_hdr, 'site id')
        if not sec_id or not site_id:
            skipped += 1
            continue
        rows += 1
        sector = cell(row, c_hdr, 'sector')
        band_name = cell(row, c_hdr, 'band name')
        freq, bw = parse_band(band_name, mode)
        # Present but resolving to neither a label nor an EARFCN is a shape
        # nobody here has seen. Leave it blank and count it.
        if freq is None and band_name:
            unknown_band += 1
            if band_example is None:
                band_example = band_name
        if 'frequency (mhz)' in c_hdr:                # explicit beats derived
            freq = num(cell(row, c_hdr, 'frequency (mhz)')) or freq
        if 'bandwidth (mhz)' in c_hdr:
            bw = num(cell(row, c_hdr, 'bandwidth (mhz)')) or bw
        elif 'carrier bandwidth (mhz)' in c_hdr:
            bw = num(cell(row, c_hdr, 'carrier bandwidth (mhz)')) or bw
        raw.append((sec_id, site_id, sector, freq, bw))

    # THE KEY. A repeated Sector ID is not a key -- the second row overwrites
    # the first, and IDF's export numbers sectors 1/2/3 PER SITE, so the plain
    # column collapses a whole network into a handful of rows.
    #
    # <Site ID>_<Sector ID> is tried next, and it is not a guess: that
    # composite IS what Planet's point inspect reports for IDF. Site ID
    # 'IDF_Amitay' and Sector ID '1' give 'IDF_Amitay_1', checked 2026-09-23
    # against the ENM-built idf.json. Only REACHED once the plain key has
    # failed, and only ACCEPTED when itself unique, so the three operators keep
    # the exact path they were verified on.
    dupes, dupe_example = count_dupes(raw, lambda r: r[0])
    composite = False
    if dupes:
        c_dupes, _ = count_dupes(raw, lambda r: '%s_%s' % (r[1], r[0]))
        if not c_dupes:
            composite, dupes, dupe_example = True, 0, None

    sectors = {}
    for sec_id, site_id, sector, freq, bw in raw:
        # With the composite the Sector ID column IS the sector: sector_of()
        # reads the key, and 'IDF_Astra_3_900' would hand it '900'.
        sec = sector or (sec_id if composite else sector_of(sec_id))
        key = '%s_%s' % (site_id, sec_id) if composite else sec_id
        sectors[key] = [site_id, sec or None, freq, bw]

    # A site with no sectors is unreachable by any lookup, so carrying its name
    # only grows a file the browser fetches on every load. Same rule the site
    # editor applies when you remove a site's last sector.
    used = set(v[0] for v in sectors.values())
    dropped = [k for k in sites if k not in used]
    for k in dropped:
        del sites[k]
        notes.pop(k, None)

    # -- the physical plant ------------------------------------------
    # Gathered AFTER the key is chosen: all of it is keyed by sector, and the
    # sector key may be the composite.
    def sec_key(site_id, sec):
        return '%s_%s' % (site_id, sec) if composite else sec

    coords = {}
    if 'longitude' in s_hdr and 'latitude' in s_hdr:
        for row in s_rows:
            site_id = cell(row, s_hdr, 'site id')
            if not site_id or site_id not in sites:
                continue
            x = num(cell(row, s_hdr, 'longitude'))
            y = num(cell(row, s_hdr, 'latitude'))
            # Planet writes WGS84 degrees in one project and projected metres
            # in another under these same headers, so nothing converts here.
            if is_number(x) and is_number(y):
                coords[site_id] = [x, y]

    ant_by = {}
    ant_by_id = {}
    ant_sheet = next((sh for sh in sheets if is_antenna_sheet(sh[1])), None)
    if ant_sheet:
        _, a_hdr, a_rows = ant_sheet
        for row in a_rows:
            site_id = cell(row, a_hdr, 'site id')
            if not site_id:
                continue
            a = [num(cell(row, a_hdr, 'height (m)')),
                 num(cell(row, a_hdr, 'azimuth')),
                 num(cell(row, a_hdr, 'mechanical tilt')),
                 cell(row, a_hdr, 'antenna file') or None]
            ant_id = cell(row, a_hdr, 'antenna id')
            if ant_id not in (None, ''):
                ant_by_id[(site_id, str(ant_id))] = a
            # The Antennas sheet names what it serves, and one antenna can
            # serve several: "1, 3".
            served = cell(row, a_hdr, 'sectors')
            if served in (None, ''):
                continue
            for one in str(served).split(','):
                t = one.strip()
                if t:
                    ant_by.setdefault(sec_key(site_id, t), []).append(a)

    # Older exports state the join on a sheet of its own instead.
    join_sheet = next((sh for sh in sheets if is_join_sheet(sh[1])), None)
    if join_sheet and ant_sheet:
        _, j_hdr, j_rows = join_sheet
        for row in j_rows:
            site_id = cell(row, j_hdr, 'site id')
            sec = cell(row, j_hdr, 'sector id')
            ant_id = cell(row, j_hdr, 'antenna id')
            if not site_id or not sec:
                continue
            a = ant_by_id.get((site_id, str(ant_id)))
            if a:
                ant_by.setdefault(sec_key(site_id, sec), []).append(a)

    ant = {}
    for key, lst in ant_by.items():
        if key not in sectors:                 # an antenna on no sector
            continue
        rowv = [agreed([a[i] for a in lst]) for i in range(4)]
        if any(v is not None for v in rowv):
            ant[key] = rowv

    # PA Power stays in dBm as the workbook states it; watts are a render-time
    # conversion, so the file keeps what Planet actually said.
    pwr_by = {}
    pwr_sheet = next((sh for sh in sheets if is_power_sheet(sh[1])), None)
    if pwr_sheet:
        _, w_hdr, w_rows = pwr_sheet
        for row in w_rows:
            site_id = cell(row, w_hdr, 'site id')
            sec = cell(row, w_hdr, 'sector id')
            if not site_id or not sec:
                continue
            v = num(cell(row, w_hdr, 'pa power (dbm)'))
            if not is_number(v):
                continue
            pwr_by.setdefault(sec_key(site_id, sec), []).append(v)
    pwr = {}
    for key, lst in pwr_by.items():
        if key not in sectors:
            continue
        v = agreed(lst)
        if v is not None:
            pwr[key] = v

    # CRS boost in dB, agreed or nothing -- the same rule as power.
    crs_by = {}
    crs_sheet = next((sh for sh in sheets if is_crs_sheet(sh[1])), None)
    if crs_sheet:
        _, r_hdr, r_rows = crs_sheet
        for row in r_rows:
            site_id = cell(row, r_hdr, 'site id')
            sec = cell(row, r_hdr, 'sector id')
            if not site_id or not sec:
                continue
            v = num(cell(row, r_hdr, CRS_COL))
            if not is_number(v):
                continue
            crs_by.setdefault(sec_key(site_id, sec), []).append(v)
    crs = {}
    for key, lst in crs_by.items():
        if key not in sectors:
            continue
        v = agreed(lst)
        if v is not None:
            crs[key] = v

    desc = ('multi-sheet: sites=%r (name column %r), sectors=%r'
            % (s_name, name_col, c_name))
    if ant or pwr or coords or crs:
        desc += ('\n  plant: %d coords, %d antennas, %d power values, %d CRS values'
                 % (len(coords), len(ant), len(pwr), len(crs)))
    if composite:
        desc += ('\n  key: Site ID + Sector ID (the Sector ID column '
                 'repeats per site, which is how Planet reports it)')
    if notes:
        desc += ('\n  %d site name(s) carry a trailing note, split off'
                 % len(notes))
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
    return sites, notes, sectors, coords, ant, pwr, crs, desc


def build_flat(sheets):
    """Layout B. Returns (sites, sectors, description) or None."""
    for name, hdr, rows in sheets:
        if not all(w in hdr for w in WANT):
            continue
        sites, notes, sectors, skipped = {}, {}, {}, 0
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
            nm, note = split_name(cell(row, hdr, 'site name'))
            if site_id not in sites or (nm and not sites[site_id]):
                sites[site_id] = nm
                if note:
                    notes[site_id] = note
                else:
                    notes.pop(site_id, None)
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
        # Six columns, none of them plant: a legacy workbook imports exactly
        # as it always did.
        return sites, notes, sectors, {}, {}, {}, {}, desc
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

    mode = 'earfcn' if network in EARFCN_NETS else None
    built = build_flat(sheets) or build_multi(sheets, mode)
    if not built:
        sys.exit('No usable layout. Needs EITHER one sheet carrying\n  %s\n'
                 'OR a Planet group export with a Sites sheet (Site ID + a '
                 'name column)\nand a Sectors sheet (Sector ID + Site ID + '
                 'Band Name).' % ' | '.join(WANT))
    sites, notes, sectors, coords, ant, pwr, crs, desc = built
    print('layout: %s' % desc)

    out = {
        'network': network,
        'label': LABELS[network],
        'source': os.path.basename(xlsx),
        'built': datetime.date.today().isoformat(),
        'sites': sites,
        'sectors': sectors,
    }
    # Optional, and each omitted when empty, so a database with none of them
    # stays byte-identical to one built before they existed.
    for key, val in (('notes', notes), ('coords', coords),
                     ('ant', ant), ('pwr', pwr), ('crs', crs)):
        if val:
            out[key] = val
    os.makedirs(DATA, exist_ok=True)
    dest = os.path.join(DATA, '%s.json' % network)
    if os.path.exists(dest):                       # the .bak has saved this
        with open(dest, 'rb') as fh:               # database twice already
            prev = fh.read()
        with open(dest + '.bak', 'wb') as fh:
            fh.write(prev)
    with open(dest, 'w', encoding='utf8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))

    # The same verification the import toast performs, and the reason
    # build_idf.py printed both lines: '9260, 3525 (700, 900)' is obviously
    # right, and a band column read as an EARFCN would not be.
    freqs = sorted({v[2] for v in sectors.values() if v[2] is not None})
    line = ', '.join(str(f) for f in freqs) or '-'
    if mode == 'earfcn':
        bands = sorted({b for b in (band_of(f) for f in freqs) if b})
        if bands:
            line += ' (%s)' % ', '.join(str(b) for b in bands)
    print('freqs:   %s' % line)
    print('sites:   %6d' % len(sites))
    print('sectors: %6d' % len(sectors))
    print('wrote:   %s  (%.1f KB)' % (dest, os.path.getsize(dest) / 1024.0))


if __name__ == '__main__':
    main()
