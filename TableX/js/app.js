/* ═══════════════════════════════════════════════════════════════════
   TableX — Planet point analysis → Hebrew report table → PPTX / PDF

   Data model: three networks, each pre-loaded from data/<network>.json at
   startup. A network holds
       sites   { siteId   : hebrewName }
       sectors { sectorId : [siteId, sector, freqMHz, bwMHz] }
   Lookup is sector-first (that is what Planet reports), falling back to
   site id and flagging the row approximate. Unresolved codes are surfaced,
   never silently rendered as the raw English code.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const T = (k, v) => I18N.t(k, v);
  // Order matters: lookup() walks this list, so our own sites resolve
  // before the commercial operators if a code ever appears in both.
  const NETWORKS = ['idf', 'cellcom', 'partner', 'pelephone'];

  // network → { label, sites, sectors, source, built, siteSectors }
  const DB = Object.create(null);

  let lastRows = null;   // [{ pt, rows: [...] }]
  let lastMiss = [];     // codes that resolved to nothing
  let dbsReady = false;  // gate: generating before the DBs land yields a table
                         // of untranslated English codes, which is the exact
                         // failure this app exists to prevent

  /* ── toast ───────────────────────────────────────────────────────── */
  let toastTimer = null;
  function toast(msg, isErr) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), isErr ? 6000 : 3200);
  }

  const fmt = n => n.toLocaleString('en-US');

  /* ── DB loading ──────────────────────────────────────────────────── */
  function indexDb(db) {
    // siteId → first sector id seen, for the approximate fallback
    const bySite = Object.create(null);
    for (const secId in db.sectors) {
      const siteId = db.sectors[secId][0];
      if (!(siteId in bySite)) bySite[siteId] = secId;
    }
    db.siteSectors = bySite;
    return db;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function hideLoader() {
    const el = $('loader');
    if (!el || el.classList.contains('done')) return;
    el.classList.add('done');
    setTimeout(() => el.remove(), 500);
  }

  // Safety net: if anything below throws, the page must not stay covered.
  setTimeout(hideLoader, 8000);

  async function loadAll() {
    dbsReady = false;
    $('btnGenerate').disabled = true;
    updateHint();

    const t0 = performance.now();
    const bar = $('loaderBar'), status = $('loaderStatus');
    let done = 0;
    const step = () => {
      done++;
      if (bar) bar.style.width = Math.round((done / (NETWORKS.length + 1)) * 100) + '%';
    };

    await Promise.all(NETWORKS.map(async net => {
      try {
        const r = await fetch('data/' + net + '.json', { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        DB[net] = indexDb(await r.json());
      } catch (e) {
        // A missing file is a valid state — the slot is simply empty.
        DB[net] = indexDb({ network: net, label: net, sites: {}, sectors: {} });
      }
      step();
    }));

    // Wait for the webfonts too, so the hero doesn't repaint under the user
    // the moment the loader lifts. Raced with a timeout — a font that never
    // resolves must not hold the app hostage.
    if (status) {
      const n = NETWORKS.reduce((s, x) => s + count(x, 'sectors'), 0);
      status.textContent = T('loader.done', { n: fmt(n) });
    }
    try {
      await Promise.race([document.fonts ? document.fonts.ready : null, sleep(2500)]);
    } catch (e) { /* fonts are cosmetic — never block on them */ }
    step();

    dbsReady = true;
    $('btnGenerate').disabled = false;
    renderDbCards();
    updateChip();
    updateHint();

    // Minimum on-screen time. The DBs load in well under this locally, so this
    // is the number that actually decides how long the loader shows — it is a
    // deliberate brand beat, not a technical wait. The 8s safety timeout above
    // must stay comfortably above it.
    await sleep(Math.max(0, 2500 - (performance.now() - t0)));
    hideLoader();
  }

  const isEmpty = net => !DB[net] || !Object.keys(DB[net].sectors).length;
  const count = (net, k) => (DB[net] ? Object.keys(DB[net][k]).length : 0);

  function updateChip() {
    const live = NETWORKS.filter(n => !isEmpty(n));
    const dot = $('dbChipDot');
    dot.className = 'db-chip-dot' +
      (live.length === NETWORKS.length ? ' ok' : live.length ? ' partial' : '');
    $('dbChipText').textContent = live.length
      ? T('chip.dbs', { n: live.length, total: NETWORKS.length,
                        s: fmt(live.reduce((s, n) => s + count(n, 'sectors'), 0)) })
      : T('chip.none');
  }

  // Every network label is a proper noun, so none of them translate.
  const LABELS = { idf: 'IDF', cellcom: 'Cellcom',
                   partner: 'Partner', pelephone: 'Pelephone' };
  const label = net => LABELS[net] || net;

  // Placeholder examples for the site editor's add-sector form, per network.
  // Until now every network showed Partner's shapes, which teaches the wrong
  // format to anyone adding a Cellcom or Pelephone site by hand.
  //
  // These are sample DATA, not UI copy — the same in both languages, like the
  // paste box's example rows — so they live here beside LABELS rather than in
  // i18n.js. Cellcom's and Pelephone's come from screen captures, since their
  // workbooks live on TS and cannot leave it; treat them as illustrative.
  // IDF is deliberately blank: it is coming from an ENM CLI dump rather than a
  // Planet group export, and inventing an example would teach a format that
  // turns out not to be the one.
  const EXAMPLES = {
    partner:   { secId: 'LNN4610Da',   siteId: 'MN4610A', name: 'גג בית העם  דישון',
                 sector: 'Da',  freq: '1800', bw: '20' },
    cellcom:   { secId: '3634249_270', siteId: '14196',   name: '',
                 sector: '270', freq: '2600', bw: '20' },
    pelephone: { secId: '935739_22',   siteId: 'P935739', name: 'EINAV',
                 sector: '22',  freq: '750',  bw: '10' },
    idf:       { secId: '', siteId: '', name: '', sector: '', freq: '', bw: '' },
  };

  function applyExamples(net) {
    const ex = EXAMPLES[net] || EXAMPLES.idf;
    $('edSectorId').placeholder = ex.secId;
    $('edSiteId').placeholder = ex.siteId;
    $('edSiteName').placeholder = ex.name;
    $('edSector').placeholder = ex.sector;
    $('edFreq').placeholder = ex.freq;
    $('edBw').placeholder = ex.bw;
  }

  function renderDbCards() {
    $('dbGrid').innerHTML = NETWORKS.map((net, i) => {
      const db = DB[net], empty = isEmpty(net);
      const sectors = count(net, 'sectors'), sites = count(net, 'sites');
      const meta = empty
        ? T('db.none')
        : T('db.source') + ': ' + esc(db.source || '—') + '<br/>' +
          T('db.built') + ': ' + esc(db.built || '—');
      return `
        <div class="card db-card reveal ${empty ? '' : 'loaded'}"
             id="dbCard-${net}" style="--d:${i * 70}ms">
          <div class="db-card-head">
            <span class="db-name">${esc(label(net))}</span>
            <span class="db-state ${empty ? '' : 'on'}">${empty ? T('db.empty') : T('db.loaded')}</span>
          </div>
          <div class="db-count ${empty ? 'empty' : ''}" data-to="${sectors}">
            0
            <small>${empty ? T('db.sectors') : T('db.sites', { n: fmt(sites) })}</small>
          </div>
          <div class="db-meta">${meta}</div>
          <div class="db-actions">
            <button class="btn btn-outline btn-sm" data-update="${net}">
              ${empty ? T('db.load') : T('db.update')}
            </button>
            <button class="btn btn-ghost btn-sm" data-edit="${net}">${T('ed.open')}</button>
            ${empty ? '' : `<button class="btn btn-ghost btn-sm btn-danger"
                                    data-clear="${net}">${T('db.clear')}</button>`}
          </div>
        </div>`;
    }).join('');

    $('dbGrid').querySelectorAll('[data-update]')
      .forEach(b => b.onclick = () => pickFile(b.dataset.update));
    $('dbGrid').querySelectorAll('[data-edit]')
      .forEach(b => b.onclick = () => openEditor(b.dataset.edit));
    $('dbGrid').querySelectorAll('[data-clear]')
      .forEach(b => b.onclick = () => clearDb(b.dataset.clear));

    // count up, once the cards have settled in
    $('dbGrid').querySelectorAll('.db-count[data-to]').forEach(el => {
      const to = +el.dataset.to;
      if (!to) return;
      countUp(el, to);
    });
  }

  function countUp(el, to) {
    const small = el.querySelector('small');
    const dur = 700, t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const v = Math.round(to * (1 - Math.pow(1 - p, 3)));   // ease-out cubic
      el.firstChild.nodeValue = fmt(v);
      if (small) el.appendChild(small);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  // Distinct frequencies in a parsed database, ascending, as "700, 1800, 2600".
  const bandList = sectors => {
    const seen = new Set();
    for (const k in sectors) if (sectors[k][2] != null) seen.add(sectors[k][2]);
    return [...seen].sort((a, b) => a - b).join(', ') || '—';
  };

  /* ── in-app confirm ──────────────────────────────────────────────── */
  // window.confirm() renders as "האתר localhost:8094 אומר" — the browser's
  // voice, not the app's, and in the packaged exe it becomes Electron's chrome
  // instead of TableX's. Every prompt goes through this instead.
  //
  // Takes the SAME multi-paragraph strings window.confirm() took: the first
  // paragraph becomes the dialog's question, the rest its body. Returns a
  // Promise<boolean>, so callers must await it.
  let askDone = null;
  function ask(text, opts) {
    const o = opts || {};
    const paras = String(text).split(/\n{2,}/);
    $('askTitle').textContent = paras.shift();
    $('askBody').innerHTML = paras.map(p => '<p>' + esc(p) + '</p>').join('');
    $('askBody').hidden = !paras.length;
    $('askYes').textContent = T(o.ok || 'ask.ok');
    $('askYes').classList.toggle('danger', !!o.danger);
    $('askNo').textContent = T('ask.cancel');
    $('askOverlay').classList.remove('hidden');
    // Focus lands on Cancel, not the confirm: a stray Enter on a destructive
    // prompt must not be the thing that empties a database.
    setTimeout(() => $('askNo').focus(), 40);
    return new Promise(res => { askDone = res; });
  }

  function closeAsk(answer) {
    if (!askDone) return;
    const done = askDone;
    askDone = null;
    $('askOverlay').classList.add('hidden');
    done(answer);
  }

  $('askYes').onclick = () => closeAsk(true);
  $('askNo').onclick = () => closeAsk(false);
  $('askOverlay').onclick = e => { if (e.target === $('askOverlay')) closeAsk(false); };

  /* ── DB clear ────────────────────────────────────────────────────── */
  // Writes an empty database through the SAME api/db/<network> route the xlsx
  // import uses, so the server keeps its one .bak. That rollback copy is the
  // only copy — data/*.bak is gitignored and the source workbooks are not in
  // the repo — so it is worth saying so in the confirm rather than assuming
  // whoever clicks this knows.
  async function clearDb(net) {
    const sectors = count(net, 'sectors'), sites = count(net, 'sites');
    if (!sectors && !sites) return;                 // already empty, nothing to do
    const ok = await ask(T('db.clearConfirm', {
      label: label(net), n: fmt(sectors), s: fmt(sites),
    }), { ok: 'db.clear', danger: true });
    if (!ok) return;

    const card = $('dbCard-' + net);
    if (card) card.classList.add('busy');
    const payload = { network: net, label: label(net), source: null, built: null,
                      sites: {}, sectors: {} };
    try {
      const res = await fetch('api/db/' + net, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text() || res.status);
      DB[net] = indexDb(payload);
      renderDbCards();
      updateChip();
      toast(T('toast.dbCleared', { label: label(net), n: fmt(sectors) }));
    } catch (ex) {
      // Deliberately NOT the import's "use it for this session anyway": a
      // failed import still leaves the user their work, but a failed clear
      // leaves the file on disk intact. Emptying the card would be a lie that
      // un-tells itself on the next refresh.
      if (card) card.classList.remove('busy');
      toast(T('toast.clearFail', { e: ex.message }), true);
    }
  }

  /* ── DB update: xlsx → parsed → POSTed to the server ─────────────── */
  let pendingNet = null;
  const fileInput = $('dbFileInput');

  function pickFile(net) { pendingNet = net; fileInput.value = ''; fileInput.click(); }

  // The workbook contract lives in js/dbparse.js, which runs in a Worker.
  // Parsing an 8 MB Planet group export is 4–6 s of straight-line CPU: on the
  // main thread that is long enough for Chrome to raise "page unresponsive",
  // which is alarming in a browser and unacceptable once this is an exe.
  //
  // dbparse.js is ALSO loaded as a plain script by index.html, so if a Worker
  // cannot start we still parse — inline, freezing as before, rather than
  // refusing the user's file. One copy of the parser serves both paths.
  function parseWorkbookAsync(buf, onStage) {
    return new Promise((resolve, reject) => {
      const inline = () => {
        try { resolve(self.TableXParse(buf)); } catch (ex) { reject(ex); }
      };
      let w = null;
      try { w = new Worker('js/dbparse.js'); } catch (e) { w = null; }
      if (!w) return inline();

      let settled = false;
      w.onmessage = ev => {
        const m = ev.data || {};
        if (m.stage) return onStage(m.stage);
        settled = true;
        w.terminate();
        if (m.error) reject(new Error(m.error));
        else resolve(m.result);
      };
      w.onerror = () => {
        if (settled) return;
        settled = true;
        w.terminate();
        inline();
      };
      // Structured clone, NOT a transfer: a transfer detaches the buffer here,
      // and the inline fallback above would then have nothing left to parse.
      w.postMessage(buf);
    });
  }


  fileInput.onchange = e => {
    const file = e.target.files[0], net = pendingNet;
    if (!file || !net) return;
    const card = $('dbCard-' + net);
    if (card) card.classList.add('busy');
    toast(T('toast.reading', { f: file.name }));

    const reader = new FileReader();
    reader.onload = async ev => {
      let parsed = null, err = null;
      try {
        parsed = await parseWorkbookAsync(ev.target.result, stage => toast(T('toast.' + stage)));
      } catch (ex) { err = ex.message; }

      if (!parsed) {
        if (card) card.classList.remove('busy');
        toast(T('toast.badSheet') + (err ? ' — ' + err : ''), true);
        return;
      }

      // A repeated Sector ID is not a key — the second row overwrites the
      // first, so the import would report success while most of the network
      // quietly vanished. That is data loss, not a blank field, so it is a
      // hard refusal rather than a prompt.
      if (parsed.dupes) {
        if (card) card.classList.remove('busy');
        toast(T('toast.dupSectors', { n: fmt(parsed.dupes),
                                      total: fmt(parsed.rows),
                                      id: parsed.dupeExample }), true);
        return;
      }

      // Band Name that does not resolve to a real band label (an EARFCN, say)
      // leaves frequency blank rather than printing a wrong number. Say so and
      // let the user decide — the site names may still be worth having.
      if (parsed.unknownBand) {
        const go = await ask(T('db.unknownBand', {
          n: fmt(parsed.unknownBand), total: fmt(parsed.rows),
          ex: parsed.bandExample || '—',
        }), { ok: 'db.update', danger: true });
        if (!go) {
          if (card) card.classList.remove('busy');
          toast(T('toast.importCancelled'));
          return;
        }
      }

      // An import REPLACES the database, it does not merge. A group export
      // filtered to one region would otherwise quietly shrink a live DB, and
      // the first sign of trouble is a table of untranslated English codes —
      // exactly the failure this app exists to prevent. Confirm a big drop;
      // the normal case (a refresh that grows) is never interrupted.
      const was = count(net, 'sectors');
      const now = Object.keys(parsed.sectors).length;
      if (was && now < was * 0.6) {
        const ok = await ask(T('db.shrink', {
          label: label(net), was: fmt(was), now: fmt(now),
          pct: Math.round((1 - now / was) * 100),
        }), { ok: 'db.update', danger: true });
        if (!ok) {
          if (card) card.classList.remove('busy');
          toast(T('toast.importCancelled'));
          return;
        }
      }

      const payload = {
        network: net,
        label: label(net),
        source: file.name,
        built: new Date().toISOString().slice(0, 10),
        sites: parsed.sites,
        sectors: parsed.sectors,
      };

      try {
        const res = await fetch('api/db/' + net, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text() || res.status);
        DB[net] = indexDb(payload);
        renderDbCards();
        updateChip();
        // The bands are the cheapest possible check that the import read the
        // workbook correctly, and the only one available on a machine whose
        // files can never be sent out: "700, 1800, 2600" is obviously right,
        // "1400, 2850, 9360" is obviously an EARFCN column read as MHz.
        toast(T('toast.dbSaved', { label: label(net),
                                   n: fmt(Object.keys(parsed.sectors).length),
                                   f: bandList(parsed.sectors) }));
      } catch (ex) {
        // The parse worked; only the write failed. Use it for this session so
        // the work isn't lost, and say plainly that it will not persist.
        DB[net] = indexDb(payload);
        renderDbCards();
        updateChip();
        toast(T('toast.dbSession', { e: ex.message }), true);
      }
      if (card) card.classList.remove('busy');
    };
    reader.readAsArrayBuffer(file);
  };

  /* ── lookup — sector first, then site, across every loaded network ── */
  function lookup(code) {
    if (!code) return null;
    for (const net of NETWORKS) {
      const db = DB[net]; if (!db) continue;
      const sec = db.sectors[code];
      if (sec) {
        return { net, site: db.sites[sec[0]] || sec[0], siteId: sec[0],
                 sector: sec[1] || '-', freq: sec[2] == null ? '-' : sec[2],
                 bw: sec[3] == null ? '-' : sec[3], exact: true };
      }
    }
    for (const net of NETWORKS) {
      const db = DB[net]; if (!db) continue;
      if (code in db.sites) {
        const secId = db.siteSectors[code];
        const sec = secId ? db.sectors[secId] : null;
        return { net, site: db.sites[code] || code, siteId: code,
                 sector: sec && sec[1] ? sec[1] : '-',
                 freq: sec && sec[2] != null ? sec[2] : '-',
                 bw: sec && sec[3] != null ? sec[3] : '-', exact: false };
      }
    }
    return null;
  }

  /* ── level formatting ────────────────────────────────────────────── */
  // At most 2 decimals, trailing zeros trimmed:
  //   85 -> "85"   84.3 -> "84.3"   84.30 -> "84.3"   84.333 -> "84.33"
  // The Planet path used to be toFixed(0), which silently rounded a pasted
  // 84.3 down to 84 — a real value change in a commander-facing table, not a
  // display nicety. The legacy path used toFixed(2), which forced "84.30".
  // Both feed the SAME column of the SAME table, so they share this.
  // `negate`: Planet levels are pasted as positive magnitudes and must print
  // negative; legacy rows are already resolved, so their sign is kept.
  function level(raw, negate) {
    const v = parseFloat(raw);
    if (isNaN(v)) return '-';
    const n = parseFloat(Math.abs(v).toFixed(2));
    // `n !== 0` guard: without it a level of 0 prints as "-0".
    return (n !== 0 && (negate || v < 0) ? '-' : '') + n;
  }

  /* ── parse the pasted block ──────────────────────────────────────── */
  function parseInput(raw) {
    const groups = Object.create(null);
    const miss = [];

    for (const line of raw.trim().split(/\r?\n/)) {
      const c = line.split('\t').map(s => s.trim());
      if (c.length < 7) continue;

      if (isNaN(parseFloat(c[0]))) {
        // Planet point analysis, pasted from an RTL sheet: the columns arrive
        // reversed, so [2,1,0] maps them back to rank 1..3.
        const pt = parseInt(c[6], 10);
        if (isNaN(pt)) continue;
        groups[pt] = [];
        [2, 1, 0].forEach((col, rank) => {
          const code = c[col];
          const hit = lookup(code);
          if (!hit && code) miss.push(code);
          groups[pt].push({
            rank: rank + 1,
            code: code,
            net: hit ? hit.net : null,
            exact: hit ? hit.exact : null,
            site: hit ? hit.site : code,
            sector: hit ? hit.sector : '-',
            freq: hit ? hit.freq : '-',
            bw: hit ? hit.bw : '-',
            power: level(c[col + 3], true),
          });
        });

      } else {
        // Legacy: already-resolved rows, no lookup.
        const pt = parseInt(c[0], 10);
        if (isNaN(pt)) continue;
        if (!groups[pt]) groups[pt] = [];
        groups[pt].push({
          rank: parseInt(c[1], 10) || groups[pt].length + 1,
          code: c[2], net: null, exact: true,
          site: c[2], sector: c[3], freq: c[4], bw: c[5],
          power: level(c[6], false),
        });
      }
    }

    for (const k in groups) groups[k].sort((a, b) => a.rank - b.rank);
    lastMiss = [...new Set(miss)];
    return groups;
  }

  /* ── render ──────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const NET_TAG = { ours: 'שלנו', partner: 'PARTNER', pelephone: 'PELEPHONE' };

  function renderTable(groups) {
    const keys = Object.keys(groups).map(Number).sort((a, b) => a - b);
    let i = 0;

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
      rows.forEach((r, ri) => {
        // Annotations are app-only: .tag is display:none in print and is never
        // read by the PPTX builder, so the deliverable stays seven clean columns.
        let tag = '';
        if (r.net === null && r.exact === null) {
          tag = `<span class="tag tag-miss">לא נמצא</span>`;
        } else {
          if (r.net) tag += `<span class="tag tag-net">${esc(NET_TAG[r.net])}</span>`;
          if (r.exact === false) tag += `<span class="tag tag-warn">סקטור משוער</span>`;
        }
        // Stagger is capped: past row 18 they all arrive together, so a long
        // table never makes the user wait for a decorative animation.
        h += `<tr class="${cls}" style="--i:${Math.min(i++, 18)}">`;
        if (ri === 0) h += `<td class="nk-cell" rowspan="${rows.length}">נק' ${nk}</td>`;
        h += `
          <td>${r.rank}</td>
          <td class="td-site">${esc(r.site)}${tag}</td>
          <td>${esc(r.sector)}</td>
          <td>${esc(r.freq)}</td>
          <td>${esc(r.bw)}</td>
          <td>${esc(r.power)}</td>
        </tr>`;
      });
    });

    $('docPage').innerHTML = h + `</tbody></table>`;
    $('tableMeta').textContent = T('tbl.meta', { p: keys.length, r: i });

    // the warning that stops an untranslated code reaching a commander
    const notice = $('missNotice');
    if (lastMiss.length) {
      $('missTitle').textContent = T('miss.title', { n: lastMiss.length });
      $('missBody').innerHTML = T('miss.body') +
        lastMiss.map(c => `<span class="mono">${esc(c)}</span>`).join(', ');
      notice.classList.remove('hidden');
    } else {
      notice.classList.add('hidden');
    }
  }

  /* ── views ───────────────────────────────────────────────────────── */
  function show(which) {
    const table = which === 'table';
    $('viewHome').classList.toggle('hidden', table);
    $('viewTable').classList.toggle('hidden', !table);
    $('nav').classList.toggle('hidden', table);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ── wiring ──────────────────────────────────────────────────────── */
  const SAMPLE = [
    'LNN4610Da\tLNE4295Da\tLSI5505Da\t86\t79\t72\t1',
    'LIN0625Da\tLEI2085Da\tLEA1118Da\t89\t82\t75\t2',
    'LEA2143Da\tLNN4455Da\tLMN0640Da\t92\t85\t78\t3',
    'LJN1163Da\tLSI5498Da\tLSO5495Da\t95\t88\t81\t4',
    'LSO5320Da\tLEI2138Da\tLNC4127Da\t98\t91\t84\t5',
    'LSO5949Da\tLNN0546Da\tLSO5482Da\t101\t94\t87\t6',
    'LSI5439Da\tLNN4074Da\tLIN4943Da\t104\t97\t90\t7',
  ].join('\n');

  const ta = $('inputArea');

  $('btnSample').onclick = () => { ta.value = SAMPLE; updateHint(); };

  function updateHint() {
    const hint = $('pasteHint');
    if (!hint) return;
    if (!dbsReady) {
      hint.textContent = T('hint.loading');
      hint.classList.remove('ready');
      return;
    }
    const n = ta.value.trim()
      ? ta.value.trim().split(/\r?\n/).filter(l => l.includes('\t')).length : 0;
    hint.textContent = n ? T('hint.ready', { n: n }) : T('hint.waiting');
    hint.classList.toggle('ready', n > 0);
  }

  ta.addEventListener('input', updateHint);

  $('btnGenerate').onclick = () => {
    if (!dbsReady) { toast(T('toast.dbsLoading'), true); return; }
    const raw = ta.value.trim();
    if (!raw) { toast(T('toast.noData'), true); ta.focus(); return; }
    const groups = parseInput(raw);
    if (!Object.keys(groups).length) {
      toast(T('toast.badData'), true);
      return;
    }
    lastRows = groups;
    renderTable(groups);
    show('table');
  };

  $('btnBack').onclick = () => show('home');
  $('btnPrint').onclick = () => window.print();
  $('brandHome').onclick = e => { e.preventDefault(); show('home'); };

  document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => {
    show('home');
    if (b.dataset.goto === 'db') $('sectionDb').scrollIntoView({ behavior: 'smooth' });
  });

  $('dbChip').onclick = () => { show('home'); $('sectionDb').scrollIntoView({ behavior: 'smooth' }); };

  /* ── about the builder ───────────────────────────────────────────── */
  const about = $('aboutModal');
  const openAbout  = () => about.classList.remove('hidden');
  const closeAbout = () => about.classList.add('hidden');

  $('btnAbout').onclick = openAbout;
  $('btnAboutClose').onclick = closeAbout;
  about.onclick = e => { if (e.target === about) closeAbout(); };

  addEventListener('keydown', e => {
    if (e.key === 'Escape' && !about.classList.contains('hidden')) closeAbout();
  });

  addEventListener('scroll', () => $('nav').classList.toggle('scrolled', scrollY > 4),
                   { passive: true });

  // Ctrl+Enter generates — the whole point is speed
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('btnGenerate').click();
  });

  /* ── PPTX export ─────────────────────────────────────────────────── */
  $('btnPptx').onclick = async () => {
    if (!lastRows) return;
    if (typeof PptxGenJS === 'undefined') {
      toast(T('toast.pptxMissing'), true);
      return;
    }
    const btn = $('btnPptx');
    btn.disabled = true;
    try {
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';
      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };

      slide.addText('טבלת נתונים', {
        x: 0.4, y: 0.12, w: 12.5, h: 0.7,
        fontSize: 28, bold: true, color: '1a1a2e',
        align: 'center', rtlMode: true, fontFace: 'Arial',
      });

      const BD = { type: 'solid', pt: 0.5, color: 'bbb5e0' };
      const cell = (fill, bold = false) => ({
        fill: { color: fill }, bold, align: 'center', valign: 'middle',
        rtlMode: true, border: BD, fontSize: 10, fontFace: 'Arial',
      });
      const hOpts = { ...cell('4a3f8c', true), color: 'FFFFFF' };

      // PowerPoint tables have no RTL column order — rtlMode only sets text
      // direction inside a cell — so the columns are reversed by hand here to
      // mirror the HTML. Change one, change the other.
      const rows = [[
        { text: 'עוצמה(dBm)',    options: hOpts },
        { text: 'רוחב פס (Mhz)', options: hOpts },
        { text: 'תדר מרכזי',     options: hOpts },
        { text: 'סקטור',         options: hOpts },
        { text: 'שם אתר משרת',   options: { ...hOpts, align: 'right' } },
        { text: 'מס"ד',          options: hOpts },
        { text: '',              options: hOpts },
      ]];

      Object.keys(lastRows).map(Number).sort((a, b) => a - b).forEach((nk, gi) => {
        const bg = gi % 2 === 0 ? 'f0eeff' : 'faf9ff';
        lastRows[nk].forEach((r, i) => {
          rows.push([
            { text: String(r.power),  options: cell(bg) },
            { text: String(r.bw),     options: cell(bg) },
            { text: String(r.freq),   options: cell(bg) },
            { text: String(r.sector), options: cell(bg) },
            { text: String(r.site),   options: { ...cell(bg), align: 'right' } },
            { text: String(r.rank),   options: cell(bg) },
            { text: i === 0 ? `נק' ${nk}` : '',
              options: { ...cell('6b5fb5', true), color: 'FFFFFF' } },
          ]);
        });
      });

      slide.addTable(rows, {
        x: 0.3, y: 1.0, w: 12.7,
        colW: [1.3, 1.2, 1.2, 0.85, 4.5, 0.85, 0.8],
        rowH: 0.36,
      });

      await pptx.writeFile({ fileName: 'TableX.pptx' });
      toast(T('toast.pptxDone'));
    } catch (e) {
      toast(T('toast.pptxFail', { e: e.message }), true);
    } finally {
      btn.disabled = false;
    }
  };


  /* ── site editor ─────────────────────────────────────────────────────
     Partner and Pelephone get refreshed from a Planet export every few
     months; our own sites change by roughly ONE SITE A MONTH, and
     re-importing a whole workbook for one row is exactly the friction this
     app exists to remove. So: add and remove single sectors in place.

     Edits are staged on a deep copy and written only on Save. A per-change
     POST would mean a 689 KB round trip per edit and could leave the file
     half-modified if one failed; `dirty` counts staged changes so the footer
     can say what is about to be written. */
  const ED_ROW_CAP = 150;   // Partner has 2,899 sites; rendering them all
                            // janks the modal. Search narrows, this caps.
  let ed = null;

  function openEditor(net) {
    const src = DB[net] || { sites: {}, sectors: {} };
    ed = {
      net: net,
      sites: JSON.parse(JSON.stringify(src.sites || {})),
      sectors: JSON.parse(JSON.stringify(src.sectors || {})),
      open: new Set(),
      dirty: 0,
      q: '',
    };
    $('edNet').textContent = label(net);
    applyExamples(net);
    $('edSearch').value = '';
    $('edAdd').classList.add('hidden');
    $('dbEditor').classList.remove('hidden');
    renderEditor();
    setTimeout(() => $('edSearch').focus(), 60);
  }

  async function closeEditor(force) {
    if (!force && ed && ed.dirty &&
        !(await ask(T('ed.discard'), { ok: 'ed.discardOk', danger: true }))) return;
    $('dbEditor').classList.add('hidden');
    ed = null;
  }

  // siteId -> [sectorId, ...]. Rebuilt per render; cheap next to the DOM work.
  function sectorsBySite() {
    const m = Object.create(null);
    for (const secId in ed.sectors) {
      const siteId = ed.sectors[secId][0];
      (m[siteId] || (m[siteId] = [])).push(secId);
    }
    return m;
  }

  function renderEditor() {
    const bySite = sectorsBySite();
    const siteIds = Object.keys(ed.sites);
    const q = ed.q.trim().toLowerCase();

    const hits = !q ? siteIds : siteIds.filter(id =>
      id.toLowerCase().includes(q) ||
      String(ed.sites[id] || '').toLowerCase().includes(q) ||
      (bySite[id] || []).some(sec => sec.toLowerCase().includes(q)));

    hits.sort((a, b) =>
      String(ed.sites[a] || a).localeCompare(String(ed.sites[b] || b), 'he'));

    $('edCount').textContent = T('ed.count', {
      sites: fmt(siteIds.length),
      sectors: fmt(Object.keys(ed.sectors).length),
    });

    const list = $('edList');
    if (!siteIds.length) {
      list.innerHTML = '<p class="ed-msg">' + esc(T('ed.none')) + '</p>';
    } else if (!hits.length) {
      list.innerHTML = '<p class="ed-msg">' + esc(T('ed.noHits', { q: ed.q })) + '</p>';
    } else {
      const shown = hits.slice(0, ED_ROW_CAP);
      list.innerHTML = shown.map((id, i) => {
        const secs = (bySite[id] || []).slice().sort();
        const isOpen = ed.open.has(id);
        const rows = !isOpen ? '' :
          '<div class="ed-sectors">' + secs.map((sec, j) => {
            const v = ed.sectors[sec];
            return '<div class="ed-sector" style="animation-delay:' + (j * 20) + 'ms">' +
              '<span class="mono" dir="ltr">' + esc(sec) + '</span>' +
              '<span class="ed-spec">' + esc(v[1] || '-') + '</span>' +
              '<span class="ed-spec">' + esc(v[2] == null ? '-' : v[2]) + ' MHz</span>' +
              '<span class="ed-spec">' + esc(v[3] == null ? '-' : v[3]) + ' MHz</span>' +
              '<span class="grow"></span>' +
              '<button class="ed-rm" data-rm-sector="' + esc(sec) + '" title="' +
                esc(T('ed.rmSector')) + '">\u2212</button>' +
            '</div>';
          }).join('') + '</div>';
        return '<div class="ed-site ' + (isOpen ? 'open' : '') + '" style="--i:' + i + '">' +
          '<div class="ed-site-row" data-toggle="' + esc(id) + '">' +
            '<span class="ed-caret">\u25B6</span>' +
            '<span class="ed-name">' + esc(ed.sites[id] || id) + '</span>' +
            '<span class="ed-code" dir="ltr">' + esc(id) + '</span>' +
            '<span class="ed-badge">' + secs.length + '</span>' +
            '<button class="ed-rm" data-rm-site="' + esc(id) + '" title="' +
              esc(T('ed.rmSite')) + '">\u2212</button>' +
          '</div>' + rows +
        '</div>';
      }).join('') + (hits.length > ED_ROW_CAP
        ? '<p class="ed-more">' + esc(T('ed.showing',
            { n: ED_ROW_CAP, total: fmt(hits.length) })) + '</p>'
        : '');

      list.querySelectorAll('[data-toggle]').forEach(el => el.onclick = e => {
        if (e.target.closest('.ed-rm')) return;      // the minus is not a toggle
        const id = el.dataset.toggle;
        if (ed.open.has(id)) ed.open.delete(id); else ed.open.add(id);
        renderEditor();
      });
      list.querySelectorAll('[data-rm-site]').forEach(b =>
        b.onclick = () => removeSite(b.dataset.rmSite));
      list.querySelectorAll('[data-rm-sector]').forEach(b =>
        b.onclick = () => removeSector(b.dataset.rmSector));
    }

    const dirtyEl = $('edDirty');
    dirtyEl.textContent = ed.dirty ? T('ed.dirty', { n: ed.dirty }) : T('ed.clean');
    dirtyEl.classList.toggle('on', ed.dirty > 0);
    const save = $('edSave');
    save.disabled = !ed.dirty;
    save.textContent = ed.dirty ? T('ed.saveN', { n: ed.dirty }) : T('ed.save');
  }

  function removeSector(secId) {
    if (!ed.sectors[secId]) return;
    const siteId = ed.sectors[secId][0];
    delete ed.sectors[secId];
    // A site with no sectors left is unreachable by any lookup, so drop it
    // rather than leave an orphan name in the file.
    if (!Object.keys(ed.sectors).some(k => ed.sectors[k][0] === siteId)) {
      delete ed.sites[siteId];
      ed.open.delete(siteId);
    }
    ed.dirty++;
    toast(T('ed.rmDone', { id: secId }));
    renderEditor();
  }

  function removeSite(siteId) {
    for (const secId in ed.sectors) {
      if (ed.sectors[secId][0] === siteId) delete ed.sectors[secId];
    }
    delete ed.sites[siteId];
    ed.open.delete(siteId);
    ed.dirty++;
    toast(T('ed.rmDone', { id: siteId }));
    renderEditor();
  }

  $('edSearch').addEventListener('input', e => { ed.q = e.target.value; renderEditor(); });
  $('edClose').onclick = () => closeEditor();
  $('edCancel').onclick = () => closeEditor();
  $('dbEditor').onclick = e => { if (e.target === $('dbEditor')) closeEditor(); };

  $('edAddToggle').onclick = () => {
    const f = $('edAdd');
    f.classList.toggle('hidden');
    if (!f.classList.contains('hidden')) $('edSectorId').focus();
  };
  $('edAddCancel').onclick = () => $('edAdd').classList.add('hidden');

  $('edAdd').onsubmit = e => {
    e.preventDefault();
    const secId = $('edSectorId').value.trim();
    const siteId = $('edSiteId').value.trim();
    if (!secId || !siteId) { toast(T('ed.needIds'), true); return; }
    if (ed.sectors[secId]) toast(T('ed.dup', { id: secId }), true);

    const name = $('edSiteName').value.trim();
    ed.sites[siteId] = name || ed.sites[siteId] || siteId;
    ed.sectors[secId] = [
      siteId,
      $('edSector').value.trim() || null,
      num($('edFreq').value.trim()),
      num($('edBw').value.trim()),
    ];
    ed.dirty++;
    ed.open.add(siteId);
    ed.q = '';
    $('edSearch').value = '';
    ['edSectorId', 'edSiteId', 'edSiteName', 'edSector'].forEach(id => { $(id).value = ''; });
    $('edSectorId').focus();
    toast(T('ed.added', { id: secId }));
    renderEditor();
  };

  $('edSave').onclick = async () => {
    const btn = $('edSave');
    btn.disabled = true;
    const payload = {
      network: ed.net,
      label: label(ed.net),
      source: (DB[ed.net] && DB[ed.net].source) || null,
      built: new Date().toISOString().slice(0, 10),
      sites: ed.sites,
      sectors: ed.sectors,
    };
    try {
      const res = await fetch('api/db/' + ed.net, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.text()) || res.status);
      DB[ed.net] = indexDb(payload);
      renderDbCards();
      updateChip();
      toast(T('ed.saved', {
        sites: fmt(Object.keys(ed.sites).length),
        sectors: fmt(Object.keys(ed.sectors).length),
      }));
      closeEditor(true);
    } catch (ex) {
      toast(T('ed.saveFail', { e: ex.message }), true);
      btn.disabled = false;
    }
  };

  /* ── settings: theme + language ──────────────────────────────────── */
  const THEME_KEY = 'tablex_theme';
  const setPop = $('setPop'), btnSet = $('btnSettings');

  function markActive() {
    const theme = document.documentElement.dataset.theme;
    setPop.querySelectorAll('[data-set-theme]').forEach(b =>
      b.classList.toggle('on', b.dataset.setTheme === theme));
    setPop.querySelectorAll('[data-set-lang]').forEach(b =>
      b.classList.toggle('on', b.dataset.setLang === I18N.lang));
  }

  function setTheme(next) {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode */ }
    markActive();
  }

  // Everything rendered from JS has to be rebuilt on a language switch —
  // I18N.apply() only refreshes the static data-i18n nodes in the markup.
  function relocalize() {
    I18N.apply();
    renderFacts();
    renderDbCards();
    updateChip();
    updateHint();
    if (lastRows) renderTable(lastRows);
    if (ed) renderEditor();
    markActive();
  }

  function renderFacts() {
    const ul = $('abFacts');
    if (ul) ul.innerHTML = I18N.facts().map(f => `<li>${f}</li>`).join('');
  }

  setPop.querySelectorAll('[data-set-theme]').forEach(b =>
    b.onclick = () => setTheme(b.dataset.setTheme));
  setPop.querySelectorAll('[data-set-lang]').forEach(b =>
    b.onclick = () => { I18N.set(b.dataset.setLang); relocalize(); });

  function toggleSettings(open) {
    const show = open === undefined ? setPop.classList.contains('hidden') : open;
    setPop.classList.toggle('hidden', !show);
    btnSet.setAttribute('aria-expanded', String(show));
  }
  btnSet.onclick = e => { e.stopPropagation(); toggleSettings(); };
  addEventListener('click', e => {
    if (!setPop.classList.contains('hidden') && !setPop.contains(e.target)) toggleSettings(false);
  });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // The confirm sits on top of everything, so it answers Escape first —
    // otherwise Escape would close the editor out from under its own
    // "discard unsaved changes?" prompt.
    if (askDone) closeAsk(false);
    else if (!setPop.classList.contains('hidden')) toggleSettings(false);
    else if (!$('dbEditor').classList.contains('hidden')) closeEditor();
  });

  I18N.apply();
  renderFacts();
  markActive();
  loadAll();
})();
