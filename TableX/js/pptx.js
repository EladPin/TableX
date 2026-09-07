/* ═══════════════════════════════════════════════════════════════════
   PPTX — read a PowerPoint file, and fill it in.

   THE ONE IDEA THIS FILE IS BUILT ON: we never re-author the deck.

   The obvious way to build a template system is to read a .pptx, learn
   what it contains, and generate a new one that looks like it. That way
   loses every time. A real deck carries a theme, slide masters, layouts,
   fonts, gradients, grouped vector logos, animations, speaker notes and
   a unit's branding — and a rebuild reproduces the 10% we understood and
   silently drops the rest. What comes out is *like* the deck, and being
   "like" the deck is exactly what makes it unusable in front of a
   commander.

   So the template IS the uploaded file. It is kept whole, and generating
   a deck only ever:
     · adds media parts and the relationships that point at them,
     · inserts <p:pic> / <p:graphicFrame> into a slide's <p:spTree>,
     · clones, drops or reorders entries in <p:sldIdLst>.
   Everything we did not touch survives because we never touched it. The
   output is the user's own deck with the pictures dropped in, not an
   imitation of it.

   That also means this file can be ignorant. It has to understand slide
   size, the slide list, shape rectangles and the relationship graph —
   and nothing else. A shape it cannot read is a shape it leaves alone.

   Preview fidelity is a separate, lower bar: the preview exists so the
   user can point at a place on a slide, so it draws backgrounds,
   pictures, text boxes and groups, and stops there.

   JSZip comes from js/pptxgen.bundle.js, which already puts it on
   `window` — the deck writer we vendored for the table export turns out
   to carry the zip reader too, so this cost no new dependency.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const EMU_IN = 914400;          // English Metric Units per inch
  const NS = {
    p:  'http://schemas.openxmlformats.org/presentationml/2006/main',
    a:  'http://schemas.openxmlformats.org/drawingml/2006/main',
    r:  'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
    pr: 'http://schemas.openxmlformats.org/package/2006/relationships',
  };
  const REL = {
    slide:  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
    layout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
    master: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
    theme:  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
    image:  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
    notes:  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
  };
  const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

  const MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    bmp: 'image/bmp', tiff: 'image/tiff', emf: 'image/x-emf', wmf: 'image/x-wmf',
    svg: 'image/svg+xml', webp: 'image/webp',
  };

  /* ── xml + package plumbing ────────────────────────────────────── */

  const parser = new DOMParser();
  function parseXml(s) {
    const d = parser.parseFromString(s, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('bad XML');
    return d;
  }
  const serialize = d => DECL + new XMLSerializer().serializeToString(d.documentElement);

  const first = (el, ns, name) => el ? el.getElementsByTagNameNS(ns, name)[0] || null : null;
  const all = (el, ns, name) => el ? [...el.getElementsByTagNameNS(ns, name)] : [];

  // "ppt/slides/slide1.xml" + "../media/image2.png" -> "ppt/media/image2.png"
  function resolvePath(from, target) {
    if (/^[a-z]+:/i.test(target)) return null;          // external link
    if (target.startsWith('/')) return target.slice(1);
    const base = from.split('/').slice(0, -1);
    for (const seg of target.split('/')) {
      if (seg === '.') continue;
      if (seg === '..') base.pop(); else base.push(seg);
    }
    return base.join('/');
  }
  const relsPathFor = part => {
    const i = part.lastIndexOf('/');
    return part.slice(0, i) + '/_rels' + part.slice(i) + '.rels';
  };

  async function readXml(zip, path) {
    const f = zip.file(path);
    return f ? parseXml(await f.async('string')) : null;
  }

  // rId -> { target (zip path), type, raw }
  async function readRels(zip, part) {
    const doc = await readXml(zip, relsPathFor(part));
    const map = Object.create(null);
    if (!doc) return map;
    for (const el of all(doc, NS.pr, 'Relationship')) {
      const raw = el.getAttribute('Target');
      map[el.getAttribute('Id')] = {
        raw, type: el.getAttribute('Type'),
        target: el.getAttribute('TargetMode') === 'External' ? null : resolvePath(part, raw),
      };
    }
    return map;
  }

  const relOfType = (rels, type) => {
    for (const id in rels) if (rels[id].type === type) return rels[id];
    return null;
  };

  /* ── colours ───────────────────────────────────────────────────────
     A slide's background is usually `<a:schemeClr val="bg1"/>`, which
     means nothing on its own: it is resolved through the master's
     <p:clrMap> and then the theme's <a:clrScheme>. Following that chain
     is the difference between previewing a unit's dark blue deck and
     previewing a white rectangle. */
  function schemeToHex(theme, clrMap, name) {
    if (!theme) return null;
    const mapped = (clrMap && clrMap[name]) || name;
    const scheme = first(theme, NS.a, 'clrScheme');
    const node = scheme && scheme.getElementsByTagNameNS(NS.a, mapped)[0];
    if (!node) return null;
    const srgb = first(node, NS.a, 'srgbClr');
    if (srgb) return '#' + srgb.getAttribute('val');
    const sys = first(node, NS.a, 'sysClr');
    if (sys) return '#' + (sys.getAttribute('lastClr') || '000000');
    return null;
  }

  // Reads whatever fill element it is handed. Gradients collapse to their
  // first stop — enough to place a rectangle against, which is all the
  // preview is for.
  function fillColor(el, theme, clrMap) {
    if (!el) return null;
    const solid = first(el, NS.a, 'solidFill') ||
                  (first(el, NS.a, 'gsLst') ? first(first(el, NS.a, 'gsLst'), NS.a, 'gs') : null);
    const src = solid || el;
    const srgb = first(src, NS.a, 'srgbClr');
    if (srgb) return '#' + srgb.getAttribute('val');
    const sch = first(src, NS.a, 'schemeClr');
    if (sch) return schemeToHex(theme, clrMap, sch.getAttribute('val'));
    return null;
  }

  /* ── geometry ────────────────────────────────────────────────────── */

  function xfrmOf(shape) {
    // A shape and a group carry <a:xfrm> inside spPr/grpSpPr, but a
    // graphicFrame — a table or a chart — carries <p:xfrm> as a direct
    // child, in the PRESENTATION namespace. Looking only in the drawingml
    // one skipped every table in a template silently, so it never appeared
    // in the preview. The p: form is checked first because a chart's own
    // drawing can contain a nested <a:xfrm> that would win otherwise.
    const x = first(shape, NS.p, 'xfrm') || first(shape, NS.a, 'xfrm');
    if (!x) return null;
    const off = first(x, NS.a, 'off'), ext = first(x, NS.a, 'ext');
    if (!off || !ext) return null;
    return {
      x: +off.getAttribute('x') || 0, y: +off.getAttribute('y') || 0,
      w: +ext.getAttribute('cx') || 0, h: +ext.getAttribute('cy') || 0,
      rot: (+x.getAttribute('rot') || 0) / 60000,
      chOff: first(x, NS.a, 'chOff'), chExt: first(x, NS.a, 'chExt'),
    };
  }

  // A group remaps its children's coordinate space: a child at chOff maps
  // to the group's off, scaled by ext/chExt. Without this every grouped
  // logo previews at the wrong place, usually off-slide.
  function groupMapper(g) {
    const co = g.chOff, ce = g.chExt;
    if (!co || !ce) return p => p;
    const ox = +co.getAttribute('x') || 0, oy = +co.getAttribute('y') || 0;
    const cw = +ce.getAttribute('cx') || 1, ch = +ce.getAttribute('cy') || 1;
    const sx = g.w / (cw || 1), sy = g.h / (ch || 1);
    return p => ({
      x: g.x + (p.x - ox) * sx, y: g.y + (p.y - oy) * sy,
      w: p.w * sx, h: p.h * sy, rot: p.rot,
    });
  }

  const textOf = sp => all(sp, NS.a, 't').map(t => t.textContent).join('').trim();

  // Enough of the first run's formatting for the preview to look like the
  // slide rather than like a wireframe of it: size, colour, alignment.
  // `sz` is hundredths of a point.
  function textStyle(sp, theme, clrMap) {
    const rPr = first(sp, NS.a, 'rPr') || first(sp, NS.a, 'defRPr');
    const pPr = first(sp, NS.a, 'pPr');
    return {
      fontPt: rPr && rPr.getAttribute('sz') ? +rPr.getAttribute('sz') / 100 : null,
      color: rPr ? fillColor(rPr, theme, clrMap) : null,
      align: pPr ? pPr.getAttribute('algn') : null,
      bold: !!(rPr && rPr.getAttribute('b') === '1'),
    };
  }

  /* ── the deck ──────────────────────────────────────────────────── */

  async function open(data, name) {
    const zip = await global.JSZip.loadAsync(data);
    if (!zip.file('ppt/presentation.xml')) {
      throw new Error('not-pptx');
    }
    const pres = await readXml(zip, 'ppt/presentation.xml');
    const presRels = await readRels(zip, 'ppt/presentation.xml');

    const sz = first(pres, NS.p, 'sldSz');
    const deck = {
      zip, name: name || 'deck.pptx',
      cx: sz ? +sz.getAttribute('cx') : 9144000,
      cy: sz ? +sz.getAttribute('cy') : 6858000,
      slides: [], _urls: [],
    };

    // Deck ORDER is <p:sldIdLst>, not the file names — slide7.xml can be
    // the second slide. Everything downstream indexes by this list.
    const lst = first(pres, NS.p, 'sldIdLst');
    for (const el of all(lst, NS.p, 'sldId')) {
      const rid = el.getAttributeNS(NS.r, 'id');
      const rel = presRels[rid];
      if (!rel || !rel.target) continue;
      deck.slides.push({ id: el.getAttribute('id'), rid, path: rel.target });
    }
    return deck;
  }

  /* A slide, flattened into rectangles the preview can draw. Coordinates
     stay in EMU; the view scales them. */
  async function slideModel(deck, index) {
    const s = deck.slides[index];
    if (!s) return null;
    const zip = deck.zip;
    const doc = await readXml(zip, s.path);
    const rels = await readRels(zip, s.path);

    // theme + colour map come down the layout -> master -> theme chain
    let clrMap = null, theme = null, layoutDoc = null, masterDoc = null;
    let layoutPath = null, masterPath = null;
    const lRel = relOfType(rels, REL.layout);
    if (lRel && lRel.target) {
      layoutPath = lRel.target;
      layoutDoc = await readXml(zip, layoutPath);
      const lRels = await readRels(zip, layoutPath);
      const mRel = relOfType(lRels, REL.master);
      if (mRel && mRel.target) {
        masterPath = mRel.target;
        masterDoc = await readXml(zip, masterPath);
        const cm = first(masterDoc, NS.p, 'clrMap');
        if (cm) {
          clrMap = {};
          for (const at of cm.attributes) clrMap[at.name] = at.value;
        }
        const mRels = await readRels(zip, mRel.target);
        const tRel = relOfType(mRels, REL.theme);
        if (tRel && tRel.target) theme = await readXml(zip, tRel.target);
      }
    }

    const model = { w: deck.cx, h: deck.cy, bg: null, shapes: [] };

    // background: slide, else layout, else master — the usual place a
    // deck's identity actually lives
    // A background image is relative to the part that DECLARES it, so the
    // owning path has to travel with the document down the chain.
    for (const [d, owner] of [[doc, s.path], [layoutDoc, layoutPath], [masterDoc, masterPath]]) {
      if (!d || model.bg) continue;
      const bg = first(first(d, NS.p, 'cSld'), NS.p, 'bg');
      if (!bg) continue;
      const blip = first(bg, NS.a, 'blip');
      if (blip) {
        const src = await mediaUrl(deck, owner, blip.getAttributeNS(NS.r, 'embed'));
        if (src) { model.bg = { image: src }; continue; }
      }
      const c = fillColor(bg, theme, clrMap);
      if (c) model.bg = { color: c };
    }

    const tree = first(first(doc, NS.p, 'cSld'), NS.p, 'spTree');
    await walk(tree, p => p, 0);

    async function walk(node, map, depth) {
      if (!node || depth > 6) return;
      for (const el of node.children) {
        const ln = el.localName;
        if (ln === 'grpSp') {
          const g = xfrmOf(first(el, NS.p, 'grpSpPr'));
          if (!g) continue;
          const inner = groupMapper(g);
          await walk(el, p => map(inner(p)), depth + 1);
        } else if (ln === 'pic') {
          const g = xfrmOf(first(el, NS.p, 'spPr'));
          if (!g) continue;
          const blip = first(el, NS.a, 'blip');
          const rid = blip && blip.getAttributeNS(NS.r, 'embed');
          model.shapes.push(Object.assign(map(g), {
            kind: 'pic', src: rid ? await mediaUrl(deck, s.path, rid) : null,
          }));
        } else if (ln === 'sp') {
          const g = xfrmOf(first(el, NS.p, 'spPr'));
          if (!g) continue;
          model.shapes.push(Object.assign(map(g), textStyle(el, theme, clrMap), {
            kind: 'sp', text: textOf(el),
            fill: fillColor(first(el, NS.p, 'spPr'), theme, clrMap),
          }));
        } else if (ln === 'graphicFrame') {
          const g = xfrmOf(el);
          if (!g) continue;
          model.shapes.push(Object.assign(map(g), {
            kind: first(el, NS.a, 'tbl') ? 'table' : 'frame',
          }));
        }
      }
    }
    return model;
  }

  // Blob URLs are cached per deck and released together, so a preview that
  // is re-rendered on every drag does not leak one image per frame.
  const urlCache = new WeakMap();
  async function mediaUrl(deck, part, rid) {
    if (!part || !rid) return null;
    const rels = await readRels(deck.zip, part);
    const rel = rels[rid];
    if (!rel || !rel.target) return null;
    let cache = urlCache.get(deck);
    if (!cache) urlCache.set(deck, cache = new Map());
    if (cache.has(rel.target)) return cache.get(rel.target);
    const f = deck.zip.file(rel.target);
    if (!f) return null;
    const ext = rel.target.split('.').pop().toLowerCase();
    const url = URL.createObjectURL(new Blob([await f.async('arraybuffer')],
                                            { type: MIME[ext] || 'application/octet-stream' }));
    cache.set(rel.target, url);
    return url;
  }

  function release(deck) {
    const cache = urlCache.get(deck);
    if (!cache) return;
    for (const u of cache.values()) URL.revokeObjectURL(u);
    urlCache.delete(deck);
  }

  /* ── writing ───────────────────────────────────────────────────── */

  // Every part that carries content needs a content type. Images are
  // declared once per extension as a <Default>; a missing Default is the
  // classic "PowerPoint found a problem" repair prompt.
  async function ensureDefault(zip, ext) {
    const path = '[Content_Types].xml';
    const doc = await readXml(zip, path);
    if (!doc) return;
    const e = ext.toLowerCase();
    for (const d of all(doc, NS.ct, 'Default')) {
      if ((d.getAttribute('Extension') || '').toLowerCase() === e) return;
    }
    const el = doc.createElementNS(NS.ct, 'Default');
    el.setAttribute('Extension', e);
    el.setAttribute('ContentType', MIME[e] || 'application/octet-stream');
    doc.documentElement.insertBefore(el, doc.documentElement.firstChild);
    zip.file(path, serialize(doc));
  }

  async function addOverride(zip, part, type) {
    const path = '[Content_Types].xml';
    const doc = await readXml(zip, path);
    if (!doc) return;
    const name = '/' + part;
    for (const o of all(doc, NS.ct, 'Override')) {
      if (o.getAttribute('PartName') === name) return;
    }
    const el = doc.createElementNS(NS.ct, 'Override');
    el.setAttribute('PartName', name);
    el.setAttribute('ContentType', type);
    doc.documentElement.appendChild(el);
    zip.file(path, serialize(doc));
  }

  // Appends a relationship to a part, returning the new rId.
  async function addRel(zip, part, type, target) {
    const path = relsPathFor(part);
    let doc = await readXml(zip, path);
    if (!doc) {
      doc = parseXml(DECL + `<Relationships xmlns="${NS.pr}"/>`);
    }
    let max = 0;
    for (const el of all(doc, NS.pr, 'Relationship')) {
      const m = /^rId(\d+)$/.exec(el.getAttribute('Id') || '');
      if (m) max = Math.max(max, +m[1]);
    }
    const id = 'rId' + (max + 1);
    const el = doc.createElementNS(NS.pr, 'Relationship');
    el.setAttribute('Id', id);
    el.setAttribute('Type', type);
    el.setAttribute('Target', target);
    doc.documentElement.appendChild(el);
    zip.file(path, serialize(doc));
    return id;
  }

  const nextFree = (zip, dir, base, ext) => {
    let i = 1;
    while (zip.file(`${dir}/${base}${i}.${ext}`)) i++;
    return `${dir}/${base}${i}.${ext}`;
  };

  /* Insert a picture into a slide's shape tree at an EMU rectangle. The
     image is fitted to the box and CENTRE-CROPPED, the way PowerPoint's
     own picture placeholders behave — a Planet screenshot stretched to a
     slot's aspect ratio is a distorted map, which on a coverage slide is
     a factual error, not a cosmetic one. Cropping is expressed with
     <a:srcRect>, so the full image is still in the file and a user can
     undo the crop in PowerPoint. */
  function picXml(id, name, rid, box, srcRect) {
    const crop = srcRect
      ? `<a:srcRect l="${srcRect.l}" t="${srcRect.t}" r="${srcRect.r}" b="${srcRect.b}"/>` : '';
    return `<p:pic xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}">` +
      `<p:nvPicPr><p:cNvPr id="${id}" name="${name}"/><p:cNvPicPr>` +
      `<a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
      `<p:blipFill><a:blip r:embed="${rid}"/>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
      `<p:spPr><a:xfrm><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/>` +
      `<a:ext cx="${Math.round(box.w)}" cy="${Math.round(box.h)}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  }

  // How much of the source to keep so it fills the box without distorting.
  // Values are thousandths of a percent of the ORIGINAL image, per side.
  function centreCrop(imgW, imgH, box) {
    if (!imgW || !imgH || !box.w || !box.h) return null;
    const ar = imgW / imgH, target = box.w / box.h;
    if (Math.abs(ar - target) < 0.005) return null;
    if (ar > target) {                       // source too wide: trim sides
      const keep = target / ar, cut = Math.round((1 - keep) * 50000);
      return { l: cut, r: cut, t: 0, b: 0 };
    }
    const keep = ar / target, cut = Math.round((1 - keep) * 50000);
    return { l: 0, r: 0, t: cut, b: cut };
  }

  let uid = 9000;                            // shape ids we add, well clear
                                             // of anything PowerPoint wrote

  async function insertPicture(deck, slidePath, box, bytes, ext, imgSize) {
    const zip = deck.zip;
    await ensureDefault(zip, ext);
    const media = nextFree(zip, 'ppt/media', 'tablex', ext);
    zip.file(media, bytes);
    const rid = await addRel(zip, slidePath, REL.image, '../media/' + media.split('/').pop());

    const doc = await readXml(zip, slidePath);
    const tree = first(first(doc, NS.p, 'cSld'), NS.p, 'spTree');
    const frag = parseXml(picXml(++uid, 'TableX ' + uid, rid, box,
                                 imgSize ? centreCrop(imgSize.w, imgSize.h, box) : null));
    tree.appendChild(doc.importNode(frag.documentElement, true));
    zip.file(slidePath, serialize(doc));
  }

  /* ── the report table, as a native PowerPoint table ────────────────
     Not a picture of a table: a real <a:tbl>, so the text is selectable,
     the Hebrew stays live and someone can widen a column in PowerPoint.

     The cell matrix is handed in by the app so this file never learns the
     report's shape — there is exactly one definition of what the
     deliverable looks like, and it lives with the other renderers. */

  const xesc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const PT = 12700;                              // EMU per point

  function cellXml(c, line) {
    const run = c.t === '' || c.t == null ? `<a:endParaRPr lang="he-IL"/>` :
      `<a:r><a:rPr lang="he-IL" sz="${c.sz || 1000}"${c.bold ? ' b="1"' : ''} dirty="0">` +
      `<a:solidFill><a:srgbClr val="${(c.color || '000000').toUpperCase()}"/></a:solidFill>` +
      `<a:latin typeface="Arial"/><a:cs typeface="Arial"/></a:rPr>` +
      `<a:t>${xesc(c.t)}</a:t></a:r>`;
    // rtl="1" on the paragraph is what puts Hebrew the right way round
    // INSIDE a cell; it says nothing about column order (see the note in
    // app.js — the columns are reversed by hand, in both writers).
    // A cell flagged `ltr` holds an English code rather than a Hebrew name:
    // under rtl="1" PowerPoint reorders `13207_3381063_90` to
    // `90_3381063_13207`, the same reversal app.js guards in the HTML table.
    return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>` +
      `<a:p><a:pPr algn="${c.align || 'ctr'}" rtl="${c.ltr ? '0' : '1'}"/>${run}</a:p></a:txBody>` +
      // schema order inside tcPr is lnL, lnR, lnT, lnB, then the fill
      `<a:tcPr marL="45720" marR="45720" marT="0" marB="0" anchor="ctr">${line}` +
      `<a:solidFill><a:srgbClr val="${(c.fill || 'FFFFFF').toUpperCase()}"/></a:solidFill>` +
      `</a:tcPr></a:tc>`;
  }

  function tableXml(id, box, matrix, colFrac, border) {
    const w = Math.round(box.w), h = Math.round(box.h);
    const cols = colFrac.map(f => Math.round(w * f));
    const rowH = Math.round(h / Math.max(1, matrix.length));
    const ln = ['lnL', 'lnR', 'lnT', 'lnB'].map(t =>
      `<a:${t} w="${Math.round((border.pt || 0.5) * PT)}" cap="flat" cmpd="sng">` +
      `<a:solidFill><a:srgbClr val="${border.color.toUpperCase()}"/></a:solidFill></a:${t}>`).join('');

    return `<p:graphicFrame xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}">` +
      `<p:nvGraphicFramePr><p:cNvPr id="${id}" name="TableX table"/>` +
      `<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>` +
      `<p:nvPr/></p:nvGraphicFramePr>` +
      `<p:xfrm><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/>` +
      `<a:ext cx="${w}" cy="${h}"/></p:xfrm>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">` +
      `<a:tbl><a:tblPr/><a:tblGrid>` +
      cols.map(c => `<a:gridCol w="${c}"/>`).join('') +
      `</a:tblGrid>` +
      matrix.map(row => `<a:tr h="${rowH}">` +
        row.map(c => cellXml(c, ln)).join('') + `</a:tr>`).join('') +
      `</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  }

  async function insertTable(deck, slidePath, box, matrix, colFrac, border) {
    const doc = await readXml(deck.zip, slidePath);
    const tree = first(first(doc, NS.p, 'cSld'), NS.p, 'spTree');
    const frag = parseXml(tableXml(++uid, box, matrix, colFrac,
                                   border || { color: 'BBB5E0', pt: 0.5 }));
    tree.appendChild(doc.importNode(frag.documentElement, true));
    deck.zip.file(slidePath, serialize(doc));
  }

  /* Clone a slide part (and its relationships) as a NEW part, and register
     it in the presentation. Used by repeat slides: one map slide in the
     template becomes one slide per dropped image.

     The clone deliberately does NOT copy the notesSlide relationship —
     two slides pointing at one notes part is invalid, and silently
     sharing notes is worse than having none. */
  async function cloneSlide(deck, srcPath) {
    const zip = deck.zip;
    const dst = nextFree(zip, 'ppt/slides', 'slide', 'xml');
    zip.file(dst, await zip.file(srcPath).async('string'));

    const srcRels = await readXml(zip, relsPathFor(srcPath));
    if (srcRels) {
      const copy = parseXml(serialize(srcRels));
      for (const el of all(copy, NS.pr, 'Relationship')) {
        if (el.getAttribute('Type') === REL.notes) el.remove();
      }
      zip.file(relsPathFor(dst), serialize(copy));
    }
    await addOverride(zip, dst,
      'application/vnd.openxmlformats-officedocument.presentationml.slide+xml');
    const rid = await addRel(zip, 'ppt/presentation.xml', REL.slide,
                             'slides/' + dst.split('/').pop());
    return { path: dst, rid };
  }

  /* Rewrite <p:sldIdLst> to exactly `order` (entries of {rid}). This is
     what makes reorder and delete safe: slide ORDER is this list, never
     the file names, so nothing has to be renumbered and every other
     part's relationships keep pointing where they did. */
  async function setSlideOrder(deck, order) {
    const zip = deck.zip;
    const doc = await readXml(zip, 'ppt/presentation.xml');
    const lst = first(doc, NS.p, 'sldIdLst');
    if (!lst) return;
    while (lst.firstChild) lst.removeChild(lst.firstChild);
    let id = 256;
    for (const o of order) {
      const el = doc.createElementNS(NS.p, 'p:sldId');
      el.setAttribute('id', String(id++));
      el.setAttributeNS(NS.r, 'r:id', o.rid);
      lst.appendChild(el);
    }
    zip.file('ppt/presentation.xml', serialize(doc));
  }

  /* Drop a slide from the package for real — the part, its rels, its
     content-type override, the presentation relationship and any notes
     slide that pointed at it. Removing it from <p:sldIdLst> alone would
     hide it while leaving the content in the file, and "deleted" has to
     mean deleted in something that goes to a commander. */
  async function deleteSlide(deck, slidePath, rid) {
    const zip = deck.zip;
    for (const path of Object.keys(zip.files)) {
      if (!/^ppt\/notesSlides\/_rels\//.test(path)) continue;
      const rels = await readXml(zip, path);
      const points = all(rels, NS.pr, 'Relationship').some(
        el => resolvePath(path.replace('/_rels/', '/').replace(/\.rels$/, ''),
                          el.getAttribute('Target')) === slidePath);
      if (points) {
        const notes = path.replace('/_rels/', '/').replace(/\.rels$/, '');
        zip.remove(notes); zip.remove(path);
        await dropOverride(zip, notes);
      }
    }
    zip.remove(slidePath);
    zip.remove(relsPathFor(slidePath));
    await dropOverride(zip, slidePath);

    const path = relsPathFor('ppt/presentation.xml');
    const doc = await readXml(zip, path);
    for (const el of all(doc, NS.pr, 'Relationship')) {
      if (el.getAttribute('Id') === rid) el.remove();
    }
    zip.file(path, serialize(doc));
  }

  async function dropOverride(zip, part) {
    const path = '[Content_Types].xml';
    const doc = await readXml(zip, path);
    if (!doc) return;
    for (const o of all(doc, NS.ct, 'Override')) {
      if (o.getAttribute('PartName') === '/' + part) o.remove();
    }
    zip.file(path, serialize(doc));
  }

  const toBlob = deck => deck.zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // A working copy, so filling a template never mutates the stored one.
  const cloneDeck = async deck =>
    open(await deck.zip.generateAsync({ type: 'arraybuffer' }), deck.name);

  global.TableXPptx = {
    EMU_IN, NS, REL,
    open, slideModel, release, cloneDeck,
    insertPicture, insertTable, cloneSlide, setSlideOrder, deleteSlide,
    addRel, addOverride, ensureDefault, readXml, serialize, parseXml,
    first, all, relsPathFor, nextFree, toBlob, centreCrop,
  };
})(window);
