const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');

const TIENDAS_FILE  = path.join(DATA_DIR, 'turnos_tiendas.json');
const SLOTS_FILE     = path.join(DATA_DIR, 'turnos_slots.json');
const ASIG_FILE       = path.join(DATA_DIR, 'turnos_asignaciones.json');
const KARRIERS_FILE  = path.join(DATA_DIR, 'turnos_karriers.json');
const SETTINGS_FILE  = path.join(DATA_DIR, 'turnos_settings.json');
const SEED_MARKER_FILE = path.join(DATA_DIR, 'turnos_seed_v1.json');
const ASISTENCIA_FILE   = path.join(DATA_DIR, 'turnos_asistencia.json');
const OBSERVACIONES_FILE = path.join(DATA_DIR, 'turnos_observaciones.json');

const SHIFT_TYPES = {
  AM:   { code: 'AM',   name: 'Mañana',   startTime: '08:00', endTime: '14:00' },
  PM:   { code: 'PM',   name: 'Tarde',    startTime: '14:00', endTime: '20:00' },
  FULL: { code: 'FULL', name: 'Jornada completa', startTime: '08:00', endTime: '20:00' },
};

const DEFAULT_SETTINGS = {
  weekStartsMonday:        true,
  allowAmPmSameDay:        true,
  allowCancellation:       true,
  minimumCoverageWarning:  80,
  minimumCoverageTarget:   95,
};

// Tiendas reales (código, nombre, comuna) — se reconcilian UNA SOLA VEZ (la
// primera vez que corre esta versión del código): si el código no existe
// todavía en turnos_tiendas.json se agrega, sin tocar ni duplicar tiendas que
// el usuario ya haya creado o editado. Después de esa primera vez queda
// marcado como aplicado (turnos_seed_v1.json) y nunca se vuelve a repetir —
// si el admin borra una de estas tiendas más adelante, se queda borrada.
const SEED_TIENDAS = [
  { code: '35',  name: 'Walmart Rancagua',        commune: 'Rancagua' },
  { code: '54',  name: 'LIDER Vicuña Mackenna',   commune: 'La Florida' },
  { code: '79',  name: 'Walmart Talca',           commune: 'Talca' },
  { code: '127', name: 'Walmart Linares',         commune: 'Linares' },
  { code: '518', name: 'Walmart Valparaiso',      commune: 'Valparaíso' },
  { code: '612', name: 'Walmart Chillan',         commune: 'Chillán' },
  { code: '632', name: 'Walmart Viña Centro',     commune: 'Viña del Mar' },
];

function tiendaDesdeSeed(seed) {
  return {
    id: crypto.randomUUID(),
    name: seed.name,
    code: seed.code,
    address: '',
    commune: seed.commune,
    region: '',
    active: true,
    capacity: { AM: 30, PM: 30, FULL: 20 },
    createdAt: new Date().toISOString(),
  };
}

