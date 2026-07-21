/**
 * LMS Test Suite — ambiente aislado
 * Monta solo las rutas LMS (sin WhatsApp, Google, etc.)
 * Usa un DATA_DIR temporal para no tocar datos reales
 * Run: node test/lms-test.js
 */

const express = require('express');
const http    = require('http');
const crypto  = require('crypto');
const fs      = require('fs');
const os      = require('os');
const path    = require('path');

// ── Directorio de datos temporal ──────────────────────────────────────────────
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-test-'));
const TEST_PORT = 13337;
const BASE = `http://localhost:${TEST_PORT}`;
const LMS_AP = 'test_pass_123';

// ── Helpers de parseo (misma lógica que server.js) ────────────────────────────
function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const idx = c.indexOf('=');
    if (idx > 0) cookies[c.slice(0, idx).trim()] = decodeURIComponent(c.slice(idx + 1).trim());
  });
  return cookies;
}

// ── Sesiones (misma lógica — Map persistido) ──────────────────────────────────
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const sessions = new Map();

function getSession(req) {
  return sessions.get(parseCookies(req).token);
}

// ── LMS Admin Token (determinístico) ─────────────────────────────────────────
const lmsAdminToken = crypto.createHash('sha256').update('lms_admin:' + LMS_AP).digest('hex');

function requireLmsAdmin(req, res, next) {
  if (getSession(req)) return next();
  if (parseCookies(req).lms_admin === lmsAdminToken) return next();
  res.status(401).json({ ok: false, error: 'No autorizado' });
}

// ── Archivos de datos ─────────────────────────────────────────────────────────
const LMS_FILE         = path.join(DATA_DIR, 'lms_conductores.json');
const LMS_CONTENT_FILE = path.join(DATA_DIR, 'lms_contenido.json');
const LMS_PROG_FILE    = path.join(DATA_DIR, 'lms_progreso.json');
const LMS_LOGS_FILE    = path.join(DATA_DIR, 'lms_logs.json');

function readJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; }
}
function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

