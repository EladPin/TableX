#!/usr/bin/env python3
"""Planet network export (.xlsx) -> TableX/data/<network>.json

    python tools/build_db.py partner TableX/DB/DEMO_DB.xlsx
    python tools/build_db.py idf     path\\to\\idf_sites.xlsx
    python tools/build_db.py cellcom path\\to\\cellcom.xlsx

Stdlib only -- an .xlsx is a zip of XML -- so this runs anywhere Python does,
same as Interfex's tools/build_cell_map.py.

The sheet is found by its HEADERS, not its name, so a future export that
renames the tab still converts. Required headers (case/space-insensitive):

    Sector ID | Site ID | Site Name | Sector | Frequency (MHz) | Bandwidth (MHz)

Output shape -- names are deduplicated per site, which matters because a site
carries up to 9 sectors and the Hebrew name is the longest field:

    {
      "network": "partner",
      "label":   "Partner",
      "source":  "DEMO_DB.xlsx",
      "built":   "2026-09-04",
      "sites":   { "MN4610A": "גג בית העם  דישון" },
      "sectors": { "LNN4610Da": ["MN4610A", "Da", 1800, 20] }
    }

The app keys on sector id (what Planet's point analysis reports) and falls back
to site id, flagging that row as approximate.
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

WANT = ['sector id', 'site id', 'site name', 'sector',
        'frequency (mhz)', 'bandwidth (mhz)']


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


def find_sheet(zf, sst):
    """Return (path, {header: column index}) for the first sheet carrying all
    the required headers in one of its first few rows."""
    sheets = sorted(n for n in zf.namelist()
                    if re.match(r'xl/worksheets/sheet\d+\.xml$', n))
    for path in sheets:
        for depth, row in enumerate(rows_of(zf, path, sst)):
            if depth > 4:
                break
            norm = {re.sub(r'\s+', ' ', c).strip().lower(): i
                    for i, c in enumerate(row) if c}
            if all(w in norm for w in WANT):
                return path, norm
    return None, None


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
    path, cols = find_sheet(zf, sst)
    if not path:
        sys.exit('No sheet carries all required headers:\n  %s'
                 % '\n  '.join(WANT))
    print('sheet: %s' % path)

    sites, sectors, skipped = {}, {}, 0
    header_seen = False
    for row in rows_of(zf, path, sst):
        get = lambda k: row[cols[k]] if cols[k] < len(row) else ''
        if not header_seen:                       # the header row itself
            if get('site id').strip().lower() == 'site id':
                header_seen = True
                continue
        sec_id, site_id = get('sector id'), get('site id')
        if not sec_id or not site_id:
            skipped += 1
            continue
        name = get('site name')
        if site_id not in sites or (name and not sites[site_id]):
            sites[site_id] = name
        sectors[sec_id] = [site_id, get('sector') or None,
                           num(get('frequency (mhz)')), num(get('bandwidth (mhz)'))]

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
    with open(dest, 'w', encoding='utf8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))

    print('sites:   %6d' % len(sites))
    print('sectors: %6d' % len(sectors))
    if skipped:
        print('skipped: %6d (no sector id or no site id)' % skipped)
    print('wrote:   %s  (%.1f KB)' % (dest, os.path.getsize(dest) / 1024.0))


if __name__ == '__main__':
    main()
