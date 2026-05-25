const { normalizarPatente } = require('../config/contactos');

/**
 * Agrupa las filas del archivo por PATENTE normalizada (sin guiones).
 * Devuelve un Map: { 'STLD54' => [ ...filas ], 'VSSH44' => [ ...filas ], ... }
 */
function agruparPorPatente(filas) {
  const grupos = new Map();

  for (const fila of filas) {
    const patente = normalizarPatente(fila['PATENTE']);

    if (!patente) {
      console.warn('⚠️  Fila sin PATENTE ignorada:', fila);
      continue;
    }

    if (!grupos.has(patente)) {
      grupos.set(patente, []);
    }
    grupos.get(patente).push(fila);
  }

  console.log(`📊 Patentes únicas encontradas: ${grupos.size}`);
  for (const [patente, filas] of grupos.entries()) {
    console.log(`   • ${patente}: ${filas.length} folio(s)`);
  }

  return grupos;
}

module.exports = { agruparPorPatente };
