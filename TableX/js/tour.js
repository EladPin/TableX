/* TableX — tour.js: the "?" on the paste card.
 *
 * The home page carries no explanation any more (2026-09-29): it is the
 * paste box and the button. Everything a new soldier needs to get a point
 * inspect out of Planet and into that box lives here instead, one step at
 * a time, each with a small drawing of the thing the step is about — the
 * Planet grid, the keys, the paste box, the table — so a step can be
 * followed without reading it twice.
 *
 * The drawings are markup, not images: no assets, nothing to go stale in a
 * second place, and they theme with the app. The sample rows in them are
 * the first two rows of app.js's SAMPLE — DATA, identical in both
 * languages, which is why they live here and not in i18n.js. The table
 * drawing uses the report's own purple and Hebrew headers, because it IS
 * the report: it does not translate, exactly like the real one.
 *
 * The last step does something rather than saying something: it loads the
 * sample into the real box (by pressing #btnSample, so app.js stays the one
 * owner of SAMPLE) and hands focus to "generate".
 *
 * The Planet-side steps (1-2) are written from what CLAUDE.md records about
 * point inspect — the tool's name, its columns, and that its grid renders
 * RTL. The exact Planet menu path was never recorded; if a soldier reports a
 * step that does not match Planet, the words are in i18n.js (tour.*).
 */
