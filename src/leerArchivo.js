const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const csv = require('csv-parser');

// Columnas esperadas en el archivo (índice 0 = col A)
const COLUMNAS_REQUERIDAS = ['SUBORDEN', 'DO', 'LPN', 'TRANSPORTE', 'MONTO MULTA (CLP)', 'ID DE RUTA', 'PATENTE', 'RETORNO A', 'MOTIVO NO ENTREGA', 'FECHA INICIO RUTA', 'TIPO DE FOLIO', 'RESPUESTA', 'OBSERVACION'];

function validarColumnas(encabezados) {
  const faltantes = COLUMNAS_REQUERIDAS.filter(col => !encabezados.includes(col));
  if (faltantes.length > 0) {
    throw new Error(`Columnas faltantes en el archivo: ${faltantes.join(', ')}`);
  }
}

function leerExcel(rutaArchivo) {
  const workbook = xlsx.readFile(rutaArchivo);
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  const filas = xlsx.utils.sheet_to_json(hoja, { defval: '' });

  if (filas.length === 0) {
    throw new Error('El archivo Excel está vacío o no tiene filas con datos.');
  }

  const encabezados = Object.keys(filas[0]);
  validarColumnas(encabezados);

  return filas;
}

function leerCSV(rutaArchivo) {
  return new Promise((resolve, reject) => {
    const filas = [];

    fs.createReadStream(rutaArchivo)
      .pipe(csv())
      .on('headers', (encabezados) => {
        try {
          validarColumnas(encabezados);
        } catch (err) {
          reject(err);
        }
      })
      .on('data', (fila) => filas.push(fila))
      .on('end', () => {
        if (filas.length === 0) {
          reject(new Error('El archivo CSV está vacío o no tiene filas con datos.'));
        } else {
          resolve(filas);
        }
      })
      .on('error', reject);
  });
}

async function leerArchivo() {
  const dataDir = path.join(__dirname, '..', 'data');
  const candidatos = ['devoluciones.xlsx', 'devoluciones.csv'];

  for (const nombre of candidatos) {
    const ruta = path.join(dataDir, nombre);
    if (fs.existsSync(ruta)) {
      console.log(`📂 Leyendo archivo: ${nombre}`);
      const ext = path.extname(nombre).toLowerCase();
      if (ext === '.xlsx' || ext === '.xls') {
        return leerExcel(ruta);
      } else if (ext === '.csv') {
        return await leerCSV(ruta);
      }
    }
  }

  throw new Error(
    `No se encontró el archivo de devoluciones en data/.\n` +
    `Esperado: ${candidatos.join(' o ')}`
  );
}

module.exports = { leerArchivo };
