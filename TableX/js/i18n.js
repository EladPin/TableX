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
    'nav.lookup': 'חיפוש אתר',
    'nav.decks': 'מצגות',
    'chip.title': 'מצב מסדי הנתונים',
    'chip.loading': 'טוען…',
    'chip.dbs': '{n}/{total} מסדים · {s} סקטורים',
    'chip.none': 'אין מסדים',

    'set.open': 'הגדרות',
    'set.theme': 'ערכת נושא',
    'set.light': 'בהיר',
    'set.dark': 'כהה',
    'set.lang': 'שפה',
    'set.scene': 'תפאורה',
    'set.sceneOn': 'מוצגת',
    'set.sceneOff': 'מוסתרת',
    'set.note': 'השפה משנה את ממשק האפליקציה בלבד. הטבלה המיוצאת נשארת בעברית — היא התוצר שמוגש למפקדים.',

    'hero.title': 'מניתוח נקודות<br/>לשקופית מוכנה',
    'hero.sub': 'הדבק את פלט ניתוח הנקודות מ‑Planet. התרגום לעברית, המיון והעיצוב קורים כאן — הפלט מוכן להכנסה למצגת.',

    'paste.title': 'הכנסת נתונים',
    'paste.sub': 'עמודות מופרדות ב‑Tab, כפי שהן מודבקות מ‑Point Inspect של Planet',
    'paste.sample': 'טען דוגמה',
    'paste.generate': 'צור טבלה',
    'paste.note': '<span class="mint">נקודה</span> · RSRP1‑3 · BS1‑3 · קודים מ‑Point Inspect (<span dir="ltr" class="mono">NC4050C_LNC4050Ia</span>) · עוצמות כבר שליליות · סדר BS נשמר',
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
    'db.clear': 'נקה',
    'db.clearConfirm': 'לנקות את מסד הנתונים {label}?\n\n' +
                       'יימחקו מהשרת — סקטורים: {n}, אתרים: {s}.\n\n' +
                       'עותק שחזור אחד (‎.bak) נשמר בצד השרת, אך העדכון הבא ידרוס אותו.',
    'db.unknownBand': 'ב-{n} מתוך {total} סקטורים עמודת Band Name אינה מכילה תדר מוכר ' +
                      '(למשל "{ex}") — ככל הנראה EARFCN ולא תדר ב-MHz.\n\n' +
                      'התדר ורוחב הפס של הסקטורים האלה יישארו ריקים (־) במקום להציג ערך שגוי. ' +
                      'שמות האתרים ייובאו כרגיל.\n\n' +
                      'לייבא בכל זאת?',
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
    // Phrased so the count never needs a plural form — "1 ערכים" is wrong
    // Hebrew, and one prominent label is not worth a plural system.
    'tbl.edited': 'עריכות ידניות: {n}',
    'tbl.revert': 'שחזר',
    'tbl.revertConfirm': 'לשחזר את כל הערכים שנערכו?\n\n' +
                         'כל הערכים שנערכו ({n}) יחזרו למה שהחיפוש במסד החזיר. אין ביטול.',
    'tbl.revertOk': 'שחזר',
    'tbl.reverted': 'הטבלה שוחזרה',
    'tbl.editHint': 'לחיצה על תא בטבלה עורכת אותו',

    'lk.eyebrow': 'מסדי הנתונים',
    'lk.title': 'חיפוש אתר',
    'lk.sub': 'קוד סקטור, מספר אתר או שם בעברית — בכל ארבעת המסדים בבת אחת. אפשר להדביק קוד ישירות מ-Point Inspect.',
    'lk.search': 'LNN4610Da · 13207_3381063_90 · דישון',
    'lk.hint': 'הקלד קוד סקטור, מספר אתר או שם אתר. {s} סקטורים ב-{n} מסדים טעונים.',
    'lk.empty': 'אין מסדים טעונים. טען מסד נתונים כדי לחפש בו.',
    'lk.short': 'לפחות שתי אותיות.',
    'lk.noHits': 'לא נמצא אתר עבור "{q}".',
    'lk.noHitsEmpty': 'המסדים הבאים ריקים במחשב הזה: {list}. ייתכן שהקוד שייך לאחד מהם.',
    'lk.direct': 'התאמה מדויקת',
    'lk.approx': 'התאמה לפי אתר — הסקטור משוער',
    'lk.count': '{n} אתרים',
    'lk.showing': 'מוצגים {n} מתוך {total} אתרים — צמצם את החיפוש',
    'lk.copied': 'הועתק: {v}',
    'lk.copyFail': 'ההעתקה נכשלה',
    'lk.sectors': '{n} סקטורים',

    'dk.eyebrow': 'מצגות',
    'dk.title': 'מצגת שלמה מתבנית',
    'dk.sub': 'העלה פעם אחת מצגת אמיתית, סמן איפה נכנסות התמונות והטבלה, ומשם כל מצגת היא גרירה של צילומי המסך ולחיצה אחת. התבנית היא הקובץ עצמו — הרקע, המאסטרים והעיצוב יוצאים בדיוק כפי שהם.',
    'dk.cardMeta': '{n} שקופיות · {s} מקומות',
    'dk.cardRepeat': '{n} חוזרות',
    'dk.edit': 'ערוך',
    'dk.remove': 'מחק',
    'dk.newTitle': 'תבנית חדשה',
    'dk.newSub': 'גרור לכאן קובץ PPTX או לחץ',
    'dk.delConfirm': 'למחוק את התבנית {name}?\n\nהקובץ והסימונים יוסרו מהשרת. אין ביטול.',
    'dk.deleted': 'התבנית {name} נמחקה',
    'dk.openFail': 'פתיחת התבנית נכשלה: {e}',
    'dk.notPptx': 'זה לא קובץ PPTX תקין',
    'dk.noSlides': 'אין שקופיות בקובץ הזה',
    'dk.dropTitle': 'גרור לכאן את התמונות מ-Planet',
    'dk.dropSub': 'הסדר כאן הוא הסדר במצגת. אפשר גם לגרור קובץ PPTX כדי ליצור תבנית חדשה.',
    'dk.pick': 'בחר תמונות',
    'dk.clearImgs': 'נקה',
    'dk.noImgs': 'עדיין לא נבחרו תמונות.',
    'dk.earlier': 'הקדם',
    'dk.later': 'אחר',
    'dk.planTitle': 'מה ייווצר',
    'dk.willMake': '{n} שקופיות',
    'dk.build': 'צור מצגת',
    'dk.fromSlide': 'שקופית {n}',
    'dk.repeated': 'חוזרת',
    'dk.fillImg': 'תמונה {n}',
    'dk.fillEmpty': 'מקום ריק',
    'dk.fillTable': 'טבלת הנתונים',
    'dk.fillTableNone': 'טבלה — עדיין לא נוצרה',
    'dk.spare': '{n} תמונות לא ייכנסו — אין להן מקום פנוי. סמן שקופית כחוזרת, או הוסף מקומות.',
    'dk.noTable': 'יש מקום לטבלה, אבל עדיין לא נוצרה טבלה. חזור להכנסת נתונים, צור טבלה, וחזור לכאן.',
    'dk.built': 'המצגת נוצרה — {n} שקופיות',
    'dk.buildFail': 'יצירת המצגת נכשלה: {e}',
    'dk.editing': 'עריכת תבנית',
    'dk.namePh': 'שם התבנית',
    'dk.untitled': 'תבנית ללא שם',
    'dk.addImg': '+ מקום לתמונה',
    'dk.addTbl': '+ מקום לטבלה',
    'dk.delSlot': 'הסר מקום',
    'dk.repeatSlide': 'שקופית חוזרת',
    'dk.repeatHint': 'השקופית תשוכפל פעם אחת לכל תמונה',
    'dk.repeat': 'חוזרת',
    'dk.stageHint': 'גרור מלבן כדי להזיז אותו, ואת הפינות כדי לשנות גודל. תוכן השקופית עצמו נערך ב-PowerPoint — כאן רק מסמנים.',
    'dk.slotImage': 'תמונה',
    'dk.slotTable': 'טבלה',
    'dk.slideOf': 'שקופית {n} מתוך {total}',
    'dk.up': 'הקדם',
    'dk.down': 'אחר',
    'dk.dropSlide': 'הסר שקופית',
    'dk.noSlidesLeft': 'לא נשארו שקופיות.',
    'dk.save': 'שמור תבנית',
    'dk.saveN': 'שמור · {n} מקומות',
    'dk.saved': 'התבנית {name} נשמרה',
    'dk.saveFail': 'שמירת התבנית נכשלה: {e}',
    'dk.discard': 'לצאת בלי לשמור?\n\nהשינויים בתבנית לא יישמרו.',
    'dk.discardOk': 'צא',
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
    'toast.dbScan': 'סורק את גיליונות הקובץ…',
    'toast.dbBuild': 'בונה את מסד הנתונים…',
    'toast.badSheet': 'לא זוהה מבנה מוכר בקובץ. דרוש ייצוא קבוצה מ-Planet ' +
                      '(גיליון Sites עם Site ID ועמודת שם, וגיליון Sectors עם ' +
                      'Sector ID · Site ID · Band Name), או גיליון יחיד עם: ' +
                      'Sector ID · Site ID · Site Name · Sector · Frequency (MHz) · Bandwidth (MHz)',
    'toast.importCancelled': 'הייבוא בוטל — מסד הנתונים לא שונה',
    'toast.dupSectors': 'הייבוא נעצר: {n} מתוך {total} השורות חוזרות על קוד סקטור קיים ' +
                        '(למשל "{id}"). עמודת Sector ID אינה מזהה ייחודי, וייבוא היה מוחק שורות ' +
                        'בשקט. יש לייצא עם קוד סקטור ייחודי לכל הרשת.',
    'toast.dbCleared': 'מסד הנתונים {label} נוקה — {n} סקטורים הוסרו',
    'toast.clearFail': 'הניקוי נכשל ({e}) — מסד הנתונים לא שונה',
    'toast.dbSaved': 'עודכן {label} — {n} סקטורים נשמרו בשרת · תדרים: {f}',
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
    'ed.freq': 'תדר',
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
    'ed.addSector': 'הוסף סקטור לאתר זה',
    'ed.needIds': 'קוד אתר וקוד סקטור הם שדות חובה',
    'ed.dup': 'קוד הסקטור {id} כבר קיים — יוחלף',
    'ed.added': 'נוסף {id}',
    'ed.rmDone': 'הוסר {id}',
    'ed.saved': 'נשמר — {sites} אתרים, {sectors} סקטורים',
    'ed.saveFail': 'השמירה נכשלה: {e}',
    'ed.discard': 'יש שינויים לא שמורים. לסגור בכל זאת?',
    'ed.discardOk': 'סגור בלי לשמור',
    'ask.ok': 'אישור',
    'ask.cancel': 'ביטול',
    'loader.status': 'טוען מסדי נתונים',
    'loader.done': '{n} סקטורים נטענו',
  };

  const EN = {
    'nav.input': 'Enter data',
    'nav.db': 'Databases',
    'nav.lookup': 'Find a site',
    'nav.decks': 'Decks',
    'chip.title': 'Database status',
    'chip.loading': 'Loading…',
    'chip.dbs': '{n}/{total} databases · {s} sectors',
    'chip.none': 'No databases',

    'set.open': 'Settings',
    'set.theme': 'Theme',
    'set.light': 'Light',
    'set.dark': 'Dark',
    'set.lang': 'Language',
    'set.scene': 'Hero scene',
    'set.sceneOn': 'Shown',
    'set.sceneOff': 'Hidden',
    'set.note': 'Language changes the app interface only. The exported table stays in Hebrew — it is the deliverable that goes to commanders.',

    'hero.title': 'From point analysis<br/>to a finished slide',
    'hero.sub': 'Paste the point-analysis output from Planet. The Hebrew lookup, the ordering and the formatting happen here — the result drops straight into the deck.',

    'paste.title': 'Enter data',
    'paste.sub': 'Tab-separated columns, exactly as pasted from Planet Point Inspect',
    'paste.sample': 'Load sample',
    'paste.generate': 'Generate table',
    'paste.note': '<span class="mint">point</span> · RSRP1‑3 · BS1‑3 · codes from Point Inspect (<span dir="ltr" class="mono">NC4050C_LNC4050Ia</span>) · levels already negative · BS order preserved',
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
    'db.clear': 'Clear',
    'db.clearConfirm': 'Clear the {label} database?\n\n' +
                       'Deleted on the server — sectors: {n}, sites: {s}.\n\n' +
                       'One rollback copy (.bak) is kept server-side, but the next ' +
                       'update overwrites it.',
    'db.unknownBand': 'In {n} of {total} sectors the Band Name column does not resolve to a ' +
                      'known frequency (e.g. "{ex}") — most likely an EARFCN rather than MHz.\n\n' +
                      'Those sectors keep a blank frequency and bandwidth (–) instead of showing ' +
                      'a wrong value. Site names import normally.\n\n' +
                      'Import anyway?',
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
    'tbl.edited': 'Edited by hand: {n}',
    'tbl.revert': 'Revert',
    'tbl.revertConfirm': 'Revert every edited value?\n\n' +
                         'All edited values ({n}) return to what the database lookup ' +
                         'returned. This cannot be undone.',
    'tbl.revertOk': 'Revert',
    'tbl.reverted': 'Table reverted',
    'tbl.editHint': 'Click any cell in the table to edit it',

    'lk.eyebrow': 'The databases',
    'lk.title': 'Find a site',
    'lk.sub': 'Sector code, site id or Hebrew name — across all four databases at once. A code pasted straight out of Point Inspect works too.',
    'lk.search': 'LNN4610Da · 13207_3381063_90 · Dishon',
    'lk.hint': 'Type a sector code, a site id or a site name. {s} sectors across {n} loaded databases.',
    'lk.empty': 'No databases loaded. Load one to search it.',
    'lk.short': 'At least two characters.',
    'lk.noHits': 'No site found for "{q}".',
    'lk.noHitsEmpty': 'These databases are empty on this machine: {list}. The code may belong to one of them.',
    'lk.direct': 'Exact match',
    'lk.approx': 'Matched by site — the sector is approximate',
    'lk.count': '{n} sites',
    'lk.showing': 'Showing {n} of {total} sites — narrow the search',
    'lk.copied': 'Copied: {v}',
    'lk.copyFail': 'Copy failed',
    'lk.sectors': '{n} sectors',

    'dk.eyebrow': 'Decks',
    'dk.title': 'A whole deck from a template',
    'dk.sub': 'Upload a real presentation once, mark where the pictures and the table go, and every deck after that is a drag and one click. The template is the file itself, so background, masters and styling come out exactly as they are.',
    'dk.cardMeta': '{n} slides · {s} slots',
    'dk.cardRepeat': '{n} repeating',
    'dk.edit': 'Edit',
    'dk.remove': 'Delete',
    'dk.newTitle': 'New template',
    'dk.newSub': 'Drop a PPTX here, or click',
    'dk.delConfirm': 'Delete the template {name}?\n\nThe file and its markings are removed from the server. This cannot be undone.',
    'dk.deleted': 'Template {name} deleted',
    'dk.openFail': 'Could not open the template: {e}',
    'dk.notPptx': 'That is not a valid PPTX file',
    'dk.noSlides': 'That file has no slides',
    'dk.dropTitle': 'Drop your Planet screenshots here',
    'dk.dropSub': 'The order here is the order in the deck. A PPTX dropped here becomes a new template instead.',
    'dk.pick': 'Choose images',
    'dk.clearImgs': 'Clear',
    'dk.noImgs': 'No images chosen yet.',
    'dk.earlier': 'Move earlier',
    'dk.later': 'Move later',
    'dk.planTitle': 'What will be built',
    'dk.willMake': '{n} slides',
    'dk.build': 'Build the deck',
    'dk.fromSlide': 'slide {n}',
    'dk.repeated': 'repeated',
    'dk.fillImg': 'image {n}',
    'dk.fillEmpty': 'empty slot',
    'dk.fillTable': 'the report table',
    'dk.fillTableNone': 'table, none generated yet',
    'dk.spare': '{n} images will not be placed, because no slot is free for them. Mark a slide as repeating, or add more slots.',
    'dk.noTable': 'There is a table slot, but no table has been generated. Go to Enter data, generate one, and come back.',
    'dk.built': 'Deck built with {n} slides',
    'dk.buildFail': 'Building the deck failed: {e}',
    'dk.editing': 'Editing template',
    'dk.namePh': 'Template name',
    'dk.untitled': 'Untitled template',
    'dk.addImg': '+ Image slot',
    'dk.addTbl': '+ Table slot',
    'dk.delSlot': 'Remove slot',
    'dk.repeatSlide': 'Repeating slide',
    'dk.repeatHint': 'This slide is duplicated once per image',
    'dk.repeat': 'repeats',
    'dk.stageHint': 'Drag a rectangle to move it, the corners to resize. The slide content itself is edited in PowerPoint; here you only mark it up.',
    'dk.slotImage': 'Image',
    'dk.slotTable': 'Table',
    'dk.slideOf': 'Slide {n} of {total}',
    'dk.up': 'Move up',
    'dk.down': 'Move down',
    'dk.dropSlide': 'Remove slide',
    'dk.noSlidesLeft': 'No slides left.',
    'dk.save': 'Save template',
    'dk.saveN': 'Save · {n} slots',
    'dk.saved': 'Template {name} saved',
    'dk.saveFail': 'Saving the template failed: {e}',
    'dk.discard': 'Leave without saving?\n\nChanges to this template will be lost.',
    'dk.discardOk': 'Leave',
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
    'toast.dbScan': 'Scanning the workbook sheets…',
    'toast.dbBuild': 'Building the database…',
    'toast.badSheet': 'No recognised layout in this file. It needs either a Planet ' +
                      'group export (a Sites sheet with Site ID and a name column, plus ' +
                      'a Sectors sheet with Sector ID · Site ID · Band Name), or a single ' +
                      'sheet carrying: Sector ID · Site ID · Site Name · Sector · ' +
                      'Frequency (MHz) · Bandwidth (MHz)',
    'toast.importCancelled': 'Import cancelled — the database is unchanged',
    'toast.dupSectors': 'Import stopped: {n} of {total} rows repeat a sector code already seen ' +
                        '(e.g. "{id}"). The Sector ID column is not a unique key, so importing ' +
                        'would silently drop rows. Export with a sector code unique across the ' +
                        'whole network.',
    'toast.dbCleared': 'Cleared {label} — {n} sectors removed',
    'toast.clearFail': 'Clear failed ({e}) — the database is unchanged',
    'toast.dbSaved': 'Updated {label} — {n} sectors saved on the server · bands: {f}',
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
    'ed.freq': 'Frequency',
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
    'ed.addSector': 'Add a sector to this site',
    'ed.needIds': 'Site ID and Sector ID are required',
    'ed.dup': 'Sector {id} already exists — it will be replaced',
    'ed.added': 'Added {id}',
    'ed.rmDone': 'Removed {id}',
    'ed.saved': 'Saved — {sites} sites, {sectors} sectors',
    'ed.saveFail': 'Save failed: {e}',
    'ed.discard': 'You have unsaved changes. Close anyway?',
    'ed.discardOk': 'Close without saving',
    'ask.ok': 'Confirm',
    'ask.cancel': 'Cancel',
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
