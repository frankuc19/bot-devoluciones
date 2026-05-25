# Bot Devoluciones Falabella

Panel web para notificar a conductores sobre devoluciones pendientes via WhatsApp. Lee directamente desde Google Sheets, cruza patentes con un directorio de conductores y registra el estado de envio en el mismo Sheet.

---

## Requisitos

| Requisito | Version minima |
|-----------|----------------|
| Node.js   | 18             |
| Google Chrome | instalado (macOS: automatico / Linux: ver abajo) |

**Linux:**
```bash
sudo apt install chromium-browser
```

---

## Setup en un equipo nuevo

### 1. Clonar e instalar

```bash
git clone <url-del-repo>
cd bot-devoluciones
npm install
```

### 2. Crear el archivo `.env`

```bash
cp .env.example .env
```

Editar `.env` con los valores reales:

```env
GOOGLE_SHEET_ID=<ID del Google Sheet — aparece en la URL entre /d/ y /edit>
GOOGLE_SHEET_GID=<GID de la pestana — aparece al final de la URL como #gid=XXXXXX>
GOOGLE_CREDENTIALS_PATH=./config/google-credentials.json
```

Overrides manuales de telefono (opcional, tienen prioridad sobre el CSV):
```env
PATENTE_XXXX=56912345678
```

### 3. Credenciales de Google

Copiar el archivo JSON de la Service Account en:

```
config/google-credentials.json
```

La Service Account debe tener permiso de **Editor** en el Google Sheet.

### 4. Directorio de contactos

Crear la carpeta `data/` y copiar el archivo de conductores:

```bash
mkdir -p data
```

Copiar `contactos_conductores.csv` en `data/contactos_conductores.csv`.

Columnas requeridas: `PATENTE`, `PATENTE_ORIGINAL`, `NOMBRE`, `TELEFONO`

### 5. Levantar el panel

```bash
npm run panel
```

Panel disponible en [http://localhost:3000](http://localhost:3000)

---

## Acceso publico (ngrok)

Para abrir el panel desde otro equipo o desde internet mientras corre en tu maquina:

```bash
# Instalar ngrok (una sola vez)
brew install ngrok        # Mac
# o descargar desde https://ngrok.com/download

# En otra terminal, mientras el panel esta corriendo:
ngrok http 3000
```

ngrok entrega una URL publica temporal (ej: `https://xxxx.ngrok-free.app`).

---

## Flujo de uso

1. Abrir el panel en el navegador
2. Clic en **Conectar** → escanear el QR con WhatsApp
3. Revisar la tabla: patentes con numero (listo) y sin numero (agregar manualmente)
4. Opcional: editar o quitar numeros directamente en la tabla
5. Clic en **Enviar todos** (o seleccionar patentes individuales)
6. El panel muestra el progreso en tiempo real
7. Cada fila enviada queda marcada en Google Sheets con `ENVIADO` y la fecha

---

## Estructura del proyecto

```
bot-devoluciones/
├── .env                          # Configuracion local (no subir a git)
├── .env.example                  # Plantilla
├── config/
│   ├── contactos.js              # Carga PATENTE -> telefono (CSV + .env)
│   └── google-credentials.json  # Service Account (no subir a git)
├── data/                         # Archivos locales (no subir a git)
│   └── contactos_conductores.csv
├── panel/
│   ├── server.js                 # Express + Socket.io
│   └── public/index.html         # UI del panel
├── src/
│   ├── leerArchivo.js
│   ├── agruparPorPatente.js
│   ├── generarMensaje.js
│   └── googleSheets.js
└── package.json
```

---

## Solucion de problemas

| Problema | Solucion |
|----------|----------|
| `The browser is already running` | Ejecutar: `pkill -f .wwebjs_auth && rm -f .wwebjs_auth/session/Singleton*` |
| `EADDRINUSE :::3000` | Ejecutar: `lsof -ti:3000 \| xargs kill -9` |
| `caller does not have permission` en Sheets | Compartir el Sheet con la Service Account como Editor |
| QR expira antes de escanearlo | Desconectar y volver a conectar desde el panel |
| Chrome no encontrado (Linux) | `sudo apt install chromium-browser` |
