const { google } = require('googleapis');
const path = require('path');

// Columnas por posición (letra → índice 0-based)
const COL = {
  FECHA:    0,   // A
  OC:       2,   // C  OC/RESERVA/ISO
  SOC:      4,   // E
  LPN:      5,   // F  LPN BKS
  SKU_DESC: 7,   // H
  COSTO:    9,   // J  COSTO FINAL
  MOTIVO:   13,  // N  MOTIVO DE COBRO
  PPU:      16,  // Q
};

function getAuth() {
  const keyFile = path.resolve(
    process.env.GOOGLE_CREDENTIALS_PATH ||
    path.join(__dirname, '..', 'config', 'google-credentials.json')
  );
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function obtenerNombreHoja(sheetId, gid) {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const hoja = res.data.sheets.find(s => s.properties.sheetId === parseInt(gid));
  if (!hoja) {
    const tabs = res.data.sheets.map(s => `${s.properties.title} (gid=${s.properties.sheetId})`);
    throw new Error(`Pestaña gid=${gid} no encontrada. Disponibles: ${tabs.join(', ')}`);
  }
  return hoja.properties.title;
}

function extraerFila(row) {
  const get = (idx) => (row[idx] !== undefined ? String(row[idx]).trim() : '');
  return {
    FECHA:    get(COL.FECHA),
    OC:       get(COL.OC),
    SOC:      get(COL.SOC),
    LPN:      get(COL.LPN),
    SKU_DESC: get(COL.SKU_DESC),
    COSTO:    get(COL.COSTO),
    MOTIVO:   get(COL.MOTIVO),
    PPU:      get(COL.PPU),
  };
}

async function leerConciliaciones() {
  const sheetId  = (process.env.GOOGLE_SHEET_ID          || '').trim();
  const sheetGid = (process.env.CONCILIACIONES_SHEET_GID || '').trim();
  if (!sheetId)  throw new Error('GOOGLE_SHEET_ID no definido');
  if (!sheetGid) throw new Error('CONCILIACIONES_SHEET_GID no definido');

  const tabName = await obtenerNombreHoja(sheetId, sheetGid);
  const sheets  = google.sheets({ version: 'v4', auth: getAuth() });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A:Y`,
  });

  const rows = res.data.values || [];
  if (rows.length < 2) return [];

  // Fila 1 = encabezados (la saltamos, usamos posiciones fijas)
  return rows.slice(1)
    .map((row, i) => ({ rowIndex: i + 2, tabName, data: extraerFila(row) }))
    .filter(r => r.data.PPU); // ignorar filas sin patente
}

// ─── Geosort (opcional) ───────────────────────────────────────────────────────
async function leerGeosort() {
  const sheetId  = (process.env.GEOSORT_SHEET_ID  || '').trim();
  const sheetGid = (process.env.GEOSORT_SHEET_GID || '0').trim();
  if (!sheetId) return {}; // no configurado

  const tabName = await obtenerNombreHoja(sheetId, sheetGid).catch(() => null);
  if (!tabName) return {};

  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A:Z`,
  });

  const rows = res.data.values || [];
  if (rows.length < 2) return {};

  const headers = rows[0].map(h => String(h).trim().toUpperCase());
  const find = (...kws) => headers.findIndex(h => kws.some(k => h.includes(k)));

  const iSOC   = find('SOC');
  const iLPN   = find('LPN');
  const iOC    = find('RESERVA', 'OC/');
  const iPPU   = find('PPU', 'PATENTE');
  const iFecha = find('FECHA RUTA', 'FECHA_RUTA', 'RUTA');

  if (iFecha === -1) return {};

  const lookup = {};
  for (const row of rows.slice(1)) {
    const fecha = row[iFecha] ? String(row[iFecha]).trim() : '';
    if (!fecha) continue;
    const ppu = iPPU !== -1 ? String(row[iPPU] || '').trim().toUpperCase().replace(/-/g, '') : '';

    const add = (prefix, val) => {
      if (!val) return;
      lookup[`${prefix}:${val}`] = fecha;
      if (ppu) lookup[`${prefix}:${val}:${ppu}`] = fecha;
    };
    if (iSOC !== -1) add('SOC', String(row[iSOC] || '').trim());
    if (iLPN !== -1) add('LPN', String(row[iLPN] || '').trim());
    if (iOC  !== -1) add('OC',  String(row[iOC]  || '').trim());
  }
  return lookup;
}

function buscarFechaRuta(fila, geosortLookup, ppu) {
  const ppuNorm = String(ppu).toUpperCase().replace(/-/g, '');
  const try_ = (prefix, val) => {
    if (!val) return null;
    return geosortLookup[`${prefix}:${val}:${ppuNorm}`]
        || geosortLookup[`${prefix}:${val}`]
        || null;
  };
  return try_('SOC', fila.SOC)
      || try_('LPN', fila.LPN)
      || try_('OC',  fila.OC)
      || fila.FECHA
      || 'S/I';
}

module.exports = { leerConciliaciones, leerGeosort, buscarFechaRuta };
