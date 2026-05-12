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
  const overlay     = $('overlay');
  const viewLanding = $('viewLanding');
  const viewTable   = $('viewTable');
  const inputArea   = $('inputArea');
  const docPage     = $('docPage');

  let lastData = null;

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
  // Matches the actual input format (paste from RTL Excel):
  // site_3rd | site_2nd | site_1st | power_3rd | power_2nd | power_1st | נקודה
  const SAMPLE = [
    'IDF_Ziporen_3\tIDF_Narkis_2\tIDF_Narkis_3\t93\t89\t85\t1',
    'IDF_Hadas_3_900\tIDF_Har_Dov_3\tIDF_Ziporen_3\t94\t90\t86\t2',
    'IDF_Hadas_3_900\tIDF_Har_Dov_3\tIDF_Ziporen_3\t95\t91\t87\t4',
    'IDF_Ziporen_3\tIDF_Narkis_2\tIDF_Narkis_3\t96\t92\t88\t3',
  ].join('\n');

  btnSample.onclick = () => { inputArea.value = SAMPLE; };

  // ── Helpers ─────────────────────────────────────────────────

  // Extract sector from site code: last single-digit (1-9) in underscore parts
  // IDF_Narkis_3 → 3 | IDF_Hadas_3_900 → 3 (900 is band, not sector)
  function extractSector(name) {
    const parts = name.split('_');
    for (let i = parts.length - 1; i >= 0; i--) {
      const n = parseInt(parts[i]);
      if (!isNaN(n) && n >= 1 && n <= 9) return n;
    }
    return '-';
  }

  // ── Parse ───────────────────────────────────────────────────
  // Auto-detects two formats:
  //
  // NEW (paste from RTL Excel — col[0] is text):
  //   site_3rd | site_2nd | site_1st | power_3rd | power_2nd | power_1st | נקודה
  //
  // OLD (manual entry — col[0] is a number):
  //   נקודה | מס"ד | שם אתר | סקטור | תדר מרכזי | רוחב פס | עוצמה
  function parseInput(raw) {
    const groups = {};

    for (const line of raw.trim().split('\n')) {
      const c = line.split('\t').map(s => s.trim());
      if (c.length < 7) continue;

      if (isNaN(parseFloat(c[0]))) {
        // ── NEW format ─────────────────────────────────────────
        // col[0..2] = sites weakest→strongest
        // col[3..5] = matching power values (absolute dBm, larger = weaker)
        // col[6]    = נקודה number
        const pt = parseInt(c[6]);
        if (isNaN(pt)) continue;

        groups[pt] = []; // one input row = one complete נקודה
        [2, 1, 0].forEach((siteIdx, rankIdx) => {
          const abs = parseFloat(c[siteIdx + 3]);
          groups[pt].push({
            rank:   rankIdx + 1,
            site:   c[siteIdx],
            sector: extractSector(c[siteIdx]),
            freq:   '-',
            bw:     '-',
            power:  isNaN(abs) ? '-' : `-${Math.abs(abs).toFixed(0)}`,
          });
        });

      } else {
        // ── OLD format ─────────────────────────────────────────
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
    pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in

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

    // Columns left→right in slide = RTL reading order:
    // עוצמה | רוחב פס | תדר מרכזי | סקטור | שם אתר | מס"ד | (blank nk header)
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
