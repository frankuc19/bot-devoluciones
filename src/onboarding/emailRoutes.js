const { Router } = require('express');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const { v4: uuidv4 } = require('uuid');
const XLSX       = require('xlsx');
const { personalize, extractVariables, sendViaWebhook } = require('./emailService');
const { saveCampaign } = require('./campaigns');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename:    (_, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();

// Paso 1: parsear contactos xlsx/csv
router.post('/parse-contacts', upload.single('file'), (req, res) => {
  try {
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    res.json({ tempId: req.file.filename, headers, preview: rows.slice(0, 3), total: rows.length });
  } catch (err) {
    res.status(400).json({ error: 'No se pudo leer el archivo: ' + err.message });
  }
});

// Paso 2: parsear template HTML
router.post('/parse-html', upload.single('file'), (req, res) => {
  try {
    const html = fs.readFileSync(req.file.path, 'utf8');
    const variables = extractVariables(html);
    res.json({ tempId: req.file.filename, variables });
  } catch (err) {
    res.status(400).json({ error: 'No se pudo leer el HTML: ' + err.message });
  }
});

// Enviar campaña
router.post('/send', async (req, res) => {
  const { contactsTempId, htmlTempId, name, subject, fromName, fromEmail, webhookUrl } = req.body;
  const io = req.app.get('io');

  const contactsPath = path.join(UPLOADS_DIR, contactsTempId);
  const htmlPath     = path.join(UPLOADS_DIR, htmlTempId);
  if (!fs.existsSync(contactsPath)) return res.status(400).json({ error: 'Archivo de contactos no encontrado' });
  if (!fs.existsSync(htmlPath))     return res.status(400).json({ error: 'Archivo HTML no encontrado' });

  const wb    = XLSX.readFile(contactsPath);
  const ws    = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const html  = fs.readFileSync(htmlPath, 'utf8');

  const campaignId = uuidv4();
  const campaign = {
    id: campaignId, name, type: 'email', status: 'sending',
    createdAt: new Date().toISOString(),
    config: { subject, fromName, fromEmail, webhookUrl },
    contacts: rows,
    contactEmails: rows.map(r => String(r.correo || r.email || r.Email || '')).filter(Boolean),
    openedEmails: [], clickedEmails: [],
    stats: { total: rows.length, sent: 0, failed: 0, opened: 0, clicked: 0 },
  };
  saveCampaign(campaign);
  res.json({ campaignId, total: rows.length });

  const flotistas = rows.map(row => ({
    to:       String(row.correo || row.email || row.Email || ''),
    subject,
    html:     personalize(html, row),
    fromName,
    from:     fromEmail,
    campaignId,
    // datos originales del contacto por si el workflow los necesita
    ...row,
  }));
  const payload = { flotistas, campaignId };

  try {
    await sendViaWebhook(webhookUrl, payload);
    campaign.stats.sent = rows.length;
    campaign.status = 'completed';
  } catch (err) {
    campaign.status = 'failed';
    io?.emit('campaign:error', { campaignId, error: err.message });
  }
  saveCampaign(campaign);
  io?.emit('campaign:complete', { campaignId, stats: campaign.stats });
});

module.exports = router;
