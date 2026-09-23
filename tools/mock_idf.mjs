/* Builds a mock IDF_Share.xlsx, for trying the import without a real export.
 *
 *   node tools/mock_idf.mjs IDF_Share_MOCK.xlsx
 *
 * The real IDF workbook lives on TS and cannot leave it, so this stands in for
 * it: same sheets, same headers, same column order as the photographs taken on
 * 2026-09-23, and the two shapes that make the IDF export awkward —
 * Sector IDs that repeat 1/2/3 per site (so the import must fall back to
 * <Site ID>_<Sector ID>) and Hebrew Descriptions carrying a trailing note.
 *
 * Its output is gitignored: it is a fixture, not data. Do NOT import it over a
 * live database — the shrink guard will ask first, and the answer is no.
 *
 * Builds a mock IDF_Share.xlsx — same sheets, same headers, same column
 * order as the real export in Elad's photographs (2026-09-23). Data is
 * realistic but small: 15 sites, 44 sectors. */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const XLSX = require('d:/projects/TableX/TableX/js/xlsx.full.min.js');

const B750 = 'P3M_750LTE.MIMO 9260_10';
const B900 = 'P3M_900LTE.MIMO 3525_5';

// site id, easting, northing, Description (Hebrew), [sector ids], terrain
const SITES = [
  ['IDF_Amitay',      622321.5, 3452921, 'אמיתי (סקטורים 2,3 הם של ק.ד 235)', ['1','2','3'],        77.63],
  ['IDF_Arar',        757204.1, 3686952, 'ערער',                              ['1','2'],            1476.28],
  ['IDF_Armon_2',     734739.1, 3652094, 'ארמון',                             ['1','2'],            912.62],
  ['IDF_Asaf_M4',     615983.1, 3466041, 'אסף מכלה 4',                        ['1','2','3','4'],    9.04],
  ['IDF_Astra',       757636.4, 3691737, 'אסטרא',                             ['1','2','3','3_900'], 1974.44],
  ['IDF_Avital',      760814.8, 3666958, 'אביטל',                             ['1','2','3','4'],    1168.64],
  ['IDF_Beit_Lid',    681467.4, 3578759, 'בית ליד',                           ['1','2','3'],        41.83],
  ['IDF_Bilu',        673187.6, 3528486, 'בילו',                              ['1','2','3'],        70.53],
  ['IDF_Biranit',     718659.0, 3660266, 'בירנית',                            ['1','2','3'],        769.02],
  ['IDF_Bufore',      735691.2, 3690069, 'מבצר בופור',                        ['1','2','3'],        696.41],
  ['IDF_Cabri',       700489.6, 3653332, 'כברי',                              ['1'],                53.27],
  ['IDF_Dugit',       641779.7, 3493632, 'דוגית',                             ['1','2','3'],        47.54],
  ['IDF_Hadas',       750514.5, 3686112, 'הדס',                               ['1','2','3'],        751.23],
  ['IDF_Halif_11_SL', 732185.7, 3665127, 'כיפת שמיים 11',                     ['1','2'],            917.38],
  ['IDF_Har_Adir',    721621.6, 3657337, 'הר אדיר (מירון תחתון משורשר להר אדיר סקטור 5)', ['1','2','3','5'], 400.33],
];

const FILES = ['LNX-6515DS-VTM.pafx', '80010866.pafx', '80010866_700.pafx',
               'ODI-032R20M-Q.pafx', 'RRZZHHTT-65D-R6.pafx', '80010715.pafx',
               '80010866_2600.pafx', 'RRV465DR6_700.pafx'];
const PA = [49.03, 46.02, 52.04, 50.79, 49, 36.99];

const sites = [['Site ID', 'Site UID', 'Longitude', 'Latitude', 'Description',
                'Site Name', 'Site Name 2', 'Candidate Priority']];
const sectors = [['Site ID', 'BTS Name', 'Sector ID', 'Sector UID', 'Technology',
                  'Band Name', 'Antenna Algorithm', 'Propagation Model',
                  'Distance (km)', 'Radials', 'Prediction Mode']];
const antennas = [['Site ID', 'Antenna ID', 'Antenna UID', 'Longitude', 'Latitude',
                   'Indoor Installation', 'Antenna File', 'Height (m)', 'Azimuth',
                   'Mechanical Tilt', 'Twist', 'Donor Antenna', 'Terrain Height (m)',
                   'Sectors', 'Number Of Sections']];
const fddSectors = [['Site ID', 'Sector ID', 'Cellular Layer', 'Transmit Mask',
                     'Receive Filter', 'Limit Best Server Coverage (km)',
                     'Maximum Number of Subscribers', 'Maximum Uplink Noise Rise (dB)',
                     'Total EIRP (dBm)', 'Number Of Transmit Antenna Ports',
                     'Number Of Receive Antenna Ports']];
const carriers = [['Site ID', 'Sector ID', 'Carrier Name', 'NB-IoT In-band Carrier',
                   'Frame Configuration', 'Cell Name', 'Cell ID', 'Physical Cell ID',
                   'Physical Cell ID Group', 'Physical Layer ID', 'Carrier Aggregation',
                   'TAC', 'E-UTRAN Cell ID', 'Automatic', 'Total EIRP (dBm)',
                   'PA Power (dBm)', 'Downlink Other Systems Interference (dBm)']];

let pci = 129;
SITES.forEach(([id, e, n, desc, secs, terr], si) => {
  // Site Name / Site Name 2 stay EMPTY, exactly as Planet emits them.
  sites.push([id, '', e, n, desc, '', '', 1]);

  secs.forEach((sec, k) => {
    const band = String(sec).endsWith('_900') ? B900 : B750;
    const az = [60, 160, 270, 340, 20][k % 5];
    const eirp = +(58 + (k * 1.7) % 9).toFixed(5);
    const pa = PA[(si + k) % PA.length];

    sectors.push([id, 'LTE FDD', sec, '', 'LTE FDD', band, 'N/A',
                  'P3M_750MHz.pmf', 45, 180, 'Modeled']);

    antennas.push([id, k + 1, '', e, n, 'FALSE', FILES[(si + k) % FILES.length],
                   [50, 38, 30, 62, 24][k % 5], az, [0, 2, 3, 5][k % 4], 0,
                   'FALSE', terr, sec, 12]);

    fddSectors.push([id, sec, '', '', '', 35, 100, 15, eirp, 2, 2]);

    pci = (pci + 3) % 504;
    carriers.push([id, sec, 'LTE FDD', '', 'Frame Configuration 1', '', '',
                   pci, Math.floor(pci / 3), pci % 3, 'TRUE', 0, '', 'TRUE',
                   eirp, pa, -200]);
  });
});

const wb = XLSX.utils.book_new();
// Sheet ORDER as the real export has it — the importer matches on headers, so
// this is only here to make the mock a faithful one.
const add = (name, aoa) =>
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
add('Antenna_Electrical_Parameters', [['Site ID', 'Antenna ID', 'Electrical Tilt']]
    .concat(antennas.slice(1).map(a => [a[0], a[1], 0])));
add('Antennas', antennas);
add('Sites', sites);
add('Sectors', sectors);
add('LTE_FDD_Sectors', fddSectors);
add('LTE_FDD_Sector_Carriers', carriers);
add('Summary', [['Item', 'Count'], ['Sites', SITES.length], ['Sectors', sectors.length - 1]]);

writeFileSync(process.argv[2], Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
console.log('wrote', process.argv[2]);
console.log('sites:', SITES.length, ' sectors:', sectors.length - 1,
            ' antennas:', antennas.length - 1, ' carriers:', carriers.length - 1);