function ensureSeedTiendas(list) {
  if (readJson(SEED_MARKER_FILE, null) !== null) return list; // ya se aplicó — no repetir

  const codigosExistentes = new Set(list.map(t => t.code));
  const faltantes = SEED_TIENDAS.filter(s => !codigosExistentes.has(s.code)).map(tiendaDesdeSeed);
  const actualizada = faltantes.length ? [...list, ...faltantes] : list;
  if (faltantes.length) writeJson(TIENDAS_FILE, actualizada);
  writeJson(SEED_MARKER_FILE, { appliedAt: new Date().toISOString() });
  return actualizada;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  ensureDir();
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJson(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ─── Tiendas ──────────────────────────────────────────────────────────────────
function getTiendas() {
  const list = readJson(TIENDAS_FILE, null);
  if (list === null) {
    const seeded = SEED_TIENDAS.map(tiendaDesdeSeed);
    writeJson(TIENDAS_FILE, seeded);
    writeJson(SEED_MARKER_FILE, { appliedAt: new Date().toISOString() });
    return seeded;
  }
  return ensureSeedTiendas(list);
}
function getTiendaById(id) { return getTiendas().find(t => t.id === id) || null; }
function saveTienda(tienda) {
  const list = getTiendas();
  const idx = list.findIndex(t => t.id === tienda.id);
  if (idx >= 0) list[idx] = tienda; else list.push(tienda);
  writeJson(TIENDAS_FILE, list);
  return tienda;
}
// Elimina la tienda y sus turnos planificados. Se niega si hay Karriers con
// una asignación ACTIVA en esa tienda, para no borrarles el turno sin avisar
// — hay que cancelarlos primero (o desactivar la tienda en vez de eliminarla).
function deleteTienda(id) {
  const slotsTienda = getSlots().filter(s => s.storeId === id);
  const slotIds = new Set(slotsTienda.map(s => s.id));
  const tieneActivas = getAsignaciones().some(a => a.status === 'ACTIVE' && slotIds.has(a.slotId));
  if (tieneActivas) throw err('STORE_HAS_ACTIVE_ASSIGNMENTS');

  writeJson(TIENDAS_FILE, getTiendas().filter(t => t.id !== id));
  writeJson(SLOTS_FILE, getSlots().filter(s => s.storeId !== id));
  writeJson(ASIG_FILE, getAsignaciones().filter(a => !slotIds.has(a.slotId)));
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function getSettings() {
  const s = readJson(SETTINGS_FILE, null);
  if (s === null) { writeJson(SETTINGS_FILE, DEFAULT_SETTINGS); return DEFAULT_SETTINGS; }
  return { ...DEFAULT_SETTINGS, ...s };
}
function saveSettings(partial) {
  const merged = { ...getSettings(), ...partial };
  writeJson(SETTINGS_FILE, merged);
  return merged;
}

// ─── Karriers (registro de prestadores) ────────────────────────────────────────
function getKarriers() { return readJson(KARRIERS_FILE, []); }
function getKarrierByRut(rut) { return getKarriers().find(k => k.rut === rut) || null; }
function saveKarrier(karrier) {
  const list = getKarriers();
  const idx = list.findIndex(k => k.rut === karrier.rut);
  if (idx >= 0) list[idx] = karrier; else list.push(karrier);
  writeJson(KARRIERS_FILE, list);
  return karrier;
}
function deleteKarrier(rut) {
  writeJson(KARRIERS_FILE, getKarriers().filter(k => k.rut !== rut));
}
function ensureKarrier(rut, name, phone) {
  let k = getKarrierByRut(rut);
  if (!k) {
    k = { rut, name: name || rut, phone: phone || '', status: 'ACTIVE', createdAt: new Date().toISOString() };
    saveKarrier(k);
  }
  return k;
}

// ─── Slots (disponibilidad de turnos) ──────────────────────────────────────────
function getSlots() { return readJson(SLOTS_FILE, []); }
function getSlotById(id) { return getSlots().find(s => s.id === id) || null; }
function saveSlot(slot) {
  const list = getSlots();
  const idx = list.findIndex(s => s.id === slot.id);
  if (idx >= 0) list[idx] = slot; else list.push(slot);
  writeJson(SLOTS_FILE, list);
  return slot;
}
function deleteSlot(id) {
  writeJson(SLOTS_FILE, getSlots().filter(s => s.id !== id));
  writeJson(ASIG_FILE, getAsignaciones().filter(a => a.slotId !== id));
}

function createSlot({ storeId, shiftType, date, capacity }) {
  const tipo = SHIFT_TYPES[shiftType];
  if (!tipo) throw new Error('Tipo de turno inválido');
  const slot = {
    id: crypto.randomUUID(),
    storeId,
    shiftType,
    date, // YYYY-MM-DD
    startTime: tipo.startTime,
    endTime: tipo.endTime,
    capacity: Number(capacity) || 0,
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  };
  return saveSlot(slot);
}

// Crea (o completa) los 7 días x 3 turnos de una tienda para la semana que contiene weekStartDate
function generarSemana(storeId, weekStartDate) {
  const tienda = getTiendaById(storeId);
  if (!tienda) throw new Error('Tienda no encontrada');
  const existentes = getSlots().filter(s => s.storeId === storeId);
  const creados = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartDate + 'T00:00:00');
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    for (const tipo of ['AM', 'PM', 'FULL']) {
      const ya = existentes.find(s => s.date === dateStr && s.shiftType === tipo);
      if (ya) continue;
      creados.push(createSlot({ storeId, shiftType: tipo, date: dateStr, capacity: tienda.capacity?.[tipo] ?? 0 }));
    }
  }
  return creados;
}

// ─── Asignaciones (toma de turnos) ─────────────────────────────────────────────
function getAsignaciones() { return readJson(ASIG_FILE, []); }
function getAsignacionById(id) { return getAsignaciones().find(a => a.id === id) || null; }
function saveAsignacion(a) {
  const list = getAsignaciones();
  const idx = list.findIndex(x => x.id === a.id);
  if (idx >= 0) list[idx] = a; else list.push(a);
  writeJson(ASIG_FILE, list);
  return a;
}

function asignacionesActivasDeSlot(slotId) {
  return getAsignaciones().filter(a => a.slotId === slotId && a.status === 'ACTIVE');
}

function cuposDisponibles(slot) {
  return Math.max(0, slot.capacity - asignacionesActivasDeSlot(slot.id).length);
}

// Serializa las tomas de turno para evitar sobreasignación por condiciones de carrera
let colaEscritura = Promise.resolve();
function conBloqueo(fn) {
  const resultado = colaEscritura.then(fn, fn);
  colaEscritura = resultado.catch(() => {});
  return resultado;
}

const ERRORES = {
  SHIFT_FULL:            'Este turno ya no tiene cupos disponibles.',
  SHIFT_NOT_FOUND:       'El turno no existe.',
  SHIFT_CLOSED:          'Este turno no está disponible.',
  SHIFT_ALREADY_TAKEN:   'Ya tienes este turno tomado.',
  INVALID_STORE:         'Tienda inválida.',
  USER_INACTIVE:         'Tu cuenta de Karrier está inactiva. Contacta a operaciones.',
  INVALID_DATE:          'No puedes tomar turnos de fechas pasadas.',
  CONFLICT_AM_FULL:      'Ya tienes un turno AM ese día: no puedes tomar también FULL.',
  CONFLICT_PM_FULL:      'Ya tienes un turno PM ese día: no puedes tomar también FULL.',
  CONFLICT_FULL:         'Ya tienes un turno FULL ese día: no puedes tomar otro turno.',
  CONFLICT_AM_PM:        'No está permitido tomar AM y PM el mismo día.',
  ASSIGNMENT_NOT_FOUND:  'La asignación no existe.',
  NOT_YOUR_SHIFT:        'Este turno no te pertenece.',
  ALREADY_CANCELLED:     'Este turno ya estaba cancelado.',
  CANCELLATION_DISABLED: 'Las cancelaciones están deshabilitadas. Contacta a operaciones para cancelar tu turno.',
  EMPTY_OBSERVATION:     'La observación no puede estar vacía.',
  STORE_HAS_ACTIVE_ASSIGNMENTS: 'Esta tienda tiene Karriers con turnos activos. Cancela esas asignaciones o desactiva la tienda en vez de eliminarla.',
};

function err(code) {
  const e = new Error(ERRORES[code] || code);
  e.code = code;
  return e;
}

// Valida las reglas de negocio y crea la asignación. `excludeAssignmentId` se
// usa al reasignar: ignora la asignación que se está moviendo al revisar
// conflictos del propio Karrier ese día (si no, chocaría consigo misma).
function _validarYCrearAsignacion(slotId, rut, excludeAssignmentId) {
  const karrier = getKarrierByRut(rut);
  if (!karrier) throw err('INVALID_STORE'); // no debería pasar: el caller registra antes
  if (karrier.status !== 'ACTIVE') throw err('USER_INACTIVE');

  const slot = getSlotById(slotId);
  if (!slot) throw err('SHIFT_NOT_FOUND');
  if (slot.status !== 'OPEN') throw err('SHIFT_CLOSED');
  if (slot.date < new Date().toISOString().slice(0, 10)) throw err('INVALID_DATE');
  if (cuposDisponibles(slot) <= 0) throw err('SHIFT_FULL');

  const misAsignaciones = getAsignaciones()
    .filter(a => a.karrierRut === rut && a.status === 'ACTIVE' && a.id !== excludeAssignmentId);
  if (misAsignaciones.some(a => a.slotId === slotId)) throw err('SHIFT_ALREADY_TAKEN');

  const misSlotsHoy = misAsignaciones
    .map(a => getSlotById(a.slotId))
    .filter(s => s && s.date === slot.date);
  const tiposHoy = new Set(misSlotsHoy.map(s => s.shiftType));

  const settings = getSettings();
  if (slot.shiftType === 'FULL' && (tiposHoy.has('AM') || tiposHoy.has('PM') || tiposHoy.has('FULL'))) {
    if (tiposHoy.has('AM')) throw err('CONFLICT_AM_FULL');
    if (tiposHoy.has('PM')) throw err('CONFLICT_PM_FULL');
    throw err('CONFLICT_FULL');
  }
  if (tiposHoy.has('FULL')) throw err('CONFLICT_FULL');
  if (slot.shiftType === 'AM' && tiposHoy.has('PM') && !settings.allowAmPmSameDay) throw err('CONFLICT_AM_PM');
  if (slot.shiftType === 'PM' && tiposHoy.has('AM') && !settings.allowAmPmSameDay) throw err('CONFLICT_AM_PM');

  const asignacion = {
    id: crypto.randomUUID(),
    slotId,
    karrierRut: rut,
    karrierName: karrier.name,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    cancelledAt: null,
    cancellationReason: null,
  };
  saveAsignacion(asignacion);
  return asignacion;
}

function tomarTurno(slotId, rut) {
  return conBloqueo(async () => _validarYCrearAsignacion(slotId, rut));
}

function cancelarTurno(assignmentId, rut, { isAdmin = false, reason = '' } = {}) {
  return conBloqueo(async () => {
    const asignacion = getAsignacionById(assignmentId);
    if (!asignacion) throw err('ASSIGNMENT_NOT_FOUND');
    if (!isAdmin && asignacion.karrierRut !== rut) throw err('NOT_YOUR_SHIFT');
    // La restricción de "permitir cancelación" es para que el Karrier cancele
    // su propio turno; operaciones (isAdmin) siempre puede, desde Asignaciones.
    if (!isAdmin && !getSettings().allowCancellation) throw err('CANCELLATION_DISABLED');
    if (asignacion.status === 'CANCELLED') throw err('ALREADY_CANCELLED');
    asignacion.status = 'CANCELLED';
    asignacion.cancelledAt = new Date().toISOString();
    asignacion.cancellationReason = reason || null;
    saveAsignacion(asignacion);
    return asignacion;
  });
}

// Mueve a un Karrier de su turno actual a otro turno (mismo u otro día/tienda),
// validando las mismas reglas de negocio que tomarTurno. Uso administrativo.
function reasignarTurno(assignmentId, newSlotId) {
  return conBloqueo(async () => {
    const actual = getAsignacionById(assignmentId);
    if (!actual) throw err('ASSIGNMENT_NOT_FOUND');
    if (actual.status !== 'ACTIVE') throw err('ALREADY_CANCELLED');
    if (actual.slotId === newSlotId) return actual;

    const nueva = _validarYCrearAsignacion(newSlotId, actual.karrierRut, actual.id);

    actual.status = 'CANCELLED';
    actual.cancelledAt = new Date().toISOString();
    actual.cancellationReason = 'Reasignado por operaciones';
    saveAsignacion(actual);

    return nueva;
  });
}

// ─── Consultas agregadas ────────────────────────────────────────────────────────
function slotConInfo(slot) {
  const activas = asignacionesActivasDeSlot(slot.id);
  return {
    ...slot,
    taken: activas.length,
    available: Math.max(0, slot.capacity - activas.length),
    coverage: slot.capacity > 0 ? Math.round((activas.length / slot.capacity) * 100) : 0,
  };
}

function disponibilidadTienda(storeId, weekStartDate) {
  const weekEnd = (() => {
    const d = new Date(weekStartDate + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  })();
  return getSlots()
    .filter(s => s.storeId === storeId && s.date >= weekStartDate && s.date <= weekEnd)
    .map(slotConInfo)
    .sort((a, b) => (a.date + a.shiftType).localeCompare(b.date + b.shiftType));
}

function misTurnos(rut) {
  const asigs = getAsignaciones().filter(a => a.karrierRut === rut);
  return asigs
    .map(a => {
      const slot = getSlotById(a.slotId);
      if (!slot) return null;
      const tienda = getTiendaById(slot.storeId);
      return { ...a, slot, tienda };
    })
    .filter(Boolean)
    .sort((a, b) => a.slot.date.localeCompare(b.slot.date));
}

// Lista asignaciones (tomas de turno) con datos de tienda/slot embebidos,
// para la pantalla administrativa de "Asignaciones".
function listAsignaciones({ storeId, weekStartDate, status } = {}) {
  const weekEnd = weekStartDate ? (() => {
    const d = new Date(weekStartDate + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  })() : null;

  return getAsignaciones()
    .map(a => {
      const slot = getSlotById(a.slotId);
      if (!slot) return null;
      const tienda = getTiendaById(slot.storeId);
      return { ...a, slot, tienda };
    })
    .filter(Boolean)
    .filter(a => !storeId || a.slot.storeId === storeId)
    .filter(a => !weekStartDate || (a.slot.date >= weekStartDate && a.slot.date <= weekEnd))
    .filter(a => !status || a.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function coberturaTienda(storeId, weekStartDate) {
  return disponibilidadTienda(storeId, weekStartDate);
}

function coberturaGeneral(weekStartDate, storeIdFiltro) {
  const tiendas = getTiendas().filter(t => !storeIdFiltro || t.id === storeIdFiltro);
  const filas = [];
  for (const tienda of tiendas) {
    const slots = disponibilidadTienda(tienda.id, weekStartDate);
    for (const s of slots) filas.push({ ...s, storeName: tienda.name });
  }
  const totales = filas.reduce((acc, f) => {
    acc.requeridos += f.capacity;
    acc.tomados += f.taken;
    acc.disponibles += f.available;
    return acc;
  }, { requeridos: 0, tomados: 0, disponibles: 0 });
  const coberturaGlobal = totales.requeridos > 0 ? Math.round((totales.tomados / totales.requeridos) * 100) : 0;
  return { filas, totales: { ...totales, coberturaGlobal } };
}

function dashboardKpis(weekStartDate) {
  const karriersActivos = getKarriers().filter(k => k.status === 'ACTIVE').length;
  const asignacionesActivas = getAsignaciones().filter(a => a.status === 'ACTIVE').length;
  const { totales } = coberturaGeneral(weekStartDate);
  const tiendasActivas = getTiendas().filter(t => t.active).length;
  return {
    karriersActivos,
    turnosTomados: asignacionesActivas,
    cobertura: totales.coberturaGlobal,
    deficit: Math.max(0, totales.requeridos - totales.tomados),
    tiendasActivas,
  };
}

// ─── Asistencia ─────────────────────────────────────────────────────────────
// Un registro de asistencia por asignación (una asignación ya identifica
// unívocamente Karrier + tienda + fecha + turno, así que no hace falta más).
function getAsistencias() { return readJson(ASISTENCIA_FILE, []); }
function getAsistenciaByAssignment(assignmentId) {
  return getAsistencias().find(a => a.assignmentId === assignmentId) || null;
}
function setAsistencia(assignmentId, asistio) {
  if (!getAsignacionById(assignmentId)) throw err('ASSIGNMENT_NOT_FOUND');
  const list = getAsistencias();
  const idx = list.findIndex(a => a.assignmentId === assignmentId);
  const registro = { assignmentId, asistio, updatedAt: new Date().toISOString() };
  if (idx >= 0) list[idx] = registro; else list.push(registro);
  writeJson(ASISTENCIA_FILE, list);
  return registro;
}

// ─── Observaciones (bitácora) ───────────────────────────────────────────────
// Log de solo agregar: cada nota queda registrada con fecha, nunca se
// sobrescribe la anterior — así se arma la bitácora completa.
function getObservaciones() { return readJson(OBSERVACIONES_FILE, []); }
function observacionesDeAsignacion(assignmentId) {
  return getObservaciones()
    .filter(o => o.assignmentId === assignmentId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
function addObservacion(assignmentId, texto) {
  if (!getAsignacionById(assignmentId)) throw err('ASSIGNMENT_NOT_FOUND');
  if (!texto || !texto.trim()) throw err('EMPTY_OBSERVATION');
  const entry = { id: crypto.randomUUID(), assignmentId, texto: texto.trim(), createdAt: new Date().toISOString() };
  const list = getObservaciones();
  list.push(entry);
  writeJson(OBSERVACIONES_FILE, list);
  return entry;
}

// Lista de asistencia de un día (y opcionalmente una tienda): solo turnos
// ACTIVOS de esa fecha, con su estado de asistencia y su bitácora.
function listAsistenciaDia({ storeId, date }) {
  if (!date) throw err('INVALID_DATE');
  return getAsignaciones()
    .filter(a => a.status === 'ACTIVE')
    .map(a => {
      const slot = getSlotById(a.slotId);
      if (!slot || slot.date !== date) return null;
      if (storeId && slot.storeId !== storeId) return null;
      const tienda = getTiendaById(slot.storeId);
      const asistencia = getAsistenciaByAssignment(a.id);
      return {
        assignmentId: a.id,
        karrierRut: a.karrierRut,
        karrierName: a.karrierName,
        storeId: slot.storeId,
        storeName: tienda?.name || '—',
        date: slot.date,
        shiftType: slot.shiftType,
        startTime: slot.startTime,
        endTime: slot.endTime,
        asistio: asistencia ? asistencia.asistio : null,
        observaciones: observacionesDeAsignacion(a.id),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.storeName + a.shiftType + a.karrierName).localeCompare(b.storeName + b.shiftType + b.karrierName));
}

// Bitácora completa (todas las observaciones, con contexto de Karrier/tienda/
// fecha) para exportar — opcionalmente filtrada por tienda y/o rango de fechas.
function listBitacora({ storeId, dateFrom, dateTo } = {}) {
  return getObservaciones()
    .map(o => {
      const asig = getAsignacionById(o.assignmentId);
      if (!asig) return null;
      const slot = getSlotById(asig.slotId);
      if (!slot) return null;
      if (storeId && slot.storeId !== storeId) return null;
      if (dateFrom && slot.date < dateFrom) return null;
      if (dateTo && slot.date > dateTo) return null;
      const tienda = getTiendaById(slot.storeId);
      const asistencia = getAsistenciaByAssignment(asig.id);
      return {
        ...o,
        karrierName: asig.karrierName,
        karrierRut: asig.karrierRut,
        storeName: tienda?.name || '—',
        date: slot.date,
        shiftType: slot.shiftType,
        asistio: asistencia ? asistencia.asistio : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

module.exports = {
  SHIFT_TYPES,
  getSettings, saveSettings,
  getTiendas, getTiendaById, saveTienda, deleteTienda,
  getKarriers, getKarrierByRut, saveKarrier, deleteKarrier, ensureKarrier,
  getSlots, getSlotById, saveSlot, deleteSlot, createSlot, generarSemana,
  getAsignaciones, getAsignacionById, listAsignaciones,
  tomarTurno, cancelarTurno, reasignarTurno,
  disponibilidadTienda, misTurnos, coberturaTienda, coberturaGeneral, dashboardKpis,
  slotConInfo,
  getAsistenciaByAssignment, setAsistencia,
  observacionesDeAsignacion, addObservacion,
  listAsistenciaDia, listBitacora,
  ERRORES,
};
