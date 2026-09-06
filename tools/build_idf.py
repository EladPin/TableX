"""ENM CLI dump -> TableX/data/idf.json   (stdlib only, like build_db.py)

IDF is the one network that does NOT come from a Planet group export. Its Planet
export numbers sectors 1/2/3 per site, so the sector code is not a key at all --
see CLAUDE.md, "What the other three exports actually look like". The source is
an ENM CLI dump instead, plus a hand-written name list, because the dump carries
no Hebrew.

    python tools/build_idf.py D:/IDF_DB_FOR_CLAUDE/IDF_DB.txt \
                              D:/IDF_DB_FOR_CLAUDE/NAMES_TO_FILL_FILLED.txt

The dump's header block is written vertically, one field per line, and the data
rows follow tab-separated:

    NodeId  syncStatus  ENodeBFunctionId  EUtranCellFDDId  administrativeState
    dlChannelBandwidth  earfcndl  operationalState  physicalLayerCellId ...

Keyed by EUtranCellFDDId, because that is exactly what Planet's point inspect
reports: `IDF_Halif_11_SL_1` is `IDF_` + the cell id, verified 2026-09-06.
"""

import io
import json
import os
import re
import sys
from collections import defaultdict

LABEL = 'IDF'

# 3GPP 36.101 downlink EARFCN ranges -> the band label. IDF does NOT print
# these: its table column carries the raw EARFCN (see build()). They are derived
# anyway, because a band distribution of 700/900/2600 is obviously right and
# 1400/2850/9360 is obviously an EARFCN column misread as MHz -- the same
# check the import toast performs for the workbook path. Kept byte-identical to
# EARFCN_BANDS in TableX/js/dbparse.js; change both together.
EARFCN_BANDS = [
    (0, 599, 2100), (1200, 1949, 1800), (2400, 2649, 850), (2750, 3449, 2600),
    (3450, 3799, 900), (6150, 6449, 800), (9210, 9659, 700),
    (37750, 38249, 2600), (38650, 39649, 2300),
]

# _SL / _T are variants of one physical site and share its Hebrew name, decided
# 2026-09-06 (Halif_7_SL is the same place as Halif_7).
VARIANT = re.compile(r'_(SL|T)$')


def band_of(earfcn):
    for lo, hi, label in EARFCN_BANDS:
        if lo <= earfcn <= hi:
            return label
    return None


def read_text(path):
    """Excel writes 'Unicode Text' as UTF-16; the CSV path gives UTF-8 w/ BOM."""
    raw = open(path, 'rb').read()
    for enc in ('utf-16', 'utf-8-sig', 'utf-8', 'cp1255'):
        if enc == 'utf-16' and raw[:2] not in (b'\xff\xfe', b'\xfe\xff'):
            continue
        try:
            return raw.decode(enc)
        except (UnicodeDecodeError, UnicodeError):
            continue
    raise SystemExit('cannot decode %s' % path)


def unquote(s):
    """Undo Excel's CSV quoting: '"\u05de\u05e6\u05e4""\u05e9"' -> '\u05de\u05e6\u05e4"\u05e9'.

    Without this the doubled quote reaches the slide verbatim, which is a
    visible defect in a commander-facing table rather than a cosmetic one.
    """
    s = s.strip()
    if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        s = s[1:-1].replace('""', '"')
    return s.strip()


def load_dump(path):
    """-> list of dicts, one per EUtranCellFDD row."""
    cols, rows = [], []
    for line in read_text(path).replace('\r', '').split('\n'):
        if '\t' in line:
            rows.append(line.split('\t'))
        elif line.strip():
            cols.append(line.strip())
    if not cols or not rows:
        raise SystemExit('%s: no header block or no data rows' % path)
    # the first header line is the SubNetwork path, not a column
    cols = cols[1:]
    out = []
    for r in rows:
        if len(r) < len(cols):
            continue
        out.append(dict(zip(cols, r)))
    return out


def load_names(path):
    """-> (patterns {stem: template}, singles {base: name})."""
    pats, singles = {}, {}
    lines = [l for l in read_text(path).replace('\r', '').split('\n') if l.strip()]
    sep = '\t' if '\t' in lines[0] else ','
    hdr = [h.strip().lower() for h in lines[0].split(sep)]
    try:
        ik, ih = hdr.index('key'), hdr.index('hebrew')
    except ValueError:
        raise SystemExit('%s: need "key" and "hebrew" columns, got %s' % (path, hdr))
    it = hdr.index('type') if 'type' in hdr else None
    for line in lines[1:]:
        f = line.split(sep)
        if len(f) <= max(ik, ih):
            continue
        key, heb = unquote(f[ik]), unquote(f[ih])
        if not heb:
            continue
        kind = unquote(f[it]).upper() if it is not None and len(f) > it else ''
        if kind == 'FAMILY' or '{N}' in key:
            pats[key.replace('{N}', '').rstrip('_')] = heb
        else:
            singles[key] = heb
    return pats, singles


def split_num(base):
    """'MMSL_Takti_14' -> ('MMSL_Takti', '14');  'Astra' -> ('Astra', None)."""
    m = re.match(r'^(.*?)_?(\d+)$', base)
    return (m.group(1), m.group(2)) if m and m.group(1) else (base, None)


