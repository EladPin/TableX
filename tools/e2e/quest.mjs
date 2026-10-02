/* quest.mjs — אתרים חדשים: pick a site from a database, change it, get a workbook.
 *
 * The fixture is BUILT IN THE PAGE with the app's own SheetJS, the way the
 * deck suite builds its .pptx with PptxGenJS. The real Partner export is 8 MB
 * and lives outside the repo, so a test that needed it would only run on one
 * machine. A seven-sheet miniature exercises the same contract: the sheets
 * are found by header, so a workbook with three sites tests what one with
 * three thousand does.
 *
 * It then goes through the app's OWN importer (dbparse.js, main-thread entry)
 * — which is where the clone kit is made now — and the result is handed to a
 * reloaded page as the Pelephone database through a fetch override, the
 * app suite's trick: no database file is written, not even a .bak.
 *
 * What this is really guarding is the pair of rules that cost three trips to
 * TS to establish — the group columns, and bookSST — plus the collision guard,
 * since a Site ID that already exists would overwrite a real site for a whole
 * team if it ever reached Planet.
 */
export default async function quest({ ev, ok, sleep, open, shot, send }) {
  await open('/');

  // ── a miniature group export, parsed by the app's own importer ────────
  // Two sites, one of them the template: EA0001A carries 1800 and 700 so the
  // per-band donor has something to choose between, and 700 is EA0001A's
  // own, so its donor rows are recognisably the template's.
  const parsed = await ev(`
    const X = window.XLSX;
    const S = (rows) => X.utils.aoa_to_sheet(rows);
    const wb = X.utils.book_new();

    X.utils.book_append_sheet(wb, S([
      ['Site ID','Site UID','Longitude','Latitude','Description','Site Name','Candidate Priority'],
      ['EA0001A', '', 34.9, 32.0, 'אתר הדוגמה', '', 1],
      ['EA0002B', '', 35.1, 31.8, 'אתר אחר', '', 1],
      ['EA0009Z', '', 35.2, 31.7, 'אתר בלי סקטורים', '', 1],
    ]), 'Sites');

    X.utils.book_append_sheet(wb, S([
      ['Site ID','Antenna ID','Antenna File','Height (m)','Azimuth','Mechanical Tilt','Sectors'],
      ['EA0001A', 1, 'EGV465DR6_1800.pafx', 30, 0,   2, 'LEA0001Da'],
      ['EA0001A', 2, 'EGV465DR6_700.pafx',  28, 120, 3, 'LEA0001Ia'],
      ['EA0002B', 1, 'EGV465DR6_1800.pafx', 25, 90,  1, 'LEA0002Da'],
    ]), 'Antennas');

    X.utils.book_append_sheet(wb, S([
      ['Site ID','Antenna ID','Electrical Controller','Electrical Tilt'],
      ['EA0001A', 1, 'Default Controller', 4],
      ['EA0001A', 2, 'Default Controller', 7],
      ['EA0002B', 1, 'Default Controller', 2],
    ]), 'Antenna_Electrical_Parameters');

    X.utils.book_append_sheet(wb, S([
      ['Site ID','Sector ID','Band Name','Propagation Model','Group: PARTNER','Group: PHI_1800','Group: PHI_700'],
      ['EA0001A','LEA0001Da','1800_20','P3M_1800.pmf','TRUE','TRUE','FALSE'],
      ['EA0001A','LEA0001Ia','700_10', 'P3M_750.pmf', 'TRUE','FALSE','TRUE'],
      ['EA0002B','LEA0002Da','1800_20','P3M_1800.pmf','TRUE','TRUE','FALSE'],
    ]), 'Sectors');

    X.utils.book_append_sheet(wb, S([
      ['Site ID','Sector ID','Antenna ID','MIMO Group'],
      ['EA0001A','LEA0001Da',1,1],
      ['EA0001A','LEA0001Ia',2,1],
      ['EA0002B','LEA0002Da',1,1],
    ]), 'Sector_Antennas');

    X.utils.book_append_sheet(wb, S([
      ['Site ID','Sector ID','Carrier: 1800_20','Carrier: 700_10'],
      ['EA0001A','LEA0001Da','Allocated','Unused'],
      ['EA0001A','LEA0001Ia','Unused','Allocated'],
      ['EA0002B','LEA0002Da','Allocated','Unused'],
    ]), 'LTE_FDD_Sectors');

    X.utils.book_append_sheet(wb, S([
      ['Site ID','Sector ID','Carrier Name','Cell ID','Physical Cell ID','Physical Cell ID Group','Physical Layer ID','PA Power (dBm)','Reference Signal Power Boosting (dB)','Synchronization and broadcast power boosting (dB)'],
      ['EA0001A','LEA0001Da','1800_20_SB1', 1, 349, 116, 1, 52, 0, 3],
      ['EA0001A','LEA0001Ia','700_10_SB1',  2, 243,  81, 0, 46, 0, 3],
      ['EA0002B','LEA0002Da','1800_20_SB1', 3, 100,  33, 1, 49, 0, 3],
    ]), 'LTE_FDD_Sector_Carriers');

    const buf = X.write(wb, { bookType: 'xlsx', type: 'array', bookSST: true });
    const p = self.TableXParse(buf, null, { freq: null });
    const db = { network: 'pelephone', label: 'Pelephone', source: 'MiniExport.xlsx',
                 built: '2026-10-02', sites: p.sites, sectors: p.sectors };
    for (const k of ['notes', 'coords', 'ant', 'pwr', 'crs', 'kit']) {
      if (p[k] && Object.keys(p[k]).length) db[k] = p[k];
    }
    return db;
  `);

  const kit = parsed && parsed.kit;
  ok('the importer kept a kit', !!kit);
  ok('kit: every sheet, headers verbatim', kit && kit.sheets.length === 7
       && kit.sheets[3].head.join('|').startsWith('Site ID|Sector ID|Band Name'),
     kit && kit.sheets.map(s => s.name).join(','));
  ok('kit: one donor per band, in first-seen order',
     kit && Object.keys(kit.bands).join(',') === '1800_20,700_10',
     kit && Object.keys(kit.bands).join(','));
  ok('kit: each band parsed to [freq, bw]',
     kit && JSON.stringify(kit.bands['700_10'].fb) === '[700,10]');
  ok('kit: the donor carries a row on every sheet',
     kit && Object.keys(kit.bands['700_10'].rows).length === 6,
     kit && Object.keys(kit.bands['700_10'].rows).join(','));
  ok('kit: a site with no sector is still recorded as taken',
     kit && kit.idle.join(',') === 'EA0009Z', kit && kit.idle.join(','));
  // The fifth antenna slot: electrical tilt, read off its own sheet.
  ok('electrical tilt rides the database',
     parsed && parsed.ant.LEA0001Da[4] === 4 && parsed.ant.LEA0001Ia[4] === 7,
     parsed && JSON.stringify(parsed.ant));

  // ── IDF-style: Sector ID repeats per site ─────────────────────────────
  // The donor's rows must be found by SITE + sector, not by the sector alone
  // — `1` is a sector of every site, and the first `1` on a sheet is
  // whichever site that sheet happens to list first.
  const comp = await ev(`
    const X = window.XLSX;
    const S = (rows) => X.utils.aoa_to_sheet(rows);
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, S([
      ['Site ID','Longitude','Latitude','Description'],
      ['IDF_Bet', 622321.5, 3452921, 'בית'],
      ['IDF_Alef', 622000, 3452000, 'אלף'],
    ]), 'Sites');
    X.utils.book_append_sheet(wb, S([
      ['Site ID','Sector ID','Band Name','Propagation Model'],
      ['IDF_Alef','1','P3M_750LTE.MIMO 9260_10','P3M_750_ALEF.pmf'],
      ['IDF_Bet','1','P3M_900LTE.MIMO 3525_5','P3M_900_BET.pmf'],
      ['IDF_Bet','2','P3M_750LTE.MIMO 9260_10','P3M_750_BET.pmf'],
    ]), 'Sectors');
    X.utils.book_append_sheet(wb, S([
      ['Site ID','Sector ID','PA Power (dBm)'],
      ['IDF_Bet','1',40],
      ['IDF_Alef','1',43],
      ['IDF_Bet','2',46],
    ]), 'LTE_FDD_Sector_Carriers');
    const buf = X.write(wb, { bookType: 'xlsx', type: 'array', bookSST: true });
    const p = self.TableXParse(buf, null, { freq: 'earfcn' });
    return { composite: p.composite, kit: p.kit };
  `);
  ok('composite network: the kit says so', comp.composite && comp.kit && comp.kit.composite);
  ok('composite network: the donor rows are the donor SITE\'s',
     comp.kit && comp.kit.bands['P3M_750LTE.MIMO 9260_10'].rows.LTE_FDD_Sector_Carriers[0][0] === 'IDF_Alef'
       && comp.kit.bands['P3M_750LTE.MIMO 9260_10'].rows.LTE_FDD_Sector_Carriers[0][2] === 43,
     comp.kit && JSON.stringify(comp.kit.bands['P3M_750LTE.MIMO 9260_10'].rows.LTE_FDD_Sector_Carriers));
  ok('composite network: EARFCN bands parse to the EARFCN',
     comp.kit && JSON.stringify(comp.kit.bands['P3M_900LTE.MIMO 3525_5'].fb) === '[3525,5]');

  // ── the parsed database becomes Pelephone, for this page only ─────────
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => { const real = window.fetch, seed = ${JSON.stringify(JSON.stringify(parsed))};
      window.fetch = (u, o) => String(u).endsWith('data/pelephone.json')
        ? Promise.resolve(new Response(seed, { headers: { 'Content-Type': 'application/json' } }))
        : real(u, o); })();` });
  await send('Page.reload');
  await sleep(3000);
  await ev(`
    // Catch the generated file instead of letting the browser download it.
    window.__caught = null; window.__dl = null;
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = b => { window.__caught = b; return realCreate.call(URL, b); };
    HTMLAnchorElement.prototype.click = function () { window.__dl = this.download; };
    localStorage.setItem('tablex_coord', 'geo');
  `);

  await ev(`document.querySelector('[data-goto="quest"]').click();`);
  await sleep(300);
  ok('quest view opens',
     await ev(`return !document.getElementById('viewQuest').classList.contains('hidden');`));
  ok('the seeded network is listed as ready to copy from',
     await ev(`return document.querySelector('[data-q-net="pelephone"]').classList.contains('on');`));

  // ── step 1: pick the template out of the databases ───────────────────
  await ev(`
    const p = document.getElementById('qPick');
    p.value = 'EA0001';
    p.dispatchEvent(new Event('input'));
  `);
  await sleep(200);
  const hit = await ev(`const h = document.querySelector('.q-hit');
    return h && { n: document.querySelectorAll('.q-hit').length, net: h.dataset.net,
                  tag: h.querySelector('.tag-net').textContent };`);
  ok('the search finds the site, network detected', hit && hit.n === 1 && hit.net === 'pelephone'
       && hit.tag === 'Pelephone', JSON.stringify(hit));
  await ev(`document.querySelector('.q-hit').click();`);
  await sleep(500);

  const st = await ev(`return window.TableXQuest._state();`);
  ok('template picked', st && st.tmpl && st.tmpl.id === 'EA0001A' && st.tmpl.net === 'pelephone');
  ok('template sectors read off the database', st && st.tmpl && st.tmpl.sectors.length === 2,
     st && st.tmpl && String(st.tmpl.sectors.length));
  ok('the band is matched back from the kit',
     st && st.tmpl && st.tmpl.sectors.map(s => s.band).join(',') === '1800_20,700_10',
     st && st.tmpl && st.tmpl.sectors.map(s => s.band).join(','));
  // The plant came through the sector->antenna JOIN, not by azimuth: the two
  // sectors differ in electrical tilt (4 vs 7) and only the join tells them apart.
  ok('plant seeded, electrical tilt and CRS included',
     st && st.tmpl && st.tmpl.sectors[0].etilt === 4 && st.tmpl.sectors[1].etilt === 7
       && st.tmpl.sectors[0].pwr === 52 && st.tmpl.sectors[0].crs === 0,
     st && st.tmpl && st.tmpl.sectors.map(s => s.etilt + '/' + s.pwr + '/' + s.crs).join(' '));
  ok('a first new site was seeded', st && st.rows.length === 1);
  ok('the new site inherited the plant, not the identity',
     st && st.rows[0].sectors.length === 2 && st.rows[0].siteId === ''
       && st.rows[0].sectors[0].az === '0' && st.rows[0].sectors[1].model === 'EGV465DR6_700.pafx');
  ok('steps 2 and 3 revealed',
     await ev(`return !document.getElementById('qStep2').classList.contains('hidden')
                && !document.getElementById('qStep3').classList.contains('hidden');`));

  // ── the template can be put back ──────────────────────────────────────
  await ev(`
    const r = document.querySelector('.q-site [data-f="siteId"]');
    r.value = 'TX0001A';
    r.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-q-clear]').click();
  `);
  await sleep(300);
  ok('clearing a template with typed sites asks first',
     await ev(`return !document.getElementById('askOverlay').classList.contains('hidden');`));
  await ev(`document.getElementById('askYes').click();`);
  await sleep(500);
  ok('cleared: back to the search, the seeded sites gone',
     await ev(`const s = window.TableXQuest._state();
       return !s.tmpl && !s.rows.length && !document.getElementById('qPickBox').classList.contains('hidden');`));

  // pick it again, by Enter on the search
  await ev(`
    const p = document.getElementById('qPick');
    p.value = 'EA0001A';
    p.dispatchEvent(new Event('input'));
    p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  `);
  await sleep(500);
  ok('Enter on the search picks the first hit',
     await ev(`return (window.TableXQuest._state().tmpl || {}).id === 'EA0001A';`));

  // ── the collision guard, across EVERY database ───────────────────────
  await ev(`
    document.getElementById('qGroup').value = 'TX_Suite';
    document.getElementById('qGroup').dispatchEvent(new Event('input'));
    const r = document.querySelector('.q-site [data-f="siteId"]');
    r.value = 'EA0402C';                 // a PARTNER site, in another database
    r.dispatchEvent(new Event('input', { bubbles: true }));
  `);
  await sleep(100);
  ok('a Site ID from another network is marked as taken while typing',
     await ev(`return document.querySelector('.q-site [data-f="siteId"]').classList.contains('bad');`));
  await ev(`document.getElementById('qGo').click();`);
  await sleep(300);
  ok('...and refused at generate', await ev(`return window.__caught === null;`));
  await ev(`
    const r = document.querySelector('.q-site [data-f="siteId"]');
    r.value = 'EA0009Z';                 // in the export, with no sector — so not in the DB
    r.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('qGo').click();
  `);
  await sleep(300);
  ok('a sector-less site the kit recorded is refused too', await ev(`return window.__caught === null;`));

  // ── the sector ids follow the Site ID ─────────────────────────────────
  await ev(`
    const set = (sel, v) => {
      const el = document.querySelector(sel);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('.q-site [data-f="siteId"]', 'TX0001A');
    set('.q-site [data-f="name"]', 'אתר חדש');
  `);
  await sleep(100);
  ok('Partner-style sector ids are filled from the new Site ID',
     await ev(`return [...document.querySelectorAll('.q-sec [data-s="sectorId"]')].map(i => i.value).join(',');`)
       === 'LTX0001Da,LTX0001Ia');

  // ── GEO <-> UTM ───────────────────────────────────────────────────────
  await ev(`
    const set = (sel, v) => {
      const el = document.querySelector(sel);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('.q-site [data-f="a"]', '34.95725');
    set('.q-site [data-f="b"]', '32.051722');
  `);
  ok('GEO shows its UTM counterpart',
     /E 684784\.7 +N 3547844\.0/.test(await ev(`return document.querySelector('[data-hint]').textContent;`)));
  await ev(`document.querySelector('[data-q-fmt="utm"]').click();`);
  await sleep(100);
  const utm = await ev(`return [document.querySelector('.q-site [data-f="a"]').value,
                               document.querySelector('.q-site [data-f="b"]').value];`);
  ok('switching to UTM converts the point', utm.join(' ') === '684784.7 3547844.0', utm.join(' '));
  await ev(`document.querySelector('[data-q-fmt="geo"]').click();`);
  await sleep(100);
  const geo = await ev(`return [document.querySelector('.q-site [data-f="a"]').value,
                               document.querySelector('.q-site [data-f="b"]').value];`);
  ok('and back shows exactly what was typed', geo.join(' ') === '34.95725 32.051722', geo.join(' '));

  // ── the antenna list ──────────────────────────────────────────────────
  await ev(`
    const m = document.querySelectorAll('.q-sec [data-s="model"]')[0];
    m.focus();
    m.value = 'egv';
    m.dispatchEvent(new Event('input', { bubbles: true }));
  `);
  await sleep(150);
  const ac = await ev(`const el = document.getElementById('qAc');
    return { open: !el.classList.contains('hidden'),
             opts: [...el.querySelectorAll('.q-ac-file')].map(o => o.textContent) };`);
  ok('the antenna list offers the database\'s antennas', ac.open && ac.opts.includes('EGV465DR6_1800.pafx'),
     JSON.stringify(ac));
  ok('...the one on the sector\'s band first', ac.opts[0] === 'EGV465DR6_1800.pafx', ac.opts[0]);
  await ev(`
    const m = document.querySelectorAll('.q-sec [data-s="model"]')[0];
    m.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    m.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  `);
  await sleep(100);
  ok('Enter takes the highlighted antenna',
     await ev(`return window.TableXQuest._state().rows[0].sectors[0].model === 'EGV465DR6_1800.pafx'
                && document.getElementById('qAc').classList.contains('hidden');`));

  // ── add and remove a sector ───────────────────────────────────────────
  await ev(`document.querySelector('[data-addsec]').click();`);
  await sleep(200);
  ok('a sector can be added', await ev(`return window.TableXQuest._state().rows[0].sectors.length === 3;`));
  await ev(`[...document.querySelectorAll('[data-rmsec]')].pop().click();`);
  await sleep(500);
  ok('...and removed again', await ev(`return window.TableXQuest._state().rows[0].sectors.length === 2;`));

  // ── the CRS boost is editable ─────────────────────────────────────────
  await ev(`
    const c = document.querySelectorAll('.q-sec [data-s="crs"]')[0];
    c.value = '3';
    c.dispatchEvent(new Event('input', { bubbles: true }));
  `);

  // ── generate, in UTM ──────────────────────────────────────────────────
  await ev(`document.querySelector('[data-q-fmt="utm"]').click();`);
  await sleep(100);
  await ev(`document.getElementById('qGo').click();`);
  await sleep(800);
  ok('a workbook was produced', await ev(`return !!window.__caught;`));
  ok('the file is named after the group', await ev(`return window.__dl;`) === 'TX_Suite.xlsx');
  ok('the Excel step is stated', await ev(`return !document.getElementById('qAfter').classList.contains('hidden');`));
  await shot('quest');

  // ── read the produced workbook back ───────────────────────────────────
  const out = await ev(`
    const buf = await window.__caught.arrayBuffer();
    const X = window.XLSX;
    const wb = X.read(new Uint8Array(buf), { type: 'array' });
    const grid = n => X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });

    const sec = grid('Sectors');
    const head = sec[0].map(String);
    const groups = head.filter(h => /^group:/i.test(h));
    const gi = head.findIndex(h => /^group:/i.test(h));

    const car = grid('LTE_FDD_Sector_Carriers');
    const ch = car[0].map(String);
    const col = n => ch.indexOf(n);

    const ant = grid('Antennas');
    const ah = ant[0].map(String);
    const el = grid('Antenna_Electrical_Parameters');
    const site = grid('Sites');
    const sh = site[0].map(String);

    return {
      sheets: wb.SheetNames,
      sites: site.length - 1,
      siteRow: site[1],
      siteHead: sh,
      sectorRows: sec.length - 1,
      groups,
      groupValues: sec.slice(1).map(r => r[gi]),
      bands: sec.slice(1).map(r => r[head.indexOf('Band Name')]),
      models: sec.slice(1).map(r => r[head.indexOf('Propagation Model')]),
      pci: car.slice(1).map(r => r[col('Physical Cell ID')]),
      cellId: car.slice(1).map(r => r[col('Cell ID')]),
      pwr: car.slice(1).map(r => r[col('PA Power (dBm)')]),
      crs: car.slice(1).map(r => r[col('Reference Signal Power Boosting (dB)')]),
      sync: car.slice(1).map(r => r[col('Synchronization and broadcast power boosting (dB)')]),
      az: ant.slice(1).map(r => r[ah.indexOf('Azimuth')]),
      files: ant.slice(1).map(r => r[ah.indexOf('Antenna File')]),
      antSites: ant.slice(1).map(r => r[ah.indexOf('Site ID')]),
      antIds: ant.slice(1).map(r => r[ah.indexOf('Antenna ID')]),
      etilt: el.slice(1).map(r => r[3]),
    };
  `);

  ok('every sheet is carried over', out.sheets.length === 7, out.sheets.join(','));
  ok('one site, two sectors', out.sites === 1 && out.sectorRows === 2,
     `${out.sites} site / ${out.sectorRows} sectors`);
  const sv = n => out.siteRow[out.siteHead.indexOf(n)];
  ok('the Sites row carries the new identity, in UTM as typed',
     sv('Site ID') === 'TX0001A' && sv('Description') === 'אתר חדש'
       && sv('Longitude') === 684784.7 && sv('Latitude') === 3547844,
     JSON.stringify(out.siteRow));

  // The two rules that took three trips to TS to establish.
  ok('exactly ONE group column survives', out.groups.length === 1, out.groups.join(','));
  ok('it is named after the group', out.groups[0] === 'Group: TX_Suite', out.groups[0]);
  ok('every sector is TRUE in it', out.groupValues.every(v => v === 'TRUE'),
     out.groupValues.join(','));

  // The per-band donor: each new sector must inherit ITS OWN band's model.
  ok('the per-band donor picked the right rows',
     out.bands.join(',') === '1800_20,700_10'
       && out.models.join(',') === 'P3M_1800.pmf,P3M_750.pmf',
     out.models.join(','));

  ok('PCI is blanked', out.pci.every(v => v === ''), JSON.stringify(out.pci));
  ok('Cell ID is blanked', out.cellId.every(v => v === ''), JSON.stringify(out.cellId));
  ok('power came through', out.pwr.join(',') === '52,46', out.pwr.join(','));
  ok('the edited CRS was written, the other kept', out.crs.join(',') === '3,0', out.crs.join(','));
  // The donors carry 3 (as every Partner sector does); a new site gets 0.
  ok('sync/broadcast boosting is 0, not the donor 3', out.sync.join(',') === '0,0', out.sync.join(','));
  ok('electrical tilt came through', out.etilt.join(',') === '4,7', out.etilt.join(','));
  ok('the picked antenna was written', out.files[0] === 'EGV465DR6_1800.pafx', out.files.join(','));
  ok('the antennas belong to the new site',
     out.antSites.every(v => v === 'TX0001A'), out.antSites.join(','));
  ok('antenna ids are renumbered 1..N', out.antIds.join(',') === '1,2', out.antIds.join(','));

  // bookSST — the defect that made Planet refuse the file. A workbook with a
  // sharedStrings part is the observable side of t="s" cells.
  const sst = await ev(`
    const buf = new Uint8Array(await window.__caught.arrayBuffer());
    // the zip stores part names in plain bytes, so a scan is enough here
    const s = new TextDecoder('latin1').decode(buf);
    return { shared: s.includes('xl/sharedStrings.xml'), str: s.includes('t="str"') };
  `);
  ok('written with a sharedStrings part (bookSST)', sst.shared);
  ok('no t="str" cells — Planet refuses those', !sst.str);

  // ── a network imported before the kit ─────────────────────────────────
  // The shipped idf.json comes from the ENM dump: it has sites, no kit.
  await ev(`
    window.__caught = null;
    document.querySelector('[data-q-clear]').click();
  `);
  await sleep(300);
  await ev(`if (!document.getElementById('askOverlay').classList.contains('hidden'))
              document.getElementById('askYes').click();`);
  await sleep(500);
  await ev(`
    const p = document.getElementById('qPick');
    p.value = 'Halif';
    p.dispatchEvent(new Event('input'));
  `);
  await sleep(200);
  const idf = await ev(`const h = document.querySelector('.q-hit');
    if (!h) return null;
    h.click();
    await new Promise(r => setTimeout(r, 500));
    return { net: h.dataset.net, warn: !!document.querySelector('.q-warn'),
             go: document.getElementById('qGo').disabled,
             step3: document.getElementById('qStep3').classList.contains('hidden') };`);
  ok('a database without a kit says so instead of seeding',
     idf && idf.net === 'idf' && idf.warn && idf.go && idf.step3, JSON.stringify(idf));
}
