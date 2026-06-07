function formatearMonto(valor) {
  if (!valor) return 'S/I';
  const str = String(valor).trim();
  if (str.startsWith('$')) return str;
  const num = Number(str.replace(/[^0-9.-]/g, ''));
  if (isNaN(num) || num === 0) return str || 'S/I';
  return `$${num.toLocaleString('es-CL')}`;
}

/**
 * Genera el mensaje WhatsApp para conciliaciones Falabella.
 * @param {string} ppu  patente original (con guion si aplica)
 * @param {Array}  filas  filas del conductor (objetos con campos extraídos)
 * @param {string[]} fechasRuta  fecha de ruta por fila (desde geosort o fallback)
 */
function generarMensajeConciliacion(ppu, filas, fechasRuta) {
  const SEP = '\t';

  const encabezado = [
    'MOTIVO DE COBRO', 'Fecha ruta', 'OC/RESERVA/ISO',
    'SOC', 'LPN BKS', 'SKU_DESC', 'COSTO FINAL',
  ].join(SEP);

  const lineas = filas.map((f, i) => [
    f.MOTIVO    || 'S/I',
    fechasRuta[i] || f.FECHA || 'S/I',
    f.OC        || 'S/I',
    f.SOC       || 'S/I',
    f.LPN       || 'S/I',
    f.SKU_DESC  || 'S/I',
    formatearMonto(f.COSTO),
  ].join(SEP));

  return [
    `Hola estimado conductor de la PPU ${ppu},`,
    '',
    'Nos llegó la siguiente notificación desde falabella por el cobro de el/los siguiente/s producto/s:',
    '',
    encabezado,
    ...lineas,
    '',
    'Para poder apelar estos cobros necesitamos los siguientes respaldos dependiendo del Motivo de cobro:',
    '',
    '1. Cliente desconoce entrega: Fotografías de simple route en el que se cumpla con el protocolo de entrega (Foto fachada del domicilio, foto del folio y foto de interacción con el cliente).',
    '2. Cliente desconoce entrega parcial: Fotografías de simpli route en el que se cumpla con el protocolo de entrega (Foto fachada del domicilio, foto del folio y foto de interacción con el cliente).',
    '3. Dañado: Fotografía de simpli route en la que se aprecie que el folio no presentaba daños al momento de la entrega y que sus sellos no se encontraban adulterados.',
    '4. Extraviado: Foto de la TIM firmada por tienda y manifiesto de Backstore que acredite el pistoleo del folio consultado.',
    '5. Pendiente LI: Manifiesto de devolución con una fecha máxima de 5 días desde que inició la ruta.',
    '',
    'Favor responder este mensaje en un plazo máximo de 24 horas, de lo contrario se asumirá que acepta el cobro.',
  ].join('\n');
}

module.exports = { generarMensajeConciliacion };