def name_for(base, pats, singles):
    """A singleton name wins over a family pattern; Latin id is the fallback."""
    if base in singles:
        return singles[base]
    stem, num = split_num(base)
    if num is not None and stem in pats:
        # T_014_BB is written "\u05ea\u05e7"\u05e9 14", so the leading zeros are dropped.
        return pats[stem].replace('{N}', str(int(num)))
    return None


def sector_of(cell, node):
    """The sector is the TRAILING number of the cell id.

    'Halif_11_SL_1' under node 'Halif_11_SL'   -> '1'
    'Astra_3_900'   under node 'Astra'         -> '3'   (900 is the band)
    'Ido_1'         under node 'Hermon_IL'     -> '1'   (names diverge)
    'G_004_2'       under node 'G_004_T'       -> '2'

    Trailing, not leading: 88 cells are not prefixed by their own NodeId, and
    reading forwards from those picks the site number out of the middle of the
    name -- G_004_2 became sector "004" and MMSL_1005_1 became "1005".
    """
    # _900 is the only band suffix in the dump (45 cells) and is never a sector.
    stem = re.sub(r'_900$', '', cell)
    m = re.search(r'(\d+)$', stem)
    if m:
        return m.group(1)
    m = re.search(r'_([^_]+)$', stem)
    return m.group(1) if m else stem


def build(dump_path, names_path):
    rows = load_dump(dump_path)
    pats, singles = load_names(names_path) if names_path else ({}, {})

    by_cell = defaultdict(list)
    for r in rows:
        by_cell[r['EUtranCellFDDId']].append(r)

    sites, sectors = {}, {}
    unnamed, no_band, conflicts = set(), 0, []
    bands_seen = {}

    for cell, cands in sorted(by_cell.items()):
        # The cell id alone is not unique: 51 ids sit under 2-3 nodes
        # (G_006 / G_006_SL / G_006_T). Planet reports only the cell id, so one
        # row has to win. Prefer an ENABLED cell, then the node the cell id is
        # actually named after -- deterministic either way.
        if len(cands) > 1:
            live = [c for c in cands if c.get('operationalState') == 'ENABLED']
            pool = live or cands
            pool = sorted(pool, key=lambda c: (not cell.startswith(c['NodeId']),
                                               c['NodeId']))
            if len({(c['earfcndl'], c['dlChannelBandwidth']) for c in live}) > 1:
                conflicts.append(cell)
            row = pool[0]
        else:
            row = cands[0]

        node = row['NodeId']
        base = VARIANT.sub('', node)
        heb = name_for(base, pats, singles)
        if heb is None:
            unnamed.add(base)
            heb = base

        try:
            earfcn = int(row['earfcndl'])
        except (ValueError, KeyError):
            earfcn = None
        # The band label is still derived, but only to VERIFY the dump at build
        # time -- see the *_900 check in the summary. What IDF actually prints
        # is the raw EARFCN, by request 2026-09-06: the team reads ENM, and
        # 9335 is the number they recognise. Partner still prints MHz, so a
        # mixed point shows both units in one column.
        band = band_of(earfcn) if earfcn is not None else None
        if band is None:
            no_band += 1
        try:
            bw = int(row['dlChannelBandwidth']) // 1000
        except (ValueError, KeyError):
            bw = None

        sites[node] = heb
        sectors[cell] = [node, sector_of(cell, node), earfcn, bw]
        bands_seen[band] = bands_seen.get(band, 0) + 1

    # A site no sector points at is unreachable by any lookup -- the same rule
    # build_db.py and the site editor apply.
    used = {v[0] for v in sectors.values()}
    sites = {k: v for k, v in sites.items() if k in used}

    return {
        'network': 'idf',
        'label': LABEL,
        'source': os.path.basename(dump_path),
        'built': __import__('datetime').date.today().isoformat(),
        'sites': sites,
        'sectors': sectors,
    }, unnamed, no_band, conflicts, bands_seen


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    dump = sys.argv[1]
    names = sys.argv[2] if len(sys.argv) > 2 else None
    db, unnamed, no_band, conflicts, bands_seen = build(dump, names)

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, 'TableX', 'data', 'idf.json')
    if os.path.exists(out):
        with open(out, 'rb') as f:
            prev = f.read()
        if prev.strip():
            with open(out + '.bak', 'wb') as f:
                f.write(prev)

    # Never Set-Content/Out-File equivalents here: no BOM, or JSON.parse chokes.
    with io.open(out, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(db, f, ensure_ascii=False, separators=(',', ':'))

    earfcns = sorted({v[2] for v in db['sectors'].values() if v[2]})
    bands = sorted(b for b in bands_seen if b)
    print('sites   : %d' % len(db['sites']))
    print('sectors : %d' % len(db['sectors']))
    print('earfcns : %s   (printed in the table)'
          % ', '.join(str(e) for e in earfcns))
    # Derived only to check the dump: obviously-right band labels mean the
    # EARFCN column was read as an EARFCN. 1400/2850/9360 would mean it wasn't.
    print('bands   : %s   (derived, for verification only)'
          % ', '.join(str(b) for b in bands))
    print('wrote   : %s' % out)
    if no_band:
        print('WARNING : %d sectors have no frequency' % no_band)
    if conflicts:
        print('NOTE    : %d cell ids are ambiguous across nodes with differing '
              'freq/bw; one was chosen deterministically' % len(conflicts))
    if unnamed:
        print('NOTE    : %d sites have no Hebrew name and fall back to their '
              'Latin id:' % len(unnamed))
        for n in sorted(unnamed):
            print('            %s' % n)


if __name__ == '__main__':
    main()
