/* The .pptx engine: parse a package, patch it, and re-open the result.
 * The fixture is built by the app's OWN PptxGenJS -- a real OOXML package
 * with a master, a layout and a theme -- because there is no PowerPoint on
 * the dev box. What it cannot cover is the exotica only real PowerPoint
 * emits, which is exactly why js/pptx.js copies the unknown rather than
 * interpreting it. */
export default async function ({ ev, ok, shot, sleep, send }) {


  ok('JSZip is on window', await ev(`return typeof JSZip === 'function';`));
  ok('engine loaded', await ev(`return typeof TableXPptx === 'object';`));

  // ── build a fixture deck with the app's own writer ────────────────────
  await ev(`
    // 4x3 red PNG, so aspect-ratio cropping has something to bite on
    window.__png = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAHElEQVQI12P8z8Dwn4EI'
                 + 'wESMokGgkKGKBoFCAGxJBAWzUYBBAAAAAElFTkSuQmCC';
    const p = new PptxGenJS();
    p.layout = 'LAYOUT_WIDE';
    const a = p.addSlide();
    a.background = { color: '203864' };
    a.addText('שקופית ראשונה', { x: 0.5, y: 0.4, w: 6, h: 0.9, fontSize: 30, color: 'FFFFFF' });
    a.addImage({ data: 'image/png;base64,' + window.__png, x: 1, y: 2, w: 3, h: 2 });
    const b = p.addSlide();
    b.addText('שקופית שנייה', { x: 0.5, y: 0.4, w: 6, h: 0.9, fontSize: 24 });
    const c = p.addSlide();
    c.addText('שלישית', { x: 0.5, y: 0.4, w: 6, h: 0.9, fontSize: 24 });
    window.__fixture = await p.write({ outputType: 'arraybuffer' });
    return window.__fixture.byteLength > 1000;`);
  ok('fixture deck written', true, `${await ev(`return window.__fixture.byteLength;`)} bytes`);

  // ── open + parse ──────────────────────────────────────────────────────
  const info = await ev(`
    window.__deck = await TableXPptx.open(window.__fixture, 'fixture.pptx');
    const d = window.__deck;
    return { cx: d.cx, cy: d.cy, slides: d.slides.length, paths: d.slides.map(s => s.path) };`);
  ok('slide size read (16:9 widescreen)', info.cx === 12192000 && info.cy === 6858000,
     `${(info.cx / 914400).toFixed(2)}x${(info.cy / 914400).toFixed(2)} in`);
  ok('all slides found via sldIdLst', info.slides === 3, info.paths.join(', '));

  const m0 = await ev(`
    const m = await TableXPptx.slideModel(window.__deck, 0);
    return { bg: m.bg, n: m.shapes.length,
             kinds: m.shapes.map(s => s.kind),
             texts: m.shapes.filter(s => s.text).map(s => s.text),
             pic: m.shapes.find(s => s.kind === 'pic') || null };`);
  ok('background colour resolved', !!(m0.bg && m0.bg.color), JSON.stringify(m0.bg));
  ok('shapes found', m0.n >= 2, `${m0.n}: ${m0.kinds.join(',')}`);
  ok('hebrew text read back', m0.texts.some(t => t.includes('ראשונה')), JSON.stringify(m0.texts));
  ok('picture has a blob url + rect', !!(m0.pic && m0.pic.src && m0.pic.w > 0),
     m0.pic ? `${(m0.pic.x / 914400).toFixed(2)},${(m0.pic.y / 914400).toFixed(2)} ` +
              `${(m0.pic.w / 914400).toFixed(2)}x${(m0.pic.h / 914400).toFixed(2)} in` : 'none');

  // ── centre-crop maths ─────────────────────────────────────────────────
  const crop = await ev(`
    const cc = TableXPptx.centreCrop;
    return {
      wide: cc(400, 100, { w: 100, h: 100 }),
      tall: cc(100, 400, { w: 100, h: 100 }),
      same: cc(200, 100, { w: 400, h: 200 }),
    };`);
  ok('wide source trims left/right', crop.wide && crop.wide.l === 37500 && crop.wide.t === 0,
     JSON.stringify(crop.wide));
  ok('tall source trims top/bottom', crop.tall && crop.tall.t === 37500 && crop.tall.l === 0,
     JSON.stringify(crop.tall));
  ok('matching aspect ratio is not cropped', crop.same === null);

  // ── mutate: insert, clone, reorder, delete ───────────────────────────
  const built = await ev(`
    const P = TableXPptx;
    const work = await P.cloneDeck(window.__deck);
    const bytes = Uint8Array.from(atob(window.__png), c => c.charCodeAt(0));

    // a picture into slide 1, in the middle third of the slide
    await P.insertPicture(work, work.slides[0].path,
      { x: work.cx / 3, y: work.cy / 3, w: work.cx / 3, h: work.cy / 3 },
      bytes, 'png', { w: 4, h: 3 });

    // clone slide 2 twice (what a "repeat" slide does)
    const c1 = await P.cloneSlide(work, work.slides[1].path);
    const c2 = await P.cloneSlide(work, work.slides[1].path);

    // drop slide 3, then order: s1, s2, clone1, clone2
    await P.deleteSlide(work, work.slides[2].path, work.slides[2].rid);
    await P.setSlideOrder(work, [
      { rid: work.slides[0].rid }, { rid: work.slides[1].rid },
      { rid: c1.rid }, { rid: c2.rid },
    ]);
    window.__out = await work.zip.generateAsync({ type: 'arraybuffer' });
    return window.__out.byteLength;`);
  ok('output produced', built > 1000, `${built} bytes`);

  // ── re-open the output: the real proof ────────────────────────────────
  const re = await ev(`
    const d = await TableXPptx.open(window.__out, 'out.pptx');
    window.__re = d;
    const models = [];
    for (let i = 0; i < d.slides.length; i++) {
      const m = await TableXPptx.slideModel(d, i);
      models.push({ kinds: m.kinds = m.shapes.map(s => s.kind),
                    texts: m.shapes.filter(s => s.text).map(s => s.text),
                    pics: m.shapes.filter(s => s.kind === 'pic').length });
    }
    return { n: d.slides.length, paths: d.slides.map(s => s.path), models };`);
  ok('output re-opens', re.n === 4, `${re.n} slides: ${re.paths.join(', ')}`);
  ok('inserted picture is on slide 1', re.models[0] && re.models[0].pics === 2,
     `pics=${re.models[0] && re.models[0].pics}`);
  ok('cloned slides carry the source content',
     re.models[2] && re.models[2].texts.some(t => t.includes('שנייה')) &&
     re.models[3] && re.models[3].texts.some(t => t.includes('שנייה')),
     JSON.stringify(re.models.map(m => m.texts)));
  ok('deleted slide is gone from the deck',
     !re.models.some(m => m.texts.some(t => t.includes('שלישית'))));

  // the deleted slide's PART must be gone too, not merely unlisted
  const purged = await ev(`
    const z = window.__re.zip;
    const names = Object.keys(z.files);
    const slideParts = names.filter(n => /^ppt\\/slides\\/slide\\d+\\.xml$/.test(n));
    let leftover = false;
    for (const n of slideParts) {
      const s = await z.file(n).async('string');
      if (s.includes('שלישית')) leftover = true;
    }
    const ct = await z.file('[Content_Types].xml').async('string');
    return { slideParts: slideParts.length, leftover,
             overrides: (ct.match(/slides\\/slide\\d+\\.xml/g) || []).length };`);
  ok('deleted slide part removed from the package', !purged.leftover,
     `${purged.slideParts} slide parts, ${purged.overrides} content-type overrides`);
  ok('content types match the slide parts', purged.slideParts === purged.overrides);

  // package sanity: every relationship target must exist
  const dangling = await ev(`
    const z = window.__re.zip;
    const bad = [];
    for (const path of Object.keys(z.files)) {
      if (!/_rels\\/.+\\.rels$/.test(path)) continue;
      const owner = path.replace('/_rels/', '/').replace(/\\.rels$/, '');
      const doc = TableXPptx.parseXml(await z.file(path).async('string'));
      for (const el of TableXPptx.all(doc, TableXPptx.NS.pr, 'Relationship')) {
        if (el.getAttribute('TargetMode') === 'External') continue;
        const t = el.getAttribute('Target');
        const base = owner.split('/').slice(0, -1);
        for (const seg of t.split('/')) {
          if (seg === '.') continue;
          if (seg === '..') base.pop(); else base.push(seg);
        }
        const abs = t.startsWith('/') ? t.slice(1) : base.join('/');
        if (!z.file(abs)) bad.push(path + ' -> ' + t);
      }
    }
    return bad;`);
  ok('no dangling relationships', dangling.length === 0, dangling.slice(0, 3).join(' | '))
}
