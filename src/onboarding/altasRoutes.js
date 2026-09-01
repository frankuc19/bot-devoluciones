const { Router } = require('express');
const store = require('./altasStore');
const { sincronizarAltasOB } = require('./altasSync');

const router = Router();

router.get('/', (_req, res) => {
  res.json({ ok: true, altas: store.getAltas() });
});

router.get('/sync-log', (_req, res) => {
  res.json({ ok: true, log: store.getSyncLog() });
});

router.post('/sync', async (_req, res) => {
  const resultado = await sincronizarAltasOB();
  res.json(resultado);
});

router.put('/:id', (req, res) => {
  const alta = store.getAltaById(req.params.id);
  if (!alta) return res.status(404).json({ ok: false, error: 'No encontrado' });
  const { nombre, rut, celular, cliente, salaBodega, tipoAuto, fechaAlta, estado } = req.body || {};
  if (nombre !== undefined)     alta.nombre = nombre;
  if (rut !== undefined)        alta.rut = rut;
  if (celular !== undefined)    alta.celular = celular;
  if (cliente !== undefined)    alta.cliente = cliente;
  if (salaBodega !== undefined) alta.salaBodega = salaBodega;
  if (tipoAuto !== undefined)   alta.tipoAuto = tipoAuto;
  if (fechaAlta !== undefined)  alta.fechaAlta = fechaAlta;
  if (estado !== undefined)     alta.estado = estado;
  alta.updatedAt = new Date().toISOString();
  store.saveAlta(alta);
  res.json({ ok: true, alta });
});

router.delete('/:id', (req, res) => {
  store.deleteAlta(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
