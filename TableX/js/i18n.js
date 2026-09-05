/* ═══════════════════════════════════════════════════════════════════
   I18N — Hebrew / English for the APP CHROME ONLY.

   The generated report table is NOT translated and never should be: it is
   the deliverable that goes in front of commanders, its column headers are
   fixed Hebrew, and letting a per-browser UI preference silently change what
   ships would be a real hazard. renderTable() and the PPTX builder therefore
   hardcode their Hebrew. If an English deliverable is ever wanted, it needs
   its own explicit setting, separate from this one.

   Usage:
     I18N.set('en')        switch language (persists, re-applies the DOM)
     I18N.t('key', {n: 3}) look up a string, {placeholders} substituted
     I18N.apply()          walk the DOM and fill every data-i18n* attribute

   Markup contract:
     data-i18n="key"              -> textContent
     data-i18n-html="key"         -> innerHTML (only for strings with markup)
     data-i18n-placeholder="key"  -> placeholder attribute
     data-i18n-title="key"        -> title attribute
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const STORE = 'tablex_lang';

  const HE = {
    'nav.input': 'הכנס נתונים',
    'nav.db': 'מסדי נתונים',
    'chip.title': 'מצב מסדי הנתונים',
    'chip.loading': 'טוען…',
    'chip.dbs': '{n}/{total} מסדים · {s} סקטורים',
    'chip.none': 'אין מסדים',

    'set.open': 'הגדרות',
    'set.theme': 'ערכת נושא',
    'set.light': 'בהיר',
    'set.dark': 'כהה',
    'set.lang': 'שפה',
    'set.note': 'השפה משנה את ממשק האפליקציה בלבד. הטבלה המיוצאת נשארת בעברית — היא התוצר שמוגש למפקדים.',

    'hero.title': 'מניתוח נקודות<br/>לשקופית מוכנה',
    'hero.sub': 'הדבק את פלט ניתוח הנקודות מ‑Planet. התרגום לעברית, המיון והעיצוב קורים כאן — הפלט מוכן להכנסה למצגת.',

    'paste.title': 'הכנסת נתונים',
    'paste.sub': 'עמודות מופרדות ב‑Tab, כפי שהן מודבקות מגיליון עברי',
    'paste.sample': 'טען דוגמה',
    'paste.generate': 'צור טבלה',
    'paste.note': '<span class="mint">אתר_1</span> = החזק ביותר · קודי סקטור מ‑Planet (<span dir="ltr" class="mono">LNN4610Da</span>) · עוצמות כערכים חיוביים, יוצגו כ‑dBm שלילי',
    'col.site3': 'אתר_3', 'col.site2': 'אתר_2', 'col.site1': 'אתר_1',
    'col.pwr3': 'עוצמה_3', 'col.pwr2': 'עוצמה_2', 'col.pwr1': 'עוצמה_1',
    'col.point': 'נקודה',

    'hint.loading': 'טוען מסדי נתונים…',
    'hint.waiting': 'ממתין לנתונים',
    'hint.ready': '{n} נקודות מוכנות',

    'db.eyebrow': 'מסדי נתונים',
    'db.title': 'כל המסדים, טעונים מראש',
    'db.sub': 'המסדים מגיעים בתוך האפליקציה — אין מה לטעון בכל פתיחה. עדכון מחליף את הקובץ בשרת, כך שהוא נשמר לכולם.',
    'db.empty': 'ריק',
    'db.loaded': 'טעון',
    'db.sectors': 'סקטורים',
    'db.sites': '{n} אתרים · סקטורים',
    'db.none': 'לא נטען מסד. עדכן כדי לטעון קובץ Planet.',
    'db.source': 'מקור',
    'db.built': 'עודכן',
    'db.load': 'טען קובץ',
    'db.update': 'עדכן',
    'db.shrink': 'ייבוא מחליף את מסד הנתונים — הוא אינו ממזג.\n\n' +
                 '{label}: {was} סקטורים ← {now} סקטורים (ירידה של {pct}%).\n\n' +
                 'ייתכן שהקובץ מכיל רק חלק מהרשת. לייבא בכל זאת?',

    'foot.tag': 'ניתוח נקודות Planet 7.10 → PPTX',
    'foot.credit': 'נבנה על ידי Elad Pinhasov',
    'foot.creditTitle': 'לחץ להכיר את הבונה',

    'tbl.back': 'חזור',
    'tbl.print': 'הדפס / PDF',
    'tbl.pptx': 'הורד PPTX',
    'tbl.meta': '{p} נקודות · {r} שורות',
    'miss.title': '{n} קודים לא נמצאו באף מסד',
    'miss.body': 'מוצגים כקוד האנגלי המקורי ללא תדר ורוחב פס: ',

    'about.role': 'בונה את הכלים שהצוות משתמש בהם כל יום',
    'about.quote': '"אם זה לוקח 20 דקות ביד — זה באג, לא נוהל."',
    'about.close': 'סגור',
    'about.stat1': 'סקטורים',
    'about.stat2': 'דקות לטבלה, לפני',
    'about.stat3': 'הדבקה, אחרי',
    'about.stat3n': 'אחת',

    'toast.noData': 'נא להדביק נתונים',
    'toast.badData': 'לא זוהו נתונים תקינים. ודא שהעמודות מופרדות ב-Tab ושיש 7 עמודות בכל שורה.',
    'toast.dbsLoading': 'מסדי הנתונים עדיין נטענים — רגע אחד',
    'toast.reading': 'קורא את {f}…',
    'toast.badSheet': 'לא זוהה מבנה מוכר בקובץ. דרוש ייצוא קבוצה מ-Planet ' +
                      '(גיליון Sites עם Site ID ועמודת שם, וגיליון Sectors עם ' +
                      'Sector ID · Site ID · Band Name), או גיליון יחיד עם: ' +
                      'Sector ID · Site ID · Site Name · Sector · Frequency (MHz) · Bandwidth (MHz)',
    'toast.importCancelled': 'הייבוא בוטל — מסד הנתונים לא שונה',
    'toast.dbSaved': 'עודכן {label} — {n} סקטורים נשמרו בשרת',
    'toast.dbSession': 'נטען לשימוש בהפעלה זו בלבד — השמירה לשרת נכשלה ({e}). הפעל דרך start.bat כדי לשמור לצמיתות.',
    'toast.pptxMissing': 'ספריית PPTX לא נטענה — js/pptxgen.bundle.js חסר.',
    'toast.pptxDone': 'הקובץ הורד',
    'toast.pptxFail': 'ייצוא ה-PPTX נכשל: {e}',
    'ed.open': 'ערוך אתרים',
    'ed.title': 'עריכת אתרים',
    'ed.search': 'חפש לפי שם, קוד אתר או קוד סקטור…',
    'ed.add': 'הוסף אתר',
    'ed.addTitle': 'הוספת סקטור',
    'ed.siteId': 'קוד אתר',
    'ed.siteName': 'שם אתר',
    'ed.sectorId': 'קוד סקטור',
    'ed.sector': 'סקטור',
    'ed.freq': 'תדר (MHz)',
    'ed.bw': 'רוחב פס (MHz)',
    'ed.submit': 'הוסף',
    'ed.cancel': 'ביטול',
    'ed.save': 'שמור',
    'ed.saveN': 'שמור {n} שינויים',
    'ed.close': 'סגור',
    'ed.dirty': '{n} שינויים לא שמורים',
    'ed.clean': 'אין שינויים',
    'ed.count': '{sites} אתרים · {sectors} סקטורים',
    'ed.showing': 'מוצגים {n} מתוך {total}',
    'ed.none': 'אין אתרים במסד. הוסף אתר או טען קובץ Planet.',
    'ed.noHits': 'אין תוצאות ל‑"{q}"',
    'ed.rmSite': 'הסר אתר וכל הסקטורים שלו',
    'ed.rmSector': 'הסר סקטור',
    'ed.needIds': 'קוד אתר וקוד סקטור הם שדות חובה',
    'ed.dup': 'קוד הסקטור {id} כבר קיים — יוחלף',
    'ed.added': 'נוסף {id}',
    'ed.rmDone': 'הוסר {id}',
    'ed.saved': 'נשמר — {sites} אתרים, {sectors} סקטורים',
    'ed.saveFail': 'השמירה נכשלה: {e}',
    'ed.discard': 'יש שינויים לא שמורים. לסגור בכל זאת?',
    'loader.status': 'טוען מסדי נתונים',
    'loader.done': '{n} סקטורים נטענו',
  };

  const EN = {
    'nav.input': 'Enter data',
    'nav.db': 'Databases',
    'chip.title': 'Database status',
    'chip.loading': 'Loading…',
    'chip.dbs': '{n}/{total} databases · {s} sectors',
    'chip.none': 'No databases',

    'set.open': 'Settings',
    'set.theme': 'Theme',
    'set.light': 'Light',
    'set.dark': 'Dark',
    'set.lang': 'Language',
    'set.note': 'Language changes the app interface only. The exported table stays in Hebrew — it is the deliverable that goes to commanders.',

    'hero.title': 'From point analysis<br/>to a finished slide',
    'hero.sub': 'Paste the point-analysis output from Planet. The Hebrew lookup, the ordering and the formatting happen here — the result drops straight into the deck.',

    'paste.title': 'Enter data',
    'paste.sub': 'Tab-separated columns, exactly as pasted from a Hebrew sheet',
    'paste.sample': 'Load sample',
    'paste.generate': 'Generate table',
    'paste.note': '<span class="mint">site_1</span> = strongest · Planet sector codes (<span dir="ltr" class="mono">LNN4610Da</span>) · levels as positive values, printed as negative dBm',
    'col.site3': 'site_3', 'col.site2': 'site_2', 'col.site1': 'site_1',
    'col.pwr3': 'level_3', 'col.pwr2': 'level_2', 'col.pwr1': 'level_1',
    'col.point': 'point',

    'hint.loading': 'Loading databases…',
    'hint.waiting': 'Waiting for data',
    'hint.ready': '{n} points ready',

    'db.eyebrow': 'Databases',
    'db.title': 'Every database, preloaded',
    'db.sub': 'The databases ship inside the app — nothing to load on every open. An update replaces the file on the server, so it sticks for everyone.',
    'db.empty': 'Empty',
    'db.loaded': 'Loaded',
    'db.sectors': 'sectors',
    'db.sites': '{n} sites · sectors',
    'db.none': 'No database loaded. Update to import a Planet file.',
    'db.source': 'Source',
    'db.built': 'Updated',
    'db.load': 'Load file',
    'db.update': 'Update',
    'db.shrink': 'An import replaces the database — it does not merge.\n\n' +
                 '{label}: {was} sectors → {now} sectors (down {pct}%).\n\n' +
                 'This file may cover only part of the network. Import anyway?',

    'foot.tag': 'Planet 7.10 point analysis → PPTX',
    'foot.credit': 'Built by Elad Pinhasov',
    'foot.creditTitle': 'Click to meet the builder',

    'tbl.back': 'Back',
    'tbl.print': 'Print / PDF',
    'tbl.pptx': 'Download PPTX',
    'tbl.meta': '{p} points · {r} rows',
    'miss.title': '{n} codes not found in any database',
    'miss.body': 'Rendered as the original English code, with no frequency or bandwidth: ',

    'about.role': 'Builds the tools the team uses every day',
    'about.quote': '"If it takes 20 minutes by hand, that\'s a bug — not a procedure."',
    'about.close': 'Close',
    'about.stat1': 'sectors',
    'about.stat2': 'minutes per table, before',
    'about.stat3': 'paste, after',
    'about.stat3n': 'One',

    'toast.noData': 'Paste some data first',
    'toast.badData': 'No valid data found. Check that columns are Tab-separated and every line has 7 columns.',
    'toast.dbsLoading': 'Databases are still loading — one moment',
    'toast.reading': 'Reading {f}…',
    'toast.badSheet': 'No recognised layout in this file. It needs either a Planet ' +
                      'group export (a Sites sheet with Site ID and a name column, plus ' +
                      'a Sectors sheet with Sector ID · Site ID · Band Name), or a single ' +
                      'sheet carrying: Sector ID · Site ID · Site Name · Sector · ' +
                      'Frequency (MHz) · Bandwidth (MHz)',
    'toast.importCancelled': 'Import cancelled — the database is unchanged',
    'toast.dbSaved': 'Updated {label} — {n} sectors saved on the server',
    'toast.dbSession': 'Loaded for this session only — the server write failed ({e}). Run via start.bat to persist it.',
    'toast.pptxMissing': 'PPTX library not loaded — js/pptxgen.bundle.js is missing.',
    'toast.pptxDone': 'File downloaded',
    'toast.pptxFail': 'PPTX export failed: {e}',
    'ed.open': 'Edit sites',
    'ed.title': 'Edit sites',
    'ed.search': 'Search by name, site code or sector code…',
    'ed.add': 'Add site',
    'ed.addTitle': 'Add a sector',
    'ed.siteId': 'Site ID',
    'ed.siteName': 'Site name',
    'ed.sectorId': 'Sector ID',
    'ed.sector': 'Sector',
    'ed.freq': 'Frequency (MHz)',
    'ed.bw': 'Bandwidth (MHz)',
    'ed.submit': 'Add',
    'ed.cancel': 'Cancel',
    'ed.save': 'Save',
    'ed.saveN': 'Save {n} changes',
    'ed.close': 'Close',
    'ed.dirty': '{n} unsaved changes',
    'ed.clean': 'No changes',
    'ed.count': '{sites} sites · {sectors} sectors',
    'ed.showing': 'Showing {n} of {total}',
    'ed.none': 'No sites in this database. Add one, or import a Planet file.',
    'ed.noHits': 'No results for "{q}"',
    'ed.rmSite': 'Remove site and all its sectors',
    'ed.rmSector': 'Remove sector',
    'ed.needIds': 'Site ID and Sector ID are required',
    'ed.dup': 'Sector {id} already exists — it will be replaced',
    'ed.added': 'Added {id}',
    'ed.rmDone': 'Removed {id}',
    'ed.saved': 'Saved — {sites} sites, {sectors} sectors',
    'ed.saveFail': 'Save failed: {e}',
    'ed.discard': 'You have unsaved changes. Close anyway?',
    'loader.status': 'Loading databases',
    'loader.done': '{n} sectors loaded',
  };

  // The about-modal facts are a list, not a string per line.
  const FACTS = {
    he: [
      'בנה אפליקציה שלמה כדי לא להרכיב עוד טבלה אחת ביד ב‑PowerPoint',
      'מודד כל פיצ\'ר ביחידות של <strong>דקות שנחסכות לחייל</strong>, לא בשורות קוד',
      'יודע ש‑PowerPoint לא מכיר סדר עמודות RTL, והפך את העמודות ידנית במקום להתווכח',
      'מזהה <span class="mono" dir="ltr">LNN4610Da</span> בלי לפתוח את המסד',
      'חושב באנגלית, מגיש בעברית, ומצפה משתיהן להסכים',
      'מחשיב 20 דקות של הרכבת טבלה ידנית כעלבון אישי',
      'מעדיף טבלה שצועקת "לא נמצא" על טבלה שמשקרת בשקט',
      'יש לו דעות חזקות על איזה גוון ירוק זה הירוק הנכון',
    ],
    en: [
      'Built an entire app rather than assemble one more table by hand in PowerPoint',
      'Measures every feature in <strong>minutes saved per soldier</strong>, not lines of code',
      'Knows PowerPoint has no RTL column order, and reversed the columns by hand rather than argue',
      'Recognises <span class="mono" dir="ltr">LNN4610Da</span> without opening the database',
      'Thinks in English, delivers in Hebrew, and expects both to agree',
      'Considers 20 minutes of manual table-building a personal insult',
      'Prefers a table that shouts "not found" over one that lies quietly',
      'Has strong opinions about which green is the correct green',
    ],
  };

  const DICT = { he: HE, en: EN };

  let lang = 'he';
  try {
    const saved = localStorage.getItem(STORE);
    if (saved && DICT[saved]) lang = saved;
  } catch (e) { /* private mode — fall back to Hebrew */ }

  function t(key, vars) {
    let s = DICT[lang][key];
    if (s == null) s = DICT.he[key];          // never render a raw key
    if (s == null) return key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    }
    return s;
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.dataset.i18nTitle);
    });
  }

  function set(next) {
    if (!DICT[next]) return;
    lang = next;
    try { localStorage.setItem(STORE, next); } catch (e) { /* not fatal */ }
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'he' ? 'rtl' : 'ltr';
    apply();
  }

  global.I18N = {
    t: t,
    apply: apply,
    set: set,
    facts: () => FACTS[lang] || FACTS.he,
    get lang() { return lang; },
  };
})(window);
