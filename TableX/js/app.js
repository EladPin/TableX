(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  const btnOpen     = $('btnOpen');
  const btnClose    = $('btnClose');
  const btnCancel   = $('btnCancel');
  const btnSample   = $('btnSample');
  const btnGenerate = $('btnGenerate');
  const btnBack     = $('btnBack');
  const btnPrint    = $('btnPrint');
  const btnPptx     = $('btnPptx');
  const btnLoadDb   = $('btnLoadDb');
  const dbFileInput = $('dbFileInput');
  const dbStatus    = $('dbStatus');
  const overlay     = $('overlay');
  const viewLanding = $('viewLanding');
  const viewTable   = $('viewTable');
  const inputArea   = $('inputArea');
  const docPage     = $('docPage');

  let lastData = null;
  let siteDB   = {};   // siteId → { name, sector, freq, bw }

  // ── DB Import ───────────────────────────────────────────────
  btnLoadDb.onclick  = () => dbFileInput.click();
  dbFileInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      const ws = wb.Sheets['DB'];
      if (!ws) { alert('גיליון DB לא נמצא בקובץ'); return; }
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      siteDB = {};
      for (let i = 1; i < rows.length; i++) {
        const [, siteId, siteName, sector, freq, bw] = rows[i];
        if (siteId && !siteDB[siteId]) {
          siteDB[siteId] = {
            name:   siteName || siteId,
            sector: sector   || '-',
            freq:   freq     || '-',
            bw:     bw       || '-',
          };
        }
      }
      const count = Object.keys(siteDB).length;
      dbStatus.textContent = `✓ ${file.name} — ${count} אתרים נטענו`;
      dbStatus.classList.add('db-loaded');
      dbFileInput.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Navigation ──────────────────────────────────────────────
  function showOverlay()  { overlay.classList.remove('hidden'); }
  function hideOverlay()  { overlay.classList.add('hidden'); }
  function showTable()    { viewLanding.classList.add('hidden'); viewTable.classList.remove('hidden'); }
  function showLanding()  { viewTable.classList.add('hidden'); viewLanding.classList.remove('hidden'); }

  btnOpen.onclick    = showOverlay;
  btnClose.onclick   = hideOverlay;
  btnCancel.onclick  = hideOverlay;
  btnBack.onclick    = () => { showLanding(); hideOverlay(); };
  btnPrint.onclick   = () => window.print();
  overlay.onclick    = e => { if (e.target === overlay) hideOverlay(); };

  // ── Sample data ─────────────────────────────────────────────
  // Format: site_3rd | site_2nd | site_1st | power_3rd | power_2nd | power_1st | נקודה
  // site codes = Partner Site IDs (lookup via DB)
  const SAMPLE = [
    'IN0625B\tNE4295B\tMN4610A\t93\t89\t85\t1',
    'EI2085C\tIN0625B\tNE4295B\t94\t90\t86\t2',
    'MN4610A\tEI2085C\tSI5505A\t95\t91\t87\t3',
    'SI5505A\tMN4610A\tIN0625B\t96\t92\t88\t4',
  ].join('\n');

  btnSample.onclick = () => { inputArea.value = SAMPLE; };

  // ── Site lookup ─────────────────────────────────────────────
  function lookupSite(code) {
    if (siteDB[code]) return siteDB[code];
    // fallback for IDF-style codes: extract sector from trailing digit
    const parts = code.split('_');
    let sector = '-';
    for (let i = parts.length - 1; i >= 0; i--) {
      const n = parseInt(parts[i]);
      if (!isNaN(n) && n >= 1 && n <= 9) { sector = n; break; }
    }
    return { name: code, sector, freq: '-', bw: '-' };
  }

  // ── Parse ───────────────────────────────────────────────────
  function parseInput(raw) {
    const groups = {};

    for (const line of raw.trim().split('\n')) {
      const c = line.split('\t').map(s => s.trim());
      if (c.length < 7) continue;

      if (isNaN(parseFloat(c[0]))) {
        // NEW format: site_3rd | site_2nd | site_1st | pwr_3rd | pwr_2nd | pwr_1st | נקודה
        const pt = parseInt(c[6]);
        if (isNaN(pt)) continue;
        groups[pt] = [];
        [2, 1, 0].forEach((siteIdx, rankIdx) => {
          const code = c[siteIdx];
          const info = lookupSite(code);
          const abs  = parseFloat(c[siteIdx + 3]);
          groups[pt].push({
            rank:   rankIdx + 1,
            site:   info.name,
            sector: info.sector,
            freq:   info.freq,
            bw:     info.bw,
            power:  isNaN(abs) ? '-' : `-${Math.abs(abs).toFixed(0)}`,
          });
        });

      } else {
        // OLD format: נקודה | מס"ד | שם אתר | סקטור | תדר | רוחב פס | עוצמה
        const pt = parseInt(c[0]);
        if (isNaN(pt)) continue;
        if (!groups[pt]) groups[pt] = [];
        groups[pt].push({
          rank:   parseInt(c[1]) || groups[pt].length + 1,
          site:   c[2],
          sector: c[3],
          freq:   c[4],
          bw:     c[5],
          power:  parseFloat(c[6]).toFixed(2),
        });
      }
    }

    for (const k in groups) groups[k].sort((a, b) => a.rank - b.rank);
    return groups;
  }

  // ── Render HTML ─────────────────────────────────────────────
  function renderTable(groups) {
    const keys = Object.keys(groups).map(Number).sort((a, b) => a - b);

    let h = `
      <h1 class="tbl-title">טבלת נתונים</h1>
      <table class="data-table" dir="rtl">
        <thead>
          <tr>
            <th style="width:60px"></th>
            <th style="width:52px">מס"ד</th>
            <th>שם אתר משרת</th>
            <th style="width:68px">סקטור</th>
            <th style="width:100px">תדר מרכזי</th>
            <th style="width:110px">רוחב פס (Mhz)</th>
            <th style="width:110px">עוצמה(dBm)</th>
          </tr>
        </thead>
        <tbody>`;

    keys.forEach((nk, gi) => {
      const rows = groups[nk];
      const cls = gi % 2 === 0 ? 'row-a' : 'row-b';
      rows.forEach((r, i) => {
        h += `<tr class="${cls}">`;
        if (i === 0) h += `<td class="nk-cell" rowspan="${rows.length}">נק' ${nk}</td>`;
        h += `
          <td>${r.rank}</td>
          <td class="td-site">${r.site}</td>
          <td>${r.sector}</td>
          <td>${r.freq}</td>
          <td>${r.bw}</td>
          <td>${r.power}</td>
        </tr>`;
      });
    });

    h += `</tbody></table>`;
    docPage.innerHTML = h;
  }

  // ── Generate ────────────────────────────────────────────────
  btnGenerate.onclick = () => {
    const raw = inputArea.value.trim();
    if (!raw) { alert('נא להכניס נתונים'); return; }

    lastData = parseInput(raw);
    if (!Object.keys(lastData).length) {
      alert('לא זוהו נתונים תקינים.\nוודא שהעמודות מופרדות ב-Tab ושהשורה הראשונה מכילה מספר בעמודה הראשונה.');
      return;
    }

    renderTable(lastData);
    hideOverlay();
    showTable();
  };

  // ── PPTX Export ─────────────────────────────────────────────
  btnPptx.onclick = async () => {
    if (!lastData) return;
    if (typeof PptxGenJS === 'undefined') {
      alert('ספריית PPTX לא נטענה — בדוק חיבור לאינטרנט.');
      return;
    }

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';

    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };

    slide.addText('טבלת נתונים', {
      x: 0.4, y: 0.12, w: 12.5, h: 0.7,
      fontSize: 28, bold: true, color: '1a1a2e',
      align: 'center', rtlMode: true, fontFace: 'Arial',
    });

    const BD   = { type: 'solid', pt: 0.5, color: 'bbb5e0' };
    const baseCell = (fill, bold = false) => ({
      fill: { color: fill }, bold,
      align: 'center', valign: 'middle',
      rtlMode: true, border: BD,
      fontSize: 10, fontFace: 'Arial',
    });

    const hOpts = { ...baseCell('4a3f8c', true), color: 'FFFFFF' };
    const headerRow = [
      { text: 'עוצמה(dBm)',      options: hOpts },
      { text: 'רוחב פס (Mhz)',   options: hOpts },
      { text: 'תדר מרכזי',       options: hOpts },
      { text: 'סקטור',           options: hOpts },
      { text: 'שם אתר משרת',     options: { ...hOpts, align: 'right' } },
      { text: 'מס"ד',            options: hOpts },
      { text: '',                 options: hOpts },
    ];

    const tableRows = [headerRow];
    const keys = Object.keys(lastData).map(Number).sort((a, b) => a - b);

    keys.forEach((nk, gi) => {
      const pts = lastData[nk];
      const bg = gi % 2 === 0 ? 'f0eeff' : 'faf9ff';
      pts.forEach((r, i) => {
        tableRows.push([
          { text: String(r.power),  options: baseCell(bg) },
          { text: String(r.bw),     options: baseCell(bg) },
          { text: String(r.freq),   options: baseCell(bg) },
          { text: String(r.sector), options: baseCell(bg) },
          { text: r.site,           options: { ...baseCell(bg), align: 'right' } },
          { text: String(r.rank),   options: baseCell(bg) },
          { text: i === 0 ? `נק' ${nk}` : '',
            options: { ...baseCell('6b5fb5', true), color: 'FFFFFF' } },
        ]);
      });
    });

    slide.addTable(tableRows, {
      x: 0.3, y: 1.0, w: 12.7,
      colW: [1.3, 1.2, 1.2, 0.85, 4.5, 0.85, 0.8],
      rowH: 0.36,
    });

    await pptx.writeFile({ fileName: 'TableX.pptx' });
  };

})();
