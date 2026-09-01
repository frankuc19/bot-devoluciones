const { Router } = require('express');
const XLSX = require('xlsx');
const store = require('./turnosStore');

// ─── Router público (sin login del panel) — lo usan los Karriers desde su celular ──
const publicRouter = Router();

publicRouter.get('/karrier/:rut', (req, res) => {
  const k = store.getKarrierByRut(req.params.rut.trim());
  res.json({ ok: true, karrier: k });
});

// Registro rápido / identificación del Karrier (crea el registro si no existe)
publicRouter.post('/karrier', (req, res) => {
  const { rut, name, phone } = req.body || {};
  if (!rut || !name) return res.status(400).json({ ok: false, error: 'RUT y nombre son requeridos' });
  const existente = store.getKarrierByRut(rut.trim());
  if (existente && existente.status !== 'ACTIVE') {
    return res.status(403).json({ ok: false, error: 'Tu cuenta está inactiva. Contacta a operaciones.' });
  }
  const karrier = store.ensureKarrier(rut.trim(), name.trim(), (phone || '').trim());
  res.json({ ok: true, karrier });
});

publicRouter.get('/tiendas', (_req, res) => {
  const tiendas = store.getTiendas().filter(t => t.active);
  const hoy = new Date().toISOString().slice(0, 10);
  const weekStart = mondayOf(hoy);
  const withCounts = tiendas.map(t => {
    const slots = store.disponibilidadTienda(t.id, weekStart);
    const disponibles = slots.reduce((s, x) => s + x.available, 0);
    return { ...t, turnosDisponibles: disponibles };
  });
  res.json({ ok: true, tiendas: withCounts });
});

publicRouter.get('/disponibilidad', (req, res) => {
  const { storeId, weekStart } = req.query;
  if (!storeId || !weekStart) return res.status(400).json({ ok: false, error: 'Faltan parámetros' });
  const tienda = store.getTiendaById(storeId);
  if (!tienda) return res.status(404).json({ ok: false, error: 'Tienda no encontrada' });
  res.json({ ok: true, tienda, slots: store.disponibilidadTienda(storeId, weekStart) });
});

publicRouter.post('/tomar', async (req, res) => {
  const { slotId, rut } = req.body || {};
  if (!slotId || !rut) return res.status(400).json({ ok: false, error: 'Faltan datos' });
  try {
    const asignacion = await store.tomarTurno(slotId, rut.trim());
    res.json({ ok: true, asignacion });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, code: e.code || 'ERROR' });
  }
});

publicRouter.post('/cancelar', async (req, res) => {
  const { assignmentId, rut } = req.body || {};
  if (!assignmentId || !rut) return res.status(400).json({ ok: false, error: 'Faltan datos' });
  try {
    const asignacion = await store.cancelarTurno(assignmentId, rut.trim());
    res.json({ ok: true, asignacion });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, code: e.code || 'ERROR' });
  }
});

publicRouter.get('/mis-turnos', (req, res) => {
  const { rut } = req.query;
  if (!rut) return res.status(400).json({ ok: false, error: 'Falta RUT' });
  res.json({ ok: true, turnos: store.misTurnos(rut.trim()) });
});

// ─── Router administrativo (OPS/Admin, requiere sesión del panel) ─────────────────
const adminRouter = Router();

adminRouter.get('/settings', (_req, res) => res.json({ ok: true, settings: store.getSettings() }));
adminRouter.put('/settings', (req, res) => res.json({ ok: true, settings: store.saveSettings(req.body || {}) }));

adminRouter.get('/tiendas', (_req, res) => res.json({ ok: true, tiendas: store.getTiendas() }));
adminRouter.post('/tiendas', (req, res) => {
  const { name, code, address, commune, region, capacity } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'El nombre es requerido' });
  const tienda = {
    id: require('crypto').randomUUID(),
    name, code: code || '', address: address || '', commune: commune || '', region: region || '',
    active: true,
    capacity: { AM: Number(capacity?.AM) || 0, PM: Number(capacity?.PM) || 0, FULL: Number(capacity?.FULL) || 0 },
    createdAt: new Date().toISOString(),
  };
  store.saveTienda(tienda);
  res.json({ ok: true, tienda });
});
adminRouter.put('/tiendas/:id', (req, res) => {
  const tienda = store.getTiendaById(req.params.id);
  if (!tienda) return res.status(404).json({ ok: false, error: 'Tienda no encontrada' });
  const { name, code, address, commune, region, active, capacity } = req.body || {};
  if (name !== undefined) tienda.name = name;
  if (code !== undefined) tienda.code = code;
  if (address !== undefined) tienda.address = address;
  if (commune !== undefined) tienda.commune = commune;
  if (region !== undefined) tienda.region = region;
  if (active !== undefined) tienda.active = !!active;
  if (capacity) tienda.capacity = { ...tienda.capacity, ...capacity };
  store.saveTienda(tienda);
  res.json({ ok: true, tienda });
});
adminRouter.delete('/tiendas/:id', (req, res) => {
  try {
    store.deleteTienda(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, code: e.code || 'ERROR' });
  }
});

