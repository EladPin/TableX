/* ═══════════════════════════════════════════════════════════════════
   DECK — PowerPoint templates: mark where things go, then fill them in.

   The point of this view is that the deck stops being assembled by hand.
   Until now TableX produced one slide and a person built the rest of the
   presentation around it. Here a real .pptx is uploaded once, the places
   that change are marked, and every later deck is: drop the Planet
   screenshots, press generate.

   WHAT A TEMPLATE IS. The uploaded .pptx itself, kept whole, plus a small
   list of rectangles. js/pptx.js explains why at length; the short version
   is that we never re-author the deck, so the branding, the masters, the
   fonts and the animations come out exactly as PowerPoint made them. The
   only edits are: put a picture here, put the report table there, repeat
   this slide once per image, drop or reorder these slides.

   That is also why the editor does NOT let you retype the deck's own text.
   Editing arbitrary PowerPoint content in a browser means reimplementing
   PowerPoint badly, and the result would be worse than the file the user
   already has. PowerPoint edits the deck; this marks it up.

   Storage is the server (api/tpl), for the same reason database updates go
   there: a template someone builds should belong to that copy of the app,
   not to one browser's profile.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const T = (k, v) => global.I18N.t(k, v);
  const EMU = 914400;
  const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const D = {
    tpls: [],        // metadata from api/tpl
    sel: null,       // selected template id
    imgs: [],        // ordered: { name, bytes, ext, url, w, h }
    ed: null,        // editor state while the overlay is open
    busy: false,
  };

  /* ── storage ───────────────────────────────────────────────────── */

  async function loadList() {
    try {
      const r = await fetch('api/tpl', { cache: 'no-store' });
      D.tpls = r.ok ? await r.json() : [];
    } catch (e) {
      D.tpls = [];                       // opened without the server
    }
    if (D.sel && !D.tpls.some(t => t.id === D.sel)) D.sel = null;
    if (!D.sel && D.tpls.length) D.sel = D.tpls[0].id;
  }

  const deckUrl = id => 'data/tpl/' + id + '.pptx';

  async function fetchDeckBytes(id) {
    const r = await fetch(deckUrl(id), { cache: 'no-store' });
    if (!r.ok) throw new Error('deck ' + r.status);
    return r.arrayBuffer();
  }

  // Ids are generated, never typed: the server constrains them to
  // [a-z0-9-] and a name like "סיכום גזרה" cannot be one.
  const newId = () => 't' + Date.now().toString(36) +
                      Math.random().toString(36).slice(2, 6);

  async function saveTemplate(meta, bytes) {
    if (bytes) {
      const r = await fetch('api/tpl/' + meta.id + '/deck',
                            { method: 'POST', body: bytes });
      if (!r.ok) throw new Error(await r.text());
    }
    const r = await fetch('api/tpl/' + meta.id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(meta),
    });
    if (!r.ok) throw new Error(await r.text());
  }

  /* ── the plan ────────────────────────────────────────────────────────
     Assignment is POSITIONAL, and that is a deliberate simplification.
     Images are one ordered list; slots consume it in deck order. There is
     no drag-an-image-onto-a-slot step to get wrong, reordering the strip
     is the only control needed, and the plan below is rendered in full
     before anything is generated — so what comes out is never a surprise.

     A repeat slide consumes as many images as it has picture slots, once
     per repetition, until the images run out. A two-map layout therefore
     just works: give the slide two slots. */
  function plan(tpl) {
    const bySlide = {};
    for (const s of (tpl.slots || [])) (bySlide[s.path] || (bySlide[s.path] = [])).push(s);

    const out = [];
    let next = 0;
    for (const sl of (tpl.slides || [])) {
      const slots = bySlide[sl.path] || [];
      const pics = slots.filter(s => s.kind === 'image');
      const rest = slots.filter(s => s.kind !== 'image');
      const left = D.imgs.length - next;

      if (sl.repeat && pics.length) {
        const reps = Math.max(1, Math.ceil(left / pics.length));
        for (let i = 0; i < reps; i++) {
          out.push({ path: sl.path, rid: sl.rid, repeat: true,
                     fills: pics.map(p => ({ slot: p, img: next++ < D.imgs.length ? next - 1 : null }))
                                .concat(rest.map(s => ({ slot: s }))) });
        }
      } else {
        out.push({ path: sl.path, rid: sl.rid,
                   fills: pics.map(p => ({ slot: p, img: next < D.imgs.length ? next++ : null }))
                              .concat(rest.map(s => ({ slot: s }))) });
      }
    }
    return { slides: out, used: Math.min(next, D.imgs.length), spare: Math.max(0, D.imgs.length - next) };
  }

  /* ── build ─────────────────────────────────────────────────────── */

  async function build(tpl) {
    const P = global.TableXPptx;
    const work = await P.open(await fetchDeckBytes(tpl.id), tpl.name);
    const keep = new Set((tpl.slides || []).map(s => s.path));

    // Slides the editor dropped go first, so nothing is cloned from a part
    // that is about to be removed.
    for (const s of work.slides) {
      if (!keep.has(s.path)) await P.deleteSlide(work, s.path, s.rid);
    }

    const p = plan(tpl);

    // PASS 1 — every clone is made BEFORE anything is written into any
    // slide. Cloning after patching would copy the first copy's picture
    // into the second, which is the bug this ordering exists to avoid.
    const seen = new Set();
    for (const o of p.slides) {
      if (seen.has(o.path)) {
        const c = await P.cloneSlide(work, o.path);
        o.part = c.path; o.rid = c.rid;
      } else {
        seen.add(o.path);
        o.part = o.path;
      }
    }

    // PASS 2 — fill.
    const R = global.TableXReport;
    for (const o of p.slides) {
      for (const f of o.fills) {
        const box = { x: f.slot.x, y: f.slot.y, w: f.slot.w, h: f.slot.h };
        if (f.slot.kind === 'table') {
          const m = R && R.matrix();
          if (!m) continue;                      // no table generated yet
          // PowerPoint grows a table to fit its text, so a slot drawn too
          // short would silently overflow whatever sits below it. Give the
          // rows their natural height and let the frame be the taller of
          // the two.
          const natural = m.length * 0.32 * EMU;
          await P.insertTable(work, o.part, { ...box, h: Math.max(box.h, natural) },
                              m, R.TBL.frac, R.TBL.border);
        } else if (f.img != null && D.imgs[f.img]) {
          const im = D.imgs[f.img];
          await P.insertPicture(work, o.part, box, im.bytes, im.ext, { w: im.w, h: im.h });
        }
      }
    }

    await P.setSlideOrder(work, p.slides.map(o => ({ rid: o.rid })));
    return P.toBlob(work);
  }

  /* ── files in ──────────────────────────────────────────────────── */

  async function addPptx(file) {
    const P = global.TableXPptx;
    let deck;
    const bytes = await file.arrayBuffer();
    try {
      deck = await P.open(bytes, file.name);
    } catch (e) {
      global.TableXUI.toast(T('dk.notPptx'), true);
      return;
    }
    if (!deck.slides.length) {
      global.TableXUI.toast(T('dk.noSlides'), true);
      return;
    }
    const meta = {
      id: newId(),
      name: file.name.replace(/\.pptx$/i, ''),
      source: file.name,
      built: new Date().toISOString().slice(0, 10),
      cx: deck.cx, cy: deck.cy,
      slides: deck.slides.map(s => ({ path: s.path, rid: s.rid, repeat: false })),
      slots: [],
    };
    await openEditor(meta, deck, bytes);
  }

  async function addImages(files) {
    for (const f of files) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!IMG_EXT.includes(ext)) continue;
      const bytes = await f.arrayBuffer();
      const url = URL.createObjectURL(new Blob([bytes], { type: f.type || 'image/png' }));
      // Natural size is read now, once: insertPicture needs it to
      // centre-crop, and a distorted coverage map is a factual error.
      const size = await new Promise(res => {
        const im = new Image();
        im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = () => res({ w: 0, h: 0 });
        im.src = url;
      });
      D.imgs.push({ name: f.name, bytes, ext: ext === 'jpg' ? 'jpeg' : ext, url,
                    w: size.w, h: size.h });
    }
    render();
  }

  /* ── the main view ─────────────────────────────────────────────── */

  function render() {
    const wrap = $('dkTpls');
    if (!wrap) return;

    wrap.innerHTML = D.tpls.map(t => {
      const slots = (t.slots || []).length;
      const reps = (t.slides || []).filter(s => s.repeat).length;
      return '<button class="dk-card' + (t.id === D.sel ? ' on' : '') +
             '" data-tpl="' + esc(t.id) + '">' +
        '<span class="dk-name">' + esc(t.name) + '</span>' +
        '<span class="dk-meta">' + esc(T('dk.cardMeta', {
          n: (t.slides || []).length, s: slots })) +
          (reps ? ' · ' + esc(T('dk.cardRepeat', { n: reps })) : '') + '</span>' +
        '<span class="dk-acts">' +
          '<span class="dk-act" data-edit="' + esc(t.id) + '">' + esc(T('dk.edit')) + '</span>' +
          '<span class="dk-act danger" data-del="' + esc(t.id) + '">' + esc(T('dk.remove')) + '</span>' +
        '</span></button>';
    }).join('') +
      '<button class="dk-card dk-new" id="dkNew">' +
        '<span class="dk-plus">+</span>' +
        '<span class="dk-name">' + esc(T('dk.newTitle')) + '</span>' +
        '<span class="dk-meta">' + esc(T('dk.newSub')) + '</span>' +
      '</button>';

    const tpl = D.tpls.find(t => t.id === D.sel);
    const body = $('dkBody');
    body.classList.toggle('hidden', !tpl);
    if (!tpl) return;

    // image strip
    $('dkImgs').innerHTML = D.imgs.length
      ? D.imgs.map((im, i) =>
          '<div class="dk-thumb" data-img="' + i + '">' +
            '<img src="' + im.url + '" alt=""/>' +
            '<span class="dk-tn">' + (i + 1) + '</span>' +
            '<span class="dk-move" data-mv="' + i + ':-1" title="' + esc(T('dk.earlier')) + '">‹</span>' +
            '<span class="dk-move r" data-mv="' + i + ':1" title="' + esc(T('dk.later')) + '">›</span>' +
            '<span class="dk-x" data-rmimg="' + i + '">✕</span>' +
          '</div>').join('')
      : '<p class="ed-msg">' + esc(T('dk.noImgs')) + '</p>';

    // the plan, spelled out before anything is generated
    const p = plan(tpl);
    const R = global.TableXReport;
    const hasTable = (tpl.slots || []).some(s => s.kind === 'table');
    const lines = p.slides.map((o, i) => {
      const n = (tpl.slides || []).findIndex(s => s.path === o.path) + 1;
      const bits = o.fills.map(f => f.slot.kind === 'table'
        ? (R && R.has() ? T('dk.fillTable') : T('dk.fillTableNone'))
        : (f.img != null ? T('dk.fillImg', { n: f.img + 1 }) : T('dk.fillEmpty')));
      return '<li><span class="dk-pn">' + (i + 1) + '</span>' +
             '<span class="dk-ps">' + esc(T('dk.fromSlide', { n })) +
             (o.repeat ? ' · ' + esc(T('dk.repeated')) : '') + '</span>' +
             '<span class="dk-pf">' + esc(bits.join(' · ')) + '</span></li>';
    }).join('');
    $('dkPlan').innerHTML = '<ol class="dk-plan">' + lines + '</ol>' +
      (p.spare ? '<p class="dk-warn">' + esc(T('dk.spare', { n: p.spare })) + '</p>' : '') +
      (hasTable && !(R && R.has())
        ? '<p class="dk-warn">' + esc(T('dk.noTable')) + '</p>' : '');

    $('dkCount').textContent = T('dk.willMake', { n: p.slides.length });
    $('dkBuild').disabled = D.busy || !p.slides.length;
  }

  /* ── the slot editor ───────────────────────────────────────────── */

  async function openEditor(meta, deck, bytes) {
    D.ed = {
      meta: JSON.parse(JSON.stringify(meta)),
      deck, bytes, cur: 0, models: [], dirty: !meta.built0, sel: null,
      isNew: !D.tpls.some(t => t.id === meta.id),
    };
    $('tplEditor').classList.remove('hidden');
    $('tplName').value = meta.name;
    await renderRail();
    renderStage();
  }

  async function closeEditor(force) {
    if (!force && D.ed && D.ed.dirty &&
        !(await global.TableXUI.ask(T('dk.discard'), { ok: 'dk.discardOk', danger: true }))) return;
    if (D.ed && D.ed.deck) global.TableXPptx.release(D.ed.deck);
    D.ed = null;
    $('tplEditor').classList.add('hidden');
  }

  async function modelFor(i) {
    const ed = D.ed;
    if (!ed.models[i]) {
      const path = ed.meta.slides[i].path;
      const idx = ed.deck.slides.findIndex(s => s.path === path);
      ed.models[i] = idx < 0 ? { w: ed.meta.cx, h: ed.meta.cy, shapes: [] }
                             : await global.TableXPptx.slideModel(ed.deck, idx);
    }
    return ed.models[i];
  }

  async function renderRail() {
    const ed = D.ed, rail = $('tplRail');
    const parts = [];
    for (let i = 0; i < ed.meta.slides.length; i++) {
      const s = ed.meta.slides[i];
      const n = ed.meta.slots.filter(x => x.path === s.path).length;
      parts.push('<div class="tr-item' + (i === ed.cur ? ' on' : '') + '" data-slide="' + i + '">' +
        '<span class="tr-n">' + (i + 1) + '</span>' +
        // the deck's own ratio, not a hardcoded 16:9 — a 4:3 template
        // would otherwise preview letterboxed against its own thumbnails
        '<span class="tr-thumb" id="trT' + i + '" style="aspect-ratio:' +
          ed.meta.cx + ' / ' + ed.meta.cy + '"></span>' +
        '<span class="tr-tags">' +
          (s.repeat ? '<span class="tr-tag rep">' + esc(T('dk.repeat')) + '</span>' : '') +
          (n ? '<span class="tr-tag">' + n + '</span>' : '') +
        '</span>' +
        '<span class="tr-ops">' +
          '<button data-up="' + i + '" title="' + esc(T('dk.up')) + '">▲</button>' +
          '<button data-down="' + i + '" title="' + esc(T('dk.down')) + '">▼</button>' +
          '<button class="danger" data-dels="' + i + '" title="' + esc(T('dk.dropSlide')) + '">✕</button>' +
        '</span></div>');
    }
    rail.innerHTML = parts.join('') ||
      '<p class="ed-msg">' + esc(T('dk.noSlidesLeft')) + '</p>';

    // thumbnails fill in behind the rail; a 30-slide deck must not block
    for (let i = 0; i < ed.meta.slides.length; i++) {
      const host = $('trT' + i);
      if (!host) continue;
      const m = await modelFor(i);
      host.innerHTML = paintSlide(m, ed.meta.cx, ed.meta.cy, true);
    }
  }

  // The preview is a wireframe, on purpose: real background, real pictures,
  // text roughly where and how big it sits. It exists so someone can point
  // at a place on a slide, not to be a PowerPoint renderer.
  function paintSlide(m, cx, cy, small) {
    const pc = (v, total) => (v / total * 100).toFixed(3) + '%';
    let h = '';
    if (m.bg && m.bg.image) {
      h += '<div class="sl-bg" style="background-image:url(' + m.bg.image + ')"></div>';
    } else if (m.bg && m.bg.color) {
      h += '<div class="sl-bg" style="background:' + esc(m.bg.color) + '"></div>';
    }
    const dark = m.bg && m.bg.color ? isDark(m.bg.color) : false;
    for (const s of m.shapes) {
      const st = 'left:' + pc(s.x, cx) + ';top:' + pc(s.y, cy) +
                 ';width:' + pc(s.w, cx) + ';height:' + pc(s.h, cy) +
                 (s.rot ? ';transform:rotate(' + s.rot.toFixed(2) + 'deg)' : '');
      if (s.kind === 'pic' && s.src) {
        h += '<img class="sl-pic" style="' + st + '" src="' + s.src + '" alt=""/>';
      } else if (s.kind === 'sp') {
        const fill = s.fill ? ';background:' + esc(s.fill) : '';
        const col = s.color ? esc(s.color) : (dark ? '#e8ecf0' : '#2c3038');
        // At thumbnail size type is unreadable, and drawing nothing made
        // every text-only slide an identical white rectangle in the rail.
        // A tinted block in the text's own colour is legible as "words go
        // here" at 150px wide.
        if (small) {
          h += '<div class="sl-sp sm" style="' + st + ';color:' + col + '"></div>';
        } else {
          const fs = Math.max(7, (s.fontPt || 14) * 0.62);
          h += '<div class="sl-sp" style="' + st + fill + ';color:' + col +
               ';font-size:' + fs.toFixed(1) + 'px' +
               ';text-align:' + (s.align === 'ctr' ? 'center' : s.align === 'l' ? 'left' : 'right') +
               '">' + esc(s.text || '') + '</div>';
        }
      } else {
        h += '<div class="sl-frame" style="' + st + '"></div>';
      }
    }
    return h;
  }

  function isDark(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return false;
    const n = parseInt(m[1], 16);
    return (((n >> 16 & 255) * 299 + (n >> 8 & 255) * 587 + (n & 255) * 114) / 1000) < 140;
  }

  async function renderStage() {
    const ed = D.ed;
    const stage = $('tplStage');
    if (!ed.meta.slides.length) { stage.innerHTML = ''; return; }
    ed.cur = Math.max(0, Math.min(ed.cur, ed.meta.slides.length - 1));
    const m = await modelFor(ed.cur);
    stage.style.aspectRatio = ed.meta.cx + ' / ' + ed.meta.cy;

    const path = ed.meta.slides[ed.cur].path;
    const slots = ed.meta.slots.filter(s => s.path === path);
    const pc = (v, t) => (v / t * 100).toFixed(3) + '%';

    stage.innerHTML = paintSlide(m, ed.meta.cx, ed.meta.cy, false) +
      slots.map(s =>
        '<div class="slot' + (s.kind === 'table' ? ' table' : '') +
          (s.id === ed.sel ? ' on' : '') + '" data-slot="' + esc(s.id) + '" style="' +
          'left:' + pc(s.x, ed.meta.cx) + ';top:' + pc(s.y, ed.meta.cy) +
          ';width:' + pc(s.w, ed.meta.cx) + ';height:' + pc(s.h, ed.meta.cy) + '">' +
          '<span class="slot-lb">' + esc(T(s.kind === 'table' ? 'dk.slotTable' : 'dk.slotImage')) + '</span>' +
          '<span class="slot-h nw"></span><span class="slot-h ne"></span>' +
          '<span class="slot-h sw"></span><span class="slot-h se"></span>' +
        '</div>').join('');

    $('tplRepeat').classList.toggle('on', !!ed.meta.slides[ed.cur].repeat);
    $('tplPos').textContent = T('dk.slideOf',
      { n: ed.cur + 1, total: ed.meta.slides.length });
    $('tplDelSlot').disabled = !ed.sel;
    $('tplSave').textContent = ed.dirty
      ? T('dk.saveN', { n: ed.meta.slots.length }) : T('dk.save');
  }

  function addSlot(kind) {
    const ed = D.ed;
    if (!ed.meta.slides.length) return;
    const path = ed.meta.slides[ed.cur].path;
    // A new slot lands in the middle at half size — big enough to grab,
    // and never off-slide where it cannot be found.
    const s = {
      id: 's' + Math.random().toString(36).slice(2, 9),
      path, kind,
      x: Math.round(ed.meta.cx * 0.25), y: Math.round(ed.meta.cy * 0.25),
      w: Math.round(ed.meta.cx * 0.5), h: Math.round(ed.meta.cy * 0.5),
    };
    ed.meta.slots.push(s);
    ed.sel = s.id;
    ed.dirty = true;
    renderStage();
    renderRail();
  }

  /* Drag and resize, in EMU. The stage is a percentage layout, so the only
     conversion needed is pixels -> EMU through the stage's current width;
     that keeps slots correct when the window resizes mid-edit. */
  function wireStage() {
    const stage = $('tplStage');
    let drag = null;

    stage.addEventListener('pointerdown', e => {
      const el = e.target.closest('.slot');
      if (!el) return;
      const ed = D.ed;
      const s = ed.meta.slots.find(x => x.id === el.dataset.slot);
      if (!s) return;
      const r = stage.getBoundingClientRect();
      const handle = e.target.classList.contains('slot-h')
        ? [...e.target.classList].find(c => ['nw', 'ne', 'sw', 'se'].includes(c)) : null;
      drag = { s, el, handle, sx: e.clientX, sy: e.clientY,
               ox: s.x, oy: s.y, ow: s.w, oh: s.h,
               kx: ed.meta.cx / r.width, ky: ed.meta.cy / r.height };
      ed.sel = s.id;
      stage.setPointerCapture(e.pointerId);
      e.preventDefault();
      renderSelection();
    });

    stage.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = (e.clientX - drag.sx) * drag.kx, dy = (e.clientY - drag.sy) * drag.ky;
      const s = drag.s, M = D.ed.meta, MIN = EMU * 0.2;
      if (!drag.handle) {
        s.x = clamp(drag.ox + dx, 0, M.cx - s.w);
        s.y = clamp(drag.oy + dy, 0, M.cy - s.h);
      } else {
        const west = drag.handle[1] === 'w', north = drag.handle[0] === 'n';
        let x = drag.ox, y = drag.oy, w = drag.ow, h = drag.oh;
        if (west) { x = drag.ox + dx; w = drag.ow - dx; } else { w = drag.ow + dx; }
        if (north) { y = drag.oy + dy; h = drag.oh - dy; } else { h = drag.oh + dy; }
        if (w < MIN) { if (west) x = drag.ox + drag.ow - MIN; w = MIN; }
        if (h < MIN) { if (north) y = drag.oy + drag.oh - MIN; h = MIN; }
        s.x = clamp(x, 0, M.cx - MIN); s.y = clamp(y, 0, M.cy - MIN);
        s.w = Math.min(w, M.cx - s.x);  s.h = Math.min(h, M.cy - s.y);
      }
      // move the element directly rather than re-rendering the stage:
      // rebuilding the preview on every pointermove drops frames badly on
      // a slide with a full-bleed background image.
      drag.el.style.left = (s.x / M.cx * 100) + '%';
      drag.el.style.top = (s.y / M.cy * 100) + '%';
      drag.el.style.width = (s.w / M.cx * 100) + '%';
      drag.el.style.height = (s.h / M.cy * 100) + '%';
    });

    const end = () => {
      if (!drag) return;
      drag = null;
      D.ed.dirty = true;
      renderStage();
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function renderSelection() {
    const stage = $('tplStage');
    for (const el of stage.querySelectorAll('.slot')) {
      el.classList.toggle('on', el.dataset.slot === D.ed.sel);
    }
    $('tplDelSlot').disabled = !D.ed.sel;
  }

  /* ── wiring ────────────────────────────────────────────────────── */

  async function init() {
    await loadList();
    render();
    wireStage();

    $('dkTpls').addEventListener('click', async e => {
      const del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        const t = D.tpls.find(x => x.id === del.dataset.del);
        if (!t) return;
        if (!(await global.TableXUI.ask(T('dk.delConfirm', { name: t.name }),
                                        { ok: 'dk.remove', danger: true }))) return;
        await fetch('api/tpl/' + t.id, { method: 'DELETE' });
        await loadList();
        render();
        global.TableXUI.toast(T('dk.deleted', { name: t.name }));
        return;
      }
      const ed = e.target.closest('[data-edit]');
      if (ed) {
        e.stopPropagation();
        const t = D.tpls.find(x => x.id === ed.dataset.edit);
        if (!t) return;
        try {
          const bytes = await fetchDeckBytes(t.id);
          const deck = await global.TableXPptx.open(bytes, t.name);
          await openEditor({ ...t, built0: true }, deck, bytes);
        } catch (err) {
          global.TableXUI.toast(T('dk.openFail', { e: err.message }), true);
        }
        return;
      }
      const card = e.target.closest('[data-tpl]');
      if (card) { D.sel = card.dataset.tpl; render(); return; }
      if (e.target.closest('#dkNew')) $('tplFileInput').click();
    });

    $('tplFileInput').onchange = async e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) await addPptx(f);
    };
    $('imgFileInput').onchange = async e => {
      await addImages([...e.target.files]);
      e.target.value = '';
    };
    $('dkPick').onclick = () => $('imgFileInput').click();

    // drop zones
    dropZone($('dkDrop'), files => {
      const p = files.find(f => /\.pptx$/i.test(f.name));
      if (p) return addPptx(p);
      return addImages(files);
    });

    $('dkImgs').addEventListener('click', e => {
      const rm = e.target.closest('[data-rmimg]');
      if (rm) {
        const i = +rm.dataset.rmimg;
        URL.revokeObjectURL(D.imgs[i].url);
        D.imgs.splice(i, 1);
        return render();
      }
      const mv = e.target.closest('[data-mv]');
      if (mv) {
        const [i, d] = mv.dataset.mv.split(':').map(Number);
        const j = i + d;
        if (j < 0 || j >= D.imgs.length) return;
        const t = D.imgs[i]; D.imgs[i] = D.imgs[j]; D.imgs[j] = t;
        return render();
      }
    });

    $('dkClear').onclick = () => {
      for (const im of D.imgs) URL.revokeObjectURL(im.url);
      D.imgs = [];
      render();
    };

    $('dkBuild').onclick = async () => {
      const tpl = D.tpls.find(t => t.id === D.sel);
      if (!tpl || D.busy) return;
      D.busy = true; render();
      try {
        const blob = await build(tpl);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (tpl.name || 'deck').replace(/[\\/:*?"<>|]/g, '_') + '.pptx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        global.TableXUI.toast(T('dk.built', { n: plan(tpl).slides.length }));
      } catch (e) {
        global.TableXUI.toast(T('dk.buildFail', { e: e.message }), true);
      } finally {
        D.busy = false; render();
      }
    };

    // ── editor ──
    $('tplClose').onclick = () => closeEditor();
    $('tplCancel').onclick = () => closeEditor();
    $('tplName').oninput = () => { D.ed.meta.name = $('tplName').value; D.ed.dirty = true; };
    $('tplAddImg').onclick = () => addSlot('image');
    $('tplAddTbl').onclick = () => addSlot('table');
    $('tplDelSlot').onclick = () => {
      const ed = D.ed;
      ed.meta.slots = ed.meta.slots.filter(s => s.id !== ed.sel);
      ed.sel = null; ed.dirty = true;
      renderStage(); renderRail();
    };
    $('tplRepeat').onclick = () => {
      const s = D.ed.meta.slides[D.ed.cur];
      if (!s) return;
      s.repeat = !s.repeat;
      D.ed.dirty = true;
      renderStage(); renderRail();
    };

    $('tplRail').addEventListener('click', async e => {
      const ed = D.ed;
      const up = e.target.closest('[data-up]'), dn = e.target.closest('[data-down]');
      const del = e.target.closest('[data-dels]');
      if (up || dn) {
        const i = +(up || dn).dataset[up ? 'up' : 'down'], j = i + (up ? -1 : 1);
        if (j < 0 || j >= ed.meta.slides.length) return;
        const t = ed.meta.slides[i]; ed.meta.slides[i] = ed.meta.slides[j]; ed.meta.slides[j] = t;
        const mt = ed.models[i]; ed.models[i] = ed.models[j]; ed.models[j] = mt;
        if (ed.cur === i) ed.cur = j; else if (ed.cur === j) ed.cur = i;
        ed.dirty = true;
        await renderRail(); renderStage();
        return;
      }
      if (del) {
        const i = +del.dataset.dels;
        const path = ed.meta.slides[i].path;
        ed.meta.slides.splice(i, 1);
        ed.models.splice(i, 1);
        ed.meta.slots = ed.meta.slots.filter(s => s.path !== path);
        ed.dirty = true;
        await renderRail(); renderStage();
        return;
      }
      const it = e.target.closest('[data-slide]');
      if (it) { ed.cur = +it.dataset.slide; ed.sel = null; await renderRail(); renderStage(); }
    });

    $('tplSave').onclick = async () => {
      const ed = D.ed;
      if (!ed) return;
      const btn = $('tplSave');
      btn.disabled = true;
      try {
        ed.meta.name = ($('tplName').value || '').trim() || T('dk.untitled');
        const meta = { ...ed.meta };
        delete meta.built0;
        await saveTemplate(meta, ed.isNew ? ed.bytes : null);
        D.sel = meta.id;
        await loadList();
        render();
        await closeEditor(true);
        global.TableXUI.toast(T('dk.saved', { name: meta.name }));
      } catch (e) {
        global.TableXUI.toast(T('dk.saveFail', { e: e.message }), true);
      } finally {
        btn.disabled = false;
      }
    };
  }

  // A drop zone that does not hijack the whole window: the page still
  // scrolls normally and a file dropped anywhere else is the browser's
  // business, not ours.
  function dropZone(el, handler) {
    if (!el) return;
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter', 'dragover'].forEach(t => el.addEventListener(t, e => {
      stop(e); el.classList.add('over');
    }));
    ['dragleave', 'drop'].forEach(t => el.addEventListener(t, e => {
      stop(e); el.classList.remove('over');
    }));
    el.addEventListener('drop', e => {
      const files = [...(e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : [])];
      if (files.length) handler(files);
    });
  }

  global.TableXDeck = {
    init, render,
    reload: async () => { await loadList(); render(); },
    closeEditor,
    isEditorOpen: () => !!D.ed,
    _state: D,
  };
  init();
})(window);
