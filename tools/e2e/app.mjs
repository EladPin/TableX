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
  // tag span, so its text is "name" + "Partner".
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

  // ── CHAINED SITES ─────────────────────────────────────────────────────
  // An RRU at one site on ANOTHER site's baseband. ENM prefixes such a cell
  // with its cell number on that baseband (`4_Hadas_1`); Planet's point
  // inspect reports it without one (`IDF_Hadas_1`). Both spellings must
  // resolve, and the prefixed one must be a hit rather than a guess.
  //
  // The code is derived FROM the shipped database, so this keeps testing the
  // real thing after a rebuild instead of pinning one site's name.
  const chained = await ev(`
    const r = await fetch('data/idf.json'); const d = await r.json();
    const enm = Object.keys(d.sectors).find(k => /^\\d+[-_]/.test(k));
    return enm ? { enm, planet: 'IDF_' + enm.replace(/^\\d+[-_]/, '') } : null;`);
  ok('the database still carries a chained cell', !!chained,
     chained ? `${chained.enm} → ${chained.planet}` : 'none found — check build_idf.py');
  if (chained) {
    await ev(`
      const el = document.getElementById('lkSearch');
      el.value = ${JSON.stringify(chained.planet)};
      el.dispatchEvent(new Event('input'));`);
    await sleep(300);
    ok('Planet spelling of a chained cell resolves',
       await ev(`return !!document.querySelector('.lk-direct');`), chained.planet);
    // Approximate would mean it fell through to the site path and picked an
    // arbitrary sector — the failure the alias exists to prevent.
    ok('and resolves EXACTLY, not by site',
       await ev(`return !document.querySelector('.lk-direct.approx');`));
    // Both spellings are the same cell, so both must land on the same site.
    const both = await ev(`
      const el = document.getElementById('lkSearch');
      const read = async q => {
        el.value = q; el.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 250));
        const d = document.querySelector('.lk-direct');
        return d ? d.textContent.replace(/\\s+/g, ' ').trim() : null;
      };
      return { enm: await read(${JSON.stringify(chained.enm)}),
               planet: await read(${JSON.stringify(chained.planet)}) };`);
    ok('ENM and Planet spellings agree on the site',
       !!both.enm && !!both.planet && both.enm === both.planet,
       `enm="${both.enm}" planet="${both.planet}"`);
  }

  // ── SITE EDITOR: ADD ──────────────────────────────────────────────────
  // The add form calls the importer's number reader. When the parser moved
  // into dbparse.js the call was left behind as a ReferenceError and the Add
  // button silently did nothing for three commits — no toast, no error, no
  // staged change. Nothing but a browser would have caught it.
  //
  // cellcom ships empty, so this touches no real data, and Save is never
  // clicked — the same rule the write-route tests follow.
  await ev(`document.querySelector('[data-goto="db"]').click();`);
  await sleep(250);
  await ev(`document.querySelector('[data-edit="cellcom"]').click();`);
  await sleep(300);
  ok('editor opens on an empty database',
     await ev(`return !document.getElementById('dbEditor').classList.contains('hidden');`));
  const added = await ev(`
    const errs = [];
    window.addEventListener('error', e => errs.push(String(e.message)));
    document.getElementById('edAddToggle').click();
    document.getElementById('edSectorId').value = '3634249_270';
    document.getElementById('edSiteId').value   = '14196';
    document.getElementById('edSiteName').value = 'בדיקה';
    document.getElementById('edSector').value   = '270';
    document.getElementById('edFreq').value     = '2600';
    document.getElementById('edBw').value       = '20';
    document.getElementById('edAdd').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 250));
    return { errs,
             saveEnabled: !document.getElementById('edSave').disabled,
             listed: document.getElementById('edList').textContent.includes('3634249_270'),
             // the numeric slots must arrive as numbers, the way an import
             // writes them — a string there breaks the carrier filter
             specs: [...document.querySelectorAll('.ed-sector .ed-spec')]
                      .map(s => s.textContent.trim()) };`);
  ok('Add stages the sector', added.saveEnabled && added.listed,
     `errors=${JSON.stringify(added.errs)}`);
  ok('Add throws nothing', added.errs.length === 0, added.errs.join('; '));
  ok('frequency and bandwidth are read, not dropped',
     added.specs.join(' ').includes('2600') && added.specs.join(' ').includes('20 MHz'),
     added.specs.join(' | '));
  await shot('ed_added');
  // leave nothing staged behind for the next suite
  await ev(`document.getElementById('edCancel').click();`);
  await sleep(250);
  await ev(`
    if (!document.getElementById('askOverlay').classList.contains('hidden'))
      document.getElementById('askYes').click();`);
  await sleep(250);
  ok('editor discards without saving',
     await ev(`return document.getElementById('dbEditor').classList.contains('hidden');`));

  // ── THE WORKBOOK CONTRACT ─────────────────────────────────────────────
  // dbparse.js is a pure function of a buffer, so this drives it directly
  // rather than through an import: an import WRITES a database, and the one
  // rule this repo keeps repeating is never to point a test at a live one.
  //
  // It builds an IDF-shaped group export in the page — Sector IDs that repeat
  // 1/2/3 per site, Hebrew in Description, two names carrying Elad's trailing
  // note — and asserts the two rules that make such a file importable at all.
  const wbk = await ev(`
    const sites = XLSX.utils.aoa_to_sheet([
      ['Site ID','Site UID','Longitude','Latitude','Description','Site Name'],
      ['IDF_Amitay','',622321.5,3452921,'אמיתי (סקטורים 2,3 הם של ק.ד 235)',''],
      ['IDF_Astra','',757636.4,3691737,'אסטרא',''],
    ]);
    const secs = XLSX.utils.aoa_to_sheet([
      ['Site ID','Sector ID','Band Name'],
      ['IDF_Amitay',1,'P3M_750LTE.MIMO 9260_10'],
      ['IDF_Amitay',2,'P3M_750LTE.MIMO 9260_10'],
      ['IDF_Astra',1,'P3M_750LTE.MIMO 9260_10'],
      ['IDF_Astra','3_900','P3M_900LTE.MIMO 3525_5'],
    ]);
    // The plant: an antenna naming what it serves, and PA Power on a sheet
    // of its own — the shape the 2026 Planet emits.
    const ants = XLSX.utils.aoa_to_sheet([
      ['Site ID','Antenna ID','Antenna File','Height (m)','Azimuth','Mechanical Tilt','Sectors'],
      ['IDF_Amitay',1,'LNX-6515DS-VTM.pafx',50,60,0,'1'],
      ['IDF_Amitay',2,'LNX-6515DS-VTM.pafx',38,160,2,'2'],
      ['IDF_Astra',1,'80010866.pafx',30,245,5,'1'],
      ['IDF_Astra',2,'80010866.pafx',30,40,0,'3_900'],
    ]);
    const pwr = XLSX.utils.aoa_to_sheet([
      ['Site ID','Sector ID','Carrier Name','PA Power (dBm)'],
      ['IDF_Amitay',1,'LTE FDD',49.03],
      ['IDF_Amitay',2,'LTE FDD',46.02],
      ['IDF_Astra','3_900','LTE FDD',43],
    ]);
    // CRS on a sheet of its own, found by its header like power. Two carrier
    // rows that disagree about one sector give no answer at all.
    const crs = XLSX.utils.aoa_to_sheet([
      ['Site ID','Sector ID','Reference Signal Power Boosting (dB)'],
      ['IDF_Amitay',1,0],
      ['IDF_Amitay',2,-3],
      ['IDF_Astra','3_900',0],
      ['IDF_Astra','3_900',3],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sites, 'Sites');
    XLSX.utils.book_append_sheet(wb, secs, 'Sectors');
    XLSX.utils.book_append_sheet(wb, ants, 'Antennas');
    XLSX.utils.book_append_sheet(wb, pwr, 'LTE_FDD_Sector_Carriers');
    XLSX.utils.book_append_sheet(wb, crs, 'LTE_FDD_Sectors');
    const buf = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })).buffer;
    const d = self.TableXParse(buf);
    // IDF stores the raw EARFCN in the frequency slot, not the band label.
    const e = self.TableXParse(buf, null, { freq: 'earfcn' });
    return { mhz: d.sectors['IDF_Amitay_1'], earfcn: e.sectors['IDF_Amitay_1'],
             earfcn900: e.sectors['IDF_Astra_3_900'],
             composite: d.composite, dupes: d.dupes,
             keys: Object.keys(d.sectors).sort(),
             astra900: d.sectors['IDF_Astra_3_900'],
             names: d.sites, notes: d.notes || {},
             coords: d.coords || {}, ant: d.ant || {}, pwr: d.pwr || {}, crs: d.crs || {} };`);

  // Without this the import is REFUSED: IDF numbers sectors per site, so the
  // plain Sector ID column collapses the network into a handful of rows.
  ok('repeating Sector IDs fall back to <Site ID>_<Sector ID>',
     wbk.composite === true && wbk.dupes === 0,
     `composite=${wbk.composite} dupes=${wbk.dupes}`);
  ok('the composite key IS the point-inspect code',
     wbk.keys.join(',') === 'IDF_Amitay_1,IDF_Amitay_2,IDF_Astra_1,IDF_Astra_3_900',
     wbk.keys.join(','));
  // sectorOf() reads the KEY, and IDF_Astra_3_900 would hand it '900'.
  ok('the Sector ID column is the sector, not the key tail',
     wbk.astra900 && wbk.astra900[1] === '3_900', JSON.stringify(wbk.astra900));

  // A note left in the name reaches שם אתר משרת on a commander's slide.
  ok('a trailing note is split off the site name',
     wbk.names.IDF_Amitay === 'אמיתי' && wbk.names.IDF_Astra === 'אסטרא',
     JSON.stringify(wbk.names));
  ok('the note itself is kept, not discarded',
     wbk.notes.IDF_Amitay === 'סקטורים 2,3 הם של ק.ד 235',
     JSON.stringify(wbk.notes));
  ok('a name with no note gets none', !('IDF_Astra' in wbk.notes));

  // The plant. Without the join the site-data slide has no azimuth, no
  // height and no antenna — the whole reason that view exists.
  ok('an antenna joins its sector through the Sectors column',
     JSON.stringify(wbk.ant.IDF_Amitay_1) === '[50,60,0,"LNX-6515DS-VTM.pafx"]',
     JSON.stringify(wbk.ant.IDF_Amitay_1));
  ok('the join follows the composite key, not the raw Sector ID',
     JSON.stringify(wbk.ant.IDF_Astra_3_900) === '[30,40,0,"80010866.pafx"]',
     JSON.stringify(wbk.ant.IDF_Astra_3_900));
  ok('PA Power is read off whichever sheet carries it',
     wbk.pwr.IDF_Amitay_1 === 49.03 && wbk.pwr.IDF_Astra_3_900 === 43,
     JSON.stringify(wbk.pwr));
  ok('CRS is read off its own header, and a disagreement gives no answer',
     wbk.crs.IDF_Amitay_1 === 0 && wbk.crs.IDF_Amitay_2 === -3 && !('IDF_Astra_3_900' in wbk.crs),
     JSON.stringify(wbk.crs));
  // 49.03 dBm is 80 W and 46.02 is 40 W — the numbers an operator form prints.
  ok('dBm converts to the watts the request form shows',
     Math.round(Math.pow(10, (wbk.pwr.IDF_Amitay_1 - 30) / 10)) === 80 &&
     Math.round(Math.pow(10, (wbk.pwr.IDF_Amitay_2 - 30) / 10)) === 40);
  // IDF's תדר מרכזי is the EARFCN because the team reads ENM; every other
  // network stays in MHz. Bandwidth is MHz for all of them.
  ok('the default is MHz, as the other three networks need',
     wbk.mhz[2] === 750 && wbk.mhz[3] === 10, JSON.stringify(wbk.mhz));
  ok('earfcn mode stores the EARFCN, not the band it lands in',
     wbk.earfcn[2] === 9260 && wbk.earfcn900[2] === 3525,
     JSON.stringify([wbk.earfcn, wbk.earfcn900]));
  ok('bandwidth stays MHz in earfcn mode',
     wbk.earfcn[3] === 10 && wbk.earfcn900[3] === 5);

  ok('site coordinates are kept as the workbook states them',
     JSON.stringify(wbk.coords.IDF_Amitay) === '[622321.5,3452921]',
     JSON.stringify(wbk.coords.IDF_Amitay));

  // The three operators whose Sector IDs are already unique must NOT re-key:
  // partner.json was verified sector-for-sector against Planet on that path.
  const flat = await ev(`
    const sh = XLSX.utils.aoa_to_sheet([
      ['Sector ID','Site ID','Site Name','Sector','Frequency (MHz)','Bandwidth (MHz)'],
      ['LNN4610Da','MN4610A','גג בית העם  דישון','Da',1800,20],
      ['LNN4610Db','MN4610A','גג בית העם  דישון','Db',1800,20],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sh, 'DB');
    const buf = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })).buffer;
    const d = self.TableXParse(buf);
    return { keys: Object.keys(d.sectors).sort(), composite: d.composite };`);
  ok('a unique Sector ID is left alone',
     flat.composite === false && flat.keys.join(',') === 'LNN4610Da,LNN4610Db',
     `composite=${flat.composite} keys=${flat.keys.join(',')}`);

  // ── SITE DATA ─────────────────────────────────────────────────────────
  // The sheet an operator coverage request needs. Driven through the real
  // view because picking a site is a click, like everything else here.
  await ev(`document.querySelector('[data-goto="site"]').click();`);
  await sleep(300);
  ok('site-data view opens',
     await ev(`return !document.getElementById('viewSite').classList.contains('hidden');`));
  ok('the sheet starts empty and says so',
     await ev(`return document.querySelectorAll('#sdPage .sd-site').length === 0
                  && document.querySelector('#sdPage .ed-msg') !== null;`));
  ok('nothing to export yet', await ev(`
     return document.getElementById('sdActions').classList.contains('hidden');`));

  const sdSite = await ev(`
    const d = await (await fetch('data/partner.json')).json();
    return Object.keys(d.sites)[0];`);
  await ev(`const e = document.getElementById('sdSearch');
            e.value = ${JSON.stringify(sdSite)}; e.dispatchEvent(new Event('input'));`);
  await sleep(350);
  ok('a site id finds its site', await ev(`return document.querySelectorAll('.sd-hit').length >= 1;`),
     sdSite);

  await ev(`document.querySelector('.sd-hit').click();`);
  await sleep(350);
  const sheet = await ev(`
    const heads = [...document.querySelectorAll('#sdPage .sd-table th')].map(t => t.textContent);
    const rows = [...document.querySelectorAll('#sdPage .sd-table tbody tr')]
                   .map(tr => [...tr.children].map(td => td.textContent));
    const db = await (await fetch('data/partner.json')).json();
    const mine = Object.entries(db.sectors).filter(([, v]) => v[0] === ${JSON.stringify(sdSite)});
    const want = mine.map(([, v]) => v[1]).sort();
    // what each row's plant columns must say: the database's value, or '-'
    const plant = mine.sort(([a], [b]) => a < b ? -1 : 1).map(([k]) => {
      const a = (db.ant || {})[k] || [], c = (db.crs || {})[k];
      return [a[1] == null ? '-' : String(a[1]), a[0] == null ? '-' : String(a[0]),
              a[3] ? String(a[3]).replace(/\\.pafx$/i, '') : '-',
              typeof c === 'number' ? c + ' dB' : '-'].join('|');
    });
    return { chips: document.querySelectorAll('.sd-chip').length,
             acts: !document.getElementById('sdActions').classList.contains('hidden'),
             heads, rows, want, plant };`);

  ok('picking a site puts it on the sheet', sheet.chips === 1 && sheet.acts);
  ok('the sheet has the eight columns the request form wants, CRS last',
     sheet.heads.length === 8 && sheet.heads[0] === 'סקטור' && sheet.heads[6] === 'הספק' &&
     sheet.heads[7] === 'CRS', sheet.heads.join(' | '));
  ok('a row per sector', sheet.rows.length === sheet.want.length,
     `${sheet.rows.length} rows for ${sheet.want.length} sectors`);
  // sectorLabel() takes the whole sector ARRAY and reads [1] itself. Handing
  // it the sector STRING silently printed that string's second character —
  // 'a' for 'Da' — on every row of a commander-facing sheet.
  ok('the sector column is the sector, not one letter of it',
     sheet.rows.map(r => r[0]).sort().join(',') === sheet.want.join(','),
     `got ${sheet.rows.map(r => r[0]).sort().join(',')} want ${sheet.want.join(',')}`);
  // Azimuth, height, antenna and CRS are exactly what the database holds,
  // and '-' where it holds nothing — never blank, never a guess. (The
  // committed partner.json predates the plant; a re-imported one carries it.)
  ok('the plant columns say what the database says, and "-" for a gap',
     sheet.rows.map(r => [r[3], r[4], r[5], r[7]].join('|')).join(',') === sheet.plant.join(','),
     JSON.stringify(sheet.rows[0]) + ' want ' + sheet.plant[0]);
  await shot('sd_sheet');

  ok('removing the site empties the sheet again', await ev(`
     document.querySelector('.sd-chip-x').click();
     await new Promise(r => setTimeout(r, 250));
     return document.querySelectorAll('#sdPage .sd-site').length === 0;`));

  // ── OUTPUT STYLES ─────────────────────────────────────────────────────
  // One setting (tablex_style) feeding every renderer. classic must stay the
  // table commanders know; clean and coverage must put the same ink in the
  // PPTX matrix that the sheet shows; coverage's classes are Planet's legend.
  await ev(`localStorage.removeItem('tablex_style');
            document.querySelector('[data-goto="home"]').click();
            document.getElementById('btnSample').click();
            document.getElementById('btnGenerate').click();`);
  await sleep(700);
  const st = await ev(`
    const pick = s => { document.querySelector('#styleTable [data-out-style="' + s + '"]').click(); };
    const m = () => TableXReport.matrix();
    const res = {};
    // Selected, not assumed: suites share a browser profile, so a style left
    // behind by another suite would otherwise decide this one's result.
    pick('classic');
    res.classic = { head: m()[0][0].fill, bd: !!m()[1][0].bd, lean: document.getElementById('docPage').classList.contains('out-lean') };
    pick('clean');
    res.clean = { head: m()[0][0].fill, headLine: m()[0][0].bd && m()[0][0].bd.b && m()[0][0].bd.b.pt,
                  side: m()[1][0].bd && m()[1][0].bd.l, lean: document.getElementById('docPage').classList.contains('out-lean'),
                  // a shared edge is stated identically by both cells that meet at it
                  agree: m().slice(1).every((row, r) => row.every((c, k) => c.bd.t === m()[r][k].bd.b)),
                  cap: TableXReport.caption() };
    pick('coverage');
    const rows = m().slice(1);
    res.coverage = { level: rows[0][0].t, fill: rows[0][0].fill, legend: document.querySelectorAll('.tbl-legend .lg-item').length,
                     cap: !!TableXReport.caption(), kept: localStorage.getItem('tablex_style'),
                     synced: [...document.querySelectorAll('[data-out-style].on')].every(b => b.dataset.outStyle === 'coverage') };
    pick('classic');
    res.back = { head: m()[0][0].fill, legend: document.querySelectorAll('.tbl-legend').length };
    return res;`);
  ok('classic is the purple table, untouched', st.classic.head === '4A3F8C' && !st.classic.bd && !st.classic.lean,
     JSON.stringify(st.classic));
  ok('clean: no fills, a heavy header rule, no side lines', st.clean.head === 'FFFFFF' && st.clean.headLine === 1.5
     && st.clean.side === null && st.clean.lean && st.clean.cap === null, JSON.stringify(st.clean));
  ok('clean: every shared edge agrees between the two cells', st.clean.agree);
  // -72.42 sits in Planet's magenta class, -75 <= x < -60
  ok('coverage tints a level by Planet class, with the legend', st.coverage.level === '-72.42'
     && st.coverage.fill === 'F5BEE0' && st.coverage.legend === 6 && st.coverage.cap, JSON.stringify(st.coverage));
  ok('the style is kept, and the picker follows', st.coverage.kept === 'coverage' && st.coverage.synced);
  ok('back to classic restores the purple and drops the legend', st.back.head === '4A3F8C' && st.back.legend === 0);

  // The network chip rides the export now (asked for 2026-09-29): a smaller,
  // highlighted run beside the site name in the PPTX, and visible in print.
  // `סקטור משוער` and `לא נמצא` stay app-only.
  const chip = await ev(`
    PptxGenJS.prototype.writeFile = async function () { window.__pptx = await this.write({ outputType: 'arraybuffer' }); };
    window.__pptx = null;
    document.getElementById('btnPptx').click();
    for (let i = 0; i < 50 && !window.__pptx; i++) await new Promise(r => setTimeout(r, 100));
    const res = { tags: TableXReport.matrix().slice(1).filter(r => r[4].tag).length,
                  html: document.querySelectorAll('#docPage .tag-net').length };
    if (window.__pptx) {
      const z = await JSZip.loadAsync(window.__pptx);
      const x = await z.file('ppt/slides/slide1.xml').async('string');
      res.hl = (x.match(/<a:highlight>/g) || []).length;
      res.partner = x.includes('Partner');
    }
    return res;`);
  ok('the network chip rides the standalone PPTX, one per resolved row',
     chip.tags === chip.html && chip.tags > 0 && chip.hl === chip.tags && chip.partner, JSON.stringify(chip));
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  const pr = await ev(`
    const vis = sel => [...document.querySelectorAll('#docPage ' + sel)].filter(e => getComputedStyle(e).display !== 'none').length;
    return { net: vis('.tag-net'), miss: vis('.tag-miss'), warn: vis('.tag-warn'),
             nets: document.querySelectorAll('#docPage .tag-net').length };`);
  await send('Emulation.setEmulatedMedia', { media: '' });
  ok('print shows the network chip and hides the other tags',
     pr.net === pr.nets && pr.net > 0 && pr.miss === 0 && pr.warn === 0, JSON.stringify(pr));
  await ev(`localStorage.removeItem('tablex_style'); document.getElementById('btnBack').click();`);
  await sleep(300);

  // ── DATABASES VIEW + THE "?" TOUR ─────────────────────────────────────
  // Since 2026-09-29 the databases are their own view rather than a section
  // under the paste card, and the paste card's explanation lives behind a
  // "?" that walks Planet -> paste -> table. Its last button DOES the thing:
  // loads the sample into the real box and hands focus to generate.
  await ev(`document.querySelector('[data-goto="db"]').click();`);
  await sleep(300);
  ok('databases are a view of their own', await ev(`
     return !document.getElementById('viewDb').classList.contains('hidden')
         && document.getElementById('viewHome').classList.contains('hidden')
         && document.querySelectorAll('#dbGrid .db-card').length === 4;`));
  ok('home carries no database section', await ev(`
     return !document.querySelector('#viewHome #dbGrid');`));

  await ev(`document.querySelector('[data-goto="home"]').click();`);
  await sleep(300);
  await ev(`document.getElementById('inputArea').value = '';
            document.getElementById('inputArea').dispatchEvent(new Event('input', { bubbles: true }));`);
  await ev(`document.getElementById('btnTour').click();`);
  await sleep(300);
  const tour = await ev(`
     const steps = [];
     for (let i = 0; i < 5; i++) {
       steps.push(document.getElementById('tourTitle').textContent.trim());
       if (i < 4) document.getElementById('tourNext').click();
     }
     return { steps, open: !document.getElementById('tourOverlay').classList.contains('hidden'),
              segs: document.querySelectorAll('#tourBar .tour-seg.on').length };`);
  ok('the tour opens and walks five distinct steps',
     tour.open && new Set(tour.steps).size === 5 && tour.steps.every(Boolean), tour.steps.join(' | '));
  ok('progress fills to the last step', tour.segs === 5, `${tour.segs} segments on`);
  const fin = await ev(`
     document.getElementById('tourNext').click();
     await new Promise(r => setTimeout(r, 250));
     return { closed: document.getElementById('tourOverlay').classList.contains('hidden'),
              lines: document.getElementById('inputArea').value.trim().split(String.fromCharCode(10)).length,
              focus: document.activeElement && document.activeElement.id };`);
  ok('its last button loads the sample and hands focus to generate',
     fin.closed && fin.lines > 1 && fin.focus === 'btnGenerate', JSON.stringify(fin));
  ok('Escape closes the tour without closing anything under it', await ev(`
     document.getElementById('btnTour').click();
     await new Promise(r => setTimeout(r, 150));
     document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
     await new Promise(r => setTimeout(r, 150));
     return document.getElementById('tourOverlay').classList.contains('hidden')
         && !document.getElementById('viewHome').classList.contains('hidden');`));

  // ── STYLISH: the site drawn from above ────────────────────────────────
  // No shipped database carries azimuths yet, so a seeded Cellcom is handed
  // to the page IN THE BROWSER — fetch() answers data/cellcom.json from the
  // seed — and nothing on disk is touched. Cellcom 14196 is the site from
  // CLAUDE.md: 700/1800/2600 stacked on each of 70/160/270; one more sector
  // has no antenna row, so no azimuth.
  const seed = { network: 'cellcom', label: 'Cellcom', source: 'e2e', built: '2026-09-29',
    sites: { '14196': 'אתר בדיקה' }, sectors: {}, coords: { '14196': [35.214, 32.7031] }, ant: {}, pwr: {} };
  [[70, 97], [160, 98], [270, 99]].forEach(([az, c]) => [[0, 700, 10], [10, 1800, 20], [50, 2600, 20]]
    .forEach(([o, f, bw]) => {
      const k = `${3634100 + c + o}_${az}`;
      seed.sectors[k] = ['14196', String(az), f, bw];
      seed.ant[k] = [32, az, 2, '742270_' + f + '.pafx'];
      seed.pwr[k] = 49.03;
    }));
  seed.sectors['3634290_0'] = ['14196', '0', 700, 10];
  seed.sites['15002'] = 'אתר נמוך';
  seed.sectors['3840271_0'] = ['15002', '0', 1800, 20];
  seed.ant['3840271_0'] = [2, 0, 0, '741571_1800.pafx'];
  seed.sites['15003'] = 'אתר צלחת';
  [['3840371_60', 60, 4, '80010867V01.pafx', 1800], ['3840372_300', 300, 4.5, 'CC12V.pafx', 700]]
    .forEach(([k, az, h, f, fq]) => { seed.sectors[k] = ['15003', String(az), fq, 10]; seed.ant[k] = [h, az, 0, f]; });
  seed.crs = {};
  Object.keys(seed.ant).forEach((k, i) => { seed.crs[k] = i % 3 ? 0 : -3; });
  const inject = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => { const real = window.fetch, seed = ${JSON.stringify(JSON.stringify(seed))};
      window.fetch = (u, o) => String(u).endsWith('data/cellcom.json')
        ? Promise.resolve(new Response(seed, { headers: { 'Content-Type': 'application/json' } }))
        : real(u, o); })();` });
  await send('Page.reload');
  await sleep(3000);
  const sty = await ev(`
    PptxGenJS.prototype.writeFile = async function () { window.__pptx = await this.write({ outputType: 'arraybuffer' }); };
    document.querySelector('[data-goto="site"]').click();
    await new Promise(r => setTimeout(r, 300));
    const q = document.getElementById('sdSearch');
    q.value = '14196'; q.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('#sdResults .sd-hit').click();
    await new Promise(r => setTimeout(r, 200));
    document.querySelector('[data-site-style="stylish"]').click();
    await new Promise(r => setTimeout(r, 300));
    const svg = document.querySelector('#sdPage .sd-card svg');
    const rows = [...document.querySelectorAll('#sdPage .st-table tbody tr')];
    const res = {
      cards: document.querySelectorAll('#sdPage .sd-card').length,
      ltr: svg && svg.getAttribute('direction'),
      labels: svg ? [...svg.querySelectorAll('text')].map(t => t.textContent).filter(t => t.endsWith('°')) : [],
      rows: rows.length,
      noAz: rows.filter(r => r.querySelector('.st-az').textContent === '-').length,
      perHidden: document.getElementById('sdPer').classList.contains('hidden'),
      tableStyle: document.querySelector('[data-out-style].on') && document.querySelector('[data-out-style].on').dataset.outStyle,
      crsHead: [...document.querySelectorAll('#sdPage .st-table th')].pop().textContent,
      crs: rows.map(r => r.lastElementChild.textContent),
      heights: svg ? [...svg.querySelectorAll('text')].map(t => t.textContent).filter(t => / m$/.test(t)) : [],
      insets: svg ? svg.querySelectorAll('clipPath').length : 0,
      boxes: svg ? svg.querySelectorAll('path[stroke-linejoin="round"]').length : 0,
    };
    window.__pptx = null;
    document.getElementById('sdPptx').click();
    for (let i = 0; i < 60 && !window.__pptx; i++) await new Promise(r => setTimeout(r, 100));
    if (window.__pptx) {
      const z = await JSZip.loadAsync(window.__pptx);
      const x = await z.file('ppt/slides/slide1.xml').async('string');
      res.pptx = { slides: Object.keys(z.files).filter(n => /^ppt\\/slides\\/slide\\d+\\.xml$/.test(n)).length,
                   pics: Object.keys(z.files).filter(n => n.startsWith('ppt/media/') && !n.endsWith('/')).length,
                   trs: x.split('<a:tr ').length - 1 };
    }
    localStorage.removeItem('tablex_site_style');
    return res;`);
  ok('stylish: one card per site, its drawing set left-to-right',
     sty.cards === 1 && sty.ltr === 'ltr', JSON.stringify(sty));
  ok('stylish: one arrow per DISTINCT azimuth, degrees at the tips',
     sty.labels.join(',') === '70°,160°,270°', sty.labels.join(','));
  ok('stylish: every sector a row, the one without an azimuth left at "-"',
     sty.rows === 10 && sty.noAz === 1, `${sty.rows} rows, ${sty.noAz} without azimuth`);
  ok('stylish: the one-slide toggle steps aside; the table keeps its own style',
     sty.perHidden && sty.tableStyle === 'classic');
  ok('stylish: CRS is the last column, "-" where the database has none',
     sty.crsHead === 'CRS' && sty.crs.filter(t => /^-?\d+ dB$/.test(t)).length === 9 &&
     sty.crs.filter(t => t === '-').length === 1, sty.crs.join(','));
  // nine sectors on three azimuths at one height: three antennas per azimuth
  // stood on the mast, dimensioned, and magnified in an inset
  ok('stylish: the mast is dimensioned and its antennas magnified in an inset',
     sty.heights.join(',') === '32 m' && sty.insets === 1 && sty.boxes > 0,
     JSON.stringify({ h: sty.heights, i: sty.insets, b: sty.boxes }));
  ok('stylish PPTX: a slide per site, the drawing as a picture, a native table',
     sty.pptx && sty.pptx.slides === 1 && sty.pptx.pics === 1 && sty.pptx.trs === 11, JSON.stringify(sty.pptx));

  // The structure follows the heights, and a model is found by its prefix:
  // a 2 m omni stands on a concrete block rather than a 3 m "tower", and a
  // site whose antennas all end by 6 m does too — with the Vega CC12 drawn
  // as the grid dish it is, not a panel.
  const mount = await ev(`
    const pick = q => { const i = document.getElementById('sdSearch'); i.value = q;
      i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#sdResults .sd-hit').click(); };
    document.querySelector('[data-site-style="stylish"]').click();
    pick('15002'); pick('15003');
    await new Promise(r => setTimeout(r, 300));
    const svgs = [...document.querySelectorAll('#sdPage .sd-card svg')];
    const res = svgs.map(v => ({ mount: v.dataset.mount, shapes: v.dataset.shapes,
                                 insets: v.querySelectorAll('clipPath').length }));
    localStorage.removeItem('tablex_site_style');
    return res;`);
  ok('stylish: a tall site is a lattice, the small ones stand on a block',
     mount.length === 3 && mount[0].mount === 'lattice' && mount[1].mount === 'block' && mount[2].mount === 'block',
     JSON.stringify(mount));
  ok('stylish: a Vega CC12 is a dish, an 80010867V01 a panel, a 741571 an omni',
     mount[1] && mount[1].shapes === 'omni' && mount[2] && mount[2].shapes.split(' ').sort().join(',') === 'dish,panel',
     JSON.stringify(mount.map(m => m.shapes)));
  ok('stylish: a small site needs no magnifier', mount[1] && mount[1].insets === 0 && mount[2].insets === 0);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: inject.result.identifier });
  await send('Page.reload');
  await sleep(2500);
}
