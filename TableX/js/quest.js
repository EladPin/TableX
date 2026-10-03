/* ═══════════════════════════════════════════════════════════════════
   QUEST — אתרים חדשים: a new Planet site, without copying one by hand.

   The first of the Planet quests. The RF team is handed a נ.צ and a plant
   for a site that will be built, and today the job is: copy an existing
   site in Planet, change its every field to the new one's, repeat 13+ times
   a round. Every repetition is a chance to get one field wrong.

   This view does the copying. js/sitegen.js is the engine and carries the
   format contract; this is only the form around it.

   THE SHAPE OF THE WORK, and why the form looks like this:

   1. PICK A TEMPLATE SITE — from the databases already loaded, all four at
      once. The site's database IS its network, so nobody says which operator
      it is. Its sectors SEED the form, so the fields open holding real values
      to adjust rather than empty boxes to fill: copy a site, change its data.
      The clone itself needs Planet's own columns, which the database does not
      keep — but its import kept a KIT of them (sitegen.js makeKit), and that
      is what the rows are cloned from. A database imported before the kit
      existed says so and points at its update button.
   2. NAME THE GROUP. Created in Planet FIRST, and the file is named after
      it — that is how Planet decides where the sites land.
   3. EDIT AND GENERATE. The נ.צ is typed in GEO or UTM 36N, whichever it
      arrived in; the other is shown beside it as a check.

   SAVED GROUPS (2026-10-03). Every group a file is generated from is kept on
   the server (api/grp), as the form that made it, so it can be opened again
   or copied into the next one — a round is usually "the same group, with a
   couple of sites changed". A saved group IS what was last generated, never
   a draft: that is what lets the form say which of its sites Planet already
   has from another group, and whether they still match it.

   Prompts and toasts go through TableXUI so this speaks in the app's voice;
   the databases are read through TableXDB.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const UI = () => global.TableXUI;
  const DBX = () => global.TableXDB;
  const SG = () => global.TableXSiteGen;
  const GEO = () => global.TableXGeo;
  const T = (k, v) => (UI() ? UI().T(k, v) : k);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmtN = n => Number(n).toLocaleString('en-US');

  const SCAN_CAP = 400;            // matches collected before ranking
  const RESULT_CAP = 40;           // and shown, like the site sheet's picker
  const AC_CAP = 8;                // antennas offered at once
  const FMT_KEY = 'tablex_coord';  // GEO or UTM, kept per machine

  // The plant fields a sector must carry. A blank one would not stay blank:
  // the clone would keep the DONOR's value — some other site's azimuth — so
  // a missing field is refused rather than silently filled.
  const NUMS = ['az', 'height', 'tilt', 'etilt', 'pwr', 'crs'];

  // The column each plant field is written to. A field whose column the
  // network's export does not carry is shown but switched off: required, it
  // would demand a value that has nowhere to go.
  const COLS = { az: 'azimuth', height: 'height (m)', tilt: 'mechanical tilt',
                 etilt: 'electrical tilt', model: 'antenna file', pwr: 'pa power (dbm)',
                 // Planet's `Reference Signal Power Boosting (dB)` — the BOOST
                 // relative to the data REs (0 dB is normal), not the RS power
                 crs: 'reference signal power boosting (db)' };

  let tmpl = null;                 // {net, id, name, xy, kit, sectors:[seed]}
  let rows = [];                   // the new sites being built
  let seq = 0, sk = 0;             // ids for sites and sectors, for FLIP/keys
  let fresh = new Set();           // what to animate in on the next render
  let taken = null;                // every site id in every database, lazily
  let fmt = readFmt();

  const LIB_CAP = 6;               // saved groups shown before "show all"
  let lib = [];                    // the saved groups, newest first
  let libAll = false;              // showing every one of them
  let libAnim = false;             // the next list render rises in, staggered
  const libFresh = new Set();      // ...or only these ids do
  let curId = null;                // the saved group the form was opened from
  let copyFrom = null;             // the group the form was copied from
  let base = '';                   // the form as last opened or saved — "unsaved" is measured from here

  function readFmt() {
    try { return localStorage.getItem(FMT_KEY) === 'utm' ? 'utm' : 'geo'; }
    catch (e) { return 'geo'; }
  }

  /* ── small helpers ───────────────────────────────────────────────── */

  const val = x => (x == null ? '' : String(x));
  function numOf(s) {
    const t = String(s == null ? '' : s).trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }

  // Whether the template network's export has a column for a field.
  function carries(f) {
    if (!(f in COLS) || !tmpl || !tmpl.kit) return true;
    if (!tmpl.heads) {
      tmpl.heads = new Set();
      for (const sh of tmpl.kit.sheets) {
        for (const h of sh.head) tmpl.heads.add(String(h == null ? '' : h).replace(/\s+/g, ' ').trim().toLowerCase());
      }
    }
    return tmpl.heads.has(COLS[f]);
  }

  // The query marked where it occurs, escaping per fragment AFTER the split
  // so a name carrying & or " is never cut mid-entity (see app.js lkHi).
  function hi(text, q) {
    const v = String(text == null ? '' : text);
    if (!q) return esc(v);
    const low = v.toLowerCase();
    let out = '', from = 0, i = low.indexOf(q);
    while (i >= 0) {
      out += esc(v.slice(from, i)) + '<mark class="lk-hi">' + esc(v.slice(i, i + q.length)) + '</mark>';
      from = i + q.length;
      i = low.indexOf(q, from);
    }
    return out + esc(v.slice(from));
  }

  function flash(el) {
    if (!el || reduced()) return;
    el.classList.remove('flash');
    void el.offsetWidth;               // restart the animation on a repeat
    el.classList.add('flash');
  }

  function restart(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // Rows that move because one above them came or went GLIDE there rather
  // than jump: positions are read before the change and played back after.
  function flip(box, sel, mutate) {
    if (reduced()) return mutate();
    const before = new Map();
    box.querySelectorAll(sel).forEach(el => before.set(el.dataset.key, el.getBoundingClientRect().top));
    mutate();
    box.querySelectorAll(sel).forEach(el => {
      const t0 = before.get(el.dataset.key);
      if (t0 == null) return;
      const dy = t0 - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      el.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }],
                 { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    });
  }

  function leave(el, done) {
    if (!el || reduced()) return done();
    const a = el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px) scale(0.985)' }],
      { duration: 170, easing: 'ease-in', fill: 'forwards' });
    a.onfinish = done;
  }

  /* ── the databases ───────────────────────────────────────────────── */

  // Every site id any database knows, plus the ones each kit recorded as
  // carrying no sector (the database drops those, Planet does not). A new
  // site reusing one would overwrite a real site for the whole team. All
  // four networks, because they share one Planet project.
  function takenIds() {
    if (taken) return taken;
    taken = new Set();
    for (const net of DBX().NETWORKS) {
      const db = DBX().get(net);
      if (!db) continue;
      for (const id in db.sites || {}) taken.add(id.toLowerCase());
      for (const k in db.sectors || {}) taken.add(String(db.sectors[k][0]).toLowerCase());
      for (const id of (db.kit && db.kit.idle) || []) taken.add(String(id).toLowerCase());
    }
    return taken;
  }

  function find(q) {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const out = [];
    for (const net of DBX().NETWORKS) {
      const db = DBX().get(net);
      if (!db || !db.sites) continue;
      for (const id in db.sites) {
        const nm = db.sites[id] || '';
        const li = id.toLowerCase();
        if (li.indexOf(t) < 0 && nm.toLowerCase().indexOf(t) < 0) continue;
        out.push({ net, id, name: nm, kit: !!db.kit,
                   n: ((db.siteSectorsAll && db.siteSectorsAll[id]) || []).length,
                   rank: li === t ? 0 : li.indexOf(t) === 0 ? 1 : 2 });
        if (out.length >= SCAN_CAP) break;
      }
    }
    // An exact Site ID first, then ids that start with the query — the code
    // read off Planet is the common case, and it should not sit 30th.
    return out.sort((a, b) => a.rank - b.rank).slice(0, RESULT_CAP);
  }

  /* ── 1. the template ─────────────────────────────────────────────── */

  // One template sector, read off the database. The code is what a new
  // sector's id is built from: Partner's trailing letters (Da), or — for a
  // network whose Sector ID repeats per site, IDF's 1/2/3 — the id itself.
  function seedOf(db, net, kit, key) {
    const v = db.sectors[key] || [];
    const a = (db.ant && db.ant[key]) || [];
    const composite = !!(kit && kit.composite);
    return {
      code: composite ? val(v[1]) : (key.match(/[A-Za-z]{1,3}$/) || [''])[0],
      raw: composite ? val(v[1]) : '',
      band: SG().bandFor(kit, v[2], v[3]),
      mhz: DBX().mhz(v[2], net),
      az: a[1], height: a[0], tilt: a[2], model: a[3] || '', etilt: a[4],
      pwr: db.pwr ? db.pwr[key] : null,
      crs: db.crs ? db.crs[key] : null,
    };
  }

  function pick(net, id) {
    const db = DBX().get(net);
    if (!db || !db.sites) return;
    const kit = db.kit || null;
    const keys = ((db.siteSectorsAll && db.siteSectorsAll[id]) || []).slice().sort();
    tmpl = { net, id, name: db.sites[id] || '', kit,
             xy: (db.coords && db.coords[id]) || null,
             sectors: keys.map(k => seedOf(db, net, kit, k)) };
    rows = [];
    $('qPick').value = '';
    $('qAfter').classList.add('hidden');
    if (kit) addRow();
    render();
    settle();                          // a freshly seeded site is nothing to lose
    paintLib();
    // Straight to the first thing that must be typed: the new Site ID.
    if (kit) setTimeout(() => {
      const f = $('qGroup').value.trim() ? document.querySelector('#qRows [data-f="siteId"]') : $('qGroup');
      if (f) f.focus({ preventScroll: true });
    }, 120);
  }

  // Picked the wrong one: back to the search. The new sites were seeded from
  // it, so they go too — but anything unsaved is worth one question first.
  // A saved group that is put back loses nothing: it is still in the list.
  async function clearTmpl() {
    if (dirty() && !(await UI().ask(T('q.discard', { n: rows.length }),
                                    { ok: 'q.discardOk', danger: true }))) return;
    const card = $('qTmpl').firstElementChild;
    leave(card, () => {
      tmpl = null;
      rows = [];
      curId = null;
      copyFrom = null;
      $('qAfter').classList.add('hidden');
      render();
      settle();
      paintLib();
      setTimeout(() => $('qPick').focus(), 30);
    });
  }

  /* ── 3. the new sites ────────────────────────────────────────────── */

  // A new site opens holding the TEMPLATE's plant, because the job is to
  // adjust a copy rather than to type a site from nothing. Only the identity
  // is blank: the id and the name are the two things that must be new.
  function addRow() {
    if (!tmpl || !tmpl.kit) return;
    const uid = ++seq;
    rows.push({
      uid, siteId: '', name: '',
      xy: seedXy(tmpl.xy),
      sectors: tmpl.sectors.map(newSector),
    });
    fresh.add('s' + uid);
  }

  function newSector(s) {
    const k = ++sk;
    return { k, sectorId: s.raw || '', auto: false, code: s.code || '', band: s.band || '',
             mhz: s.mhz, az: val(s.az), height: val(s.height), tilt: val(s.tilt),
             etilt: val(s.etilt), model: s.model || '', pwr: val(s.pwr), crs: val(s.crs) };
  }

  // Partner's own naming, offered as a prefill and never applied silently —
  // a filled id stays whatever the user typed. One that the form filled
  // follows the Site ID as it changes, and clears if it stops fitting.
  function autoSectorIds(row, siteEl) {
    if (tmpl.kit.composite) return;
    row.sectors.forEach(s => {
      if (s.sectorId && !s.auto) return;
      const sug = SG().suggestSectorId(row.siteId, s.code);
      if (sug === s.sectorId) return;
      s.sectorId = sug;
      s.auto = !!sug;
      const inp = siteEl && siteEl.querySelector('[data-key="' + s.k + '"] [data-s="sectorId"]');
      if (inp) { inp.value = sug; flash(inp); }
    });
  }

  /* ── coordinates: GEO or UTM 36N ─────────────────────────────────── */

  // A row keeps its coordinates as last TYPED, in the format they were typed
  // in, and converts only for display — so GEO -> UTM -> GEO shows exactly
  // what was typed, with no rounding drift from the round trip. Planet reads
  // either format, so what is written is what is on screen.
  function seedXy(xy) {
    if (!xy) return { fmt, a: '', b: '' };
    const geo = Math.abs(xy[0]) <= 180 && Math.abs(xy[1]) <= 90;
    return { fmt: geo ? 'geo' : 'utm', a: String(xy[0]), b: String(xy[1]) };
  }

  function shown(xy) {
    if (xy.fmt === fmt) return [xy.a, xy.b];
    const a = numOf(xy.a), b = numOf(xy.b);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return ['', ''];
    if (fmt === 'utm') {
      const [e, n] = GEO().toUtm(a, b);
      return [e.toFixed(1), n.toFixed(1)];
    }
    const [lon, lat] = GEO().fromUtm(a, b);
    return [lon.toFixed(6), lat.toFixed(6)];
  }

  const fmtName = () => (fmt === 'utm' ? 'UTM 36N' : 'GEO');
  const inRange = (a, b) => (fmt === 'geo' ? GEO().inGeo(a, b) : GEO().inUtm(a, b));

  // The same point in the other format, under the fields: the one check a
  // soldier can make by eye before the file reaches a shared project.
  function coHint(xy) {
    const [a, b] = shown(xy).map(numOf);
    if (a == null || b == null) return { text: '', bad: false };
    if (!Number.isFinite(a) || !Number.isFinite(b) || !inRange(a, b)) {
      return { text: T('q.coBad', { f: fmtName() }), bad: true };
    }
    if (fmt === 'geo') {
      const [e, n] = GEO().toUtm(a, b);
      return { text: 'UTM 36N   E ' + e.toFixed(1) + '   N ' + n.toFixed(1), bad: false };
    }
    const [lon, lat] = GEO().fromUtm(a, b);
    return { text: 'WGS84   ' + lat.toFixed(6) + '°N   ' + lon.toFixed(6) + '°E', bad: false };
  }

  function setFmt(next) {
    if (next === fmt) return;
    fmt = next;
    try { localStorage.setItem(FMT_KEY, fmt); } catch (e) { /* private mode */ }
    renderFmt();
    // In place, not a re-render: the rows stay put and only the numbers
    // change, each one flashing as it is converted.
    document.querySelectorAll('#qRows .q-site').forEach(el => {
      const r = rows.find(x => x.uid === +el.dataset.uid);
      if (r) paintCoords(el, r, true);
    });
  }

  function paintCoords(el, r, anim) {
    const [a, b] = shown(r.xy);
    const ia = el.querySelector('[data-f="a"]'), ib = el.querySelector('[data-f="b"]');
    if (ia && ia !== document.activeElement) ia.value = a;
    if (ib && ib !== document.activeElement) ib.value = b;
    const la = el.querySelector('[data-lab="a"]'), lb = el.querySelector('[data-lab="b"]');
    if (la) la.textContent = T(fmt === 'geo' ? 'q.coLon' : 'q.coE');
    if (lb) lb.textContent = T(fmt === 'geo' ? 'q.coLat' : 'q.coN');
    paintHint(el, r);
    if (anim) { flash(ia); flash(ib); }
  }

  function paintHint(el, r) {
    const h = el.querySelector('[data-hint]');
    if (!h) return;
    const c = coHint(r.xy);
    h.textContent = c.text;
    h.classList.toggle('bad', c.bad);
  }

  /* ── the antenna file names its band ─────────────────────────────── */

  // Planet's antenna FILE is per band: EGV465DR6_700.pafx and
  // EGV465DR6_1800.pafx are one physical antenna and two radiation patterns,
  // and the pattern is what coverage is predicted with. In the May-26 Partner
  // export 13,392 of the 13,401 files that name a band sit on a sector of
  // that band. So a sector moved to 700 that keeps its _1800 file is
  // predicted with the wrong pattern, and nothing would say so.
  //
  // The band is the trailing `_<MHz>` before the extension, and only an
  // operator's band label counts — dbparse.js EARFCN_BANDS, read rather than
  // copied. A file that names no band (the ODI multi-band panels,
  // 80010864.pafx, <Generic>) serves any band and is never questioned.
  // Band 28 has two names: 700 as the operators and that table print it, 750
  // as Planet labels it (P3M_750LTE, P3M_750MHz_*), so _750 is a 700 file.
  const band28 = m => (m === 750 ? 700 : m);
  let labels = null;
  function bandLabels() {
    if (!labels && global.TableXBands) labels = new Set(global.TableXBands.map(b => b[2]).concat(750));
    return labels || new Set();
  }

  // { mhz, label, fam } — `fam` is the file with its band taken out, which
  // is what makes EGV465DR6_700.pafx and EGV465DR6_1800.pafx one antenna.
  function fileBand(file) {
    const t = String(file == null ? '' : file).trim();
    const m = /_(\d{3,4})(\.[^._]*)?$/.exec(t);
    if (!m || !bandLabels().has(+m[1])) return null;
    return { mhz: band28(+m[1]), label: m[1],
             fam: (t.slice(0, m.index) + t.slice(m.index + m[1].length + 1)).toLowerCase() };
  }

  // A sector's band against its file's: null when they agree, when either
  // is unknown, or when this network's export carries no antenna column.
  function offBand(s) {
    if (!carries('model')) return null;
    const fb = fileBand(s.model);
    const m = band28(Number(s.mhz));
    if (!fb || !m) return null;
    return fb.mhz === m ? null : { file: fb.label, sector: m };
  }

  // The same antenna's file for another band, from any database — the
  // template's own network first, then the most used. Null when no database
  // carries one.
  function sibling(file, mhz) {
    const fb = fileBand(file);
    if (!fb) return null;
    const own = tmpl ? tmpl.net : null;
    let best = null;
    for (const net of DBX().NETWORKS) {
      for (const f of filesOf(DBX().get(net))) {
        if (!f.band || f.band.mhz !== mhz || f.band.fam !== fb.fam) continue;
        const mine = net === own ? 1 : 0;
        if (!best || mine > best.mine || (mine === best.mine && f.n > best.n)) best = { file: f.file, mine, n: f.n };
      }
    }
    return best ? best.file : null;
  }

  function offNote(s, off) {
    const next = sibling(s.model, off.sector);
    return '<span>' + esc(T('q.offBand', { f: off.file, s: off.sector })) + '</span>' +
      (next ? '<button type="button" class="q-swap" data-swap="' + esc(next) + '">' +
                '<span>' + esc(T('q.offSwap')) + '</span><span class="mono">' + esc(next) + '</span>' +
              '</button>' : '');
  }

  // In place, never a re-render, so the field being typed in keeps focus.
  // The note opens and closes by HEIGHT in CSS, so whatever is below it
  // glides rather than jumps.
  function paintBand(secEl, s) {
    if (!secEl || !s) return;
    const off = offBand(s);
    const inp = secEl.querySelector('[data-s="model"]');
    if (inp) inp.classList.toggle('off', !!off);
    const note = secEl.querySelector('[data-note]');
    if (!note) return;
    if (off) note.firstElementChild.firstElementChild.innerHTML = offNote(s, off);
    note.classList.toggle('on', !!off);
  }

  // A band change takes the file with it when the same antenna has one for
  // the new band — the swap a planner makes without thinking — and flashes
  // it, so a value you did not type is one you saw. Without one the file
  // stays and the note says so. Never refused: the real network has nine
  // sectors whose file names another band, so it is the planner's call.
  function followBand(secEl, s) {
    const off = offBand(s);
    const next = off && sibling(s.model, off.sector);
    if (next) {
      s.model = next;
      const inp = secEl && secEl.querySelector('[data-s="model"]');
      if (inp) { inp.value = next; flash(inp); }
    }
    paintBand(secEl, s);
  }

  /* ── saved groups ────────────────────────────────────────────────── */

  // Ids are generated, never typed: the server constrains them to [a-z0-9-],
  // and a name like לבנון_דפא_א cannot be one (deck.js does the same).
  const newGid = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const recOf = id => (id && lib.find(g => g.id === id)) || null;
  const sortLib = () => lib.sort((a, b) => String(b.made || '').localeCompare(String(a.made || '')));

  async function loadLib() {
    let got = [];
    try {
      const r = await fetch('api/grp', { cache: 'no-store' });
      got = r.ok ? await r.json() : [];
    } catch (e) {
      got = [];                        // opened without the server
    }
    lib = (Array.isArray(got) ? got : []).filter(g => g && g.id && g.name && Array.isArray(g.sites));
    sortLib();
    if (curId && !recOf(curId)) curId = null;
  }

  // 3.10.26, 14:20 — the same in both languages, like the coordinates.
  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = x => String(x).padStart(2, '0');
    return d.getDate() + '.' + (d.getMonth() + 1) + '.' + p(d.getFullYear() % 100) +
      ', ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // A site as it is stored: the form's own fields, so opening it again IS
  // the form it was — sector ids the form filled still follow the Site ID.
  function siteOut(r) {
    return {
      siteId: r.siteId.trim(), name: r.name.trim(),
      xy: { fmt: r.xy.fmt, a: val(r.xy.a).trim(), b: val(r.xy.b).trim() },
      sectors: r.sectors.map(s => ({
        sectorId: val(s.sectorId).trim(), auto: !!s.auto, code: s.code || '', band: s.band || '',
        mhz: s.mhz == null ? null : s.mhz,
        az: val(s.az).trim(), height: val(s.height).trim(), tilt: val(s.tilt).trim(),
        etilt: val(s.etilt).trim(), model: val(s.model).trim(), pwr: val(s.pwr).trim(),
        crs: val(s.crs).trim(),
      })),
    };
  }

  function siteIn(s) {
    const uid = ++seq;
    fresh.add('s' + uid);
    const xy = s.xy || {};
    return {
      uid, siteId: val(s.siteId), name: val(s.name),
      xy: { fmt: xy.fmt === 'utm' ? 'utm' : 'geo', a: val(xy.a), b: val(xy.b) },
      sectors: (s.sectors || []).map(x => ({
        k: ++sk, sectorId: val(x.sectorId), auto: !!x.auto, code: x.code || '', band: x.band || '',
        mhz: x.mhz, az: val(x.az), height: val(x.height), tilt: val(x.tilt), etilt: val(x.etilt),
        model: val(x.model), pwr: val(x.pwr), crs: val(x.crs),
      })),
    };
  }

  // What a site IS, for telling whether two groups hold the same one: every
  // field the workbook writes, numbers compared as numbers, and the point in
  // degrees to ~1 m — so a site typed in UTM in one group and in GEO in the
  // other is still one site.
  function siteSig(s) {
    const n = v => { const x = numOf(v); return x == null ? '' : Number.isFinite(x) ? String(x) : String(v).trim(); };
    let pt = [s.xy.fmt, n(s.xy.a), n(s.xy.b)];
    const a = numOf(s.xy.a), b = numOf(s.xy.b);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const g = s.xy.fmt === 'utm' ? GEO().fromUtm(a, b) : [a, b];
      pt = [g[0].toFixed(5), g[1].toFixed(5)];
    }
    return JSON.stringify([s.name.trim(), pt, s.sectors.map(x => [
      String(x.sectorId).trim().toLowerCase(), x.band, n(x.az), n(x.height), n(x.tilt), n(x.etilt),
      String(x.model || '').trim(), n(x.pwr), n(x.crs)])]);
  }

  // A saved group's sites, lower-cased id -> signature, worked out once.
  function sigsOf(g) {
    if (!g._sigs) {
      g._sigs = new Map();
      for (const s of g.sites) g._sigs.set(String(s.siteId).trim().toLowerCase(), siteSig(s));
    }
    return g._sigs;
  }

  // The form, for "is anything here unsaved": the group, the template and
  // every site. Nothing to lose until there is a template.
  function snapSig() {
    if (!tmpl) return '';
    return JSON.stringify([$('qGroup').value.trim(), tmpl.net, tmpl.id,
      rows.map(r => [r.siteId.trim(), siteSig(siteOut(r))])]);
  }
  const dirty = () => !!tmpl && snapSig() !== base;
  const settle = () => { base = snapSig(); };

  // The OTHER saved groups a site of this form was already generated in.
  // Planet has one site per Site ID, so writing it again changes it there
  // too: harmless when it is the same site (it only joins this group as
  // well), a real change when it is not. The group this name replaces is
  // not "other" — it is the one being rewritten.
  function sharedOf(r) {
    const id = r.siteId.trim().toLowerCase();
    if (!id || !lib.length) return null;
    const g = $('qGroup').value.trim();
    let sig = null;
    const all = [], diff = [];
    for (const rec of lib) {
      if (sameName(rec.name, g)) continue;
      const theirs = sigsOf(rec).get(id);
      if (theirs == null) continue;
      if (sig == null) sig = siteSig(siteOut(r));
      all.push(rec.name);
      if (theirs !== sig) diff.push(rec.name);
    }
    return all.length ? { all, diff } : null;
  }

  // The next name in a series: לבנון_דפא_א -> לבנון_דפא_ב, Run_A -> Run_B,
  // Run_09 -> Run_10, anything else gets _2 — and on until no saved group
  // has it. Only a SINGLE letter after a separator counts, so a name that
  // ends in a word (דפא) is not taken for one; a final form (ך) or the last
  // letter (ת) starts a _2.
  const HEB = 'אבגדהוזחטיכלמנסעפצקרשת';
  function bump(n) {
    let m = /^(.*[_\-\s])([א-ת])$/.exec(n);
    const h = m ? HEB.indexOf(m[2]) : -1;
    if (h >= 0 && h < HEB.length - 1) return m[1] + HEB[h + 1];
    m = /^(.*[_\-\s])([A-Ya-y])$/.exec(n);
    if (m) return m[1] + String.fromCharCode(m[2].charCodeAt(0) + 1);
    m = /^(.*?)(\d+)$/.exec(n);
    if (m) return m[1] + String(+m[2] + 1).padStart(m[2].length, '0');
    return n + '_2';
  }
  function nextName(name, names) {
    const have = new Set((names || lib.map(g => g.name)).map(x => String(x).trim().toLowerCase()));
    let n = String(name).trim();
    for (let i = 0; i < 60; i++) {
      n = bump(n);
      if (!have.has(n.toLowerCase())) return n;
    }
    return n;
  }

  // Open a saved group, or COPY it into a new one under the next name in its
  // series. Either way the form becomes that group's sites, with the
  // template it was made from — stored with it, so a database re-imported
  // since does not change what "add a site" seeds. Unsaved work in the form
  // is asked about first.
  async function openRec(id, copy) {
    const rec = recOf(id);
    if (!rec) return;
    if (!copy && id === curId && !dirty()) return toForm(false);
    if (dirty() && !(await UI().ask(T('q.switch'), { ok: 'q.switchOk', danger: true }))) return;
    acClose();
    const db = DBX().get(rec.net);
    const t = rec.tmpl || {};
    tmpl = { net: rec.net, id: t.id || '', name: t.name || '', xy: t.xy || null,
             kit: (db && db.kit) || null, sectors: Array.isArray(t.sectors) ? t.sectors : [] };
    rows = rec.sites.map(siteIn);
    curId = copy ? null : rec.id;
    copyFrom = copy ? rec.name : (rec.from || null);
    $('qGroup').value = copy ? nextName(rec.name) : rec.name;
    $('qPick').value = '';
    $('qAfter').classList.add('hidden');
    render();
    settle();
    paintLib();
    if (copy) UI().toast(T('q.copied', { g: rec.name, n: rec.sites.length }));
    toForm(copy);
  }

  // Down to what was opened: a copy's new name first — it is the one thing
  // that must change — otherwise the sites.
  function toForm(copy) {
    const el = copy ? $('qStep2') : $('qStep3');
    el.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    if (!copy) return;
    setTimeout(() => {
      const g = $('qGroup');
      g.focus({ preventScroll: true });
      g.select();
      flash(g);
    }, reduced() ? 0 : 320);
  }

  async function newGroup() {
    if (dirty() && !(await UI().ask(T('q.switch'), { ok: 'q.switchOk', danger: true }))) return;
    acClose();
    tmpl = null;
    rows = [];
    curId = null;
    copyFrom = null;
    $('qGroup').value = '';
    $('qPick').value = '';
    $('qAfter').classList.add('hidden');
    render();
    settle();
    paintLib();
    $('qStep1').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    setTimeout(() => $('qPick').focus({ preventScroll: true }), reduced() ? 0 : 320);
  }

  // From the list only — Planet keeps the group, and the ask says so.
  async function delRec(id) {
    const rec = recOf(id);
    if (!rec) return;
    if (!(await UI().ask(T('q.delAsk', { g: rec.name }), { ok: 'q.del', danger: true }))) return;
    try {
      const r = await fetch('api/grp/' + rec.id, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.text()) || ('HTTP ' + r.status));
    } catch (e) {
      UI().toast(T('q.delFail', { e: e.message }), true);
      return;
    }
    const box = $('qLibList');
    leave(box.querySelector('[data-gid="' + rec.id + '"]'), () => {
      flip(box, '.dk-card', () => {
        lib = lib.filter(g => g.id !== rec.id);
        // The form stays as it is, but nothing holds it any more: leaving
        // it now is leaving unsaved work, and is asked about.
        if (curId === rec.id) { curId = null; base = ''; }
        renderLib();
      });
      paintGroupNote();
      paintShares();
    });
    UI().toast(T('q.deleted', { g: rec.name }));
  }

  // The group as generated, into the list. Keyed by NAME, like the file it
  // made: generated again under its own name it replaces its record; under
  // another name it is a new group, and the one it came from stays as it was.
  async function saveGroup(groupName, file) {
    const prev = lib.find(g => sameName(g.name, groupName)) || null;
    const cur = recOf(curId);
    const now = new Date().toISOString();
    const from = cur && !sameName(cur.name, groupName) ? cur.name
      : (copyFrom || (prev && prev.from) || null);
    const rec = {
      v: 1,
      id: prev ? prev.id : newGid(),
      name: groupName,
      net: tmpl.net,
      tmpl: { id: tmpl.id, name: tmpl.name, xy: tmpl.xy, sectors: tmpl.sectors },
      sites: rows.map(siteOut),
      file,
      created: (prev && prev.created) || now,
      made: now,
    };
    if (from) rec.from = from;
    try {
      const r = await fetch('api/grp/' + rec.id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(rec),
      });
      if (!r.ok) throw new Error((await r.text()) || ('HTTP ' + r.status));
    } catch (e) {
      UI().toast(T('q.saveFail', { e: e.message }), true);
      return;
    }
    flip($('qLibList'), '.dk-card', () => {
      lib = lib.filter(g => g.id !== rec.id);
      lib.unshift(rec);
      libFresh.add(rec.id);
      curId = rec.id;
      copyFrom = rec.from || null;
      renderLib();
    });
    settle();
    paintLib();
    paintGroupNote();
    paintShares();
  }

  // Every site whose Site ID another saved group already generated with
  // other data — asked about once at generate, like the antenna files.
  function sharedList() {
    const out = [];
    rows.forEach(r => {
      const sh = sharedOf(r);
      if (sh && sh.diff.length) {
        out.push({ id: r.siteId.trim(), g: sh.diff, sel: '.q-site[data-uid="' + r.uid + '"] [data-f="siteId"]' });
      }
    });
    return out;
  }

  function sharedAsk(list) {
    const items = list.slice(0, 4).map(x => T('q.shItem', { id: x.id, g: x.g.join(', ') }));
    if (list.length > 4) items[3] += T('q.andMore', { n: list.length - 4 });
    return T('q.shAsk', { n: list.length, list: items.join('\n\n') });
  }

  /* ── what is still wrong ─────────────────────────────────────────── */

  // Each problem names the field it is about, so a refused generate can
  // mark it and take the user there rather than only describing it.
  function problems(withGroup) {
    const out = [];
    if (!tmpl || !tmpl.kit) return out;
    if (withGroup && !$('qGroup').value.trim()) out.push({ msg: T('q.errGroup'), sel: '#qGroup' });
    const seen = new Set(), ids = takenIds();
    rows.forEach((r, i) => {
      const n = i + 1, at = '.q-site[data-uid="' + r.uid + '"] ';
      const id = r.siteId.trim(), low = id.toLowerCase();
      if (!id) out.push({ msg: T('q.errId', { n }), sel: at + '[data-f="siteId"]' });
      else if (ids.has(low)) out.push({ msg: T('q.errTaken', { id }), sel: at + '[data-f="siteId"]' });
      else if (seen.has(low)) out.push({ msg: T('q.errDup', { id }), sel: at + '[data-f="siteId"]' });
      else seen.add(low);
      if (!r.name.trim()) out.push({ msg: T('q.errName', { n }), sel: at + '[data-f="name"]' });

      const [a, b] = shown(r.xy).map(numOf);
      if (a == null || b == null) out.push({ msg: T('q.errCoord', { n }), sel: at + '[data-f="' + (a == null ? 'a' : 'b') + '"]' });
      else if (!Number.isFinite(a) || !Number.isFinite(b) || !inRange(a, b)) {
        out.push({ msg: T('q.errRange', { n, f: fmtName() }), sel: at + '[data-f="a"]' });
      }

      if (!r.sectors.length) out.push({ msg: T('q.errNoSec', { n }), sel: at + '[data-addsec]' });
      const secSeen = new Set();
      r.sectors.forEach((s, j) => {
        const sat = at + '[data-key="' + s.k + '"] ';
        const sid = String(s.sectorId).trim();
        if (!sid) out.push({ msg: T('q.errSector', { n, j: j + 1 }), sel: sat + '[data-s="sectorId"]' });
        else if (secSeen.has(sid.toLowerCase())) out.push({ msg: T('q.errSecDup', { id: sid }), sel: sat + '[data-s="sectorId"]' });
        else secSeen.add(sid.toLowerCase());
        if (!s.band) out.push({ msg: T('q.errBand', { n, j: j + 1 }), sel: sat + '[data-s="band"]' });
        for (const f of NUMS) {
          if (!carries(f)) continue;
          const v = numOf(s[f]);
          if (v == null || !Number.isFinite(v)) {
            out.push({ msg: T('q.errNum', { n, j: j + 1, f: T('q.c_' + f) }), sel: sat + '[data-s="' + f + '"]' });
          }
        }
        if (carries('model') && !String(s.model).trim()) out.push({ msg: T('q.errNum', { n, j: j + 1, f: T('q.c_model') }), sel: sat + '[data-s="model"]' });
      });
    });
    return out;
  }

  /* ── render ──────────────────────────────────────────────────────── */

  function render() {
    renderLib();
    renderResults();
    renderNets();
    renderTmpl();
    renderFile();
    paintGroupNote();
    renderFmt();
    renderRows();
    renderSteps();
  }

  // The saved groups, as cards like the Decks view's templates: a card opens
  // its group, its actions copy or delete it, and the dashed one starts over.
  function renderLib() {
    const box = $('qLibList');
    if (!box) return;
    $('qLibN').textContent = lib.length ? String(lib.length) : '';
    if (!lib.length) {
      box.innerHTML = '<p class="q-lib-empty">' + esc(T('q.libEmpty')) + '</p>';
    } else {
      const list = libAll ? lib : lib.slice(0, LIB_CAP);
      box.innerHTML = '<div class="q-gcards">' + list.map(gcard).join('') +
        '<button class="dk-card dk-new q-gnew' + (libAnim ? ' q-rise' : '') + '" data-gnew data-key="new"' +
          ' style="--i:' + list.length + '">' +
          '<span class="dk-plus" aria-hidden="true">+</span>' +
          '<span class="dk-name">' + esc(T('q.newGroup')) + '</span>' +
          '<span class="dk-meta">' + esc(T('q.newGroupSub')) + '</span>' +
        '</button></div>' +
        (lib.length > LIB_CAP
          ? '<button class="q-lib-more" data-gmore>' +
              esc(T(libAll ? 'q.libLess' : 'q.libAll', { n: lib.length })) + '</button>'
          : '');
    }
    libAnim = false;
    libFresh.clear();
    paintLib();
  }

  function gcard(g, i) {
    const secs = g.sites.reduce((a, s) => a + (s.sectors || []).length, 0);
    const ids = g.sites.map(s => s.siteId).filter(Boolean);
    const idText = ids.slice(0, 3).join(', ') + (ids.length > 3 ? '  +' + (ids.length - 3) : '');
    const when = [T('q.made', { d: fmtDate(g.made) })];
    if (g.from) when.push(T('q.from', { g: g.from }));
    return '<button class="dk-card q-gcard' + (libAnim || libFresh.has(g.id) ? ' q-rise' : '') +
      '" data-gid="' + esc(g.id) + '" data-key="' + esc(g.id) + '" style="--i:' + i + '">' +
      '<span class="q-gcard-top">' +
        '<span class="q-gcard-sq" aria-hidden="true"></span>' +
        '<span class="dk-name" dir="auto">' + esc(g.name) + '</span>' +
        '<span class="tag tag-net">' + esc(DBX().label(g.net)) + '</span>' +
      '</span>' +
      '<span class="dk-meta">' + esc(T('q.count', { n: g.sites.length, s: secs })) + '</span>' +
      (idText ? '<span class="q-gcard-ids"><span class="mono">' + esc(idText) + '</span></span>' : '') +
      '<span class="dk-meta">' + esc(when.join(' · ')) + '</span>' +
      '<span class="q-gcard-state" data-gstate></span>' +
      '<span class="dk-acts">' +
        '<span class="dk-act" data-gcopy="' + esc(g.id) + '">' + esc(T('q.copy')) + '</span>' +
        '<span class="dk-act danger" data-gdel="' + esc(g.id) + '">' + esc(T('q.del')) + '</span>' +
      '</span>' +
    '</button>';
  }

  // The open group's card, marked IN PLACE so nothing re-animates: its
  // square lit while the form is what was saved, hollow once it is not.
  function paintLib() {
    const d = dirty();
    document.querySelectorAll('#qLibList .q-gcard').forEach(el => {
      const on = el.dataset.gid === curId;
      el.classList.toggle('on', on);
      el.classList.toggle('dirty', on && d);
      const st = el.querySelector('[data-gstate]');
      const t = on ? T(d ? 'q.openDirty' : 'q.openNow') : '';
      if (st && st.textContent !== t) st.textContent = t;
    });
  }

  // Under the group name: a saved group this name would replace, or — for
  // a copy not generated yet — the group it was copied from.
  function paintGroupNote() {
    const el = $('qGroupNote');
    if (!el) return;
    const g = $('qGroup').value.trim();
    const twin = g ? lib.find(x => x.id !== curId && sameName(x.name, g)) : null;
    const t = twin ? T('q.twin', { n: twin.sites.length, d: fmtDate(twin.made) })
      : copyFrom && !curId ? T('q.copyNote', { g: copyFrom }) : '';
    if (el.textContent !== t) el.textContent = t;
    el.classList.toggle('on', !!t);
    el.classList.toggle('warn', !!twin);
  }

  // Under a site's head, when another saved group already generated it:
  // quiet when it is the same site, red when this one differs. Opens by
  // height, like the band note, and keeps its text while it closes.
  function paintShare(el, r) {
    const note = el.querySelector('[data-share]');
    if (!note) return;
    const sh = sharedOf(r);
    const diff = !!(sh && sh.diff.length);
    const t = !sh ? '' : T(diff ? 'q.shDiff' : 'q.shSame', { g: (diff ? sh.diff : sh.all).join(', ') });
    const p = note.querySelector('p');
    if (t && p.textContent !== t) p.textContent = t;
    note.classList.toggle('on', !!sh);
    note.classList.toggle('bad', diff);
    const inp = el.querySelector('[data-f="siteId"]');
    if (inp) inp.classList.toggle('off', diff);
  }

  function paintShares() {
    document.querySelectorAll('#qRows .q-site').forEach(el => {
      const r = rows.find(x => x.uid === +el.dataset.uid);
      if (r) paintShare(el, r);
    });
  }

  function renderResults() {
    const box = $('qPickResults');
    const q = $('qPick').value;
    if (tmpl || !q.trim()) { box.innerHTML = ''; return; }
    const t = q.trim().toLowerCase();
    const hits = find(q);
    if (!hits.length) {
      const empty = DBX().NETWORKS.filter(n => {
        const db = DBX().get(n);
        return !db || !Object.keys(db.sectors || {}).length;
      }).map(DBX().label);
      // no results gets the ghost, shrugging under a "?" (js/peek.js)
      box.innerHTML = '<div class="lk-empty q-empty">' +
        (global.TableXPeek ? global.TableXPeek.lostSvg() : '') +
        '<p class="lk-empty-main">' + esc(T('q.noSite')) + '</p>' +
        (empty.length ? '<p class="lk-empty-sub">' + esc(T('lk.noHitsEmpty', { list: empty.join(', ') })) + '</p>' : '') +
        '</div>';
      return;
    }
    box.innerHTML = hits.map((h, i) =>
      '<button class="sd-hit q-hit' + (h.kit ? '' : ' nokit') + '" style="--i:' + Math.min(i, 14) +
      '" data-net="' + esc(h.net) + '" data-id="' + esc(h.id) + '"' +
      (h.kit ? '' : ' title="' + esc(T('q.noKitShort')) + '"') + '>' +
        '<span class="sd-hit-name">' + hi(h.name || h.id, t) + '</span>' +
        '<span class="sd-hit-id mono">' + hi(h.id, t) + '</span>' +
        '<span class="grow"></span>' +
        '<span class="q-hit-n">' + esc(T('q.tmplSectors', { n: h.n })) + '</span>' +
        '<span class="tag tag-net">' + esc(DBX().label(h.net)) + '</span>' +
      '</button>').join('');
  }

  // Which networks can seed a new site on this machine — the auto-detection
  // made visible, and the answer to "why can I not copy this IDF site".
  function renderNets() {
    const box = $('qNets');
    if (!box) return;
    box.innerHTML = '<span class="q-nets-l">' + esc(T('q.nets')) + '</span>' +
      DBX().NETWORKS.map(net => {
        const db = DBX().get(net);
        const on = !!(db && db.kit);
        return '<button class="q-net' + (on ? ' on' : '') + '" data-q-net="' + esc(net) + '" title="' +
          esc(T(on ? 'q.netOn' : 'q.netOff', { net: DBX().label(net) })) + '">' +
          esc(DBX().label(net)) + '</button>';
      }).join('');
  }

  function renderTmpl() {
    $('qPickBox').classList.toggle('hidden', !!tmpl);
    const box = $('qTmpl');
    if (!tmpl) { box.innerHTML = ''; return; }
    const xy = tmpl.xy ? tmpl.xy.join(' \\ ') : '';
    const meta = [
      '<span class="mono">' + esc(tmpl.id) + '</span>',
      '<span class="tag tag-net">' + esc(DBX().label(tmpl.net)) + '</span>',
      '<span>' + esc(T('q.tmplSectors', { n: tmpl.sectors.length })) + '</span>',
      xy ? '<span class="mono">' + esc(xy) + '</span>' : '',
    ].filter(Boolean).join('<span class="q-dot" aria-hidden="true"></span>');
    box.innerHTML =
      '<div class="q-tmpl' + (tmpl.kit ? '' : ' nokit') + '">' +
        '<span class="q-tmpl-sq" aria-hidden="true"></span>' +
        '<div class="q-tmpl-main">' +
          '<p class="q-tmpl-name">' + esc(tmpl.name || tmpl.id) + '</p>' +
          '<p class="q-tmpl-meta">' + meta + '</p>' +
        '</div>' +
        '<button class="q-x" data-q-clear title="' + esc(T('q.change')) + '" aria-label="' +
          esc(T('q.change')) + '">×</button>' +
      '</div>' +
      (tmpl.kit ? '' :
        '<div class="q-warn">' +
          '<p class="q-warn-main">' + esc(T('q.noKit', { net: DBX().label(tmpl.net) })) + '</p>' +
          '<p class="q-warn-sub">' + esc(T('q.noKitSub')) + '</p>' +
          '<button class="btn btn-outline btn-sm" data-q-db><span>' + esc(T('q.toDb')) + '</span>' +
            '<svg class="btn-arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
            '<path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" stroke-width="1.6" ' +
            'stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '</div>');
  }

  // The file is named after the group, and that name is load-bearing — so
  // it is shown as it will be saved, while the group is being typed.
  function renderFile() {
    const g = $('qGroup').value.trim();
    const el = $('qFile');
    const name = el.querySelector('.mono');
    // Only the name changes while typing; the arrow and the name arrive once,
    // so the arrival animation is not replayed on every keystroke.
    if (g && name) { name.textContent = SG().groupFileName(g); return; }
    el.classList.toggle('on', !!g);
    el.innerHTML = g
      ? '<span class="q-file-arrow" aria-hidden="true">→</span><span class="mono">' +
        esc(SG().groupFileName(g)) + '</span>'
      : esc(T('q.fileHint'));
  }

  function renderFmt() {
    $('qFmt').querySelectorAll('[data-q-fmt]').forEach(b =>
      b.classList.toggle('on', b.dataset.qFmt === fmt));
  }

  function renderRows() {
    const box = $('qRows');
    box.innerHTML = tmpl && tmpl.kit ? rows.map(renderRow).join('') : '';
    fresh.clear();
    box.querySelectorAll('.q-site').forEach(el => {
      const r = rows.find(x => x.uid === +el.dataset.uid);
      if (r) { paintHint(el, r); paintShare(el, r); }
    });
    paintCount();
  }

  function renderRow(r, i) {
    const [a, b] = shown(r.xy);
    const isTaken = r.siteId.trim() && takenIds().has(r.siteId.trim().toLowerCase());
    return '' +
    '<article class="q-site' + (fresh.has('s' + r.uid) ? ' q-new' : '') + '" data-uid="' + r.uid +
      '" data-key="s' + r.uid + '">' +
      '<div class="q-site-head">' +
        '<span class="q-site-n">' + (i + 1) + '</span>' +
        field('siteId', T('q.phId'), r.siteId, { mono: true, bad: isTaken,
              title: isTaken ? T('q.errTaken', { id: r.siteId.trim() }) : '' }) +
        field('name', T('q.phName'), r.name, { dir: 'auto' }) +
        field('a', T(fmt === 'geo' ? 'q.coLon' : 'q.coE'), a, { mono: true, num: true }) +
        field('b', T(fmt === 'geo' ? 'q.coLat' : 'q.coN'), b, { mono: true, num: true }) +
        '<button class="q-x" data-del="' + r.uid + '" title="' + esc(T('q.remove')) +
          '" aria-label="' + esc(T('q.remove')) + '">×</button>' +
        '<p class="q-co-hint mono" data-hint></p>' +
      '</div>' +
      // another saved group already generated this Site ID (paintShare)
      '<div class="q-site-note" data-share><div><p></p></div></div>' +
      '<div class="q-secs">' +
        '<div class="q-sec q-sec-head" aria-hidden="true">' +
          ['sectorId', 'band', 'az', 'height', 'tilt', 'etilt', 'model', 'pwr', 'crs']
            .map(f => '<span' + (f === 'crs' ? ' title="' + esc(T('q.crsTitle')) + '"' : '') + '>' +
                      esc(T('q.c_' + f)) + '</span>').join('') + '<span></span>' +
        '</div>' +
        r.sectors.map((s, j) => renderSec(r, s, j)).join('') +
      '</div>' +
      '<button class="btn btn-ghost btn-sm q-addsec" data-addsec="' + r.uid + '">' +
        '<span class="ed-plus" aria-hidden="true">+</span><span>' + esc(T('q.addSec')) + '</span></button>' +
    '</article>';
  }

  // One labelled field of a site's head. The label sits ABOVE the input, not
  // in it: a placeholder vanishes the moment a seeded value is there.
  function field(f, label, value, o) {
    const coord = f === 'a' || f === 'b';
    return '<label class="q-f q-f-' + f + '">' +
      '<span class="q-lab"' + (coord ? ' data-lab="' + f + '"' : '') + '>' + esc(label) + '</span>' +
      '<input class="q-in' + (o.mono ? ' mono' : '') + (o.bad ? ' bad' : '') +
      '" data-f="' + f + '" value="' + esc(value) + '" spellcheck="false" autocomplete="off"' +
      (o.dir ? ' dir="' + o.dir + '"' : '') +
      (o.num ? ' inputmode="decimal"' : '') +
      (o.title ? ' title="' + esc(o.title) + '"' : '') + '/>' +
    '</label>';
  }

  function renderSec(r, s, j) {
    const bands = Object.keys(tmpl.kit.bands);
    const opts = '<option value=""' + (s.band ? '' : ' selected') + '>' + esc(T('q.pickBand')) + '</option>' +
      bands.map(b => '<option value="' + esc(b) + '"' + (b === s.band ? ' selected' : '') + '>' +
        esc(b) + '</option>').join('');
    const off = offBand(s);
    const cell = (f, inner) => '<label class="q-c q-c-' + f + '" data-l="' + esc(T('q.c_' + f)) + '">' + inner + '</label>';
    const inp = (f, extra, cls) => (f in COLS && !carries(f))
      ? '<input class="q-in mono" data-s="' + f + '" value="" placeholder="—" disabled title="' +
        esc(T('q.notCarried')) + '"/>'
      : '<input class="q-in mono' + (cls ? ' ' + cls : '') + '" data-s="' + f + '" value="' + esc(s[f]) +
        '" spellcheck="false" autocomplete="off"' + (extra || '') + '/>';
    return '' +
    '<div class="q-sec' + (fresh.has('s' + r.uid) || fresh.has('k' + s.k) ? ' q-new' : '') +
      '" data-key="' + s.k + '" style="--i:' + j + '">' +
      cell('sectorId', inp('sectorId', ' placeholder="' + esc(T('q.phSector')) + '"')) +
      cell('band', '<span class="q-sel"><select class="q-in" data-s="band">' + opts + '</select></span>') +
      cell('az', inp('az', ' inputmode="decimal"')) +
      cell('height', inp('height', ' inputmode="decimal"')) +
      cell('tilt', inp('tilt', ' inputmode="decimal"')) +
      cell('etilt', inp('etilt', ' inputmode="decimal"')) +
      cell('model', inp('model', ' data-ac role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="qAc"',
                        off ? 'off' : '')) +
      cell('pwr', inp('pwr', ' inputmode="decimal"')) +
      cell('crs', inp('crs', ' inputmode="decimal" title="' + esc(T('q.crsTitle')) + '"')) +
      '<button class="ed-rm q-rmsec" data-rmsec="' + s.k + '" title="' + esc(T('q.rmSec')) +
        '" aria-label="' + esc(T('q.rmSec')) + '">−</button>' +
      // Always present, open only when the file names another band: the
      // three wrappers are what lets CSS open it by height (see main.css).
      '<div class="q-sec-note' + (off ? ' on' : '') + '" data-note><div><p>' +
        (off ? offNote(s, off) : '') + '</p></div></div>' +
    '</div>';
  }

  function paintCount() {
    const s = rows.reduce((a, r) => a + r.sectors.length, 0);
    $('qCount').textContent = rows.length ? T('q.count', { n: rows.length, s }) : '';
    $('qGo').disabled = !(tmpl && tmpl.kit && rows.length);
  }

  // Three steps on one rail. Each lights its square when it is satisfied,
  // and steps 2 and 3 rise in once there is a template to work from.
  function renderSteps() {
    const ready = !!(tmpl && tmpl.kit);
    $('qStep1').classList.toggle('done', ready);
    reveal($('qStep2'), ready, 60);
    reveal($('qStep3'), ready, 150);
    paintDone();
  }

  function paintDone() {
    const ready = !!(tmpl && tmpl.kit);
    $('qStep2').classList.toggle('done', ready && !!$('qGroup').value.trim());
    $('qStep3').classList.toggle('done', ready && rows.length > 0 && !problems(false).length);
    paintShares();
    paintLib();
  }

  function reveal(el, on, delay) {
    const was = !el.classList.contains('hidden');
    el.classList.toggle('hidden', !on);
    if (on && !was && !reduced()) {
      el.style.setProperty('--d', delay + 'ms');
      restart(el, 'q-enter');
    }
  }

  /* ── generate ────────────────────────────────────────────────────── */

  // Take the user to what a stopped generate is about: shake each field,
  // scroll to the first and put the cursor in it.
  function point(sels, mark) {
    sels.forEach(sel => {
      const el = document.querySelector(sel);
      if (el && el.classList.contains('q-in')) { if (mark) el.classList.add('bad'); restart(el, 'q-shake'); }
    });
    const first = document.querySelector(sels[0]);
    if (first) {
      first.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      setTimeout(() => first.focus({ preventScroll: true }), reduced() ? 0 : 280);
    }
  }

  // Every sector whose antenna file names another band. Asked about once,
  // here, rather than left to one red line under one of forty sectors.
  function offList() {
    const out = [];
    rows.forEach(r => r.sectors.forEach(s => {
      const off = offBand(s);
      if (off) out.push({ s, off, sel: '.q-site[data-uid="' + r.uid + '"] [data-key="' + s.k + '"] [data-s="model"]' });
    }));
    return out;
  }

  function offAsk(off) {
    const list = off.slice(0, 4).map(x => T('q.offItem',
      { id: String(x.s.sectorId).trim(), file: x.s.model, f: x.off.file, s: x.off.sector }));
    if (off.length > 4) list[3] += T('q.andMore', { n: off.length - 4 });
    return T('q.offAsk', { n: off.length, list: list.join('\n\n') });
  }

  async function generate() {
    if (!tmpl || !tmpl.kit) return;
    document.querySelectorAll('#viewQuest .q-in.bad').forEach(el => el.classList.remove('bad'));
    const bad = problems(true);
    if (bad.length) {
      point(bad.map(p => p.sel), true);
      UI().toast(bad[0].msg + (bad.length > 1 ? T('q.andMore', { n: bad.length - 1 }) : ''), true);
      return;
    }
    // Asked, not refused — the planner may mean it. With nothing to ask
    // there is no await, so a clean generate stays synchronous.
    const off = offList();
    if (off.length && !(await UI().ask(offAsk(off), { ok: 'q.offOk' }))) {
      point(off.map(x => x.sel), false);
      return;
    }
    // A site another saved group already generated, with other data: the
    // import would change it in that group too. Asked, for the same reason —
    // fixing a site everywhere at once can be exactly what is meant.
    const shared = sharedList();
    if (shared.length && !(await UI().ask(sharedAsk(shared), { ok: 'q.offOk' }))) {
      point(shared.map(x => x.sel), false);
      return;
    }

    const groupName = $('qGroup').value.trim();
    // A saved group by this name that is not the one open: this file is
    // the same Planet group, so its record is replaced — asked first.
    const twin = lib.find(g => g.id !== curId && sameName(g.name, groupName));
    if (twin && !(await UI().ask(T('q.twinAsk', { g: twin.name, n: twin.sites.length, d: fmtDate(twin.made) }),
                                 { ok: 'q.twinOk', danger: true }))) {
      point(['#qGroup'], false);
      return;
    }
    const specs = rows.map(r => {
      const [x, y] = shown(r.xy).map(numOf);
      return {
        siteId: r.siteId.trim(),
        name: r.name.trim(),
        lon: x, lat: y,
        sectors: r.sectors.map(s => ({
          sectorId: String(s.sectorId).trim(),
          band: s.band,
          az: numOf(s.az), height: numOf(s.height), tilt: numOf(s.tilt),
          etilt: numOf(s.etilt), pwr: numOf(s.pwr), crs: numOf(s.crs),
          model: String(s.model || '').trim(),
        })),
      };
    });

    try {
      const X = global.XLSX;
      const { wb, warnings } = SG().buildWorkbook(X, tmpl.kit, specs, { groupName });
      warnings.forEach(w => UI().toast(w, true));
      const name = SG().groupFileName(groupName);
      const url = URL.createObjectURL(new Blob([SG().writeWorkbook(X, wb)],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      // The one manual step, stated every time rather than buried in a doc:
      // Planet refuses the file until Excel has re-saved it. See sitegen.js.
      UI().toast(T('q.done', { f: name, n: specs.length }));
      if (global.TableXPeek) global.TableXPeek.cheer();
      const after = $('qAfter');
      after.classList.remove('hidden');
      if (!reduced()) restart(after, 'q-enter');
    } catch (e) {
      UI().toast(T('q.buildFail', { e: e.message }), true);
      return;
    }
    // Only once the file exists: a saved group is what was generated.
    await saveGroup(groupName, SG().groupFileName(groupName));
  }

  /* ── the antenna list ────────────────────────────────────────────── */

  // Every antenna file the databases already carry, so a model is picked
  // rather than retyped — `ODI065R17M18JJJJGQ.pafx` is not a thing anyone
  // should spell from memory. The template's own network first, then the
  // others; within that, the ones on this sector's band, then the most used.
  // `<Generic>` is Planet's placeholder for "no antenna", never a model.
  const AC = { input: null, items: [], active: -1, exact: false };
  const filesCache = new WeakMap();

  function filesOf(db) {
    if (!db || !db.ant) return [];
    let list = filesCache.get(db);
    if (list) return list;
    const m = new Map();
    for (const k in db.ant) {
      const f = db.ant[k][3];
      if (!f || f.charAt(0) === '<') continue;
      m.set(f, (m.get(f) || 0) + 1);
    }
    list = [...m].map(([file, n]) => ({
      file, n, low: file.toLowerCase(), flat: file.toLowerCase().replace(/[^a-z0-9]/g, ''),
      band: fileBand(file),
    }));
    filesCache.set(db, list);
    return list;
  }

  function known(file) {
    return DBX().NETWORKS.some(n => filesOf(DBX().get(n)).some(f => f.file === file));
  }

  // On the band: 2 when the file names this sector's band, 1 when it names
  // none (a multi-band panel serves any), 0 when it names another — which
  // would only be picked to be marked as wrong.
  function candidates(q, mhz) {
    const own = tmpl ? tmpl.net : null;
    const nets = [own].concat(DBX().NETWORKS.filter(n => n !== own)).filter(Boolean);
    const ql = q.trim().toLowerCase(), qf = ql.replace(/[^a-z0-9]/g, '');
    const m = band28(Number(mhz));
    const seen = new Set(), out = [];
    nets.forEach((net, ni) => {
      for (const f of filesOf(DBX().get(net))) {
        if (seen.has(f.file)) continue;
        let pos = 0;
        if (ql) {
          pos = f.low.indexOf(ql);
          // `odi032` finds ODI-032R20M-Q: the punctuation is not the name
          if (pos < 0 && qf) pos = f.flat.indexOf(qf) < 0 ? -1 : 500;
          if (pos < 0) continue;
        }
        seen.add(f.file);
        out.push({ file: f.file, n: f.n, net, own: ni === 0 ? 1 : 0,
                   pre: pos === 0 ? 1 : 0, band: !m || !f.band ? 1 : f.band.mhz === m ? 2 : 0 });
      }
    });
    out.sort((a, b) => (b.own - a.own) || (b.pre - a.pre) || (b.band - a.band) ||
                       (b.n - a.n) || (a.file < b.file ? -1 : 1));
    return out.slice(0, AC_CAP);
  }

  function sectorOfInput(inp) {
    const site = inp.closest('.q-site'), sec = inp.closest('.q-sec');
    const r = site && rows.find(x => x.uid === +site.dataset.uid);
    return r && sec ? r.sectors.find(s => s.k === +sec.dataset.key) : null;
  }

  function acOpen(inp) {
    AC.input = inp;
    AC.exact = known(inp.value);
    AC.active = -1;
    acRender();
  }

  function acRender() {
    const inp = AC.input, el = $('qAc');
    if (!inp) return;
    const s = sectorOfInput(inp);
    const q = AC.exact ? '' : inp.value;
    AC.items = candidates(q, s && s.mhz);
    const ql = q.trim().toLowerCase();
    el.innerHTML = AC.items.length
      ? AC.items.map((it, i) =>
          '<div class="q-ac-opt' + (it.file === inp.value ? ' on' : '') + '" role="option" id="qAcO' + i +
          '" data-i="' + i + '" aria-selected="' + (i === AC.active) + '">' +
            '<span class="q-ac-file">' + hi(it.file, ql) + '</span>' +
            (it.own ? '' : '<span class="tag tag-net">' + esc(DBX().label(it.net)) + '</span>') +
            '<span class="q-ac-n">' + fmtN(it.n) + '</span>' +
          '</div>').join('')
      : '<p class="q-ac-empty">' + esc(T('q.acNone')) + '</p>';
    const wasHidden = el.classList.contains('hidden');
    el.classList.remove('hidden');
    if (wasHidden && !reduced()) restart(el, 'q-pop');
    inp.setAttribute('aria-expanded', 'true');
    acPlace();
    acMark();
  }

  function acPlace() {
    const inp = AC.input, el = $('qAc');
    if (!inp || el.classList.contains('hidden')) return;
    const r = inp.getBoundingClientRect();
    const w = Math.min(Math.max(r.width, 320), innerWidth - 24);
    el.style.width = w + 'px';
    const rtl = document.documentElement.dir === 'rtl';
    let left = rtl ? r.right - w : r.left;
    left = Math.max(12, Math.min(left, innerWidth - w - 12));
    const h = el.offsetHeight;
    const below = innerHeight - r.bottom > h + 16 || r.top < h + 16;
    el.style.left = left + 'px';
    el.style.top = (below ? r.bottom + 6 : r.top - h - 6) + 'px';
    el.classList.toggle('up', !below);
  }

  // The highlight GLIDES to the active option, like every other selection
  // marker in the app, rather than jumping between rows.
  function acMark() {
    const el = $('qAc');
    el.querySelectorAll('.q-ac-opt').forEach((o, i) => o.setAttribute('aria-selected', String(i === AC.active)));
    const o = AC.active >= 0 ? el.querySelector('[data-i="' + AC.active + '"]') : null;
    el.classList.toggle('has-active', !!o);
    if (o) {
      el.style.setProperty('--ac-y', o.offsetTop + 'px');
      el.style.setProperty('--ac-h', o.offsetHeight + 'px');
      o.scrollIntoView({ block: 'nearest' });
      AC.input.setAttribute('aria-activedescendant', o.id);
    } else if (AC.input) {
      AC.input.removeAttribute('aria-activedescendant');
    }
  }

  function acClose() {
    const el = $('qAc');
    el.classList.add('hidden');
    el.classList.remove('has-active');
    if (AC.input) {
      AC.input.setAttribute('aria-expanded', 'false');
      AC.input.removeAttribute('aria-activedescendant');
    }
    AC.input = null;
    AC.active = -1;
  }

  function acChoose(i) {
    const it = AC.items[i], inp = AC.input;
    if (!it || !inp) return;
    inp.value = it.file;
    const s = sectorOfInput(inp);
    if (s) s.model = it.file;
    inp.classList.remove('bad');
    flash(inp);
    paintBand(inp.closest('.q-sec'), s);
    acClose();
    paintDone();
  }

  function acKey(e) {
    const open = !$('qAc').classList.contains('hidden');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return acOpen(e.target);
      const n = AC.items.length;
      if (!n) return;
      AC.active = e.key === 'ArrowDown'
        ? (AC.active + 1) % n
        : (AC.active <= 0 ? n - 1 : AC.active - 1);
      acMark();
    } else if (e.key === 'Enter' && open && AC.active >= 0) {
      e.preventDefault();
      acChoose(AC.active);
    } else if (e.key === 'Tab' && open && AC.active >= 0) {
      acChoose(AC.active);              // and let the focus move on
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();              // the app's own Escape chain stays out of it
      acClose();
    }
  }

  /* ── wiring ──────────────────────────────────────────────────────── */

  function init() {
    if (!$('viewQuest')) return;

    // A line under the search naming which networks can seed a new site.
    const nets = document.createElement('div');
    nets.className = 'q-nets';
    nets.id = 'qNets';
    $('qPickBox').insertBefore(nets, $('qPickResults'));

    $('qPick').addEventListener('input', renderResults);
    $('qPick').addEventListener('keydown', e => {
      const first = $('qPickResults').querySelector('.q-hit');
      if (e.key === 'Enter' && first) { e.preventDefault(); first.click(); }
      else if (e.key === 'ArrowDown' && first) { e.preventDefault(); first.focus(); }
    });
    $('qPickResults').addEventListener('keydown', e => {
      const b = e.target.closest('.q-hit');
      if (!b) return;
      if (e.key === 'ArrowDown' && b.nextElementSibling) { e.preventDefault(); b.nextElementSibling.focus(); }
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        (b.previousElementSibling || $('qPick')).focus();
      } else if (e.key === 'Escape') { $('qPick').focus(); }
    });
    $('qPickResults').addEventListener('click', e => {
      const b = e.target.closest('.q-hit');
      if (b) pick(b.dataset.net, b.dataset.id);
    });
    $('qPickBox').addEventListener('click', e => {
      if (e.target.closest('[data-q-net]')) DBX().goto('db');
    });

    $('qTmpl').addEventListener('click', e => {
      if (e.target.closest('[data-q-clear]')) clearTmpl();
      else if (e.target.closest('[data-q-db]')) DBX().goto('db');
    });

    $('qGroup').addEventListener('input', () => {
      $('qGroup').classList.remove('bad');
      renderFile();
      paintGroupNote();
      paintDone();                     // the name decides which groups are "other"
    });

    $('qLibList').addEventListener('click', e => {
      if (e.target.closest('[data-gmore]')) {
        // the cards that come into view rise in; the rest stay put
        if (!libAll) lib.slice(LIB_CAP).forEach(g => libFresh.add(g.id));
        libAll = !libAll;
        renderLib();
        return;
      }
      if (e.target.closest('[data-gnew]')) return newGroup();
      const cp = e.target.closest('[data-gcopy]');
      if (cp) return openRec(cp.dataset.gcopy, true);
      const del = e.target.closest('[data-gdel]');
      if (del) return delRec(del.dataset.gdel);
      const card = e.target.closest('[data-gid]');
      if (card) openRec(card.dataset.gid, false);
    });
    loadLib().then(renderLib);

    $('qFmt').addEventListener('click', e => {
      const b = e.target.closest('[data-q-fmt]');
      if (b) setFmt(b.dataset.qFmt);
    });

    $('qAdd').onclick = () => {
      const box = $('qRows');
      flip(box, '.q-site', () => { addRow(); renderRows(); });
      paintDone();
      const last = box.lastElementChild;
      if (last) {
        last.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
        const f = last.querySelector('[data-f="siteId"]');
        if (f) setTimeout(() => f.focus({ preventScroll: true }), 200);
      }
    };
    $('qGo').onclick = generate;

    const rowsBox = $('qRows');

    // One delegated listener for the whole form: the rows are rebuilt on
    // every structural change, so a per-input handler would not survive.
    rowsBox.addEventListener('input', e => {
      const el = e.target;
      const site = el.closest('.q-site');
      const row = site && rows.find(r => r.uid === +site.dataset.uid);
      if (!row) return;
      el.classList.remove('bad');
      const f = el.dataset.f;
      if (f === 'siteId') {
        row.siteId = el.value;
        autoSectorIds(row, site);
        const t = el.value.trim() && takenIds().has(el.value.trim().toLowerCase());
        el.classList.toggle('bad', !!t);
        el.title = t ? T('q.errTaken', { id: el.value.trim() }) : '';
      } else if (f === 'name') {
        row.name = el.value;
      } else if (f === 'a' || f === 'b') {
        // Typed in the current format, so that becomes the row's own.
        row.xy = { fmt, a: site.querySelector('[data-f="a"]').value,
                   b: site.querySelector('[data-f="b"]').value };
        paintHint(site, row);
      } else if (el.dataset.s) {
        const s = sectorOfInput(el);
        if (!s) return;
        s[el.dataset.s] = el.value;
        if (el.dataset.s === 'sectorId') s.auto = false;
        if (el.dataset.s === 'model') {
          paintBand(el.closest('.q-sec'), s);
          if (AC.input === el) { AC.exact = false; AC.active = -1; acRender(); }
        }
      }
      paintDone();
    });

    rowsBox.addEventListener('change', e => {
      if (e.target.dataset.s !== 'band') return;
      const s = sectorOfInput(e.target);
      if (s) {
        s.band = e.target.value;
        const d = tmpl.kit.bands[s.band];
        s.mhz = d && d.fb ? DBX().mhz(d.fb[0], tmpl.net) : null;
        followBand(e.target.closest('.q-sec'), s);
      }
      e.target.classList.remove('bad');
      paintDone();
    });

    rowsBox.addEventListener('click', e => {
      // the same antenna's file for the sector's band, offered by the note
      const sw = e.target.closest('[data-swap]');
      if (sw) {
        const sec = sw.closest('.q-sec'), s = sectorOfInput(sw);
        if (!s || !sec) return;
        s.model = sw.dataset.swap;
        const inp = sec.querySelector('[data-s="model"]');
        if (inp) { inp.value = s.model; inp.classList.remove('bad'); flash(inp); }
        paintBand(sec, s);
        paintDone();
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        const uid = +del.dataset.del;
        acClose();
        leave(del.closest('.q-site'), () => {
          flip(rowsBox, '.q-site', () => { rows = rows.filter(r => r.uid !== uid); renderRows(); });
          paintDone();
        });
        return;
      }
      const add = e.target.closest('[data-addsec]');
      if (add) {
        const r = rows.find(x => x.uid === +add.dataset.addsec);
        if (!r) return;
        // A new sector copies the one above it — the band, the antenna, the
        // height are usually the same — and waits for its own id and azimuth.
        const from = r.sectors[r.sectors.length - 1] || tmpl.sectors[0] || {};
        const s = newSector(Object.assign({}, from, { raw: '', sectorId: '' }));
        s.code = '';
        s.mhz = from.mhz;
        r.sectors.push(s);
        fresh.add('k' + s.k);
        flip(rowsBox, '.q-site', renderRows);
        paintDone();
        const inp = rowsBox.querySelector('[data-key="' + s.k + '"] [data-s="sectorId"]');
        if (inp) inp.focus({ preventScroll: true });
        return;
      }
      const rm = e.target.closest('[data-rmsec]');
      if (rm) {
        const k = +rm.dataset.rmsec;
        acClose();
        leave(rm.closest('.q-sec'), () => {
          rows.forEach(r => { r.sectors = r.sectors.filter(s => s.k !== k); });
          flip(rowsBox, '.q-site', renderRows);
          paintDone();
        });
      }
    });

    // The antenna list opens on the antenna field and follows it.
    rowsBox.addEventListener('focusin', e => {
      if (e.target.matches('[data-ac]')) acOpen(e.target);
    });
    rowsBox.addEventListener('focusout', e => {
      if (!e.target.matches('[data-ac]')) return;
      setTimeout(() => { if (AC.input && document.activeElement !== AC.input) acClose(); }, 0);
    });
    rowsBox.addEventListener('keydown', e => {
      if (e.target.matches('[data-ac]')) acKey(e);
    });
    // pointerdown, not click, and default prevented: the field keeps its
    // focus, so choosing does not first close the list under the pointer.
    $('qAc').addEventListener('pointerdown', e => {
      const o = e.target.closest('.q-ac-opt');
      e.preventDefault();
      if (o) acChoose(+o.dataset.i);
    });
    addEventListener('resize', acPlace);
    addEventListener('scroll', acPlace, true);

    renderFmt();
  }

  // Called by app.js show() every time the view opens: the databases may
  // have changed since (an import that added a kit, a site added by hand).
  function enter() {
    taken = null;
    // The saved groups rise in with the view, from what is already loaded;
    // the server is asked again behind them, and only a change re-renders.
    libAnim = true;
    const had = lib.map(g => g.id + g.made).join();
    loadLib().then(() => {
      if (lib.map(g => g.id + g.made).join() !== had) { renderLib(); paintGroupNote(); paintShares(); }
    });
    if (tmpl) {
      const db = DBX().get(tmpl.net);
      const kit = (db && db.kit) || null;
      if (kit && !tmpl.kit) {
        // the network was imported meanwhile — the template can seed now
        pick(tmpl.net, tmpl.id);
        return;
      }
      tmpl.kit = kit;
      tmpl.heads = null;               // the columns it carries are re-read
    }
    render();
    if (!tmpl) setTimeout(() => $('qPick').focus(), 60);
  }

  global.TableXQuest = {
    init,
    enter,
    render,
    // app.js calls this on a language switch, like every other JS-rendered view
    relocalize: () => { acClose(); render(); },
    // the e2e suite reaches in rather than driving 40 inputs by hand
    _state: () => ({ tmpl, rows, fmt, curId, copyFrom, dirty: dirty(),
                     lib: lib.map(g => ({ id: g.id, name: g.name, from: g.from || null, n: g.sites.length })) }),
    _nextName: nextName,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