(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const T = (k, v) => global.I18N.t(k, v);
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const SEEN = 'tablex_tour_seen';

  const HEAD = ['point', 'RSRP1', 'RSRP2', 'RSRP3', 'BS1', 'BS2', 'BS3'];
  const ROWS = [
    ['1', '-72.4245', '-78.8269', '-84.1238', 'NS3373B_LNS3373Da', 'JW1038J_LJW1038Da', 'SO5093C_LSO5093Da'],
    ['2', '-76.2232', '-82.6274', '-88.9477', 'WE6261D_LWE6261Da', 'EA2362A_LEA2362Da', 'EI2402A_LEI2402Da'],
    ['3', '-80.5771', '-86.3967', '-92.9763', 'WE0777A_LWE0777Da', 'IN4699B_LIN4699Da', 'SM5402B_LSM5402Da'],
  ];

  /* ── the drawings ──────────────────────────────────────────────────── */

  // Planet's result grid. `sel` paints every row selected (step 2), which
  // also carries the key caps, so it draws one row fewer to leave them room.
  function grid(sel) {
    const cells = r => r.map((v, i) =>
      '<span class="tg-c' + (i > 3 ? ' code' : i ? ' lvl' : ' pt') + '">' + esc(v) + '</span>').join('');
    return '<div class="tf-win" dir="ltr">' +
        '<div class="tf-bar"><i></i><i></i><i></i><span>Planet — Point Inspect</span></div>' +
        '<div class="tg">' +
          '<div class="tg-r tg-h">' + cells(HEAD) + '</div>' +
          ROWS.slice(0, sel ? 2 : 3).map((r, i) => '<div class="tg-r' + (sel ? ' sel' : '') +
            '" style="--i:' + i + '">' + cells(r) + '</div>').join('') +
        '</div>' +
      '</div>';
  }

  const keys = (...k) => '<div class="tf-keys" dir="ltr">' +
    k.map((x, i) => (i ? '<span class="tf-plus">+</span>' : '') +
      '<kbd class="tf-key' + (i === k.length - 1 ? ' hit' : '') + '">' + esc(x) + '</kbd>').join('') +
    '</div>';

  // The paste box, with the column legend over it in the paste's own order.
  function pasteBox() {
    const cols = ['col.point', 'col.pwr1', 'col.pwr2', 'col.pwr3', 'col.site1', 'col.site2', 'col.site3'];
    return '<div class="tf-paste">' +
        '<div class="schema" dir="ltr">' + cols.map((k, i) =>
          '<span class="schema-cell' + (i ? '' : ' schema-pt') + '">' + esc(T(k)) + '</span>').join('') +
        '</div>' +
        '<div class="tf-ta" dir="ltr">' + ROWS.slice(0, 2).map((r, i) =>
          '<div class="tf-line" style="--i:' + i + '">' + esc(r.join('    ')) + '</div>').join('') +
          '<span class="tf-caret"></span>' +
        '</div>' +
      '</div>';
  }

  // The report — the deliverable's purple and its fixed Hebrew headers.
  // The code in the first row turns into its site name: that is the step.
  function report() {
    return '<div class="tf-doc" dir="rtl">' +
        '<div class="tf-tr tf-th"><span>שם אתר משרת</span><span>סקטור</span>' +
          '<span>תדר מרכזי</span><span>רוחב פס</span><span>עוצמה</span></div>' +
        '<div class="tf-tr"><span class="tf-morph">' +
            '<b class="tf-from" dir="ltr">LNN4610Da</b><b class="tf-to">גג בית העם  דישון</b>' +
          '</span><span>Da</span><span>1800</span><span>20</span><span dir="ltr">-72.42</span></div>' +
      '</div>';
  }

  function exportFig() {
    return '<div class="tf-export">' +
        '<div class="tf-doc tf-doc-sm" dir="rtl"><div class="tf-tr">' +
          '<span class="tf-edit">גג בית העם  דישון<i class="tf-caret"></i></span>' +
          '<span>Da</span><span>1800</span></div></div>' +
        '<div class="tf-btns">' +
          '<span class="tf-btn">' + esc(T('tbl.print')) + '</span>' +
          '<span class="tf-btn pri">' + esc(T('tbl.pptx')) + '</span>' +
        '</div>' +
      '</div>';
  }

  const STEPS = [
    { fig: () => grid(false) },
    { fig: () => grid(true) + keys('Ctrl', 'C') },
    { fig: () => pasteBox() + keys('Ctrl', 'V'), note: true },
    { fig: () => report() },
    { fig: () => exportFig() },
  ];

  /* ── the dialog ────────────────────────────────────────────────────── */
  let at = 0;
  const ov = () => $('tourOverlay');
  const isOpen = () => ov() && !ov().classList.contains('hidden');

  function render(dir) {
    const n = at + 1, total = STEPS.length, st = STEPS[at];
    $('tourBar').innerHTML = STEPS.map((_, i) =>
      '<button class="tour-seg' + (i < n ? ' on' : '') + '" data-step="' + i +
      '" aria-label="' + esc(T('tour.count', { n: i + 1, total })) + '"' +
      (i === at ? ' aria-current="step"' : '') + '></button>').join('');

    $('tourStage').innerHTML =
      '<div class="tour-step' + (dir ? (dir > 0 ? ' fwd' : ' back') : '') + '">' +
        '<div class="tour-fig">' + st.fig() + '</div>' +
        '<h2 class="tour-title" id="tourTitle">' + esc(T('tour.t' + n)) + '</h2>' +
        '<p class="tour-body">' + esc(T('tour.b' + n)) + '</p>' +
        (st.note ? '<p class="tour-note">' + esc(T('tour.n' + n)) + '</p>' : '') +
      '</div>';

    $('tourCount').textContent = T('tour.count', { n, total });
    $('tourPrev').style.visibility = at ? 'visible' : 'hidden';
    const last = at === total - 1;
    const next = $('tourNext');
    next.classList.toggle('done', last);
    next.innerHTML = '<span>' + esc(T(last ? 'tour.done' : 'tour.next')) + '</span>' +
      '<svg class="btn-arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
      '<path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function go(i) {
    const to = Math.max(0, Math.min(STEPS.length - 1, i));
    if (to === at) return;
    const dir = to > at ? 1 : -1;
    at = to;
    render(dir);
  }

  function open() {
    at = 0;
    render(0);
    ov().classList.remove('hidden');
    $('btnTour').classList.remove('nudge');
    try { localStorage.setItem(SEEN, '1'); } catch (e) { /* private mode */ }
    setTimeout(() => $('tourNext').focus(), 30);
  }

  function close(then) {
    ov().classList.add('hidden');
    if (then) then();
    else $('btnTour').focus();
  }

  // The last step's button does the thing: sample in, focus on generate,
  // and generate answers with one cue so the eye finds it.
  function finish() {
    close(() => {
      $('btnSample').click();
      const g = $('btnGenerate');
      g.classList.remove('cue');
      void g.offsetWidth;
      g.classList.add('cue');
      setTimeout(() => g.classList.remove('cue'), 2600);
      g.focus();
    });
  }

  function init() {
    if (!$('tourOverlay') || !$('btnTour')) return;
    $('btnTour').onclick = open;
    $('tourClose').onclick = () => close();
    $('tourPrev').onclick = () => go(at - 1);
    $('tourNext').onclick = () => (at === STEPS.length - 1 ? finish() : go(at + 1));
    $('tourBar').addEventListener('click', e => {
      const b = e.target.closest('[data-step]');
      if (b) go(+b.dataset.step);
    });
    ov().addEventListener('click', e => { if (e.target === ov()) close(); });

    // Captured at the document, so it is answered before app.js's own
    // Escape chain (which listens on window) can close something beneath.
    document.addEventListener('keydown', e => {
      if (!isOpen()) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      const rtl = document.documentElement.dir === 'rtl';
      if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) { e.preventDefault(); go(at + 1); }
      if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) { e.preventDefault(); go(at - 1); }
    }, true);

    // First visit: the "?" transmits twice once the loader has lifted, so
    // it is seen — never again after the tour has been opened once.
    let seen = false;
    try { seen = localStorage.getItem(SEEN) === '1'; } catch (e) { /* private mode */ }
    if (seen) return;
    const loader = $('loader');
    const arm = () => $('btnTour').classList.add('nudge');
    if (!loader || loader.classList.contains('done')) return arm();
    new MutationObserver((m, o) => {
      if (loader.classList.contains('done')) { o.disconnect(); arm(); }
    }).observe(loader, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.TableXTour = { open, isOpen };
})(window);
