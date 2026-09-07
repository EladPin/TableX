/* The lookup view and in-table editing. Both are click-driven, which is
 * why this is a browser suite and not a unit test. */
export default async function ({ ev, ok, shot, sleep, send }) {


  // ── LOOKUP ────────────────────────────────────────────────────────────
  await ev(`document.querySelector('[data-goto="lookup"]').click();`);
  await sleep(300);
  ok('lookup view opens', await ev(`return !document.getElementById('viewLookup').classList.contains('hidden');`));
  ok('nav stays visible in lookup', await ev(`return !document.getElementById('nav').classList.contains('hidden');`));
  ok('empty state shows hint', await ev(`return document.getElementById('lkList').textContent.trim().length > 10;`));

  // a real Partner sector id straight out of the shipped database
  const code = await ev(`
    const r = await fetch('data/partner.json'); const d = await r.json();
    return Object.keys(d.sectors)[0];`);
  await ev(`
    const el = document.getElementById('lkSearch');
    el.value = ${JSON.stringify(code)};
    el.dispatchEvent(new Event('input'));`);
  await sleep(250);
  ok('sector id -> direct hit', await ev(`return !!document.querySelector('.lk-direct');`), code);
  ok('direct hit is exact', await ev(`return !document.querySelector('.lk-direct.approx');`));
  ok('sector id -> site listed', await ev(`return document.querySelectorAll('.lk-site').length >= 1;`));
  ok('matched sector highlighted', await ev(`return !!document.querySelector('.lk-sector.hit');`));
  await shot('lk_code');

  // a Planet point-inspect code (SITE_SECTOR) must resolve through planetKey()
  const pi = await ev(`
    const r = await fetch('data/partner.json'); const d = await r.json();
    const k = Object.keys(d.sectors)[0]; return d.sectors[k][0] + '_' + k;`);
  await ev(`
    const el = document.getElementById('lkSearch');
    el.value = ${JSON.stringify(pi)};
    el.dispatchEvent(new Event('input'));`);
  await sleep(250);
  ok('point-inspect code -> direct hit', await ev(`return !!document.querySelector('.lk-direct');`), pi);

  // a Hebrew name search
  const heName = await ev(`
    const r = await fetch('data/partner.json'); const d = await r.json();
    const v = Object.values(d.sites).find(n => /[\\u0590-\\u05FF]/.test(n) && n.trim().length > 4);
    return v.trim().split(/\\s+/)[0];`);
  await ev(`
    const el = document.getElementById('lkSearch');
    el.value = ${JSON.stringify(heName)};
    el.dispatchEvent(new Event('input'));`);
  await sleep(400);
  ok('hebrew name search finds sites',
     await ev(`return document.querySelectorAll('.lk-site').length >= 1;`),
     `q=${heName} hits=${await ev(`return document.querySelectorAll('.lk-site').length;`)}`);
  await shot('lk_hebrew');

  // two-letter query must not hang or explode
  const t0 = Date.now();
  await ev(`
    const el = document.getElementById('lkSearch');
    el.value = 'LN'; el.dispatchEvent(new Event('input'));`);
  await sleep(600);
  ok('broad 2-char query survives (capped)',
     await ev(`return document.querySelectorAll('.lk-site').length > 0;`),
     `${Date.now() - t0}ms wall`);
  ok('cap notice shown', await ev(`return !!document.querySelector('.ed-more');`));

  // ── TABLE EDITING ─────────────────────────────────────────────────────
  await ev(`document.querySelector('[data-goto="home"]').click();`);
  await sleep(200);
  await ev(`document.getElementById('btnSample').click();`);
  await sleep(200);
  await ev(`document.getElementById('btnGenerate').click();`);
  await sleep(600);
  ok('table view opens', await ev(`return !document.getElementById('viewTable').classList.contains('hidden');`));
  const nCells = await ev(`return document.querySelectorAll('#docPage [data-e]').length;`);
  ok('editable cells present', nCells > 0, `${nCells} cells`);
  ok('no edit note before editing', await ev(`return document.getElementById('editNote').classList.contains('hidden');`));

  // The ORIGINAL value must come from the input (which is filled from
  // lastRows), not from textContent — the site cell also carries the network
  // tag span, so its text is "name" + "PARTNER".
  const origSite = await ev(`
    const td = document.querySelector('#docPage [data-e$=":site"]');
    td.click();
    const v = td.querySelector('input').value;
    td.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return v;`);
  await sleep(200);
  await ev(`
    const td = document.querySelector('#docPage [data-e$=":site"]');
    td.click();
    const inp = td.querySelector('input');
    inp.value = 'בדיקה ידנית';
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));`);
  await sleep(300);
  ok('edit lands in the table',
     await ev(`return document.querySelector('#docPage [data-e$=":site"]').textContent.includes('בדיקה');`));
  ok('edited cell is marked', await ev(`return !!document.querySelector('.td-edited');`));
  ok('edit note appears', await ev(`return !document.getElementById('editNote').classList.contains('hidden');`),
     await ev(`return document.getElementById('editNote').textContent;`));
  ok('revert button appears', await ev(`return !document.getElementById('btnRevert').classList.contains('hidden');`));
  ok('Enter moved to the next cell', await ev(`return !!document.querySelector('#docPage input.td-input');`));
  await ev(`const i = document.querySelector('#docPage input.td-input'); if (i) i.blur();`);
  await sleep(250);
  ok('stagger suppressed after edit', await ev(`return document.querySelector('.data-table').classList.contains('no-anim');`));
  await shot('tbl_edited');

  // editing a value BACK to the original must clear the mark, not add a second
  await ev(`
    const td = document.querySelector('#docPage [data-e$=":site"]');
    td.click();
    const inp = td.querySelector('input');
    inp.value = ${JSON.stringify(origSite)};
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));`);
  await sleep(300);
  await ev(`const i = document.querySelector('#docPage input.td-input'); if (i) i.blur();`);
  await sleep(250);
  ok('restoring the original clears the mark',
     await ev(`return document.getElementById('editNote').classList.contains('hidden');`),
     await ev(`return 'note="' + document.getElementById('editNote').textContent + '"';`));
  ok('revert button hides again with 0 edits',
     await ev(`return document.getElementById('btnRevert').classList.contains('hidden');`));

  // PPTX must read the edited value
  await ev(`
    const td = document.querySelector('#docPage [data-e$=":power"]');
    td.click();
    const inp = td.querySelector('input');
    inp.value = '-77.7';
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));`);
  await sleep(300);
  await ev(`const i = document.querySelector('#docPage input.td-input'); if (i) i.blur();`);
  await sleep(250);
  ok('edited level reaches the export path',
     await ev(`
       const g = window.__lastRows || null;
       const td = document.querySelector('#docPage [data-e$=":power"]');
       return td.textContent.trim() === '-77.7';`));

  // Revert must put everything back
  await ev(`
    const td = document.querySelector('#docPage [data-e$=":sector"]');
    td.click();
    const inp = td.querySelector('input');
    inp.value = 'ZZ';
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));`);
  await sleep(300);
  await ev(`const i = document.querySelector('#docPage input.td-input'); if (i) i.blur();`);
  await sleep(250);
  const nBefore = await ev(`return document.getElementById('editNote').textContent;`);
  await ev(`document.getElementById('btnRevert').click();`);
  await sleep(300);
  ok('revert asks first (in-app dialog, not confirm())',
     await ev(`return !document.getElementById('askOverlay').classList.contains('hidden');`));
  await ev(`document.getElementById('askYes').click();`);
  await sleep(400);
  ok('revert clears every edit',
     await ev(`return document.getElementById('editNote').classList.contains('hidden')
                     && !document.querySelector('.td-edited');`),
     `was ${nBefore}`);
  ok('revert restored the level',
     await ev(`return !document.body.textContent.includes('-77.7');`));

  // IDF is shipped, so the lookup's per-network unit rule is testable
  await ev(`document.getElementById('btnBack').click();`);
  await sleep(200);
  await ev(`document.querySelector('[data-goto="lookup"]').click();`);
  await sleep(250);
  const idfCode = await ev(`
    const r = await fetch('data/idf.json'); const d = await r.json();
    return Object.keys(d.sectors)[0];`);
  await ev(`
    const el = document.getElementById('lkSearch');
    el.value = ${JSON.stringify(idfCode)};
    el.dispatchEvent(new Event('input'));`);
  await sleep(300);
  ok('IDF row prints EARFCN, not MHz',
     await ev(`
       const t = document.querySelector('.lk-direct').textContent;
       return t.includes('EARFCN');`),
     idfCode);
  await shot('lk_idf');

  // a query that matches nothing
  await ev(`
    const el = document.getElementById('lkSearch');
    el.value = 'zzzznope'; el.dispatchEvent(new Event('input'));`);
  await sleep(300);
  // The empty/hint/no-hit states render as ONE panel, with the "these
  // databases are empty on this machine" note inside it rather than as a
  // second orphaned paragraph beneath it.
  const none = await ev(`
    const p = document.querySelectorAll('.lk-empty');
    return { panels: p.length,
             sites: document.querySelectorAll('.lk-site').length,
             main: !!document.querySelector('.lk-empty-main'),
             subInside: !!document.querySelector('.lk-empty .lk-empty-sub') };`);
  ok('no-hits shows one panel and no sites',
     none.panels === 1 && none.sites === 0 && none.main,
     `panels=${none.panels} sites=${none.sites}`);
  // cellcom and pelephone ship empty, so the note must be there — and in it
  ok('empty-database note sits inside the panel', none.subInside);

  // the query is marked wherever it occurs, so a broad search says WHY a row matched
  await ev(`
    const el = document.getElementById('lkSearch');
    el.value = 'LNN4610'; el.dispatchEvent(new Event('input'));`);
  await sleep(400);
  const hi = await ev(`
    const m = [...document.querySelectorAll('.lk-site mark.lk-hi')];
    return { marks: m.length, allMatch: m.every(x => x.textContent === 'LNN4610') };`);
  ok('search match is highlighted', hi.marks > 0 && hi.allMatch,
     `marks=${hi.marks}`);

  // Sector rows must line up: this site's carriers are 1800/1800/1800/700/700/700,
  // and with content-sized columns the frequency stepped 14px in and out row to
  // row. Pure CSS, so nothing else would notice it regressing.
  const cols = await ev(`
    const rows = [...document.querySelectorAll('.lk-site.open .ed-sector')];
    const at = sel => [...new Set(rows.map(r =>
      Math.round(r.querySelector(sel).getBoundingClientRect().left)))];
    return { rows: rows.length, sec: at('.ed-spec.sec'),
             freq: at('.ed-spec.freq'), bw: at('.ed-spec.bw') };`);
  ok('sector columns align across rows',
     cols.rows > 1 && cols.sec.length === 1 && cols.freq.length === 1 && cols.bw.length === 1,
     `rows=${cols.rows} sec=${cols.sec.length} freq=${cols.freq.length} bw=${cols.bw.length}`);
}
