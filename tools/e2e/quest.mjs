/* quest.mjs — אתרים חדשים: load a group export, clone a site, get a workbook.
 *
 * The fixture is BUILT IN THE PAGE with the app's own SheetJS, the way the
 * deck suite builds its .pptx with PptxGenJS. The real Partner export is 8 MB
 * and lives outside the repo, so a test that needed it would only run on one
 * machine. A seven-sheet miniature exercises the same contract: the sheets
 * are found by header, so a workbook with three sites tests what one with
 * three thousand does.
 *
 * What this is really guarding is the pair of rules that cost three trips to
 * TS to establish — the group columns, and bookSST — plus the collision guard,
 * since a Site ID that already exists would overwrite a real site for a whole
 * team if it ever reached Planet.
 */
export default async function quest({ ev, ok, sleep, open, shot }) {
  await open('/');

  // ── a miniature group export, built in the page ───────────────────────
  // Two sites, one of them the template: EA0001A carries 1800 and 700 so the
  // per-band donor has something to choose between.
  const built = await ev(`
    const X = window.XLSX;
    const S = (rows) => X.utils.aoa_to_sheet(rows);
    const wb = X.utils.book_new();

    X.utils.book_append_sheet(wb, S([
      ['Site ID','Longitude','Latitude','Description','Site Name','Candidate Priority'],
      ['EA0001A', 34.9, 32.0, 'אתר הדוגמה', '', 1],
      ['EA0002B', 35.1, 31.8, 'אתר אחר', '', 1],
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
      ['Site ID','Sector ID','Carrier Name','Cell ID','Physical Cell ID','Physical Cell ID Group','Physical Layer ID','PA Power (dBm)','Reference Signal Power Boosting (dB)'],
      ['EA0001A','LEA0001Da','1800_20_SB1', 1, 349, 116, 1, 52, 0],
      ['EA0001A','LEA0001Ia','700_10_SB1',  2, 243,  81, 0, 46, 0],
      ['EA0002B','LEA0002Da','1800_20_SB1', 3, 100,  33, 1, 49, 0],
    ]), 'LTE_FDD_Sector_Carriers');

    const buf = X.write(wb, { bookType: 'xlsx', type: 'array', bookSST: true });
    window.__fixture = new File([buf], 'MiniExport.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // Catch the generated file instead of letting the browser download it.
    window.__caught = null;
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = b => { window.__caught = b; return realCreate.call(URL, b); };
    return true;
  `);
  ok('fixture export built in the page', built);

  // ── step 1: load it ───────────────────────────────────────────────────
  await ev(`document.querySelector('[data-goto="quest"]').click();`);
  await sleep(200);
  ok('quest view opens',
     await ev(`return !document.getElementById('viewQuest').classList.contains('hidden');`));

  await ev(`
    const dt = new DataTransfer();
    dt.items.add(window.__fixture);
    const inp = document.getElementById('qFile');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change'));
  `);
  await sleep(1500);
  const st = await ev(`return window.TableXQuest._state();`);
  ok('export loaded in the worker', st && st.loaded === 'MiniExport.xlsx', st && st.loaded);
  ok('both sites found', st && st.sites === 2, st && String(st.sites));
  ok('both bands found', st && st.bands && st.bands.length === 2,
     st && st.bands && st.bands.join(','));
  ok('step 2 revealed',
     await ev(`return !document.getElementById('qStep2').classList.contains('hidden');`));

  // ── step 2: pick the template ─────────────────────────────────────────
  await ev(`
    const p = document.getElementById('qPick');
    p.value = 'EA0001A';
    p.dispatchEvent(new Event('input'));
  `);
  await sleep(200);
  ok('picker finds the site',
     await ev(`return document.querySelectorAll('[data-pick]').length === 1;`));
  await ev(`document.querySelector('[data-pick]').click();`);
  await sleep(600);

  const st2 = await ev(`return window.TableXQuest._state();`);
  ok('template picked', st2 && st2.tmpl && st2.tmpl.id === 'EA0001A');
  ok('template sectors read', st2 && st2.tmpl && st2.tmpl.sectors.length === 2,
     st2 && st2.tmpl && String(st2.tmpl.sectors.length));
  // The plant has to come through the sector->antenna JOIN, not by azimuth:
  // the two sectors differ in electrical tilt (4 vs 7) and only the join
  // distinguishes them.
  ok('plant seeded from the join',
     st2 && st2.tmpl && st2.tmpl.sectors[0].etilt === 4 && st2.tmpl.sectors[1].etilt === 7,
     st2 && st2.tmpl && st2.tmpl.sectors.map(s => s.etilt).join('/'));
  ok('a first new site was seeded', st2 && st2.rows.length === 1);
  ok('the new site inherited the plant, not the identity',
     st2 && st2.rows[0].sectors.length === 2 && st2.rows[0].siteId === ''
       && st2.rows[0].sectors[0].az === 0);

  // ── the collision guard ───────────────────────────────────────────────
  await ev(`
    const r = document.querySelector('.q-site [data-f="siteId"]');
    r.value = 'EA0002B';                 // a site the export already carries
    r.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('qGroup').value = 'TX_Suite';
  `);
  await sleep(100);
  await ev(`document.getElementById('qGo').click();`);
  await sleep(400);
  ok('a Site ID already in the export is refused',
     await ev(`return window.__caught === null;`));

  // ── step 4: a real new site ───────────────────────────────────────────
  await ev(`
    const set = (sel, v) => {
      const el = document.querySelector(sel);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('.q-site [data-f="siteId"]', 'TX0001A');
    set('.q-site [data-f="name"]', 'אתר חדש');
    set('.q-site [data-f="lon"]', '35.5');
    set('.q-site [data-f="lat"]', '31.2');
    document.querySelectorAll('.q-sec[data-sec]').forEach((row, i) => {
      const s = row.querySelector('[data-s="sectorId"]');
      s.value = i === 0 ? 'LTX0001Da' : 'LTX0001Ia';
      s.dispatchEvent(new Event('input', { bubbles: true }));
    });
  `);
  await sleep(150);
  await ev(`document.getElementById('qGo').click();`);
  await sleep(1500);
  ok('a workbook was produced', await ev(`return !!window.__caught;`));
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

    return {
      sheets: wb.SheetNames,
      sites: grid('Sites').length - 1,
      sectorRows: sec.length - 1,
      groups,
      groupValues: sec.slice(1).map(r => r[gi]),
      bands: sec.slice(1).map(r => r[head.indexOf('Band Name')]),
      models: sec.slice(1).map(r => r[head.indexOf('Propagation Model')]),
      pci: car.slice(1).map(r => r[col('Physical Cell ID')]),
      cellId: car.slice(1).map(r => r[col('Cell ID')]),
      pwr: car.slice(1).map(r => r[col('PA Power (dBm)')]),
      az: ant.slice(1).map(r => r[ah.indexOf('Azimuth')]),
      antSites: ant.slice(1).map(r => r[ah.indexOf('Site ID')]),
      antIds: ant.slice(1).map(r => r[ah.indexOf('Antenna ID')]),
    };
  `);

  ok('every sheet is carried over', out.sheets.length === 7, out.sheets.join(','));
  ok('one site, two sectors', out.sites === 1 && out.sectorRows === 2,
     `${out.sites} site / ${out.sectorRows} sectors`);

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
}
