require('dotenv').config();

const fs = require('fs');
const path = require('path');

const DATA_DIR      = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CSV_CONTACTOS = path.join(DATA_DIR, 'contactos_conductores.csv');

// Normaliza patente para usarla como clave de lookup (sin guiones, mayúsculas)
function normalizarPatente(valor) {
  return String(valor || '').trim().toUpperCase().replace(/-/g, '');
}

function limpiarTelefono(valor) {
  if (!valor) return '';
  // Quitar +, espacios, guiones
  const t = String(valor).replace(/[+\s\-]/g, '');
  // Validar longitud (Chile: 56 + 9 dígitos = 11 dígitos)
  return /^\d{10,15}$/.test(t) ? t : '';
}

/**
 * Lee data/contactos_conductores.csv (generado desde consolidado_conductores).
 * El CSV tiene columnas: PATENTE, PATENTE_ORIGINAL, NOMBRE, TELEFONO
 * Devuelve mapa { PATENTE_NORM: numero }
 */
let _csvCache = null;

function cargarDesdeCSV() {
  if (_csvCache) return _csvCache;
  if (!fs.existsSync(CSV_CONTACTOS)) return (_csvCache = { telefonos: {}, nombres: {} });

  const telefonos = {};
  const nombres   = {};
  const lines = fs.readFileSync(CSV_CONTACTOS, 'utf8').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const iPat    = headers.indexOf('PATENTE');
  const iTel    = headers.indexOf('TELEFONO');
  const iNom    = headers.indexOf('NOMBRE');

  if (iPat === -1 || iTel === -1) {
    console.warn('contactos_conductores.csv no tiene las columnas esperadas (PATENTE, TELEFONO)');
    return (_csvCache = { telefonos: {}, nombres: {} });
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const patente = normalizarPatente(cols[iPat]);
    const tel = limpiarTelefono(cols[iTel]);
    if (patente && tel) telefonos[patente] = tel;
    if (patente && iNom !== -1 && cols[iNom]) nombres[patente] = cols[iNom].trim();
  }

  console.log(`Contactos cargados desde CSV: ${Object.keys(telefonos).length} patentes`);
  _csvCache = { telefonos, nombres };
  return _csvCache;
}

/**
 * Lee overrides manuales desde .env (PATENTE_XXXX=569XXXXXXXX).
 * Tienen prioridad sobre el CSV para permitir correcciones puntuales.
 */
function cargarDesdeEnv() {
  const overrides = {};
  for (const [clave, valor] of Object.entries(process.env)) {
    if (!clave.startsWith('PATENTE_')) continue;
    const patente = normalizarPatente(clave.replace('PATENTE_', ''));
    const tel = limpiarTelefono(valor);
    if (!tel) {
      console.warn(`Override invalido en .env para ${patente}: "${valor}"`);
      continue;
    }
    overrides[patente] = tel;
  }
  if (Object.keys(overrides).length > 0) {
    console.log(`Overrides manuales desde .env: ${Object.keys(overrides).length} patente(s)`);
  }
  return overrides;
}

/**
 * Devuelve el mapa final PATENTE → número WhatsApp.
 * Fuentes en orden de prioridad (mayor a menor):
 *   1. .env  (override manual — corrige errores puntuales)
 *   2. data/contactos_conductores.csv  (base de datos oficial)
 */
function cargarContactos() {
  const { telefonos } = cargarDesdeCSV();
  const deEnv = cargarDesdeEnv();
  return { ...telefonos, ...deEnv };
}

function cargarNombres() {
  return cargarDesdeCSV().nombres;
}

function limpiarCache() {
  _csvCache = null;
}

module.exports = { cargarContactos, cargarNombres, normalizarPatente, limpiarCache, cargarDesdeEnv };