adminRouter.get('/slots', (req, res) => {
  const { storeId, weekStart } = req.query;
  if (!storeId || !weekStart) return res.status(400).json({ ok: false, error: 'Faltan parámetros' });
  res.json({ ok: true, slots: store.disponibilidadTienda(storeId, weekStart) });
});
adminRouter.post('/slots', (req, res) => {
  const { storeId, shiftType, date, capacity } = req.body || {};
  if (!storeId || !shiftType || !date) return res.status(400).json({ ok: false, error: 'Faltan datos' });
  try {
    const slot = store.createSlot({ storeId, shiftType, date, capacity });
    res.json({ ok: true, slot });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});
const TURNO_LABEL_XLSX = { AM: 'Mañana (AM)', PM: 'Tarde (PM)', FULL: 'Jornada completa' };
const DIA_LABEL_XLSX = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

adminRouter.get('/slots/export', (req, res) => {
  const { storeId, weekStart } = req.query;
  if (!storeId || !weekStart) return res.status(400).json({ ok: false, error: 'Faltan parámetros' });
  const tienda = store.getTiendaById(storeId);
  if (!tienda) return res.status(404).json({ ok: false, error: 'Tienda no encontrada' });

  const slots = store.disponibilidadTienda(storeId, weekStart);
  const filas = slots.map(s => {
    const dia = new Date(s.date + 'T00:00:00').getDay();
    return {
      Tienda: tienda.name,
      Fecha: s.date,
      Día: DIA_LABEL_XLSX[dia],
      Turno: TURNO_LABEL_XLSX[s.shiftType] || s.shiftType,
      Horario: `${s.startTime}-${s.endTime}`,
      Cupos: s.capacity,
      Tomados: s.taken,
      Disponibles: s.available,
      'Cobertura %': s.coverage,
      Estado: s.status,
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(filas);
  ws['!cols'] = [
    { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 13 },
    { wch: 8 }, { wch: 9 }, { wch: 11 }, { wch: 12 }, { wch: 9 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Planificación');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const filename = `planificacion_${tienda.code || tienda.name}_${weekStart}.xlsx`.replace(/[^\w.\-]+/g, '_');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

adminRouter.post('/slots/generar-semana', (req, res) => {
  const { storeId, weekStart } = req.body || {};
  if (!storeId || !weekStart) return res.status(400).json({ ok: false, error: 'Faltan datos' });
  try {
    const creados = store.generarSemana(storeId, weekStart);
    res.json({ ok: true, creados: creados.length });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});
adminRouter.put('/slots/:id', (req, res) => {
  const slot = store.getSlotById(req.params.id);
  if (!slot) return res.status(404).json({ ok: false, error: 'Turno no encontrado' });
  const { capacity, status } = req.body || {};
  if (capacity !== undefined) slot.capacity = Number(capacity) || 0;
  if (status !== undefined) slot.status = status;
  store.saveSlot(slot);
  res.json({ ok: true, slot });
});
adminRouter.delete('/slots/:id', (req, res) => {
  store.deleteSlot(req.params.id);
  res.json({ ok: true });
});

adminRouter.get('/karriers', (_req, res) => res.json({ ok: true, karriers: store.getKarriers() }));
adminRouter.post('/karriers', (req, res) => {
  const { rut, name, phone } = req.body || {};
  if (!rut || !name) return res.status(400).json({ ok: false, error: 'RUT y nombre son requeridos' });
  const karrier = { rut: rut.trim(), name: name.trim(), phone: (phone || '').trim(), status: 'ACTIVE', createdAt: new Date().toISOString() };
  store.saveKarrier(karrier);
  res.json({ ok: true, karrier });
});
adminRouter.put('/karriers/:rut', (req, res) => {
  const k = store.getKarrierByRut(req.params.rut);
  if (!k) return res.status(404).json({ ok: false, error: 'Karrier no encontrado' });
  const { name, phone, status } = req.body || {};
  if (name !== undefined) k.name = name;
  if (phone !== undefined) k.phone = phone;
  if (status !== undefined) k.status = status;
  store.saveKarrier(k);
  res.json({ ok: true, karrier: k });
});
adminRouter.delete('/karriers/:rut', (req, res) => {
  store.deleteKarrier(req.params.rut);
  res.json({ ok: true });
});

adminRouter.get('/cobertura', (req, res) => {
  const { weekStart, storeId } = req.query;
  if (!weekStart) return res.status(400).json({ ok: false, error: 'Falta weekStart' });
  res.json({ ok: true, cobertura: store.coberturaGeneral(weekStart, storeId || null) });
});

adminRouter.get('/dashboard', (req, res) => {
  const { weekStart } = req.query;
  if (!weekStart) return res.status(400).json({ ok: false, error: 'Falta weekStart' });
  res.json({ ok: true, kpis: store.dashboardKpis(weekStart) });
});

adminRouter.get('/asignaciones', (req, res) => {
  const { storeId, weekStart, status } = req.query;
  res.json({ ok: true, asignaciones: store.listAsignaciones({ storeId: storeId || null, weekStartDate: weekStart || null, status: status || null }) });
});

adminRouter.post('/asignaciones/:id/cancelar', async (req, res) => {
  try {
    const asignacion = await store.cancelarTurno(req.params.id, null, { isAdmin: true, reason: req.body?.reason });
    res.json({ ok: true, asignacion });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, code: e.code || 'ERROR' });
  }
});

adminRouter.post('/asignaciones/:id/reasignar', async (req, res) => {
  const { newSlotId } = req.body || {};
  if (!newSlotId) return res.status(400).json({ ok: false, error: 'Falta el turno destino' });
  try {
    const asignacion = await store.reasignarTurno(req.params.id, newSlotId);
    res.json({ ok: true, asignacion });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, code: e.code || 'ERROR' });
  }
});

function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=domingo
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

module.exports = { publicRouter, adminRouter };
