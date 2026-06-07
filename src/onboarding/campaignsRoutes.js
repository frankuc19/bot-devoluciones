const { Router } = require('express');
const { getCampaigns, getCampaignById, getOverallStats } = require('./campaigns');

const router = Router();

router.get('/',        (_, res) => res.json(getCampaigns()));
router.get('/stats',   (_, res) => res.json(getOverallStats()));

router.get('/:id/non-openers', (req, res) => {
  const c = getCampaignById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Campaña no encontrada' });
  if (c.type !== 'email') return res.status(400).json({ error: 'Solo campañas de email' });
  const nonOpeners = (c.contacts || []).filter(ct => !(c.openedEmails || []).includes(ct.correo || ct.email || ''));
  res.json({ campaignId: c.id, campaignName: c.name, total: (c.contacts || []).length, opened: (c.openedEmails || []).length, nonOpeners });
});

router.get('/:id', (req, res) => {
  const c = getCampaignById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Campaña no encontrada' });
  res.json(c);
});

module.exports = router;
