/**
 * Formatea una celda de fecha proveniente del Excel/CSV.
 * xlsx puede devolver fechas como número serial o como string.
 */
function formatearFecha(valor) {
  if (!valor) return 'S/I';

  // Número serial de Excel → Date
  if (typeof valor === 'number') {
    const fecha = new Date(Math.round((valor - 25569) * 86400 * 1000));
    return fecha.toLocaleDateString('es-CL');
  }

  // Si ya es string, devolverlo tal cual
  return String(valor).trim();
}

function formatearMonto(valor) {
  const num = Number(String(valor).replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) return '$0';
  return `$${num.toLocaleString('es-CL')}`;
}

/**
 * Genera el texto del mensaje WhatsApp para un conductor.
 * @param {string} patente
 * @param {Array}  filas  — todas las filas del conductor
 */
function generarMensaje(patente, filas) {
  // Cabecera de la tabla
  const SEPARADOR = ' | ';
  const encabezadoTabla = ['SOC', 'LPN'].join(SEPARADOR);
  const lineaSeparadora = ['─────────', '─────────────'].join('─┼─');

  const lineasFolios = filas.map(fila => [
    String(fila['SUBORDEN'] || 'S/I').trim(),
    String(fila['LPN'] || 'S/I').trim(),
  ].join(SEPARADOR));

  // Calcular monto por folio (usar el de la primera fila como referencia)
  const montoPorFolio = Number(String(filas[0]['MONTO MULTA (CLP)'] || '0').replace(/[^0-9.-]/g, ''));
  const cantidad = filas.length;
  const montoTotal = montoPorFolio * cantidad;

  const fechaInicio = formatearFecha(filas[0]['FECHA INICIO RUTA']);

  const mensaje = [
    `Hola estimado conductor de la PPU ${patente},`,
    '',
    'Nos llegó la siguiente notificación desde Falabella de que usted tiene pendiente de devolución los siguientes folios:',
    '',
    `Fecha de inicio de ruta: ${fechaInicio}`,
    '',
    encabezadoTabla,
    lineaSeparadora,
    ...lineasFolios,
    '',
    'Si usted realizó la devolución dentro en un plazo máximo de 24 horas a bodega, favor indicar que cargó el manifiesto en la aplicación o en caso contrario favor adjuntarlo.',
    '',
    `Si usted no realizó la devolución debe asumir la multa de ${formatearMonto(montoPorFolio)} por cada folio no devuelto a tiempo.`,
    '',
    `Total de folios pendientes: ${cantidad}`,
    `Monto total estimado: ${formatearMonto(montoTotal)}`,
    '',
    'Favor responder este mensaje en un plazo máximo de 12 horas, de lo contrario se asumirá que acepta el cobro.',
  ].join('\n');

  return mensaje;
}

module.exports = { generarMensaje };
