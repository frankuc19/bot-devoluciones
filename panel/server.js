require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const QRCode     = require('qrcode');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');

const ENV_PATH = path.join(__dirname, '..', '.env');

const { leerArchivo }                              = require('../src/leerArchivo');
const { agruparPorPatente }                        = require('../src/agruparPorPatente');
const { generarMensaje }                           = require('../src/generarMensaje');
const { cargarContactos, cargarNombres, limpiarCache, cargarDesdeEnv } = require('../config/contactos');
const { leerDevoluciones, marcarFilas,
        asegurarEncabezados, leerConsolidado,
        escribirTelefonos }                        = require('../src/googleSheets');
const { leerConciliaciones, leerGeosort,
        buscarFechaRuta }                          = require('../src/googleSheetsConciliaciones');
const { generarMensajeConciliacion }               = require('../src/generarMensajeConciliacion');

const emailRoutes     = require('../src/onboarding/emailRoutes');
const whatsappRoutes  = require('../src/onboarding/whatsappRoutes');
const campaignsRoutes = require('../src/onboarding/campaignsRoutes');
const templatesRoutes = require('../src/onboarding/templatesRoutes');

const DELAY_MS   = 5000;
const PORT       = process.env.PORT || 3000;
const USA_SHEETS = !!process.env.GOOGLE_SHEET_ID;
const DATA_DIR   = process.env.DATA_DIR   || path.join(__dirname, '..', 'data');
const WA_AUTH_DIR = process.env.WA_AUTH_DIR || path.join(__dirname, '..', '.wwebjs_auth');

// Escribir google-credentials.json desde variable de entorno (para Render/cloud)
if (process.env.GOOGLE_CREDENTIALS_B64) {
  const credPath = path.resolve(process.env.GOOGLE_CREDENTIALS_PATH ||
    path.join(__dirname, '..', 'config', 'google-credentials.json'));
  fs.mkdirSync(path.dirname(credPath), { recursive: true });
  if (!fs.existsSync(credPath)) {
    fs.writeFileSync(credPath, Buffer.from(process.env.GOOGLE_CREDENTIALS_B64, 'base64').toString('utf8'));
    console.log('Credenciales de Google escritas desde variable de entorno');
  }
}

// ─── Cache consolidado ────────────────────────────────────────────────────────
let _consolidadoCache  = null;
let _consolidadoCacheTs = 0;
const CONSOLIDADO_TTL  = 5 * 60 * 1000; // 5 minutos

async function obtenerContactos() {
  const ahora = Date.now();
  if (_consolidadoCache && (ahora - _consolidadoCacheTs) < CONSOLIDADO_TTL) {
    return _consolidadoCache;
  }
  try {
    const deSheet      = await leerConsolidado(); // sheet nuevo — fuente de verdad
    const csvContactos = cargarContactos();       // CSV (base, menor prioridad)
    const envOverrides = cargarDesdeEnv();        // .env manual (mayor prioridad)
    // Prioridad: .env > sheet > CSV
    _consolidadoCache  = { ...csvContactos, ...deSheet, ...envOverrides };
    _consolidadoCacheTs = ahora;
    console.log(`Contactos actualizados: ${Object.keys(_consolidadoCache).length} patentes`);
  } catch (e) {
    console.error('No se pudo leer consolidado, usando cache anterior:', e.message);
    if (!_consolidadoCache) _consolidadoCache = cargarContactos();
  }
  return _consolidadoCache;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
const PANEL_USER = process.env.PANEL_USER     || 'admin';
const PANEL_PASS = process.env.PANEL_PASSWORD || 'changeme';
const USERS_PATH = path.join(__dirname, '..', 'config', 'users.json');

const sessions = new Map(); // token -> { id, username, name, role }

function readUsers() {
  try {
    const raw = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
    return Array.isArray(raw.users) ? raw.users : [];
  } catch { return []; }
}

function writeUsers(users) {
  fs.mkdirSync(path.dirname(USERS_PATH), { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify({ users }, null, 2), 'utf8');
}

const ALL_SECTIONS = ['finanzas', 'onboarding', 'operaciones', 'capacitacion', 'perfiles'];

function loginUser(username, password) {
  const users = readUsers();
  const u = users.find(x => x.username === username && x.password === password);
  if (u) return { id: u.id, username: u.username, name: u.name, role: u.role, sections: u.sections || [] };
  if (username === PANEL_USER && password === PANEL_PASS)
    return { id: '0', username: PANEL_USER, name: 'Admin', role: 'admin', sections: [] };
  return null;
}

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const idx = c.indexOf('=');
    if (idx > 0) cookies[c.slice(0, idx).trim()] = decodeURIComponent(c.slice(idx + 1).trim());
  });
  return cookies;
}

