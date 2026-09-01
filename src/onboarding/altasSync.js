const crypto = require('crypto');
const { leerAltasOB } = require('./altasSheet');
const store = require('./altasStore');

function esAlta(estado) {
  // \b evita falsos positivos con palabras que empiecen igual (p.ej. "Altamar"),
  // pero "Alta", "ALTA", "Alta " o "Alta - pendiente firma" sí califican.
  return /^\s*alta\b/i.test(estado || '');
}

/**
 * Sincroniza "Consolidado Altas OB" hacia la sección Altas Onboarding.
 * Solo crea personas con Estatus "Alta"; nunca duplica por RUT — si ya
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

  const altas = filas.filter(f => esAlta(f.estado));
  const duplicados = [];
  let creados = 0;

  for (const fila of altas) {
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
    altas: altas.length,
    creados,
    duplicados,
    // Muestra de valores de Estado/Estatus tal como vienen en la hoja —
    // ayuda a diagnosticar cuando "altas" da 0 (p.ej. la hoja dice
    // "Alta " con algo raro, o la columna viene vacía).
    estadosEncontrados: [...new Set(filas.map(f => f.estado).filter(Boolean))].slice(0, 20),
  };
  store.addSyncLog(resultado);
  console.log(`[Altas OB] Sincronización: ${creados} nuevo(s), ${duplicados.length} duplicado(s) (de ${altas.length} con estatus "Alta" / ${filas.length} filas leídas)`);
  return resultado;
}

module.exports = { sincronizarAltasOB, esAlta };
