const { google } = require('googleapis');
const path = require('path');

const COL_ESTADO    = 'N'; // ESTADO_WHATSAPP
const COL_FECHA     = 'O'; // FECHA_ENVIO
const COL_TELEFONO  = 'P'; // TELEFONO (cruzado desde contactos)

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

// Obtiene el nombre de la pestaña a partir del gid numérico
async function obtenerNombreHoja(sheetId, gid) {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  let res;
  try {
    res = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  } catch (e) {
    if (e.code === 404 || e.message?.includes('not found'))
      throw new Error(`Sheet no encontrado (${sheetId}). Verifica que la Service Account tenga acceso.`);
    if (e.code === 403)
      throw new Error(`Sin permiso para leer el Sheet (${sheetId}). Comparte con la Service Account como Lector.`);
    throw e;
  }
  const tabs = res.data.sheets.map(s => `${s.properties.title} (gid=${s.properties.sheetId})`);
  const hoja = res.data.sheets.find(s => s.properties.sheetId === parseInt(gid));
  if (!hoja) throw new Error(`Pestaña gid=${gid} no encontrada. Pestanas disponibles: ${tabs.join(', ')}`);
  return hoja.properties.title;
}

/**
 * Lee todas las filas del Sheet de devoluciones.
 * Devuelve array de { rowIndex (1-based, fila real en Sheet), data: {...columnas} }
 */
async function leerDevoluciones() {
  const sheetId  = process.env.GOOGLE_SHEET_ID;
  const sheetGid = process.env.GOOGLE_SHEET_GID || '0';

  if (!sheetId) throw new Error('GOOGLE_SHEET_ID no definido en .env');

  const tabName = await obtenerNombreHoja(sheetId, sheetGid);
  const sheets  = google.sheets({ version: 'v4', auth: getAuth() });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A:P`,
  });

  const rows = res.data.values || [];
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => String(h).trim());

  return rows.slice(1).map((row, i) => {
    const data = {};
    headers.forEach((h, j) => { data[h] = row[j] !== undefined ? String(row[j]).trim() : ''; });
    return { rowIndex: i + 2, tabName, data }; // rowIndex 2 = primera fila de datos
  }).filter(r => r.data['SUBORDEN']); // ignorar filas vacías
}

/**
 * Escribe ENVIADO + fecha en las columnas N y O para las filas indicadas.
 * @param {string} tabName  nombre de la pestaña
 * @param {number[]} rowIndices  filas a marcar (1-based)
 * @param {string} estado  'ENVIADO' | 'SIN NÚMERO'
 */
async function marcarFilas(tabName, rowIndices, estado = 'ENVIADO') {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheets  = google.sheets({ version: 'v4', auth: getAuth() });
  const fecha   = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });

  const data = rowIndices.map(i => ({
    range: `${tabName}!${COL_ESTADO}${i}:${COL_FECHA}${i}`,
    values: [[estado, estado === 'ENVIADO' ? fecha : '']],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
}

/**
 * Escribe los encabezados en N1:P1 si están vacíos.
 */
async function asegurarEncabezados(tabName) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheets  = google.sheets({ version: 'v4', auth: getAuth() });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!${COL_ESTADO}1:${COL_TELEFONO}1`,
  });
  const vals = res.data.values?.[0] || [];
  if (!vals[0] || !vals[1] || !vals[2]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tabName}!${COL_ESTADO}1:${COL_TELEFONO}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['ESTADO_WHATSAPP', 'FECHA_ENVIO', 'TELEFONO']] },
    });
  }
}

/**
 * Escribe teléfonos en columna P para las filas indicadas.
 * @param {Array<{rowIndex: number, tabName: string, telefono: string}>} updates
 */
async function escribirTelefonos(updates) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheets  = google.sheets({ version: 'v4', auth: getAuth() });

  const data = updates.map(({ rowIndex, tabName, telefono }) => ({
    range: `${tabName}!${COL_TELEFONO}${rowIndex}`,
    values: [[telefono]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
}

/**
 * Lee el consolidado de conductores desde Google Sheets.
 * Devuelve mapa { PATENTE_NORM: telefono }
 */
async function leerConsolidado() {
  const sheetId  = (process.env.CONSOLIDADO_SHEET_ID  || '').trim();
  const sheetGid = (process.env.CONSOLIDADO_SHEET_GID || '0').trim();
  if (!sheetId) throw new Error('CONSOLIDADO_SHEET_ID no definido en .env');

  const tabName = await obtenerNombreHoja(sheetId, sheetGid);
  const sheets  = google.sheets({ version: 'v4', auth: getAuth() });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A:Z`,
  });

  const rows = res.data.values || [];
  if (rows.length < 2) return {};

  const headers = rows[0].map(h => String(h).trim().toUpperCase());
  const iPatente   = headers.findIndex(h => h === 'PATENTE');
  const iTelefono  = headers.findIndex(h => h === 'TELEFONO');

  if (iPatente === -1 || iTelefono === -1) {
    throw new Error(`Columnas no encontradas. Headers: ${headers.join(', ')}`);
  }

  const contactos = {};
  for (const row of rows.slice(1)) {
    const pat = String(row[iPatente] || '').trim().toUpperCase().replace(/-/g, '');
    const tel = String(row[iTelefono] || '').replace(/[+\s\-]/g, '');
    if (pat && /^\d{10,15}$/.test(tel)) contactos[pat] = tel;
  }

  console.log(`Consolidado leido: ${Object.keys(contactos).length} contactos desde "${tabName}"`);
  return contactos;
}

module.exports = { leerDevoluciones, marcarFilas, asegurarEncabezados, obtenerNombreHoja, escribirTelefonos, leerConsolidado };