function getSession(req) { return sessions.get(parseCookies(req).token); }

function requireAuth(req, res, next) {
  if (getSession(req)) return next();
  res.redirect('/login');
}

function requireAuthApi(req, res, next) {
  if (getSession(req)) return next();
  res.status(401).json({ ok: false, error: 'No autenticado' });
}

function requireAdmin(req, res, next) {
  if (getSession(req)?.role === 'admin') return next();
  res.status(403).json({ ok: false, error: 'Acceso restringido' });
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server);
app.set('io', io);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── Login (rutas publicas) ───────────────────────────────────────────────────
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ─── LMS público (conductores acceden sin login del panel) ───────────────────
app.get('/lms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'capacitacion', 'lms.html'));
});

const LMS_FILE = path.join(DATA_DIR, 'lms_conductores.json');
const LMS_DEFAULT = { "12345678-9":"falabella","98765432-1":"mercadolibre","11111111-1":"tottus","22222222-2":"jumbo" };

function readLmsCond() {
  try { return JSON.parse(fs.readFileSync(LMS_FILE, 'utf8')); } catch { return LMS_DEFAULT; }
}
function writeLmsCond(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LMS_FILE, JSON.stringify(data));
}

// Público: el celular del conductor lo consume para saber a qué convenio pertenece su RUT
app.get('/api/lms/conductores', (req, res) => {
  res.json(readLmsCond());
});

// Protegido: el admin actualiza la lista desde el panel
app.post('/api/lms/conductores', requireAuthApi, (req, res) => {
  if (typeof req.body !== 'object' || Array.isArray(req.body))
    return res.json({ ok: false, error: 'Formato inválido' });
  writeLmsCond(req.body);
  res.json({ ok: true });
});

const SECTION_HOME = {
  finanzas:    '/',
  onboarding:  '/onboarding/resumen.html',
  operaciones: '/operaciones/tarifario.html',
  capacitacion: '/capacitacion/index.html',
  perfiles:    '/perfiles.html',
};

const PAGE_SECTION = {
  '/':                            'finanzas',
  '/index.html':                  'finanzas',
  '/conciliaciones.html':         'finanzas',
  '/onboarding/resumen.html':     'onboarding',
  '/onboarding/email.html':       'onboarding',
  '/onboarding/whatsapp.html':    'onboarding',
  '/onboarding/altas.html':            'onboarding',
  '/onboarding/kpi.html':              'onboarding',
  '/operaciones/tarifario.html':       'operaciones',
  '/capacitacion/index.html':          'capacitacion',
  '/capacitacion/lms.html':            'capacitacion',
  '/perfiles.html':                    'perfiles',
};

