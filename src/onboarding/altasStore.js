const fs   = require('fs');
const path = require('path');

const DATA_DIR       = process.env.DATA_DIR || path.join(__dirname, '../../data');
const ALTAS_FILE     = path.join(DATA_DIR, 'onboarding_altas.json');
const SYNC_LOG_FILE  = path.join(DATA_DIR, 'onboarding_altas_sync_log.json');
const MAX_LOG_ENTRIES = 50;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function readJson(file, fallback) {
  ensureDir();
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJson(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ─── Altas ──────────────────────────────────────────────────────────────────
function getAltas() { return readJson(ALTAS_FILE, []); }
function getAltaById(id) { return getAltas().find(a => a.id === id) || null; }
function getAltaByRutKey(rutKey) { return getAltas().find(a => a.rutKey === rutKey) || null; }
function saveAlta(alta) {
  const list = getAltas();
  const idx = list.findIndex(a => a.id === alta.id);
  if (idx >= 0) list[idx] = alta; else list.push(alta);
  writeJson(ALTAS_FILE, list);
  return alta;
}
function deleteAlta(id) {
  writeJson(ALTAS_FILE, getAltas().filter(a => a.id !== id));
}

// ─── Log de sincronizaciones (alertas de duplicados / errores) ────────────────
function getSyncLog() { return readJson(SYNC_LOG_FILE, []); }
function addSyncLog(entry) {
  const list = getSyncLog();
  list.unshift(entry);
  writeJson(SYNC_LOG_FILE, list.slice(0, MAX_LOG_ENTRIES));
  return entry;
}

module.exports = {
  getAltas, getAltaById, getAltaByRutKey, saveAlta, deleteAlta,
  getSyncLog, addSyncLog,
};
