const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { getTemplates, saveTemplate, deleteTemplate, getTemplateById } = require('./campaigns');

const router = Router();

router.get('/', (_, res) => res.json(getTemplates().map(({ id, name, createdAt }) => ({ id, name, createdAt }))));

router.post('/', (req, res) => {
  const { name, html } = req.body;
  if (!name || !html) return res.status(400).json({ error: 'Nombre y HTML requeridos' });
  const tpl = { id: uuidv4(), name: name.trim(), html, createdAt: new Date().toISOString() };
  saveTemplate(tpl);
  res.json({ id: tpl.id, name: tpl.name, createdAt: tpl.createdAt });
});

router.get('/:id', (req, res) => {
  const tpl = getTemplateById(req.params.id);
  if (!tpl) return res.status(404).json({ error: 'Plantilla no encontrada' });
  res.json(tpl);
});

router.delete('/:id', (req, res) => {
  deleteTemplate(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