app.post('/login', (req, res) => {
  const { user, password } = req.body;
  const session = loginUser(user, password);
  if (session) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, session);
    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; SameSite=Strict`);
    const sections = session.role === 'admin' ? ALL_SECTIONS : (session.sections || []);
    return res.redirect(SECTION_HOME[sections[0]] || '/');
  }
  res.redirect('/login?error=1');
});

app.post('/logout', (req, res) => {
  const token = parseCookies(req).token;
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/login');
});

// Proxy de imagen para el logo (sin auth, permite canvas sin CORS)
app.get('/api/logo-proxy', async (req, res) => {
  try {
    const r = await fetch('https://res.cloudinary.com/dkkab5dea/image/upload/v1780809949/Karri_2.1_ng9gss.png');
    const buf = Buffer.from(await r.arrayBuffer());
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch { res.status(502).end(); }
});

// ─── Rutas protegidas ─────────────────────────────────────────────────────────
app.use(requireAuth);

// Redirige si el usuario no tiene acceso a la sección de la página pedida
app.use((req, res, next) => {
  const section = PAGE_SECTION[req.path];
  if (!section) return next();
  const s = getSession(req);
  if (!s) return next();
  const sections = s.role === 'admin' ? ALL_SECTIONS : (s.sections || []);
  if (!sections.includes(section)) {
    return res.redirect(SECTION_HOME[sections[0]] || '/');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── API: sesión actual ───────────────────────────────────────────────────────
app.get('/api/me', requireAuthApi, (req, res) => {
  const s = getSession(req);
  const sections = s.role === 'admin' ? ALL_SECTIONS : (s.sections || []);
  res.json({ ok: true, id: s.id, username: s.username, name: s.name, role: s.role, sections });
});

// ─── API: gestión de usuarios (solo admin) ────────────────────────────────────
app.get('/api/perfiles/usuarios', requireAuthApi, requireAdmin, (req, res) => {
  const users = readUsers().map(({ password: _, ...u }) => u);
  res.json(users);
});

app.post('/api/perfiles/usuarios', requireAuthApi, requireAdmin, (req, res) => {
  const { name, username, password, role, sections = [] } = req.body;
  if (!name || !username || !password) return res.json({ ok: false, error: 'Faltan campos requeridos' });
  if (!['admin', 'advanced', 'beginner'].includes(role)) return res.json({ ok: false, error: 'Rol inválido' });
  if (role === 'beginner' && sections.length !== 1)
    return res.json({ ok: false, error: 'Beginner debe tener exactamente 1 sección' });
  if (role === 'advanced' && sections.length < 2)
    return res.json({ ok: false, error: 'Advanced debe tener al menos 2 secciones' });
  const users = readUsers();
  if (users.find(u => u.username === username)) return res.json({ ok: false, error: 'El usuario ya existe' });
  const newUser = { id: Date.now().toString(), name, username, password, role, sections: role === 'admin' ? [] : sections };
  users.push(newUser);
  writeUsers(users);
  const { password: _, ...safe } = newUser;
  res.json({ ok: true, user: safe });
});

app.put('/api/perfiles/usuarios/:id', requireAuthApi, requireAdmin, (req, res) => {
  const { name, username, password, role, sections } = req.body;
  const users = readUsers();
  const idx   = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, error: 'Usuario no encontrado' });
  if (role && !['admin', 'advanced', 'beginner'].includes(role)) return res.json({ ok: false, error: 'Rol inválido' });
  if (username && username !== users[idx].username && users.find(u => u.username === username))
    return res.json({ ok: false, error: 'El nombre de usuario ya está en uso' });
  const newRole = role || users[idx].role;
  const newSections = sections !== undefined ? sections : (users[idx].sections || []);
  if (newRole === 'beginner' && newSections.length !== 1)
    return res.json({ ok: false, error: 'Beginner debe tener exactamente 1 sección' });
  if (newRole === 'advanced' && newSections.length < 2)
    return res.json({ ok: false, error: 'Advanced debe tener al menos 2 secciones' });
  if (name)     users[idx].name     = name;
  if (username) users[idx].username = username;
  if (password) users[idx].password = password;
  if (role)     users[idx].role     = role;
  users[idx].sections = newRole === 'admin' ? [] : newSections;
  writeUsers(users);
  res.json({ ok: true });
});

app.delete('/api/perfiles/usuarios/:id', requireAuthApi, requireAdmin, (req, res) => {
  if (req.params.id === '1') return res.json({ ok: false, error: 'No puedes eliminar el usuario principal' });
  const users    = readUsers();
  const filtered = users.filter(u => u.id !== req.params.id);
  if (filtered.length === users.length) return res.json({ ok: false, error: 'Usuario no encontrado' });
  writeUsers(filtered);
  res.json({ ok: true });
});

// ─── API: onboarding ─────────────────────────────────────────────────────────
app.use('/api/ob/email',     requireAuthApi, emailRoutes);
app.use('/api/ob/whatsapp',  requireAuthApi, whatsappRoutes);
app.use('/api/ob/campaigns', requireAuthApi, campaignsRoutes);
app.use('/api/ob/templates', requireAuthApi, templatesRoutes);

// ─── Estado global ────────────────────────────────────────────────────────────
let waClient        = null;
let waEstado        = 'desconectado';
let mensajes        = [];
let _reconectarAuto = true;

// ─── Cargar datos (Google Sheets o CSV local) ─────────────────────────────────
async function cargarDatos() {
  const contactos = await obtenerContactos();
  const nombres   = cargarNombres();
  let filas, rowMap = {};

  if (USA_SHEETS) {
    const registros = await leerDevoluciones();
    filas = registros.map(r => r.data);

    const { normalizarPatente } = require('../config/contactos');
    for (const r of registros) {
      const p = normalizarPatente(r.data['PATENTE']);
      if (!rowMap[p]) rowMap[p] = { indices: [], tabName: r.tabName };
      rowMap[p].indices.push(r.rowIndex);
    }

    const tabName = registros[0]?.tabName;
    if (tabName) await asegurarEncabezados(tabName).catch(() => {});

    console.log(`Datos leidos desde Google Sheets (${filas.length} filas)`);
  } else {
    filas = await leerArchivo();
    console.log(`Datos leidos desde archivo local`);
  }

  const grupos = agruparPorPatente(filas);
  mensajes = [];
  const telefonosAEscribir = [];

  for (const [patente, filasPatente] of grupos.entries()) {
    const primera         = filasPatente[0];
    const telefonoSheet    = (primera['TELEFONO'] || '').trim();
    const telefonoContacto = contactos[patente] || null;
    // Consolidado siempre tiene prioridad sobre columna P
    const numero           = telefonoContacto || telefonoSheet || null;

    // Si el consolidado tiene teléfono y difiere de col. P → sobrescribir en el Sheet
    if (USA_SHEETS && telefonoContacto && telefonoContacto !== telefonoSheet && rowMap[patente]) {
      for (const rowIndex of rowMap[patente].indices) {
        telefonosAEscribir.push({ rowIndex, tabName: rowMap[patente].tabName, telefono: telefonoContacto });
      }
    }

    mensajes.push({
      patente,
      numero,
      nombre:     nombres[patente] || null,
      folios:     filasPatente.length,
      monto:      Number(String(primera['MONTO MULTA (CLP)'] || '0').replace(/[^0-9.-]/g, '')),
      mensaje:    generarMensaje(patente, filasPatente),
      rowIndices: rowMap[patente]?.indices || [],
      tabName:    rowMap[patente]?.tabName || null,
      estadoSheet: primera['ESTADO_WHATSAPP'] || null,
      fechaSheet:  primera['FECHA_ENVIO']     || null,
    });
  }

  // Escribir teléfonos cruzados en columna P del Sheet (sin bloquear la respuesta)
  if (telefonosAEscribir.length > 0) {
    escribirTelefonos(telefonosAEscribir).catch(e =>
      console.error('No se pudo escribir teléfonos en Sheet:', e.message));
  }

  return mensajes;
}

// ─── API REST ─────────────────────────────────────────────────────────────────
app.get('/api/datos', requireAuthApi, async (req, res) => {
  try {
    const datos = await cargarDatos();
    res.json({ ok: true, datos, waEstado, usaSheets: USA_SHEETS });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.get('/api/mensaje/:patente', requireAuthApi, (req, res) => {
  const item = mensajes.find(m => m.patente === req.params.patente);
  if (!item) return res.json({ ok: false, error: 'Patente no encontrada' });
  res.json({ ok: true, mensaje: item.mensaje, patente: item.patente, numero: item.numero });
});

app.post('/api/whatsapp/conectar', requireAuthApi, (req, res) => {
  if (waEstado === 'listo') return res.json({ ok: true, estado: 'ya conectado' });
  iniciarWhatsApp();
  res.json({ ok: true, estado: 'iniciando' });
});

app.post('/api/whatsapp/desconectar', requireAuthApi, async (req, res) => {
  _reconectarAuto = false;
  if (waClient) {
    await waClient.logout().catch(() => {});
    waClient = null;
    waEstado = 'desconectado';
    io.emit('wa_estado', { estado: 'desconectado' });
  }
  res.json({ ok: true });
});

app.post('/api/contactos/manual', requireAuthApi, async (req, res) => {
  const { patente, telefono } = req.body || {};
  if (!patente) return res.json({ ok: false, error: 'Patente requerida' });
  const tel = String(telefono || '').replace(/[+\s\-]/g, '');
  if (!/^\d{10,15}$/.test(tel))
    return res.json({ ok: false, error: 'Numero invalido — usa formato 56912345678' });
  const clave = `PATENTE_${patente.toUpperCase()}`;
  let contenido = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const regex = new RegExp(`^${clave}=.*$`, 'm');
  contenido = regex.test(contenido)
    ? contenido.replace(regex, `${clave}=${tel}`)
    : contenido.trimEnd() + `\n${clave}=${tel}\n`;
  fs.writeFileSync(ENV_PATH, contenido, 'utf8');
  process.env[clave] = tel;
  const datos = await cargarDatos();
  io.emit('datos_actualizados', { datos });
  res.json({ ok: true, patente, telefono: tel });
});

app.delete('/api/contactos/manual/:patente', requireAuthApi, async (req, res) => {
  const clave = `PATENTE_${req.params.patente.toUpperCase()}`;
  if (fs.existsSync(ENV_PATH)) {
    let contenido = fs.readFileSync(ENV_PATH, 'utf8');
    contenido = contenido.replace(new RegExp(`^${clave}=.*\n?`, 'm'), '');
    fs.writeFileSync(ENV_PATH, contenido, 'utf8');
  }
  delete process.env[clave];
  const datos = await cargarDatos();
  io.emit('datos_actualizados', { datos });
  res.json({ ok: true });
});

app.post('/api/upload/contactos', requireAuthApi, (req, res) => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dest = path.join(DATA_DIR, 'contactos_conductores.csv');
  const ws   = fs.createWriteStream(dest);
  req.pipe(ws);
  ws.on('finish', async () => {
    limpiarCache();
    const datos = await cargarDatos();
    io.emit('datos_actualizados', { datos });
    res.json({ ok: true });
  });
  ws.on('error', (e) => res.status(500).json({ ok: false, error: e.message }));
});

app.post('/api/enviar', requireAuthApi, async (req, res) => {
  const { patentes } = req.body;
  if (waEstado !== 'listo') return res.json({ ok: false, error: 'WhatsApp no conectado' });
  const lista = patentes?.length > 0
    ? mensajes.filter(m => patentes.includes(m.patente))
    : mensajes;
  res.json({ ok: true, total: lista.length });
  enviarConProgreso(lista);
});

// ─── Conciliaciones ───────────────────────────────────────────────────────────
let _geosortCache   = null;
let _geosortCacheTs = 0;
const GEOSORT_TTL   = 10 * 60 * 1000;

async function obtenerGeosort() {
  const ahora = Date.now();
  if (_geosortCache && (ahora - _geosortCacheTs) < GEOSORT_TTL) return _geosortCache;
  try {
    _geosortCache   = await leerGeosort();
    _geosortCacheTs = ahora;
  } catch (e) {
    console.error('Error leyendo geosort:', e.message);
    if (!_geosortCache) _geosortCache = {};
  }
  return _geosortCache;
}

let mensajesConciliaciones = [];

async function cargarDatosConciliaciones() {
  const contactos = await obtenerContactos();
  const nombres   = cargarNombres();
  const geosort   = await obtenerGeosort();
  const registros = await leerConciliaciones();

  const grupos = new Map();
  for (const r of registros) {
    const ppuNorm = r.data.PPU; // ya normalizado en leerConciliaciones
    if (!ppuNorm) continue;
    if (!grupos.has(ppuNorm)) {
      grupos.set(ppuNorm, { filas: [], rowIndices: [], tabName: r.tabName });
    }
    const g = grupos.get(ppuNorm);
    g.filas.push(r.data);
    g.rowIndices.push(r.rowIndex);
  }

  mensajesConciliaciones = [];
  for (const [ppuNorm, { filas, rowIndices, tabName }] of grupos.entries()) {
    const numero      = contactos[ppuNorm] || null;
    const fechasRuta  = filas.map(f => buscarFechaRuta(f, geosort, ppuNorm));
    mensajesConciliaciones.push({
      patente:    ppuNorm,
      numero,
      nombre:     nombres[ppuNorm] || null,
      items:      filas.length,
      mensaje:    generarMensajeConciliacion(ppuNorm, filas, fechasRuta),
      rowIndices,
      tabName,
    });
  }
  return mensajesConciliaciones;
}

app.get('/api/conciliaciones/datos', requireAuthApi, async (req, res) => {
  try {
    const datos = await cargarDatosConciliaciones();
    res.json({ ok: true, datos, waEstado });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.get('/api/conciliaciones/mensaje/:patente', requireAuthApi, (req, res) => {
  const item = mensajesConciliaciones.find(m => m.patente === decodeURIComponent(req.params.patente));
  if (!item) return res.json({ ok: false, error: 'Patente no encontrada' });
  res.json({ ok: true, mensaje: item.mensaje, patente: item.patente, numero: item.numero });
});

app.post('/api/conciliaciones/enviar', requireAuthApi, async (req, res) => {
  if (waEstado !== 'listo') return res.json({ ok: false, error: 'WhatsApp no conectado' });
  const { patentes } = req.body;
  const lista = patentes?.length > 0
    ? mensajesConciliaciones.filter(m => patentes.includes(m.patente))
    : mensajesConciliaciones;
  res.json({ ok: true, total: lista.length });
  enviarConciliacionesConProgreso(lista);
});

async function enviarConciliacionesConProgreso(lista) {
  io.emit('envio_inicio', { total: lista.length });
  let enviados = 0;
  for (let i = 0; i < lista.length; i++) {
    const { patente, numero, mensaje } = lista[i];
    if (!numero) {
      io.emit('envio_log', { patente, ok: false, msg: 'Sin numero — no enviado', i: i + 1, total: lista.length });
      continue;
    }
    try {
      await waClient.sendMessage(`${numero}@s.whatsapp.net`, { text: mensaje });
      io.emit('envio_log', { patente, ok: true, numero, msg: 'Enviado', i: i + 1, total: lista.length });
      enviados++;
    } catch (err) {
      io.emit('envio_log', { patente, ok: false, numero, msg: `Error: ${err.message}`, i: i + 1, total: lista.length });
    }
    if (i < lista.length - 1) await sleep(DELAY_MS);
  }
  io.emit('envio_fin', { total: lista.length, enviados });
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
async function iniciarWhatsApp() {
  if (waEstado !== 'desconectado') return;
  _reconectarAuto = true;
  waEstado = 'conectando';
  io.emit('wa_estado', { estado: 'conectando' });

  try {
    const { state, saveCreds } = await useMultiFileAuthState(WA_AUTH_DIR);
    const { version }          = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth:               state,
      printQRInTerminal:  false,
      logger:             pino({ level: 'silent' }),
    });

    waClient = sock;
    app.set('waClient', sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        waEstado = 'qr';
        io.emit('wa_estado', { estado: 'qr', qr: await QRCode.toDataURL(qr) });
      }
      if (connection === 'open') {
        waEstado = 'listo';
        io.emit('wa_estado', { estado: 'listo' });
        console.log('WhatsApp listo');
      }
      if (connection === 'close') {
        const code      = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        waClient  = null;
        app.set('waClient', null);
        waEstado  = 'desconectado';
        io.emit('wa_estado', { estado: 'desconectado' });
        if (_reconectarAuto && !loggedOut) {
          console.log('Reconectando WhatsApp...');
          setTimeout(iniciarWhatsApp, 3000);
        }
      }
    });
  } catch (err) {
    console.error('Error iniciando WhatsApp:', err.message);
    waEstado = 'desconectado';
    waClient = null;
    io.emit('wa_estado', { estado: 'error', msg: err.message });
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function limpiarArchivosLocales() {
  const archivos = ['devoluciones.csv', 'devoluciones.xlsx'];
  const eliminados = [];

  for (const nombre of archivos) {
    const ruta = path.join(DATA_DIR, nombre);
    if (fs.existsSync(ruta)) {
      fs.unlinkSync(ruta);
      eliminados.push(nombre);
    }
  }

  if (eliminados.length > 0) {
    console.log(`Archivos locales eliminados: ${eliminados.join(', ')}`);
    io.emit('envio_log', { patente: '—', ok: true, msg: `Archivos locales eliminados: ${eliminados.join(', ')}` });
  }
}

async function enviarConProgreso(lista) {
  io.emit('envio_inicio', { total: lista.length });

  let enviados = 0;
  let esEnvioTotal = lista.length === mensajes.length;

  for (let i = 0; i < lista.length; i++) {
    const { patente, numero, mensaje, rowIndices, tabName } = lista[i];

    if (!numero) {
      io.emit('envio_log', { patente, ok: false, msg: 'Sin numero — no enviado', i: i + 1, total: lista.length });
      if (USA_SHEETS && rowIndices.length && tabName) {
        marcarFilas(tabName, rowIndices, 'SIN NÚMERO').catch(e =>
          console.error(`No se pudo marcar Sheet para ${patente}:`, e.message));
      }
      continue;
    }

    try {
      await waClient.sendMessage(`${numero}@s.whatsapp.net`, { text: mensaje });
      io.emit('envio_log', { patente, ok: true, numero, msg: 'Enviado', i: i + 1, total: lista.length });
      enviados++;

      if (USA_SHEETS && rowIndices.length && tabName) {
        marcarFilas(tabName, rowIndices, 'ENVIADO').catch(e =>
          console.error(`No se pudo marcar Sheet para ${patente}:`, e.message));
      }
    } catch (err) {
      io.emit('envio_log', { patente, ok: false, numero, msg: `Error: ${err.message}`, i: i + 1, total: lista.length });
    }

    if (i < lista.length - 1) await sleep(DELAY_MS);
  }

  io.emit('envio_fin', { total: lista.length, enviados });

  if (esEnvioTotal && enviados > 0) {
    limpiarArchivosLocales();
  }
}

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.use((socket, next) => {
  const cookie = socket.handshake.headers.cookie || '';
  const token  = parseCookies({ headers: { cookie } }).token;
  if (token && sessions.has(token)) return next();
  next(new Error('No autenticado'));
});

io.on('connection', (socket) => socket.emit('wa_estado', { estado: waEstado }));

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\nPanel de control: http://localhost:${PORT}`);
  console.log(`Fuente de datos: ${USA_SHEETS ? 'Google Sheets' : 'archivo local CSV'}`);
  console.log(`Usuario del panel: ${PANEL_USER}\n`);
});
