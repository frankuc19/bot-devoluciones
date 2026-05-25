require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const fs   = require('fs');

// Escribir credenciales desde variable de entorno (GitHub Actions / Render)
if (process.env.GOOGLE_CREDENTIALS_B64) {
  const credPath = path.join(__dirname, '..', 'config', 'google-credentials.json');
  fs.mkdirSync(path.dirname(credPath), { recursive: true });
  fs.writeFileSync(credPath, Buffer.from(process.env.GOOGLE_CREDENTIALS_B64, 'base64').toString('utf8'));
}

const { leerDevoluciones, escribirTelefonos, asegurarEncabezados } = require('../src/googleSheets');
const { cargarContactos, normalizarPatente }                       = require('../config/contactos');

async function main() {
  console.log('Leyendo devoluciones desde Google Sheets...');
  const registros = await leerDevoluciones();
  if (!registros.length) { console.log('Sin filas en el Sheet.'); return; }

  const tabName = registros[0].tabName;
  await asegurarEncabezados(tabName);

  console.log('Cargando contactos desde CSV...');
  const contactos = cargarContactos();
  console.log(`${registros.length} filas | ${Object.keys(contactos).length} contactos`);

  const updates = [];
  for (const r of registros) {
    const patente  = normalizarPatente(r.data['PATENTE']);
    const telefono = contactos[patente] || '';
    updates.push({ rowIndex: r.rowIndex, tabName, telefono });
  }

  const conTel = updates.filter(u => u.telefono).length;
  console.log(`Encontrados: ${conTel} / ${updates.length} patentes`);

  console.log('Escribiendo telefonos en el Sheet...');
  await escribirTelefonos(updates);
  console.log(`Listo. ${conTel} telefonos escritos en columna P.`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
