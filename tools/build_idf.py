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

# The cell number ENM writes in front of a cell's id: `4_Hadas_1` is cell 4 of
# the baseband, serving sector 1 at Hadas. Both separators occur -- `_` under
# Nahal_Sion, `-` under Kirya_2.
SLOT = re.compile(r'^\d+[-_]')

# Sites carried on ANOTHER site's baseband -- "אתר משורשר": an RRU standing at
# the site named here, fibred back to a baseband elsewhere. ENM names such a
# cell after the site the antenna is on and hangs it under the baseband's
# NodeId, so the node says where the electronics are and the cell id says where
# the radio is.
#
# This list is CONFIRMED WITH THE TEAM, never inferred, because nothing in the
# dump tells a chained site apart from a cell merely NAMED after what it points
# at. Both look identical from here, and four of the eight candidates the id
# shapes suggest turned out not to be chained at all (2026-09-10):
#   Kirya_2's 1-Aman_1 / 2-Agat_2 / 3-Asiya_3 are three sectors of קרייה 2
#     pointed at three buildings -- and Aman is אמ"ן, which the name list
#     already carries as a suffix at Kisufim_Aman and Yarkon_Aman.
#   Petel_296's Petel_002_* cells are a renumbering the cell names never
#     followed, not a second site.
# build() prints every candidate NOT listed here, so one that arrives in a
# later dump is a line to check rather than a silent wrong site on a slide.
CHAINED = {'Hadas', 'Zivanit', 'KD27', 'Ido'}


def flat(s):
    """Separator- and case-insensitive form, for comparing a cell id to a node."""
    return s.lower().replace('_', '').replace('-', '')


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


def stem_of(cell):
    """The site a cell id names, with ENM's decorations stripped.

        4_Hadas_1      -> Hadas          (slot prefix, then the sector)
        6_Hadas_3_900  -> Hadas          (_900 is the band, never a sector)
        KD27_5         -> KD27
        Halif_11_SL_1  -> Halif_11_SL
    """
    stem = SLOT.sub('', cell)
    stem = re.sub(r'_900$', '', stem)      # band suffix, never a sector
    return re.sub(r'_\d+$', '', stem)      # the sector


def names_own_node(cell, node):
    """Is this cell named after the node it hangs under?

    MMSL_Takti4_SL_1 sits under MMSL_Takti_4_SL -- a missing underscore, not a
    second site. Comparing with the separators removed keeps a typo from
    forking one site into two.
    """
    stem = stem_of(cell)
    return not stem or flat(stem) in (flat(node), flat(VARIANT.sub('', node)))


def site_of(cell, node):
    """Which SITE the antenna stands on -- not which baseband carries it.

        4_Hadas_1     under node Nahal_Sion    -> Hadas        (chained)
        KD27_5        under node Mizpe_Zor     -> KD27         (chained)
        1-Aman_1      under node Kirya_2       -> Kirya_2      (a sector name)
        Halif_11_SL_1 under node Halif_11_SL   -> Halif_11_SL  (ordinary)

    The deck answers "which site serves this point", and the answer is where
    the antenna is, not where its electronics sit. Attributing a chained cell
    to its baseband printed נחל שיאון on a slide for a point served by the mast
    at הדס -- an exact-looking row naming the wrong site, and not even tagged
    approximate, because the cell id itself matched.

    Only a cell whose site is in CHAINED moves. A chained cell that was named
    after its baseband anyway is invisible here, and no rule can recover it.
    """
    if names_own_node(cell, node):
        return node
    stem = stem_of(cell)
    return stem if stem in CHAINED else node


def build(dump_path, names_path):
    rows = load_dump(dump_path)
    pats, singles = load_names(names_path) if names_path else ({}, {})

    by_cell = defaultdict(list)
    for r in rows:
        by_cell[r['EUtranCellFDDId']].append(r)

    sites, sectors = {}, {}
    unnamed, no_band, conflicts = set(), 0, []
    bands_seen = {}
    chained = {}          # chained site   -> {baseband node: cells carried}
    candidates = {}       # unlisted stem  -> the node it hangs under

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
        # Where the antenna is, which is not always the node the cell hangs
        # under -- see site_of().
        site = site_of(cell, node)
        if site != node:
            on = chained.setdefault(site, {})
            on[node] = on.get(node, 0) + 1
        elif not names_own_node(cell, node):
            # Named after somewhere else but not confirmed chained. Reported,
            # so the next dump's new ones get asked about rather than assumed.
            candidates.setdefault(stem_of(cell), set()).add(node)
        base = VARIANT.sub('', site)
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

        sites[site] = heb
        sectors[cell] = [site, sector_of(cell, node), earfcn, bw]
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
    }, unnamed, no_band, conflicts, bands_seen, chained, candidates


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    dump = sys.argv[1]
    names = sys.argv[2] if len(sys.argv) > 2 else None
    db, unnamed, no_band, conflicts, bands_seen, chained, candidates = build(dump, names)

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
    if chained:
        print('chained : %d sites -- the antenna stands here, the baseband is '
              'elsewhere:' % len(chained))
        for s in sorted(chained):
            # The cells that MOVED, not the site's total -- KD27 has four of
            # its own on its own baseband and one carried by Mizpe_Zor.
            total = sum(1 for v in db['sectors'].values() if v[0] == s)
            for node in sorted(chained[s]):
                print('            %-20s %d of its %d cells on %s'
                      % (s, chained[s][node], total, node))
    if candidates:
        # Cells named after somewhere other than their node, which CHAINED does
        # not list. Each is either a sector named after what it points at (fine)
        # or a chained site nobody has told this tool about (a wrong site on a
        # commander's slide). Only the team can say which, so they are named
        # here on every build rather than resolved by a guess.
        print('CHECK   : %d cell names disagree with their node and are NOT in '
              'CHAINED -- sector names, or chained sites to add?' % len(candidates))
        for s in sorted(candidates):
            print('            %-20s on %s' % (s, ', '.join(sorted(candidates[s]))))
    if unnamed:
        print('NOTE    : %d sites have no Hebrew name and fall back to their '
              'Latin id:' % len(unnamed))
        for n in sorted(unnamed):
            print('            %s' % n)


if __name__ == '__main__':
    main()
