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
const { cargarContactos, cargarNombres, limpiarCache } = require('../config/contactos');
const { leerDevoluciones, marcarFilas,
        asegurarEncabezados, leerConsolidado,
        escribirTelefonos }                        = require('../src/googleSheets');

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
    const deSheet = await leerConsolidado();        // consolidado Google Sheets
    const locales  = cargarContactos();             // CSV local + .env (prioridad)
    _consolidadoCache  = { ...deSheet, ...locales };
    _consolidadoCacheTs = ahora;
    console.log(`Contactos actualizados: ${Object.keys(_consolidadoCache).length} patentes`);
  } catch (e) {
    console.error('No se pudo leer consolidado, usando cache anterior:', e.message);
    if (!_consolidadoCache) _consolidadoCache = cargarContactos();
  }
  return _consolidadoCache;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
const PANEL_USER   = process.env.PANEL_USER     || 'admin';
const PANEL_PASS   = process.env.PANEL_PASSWORD || 'changeme';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const VALID_TOKEN  = crypto.createHmac('sha256', SESSION_SECRET)
                           .update(`${PANEL_USER}:${PANEL_PASS}`)
                           .digest('hex');

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const idx = c.indexOf('=');
    if (idx > 0) cookies[c.slice(0, idx).trim()] = decodeURIComponent(c.slice(idx + 1).trim());
  });
  return cookies;
}

function requireAuth(req, res, next) {
  if (parseCookies(req).token === VALID_TOKEN) return next();
  res.redirect('/login');
}

function requireAuthApi(req, res, next) {
  if (parseCookies(req).token === VALID_TOKEN) return next();
  res.status(401).json({ ok: false, error: 'No autenticado' });
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── Login (rutas publicas) ───────────────────────────────────────────────────
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { user, password } = req.body;
  if (user === PANEL_USER && password === PANEL_PASS) {
    res.setHeader('Set-Cookie', `token=${VALID_TOKEN}; HttpOnly; Path=/; SameSite=Strict`);
    return res.redirect('/');
  }
  res.redirect('/login?error=1');
});

app.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/login');
});

// ─── Rutas protegidas ─────────────────────────────────────────────────────────
app.use(requireAuth);
app.use(express.static(path.join(__dirname, 'public')));

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
    const telefonoSheet   = (primera['TELEFONO'] || '').trim();
    const telefonoContacto = contactos[patente] || null;
    const numero          = telefonoSheet || telefonoContacto || null;

    // Si el Sheet no tiene teléfono pero el consolidado sí → programar escritura en col. P
    if (USA_SHEETS && !telefonoSheet && telefonoContacto && rowMap[patente]) {
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
  if (token === VALID_TOKEN) return next();
  next(new Error('No autenticado'));
});

io.on('connection', (socket) => socket.emit('wa_estado', { estado: waEstado }));

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\nPanel de control: http://localhost:${PORT}`);
  console.log(`Fuente de datos: ${USA_SHEETS ? 'Google Sheets' : 'archivo local CSV'}`);
  console.log(`Usuario del panel: ${PANEL_USER}\n`);
});
