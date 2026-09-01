const crypto = require('crypto');
const { leerAltasOB } = require('./altasSheet');
const store = require('./altasStore');

function esActivo(estado) {
  // OJO: "Inactivo" contiene la subcadena "activ" — por eso se exige que
  // la palabra empiece con "activ" (permitiendo espacios adelante), lo que
  // excluye cualquier variante de "Inactivo/Inactiva".
  return /^\s*activ/i.test(estado || '');
}

/**
 * Sincroniza "Consolidado Altas OB" hacia la sección Altas Onboarding.
 * Solo crea personas con estado "activo"; nunca duplica por RUT — si ya
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

  const activos = filas.filter(f => esActivo(f.estado));
  const duplicados = [];
  let creados = 0;

  for (const fila of activos) {
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
    activos: activos.length,
    creados,
    duplicados,
  };
  store.addSyncLog(resultado);
  console.log(`[Altas OB] Sincronización: ${creados} nuevo(s), ${duplicados.length} duplicado(s) (de ${activos.length} activos / ${filas.length} filas leídas)`);
  return resultado;
}

module.exports = { sincronizarAltasOB, esActivo };