// ── Servidor Express de prueba ────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Panel login simulado (para testear getSession path)
app.post('/login-panel', (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username: 'admin', role: 'admin' });
  res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; SameSite=Strict`);
  res.json({ ok: true, token });
});

// ── LMS Routes (idénticas a server.js) ───────────────────────────────────────
app.post('/api/lms/admin-login', (req, res) => {
  if (req.body?.password !== LMS_AP)
    return res.json({ ok: false, error: 'Contraseña incorrecta' });
  res.setHeader('Set-Cookie', `lms_admin=${lmsAdminToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${8*3600}`);
  res.json({ ok: true });
});

app.get('/api/lms/conductores', (req, res) => res.json(readJSON(LMS_FILE, {})));
app.post('/api/lms/conductores', requireLmsAdmin, (req, res) => {
  if (typeof req.body !== 'object' || Array.isArray(req.body))
    return res.json({ ok: false, error: 'Formato inválido' });
  writeJSON(LMS_FILE, req.body);
  res.json({ ok: true });
});

app.get('/api/lms/contenido', (req, res) => res.json(readJSON(LMS_CONTENT_FILE, {})));
app.post('/api/lms/contenido', requireLmsAdmin, (req, res) => {
  writeJSON(LMS_CONTENT_FILE, req.body);
  res.json({ ok: true });
});

app.get('/api/lms/progreso', requireLmsAdmin, (req, res) => res.json(readJSON(LMS_PROG_FILE, {})));
app.get('/api/lms/progreso/:rut', (req, res) => {
  res.json(readJSON(LMS_PROG_FILE, {})[req.params.rut] || {});
});
app.post('/api/lms/progreso/:rut', (req, res) => {
  const prog = readJSON(LMS_PROG_FILE, {});
  prog[req.params.rut] = req.body;
  writeJSON(LMS_PROG_FILE, prog);
  res.json({ ok: true });
});

app.get('/api/lms/logs', requireLmsAdmin, (req, res) => res.json(readJSON(LMS_LOGS_FILE, [])));
app.post('/api/lms/logs', (req, res) => {
  const logs = readJSON(LMS_LOGS_FILE, []);
  logs.unshift(req.body);
  writeJSON(LMS_LOGS_FILE, logs.slice(0, 2000));
  res.json({ ok: true });
});

// ── Iniciar servidor ──────────────────────────────────────────────────────────
const server = http.createServer(app);

// ── Utilidades de test ────────────────────────────────────────────────────────
let passed = 0, failed = 0, total = 0;
const results = [];

function ok(name, condition, detail = '') {
  total++;
  const status = condition ? 'PASS' : 'FAIL';
  if (condition) passed++; else failed++;
  results.push({ status, name, detail });
}

async function req(method, url, { body, cookies } = {}) {
  const cookieHeader = cookies ? Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; ') : '';
  const headers = { 'Content-Type': 'application/json' };
  if (cookieHeader) headers['Cookie'] = cookieHeader;
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, headers: res.headers, raw: text };
}

// Extrae cookies de Set-Cookie header
function extractCookie(headers, name) {
  const raw = headers.get('set-cookie') || '';
  const parts = raw.split(';').map(s => s.trim());
  for (const p of parts) {
    if (p.startsWith(name + '=')) return p.slice(name.length + 1);
  }
  return null;
}

// ── Suite de tests ────────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  LMS Test Suite — Ambiente aislado');
  console.log(`  Data dir: ${DATA_DIR}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ────────────────────────────────────────────────────────────────────────────
  // BLOQUE 1: Admin Login (cookie lms_admin)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('▸ Bloque 1: Admin Login via /lms');

  const loginWrong = await req('POST', '/api/lms/admin-login', { body: { password: 'wrong' } });
  ok('Contraseña incorrecta → ok:false', loginWrong.json?.ok === false);
  ok('Contraseña incorrecta → no hay cookie', !extractCookie(loginWrong.headers, 'lms_admin'));

  const loginOk = await req('POST', '/api/lms/admin-login', { body: { password: LMS_AP } });
  ok('Login correcto → ok:true', loginOk.json?.ok === true);
  const adminCookie = extractCookie(loginOk.headers, 'lms_admin');
  ok('Login correcto → cookie lms_admin presente', !!adminCookie);
  ok('Cookie es el token determinístico', adminCookie === lmsAdminToken);

  // ────────────────────────────────────────────────────────────────────────────
  // BLOQUE 2: requireLmsAdmin — sin auth debe devolver 401
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n▸ Bloque 2: Protección de rutas (sin auth)');

  const noCookieSave = await req('POST', '/api/lms/contenido', { body: { test: 1 } });
  ok('POST /contenido sin cookie → 401', noCookieSave.status === 401);

  const noCookieCond = await req('POST', '/api/lms/conductores', { body: { '12345678-9': 'tottus' } });
  ok('POST /conductores sin cookie → 401', noCookieCond.status === 401);

  const noCookieLogs = await req('GET', '/api/lms/logs');
  ok('GET /logs sin cookie → 401', noCookieLogs.status === 401);

  const noCookieProg = await req('GET', '/api/lms/progreso');
  ok('GET /progreso (all) sin cookie → 401', noCookieProg.status === 401);

  // ────────────────────────────────────────────────────────────────────────────
  // BLOQUE 3: Rutas públicas (no requieren auth)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n▸ Bloque 3: Rutas públicas (conductor)');

  const pubCond = await req('GET', '/api/lms/conductores');
  ok('GET /conductores público → 200', pubCond.status === 200);
  ok('GET /conductores retorna objeto', typeof pubCond.json === 'object');

  const pubContent = await req('GET', '/api/lms/contenido');
  ok('GET /contenido público → 200', pubContent.status === 200);

  const pubProg = await req('GET', '/api/lms/progreso/12345678-9');
  ok('GET /progreso/:rut público → 200', pubProg.status === 200);
  ok('GET /progreso/:rut retorna objeto', typeof pubProg.json === 'object');

  // ────────────────────────────────────────────────────────────────────────────
  // BLOQUE 4: Flujo admin — guardar y leer contenido
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n▸ Bloque 4: Guardar y leer contenido (admin con cookie)');

  const testContent = {
    tottus: {
      name: 'Tottus',
      color: '#A32D2D',
      bg: '#FEE8EC',
      modules: [
        {
          id: 't1',
          title: 'Módulo de prueba',
          desc: 'Desc test',
          ytId: 'abc123',
          questions: [{ q: '¿Pregunta 1?', opts: ['A','B','C','D'], ans: 1 }],
          opcional: false
        }
      ]
    }
  };

  const saveContent = await req('POST', '/api/lms/contenido',
    { body: testContent, cookies: { lms_admin: adminCookie } });
  ok('POST /contenido con cookie → 200', saveContent.status === 200);
  ok('POST /contenido → ok:true', saveContent.json?.ok === true);

  const readContent = await req('GET', '/api/lms/contenido');
  ok('GET /contenido retorna lo guardado', readContent.json?.tottus?.name === 'Tottus');
  ok('Módulo guardado correctamente', readContent.json?.tottus?.modules?.[0]?.title === 'Módulo de prueba');
  ok('ytId persistido', readContent.json?.tottus?.modules?.[0]?.ytId === 'abc123');
  ok('Preguntas persistidas', readContent.json?.tottus?.modules?.[0]?.questions?.length === 1);
  ok('opcional guardado', readContent.json?.tottus?.modules?.[0]?.opcional === false);

  // ────────────────────────────────────────────────────────────────────────────
  // BLOQUE 5: Eliminar convenio — verificar que no reaparece
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n▸ Bloque 5: Eliminar convenio — no debe reaparecer');

  // Guardar dos convenios
  const twoConvs = {
    tottus: testContent.tottus,
    walmart: { name: 'Walmart', color: '#0071CE', bg: '#E5F0FF', modules: [] }
  };
  await req('POST', '/api/lms/contenido', { body: twoConvs, cookies: { lms_admin: adminCookie } });

  // Eliminar walmart
  const onlyTottus = { tottus: testContent.tottus };
  await req('POST', '/api/lms/contenido', { body: onlyTottus, cookies: { lms_admin: adminCookie } });

  const afterDelete = await req('GET', '/api/lms/contenido');
  ok('Walmart eliminado no aparece', !afterDelete.json?.walmart);
  ok('Tottus sigue presente', !!afterDelete.json?.tottus);

  // ────────────────────────────────────────────────────────────────────────────
  // BLOQUE 6: Conductores — CRUD
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n▸ Bloque 6: Conductores — guardar y leer');

  const testConductores = { '12345678-9': 'tottus', '98765432-1': 'falabella' };
  const saveCond = await req('POST', '/api/lms/conductores',
    { body: testConductores, cookies: { lms_admin: adminCookie } });
  ok('POST /conductores con cookie → ok:true', saveCond.json?.ok === true);

  const readCond = await req('GET', '/api/lms/conductores');
  ok('GET /conductores retorna los guardados', readCond.json?.['12345678-9'] === 'tottus');
  ok('Segundo conductor guardado', readCond.json?.['98765432-1'] === 'falabella');

  // Formato inválido (array)
  const badFormat = await req('POST', '/api/lms/conductores',
    { body: ['rut1', 'rut2'], cookies: { lms_admin: adminCookie } });
  ok('POST /conductores con array → ok:false', badFormat.json?.ok === false);

  // ────────────────────────────────────────────────────────────────────────────
  // BLOQUE 7: Progreso de conductor
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n▸ Bloque 7: Progreso del conductor');

  const rut = '12345678-9';
  const progData = { t1: { passed: true, score: 90, attempts: 1 } };

  const saveProg = await req('POST', `/api/lms/progreso/${encodeURIComponent(rut)}`,
    { body: progData });
  ok('POST /progreso/:rut (público) → ok:true', saveProg.json?.ok === true);

  const readProg = await req('GET', `/api/lms/progreso/${encodeURIComponent(rut)}`);
  ok('GET /progreso/:rut retorna lo guardado', readProg.json?.t1?.passed === true);
  ok('Score guardado', readProg.json?.t1?.score === 90);

  // Reinicio de progreso (vaciar)
  const resetProg = await req('POST', `/api/lms/progreso/${encodeURIComponent(rut)}`, { body: {} });
  ok('Reinicio de progreso → ok:true', resetProg.json?.ok === true);
  const afterReset = await req('GET', `/api/lms/progreso/${encodeURIComponent(rut)}`);
  ok('Progreso vacío tras reinicio', Object.keys(afterReset.json || {}).length === 0);

  // RUT no existe → debe devolver {}
  const unknownRut = await req('GET', '/api/lms/progreso/99999999-9');
  ok('Progreso de RUT inexistente → {}', typeof unknownRut.json === 'object' && !unknownRut.json?.t1);

  // GET /progreso (all) con cookie
  await req('POST', `/api/lms/progreso/${encodeURIComponent(rut)}`, { body: { t1: { passed: true } } });
  const allProg = await req('GET', '/api/lms/progreso', { cookies: { lms_admin: adminCookie } });
  ok('GET /progreso (all) con cookie → tiene el RUT', !!allProg.json?.[rut]);

  // ────────────────────────────────────────────────────────────────────────────
  // BLOQUE 8: Logs de quizzes
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n▸ Bloque 8: Logs de quizzes');

  const logEntry = {
    rut, conv: 'tottus', mod: 'Módulo de prueba',
    score: 90, passed: true, attempt: 1,
    fecha: new Date().toLocaleDateString('es-CL')
  };
  const saveLog = await req('POST', '/api/lms/logs', { body: logEntry });
  ok('POST /logs (público) → ok:true', saveLog.json?.ok === true);

  const readLogs = await req('GET', '/api/lms/logs', { cookies: { lms_admin: adminCookie } });
  ok('GET /logs con cookie → array', Array.isArray(readLogs.json));
  ok('Log guardado correctamente', readLogs.json?.[0]?.rut === rut);
  ok('Score en log correcto', readLogs.json?.[0]?.score === 90);

  // Múltiples logs — el más reciente va primero
  const logEntry2 = { ...logEntry, score: 60, passed: false, attempt: 2 };
  await req('POST', '/api/lms/logs', { body: logEntry2 });
  const readLogs2 = await req('GET', '/api/lms/logs', { cookies: { lms_admin: adminCookie } });
  ok('Log más reciente va primero', readLogs2.json?.[0]?.attempt === 2);

  // ────────────────────────────────────────────────────────────────────────────
  // BLOQUE 9: Sesión del panel (getSession path)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n▸ Bloque 9: Sesión del panel (getSession)');

  const panelLogin = await req('POST', '/login-panel');
  const panelToken = extractCookie(panelLogin.headers, 'token');
  ok('Login panel → cookie token presente', !!panelToken);

  // Acceso con sesión del panel a ruta protegida
  const panelSave = await req('POST', '/api/lms/contenido',
    { body: { tottus: testContent.tottus }, cookies: { token: panelToken } });
  ok('POST /contenido con sesión de panel → ok:true', panelSave.json?.ok === true);

  // ────────────────────────────────────────────────────────────────────────────
  // BLOQUE 10: Persistencia entre "reinicios" (re-leer archivos)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n▸ Bloque 10: Persistencia en disco');

  // Los datos escritos antes deben estar en disco
  const diskContent = readJSON(LMS_CONTENT_FILE, null);
  ok('lms_contenido.json existe en disco', diskContent !== null);
  ok('Contenido en disco tiene tottus', !!diskContent?.tottus);

  const diskCond = readJSON(LMS_FILE, null);
  ok('lms_conductores.json existe en disco', diskCond !== null);
  ok('Conductores en disco tienen el RUT', diskCond?.['12345678-9'] === 'tottus');

  const diskProg = readJSON(LMS_PROG_FILE, null);
  ok('lms_progreso.json existe en disco', diskProg !== null);

  const diskLogs = readJSON(LMS_LOGS_FILE, null);
  ok('lms_logs.json existe en disco', Array.isArray(diskLogs));
  ok('Logs tienen entradas', diskLogs?.length >= 2);

  // ────────────────────────────────────────────────────────────────────────────
  // BLOQUE 11: Edge cases y casos límite
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n▸ Bloque 11: Edge cases');

  // Cookie lms_admin con valor incorrecto
  const badCookie = await req('POST', '/api/lms/contenido',
    { body: { x: 1 }, cookies: { lms_admin: 'token_falso_12345' } });
  ok('Cookie falsa → 401', badCookie.status === 401);

  // Cookie lms_admin correcta pero también token de panel vacío
  const bothAuth = await req('POST', '/api/lms/contenido',
    { body: { tottus: testContent.tottus }, cookies: { lms_admin: adminCookie, token: 'invalido' } });
  // Debe pasar por lms_admin aunque el panel token sea inválido
  ok('Cookie lms_admin válida prevalece aunque token de panel sea inválido', bothAuth.json?.ok === true);

  // Guardar módulo con preguntas vacías
  const emptyQuestions = {
    tottus: {
      name: 'Tottus', color: '#A32D2D', bg: '#FEE8EC',
      modules: [{ id: 't1', title: 'Sin preguntas', desc: '', ytId: '', questions: [], opcional: true }]
    }
  };
  const saveEmpty = await req('POST', '/api/lms/contenido',
    { body: emptyQuestions, cookies: { lms_admin: adminCookie } });
  ok('Módulo sin preguntas se guarda sin error', saveEmpty.json?.ok === true);

  const afterEmpty = await req('GET', '/api/lms/contenido');
  ok('Módulo opcional:true guardado', afterEmpty.json?.tottus?.modules?.[0]?.opcional === true);
  ok('questions:[] guardado', Array.isArray(afterEmpty.json?.tottus?.modules?.[0]?.questions));

  // RUT con puntos y mayúsculas (normalización)
  const rutWithDots = '12.345.678-9';
  const progRut = await req('POST', `/api/lms/progreso/${encodeURIComponent(rutWithDots)}`, { body: { x: 1 } });
  ok('RUT con puntos se guarda (raw, sin normalizar en server)', progRut.json?.ok === true);

  // Body inválido (string en vez de object) para contenido
  const strBody = await req('POST', '/api/lms/conductores',
    { body: 'no-soy-un-objeto', cookies: { lms_admin: adminCookie } });
  // Express parsea como string → body-parser lo trata como primitivo, no object
  ok('Body tipo string → formato inválido rechazado', strBody.json?.ok === false || strBody.status !== 200);

  // ────────────────────────────────────────────────────────────────────────────
  // BLOQUE 12: Flujo completo E2E (conductor)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n▸ Bloque 12: Flujo E2E completo — conductor');

  // 1. Admin guarda convenio + conductor
  const fullContent = {
    walmart: {
      name: 'Walmart',
      color: '#0071CE',
      bg: '#E5F0FF',
      modules: [
        { id: 'w1', title: 'Inducción Walmart', desc: 'Módulo 1', ytId: 'dQw4w9WgXcQ',
          questions: [
            { q: '¿Pregunta 1?', opts: ['Opción A', 'Opción B', 'Opción C', 'Opción D'], ans: 1 },
            { q: '¿Pregunta 2?', opts: ['Opción A', 'Opción B', 'Opción C', 'Opción D'], ans: 0 }
          ],
          opcional: false
        }
      ]
    }
  };
  await req('POST', '/api/lms/contenido', { body: fullContent, cookies: { lms_admin: adminCookie } });
  await req('POST', '/api/lms/conductores', {
    body: { '77777777-7': 'walmart' }, cookies: { lms_admin: adminCookie }
  });

  // 2. Conductor carga lista → encuentra su convenio
  const condList = await req('GET', '/api/lms/conductores');
  const conv = condList.json?.['77777777-7'];
  ok('Conductor encuentra su convenio', conv === 'walmart');

  // 3. Conductor carga contenido → encuentra sus módulos
  const content = await req('GET', '/api/lms/contenido');
  const modules = content.json?.[conv]?.modules;
  ok('Conductor ve los módulos de su convenio', modules?.length === 1);
  ok('Módulo tiene preguntas', modules?.[0]?.questions?.length === 2);

  // 4. Conductor guarda progreso
  const condProg = { w1: { passed: true, score: 100, attempts: 1 } };
  await req('POST', '/api/lms/progreso/77777777-7', { body: condProg });
  const savedProg = await req('GET', '/api/lms/progreso/77777777-7');
  ok('Progreso del conductor persistido', savedProg.json?.w1?.passed === true);

  // 5. Conductor guarda log de quiz
  await req('POST', '/api/lms/logs', {
    body: { rut: '77777777-7', conv: 'walmart', mod: 'Inducción Walmart',
            score: 100, passed: true, attempt: 1, fecha: '21/07/2026' }
  });

  // 6. Admin lee el log del conductor
  const adminLogs = await req('GET', '/api/lms/logs', { cookies: { lms_admin: adminCookie } });
  const condLog = adminLogs.json?.find(l => l.rut === '77777777-7');
  ok('Admin ve el log del conductor', !!condLog);
  ok('Log tiene score correcto', condLog?.score === 100);

  // 7. Admin ve todo el progreso
  const allProgAdmin = await req('GET', '/api/lms/progreso', { cookies: { lms_admin: adminCookie } });
  ok('Admin ve progreso de todos los conductores', !!allProgAdmin.json?.['77777777-7']);

  // ────────────────────────────────────────────────────────────────────────────
  // Resultado final
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✓' : '✗';
    const color = r.status === 'PASS' ? '\x1b[32m' : '\x1b[31m';
    console.log(`  ${color}${icon}\x1b[0m ${r.name}${r.detail ? '  →  ' + r.detail : ''}`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n  Total: ${total}  ✓ Passed: ${passed}  ✗ Failed: ${failed}`);
  if (failed > 0) {
    console.log('\n  TESTS FALLIDOS:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`    ✗ ${r.name}`));
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Limpiar
  server.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });

  process.exit(failed > 0 ? 1 : 0);
}

server.listen(TEST_PORT, async () => {
  try {
    await runTests();
  } catch (err) {
    console.error('\n\x1b[31mError inesperado en test:\x1b[0m', err);
    server.close();
    process.exit(1);
  }
});
