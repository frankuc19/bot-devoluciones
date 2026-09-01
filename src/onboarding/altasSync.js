const crypto = require('crypto');
const { leerAltasOB } = require('./altasSheet');
const store = require('./altasStore');

/**
 * Sincroniza "Consolidado Altas OB" hacia la sección Altas Onboarding.
 * Crea a todas las personas de la hoja; nunca duplica por RUT — si ya
 * existe, lo registra como alerta en vez de crear un segundo registro.
 */
async function sincronizarAltasOB() {
  let filas;
  try {
    filas = await leerAltasOB();
  } catch (e) {
    const resultado = {
      id: crypto.randomUUID(),
      ejecutadoAt: new Date().toISOString(),
      ok: false,
      error: e.message,
    };
    store.addSyncLog(resultado);
    console.error('[Altas OB] Error al leer la planilla:', e.message);
    return resultado;
  }

  const duplicados = [];
  let creados = 0;

  for (const fila of filas) {
    const existente = store.getAltaByRutKey(fila.rutKey);
    if (existente) {
      duplicados.push({ rut: fila.rut, nombre: fila.nombre });
      continue;
    }
    store.saveAlta({
      id: crypto.randomUUID(),
      nombre: fila.nombre,
      rut: fila.rut,
      rutKey: fila.rutKey,
      celular: fila.celular,
      cliente: fila.cliente,
      salaBodega: fila.salaBodega,
      tipoAuto: fila.tipoAuto,
      fechaAlta: fila.fechaAlta,
      estado: fila.estado,
      origen: 'sheet',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    creados++;
  }

  const resultado = {
    id: crypto.randomUUID(),
    ejecutadoAt: new Date().toISOString(),
    ok: true,
    totalFilasLeidas: filas.length,
    creados,
    duplicados,
  };
  store.addSyncLog(resultado);
  console.log(`[Altas OB] Sincronización: ${creados} nuevo(s), ${duplicados.length} duplicado(s) (de ${filas.length} filas leídas)`);
  return resultado;
}

module.exports = { sincronizarAltasOB };
