/* The whole Decks flow: upload a template, mark slots, mark a slide as
 * repeating, save it to the server, drop images, build, and re-open what
 * came out -- including that the report table is a native <a:tbl> and that
 * no relationship dangles. */
export default async function ({ ev, ok, shot, sleep, send }) {


  // helpers installed in the page: make Files, and capture the download
  await ev(`
    window.__mkFile = (bytes, name, type) => new File([bytes], name, { type });
    window.__feed = (inputId, files) => {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      const el = document.getElementById(inputId);
      el.files = dt.files;
      el.dispatchEvent(new Event('change'));
    };
    // 8x5 and 5x8 PNGs, so cropping has both orientations to handle
    window.__pngA = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAFCAYAAABPzW8xAAAAF0lEQVQI12P8z8Dwn4GBgYEJRDAyMjIAADmnAwOZfZ7CAAAAAElFTkSuQmCC';
    window.__pngB = 'iVBORw0KGgoAAAANSUhEUgAAAAUAAAAICAYAAAAx8TU7AAAAHElEQVQI12NkYGD4z8DAwMTAwMDAyMjIwMDAwAAAHUEDAyEZKtsAAAAASUVORK5CYII=';
    window.__b2u = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return true;`);

  // ── a fixture deck: title, a map slide, a table slide ────────────────
  await ev(`
    const p = new PptxGenJS();
    p.layout = 'LAYOUT_WIDE';
    const a = p.addSlide();
    a.background = { color: '1F3864' };
    a.addText('סיכום גזרה', { x: 0.6, y: 2.4, w: 8, h: 1.2, fontSize: 40, color: 'FFFFFF' });
    const b = p.addSlide();
    b.addText('כיסוי', { x: 0.5, y: 0.3, w: 5, h: 0.7, fontSize: 24 });
    const c = p.addSlide();
    c.addText('נתונים', { x: 0.5, y: 0.3, w: 5, h: 0.7, fontSize: 24 });
    window.__fx = await p.write({ outputType: 'arraybuffer' });
    return window.__fx.byteLength;`);

  // ── go to the decks view and upload it ───────────────────────────────
  await ev(`document.querySelector('[data-goto="decks"]').click();`);
  await sleep(400);
  ok('decks view opens', await ev(`return !document.getElementById('viewDecks').classList.contains('hidden');`));
  ok('empty state shows the new-template card',
     await ev(`return !!document.getElementById('dkNew');`));

  await ev(`window.__feed('tplFileInput', [window.__mkFile(window.__fx, 'gizra.pptx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation')]);`);
  await sleep(1500);
  ok('editor opened on upload',
     await ev(`return !document.getElementById('tplEditor').classList.contains('hidden');`));
  ok('rail shows every slide',
     await ev(`return document.querySelectorAll('.tr-item').length === 3;`),
     `${await ev(`return document.querySelectorAll('.tr-item').length;`)} items`);
  ok('preview drew the title slide',
     await ev(`return document.querySelectorAll('#tplStage .sl-sp').length > 0
                     && !!document.querySelector('#tplStage .sl-bg');`));
  ok('template name defaults to the file name',
     await ev(`return document.getElementById('tplName').value === 'gizra';`));
  await shot('tpl_editor');

  // ── slide 2: an image slot, marked repeating ─────────────────────────
  await ev(`document.querySelectorAll('.tr-item')[1].click();`);
  await sleep(400);
  await ev(`document.getElementById('tplAddImg').click();`);
  await sleep(200);
  ok('image slot added', await ev(`return document.querySelectorAll('#tplStage .slot').length === 1;`));
  await ev(`document.getElementById('tplRepeat').click();`);
  await sleep(300);
  ok('slide marked repeating',
     await ev(`return document.getElementById('tplRepeat').classList.contains('on')
                     && !!document.querySelector('.tr-tag.rep');`));

  // drag the slot: pointer events, exactly as a user would
  const moved = await ev(`
    const st = document.getElementById('tplStage');
    const el = st.querySelector('.slot');
    const before = TableXDeck._state.ed.meta.slots[0].x;
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
                   pointerId: 1, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    st.dispatchEvent(new PointerEvent('pointermove',
      { ...opts, clientX: opts.clientX + 60, clientY: opts.clientY + 20 }));
    st.dispatchEvent(new PointerEvent('pointerup', opts));
    await new Promise(r => setTimeout(r, 150));
    return { before, after: TableXDeck._state.ed.meta.slots[0].x };`);
  ok('slot drags', moved.after !== moved.before,
     `x ${(moved.before / 914400).toFixed(2)}in -> ${(moved.after / 914400).toFixed(2)}in`);

  // ── slide 3: a table slot ────────────────────────────────────────────
  await ev(`document.querySelectorAll('.tr-item')[2].click();`);
  await sleep(400);
  await ev(`document.getElementById('tplAddTbl').click();`);
  await sleep(200);
  ok('table slot added and styled apart',
     await ev(`return !!document.querySelector('#tplStage .slot.table');`));

  // ── name and save ────────────────────────────────────────────────────
  await ev(`
    const n = document.getElementById('tplName');
    n.value = 'סיכום גזרה';
    n.dispatchEvent(new Event('input'));
    document.getElementById('tplSave').click();`);
  await sleep(2500);
  ok('editor closed after save',
     await ev(`return document.getElementById('tplEditor').classList.contains('hidden');`));
  const saved = await ev(`
    const r = await fetch('api/tpl', { cache: 'no-store' });
    const list = await r.json();
    return { n: list.length, name: list[0] && list[0].name,
             slots: list[0] && list[0].slots.length,
             reps: list[0] && list[0].slides.filter(s => s.repeat).length };`);
  ok('template persisted to the server', saved.n === 1 && saved.slots === 2 && saved.reps === 1,
     `slots=${saved.slots} repeating=${saved.reps}`);
  ok('hebrew name survived the round trip', saved.name === 'סיכום גזרה', saved.name);

  // ── drop images ──────────────────────────────────────────────────────
  await ev(`
    const files = [];
    for (let i = 0; i < 3; i++) {
      files.push(window.__mkFile(window.__b2u(i % 2 ? window.__pngB : window.__pngA),
                                 'map' + (i + 1) + '.png', 'image/png'));
    }
    window.__feed('imgFileInput', files);`);
  await sleep(1200);
  ok('images accepted', await ev(`return document.querySelectorAll('.dk-thumb').length === 3;`));
  ok('plan expands the repeating slide',
     await ev(`return document.querySelectorAll('.dk-plan li').length === 5;`),
     `${await ev(`return document.querySelectorAll('.dk-plan li').length;`)} output slides`);
  ok('plan warns that no table has been generated yet',
     await ev(`return document.querySelectorAll('.dk-warn').length === 1;`));
  await shot('dk_plan');

  // reordering the strip must change which image lands where
  const order = await ev(`
    // the first line that actually receives an image (slide 1 has no slots)
    const pick = () => [...document.querySelectorAll('.dk-plan li')]
      .map(li => li.querySelector('.dk-pf').textContent.trim()).filter(Boolean);
    const before = pick();
    document.querySelector('[data-mv="0:1"]').click();
    await new Promise(r => setTimeout(r, 250));
    return { before, after: pick(), thumbs: document.querySelectorAll('.dk-thumb').length };`);
  ok('every repeated slide names the image it receives',
     order.before.length === 4 && order.before[0].length > 0,
     JSON.stringify(order.before));
  ok('reordering the strip is reflected in the plan', order.thumbs === 3);

  // ── generate a table so the table slot has something ─────────────────
  await ev(`
    document.querySelector('[data-goto="home"]').click();
    await new Promise(r => setTimeout(r, 200));
    document.getElementById('btnSample').click();
    await new Promise(r => setTimeout(r, 150));
    document.getElementById('btnGenerate').click();`);
  await sleep(900);
  ok('report generated for the table slot', await ev(`return TableXReport.has();`),
     JSON.stringify(await ev(`return TableXReport.meta();`)));

  // ── build ────────────────────────────────────────────────────────────
  await ev(`
    document.querySelector('[data-goto="decks"]').click();
    await new Promise(r => setTimeout(r, 500));
    // catch the download instead of letting the browser take it
    window.__dl = null;
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { window.__dl = { href: this.href, name: this.download }; return; }
      return realClick.apply(this, arguments);
    };
    return true;`);
  ok('table warning cleared once a table exists',
     await ev(`return document.querySelectorAll('.dk-warn').length === 0;`));

  await ev(`document.getElementById('dkBuild').click();`);
  await sleep(3000);
  ok('a file was produced', await ev(`return !!window.__dl;`),
     await ev(`return window.__dl && window.__dl.name;`));
  ok('named after the template', await ev(`return window.__dl && window.__dl.name === 'סיכום גזרה.pptx';`));

  // ── re-open the built deck: the real proof ───────────────────────────
  const out = await ev(`
    const buf = await (await fetch(window.__dl.href)).arrayBuffer();
    const d = await TableXPptx.open(buf, 'out.pptx');
    const slides = [];
    for (let i = 0; i < d.slides.length; i++) {
      const m = await TableXPptx.slideModel(d, i);
      slides.push({ pics: m.shapes.filter(s => s.kind === 'pic').length,
                    tables: m.shapes.filter(s => s.kind === 'table').length,
                    text: m.shapes.filter(s => s.text).map(s => s.text).join('|') });
    }
    const zip = d.zip;
    const ct = await zip.file('[Content_Types].xml').async('string');
    return { n: d.slides.length, slides, bytes: buf.byteLength,
             hasPngDefault: /Extension="png"/i.test(ct) };`);
  ok('built deck opens and has the planned slide count', out.n === 5,
     `${out.n} slides, ${out.bytes} bytes`);
  ok('each repeated slide got exactly one picture',
     out.slides[1].pics === 1 && out.slides[2].pics === 1 && out.slides[3].pics === 1,
     JSON.stringify(out.slides.map(s => s.pics)));
  ok('the table landed on the last slide', out.slides[4].tables === 1,
     JSON.stringify(out.slides.map(s => s.tables)));
  ok('title slide text survived untouched', out.slides[0].text.includes('סיכום גזרה'));
  ok('png content type declared', out.hasPngDefault);

  // the table must be a REAL table with the report's numbers in it
  const tbl = await ev(`
    const buf = await (await fetch(window.__dl.href)).arrayBuffer();
    const z = await JSZip.loadAsync(buf);
    let found = null;
    for (const n of Object.keys(z.files)) {
      if (!/^ppt\\/slides\\/slide\\d+\\.xml$/.test(n)) continue;
      const s = await z.file(n).async('string');
      if (s.includes('<a:tbl>')) {
        found = { part: n, rows: (s.match(/<a:tr /g) || []).length,
                  cols: (s.match(/<a:gridCol /g) || []).length,
                  hasHeader: s.includes('4A3F8C'), hasHeb: s.includes('עוצמה') };
      }
    }
    return found;`);
  ok('a native <a:tbl> was written, not a picture', !!tbl, tbl && tbl.part);
  ok('table has 7 columns and header+rows', tbl && tbl.cols === 7 && tbl.rows === 22,
     tbl ? `${tbl.rows} rows x ${tbl.cols} cols` : '');
  ok('table carries the report palette and Hebrew headers',
     tbl && tbl.hasHeader && tbl.hasHeb);

  // no dangling relationships in the built file
  const bad = await ev(`
    const buf = await (await fetch(window.__dl.href)).arrayBuffer();
    const z = await JSZip.loadAsync(buf);
    const out = [];
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
        if (!z.file(t.startsWith('/') ? t.slice(1) : base.join('/'))) out.push(path + ' -> ' + t);
      }
    }
    return out;`);
  ok('built deck has no dangling relationships', bad.length === 0, bad.slice(0, 3).join(' | '))
}
