const fs = require('fs');
const path = require('path');

const DELAY_ENTRE_MENSAJES_MS = 5000;
const MAX_REINTENTOS = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function obtenerRutaLog() {
  const hoy = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(__dirname, '..', 'data', `log_envios_${hoy}.txt`);
}

function escribirLog(linea) {
  const rutaLog = obtenerRutaLog();
  const timestamp = new Date().toLocaleString('es-CL');
  fs.appendFileSync(rutaLog, `[${timestamp}] ${linea}\n`, 'utf8');
}

/**
 * Envía un mensaje con reintentos ante fallos transitorios.
 */
async function enviarConReintentos(client, chatId, mensaje, intentos = MAX_REINTENTOS) {
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      await client.sendMessage(chatId, mensaje);
      return;
    } catch (err) {
      if (intento === intentos) throw err;
      console.warn(`   ↩️  Reintento ${intento}/${intentos - 1} para ${chatId}...`);
      await sleep(3000 * intento);
    }
  }
}

/**
 * Envía todos los mensajes generados, uno por uno con delay.
 *
 * @param {import('whatsapp-web.js').Client} client
 * @param {Array<{patente, numero, mensaje}>} mensajes
 */
async function enviarMensajes(client, mensajes) {
  console.log(`\n📤 Iniciando envío de ${mensajes.length} mensaje(s)...\n`);

  let enviados = 0;
  let fallidos = 0;

  for (const { patente, numero, mensaje } of mensajes) {
    if (!numero) {
      const aviso = `⚠️  No se encontró número para PATENTE ${patente} — mensaje NO enviado`;
      console.log(aviso);
      escribirLog(`[NO ENVIADO] ${patente} — sin número registrado`);
      fallidos++;
      continue;
    }

    const chatId = `${numero}@c.us`;

    try {
      await enviarConReintentos(client, chatId, mensaje);
      const ok = `✅ Mensaje enviado a PATENTE ${patente} (${numero})`;
      console.log(ok);
      escribirLog(`[OK] ${patente} → ${numero}`);
      enviados++;
    } catch (err) {
      const error = `❌ Error al enviar a PATENTE ${patente} (${numero}): ${err.message}`;
      console.error(error);
      escribirLog(`[ERROR] ${patente} → ${numero} — ${err.message}`);
      fallidos++;
    }

    // Esperar entre mensajes para evitar bloqueos de WhatsApp
    await sleep(DELAY_ENTRE_MENSAJES_MS);
  }

  console.log(`\n─────────────────────────────────`);
  console.log(`📊 Resumen:`);
  console.log(`   ✅ Enviados:  ${enviados}`);
  console.log(`   ❌ Fallidos:  ${fallidos}`);
  console.log(`   📄 Log guardado en: ${obtenerRutaLog()}`);
}

module.exports = { enviarMensajes };
