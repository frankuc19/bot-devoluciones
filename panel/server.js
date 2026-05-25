require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const QRCode     = require('qrcode');
const path       = require('path');
const fs         = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');

const ENV_PATH = path.join(__dirname, '..', '.env');

const { leerArchivo }                              = require('../src/leerArchivo');
const { agruparPorPatente }                        = require('../src/agruparPorPatente');
const { generarMensaje }                           = require('../src/generarMensaje');
const { cargarContactos, cargarNombres }            = require('../config/contactos');
const { leerDevoluciones, marcarFilas,
        asegurarEncabezados }                      = require('../src/googleSheets');

const DELAY_MS = 5000;
const PORT     = 3000;
const USA_SHEETS = !!process.env.GOOGLE_SHEET_ID;

// ─── Express ──────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Estado global ────────────────────────────────────────────────────────────
let waClient = null;
let waEstado = 'desconectado';
// mensajes: [{ patente, numero, folios, monto, mensaje, rowIndices, tabName }]
let mensajes = [];

// ─── Cargar datos (Google Sheets o CSV local) ─────────────────────────────────
async function cargarDatos() {
  const contactos = cargarContactos();
  const nombres   = cargarNombres();
  let filas, rowMap = {}; // rowMap: patente → [rowIndices en el Sheet]

  if (USA_SHEETS) {
    // Leer desde Google Sheets y asegurar encabezados de estado
    const registros = await leerDevoluciones();
    filas = registros.map(r => r.data);

    // Construir mapa patente → rowIndices
    const { normalizarPatente } = require('../config/contactos');
    for (const r of registros) {
      const p = normalizarPatente(r.data['PATENTE']);
      if (!rowMap[p]) rowMap[p] = { indices: [], tabName: r.tabName };
      rowMap[p].indices.push(r.rowIndex);
    }

    // Asegurar encabezados ESTADO_WHATSAPP / FECHA_ENVIO en la primera fila
    const tabName = registros[0]?.tabName;
    if (tabName) await asegurarEncabezados(tabName).catch(() => {});

    console.log(`Datos leidos desde Google Sheets (${filas.length} filas)`);
  } else {
    filas = await leerArchivo();
    console.log(`Datos leidos desde archivo local`);
  }

  const grupos = agruparPorPatente(filas);
  mensajes = [];

  for (const [patente, filasPatente] of grupos.entries()) {
    const numero  = contactos[patente] || null;
    const primera = filasPatente[0];
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

  return mensajes;
}

// ─── API REST ─────────────────────────────────────────────────────────────────
app.get('/api/datos', async (req, res) => {
  try {
    const datos = await cargarDatos();
    res.json({ ok: true, datos, waEstado, usaSheets: USA_SHEETS });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.get('/api/mensaje/:patente', (req, res) => {
  const item = mensajes.find(m => m.patente === req.params.patente);
  if (!item) return res.json({ ok: false, error: 'Patente no encontrada' });
  res.json({ ok: true, mensaje: item.mensaje, patente: item.patente, numero: item.numero });
});

app.post('/api/whatsapp/conectar', (req, res) => {
  if (waEstado === 'listo') return res.json({ ok: true, estado: 'ya conectado' });
  iniciarWhatsApp();
  res.json({ ok: true, estado: 'iniciando' });
});

app.post('/api/whatsapp/desconectar', async (req, res) => {
  if (waClient) {
    await waClient.destroy().catch(() => {});
    waClient = null;
    waEstado = 'desconectado';
    io.emit('wa_estado', { estado: 'desconectado' });
  }
  res.json({ ok: true });
});

// Guarda número manual en .env
app.post('/api/contactos/manual', async (req, res) => {
  const { patente, telefono } = req.body || {};
  if (!patente) return res.json({ ok: false, error: 'Patente requerida' });
  const tel = String(telefono || '').replace(/[+\s\-]/g, '');
  if (!/^\d{10,15}$/.test(tel))
    return res.json({ ok: false, error: 'Número inválido — usa formato 56912345678' });
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

// Elimina override manual del .env
app.delete('/api/contactos/manual/:patente', async (req, res) => {
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

app.post('/api/enviar', async (req, res) => {
  const { patentes } = req.body;
  if (waEstado !== 'listo') return res.json({ ok: false, error: 'WhatsApp no conectado' });
  const lista = patentes?.length > 0
    ? mensajes.filter(m => patentes.includes(m.patente))
    : mensajes;
  res.json({ ok: true, total: lista.length });
  enviarConProgreso(lista);
});

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
function iniciarWhatsApp() {
  if (waEstado !== 'desconectado') return;
  waEstado = 'conectando';
  io.emit('wa_estado', { estado: 'conectando' });

  waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '..', '.wwebjs_auth') }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  });

  waClient.on('qr', async (qr) => {
    waEstado = 'qr';
    io.emit('wa_estado', { estado: 'qr', qr: await QRCode.toDataURL(qr) });
  });
  waClient.on('loading_screen', (p) => io.emit('wa_estado', { estado: 'conectando', progreso: p }));
  waClient.on('authenticated',  ()  => io.emit('wa_estado', { estado: 'autenticado' }));
  waClient.on('ready', () => {
    waEstado = 'listo';
    io.emit('wa_estado', { estado: 'listo' });
    console.log('WhatsApp listo');
  });
  waClient.on('disconnected', () => {
    waEstado = 'desconectado'; waClient = null;
    io.emit('wa_estado', { estado: 'desconectado' });
  });
  waClient.on('auth_failure', (msg) => {
    waEstado = 'desconectado'; waClient = null;
    io.emit('wa_estado', { estado: 'error', msg });
  });
  waClient.initialize();
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function limpiarArchivosLocales() {
  const DATA_DIR = path.join(__dirname, '..', 'data');
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
  let esEnvioTotal = lista.length === mensajes.length; // true si es "enviar todos"

  for (let i = 0; i < lista.length; i++) {
    const { patente, numero, mensaje, rowIndices, tabName } = lista[i];

    if (!numero) {
      io.emit('envio_log', { patente, ok: false, msg: 'Sin número — no enviado', i: i + 1, total: lista.length });
      if (USA_SHEETS && rowIndices.length && tabName) {
        marcarFilas(tabName, rowIndices, 'SIN NÚMERO').catch(e =>
          console.error(`No se pudo marcar Sheet para ${patente}:`, e.message));
      }
      continue;
    }

    try {
      await waClient.sendMessage(`${numero}@c.us`, mensaje);
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

  // Eliminar archivos locales solo si fue un envío total y se envió al menos uno
  if (esEnvioTotal && enviados > 0) {
    limpiarArchivosLocales();
  }
}

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => socket.emit('wa_estado', { estado: waEstado }));

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\nPanel de control: http://localhost:${PORT}`);
  console.log(`Fuente de datos: ${USA_SHEETS ? 'Google Sheets' : 'archivo local CSV'}\n`);
});
