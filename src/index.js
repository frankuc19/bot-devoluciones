require('dotenv').config();

const readline = require('readline');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const { leerArchivo } = require('./leerArchivo');
const { agruparPorPatente } = require('./agruparPorPatente');
const { generarMensaje } = require('./generarMensaje');
const { enviarMensajes } = require('./enviarMensajes');
const { cargarContactos } = require('../config/contactos');

const MODO_PREVIEW = process.argv.includes('--preview');

// ─── Helpers ────────────────────────────────────────────────────────────────

function preguntarConsola(pregunta) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(pregunta, respuesta => {
    rl.close();
    resolve(respuesta.trim().toLowerCase());
  }));
}

/**
 * Prepara el array de {patente, numero, mensaje} sin depender de WhatsApp.
 */
async function prepararMensajes() {
  const filas = await leerArchivo();
  const grupos = agruparPorPatente(filas);
  const contactos = cargarContactos();

  const mensajes = [];
  for (const [patente, filasPatente] of grupos.entries()) {
    mensajes.push({
      patente,
      numero: contactos[patente] || null,
      mensaje: generarMensaje(patente, filasPatente),
    });
  }
  return mensajes;
}

// ─── Modo Preview ────────────────────────────────────────────────────────────

async function ejecutarPreview() {
  console.log('👁️  MODO PREVIEW — no se conectará a WhatsApp\n');

  let mensajes;
  try {
    mensajes = await prepararMensajes();
  } catch (err) {
    console.error(`\n❌ Error al preparar mensajes: ${err.message}`);
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(60));
  for (const { patente, numero, mensaje } of mensajes) {
    console.log(`\n📋 PATENTE: ${patente}  |  Número: ${numero ?? '⚠️  SIN NÚMERO'}`);
    console.log('─'.repeat(60));
    console.log(mensaje);
    console.log('═'.repeat(60));
  }

  console.log(`\n✅ ${mensajes.length} mensaje(s) listos para envío.`);
  console.log('   Ejecuta sin --preview para enviarlos por WhatsApp.\n');
}

// ─── Modo Envío ──────────────────────────────────────────────────────────────

async function ejecutarEnvio() {
  let mensajes;
  try {
    mensajes = await prepararMensajes();
  } catch (err) {
    console.error(`\n❌ Error al preparar mensajes: ${err.message}`);
    process.exit(1);
  }

  if (mensajes.length === 0) {
    console.log('ℹ️  No hay mensajes para enviar.');
    process.exit(0);
  }

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('📱 Escanea el código QR con WhatsApp');
  });

  client.on('loading_screen', (percent, message) => {
    process.stdout.write(`\r⏳ Cargando WhatsApp... ${percent}% — ${message}   `);
  });

  client.on('authenticated', () => {
    console.log('\n🔐 Sesión autenticada');
  });

  client.on('auth_failure', (msg) => {
    console.error(`\n❌ Error de autenticación: ${msg}`);
    process.exit(1);
  });

  client.on('disconnected', (reason) => {
    console.warn(`\n⚠️  WhatsApp desconectado: ${reason}`);
  });

  client.on('ready', async () => {
    console.log('\n✅ WhatsApp conectado\n');

    console.log(`📋 Se enviarán mensajes a ${mensajes.length} patente(s):`);
    for (const { patente, numero } of mensajes) {
      console.log(`   • ${patente} → ${numero ?? '⚠️  SIN NÚMERO'}`);
    }

    const respuesta = await preguntarConsola('\n¿Enviar mensajes? (s/n): ');
    if (respuesta !== 's') {
      console.log('🚫 Envío cancelado por el usuario.');
      await client.destroy();
      process.exit(0);
    }

    await enviarMensajes(client, mensajes);
    await client.destroy();
    process.exit(0);
  });

  console.log('🔌 Iniciando WhatsApp...\n');
  client.initialize();
}

// ─── Entry point ─────────────────────────────────────────────────────────────

if (MODO_PREVIEW) {
  ejecutarPreview();
} else {
  ejecutarEnvio();
}
